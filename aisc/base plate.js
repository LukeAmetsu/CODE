const basePlateInputIds = [
    'design_method', 'design_code', 'unit_system', 'base_plate_Fy', 'concrete_fc',
    'anchor_bolt_Fut', 'anchor_bolt_Fnv', 'weld_Fexx', 'base_plate_length_N',
    'base_plate_width_B', 'provided_plate_thickness_tp', 'column_depth_d',
    'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter',
    'anchor_embedment_hef', 'num_bolts_total', 'num_bolts_tension_row',
    'bolt_spacing_N', 'bolt_spacing_B', 'bolt_type', 'weld_size', 'axial_load_P_in',
    'moment_M_in', 'shear_V_in', 'assume_cracked_concrete', 'deflection_span',
    'deflection_limit', 'steel_E'
];

const basePlateCalculator = (() => {
    const { PI, sqrt, min, max, abs } = Math;

    function run(inputs) {
        const {
            design_method, base_plate_length_N: N, base_plate_width_B: B, provided_plate_thickness_tp: tp,
            column_depth_d: d, column_flange_width_bf: bf, base_plate_Fy: Fy, concrete_fc: fc,
            axial_load_P_in: Pu, moment_M_in: Mu, shear_V_in: Vu,
            anchor_bolt_diameter: db, num_bolts_tension_row: n_bolts_tension, anchor_embedment_hef: hef,
            anchor_bolt_Fut: Fut, anchor_bolt_Fnv: Fnv
        } = inputs;

        const checks = {};

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

        // --- 4. Anchor Bolt Shear (ACI 318-19 Ch. 17) ---
        if (Vu > 0) {
            const Vu_bolt = Vu / inputs.num_bolts_total;
            const Ab = PI * (db ** 2) / 4.0;
            // Steel Strength of Anchor in Shear (ACI 17.7.1)
            const Vsa = 0.6 * Ab * Fut; // Assuming threads are NOT excluded
            checks['Anchor Steel Shear'] = { demand: Vu_bolt, check: { Rn: Vsa, phi: 0.65, omega: 2.31 } };
        }

        return { checks, inputs };
    }

    return { run };
})();

function renderResults(results) {
    const { checks, inputs } = results;
    const { design_method } = inputs;

    let html = `<div id="baseplate-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
                    <div class="flex justify-end gap-2 -mt-2 -mr-2 print-hidden">
                        <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                        <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
                    </div>
                    <h2 class="report-header !mt-0">Base Plate & Anchorage Check Results (${design_method})</h2>
                    <table class="mt-6">
                        <thead class="text-sm">
                            <tr>
                                <th class="w-2/5">Limit State</th>
                                <th>Demand</th>
                                <th>Capacity</th>
                                <th>Ratio</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>`;

    const addRow = (name, data) => {
        if (!data || !data.check) return;
        let { demand, check } = data;
        const { Rn, phi, omega } = check;

        const capacity = Rn || 0;
        const design_capacity = design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);
        
        let ratio, demand_val, capacity_val;
        
        if (name === 'Plate Bending') {
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
        
        html += `<tr class="border-t dark:border-gray-700">
                    <td>${name}</td>
                    <td>${demand_val.toFixed(2)}</td>
                    <td>${capacity_val.toFixed(2)}</td>
                    <td>${ratio.toFixed(3)}</td>
                    <td>${status}</td>
                 </tr>`;
    };

    Object.entries(checks).forEach(([name, data]) => addRow(name, data));

    html += `</tbody></table></div>`;
    document.getElementById('steel-results-container').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
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

    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunBasePlateCheck);
    const handleSaveInputs = createSaveInputsHandler(basePlateInputIds, 'baseplate-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(basePlateInputIds, handleRunBasePlateCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);

    document.getElementById('steel-results-container').addEventListener('click', (event) => {
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