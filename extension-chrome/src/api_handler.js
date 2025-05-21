// API interaction and response handling for Extendo extension

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
  window.currentBanner = newBanner; 
  
  let bannerHeaderHtml = '';
  let bannerContentHtml = '';
  
  let myTeamPlayers = null; 
  let enemyTeamPlayers = null; 
  let playersToProcess = Array.isArray(data) ? [...data] : [];

  const loggedInUserId = await getCurrentUserId(); // Assumes getCurrentUserId is global or imported
  console.log("Extendo: Logged-in user ID for team sorting:", loggedInUserId);

  const robustSort = (a, b) => {
    if (a.error && !b.error) return 1;
    if (!a.error && b.error) return -1;
    if (a.error && b.error) {
        return (a.nickname || '').localeCompare(b.nickname || '');
    }
    const nickA = a.nickname || '';
    const nickB = b.nickname || '';
    return nickA.localeCompare(nickB);
  };

  if (Array.isArray(data) && data.length === 10) { 
      console.log("Extendo: Attempting to assign teams for 10 players.");
      const faction1Players = data.slice(0, 5);
      const faction2Players = data.slice(5, 10);
      
      myTeamPlayers = null;
      enemyTeamPlayers = null;

      if (loggedInUserId) {
          const userInFaction1 = faction1Players.some(p => p.player_id && p.player_id === loggedInUserId);
          const userInFaction2 = faction2Players.some(p => p.player_id && p.player_id === loggedInUserId);

          if (userInFaction1) {
              myTeamPlayers = [...faction1Players]; 
              enemyTeamPlayers = [...faction2Players];
          } else if (userInFaction2) {
              myTeamPlayers = [...faction2Players]; 
              enemyTeamPlayers = [...faction1Players];
          }
      }
  } else if (!Array.isArray(data)) { 
      playersToProcess = []; 
      myTeamPlayers = null;
      enemyTeamPlayers = null;
  }

  if ((myTeamPlayers && enemyTeamPlayers) || (Array.isArray(playersToProcess) && playersToProcess.length > 0)) { 
    
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

        const mapStats = extractMapStats(player); // Assumes extractMapStats is global or imported
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
    }

    bannerHeaderHtml = `<div class="extendo-header"><h2>ALTR EXTENDO</h2></div>`;

    if (myTeamPlayers && enemyTeamPlayers) { 
        enemyTeamPlayers.sort(robustSort);
        myTeamPlayers.sort(robustSort);
        let enemyTeamHtml = enemyTeamPlayers.map(generatePlayerCardHtml).join('');
        let myTeamHtml = myTeamPlayers.map(generatePlayerCardHtml).join('');

        if (enemyTeamHtml.trim() !== '' || myTeamHtml.trim() !== '') { 
          bannerContentHtml = `
            <div class="extendo-teams-container">
              ${enemyTeamHtml.trim() !== '' ? `<div class="extendo-team-row">${enemyTeamHtml}</div>` : ''}
              ${myTeamHtml.trim() !== '' ? `<div class="extendo-team-row">${myTeamHtml}</div>` : ''}
            </div>
          `;
        } else {
          myTeamPlayers = null; 
          enemyTeamPlayers = null;
        }
    } 
    
    if (!(myTeamPlayers && enemyTeamPlayers)) { 
        if (Array.isArray(playersToProcess) && playersToProcess.length > 0) {
            playersToProcess.sort(robustSort);
        }
        let genericPlayerCardsHtml = playersToProcess.map(generatePlayerCardHtml).join('');

        if (genericPlayerCardsHtml.trim() !== '') {
          const totalCardsGenerated = (genericPlayerCardsHtml.match(/class="extendo-player-card/g) || []).length;
          bannerContentHtml = totalCardsGenerated >= 5 ? 
            `<div class="extendo-player-cards-container">${genericPlayerCardsHtml}</div>` : 
            `<div class="extendo-player-cards-scroll-container">${genericPlayerCardsHtml}</div>`;
        } else {
          bannerHeaderHtml = `<div class="extendo-header"><h2>Extendo Stats</h2></div>`;
          bannerContentHtml = `<div class="extendo-error"><i>No displayable player data from the server response.</i></div>`;
        }
    }
  } else { 
    bannerHeaderHtml = `<div class="extendo-header"><h2>Extendo Stats</h2></div>`;
    bannerContentHtml = `<div class="extendo-error"><i>No player data found to display. Check if the page contains player information or if you are in a match room.</i></div>`;
  }

  newBanner.innerHTML = bannerHeaderHtml + bannerContentHtml;
  
  const existingBanner = document.querySelector('.extendo-faceit-banner');
  if (existingBanner) existingBanner.remove();
  
  document.body.appendChild(newBanner);
  addCloseButton(newBanner); // Assumes addCloseButton is global or imported

  if (window.isExtendoMinimized && newBanner.parentElement) {
      newBanner.classList.add('minimized');
  }
}

async function handleApiError(error) {
    console.error("Extendo: API or Processing Error:", error);
    
    removeExistingBanner(); // Assumes removeExistingBanner is global or imported

    const errorBanner = document.createElement("div");
    errorBanner.className = "extendo-faceit-banner";
    window.currentBanner = errorBanner; 
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
    addCloseButton(errorBanner); // Assumes addCloseButton is global or imported

    const isMatchRoomUrl = !!getMatchIdFromUrl(); // Assumes getMatchIdFromUrl is global or imported
    if ((!isMatchRoomUrl && !errorBanner.classList.contains('minimized')) || (window.isExtendoMinimized && errorBanner.parentElement)) {
        errorBanner.classList.add('minimized');
    }
}
