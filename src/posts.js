class PostRouter {
    constructor() {
        // Add base path handling
        this.basePath = window.location.pathname.replace(/\/[^/]*$/, '');
        if (this.basePath === '/') this.basePath = '';

        this.posts = new Map();
        this.mainContent = document.querySelector('.container');
        this.originalContent = this.mainContent.innerHTML;
        
        // Handle URL changes
        window.addEventListener('hashchange', () => this.handleRoute());
        
        // Only handle route on initial load if there's a hash
        if (window.location.hash) {
            // Wait a moment for everything else to initialize
            setTimeout(() => this.handleRoute(), 200);
        } else {
            // If no hash, load the posts directly
            setTimeout(() => {
                const postsSection = document.getElementById('posts-container');
                if (postsSection) {
                    this.loadAllPosts().then(posts => {
                        console.log("Initial posts load:", posts.map(p => p.id));
                        const postsHTML = this.renderPostsListHTML(posts);
                        postsSection.innerHTML = postsHTML;
                        document.dispatchEvent(new Event('DOMContentLoaded'));
                    });
                }
            }, 300);
        }
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
            // Update fetch path to use relative path - remove basePath
            const url = `posts/${id}.txt`;
            console.log(`Fetching post from URL: ${url}`); // Log the URL before fetching
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Post not found: ${url} (Status: ${response.status})`);
            
            const text = await response.text();
            console.log("Raw fetched content:", text);
            const post = parsePost(text);
            
            console.log(`Loaded post ${id} with hidden status:`, post.metadata.hidden);
            
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
            // Update fetch path to use relative path - remove basePath
            const response = await fetch(`posts/index.json`);
            if (!response.ok) throw new Error(`Posts index not found: posts/index.json (Status: ${response.status})`);
            
            const postIndex = await response.json();
            console.log("Post index:", postIndex);
            
            const posts = [];
            for (const id of postIndex) {
                const post = await this.loadPost(id);
                console.log(`Post ${id}:`, post, "Hidden:", post ? post.metadata.hidden : 'not loaded');
                
                // Only skip posts that explicitly have hidden: true
                // Include posts where hidden is false or undefined
                if (post && (post.metadata.hidden !== true || includeHidden)) {
                    posts.push(post);
                    console.log(`Added post ${id} to visible list`);
                } else if (post) {
                    console.log(`Post ${id} is hidden and not included`);
                }
            }
            
            console.log("Final posts list:", posts.map(p => p.id));
            
            // Sort by date, newest first
            posts.sort((a, b) => new Date(b.metadata.date) - new Date(a.metadata.date));
            return posts;
        } catch (error) {
            console.error('Error loading posts index:', error);
            // Fallback to example post if index is not found
            const post = await this.loadPost('portable-extensible-machine');
            if (post && (post.metadata.hidden !== true || includeHidden)) {
                return [post];
            }
            return [];
        }
    }

    async handleRoute() {
        window.scrollTo(0, 0); // Scroll to top on route change

        const hash = window.location.hash.slice(1); // Remove the # symbol
        
        // Close any open popups
        const popupContainers = document.querySelectorAll('.popup-container');
        popupContainers.forEach(container => {
            container.style.display = 'none';
        });
        
        if (!hash) {
            // Show main page
            this.mainContent.innerHTML = this.originalContent;
            
            // Check if we should skip animation (coming back from a post)
            const skipAnimation = document.body.classList.contains('no-animation');
            
            // Make all text visible immediately when returning to CV
            document.querySelectorAll('.diffuse-text').forEach(el => {
                // Remove data-animated attribute so diffusion can work again
                el.removeAttribute('data-animated');
                
                // If coming back from a post, make text visible right away
                if (skipAnimation) {
                    el.style.visibility = 'visible';
                    
                    // Add a class to skip animation
                    el.classList.add('skip-diffuse');
                }
                
                // Make existing text visible immediately
                const spans = el.querySelectorAll('span');
                if (spans.length > 0) {
                    spans.forEach(span => {
                        span.style.opacity = '1';
                    });
                }
            });
            
            // Reset the flag
            document.body.classList.remove('no-animation');
            
            // Reinitialize diffusion effects
            document.dispatchEvent(new Event('DOMContentLoaded'));
            
            // Add posts list to the main page after diffusion effects have been applied
            setTimeout(() => {
                const postsSection = document.getElementById('posts-container');
                if (postsSection) {
                    this.loadAllPosts().then(posts => {
                        const postsHTML = this.renderPostsListHTML(posts);
                        postsSection.innerHTML = postsHTML;
                        document.dispatchEvent(new Event('DOMContentLoaded'));
                    });
                }
            }, 100);
            return;
        }

        console.log("Loading post:", hash);
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
                        <img 
                            src="public/${imgName}.png" 
                            alt="${imgName.replace(/_/g, ' ')}" 
                            class="post-image" 
                            style="z-index: ${post.metadata.images.length - index};"
                        >`
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
        
        // Reset data-animated attributes for diffusion to work
        document.querySelectorAll('.diffuse-text').forEach(el => {
            el.removeAttribute('data-animated');
        });
        
        // Trigger diffusion effect
        setTimeout(() => {
            document.dispatchEvent(new Event('DOMContentLoaded'));
        }, 10);
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
        
        // Reset data-animated attributes for diffusion to work
        document.querySelectorAll('.diffuse-text').forEach(el => {
            el.removeAttribute('data-animated');
        });
        
        // Trigger diffusion effect
        setTimeout(() => {
            document.dispatchEvent(new Event('DOMContentLoaded'));
        }, 10);
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
    
    async renderPostsList() {
        const posts = await this.loadAllPosts();
        return this.renderPostsListHTML(posts);
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