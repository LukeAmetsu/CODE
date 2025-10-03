/**
 * Factory function to create a generic SVG diagram drawer.
 * This reduces code duplication between the flange and web diagram functions.
 * @param {object} config - Configuration object for the specific diagram.
 * @returns {function} A function that draws the configured diagram.
 */
function createDiagramDrawer(config) {
    return function() {
        const svg = document.getElementById(config.svgId);
        if (!svg) return;
        svg.innerHTML = ''; // Clear previous drawing

        const getVal = (id, isString = false) => {
            const el = document.getElementById(id);
            if (!el) return isString ? '' : 0;
            return isString ? el.value : parseFloat(el.value) || 0;
        };
        
        // Gather all inputs defined in the config
        const inputs = {};
        config.inputIds.forEach(id => {
            inputs[id] = getVal(id, id === 'column_type'); // Special handling for string input
        });

        // Drawing parameters
        const { W, H } = config.viewBox;
        const pad = 40;
        const cx = W / 2;
        const cy = H / 2;

        // Calculate scale using a provided function
        const { total_len, total_h } = config.getScaleDimensions(inputs);
        const scale = Math.min((W - 2 * pad) / total_len, (H - 2 * pad) / total_h);
        if (!isFinite(scale) || scale <= 0) return;

        const ns = "http://www.w3.org/2000/svg";
        const createEl = (tag, attrs) => {
            const el = document.createElementNS(ns, tag);
            for (const k in attrs) el.setAttribute(k, attrs[k]);
            return el;
        };

        // Create a drawing context to pass to the specific drawing functions
        const drawContext = { svg, inputs, W, H, cx, cy, scale, createEl };

        // Call the specific drawing functions from the configuration
        config.drawPlate(drawContext);
        config.drawMember(drawContext);
        config.drawBolts(drawContext);
        config.drawDimensions(drawContext);
    };
}

const drawBasePlateDiagram = createDiagramDrawer({
    svgId: 'baseplate-diagram',
    viewBox: { W: 500, H: 350 },
    inputIds: ['base_plate_length_N', 'base_plate_width_B', 'column_depth_d', 'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter', 'bolt_spacing_N', 'bolt_spacing_B', 'num_bolts_total', 'num_bolts_tension_row'],
    getScaleDimensions: (i) => ({
        total_len: i.base_plate_width_B,
        total_h: i.base_plate_length_N
    }),
    drawPlate: ({ svg, inputs, cx, cy, scale, createEl }) => {
        const sN = inputs.base_plate_length_N * scale;
        const sB = inputs.base_plate_width_B * scale;
        svg.appendChild(createEl('rect', { x: cx - sB / 2, y: cy - sN / 2, width: sB, height: sN, class: 'svg-plate' }));
    },
    drawMember: ({ svg, inputs, cx, cy, scale, createEl }) => {
        if (inputs.column_type === 'Round HSS') {
            const s_diam = inputs.column_depth_d * scale;
            svg.appendChild(createEl('circle', { cx: cx, cy: cy, r: s_diam / 2, class: 'svg-member' }));
        } else { // Wide Flange
            const d = inputs.column_depth_d;
            const bf = inputs.column_flange_width_bf;
            const tf = d / 20; // Approximate flange thickness for visualization
            const tw = bf / 20; // Approximate web thickness for visualization

            // Draw the I-beam shape
            svg.appendChild(createEl('rect', { x: cx - (bf * scale) / 2, y: cy - (d * scale) / 2, width: bf * scale, height: tf * scale, class: 'svg-member' })); // Top Flange
            svg.appendChild(createEl('rect', { x: cx - (bf * scale) / 2, y: cy + (d * scale) / 2 - (tf * scale), width: bf * scale, height: tf * scale, class: 'svg-member' })); // Bottom Flange
            svg.appendChild(createEl('rect', { x: cx - (tw * scale) / 2, y: cy - (d * scale) / 2 + (tf * scale), width: tw * scale, height: (d - 2 * tf) * scale, class: 'svg-member' })); // Web
        }
    },
    drawBolts: ({ svg, inputs, cx, cy, scale, createEl }) => {
        const s_bolt_N = inputs.bolt_spacing_N * scale;
        const s_bolt_B = inputs.bolt_spacing_B * scale; // This is spacing between bolts in a row
        const bolt_r = (inputs.anchor_bolt_diameter * scale) / 2;

        const num_cols = inputs.num_bolts_tension_row > 0 ? inputs.num_bolts_tension_row : 1;
        const num_rows = inputs.num_bolts_total > 0 && num_cols > 0 ? inputs.num_bolts_total / num_cols : 0;

        if (num_rows <= 0 || num_cols <= 0) return; // Don't draw if bolt config is invalid

        // Calculate starting position to center the bolt group
        const total_bolt_group_width = (num_cols - 1) * s_bolt_B;
        const total_bolt_group_height = (num_rows - 1) * s_bolt_N;
        const start_x = cx - total_bolt_group_width / 2;
        const start_y = cy - total_bolt_group_height / 2;

        for (let r = 0; r < num_rows; r++) {
            for (let c = 0; c < num_cols; c++) {
                const bolt_cx = start_x + c * s_bolt_B;
                const bolt_cy = start_y + r * s_bolt_N;
                svg.appendChild(createEl('circle', { cx: bolt_cx, cy: bolt_cy, r: bolt_r, class: 'svg-bolt' }));
            }
        }
    },
    drawDimensions: ({ svg, inputs, cx, cy, scale, createEl }) => {
        const sN = inputs.base_plate_length_N * scale;
        const sB = inputs.base_plate_width_B * scale;
        const sd = inputs.column_depth_d * scale;
        // Plate Width (B)
        svg.appendChild(createEl('line', { x1: cx - sB / 2, y1: cy - sN / 2 - 10, x2: cx + sB / 2, y2: cy - sN / 2 - 10, class: 'svg-dim' }));
        svg.appendChild(createEl('text', { x: cx, y: cy - sN / 2 - 15, class: 'svg-dim-text' })).textContent = `B = ${inputs.base_plate_width_B}"`;
        // Plate Length (N)
        svg.appendChild(createEl('line', { x1: cx - sB / 2 - 10, y1: cy - sN / 2, x2: cx - sB / 2 - 10, y2: cy + sN / 2, class: 'svg-dim' }));
        svg.appendChild(createEl('text', { x: cx - sB / 2 - 15, y: cy, class: 'svg-dim-text', transform: `rotate(-90 ${cx - sB/2 - 15},${cy})` })).textContent = `N = ${inputs.base_plate_length_N}"`;
        
        if (inputs.column_type === 'Round HSS') {
            svg.appendChild(createEl('line', { x1: cx - sd / 2, y1: cy - sd / 2 - 5, x2: cx + sd / 2, y2: cy - sd / 2 - 5, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: cx, y: cy - sd / 2 - 10, class: 'svg-dim-text' })).textContent = `D = ${inputs.column_depth_d}"`;
        } else { // Wide Flange
            const sbf = inputs.column_flange_width_bf * scale;
            svg.appendChild(createEl('line', { x1: cx - sbf / 2 - 5, y1: cy - sd / 2, x2: cx - sbf / 2 - 5, y2: cy + sd / 2, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: cx - sbf / 2 - 10, y: cy, class: 'svg-dim-text', transform: `rotate(-90 ${cx - sbf/2 - 10},${cy})` })).textContent = `d = ${inputs.column_depth_d}"`;
            svg.appendChild(createEl('line', { x1: cx - sbf / 2, y1: cy - sd / 2 - 5, x2: cx + sbf / 2, y2: cy - sd / 2 - 5, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: cx, y: cy - sd / 2 - 10, class: 'svg-dim-text' })).textContent = `bf = ${inputs.column_flange_width_bf}"`;
        }
    }
});

const basePlateInputIds = [
    'design_method', 'design_code', 'unit_system', 'base_plate_material', 'base_plate_Fy',
    'concrete_fc', 'anchor_bolt_Fut', 'anchor_bolt_Fnv', 'weld_electrode', 'weld_Fexx', 'base_plate_length_N',
    'base_plate_width_B', 'provided_plate_thickness_tp', 'column_depth_d',
    'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter',
    'anchor_embedment_hef', 'num_bolts_total', 'num_bolts_tension_row',
    'bolt_spacing_N', 'bolt_spacing_B', 'bolt_type', 'weld_size', 'axial_load_P_in',
    'moment_M_in', 'shear_V_in', 'assume_cracked_concrete', 'concrete_edge_dist_ca1',
    'num_bolts_at_edge'
];

const basePlateCalculator = (() => {
    const { PI, sqrt, min, max, abs } = Math;

    function getBasePlateGeometryChecks(inputs) {
        const { anchor_bolt_diameter: db, bolt_spacing_N, bolt_spacing_B, concrete_edge_dist_ca1 } = inputs;
        const checks = {};
        const tolerance = 1e-9;

        // ACI 318-19, Section 17.10.2 - Minimum spacing and edge distance for cast-in anchors
        if (inputs.bolt_type === 'Cast-in') {
            const s_min = 4 * db;
            const ca_min = 6 * db;

            checks['Min Anchor Spacing (N)'] = { actual: bolt_spacing_N, min: s_min, pass: bolt_spacing_N >= s_min - tolerance };
            checks['Min Anchor Spacing (B)'] = { actual: bolt_spacing_B, min: s_min, pass: bolt_spacing_B >= s_min - tolerance };
            checks['Min Edge Distance (cₐ₁)'] = { actual: concrete_edge_dist_ca1, min: ca_min, pass: concrete_edge_dist_ca1 >= ca_min - tolerance };
        }

        return checks;
    }

    function run(inputs) {
        const {
            design_method, base_plate_length_N: N, base_plate_width_B: B, provided_plate_thickness_tp: tp,
            column_depth_d: d, column_flange_width_bf: bf, base_plate_Fy: Fy, concrete_fc: fc,
            axial_load_P_in: Pu, moment_M_in: Mu, shear_V_in: Vu, anchor_bolt_diameter: db,
            num_bolts_tension_row: n_bolts_tension, num_bolts_total, anchor_embedment_hef: hef, concrete_edge_dist_ca1: ca1,
            num_bolts_at_edge, anchor_bolt_Fut: Fut, anchor_bolt_Fnv: Fnv, bolt_spacing_N, bolt_spacing_B,
            bolt_type, weld_size, weld_Fexx
        } = inputs;

        const checks = {};
        const geomChecks = getBasePlateGeometryChecks(inputs);

        // --- 1. Bearing Check (AISC DG1, 2nd Ed.) ---
        const e = (Mu * 12) / abs(Pu); // Eccentricity in inches
        const e_crit = N / 2 - abs(Pu) / (2 * 0.85 * fc * B);

        let f_p_max, Y, q_max;
        if (e <= N / 6) { // Case 1: Compression over entire plate
            f_p_max = (abs(Pu) / (B * N)) * (1 + (6 * e) / N);
        } else { // Case 2: Partial compression
            Y = N - 2 * e;
            f_p_max = (2 * abs(Pu)) / (B * Y);
        }

        // Concrete Bearing Strength (AISC J8)
        const phi_c = 0.65; // LRFD
        const omega_c = 2.31; // ASD
        const P_p = 0.85 * fc * B * N; // Assuming A2 is very large
        const design_bearing_strength = design_method === 'LRFD' ? phi_c * P_p : P_p / omega_c;
        const bearing_pressure_demand = f_p_max * B * (e <= N / 6 ? N : Y);

        checks['Concrete Bearing'] = {
            demand: bearing_pressure_demand,
            check: { Rn: P_p, phi: phi_c, omega: omega_c },
            details: { f_p_max, e, e_crit, Y }
        };

        // --- 2. Plate Bending Check (AISC DG1) ---
        const m = (N - 0.95 * d) / 2;
        const n = (B - 0.80 * bf) / 2;
        const lambda = (2 * sqrt(f_p_max)) / (0.85 * fc);
        const n_prime = (sqrt(d * bf)) / 4;
        const X = ((4 * d * bf) / ((d + bf)**2)) * (abs(Pu) / design_bearing_strength);
        const l = max(m, n, lambda * n_prime);

        const t_req = l * sqrt((2 * f_p_max) / (0.9 * Fy));

        checks['Plate Bending'] = {
            demand: tp, // Provided thickness
            check: { Rn: t_req, phi: 1.0, omega: 1.0 }, // Use Rn as required thickness for ratio calc
            details: { m, n, l, t_req: t_req }
        };

        // --- 3. Anchor Bolt Tension (ACI 318-19 Ch. 17) ---
        let Tu_bolt = 0;
        if (Pu > 0) { // Uplift
            Tu_bolt = Pu / n_bolts_tension;
        } else if (e > N / 6) { // Moment causing tension
            const f = N / 2 - d / 2; // Approx. distance from plate center to tension bolts
            Tu_bolt = (Mu * 12 - abs(Pu) * (N / 2 - Y / 3)) / (f * n_bolts_tension);
        }

        if (Tu_bolt > 0) {
            const Ab = PI * (db ** 2) / 4.0;
            // Steel Strength of Anchor in Tension (ACI 17.6.1)
            const Nsa = Ab * Fut;
            checks['Anchor Steel Tension'] = { demand: Tu_bolt, check: { Rn: Nsa, phi: 0.75, omega: 2.00 } };

            // Concrete Breakout Strength (ACI 17.6.2)
            const ANc = (1.5 * hef) * (1.5 * hef); // Simplified, assumes single anchor far from edges
            const ANco = 9 * hef * hef;
            const psi_ed_N = 1.0; // Simplified
            const psi_c_N = inputs.assume_cracked_concrete === 'true' ? 1.0 : 1.25;
            const psi_cp_N = 1.0; // Simplified
            const k_c = 24; // Cast-in
            const lambda_a = 1.0; // Normal weight concrete
            const Nb = k_c * lambda_a * sqrt(fc * 1000) * hef ** 1.5;
            const Ncb = (ANc / ANco) * psi_ed_N * psi_c_N * psi_cp_N * Nb;
            checks['Anchor Concrete Breakout'] = { demand: Tu_bolt, check: { Rn: Ncb, phi: 0.65, omega: 2.31 } };
        }
        
        // --- 3a. Anchor Bolt Pullout (ACI 318-19 Section 17.6.3) ---
        if (Tu_bolt > 0 && inputs.bolt_type === 'Cast-in') {
            const Abrg = PI * (db ** 2); // Simplified: Bearing area of head, approx. 4x bolt area. Using PI*db^2 is a reasonable approximation.
            const Np = 8 * Abrg * (fc * 1000); // Basic pullout strength in lbs
            const psi_c_P = inputs.assume_cracked_concrete === 'true' ? 1.0 : 1.4;
            const Npn = psi_c_P * Np / 1000; // Convert to kips
            checks['Anchor Pullout Strength'] = { demand: Tu_bolt, check: { Rn: Npn, phi: 0.70, omega: 2.14 }, details: { Abrg, Np, psi_c_P } };
        }

        // --- 3b. Anchor Side-Face Blowout (ACI 318-19 Section 17.6.4) ---
        // This check applies only to headed anchors near an edge (ca1 < 0.4*hef)
        if (Tu_bolt > 0 && inputs.bolt_type === 'Cast-in' && ca1 < 0.4 * hef) {
            const Abrg = PI * (db ** 2); // Bearing area of head, simplified
            const lambda_a = 1.0; // Normal weight concrete
            // ACI Eq. 17.6.4.1a for a single anchor
            const Nsb_single = 160 * ca1 * sqrt(Abrg) * lambda_a * sqrt(fc * 1000); // in lbs
            
            // ACI Eq. 17.6.4.1b for a group of anchors
            const s = inputs.bolt_spacing_N; // Assuming spacing parallel to edge
            const Nsbg = (1 + s / (6 * ca1)) * Nsb_single; // in lbs
            const Nsbg_total = (Nsbg / 1000) * num_bolts_at_edge; // Total for all bolts at edge, in kips

            checks['Anchor Side-Face Blowout'] = { demand: Tu_bolt * num_bolts_at_edge, check: { Rn: Nsbg_total, phi: 0.70, omega: 2.14 }, details: { ca1, hef, Abrg, Nsb_single, Nsbg, num_bolts_at_edge } };
        }

        // --- 4. Anchor Bolt Shear (ACI 318-19 Ch. 17) ---
        if (Vu > 0) {
            const Vu_bolt = Vu / inputs.num_bolts_total;
            const Ab = PI * (db ** 2) / 4.0;
            // Steel Strength of Anchor in Shear (ACI 17.7.1)
            const Vsa = 0.6 * Ab * Fut; // Assuming threads are NOT excluded
            checks['Anchor Steel Shear'] = { demand: Vu_bolt, check: { Rn: Vsa, phi: 0.65, omega: 2.31 } };

            // Concrete Breakout Strength in Shear (ACI 17.7.2)
            // Assuming shear acts towards the edge defined by ca1
            const le = hef; // Load bearing length of anchor for shear, per 17.7.2.3
            const da = db;
            const lambda_a = 1.0; // Normal weight concrete
            // Basic concrete breakout strength for a single anchor (Eq. 17.7.2.2.1a)
            const Vb = 7 * (le / da)**0.2 * sqrt(da) * lambda_a * sqrt(fc * 1000) * (ca1**1.5); // in lbs

            // Modification factors for a group of anchors
            const s_parallel_to_edge = inputs.bolt_spacing_N; // Spacing parallel to the edge of shear
            const Avc = (1.5 * ca1 + 1.5 * ca1 + s_parallel_to_edge) * (1.5 * ca1); // Simplified projected area for two anchors
            const Avco = 4.5 * ca1**2; // Projected area for a single anchor
            const Avc_Avco = Avc / (Avco * num_bolts_at_edge); // Group reduction factor

            const psi_ed_V = 1.0; // Simplified, assuming ca2 >= 1.5*ca1
            const psi_c_V = inputs.assume_cracked_concrete === 'true' ? 1.0 : 1.4; // For shear
            const psi_h_V = 1.0; // Simplified, assuming pedestal height is >= 1.5*ca1

            const Vcbg = Avc_Avco * psi_ed_V * psi_c_V * psi_h_V * Vb * num_bolts_at_edge; // Total group strength in lbs
            const Vcbg_kips = Vcbg / 1000;

            checks['Anchor Concrete Shear Breakout'] = { demand: Vu, check: { Rn: Vcbg_kips, phi: 0.65, omega: 2.31 }, details: { Vb, Avc_Avco, psi_c_V, num_bolts_at_edge } };

            // Concrete Pryout Strength (ACI 17.7.3)
            // Vcp = k_cp * Ncb, where Ncb is the concrete breakout strength in tension.
            // We can reuse the Ncb calculation from the tension check.
            if (checks['Anchor Concrete Breakout']) {
                const k_cp = hef < 2.5 ? 1.0 : 2.0;
                const Ncb = checks['Anchor Concrete Breakout'].check.Rn; // From tension check
                const Vcp = k_cp * Ncb;
                checks['Anchor Concrete Pryout'] = { demand: Vu_bolt, check: { Rn: Vcp, phi: 0.65, omega: 2.31 }, details: { k_cp, Ncb } };
            }
        }

        // --- 5. Weld Strength Check (Elastic Method, AISC Manual Part 8) ---
        if (inputs.weld_size > 0) {
            const Fexx = inputs.weld_Fexx;
            const Rn_weld_per_in = 0.6 * Fexx * (weld_size * 0.707); // Nominal strength per inch of weld
            const phi_weld = 0.75;
            const omega_weld = 2.00;
            const design_strength_weld_per_in = design_method === 'LRFD' ? Rn_weld_per_in * phi_weld : Rn_weld_per_in / omega_weld;

            let f_max_weld = 0;
            let weld_details = {};

            if (inputs.column_type === 'Wide Flange') {
                // Treat as a rectangular weld group
                const Lw = 2 * bf + 2 * d;
                const Aw = Lw; // Unit area
                const Iw_x = (2 * bf * (d/2)**2) + (2 * d**3 / 12); // Unit moment of inertia
                const Iw_y = (2 * d * (bf/2)**2) + (2 * bf**3 / 12);

                const f_axial = abs(Pu) / Aw;
                const f_moment_x = (Mu * 12 * (d/2)) / Iw_x;
                const f_shear = abs(Vu) / Aw; // Simplified shear stress distribution

                f_max_weld = sqrt((f_axial + f_moment_x)**2 + f_shear**2);
                weld_details = { Lw, Aw, Iw_x, f_axial, f_moment_x, f_shear };

            } else { // Round HSS
                const r = d / 2.0;
                const Aw = 2 * PI * r; // Unit area
                const Sw = PI * r**2; // Unit section modulus
                const Jw = 2 * PI * r**3; // Unit polar moment of inertia

                const f_axial = abs(Pu) / Aw;
                const f_moment = (Mu * 12) / Sw;
                const f_shear = abs(Vu) / Jw; // Torsional shear stress from shear force

                f_max_weld = sqrt((f_axial + f_moment)**2 + f_shear**2);
                weld_details = { Aw, Sw, Jw, f_axial, f_moment, f_shear };
            }

            checks['Weld Strength'] = { demand: f_max_weld, check: { Rn: design_strength_weld_per_in, phi: 1.0, omega: 1.0 }, details: weld_details };
        }

        return { checks, geomChecks, inputs };
    }

    return { run };
})();

function renderBasePlateStrengthChecks(results) {
    const { checks, inputs } = results;
    const { design_method } = inputs;

    const tableRowsHtml = Object.entries(checks)
        .filter(([name, data]) => data && data.check) // Ensure the check exists
        .map(([name, data], index) => {
            const detailId = `bp-details-${index}`;
            const { demand, check } = data;
            const { Rn, phi, omega } = check;
            const breakdownHtml = generateBasePlateBreakdownHtml(name, data, inputs);

            const capacity = Rn || 0;
            const design_capacity = design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

            let ratio, demand_val, capacity_val;

            if (name === 'Plate Bending' || name === 'Weld Strength') {
                // For thickness, demand is provided, capacity is required. Ratio is req/prov.
                demand_val = demand; // provided tp
                capacity_val = design_capacity; // required t_req
                ratio = demand_val > 0 ? capacity_val / demand_val : Infinity;
            } else {
                demand_val = demand;
                capacity_val = design_capacity;
                ratio = capacity_val > 0 ? Math.abs(demand_val) / capacity_val : Infinity;
            }

            const status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';

            return `
                <tr class="border-t dark:border-gray-700">
                    <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${demand_val.toFixed(2)}</td>
                    <td>${capacity_val.toFixed(2)}</td>
                    <td>${ratio.toFixed(3)}</td>
                    <td class="font-semibold">${status}</td>
                </tr>
                <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td></tr>
            `;
        }).join('');

    const html = `
        <div id="strength-checks-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center">
                <h3 class="report-header">4. Strength Checks (${design_method})</h3>
                <button data-copy-target-id="strength-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 results-table">
                    <caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">Strength Checks (${design_method})</caption>
                    <thead>
                        <tr>
                            <th class="w-2/5">Limit State</th>
                            <th>Demand</th>
                            <th>Capacity</th>
                            <th>Ratio</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    return html;
}

function renderBasePlateInputSummary(inputs) {
    const {
        design_method, design_code, base_plate_material, base_plate_Fy, concrete_fc,
        base_plate_length_N, base_plate_width_B, provided_plate_thickness_tp,
        column_depth_d, column_flange_width_bf, column_type,
        anchor_bolt_diameter, anchor_embedment_hef, num_bolts_total, bolt_spacing_N, bolt_spacing_B, bolt_type, weld_size
    } = inputs;

    return `
    <div id="input-summary-section" class="report-section-copyable">
        <div class="flex justify-between items-center">
            <h3 class="report-header">1. Input Summary</h3>
            <button data-copy-target-id="input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">General & Material Properties</caption>
                <tbody>
                    <tr><td>Design Method</td><td>${design_method}</td></tr>
                    <tr><td>Design Code</td><td>${design_code}</td></tr>
                    <tr><td>Plate Material</td><td>${base_plate_material} (F<sub>y</sub>=${base_plate_Fy} ksi)</td></tr>
                    <tr><td>Concrete Strength (f'c)</td><td>${concrete_fc} ksi</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Geometric & Anchor Properties</caption>
                <tbody>
                    <tr><td>Plate Dimensions (N &times; B &times; t<sub>p</sub>)</td><td>${base_plate_length_N}" &times; ${base_plate_width_B}" &times; ${provided_plate_thickness_tp}"</td></tr>
                    <tr><td>Column Dimensions (d &times; b<sub>f</sub>)</td><td>${column_depth_d}" &times; ${column_flange_width_bf}" (${column_type})</td></tr>
                    <tr><td>Anchor Diameter / Embedment</td><td>&empty;${anchor_bolt_diameter}" / h<sub>ef</sub>=${anchor_embedment_hef}"</td></tr>
                    <tr><td>Anchor Spacing (N &times; B)</td><td>${bolt_spacing_N}" &times; ${bolt_spacing_B}"</td></tr>
                    <tr><td>Anchor Type / Weld Size</td><td>${bolt_type} / ${weld_size}"</td></tr>
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderBasePlateGeometryChecks(geomChecks) {
    if (Object.keys(geomChecks).length === 0) return '';

    const rows = Object.entries(geomChecks).map(([name, data]) => {
        const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        return `<tr><td>${name}</td><td>${data.actual.toFixed(3)}</td><td>${data.min.toFixed(3)}</td><td>${status}</td></tr>`;
    }).join('');

    return `
    <div id="geometry-checks-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center">
            <h3 class="report-header">2. Geometry & Spacing Checks (ACI 318-19)</h3>
            <button data-copy-target-id="geometry-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">Anchor Geometry Checks</caption>
                <thead><tr><th>Item</th><th>Actual (in)</th><th>Minimum (in)</th><th>Status</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function renderBasePlateLoadSummary(inputs, checks) {
    const { axial_load_P_in: Pu, moment_M_in: Mu, shear_V_in: Vu } = inputs;
    const bearing_pressure = checks['Concrete Bearing']?.details?.f_p_max || 0;
    const anchor_tension = checks['Anchor Steel Tension']?.demand || 0;
    const anchor_shear = checks['Anchor Steel Shear']?.demand || 0;

    const rows = [
        `<tr><td>Applied Axial (P)</td><td>${Pu.toFixed(2)} kips</td></tr>`,
        `<tr><td>Applied Moment (M)</td><td>${Mu.toFixed(2)} kip-ft</td></tr>`,
        `<tr><td>Applied Shear (V)</td><td>${Vu.toFixed(2)} kips</td></tr>`,
        `<tr class="border-t dark:border-gray-700"><td class="font-semibold">Max. Bearing Pressure (f<sub>p,max</sub>)</td><td>${bearing_pressure.toFixed(2)} ksi</td></tr>`,
        `<tr class="border-t dark:border-gray-700"><td class="font-semibold">Max. Anchor Tension (T<sub>u,bolt</sub>)</td><td>${anchor_tension.toFixed(2)} kips</td></tr>`,
        `<tr class="border-t dark:border-gray-700"><td class="font-semibold">Max. Anchor Shear (V<sub>u,bolt</sub>)</td><td>${anchor_shear.toFixed(2)} kips</td></tr>`
    ];

    return `
    <div id="load-summary-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center">
            <h3 class="report-header">3. Load Summary</h3>
            <button data-copy-target-id="load-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">Applied Loads & Calculated Demands</caption>
                <thead><tr><th>Load / Demand Type</th><th>Magnitude</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    `;
}

function generateBasePlateBreakdownHtml(name, data, inputs) {
    const { check, details } = data;
    const { design_method } = inputs;
    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? check.phi : check.omega;
    const capacity_eq = design_method === 'LRFD' ? `${factor_char}R<sub>n</sub>` : `R<sub>n</sub> / ${factor_char}`;
    const final_capacity = design_method === 'LRFD' ? check.Rn * factor_val : check.Rn / factor_val;

    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;
    let content = '';

    switch (name) {
        case 'Concrete Bearing':
            content = format_list([
                `Max Bearing Pressure (f<sub>p,max</sub>) = <b>${details.f_p_max.toFixed(2)} ksi</b>`,
                `Nominal Bearing Strength (P<sub>p</sub>) = 0.85 * f'c * A<sub>1</sub> = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Plate Bending':
            content = format_list([
                `Cantilever distance (m) = <b>${details.m.toFixed(3)} in</b>`,
                `Cantilever distance (n) = <b>${details.n.toFixed(3)} in</b>`,
                `Effective cantilever length (l) = max(m, n, &lambda;n') = <b>${details.l.toFixed(3)} in</b>`,
                `Required Thickness (t<sub>req</sub>) = l * &radic;(2*f<sub>p,max</sub> / (0.9*F<sub>y</sub>)) = <b>${check.Rn.toFixed(3)} in</b>`
            ]);
            break;
        case 'Anchor Steel Tension':
            content = format_list([
                `Nominal Steel Strength (N<sub>sa</sub>) = A<sub>b,eff</sub> * F<sub>ut</sub> = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Steel Shear':
            content = format_list([
                `Reference: ACI 318-19, Section 17.7.1`,
                `Nominal Steel Strength (V<sub>sa</sub>) = 0.6 * A<sub>b</sub> * F<sub>ut</sub> = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Concrete Breakout':
            content = format_list([
                `Basic Concrete Breakout Strength (N<sub>b</sub>) = k<sub>c</sub> * &lambda;<sub>a</sub> * &radic;(f'c) * h<sub>ef</sub><sup>1.5</sup> = <b>${(check.Rn / (check.phi || 1)).toFixed(2)} kips</b> (Simplified)`,
                `Design Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Pullout Strength':
            content = format_list([
                `Reference: ACI 318-19, Section 17.6.3`,
                `Bearing Area of Head (A<sub>brg</sub>) &approx; <b>${details.Abrg.toFixed(3)} in²</b>`,
                `Basic Pullout Strength (N<sub>p</sub>) = 8 * A<sub>brg</sub> * f'c = <b>${(details.Np/1000).toFixed(2)} kips</b>`,
                `Nominal Pullout Strength (N<sub>pn</sub>) = &psi;<sub>c,P</sub> * N<sub>p</sub> = ${details.psi_c_P} * ${(details.Np/1000).toFixed(2)} = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Side-Face Blowout':
            content = format_list([
                `Check applies because cₐ₁ (${details.ca1}") < 0.4*hₑf (${(0.4*details.hef).toFixed(2)}")`,
                `Nominal Strength, Single Anchor (N<sub>sb</sub>) = 160*cₐ₁*&radic;A<sub>brg</sub>*&lambda;ₐ*&radic;f'c = <b>${(details.Nsb_single/1000).toFixed(2)} kips</b>`,
                `Nominal Strength, Group (N<sub>sbg</sub>) = (1 + s/(6cₐ₁))*N<sub>sb</sub> = <b>${(details.Nsbg/1000).toFixed(2)} kips/bolt</b>`,
                `Total Group Capacity = N<sub>sbg</sub> * n_bolts = <b>${check.Rn.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Concrete Shear Breakout':
            content = format_list([
                `Reference: ACI 318-19, Section 17.7.2`,
                `Basic Strength, Single Anchor (V<sub>b</sub>) = 7*(lₑ/dₐ)⁰·²*&radic;dₐ*&lambda;ₐ*&radic;f'c*cₐ₁¹·⁵ = <b>${(details.Vb/1000).toFixed(2)} kips</b>`,
                `Group Area Factor (A<sub>vc</sub>/A<sub>vco</sub>) = <b>${details.Avc_Avco.toFixed(3)}</b>`,
                `Cracked Concrete Factor (&psi;<sub>c,V</sub>) = <b>${details.psi_c_V.toFixed(2)}</b>`,
                `Nominal Group Strength (V<sub>cbg</sub>) = (A<sub>vc</sub>/A<sub>vco</sub>) * &psi;<sub>c,V</sub> * V<sub>b</sub> * n_bolts = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Weld Strength':
            const weld_cap_eq = design_method === 'LRFD' ? `0.75 * 0.6 * F<sub>exx</sub> * 0.707 * w` : `(0.6 * F<sub>exx</sub> * 0.707 * w) / 2.00`;
            let stress_calcs = [];
            if (inputs.column_type === 'Wide Flange') {
                stress_calcs = [
                    `Max Stress (f<sub>max</sub>) = &radic;[(P/A<sub>w</sub> + M/S<sub>w</sub>)² + (V/A<sub>w</sub>)²] = <b>${data.demand.toFixed(2)} kips/in</b>`
                ];
            } else { // Round HSS
                stress_calcs = [
                    `Max Stress (f<sub>max</sub>) = &radic;[(P/A<sub>w</sub> + M/S<sub>w</sub>)² + (V/J<sub>w</sub>)²] = <b>${data.demand.toFixed(2)} kips/in</b>`
                ];
            }
            content = format_list(stress_calcs.concat([
                `Weld Design Strength = ${weld_cap_eq} = <b>${check.Rn.toFixed(2)} kips/in</b>`
            ]));
            break;
        case 'Anchor Concrete Pryout':
            content = format_list([
                `Pryout Factor (k<sub>cp</sub>) = <b>${details.k_cp.toFixed(1)}</b> (since h<sub>ef</sub> ${inputs.anchor_embedment_hef < 2.5 ? '<' : '>='} 2.5")`,
                `Nominal Concrete Breakout Strength (N<sub>cb</sub>) = <b>${details.Ncb.toFixed(2)} kips</b> (from tension analysis)`,
                `Nominal Pryout Strength (V<sub>cp</sub>) = k<sub>cp</sub> * N<sub>cb</sub> = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        default: return 'Breakdown not available.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

function renderResults(results) {
    const { checks, geomChecks, inputs } = results;

    const inputSummaryHtml = renderBasePlateInputSummary(inputs);
    const geometryChecksHtml = renderBasePlateGeometryChecks(geomChecks);
    const loadSummaryHtml = renderBasePlateLoadSummary(inputs, checks);
    const strengthChecksHtml = renderBasePlateStrengthChecks(results); // Pass the whole results object

    const finalHtml = `
        <div id="baseplate-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end flex-wrap gap-2 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Show All Details</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
            </div>
            <h2 class="report-title text-center">Base Plate & Anchorage Check Results</h2>
            ${inputSummaryHtml}
            ${geometryChecksHtml}
            ${loadSummaryHtml}
            ${strengthChecksHtml}
        </div>`;

    document.getElementById('steel-results-container').innerHTML = finalHtml;
}

document.addEventListener('DOMContentLoaded', () => {

    function populateMaterialDropdowns() {
        const gradeOptions = Object.keys(AISC_SPEC.structuralSteelGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');

        const select = document.getElementById('base_plate_material');
        if (select) {
            select.innerHTML = gradeOptions;
            select.value = 'A36'; // Default for base plates
            select.addEventListener('change', (e) => {
                const grade = AISC_SPEC.getSteelGrade(e.target.value);
                if (grade) {
                    document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                }
            });
            select.dispatchEvent(new Event('change')); // Trigger initial population
        }

        // --- Populate Weld Electrode Dropdown ---
        const weldOptions = Object.keys(AISC_SPEC.weldElectrodes).map(grade => `<option value="${grade}">${grade}</option>`).join('');
        const weldSelect = document.getElementById('weld_electrode');
        if (weldSelect) {
            weldSelect.innerHTML = weldOptions;
            weldSelect.value = 'E70XX'; // Default
            weldSelect.addEventListener('change', (e) => {
                const electrode = AISC_SPEC.weldElectrodes[e.target.value];
                if (electrode) document.getElementById(e.target.dataset.fexxTarget).value = electrode.Fexx;
            });
            weldSelect.dispatchEvent(new Event('change'));
        }

        // --- Populate Bolt Grade Dropdown ---
        const boltGradeOptions = Object.keys(AISC_SPEC.boltGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');
        const boltSelect = document.getElementById('anchor_bolt_grade');
        const threadsCheckbox = document.getElementById('anchor_threads_included');

        function updateBoltProperties() {
            const grade = boltSelect.value;
            const threadsIncl = threadsCheckbox.checked;
            const { Fnv } = AISC_SPEC.getFnv(grade, threadsIncl);
            const Fnt = AISC_SPEC.getFnt(grade); // Note: AISC provides Fnt (nominal tensile stress), not Fut. Using Fnt for Fut.

            document.getElementById(boltSelect.dataset.futTarget).value = Fnt;
            document.getElementById(boltSelect.dataset.fnvTarget).value = Fnv;
        }

        if (boltSelect && threadsCheckbox) {
            boltSelect.innerHTML = boltGradeOptions;
            boltSelect.value = 'A325'; // A common default
            boltSelect.addEventListener('change', updateBoltProperties);
            threadsCheckbox.addEventListener('change', updateBoltProperties);
            updateBoltProperties(); // Initial population
        }
    }

    function updateColumnInputsUI() {
        const columnType = document.getElementById('column_type').value;
        const label1 = document.getElementById('label_column_dim1');
        const container2 = document.getElementById('container_column_dim2');

        if (columnType === 'Round HSS') {
            label1.textContent = 'Column Diameter (D)';
            container2.style.display = 'none';
        } else { // Wide Flange
            label1.textContent = 'Column d';
            container2.style.display = 'block';
        }
        // Redraw diagram whenever the type changes
        drawBasePlateDiagram();
    }

    // Attach listener for column type change
    document.getElementById('column_type').addEventListener('change', updateColumnInputsUI);

    const handleRunBasePlateCheck = createCalculationHandler({
        inputIds: basePlateInputIds,
        storageKey: 'baseplate-inputs',
        validationRuleKey: 'baseplate',
        calculatorFunction: basePlateCalculator.run,
        renderFunction: renderResults,
        resultsContainerId: 'steel-results-container',
        buttonId: 'run-steel-check-btn'
    });
    injectHeader({
        activePage: 'base-plate',
        pageTitle: 'AISC Base Plate & Anchorage Checker',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({
        footerPlaceholderId: 'footer-placeholder'
    });
    initializeSharedUI();
    // Populate dropdowns first to ensure event listeners are attached before local storage is loaded.
    populateMaterialDropdowns();
    updateColumnInputsUI(); // Set initial state
    loadInputsFromLocalStorage('baseplate-inputs', basePlateInputIds);
    
    // --- Attach event listeners for dynamic diagram updates ---
    const diagramInputIds = ['base_plate_length_N', 'base_plate_width_B', 'column_depth_d', 'column_flange_width_bf', 'anchor_bolt_diameter', 'bolt_spacing_N', 'bolt_spacing_B'];
    diagramInputIds.forEach(id => {
        document.getElementById(id)?.addEventListener('input', drawBasePlateDiagram);
    });

    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunBasePlateCheck);
    const handleSaveInputs = createSaveInputsHandler(basePlateInputIds, 'baseplate-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(basePlateInputIds, handleRunBasePlateCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);

    // Initial drawing of the diagram on page load
    drawBasePlateDiagram();

    document.getElementById('steel-results-container').addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('.toggle-details-btn');
        if (toggleBtn) {
            const detailId = toggleBtn.dataset.toggleId;
            const row = document.getElementById(detailId);
            if (row) {
                row.classList.toggle('is-visible');
                toggleBtn.textContent = row.classList.contains('is-visible') ? '[Hide]' : '[Show]';
            }
        }
        if (event.target.id === 'toggle-all-details-btn') {
            const mainButton = event.target;
            const shouldShow = mainButton.dataset.state === 'hidden';
            document.querySelectorAll('#steel-results-container .details-row').forEach(row => row.classList.toggle('is-visible', shouldShow));
            document.querySelectorAll('#steel-results-container .toggle-details-btn').forEach(button => {
                button.textContent = shouldShow ? '[Hide]' : '[Show]';
            });
            mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
            mainButton.textContent = shouldShow ? 'Hide All Details' : 'Show All Details';
        }


        if (event.target.id === 'copy-report-btn') {
            handleCopyToClipboard('baseplate-report-content', 'feedback-message');
        }
        if (event.target.id === 'print-report-btn') {
            window.print();
        }
        if (event.target.id === 'download-pdf-btn') {
            handleDownloadPdf('baseplate-report-content', 'Base-Plate-Report.pdf');
        }
    });
});