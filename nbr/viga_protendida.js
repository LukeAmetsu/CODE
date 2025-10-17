/**
 * @file viga_protendida.js
 * @description NBR 6118 Prestressed Concrete Beam Checker with Prestressing Loss Calculations.
 * Translates the logic from the provided PDF into a web application.
 */

/**
 * Manages gathering all user inputs from the DOM.
 */
const inputManager = {
    /** List of standard input element IDs to gather. */
    inputIds: [
        'design_code', 'unit_system', 'fck', 'age_at_prestress', 'Ap', 'Kperdas', 'N_cables',
        'load_pp', 'load_perm', 'load_var', 'beam_length', 'beam_height', 'beam_coords',
        'humidity', 'fptk', 'mu', 'k', 'anchorage_slip'
    ],

    /**
     * Parses a multiline string of coordinates into an array of [x, y] pairs.
     * @param {string} text - The string from the textarea.
     * @returns {Array<[number, number]>} An array of vertex coordinates.
     */
    _parseVertices(text) {
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

        // The formulas used here are based on Green's theorem for calculating properties of polygons.
        // This is often known as the "shoelace formula" or "surveyor's formula".
        // See: https://en.wikipedia.org/wiki/Shoelace_formula
        // And: https://en.wikipedia.org/wiki/Centroid#Of_a_polygon

        const points = [...vertices, vertices[0]]; // Close the polygon by repeating the first vertex at the end.
        let A = 0.0,
            Qx = 0.0, // First moment of area about the x-axis
            Qy = 0.0, // First moment of area about the y-axis
            Ix = 0.0, // Second moment of area about the x-axis (from origin)
            Iy = 0.0; // Second moment of area about the y-axis (from origin)

        for (let i = 0; i < vertices.length; i++) {
            const [x0, y0] = points[i];
            const [x1, y1] = points[i + 1];

            // This term is the signed area of the trapezoid formed by the segment and the x-axis.
            const term = (x0 * y1) - (x1 * y0);

            // Sum of signed areas of trapezoids gives 2 * Area of the polygon.
            A += term;

            // First moment of area (used to find the centroid).
            Qy += (y0 + y1) * term; // about x-axis
            Qx += (x0 + x1) * term; // about y-axis

            // Second moment of area (moment of inertia) with respect to the origin.
            Ix += (y0 ** 2 + y0 * y1 + y1 ** 2) * term; // about x-axis
            Iy += (x0 ** 2 + x0 * x1 + x1 ** 2) * term; // about y-axis
        }

        // The area is half the accumulated sum.
        A /= 2.0;
        if (Math.abs(A) < 1e-6) return null;

        // Centroid coordinates (cx, cy). The division by 6*A is part of the formula.
        const cx = Qx / (6.0 * A);
        const cy = Qy / (6.0 * A);

        // Moment of inertia with respect to the origin. The division by 12 is part of the formula.
        const I_origin_x = Ix / 12.0;
        const I_origin_y = Iy / 12.0;

        // Use the parallel axis theorem to transfer the moment of inertia to the centroidal axis.
        // I_centroid = I_origin - Area * distance^2
        const I_cx = I_origin_x - A * cy ** 2;
        const I_cy = I_origin_y - A * cx ** 2;

        // Find distances from the centroid to the top (ys) and bottom (yi) fibers.
        const y_min = Math.min(...vertices.map(p => p[1]));
        const y_max = Math.max(...vertices.map(p => p[1]));
        const yi = cy - y_min;
        const ys = y_max - cy;

        // Section modulus (W = I / y).
        const Wi = Math.abs(yi) > 1e-6 ? Math.abs(I_cx) / Math.abs(yi) : Infinity;
        const Ws = Math.abs(ys) > 1e-6 ? Math.abs(I_cx) / Math.abs(ys) : Infinity;
        //Auxiliary Modulus for prestressing calculations
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
    
    /**
     * Solves for the required prestressing force P based on a stress limit.
     * @param {number} sigma_limit - The stress limit [MPa].
     * @param {number} W - The section modulus (with sign) [m³].
     * @param {number} M - The bending moment [MN·m].
     * @param {number} A - The cross-section area [m²].
     * @param {number} e - The eccentricity [m].
     * @returns {object} The required force P [MN] and calculation breakdown.
     */
    function solveForPrestressForce(sigma_limit, W, M, A, e) {
        const numerador = A * (sigma_limit * W - M);
        const denominador = W + A * e;
        const calc_string = `[${A.toFixed(4)} * (${sigma_limit.toFixed(2)} * ${W.toFixed(4)} - ${M.toFixed(4)})] / (${W.toFixed(4)} + ${A.toFixed(4)} * ${e.toFixed(4)})`;

        if (Math.abs(denominador) < 1e-9) {
            return {
                value: NaN,
                calc: "Error: Division by zero. (W + A*e) is close to zero."
            };
        }
        const value = numerador / denominador;
        return {
            value: value,
            calc: calc_string
        };
    }

    /**
     * Linear interpolation between two points.
     */
    function interpolate(x_pos, xs, ys) {
        const [x0, x1] = xs;
        const [y0, y1] = ys;
        if (Math.abs(x1 - x0) < 1e-6) return y0;
        const t = (x_pos - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
    }

    /**
     * Calculates concrete and steel material properties based on NBR 6118.
     * @param {object} inputs - Object containing fck and age_at_prestress.
     * @returns {object} An object with all calculated material properties and limits.
     */
    function calculateMaterialProperties({ fck, age_at_prestress }) {
        // NBR 6118: 8.2.4 - Mean compressive strength of concrete.
        const fcm = fck <= 50 ? fck + 8 : 1.1 * fck;
        // NBR 6118: 8.2.10.1 - Coefficient 's' for cement type (0.20 for CP III, IV).
        const s_beta = 0.20;
        // NBR 6118: 8.2.10.1 - Coefficient to account for strength gain over time 't'.
        const beta1 = Math.exp(s_beta * (1 - Math.pow(28 / age_at_prestress, 0.5)));
        // NBR 6118: 8.2.10.1 - Compressive strength at age 't' (age_at_prestress).
        const fci = beta1 * fcm;
        // NBR 6118: 8.2.5 - Mean tensile strength.
        const fctm = fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + 0.11 * fck);
        // NBR 6118: 8.2.5 - Lower characteristic tensile strength.
        const fctk_inf = 0.7 * fctm;
        // Characteristic tensile strength in flexure. Often taken as fctk,sup, but here using a common simplification.
        const fctf = 1.2 * fctk_inf;
        // NBR 6118: 8.2.8 - Initial (tangent) modulus of elasticity for concrete.
        const E_ci = 5600 * Math.sqrt(fck);
        // Modulus of elasticity for prestressing steel (assumed).
        const E_p = 200000;
        // Modular ratio between steel and concrete.
        const alpha_p = E_p / E_ci;

        // Stress Limits (NBR 6118: 17.2.4.3)
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
        const p_CQP = g_k + 0.4 * load_var; // Combinação Quase-Permanente
        const p_CF = g_k + 0.6 * load_var;  // Combinação Frequente
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
    function performInitialPrestressChecks({ fptk, Ap_m2, ecc_mid, materials, moments, A_m2, Ws_m3, Wi_m3 }) {
        const sigma_pi = 0.74 * fptk;
        const P_i = Ap_m2 * sigma_pi; // MN

        const P_max_comp_i_res = solveForPrestressForce(-materials.limits.comp_i, -Ws_m3, moments.M_g1k / 1000, A_m2, ecc_mid);
        const P_min_tens_i_res = solveForPrestressForce(materials.limits.tens_i, Wi_m3, moments.M_g1k / 1000, A_m2, ecc_mid);
        const P_min_comp_s_res = solveForPrestressForce(-materials.limits.comp_s, -Ws_m3, moments.M_CQP / 1000, A_m2, ecc_mid);
        const P_max_tens_s_res = solveForPrestressForce(materials.limits.tens_s, Wi_m3, moments.M_CF / 1000, A_m2, ecc_mid);

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
    function calculateInitialPrestressEstimate({ moments, materials, props, Kperdas, N_cables, ecc_mid, Ap, fptk }) {
        // Calculate force per cable: P_cable = Ap * 0.74 * fptk
        const P_cable = (Ap / 100*100) * (0.74 * fptk*1000); // Ap in cm², fptk in MPa (N/mm²), result in kN

        const M_aux_kNm = Math.max(moments.M_CF, moments.M_CQP) - (props.W.i / 1e6) * materials.fctf*1000; // M in kNm, Wi in m3
        const ks_m = props.ks / 100; // convert cm to m
        const denominator = ks_m + Math.abs(ecc_mid);

        let P_est_i = 0;
        if (Math.abs(denominator) > 1e-9) {
            P_est_i = (M_aux_kNm) / denominator; // P_est_i in MN
        }

        const P_est_i_kN = P_est_i;
        const Pest_perdas = Kperdas > 0 ? P_est_i_kN / Kperdas : 0;
        const num_tendons = (P_cable > 0 && N_cables > 0) ? Math.ceil((Pest_perdas / P_cable) / N_cables) : 0;

        return {
            M_aux_kNm,
            ks_m,
            P_est_i: P_est_i_kN,
            Pest_perdas,
            num_tendons
        };
    }
    
     /**
      * Main calculation function, updated to follow the PDF logic.
      * @param {object} inputs - The gathered user inputs.
      * @returns {object} The results of the calculation.
      */
    function run(raw_inputs) {
        const inputs = {...raw_inputs}; // Make a mutable copy
        const { vertices, fck, beam_length, cable_path } = inputs;
        const Ap_cm2 = parseFloat(inputs.Ap) || 0;

        // --- 1. Validate Inputs & Section Properties ---
        if (!vertices || vertices.length < 3 || fck <= 0 || beam_length <= 0 || Ap_cm2 <= 0) {
            return { errors: ["Invalid inputs. Ensure all values are positive and vertices are sufficient."] };
        }
        const props = calculateSectionProperties(vertices);
        if (!props) {
            return { errors: ["Invalid beam cross-section vertices."] };
        }
        const A_m2 = props.area / 1e4;
        const Ap_m2 = Ap_cm2 / 1e4;
        const Wi_m3 = props.W.i / 1e6;
        const Ws_m3 = props.W.s / 1e6;
        const I_cx_m4 = props.I.cx / 1e8;

        // --- 2. Material Properties (NBR 6118 & PDF) ---
        const materials = calculateMaterialProperties(inputs);

        // --- 3. Loads & Moments ---
        const { loads, moments } = calculateLoadsAndMoments(inputs);

        // --- 4. Define Cable Path & Key Points ---
        const y_cg = props.centroid.y / 100; // in m
        const y_min_beam_m = Math.min(...vertices.map(p => p[1])) / 100;

        const cable_path_abs = cable_path.map(p => ({ ...p, y: p.y * props.height / 100 + y_min_beam_m }));
        const key_points = [...new Set(cable_path.map(p => p.x))].sort((a,b) => a-b);
        if(!key_points.includes(beam_length/2)) key_points.push(beam_length/2);
        key_points.sort((a,b) => a-b);

        const path_details = key_points.map(x => {
            const y = getCablePositionAt(x, cable_path_abs, beam_length);
            const e = y - y_cg;
            return { x, y, e };
        });

        // --- 5. Initial Prestress and Stress Limit Checks (at mid-span) ---
        const mid_span_details = path_details.find(p => p.x === beam_length / 2);
        const ecc_mid = mid_span_details.e;
        const prestress_checks = performInitialPrestressChecks({ ...inputs, Ap_m2, ecc_mid, materials, moments, A_m2, Ws_m3, Wi_m3 });
        
        // --- 5b. Preliminary Prestress Estimation (as requested) ---
        const prestress_estimation = calculateInitialPrestressEstimate({ ...inputs, moments, materials, props, ecc_mid });

        // --- 6. Detailed Prestress Loss Calculation (Following PDF Logic) ---
        const loss_results = calculateDetailedLosses(inputs, props, materials, path_details, moments, prestress_checks.P_i, prestress_checks.sigma_pi, cable_path_abs);
        
        // --- 7. Final Stress Profiles ---
        const P_eff_mid_val_result = loss_results.sigma_p_inf.find(p=>p.x === beam_length/2);
        const P_eff_mid = P_eff_mid_val_result ? (P_eff_mid_val_result.value * Ap_m2) : 0;

        const stress_profiles = {
             initial: {
                 top: (-prestress_checks.P_i / A_m2) + (prestress_checks.P_i * ecc_mid / Ws_m3) - (moments.M_g1k / 1000 / Ws_m3),
                 bottom: (-prestress_checks.P_i / A_m2) - (prestress_checks.P_i * ecc_mid / Wi_m3) + (moments.M_g1k / 1000 / Wi_m3)
             },
             final: {
                 top: (-P_eff_mid / A_m2) + (P_eff_mid * ecc_mid / Ws_m3) - (moments.M_CQP / 1000 / Ws_m3),
                 bottom: (-P_eff_mid / A_m2) - (P_eff_mid * ecc_mid / Wi_m3) + (moments.M_CF / 1000 / Wi_m3)
             }
         };
         
        return {
            checks: {
                properties: props,
                materials,
                loads: { pp: inputs.load_pp, perm: inputs.load_perm, var: inputs.load_var, ...loads },
                moments,
                path_details,
                prestress_checks,
                prestress_estimation,
                loss_results,
                stress_profiles
            },
            inputs
        };
    }
    
    /**
    * Calculates detailed prestressing losses based on NBR 6118 and the provided PDF.
    */
    function calculateDetailedLosses(inputs, props, materials, path_details, moments, P_i, sigma_pi, cable_path_abs) {
        const { beam_length, humidity, mu, k, anchorage_slip } = inputs;
        const Ap_m2 = parseFloat(inputs.Ap) / 1e4;
        const { E_p, E_ci, alpha_p } = materials;
        const A_m2 = props.area / 1e4;
        const I_cx_m4 = props.I.cx / 1e8;
        
        // Step 1: Friction Loss
        let cumulative_alpha = 0;
        const sigma_p_friction = path_details.map((point, i) => {
            if (i > 0) {
                const prev_point = path_details[i-1];
                const alpha_seg = Math.abs(getTangentAngleAt(point.x, cable_path_abs, beam_length) - getTangentAngleAt(prev_point.x, cable_path_abs, beam_length));
                cumulative_alpha += alpha_seg;
            }
            const value = sigma_pi * Math.exp(-(mu * cumulative_alpha + k * point.x));
            return { x: point.x, value };
        });

        // Step 2: Anchorage Slip Loss
        const delta = anchorage_slip; // in mm
        const A_delta = E_p * (delta / 1000); // MPa.m
        let A_i = 0;
        let x_a = 0;
        const betas = [];
        for (let i = 0; i < sigma_p_friction.length - 1; i++) {
            const p1 = sigma_p_friction[i];
            const p2 = sigma_p_friction[i+1];
            if (Math.abs(p2.x - p1.x) < 1e-9) continue;
            const beta = (p1.value - p2.value) / (p2.x - p1.x);
            betas.push(beta);
            A_i += beta * (p2.x - p1.x) * (p1.x + p2.x);
            if(A_i >= A_delta) {
                const A_prev = A_i - beta * (p2.x - p1.x) * (p1.x + p2.x);
                const term = p1.x**2 + (A_delta - A_prev)/beta;
                if (term >= 0) {
                   x_a = Math.sqrt(term);
                }
                break;
            }
        }
        if (x_a === 0) x_a = beam_length; // Slip affects the whole beam
        const sigma_pa = interpolate(x_a, sigma_p_friction.map(p=>p.x), sigma_p_friction.map(p=>p.value));
        
        const sigma_p_anchorage = sigma_p_friction.map(p => {
            const value = p.x < x_a ? 2 * sigma_pa - p.value : p.value;
            return {x: p.x, value};
        });

        // Step 3: Elastic Shortening
        const n_cabos = 2; // Assuming 2 cables as per PDF example for multi-cable reduction factor
        const factor_ee = (n_cabos > 1) ? (n_cabos - 1) / (2 * n_cabos) : 0;
        
        const delta_sigma_ee = path_details.map(p => {
             const M_g1k_x = (inputs.load_pp * p.x * (beam_length - p.x)) / 2;
             const sigma_p_val = sigma_p_anchorage.find(s=>s.x===p.x)?.value || 0;
             const P_x = sigma_p_val * Ap_m2;
             const sigma_c = (P_x / A_m2) + (P_x * p.e * p.e / I_cx_m4) - (M_g1k_x / 1000 * p.e / I_cx_m4);
             const value = alpha_p * sigma_c * factor_ee;
             return {x: p.x, value};
        });

        // Step 4: Immediate Stress
        const sigma_p_ime = sigma_p_anchorage.map((p, i) => {
            const value = p.value - delta_sigma_ee[i].value;
            return {x: p.x, value};
        });

        // Step 5: Relaxation
        const delta_sigma_r = sigma_p_ime.map(p => {
            const zeta = p.value / inputs.fptk;
            const psi_1000 = (zeta >= 0.6 && zeta < 0.7) ? 0.025 - (0.025 - 0.013) * ((0.7 - zeta) / 0.1) : (zeta >= 0.7 ? 0.025 : 0.013);
            const psi_inf = 2.5 * psi_1000;
            const chi_inf = -Math.log(1 - psi_inf);
            const value = chi_inf * p.value;
            return {x: p.x, value, chi_inf: 1+chi_inf};
        });

        // Step 6 & 7: Shrinkage & Creep
        const epsilon_sh = 0.0003; // NBR 6118 simplified
        const delta_sigma_cs = E_p * epsilon_sh;
        const phi = 2.0; // NBR 6118 simplified creep coeff
        
        const delta_sigma_cc = path_details.map((p,i) => {
             const M_gk_x = (inputs.load_pp + inputs.load_perm) * p.x * (beam_length - p.x) / 2;
             const P_ime_x = sigma_p_ime[i].value * Ap_m2;
             const sigma_c_perm = (P_ime_x / A_m2) + (P_ime_x * p.e * p.e / I_cx_m4) - (M_gk_x / 1000 * p.e / I_cx_m4);
             const value = alpha_p * sigma_c_perm * phi;
             return {x: p.x, value};
        });

        // Deferred Loss Interaction
        const rho_p = Ap_m2 / A_m2;
        const chi_c = 1 + 0.5 * phi;
        
        const delta_sigma_dif = path_details.map((p, i) => {
             const eta_p = p.e * p.e * A_m2 / I_cx_m4;
             const theta = delta_sigma_r[i].chi_inf + chi_c * rho_p * eta_p * alpha_p;
             if (Math.abs(theta) < 1e-9) return {x: p.x, value: 0};
             const value = (delta_sigma_r[i].value + delta_sigma_cs + delta_sigma_cc[i].value) / theta;
             return {x: p.x, value};
        });

        // Final Stress
        const sigma_p_inf = sigma_p_ime.map((p,i) => {
            const value = p.value - delta_sigma_dif[i].value;
            return {x: p.x, value};
        });

        return {
            key_points: path_details.map(p=>p.x),
            sigma_p_friction,
            sigma_p_anchorage,
            sigma_p_ime,
            sigma_p_inf,
        };
    }

    function getTangentAngleAt(x_pos, cable_path_abs, beam_length) {
         const h = 0.001;
         const y1 = getCablePositionAt(x_pos - h, cable_path_abs, beam_length);
         const y2 = getCablePositionAt(x_pos + h, cable_path_abs, beam_length);
         return Math.atan((y2 - y1) / (2 * h));
    }

    /**
     * Calculates the cable's y-coordinate at a given position 'x' along the beam.
     * @param {number} x_pos - The position along the beam length.
     * @param {Array<object>} cable_path_abs - The array of cable path points with absolute y-coordinates in meters and type.
     * @param {number} beam_length - Total beam length.
     * @returns {number} The calculated absolute y-coordinate at x_pos in meters.
     */
    function getCablePositionAt(x_pos, cable_path_abs, beam_length) { // This version is corrected to prevent infinite recursion.
        if (!cable_path_abs || cable_path_abs.length === 0) return 0;
        if (cable_path_abs.length === 1) return cable_path_abs[0].y;

        let eval_x = x_pos; // Use a mutable variable for the position to be evaluated.
        const last_defined_x = cable_path_abs[cable_path_abs.length - 1].x;

        // Check if the requested point is in the "mirrored" symmetric half of the beam.
        if (x_pos > last_defined_x && last_defined_x <= (beam_length / 2) + 1e-6) {
            eval_x = beam_length - x_pos;
        }

        // Loop through the defined segments to find the one containing our evaluation point.
        for (let i = 0; i < cable_path_abs.length - 1; i++) {
            const p1 = cable_path_abs[i];
            const p2 = cable_path_abs[i + 1];

            // Check if the evaluation point is within the current segment.
            if (eval_x >= p1.x - 1e-9 && eval_x <= p2.x + 1e-9) {
                if (p1.type === 'Parabolic') {
                    // Determine vertex and other point for the parabola equation y = a(x-h)^2 + k
                    let vertex = p1.y < p2.y ? p1 : p2;
                    let other_point = p1.y < p2.y ? p2 : p1;
                    if (Math.abs(p2.x - p1.x) < 1e-6) return p1.y;

                    const h = vertex.x;
                    const k = vertex.y;
                    const denominator = (other_point.x - h) ** 2;
                    if (Math.abs(denominator) < 1e-9) return k; // Avoid division by zero
                    const a = (other_point.y - k) / denominator;
                    
                    return a * (eval_x - h) ** 2 + k;

                } else { // 'Straight' segment
                    return interpolate(eval_x, [p1.x, p2.x], [p1.y, p2.y]);
                }
            }
        }

        // Fallback for cases where x_pos is exactly at the last point or beyond the defined path
        // in a non-symmetric case.
        return cable_path_abs[cable_path_abs.length - 1].y;
    }
    
    return { run, calculateSectionProperties, getCablePositionAt }; // Expose main run function
})();

/**
 * Draws the beam's cross-section on a canvas using Chart.js.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {Array<[number, number]>} vertices - An array of [x, y] coordinates for the cross-section in cm.
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

    if (!vertices || vertices.length < 3) {
        // Optionally render a message on the canvas if vertices are invalid
        return;
    }

    const props = concreteBeamCalculator.calculateSectionProperties(vertices);
    if (!props) return;

    // --- Start: 1:1 Scale Calculation ---
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
    // --- End: 1:1 Scale Calculation ---

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
                    // Set min/max to enforce 1:1 aspect ratio
                    min: centerX - maxRange / 2,
                    max: centerX + maxRange / 2,
                },
                y: {
                    title: { display: true, text: 'y (cm)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    // Set min/max to enforce 1:1 aspect ratio
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
 * Draws the longitudinal view of the beam, including the centroid and cable path, on a canvas.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {object} inputs - The user inputs object, containing beam_length, cable_path, and vertices.
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
                    grid: { color: gridColor }
                },
                y: {
                    title: { display: true, text: 'Altura (cm)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
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
 * --- UI and Drawing Functions ---
 */
document.addEventListener('DOMContentLoaded', () => {
    /**
     * Creates an HTML element with specified properties and children. A lightweight helper for DOM creation.
     * @param {string} tag - The HTML tag name.
     * @param {object} [props={}] - An object with properties to set on the element (e.g., className, textContent, id).
     * @param {(Node|string)[]} [children=[]] - An array of child nodes or strings to append.
     * @returns {HTMLElement} The created element.
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
            if (typeof child === 'string') {
                el.appendChild(document.createTextNode(child));
            } else if (child instanceof Node) {
                el.appendChild(child);
            }
        });
        return el;
    }

    /**
     * Helper to create a standard report section with a header and copy button.
     * @param {string} id - The ID for the section container.
     * @param {string} title - The title for the report header.
     * @param {HTMLElement[]} contentChildren - An array of child elements for the content area.
     * @returns {HTMLElement} The complete section element.
     */
    function createReportSection(id, title, contentChildren) {
        return h('div', { id, className: 'report-section-copyable' }, [
            h('div', { className: 'flex justify-between items-center mb-2' }, [
                h('h3', { className: 'report-header' }, [title]),
                h('button', { 'data-copy-target-id': id, className: 'copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden' }, ['Copy Section'])
            ]),
            h('div', { className: 'copy-content' }, contentChildren)
        ]);
    }

    /**
     * Helper to create a summary table.
     * @param {string} captionText - The caption for the table.
     * @param {Array<[string, string]>} rowsData - An array of [label, value] pairs for the table rows.
     * @param {string} [marginTop='mt-2'] - Optional margin-top class.
     * @returns {HTMLTableElement} The created table element.
     */
    function createSummaryTable(captionText, rowsData, marginTop = 'mt-2') {
        return h('table', { className: `w-full ${marginTop} summary-table` }, [
            h('caption', { className: 'report-caption' }, [captionText]),
            h('tbody', {}, rowsData.map(([label, value]) =>
                h('tr', {}, [
                    h('td', {}, [label]),
                    h('td', {}, [value])
                ])
            ))
        ]);
    }

    /**
     * Renders the entire calculation report into the DOM.
     * It orchestrates calls to more specific rendering functions.
     * @param {object} results - The main results object from the `run` function.
     * @param {object} results.checks - The detailed calculation checks and results.
     * @param {object} results.inputs - The user inputs used for the calculation.
     * @param {Array<string>} [results.errors] - An array of error messages if the calculation failed.
     * @returns {void}
     */
    function renderResults(results) {
        const resultsContainer = document.getElementById('results-container');
        const { checks, inputs } = results;
        if (!checks || results.errors) {
            resultsContainer.innerHTML = ''; // Clear previous results
            resultsContainer.appendChild(h('p', { className: 'text-center text-red-500' }, [`Calculation failed: ${results.errors?.[0] || 'Unknown error'}`]));
            return;
        }

        const reportFragment = document.createDocumentFragment();
        const reportContainer = h('div', { id: 'concrete-beam-report', className: 'bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6' }, [
            h('div', { className: 'flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden' }, [
                h('button', { id: 'download-pdf-btn', className: 'bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm' }, ['Download PDF']),
                h('button', { id: 'copy-report-btn', className: 'bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm' }, ['Copiar Relatório'])
            ]),
            h('h2', { className: 'text-2xl font-bold text-center border-b pb-2' }, ['Relatório de Verificação da Viga Protendida (NBR 6118)']),
            renderInputSummary(inputs),
            renderCalculatedProperties(checks),
            renderPrestressChecks(checks),
            renderPrestressEstimation(checks),
            renderLossesTableAndChart(checks.loss_results)
        ]);

        reportFragment.appendChild(reportContainer);
        resultsContainer.innerHTML = ''; // Clear previous content
        resultsContainer.appendChild(reportFragment);

        drawStressDiagram('stress-diagram-canvas', checks);
        drawLossesChart('losses-chart-canvas', checks.loss_results);
    }
    
    /**
     * Generates the HTML for the input summary section of the report.
     * @param {object} inputs - The user inputs object.
     * @returns {HTMLElement} The HTMLElement for the input summary section.
     */
    function renderInputSummary(inputs) {
        const { fck, load_pp, load_perm, load_var, beam_length, Ap } = inputs;
        const generalRows = [
            ['Concrete Strength (f<sub>ck</sub>)', `${fck} MPa`],
            ['Beam Length (L)', `${beam_length} m`],
            ['Tendon Area (A<sub>p</sub>)', `${parseFloat(Ap).toFixed(2)} cm²`]
        ];
        const loadRows = [
            ['Self-Weight (g<sub>pp</sub>)', `${load_pp} kN/m`],
            ['Permanent Load (g<sub>perm</sub>)', `${load_perm} kN/m`],
            ['Variable Load (q<sub>var</sub>)', `${load_var} kN/m`]
        ];

        return createReportSection('input-summary-section', 'Input Summary', [
            createSummaryTable('General & Material Properties', generalRows),
            createSummaryTable('Service Loads (ELS)', loadRows, 'mt-4')
        ]);
    }

    /**
     * Generates the HTML for the calculated properties and demands section of the report.
     * @param {object} checks - The `checks` object from the main calculation results.
     * @returns {HTMLElement} The HTMLElement for the calculated properties section.
     */
    function renderCalculatedProperties(checks) {
        const { properties, materials, loads, moments, path_details } = checks;
        const fmt = (val, dec = 2) => (val !== undefined && val !== null && !isNaN(val)) ? val.toFixed(dec) : 'N/A';
        const mid_span_details = path_details.find(p => p.x === parseFloat(document.getElementById('beam_length').value)/2);

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

        return createReportSection('calculated-props-section', 'Calculated Properties & Demands', [
            createSummaryTable('Geometric Properties', geometricRows, 'mt-2'),
            createSummaryTable('Material Properties', materialRows, 'mt-4'),
            h('table', { className: 'w-full mt-4 summary-table' }, [
                h('caption', { className: 'report-caption' }, ['Load Combinations (ELS)']),
                h('tbody', {}, loadComboRows.map(([label, value, formula]) => h('tr', {}, [h('td', { innerHTML: label }), h('td', { innerHTML: value }), h('td', { innerHTML: formula, className: 'text-right text-xs text-gray-500' })])))
            ]),
            createSummaryTable('Applied Loads & Moments', momentRows, 'mt-4')
        ]);
    }

    /**
     * Generates the HTML for the prestressing force limit checks section.
     * @param {object} checks - The `checks` object from the main calculation results.
     * @returns {HTMLElement} The HTMLElement for the prestress checks section.
     */
    function renderPrestressChecks(checks) {
        const { prestress_checks, materials } = checks;
        const fmt = (val, dec = 1) => (!isNaN(val)) ? val.toFixed(dec) : 'N/A';
        
        const P_min_req = Math.max(prestress_checks.P_min_tens_i.value || -Infinity, prestress_checks.P_min_comp_s.value || -Infinity);
        const P_max_req = Math.min(prestress_checks.P_max_comp_i.value || Infinity, prestress_checks.P_max_tens_s.value || Infinity);
        const adopted_P_i_kN = prestress_checks.P_i * 1000;
        const is_valid = adopted_P_i_kN >= P_min_req * 1000 && adopted_P_i_kN <= P_max_req * 1000;
        
        const summaryEl = h('div', { className: `p-4 rounded-lg ${is_valid ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}` }, [
            h('h3', { className: `font-bold text-lg text-center ${is_valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}` }, [is_valid ? 'Força de Protensão Adotada é Válida' : 'Força de Protensão Adotada é Inválida']),
            h('p', { className: 'text-center mt-2' }, [`Faixa Válida: ${fmt(P_min_req * 1000)} kN ≤ Pᵢ ≤ ${fmt(P_max_req * 1000)} kN`]),
            h('p', { className: 'text-center text-xl font-bold mt-1' }, [`Pᵢ,adotado = ${fmt(adopted_P_i_kN)} kN`])
        ]);

        const tableRows = [
            h('tr', {}, [h('td', { innerHTML: `Compressão Inicial (σ ≤ ${fmt(materials.limits.comp_i, 1)})` }), h('td', {}, [`P ≤ ${fmt(prestress_checks.P_max_comp_i.value * 1000)} kN`])]),
            h('tr', {}, [h('td', { innerHTML: `Tração Inicial (σ ≤ ${fmt(materials.limits.tens_i, 1)})` }), h('td', {}, [`P ≥ ${fmt(prestress_checks.P_min_tens_i.value * 1000)} kN`])]),
            h('tr', {}, [h('td', { innerHTML: `Compressão em Serviço (σ ≤ ${fmt(materials.limits.comp_s, 1)})` }), h('td', {}, [`P ≥ ${fmt(prestress_checks.P_min_comp_s.value * 1000)} kN`])]),
            h('tr', {}, [h('td', { innerHTML: `Tração em Serviço (σ ≤ ${fmt(materials.limits.tens_s, 1)})` }), h('td', {}, [`P ≤ ${fmt(prestress_checks.P_max_tens_s.value * 1000)} kN`])]),
        ];

        return createReportSection('prestress-checks-section', 'Prestressing Force Limit Checks (Mid-span)', [
            summaryEl,
            h('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4 mt-4' }, [
                h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg' }, [
                    h('h4', { className: 'font-semibold text-center' }, ['Limites de Força (kN)']),
                    h('table', { className: 'w-full mt-2 results-table text-sm' }, [h('tbody', {}, tableRows)])
                ]),
                h('div', { className: 'bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg' }, [
                    h('h4', { className: 'font-semibold text-center' }, ['Stress Diagram (Mid-span, MPa)']),
                    h('div', { className: 'relative h-64 w-full mt-2' }, [h('canvas', { id: 'stress-diagram-canvas' })])
                ])
            ])
        ]);
    }

    /**
     * Generates the HTML for the initial prestress estimation section.
     * @param {object} checks - The `checks` object from the main calculation results.
     * @returns {HTMLElement} The HTMLElement for the prestress estimation section.
     */
    function renderPrestressEstimation(checks) {
        const { prestress_estimation } = checks; // This object is now populated by the new function
        const fmt = (val, dec = 2) => (!isNaN(val)) ? val.toFixed(dec) : 'N/A';

        const rowsData = [
            ['Momento Auxiliar (M<sub>aux</sub>)', `${fmt(prestress_estimation.M_aux_kNm, 1)} kN·m`],
            ['Módulo do Núcleo (k<sub>s</sub>)', `${fmt(prestress_estimation.ks_m, 3)} m`],
            ['Força de Protensão Inicial Estimada (P<sub>est,i</sub>)', `${fmt(prestress_estimation.P_est_i, 1)} kN`],
            ['Força Estimada com Perdas (P<sub>est,perdas</sub>)', `${fmt(prestress_estimation.Pest_perdas, 1)} kN`],
            ['Número de Vãos Estimado', `${prestress_estimation.num_tendons} vãos`],
        ];

        return createReportSection('prestress-estimation-section', 'Estimativa Inicial de Protensão', [
            h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mb-2' }, ['Esta é uma estimativa preliminar para auxiliar no dimensionamento inicial.']),
            h('table', { className: 'w-full mt-2 summary-table' }, [
                h('tbody', {}, rowsData.map(([label, value]) => h('tr', {}, [h('td', { innerHTML: label }), h('td', { innerHTML: value })])))
            ])
        ]);
    }
    /**
     * Generates the HTML for the prestress loss analysis section, including a table and a chart placeholder.
     * @param {object} loss_results - The `loss_results` object from the main calculation results.
     * @returns {HTMLElement} The HTMLElement for the losses analysis section.
     */
    function renderLossesTableAndChart(loss_results) {
        const { key_points, sigma_p_friction, sigma_p_anchorage, sigma_p_ime, sigma_p_inf } = loss_results;
        const fmt = (val) => val.toFixed(1);

        const tableHeader = h('thead', {}, [h('tr', {}, ['x (m)', 'Atrito', '+ Encunh.', 'Imediata', 'Final'].map(text => h('th', {}, [text])))]);
        const tableBody = h('tbody', {}, key_points.map((x, i) => h('tr', {}, [
            h('td', {}, [fmt(x)]),
            h('td', {}, [fmt(sigma_p_friction[i].value)]),
            h('td', {}, [fmt(sigma_p_anchorage[i].value)]),
            h('td', {}, [fmt(sigma_p_ime[i].value)]),
            h('td', {}, [fmt(sigma_p_inf[i].value)])
        ])));

        return createReportSection('losses-section', 'Análise de Perdas de Protensão', [
            h('div', { className: 'grid grid-cols-1 lg:grid-cols-2 gap-6' }, [
                h('div', {}, [
                    h('h4', { className: 'font-semibold text-center mb-2' }, ['Tabela de Tensões no Aço (MPa)']),
                    h('table', { className: 'w-full results-table text-sm' }, [tableHeader, tableBody])
                ]),
                h('div', {}, [
                    h('h4', { className: 'font-semibold text-center mb-2' }, ['Gráfico de Perdas de Tensão']),
                    h('div', { className: 'p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg' }, [
                        h('div', { className: 'relative h-80' }, [h('canvas', { id: 'losses-chart-canvas' })])
                    ])
                ])
            ])
        ]);
    }

    // --- Other UI and Drawing functions (drawCrossSectionDiagram, drawLongitudinalDiagram, etc.)
    // These functions from the original file are kept largely the same, but with minor adjustments for new data structures.
    
    function drawDiagrams() {
        // Use the new inputManager to gather all inputs
        const inputs = gatherInputsFromIds(inputManager.inputIds);
        inputs.vertices = inputManager._parseVertices(inputs.beam_coords);
        inputs.cable_path = inputManager._gatherCablePath();

        // Now draw the diagrams with the gathered inputs
        drawCrossSectionDiagram('cross-section-canvas', inputs.vertices);
        drawLongitudinalDiagram('longitudinal-canvas', inputs);
        const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
        const heightInput = document.getElementById('beam_height');
        if (props && heightInput) {
            if(document.activeElement !== heightInput) {
                 heightInput.value = props.height.toFixed(2);
            }
        }
    }
    
    // --- Event Listeners & Initialization ---
    function addCablePointRow(containerId, point = { x: 0, y: 0.35, type: 'Parabolic' }) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'cable-path-row grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-2 items-center';
        row.innerHTML = `
            <input type="number" class="cable-x w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600" value="${point.x}">
            <input type="number" class="cable-y w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600" value="${point.y}">
            <select class="cable-type w-full p-1 border rounded-md dark:bg-gray-700 dark:border-gray-600">
                <option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Parabolic</option>
                <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Straight</option>
            </select>
            <button class="remove-cable-point-btn text-red-500 hover:text-red-700 font-bold text-lg w-8" title="Remove Point">&times;</button>
        `;

        row.querySelector('.remove-cable-point-btn').addEventListener('click', () => {
            row.remove();
            drawDiagrams();
            const currentInputs = gatherInputsFromIds(inputManager.inputIds);
            currentInputs.vertices = inputManager._parseVertices(currentInputs.beam_coords);
            currentInputs.cable_path = inputManager._gatherCablePath();
            saveInputsToLocalStorage('prestressed-beam-inputs-v2', currentInputs);
        });

        container.appendChild(row);
    }

    const gatherAllInputs = () => {
        return { ...gatherInputsFromIds(inputManager.inputIds), vertices: inputManager._parseVertices(document.getElementById('beam_coords').value), cable_path: inputManager._gatherCablePath() };
    };
    const handleRunCheck = createCalculationHandler({
        gatherInputsFunction: gatherAllInputs,
        storageKey: 'prestressed-beam-inputs-v2',
        validationRuleKey: 'prestressed-beam-inputs-v2',
        calculatorFunction: concreteBeamCalculator.run,
        renderFunction: renderResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });

    document.getElementById('run-check-btn').addEventListener('click', handleRunCheck);

    const debouncedDraw = debounce(() => {
        drawDiagrams();
    }, 300);

    // Attach listeners to all inputs that affect diagrams
    const diagramInputs = inputManager.inputIds.filter(id => id !== 'beam_height').concat(['beam_coords']);
    diagramInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', debouncedDraw);
            el.addEventListener('change', debouncedDraw); // For selects
        }
    });
    document.getElementById('cable-path-container').addEventListener('input', debouncedDraw);
    
    // Auto-save/load functionality
    const allInputAndTextareaIds = [...inputManager.inputIds, 'beam_coords']; // Added beam_coords
    const debouncedSave = debounce(() => saveInputsToLocalStorage('prestressed-beam-inputs-v2', gatherAllInputs()), 500);
    document.getElementById('cable-path-container').addEventListener('input', debouncedSave);
    allInputAndTextareaIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', debouncedSave);
    });

    document.getElementById('add-cable-point-btn').addEventListener('click', () => {
        addCablePointRow('cable-path-container');
        debouncedDraw();
        debouncedSave();
    });

    function loadAndInitialize() {
        const loadedInputs = JSON.parse(localStorage.getItem('prestressed-beam-inputs-v2')) || {};

        const container = document.getElementById('cable-path-container');
        // Clear only the data rows, not the header
        if (container) {
        container.querySelectorAll('.cable-path-row').forEach(row => row.remove());

        if (loadedInputs.cable_path && loadedInputs.cable_path.length > 0) {
            loadedInputs.cable_path.forEach(p => addCablePointRow('cable-path-container', p));
        } else {
            // Add default points if nothing is loaded
            addCablePointRow('cable-path-container', { x: 0, y: 0.35, type: 'Parabolic' });
            addCablePointRow('cable-path-container', { x: 9, y: 0.10, type: 'Straight' });
        }
        }

        applyInputsToDOM(loadedInputs, allInputAndTextareaIds);
        drawDiagrams();
    }

    loadAndInitialize();

    // Initial draw on page load
    drawDiagrams();

    // Assume helper functions like createCalculationHandler, debounce, gatherInputsFromIds, etc. are in a shared file.
});

/**
 * Draws the prestressing losses chart using Chart.js.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {object} loss_data - The data object containing loss information.
 */
function drawLossesChart(canvasId, loss_data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !loss_data || typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    const datasets = [
        { label: 'Atrito', data: loss_data.sigma_p_friction, borderColor: '#3b82f6', tension: 0.1 },
        { label: '+Encunh.', data: loss_data.sigma_p_anchorage, borderColor: '#f97316', borderDash: [5, 5], tension: 0.1 },
        { label: 'Imediata', data: loss_data.sigma_p_ime, borderColor: '#ef4444', tension: 0.1 },
        { label: 'Final (pós-perdas)', data: loss_data.sigma_p_inf, borderColor: '#10b981', borderWidth: 3, tension: 0.1 },
    ].map(ds => ({
        ...ds,
        data: ds.data.map(p => ({ x: p.x, y: p.value })),
        fill: false,
    }));

    // Destroy previous chart instance if it exists
    let existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    new Chart(canvas, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Comprimento (m)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    title: { display: true, text: 'Tensão no Aço (MPa)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor } },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (tooltipItems) => `x = ${tooltipItems[0].parsed.x.toFixed(2)} m`,
                        label: (context) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} MPa`
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

/**
 * Draws the stress profile diagram using Chart.js.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {object} results - The main calculation results object.
 */
function drawStressDiagram(canvasId, results) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !results || !results.stress_profiles || typeof Chart === 'undefined') return;

    const { stress_profiles, properties } = results;
    const { initial, final: final_stress } = stress_profiles;
    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    const datasets = [
        { label: 'Inicial', data: [{ x: initial.bottom, y: properties.y_min }, { x: initial.top, y: properties.y_max }], borderColor: '#3b82f6' },
        { label: 'Final', data: [{ x: final_stress.bottom, y: properties.y_min }, { x: final_stress.top, y: properties.y_max }], borderColor: '#ef4444' }
    ];

    let existingChart = Chart.getChart(canvas);
    if (existingChart) {
        existingChart.destroy();
    }

    new Chart(canvas, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    title: { display: true, text: 'Altura da Viga (cm)', color: textColor },
                    min: properties.y_min,
                    max: properties.y_max,
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                x: {
                    title: { display: true, text: 'Tensão (MPa)', color: textColor },
                    position: 'top',
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    afterBuildTicks: (axis) => {
                        axis.ticks.push({ value: 0, label: '0' }); // Ensure zero line is shown
                    }
                }
            },
            elements: {
                line: { tension: 0 } // Straight lines
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: textColor } },
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