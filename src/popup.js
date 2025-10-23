const POPUP_APP_CONTENT_EVENT = 'app:content-updated';
const popupState = {
    resizeListenerBound: false,
    hashListenerBound: false,
};

function bindGlobalPopupListeners() {
    if (!popupState.resizeListenerBound) {
        window.addEventListener('resize', handleResize);
        popupState.resizeListenerBound = true;
    }

    if (!popupState.hashListenerBound) {
        window.addEventListener('hashchange', cleanupPopups);
        popupState.hashListenerBound = true;
    }
}

function handleResize() {
    if (isMobileDevice()) {
        cleanupPopups();
    }
}

function shouldInitializePopups(event) {
    const components = event?.detail?.components;
    return !Array.isArray(components) || components.length === 0 || components.includes('popups');
}

document.addEventListener(POPUP_APP_CONTENT_EVENT, (event) => {
    if (!shouldInitializePopups(event)) {
        return;
    }

    bindGlobalPopupListeners();
    initPopups();
});

window.addEventListener('DOMContentLoaded', () => {
    bindGlobalPopupListeners();
    initPopups();
});

function isMobileDevice() {
    return window.innerWidth <= 768;
}

function cleanupPopups() {
    // Remove all popup containers
    const containers = document.querySelectorAll('.popup-container');
    containers.forEach(container => {
        container.style.display = 'none';
    });
}

function initPopups() {
    // Skip popup initialization on mobile devices
    if (isMobileDevice()) return;
    
    // Clean up any existing popups first
    cleanupPopups();
    
    const popupLinks = document.querySelectorAll('.link.popup');
    
    popupLinks.forEach(link => {
        if (link.dataset.popupBound === '1') {
            return;
        }
        link.dataset.popupBound = '1';
        
        const popupIds = link.getAttribute('data-popup-ids')?.split(',') || [];
        if (!popupIds.length) return;
        
        const popupScale = parseFloat(link.getAttribute('data-popup-scale')) || 1;
        const rotationStart = parseFloat(link.getAttribute('data-popup-rotation-start')) || 0;
        const rotationEnd = parseFloat(link.getAttribute('data-popup-rotation-end')) || -12;
        
        const popupContainer = document.createElement('div');
        popupContainer.className = 'popup-container';
        document.body.appendChild(popupContainer);
        
        link.addEventListener('mouseenter', (e) => {
            if (isMobileDevice()) return;
            
            // Clean up any other open popups first
            document.querySelectorAll('.popup-container').forEach(c => {
                if (c !== popupContainer) {
                    c.style.display = 'none';
                }
            });
            
            popupContainer.innerHTML = '';
            popupContainer.style.display = 'block';
            
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            
            popupContainer.style.left = `${mouseX + 15}px`;
            popupContainer.style.top = `${mouseY + 15}px`;
            
            popupIds.forEach((id, index) => {
                const popup = document.createElement('div');
                popup.className = 'popup-item';
                popup.style.zIndex = 1000 - index;
                popup.style.animationDelay = `${index * 0.10}s`;
                
                const img = document.createElement('img');
                const baseId = id.trim();
                img.src = `public/${baseId}.webp`;
                img.alt = baseId;
                img.loading = 'lazy';
                img.decoding = 'async';
                img.onerror = () => {
                    if (img.dataset.fallback === '1') {
                        return;
                    }
                    img.dataset.fallback = '1';
                    img.src = `public/${baseId}.png`;
                };
                
                popup.appendChild(img);
                popupContainer.appendChild(popup);
                
                popup.addEventListener('animationend', () => {
                    const indexRotation = rotationStart + (index * (rotationEnd - rotationStart) / Math.max(1, popupIds.length - 1));
                    popup.style.transform = `translateY(${index * -90}px) rotate(${indexRotation}deg) scale(${popupScale})`;
                });
            });
        });
        
        link.addEventListener('mouseleave', () => {
            popupContainer.style.display = 'none';
        });
        
        link.addEventListener('mousemove', (e) => {
            if (isMobileDevice()) return;
            
            const x = e.clientX;
            const y = e.clientY;
            
            popupContainer.style.left = `${x + 15}px`;
            popupContainer.style.top = `${y + 15}px`;
        });
    });
}
