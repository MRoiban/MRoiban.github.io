document.addEventListener('DOMContentLoaded', () => {
  animateText();
});

document.addEventListener('htmx:afterSettle', () => {
  animateText();
});

function animateText() {
  const elements = document.querySelectorAll('.diffuse-text:not([data-animated="true"])');
  
  elements.forEach(element => {
    // Skip if already animated
    if (element.getAttribute('data-animated') === 'true') return;
    
    // If element has skip-diffuse class, just make it visible and mark as animated
    if (element.classList.contains('skip-diffuse')) {
      element.style.visibility = 'visible';
      element.setAttribute('data-animated', 'true');
      element.classList.remove('skip-diffuse');
      return;
    }
    
    // If the element already has span children, make them visible and skip
    const existingSpans = element.querySelectorAll('span');
    if (existingSpans.length > 0) {
      existingSpans.forEach(span => {
        span.style.opacity = '1';
      });
      element.setAttribute('data-animated', 'true');
      return;
    }
    
    const text = element.textContent;
    element.textContent = '';
    element.style.visibility = 'visible';
    
    const computedStyle = window.getComputedStyle(element);
    const fontFamily = computedStyle.getPropertyValue('font-family');
    
    const characters = text.split('');
    const delay = element.getAttribute('data-diffuse-delay') || 10;
    
    characters.forEach((char, index) => {
      const span = document.createElement('span');
      span.textContent = char;
      span.style.opacity = '0';
      span.style.transition = 'opacity 0.3s ease';
      
      if (element.tagName === 'H2' && text.includes('Marius-Alexandru')) {
        span.style.fontFamily = "'exposure', serif";
      } else {
        span.style.fontFamily = fontFamily;
      }
      
      element.appendChild(span);
      
      setTimeout(() => {
        span.style.opacity = '1';
      }, index * delay);
    });
    
    element.setAttribute('data-animated', 'true');
  });
} 