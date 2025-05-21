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

function runExtendoLogic() {
    if (isRunningLogic) {
        console.log("Extendo: Logic is already running, skipping.");
        return;
    }
    isRunningLogic = true;
    console.log("Extendo: Running logic for URL:", location.href);

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

    const matchId = getMatchIdFromUrl();
    let apiPromise;
    let queryTypeMessage = "";

    if (matchId) {
        console.log(`Extendo: Match room detected (ID: ${matchId}). Fetching stats via match ID.`);
        queryTypeMessage = `players in match room ${matchId}`;
        loadingBanner.querySelector("p").textContent = `Fetching statistics for ${queryTypeMessage}...`;
        apiPromise = fetch(`http://localhost:5000/api/match-room-stats/${matchId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
    } else {
        console.log("Extendo: Not a match room. Attempting to find players on page or use logged-in user.");
        let playersToQuery = getPlayerNicknamesFromPage();
        
        if (!playersToQuery || playersToQuery.length === 0) {
            loadingBanner.querySelector("p").textContent = "Looking for logged-in user...";
            
            // Since getLoggedInUserNickname is now async, we need to handle it differently
            getLoggedInUserNickname().then(loggedInUser => {
                if (loggedInUser) {
                    playersToQuery = [loggedInUser];
                    queryTypeMessage = `logged-in user (${loggedInUser})`;
                    console.log("Extendo: No players found on page, attempting to fetch stats for logged-in user:", loggedInUser);
                    
                    loadingBanner.querySelector("p").textContent = `Fetching statistics for ${queryTypeMessage}...`;
                    return fetch("http://localhost:5000/api/player-stats", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ players: playersToQuery })
                    }).then(handleApiResponse)
                    .catch(handleApiError)
                    .finally(() => {
                        isRunningLogic = false;
                    });
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
                    isRunningLogic = false;
                }
            }).catch(error => {
                console.error("Extendo: Error getting logged-in user:", error);
                isRunningLogic = false;
            });
            
            return; // Exit early as we're handling the async flow separately
        } else {
            queryTypeMessage = "players on this page";
        }

        if (playersToQuery && playersToQuery.length > 0) {
            loadingBanner.querySelector("p").textContent = `Fetching statistics for ${queryTypeMessage}...`;
            apiPromise = fetch("http://localhost:5000/api/player-stats", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ players: playersToQuery })
            });
        } else {
            console.log("Extendo: No players to query.");
            loadingBanner.innerHTML = `
              <div class="extendo-header">
                <h2>Extendo Stats</h2>
              </div>
              <div class="extendo-loading">
                <p>No players found on this page.</p>
                <p>Navigate to a Faceit match room or ensure you are logged in for your stats.</p>
              </div>
            `;
            isRunningLogic = false; // Release lock
            return; // Exit early
        }
    }

    if (apiPromise) {
        apiPromise
            .then(handleApiResponse)
            .catch(handleApiError)
            .finally(() => {
                isRunningLogic = false;
            });
    } else {
        console.log("Extendo: No players to query.");
        loadingBanner.innerHTML = `
          <div class="extendo-header">
            <h2>Extendo Stats</h2>
          </div>
          <div class="extendo-loading">
            <p>No players found on this page.</p>
            <p>Navigate to a Faceit match room or ensure you are logged in for your stats.</p>
          </div>
        `;
        isRunningLogic = false; // Release lock
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
        runExtendoLogic();
    });
} else {
    injectExtendoStylesheet();
    console.log("Extendo: Content script loaded (DOM already ready). Initializing...");
    runExtendoLogic();
}

const debouncedRunExtendoLogic = debounce(runExtendoLogic, 500);

const observer = new MutationObserver((mutationsList, observer) => {
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
async function handleApiResponse(response) { // Made this function async
  if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText || 'Error'}`);
  
  return response.json().then(async data => { // This inner function is now async
    const loadingBanner = document.querySelector('.extendo-faceit-banner');
    if (loadingBanner && loadingBanner.parentNode) loadingBanner.remove();
    
    const newBanner = document.createElement("div");
    newBanner.className = "extendo-faceit-banner";
    
    let bannerHeaderHtml = '';
    let bannerContentHtml = '';
    let playerCardsHtmlString = ''; // Accumulates HTML for all player cards

    const loggedInUserId = await getCurrentUserId(); // Get logged-in user's ID
    console.log("Extendo: Logged-in user ID for team sorting:", loggedInUserId);

    let playersToProcess = Array.isArray(data) ? [...data] : []; // Default to a copy of data or empty array

    // Attempt to sort players for 5v5 match rooms
    if (Array.isArray(data) && data.length === 10) { // Specifically for 5v5 match rooms
        console.log("Extendo: Attempting to sort 10 players for match room.");
        const faction1Players = data.slice(0, 5);
        const faction2Players = data.slice(5, 10);
        let myTeamPlayers = null;
        let enemyTeamPlayers = null;

        console.log("Extendo: Faction 1 Players:", faction1Players.map(p => ({ nickname: p.nickname, player_id: p.player_id })));
        console.log("Extendo: Faction 2 Players:", faction2Players.map(p => ({ nickname: p.nickname, player_id: p.player_id })));

        if (loggedInUserId) { // If we have a logged-in user ID
            console.log(`Extendo: Checking factions for loggedInUserId: ${loggedInUserId}`);
            const userInFaction1 = faction1Players.some(p => {
                console.log(`Extendo: Faction 1: Comparing ${p.player_id} with ${loggedInUserId}`);
                return p.player_id && p.player_id === loggedInUserId;
            });
            const userInFaction2 = faction2Players.some(p => {
                console.log(`Extendo: Faction 2: Comparing ${p.player_id} with ${loggedInUserId}`);
                return p.player_id && p.player_id === loggedInUserId;
            });

            console.log(`Extendo: User in Faction 1: ${userInFaction1}`);
            console.log(`Extendo: User in Faction 2: ${userInFaction2}`);

            if (userInFaction1) {
                myTeamPlayers = faction1Players;
                enemyTeamPlayers = faction2Players;
                console.log("Extendo: User ID found in Faction 1. Faction 1 is My Team. Faction 2 is Enemy.");
            } else if (userInFaction2) {
                myTeamPlayers = faction2Players;
                enemyTeamPlayers = faction1Players;
                console.log("Extendo: User ID found in Faction 2. Faction 2 is My Team. Faction 1 is Enemy.");
            } else {
                console.log("Extendo: Logged-in user ID not found in either faction by player_id.");
            }
        } else {
            console.log("Extendo: No loggedInUserId available for team sorting by ID.");
        }

        if (myTeamPlayers && enemyTeamPlayers) {
            playersToProcess = [...enemyTeamPlayers, ...myTeamPlayers]; // Enemy team first, then user's team
            console.log("Extendo: Teams sorted by ID for display. Enemy team on top row.");
        } else {
            console.log("Extendo: Logged-in user ID not identified in either faction for sorting, or data is not a 10-player match. Using default player order.");
            // playersToProcess remains as the original 'data' copy if user not found or not 10 players.
            // If it's 10 players but user not found, faction1Players will be top, faction2Players bottom by default.
        }
    } else if (Array.isArray(data)) {
        // For non-10-player arrays, just use the data as is.
        playersToProcess = [...data];
    }


    if (playersToProcess.length > 0) {
      console.log("Extendo: Processing player data for display:", playersToProcess);
      
      playersToProcess.forEach(p => { // Iterate over the (potentially reordered) playersToProcess
        if (p.error) { // Handle partial failures for a specific player
          playerCardsHtmlString += `
            <div class="extendo-player-card extendo-faceit-banner-error">
              <div class="extendo-player-header">
                <h3>${p.nickname || 'Unknown Player'} - Error</h3>
              </div>
              <div class="extendo-error">
                <p>${p.error}</p>
                ${p.details ? `<p>${p.details}</p>` : ''}
              </div>
            </div>`;
        } else if (p.nickname) { // Successful player data
          const games = p.games || {};
          const cs2 = games.cs2 || {};
          const faceitElo = cs2.faceit_elo || p.faceit_elo || "N/A";
          const skillLevel = cs2.skill_level || p.skill_level || "?";
          const avatar = p.avatar || ""; 

          playerCardsHtmlString += `
          <div class="extendo-player-card">
            <div class="extendo-player-header">
              <img src='${avatar}' class="extendo-avatar" alt="${p.nickname}'s avatar">
              <div class="extendo-player-info">
                <h3>${p.nickname}</h3>
                <div class="extendo-player-details">
                  ${p.country ? `<span class="extendo-country">${p.country}</span>` : ''}
                  <span class="extendo-level">Level ${skillLevel}</span>
                  <span class="extendo-elo">Elo: ${formatNumber(faceitElo)}</span>
                </div>
              </div>
            </div>`;

          if (p.stats && p.stats.lifetime) {
            const lifetimeStats = p.stats.lifetime;
            playerCardsHtmlString += `
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
                  <span class="stat-value">${p.adr || 'N/A'}</span>
                  <span class="stat-label">ADR</span>
                </div>
              </div>
            </div>`;
          }

          const mapStats = extractMapStats(p);
          if (mapStats && mapStats.length > 0) {
            playerCardsHtmlString += `
            <div class="extendo-stats-section">
              <h4>Map Performance</h4>
              <div class="extendo-maps-table">
                <table>
                  <thead><tr><th>Map</th><th>Matches</th><th>Win %</th><th>K/D</th></tr></thead>
                  <tbody>`;
            mapStats.forEach(map => {
              const mapName = map.label.replace('Map ', '');
              const mapData = map.stats || {};
              playerCardsHtmlString += `<tr>
                    <td>${mapName}</td>
                    <td>${formatNumber(mapData.Matches || mapData.matches || 0)}</td>
                    <td>${calculateWinRate(mapData.Wins || mapData.wins, mapData.Matches || mapData.matches)}</td>
                    <td>${mapData['Average K/D Ratio'] || mapData.kd || 'N/A'}</td>
                  </tr>`;
            });
            playerCardsHtmlString += `</tbody></table></div></div>`;
          }
          
          if (p.stats && p.stats.recent_results && p.stats.recent_results.length) {
            const recentResults = p.stats.recent_results;
            const wins = recentResults.filter(r => r === '1').length;
            const losses = recentResults.length - wins;
            playerCardsHtmlString += `
            <div class="extendo-stats-section">
              <h4>Recent Performance (Last ${recentResults.length})</h4>
              <div class="extendo-recent-results">
                <div class="extendo-stat-box">
                  <span class="stat-value">${wins}W - ${losses}L</span>
                  <span class="stat-label">Streak</span>
                </div>
                <div class="extendo-result-streak">`;
            recentResults.slice(0, 10).forEach(result => {
              playerCardsHtmlString += `<span class="result-dot result-${result === '1' ? 'win' : 'loss'}"></span>`;
            });
            playerCardsHtmlString += `</div></div></div>`;
          }

          playerCardsHtmlString += `
          <div class="extendo-footer">
            <a href='https://www.faceit.com/en/players/${p.nickname}' target='_blank' class="extendo-profile-link">View Full Profile</a>
          </div>
        </div>`; // End extendo-player-card
        }
      });

      if (playerCardsHtmlString.trim() !== '') {
        bannerHeaderHtml = `<div class="extendo-header"><h2>Faceit Player Stats</h2></div>`;
        const totalCardsGenerated = (playerCardsHtmlString.match(/class="extendo-player-card/g) || []).length;
        
        if (totalCardsGenerated >= 5) { // Use grid for 5+ cards (typically 10 for match room)
          bannerContentHtml = `<div class="extendo-player-cards-container">${playerCardsHtmlString}</div>`;
        } else { // Use scroll for 1-4 cards
          bannerContentHtml = `<div class="extendo-player-cards-scroll-container">${playerCardsHtmlString}</div>`;
        }
      } else {
        // No valid player cards were generated from the data array
        bannerHeaderHtml = `<div class="extendo-header"><h2>Extendo Stats</h2></div>`;
        bannerContentHtml = `<div class="extendo-error"><i>No displayable player data from the server response.</i></div>`;
      }

    } else if (data && data.error) { // Backend returned a single error object for the whole request
      bannerHeaderHtml = `<div class="extendo-header"><h2>Error</h2></div>`;
      bannerContentHtml = `<div class="extendo-error">
                <h3>Error from Backend</h3>
                <p>${data.error}</p>
                ${data.details ? `<p>${data.details}</p>` : ''}
              </div>`;
    } else { // No data, empty array, or unexpected format
      bannerHeaderHtml = `<div class="extendo-header"><h2>Extendo Stats</h2></div>`;
      bannerContentHtml = `<div class="extendo-error"><i>No player data found or unexpected response.</i></div>`;
    }
    
    newBanner.innerHTML = bannerHeaderHtml + bannerContentHtml;
    document.body.appendChild(newBanner);
    addCloseButton(newBanner); // Add buttons to the new banner
  });
}

// Helper function to handle API errors
function handleApiError(err) {
  console.error("Extendo: Error fetching player stats:", err);
  
  const loadingBanner = document.querySelector('.extendo-faceit-banner');
  if (loadingBanner && loadingBanner.parentNode) loadingBanner.remove();
  
  const errorBanner = document.createElement("div");
  errorBanner.className = "extendo-faceit-banner extendo-faceit-banner-error";
  errorBanner.innerHTML = `
    <div class="extendo-header">
      <h2>Fetch Error</h2>
    </div>
    <div class="extendo-error">
      <h3>Could not fetch player statistics</h3>
      <p>Details: ${err.message}</p>
      <p>Is the backend server running at http://localhost:5000 and responding correctly?</p>
    </div>
  `;
  document.body.appendChild(errorBanner);
  addCloseButton(errorBanner); // Add buttons to the error banner
}
