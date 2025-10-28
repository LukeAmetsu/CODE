async function injectHeader(options) {
    const { activePage, pageTitle, headerPlaceholderId } = options;
    const placeholder = document.getElementById(headerPlaceholderId);

    if (!placeholder) {
        console.error(`Header placeholder with ID "${headerPlaceholderId}" not found.`);
        return;
    }

    const isRoot = window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html');
    const pathPrefix = isRoot ? './' : '../';

    // navConfig is already loaded and available on `window` by initializeApp
    const navConfig = window.NAV_CONFIG;
    if (!navConfig) return;

    // --- Determine Active Navigation State ---
    const activeMainNavItem = navConfig.mainNav.find(item => 
        item.key === activePage || (item.subNav && item.subNav.some(sub => sub.key === activePage))
    ) || navConfig.mainNav.find(item => item.key === 'home');

    const activeMainKey = activeMainNavItem?.key;
    const currentSubNavSet = activeMainNavItem?.subNav || [];

    // --- Build DOM Elements Programmatically ---
    const mainNavLinks = navConfig.mainNav.map(link =>
        createDOMElement('a', {
            href: `${pathPrefix}${link.href}`,
            className: `main-nav-link px-4 py-2 text-sm font-medium rounded-md transition-colors ${link.key === activeMainKey ? 'active' : ''}`
        }, [getTranslation(link.textKey)])
    );

    const subNavLinks = currentSubNavSet.map(link =>
        createDOMElement('a', {
            href: `${pathPrefix}${link.href}`,
            className: `px-4 py-2 text-sm font-medium rounded-md z-10 transition-colors ${link.key === activePage ? 'toggle-active' : 'toggle-inactive'}`
        }, [getTranslation(link.textKey)])
    );

    const languageSelector = createDOMElement('select', { id: 'language-selector', className: 'theme-aware-selector rounded-md p-2 text-sm' }, [
        createDOMElement('option', { value: 'en' }, ['English']),
        createDOMElement('option', { value: 'es' }, ['Español']),
        createDOMElement('option', { value: 'pt' }, ['Português'])
    ]);
    languageSelector.value = i18n.currentLang;

    const themeToggle = createDOMElement('button', { id: 'theme-toggle', type: 'button', className: 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 absolute top-0 right-0' }, [
        `<svg id="theme-toggle-dark-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>`,
        `<svg id="theme-toggle-light-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 5.05A1 1 0 003.636 6.464l.707.707a1 1 0 001.414-1.414l-.707-.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" fill-rule="evenodd" clip-rule="evenodd"></path></svg>`
    ]);

    const header = createDOMElement('header', { className: 'text-center mb-8 relative' }, [
        createDOMElement('div', { className: 'absolute top-0 left-0' }, [languageSelector]),
        themeToggle,
        createDOMElement('div', { className: 'flex flex-col items-center justify-center mb-6 space-y-4 pt-12' }, [
            createDOMElement('div', { className: 'nav-ribbon relative flex flex-wrap justify-center gap-1' }, mainNavLinks),
            ...(subNavLinks.length > 0 ? [createDOMElement('div', { id: 'nav-links-container', className: 'nav-ribbon relative flex flex-wrap justify-center gap-1' }, subNavLinks)] : [])
        ]),
        createDOMElement('h1', { id: 'main-title', className: 'text-3xl md:text-4xl font-bold', 'data-i18n': pageTitle }, [getTranslation(pageTitle)])
    ]);

    placeholder.innerHTML = ''; // Clear placeholder
    placeholder.appendChild(header);

    // Add event listener for the language selector
    document.getElementById('language-selector').addEventListener('change', (e) => {
        i18n.setLanguage(e.target.value);
        // Re-inject the header to update navigation link texts
        injectHeader(options);
    });
}

/**
 * Injects a shared footer template into the page.
 * @param {object} options - Configuration for the footer.
 * @param {string} options.footerPlaceholderId - The ID of the element where the footer will be injected.
 */
function injectFooter(options) {
    const { footerPlaceholderId } = options;
    const placeholder = document.getElementById(footerPlaceholderId);

    if (!placeholder) {
        console.error(`Footer placeholder with ID "${footerPlaceholderId}" not found.`);
        return;
    }

    // Dynamically determine the path prefix to make links work from any directory level.
    const isRoot = window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html');
    const pathPrefix = isRoot ? './' : '../';

    const footerHtml = `
        <footer class="text-center mt-12 py-6 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 print-hidden">
            <p>&copy; ${new Date().getFullYear()} Engineering Calculators. All Rights Reserved.</p>
            <div class="mt-2">
                <a href="${pathPrefix}index.html" class="text-blue-600 hover:underline dark:text-blue-400">Back to Hub</a>
            </div>
            <p class="text-xs mt-4">
                Disclaimer: These tools are for preliminary design and educational purposes only. Always verify results with a licensed professional engineer and the latest code standards.
            </p>
        </footer>
        
        
        <button id="back-to-top-btn" title="Go to top" class="opacity-0 invisible fixed bottom-5 right-5 z-50 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-opacity duration-300 print-hidden">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>
        </button>
    `;

    placeholder.innerHTML = footerHtml;
}
/**
 * Attaches all necessary event listeners to a rendered report container.
 * This includes handling copy, download, and detail-toggling actions.
 * @param {string} containerId - The ID of the main report container.
 * @param {object} config - Configuration options for the event listeners.
 * @param {string} config.reportId - The ID of the specific report content element to be targeted by actions.
 * @param {string} config.filenamePrefix - The prefix for filenames when downloading (e.g., "Wind-Report").
 * @param {function} [config.onSendToCombos] - Optional callback for a "Send to Combos" button.
 * @param {object} [config.toggleTexts] - Optional custom texts for toggle buttons.
 */
function attachReportEventListeners(containerId, config) {
    const { reportId, filenamePrefix, onSendToCombos, toggleTexts } = config;
    const container = document.getElementById(containerId);
    if (!container) return;

    // Use event delegation to handle clicks on dynamically added elements.
    container.addEventListener('click', (event) => {
        const target = event.target;

        // --- Toggle individual details ---
        if (target.matches('.toggle-details-btn')) {
            const detailId = target.dataset.toggleId;
            const detailRow = document.getElementById(detailId);
            if (detailRow) {
                const isVisible = detailRow.classList.toggle('is-visible');
                target.textContent = isVisible ? (toggleTexts?.hide || '[Hide]') : (toggleTexts?.show || '[Show]');
            }
        }

        // --- Copy Section ---
        if (target.matches('.copy-section-btn')) {
            const copyTargetId = target.dataset.copyTargetId;
            if (copyTargetId) {
                handleCopy(copyTargetId);
            }
        }

        // --- Toggle all details ---
        if (target.id === 'toggle-all-details-btn') {
            const shouldShow = target.dataset.state === 'hidden';
            container.querySelectorAll('.details-row').forEach(row => row.classList.toggle('is-visible', shouldShow));
            container.querySelectorAll('.toggle-details-btn').forEach(button => button.textContent = shouldShow ? (toggleTexts?.hide || '[Hide]') : (toggleTexts?.show || '[Show]'));
            target.dataset.state = shouldShow ? 'shown' : 'hidden';
            target.textContent = shouldShow ? (toggleTexts?.hideAll || 'Hide All Details') : (toggleTexts?.showAll || 'Show All Details');
        }

        // --- Copy Report ---
        if (target.id === 'copy-report-btn') {
            handleCopy(reportId);
        }

        // --- Download PDF ---
        if (target.id === 'download-pdf-btn') {
            handleDownloadPdf(reportId, `${filenamePrefix}.pdf`);
        }

        // --- Download Word ---
        if (target.id === 'download-word-btn') {
            handleDownloadWord(reportId, `${filenamePrefix}.doc`);
        }

        // --- Download CSV ---
        if (target.id === 'download-csv-btn') {
            handleDownloadCsv(reportId, `${filenamePrefix}.csv`);
        }

        // --- Custom "Send to Combos" button ---
        if (target.id === 'send-to-combos-btn' && typeof onSendToCombos === 'function') {
            onSendToCombos();
        }
    });
}

// --- Auto-initialize ---
// Initialize the application (header, footer, etc.)
// We assume initializeApp is defined in shared-utils.js, which is loaded before this script.
// The individual calculator scripts will call initializeApp with their specific configs.
// This call is a fallback for pages that might not have a specific script (like index.html).
initializeApp({});