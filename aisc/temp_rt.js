
/**
 * Sets up real-time validation for a list of inputs.
 * @param {string[]} inputIds - Array of input IDs to monitor.
 * @param {function} validatorFn - Function taking inputs object and returning { errors, warnings }.
 * @param {string} resultsContainerId - ID of key results container (optional).
 * @param {function} [autoRunCallback] - Optional callback to run if valid (debounced).
 */
function setupRealTimeValidation(inputIds, validatorFn, resultsContainerId, autoRunCallback) {
    let debounceTimer;
    
    const runValidation = () => {
        const inputs = gatherInputsFromIds(inputIds);
        const { errors } = validatorFn(inputs);
        
        // 1. Clear previous highlights
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('border-red-500', 'bg-red-50', 'dark:bg-red-900', 'dark:border-red-700');
            }
        });
        
        // 2. Apply new highlights
        let hasErrors = false;
        if (errors && errors.length > 0) {
            hasErrors = true;
            errors.forEach(err => {
                const fieldId = (typeof err === 'object') ? err.field : null;
                if (fieldId) {
                    const el = document.getElementById(fieldId);
                    if (el) {
                        el.classList.add('border-red-500', 'bg-red-50', 'dark:bg-red-900', 'dark:border-red-700');
                    }
                }
            });
        }
        
        // 3. Auto-Run (Debounced) if valid
        if (!hasErrors && typeof autoRunCallback === 'function') {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                autoRunCallback();
            }, 500); // 500ms debounce
        }
    };
    
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', runValidation);
            el.addEventListener('change', runValidation); // For selects
        }
    });
}
