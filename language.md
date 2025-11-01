# Localization Architecture Guide

This document explains how the `js/i18n.js` helper loads locale dictionaries, resolves keys with graceful fallbacks, and how upcoming HTML and JavaScript updates should consume the helper to present language-specific UI copy.

## Helper overview (`js/i18n.js`)

### Loading dictionaries
- Dictionaries live in `locales/<locale>.json` (e.g., `locales/en.json`, `locales/de.json`).
- `I18n.init({ locale, preload })` loads the English fallback dictionary first, then optionally preloads any other locales before activating the requested locale.
- Each locale file is fetched on demand and cached for reuse during the session. A failed fetch logs a warning and falls back to an empty dictionary so the UI remains functional.

### Locale selection and change notifications
- `I18n.init` activates the initial locale and returns the resolved locale/dictionary pair.
- `I18n.setLocale(locale)` swaps the active dictionary at runtime and triggers all registered change listeners.
- `I18n.onChange(callback)` allows feature modules to respond when the locale changes (e.g., re-render DOM fragments or refresh screen readers). The returned function removes the listener.

### Key resolution and formatting
- Keys support dotted paths (e.g., `filters.status.pending`). Nested objects inside the JSON dictionaries follow the same structure.
- `I18n.t(key, replacements?, options?)` retrieves the string from the active dictionary. If a key is missing, the helper looks it up in the English fallback before returning either a provided `defaultValue` or the key itself.
- Placeholder variables use `{token}` syntax. Provide replacements as `{ token: 'value' }`; unresolved tokens remain unchanged so missing replacements are obvious during testing.

### DOM utilities
The helper exposes convenience methods so modules avoid repetitive boilerplate:
- `I18n.text(element, key, replacements?)` → sets `textContent`.
- `I18n.html(element, key, replacements?)` → sets `innerHTML` for markup-aware strings.
- `I18n.placeholder(element, key, replacements?)` → updates the `placeholder` attribute.
- `I18n.attr(element, attrName, key, replacements?)` / `I18n.title` cover other attribute-based strings.
- `I18n.translateTree(root?, options?)` walks all descendants with `data-i18n` (and optional `data-i18n-attr` / `data-i18n-args`) and populates them in one call—useful after initial render or when swapping locales.

## Implementing translations in HTML
1. Replace hard-coded strings with structural placeholders and add `data-i18n="key.path"` attributes.
2. For attributes (e.g., `placeholder`, `aria-label`), pair the key with `data-i18n-attr="placeholder"`.
3. When inline variables are needed, store a JSON object in `data-i18n-args`—it will be parsed and passed to the formatter.
4. Ensure each page loads `js/i18n.js` before invoking `I18n.translateTree`. Pages that depend on authenticated user data should initialize the locale immediately after verifying the token.

## Implementing translations in JavaScript modules
1. Import the helper by loading `js/i18n.js` before other modules or by accessing the global `window.I18n`.
2. Replace literal UI strings (alerts, toasts, button labels) with `I18n.t('key.path')`. Supply replacements for dynamic fragments (`I18n.t('shipments.count', { count })`).
3. Use `I18n.text`, `I18n.placeholder`, or `I18n.attr` when populating DOM nodes programmatically.
4. Subscribe to `I18n.onChange` when the module renders reusable widgets so they refresh automatically when the locale switches.
5. For fetch error handling, prefer localized keys that describe the issue rather than embedding new sentences inline.

## Dictionary authoring guidelines
- Keep English (`en.json`) exhaustive—other locales inherit from it.
- Organize keys by feature and context: `cartons.table.headers.location`, `shipments.filters.status`, etc.
- Avoid translating values that are IDs, API payloads, or database fields—translate only user-facing labels.
- When a translation is pending, leave the value blank or copy the English string. Missing keys fall back to English automatically, so incomplete dictionaries do not break the UI.

## Next steps
- Inventory every visible string per page and map it to a descriptive key namespace.
- Populate `locales/en.json` with the complete English copy, then create `de.json` and `ru.json` using the same structure.
- Add locale persistence (e.g., `localStorage` or server-side profile preference) and UI controls for switching languages.
