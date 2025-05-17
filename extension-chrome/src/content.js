// Entry point for the Chrome extension content script
console.log('Extension content script loaded.');

// Call backend health endpoint and show result in a banner
fetch('http://localhost:5000/api/health')
  .then(r => r.json())
  .then(data => {
    const banner = document.createElement('div');
    banner.textContent = `Backend /api/health: ${JSON.stringify(data)}`;
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.width = '100%';
    banner.style.background = '#222';
    banner.style.color = '#fff';
    banner.style.zIndex = '9999';
    banner.style.textAlign = 'center';
    banner.style.fontSize = '20px';
    banner.style.padding = '10px 0';
    banner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3000);
  })
  .catch(err => {
    const banner = document.createElement('div');
    banner.textContent = `Backend /api/health error: ${err}`;
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.width = '100%';
    banner.style.background = '#a00';
    banner.style.color = '#fff';
    banner.style.zIndex = '9999';
    banner.style.textAlign = 'center';
    banner.style.fontSize = '20px';
    banner.style.padding = '10px 0';
    banner.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 3000);
  });
