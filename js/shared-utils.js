/**
 * Shared Utilities for Engineering Calculators
 * Contains the core logic for handling calculator state, events, and reporting.
 */

// --- USER PROVIDED HANDLER ---

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
        buttonId,
        onCalculationStart,
        onCalculationEnd,
        resetButtonId
    } = config;

    // --- SETUP RESET BUTTON ---
    if (resetButtonId) {
        const resetBtn = document.getElementById(resetButtonId);
        if (resetBtn) {
            // Remove old listeners ideally, but assuming this is called once per page load
            const newResetBtn = resetBtn.cloneNode(true);
            resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
            
            newResetBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to reset all fields?')) {
                    // Reset inputs
                    if (inputIds && Array.isArray(inputIds)) {
                        inputIds.forEach(id => {
                            const el = document.getElementById(id);
                            if (el) {
                                if (el.type === 'checkbox') el.checked = false;
                                else el.value = '';
                                el.dispatchEvent(new Event('change'));
                            }
                        });
                    }
                    // Clear results
                    const resultsParams = document.getElementById(resultsContainerId);
                    if (resultsParams) resultsParams.innerHTML = '';
                    // Clear storage if needed? Maybe separate button.
                    showFeedback('Form reset.', 'info', feedbackElId);
                }
            });
        }
    }

    // Automatically highlight required fields for this calculator when it's created.
    if (validationRuleKey) {
        highlightRequiredFields(validationRuleKey);
    } else {
        // Add a console warning if the key is missing, as it's crucial for validation and report functionality.
        console.warn(`[createCalculationHandler] A 'validationRuleKey' não foi fornecida na configuração. A validação de entrada e os botões de relatório (Copiar, PDF, etc.) não funcionarão.`);
    }

    return async function () { // This function is already async, which is good.
        console.log(`[${validationRuleKey}] Calculation triggered.`);
        // --- 1. SETUP & GATHER INPUTS ---
        if (buttonId) setLoadingState(true, buttonId);
        showFeedback('Gathering inputs...', 'info', feedbackElId);
        
        if (typeof onCalculationStart === 'function') {
            try { onCalculationStart(); } catch(e) { console.error('Error in onCalculationStart:', e); }
        }

        // Use the provided gather function or the default one.
        console.log(`[${validationRuleKey}] Gathering inputs...`);
        const inputs = typeof gatherInputsFunction === 'function'
            ? gatherInputsFunction()
            : gatherInputsFromIds(inputIds);

        // Log the gathered inputs for debugging
        console.log(`[${validationRuleKey}] Gathered inputs:`, inputs);


        // --- 2. VALIDATE INPUTS ---
        // --- 2. VALIDATE INPUTS ---
        showFeedback('Validating inputs...', 'info', feedbackElId);
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
                // Fix: validateInputs expects an array of input IDs, not the inputs object.
                // We use Object.keys(inputs) to pass the list of field IDs.
                validation = validateInputs(Object.keys(inputs), rules);
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
            console.error(`[${validationRuleKey}] Validation failed. Errors:`, validation.errors);
            showFeedback('Validation failed. Please correct the errors.', 'error', feedbackElId);
            if (buttonId) setLoadingState(false, buttonId);
            return;
        }

        // --- 3. PERFORM CALCULATION ---
        // --- 3. PERFORM CALCULATION ---
        showFeedback('Running calculation...', 'info', feedbackElId);
        console.log(`[${validationRuleKey}] Performing calculation...`);
        await Promise.resolve();

        let calculationResult = safeCalculation(
            () => calculatorFunction(inputs, validation),
            'An unexpected error occurred during calculation'
        );

        if (calculationResult instanceof Promise) {
            try {
                calculationResult = await calculationResult;
            } catch (e) {
                console.error(e);
                calculationResult = { error: 'Measurement calculation failed: ' + e.message };
            }
        }

        // --- 4. RENDER RESULTS ---
        if (calculationResult.error) {
            console.error(`[${validationRuleKey}] Calculation error:`, calculationResult.error);
            renderValidationResults({ errors: [calculationResult.error] }, resultsContainer);
            renderValidationResults({ errors: [calculationResult.error] }, resultsContainer);
            showFeedback('Calculation failed.', 'error', feedbackElId);
        } else {
            console.log(`[${validationRuleKey}] Calculation successful. Rendering results...`);
            console.log(`[${validationRuleKey}] Calculation successful. Rendering results...`);
            showFeedback('Rendering results...', 'info', feedbackElId);
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
            console.log(`[${validationRuleKey}] Event listeners attached to container #${resultsContainerId}. Targetting report content ID: #${reportContentId}`);
            showFeedback('Calculation complete!', 'success', feedbackElId);
            
            if (typeof onCalculationEnd === 'function') {
                try { onCalculationEnd(calculationResult); } catch(e) { console.error('Error in onCalculationEnd:', e); }
            }
        }

        if (buttonId) setLoadingState(false, buttonId);
    };
}

// --- HELPER FUNCTIONS REQUIRED BY HANDLER ---

/**
 * Gathers values from a list of input IDs.
 */
function gatherInputsFromIds(ids) {
    const inputs = {};
    if (!ids || !Array.isArray(ids)) return inputs;

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (el.type === 'checkbox') {
                inputs[id] = el.checked;
            } else if (el.type === 'number' || el.classList.contains('numeric-input') || el.inputMode === 'decimal') {
                const mathVal = safeMathEval(el.value);
                inputs[id] = mathVal !== null ? mathVal : parseFloat(el.value);
            } else {
                inputs[id] = el.value;
            }
        }
    });
    return inputs;
}

/**
 * Highlights required fields in the UI based on validation rules.
 */
function highlightRequiredFields(key) {
    if (!window.validationRules || !window.validationRules[key]) return;
    const rules = window.validationRules[key];

    // Simple implementation: find labels for required fields and add a class or marker
    Object.keys(rules).forEach(fieldId => {
        if (rules[fieldId].required) {
            const input = document.getElementById(fieldId);
            if (input) {
                // Find associated label (assuming standard label + input structure)
                const label = document.querySelector(`label[for="${fieldId}"]`);
                if (label) {
                    label.classList.add('required-field');
                    if (!label.innerHTML.includes('*')) {
                        label.innerHTML += ' <span style="color:red">*</span>';
                    }
                }
            }
        }
    });
}

/**
 * Updates the loading state of the calculation button.
 */
function setLoadingState(isLoading, buttonId) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.textContent;
        btn.textContent = 'Calculating...';
        btn.classList.add('loading');
    } else {
        btn.disabled = false;
        if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
        btn.classList.remove('loading');
    }
}

/**
 * Shows a feedback message to the user.
 * Supports 'success', 'error', 'warning', 'info'.
 */
function showFeedback(message, typeOrIsError, elementId = 'feedback-message') {
    const el = document.getElementById(elementId);
    if (!el) return;

    // Backward compatibility: handle boolean for isError
    let type = 'success';
    if (typeof typeOrIsError === 'boolean') {
        type = typeOrIsError ? 'error' : 'success';
    } else if (typeof typeOrIsError === 'string') {
        type = typeOrIsError;
    }

    el.textContent = message;
    
    // Map types to classes
    const classMap = {
        'success': 'feedback-success text-green-600 bg-green-100 border-green-400',
        'error': 'feedback-error text-red-600 bg-red-100 border-red-400',
        'warning': 'feedback-warning text-yellow-600 bg-yellow-100 border-yellow-400',
        'info': 'feedback-info text-blue-600 bg-blue-100 border-blue-400'
    };
    
    // Reset classes and add base + specific (clearing old specific classes first)
    el.className = `feedback-message p-4 mb-4 text-sm rounded-lg border ${classMap[type] || classMap['info']}`;
    el.style.display = 'block';
    
    // Reset opacity for transition
    el.style.opacity = '1';

    // Auto-hide unless it's an error
    if (type !== 'error') {
        // Clear existing timeout if any
        if (el.dataset.timeoutId) clearTimeout(parseInt(el.dataset.timeoutId));
        
        const timeoutId = setTimeout(() => {
            el.style.transition = 'opacity 0.5s ease-out';
            el.style.opacity = '0';
            setTimeout(() => {
                el.style.display = 'none';
                el.style.opacity = '1';
                el.style.transition = '';
            }, 500);
        }, 3000);
        el.dataset.timeoutId = timeoutId;
    }
}

/**
 * Renders validation errors into the results container.
 */
/**
 * Renders validation errors into the results container.
 * Returns the HTML string.
 */
function renderValidationResults(validation, container) {
    const hasErrors = validation.errors && validation.errors.length > 0;
    const hasWarnings = validation.warnings && validation.warnings.length > 0;
    
    let html = '';
    if (hasErrors) {
        html += '<div class="validation-summary error-box border border-rose-300 dark:border-rose-800/80 bg-rose-50 dark:bg-rose-950/40 p-4 rounded-xl text-rose-800 dark:text-rose-200 mb-3 shadow-sm">';
        html += '<div class="flex items-center gap-2 mb-2 font-bold text-sm text-rose-900 dark:text-rose-100"><span>⚠️</span> <span>Erros de Entrada Detectados:</span></div><ul class="list-disc pl-5 space-y-1 text-xs text-rose-800 dark:text-rose-200">';
        validation.errors.forEach(err => {
            const msg = (typeof err === 'object') ? (err.message || err.msg || JSON.stringify(err)) : err;
            html += `<li>${msg}</li>`;
        });
        html += '</ul></div>';
    }
    
    if (hasWarnings) {
        html += '<div class="validation-summary warning-box border border-amber-300 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 p-4 rounded-xl text-amber-800 dark:text-amber-200 mb-3 shadow-sm">';
        html += '<div class="flex items-center gap-2 mb-2 font-bold text-sm text-amber-900 dark:text-amber-100"><span>⚡</span> <span>Avisos e Recomendações:</span></div><ul class="list-disc pl-5 space-y-1 text-xs text-amber-800 dark:text-amber-200">';
        validation.warnings.forEach(warn => {
            html += `<li>${warn}</li>`;
        });
        html += '</ul></div>';
    }

    if (container) {
        container.innerHTML = html;
    }
    return html;
}

/**
 * Safely executes the calculation function.
 */
function safeCalculation(func, errorMessage) {
    try {
        return func();
    } catch (e) {
        console.error(e);
        return { error: errorMessage + ': ' + e.message };
    }
}

/**
 * Saves input values to localStorage.
 */
function saveInputsToLocalStorage(key, inputs, version) {
    if (!key) return;
    try {
        const data = {
            version: version,
            timestamp: new Date().toISOString(),
            inputs: inputs
        };
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('Failed to save to localStorage:', e);
    }
}

/**
 * Universal Form Session Management
 * Automatically serializes and saves all input, select, textarea elements in a container/form.
 */
function saveFormSession(key, formOrSelector, customData = null) {
    if (!key) return;
    try {
        const root = typeof formOrSelector === 'string' ? document.querySelector(formOrSelector) : formOrSelector;
        const inputs = {};
        if (root) {
            const elements = root.querySelectorAll('input, select, textarea');
            elements.forEach(el => {
                if (!el.id) return;
                if (el.type === 'checkbox') {
                    inputs[el.id] = el.checked;
                } else if (el.type === 'radio') {
                    if (el.checked) inputs[el.name || el.id] = el.value;
                } else {
                    inputs[el.id] = el.value;
                }
            });
        }
        const payload = {
            version: '1.1',
            timestamp: Date.now(),
            inputs: inputs,
            customData: customData
        };
        localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
        console.warn(`[saveFormSession] Error saving ${key}:`, e);
    }
}

function loadFormSession(key, formOrSelector, customDataApplyFn = null) {
    if (!key) return false;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    try {
        const payload = JSON.parse(raw);
        if (!payload) return false;

        const root = typeof formOrSelector === 'string' ? document.querySelector(formOrSelector) : formOrSelector;
        const inputs = payload.inputs || {};

        if (root) {
            Object.entries(inputs).forEach(([id, val]) => {
                const el = root.querySelector(`#${id}`) || document.getElementById(id);
                if (!el) return;
                if (el.type === 'checkbox') {
                    el.checked = !!val;
                } else if (el.type === 'radio') {
                    if (el.value === val) el.checked = true;
                } else if (val !== undefined && val !== null) {
                    el.value = val;
                }
            });
        }

        if (typeof customDataApplyFn === 'function' && payload.customData !== undefined) {
            customDataApplyFn(payload.customData);
        }

        return true;
    } catch (e) {
        console.warn(`[loadFormSession] Error restoring ${key}:`, e);
        return false;
    }
}

function clearFormSession(key) {
    if (!key) return;
    localStorage.removeItem(key);
}

function bindFormAutoSave(key, formOrSelector, getCustomDataFn = null, debounceMs = 300) {
    const root = typeof formOrSelector === 'string' ? document.querySelector(formOrSelector) : formOrSelector;
    if (!root) return;

    let timeout;
    const triggerSave = () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            const customData = typeof getCustomDataFn === 'function' ? getCustomDataFn() : null;
            saveFormSession(key, root, customData);
        }, debounceMs);
    };

    root.addEventListener('input', triggerSave);
    root.addEventListener('change', triggerSave);
    window.addEventListener('beforeunload', () => {
        const customData = typeof getCustomDataFn === 'function' ? getCustomDataFn() : null;
        saveFormSession(key, root, customData);
    });
}

/**
 * Attaches event listeners for report actions (Copy, PDF, etc.).
 * Assumes buttons might exist within the rendered report or outside it.
 */
function attachReportEventListeners(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Delegate click events for report actions
    container.addEventListener('click', (e) => {
        if (e.target.matches('.btn-copy-report')) {
            copyReportToClipboard(options.reportId);
        } else if (e.target.matches('.btn-print-report')) {
            printReport(options.reportId);
        } else if (e.target.matches('.toggle-details')) {
            // Handle show/hide details logic if implemented
            const details = e.target.nextElementSibling;
            if (details && details.classList.contains('details-content')) {
                details.style.display = details.style.display === 'none' ? 'block' : 'none';
            }
        }
    });
}

// Modern Clipboard Copy
async function copyReportToClipboard(elementId) {
    const el = document.getElementById(elementId);
    if (!el) {
        console.warn('Report element not found for copying.');
        return;
    }

    const text = el.innerText; // Get text content

    try {
        await navigator.clipboard.writeText(text);
        showFeedback('Report copied to clipboard!', 'success', 'feedback-message');
    } catch (err) {
        console.warn('Clipboard API failed, trying fallback...', err);
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed'; // Avoid scrolling
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            showFeedback('Report copied to clipboard (fallback)!', 'success', 'feedback-message');
        } catch (fallbackErr) {
            console.error('Failed to copy report:', fallbackErr);
            showFeedback('Failed to copy report.', 'error', 'feedback-message');
        }
        document.body.removeChild(textarea);
    }
}

// Stub for printing
function printReport(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Print Report</title>');
    // Include styles if necessary
    printWindow.document.write('</head><body>');
    printWindow.document.write(el.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

/**
 * Safely evaluates a mathematical expression string.
 * Allows basic operators: +, -, *, /, (, ), and decimal numbers.
 * @param {string|number} expression - The expression to evaluate.
 * @returns {number|null} The evaluated number or null if invalid.
 */
function safeMathEval(expression) {
    if (expression === null || expression === undefined || expression === '') return null;
    if (typeof expression === 'number') return expression;

    // Convert to string and sanitize
    const str = String(expression);
    // Allow digits, dots, spaces, and operators +, -, *, /, (, )
    if (!/^[0-9+\-*/().\s]+$/.test(str)) {
        // Fallback for simple parse if invalid chars found (though input type usually restricts this)
        const val = parseFloat(str);
        return isNaN(val) ? null : val;
    }

    try {
        // Use Function constructor to evaluate safely-ish (sandboxed by regex check)
        // "return " + str
        const func = new Function('return ' + str);
        const result = func();
        return isFinite(result) ? result : null;
    } catch (e) {
        return null;
    }
}

/**
 * Retrieves the numeric value of an input element by its ID.
 * Supports mathematical equations (e.g. "2+2").
 * @param {string} id The ID of the input element.
 * @returns {number|null} The numeric value, or null if conversion fails.
 */
function getInputValue(id) {
    const element = document.getElementById(id);
    if (element) {
        return safeMathEval(element.value);
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
 * A single initialization function for all shared UI components.
 */
function initializeSharedUI() {
    applyThemeFromLocalStorage(); // Garante estado correto ao carregar JS
    initializeThemeToggle();       // Configura botão e ícones
    initializeBackToTopButton();
    initializeUiToggles();
    initializeGlobalInputSteps();
    enableMathInInputs(); // Enable math expressions for all numeric inputs
}

/**
 * Enables mathematical expressions in numeric inputs.
 * Converts type="number" to type="text" to allow characters like +, -, *, /, (, ).
 * Evaluates the expression on blur.
 * Also sets up a MutationObserver to handle dynamically added inputs.
 */
function enableMathInInputs() {
    const processInput = (input) => {
        // Only process inputs that are numbers or have the numeric-input class
        if (input.tagName !== 'INPUT') return;
        if (input.type !== 'number' && !input.classList.contains('numeric-input')) return;

        // Convert to text to allow typing expressions
        if (input.type === 'number') {
            input.type = 'text';
            input.inputMode = 'decimal'; // Show numeric keyboard on mobile
        }
        
        // Remove old listeners to avoid duplicates if re-initializing
        input.removeEventListener('blur', handleMathInputBlur);
        input.addEventListener('blur', handleMathInputBlur);
        
        // Also handle "Enter" key to evaluate without blurring
        input.removeEventListener('keydown', handleMathInputKeydown);
        input.addEventListener('keydown', handleMathInputKeydown);
    };

    // 1. Process existing inputs
    const numericInputs = document.querySelectorAll('input[type="number"], input.numeric-input');
    numericInputs.forEach(processInput);

    // 2. Set up MutationObserver for dynamically added inputs (e.g., in batch tables)
    // Prevent multiple observers if initializeSharedUI is called multiple times
    if (window._mathInputsObserver) {
        window._mathInputsObserver.disconnect();
    }

    window._mathInputsObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    // Check if the added node is an element
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // If the node itself is an input
                        if (node.tagName === 'INPUT') {
                            processInput(node);
                        }
                        // Check for inputs inside the added node
                        const inputs = node.querySelectorAll('input[type="number"], input.numeric-input');
                        inputs.forEach(processInput);
                    }
                });
            }
        });
    });

    // Start observing the body for added nodes
    window._mathInputsObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function handleMathInputBlur(e) {
    evaluateInputExpression(e.target);
}

function handleMathInputKeydown(e) {
    if (e.key === 'Enter') {
        evaluateInputExpression(e.target);
        // Note: We don't preventDefault here usually, so that form submission or other listeners can still happen
        // assuming they run *after* this sync evaluation or pick up the updated value.
    }
}

function evaluateInputExpression(input) {
    const originalValue = input.value;
    if (!originalValue) return;

    // Check if it looks like a math expression (contains operators)
    if (/[+\-*/()]/.test(originalValue)) {
        const result = safeMathEval(originalValue);
        if (result !== null && isFinite(result)) {
            // Update value if valid
            // Format to reasonable decimals if needed, or keep precision?
            // Let's keep distinct precision but avoid long float errors like 3.000000004
            
            // Check if it's an integer
            if (Number.isInteger(result)) {
                input.value = result.toString();
            } else {
                // Determine precision based on magnitude? Or just max 6 decimals
                // parseFloat(toFixed(6)) removes trailing zeros
                input.value = parseFloat(result.toFixed(6)).toString(); 
            }
            
            // Trigger change event so calculators know value updated
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
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
                    } else if (diagram.tagName.toLowerCase() === 'canvas') {
                        if (engine && scene) {
                             // Handle BabylonJS canvas
                            pngImage = await new Promise(res => BABYLON.Tools.CreateScreenshot(engine, scene.activeCamera, { finalWidth: diagram.width, finalHeight: diagram.height }, data => res(data)));
                        } else {
                            // Handle standard 2D canvas
                            const dataUrl = diagram.toDataURL('image/png');
                            pngImage = new Image();
                            pngImage.src = dataUrl;
                             // Wait for image load
                            await new Promise(resolve => {
                                if (pngImage.complete) resolve();
                                else pngImage.onload = resolve;
                            });
                        }
                    }
                    if (pngImage && diagram.parentNode) {
                        // Maintain original size
                        if (diagram.style.width) pngImage.style.width = diagram.style.width;
                        if (diagram.style.height) pngImage.style.height = diagram.style.height;
                        if (diagram.width) pngImage.width = diagram.width;
                        if (diagram.height) pngImage.height = diagram.height;
                        
                        diagram.parentNode.replaceChild(pngImage, diagram);
                    } else if (diagram.parentNode) { diagram.parentNode.remove(); }
                } catch (error) {
                    console.warn("SVG/Canvas to PNG conversion failed:", error);
                    conversionFailures++;
                    if (diagram.parentNode) diagram.parentNode.remove(); // Remove if conversion fails
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
        margin: 0.5,
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
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
    const blob = new Blob([dataStr], { type: "text/plain;charset=utf-8" });
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
    return function () {
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
    return function (event) {
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
            const version = inputs._version || inputs.version || '1.1';
            // Version check: If the saved data has a matching version, apply it.
            if (version === appVersion || !inputs.version) {
                const values = inputs.inputs || inputs;
                loadedInputs = values; // Mark as valid

                inputIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;

                    let valueToApply;
                    if (values[id] !== undefined) {
                        valueToApply = values[id];
                    } else if (storageKey === 'buildingProjectData') {
                        const genericKey = id.substring(id.indexOf('_') + 1);
                        if (values[genericKey] !== undefined) {
                            valueToApply = values[genericKey];
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
                console.warn(`LocalStorage data for '${storageKey}' is outdated (v${version} vs current v${appVersion}). Discarding.`);
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
    // --- VISUAL DEBUGGER INJECTION REMOVED ---
    
    // window.onerror = function(msg, url, line) { ... } removed along with debugger

    console.log("Initializing App...");

    if (typeof i18n !== 'undefined' && typeof i18n.initialize === 'function') {
        try {
            await i18n.initialize();
            console.log("i18n initialized successfully.");
        } catch (e) {
            console.error("i18n initialization failed:", e);
        }
    } else {
        console.warn("i18n is not defined!");
    }

    // --- 1. Discover Page and Inject Header/Footer ---
    // ROBUST PATH PREFIX DETECTION
    // We explicitly check known subdirectories first to ensure 100% reliability.
    let pathPrefix = './'; 
    const currentPathStr = window.location.pathname;
    // Normalize path separators to forward slashes just in case
    const normalizedPath = currentPathStr.replace(/\\/g, '/');
    
    if (normalizedPath.includes('/asce/') || 
        normalizedPath.includes('/aisc/') || 
        normalizedPath.includes('/nbr/') || 
        normalizedPath.includes('/gui/') || 
        normalizedPath.includes('/nds/')) {
        pathPrefix = '../';
    } else {
        // Fallback: Check script tag if not in a known subdirectory
        const scriptEl = document.querySelector('script[src*="shared-utils.js"]');
        if (scriptEl) {
            const src = scriptEl.getAttribute('src'); 
            const match = src.match(/(.*)js\/shared-utils\\.js/);
            if (match && match[1]) {
                pathPrefix = match[1]; 
            } else if (src.includes('shared-utils.js')) {
                pathPrefix = src.replace('shared-utils.js', '');
            }
        }
    }

    const path = window.location.pathname;
    const pageName = decodeURIComponent(path.substring(path.lastIndexOf('/') + 1));
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
            createDOMElement('button', { id: btn.id, className: `eng-btn-secondary text-xs print-hidden ${btn.classes || ''}` }, [btn.text])
        );

        const header = createDOMElement('div', { className: 'flex justify-between items-center border-b border-gray-200 dark:border-gray-700 pb-4 mb-4' }, [
            createDOMElement('h2', { className: 'text-2xl font-bold text-gray-800 dark:text-gray-100' }, [this.title]),
            createDOMElement('div', { className: 'flex items-center gap-2 print-hidden flex-wrap' }, [
                createDOMElement('button', { id: 'toggle-all-details-btn', className: 'eng-btn-secondary text-xs', dataset: { state: 'hidden' } }, ['👁️ Detalhes']),
                ...actionButtons,
                createDOMElement('button', { id: 'copy-report-btn', className: 'eng-btn-secondary text-xs' }, ['📋 Copiar']),
                createDOMElement('button', { id: 'download-word-btn', className: 'eng-btn-secondary text-xs' }, ['📝 Word']),
                createDOMElement('button', { id: 'download-csv-btn', className: 'eng-btn-secondary text-xs' }, ['📊 CSV']),
                createDOMElement('button', { id: 'download-pdf-btn', className: 'eng-btn-pdf text-xs' }, ['📄 PDF'])
            ])
        ]);

        // --- Build Report Container ---
        const reportContainer = createDOMElement('div', { id: this.reportId, className: 'p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700' });
        reportContainer.appendChild(header);

        // --- Add Warnings Section (if any) ---
        if (this.warnings.length > 0) {
            const warningsContainer = createDOMElement('div', { className: 'report-section-container mb-4' });
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
                    createDOMElement('h3', { className: 'report-header font-bold text-base text-gray-800 dark:text-gray-200' }, [section.title]),
                    createDOMElement('button', { className: 'copy-section-btn eng-btn-secondary text-xs print-hidden', dataset: { copyTargetId: contentId } }, ['📋 Copiar Seção'])
                ]));
            }

            const contentContainer = createDOMElement('div', { id: contentId, className: 'copy-content' });

            // Handle different section types
            if (section.type === 'table') {
                const { headers, rows } = section.tableConfig;
                const table = createDOMElement('table', { className: 'w-full mt-2 results-table eng-table' });

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
            v_unit: 'm/s',
            is_imp: false
        };
    }
    // Default to Imperial
    return {
        p_unit: 'psf',
        h_unit: 'ft',
        v_unit: 'mph',
        is_imp: true
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

/**
 * Linearly interpolates a Y value for a given X, based on sorted arrays of X and Y data points.
 * @param {number} x - The input value to interpolate for.
 * @param {number[]} x_points - Sorted array of X reference values (ascending).
 * @param {number[]} y_values - Corresponding array of Y reference values.
 * @returns {number} The interpolated Y value.
 */
function interpolate(x, x_points, y_values) {
    // Basic validation
    if (!Array.isArray(x_points) || !Array.isArray(y_values) || x_points.length !== y_values.length || x_points.length === 0) {
        console.warn('Invalid interpolation data provided to interpolate()', { x, x_points, y_values });
        return 0;
    }

    // Handle out of bounds (clamp to range)
    if (x <= x_points[0]) return y_values[0];
    if (x >= x_points[x_points.length - 1]) return y_values[y_values.length - 1];

    // Find the segment [x_i, x_{i+1}] that contains x
    for (let i = 0; i < x_points.length - 1; i++) {
        if (x >= x_points[i] && x <= x_points[i + 1]) {
            const x0 = x_points[i];
            const x1 = x_points[i + 1];
            const y0 = y_values[i];
            const y1 = y_values[i + 1];

            // Linear interpolation formula: y = y0 + (x - x0) * (y1 - y0) / (x1 - x0)
            if (x1 - x0 === 0) return y0; // Avoid division by zero
            return y0 + (x - x0) * ((y1 - y0) / (x1 - x0));
        }
    }

    return y_values[y_values.length - 1]; // Should not be reached
}


/**
 * Class for managing named project items (snapshots of inputs).
 * Allows users to save, load, and delete multiple named configurations.
 */
class ProjectManager {
    /**
     * @param {object} config - Configuration object
     * @param {string} config.storageKey - LocalStorage key (e.g., 'steel-project-items')
     * @param {string} config.containerId - DOM ID of the container to render the manager UI
     * @param {string[]} config.inputIds - Array of input IDs to save
     * @param {function} config.onLoadItem - Callback function(inputs) when an item is loaded
     */
    constructor(config) {
        this.storageKey = config.storageKey;
        this.containerId = config.containerId;
        this.inputIds = config.inputIds;
        this.onLoadItem = config.onLoadItem;
        
        this.items = this.loadItemsFromStorage();
        this.render();
    }

    loadItemsFromStorage() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        } catch (e) {
            console.error('Failed to load project items', e);
            return {};
        }
    }

    saveCurrentAs(name) {
        if (!name) return;
        const inputs = gatherInputsFromIds(this.inputIds);
        this.items[name] = {
            timestamp: new Date().toISOString(),
            inputs: inputs
        };
        this.persist();
        this.render();
        if (typeof showFeedback === 'function') showFeedback(`Saved item: ${name}`, false);
    }

    deleteItem(name) {
        if (this.items[name]) {
            delete this.items[name];
            this.persist();
            this.render();
        }
    }

    loadItem(name) {
        const item = this.items[name];
        if (item && item.inputs) {
            if (this.onLoadItem) this.onLoadItem(item.inputs);
            if (typeof showFeedback === 'function') showFeedback(`Loaded item: ${name}`, false);
        }
    }

    persist() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    }

    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        container.innerHTML = '';
        
        const header = document.createElement('h3');
        header.className = 'text-lg font-semibold mb-2 text-gray-700 dark:text-gray-200';
        header.textContent = 'Project Items';
        
        const list = document.createElement('div');
        list.className = 'space-y-2 max-h-60 overflow-y-auto pr-1';

        if (Object.keys(this.items).length === 0) {
            list.innerHTML = '<p class="text-gray-500 italic text-sm">No saved items.</p>';
        } else {
            Object.entries(this.items).forEach(([name, data]) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded border dark:border-gray-600 shadow-sm';
                
                const label = document.createElement('div');
                label.className = 'flex flex-col';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'font-medium text-sm text-gray-800 dark:text-gray-200';
                nameSpan.textContent = name;
                
                const dateSpan = document.createElement('span');
                dateSpan.className = 'text-xs text-gray-500';
                // Format timestamp nicely
                const date = new Date(data.timestamp);
                dateSpan.textContent = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                
                label.append(nameSpan, dateSpan);
                
                const actions = document.createElement('div');
                actions.className = 'flex gap-2';

                const loadBtn = document.createElement('button');
                loadBtn.textContent = 'Load';
                loadBtn.className = 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold px-2 py-1 border border-blue-200 rounded hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-gray-600';
                loadBtn.onclick = () => this.loadItem(name);

                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete';
                delBtn.className = 'text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs px-2 py-1 border border-red-200 rounded hover:bg-red-50 dark:border-red-800 dark:hover:bg-gray-600';
                delBtn.onclick = () => {
                    if(confirm(`Delete "${name}"?`)) this.deleteItem(name);
                };

                actions.append(loadBtn, delBtn);
                itemEl.append(label, actions);
                list.appendChild(itemEl);
            });
        }
        
        // Add "Save New" UI
        const saveRow = document.createElement('div');
        saveRow.className = 'mt-4 pt-4 border-t dark:border-gray-600 flex gap-2';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Item Name (e.g. Beam B1)';
        input.className = 'border rounded px-2 py-1 text-sm flex-grow dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500';
        input.onkeydown = (e) => { if (e.key === 'Enter') saveBtn.click(); };
        
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save New';
        saveBtn.className = 'bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 shadow-sm transition-colors whitespace-nowrap';
        saveBtn.onclick = () => {
            const val = input.value.trim();
            if(val) {
                if (this.items[val] && !confirm(`Overwrite existing item "${val}"?`)) return;
                this.saveCurrentAs(val);
                input.value = '';
            } else {
                if (typeof showFeedback === 'function') showFeedback('Please enter a name.', true);
            }
        };

        saveRow.append(input, saveBtn);
        container.append(header, list, saveRow);
    }
}

// --- Generic Batch Table Utilities ---

/**
 * Handle deleting a row from a generic batch array, maintaining a minimum 1 row length.
 * @param {Event} e - The DOM Event.
 * @param {Array} casesArray - The batch array attached to the table.
 * @param {Function} renderCallback - Renders the data array back to HTML (e.g. renderBatchTable)
 * @param {Object} defaultRowTemplate - Object schema to inject when clearing the last remaining row.
 */
function handleBatchDelete(e, casesArray, renderCallback, defaultRowTemplate) {
    const btn = e.target.closest("button");
    if (btn && btn.dataset.action === "remove") {
        const idx = parseInt(btn.dataset.idx);
        if (!isNaN(idx)) {
            if (casesArray.length > 1) {
                casesArray.splice(idx, 1);
            } else if (defaultRowTemplate) {
                casesArray[0] = {...defaultRowTemplate};
            }
            renderCallback();
        }
    }
}

/**
 * Synchronizes HTML `input` value with a batch data array. Uses safeMathEval.
 * @param {Event} e - DOM event representing "input" or "change".
 * @param {Array} casesArray - Array of JSON rows.
 * @param {string} indexAttribute - DOM data-attr storing the row index. Default: 'idx'.
 * @param {string} propertyAttribute - DOM data-attr storing the object property key string. Default: 'key' or 'field'.
 */
function updateBatchInputs(e, casesArray, indexAttribute='idx', propertyAttribute='key') {
    if (e.target.tagName !== "INPUT") return;
    const idxStr = e.target.getAttribute(`data-${indexAttribute}`);
    // Support varying schema datasets over different older module iterations
    const key = e.target.getAttribute(`data-${propertyAttribute}`) || e.target.getAttribute(`data-field`);
    
    if (idxStr !== null && idxStr !== undefined && key) {
        const idx = parseInt(idxStr);
        if (!isNaN(idx) && casesArray[idx]) {
            let val = safeMathEval(e.target.value);
            if(val === null || isNaN(val)) val = 0;
            casesArray[idx][key] = val;
        }
    }
}

/**
 * Applies clipboard blob over text entries and maps into an array row via rowMapper.
 * @param {Event} e - The native paste event 
 * @param {Array} casesArray - Target table data array
 * @param {Function} rowMapper - Ex: (columns) => ({ span: p(columns[0]), load: p(columns[1]) }) where `p` is parsed fallback
 * @param {Function} renderCallback - Triggered if any rows push successfully 
 */
function parsePasteToBatch(e, casesArray, rowMapper, renderCallback) {
    const clipboardData = (e.clipboardData || window.clipboardData).getData("text");
    if (!clipboardData) return;
    
    // Ignore input text overrides unless it's a multi-line paste sequence
    const rows = clipboardData.split(/\r\n|\n|\r/).filter((r) => r.trim() !== "");
    if (rows.length <= 1 && e.target.tagName === "INPUT") return;
    e.preventDefault();

    let startIndex = casesArray.length;
    const activeInput = document.activeElement;
    if (activeInput && activeInput.tagName === "INPUT" && activeInput.dataset.idx) startIndex = parseInt(activeInput.dataset.idx);

    const newCases = [];
    rows.forEach((rowStr) => {
        let values = rowStr.split("\t");
        if (values.length === 1) values = rowStr.split(/,|;/);

        const mappedObj = rowMapper(values);
        if(mappedObj) newCases.push(mappedObj);
    });

    if (newCases.length > 0) {
        for (let i = 0; i < newCases.length; i++) {
            if (startIndex + i < casesArray.length) {
                casesArray[startIndex + i] = newCases[i];
            } else {
                casesArray.push(newCases[i]);
            }
        }
        if(renderCallback) renderCallback();
    }
}

/**
 * Validates a `.xlsx` file upload using sheet_to_json, applying it to casesArray via rowMapper. 
 * @param {Event} e - "change" DOM Event emitted by a file `input` tag.
 * @param {Array} casesArray - Primary application array storing tabular context 
 * @param {Function} rowMapper - Function dictating how numeric keys translate to a specific domain model obj constraint
 * @param {Function} renderCallback - Function triggered to trigger DOM rewrite.
 * @param {String} errorMessage - Shown if Excel rows return totally unmappable.
 */
function parseExcelToBatch(e, casesArray, rowMapper, renderCallback, errorMessage) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        if(typeof XLSX === 'undefined') {
            console.error("XLSX is not defined. Ensure SheetJS library dependency is connected in your HTML block.");
            return;
        }

        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const newCases = [];
        json.forEach((row) => {
             const mappedObj = rowMapper(row);
             if(mappedObj) newCases.push(mappedObj);
        });

        if (newCases.length > 0) {
            // Discard arrays and replace entirely if importing
            casesArray.length = 0;
            casesArray.push(...newCases);
            renderCallback();
        } else {
            alert(errorMessage || "No valid data found in Excel spreadsheet.");
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // Clean input for repeated selections
}

// =========================================================================
// UNIFIED ENGINEERING 2D GRAPHICS & CAD ENGINE (EngCAD)
// Standardized across RS2, PCALC, Concrete Beam, Retaining Wall & Footings
// =========================================================================

const EngCAD = {
    /**
     * Palette & Themes for CAD 2D rendering
     */
    getTheme(isDark = null) {
        if (isDark === null) {
            isDark = document.documentElement.classList.contains('dark') || true;
        }
        return {
            isDark,
            bg: '#0f172a',
            bgGradient: ['#090d16', '#0f172a'],
            border: '#334155',
            gridMajor: 'rgba(148, 163, 184, 0.12)',
            gridMinor: 'rgba(148, 163, 184, 0.04)',
            gridText: 'rgba(148, 163, 184, 0.45)',
            axis: '#3b82f6',
            concrete: {
                fill: 'rgba(56, 189, 248, 0.08)',
                hatch: 'rgba(148, 163, 184, 0.12)',
                stroke: '#38bdf8',
                compressedFill: 'rgba(239, 68, 68, 0.25)',
                compressedStroke: '#ef4444'
            },
            rebar: {
                fill: '#ef4444',
                stroke: '#991b1b',
                highlight: 'rgba(255, 255, 255, 0.90)',
                stirrup: '#38bdf8'
            },
            dim: {
                line: 'rgba(148, 163, 184, 0.70)',
                text: '#f1f5f9',
                badgeBg: 'rgba(15, 23, 42, 0.92)',
                badgeBorder: 'rgba(148, 163, 184, 0.45)'
            },
            neutralAxis: '#f59e0b',
            load: '#3b82f6'
        };
    },

    /**
     * Initializes a canvas with High-DPI scaling (Retina / 4K support)
     */
    setupCanvas(canvas, targetWidth, targetHeight) {
        if (!canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        const w = targetWidth || (parent ? parent.clientWidth : canvas.width) || 400;
        const h = targetHeight || (parent ? parent.clientHeight : canvas.height) || 300;

        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;

        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        return { ctx, width: w, height: h, dpr };
    },

    /**
     * Draws rich gradient blueprint background
     */
    drawBackground(ctx, width, height, isDark = true) {
        const theme = this.getTheme(isDark);
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, theme.bgGradient[0]);
        grad.addColorStop(1, theme.bgGradient[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    },

    /**
     * Draws precision engineering CAD coordinate grid (RS2 style)
     */
    drawGrid(ctx, width, height, options = {}) {
        const theme = this.getTheme(options.isDark);
        const step = options.step || 20;
        const majorEvery = options.majorEvery || 5; // every 5 steps
        const showLabels = options.showLabels !== false;

        ctx.save();
        ctx.lineWidth = 1;

        // Minor grid
        ctx.strokeStyle = theme.gridMinor;
        ctx.beginPath();
        for (let x = 0; x <= width; x += step) {
            ctx.moveTo(x, 0); ctx.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += step) {
            ctx.moveTo(0, y); ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Major grid
        const majorStep = step * majorEvery;
        ctx.strokeStyle = theme.gridMajor;
        ctx.beginPath();
        for (let x = 0; x <= width; x += majorStep) {
            ctx.moveTo(x, 0); ctx.lineTo(x, height);
        }
        for (let y = 0; y <= height; y += majorStep) {
            ctx.moveTo(0, y); ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Subtle coordinate ticks / labels
        if (showLabels) {
            ctx.fillStyle = theme.gridText;
            ctx.font = "9px 'JetBrains Mono', Consolas, monospace";
            for (let x = majorStep; x < width; x += majorStep) {
                ctx.fillText(`${x}`, x + 3, height - 5);
            }
            for (let y = majorStep; y < height; y += majorStep) {
                ctx.fillText(`${y}`, 5, y - 3);
            }
        }
        ctx.restore();
    },

    /**
     * Draws architectural / engineering dimension line (Cota Técnica) with witness lines,
     * 45° ticks or arrowheads, and pill knockout badge
     */
    drawDimension(ctx, x1, y1, x2, y2, text, options = {}) {
        const theme = this.getTheme(options.isDark);
        const tickLen = options.tickLen || 5;
        const offset = options.offset || 0;
        const isArrow = options.style === 'arrow';

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;

        const lineX1 = x1 + px * offset;
        const lineY1 = y1 + py * offset;
        const lineX2 = x2 + px * offset;
        const lineY2 = y2 + py * offset;

        ctx.save();
        ctx.strokeStyle = theme.dim.line;
        ctx.lineWidth = 1;

        // Witness lines
        if (Math.abs(offset) > 2) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(lineX1 + px * (offset > 0 ? 3 : -3), lineY1 + py * (offset > 0 ? 3 : -3));
            ctx.moveTo(x2, y2);
            ctx.lineTo(lineX2 + px * (offset > 0 ? 3 : -3), lineY2 + py * (offset > 0 ? 3 : -3));
            ctx.stroke();
        }

        // Main dimension line
        ctx.beginPath();
        ctx.moveTo(lineX1, lineY1);
        ctx.lineTo(lineX2, lineY2);

        // Ticks or Arrows
        if (isArrow) {
            const arrLen = 7;
            const arrW = 3;
            ctx.moveTo(lineX1, lineY1);
            ctx.lineTo(lineX1 + ux * arrLen + px * arrW, lineY1 + uy * arrLen + py * arrW);
            ctx.moveTo(lineX1, lineY1);
            ctx.lineTo(lineX1 + ux * arrLen - px * arrW, lineY1 + uy * arrLen - py * arrW);
            ctx.moveTo(lineX2, lineY2);
            ctx.lineTo(lineX2 - ux * arrLen + px * arrW, lineY2 - uy * arrLen + py * arrW);
            ctx.moveTo(lineX2, lineY2);
            ctx.lineTo(lineX2 - ux * arrLen - px * arrW, lineY2 - uy * arrLen - py * arrW);
        } else {
            // Standard 45-deg ticks
            ctx.moveTo(lineX1 - (ux + px) * tickLen, lineY1 - (uy + py) * tickLen);
            ctx.lineTo(lineX1 + (ux + px) * tickLen, lineY1 + (uy + py) * tickLen);
            ctx.moveTo(lineX2 - (ux + px) * tickLen, lineY2 - (uy + py) * tickLen);
            ctx.lineTo(lineX2 + (ux + px) * tickLen, lineY2 + (uy + py) * tickLen);
        }
        ctx.stroke();

        // Text Pill Knockout Badge
        if (text) {
            const midX = (lineX1 + lineX2) / 2;
            const midY = (lineY1 + lineY2) / 2;

            ctx.font = options.font || "bold 11px 'Inter', sans-serif";
            const metrics = ctx.measureText(text);
            const padX = 6;
            const bW = metrics.width + padX * 2;
            const bH = 18;

            let angle = Math.atan2(dy, dx);
            if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
                angle += Math.PI;
            }

            ctx.translate(midX, midY);
            ctx.rotate(angle);

            // Knockout badge background
            ctx.fillStyle = theme.dim.badgeBg;
            ctx.strokeStyle = theme.dim.badgeBorder;
            ctx.lineWidth = 1;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(-bW / 2, -bH / 2, bW, bH, 4);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.fillRect(-bW / 2, -bH / 2, bW, bH);
                ctx.strokeRect(-bW / 2, -bH / 2, bW, bH);
            }

            // Text
            ctx.fillStyle = theme.dim.text;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, 0, 0);
        }
        ctx.restore();
    },

    /**
     * Draws high-contrast rebar circle with core fill, stroke, and specular shine dot
     */
    drawRebar(ctx, cx, cy, radius, options = {}) {
        const theme = this.getTheme(options.isDark);
        const fill = options.fill || theme.rebar.fill;
        const stroke = options.stroke || theme.rebar.stroke;
        
        // When drawing inside a transformed/scaled context, options.scale provides currentScale (px/unit)
        const scale = options.scale || 1.0;
        const minPx = options.minPixels !== undefined ? options.minPixels : 1.8;
        const r = options.scale ? Math.max(minPx / scale, radius) : Math.max(3, radius);

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.strokeStyle = stroke;
        ctx.lineWidth = options.lineWidth || (options.scale ? Math.max(0.8 / scale, r * 0.15) : Math.max(1, r * 0.25));
        ctx.stroke();

        // Specular highlight dot (if sufficiently visible on screen)
        const screenR = r * scale;
        if (screenR >= 3.0) {
            ctx.beginPath();
            ctx.arc(cx - r * 0.28, cy - r * 0.28, Math.max(0.4 / scale, r * 0.2), 0, Math.PI * 2);
            ctx.fillStyle = theme.rebar.highlight;
            ctx.fill();
        }
        ctx.restore();
    },

    /**
     * Draws stirrup tie (estribo) with rounded corners
     */
    drawStirrup(ctx, x, y, w, h, radius = 6, options = {}) {
        const theme = this.getTheme(options.isDark);
        ctx.save();
        ctx.strokeStyle = options.stroke || theme.rebar.stirrup;
        ctx.lineWidth = options.lineWidth || 2.5;
        const r = Math.min(radius, w / 6, h / 6);
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.stroke();
        ctx.restore();
    },

    /**
     * Draws neutral axis dashed line with callout badge
     */
    drawNeutralAxis(ctx, x1, y1, x2, y2, label = 'L.N.', options = {}) {
        const theme = this.getTheme(options.isDark);
        const color = options.color || theme.neutralAxis;

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);

        if (label) {
            ctx.font = "bold 10px 'Inter', sans-serif";
            const m = ctx.measureText(label);
            const bW = m.width + 10;
            const bH = 16;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            if (ctx.roundRect) {
                ctx.beginPath();
                ctx.roundRect(x2 + 4, y2 - bH / 2, bW, bH, 3);
                ctx.fill();
                ctx.stroke();
            } else {
                ctx.fillRect(x2 + 4, y2 - bH / 2, bW, bH);
                ctx.strokeRect(x2 + 4, y2 - bH / 2, bW, bH);
            }
            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x2 + 9, y2);
        }
        ctx.restore();
    },

    /**
     * Injects or updates a floating CAD HUD on top of canvas container (RS2 / PCalc style)
     */
    updateHUD(container, title, items = []) {
        if (!container) return;
        let hud = container.querySelector('.eng-cad-hud');
        if (!hud) {
            hud = document.createElement('div');
            hud.className = 'eng-cad-hud';
            if (getComputedStyle(container).position === 'static') {
                container.style.position = 'relative';
            }
            container.appendChild(hud);
        }

        let html = `<div class="eng-cad-hud-title"><span>📐</span> ${title}</div>`;
        items.forEach(it => {
            html += `
                <div class="eng-cad-hud-item">
                    <span class="eng-cad-hud-label">${it.label}:</span>
                    <span class="eng-cad-hud-val" ${it.color ? `style="color:${it.color}"` : ''}>${it.value}</span>
                </div>
            `;
        });
        hud.innerHTML = html;
    }
};

// =========================================================================
// UNIVERSAL APP UNDO/REDO MANAGER (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z)
// Provides seamless cross-application state undo/redo across all engineering apps
// =========================================================================

const UniversalAppUndoManager = (function () {
    const MAX_HISTORY = 50;
    const undoStack = [];
    const redoStack = [];
    let isApplyingState = false;
    let debounceTimer = null;
    let customHandlers = [];

    function generateElementSelector(el) {
        if (el.id) return `#${CSS.escape(el.id)}`;
        if (el.name) {
            const form = el.form;
            if (form && form.id) return `#${CSS.escape(form.id)} [name="${CSS.escape(el.name)}"]`;
            return `[name="${CSS.escape(el.name)}"]`;
        }
        const parent = el.parentElement;
        if (!parent) return el.tagName.toLowerCase();
        const index = Array.from(parent.children).indexOf(el);
        return `${generateElementSelector(parent)} > :nth-child(${index + 1})`;
    }

    function captureFormState() {
        const elements = document.querySelectorAll('input:not([type="hidden"]):not([type="file"]):not([type="button"]):not([type="submit"]):not([type="reset"]), select, textarea');
        const state = [];
        elements.forEach(el => {
            const selector = generateElementSelector(el);
            let val;
            if (el.type === 'checkbox' || el.type === 'radio') {
                val = el.checked;
            } else {
                val = el.value;
            }
            state.push({ selector, type: el.type, val });
        });
        return state;
    }

    function captureFullSnapshot(label = '') {
        const formState = captureFormState();
        const customState = {};
        customHandlers.forEach(h => {
            try {
                if (typeof h.getState === 'function') {
                    customState[h.name] = h.getState();
                }
            } catch (err) {
                console.warn('[UndoManager] Error capturing custom state for', h.name, err);
            }
        });

        return {
            timestamp: Date.now(),
            label: label || 'Edição',
            form: formState,
            custom: customState
        };
    }

    function statesEqual(a, b) {
        if (!a || !b) return false;
        if (a.form.length !== b.form.length) return false;
        for (let i = 0; i < a.form.length; i++) {
            if (a.form[i].selector !== b.form[i].selector || a.form[i].val !== b.form[i].val) {
                return false;
            }
        }
        if (JSON.stringify(a.custom) !== JSON.stringify(b.custom)) {
            return false;
        }
        return true;
    }

    function showUndoToast(msg, icon = '↩️') {
        let toast = document.getElementById('app-undo-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-undo-toast';
            toast.style.cssText = `
                position: fixed;
                bottom: 24px;
                right: 24px;
                background: rgba(15, 23, 42, 0.92);
                color: #ffffff;
                padding: 8px 14px;
                border-radius: 8px;
                box-shadow: 0 4px 14px rgba(0,0,0,0.3);
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                font-size: 12px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
                z-index: 999999;
                pointer-events: none;
                transition: opacity 0.25s ease, transform 0.25s ease;
                opacity: 0;
                transform: translateY(10px);
                border: 1px solid rgba(255,255,255,0.15);
            `;
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
        }, 1800);
    }

    function applySnapshot(snapshot) {
        if (!snapshot) return;
        isApplyingState = true;
        try {
            // Restore form fields
            if (Array.isArray(snapshot.form)) {
                snapshot.form.forEach(item => {
                    try {
                        const el = document.querySelector(item.selector);
                        if (el) {
                            if (item.type === 'checkbox' || item.type === 'radio') {
                                if (el.checked !== item.val) {
                                    el.checked = item.val;
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            } else {
                                if (el.value !== item.val) {
                                    el.value = item.val;
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                }
                            }
                        }
                    } catch (e) {
                        // ignore selector lookup errors
                    }
                });
            }

            // Restore custom handlers
            if (snapshot.custom) {
                customHandlers.forEach(h => {
                    try {
                        if (typeof h.restoreState === 'function' && snapshot.custom[h.name] !== undefined) {
                            h.restoreState(snapshot.custom[h.name]);
                        }
                    } catch (err) {
                        console.warn('[UndoManager] Error restoring custom state for', h.name, err);
                    }
                });
            }
        } finally {
            setTimeout(() => {
                isApplyingState = false;
            }, 50);
        }
    }

    function recordSnapshot(label = '') {
        if (isApplyingState) return;
        const snapshot = captureFullSnapshot(label);
        if (undoStack.length > 0 && statesEqual(undoStack[undoStack.length - 1], snapshot)) {
            return;
        }
        undoStack.push(snapshot);
        if (undoStack.length > MAX_HISTORY) {
            undoStack.shift();
        }
        redoStack.length = 0; // Clear redo on fresh action
    }

    function undo() {
        if (undoStack.length <= 1) {
            showUndoToast('Nada para desfazer', 'ℹ️');
            return false;
        }
        const current = undoStack.pop();
        redoStack.push(current);
        const prev = undoStack[undoStack.length - 1];
        applySnapshot(prev);
        showUndoToast(`Desfazer: ${prev.label || 'Ação anterior'} (Ctrl+Z)`, '↩️');
        window.dispatchEvent(new CustomEvent('app-undo', { detail: prev }));
        return true;
    }

    function redo() {
        if (redoStack.length === 0) {
            showUndoToast('Nada para refazer', 'ℹ️');
            return false;
        }
        const next = redoStack.pop();
        undoStack.push(next);
        applySnapshot(next);
        showUndoToast(`Refazer: ${next.label || 'Ação seguinte'} (Ctrl+Y)`, '↪️');
        window.dispatchEvent(new CustomEvent('app-redo', { detail: next }));
        return true;
    }

    function registerCustomHandler(handler) {
        if (!handler || !handler.name) return;
        customHandlers = customHandlers.filter(h => h.name !== handler.name);
        customHandlers.push(handler);
        // Refresh base snapshot with custom handler state
        if (undoStack.length > 0) {
            try {
                if (typeof handler.getState === 'function') {
                    undoStack[0].custom[handler.name] = handler.getState();
                }
            } catch (e) {}
        }
    }

    function init() {
        // Record initial state
        setTimeout(() => {
            if (undoStack.length === 0) {
                undoStack.push(captureFullSnapshot('Estado Inicial'));
            }
        }, 300);

        // Listen to user input changes with debouncing
        document.addEventListener('input', (e) => {
            if (isApplyingState) return;
            const target = e.target;
            if (!target || !target.matches('input, select, textarea')) return;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                recordSnapshot(`Edição em ${target.name || target.id || 'campo'}`);
            }, 300);
        }, true);

        document.addEventListener('change', (e) => {
            if (isApplyingState) return;
            const target = e.target;
            if (!target || !target.matches('input, select, textarea')) return;
            clearTimeout(debounceTimer);
            recordSnapshot(`Alteração em ${target.name || target.id || 'campo'}`);
        }, true);

        // Global Keydown listener for Ctrl+Z and Ctrl+Y / Ctrl+Shift+Z
        window.addEventListener('keydown', (e) => {
            const isCtrlOrCmd = e.ctrlKey || e.metaKey;
            if (!isCtrlOrCmd) return;

            const key = e.key.toLowerCase();
            if (key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            } else if (key === 'y') {
                e.preventDefault();
                redo();
            }
        }, false);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        recordSnapshot,
        undo,
        redo,
        registerCustomHandler,
        getHistoryLength: () => undoStack.length,
        canUndo: () => undoStack.length > 1,
        canRedo: () => redoStack.length > 0
    };
})();

window.AppUndoManager = UniversalAppUndoManager;
