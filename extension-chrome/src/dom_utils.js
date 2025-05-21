// DOM Utility functions for Extendo extension

function injectExtendoStylesheet() {
  if (document.getElementById('extendo-style')) return;
  const style = document.createElement('link');
  style.id = 'extendo-style';
  style.rel = 'stylesheet';
  style.type = 'text/css';
  style.href = chrome.runtime.getURL('style.css');
  document.head.appendChild(style);
}

function removeExistingBanner() {
  if (window.currentBanner && window.currentBanner.parentElement) {
    window.currentBanner.remove();
  }
  window.currentBanner = null;
}

function addCloseButton(banner) {
  const header = banner.querySelector('.extendo-header');
  
  if (header) {
    if (!header.querySelector('.extendo-close-button')) {
        const closeButton = document.createElement('button');
        closeButton.className = 'extendo-close-button';
        closeButton.innerHTML = '×';
        closeButton.title = 'Close Extendo';
        
        closeButton.addEventListener('click', (event) => {
          event.stopPropagation();
          window.isExtendoMinimized = false; 
          removeExistingBanner(); // This will use the global removeExistingBanner
        });
        header.appendChild(closeButton);
    }

    if (!header.dataset.extendoHeaderListenerAttached) {
        header.addEventListener('click', (event) => {
            // Ensure the click is not on the close button itself.
            if (event.target.classList.contains('extendo-close-button')) {
                return;
            }
            if (banner.classList.contains('minimized')) {
                banner.classList.remove('minimized');
                window.isExtendoMinimized = false; 
            } else {
                banner.classList.add('minimized');
                window.isExtendoMinimized = true; 
            }
        });
        header.dataset.extendoHeaderListenerAttached = 'true';
    }
  }
}
