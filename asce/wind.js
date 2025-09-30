// --- GLOBAL VARIABLES for state management ---
let lastWindRunResults = null;

function addRangeIndicators() {
    document.querySelectorAll('input[type="number"][min], input[type="number"][max]').forEach(input => {
        const min = input.min ? `Min: ${input.min}` : '';
        const max = input.max ? `Max: ${input.max}` : '';
        const hint = `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${[min, max].filter(Boolean).join(' | ')}</div>`;
        input.insertAdjacentHTML('afterend', hint);
    });
}

const windInputIds = [
    'asce_standard', 'unit_system', 'risk_category', 'design_method',
    'jurisdiction', 'ground_elevation', 'topographic_factor_Kzt',
    'basic_wind_speed', 'exposure_category', 'mean_roof_height', 'building_flexibility',
    'fundamental_period',
    'building_length_L', 'building_width_B', 'enclosure_classification',
    'roof_type', 'roof_slope_deg', 'structure_type_for_kd',
    'gust_effect_factor_g', 'temporary_construction', 'wind_obstruction', 'effective_wind_area'
, 'calculate_height_varying_pressure'];

// =================================================================================
//  UI INJECTION & INITIALIZATION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {    
    // 1. Create the main calculation handler first, so it's available to other functions.
    const handleRunWindCalculation = createCalculationHandler({
        inputIds: windInputIds,
        storageKey: 'wind-calculator-inputs',
        validatorFunction: validateWindInputs,
        calculatorFunction: windLoadCalculator.run,
        renderFunction: renderWindResults,
        resultsContainerId: 'results-container',
        feedbackElId: 'feedback-message', // Explicitly pass feedback element ID
        buttonId: 'run-calculation-btn'
    });

    // --- EVENT HANDLERS ---
    function attachEventListeners() {
        document.getElementById('mean_roof_height').addEventListener('input', (event) => {
            const h = parseFloat(event.target.value) || 0;
            const is_imp = document.getElementById('unit_system').value === 'imperial';
            const limit = is_imp ? 60 : 18.3;
            document.getElementById('tall-building-section').classList.toggle('hidden', h <= limit);
        });

        // Create file-based handlers
        const handleSaveWindInputs = createSaveInputsHandler(windInputIds, 'wind-inputs.txt');
        const handleLoadWindInputs = createLoadInputsHandler(windInputIds, handleRunWindCalculation);

        // Attach handlers to buttons
        document.getElementById('run-calculation-btn').addEventListener('click', handleRunWindCalculation);
        document.getElementById('save-inputs-btn').addEventListener('click', handleSaveWindInputs);
        document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('wind-file-input'));
        document.getElementById('wind-file-input').addEventListener('change', (e) => handleLoadWindInputs(e));

        document.body.addEventListener('click', async (event) => {
            const copyBtn = event.target.closest('.copy-section-btn');
            if (copyBtn) {
                const targetId = copyBtn.dataset.copyTargetId;
                if (targetId) {
                    await handleCopyToClipboard(targetId, 'feedback-message');
                }
            }
            if (event.target.id === 'send-to-combos-btn' && lastWindRunResults) {
                sendWindToCombos(lastWindRunResults);
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            if (event.target.id === 'download-pdf-btn') {
                handleDownloadPdf('wind-report-content', 'Wind-Load-Report.pdf');
            }
            const button = event.target.closest('.toggle-details-btn');
            if (button) {
                const detailId = button.dataset.toggleId;
                const detailRow = document.getElementById(detailId);
                if (detailRow) {
                    detailRow.classList.toggle('is-visible');
                    button.textContent = detailRow.classList.contains('is-visible') ? '[Hide]' : '[Show]';
                }
            }
        });
    }

    // 3. Define the main app initialization function.
    function initializeApp() {
        initializeSharedUI();
        attachEventListeners();
        addRangeIndicators();
        // Use a small timeout to ensure all elements are ready before triggering a calculation from localStorage
        setTimeout(() => {
            loadInputsFromLocalStorage('wind-calculator-inputs', windInputIds);
        }, 100);
    }

    // 4. Run the app.
    initializeApp();    
}); // END DOMContentLoaded

// =================================================================================
//  WIND LOAD CALCULATOR LOGIC
// =================================================================================

const windLoadCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
// Internal pressure coefficient GCpi
// Reference: ASCE 7-16/22 Table 26.13-1
function getInternalPressureCoefficient(enclosureClass) {
        const map = {
            "Enclosed": [0.18, "ASCE 7 Table 26.13-1 (Enclosed)"],
            "Partially Enclosed": [0.55, "ASCE 7 Table 26.13-1 (Partially Enclosed)"],
            "Open": [0.00, "ASCE 7 Table 26.13-1 (Open)"]
        };
        return map[enclosureClass] || [0.00, "Invalid Enclosure"];
    }

    // Detailed Cp values for Gable and Hip roofs
    // Reference: ASCE 7-16/22 Figure 27.3-2
    function getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem) {
        const cpMap = {};
        const theta = roofSlopeDeg;
        const h_over_L = L > 0 ? h / L : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        // Calculate 'a' per ASCE 7-16/22 Section 27.3.2
        const least_dim = Math.min(L, B);
        let a = Math.min(0.1 * least_dim, 0.4 * h);
        const min_a_val1 = 0.04 * least_dim;
        const min_a_val2 = unitSystem === 'imperial' ? 3.0 : 0.9;
        a = Math.max(a, min_a_val1, min_a_val2);

        const a_str = `(a=${a.toFixed(1)} ${h_unit})`;

        // Interpolation functions for Cp based on theta and h/L
        // Windward zones (1, 2, 3)
        const cp_1_windward = interpolate(theta, [10, 20, 30, 45], [-0.7, -0.4, 0.2, 0.4]);
        const cp_2_windward = interpolate(theta, [10, 20, 30, 45], [-0.9, -0.7, -0.2, 0.4]);
        const cp_3_windward = interpolate(theta, [20, 30, 45], [-1.3, -1.0, -0.5]);

        // Leeward zones (1, 2, 3)
        const cp_1_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.5, -0.5, -0.3]);
        const cp_2_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.7, -0.7, -0.5]);
        const cp_3_leeward = -0.9;

        // Assign values to the map
        cpMap[`Roof Zone 1 (Windward)`] = cp_1_windward;
        cpMap[`Roof Zone 2 (Windward) ${a_str}`] = cp_2_windward;
        if (theta >= 20) {
            cpMap[`Roof Zone 3 (Windward) ${a_str}`] = cp_3_windward;
        }

        cpMap[`Roof Zone 1 (Leeward)`] = cp_1_leeward;
        cpMap[`Roof Zone 2 (Leeward) ${a_str}`] = cp_2_leeward;
        cpMap[`Roof Zone 3 (Leeward) ${a_str}`] = cp_3_leeward;

        if (isHip) {
            // Hip roof end zones (1E, 2E, 3E)
            const cp_1E = interpolate(theta, [10, 20, 27], [-0.9, -0.7, -0.5]);
            const cp_2E = interpolate(theta, [10, 20, 27], [-1.3, -0.9, -0.7]);
            const cp_3E = interpolate(theta, [20, 27], [-1.3, -1.0]);

            cpMap[`Hip End Zone 1E`] = cp_1E;
            cpMap[`Hip End Zone 2E ${a_str}`] = cp_2E;
            if (theta >= 20) {
                cpMap[`Hip End Zone 3E ${a_str}`] = cp_3E;
            }
        }

        // Side walls are always -0.7
        cpMap["Side Wall"] = -0.7;

        return cpMap;
    }

    // Cp values for buildings of all heights (Analytical Procedure)
    // Reference: ASCE 7-16 Figure 27.3-1
    function getAnalyticalCpValues(h, dim_parallel_to_wind, dim_perp_to_wind, roofSlopeDeg) {
    const cpMap = {};
    const L_over_B = dim_perp_to_wind > 0 ? dim_parallel_to_wind / dim_perp_to_wind : 0;
    
    cpMap["Windward Wall"] = 0.8;
    cpMap["Side Wall"] = -0.7;
    // Leeward wall Cp depends on L/B ratio
    cpMap[`Leeward Wall (L/B = ${L_over_B.toFixed(2)})`] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
    
    
    // Roof coefficients also depend on h/L ratio
    const h_over_L = dim_parallel_to_wind > 0 ? h / dim_parallel_to_wind : 0;
    
    if (h_over_L <= 0.8) { // Note: ASCE 7-16 Fig 27.3-1 uses h/L, not h/B
        cpMap[`Roof Windward (h/L = ${h_over_L.toFixed(2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.7, -0.5, -0.3, -0.2, 0.0, 0.2, 0.4]); // This was missing a value in the original code
        cpMap[`Roof Leeward (h/L = ${h_over_L.toFixed(2)})`] = interpolate(roofSlopeDeg, [10, 15, 20], [-0.3, -0.5, -0.6]);
    } else {
        cpMap[`Roof Windward (h/L = ${h_over_L.toFixed(2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.9, -0.7, -0.4, -0.3, -0.2, 0.0, 0.4]);
        cpMap[`Roof Leeward (h/L = ${h_over_L.toFixed(2)})`] = -0.7;
    }
    
    return { cpMap };
}

    // Net pressure coefficients CN for Open Buildings with Free Roofs
    // Reference: ASCE 7-16/22 Figure 27.3-4
    function getOpenBuildingCnValues(roofSlopeDeg, isObstructed) {
        const cnMap = {};
        const theta = Math.abs(roofSlopeDeg); // Use absolute slope
        const caseKey = isObstructed ? 'obstructed' : 'unobstructed';

        // Net Pressure Coefficients, CN, for Monoslope Roofs
        const monoslope_map = {
            unobstructed: {
                zones: ['Zone 2', 'Zone 3'],
                windward_qtr: [interpolate(theta, [5, 30, 45], [0.8, 1.2, 1.2]), interpolate(theta, [5, 30, 45], [1.2, 1.8, 1.8])],
                middle_half:  [interpolate(theta, [5, 30, 45], [-0.8, -0.8, -0.8]), interpolate(theta, [5, 30, 45], [-1.2, -1.2, -1.2])],
                leeward_qtr:  [interpolate(theta, [5, 30, 45], [-0.6, -0.5, -0.5]), interpolate(theta, [5, 30, 45], [-1.0, -0.8, -0.8])]
            },
            obstructed: {
                zones: ['Zone 2', 'Zone 3'],
                windward_qtr: [interpolate(theta, [5, 30, 45], [1.6, 2.4, 2.4]), interpolate(theta, [5, 30, 45], [2.2, 3.3, 3.3])],
                middle_half:  [interpolate(theta, [5, 30, 45], [-1.6, -1.6, -1.6]), interpolate(theta, [5, 30, 45], [-2.2, -2.2, -2.2])],
                leeward_qtr:  [interpolate(theta, [5, 30, 45], [-1.2, -1.0, -1.0]), interpolate(theta, [5, 30, 45], [-1.6, -1.4, -1.4])]
            }
        };

        // For pitched/troughed, we use the monoslope values for each half
        const data = monoslope_map[caseKey];
        cnMap[`Windward Roof (First Quarter)`] = { cn_pos: data.windward_qtr[0], cn_neg: -data.windward_qtr[0] };
        cnMap[`Windward Roof (Zone 3)`] = { cn_pos: data.windward_qtr[1], cn_neg: -data.windward_qtr[1] };
        cnMap[`Middle Roof Area (Half)`] = { cn_pos: data.middle_half[0], cn_neg: -data.middle_half[0] };
        cnMap[`Middle Roof Area (Zone 3)`] = { cn_pos: data.middle_half[1], cn_neg: -data.middle_half[1] };
        cnMap[`Leeward Roof (Last Quarter)`] = { cn_pos: data.leeward_qtr[0], cn_neg: -data.leeward_qtr[0] };
        cnMap[`Leeward Roof (Zone 3)`] = { cn_pos: data.leeward_qtr[1], cn_neg: -data.leeward_qtr[1] };

        return { cnMap, ref: `ASCE 7 Fig 27.3-4 (${caseKey} flow)` };
    }

    // External pressure coefficients Cp
    // Reference: ASCE 7-16/22 Figures 27.4-1, 27.4-2, 27.4-3 (now includes edge/corner zones for flat roofs)
    // NOTE: For more complex roof shapes, see future improvement
    function getCpValues(standard, h, L, B, roofType, roofSlopeDeg, unitSystem) {
        const cpMap = {};
        const refNotes = {};
        const L_over_B = B > 0 ? L / B : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        cpMap["Windward Wall"] = 0.8;
        refNotes["Windward Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Side Wall"] = -0.7;
        refNotes["Side Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Leeward Wall"] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
        refNotes["Leeward Wall"] = "ASCE 7 Fig. 27.4-1 (varies with L/B)";

        if (roofType === "flat") {
            if (standard === "ASCE 7-22") {
                // ASCE 7-22 Figure 27.4-1 (Zoned approach)
                let a = Math.min(0.1 * Math.min(L, B), 0.4 * h);
                const min_a = unitSystem === 'imperial' ? 3.0 : 0.9;
                a = Math.max(a, min_a);
                cpMap[`Roof Zone 1 (0 to ${a.toFixed(1)} ${h_unit})`] = -0.9;
                cpMap[`Roof Zone 2 (${a.toFixed(1)} to ${2*a.toFixed(1)} ${h_unit})`] = -0.5;
                cpMap[`Roof Zone 3 (> ${2*a.toFixed(1)} ${h_unit})`] = -0.3;
                refNotes["Roof"] = "ASCE 7-22 Fig. 27.4-1 (Zoned approach)";
            } else { // ASCE 7-16
                // ASCE 7-16 Figure 27.4-1 (h/L approach)
                const h_over_L = L > 0 ? h / L : 0;
                if (h_over_L <= 0.5) {
                    cpMap[`Roof (0 to ${(h/2).toFixed(1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${(h/2).toFixed(1)} to ${h.toFixed(1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${h.toFixed(1)} to ${(2*h).toFixed(1)} ${h_unit})`] = -0.5;
                    cpMap[`Roof (> ${(2*h).toFixed(1)} ${h_unit})`] = -0.3;
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L ≤ 0.5)";
                } else {
                    cpMap[`Roof (0 to ${(h/2).toFixed(1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -1.3]);
                    cpMap[`Roof (${(h/2).toFixed(1)} to ${h.toFixed(1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -0.7]);
                    cpMap[`Roof (> ${h.toFixed(1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.5, -0.4]);
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L > 0.5)";
                }
            }
        } else if (["gable", "hip"].includes(roofType)) {
            const isHip = roofType === 'hip';
            const gableHipCp = getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem);
            Object.assign(cpMap, gableHipCp);
            refNotes["Roof"] = `ASCE 7-16/22 Fig. 27.4-2 (${isHip ? 'Hip' : 'Gable'})`;
        }
        return { cpMap, refNotes };
    }

// Directionality factor Kd
// Reference: ASCE 7-16/22 Table 26.6-1
function getKdFactor(structureType) {
        const kdMap = {
            "Buildings (MWFRS, C&C)": [0.85, "ASCE 7 Table 26.6-1 (Buildings)"],
            "Arched Roofs": [0.85, "ASCE 7 Table 26.6-1 (Arched Roofs)"],
            "Solid Freestanding Signs/Walls": [0.85, "ASCE 7 Table 26.6-1 (Signs/Walls)"],
            "Open Signs/Frames": [0.85, "ASCE 7 Table 26.6-1 (Open Signs)"],
            "Trussed Towers (Triangular, Square, Rectangular)": [0.85, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Trussed Towers (All Other Cross Sections)": [0.95, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Chimneys, Tanks (Square)": [0.90, "ASCE 7 Table 26.6-1 (Square)"],
            "Chimneys, Tanks (Hexagonal)": [0.95, "ASCE 7 Table 26.6-1 (Hexagonal)"]
        };
        return kdMap[structureType] || [1.0, "ASCE 7 Table 26.6-1 (Default)"];
    }

// Importance factor Iw
// Reference: ASCE 7-16/22 Table 1.5-2
function getImportanceFactor(category, standard) {
        const factors = standard === "ASCE 7-22" ? { "I": 0.75, "II": 1.00, "III": 1.15, "IV": 1.15 } : { "I": 0.87, "II": 1.00, "III": 1.15, "IV": 1.15 };
        const ref = standard === "ASCE 7-22" ? "ASCE 7-22 Table 1.5-2" : "ASCE 7-16 Table 1.5-2";
        return [factors[category] || 1.00, ref];
    }

// Wind exposure constants (alpha, zg)
// Reference: ASCE 7-16/22 Table 26.9-1
function getExposureConstants(category, units) {
    const expMap = {
        'B': { alpha: 7.0, zg_imp: 1200.0, zg_metric: 365.8, ref: "ASCE 7 Table 26.9-1 (Exposure B)" },
        'C': { alpha: 9.5, zg_imp: 900.0, zg_metric: 274.3, ref: "ASCE 7 Table 26.9-1 (Exposure C)" },
        'D': { alpha: 11.5, zg_imp: 700.0, zg_metric: 213.4, ref: "ASCE 7 Table 26.9-1 (Exposure D)" }
    };
    const data = expMap[category] || expMap['C'];
    const zg = units === 'imperial' ? data.zg_imp : data.zg_metric;
    return { alpha: data.alpha, zg, ref_note: data.ref };
}

// Calculation of exposure factor Kz
// Reference: ASCE 7-16/22 Section 26.10, Eq. 26.10-1
// Table 26.10-1 for exposure constants
function calculateKz(h, category, units) { // Refactored for readability
    // --- 1. Input Validation (Guard Clauses) ---
    if (!isFinite(h) || h < 0 || !category) {
        console.error("Invalid parameters for calculateKz:", { h, category });
        return { Kz: 1.0, alpha: 0, zg: 0, ref_note: "Error: Invalid input" };
    }

    const { alpha, zg, ref_note } = getExposureConstants(category, units);
    if (!isFinite(alpha) || !isFinite(zg) || alpha <= 0 || zg <= 0) {
        console.error("Invalid exposure constants from getExposureConstants:", { alpha, zg });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Invalid exposure constants" };
    }

    // --- 2. Main Calculation Logic ---
    const min_h = units === 'imperial' ? 15.0 : 4.6;
    const calc_h = Math.max(h, min_h);
    const Kz = 2.01 * Math.pow(calc_h / zg, 2 / alpha);

    // --- 3. Output Validation ---
    if (!isFinite(Kz)) {
        console.error("Kz calculation resulted in a non-finite value:", { calc_h, zg, alpha });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Kz calculation failed" };
    }

    return { Kz, alpha, zg, ref_note };
}

// Elevation factor Ke
// Reference: ASCE 7-16 Table 26.9-1; ASCE 7-22 Section 26.9 (Ke=1.0)
function calculateKe(elevation, units, standard) {
        if (standard === "ASCE 7-22") return [1.0, "ASCE 7-22 Section 26.9 (Ke = 1.0)"];
        const elev_ft = [-500, 0, 500, 1000, 2000, 3000, 4000, 5000, 6000];
        const ke_vals = [1.05, 1.00, 0.95, 0.90, 0.82, 0.74, 0.67, 0.61, 0.55];
        const elev_calc = units === 'metric' ? elevation * 3.28084 : elevation;
        const ke_val = interpolate(elev_calc, elev_ft, ke_vals);
        return [ke_val, `ASCE 7-16 Table 26.9-1 (Elevation: ${elev_calc.toFixed(0)} ft)`];
    }

// Wind velocity pressure qz
// Reference: ASCE 7-16/22 Eq. 26.10-1
function calculateVelocityPressure(Kz, Kzt, Kd, Ke, V, standard, riskCat, units) {
    // Validate all inputs
    const safeKz = isFinite(Kz) && Kz > 0 ? Kz : 1.0;
    const safeKzt = isFinite(Kzt) && Kzt > 0 ? Kzt : 1.0;
    const safeKd = isFinite(Kd) && Kd > 0 ? Kd : 0.85;
    const safeKe = isFinite(Ke) && Ke > 0 ? Ke : 1.0;
    const safeV = isFinite(V) && V > 0 ? V : 100; // Default safe wind speed
    
    const [Iw, iw_ref] = getImportanceFactor(riskCat, standard);
    const constant = units === 'imperial' ? 0.00256 : 0.613;
    
    let qz, ref_note;
    if (standard === 'ASCE 7-22') {
        // ASCE 7-22 includes Iw directly in the velocity pressure equation.
        qz = constant * safeKz * safeKzt * safeKd * safeKe * Iw * (safeV * safeV); 
        ref_note = `ASCE 7-22 Eq. 26.10-1 (Iw = ${Iw.toFixed(2)} from ${iw_ref})`;
    } else { // ASCE 7-16 and other fallbacks
        // ASCE 7-16 does NOT include Iw in the velocity pressure equation. It's applied later in load combinations.
        qz = constant * safeKz * safeKzt * safeKd * safeKe * (safeV * safeV);
        ref_note = "ASCE 7-16 Eq. 26.10-1";
    }
    
    // Final validation
    if (!isFinite(qz) || qz < 0) {
        console.warn("Invalid qz calculated, using fallback");
        qz = units === 'imperial' ? 10.0 : 500.0; // Reasonable fallback
        ref_note += " - Fallback value used due to calculation issue";
    }
    
    return { qz, ref_note };
}

// Design pressure p = qz(G*Cp - GCpi)
// Reference: ASCE 7-16/22 Eq. 27.4-1 (MWFRS)
function calculateDesignPressure(q_ext, q_int, G, Cp, GCpi) {
    // Correct formula: p = q(GCp) - qi(GCpi)
    // q = q_ext (qz for windward wall, qh for others)
    // qi = q_int (qh for enclosed/partially enclosed)
    const external_pressure = q_ext * G * Cp;
    const internal_pressure = q_int * GCpi;
    return external_pressure - internal_pressure;
}
    // --- C&C Calculation Helpers for h > 60 ft ---

    /**
     * A generic helper for 2D interpolation of GCp values for high-rise buildings.
     * It interpolates first based on the logarithm of the effective wind area,
     * and then based on the building height.
     * @param {object} gcp_data - The data object containing GCp values, heights, and areas.
     * @param {number} A - The effective wind area.
     * @param {number} h - The mean roof height.
     * @returns {object} An object mapping zones to their interpolated positive and negative GCp values.
     */
    function interpolateHighRiseGcp(gcp_data, A, h) {
        const log_areas = gcp_data.areas.map(Math.log);
        const log_A = Math.log(A);
        const results = {};

        // Iterate over the zones defined in the gcp_data object (e.g., 'Wall Zone 4', 'Roof Zone 1'').
        for (const zone of Object.keys(gcp_data).filter(k => k !== 'heights' && k !== 'areas')) {
            const zoneData = gcp_data[zone];
            
            // 1. Interpolate across area for each height point in the table.
            const pos_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, zoneData.pos));
            const neg_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, zoneData.neg));
            
            // 2. Interpolate across height using the results from the area interpolation.
            results[zone] = {
                positive: interpolate(h, gcp_data.heights, pos_vals_at_h),
                negative: interpolate(h, gcp_data.heights, neg_vals_at_h)
            };
        }
        return results;
    }

    function calculateWallPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Wall Zone 4': { pos: [0.9, 0.9, 0.8], neg: [-1.0, -0.9, -0.8] },
            'Wall Zone 5': { pos: [0.9, 0.9, 0.8], neg: [-1.2, -1.1, -1.0] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    function calculateSteepRoofCandC(A, h, theta) {
        // ASCE 7-16 Figure 30.5-2 for Steep Roofs (theta > 7 deg)
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Zone 1\'': { pos: [0.7, 0.5, 0.3], neg: [-1.0, -0.9, -0.7] },
            'Zone 2\'': { pos: [0.9, 0.7, 0.5], neg: [-1.8, -1.4, -1.0] },
            'Zone 3\'': { pos: [1.3, 1.0, 0.7], neg: [-2.6, -2.0, -1.4] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    function calculateLowSlopeRoofPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Roof Zone 1\'': { pos: [0.7, 0.5, 0.3], neg: [-1.1, -0.9, -0.7] },
            'Roof Zone 2\'': { pos: [0.7, 0.5, 0.3], neg: [-1.8, -1.4, -1.0] },
            'Roof Zone 3\'': { pos: [0.7, 0.5, 0.3], neg: [-2.6, -2.0, -1.4] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    /**
     * Calculates C&C pressures for high-rise buildings (h > 60ft) by selecting the appropriate
     * data tables and converting the resulting GCp values to pressures.
     * @param {object} inputs - The user inputs object.
     * @param {number} qh - The velocity pressure at the mean roof height.
     * @param {number} GCpi_abs - The absolute value of the internal pressure coefficient.
     * @returns {object} An object containing the calculated pressures and other metadata.
     */
    function calculateHighRiseCandCPressures(inputs, qh, GCpi_abs) {
        const { mean_roof_height: h, effective_wind_area: A, roof_slope_deg, roof_type, unit_system } = inputs;
        const warnings = [];
        const results = {};

        // Wall pressures (Figure 30.5-1)
        Object.assign(results, calculateWallPressuresHighRise(A, h));

        // Roof pressures based on roof type and slope
        const is_low_slope = roof_slope_deg <= 7;
        if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && is_low_slope)) {
            Object.assign(results, calculateLowSlopeRoofPressuresHighRise(A, h));
        } else if (['gable', 'hip'].includes(roof_type) && !is_low_slope) {
            Object.assign(results, calculateSteepRoofCandC(A, h, roof_slope_deg));
        } else {
            warnings.push(`C&C pressures for '${roof_type}' roofs on high-rise buildings are not explicitly covered by the prescriptive methods in ASCE 7-16 Ch. 30 and are not calculated.`);
        }

        // Convert GCp values to final pressures
        const finalPressures = {};
        for (const [zone, gcps] of Object.entries(results)) {
            if (typeof gcps.positive !== 'number' || typeof gcps.negative !== 'number') continue;

            const p1 = qh * (gcps.positive - GCpi_abs);
            const p2 = qh * (gcps.positive - (-GCpi_abs));
            const p3 = qh * (gcps.negative - GCpi_abs);
            const p4 = qh * (gcps.negative - (-GCpi_abs));

            finalPressures[zone] = {
                gcp_pos: gcps.positive, gcp_neg: gcps.negative,
                p_pos: Math.max(p1, p2, p3, p4), p_neg: Math.min(p1, p2, p3, p4)
            };
        }

        return { applicable: true, pressures: finalPressures, ref: `ASCE 7-16 Ch. 30, Part 2 (h > ${unit_system === 'imperial' ? '60ft' : '18.3m'})`, is_high_rise: true, warnings };
    }

    // Enhanced C&C calculation function
    function calculateCandCPressuresEnhanced(inputs, qh, GCpi_abs) {
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type, unit_system } = inputs;
        const h = mean_roof_height;
        const A = effective_wind_area;
        const is_high_rise = unit_system === 'imperial' ? h > 60 : h > 18.3;
        const warnings = [];

        // ASCE 7-16 Chapter 30, Part 2: Buildings with h > 60 ft
        if (is_high_rise) {
            return calculateHighRiseCandCPressures(inputs, qh, GCpi_abs);
        }

        // Fallback to existing h <= 60 ft calculations
        return calculateLowRiseCandCPressures(inputs, qh, GCpi_abs);
    }

    // Data store for ASCE 7-16 C&C GCp values for low-rise buildings (h <= 60ft)
    const GCP_DATA = {
        wall: {
            zone4: [-1.1, -1.1, -1.1, -1.1, -1.0, -0.9], // Fig 30.3-1
            zone5: [-1.4, -1.3, -1.2, -1.1, -1.0, -0.9]  // Fig 30.3-1
        },
        gable: { // Fig 30.3-2
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5],
                zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5],
                zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5]
            }
        },
        hip: { // Fig 30.3-3
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5], zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5],
                zone1E: [-1.3, -1.3, -1.1, -1.0, -0.7, -0.5], zone2E: [-2.2, -2.0, -1.6, -1.3, -0.8, -0.5], zone3E: [-2.8, -2.5, -2.0, -1.5, -0.8, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5], zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5],
                zone1E: [-1.5, -1.5, -1.3, -1.1, -0.7, -0.5], zone2E: [-2.5, -2.3, -1.8, -1.4, -0.8, -0.5], zone3E: [-3.3, -3.0, -2.3, -1.7, -0.8, -0.5]
            }
        }
    };

    /**
     * Helper to get GCp values for different roof types by interpolating based on slope.
     */
    function getGcpValuesForRoof(roof_type, theta) {
        const roofData = GCP_DATA[roof_type];
        if (!roofData) return {};

        const interpolate_gcp_array = (arrA, arrB) => arrA.map((valA, i) => interpolate(theta, [7, 27], [valA, arrB[i]]));

        if (theta <= 7) return roofData.caseA;
        if (theta > 45) return roofData.caseB; // Per figures, use Case B for theta > 27
        if (theta > 7 && theta <= 27) {
            const interpolated_gcp = {};
            for (const zone in roofData.caseA) {
                interpolated_gcp[zone] = interpolate_gcp_array(roofData.caseA[zone], roofData.caseB[zone]);
            }
            return interpolated_gcp;
        }
        return roofData.caseB; // 27 < theta <= 45
    }

    function calculateLowRiseCandCPressures(inputs, qz, GCpi_abs) { // Refactored for readability
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type } = inputs;
        const A = effective_wind_area;
        const theta = roof_slope_deg;

        // Setup for logarithmic interpolation based on effective wind area
        const area_points = [10, 20, 50, 100, 500, 1000];
        const log_area_points = area_points.map(Math.log);
        const log_A = Math.log(A);
        const logInterpolate = (gcp_values) => interpolate(log_A, log_area_points, gcp_values);

        const gcp_map = {};

        // Wall Pressures (Fig 30.3-1)
        gcp_map['Wall Zone 4 (Interior)'] = logInterpolate(GCP_DATA.wall.zone4);
        gcp_map['Wall Zone 5 (Corners)'] = logInterpolate(GCP_DATA.wall.zone5);

        // Roof Pressures
        if (['gable', 'hip'].includes(roof_type)) {
            const roof_gcp_arrays = getGcpValuesForRoof(roof_type, theta);
            const zone_map = { zone1: 'Roof Zone 1 (Interior)', zone2: 'Roof Zone 2 (Edges)', zone3: 'Roof Zone 3 (Corners)', zone1E: 'Roof End Zone 1E', zone2E: 'Roof End Zone 2E', zone3E: 'Roof End Zone 3E' };
            for (const zone in roof_gcp_arrays) {
                gcp_map[zone_map[zone]] = logInterpolate(roof_gcp_arrays[zone]);
            }
        }

        const final_pressures = {};
        for (const zone in gcp_map) {
            const gcp = gcp_map[zone];
            // p = qh * (GCp - GCpi)
            const p_pos_gcp = qz * (gcp - (-GCpi_abs)); // Uplift GCp is negative, check with internal suction
            const p_neg_gcp = qz * (gcp - (+GCpi_abs)); // Uplift GCp is negative, check with internal pressure
            final_pressures[zone] = {
                gcp: gcp,
                p_pos: Math.max(p_pos_gcp, p_neg_gcp), // Not typical for these figures, but for completeness
                p_neg: Math.min(p_pos_gcp, p_neg_gcp) // C&C is usually governed by suction
            };
        }
        return { applicable: true, pressures: final_pressures, ref: "ASCE 7 Ch. 30, Part 1 (h<=60ft)" };
    }

    function calculateHeightVaryingPressures(inputs, intermediate_globals) {
        const { exposure_category, unit_system, risk_category, mean_roof_height, design_method } = inputs;
        const { Kzt, Kd, Ke, V_in, effective_standard, abs_gcpi, G, qz: qh } = intermediate_globals;
    
        // Better validation
        if (!inputs || !intermediate_globals || !mean_roof_height || mean_roof_height <= 0 || !exposure_category) {
            console.error("Invalid inputs for height varying pressure calculation");
            return [];
        }
    
        const results = [];
        const is_imp = unit_system === 'imperial';
        const step = is_imp ? 5 : 1.5;
        const heights = [];
    
        // Generate height points
        for (let z = 0; z <= mean_roof_height; z += step) {
            heights.push(z);
        }
        // Ensure roof height is included if the step doesn't land on it
        if (heights[heights.length - 1] < mean_roof_height) {
            heights.push(mean_roof_height);
        }
    
        for (const z of heights) {
            // Calculate Kz for each height
            const { Kz } = calculateKz(z, exposure_category, unit_system);
            // Calculate velocity pressure at height z
            const { qz } = calculateVelocityPressure(Kz, Kzt, Kd, Ke, V_in, effective_standard, risk_category, unit_system);
    
            // Use the main design pressure function for consistency. Cp for windward wall is 0.8.
            const p_pos = calculateDesignPressure(qz, qh, G, 0.8, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, qh, G, 0.8, -abs_gcpi);
    
            results.push({ height: z, Kz, qz, p_pos, p_neg });
        }
        return results;
    }

    /**
     * Retrieves constants for gust effect factor calculation from ASCE 7-16 Table 26.11-1.
     * // Reference: ASCE 7-16 Table 26.11-1
     */
    function getGustCalculationConstants(exposure_category, unit_system) {
        const constants = {
            'B': { b_bar: 0.47, c: 0.30, l: 320, epsilon_bar: 1/3.0 },
            'C': { b_bar: 0.65, c: 0.20, l: 500, epsilon_bar: 1/5.0 },
            'D': { b_bar: 0.80, c: 0.15, l: 650, epsilon_bar: 1/8.0 }
        };
        const metric_multipliers = { b_bar: 1.32, c: 1.5, l: 0.3048, epsilon_bar: 1.0 };

        let data = constants[exposure_category] || constants['C']; // Default to C

        if (unit_system === 'metric') {
            data = {
                b_bar: data.b_bar * metric_multipliers.b_bar,
                c: data.c * metric_multipliers.c,
                l: data.l * metric_multipliers.l,
                epsilon_bar: data.epsilon_bar
            };
        }
        return data;
    }

    /**
     * Calculates the mean hourly wind speed at a given height.
     * // Reference: ASCE 7-16 Eq. 26.11-7
     */
    function calculateMeanHourlyWindSpeed(V_in, z_effective, zg, alpha, b_bar, unit_system) {
        // For Imperial units, V_in (mph) is converted to fps. For Metric, V_in (m/s) is used directly.
        const V_bar_33ft = V_in * b_bar * Math.pow(33 / zg, 1 / alpha) * (unit_system === 'imperial' ? (88/60) : 1);
        return V_bar_33ft * Math.pow(z_effective / 33, 1 / alpha);
    }

    /**
     * Calculates the resonant response factor, R.
     * // Reference: ASCE 7-16 Eq. 26.11-10
     */
    function calculateResonantResponseFactor(n1, V_z_bar, Lz_bar) {
        // Damping ratio (beta) is typically 0.01 for steel buildings and 0.015 for concrete buildings.
        // ASCE 7-16 Section C26.11.3 suggests 0.01 is a reasonable general assumption.
        const damping_ratio = 0.01;
        const N1 = (n1 * Lz_bar) / V_z_bar;
        const Rn = (7.47 * N1) / Math.pow(1 + 10.3 * N1, 5/3);
        const Rh = (1 / N1) - (1 / (2 * N1 * N1)) * (1 - Math.exp(-2 * N1));
        const RB = Rh; // For simplicity, assuming B=h, so Rh = RB

        return Math.sqrt((1 / damping_ratio) * Rn * Rh * RB);
    }

    /**
     * Calculates the Gust Effect Factor G for flexible structures per ASCE 7-16 Section 26.11.
     */
    function calculateGustEffectFactor(inputs, intermediate) { // Refactored for readability
        if (inputs.building_flexibility !== 'Flexible' || !inputs.fundamental_period) {
            return { G: 0.85, ref: "ASCE 7-16 Sec. 26.11.1 (Rigid Structure)" };
        } // Corrected validation
        const { V_in, unit_system, mean_roof_height, building_length_L, building_width_B, exposure_category, fundamental_period } = inputs;
        const { alpha, zg } = intermediate; // Defensive destructuring
        const n1 = fundamental_period > 0 ? 1 / fundamental_period : 0;

        const { b_bar, c, l, epsilon_bar } = getGustCalculationConstants(exposure_category, unit_system);

        const z_bar = 0.6 * mean_roof_height;
        const min_z = unit_system === 'imperial' ? 15.0 : 4.6;
        const z_bar_effective = Math.max(z_bar, min_z);
        
        const V_z_bar = calculateMeanHourlyWindSpeed(V_in, z_bar_effective, zg, alpha, b_bar, unit_system);
        // Turbulence Intensity, Iz_bar. Ref: ASCE 7-16 Eq. 26.11-7
        const Iz_bar = c * Math.pow(33 / z_bar_effective, 1/6);
        const ref_h = unit_system === 'imperial' ? 33 : 10; // 33 ft or 10 m
        // Integral Length Scale, Lz_bar. Ref: ASCE 7-16 Eq. 26.11-8
        const Lz_bar = l * Math.pow(z_bar_effective / ref_h, epsilon_bar);
    
        // Peak factor for background response (gQ) is taken as 3.4 per ASCE 7-16 Section 26.11.2.
        const gQ = 3.4;
        // Peak factor for resonant response, gR. Ref: ASCE 7-16 Eq. 26.11-9
        const gR = Math.sqrt(2 * Math.log(3600 * n1)) + (0.577 / Math.sqrt(2 * Math.log(3600 * n1)));
    
        // Background Response Factor, Q. Ref: ASCE 7-16 Eq. 26.11-14
        const Q = Math.sqrt(1 / (1 + 0.63 * Math.pow(Math.max(mean_roof_height, building_length_L) / Lz_bar, 0.63)));
        const R = calculateResonantResponseFactor(n1, V_z_bar, Lz_bar);

        // Gust-Effect Factor, Gf. Ref: ASCE 7-16 Eq. 26.11-6
        const Gf = (1 + 1.7 * Iz_bar * Math.sqrt(gQ*gQ * Q*Q + gR*gR * R*R)) / (1 + 1.7 * gQ * Iz_bar);
    
        return {
            G: Gf,
            ref: `ASCE 7-16 Eq. 26.11-6 (Flexible, G=${Gf.toFixed(3)})`
        };
    }

    function calculateRoofPressureByDistance(inputs, intermediate_globals, cp_map, building_dimension_parallel_to_wind) {
        const { gust_effect_factor_g } = inputs;
        const { qz, abs_gcpi } = intermediate_globals;
        const results = [];
        const L = building_dimension_parallel_to_wind;

        // Create an array of distances to evaluate
        const distances = [];
        for (let i = 0; i <= 20; i++) { // Evaluate at 21 points (every 5%)
            distances.push(L * (i / 20));
        }

        // Create a lookup from the cp_map
        const roof_zones = [];
        for (const [surface, cp] of Object.entries(cp_map)) {
            if (!surface.toLowerCase().includes('roof')) continue; // Only consider roof surfaces
            // Regex to find zones like "Roof (0 to 30 ft)"
            const matches = surface.match(/\((\d+(\.\d+)?)\s*to\s*(\d+(\.\d+)?)/);
            if (matches) {
                roof_zones.push({ start: parseFloat(matches[1]), end: parseFloat(matches[3]), cp });
            }
        }

        distances.forEach(dist => {
            // Find the correct Cp value for the current distance from the pre-calculated zones
            let cp_at_dist = roof_zones.find(zone => dist >= zone.start && dist <= zone.end)?.cp ?? 
                             (cp_map["Leeward Roof"] || cp_map["Roof Leeward"] || -0.3); // Fallback to leeward value

            const p_pos = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, -abs_gcpi);
            const distance_ratio = L > 0 ? dist / L : 0;
            results.push({ distance: dist, cp: cp_at_dist, p_pos, p_neg, distance_ratio });
        });

        return results;
    }

    /**
     * Calculates MWFRS pressures for low-rise buildings (h <= 60ft).
     * @param {object} inputs - The user inputs.
     * @param {object} intermediate_globals - Pre-calculated intermediate values (qz, G, etc.).
     * @returns {object} An object containing the directional results.
     */
    function calculateLowRisePressures(inputs, intermediate_globals) {
        const { effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system } = inputs;
        const { qz, G, abs_gcpi } = intermediate_globals;
        const directional_results = {};

        // Wind Perpendicular to L (wind parallel to L)
        const { cpMap: cp_map_L } = getCpValues(effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${(building_length_L / building_width_B).toFixed(2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        // Wind Perpendicular to B (wind parallel to B)
        const { cpMap: cp_map_B } = getCpValues(effective_standard, mean_roof_height, building_width_B, building_length_L, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${(building_width_B / building_length_L).toFixed(2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        return directional_results;
    }

    /**
     * Calculates MWFRS pressures for high-rise buildings (h > 60ft).
     * @param {object} inputs - The user inputs.
     * @param {object} intermediate_globals - Pre-calculated intermediate values (qz, G, etc.).
     * @returns {object} An object containing the directional results.
     */
    function calculateHighRisePressures(inputs, intermediate_globals) {
        const { mean_roof_height, building_length_L, building_width_B, roof_slope_deg } = inputs;
        const { qz, G, abs_gcpi } = intermediate_globals;
        const directional_results = {};

        // Wind perpendicular to L (Building Length is parallel to wind)
        const { cpMap: cp_map_L } = getAnalyticalCpValues(mean_roof_height, building_length_L, building_width_B, roof_slope_deg);
        directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => ({
            surface, cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi), p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6, p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        // Wind perpendicular to B (Building Width is parallel to wind)
        const { cpMap: cp_map_B } = getAnalyticalCpValues(mean_roof_height, building_width_B, building_length_L, roof_slope_deg);
        directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => ({
            surface, cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi), p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6, p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        return directional_results;
    }

    // --- PUBLIC API ---
    function run(inputs, validation) {
        let effective_standard = inputs.asce_standard;
        let v_input = inputs.basic_wind_speed;
        let v_unreduced = inputs.basic_wind_speed;
        let jurisdiction_note = "", temporary_structure_note = "";

        if (inputs.jurisdiction === "NYCBC 2022") {
            effective_standard = "ASCE 7-16";
            const risk_v_map = { "I": 110, "II": 117, "III": 127, "IV": 132 };
            v_input = risk_v_map[inputs.risk_category] || 117;
            v_unreduced = v_input;
            jurisdiction_note = `NYCBC 2022 wind speed of ${v_input} mph for Risk Category ${inputs.risk_category} has been applied (Table 1609.3).`;
        }

        if (inputs.temporary_construction === "Yes") {
            v_input *= 0.8;
            const v_unit = inputs.unit_system === 'imperial' ? 'mph' : 'm/s';
            temporary_structure_note = `A 0.8 reduction factor has been applied for temporary construction (PROJECT-SPECIFIC ALLOWANCE, NOT ASCE 7). Calculation wind speed is ${v_input.toFixed(1)} ${v_unit} (reduced from ${v_unreduced} ${v_unit}).`;
        }

        const [abs_gcpi, gcpi_ref] = getInternalPressureCoefficient(inputs.enclosure_classification);
        const [Kd, kd_ref] = getKdFactor(inputs.structure_type_for_kd);
        const [Ke, ke_ref] = calculateKe(inputs.ground_elevation, inputs.unit_system, effective_standard);
        const { Kz, alpha, zg, ref_note: kz_ref } = calculateKz(inputs.mean_roof_height, inputs.exposure_category, inputs.unit_system); // Kz at roof height h
        const { qz, ref_note: qz_ref } = calculateVelocityPressure(Kz, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);
        const [Iw, iw_ref] = getImportanceFactor(inputs.risk_category, effective_standard); // Defensive destructuring
        const kzResult = calculateKz(inputs.mean_roof_height, inputs.exposure_category, inputs.unit_system);
        const Kz_val = kzResult.Kz || 1.0;
        const alpha_val = kzResult.alpha || 0;
        const zg_val = kzResult.zg || 0;
        const kz_ref_val = kzResult.ref_note || "Error: Kz calculation failed";
        
        const intermediate_for_G = { alpha, zg, Kz, Iw };
        const { G, ref: g_ref } = calculateGustEffectFactor({ ...inputs, V_in: v_input }, intermediate_for_G);

        const windResults = {
            inputs: { ...inputs, V_in: v_input, V_unreduced: v_unreduced, GCpi_abs: abs_gcpi, effective_standard: effective_standard, effective_wind_area: inputs.effective_wind_area },
            intermediate: { Kz, Kz_ref: kz_ref, Ke, ke_ref, qz, qz_ref, Kd, Kd_ref: kd_ref, GCpi_ref: gcpi_ref, alpha, zg, Iw, iw_ref },
            directional_results: {}, jurisdiction_note, temporary_structure_note, 
            warnings: validation.warnings, errors: validation.errors
        };

        // Handle Open Buildings separately as they use Net Pressure Coefficients (CN)
        if (inputs.enclosure_classification === 'Open') {
            if (['monoslope', 'pitched_troughed'].includes(inputs.roof_type)) {
                const { cnMap, ref } = getOpenBuildingCnValues(inputs.roof_slope_deg, inputs.wind_obstruction === 'obstructed');
                windResults.directional_results['open_roof'] = Object.entries(cnMap).map(([surface, cn_vals]) => {
                    // p = qh * G * CN (ASCE 7-16 Eq. 27.3-2)
                    const p_pos = qz * inputs.gust_effect_factor_g * cn_vals.cn_pos;
                    const p_neg = qz * inputs.gust_effect_factor_g * cn_vals.cn_neg;
                    return { surface, cp: null, cn_pos: cn_vals.cn_pos, cn_neg: cn_vals.cn_neg, p_pos, p_neg, p_pos_asd: p_pos * 0.6, p_neg_asd: p_neg * 0.6 };
                });
                windResults.open_building_ref = ref;
            } else {
                windResults.warnings.push("For Open buildings, only 'Monoslope' and 'Pitched/Troughed' roof types are currently supported by this calculator.");
            }
            return windResults;
        }

        const intermediate_globals = { Kzt: inputs.topographic_factor_Kzt, Kd, Ke, V_in: v_input, effective_standard, abs_gcpi, G, qz };
        const is_tall_building = inputs.mean_roof_height > (inputs.unit_system === 'imperial' ? 60 : 18.3);

        if (is_tall_building) {
            windResults.mwfrs_method = "Analytical Procedure (All Heights)";
            windResults.directional_results = calculateHighRisePressures(inputs, intermediate_globals);
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        } else { // Low-Rise Building
            windResults.mwfrs_method = "Directional Procedure (Low-Rise)";
            windResults.directional_results = calculateLowRisePressures(inputs, intermediate_globals);
            windResults.heightVaryingResults_L = null;
        }

        // Conditionally nullify the height-varying results if the user has opted out.
        // This check is performed after the main logic to allow the option to apply to both tall and potentially low-rise buildings if ever enabled.
        if (inputs.calculate_height_varying_pressure === 'No') {
            windResults.heightVaryingResults_L = null;
        } else if (is_tall_building && !windResults.heightVaryingResults_L) {
            // If it's a tall building and the user wants the calculation, it should have been done already.
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        } else if (!is_tall_building && inputs.calculate_height_varying_pressure === 'Yes') {
            // For low-rise, only calculate if explicitly requested.
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        }

        // Calculate C&C pressures
        const candc_results = calculateCandCPressuresEnhanced(inputs, qz, abs_gcpi);
        windResults.candc = candc_results;
        if (candc_results.warnings && candc_results.warnings.length > 0) {
            windResults.warnings.push(...candc_results.warnings);
        }

        // Torsional Load Case (ASCE 7-16/22 Fig 27.4-8, Case 2)
        // Applies to enclosed and partially enclosed low-rise buildings
        if (!is_tall_building && ["Enclosed", "Partially Enclosed"].includes(inputs.enclosure_classification)) {
            const results_L = windResults.directional_results['perp_to_L'];
            const results_B = windResults.directional_results['perp_to_B'];
            
            // Only proceed with torsional calculations if both directional results are available.
            if (results_L && results_B) {
                const cp_map_L = Object.fromEntries(results_L.map(r => [r.surface, r.cp]));
                const cp_map_B = Object.fromEntries(results_B.map(r => [r.surface, r.cp]));

                // Wind perpendicular to L (acting on face B)
                const p_ww_L = qz * G * (cp_map_L["Windward Wall"] || 0);
                const p_lw_L = qz * G * (cp_map_L["Leeward Wall"] || 0);
                const F_ww_L = p_ww_L * (inputs.building_width_B * inputs.mean_roof_height);
                const F_lw_L = p_lw_L * (inputs.building_width_B * inputs.mean_roof_height);
                const Mt_L = 0.75 * (Math.abs(F_ww_L) + Math.abs(F_lw_L)) * (0.15 * inputs.building_width_B);

                // Wind perpendicular to B (acting on face L)
                const p_ww_B = qz * G * (cp_map_B["Windward Wall"] || 0);
                const p_lw_B = qz * G * (cp_map_B["Leeward Wall"] || 0);
                const F_ww_B = p_ww_B * (inputs.building_length_L * inputs.mean_roof_height);
                const F_lw_B = p_lw_B * (inputs.building_length_L * inputs.mean_roof_height);
                const Mt_B = 0.75 * (Math.abs(F_ww_B) + Math.abs(F_lw_B)) * (0.15 * inputs.building_length_L);
                
                windResults.torsional_case = {
                    perp_to_L: { Mt: Mt_L, note: "Apply with 75% of Case 1 wall pressures." },
                    perp_to_B: { Mt: Mt_B, note: "Apply with 75% of Case 1 wall pressures." }
                };
            }
        }

        return windResults;
    }

    return { run };
})();

/**
 * Gathers all wind-related inputs from the DOM.
 * @returns {object} An object containing all the input values.
 */
function gatherWindInputs() {
    return gatherInputsFromIds(windInputIds);
}

/**
 * Validates the gathered wind inputs against a set of rules.
 * @param {object} inputs - The input values to validate.
 * @returns {object} An object containing arrays of errors and warnings.
 */
function validateWindInputs(inputs) {
    const { errors, warnings } = validateInputs(inputs, validationRules.wind);

    // Add specific, inter-dependent validation logic here
    if (['gable', 'hip'].includes(inputs.roof_type) && inputs.roof_slope_deg > 45) {
        errors.push("Gable/hip roof slope must be <= 45° for this calculator's implementation of ASCE 7 Fig 27.3-2.");
    }
    const isImperial = inputs.unit_system === 'imperial';
    const vRange = isImperial ? [85, 200] : [38, 90];
    if (inputs.basic_wind_speed < vRange[0] || inputs.basic_wind_speed > vRange[1]) {
        warnings.push(`Wind speed ${inputs.basic_wind_speed} ${isImperial ? 'mph' : 'm/s'} is outside the typical ASCE 7 range (${vRange[0]}-${vRange[1]}).`);
    }

    return { errors, warnings };
}

/**
 * Executes the core wind load calculation logic.
 * @param {object} inputs - The validated input values.
 * @param {object} validation - The validation object, which may contain warnings to be passed through.
 * @returns {object} The complete results object from the calculation.
 */
function performWindCalculation(inputs, validation) { // This function was missing in the original context
    try {
        return windLoadCalculator.run(inputs, validation);
    } catch (error) {
        console.error('An unexpected error occurred during the wind calculation.', error);
        return { errors: ['An unexpected error occurred during the wind calculation. Check console for details.'], warnings: [] };
    }
}
function renderRoofPressureChart(canvasId, pressureData, building_dimension, design_method, units) { // This function was missing in the original context
    const factor = design_method === 'ASD' ? 0.6 : 1.0;
    const labels = pressureData.map(p => p.distance.toFixed(1));
    const data = pressureData.map(p => (p.p_neg * factor).toFixed(2));

    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') {
        console.warn('Chart.js not available or canvas not found');
        if (ctx) ctx.parentElement.innerHTML = `<div class="text-center text-red-500">Chart.js library not loaded.</div>`;
        return;
    }

    try {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Roof Suction (${units.p_unit})`,
                    data: data,
                    borderColor: '#3b82f6', // blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Pressure Distribution (Length: ${building_dimension} ${units.h_unit})`
                    },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: `Distance from Windward Edge (${units.h_unit})` }
                    },
                    y: {
                        title: { display: true, text: `Pressure (${units.p_unit})` }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Chart.js initialization failed:', error);
        ctx.parentElement.innerHTML = `<div class="text-center text-red-500">Chart could not be rendered.</div>`;
    }
}

function generateCandCDiagram(inputs, candc) { // This function was missing in the original context
    if (!candc || !candc.applicable) return '';

    const { mean_roof_height: h, building_length_L: L, building_width_B: B, roof_type, roof_slope_deg, unit_system } = inputs;
    const h_unit = unit_system === 'imperial' ? 'ft' : 'm';
    const is_high_rise = candc.is_high_rise;

    // Calculate 'a' for zone dimensions
    const least_dim = Math.min(L, B);
    let a = Math.min(0.1 * least_dim, 0.4 * h);
    const min_a_val = unit_system === 'imperial' ? 3.0 : 0.9;
    a = Math.max(a, 0.04 * least_dim, min_a_val);

    const a_val_str = a.toFixed(1);
    const a_str = `a = ${a_val_str} ${h_unit}`;

    let roof_diagram = '';
    let wall_diagram = '';

    // --- Wall Diagram (Elevation) ---
    const wall_zone_5_label = is_high_rise ? "Zone 5" : "Zone 5 (Corners)";
    const wall_zone_4_label = is_high_rise ? "Zone 4" : "Zone 4 (Interior)";
    wall_diagram = `
        <div class="diagram my-4">
            <div class="max-w-sm mx-auto">
                <h4 class="text-center font-semibold text-sm mb-2">Wall C&C Zones (Elevation)</h4>
                <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                    <!-- Building Outline -->
                    <rect x="50" y="50" width="300" height="120" class="svg-member" />
                    <!-- Zone 5 -->
                    <rect x="50" y="50" width="${a_val_str}" height="120" fill="#ef4444" opacity="0.5" />
                    <rect x="${350 - a_val_str}" y="50" width="${a_val_str}" height="120" fill="#ef4444" opacity="0.5" />
                    <!-- Zone 4 -->
                    <rect x="${50 + parseFloat(a_val_str)}" y="50" width="${300 - 2 * a_val_str}" height="120" fill="#facc15" opacity="0.5" />
                    <!-- Labels -->
                    <text x="200" y="110" class="svg-label" text-anchor="middle">${wall_zone_4_label}</text>
                    <text x="${50 + a_val_str / 2}" y="80" class="svg-label" text-anchor="middle">${wall_zone_5_label}</text>
                    <text x="${350 - a_val_str / 2}" y="80" class="svg-label" text-anchor="middle">${wall_zone_5_label}</text>
                    <!-- Dimension 'a' -->
                    <line x1="50" y1="180" x2="${50 + a_val_str}" y2="180" class="svg-dim" />
                    <text x="${50 + a_val_str / 2}" y="190" class="svg-dim-text">${a_str}</text>
                </svg>
            </div>
        </div>`;

    // --- Roof Diagram (Plan View) ---
    const roof_zone_3_label = is_high_rise ? "Zone 3'" : "Zone 3 (Corners)";
    const roof_zone_2_label = is_high_rise ? "Zone 2'" : "Zone 2 (Edges)";
    const roof_zone_1_label = is_high_rise ? "Zone 1'" : "Zone 1 (Interior)";

    if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && roof_slope_deg <= 7)) {
        let hip_zones = '';
        if (roof_type === 'hip') {
            hip_zones = `
                <path d="M50 50 L 150 100 L 50 150 Z" fill="#9333ea" opacity="0.5" />
                <path d="M350 50 L 250 100 L 350 150 Z" fill="#9333ea" opacity="0.5" />
                <text x="100" y="105" class="svg-label" text-anchor="middle">End Zones</text>
                <text x="300" y="105" class="svg-label" text-anchor="middle">End Zones</text>
            `;
        }
        roof_diagram = `
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <h4 class="text-center font-semibold text-sm mb-2">Roof C&C Zones (Plan View)</h4>
                    <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <!-- Base Roof -->
                        <rect x="50" y="50" width="300" height="100" class="svg-member" />
                        <!-- Zone 1 -->
                        <rect x="${50 + parseFloat(a_val_str)}" y="${50 + parseFloat(a_val_str)}" width="${300 - 2 * a_val_str}" height="${100 - 2 * a_val_str}" fill="#4ade80" opacity="0.5" />
                        <!-- Zone 2 -->
                        <path d="M50 50 h 300 v 100 h -300 z M ${50 + parseFloat(a_val_str)} ${50 + parseFloat(a_val_str)} v ${100 - 2 * a_val_str} h ${300 - 2 * a_val_str} v -${100 - 2 * a_val_str} z" fill-rule="evenodd" fill="#facc15" opacity="0.5" />
                        <!-- Zone 3 -->
                        <path d="M50 50 h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M${350 - a_val_str} 50 h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M50 ${150 - a_val_str} h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M${350 - a_val_str} ${150 - a_val_str} h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        ${hip_zones}
                        <!-- Labels -->
                        <text x="200" y="105" class="svg-label" text-anchor="middle">${roof_zone_1_label}</text>
                        <text x="200" y="70" class="svg-label" text-anchor="middle">${roof_zone_2_label}</text>
                        <text x="80" y="70" class="svg-label" text-anchor="middle">${roof_zone_3_label}</text>
                    </svg>
                </div>
            </div>`;
    } else if (['gable', 'hip'].includes(roof_type)) { // Steep slope
        const ridge_line = roof_type === 'gable' ? `<line x1="50" y1="100" x2="350" y2="100" stroke-dasharray="4 2" class="svg-dim" />` : `<line x1="150" y1="100" x2="250" y2="100" stroke-dasharray="4 2" class="svg-dim" />`;
        const hip_lines = roof_type === 'hip' ? `<line x1="50" y1="50" x2="150" y2="100" class="svg-dim" /><line x1="50" y1="150" x2="150" y2="100" class="svg-dim" /><line x1="350" y1="50" x2="250" y2="100" class="svg-dim" /><line x1="350" y1="150" x2="250" y2="100" class="svg-dim" />` : '';
        roof_diagram = `
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <h4 class="text-center font-semibold text-sm mb-2">Roof C&C Zones (Plan View, Slope > 7°)</h4>
                    <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <rect x="50" y="50" width="300" height="100" class="svg-member" />
                        ${ridge_line} ${hip_lines}
                        <!-- Zones -->
                        <rect x="${50 + parseFloat(a_val_str)}" y="50" width="${300 - 2 * a_val_str}" height="100" fill="#4ade80" opacity="0.5" />
                        <path d="M50 50 h 300 v 100 h -300 z M ${50 + parseFloat(a_val_str)} 50 v 100 h ${300 - 2 * a_val_str} v -100 z" fill-rule="evenodd" fill="#facc15" opacity="0.5" />
                        <rect x="50" y="50" width="${a_val_str}" height="100" fill="#ef4444" opacity="0.5" />
                        <rect x="${350 - a_val_str}" y="50" width="${a_val_str}" height="100" fill="#ef4444" opacity="0.5" />
                        <!-- Labels -->
                        <text x="200" y="105" class="svg-label" text-anchor="middle">${roof_zone_1_label}</text>
                        <text x="${50 + a_val_str + (300 - 2 * a_val_str) / 2}" y="70" class="svg-label" text-anchor="middle" transform="rotate(-15 200 70)">${roof_zone_2_label}</text>
                        <text x="${50 + a_val_str / 2}" y="105" class="svg-label" text-anchor="middle">${roof_zone_3_label}</text>
                    </svg>
                </div>
            </div>`;
    }

    return `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${wall_diagram}${roof_diagram}</div>`;
}

function generateWindSummary(inputs, directional_results, candc, p_unit) { // This function was missing in the original context
    let gov_mwfrs_pos = { value: -Infinity, surface: 'N/A' };
    let gov_mwfrs_neg = { value: Infinity, surface: 'N/A' };
    let gov_candc_pos = { value: -Infinity, zone: 'N/A' };
    let gov_candc_neg = { value: Infinity, zone: 'N/A' };

    // --- MWFRS Summary Logic ---
    if (directional_results) {
        Object.values(directional_results).forEach(resultSet => {
            if (!Array.isArray(resultSet)) return;
            resultSet.forEach(r => {
                // Get the final ASD or LRFD values
                const val1 = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
                const val2 = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;

                // Check both calculated pressures for each surface against the overall max/min
                if (val1 > gov_mwfrs_pos.value) gov_mwfrs_pos = { value: val1, surface: r.surface };
                if (val2 > gov_mwfrs_pos.value) gov_mwfrs_pos = { value: val2, surface: r.surface };
                
                if (val1 < gov_mwfrs_neg.value) gov_mwfrs_neg = { value: val1, surface: r.surface };
                if (val2 < gov_mwfrs_neg.value) gov_mwfrs_neg = { value: val2, surface: r.surface };
            });
        });
    }

    // --- C&C Summary Logic ---
    if (candc && candc.applicable && candc.pressures) {
        for (const zone in candc.pressures) {
            const data = candc.pressures[zone];
            // Use the final calculated pressures directly
            const p_pos = inputs.design_method === 'ASD' ? data.p_pos * 0.6 : data.p_pos; // ASD factor applied once
            const p_neg = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg; // ASD factor applied once
            
            if (p_pos > gov_candc_pos.value) gov_candc_pos = { value: p_pos, zone };
            if (p_neg < gov_candc_neg.value) gov_candc_neg = { value: p_neg, zone };
        }
    }

    return `<div id="wind-summary-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center">
                    <h3 class="report-header flex-grow">Governing Load Summary (${inputs.design_method})</h3>
                    <button data-copy-target-id="wind-summary-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs print-hidden">Copy Summary</button>
                </div>
                <div class="copy-content grid grid-cols-1 md:grid-cols-2 gap-6 text-center mt-4">
                    <div><h4 class="font-semibold text-lg mb-2">MWFRS</h4><p>Max Pressure: <strong class="text-xl">${(gov_mwfrs_pos.value).toFixed(2)} ${p_unit}</strong> <span class="text-xs">(${gov_mwfrs_pos.surface})</span></p><p>Max Suction: <strong class="text-xl">${(gov_mwfrs_neg.value).toFixed(2)} ${p_unit}</strong> <span class="text-xs">(${gov_mwfrs_neg.surface})</span></p></div>
                    <div><h4 class="font-semibold text-lg mb-2">C&C</h4><p>Max Pressure: <strong class="text-xl">${(gov_candc_pos.value).toFixed(2)} ${p_unit}</strong> <span class="text-xs">(${gov_candc_pos.zone})</span></p><p>Max Suction: <strong class="text-xl">${(gov_candc_neg.value).toFixed(2)} ${p_unit}</strong> <span class="text-xs">(${gov_candc_neg.zone})</span></p></div>
                </div>
             </div>`;
}

/**
 * Generates the HTML for the "Design Parameters" section of the report.
 */
function renderDesignParameters(inputs, intermediate, units) {
    const { v_unit, h_unit, p_unit } = units;
    
    let html = `<div id="design-parameters-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center">
                    <h3 class="report-header">1. Design Parameters</h3>
                    <button data-copy-target-id="design-parameters-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <div class="copy-content">
                    <ul class="list-disc list-inside space-y-1">
                        <li><strong>Risk Category:</strong> ${sanitizeHTML(inputs.risk_category)} <span class="ref">[ASCE 7, Table 1.5-1]</span></li>
                        <li><strong>Basic Design Wind Speed (V):</strong> ${inputs.V_unreduced.toFixed(1)} ${v_unit.toUpperCase()} <span class="ref">[User Input / Jurisdiction]</span></li>
                        <li><strong>Building Dimensions (L x B):</strong> ${inputs.building_length_L} x ${inputs.building_width_B} ${h_unit.toUpperCase()}</li>
                        <li><strong>Exposure Category:</strong> ${sanitizeHTML(inputs.exposure_category)} <span class="ref">[ASCE 7, Sec. 26.7]</span></li>
                        <li><strong>Building Height (h):</strong> ${inputs.mean_roof_height} ${h_unit.toUpperCase()}</li>
                        <li><strong>L/B Ratio (Wind ⊥ to L):</strong> ${(inputs.building_length_L / inputs.building_width_B).toFixed(2)} <span class="ref">[Used for Leeward Cp]</span></li>
                        <li><strong>L/B Ratio (Wind ⊥ to B):</strong> ${(inputs.building_width_B / inputs.building_length_L).toFixed(2)} <span class="ref">[Used for Leeward Cp]</span></li>
                        <li><strong>Wind Directionality Factor (K<sub>d</sub>):</strong> ${intermediate.Kd.toFixed(2)} <span class="ref">[${intermediate.Kd_ref}]</span></li>
                        <li><strong>Topographic Factor (K<sub>zt</sub>):</strong> ${inputs.topographic_factor_Kzt.toFixed(2)} <span class="ref">[ASCE 7, Sec. 26.8]</span></li>
                        <li><strong>Ground Elevation Factor (K<sub>e</sub>):</strong> ${intermediate.Ke.toFixed(3)} <span class="ref">[${intermediate.ke_ref}]</span></li>
                        <li><strong>Gust-Effect Factor (G):</strong> ${inputs.gust_effect_factor_g.toFixed(2)} <span class="ref">[ASCE 7, Sec. 26.11]</span></li>
                        <li><strong>Velocity Pressure Exposure Coefficient (K<sub>z</sub>):</strong> ${intermediate.Kz.toFixed(2)} <span class="ref">[${intermediate.Kz_ref}]</span></li>
                        <li><strong>Internal Pressure Coefficient (GC<sub>pi</sub>):</strong> &plusmn;${inputs.GCpi_abs.toFixed(2)} <span class="ref">[${intermediate.GCpi_ref}]</span></li>
                        ${inputs.temporary_construction === 'Yes' ? `<li><strong>Reduction Factor for Temporary Construction:</strong> 0.8 <span class="ref">[NYC BC, SEC. 1619.3.3]</span></li>` : ''}
                    </ul>
                </div>
             </div>`;
    return html;
}

/**
 * Generates the HTML for the "Detailed Calculation Breakdown" section.
 */
function renderCalculationBreakdown(inputs, intermediate, units) {
    const { h_unit, p_unit } = units;

    let html = `<div id="calc-breakdown-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center">
                    <h3 class="report-header">2. Detailed Calculation Breakdown</h3>
                    <button data-copy-target-id="calc-breakdown-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <div class="copy-content">
                    <div class="calc-breakdown">
                        <h4 class="font-semibold uppercase text-base">a) Intermediate Calculations</h4>
                        <ul class="list-disc list-inside space-y-2 mt-2">
                            <li><strong>Factors:</strong> I<sub>w</sub> = ${intermediate.Iw.toFixed(2)}, K<sub>d</sub> = ${intermediate.Kd.toFixed(2)}, K<sub>zt</sub> = ${inputs.topographic_factor_Kzt.toFixed(2)}, G = ${inputs.gust_effect_factor_g.toFixed(2)}, GC<sub>pi</sub> = &plusmn;${inputs.GCpi_abs.toFixed(2)}</li>
                            <li><strong>Exposure Constants (&alpha;, z<sub>g</sub>):</strong> ${intermediate.alpha}, ${intermediate.zg.toFixed(0)} ${h_unit}</li>
                            <li><strong>Elevation Factor (K<sub>e</sub>):</strong>
                                <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">Interpolated from ${intermediate.ke_ref} &rarr; K<sub>e</sub> = ${intermediate.Ke.toFixed(3)}</div>
                            </li>
                            <li><strong>Exposure Coefficient (K<sub>z</sub>):</strong>
                                <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">K<sub>z</sub> = 2.01 &times; (${inputs.mean_roof_height.toFixed(2)} / ${intermediate.zg.toFixed(0)})<sup>(2 / ${intermediate.alpha})</sup> = ${intermediate.Kz.toFixed(3)}</div>
                            </li>
                            <li><strong>Velocity Pressure (q<sub>h</sub>):</strong>
                                <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">q<sub>h</sub> = 0.00256 &times; ${intermediate.Kz.toFixed(3)} &times; ${inputs.topographic_factor_Kzt.toFixed(2)} &times; ${intermediate.Kd.toFixed(2)} &times; ${intermediate.Ke.toFixed(3)} &times; ${inputs.V_in.toFixed(1)}² ${inputs.effective_standard === 'ASCE 7-22' ? `&times; ${intermediate.Iw.toFixed(2)}` : ''} = ${intermediate.qz.toFixed(2)} ${p_unit}</div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>`;
    return html;
}

/**
 * Renders the results table for Open Buildings.
 */
function renderOpenBuildingResults(directional_results, open_building_ref, inputs, units) {
    const { p_unit } = units;
    if (inputs.enclosure_classification !== 'Open') return '';

    let html = `<div class="text-center pt-4"><h3 class="text-xl font-bold">NET DESIGN PRESSURES (p = q_h*G*C_N)</h3></div>`;
        let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>Open Building Free Roof Pressures (${open_building_ref})</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr class="text-center">
                <th>Roof Zone</th><th>C_N,pos</th><th>C_N,neg</th><th>Positive Pressure (${inputs.design_method}) [${p_unit}]</th><th>Negative Pressure (${inputs.design_method}) [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300 text-center">`;
        
        directional_results.open_roof.forEach(r => {
            const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
            tableHtml += `
                <tr>
                    <td>${r.surface}</td>
                    <td>${r.cn_pos.toFixed(2)}</td>
                    <td>${r.cn_neg.toFixed(2)}</td>
                    <td>${p_pos.toFixed(2)}</td>
                    <td>${p_neg.toFixed(2)}</td>
                </tr>`;
        });
        tableHtml += `</tbody></table>`;
    html += tableHtml;
    return html;
}

/**
 * Renders a single directional results table for MWFRS.
 */
function renderDirectionalResultsTable(data, title, id_prefix, inputs, intermediate, units) {
    const { p_unit } = units;

        let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>${title}</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr class="text-center">
                <th>Surface/Zone</th><th>C_p</th><th>Pressure (+GCpi) (${inputs.design_method}) [${p_unit}]</th><th>Pressure (-GCpi) (${inputs.design_method}) [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300 text-center">`;
        
        data.forEach((r, i) => {
            const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg; // These are now the final pressures
            const asd_factor_str = ''; // The 0.6 factor is not part of the nominal load calculation
            
            // Correctly distinguish between qz and qh in the formula string
            const q_ext_str = r.surface.toLowerCase().includes('windward wall') ? 'q_z' : 'q_h';
            const q_int_str = 'q_h';
            let formula_str = `p = ${q_ext_str}*G*C_p - ${q_int_str}*(GC_pi)`;
            if (inputs.design_method === 'ASD') {
                formula_str = `p = 0.6 * (${formula_str})`;
            }
            const detailId = `${id_prefix}-detail-${i}`;
            tableHtml += `
                <tr>
                    <td>${sanitizeHTML(r.surface)} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${r.cp !== null ? r.cp.toFixed(2) : 'N/A'}</td>
                    <td>${p_pos.toFixed(2)}</td>
                    <td>${p_neg.toFixed(2)}</td>
                </tr>
                <tr id="${detailId}" class="details-row"><td colspan="4" class="p-0"><div class="calc-breakdown">
                        <ul><li class="font-semibold"><b>Formula:</b> ${formula_str}</li>
                            <li><b>Calculation (+GCpi):</b> ${p_pos.toFixed(2)} = ${inputs.design_method === 'ASD' ? '0.6 * ' : ''}(${intermediate.qz.toFixed(2)}*${inputs.gust_effect_factor_g}*${r.cp.toFixed(2)} - ${intermediate.qz.toFixed(2)}*${inputs.GCpi_abs})</li>
                            <li><b>Calculation (-GCpi):</b> ${p_neg.toFixed(2)} = ${inputs.design_method === 'ASD' ? '0.6 * ' : ''}(${intermediate.qz.toFixed(2)}*${inputs.gust_effect_factor_g}*${r.cp.toFixed(2)} - ${intermediate.qz.toFixed(2)}*${-inputs.GCpi_abs})</li>
                        </ul>
                    </div></td></tr>`;
        });
        tableHtml += `</tbody></table>`;
        return tableHtml;
    };

/**
 * Renders the entire MWFRS section, including diagrams and tables for both directions.
 */
function renderMwfrsSection(directional_results, inputs, intermediate, mwfrs_method, units) {
    const { h_unit } = units;
    let html = `<div id="mwfrs-section" class="mt-6 report-section-copyable">
        <div class="flex justify-between items-center">
            <h3 class="report-header flex-grow">3. MWFRS DESIGN PRESSURES (${mwfrs_method})</h3>
            <button data-copy-target-id="mwfrs-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <h4 class="text-lg font-semibold mt-6 mb-2 text-center">Wind Perpendicular to ${inputs.building_length_L} ${h_unit} Side (on ${inputs.building_width_B} ${h_unit} face)</h4>
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <svg viewBox="0 0 400 250" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <defs><marker id="arrow-result" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="fill-current text-gray-600 dark:text-gray-400"/></marker></defs>
                        <rect x="100" y="50" width="200" height="150" class="svg-member"/>
                        <text x="200" y="40" class="svg-dim-text">Side Wall (${inputs.building_length_L} ${h_unit})</text>
                        <text x="200" y="210" class="svg-dim-text">Side Wall (${inputs.building_length_L} ${h_unit})</text>
                        <text x="85" y="125" class="svg-dim-text" transform="rotate(-90, 85, 125)">Windward Wall (${inputs.building_width_B} ${h_unit})</text>
                        <text x="315" y="125" class="svg-dim-text" transform="rotate(90, 315, 125)">Leeward Wall (${inputs.building_width_B} ${h_unit})</text>
                        <path d="M20 125 L 90 125" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-result)"/>
                        <text x="40" y="115" class="svg-label">WIND</text>
                    </svg>
                </div>
            </div>
            ${renderDirectionalResultsTable(directional_results.perp_to_L, `--- ${inputs.design_method} Pressures ---`, 'L', inputs, intermediate, units)}
        </div>
        <div>
            <h4 class="text-lg font-semibold mt-8 mb-2 text-center">Wind Perpendicular to ${inputs.building_width_B} ${h_unit} Side (on ${inputs.building_length_L} ${h_unit} face)</h4>
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <svg viewBox="0 0 400 250" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <rect x="50" y="75" width="300" height="100" class="svg-member"/>
                        <text x="15" y="125" class="svg-dim-text" transform="rotate(-90, 15, 125)">Side Wall (${inputs.building_width_B} ${h_unit})</text>
                        <text x="385" y="125" class="svg-dim-text" transform="rotate(90, 385, 125)">Side Wall (${inputs.building_width_B} ${h_unit})</text>
                        <text x="200" y="65" class="svg-dim-text">Leeward Wall (${inputs.building_length_L} ${h_unit})</text>
                        <text x="200" y="185" class="svg-dim-text">Windward Wall (${inputs.building_length_L} ${h_unit})</text>
                        <path d="M200 230 L 200 185" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-result)"/>
                        <text x="200" y="215" class="svg-label">WIND</text>
                    </svg>
                </div>
            </div>
            ${renderDirectionalResultsTable(directional_results.perp_to_B, `--- ${inputs.design_method} Pressures ---`, 'B', inputs, intermediate, units)}
        </div>
        </div>`;
    return html;
}

/**
 * Renders the table for height-varying windward wall pressures.
 */
function renderHeightVaryingTable(heightVaryingResults, leeward_pressure, inputs, units) {
    const { h_unit, p_unit } = units;
    if (!heightVaryingResults) return '';
        const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;

    let html = `<div id="height-varying-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="report-header flex-grow">4. Height-Varying Windward Wall Pressures</h3>
                        <button data-copy-target-id="height-varying-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Leeward wall pressure is constant and based on q<sub>h</sub>.</p>
                    <table class="w-full mt-4 border-collapse">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th>Height (${h_unit})</th>
                                <th>Kz</th>
                                <th>qz (${p_unit})</th>
                                <th>Windward Wall Pressure (${p_unit})</th>
                            </tr> 
                        </thead>
                        <tbody class="dark:text-gray-300 text-center">`;
    heightVaryingResults.forEach(result => {
            html += `
                <tr>
                    <td>${result.height.toFixed(1)}</td>
                    <td>${result.Kz.toFixed(3)}</td>
                    <td>${result.qz.toFixed(2)}</td>
                    <td>${(result.p_pos * factor).toFixed(2)}</td>
                </tr>`;
        });
    html += `   <tr>
                        <td colspan="3" class="text-right font-semibold pr-4">Constant Leeward Pressure (Perp. to L):</td>
                        <td>${(leeward_pressure * factor).toFixed(2)}</td>
                    </tr>
                    </tbody></table></div>
                </div>`;
    return html;
}

function renderRoofPressureDistribution(roofPressureDist_L, roofPressureDist_B, inputs, units) {
    if (!roofPressureDist_L || !roofPressureDist_B) return '';
    const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
    let html = `<div id="roof-dist-section" class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8 report-section-copyable">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-xl font-semibold text-center flex-grow">Roof Pressure Distribution (Low-Rise)</h3>
                        <button data-copy-target-id="roof-dist-section" class="copy-section-btn bg-gray-200 text-gray-700 font-semibold py-1 px-3 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Pressure variation along the roof surface, from windward to leeward edge.</p>
                    <div class="diagram my-4">
                        <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                            <defs><marker id="arrow-diag" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="fill-current text-gray-600 dark:text-gray-400"/></marker></defs>
                            <!-- Roof plan view -->
                            <rect x="50" y="50" width="300" height="100" class="svg-member"/>
                            <!-- Pressure zones with different colors -->
                            <rect x="50" y="50" width="60" height="100" fill="#ef4444" opacity="0.6"/> <!-- High suction -->
                            <rect x="110" y="50" width="90" height="100" fill="#facc15" opacity="0.6"/> <!-- Medium -->
                            <rect x="200" y="50" width="150" height="100" fill="#4ade80" opacity="0.6"/> <!-- Lower suction -->
                            
                            <text x="80" y="165" class="svg-dim-text" text-anchor="middle">Zone 1</text>
                            <text x="155" y="165" class="svg-dim-text" text-anchor="middle">Zone 2</text>
                            <text x="275" y="165" class="svg-dim-text" text-anchor="middle">Zone 3</text>
                            
                            <text x="200" y="35" class="svg-label">Illustrative Roof Pressure Zones</text>
                            <path d="M20 100 L 45 100" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-diag)"/>
                            <text x="25" y="95" class="svg-dim-text">WIND</text>
                        </svg>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <div style="height: 300px;"><canvas id="roofChartL"></canvas></div>
                            <table class="w-full mt-4 border-collapse text-sm">
                                <thead class="bg-gray-100 dark:bg-gray-700"><tr><th>Distance</th><th>Ratio</th><th>Cp</th><th>Pressure</th></tr></thead>
                                <tbody class="dark:text-gray-300 text-center">`;
        roofPressureDist_L.forEach(r => {
            html += `<tr>
                        <td>${r.distance.toFixed(1)}</td>
                        <td>${r.distance_ratio.toFixed(2)}</td>
                        <td>${r.cp.toFixed(2)}</td>
                        <td>${(r.p_neg * factor).toFixed(2)}</td>
                     </tr>`;
        });
        html += `           </tbody>
                            </table>
                        </div>
                        <div>
                            <div style="height: 300px;"><canvas id="roofChartB"></canvas></div>
                            <table class="w-full mt-4 border-collapse text-sm">
                                <thead class="bg-gray-100 dark:bg-gray-700"><tr><th>Distance</th><th>Ratio</th><th>Cp</th><th>Pressure</th></tr></thead>
                                <tbody class="dark:text-gray-300 text-center">`;
            roofPressureDist_B.forEach(r => {
                html += `<tr>
                            <td>${r.distance.toFixed(1)}</td>
                            <td>${r.distance_ratio.toFixed(2)}</td>
                            <td>${r.cp.toFixed(2)}</td>
                            <td>${(r.p_neg * factor).toFixed(2)}</td>
                         </tr>`;
            });
        html += `           </tbody></table>
                    </div></div>
                </div>`;
    html += `</div>`;

    return html;
}

/**
 * Renders the Torsional Load Case section.
 */
function renderTorsionalCase(torsional_case, inputs, units) {
    if (!torsional_case) return '';
    const { is_imp } = units;
        const m_unit = is_imp ? 'lb-ft' : 'kN-m';
        let Mt_L = is_imp ? torsional_case.perp_to_L.Mt : torsional_case.perp_to_L.Mt / 1000;
        let Mt_B = is_imp ? torsional_case.perp_to_B.Mt : torsional_case.perp_to_B.Mt / 1000;
        if (inputs.design_method === 'ASD') {
            Mt_L *= 0.6;
            Mt_B *= 0.6;
        }

    return `<div id="torsional-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="report-header flex-grow">5. Torsional Load Case (ASCE 7 Fig. 27.4-8, Case 2)</h3>
                        <button data-copy-target-id="torsional-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">This moment must be considered concurrently with 75% of the Case 1 design wind pressures on the walls.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                        <div>
                            <p class="font-semibold">Wind Perpendicular to L</p>
                            <p class="text-2xl font-bold">${Mt_L.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                        </div>
                        <div>
                            <p class="font-semibold">Wind Perpendicular to B</p>
                            <p class="text-2xl font-bold">${Mt_B.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                        </div>
                    </div>
                    </div>
                </div>`;
}

/**
 * Renders the Components & Cladding (C&C) section.
 */
function renderCandCSection(candc, inputs, units) {
    if (!candc || !candc.applicable) return '';
    const { is_imp, p_unit } = units;
    let html = `<div id="candc-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="report-header flex-grow">6. Components & Cladding (C&C) Pressures</h3>
                        <button data-copy-target-id="candc-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">
                        Calculated for Effective Wind Area A = ${sanitizeHTML(inputs.effective_wind_area)} ${is_imp ? 'ft²' : 'm²'}. Reference: ${sanitizeHTML(candc.ref)}.
                    </p>
                    
                    ${generateCandCDiagram(inputs, candc)}

                    <table class="w-full border-collapse">
                    `;
        if (candc.is_high_rise) {
            html += `<thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th>Zone</th>
                            <th>GCp (+)</th>
                            <th>GCp (-)</th>
                            <th>LRFD Pressure (+ / -) [${p_unit}]</th>
                            <th>ASD Pressure (+ / -) [${p_unit}]</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300 text-center">`;
            for (const zone in candc.pressures) {
                const data = candc.pressures[zone];
                const p_pos_lrfd = data.p_pos;
                const p_neg_lrfd = data.p_neg;
                const p_pos_asd = p_pos_lrfd * 0.6;
                const p_neg_asd = p_neg_lrfd * 0.6;
                html += `<tr>
                            <td>${sanitizeHTML(zone)}</td>
                            <td>${data.gcp_pos.toFixed(2)}</td>
                            <td>${data.gcp_neg.toFixed(2)}</td>
                            <td>${p_pos_lrfd.toFixed(2)} / ${p_neg_lrfd.toFixed(2)}</td>
                            <td>${p_pos_asd.toFixed(2)} / ${p_neg_asd.toFixed(2)}</td>
                         </tr>`;
            }
        } else {
            html += `<thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th>Zone</th>
                            <th>GCp</th>
                            <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300 text-center">`;
            for (const zone in candc.pressures) {
                const data = candc.pressures[zone];
                const pressure = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
                html += `<tr><td>${sanitizeHTML(zone)}</td><td>${data.gcp.toFixed(2)}</td><td>${pressure.toFixed(2)}</td></tr>`;
            }
        }
        html += `</tbody></table></div></div>`;
    return html;
}

/**
 * Generates the HTML for the "Design Parameters" section of the report.
 */
function renderDesignParameters(inputs, intermediate, units) {
    const { v_unit, h_unit } = units;
    
    let html = `<div id="design-parameters-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center">
                    <h3 class="text-xl font-bold uppercase">1. Design Parameters</h3>
                    <button data-copy-target-id="design-parameters-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs">Copy Section</button>
                </div>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <div class="copy-content">
                    <ul class="list-disc list-inside space-y-1">
                    <li><strong>Risk Category:</strong> ${sanitizeHTML(inputs.risk_category)} <span class="ref">[ASCE 7, Table 1.5-1]</span></li>
                    <li><strong>Basic Design Wind Speed (V):</strong> ${inputs.V_unreduced.toFixed(1)} ${v_unit.toUpperCase()} <span class="ref">[User Input / Jurisdiction]</span></li>
                    <li><strong>Building Dimensions (L x B):</strong> ${inputs.building_length_L} x ${inputs.building_width_B} ${h_unit.toUpperCase()}</li>
                    <li><strong>Exposure Category:</strong> ${sanitizeHTML(inputs.exposure_category)} <span class="ref">[ASCE 7, Sec. 26.7]</span></li>
                    <li><strong>Building Height (h):</strong> ${inputs.mean_roof_height} ${h_unit.toUpperCase()}</li>
                    <li><strong>L/B Ratio (Wind ⊥ to L):</strong> ${(inputs.building_length_L / inputs.building_width_B).toFixed(2)} <span class="ref">[Used for Leeward Cp]</span></li>
                    <li><strong>L/B Ratio (Wind ⊥ to B):</strong> ${(inputs.building_width_B / inputs.building_length_L).toFixed(2)} <span class="ref">[Used for Leeward Cp]</span></li>
                    <li><strong>Wind Directionality Factor (K<sub>d</sub>):</strong> ${intermediate.Kd.toFixed(2)} <span class="ref">[${intermediate.Kd_ref}]</span></li>
                    <li><strong>Topographic Factor (K<sub>zt</sub>):</strong> ${inputs.topographic_factor_Kzt.toFixed(2)} <span class="ref">[ASCE 7, Sec. 26.8]</span></li>
                    <li><strong>Ground Elevation Factor (K<sub>e</sub>):</strong> ${intermediate.Ke.toFixed(2)} <span class="ref">[${intermediate.ke_ref}]</span></li>
                    <li><strong>Gust-Effect Factor (G):</strong> ${inputs.gust_effect_factor_g.toFixed(2)} <span class="ref">[ASCE 7, Sec. 26.11]</span></li>
                    <li><strong>Velocity Pressure Exposure Coefficient (K<sub>z</sub>):</strong> ${intermediate.Kz.toFixed(2)} <span class="ref">[${intermediate.Kz_ref}]</span></li>
                    <li><strong>Internal Pressure Coefficient (GC<sub>pi</sub>):</strong> &plusmn;${inputs.GCpi_abs.toFixed(2)} <span class="ref">[${intermediate.GCpi_ref}]</span></li>
                    ${inputs.temporary_construction === 'Yes' ? `<li><strong>Reduction Factor for Temporary Construction:</strong> 0.8 <span class="ref">[NYC BC, SEC. 1619.3.3]</span></li>` : ''}
                </ul>
                </div>
            </div>`;
    return html;
}

/**
 * Generates the HTML for the "Detailed Calculation Breakdown" section.
 */
function renderCalculationBreakdown(inputs, intermediate, units) {
    const { h_unit, p_unit } = units;

    let html = `<div id="calc-breakdown-section" class="mt-6">
                <div class="flex justify-between items-center">
                    <h3 class="text-xl font-bold uppercase">2. Detailed Calculation Breakdown</h3>
                    <button data-copy-target-id="calc-breakdown-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs">Copy Section</button>
                </div>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <div class="calc-breakdown copy-content">
                    <h4 class="font-semibold uppercase text-base">a) Intermediate Calculations</h4>
                    <ul class="list-disc list-inside space-y-2 mt-2">
                        <li><strong>Factors:</strong> I<sub>w</sub> = ${intermediate.Iw.toFixed(2)}, K<sub>d</sub> = ${intermediate.Kd.toFixed(2)}, K<sub>zt</sub> = ${inputs.topographic_factor_Kzt.toFixed(2)}, G = ${inputs.gust_effect_factor_g.toFixed(2)}, GC<sub>pi</sub> = &plusmn;${inputs.GCpi_abs.toFixed(2)}</li>
                        <li><strong>Exposure Constants (&alpha;, z<sub>g</sub>):</strong> ${intermediate.alpha}, ${intermediate.zg.toFixed(0)} ${h_unit}</li>
                        <li><strong>Elevation Factor (K<sub>e</sub>):</strong>
                            <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">Interpolated from ${intermediate.ke_ref} &rarr; K<sub>e</sub> = ${intermediate.Ke.toFixed(3)}</div>
                        </li>
                        <li><strong>Exposure Coefficient (K<sub>z</sub>):</strong>
                            <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">K<sub>z</sub> = 2.01 &times; (${inputs.mean_roof_height.toFixed(2)} / ${intermediate.zg.toFixed(0)})<sup>(2 / ${intermediate.alpha})</sup> = ${intermediate.Kz.toFixed(3)}</div>
                        </li>
                        <li><strong>Velocity Pressure (q<sub>h</sub>):</strong>
                            <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">q<sub>h</sub> = 0.00256 &times; ${intermediate.Kz.toFixed(3)} &times; ${inputs.topographic_factor_Kzt.toFixed(2)} &times; ${intermediate.Kd.toFixed(2)} &times; ${intermediate.Ke.toFixed(3)} &times; ${inputs.V_in.toFixed(1)}² ${inputs.effective_standard === 'ASCE 7-22' ? `&times; ${intermediate.Iw.toFixed(2)}` : ''} = ${intermediate.qz.toFixed(2)} ${p_unit}</div>
                        </li>
                    </ul>
                </div>
            </div>`;
    return html;
}

/**
 * Renders the results table for Open Buildings.
 */
function renderOpenBuildingResults(directional_results, open_building_ref, inputs, units) {
    const { p_unit } = units;
    if (inputs.enclosure_classification !== 'Open') return '';

    let html = `<div class="text-center pt-4"><h3 class="text-xl font-bold">NET DESIGN PRESSURES (p = q_h*G*C_N)</h3></div>`;
        let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>Open Building Free Roof Pressures (${open_building_ref})</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr class="text-center">
                <th>Roof Zone</th><th>C_N,pos</th><th>C_N,neg</th><th>Positive Pressure (${inputs.design_method}) [${p_unit}]</th><th>Negative Pressure (${inputs.design_method}) [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300 text-center">`;
        
        directional_results.open_roof.forEach(r => {
            const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
            tableHtml += `
                <tr>
                    <td>${r.surface}</td>
                    <td>${r.cn_pos.toFixed(2)}</td>
                    <td>${r.cn_neg.toFixed(2)}</td>
                    <td>${p_pos.toFixed(2)}</td>
                    <td>${p_neg.toFixed(2)}</td>
                </tr>`;
        });
        tableHtml += `</tbody></table>`;
    html += tableHtml;
    return html;
}

/**
 * Renders a single directional results table for MWFRS.
 */
function renderDirectionalResultsTable(data, title, id_prefix, inputs, intermediate, units) {
    const { p_unit } = units;

        let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>${title}</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr class="text-center">
                <th>Surface/Zone</th><th>C_p</th><th>Pressure (+GCpi) (${inputs.design_method}) [${p_unit}]</th><th>Pressure (-GCpi) (${inputs.design_method}) [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300 text-center">`;
        
        data.forEach((r, i) => {
            const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg; // These are now the final pressures
            const asd_factor_str = ''; // The 0.6 factor is not part of the nominal load calculation
            
            // Correctly distinguish between qz and qh in the formula string
            const q_ext_str = r.surface.toLowerCase().includes('windward wall') ? 'q_z' : 'q_h';
            const q_int_str = 'q_h';
            let formula_str = `p = ${q_ext_str}*G*C_p - ${q_int_str}*(GC_pi)`;
            if (inputs.design_method === 'ASD') {
                formula_str = `p = 0.6 * (${formula_str})`;
            }
            const detailId = `${id_prefix}-detail-${i}`;
            tableHtml += `
                <tr>
                    <td>${sanitizeHTML(r.surface)} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${r.cp !== null ? r.cp.toFixed(2) : 'N/A'}</td>
                    <td>${p_pos.toFixed(2)}</td>
                    <td>${p_neg.toFixed(2)}</td>
                </tr>
                <tr id="${detailId}" class="details-row"><td colspan="4" class="p-0"><div class="calc-breakdown">
                        <ul><li class="font-semibold"><b>Formula:</b> ${formula_str}</li>
                            <li><b>Calculation (+GCpi):</b> ${p_pos.toFixed(2)} = ${inputs.design_method === 'ASD' ? '0.6 * ' : ''}(${intermediate.qz.toFixed(2)}*${inputs.gust_effect_factor_g}*${r.cp.toFixed(2)} - ${intermediate.qz.toFixed(2)}*${inputs.GCpi_abs})</li>
                            <li><b>Calculation (-GCpi):</b> ${p_neg.toFixed(2)} = ${inputs.design_method === 'ASD' ? '0.6 * ' : ''}(${intermediate.qz.toFixed(2)}*${inputs.gust_effect_factor_g}*${r.cp.toFixed(2)} - ${intermediate.qz.toFixed(2)}*${-inputs.GCpi_abs})</li>
                        </ul>
                    </div></td></tr>`;
        });
        tableHtml += `</tbody></table>`;
        return tableHtml;
    };

/**
 * Renders the entire MWFRS section, including diagrams and tables for both directions.
 */
function renderMwfrsSection(directional_results, inputs, intermediate, mwfrs_method, units) {
    const { h_unit } = units;
    let html = `<div id="mwfrs-section" class="mt-6">
        <div class="flex justify-between items-center text-center pt-4">
            <h3 class="text-xl font-bold">MWFRS DESIGN PRESSURES (${mwfrs_method})</h3>
            <button data-copy-target-id="mwfrs-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs">Copy Section</button>
        </div>
        <div class="copy-content">
            <div>
            <h4 class="text-lg font-semibold mt-6 mb-2 text-center">Wind Perpendicular to ${inputs.building_length_L} ${h_unit} Side (on ${inputs.building_width_B} ${h_unit} face)</h4>
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <svg viewBox="0 0 400 250" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <defs><marker id="arrow-result" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="fill-current text-gray-600 dark:text-gray-400"/></marker></defs>
                        <rect x="100" y="50" width="200" height="150" class="svg-member"/>
                        <text x="200" y="40" class="svg-dim-text">Side Wall (${inputs.building_length_L} ${h_unit})</text>
                        <text x="200" y="210" class="svg-dim-text">Side Wall (${inputs.building_length_L} ${h_unit})</text>
                        <text x="85" y="125" class="svg-dim-text" transform="rotate(-90, 85, 125)">Windward Wall (${inputs.building_width_B} ${h_unit})</text>
                        <text x="315" y="125" class="svg-dim-text" transform="rotate(90, 315, 125)">Leeward Wall (${inputs.building_width_B} ${h_unit})</text>
                        <path d="M20 125 L 90 125" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-result)"/>
                        <text x="40" y="115" class="svg-label">WIND</text>
                    </svg>
                </div>
            </div>
            ${renderDirectionalResultsTable(directional_results.perp_to_L, `--- ${inputs.design_method} Pressures ---`, 'L', inputs, intermediate, units)}
        </div>
        <div>
            <h4 class="text-lg font-semibold mt-8 mb-2 text-center">Wind Perpendicular to ${inputs.building_width_B} ${h_unit} Side (on ${inputs.building_length_L} ${h_unit} face)</h4>
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <svg viewBox="0 0 400 250" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <rect x="50" y="75" width="300" height="100" class="svg-member"/>
                        <text x="15" y="125" class="svg-dim-text" transform="rotate(-90, 15, 125)">Side Wall (${inputs.building_width_B} ${h_unit})</text>
                        <text x="385" y="125" class="svg-dim-text" transform="rotate(90, 385, 125)">Side Wall (${inputs.building_width_B} ${h_unit})</text>
                        <text x="200" y="65" class="svg-dim-text">Leeward Wall (${inputs.building_length_L} ${h_unit})</text>
                        <text x="200" y="185" class="svg-dim-text">Windward Wall (${inputs.building_length_L} ${h_unit})</text>
                        <path d="M200 230 L 200 185" stroke="currentColor" stroke-width="2" marker-end="url(#arrow-result)"/>
                        <text x="200" y="215" class="svg-label">WIND</text>
                    </svg>
                </div>
            </div>
            ${renderDirectionalResultsTable(directional_results.perp_to_B, `--- ${inputs.design_method} Pressures ---`, 'B', inputs, intermediate, units)}
        </div>
        </div>
        </div>`;
    return html;
}

/**
 * Renders the table for height-varying windward wall pressures.
 */
function renderHeightVaryingTable(heightVaryingResults, leeward_pressure, inputs, units) {
    const { h_unit, p_unit } = units;
    if (!heightVaryingResults) return '';
        const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;

    let html = `<div id="height-varying-section" class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-semibold text-center flex-grow">Height-Varying Windward Wall Pressures</h3>
                        <button data-copy-target-id="height-varying-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs">Copy Section</button>
                    </div>
                    <div class="copy-content">
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Leeward wall pressure is constant and based on q<sub>h</sub>.</p>
                    <table class="w-full border-collapse">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th>Height (${h_unit})</th>
                                <th>Kz</th>
                                <th>qz (${p_unit})</th>
                                <th>Windward Wall Pressure (${p_unit})</th>
                            </tr> 
                        </thead>
                        <tbody class="dark:text-gray-300 text-center">`;
    heightVaryingResults.forEach(result => {
            html += `
                <tr>
                    <td>${result.height.toFixed(1)}</td>
                    <td>${result.Kz.toFixed(3)}</td>
                    <td>${result.qz.toFixed(2)}</td>
                    <td>${(result.p_pos * factor).toFixed(2)}</td>
                </tr>`;
        });
    html += `   <tr>
                        <td colspan="3" class="text-right font-semibold pr-4">Constant Leeward Pressure (Perp. to L):</td>
                        <td>${(leeward_pressure * factor).toFixed(2)}</td>
                    </tr>
                    </tbody></table>
                    </div>
                 </div>`;
    return html;
}

/**
 * Renders the Torsional Load Case section.
 */
function renderTorsionalCase(torsional_case, inputs, units) {
    if (!torsional_case) return '';
    const { is_imp } = units;
        const m_unit = is_imp ? 'lb-ft' : 'kN-m';
        let Mt_L = is_imp ? torsional_case.perp_to_L.Mt : torsional_case.perp_to_L.Mt / 1000;
        let Mt_B = is_imp ? torsional_case.perp_to_B.Mt : torsional_case.perp_to_B.Mt / 1000;
        if (inputs.design_method === 'ASD') {
            Mt_L *= 0.6;
            Mt_B *= 0.6;
        }

    return `<div id="torsional-section" class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-semibold text-center flex-grow">Torsional Load Case (ASCE 7 Fig. 27.4-8, Case 2)</h3>
                        <button data-copy-target-id="torsional-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs">Copy Section</button>
                    </div>
                    <div class="copy-content">
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">This moment must be considered concurrently with 75% of the Case 1 design wind pressures on the walls.</p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                        <div>
                            <p class="font-semibold">Wind Perpendicular to L</p>
                            <p class="text-2xl font-bold">${Mt_L.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                        </div>
                        <div>
                            <p class="font-semibold">Wind Perpendicular to B</p>
                            <p class="text-2xl font-bold">${Mt_B.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                        </div>
                    </div>
                    </div>
                 </div>`;
}

/**
 * Renders the Components & Cladding (C&C) section.
 */
function renderCandCSection(candc, inputs, units) {
    if (!candc || !candc.applicable) return '';
    const { is_imp, p_unit } = units;
    let html = `<div id="candc-section" class="border dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50 mt-8">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="text-xl font-semibold text-center flex-grow">Components & Cladding (C&C) Pressures</h3>
                        <button data-copy-target-id="candc-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs">Copy Section</button>
                    </div>
                    <div class="copy-content">
                    <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">
                        Calculated for Effective Wind Area A = ${sanitizeHTML(inputs.effective_wind_area)} ${is_imp ? 'ft²' : 'm²'}. Reference: ${sanitizeHTML(candc.ref)}.
                    </p>
                    
                    ${generateCandCDiagram(inputs, candc)}

                    <table class="w-full border-collapse">
                    `;
        if (candc.is_high_rise) {
            html += `<thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th>Zone</th>
                            <th>GCp (+)</th>
                            <th>GCp (-)</th>
                            <th>LRFD Pressure (+ / -) [${p_unit}]</th>
                            <th>ASD Pressure (+ / -) [${p_unit}]</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300 text-center">`;
            for (const zone in candc.pressures) {
                const data = candc.pressures[zone];
                const p_pos_lrfd = data.p_pos;
                const p_neg_lrfd = data.p_neg;
                const p_pos_asd = p_pos_lrfd * 0.6;
                const p_neg_asd = p_neg_lrfd * 0.6;
                html += `<tr>
                            <td>${sanitizeHTML(zone)}</td>
                            <td>${data.gcp_pos.toFixed(2)}</td>
                            <td>${data.gcp_neg.toFixed(2)}</td>
                            <td>${p_pos_lrfd.toFixed(2)} / ${p_neg_lrfd.toFixed(2)}</td>
                            <td>${p_pos_asd.toFixed(2)} / ${p_neg_asd.toFixed(2)}</td>
                         </tr>`;
            }
        } else {
            html += `<thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th>Zone</th>
                            <th>GCp</th>
                            <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300 text-center">`;
            for (const zone in candc.pressures) {
                const data = candc.pressures[zone];
                const pressure = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
                html += `<tr><td>${sanitizeHTML(zone)}</td><td>${data.gcp.toFixed(2)}</td><td>${pressure.toFixed(2)}</td></tr>`;
            }
        }
        html += `</tbody></table></div></div>`;
    return html;
}

function sendWindToCombos(results) {
    if (!results || !results.directional_results) {
        showFeedback('No wind results to send.', true, 'feedback-message');
        return;
    }

    const comboData = {
        combo_wind_wall_ww_max: 0, combo_wind_wall_ww_min: 0,
        combo_wind_wall_lw_max: 0, combo_wind_wall_lw_min: 0,
        combo_wind_roof_ww_max: 0, combo_wind_roof_ww_min: 0,
        combo_wind_roof_lw_max: 0, combo_wind_roof_lw_min: 0,
        combo_wind_cc_max: 0, combo_wind_cc_min: 0,
        combo_wind_cc_wall_max: 0, combo_wind_cc_wall_min: 0,
    };

    // Helper to find the most critical (max absolute) nominal pressures from all MWFRS directions
    const getGoverningMwfrsPressure = (surface_name) => {
        let max_abs_pressure = { p_pos_asd: 0, p_neg_asd: 0 };
        let max_abs_val = -1;

        for (const dir in results.directional_results) {
            const resultSet = results.directional_results[dir] || [];
            const surfaceResult = resultSet.find(r => r.surface.includes(surface_name));
            if (surfaceResult) {
                const current_max_abs = Math.max(Math.abs(surfaceResult.p_pos_asd), Math.abs(surfaceResult.p_neg_asd));
                if (current_max_abs > max_abs_val) {
                    max_abs_val = current_max_abs;
                    max_abs_pressure = surfaceResult;
                }
            }
        }
        return { max: max_abs_pressure.p_pos_asd, min: max_abs_pressure.p_neg_asd };
    };

    // Get governing MWFRS pressures
    const ww_wall = getGoverningMwfrsPressure('Windward Wall');
    const lw_wall = getGoverningMwfrsPressure('Leeward Wall');
    const ww_roof = getGoverningMwfrsPressure('Windward Roof');
    const lw_roof = getGoverningMwfrsPressure('Leeward Roof');

    comboData.combo_wind_wall_ww_max = ww_wall.max;
    comboData.combo_wind_wall_ww_min = ww_wall.min;
    comboData.combo_wind_wall_lw_max = lw_wall.max;
    comboData.combo_wind_wall_lw_min = lw_wall.min;
    comboData.combo_wind_roof_ww_max = ww_roof.max;
    comboData.combo_wind_roof_ww_min = ww_roof.min;
    comboData.combo_wind_roof_lw_max = lw_roof.max;
    comboData.combo_wind_roof_lw_min = lw_roof.min;

    // C&C Loads
    const candc = results.candc;
    if (candc && candc.applicable && candc.pressures) {
        for (const [zone, pressureData] of Object.entries(candc.pressures)) {
            // The combo calculator expects nominal (ASD) level loads.
            // For C&C, the ASD pressure is 0.6 * LRFD pressure.
            const p_asd_pos = pressureData.p_pos * 0.6; // p_pos is LRFD level
            const p_asd_neg = pressureData.p_neg * 0.6; // p_neg is LRFD level
            
            if (zone.toLowerCase().includes('wall')) {
                comboData.combo_wind_cc_wall_max = Math.max(comboData.combo_wind_cc_wall_max, p_asd_pos);
                comboData.combo_wind_cc_wall_min = Math.min(comboData.combo_wind_cc_wall_min, p_asd_neg);
            } else { // roof
                comboData.combo_wind_cc_max = Math.max(comboData.combo_wind_cc_max, p_asd_pos);
                comboData.combo_wind_cc_min = Math.min(comboData.combo_wind_cc_min, p_asd_neg);
            }
        }
    }

    const dataToSend = {
        source: 'Wind Calculator',
        type: 'Wind',
        loads: comboData
    };
    localStorage.setItem('loadsForCombinator', JSON.stringify(dataToSend));
    window.location.href = 'combos.html';
}
/**
 * Main rendering orchestrator function.
 */
function renderWindResults(results) {
     if (!results) return;
     lastWindRunResults = results; // Cache the results

     const resultsContainer = document.getElementById('results-container');
    const { inputs, intermediate, directional_results, jurisdiction_note, temporary_structure_note, warnings, torsional_case, open_building_ref, candc, mwfrs_method, heightVaryingResults_L } = results;
    const is_imp = inputs.unit_system === 'imperial';
    const [v_unit, h_unit, p_unit] = is_imp ? ['mph', 'ft', 'psf'] : ['m/s', 'm', 'Pa'];
    const units = { is_imp, v_unit, h_unit, p_unit };
    
    let html = `<div id="wind-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                    <button id="send-to-combos-btn" class="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 text-sm print-hidden">Send to Combos</button>
                    <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm print-hidden">Download PDF</button>
                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm print-hidden">Copy Report</button>
                   </div>`;

    html += `<div class="text-center border-b pb-4">
                    <h2 class="text-2xl font-bold">WIND LOAD REPORT (${inputs.effective_standard})</h2>
                </div>`;

    if (jurisdiction_note) html += `<div class="bg-blue-100 dark:bg-blue-900/50 border-l-4 border-blue-500 text-blue-700 dark:text-blue-300 p-4 rounded-md"><p><strong>Jurisdiction Note:</strong> ${jurisdiction_note}</p></div>`;
    if (temporary_structure_note) html += `<div class="bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-700 dark:text-yellow-300 p-4 rounded-md"><p><strong>Project-Specific Allowance:</strong> ${temporary_structure_note}</p></div>`;
    if (warnings && warnings.length > 0) {
        html += renderValidationResults({ warnings, errors: [] });
    }    // --- Assemble Report Sections ---
    html += renderDesignParameters(inputs, intermediate, units);
    html += renderCalculationBreakdown(inputs, intermediate, units);

    // --- Handle Open Buildings as a special case ---
    const openBuildingHtml = renderOpenBuildingResults(directional_results, open_building_ref, inputs, units);
    if (openBuildingHtml) {
        html += `<div id="mwfrs-section" class="report-section-copyable">${openBuildingHtml}</div>`;
    } else {
        // --- Standard Enclosed/Partially Enclosed Building Sections ---
        html += renderMwfrsSection(directional_results, inputs, intermediate, mwfrs_method, units);
        const leeward_pressure_L = directional_results.perp_to_L.find(r => r.surface.includes("Leeward"))?.p_pos || 0;
        html += renderHeightVaryingTable(heightVaryingResults_L, leeward_pressure_L, inputs, units) || '';
        html += renderTorsionalCase(torsional_case, inputs, units);
        html += renderCandCSection(candc, inputs, units);
    }

    html += generateWindSummary(inputs, directional_results, candc, p_unit);
    html += `</div>`; // Close main container
    resultsContainer.innerHTML = html;

    // Render charts after the canvas elements are in the DOM
    const { roofPressureDist_L, roofPressureDist_B } = results;
    if (roofPressureDist_L && roofPressureDist_B && !results.heightVaryingResults_L) { // Only for low-rise
        renderRoofPressureChart('roofChartL', roofPressureDist_L, inputs.building_length_L, inputs.design_method, units);
        renderRoofPressureChart('roofChartB', roofPressureDist_B, inputs.building_width_B, inputs.design_method, units);
    }
}