// Entry point for the Chrome extension content script

// Inject global stylesheet for extension UI polish

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
  const old = document.querySelector('.extendo-faceit-banner');
  if (old) old.remove();
}

// Format numbers to have commas
function formatNumber(num) {
  return num ? num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "N/A";
}

// Calculate win rate percentage
function calculateWinRate(wins, totalMatches) {
  if (!wins || !totalMatches || totalMatches === 0) return "N/A";
  return ((wins / totalMatches) * 100).toFixed(1) + '%';
}

// Extract segments (map stats) from player data
function extractMapStats(playerData) {
  console.info(playerData)
  if (!playerData || !playerData.stats || !playerData.stats.segments) {
    return [];
  }

  return playerData.stats.segments.filter(segment => 
    segment.mode === "5v5" && 
    segment.label && 
    segment.label.includes("Map")
  );
}

injectExtendoStylesheet();

console.log("Extension content script loaded.");

// Function to extract match ID from URL
function getMatchIdFromUrl() {
  // Check for match room URLs with game in path
  const matchRoomPattern = /\/en\/(cs2|csgo|games\/\d+)\/room\/([a-f0-9-]+)/i;
  let match = window.location.pathname.match(matchRoomPattern);
  
  if (match && match[2]) {
    console.log(`Extendo: Match ID found in standard URL: ${match[2]}`);
    return match[2];
  }
  
  // Alternative pattern - some match URLs might have a different format
  const alternatePattern = /\/en\/room\/([a-f0-9-]+)/i;
  match = window.location.pathname.match(alternatePattern);
  
  if (match && match[1]) {
    console.log(`Extendo: Match ID found in alternate URL format: ${match[1]}`);
    return match[1];
  }
  
  // Try to find match ID in query parameters (for embedded matches etc.)
  const urlParams = new URLSearchParams(window.location.search);
  const matchId = urlParams.get('matchId') || urlParams.get('match_id') || urlParams.get('matchroom');
  
  if (matchId && /^[a-f0-9-]+$/i.test(matchId)) {
    console.log(`Extendo: Match ID found in URL parameters: ${matchId}`);
    return matchId;
  }
  
  console.log("Extendo: No Match ID found in URL");
  return null;
}

// Function to extract player nicknames from the current page
function getPlayerNicknamesFromPage() {
  let nicknames = [];
  const genericLinkTexts = [
    'overview', 'stats', 'matches', 'friends', 'highlights', 'posts', 
    'settings', 'support', 'feedback', 'logout', 'login', 'register', 
    'home', 'tournaments', 'organizers', 'hubs', 'shop', 'premium', 
    'subscription', 'players', 'summary', 'graphs', 'demos', 'edit',
    'videos', 'inventory', 'followers', 'following', 'teams', 'feed',
    'media', 'blog', 'partners', 'ladders', 'join', 'follow', 'members'
  ];

  // Strategy: Find player links across the page
  console.log("Extendo: Finding player links on page using a[href*='/en/players/']");
  const playerElements = document.querySelectorAll('a[href*="/en/players/"]');
  
  if (playerElements.length > 0) {
    console.log(`Extendo: Found ${playerElements.length} potential player links`);
    
    playerElements.forEach(el => {
      // Skip links that are clearly not player profile links
      if (el.href.includes('/players/search') || 
          el.href.includes('/players/division') ||
          el.href.includes('/teams/') ||
          el.href.match(/\/players\/\d+$/) ||
          el.href.match(/\/players\/\?/)) {
        console.log(`Extendo: Skipping non-player link: ${el.href}`);
        return;
      }

      // Step 1: Try to extract nickname from URL (most reliable method)
      let nickname = null;
      try {
        const url = new URL(el.href, window.location.origin);
        const pathParts = url.pathname.split('/');
        const playersIndex = pathParts.indexOf('players');
        
        // Format is typically /en/players/{nickname}/stats
        if (playersIndex !== -1 && pathParts.length > playersIndex + 1) {
          const candidateNickname = pathParts[playersIndex + 1];
          if (candidateNickname && 
              candidateNickname.length >= 3 && 
              candidateNickname.length <= 25 &&  // Faceit actually allows longer nicknames than we thought
              !genericLinkTexts.includes(candidateNickname.toLowerCase()) &&
              !/^[0-9-]+$/.test(candidateNickname)) {  // Not just numbers or UUIDs
            nickname = candidateNickname;
            console.log(`Extendo: Extracted nickname from URL: ${nickname} (${el.href})`);
          }
        }
      } catch (e) {
        console.warn(`Extendo: Error parsing URL: ${el.href}`, e);
      }

      // Step 2: If URL parsing failed, try to get nickname from text content as fallback
      if (!nickname) {
        // Try to find a specific nickname element first
        const nicknameElement = el.querySelector('span[class*="nickname"], div[class*="nickname"], strong[class*="nickname"]');
        
        if (nicknameElement && nicknameElement.textContent) {
          const candidateNickname = nicknameElement.textContent.trim();
          if (candidateNickname && 
              candidateNickname.length >= 3 && 
              candidateNickname.length <= 25 &&
              !genericLinkTexts.includes(candidateNickname.toLowerCase())) {
            nickname = candidateNickname;
            console.log(`Extendo: Extracted nickname from specific element: ${nickname}`);
          }
        } 
        // If no specific element or invalid nickname, try link text itself
        else if (el.textContent && 
                 el.textContent.trim().length >= 3 && 
                 el.textContent.trim().length <= 25 &&
                 !genericLinkTexts.includes(el.textContent.trim().toLowerCase())) {
          nickname = el.textContent.trim();
          console.log(`Extendo: Extracted nickname from link text: ${nickname}`);
        }
      }

      // Add unique nickname to our list if we found one
      if (nickname && !nicknames.includes(nickname)) {
        nicknames.push(nickname);
      }
    });
    
    console.log(`Extendo: Found ${nicknames.length} unique player nicknames`);
  } else {
    console.log("Extendo: No player links found on this page");
  }

  return nicknames;
}

// Get the logged-in user's nickname using storage-based methods first, then DOM fallbacks
async function getLoggedInUserNickname() {
  // METHOD 1: Use localStorage and cookies to get user ID, then convert to nickname
  const userId = getCurrentUserId();
  if (userId) {
    console.log("Extendo: Found user ID in browser storage:", userId);
    try {
      // Use our helper function to get nickname from user ID
      const nickname = await getNicknameFromUserId(userId);
      if (nickname) {
        console.log("Extendo: Successfully converted user ID to nickname:", nickname);
        return nickname;
      }
    } catch (e) {
      console.warn("Extendo: Error converting user ID to nickname:", e);
    }
  }

  // METHOD 2: DOM-based fallbacks if storage method failed
  console.log("Extendo: Falling back to DOM-based methods for finding user nickname");
  
  // Try 1: User panel heading in navigation dropdown
  let nicknameEl = document.querySelector('div[data-dialog-type="TRAY"] div[class*="HeadingWrapper"] a[href*="/en/players/"] h6');
  
  if (nicknameEl && nicknameEl.textContent) {
    const nickname = nicknameEl.textContent.trim();
    console.log(`Extendo: Found logged-in user from nav dropdown: ${nickname}`);
    return nickname;
  }
  
  // Try 2: User avatar link in header
  const avatarLink = document.querySelector('a[href*="/en/players/"][class*="AvatarWrapper"], div[class*="AvatarWrapper"] a[href*="/en/players/"]');
  if (avatarLink) {
    try {
      const url = new URL(avatarLink.href, window.location.origin);
      const pathParts = url.pathname.split('/');
      const playersIndex = pathParts.indexOf('players');
      
      if (playersIndex !== -1 && pathParts.length > playersIndex + 1) {
        const nickname = pathParts[playersIndex + 1];
        if (nickname && nickname.length >= 3) {
          console.log(`Extendo: Found logged-in user from avatar link: ${nickname}`);
          return nickname;
        }
      }
    } catch (e) {
      console.warn("Extendo: Error extracting nickname from avatar link", e);
    }
  }
  
  // Try 3: Account menu navigation link if visible
  const accountMenuLinks = document.querySelectorAll('a[href*="/en/players/"]');
  for (const link of accountMenuLinks) {
    if (link.classList.contains('active') || 
        link.getAttribute('aria-current') === 'page' ||
        link.closest('[role="navigation"]')) {
      try {
        const url = new URL(link.href, window.location.origin);
        const pathParts = url.pathname.split('/');
        const playersIndex = pathParts.indexOf('players');
        
        if (playersIndex !== -1 && pathParts.length > playersIndex + 1) {
          const nickname = pathParts[playersIndex + 1];
          if (nickname && nickname.length >= 3) {
            console.log(`Extendo: Found logged-in user from nav link: ${nickname}`);
            return nickname;
          }
        }
      } catch (e) {
        console.warn("Extendo: Error extracting nickname from menu link", e);
      }
    }
  }

  console.log("Extendo: Could not find logged-in user nickname with any method");
  return null;
}

let lastUrl = location.href;
let isRunningLogic = false; // Simple lock to prevent concurrent runs
let observerEnabled = true;

// MODIFIED: runExtendoLogic to be async and use try/catch/finally
async function runExtendoLogic() {
    if (isRunningLogic) {
        console.log("Extendo: Logic is already running, skipping.");
        return;
    }
    isRunningLogic = true;
    observerEnabled = false; // Disable observer during execution
    console.log("Extendo: Running logic for URL:", location.href, "(Observer temporarily disabled)");

    removeExistingBanner(); // Remove any previous banner first

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
    addCloseButton(loadingBanner);

    try {
        const matchId = getMatchIdFromUrl();
        let playersToQuery = [];
        let queryTypeMessage = "";
        let endpoint = "";
        let options = {};

        if (matchId) {
            console.log(`Extendo: Match room detected (ID: ${matchId}). Fetching stats via match ID.`);
            queryTypeMessage = `players in match room ${matchId}`;
            loadingBanner.querySelector("p").textContent = `Fetching statistics for ${queryTypeMessage}...`;
            endpoint = `http://localhost:5000/api/match-room-stats/${matchId}`;
            options = {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            };
        } else {
            console.log("Extendo: Not a match room. Attempting to find players on page or use logged-in user.");
            playersToQuery = getPlayerNicknamesFromPage();
            
            if (!playersToQuery || playersToQuery.length === 0) {
                loadingBanner.querySelector("p").textContent = "Looking for logged-in user...";
                const loggedInUser = await getLoggedInUserNickname(); // Use await

                if (loggedInUser) {
                    playersToQuery = [loggedInUser];
                    queryTypeMessage = `logged-in user (${loggedInUser})`;
                    console.log("Extendo: No players found on page, attempting to fetch stats for logged-in user:", loggedInUser);
                } else {
                    console.log("Extendo: No logged-in user found either.");
                    loadingBanner.innerHTML = `
                      <div class="extendo-header">
                        <h2>Extendo Stats</h2>
                      </div>
                      <div class="extendo-loading">
                        <p>No players found to query.</p>
                        <p>Navigate to a Faceit match room, a page with player links, or ensure you are logged in.</p>
                      </div>
                    `;
                    // addCloseButton is already on loadingBanner
                    return; // Exit early
                }
            } else {
                queryTypeMessage = "players on this page";
            }

            if (playersToQuery && playersToQuery.length > 0) {
                loadingBanner.querySelector("p").textContent = `Fetching statistics for ${queryTypeMessage}...`;
                endpoint = "http://localhost:5000/api/player-stats";
                options = {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ players: playersToQuery })
                };
            } else {
                // This case implies no matchId, no players from page, and no loggedInUser (or error fetching it)
                // The "No players found to query" message should already be set if loggedInUser was null.
                // If playersToQuery was initially populated but then became empty, this is a fallback.
                console.log("Extendo: No players to query (final check).");
                if (!loadingBanner.innerHTML.includes("No players found to query.")) {
                    loadingBanner.innerHTML = `
                      <div class="extendo-header">
                        <h2>Extendo Stats</h2>
                      </div>
                      <div class="extendo-loading">
                        <p>No players found on this page or an issue occurred.</p>
                      </div>
                    `;
                   // addCloseButton is already on loadingBanner
                }
                return; 
            }
        }

        if (endpoint) {
            const response = await fetch(endpoint, options); // Use await
            await handleApiResponse(response); // Use await
        } else {
            // This case should be rare if logic above is correct (e.g. matchId was null, and playersToQuery was empty)
            console.log("Extendo: No API endpoint determined, and did not return early.");
             if (loadingBanner && loadingBanner.parentElement && loadingBanner.querySelector("p")?.textContent.includes("Detecting page type...")) {
                loadingBanner.innerHTML = `
                  <div class="extendo-header">
                    <h2>Extendo Stats</h2>
                  </div>
                  <div class="extendo-loading">
                    <p>Unable to determine action. No players or match ID found.</p>
                  </div>
                `;
                // addCloseButton is already on loadingBanner
            }
        }

    } catch (error) {
        // This will catch errors from getLoggedInUserNickname, fetch, response.json(), or handleApiResponse
        await handleApiError(error); 
    } finally {
        isRunningLogic = false;
        observerEnabled = true; // Re-enable observer
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
        injectExtendoStylesheet();
        console.log("Extendo: DOMContentLoaded, content script loaded. Initializing...");
        runExtendoLogic(); // runExtendoLogic is now async, but this call doesn't need to change
    });
} else {
    injectExtendoStylesheet();
    console.log("Extendo: Content script loaded (DOM already ready). Initializing...");
    runExtendoLogic(); // runExtendoLogic is now async, but this call doesn't need to change
}

const debouncedRunExtendoLogic = debounce(runExtendoLogic, 500);

const observer = new MutationObserver((mutationsList, obs) => {
  if (!observerEnabled) { 
    // console.log("Extendo: Observer logic skipped (disabled).");
    return;
  }

  // Basic check: if URL changed, re-run.
  if (location.href !== lastUrl) {
    console.log("Extendo: URL changed from", lastUrl, "to", location.href, ". Re-running logic (debounced).");
    lastUrl = location.href;
    debouncedRunExtendoLogic();
  } else {
    // More complex check: if our banner isn't there and there were significant additions/removals.
    // This is a heuristic for SPAs where URL might not change but content does.
    let significantChange = false;
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList' && (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)) {
            // If our banner is gone, it's a good sign we should re-evaluate.
            if (!document.querySelector('.extendo-faceit-banner')) {
                significantChange = true;
                break;
            }
            // Alternative: Check if a known matchroom specific element appeared
            // e.g. for (const node of mutation.addedNodes) { if (node.matches && node.matches('.match-room-specific-element')) { significantChange = true; break; }}
        }
    }
    if (significantChange) {
        console.log("Extendo: Significant DOM change detected (e.g., banner removed). Re-running logic (debounced).");
        debouncedRunExtendoLogic();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener('popstate', () => {
    console.log("Extendo: 'popstate' event detected. Re-running logic (debounced).");
    lastUrl = location.href; // Ensure lastUrl is updated
    debouncedRunExtendoLogic();
});

// Ensure all helper functions like injectExtendoStylesheet, removeExistingBanner, 
// formatNumber, calculateWinRate, extractMapStats are defined above this script or included.
// For example:
// function injectExtendoStylesheet() { /* ... */ }
// function removeExistingBanner() { /* ... */ }
// etc.

// Function to add a close button to the extendo banner
function addCloseButton(banner) {
  const header = banner.querySelector('.extendo-header');
  
  if (header) {
    // Ensure no duplicate buttons
    if (header.querySelector('.extendo-close-button')) return;

    // Create close button
    const closeButton = document.createElement('button');
    closeButton.className = 'extendo-close-button';
    closeButton.innerHTML = '×';
    closeButton.title = 'Close';
    
    // Add click event
    closeButton.addEventListener('click', () => {
      removeExistingBanner();
    });
    
    // Add to header
    header.appendChild(closeButton);
    
    // Create minimize/maximize toggle
    const toggleButton = document.createElement('button');
    toggleButton.className = 'extendo-toggle-button';
    toggleButton.innerHTML = 'Minimize';
    toggleButton.title = 'Minimize/Maximize';
    
    // Add click event
    toggleButton.addEventListener('click', () => {
      if (banner.classList.contains('minimized')) {
        banner.classList.remove('minimized');
        toggleButton.innerHTML = 'Minimize';
      } else {
        banner.classList.add('minimized');
        toggleButton.innerHTML = 'Maximize';
      }
    });
    
    // Add to banner
    banner.appendChild(toggleButton);
  }
}

// Helper functions for API response handling
async function handleApiResponse(response) {
  if (!response.ok) {
    let errorData;
    try {
        errorData = await response.json();
    } catch (e) {
        // Ignore if response is not JSON, rely on statusText
    }
    const errorMessage = errorData?.error || errorData?.message || response.statusText || 'Unknown error';
    throw new Error(`HTTP ${response.status} - ${errorMessage}`);
  }
  
  const data = await response.json();

  const loadingBanner = document.querySelector('.extendo-faceit-banner');
  if (loadingBanner && loadingBanner.parentNode) loadingBanner.remove();
  
  const newBanner = document.createElement("div");
  newBanner.className = "extendo-faceit-banner";
  
  let bannerHeaderHtml = '';
  let bannerContentHtml = '';
  
  let myTeamPlayers = null; 
  let enemyTeamPlayers = null; 
  let playersToProcess = Array.isArray(data) ? [...data] : [];

  const loggedInUserId = await getCurrentUserId();
  console.log("Extendo: Logged-in user ID for team sorting:", loggedInUserId);

  const robustSort = (a, b) => {
    // Errors last
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    if (a.error && b.error) {
        return (a.nickname || '').localeCompare(b.nickname || '');
    }
    // Non-errors:
    const nickA = a.nickname || '';
    const nickB = b.nickname || '';
    return nickA.localeCompare(nickB);
  };

  if (Array.isArray(data) && data.length === 10) { 
      console.log("Extendo: Attempting to assign teams for 10 players.");
      const faction1Players = data.slice(0, 5);
      const faction2Players = data.slice(5, 10);
      
      // Initialize to null, only set if user is positively identified
      myTeamPlayers = null;
      enemyTeamPlayers = null;

      if (loggedInUserId) {
          const userInFaction1 = faction1Players.some(p => p.player_id && p.player_id === loggedInUserId);
          const userInFaction2 = faction2Players.some(p => p.player_id && p.player_id === loggedInUserId);

          if (userInFaction1) {
              myTeamPlayers = [...faction1Players]; 
              enemyTeamPlayers = [...faction2Players];
              console.log("Extendo: User ID found in Faction 1. My Team: Faction 1. Enemy: Faction 2.");
          } else if (userInFaction2) {
              myTeamPlayers = [...faction2Players]; 
              enemyTeamPlayers = [...faction1Players];
              console.log("Extendo: User ID found in Faction 2. My Team: Faction 2. Enemy: Faction 1.");
          } else {
              console.log("Extendo: Logged-in user ID not found in either faction. Generic display for 10 players.");
              // playersToProcess (all 10) will be used by generic logic
          }
      } else {
          console.log("Extendo: No loggedInUserId. Generic display for 10 players.");
          // playersToProcess (all 10) will be used by generic logic
      }
      // If myTeamPlayers/enemyTeamPlayers are still null, it falls to generic display using playersToProcess
  } else if (!Array.isArray(data)) { 
      // Data is not an array (e.g. a single error object for the whole request)
      console.log("Extendo: Data from API is not an array. Displaying error or no data message.");
      playersToProcess = []; // Ensure playersToProcess is empty to trigger "no data" message
      myTeamPlayers = null;
      enemyTeamPlayers = null;
      // If 'data' itself is an error object, it won't be processed as a player card.
      // The 'No player data found to display' message will be shown.
      // If the backend sent a 200 OK with { "error": "message" }, this is handled.
  }
  // If data is an array but not length 10, playersToProcess is already [...data] and teams are null.

  if ((myTeamPlayers && enemyTeamPlayers) || (Array.isArray(playersToProcess) && playersToProcess.length > 0)) { 
    console.log("Extendo: Processing player data. Teams identified:", !!(myTeamPlayers && enemyTeamPlayers), "Players to process:", playersToProcess.length);
    
    function generatePlayerCardHtml(player) {
      if (!player) return '';
      let cardHtml = '';
      if (player.error) { 
        cardHtml = `
          <div class="extendo-player-card extendo-faceit-banner-error">
            <div class="extendo-player-header">
              <h3>${player.nickname || 'Unknown Player'} - Error</h3>
            </div>
            <div class="extendo-error">
              <p>${player.error}</p>
              ${player.details ? `<p>${player.details}</p>` : ''}
            </div>
          </div>`;
      } else if (player.nickname) { 
        const games = player.games || {};
        const cs2 = games.cs2 || {};
        const faceitElo = cs2.faceit_elo || player.faceit_elo || "N/A";
        const skillLevel = cs2.skill_level || player.skill_level || "?";
        const avatar = player.avatar || ""; 

        cardHtml = `
        <div class="extendo-player-card">
          <div class="extendo-player-header">
            <img src='${avatar}' class="extendo-avatar" alt="${player.nickname}'s avatar">
            <div class="extendo-player-info">
              <h3>${player.nickname}</h3>
              <div class="extendo-player-details">
                ${player.country ? `<span class="extendo-country">${player.country}</span>` : ''}
                <span class="extendo-level">Level ${skillLevel}</span>
                <span class="extendo-elo">Elo: ${formatNumber(faceitElo)}</span>
              </div>
            </div>
          </div>`;

        if (player.stats && player.stats.lifetime) {
          const lifetimeStats = player.stats.lifetime;
          cardHtml += `
          <div class="extendo-stats-section">
            <h4>Lifetime Stats</h4>
            <div class="extendo-stats-grid">
              <div class="extendo-stat-box">
                <span class="stat-value">${formatNumber(lifetimeStats.Matches || lifetimeStats.matches || 0)}</span>
                <span class="stat-label">Matches</span>
              </div>
              <div class="extendo-stat-box">
                <span class="stat-value">${calculateWinRate(lifetimeStats.Wins || lifetimeStats.wins, lifetimeStats.Matches || lifetimeStats.matches)}</span>
                <span class="stat-label">Win Rate</span>
              </div>
              <div class="extendo-stat-box">
                <span class="stat-value">${lifetimeStats['K/D Ratio'] || lifetimeStats['K/D'] || lifetimeStats.kd || 'N/A'}</span>
                <span class="stat-label">K/D Ratio</span>
              </div>
              <div class="extendo-stat-box">
                <span class="stat-value">${player.adr || 'N/A'}</span>
                <span class="stat-label">ADR</span>
              </div>
            </div>
          </div>`;
        }

        const mapStats = extractMapStats(player);
        if (mapStats && mapStats.length > 0) {
          cardHtml += `
          <div class="extendo-stats-section">
            <h4>Map Performance</h4>
            <div class="extendo-maps-table">
              <table>
                <thead><tr><th>Map</th><th>Matches</th><th>Win %</th><th>K/D</th></tr></thead>
                <tbody>`;
          mapStats.forEach(map => {
            const mapName = map.label.replace('Map ', '');
            const mapData = map.stats || {};
            cardHtml += `<tr>
                  <td>${mapName}</td>
                  <td>${formatNumber(mapData.Matches || mapData.matches || 0)}</td>
                  <td>${calculateWinRate(mapData.Wins || mapData.wins, mapData.Matches || mapData.matches)}</td>
                  <td>${mapData['Average K/D Ratio'] || mapData.kd || 'N/A'}</td>
                </tr>`;
          });
          cardHtml += `</tbody></table></div></div>`;
        }
        
        if (player.stats && player.stats.recent_results && player.stats.recent_results.length) {
          const recentResults = player.stats.recent_results;
          const wins = recentResults.filter(r => r === '1').length;
          const losses = recentResults.length - wins;
          cardHtml += `
          <div class="extendo-stats-section">
            <h4>Recent Performance (Last ${recentResults.length})</h4>
            <div class="extendo-recent-results">
              <div class="extendo-stat-box">
                <span class="stat-value">${wins}W - ${losses}L</span>
                <span class="stat-label">Streak</span>
              </div>
              <div class="extendo-result-streak">`;
          recentResults.slice(0, 10).forEach(result => {
            cardHtml += `<span class="result-dot result-${result === '1' ? 'win' : 'loss'}"></span>`;
          });
          cardHtml += `</div></div></div>`;
        }

        cardHtml += `
        <div class="extendo-footer">
          <a href='https://www.faceit.com/en/players/${player.nickname}' target='_blank' class="extendo-profile-link">View Full Profile</a>
        </div>
      </div>`; 
      }
      return cardHtml;
    } // End of generatePlayerCardHtml

    bannerHeaderHtml = `<div class="extendo-header"><h2>Faceit Player Stats</h2></div>`;

    if (myTeamPlayers && enemyTeamPlayers) { 
        console.log("Extendo: Rendering two-row team display.");
        enemyTeamPlayers.sort(robustSort);
        myTeamPlayers.sort(robustSort);

        let enemyTeamHtml = '';
        enemyTeamPlayers.forEach(p => { enemyTeamHtml += generatePlayerCardHtml(p); });

        let myTeamHtml = '';
        myTeamPlayers.forEach(p => { myTeamHtml += generatePlayerCardHtml(p); });

        if (enemyTeamHtml.trim() !== '' || myTeamHtml.trim() !== '') { 
          bannerContentHtml = `
            <div class="extendo-teams-container">
              ${enemyTeamHtml.trim() !== '' ? `<div class="extendo-team-row">${enemyTeamHtml}</div>` : ''}
              ${myTeamHtml.trim() !== '' ? `<div class="extendo-team-row">${myTeamHtml}</div>` : ''}
            </div>
          `;
        } else {
          console.warn("Extendo: Both team HTMLs empty after processing. Fallback to generic display.");
          myTeamPlayers = null; // Force fallback to generic display logic
          enemyTeamPlayers = null;
          // playersToProcess (which is all 10 players if this path was reached from 10 player data) will be handled by the next block.
        }
    } 
    
    // This block handles generic display OR fallback from empty team display
    if (!(myTeamPlayers && enemyTeamPlayers)) { 
        console.log("Extendo: Rendering generic grid/scroll display.");
        
        if (Array.isArray(playersToProcess) && playersToProcess.length > 0) {
            playersToProcess.sort(robustSort);
        }

        let genericPlayerCardsHtml = '';
        playersToProcess.forEach(p => { genericPlayerCardsHtml += generatePlayerCardHtml(p); });

        if (genericPlayerCardsHtml.trim() !== '') {
          const totalCardsGenerated = (genericPlayerCardsHtml.match(/class="extendo-player-card/g) || []).length;
          if (totalCardsGenerated >= 5) { 
            bannerContentHtml = `<div class="extendo-player-cards-container">${genericPlayerCardsHtml}</div>`;
          } else { 
            bannerContentHtml = `<div class="extendo-player-cards-scroll-container">${genericPlayerCardsHtml}</div>`;
          }
        } else {
          // This means no player cards were generated from playersToProcess
          bannerHeaderHtml = `<div class="extendo-header"><h2>Extendo Stats</h2></div>`;
          bannerContentHtml = `<div class="extendo-error"><i>No displayable player data from the server response.</i></div>`;
        }
    }
  } else { 
    // This 'else' means:
    // 1. Not a 10 player match where user was identified (myTeamPlayers/enemyTeamPlayers are null)
    // AND
    // 2. playersToProcess is not an array or is an empty array.
    bannerHeaderHtml = `<div class="extendo-header"><h2>Extendo Stats</h2></div>`;
    bannerContentHtml = `<div class="extendo-error"><i>No player data found to display. Check if the page contains player information or if you are in a match room.</i></div>`;
    console.log("Extendo: No teams identified and playersToProcess is empty or not an array. Displaying 'No data'.");
  }

  newBanner.innerHTML = bannerHeaderHtml + bannerContentHtml;
  
  // Ensure only one banner exists
  const existingBanner = document.querySelector('.extendo-faceit-banner');
  if (existingBanner) existingBanner.remove();
  
  document.body.appendChild(newBanner);
  addCloseButton(newBanner);
}

// NEW or UPDATED: handleApiError function
async function handleApiError(error) {
    console.error("Extendo: API or Processing Error:", error);
    
    // Ensure any existing banner (especially loading) is removed or replaced
    removeExistingBanner();

    const errorBanner = document.createElement("div");
    errorBanner.className = "extendo-faceit-banner"; // Use the same class for consistent styling/removal

    let errorMessageText = 'An unknown error occurred.';
    if (error instanceof Error) {
        errorMessageText = error.message;
    } else if (typeof error === 'string') {
        errorMessageText = error;
    }

    errorBanner.innerHTML = `
      <div class="extendo-header">
        <h2>Extendo Stats - Error</h2>
      </div>
      <div class="extendo-error">
        <p>Failed to load or process player statistics.</p>
        <p><i>${errorMessageText}</i></p>
      </div>
    `;
    document.body.appendChild(errorBanner);
    addCloseButton(errorBanner); // Add close/minimize to the error banner
}
