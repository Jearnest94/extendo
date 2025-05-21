// Entry point for the Chrome extension content script

// These variables are used across modules and are defined globally here.
let currentBanner = null;
let isExtendoMinimized = false; // Global state for minimized status, shared with dom_utils.js

// Inject scripts - order might matter if they depend on each other, though these are mostly utility collections.
// utils.js should be first if other modules depend on its functions directly.
// dom_utils.js, data_utils.js, page_interaction.js, api_handler.js can be loaded afterwards.
// For simplicity, we'll assume functions are self-contained or use globals defined above.

// Note: content.js can't directly import other JS files using ES6 import/export.
// They are loaded via manifest.json or injected if necessary.
// For this refactoring, we assume these files are listed in manifest.json's content_scripts.
// And that functions within them are available in the global scope of the content script.
// If not, further changes to manifest.json or script injection logic would be needed.

console.log("Extension content script loaded (content.js).");

let lastUrl = location.href;
let isRunningLogic = false; // Simple lock to prevent concurrent runs
let observerEnabled = true;

// Main logic function
async function runExtendoLogic() {
    if (isRunningLogic) {
        console.log("Extendo: Logic is already running, skipping.");
        return;
    }
    isRunningLogic = true;
    observerEnabled = false;
    console.log("Extendo: Running logic for URL:", location.href, "(Observer temporarily disabled)");

    removeExistingBanner(); // From dom_utils.js

    const matchId = getMatchIdFromUrl(); // From page_interaction.js

    if (!matchId) {
        console.log("Extendo: Not a match room. Defaulting to minimized state.");
        isExtendoMinimized = true;

        const minimizedBanner = document.createElement("div");
        minimizedBanner.className = "extendo-faceit-banner";
        minimizedBanner.innerHTML = `
          <div class="extendo-header">
            <h2>Extendo Stats</h2>
          </div>
          <div class="extendo-content" style="padding: 10px; text-align: center;">
            <p>Not in a match room. Click header to expand for player search (feature not yet implemented) or navigate to a match room.</p>
          </div>
        `;
        document.body.appendChild(minimizedBanner);
        currentBanner = minimizedBanner;
        addCloseButton(minimizedBanner); // From dom_utils.js
        minimizedBanner.classList.add('minimized');

        isRunningLogic = false;
        observerEnabled = true;
        console.log("Extendo: Minimized banner shown. Logic finished. (Observer re-enabled)");
        return;
    }

    isExtendoMinimized = false;

    const loadingBanner = document.createElement("div");
    loadingBanner.className = "extendo-faceit-banner";
    loadingBanner.innerHTML = `
      <div class="extendo-header">
        <h2>Loading Player Stats...</h2>
      </div>
      <div class="extendo-loading">
        <div class="extendo-spinner"></div>
        <p>Detecting page type...</p>
      </div>
    `;
    document.body.appendChild(loadingBanner);
    currentBanner = loadingBanner;
    addCloseButton(loadingBanner); // From dom_utils.js

    if (isExtendoMinimized && loadingBanner.parentElement) { // Should not be true here given the logic above
        loadingBanner.classList.add('minimized');
    }

    try {
        let playersToQuery = [];
        let queryTypeMessage = "";
        let endpoint = "";
        let options = {};

        // This path is now only taken if matchId is present
        console.log(`Extendo: Match room detected (ID: ${matchId}). Fetching stats via match ID.`);
        queryTypeMessage = `players in match room ${matchId}`;
        loadingBanner.querySelector("p").textContent = `Fetching statistics for ${queryTypeMessage}...`;
        endpoint = `http://localhost:5000/api/match-insight/${matchId}`;
        options = {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        };

        // The block for non-matchId scenarios (player search, logged-in user) is removed
        // as per the requirement to only run full logic in match rooms.
        // If that functionality is desired for non-matchroom pages (when expanded),
        // it would need to be added back, perhaps triggered by a user action on the minimized banner.

        if (endpoint) {
            const response = await fetch(endpoint, options);
            await handleApiResponse(response); // From api_handler.js
        } else {
            // This case should ideally not be reached if matchId is always present here.
            console.log("Extendo: No API endpoint determined (should not happen in match room logic).");
             if (loadingBanner && loadingBanner.parentElement && loadingBanner.querySelector("p")?.textContent.includes("Detecting page type...")) {
                loadingBanner.innerHTML = `
                  <div class="extendo-header">
                    <h2>Extendo Stats</h2>
                  </div>
                  <div class="extendo-loading">
                    <p>Error: Could not determine API endpoint even in match room.</p>
                  </div>
                `;
            }
        }

    } catch (error) {
        await handleApiError(error); // From api_handler.js
    } finally {
        isRunningLogic = false;
        observerEnabled = true;
        console.log("Extendo: Logic finished. (Observer re-enabled)");
    }
}

// Simple debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initial setup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        injectExtendoStylesheet(); // From dom_utils.js
        console.log("Extendo: DOMContentLoaded, content script main logic initializing...");
        runExtendoLogic();
    });
} else {
    injectExtendoStylesheet(); // From dom_utils.js
    console.log("Extendo: Content script main logic initializing (DOM already ready)...");
    runExtendoLogic();
}

const debouncedRunExtendoLogic = debounce(runExtendoLogic, 500);

const observer = new MutationObserver((mutationsList, obs) => {
  if (!observerEnabled) {
    return;
  }

  if (location.href !== lastUrl) {
    console.log("Extendo: URL changed. Re-running logic (debounced).");
    lastUrl = location.href;
    debouncedRunExtendoLogic();
  } else {
    let significantChange = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
            if (!document.querySelector('.extendo-faceit-banner')) {
                significantChange = true;
                break;
            }
        }
    }
    if (significantChange) {
        console.log("Extendo: Significant DOM change (banner removed). Re-running logic (debounced).");
        debouncedRunExtendoLogic();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('popstate', () => {
    console.log("Extendo: 'popstate' event. Re-running logic (debounced).");
    lastUrl = location.href;
    debouncedRunExtendoLogic();
});

// Globals that were previously defined in content.js and are now expected by the modularized files:
// - window.currentBanner (used by dom_utils.js, api_handler.js)
// - window.isExtendoMinimized (used by dom_utils.js, api_handler.js)

// Functions from utils.js (like getCurrentUserId, getNicknameFromUserId, isJson, isLoggedIn)
// are assumed to be globally available if page_interaction.js or api_handler.js need them.
// This typically means utils.js must be listed before other scripts in manifest.json.

// Functions moved to new files:
// MOVED to dom_utils.js: injectExtendoStylesheet, removeExistingBanner, addCloseButton
// MOVED to data_utils.js: formatNumber, calculateWinRate, extractMapStats
// MOVED to page_interaction.js: getMatchIdFromUrl, getPlayerNicknamesFromPage, getLoggedInUserNickname
// MOVED to api_handler.js: handleApiResponse, handleApiError (and its internal generatePlayerCardHtml)
