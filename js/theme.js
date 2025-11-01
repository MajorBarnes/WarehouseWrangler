(function () {
    const STORAGE_KEY = 'ww_theme';
    const root = document.documentElement;
    const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');

    const safeLocalStorageGet = (key) => {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            return null;
        }
    };

    const safeLocalStorageSet = (key, value) => {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            /* ignore write failures (private browsing, quota, etc.) */
        }
    };

    const getStoredTheme = () => {
        const stored = safeLocalStorageGet(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
            return stored;
        }
        return null;
    };

    const THEME_STRINGS = {
        light: {
            action: 'Switch to dark theme',
            state: 'Light mode'
        },
        dark: {
            action: 'Switch to light theme',
            state: 'Dark mode'
        }
    };

    let respectSystemPreference = true;

    const applyThemeToDocument = (theme) => {
        const next = theme === 'dark' ? 'dark' : 'light';
        root.dataset.theme = next;
        return next;
    };

    const updateToggleElement = (toggle, theme) => {
        const strings = THEME_STRINGS[theme] || THEME_STRINGS.light;
        const isDark = theme === 'dark';

        toggle.classList.toggle('is-dark', isDark);
        toggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        toggle.setAttribute('aria-label', strings.action);
        toggle.setAttribute('title', strings.action);

        const srLabel = toggle.querySelector('[data-theme-toggle-label]');
        if (srLabel) {
            srLabel.textContent = strings.action;
        }

        const stateLabel = toggle.querySelector('[data-theme-toggle-state]');
        if (stateLabel) {
            stateLabel.textContent = strings.state;
        }
    };

    const updateAllToggles = (theme) => {
        document.querySelectorAll('[data-theme-toggle]').forEach((toggle) => {
            updateToggleElement(toggle, theme);
        });
    };

    const setTheme = (theme, { persist } = { persist: false }) => {
        const applied = applyThemeToDocument(theme);
        updateAllToggles(applied);

        if (persist) {
            respectSystemPreference = false;
            safeLocalStorageSet(STORAGE_KEY, applied);
        }

        return applied;
    };

    const storedPreference = getStoredTheme();
    if (storedPreference) {
        respectSystemPreference = false;
    }

    let currentTheme = setTheme(storedPreference || (systemPreference.matches ? 'dark' : 'light'));

    const handleSystemChange = (event) => {
        if (!respectSystemPreference) {
            return;
        }
        currentTheme = setTheme(event.matches ? 'dark' : 'light');
    };

    if (typeof systemPreference.addEventListener === 'function') {
        systemPreference.addEventListener('change', handleSystemChange);
    } else if (typeof systemPreference.addListener === 'function') {
        systemPreference.addListener(handleSystemChange);
    }

    const ready = (callback) => {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', callback);
        } else {
            callback();
        }
    };

    ready(() => {
        const toggles = document.querySelectorAll('[data-theme-toggle]');
        if (!toggles.length) {
            return;
        }

        toggles.forEach((toggle) => {
            updateToggleElement(toggle, currentTheme);
            toggle.addEventListener('click', () => {
                const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
                currentTheme = setTheme(nextTheme, { persist: true });
            });
        });
    });
})();
