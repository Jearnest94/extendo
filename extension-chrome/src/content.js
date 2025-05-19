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

// Call backend Faceit proof-of-concept endpoint and show result in a banner

removeExistingBanner();

// Loading state
const loadingBanner = document.createElement("div");
loadingBanner.className = "extendo-faceit-banner";
loadingBanner.innerHTML = `
  <div class="extendo-header">
    <h2>Loading Players...</h2>
  </div>
  <div class="extendo-loading">
    <div class="extendo-spinner"></div>
    <p>Fetching player statistics...</p>
  </div>
`;
document.body.appendChild(loadingBanner);

// Fetch multiple players using the new JSON-based API
fetch("http://localhost:5000/api/player-stats", {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    players: ["ALTR_ABDI", "s1mple"]
  })
})
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  })
  .then((data) => {
    removeExistingBanner();
    const banner = document.createElement("div");
    banner.className = "extendo-faceit-banner";
    
    let html = '';
    
    if (Array.isArray(data) && data.length && data[0].nickname) {
      console.log("Faceit data:", data);
      
      html = `
        <div class="extendo-header">
          <h2>Faceit Player Stats</h2>
        </div>
      `;
      
      // Process each player in the response
      data.forEach(p => {
        if (!p.nickname) return; // Skip if no nickname
        
        const games = p.games || {};
        const cs2 = games.cs2 || {};
        const faceitElo = cs2.faceit_elo || p.faceit_elo || "N/A";
        
        html += `
          <div class="extendo-player-card">
            <div class="extendo-player-header">
              <img src='${p.avatar || ""}' class="extendo-avatar">
              <div class="extendo-player-info">
                <h3>${p.nickname}</h3>
                <div class="extendo-player-details">
                  ${p.country ? `<span class="extendo-country">${p.country}</span>` : ''}
                  <span class="extendo-level">Level ${p.games?.cs2?.skill_level || p.skill_level || "?"}</span>
                  <span class="extendo-elo">Elo: ${formatNumber(faceitElo)}</span>
                </div>
              </div>
            </div>
        `;

        // Add overall statistics
        if (p.stats) {
          const lifetimeStats = p.stats.lifetime || {};
          
          html += `
            <div class="extendo-stats-section">
              <h4>Lifetime Stats</h4>
              <div class="extendo-stats-grid">
                <div class="extendo-stat-box">
                  <span class="stat-value">${formatNumber(lifetimeStats.Matches || lifetimeStats.matches || 0)}</span>
                  <span class="stat-label">Matches</span>
                </div>
                <div class="extendo-stat-box">
                  <span class="stat-value">${calculateWinRate(lifetimeStats.Wins || lifetimeStats.wins || 0, lifetimeStats.Matches || lifetimeStats.matches || 0)}</span>
                  <span class="stat-label">Win Rate</span>
                </div>
                <div class="extendo-stat-box">
                  <span class="stat-value">${lifetimeStats['K/D Ratio'] || lifetimeStats['K/D'] || lifetimeStats.kd || 'N/A'}</span>
                  <span class="stat-label">K/D Ratio</span>
                </div>
                <div class="extendo-stat-box">
                  <span class="stat-value">${lifetimeStats['Average Damage per Round'] || lifetimeStats['ADR'] || lifetimeStats.adr || 'N/A'}</span>
                  <span class="stat-label">ADR</span>
                </div>
              </div>
            </div>
          `;
          
          // Add map statistics if available
          const mapStats = extractMapStats(p);
          
          if (mapStats && mapStats.length > 0) {
            html += `
              <div class="extendo-stats-section">
                <h4>Map Performance</h4>
                <div class="extendo-maps-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Map</th>
                        <th>Matches</th>
                        <th>Win %</th>
                        <th>K/D</th>
                      </tr>
                    </thead>
                    <tbody>
            `;
            
            mapStats.forEach(map => {
              const mapName = map.label.replace('Map ', '');
              const mapData = map.stats || {};
              
              html += `
                <tr>
                  <td>${mapName}</td>
                  <td>${formatNumber(mapData.Matches || mapData.matches || 0)}</td>
                  <td>${calculateWinRate(mapData.Wins || mapData.wins || 0, mapData.Matches || mapData.matches || 0)}</td>
                  <td>${mapData['Average K/D Ratio'] || mapData.kd || 'N/A'}</td>
                </tr>
              `;
            });
            
            html += `
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          }
          
          // Add recent performance if available
          if (p.stats.recent_results && p.stats.recent_results.length) {
            const recentResults = p.stats.recent_results;
            const wins = recentResults.filter(result => result === '1').length;
            const losses = recentResults.filter(result => result === '0').length;
            
            html += `
              <div class="extendo-stats-section">
                <h4>Recent Performance</h4>
                <div class="extendo-recent-results">
                  <div class="extendo-stat-box">
                    <span class="stat-value">${wins}W - ${losses}L</span>
                    <span class="stat-label">Last ${recentResults.length} matches</span>
                  </div>
                  <div class="extendo-result-streak">
            `;
            
            // Display last 5 matches as a visual streak
            recentResults.slice(0, 5).forEach(result => {
              html += `<span class="result-dot result-${result === '1' ? 'win' : 'loss'}"></span>`;
            });
            
            html += `
                  </div>
                </div>
              </div>
            `;
          }
        }
        
        // Add link to profile
        html += `
            <div class="extendo-footer">
              <a href='https://www.faceit.com/en/players/${p.nickname}' target='_blank' class="extendo-profile-link">View Full Profile</a>
            </div>
          </div>
        `;
      });
      
    } else if (data && Object.keys(data).length) {
      html = `<div class="extendo-error"><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
    } else {
      html = `<div class="extendo-error"><i>No data available.</i></div>`;
    }
    
    banner.innerHTML = html;
    document.body.appendChild(banner);
  })
  .catch((err) => {
    removeExistingBanner();
    console.error("Error fetching Faceit data:", err);
    const banner = document.createElement("div");
    banner.className = "extendo-faceit-banner extendo-faceit-banner-error";
    banner.innerHTML = `
      <div class="extendo-error">
        <h3>Error</h3>
        <p>Failed to fetch Faceit data: ${err.message}</p>
        <p>Make sure the backend server is running at <a>http://localhost:5000</a></p>
      </div>
    `;
    document.body.appendChild(banner);
  });
