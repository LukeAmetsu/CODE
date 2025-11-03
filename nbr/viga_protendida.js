console.log("viga_protendida.js loaded");
/**
 * @file viga_protendida.js
 * @description NBR 6118 Prestressed Concrete Beam Checker with Detailed, Step-by-Step Prestressing Loss Calculations.
 * Translates the logic and calculation memory from the provided PDF into a web application.
 */

// Helper function to prevent rapid-firing of events
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
 * Manages gathering all user inputs from the DOM.
 */
const inputManager = {
    /** List of standard input element IDs to gather. */
    inputIds: [
        'design_code', 'unit_system', 'fck', 'age_at_prestress', 'Ap', 'Kperdas',
        'load_pp', 'load_perm', 'load_var', 'beam_length', 'beam_height', 'beam_coords', 'Ep',
        'humidity', 'fptk', 'mu', 'k', 'anchorage_slip', 'exposed_perimeter',
        'cement_s_factor', 'cement_alpha_factor'
    ],

    /**
     * Parses a multiline string of coordinates into an array of [x, y] pairs.
     * @param {string} text - The string from the textarea.
     * @returns {Array<[number, number]>} An array of vertex coordinates.
     */
    _parseVertices(text) {
        if (!text) return [];
        return text.split('\n')
            .map(line => line.trim().split(/[,; ]+/).map(Number))
            .filter(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]));
    },

    /**
     * Gathers the cable path data from the dynamic form rows.
     * @returns {Array<object>} An array of cable path point objects.
     */
    _gatherCablePath() {
        const container = document.getElementById('cable-path-container');
        if (!container) return [];
        const rows = Array.from(container.querySelectorAll('.cable-path-row'));
        return rows.map((row, index) => ({
            x: parseFloat(row.querySelector('.cable-x').value) || 0,
            y: parseFloat(row.querySelector('.cable-y').value) || 0,
            'type': index < rows.length - 1 ? row.querySelector('.cable-type').value : 'Straight'
        }));
    },

    /**
     * Gathers the individual cable definitions from the dynamic form rows.
     * @returns {Array<object>} An array of cable definition objects.
     */
    _gatherCableDefinitions() {
        const container = document.getElementById('cables-definition-container');
        if (!container) return [];
        return Array.from(container.querySelectorAll('.cable-definition-row')).map(row => ({
            num_strands: parseInt(row.querySelector('.cable-num-strands').value, 10) || 0,
            jacking_side: row.querySelector('.cable-jacking-side').value,
            sequence: parseInt(row.querySelector('.cable-sequence').value, 10) || 0,
        }));
    }
};

const concreteBeamCalculator = (() => {
    /**
     * Calculates the complete geometric properties of a non-self-intersecting polygon.
     * @param {Array<[number, number]>} vertices - An array of [x, y] coordinates in cm.
     * @returns {object|null} A dictionary containing the calculated properties or null if invalid.
     */
    function calculateSectionProperties(vertices) {
        if (!vertices || vertices.length < 3) return null;

        const points = [...vertices, vertices[0]];
        let A = 0.0,
            Qx = 0.0,
            Qy = 0.0,
            Ix = 0.0,
            Iy = 0.0;

        for (let i = 0; i < vertices.length; i++) {
            const [x0, y0] = points[i];
            const [x1, y1] = points[i + 1];
            const term = (x0 * y1) - (x1 * y0);

            A += term;
            Qy += (y0 + y1) * term; // about x-axis
            Qx += (x0 + x1) * term; // about y-axis
            Ix += (y0 ** 2 + y0 * y1 + y1 ** 2) * term; // about x-axis
            Iy += (x0 ** 2 + x0 * x1 + x1 ** 2) * term; // about y-axis
        }

        A /= 2.0;
        if (Math.abs(A) < 1e-6) return null;

        const cx = Qx / (6.0 * A);
        const cy = Qy / (6.0 * A);

        const I_origin_x = Ix / 12.0;
        const I_origin_y = Iy / 12.0;

        const I_cx = I_origin_x - A * cy ** 2;
        const I_cy = I_origin_y - A * cx ** 2;

        const y_min = Math.min(...vertices.map(p => p[1]));
        const y_max = Math.max(...vertices.map(p => p[1]));
        const yi = cy - y_min;
        const ys = y_max - cy;

        const Wi = Math.abs(yi) > 1e-6 ? Math.abs(I_cx) / Math.abs(yi) : Infinity;
        const Ws = Math.abs(ys) > 1e-6 ? Math.abs(I_cx) / Math.abs(ys) : Infinity;
        const ki = Math.abs(yi) > 1e-6 ? Math.abs(Ws) / Math.abs(A) : Infinity;
        const ks = Math.abs(ys) > 1e-6 ? Math.abs(Wi) / Math.abs(A) : Infinity;

        return {
            area: Math.abs(A),
            centroid: { x: cx, y: cy },
            Q: { x: Math.abs(Qx / 6), y: Math.abs(Qy / 6) },
            I: { cx: Math.abs(I_cx), cy: Math.abs(I_cy) },
            r: { x: Math.sqrt(Math.abs(I_cx) / Math.abs(A)), y: Math.sqrt(Math.abs(I_cy) / Math.abs(A)) }, // Radius of gyration
            W: { i: Wi, s: Ws },
            height: y_max - y_min,
            yi,
            ys,
            y_min,
            y_max,
            ki, ks
        };
    }

    /**
     * Solves for a parabola y = ax^2 + bx + c given a start point and the vertex.
     * @param {[number, number]} p_start - The start point [x, y].
     * @param {[number, number]} p_vertex - The vertex point [x, y].
     * @returns {{a: number, b: number, c: number}|null}
     */
    function solveParabolaWithVertex(p_start, p_vertex) {
        const [x_start, y_start] = p_start;
        const [x_v, y_v] = p_vertex;

        if (Math.abs(x_start - x_v) < 1e-6) return null;

        const a = (y_start - y_v) / (x_start - x_v) ** 2;
        const b = -2 * a * x_v;
        const c = y_v + a * x_v ** 2;
        return { a, b, c };
    }
   
    function calculateShrinkageLoss(props, humidity, age_at_loading, E_p, exposed_perimeter_m) {
        const Ac_cm2 = props.area;
        const U = humidity;
        const t0 = age_at_loading;

        const u_ar_cm = exposed_perimeter_m * 100;
        const h0_cm = u_ar_cm > 0 ? (2 * Ac_cm2) / u_ar_cm : 0;

        const gamma = 1 + Math.exp(-7.8 + 0.1 * U);
       
        const h_fic_cm = gamma * h0_cm;

        const epsilon_1s = -8.09 + U/15 - U**2 / 2284 - U**3/133765 + U**4/7608150;
        const epsilon_2s = (33 + 2 * h_fic_cm) / (20.8 + 3 * h_fic_cm);
        const h_aux = h_fic_cm / 100;
       
        const A_cs = 40;
        const B_cs = 116 * h_aux**3 - 282 * h_aux**2 + 220 * h_aux - 4.8;
        const C_cs = 2.5 * h_aux**3 - 8.8 * h_aux + 40.7;
        const D_cs = -75 * h_aux**3 + 585 * h_aux**2 + 496 * h_aux - 6.8;
        const E_cs = -169 * h_aux**4 + 88 * h_aux**3 + 584 * h_aux**2 - 39 * h_aux + 0.8;

        const t_ratio = t0 / 100;
        const beta_s_t0 = ( t_ratio**3 + A_cs * t_ratio**2 + B_cs * t_ratio) / 
                            (t_ratio**3 + C_cs * t_ratio**2 + D_cs * t_ratio + E_cs);

        const epsilon_cs = (epsilon_1s * epsilon_2s * (1 - beta_s_t0)) / 10000;
       
        const delta_sigma_cs = epsilon_cs * E_p; // This is already correct

        return { value: delta_sigma_cs, calc: `ε_cs (${(epsilon_cs * 10000).toFixed(3)}e-4) * E_p (${E_p.toFixed(0)})`, intermediate: { h0_cm, gamma, h_fic_cm, epsilon_1s, epsilon_2s, A_cs, B_cs, C_cs, D_cs, E_cs, beta_s_t0, epsilon_cs } };
    }

    function calculateCreepCoefficient(fck, humidity, age_at_loading, h_fic_cm, s_factor, alpha_factor) {
        const U = humidity;
        const t0 = age_at_loading;
        const t_0c = alpha_factor * t0;

        const phi_a = 0.8 * (1 - Math.exp(-s_factor * Math.sqrt(28 / t_0c)));
        const phi_1c = 4.45 - 0.035 * U;
        const phi_2c = (42 + h_fic_cm) / (20 + h_fic_cm);
        const h_aux = h_fic_cm / 100;

        const A_cc = 42 * h_aux**3 - 350 * h_aux**2 + 588 * h_aux + 113;
        const B_cc = 768 * h_aux**3 - 3060 * h_aux**2 + 3234 * h_aux - 23;
        const C_cc = -200 * h_aux**3 + 13 * h_aux**2 + 1090 * h_aux + 183;
        const D_cc = 7579 * h_aux**3 - 31916 * h_aux**2 + 35343 * h_aux + 1931;

        const beta_c_t0 = (t_0c**2 + A_cc * t_0c + B_cc) / (t_0c**2 + C_cc * t_0c + D_cc);
       
        const phi_f = phi_1c * phi_2c * (1 - beta_c_t0);
        const phi_d = 0.4; // Drying creep component
        const phi_total = phi_a + phi_f + phi_d;

        return {
            value: phi_total,
            intermediate: { t_0c, phi_a, phi_1c, phi_2c, A_cc, B_cc, C_cc, D_cc, beta_c_t0, phi_f, phi_d, phi_total }
        };
    }

    /**
     * Solves for the required prestressing force P based on a stress limit.
     * @param {number} sigma_limit - The stress limit [MPa].
     * @param {number} W - The section modulus (with sign) [m³].
     * @param {number} M - The bending moment [MN·m].
     * @param {number} A - The cross-section area [m²].
     * @param {number} e - The eccentricity [m].
     * @returns {object} The required force P [MN] and calculation breakdown.
     */
    function solveForPrestressForce(sigma_limit, W, M, A, e, k_perdas = 1.0) {
        const P_inf_numerador = M - sigma_limit * W;
        const P_inf_denominador = e - W / A;
        const calc_string = `(${M.toFixed(4)} - ${sigma_limit.toFixed(2)}*${W.toFixed(4)}) / (${e.toFixed(4)} - ${W.toFixed(4)}/${A.toFixed(4)})`;

        if (Math.abs(P_inf_denominador) < 1e-9) {
            return { value: NaN, calc: "Error: Division by zero." };
        }
        const P_inf = P_inf_numerador / P_inf_denominador;
        const P_i_equivalente = P_inf / k_perdas;

        return { value: P_i_equivalente, calc: calc_string };
    }

    /**
     * Linear interpolation between two points.
     * This version finds the correct segment in a dataset before interpolating.
     */
    function interpolate(x_pos, xs, ys) {
        if (!xs || xs.length === 0) return 0;

        if (x_pos <= xs[0]) return ys[0];
        if (x_pos >= xs[xs.length - 1]) return ys[ys.length - 1];

        for (let i = 1; i < xs.length; i++) {
            const x0 = xs[i - 1];
            const x1 = xs[i];

            if (x_pos >= x0 && x_pos <= x1) {
                const y0 = ys[i - 1];
                const y1 = ys[i];
                if (Math.abs(x1 - x0) < 1e-6) return y0; // Avoid division by zero
                const t = (x_pos - x0) / (x1 - x0);
                return y0 + t * (y1 - y0);
            }
        }
        return ys[ys.length - 1]; // Fallback
    }

    /**
     * Calculates concrete and steel material properties based on NBR 6118.
     * @param {object} inputs - Object containing fck and age_at_prestress.
     * @returns {object} An object with all calculated material properties and limits.
     */
    function calculateMaterialProperties({ fck, age_at_prestress, Ep }) {
        const fcm = fck <= 50 ? fck + 8 : 1.1 * fck;
        const s_beta = 0.20;
        const beta1 = Math.exp(s_beta * (1 - Math.pow(28 / age_at_prestress, 0.5)));
        const fci = beta1 * fcm;
        const fctm = fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + 0.11 * fck);
        const fctk_inf = 0.7 * fctm;
        const fctf = 1.2 * fctk_inf;
        const E_ci = 5600 * Math.sqrt(fck);
        const E_p = Ep;
        const alpha_p = E_p / E_ci;

        const comp_limit_i = (fci <= 50 ? 0.7 : 0.7 * (1 - (fci - 50) / 200)) * fci;
        const tens_limit_i = 1.2 * fctm;
        const comp_limit_s = 0.45 * fck;
        const tens_limit_s = fctf;

        return {
            fctm, fctk_inf, fctf, fci, E_ci, E_p, alpha_p,
            limits: { comp_i: comp_limit_i, tens_i: tens_limit_i, comp_s: comp_limit_s, tens_s: tens_limit_s }
        };
    }

    /**
     * Calculates service loads and corresponding bending moments.
     * @param {object} inputs - Object containing load_pp, load_perm, load_var, and beam_length.
     * @returns {object} An object with calculated loads and moments.
     */
    function calculateLoadsAndMoments({ load_pp, load_perm, load_var, beam_length }) {
        const g_k = load_pp + load_perm;
        const p_CQP = g_k + 0.3 * load_var;
        const p_CF = g_k + 0.4 * load_var;
        const M_g1k = (load_pp * beam_length ** 2) / 8;
        const M_gk = (g_k * beam_length ** 2) / 8;
        const M_CQP = (p_CQP * beam_length ** 2) / 8;
        const M_CF = (p_CF * beam_length ** 2) / 8;

        return {
            loads: { g_k, p_CQP, p_CF },
            moments: { M_g1k, M_gk, M_CQP, M_CF }
        };
    }

    /**
     * Performs initial prestress checks to determine the valid force range.
     * @param {object} params - An object containing all necessary parameters.
     * @returns {object} An object with the results of the prestress checks.
     */
    function performInitialPrestressChecks({ fptk, Ap_total_m2, ecc_mid, materials, moments, A_m2, Ws_m3, Wi_m3, Kperdas }) {
        const sigma_pi = 0.74 * fptk; // Tensão inicial de protensão
        const P_i = Ap_total_m2 * sigma_pi; // MN

        // Checks at prestressing time (k_perdas = 1.0)
        const P_max_comp_i_res = solveForPrestressForce(-materials.limits.comp_i, -Ws_m3, moments.M_g1k / 1000, A_m2, ecc_mid, 1.0);
        const P_min_tens_i_res = solveForPrestressForce(materials.limits.tens_i, Wi_m3, moments.M_g1k / 1000, A_m2, ecc_mid, 1.0);

        // Checks in service (uses k_perdas to convert P_inf to equivalent P_i)
        const P_min_comp_s_res = solveForPrestressForce(-materials.limits.comp_s, -Ws_m3, moments.M_CQP / 1000, A_m2, ecc_mid, Kperdas);
        const P_max_tens_s_res = solveForPrestressForce(materials.limits.tens_s, Wi_m3, moments.M_CF / 1000, A_m2, ecc_mid, Kperdas);

        return {
            P_i, sigma_pi,
            P_max_comp_i: P_max_comp_i_res,
            P_min_tens_i: P_min_tens_i_res,
            P_min_comp_s: P_min_comp_s_res,
            P_max_tens_s: P_max_tens_s_res,
        };
    }

    /**
     * Calculates an initial estimate for the required prestressing force.
     * @param {object} params - An object containing all necessary parameters.
     * @returns {object} An object with the results of the estimation.
     */
    function calculateInitialPrestressEstimate({ moments, materials, props, Kperdas, cable_definitions, ecc_mid, Ap, fptk }) {
        const Ap_single_cm2 = parseFloat(Ap) || 0;
        const P_strand_kN = (Ap_single_cm2 * 0.74 * fptk) / 10;
        const M_aux_kNm = Math.max(moments.M_CF - (props.W.i / 1e6) * materials.fctf * 1000, moments.M_CQP);
        const ks_m = props.ks / 100; // convert cm to m
        const denominator = ks_m + ecc_mid;
        const num_cables = cable_definitions.length;
        let P_est_i = 0;
        if (Math.abs(denominator) > 1e-9) {
            P_est_i = (M_aux_kNm) / denominator; // This is in kN
        }
        const Pest_perdas = Kperdas > 0 ? P_est_i / Kperdas : 0; // Total force required before losses
        const num_strands_per_cable = (P_strand_kN > 0 && num_cables > 0) ? Math.ceil(Pest_perdas / (P_strand_kN * num_cables)) : 0;

        return {
            M_aux_kNm,
            ks_m,
            P_est_i,
            Pest_perdas,
            num_strands_per_cable,
            P_cable: P_strand_kN
        };
    }
   
    /**
     * Main calculation function, updated to follow the PDF logic.
     * @param {object} inputs - The gathered user inputs.
     * @returns {object} The results of the calculation.
     */
    function run(raw_inputs) {
        console.group('--- Prestressed Beam Calculation ---');
        console.log('1. Raw Inputs:', JSON.parse(JSON.stringify(raw_inputs)));

        const inputs = { ...raw_inputs }; // Make a mutable copy

        const { vertices, fck, beam_length, cable_path, Ap, cable_definitions } = inputs;

        // --- 1. Calculate Total Steel Area from DIRECT INPUTS ---
        const Ap_single_cm2 = parseFloat(Ap) || 0;
        const total_strands = cable_definitions.reduce((sum, cable) => sum + cable.num_strands, 0);
        const Ap_total_cm2 = Ap_single_cm2 * total_strands;
        const Ap_total_m2 = Ap_total_cm2 / 1e4;
        console.log(`1a. Total Steel Area (Ap): ${Ap_total_cm2.toFixed(2)} cm²`);


        // --- 2. Validate Inputs & Section Properties ---
        if (!vertices || vertices.length < 3 || fck <= 0 || beam_length <= 0 || Ap_total_cm2 <= 0 || cable_definitions.length === 0) {
            console.error("Validation failed. Check inputs.");
            console.groupEnd();
            return { errors: ["Invalid inputs. Ensure all values (fck, length, Ap, N_cables) are positive and vertices are sufficient."] };
        }
        const props = calculateSectionProperties(vertices);
        if (!props) {
            console.error("Section properties calculation failed.");
            console.groupEnd();
            return { errors: ["Invalid beam cross-section vertices."] };
        }
        console.log('2. Section Properties:', JSON.parse(JSON.stringify(props)));
        const A_m2 = props.area / 1e4; // Ac
        const Wi_m3 = props.W.i / 1e6;
        const Ws_m3 = props.W.s / 1e6;
        const I_cx_m4 = props.I.cx / 1e8;

        // --- 3. Material Properties (NBR 6118 & PDF) ---
        const materials = calculateMaterialProperties(inputs);
        console.log('3. Material Properties:', JSON.parse(JSON.stringify(materials)));


        // --- 4. Loads & Moments ---
        const { loads, moments } = calculateLoadsAndMoments(inputs);
        console.log('4. Loads & Moments:', { loads, moments });


        // --- 5. Define Cable Path & Key Points ---
        console.group('--- Cable Path & Losses ---');
        const y_cg = props.centroid.y / 100; // in m
        const y_min_beam_m = Math.min(...vertices.map(p => p[1])) / 100;

        const preliminary_key_points = [...new Set(cable_path.map(p => p.x))].sort((a,b) => a-b);
        const x_a_result = calculateAnchorageSlipDistance(inputs, materials, preliminary_key_points, cable_path.map(p => ({ ...p, y: p.y + y_min_beam_m })));
        console.log('5a. Anchorage Slip Distance (x_a):', x_a_result.x_a);


        const cable_path_abs = cable_path.map(p => ({ ...p, y: p.y + y_min_beam_m }));
        let base_key_points = [...new Set([...preliminary_key_points, 0, beam_length, beam_length / 2, x_a_result.x_a])];

        const all_points = new Set(base_key_points);
        const min_segment_length = beam_length / 20;
        base_key_points.sort((a, b) => a - b);
        for (let i = 0; i < base_key_points.length - 1; i++) {
            const start = base_key_points[i];
            const end = base_key_points[i + 1];
            const segment_length = end - start;
            if (segment_length > min_segment_length) {
                const num_subdivisions = Math.ceil(segment_length / min_segment_length);
                for (let j = 1; j < num_subdivisions; j++) {
                    all_points.add(start + j * (segment_length / num_subdivisions));
                }
            }
        }

        const final_key_points = Array.from(all_points).sort((a, b) => a - b);
        const path_details = final_key_points.map(x => {
            const y = getCablePositionAt(x, cable_path_abs, beam_length);
            const e = y_cg - y;
            return { x, y, e };
        });
        console.log('5b. Final Key Points for Analysis:', final_key_points.length);


        // --- 6. Initial Prestress and Stress Limit Checks (at mid-span) ---
        const mid_span_details = path_details.find(p => Math.abs(p.x - beam_length / 2) < 1e-9) || path_details[Math.floor(path_details.length/2)];
        const ecc_mid = mid_span_details.e;
        const prestress_checks = performInitialPrestressChecks({ ...inputs, Ap_total_m2, ecc_mid, materials, moments, A_m2, Ws_m3, Wi_m3 });
        console.log('6. Initial Prestress Checks (P_i):', prestress_checks);


        // --- 7. Detailed Prestress Loss Calculation ---
        const loss_results = calculateSequentialLosses(inputs, props, materials, path_details, moments, prestress_checks.sigma_pi, cable_path_abs);
        console.log('7. Detailed Loss Calculation Results:', loss_results);
        console.groupEnd(); // End Cable Path & Losses


        // --- 8. Final Stress Profiles ---
        const P_eff_mid_val_result = loss_results.sigma_p_inf.find(p=>p.x === beam_length/2);
        const P_eff_mid = P_eff_mid_val_result ? (P_eff_mid_val_result.value * Ap_total_m2) : 0;

        const stress_profiles = {
            initial: {
                top: (-prestress_checks.P_i / A_m2) + (prestress_checks.P_i * ecc_mid / Ws_m3) - (moments.M_g1k / 1000 / Ws_m3), // Momento positivo traciona em cima
                bottom: (-prestress_checks.P_i / A_m2) - (prestress_checks.P_i * ecc_mid / Wi_m3) + (moments.M_g1k / 1000 / Wi_m3) // Momento positivo comprime embaixo
            },
             final: {
                 top: (-P_eff_mid / A_m2) + (P_eff_mid * ecc_mid / Ws_m3) - (moments.M_CQP / 1000 / Ws_m3), // Momento positivo traciona em cima
                 bottom: (-P_eff_mid / A_m2) - (P_eff_mid * ecc_mid / Wi_m3) + (moments.M_CF / 1000 / Wi_m3) // Momento positivo comprime embaixo
             }
         };
        console.log('8. Final Stress Profiles (Mid-span):', stress_profiles);


        // --- 9. Serviceability Limit State (SLS) Stress Checks ---
        const sls_checks = performSlsChecks(stress_profiles, materials);
        console.log('9. SLS Checks:', sls_checks);


        // --- 9. Ultimate Limit State (ULS/ELU) Checks ---
        const uls_checks = performUlsChecks(inputs, props, loss_results, Ap_total_m2);
        console.log('9a. ULS Checks:', uls_checks);

        
        // --- 10. Preliminary Prestress Estimation (for reporting only) ---
        const prestress_estimation = calculateInitialPrestressEstimate({ ...inputs, moments, materials, props, ecc_mid, cable_definitions });

        const final_results = {
            checks: {
                properties: props,
                materials,
                loads: { pp: inputs.load_pp, perm: inputs.load_perm, var: inputs.load_var, ...loads },
                moments,
                path_details,
                prestress_checks,
                prestress_estimation, // For reporting
                loss_results,
                stress_profiles,
                sls_checks,
                uls_checks
            },
            inputs
        };

        console.log('10. Final Results Object:', JSON.parse(JSON.stringify(final_results)));
        console.groupEnd();
        return final_results;
    }

    /**
     * Calculates only the anchorage slip distance (x_a).
     * This is a preliminary step to determine all key points for the full analysis.
     * @param {object} inputs - User inputs.
     * @param {object} materials - Material properties.
     * @param {Array<number>} preliminary_key_points - Initial points from user input.
     * @param {Array<object>} cable_path_abs - Absolute cable path.
     * @returns {object} Containing x_a and other intermediate anchorage calculation results.
     */
    function calculateAnchorageSlipDistance(inputs, materials, preliminary_key_points, cable_path_abs) {
        const { beam_length, mu, k, anchorage_slip, fptk, Ep: Ep_input } = inputs;
        const { E_p } = materials;
        const sigma_pi = 0.74 * fptk;

        const sigma_p_friction_prelim = preliminary_key_points.map(x => {
            const angle_at_start = getTangentAngleAt(0, cable_path_abs, beam_length);
            const current_angle = getTangentAngleAt(x, cable_path_abs, beam_length);
            const cumulative_alpha = Math.abs(current_angle - angle_at_start);
            const value = sigma_pi * Math.exp(-(mu * cumulative_alpha + k * x));
            return { x, value };
        });

        const delta = anchorage_slip;
        const A_delta = E_p * (delta / 1000);
        const betas = [];
        const areas = [];

        let cumulative_area = 0;
        let x_a = 0;
        const x_0 = sigma_p_friction_prelim.length ? sigma_p_friction_prelim[0].x : 0;

        for (let i = 1; i < sigma_p_friction_prelim.length; i++) {
            const p_i = sigma_p_friction_prelim[i];
            const p_i_minus_1 = sigma_p_friction_prelim[i - 1];
            const dx_i = p_i.x - p_i_minus_1.x;
            if (dx_i < 1e-9) continue;

            const beta_i = (p_i_minus_1.value - p_i.value) / dx_i;
            betas.push({ from: p_i_minus_1.x, to: p_i.x, value: beta_i });
            let area_increment;
            if (i === 1) {
                area_increment = beta_i * dx_i * dx_i;
            } else {
                const x_prev_dist_from_start = p_i_minus_1.x - x_0;
                area_increment = beta_i * dx_i * dx_i + 2 * beta_i * dx_i * x_prev_dist_from_start;
            }
            areas.push({ from: p_i_minus_1.x, to: p_i.x, increment: area_increment, cumulative: cumulative_area + area_increment });

            const next_cumulative_area = cumulative_area + area_increment;

            if (next_cumulative_area >= A_delta) {
                const remaining_area_needed = A_delta - cumulative_area;
                const x_prev_dist_from_start = p_i_minus_1.x - x_0;
                const a = beta_i;
                const b = 2 * beta_i * x_prev_dist_from_start;
                const c = -remaining_area_needed;
                const discriminant = b * b - 4 * a * c;

                if (discriminant >= 0 && Math.abs(a) > 1e-12) {
                    let dx_a = (-b + Math.sqrt(discriminant)) / (2 * a);
                    x_a = p_i_minus_1.x + dx_a;
                } else {
                    x_a = p_i_minus_1.x;
                }
                break;
            }
            cumulative_area = next_cumulative_area;
        }
        if (x_a === 0 && A_delta > 0) x_a = beam_length;

        const sigma_pa = interpolate(x_a, sigma_p_friction_prelim.map(p => p.x), sigma_p_friction_prelim.map(p => p.value));
        return { x_a, sigma_pa, A_delta, delta, betas, areas };
    }
   
    /**
     * Calculates detailed prestress losses.
     * This is the core of the loss analysis.
     */
    function calculateDetailedLosses(inputs, props, materials, path_details, moments, sigma_pi, cable_path_abs, Ap_total_m2, x_a_result) {
        const { beam_length, mu, k, anchorage_slip, fptk, load_pp, load_perm } = inputs;
        const { E_p, alpha_p } = materials;
        const A_m2 = props.area / 1e4;
        const I_cx_m4 = props.I.cx / 1e8;

        const detailed_calcs = {
            friction: [],
            anchorage: {betas: [], areas: []},
            elastic_shortening: [],
            relaxation: [],
            shrinkage: {},
            creep: [],
            interaction: []
        };

        const angle_at_start = getTangentAngleAt(0, cable_path_abs, beam_length);
        const sigma_p_friction = path_details.map((point) => {
            const current_angle = getTangentAngleAt(point.x, cable_path_abs, beam_length);
            const cumulative_alpha = Math.abs(current_angle - angle_at_start);
            const value = sigma_pi * Math.exp(-(mu * cumulative_alpha + k * point.x));
            const calc = `${sigma_pi.toFixed(1)} * exp(-(${mu} * ${cumulative_alpha.toFixed(4)} + ${k} * ${point.x}))`;
            detailed_calcs.friction.push({ x: point.x, value, calc });
            return { x: point.x, value };
        });

        const { x_a, sigma_pa, A_delta, delta } = x_a_result;
        detailed_calcs.anchorage = { ...x_a_result }; // Copy all results from the preliminary calc
        detailed_calcs.anchorage.A_delta = { value: A_delta, calc: `${E_p.toFixed(0)} * (${delta} / 1000)` };

        const sigma_p_anchorage = sigma_p_friction.map(p => ({ x: p.x, value: p.x < x_a ? (2 * sigma_pa - p.value) : p.value }));
        detailed_calcs.anchorage.sigma_prime = sigma_p_anchorage.map((p, i) => {
            const original_sigma = sigma_p_friction[i].value;
            return {
                x: p.x,
                value: p.value,
                calc: p.x < x_a ? `2*${sigma_pa.toFixed(1)} - ${original_sigma.toFixed(1)}` : original_sigma.toFixed(1)
            };
        });

        const n_cabos = parseFloat(inputs.num_cables);
        const factor_ee = (n_cabos > 1) ? (n_cabos - 1) / (2 * n_cabos) : 0;

        const delta_sigma_ee = path_details.map((p, i) => {
            const x = p.x;
            const e_p = p.e;
            const M_g1k_x = (inputs.load_pp * x * (beam_length - x)) / 2;

            const sigma_p_prime = sigma_p_anchorage[i].value;
            
            const term1 = (sigma_p_prime * Ap_total_m2 / A_m2) * (1 + (e_p ** 2 * A_m2) / I_cx_m4); // Compression is positive
            const term2 = -((M_g1k_x / 1000) * e_p) / I_cx_m4; // Tension (from M+) is negative
            const sigma_c_p = term1 + term2;

            const value = alpha_p * sigma_c_p * factor_ee;
           
            const calc = `${alpha_p.toFixed(2)} * [(${sigma_p_prime.toFixed(1)}*${Ap_total_m2.toFixed(4)}/${A_m2.toFixed(4)})*(1+${(e_p**2*A_m2/I_cx_m4).toFixed(3)}) - ${term2.toFixed(3)}] * ${factor_ee.toFixed(2)}`;
            detailed_calcs.elastic_shortening.push({ x, value, calc });
            return { x, value };
        });

        const sigma_p_ime = sigma_p_anchorage.map((p, i) => ({ x: p.x, value: p.value - delta_sigma_ee[i].value }));

        const delta_sigma_r = sigma_p_ime.map(p => {
            const zeta = p.value / fptk;
            const psi_1000 = (zeta >= 0.6 && zeta < 0.7) ? 0.025 - (0.025 - 0.013) * ((0.7 - zeta) / 0.1) : (zeta >= 0.7 ? 0.025 : (zeta >= 0.5 ? 0.013 : 0));
            const psi_inf = 2.5 * psi_1000;
            const chi_inf = -Math.log(1 - psi_inf);
            const value = chi_inf * p.value;
            const calc = `${chi_inf.toFixed(4)} * ${p.value.toFixed(1)}`;
            detailed_calcs.relaxation.push({ x: p.x, value, calc, zeta, psi_1000, psi_inf, chi_inf_raw: chi_inf });
            return { x: p.x, value, chi_inf_raw: chi_inf };
        });

        const shrinkage_results = calculateShrinkageLoss(
            props,
            inputs.humidity,
            inputs.age_at_prestress,
            E_p,
            inputs.exposed_perimeter
        );
        detailed_calcs.shrinkage = shrinkage_results;
        const delta_sigma_cs = shrinkage_results.value;
        const h_fic_cm = shrinkage_results.intermediate.h_fic_cm;

        const creep_coefficient_results = calculateCreepCoefficient(
            inputs.fck,
            inputs.humidity,
            inputs.age_at_prestress,
            h_fic_cm,
            inputs.cement_s_factor,
            inputs.cement_alpha_factor
        );
        detailed_calcs.creep_coefficient = creep_coefficient_results;
        const phi = creep_coefficient_results.value;

        const delta_sigma_cc = path_details.map((p, i) => {
            const M_gk_x = (load_pp + load_perm) * p.x * (beam_length - p.x) / 2;
            const P_ime_x = sigma_p_ime[i].value * Ap_total_m2;
            const sigma_c_p_perm = (P_ime_x / A_m2) + (P_ime_x * p.e * p.e / I_cx_m4);
            const sigma_c_m_perm = -(M_gk_x / 1000 * p.e / I_cx_m4);
            const sigma_c_perm = sigma_c_p_perm + sigma_c_m_perm;
            const value = alpha_p * sigma_c_perm * phi;
            const calc = `${alpha_p.toFixed(2)} * ${sigma_c_perm.toFixed(2)} * ${phi.toFixed(2)}`;
            detailed_calcs.creep.push({ x: p.x, value, calc, phi, sigma_c_perm, sigma_c_p_perm, sigma_c_m_perm, sigma_c_perm_calc: `(${sigma_c_p_perm.toFixed(2)} + ${sigma_c_m_perm.toFixed(2)})` });
            return { x: p.x, value, sigma_c_perm, sigma_c_perm_calc: `(${sigma_c_p_perm.toFixed(2)} + ${sigma_c_m_perm.toFixed(2)})` };
        });

        const rho_p = Ap_total_m2 / A_m2;
        const chi_c = 1 + 0.5 * phi;
        const delta_sigma_dif = path_details.map((p, i) => {
            const eta_p = p.e * p.e * A_m2 / I_cx_m4;
            const theta = 1 + delta_sigma_r[i].chi_inf_raw + chi_c * rho_p * eta_p * alpha_p;
            if (Math.abs(theta) < 1e-9) return { x: p.x, value: 0 };
            const numerator = delta_sigma_r[i].value - delta_sigma_cs + delta_sigma_cc[i].value;
            const value = numerator / theta;
            const calc = `(${delta_sigma_r[i].value.toFixed(1)} - (${delta_sigma_cs.toFixed(1)}) + ${delta_sigma_cc[i].value.toFixed(1)}) / ${theta.toFixed(3)}`;
            detailed_calcs.interaction.push({ x: p.x, value, calc, numerator, theta, chi_c, rho_p, eta_p, chi_inf: delta_sigma_r[i].chi_inf_raw });
            return { x: p.x, value };
        });

        const sigma_p_inf = sigma_p_ime.map((p, i) => ({ x: p.x, value: p.value - delta_sigma_dif[i].value }));

        return {
            key_points: path_details,
            sigma_p_friction,
            sigma_p_anchorage,
            sigma_p_ime,
            sigma_p_inf,
            detailed_calcs
        };
    }
    
    function getTangentAngleAt(x_pos, cable_path_abs, beam_length) {
        let eval_x = x_pos;
        const last_defined_x = cable_path_abs[cable_path_abs.length - 1].x;
        let sign_multiplier = 1.0;

        if (x_pos > last_defined_x && last_defined_x <= (beam_length / 2) + 1e-6) {
            eval_x = beam_length - x_pos;
            sign_multiplier = -1.0;
        }

        for (let i = 0; i < cable_path_abs.length - 1; i++) {
            const p1 = cable_path_abs[i];
            const p2 = cable_path_abs[i + 1];

            if (eval_x >= p1.x - 1e-9 && eval_x <= p2.x + 1e-9) {
                let slope;
                if (p1.type === 'Parabolic') {
                    let vertex = p1.y < p2.y ? p1 : p2;
                    let other_point = p1.y < p2.y ? p2 : p1;

                    if (Math.abs(p2.x - p1.x) < 1e-6) {
                        slope = 0;
                    } else {
                        const h = vertex.x;
                        const k = vertex.y;
                        const denominator = (other_point.x - h) ** 2;

                        if (Math.abs(denominator) < 1e-9) {
                            slope = 0;
                        } else {
                            const a = (other_point.y - k) / denominator;
                            slope = 2 * a * (eval_x - h);
                        }
                    }
                } else { // 'Straight'
                    if (Math.abs(p2.x - p1.x) < 1e-9) {
                        slope = 0;
                    } else {
                        slope = (p2.y - p1.y) / (p2.x - p1.x);
                    }
                }
                return Math.atan(slope * sign_multiplier);
            }
        }

        if (cable_path_abs.length >= 2) {
            const p1 = cable_path_abs[cable_path_abs.length - 2];
            const p2 = cable_path_abs[cable_path_abs.length - 1];
            if (p1.type === 'Straight') {
                if (Math.abs(p2.x - p1.x) < 1e-9) return 0;
                const slope = (p2.y - p1.y) / (p2.x - p1.x);
                return Math.atan(slope * sign_multiplier);
            }
        }
        return 0;
    }

    /**
     * Calculates the cable's y-coordinate at a given position 'x' along the beam.
     * @param {number} x_pos - The position along the beam length.
     * @param {Array<object>} cable_path_abs - The array of cable path points with absolute y-coordinates in meters and type.
     * @param {number} beam_length - Total beam length.
     * @returns {number} The calculated absolute y-coordinate at x_pos in meters.
     */
    function getCablePositionAt(x_pos, cable_path_abs, beam_length) {
        if (!cable_path_abs || cable_path_abs.length === 0) return 0;
        if (cable_path_abs.length === 1) return cable_path_abs[0].y;

        let eval_x = x_pos;
        const last_defined_x = cable_path_abs[cable_path_abs.length - 1].x;

        if (x_pos > last_defined_x && last_defined_x <= (beam_length / 2) + 1e-6) {
            eval_x = beam_length - x_pos;
        }

        for (let i = 0; i < cable_path_abs.length - 1; i++) {
            const p1 = cable_path_abs[i];
            const p2 = cable_path_abs[i + 1];

            if (eval_x >= p1.x - 1e-9 && eval_x <= p2.x + 1e-9) {
                if (p1.type === 'Parabolic') {
                    let vertex = p1.y < p2.y ? p1 : p2;
                    let other_point = p1.y < p2.y ? p2 : p1;
                    const h = vertex.x;
                    const k = vertex.y;
                    const denominator = (other_point.x - h) ** 2;
                    if (Math.abs(denominator) < 1e-9) return k;
                    const a = (other_point.y - k) / denominator;
                    
                    return a * (eval_x - h) ** 2 + k;

                } else {
                    return interpolate(eval_x, [p1.x, p2.x], [p1.y, p2.y]);
                }
            }
        }

        return cable_path_abs[cable_path_abs.length - 1].y;
    }
   
    /**
     * Calculates the area of the cross-section polygon that is under compression.
     * This function clips the polygon against the top compression zone.
     * @param {Array<[number, number]>} vertices - The vertices of the cross-section polygon [cm].
     * @param {number} compression_depth_cm - The depth of the rectangular stress block (e.g., lambda * x) [cm].
     * @param {number} y_max_cm - The maximum y-coordinate of the section (top fiber) [cm].
     * @returns {number} The compressed area in cm².
     */
    function calculateCompressedArea(vertices, compression_depth_cm, y_max_cm) {
        if (compression_depth_cm <= 0) return 0;
        const y_clip = y_max_cm - compression_depth_cm;
       
        let compressed_area = 0;
        const points = [...vertices, vertices[0]];

        for (let i = 0; i < vertices.length; i++) {
            let p1 = { x: points[i][0], y: points[i][1] };
            let p2 = { x: points[i+1][0], y: points[i+1][1] };

            const p1_is_compressed = p1.y >= y_clip;
            const p2_is_compressed = p2.y >= y_clip;

            if (p1_is_compressed && p2_is_compressed) { // Both points in compression zone
                compressed_area += (p1.x + p2.x) * (p1.y - p2.y);
            } else if (p1_is_compressed && !p2_is_compressed) { // p1 in, p2 out
                const intersect_x = p1.x + (p2.x - p1.x) * (y_clip - p1.y) / (p2.y - p1.y);
                compressed_area += (p1.x + intersect_x) * (p1.y - y_clip);
            } else if (!p1_is_compressed && p2_is_compressed) { // p1 out, p2 in
                const intersect_x = p1.x + (p2.x - p1.x) * (y_clip - p1.y) / (p2.y - p1.y);
                compressed_area += (intersect_x + p2.x) * (y_clip - p2.y);
            }
        }

        return Math.abs(compressed_area / 2);
    }

    /**
     * Calculates properties of the compressed area of a polygon.
     * @param {Array<[number, number]>} vertices - The vertices of the cross-section polygon [cm].
     * @param {number} compression_depth_cm - The depth of the rectangular stress block (e.g., lambda * x) [cm].
     * @param {number} y_max_cm - The maximum y-coordinate of the section (top fiber) [cm].
     * @returns {{area: number, static_moment_y: number, centroid_y: number}} Properties of the compressed area.
     */
    function calculateCompressedAreaProperties(vertices, compression_depth_cm, y_max_cm) { // No changes needed here
        if (compression_depth_cm <= 0) return { area: 0, static_moment_y: 0, centroid_y: y_max_cm };
        const y_clip = y_max_cm - compression_depth_cm;

        let area = 0;
        let static_moment_y = 0;

        const points = [...vertices, vertices[0]];

        for (let i = 0; i < vertices.length; i++) {
            let p1 = { x: points[i][0], y: points[i][1] };
            let p2 = { x: points[i+1][0], y: points[i+1][1] };

            const p1_is_compressed = p1.y >= y_clip;
            const p2_is_compressed = p2.y >= y_clip;

            // Find the intersection points with the clip line
            let v1 = p1_is_compressed ? p1 : { x: p1.x + (p2.x - p1.x) * (y_clip - p1.y) / (p2.y - p1.y), y: y_clip };
            let v2 = p2_is_compressed ? p2 : { x: p1.x + (p2.x - p1.x) * (y_clip - p1.y) / (p2.y - p1.y), y: y_clip };

            if (p1_is_compressed || p2_is_compressed) {
                const term = (v1.x * v2.y) - (v2.x * v1.y);
                area += term;
                static_moment_y += (v1.y + v2.y) * term;
            }
        }

        area = Math.abs(area / 2);
        const centroid_y = area > 1e-6 ? Math.abs(static_moment_y / (6 * area)) : y_max_cm;

        return { area, static_moment_y: Math.abs(static_moment_y / 6), centroid_y };
    }
    
    /**
     * Performs Ultimate Limit State (ULS/ELU) checks for flexure (Detailed Version).
     * @param {object} inputs - The user inputs.
     * @param {object} props - The section properties.
     * @param {object} loss_results - The results from the prestress loss calculations.
     * @param {number} Ap_total_m2 - Total area of prestressing steel in m².
     * @returns {object} An object with the ULS check results.
     */
    function performUlsChecks(inputs, props, loss_results, Ap_total_m2) {
        const { fck, fptk, load_pp, load_perm, load_var, beam_length, Ep } = inputs;
        const gamma_g = 1.4, gamma_q = 1.4, gamma_c = 1.4, gamma_s = 1.15;

        const pd = gamma_g * (load_pp + load_perm) + gamma_q * load_var;
        const Md_kNm = (pd * beam_length ** 2) / 8;

        const fcd = fck / gamma_c, fpd = fptk / gamma_s;
        const lambda = fck <= 50 ? 0.8 : 0.8 - (fck - 50) / 400;
        const alpha_c = fck <= 50 ? 0.85 : 0.85 * (1 - (fck - 50) / 200);

        const sigma_p_inf_mid = loss_results.sigma_p_inf.find(p => p.x === beam_length / 2)?.value || 0;
        const epsilon_p0 = sigma_p_inf_mid / Ep;

        let x_m = props.height / 200; // Initial guess for neutral axis depth in meters
        const mid_span_point = loss_results.key_points.reduce((prev, curr) => (Math.abs(curr.x - beam_length / 2) < Math.abs(prev.x - beam_length / 2) ? curr : prev));
        if (!mid_span_point) return { error: "Could not determine mid-span point for ULS check." };
        const d_p = props.y_max / 100 - mid_span_point.y; // Effective depth

        for (let i = 0; i < 50; i++) { // Iteration loop
            const epsilon_c = 0.0035; // Ultimate concrete strain
            const delta_epsilon_p = epsilon_c * (d_p - x_m) / x_m;
            const epsilon_pd = epsilon_p0 + delta_epsilon_p;
            const sigma_pd = Math.min(epsilon_pd * Ep, fpd); // Simplified bilinear stress-strain

            const compression_depth_m = lambda * x_m;
            const compressed_area_m2 = calculateCompressedArea(inputs.vertices, compression_depth_m * 100, props.y_max) / 10000;
            const Fst = sigma_pd * Ap_total_m2 * 1000; // Force in steel [kN]
            const Fcc = alpha_c * fcd * compressed_area_m2 * 1000; // Force in concrete [kN]

            const force_diff = Fcc - Fst;
            if (Math.abs(force_diff) < 0.001 * Fst) break; // Converged
            x_m *= (Fst / Fcc); // Adjust x_m based on force imbalance
        }

        const compression_props = calculateCompressedAreaProperties(inputs.vertices, lambda * x_m * 100, props.y_max);
        const y_cc_m = (props.y_max - compression_props.centroid_y) / 100;
        const z = d_p - y_cc_m; // Lever arm
        const MRd_kNm = (alpha_c * fcd * compression_props.area / 10000 * 1000) * z;
        const ratio = MRd_kNm > 0 ? Md_kNm / MRd_kNm : Infinity;
        
        // Ductility Check
        const x_lim_ratio = fck <= 50 ? 0.45 : 0.35;
        const x_lim = x_lim_ratio * d_p;
        const ductility_check = x_m <= x_lim;
   
        return { Md_kNm, MRd_kNm, ratio, x_m, d_p, z, y_cc_m, x_lim, x_lim_ratio, ductility_check };
    }

    return { run, calculateSectionProperties, getCablePositionAt, calculateShrinkageLoss, calculateCreepCoefficient };
})();

/**
 * --- EVENT LISTENERS AND DOM MANIPULATION ---
 */
document.addEventListener('DOMContentLoaded', async () => {
    const fmt = (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A';
    /**
     * A helper function to create DOM elements.
     */
    function h(tag, props = {}, children = []) {
        const el = document.createElement(tag);
        if (props && typeof props === 'object') {
            Object.entries(props).forEach(([key, val]) => { // This helper is fine
                if (key === 'className') el.className = val;
                else if (key === 'style' && typeof val === 'object') Object.assign(el.style, val);
                else if (key in el) el[key] = val;
                else el.setAttribute(key, String(val));
            });
        }
        if (Array.isArray(children)) {
            children.forEach(child => {
                if (child instanceof Node) el.appendChild(child);
                else if (child != null) el.insertAdjacentHTML('beforeend', String(child));
            });
        } else if (children != null) {
            el.insertAdjacentHTML('beforeend', String(children));
        }
        return el;
    }

/**
 * --- EVENT LISTENERS AND DOM MANIPULATION ---
 */
    function addCableDefinitionRow(containerId, cable = { num_strands: 12, jacking_side: 'esquerda', sequence: 1 }) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const rowEl = document.createElement('div');
        rowEl.className = 'cable-definition-row grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center';

        rowEl.appendChild(h('input', { type: 'number', className: 'cable-num-strands w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600', value: cable.num_strands, 'data-validate': 'integer,positive' }));
        
        const jackingSideSelect = h('select', { className: 'cable-jacking-side w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600' });
        jackingSideSelect.innerHTML = `
            <option value="esquerda" ${cable.jacking_side === 'esquerda' ? 'selected' : ''}>Esquerda</option>
            <option value="direita" ${cable.jacking_side === 'direita' ? 'selected' : ''}>Direita</option>
        `;
        rowEl.appendChild(jackingSideSelect);

        rowEl.appendChild(h('input', { type: 'number', className: 'cable-sequence w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600', value: cable.sequence, 'data-validate': 'integer,positive' }));

        const removeButton = h('button', { className: 'remove-cable-btn text-red-500 hover:text-red-700 font-bold text-lg w-8', title: 'Remover Cabo' }, ['&times;']);
        removeButton.onclick = () => {
            rowEl.remove();
            debouncedSave();
        };
        rowEl.appendChild(removeButton);

        container.appendChild(rowEl);
    }

    function addCablePointRow(containerId, point = { x: 0, y: 0.35, type: 'Parabolic' }) {
        const container = document.getElementById(containerId);
        if (!container) return;
       
        const rowEl = document.createElement('div');
        rowEl.className = 'cable-path-row grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-2 items-center';
        rowEl.appendChild(h('input', { type: 'number', className: 'cable-x w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600', value: point.x }));
        const yInput = h('input', { type: 'number', className: 'cable-y w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600', value: point.y, step: 0.01 });
        rowEl.appendChild(yInput);

        yInput.addEventListener('input', () => {
            debouncedDraw();
            debouncedSave();
        });
        rowEl.appendChild(h('select', { className: 'cable-type w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600' }, [
            `<option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Parabólico</option>
             <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Reto</option>`
        ]));
        rowEl.appendChild(h('button', { className: 'remove-cable-point-btn text-red-500 hover:text-red-700 font-bold text-lg w-8', title: 'Remover Ponto' }, ['&times;']));

        rowEl.querySelector('.remove-cable-point-btn').addEventListener('click', () => {
            rowEl.remove();
            debouncedDraw();
            debouncedSave();
        });

        container.appendChild(rowEl);
    }

    const gatherAllInputs = () => {
        const inputs = inputManager.inputIds.reduce((acc, id) => {
            const el = document.getElementById(id); // This is fine
            if (el) acc[id] = (el.type === 'number') ? parseFloat(el.value) || 0 : el.value;
            else acc[id] = 0;
            return acc;
        }, {});
        inputs.vertices = inputManager._parseVertices(document.getElementById('beam_coords')?.value);
        inputs.cable_path = inputManager._gatherCablePath();
        inputs.cable_definitions = inputManager._gatherCableDefinitions();
        return inputs;
    };

    /**
     * Renders the entire calculation report into the DOM using ReportBuilder.
     */
    function renderResults(results) {
        const { checks, inputs, errors } = results;
        const resultsContainer = document.getElementById('results-container');

        if (!checks || errors) {
            resultsContainer.innerHTML = `<p class="text-center text-red-500">Cálculo falhou: ${errors?.[0] || 'Erro desconhecido'}</p>`;
            return;
        }

        const report = new ReportBuilder({
            reportId: 'concrete-beam-report',
            title: 'Relatório de Verificação da Viga Protendida (NBR 6118)'
        });

        // Section 1: Input Summary
        report.addSection('Dados de Entrada', renderInputSummary(inputs, checks), 'input-summary-section');

        // Section 2: Calculated Properties
        report.addSection('Propriedades e Solicitações', renderCalculatedProperties(checks, inputs), 'calculated-props-section');

        // Section 3: Prestress Estimation
        report.addSection('Estimativa de Protensão', renderPrestressEstimation(checks, inputs), 'prestress-estimation-section');

        // Section 4: Detailed Loss Calculations
        report.addSection('Cálculo das Perdas de Protensão', renderDetailedLossCalculations(checks.loss_results, inputs), 'detailed-losses-section');

        // Section 5: Losses Table and Chart
        report.addSection('Resumo das Perdas e Gráfico', renderLossesTableAndChart(checks.loss_results), 'losses-section');

        // Section 6: Prestress Checks
        report.addSection('Verificação da Força de Protensão', renderPrestressChecks(checks), 'prestress-checks-section');

        // Section 6.5: SLS Checks
        report.addSection('Verificação de Tensões no Estado Limite de Serviço (ELS)', renderSlsChecks(checks), 'sls-checks-section');

        // Section 7: ULS Checks
        report.addSection('Verificação de Flexão no Estado Limite Último (ELU)', renderUlsChecks(checks), 'uls-checks-section');

        report.render('results-container');

        // After rendering, draw the charts
        drawStressDiagram('stress-diagram-canvas', results.checks);
        drawEquivalentStressChart('equivalent-stress-chart-canvas', checks.loss_results);
        drawIndividualCableChart('individual-cables-chart-canvas', checks.loss_results);
    }
   
    /**
     * Generates the HTML for the input summary section of the report.
     */
    function renderInputSummary(inputs, checks) {
        const { fck, load_pp, load_perm, load_var, beam_length, Ap, cable_definitions, cable_path } = inputs;
        const total_strands = cable_definitions.reduce((sum, cable) => sum + cable.num_strands, 0);
        const total_Ap = (parseFloat(Ap) || 0) * total_strands;

        const generalRows = `
            <tr><td>Resistência do Concreto (f<sub>ck</sub>)</td><td>${fck} MPa</td></tr>
            <tr><td>Comprimento da Viga (L)</td><td>${beam_length} m</td></tr>
            <tr><td>Área Total de Protensão (A<sub>p,total</sub>)</td><td><b>${total_Ap.toFixed(2)} cm²</b> (${total_strands} cordoalhas)</td></tr>
        `;
        const loadRows = `
            <tr><td>Peso Próprio (g<sub>pp</sub>)</td><td>${load_pp} kN/m</td></tr>
            <tr><td>Carga Permanente (g<sub>perm</sub>)</td><td>${load_perm} kN/m</td></tr>
            <tr><td>Carga Variável (q<sub>var</sub>)</td><td>${load_var} kN/m</td></tr>
        `;
        const cablePathRows = cable_path.map(p => `<tr><td>${p.x.toFixed(2)}</td><td>${p.y.toFixed(3)}</td><td>${p.type}</td></tr>`).join('');
        const cableDefRows = cable_definitions.map((c, i) => `<tr><td>Cabo ${i+1}</td><td>${c.num_strands}</td><td>${c.jacking_side}</td><td>${c.sequence}</td></tr>`).join('');

        return `
            <table class="w-full mt-2 summary-table"><caption>Parâmetros Gerais e Materiais</caption><tbody>${generalRows}</tbody></table>
            <table class="w-full mt-4 summary-table"><caption>Cargas de Serviço (ELS)</caption><tbody>${loadRows}</tbody></table>
            <table class="w-full mt-4 summary-table text-center"><caption>Definição dos Cabos</caption><thead><tr><th>Cabo</th><th>Nº Cordoalhas</th><th>Lado Tracionado</th><th>Sequência</th></tr></thead><tbody>${cableDefRows}</tbody></table>
            <table class="w-full mt-4 summary-table text-center"><caption>Traçado do Cabo</caption><thead><tr><th>X (m)</th><th>Y (m)</th><th>Tipo</th></tr></thead><tbody>${cablePathRows}</tbody></table>
        `;
    }

    /**
     * Generates the HTML for the calculated properties and demands section of the report.
     */
    function renderCalculatedProperties(checks, inputs) {
        const { properties, materials, loads, moments, path_details } = checks;
        const mid_span_details = path_details.find(p => Math.abs(p.x - inputs.beam_length / 2) < 1e-9);

        const geometricRows = `
            <tr><td>Área da Seção (A)</td><td>${fmt(properties.area, 2)} cm²</td></tr>
            <tr><td>Centroide (y<sub>cg</sub>)</td><td>${fmt(properties.centroid.y, 2)} cm</td></tr>
            <tr><td>Inércia (I<sub>cx</sub>)</td><td>${fmt(properties.I.cx, 0)} cm⁴</td></tr>
            <tr><td>Módulo Resist. Inf. (W<sub>i</sub>)</td><td>${fmt(properties.W.i, 0)} cm³</td></tr>
            <tr><td>Módulo Resist. Sup. (W<sub>s</sub>)</td><td>${fmt(properties.W.s, 0)} cm³</td></tr>
            <tr><td>Excentricidade (e<sub>meio</sub>)</td><td>${mid_span_details ? fmt(mid_span_details.e * 100, 2) : 'N/A'} cm</td></tr>
        `;
        const materialRows = `
            <tr><td>Resist. à Tração Média (f<sub>ct,m</sub>)</td><td>${fmt(materials.fctm, 2)} MPa</td></tr>
            <tr><td>Resist. à Tração na Flexão (f<sub>ct,f</sub>)</td><td>${fmt(materials.fctf, 2)} MPa</td></tr>
            <tr><td>Resist. Concreto na Protensão (f<sub>ci</sub>)</td><td>${fmt(materials.fci, 2)} MPa</td></tr>
        `;
        const loadComboRows = `
            <tr><td>Carga Permanente (g<sub>k</sub>)</td><td>${fmt(loads.g_k, 2)} kN/m</td><td class="text-right text-xs text-gray-500">g<sub>pp</sub> + g<sub>perm</sub></td></tr>
            <tr><td>Comb. Quase-Permanente (p<sub>qp</sub>)</td><td>${fmt(loads.p_CQP, 2)} kN/m</td><td class="text-right text-xs text-gray-500">g<sub>k</sub> + 0.3 &times; q<sub>k</sub></td></tr>
            <tr><td>Comb. Frequente (p<sub>freq</sub>)</td><td>${fmt(loads.p_CF, 2)} kN/m</td><td class="text-right text-xs text-gray-500">g<sub>k</sub> + 0.4 &times; q<sub>k</sub></td></tr>
        `;
        const momentRows = `
            <tr><td>Momento (Peso Próprio, M<sub>g1k</sub>)</td><td>${fmt(moments.M_g1k, 1)} kN·m</td></tr>
            <tr><td>Momento (Quase-Perm., M<sub>qp</sub>)</td><td>${fmt(moments.M_CQP, 1)} kN·m</td></tr>
            <tr><td>Momento (Frequente, M<sub>freq</sub>)</td><td>${fmt(moments.M_CF, 1)} kN·m</td></tr>
        `;

        return `
            <table class="w-full mt-2 summary-table"><caption>Propriedades Geométricas</caption><tbody>${geometricRows}</tbody></table>
            <table class="w-full mt-4 summary-table"><caption>Propriedades dos Materiais</caption><tbody>${materialRows}</tbody></table>
            <table class="w-full mt-4 summary-table"><caption>Combinações de Carga (ELS)</caption><tbody>${loadComboRows}</tbody></table>
            <table class="w-full mt-4 summary-table"><caption>Momentos Fletore de Serviço (ELS)</caption><tbody>${momentRows}</tbody></table>
        `;
    }
   
    /**
     * Generates the HTML for the initial prestress estimation section.
     */
    function renderPrestressEstimation(checks, inputs) {
        const { prestress_estimation } = checks; // This is fine, it uses num_cables from the new structure
        const total_strands_estimated = prestress_estimation.num_strands_per_cable * inputs.cable_definitions.length;
        const rows = `
            <tr><td>Momento Auxiliar (M<sub>aux</sub>)</td><td>${fmt(prestress_estimation.M_aux_kNm, 1)} kN·m</td></tr>
            <tr><td>Força por Cordoalha (P<sub>cordoalha</sub>)</td><td>${fmt(prestress_estimation.P_cable, 1)} kN</td></tr>
            <tr><td>Força Total Estimada (P<sub>est,total</sub>)</td><td>${fmt(prestress_estimation.Pest_perdas, 1)} kN</td></tr>
            <tr><td>Número de Cordoalhas por Cabo (Estimado)</td><td><b>${prestress_estimation.num_strands_per_cable}</b></td></tr>
            <tr><td>Número Total de Cordoalhas (Estimado)</td><td><b>${total_strands_estimated}</b> (${inputs.cable_definitions.length} cabos &times; ${prestress_estimation.num_strands_per_cable} cordoalhas/cabo)</td></tr>
        `;
        return `<p class="text-sm text-gray-500 dark:text-gray-400 mb-2">Esta é uma estimativa preliminar para auxiliar no dimensionamento inicial. A verificação final utiliza os valores de entrada definidos pelo usuário.</p>
                <table class="w-full mt-2 summary-table"><tbody>${rows}</tbody></table>`;
    }
   
    /**
     * Generates the HTML for the detailed prestress loss calculation section, now simplified.
     */
    function renderDetailedLossCalculations(loss_results, inputs) {
        // This function is complex and generates a lot of specific HTML.
        // For this refactoring, we'll keep its internal logic but ensure it returns a single HTML string.
        // The original implementation using a helper `h` function is replaced with template literals.
        if (!loss_results || !loss_results.detailed_calcs) return '';
        const { detailed_calcs } = loss_results;
        const { shrinkage, creep_coefficient } = detailed_calcs;
        const createCalcSubSection = (title, content) => `<div class="mb-6 break-inside-avoid"><h4 class="font-semibold text-md border-b-2 border-gray-200 dark:border-gray-700 pb-1 mb-3">${title}</h4><div class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">${content}</div></div>`;
        const createCalcLine = (innerHTML) => `<div class="font-mono text-sm overflow-x-auto">${innerHTML}</div>`;
        
        const timeDependentContent = `
            ${createCalcLine(`<b>Perda por Retração (Δσ<sub>cs</sub>):</b> ${shrinkage.value.toFixed(1)} MPa`)}
            ${createCalcLine(`<b>Coeficiente de Fluência (φ):</b> ${creep_coefficient.value.toFixed(3)}`)}
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">As perdas por retração, fluência e relaxação são calculadas e aplicadas a cada cabo para determinar o perfil de tensão final.</p>
        `;

        return `
            <h4 class="font-semibold text-lg mb-2 text-center">Perdas Progressivas</h4>
            ${createCalcSubSection('Cálculo das Perdas Dependentes do Tempo', timeDependentContent)}
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-2">As perdas imediatas (atrito, acomodação, encurtamento elástico) são agora calculadas sequencialmente para cada cabo. O gráfico abaixo mostra os perfis de tensão finais resultantes.</p>
        `;
    }

    /**
     * Generates the HTML for the prestress loss analysis section, including a table and a chart placeholder.
     */
    function renderLossesTableAndChart(loss_results) {
        const { key_points, sigma_p_inf, cable_stress_profiles, detailed_calcs } = loss_results;
        if (!key_points || !sigma_p_inf || !cable_stress_profiles) return '';
    
        const cableHeaders = Object.keys(cable_stress_profiles).map(seq => `<th>Cabo ${seq} (MPa)</th>`).join('');
    
        const tableRows = key_points.map((point, i) => `
            <tr class="text-center">
                <td>${fmt(point.x, 1)}</td>
                ${Object.values(cable_stress_profiles).map(profile => `<td>${fmt(profile[i].value, 1)}</td>`).join('')}
                <td>${fmt(sigma_p_inf[i].value, 1)}</td>
            </tr>`).join('');
    
        return `<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="lg:col-span-2">
                <h4 class="font-semibold text-center mb-2">Tabela de Tensões Finais no Aço (MPa)</h4>
                <div class="overflow-x-auto">
                    <table class="w-full results-table text-sm">
                        <thead><tr><th>x (m)</th>${cableHeaders}<th>σ<sub>p,eq</sub> (Final)</th></tr></thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
            </div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div>
                <h4 class="font-semibold text-center mb-2">Perfil de Tensão Final (Equivalente)</h4>
                <div class="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div class="relative h-80"><canvas id="equivalent-stress-chart-canvas"></canvas></div>
                </div>
            </div>
            <div>
                <h4 class="font-semibold text-center mb-2">Perfis de Tensão Finais (Individuais)</h4>
                <div class="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div class="relative h-80"><canvas id="individual-cables-chart-canvas"></canvas></div>
                </div>
            </div>
        </div>`;
    }

    /**
     * Generates the HTML for the Serviceability Limit State (SLS) stress checks section.
     */
    function renderSlsChecks(checks) {
        const { sls_checks, materials } = checks;
        if (!sls_checks) return '';

        const check_data = [
            { name: 'Compressão na Protensão (Fibra Superior)', check: sls_checks.initial_compression, unit: 'MPa' },
            { name: 'Tração na Protensão (Fibra Inferior)', check: sls_checks.initial_tension, unit: 'MPa' },
            { name: 'Compressão em Serviço (Fibra Superior)', check: sls_checks.final_compression, unit: 'MPa' },
            { name: 'Tração em Serviço (Fibra Inferior)', check: sls_checks.final_tension, unit: 'MPa' }
        ];

        const rows = check_data.map(item => {
            const { name, check, unit } = item;
            const ratio = Math.abs(check.limit) > 1e-6 ? check.demand / check.limit : (check.demand === 0 ? 0 : Infinity);
            const status = check.pass ? '<span class="pass">OK</span>' : '<span class="fail">FALHA</span>';
            return `<tr>
                        <td>${name}</td>
                        <td>${fmt(check.demand, 2)} ${unit}</td>
                        <td>${fmt(check.limit, 2)} ${unit}</td>
                        <td>${fmt(ratio, 3)}</td>
                        <td>${status}</td>
                    </tr>`;
        }).join('');

        return `<table class="w-full mt-2 results-table">
                    <thead><tr><th>Verificação</th><th>Tensão Calculada (σ)</th><th>Tensão Limite (σ<sub>lim</sub>)</th><th>Razão</th><th>Status</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
    }

    /**
      * Generates the HTML for the prestressing force limit checks section.
      */
    function renderPrestressChecks(checks) {
        const { prestress_checks, materials } = checks;
        const P_min_req = Math.max(prestress_checks.P_min_tens_i.value * 1000, prestress_checks.P_min_comp_s.value * 1000);
        const P_max_req = Math.min(prestress_checks.P_max_comp_i.value * 1000, prestress_checks.P_max_tens_s.value * 1000);
        const adopted_P_i_kN = prestress_checks.P_i * 1000;
        const is_valid = adopted_P_i_kN >= P_min_req && adopted_P_i_kN <= P_max_req;

        const summaryHtml = `<div class="p-4 rounded-lg ${is_valid ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}">
            <h3 class="font-bold text-lg text-center ${is_valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}">${is_valid ? 'Força de Protensão Adotada é Válida' : 'Força de Protensão Adotada é Inválida'}</h3>
            <p class="text-center mt-2">Faixa Válida: ${fmt(P_min_req, 1)} kN ≤ Pᵢ ≤ ${fmt(P_max_req, 1)} kN</p>
            <p class="text-center text-xl font-bold mt-1">Pᵢ,adotado = ${fmt(adopted_P_i_kN, 1)} kN</p>
        </div>`;

        return `${summaryHtml}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg"><h4 class="font-semibold text-center">Diagrama de Tensões (Meio do Vão, MPa)</h4><div class="relative h-64 w-full mt-2"><canvas id="stress-diagram-canvas"></canvas></div></div>
            </div>`;
    }
   
    /**
     * Generates the HTML for the Ultimate Limit State (ULS/ELU) checks section.
     */
    function renderUlsChecks(checks) {
        const { uls_checks } = checks; if (!uls_checks) return '';
        if (uls_checks.error) return `<p class="text-red-500">${uls_checks.error}</p>`;
   
        const { Md_kNm, MRd_kNm, ratio, x_m, d_p, ductility_check, x_lim_ratio } = uls_checks;
        const is_valid = ratio <= 1.0 && ductility_check;

        const summaryHtml = `<div class="p-4 rounded-lg ${is_valid ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}">
            <h3 class="font-bold text-lg text-center ${is_valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}">${is_valid ? 'Verificação em ELU Aprovada' : 'Verificação em ELU Reprovada'}</h3>
            <p class="text-center mt-2">M<sub>d</sub> / M<sub>Rd</sub> = ${fmt(Md_kNm, 1)} / ${fmt(MRd_kNm, 1)} = <b>${ratio.toFixed(3)}</b> ${ratio <= 1.0 ? ' (OK)' : ' (FALHA)'}</p>
            <p class="text-center mt-1">x / d = ${fmt(x_m * 100, 1)} / ${fmt(d_p * 100, 1)} = <b>${(x_m/d_p).toFixed(3)}</b> ≤ ${x_lim_ratio.toFixed(3)} ${ductility_check ? ' (OK)' : ' (FALHA - Frágil)'}</p>
        </div>`;

        const breakdownRows = `
            <tr><td>Momento Solicitante de Cálculo (M<sub>d</sub>)</td><td>${fmt(Md_kNm, 1)} kN·m</td></tr>
            <tr><td>Altura Útil da Protensão (d<sub>p</sub>)</td><td>${fmt(d_p * 100, 1)} cm</td></tr>
            <tr><td>Profundidade da Linha Neutra (x)</td><td>${fmt(x_m * 100, 1)} cm</td></tr>
            <tr><td>Momento Resistente de Cálculo (M<sub>Rd</sub>)</td><td><b>${fmt(MRd_kNm, 1)} kN·m</b></td></tr>
        `;
        
        return `${summaryHtml}<table class="w-full mt-4 summary-table"><caption>Memória de Cálculo - ELU</caption><tbody>${breakdownRows}</tbody></table>`;
    }

    const debouncedDraw = debounce(drawDiagrams, 300);

    const diagramInputIds = inputManager.inputIds.filter(id => id !== 'beam_height').concat(['beam_coords']);
    diagramInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', debouncedDraw);
            el.addEventListener('change', debouncedDraw); // For selects
        }
    });
    document.getElementById('cable-path-container').addEventListener('input', debouncedDraw);
   
    const allInputAndTextareaIds = [...inputManager.inputIds, 'beam_coords'];
    const debouncedSave = debounce(() => saveInputsToLocalStorage('prestressed-beam-inputs-v2', gatherAllInputs()), 500);
    document.getElementById('cable-path-container').addEventListener('input', debouncedSave);
    allInputAndTextareaIds.forEach(id => {
        document.getElementById(id)?.addEventListener('input', debouncedSave);
    });

    const handleRunCheckGlobal = createCalculationHandler({
        gatherInputsFunction: gatherAllInputs,
        storageKey: 'prestressed-beam-inputs-v2',
        validationRuleKey: 'prestressed-beam-inputs-v2', // This key is used for validation and report naming
        calculatorFunction: (inputs) => concreteBeamCalculator.run(inputs),
        renderFunction: renderResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn',
        reportId: 'concrete-beam-report',
        filenamePrefix: 'viga-protendida-concreto-nbr6118'
    });

    const onAppReady = () => {
        const storageKey = 'prestressed-beam-inputs-v2';
        const savedData = localStorage.getItem(storageKey);

        if (savedData) {
            const loadedInputs = JSON.parse(savedData);
            if (loadedInputs && loadedInputs.cable_path) {
                const container = document.getElementById('cable-path-container');
                const cableDefContainer = document.getElementById('cables-definition-container');
                container.innerHTML = ''; // Clear default path rows
                if (cableDefContainer) cableDefContainer.innerHTML = ''; // Clear default cable def rows
                loadedInputs.cable_path.forEach(point => addCablePointRow('cable-path-container', point));
                loadedInputs.cable_definitions.forEach(cable => addCableDefinitionRow('cables-definition-container', cable));
            }
        } else {
            // Default initial state if no saved data
            addCablePointRow('cable-path-container', { x: 0, y: 0.55, type: 'Straight' });
            addCablePointRow('cable-path-container', { x: 9, y: 0.10, type: 'Straight' });
            addCableDefinitionRow('cables-definition-container', { num_strands: 12, jacking_side: 'esquerda', sequence: 1 });
            addCableDefinitionRow('cables-definition-container', { num_strands: 12, jacking_side: 'direita', sequence: 2 });
        }
        drawDiagrams(); // Initial draw

        // Attach listeners after initial setup
        const diagramInputIds = inputManager.inputIds.filter(id => id !== 'beam_height').concat(['beam_coords']); // This is fine
        diagramInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', debouncedDraw);
                el.addEventListener('change', debouncedDraw);
            }
        });
        document.getElementById('add-cable-point-btn').addEventListener('click', () => {
            addCablePointRow('cable-path-container');
        });
        document.getElementById('add-cable-btn').addEventListener('click', () => {
            addCableDefinitionRow('cables-definition-container');
        });
    }

    function drawDiagrams() {
        const inputs = gatherAllInputs();
        drawCrossSectionDiagram('cross-section-canvas', inputs.vertices);
        drawLongitudinalDiagram('longitudinal-canvas', inputs);
        const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
        const heightInput = document.getElementById('beam_height');
        if (props && heightInput && document.activeElement !== heightInput) {
            heightInput.value = props.height.toFixed(2);
        }
    }

    initializeApp({
        // pageKey and pageTitle are now found automatically
        inputIds: allInputAndTextareaIds,
        calculationHandler: createCalculationHandler({
            gatherInputsFunction: gatherAllInputs,
            storageKey: 'prestressed-beam-inputs-v2',
            validationRuleKey: 'prestressed-beam-inputs-v2',
            calculatorFunction: (inputs) => concreteBeamCalculator.run(inputs),
            renderFunction: renderResults,
            resultsContainerId: 'results-container',
            buttonId: 'run-check-btn'
        }),
        onReady: onAppReady
    });
});