/**
 * @file viga_protendida.js
 * @description NBR 6118 Prestressed Concrete Beam Checker with Prestressing Loss Calculations.
 * Translates the logic from the provided PDF into a web application.
 */

const prestressedInputIds = [
    'design_code', 'unit_system', 'fck', 'age_at_prestress', 'Ap',
    'load_pp', 'load_perm', 'load_var', 'beam_length', 'beam_height', 'beam_coords',
    'humidity', 'fptk', 'mu', 'k', 'anchorage_slip'
];

const concreteBeamCalculator = (() => {
    /**
     * Calculates the complete geometric properties of a non-self-intersecting polygon.
     * @param {Array<[number, number]>} vertices - An array of [x, y] coordinates in cm.
     * @returns {object|null} A dictionary containing the calculated properties or null if invalid.
     */
    function calculateSectionProperties(vertices) {
        if (!vertices || vertices.length < 3) return null;

        const points = [...vertices, vertices[0]]; // Close the polygon
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
            Qx += (x0 + x1) * term;
            Qy += (y0 + y1) * term;
            Ix += (y0 ** 2 + y0 * y1 + y1 ** 2) * term;
            Iy += (x0 ** 2 + x0 * x1 + x1 ** 2) * term;
        }

        A /= 2.0;
        if (Math.abs(A) < 1e-6) return null;

        const cx = Qx / (6.0 * A);
        const cy = Qy / (6.0 * A);

        const I_origin_x = Ix / 12.0;
        const I_origin_y = Iy / 12.0;

        const I_cx = I_origin_x - A * cy ** 2;
        const I_cy = I_origin_y - A * cx ** 2;

        const rx = Math.sqrt(Math.abs(I_cx) / Math.abs(A));
        const ry = Math.sqrt(Math.abs(I_cy) / Math.abs(A));

        const y_min = Math.min(...vertices.map(p => p[1]));
        const y_max = Math.max(...vertices.map(p => p[1]));
        const yi = cy - y_min;
        const ys = y_max - cy;

        const Wi = Math.abs(yi) > 1e-6 ? Math.abs(I_cx) / Math.abs(yi) : Infinity;
        const Ws = Math.abs(ys) > 1e-6 ? Math.abs(I_cx) / Math.abs(ys) : Infinity;

        return {
            area: Math.abs(A),
            centroid: { x: cx, y: cy },
            Q: { x: Math.abs(Qx / 6), y: Math.abs(Qy / 6) },
            I: { cx: Math.abs(I_cx), cy: Math.abs(I_cy) },
            r: { x: rx, y: ry },
            W: { i: Wi, s: Ws },
            height: y_max - y_min,
            yi,
            ys
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
      * Main calculation function, updated to follow the PDF logic.
      * @param {object} inputs - The gathered user inputs.
      * @returns {object} The results of the calculation.
      */
    function run(raw_inputs) {
        const inputs = {...raw_inputs}; // Make a mutable copy
        const { vertices, fck, age_at_prestress, load_pp, load_perm, load_var, beam_length, cable_path, humidity, fptk, mu, k, anchorage_slip } = inputs;
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
        const fcm = fck <= 50 ? fck + 8 : 1.1 * fck;
        const s_beta = 0.20;
        const beta1 = Math.exp(s_beta * (1 - Math.pow(28 / age_at_prestress, 0.5)));
        const fci = beta1 * fcm;
        const fctm = fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + 0.11 * fck);
        const fctk_inf = 0.7 * fctm;
        const fctf = 1.2 * fctk_inf;
        const E_ci = 5600 * Math.sqrt(fck);
        const E_p = 200000;
        const alpha_p = E_p / E_ci;
        
        // Stress Limits
        const comp_limit_i = (fci <= 50 ? 0.7 : 0.7 * (1 - (fci - 50)/200)) * fci;
        const tens_limit_i = 1.2 * fctm;
        const comp_limit_s = 0.45 * fck;
        const tens_limit_s = fctf;

        const materials = { fctm, fctk_inf, fctf, fci, E_ci, E_p, alpha_p,
            limits: { comp_i: comp_limit_i, tens_i: tens_limit_i, comp_s: comp_limit_s, tens_s: tens_limit_s } };

        // --- 3. Loads & Moments ---
        const g_k = load_pp + load_perm;
        const p_CQP = g_k + 0.3 * load_var; // Combinação Quase-Permanente
        const p_CF = g_k + 0.4 * load_var;  // Combinação Frequente
        const M_g1k = (load_pp * beam_length ** 2) / 8;
        const M_gk = (g_k * beam_length ** 2) / 8;
        const M_CQP = (p_CQP * beam_length ** 2) / 8;
        const M_CF = (p_CF * beam_length ** 2) / 8;
        
        const moments = { M_g1k, M_gk, M_CQP, M_CF };

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
        const sigma_pi = 0.74 * fptk;
        const P_i = Ap_m2 * sigma_pi; // MN
        const mid_span_details = path_details.find(p => p.x === beam_length / 2);
        const ecc_mid = mid_span_details.e;

        const P_max_comp_i_res = solveForPrestressForce(-materials.limits.comp_i, -Ws_m3, M_g1k / 1000, A_m2, ecc_mid);
        const P_min_tens_i_res = solveForPrestressForce(materials.limits.tens_i, Wi_m3, M_g1k / 1000, A_m2, ecc_mid);
        const P_min_comp_s_res = solveForPrestressForce(-materials.limits.comp_s, -Ws_m3, M_CQP / 1000, A_m2, ecc_mid);
        const P_max_tens_s_res = solveForPrestressForce(materials.limits.tens_s, Wi_m3, M_CF / 1000, A_m2, ecc_mid);

        const prestress_checks = {
             P_i, sigma_pi,
             P_max_comp_i: P_max_comp_i_res,
             P_min_tens_i: P_min_tens_i_res,
             P_min_comp_s: P_min_comp_s_res,
             P_max_tens_s: P_max_tens_s_res,
        };

        // --- 6. Detailed Prestress Loss Calculation (Following PDF Logic) ---
        const loss_results = calculateDetailedLosses(inputs, props, materials, path_details, moments, P_i, sigma_pi, cable_path_abs);
        
        // --- 7. Final Stress Profiles ---
        const P_eff_mid_val_result = loss_results.sigma_p_inf.find(p=>p.x === beam_length/2);
        const P_eff_mid = P_eff_mid_val_result ? (P_eff_mid_val_result.value * Ap_m2) : 0;

        const stress_profiles = {
             initial: {
                 top: (-P_i / A_m2) + (P_i * ecc_mid / Ws_m3) - (M_g1k / 1000 / Ws_m3),
                 bottom: (-P_i / A_m2) - (P_i * ecc_mid / Wi_m3) + (M_g1k / 1000 / Wi_m3)
             },
             final: {
                 top: (-P_eff_mid / A_m2) + (P_eff_mid * ecc_mid / Ws_m3) - (M_CQP / 1000 / Ws_m3),
                 bottom: (-P_eff_mid / A_m2) - (P_eff_mid * ecc_mid / Wi_m3) + (M_CF / 1000 / Wi_m3)
             }
         };
         
        return {
            checks: {
                properties: props,
                materials,
                loads: { pp: load_pp, perm: load_perm, var: load_var, g_k, p_CQP, p_CF },
                moments,
                path_details,
                prestress_checks,
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
    function getCablePositionAt(x_pos, cable_path_abs, beam_length) {
        if (!cable_path_abs || cable_path_abs.length === 0) return 0;
        if (cable_path_abs.length === 1) return cable_path_abs[0].y;
        
        const last_defined_x = cable_path_abs[cable_path_abs.length-1].x;
        if (x_pos > last_defined_x && last_defined_x <= beam_length/2) {
             return getCablePositionAt(beam_length - x_pos, cable_path_abs, beam_length);
        }

        for (let i = 0; i < cable_path_abs.length - 1; i++) {
            const p1 = cable_path_abs[i];
            const p2 = cable_path_abs[i + 1];

            if (x_pos >= p1.x && x_pos <= p2.x) {
                if (p1.type === 'Parabolic') {
                    let vertex = p1.y < p2.y ? p1 : p2;
                    let other_point = p1.y < p2.y ? p2 : p1;
                    if(Math.abs(p2.x - p1.x) < 1e-6) return p1.y; 
                    
                    const h = vertex.x;
                    const k = vertex.y;
                    const denominator = (other_point.x - h)**2;
                    if (Math.abs(denominator) < 1e-9) return k;
                    const a = (other_point.y - k) / denominator;
                    return a * (x_pos - h)**2 + k;

                } else { // Straight
                    return interpolate(x_pos, [p1.x, p2.x], [p1.y, p2.y]);
                }
            }
        }
        return cable_path_abs[cable_path_abs.length - 1].y; // Fallback
    }

    return { run, calculateSectionProperties, getCablePositionAt };
})();

function drawCrossSectionDiagram(svgId, vertices) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    svg.innerHTML = '';
    const ns = "http://www.w3.org/2000/svg";
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    const W = 300, H = 400;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    if (!vertices || vertices.length < 3) {
        svg.innerHTML = `<text x="${W/2}" y="20" fill="${textColor}" text-anchor="middle">Invalid vertices</text>`;
        return;
    }

    const props = concreteBeamCalculator.calculateSectionProperties(vertices);
    if (!props) return;

    const all_x = vertices.map(v => v[0]);
    const all_y = vertices.map(v => v[1]);
    const maxX = Math.max(...all_x);
    const maxY = Math.max(...all_y);
    const minX = Math.min(...all_x);
    const minY = Math.min(...all_y);

    const margin = 30;
    const scale = Math.min((W - 2 * margin) / (maxX - minX), (H - 2 * margin) / (maxY - minY));
    const offsetX = margin - minX * scale + (W - 2 * margin - (maxX - minX) * scale) / 2;
    const offsetY = margin - minY * scale + (H - 2 * margin - (maxY - minY) * scale) / 2;

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${offsetX}, ${H - offsetY}) scale(1, -1)`);
    svg.appendChild(g);

    const path = document.createElementNS(ns, 'path');
    let d = `M ${vertices[0][0] * scale} ${vertices[0][1] * scale}`;
    for (let i = 1; i < vertices.length; i++) {
        d += ` L ${vertices[i][0] * scale} ${vertices[i][1] * scale}`;
    }
    d += ' Z';
    path.setAttribute('d', d);
    path.setAttribute('fill', isDark ? '#6B7280' : '#e8f4f8');
    path.setAttribute('stroke', isDark ? '#D1D5DB' : '#2c3e50');
    path.setAttribute('stroke-width', 2 / scale);
    g.appendChild(path);

    const cx = props.centroid.x * scale;
    const cy = props.centroid.y * scale;
    const centroid = document.createElementNS(ns, 'circle');
    centroid.setAttribute('cx', cx);
    centroid.setAttribute('cy', cy);
    centroid.setAttribute('r', 5 / scale);
    centroid.setAttribute('fill', 'red');
    g.appendChild(centroid);
    
    // Label for centroid
    const cg_text = document.createElementNS(ns, 'text');
    cg_text.textContent = `CG (${props.centroid.x.toFixed(1)}, ${props.centroid.y.toFixed(1)})`;
    cg_text.setAttribute('x', cx + 10 / scale);
    cg_text.setAttribute('y', cy + 10 / scale);
    cg_text.setAttribute('fill', 'red');
    cg_text.setAttribute('font-size', 10 / scale);
    cg_text.setAttribute('transform', 'scale(1, -1)');
    g.appendChild(cg_text);
}

function drawLongitudinalDiagram(svgId, inputs) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    svg.innerHTML = '';
    const ns = "http://www.w3.org/2000/svg";
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#FFFFFF' : '#2c3e50';

    const W = 800, H = 300;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const beamLength = parseFloat(inputs.beam_length) || 18;
    const beamHeightCm = (parseFloat(inputs.beam_height) || 80);
    
    const cablePath = (inputs.cable_path || []);

    const marginX = 60, marginY = 50;
    const drawWidth = W - 2 * marginX, drawHeight = H - 2 * marginY;
    const scaleX = drawWidth / beamLength;
    const scaleY = drawHeight / beamHeightCm;

    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${marginX}, ${H - marginY}) scale(1, -1)`);
    svg.appendChild(g);
    
    // Beam outline
    const beam = document.createElementNS(ns, 'rect');
    beam.setAttribute('x', 0);
    beam.setAttribute('y', 0);
    beam.setAttribute('width', beamLength * scaleX);
    beam.setAttribute('height', beamHeightCm * scaleY);
    beam.setAttribute('fill', isDark ? '#6B7280' : '#d3d3d3');
    beam.setAttribute('stroke', isDark ? '#D1D5DB' : '#000');
    g.appendChild(beam);
    
    // Centroid Line
    const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
    if(props) {
        const cg_y = props.centroid.y * scaleY;
        const centerline = document.createElementNS(ns, 'line');
        centerline.setAttribute('x1', 0);
        centerline.setAttribute('y1', cg_y);
        centerline.setAttribute('x2', beamLength * scaleX);
        centerline.setAttribute('y2', cg_y);
        centerline.setAttribute('stroke', 'red');
        centerline.setAttribute('stroke-dasharray', '5,5');
        g.appendChild(centerline);
    }

    // Cable Path
    drawCablePathSvg(g, cablePath, scaleX, scaleY, isDark);
}

/**
 * Draws the prestressing cable path onto an SVG group element.
 * @param {SVGElement} g - The SVG <g> element to draw into.
 * @param {Array<object>} cablePath - The array of user-defined cable path points.
 * @param {number} scaleX - The horizontal scaling factor.
 * @param {number} scaleY - The vertical scaling factor.
 * @param {boolean} isDark - Whether dark mode is active.
 */
function drawCablePathSvg(g, cablePath, scaleX, scaleY, isDark) {
    const ns = "http://www.w3.org/2000/svg";
    const inputs = gatherBeamInputs();
    const beamLength = parseFloat(inputs.beam_length) || 18;
    const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
    if (!props) return;

    const y_cg = props.centroid.y;
    const y_min_beam = Math.min(...inputs.vertices.map(p => p[1]));

    // Generate a series of points along the beam to draw a smooth curve
    const pathPoints = [];
    const numSegments = 200;
    for (let i = 0; i <= numSegments; i++) {
        const x_pos_m = (i / numSegments) * beamLength;
        // The y value from getCablePositionAt is absolute in meters, convert to cm for scaling
        const y_abs_cm = concreteBeamCalculator.getCablePositionAt(x_pos_m, inputs.cable_path, beamLength) * 100;
        pathPoints.push(`${x_pos_m * scaleX},${y_abs_cm * scaleY}`);
    }

    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('points', pathPoints.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', isDark ? '#f59e0b' : '#d97706'); // amber-500 / amber-600
    polyline.setAttribute('stroke-width', '2');
    g.appendChild(polyline);

    // Draw circles for the user-defined points
    inputs.cable_path.forEach(p => {
        const y_abs_cm = concreteBeamCalculator.getCablePositionAt(p.x, inputs.cable_path, beamLength) * 100;
        g.innerHTML += `<circle cx="${p.x * scaleX}" cy="${y_abs_cm * scaleY}" r="4" fill="${isDark ? '#fde047' : '#facc15'}" />`;
    });
}

function parseVertices(text) {
    return text.split('\n')
        .map(line => line.trim().split(/[,; ]+/).map(Number))
        .filter(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]));
}

function gatherCablePath() {
    const container = document.getElementById('cable-path-container');
    const rows = Array.from(container.querySelectorAll('.cable-path-row'));
    return rows.map((row, index) => ({
        x: parseFloat(row.querySelector('.cable-x').value) || 0,
        y: parseFloat(row.querySelector('.cable-y').value) || 0,
        'type': index < rows.length - 1 ? row.querySelector('.cable-type').value : 'Straight'
    }));
}

function gatherBeamInputs() {
    const inputs = gatherInputsFromIds(prestressedInputIds);
    inputs.vertices = parseVertices(inputs.beam_coords);
    inputs.cable_path = gatherCablePath();
    return inputs;
}

/**
 * --- UI and Drawing Functions ---
 */
document.addEventListener('DOMContentLoaded', () => {
    // This function remains largely the same, but now gets more data
    function renderResults(results) {
        const { checks, inputs } = results;
        if (!checks || results.errors) {
            document.getElementById('results-container').innerHTML = `<p class="text-center text-red-500">Calculation failed: ${results.errors?.[0] || 'Unknown error'}</p>`;
            return;
        }

        const inputSummaryHtml = renderInputSummary(inputs);
        const calculatedPropsHtml = renderCalculatedProperties(checks);
        const prestressChecksHtml = renderPrestressChecks(checks);
        const lossesHtml = renderLossesTableAndChart(checks.loss_results);

        const finalHtml = `
         <div id="concrete-beam-report" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
             <div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                 <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                 <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copiar Relatório</button>
             </div>
             <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação da Viga Protendida (NBR 6118)</h2>
             ${inputSummaryHtml}
             ${calculatedPropsHtml}
             ${prestressChecksHtml}
             ${lossesHtml}
         </div>`;

        document.getElementById('results-container').innerHTML = finalHtml;
        drawStressDiagram('stress-diagram-svg', checks);
        drawLossesChart('losses-chart-canvas', checks.loss_results);
    }
    
    function renderInputSummary(inputs) {
        const { fck, load_pp, load_perm, load_var, beam_length, Ap } = inputs;
        return `
        <div id="input-summary-section" class="report-section-copyable">
            <div class="flex justify-between items-center mb-2">
                <h3 class="report-header">Input Summary</h3>
                 <button data-copy-target-id="input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 summary-table">
                    <caption class="report-caption">General & Material Properties</caption>
                    <tbody>
                        <tr><td>Concrete Strength (f<sub>ck</sub>)</td><td>${fck} MPa</td></tr>
                        <tr><td>Beam Length (L)</td><td>${beam_length} m</td></tr>
                        <tr><td>Tendon Area (A<sub>p</sub>)</td><td>${parseFloat(Ap).toFixed(2)} cm²</td></tr>
                    </tbody>
                </table>
                <table class="w-full mt-4 summary-table">
                    <caption class="report-caption">Service Loads (ELS)</caption>
                    <tbody>
                        <tr><td>Self-Weight (g<sub>pp</sub>)</td><td>${load_pp} kN/m</td></tr>
                        <tr><td>Permanent Load (g<sub>perm</sub>)</td><td>${load_perm} kN/m</td></tr>
                        <tr><td>Variable Load (q<sub>var</sub>)</td><td>${load_var} kN/m</td></tr>
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    function renderCalculatedProperties(checks) {
        const { properties, materials, loads, moments, path_details } = checks;
        const fmt = (val, dec = 2) => (val !== undefined && val !== null && !isNaN(val)) ? val.toFixed(dec) : 'N/A';
        const mid_span_details = path_details.find(p => p.x === parseFloat(document.getElementById('beam_length').value)/2);

        const rows = [
            `<tr><td>Área da Seção (A)</td><td>${fmt(properties.area, 2)} cm²</td></tr>`,
            `<tr><td>Centroide (y<sub>cg</sub>)</td><td>${fmt(properties.centroid.y, 2)} cm</td></tr>`,
            `<tr><td>Inércia (I<sub>cx</sub>)</td><td>${fmt(properties.I.cx, 0)} cm⁴</td></tr>`,
            `<tr><td>Módulo Resist. Inf. (W<sub>i</sub>)</td><td>${fmt(properties.W.i, 0)} cm³</td></tr>`,
            `<tr><td>Módulo Resist. Sup. (W<sub>s</sub>)</td><td>${fmt(properties.W.s, 0)} cm³</td></tr>`,
            `<tr ><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Protensão (Meio do Vão)</td></tr>`,
            `<tr><td>Excentricidade (e<sub>meio</sub>)</td><td>${mid_span_details ? fmt(mid_span_details.e * 100, 2) : 'N/A'} cm</td></tr>`,
            `<tr ><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Resistências do Material (MPa)</td></tr>`,
            `<tr><td>Resist. à Tração Média (f<sub>ct,m</sub>)</td><td>${fmt(materials.fctm, 2)} MPa</td></tr>`,
            `<tr><td>Resist. à Tração na Flexão (f<sub>ct,f</sub>)</td><td>${fmt(materials.fctf, 2)} MPa</td></tr>`,
            `<tr><td>Resist. Concreto na Protensão (f<sub>ci</sub>)</td><td>${fmt(materials.fci, 2)} MPa</td></tr>`,
             `<tr ><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Carregamentos e Momentos (kNm)</td></tr>`,
            `<tr><td>Momento (Peso Próprio, M<sub>g1k</sub>)</td><td>${fmt(moments.M_g1k, 1)} kN·m</td></tr>`,
            `<tr><td>Momento (Quase-Perm., M<sub>qp</sub>)</td><td>${fmt(moments.M_CQP, 1)} kN·m</td></tr>`,
            `<tr><td>Momento (Frequente, M<sub>freq</sub>)</td><td>${fmt(moments.M_CF, 1)} kN·m</td></tr>`,
        ];

        return `
        <div id="calculated-props-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center mb-2">
                <h3 class="report-header">Calculated Properties & Demands</h3>
                <button data-copy-target-id="calculated-props-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 summary-table">
                    <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
                    <tbody>${rows.join('')}</tbody>
                </table>
            </div>
        </div>`;
    }

    function renderPrestressChecks(checks) {
        const { prestress_checks, materials } = checks;
        const fmt = (val, dec = 1) => (!isNaN(val)) ? val.toFixed(dec) : 'N/A';
        
        const P_min_req = Math.max(prestress_checks.P_min_tens_i.value || -Infinity, prestress_checks.P_min_comp_s.value || -Infinity);
        const P_max_req = Math.min(prestress_checks.P_max_comp_i.value || Infinity, prestress_checks.P_max_tens_s.value || Infinity);
        const adopted_P_i_kN = prestress_checks.P_i * 1000;
        const is_valid = adopted_P_i_kN >= P_min_req * 1000 && adopted_P_i_kN <= P_max_req * 1000;

        const summaryHtml = `
            <div class="p-4 rounded-lg ${is_valid ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}">
                <h3 class="font-bold text-lg text-center ${is_valid ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}">
                    ${is_valid ? 'Força de Protensão Adotada é Válida' : 'Força de Protensão Adotada é Inválida'}
                </h3>
                <p class="text-center mt-2">Faixa Válida: ${fmt(P_min_req * 1000)} kN &le; P<sub>i</sub> &le; ${fmt(P_max_req * 1000)} kN</p>
                <p class="text-center text-xl font-bold mt-1">P<sub>i,adotado</sub> = ${fmt(adopted_P_i_kN)} kN</p>
            </div>`;

        const tableRows = `
            <tr><td>Compressão Inicial (σ &le; ${fmt(materials.limits.comp_i,1)})</td><td>P &le; ${fmt(prestress_checks.P_max_comp_i.value * 1000)} kN</td></tr>
            <tr><td>Tração Inicial (σ &le; ${fmt(materials.limits.tens_i,1)})</td><td>P &ge; ${fmt(prestress_checks.P_min_tens_i.value * 1000)} kN</td></tr>
            <tr><td>Compressão em Serviço (σ &le; ${fmt(materials.limits.comp_s,1)})</td><td>P &ge; ${fmt(prestress_checks.P_min_comp_s.value * 1000)} kN</td></tr>
            <tr><td>Tração em Serviço (σ &le; ${fmt(materials.limits.tens_s,1)})</td><td>P &le; ${fmt(prestress_checks.P_max_tens_s.value * 1000)} kN</td></tr>
        `;

        return `
        <div id="prestress-checks-section" class="report-section-copyable mt-6">
            <h3 class="report-header">Prestressing Force Limit Checks (Mid-span)</h3>
            <div class="copy-content">
                ${summaryHtml}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                        <h4 class="font-semibold text-center">Limites de Força (kN)</h4>
                        <table class="w-full mt-2 results-table text-sm"><tbody>${tableRows}</tbody></table>
                    </div>
                    <div class="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                         <h4 class="font-semibold text-center">Stress Diagram (Mid-span, MPa)</h4>
                         <canvas id="stress-diagram-canvas" class="w-full h-64 mt-2"></canvas>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function renderLossesTableAndChart(loss_results) {
        const { key_points, sigma_p_friction, sigma_p_anchorage, sigma_p_ime, sigma_p_inf } = loss_results;
        const fmt = (val) => val.toFixed(1);

        const tableRows = key_points.map((x, i) => `
            <tr>
                <td>${fmt(x)}</td>
                <td>${fmt(sigma_p_friction[i].value)}</td>
                <td>${fmt(sigma_p_anchorage[i].value)}</td>
                <td>${fmt(sigma_p_ime[i].value)}</td>
                <td>${fmt(sigma_p_inf[i].value)}</td>
            </tr>
        `).join('');

        return `
        <div id="losses-section" class="report-section-copyable mt-6">
            <h3 class="report-header">Análise de Perdas de Protensão</h3>
             <div class="copy-content grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                    <h4 class="font-semibold text-center mb-2">Tabela de Tensões no Aço (MPa)</h4>
                    <table class="w-full results-table text-sm">
                        <thead>
                            <tr><th>x (m)</th><th>Atrito</th><th>+ Encunh.</th><th>Imediata</th><th>Final</th></tr>
                        </thead>
                        <tbody>${tableRows}</tbody>
                    </table>
                </div>
                <div>
                    <h4 class="font-semibold text-center mb-2">Gráfico de Perdas de Tensão</h4>
                    <div class="p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg h-80 relative">
                        <canvas id="losses-chart-canvas"></canvas>
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    // --- Other UI and Drawing functions (drawCrossSectionDiagram, drawLongitudinalDiagram, etc.)
    // These functions from the original file are kept largely the same, but with minor adjustments for new data structures.
    
    function drawDiagrams() {
        const inputs = gatherBeamInputs();
        drawCrossSectionDiagram('cross-section-svg', inputs.vertices);
        drawLongitudinalDiagram('longitudinal-svg', inputs);
        const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
        const heightInput = document.getElementById('beam_height');
        if (props && heightInput) {
            if(document.activeElement !== heightInput) {
                 heightInput.value = props.height.toFixed(2);
            }
        }
    }
    
    function drawLossesChart(svgId, loss_data) {
        const svg = document.getElementById(svgId);
        if (!svg || !loss_data) return;
        svg.innerHTML = '';
        const ns = "http://www.w3.org/2000/svg";
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#FFFFFF' : '#2c3e50';
        const W = 500, H = 320;
        const margin = { top: 20, right: 20, bottom: 40, left: 50 };
        const width = W - margin.left - margin.right;
        const height = H - margin.top - margin.bottom;
        
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        const datasets = [
            { name: 'Atrito', data: loss_data.sigma_p_friction, color: '#3b82f6' },
            { name: '+Encunh.', data: loss_data.sigma_p_anchorage, color: '#f97316' },
            { name: 'Imediata', data: loss_data.sigma_p_ime, color: '#ef4444' },
            { name: 'Final', data: loss_data.sigma_p_inf, color: '#10b981', width: 3 },
        ];

        const all_x = loss_data.key_points;
        const all_y = datasets.flatMap(ds => ds.data.map(d => d.value)).filter(v => !isNaN(v));
        if (all_y.length === 0) return;

        const xScale = val => margin.left + (val / all_x[all_x.length-1]) * width;
        const yMin = Math.min(...all_y);
        const yMax = Math.max(...all_y);
        const yRange = yMax - yMin;
        
        const yScale = val => {
            if (yRange < 1e-6) return margin.top + height / 2;
            return margin.top + height - ((val - yMin) / yRange) * height;
        };
        
        // Axes
        svg.innerHTML += `<line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top+height}" stroke="${textColor}" stroke-width="1"/>`;
        svg.innerHTML += `<line x1="${margin.left}" y1="${margin.top+height}" x2="${margin.left+width}" y2="${margin.top+height}" stroke="${textColor}" stroke-width="1"/>`;
        svg.innerHTML += `<text x="${margin.left + width/2}" y="${H-5}" text-anchor="middle" font-size="12" fill="${textColor}">Comprimento (m)</text>`;
        svg.innerHTML += `<text x="15" y="${margin.top + height/2}" text-anchor="middle" font-size="12" fill="${textColor}" transform="rotate(-90, 15, ${margin.top+height/2})">Tensão (MPa)</text>`;

        // Y-axis labels
        for(let i = 0; i <= 5; i++){
            const val = yMin + i/5 * yRange;
            const yPos = yScale(val);
            if (isNaN(yPos)) continue;
            svg.innerHTML += `<text x="${margin.left-5}" y="${yPos}" text-anchor="end" alignment-baseline="middle" font-size="10" fill="${textColor}">${val.toFixed(0)}</text>`;
        }
        
        // Data lines
        datasets.forEach(ds => {
            const valid_points = ds.data.filter(p => !isNaN(p.value));
            if (valid_points.length < 2) return;
            const d = valid_points.map(p => `${xScale(p.x)},${yScale(p.value)}`).join(' ');
            svg.innerHTML += `<polyline points="${d}" fill="none" stroke="${ds.color}" stroke-width="${ds.width || 2}" stroke-dasharray="${ds.name === '+Encunh.' ? '5,5': ''}"/>`;
        });
    }
    
    function drawStressDiagram(svgId, results) {
       const svg = document.getElementById(svgId);
       if (!svg || !results || !results.stress_profiles) {
           if (svg) svg.innerHTML = '';
           return;
       }
       svg.innerHTML = '';

       const { stress_profiles } = results;
       const { initial, final: final_stress } = stress_profiles;
       const ns = "http://www.w3.org/2000/svg";
       const isDark = document.documentElement.classList.contains('dark');
       const textColor = isDark ? '#FFFFFF' : '#2c3e50';
       const W = 250, H = 250;
       svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

       const margin = { top: 20, right: 40, bottom: 20, left: 40 };
       const drawWidth = W - margin.left - margin.right;
       const drawHeight = H - margin.top - margin.bottom;

       const allStresses = [initial.top, initial.bottom, final_stress.top, final_stress.bottom, 0].filter(v => !isNaN(v));
       if(allStresses.length === 0) return;
       
       const maxAbsStress = Math.max(...allStresses.map(Math.abs));
       const stressRange = maxAbsStress * 2;
       
       const stressScale = stressRange > 1e-6 ? drawWidth / stressRange : 0;
       const zeroX = margin.left + drawWidth/2;

       // Zero line
       svg.innerHTML += `<line x1="${zeroX}" y1="${margin.top}" x2="${zeroX}" y2="${H-margin.bottom}" stroke="${textColor}" stroke-dasharray="2 2"/>`;
       // Beam representation
       svg.innerHTML += `<rect x="${zeroX-4}" y="${margin.top}" width="8" height="${drawHeight}" fill="${isDark ? '#4b5563' : '#d1d5db'}"/>`;
        
       const drawProfile = (topStress, bottomStress, color) => {
           if (isNaN(topStress) || isNaN(bottomStress)) return;
           const topX = zeroX + topStress * stressScale;
           const bottomX = zeroX + bottomStress * stressScale;
           svg.innerHTML += `<polygon points="${zeroX},${margin.top} ${topX},${margin.top} ${bottomX},${H - margin.bottom} ${zeroX},${H - margin.bottom}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.5"/>`;
           svg.innerHTML += `<text x="${topX + (topStress >= 0 ? 3 : -3)}" y="${margin.top+4}" text-anchor="${topStress >= 0 ? 'start' : 'end'}" font-size="10" fill="${color}">${topStress.toFixed(1)}</text>`;
           svg.innerHTML += `<text x="${bottomX + (bottomStress >= 0 ? 3 : -3)}" y="${H-margin.bottom-2}" text-anchor="${bottomStress >= 0 ? 'start' : 'end'}" font-size="10" fill="${color}">${bottomStress.toFixed(1)}</text>`;
       };

       drawProfile(initial.top, initial.bottom, '#3b82f6');
       drawProfile(final_stress.top, final_stress.bottom, '#ef4444');
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

        const finalHtml = `
        <div id="concrete-beam-report" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                 <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copiar Relatório</button>
            </div>
            <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação da Viga Protendida (NBR 6118)</h2>
            ${inputSummaryHtml}
            ${calculatedPropsHtml}
            ${prestressChecksHtml}
        </div>`;

        row.querySelector('.remove-cable-point-btn').addEventListener('click', () => {
            row.remove();
            drawDiagrams();
            saveInputsToLocalStorage('prestressed-beam-inputs-v2', gatherBeamInputs());
        });
    }

    const handleRunCheck = createCalculationHandler({
        gatherInputsFunction: gatherBeamInputs,
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
    const diagramInputs = [...prestressedInputIds, 'beam_coords'];
    diagramInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', debouncedDraw);
            el.addEventListener('change', debouncedDraw); // For selects
        }
    });
    document.getElementById('cable-path-container').addEventListener('input', debouncedDraw);
    
    // Auto-save/load functionality
    const allInputAndTextareaIds = [...prestressedInputIds, 'beam_coords']; // Added beam_coords
    const debouncedSave = debounce(() => saveInputsToLocalStorage('prestressed-beam-inputs-v2', gatherBeamInputs()), 500);
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
        { label: 'Inicial', data: [{ x: initial.bottom, y: 0 }, { x: initial.top, y: properties.height }], borderColor: '#3b82f6' },
        { label: 'Final', data: [{ x: final_stress.bottom, y: 0 }, { x: final_stress.top, y: properties.height }], borderColor: '#ef4444' }
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
                    min: 0,
                    max: properties.height,
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