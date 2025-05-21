// Page interaction and data extraction (URL, Nicknames) for Extendo extension

function getMatchIdFromUrl() {
  const matchRoomPattern = /\/en\/(cs2|csgo|games\/\d+)\/room\/([a-f0-9-]+)/i;
  let match = window.location.pathname.match(matchRoomPattern);
  if (match && match[2]) return match[2];
  
  const alternatePattern = /\/en\/room\/([a-f0-9-]+)/i;
  match = window.location.pathname.match(alternatePattern);
  if (match && match[1]) return match[1];
  
  const urlParams = new URLSearchParams(window.location.search);
  const matchId = urlParams.get('matchId') || urlParams.get('match_id') || urlParams.get('matchroom');
  if (matchId && /^[a-f0-9-]+$/i.test(matchId)) return matchId;
  
  return null;
}

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

  const playerElements = document.querySelectorAll('a[href*="/en/players/"]');
  
  playerElements.forEach(el => {
    if (el.href.includes('/players/search') || 
        el.href.includes('/players/division') ||
        el.href.includes('/teams/') ||
        el.href.match(/\/players\/\d+$/) ||
        el.href.match(/\/players\/\?/)) {
      return;
    }

    let nickname = null;
    try {
      const url = new URL(el.href, window.location.origin);
      const pathParts = url.pathname.split('/');
      const playersIndex = pathParts.indexOf('players');
      if (playersIndex !== -1 && pathParts.length > playersIndex + 1) {
        const candidateNickname = pathParts[playersIndex + 1];
        if (candidateNickname && candidateNickname.length >= 3 && candidateNickname.length <= 25 && 
            !genericLinkTexts.includes(candidateNickname.toLowerCase()) &&
            !/^[0-9-]+$/.test(candidateNickname)) {
          nickname = candidateNickname;
        }
      }
    } catch (e) { /* Do nothing */ }

    if (!nickname) {
      const nicknameElement = el.querySelector('span[class*="nickname"], div[class*="nickname"], strong[class*="nickname"]');
      if (nicknameElement && nicknameElement.textContent) {
        const candidateNickname = nicknameElement.textContent.trim();
        if (candidateNickname && candidateNickname.length >= 3 && candidateNickname.length <= 25 &&
            !genericLinkTexts.includes(candidateNickname.toLowerCase())) {
          nickname = candidateNickname;
        }
      } else if (el.textContent && el.textContent.trim().length >= 3 && el.textContent.trim().length <= 25 &&
               !genericLinkTexts.includes(el.textContent.trim().toLowerCase())) {
        nickname = el.textContent.trim();
      }
    }

    if (nickname && !nicknames.includes(nickname)) {
      nicknames.push(nickname);
    }
  });
  return nicknames;
}

async function getLoggedInUserNickname() {
  const userId = getCurrentUserId(); // Assumes getCurrentUserId is global or imported from utils.js
  if (userId) {
    try {
      const nickname = await getNicknameFromUserId(userId); // Assumes getNicknameFromUserId is global or imported from utils.js
      if (nickname) return nickname;
    } catch (e) {
      console.warn("Extendo: Error converting user ID to nickname:", e);
    }
  }

  let nicknameEl = document.querySelector('div[data-dialog-type="TRAY"] div[class*="HeadingWrapper"] a[href*="/en/players/"] h6');
  if (nicknameEl && nicknameEl.textContent) return nicknameEl.textContent.trim();
  
  const avatarLink = document.querySelector('a[href*="/en/players/"][class*="AvatarWrapper"], div[class*="AvatarWrapper"] a[href*="/en/players/"]');
  if (avatarLink) {
    try {
      const url = new URL(avatarLink.href, window.location.origin);
      const pathParts = url.pathname.split('/');
      const playersIndex = pathParts.indexOf('players');
      if (playersIndex !== -1 && pathParts.length > playersIndex + 1) {
        const nickname = pathParts[playersIndex + 1];
        if (nickname && nickname.length >= 3) return nickname;
      }
    } catch (e) { /* Do nothing */ }
  }
  
  const accountMenuLinks = document.querySelectorAll('a[href*="/en/players/"]');
  for (const link of accountMenuLinks) {
    if (link.classList.contains('active') || link.getAttribute('aria-current') === 'page' || link.closest('[role="navigation"]')) {
      try {
        const url = new URL(link.href, window.location.origin);
        const pathParts = url.pathname.split('/');
        const playersIndex = pathParts.indexOf('players');
        if (playersIndex !== -1 && pathParts.length > playersIndex + 1) {
          const nickname = pathParts[playersIndex + 1];
          if (nickname && nickname.length >= 3) return nickname;
        }
      } catch (e) { /* Do nothing */ }
    }
  }
  return null;
}
