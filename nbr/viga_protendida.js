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
        'design_code', 'unit_system', 'fck', 'age_at_prestress', 'Ap', 'Kperdas', 'num_cables',
        'num_strands_per_cable', // <-- ADICIONADO: Número de cordoalhas agora é uma entrada direta
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
        const sigma_pi = 0.74 * fptk;
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
    function calculateInitialPrestressEstimate({ moments, materials, props, Kperdas, num_cables, ecc_mid, Ap, fptk }) {
        const Ap_single_cm2 = parseFloat(Ap) || 0;
        const P_strand_kN = (Ap_single_cm2 * 0.74 * fptk) / 10;
        const M_aux_kNm = Math.max(moments.M_CF - (props.W.i / 1e6) * materials.fctf * 1000, moments.M_CQP);
        const ks_m = props.ks / 100; // convert cm to m
        const denominator = ks_m + ecc_mid;

        let P_est_i = 0;
        if (Math.abs(denominator) > 1e-9) {
            P_est_i = (M_aux_kNm) / denominator; // This is in kN
        }
        const Pest_perdas = Kperdas > 0 ? P_est_i / Kperdas : 0; // Total force required before losses
        const num_tendons = (P_strand_kN > 0 && num_cables > 0) ? Math.ceil(Pest_perdas / (P_strand_kN * num_cables)) : 0;

        return {
            M_aux_kNm,
            ks_m,
            P_est_i,
            Pest_perdas,
            num_tendons, // This is strands PER CABLE
            P_cable: P_strand_kN
        };
    }
   
    /**
     * Main calculation function, updated to follow the PDF logic.
     * @param {object} inputs - The gathered user inputs.
     * @returns {object} The results of the calculation.
     */
    function run(raw_inputs) {
        const inputs = { ...raw_inputs }; // Make a mutable copy

        const { vertices, fck, beam_length, cable_path, Ap, num_cables, num_strands_per_cable } = inputs;
        
        // --- 1. Calculate Total Steel Area from DIRECT INPUTS ---
        const Ap_single_cm2 = parseFloat(Ap) || 0;
        const total_strands = (parseFloat(num_cables) || 0) * (parseFloat(num_strands_per_cable) || 0);
        const Ap_total_cm2 = Ap_single_cm2 * total_strands;
        const Ap_total_m2 = Ap_total_cm2 / 1e4;

        // --- 2. Validate Inputs & Section Properties ---
        if (!vertices || vertices.length < 3 || fck <= 0 || beam_length <= 0 || Ap_total_cm2 <= 0 || num_cables <= 0) {
            return { errors: ["Invalid inputs. Ensure all values (fck, length, Ap, N_cables) are positive and vertices are sufficient."] };
        }
        const props = calculateSectionProperties(vertices);
        if (!props) {
            return { errors: ["Invalid beam cross-section vertices."] };
        }
        const A_m2 = props.area / 1e4; // Ac
        const Wi_m3 = props.W.i / 1e6;
        const Ws_m3 = props.W.s / 1e6;
        const I_cx_m4 = props.I.cx / 1e8;

        // --- 3. Material Properties (NBR 6118 & PDF) ---
        const materials = calculateMaterialProperties(inputs);

        // --- 4. Loads & Moments ---
        const { loads, moments } = calculateLoadsAndMoments(inputs);

        // --- 5. Define Cable Path & Key Points ---
        const y_cg = props.centroid.y / 100; // in m
        const y_min_beam_m = Math.min(...vertices.map(p => p[1])) / 100;

        const preliminary_key_points = [...new Set(cable_path.map(p => p.x))].sort((a,b) => a-b);
        const x_a_result = calculateAnchorageSlipDistance(inputs, materials, preliminary_key_points, cable_path.map(p => ({ ...p, y: p.y + y_min_beam_m })));

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

        // --- 6. Initial Prestress and Stress Limit Checks (at mid-span) ---
        const mid_span_details = path_details.find(p => Math.abs(p.x - beam_length / 2) < 1e-9) || path_details[Math.floor(path_details.length/2)];
        const ecc_mid = mid_span_details.e;
        const prestress_checks = performInitialPrestressChecks({ ...inputs, Ap_total_m2, ecc_mid, materials, moments, A_m2, Ws_m3, Wi_m3, Kperdas: inputs.Kperdas });
       
        // --- 7. Detailed Prestress Loss Calculation ---
        const loss_results = calculateDetailedLosses(inputs, props, materials, path_details, moments, prestress_checks.sigma_pi, cable_path_abs, Ap_total_m2, x_a_result);

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
         
        // --- 9. Ultimate Limit State (ULS/ELU) Checks ---
        const uls_checks = performUlsChecks(inputs, props, loss_results, Ap_total_m2);
        
        // --- 10. Preliminary Prestress Estimation (for reporting only) ---
        const prestress_estimation = calculateInitialPrestressEstimate({ ...inputs, moments, materials, props, ecc_mid });

        return {
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
                uls_checks
            },
            inputs
        };
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
    function calculateCompressedAreaProperties(vertices, compression_depth_cm, y_max_cm) {
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

// --- UI AND DRAWING FUNCTIONS ---

/**
 * Draws the beam's cross-section on a canvas using Chart.js.
 */
function drawCrossSectionDiagram(canvasId, vertices) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    let existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    if (!vertices || vertices.length < 3) return;
    const props = concreteBeamCalculator.calculateSectionProperties(vertices);
    if (!props) return;

    const all_x = vertices.map(v => v[0]);
    const all_y = vertices.map(v => v[1]);
    const minX = Math.min(...all_x);
    const maxX = Math.max(...all_x);
    const minY = Math.min(...all_y);
    const maxY = Math.max(...all_y);
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    const maxRange = Math.max(rangeX, rangeY) * 1.1; // Add 10% padding
    const centerX = props.centroid.x;
    const centerY = props.centroid.y;
    const sectionData = [...vertices, vertices[0]].map(p => ({ x: p[0], y: p[1] }));

    new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Cross-Section',
                data: sectionData,
                borderColor: isDark ? '#D1D5DB' : '#2c3e50',
                backgroundColor: isDark ? '#6B7280' : '#e8f4f8',
                borderWidth: 2,
                fill: true,
                showLine: true,
                pointRadius: 0,
                tension: 0,
            }, {
                label: 'Centroid (CG)',
                data: [{ x: props.centroid.x, y: props.centroid.y }],
                pointBackgroundColor: 'red',
                pointRadius: 5,
                showLine: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'x (cm)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    min: centerX - maxRange / 2,
                    max: centerX + maxRange / 2,
                },
                y: {
                    title: { display: true, text: 'y (cm)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    min: centerY - maxRange / 2,
                    max: centerY + maxRange / 2,
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            if (context.dataset.label === 'Centroid (CG)') {
                                return `CG: (${context.parsed.x.toFixed(1)}, ${context.parsed.y.toFixed(1)}) cm`;
                            }
                            return `(${context.parsed.x.toFixed(1)}, ${context.parsed.y.toFixed(1)}) cm`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Draws the longitudinal view of the beam, including the centroid and cable path.
 */
function drawLongitudinalDiagram(canvasId, inputs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    let existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    const { beam_length, cable_path } = inputs;
    const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
    if (!props) return;

    const beamOutline = [
        { x: 0, y: props.y_min }, { x: beam_length, y: props.y_min },
        { x: beam_length, y: props.y_max }, { x: 0, y: props.y_max }, { x: 0, y: props.y_min }
    ];
    const centroidLine = [{ x: 0, y: props.centroid.y }, { x: beam_length, y: props.centroid.y }];
    const cablePoints = [];
    const numSegments = 200;
    for (let i = 0; i <= numSegments; i++) {
        const x_pos = (i / numSegments) * beam_length;
        const y_abs_m = concreteBeamCalculator.getCablePositionAt(x_pos, cable_path, beam_length);
        cablePoints.push({ x: x_pos, y: y_abs_m * 100 }); // convert to cm
    }

    // --- Adiciona padding aos eixos X e Y ---
    const xPadding = beam_length * 0.05; // 5% de padding em cada lado
    const scaleMinX = -xPadding;
    const scaleMaxX = beam_length + xPadding;

    const yRange = props.y_max - props.y_min;
    const yPadding = yRange * 0.1; // 10% de padding
    const scaleMinY = props.y_min - yPadding;
    const scaleMaxY = props.y_max + yPadding;

    new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Beam Outline',
                data: beamOutline,
                borderColor: isDark ? '#D1D5DB' : '#000',
                backgroundColor: isDark ? '#6B7280' : '#d3d3d3',
                borderWidth: 1,
                fill: true,
                tension: 0,
                pointRadius: 0,
                order: 3
            }, {
                label: 'Centroid',
                data: centroidLine,
                borderColor: 'red',
                borderDash: [5, 5],
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0,
                order: 2
            }, {
                label: 'Cable Path',
                data: cablePoints,
                borderColor: isDark ? '#f59e0b' : '#d97706',
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                tension: 0.1,
                order: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Comprimento (m)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    min: scaleMinX,
                    max: scaleMaxX
                },
                y: {
                    title: { display: true, text: 'Altura (cm)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    min: scaleMinY,
                    max: scaleMaxY
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor } },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (tooltipItems) => `x = ${tooltipItems[0].parsed.x.toFixed(2)} m`,
                        label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} cm`
                    }
                }
            }
        }
    });
}

/**
 * --- EVENT LISTENERS AND DOM MANIPULATION ---
 */
document.addEventListener('DOMContentLoaded', () => {
        // Injeta o cabeçalho e rodapé padrão da aplicação
        injectHeader({
            activePage: 'viga-protendida',
            pageTitle: 'Verificador de Viga Protendida (NBR 6118)',
            headerPlaceholderId: 'header-placeholder'
        });
        injectFooter({ footerPlaceholderId: 'footer-placeholder' });
        initializeSharedUI();

    /**
     * A helper function to create DOM elements.
     */
    function h(tag, props = {}, children = []) {
        const el = document.createElement(tag);
        Object.entries(props).forEach(([key, value]) => {
            if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key in el) {
                el[key] = value;
            } else {
                el.setAttribute(key, value);
            }
        });
        children.forEach(child => {
            if (child instanceof Node) {
                el.appendChild(child);
            } else if (child !== null && child !== undefined) {
                el.innerHTML = child.toString();
            }
        });
        return el;
    }

    function createReportSection(id, title, contentChildren) {
        return h('div', { id, className: 'report-section-copyable' }, [
            h('div', { className: 'flex justify-between items-center mb-2' }, [
                h('h3', { className: 'report-header' }, [title]),
                h('button', { 'data-copy-target-id': id, className: 'copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden' }, ['Copy Section'])
            ]),
            h('div', { className: 'copy-content' }, contentChildren)
        ]);
    }

    function createSummaryTable(captionText, rowsData, marginTop = 'mt-2') {
        return h('table', { className: `w-full ${marginTop} summary-table` }, [
            h('caption', { className: 'report-caption' }, [captionText]),
            h('tbody', {}, rowsData.map(([label, value]) =>
                h('tr', {}, [
                    h('td', { innerHTML: label }),
                    h('td', { innerHTML: value })
                ])
            ))
        ]);
    }

    /**
     * Renders the entire calculation report into the DOM.
     */
    function renderResults(results) {
        const resultsDiv = document.getElementById('results-container');
        const { checks, inputs, errors } = results;
        if (!checks || errors) {
            resultsDiv.innerHTML = '';
            resultsDiv.appendChild(h('p', { className: 'text-center text-red-500' }, [`Calculation failed: ${errors?.[0] || 'Unknown error'}`]));
            return;
        }

        const reportEl = h('div', { id: 'concrete-beam-report', className: 'bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6' }, [
            h('div', { className: 'flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden' }, [
                h('button', { id: 'download-pdf-btn', className: 'bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm' }, ['Download PDF']),
                h('button', { id: 'download-word-btn', className: 'bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm' }, ['Download Word']),
                h('button', { id: 'copy-report-btn', className: 'bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm' }, ['Copiar Relatório Completo'])
            ]),
            h('h2', { className: 'text-2xl font-bold text-center border-b pb-2' }, ['Relatório de Verificação da Viga Protendida (NBR 6118)']),
            renderInputSummary(inputs, checks),
            renderCalculatedProperties(checks, inputs),
            renderPrestressEstimation(checks, inputs), // Mantido para referência
            renderDetailedLossCalculations(checks.loss_results),
            renderLossesTableAndChart(checks.loss_results),
            renderPrestressChecks(checks),
            renderUlsChecks(checks)
        ]);

        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(reportEl);

        document.getElementById('download-pdf-btn')?.addEventListener('click', () => handleDownloadPdf('concrete-beam-report', 'Viga-Protendida-Relatorio.pdf'));
        document.getElementById('download-word-btn')?.addEventListener('click', () => handleDownloadWord('concrete-beam-report', 'Viga-Protendida-Relatorio.docx'));
        document.getElementById('copy-report-btn')?.addEventListener('click', () => handleCopyToClipboard('concrete-beam-report', 'feedback-message'));
        resultsDiv.querySelectorAll('.copy-section-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                handleCopyToClipboard(e.target.dataset.copyTargetId, 'feedback-message');
            });
        });
        drawStressDiagram('stress-diagram-canvas', results.checks);
        drawLossesChart('losses-chart-canvas', checks.loss_results);
    }
   
    /**
     * Generates the HTML for the input summary section of the report.
     */
    function renderInputSummary(inputs, checks) {
        const { fck, load_pp, load_perm, load_var, beam_length, Ap, num_cables, num_strands_per_cable, cable_path } = inputs;
        const total_strands = (parseFloat(num_cables) || 0) * (parseFloat(num_strands_per_cable) || 0);
        const total_Ap = (parseFloat(Ap) || 0) * total_strands;

        const generalRows = [
            ['Resistência do Concreto (f<sub>ck</sub>)', `${fck} MPa`],
            ['Comprimento da Viga (L)', `${beam_length} m`],
            ['Área Total de Protensão (A<sub>p,total</sub>)', `<b>${total_Ap.toFixed(2)} cm²</b> (${total_strands} cordoalhas)`],
            ['Configuração', `${num_cables} cabos &times; ${num_strands_per_cable} cordoalhas/cabo`],
        ];
        const loadRows = [
            ['Peso Próprio (g<sub>pp</sub>)', `${load_pp} kN/m`],
            ['Carga Permanente (g<sub>perm</sub>)', `${load_perm} kN/m`],
            ['Carga Variável (q<sub>var</sub>)', `${load_var} kN/m`]
        ];

        const cablePathHeader = h('thead', {}, [
            h('tr', {}, ['X (m)', 'Y (m)', 'Tipo de Segmento'].map(text => h('th', { innerHTML: text })))
        ]);
        const cablePathBody = h('tbody', {}, cable_path.map(p =>
            h('tr', {}, [
                h('td', {}, [p.x.toFixed(2)]),
                h('td', {}, [p.y.toFixed(3)]),
                h('td', {}, [p.type])
            ])
        ));
        const cablePathTableEl = h('table', { className: 'w-full mt-4 summary-table text-center' }, [
            h('caption', { className: 'report-caption' }, ['Traçado do Cabo']),
            cablePathHeader,
            cablePathBody
        ]);

        return createReportSection('input-summary-section', 'Resumo dos Dados de Entrada', [
            createSummaryTable('Parâmetros Gerais e Materiais', generalRows),
            createSummaryTable('Cargas de Serviço (ELS)', loadRows, 'mt-4'),
            cablePathTableEl
        ]);
    }

    /**
     * Generates the HTML for the calculated properties and demands section of the report. (Translated)
     */
    function renderCalculatedProperties(checks, inputs) {
        const { properties, materials, loads, moments, path_details } = checks;
        const fmt = (val, dec = 2) => (val !== undefined && val !== null && !isNaN(val)) ? val.toFixed(dec) : 'N/A';
        const mid_span_details = path_details.find(p => Math.abs(p.x - inputs.beam_length / 2) < 1e-9);

        const geometricRows = [
            ['Área da Seção (A)', `${fmt(properties.area, 2)} cm²`],
            ['Centroide (y<sub>cg</sub>)', `${fmt(properties.centroid.y, 2)} cm`],
            ['Inércia (I<sub>cx</sub>)', `${fmt(properties.I.cx, 0)} cm⁴`],
            ['Módulo Resist. Inf. (W<sub>i</sub>)', `${fmt(properties.W.i, 0)} cm³`],
            ['Módulo Resist. Sup. (W<sub>s</sub>)', `${fmt(properties.W.s, 0)} cm³`],
            ['Módulo Auxiliar Inf. (k<sub>i</sub>)', `${fmt(properties.ki, 2)} cm`],
            ['Módulo Auxiliar Sup. (k<sub>s</sub>)', `${fmt(properties.ks, 2)} cm`],
            ['Excentricidade (e<sub>meio</sub>)', `${mid_span_details ? fmt(mid_span_details.e * 100, 2) : 'N/A'} cm`],
        ];

        const materialRows = [
            ['Resist. à Tração Média (f<sub>ct,m</sub>)', `${fmt(materials.fctm, 2)} MPa`],
            ['Resist. à Tração na Flexão (f<sub>ct,f</sub>)', `${fmt(materials.fctf, 2)} MPa`],
            ['Resist. Concreto na Protensão (f<sub>ci</sub>)', `${fmt(materials.fci, 2)} MPa`],
        ];

        const loadComboRows = [
            ['Carga Permanente (g<sub>k</sub>)', `${fmt(loads.g_k, 2)} kN/m`, `g<sub>pp</sub> + g<sub>perm</sub>`],
            ['Comb. Quase-Permanente (p<sub>qp</sub>)', `${fmt(loads.p_CQP, 2)} kN/m`, `g<sub>k</sub> + 0.3 &times; q<sub>k</sub>`],
            ['Comb. Frequente (p<sub>freq</sub>)', `${fmt(loads.p_CF, 2)} kN/m`, `g<sub>k</sub> + 0.4 &times; q<sub>k</sub>`],
        ];

        const momentRows = [
            ['Momento (Peso Próprio, M<sub>g1k</sub>)', `${fmt(moments.M_g1k, 1)} kN·m`],
            ['Momento (Quase-Perm., M<sub>qp</sub>)', `${fmt(moments.M_CQP, 1)} kN·m`],
            ['Momento (Frequente, M<sub>freq</sub>)', `${fmt(moments.M_CF, 1)} kN·m`],
        ];

        return createReportSection('calculated-props-section', 'Propriedades Calculadas e Solicitações', [
            createSummaryTable('Propriedades Geométricas', geometricRows, 'mt-2'),
            createSummaryTable('Propriedades dos Materiais', materialRows, 'mt-4'),
            h('table', { className: 'w-full mt-4 summary-table' }, [
                h('caption', { className: 'report-caption' }, ['Combinações de Carga (ELS)']),
                h('tbody', {}, loadComboRows.map(([label, value, formula]) => h('tr', {}, [h('td', { innerHTML: label }), h('td', { innerHTML: value }), h('td', { innerHTML: formula, className: 'text-right text-xs text-gray-500' })])))
            ]),
            createSummaryTable('Momentos Fletore de Serviço (ELS)', momentRows, 'mt-4')
        ]);
    }
   
    /**
     * Generates the HTML for the initial prestress estimation section.
     */
    function renderPrestressEstimation(checks, inputs) {
        const { prestress_estimation } = checks;
        const total_strands_estimated = prestress_estimation.num_tendons * inputs.num_cables;
        const fmt = (val, dec = 2) => (!isNaN(val)) ? val.toFixed(dec) : 'N/A';

        const rowsData = [
            ['Momento Auxiliar (M<sub>aux</sub>)', `${fmt(prestress_estimation.M_aux_kNm, 1)} kN·m`],
            ['Módulo do Núcleo (k<sub>s</sub>)', `${fmt(prestress_estimation.ks_m, 3)} m`],
            ['Força por Cordoalha (P<sub>cordoalha</sub>)', `${fmt(prestress_estimation.P_cable, 1)} kN`],
            ['Força Total Estimada (P<sub>est,total</sub>)', `${fmt(prestress_estimation.Pest_perdas, 1)} kN`],          
            ['Número de Cordoalhas por Cabo (Estimado)', `<b>${prestress_estimation.num_tendons}</b>`],
            ['Número Total de Cordoalhas (Estimado)', `<b>${total_strands_estimated}</b> (${inputs.num_cables} cabos &times; ${prestress_estimation.num_tendons} cordoalhas/cabo)`],
        ];

        return createReportSection('prestress-estimation-section', 'Estimativa Inicial de Protensão', [
            h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mb-2' }, ['Esta é uma estimativa preliminar para auxiliar no dimensionamento inicial. A verificação final utiliza os valores de entrada definidos pelo usuário.']),
            h('table', { className: 'w-full mt-2 summary-table' }, [
                h('tbody', {}, rowsData.map(([label, value]) => h('tr', {}, [h('td', { innerHTML: label }), h('td', { innerHTML: value })])))
            ])
        ]);
    }
   
    /**
     * Generates the HTML for the detailed prestress loss calculation section.
     */
    function renderDetailedLossCalculations(loss_results) {
        if (!loss_results || !loss_results.detailed_calcs) return document.createDocumentFragment();

        const { detailed_calcs } = loss_results;

        const createCalcSubSection = (title, children) => {
            return h('div', { className: 'mb-6 break-inside-avoid' }, [
                h('h4', { className: 'font-semibold text-md border-b-2 border-gray-200 dark:border-gray-700 pb-1 mb-3' }, [title]),
                h('div', { className: 'p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2' }, children)
            ]);
        };
       
        const createCalcLine = (innerHTML) => h('div', { className: 'font-mono text-sm overflow-x-auto', innerHTML });

        const frictionContent = () => {
            const { friction } = detailed_calcs;
            return friction.map(c => createCalcLine(`σ<sub>p</sub>(x=${c.x.toFixed(1)}) = <b>${c.value.toFixed(1)} MPa</b> <span class="text-xs text-gray-500 dark:text-gray-400 float-right">${c.calc}</span>`));
        };

        const anchorageContent = () => {
            const { anchorage } = detailed_calcs;
            return [
                createCalcLine(`<b>Área de Perda (A<sub>δ</sub>)</b> = E<sub>p</sub> &times; (δ / 1000) = <b>${anchorage.A_delta.value.toFixed(1)} MPa·m</b>`),
                h('hr', { className: 'my-2 border-gray-300 dark:border-gray-600' }),
                ...(anchorage.betas || []).map(b => createCalcLine(`β (x=${b.from.toFixed(1)} a ${b.to.toFixed(1)}) = <b>${b.value.toFixed(1)} MPa/m</b>`)),
                ...(anchorage.areas || []).map(a => createCalcLine(`Área Acumulada até x=${a.to.toFixed(1)} = <b>${a.cumulative.toFixed(1)} MPa·m</b>`)),
                h('hr', { className: 'my-2 border-gray-300 dark:border-gray-600' }),
                createCalcLine(`Distância de Acomodação (<b>x<sub>a</sub></b>) = <b>${anchorage.x_a.toFixed(2)} m</b>`),
                createCalcLine(`Tensão na Acomodação (<b>σ<sub>pa</sub></b>) = <b>${anchorage.sigma_pa.toFixed(1)} MPa</b>`),
                ...anchorage.sigma_prime.map((s) => createCalcLine(`σ'<sub>p</sub>(x=${s.x.toFixed(1)}) = <b>${s.value.toFixed(1)} MPa</b><span class="text-xs text-gray-500 dark:text-gray-400 float-right">${s.calc}</span>`))
            ];
        };
       
        const elasticShorteningContent = () => {
            const { elastic_shortening } = detailed_calcs;
            return [
                createCalcLine(`<b>Fórmula:</b> Δσ<sub>ee</sub> = α<sub>p</sub> &times; σ<sub>c,p</sub> &times; (n-1)/(2n)`),
                ...elastic_shortening.map(c => createCalcLine(`Perda (<b>Δσ<sub>ee</sub></b>) em x=${c.x.toFixed(1)}m = <b>${c.value.toFixed(1)} MPa</b> <span class="text-xs text-gray-500 dark:text-gray-400 float-right">${c.calc}</span>`))
            ];
        };

        const immediateStressContent = () => {
            const { sigma_p_ime } = loss_results;
            return sigma_p_ime.map(c => createCalcLine(`Tensão (<b>σ<sub>p,ime</sub></b>) em x=${c.x.toFixed(1)}m = <b>${c.value.toFixed(1)} MPa</b>`));
        }

        const relaxationContent = () => {
            const { relaxation } = detailed_calcs;
            const fmt = (val, dec = 3) => (val !== undefined && !isNaN(val)) ? val.toFixed(dec) : 'N/A';
            return [
                createCalcLine(`<b>Fórmula:</b> Δσ<sub>r</sub> = χ<sub>∞</sub> &times; σ<sub>pi,ime</sub>`),
                ...relaxation.map(c => h('div', {className: 'mt-2'}, [
                    createCalcLine(`<u>Para x=${c.x.toFixed(1)}m:</u>`),
                    createCalcLine(`&nbsp;&nbsp;ζ = σ<sub>ime</sub> / f<sub>ptk</sub> = ${fmt(c.zeta)}`),
                    createCalcLine(`&nbsp;&nbsp;χ<sub>∞</sub> = -ln(1 - 2.5 &times; ψ₁₀₀₀) = ${fmt(c.chi_inf_raw)}`),
                    createCalcLine(`&nbsp;&nbsp;<b>Δσ<sub>r</sub></b> = <b>${c.value.toFixed(1)} MPa</b> <span class="text-xs text-gray-500 dark:text-gray-400 float-right">${c.calc}</span>`)
                ]))
            ];
        };

        const shrinkageContent = () => {
            const { shrinkage } = detailed_calcs;
            const { intermediate } = shrinkage;
            const fmt = (val, dec = 3) => (val !== undefined && !isNaN(val)) ? val.toFixed(dec) : 'N/A';

            return [
                createCalcLine(`<b>1. Altura fictícia (h₀):</b> h₀ = 2·A<sub>c</sub> / u<sub>ar</sub> = <b>${fmt(intermediate.h0_cm, 1)} cm</b>`),
                createCalcLine(`<b>2. Coeficiente γ:</b> γ = 1 + e<sup>(-7.8 + 0.1·U)</sup> = <b>${fmt(intermediate.gamma)}</b>`),
                createCalcLine(`<b>3. Altura fictícia corrigida (h<sub>fic</sub>):</b> h<sub>fic</sub> = γ · h₀ = <b>${fmt(intermediate.h_fic_cm, 1)} cm</b>`),
                createCalcLine(`<b>4. Coeficiente ε₁ₛ:</b> ε₁ₛ = f(U) = <b>${fmt(intermediate.epsilon_1s)}</b>`),
                createCalcLine(`<b>5. Coeficiente ε₂ₛ:</b> ε₂ₛ = f(h<sub>fic</sub>) = <b>${fmt(intermediate.epsilon_2s)}</b>`),
                createCalcLine(`<b>6. Coeficiente βₛ(t₀):</b>`),
                createCalcLine(`&nbsp;&nbsp;A=${fmt(intermediate.A_cs,1)}, B=${fmt(intermediate.B_cs,1)}, C=${fmt(intermediate.C_cs,1)}, D=${fmt(intermediate.D_cs,1)}, E=${fmt(intermediate.E_cs,1)}`),
                createCalcLine(`&nbsp;&nbsp;βₛ(t₀) = f(t₀, h<sub>fic</sub>) = <b>${fmt(intermediate.beta_s_t0)}</b>`),
                h('hr', { className: 'my-2 border-gray-300 dark:border-gray-600' }),
                createCalcLine(`<b>7. Deformação por Retração (ε<sub>cs</sub>):</b> ε<sub>cs</sub> = (ε₁ₛ·ε₂ₛ·(1-βₛ)) / 10⁴ = <b>${fmt(intermediate.epsilon_cs * 10000, 3)} x10⁻⁴</b>`),
                createCalcLine(`<b>8. Perda de Tensão (Δσ<sub>cs</sub>):</b> Δσ<sub>cs</sub> = ε<sub>cs</sub> · E<sub>p</sub> = <b>${shrinkage.value.toFixed(1)} MPa</b><span class="text-xs text-gray-500 dark:text-gray-400 float-right">${shrinkage.calc}</span>`)
            ];
        };

        const creepContent = () => {
            const { creep, creep_coefficient } = detailed_calcs;
            if (!creep || !creep_coefficient) return [];
            const { intermediate } = creep_coefficient;
            const fmt = (val, dec = 3) => (val !== undefined && !isNaN(val)) ? val.toFixed(dec) : 'N/A';

            return [
                createCalcLine(`<b>--- Cálculo do Coeficiente de Fluência φ(∞,t₀) ---</b>`),
                createCalcLine(`<b>1. Coeficiente de Fluência Básica (φₐ):</b> φₐ = f(t₀c) = <b>${fmt(intermediate.phi_a)}</b>`),
                createCalcLine(`<b>2. Coeficiente de Sobre-fluência (φf):</b>`),
                createCalcLine(`&nbsp;&nbsp;φ₁c = ${fmt(intermediate.phi_1c)}, φ₂c = ${fmt(intermediate.phi_2c)}`),
                createCalcLine(`&nbsp;&nbsp;A=${fmt(intermediate.A_cc,1)}, B=${fmt(intermediate.B_cc,1)}, C=${fmt(intermediate.C_cc,1)}, D=${fmt(intermediate.D_cc,1)}`),
                createCalcLine(`&nbsp;&nbsp;βc(t₀) = ${fmt(intermediate.beta_c_t0)}`),
                createCalcLine(`&nbsp;&nbsp;φf = φ₁c · φ₂c · (1 - βc(t₀)) = <b>${fmt(intermediate.phi_f)}</b>`),
                createCalcLine(`<b>3. Coeficiente de Fluência Final (φ):</b> φ = φₐ + φf + φd = ${fmt(intermediate.phi_a)} + ${fmt(intermediate.phi_f)} + ${fmt(intermediate.phi_d)} = <b>${creep_coefficient.value.toFixed(3)}</b>`),
                h('hr', { className: 'my-2 border-t-2 border-gray-400 dark:border-gray-500' }),
                createCalcLine(`<b>--- Cálculo da Perda de Tensão Δσcc ---</b>`),
                createCalcLine(`<b>Fórmula:</b> Δσ<sub>cc</sub> = α<sub>p</sub> &times; (σ<sub>c,p,perm</sub> + σ<sub>c,m,perm</sub>) &times; φ(∞,t₀)`),
                ...creep.map(c => h('div', {className: 'mt-2'}, [
                    createCalcLine(`<u>Para x=${c.x.toFixed(1)}m:</u>`),
                    createCalcLine(`&nbsp;&nbsp;σ<sub>c,perm</sub> = <b>${c.sigma_c_perm.toFixed(2)} MPa</b> <span class="text-xs text-gray-500 dark:text-gray-400 float-right">${c.sigma_c_perm_calc}</span>`),
                    createCalcLine(`&nbsp;&nbsp;<b>Δσ<sub>cc</sub></b> = <b>${c.value.toFixed(1)} MPa</b> <span class="text-xs text-gray-500 dark:text-gray-400 float-right">${c.calc}</span>`)
                ]))
            ];
        };

        const interactionContent = () => {
            const { interaction } = detailed_calcs;
            return [
                createCalcLine(`<b>Fórmula:</b> Δσ<sub>dif</sub> = (Δσ<sub>r</sub> + Δσ<sub>cs</sub> + Δσ<sub>cc</sub>) / (1 + χ<sub>∞</sub> + χ<sub>c</sub> &times; ρ<sub>p</sub> &times; η<sub>p</sub> &times; α<sub>p</sub>)`),
                ...interaction.map(c => h('div', {className: 'mt-2'}, [
                    createCalcLine(`<u>Para x=${c.x.toFixed(1)}m:</u>`),
                    createCalcLine(`&nbsp;&nbsp;Denominador (θ) = ${c.theta.toFixed(3)}`),
                    createCalcLine(`&nbsp;&nbsp;Numerador (Σ Perdas) = ${c.numerator.toFixed(1)} MPa`),
                    createCalcLine(`&nbsp;&nbsp;<b>Δσ<sub>dif</sub></b> = <b>${c.value.toFixed(1)} MPa</b> <span class="text-xs text-gray-500 dark:text-gray-400 float-right">${c.calc}</span>`)
                ]))
            ];
        };

        return createReportSection('detailed-losses-section', 'Memória de Cálculo das Perdas de Protensão', [
            h('h4', { className: 'font-semibold text-lg mb-2 text-center' }, ['1. Perdas Imediatas']),
            createCalcSubSection('5.1 Perda por Atrito', [
                createCalcLine('<b>Fórmula:</b> σ<sub>p</sub>(x) = σ<sub>p,max</sub> &times; e<sup>-(μ&alpha; + kx)</sup>'),
                ...frictionContent()
            ]),
            createCalcSubSection('5.2 Perda por Acomodação da Ancoragem (Encunhamento)', anchorageContent()),
            createCalcSubSection('5.3 Perda por Encurtamento Elástico do Concreto (Δσ<sub>ee</sub>)', elasticShorteningContent()),
            createCalcSubSection('Tensões após perdas imediatas:', immediateStressContent()),
            h('hr', {className: "my-6 border-t-2 dark:border-gray-600"}),
            h('h4', { className: 'font-semibold text-lg mb-2 text-center' }, ['2. Perdas Diferidas no Tempo']),
            createCalcSubSection('5.4 Perda por Relaxação do Aço', relaxationContent()),
            createCalcSubSection('5.5 Perda por Retração do Concreto', shrinkageContent()),
            createCalcSubSection('5.6 Perda por Fluência do Concreto', creepContent()),
            createCalcSubSection('5.7 Interação das Perdas Diferidas', interactionContent()),
        ]);
    }

    /**
     * Generates the HTML for the prestress loss analysis section, including a table and a chart placeholder.
     */
    function renderLossesTableAndChart(loss_results) {
        const { key_points, sigma_p_friction, sigma_p_anchorage, sigma_p_ime, sigma_p_inf } = loss_results;
        const fmt = (val) => val.toFixed(1);
       
        const tableHeader = h('thead', {}, [h('tr', {}, 
            ['x (m)', 'σ<sub>p</sub> (Atrito)', 'σ\'<sub>p</sub> (+Encunh.)', 'σ<sub>p,ime</sub> (Imediata)', 'σ<sub>p,inf</sub> (Final)']
            .map(text => h('th', { innerHTML: text }))
        )]);
       
        const tableBody = h('tbody', {}, key_points.map((point, i) => h('tr', { className: 'text-center' }, [
            h('td', {}, [point.x.toFixed(1)]),
            h('td', {}, [fmt(sigma_p_friction[i].value)]),
            h('td', {}, [fmt(sigma_p_anchorage[i].value)]),
            h('td', {}, [fmt(sigma_p_ime[i].value)]),
            h('td', {}, [fmt(sigma_p_inf[i].value)])
        ])));
   
        return createReportSection('losses-section', 'Resumo das Perdas e Gráfico', [
            h('div', { className: 'grid grid-cols-1 lg:grid-cols-5 gap-6' }, [
                h('div', { className: 'lg:col-span-2' }, [
                    h('h4', { className: 'font-semibold text-center mb-2' }, ['Tabela de Tensões no Aço (MPa)']),
                    h('div', { className: 'overflow-x-auto' }, [
                        h('table', { className: 'w-full results-table text-sm' }, [tableHeader, tableBody])
                    ])
                ]),
                h('div', { className: 'lg:col-span-3' }, [
                    h('h4', { className: 'font-semibold text-center mb-2' }, ['Gráfico de Perdas de Tensão']),
                    h('div', { className: 'p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg' }, [
                        h('div', { className: 'relative h-80' }, [h('canvas', { id: 'losses-chart-canvas' })])
                    ])
                ])
            ])
        ]);
    }

    /**
      * Generates the HTML for the prestressing force limit checks section.
      */
    function renderPrestressChecks(checks) {
        const { prestress_checks, materials } = checks;
        const fmt = (val, dec = 1) => (!isNaN(val)) ? val.toFixed(dec) : 'N/A';
       
        const P_min_tens_i_val = prestress_checks.P_min_tens_i.value * 1000;
        const P_max_comp_i_val = prestress_checks.P_max_comp_i.value * 1000;
        const P_min_comp_s_val = prestress_checks.P_min_comp_s.value * 1000;
        const P_max_tens_s_val = prestress_checks.P_max_tens_s.value * 1000;
       
        // Ignorar limites negativos (sem restrição)
        const effective_P_min = [];
        if (P_min_tens_i_val > 0) effective_P_min.push(P_min_tens_i_val);
        if (P_min_comp_s_val > 0) effective_P_min.push(P_min_comp_s_val);
        const P_min_req = effective_P_min.length > 0 ? Math.max(...effective_P_min) : 0;
       
        const effective_P_max = [];
        if (P_max_comp_i_val > 0) effective_P_max.push(P_max_comp_i_val);
        if (P_max_tens_s_val > 0) effective_P_max.push(P_max_tens_s_val);
        const P_max_req = effective_P_max.length > 0 ? Math.min(...effective_P_max) : Infinity; // Sem limite superior se nenhum válido
       
        const adopted_P_i_kN = prestress_checks.P_i * 1000;
        const is_valid = adopted_P_i_kN >= P_min_req && (P_max_req === Infinity || adopted_P_i_kN <= P_max_req);
       
        const summaryEl = h('div', { className: `p-4 rounded-lg ${is_valid ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}` }, [
            h('h3', { className: `font-bold text-lg text-center ${is_valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}` }, [is_valid ? 'Força de Protensão Adotada é Válida' : 'Força de Protensão Adotada é Inválida']),
            h('p', { className: 'text-center mt-2' }, [`Faixa Válida: ${fmt(P_min_req)} kN ≤ Pᵢ ≤ ${P_max_req === Infinity ? 'Sem limite superior' : fmt(P_max_req)} kN`]),
            h('p', { className: 'text-center text-xl font-bold mt-1' }, [`Pᵢ,adotado = ${fmt(adopted_P_i_kN)} kN`])
        ]);

        const getLimitText = (val, inequality) => val > 0 ? `${inequality} ${fmt(val)} kN` : 'Sem restrição';

        const tableRows = [
            h('tr', {}, [h('td', { innerHTML: `Compressão Inicial (σ ≤ ${fmt(materials.limits.comp_i, 1)})` }), h('td', {}, [getLimitText(P_max_comp_i_val, 'P ≤')])]),
            h('tr', {}, [h('td', { innerHTML: `Tração Inicial (σ ≤ ${fmt(materials.limits.tens_i, 1)})` }), h('td', {}, [getLimitText(P_min_tens_i_val, 'P ≥')])]),
            h('tr', {}, [h('td', { innerHTML: `Compressão em Serviço (σ ≤ ${fmt(materials.limits.comp_s, 1)})` }), h('td', {}, [getLimitText(P_min_comp_s_val, 'P ≥')])]),
            h('tr', {}, [h('td', { innerHTML: `Tração em Serviço (σ ≤ ${fmt(materials.limits.tens_s, 1)})` }), h('td', {}, [getLimitText(P_max_tens_s_val, 'P ≤')])]),
        ];

        return createReportSection('prestress-checks-section', 'Verificação da Força de Protensão (Meio do Vão)', [
            summaryEl,
            h('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4 mt-4' }, [
                h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg' }, [
                    h('h4', { className: 'font-semibold text-center' }, ['Limites de Força (kN)']),
                    h('table', { className: 'w-full mt-2 results-table text-sm' }, [h('tbody', {}, tableRows)])
                ]),
                h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg' }, [
                    h('h4', { className: 'font-semibold text-center' }, ['Diagrama de Tensões (Meio do Vão, MPa)']),
                    h('div', { className: 'relative h-64 w-full mt-2' }, [h('canvas', { id: 'stress-diagram-canvas' })])
                ])
            ])
        ]);
    }
   
    /**
     * Generates the HTML for the Ultimate Limit State (ULS/ELU) checks section.
     */
    function renderUlsChecks(checks) {
        const { uls_checks } = checks;
        if (!uls_checks) return document.createDocumentFragment();
        if (uls_checks.error) return h('p', { className: 'text-red-500' }, [uls_checks.error]);
   
        const { Md_kNm, MRd_kNm, ratio, x_m, d_p, z, y_cc_m, x_lim_ratio, ductility_check } = uls_checks;
        const fmt = (val, dec = 1) => (!isNaN(val)) ? val.toFixed(dec) : 'N/A';
        const is_valid = ratio <= 1.0 && ductility_check;

        const summaryEl = h('div', { className: `p-4 rounded-lg ${is_valid ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}` }, [
            h('h3', { className: `font-bold text-lg text-center ${is_valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}` }, [is_valid ? 'Verificação em ELU Aprovada' : 'Verificação em ELU Reprovada']),
            h('p', { className: 'text-center mt-2' }, [`M<sub>d</sub> / M<sub>Rd</sub> = ${fmt(Md_kNm, 1)} / ${fmt(MRd_kNm, 1)} = <b>${ratio.toFixed(3)}</b> ${ratio <= 1.0 ? ' (OK)' : ' (FALHA)'}`]),
            h('p', { className: 'text-center mt-1' }, [`x / d = ${fmt(x_m * 100, 1)} / ${fmt(d_p * 100, 1)} = <b>${(x_m/d_p).toFixed(3)}</b> ≤ ${x_lim_ratio.toFixed(3)} ${ductility_check ? ' (OK)' : ' (FALHA - Frágil)'}`])
        ]);

        const breakdownRows = [
            ['Momento Solicitante de Cálculo (M<sub>d</sub>)', `${fmt(Md_kNm, 1)} kN·m`],
            ['Altura Útil da Protensão (d<sub>p</sub>)', `${fmt(d_p * 100, 1)} cm`],
            ['Profundidade da Linha Neutra (x)', `${fmt(x_m * 100, 1)} cm`],
            ['Dist. Topo ao Centroide Comprimido (y<sub>cc</sub>)', `${fmt(y_cc_m * 100, 1)} cm`],
            ['Braço de Alavanca (z = d<sub>p</sub> - y<sub>cc</sub>)', `${fmt(z * 100, 1)} cm`],
            ['Momento Resistente de Cálculo (M<sub>Rd</sub>)', `<b>${fmt(MRd_kNm, 1)} kN·m</b>`],
        ];

        return createReportSection('uls-checks-section', 'Verificação de Flexão no Estado Limite Último (ELU)', [summaryEl, createSummaryTable('Memória de Cálculo - ELU', breakdownRows, 'mt-4')]);
    }

    // --- Event Listeners & Initialization ---
    function addCablePointRow(containerId, point = { x: 0, y: 0.35, type: 'Parabolic' }) {
        const container = document.getElementById(containerId);
        if (!container) return;
       
        const rowEl = document.createElement('div');
        rowEl.className = 'cable-path-row grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-2 items-center';
        rowEl.appendChild(h('input', { type: 'number', className: 'cable-x w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600', value: point.x }));
        rowEl.appendChild(h('input', { type: 'number', className: 'cable-y w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600', value: point.y }));
        rowEl.appendChild(h('select', { className: 'cable-type w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600' }, [
            `<option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Parabólico</option>
             <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Reto</option>`
        ]));
        rowEl.appendChild(h('button', { className: 'remove-cable-point-btn text-red-500 hover:text-red-700 font-bold text-lg w-8', title: 'Remover Ponto' }, ['&times;']));

        rowEl.querySelector('.remove-cable-point-btn').addEventListener('click', () => {
            rowEl.remove();
            drawDiagrams();
            const currentInputs = gatherAllInputs();
            saveInputsToLocalStorage('prestressed-beam-inputs-v2', currentInputs);
        });

        container.appendChild(rowEl);
    }

    const gatherAllInputs = () => {
        const inputs = inputManager.inputIds.reduce((acc, id) => {
            const el = document.getElementById(id);
            if (el) acc[id] = (el.type === 'number') ? parseFloat(el.value) || 0 : el.value;
            else acc[id] = 0;
            return acc;
        }, {});
        inputs.vertices = inputManager._parseVertices(document.getElementById('beam_coords')?.value);
        inputs.cable_path = inputManager._gatherCablePath();
        return inputs;
    };

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

    document.getElementById('add-cable-point-btn').addEventListener('click', () => {
        addCablePointRow('cable-path-container');
        debouncedDraw();
        debouncedSave();
    });

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

    function initializeApp() {
        const storageKey = 'prestressed-beam-inputs-v2';
        const savedData = localStorage.getItem(storageKey);

        if (savedData) {
            loadInputsFromLocalStorage(storageKey, allInputAndTextareaIds, (loadedInputs) => {
                if (loadedInputs && loadedInputs.cable_path) {
                    const container = document.getElementById('cable-path-container');
                    container.innerHTML = '';
                    loadedInputs.cable_path.forEach(point => addCablePointRow('cable-path-container', point));
                }
                drawDiagrams();
            });
        } else {
            // Default initial state if no saved data
            addCablePointRow('cable-path-container', { x: 0, y: 0.55, type: 'Straight' });
            addCablePointRow('cable-path-container', { x: 9, y: 0.10, type: 'Straight' });
            drawDiagrams();
        }
    }

    const handleRunCheck = () => {
        const inputs = gatherAllInputs();
        const results = concreteBeamCalculator.run(inputs);
        // REMOVED: Do not overwrite user input with estimated values.
        renderResults(results);
    };

    const handleSaveInputs = createSaveInputsHandler(allInputAndTextareaIds, 'viga-protendida-inputs.txt', 'feedback-message');
    const handleLoadInputs = createLoadInputsHandler(allInputAndTextareaIds, () => {
        const loadedInputs = JSON.parse(localStorage.getItem('temp-loaded-inputs'));
        if (loadedInputs && loadedInputs.cable_path) {
            const container = document.getElementById('cable-path-container');
            container.innerHTML = '';
            loadedInputs.cable_path.forEach(point => addCablePointRow('cable-path-container', point));
        }
        handleRunCheck();
        drawDiagrams();
        localStorage.removeItem('temp-loaded-inputs');
    }, 'feedback-message');

    initializeApp();

    document.getElementById('run-check-btn').addEventListener('click', handleRunCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
});
// ... (Your other drawing and UI functions like drawLossesChart, drawStressDiagram, etc., remain the same)

/**
 * Draws the prestressing losses chart using Chart.js.
 */
function drawLossesChart(canvasId, loss_data) {
    const chartCanvas = document.getElementById(canvasId);
    if (!chartCanvas || !loss_data || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    const datasets = [
        {
            label: 'x_a',
            data: [{ x: loss_data.detailed_calcs.anchorage.x_a, y: Math.min(...loss_data.sigma_p_inf.map(p => p.value)) }, { x: loss_data.detailed_calcs.anchorage.x_a, y: Math.max(...loss_data.sigma_p_friction.map(p => p.value)) }],
            borderColor: '#a78bfa',
            borderWidth: 1.5,
            borderDash: [6, 3],
            pointRadius: 0,
            order: 0
        },
        { label: 'Atrito', data: loss_data.sigma_p_friction, borderColor: '#3b82f6', borderDash: [10, 5], pointStyle: 'crossRot' },
        { label: 'Atrito + Encunh.', data: loss_data.sigma_p_anchorage, borderColor: '#f97316', borderDash: [5, 5], pointStyle: 'circle' },
        { label: 'Imediata (Total)', data: loss_data.sigma_p_ime, borderColor: '#ef4444', pointStyle: 'triangle' },
        { label: 'Final (Total)', data: loss_data.sigma_p_inf, borderColor: isDark ? '#E5E7EB' : '#1F2937', borderWidth: 2.5, pointStyle: 'rect' },
    ].map(ds => ({
        ...ds,
        data: ds.data.map(p => ({ x: p.x, y: p.value })),
        fill: false,
        tension: 0.1,
        pointRadius: 4,
        pointHoverRadius: 6
    }));

    let existingChart = Chart.getChart(chartCanvas);
    if (existingChart) {
        existingChart.destroy();
    }

    new Chart(chartCanvas, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'x (m)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    title: { display: true, text: 'σp (MPa)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            },
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        color: textColor, 
                        usePointStyle: true,
                        filter: (legendItem) => legendItem.text !== 'x_a'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (tooltipItems) => `x = ${tooltipItems[0].parsed.x.toFixed(2)} m`,
                        label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} MPa`
                    }
                }
            }
        }
    });
}

/**
 * Draws the stress profile diagram using Chart.js.
 */
/**
 * Draws the stress profile diagram using Chart.js, including the cross-section line and horizontal stress indicators.
 */
function drawStressDiagram(canvasId, results) {
    const chartCanvas = document.getElementById(canvasId);
    if (!chartCanvas || !results || !results.stress_profiles || typeof Chart === 'undefined') return;

    const { stress_profiles, properties } = results;
    const { initial, final: final_stress } = stress_profiles;
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    // --- NOVO PLUGIN PARA DESENHAR AS LINHAS HORIZONTAIS ---
    const horizontalStressLines = {
        id: 'horizontalStressLines',
        afterDatasetsDraw(chart, args, options) {
            const { ctx, chartArea: { top, bottom }, scales: { x, y } } = chart;
            ctx.save();

            // Percorre os datasets de 'Inicial' e 'Final'
            chart.getDatasetMeta(0).data.forEach(datapoint => {
                ctx.beginPath();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'; // Cor do 'Inicial' com transparência
                ctx.moveTo(x.getPixelForValue(0), datapoint.y); // Começa na linha central (x=0)
                ctx.lineTo(datapoint.x, datapoint.y); // Vai até o ponto de tensão
                ctx.stroke();
            });

            chart.getDatasetMeta(1).data.forEach(datapoint => {
                ctx.beginPath();
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'; // Cor do 'Final' com transparência
                ctx.moveTo(x.getPixelForValue(0), datapoint.y);
                ctx.lineTo(datapoint.x, datapoint.y);
                ctx.stroke();
            });

            ctx.restore();
        }
    };
    // --- FIM DO PLUGIN ---

    // Coleta todos os valores de tensão para encontrar os limites
    const allStresses = [
        initial.top, initial.bottom,
        final_stress.top, final_stress.bottom,
        0 // Garante que a linha x=0 esteja sempre visível
    ];

    // Calcula o mínimo e o máximo, e adiciona uma "folga"
    const stressMin = Math.min(...allStresses);
    const stressMax = Math.max(...allStresses);
    const xPadding = (stressMax - stressMin) * 0.1;
    const scaleMinX = stressMin - xPadding;
    const scaleMaxX = stressMax + xPadding;

    // --- NOVO: Adiciona padding ao eixo Y ---
    const yPadding = (properties.y_max - properties.y_min) * 0.1;
    const scaleMinY = properties.y_min - yPadding;
    const scaleMaxY = properties.y_max + yPadding;

    const datasets = [
        { 
            label: 'Inicial', 
            data: [{ x: initial.bottom, y: properties.y_min }, { x: initial.top, y: properties.y_max }], 
            borderColor: '#3b82f6', 
            showLine: true,
            order: 1 // Garante que esta linha fique na frente
        },
        { 
            label: 'Final', 
            data: [{ x: final_stress.bottom, y: properties.y_min }, { x: final_stress.top, y: properties.y_max }], 
            borderColor: '#ef4444', 
            showLine: true,
            order: 2 // Garante que esta linha fique na frente
        },
        // --- NOVO DATASET PARA A LINHA VERTICAL DA SEÇÃO ---
        {
            label: 'Seção',
            data: [{ x: 0, y: properties.y_min }, { x: 0, y: properties.y_max }],
            borderColor: isDark ? '#E5E7EB' : '#1F2937', // Cor da seção
            borderWidth: 2,
            showLine: true,
            pointRadius: 0, // Sem pontos nos extremos
            order: 3 // Garante que a seção fique atrás das linhas de tensão
        }
    ];

    let existingChart = Chart.getChart(chartCanvas);
    if (existingChart) {
        existingChart.destroy();
    }

    new Chart(chartCanvas, {
        type: 'scatter',
        data: { datasets },
        // --- REGISTRA O NOVO PLUGIN AQUI ---
        plugins: [horizontalStressLines],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    title: { display: true, text: 'Altura da Viga (cm)', color: textColor },
                    min: scaleMinY,
                    max: scaleMaxY,
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                x: {
                    title: { display: true, text: 'Tensão (MPa)', color: textColor },
                    position: 'top',
                    min: scaleMinX,
                    max: scaleMaxX,
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            },
            elements: { line: { tension: 0 } },
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        color: textColor,
                        // Filtra a legenda para não mostrar 'Seção'
                        filter: (legendItem, chartData) => {
                            return legendItem.text !== 'Seção';
                        }
                    } 
                },
                tooltip: {
                    callbacks: {
                        label: (context) => `Tensão: ${context.parsed.x.toFixed(2)} MPa`
                    }
                },
                zoom: {
                    pan: { enabled: true, mode: 'xy' },
                    zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'xy' }
                }
            }
        }
    });
}