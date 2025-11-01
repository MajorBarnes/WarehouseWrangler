(function (global) {
  'use strict';

  const DEFAULT_LOCALE = 'en';
  const LOCALE_PATH = 'locales';

  const localeCache = new Map();
  const changeListeners = new Set();

  let activeLocale = DEFAULT_LOCALE;
  let defaultDictionary = {};
  let activeDictionary = {};

  async function fetchLocaleDictionary(locale) {
    if (localeCache.has(locale)) {
      return localeCache.get(locale);
    }

    const url = `${LOCALE_PATH}/${locale}.json`;

    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to load locale file: ${response.status}`);
      }
      const data = await response.json();
      localeCache.set(locale, data);
      return data;
    } catch (error) {
      console.warn(`[i18n] Unable to load locale "${locale}" from ${url}`, error);
      const emptyDictionary = {};
      localeCache.set(locale, emptyDictionary);
      return emptyDictionary;
    }
  }

  function resolveKey(dictionary, key) {
    if (!key) {
      return undefined;
    }

    return key.split('.').reduce(function (value, part) {
      if (value && Object.prototype.hasOwnProperty.call(value, part)) {
        return value[part];
      }
      return undefined;
    }, dictionary);
  }

  function formatMessage(template, replacements) {
    if (typeof template !== 'string') {
      return template;
    }

    if (!replacements) {
      return template;
    }

    return template.replace(/\{(\w+)\}/g, function (match, token) {
      return Object.prototype.hasOwnProperty.call(replacements, token)
        ? replacements[token]
        : match;
    });
  }

  function translate(key, replacements, options) {
    const opts = options || {};
    const localeDictionary = opts.localeDictionary || activeDictionary;
    const fallbackDictionary = opts.fallbackDictionary || defaultDictionary;

    let template = resolveKey(localeDictionary, key);

    if (template === undefined && fallbackDictionary && fallbackDictionary !== localeDictionary) {
      template = resolveKey(fallbackDictionary, key);
    }

    if (template === undefined) {
      return opts.defaultValue !== undefined ? opts.defaultValue : key;
    }

    return formatMessage(template, replacements);
  }

  function applyText(element, key, replacements, options) {
    if (!element) {
      return;
    }
    element.textContent = translate(key, replacements, options);
  }

  function applyHTML(element, key, replacements, options) {
    if (!element) {
      return;
    }
    element.innerHTML = translate(key, replacements, options);
  }

  function applyAttribute(element, attribute, key, replacements, options) {
    if (!element) {
      return;
    }
    const value = translate(key, replacements, options);
    if (value !== undefined) {
      element.setAttribute(attribute, value);
    }
  }

  function applyPlaceholder(element, key, replacements, options) {
    applyAttribute(element, 'placeholder', key, replacements, options);
  }

  function applyTitle(element, key, replacements, options) {
    applyAttribute(element, 'title', key, replacements, options);
  }

  function translateTree(root, options) {
    const context = options || {};
    const elements = (root || document).querySelectorAll('[data-i18n]');

    elements.forEach(function (element) {
      const key = element.getAttribute('data-i18n');
      const attr = element.getAttribute('data-i18n-attr');
      const jsonReplacements = element.getAttribute('data-i18n-args');
      let replacements;

      if (jsonReplacements) {
        try {
          replacements = JSON.parse(jsonReplacements);
        } catch (error) {
          console.warn('[i18n] Failed to parse replacements for', key, error);
        }
      }

      if (attr) {
        applyAttribute(element, attr, key, replacements, context);
      } else {
        applyText(element, key, replacements, context);
      }
    });
  }

  function notifyLocaleChange(locale) {
    changeListeners.forEach(function (listener) {
      try {
        listener(locale);
      } catch (error) {
        console.error('[i18n] Locale change listener failed', error);
      }
    });
  }

  async function setLocale(locale) {
    const dictionary = await fetchLocaleDictionary(locale);
    activeLocale = locale;
    activeDictionary = dictionary;
    notifyLocaleChange(locale);
    return dictionary;
  }

  async function init(options) {
    const opts = options || {};
    const locale = opts.locale || DEFAULT_LOCALE;
    const preload = Array.isArray(opts.preload) ? opts.preload : [];

    defaultDictionary = await fetchLocaleDictionary(DEFAULT_LOCALE);

    await Promise.all(
      preload
        .filter(function (code) { return code && code !== DEFAULT_LOCALE; })
        .map(fetchLocaleDictionary)
    );

    if (locale !== DEFAULT_LOCALE) {
      await fetchLocaleDictionary(locale);
    }

    await setLocale(locale);

    return {
      locale: activeLocale,
      dictionary: activeDictionary
    };
  }

  function onLocaleChange(callback) {
    if (typeof callback !== 'function') {
      return function () {};
    }
    changeListeners.add(callback);
    return function () {
      changeListeners.delete(callback);
    };
  }

  const api = {
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    init: init,
    setLocale: setLocale,
    getLocale: function () { return activeLocale; },
    t: translate,
    text: applyText,
    html: applyHTML,
    attr: applyAttribute,
    placeholder: applyPlaceholder,
    title: applyTitle,
    translateTree: translateTree,
    onChange: onLocaleChange,
    format: formatMessage
  };

  global.I18n = api;
})(window);
