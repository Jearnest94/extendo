// Utility functions for Extendo extension

/**
 * Check if a string is valid JSON
 * @param {string} str - String to check
 * @returns {boolean} - Whether the string is valid JSON
 */
function isJson(str) {
  if (!str || typeof str !== 'string') return false;
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get current Faceit user ID from localStorage or cookies
 * @returns {string|null} - User ID or null if not found
 */
function getCurrentUserId() {
    // Try legacy storage format
    try {
        const legacyData = localStorage.getItem('C_UCURRENT_USER.data.CURRENT_USER');
        if (legacyData && isJson(legacyData)) {
            const legacyId = JSON.parse(legacyData)?.value?.currentUser?.id;
            if (legacyId) {
                console.log("Extendo: Found user ID in legacy storage:", legacyId);
                return legacyId;
            }
        }
    } catch (e) {
        console.warn("Extendo: Error parsing legacy user data:", e);
    }

    // Try prefetched auth
    try {
        const authData = localStorage.getItem('prefetched-auth');
        if (authData && isJson(authData)) {
            const auth = JSON.parse(authData);
            if (auth?.session?.entity?.id) {
                console.log("Extendo: Found user ID in prefetched auth:", auth.session.entity.id);
                return auth.session.entity.id;
            }
        }
    } catch (e) {
        console.warn("Extendo: Error parsing prefetched auth:", e);
    }

    // Search through other localStorage items
    for (const key in localStorage) {
        try {
            const isId1 = key.includes('ab.storage.userId.');
            const isId2 = key.includes('ab.storage.attributes.');
            const isId3 = key.includes('ab.storage.events.');
            let id = null;

            if (isId1) {
                id = JSON.parse(localStorage[key])?.v?.g;
            } else if (isId2) {
                id = Object.keys(JSON.parse(localStorage[key])?.v || {})?.[0];
            } else if (isId3) {
                id = JSON.parse(localStorage[key])?.v?.[0]?.u;
            }

            if (id) {
                console.log(`Extendo: Found user ID in localStorage key ${key}:`, id);
                return id;
            }
        } catch (e) {
            // Skip any items that cause errors
        }
    }

    // Try cookies as a last resort
    try {
        const cookieUserId = getUserIdFromCookies();
        if (cookieUserId) {
            console.log("Extendo: Found user ID in cookies:", cookieUserId);
            return cookieUserId;
        }
    } catch (e) {
        console.warn("Extendo: Error parsing cookies for user ID:", e);
    }

    console.log("Extendo: No user ID found in storage or cookies");
    return null;
};

/**
 * Check if user is logged in based on cookies or localStorage
 * @returns {boolean} - Whether user is logged in
 */
function isLoggedIn() {
    return document.cookie.includes('ab.storage.userId.') || !!getCurrentUserId();
}

/**
 * Extract user ID from cookies
 * @returns {string|null} - User ID or null if not found
 */
const getUserIdFromCookies = () => {
    const cookies = document.cookie.split(';');
    const cookieContent = cookies
        .find((cookie) => cookie?.trim()?.startsWith('ab.storage.userId'))
        ?.split('=')?.[1];
    
    if (cookieContent) {
        if (isJson(cookieContent)) {
            return JSON.parse(decodeURIComponent(cookieContent))?.g;
        }

        const cookieValue = decodeURIComponent(cookieContent);
        const cookieValueParts = cookieValue.split('|');
        const userIdPart = cookieValueParts.find((part) =>
            part.startsWith('g:')
        );
        if (userIdPart) {
            return userIdPart.split(':')[1];
        }
    }
    return null;
};

/**
 * Get user nickname from user ID using Faceit API
 * This can be used to convert user ID to nickname which our backend expects
 * @param {string} userId - The Faceit user ID
 * @returns {Promise<string|null>} - Resolves to nickname or null if not found
 */
async function getNicknameFromUserId(userId) {
    if (!userId) return null;
    
    try {
        // Use Faceit's public API to get user details
        const response = await fetch(`https://api.faceit.com/core/v1/users/${userId}`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        
        const userData = await response.json();
        if (userData && userData.payload && userData.payload.nickname) {
            console.log(`Extendo: Converted user ID ${userId} to nickname: ${userData.payload.nickname}`);
            return userData.payload.nickname;
        }
    } catch (e) {
        console.warn(`Extendo: Error fetching nickname for user ID ${userId}:`, e);
    }
    
    return null;
};
