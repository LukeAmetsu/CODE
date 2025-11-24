/**
 * @file viga_protendida.js
 * @description NBR 6118 Prestressed Concrete Beam Checker - Multi-Cable Support & Detailed Reporting
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
    inputIds: [
        'design_code', 'unit_system', 'fck', 'Ap', 'Kperdas',
        'load_pp', 'load_perm', 'load_var', 'beam_length', 'beam_height', 'beam_coords', 'Ep',
        'humidity', 'fptk', 'mu', 'k', 'anchorage_slip', 'exposed_perimeter',
        'cement_s_factor', 'cement_alpha_factor'
    ],

    _parseVertices(text) {
        if (!text) return [];
        return text.split('\n')
            .map(line => line.trim().split(/[,; ]+/).map(Number))
            .filter(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]));
    },

    _gatherCables() {
        const container = document.getElementById('cables-list-container');
        if (!container) return [];
        const groupElements = Array.from(container.querySelectorAll('.cable-group-card'));
        return groupElements.map((groupEl, groupIndex) => {
            const ageInput = groupEl.querySelector('.cable-age');
            const strandsInput = groupEl.querySelector('.cable-strands');
            const rows = Array.from(groupEl.querySelectorAll('.cable-path-row'));
            const path = rows.map((row, index) => ({
                x: parseFloat(row.querySelector('.cable-x').value) || 0,
                y: parseFloat(row.querySelector('.cable-y').value) || 0,
                'type': index < rows.length - 1 ? row.querySelector('.cable-type').value : 'Straight'
            }));
            return {
                id: groupIndex + 1,
                age_at_prestress: parseFloat(ageInput.value) || 7,
                num_strands: parseInt(strandsInput.value) || 1,
                path: path
            };
        });
    },
};

const concreteBeamCalculator = (() => {
    function calculateSectionProperties(vertices) {
        if (!vertices || vertices.length < 3) return null;
        const points = [...vertices, vertices[0]];
        let A = 0.0, Qx = 0.0, Qy = 0.0, Ix = 0.0, Iy = 0.0;
        for (let i = 0; i < vertices.length; i++) {
            const [x0, y0] = points[i];
            const [x1, y1] = points[i + 1];
            const term = (x0 * y1) - (x1 * y0);
            A += term;
            Qy += (y0 + y1) * term;
            Qx += (x0 + x1) * term;
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
            r: { x: Math.sqrt(Math.abs(I_cx) / Math.abs(A)), y: Math.sqrt(Math.abs(I_cy) / Math.abs(A)) },
            W: { i: Wi, s: Ws },
            height: y_max - y_min,
            yi, ys, y_min, y_max, ki, ks
        };
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
        const beta_s_t0 = (t_ratio**3 + A_cs * t_ratio**2 + B_cs * t_ratio) / 
                            (t_ratio**3 + C_cs * t_ratio**2 + D_cs * t_ratio + E_cs);
        const epsilon_cs = (epsilon_1s * epsilon_2s * (1 - beta_s_t0)) / 10000;
        const delta_sigma_cs = epsilon_cs * E_p;
        return { value: delta_sigma_cs, h_fic_cm, epsilon_cs, intermediate: { h_fic_cm, gamma, epsilon_cs, beta_s_t0 } };
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
        const phi_d = 0.4;
        const phi_total = phi_a + phi_f + phi_d;
        return { value: phi_total, intermediate: { phi_a, phi_f, phi_d, beta_c_t0 } };
    }

    function solveForPrestressForce(sigma_limit, W, M, A, e, k_perdas = 1.0) {
        const P_inf_numerador = M - sigma_limit * W;
        const P_inf_denominador = e - W / A;
        if (Math.abs(P_inf_denominador) < 1e-9) return { value: NaN, calc: "Erro: Divisão por zero" };
        const P_inf = P_inf_numerador / P_inf_denominador;
        return { value: P_inf / k_perdas, calc: "" };
    }

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
                if (Math.abs(x1 - x0) < 1e-6) return y0; 
                const t = (x_pos - x0) / (x1 - x0);
                return y0 + t * (y1 - y0);
            }
        }
        return ys[ys.length - 1];
    }

    function calculateMaterialProperties({ fck, cables, Ep }) {
        const age_at_prestress = cables.length > 0 ? Math.min(...cables.map(c => c.age_at_prestress)) : 7;
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

    function run(raw_inputs) {
        const inputs = { ...raw_inputs };
        const { vertices, fck, beam_length, cables, Ap, Kperdas } = inputs;
        const Ap_single_cm2 = parseFloat(Ap) || 0;
        let total_strands = 0;
        cables.forEach(c => total_strands += c.num_strands);
        const Ap_total_cm2 = Ap_single_cm2 * total_strands;
        const Ap_total_m2 = Ap_total_cm2 / 1e4;

        if (!vertices || vertices.length < 3 || fck <= 0 || beam_length <= 0 || Ap_total_cm2 <= 0 || cables.length === 0) {
            return { errors: ["Entradas inválidas. Verifique geometria e cabos."] };
        }

        const props = calculateSectionProperties(vertices);
        if (!props) return { errors: ["Seção inválida."] };
        
        const A_m2 = props.area / 1e4;
        const Wi_m3 = props.W.i / 1e6;
        const Ws_m3 = props.W.s / 1e6;
        const I_cx_m4 = props.I.cx / 1e8;
        const y_cg = props.centroid.y / 100;
        const y_min_beam_m = Math.min(...vertices.map(p => p[1])) / 100;
        const materials = calculateMaterialProperties(inputs);
        const { loads, moments } = calculateLoadsAndMoments(inputs);

        const num_segments = 50;
        const standard_x = Array.from({length: num_segments + 1}, (_, i) => i * (beam_length / num_segments));
        let cables_analysis = [];

        cables.forEach((cable, idx) => {
            const cable_path_abs = cable.path.map(p => ({ ...p, y: p.y + y_min_beam_m }));
            const path_details = standard_x.map(x => {
                const y = getCablePositionAt(x, cable_path_abs, beam_length);
                const e = y_cg - y;
                return { x, y, e };
            });
            const x_a_result = calculateAnchorageSlipDistance(inputs, materials, cable_path_abs, cable.path.map(p=>p.x));
            cables_analysis.push({
                id: idx,
                strands: cable.num_strands,
                Ap_cable_m2: (cable.num_strands * Ap_single_cm2) / 1e4,
                age: cable.age_at_prestress,
                path_details: path_details,
                cable_path_abs: cable_path_abs,
                x_a_result: x_a_result
            });
        });

        const loss_results = calculateDetailedLossesMultiCable(inputs, props, materials, cables_analysis, moments, Ap_total_m2);
        
        // --- PREPARE DATA FOR DETAILED REPORTING (Equivalent Cable View) ---
        // We reconstruct a "detailed_calcs" object representing the Weighted Average
        const detailed_calcs = {
            friction: loss_results.sigma_p_friction.map(p => ({ x: p.x, value: p.value, calc: "Média Ponderada" })),
            anchorage: {
                x_a: cables_analysis.map(c => c.x_a_result.x_a).reduce((a,b)=>a+b,0)/cables_analysis.length, // Avg x_a
                betas: [], // Not easily averagable for display
                areas: [],
                A_delta: { value: 0, calc: "" },
                sigma_prime: loss_results.sigma_p_anchorage.map(p => ({ x: p.x, value: p.value, calc: "Média Ponderada" }))
            },
            elastic_shortening: loss_results.sigma_p_ime.map((p, i) => ({
                x: p.x,
                value: loss_results.sigma_p_anchorage[i].value - p.value, // Loss = Anchorage - Immediate
                calc: "Interação entre cabos (Média)"
            })),
            relaxation: [], // To be filled if needed, mostly conceptual in multi-cable
            shrinkage: { value: 0, calc: "Varia por cabo" }, // Placeholder
            creep: [],
            interaction: loss_results.sigma_p_inf.map((p, i) => ({
                x: p.x,
                value: loss_results.sigma_p_ime[i].value - p.value, // Total Time Dependent Loss
                calc: "Fluência + Retração + Relaxação (Média)"
            }))
        };
        loss_results.detailed_calcs = detailed_calcs; // Attach for reporter

        const stress_profiles = { initial: { top: 0, bottom: 0 }, final: { top: 0, bottom: 0 } };
        const mid_idx = Math.floor(standard_x.length / 2);
        const mid_x = standard_x[mid_idx];
        
        let P_total_i_mid = 0, M_prestress_i_mid = 0, P_total_inf_mid = 0, M_prestress_inf_mid = 0;
        loss_results.cables.forEach(c => {
             if (!c.sigma_p_ime || !c.sigma_p_inf) return;
             const sigma_i = c.sigma_p_ime.find(p => Math.abs(p.x - mid_x) < 0.1)?.value || 0;
             const sigma_inf = c.sigma_p_inf.find(p => Math.abs(p.x - mid_x) < 0.1)?.value || 0;
             const e_mid = c.path_details.find(p => Math.abs(p.x - mid_x) < 0.1)?.e || 0;
             const P_i_cable = sigma_i * c.Ap_cable_m2;
             const P_inf_cable = sigma_inf * c.Ap_cable_m2;
             P_total_i_mid += P_i_cable;
             M_prestress_i_mid += P_i_cable * e_mid;
             P_total_inf_mid += P_inf_cable;
             M_prestress_inf_mid += P_inf_cable * e_mid;
        });

        stress_profiles.initial.top = (-P_total_i_mid / A_m2) + (M_prestress_i_mid / Ws_m3) - (moments.M_g1k / 1000 / Ws_m3);
        stress_profiles.initial.bottom = (-P_total_i_mid / A_m2) - (M_prestress_i_mid / Wi_m3) + (moments.M_g1k / 1000 / Wi_m3);
        stress_profiles.final.top = (-P_total_inf_mid / A_m2) + (M_prestress_inf_mid / Ws_m3) - (moments.M_CQP / 1000 / Ws_m3);
        stress_profiles.final.bottom = (-P_total_inf_mid / A_m2) - (M_prestress_inf_mid / Wi_m3) + (moments.M_CF / 1000 / Wi_m3);

        const uls_checks = performUlsChecks(inputs, props, loss_results, Ap_total_m2, mid_x, cables_analysis);
        
        // Simple checks for display
        const total_e_mid = cables_analysis.reduce((sum, c) => sum + (c.path_details[mid_idx].e * c.Ap_cable_m2), 0);
        const avg_ecc_mid = Ap_total_m2 > 0 ? total_e_mid / Ap_total_m2 : 0;
        
        const prestress_checks = {
             P_i: P_total_i_mid / 1000, // Store in MN for consistency with solver? No, solver uses units passed. Solver returns MN. 
             // Let's store raw values for the report renderer
             P_total_i_mid_MN: P_total_i_mid,
             P_max_comp_i: solveForPrestressForce(-materials.limits.comp_i, -Ws_m3, moments.M_g1k / 1000, A_m2, avg_ecc_mid, 1.0),
             P_min_tens_i: solveForPrestressForce(materials.limits.tens_i, Wi_m3, moments.M_g1k / 1000, A_m2, avg_ecc_mid, 1.0),
             P_min_comp_s: solveForPrestressForce(-materials.limits.comp_s, -Ws_m3, moments.M_CQP / 1000, A_m2, avg_ecc_mid, Kperdas),
             P_max_tens_s: solveForPrestressForce(materials.limits.tens_s, Wi_m3, moments.M_CF / 1000, A_m2, avg_ecc_mid, Kperdas),
        };

        return {
            checks: {
                properties: props,
                materials,
                loads: { pp: inputs.load_pp, perm: inputs.load_perm, var: inputs.load_var, ...loads },
                moments,
                path_details: cables_analysis[0].path_details, 
                prestress_checks,
                loss_results,
                stress_profiles,
                uls_checks,
                cables_analysis,
                avg_ecc_mid // Passed for reporting
            },
            inputs
        };
    }

    function calculateAnchorageSlipDistance(inputs, materials, cable_path_abs, preliminary_key_points) {
        const { beam_length, mu, k, anchorage_slip, fptk } = inputs;
        const { E_p } = materials;
        const sigma_pi = 0.74 * fptk;
        const calc_points = [...new Set([...preliminary_key_points, 0, beam_length, beam_length/2])].sort((a,b)=>a-b);
        const refined_points = [];
        for(let i=0; i<calc_points.length-1; i++){
            refined_points.push(calc_points[i]);
            const diff = calc_points[i+1] - calc_points[i];
            if(diff > 1.0) { 
                 const steps = Math.ceil(diff);
                 for(let j=1; j<steps; j++) refined_points.push(calc_points[i] + j*(diff/steps));
            }
        }
        refined_points.push(calc_points[calc_points.length-1]);
        const points_to_check = [...new Set(refined_points)].sort((a,b)=>a-b);
        const sigma_p_friction_prelim = points_to_check.map(x => {
            const angle_at_start = getTangentAngleAt(0, cable_path_abs, beam_length);
            const current_angle = getTangentAngleAt(x, cable_path_abs, beam_length);
            const cumulative_alpha = Math.abs(current_angle - angle_at_start);
            const value = sigma_pi * Math.exp(-(mu * cumulative_alpha + k * x));
            return { x, value };
        });
        const delta = anchorage_slip;
        const A_delta = E_p * (delta / 1000);
        let cumulative_area = 0;
        let x_a = 0;
        for (let i = 1; i < sigma_p_friction_prelim.length; i++) {
            const p_i = sigma_p_friction_prelim[i];
            const p_i_minus_1 = sigma_p_friction_prelim[i - 1];
            const dx_i = p_i.x - p_i_minus_1.x;
            const beta_i = (p_i_minus_1.value - p_i.value) / dx_i;
            const x_prev_dist = p_i_minus_1.x - sigma_p_friction_prelim[0].x;
            const area_increment = beta_i * dx_i * dx_i + 2 * beta_i * dx_i * x_prev_dist;
            if (cumulative_area + area_increment >= A_delta) {
                 const remaining = A_delta - cumulative_area;
                 const dx_needed = Math.sqrt(remaining / beta_i); 
                 x_a = p_i_minus_1.x + dx_needed; 
                 break;
            }
            cumulative_area += area_increment;
        }
        if (x_a === 0 && A_delta > 0) x_a = beam_length;
        const sigma_pa = interpolate(x_a, sigma_p_friction_prelim.map(p=>p.x), sigma_p_friction_prelim.map(p=>p.value));
        return { x_a, sigma_pa, A_delta, delta };
    }

    function calculateDetailedLossesMultiCable(inputs, props, materials, cables_analysis, moments, Ap_total_m2) {
        const { beam_length, mu, k, fptk, load_pp } = inputs;
        const { E_p, alpha_p } = materials;
        const A_m2 = props.area / 1e4;
        const I_cx_m4 = props.I.cx / 1e8;
        const sigma_pi = 0.74 * fptk;
        const results_per_cable = [];

        cables_analysis.forEach(cable => {
            const angle_at_start = getTangentAngleAt(0, cable.cable_path_abs, beam_length);
            const sigma_p_friction = cable.path_details.map(p => {
                const current_angle = getTangentAngleAt(p.x, cable.cable_path_abs, beam_length);
                const alpha = Math.abs(current_angle - angle_at_start);
                const val = sigma_pi * Math.exp(-(mu * alpha + k * p.x));
                return { x: p.x, value: val };
            });
            const { x_a, sigma_pa } = cable.x_a_result;
            const sigma_p_anchorage = sigma_p_friction.map(p => ({
                x: p.x,
                value: p.x < x_a ? (2 * sigma_pa - p.value) : p.value
            }));
            results_per_cable.push({
                id: cable.id,
                path_details: cable.path_details,
                sigma_p_anchorage,
                sigma_p_friction, 
                x_a,
                sigma_p_ime: [],
                sigma_p_inf: []
            });
        });

        const num_cables = cables_analysis.length;
        const factor_ee = (num_cables > 1) ? (num_cables - 1) / (2 * num_cables) : 0.5;

        cables_analysis.forEach((cable, idx) => {
            const current_results = results_per_cable[idx];
            const delta_sigma_ee = cable.path_details.map((p, i) => {
                const M_g1k_x = (load_pp * p.x * (beam_length - p.x)) / 2;
                let sigma_cp_total = 0;
                cables_analysis.forEach((other_c, other_idx) => {
                    if(results_per_cable[other_idx].sigma_p_anchorage[i]) {
                        const other_P = results_per_cable[other_idx].sigma_p_anchorage[i].value * other_c.Ap_cable_m2;
                        const other_e = other_c.path_details[i].e;
                        sigma_cp_total += (other_P / A_m2) + (other_P * other_e * p.e / I_cx_m4);
                    }
                });
                const sigma_cm = -((M_g1k_x / 1000) * p.e) / I_cx_m4;
                const total_sigma_c = sigma_cp_total + sigma_cm;
                const val = alpha_p * total_sigma_c * factor_ee;
                return { x: p.x, value: Math.max(0, val) };
            });
            current_results.sigma_p_ime = current_results.sigma_p_anchorage.map((p, i) => ({
                x: p.x, value: p.value - delta_sigma_ee[i].value
            }));
        });

        cables_analysis.forEach((cable, idx) => {
             const current_results = results_per_cable[idx];
             if (!current_results.sigma_p_ime || current_results.sigma_p_ime.length === 0) return;
             const shrink = calculateShrinkageLoss(props, inputs.humidity, cable.age, E_p, inputs.exposed_perimeter);
             const delta_sigma_cs = shrink.value;
             const creep_coeff = calculateCreepCoefficient(inputs.fck, inputs.humidity, cable.age, shrink.h_fic_cm, inputs.cement_s_factor, inputs.cement_alpha_factor);
             const phi = creep_coeff.value;
             const sigma_p_inf = [];
             current_results.sigma_p_ime.forEach((p_ime, i) => {
                 const zeta = p_ime.value / fptk;
                 const psi_1000 = (zeta >= 0.6 && zeta < 0.7) ? 0.025 - (0.025 - 0.013) * ((0.7 - zeta) / 0.1) : (zeta >= 0.7 ? 0.025 : (zeta >= 0.5 ? 0.013 : 0));
                 const psi_inf = 2.5 * psi_1000;
                 const chi_inf = -Math.log(1 - psi_inf);
                 const delta_sigma_r = chi_inf * p_ime.value;
                 const M_gk_x = (inputs.load_pp + inputs.load_perm) * p_ime.x * (beam_length - p_ime.x) / 2;
                 let P_total_ime = 0;
                 let M_total_ime = 0;
                 cables_analysis.forEach((oc, oidx) => {
                      if (results_per_cable[oidx].sigma_p_ime[i]) {
                          const op_val = results_per_cable[oidx].sigma_p_ime[i].value;
                          const op_force = op_val * oc.Ap_cable_m2;
                          P_total_ime += op_force;
                          M_total_ime += op_force * oc.path_details[i].e;
                      }
                 });
                 const p_e = cable.path_details[i].e;
                 const sigma_c_p_perm = (P_total_ime / A_m2) + (M_total_ime * p_e / I_cx_m4);
                 const sigma_c_m_perm = -(M_gk_x / 1000 * p_e / I_cx_m4);
                 const sigma_c_perm = sigma_c_p_perm + sigma_c_m_perm;
                 const delta_sigma_cc = alpha_p * sigma_c_perm * phi;
                 const rho_p = Ap_total_m2 / A_m2; 
                 const chi_c = 1 + 0.5 * phi;
                 const eta_p = p_e * p_e * A_m2 / I_cx_m4; 
                 const theta = 1 + chi_inf + chi_c * rho_p * eta_p * alpha_p;
                 const delta_dif = (delta_sigma_r + delta_sigma_cs + delta_sigma_cc) / theta;
                 sigma_p_inf.push({ x: p_ime.x, value: p_ime.value - delta_dif });
             });
             current_results.sigma_p_inf = sigma_p_inf;
        });

        const combined_sigma_friction = [];
        const combined_sigma_ime = [];
        const combined_sigma_inf = [];
        const master_x = cables_analysis[0].path_details.map(p=>p.x);
        master_x.forEach((x, i) => {
             let P_fric = 0, P_ime = 0, P_inf = 0;
             results_per_cable.forEach((cr, idx) => {
                 if (cr.sigma_p_friction[i] && cr.sigma_p_ime[i] && cr.sigma_p_inf[i]) {
                     const ac = cables_analysis[idx].Ap_cable_m2;
                     P_fric += cr.sigma_p_friction[i].value * ac;
                     P_ime += cr.sigma_p_ime[i].value * ac;
                     P_inf += cr.sigma_p_inf[i].value * ac;
                 }
             });
             combined_sigma_friction.push({x, value: P_fric / Ap_total_m2});
             combined_sigma_ime.push({x, value: P_ime / Ap_total_m2});
             combined_sigma_inf.push({x, value: P_inf / Ap_total_m2});
        });

        return {
            cables: results_per_cable,
            sigma_p_friction: combined_sigma_friction, 
            sigma_p_ime: combined_sigma_ime, 
            sigma_p_inf: combined_sigma_inf, 
            sigma_p_anchorage: combined_sigma_friction, // Placeholder
            key_points: cables_analysis[0].path_details
        };
    }
    
    function performUlsChecks(inputs, props, loss_results, Ap_total_m2, mid_x, cables_analysis) {
        const { fck, fptk, load_pp, load_perm, load_var, beam_length, Ep } = inputs;
        const gamma_g = 1.4, gamma_q = 1.4, gamma_c = 1.4, gamma_s = 1.15;
        const pd = gamma_g * (load_pp + load_perm) + gamma_q * load_var;
        const Md_kNm = (pd * beam_length ** 2) / 8;
        const fcd = fck / gamma_c;
        const fpd = fptk / gamma_s;
        const lambda = fck <= 50 ? 0.8 : 0.8 - (fck - 50) / 400;
        const alpha_c = fck <= 50 ? 0.85 : 0.85 * (1 - (fck - 50) / 200);

        const mid_idx = cables_analysis[0].path_details.findIndex(p => Math.abs(p.x - mid_x) < 0.1);
        let sum_d_p_Ap = 0;
        let total_P_inf_mid = 0;

        loss_results.cables.forEach((c, idx) => {
             if (!c.sigma_p_inf || !c.sigma_p_inf[mid_idx]) return;
             const y_cable = cables_analysis[idx].path_details[mid_idx].y;
             const d_pi = props.y_max / 100 - y_cable;
             const Ap_i = cables_analysis[idx].Ap_cable_m2;
             const sigma_inf = c.sigma_p_inf[mid_idx].value;
             sum_d_p_Ap += d_pi * Ap_i;
             total_P_inf_mid += sigma_inf * Ap_i;
        });
        const d_p = Ap_total_m2 > 0 ? sum_d_p_Ap / Ap_total_m2 : 0;
        const avg_sigma_inf = Ap_total_m2 > 0 ? total_P_inf_mid / Ap_total_m2 : 0;
        const epsilon_p0 = avg_sigma_inf / Ep;

        let x_m = props.height / 200; 
        for (let i = 0; i < 50; i++) {
            const epsilon_c = 0.0035;
            const delta_epsilon_p = x_m > 0 ? epsilon_c * (d_p - x_m) / x_m : 0;
            const epsilon_pd = epsilon_p0 + delta_epsilon_p;
            const sigma_pd = Math.min(epsilon_pd * Ep, fpd); 
            const compression_depth_m = lambda * x_m;
            const compressed_area_m2 = calculateCompressedArea(inputs.vertices, compression_depth_m * 100, props.y_max) / 10000;
            const Fst = sigma_pd * Ap_total_m2 * 1000;
            const Fcc = alpha_c * fcd * compressed_area_m2 * 1000;
            const force_diff = Fcc - Fst;
            if (Math.abs(force_diff) < 0.001 * Fst) break;
            x_m *= Fcc > 0 ? (Fst / Fcc) : 1.1;
        }

        const compression_props = calculateCompressedAreaProperties(inputs.vertices, lambda * x_m * 100, props.y_max);
        const y_cc_m = (props.y_max - compression_props.centroid_y) / 100;
        const z = d_p - y_cc_m;
        const MRd_kNm = (alpha_c * fcd * compression_props.area / 10000 * 1000) * z;
        const ratio = MRd_kNm > 0 ? Md_kNm / MRd_kNm : Infinity;
        const x_lim_ratio = fck <= 50 ? 0.45 : 0.35;
        const x_lim = x_lim_ratio * d_p;
        const ductility_check = x_m <= x_lim;
        return { Md_kNm, MRd_kNm, ratio, x_m, d_p, z, y_cc_m, x_lim, x_lim_ratio, ductility_check };
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
                    if (Math.abs(p2.x - p1.x) < 1e-6) slope = 0;
                    else {
                        const h = vertex.x;
                        const k = vertex.y;
                        const a = (other_point.y - k) / (other_point.x - h) ** 2;
                        slope = 2 * a * (eval_x - h);
                    }
                } else {
                    slope = (p2.y - p1.y) / (p2.x - p1.x);
                }
                return Math.atan(slope * sign_multiplier);
            }
        }
        return 0;
    }

    function getCablePositionAt(x_pos, cable_path_abs, beam_length) {
        if (!cable_path_abs || cable_path_abs.length === 0) return 0;
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
                    const a = (other_point.y - vertex.y) / (other_point.x - vertex.x) ** 2;
                    return a * (eval_x - vertex.x) ** 2 + vertex.y;
                } else {
                    return interpolate(eval_x, [p1.x, p2.x], [p1.y, p2.y]);
                }
            }
        }
        return cable_path_abs[cable_path_abs.length - 1].y;
    }
    
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
            if (p1_is_compressed && p2_is_compressed) {
                compressed_area += (p1.x + p2.x) * (p1.y - p2.y);
            } else if (p1_is_compressed && !p2_is_compressed) {
                const intersect_x = p1.x + (p2.x - p1.x) * (y_clip - p1.y) / (p2.y - p1.y);
                compressed_area += (p1.x + intersect_x) * (p1.y - y_clip);
            } else if (!p1_is_compressed && p2_is_compressed) {
                const intersect_x = p1.x + (p2.x - p1.x) * (y_clip - p1.y) / (p2.y - p1.y);
                compressed_area += (intersect_x + p2.x) * (y_clip - p2.y);
            }
        }
        return Math.abs(compressed_area / 2);
    }
    
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

    return { run, calculateSectionProperties, getCablePositionAt, calculateShrinkageLoss, calculateCreepCoefficient };
})();

// --- UI AND REPORT GENERATION FUNCTIONS ---

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
    return h('div', { id, className: 'report-section-copyable bg-white dark:bg-gray-800 p-4 rounded mb-4 shadow-sm' }, [
        h('div', { className: 'flex justify-between items-center mb-2 border-b pb-2' }, [
            h('h3', { className: 'font-bold text-lg' }, [title]),
        ]),
        h('div', { className: 'copy-content' }, contentChildren)
    ]);
}

function createSummaryTable(captionText, rowsData, marginTop = 'mt-2') {
    return h('table', { className: `w-full ${marginTop} summary-table text-sm text-left` }, [
        h('caption', { className: 'font-bold text-left mb-1 opacity-80' }, [captionText]),
        h('tbody', {}, rowsData.map(([label, value]) =>
            h('tr', { className: 'border-b border-gray-100 dark:border-gray-700' }, [
                h('td', { innerHTML: label, className: 'py-1' }),
                h('td', { innerHTML: value, className: 'py-1 font-mono text-right' })
            ])
        ))
    ]);
}

function renderResults(results) {
    const resultsDiv = document.getElementById('results-container');
    const { checks, inputs, errors } = results;
    if (!checks || errors) {
        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(h('p', { className: 'text-center text-red-500 font-bold' }, [`Calculation failed: ${errors?.[0] || 'Unknown error'}`]));
        return;
    }

    const reportEl = h('div', { id: 'concrete-beam-report', className: 'space-y-6' }, [
        renderInputSummary(inputs, checks),
        renderCalculatedProperties(checks, inputs),
        renderDetailedLossCalculations(checks.loss_results),
        renderLossesTableAndChart(checks.loss_results),
        renderPrestressChecks(checks),
        renderUlsChecks(checks)
    ]);

    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(reportEl);

    drawStressDiagram('stress-diagram-canvas', results.checks);
    drawLossesChart('losses-chart-canvas', checks.loss_results);
}

function renderInputSummary(inputs, checks) {
    const { fck, load_pp, load_perm, load_var, beam_length, cables } = inputs;
    const total_strands = cables.reduce((s, c) => s + c.num_strands, 0);

    const generalRows = [
        ['Resistência do Concreto (f<sub>ck</sub>)', `${fck} MPa`],
        ['Comprimento da Viga (L)', `${beam_length} m`],
        ['Total Cordoalhas', `<b>${total_strands}</b>`],
    ];
    const loadRows = [
        ['Peso Próprio (g<sub>pp</sub>)', `${load_pp} kN/m`],
        ['Carga Permanente (g<sub>perm</sub>)', `${load_perm} kN/m`],
        ['Carga Variável (q<sub>var</sub>)', `${load_var} kN/m`]
    ];

    const cablesTable = h('table', { className: 'w-full mt-2 text-sm text-center border' }, [
        h('thead', {className:'bg-gray-100 dark:bg-gray-700'}, [h('tr', {}, ['Grupo', 'Idade (dias)', 'Cordoalhas'].map(t=>h('th', {className:'p-1'}, [t])))]),
        h('tbody', {}, cables.map((c, i) => h('tr', {}, [
            h('td', {}, [`Cabo ${i+1}`]),
            h('td', {}, [`${c.age_at_prestress}`]),
            h('td', {}, [`${c.num_strands}`])
        ])))
    ]);

    return createReportSection('input-summary-section', 'Resumo dos Dados', [
        h('div', {className:'grid grid-cols-1 md:grid-cols-2 gap-4'}, [
            createSummaryTable('Geral', generalRows),
            createSummaryTable('Cargas', loadRows),
        ]),
        h('h4', {className:'font-bold mt-4 text-sm'}, ['Configuração dos Cabos']),
        cablesTable
    ]);
}

function renderCalculatedProperties(checks, inputs) {
    const { properties, materials, loads, moments } = checks;
    const fmt = (val, dec = 2) => (val !== undefined && val !== null && !isNaN(val)) ? val.toFixed(dec) : 'N/A';
    
    const geometricRows = [
        ['Área da Seção (A)', `${fmt(properties.area, 2)} cm²`],
        ['Inércia (I<sub>cx</sub>)', `${fmt(properties.I.cx, 0)} cm⁴`],
        ['Módulo Resist. Inf. (W<sub>i</sub>)', `${fmt(properties.W.i, 0)} cm³`],
        ['Módulo Resist. Sup. (W<sub>s</sub>)', `${fmt(properties.W.s, 0)} cm³`],
        ['Excentricidade Média (Meio Vão)', `${fmt(checks.avg_ecc_mid * 100, 2)} cm`]
    ];
    const momentRows = [
        ['Momento (Peso Próprio)', `${fmt(moments.M_g1k, 1)} kN·m`],
        ['Momento (Quase-Perm.)', `${fmt(moments.M_CQP, 1)} kN·m`],
        ['Momento (Frequente)', `${fmt(moments.M_CF, 1)} kN·m`],
    ];

    return createReportSection('calculated-props-section', 'Propriedades e Solicitações', [
        h('div', {className:'grid grid-cols-1 md:grid-cols-2 gap-4'}, [
            createSummaryTable('Geometria', geometricRows),
            createSummaryTable('Momentos (ELS)', momentRows),
        ])
    ]);
}

function renderDetailedLossCalculations(loss_results) {
    if (!loss_results || !loss_results.detailed_calcs) return document.createDocumentFragment();
    const { detailed_calcs } = loss_results;
    
    const createCalcLine = (text) => h('div', { className: 'font-mono text-sm py-1 border-b border-gray-50 dark:border-gray-700', innerHTML: text });
    
    const frictionContent = detailed_calcs.friction.map(c => createCalcLine(`x=${c.x.toFixed(1)}m: σ<sub>p,atrito</sub> = <b>${c.value.toFixed(1)} MPa</b>`));
    
    const timeDependentContent = detailed_calcs.interaction.map(c => createCalcLine(`x=${c.x.toFixed(1)}m: Δσ<sub>diferida</sub> = <b>${c.value.toFixed(1)} MPa</b>`));

    return createReportSection('detailed-losses-section', 'Memória de Cálculo (Cabo Equivalente / Média)', [
        h('p', {className:'text-xs text-gray-500 mb-2'}, ['Nota: Os valores abaixo representam a média ponderada das tensões de todos os cabos.']),
        h('h4', { className: 'font-bold mt-2' }, ['1. Perdas por Atrito (Média)']),
        h('div', { className: 'max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded' }, frictionContent),
        
        h('h4', { className: 'font-bold mt-4' }, ['2. Perdas Diferidas (Fluência/Retração/Relaxação)']),
        h('div', { className: 'max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded' }, timeDependentContent),
    ]);
}

function renderLossesTableAndChart(loss_results) {
    return createReportSection('losses-section', 'Gráfico de Perdas de Tensão', [
        h('div', { className: 'p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg' }, [
            h('div', { className: 'relative h-80' }, [h('canvas', { id: 'losses-chart-canvas' })])
        ])
    ]);
}

function renderPrestressChecks(checks) {
    const { prestress_checks, materials } = checks;
    const fmt = (val) => (!isNaN(val)) ? val.toFixed(1) : 'N/A';
    
    const P_adopt_kN = prestress_checks.P_total_i_mid_MN; // actually in MN? No, calculation summed MN/m2 * m2 = MN. 
    // Wait, let's fix units display. solver returns MN? 
    // run function: P_i_cable = sigma(MPa) * Area(m2) = MN.
    // So P_total is MN. Let's display kN.
    const P_kN = P_adopt_kN * 1000;
    
    const P_min_tens_i_val = prestress_checks.P_min_tens_i.value * 1000;
    const P_max_comp_i_val = prestress_checks.P_max_comp_i.value * 1000;
    
    return createReportSection('prestress-checks-section', 'Verificação da Força (Meio do Vão)', [
        h('p', { className: 'text-center font-bold text-lg mb-2' }, [`Força Total Equivalente (P<sub>i</sub>) = ${fmt(P_kN)} kN`]),
        h('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' }, [
            h('div', {}, [
                 h('h4', { className: 'font-bold text-sm' }, ['Limites de Força (Estimativa)']),
                 h('p', {className:'text-sm'}, [`Máx Compressão Inicial: ${fmt(P_max_comp_i_val)} kN`]),
                 h('p', {className:'text-sm'}, [`Min Tração Inicial: ${fmt(P_min_tens_i_val)} kN`])
            ]),
            h('div', {}, [
                h('h4', { className: 'font-bold text-sm' }, ['Diagrama de Tensões (Seção)']),
                h('div', { className: 'relative h-40 w-full' }, [h('canvas', { id: 'stress-diagram-canvas' })])
            ])
        ])
    ]);
}

function renderUlsChecks(checks) {
    const { uls_checks } = checks;
    if (!uls_checks || uls_checks.ratio === Infinity) return createReportSection('uls', 'ELU', [h('p',{},['Erro no cálculo ELU'])]);
    
    const is_valid = uls_checks.ratio <= 1.0;
    const colorClass = is_valid ? 'text-green-600' : 'text-red-600';
    
    const rows = [
        ['M<sub>Sd</sub> (Solicitante)', `${uls_checks.Md_kNm.toFixed(1)} kNm`],
        ['M<sub>Rd</sub> (Resistente)', `${uls_checks.MRd_kNm.toFixed(1)} kNm`],
        ['Linha Neutra (x)', `${(uls_checks.x_m*100).toFixed(1)} cm`],
        ['Altura Útil (d<sub>p</sub>)', `${(uls_checks.d_p*100).toFixed(1)} cm`],
        ['Relação M<sub>Sd</sub>/M<sub>Rd</sub>', `<b class="${colorClass}">${uls_checks.ratio.toFixed(3)}</b>`]
    ];
    
    return createReportSection('uls-checks-section', 'Verificação ELU (Estado Limite Último)', [
        createSummaryTable('Flexão', rows)
    ]);
}

// --- INITIALIZATION ---

function addCableGroup(containerId, data = null) {
    const container = document.getElementById(containerId);
    const index = container.children.length + 1;
    const card = document.createElement('div');
    card.className = 'cable-group-card border rounded-md p-4 mb-4 bg-white dark:bg-gray-800 shadow-sm relative';
    card.innerHTML = `
        <div class="flex justify-between items-center mb-3 pb-2 border-b dark:border-gray-700">
            <h3 class="font-bold text-sm text-blue-600 dark:text-blue-400">Cabo ${index}</h3>
            <button class="remove-group-btn text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 rounded border border-red-200 dark:border-red-900">Remover Grupo</button>
        </div>
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div><label class="block text-xs font-medium mb-1">Idade Protensão (dias)</label><input type="number" class="cable-age w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" value="${data ? data.age_at_prestress : 7}"></div>
            <div><label class="block text-xs font-medium mb-1">Cordoalhas neste Cabo</label><input type="number" class="cable-strands w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" value="${data ? data.num_strands : 12}"></div>
        </div>
        <div class="cable-points-container space-y-2">
            <div class="grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-2 text-[10px] font-semibold text-gray-500 uppercase"><span>X (m)</span><span>Y (m)</span><span>Tipo</span><span></span></div>
        </div>
        <button class="add-point-btn mt-2 text-xs w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 py-1 rounded text-gray-600 dark:text-gray-300">+ Adicionar Ponto ao Cabo ${index}</button>
    `;
    const pointsContainer = card.querySelector('.cable-points-container');
    const initialPoints = data ? data.path : [{x:0, y:0.35, type:'Parabolic'}, {x:9, y:0.10, type:'Straight'}];
    initialPoints.forEach(p => addPointRow(pointsContainer, p));
    card.querySelector('.add-point-btn').addEventListener('click', () => addPointRow(pointsContainer));
    card.querySelector('.remove-group-btn').addEventListener('click', () => { card.remove(); window.dispatchEvent(new Event('input')); });
    card.querySelectorAll('input').forEach(i => i.addEventListener('input', () => window.dispatchEvent(new Event('input'))));
    container.appendChild(card);
}

function addPointRow(container, point = {x:0, y:0.35, type:'Parabolic'}) {
    const row = document.createElement('div');
    row.className = 'cable-path-row grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-2 items-center';
    row.innerHTML = `
        <input type="number" class="cable-x w-full p-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" value="${point.x}">
        <input type="number" class="cable-y w-full p-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600" value="${point.y}">
        <select class="cable-type w-full p-1 text-xs border rounded dark:bg-gray-700 dark:border-gray-600">
            <option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Parab.</option>
            <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Reto</option>
        </select>
        <button class="remove-point text-red-500 font-bold px-1">&times;</button>
    `;
    row.querySelector('.remove-point').addEventListener('click', () => { row.remove(); window.dispatchEvent(new Event('input')); });
    row.querySelectorAll('input, select').forEach(i => i.addEventListener('input', () => window.dispatchEvent(new Event('input'))));
    container.appendChild(row);
}

function drawCrossSectionDiagram(canvasId, vertices) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    let existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();
    if (!vertices || vertices.length < 3) return;
    const props = concreteBeamCalculator.calculateSectionProperties(vertices);
    if (!props) return;
    const sectionData = [...vertices, vertices[0]].map(p => ({ x: p[0], y: p[1] }));
    const all_x = vertices.map(v => v[0]);
    const all_y = vertices.map(v => v[1]);
    const rangeX = Math.max(...all_x) - Math.min(...all_x);
    const rangeY = Math.max(...all_y) - Math.min(...all_y);
    const maxRange = Math.max(rangeX, rangeY) * 1.2;
    new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Seção', data: sectionData, borderColor: '#4b5563', backgroundColor: '#e5e7eb', fill: true, pointRadius: 0
            }, {
                label: 'CG', data: [{ x: props.centroid.x, y: props.centroid.y }], pointBackgroundColor: 'red', pointRadius: 4
            }]
        },
        options: { maintainAspectRatio: false, scales: { x: { type: 'linear', min: props.centroid.x - maxRange/2, max: props.centroid.x + maxRange/2 }, y: { min: props.centroid.y - maxRange/2, max: props.centroid.y + maxRange/2 } }, plugins: { legend: { display: false } } }
    });
}

function drawLongitudinalDiagram(canvasId, inputs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    let existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();
    const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
    if (!props) return;
    const beamOutline = [{ x: 0, y: props.y_min }, { x: inputs.beam_length, y: props.y_min }, { x: inputs.beam_length, y: props.y_max }, { x: 0, y: props.y_max }, { x: 0, y: props.y_min }];
    const datasets = [{ label: 'Viga', data: beamOutline, borderColor: '#9ca3af', backgroundColor: 'rgba(200,200,200,0.2)', fill: true, pointRadius: 0, order: 10 }];
    const cableColors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981'];
    inputs.cables.forEach((cable, idx) => {
        const cablePoints = [];
        const numSegments = 100;
        const cable_path_abs = cable.path.map(p => ({ ...p, y: p.y + Math.min(...inputs.vertices.map(v=>v[1]))/100 }));
        for (let i = 0; i <= numSegments; i++) {
            const x = (i / numSegments) * inputs.beam_length;
            const y = concreteBeamCalculator.getCablePositionAt(x, cable_path_abs, inputs.beam_length);
            cablePoints.push({ x, y: y * 100 });
        }
        datasets.push({ label: `Cabo ${idx+1}`, data: cablePoints, borderColor: cableColors[idx % cableColors.length], borderWidth: 2, pointRadius: 0, fill: false, tension: 0.1 });
    });
    new Chart(canvas, { type: 'line', data: { datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'linear', max: inputs.beam_length * 1.05 }, y: { min: props.y_min - 10, max: props.y_max + 10 } } } });
}

function drawLossesChart(canvasId, loss_data) {
    const chartCanvas = document.getElementById(canvasId);
    if (!chartCanvas || !loss_data) return;
    let existingChart = Chart.getChart(chartCanvas);
    if (existingChart) existingChart.destroy();
    const datasets = [
        { label: 'Inicial (Média)', data: loss_data.sigma_p_ime.map(p=>({x:p.x, y:p.value})), borderColor: '#3b82f6', pointRadius: 0 },
        { label: 'Final (Média)', data: loss_data.sigma_p_inf.map(p=>({x:p.x, y:p.value})), borderColor: '#ef4444', borderWidth: 2, pointRadius: 0 }
    ];
    new Chart(chartCanvas, { type: 'line', data: { datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { type: 'linear' }, y: { title: { display: true, text: 'Tensão Média (MPa)' } } } } });
}

function drawStressDiagram(canvasId, results) {
    const chartCanvas = document.getElementById(canvasId);
    if (!chartCanvas || !results || !results.stress_profiles) return;
    let existingChart = Chart.getChart(chartCanvas);
    if (existingChart) existingChart.destroy();
    const { stress_profiles, properties } = results;
    const { initial, final: final_stress } = stress_profiles;
    // Check for NaNs
    if (isNaN(initial.top) || isNaN(initial.bottom)) return;

    const datasets = [
        { label: 'Inicial', data: [{ x: initial.bottom, y: properties.y_min }, { x: initial.top, y: properties.y_max }], borderColor: '#3b82f6', showLine: true },
        { label: 'Final', data: [{ x: final_stress.bottom, y: properties.y_min }, { x: final_stress.top, y: properties.y_max }], borderColor: '#ef4444', showLine: true }
    ];
    new Chart(chartCanvas, { type: 'scatter', data: { datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display:true, text: 'Tensão (MPa)'} } } } });
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof injectHeader === 'function') injectHeader({ activePage: 'viga-protendida', pageTitle: 'Verificador de Viga Protendida (NBR 6118)', headerPlaceholderId: 'header-placeholder' });
    if (typeof injectFooter === 'function') injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    if (typeof initializeSharedUI === 'function') initializeSharedUI();

    addCableGroup('cables-list-container');
    document.getElementById('add-cable-group-btn').addEventListener('click', () => addCableGroup('cables-list-container'));

    const gatherAllInputs = () => {
        const inputs = inputManager.inputIds.reduce((acc, id) => {
            const el = document.getElementById(id);
            if (el) acc[id] = (el.type === 'number') ? parseFloat(el.value) || 0 : el.value;
            return acc;
        }, {});
        inputs.vertices = inputManager._parseVertices(document.getElementById('beam_coords')?.value);
        inputs.cables = inputManager._gatherCables(); 
        return inputs;
    };

    const drawAll = debounce(() => {
        const inputs = gatherAllInputs();
        drawCrossSectionDiagram('cross-section-canvas', inputs.vertices);
        drawLongitudinalDiagram('longitudinal-canvas', inputs);
    }, 300);

    window.addEventListener('input', drawAll);
    document.getElementById('run-check-btn').addEventListener('click', () => {
        const res = concreteBeamCalculator.run(gatherAllInputs());
        renderResults(res);
    });
    drawAll();
});