const APP_CONTENT_EVENT = 'app:content-updated';
const observedElements = new WeakSet();
const canObserve = typeof window !== 'undefined' && 'IntersectionObserver' in window;

const observer = canObserve
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      const element = entry.target;
      element.classList.add('diffuse-active');
      element.classList.remove('diffuse-instant');

      const lastChar = element._diffuseLastChar;
      if (!lastChar) {
        finalizeAnimation(element);
        return;
      }

      const handleAnimationEnd = (event) => {
        if (event.target !== lastChar) {
          return;
        }
        element.removeEventListener('animationend', handleAnimationEnd);
        finalizeAnimation(element);
      };

      element.addEventListener('animationend', handleAnimationEnd);
    });
  }, {
    threshold: 0.2,
    rootMargin: '0px 0px -5% 0px',
  })
  : null;

function finalizeAnimation(element) {
  element.setAttribute('data-animated', 'true');
  element.classList.add('diffuse-complete');
  if (observer && observedElements.has(element)) {
    observer.unobserve(element);
    observedElements.delete(element);
  } else if (!observer) {
    observedElements.delete(element);
  }
  element._diffuseLastChar = null;
}

function prepareDiffuseElements(root = document, options = {}) {
  const { skipAnimation = false } = options;
  const elements = root.querySelectorAll('.diffuse-text');

  elements.forEach((element) => {
    if (skipAnimation || element.classList.contains('skip-diffuse')) {
      element.classList.remove('skip-diffuse');
      showElementInstantly(element);
      return;
    }

    if (element.dataset.animated === 'true') {
      return;
    }

    if (element.dataset.diffusePrepared === 'true') {
      observeElement(element);
      return;
    }

    prepareElement(element);
  });
}

function observeElement(element) {
  if (!observer) {
    element.classList.add('diffuse-instant', 'diffuse-complete');
    element.setAttribute('data-animated', 'true');
    element._diffuseLastChar = null;
    return;
  }

  if (observedElements.has(element)) {
    return;
  }

  observer.observe(element);
  observedElements.add(element);
}

function prepareElement(element) {
  const fullText = element.textContent;
  if (!fullText || !fullText.trim()) {
    element.style.visibility = 'visible';
    element.setAttribute('data-diffuse-prepared', 'true');
    return;
  }

  const delayAttr = parseInt(element.getAttribute('data-diffuse-delay') || '', 10);
  const delay = Number.isFinite(delayAttr) ? delayAttr : 14;

  const computedStyle = window.getComputedStyle(element);
  const fontFamily = computedStyle.getPropertyValue('font-family') || 'inherit';
  const useExposure = element.tagName === 'H2' && fullText.includes('Marius-Alexandru');

  const childNodes = Array.from(element.childNodes);
  const fragment = document.createDocumentFragment();

  element.textContent = '';
  element.style.visibility = 'visible';
  element.style.setProperty('--diffuse-font', useExposure ? "'exposure', serif" : fontFamily);
  element.classList.remove('diffuse-instant', 'diffuse-active', 'diffuse-complete');

  let lastChar = null;
  let charIndex = 0;

  childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent || '';
      const wordBuffer = [];

      const flushWordBuffer = () => {
        if (wordBuffer.length === 0) {
          return;
        }
        const wordWrapper = document.createElement('span');
        wordWrapper.className = 'diffuse-word';
        wordBuffer.forEach((charSpan) => {
          wordWrapper.appendChild(charSpan);
        });
        fragment.appendChild(wordWrapper);
        wordBuffer.length = 0;
      };

      Array.from(value).forEach((rawChar) => {
        const char = rawChar === '\n' || rawChar === '\r' ? ' ' : rawChar;
        const span = document.createElement('span');
        span.className = 'diffuse-char';
        span.style.animationDelay = `${charIndex * delay}ms`;
        charIndex += 1;

        if (char === ' ') {
          span.classList.add('diffuse-space');
          span.textContent = ' ';
          flushWordBuffer();
          fragment.appendChild(span);
        } else {
          span.textContent = char;
          wordBuffer.push(span);
        }

        lastChar = span;
      });

      flushWordBuffer();
    } else {
      fragment.appendChild(node);
    }
  });

  element.appendChild(fragment);
  element._diffuseLastChar = lastChar;
  element.setAttribute('data-diffuse-prepared', 'true');

  observeElement(element);
}

function showElementInstantly(element) {
  if (element.dataset.diffusePrepared !== 'true') {
    prepareElement(element);
  }

  element.classList.add('diffuse-instant');
  element.classList.remove('diffuse-active');
  finalizeAnimation(element);
}

function shouldAnimate(event) {
  const components = event?.detail?.components;
  return !Array.isArray(components) || components.length === 0 || components.includes('diffusion');
}

function resolveRoot(event) {
  return event?.detail?.root || document;
}

function resolveOptions(event) {
  return event?.detail?.options || {};
}

window.addEventListener('DOMContentLoaded', () => {
  prepareDiffuseElements(document);
});

document.addEventListener(APP_CONTENT_EVENT, (event) => {
  if (!shouldAnimate(event)) {
    return;
  }

  const root = resolveRoot(event);
  const options = resolveOptions(event);
  prepareDiffuseElements(root, options);
});
