/**
 * @file viga_protendida.js
 * @description NBR 6118 Prestressed Concrete Beam Checker with Prestressing Loss Calculations.
 * Translates the logic from the provided Jupyter Notebook into a web application.
 */

const concreteBeamCalculator = (() => {
    /**
     * Calculates the complete geometric properties of a non-self-intersecting polygon.
 * @param {Array<[number, number]>} vertices - An array of [x, y] coordinates in cm.
     * @returns {object|null} A dictionary containing the calculated properties or null if invalid.
     */
    function calculateSectionProperties(vertices) {
        if (!vertices || vertices.length < 3) return null;

        const points = [...vertices, vertices[0]]; // Close the polygon
        let A = 0.0, Qx = 0.0, Qy = 0.0, Ix = 0.0, Iy = 0.0;

        for (let i = 0; i < vertices.length; i++) {
            const [x0, y0] = points[i]; 
            const [x1, y1] = points[i+1];
            const term = (x0 * y1) - (x1 * y0);
            A += term;
            Qx += (x0 + x1) * term;
            Qy += (y0 + y1) * term;
            Ix += (y0 ** 2 + y0 * y1 + y1 ** 2) * term;
            Iy += (x0 ** 2 + x0 * x1 + x1 ** 2) * term;
        }

        A /= 2.0;
        if (Math.abs(A) < 1e-6) return null; // Relaxed threshold

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
            Q: { x: Math.abs(Qx / 6), y: Math.abs(Qy / 6) }, // Adjusted for absolute as per notebook convention
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
     * Linear interpolation between two points.
     * @param {number} x_pos - The x position to interpolate at.
     * @param {Array<number>} xs - The x coordinates [x1, x2].
     * @param {Array<number>} ys - The y coordinates [y1, y2].
     * @returns {number} The interpolated y value.
     */
    function interpolate(x_pos, xs, ys) {
        const [x0, x1] = xs;
        const [y0, y1] = ys;
        if (Math.abs(x1 - x0) < 1e-6) return y0;
        const t = (x_pos - x0) / (x1 - x0);
        return y0 + t * (y1 - y0);
    }

    /**
     * Calculates prestressing losses per NBR 6118 Section 17.3.
     * @param {object} inputs - User inputs including Ap (tendon area in m²).
     * @param {object} props - Section properties.
     * @param {number} P_i - Initial prestressing force (MN).
     * @param {number} ecc_mid - Eccentricity at mid-span (m).
     * @param {number} M_pp - Self-weight moment (MN·m).
     * @returns {object} Loss components and effective force.
     */
    function calculatePrestressLosses(inputs, props, P_i, ecc_mid, M_pp) {
        const { fck, beam_length, Ap = 0.001 } = inputs; // Default Ap = 0.001 m²
        const { area, I } = props;
        const A_m2 = area / 1e4; // Convert cm² to m²
        const I_cx_m4 = I.cx / 1e8; // Convert cm⁴ to m⁴

        // Material properties
        const E_p = 195000; // MPa (NBR 6118, 8.3)
        const E_c = 5600 * Math.sqrt(fck); // MPa (NBR 6118, 8.2.10)

        // 1. Elastic Shortening
        const sigma_c_p = (P_i / A_m2) + (P_i * ecc_mid * ecc_mid / I_cx_m4) - (M_pp * ecc_mid / I_cx_m4);
        const delta_sigma_es = (sigma_c_p * E_p) / E_c;
        const delta_P_es = Ap * delta_sigma_es / 1000; // Convert to MN

        // 2. Anchorage Slip
        const delta_l = 0.004; // 4 mm
        const delta_sigma_as = (delta_l * E_p) / beam_length;
        const delta_P_as = Ap * delta_sigma_as / 1000;

        // 3. Friction Loss (assume parabolic tendon, evaluate at mid-span)
        const mu = 0.2;
        const k = 0.01; // m⁻¹
        const L_half = beam_length / 2;
        // Approximate theta for parabolic segment (simplified)
        const delta_y = Math.abs(inputs.cable_path[1].y - inputs.cable_path[0].y);
        const theta = 4 * delta_y / beam_length; // Approximate angle
        const P_x = P_i * Math.exp(-mu * (theta + k * L_half));
        const delta_P_f = P_i - P_x;

        // 4. Creep Loss
        const phi = 2.0; // Creep coefficient
        const delta_sigma_cr = phi * sigma_c_p * (E_p / E_c);
        const delta_P_cr = Ap * delta_sigma_cr / 1000;

        // 5. Shrinkage Loss
        const epsilon_sh = 0.0003;
        const delta_sigma_sh = epsilon_sh * E_p;
        const delta_P_sh = Ap * delta_sigma_sh / 1000;

        // 6. Relaxation Loss
        const sigma_p0 = P_i / Ap; // MPa
        const psi = 0.025; // 2.5%
        const delta_sigma_r = sigma_p0 * psi;
        const delta_P_r = Ap * delta_sigma_r / 1000;

        // Total Loss
        const delta_P_total = delta_P_es + delta_P_as + delta_P_f + delta_P_cr + delta_P_sh + delta_P_r;
        const P_eff = Math.max(P_i - delta_P_total, 0); // Ensure non-negative

        return {
            elastic_shortening: { formula: "(σ_c,p * E_p / E_c) * A_p", calc: `(${sigma_c_p.toFixed(2)} * ${E_p} / ${E_c.toFixed(0)}) * ${Ap}`, value: delta_P_es },
            anchorage_slip: { formula: "(Δl * E_p / L) * A_p", calc: `(0.004 * ${E_p} / ${beam_length}) * ${Ap}`, value: delta_P_as },
            friction: { formula: "P_i * (1 - e^(-μ * (θ + k * x)))", calc: `${P_i.toFixed(2)} * (1 - e^(-${mu} * (${theta.toFixed(2)} + ${k} * ${L_half})))`, value: delta_P_f },
            creep: { formula: "φ * σ_c,p * (E_p / E_c) * A_p", calc: `${phi} * ${sigma_c_p.toFixed(2)} * (${E_p} / ${E_c.toFixed(0)}) * ${Ap}`, value: delta_P_cr },
            shrinkage: { formula: "ε_sh * E_p * A_p", calc: `${epsilon_sh} * ${E_p} * ${Ap}`, value: delta_P_sh },
            relaxation: { formula: "σ_p0 * ψ * A_p", calc: `(${sigma_p0.toFixed(0)} * ${psi}) * ${Ap}`, value: delta_P_r },
            total_loss: delta_P_total,
            P_eff: P_eff
        };
    }

    /**
     * Main calculation function.
     * @param {object} inputs - The gathered user inputs including Ap (tendon area in m²).
     * @returns {object} The results of the calculation.
     */
    function run(inputs) {
        const { vertices, fck, load_pp, load_perm, load_var, beam_length, cable_path, Ap } = inputs;

        // Validate inputs
        if (!vertices || vertices.length < 3 || fck <= 0 || load_pp < 0 || load_perm < 0 || load_var < 0 || beam_length <= 0 || !Ap || Ap <= 0) {
            return { errors: ["Invalid inputs. Ensure all values are positive and vertices are sufficient."] };
        }

        // --- 1. Section Properties ---
        const props = calculateSectionProperties(vertices);
        if (!props) {
            return { errors: ["Invalid beam cross-section vertices. Ensure the polygon is valid and does not self-intersect."] };
        }

        // Convert properties from cm to m
        const A_m2 = props.area / 1e4;
        const Wi_m3 = props.W.i / 1e6;
        const Ws_m3 = props.W.s / 1e6;
        const I_cx_m4 = props.I.cx / 1e8;

        // --- 2. Material Properties (NBR 6118) with detailed breakdown ---
        // CORRECTED: Use correct formula for fck > 50 MPa
        let fctm_val, fctm_formula, fctm_calc;
        if (fck <= 50) {
            fctm_val = 0.3 * fck ** (2 / 3);
            fctm_formula = "0.3 * fck^(2/3)"; fctm_calc = `0.3 * ${fck}^(2/3)`;
        } else {
            fctm_val = 2.12 * Math.log(1 + 0.11 * fck);
            fctm_formula = "2.12 * ln(1 + 0.11*fck)"; fctm_calc = `2.12 * ln(1 + 0.11*${fck})`;
        }
        const fctk_inf_val = 0.7 * fctm_val;
        const fctf_val = 1.2 * fctk_inf_val;
        const fci = 0.8 * fck; // Assumed, consider adding input
        const materials = {
            fctm: { formula: fck <= 50 ? "0.3 * fck^(2/3)" : "2.12 * ln(1 + 0.1 * fck)", calc: fck <= 50 ? `0.3 * ${fck}^(2/3)` : `2.12 * ln(1 + 0.1 * ${fck})`, value: fctm_val },
            fctk_inf: { formula: "0.7 * fctm", calc: `0.7 * ${fctm_val.toFixed(2)}`, value: fctk_inf_val },
            fctf: { formula: "1.2 * fctk_inf", calc: `1.2 * ${fctk_inf_val.toFixed(2)}`, value: fctf_val },
            fci: { formula: "0.8 * fck", calc: `0.8 * ${fck}`, value: fci }
        };

        // --- 3. Load Combinations with detailed breakdown ---
        const comb_freq_val = load_pp + load_perm + 0.6 * load_var;
        const comb_qperm_val = load_pp + load_perm + 0.4 * load_var;
        const combinations = {
            freq: { formula: "g_pp + g_perm + 0.6*q_var", calc: `${load_pp} + ${load_perm} + 0.6*${load_var}`, value: comb_freq_val },
            qperm: { formula: "g_pp + g_perm + 0.4*q_var", calc: `${load_pp} + ${load_perm} + 0.4*${load_var}`, value: comb_qperm_val }
        };

        // --- 4. Bending Moments (kN.m) with detailed breakdown ---
        const M_freq_val = (comb_freq_val * beam_length ** 2) / 8;
        const M_qperm_val = (comb_qperm_val * beam_length ** 2) / 8;
        const M_pp = (load_pp * beam_length ** 2) / 8 / 1000; // Self-weight moment in MN·m
        const moments = {
            freq: { formula: "(q_freq * L²) / 8", calc: `(${comb_freq_val.toFixed(2)} * ${beam_length}²) / 8`, value: M_freq_val },
            qperm: { formula: "(q_qperm * L²) / 8", calc: `(${comb_qperm_val.toFixed(2)} * ${beam_length}²) / 8`, value: M_qperm_val },
            pp: { formula: "(q_pp * L²) / 8", calc: `(${load_pp.toFixed(2)} * ${beam_length}²) / 8`, value: M_pp * 1000 }
        };

        // --- 5. Stresses (MPa = MN/m^2) with detailed breakdown ---
        const sigma_inf_freq_val = M_freq_val / 1000 / Wi_m3; // Corrected: Positive moment causes tension (+) on bottom fiber
        const sigma_sup_qperm_val = -M_qperm_val / 1000 / Ws_m3;
        const stresses = {
            inf_freq: { formula: "+M_freq / W_i", calc: `+${M_freq_val.toFixed(2)} / ${Wi_m3.toFixed(4)}`, value: sigma_inf_freq_val },
            sup_qperm: { formula: "-M_qperm / W_s", calc: `-${M_qperm_val.toFixed(2)} / ${Ws_m3.toFixed(4)}`, value: sigma_sup_qperm_val }
        };

        // --- 6. Eccentricity at Mid-Span ---
        const ecc_mid = getEccentricityAt(beam_length / 2, cable_path);

        // --- 7. Initial Prestressing Force Limits (NBR 6118, Sec 17.2.4.3) ---
        // Initial Compression (Top Fiber)
        const P_max_comp_i_val = (-0.7 * fci - M_pp / Ws_m3) / ((-1 / A_m2) + ecc_mid / Ws_m3);
        // Initial Tension (Bottom Fiber)
        const P_max_tens_i_val = (materials.fctk_inf.value - M_pp / Wi_m3) / ((-1 / A_m2) - ecc_mid / Wi_m3);

        // Initial Prestressing Force (use average for loss calculations)
        const P_max = Math.min(P_max_comp_i_val, P_max_tens_i_val);
        const P_min_initial = Math.max(0, Math.min(P_max_comp_i_val, P_max_tens_i_val)); // Ensure non-negative
        const P_i = (P_max + P_min_initial) / 2; // Initial estimate

        // --- 8. Prestressing Losses ---
        const losses = calculatePrestressLosses(inputs, props, P_i, ecc_mid, M_pp);
        const P_eff = losses.P_eff;

        // --- 9. Service Prestressing Force Limits (using P_eff) ---
        // CORRECTED: Calculate the required EFFECTIVE force (P_eff) first, then find the required INITIAL force (P_i).
        const P_eff_min_comp_s = (-0.6 * fck - (moments.qperm.value / 1000) / Ws_m3) / ((-1 / A_m2) + ecc_mid / Ws_m3);
        const P_eff_min_tens_s = (materials.fctf.value - (moments.freq.value / 1000) / Wi_m3) / ((-1 / A_m2) - ecc_mid / Wi_m3);

        // --- 10. Stress Profiles for Visualization ---
        const stress_profiles = {
            initial: {
                top: (-P_i / A_m2) + (P_i * ecc_mid / Ws_m3) - (M_pp / Ws_m3),
                bottom: (-P_i / A_m2) - (P_i * ecc_mid / Wi_m3) + (M_pp / Wi_m3)
            },
            final: {
                top: (-P_eff / A_m2) + (P_eff * ecc_mid / Ws_m3) - (moments.qperm.value / 1000 / Ws_m3),
                bottom: (-P_eff / A_m2) - (P_eff * ecc_mid / Wi_m3) + (moments.freq.value / 1000 / Wi_m3)
            }
        };

        const prestress = {
            P_max_comp_i: {
                formula: "P ≤ (-0.7*fci - M_pp/Ws) / (-1/A + e/Ws)",
                calc: `(-0.7*${fci.toFixed(2)} - ${M_pp.toFixed(4)}/${Ws_m3.toFixed(4)}) / (-1/${A_m2.toFixed(4)} + ${ecc_mid.toFixed(3)}/${Ws_m3.toFixed(4)})`,
                value: P_max_comp_i_val
            },
            P_max_tens_i: {
                formula: "P ≤ (fctk_inf - M_pp/Wi) / (-1/A - e/Wi)",
                calc: `(${materials.fctk_inf.value.toFixed(2)} - ${M_pp.toFixed(4)}/${Wi_m3.toFixed(4)}) / (-1/${A_m2.toFixed(4)} - ${ecc_mid.toFixed(3)}/${Wi_m3.toFixed(4)})`,
                value: P_max_tens_i_val
            },
            P_min_comp_s: {
                formula: "P_i ≥ [(-0.6*fck - M_qp/Ws) / (-1/A + e/Ws)] / (1 - losses)",
                calc: `(-0.6*${fck} - ${moments.qperm.value.toFixed(2)}/1000/${Ws_m3.toFixed(4)}) / (-1/${A_m2.toFixed(4)} + ${ecc_mid.toFixed(3)}/${Ws_m3.toFixed(4)})`,
                value: P_eff_min_comp_s
            },
            P_min_tens_s: {
                formula: "P_i ≥ [(fctf - M_freq/Wi) / (-1/A - e/Wi)] / (1 - losses)",
                calc: `(${materials.fctf.value.toFixed(2)} - ${moments.freq.value.toFixed(2)}/1000/${Wi_m3.toFixed(4)}) / (-1/${A_m2.toFixed(4)} - ${ecc_mid.toFixed(3)}/${Wi_m3.toFixed(4)})`,
                value: P_eff_min_tens_s
            },
            P_i: P_i,
            losses: losses
        };

        const results = {
            properties: props,
            materials,
            loads: { pp: load_pp, perm: load_perm, var: load_var },
            combinations,
            moments,
            stresses,
            prestress,
            stress_profiles
        };

        return { checks: results, inputs };
    }

    /*
     * Calculates the eccentricity 'y' at a given position 'x' along the beam,
     * based on the defined cable path segments.
     * @param {number} x_pos - The position along the beam length.
     * @param {Array<object>} cable_path - The array of cable path points.
     * @returns {number} The calculated eccentricity at x_pos.
     */
    function getEccentricityAt(x_pos, cable_path) {
        if (!cable_path || cable_path.length < 2) return 0;

        // Validate cable path spans beam
        const x_min_path = Math.min(...cable_path.map(p => p.x));
        const x_max_path = Math.max(...cable_path.map(p => p.x));
        if (x_pos < x_min_path || x_pos > x_max_path) {
            throw new Error("Cable path does not cover the requested position.");
        }

        for (let i = 0; i < cable_path.length - 1; i++) {
            const p1 = cable_path[i];
            const p2 = cable_path[i + 1];
            const x_min = Math.min(p1.x, p2.x);
            const x_max = Math.max(p1.x, p2.x);

            if (x_pos >= x_min && x_pos <= x_max) {
                if (p1.type === 'Parabolic') {
                    // CORRECTED: The vertex is the point with the more extreme y-value (max absolute value, considering sign).
                    // This handles both upward and downward parabolas.
                    let vertex = Math.abs(p1.y) >= Math.abs(p2.y) ? p1 : p2;
                    let form_start = p1.y <= p2.y ? p2 : p1;
                    const parabola = solveParabolaWithVertex([form_start.x, form_start.y], [vertex.x, vertex.y]);
                    if (parabola) {
                        return parabola.a * Math.pow(x_pos - vertex.x, 2) + vertex.y;
                    }
 else {
                        return interpolate(x_pos, [p1.x, p2.x], [p1.y, p2.y]);
                    }
                } else {
                    return interpolate(x_pos, [p1.x, p2.x], [p1.y, p2.y]);
                }
            }
        }
        return cable_path[cable_path.length - 1].y;
    }

    return { run, calculateSectionProperties, solveParabolaWithVertex, getEccentricityAt };
})();

/**
 * --- UI and Drawing Functions ---
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- Helper functions for rendering results ---

    function renderInputSummary(inputs) {
        const { fck, load_pp, load_perm, load_var, beam_length, beam_height, Ap } = inputs;
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
                        <tr><td>Beam Height (h)</td><td>${beam_height} cm</td></tr>
                        <tr><td>Tendon Area (A<sub>p</sub>)</td><td>${(Ap * 1e4).toFixed(2)} cm²</td></tr>
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
        const { properties, materials, combinations, moments, stresses } = checks;
        const fmt = (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A';

        const rows = [
            `<tr><td>Área da Seção (A)</td><td>Geometric</td><td>${fmt(properties.area, 2)} cm²</td></tr>`,
            `<tr><td>Centroide (y<sub>cg</sub>)</td><td>Geometric</td><td>${fmt(properties.centroid.y, 2)} cm</td></tr>`,
            `<tr><td>Inércia (I<sub>cx</sub>)</td><td>Geometric</td><td>${fmt(properties.I.cx, 2)} cm⁴</td></tr>`,
            `<tr><td>Módulo Resist. Inf. (W<sub>i</sub>)</td><td>I<sub>cx</sub> / y<sub>i</sub></td><td>${fmt(properties.W.i, 2)} cm³</td></tr>`,
            `<tr><td>Módulo Resist. Sup. (W<sub>s</sub>)</td><td>I<sub>cx</sub> / y<sub>s</sub></td><td>${fmt(properties.W.s, 2)} cm³</td></tr>`,
            `<tr><td colspan="3" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Materiais</td></tr>`,
            `<tr><td>Resist. à Tração (f<sub>ct,f</sub>)</td><td><code>${materials.fctf.calc}</code></td><td>${fmt(materials.fctf.value, 2)} MPa</td></tr>`,
            `<tr><td colspan="3" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Carregamentos e Momentos (ELS)</td></tr>`,
            `<tr><td>Carga Frequente (q<sub>freq</sub>)</td><td><code>${combinations.freq.calc}</code></td><td>${fmt(combinations.freq.value, 2)} kN/m</td></tr>`,
            `<tr><td>Carga Quase-Perm. (q<sub>qp</sub>)</td><td><code>${combinations.qperm.calc}</code></td><td>${fmt(combinations.qperm.value, 2)} kN/m</td></tr>`,
            `<tr><td>Momento Frequente (M<sub>freq</sub>)</td><td><code>${moments.freq.calc}</code></td><td>${fmt(moments.freq.value, 2)} kN·m</td></tr>`,
            `<tr><td>Momento Quase-Perm. (M<sub>qp</sub>)</td><td><code>${moments.qperm.calc}</code></td><td>${fmt(moments.qperm.value, 2)} kN·m</td></tr>`,
            `<tr><td colspan="3" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Tensões nos Bordos (ELS)</td></tr>`,
            `<tr><td>Tensão na Fibra Inferior (&sigma;<sub>inf,freq</sub>)</td><td><code>${stresses.inf_freq.calc}</code></td><td>${fmt(stresses.inf_freq.value, 2)} MPa</td></tr>`,
            `<tr><td>Tensão na Fibra Superior (&sigma;<sub>sup,qp</sub>)</td><td><code>${stresses.sup_qperm.calc}</code></td><td>${fmt(stresses.sup_qperm.value, 2)} MPa</td></tr>`,
        ];

        return `
        <div id="calculated-props-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center mb-2">
                <h3 class="report-header">Calculated Properties & Demands</h3>
                <button data-copy-target-id="calculated-props-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 summary-table">
                    <thead><tr><th>Parameter</th><th>Formula / Calculation</th><th>Value</th></tr></thead>
                    <tbody>${rows.join('')}</tbody>
                </table>
            </div>
        </div>`;
    }

    function renderPrestressChecks(checks) {
        const { prestress } = checks;
        const fmt = (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A';

        const p_min = Math.max(prestress.P_min_comp_s.value, prestress.P_min_tens_s.value);
        const p_max_initial = Math.min(prestress.P_max_comp_i.value, prestress.P_max_tens_i.value);
        const loss_factor = 1 - (prestress.losses.total_loss / prestress.P_i);
        const p_min_initial = p_min / loss_factor;
        const has_valid_range = p_max_initial >= p_min_initial;

        const summaryHtml = `
            <div id="prestress-summary" class="p-4 rounded-lg ${has_valid_range ? 'bg-green-100 dark:bg-green-900/50' : 'bg-red-100 dark:bg-red-900/50'}">
                <h3 class="font-bold text-lg text-center ${has_valid_range ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}">
                    ${has_valid_range ? 'Faixa de Protensão Válida Encontrada' : 'Faixa de Protensão Inválida'}
                </h3>
                <p class="text-center text-3xl font-bold mt-2">${fmt(p_min_initial * 1000, 1)} kN &le; P<sub>i</sub> &le; ${fmt(p_max_initial * 1000, 1)} kN</p>
                <p class="text-center mt-2">P<sub>i</sub> = ${fmt(prestress.P_i * 1000, 1)} kN, P<sub>eff</sub> = ${fmt(prestress.P_eff * 1000, 1)} kN</p>
                ${!has_valid_range ? '<p class="text-center text-red-600 dark:text-red-400 mt-2">P<sub>min,initial</sub> é maior que P<sub>max,initial</sub>. Revise a seção ou o traçado do cabo.</p>' : ''}
            </div>`;

        const lossRows = `
            <tr><td>Elastic Shortening</td><td><code>${prestress.losses.elastic_shortening.calc}</code></td><td>${fmt(prestress.losses.elastic_shortening.value * 1000, 2)} kN</td></tr>
            <tr><td>Anchorage Slip</td><td><code>${prestress.losses.anchorage_slip.calc}</code></td><td>${fmt(prestress.losses.anchorage_slip.value * 1000, 2)} kN</td></tr>
            <tr><td>Friction</td><td><code>${prestress.losses.friction.calc}</code></td><td>${fmt(prestress.losses.friction.value * 1000, 2)} kN</td></tr>
            <tr><td>Creep</td><td><code>${prestress.losses.creep.calc}</code></td><td>${fmt(prestress.losses.creep.value * 1000, 2)} kN</td></tr>
            <tr><td>Shrinkage</td><td><code>${prestress.losses.shrinkage.calc}</code></td><td>${fmt(prestress.losses.shrinkage.value * 1000, 2)} kN</td></tr>
            <tr><td>Relaxation</td><td><code>${prestress.losses.relaxation.calc}</code></td><td>${fmt(prestress.losses.relaxation.value * 1000, 2)} kN</td></tr>
            <tr><td>Total Loss</td><td>-</td><td>${fmt(prestress.losses.total_loss * 1000, 2)} kN</td></tr>
        `;

        const tableRows = `
            <tr><td>P<sub>max</sub></td><td>Compressão Inicial (Fibra Sup.)</td><td><code>${prestress.P_max_comp_i.calc}</code></td><td>&le; ${fmt(prestress.P_max_comp_i.value * 1000)}</td></tr>
            <tr><td>P<sub>max</sub></td><td>Tração Inicial (Fibra Inf.)</td><td><code>${prestress.P_max_tens_i.calc}</code></td><td>&le; ${fmt(prestress.P_max_tens_i.value * 1000)}</td></tr>
            <tr><td>P<sub>min,eff</sub></td><td>Compressão em Serviço (Fibra Sup.)</td><td><code>${prestress.P_min_comp_s.calc}</code></td><td>&ge; ${fmt(prestress.P_min_comp_s.value * 1000)}</td></tr>
            <tr><td>P<sub>min,eff</sub></td><td>Tração em Serviço (Fibra Inf.)</td><td><code>${prestress.P_min_tens_s.calc}</code></td><td>&ge; ${fmt(prestress.P_min_tens_s.value * 1000)}</td></tr>
        `;

        return `
        <div id="prestress-checks-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center mb-2">
                <h3 class="report-header">Prestressing Force Limit Checks</h3>
                <button data-copy-target-id="prestress-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                ${summaryHtml}
                <table class="w-full mt-4 results-table">
                    <caption class="report-caption">Perdas de Protensão</caption>
                    <thead>
                        <tr><th>Tipo de Perda</th><th>Cálculo</th><th>Valor (kN)</th></tr>
                    </thead>
                    <tbody>
                        ${lossRows}
                    </tbody>
                </table>
                <table class="w-full mt-4 results-table">
                    <caption class="report-caption">Limites da Força de Protensão (P)</caption>
                    <thead>
                        <tr><th>Limite</th><th>Condição</th><th>Cálculo da Fórmula</th><th>Valor (kN)</th></tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    const inputIds = [
        'design_code', 'unit_system', 'fck', 'load_pp', 'load_perm', 'load_var',
        'beam_length', 'beam_height', 'beam_coords', 'Ap' // Added tendon area
    ];

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

    function updateCablePathUI() {
        const container = document.getElementById('cable-path-container');
        const rows = container.querySelectorAll('.cable-path-row');
        rows.forEach((row, index) => {
            const typeSelect = row.querySelector('.cable-type');
            const removeBtn = row.querySelector('.remove-point-btn');
            if (rows.length === 2) {
                typeSelect.disabled = index !== 0;
                typeSelect.style.display = index !== 0 ? 'none' : 'block';
                removeBtn.disabled = true;
                removeBtn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                typeSelect.disabled = index === rows.length - 1;
                typeSelect.style.display = index === rows.length - 1 ? 'none' : 'block';
                removeBtn.disabled = false;
                removeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    function addCablePointRow(containerId, point = { x: 0, y: 0, type: 'Straight' }) {
        const container = document.getElementById(containerId);
        const row = document.createElement('div');
        row.className = 'grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2 items-center cable-path-row';
        
        row.innerHTML = `
            <input type="number" class="cable-x w-full" value="${point.x}">
            <input type="number" class="cable-y w-full" value="${point.y}">
            <select class="cable-type w-full">
                <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Straight</option>
                <option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Parabolic</option>
            </select>
            <button class="remove-point-btn text-red-500 hover:text-red-700 w-8 h-8 flex items-center justify-center">&times;</button>
        `;
        
        row.querySelector('.remove-point-btn').addEventListener('click', (e) => {
            e.preventDefault();
            const rows = container.querySelectorAll('.cable-path-row');
            if (rows.length > 2) {
                row.remove();
                updateCablePathUI();
                debouncedDraw();
            }
        });

        container.appendChild(row);
        row.querySelectorAll('input, select').forEach(el => el.addEventListener('input', () => {
            updateCablePathUI();
            debouncedDraw();
        }));
        updateCablePathUI();
    }

    function gatherBeamInputs() {
        const inputs = gatherInputsFromIds(inputIds);
        inputs.vertices = parseVertices(inputs.beam_coords);
        inputs.cable_path = gatherCablePath();
        inputs.Ap = parseFloat(inputs.Ap) / 1e4 || 0.001; // Convert cm² to m², default
        return inputs;
    }

    // --- Drawing Functions (Updated to use SVG for professional look) ---

    function drawCrossSectionDiagram(svgId, vertices, beamHeight) {
        const svg = document.getElementById(svgId);
        if (!svg) return;

        svg.innerHTML = ''; // Clear previous content
        const ns = "http://www.w3.org/2000/svg";
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#FFFFFF' : '#2c3e50';

        const W = 600, H = 400;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        if (!vertices || vertices.length < 3) {
            const text = document.createElementNS(ns, 'text');
            text.textContent = 'Invalid beam coordinates';
            text.setAttribute('x', W / 2);
            text.setAttribute('y', 20);
            text.setAttribute('fill', textColor);
            text.setAttribute('font-size', '12');
            text.setAttribute('text-anchor', 'middle');
            svg.appendChild(text);
            return;
        }

        const props = concreteBeamCalculator.calculateSectionProperties(vertices);
        if (!props) {
            // Error text remains unchanged...
            return;
        }

        const maxX = Math.max(...vertices.map(v => v[0]));
        const maxY = Math.max(...vertices.map(v => v[1]));
        const minX = Math.min(...vertices.map(v => v[0]));
        const minY = Math.min(...vertices.map(v => v[1]));

        const margin = 50;
        const scaleX = (W - 2 * margin) / (maxX - minX);
        const scaleY = (H - 2 * margin) / (maxY - minY);
        const scale = Math.min(scaleX, scaleY);

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
        path.setAttribute('stroke-width', 2);
        g.appendChild(path);

        const cx = props.centroid.x * scale;
        const cy = props.centroid.y * scale;
        const centroid = document.createElementNS(ns, 'circle');
        centroid.setAttribute('cx', cx);
        centroid.setAttribute('cy', cy);
        centroid.setAttribute('r', 5);
        centroid.setAttribute('fill', isDark ? '#FFFFFF' : 'red');
        g.appendChild(centroid);

        // Updated: Add all notebook-printed properties as text annotations (stacked vertically)
        const annotations = [
            `--- Seção Transversal da Viga ---`,
            `Area: ${props.area.toFixed(2)}`,
            `Centroid (cx, cy): (${props.centroid.x.toFixed(2)}, ${props.centroid.y.toFixed(2)})`,
            `First Moment of Area (Qx, Qy): (${props.Q.x.toFixed(2)}, ${props.Q.y.toFixed(2)})`,
            `Moment of Inertia (I_cx, I_cy): (${props.I.cx.toFixed(2)}, ${props.I.cy.toFixed(2)})`,
            `Radius of Gyration (rx, ry): (${props.r.x.toFixed(2)}, ${props.r.y.toFixed(2)})`,
            `Section Modulus (Wi, Ws): (${props.W.i.toFixed(2)}, ${props.W.s.toFixed(2)})`,
            `Altura da viga: ${props.height.toFixed(2)} cm`
        ];

        annotations.forEach((line, index) => {
            const text = document.createElementNS(ns, 'text');
            text.textContent = line;
            text.setAttribute('x', 10);
            text.setAttribute('y', 20 + index * 20);
            text.setAttribute('fill', textColor);
            text.setAttribute('font-size', '12');
            text.setAttribute('text-anchor', 'start');
            svg.appendChild(text);
        });
    }

    function drawLongitudinalDiagram(svgId, inputs) {
        const svg = document.getElementById(svgId);
        if (!svg) return;

        svg.innerHTML = ''; // Clear previous content
        const ns = "http://www.w3.org/2000/svg";
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#FFFFFF' : '#2c3e50';

        const W = 800, H = 300;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        const beamLength = parseFloat(inputs.beam_length) || 18;
        const beamHeight = (parseFloat(inputs.beam_height) || 80) / 100;
        const cablePath = inputs.cable_path || [];

        if (cablePath.length < 2) {
            const text = document.createElementNS(ns, 'text');
            text.textContent = 'Define at least two cable path points';
            text.setAttribute('x', W / 2);
            text.setAttribute('y', 20);
            text.setAttribute('fill', textColor);
            text.setAttribute('font-size', '12');
            text.setAttribute('text-anchor', 'middle');
            svg.appendChild(text);
            return;
        }

        const marginX = 80;
        const marginY = 50;
        const drawWidth = W - 2 * marginX, drawHeight = H - 2 * marginY;
        const scaleX = drawWidth / beamLength, scaleY = drawHeight / (beamHeight * 2.5); // Adjusted for notebook-like aspect

        const g = document.createElementNS(ns, 'g');
        g.setAttribute('transform', `translate(${marginX}, ${H / 2})`);
        svg.appendChild(g);

        // Updated: Add simple grid lines (emulating matplotlib grid)
        for (let gx = 0; gx <= beamLength; gx += 2) {
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', gx * scaleX);
            line.setAttribute('y1', -beamHeight * scaleY * 1.2);
            line.setAttribute('x2', gx * scaleX);
            line.setAttribute('y2', beamHeight * scaleY * 1.2);
            line.setAttribute('stroke', isDark ? '#4B5563' : '#E5E7EB');
            line.setAttribute('stroke-width', 0.5);
            line.setAttribute('stroke-dasharray', '5,5');
            g.appendChild(line);
        }
        for (let gy = -beamHeight; gy <= beamHeight; gy += 0.2) {
            const line = document.createElementNS(ns, 'line');
            line.setAttribute('x1', 0);
            line.setAttribute('y1', gy * scaleY);
            line.setAttribute('x2', beamLength * scaleX);
            line.setAttribute('y2', gy * scaleY);
            line.setAttribute('stroke', isDark ? '#4B5563' : '#E5E7EB');
            line.setAttribute('stroke-width', 0.5);
            line.setAttribute('stroke-dasharray', '5,5');
            g.appendChild(line);
        }

        // Draw beam outline
        const beam = document.createElementNS(ns, 'rect');
        beam.setAttribute('x', 0);
        beam.setAttribute('y', -beamHeight * scaleY / 2);
        beam.setAttribute('width', beamLength * scaleX);
        beam.setAttribute('height', beamHeight * scaleY);
        beam.setAttribute('fill', isDark ? '#6B7280' : '#d3d3d3');
        beam.setAttribute('stroke', isDark ? '#D1D5DB' : '#000');
        beam.setAttribute('stroke-width', 1.5);
        g.appendChild(beam);

        // Draw centerline
        const centerline = document.createElementNS(ns, 'line');
        centerline.setAttribute('x1', 0);
        centerline.setAttribute('y1', 0);
        centerline.setAttribute('x2', beamLength * scaleX);
        centerline.setAttribute('y2', 0);
        centerline.setAttribute('stroke', isDark ? '#9CA3AF' : '#999');
        centerline.setAttribute('stroke-width', 1);
        g.appendChild(centerline);

        // Updated: Draw supports as triangles (closer to notebook symbols)
        const supportSize = 15;
        const supportY = beamHeight * scaleY / 2 + supportSize / 2;
        const support1 = document.createElementNS(ns, 'polygon');
        support1.setAttribute('points', `-${supportSize / 2}, ${supportY} ${supportSize / 2}, ${supportY} 0, ${supportY + supportSize}`);
        support1.setAttribute('fill', isDark ? '#FFFFFF' : '#1F2A44');
        g.appendChild(support1);

        const support2 = document.createElementNS(ns, 'polygon');
        support2.setAttribute('points', `${beamLength * scaleX - supportSize / 2}, ${supportY} ${beamLength * scaleX + supportSize / 2}, ${supportY} ${beamLength * scaleX}, ${supportY + supportSize}`);
        support2.setAttribute('fill', isDark ? '#FFFFFF' : '#1F2A44');
        g.appendChild(support2);

        // Draw cable path
        drawCablePathSvg(g, cablePath, scaleX, scaleY, isDark);

        // Updated: Add title
        const title = document.createElementNS(ns, 'text');
        title.textContent = 'Viga Protendida';
        title.setAttribute('x', W / 2);
        title.setAttribute('y', 30 - H / 2); // Position above the diagram
        title.setAttribute('fill', textColor);
        title.setAttribute('font-size', '16');
        title.setAttribute('font-weight', 'bold');
        title.setAttribute('text-anchor', 'middle');
        svg.appendChild(title);

        // Updated: Add axis labels
        const xLabel = document.createElementNS(ns, 'text');
        xLabel.textContent = 'Comprimento da Viga (m)';
        xLabel.setAttribute('x', W / 2);
        xLabel.setAttribute('y', H - 10);
        xLabel.setAttribute('fill', textColor);
        xLabel.setAttribute('font-size', '12');
        xLabel.setAttribute('text-anchor', 'middle');
        svg.appendChild(xLabel);

        const yLabel = document.createElementNS(ns, 'text');
        yLabel.textContent = 'Altura (m)';
        yLabel.setAttribute('x', 10);
        yLabel.setAttribute('y', H / 2);
        yLabel.setAttribute('fill', textColor);
        yLabel.setAttribute('font-size', '12');
        yLabel.setAttribute('text-anchor', 'middle');
        yLabel.setAttribute('transform', `rotate(-90, 10, ${H / 2})`);
        svg.appendChild(yLabel);

        // Updated: Add legend (simple text with sample line)
        const legendGroup = document.createElementNS(ns, 'g');
        legendGroup.setAttribute('transform', `translate(${W - 150}, ${40 - (H / 2)})`);
        const legendLine = document.createElementNS(ns, 'line');
        legendLine.setAttribute('x1', 0);
        legendLine.setAttribute('y1', 0);
        legendLine.setAttribute('x2', 20);
        legendLine.setAttribute('y2', 0);
        legendLine.setAttribute('stroke', isDark ? '#EF4444' : 'red');
        legendLine.setAttribute('stroke-width', 2.5);
        legendGroup.appendChild(legendLine);
        const legendText = document.createElementNS(ns, 'text');
        legendText.textContent = 'Cabo de Protensão';
        legendText.setAttribute('x', 25);
        legendText.setAttribute('y', 4);
        legendText.setAttribute('fill', textColor);
        legendText.setAttribute('font-size', '12');
        legendGroup.appendChild(legendText);
        svg.appendChild(legendGroup);
    }

    function drawCablePathSvg(g, path, scaleX, scaleY, isDark) {
        if (!path || path.length < 2) return;

        const ns = "http://www.w3.org/2000/svg";
        const textColor = isDark ? '#FFFFFF' : '#2c3e50';
        let d = `M ${path[0].x * scaleX} ${-path[0].y * scaleY}`;
        
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i + 1];
            
            if (p1.type === 'Parabolic') {
                let vertex = p1.y <= p2.y ? p1 : p2;
                let form_start = p1.y <= p2.y ? p2 : p1;
                
                const coeffs = concreteBeamCalculator.solveParabolaWithVertex([form_start.x, form_start.y], [vertex.x, vertex.y]);
                if (coeffs) {
                    const steps = 25;
                    const x_start = p1.x;
                    const x_end = p2.x;
                    const dx = x_end - x_start;
                    for (let j = 1; j <= steps; j++) {
                        const t = j / steps;
                        const x = x_start + t * dx;
                        const y = coeffs.a * Math.pow(x - vertex.x, 2) + vertex.y;
                        d += ` L ${x * scaleX} ${-y * scaleY}`;
                    }
                } else {
                    d += ` L ${p2.x * scaleX} ${-p2.y * scaleY}`;
                }
            } else {
                d += ` L ${p2.x * scaleX} ${-p2.y * scaleY}`;
            }
        }
        
        const cable = document.createElementNS(ns, 'path');
        cable.setAttribute('d', d);
        cable.setAttribute('fill', 'none');
        cable.setAttribute('stroke', isDark ? '#EF4444' : 'red');
        cable.setAttribute('stroke-width', 2.5);
        g.appendChild(cable);

        // Draw control points
        path.forEach(point => {
            const circle = document.createElementNS(ns, 'circle');
            circle.setAttribute('cx', point.x * scaleX);
            circle.setAttribute('cy', -point.y * scaleY);
            circle.setAttribute('r', 5);
            circle.setAttribute('fill', isDark ? '#EF4444' : 'red');
            g.appendChild(circle);

            const text = document.createElementNS(ns, 'text');
            text.textContent = `(${point.x.toFixed(1)}, ${point.y.toFixed(2)})`;
            text.setAttribute('x', point.x * scaleX + 8);
            text.setAttribute('y', -point.y * scaleY + 4);
            text.setAttribute('fill', textColor);
            text.setAttribute('font-size', '12');
            text.setAttribute('text-anchor', 'start');
            g.appendChild(text);
        });
    }

    function drawDiagrams() {
        const inputs = gatherBeamInputs();
        const beamHeight = parseFloat(document.getElementById('beam_height').value) || 80;
        drawCrossSectionDiagram('cross-section-svg', inputs.vertices, beamHeight);
        drawLongitudinalDiagram('longitudinal-svg', inputs);
    }

    function drawStressDiagram(svgId, results) {
        const svg = document.getElementById(svgId);
        if (!svg || !results || !results.stress_profiles) {
            if (svg) svg.innerHTML = '';
            return;
        }
        svg.innerHTML = '';

        const { stress_profiles, properties } = results;
        const { initial, final: final_stress } = stress_profiles;
        const beamHeight = properties.height;

        const ns = "http://www.w3.org/2000/svg";
        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#FFFFFF' : '#2c3e50';

        const W = 400, H = 400;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        const margin = { top: 40, right: 40, bottom: 40, left: 40 };
        const drawWidth = W - margin.left - margin.right;
        const drawHeight = H - margin.top - margin.bottom;

        const allStresses = [initial.top, initial.bottom, final_stress.top, final_stress.bottom, 0];
        const maxStress = Math.max(...allStresses);
        const minStress = Math.min(...allStresses);
        const stressRange = maxStress - minStress;

        const stressScale = stressRange > 0 ? drawWidth / stressRange : 0;
        const zeroX = margin.left - minStress * stressScale;

        const g = document.createElementNS(ns, 'g');
        svg.appendChild(g);

        // Draw beam outline
        const beamRect = document.createElementNS(ns, 'rect');
        beamRect.setAttribute('x', zeroX - 5);
        beamRect.setAttribute('y', margin.top);
        beamRect.setAttribute('width', 10);
        beamRect.setAttribute('height', drawHeight);
        beamRect.setAttribute('fill', isDark ? '#4b5563' : '#d1d5db');
        g.appendChild(beamRect);

        // Draw zero stress line
        const zeroLine = document.createElementNS(ns, 'line');
        zeroLine.setAttribute('x1', zeroX);
        zeroLine.setAttribute('y1', margin.top - 10);
        zeroLine.setAttribute('x2', zeroX);
        zeroLine.setAttribute('y2', H - margin.bottom + 10);
        zeroLine.setAttribute('stroke', textColor);
        zeroLine.setAttribute('stroke-dasharray', '4 4');
        g.appendChild(zeroLine);
        const zeroLabel = document.createElementNS(ns, 'text');
        zeroLabel.textContent = '0';
        zeroLabel.setAttribute('x', zeroX);
        zeroLabel.setAttribute('y', margin.top - 15);
        zeroLabel.setAttribute('text-anchor', 'middle');
        zeroLabel.setAttribute('fill', textColor);
        g.appendChild(zeroLabel);

        // Function to draw a stress profile
        const drawProfile = (topStress, bottomStress, color, label) => {
            const topX = zeroX + topStress * stressScale;
            const bottomX = zeroX + bottomStress * stressScale;

            const profile = document.createElementNS(ns, 'polygon');
            profile.setAttribute('points', `${zeroX},${margin.top} ${topX},${margin.top} ${bottomX},${H - margin.bottom} ${zeroX},${H - margin.bottom}`);
            profile.setAttribute('fill', color);
            profile.setAttribute('fill-opacity', '0.3');
            profile.setAttribute('stroke', color);
            profile.setAttribute('stroke-width', '2');
            g.appendChild(profile);

            // Add labels for stress values
            const topLabel = document.createElementNS(ns, 'text');
            topLabel.textContent = `${topStress.toFixed(2)} MPa`;
            topLabel.setAttribute('x', topX + (topStress > 0 ? 5 : -5));
            topLabel.setAttribute('y', margin.top + 5);
            topLabel.setAttribute('text-anchor', topStress > 0 ? 'start' : 'end');
            topLabel.setAttribute('fill', color);
            g.appendChild(topLabel);

            const bottomLabel = document.createElementNS(ns, 'text');
            bottomLabel.textContent = `${bottomStress.toFixed(2)} MPa`;
            bottomLabel.setAttribute('x', bottomX + (bottomStress > 0 ? 5 : -5));
            bottomLabel.setAttribute('y', H - margin.bottom - 5);
            bottomLabel.setAttribute('text-anchor', bottomStress > 0 ? 'start' : 'end');
            bottomLabel.setAttribute('fill', color);
            g.appendChild(bottomLabel);
        };

        // Draw Initial and Final profiles
        drawProfile(initial.top, initial.bottom, '#3b82f6', 'Initial'); // Blue
        drawProfile(final_stress.top, final_stress.bottom, '#ef4444', 'Final'); // Red

        // Add legend
        g.innerHTML += `<rect x="${W - 100}" y="10" width="10" height="10" fill="#3b82f6" fill-opacity="0.5" /><text x="${W - 85}" y="20" fill="${textColor}">Initial</text>`;
        g.innerHTML += `<rect x="${W - 100}" y="30" width="10" height="10" fill="#ef4444" fill-opacity="0.5" /><text x="${W - 85}" y="40" fill="${textColor}">Final</text>`;
    }

    function renderResults(results) {
        const { checks, inputs } = results;
        if (!checks) {
            document.getElementById('results-container').innerHTML = '<p class="text-center text-red-500">Calculation failed. Please check inputs.</p>';
            return;
        }

        const inputSummaryHtml = renderInputSummary(inputs);
        const calculatedPropsHtml = renderCalculatedProperties(checks);
        const prestressChecksHtml = renderPrestressChecks(checks);

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

        document.getElementById('results-container').innerHTML = finalHtml;
        drawStressDiagram('stress-diagram-svg', checks);
    }

    const handleRunCheck = createCalculationHandler({
        gatherInputsFunction: gatherBeamInputs,
        storageKey: 'concrete-beam-inputs',
        calculatorFunction: concreteBeamCalculator.run,
        renderFunction: renderResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });

    // --- Event Listeners ---
    document.getElementById('run-check-btn').addEventListener('click', handleRunCheck);

    const debouncedDraw = debounce(() => {
        drawDiagrams();
    }, 300);

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', debouncedDraw);
        }
        // Add listener to fck to auto-update fci
        if (id === 'fck') {
            el.addEventListener('input', () => {
                const fck_val = parseFloat(el.value) || 0;
                document.getElementById('fci').value = (0.8 * fck_val).toFixed(2);
            });
        }
    });

    // --- Page Initialization ---
    injectHeader({
        activePage: 'viga-protendida',
        pageTitle: 'NBR Prestressed Concrete Beam Checker',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    // Setup for the new cable path UI
    const defaultCablePath = [
        { x: 0, y: 0.3, type: 'Parabolic' },
        { x: 9, y: -0.3, type: 'Parabolic' },
        { x: 18, y: 0.3, type: 'Straight' }
    ];
    defaultCablePath.forEach(p => addCablePointRow('cable-path-container', p));
    document.getElementById('add-cable-point-btn').addEventListener('click', () => addCablePointRow('cable-path-container'));

    // Initial draw on page load
    drawDiagrams();

    // Results container event delegation for copy button
    document.getElementById('results-container').addEventListener('click', (event) => {
        const button = event.target;
        if (button.id === 'copy-report-btn') {
            handleCopyToClipboard('results-container', 'feedback-message');
        }
        if (button.id === 'download-pdf-btn') {
            handleDownloadPdf('concrete-beam-report', 'Viga-Protendida-Relatorio.pdf');
        }
        const copySectionBtn = button.closest('.copy-section-btn');
        if (copySectionBtn) {
            const targetId = copySectionBtn.dataset.copyTargetId;
            if (targetId) handleCopyToClipboard(targetId, 'feedback-message');
        }
    });
});