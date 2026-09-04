// ===================================================================================
// Template Injection Script
// Handles dynamic loading of Header and Footer
// ===================================================================================

/**
 * Helper to format a raw key into a readable title if translation fails.
 * e.g., "us_codes" -> "Us Codes", "steel-check" -> "Steel Check"
 */
function formatKeyToTitle(key) {
    if (!key) return '';
    // Replace underscores and hyphens with spaces
    let text = key.replace(/[_-]/g, ' ');
    // Simple Title Case implementation
    return text.replace(/\w\S*/g, (w) => (w.replace(/^\w/, (c) => c.toUpperCase())));
}

/**
 * Safely tries to translate a key, falling back to a formatted version of the key.
 */
function safeTranslate(key, defaultText) {
    if (window.i18n && typeof window.i18n.t === 'function') {
        const translated = window.i18n.t(key);
        // If translation returns the key itself (common in some libs) or is falsy, fall back
        if (translated && translated !== key) return translated;
    }
    return defaultText || formatKeyToTitle(key);
}

/**
 * Injects the header into the specified placeholder element.
 * @param {object} config - Configuration for the header.
 * @param {string} config.activePage - The key of the active page for highlighting.
 * @param {string} config.pageTitle - The i18n key for the page title.
 * @param {string} config.headerPlaceholderId - The ID of the placeholder element.
 * @param {string} config.pathPrefix - The path prefix to reach the root directory (e.g., '../').
 */
async function injectHeader(config) {
    const { activePage, pageTitle, headerPlaceholderId = 'header-placeholder', pathPrefix = './' } = config;
    const placeholder = document.getElementById(headerPlaceholderId);
    if (!placeholder) return;

    // Fetch navigation config if not already loaded globally
    let navConfig = window.NAV_CONFIG;
    if (!navConfig) {
        const candidatePaths = [
            `${pathPrefix.replace(/\/+$/, '')}/js/nav-config.json`,
            '../js/nav-config.json',
            './js/nav-config.json',
            'js/nav-config.json'
        ];
        for (const p of candidatePaths) {
            try {
                const response = await fetch(p);
                if (response.ok) {
                    navConfig = await response.json();
                    window.NAV_CONFIG = navConfig;
                    break;
                }
            } catch (e) {
                // Try next
            }
        }
        if (!navConfig) {
            console.error("Failed to load nav-config.json from any candidate path");
            navConfig = { mainNav: [] };
        }
    }

    // --- LOGIC TO FIND ACTIVE SECTION AND SIBLINGS ---
    // Get current filename (e.g., "wind.html")
    const currentPath = window.location.pathname;
    // Handle root path or empty filename
    let currentFilename = decodeURIComponent(currentPath.substring(currentPath.lastIndexOf('/') + 1));
    if (currentFilename === '') currentFilename = 'index.html'; // Default to index if root
    
    // Normalize logic: remove extension for looser matching if needed, but strict is okay for now.
    
    // Find the active item in the navigation tree
    let activeItem = null;
    let activeParent = null;

    // Iterate through main nav items
    for (const item of navConfig.mainNav) {
        // Check if the item itself matches (for top-level links without subnav)
        // Robust check: endsWith or exact match
        if (item.href && (item.href.endsWith(currentFilename) || item.href === currentFilename)) {
            activeItem = item;
            activeParent = item; // It's its own parent in a way
            break;
        }
        // Check sub-items
        if (item.subNav) {
            const found = item.subNav.find(sub => sub.href && (sub.href.endsWith(currentFilename) || sub.href === currentFilename));
            if (found) {
                activeItem = found;
                activeParent = item;
                break;
            }
        }
    }

    // If found, use the parent's key for the main active state
    const mainActiveKey = activeParent ? activeParent.key : activePage;

    // --- GENERATE HTML ---

    // Generate Main Nav Links
    const mainNavLinks = navConfig.mainNav.map(item => {
        const isActive = item.key === mainActiveKey;
        const activeClass = isActive ? 'text-blue-600 dark:text-blue-400 font-bold border-b-2 border-blue-600 dark:border-blue-400' : 'text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400';

        // Use safeTranslate with fallback
        const text = safeTranslate(item.textKey);

        return `<a href="${pathPrefix}${item.href}" class="${activeClass} px-3 py-2 transition-colors duration-200 whitespace-nowrap flex-shrink-0">${text}</a>`;
    }).join('');

    // Generate Secondary Nav (Sub-navigation)
    let subNavHtml = '';
    if (activeParent && activeParent.subNav && activeParent.subNav.length > 0) {
        const subNavLinks = activeParent.subNav.map(item => {
            // Check against filename again for sub-nav highlighting
            const isSubActive = item.href.endsWith(currentFilename);
            const subActiveClass = isSubActive ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700';

            // Use safeTranslate with fallback
            const text = safeTranslate(item.textKey);

            return `
                <a href="${pathPrefix}${item.href}" class="${subActiveClass} group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 whitespace-nowrap flex-shrink-0">
                    <span class="truncate">${text}</span>
                </a>
            `;
        }).join('');

        // Title of the current section (e.g., "US Codes" or "NBR Brazil")
        const sectionTitle = safeTranslate(activeParent.textKey);

        // Ensure w-full is used to span width
        subNavHtml = `
            <div class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 w-full">
                <div class="container mx-auto px-4 max-w-full">
                    <div class="flex items-center h-12 overflow-x-auto no-scrollbar space-x-2">
                        <span class="text-xs font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap mr-2 left-0 bg-gray-50 dark:bg-gray-900 z-10 pl-1 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">${sectionTitle}:</span>
                        ${subNavLinks}
                    </div>
                </div>
            </div>
        `;
    }

    // Logo/Brand text
    const brandText = safeTranslate('engineering_hub', 'Engineering Hub');

    // Determine if we are on the launcher index page
    const isIndexPage = currentFilename === 'index.html';

    const headerHTML = `
    <!-- Skip to Content Link for Accessibility -->
    <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-[100] focus:p-4 focus:bg-white focus:text-blue-600 focus:font-bold">
        Skip to main content
    </a>

    <header class="bg-white dark:bg-gray-800 shadow-sm transition-colors duration-300 relative w-full bottom-5 z-50 flex flex-col">
        <!-- Top Navigation Bar -->
        <nav class="container mx-auto px-4 h-16 flex items-center justify-between w-full">
            
            <!-- Left: Logo / Brand (Always fixed size, never shrinks) -->
            <div class="flex items-center flex-shrink-0 mr-4">
                <a href="${pathPrefix}gui/index.html" class="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                    <svg class="w-7 h-7 text-blue-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    <span class="whitespace-nowrap hidden sm:inline">${brandText}</span>
                </a>
            </div>

            <!-- Center: Main Navigation -->
            <div class="hidden md:flex flex-1 items-center justify-start overflow-x-auto w-full min-w-0 mx-2">
                ${mainNavLinks}
            </div>

            <!-- Right: Actions (Fixed size, anchored to right) -->
            <div class="flex items-center space-x-2 flex-shrink-0 ml-4">
                <!-- Save & Load Project Buttons -->
                ${!isIndexPage ? `
                <div class="flex items-center space-x-1.5 mr-1">
                    <button type="button" id="header-save-btn" onclick="window.universalSaveProject()" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer" title="Save Project Inputs (JSON)">
                        <span>💾</span>
                        <span class="hidden sm:inline" data-i18n="save">Save</span>
                    </button>
                    <button type="button" id="header-load-btn" onclick="document.getElementById('universal-project-input').click()" class="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer" title="Load Project Inputs (JSON)">
                        <span>📂</span>
                        <span class="hidden sm:inline" data-i18n="load">Load</span>
                    </button>
                    <input type="file" id="universal-project-input" accept=".json,.txt" onchange="window.universalLoadProject(event)" class="hidden">
                </div>
                ` : ''}

                <!-- Language Selector -->
                <div class="relative">
                    <select id="language-selector" onchange="i18n.setLanguage(this.value)" class="bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-auto p-1.5 cursor-pointer">
                        <option value="en">EN</option>
                        <option value="pt">PT</option>
                        <option value="es">ES</option>
                    </select>
                </div>

                <!-- Theme Toggle -->
                <button id="theme-toggle" type="button" class="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5">
                    <svg id="theme-toggle-dark-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                    <svg id="theme-toggle-light-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" fill-rule="evenodd" clip-rule="evenodd"></path></svg>
                </button>

                <!-- Mobile Menu Button -->
                <button data-collapse-toggle="mobile-menu" type="button" class="inline-flex items-center p-2 text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600" aria-controls="mobile-menu" aria-expanded="false">
                    <span class="sr-only">Open main menu</span>
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>
                </button>
            </div>
        </nav>

        <!-- Mobile Menu (Hidden by default) -->
        <div class="hidden md:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 w-full" id="mobile-menu">
            ${!isIndexPage ? `
            <div class="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <button type="button" onclick="window.universalSaveProject()" class="flex-1 text-xs font-semibold py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5 shadow-sm">
                    <span>💾</span> <span data-i18n="save_project">Save Project</span>
                </button>
                <button type="button" onclick="document.getElementById('universal-project-input').click()" class="flex-1 text-xs font-semibold py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5 shadow-sm">
                    <span>📂</span> <span data-i18n="load_project">Load Project</span>
                </button>
            </div>
            ` : ''}
            <ul class="flex flex-col font-medium p-4 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:space-x-8 md:mt-0 md:text-sm md:font-medium md:border-0 md:bg-white dark:bg-gray-800 md:dark:bg-gray-900 dark:border-gray-700">
                ${mainNavLinks.replace(/px-3 py-2/g, 'block py-2 pr-4 pl-3 rounded')} <!-- Adjust classes for mobile -->
            </ul>
        </div>
        
        <!-- Sub Navigation (Injected if active parent has children) -->
        ${subNavHtml}
    </header>
    `;

    placeholder.innerHTML = headerHTML;

    // Re-initialize UI logic for the newly injected elements
    // We wait a tick to ensure DOM is updated
    setTimeout(() => {
        if (typeof initializeThemeToggle === 'function') initializeThemeToggle();
        // Initialize mobile menu toggle
        const btn = document.querySelector('[data-collapse-toggle="mobile-menu"]');
        const menu = document.getElementById('mobile-menu');
        if (btn && menu) {
            btn.addEventListener('click', () => {
                menu.classList.toggle('hidden');
            });
        }
        // Set initial language selection
        const langSelect = document.getElementById('language-selector');
        if (langSelect && window.i18n && window.i18n.currentLocale) {
            langSelect.value = window.i18n.currentLocale;
        }

        // Initialize in-page save/load buttons if present
        initializeSaveLoadBindings();

        // Translate injected header elements
        if (window.i18n && typeof window.i18n.translatePage === 'function') {
            window.i18n.translatePage();
        }
    }, 0);
}

/**
 * Modern floating toast notification
 */
function showUniversalToast(message, isError = false) {
    let toast = document.getElementById('universal-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'universal-toast';
        document.body.appendChild(toast);
    }
    toast.className = `fixed bottom-6 right-6 z-[9999] px-4 py-3 rounded-xl shadow-2xl text-sm font-semibold transition-all duration-300 transform flex items-center gap-2.5 border ${
        isError
            ? 'bg-rose-600 text-white border-rose-700'
            : 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 border-gray-700 dark:border-gray-200'
    }`;
    toast.innerHTML = `<span>${isError ? '⚠️' : '✅'}</span> <span>${message}</span>`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(window._universalToastTimeout);
    window._universalToastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
    }, 3200);
}

/**
 * Universal Project Save Handler
 * Checks for custom page exporters or performs deep DOM form serialization
 */
window.universalSaveProject = function () {
    // Check for custom save handlers on the page
    if (typeof window.saveProjectJSON === 'function') {
        return window.saveProjectJSON();
    }
    if (typeof window.exportProjectJSON === 'function') {
        return window.exportProjectJSON();
    }
    if (typeof window.saveProject === 'function') {
        return window.saveProject();
    }

    const currentPath = window.location.pathname;
    let pageName = decodeURIComponent(currentPath.substring(currentPath.lastIndexOf('/') + 1)).replace(/\.[^/.]+$/, "");
    if (!pageName || pageName === 'index') pageName = 'project';

    const inputs = {};
    const elements = document.querySelectorAll('input, select, textarea');
    let inputCount = 0;

    elements.forEach(el => {
        if (el.type === 'file' || el.id === 'universal-project-input' || el.id === 'file-input') return;
        const key = el.id || el.name;
        if (!key) return;

        if (el.type === 'checkbox') {
            inputs[key] = el.checked;
        } else if (el.type === 'radio') {
            if (el.checked) {
                inputs[key] = el.value;
            }
        } else {
            inputs[key] = el.value;
        }
        inputCount++;
    });

    // Capture active tabs / view toggles
    const activeTabs = document.querySelectorAll('.tab-btn.active, .nav-tab.active, .view-btn.active, [data-tab].active');
    const tabTargets = Array.from(activeTabs).map(t => t.dataset.target || t.dataset.view || t.dataset.tab || t.id).filter(Boolean);

    const projectData = {
        app: "EngineeringHub",
        page: pageName,
        title: document.title,
        timestamp: new Date().toISOString(),
        activeTabs: tabTargets,
        inputs: inputs
    };

    const jsonStr = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `${pageName.replace(/\s+/g, '_')}_project_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showUniversalToast(`Project saved! (${inputCount} fields exported)`);
};

/**
 * Universal Project Load Handler
 * Restores inputs, triggers reactive events, switches tabs, and re-calculates
 */
window.universalLoadProject = function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Check for custom load handlers on the page
    if (typeof window.loadProjectJSON === 'function') {
        return window.loadProjectJSON(event);
    }
    if (typeof window.importProjectJSON === 'function') {
        return window.importProjectJSON(event);
    }
    if (typeof window.loadProject === 'function') {
        return window.loadProject(event);
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            const inputs = parsed.inputs || parsed;

            let restoredCount = 0;
            for (const [key, val] of Object.entries(inputs)) {
                if (key.startsWith('_')) continue;
                let el = document.getElementById(key) || document.querySelector(`[name="${key}"]`);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = Boolean(val);
                    } else if (el.type === 'radio') {
                        const radio = document.querySelector(`input[name="${el.name}"][value="${val}"]`);
                        if (radio) radio.checked = true;
                    } else {
                        el.value = val;
                    }
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    restoredCount++;
                }
            }

            // Restore active tabs if saved
            if (parsed.activeTabs && Array.isArray(parsed.activeTabs)) {
                parsed.activeTabs.forEach(target => {
                    const tabBtn = document.querySelector(`[data-target="${target}"]`) ||
                                   document.querySelector(`[data-view="${target}"]`) ||
                                   document.querySelector(`[data-tab="${target}"]`) ||
                                   document.getElementById(target);
                    if (tabBtn) tabBtn.click();
                });
            }

            // Trigger primary calculation button if available
            setTimeout(() => {
                const runBtn = document.getElementById('run-check-btn') ||
                               document.getElementById('run-steel-check-btn') ||
                               document.getElementById('calculate-btn') ||
                               document.getElementById('calculateBtn') ||
                               document.getElementById('calculate_btn') ||
                               document.getElementById('btn-calculate') ||
                               document.getElementById('btn-run-check') ||
                               document.getElementById('btn-run-fea') ||
                               document.getElementById('generate-btn') ||
                               document.querySelector('button[type="submit"]') ||
                               document.querySelector('.run-calculation-btn');

                if (runBtn && typeof runBtn.click === 'function') {
                    runBtn.click();
                } else if (typeof window.triggerCalculation === 'function') {
                    window.triggerCalculation();
                } else if (typeof window.runCheck === 'function') {
                    window.runCheck();
                }
            }, 200);

            showUniversalToast(`Project loaded! (${restoredCount} fields restored)`);
        } catch (err) {
            console.error('Failed to parse project file:', err);
            showUniversalToast('Error loading file. Invalid JSON format.', true);
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
};

/**
 * Automatically binds or hides any existing in-page Save/Load buttons to avoid duplicates
 */
function initializeSaveLoadBindings() {
    const hasHeaderButtons = !!document.getElementById('header-save-btn');
    const pageSaveBtn = document.getElementById('save-inputs-btn');
    const pageLoadBtn = document.getElementById('load-inputs-btn');

    if (hasHeaderButtons) {
        // Hide redundant in-page save/load buttons to prevent duplicate rendering
        if (pageSaveBtn) pageSaveBtn.style.display = 'none';
        if (pageLoadBtn) pageLoadBtn.style.display = 'none';
    } else {
        if (pageSaveBtn && !pageSaveBtn.hasAttribute('data-universal-bound')) {
            pageSaveBtn.setAttribute('data-universal-bound', 'true');
            pageSaveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                window.universalSaveProject();
            });
        }

        if (pageLoadBtn && !pageLoadBtn.hasAttribute('data-universal-bound')) {
            pageLoadBtn.setAttribute('data-universal-bound', 'true');
            pageLoadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const input = document.getElementById('universal-project-input') || document.getElementById('file-input');
                if (input) input.click();
            });
        }
    }

    const pageFileInput = document.getElementById('file-input');
    if (pageFileInput && !pageFileInput.hasAttribute('data-universal-bound')) {
        pageFileInput.setAttribute('data-universal-bound', 'true');
        pageFileInput.setAttribute('accept', '.json,.txt');
        pageFileInput.addEventListener('change', (e) => {
            window.universalLoadProject(e);
        });
    }
}

// Global DOM ready listener for bindings
document.addEventListener('DOMContentLoaded', initializeSaveLoadBindings);

// Explicitly attach to window to prevent reference errors in other scripts
window.injectHeader = injectHeader;
window.injectFooter = injectFooter;
window.showUniversalToast = showUniversalToast;
window.initializeSaveLoadBindings = initializeSaveLoadBindings;

/**
 * Injects the footer into the specified placeholder element.
 * @param {object} config - Configuration for the footer.
 * @param {string} config.footerPlaceholderId - The ID of the placeholder element.
 */
async function injectFooter(config) {
    const { footerPlaceholderId = 'footer-placeholder', pathPrefix = './' } = config;
    const placeholder = document.getElementById(footerPlaceholderId);
    if (!placeholder) return;

    const footerHTML = `
    <footer class="bg-white dark:bg-gray-800 rounded-lg shadow m-4 mt-12">
        <div class="w-full mx-auto max-w-screen-xl p-4 md:flex md:items-center md:justify-between">
            <span class="text-sm text-gray-500 sm:text-center dark:text-gray-400">© ${new Date().getFullYear()} <a href="${pathPrefix}gui/index.html" class="hover:underline">Engineering Hub™</a>. All Rights Reserved.
            </span>
            <ul class="flex flex-wrap items-center mt-3 text-sm font-medium text-gray-500 dark:text-gray-400 sm:mt-0">
                <li>
                    <a href="#" class="hover:underline me-4 md:me-6">About</a>
                </li>
                <li>
                    <a href="#" class="hover:underline me-4 md:me-6">Privacy Policy</a>
                </li>
                <li>
                    <a href="#" class="hover:underline me-4 md:me-6">Licensing</a>
                </li>
                <li>
                    <a href="#" class="hover:underline">Contact</a>
                </li>
            </ul>
        </div>
        <!-- Back to Top Button -->
        <button id="back-to-top-btn" class="fixed bottom-8 right-8 bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 transition-all duration-300 opacity-0 invisible z-50" aria-label="Back to top">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>
        </button>
    </footer>
    `;

    placeholder.innerHTML = footerHTML;

    // Initialize Back to Top button logic if shared-utils is loaded
    if (typeof initializeBackToTopButton === 'function') {
        initializeBackToTopButton();
    }
}

// Explicitly attach to window to prevent reference errors in other scripts
window.injectHeader = injectHeader;
window.injectFooter = injectFooter;