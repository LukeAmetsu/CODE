/**
 * Updates the theme toggle icons based on the current theme.
 * @param {boolean} isDark - Whether the dark theme is active.
 */
function updateThemeIcons(isDark) {
    const darkIcon = document.getElementById('theme-toggle-dark-icon');
    const lightIcon = document.getElementById('theme-toggle-light-icon');
    if (darkIcon && lightIcon) {
        darkIcon.classList.toggle('hidden', !isDark);
        lightIcon.classList.toggle('hidden', isDark);
    }
}

/**
 * Toggles the color theme, saves the preference, and updates the icons.
 */
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('color-theme', isDark ? 'dark' : 'light');
    updateThemeIcons(isDark);
}

/**
 * Initializes the theme toggle button functionality.
 */
function initializeThemeToggle() {
    const themeToggleButton = document.getElementById('theme-toggle');
    const isDark = document.documentElement.classList.contains('dark');
    updateThemeIcons(isDark);
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', toggleTheme);
    }
}

/**
 * A single initialization function for all shared UI components.
 */
function initializeSharedUI() {
    initializeThemeToggle();
    initializeBackToTopButton();
    initializeUiToggles();
}

/**
 * Initializes UI toggles based on data attributes for declarative UI logic.
 * Looks for `data-ui-toggle-controller` and attaches event listeners.
 *
 * Attributes:
 * - `data-ui-toggle-controller`: Marks the element as a controller.
 * - `data-ui-toggle-target`: A CSS selector for the target element(s).
 * - `data-ui-toggle-type`: 'visibility' (default) or 'disable'.
 * - `data-ui-toggle-condition-value`: The value the controller must have to trigger the action.
 * - `data-ui-toggle-condition-value`: The value(s) the controller must have to trigger the action (comma-separated for multiple values).
 * - `data-ui-toggle-condition-checked`: 'true' or 'false' for checkboxes.
 * - `data-ui-toggle-target-for`: The ID of the controller. Used on the target element.
 * - `data-ui-toggle-class`: The class to toggle for visibility (default: 'hidden').
 * - `data-ui-toggle-invert`: 'true' to invert the condition's result.
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
 * Performs linear interpolation for a given value within a dataset.
 * This is commonly used for looking up values in normative tables.
 * @param {number} x - The point at which to evaluate the interpolated value.
 * @param {number[]} xp - The array of x-coordinates of the data points.
 * @param {number[]} fp - The array of y-coordinates of the data points.
 * @returns {number} The interpolated y-value.
 */
function interpolate(x, xp, fp) {
    if (x <= xp[0]) return fp[0];
    if (x >= xp[xp.length - 1]) return fp[fp.length - 1];
    let i = 0;
    while (x > xp[i + 1]) i++;
    const x1 = xp[i], y1 = fp[i];
    const x2 = xp[i + 1], y2 = fp[i + 1];
    return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
}

/**
 * Validates a set of inputs against a predefined set of rules.
 * @param {object} inputs - The input values to validate.
 * @param {object} rules - The validation rules object.
 * @returns {{errors: string[], warnings: string[]}} - An object containing arrays of error and warning messages.
 */
function validateInputs(inputs, rules) {
    const errors = [];
    const warnings = [];

    if (rules) {
        for (const [key, rule] of Object.entries(rules)) {
            const value = inputs[key];
            const label = rule.label || key;

            if (rule.required && (value === undefined || value === '' || (typeof value === 'number' && isNaN(value)))) {
                errors.push(`${label} is required.`);
                continue;
            }
            if (typeof value === 'number' && !isNaN(value)) {
                if (rule.min !== undefined && value < rule.min) errors.push(`${label} must be at least ${rule.min}.`);
                if (rule.max !== undefined && value > rule.max) errors.push(`${label} must be no more than ${rule.max}.`);
            }
        }
    }
    return { errors, warnings };
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
        // We can only access cssRules for stylesheets on the same domain.
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
            const rect = svg.getBoundingClientRect();
            const viewBox = svg.viewBox.baseVal;

            // Prioritize dimensions: rendered size, viewBox, fallback. Ensure non-zero dimensions.
            const width = rect.width || (viewBox && viewBox.width) || 500;
            const height = rect.height || (viewBox && viewBox.height) || 300;

            clone.setAttribute('width', width);
            clone.setAttribute('height', height);

            // Determine background color from theme
            const isDarkMode = document.documentElement.classList.contains('dark');
            const backgroundColor = isDarkMode ? '#1f2937' : '#f9fafb'; // Corresponds to .diagram bg colors
            const backgroundRect = `<rect width="100%" height="100%" fill="${backgroundColor}"></rect>`;

            // Embed all page styles into the SVG for correct rendering.
            const styles = getAllCssStyles();
            const defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
            defs.innerHTML = styles;
            clone.insertBefore(defs, clone.firstChild);

            clone.setAttribute('width', width);
            clone.setAttribute('height', height);
            // Prepend the background rectangle to the cloned SVG's innerHTML
            clone.innerHTML = backgroundRect + clone.innerHTML;
            const xml = new XMLSerializer().serializeToString(clone);
            const svg64 = btoa(unescape(encodeURIComponent(xml)));
            const dataUrl = 'data:image/svg+xml;base64,' + svg64;

            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');

                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(image, 0, 0);

                const pngImage = new Image();
                pngImage.src = canvas.toDataURL('image/png');
                pngImage.style.maxWidth = '100%';
                pngImage.style.height = 'auto';
                resolve(pngImage);
            };
            image.onerror = (e) => {
                console.error("Image loading error during SVG conversion:", e);
                reject(new Error("Image could not be loaded for conversion."));
            };
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
function createWordCompatibleHTML(content, title, cssStyles) {
    return `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>${title}</title>
            <style>
                /* Basic styles for Word compatibility */
                body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; }
                table { border-collapse: collapse; width: 100%; margin-bottom: 1em; }
                th, td { border: 1px solid #000; padding: 4px 8px; text-align: left; }
                th { background-color: #f0f0f0; font-weight: bold; }
                caption { font-weight: bold; text-align: center; margin-bottom: 0.5em; }
                h1, h2, h3, h4 { font-family: 'Arial', sans-serif; }
                h1 { font-size: 16pt; text-align: center; }
                h2 { font-size: 14pt; border-bottom: 1px solid #000; margin-top: 1.5em; }
                h3 { font-size: 13pt; }
                .pass { color: #008000; font-weight: bold; }
                .fail { color: #ff0000; font-weight: bold; }
                /* Embed all page styles for better fidelity */
                ${cssStyles}
            </style>
        </head>
        <body>
            ${content}
        </body>
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
        let line = el.innerText.trim();
        if (tagName === 'h1') textParts.push(`\n# ${line}\n\n`);
        else if (tagName === 'h2') textParts.push(`\n## ${line}\n\n`);
        else if (tagName === 'h3') textParts.push(`\n### ${line}\n`);
        else if (tagName === 'h4') textParts.push(`\n#### ${line}\n`);
        else if (tagName === 'caption') textParts.push(`\n--- ${line} ---\n`);
        else if (tagName === 'li') textParts.push(`* ${line}`); // Keep li as is
        else if (tagName === 'tr') {
            const cells = Array.from(el.querySelectorAll('th, td')).map(cell => cell.innerText.trim());
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
async function handleCopyToClipboard(containerId, feedbackElId = 'feedback-message') {
    try {
        const container = document.getElementById(containerId);
        if (!container) {
            showFeedback('Report container not found.', true, feedbackElId);
            return;
        }

        showFeedback('Preparing report for copying...', false, feedbackElId);
        const clone = container.cloneNode(true);

        // Prepare the clone for copying: remove interactive elements, expand details, and remove empty rows.
        clone.querySelectorAll('button, .print-hidden, [data-copy-ignore]').forEach(el => el.remove());
        clone.querySelectorAll('.details-row').forEach(row => row.classList.add('is-visible'));

        // Convert SVGs to PNGs
        let conversionFailures = 0;
        const svgElements = Array.from(clone.querySelectorAll('svg'));
        if (svgElements.length > 0) {
            showFeedback(`Converting ${svgElements.length} diagram(s) to images...`, false, feedbackElId);
            // Use Promise.all to run conversions in parallel for better performance.
            await Promise.all(svgElements.map(async (svg) => {
                try {
                    const pngImage = await convertSvgToPng(svg);
                    if (pngImage && svg.parentNode) {
                        svg.parentNode.replaceChild(pngImage, svg);
                    } else if (svg.parentNode) { svg.parentNode.remove(); }
                } catch (error) {
                    console.warn("SVG to PNG conversion failed:", error);
                    conversionFailures++;
                    if (svg.parentNode) svg.parentNode.remove(); // Remove SVG if conversion fails to avoid broken images.
                }
            }));
        }
        
        // Remove empty table rows that might be left after removing buttons
        clone.querySelectorAll('tr').forEach(tr => {
            if (tr.innerText.trim() === '') {
                tr.remove();
            }
        });

        showFeedback('Copying to clipboard...', false, feedbackElId);

        // Generate final HTML and Text content, consistent with handleDownloadWord
        const reportTitle = document.getElementById('main-title')?.innerText || 'Calculation Report';
        const htmlContent = createWordCompatibleHTML(clone.innerHTML, reportTitle); // Use the simpler HTML structure
        const plainTextContent = convertElementToPlainText(clone);

        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });
        await navigator.clipboard.write([
            new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
        ]);

        let feedback = 'Report and diagrams copied successfully!';
        if (conversionFailures > 0) {
            feedback = `Report copied, but ${conversionFailures} diagram(s) could not be converted.`;
        }
        showFeedback(feedback, false, feedbackElId);
    } catch (err) {
        console.error('Clipboard API failed:', err);
        showFeedback('Copy failed. Your browser may not support this feature.', true, feedbackElId);
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
        margin:       0.5,
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
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
    
    // Remove empty table rows that might be left after removing buttons
    clone.querySelectorAll('tr').forEach(tr => {
        if (tr.innerText.trim() === '') {
            tr.remove();
        }
    });
    // Convert SVGs to PNGs
    const svgElements = Array.from(clone.querySelectorAll('svg'));
    if (svgElements.length > 0) {
        showFeedback(`Converting ${svgElements.length} diagram(s)...`, false, feedbackElId);
        await Promise.all(svgElements.map(async (svg) => {
            try {
                const pngImage = await convertSvgToPng(svg);
                if (pngImage && svg.parentNode) {
                    svg.parentNode.replaceChild(pngImage, svg);
                }
            } catch (error) {
                console.warn("SVG to PNG conversion failed for Word export:", error);
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
 * Copies a diagram (SVG or Canvas) to the clipboard as a PNG image.
 * @param {string} containerId - The ID of the container holding the diagram.
 * @param {string} [feedbackElId='feedback-message'] - The ID of the feedback element.
 */
async function handleCopyDiagramToClipboard(containerId, feedbackElId = 'feedback-message') {
    const container = document.getElementById(containerId);
    if (!container) {
        showFeedback('Diagram container not found.', true, feedbackElId);
        return;
    }

    const svg = container.querySelector('svg');
    const canvas = container.querySelector('canvas');

    if (!svg && !canvas) {
        showFeedback('No SVG or Canvas found in the container to copy.', true, feedbackElId);
        return;
    }

    showFeedback('Generating image for clipboard...', false, feedbackElId);

    try {
        let blob;
        if (svg) {
            // Convert SVG to a PNG blob
            const pngImage = await convertSvgToPng(svg);
            const canvasForSvg = document.createElement('canvas');
            canvasForSvg.width = pngImage.width;
            canvasForSvg.height = pngImage.height;
            const ctx = canvasForSvg.getContext('2d');
            ctx.drawImage(pngImage, 0, 0);
            blob = await new Promise(resolve => canvasForSvg.toBlob(resolve, 'image/png'));
        } else { // It's a canvas
            // For the 3D canvas, we need to re-render to ensure it's not blank
            if (container.renderer && container.camera && container.scene) {
                container.renderer.render(container.scene, container.camera);
            }
            blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        }

        if (!blob) {
            throw new Error('Failed to create image blob.');
        }

        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);
        showFeedback('Diagram copied to clipboard as an image.', false, feedbackElId);
    } catch (err) {
        console.error('Failed to copy diagram:', err);
        showFeedback('Failed to copy diagram. Your browser may not support this feature.', true, feedbackElId);
    }
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
function loadInputsFromLocalStorage(storageKey, inputIds, onComplete, appVersion = '1.0') {
    const dataStr = localStorage.getItem(storageKey);
    if (!dataStr) {
        return; // No saved data found, do not proceed.
    }
    try {
        const inputs = JSON.parse(dataStr);

        // Version check: If the saved data has no version or a different version, discard it.
        if (inputs._version !== appVersion) {
            console.warn(`LocalStorage data for '${storageKey}' is outdated (v${inputs._version} vs current v${appVersion}). Discarding.`);
            localStorage.removeItem(storageKey);
            return;
        }

        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            // Try to find a value for the current element's ID.
            // 1. Look for a direct match (e.g., inputs['snow_risk_category']).
            // 2. If it's project data, look for a generic match (e.g., inputs['risk_category']).
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
        // Only run the onComplete callback if data was actually found and loaded.
        if (typeof onComplete === 'function') {
            onComplete();
        }
    } catch (error) {
        console.error('Could not load inputs from local storage:', error);
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

    return async function() { // This function is already async, which is good.
        if (buttonId) setLoadingState(true, buttonId);
        showFeedback('Gathering inputs...', false, feedbackElId);

        const inputs = typeof gatherInputsFunction === 'function' 
            ? gatherInputsFunction() 
            : gatherInputsFromIds(inputIds);
        
        showFeedback('Validating inputs...', false, feedbackElId);
        await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update

        let validation;
        if (typeof validatorFunction === 'function') {
            validation = validatorFunction(inputs);
        } else {
            const rules = validationRules[validationRuleKey];
            validation = validateInputs(inputs, rules);
        }

        const resultsContainer = document.getElementById(resultsContainerId);

        if (validation.errors.length > 0) {
            renderValidationResults(validation, resultsContainer);
            showFeedback('Validation failed. Please correct the errors.', true, feedbackElId);
            if (buttonId) setLoadingState(false, buttonId);
            return;
        }

        showFeedback('Running calculation...', false, feedbackElId);
        await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update

        const calculationResult = safeCalculation(
            () => calculatorFunction(inputs, validation),
            'An unexpected error occurred during calculation'
        );

        await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update

        if (calculationResult.error) {
            renderValidationResults({ errors: [calculationResult.error] }, resultsContainer);
            showFeedback('Calculation failed.', true, feedbackElId);
        } else {
            showFeedback('Rendering results...', false, feedbackElId);
            await new Promise(resolve => setTimeout(resolve, 50)); // Allow UI to update

            saveInputsToLocalStorage(storageKey, inputs);
            renderFunction(calculationResult, inputs);
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