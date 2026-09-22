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
        this.initPromise = null;
        I18nManager.instance = this;
    }

    /**
     * Initializes the manager by detecting the user's language, loading all
     * translation files, and setting up the initial page translation.
     */
    async initialize() {
        if (!this.initPromise) {
            this.initPromise = (async () => {
                this.elementsToTranslate = document.querySelectorAll('[data-i18n]');
                const userLang = localStorage.getItem('language') || navigator.language.split('-')[0];
                this.currentLang = this.supportedLangs.includes(userLang) ? userLang : 'en';
                document.documentElement.lang = this.currentLang;

                await this._loadAllTranslations();
                this.translatePage();
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: this.currentLang } }));
                }
            })();
        }
        return this.initPromise;
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
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: this.currentLang } }));
        }
    }

    /**
     * Translates all elements on the page with a `data-i18n` attribute.
     */
    translatePage() {
        if (!this.translations || Object.keys(this.translations).length === 0) {
            return;
        }
        // Re-query the DOM each time to catch dynamically added elements.
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const val = this.get(key);
            if (val && val !== key) {
                if (element.tagName === 'INPUT' && (element.type === 'button' || element.type === 'submit')) {
                    element.value = val;
                } else {
                    element.textContent = val;
                }
            }
        });

        document.querySelectorAll('[data-i18n-title]').forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            const val = this.get(key);
            if (val && val !== key) {
                element.setAttribute('title', val);
            }
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const val = this.get(key);
            if (val && val !== key) {
                element.setAttribute('placeholder', val);
            }
        });

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pageTranslated', { detail: { lang: this.currentLang } }));
        }
    }

    /**
     * Gets a translation for a given key.
     * @param {string} key - The i18n key.
     * @param {string} [fallback] - Fallback text if key not found or not yet loaded.
     * @returns {string} The translated string, or fallback/formatted key if not found.
     */
    get(key, fallback = null) {
        if (!this.translations || Object.keys(this.translations).length === 0) {
            return fallback !== null ? fallback : key;
        }
        const translation = this.translations[this.currentLang]?.[key];
        if (translation === undefined) {
            // Fallback to English if available, otherwise return fallback or formatted key
            return this.translations['en']?.[key] || (fallback !== null ? fallback : key);
        }
        return translation;
    }

    /**
     * Alias for get() to maintain compatibility with template.js
     */
    t(key, fallback = null) {
        return this.get(key, fallback);
    }

    /**
     * Alias for currentLang to maintain compatibility with template.js
     */
    get currentLocale() {
        return this.currentLang;
    }
}

// --- Global Instance and Initialization ---
window.i18n = new I18nManager();
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.i18n.initialize().catch(e => console.warn('i18n init error:', e));
        });
    } else {
        window.i18n.initialize().catch(e => console.warn('i18n init error:', e));
    }
}

// Expose a global `getTranslation` function for convenience in other scripts
function getTranslation(key, fallback = null) {
    return window.i18n ? window.i18n.get(key, fallback) : (fallback !== null ? fallback : key);
}