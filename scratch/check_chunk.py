import sys

with open('js/shared-utils.js', 'r', encoding='utf-8') as f:
    content = f.read()

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

normalized_content = content.replace('\r\n', '\n')
target_chunk2_norm = target_chunk2.replace('\r\n', '\n')

if target_chunk2_norm in normalized_content:
    print("Found chunk 2!")
else:
    print("Chunk 2 NOT found!")
