// Ping backend health endpoint and log result
fetch('http://localhost:5000/api/health')
  .then(r => r.json())
  .then(data => {
    console.log('[Extendo] Backend health:', data);
  })
  .catch(err => {
    console.error('[Extendo] Backend health check failed:', err);
  });

// Listen for the command to reload the extension
chrome.commands.onCommand.addListener((command) => {
  if (command === "reload_extension") {
    console.log("[Extendo] Reloading extension via command.");
    chrome.runtime.reload();
  }
});

// Listen for the toolbar icon click to reload the extension
chrome.action.onClicked.addListener((tab) => {
  console.log("[Extendo] Reloading extension via toolbar icon click.");
  chrome.runtime.reload();
});

console.log("[Extendo] Background script loaded and listeners attached.");
