const PRISM_BASE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
const PRISM_LANGUAGE_BASE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-';

const scriptPromises = new Map();
const loadedLanguages = new Set();
let prismCorePromise = null;

function loadScript(src) {
  if (scriptPromises.has(src)) {
    return scriptPromises.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.crossOrigin = 'anonymous';

    script.addEventListener('load', () => resolve(script));
    script.addEventListener('error', () => {
      scriptPromises.delete(src);
      reject(new Error(`Failed to load script: ${src}`));
    });

    document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  return promise;
}

async function ensurePrismCore() {
  if (!prismCorePromise) {
    prismCorePromise = loadScript(PRISM_BASE_URL).then(() => window.Prism || null);
  }

  return prismCorePromise;
}

function normaliseLanguage(language) {
  return (language || '').toLowerCase().trim();
}

async function loadLanguages(languages = []) {
  const pending = languages
    .map(normaliseLanguage)
    .filter(Boolean)
    .filter((language) => !loadedLanguages.has(language));

  if (!pending.length) {
    return window.Prism;
  }

  await ensurePrismCore();

  const languagePromises = pending.map((language) => {
    const url = `${PRISM_LANGUAGE_BASE_URL}${language}.min.js`;
    return loadScript(url).then(() => {
      loadedLanguages.add(language);
    }).catch(() => {
      loadedLanguages.delete(language);
    });
  });

  await Promise.all(languagePromises);

  return window.Prism;
}

window.ensurePrism = async function ensurePrism(languages = []) {
  const prism = await ensurePrismCore();
  if (!prism) {
    return null;
  }

  if (!Array.isArray(languages)) {
    return prism;
  }

  await loadLanguages(languages);
  return prism;
};
