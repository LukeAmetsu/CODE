// ===================================================================================
// Shared Utility Functions
// This file contains functions and utilities used across multiple calculation pages.
// ===================================================================================

// Global function definitions (Ensuring global access as per standard JS practices in HTML pages)

/**
 * Retrieves the numeric value of an input element by its ID.
 * If the value is empty or non-numeric, it returns 0 or null as appropriate.
 * @param {string} id The ID of the input element.
 * @returns {number|null} The numeric value, or null if conversion fails.
 */
function getInputValue(id) {
    const element = document.getElementById(id);
    if (element) {
        const value = parseFloat(element.value);
        return isNaN(value) ? null : value;
    }
    return null;
}

/**
 * Sets the value and optional visibility of an output element.
 * @param {string} id The ID of the output element (usually a span or div).
 * @param {string|number} value The value to display.
 * @param {boolean} [show=true] Whether to show the element's parent container (if it exists).
 */
function setOutputValue(id, value, show = true) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;

        // Optionally show the container/result block
        const container = element.closest('.result-block'); // Assuming a common container class
        if (container) {
            container.style.display = show ? 'block' : 'none';
        }
    }
}

/**
 * Updates the theme toggle icons based on the current theme.
 * @param {string} newTheme - The theme being set ('light' or 'dark').
 */
function updateThemeIcons(newTheme) {
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    if (darkIcon && lightIcon) {
        // Se o tema é escuro, mostramos o ícone de SOL (para mudar para claro)
        // Se o tema é claro, mostramos o ícone de LUA (para mudar para escuro)

        // Lógica corrigida para visibilidade:
        if (newTheme === 'dark') {
            darkIcon.classList.remove('hidden');
            lightIcon.classList.add('hidden');
        } else {
            lightIcon.classList.remove('hidden');
            darkIcon.classList.add('hidden');
        }
    }
}

/**
 * Toggles the color theme, saves the preference, and updates the icons.
 */
function toggleTheme() {
    // Verifica se tem a classe 'dark' atualmente
    const isDark = document.documentElement.classList.contains('dark');

    // Inverte o estado
    if (isDark) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
        updateThemeIcons('light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        updateThemeIcons('dark');
    }
}

/**
 * Initializes the theme toggle button functionality.
 */
function initializeThemeToggle() {
    const themeToggleButton = document.getElementById('theme-toggle');
    if (themeToggleButton) {
        // Remove event listeners antigos para evitar duplicação (embora cloneNode seja melhor, aqui simplificamos)
        const newBtn = themeToggleButton.cloneNode(true);
        themeToggleButton.parentNode.replaceChild(newBtn, themeToggleButton);

        newBtn.addEventListener('click', toggleTheme);

        // Determina o estado atual para setar o ícone correto
        const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        updateThemeIcons(currentTheme);
    }
}

/**
 * Checks the local storage for a theme and applies it.
 * This is a fallback/initialization if the inline script didn't run or for dynamic loads.
 */
function applyThemeFromLocalStorage() {
    // Verifica localStorage 'theme' (mesma chave do script inline)
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const isDark = savedTheme === 'dark' || (!savedTheme && systemPrefersDark);

    if (isDark) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    // Atualiza ícones se o botão já existir
    updateThemeIcons(isDark ? 'dark' : 'light');
}

/**
 * Adds a visual indicator (e.g., a red asterisk) to the labels of required input fields.
 * It reads the validation rules and applies a specific CSS class to the corresponding labels.
 * @param {string} validationRuleKey - The key for the calculator in the `validationRules` object (e.g., 'wind', 'aci_concrete').
 */
function highlightRequiredFields(validationRuleKey) {
    // Check if the validationRules object is available globally (provided by validation-rules.js)
    if (!window.validationRules || !validationRules[validationRuleKey]) {
        return;
    }
    const rules = validationRules[validationRuleKey];
    for (const inputId in rules) {
        // Skip crossField rules
        if (inputId === 'crossField') continue;

        const rule = rules[inputId];
        
        let isRequired = false;
        if (typeof rule.required === 'function') {
             // We can't fully evaluate conditional required here without all inputs,
             // so we assume it might be required if it's a function or explicitly true.
             isRequired = true; 
        } else {
             isRequired = !!rule.required;
        }

        if (isRequired) {
            const label = document.querySelector(`label[for="${inputId}"]`);
            if (label) {
                // Use a class to style the required indicator (e.g., adding a red asterisk in CSS)
                label.classList.add('label-required'); 
            }
        }
    }
}

/**
 * A single initialization function for all shared UI components.
 */
function initializeSharedUI() {
    applyThemeFromLocalStorage(); // Garante estado correto ao carregar JS
    initializeThemeToggle();       // Configura botão e ícones
    initializeBackToTopButton();
    initializeUiToggles();
    initializeGlobalInputSteps();
}

/**
 * Initializes UI toggles based on data attributes for declarative UI logic.
 * Looks for `data-ui-toggle-controller` and attaches event listeners.
 */
function initializeUiToggles() {
    const controllers = document.querySelectorAll('[data-ui-toggle-controller], [data-ui-toggle-target-for]');

    controllers.forEach(controller => {
        const isController = controller.hasAttribute('data-ui-toggle-controller');
        const isControlled = controller.hasAttribute('data-ui-toggle-target-for');

        if (isController) {
            const targetSelector = controller.dataset.uiToggleTarget;
            if (targetSelector) {
                setupController(controller, targetSelector);
            }
        }
        if (isControlled) {
            const controllerId = controller.dataset.uiToggleTargetFor;
            const mainController = document.getElementById(controllerId);
            if (mainController) {
                setupController(mainController, `#${controller.id}`);
            }
        }
    });

    function setupController(controller, targetSelector) {
        const updateUi = () => {
            if (!targetSelector || targetSelector === '#') {
                // If the selector is invalid or empty, do nothing.
                return;
            }
            const targets = document.querySelectorAll(targetSelector);
            if (targets.length === 0) return;

            targets.forEach(target => {
                const conditionValue = target.dataset.uiToggleConditionValue || controller.dataset.uiToggleConditionValue;
                const conditionChecked = target.dataset.uiToggleConditionChecked || controller.dataset.uiToggleConditionChecked;
                const toggleType = target.dataset.uiToggleType || controller.dataset.uiToggleType || 'visibility';
                const toggleClass = target.dataset.uiToggleClass || controller.dataset.uiToggleClass || 'hidden';
                const invert = (target.dataset.uiToggleInvert || controller.dataset.uiToggleInvert) === 'true';

                let conditionMet = false;
                if (controller.type === 'checkbox') {
                    const isChecked = controller.checked;
                    conditionMet = conditionChecked ? String(isChecked) === conditionChecked : isChecked;
                } else { // Handles select, text, number inputs
                    if (conditionValue === 'all') {
                        conditionMet = true; // Always show for 'all'
                    } else if (conditionValue) {
                        const conditionValues = conditionValue.split(',').map(v => v.trim());
                        conditionMet = conditionValues.includes(controller.value);
                    }
                }
                const finalCondition = invert ? !conditionMet : conditionMet;

                if (toggleType === 'visibility') target.classList.toggle(toggleClass, !finalCondition);
                else if (toggleType === 'disable') target.disabled = finalCondition;
            });
        }; // End of updateUi

        controller.addEventListener('change', updateUi);
        controller.addEventListener('input', updateUi);
        updateUi(); // Initial call to set the correct state on page load
    }
}

/**
 * Creates a DOM element with specified attributes, properties, and children.
 * A more robust and safer alternative to building HTML strings.
 * @param {string} tag - The HTML tag for the element.
 * @param {object} [props={}] - An object of attributes and properties (e.g., { className: '...', id: '...' }).
 * @param {Array<Node|string>} [children=[]] - An array of child nodes or strings to append.
 * @returns {HTMLElement} The created DOM element.
 */
function createDOMElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(props)) {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'dataset') {
            for (const [dataKey, dataValue] of Object.entries(value)) {
                el.dataset[dataKey] = dataValue;
            }
        } else {
            el.setAttribute(key, value);
        }
    }

    for (const child of children) {
        if (child instanceof Node) el.appendChild(child);
        else if (child !== null && child !== undefined) el.insertAdjacentHTML('beforeend', String(child));
    }
    return el;
}

/**
 * Initializes the "Back to Top" button functionality.
 * It shows the button on scroll and handles the scroll-to-top action.
 */
function initializeBackToTopButton() {
    const backToTopButton = document.getElementById('back-to-top-btn');
    if (!backToTopButton) return;

    // Debounce the scroll event to improve performance
    const handleScroll = debounce(() => {
        const isVisible = window.scrollY > 300;
        backToTopButton.classList.toggle('opacity-100', isVisible);
        backToTopButton.classList.toggle('opacity-0', !isVisible);
        backToTopButton.classList.toggle('invisible', !isVisible);
    }, 150);

    window.addEventListener('scroll', handleScroll);

    // Scroll to top on click
    backToTopButton.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/**
 * Wraps a calculation function in a try-catch block to prevent crashes.
 * @param {function} calcFunction - The function to execute.
 * @param {string} errorMessage - A user-friendly error message.
 * @returns The result of the function or an error object.
 */
function safeCalculation(calcFunction, errorMessage) {
    try {
        return calcFunction();
    } catch (error) {
        console.error(errorMessage, error);
        return { error: errorMessage, success: false };
    }
}

/**
 * Creates a debounced function that delays invoking `func` until after `wait` milliseconds have elapsed.
 * @param {function} func - The function to debounce.
 * @param {number} wait - The number of milliseconds to delay.
 * @returns {function} The new debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Toggles the loading state of a button, showing a spinner and disabling it.
 * @param {boolean} isLoading - Whether to show the loading state.
 * @param {string} buttonId - The ID of the button to update.
 */
function setLoadingState(isLoading, buttonId) {
    const button = document.getElementById(buttonId);
    if (!button) return;

    if (isLoading) {
        if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<span class="flex items-center justify-center"><svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Calculating...</span>`;
    } else {
        if (button.dataset.originalText) button.innerHTML = button.dataset.originalText;
        button.disabled = false;
    }
}

/**
 * Renders validation errors and warnings into an HTML string.
 * @param {{errors?: string[], warnings?: string[]}} validation - The validation result object.
 * @param {HTMLElement} [container] - Optional. The container element to set the innerHTML of.
 * @returns {string} - The generated HTML string.
 */
function renderValidationResults(validation, container) {
    let html = '';
    if (validation.errors && validation.errors.length > 0) {
        html += `
            <div class="validation-message error">
                <div class="flex">
                    <div class="flex-shrink-0"><svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg></div>
                    <div class="ml-3">
                        <h3 class="text-sm font-bold">Input Errors Found:</h3>
                        <div class="mt-2 text-sm"><ul class="list-disc list-inside space-y-1">${validation.errors.map(e => `<li>${e}</li>`).join('')}</ul></div>
                        <p class="mt-2 text-sm">Please correct the errors and run the check again.</p>
                    </div>
                </div>
            </div>`;
    }
    if (validation.warnings && validation.warnings.length > 0) {
        html += `
            <div class="validation-message warning">
                <div class="flex">
                    <div class="flex-shrink-0"><svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M8.257 3.099c.636-1.026 2.287-1.026 2.923 0l5.625 9.075A1.75 1.75 0 0115.25 15H4.75a1.75 1.75 0 01-1.555-2.826l5.625-9.075zM9 9a1 1 0 011-1h.01a1 1 0 010 2H10a1 1 0 01-1-1zm1 2a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" /></svg></div>
                    <div class="ml-3">
                        <h3 class="text-sm font-bold">Warnings:</h3>
                        <div class="mt-2 text-sm"><ul class="list-disc list-inside space-y-1">${validation.warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>
                    </div>
                </div>
            </div>`;
    }
    if (container) container.innerHTML = html;
    return html;
}

/**
 * Sanitizes a string to prevent XSS by escaping HTML special characters.
 * @param {string | number} str - The string or number to sanitize.
 * @returns {string} The sanitized string.
 */
function sanitizeHTML(str) {
    if (typeof str !== 'string') {
        // If it's not a string (e.g., a number), convert it safely.
        return String(str);
    }
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Displays a temporary feedback message to the user.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - If true, displays the message as an error.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
function showFeedback(message, isError = false, feedbackElId = 'feedback-message') {
    const feedbackEl = document.getElementById(feedbackElId);
    if (!feedbackEl) return;
    feedbackEl.textContent = message;
    feedbackEl.className = `text-center mt-2 text-sm h-5 ${isError ? 'text-red-600' : 'text-green-600'}`;
    setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
}

/**
 * Gathers all CSS rules from the document's stylesheets into a single string.
 * This is crucial for embedding styles into SVGs for correct rendering during export.
 * @returns {string} A string containing all CSS rules wrapped in a <style> tag.
 */
function getAllCssStyles() {
    let cssText = "";
    for (const styleSheet of document.styleSheets) {
        // Skip external stylesheets (like Google Fonts) to avoid CORS security errors.
        if (styleSheet.href) {
            continue;
        }

        try {
            if (styleSheet.cssRules) {
                for (const rule of styleSheet.cssRules) {
                    cssText += rule.cssText;
                }
            }
        } catch (e) {
            console.warn("Could not read CSS rules from stylesheet:", styleSheet.href, e);
        }
    }
    return `<style>${cssText}</style>`;
}

/**
 * Converts an SVG element to a PNG image, embedding all necessary styles.
 * @param {SVGElement} svg - The SVG element to convert.
 * @returns {Promise<HTMLImageElement|null>} A promise that resolves with an HTML <img> element or null on failure.
 */
async function convertSvgToPng(svg) {
    return new Promise(async (resolve, reject) => {
        try {
            const clone = svg.cloneNode(true);

            // Define a high resolution for the output PNG for better quality
            const targetWidth = 1200;
            const viewBox = svg.viewBox.baseVal;
            const aspectRatio = (viewBox && viewBox.width > 0) ? (viewBox.height / viewBox.width) : (9 / 16); // Default aspect ratio
            const targetHeight = Math.max(1, targetWidth * aspectRatio); // Ensure height is at least 1

            clone.setAttribute('width', targetWidth);
            clone.setAttribute('height', targetHeight);

            // Force a light theme for printing by injecting specific styles
            const printStyles = `
                <style>
                    svg { background-color: white !important; }
                    text, .svg-label, .svg-dim-text { fill: black !important; }
                    .svg-member, .svg-dim { stroke: black !important; }
                    path, rect { stroke: black !important; }
                </style>
            `;

            const styles = getAllCssStyles();
            const defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
            // Inject page styles first, then our override styles to ensure they take precedence
            defs.innerHTML = styles + printStyles;
            clone.insertBefore(defs, clone.firstChild);

            const xml = new XMLSerializer().serializeToString(clone);
            const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;

            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    // Draw a white background on the canvas itself as a final fallback
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(image, 0, 0);

                    const pngImage = new Image();
                    pngImage.src = canvas.toDataURL('image/png');
                    pngImage.style.maxWidth = '100%'; // For display in the Word doc
                    pngImage.style.height = 'auto';
                    resolve(pngImage);
                } else {
                    reject(new Error("Could not get canvas context."));
                }
            };
            image.onerror = (e) => reject(new Error("Image could not be loaded for conversion."));
            image.src = dataUrl;
        } catch (e) {
            console.error('Error during SVG to PNG conversion:', e);
            reject(e);
        }
    });
}

/**
 * Creates Word-compatible HTML structure with a header and basic styling.
 * @param {string} content - The main HTML content of the report.
 * @param {string} title - The title for the report header.
 * @returns {string} A full HTML document string formatted for MS Word.
 */
function createWordCompatibleHTML(content, title) {
    const cssStyles = `
        body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; }
        table { border-collapse: collapse; width: 100%; margin-bottom: 1em; page-break-inside: avoid; }
        th, td { border: 1px solid #000; padding: 4px 8px; text-align: left; }
        th { background-color: #f0f0f0; font-weight: bold; }
        caption { font-weight: bold; text-align: center; margin-bottom: 0.5em; font-size: 14pt; }
        h1, h2, h3, h4 { font-family: 'Arial', sans-serif; }
        h1 { font-size: 16pt; text-align: center; }
        h2 { font-size: 14pt; border-bottom: 1px solid #000; margin-top: 1.5em; }
        h3 { font-size: 13pt; }
        .pass { color: #008000; font-weight: bold; }
        .fail { color: #ff0000; font-weight: bold; }
    `;
    return `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${title}</title><style>${cssStyles}</style></head>
        <body><h1>${title}</h1>${content}</body>
        </html>`;
}

/**
 * Converts an HTML element to a structured plain text string.
 * @param {HTMLElement} element - The HTML element to convert.
 * @returns {string} A plain text representation of the element's content.
 */
function convertElementToPlainText(element) {
    // Special handling for combo summary cards to make the text output cleaner
    if (element.id.startsWith('combo-summary-card-')) {
        const title = element.querySelector('h4')?.innerText.trim() || 'Summary';
        const maxPressure = element.querySelector('p.text-xl')?.innerText.trim() || 'N/A';
        const maxCombo = element.querySelector('p.truncate')?.title || 'N/A';
        const minPressure = element.querySelectorAll('p.text-xl')[1]?.innerText.trim() || 'N/A';
        const minCombo = element.querySelectorAll('p.truncate')[1]?.title || 'N/A';

        return `${title}\n- Max Pressure: ${maxPressure} (From: ${maxCombo})\n- Max Uplift/Suction: ${minPressure} (From: ${minCombo})`;
    }

    // Generic conversion for other elements
    const textParts = [];
    element.querySelectorAll('h1, h2, h3, h4, p, li, tr, caption').forEach(el => {
        const tagName = el.tagName.toLowerCase();
        let line = el.innerText?.trim() ?? '';
        if (tagName === 'h1') textParts.push(`\n# ${line}\n\n`);
        else if (tagName === 'h2') textParts.push(`\n## ${line}\n\n`);
        else if (tagName === 'h3') textParts.push(`\n### ${line}\n`);
        else if (tagName === 'h4') textParts.push(`\n#### ${line}\n`);
        else if (tagName === 'caption') textParts.push(`\n--- ${line} ---\n`);
        else if (tagName === 'li') textParts.push(`* ${line}`); // Keep li as is
        else if (tagName === 'tr') {
            const cells = Array.from(el.querySelectorAll('th, td')).map(cell => cell.innerText?.trim() ?? '');
            textParts.push(cells.join('\t|\t')); // Tab-separated for better column alignment
        } else if (tagName === 'p') textParts.push(line);
    });
    return textParts.join('\n').replace(/\n{3,}/g, '\n\n'); // Collapse multiple blank lines
}

/**
 * Copies the content of a given container to the clipboard, converting SVGs to images.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} feedbackElId - The ID of the feedback element.
 */
// Proxy function to maintain backward compatibility
function handleCopyToClipboard(targetId, options) {
    console.warn("The function 'handleCopyToClipboard' is deprecated. Please use 'handleCopy' instead.");
    handleCopy(targetId, options);
}

async function handleCopy(targetId, options = {}) {
    const { feedbackElId = 'feedback-message', engine, scene } = options;
    try {
        const elementToCopy = document.getElementById(targetId);
        if (!elementToCopy) {
            showFeedback('Report container not found.', true, feedbackElId);
            return;
        }

        showFeedback('Preparing report for copying...', false, feedbackElId);
        const clone = elementToCopy.cloneNode(true);

        // Prepare the clone for copying: remove interactive elements, expand details, and remove empty rows.
        clone.querySelectorAll('button, .print-hidden, [data-copy-ignore]').forEach(el => el.remove());
        clone.querySelectorAll('.details-row').forEach(row => row.classList.add('is-visible'));

        // Convert SVGs to PNGs
        let conversionFailures = 0;
        const diagramElements = Array.from(clone.querySelectorAll('svg, canvas'));
        if (diagramElements.length > 0) {
            showFeedback(`Converting ${diagramElements.length} diagram(s) to images...`, false, feedbackElId);
            // Use Promise.all to run conversions in parallel for better performance.
            await Promise.all(diagramElements.map(async (diagram) => {
                try {
                    let pngImage;
                    if (diagram.tagName.toLowerCase() === 'svg') {
                        pngImage = await convertSvgToPng(diagram);
                    } else if (diagram.tagName.toLowerCase() === 'canvas' && engine && scene) {
                        // Handle BabylonJS canvas
                        pngImage = await new Promise(res => BABYLON.Tools.CreateScreenshot(engine, scene.activeCamera, { finalWidth: diagram.width, finalHeight: diagram.height }, data => res(data)));
                    }
                    if (pngImage && diagram.parentNode) {
                        diagram.parentNode.replaceChild(pngImage, diagram);
                    } else if (diagram.parentNode) { diagram.parentNode.remove(); }
                } catch (error) {
                    console.warn("SVG to PNG conversion failed:", error);
                    conversionFailures++;
                    if (diagram.parentNode) diagram.parentNode.remove(); // Remove SVG if conversion fails to avoid broken images.
                }
            }));
        }

        // Remove empty table rows that might be left after removing buttons
        clone.querySelectorAll('tr').forEach(tr => {
            if (tr.innerText.trim() === '') {
                tr.remove();
            }
        });

        showFeedback('Copiando para a área de transferência...', false, feedbackElId);

        // Generate final HTML and Text content, consistent with handleDownloadWord
        const reportTitle = document.getElementById('main-title')?.innerText || 'Calculation Report';
        const htmlContent = createWordCompatibleHTML(clone.innerHTML, reportTitle); // Use the simpler HTML structure
        const plainTextContent = convertElementToPlainText(clone);

        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });
        await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ]);

        let feedback = 'Relatório e diagramas copiados com sucesso!';
        if (conversionFailures > 0) {
            feedback = `Relatório copiado, mas ${conversionFailures} diagrama(s) não puderam ser convertidos.`;
        }
        showFeedback(feedback, false, feedbackElId);
    } catch (err) {
        console.error('Clipboard API failed:', err);
        showFeedback('A cópia falhou. Seu navegador pode não suportar este recurso.', true, feedbackElId);
    }
}

/**
 * Downloads the content of a given container as a PDF file.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} filename - The desired filename for the downloaded PDF.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
async function handleDownloadPdf(containerId, filename, feedbackElId = 'feedback-message') {
    const reportContainer = document.getElementById(containerId);
    if (!reportContainer) {
        showFeedback('Report container not found for PDF export.', true, feedbackElId);
        return;
    }
    if (typeof html2pdf === 'undefined') {
        showFeedback('PDF generation library is not loaded.', true, feedbackElId);
        return;
    }

    showFeedback('Generating PDF...', false, feedbackElId);

    // --- Get Header Info ---
    const projectTitle = document.getElementById('main-title')?.innerText || 'Engineering Report';
    const reportDate = new Date().toLocaleDateString();

    // --- Configure PDF Options ---
    const opt = {
        margin:        0.5,
        filename:      filename,
        image:         { type: 'jpeg', quality: 0.98 },
        html2canvas:   { scale: 2, useCORS: true },
        jsPDF:         { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:     { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // --- Generate PDF with Custom Header ---
    await html2pdf().from(reportContainer).set(opt).toPdf().get('pdf').then(function (pdf) {
        const totalPages = pdf.internal.getNumberOfPages();
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        for (let i = 1; i <= totalPages; i++) {
            pdf.setPage(i);
            pdf.setFontSize(10);
            pdf.setTextColor(100); // Gray color
            // Header
            pdf.text(projectTitle, pageWidth / 2, 0.3, { align: 'center' });
            pdf.text(`Date: ${reportDate}`, pageWidth - 0.5, 0.3, { align: 'right' });
            // Footer
            pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 0.3, { align: 'center' });
        }
    }).save();
}

/**
 * Downloads the content of a given container as a Microsoft Word (.doc) file.
 * It converts SVGs to PNGs and formats the HTML for Word compatibility.
 * @param {string} containerId - The ID of the container with the report content.
 * @param {string} filename - The desired filename for the downloaded Word file.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
async function handleDownloadWord(containerId, filename, feedbackElId = 'feedback-message') {
    const reportContainer = document.getElementById(containerId);
    if (!reportContainer) {
        showFeedback('Report container not found for Word export.', true, feedbackElId);
        return;
    }

    showFeedback('Generating Word document...', false, feedbackElId);

    const clone = reportContainer.cloneNode(true);
    clone.querySelectorAll('button, .print-hidden, [data-copy-ignore]').forEach(el => el.remove());
    clone.querySelectorAll('.details-row').forEach(row => row.classList.add('is-visible'));
    
    clone.querySelectorAll('tr').forEach(tr => {
        if (tr.innerText.trim() === '') {
            tr.remove();
        }
    });

    // Convert all diagrams (SVG and Canvas) to PNGs
    const diagramElements = Array.from(clone.querySelectorAll('svg, canvas'));
    if (diagramElements.length > 0) {
        showFeedback(`Converting ${diagramElements.length} diagram(s)...`, false, feedbackElId);
        await Promise.all(diagramElements.map(async (element) => {
            try {
                let pngImage;
                if (element.tagName.toLowerCase() === 'svg') {
                    pngImage = await convertSvgToPng(element);
                } else { // It's a canvas
                    const originalCanvas = element;
                    const scale = 2; // Upscale for better quality
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = originalCanvas.width * scale;
                    tempCanvas.height = originalCanvas.height * scale;
                    const ctx = tempCanvas.getContext('2d');

                    // Force white background
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    ctx.drawImage(originalCanvas, 0, 0, tempCanvas.width, tempCanvas.height);

                    const dataUrl = tempCanvas.toDataURL('image/png');
                    if (dataUrl.length < 100) return; // Skip blank canvases

                    pngImage = new Image();
                    pngImage.src = dataUrl;
                    // Set display size in the Word doc to be the original size
                    pngImage.style.width = `${originalCanvas.width}px`;
                    pngImage.style.height = `${originalCanvas.height}px`;
                    pngImage.style.maxWidth = '100%';
                }

                if (pngImage && element.parentNode) {
                    await new Promise(resolve => {
                        if (pngImage.complete) resolve();
                        else pngImage.onload = resolve;
                    });
                    element.parentNode.replaceChild(pngImage, element);
                }
            } catch (error) {
                console.warn("Diagram conversion failed for Word export:", error);
            }
        }));
    }

    const reportTitle = document.getElementById('main-title')?.innerText || 'Calculation Report';
    const finalHtml = createWordCompatibleHTML(clone.innerHTML, reportTitle);

    const blob = new Blob([finalHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showFeedback('Word document download started.', false, feedbackElId);
}

/**
 * Converts the table data from a report into a CSV formatted string.
 * @param {string} reportId - The ID of the report container element.
 * @returns {string} A string in CSV format.
 */
function convertReportToCsv(reportId) {
    const reportContainer = document.getElementById(reportId);
    if (!reportContainer) return '';

    let csvContent = '';
    const sections = reportContainer.querySelectorAll('.report-section-copyable');

    sections.forEach(section => {
        const titleEl = section.querySelector('h3');
        const tableEl = section.querySelector('table');

        if (titleEl && tableEl) {
            // Add a title for the section in the CSV
            csvContent += `"${titleEl.innerText.trim()}"\n`;

            // Process table headers
            const headers = Array.from(tableEl.querySelectorAll('thead th')).map(th => `"${th.innerText.trim()}"`);
            csvContent += headers.join(',') + '\n';

            // Process table rows
            const rows = tableEl.querySelectorAll('tbody tr');
            rows.forEach(row => {
                // Skip subheader rows or detail rows
                if (row.classList.contains('details-row') || row.querySelector('td[colspan]')) {
                    return;
                }

                const cells = Array.from(row.querySelectorAll('td')).map(td => {
                    // Clone the cell to manipulate it without affecting the DOM
                    const cellClone = td.cloneNode(true);
                    // Remove the "[Show]" button from the cell content
                    const button = cellClone.querySelector('.toggle-details-btn');
                    if (button) button.remove();
                    // Get the cleaned text and escape quotes
                    const text = (cellClone.innerText || '').trim().replace(/"/g, '""');
                    return `"${text}"`;
                });
                csvContent += cells.join(',') + '\n';
            });
            csvContent += '\n'; // Add a blank line between sections
        }
    });

    return csvContent;
}

/**
 * Downloads the report data as a CSV file.
 * @param {string} reportId - The ID of the report content element.
 * @param {string} filename - The desired filename for the downloaded CSV.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
function handleDownloadCsv(reportId, filename, feedbackElId = 'feedback-message') {
    const reportContainer = document.getElementById(reportId);
    if (!reportContainer) {
        showFeedback('Report container not found for CSV export.', true, feedbackElId);
        return;
    }

    showFeedback('Generating CSV...', false, feedbackElId);
    const csvContent = convertReportToCsv(reportId);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.click();
}
/**
 * Gathers values from a list of input IDs.
 * @param {string[]} inputIds - An array of input element IDs.
 * @returns {Object} An object with keys as input IDs and values as their values.
 */
function gatherInputsFromIds(inputIds) { // Updated for better validation
    const inputs = {};
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            let value;
            if (el.type === 'number') {
                value = parseFloat(el.value) || 0; // Default to 0 if parsing fails
                inputs[id] = value;
            } else if (el.type === 'checkbox') {
                inputs[id] = el.checked;
            } else {
                inputs[id] = el.value || ''; // Ensure we don't get undefined
            }
        } else {
            // Provide default for missing elements
            inputs[id] = '';
        }
    });
    return inputs;
}

/**
 * Saves a given data object to a text file.
 * @param {Object} data - The JavaScript object to save.
 * @param {string} filename - The name of the file to download.
 */
function saveInputsToFile(data, filename, appVersion = '1.0') {
    const dataToSave = {
        _appVersion: appVersion,
        ...data
    };
    const dataStr = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([dataStr], {type: "text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Triggers the file input to open the file selection dialog.
 * @param {string} fileInputId - The ID of the hidden file input element.
 */
function initiateLoadInputsFromFile(fileInputId = 'file-input') {
    document.getElementById(fileInputId)?.click();
}

/**
 * Creates a generic "save inputs" event handler.
 * @param {string[]} inputIds - The array of input IDs to gather values from.
 * @param {string} filename - The default filename for the saved file.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 * @returns {function} An event handler function.
 */
function createSaveInputsHandler(inputIds, filename, feedbackElId = 'feedback-message') {
    return function() {
        const inputs = gatherInputsFromIds(inputIds);
        // Pass a version number when saving
        saveInputsToFile(inputs, filename, '1.1');
        showFeedback(`Inputs saved to ${filename}`, false, feedbackElId);
    };
}

/**
 * Applies a given set of input values to the DOM elements.
 * @param {object} inputs - The key-value pairs of input IDs and their values.
 * @param {string[]} inputIds - The array of all possible input IDs for the form.
 */
function applyInputsToDOM(inputs, inputIds) {
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && inputs[id] !== undefined) {
            if (el.type === 'checkbox') {
                el.checked = !!inputs[id];
            } else {
                el.value = inputs[id];
            }
            // Trigger change/input events to update any dependent UI or calculations
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
}

/**
 * Creates a generic "load inputs" event handler for a file input.
 * @param {string[]} inputIds - The array of input IDs to populate.
 * @param {function} onComplete - A callback function to run after inputs are loaded (e.g., re-run calculation).
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 * @param {string} [appVersion='1.1'] - The current application version to check against.
 * @returns {function} An event handler function that takes the file input event.
 */
function createLoadInputsHandler(inputIds, onComplete, feedbackElId = 'feedback-message', appVersion = '1.1') {
    return function(event) {
        const displayEl = document.getElementById('file-name-display');
        const file = event.target.files[0];
        if (!file) {
            if (displayEl) displayEl.textContent = ''; // User cancelled, clear display
            return;
        }

        if (displayEl) displayEl.textContent = `Loaded: ${sanitizeHTML(file.name)}`;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const inputs = JSON.parse(e.target.result);
                // Temporarily store the full parsed object for complex loaders to use
                localStorage.setItem('temp-loaded-inputs', JSON.stringify(inputs));

                if (inputs._appVersion !== appVersion) {
                    showFeedback(`Warning: File is from an older version (v${inputs._appVersion || '?'}). Some inputs may not load correctly.`, true, feedbackElId);
                }

                applyInputsToDOM(inputs, inputIds);
                showFeedback('Inputs loaded successfully!', false, feedbackElId);
                if (typeof onComplete === 'function') onComplete();
            } catch (err) {
                showFeedback('Failed to load inputs. Data may be corrupt.', true, feedbackElId);
                console.error("Error parsing saved data:", err);
            } finally {
                // Reset file input to allow loading the same file again
                event.target.value = '';
                if (displayEl) displayEl.textContent = ''; // Clear filename display after processing
                localStorage.removeItem('temp-loaded-inputs'); // Clean up temp storage
            }
        };
        reader.readAsText(file);
    };
}

/**
 * Saves a key-value pair to the browser's local storage.
 * @param {string} storageKey - The key to use for storing the data.
 * @param {object} inputs - The input data object to be stringified and saved.
 */
function saveInputsToLocalStorage(storageKey, inputs, appVersion = '1.0') {
    try {
        const dataToSave = {
            _version: appVersion,
            ...inputs
        };
        const dataStr = JSON.stringify(dataToSave);
        localStorage.setItem(storageKey, dataStr);
    } catch (error) {
        console.error('Could not save inputs to local storage:', error);
    }
}

/**
 * Loads and applies saved inputs from local storage.
 * @param {string} storageKey - The key to retrieve data from.
 * @param {string[]} inputIds - An array of input element IDs to populate.
 * @param {function} [onComplete] - An optional callback to run after inputs are loaded.
 * @param {string} [appVersion='1.0'] - The current version of the application's data structure.
 */
function loadInputsFromLocalStorage(storageKey, inputIds, onComplete, appVersion = '1.1') { // Updated default version to 1.1
    const dataStr = localStorage.getItem(storageKey);
    let loadedInputs = null;

    if (dataStr) {
        try {
            const inputs = JSON.parse(dataStr);

            // Version check: If the saved data has a matching version, apply it.
            if (inputs._version === appVersion) {
                loadedInputs = inputs; // Mark as valid

                inputIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;

                    let valueToApply;
                    if (inputs[id] !== undefined) {
                        valueToApply = inputs[id];
                    } else if (storageKey === 'buildingProjectData') {
                        const genericKey = id.substring(id.indexOf('_') + 1);
                        if (inputs[genericKey] !== undefined) {
                            valueToApply = inputs[genericKey];
                        }
                    }

                    if (valueToApply !== undefined) {
                        if (el.type === 'checkbox') {
                            el.checked = !!valueToApply;
                        } else {
                            el.value = valueToApply;
                        }
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            } else {
                // If version is mismatched, discard the old data.
                console.warn(`LocalStorage data for '${storageKey}' is outdated (v${inputs._version} vs current v${appVersion}). Discarding.`);
                localStorage.removeItem(storageKey);
            }
        } catch (error) {
            console.error('Could not parse inputs from local storage:', error);
        }
    }

    // Unconditionally call the onComplete callback, passing the loaded inputs (or null if none were loaded).
    if (typeof onComplete === 'function') {
        onComplete(loadedInputs);
    }
}

/**
 * Clears the local storage for a given key and resets the UI fields to their default state.
 * @param {string} storageKey - The local storage key to clear.
 * @param {string[]} inputIds - The array of input IDs to reset.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
function clearLocalStorageAndResetUI(storageKey, inputIds, feedbackElId = 'feedback-message') {
    localStorage.removeItem(storageKey);
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // This will reset the form to its initial HTML state
            el.form.reset();
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
    showFeedback('Inputs have been cleared and reset.', false, feedbackElId);
}

/**
 * A master initialization function for calculator pages.
 * It handles header/footer injection, UI setup, and event listener attachment for a consistent user experience.
 * @param {object} config - The configuration object for the page.
 * @param {string} config.pageKey - A unique key for the page (e.g., 'wind', 'snow'). Used for navigation highlighting.
 * @param {string} config.pageTitle - The title to display in the header.
 * @param {string[]} config.inputIds - An array of all input IDs on the page for saving/loading.
 * @param {function} config.calculationHandler - The function to call when the main "run" button is clicked.
 * @param {function} [config.onReady] - An optional callback to run after all initial setup is complete.
 */
async function initializeApp(config) { // This function is already async
    const {
        inputIds = [],
        calculationHandler,
        onReady,
        storageKey,
        fileInputId = 'file-input', // Default file input ID
        loadButtonId = 'load-inputs-btn', // Default load button ID
        saveButtonId = 'save-inputs-btn', // Default save button ID
        pageKey, // We use this to find config
    } = config;

    // --- 0. Initialize Internationalization (i18n) First ---
    // i18n is defined in i18n.js and should be available globally.
    if (typeof i18n !== 'undefined' && typeof i18n.initialize === 'function') {
        await i18n.initialize();
    }

    // --- 1. Discover Page and Inject Header/Footer (CORREÇÃO DE PATH AQUI) ---
    const path = window.location.pathname;
    const pageName = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
    
    // Determine the path prefix based on the number of directories to step up.
    const dirPath = path.substring(0, path.lastIndexOf('/') + 1); // e.g., /BASE/CODE-2/asce/
    const pathSegments = dirPath.split('/').filter(s => s.length > 0);
    
    // We assume the 'js' folder is located in the CODE-2/ root.
    let depthFromCode2 = 0;
    const projectRootMarker = 'CODE-2';
    const rootIndex = pathSegments.findIndex(s => s.toLowerCase() === projectRootMarker.toLowerCase());
    
    if (rootIndex !== -1) {
        // Number of levels to step up is the count of directories *after* the CODE-2 folder.
        // e.g., ['BASE', 'CODE-2', 'asce'] -> rootIndex=1. depth = 3 - 2 = 1. (Need '../')
        depthFromCode2 = pathSegments.length - (rootIndex + 1);
    } 

    let pathPrefix = '';
    if (depthFromCode2 > 0) {
        // Construct '../' path components (e.g., '../', '../../')
        pathPrefix = Array(depthFromCode2).fill('..').join('/') + '/';
    } else {
        pathPrefix = './'; // Root level (index.html, or if CODE-2 is the base path)
    }

    const navConfigPath = `${pathPrefix}js/nav-config.json`;

    let navConfig;
    try {
        const response = await fetch(navConfigPath);
        // Check if response is okay before attempting to parse JSON
        if (!response.ok) {
             throw new Error(`HTTP error! status: ${response.status} while fetching ${navConfigPath}`);
        }
        navConfig = await response.json();
        window.NAV_CONFIG = navConfig; // Make it globally available
    } catch (error) {
        console.error(`Failed to load nav-config.json from path: ${navConfigPath}`, error);
        // Fallback or stop initialization if nav config fails
        return; 
    }

    const pageConfig = navConfig.mainNav.flatMap(item => item.subNav.length > 0 ? item.subNav : [item]).find(link => link.href.endsWith(pageName))
        || (pageName === 'index.html' || pageName === '') ? navConfig.mainNav.find(link => link.key === 'home') : null;

    const activePageKey = pageConfig?.key || pageKey || 'default';
    const pageTitleKey = pageConfig?.textKey || 'engineering_hub';


    // Inject Header and Footer (Assuming injectHeader/injectFooter are available from template.js)
    if (typeof injectHeader === 'function' && typeof injectFooter === 'function') {
        // Pass the calculated pathPrefix to the template functions if they need it for static assets
        await injectHeader({ 
            activePage: activePageKey, 
            pageTitle: pageTitleKey, 
            headerPlaceholderId: 'header-placeholder',
            pathPrefix: pathPrefix // Explicitly pass the prefix
        });
        await injectFooter({ 
            footerPlaceholderId: 'footer-placeholder',
            pathPrefix: pathPrefix // Explicitly pass the prefix
        });
    } else {
         console.warn("Template injection functions (injectHeader/injectFooter) are missing. Navigation will not load.");
    }
    
    const effectiveStorageKey = storageKey || `${activePageKey}-inputs`;

    // 2. Initialize Shared UI Components
    initializeSharedUI(); // This is correct

    const buttonId = config.buttonId || 'run-check-btn'; // Default button ID
    // 3. Attach Core Event Listeners
    const runButton = document.getElementById(buttonId);
    if (runButton && typeof calculationHandler === 'function') {
        runButton.addEventListener('click', calculationHandler);
    }

    // --- Attach Save/Load button handlers ---
    const saveButton = document.getElementById(saveButtonId);
    const loadButton = document.getElementById(loadButtonId);
    const fileInput = document.getElementById(fileInputId);

    if (saveButton) {
        const filename = `${effectiveStorageKey}.json`;
        const saveHandler = createSaveInputsHandler(inputIds, filename, config.feedbackElId);
        saveButton.addEventListener('click', saveHandler);
    }

    if (loadButton && fileInput) {
        loadButton.addEventListener('click', () => initiateLoadInputsFromFile(fileInputId));
        // When inputs are loaded from a file, re-run the calculation automatically.
        const loadHandler = createLoadInputsHandler(inputIds, calculationHandler, config.feedbackElId);
        fileInput.addEventListener('change', loadHandler);
    }

    // --- Automatic Save to Local Storage on Input Change ---
    const debouncedSave = debounce(() => {
        const currentInputs = gatherInputsFromIds(inputIds);
        saveInputsToLocalStorage(effectiveStorageKey, currentInputs, '1.1');
    }, 500); // Debounce to avoid excessive writes on rapid changes.

    if (inputIds.length > 0) {
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Listen to both 'input' and 'change' to cover all element types
                el.addEventListener('input', debouncedSave);
                el.addEventListener('change', debouncedSave);
            }
        });
    }

    // 4. Load saved data from Local Storage
    loadInputsFromLocalStorage(effectiveStorageKey, inputIds, onReady, '1.1');

}

/**
 * A class to build and render structured calculation reports.
 * It supports adding different types of sections (HTML, tables, charts)
 * and handles the rendering process, including attaching event listeners.
 */
class ReportBuilder {
    /**
     * @param {object} options - Configuration for the report.
     * @param {string} options.reportId - The ID for the main report container (e.g., 'wind-report-content').
     * @param {string} options.title - The main title of the report.
     * @param {Array<object>} [options.actionButtons] - Optional array of custom action buttons.
     * @param {string[]} [options.warnings] - Optional array of warning messages to display at the top.
     */
    constructor(options) {
        this.reportId = options.reportId;
        this.title = options.title;
        this.actionButtons = options.actionButtons || [];
        this.sections = [];
        this.warnings = options.warnings || [];
    }

    /**
     * Adds a generic HTML content section to the report.
     * @param {string|null} title - The title of the section. Can be null for sections without a header.
     * @param {string} htmlContent - The HTML content to be rendered.
     * @param {string} [sectionId] - An optional ID for the section container.
     */
    addSection(title, htmlContent, sectionId) {
        this.sections.push({ type: 'html', title, htmlContent, sectionId });
    }

    /**
     * Adds a section that will contain a table.
     * @param {string} title - The title of the section.
     * @param {object} tableConfig - Configuration for the table.
     * @param {string[]} tableConfig.headers - Array of header strings.
     * @param {Array<object>} tableConfig.rows - Array of row objects. Each object has a `cells` array and an optional `details` string.
     * @param {string} [sectionId] - An optional ID for the section container.
     */
    addTableSection(title, tableConfig, sectionId) {
        this.sections.push({ type: 'table', title, tableConfig, sectionId });
    }

    /**
     * Adds a section that will contain a chart.
     * @param {string} title - The title of the section.
     * @param {string} canvasId - The ID for the canvas element where the chart will be drawn.
     * @param {string} [sectionId] - An optional ID for the section container.
     * @param {object} [style] - Optional style object for the canvas container.
     */
    addChartSection(title, canvasId, sectionId, style = { height: '300px' }) {
        const styleString = Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';');
        const chartHtml = `<div style="${styleString}"><canvas id="${canvasId}"></canvas></div>`;
        this.sections.push({ type: 'html', title, htmlContent: chartHtml, sectionId });
    }

    /**
     * Renders the entire report into a specified container element.
     * @param {string} containerId - The ID of the DOM element to render the report into.
     */
    render(containerId) {
        const mainContainer = document.getElementById(containerId);
        if (!mainContainer) {
            console.error(`Report container with ID "${containerId}" not found.`);
            return;
        }
        mainContainer.innerHTML = ''; // Clear previous content

        // --- Build Header ---
        const actionButtons = this.actionButtons.map(btn =>
            createDOMElement('button', { id: btn.id, className: `bg-gray-200 text-gray-700 font-semibold py-1 px-3 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 text-xs print-hidden ${btn.classes || ''}` }, [btn.text])
        );

        const header = createDOMElement('div', { className: 'flex justify-between items-center border-b-2 border-gray-300 dark:border-gray-600 pb-4 mb-4' }, [
            createDOMElement('h2', { className: 'text-2xl font-bold' }, [this.title]),
            createDOMElement('div', { className: 'flex items-center gap-2 print-hidden' }, [
                createDOMElement('button', { id: 'toggle-all-details-btn', className: 'bg-gray-200 text-gray-700 font-semibold py-1 px-3 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 text-xs', dataset: { state: 'hidden' } }, ['Show All Details']),
                ...actionButtons,
                createDOMElement('button', { id: 'copy-report-btn', className: 'bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs' }, ['Copy']),
                createDOMElement('button', { id: 'download-word-btn', className: 'bg-blue-800 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-900 text-xs' }, ['Word']),
                createDOMElement('button', { id: 'download-csv-btn', className: 'bg-green-700 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-800 text-xs' }, ['CSV']),
                createDOMElement('button', { id: 'download-pdf-btn', className: 'bg-red-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-red-700 text-xs' }, ['Download PDF'])
            ])
        ]);

        // --- Build Report Container ---
        const reportContainer = createDOMElement('div', { id: this.reportId, className: 'p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg' });
        reportContainer.appendChild(header);

        // --- Add Warnings Section (if any) ---
        if (this.warnings.length > 0) {
            const warningsContainer = createDOMElement('div', { className: 'report-section-container' });
            warningsContainer.innerHTML = renderValidationResults({ warnings: this.warnings, errors: [] });
            reportContainer.appendChild(warningsContainer);
        }

        // --- Build and Add Each Section ---
        this.sections.forEach((section, index) => {
            const sectionId = section.sectionId || `${this.reportId}-section-${index}`;
            const contentId = `${sectionId}-content`;

            const sectionEl = createDOMElement('div', { id: sectionId, className: 'report-section-copyable mt-6' });

            if (section.title) {
                sectionEl.appendChild(createDOMElement('div', { className: 'flex justify-between items-center mb-2' }, [
                    createDOMElement('h3', { className: 'report-header' }, [section.title]),
                    createDOMElement('button', { className: 'copy-section-btn bg-gray-200 text-gray-700 font-semibold py-1 px-3 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 text-xs print-hidden', dataset: { copyTargetId: contentId } }, ['Copy Section'])
                ]));
            }

            const contentContainer = createDOMElement('div', { id: contentId, className: 'copy-content' });

            // Handle different section types
            if (section.type === 'table') {
                const { headers, rows } = section.tableConfig;
                const table = createDOMElement('table', { className: 'w-full mt-2 results-table' });

                // Apply a distinct grey background to the table header row
                const headerRow = createDOMElement('tr', {});
                headers.forEach(h => headerRow.appendChild(createDOMElement('th', { className: 'bg-gray-100 dark:bg-gray-700' }, [h])));
                const thead = createDOMElement('thead', {}, [headerRow]);

                const tbody = createDOMElement('tbody');

                rows.forEach((row, rowIndex) => {
                    if (row.type === 'subheader') {
                        tbody.appendChild(createDOMElement('tr', { className: 'bg-gray-100 dark:bg-gray-700 font-semibold' }, [createDOMElement('td', { colspan: headers.length }, [row.content])]));
                    } else {
                        // Add a top border to all data rows
                        const trClasses = [];
                        if (rowIndex > 0) trClasses.push('border-t', 'dark:border-gray-700');
                        
                        // Apply the grey background if isHeader is true, regardless of position.
                        if (row.isHeader) {
                            trClasses.push('bg-gray-100', 'dark:bg-gray-700', 'font-semibold');
                        }
                        const detailId = `${sectionId}-detail-${rowIndex}`;
                        const detailsButton = row.details ? createDOMElement('button', { className: 'toggle-details-btn text-blue-600 dark:text-blue-400 hover:underline text-xs', dataset: { toggleId: detailId } }, ['[Show]']) : null;
                        
                        const tr = createDOMElement('tr', { className: trClasses.join(' ') });
                        row.cells.forEach((cell, cellIndex) => {
                            const td = createDOMElement('td');
                            td.innerHTML = cell; // Use innerHTML to render potential HTML in cells
                            if (cellIndex === 0 && detailsButton) {
                                td.appendChild(document.createTextNode(' '));
                                td.appendChild(detailsButton);
                            }
                            tr.appendChild(td);
                        });
                        tbody.appendChild(tr);

                        if (row.details) {
                            const detailsRow = createDOMElement('tr', { id: detailId, className: 'details-row' }, [createDOMElement('td', { colspan: headers.length, className: 'p-0' }, [createDOMElement('div', { className: 'calc-breakdown' }, [row.details])])]);
                            tbody.appendChild(detailsRow);
                        }
                    }
                });
                table.append(thead, tbody);
                contentContainer.appendChild(table);
            } else {
                contentContainer.innerHTML = section.htmlContent || '';
            }

            sectionEl.appendChild(contentContainer);
            reportContainer.appendChild(sectionEl);
        });

        mainContainer.appendChild(reportContainer);
    }
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

    // FIX: Add a guard to prevent re-attaching the listener
    if (container.dataset.reportListenersAttached === 'true') {
        return; // Listeners are already attached
    }
    container.dataset.reportListenersAttached = 'true';

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


/**
 * Creates a standardized calculation handler to reduce boilerplate code.
 * This function encapsulates the common pattern: gather, validate, calculate, render.
 * @param {object} config - The configuration object for the handler.
 * @param {string[]} [config.inputIds] - Array of input element IDs. Used if gatherInputsFunction is not provided.
 * @param {function} [config.gatherInputsFunction] - A function that returns the inputs object. Overrides inputIds.
 * @param {string} config.storageKey - Local storage key for saving inputs.
 * @param {string} config.validationRuleKey - Key for the validationRules object.
 * @param {function} config.calculatorFunction - The function that performs the calculation.
 * @param {function} config.renderFunction - The function that renders the results.
 * @param {string} config.resultsContainerId - The ID of the DOM element to render results into.
 * @param {function} [config.validatorFunction] - Optional. A custom function to perform validation. If not provided, a default validator is used.
 * @param {string} [config.feedbackElId='feedback-message'] - Optional. The ID of the feedback element.
 * @param {string} [config.buttonId] - Optional ID of the run button for loading state.
 * @returns {function} The generated event handler function.
 */
function createCalculationHandler(config) { // This is the function being called
    const {
        inputIds,
        gatherInputsFunction,
        storageKey,
        validationRuleKey,
        calculatorFunction,
        renderFunction,
        resultsContainerId,
        validatorFunction,
        feedbackElId = 'feedback-message',
        buttonId
    } = config;

    // Automatically highlight required fields for this calculator when it's created.
    if (validationRuleKey) {
        highlightRequiredFields(validationRuleKey);
    } else {
        // Add a console warning if the key is missing, as it's crucial for validation and report functionality.
        console.warn(`[createCalculationHandler] A 'validationRuleKey' não foi fornecida na configuração. A validação de entrada e os botões de relatório (Copiar, PDF, etc.) não funcionarão.`);
    }

    return async function() { // This function is already async, which is good.
        console.log(`[${validationRuleKey}] Calculation triggered.`);
        // --- 1. SETUP & GATHER INPUTS ---
        if (buttonId) setLoadingState(true, buttonId);
        showFeedback('Gathering inputs...', false, feedbackElId);

        // Use the provided gather function or the default one.
        console.log(`[${validationRuleKey}] Gathering inputs...`);
        const inputs = typeof gatherInputsFunction === 'function'
            ? gatherInputsFunction()
            : gatherInputsFromIds(inputIds);

        // Log the gathered inputs for debugging
        console.log(`[${validationRuleKey}] Gathered inputs:`, inputs);


        // --- 2. VALIDATE INPUTS ---
        showFeedback('Validating inputs...', false, feedbackElId);
        // Awaiting a resolved promise is a clean way to yield to the event loop, allowing the UI to update.
        console.log(`[${validationRuleKey}] Validating inputs...`);
        await Promise.resolve();

        // Use the custom validator if provided, otherwise use the default.
        let validation;
        if (typeof validatorFunction === 'function') {
            validation = validatorFunction(inputs);
        } else {
            // Access validationRules from the global scope (provided by validation-rules.js)
            const rules = window.validationRules ? validationRules[validationRuleKey] : {};
            // Assuming validateInputs is available globally (from validation-rules.js)
            if (typeof validateInputs === 'function') {
                validation = validateInputs(inputs, rules);
            } else {
                console.error("The function 'validateInputs' is not available. Check script loading order.");
                validation = { errors: ["Validation function is missing."], warnings: [] };
            }
        }

        const resultsContainer = document.getElementById(resultsContainerId);
        // Gracefully exit if the results container doesn't exist.
        if (!resultsContainer) {
            console.error(`Results container with ID "${resultsContainerId}" not found.`);
            if (buttonId) setLoadingState(false, buttonId);
            return;
        }

        if (validation.errors && validation.errors.length > 0) {
            renderValidationResults(validation, resultsContainer);
            console.error(`[${validationRuleKey}] Validation failed. Errors:`, validation.errors);
            showFeedback('Validation failed. Please correct the errors.', true, feedbackElId);
            if (buttonId) setLoadingState(false, buttonId);
            return;
        }

        // --- 3. PERFORM CALCULATION ---
        showFeedback('Running calculation...', false, feedbackElId);
        console.log(`[${validationRuleKey}] Performing calculation...`);
        await Promise.resolve();

        const calculationResult = safeCalculation(
            () => calculatorFunction(inputs, validation),
            'An unexpected error occurred during calculation'
        );

        // --- 4. RENDER RESULTS ---
        if (calculationResult.error) {
            console.error(`[${validationRuleKey}] Calculation error:`, calculationResult.error);
            renderValidationResults({ errors: [calculationResult.error] }, resultsContainer);
            showFeedback('Calculation failed.', true, feedbackElId);
        } else {
            console.log(`[${validationRuleKey}] Calculation successful. Rendering results...`);
            showFeedback('Rendering results...', false, feedbackElId);
            await Promise.resolve();

            saveInputsToLocalStorage(storageKey, inputs, '1.1');
            console.log(`[${validationRuleKey}] About to call renderFunction.`);
            renderFunction(calculationResult, inputs);

            console.log(`[${validationRuleKey}] Re-attaching report event listeners.`);
            // Find the report content element ID, assuming it follows the pattern `${pageKey}-report-content`
            // or is the first element inside the results container with a specific ID.
            const reportContentElement = resultsContainer.querySelector('[id$="-report-content"], .report-section-copyable');
            let reportContentId = reportContentElement ? reportContentElement.id : resultsContainerId;
            
            // If the render function uses the ReportBuilder, the ID should be passed in.
            // For safety, we use the container ID if the internal report ID can't be found, 
            // but this relies on the render function correctly outputting the element.

            attachReportEventListeners(resultsContainerId, {
                // Pass the containerId (where the ReportBuilder renders) for delegation, and the internal reportId for copy/download
                reportId: reportContentId, 
                filenamePrefix: `${validationRuleKey || 'report'}-Report`,
                onSendToCombos: config.onSendToCombos,
                toggleTexts: config.toggleTexts || { show: '[Show]', hide: '[Hide]', showAll: 'Show All Details', hideAll: 'Hide All Details' }
            });
            
            console.log(`[${validationRuleKey}] Event listeners attached to container #${resultsContainerId}. Targetting report content ID: #${reportContentId}`);
            showFeedback('Calculation complete!', false, feedbackElId);
        }

        if (buttonId) setLoadingState(false, buttonId);
    };
}

/**
 * Sends calculated loads from a source calculator to the Load Combinator page.
 * @param {object} loads - An object where keys are the `combo_*` input IDs and values are the loads to send.
 * @param {string} sourceName - The name of the source calculator (e.g., "Wind Calculator").
 * @param {string} loadType - The type of load being sent (e.g., "Wind", "Snow").
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
function sendToCombos(loads, sourceName, loadType, feedbackElId = 'feedback-message') {
    if (!loads || Object.keys(loads).length === 0) {
        showFeedback(`No ${loadType.toLowerCase()} results to send.`, true, feedbackElId);
        return;
    }
    const dataToSend = {
        source: sourceName, type: loadType, loads
    };
    localStorage.setItem('loadsForCombinator', JSON.stringify(dataToSend));
    window.location.href = 'combos.html';
}

/**
 * Populates material selection dropdowns based on data from AISC_SPEC.
 * It targets select elements with a `data-fy-target` or `data-fu-target` attribute.
 */
function populateMaterialDropdowns() {
    if (typeof AISC_SPEC === 'undefined' || !AISC_SPEC.structuralSteelGrades) {
        console.warn("AISC_SPEC or structuralSteelGrades not available for populateMaterialDropdowns.");
        return;
    }

    const gradeOptions = Object.keys(AISC_SPEC.structuralSteelGrades).map(grade =>
        `<option value="${grade}">${grade}</option>`
    ).join('');

    // Find all select elements that are meant to be material dropdowns
    document.querySelectorAll('select[data-fy-target], select[data-fu-target]').forEach(select => {
        select.innerHTML = gradeOptions;
        // Set a sensible default if one isn't already selected
        if (!select.value) {
            select.value = select.id.includes('plate') ? 'A36' : 'A992';
        }
        select.addEventListener('change', (e) => {
            const grade = AISC_SPEC.getSteelGrade(e.target.value);
            if (grade) {
                if (e.target.dataset.fyTarget) document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                if (e.target.dataset.fuTarget) document.getElementById(e.target.dataset.fuTarget).value = grade.Fu;
            }
        });
        select.dispatchEvent(new Event('change')); // Trigger initial population
    });
}

/**
 * Populates bolt grade selection dropdowns and sets up listeners to update related fields.
 * It targets select elements with a `data-is-bolt-grade-select` attribute.
 *
 * Required attributes on the <select> element:
 * - `data-is-bolt-grade-select="true"`: Identifies the dropdown.
 *
 * Optional attributes for automatic property updates:
 * - `data-fut-target="id_of_fut_input"`: ID of the input to update with Fnt value.
 * - `data-fnv-target="id_of_fnv_input"`: ID of the input to update with Fnv value.
 * - `data-threads-checkbox="id_of_threads_checkbox"`: ID of the checkbox that controls whether threads are included in the shear plane.
 */
function populateBoltGradeDropdowns() {
    if (typeof AISC_SPEC === 'undefined' || !AISC_SPEC.boltGrades) {
        console.warn("AISC_SPEC or boltGrades not available for populateBoltGradeDropdowns.");
        return;
    }

    const boltGradeOptions = Object.keys(AISC_SPEC.boltGrades).map(grade =>
        `<option value="${grade}">${grade}</option>`
    ).join('');

    document.querySelectorAll('select[data-is-bolt-grade-select="true"]').forEach(select => {
        select.innerHTML = boltGradeOptions;
        if (!select.value) select.value = 'A325'; // A common default

        const threadsCheckbox = document.getElementById(select.dataset.threadsCheckbox);

        const updateBoltProperties = () => {
            const grade = select.value;
            const threadsIncl = threadsCheckbox ? threadsCheckbox.checked : true; // Default to threads included if no checkbox
            if (select.dataset.fnvTarget) document.getElementById(select.dataset.fnvTarget).value = AISC_SPEC.getFnv(grade, threadsIncl).Fnv;
            if (select.dataset.futTarget) document.getElementById(select.dataset.futTarget).value = AISC_SPEC.getFnt(grade);
        };

        select.addEventListener('change', updateBoltProperties);
        if (threadsCheckbox) threadsCheckbox.addEventListener('change', updateBoltProperties);
        updateBoltProperties(); // Initial population
    });
}

/**
 * Populates bolt diameter dropdowns with typical sizes from the AISC database.
 * It targets select elements with a `data-is-bolt-diameter-select="true"` attribute.
 */
function populateBoltDiameterDropdowns() {
    if (typeof AISC_SPEC === 'undefined' || !AISC_SPEC.getTypicalBoltSizes) {
        console.warn("AISC_SPEC or getTypicalBoltSizes not available for populateBoltDiameterDropdowns.");
        return;
    }

    const boltSizes = AISC_SPEC.getTypicalBoltSizes();
    if (!boltSizes) {
        console.warn("getTypicalBoltSizes() returned no data.");
        return;
    }

    const boltOptions = Object.entries(boltSizes).map(([decimal, fractional]) =>
        `<option value="${decimal}">${fractional} (${decimal}")</option>`
    ).join('');

    document.querySelectorAll('select[data-is-bolt-diameter-select="true"]').forEach(select => {
        select.innerHTML = boltOptions;
        if (!select.value) select.value = '0.875'; // Set a common default (7/8") if no value is set
        // Dispatch a change event to ensure any dependent logic is triggered on initial load.
        select.dispatchEvent(new Event('change'));
    });
}

/**
 * Automatically loads the page-specific JavaScript file based on the HTML file's name.
 * For example, if the page is `wind.html`, it will attempt to load `wind.js`.
 * This avoids having to manually link each page's script in the HTML.
 */
function autoLoadPageScript() {
    const path = window.location.pathname;
    // Gets the full filename from the path, e.g., "wind.html" or "steel%20check.html"
    const pageFileName = path.substring(path.lastIndexOf('/') + 1);

    // Don't run on the index page or if there's no page name
    if (pageFileName === '' || pageFileName === 'index.html') {
        return;
    }

    // Decode URI component to handle spaces (e.g., "steel%20check.html" -> "steel check.html")
    // Then replace the .html extension with .js
    const scriptFileName = decodeURIComponent(pageFileName).replace('.html', '.js');

    // Check if a script with this name is already in the document to prevent re-declaration errors.
    const scriptAlreadyExists = document.querySelector(`script[src$="${encodeURIComponent(scriptFileName)}"]`);
    if (scriptAlreadyExists) {
        return; // Don't load the script again
    }

    const script = document.createElement('script');
    // Set the source to just the script's filename. The browser correctly resolves
    // this relative to the current HTML page's directory (e.g., from /asce/wind.html it will load asce/wind.js).
    script.src = scriptFileName;
    script.defer = true;
    document.head.appendChild(script);
}
/**
 * Populates a shape selection dropdown based on the currently selected section type.
 * It targets a select element with the ID `aisc_shape_select`.
 * It determines the shape type from an element with the ID `section_type` or `column_type`.
 */
async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    const typeSelect = document.getElementById('section_type') || document.getElementById('column_type');
    if (!shapeSelect || !typeSelect || typeof AISC_SPEC === 'undefined') return;

    const aiscShapeType = typeSelect.value;

    try {
        const shapes = await AISC_SPEC.getShapesByType(aiscShapeType);
        const shapeNames = Object.keys(shapes).sort();

        const currentVal = shapeSelect.value;
        shapeSelect.innerHTML = '<option value="">-- Manual Input --</option>'; // Reset
        shapeNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            shapeSelect.appendChild(option);
        });

        if (shapeNames.includes(currentVal)) {
            shapeSelect.value = currentVal;
        }

    } catch (error) {
        console.error("Failed to populate shape dropdown:", error);
        shapeSelect.innerHTML = '<option value="">Could not load shapes</option>';
    }
}

// --- Global Initialization Trigger ---
// This ensures autoLoadPageScript runs once the DOM is ready,
// which then loads the page-specific script that calls initializeApp.
document.addEventListener('DOMContentLoaded', () => {
    autoLoadPageScript();
});

/**
 * Returns an object with unit strings based on the selected unit system.
 * @param {string} unit_system - The unit system ('imperial' or 'metric').
 * @returns {{p_unit: string, h_unit: string, v_unit: string}}
 */
function getUnits(unit_system) {
    if (unit_system === 'metric') {
        return {
            p_unit: 'Pa',
            h_unit: 'm',
            v_unit: 'm/s'
        };
    }
    // Default to Imperial
    return {
        p_unit: 'psf',
        h_unit: 'ft',
        v_unit: 'mph'
    };
}

/**
 * Define um 'step' padrão como 'any' para todos os inputs numéricos que não têm um especificado.
 * Isso resolve problemas de validação com decimais (ex: 10.00, 12.56) em todas as calculadoras.
 */
function initializeGlobalInputSteps() {
    // Seleciona todos os inputs do tipo número na página
    const numberInputs = document.querySelectorAll('input[type="number"]');
    
    numberInputs.forEach(input => {
        // Só aplica se o input ainda não tiver um atributo 'step' definido manualmente
        if (!input.hasAttribute('step')) {
            input.setAttribute('step', 'any');
        }
    });
}