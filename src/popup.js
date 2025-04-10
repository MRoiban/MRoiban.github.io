document.addEventListener('DOMContentLoaded', () => {
    initPopups();
    
    // Handle window resize
    window.addEventListener('resize', () => {
        // If mobile, remove any active popups
        if (isMobileDevice()) {
            const containers = document.querySelectorAll('.popup-container');
            containers.forEach(container => {
                container.style.display = 'none';
            });
        }
    });

    // Clean up popups when hash changes (page navigation)
    window.addEventListener('hashchange', () => {
        cleanupPopups();
    });
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
                img.src = `public/${id.trim()}.png`;
                img.alt = id.trim();
                img.loading = 'lazy';
                
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