(function (global) {
  'use strict';

  const SUPPORTED_LOCALES = [
    { code: 'en', labelKey: 'app.userMenu.languageOptions.en', fallbackLabel: 'English' },
    { code: 'de', labelKey: 'app.userMenu.languageOptions.de', fallbackLabel: 'Deutsch' },
    { code: 'ru', labelKey: 'app.userMenu.languageOptions.ru', fallbackLabel: 'Русский' }
  ];
  const LOCALE_STORAGE_KEY = 'ww_locale';
  const USER_STORAGE_KEY = 'ww_user_data';

  let initializationPromise = null;

  function normalizeLocale(value) {
    if (!value || typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const lower = trimmed.toLowerCase();
    const direct = SUPPORTED_LOCALES.find(function (entry) {
      return entry.code === lower;
    });
    if (direct) {
      return direct.code;
    }

    const base = lower.split(/[-_]/)[0];
    const fallback = SUPPORTED_LOCALES.find(function (entry) {
      return entry.code === base;
    });
    return fallback ? fallback.code : null;
  }

  function getStoredLocale() {
    try {
      return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    } catch (error) {
      console.warn('[locale] Unable to read stored locale preference', error);
      return null;
    }
  }

  function getUserProfileLocale() {
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return (
        normalizeLocale(parsed.locale) ||
        normalizeLocale(parsed.preferredLocale) ||
        normalizeLocale(parsed.preferred_locale) ||
        normalizeLocale(parsed.language)
      );
    } catch (error) {
      console.warn('[locale] Unable to parse stored user profile for locale preference', error);
      return null;
    }
  }

  function detectBrowserLocale() {
    const navigatorLocales = [];
    if (Array.isArray(navigator.languages)) {
      navigatorLocales.push.apply(navigatorLocales, navigator.languages);
    }
    if (navigator.language) {
      navigatorLocales.push(navigator.language);
    }
    if (navigator.userLanguage) {
      navigatorLocales.push(navigator.userLanguage);
    }

    for (let index = 0; index < navigatorLocales.length; index += 1) {
      const normalized = normalizeLocale(navigatorLocales[index]);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  function determineInitialLocale() {
    return (
      getStoredLocale() ||
      getUserProfileLocale() ||
      detectBrowserLocale() ||
      normalizeLocale(global.I18n && global.I18n.DEFAULT_LOCALE) ||
      SUPPORTED_LOCALES[0].code
    );
  }

  function persistPreferredLocale(locale, options) {
    const opts = options || {};
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch (error) {
      console.warn('[locale] Unable to persist locale to localStorage', error);
    }

    if (opts.skipUserUpdate) {
      return;
    }

    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return;
      }
      if (parsed.locale === locale) {
        return;
      }
      parsed.locale = locale;
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(parsed));
    } catch (error) {
      console.warn('[locale] Unable to persist locale on stored user profile', error);
    }
  }

  function ensureDocumentLang(locale) {
    try {
      if (document && document.documentElement) {
        document.documentElement.setAttribute('lang', locale);
      }
    } catch (error) {
      console.warn('[locale] Unable to update document language attribute', error);
    }
  }

  function translate(key, fallback) {
    if (!key) {
      return fallback || '';
    }

    const i18n = global.I18n;
    if (i18n && typeof i18n.t === 'function') {
      return i18n.t(key, null, { defaultValue: fallback });
    }

    return fallback;
  }

  function updateActiveLocaleOption(activeLocale) {
    const buttons = document.querySelectorAll('[data-locale-option]');
    buttons.forEach(function (button) {
      const code = button.getAttribute('data-locale-option');
      const isActive = code === activeLocale;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  function handleLocaleSelection(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const locale = button.getAttribute('data-locale-option');
    if (!locale) {
      return;
    }

    button.disabled = true;
    applyLocale(locale)
      .catch(function (error) {
        console.error('[locale] Failed to switch locale', error);
      })
      .finally(function () {
        button.disabled = false;
      });
  }

  function renderLocaleSelector() {
    const container = document.querySelector('[data-locale-selector]');
    if (!container) {
      return;
    }

    const activeLocale = getPreferredLocale();
    container.innerHTML = '';
    container.setAttribute('role', 'none');

    const title = document.createElement('p');
    title.className = 'user-menu__section-title';
    title.textContent = translate('app.userMenu.languageLabel', 'Language');
    container.appendChild(title);

    const descriptionText = translate(
      'app.userMenu.languageDescription',
      'Choose how WarehouseWrangler appears.'
    );
    if (descriptionText) {
      const description = document.createElement('p');
      description.className = 'user-menu__section-helper';
      description.textContent = descriptionText;
      container.appendChild(description);
    }

    const list = document.createElement('div');
    list.className = 'user-menu__locale-options';

    SUPPORTED_LOCALES.forEach(function (entry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'user-menu__locale-button';
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('data-locale-option', entry.code);
      button.setAttribute('aria-checked', entry.code === activeLocale ? 'true' : 'false');

      const label = document.createElement('span');
      label.className = 'user-menu__locale-label';
      label.textContent = translate(entry.labelKey, entry.fallbackLabel);

      const code = document.createElement('span');
      code.className = 'user-menu__locale-code';
      code.textContent = entry.code.toUpperCase();

      button.appendChild(label);
      button.appendChild(code);

      button.addEventListener('click', handleLocaleSelection);
      list.appendChild(button);
    });

    container.appendChild(list);
    updateActiveLocaleOption(activeLocale);
  }

  async function applyLocale(locale) {
    const normalized = normalizeLocale(locale) || (global.I18n && global.I18n.DEFAULT_LOCALE) || SUPPORTED_LOCALES[0].code;
    await init();

    if (global.I18n && typeof global.I18n.getLocale === 'function') {
      const current = normalizeLocale(global.I18n.getLocale());
      if (current === normalized) {
        persistPreferredLocale(normalized);
        ensureDocumentLang(normalized);
        updateActiveLocaleOption(normalized);
        if (global.I18n && typeof global.I18n.translateTree === 'function') {
          global.I18n.translateTree();
        }
        return normalized;
      }
    }

    if (global.I18n && typeof global.I18n.setLocale === 'function') {
      await global.I18n.setLocale(normalized);
    }
    persistPreferredLocale(normalized);
    ensureDocumentLang(normalized);
    updateActiveLocaleOption(normalized);
    return normalized;
  }

  function getPreferredLocale() {
    if (global.I18n && typeof global.I18n.getLocale === 'function') {
      const active = normalizeLocale(global.I18n.getLocale());
      if (active) {
        return active;
      }
    }

    const stored = getStoredLocale();
    if (stored) {
      return stored;
    }

    const profile = getUserProfileLocale();
    if (profile) {
      return profile;
    }

    return normalizeLocale(global.I18n && global.I18n.DEFAULT_LOCALE) || SUPPORTED_LOCALES[0].code;
  }

  function init() {
    if (initializationPromise) {
      return initializationPromise;
    }

    if (!global.I18n) {
      initializationPromise = Promise.reject(new Error('I18n helper is required before initializing locales.'));
      return initializationPromise;
    }

    const initialLocale = determineInitialLocale();

    initializationPromise = (async function () {
      try {
        const preload = SUPPORTED_LOCALES
          .map(function (entry) { return entry.code; })
          .filter(function (code) { return code !== global.I18n.DEFAULT_LOCALE; });

        const result = await global.I18n.init({
          locale: initialLocale,
          preload: preload
        });

        const resolved = normalizeLocale(result && result.locale) || normalizeLocale(initialLocale) || global.I18n.DEFAULT_LOCALE;
        persistPreferredLocale(resolved);
        ensureDocumentLang(resolved);
        renderLocaleSelector();
        if (typeof global.I18n.translateTree === 'function') {
          global.I18n.translateTree();
        }

        if (typeof global.I18n.onChange === 'function') {
          global.I18n.onChange(function (locale) {
            const normalized = normalizeLocale(locale) || global.I18n.DEFAULT_LOCALE;
            persistPreferredLocale(normalized);
            ensureDocumentLang(normalized);
            renderLocaleSelector();
            updateActiveLocaleOption(normalized);
            if (typeof global.I18n.translateTree === 'function') {
              global.I18n.translateTree();
            }
          });
        }

        return resolved;
      } catch (error) {
        console.error('[locale] Failed to initialize locale manager', error);
        const fallback = normalizeLocale(initialLocale) || global.I18n.DEFAULT_LOCALE;
        persistPreferredLocale(fallback);
        ensureDocumentLang(fallback);
        renderLocaleSelector();
        if (typeof global.I18n.translateTree === 'function') {
          global.I18n.translateTree();
        }
        return fallback;
      }
    })();

    return initializationPromise;
  }

  function setPreferredLocale(locale, options) {
    const normalized = normalizeLocale(locale);
    if (!normalized) {
      return null;
    }

    const opts = options || {};
    persistPreferredLocale(normalized, { skipUserUpdate: !!opts.skipUserUpdate });
    ensureDocumentLang(normalized);
    updateActiveLocaleOption(normalized);

    if (opts.skipApply) {
      return normalized;
    }

    return applyLocale(normalized);
  }

  const api = {
    init: init,
    applyLocale: applyLocale,
    setPreferredLocale: setPreferredLocale,
    getPreferredLocale: getPreferredLocale,
    normalizeLocale: normalizeLocale,
    getSupportedLocales: function () {
      return SUPPORTED_LOCALES.slice();
    }
  };

  global.LocaleManager = api;

  function bootstrap() {
    if (!global.I18n) {
      console.error('[locale] I18n helper is required before initializing LocaleManager.');
      return;
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})(window);
