/**
 * Manages internationalization (i18n) for the application.
 * This class handles loading language files, setting the current language,
 * and providing translations for keys. It's designed as a singleton
 * to ensure a single source of truth for translations.
 */
class I18nManager {
    constructor() {
        if (I18nManager.instance) {
            return I18nManager.instance;
        }
        this.translations = {};
        this.currentLang = 'en';
        this.supportedLangs = ['en', 'pt', 'es'];
        this.elementsToTranslate = [];
        I18nManager.instance = this;
    }

    /**
     * Initializes the manager by detecting the user's language, loading all
     * translation files, and setting up the initial page translation.
     */
    async initialize() {
        this.elementsToTranslate = document.querySelectorAll('[data-i18n]');
        const userLang = localStorage.getItem('language') || navigator.language.split('-')[0];
        this.currentLang = this.supportedLangs.includes(userLang) ? userLang : 'en';
        document.documentElement.lang = this.currentLang;

        await this._loadAllTranslations();
        this.translatePage();
    }

    /**
     * Loads all language dictionaries from a single JSON file.
     * @private
     */
    async _loadAllTranslations() {
        const isRoot = window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html');
        const pathPrefix = isRoot ? './' : '../';
        try {
            const response = await fetch(`${pathPrefix}js/locales/locales.json`);
            if (!response.ok) throw new Error('Failed to load locales.json');
            this.translations = await response.json();
        } catch (error) {
            console.error("Fatal Error: Could not load any translation files.", error);
            this.translations = { en: { "error_loading": "Error loading content." } };
        }
    }

    /**
     * Changes the current language and re-translates the page.
     * @param {string} lang - The new language code (e.g., 'en', 'pt').
     */
    setLanguage(lang) {
        if (!this.supportedLangs.includes(lang) || !this.translations[lang]) {
            console.warn(`Language '${lang}' is not supported. Defaulting to 'en'.`);
            lang = 'en';
        }
        this.currentLang = lang;
        localStorage.setItem('language', lang);
        document.documentElement.lang = lang;
        this.translatePage();
    }

    /**
     * Translates all elements on the page with a `data-i18n` attribute.
     */
    translatePage() {
        // Re-query the DOM each time to catch dynamically added elements.
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            element.textContent = this.get(key);
        });
    }

    /**
     * Gets a translation for a given key.
     * @param {string} key - The i18n key.
     * @returns {string} The translated string, or a formatted key if not found.
     */
    get(key) {
        const translation = this.translations[this.currentLang]?.[key];
        if (translation === undefined) {
            console.warn(`Translation key not found for lang '${this.currentLang}': ${key}`);
            // Fallback to English if available
            return this.translations['en']?.[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
        return translation;
    }
}

// --- Global Instance and Initialization ---
const i18n = new I18nManager();
// The initialization is now handled by `initializeApp` in shared-utils.js

// Expose a global `getTranslation` function for convenience in other scripts
function getTranslation(key) {
    return i18n.get(key);
}