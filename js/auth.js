/**
 * WarehouseWrangler - Authentication Module
 * Handles login, token management, and user session
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const AUTH_CONFIG = {
    // Use relative path from the current location
    apiBaseUrl: './api',
    loginEndpoint: '/auth/login.php',
    tokenKey: 'ww_auth_token',
    userKey: 'ww_user_data',
    rememberKey: 'ww_remember_me'
};

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const elements = {
    loginForm: null,
    usernameInput: null,
    passwordInput: null,
    rememberCheckbox: null,
    loginButton: null,
    buttonText: null,
    buttonSpinner: null,
    errorMessage: null
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    initializeElements();
    // Only auto-redirect away if we are on the login page
    const isLoginPage = /(^|\/)login\.html($|\?)/i.test(location.pathname);
    if (isLoginPage) {
        checkExistingAuth();
    }
    setupEventListeners();
    loadRememberedUsername();
});

/**
 * Initialize DOM element references
 */
function initializeElements() {
    elements.loginForm = document.getElementById('loginForm');
    elements.usernameInput = document.getElementById('username');
    elements.passwordInput = document.getElementById('password');
    elements.rememberCheckbox = document.getElementById('rememberMe');
    elements.loginButton = document.getElementById('loginButton');
    elements.buttonText = document.getElementById('buttonText');
    elements.buttonSpinner = document.getElementById('buttonSpinner');
    elements.errorMessage = document.getElementById('errorMessage');
}

/**
 * Check if user is already authenticated
 */
function checkExistingAuth() {
    const token = getToken();
    if (token && isTokenValid(token)) {
        // Redirect to dashboard
        window.location.href = 'index.html';
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', handleLogin);
    }

    // Clear error on input
    [elements.usernameInput, elements.passwordInput].forEach(input => {
        if (input) {
            input.addEventListener('input', hideError);
        }
    });

    // Enter key on password field
    if (elements.passwordInput) {
        elements.passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                elements.loginForm.dispatchEvent(new Event('submit'));
            }
        });
    }
}

// ============================================================================
// LOGIN HANDLING
// ============================================================================

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();
    
    // Get form values
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value;
    const rememberMe = elements.rememberCheckbox.checked;

    // Validate inputs
    if (!username || !password) {
        showError('Please enter both username and password.');
        return;
    }

    // Show loading state
    setLoading(true);
    hideError();

    try {
        // Make API request
        console.log('Attempting login for user:', username, AUTH_CONFIG.apiBaseUrl + AUTH_CONFIG.loginEndpoint);
        const response = await fetch(`${AUTH_CONFIG.apiBaseUrl}${AUTH_CONFIG.loginEndpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });

        const data = await response.json();

        if (data.success) {
            // ✅ Login successful
            handleLoginSuccess(data, rememberMe);
        } else {
            // ❌ Login failed
            showError(data.error || 'Login failed. Please try again.');
            setLoading(false);
        }

    } catch (error) {
        console.error('Login error:', error);
        showError('Connection error. Please check your internet connection and try again.');
        setLoading(false);
    }
}

/**
 * Handle successful login
 */
function handleLoginSuccess(data, rememberMe) {
    // Store token
    saveToken(data.token);
    
    // Store user data
    saveUserData(data.user);
    
    // Handle "Remember Me"
    if (rememberMe) {
        localStorage.setItem(AUTH_CONFIG.rememberKey, data.user.username);
    } else {
        localStorage.removeItem(AUTH_CONFIG.rememberKey);
    }

    // Show success message briefly
    showSuccess('Login successful! Redirecting...');

    // Redirect to dashboard after short delay
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 1000);
}

// ============================================================================
// TOKEN MANAGEMENT
// ============================================================================

/**
 * Save authentication token
 */
function saveToken(token) {
    localStorage.setItem(AUTH_CONFIG.tokenKey, token);
}

/**
 * Get authentication token
 */
function getToken() {
    return localStorage.getItem(AUTH_CONFIG.tokenKey);
}

/**
 * Remove authentication token
 */
function removeToken() {
    localStorage.removeItem(AUTH_CONFIG.tokenKey);
}

/**
 * Check if token is valid (basic check)
 */
function isTokenValid(token) {
    if (!token) return false;

    try {
        // Decode JWT payload
        const parts = token.split('.');
        if (parts.length !== 3) return false;

        const payload = JSON.parse(atob(parts[1]));
        
        // Check expiration
        const now = Math.floor(Date.now() / 1000);
        return payload.exp > now;
    } catch (error) {
        console.error('Token validation error:', error);
        return false;
    }
}

/**
 * Save user data to localStorage
 */
function saveUserData(user) {
    localStorage.setItem(AUTH_CONFIG.userKey, JSON.stringify(user));
}

/**
 * Get user data from localStorage
 */
function getUserData() {
    const data = localStorage.getItem(AUTH_CONFIG.userKey);
    return data ? JSON.parse(data) : null;
}

/**
 * Remove user data
 */
function removeUserData() {
    localStorage.removeItem(AUTH_CONFIG.userKey);
}

/**
 * Load remembered username if exists
 */
function loadRememberedUsername() {
    const rememberedUsername = localStorage.getItem(AUTH_CONFIG.rememberKey);
    if (rememberedUsername && elements.usernameInput) {
        elements.usernameInput.value = rememberedUsername;
        elements.rememberCheckbox.checked = true;
        // Focus password field instead
        if (elements.passwordInput) {
            elements.passwordInput.focus();
        }
    }
}

// ============================================================================
// UI HELPERS
// ============================================================================

/**
 * Show error message
 */
function showError(message) {
    if (elements.errorMessage) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.classList.remove('hidden');
    }
}

/**
 * Hide error message
 */
function hideError() {
    if (elements.errorMessage) {
        elements.errorMessage.classList.add('hidden');
    }
}

/**
 * Show success message
 */
function showSuccess(message) {
    if (elements.errorMessage) {
        elements.errorMessage.textContent = message;
        elements.errorMessage.classList.remove('hidden');
        elements.errorMessage.style.background = '#d4edda';
        elements.errorMessage.style.borderColor = '#c3e6cb';
        elements.errorMessage.style.color = '#155724';
    }
}

/**
 * Set loading state
 */
function setLoading(isLoading) {
    if (elements.loginButton) {
        elements.loginButton.disabled = isLoading;
    }

    if (elements.buttonText) {
        elements.buttonText.classList.toggle('hidden', isLoading);
    }

    if (elements.buttonSpinner) {
        elements.buttonSpinner.classList.toggle('hidden', !isLoading);
    }

    // Disable inputs during loading
    [elements.usernameInput, elements.passwordInput, elements.rememberCheckbox].forEach(input => {
        if (input) {
            input.disabled = isLoading;
        }
    });
}

// ============================================================================
// PUBLIC API (for other scripts to use)
// ============================================================================

window.Auth = {
    getToken,
    getUserData,
    isTokenValid,
    logout: function() {
        removeToken();
        removeUserData();
        window.location.href = 'login.html';
    },
    isAuthenticated: function() {
        const token = getToken();
        return token && isTokenValid(token);
    }
};

// ============================================================================
// EXPORT FOR MODULE USE (if needed)
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.Auth;
}
