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

// Function to extract player nicknames from the current page
function getPlayerNicknamesFromPage() {
  const playerElements = document.querySelectorAll('a[href*="/en/players/"]');
  const nicknames = [];
  const genericLinkTexts = [
    'overview', 'stats', 'matches', 'friends', 'highlights', 'posts', 
    'settings', 'support', 'feedback', 'logout', 'login', 'register', 
    'home', 'tournaments', 'organizers', 'hubs', 'shop', 'premium', 
    'subscription', 'players', 'summary', 'graphs', 'demos', 'edit',
    'videos', 'inventory', 'followers', 'following' // Added from new logs
    // Add any other generic texts you notice being picked up
  ];

  playerElements.forEach(el => {
    let potentialNickname = '';
    // Attempt to get a more specific nickname element if nested
    const specificNicknameElement = el.querySelector('span[class*="nickname"], div[class*="nickname"], strong[class*="nickname"], h1, h2, h3, h4, h5, h6');
    
    if (specificNicknameElement && specificNicknameElement.textContent) {
      potentialNickname = specificNicknameElement.textContent.trim();
    } else {
      potentialNickname = el.textContent.trim();
    }

    // Normalize potentialNickname by removing trailing digits and converting to lowercase for generic check
    const normalizedPotentialNickname = potentialNickname.toLowerCase().replace(/\d+[+]*$/, '').replace(/[\s\d]+$/, '').trim(); // e.g. "Friends99" -> "friends", "Videos100+" -> "videos"

    // If the text content seems generic (after normalization), try to extract from href
    if (genericLinkTexts.includes(normalizedPotentialNickname)) {
      try {
        const url = new URL(el.href, location.origin); // Ensure base URL if href is relative
        const pathParts = url.pathname.split('/'); // e.g., ["", "en", "players", "NICKNAME", "stats"]
        const playersIndex = pathParts.indexOf('players');
        if (playersIndex !== -1 && pathParts.length > playersIndex + 1 && pathParts[playersIndex + 1]) {
          const nicknameFromHref = pathParts[playersIndex + 1];
          // Further check: ensure it's not another generic part or a UUID
          // Normalize nicknameFromHref as well before checking against genericLinkTexts
          const normalizedNicknameFromHref = nicknameFromHref.toLowerCase().replace(/\d+[+]*$/, '').replace(/[\s\d]+$/, '').trim();
          if (!genericLinkTexts.includes(normalizedNicknameFromHref) && isNaN(nicknameFromHref) && nicknameFromHref.length > 2 && nicknameFromHref.length < 24 && !nicknameFromHref.includes(':')) {
            potentialNickname = nicknameFromHref;
          } else {
            potentialNickname = ''; // Reset if href part is also generic or unsuitable
          }
        } else {
          potentialNickname = ''; // Reset if href doesn't match expected pattern
        }
      } catch (e) {
        console.warn("Extendo: Could not parse href for nickname", el.href, e);
        potentialNickname = ''; // Reset on error
      }
    }
    
    // Filter and add the nickname
    // Final check for generic terms on the potentialNickname itself, in case it wasn't caught above or came directly from textContent
    const finalNormalizedNickname = potentialNickname.toLowerCase().replace(/\d+[+]*$/, '').replace(/[\s\d]+$/, '').trim();
    if (potentialNickname && !genericLinkTexts.includes(finalNormalizedNickname) && potentialNickname.toLowerCase() !== 'players' && potentialNickname.length > 2 && potentialNickname.length < 24 && !potentialNickname.includes(':')) {
      if (!nicknames.includes(potentialNickname)) {
        nicknames.push(potentialNickname);
      }
    }
  });
  console.log("Extendo: Found nicknames on page:", nicknames);
  return nicknames;
}

function getLoggedInUserNickname() {

  const nicknameEl = document.querySelector('div[data-dialog-type="TRAY"] div[class*="HeadingWrapper"] a[href*="/en/players/"] h6');

  if (nicknameEl && nicknameEl.textContent) {
    const loggedInUser = nicknameEl.textContent.trim();
    console.log("Extendo: Found logged-in user:", loggedInUser);
    return loggedInUser;
  }
  console.log("Extendo: Could not find logged-in user nickname.");
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
        <p>Fetching player statistics...</p>
      </div>
    `;
    document.body.appendChild(loadingBanner);

    let playersToQuery = getPlayerNicknamesFromPage();
    let queryTypeMessage = "players on this page";

    if (!playersToQuery || playersToQuery.length === 0) {
        const loggedInUser = getLoggedInUserNickname();
        if (loggedInUser) {
            playersToQuery = [loggedInUser];
            queryTypeMessage = `logged-in user (${loggedInUser})`;
            console.log("Extendo: No matchroom players found, attempting to fetch stats for logged-in user:", loggedInUser);
        }
    }

    if (playersToQuery && playersToQuery.length > 0) {
        loadingBanner.querySelector("p").textContent = `Fetching statistics for ${queryTypeMessage}...`;
        fetch("http://localhost:5000/api/player-stats", {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ players: playersToQuery })
        })
        .then((r) => {
            if (!r.ok) throw new Error(`HTTP ${r.status} - ${r.statusText || 'Error'}`);
            return r.json();
        })
        .then((data) => {
            if (loadingBanner.parentNode) loadingBanner.remove();
            
            const newBanner = document.createElement("div");
            newBanner.className = "extendo-faceit-banner";
            
            // V IMPORTANT: This is where your existing complex HTML generation logic goes.
            // It should take the 'data' object and build the 'html' string.
            // --- START OF EXISTING HTML CONSTRUCTION LOGIC (FROM YOUR FILE) ---
            let html = '';
            if (Array.isArray(data) && data.length > 0 && data.some(p => p.nickname && !p.error)) {
                console.log("Extendo: Faceit data received:", data);
                html = `<div class="extendo-header"><h2>Faceit Player Stats</h2></div>`;
                data.forEach(p => {
                    if (p.error) { // Handle partial failures
                        html += `
                          <div class="extendo-player-card extendo-faceit-banner-error">
                            <div class="extendo-player-header">
                              <h3>${p.nickname || 'Unknown Player'} - Error</h3>
                            </div>
                            <div class="extendo-error">
                              <p>${p.error}</p>
                              ${p.details ? `<p>${p.details}</p>` : ''}
                            </div>
                          </div>`;
                        return;
                    }
                    if (!p.nickname) return;
                    
                    const games = p.games || {};
                    const cs2 = games.cs2 || {};
                    const faceitElo = cs2.faceit_elo || p.faceit_elo || "N/A";
                    const skillLevel = cs2.skill_level || p.skill_level || "?";
                    const avatar = p.avatar || ""; // Ensure avatar is defined

                    html += `
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
                        html += `
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
                        html += `
                          <div class="extendo-stats-section">
                            <h4>Map Performance</h4>
                            <div class="extendo-maps-table">
                              <table>
                                <thead><tr><th>Map</th><th>Matches</th><th>Win %</th><th>K/D</th></tr></thead>
                                <tbody>`;
                        mapStats.forEach(map => {
                            const mapName = map.label.replace('Map ', '');
                            const mapData = map.stats || {};
                            html += `<tr>
                                      <td>${mapName}</td>
                                      <td>${formatNumber(mapData.Matches || mapData.matches || 0)}</td>
                                      <td>${calculateWinRate(mapData.Wins || mapData.wins, mapData.Matches || mapData.matches)}</td>
                                      <td>${mapData['Average K/D Ratio'] || mapData.kd || 'N/A'}</td>
                                    </tr>`;
                        });
                        html += `</tbody></table></div></div>`;
                    }
                     // Add recent performance (if you have this logic)
                    if (p.stats && p.stats.recent_results && p.stats.recent_results.length) {
                        const recentResults = p.stats.recent_results; // Should be an array of '1's and '0's
                        const wins = recentResults.filter(r => r === '1').length;
                        const losses = recentResults.length - wins;
                         html += `
                          <div class="extendo-stats-section">
                            <h4>Recent Performance (Last ${recentResults.length})</h4>
                            <div class="extendo-recent-results">
                              <div class="extendo-stat-box">
                                <span class="stat-value">${wins}W - ${losses}L</span>
                                <span class="stat-label">Streak</span>
                              </div>
                              <div class="extendo-result-streak">`;
                        recentResults.slice(0, 10).forEach(result => { // Show up to 10
                            html += `<span class="result-dot result-${result === '1' ? 'win' : 'loss'}"></span>`;
                        });
                        html += `</div></div></div>`;
                    }

                    html += `
                        <div class="extendo-footer">
                          <a href='https://www.faceit.com/en/players/${p.nickname}' target='_blank' class="extendo-profile-link">View Full Profile</a>
                        </div>
                      </div>`; // End extendo-player-card
                });
            } else if (data && data.error) { // Backend returned a single error object
                 html = `<div class="extendo-header"><h2>Error</h2></div>
                         <div class="extendo-error">
                           <h3>Error from Backend</h3>
                           <p>${data.error}</p>
                           ${data.details ? `<p>${data.details}</p>` : ''}
                         </div>`;
            } else if (Array.isArray(data) && data.length > 0 && data.every(p => p.error)) { // All players resulted in an error
                 html = `<div class="extendo-header"><h2>Error</h2></div>
                         <div class="extendo-error">
                           <h3>Could not fetch stats for any requested players.</h3>`;
                data.forEach(p => {
                    html += `<p><strong>${p.nickname}:</strong> ${p.error}</p>`;
                });
                html += `</div>`;
            } else {
                html = `<div class="extendo-header"><h2>Extendo Stats</h2></div>
                        <div class="extendo-error"><i>No player data found or unexpected response.</i></div>`;
            }
            // --- END OF EXISTING HTML CONSTRUCTION LOGIC ---
            newBanner.innerHTML = html;
            document.body.appendChild(newBanner);

        })
        .catch((err) => {
            console.error("Extendo: Error fetching player stats:", err);
            if (loadingBanner.parentNode) loadingBanner.remove();
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
        })
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
