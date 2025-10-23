const DEBUG = false;
const debugLog = (...args) => {
    if (DEBUG) {
        console.log(...args);
    }
};

const POSTS_APP_CONTENT_EVENT = 'app:content-updated';

class PostRouter {
    constructor() {
        this.posts = new Map();
        this.postIndex = null;
        this.postIndexPromise = null;
        this.lastIndexFetch = 0;
        this.visiblePostsCache = null;
        this.postsListHTMLCache = '';
        this.prismLanguagesLoaded = new Set();
        this.mainContent = document.querySelector('.container');
        this.originalContent = this.mainContent.innerHTML;
        
        // Handle URL changes
        window.addEventListener('hashchange', () => this.handleRoute());

        if (window.location.hash) {
            this.handleRoute();
        } else {
            this.renderPostsSection().then(rendered => {
                if (rendered) {
                    this.dispatchContentUpdated({
                        components: this.getComponentsForSection(),
                        options: { skipAnimation: false, source: 'initial-load' }
                    });
                }
            });
        }
    }

    dispatchContentUpdated(detail = {}) {
        const payload = {
            timestamp: Date.now(),
            root: this.mainContent,
            ...detail
        };

        if (!payload.root) {
            payload.root = this.mainContent || document;
        }

        document.dispatchEvent(new CustomEvent(POSTS_APP_CONTENT_EVENT, {
            detail: payload
        }));
    }

    getComponentsForSection(root = document) {
        const components = ['diffusion'];
        if (root.querySelector('.link.popup')) {
            components.push('popups');
        }
        if (root.querySelector('pre code')) {
            components.push('prism');
        }
        return components;
    }

    async fetchPostIndex() {
        if (this.postIndex) {
            return this.postIndex;
        }

        if (!this.postIndexPromise) {
            this.postIndexPromise = fetch(`posts/index.json`)
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`Posts index not found: posts/index.json (Status: ${response.status})`);
                    }
                    const data = await response.json();
                    this.postIndex = Array.isArray(data) ? data : [];
                    this.lastIndexFetch = Date.now();
                    debugLog('Fetched post index:', this.postIndex);
                    return this.postIndex;
                })
                .catch(error => {
                    this.postIndexPromise = null;
                    throw error;
                });
        }

        return this.postIndexPromise;
    }

    async renderPostsSection(includeHidden = false) {
        const postsSection = document.getElementById('posts-container');
        if (!postsSection) {
            return false;
        }

        const { html } = await this.ensurePostsList(includeHidden);
        postsSection.innerHTML = html;
        return true;
    }

    async ensurePostsList(includeHidden = false) {
        if (!includeHidden && this.postsListHTMLCache) {
            return {
                posts: this.visiblePostsCache || [],
                html: this.postsListHTMLCache
            };
        }

        const posts = await this.loadAllPosts(includeHidden);
        const html = this.renderPostsListHTML(posts);

        if (!includeHidden) {
            this.visiblePostsCache = posts;
            this.postsListHTMLCache = html;
        }

        return { posts, html };
    }

    closePopups() {
        const popupContainers = document.querySelectorAll('.popup-container');
        popupContainers.forEach(container => {
            container.style.display = 'none';
        });
    }

    generateId(title, date) {
        // Create URL-friendly slug from title
        return title.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
    }

    async loadPost(id) {
        if (this.posts.has(id)) {
            return this.posts.get(id);
        }

        try {
            // Fetch the post from the posts folder
            const url = `posts/${id}.txt`;
            debugLog(`Fetching post from URL: ${url}`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Post not found: ${url} (Status: ${response.status})`);
            
            const text = await response.text();
            debugLog("Raw fetched content:", text);
            const post = parsePost(text);
            
            debugLog(`Loaded post ${id} with hidden status:`, post.metadata.hidden);
            
            // Store the id with the post
            post.id = id;
            this.posts.set(id, post);
            return post;
        } catch (error) {
            console.error('Error loading post:', error);
            return null;
        }
    }

    async loadAllPosts(includeHidden = false) {
        try {
            const ids = await this.fetchPostIndex();

            const posts = await Promise.all(ids.map(id => this.loadPost(id)));
            const filteredPosts = posts
                .filter(Boolean)
                .filter(post => includeHidden ? true : post.metadata.hidden !== true);

            debugLog('Loaded posts:', filteredPosts.map(p => p.id));

            filteredPosts.sort((a, b) => new Date(b.metadata.date) - new Date(a.metadata.date));

            if (!includeHidden) {
                this.visiblePostsCache = filteredPosts;
            }

            return filteredPosts;
        } catch (error) {
            console.error('Error loading posts index:', error);
            const fallback = await this.loadPost('portable-extensible-machine');
            if (fallback && (fallback.metadata.hidden !== true || includeHidden)) {
                if (!includeHidden) {
                    this.visiblePostsCache = [fallback];
                }
                return [fallback];
            }
            return [];
        }
    }

    async handleRoute() {
        window.scrollTo(0, 0); // Scroll to top on route change

        const hash = window.location.hash.slice(1); // Remove the # symbol
        
        this.closePopups();
        
        if (!hash) {
            // Show main page
            this.mainContent.innerHTML = this.originalContent;
            
            // Check if we should skip animation (coming back from a post)
            const skipAnimation = document.body.classList.contains('no-animation');
            
            const postsSection = document.getElementById('posts-container');
            if (postsSection) {
                await this.renderPostsSection();
            }

            document.body.classList.remove('no-animation');

            this.dispatchContentUpdated({
                components: this.getComponentsForSection(this.mainContent),
                options: { skipAnimation, source: 'hash-reset' }
            });

            return;
        }

        debugLog("Loading post:", hash);
        const post = await this.loadPost(hash);
        if (post) {
            this.renderSinglePost(post);
        } else {
            this.render404();
        }
    }

    renderSinglePost(post) {
        // Format the text first
        const formattedText = formatText(post.content);
        
        // Now process paragraphs separately, preserving code blocks and HTML tags
        const formattedContent = formattedText
            .split('\n\n')
            .map(para => {
                // If paragraph contains code blocks (either block or inline), don't apply diffuse-text
                if (para.includes('<pre>') || para.includes('<code class="inline-code')) {
                    // If it starts with <pre>, return as is (it's a complete code block)
                    if (para.trim().startsWith('<pre>')) {
                        return para;
                    }
                    
                    // Otherwise, it's a paragraph with inline code blocks - wrap in p without diffuse-text
                    return `<p>${para}</p>`;
                }
                
                // If paragraph is a heading, return as is
                if (para.includes('<h1') || para.includes('<h2') || para.includes('<h3')) {
                    return para;
                }
                
                // Regular paragraphs get diffuse-text, but preserve any HTML tags
                const hasHtmlTags = /<[^>]+>/.test(para);
                if (hasHtmlTags) {
                    // Split the paragraph into segments based on HTML tags
                    const segments = para.split(/(<[^>]+>)/);
                    const processedSegments = segments.map(segment => {
                        if (segment.startsWith('<') && segment.endsWith('>')) {
                            // This is an HTML tag, return it as is
                            return segment;
                        } else if (segment.trim()) {
                            // This is text content, wrap it in diffuse-text spans
                            return `<span class="diffuse-text">${segment}</span>`;
                        }
                        return segment;
                    });
                    return `<p>${processedSegments.join('')}</p>`;
                }
                
                // No HTML tags, just wrap the whole paragraph
                return `<p class="diffuse-text">${para}</p>`;
            })
            .join('');

        // Format any footnotes if present
        const footnotes = post.metadata.footnotes 
            ? post.metadata.footnotes
                .split('\n')
                .map(note => `<p class="diffuse-text">${note.trim()}</p>`)
                .join('')
            : '';

        // Determine if the title should be a link
        const titleHTML = post.metadata.link
            ? `<h1 class="post-title">
                 <a href="${post.metadata.link}" target="_blank" rel="noopener noreferrer" class="post-title-link diffuse-text">${post.metadata.title}</a> 
               </h1>`
            : `<h1 class="post-title diffuse-text">${post.metadata.title}</h1>`;

        // Generate images HTML if images exist
        let imagesHTML = '';
        if (post.metadata.images && post.metadata.images.length > 0) {
            imagesHTML = `
                <div class="post-image-container">
                    ${post.metadata.images.map((imgName, index) => `
                        <picture class="post-image-frame" style="z-index: ${post.metadata.images.length - index};">
                            <source srcset="public/${imgName}.avif" type="image/avif">
                            <source srcset="public/${imgName}.webp" type="image/webp">
                            <img
                                src="public/${imgName}.png"
                                alt="${imgName.replace(/_/g, ' ')}"
                                class="post-image"
                                loading="lazy"
                                decoding="async"
                            >
                        </picture>`
                    ).join('')}
                </div>
            `;
        }

        const postHTML = `
            <div class="post-page">
                ${imagesHTML}
                <header class="post-header">
                    <a href="#" class="back-button diffuse-text" onclick="document.body.classList.add('no-animation'); document.querySelectorAll('.popup-container').forEach(c => c.style.display = 'none'); window.location.hash = ''; return false;"></a>
                    <div class="post-title-container">
                        ${titleHTML}
                    </div>
                    <time class="post-date diffuse-text">${formatDate(post.metadata.date)}</time>
                </header>
                <article class="post-content">
                    ${formattedContent}
                </article>
                ${footnotes ? `
                    <footer class="post-footnotes">
                        ${footnotes}
                    </footer>
                ` : ''}
            </div>
        `;
        
        this.mainContent.innerHTML = postHTML;

        const components = this.getComponentsForSection(this.mainContent);

        this.dispatchContentUpdated({
            components,
            options: {
                skipAnimation: false,
                source: 'post-view',
                postId: post.id
            }
        });

        if (components.includes('prism')) {
            this.queuePrismHighlight(this.mainContent);
        }
    }

    render404() {
        const notFoundHTML = `
            <div class="post-page">
                <header class="post-header">
                    <a href="#" class="back-button diffuse-text" onclick="document.body.classList.add('no-animation'); document.querySelectorAll('.popup-container').forEach(c => c.style.display = 'none'); window.location.hash = ''; return false;"></a>
                    <div class="post-title-container">
                        <h1 class="post-title diffuse-text">Post Not Found</h1>
                    </div>
                    <time class="post-date diffuse-text"></time>
                </header>
                <div class="post-content">
                    <p class="diffuse-text">Sorry, the requested post could not be found.</p>
                </div>
            </div>
        `;
        
        this.mainContent.innerHTML = notFoundHTML;
        
        this.dispatchContentUpdated({
            components: this.getComponentsForSection(this.mainContent),
            options: { skipAnimation: false, source: 'not-found' }
        });
    }
    
    renderPostsListHTML(posts) {
        let postsHTML = `
            <div class="posts-list-container">
        `;
        
        posts.forEach(post => {
            // Add a link-card class if the post has a link
            const cardClass = post.metadata.link ? 'post-card post-card-with-link' : 'post-card';
            // Add link icon class if the post has a link
            const titleClass = post.metadata.link ? 'post-card-title post-card-title-link diffuse-text' : 'post-card-title diffuse-text';
            
            postsHTML += `
                <div class="${cardClass}">
                    <a href="#${post.id}" class="post-card-link" onclick="document.querySelectorAll('.popup-container').forEach(c => c.style.display = 'none'); window.location.hash = '${post.id}'; return false;">
                        <h4 class="${titleClass}">${post.metadata.title}</h4>
                        <time class="post-card-date diffuse-text">${formatDate(post.metadata.date)}</time>
                    </a>
                </div>
            `;
        });
        
        postsHTML += `
            </div>
        `;
        
        return postsHTML;
    }
    
    async renderPostsList(includeHidden = false) {
        const { html } = await this.ensurePostsList(includeHidden);
        return html;
    }

    queuePrismHighlight(root) {
        const schedule = () => this.highlightCodeBlocks(root);

        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(schedule, { timeout: 500 });
        } else {
            setTimeout(schedule, 0);
        }
    }

    async highlightCodeBlocks(root) {
        if (!root) return;

        const codeBlocks = Array.from(root.querySelectorAll('pre code[class*="language-"]'));
        if (!codeBlocks.length) return;

        const languages = codeBlocks
            .map(block => {
                const match = block.className.match(/language-([^\s]+)/);
                return match ? match[1] : null;
            })
            .filter(Boolean);

        await this.ensurePrism(languages);

        if (window.Prism && typeof window.Prism.highlightAllUnder === 'function') {
            window.Prism.highlightAllUnder(root);
        }
    }

    async ensurePrism(languages = []) {
        const normalised = languages
            .map(language => (language || '').toLowerCase())
            .filter(Boolean);

        const required = normalised.filter(lang => !this.prismLanguagesLoaded.has(lang));

        if (!required.length && window.Prism) {
            return window.Prism;
        }

        const loader = window.ensurePrism || window.__ensurePrism;
        const prism = typeof loader === 'function'
            ? await loader(required)
            : window.Prism;

        if (!prism) {
            return null;
        }

        const loadedLanguages = (required.length ? required : normalised)
            .filter(lang => prism.languages && prism.languages[lang]);

        loadedLanguages.forEach(lang => this.prismLanguagesLoaded.add(lang));

        return prism;
    }
}

function parsePost(text) {
    if (!text.startsWith('---')) {
        throw new Error('Invalid post format: must start with YAML front matter');
    }

    const secondSeparatorIndex = text.indexOf('---', 3);
    if (secondSeparatorIndex === -1) {
        throw new Error('Invalid post format: missing closing YAML separator');
    }

    const frontMatter = text.substring(3, secondSeparatorIndex).trim();
    const metadata = {};
    let currentKey = null;
    let currentValue = '';
    let isMultiLine = false;
    let isList = false;
    let listItems = [];

    frontMatter.split('\n').forEach(line => {
        const trimmedLine = line.trim();
        const indentMatch = line.match(/^(\s*)/);
        const indentLevel = indentMatch ? indentMatch[1].length : 0;

        if (indentLevel === 0) {
            // Save previous multi-line or list value
            if (currentKey && (isMultiLine || isList)) {
                 if (isList) {
                    if (currentValue) listItems.push(currentValue.trim()); // Add last item
                    metadata[currentKey] = listItems;
                } else {
                    metadata[currentKey] = currentValue.trim();
                }
                isMultiLine = false;
                isList = false;
                listItems = [];
                currentValue = '';
            }

            const colonIndex = trimmedLine.indexOf(':');
            if (colonIndex !== -1) {
                currentKey = trimmedLine.substring(0, colonIndex).trim();
                let valuePart = trimmedLine.substring(colonIndex + 1).trim();

                if (valuePart === '|') {
                    isMultiLine = true;
                    currentValue = '';
                } else if (valuePart.startsWith('[')) { // Simple inline list check
                    try {
                        metadata[currentKey] = JSON.parse(valuePart);
                    } catch (e) {
                         // Handle potential errors or more complex lists starting on next line
                        isList = true;
                        listItems = [];
                        currentValue = ''; // Reset value for list items
                    }
                 } else if (valuePart === '') { // Potential start of indented list
                     isList = true; // Assume list if value is empty on the first line
                     listItems = [];
                     currentValue = '';
                } else {
                    // Handle simple key-value pairs, booleans etc.
                    if (valuePart.toLowerCase() === 'true') {
                        metadata[currentKey] = true;
                    } else if (valuePart.toLowerCase() === 'false') {
                        metadata[currentKey] = false;
                    } else {
                        metadata[currentKey] = valuePart;
                    }
                    isMultiLine = false;
                    isList = false;
                }
            }
        } else if (currentKey) {
            if (isMultiLine) {
                currentValue += line.trimLeft() + '\n';
            } else if (isList) {
                 if (trimmedLine.startsWith('- ')) {
                     if (currentValue) listItems.push(currentValue.trim()); // Add previous item if any
                     currentValue = trimmedLine.substring(2).trim();
                 } else {
                     // Append to current list item if indented further
                     currentValue += '\n' + trimmedLine;
                 }
            }
        }
    });

    // Save the last value
    if (currentKey) {
         if (isList) {
            if (currentValue) listItems.push(currentValue.trim()); // Add last item
            metadata[currentKey] = listItems;
        } else if (isMultiLine) {
            metadata[currentKey] = currentValue.trim();
        }
         // Simple values are already assigned
    }

    const content = text.substring(secondSeparatorIndex + 3).trim();

    // If ID isn't specified, generate one from the title
    if (!metadata.id && metadata.title) {
        metadata.id = metadata.title.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
    }

    // Extract metadata values and handle special cases
    for (const key in metadata) {
        // Handle boolean values
        if (metadata[key] === 'true' || metadata[key] === 'TRUE' || metadata[key] === true) {
            metadata[key] = true;
        } else if (metadata[key] === 'false' || metadata[key] === 'FALSE' || metadata[key] === false) {
            metadata[key] = false;
        }
        
        // Handle empty values
        if (metadata[key] === '') {
            // For hidden property, empty means false
            if (key === 'hidden') {
                metadata[key] = false;
            }
        }
    }

    // Default hidden to false if not specified
    if (metadata.hidden === undefined) {
        metadata.hidden = false;
    }

    // Ensure images is an array if it exists
    if (metadata.images && !Array.isArray(metadata.images)) {
        // Attempt to parse if it's a string representation of an array
        if (typeof metadata.images === 'string' && metadata.images.startsWith('[') && metadata.images.endsWith(']')) {
            try {
                metadata.images = JSON.parse(metadata.images);
            } catch (e) {
                console.error("Failed to parse images string as array:", metadata.images);
                metadata.images = []; // Default to empty array on error
            }
        } else {
             // If it's just a single string, make it an array of one
             if (typeof metadata.images === 'string') {
                 metadata.images = [metadata.images];
             } else {
                  metadata.images = []; // Default to empty array if not parsable/string
             }
        }
    } else if (!metadata.images) {
         metadata.images = []; // Ensure images is always at least an empty array
    }

    return {
        metadata,
        content,
        id: metadata.id
    };
}

function formatDate(dateStr) {
    const date = new Date(dateStr);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatText(text) {
    // Handle headers first
    text = text.replace(/^# (.*$)/gm, '<h1 class="post-h1">$1</h1>');
    text = text.replace(/^## (.*$)/gm, '<h2 class="post-h2">$1</h2>');
    text = text.replace(/^### (.*$)/gm, '<h3 class="post-h3">$1</h3>');
    
    // Handle code blocks
    text = text.replace(/```(\w+)?\s*([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || 'plaintext';
        const escapedCode = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        return `<pre><code class="language-${language}">${escapedCode.trim()}</code></pre>`;
    });
    
    // Handle inline code blocks
    text = text.replace(/(?<!\\)`([^`]+)`/g, (match, code) => {
        const escapedCode = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        return `<code class="inline-code">${escapedCode}</code>`;
    });
    
    // Handle ordered lists (numbers or single chars followed by dot and space)
    text = text.replace(/(?:^|\n)((?:\d+|[a-zA-Z])\. .*(?:\n(?!\d+\. |[a-zA-Z]\. ).*)*)/gm, (match, listContent) => {
        const items = listContent.split(/\n(?=\d+\. |[a-zA-Z]\. )/).map(item => {
            const trimmed = item.trim();
            return trimmed.replace(/^(\d+|[a-zA-Z])\. /, '');
        });
        return `<ol>${items.map(item => `<li>${item}</li>`).join('')}</ol>`;
    });
    
    // Handle unordered lists
    text = text.replace(/(?:^|\n)(- .*(?:\n(?!- ).*)*)/gm, (match, listContent) => {
        const items = listContent.split('\n- ').map(item => {
            const trimmed = item.trim();
            return trimmed.startsWith('- ') ? trimmed.substring(2) : trimmed;
        });
        return `<ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>`;
    });
    
    // Format bold text (**text**)
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Format italic text (*text*)
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    return text;
}
