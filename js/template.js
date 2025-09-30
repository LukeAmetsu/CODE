/**
 * Injects a shared header and navigation template into the page.
 * This reduces HTML duplication across multiple calculator pages.
 * It now supports a two-level navigation structure.
 *
 * @param {object} options - Configuration for the header.
 * @param {string} options.activePage - The key for the currently active page (e.g., 'wind', 'snow').
 * @param {string} options.pageTitle - The main title to display in the H1 tag.
 * @param {string} options.headerPlaceholderId - The ID of the element where the header will be injected.
 */
async function injectHeader(options) {
    const { activePage, pageTitle, headerPlaceholderId } = options;
    const placeholder = document.getElementById(headerPlaceholderId);

    if (!placeholder) {
        console.error(`Header placeholder with ID "${headerPlaceholderId}" not found.`);
        return;
    }

    // Dynamically determine the path prefix to make links work from any directory level.
    // If we are at the root (e.g., index.html), the prefix is './'.
    // If we are in a subdirectory (e.g., /asce/wind.html), the prefix is '../'.
    const isRoot = window.location.pathname.endsWith('/') || window.location.pathname.endsWith('/index.html');
    const pathPrefix = isRoot ? './' : '../';

    const response = await fetch(`${pathPrefix}js/nav-config.json`);
    const navLinks = await response.json();

    const mainNavLinks = {
        home: { key: 'home', href: `${pathPrefix}index.html`, text: 'Home' },
        us: { key: 'us', href: `${pathPrefix}index.html#us-codes-section`, text: 'US Codes' },
        nbr: { key: 'nbr', href: `${pathPrefix}index.html#nbr-codes-section`, text: 'NBR (Brazil)' }
    };

    // Robustly find the correct set of navigation links
    const trimmedActivePage = activePage.trim().toLowerCase();
    let currentSubNavSetKey;
    // The home page has no sub-navigation, so we only search if it's not the home page.
    if (trimmedActivePage !== 'home') {
        currentSubNavSetKey = Object.keys(navLinks).find(key =>
            navLinks[key] && navLinks[key].some(link => link.key.toLowerCase() === trimmedActivePage)
        );
    }

    // Determine the active main navigation group
    const usKeys = ['asce', 'aisc', 'nds', 'aci'];
    const nbrKeys = ['nbr'];
    let activeMainKey = 'home'; // Default to 'home'
    if (usKeys.includes(currentSubNavSetKey)) {
        activeMainKey = 'us';
    } else if (nbrKeys.includes(currentSubNavSetKey)) {
        activeMainKey = 'nbr';
    }

    const currentSubNavSet = navLinks[currentSubNavSetKey] || [];

    // Add a console log for easier debugging if the issue persists
    if (trimmedActivePage !== 'home' && !currentSubNavSetKey) {
        console.error(`Could not find a navigation set for activePage: '${activePage}'`);
    }

    // Build the navigation HTML using the simple relative href directly
    const subNavHtml = currentSubNavSet.map(link => `
        <a href="${pathPrefix}${link.href}" class="px-4 py-2 text-sm font-medium rounded-md z-10 transition-colors ${link.key === trimmedActivePage ? 'toggle-active' : 'toggle-inactive'}">
            ${link.text}
        </a>
    `).join('');

    const mainNavHtml = Object.values(mainNavLinks).map(link => `
        <a href="${link.href}" class="px-4 py-2 text-sm font-medium rounded-md transition-colors ${link.key === activeMainKey ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}">
            ${link.text}
        </a>
    `).join('');

    // Only render the sub-navigation container if there are links to show.
    const subNavContainerHtml = currentSubNavSet.length > 0 ? `
        <!-- Sub Navigation (within a code family) -->
        <div id="nav-links-container" class="relative flex flex-wrap justify-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
            ${subNavHtml}
        </div>` : '';

    const headerHtml = `
        <header class="text-center mb-8 relative">
            <div class="flex flex-col items-center justify-center mb-6 space-y-4">
                <!-- Main Navigation (US vs NBR) -->
                <div class="relative flex flex-wrap justify-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                    ${mainNavHtml}
                </div>
                ${subNavContainerHtml}
            </div>
            <h1 id="main-title" class="text-3xl md:text-4xl font-bold">${pageTitle}</h1>
            <button id="theme-toggle" type="button" class="text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-4 focus:ring-gray-200 dark:focus:ring-gray-700 rounded-lg text-sm p-2.5 absolute top-0 right-0">
                <svg id="theme-toggle-dark-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"></path></svg>
                <svg id="theme-toggle-light-icon" class="hidden w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.707.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 5.05A1 1 0 003.636 6.464l.707.707a1 1 0 001.414-1.414l-.707-.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 100 2h1z" fill-rule="evenodd" clip-rule="evenodd"></path></svg>
            </button>
        </header>
    `;

    placeholder.innerHTML = headerHtml;
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
        
        <!-- Back to Top Button -->
        <button id="back-to-top-btn" title="Go to top" class="opacity-0 invisible fixed bottom-5 right-5 z-50 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-opacity duration-300 print-hidden">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"></path></svg>
        </button>
    `;

    placeholder.innerHTML = footerHtml;
}