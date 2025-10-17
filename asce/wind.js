// --- GLOBAL VARIABLES for state management ---
let lastWindRunResults = null;

/**
 * Safely formats a number to a fixed number of decimal places, returning 'N/A' if the number is null, undefined, or not finite.
 * @param {number | null | undefined} val - The number to format.
 * @param {number} [digits=2] - The number of decimal places.
 * @returns {string} The formatted number or 'N/A'.
 */
function safeToFixed(val, digits = 2) { // Already correct, no changes needed.
    if (val === null || val === undefined || !isFinite(val)) return "N/A";
    return val.toFixed(digits);
}

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
    'jurisdiction', 'ground_elevation', 'mwfrs_method',
    'basic_wind_speed', 'exposure_category', 'mean_roof_height', 'building_flexibility',
    'fundamental_period',
    'has_overhang', 'overhang_length',
    'has_parapet', 'parapet_height_hp',
    'has_rooftop_equipment', // <-- ADD THIS LINE
    'building_length_L', 'building_width_B', 'enclosure_classification', 'roof_type', 'roof_slope_deg',
    'structure_type', 'solidity_ratio', 'member_shape', 'member_diameter', // Open sign inputs
    'sign_width_B', 'sign_height_s', 'clearance_z', // Solid sign inputs
    'chimney_height', 'chimney_diameter', 'corner_radius_r', // Chimney/Tank inputs
    'tower_height', 'tower_width', 'tower_solidity_ratio', 'tower_member_shape', // Trussed Tower inputs
    'rooftop_structure_type', 'rooftop_equipment_height_hr', 'rooftop_equipment_width_Br', 'rooftop_equipment_length_Lr', // Rooftop Solid Equipment
    'rooftop_location_x', // Rooftop Open-Frame
    'rooftop_solidity_ratio', // <-- ADD THIS LINE
    'scaffold_width_Br', 'scaffold_height_hr', // Rooftop Structure inputs
    'arched_roof_rise', 'arched_roof_spring_point', // Arched Roof inputs
    'topographic_factor_Kzt', 'gust_effect_factor_g', 'temporary_construction',
    'wind_obstruction', 'effective_wind_area', 'calculate_height_varying_pressure'
];

// =================================================================================
//  UI INJECTION & INITIALIZATION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Define the main app initialization function.
    function initializeApp() {
        // 2. Create the main calculation handler first, so it's available to other functions.
        const handleRunWindCalculation = createCalculationHandler({
            inputIds: windInputIds,
            storageKey: 'wind-calculator-inputs',
            validatorFunction: validateWindInputs,
            calculatorFunction: windLoadCalculator.run,
            renderFunction: renderWindResults,
            resultsContainerId: 'results-container',
            feedbackElId: 'feedback-message',
            buttonId: 'run-calculation-btn'
        });

        // 3. Attach all event listeners.
        attachEventListeners(handleRunWindCalculation);

        // 4. Initialize shared UI components and load saved data.
        initializeSharedUI();
        addRangeIndicators();
        // Use a small timeout to ensure all elements are ready before triggering a calculation from localStorage
        setTimeout(() => {
            loadInputsFromLocalStorage('wind-calculator-inputs', windInputIds);
        }, 100);
    }

    // --- EVENT HANDLERS ---
    function attachEventListeners(handleRunWindCalculation) {
        document.getElementById('mean_roof_height').addEventListener('input', (event) => {
            const h = parseFloat(event.target.value) || 0;
            const is_imp = document.getElementById('unit_system').value === 'imperial';
            const limit = is_imp ? 60 : 18.3;
            document.getElementById('tall-building-section').classList.toggle('hidden', h <= limit);
            // Also control the visibility of the MWFRS method selector
            const mwfrsContainer = document.getElementById('mwfrs-method-container');
            if (mwfrsContainer) {
                mwfrsContainer.classList.toggle('hidden', h > limit);
            }
        });

        // Create file-based handlers
        const handleSaveWindInputs = createSaveInputsHandler(windInputIds, 'wind-inputs.txt');
        const handleLoadWindInputs = createLoadInputsHandler(windInputIds, handleRunWindCalculation);

        // Attach handlers to buttons
        document.getElementById('run-calculation-btn').addEventListener('click', handleRunWindCalculation);
        document.getElementById('save-inputs-btn').addEventListener('click', handleSaveWindInputs);
        document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('wind-file-input'));
        document.getElementById('wind-file-input').addEventListener('change', (e) => handleLoadWindInputs(e));

        // Delegated event listener for report buttons
        document.getElementById('results-container').addEventListener('click', async (event) => {
            if (event.target.id === 'copy-report-btn') {
                await handleCopyToClipboard('wind-report-content', 'feedback-message');
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
            if (event.target.id === 'download-word-btn') {
                handleDownloadWord('wind-report-content', 'Wind-Load-Report.doc');
            }
            const copyBtn = event.target.closest('.copy-section-btn');
            if (copyBtn) {
                const targetId = copyBtn.dataset.copyTargetId;
                if (targetId) {
                    await handleCopyToClipboard(targetId, 'feedback-message');
                }
            }
            const button = event.target.closest('.toggle-details-btn');
            if (button) {
                const detailId = button.dataset.toggleId;
                const detailRow = document.getElementById(detailId);
                if (detailRow) {
                    detailRow.classList.toggle('is-visible');
                    button.textContent = detailRow.classList.contains('is-visible') ? '[Hide Details]' : '[Show Details]';
                }
            }
        });
    }

    // 4. Run the app.
    initializeApp();    
}); // END DOMContentLoaded

// =================================================================================
//  WIND LOAD CALCULATOR LOGIC
// =================================================================================

const windLoadCalculator = (() => {
    // --- COEFFICIENT & FACTOR HELPERS (from ASCE 7 Tables) ---

    // Internal pressure coefficient GCpi (ASCE 7-16/22 Table 26.13-1)
    function getInternalPressureCoefficient(enclosureClass) {
        const map = {
            "Enclosed": [0.18, "ASCE 7 Table 26.13-1 (Enclosed)"],
            "Partially Enclosed": [0.55, "ASCE 7 Table 26.13-1 (Partially Enclosed)"],
            "Open": [0.00, "ASCE 7 Table 26.13-1 (Open)"]
        };
        return map[enclosureClass] || [0.00, "Invalid Enclosure"];
    }

    // Net force coefficient (Cf) for open signs (ASCE 7-16/22 Figure 29.5-1)
    function getOpenSignCf(solidity_ratio, options) {
        const { member_shape, V, b, unit_system } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0)); // Clamp between 0 and 1

        if (member_shape === 'flat') {
            // Interpolate for flat-sided members from Figure 29.5-1
            const cf = interpolate(epsilon, [0.1, 0.3, 0.5, 1.0], [1.8, 1.7, 1.6, 2.0]);
            return { Cf: cf, ref: "ASCE 7 Fig. 29.5-1 (Flat Members)" };
        } else { // 'round' members
            // For round members, Cf depends on V*sqrt(b) and epsilon.
            // V must be in ft/s and b in ft.
            const V_fps = unit_system === 'imperial' ? V * 1.467 : V * 3.281;
            const b_ft = unit_system === 'imperial' ? b : b * 3.281;
            const V_sqrt_b = V_fps * Math.sqrt(b_ft);

            // Interpolation data from ASCE 7-16 Fig 29.5-1 for round members
            const epsilon_points = [0.1, 0.3, 0.5, 1.0];
            const cf_low_reynolds = [0.7, 0.8, 0.8, 1.2]; // For V*sqrt(b) < 2.5
            const cf_high_reynolds = [1.2, 1.3, 1.3, 1.5]; // For V*sqrt(b) >= 2.5

            const cf_values = (V_sqrt_b < 2.5) ? cf_low_reynolds : cf_high_reynolds;
            const cf = interpolate(epsilon, epsilon_points, cf_values);
            return { Cf: cf, ref: `ASCE 7 Fig. 29.5-1 (Round, V√b=${safeToFixed(V_sqrt_b, 1)})` };
        }
    }

    // Net pressure coefficient (CN) for solid freestanding signs (ASCE 7-16/22 Figure 29.3-1)
    function getSolidSignCn(B, s, z) {
        if (!isFinite(B) || !isFinite(s) || !isFinite(z)) {
            return { CN: 0, ref: "Invalid dimensions for Solid Sign" };
        }

        const M = s > 0 ? B / s : 0; // Aspect Ratio
        const s_over_h = z > 0 ? s / z : 0;

        // Interpolation data from ASCE 7-16 Fig 29.3-1
        const M_points = [0.25, 1, 2, 4, 10, 20, 40];
        const CN_at_s_over_h_1 = [1.2, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6];
        const CN_at_s_over_h_0 = [1.8, 1.85, 1.9, 1.9, 1.95, 1.95, 2.0];

        const CN = interpolate(M, M_points, s_over_h < 0.5 ? CN_at_s_over_h_0 : CN_at_s_over_h_1);
        return { CN, ref: `ASCE 7 Fig. 29.3-1 (M=${safeToFixed(M, 2)}, s/h=${safeToFixed(s_over_h, 2)})` };
    }

    // Net pressure coefficients (GCr) for rooftop structures (ASCE 7-16/22 Figure 29.5-1)
    function getRooftopStructureCoefficients(inputs) {
        const { rooftop_solidity_ratio, rooftop_location_x, mean_roof_height } = inputs;
        const epsilon = rooftop_solidity_ratio;
        const x = rooftop_location_x;
        const h = mean_roof_height;

        if (!isFinite(epsilon) || !isFinite(x) || !isFinite(h) || h <= 0) {
            return { GCrh: 0, GCrv: 0, ref: "Invalid rooftop structure dimensions" };
        }

        // Correctly implement ASCE 7-16 Figure 29.4-2 for Open Rooftop Structures
        const x_over_h = x / h;

        // Horizontal Coefficient (GCrh)
        const gcrh_at_x_h_0 = interpolate(epsilon, [0.1, 0.3, 1.0], [2.0, 1.8, 1.6]);
        const gcrh_at_x_h_0_5 = interpolate(epsilon, [0.1, 0.3, 1.0], [1.7, 1.6, 1.5]);
        const GCrh = interpolate(x_over_h, [0, 0.5], [gcrh_at_x_h_0, gcrh_at_x_h_0_5]);

        // Vertical Coefficient (GCrv)
        const GCrv = interpolate(epsilon, [0.1, 1.0], [0.8, 2.0]);

        const ref = `ASCE 7-16 Fig. 29.4-2 (Open Rooftop, ε=${safeToFixed(epsilon, 2)}, x/h=${safeToFixed(x_over_h, 2)})`;
        return { GCrh, GCrv, ref };
    }
    function getChimneyCf(options) {
        const { shape, h, D, qz, r, unit_system } = options;
        if (D <= 0 || h <= 0) return { Cf: 0, ref: "Invalid dimensions" };

        const h_over_D = h / D;
        const h_D_points = [1, 7, 25];
        let cf_values;

        switch (shape) {
            case 'Square':
                const r_over_D = r / D;
                cf_values = (r_over_D >= 0.05)
                    ? [1.0, 1.1, 1.2] // Rounded
                    : [1.3, 1.4, 2.0]; // Sharp
                const Cf_sq = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_sq, ref: `ASCE 7 Fig. 29.4-1 (Square, r/D=${safeToFixed(r_over_D, 2)})` };

            case 'Hexagonal':
            case 'Octagonal':
                cf_values = [1.0, 1.2, 1.4];
                const Cf_hex = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_hex, ref: `ASCE 7 Fig. 29.4-1 (${shape})` };

            case 'Round':
                // D must be in ft and qz in psf for the D*sqrt(qz) parameter.
                const D_ft = unit_system === 'imperial' ? D : D * 3.281;
                const qz_psf = unit_system === 'imperial' ? qz : qz * 0.020885;
                const D_sqrt_qz = D_ft * Math.sqrt(qz_psf);

                if (D_sqrt_qz < 2.5) { // Moderately smooth, subcritical
                    cf_values = [0.5, 0.6, 0.7];
                } else { // Rough or supercritical
                    cf_values = [0.7, 0.8, 0.9];
                }
                const Cf_round = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_round, ref: `ASCE 7 Fig. 29.4-1 (Round, D√q_z=${safeToFixed(D_sqrt_qz, 1)})` };

            default:
                return { Cf: 1.4, ref: "ASCE 7 Fig. 29.4-1 (Default/Unknown)" };
        }
    }

    /**
     * Calculates the GCr factor for solid rooftop equipment.
     * Based on ASCE 7-16 Fig. 29.5-1 and ASCE 7-22 Fig. 29.4-1.
     * @param {object} inputs - The user inputs object.
     * @returns {{GCrh: number, GCrv: number, ref: string}}
     */
    function getRooftopEquipmentGCr(inputs) {
        const { rooftop_equipment_width_Br: Br, rooftop_equipment_length_Lr: Lr, rooftop_equipment_height_hr: hr } = inputs;

        if (!isFinite(Br) || Br <= 0 || !isFinite(Lr) || Lr <= 0 || !isFinite(hr) || hr <= 0) {
            return { GCrh: 0, GCrv: 0, ref: "Invalid rooftop equipment dimensions" };
        }

        // Horizontal Force Coefficient (GCrh)
        const Lr_over_hr = Lr / hr;
        const Br_over_hr = Br / hr;

        // Interpolation data from the figure for GCrh
        const Lr_hr_points = [0, 0.5, 1, 2, 4, 7, 10];
        const gcrh_curves = {
            1: [1.0, 1.0, 1.0, 1.1, 1.2, 1.35, 1.4],
            10: [1.0, 1.0, 1.0, 1.1, 1.2, 1.35, 1.4],
            40: [1.9, 1.8, 1.7, 1.6, 1.5, 1.45, 1.4]
        };
        const Br_hr_points = Object.keys(gcrh_curves).map(Number);

        // Perform two-stage interpolation
        // 1. Interpolate along Lr/hr for each bounding Br/hr curve
        const gcrh_values_at_Lr_hr = Br_hr_points.map(br_hr => interpolate(Lr_over_hr, Lr_hr_points, gcrh_curves[br_hr]));
        // 2. Interpolate along Br/hr using the results from step 1
        const GCrh = interpolate(Br_over_hr, Br_hr_points, gcrh_values_at_Lr_hr);

        // Vertical Force Coefficient (GCrv)
        const gcrv_Lr_hr_points = [0, 1, 2, 3, 4, 5, 10]; // Lr/hr points for GCrv
        const gcrv_values = [1.5, 1.5, 1.3, 1.15, 1.05, 1.0, 0.7]; // GCrv values from the chart
        const GCrv = interpolate(Lr_over_hr, gcrv_Lr_hr_points, gcrv_values);

        const ref = `ASCE 7-16 Fig. 29.4-1 (Solid Rooftop, Lr/hr=${safeToFixed(Lr_over_hr, 2)}, Br/hr=${safeToFixed(Br_over_hr, 2)})`;
        return { GCrh, GCrv, ref };
    }

    // Net force coefficient (Cf) for trussed towers (ASCE 7-16/22 Tables 29.6-1 & 29.6-2)
    function getTrussedTowerCf(options) {
        const { structure_type, solidity_ratio, member_shape } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0));
        let Cf;
        let ref;

        if (member_shape === 'flat') {
            // ASCE 7 Table 29.6-1 for flat-sided members
            Cf = 4.0 * epsilon**2 - 5.9 * epsilon + 4.0;
            ref = "ASCE 7 Table 29.6-1 (Flat Members)";
        } else { // round members
            // ASCE 7 Table 29.6-2 for round members
            if (structure_type.includes('Square')) {
                Cf = 3.4 * epsilon**2 - 4.7 * epsilon + 2.7;
                ref = "ASCE 7 Table 29.6-2 (Square Tower, Round Members)";
            } else { // Triangular or All Other
                Cf = 2.6 * epsilon**2 - 3.5 * epsilon + 2.2;
                ref = "ASCE 7 Table 29.6-2 (Triangular Tower, Round Members)";
            }
        }
        return { Cf: Math.max(Cf, 0), ref }; // Ensure Cf is not negative
    }

    // Net pressure coefficient (CN) for arched roofs (ASCE 7-16/22 Figure 27.3-3)
    function getArchedRoofCn(options) {
        const { r, B, h, spring_point } = options;
        if (B <= 0) return { cnMap: {}, ref: "Invalid span" };

        const r_over_B = r / B;
        const h_over_B = spring_point === 'On Ground' ? 0 : h / B;
        const cnMap = {};

        // Interpolation data from ASCE 7-16 Fig 27.3-3
        const r_B_points = [0.05, 0.2, 0.3, 0.4, 0.5];

        // Windward Quarter
        const cn_windward_ground = [0.9, 1.1, 1.1, 1.1, 1.1];
        const cn_windward_elevated = [1.5, 1.4, 1.4, 1.4, 1.4];
        const cn_windward = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_windward_ground), interpolate(r_over_B, r_B_points, cn_windward_elevated)]);
        cnMap['Windward Quarter'] = cn_windward;

        // Center Half (and Leeward Quarter)
        const cn_center_h_B_0 = [-0.7, -0.8, -1.0, -1.1, -1.1];
        const cn_center_h_B_0_5 = [-0.9, -0.8, -0.8, -0.8, -0.8];
        const cn_center = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_center_h_B_0), interpolate(r_over_B, r_B_points, cn_center_h_B_0_5)]);
        cnMap['Center Half'] = cn_center;
        cnMap['Leeward Quarter'] = cn_center;

        const ref = "ASCE 7 Fig. 27.3-3 (Arched Roof, r/B=" + safeToFixed(r_over_B, 2) + ", h/B=" + safeToFixed(h_over_B, 2) + ")";
        return { cnMap, ref };
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

        const a_str = `(a=${safeToFixed(a, 1)} ${h_unit})`;

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

    // Cp values for buildings of all heights (Analytical Procedure, ASCE 7-16 Fig 27.3-1)
    function getAnalyticalCpValues(h, dim_parallel_to_wind, dim_perp_to_wind, roofSlopeDeg) {
    const cpMap = {};
    const L_over_B = dim_perp_to_wind > 0 ? dim_parallel_to_wind / dim_perp_to_wind : 0;
    
    cpMap["Windward Wall"] = 0.8;
    // Leeward wall Cp depends on L/B ratio
    cpMap[`Leeward Wall (L/B = ${safeToFixed(L_over_B, 2)})`] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
    cpMap["Side Wall"] = -0.7;
    
    
    // Roof coefficients also depend on h/L ratio
    const h_over_L = dim_parallel_to_wind > 0 ? h / dim_parallel_to_wind : 0;
    
    if (h_over_L <= 0.8) { // Note: ASCE 7-16 Fig 27.3-1 uses h/L, not h/B
        // For windward roof surface, Cp varies with roof angle theta
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.7, -0.5, -0.3, -0.2, 0.0, 0.2, 0.4]);
        // For leeward roof surface, Cp varies with roof angle theta
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20], [-0.3, -0.5, -0.6]);
    } else {
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.9, -0.7, -0.4, -0.3, -0.2, 0.0, 0.4]); // Interpolate for windward
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = -0.7;
    }
    
    return { cpMap };
}

    // Net pressure coefficients CN for Open Buildings with Free Roofs (ASCE 7-16/22 Fig 27.3-4)
    function getOpenBuildingCnValues(roofSlopeDeg, isObstructed, roofType) {
        const cnMap = {};
        const theta = Math.abs(roofSlopeDeg); // Use absolute slope
        const caseKey = isObstructed ? 'obstructed' : 'unobstructed';

        // For flat roofs (theta <= 5 deg), use the values for theta = 5 deg.
        // ASCE 7-16/22 Fig 27.3-4 starts its charts at 5 degrees.
        const interp_theta = Math.max(theta, 5);

        // Net Pressure Coefficients, CN, for Monoslope Roofs (Fig 27.3-4)
        // The figure has separate curves for max positive and max negative CN.
        const monoslope_data = {
            unobstructed: {
                pos: { // Max CN values
                    windward_qtr: interpolate(interp_theta, [5, 30, 45], [0.8, 1.2, 1.2]),
                    middle_half:  interpolate(interp_theta, [5, 30, 45], [-0.8, -0.8, -0.8]),
                    leeward_qtr:  interpolate(interp_theta, [5, 30, 45], [-0.6, -0.5, -0.5])
                },
                neg: { // Min CN values
                    windward_qtr: interpolate(interp_theta, [5, 30, 45], [-1.2, -1.8, -1.8]),
                    middle_half:  interpolate(interp_theta, [5, 30, 45], [-1.2, -1.2, -1.2]),
                    leeward_qtr:  interpolate(interp_theta, [5, 30, 45], [-1.0, -0.8, -0.8])
                }
            },
            obstructed: {
                pos: {
                    windward_qtr: interpolate(interp_theta, [5, 30, 45], [1.6, 2.4, 2.4]),
                    middle_half:  interpolate(interp_theta, [5, 30, 45], [-1.6, -1.6, -1.6]),
                    leeward_qtr:  interpolate(interp_theta, [5, 30, 45], [-1.2, -1.0, -1.0])
                },
                neg: {
                    windward_qtr: interpolate(interp_theta, [5, 30, 45], [-2.2, -3.3, -3.3]),
                    middle_half:  interpolate(interp_theta, [5, 30, 45], [-2.2, -2.2, -2.2]),
                    leeward_qtr:  interpolate(interp_theta, [5, 30, 45], [-1.6, -1.4, -1.4])
                }
            }
        };

        // For pitched/troughed/flat, we use the monoslope values for each half
        cnMap[`Windward Roof Quarter`] = { cn_pos: monoslope_data[caseKey].pos.windward_qtr, cn_neg: monoslope_data[caseKey].neg.windward_qtr };
        cnMap[`Middle Roof Half`] = { cn_pos: monoslope_data[caseKey].pos.middle_half, cn_neg: monoslope_data[caseKey].neg.middle_half };
        cnMap[`Leeward Roof Quarter`] = { cn_pos: monoslope_data[caseKey].pos.leeward_qtr, cn_neg: monoslope_data[caseKey].neg.leeward_qtr };

        return { cnMap, ref: `ASCE 7 Fig 27.3-4 (${caseKey} flow)` };
    }

    // External pressure coefficients Cp (ASCE 7-16/22 Figs 27.4-1, 27.4-2, 27.4-3)
    function getCpValues(standard, h, L, B, roofType, roofSlopeDeg, unitSystem) {
        const cpMap = {};
        const L_over_B = B > 0 ? L / B : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        cpMap["Windward Wall"] = 0.8;
        const refNotes = { "Windward Wall": "ASCE 7 Fig. 27.4-1" };

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
                cpMap[`Roof Zone 1 (0 to ${safeToFixed(a, 1)} ${h_unit})`] = -0.9;
                cpMap[`Roof Zone 2 (${safeToFixed(a, 1)} to ${safeToFixed(2*a, 1)} ${h_unit})`] = -0.5;
                cpMap[`Roof Zone 3 (> ${safeToFixed(2*a, 1)} ${h_unit})`] = -0.3;
                refNotes["Roof"] = "ASCE 7-22 Fig. 27.4-1 (Zoned approach)";
            } else { // ASCE 7-16
                // ASCE 7-16 Figure 27.4-1 (h/L approach)
                const h_over_L = L > 0 ? h / L : 0;
                if (h_over_L <= 0.5) {
                    cpMap[`Roof (0 to ${safeToFixed(h/2, 1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${safeToFixed(h/2, 1)} to ${safeToFixed(h, 1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${safeToFixed(h, 1)} to ${safeToFixed(2*h, 1)} ${h_unit})`] = -0.5;
                    cpMap[`Roof (> ${safeToFixed(2*h, 1)} ${h_unit})`] = -0.3;
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L ≤ 0.5)";
                } else {
                    cpMap[`Roof (0 to ${safeToFixed(h/2, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -1.3]);
                    cpMap[`Roof (${safeToFixed(h/2, 1)} to ${safeToFixed(h, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -0.7]);
                    cpMap[`Roof (> ${safeToFixed(h, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.5, -0.4]);
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L > 0.5)";
                }
            }
        } else if (["gable", "hip"].includes(roofType)) {
            const isHip = roofType === 'hip';
            const gableHipCp = getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem);
            Object.assign(cpMap, gableHipCp);
            refNotes["Roof"] = `ASCE 7-16/22 Fig. 27.4-2 (${isHip ? 'Hip' : 'Gable'})`;
        } else if (roofType === "monoslope") {
            cpMap["Windward Roof"] = interpolate(roofSlopeDeg, [0, 10, 27], [-0.9, -0.7, -0.7]);
            cpMap["Leeward Roof"] = -0.5;
            refNotes["Roof"] = "ASCE 7-16/22 Fig. 27.4-1 (Monoslope)";
        } 
        return { cpMap, refNotes };
    }

    // Directionality factor Kd (ASCE 7-16/22 Table 26.6-1)
    function getKdFactor(structureType, asce_standard) {
        const kdMap = {
            "Buildings (MWFRS, C&C)": [0.85, "ASCE 7 Table 26.6-1 (Buildings)"],
            "Arched Roofs": [0.85, "ASCE 7 Table 26.6-1 (Arched Roofs)"],
            "Solid Freestanding Signs/Walls": [0.85, "ASCE 7 Table 26.6-1 (Signs/Walls)"],
            "Open Signs/Frames": [0.85, "ASCE 7 Table 26.6-1 (Open Signs)"],
            "Trussed Towers (Triangular, Square, Rectangular)": [0.85, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Trussed Towers (All Other Cross Sections)": [0.95, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Chimneys, Tanks (Square)": [0.90, "ASCE 7 Table 26.6-1 (Square)"], // This is for C&C, MWFRS is 0.85
            "Chimneys, Tanks (Round)": [0.95, "ASCE 7 Table 26.6-1 (Round)"], // This is for C&C, MWFRS is 0.85
            "Chimneys, Tanks (Hexagonal)": [0.95, "ASCE 7 Table 26.6-1 (Hexagonal)"]
        };
        // ASCE 7-22, Table 26.6-1, Note 3 states Kd=1.0 for MWFRS of other structures.
        // This includes open signs.
        if (asce_standard === 'ASCE 7-22' && structureType === 'Open Signs/Frames') {
            return [1.0, "ASCE 7-22 Table 26.6-1, Note 3"];
        }

        return kdMap[structureType] || [1.0, "ASCE 7 Table 26.6-1 (Default)"];
    }

    // Importance factor Iw (ASCE 7-16/22 Table 1.5-2)
    function getImportanceFactor(category, standard) {
        const factors = standard === "ASCE 7-22" ? { "I": 0.75, "II": 1.00, "III": 1.15, "IV": 1.15 } : { "I": 0.87, "II": 1.00, "III": 1.15, "IV": 1.15 };
        const ref = standard === "ASCE 7-22" ? "ASCE 7-22 Table 1.5-2" : "ASCE 7-16 Table 1.5-2";
        return [factors[category] || 1.00, ref];
    }

    // Wind exposure constants (alpha, zg) (ASCE 7-16/22 Table 26.9-1)
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

    // Exposure factor Kz (ASCE 7-16/22 Eq. 26.10-1)
    function calculateKz(h, category, units) {
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

    // Elevation factor Ke (ASCE 7-16 Table 26.9-1; ASCE 7-22 Sec 26.9)
    function calculateKe(elevation, units, standard) {
        if (standard === "ASCE 7-22") return [1.0, "ASCE 7-22 Section 26.9 (Ke = 1.0)"];
        const elev_ft = [-500, 0, 500, 1000, 2000, 3000, 4000, 5000, 6000];
        const ke_vals = [1.05, 1.00, 0.95, 0.90, 0.82, 0.74, 0.67, 0.61, 0.55];
        const elev_calc = units === 'metric' ? elevation * 3.28084 : elevation;
        const ke_val = interpolate(elev_calc, elev_ft, ke_vals);
        return [ke_val, `ASCE 7-16 Table 26.9-1 (Elevation: ${safeToFixed(elev_calc, 0)} ft)`];
    }

    // Wind velocity pressure qz (ASCE 7-16/22 Eq. 26.10-1)
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

    // Design pressure p = q(GCp) - qi(GCpi) (ASCE 7-16/22 Eq. 27.4-1)
    function calculateDesignPressure(q_ext, q_int, G, Cp, GCpi) {
        // Correct formula: p = q(GCp) - qi(GCpi)
        // q = q_ext (qz for windward wall, qh for others)
        // qi = q_int (qh for enclosed/partially enclosed)
        const external_pressure = q_ext * G * Cp;
        const internal_pressure = q_int * GCpi;
        return external_pressure - internal_pressure;
    }

    // --- C&C Calculation Helpers ---
    function interpolateHighRiseGcp(gcp_data, A, h) {
        const results = {};
    
        // Iterate over the zones defined in the gcp_data object (e.g., 'Wall Zone 4', 'Roof Zone 1'').
        for (const zone of Object.keys(gcp_data).filter(k => k !== 'heights' && k !== 'areas')) {
            const zoneData = gcp_data[zone];
    
            // 1. Interpolate across area. The GCp values in the table are constant for all heights.
            // We only need to interpolate based on the effective wind area 'A'.
            const log_areas = gcp_data.areas.map(Math.log);
            const log_A = Math.log(A);
            const pos_val_at_A = interpolate(log_A, log_areas, zoneData.pos);
            const neg_val_at_A = interpolate(log_A, log_areas, zoneData.neg);
    
            // 2. Interpolate across height using the results from the area interpolation.
            // Since the values are constant across height, we create an array of the same value.
            const pos_vals_at_h = gcp_data.heights.map(() => pos_val_at_A);
            const neg_vals_at_h = gcp_data.heights.map(() => neg_val_at_A);
    
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

    // C&C pressures for high-rise buildings (h > 60ft)
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
            return { applicable: false, pressures: {}, ref: "Unsupported roof type for high-rise C&C", warnings };
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

    // C&C calculation dispatcher
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
            pos: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9], // Positive GCp is constant
            zone4: [-1.1, -1.1, -1.1, -1.1, -1.0, -0.9], // Fig 30.3-1
            zone5: [-1.4, -1.3, -1.2, -1.1, -1.0, -0.9]  // Fig 30.3-1
        },
        gable: { // Fig 30.3-2
            caseA: { // theta <= 7 deg
                pos: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2], // Positive GCp is constant for this case
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5],
                zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                pos: { // Positive GCp varies with slope for this case
                    zone1: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
                    zone2: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
                    zone3: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
                },
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5],
                zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5]
            }
        },
        hip: { // Fig 30.3-3
            caseA: { // theta <= 7 deg
                pos: [0.2, 0.2, 0.2, 0.2, 0.2, 0.2],
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5], zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5],
                zone1E: [-1.3, -1.3, -1.1, -1.0, -0.7, -0.5], zone2E: [-2.2, -2.0, -1.6, -1.3, -0.8, -0.5], zone3E: [-2.8, -2.5, -2.0, -1.5, -0.8, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                pos: {
                    zone1: [0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
                    zone2: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
                    zone3: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
                    zone1E: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
                    zone2E: [0.6, 0.6, 0.6, 0.6, 0.6, 0.6],
                    zone3E: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8]
                },
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5], zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5],
                zone1E: [-1.5, -1.5, -1.3, -1.1, -0.7, -0.5], zone2E: [-2.5, -2.3, -1.8, -1.4, -0.8, -0.5], zone3E: [-3.3, -3.0, -2.3, -1.7, -0.8, -0.5]
            }
        }
    };

    // Helper to get GCp values for different roof types by interpolating based on slope.
    function getGcpValuesForRoof(roof_type, theta) {
        const roofData = GCP_DATA[roof_type];
        if (!roofData) return {};

        const interpolate_gcp_array = (arrA, arrB) => arrA.map((valA, i) => interpolate(theta, [7, 27], [valA, arrB[i]]));

        if (theta <= 7) return roofData.caseA;
        if (theta > 45) return roofData.caseB; // Per figures, use Case B for theta > 27
        if (theta > 7 && theta <= 27) {
            const interpolated_gcp = {};
            for (const zone in roofData.caseA) {
                if (zone === 'pos') {
                    // Interpolate positive GCp values which are structured differently
                    const pos_interp = {};
                    for (const pos_zone in roofData.caseB.pos) {
                        pos_interp[pos_zone] = interpolate_gcp_array(new Array(6).fill(roofData.caseA.pos[0]), roofData.caseB.pos[pos_zone]);
                    }
                    interpolated_gcp.pos = pos_interp;
                } else {
                    interpolated_gcp[zone] = interpolate_gcp_array(roofData.caseA[zone], roofData.caseB[zone]);
                }
            }
            return interpolated_gcp;
        }
        return roofData.caseB; // 27 < theta <= 45
    }

    // C&C pressures for low-rise buildings (h <= 60ft)
    function calculateLowRiseCandCPressures(inputs, qz, GCpi_abs) {
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type, unit_system } = inputs;
        const A = effective_wind_area;
        const theta = roof_slope_deg;

        // Setup for logarithmic interpolation based on effective wind area
        const area_points = [10, 20, 50, 100, 500, 1000];
        const log_area_points = area_points.map(a => Math.log(a));
        const log_A = Math.log(A);
        const logInterpolate = (gcp_values) => interpolate(log_A, log_area_points, gcp_values);

        const gcp_map = {};

        // Wall Pressures (Fig 30.3-1)
        gcp_map['Wall Zone 4 (Interior)'] = { neg: logInterpolate(GCP_DATA.wall.zone4), pos: logInterpolate(GCP_DATA.wall.pos) };
        gcp_map['Wall Zone 5 (Corners)'] = { neg: logInterpolate(GCP_DATA.wall.zone5), pos: logInterpolate(GCP_DATA.wall.pos) };

        // Roof Pressures
        if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && theta <= 7)) {
            const roof_gcp_arrays = getGcpValuesForRoof(roof_type === 'flat' ? 'gable' : roof_type, 7); // Use gable data for flat
            const zone_map = { zone1: 'Roof Zone 1 (Interior)', zone2: 'Roof Zone 2 (Edges)', zone3: 'Roof Zone 3 (Corners)', zone1E: 'Roof End Zone 1E', zone2E: 'Roof End Zone 2E', zone3E: 'Roof End Zone 3E' };
            for (const zone in roof_gcp_arrays) {
                if (zone === 'pos') continue;
                gcp_map[zone_map[zone]] = { neg: logInterpolate(roof_gcp_arrays[zone]), pos: logInterpolate(roof_gcp_arrays.pos) };
            }
        } else if (['gable', 'hip'].includes(roof_type)) {
            const roof_gcp_arrays = getGcpValuesForRoof(roof_type, theta);
            const zone_map = { zone1: 'Roof Zone 1 (Interior)', zone2: 'Roof Zone 2 (Edges)', zone3: 'Roof Zone 3 (Corners)', zone1E: 'Roof End Zone 1E', zone2E: 'Roof End Zone 2E', zone3E: 'Roof End Zone 3E' };
            for (const zone in roof_gcp_arrays) {
                if (zone === 'pos') continue;
                // For steep roofs, positive GCp is also an object of arrays
                const pos_gcp_array = roof_gcp_arrays.pos[zone] || roof_gcp_arrays.pos.zone1; // Fallback for end zones
                gcp_map[zone_map[zone]] = { neg: logInterpolate(roof_gcp_arrays[zone]), pos: logInterpolate(pos_gcp_array) };
            }
        } else if (roof_type === 'monoslope') {
            // Monoslope C&C from Fig 30.3-5
            gcp_map['Roof Zone 1 (Interior)'] = logInterpolate([-1.5, -1.4, -1.2, -1.0, -0.7, -0.5]);
            gcp_map['Roof Zone 2 (Edges)'] = logInterpolate([-2.3, -2.1, -1.8, -1.5, -1.0, -0.7]);
            gcp_map['Roof Zone 3 (Corners)'] = logInterpolate([-3.2, -2.9, -2.4, -2.0, -1.3, -0.9]);
            gcp_map['Roof Positive Pressure'] = 0.2; // All zones
        }

        const final_pressures = {};
        for (const zone in gcp_map) {
            const gcp_pos = gcp_map[zone].pos;
            const gcp_neg = gcp_map[zone].neg;
            // p = qh * (GCp - GCpi)
            const p1 = qz * (gcp_pos - GCpi_abs);
            const p2 = qz * (gcp_pos - (-GCpi_abs));
            const p3 = qz * (gcp_neg - GCpi_abs);
            const p4 = qz * (gcp_neg - (-GCpi_abs));

            final_pressures[zone] = {
                gcp_pos: gcp_pos, gcp_neg: gcp_neg,
                p_pos: Math.max(p1, p2, p3, p4), p_neg: Math.min(p1, p2, p3, p4)
            };
        }
        return { applicable: true, pressures: final_pressures, ref: `ASCE 7 Ch. 30, Part 1 (h<=${unit_system === 'imperial' ? '60ft' : '18.3m'})` };
    }

    // MWFRS pressures using Envelope Procedure for low-rise buildings (ASCE 7-16 Ch. 28)
    function calculateEnvelopePressures(inputs, intermediate) {
        const { mean_roof_height, roof_slope_deg, unit_system } = inputs;
        const { qz, abs_gcpi } = intermediate;
        const h = mean_roof_height;
        const theta = roof_slope_deg;

        if ((unit_system === 'imperial' && h > 60) || (unit_system === 'metric' && h > 18.3)) {
            return { applicable: false, note: "Envelope Procedure is only applicable for buildings with h <= 60 ft." };
        }

        // Get (GCpf) values from ASCE 7-16 Figure 28.3-1
        const gcpf_pos_roof = interpolate(theta, [0, 20, 30, 45], [0.4, 0.5, 0.6, 0.6]);
        const gcpf_neg_roof = interpolate(theta, [0, 20, 45], [-0.6, -0.7, -0.7]);

        const pressures = {
            // Zone 1: End Zone Wall
            'Zone 1 (Wall)': { gcpf: 0.4, p_net: qz * (0.4 - abs_gcpi), p_net_neg: qz * (0.4 - (-abs_gcpi)) },
            // Zone 2: Interior Zone Wall
            'Zone 2 (Wall)': { gcpf: 0.2, p_net: qz * (0.2 - abs_gcpi), p_net_neg: qz * (0.2 - (-abs_gcpi)) },
            // Zone 3: End Zone Roof
            'Zone 3 (Roof)': { gcpf: gcpf_pos_roof, p_net: qz * (gcpf_pos_roof - abs_gcpi), p_net_neg: qz * (gcpf_pos_roof - (-abs_gcpi)) },
            // Zone 4: Interior Zone Roof
            'Zone 4 (Roof)': { gcpf: gcpf_pos_roof, p_net: qz * (gcpf_pos_roof - abs_gcpi), p_net_neg: qz * (gcpf_pos_roof - (-abs_gcpi)) },
            // Uplift cases
            'Zone 1 (Wall, Uplift)': { gcpf: -0.4, p_net: qz * (-0.4 - abs_gcpi), p_net_neg: qz * (-0.4 - (-abs_gcpi)) },
            'Zone 2 (Wall, Uplift)': { gcpf: -0.2, p_net: qz * (-0.2 - abs_gcpi), p_net_neg: qz * (-0.2 - (-abs_gcpi)) },
            'Zone 3 (Roof, Uplift)': { gcpf: gcpf_neg_roof, p_net: qz * (gcpf_neg_roof - abs_gcpi), p_net_neg: qz * (gcpf_neg_roof - (-abs_gcpi)) },
            'Zone 4 (Roof, Uplift)': { gcpf: gcpf_neg_roof, p_net: qz * (gcpf_neg_roof - abs_gcpi), p_net_neg: qz * (gcpf_neg_roof - (-abs_gcpi)) },
        };

        // Finalize pressures by taking the worst case for each zone
        const finalPressures = {};
        for (const zone in pressures) {
            const data = pressures[zone];
            finalPressures[zone] = {
                gcpf: data.gcpf,
                p_net: Math.max(data.p_net, data.p_net_neg),
                p_net_uplift: Math.min(data.p_net, data.p_net_neg)
            };
        }

        return { applicable: true, pressures: finalPressures, ref: "ASCE 7-16, Chapter 28 (Envelope Procedure)" };
    }

    // Roof overhang pressures (ASCE 7-16 Section 27.4.6)
    function calculateOverhangPressures(inputs, intermediate, directional_results) {
        if (!inputs.has_overhang || inputs.overhang_length <= 0) {
            return { applicable: false };
        }

        const { qz, G } = intermediate;
        const cp_overhang = 0.8; // Cp for the underside of the overhang

        // The pressure on the overhang is the combination of the pressure on the top surface
        // and the pressure on the bottom surface. We need the Cp from the windward roof zone.
        const windward_roof_result = directional_results?.perp_to_L?.find(r => r.surface.includes('Windward'));
        const cp_roof_top = windward_roof_result?.cp || -0.7; // Default to a typical uplift value

        // The net pressure is the difference between the top and bottom surfaces.
        // Uplift on top (negative Cp) and uplift on bottom (positive Cp on underside) add together.
        const net_cp = cp_roof_top - cp_overhang;
        const pressure = qz * G * net_cp;

        return {
            applicable: true,
            pressure: { 'Net Uplift on Overhang': { pressure: pressure, ref: 'ASCE 7-16 Sec. 27.4.6' } },
            ref: `ASCE 7-16 Sec. 27.4.6 (Cp_top=${safeToFixed(cp_roof_top,2)}, Cp_bottom=${safeToFixed(cp_overhang,2)})`
        };
    }

    // Parapet pressures (ASCE 7-16 Section 27.4.5)
    function calculateParapetPressures(inputs, intermediate) {
        if (!inputs.has_parapet || inputs.parapet_height_hp <= 0) {
            return { applicable: false };
        }

        const { qz, G, abs_gcpi } = intermediate;
        const qp = calculateKz(inputs.mean_roof_height + inputs.parapet_height_hp, inputs.exposure_category, inputs.unit_system).Kz / intermediate.Kz * qz;

        // Combined coefficient for windward parapet face
        const GCp_windward = 1.5;
        // Combined coefficient for leeward parapet face
        const GCp_leeward = -1.0;

        // Pressures on the parapet itself
        const p_windward_parapet = qp * GCp_windward;
        const p_leeward_parapet = qp * GCp_leeward;

        // Resultant pressures considering roof pressures as well
        // Case A: Windward parapet pressure + Windward roof edge pressure
        const p_net_A = p_windward_parapet; // Simplified for now, roof pressure is separate
        // Case B: Leeward parapet pressure + Leeward roof pressure
        const p_net_B = p_leeward_parapet; // Simplified

        return {
            applicable: true,
            pressures: {
                'Windward Parapet Face (p_w)': { pressure: p_net_A, ref: 'ASCE 7-16 Eq. 27.4-4a' },
                'Leeward Parapet Face (p_l)': { pressure: p_net_B, ref: 'ASCE 7-16 Eq. 27.4-4b' }
            },
            ref: "ASCE 7-16 Section 27.4.5"
        };
    }

    // Torsional load cases for high-rise buildings (ASCE 7-16 Fig 27.3-8)
    function calculateHighRiseTorsionalCase(directional_results, inputs, intermediate) {
        const { building_length_L: L, building_width_B: B } = inputs;
        const eccentricity = 0.15;

        const results = {
            'Case 2': { note: 'Torsional moment from eccentric load on +/- B/2', Mt: 0, force: 0, eccentricity_val: 0, dimension: 0 },
            'Case 3': { note: 'Torsional moment from eccentric load on +/- L/2', Mt: 0, force: 0, eccentricity_val: 0, dimension: 0 },
            'Case 4': { note: 'Torsional moment from eccentric load on +/- B/2 and +/- L/2', Mt: 0, force: 0, eccentricity_val: 0, dimension: 0 }
        };

        // Simplified approach: Calculate a representative force and apply eccentricity.
        // A more rigorous approach would integrate pressure over the building face.
        const windward_pressure_L = directional_results.perp_to_L.find(r => r.surface.includes('Windward'))?.p_pos || 0;
        const leeward_pressure_L = directional_results.perp_to_L.find(r => r.surface.includes('Leeward'))?.p_pos || 0;
        const force_L = (Math.abs(windward_pressure_L) + Math.abs(leeward_pressure_L)) / 2 * (B * inputs.mean_roof_height) * 0.75; // Case 2 uses 75% of wall pressures
        const Mt_L = force_L * (eccentricity * B);
        results['Case 2'] = { ...results['Case 2'], Mt: Mt_L, force: force_L, eccentricity_val: eccentricity, dimension: B };

        const windward_pressure_B = directional_results.perp_to_B.find(r => r.surface.includes('Windward'))?.p_pos || 0;
        const leeward_pressure_B = directional_results.perp_to_B.find(r => r.surface.includes('Leeward'))?.p_pos || 0;
        const force_B = (Math.abs(windward_pressure_B) + Math.abs(leeward_pressure_B)) / 2 * (L * inputs.mean_roof_height) * 0.75; // Case 3 uses 75% of wall pressures
        const Mt_B = force_B * (eccentricity * L);
        results['Case 3'] = { ...results['Case 3'], Mt: Mt_B, force: force_B, eccentricity_val: eccentricity, dimension: L };

        // Case 4 combines moments from Case 2 and Case 3
        const Mt_4 = Mt_L + Mt_B;
        results['Case 4'] = { ...results['Case 4'], Mt: Mt_4, force: 0, eccentricity_val: 0, dimension: 0 }; // Force calc is complex, just show sum

        return results;
    }

    // --- MWFRS Calculation Helpers ---
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

    // Constants for gust effect factor calculation (ASCE 7-16 Table 26.11-1)
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

    // Mean hourly wind speed at a given height (ASCE 7-16 Eq. 26.11-7)
    function calculateMeanHourlyWindSpeed(V_in, z_effective, zg, alpha, b_bar, unit_system) {
        // For Imperial units, V_in (mph) is converted to fps. For Metric, V_in (m/s) is used directly.
        const V_bar_33ft = V_in * b_bar * Math.pow(33 / zg, 1 / alpha) * (unit_system === 'imperial' ? (88/60) : 1);
        return V_bar_33ft * Math.pow(z_effective / 33, 1 / alpha);
    }

    // Resonant response factor, R (ASCE 7-16 Eq. 26.11-10)
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

    // Gust Effect Factor G for flexible structures (ASCE 7-16 Section 26.11)
    function calculateGustEffectFactor(inputs, intermediate) {
        if (inputs.building_flexibility !== 'Flexible' || !inputs.fundamental_period) {
            return { G: 0.85, ref: "ASCE 7 Sec. 26.11.1 (Rigid Structure)" };
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
        const Q = Math.sqrt(1 / (1 + 0.63 * Math.pow((building_width_B + mean_roof_height) / Lz_bar, 0.63)));
        const R = calculateResonantResponseFactor(n1, V_z_bar, Lz_bar, building_width_B, mean_roof_height);

        // Gust-Effect Factor, Gf. Ref: ASCE 7-16 Eq. 26.11-6
        const Gf = 0.925 * (1 + 1.7 * Iz_bar * Math.sqrt(gQ*gQ * Q*Q + gR*gR * R*R)) / (1 + 1.7 * gQ * Iz_bar);
    
        return {
            G: Gf,
            ref: `ASCE 7 Eq. 26.11-6 (Flexible, G=${safeToFixed(Gf, 3)})`
        };
    }

    function calculateRoofPressureByDistance(inputs, intermediate_globals, cp_map, building_dimension_parallel_to_wind) {
        const { qz, abs_gcpi, G } = intermediate_globals;
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

            const p_pos = calculateDesignPressure(qz, qz, G, cp_at_dist, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, qz, G, cp_at_dist, -abs_gcpi);
            const distance_ratio = L > 0 ? dist / L : 0;
            results.push({ distance: dist, cp: cp_at_dist, p_pos, p_neg, distance_ratio });
        });

        return results;
    }

    // MWFRS pressures for low-rise buildings (h <= 60ft)
    function calculateLowRisePressures(inputs, intermediate_globals) {
        const { effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system } = inputs;
        const { qz, G, abs_gcpi } = intermediate_globals;
        const directional_results = {};

        // Wind Perpendicular to L (wind parallel to L)
        const { cpMap: cp_map_L } = getCpValues(effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${safeToFixed(building_length_L / building_width_B, 2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        // Wind Perpendicular to B (wind parallel to B)
        const { cpMap: cp_map_B } = getCpValues(effective_standard, mean_roof_height, building_width_B, building_length_L, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${safeToFixed(building_width_B / building_length_L, 2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        return directional_results;
    }

    // MWFRS pressures for high-rise buildings (h > 60ft)
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

    // --- Structure-Specific Calculation Strategies ---
    const structureStrategies = {
        'Buildings (MWFRS, C&C)': (inputs, intermediate) => {
            const is_tall_building = (inputs.unit_system === 'imperial' && inputs.mean_roof_height > 60) || (inputs.unit_system === 'metric' && inputs.mean_roof_height > 18.3);
            const use_envelope = inputs.mwfrs_method === 'Envelope' && !is_tall_building;

            if (use_envelope) {
                return {
                    mwfrs_method: "Envelope Procedure (Low-Rise)",
                    envelope_results: calculateEnvelopePressures(inputs, intermediate)
                };
            }

            const results = {
                mwfrs_method: is_tall_building ? "Analytical Procedure (All Heights)" : "Directional Procedure (Low-Rise)",
                directional_results: is_tall_building ? calculateHighRisePressures(inputs, intermediate) : calculateLowRisePressures(inputs, intermediate),
                heightVaryingResults_L: null
            };

        if (inputs.calculate_height_varying_pressure === 'Yes') {
                results.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate);
            }

            results.candc = calculateCandCPressuresEnhanced(inputs, intermediate.qz, intermediate.abs_gcpi);
            if (results.candc.warnings && results.candc.warnings.length > 0) {
                results.warnings = [...(results.warnings || []), ...results.candc.warnings];
            }
            
            // Torsional moment calculation for low-rise buildings
            if (!is_tall_building && ["Enclosed", "Partially Enclosed"].includes(inputs.enclosure_classification) && results.directional_results.perp_to_L) {
                const { qz, G } = intermediate;
                const { perp_to_L, perp_to_B } = results.directional_results;
                const cp_map_L = Object.fromEntries(perp_to_L.map(r => [r.surface, r.cp]));
                const cp_map_B = Object.fromEntries(perp_to_B.map(r => [r.surface, r.cp]));
                
                const F_ww_L = (qz * G * (cp_map_L["Windward Wall"] || 0.8)) * (inputs.building_width_B * inputs.mean_roof_height);
                const F_lw_L = (qz * G * (cp_map_L["Leeward Wall"] || 0)) * (inputs.building_width_B * inputs.mean_roof_height);
                const Mt_L = 0.75 * (Math.abs(F_ww_L) + Math.abs(F_lw_L)) * (0.15 * inputs.building_width_B);
                const F_ww_B = (qz * G * (cp_map_B["Windward Wall"] || 0)) * (inputs.building_length_L * inputs.mean_roof_height);
                const F_lw_B = (qz * G * (cp_map_B["Leeward Wall"] || 0)) * (inputs.building_length_L * inputs.mean_roof_height);
                const Mt_B = 0.75 * (Math.abs(F_ww_B) + Math.abs(F_lw_B)) * (0.15 * inputs.building_length_L);
                results.torsional_case = {
                    perp_to_L: { Mt: Mt_L, note: "Apply with 75% of Case 1 wall pressures." },
                    perp_to_B: { Mt: Mt_B, note: "Apply with 75% of Case 1 wall pressures." }
                };
            } else if (is_tall_building && results.directional_results) {
                // Torsional moment calculation for high-rise buildings
                results.torsional_case = calculateHighRiseTorsionalCase(results.directional_results, inputs, intermediate);
            }
            return results;
        },
        'Parapets': (inputs, intermediate) => {
            return { parapet_results: calculateParapetPressures(inputs, intermediate) };
        },
        'Open Signs/Frames': (inputs, intermediate) => {
            const { qz, G } = intermediate;
            const cf_options = { member_shape: inputs.member_shape, V: inputs.V_in, b: inputs.member_diameter, unit_system: inputs.unit_system };
            const { Cf, ref } = getOpenSignCf(inputs.solidity_ratio, cf_options);
            const pressure = qz * G * Cf;
            return { is_open_sign: true, open_sign_results: { Cf, ref, pressure, pressure_asd: pressure * 0.6 } };
        },'Solid Freestanding Signs/Walls': (inputs, intermediate) => {
            const { qz, G } = intermediate;
            const z_centroid = inputs.clearance_z + inputs.sign_height_s / 2;
            const { Kz: Kz_sign } = calculateKz(z_centroid, inputs.exposure_category, inputs.unit_system);
            const { qz: qz_sign } = calculateVelocityPressure(Kz_sign, intermediate.Kzt, intermediate.Kd, intermediate.Ke, intermediate.V_in, inputs.effective_standard, inputs.risk_category, inputs.unit_system);
            const { CN, ref } = getSolidSignCn(inputs.sign_width_B, inputs.sign_height_s, z_centroid);
            const pressure = qz_sign * G * CN;
            return { is_solid_sign: true, solid_sign_results: { CN, ref, pressure, pressure_asd: pressure * 0.6, Kz_sign, qz_sign } };
        },
        'Trussed Towers (Triangular, Square, Rectangular)': (inputs, intermediate) => {
            const { qz, G } = intermediate;
            const { Cf, ref } = getTrussedTowerCf(inputs);
            const pressure = qz * G * Cf;
            return { is_truss_tower: true, truss_tower_results: { Cf, ref, pressure, pressure_asd: pressure * 0.6, Kz_tower: intermediate.Kz, qz_tower: qz } };
        },
        'Chimneys, Tanks (Square)': (inputs, intermediate) => {
            const { qz, G } = intermediate;
            const { Cf, ref } = getChimneyCf({ shape: 'Square', h: inputs.chimney_height, D: inputs.chimney_diameter, qz: qz, r: inputs.corner_radius_r, unit_system: inputs.unit_system });
            const pressure = qz * G * Cf;
            return { is_chimney: true, chimney_results: { Cf, ref, pressure, pressure_asd: pressure * 0.6, h_struct: inputs.chimney_height, Kz_struct: intermediate.Kz, qz_struct: qz } };
        }
    };

    /**
     * Main calculation orchestrator.
     * Gathers inputs, calculates intermediate values, selects a strategy based on structure type,
     * and returns the final results object.
     * @param {object} inputs - The raw user inputs from the form.
     * @param {object} validation - The validation results object.
     * @returns {object} The complete results object for rendering.
     */
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
            jurisdiction_note = `NYCBC 2022 wind speed of ${safeToFixed(v_input, 0)} mph for Risk Category ${inputs.risk_category} has been applied (Table 1609.3).`;
        }

        if (inputs.temporary_construction === "Yes") {
            v_input *= 0.8;
            const v_unit = inputs.unit_system === 'imperial' ? 'mph' : 'm/s';
            temporary_structure_note = `A 0.8 reduction factor has been applied for temporary construction (PROJECT-SPECIFIC ALLOWANCE, NOT ASCE 7). Calculation wind speed is ${safeToFixed(v_input, 1)} ${v_unit} (reduced from ${v_unreduced} ${v_unit}).`;
        }

        const [abs_gcpi, gcpi_ref] = getInternalPressureCoefficient(inputs.enclosure_classification);
        const [Kd, kd_ref] = getKdFactor(inputs.structure_type, inputs.asce_standard);
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
            inputs: { ...inputs, V_in: v_input, V_unreduced: v_unreduced, GCpi_abs: abs_gcpi, effective_standard: effective_standard },
            intermediate: { Kz, Kz_ref: kz_ref, Ke, ke_ref, qz, qz_ref, Kd, Kd_ref: kd_ref, GCpi_ref: gcpi_ref, alpha, zg, Iw, iw_ref, G, g_ref },
            jurisdiction_note, temporary_structure_note,
            warnings: validation.warnings, errors: validation.errors
        };

        const is_high_rise = inputs.mean_roof_height > 60 && inputs.unit_system === 'imperial';
        if (is_high_rise) {
            // Add a warning if the user has selected 'Rigid' for a tall building, but respect their choice.
            if (inputs.building_flexibility === 'Rigid') {
                windResults.warnings.push("Flexible analysis is recommended for tall buildings (h > 60 ft). The calculation is proceeding with the selected 'Rigid' assumption.");
            }
        }

        // --- Strategy Execution ---
        const intermediate_globals = { Kzt: inputs.topographic_factor_Kzt, Kd, Ke, V_in: v_input, effective_standard, abs_gcpi, G, qz };
        const strategy = structureStrategies[inputs.structure_type] || structureStrategies['Buildings (MWFRS, C&C)'];
        const strategyResults = strategy(inputs, intermediate_globals);

        // Always calculate parapet pressures if applicable, regardless of main structure type
        if (inputs.has_parapet) {
            windResults.parapet_results = calculateParapetPressures(inputs, intermediate_globals);
        }

        // Always calculate overhang pressures if applicable
        if (inputs.has_overhang && strategyResults.directional_results) {
            windResults.overhang_results = calculateOverhangPressures(inputs, intermediate_globals, strategyResults.directional_results);
        }

        // Always calculate rooftop equipment pressures if applicable
        if (inputs.has_rooftop_equipment) {
            let rooftop_results;
            if (inputs.rooftop_structure_type === 'Solid Equipment') {
                const { GCrh, GCrv, ref } = getRooftopEquipmentGCr(inputs);
                const q_roof = intermediate_globals.qz; // Use pressure at roof height h
                // FIX: Add GCrh and GCrv to the results object so they can be used in the renderer.
                rooftop_results = {
                    applicable: true, type: 'Solid Equipment', ref, GCrh, GCrv,
                    pressures: {
                        'Horizontal Pressure': { pressure: q_roof * GCrh },
                        'Vertical Uplift Pressure': { pressure: q_roof * GCrv }
                    }
                };
            } else { // 'Open-Frame Scaffold'
                const { GCrh, GCrv, ref } = getRooftopStructureCoefficients(inputs);
                const q_roof = intermediate_globals.qz;
                // FIX: Add GCrh and GCrv to the results object so they can be used in the renderer.
                rooftop_results = {
                    applicable: true, type: 'Open-Frame Scaffold', ref, GCrh, GCrv,
                    pressures: {
                        'Horizontal Pressure': { pressure: q_roof * GCrh },
                        'Vertical Uplift Pressure': { pressure: q_roof * GCrv }
                    }
                };
            }
            windResults.rooftop_results = rooftop_results;
        }

        // Merge the strategy results into the main results object
        Object.assign(windResults, strategyResults);

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
    const { errors, warnings } = validateInputs(inputs, validationRules.wind, 'wind.js');

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
    const labels = pressureData.map(p => safeToFixed(p.distance, 1));
    const data = pressureData.map(p => safeToFixed(p.p_neg * factor, 2));

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

    const a_val_str = safeToFixed(a, 1);
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
    // FIX: Initialize with null to safely handle empty result arrays.
    let gov_mwfrs_pos = { value: null, surface: 'N/A' };
    let gov_mwfrs_neg = { value: null, surface: 'N/A' };
    let gov_candc_pos = { value: null, zone: 'N/A' };
    let gov_candc_neg = { value: null, zone: 'N/A' };

    // --- MWFRS Summary Logic ---
    if (directional_results) {
        const all_mwfrs_pressures = [];
        Object.values(directional_results).forEach(resultSet => {
            if (!Array.isArray(resultSet)) return;
            resultSet.forEach(r => {
                const val_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
                const val_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
                if (isFinite(val_pos)) all_mwfrs_pressures.push({ value: val_pos, surface: r.surface });
                if (isFinite(val_neg)) all_mwfrs_pressures.push({ value: val_neg, surface: r.surface });
            });
        });

        // FIX: Use reduce on the collected array to safely find max/min.
        if (all_mwfrs_pressures.length > 0) {
            gov_mwfrs_pos = all_mwfrs_pressures.reduce((max, p) => p.value > max.value ? p : max, { value: -Infinity });
            gov_mwfrs_neg = all_mwfrs_pressures.reduce((min, p) => p.value < min.value ? p : min, { value: Infinity });
        }
    }

    // --- C&C Summary Logic ---
    if (candc && candc.applicable && candc.pressures) {
        const all_candc_pressures = [];
        for (const zone in candc.pressures) {
            const data = candc.pressures[zone];
            const p_pos = inputs.design_method === 'ASD' ? data.p_pos * 0.6 : data.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
            if (isFinite(p_pos)) all_candc_pressures.push({ value: p_pos, zone });
            if (isFinite(p_neg)) all_candc_pressures.push({ value: p_neg, zone });
        }

        // FIX: Use reduce on the collected array to safely find max/min.
        if (all_candc_pressures.length > 0) {
            gov_candc_pos = all_candc_pressures.reduce((max, p) => p.value > max.value ? p : max, { value: -Infinity });
            gov_candc_neg = all_candc_pressures.reduce((min, p) => p.value < min.value ? p : min, { value: Infinity });
        }
    }

    return `<div id="wind-summary-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center">
                    <h3 class="report-header flex-grow">Governing Load Summary (${inputs.design_method})</h3>
                    <button data-copy-target-id="wind-summary-section" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs print-hidden">Copy Summary</button>
                </div>
                <div class="copy-content grid grid-cols-1 md:grid-cols-2 gap-6 text-center mt-4">
                    <div><h4 class="font-semibold text-lg mb-2">MWFRS</h4><p>Max Pressure: <strong class="text-xl">${safeToFixed(gov_mwfrs_pos.value, 2)} ${p_unit}</strong> <span class="text-xs">(${gov_mwfrs_pos.surface})</span></p><p>Max Suction: <strong class="text-xl">${safeToFixed(gov_mwfrs_neg.value, 2)} ${p_unit}</strong> <span class="text-xs">(${gov_mwfrs_neg.surface})</span></p></div>
                    <div><h4 class="font-semibold text-lg mb-2">C&C</h4><p>Max Pressure: <strong class="text-xl">${safeToFixed(gov_candc_pos.value, 2)} ${p_unit}</strong> <span class="text-xs">(${gov_candc_pos.zone})</span></p><p>Max Suction: <strong class="text-xl">${safeToFixed(gov_candc_neg.value, 2)} ${p_unit}</strong> <span class="text-xs">(${gov_candc_neg.zone})</span></p></div>
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
                        <li><strong>Basic Design Wind Speed (V):</strong> ${safeToFixed(inputs.V_unreduced, 1)} ${v_unit.toUpperCase()} <span class="ref">[User Input / Jurisdiction]</span></li>
                        <li><strong>Building Dimensions (L x B):</strong> ${inputs.building_length_L} x ${inputs.building_width_B} ${h_unit.toUpperCase()}</li>
                        <li><strong>Exposure Category:</strong> ${sanitizeHTML(inputs.exposure_category)} <span class="ref">[ASCE 7, Sec. 26.7]</span></li>
                        <li><strong>Building Height (h):</strong> ${inputs.mean_roof_height} ${h_unit.toUpperCase()}</li>
                        <li><strong>L/B Ratio (Wind ⊥ to L):</strong> ${safeToFixed(inputs.building_length_L / inputs.building_width_B, 2)} <span class="ref">[Used for Leeward Cp]</span></li>
                        <li><strong>L/B Ratio (Wind ⊥ to B):</strong> ${safeToFixed(inputs.building_width_B / inputs.building_length_L, 2)} <span class="ref">[Used for Leeward Cp]</span></li>
                        <li><strong>Wind Directionality Factor (K<sub>d</sub>):</strong> ${safeToFixed(intermediate.Kd, 2)} <span class="ref">[${intermediate.Kd_ref}]</span></li>
                        <li><strong>Topographic Factor (K<sub>zt</sub>):</strong> ${safeToFixed(inputs.topographic_factor_Kzt, 2)} <span class="ref">[ASCE 7, Sec. 26.8]</span></li>
                        <li><strong>Ground Elevation Factor (K<sub>e</sub>):</strong> ${safeToFixed(intermediate.Ke, 3)} <span class="ref">[${intermediate.ke_ref}]</span></li> 
                        <li><strong>Gust-Effect Factor (G):</strong> ${safeToFixed(intermediate.G, 3)} <span class="ref">[${intermediate.g_ref}]</span></li>
                        <li><strong>Structure Type:</strong> ${sanitizeHTML(inputs.structure_type)} <span class="ref">[User Input]</span></li>
                        ${inputs.structure_type === 'Open Signs/Frames' ? `
                            <li class="pl-4"><strong>Solidity Ratio (ε):</strong> ${safeToFixed(inputs.solidity_ratio, 2)}</li>
                            <li class="pl-4"><strong>Member Shape:</strong> ${sanitizeHTML(inputs.member_shape)}</li>
                            ${inputs.member_shape === 'round' ? `<li class="pl-6"><strong>Member Diameter (b):</strong> ${safeToFixed(inputs.member_diameter, 2)} ${h_unit}</li>` : ''}
                        ` : ''}
                        ${inputs.structure_type === 'Solid Freestanding Signs/Walls' ? `
                            <li class="pl-4"><strong>Sign Width (B):</strong> ${safeToFixed(inputs.sign_width_B, 2)} ${h_unit}</li>
                            <li class="pl-4"><strong>Sign Height (s):</strong> ${safeToFixed(inputs.sign_height_s, 2)} ${h_unit}</li>
                            <li class="pl-4"><strong>Clearance from Ground (z):</strong> ${safeToFixed(inputs.clearance_z, 2)} ${h_unit}</li>
                        ` : ''}
                        ${inputs.structure_type.startsWith('Chimneys, Tanks') ? `
                            <li class="pl-4"><strong>Structure Height (h):</strong> ${safeToFixed(inputs.chimney_height, 2)} ${h_unit}</li>
                            <li class="pl-4"><strong>Width/Diameter (D):</strong> ${safeToFixed(inputs.chimney_diameter, 2)} ${h_unit}</li>
                            ${(inputs.structure_type.includes('Square') || inputs.structure_type.includes('Hexagonal')) ? `<li class="pl-6"><strong>Corner Radius (r):</strong> ${safeToFixed(inputs.corner_radius_r, 2)} ${h_unit}</li>` : ''}
                        ` : ''}
                        ${inputs.structure_type.startsWith('Trussed Towers') ? `
                            <li class="pl-4"><strong>Tower Height (h):</strong> ${safeToFixed(inputs.tower_height, 2)} ${h_unit}</li>
                            <li class="pl-4"><strong>Tower Face Width (w):</strong> ${safeToFixed(inputs.tower_width, 2)} ${h_unit}</li>
                            <li class="pl-4"><strong>Solidity Ratio (ε):</strong> ${safeToFixed(inputs.tower_solidity_ratio, 2)}</li>
                            <li class="pl-4"><strong>Member Shape:</strong> ${sanitizeHTML(inputs.tower_member_shape)}</li>
                        ` : ''}
                        ${inputs.structure_type === 'Arched Roofs' ? `
                            <li class="pl-4"><strong>Roof Rise (r):</strong> ${safeToFixed(inputs.arched_roof_rise, 2)} ${h_unit}</li>
                            <li class="pl-4"><strong>Roof Spring Point:</strong> ${sanitizeHTML(inputs.arched_roof_spring_point)}</li>
                        ` : ''}
                        <li><strong>Velocity Pressure Exposure Coefficient (K<sub>z</sub>):</strong> ${safeToFixed(intermediate.Kz, 2)} <span class="ref">[${intermediate.Kz_ref}]</span></li>
                        <li><strong>Internal Pressure Coefficient (GC<sub>pi</sub>):</strong> &plusmn;${safeToFixed(inputs.GCpi_abs, 2)} <span class="ref">[${intermediate.GCpi_ref}]</span></li>
                        ${inputs.temporary_construction === 'Yes' ? `<li><strong>Reduction Factor for Temporary Construction:</strong> 0.8 <span class="ref">[NYC BC, SEC. 1619.3.3]</span></li>` : ''}
                    </ul>
                </div>
             </div>`;
    return html;
}

/**
 * Generates the HTML for the "Detailed Calculation Breakdown" section.
 */
function renderCalculationBreakdown(results, units) {
    const { inputs, intermediate, open_sign_results, solid_sign_results, chimney_results, truss_tower_results } = results;
    const { h_unit, p_unit } = units;

    let breakdownContent = '';

    if (open_sign_results) {
        const { Cf, ref, pressure } = open_sign_results;
        breakdownContent = `
            <h4 class="font-semibold uppercase text-base">a) Open Sign Calculation (ASCE 7-16 Eq. 29.5-1)</h4>
            <ul class="list-disc list-inside space-y-2 mt-2"> 
                <li><strong>Velocity Pressure (q<sub>z</sub>):</strong> ${safeToFixed(intermediate.qz, 2)} ${p_unit} (Calculated at height h=${inputs.mean_roof_height} ${h_unit})</li>
                <li><strong>Gust Effect Factor (G):</strong> ${safeToFixed(intermediate.G, 3)}</li>
                <li><strong>Net Force Coefficient (C<sub>f</sub>):</strong> ${safeToFixed(Cf, 3)} <span class="ref">[${ref}]</span></li>
                <li class="font-semibold"><strong>Design Pressure (p):</strong>
                    <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">p = q<sub>z</sub> &times; G &times; C<sub>f</sub> = ${safeToFixed(intermediate.qz, 2)} &times; ${safeToFixed(intermediate.G, 3)} &times; ${safeToFixed(Cf, 3)} = <b>${safeToFixed(pressure, 2)} ${p_unit}</b></div>
                    <div class="pl-6 text-xs text-gray-500 dark:text-gray-400">This pressure acts on the solid area of the sign face (A<sub>s</sub>).</div>
                </li>
            </ul>`;
    } else if (solid_sign_results) {
        const { CN, ref, pressure, Kz_sign, qz_sign } = solid_sign_results;
        breakdownContent = `
            <h4 class="font-semibold uppercase text-base">b) Solid Sign Calculation (ASCE 7-16 Eq. 29.3-1)</h4>
            <ul class="list-disc list-inside space-y-2 mt-2">
                <li><strong>Height to Sign Centroid (z):</strong> ${safeToFixed(inputs.clearance_z + inputs.sign_height_s / 2, 2)} ${h_unit}</li> 
                <li><strong>Exposure Coefficient (K<sub>z</sub>) at centroid:</strong> ${safeToFixed(Kz_sign, 3)}</li>
                <li><strong>Velocity Pressure (q<sub>z</sub>) at centroid:</strong> ${safeToFixed(qz_sign, 2)} ${p_unit}</li>
                <li><strong>Gust Effect Factor (G):</strong> ${safeToFixed(intermediate.G, 3)}</li>
                <li><strong>Net Pressure Coefficient (C<sub>N</sub>):</strong> ${safeToFixed(CN, 3)} <span class="ref">[${ref}]</span></li>
                <li class="font-semibold"><strong>Design Pressure (p):</strong>
                    <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">p = q<sub>z</sub> &times; G &times; C<sub>N</sub> = ${safeToFixed(qz_sign, 2)} &times; ${safeToFixed(intermediate.G, 3)} &times; ${safeToFixed(CN, 3)} = <b>${safeToFixed(pressure, 2)} ${p_unit}</b></div>
                </li>
            </ul>`;
    } else if (chimney_results) {
        const { Cf, ref, pressure, Kz_struct, qz_struct } = chimney_results;
        breakdownContent = `
            <h4 class="font-semibold uppercase text-base">c) Chimney/Tank Calculation (ASCE 7-16 Eq. 29.4-1)</h4>
            <ul class="list-disc list-inside space-y-2 mt-2">
                <li><strong>Height to Top of Structure (h):</strong> ${safeToFixed(inputs.chimney_height, 2)} ${h_unit}</li> 
                <li><strong>Exposure Coefficient (K<sub>z</sub>) at h:</strong> ${safeToFixed(Kz_struct, 3)}</li>
                <li><strong>Velocity Pressure (q<sub>z</sub>) at h:</strong> ${safeToFixed(qz_struct, 2)} ${p_unit}</li>
                <li><strong>Gust Effect Factor (G):</strong> ${safeToFixed(intermediate.G, 3)}</li>
                <li><strong>Force Coefficient (C<sub>f</sub>):</strong> ${safeToFixed(Cf, 3)} <span class="ref">[${ref}]</span></li>
                <li class="font-semibold"><strong>Design Pressure (p):</strong>
                    <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">p = q<sub>z</sub> &times; G &times; C<sub>f</sub> = ${safeToFixed(qz_struct, 2)} &times; ${safeToFixed(intermediate.G, 3)} &times; ${safeToFixed(Cf, 3)} = <b>${safeToFixed(pressure, 2)} ${p_unit}</b></div>
                </li>
            </ul>`;
    } else if (truss_tower_results) {
        const { Cf, ref, pressure, Kz_tower, qz_tower } = truss_tower_results;
        breakdownContent = `
            <h4 class="font-semibold uppercase text-base">d) Trussed Tower Calculation (ASCE 7-16 Eq. 29.6-1)</h4>
            <ul class="list-disc list-inside space-y-2 mt-2">
                <li><strong>Height to Tower Centroid (z):</strong> ${safeToFixed(inputs.tower_height / 2, 2)} ${h_unit}</li> 
                <li><strong>Exposure Coefficient (K<sub>z</sub>) at centroid:</strong> ${safeToFixed(Kz_tower, 3)}</li>
                <li><strong>Velocity Pressure (q<sub>z</sub>) at centroid:</strong> ${safeToFixed(qz_tower, 2)} ${p_unit}</li>
                <li><strong>Gust Effect Factor (G):</strong> ${safeToFixed(intermediate.G, 3)}</li>
                <li><strong>Force Coefficient (C<sub>f</sub>):</strong> ${safeToFixed(Cf, 3)} <span class="ref">[${ref}]</span></li>
                <li class="font-semibold"><strong>Design Pressure (p):</strong>
                    <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">p = q<sub>z</sub> &times; G &times; C<sub>f</sub> = ${safeToFixed(qz_tower, 2)} &times; ${safeToFixed(intermediate.G, 3)} &times; ${safeToFixed(Cf, 3)} = <b>${safeToFixed(pressure, 2)} ${p_unit}</b></div>
                    <div class="pl-6 text-xs text-gray-500 dark:text-gray-400">This pressure acts on the solid area of one face (A<sub>f</sub>).</div>
                </li>
            </ul>`;
    } else {
        // Default breakdown for buildings
        breakdownContent = `
            <h4 class="font-semibold uppercase text-base">a) Intermediate Calculations</h4>
            <ul class="list-disc list-inside space-y-2 mt-2"> 
                <li><strong>Factors:</strong> I<sub>w</sub> = ${safeToFixed(intermediate.Iw, 2)}, K<sub>d</sub> = ${safeToFixed(intermediate.Kd, 2)}, K<sub>zt</sub> = ${safeToFixed(inputs.topographic_factor_Kzt, 2)}, G = ${safeToFixed(intermediate.G, 3)}, GC<sub>pi</sub> = &plusmn;${safeToFixed(inputs.GCpi_abs, 2)}</li>
                <li><strong>Exposure Constants (&alpha;, z<sub>g</sub>):</strong> ${intermediate.alpha}, ${safeToFixed(intermediate.zg, 0)} ${h_unit}</li>
                <li><strong>Elevation Factor (K<sub>e</sub>):</strong>
                    <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">Interpolated from ${intermediate.ke_ref} &rarr; K<sub>e</sub> = ${safeToFixed(intermediate.Ke, 3)}</div>
                </li>
                <li><strong>Exposure Coefficient (K<sub>z</sub>):</strong>
                    <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">K<sub>z</sub> = 2.01 &times; (${safeToFixed(inputs.mean_roof_height, 2)} / ${safeToFixed(intermediate.zg, 0)})<sup>(2 / ${intermediate.alpha})</sup> = ${safeToFixed(intermediate.Kz, 3)}</div>
                </li>
                <li><strong>Velocity Pressure (q<sub>h</sub>):</strong>
                    <div class="pl-6 text-sm text-gray-600 dark:text-gray-400">q<sub>h</sub> = 0.00256 &times; K<sub>z</sub> &times; K<sub>zt</sub> &times; K<sub>d</sub> &times; K<sub>e</sub> &times; V² ${inputs.effective_standard === 'ASCE 7-22' ? `&times; I<sub>w</sub>` : ''} = ${safeToFixed(intermediate.qz, 2)} ${p_unit}</div>
                </li>
            </ul>`;
    }

    let html = `<div id="calc-breakdown-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center">
                    <h3 class="report-header">2. Detailed Calculation Breakdown</h3>
                    <button data-copy-target-id="calc-breakdown-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <hr class="border-gray-400 dark:border-gray-600 mt-1 mb-3">
                <div class="copy-content"><div class="calc-breakdown">${breakdownContent}</div></div>
            </div>`;
    return html;
}

/**
 * Renders the results table for Open Buildings.
 */
function renderOpenBuildingResults(directional_results, open_building_ref, inputs, units) {
    const { p_unit } = units;

    // --- Path 1: Handle high-rise rooftop structure results ---
    if (directional_results && directional_results.rooftop_structure) {
        
        let html = `<div class="text-center pt-4"><h3 class="text-xl font-bold">ROOFTOP STRUCTURE PRESSURES (p = q_h*GC_r)</h3></div>`;
        
        let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>Rooftop Structure Pressures (${open_building_ref})</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr class="text-center">
                <th>Force Direction</th><th>GC_r</th><th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300 text-center">`;

        directional_results.rooftop_structure.forEach(r => {
            const pressure = inputs.design_method === 'ASD' ? r.pressure_asd : r.pressure;
            tableHtml += `
                <tr>
                    <td>${r.surface}</td>
                    <td>${safeToFixed(r.GCr || 0, 2)}</td>
                    <td>${safeToFixed(pressure || 0, 2)}</td>
                </tr>`;
        });

        tableHtml += `</tbody></table>`;
        
        // **CRITICAL FIX**: Return here to prevent fall-through to the low-rise logic.
        return html + tableHtml;
    }

    // --- Path 2: Handle low-rise open building results (only runs if the above `if` is false) ---
    // FIX: Coerce directional_results to an array to permanently fix TypeError.
    // The data source can return a single object, an object with direction keys, or an array. 
    // This defensive block ensures it's always a safe-to-iterate array.
    let openRoofResults = [];
    
    if (Array.isArray(directional_results)) {
        openRoofResults = directional_results;
    } else if (directional_results && typeof directional_results === 'object') {
        // If it's a non-array object, try to extract open_roof data
        if (directional_results.open_roof && Array.isArray(directional_results.open_roof)) {
            openRoofResults = directional_results.open_roof;
        } else {
            // If no open_roof array, try to flatten all values
            openRoofResults = Object.values(directional_results).flat();
        }
    } else {
        // If it's undefined, null, or another invalid type, default to empty array to prevent a crash.
        console.warn("renderOpenBuildingResults(): directional_results was not iterable, defaulting to empty array.", directional_results);
        openRoofResults = [];
    }

    let html = `<div class="text-center pt-4"><h3 class="text-xl font-bold">NET DESIGN PRESSURES (p = q_h*G*C_N)</h3></div>`;

    let tableHtml = `<table class="w-full mt-4 border-collapse"><caption>Open Building Free Roof Pressures (${open_building_ref})</caption>
            <thead class="bg-gray-100 dark:bg-gray-700"><tr class="text-center">
                <th>Roof Zone</th><th>C_N,pos</th><th>C_N,neg</th><th>Positive Pressure (${inputs.design_method}) [${p_unit}]</th><th>Negative Pressure (${inputs.design_method}) [${p_unit}]</th>
            </tr></thead>
            <tbody class="dark:text-gray-300 text-center">`;

    openRoofResults.forEach(r => {
            const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
            tableHtml += `
                <tr>
                    <td>${r.surface}</td>
                    <td>${safeToFixed(r.cn_pos || 0, 2)}</td>
                    <td>${safeToFixed(r.cn_neg || 0, 2)}</td>
                    <td>${safeToFixed(p_pos || 0, 2)}</td>
                    <td>${safeToFixed(p_neg || 0, 2)}</td>
                </tr>`;
        });
        tableHtml += `</tbody></table>`;

    return html + tableHtml;
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
                    <td>${r.cp !== null ? safeToFixed(r.cp, 2) : 'N/A'}</td>
                    <td>${safeToFixed(p_pos, 2)}</td>
                    <td>${safeToFixed(p_neg, 2)}</td>
                </tr>
                <tr id="${detailId}" class="details-row"><td colspan="4" class="p-0"><div class="calc-breakdown">
                        <ul><li class="font-semibold"><b>Formula:</b> ${formula_str}</li>
                            <li><b>Calculation (+GCpi):</b> ${safeToFixed(p_pos, 2)} = ${inputs.design_method === 'ASD' ? '0.6 * ' : ''}(${safeToFixed(intermediate.qz, 2)}*${safeToFixed(intermediate.G, 3)}*${safeToFixed(r.cp, 2)} - ${safeToFixed(intermediate.qz, 2)}*${inputs.GCpi_abs})</li>
                            <li><b>Calculation (-GCpi):</b> ${safeToFixed(p_neg, 2)} = ${inputs.design_method === 'ASD' ? '0.6 * ' : ''}(${safeToFixed(intermediate.qz, 2)}*${safeToFixed(intermediate.G, 3)}*${safeToFixed(r.cp, 2)} - ${safeToFixed(intermediate.qz, 2)}*${-inputs.GCpi_abs})</li>
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
                    <td>${safeToFixed(result.height, 1)}</td>
                    <td>${safeToFixed(result.Kz, 3)}</td>
                    <td>${safeToFixed(result.qz, 2)}</td>
                    <td>${safeToFixed(result.p_pos * factor, 2)}</td>
                </tr>`;
        });
    html += `   <tr>
                        <td colspan="3" class="text-right font-semibold pr-4">Constant Leeward Pressure (Perp. to L):</td>
                        <td>${safeToFixed(leeward_pressure * factor, 2)}</td>
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
                        <td>${safeToFixed(r.distance, 1)}</td>
                        <td>${safeToFixed(r.distance_ratio, 2)}</td>
                        <td>${safeToFixed(r.cp, 2)}</td>
                        <td>${safeToFixed(r.p_neg * factor, 2)}</td>
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
                            <td>${safeToFixed(r.distance, 1)}</td>
                            <td>${safeToFixed(r.distance_ratio, 2)}</td>
                            <td>${safeToFixed(r.cp, 2)}</td>
                            <td>${safeToFixed(r.p_neg * factor, 2)}</td>
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
    const is_high_rise = (inputs.unit_system === 'imperial' && inputs.mean_roof_height > 60);

    let contentHtml = '';
    if (is_high_rise) {
        contentHtml = `<table class="w-full mt-4 border-collapse">
                        <thead class="bg-gray-100 dark:bg-gray-700"><tr><th>Case</th><th>Torsional Moment (M<sub>t</sub>)</th></tr></thead>
                        <tbody class="dark:text-gray-300 text-center">`;
        Object.entries(torsional_case).forEach(([caseName, data], i) => {
            let Mt = is_imp ? data.Mt : data.Mt / 1000;
            if (inputs.design_method === 'ASD') Mt *= 0.6;
            const detailId = `torsional-detail-${i}`;
            contentHtml += `<tr>
                                <td>${caseName} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                                <td class="font-bold">${Mt.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</td>
                            </tr>
                            <tr id="${detailId}" class="details-row"><td colspan="2" class="p-0"><div class="calc-breakdown">
                                <p>${data.note}</p>
                                ${data.force > 0 ? `<p><b>Force (F):</b> ${safeToFixed(data.force, 0)} ${is_imp ? 'lb' : 'N'}</p>
                                <p><b>Eccentricity (e):</b> ${data.eccentricity_val} &times; ${data.dimension} ${units.h_unit} = ${safeToFixed(data.eccentricity_val * data.dimension, 2)} ${units.h_unit}</p>
                                <p><b>M<sub>t</sub> = F &times; e</b> = ${safeToFixed(data.force, 0)} &times; ${safeToFixed(data.eccentricity_val * data.dimension, 2)} = ${safeToFixed(data.force * data.eccentricity_val * data.dimension, 0)} ${m_unit.replace('-m', '-m')}</p>` : ''}
                            </div></td></tr>`;
        });
        contentHtml += `</tbody></table>`;
    } else {
        let Mt_L = is_imp ? torsional_case.perp_to_L.Mt : torsional_case.perp_to_L.Mt / 1000; // Note: Mt is already in lb-ft or N-m
        let Mt_B = is_imp ? torsional_case.perp_to_B.Mt : torsional_case.perp_to_B.Mt / 1000;
        if (inputs.design_method === 'ASD') {
            Mt_L *= 0.6;
            Mt_B *= 0.6;
        }
        contentHtml = `<p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">This moment must be considered concurrently with 75% of the Case 1 design wind pressures on the walls.</p>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                            <div>
                                <p class="font-semibold">Wind Perpendicular to L</p>
                                <p class="text-2xl font-bold">${Mt_L.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                            </div>
                            <div>
                                <p class="font-semibold">Wind Perpendicular to B</p>
                                <p class="text-2xl font-bold">${Mt_B.toLocaleString(undefined, {maximumFractionDigits: 0})} ${m_unit}</p>
                            </div>
                        </div>`;
    }

    return `<div id="torsional-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="report-header flex-grow">5. Torsional Load Cases (ASCE 7-16 Fig. 27.3-8)</h3>
                        <button data-copy-target-id="torsional-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">${contentHtml}</div>
                </div>`;
}

/**
 * Renders the Parapet Loads section.
 */
function renderParapetSection(parapet_results, inputs, units) {
    if (!parapet_results || !parapet_results.applicable) return '';
    const { p_unit } = units;

    let html = `<div id="parapet-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="report-header flex-grow">7. Parapet Wind Loads</h3>
                        <button data-copy-target-id="parapet-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">
                        <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Pressures are based on ${parapet_results.ref} and are applied to the vertical projection of the parapet.</p>
                        <table class="w-full mt-4 border-collapse">
                            <thead class="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th>Parapet Face</th>
                                    <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                                    <th>Reference</th>
                                </tr>
                            </thead>
                            <tbody class="dark:text-gray-300 text-center">`;
    for (const [face, data] of Object.entries(parapet_results.pressures)) {
        const pressure = inputs.design_method === 'ASD' ? data.pressure * 0.6 : data.pressure;
        html += `<tr><td>${face}</td><td>${safeToFixed(pressure, 2)}</td><td>${data.ref}</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
    return html;
}
/**
 * Renders the Roof Overhang Loads section.
 */
function renderOverhangSection(overhang_results, inputs, units) {
    if (!overhang_results || !overhang_results.applicable) return '';
    const { p_unit } = units;

    let html = `<div id="overhang-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="report-header flex-grow">8. Roof Overhang Wind Loads</h3>
                        <button data-copy-target-id="overhang-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">
                        <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Pressures are based on ${overhang_results.ref}. This is the net pressure on the overhang element.</p>
                        <table class="w-full mt-4 border-collapse">
                            <thead class="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th>Location</th>
                                    <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                                </tr>
                            </thead>
                            <tbody class="dark:text-gray-300 text-center">`;
    for (const [location, data] of Object.entries(overhang_results.pressure)) {
        const pressure = inputs.design_method === 'ASD' ? data.pressure * 0.6 : data.pressure;
        html += `<tr><td>${location}</td><td>${safeToFixed(pressure, 2)}</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
    return html;
}

/**
 * Renders the Rooftop Equipment Loads section.
 */
function renderRooftopEquipmentSection(rooftop_results, inputs, intermediate, units) {
    if (!rooftop_results || !rooftop_results.applicable) return '';
    const { p_unit } = units;

    let html = `<div id="rooftop-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="report-header flex-grow">9. Rooftop Equipment Wind Loads</h3>
                        <button data-copy-target-id="rooftop-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">
                        <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">Pressures for ${rooftop_results.type} based on ${rooftop_results.ref}.</p>
                        <table class="w-full mt-4 border-collapse">
                            <thead class="bg-gray-100 dark:bg-gray-700">
                                <tr>
                                    <th>Load Direction</th>
                                    <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                                </tr>
                            </thead>
                            <tbody class="dark:text-gray-300 text-center">`;
    Object.entries(rooftop_results.pressures).forEach(([direction, data], i) => {
        const pressure = inputs.design_method === 'ASD' ? data.pressure * 0.6 : data.pressure;
        const detailId = `rooftop-detail-${i}`;
        const GCr = direction.includes('Horizontal') ? rooftop_results.GCrh : rooftop_results.GCrv;
        html += `<tr>
                    <td>${direction} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${safeToFixed(pressure, 2)}</td>
                 </tr>
                 <tr id="${detailId}" class="details-row"><td colspan="2" class="p-0"><div class="calc-breakdown">
                    <p><b>Formula:</b> p = q<sub>h</sub> &times; GC<sub>r</sub></p>
                    <p><b>Calculation:</b> ${safeToFixed(intermediate.qz, 2)} &times; ${safeToFixed(GCr, 2)} = ${safeToFixed(intermediate.qz * GCr, 2)} ${p_unit}</p>
                 </div></td></tr>`;
    });
    html += `</tbody></table></div></div>`;
    return html;
}

/**
 * Renders the Components & Cladding (C&C) section.
 */
function renderCandCSection(candc, inputs, intermediate, units) {
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
            Object.entries(candc.pressures).forEach(([zone, data], i) => {
                const p_pos_lrfd = data.p_pos;
                const p_neg_lrfd = data.p_neg;
                const p_pos_asd = p_pos_lrfd * 0.6;
                const p_neg_asd = p_neg_lrfd * 0.6;
                const detailId = `candc-detail-${i}`;
                html += `<tr>
                            <td>${sanitizeHTML(zone)} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                            <td>${safeToFixed(data.gcp_pos, 2)}</td>
                            <td>${safeToFixed(data.gcp_neg, 2)}</td>
                            <td>${safeToFixed(p_pos_lrfd, 2)} / ${safeToFixed(p_neg_lrfd, 2)}</td>
                            <td>${safeToFixed(p_pos_asd, 2)} / ${safeToFixed(p_neg_asd, 2)}</td>
                         </tr>`;
                html += `<tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">
                            <p><b>Formula:</b> p = q<sub>h</sub> &times; (GC<sub>p</sub> - GC<sub>pi</sub>)</p>
                            <p><b>Positive Pressure Calc:</b> ${safeToFixed(intermediate.qz, 2)} &times; (${safeToFixed(data.gcp_pos, 2)} - (&plusmn;${safeToFixed(inputs.GCpi_abs, 2)}))</p>
                            <p><b>Negative Pressure Calc:</b> ${safeToFixed(intermediate.qz, 2)} &times; (${safeToFixed(data.gcp_neg, 2)} - (&plusmn;${safeToFixed(inputs.GCpi_abs, 2)}))</p>
                         </div></td></tr>`;
            });
        } else {
            html += `<thead class="bg-gray-100 dark:bg-gray-700">
                        <tr>
                            <th>Zone</th>
                            <th>GCp</th>
                            <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                        </tr>
                    </thead>
                    <tbody class="dark:text-gray-300 text-center">`;
            Object.entries(candc.pressures).forEach(([zone, data], i) => {
                const p_neg_lrfd = data.p_neg;
                const p_pos_lrfd = data.p_pos;
                const pressure = inputs.design_method === 'ASD' ? Math.min(p_neg_lrfd, p_pos_lrfd) * 0.6 : Math.min(p_neg_lrfd, p_pos_lrfd);
                const detailId = `candc-detail-${i}`;
                html += `<tr>
                            <td>${sanitizeHTML(zone)} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                            <td>${safeToFixed(data.gcp_neg, 2)}</td><td>${safeToFixed(pressure, 2)}</td>
                         </tr>
                         <tr id="${detailId}" class="details-row"><td colspan="3" class="p-0"><div class="calc-breakdown">
                            <p><b>Formula:</b> p = q<sub>h</sub> &times; (GC<sub>p</sub> - GC<sub>pi</sub>)</p>
                         </div></td></tr>`;
            });
        }
        html += `</tbody></table></div></div>`;
    return html;
}

document.addEventListener('click', async (event) => {
    // ... (existing event listeners)
    if (event.target.id === 'send-to-combos-btn' && lastWindRunResults) {
        const results = lastWindRunResults;
        const comboData = {
            combo_wind_wall_ww_max: 0, combo_wind_wall_ww_min: 0,
            combo_wind_wall_lw_max: 0, combo_wind_wall_lw_min: 0,
            combo_wind_roof_ww_max: 0, combo_wind_roof_ww_min: 0,
            combo_wind_roof_lw_max: 0, combo_wind_roof_lw_min: 0,
            combo_wind_cc_max: 0, combo_wind_cc_min: 0,
            combo_wind_cc_wall_max: 0, combo_wind_cc_wall_min: 0,
        };

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

        const candc = results.candc;
        if (candc && candc.applicable && candc.pressures) {
            for (const [zone, pressureData] of Object.entries(candc.pressures)) {
                const p_asd_pos = pressureData.p_pos * 0.6;
                const p_asd_neg = pressureData.p_neg * 0.6;
                if (zone.toLowerCase().includes('wall')) {
                    comboData.combo_wind_cc_wall_max = Math.max(comboData.combo_wind_cc_wall_max, p_asd_pos);
                    comboData.combo_wind_cc_wall_min = Math.min(comboData.combo_wind_cc_wall_min, p_asd_neg);
                } else {
                    comboData.combo_wind_cc_max = Math.max(comboData.combo_wind_cc_max, p_asd_pos);
                    comboData.combo_wind_cc_min = Math.min(comboData.combo_wind_cc_min, p_asd_neg);
                }
            }
        }
        sendToCombos(comboData, 'Wind Calculator', 'Wind');
    }
});
/**
 * Main rendering orchestrator function.
 */
function renderWindResults(results) {
     if (!results || (!results.directional_results && !results.open_sign_results && !results.solid_sign_results && !results.chimney_results && !results.truss_tower_results)) {
        // If there are no results to show, clear the container and exit.
        const resultsContainer = document.getElementById('results-container');
        if (resultsContainer) resultsContainer.innerHTML = '';
        return;
     }
     lastWindRunResults = results; // Cache the results

     const resultsContainer = document.getElementById('results-container');
    const {
        inputs, intermediate, directional_results, jurisdiction_note, temporary_structure_note, warnings, torsional_case, open_building_ref, candc, mwfrs_method, heightVaryingResults_L, parapet_results, overhang_results, rooftop_results,
        open_sign_results, is_open_sign, solid_sign_results, is_solid_sign, chimney_results, is_chimney, truss_tower_results, is_truss_tower, arched_roof_results, is_arched_roof
    } = results;
    const is_imp = inputs.unit_system === 'imperial';
    const [v_unit, h_unit, p_unit] = is_imp ? ['mph', 'ft', 'psf'] : ['m/s', 'm', 'Pa'];
    const units = { is_imp, v_unit, h_unit, p_unit };
    
    let html = `<div id="wind-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">`;
    html += `<div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                    <button id="send-to-combos-btn" class="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 text-sm print-hidden">Send to Combos</button>
                    <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>
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
    }

    // --- Special rendering path for Arched Roofs ---
    if (is_arched_roof) {
        const { cnMap, ref, pressures } = arched_roof_results;
        html += renderDesignParameters(results.inputs, results.intermediate, units);
        html += renderCalculationBreakdown(results, units);
        html += `<div id="arched-roof-section" class="mt-6 report-section-copyable">
                    <h3 class="report-header">3. Arched Roof Net Pressures</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Calculations based on ${ref}.</p>
                    <table class="w-full mt-4 border-collapse">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th>Roof Zone</th>
                                <th>C<sub>N</sub></th>
                                <th>Design Pressure (${inputs.design_method}) [${p_unit}]</th>
                            </tr>
                        </thead>
                        <tbody class="dark:text-gray-300 text-center">`;
        for (const [zone, data] of Object.entries(pressures)) {
            const final_pressure = inputs.design_method === 'ASD' ? data.pressure_asd : data.pressure;
            html += `<tr>
                        <td>${zone}</td>
                        <td>${safeToFixed(data.CN, 3)}</td>
                        <td>${safeToFixed(final_pressure, 2)}</td>
                     </tr>`;
        }
        html += `</tbody></table></div>`;
        html += `</div>`; // Close main container
        resultsContainer.innerHTML = html;
        return;
    }

    // --- Special rendering path for Trussed Towers ---
    if (is_truss_tower) {
        const { Cf, ref, pressure, pressure_asd, Kz_tower, qz_tower } = truss_tower_results;
        const final_pressure = inputs.design_method === 'ASD' ? pressure_asd : pressure;
        html += renderDesignParameters(results.inputs, results.intermediate, units);
        // Custom breakdown for trussed towers
        html += `<div id="truss-tower-breakdown" class="mt-6 report-section-copyable">
                    <h3 class="report-header">2. Trussed Tower Calculation Breakdown</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Calculations are based on the tower's centroid height (h/2).</p>
                    <div class="calc-breakdown">
                        <p><b>Height to Tower Centroid (z):</b> ${safeToFixed(inputs.tower_height / 2, 2)} ${h_unit}</p>
                        <p><b>Velocity Pressure Exposure Coefficient (K<sub>z</sub>) at centroid:</b> ${safeToFixed(Kz_tower, 3)}</p>
                        <p><b>Velocity Pressure (q<sub>z</sub>) at centroid:</b> ${safeToFixed(qz_tower, 2)} ${p_unit}</p>
                        <p><b>Net Force Coefficient (C<sub>f</sub>):</b> ${safeToFixed(Cf, 3)} (from ${ref} for ε=${inputs.tower_solidity_ratio})</p>
                        <p><b>Formula:</b> p = q<sub>z</sub> &times; G &times; C<sub>f</sub> = ${safeToFixed(qz_tower, 2)} &times; ${inputs.gust_effect_factor_g} &times; ${safeToFixed(Cf, 3)}</p>
                        <p class="font-bold text-lg mt-2">Design Wind Pressure (p): ${safeToFixed(final_pressure, 2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">This pressure acts on the solid area of one face (A<sub>f</sub> = ε &times; w &times; h).</p>
                    </div>
                 </div>`;
        html += `</div>`; // Close main container
        resultsContainer.innerHTML = html;
        return;
    }

    // --- Special rendering path for Chimneys/Tanks ---
    if (is_chimney) {
        const { Cf, ref, pressure, pressure_asd, h_struct, Kz_struct, qz_struct } = chimney_results;
        const final_pressure = inputs.design_method === 'ASD' ? pressure_asd : pressure;
        html += renderDesignParameters(results.inputs, results.intermediate, units);
        // Custom breakdown for chimneys/tanks
        html += `<div id="chimney-breakdown" class="mt-6 report-section-copyable">
                    <h3 class="report-header">2. Chimney/Tank Calculation Breakdown</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Calculations are based on the structure's top height.</p>
                    <div class="calc-breakdown">
                        <p><b>Structure Height (h):</b> ${safeToFixed(h_struct, 2)} ${h_unit}</p>
                        <p><b>Velocity Pressure Exposure Coefficient (K<sub>z</sub>) at h:</b> ${safeToFixed(Kz_struct, 3)}</p>
                        <p><b>Velocity Pressure (q<sub>z</sub>) at h:</b> ${safeToFixed(qz_struct, 2)} ${p_unit}</p>
                        <p><b>Net Force Coefficient (C<sub>f</sub>):</b> ${safeToFixed(Cf, 3)} (from ${ref})</p>
                        <p><b>Formula:</b> p = q<sub>z</sub> &times; G &times; C<sub>f</sub> = ${safeToFixed(qz_struct, 2)} &times; ${inputs.gust_effect_factor_g} &times; ${safeToFixed(Cf, 3)}</p>
                        <p class="font-bold text-lg mt-2">Design Wind Pressure (p): ${safeToFixed(final_pressure, 2)} ${p_unit}</p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">This pressure acts on the projected area normal to the wind (A = D &times; h).</p>
                    </div>
                 </div>`;
        html += `</div>`; // Close main container
        resultsContainer.innerHTML = html;
        return;
    }

    // --- Special rendering path for Solid Signs ---
    if (is_solid_sign) {
        const { CN, ref, pressure, pressure_asd, h_sign, Kz_sign, qz_sign } = solid_sign_results;
        const final_pressure = inputs.design_method === 'ASD' ? pressure_asd : pressure;
        html += renderDesignParameters(results.inputs, results.intermediate, units);
        // Custom breakdown for solid signs
        html += `<div id="solid-sign-breakdown" class="mt-6 report-section-copyable">
                    <h3 class="report-header">2. Solid Sign Calculation Breakdown</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Calculations are based on the sign's centroid height.</p>
                    <div class="calc-breakdown">
                        <p><b>Height to Sign Centroid (z):</b> ${safeToFixed(inputs.clearance_z + inputs.sign_height_s / 2, 2)} ${h_unit}</p>
                        <p><b>Velocity Pressure Exposure Coefficient (K<sub>z</sub>) at centroid:</b> ${safeToFixed(Kz_sign, 3)}</p>
                        <p><b>Velocity Pressure (q<sub>z</sub>) at centroid:</b> ${safeToFixed(qz_sign, 2)} ${p_unit}</p>
                        <p><b>Net Pressure Coefficient (C<sub>N</sub>):</b> ${safeToFixed(CN, 3)} (from ${ref})</p>
                        <p><b>Formula:</b> p = q<sub>z</sub> &times; G &times; C<sub>N</sub> = ${safeToFixed(qz_sign, 2)} &times; ${inputs.gust_effect_factor_g} &times; ${safeToFixed(CN, 3)}</p>
                        <p class="font-bold text-lg mt-2">Design Wind Pressure (p): ${safeToFixed(final_pressure, 2)} ${p_unit}</p>
                    </div>
                 </div>`;
        html += `</div>`; // Close main container
        resultsContainer.innerHTML = html;
        return;
    }
    // --- Special rendering path for Open Signs ---
    if (is_open_sign) {
        const { Cf, ref, pressure, pressure_asd } = open_sign_results;
        const final_pressure = inputs.design_method === 'ASD' ? pressure_asd : pressure;
        html += renderDesignParameters(results.inputs, results.intermediate, units);
        html += renderCalculationBreakdown(results, units);
        html += `<div id="open-sign-section" class="mt-6 report-section-copyable">
                    <h3 class="report-header">3. Open Sign Force Calculation</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">The design wind pressure below should be multiplied by the solid area of the sign (A<sub>s</sub>) to get the total design force (F).</p>
                    <div class="calc-breakdown">
                        <p><b>Formula:</b> p = q<sub>z</sub> &times; G &times; C<sub>f</sub></p>
                        <p><b>Net Force Coefficient (C<sub>f</sub>):</b> ${safeToFixed(Cf, 3)} (from ${ref} for ε=${inputs.solidity_ratio})</p>
                        <p><b>Design Wind Pressure (p):</b> ${safeToFixed(final_pressure, 2)} ${p_unit}</p>
                    </div>
                 </div>`;
        html += `</div>`; // Close main container
        resultsContainer.innerHTML = html;
        return; // End rendering for open signs
    }

    // --- Special rendering path for Envelope Procedure ---
    if (results.envelope_results && results.envelope_results.applicable) {
        html += renderDesignParameters(results.inputs, results.intermediate, units);
        html += renderCalculationBreakdown(results, units);
        const { pressures, ref } = results.envelope_results;
        html += `<div id="envelope-section" class="mt-6 report-section-copyable">
                    <h3 class="report-header">3. MWFRS Pressures (Envelope Procedure)</h3>
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">Calculations based on ${ref}. Pressures are net pressures, p = qh * (GCpf - GCpi).</p>
                    <table class="w-full mt-4 border-collapse">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th>Zone</th>
                                <th>(GCpf)</th>
                                <th>Net Pressure (${inputs.design_method}) [${p_unit}]</th>
                                <th>Net Uplift (${inputs.design_method}) [${p_unit}]</th>
                            </tr>
                        </thead>
                        <tbody class="dark:text-gray-300 text-center">`;
        for (const [zone, data] of Object.entries(pressures)) {
            if (zone.includes('Uplift')) continue; // Skip uplift-only entries, they are combined
            const uplift_data = pressures[`${zone} (Uplift)`] || {};
            const p_net_final = inputs.design_method === 'ASD' ? data.p_net * 0.6 : data.p_net;
            const p_net_uplift_final = inputs.design_method === 'ASD' ? uplift_data.p_net_uplift * 0.6 : uplift_data.p_net_uplift;
            html += `<tr>
                        <td>${zone}</td>
                        <td>${safeToFixed(data.gcpf, 2)} / ${safeToFixed(uplift_data.gcpf, 2)}</td>
                        <td>${safeToFixed(p_net_final, 2)}</td>
                        <td>${safeToFixed(p_net_uplift_final, 2)}</td>
                     </tr>`;
        }
        html += `</tbody></table></div>`;
        html += `</div>`; // Close main container
        resultsContainer.innerHTML = html;
        return;
    }

    // --- Assemble Report Sections for Buildings ---
    html += renderDesignParameters(results.inputs, results.intermediate, units);
    html += renderCalculationBreakdown(results, units);

    // --- Handle Open Buildings as a special case ---
    // Handle both low-rise (open_roof) and high-rise (rooftop_structure) open buildings
    const openBuildingData = directional_results.open_roof 
        ? directional_results.open_roof 
        : (directional_results.rooftop_structure ? directional_results : null);
    const openBuildingHtml = openBuildingData 
        ? renderOpenBuildingResults(openBuildingData, open_building_ref, inputs, units) 
        : '<p class="text-center text-red-500">Could not calculate open building pressures for the given roof type.</p>';
    if (inputs.enclosure_classification === 'Open') {
        html += `<div id="mwfrs-section" class="report-section-copyable">${openBuildingHtml}</div>`;
    } else {
        // --- Standard Enclosed/Partially Enclosed Building Sections ---
        if (directional_results.perp_to_L && directional_results.perp_to_B) {
            html += renderMwfrsSection(directional_results, inputs, intermediate, mwfrs_method, units);
            const leeward_pressure_L = directional_results.perp_to_L.find(r => r.surface.includes("Leeward"))?.p_pos || 0;
            html += renderHeightVaryingTable(heightVaryingResults_L, leeward_pressure_L, inputs, units);
        }
        html += renderTorsionalCase(torsional_case, inputs, units);
        html += renderCandCSection(candc, inputs, intermediate, units);
        html += renderParapetSection(parapet_results, inputs, units);
        html += renderOverhangSection(overhang_results, inputs, units);
        html += renderRooftopEquipmentSection(rooftop_results, inputs, intermediate, units);
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