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
        const candidatePaths = [
            '../js/locales/locales.json',
            './js/locales/locales.json',
            'js/locales/locales.json'
        ];
        let loaded = false;
        for (const p of candidatePaths) {
            try {
                const response = await fetch(p);
                if (response.ok) {
                    this.translations = await response.json();
                    loaded = true;
                    break;
                }
            } catch (e) {
                // Continue to next candidate
            }
        }
        if (!loaded) {
            console.error("Fatal Error: Could not load any translation files from candidate paths.");
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
            // Fallback to English if available, otherwise return the formatted key
            return this.translations['en']?.[key] || key;
        }
        return translation;
    }

    /**
     * Alias for get() to maintain compatibility with template.js
     */
    t(key) {
        return this.get(key);
    }

    /**
     * Alias for currentLang to maintain compatibility with template.js
     */
    get currentLocale() {
        return this.currentLang;
    }
}

// --- Global Instance and Initialization ---
// --- Global Instance and Initialization ---
window.i18n = new I18nManager();
// The initialization is now handled by `initializeApp` in shared-utils.js

// Expose a global `getTranslation` function for convenience in other scripts
function getTranslation(key) {
    return window.i18n.get(key);
}