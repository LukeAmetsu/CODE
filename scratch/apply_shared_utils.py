import sys

with open('js/shared-utils.js', 'r', encoding='utf-8') as f:
    content = f.read()

is_crlf = '\r\n' in content
normalized = content.replace('\r\n', '\n')

target_chunk1 = """/**
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
}"""

replacement_chunk1 = """/**
 * Safely evaluates a mathematical expression string.
 * Allows operators: +, -, *, /, ^, %, parentheses, decimal commas (1,5), and Math functions (sqrt, abs, round, min, max, pi).
 * @param {string|number} expression - The expression to evaluate.
 * @returns {number|null} The evaluated number or null if invalid.
 */
function safeMathEval(expression) {
    if (expression === null || expression === undefined || expression === '') return null;
    if (typeof expression === 'number') return isFinite(expression) ? expression : null;

    let str = String(expression).trim();
    if (!str) return null;

    // Fast-path: simple integer or float
    if (/^-?\\d+(\\.\\d+)?$/.test(str)) {
        const val = Number(str);
        return isFinite(val) ? val : null;
    }

    // Replace Brazilian/European decimal comma when surrounded by digits: e.g. "1,5" -> "1.5"
    str = str.replace(/(\\d+),(\\d+)/g, '$1.$2');
    // Replace leading decimal comma: e.g. ",5" -> "0.5"
    str = str.replace(/(^|[+\\-*/(])\\s*,(\\d+)/g, '$1 0.$2');

    // Replace power operator '^' with exponentiation '**'
    str = str.replace(/\\^/g, '**');

    // Replace percentage: e.g. "10%" -> "(10/100)"
    str = str.replace(/(\\d+(?:\\.\\d+)?)%/g, '($1/100)');

    // Allow safe Math functions and constants (case-insensitive)
    const allowedMath = ['sqrt', 'abs', 'round', 'floor', 'ceil', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'log10', 'exp', 'min', 'max', 'pi'];
    allowedMath.forEach(fn => {
        const regex = new RegExp(`\\\\b${fn}\\\\b`, 'gi');
        if (fn.toLowerCase() === 'pi') {
            str = str.replace(regex, 'Math.PI');
        } else {
            str = str.replace(regex, `Math.${fn.toLowerCase()}`);
        }
    });

    // Whitelist check: allow digits, dots, operators +, -, *, /, (, ), spaces, and commas
    const sanitized = str.replace(/Math\\.(sqrt|abs|round|floor|ceil|sin|cos|tan|asin|acos|atan|log|log10|exp|min|max|PI)/g, '');
    if (!/^[0-9+\\-*/().\\s,]+$/.test(sanitized)) {
        // Fallback for simple parse if invalid chars found
        const val = parseFloat(str.replace(',', '.'));
        return isNaN(val) ? null : val;
    }

    try {
        const func = new Function('"use strict"; return (' + str + ');');
        const result = func();
        return (typeof result === 'number' && isFinite(result)) ? result : null;
    } catch (e) {
        return null;
    }
}"""

target_chunk2 = """/**
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
}"""

replacement_chunk2 = """/**
 * Enables mathematical expressions in numeric inputs.
 * Converts type="number" to type="text" to allow characters like +, -, *, /, (, ), ^, %, commas.
 * Evaluates the expression on blur or Enter.
 * Also sets up a MutationObserver to handle dynamically added inputs.
 */
function enableMathInInputs() {
    const processInput = (input) => {
        // Only process inputs that are numbers or have numeric characteristics
        if (!input || input.tagName !== 'INPUT') return;
        const isNumeric = input.type === 'number' || 
                          input.classList.contains('numeric-input') || 
                          input.dataset.originalType === 'number' ||
                          input.hasAttribute('step');
        if (!isNumeric) return;

        // Convert to text to allow typing expressions
        if (input.type === 'number') {
            input.type = 'text';
            input.dataset.originalType = 'number';
        }
        input.dataset.mathEnabled = 'true';
        
        // Remove old listeners to avoid duplicates if re-initializing
        input.removeEventListener('blur', handleMathInputBlur);
        input.addEventListener('blur', handleMathInputBlur);
        
        // Also handle "Enter" key to evaluate without blurring
        input.removeEventListener('keydown', handleMathInputKeydown);
        input.addEventListener('keydown', handleMathInputKeydown);
    };

    // 1. Process existing inputs
    const numericInputs = document.querySelectorAll('input[type="number"], input.numeric-input, input[data-original-type="number"], input[step]');
    numericInputs.forEach(processInput);

    // 2. Set up MutationObserver for dynamically added inputs (e.g., in batch tables or axis tables)
    if (window._mathInputsObserver) {
        window._mathInputsObserver.disconnect();
    }

    window._mathInputsObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.tagName === 'INPUT') {
                            processInput(node);
                        }
                        const inputs = node.querySelectorAll('input[type="number"], input.numeric-input, input[data-original-type="number"], input[step]');
                        inputs.forEach(processInput);
                    }
                });
            }
        });
    });

    if (document.body) {
        // Start observing the body for added nodes
        window._mathInputsObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }
}

// Expose globally so all pages and scripts can call it directly
if (typeof window !== 'undefined') {
    window.safeMathEval = safeMathEval;
    window.enableMathInInputs = enableMathInInputs;
}

function handleMathInputBlur(e) {
    evaluateInputExpression(e.target);
}

function handleMathInputKeydown(e) {
    if (e.key === 'Enter') {
        evaluateInputExpression(e.target);
    }
}

function evaluateInputExpression(input) {
    if (!input) return;
    const originalValue = input.value;
    if (originalValue === null || originalValue === undefined) return;
    const str = String(originalValue).trim();
    if (!str) return;

    // Check if it looks like a math expression (contains operators, comma between digits, functions, ^, %)
    const hasMath = /[+\\-*/()^%]/.test(str) || /(\\d+),(\\d+)/.test(str) || /\\b(sqrt|abs|round|floor|ceil|sin|cos|tan|min|max|pi)\\b/i.test(str);
    if (hasMath) {
        const result = safeMathEval(str);
        if (result !== null && isFinite(result)) {
            input.dataset.formula = str;
            input.title = `Fórmula: ${str} = ${result}`;

            // Check if it's an integer
            if (Number.isInteger(result)) {
                input.value = result.toString();
            } else {
                input.value = parseFloat(result.toFixed(6)).toString(); 
            }
            
            // Trigger change event so calculators know value updated
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
}"""

assert target_chunk1 in normalized, "Target chunk 1 not found"
assert target_chunk2 in normalized, "Target chunk 2 not found"

new_normalized = normalized.replace(target_chunk1, replacement_chunk1).replace(target_chunk2, replacement_chunk2)

if is_crlf:
    final_content = new_normalized.replace('\n', '\r\n')
else:
    final_content = new_normalized

with open('js/shared-utils.js', 'w', encoding='utf-8') as f:
    f.write(final_content)

print("Successfully updated js/shared-utils.js!")
