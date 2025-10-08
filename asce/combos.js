let lastComboRunResults = null;

const comboInputIds = [
    'combo_asce_standard', 'combo_jurisdiction', 'combo_design_method', 'combo_input_load_level', 'combo_unit_system',
    'combo_dead_load_d', 'combo_live_load_l', 'combo_roof_live_load_lr', 'combo_rain_load_r', 'combo_balanced_snow_load_sb',
    'combo_unbalanced_windward_snow_load_suw', 'combo_unbalanced_leeward_snow_load_sul', 'combo_drift_surcharge_sd', 'combo_seismic_load_e',
    // Wind Loads (MWFRS)
    'combo_wind_wall_ww_max', 'combo_wind_wall_ww_min',
    'combo_wind_wall_lw_max', 'combo_wind_wall_lw_min',
    'combo_wind_roof_ww_max', 'combo_wind_roof_ww_min',
    'combo_wind_roof_lw_max', 'combo_wind_roof_lw_min',
    // Wind Loads (C&C)
    'combo_wind_cc_max', 'combo_wind_cc_min',
    'combo_wind_cc_wall_max', 'combo_wind_cc_wall_min'
];

/**
 * Initializes the application by attaching event listeners and loading stored data.
 * This function is called from combos.html after the DOM and templates are loaded.
 */
function initializeApp() {
    function attachEventListeners() {
        function attachDebouncedListeners(ids, handler) {
            const debouncedHandler = debounce(handler, 300);
            ids.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', debouncedHandler);
                    el.addEventListener('change', debouncedHandler);
                }
            });
        }

        initializeSharedUI();
        const handleSaveComboInputs = createSaveInputsHandler(comboInputIds, 'combo-inputs.txt');
        const handleLoadComboInputs = createLoadInputsHandler(comboInputIds, handleRunComboCalculation);

        document.getElementById('run-combo-calculation-btn').addEventListener('click', handleRunComboCalculation);
        document.getElementById('save-combo-inputs-btn').addEventListener('click', handleSaveComboInputs);
        document.getElementById('load-combo-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('combo-file-input')); // initiateLoad is already generic
        document.getElementById('combo-file-input').addEventListener('change', handleLoadComboInputs);

        // --- Auto-save inputs to localStorage on any change ---
        // This replaces the debounced calculation on every input change.
        // The user will now explicitly click "Run" to perform calculations.
        comboInputIds.forEach(id => {
            const el = document.getElementById(id);
            el?.addEventListener('change', () => saveInputsToLocalStorage('combo-calculator-inputs', gatherInputsFromIds(comboInputIds)));
        });

        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

        document.body.addEventListener('click', async (event) => {
            const copyBtn = event.target.closest('.copy-section-btn');
            if (copyBtn) {
                const targetId = copyBtn.dataset.copyTargetId || 'combo-report-content';
                if (targetId) {
                    await handleCopyToClipboard(targetId, 'feedback-message');
                }
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            if (event.target.id === 'download-pdf-btn') {
                handleDownloadPdf('combo-report-content', 'Load-Combinations-Report.pdf');
            }
            if (event.target.id === 'download-word-btn') {
                handleDownloadWord('combo-report-content', 'Load-Combinations-Report.doc');
            }
        });
    }

    attachEventListeners();
    loadDataFromStorage();
    loadInputsFromLocalStorage('combo-calculator-inputs', comboInputIds);
}

/**
 * Checks localStorage for any pending data from other calculators and imports it.
 */
function loadDataFromStorage() {
    const storedLoads = localStorage.getItem('loadsForCombinator');
    if (!storedLoads) return;

    try {
        const data = JSON.parse(storedLoads);
        const { loads, source = 'another calculator', type = 'Generic' } = data;

        // Get the IDs of the inputs that will be populated.
        const importedIds = Object.keys(loads);

        // Populate the input fields.
        for (const id in loads) {
            const el = document.getElementById(id);
            if (el && loads[id] !== undefined) {
                el.value = loads[id];
            }
        }

        // Display a banner confirming the import if a source was provided.
        if (source) {
            displayImportBanner(source, type, importedIds);
        } else {
            showFeedback('Loads imported from another calculator!', false, 'feedback-message');
        }

        // Clear the storage item so it's not re-loaded on a simple refresh.
        localStorage.removeItem('loadsForCombinator');
    } catch (e) {
        console.error("Failed to parse loads from localStorage", e);
        showFeedback('Failed to import loads. Data may be corrupt.', true, 'feedback-message');
    }
}

/**
 * Displays a banner to the user confirming which loads were imported.
 * @param {string} source - The name of the source calculator (e.g., "Wind Calculator").
 * @param {string} type - The type of loads imported (e.g., "Wind", "Snow").
 * @param {string[]} importedIds - The DOM IDs of the inputs that were populated.
 */
function displayImportBanner(source, type, importedIds) {
    const placeholder = document.getElementById('import-banner-placeholder');
    if (!placeholder) return;

    // Filter out IDs that were populated with 0, as they don't represent a meaningful import.
    const meaningfulIds = importedIds.filter(id => {
        const el = document.getElementById(id);
        return el && parseFloat(el.value) !== 0;
    });
    if (meaningfulIds.length === 0) return; // Don't show a banner if no non-zero loads were imported.

    const bannerHtml = `
        <div id="import-banner" class="bg-green-100 dark:bg-green-900/50 border-l-4 border-green-500 text-green-800 dark:text-green-300 p-4 rounded-md flex justify-between items-center">
            <p>${type} loads from <strong>${sanitizeHTML(source)}</strong> have been imported.</p>
            <button id="clear-imported-btn" class="text-sm font-semibold text-green-700 dark:text-green-200 hover:underline">Clear</button>
        </div>
    `;
    placeholder.innerHTML = bannerHtml;

    document.getElementById('clear-imported-btn').addEventListener('click', () => {
        meaningfulIds.forEach(id => {
            const el = document.getElementById(id);
            if (el && el.type === 'number') el.value = 0;
        });
        placeholder.innerHTML = '';
        showFeedback('Imported loads cleared.', false, 'feedback-message');
    });
}

/**
 * Builds an executable function from an abstract formula definition.
 * @param {Array<object>} formula_def - The abstract definition of the formula.
 * @returns {function(object): number} A function that takes a data scope and returns the calculated value.
 */
function buildFormulaFunction(formula_def) {
    if (!Array.isArray(formula_def)) return () => 0; // Return a no-op function if def is invalid
    const terms = formula_def.map(term => {
        if (term.load) {
            return `${term.factor || 1.0} * d.${term.load}`;
        }
        if (term.maxOf) {
            const maxTerms = term.maxOf.map(maxTerm => {
                if (typeof maxTerm === 'string') return `d.${maxTerm}`;
                return `${maxTerm.factor || 1.0} * d.${maxTerm.load}`;
            }).join(', ');
            return `${term.factor || 1.0} * Math.max(${maxTerms})`;
        }
        return '0';
    });
    return new Function('d', `return ${terms.join(' + ')}`);
}

/**
 * Builds a human-readable formula string from an abstract definition.
 * @param {Array<object>} formula_def - The abstract definition of the formula.
 * @returns {string} A string representation of the formula.
 */
function buildFormulaString(formula_def) {
    if (!Array.isArray(formula_def)) return "Invalid Formula";
    const terms = formula_def.map(term => {
        const factorStr = term.factor ? `${term.factor}` : '';
        if (term.load) {
            return `${factorStr}${factorStr ? '*' : ''}${term.load}`;
        }
        if (term.maxOf) {
            const maxTerms = term.maxOf.map(maxTerm => (typeof maxTerm === 'string') ? maxTerm : `${maxTerm.factor || ''}${maxTerm.factor ? '*' : ''}${maxTerm.load}`).join('|');
            return `${factorStr}${factorStr ? '*' : ''}(${maxTerms})`;
        }
        return '';
    }).filter(Boolean).join(' + ');
}

const comboStrategies = {
    'ASCE 7-16': {
        prepareLoads: (loads, level, method) => {
            // Correctly adjusts nominal wind to strength level ONLY for LRFD,
            // as ASD combinations in ASCE 7-16 already use a 0.6 factor on nominal wind.
            const newScope = { ...loads };
            const adjustment_notes = {};

            if (level === 'Nominal (Service/ASD)' && method === 'LRFD' && newScope.W) {
                newScope.W = newScope.W / 0.6;
                adjustment_notes['Wind Load'] = `Input nominal wind load (W) was divided by 0.6 to get the required strength-level wind load for ASCE 7-16 LRFD combinations.`;
            }

            return {
                scope: newScope,
                adjustment_notes: adjustment_notes
            };
        },
        lrfdDefs: {
            '1. 1.4D': [{ factor: 1.4, load: 'D' }],
            '2. 1.2D + 1.6L + 0.5(Lr|S|R)': [{ factor: 1.2, load: 'D' }, { factor: 1.6, load: 'L' }, { factor: 0.5, maxOf: ['Lr', 'S', 'R'] }],
            '3. 1.2D + 1.6(Lr|S|R) + (L|0.5W)': [{ factor: 1.2, load: 'D' }, { factor: 1.6, maxOf: ['Lr', 'S', 'R'] }, { maxOf: [{ factor: 1.0, load: 'L' }, { factor: 0.5, load: 'W' }] }],
            '4. 1.2D + W + L + 0.5(Lr|S|R)': [{ factor: 1.2, load: 'D' }, { factor: 1.0, load: 'W' }, { factor: 1.0, load: 'L' }, { factor: 0.5, maxOf: ['Lr', 'S', 'R'] }],
            '5. 1.2D + E + L + 0.2S': [{ factor: 1.2, load: 'D' }, { factor: 1.0, load: 'E' }, { factor: 1.0, load: 'L' }, { factor: 0.2, load: 'S' }],
            '6. 0.9D + W': [{ factor: 0.9, load: 'D' }, { factor: 1.0, load: 'W' }],
            '7. 0.9D + E': [{ factor: 0.9, load: 'D' }, { factor: 1.0, load: 'E' }],
        },
        // CORRECT ASD DEFINITIONS FOR ASCE 7-16
        asdDefs: {
            '1. D': [{ factor: 1.0, load: 'D' }],
            '2. D + L': [{ factor: 1.0, load: 'D' }, { factor: 1.0, load: 'L' }],
            '3. D + (Lr|S|R)': [{ factor: 1.0, load: 'D' }, { factor: 1.0, maxOf: ['Lr', 'S', 'R'] }],
            '4. D + 0.75L + 0.75(Lr|S|R)': [{ factor: 1.0, load: 'D' }, { factor: 0.75, load: 'L' }, { factor: 0.75, maxOf: ['Lr', 'S', 'R'] }],
            '5a. D + 0.6W': [{ factor: 1.0, load: 'D' }, { factor: 0.6, load: 'W' }],
            '5b. D + 0.7E': [{ factor: 1.0, load: 'D' }, { factor: 0.7, load: 'E' }],
            '6a. D + 0.75L + 0.75(0.6W) + 0.75(Lr|S|R)': [{ factor: 1.0, load: 'D' }, { factor: 0.75, load: 'L' }, { factor: 0.45, load: 'W' }, { factor: 0.75, maxOf: ['Lr', 'S', 'R'] }],
            '6b. D + 0.75L + 0.75(0.7E) + 0.75S': [{ factor: 1.0, load: 'D' }, { factor: 0.75, load: 'L' }, { factor: 0.525, load: 'E' }, { factor: 0.75, load: 'S' }],
            '7. 0.6D + 0.6W': [{ factor: 0.6, load: 'D' }, { factor: 0.6, load: 'W' }],
            '8. 0.6D + 0.7E': [{ factor: 0.6, load: 'D' }, { factor: 0.7, load: 'E' }]
        }
    },
    'ASCE 7-22': {
        prepareLoads: (loads, level, method) => {
            // No pre-adjustment is necessary.
            return { scope: { ...loads }, adjustment_notes: {} };
        },
        lrfdDefs: {
            '1. 1.4D': [{ factor: 1.4, load: 'D' }],
            '2. 1.2D + 1.6L + 0.5(Lr|S|R)': [{ factor: 1.2, load: 'D' }, { factor: 1.6, load: 'L' }, { factor: 0.5, maxOf: ['Lr', 'S', 'R'] }],
            '3a. 1.2D + 1.6(Lr|R) + (L|0.5W)': [{ factor: 1.2, load: 'D' }, { factor: 1.6, maxOf: ['Lr', 'R'] }, { maxOf: [{ factor: 1.0, load: 'L' }, { factor: 0.5, load: 'W' }] }],
            '3b. 1.2D + S + (L|0.5W)': [{ factor: 1.2, load: 'D' }, { factor: 1.0, load: 'S' }, { maxOf: [{ factor: 1.0, load: 'L' }, { factor: 0.5, load: 'W' }] }],
            '4. 1.2D + 1.6W + L + 0.5(Lr|S|R)': [{ factor: 1.2, load: 'D' }, { factor: 1.6, load: 'W' }, { factor: 1.0, load: 'L' }, { factor: 0.5, maxOf: ['Lr', 'S', 'R'] }],
            '5. 1.2D + E + L + S': [{ factor: 1.2, load: 'D' }, { factor: 1.0, load: 'E' }, { factor: 1.0, load: 'L' }, { factor: 1.0, load: 'S' }],
            '6. 0.9D + 1.6W': [{ factor: 0.9, load: 'D' }, { factor: 1.6, load: 'W' }],
            '7. 0.9D + E': [{ factor: 0.9, load: 'D' }, { factor: 1.0, load: 'E' }],
        },
        // CORRECT ASD DEFINITIONS FOR ASCE 7-22
        asdDefs: {
            '1. D': [{ factor: 1.0, load: 'D' }],
            '2. D + L': [{ factor: 1.0, load: 'D' }, { factor: 1.0, load: 'L' }],
            '3. D + (Lr|0.7S|R)': [{ factor: 1.0, load: 'D' }, { maxOf: [{ load: 'Lr' }, { factor: 0.7, load: 'S' }, { load: 'R' }] }],
            '4. D + 0.75L + 0.75(Lr|0.7S|R)': [{ factor: 1.0, load: 'D' }, { factor: 0.75, load: 'L' }, { factor: 0.75, maxOf: [{ load: 'Lr' }, { factor: 0.7, load: 'S' }, { load: 'R' }] }],
            '5a. D + W': [{ factor: 1.0, load: 'D' }, { factor: 1.0, load: 'W' }],
            '5b. D + 0.7E': [{ factor: 1.0, load: 'D' }, { factor: 0.7, load: 'E' }],
            '6. D + 0.75L + 0.75W + 0.75(Lr|0.7S|R)': [{ factor: 1.0, load: 'D' }, { factor: 0.75, load: 'L' }, { factor: 0.75, load: 'W' }, { factor: 0.75, maxOf: [{ load: 'Lr' }, { factor: 0.7, load: 'S' }, { load: 'R' }] }],
            '7. 0.6D + W': [{ factor: 0.6, load: 'D' }, { factor: 1.0, load: 'W' }],
            '8. 0.6D + 0.7E': [{ factor: 0.6, load: 'D' }, { factor: 0.7, load: 'E' }]
        }
    }
};

/**
 * Generates a string representation of a calculation by substituting variables with their values from an abstract definition.
 * @param {Array<object>} formula_def - The abstract definition of the formula.
 * @param {object} scope - The object containing variable values.
 * @returns {string} The calculation string with values substituted.
 */
function generateCalculationString(formula_def, scope) {
    const terms = formula_def.map(term => {
        const factor = term.factor;
        const factorStr = factor !== undefined ? `${factor.toFixed(2)}*` : '';

        if (term.load) {
            const value = scope[term.load] !== undefined ? scope[term.load].toFixed(2) : '0.00';
            return `${factorStr}${value}`;
        }
        if (term.maxOf) {
            const maxTerms = term.maxOf.map(maxTerm => {
                if (typeof maxTerm === 'string') return (scope[maxTerm] || 0).toFixed(2);
                const maxFactorStr = maxTerm.factor ? `${maxTerm.factor.toFixed(2)}*` : '';
                return `${maxFactorStr}${(scope[maxTerm.load] || 0).toFixed(2)}`;
            }).join(', ');
            return `${factorStr}max(${maxTerms})`;
        }
        return '0';
    });
    return terms.join(' + ');
}
const comboLoadCalculator = (() => {
    function calculateCombinations(loads, standard, level, method) {
        const { D, L, Lr, R, E, unit_system } = loads;
        const strategy = comboStrategies[standard];
        if (!strategy) {
            throw new Error(`Unsupported standard: ${standard}`);
        }

        // The prepareLoads function now correctly handles the LRFD/ASD distinction for ASCE 7-16
        const { scope, adjustment_notes } = strategy.prepareLoads(loads, level, method);
        
        // **FIXED**: Directly choose the correct definition set and remove old dynamic generation logic.
        let formulaDefs;
        if (method === 'LRFD') {
            formulaDefs = strategy.lrfdDefs;
        } else { // ASD
            formulaDefs = strategy.asdDefs; // This now correctly uses the explicit ASD definitions.
        }

        const final_formulas = {};
        for (const key in formulaDefs) {
            final_formulas[key] = buildFormulaFunction(formulaDefs[key]);
        }
        
        let results = {};
        let pattern_results = {};
        let calc_strings = {};
        let pattern_calc_strings = {};

        const live_load_threshold = scope.unit_system === 'imperial' ? 100 : 4.79;
        const pattern_load_required = scope.L > live_load_threshold;
        
        const evaluateCombinations = (formulas, defs, data) => {
            const calculated = {};
            const strings = {};
            for (const key in formulas) {
                calculated[key] = formulas[key](data);
                strings[key] = generateCalculationString(defs[key], data);
            }
            return { results: calculated, strings };
        };
        
        ({ results, strings: calc_strings } = evaluateCombinations(final_formulas, formulaDefs, scope));
        if (pattern_load_required) {
            const pattern_scope = { ...scope, L: 0.75 * scope.L };
            ({ results: pattern_results, strings: pattern_calc_strings } = evaluateCombinations(final_formulas, formulaDefs, pattern_scope));
        }

        // Return the definitions so the renderer can use them.
        return { results, pattern_results, pattern_load_required, final_formulas, adjustment_notes, calc_strings, pattern_calc_strings, formulaDefs };
    }
    return { calculate: calculateCombinations };
})();

const handleRunComboCalculation = createCalculationHandler({
    inputIds: comboInputIds,
    storageKey: 'combo-calculator-inputs',
    validationRuleKey: 'combo', // This will now correctly use the rules from validation-rules.js
    calculatorFunction: (inputs) => {
        const validation = validateInputs(inputs, validationRules.combo);
        const effective_standard = inputs.combo_jurisdiction === "NYCBC 2022" ? "ASCE 7-16" : inputs.combo_asce_standard;        
        const scenarios = buildScenarios(inputs);

        const base_combo_loads = { D: inputs.combo_dead_load_d, L: inputs.combo_live_load_l, Lr: inputs.combo_roof_live_load_lr, R: inputs.combo_rain_load_r, S: 0, W: 0, E: 0, unit_system: inputs.combo_unit_system };
        const base_combos = comboLoadCalculator.calculate(base_combo_loads, effective_standard, inputs.combo_input_load_level, inputs.combo_design_method);
        
        const scenarios_data = {};
        for (const key in scenarios) {
            const isWallScenario = key.includes('wall');
            
            // Start with all loads from the form.
            const scenario_loads = {
                D: inputs.combo_dead_load_d, 
                L: inputs.combo_live_load_l, 
                Lr: inputs.combo_roof_live_load_lr, 
                R: inputs.combo_rain_load_r, 
                S: scenarios[key].S, // Use scenario-specific snow
                E: inputs.combo_seismic_load_e, 
                unit_system: inputs.combo_unit_system 
            };

            // **CORRECTED LOGIC**: For wall analysis, zero out ALL roof-specific gravity loads.
            if (isWallScenario) {
                scenario_loads.Lr = 0;
                scenario_loads.R = 0;
                scenario_loads.S = 0; // Walls don't have direct snow, rain, or roof live load.
            }
            
            scenarios_data[`${key}_wmax`] = comboLoadCalculator.calculate({ ...scenario_loads, W: scenarios[key].W_max }, effective_standard, inputs.combo_input_load_level, inputs.combo_design_method);
            scenarios_data[`${key}_wmin`] = comboLoadCalculator.calculate({ ...scenario_loads, W: scenarios[key].W_min }, effective_standard, inputs.combo_input_load_level, inputs.combo_design_method);
        }
        return { inputs, scenarios_data, base_combos, success: true, warnings: validation.warnings };
    },
    renderFunction: renderComboResults,
    resultsContainerId: 'combo-results-container',
    buttonId: 'run-combo-calculation-btn'
});
/**
 * Configuration for all possible calculation scenarios.
 * This is the single source of truth for scenario keys and titles.
 */
const scenarioConfig = [
    { key: 'windward_wall', title: 'Windward Wall Analysis', s: 'unbalanced_windward_snow_load_suw', wMax: 'wind_wall_ww_max', wMin: 'wind_wall_ww_min' },
    { key: 'leeward_wall', title: 'Leeward Wall Analysis', s: 'unbalanced_leeward_snow_load_sul', wMax: 'wind_wall_lw_max', wMin: 'wind_wall_lw_min' },
    { key: 'windward_roof', title: 'Windward Roof Analysis', s: 'unbalanced_windward_snow_load_suw', wMax: 'wind_roof_ww_max', wMin: 'wind_roof_ww_min' },
    { key: 'leeward_roof', title: 'Leeward Roof Analysis', s: 'unbalanced_leeward_snow_load_sul', wMax: 'wind_roof_lw_max', wMin: 'wind_roof_lw_min' },
    { key: 'cc_roof', title: 'Components & Cladding (C&C) Roof Analysis', s: 'balanced_snow_load_sb', wMax: 'wind_cc_max', wMin: 'wind_cc_min' },
    { key: 'cc_wall', title: 'Components & Cladding (C&C) Wall Analysis', s: 'balanced_snow_load_sb', wMax: 'wind_cc_wall_max', wMin: 'wind_cc_wall_min' },
    { key: 'balanced_snow', title: 'Balanced Snow Analysis', s: 'balanced_snow_load_sb' },
    { key: 'drift_surcharge', title: 'Drift Surcharge Load Analysis', s: (inputs) => (inputs.combo_balanced_snow_load_sb || 0) + (inputs.combo_drift_surcharge_sd || 0), wMax: 'wind_roof_ww_max', wMin: 'wind_roof_ww_min' }
];

/**
 * Creates a map of scenario keys to their full titles from the global config.
 * @returns {Object.<string, string>}
 */
function getScenarioTitleMap() {
    return Object.fromEntries(scenarioConfig.map(item => [item.key, item.title]));
}

/**
 * Builds the scenarios object dynamically from a configuration array.
 * @param {object} inputs - The user inputs object from the form.
 * @returns {object} The fully constructed scenarios object.
 */
function buildScenarios(inputs) {
    const scenarios = {};
    scenarioConfig.forEach(config => {
        scenarios[config.key] = {
            title: config.title,
            S: typeof config.s === 'function' ? config.s(inputs) : (inputs[`combo_${config.s}`] || 0),
            W_max: inputs[`combo_${config.wMax}`] || 0,
            W_min: inputs[`combo_${config.wMin}`] || 0,
        };
    });

    return scenarios;
}

function generateComboSummary(all_gov_data, design_method, p_unit) {
    const scenarios = {};
    all_gov_data.forEach(d => {
        if (!scenarios[d.title]) {
            scenarios[d.title] = { max: { value: -Infinity }, min: { value: Infinity } };
        }
        // Ensure we don't overwrite with a non-existent value
        if (d.value !== undefined && d.value > scenarios[d.title].max.value) scenarios[d.title].max = d;
        if (d.value !== undefined && d.value < scenarios[d.title].min.value) scenarios[d.title].min = d;
    });

    let summaryHtml = `<div class="mt-8 report-section-copyable">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Governing Load Combinations Summary</h3>
        </div>`;

    summaryHtml += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">`;

    // Define a master order for all possible scenarios to maintain a consistent layout.
    const masterScenarioOrder = [
        'Balanced Snow Analysis', 'Drift Surcharge Load Analysis',
        'Windward Wall Analysis', 'Leeward Wall Analysis', 'Windward Roof Analysis', 'Leeward Roof Analysis',
        'Components & Cladding (C&C) Roof Analysis', 'Components & Cladding (C&C) Wall Analysis'
    ];

    // Filter the master list to only include scenarios that have results in the current calculation.
    const availableScenarios = masterScenarioOrder.filter(title => scenarios[title]);

    availableScenarios.forEach(title => {
        const data = scenarios[title]; // We know data exists because of the filter above.

        const shortTitle = title.replace(' Analysis', '').replace(' Combinations', '');
        summaryHtml += `
            <div class="border dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800/50 flex flex-col">
                <h4 class="font-semibold text-center text-base mb-2">${shortTitle}</h4>
                <div class="flex-grow space-y-2">
                    <div class="text-center">
                        <p class="text-sm">Max Pressure</p>
                        <p class="font-bold text-xl">${data.max.value.toFixed(2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate" title="${data.max.combo}">From: ${data.max.combo}</p>
                    </div>
                    <div class="text-center">
                        <p class="text-sm">Max Uplift/Suction</p>
                        <p class="font-bold text-xl">${data.min.value.toFixed(2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate" title="${data.min.combo}">From: ${data.min.combo}</p>
                    </div>
                </div>
            </div>`;
    });

    summaryHtml += `</div>`; // Close grid

    const overallMax = all_gov_data.reduce((max, d) => (d.value > max.value ? d : max), { value: -Infinity });
    const overallMin = all_gov_data.reduce((min, d) => (d.value < min.value ? d : min), { value: Infinity });

    summaryHtml += `</div>`; // Close grid

    summaryHtml += `<div id="combo-overall-summary" class="mt-8 report-section-copyable">
            <div class="flex justify-between items-center">
                <h3 class="report-header flex-grow">Overall Governing ${design_method} Loads</h3>
                <button data-copy-target-id="combo-overall-summary" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs print-hidden" data-copy-ignore>Copy Summary</button>
            </div>
            <h4 class="font-semibold mt-4">FINAL GOVERNING ${design_method} LOADS</h4>
            <ul class="list-disc list-inside ml-4 space-y-1">
                <li><strong>Overall Max Pressure:</strong> ${overallMax.value.toFixed(2)} ${p_unit}
                    <div class="pl-6 text-sm text-gray-500 dark:text-gray-400">From: ${overallMax.title.replace(' Analysis', '')}: ${overallMax.combo}</div>
                </li>
                <li><strong>Overall Max Uplift/Suction:</strong> ${overallMin.value.toFixed(2)} ${p_unit}
                    <div class="pl-6 text-sm text-gray-500 dark:text-gray-400">From: ${overallMin.title.replace(' Analysis', '')}: ${overallMin.combo}</div>
                </li>
            </ul>
        </div>`;

    return summaryHtml;
}

/**
 * Defines the configuration for displaying input loads in the report.
 * Each object can have a 'label', 'id' (for simple value lookup), or a 'value' function for complex calculations.
 */
const inputLoadConfig = [
    { label: 'Dead Load (D)', id: 'combo_dead_load_d' },
    { label: 'Live Load (L)', id: 'combo_live_load_l' },
    { label: 'Roof Live (Lr)', id: 'combo_roof_live_load_lr' },
    { label: 'Rain Load (R)', id: 'combo_rain_load_r' },
    { label: 'Balanced Snow (Sb)', id: 'combo_balanced_snow_load_sb' },
    { label: 'Unbalanced Windward (Suw)', id: 'combo_unbalanced_windward_snow_load_suw' },
    { label: 'Unbalanced Leeward (Sul)', id: 'combo_unbalanced_leeward_snow_load_sul' },
    { label: 'Drift Surcharge (Sd)', id: 'combo_drift_surcharge_sd' },
    { label: 'Max Wind (Wmax)', value: (i) => Math.max(i.combo_wind_wall_ww_max, i.combo_wind_wall_lw_max, i.combo_wind_roof_ww_max, i.combo_wind_roof_lw_max, i.combo_wind_cc_max, i.combo_wind_cc_wall_max) },
    { label: 'Min Wind (Wmin)', value: (i) => Math.min(i.combo_wind_wall_ww_min, i.combo_wind_wall_lw_min, i.combo_wind_roof_ww_min, i.combo_wind_roof_lw_min, i.combo_wind_cc_min, i.combo_wind_cc_wall_min) },
    { label: 'Windward Wall Max (W)', id: 'combo_wind_wall_ww_max' },
    { label: 'Windward Wall Min (W)', id: 'combo_wind_wall_ww_min' },
    { label: 'Leeward Wall Max (W)', id: 'combo_wind_wall_lw_max' },
    { label: 'Leeward Wall Min (W)', id: 'combo_wind_wall_lw_min' },
    { label: 'Windward Roof Max (W)', id: 'combo_wind_roof_ww_max' },
    { label: 'Windward Roof Min (W)', id: 'combo_wind_roof_ww_min' },
    { label: 'Leeward Roof Max (W)', id: 'combo_wind_roof_lw_max' },
    { label: 'Leeward Roof Min (W)', id: 'combo_wind_roof_lw_min' },
    { label: 'C&C Roof Max/Min (W)', value: (i) => `${i.combo_wind_cc_max.toFixed(2)} / ${i.combo_wind_cc_min.toFixed(2)}` },
    { label: 'C&C Wall Max/Min (W)', value: (i) => `${i.combo_wind_cc_wall_max.toFixed(2)} / ${i.combo_wind_cc_wall_min.toFixed(2)}` },
    { label: 'Seismic Load (E)', id: 'combo_seismic_load_e' }
];

/**
 * Generates the HTML list for the input loads section of the report.
 * @param {object} inputs - The user inputs object.
 * @param {string} p_unit - The pressure unit string (e.g., 'psf').
 * @returns {string} The HTML string for the list of input loads.
 */
function generateInputLoadSummary(inputs, p_unit) {
    return inputLoadConfig.map(load => {
        const value = load.id ? inputs[load.id] : load.value(inputs);
        if (typeof value === 'number') {
            return `<li><strong>${load.label}:</strong> ${value.toFixed(2)} ${p_unit}</li>`;
        }
        return `<li><strong>${load.label}:</strong> ${value} ${p_unit}</li>`; // Handles pre-formatted strings
    }).join('');
}

function renderComboResults(fullResults) {
    if (!fullResults || !fullResults.success) return;
    lastComboRunResults = fullResults;
    
    const resultsContainer = document.getElementById('combo-results-container');
    let html = `<div id="combo-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-8">`;
    html += `<div class="flex justify-end gap-2 print-hidden">
                    <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>
                    <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm print-hidden">Download PDF</button>
                    <button data-copy-target-id="combo-report-content" class="copy-section-btn bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Full Report</button>
              </div>`;

    html += `
                 <div class="text-center border-b pb-4">
                    <h2 class="text-2xl font-bold">LOAD COMBINATION REPORT (${fullResults.inputs.combo_asce_standard})</h2>
                 </div>`;
    
    // Display adjustment notes if they exist
    const adjustment_notes = fullResults.scenarios_data[Object.keys(fullResults.scenarios_data)[0]]?.adjustment_notes;
    if (adjustment_notes && Object.keys(adjustment_notes).length > 0) {
        html += `<div class="bg-blue-100 dark:bg-blue-900/50 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-4 rounded-md">
                    <p class="font-bold">Input Load Adjustments:</p>
                    <ul class="list-disc list-inside mt-2 text-sm">`;
        for(const key in adjustment_notes){
            html += `<li>${adjustment_notes[key]}</li>`;
        }
        html += `</ul></div>`;
    }

    if (fullResults.warnings && fullResults.warnings.length > 0) {
        html += renderValidationResults({ warnings: fullResults.warnings, errors: [] });
    }

    // --- 1. INPUT LOADS ---
    const { inputs } = fullResults;
    const p_unit = inputs.combo_unit_system === 'imperial' ? 'psf' : 'kPa';

    html += `<div id="combo-inputs-section" class="report-section-copyable">
                <div class="flex justify-between items-center">
                    <h3 class="report-header">Input Loads</h3>
                    <button data-copy-target-id="combo-inputs-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden" data-copy-ignore>Copy Section</button>
                </div>
                <ul class="list-disc list-inside space-y-1">${generateInputLoadSummary(inputs, p_unit)}</ul>
             </div>`;

    // --- Base Load Combinations (No Wind/Snow) ---
    html += `<div id="combo-base-section" class="report-section-copyable mt-6">
             <div class="flex justify-between items-center">
                <h3 class="report-header flex-grow">Base Load Combinations</h3>
                <button data-copy-target-id="combo-base-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden" data-copy-ignore>Copy Section</button>
             </div>
             <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">These combinations are constant across all scenarios.</p>
             <table class="results-container w-full mt-2 border-collapse">
                <thead><tr><th>Combination</th><th>Calculation & Result</th></tr></thead>
                <tbody>`;
    for (const combo in fullResults.base_combos.results) {
        if (combo.includes('W') || combo.includes('S') || combo.includes('E')) continue;
        const value = fullResults.base_combos.results[combo];
        const calc_string = fullResults.base_combos.calc_strings[combo];
        html += `<tr><td>${combo}</td><td>${calc_string} = <b>${value.toFixed(2)}</b></td></tr>`;
    }
    html += `</tbody></table></div>`;


    // --- Scenario-Specific Combinations ---
    html += `<div id="combo-scenario-section" class="report-section-copyable mt-6">
                <div class="flex justify-between items-center">
                    <h3 class="report-header flex-grow">Scenario-Specific Combinations</h3>
                    <button data-copy-target-id="combo-scenario-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden" data-copy-ignore>Copy Section</button>
                </div>`;

    let all_gov_data = [];
    for (const key in fullResults.scenarios_data) {
        if (key.endsWith('_wmin')) continue; // Process pairs together
        const scenario_key = key.replace('_wmax', '');
        // Dynamically generate the title map from the single source of truth
        const title_map = getScenarioTitleMap();
        const title = title_map[scenario_key] || scenario_key;

         const res_wmax = fullResults.scenarios_data[`${scenario_key}_wmax`];
         const res_wmin = fullResults.scenarios_data[`${scenario_key}_wmin`];
         const pattern_load_required = res_wmax.pattern_load_required;
         
         if (!res_wmax) continue;

         html += `<div class="mt-6">
                    <h4 class="text-lg font-semibold text-center">${title}</h4>
                 </div>
                 `;
         html += `<table class="results-container w-full mt-2 border-collapse">
                    <thead><tr><th>Combination</th><th>Calculation (Max Wind)</th><th>Calculation (Min Wind)</th></tr></thead>
                    <tbody>`;
        
        for (const combo in res_wmax.results) {
             if (!combo.includes('W') && !combo.includes('S') && !combo.includes('E')) continue; // Skip base combos
             const calc_string_wmax = res_wmax.calc_strings[combo];
             const calc_string_wmin = res_wmin.calc_strings[combo];
             const val_wmax = res_wmax.results[combo];
             const val_wmin = res_wmin.results[combo];

             const rowId = `row-${scenario_key}-${combo.replace(/\s/g, '-')}`;
             all_gov_data.push({ value: val_wmax, combo, title });
             all_gov_data.push({ value: val_wmin, combo, title });

             html += `<tr id="${rowId}">
                        <td>${combo}</td>
                        <td class="text-sm">${calc_string_wmax} = <b>${val_wmax.toFixed(2)}</b></td>
                        <td class="text-sm">${calc_string_wmin} = <b>${val_wmin.toFixed(2)}</b></td>
                      </tr>`;
        }
         html += `</tbody></table>`;

        if (pattern_load_required) {
            html += `<h4 class="text-lg font-semibold text-center mt-4">Pattern Live Load Combinations (0.75L)</h4>`;
            html += `<p class="text-xs text-center text-gray-500 dark:text-gray-400 mb-2">Required because Live Load > ${fullResults.inputs.combo_unit_system === 'imperial' ? '100 psf' : '4.79 kPa'} (ASCE 7-16/22 Sec. 4.3.5)</p>`;
            html += `<table class="results-container w-full mt-2 border-collapse">
                    <thead><tr><th>Combination</th><th>Calculation (Max Wind)</th><th>Calculation (Min Wind)</th></tr></thead>
                    <tbody>`;
            for (const combo in res_wmax.pattern_results) {
                if (!combo.includes('W') && !combo.includes('S') && !combo.includes('E')) continue;
                const calc_string_wmax = res_wmax.pattern_calc_strings[combo];
                const calc_string_wmin = res_wmin.pattern_calc_strings[combo];
                const val_wmax = res_wmax.pattern_results[combo];
                const val_wmin = res_wmin.pattern_results[combo];

                const rowId = `row-pattern-${scenario_key}-${combo.replace(/\s/g, '-')}`;
                all_gov_data.push({ value: val_wmax, combo, title, pattern: true });
                all_gov_data.push({ value: val_wmin, combo, title, pattern: true });
                html += `<tr id="${rowId}">
                            <td>${combo}</td>
                            <td class="text-sm">${calc_string_wmax} = <b>${val_wmax.toFixed(2)}</b></td>
                            <td class="text-sm">${calc_string_wmin} = <b>${val_wmin.toFixed(2)}</b></td>
                         </tr>`;
            }
            html += `</tbody></table>`;
        }
    }

    html += `</div>`; // Close main scenario section

    html += generateComboSummary(all_gov_data, fullResults.inputs.combo_design_method, p_unit);

    html += `</div>`;
    resultsContainer.innerHTML = html;
}