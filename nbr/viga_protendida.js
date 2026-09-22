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

    function calculateInitialPrestressEstimate({ moments, materials, props, Kperdas, cables, ecc_mid, Ap, fptk }) {
        const total_strands = cables.reduce((acc, c) => acc + c.num_strands, 0);
        const Ap_single_cm2 = parseFloat(Ap) || 0;

        const P_strand_kN = (Ap_single_cm2 * 0.74 * fptk) / 10;
        const M_aux_kNm = Math.max(moments.M_CF - (props.W.i / 1e6) * materials.fctf * 1000, moments.M_CQP);
        const ks_m = props.ks / 100;
        const denominator = ks_m + ecc_mid;

        let P_est_i = 0;
        if (Math.abs(denominator) > 1e-9) {
            P_est_i = (M_aux_kNm) / denominator;
        }

        const Pest_perdas = Kperdas > 0 ? P_est_i / Kperdas : 0;

        const num_cables = cables.length || 1;
        const num_tendons_total_est = (P_strand_kN > 0) ? Math.ceil(Pest_perdas / P_strand_kN) : 0;
        const num_tendons_per_cable = Math.ceil(num_tendons_total_est / num_cables);

        return {
            M_aux_kNm,
            ks_m,
            P_est_i,
            Pest_perdas,
            num_tendons: num_tendons_per_cable,
            total_tendons: num_tendons_total_est,
            P_cable: P_strand_kN
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
        const epsilon_1s = -8.09 + U / 15 - U ** 2 / 2284 - U ** 3 / 133765 + U ** 4 / 7608150;
        const epsilon_2s = (33 + 2 * h_fic_cm) / (20.8 + 3 * h_fic_cm);
        const h_aux = h_fic_cm / 100;
        const A_cs = 40;
        const B_cs = 116 * h_aux ** 3 - 282 * h_aux ** 2 + 220 * h_aux - 4.8;
        const C_cs = 2.5 * h_aux ** 3 - 8.8 * h_aux + 40.7;
        const D_cs = -75 * h_aux ** 3 + 585 * h_aux ** 2 + 496 * h_aux - 6.8;
        const E_cs = -169 * h_aux ** 4 + 88 * h_aux ** 3 + 584 * h_aux ** 2 - 39 * h_aux + 0.8;
        const t_ratio = t0 / 100;
        const beta_s_t0 = (t_ratio ** 3 + A_cs * t_ratio ** 2 + B_cs * t_ratio) /
            (t_ratio ** 3 + C_cs * t_ratio ** 2 + D_cs * t_ratio + E_cs);
        const epsilon_cs = (epsilon_1s * epsilon_2s * (1 - beta_s_t0)) / 10000;
        const delta_sigma_cs = epsilon_cs * E_p;
        return { value: delta_sigma_cs, h_fic_cm, epsilon_cs, intermediate: { h_fic_cm, gamma, epsilon_cs, beta_s_t0, epsilon_1s, epsilon_2s } };
    }

    function calculateCreepCoefficient(fck, humidity, age_at_loading, h_fic_cm, s_factor, alpha_factor) {
        const U = humidity;
        const t0 = age_at_loading;
        const t_0c = alpha_factor * t0;
        const phi_a = 0.8 * (1 - Math.exp(-s_factor * Math.sqrt(28 / t_0c)));
        const phi_1c = 4.45 - 0.035 * U;
        const phi_2c = (42 + h_fic_cm) / (20 + h_fic_cm);
        const h_aux = h_fic_cm / 100;
        const A_cc = 42 * h_aux ** 3 - 350 * h_aux ** 2 + 588 * h_aux + 113;
        const B_cc = 768 * h_aux ** 3 - 3060 * h_aux ** 2 + 3234 * h_aux - 23;
        const C_cc = -200 * h_aux ** 3 + 13 * h_aux ** 2 + 1090 * h_aux + 183;
        const D_cc = 7579 * h_aux ** 3 - 31916 * h_aux ** 2 + 35343 * h_aux + 1931;
        const beta_c_t0 = (t_0c ** 2 + A_cc * t_0c + B_cc) / (t_0c ** 2 + C_cc * t_0c + D_cc);
        const phi_f = phi_1c * phi_2c * (1 - beta_c_t0);
        const phi_d = 0.4;
        const phi_total = phi_a + phi_f + phi_d;
        return { value: phi_total, intermediate: { phi_a, phi_f, phi_d, beta_c_t0, phi_1c, phi_2c } };
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

        const total_strands = cables.reduce((sum, c) => sum + c.num_strands, 0);
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
        const standard_x = Array.from({ length: num_segments + 1 }, (_, i) => i * (beam_length / num_segments));
        let cables_analysis = [];

        cables.forEach((cable, idx) => {
            const cable_path_abs = cable.path.map(p => ({ ...p, y: p.y + y_min_beam_m }));
            const path_details = standard_x.map(x => {
                const y = getCablePositionAt(x, cable_path_abs, beam_length);
                const e = y_cg - y;
                return { x, y, e };
            });
            const x_a_result = calculateAnchorageSlipDistance(inputs, materials, cable_path_abs, cable.path.map(p => p.x));
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

        const detailed_calcs = {
            friction: loss_results.sigma_p_friction.map((p, i) => {
                const calcStr = `${p.value.toFixed(1)} MPa`;
                return { x: p.x, value: p.value || 0, calc: calcStr };
            }),
            anchorage: {
                x_a: cables_analysis.map(c => c.x_a_result.x_a).reduce((a, b) => a + b, 0) / cables_analysis.length,
                A_delta: { value: cables_analysis[0].x_a_result.A_delta || 0, calc: '' },
                sigma_prime: loss_results.sigma_p_anchorage.map(p => ({ x: p.x, value: p.value || 0, calc: '' }))
            },
            elastic_shortening: loss_results.sigma_p_ime.map((p, i) => ({
                x: p.x,
                value: (loss_results.sigma_p_anchorage[i]?.value || 0) - (p.value || 0),
                calc: ""
            })),
            relaxation: [],
            creep: [],
            interaction: []
        };

        if (loss_results.cables.length > 0) {
            loss_results.sigma_p_inf.forEach((p, i) => {
                const total_ime = loss_results.sigma_p_ime[i]?.value || 0;
                const total_loss = total_ime - p.value;
                detailed_calcs.interaction.push({
                    x: p.x,
                    value: total_loss,
                    calc: `(${total_ime.toFixed(1)} - ${p.value.toFixed(1)})`
                });
            });
        }

        loss_results.detailed_calcs = detailed_calcs;

        const stress_profiles = { initial: { top: 0, bottom: 0 }, final: { top: 0, bottom: 0 } };

        // ——————————————————————————————————————
        // CÁLCULO CORRETO DA FORÇA TOTAL NO MEIO DO VÃO
        // ——————————————————————————————————————
        const n_points = loss_results.sigma_p_ime ? loss_results.sigma_p_ime.length : 51;
        const mid_idx = Math.floor(n_points / 2); // garante o ponto central (x = 10 m)
        const mid_x = standard_x[mid_idx]; // Preserva mid_x para ULS

        let P_total_i_mid = 0;
        let P_total_inf_mid = 0;
        let M_prestress_i_mid = 0;
        let M_prestress_inf_mid = 0;

        loss_results.cables.forEach(c => {
            // --- Tensão no meio do vão (com múltiplos fallbacks) ---
            let sigma_i = 0;
            let sigma_inf = 0;

            // 1º tentativa: valores individuais do cabo
            if (c.sigma_p_ime && Array.isArray(c.sigma_p_ime) && c.sigma_p_ime[mid_idx]) {
                sigma_i = c.sigma_p_ime[mid_idx].value || 0;
            }
            if (c.sigma_p_inf && Array.isArray(c.sigma_p_inf) && c.sigma_p_inf[mid_idx]) {
                sigma_inf = c.sigma_p_inf[mid_idx].value || 0;
            }

            // 2º tentativa: média ponderada global
            if (sigma_i === 0 && loss_results.sigma_p_ime && loss_results.sigma_p_ime[mid_idx]) {
                sigma_i = loss_results.sigma_p_ime[mid_idx].value || 0;
            }
            if (sigma_inf === 0 && loss_results.sigma_p_inf && loss_results.sigma_p_inf[mid_idx]) {
                sigma_inf = loss_results.sigma_p_inf[mid_idx].value || 0;
            }

            // --- Excentricidade no meio do vão ---
            let e_mid = 0;
            if (c.path_details && c.path_details[mid_idx] && typeof c.path_details[mid_idx].e === 'number') {
                e_mid = c.path_details[mid_idx].e;
            }

            // --- Área do cabo em m² (já vem correta no objeto após correção da função detalhada) ---
            const Ap_m2 = c.Ap_cable_m2 || 0;

            // --- Força em kN ---
            const Pi_cabo = sigma_i * Ap_m2 * 1000;   // MPa × m² → MN → *1000 = kN
            const Pinf_cabo = sigma_inf * Ap_m2 * 1000;

            P_total_i_mid += Pi_cabo;
            P_total_inf_mid += Pinf_cabo;
            M_prestress_i_mid += Pi_cabo * e_mid;
            M_prestress_inf_mid += Pinf_cabo * e_mid;
        });

        // Arredondamento para exibição
        P_total_i_mid = Math.round(P_total_i_mid);
        P_total_inf_mid = Math.round(P_total_inf_mid);

        stress_profiles.initial.top = (-P_total_i_mid * 1000 / A_m2) + (M_prestress_i_mid * 1000 / Ws_m3) - (moments.M_g1k / 1000 / Ws_m3); // Força em N
        stress_profiles.initial.bottom = (-P_total_i_mid * 1000 / A_m2) - (M_prestress_i_mid * 1000 / Wi_m3) + (moments.M_g1k / 1000 / Wi_m3);
        // Ajustado para usar kN no diagrama corretamente (P_total_i_mid já está em kN, convertendo para N para consistência com momento kNm -> Nm se necessário, mas propriedades estão em m. 
        // Correção: Se P em kN, A em m² -> P/A = kPa. Para MPa dividir por 1000.
        // Se P em kN, M em kNm. W em m³.
        // P/A (kN/m2 = kPa) / 1000 = MPa.
        stress_profiles.initial.top = (-P_total_i_mid / A_m2 / 1000) + (M_prestress_i_mid / Ws_m3 / 1000) - (moments.M_g1k / 1000 / Ws_m3);
        stress_profiles.initial.bottom = (-P_total_i_mid / A_m2 / 1000) - (M_prestress_i_mid / Wi_m3 / 1000) + (moments.M_g1k / 1000 / Wi_m3);

        stress_profiles.final.top = (-P_total_inf_mid / A_m2 / 1000) + (M_prestress_inf_mid / Ws_m3 / 1000) - (moments.M_CQP / 1000 / Ws_m3);
        stress_profiles.final.bottom = (-P_total_inf_mid / A_m2 / 1000) - (M_prestress_inf_mid / Wi_m3 / 1000) + (moments.M_CF / 1000 / Wi_m3);

        const uls_checks = performUlsChecks(inputs, props, loss_results, Ap_total_m2, mid_x, cables_analysis);

        // Excentricidade Média Ponderada
        const total_e_mid = cables_analysis.reduce((sum, c) => sum + (c.path_details[mid_idx].e * c.Ap_cable_m2), 0);
        const avg_ecc_mid = Ap_total_m2 > 0 ? total_e_mid / Ap_total_m2 : 0;

        const prestress_checks = {
            P_i: P_total_i_mid,
            P_total_i_mid_MN: P_total_i_mid / 1000, // MN para compatibilidade se usado
            P_max_comp_i: solveForPrestressForce(-materials.limits.comp_i, -Ws_m3, moments.M_g1k / 1000, A_m2, avg_ecc_mid, 1.0),
            P_min_tens_i: solveForPrestressForce(materials.limits.tens_i, Wi_m3, moments.M_g1k / 1000, A_m2, avg_ecc_mid, 1.0),
            P_min_comp_s: solveForPrestressForce(-materials.limits.comp_s, -Ws_m3, moments.M_CQP / 1000, A_m2, avg_ecc_mid, Kperdas),
            P_max_tens_s: solveForPrestressForce(materials.limits.tens_s, Wi_m3, moments.M_CF / 1000, A_m2, avg_ecc_mid, Kperdas),
        };

        const prestress_estimation = calculateInitialPrestressEstimate({ moments, materials, props, Kperdas, cables, ecc_mid: avg_ecc_mid, Ap, fptk: inputs.fptk });

        return {
            checks: {
                properties: props,
                materials,
                loads: { pp: inputs.load_pp, perm: inputs.load_perm, var: inputs.load_var, ...loads },
                moments,
                path_details: cables_analysis[0].path_details,
                prestress_checks,
                prestress_estimation,
                loss_results,
                stress_profiles,
                uls_checks,
                cables_analysis,
                avg_ecc_mid
            },
            inputs
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

    function calculateAnchorageSlipDistance(inputs, materials, cable_path_abs, preliminary_key_points) {
        const { beam_length, mu, k, anchorage_slip, fptk } = inputs;
        const { E_p } = materials;
        const sigma_pi = 0.74 * fptk;

        // Ensure points are sorted and include ends and mid
        const calc_points = [...new Set([...preliminary_key_points, 0, beam_length, beam_length / 2])].sort((a, b) => a - b);
        const refined_points = [];
        // Subdivide to ensure good integration resolution
        for (let i = 0; i < calc_points.length - 1; i++) {
            refined_points.push(calc_points[i]);
            const diff = calc_points[i + 1] - calc_points[i];
            if (diff > 1.0) {
                const steps = Math.ceil(diff);
                for (let j = 1; j < steps; j++) refined_points.push(calc_points[i] + j * (diff / steps));
            }
        }
        refined_points.push(calc_points[calc_points.length - 1]);
        const points_to_check = [...new Set(refined_points)].sort((a, b) => a - b);

        // Calculate basic friction profile
        const sigma_p_friction_prelim = points_to_check.map(x => {
            const angle_at_start = getTangentAngleAt(0, cable_path_abs, beam_length);
            const current_angle = getTangentAngleAt(x, cable_path_abs, beam_length);
            const cumulative_alpha = Math.abs(current_angle - angle_at_start);
            const value = sigma_pi * Math.exp(-(mu * cumulative_alpha + k * x));
            return { x, value: isNaN(value) ? sigma_pi : value };
        });

        const delta = anchorage_slip; // mm
        const A_delta_target = E_p * (delta / 1000); // Required Area (MPa * m)
        let integral_sigma_fric = 0;
        let x_a = 0;
        let found = false;
        let extra_drop = 0;

        // CORRECTED ALGORITHM: 
        // Iterate x_i. Assume x_a = x_i.
        // Area_Wedge(x_i) = 2 * [ Integral(0->xi) Sigma(x)dx - xi * Sigma(xi) ]
        // This calculates the area between the friction curve and the horizontal line y = Sigma(xi), multiplied by 2.

        for (let i = 1; i < sigma_p_friction_prelim.length; i++) {
            const p_curr = sigma_p_friction_prelim[i];
            const p_prev = sigma_p_friction_prelim[i - 1];
            const dx = p_curr.x - p_prev.x;
            const avg_sigma = (p_curr.value + p_prev.value) / 2;

            integral_sigma_fric += avg_sigma * dx;

            const area_if_xa_is_curr = 2 * (integral_sigma_fric - p_curr.x * p_curr.value);

            if (area_if_xa_is_curr >= A_delta_target) {
                // Found the segment where x_a lies.
                // Need to find x_a between p_prev.x and p_curr.x
                // Linear interpolation of the 'Area' function is sufficient for small dx
                const area_prev_step = 2 * ((integral_sigma_fric - avg_sigma * dx) - p_prev.x * p_prev.value);

                // Linear interpolation:
                // Target = A_delta_target
                // (x_a - x_prev) / (x_curr - x_prev) = (Target - Area_prev) / (Area_curr - Area_prev)
                const ratio = (A_delta_target - area_prev_step) / (area_if_xa_is_curr - area_prev_step);
                x_a = p_prev.x + ratio * dx;
                found = true;
                break;
            }
        }

        if (!found) {
            x_a = beam_length;
            // If full length isn't enough, we drop the whole curve.
            const last_p = sigma_p_friction_prelim[sigma_p_friction_prelim.length - 1];
            const area_at_L = 2 * (integral_sigma_fric - last_p.x * last_p.value);

            if (beam_length > 0) {
                extra_drop = (A_delta_target - area_at_L) / beam_length;
            }
        }

        x_a = Math.min(Math.max(x_a, 0), beam_length);
        const sigma_pa = interpolate(x_a, sigma_p_friction_prelim.map(p => p.x), sigma_p_friction_prelim.map(p => p.value));

        return { x_a, sigma_pa, A_delta: A_delta_target, delta, extra_drop };
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
                return { x: p.x, value: isNaN(val) ? sigma_pi : val };
            });

            const { x_a, sigma_pa, extra_drop } = cable.x_a_result;
            const drop = extra_drop || 0;

            const sigma_p_anchorage = sigma_p_friction.map(p => ({
                x: p.x,
                // If within influence length, mirror the curve relative to horizontal line at Sigma(x_a)
                // Sigma_anc(x) = Sigma_fric(x_a) - (Sigma_fric(x) - Sigma_fric(x_a)) = 2*Sigma_fric(x_a) - Sigma_fric(x)
                // Subtract extra_drop if needed (for full length slip)
                value: p.x <= x_a ? Math.max(0, (2 * sigma_pa - p.value) - drop) : p.value
            }));

            results_per_cable.push({
                id: cable.id,
                // IMPORTANTE: Propagar a área do cabo para cálculo de forças posteriores
                Ap_cable_m2: cable.Ap_cable_m2,
                path_details: cable.path_details,
                sigma_p_anchorage,
                sigma_p_friction,
                x_a,
                sigma_p_ime: [],
                sigma_p_inf: []
            });
        });

        const num_cables = cables_analysis.length;
        // CORREÇÃO: Fator de encurtamento elástico sequencial
        // Se n=1, fator = 0 (perda zero na pós-tração para 1 cabo). Se n > 1, fator = (n-1)/2n.
        const factor_ee = (num_cables > 0) ? (num_cables - 1) / (2 * num_cables) : 0;

        cables_analysis.forEach((cable, idx) => {
            const current_results = results_per_cable[idx];
            const delta_sigma_ee = cable.path_details.map((p, i) => {
                const M_g1k_x = (load_pp * p.x * (beam_length - p.x)) / 2;
                let sigma_cp_total = 0;
                cables_analysis.forEach((other_c, other_idx) => {
                    if (results_per_cable[other_idx].sigma_p_anchorage[i]) {
                        const other_P = results_per_cable[other_idx].sigma_p_anchorage[i].value * other_c.Ap_cable_m2;
                        const other_e = other_c.path_details[i].e;
                        sigma_cp_total += (other_P / A_m2) + (other_P * other_e * p.e / I_cx_m4);
                    }
                });
                const sigma_cm = -((M_g1k_x / 1000) * p.e) / I_cx_m4;
                const total_sigma_c = sigma_cp_total + sigma_cm;
                const val = alpha_p * total_sigma_c * factor_ee;
                return { x: p.x, value: Math.max(0, val || 0) };
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
                const safe_delta_dif = isNaN(delta_dif) ? 0 : delta_dif;
                sigma_p_inf.push({ x: p_ime.x, value: p_ime.value - safe_delta_dif });
            });
            current_results.sigma_p_inf = sigma_p_inf;
        });

        const combined_sigma_friction = [];
        const combined_sigma_anchorage = [];
        const combined_sigma_ime = [];
        const combined_sigma_inf = [];
        const master_x = cables_analysis[0].path_details.map(p => p.x);

        master_x.forEach((x, i) => {
            let P_fric = 0, P_anc = 0, P_ime = 0, P_inf = 0;
            results_per_cable.forEach((cr, idx) => {
                const ac = cables_analysis[idx].Ap_cable_m2;
                if (cr.sigma_p_friction[i]) P_fric += (cr.sigma_p_friction[i].value || 0) * ac;
                if (cr.sigma_p_anchorage[i]) P_anc += (cr.sigma_p_anchorage[i].value || 0) * ac;
                if (cr.sigma_p_ime[i]) P_ime += (cr.sigma_p_ime[i].value || 0) * ac;
                if (cr.sigma_p_inf[i]) P_inf += (cr.sigma_p_inf[i].value || 0) * ac;
            });
            const safe_div = Ap_total_m2 > 0 ? Ap_total_m2 : 1;
            combined_sigma_friction.push({ x, value: P_fric / safe_div });
            combined_sigma_anchorage.push({ x, value: P_anc / safe_div });
            combined_sigma_ime.push({ x, value: P_ime / safe_div });
            combined_sigma_inf.push({ x, value: P_inf / safe_div });
        });

        return {
            cables: results_per_cable,
            sigma_p_friction: combined_sigma_friction,
            sigma_p_ime: combined_sigma_ime,
            sigma_p_inf: combined_sigma_inf,
            sigma_p_anchorage: combined_sigma_anchorage,
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
            total_P_inf_mid += (sigma_inf || 0) * Ap_i;
        });
        // CORREÇÃO: Altura útil média ponderada
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

    function calculateCompressedArea(vertices, compression_depth_cm, y_max_cm) {
        if (compression_depth_cm <= 0) return 0;
        const y_clip = y_max_cm - compression_depth_cm;
        let compressed_area = 0;
        const points = [...vertices, vertices[0]];
        for (let i = 0; i < vertices.length; i++) {
            let p1 = { x: points[i][0], y: points[i][1] };
            let p2 = { x: points[i + 1][0], y: points[i + 1][1] };
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
            let p2 = { x: points[i + 1][0], y: points[i + 1][1] };
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

function renderExecutiveSummary(checks, inputs) {
    const { uls_checks, prestress_checks, properties, materials, moments } = checks;
    const isUlsOk = uls_checks && uls_checks.ratio <= 1.0;
    const ratioPct = uls_checks && !isNaN(uls_checks.ratio) ? (uls_checks.ratio * 100).toFixed(1) : 'N/A';
    const P0_kN = prestress_checks?.P_i ? Math.round(prestress_checks.P_i) : 0;
    
    // Estimate P_inf from loss_results midspan if available
    let Pinf_kN = 0;
    if (checks.loss_results?.sigma_p_inf && checks.loss_results.sigma_p_inf.length > 0) {
        const midIdx = Math.floor(checks.loss_results.sigma_p_inf.length / 2);
        const avgSigmaInf = checks.loss_results.sigma_p_inf[midIdx]?.value || 0;
        const Ap_total_m2 = (parseFloat(inputs.Ap) * inputs.cables.reduce((s, c) => s + c.num_strands, 0)) / 10000;
        Pinf_kN = Math.round(avgSigmaInf * Ap_total_m2 * 1000);
    }
    if (Pinf_kN === 0 && P0_kN > 0) {
        Pinf_kN = Math.round(P0_kN * 0.82);
    }
    const lossPct = P0_kN > 0 ? (((P0_kN - Pinf_kN) / P0_kN) * 100).toFixed(1) : '0.0';
    
    const total_strands = inputs.cables.reduce((s, c) => s + c.num_strands, 0);
    const Ap_total = (parseFloat(inputs.Ap) * total_strands).toFixed(2);
    
    const sig_i_top = checks.stress_profiles?.initial?.top !== undefined ? Number(checks.stress_profiles.initial.top).toFixed(2) : '0.00';
    const sig_i_bot = checks.stress_profiles?.initial?.bottom !== undefined ? Number(checks.stress_profiles.initial.bottom).toFixed(2) : '0.00';
    const sig_f_top = checks.stress_profiles?.final?.top !== undefined ? Number(checks.stress_profiles.final.top).toFixed(2) : '0.00';
    const sig_f_bot = checks.stress_profiles?.final?.bottom !== undefined ? Number(checks.stress_profiles.final.bottom).toFixed(2) : '0.00';

    const cardUls = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Segurança ELU']),
            h('span', { className: `px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${isUlsOk ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'}` }, [
                isUlsOk ? '✓ APROVADO (OK)' : '⚠ NÃO CONFORME'
            ])
        ]),
        h('div', { className: 'flex items-baseline gap-2 mb-2' }, [
            h('span', { className: 'text-2xl font-black text-gray-900 dark:text-white' }, [`${ratioPct}%`]),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, ['taxa de trabalho flexão'])
        ]),
        h('div', { className: 'w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden mb-3' }, [
            h('div', { className: `h-full rounded-full ${isUlsOk ? 'bg-emerald-500' : 'bg-rose-500'}`, style: { width: `${Math.min(100, Math.max(5, parseFloat(ratioPct) || 0))}%` } })
        ]),
        h('div', { className: 'grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 font-mono' }, [
            h('div', {}, [`MSd: `, h('b', {}, [`${uls_checks?.Md_kNm?.toFixed(1) || 0} kNm`])]),
            h('div', {}, [`MRd: `, h('b', {}, [`${uls_checks?.MRd_kNm?.toFixed(1) || 0} kNm`])]),
            h('div', {}, [`LN x: `, h('b', {}, [`${((uls_checks?.x_m || 0) * 100).toFixed(1)} cm`])]),
            h('div', {}, [`dp: `, h('b', {}, [`${((uls_checks?.d_p || 0) * 100).toFixed(1)} cm`])])
        ])
    ]);

    const cardPrestress = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Força & Perdas']),
            h('span', { className: 'px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30' }, [`-${lossPct}% perdas`])
        ]),
        h('div', { className: 'flex items-baseline gap-2 mb-2' }, [
            h('span', { className: 'text-2xl font-black text-amber-600 dark:text-amber-400' }, [`${Pinf_kN} kN`]),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, ['força efetiva P∞'])
        ]),
        h('div', { className: 'grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 font-mono pt-2 border-t dark:border-gray-700' }, [
            h('div', {}, [`P₀ (Inicial): `, h('b', {}, [`${P0_kN} kN`])]),
            h('div', {}, [`ΔP (Perdas): `, h('b', {}, [`${P0_kN - Pinf_kN} kN`])]),
            h('div', {}, [`Atrito μ: `, h('b', {}, [`${inputs.mu}`])]),
            h('div', {}, [`Acomodação: `, h('b', {}, [`${inputs.anchorage_slip} mm`])])
        ])
    ]);

    const cardStresses = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Tensões Concreto ELS']),
            h('span', { className: 'px-2 py-0.5 rounded text-xs font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30' }, ['Meio do Vão'])
        ]),
        h('div', { className: 'space-y-2 pt-1 text-xs' }, [
            h('div', { className: 'flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg' }, [
                h('span', { className: 'text-gray-500 dark:text-gray-400' }, ['Transferência (t₀):']),
                h('span', { className: 'font-mono font-bold' }, [`Sup: ${sig_i_top} | Inf: ${sig_i_bot} MPa`])
            ]),
            h('div', { className: 'flex justify-between items-center p-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-lg' }, [
                h('span', { className: 'text-gray-500 dark:text-gray-400' }, ['Serviço (t∞):']),
                h('span', { className: 'font-mono font-bold' }, [`Sup: ${sig_f_top} | Inf: ${sig_f_bot} MPa`])
            ])
        ])
    ]);

    const cardSection = h('div', { className: 'bg-white dark:bg-gray-800/95 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden' }, [
        h('div', { className: 'flex items-center justify-between mb-2' }, [
            h('span', { className: 'text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400' }, ['Seção & Cordoalhas']),
            h('span', { className: 'px-2 py-0.5 rounded text-xs font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30' }, [`${total_strands} cordoalhas`])
        ]),
        h('div', { className: 'flex items-baseline gap-2 mb-2' }, [
            h('span', { className: 'text-2xl font-black text-purple-600 dark:text-purple-400' }, [`${Ap_total} cm²`]),
            h('span', { className: 'text-xs text-gray-500 dark:text-gray-400' }, ['área total Ap'])
        ]),
        h('div', { className: 'grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 font-mono pt-2 border-t dark:border-gray-700' }, [
            h('div', {}, [`Ac: `, h('b', {}, [`${properties.area.toFixed(0)} cm²`])]),
            h('div', {}, [`h: `, h('b', {}, [`${properties.height.toFixed(0)} cm`])]),
            h('div', {}, [`ycg: `, h('b', {}, [`${properties.centroid.y.toFixed(1)} cm`])]),
            h('div', {}, [`emid: `, h('b', {}, [`${(checks.avg_ecc_mid * 100).toFixed(1)} cm`])])
        ])
    ]);

    return h('div', { className: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6' }, [
        cardUls, cardPrestress, cardStresses, cardSection
    ]);
}

function renderResults(results) {
    const resultsDiv = document.getElementById('results-container');
    const { checks, inputs, errors } = results;
    if (!checks || errors) {
        resultsDiv.innerHTML = '';
        resultsDiv.appendChild(h('div', { className: 'p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center text-rose-600 dark:text-rose-400 font-bold text-sm' }, [
            `Falha no cálculo: ${errors?.[0] || 'Verifique as coordenadas dos vértices e configuração dos cabos.'}`
        ]));
        return;
    }

    const reportTitle = "Relatório de Verificação da Viga Protendida (NBR 6118)";
    const reportEl = h('div', { id: 'concrete-beam-report', className: 'space-y-6' }, [
        // Executive Summary Cards
        renderExecutiveSummary(checks, inputs),
        // Toolbar
        h('div', { className: 'flex justify-end gap-2 print-hidden' }, [
            h('button', { id: 'copy-report-btn', className: 'bg-blue-600 text-white py-1.5 px-3.5 rounded-xl text-xs font-bold hover:bg-blue-700 transition shadow-sm' }, ['📋 Copiar Relatório']),
            h('button', { id: 'download-word-btn', className: 'bg-indigo-700 text-white py-1.5 px-3.5 rounded-xl text-xs font-bold hover:bg-indigo-800 transition shadow-sm' }, ['📄 Word']),
            h('button', { id: 'download-pdf-btn', className: 'bg-rose-600 text-white py-1.5 px-3.5 rounded-xl text-xs font-bold hover:bg-rose-700 transition shadow-sm' }, ['📑 PDF'])
        ]),
        h('h1', { id: 'main-title', className: 'text-xl font-black text-center border-b pb-3 text-gray-900 dark:text-white' }, [reportTitle]),
        renderInputSummary(inputs, checks),
        renderCalculatedProperties(checks, inputs),
        renderPrestressEstimation(checks),
        renderDetailedLossCalculations(checks.loss_results),
        renderLossesTableAndChart(checks.loss_results),
        renderPrestressChecks(checks),
        renderUlsChecks(checks)
    ]);

    resultsDiv.innerHTML = '';
    resultsDiv.appendChild(reportEl);

    // Re-attach listeners for the toolbar buttons
    document.getElementById('copy-report-btn')?.addEventListener('click', () => handleCopy('concrete-beam-report'));
    document.getElementById('download-word-btn')?.addEventListener('click', () => handleDownloadWord('concrete-beam-report', 'Viga_Protendida.doc'));
    document.getElementById('download-pdf-btn')?.addEventListener('click', () => handleDownloadPdf('concrete-beam-report', 'Viga_Protendida.pdf'));

    drawStressDiagram('stress-diagram-canvas', results.checks);
    drawLossesChart('losses-chart-canvas', checks.loss_results);
}

function renderInputSummary(inputs, checks) {
    const { fck, load_pp, load_perm, load_var, beam_length, cables } = inputs;
    const total_strands = cables.reduce((s, c) => s + c.num_strands, 0);
    const Ap_total = (parseFloat(inputs.Ap) * total_strands).toFixed(2);

    const generalRows = [
        ['Resistência do Concreto (f<sub>ck</sub>)', `${fck} MPa`],
        ['Comprimento da Viga (L)', `${beam_length} m`],
        ['Área Total de Protensão (Ap,total)', `<b>${Ap_total} cm²</b> (${total_strands} cordoalhas)`],
    ];
    const loadRows = [
        ['Peso Próprio (g<sub>pp</sub>)', `${load_pp} kN/m`],
        ['Carga Permanente (g<sub>perm</sub>)', `${load_perm} kN/m`],
        ['Carga Variável (q<sub>var</sub>)', `${load_var} kN/m`]
    ];

    const cablesTable = h('table', { className: 'w-full mt-2 text-sm text-center border' }, [
        h('thead', { className: 'bg-gray-100 dark:bg-gray-700' }, [h('tr', {}, ['Grupo', 'Idade (dias)', 'Cordoalhas'].map(t => h('th', { className: 'p-1' }, [t])))]),
        h('tbody', {}, cables.map((c, i) => h('tr', {}, [
            h('td', {}, [`Cabo ${i + 1}`]),
            h('td', {}, [`${c.age_at_prestress}`]),
            h('td', {}, [`${c.num_strands}`])
        ])))
    ]);

    return createReportSection('input-summary-section', 'Resumo dos Dados de Entrada', [
        h('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' }, [
            createSummaryTable('Parâmetros Gerais e Materiais', generalRows),
            createSummaryTable('Cargas de Serviço (ELS)', loadRows),
        ]),
        h('h4', { className: 'font-bold mt-4 text-sm' }, ['Configuração dos Cabos']),
        cablesTable
    ]);
}

function renderCalculatedProperties(checks, inputs) {
    const { properties, materials, loads, moments } = checks;
    const fmt = (val, dec = 2) => (val !== undefined && val !== null && !isNaN(val)) ? Number(val).toFixed(dec) : 'N/A';

    const geometricRows = [
        ['Área da Seção (A)', `${fmt(properties.area, 2)} cm²`],
        ['Centroide (ycg)', `${fmt(properties.centroid.y, 2)} cm`],
        ['Inércia (I<sub>cx</sub>)', `${fmt(properties.I.cx, 0)} cm⁴`],
        ['Módulo Resist. Inf. (W<sub>i</sub>)', `${fmt(properties.W.i, 0)} cm³`],
        ['Módulo Resist. Sup. (W<sub>s</sub>)', `${fmt(properties.W.s, 0)} cm³`],
        ['Módulo Auxiliar Inf. (k<sub>i</sub>)', `${fmt(properties.ki, 2)} cm`],
        ['Módulo Auxiliar Sup. (k<sub>s</sub>)', `${fmt(properties.ks, 2)} cm`],
        ['Excentricidade Média (Meio Vão)', `${fmt(checks.avg_ecc_mid * 100, 2)} cm`]
    ];
    const materialRows = [
        ['Resist. à Tração Média (f<sub>ct,m</sub>)', `${fmt(materials.fctm, 2)} MPa`],
        ['Resist. à Tração na Flexão (f<sub>ct,f</sub>)', `${fmt(materials.fctf, 2)} MPa`],
        ['Resist. Concreto na Protensão (f<sub>ci</sub>)', `${fmt(materials.fci, 2)} MPa`],
    ];
    const loadComboRows = [
        ['Carga Permanente (g<sub>k</sub>)', `${fmt(loads.g_k, 2)} kN/m`],
        ['Comb. Quase-Permanente (p<sub>qp</sub>)', `${fmt(loads.p_CQP, 2)} kN/m`],
        ['Comb. Frequente (p<sub>freq</sub>)', `${fmt(loads.p_CF, 2)} kN/m`],
    ];
    const momentRows = [
        ['Momento (Peso Próprio)', `${fmt(moments.M_g1k, 1)} kN·m`],
        ['Momento (Quase-Perm.)', `${fmt(moments.M_CQP, 1)} kN·m`],
        ['Momento (Frequente)', `${fmt(moments.M_CF, 1)} kN·m`],
    ];

    return createReportSection('calculated-props-section', 'Propriedades Calculadas e Solicitações', [
        createSummaryTable('Propriedades Geométricas', geometricRows),
        createSummaryTable('Propriedades dos Materiais', materialRows, 'mt-4'),
        createSummaryTable('Combinações de Carga (ELS)', loadComboRows, 'mt-4'),
        createSummaryTable('Momentos Fletore de Serviço (ELS)', momentRows, 'mt-4'),
    ]);
}

function renderPrestressEstimation(checks) {
    const { prestress_estimation } = checks;
    const fmt = (val, dec = 2) => (!isNaN(val)) ? val.toFixed(dec) : 'N/A';

    const rowsData = [
        ['Momento Auxiliar (M<sub>aux</sub>)', `${fmt(prestress_estimation.M_aux_kNm, 1)} kN·m`],
        ['Módulo do Núcleo (k<sub>s</sub>)', `${fmt(prestress_estimation.ks_m, 3)} m`],
        ['Força por Cordoalha (P<sub>cordoalha</sub>)', `${fmt(prestress_estimation.P_cable, 1)} kN`],
        ['Força Total Estimada (P<sub>est,total</sub>)', `${fmt(prestress_estimation.Pest_perdas, 1)} kN`],
        ['Total de Cordoalhas (Estimado)', `<b>${prestress_estimation.total_tendons}</b>`],
    ];

    return createReportSection('prestress-estimation-section', 'Estimativa Inicial de Protensão', [
        h('p', { className: 'text-sm text-gray-500 dark:text-gray-400 mb-2' }, ['Esta é uma estimativa preliminar para auxiliar no dimensionamento inicial.']),
        createSummaryTable('Parâmetros Estimados', rowsData)
    ]);
}

function renderDetailedLossCalculations(loss_results) {
    if (!loss_results || !loss_results.detailed_calcs) return document.createDocumentFragment();
    const { detailed_calcs } = loss_results;

    const createCalcLine = (text) => h('div', { className: 'font-mono text-xs py-1 border-b border-gray-100 dark:border-gray-700', innerHTML: text });

    const frictionContent = detailed_calcs.friction.map(c => createCalcLine(`x=${c.x.toFixed(1)}m: σ<sub>p</sub> = <b>${c.value.toFixed(1)} MPa</b>`));

    const anchorRows = detailed_calcs.anchorage.sigma_prime.map(c => createCalcLine(`x=${c.x.toFixed(1)}m: σ'<sub>p</sub> = <b>${c.value.toFixed(1)} MPa</b>`));

    const elasticContent = detailed_calcs.elastic_shortening.map(c => createCalcLine(`x=${c.x.toFixed(1)}m: Δσ<sub>ee</sub> = <b>${c.value.toFixed(1)} MPa</b>`));

    const timeDependentContent = detailed_calcs.interaction.map(c => createCalcLine(`x=${c.x.toFixed(1)}m: Δσ<sub>dif</sub> = <b>${c.value.toFixed(1)} MPa</b> <span class="text-gray-400 ml-2">${c.calc}</span>`));

    return createReportSection('detailed-losses-section', 'Memória de Cálculo das Perdas de Protensão (Média Ponderada)', [
        h('h4', { className: 'font-bold mt-2 text-sm' }, ['1. Perdas Imediatas']),
        h('h5', { className: 'text-xs font-bold mt-2' }, ['5.1 Perda por Atrito (σp)']),
        h('div', { className: 'max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded' }, frictionContent),

        h('h5', { className: 'text-xs font-bold mt-2' }, ['5.2 Perda por Acomodação da Ancoragem (σ\'p)']),
        createCalcLine(`Distância de Acomodação Média (x<sub>a</sub>) = <b>${detailed_calcs.anchorage.x_a.toFixed(2)} m</b>`),
        h('div', { className: 'max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded' }, anchorRows),

        h('h5', { className: 'text-xs font-bold mt-2' }, ['5.3 Perda por Encurtamento Elástico (Δσee)']),
        h('div', { className: 'max-h-40 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-2 rounded' }, elasticContent),

        h('h4', { className: 'font-bold mt-4 text-sm' }, ['2. Perdas Diferidas']),
        h('h5', { className: 'text-xs font-bold mt-2' }, ['5.4 - 5.7 Interação (Δσdif)']),
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
    const { prestress_checks } = checks;
    const fmt = (val) => (val !== undefined && val !== null && !isNaN(val)) ? val.toFixed(1) : '-';

    const P_adopt_kN = prestress_checks?.P_total_i_mid_MN ? prestress_checks.P_total_i_mid_MN * 1000 : (prestress_checks?.P_i || 0);
    const P_min_tens_i_val = prestress_checks?.P_min_tens_i?.value ? prestress_checks.P_min_tens_i.value * 1000 : null;
    const P_max_comp_i_val = prestress_checks?.P_max_comp_i?.value ? prestress_checks.P_max_comp_i.value * 1000 : null;

    return createReportSection('prestress-checks-section', 'Verificação da Força (Meio do Vão)', [
        h('p', { className: 'text-center font-bold text-lg mb-2' }, [`Força Total Equivalente (P<sub>i</sub>) = ${fmt(P_adopt_kN)} kN`]),
        h('div', { className: 'grid grid-cols-1 md:grid-cols-2 gap-4' }, [
            h('div', {}, [
                h('h4', { className: 'font-bold text-sm' }, ['Limites de Força']),
                h('p', { className: 'text-sm' }, [`Máx Compressão Inicial: ${P_max_comp_i_val !== null ? fmt(P_max_comp_i_val) + ' kN' : 'N/A'}`]),
                h('p', { className: 'text-sm' }, [`Min Tração Inicial: ${P_min_tens_i_val !== null ? fmt(P_min_tens_i_val) + ' kN' : 'N/A'}`])
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
    if (!uls_checks || uls_checks.ratio === Infinity || isNaN(uls_checks.ratio)) return createReportSection('uls', 'ELU', [h('p', {}, ['Erro no cálculo ELU'])]);

    const is_valid = uls_checks.ratio <= 1.0;
    const colorClass = is_valid ? 'text-green-600' : 'text-red-600';

    const rows = [
        ['M<sub>Sd</sub> (Solicitante)', `${uls_checks.Md_kNm.toFixed(1)} kNm`],
        ['M<sub>Rd</sub> (Resistente)', `${uls_checks.MRd_kNm.toFixed(1)} kNm`],
        ['Linha Neutra (x)', `${(uls_checks.x_m * 100).toFixed(1)} cm`],
        ['Altura Útil (d<sub>p</sub>)', `${(uls_checks.d_p * 100).toFixed(1)} cm`],
        ['Relação M<sub>Sd</sub>/M<sub>Rd</sub>', `<b class="${colorClass}">${uls_checks.ratio.toFixed(3)}</b>`]
    ];

    return createReportSection('uls-checks-section', 'Verificação ELU (Estado Limite Último)', [
        createSummaryTable('Flexão', rows)
    ]);
}

// --- CUSTOM SAVE/LOAD HANDLERS ---

function handleCustomSave() {
    const inputs = inputManager.inputIds.reduce((acc, id) => {
        const el = document.getElementById(id);
        if (el) acc[id] = (el.type === 'number') ? parseFloat(el.value) || 0 : el.value;
        return acc;
    }, {});
    inputs.beam_coords = document.getElementById('beam_coords').value; // Textarea special case
    inputs.cables = inputManager._gatherCables(); // Dynamic data
    saveInputsToFile(inputs, 'viga-protendida-inputs.json', '2.0');
}

function handleCustomLoad(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // 1. Populate Standard Fields
            inputManager.inputIds.forEach(id => {
                if (data[id] !== undefined) document.getElementById(id).value = data[id];
            });
            if (data.beam_coords) document.getElementById('beam_coords').value = data.beam_coords;

            // 2. Rebuild Cables
            if (data.cables && Array.isArray(data.cables)) {
                const container = document.getElementById('cables-list-container');
                container.innerHTML = ''; // Clear existing
                data.cables.forEach(c => addCableGroup('cables-list-container', c));
            }

            // 3. Trigger Draw/Calc
            window.dispatchEvent(new Event('input'));
            document.getElementById('run-check-btn').click(); // Auto-run

        } catch (err) {
            alert("Erro ao carregar arquivo: " + err.message);
        }
    };
    reader.readAsText(file);
}

// --- PRESETS DE VIGAS PROTENDIDAS ---
const prestressedPresets = {
    viga_i_ponte: {
        title: "Viga I (Pontes / OAEs - 20m)",
        beam_length: 20,
        load_pp: 7.5,
        load_perm: 12.0,
        load_var: 16.0,
        fck: 35,
        fptk: 1900,
        Ap: "1.40",
        humidity: 70,
        mu: 0.20,
        k: 0.0020,
        anchorage_slip: 6.0,
        exposed_perimeter: 2.8,
        cement_s_factor: "0.25",
        beam_coords: `0, 100
50, 100
50, 85
34, 85
34, 15
47.5, 15
47.5, 0
2.5, 0
2.5, 15
16, 15
16, 85
0, 85`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.45, type: 'Parabolic' },
                    { x: 10, y: 0.10, type: 'Parabolic' },
                    { x: 20, y: 0.45, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.65, type: 'Parabolic' },
                    { x: 10, y: 0.18, type: 'Parabolic' },
                    { x: 20, y: 0.65, type: 'Straight' }
                ]
            }
        ]
    },
    viga_t_edificio: {
        title: "Viga T (Edifícios / Lajes - 16m)",
        beam_length: 16,
        load_pp: 5.5,
        load_perm: 8.0,
        load_var: 10.0,
        fck: 40,
        fptk: 1900,
        Ap: "1.40",
        humidity: 65,
        mu: 0.20,
        k: 0.0020,
        anchorage_slip: 6.0,
        exposed_perimeter: 2.4,
        cement_s_factor: "0.25",
        beam_coords: `0, 80
100, 80
100, 68
62.5, 68
62.5, 0
37.5, 0
37.5, 68
0, 68`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 10,
                path: [
                    { x: 0, y: 0.40, type: 'Parabolic' },
                    { x: 8, y: 0.10, type: 'Parabolic' },
                    { x: 16, y: 0.40, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 8,
                path: [
                    { x: 0, y: 0.55, type: 'Parabolic' },
                    { x: 8, y: 0.18, type: 'Parabolic' },
                    { x: 16, y: 0.55, type: 'Straight' }
                ]
            }
        ]
    },
    viga_caixao: {
        title: "Viga Caixão (Passarelas - 24m)",
        beam_length: 24,
        load_pp: 14.0,
        load_perm: 15.0,
        load_var: 18.0,
        fck: 45,
        fptk: 1900,
        Ap: "1.40",
        humidity: 70,
        mu: 0.19,
        k: 0.0018,
        anchorage_slip: 6.0,
        exposed_perimeter: 3.8,
        cement_s_factor: "0.20",
        beam_coords: `0, 120
140, 120
140, 100
120, 100
110, 20
100, 0
40, 0
30, 20
20, 100
0, 100`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.55, type: 'Parabolic' },
                    { x: 12, y: 0.12, type: 'Parabolic' },
                    { x: 24, y: 0.55, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 12,
                path: [
                    { x: 0, y: 0.75, type: 'Parabolic' },
                    { x: 12, y: 0.20, type: 'Parabolic' },
                    { x: 24, y: 0.75, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 8,
                path: [
                    { x: 0, y: 0.95, type: 'Parabolic' },
                    { x: 12, y: 0.28, type: 'Parabolic' },
                    { x: 24, y: 0.95, type: 'Straight' }
                ]
            }
        ]
    },
    viga_retangular: {
        title: "Viga Retangular (12m)",
        beam_length: 12,
        load_pp: 4.2,
        load_perm: 6.0,
        load_var: 8.0,
        fck: 35,
        fptk: 1900,
        Ap: "1.40",
        humidity: 70,
        mu: 0.20,
        k: 0.0020,
        anchorage_slip: 6.0,
        exposed_perimeter: 2.0,
        cement_s_factor: "0.25",
        beam_coords: `0, 70
30, 70
30, 0
0, 0`,
        cables: [
            {
                age_at_prestress: 7,
                num_strands: 7,
                path: [
                    { x: 0, y: 0.35, type: 'Parabolic' },
                    { x: 6, y: 0.08, type: 'Parabolic' },
                    { x: 12, y: 0.35, type: 'Straight' }
                ]
            },
            {
                age_at_prestress: 7,
                num_strands: 5,
                path: [
                    { x: 0, y: 0.48, type: 'Parabolic' },
                    { x: 6, y: 0.16, type: 'Parabolic' },
                    { x: 12, y: 0.48, type: 'Straight' }
                ]
            }
        ]
    }
};

window.loadPrestressedPreset = function(presetKey, triggerDraw = true) {
    const preset = prestressedPresets[presetKey];
    if (!preset) return;
    
    // 1. Populate Standard Inputs
    if (preset.beam_length !== undefined) document.getElementById('beam_length').value = preset.beam_length;
    if (preset.load_pp !== undefined) document.getElementById('load_pp').value = preset.load_pp;
    if (preset.load_perm !== undefined) document.getElementById('load_perm').value = preset.load_perm;
    if (preset.load_var !== undefined) document.getElementById('load_var').value = preset.load_var;
    if (preset.fck !== undefined) document.getElementById('fck').value = preset.fck;
    if (preset.fptk !== undefined) document.getElementById('fptk').value = preset.fptk;
    if (preset.Ap !== undefined) document.getElementById('Ap').value = preset.Ap;
    if (preset.humidity !== undefined) document.getElementById('humidity').value = preset.humidity;
    if (preset.mu !== undefined) document.getElementById('mu').value = preset.mu;
    if (preset.k !== undefined) document.getElementById('k').value = preset.k;
    if (preset.anchorage_slip !== undefined) document.getElementById('anchorage_slip').value = preset.anchorage_slip;
    if (preset.exposed_perimeter !== undefined) document.getElementById('exposed_perimeter').value = preset.exposed_perimeter;
    if (preset.cement_s_factor !== undefined) document.getElementById('cement_s_factor').value = preset.cement_s_factor;
    if (preset.beam_coords !== undefined) document.getElementById('beam_coords').value = preset.beam_coords;
    
    // 2. Rebuild Cables
    const container = document.getElementById('cables-list-container');
    if (container) {
        container.innerHTML = '';
        preset.cables.forEach(c => addCableGroup('cables-list-container', c));
    }
    
    // 3. Highlight Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        if (onclickAttr.includes(`'${presetKey}'`)) {
            btn.className = 'preset-btn px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-600 text-white shadow-md shadow-blue-500/30 border border-blue-500 transition-all flex items-center gap-1.5 scale-105';
        } else {
            btn.className = 'preset-btn px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 transition-all flex items-center gap-1.5';
        }
    });
    
    // 4. Trigger Draw
    if (triggerDraw) {
        window.dispatchEvent(new Event('input'));
    }
};

// --- HELPER FUNCTIONS FOR UI ---

const CABLE_THEME_COLORS = [
    { border: 'border-l-amber-500', title: 'text-amber-600 dark:text-amber-400', stroke: '#f59e0b' },
    { border: 'border-l-sky-500', title: 'text-sky-600 dark:text-sky-400', stroke: '#0284c7' },
    { border: 'border-l-emerald-500', title: 'text-emerald-600 dark:text-emerald-400', stroke: '#10b981' },
    { border: 'border-l-purple-500', title: 'text-purple-600 dark:text-purple-400', stroke: '#8b5cf6' }
];

function addCableGroup(containerId, data = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const index = container.children.length + 1;
    const theme = CABLE_THEME_COLORS[(index - 1) % CABLE_THEME_COLORS.length];
    
    const card = document.createElement('div');
    card.className = `cable-group-card border border-gray-200 dark:border-gray-700 ${theme.border} border-l-4 rounded-xl p-3.5 mb-3 bg-white dark:bg-gray-800/90 shadow-sm relative transition-all`;
    card.innerHTML = `
        <div class="flex justify-between items-center mb-2.5 pb-2 border-b border-gray-100 dark:border-gray-700">
            <div class="flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full" style="background: ${theme.stroke};"></span>
                <h3 class="font-bold text-xs ${theme.title} uppercase tracking-wider">Cabo ${index}</h3>
            </div>
            <button type="button" class="remove-group-btn text-rose-500 hover:text-rose-700 dark:text-rose-400 text-[11px] font-bold px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/60 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors">Excluir Cabo</button>
        </div>
        <div class="grid grid-cols-2 gap-2.5 mb-3">
            <div>
                <label class="block text-[11px] font-medium mb-1 text-gray-500 dark:text-gray-400">Idade t₀ (dias)</label>
                <input type="number" class="cable-age w-full p-1.5 text-xs font-mono border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${data ? data.age_at_prestress : 7}">
            </div>
            <div>
                <label class="block text-[11px] font-medium mb-1 text-gray-500 dark:text-gray-400">Nº Cordoalhas</label>
                <input type="number" class="cable-strands w-full p-1.5 text-xs font-mono font-bold border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${data ? data.num_strands : 12}">
            </div>
        </div>
        <div class="cable-points-container space-y-1.5">
            <div class="grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-1.5 text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                <span>X (m)</span><span>Y (m)</span><span>Traçado</span><span></span>
            </div>
        </div>
        <button type="button" class="add-point-btn mt-2.5 text-[11px] font-semibold w-full bg-gray-100 dark:bg-gray-700/70 hover:bg-gray-200 dark:hover:bg-gray-600 py-1.5 rounded-lg text-gray-700 dark:text-gray-200 transition-colors flex items-center justify-center gap-1">
            <span>+</span> Adicionar Ponto ao Cabo ${index}
        </button>
    `;
    const pointsContainer = card.querySelector('.cable-points-container');
    const initialPoints = data ? data.path : [{ x: 0, y: 0.45, type: 'Parabolic' }, { x: 10, y: 0.10, type: 'Parabolic' }, { x: 20, y: 0.45, type: 'Straight' }];
    initialPoints.forEach(p => addPointRow(pointsContainer, p));
    card.querySelector('.add-point-btn').addEventListener('click', () => addPointRow(pointsContainer));
    card.querySelector('.remove-group-btn').addEventListener('click', () => { card.remove(); window.dispatchEvent(new Event('input')); });
    card.querySelectorAll('input').forEach(i => i.addEventListener('input', () => window.dispatchEvent(new Event('input'))));
    container.appendChild(card);
}

function addPointRow(container, point = { x: 0, y: 0.45, type: 'Parabolic' }) {
    const row = document.createElement('div');
    row.className = 'cable-path-row grid grid-cols-[1.1fr_1fr_1.2fr_auto] gap-1.5 items-center';
    row.innerHTML = `
        <input type="number" step="0.5" class="cable-x w-full p-1 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${point.x}">
        <input type="number" step="0.02" class="cable-y w-full p-1 text-xs font-mono border border-gray-200 dark:border-gray-600 rounded dark:bg-gray-700 text-gray-800 dark:text-gray-100" value="${point.y}">
        <select class="cable-type w-full p-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded dark:bg-gray-700 text-gray-800 dark:text-gray-100">
            <option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Paráb.</option>
            <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Reto</option>
        </select>
        <button type="button" class="remove-point text-gray-400 hover:text-rose-500 font-bold px-1.5 text-sm leading-none transition-colors" title="Remover ponto">&times;</button>
    `;
    row.querySelector('.remove-point').addEventListener('click', () => { row.remove(); window.dispatchEvent(new Event('input')); });
    row.querySelectorAll('input, select').forEach(i => i.addEventListener('input', () => window.dispatchEvent(new Event('input'))));
    container.appendChild(row);
}

// --- CAD CANVAS RENDERING: SEÇÃO TRANSVERSAL 2D ---

function drawCrossSectionDiagram(canvasId, inputsOrVertices) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const vertices = Array.isArray(inputsOrVertices) ? inputsOrVertices : (inputsOrVertices?.vertices || []);
    const cables = Array.isArray(inputsOrVertices) ? [] : (inputsOrVertices?.cables || []);
    const beam_length = inputsOrVertices?.beam_length || 20;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 280;
    const h = rect.height || 280;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Background Dark Slate CAD & Precision Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, w, h, true);
        EngCAD.drawGrid(ctx, w, h, { step: 20, majorEvery: 4 });
    } else {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#090d16');
        bgGrad.addColorStop(1, '#0f172a');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
    }
    
    if (!vertices || vertices.length < 3) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Defina ao menos 3 vértices na seção', w / 2, h / 2);
        return;
    }
    
    const props = concreteBeamCalculator.calculateSectionProperties(vertices);
    if (!props) return;
    
    // Update Height badge and Input
    const hBadge = document.getElementById('beam-height-badge');
    if (hBadge) hBadge.textContent = `h = ${props.height.toFixed(0)} cm`;
    const hInput = document.getElementById('beam_height');
    if (hInput && Math.abs(parseFloat(hInput.value) - props.height) > 0.1) {
        hInput.value = props.height.toFixed(0);
    }
    
    // Bounding Box
    const xs = vertices.map(v => v[0]);
    const ys = vertices.map(v => v[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), dx = maxX - minX || 1;
    const minY = Math.min(...ys), maxY = Math.max(...ys), dy = maxY - minY || 1;
    
    const padLeft = 46, padRight = 30, padTop = 32, padBottom = 34;
    const drawW = w - padLeft - padRight;
    const drawH = h - padTop - padBottom;
    const scale = Math.min(drawW / dx, drawH / dy);
    
    const midX_real = (minX + maxX) / 2;
    const midY_real = (minY + maxY) / 2;
    const centerCanvasX = padLeft + drawW / 2;
    const centerCanvasY = padTop + drawH / 2;
    
    const toScrX = (x) => centerCanvasX + (x - midX_real) * scale;
    const toScrY = (y) => centerCanvasY - (y - midY_real) * scale;
    
    // Subtle CAD Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridStepCm = dx > 80 ? 20 : 10;
    const startGridX = Math.floor(minX / gridStepCm) * gridStepCm;
    for (let gx = startGridX; gx <= maxX + gridStepCm; gx += gridStepCm) {
        const sx = toScrX(gx);
        ctx.beginPath();
        ctx.moveTo(sx, padTop - 10);
        ctx.lineTo(sx, h - padBottom + 10);
        ctx.stroke();
    }
    const startGridY = Math.floor(minY / gridStepCm) * gridStepCm;
    for (let gy = startGridY; gy <= maxY + gridStepCm; gy += gridStepCm) {
        const sy = toScrY(gy);
        ctx.beginPath();
        ctx.moveTo(padLeft - 10, sy);
        ctx.lineTo(w - padRight + 10, sy);
        ctx.stroke();
    }
    
    // Concrete Polygon Fill
    ctx.beginPath();
    vertices.forEach((v, i) => {
        const sx = toScrX(v[0]);
        const sy = toScrY(v[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.fill();
    
    // Concrete 45-degree Hatching
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    for (let d = -w - h; d < w + h; d += 12) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d + h, h);
        ctx.stroke();
    }
    ctx.restore();
    
    // Concrete Contour
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Centroid Axes
    const cgX = toScrX(props.centroid.x);
    const cgY = toScrY(props.centroid.y);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1;
    // Horizontal axis
    ctx.beginPath();
    ctx.moveTo(toScrX(minX) - 12, cgY);
    ctx.lineTo(toScrX(maxX) + 12, cgY);
    ctx.stroke();
    // Vertical axis
    ctx.beginPath();
    ctx.moveTo(cgX, toScrY(minY) + 12);
    ctx.lineTo(cgX, toScrY(maxY) - 12);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Centroid marker dot
    ctx.beginPath();
    ctx.arc(cgX, cgY, 3.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.font = 'bold 9px Inter, monospace';
    ctx.fillStyle = '#fda4af';
    ctx.textAlign = 'left';
    ctx.fillText(`CG (${props.centroid.y.toFixed(1)})`, cgX + 6, cgY - 5);
    
    // Midspan Tendon Ducts
    const CABLE_PALETTE = ['#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#8b5cf6'];
    if (cables && cables.length > 0) {
        cables.forEach((c, idx) => {
            const cable_path_abs = c.path.map(p => ({ ...p, y: p.y + minY / 100 }));
            const yMid_m = concreteBeamCalculator.getCablePositionAt(beam_length / 2, cable_path_abs, beam_length);
            const yMid_cm = yMid_m * 100;
            const ductX = cgX;
            const ductY = toScrY(yMid_cm);
            const col = CABLE_PALETTE[idx % CABLE_PALETTE.length];
            const ductR = Math.max(5, 3.8 * scale);
            
            // Outer duct body
            ctx.beginPath();
            ctx.arc(ductX, ductY, ductR, 0, 2 * Math.PI);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.strokeStyle = col;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Core
            ctx.beginPath();
            ctx.arc(ductX, ductY, ductR * 0.45, 0, 2 * Math.PI);
            ctx.fillStyle = col;
            ctx.fill();
            
            // Label
            ctx.font = 'bold 9px Inter, monospace';
            ctx.fillStyle = col;
            ctx.textAlign = 'left';
            ctx.fillText(`C${idx + 1}`, ductX + ductR + 4, ductY + 3);
        });
    }
    
    // Dimension Line: Total Height h (Left)
    const dimX = padLeft - 18;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(dimX, toScrY(minY));
    ctx.lineTo(dimX, toScrY(maxY));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(dimX - 4, toScrY(minY)); ctx.lineTo(dimX + 4, toScrY(minY));
    ctx.moveTo(dimX - 4, toScrY(maxY)); ctx.lineTo(dimX + 4, toScrY(maxY));
    ctx.stroke();
    // Rotated text
    ctx.save();
    ctx.translate(dimX - 7, (toScrY(minY) + toScrY(maxY)) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '10px Inter, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(`h=${props.height.toFixed(0)}cm`, 0, 0);
    ctx.restore();
    
    // Dimension Line: Top Width (Top)
    const dimYTop = padTop - 14;
    ctx.beginPath();
    ctx.moveTo(toScrX(minX), dimYTop);
    ctx.lineTo(toScrX(maxX), dimYTop);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toScrX(minX), dimYTop - 3); ctx.lineTo(toScrX(minX), dimYTop + 3);
    ctx.moveTo(toScrX(maxX), dimYTop - 3); ctx.lineTo(toScrX(maxX), dimYTop + 3);
    ctx.stroke();
    ctx.font = '10px Inter, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(`${dx.toFixed(0)} cm`, (toScrX(minX) + toScrX(maxX)) / 2, dimYTop - 4);
    
    // Update Section Properties Pills Container
    const pillsContainer = document.getElementById('section-props-pills');
    if (pillsContainer) {
        pillsContainer.innerHTML = `
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">ÁREA Ac</span><b class="text-sky-400 font-mono text-[11px]">${props.area.toFixed(0)} cm²</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">ALTURA h</span><b class="text-blue-400 font-mono text-[11px]">${props.height.toFixed(0)} cm</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">CENTROIDE yG</span><b class="text-rose-400 font-mono text-[11px]">${props.centroid.y.toFixed(1)} cm</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">INÉRCIA Ix</span><b class="text-indigo-400 font-mono text-[11px]">${(props.I.cx / 1e4).toFixed(1)}e4 cm⁴</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">Winf</span><b class="text-amber-400 font-mono text-[11px]">${props.W.i.toFixed(0)} cm³</b></div>
            <div class="bg-slate-900/90 border border-slate-800 rounded-lg p-1.5 shadow-sm"><span class="text-gray-400 block text-[9px]">Wsup</span><b class="text-emerald-400 font-mono text-[11px]">${props.W.s.toFixed(0)} cm³</b></div>
        `;
    }

    // Floating CAD HUD Overlay (RS2 Standard)
    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        EngCAD.updateHUD(canvas.parentElement, 'Seção Transversal (Protendida)', [
            { label: 'Altura h', value: `${props.height.toFixed(0)} cm`, color: '#38bdf8' },
            { label: 'Área Ac', value: `${props.area.toFixed(0)} cm²`, color: '#f1f5f9' },
            { label: 'Inércia Ix', value: `${(props.I.cx / 1e4).toFixed(1)}e4 cm⁴`, color: '#f59e0b' }
        ]);
    }
}

// --- CAD CANVAS RENDERING: VISTA LONGITUDINAL PANORÂMICA 2D ---

function drawLongitudinalDiagram(canvasId, inputs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width || 700;
    const h = rect.height || 260;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    
    // Background Dark Engineering & Precision Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, w, h, true);
        EngCAD.drawGrid(ctx, w, h, { step: 24, majorEvery: 4 });
    } else {
        const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#070a12');
        bgGrad.addColorStop(1, '#0c101d');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);
    }
    
    const props = concreteBeamCalculator.calculateSectionProperties(inputs.vertices);
    if (!props) {
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Geometria da seção indisponível', w / 2, h / 2);
        return;
    }
    
    const L = inputs.beam_length || 20;
    const yMin = props.y_min / 100;
    const yMax = props.y_max / 100;
    const hBeam = yMax - yMin;
    
    const padX = 70;
    const padTop = 38;
    const padBottom = 54;
    const drawW = w - 2 * padX;
    const drawH = h - padTop - padBottom;
    
    const scaleX = drawW / L;
    const scaleY = Math.min(drawH / (hBeam * 1.6), scaleX * 6.5);
    
    const midY_m = (yMin + yMax) / 2;
    const toScrX = (x) => padX + x * scaleX;
    const toScrY = (y_m) => padTop + drawH / 2 - (y_m - midY_m) * scaleY;
    
    // Concrete Beam Elevation Body
    const bX0 = toScrX(0);
    const bX1 = toScrX(L);
    const bYtop = toScrY(yMax);
    const bYbot = toScrY(yMin);
    const bW = bX1 - bX0;
    const bH = bYbot - bYtop;
    
    // Concrete fill
    ctx.fillStyle = 'rgba(30, 41, 59, 0.65)';
    ctx.fillRect(bX0, bYtop, bW, bH);
    
    // Subtle concrete texture hatching
    ctx.save();
    ctx.beginPath();
    ctx.rect(bX0, bYtop, bW, bH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.lineWidth = 1;
    for (let px = bX0 - bH; px < bX1 + bH; px += 24) {
        ctx.beginPath();
        ctx.moveTo(px, bYtop);
        ctx.lineTo(px + bH, bYbot);
        ctx.stroke();
    }
    ctx.restore();
    
    // Beam border
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(bX0, bYtop, bW, bH);
    
    // Centroid axis (dashed)
    const yG_m = props.centroid.y / 100;
    const scrYG = toScrY(yG_m);
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)';
    ctx.beginPath();
    ctx.moveTo(bX0, scrYG);
    ctx.lineTo(bX1, scrYG);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Structural Supports
    // Left Support (Pinned)
    const supSize = 14;
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(bX0, bYbot);
    ctx.lineTo(bX0 - supSize, bYbot + supSize * 1.3);
    ctx.lineTo(bX0 + supSize, bYbot + supSize * 1.3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Pin circle
    ctx.beginPath();
    ctx.arc(bX0, bYbot, 2.5, 0, 2 * Math.PI);
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    // Ground hatch left
    ctx.beginPath();
    ctx.moveTo(bX0 - supSize - 4, bYbot + supSize * 1.3);
    ctx.lineTo(bX0 + supSize + 4, bYbot + supSize * 1.3);
    ctx.stroke();
    for (let hx = -supSize - 2; hx <= supSize + 2; hx += 5) {
        ctx.beginPath();
        ctx.moveTo(bX0 + hx, bYbot + supSize * 1.3);
        ctx.lineTo(bX0 + hx - 4, bYbot + supSize * 1.3 + 5);
        ctx.stroke();
    }
    
    // Right Support (Roller)
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(bX1, bYbot);
    ctx.lineTo(bX1 - supSize, bYbot + supSize);
    ctx.lineTo(bX1 + supSize, bYbot + supSize);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // Roller circles
    ctx.beginPath();
    ctx.arc(bX1 - supSize / 2, bYbot + supSize + 3, 3, 0, 2 * Math.PI);
    ctx.arc(bX1 + supSize / 2, bYbot + supSize + 3, 3, 0, 2 * Math.PI);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();
    ctx.stroke();
    // Ground plate right
    const rollerBaseY = bYbot + supSize + 6;
    ctx.beginPath();
    ctx.moveTo(bX1 - supSize - 4, rollerBaseY);
    ctx.lineTo(bX1 + supSize + 4, rollerBaseY);
    ctx.stroke();
    for (let hx = -supSize - 2; hx <= supSize + 2; hx += 5) {
        ctx.beginPath();
        ctx.moveTo(bX1 + hx, rollerBaseY);
        ctx.lineTo(bX1 + hx - 4, rollerBaseY + 5);
        ctx.stroke();
    }
    
    // Parabolic Cables Profile
    const CABLE_PALETTE = ['#f59e0b', '#06b6d4', '#10b981', '#ec4899', '#8b5cf6'];
    const legendItems = [];
    
    inputs.cables.forEach((cable, idx) => {
        const col = CABLE_PALETTE[idx % CABLE_PALETTE.length];
        const cable_path_abs = cable.path.map(p => ({ ...p, y: p.y + yMin }));
        
        ctx.beginPath();
        const steps = 120;
        for (let s = 0; s <= steps; s++) {
            const x = (s / steps) * L;
            const y_m = concreteBeamCalculator.getCablePositionAt(x, cable_path_abs, L);
            const sx = toScrX(x);
            const sy = toScrY(y_m);
            if (s === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = col;
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
        
        // Anchorage plates at left (x=0) and right (x=L)
        const yStart_m = concreteBeamCalculator.getCablePositionAt(0, cable_path_abs, L);
        const yEnd_m = concreteBeamCalculator.getCablePositionAt(L, cable_path_abs, L);
        const syStart = toScrY(yStart_m);
        const syEnd = toScrY(yEnd_m);
        
        // Steel Anchor Plate Left
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(bX0 - 4, syStart - 5, 4, 10);
        ctx.strokeStyle = col;
        ctx.strokeRect(bX0 - 4, syStart - 5, 4, 10);
        
        // Steel Anchor Plate Right
        ctx.fillRect(bX1, syEnd - 5, 4, 10);
        ctx.strokeRect(bX1, syEnd - 5, 4, 10);
        
        // Prestress Force Vectors P0
        const arrowLen = 22;
        // Left arrow pointing into beam
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(bX0 - arrowLen, syStart);
        ctx.lineTo(bX0 - 5, syStart);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bX0 - 5, syStart);
        ctx.lineTo(bX0 - 9, syStart - 3);
        ctx.lineTo(bX0 - 9, syStart + 3);
        ctx.closePath();
        ctx.fill();
        
        // Right arrow pointing into beam
        ctx.beginPath();
        ctx.moveTo(bX1 + arrowLen, syEnd);
        ctx.lineTo(bX1 + 5, syEnd);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bX1 + 5, syEnd);
        ctx.lineTo(bX1 + 9, syEnd - 3);
        ctx.lineTo(bX1 + 9, syEnd + 3);
        ctx.closePath();
        ctx.fill();
        
        // Midspan control node
        const yMid_m = concreteBeamCalculator.getCablePositionAt(L / 2, cable_path_abs, L);
        const sxMid = toScrX(L / 2);
        const syMid = toScrY(yMid_m);
        
        ctx.beginPath();
        ctx.arc(sxMid, syMid, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        
        legendItems.push(`
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border shadow-sm" style="color: ${col}; border-color: ${col}44; background: ${col}15;">
                <span class="w-2 h-2 rounded-full" style="background: ${col}"></span>
                Cabo ${idx + 1} (${cable.num_strands} cord. - t₀=${cable.age_at_prestress}d)
            </span>
        `);
    });
    
    // Labels P0
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'right';
    ctx.fillText('P₀', bX0 - 24, bYtop + bH / 2 + 3);
    ctx.textAlign = 'left';
    ctx.fillText('P₀', bX1 + 24, bYtop + bH / 2 + 3);
    
    // Span Dimension Line (Bottom)
    const dimY = bYbot + supSize + 18;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bX0, dimY);
    ctx.lineTo(bX1, dimY);
    ctx.stroke();
    // Dimension ticks
    ctx.beginPath();
    ctx.moveTo(bX0, dimY - 4); ctx.lineTo(bX0, dimY + 4);
    ctx.moveTo(bX1, dimY - 4); ctx.lineTo(bX1, dimY + 4);
    ctx.stroke();
    ctx.font = 'bold 11px Inter, monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText(`Vão L = ${L.toFixed(1)} m`, (bX0 + bX1) / 2, dimY + 14);
    
    // Update Longitudinal Cables Legend Container
    const legendContainer = document.getElementById('longitudinal-cables-legend');
    if (legendContainer) {
        legendContainer.innerHTML = legendItems.join('');
    }

    // Floating CAD HUD Overlay (RS2 Standard)
    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        const nCables = inputs.cables ? inputs.cables.length : 0;
        EngCAD.updateHUD(canvas.parentElement, 'Traçado dos Cabos (Longitudinal)', [
            { label: 'Vão L', value: `${L} m`, color: '#38bdf8' },
            { label: 'Total de Cabos', value: `${nCables} cabos`, color: '#f1f5f9' },
            { label: 'Altura h', value: `${(hBeam * 100).toFixed(0)} cm`, color: '#f59e0b' }
        ]);
    }
}

function drawLossesChart(canvasId, loss_data) {
    const chartCanvas = document.getElementById(canvasId);
    if (!chartCanvas || !loss_data) return;
    let existingChart = Chart.getChart(chartCanvas);
    if (existingChart) existingChart.destroy();
    const datasets = [
        { label: 'Inicial (Média)', data: loss_data.sigma_p_ime.map(p => ({ x: p.x, y: p.value })), borderColor: '#3b82f6', pointRadius: 0 },
        { label: 'Final (Média)', data: loss_data.sigma_p_inf.map(p => ({ x: p.x, y: p.value })), borderColor: '#ef4444', borderWidth: 2, pointRadius: 0 }
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
    new Chart(chartCanvas, { type: 'scatter', data: { datasets }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Tensão (MPa)' } } } } });
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {

    if (typeof initializeSharedUI === 'function') initializeSharedUI();

    // Initialize with default preset (viga_i_ponte)
    if (typeof window.loadPrestressedPreset === 'function') {
        window.loadPrestressedPreset('viga_i_ponte', false);
    } else {
        addCableGroup('cables-list-container');
    }

    document.getElementById('add-cable-group-btn').addEventListener('click', () => addCableGroup('cables-list-container'));

    // Save/Load Listeners
    document.getElementById('save-inputs-btn').addEventListener('click', handleCustomSave);
    document.getElementById('load-inputs-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', handleCustomLoad);

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
        drawCrossSectionDiagram('cross-section-canvas', inputs);
        drawLongitudinalDiagram('longitudinal-canvas', inputs);
    }, 150);

    window.addEventListener('input', drawAll);
    window.addEventListener('resize', debounce(drawAll, 200));

    document.getElementById('run-check-btn').addEventListener('click', async () => {
        const inputs = gatherAllInputs();
        let res;
        try {
             if (window.eel && window.eel.calculate_prestressed_beam_check) {
                 res = await window.eel.calculate_prestressed_beam_check(inputs)();
                 if(res.errors && res.errors.length > 0) {
                     alert("Erro no cálculo: " + res.errors.join("\n"));
                     return;
                 }
             } else {
                 console.warn("Backend not available, using local.");
                 res = concreteBeamCalculator.run(inputs);
             }
        } catch(e) {
            console.error("Backend failed, using local fallback", e);
             res = concreteBeamCalculator.run(inputs);
        }
        renderResults(res);
    });

    drawAll();
});