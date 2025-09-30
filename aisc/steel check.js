const steelCheckInputIds = [
    'design_method', 'aisc_standard', 'unit_system', 'Fy', 'Fu', 'E', 'section_type',
    'd', 'bf', 'tf', 'tw', 'Ag_manual', 'I_manual', 'Sx_manual', 'Zx_manual', 'ry_manual', 'rts_manual', 'J_manual', 'Cw_manual',
    'Iy_manual', 'Sy_manual', 'Zy_manual', 'lb_bearing', 'is_end_bearing', 'k_des', 'Cm', 'Lb_input', 'K', 'Cb', 
    'Pu_or_Pa', 'Mux_or_Max', 'Muy_or_May', 'Vu_or_Va', 'Tu_or_Ta', 'deflection_span', 'deflection_limit', 'actual_deflection_input'
];

document.addEventListener('DOMContentLoaded', () => {
    const handleRunSteelCheck = createCalculationHandler({
        inputIds: steelCheckInputIds,
        storageKey: 'steel-check-inputs',
        validationRuleKey: 'steel_check',
        calculatorFunction: steelChecker.run,
        renderFunction: renderSteelResults,
        resultsContainerId: 'steel-results-container',
        buttonId: 'run-steel-check-btn'
    });

    injectHeader({
        activePage: 'steel-check',
        pageTitle: 'AISC Steel Section Design Checker',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    document.getElementById('save-inputs-btn').addEventListener('click', createSaveInputsHandler(steelCheckInputIds, 'steel-check-inputs.txt'));
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', createLoadInputsHandler(steelCheckInputIds, handleRunSteelCheck));

    // The aiscShapeDatabase is defined later in the script, so it's available in the handler.
    document.getElementById('section_type').addEventListener('change', updateGeometryInputsUI);
    document.getElementById('num_beams').addEventListener('input', calculateAndDisplayBuiltUpProperties);
    document.getElementById('beam_spacing').addEventListener('input', calculateAndDisplayBuiltUpProperties);
    updateGeometryInputsUI(); // Initial call
    loadInputsFromLocalStorage('steel-check-inputs', steelCheckInputIds);
    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunSteelCheck);

    document.getElementById('steel-results-container').addEventListener('click', (event) => {
        const button = event.target.closest('.toggle-details-btn');
        if (button) {
            const detailId = button.dataset.toggleId;
            const detailRow = document.getElementById(detailId);
            detailRow?.classList.toggle('is-visible');
            button.textContent = detailRow?.classList.contains('is-visible') ? '[Hide]' : '[Show]';
        }
        if (event.target.id === 'copy-report-btn') {
            handleCopyToClipboard('steel-results-container', 'feedback-message');
        }
        if (event.target.id === 'download-pdf-btn') {
            handleDownloadPdf('steel-results-container', 'Steel-Check-Report.pdf');
        }
    });
});

function calculateAndDisplayBuiltUpProperties() {
    const n_beams = parseInt(document.getElementById('num_beams').value) || 1;
    const spacing = parseFloat(document.getElementById('beam_spacing').value) || 0;
    const resultsDiv = document.getElementById('built-up-results');

    if (n_beams <= 1) {
        resultsDiv.innerHTML = '';
        return;
    }

    const single_props = getSectionProperties(gatherInputs());
    if (!single_props.Ag) {
        resultsDiv.innerHTML = '<p class="text-red-500">Define single section properties first.</p>';
        return;
    }

    // --- Calculate Built-up Properties ---
    const bu_props = {};
    // Properties that scale linearly
    bu_props.Ag = n_beams * single_props.Ag;
    bu_props.Ix = n_beams * single_props.Ix;
    bu_props.Sx = n_beams * single_props.Sx;
    bu_props.Zx = n_beams * single_props.Zx;
    bu_props.J = n_beams * single_props.J;

    // Properties requiring Parallel Axis Theorem (for weak axis)
    let Iy_parallel_axis_term = 0;
    for (let i = 0; i < n_beams; i++) {
        // Distance of beam 'i' from the centroid of the group
        const distanceFromCenter = i * spacing - (spacing * (n_beams - 1)) / 2;
        Iy_parallel_axis_term += single_props.Ag * Math.pow(distanceFromCenter, 2);
    }
    bu_props.Iy = n_beams * single_props.Iy + Iy_parallel_axis_term;

    const total_width = (n_beams - 1) * spacing + single_props.bf;
    bu_props.Sy = bu_props.Iy / (total_width / 2);
    bu_props.ry = Math.sqrt(bu_props.Iy / bu_props.Ag);

    // --- Render Results ---
    resultsDiv.innerHTML = `
        <h4 class="font-semibold border-t dark:border-gray-600 pt-3">Calculated Built-Up Properties:</h4>
        <table class="text-sm w-full mt-2">
            <tbody class="divide-y dark:divide-gray-700">
                <tr><td class="py-1">Total Area (A<sub>g,total</sub>):</td><td class="text-right font-mono">${bu_props.Ag.toFixed(2)} in²</td></tr>
                <tr><td class="py-1">Total Strong Axis I<sub>x,total</sub>:</td><td class="text-right font-mono">${bu_props.Ix.toFixed(2)} in⁴</td></tr>
                <tr><td class="py-1">Total Strong Axis S<sub>x,total</sub>:</td><td class="text-right font-mono">${bu_props.Sx.toFixed(2)} in³</td></tr>
                <tr><td class="py-1">Total Strong Axis Z<sub>x,total</sub>:</td><td class="text-right font-mono">${bu_props.Zx.toFixed(2)} in³</td></tr>
                <tr class="border-t border-dashed dark:border-gray-600"><td class="py-1 font-semibold">Total Weak Axis I<sub>y,total</sub>:</td><td class="text-right font-mono">${bu_props.Iy.toFixed(2)} in⁴</td></tr>
                <tr><td class="py-1">Total Weak Axis S<sub>y,total</sub>:</td><td class="text-right font-mono">${bu_props.Sy.toFixed(2)} in³</td></tr>
                <tr><td class="py-1">Weak Axis Radius of Gyration (r<sub>y,total</sub>):</td><td class="text-right font-mono">${bu_props.ry.toFixed(2)} in</td></tr>
            </tbody>
        </table>
    `;
}

function updateGeometryInputsUI() {
    const sectionType = document.getElementById('section_type').value;
    const d_label = document.getElementById('label-d');
    const bf_label = document.getElementById('label-bf');
    const tf_label = document.getElementById('label-tf');
    const tw_label = document.getElementById('label-tw');
    const d_container = document.getElementById('d-input-container');
    const bf_container = document.getElementById('bf-input-container');
    const tf_container = document.getElementById('tf-input-container');
    const tw_container = document.getElementById('tw-input-container');

    // Reset visibility
    d_container.style.display = 'block';
    bf_container.style.display = 'block';
    tf_container.style.display = 'block';
    tw_container.style.display = 'block';

    if (sectionType === 'I-Shape') {
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
    } else if (sectionType === 'Rectangular HSS') {
        d_label.textContent = 'Height (H)';
        bf_label.textContent = 'Width (B)';
        tf_label.textContent = 'Thickness (t)';
        tw_container.style.display = 'none'; // Hide tw
    } else if (sectionType === 'HSS-round') {
        d_label.textContent = 'Diameter (D)';
        bf_label.textContent = 'Thickness (t)';
        d_container.style.display = 'block';
        bf_container.style.display = 'block'; // This is now thickness
        tf_container.style.display = 'none'; // Hide original tf
        tw_container.style.display = 'none';
    } else if (sectionType === 'channel' || sectionType === 'angle') {
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
    }
}

function gatherInputs() {
    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? (parseFloat(el.value) || 0) : 0;
    };
    const getStr = (id) => document.getElementById(id).value;
    return {
        design_method: getStr('design_method'),
        aisc_standard: getStr('aisc_standard'),
        unit_system: getStr('unit_system'),
        Fy: getVal('Fy'),
        Fu: getVal('Fu'),
        E: getVal('E'),
        section_type: getStr('section_type'),
        d: getVal('d'),
        bf: getVal('bf'),
        tf: getVal('tf'),
        tw: getVal('tw'),
        Ag_manual: getVal('Ag_manual'),
        I_manual: getVal('I_manual'),
        Sx_manual: getVal('Sx_manual'),
        Zx_manual: getVal('Zx_manual'),
        Iy_manual: getVal('Iy_manual'), Sy_manual: getVal('Sy_manual'), Zy_manual: getVal('Zy_manual'),
        ry_manual: getVal('ry_manual'), 
        J_manual: getVal('J_manual'),
        Cw_manual: getVal('Cw_manual'),
        rts_manual: getVal('rts_manual'),
        Lb_input: getVal('Lb_input'),
        K: getVal('K'),
        Cb: getVal('Cb'),
        lb_bearing: getVal('lb_bearing'),
        is_end_bearing: getStr('is_end_bearing') === 'true',
        k_des: getVal('k_des'), Cm: getVal('Cm'),
        Pu_or_Pa: getVal('Pu_or_Pa'),
        Mux_or_Max: getVal('Mux_or_Max'),
        Muy_or_May: getVal('Muy_or_May'),
        Vu_or_Va: getVal('Vu_or_Va'),
        deflection_span: getVal('deflection_span'),
        deflection_limit: getVal('deflection_limit'),
        actual_deflection_input: getVal('actual_deflection_input'), Tu_or_Ta: getVal('Tu_or_Ta'),
        An_net: getVal('Ag_manual'), U_shear_lag: 1.0, // Assume full beam, U=1.0
    };
}

const steelChecker = (() => {

    function getSectionProperties(inputs) {
        if (inputs.section_type === 'Manual Input') {
            return {
                type: 'I-Shape', Ag: inputs.Ag_manual, Ix: inputs.I_manual, Sx: inputs.Sx_manual, Zx: inputs.Zx_manual,
                Iy: inputs.Iy_manual, Sy: inputs.Sy_manual, Zy: inputs.Zy_manual, ry: inputs.ry_manual, 
                rts: inputs.rts_manual, J: inputs.J_manual, Cw: inputs.Cw_manual, d: inputs.d, 
                bf: inputs.bf, tf: inputs.tf, tw: inputs.tw, h: inputs.d - 2 * inputs.tf, k_des: inputs.tf
            };
        }
        
        if (inputs.section_type === 'I-Shape') {
            const { d, bf, tf, tw } = inputs;
            const Ag = 2 * bf * tf + (d - 2 * tf) * tw;
            const Ix = (bf * d**3 / 12) - ((bf - tw) * (d - 2 * tf)**3 / 12);
            const Sx = Ix / (d / 2);
            const Zx = (bf * tf * (d - tf)) + (tw * (d - 2 * tf)**2 / 4);
            const Iy = (2 * tf * bf**3 / 12) + ((d - 2 * tf) * tw**3 / 12);
            const ry = Math.sqrt(Iy / Ag);
            const h = d - 2 * tf;
            const Sy = Iy / (bf / 2);
            const Zy = (tf * bf**2 / 2) + (tw**3 * (d - 2*tf) / 4);
            const J = (1/3) * (2 * bf * tf**3 + (d - 2 * tf) * tw**3);
            const Cw = (Iy * h**2) / 4;
            const rts = (Cw > 0 && Sx > 0) ? Math.sqrt(Math.sqrt(Iy * Cw) / Sx) : 0; // Corrected per AISC F2-7
            const rx = Math.sqrt(Ix / Ag);
            return { type: 'I-Shape', Ag, Ix, Sx, Zx, Iy, Sy, Zy, ry, rts, J, Cw, d, bf, tf, tw, h, rx, k_des: inputs.k_des };
        } else if (inputs.section_type === 'Rectangular HSS') {
            const { d: H, bf: B, tf: t } = inputs;
            const Ag = 2 * t * (H + B - 2 * t);
            const Ix = (B * H**3 / 12) - ((B - 2*t) * (H - 2*t)**3 / 12);
            const Zx = (B * H**2 / 4) - ((B - 2*t) * (H - 2*t)**2 / 4);
            const Sx = Ix / (H / 2);
            const Iy = (H * B**3 / 12) - ((H - 2*t) * (B - 2*t)**3 / 12); // Strong axis for ry
            const ry = Math.sqrt(Iy / Ag); // ry is weak axis for compression check
            const Sy = Iy / (B / 2);
            const Zy = (H * B**2 / 4) - ((H - 2*t) * (B - 2*t)**2 / 4);
            const h = H - 2 * t;
            const rx = Math.sqrt(Ix / Ag);
            return { type: 'Rectangular HSS', Ag, Ix, Sx, Zx, Iy, Sy, Zy, ry, h, d: H, tw: t, tf: t, bf: B, rx, k_des: inputs.k_des };
        } else if (inputs.section_type === 'HSS/Pipe (Circular)') {
            const { d: OD, bf: t } = inputs; // bf is used for thickness in UI
            const ID = OD - 2 * t;
            const Ag = (Math.PI / 4) * (OD**2 - ID**2);
            const Ix = (Math.PI / 64) * (OD**4 - ID**4);
            const Sx = Ix / (OD / 2);
            const Zx = (OD**3 - ID**3) / 6;
            const ry = Math.sqrt(Ix / Ag); // r = ry = rx
            const J = (Math.PI / 32) * (OD**4 - ID**4);
            const rx = ry;
            return { type: 'HSS-round', Ag, Ix, Sx, Zx, Iy: Ix, Sy: Sx, Zy: Zx, ry, J, d: OD, tf: t, rx, k_des: inputs.k_des, bf: OD };
        } else if (inputs.section_type === 'channel') {
            // Simplified properties for a standard channel. x_bar is a critical missing input.
            // For a real tool, this would come from a database.
            const { d, bf, tf, tw } = inputs;
            const Ag = 2 * bf * tf + (d - 2 * tf) * tw;
            const Ix = (bf * d**3 / 12) - ((bf - tw) * (d - 2 * tf)**3 / 12); // Approx
            const x_bar = 0.7; // Placeholder for shear center, MUST be user input or from DB
            const Iy = (2 * tf * bf**3 / 12) + ((d - 2 * tf) * tw**3 / 12) + Ag * x_bar**2; // Approx
            const ry = Math.sqrt(Iy/Ag);
            const rx = Math.sqrt(Ix/Ag);
            return { type: 'channel', Ag, Ix, Iy, rx, ry, d, bf, tf, tw, x_bar, J: (1/3) * (2 * bf * tf**3 + (d - 2 * tf) * tw**3) };
        } else if (inputs.section_type === 'angle') {
            const { d: L1, bf: L2, tf: t } = inputs; // d=long leg, bf=short leg, tf=thickness
            const Ag = (L1 + L2 - t) * t;
            // Properties for angles are complex (principal axes). Using geometric for now.
            return { type: 'angle', Ag, d: L1, bf: L2, tf: t, tw: t, J: (1/3)*(L1+L2)*t**3 };
        }
        return {}; // Should not happen
    }

    function getDesignFactor(design_method, phi, omega) {
        if (design_method === 'LRFD') return phi;
        return 1 / omega; // ASD
    }

    function checkFlexure(props, inputs) {
        if (props.type === 'I-Shape' || props.type === 'channel') return checkFlexure_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round') return checkFlexure_HSS(props, inputs);
        if (props.type === 'angle') return checkFlexure_Angle(props, inputs);
        return { phiMn_or_Mn_omega: 0 };
    }

    function checkFlexure_IShape(props, inputs) {
        const { Fy, E, Cb, Lb_input, K, aisc_standard } = inputs;
        const { Zx, Sx, rts, h, J, Cw, tw, bf, tf, d } = props;
        const Lb = Lb_input * 12; // to inches

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);

        // Slenderness checks
        const lambda_f = bf / (2 * tf);
        const lambda_p_f = 0.38 * Math.sqrt(E / Fy);
        const lambda_r_f = 1.0 * Math.sqrt(E / Fy);
        const isFlangeCompact = lambda_f <= lambda_p_f;

        const lambda_w = h / tw;
        const lambda_p_w = 3.76 * Math.sqrt(E / Fy);
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);
        const isWebCompact = lambda_w <= lambda_p_w;

        const isCompact = isFlangeCompact && isWebCompact; // Section is compact if both flange and web are compact
        const isWebSlender = lambda_w > lambda_r_w; // Used for F5 check
        // --- Limit States ---
        // 1. Yielding (AISC F2.1)
        let Mp = Fy * Zx;
        const Mn_yield = Mp;

        // 2. Lateral-Torsional Buckling (LTB) (AISC F2.2)
        const Lp = 1.76 * rts * Math.sqrt(E / Fy); // F2-5
        let Lr;
        if (aisc_standard === '360-22') {
            // AISC 360-22 Eq. F2-6
            const ho = d - tf;
            const term1 = J / (Sx * ho);
            const term2 = Math.pow(term1, 2);
            const term3 = 6.76 * Math.pow(0.7 * Fy / E, 2);
            Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(term1 + Math.sqrt(term2 + term3));
        } else { // AISC 360-16
            const ho = d - tf;
            const c = 1.0;
            const term_inside_sqrt = Math.pow(J * c / (Sx * ho), 2) + 6.76 * Math.pow(0.7 * Fy / E, 2);
            Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(J * c / (Sx * ho) + Math.sqrt(term_inside_sqrt));
        }

        let Mn_ltb;
        if (Lb <= Lp) {
            Mn_ltb = Mp; // No LTB
        } else if (Lb <= Lr) {
            // AISC F2-2: Inelastic LTB
            Mn_ltb = Cb * (Mp - (Mp - 0.7 * Fy * Sx) * ((Lb - Lp) / (Lr - Lp)));
            Mn_ltb = Math.min(Mn_ltb, Mp);
        } else {
            // AISC F2-3: Elastic LTB
            const ho = d - tf; const c = 1.0;
            const term1 = (Cb * Math.PI**2 * E) / Math.pow(Lb / rts, 2);
            const term2 = Math.sqrt(1 + 0.078 * (J * c / (Sx * ho)) * Math.pow(Lb / rts, 2));
            const Fcr = term1 * term2;
            Mn_ltb = Math.min(Fcr * Sx, Mp);
        }

        // 3. Flange Local Buckling (FLB) (AISC F3.2)
        let Mn_flb;
        const My = Fy * Sx;
        const kc = 4 / Math.sqrt(h / tw);
        const kc_lim = Math.max(0.35, Math.min(0.76, kc));
        const lambda_r_f_kc = 0.95 * Math.sqrt(E / (kc_lim * Fy)); // Updated for accuracy per AISC

        if (isFlangeCompact) {
            Mn_flb = Mp;
        } else if (lambda_f <= lambda_r_f_kc) {
            // Noncompact flange - F3-1
            const ratio = (lambda_f - lambda_p_f) / (lambda_r_f_kc - lambda_p_f);
            Mn_flb = Mp - (Mp - 0.7 * Fy * Sx) * ratio;
        } else {
            // Slender flange - F3-2
            const Fcr_flb = (0.9 * E * kc_lim) / Math.pow(lambda_f, 2);
            Mn_flb = Fcr_flb * Sx;
        }

        // 4. Web Local Buckling (WLB) (AISC F4)
        const Mn_wlb = checkWebLocalBuckling(props, inputs, Mp, My);

        // 5. Compression Flange Yielding (for slender webs, AISC F5)
        let Mn_cfy = Infinity;
        let Rpg = 1.0;
        if (isWebSlender) {
            Mn_cfy = checkSlenderWebFlexure(props, inputs, Mp, My);
            // Adjust Mp for slender web sections per F5.3
            Mp = Math.min(Fy * Zx, Mn_cfy);
        }

        const limit_states = {
            'Yielding (F2.1)': Mn_yield,
            'Lateral-Torsional Buckling (F2.2)': Mn_ltb,
            'Flange Local Buckling (F3)': Mn_flb,
            'Web Local Buckling (F4)': Mn_wlb,
            'Compression Flange Yielding (F5)': Mn_cfy
        };

        const Mn = Math.min(...Object.values(limit_states));
        
        let governing_limit_state = '';
        for (const [name, value] of Object.entries(limit_states)) {
            if (value === Mn) {
                governing_limit_state = name;
                break;
            }
        }

        const phiMn_or_Mn_omega = Mn * factor;

        return {
            phiMn_or_Mn_omega: phiMn_or_Mn_omega / 12, // Corrected to kip-ft (from kip-in)
            isCompact, Mn, Lb, Lp, Lr, Rpg, governing_limit_state,
            reference: "AISC F2, F3, F4, F5",
            slenderness: { lambda_f, lambda_p_f, lambda_r_f, lambda_w, lambda_p_w, lambda_r_w }
        };
    }

    function checkFlexure_HSS(props, inputs) {
        const { Fy, E } = inputs;
        const { Zx, Sx } = props;
        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);

        let isCompact, Mn;
        let slenderness = {};

        if (inputs.section_type === 'Rectangular HSS') {
            // G5: Clear distance between webs
            const h = props.d - 3 * props.tf; // Per AISC G5 commentary
            const lambda = h / props.tf; // h/t
            const lambda_p = 1.12 * Math.sqrt(E / Fy);
            const lambda_r = 1.40 * Math.sqrt(E / Fy);
            isCompact = lambda <= lambda_p;
            slenderness = { lambda, lambda_p, lambda_r };

            const Mp = Fy * Zx;
            if (isCompact) {
                Mn = Mp;
            } else if (lambda <= lambda_r) { // Noncompact
                Mn = Mp - (Mp - Fy * Sx) * ((lambda - lambda_p) / (lambda_r - lambda_p));
            }
        } else { // Round HSS
            const lambda = props.d / props.tf; // D/t
            const lambda_p = 0.07 * (E / Fy);
            const lambda_r = 0.31 * (E / Fy);
            isCompact = lambda <= lambda_p;
            slenderness = { lambda, lambda_p, lambda_r };

            const Mp = Fy * Zx;
            if (isCompact) {
                Mn = Mp;
            } else if (lambda <= lambda_r) { // Noncompact
                Mn = ((0.021 * E) / lambda + Fy) * Sx;
            } else { // Slender
                const Fcr = (0.33 * E) / lambda;
                Mn = Fcr * Sx;
            }
            Mn = Math.min(Mn, Mp);
        }
        const phiMn_or_Mn_omega = Mn * factor;
        return { phiMn_or_Mn_omega: phiMn_or_Mn_omega / 12, isCompact, Mn, slenderness, reference: "AISC F7, F8" };
    }

    function checkFlexure_Angle(props, inputs) {
        const { Fy, E, Cb, Lb_input } = inputs;
        const { Zx, Sx, ry, d, bf, tf } = props; // Using geometric axis properties
        const Lb = Lb_input * 12;

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);

        // F10.1 Yielding
        const My = 1.5 * Fy * Sx; // Using elastic section modulus for geometric axis
        const Mn_yield = My;

        // F10.2 LTB
        // Simplified elastic LTB moment Me for equal-leg angle
        const Me = (0.46 * E * bf**2 * tf**2) / Lb;
        
        let Mn_ltb;
        if (Me <= My) { // Elastic LTB
            Mn_ltb = Me;
        } else { // Inelastic LTB
            Mn_ltb = My * (1 - (0.15 * My / Me));
        }
        
        const Mn = Math.min(Mn_yield, Mn_ltb);
        const governing_limit_state = Mn_yield < Mn_ltb ? 'Yielding (F10.1)' : 'LTB (F10.2)';
        return { phiMn_or_Mn_omega: (Mn * factor) / 12, Mn, governing_limit_state, reference: "AISC F10" };
    }

    function checkFlexureMinorAxisComplete(props, inputs) {
        const { Fy, E, Cb, Lb_input, K } = inputs;
        const { Zy, Sy, Iy, J, Cw, d, bf, tf, tw, type } = props;
        const Lb = Lb_input * 12; // to inches

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);

        // Basic yielding capacity
        const Mpy = Math.min(Fy * Zy, 1.6 * Fy * Sy); // AISC F6.1
        let Mny = Mpy;
        let governing_limit_state = 'Yielding (F6.1)';

        if (type === 'I-Shape' || type === 'channel') {
            // AISC F6 - Doubly symmetric I-shapes and channels bent about minor axis
            // LTB doesn't apply for minor axis bending of doubly symmetric I-shapes
            // Only flange local buckling needs to be checked
            
            const lambda = bf / (2 * tf);
            const lambda_p = 0.38 * Math.sqrt(E / Fy);
            const lambda_r = 1.0 * Math.sqrt(E / Fy);

            if (lambda > lambda_p) {
                // Flange local buckling
                const My = Fy * Sy;
                if (lambda <= lambda_r) {
                    // Noncompact
                    Mny = Mpy - (Mpy - My) * ((lambda - lambda_p) / (lambda_r - lambda_p));
                    governing_limit_state = 'Flange Local Buckling (Noncompact, F6.2)';
                } else {
                    // Slender
                    const Fcr = (0.69 * E) / (lambda * lambda);
                    Mny = Fcr * Sy;
                    governing_limit_state = 'Flange Local Buckling (Slender, F6.3)';
                }
            }
            
        } else if (type === 'angle') { // Not fully implemented in UI, but logic is here
        } else if (type === 'Rectangular HSS') {
            // Rectangular HSS minor axis bending - AISC F7
            const lambda = (bf - 3 * tf) / tf;
            const lambda_p = 1.12 * Math.sqrt(E / Fy);
            const lambda_r = 1.40 * Math.sqrt(E / Fy);
            
            if (lambda > lambda_p) {
                const My = Fy * Sy;
                if (lambda <= lambda_r) {
                    // Noncompact
                    Mny = Mpy - (Mpy - My) * ((lambda - lambda_p) / (lambda_r - lambda_p));
                    governing_limit_state = 'Wall Local Buckling (Noncompact, F7)';
                } else {
                    // Slender
                    const Fcr = (0.69 * E) / (lambda * lambda);
                    Mny = Fcr * Sy;
                    governing_limit_state = 'Wall Local Buckling (Slender, F7)';
                }
            }
        }

        // Apply safety factor
        const phiMny_or_Mny_omega = (Mny * factor) / 12; // to kip-ft
        
        return { phiMny_or_Mny_omega, Mny, governing_limit_state, reference: "AISC F6/F7" };
    }

    function checkCompression(props, inputs) {
        // This is general for all doubly symmetric members, so it works for I-shapes and HSS
        const { Fy, E, K, Lb_input, aisc_standard } = inputs;
        const { Ag, ry, Ix, Iy, J, Cw, type, d, bf, tf, tw, h, x_bar } = props;
        const Lc = K * Lb_input * 12; // to inches
        const G = E / (2 * (1 + 0.3)); // Shear Modulus

        const phi_c = 0.9;
        const omega_c = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_c, omega_c);

        // Calculate reduction factor Q for slender elements (AISC E7)
        let Q = 1.0;
        if (type === 'I-Shape' || !type) {
            // Flange (unstiffened)
            const kc = 4 / Math.sqrt(h / tw);
            const kc_lim = Math.max(0.35, Math.min(0.76, kc));
            const lambda_f = bf / (2 * tf);
            const lambda_r_f = 0.64 * Math.sqrt(kc_lim * E / Fy);
            let Qs = 1.0;
            if (lambda_f > lambda_r_f) {
                Qs = 0.90 * E * kc_lim / (Fy * lambda_f**2);
            }
            
            // Web (stiffened)
            const lambda_w = h / tw;
            const lambda_r_w = 1.49 * Math.sqrt(E / Fy);
            let Qa = 1.0;
            if (lambda_w > lambda_r_w) {
                const term = Math.sqrt(E / Fy);
                const be = 1.92 * tw * term * (1 - 0.34 / lambda_w * term);
                Qa = Math.min(be / h, 1.0);
            }
            
            Q = Qs * Qa;
        } else if (type === 'Rectangular HSS') {
            const hss_local = checkHSSLocalBuckling(props, inputs); // This function needs to be defined or integrated
            Q = hss_local.reduction_factor || 1.0;
        } else if (type === 'HSS-round') {
            const lambda = d / tf;
            const lambda_r = 0.11 * E / Fy;
            const lambda_max = 0.45 * E / Fy;
            if (lambda <= lambda_r) {
                Q = 1.0;
            } else if (lambda <= lambda_max) {
                Q = 0.038 * E / (Fy * lambda) + 2/3;
            } else {
                Q = 0.33 * E / (Fy * lambda**2);
            }
        }

        let Fe, buckling_mode;

        // Per AISC E4, determine the governing elastic buckling stress Fe
        const rx = props.rx || Math.sqrt(Ix / Ag);
        const slenderness_x = (Lc / rx);
        const slenderness_y = (Lc / ry);
        const Fey = (Math.PI**2 * E) / (slenderness_y**2); // Minor axis typically governs flexural

        if (type === 'I-Shape' || type === 'Rectangular HSS' || type === 'HSS-round' || !type) { // Doubly symmetric
            const Kz = K; // Assume same as flexural K for torsional
            const Lz = Lc;
            const Fez_num = (Math.PI**2 * E * Cw) / ((Kz * Lz)**2) + (G * J);
            const Fez_den = Ix + Iy;
            const Fez = Fez_num / Fez_den;
            
            const Fex = (Math.PI**2 * E) / (slenderness_x**2);
            const Fe_flex = Math.min(Fex, Fey);
            
            if (Fe_flex <= Fez) {
                Fe = Fe_flex;
                buckling_mode = 'Flexural Buckling (E3)';
            } else {
                Fe = Fez;
                buckling_mode = 'Torsional Buckling (E4)';
            }
        } else if (type === 'channel' || type === 'angle') { // Singly symmetric
            const rx = props.rx || Math.sqrt(Ix / Ag);
            const Fex = (Math.PI**2 * E) / Math.pow(Lc / rx, 2);
            const Fey = (Math.PI**2 * E) / Math.pow(Lc / ry, 2);
            
            // Shear center coords relative to centroid. For channel, yo=0. For angle, both are non-zero.
            const xo = x_bar || 0; // Use property if available, else 0
            const yo = 0; // Placeholder for angle
            const ro_sq = xo**2 + yo**2 + (Ix + Iy)/Ag;
            
            const H = 1 - (xo**2 + yo**2)/ro_sq;
            const Fez = ( (Math.PI**2 * E * Cw) / (Lz**2) + G*J ) / (Ag * ro_sq);

            // Root of quadratic equation for Fe (AISC E4-4)
            Fe = ((Fex + Fez) / (2*H)) * (1 - Math.sqrt(1 - (4*Fex*Fez*H) / (Fex+Fez)**2));
            buckling_mode = 'Flexural-Torsional Buckling (E4)';
        } else { // Unsymmetric (or other)
            Fe = Fey; // Default to weak axis flexural buckling
            buckling_mode = 'Flexural Buckling (E3) - FTB not implemented for this shape';
        }

        const Fyr = Q * Fy; // Effective yield for slender elements
        const Fcr_ratio = Fyr / Fe;

        let Fcr;
        if (Fcr_ratio <= 2.25) {
            Fcr = Math.pow(0.658, Fcr_ratio) * Fyr;
        } else {
            Fcr = 0.877 * Fe;
        }

        const Pn = Fcr * Ag;
        const phiPn_or_Pn_omega = Pn * factor;
        
        return {
            phiPn_or_Pn_omega: phiPn_or_Pn_omega, // in kips
            Pn, Fcr, Fe, buckling_mode, Q,
            reference: "AISC E3, E4, E7"
        };
    }

    function checkTension(props, inputs) {
        const { Fy, Fu } = inputs;
        const { Ag } = props;

        // Limit State 1: Yielding on Gross Section (AISC D2a)
        const Pn_yield = Fy * Ag;
        const phi_ty = 0.90;
        const omega_ty = 1.67;
        const factor_yield = getDesignFactor(inputs.design_method, phi_ty, omega_ty);
        const cap_yield = Pn_yield * factor_yield;

        // Limit State 2: Rupture on Net Section (AISC D2b)
        // Assuming full beam analysis, An = Ag and U = 1.0
        const An_net = Ag;
        const Ae = 1.0 * An_net;
        const Pn_rupture = Fu * Ae;
        const phi_tr = 0.75;
        const omega_tr = 2.00;
        const factor_rupture = getDesignFactor(inputs.design_method, phi_tr, omega_tr);
        const cap_rupture = Pn_rupture * factor_rupture;

        const governing_capacity = Math.min(cap_yield, cap_rupture);
        const governing_limit_state = cap_yield < cap_rupture ? 'Yielding' : 'Rupture';

        return {
            phiPn_or_Pn_omega: governing_capacity, // in kips
            governing_limit_state,
            reference: "AISC D2",
            details: { 
                yield: { Pn: Pn_yield, capacity: cap_yield },
                rupture: { Pn: Pn_rupture, capacity: cap_rupture, Ae }
            }
        };
    }

    function checkShear(props, inputs) {
        if (props.type === 'I-Shape' || props.type === 'channel') return checkShear_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round') return checkShear_HSS(props, inputs);
        return { phiVn_or_Vn_omega: 0 };
    }

    function checkShear_IShape(props, inputs) {
        const { Fy, E, aisc_standard } = inputs;
        const { d, tw, h } = props;
        const Aw = d * tw;
        
        const phi_v = 0.9; // for I-shapes
        const omega_v = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_v, omega_v);
        const h_tw = h / tw;
        const kv = 5.34; // for unstiffened webs; user may adjust for stiffened if UI added
        
        let Vn, Cv, governing_limit_state;

        if (aisc_standard === '360-22') { // AISC 360-22 Section G2.1
            if (h_tw <= 2.24 * Math.sqrt(E / Fy)) {
                Cv = 1.0;
            } else if (h_tw <= 1.51 * Math.sqrt(kv * E / Fy)) {
                Cv = (2.24 * Math.sqrt(E / Fy)) / h_tw;
                governing_limit_state = 'Inelastic Web Buckling (G2-2)';
            } else {
                Cv = (1.51 * kv * E) / (Fy * h_tw * h_tw);
                governing_limit_state = 'Elastic Web Buckling (G2-3)';
            }
            Vn = 0.6 * Fy * Aw * Cv;
        } else { // AISC 360-16
            const C_v1_limit = 2.24 * Math.sqrt(E / Fy);
            if (h_tw <= C_v1_limit) {
                Cv = 1.0;
                governing_limit_state = 'Shear Yielding (G2-1)';
            } else {
                const C_v2_limit = 1.37 * Math.sqrt(kv * E / Fy);
                if (h_tw <= C_v2_limit) {
                    Cv = C_v1_limit / h_tw;
                    governing_limit_state = 'Inelastic Web Buckling (G2-2)';
                } else {
                    Cv = (1.51 * E * kv) / (h_tw**2 * Fy);
                    governing_limit_state = 'Elastic Web Buckling (G2-3)';
                }
            }
            Vn = 0.6 * Fy * Aw * Cv;
        }
        
        const phiVn_or_Vn_omega = Vn * factor;
        return {
            phiVn_or_Vn_omega: phiVn_or_Vn_omega, // in kips
            Vn, Cv, h_tw, governing_limit_state,
            reference: "AISC G2"
        };
    }

    function checkShear_HSS(props, inputs) {
        const { Fy, E } = inputs;
        const phi_v = inputs.section_type === 'Rectangular HSS' ? 0.9 : 1.0; // G6 uses phi=1.0
        const omega_v = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_v, omega_v);

        let Vn, Cv = 1.0, h_tw = 0, Aw, governing_limit_state;

        if (inputs.section_type === 'Rectangular HSS') {
            // G5: Clear distance between webs
            const h = props.d - 3 * props.tf; // Per AISC G5 commentary
            h_tw = h / props.tf; // h/t
            const kv = 5.0; // For unstiffened webs
            
            // Shear area - both webs contribute  
            Aw = 2 * props.tf * props.d; // Total shear area
            
            const limit1 = 2.24 * Math.sqrt(E / Fy);
            const limit2 = 1.40 * Math.sqrt(kv * E / Fy);
            
            if (h_tw <= limit1) {
                // G5-2a: Shear yielding
                Cv = 1.0;
                governing_limit_state = 'Shear Yielding (G5-2a)';
            } else if (h_tw <= limit2) {  
                // G5-2b: Inelastic buckling
                Cv = limit1 / h_tw;
                governing_limit_state = 'Inelastic Web Buckling (G5-2b)';
            } else {
                // G5-3: Elastic buckling  
                Cv = (1.51 * kv * E) / (Fy * h_tw * h_tw);
                governing_limit_state = 'Elastic Web Buckling (G5-3)';
            }
            Vn = 0.6 * Fy * Aw * Cv;
        } else { // Round HSS
            // AISC G6 - Shear for Circular HSS
            const D_t = props.d / props.tf;
            const Fcr_yield = 0.6 * Fy;
            const Fcr_buckling1 = (1.60 * E) / (Math.sqrt(D_t) * Math.pow(D_t, 5/4));
            const Fcr_buckling2 = (0.78 * E) / Math.pow(D_t, 3/2);
            const Fcr = Math.min(Math.max(Fcr_buckling1, Fcr_buckling2), Fcr_yield);
            
            if (Fcr < Fcr_yield) {
                governing_limit_state = 'Shear Buckling (G6)';
            } else {
                governing_limit_state = 'Shear Yielding (G6)';
            }
            Vn = Fcr * (props.Ag / 2);
        }
        const phiVn_or_Vn_omega = Vn * factor;
        return { phiVn_or_Vn_omega: phiVn_or_Vn_omega, Vn, Cv, h_tw, governing_limit_state, reference: "AISC G5, G6" }; // to kips
    }

    function calculateB1Factor(inputs, props, axis) {
        const { K, Lb_input, E, design_method, Pu_or_Pa, Cm } = inputs;
        const { Ag, Ix, Iy, ry } = props; // Ix for major, Iy for minor
        
        const L = Lb_input * 12; // inches
        const rx = Math.sqrt(Ix / Ag);
        const r = axis === 'x' ? rx : ry;
        
        // C2-1: Required axial strength
        const Pr = Math.abs(Pu_or_Pa);
        if (Pr === 0) return 1.0;
        
        // Pe calculation with safety check
        const Pe_num = Math.PI**2 * E * (axis === 'x' ? Ix : Iy);
        const Pe_denominator = Math.pow(K * L, 2);
        if (Pe_denominator === 0) return 1.0;
        const Pe = Pe_num / Pe_denominator;
        if (Pe <= 0) return 10.0; // Instability
        
        // C2-3 with proper alpha and safety checks
        const alpha = design_method === 'LRFD' ? 1.0 : 1.6;
        const ratio = (alpha * Pr) / Pe;
        
        // Check for instability
        if (ratio >= 1.0 || (1.0 - ratio) <= 0) {
            console.warn(`B1 factor indicates potential instability: α*Pr/Pe = ${ratio.toFixed(3)}`);
            return 10.0; // Large but finite to avoid infinity
        }
        const B1 = Cm / (1.0 - ratio);
        
        return Math.max(B1, 1.0); // B1 >= 1.0
    }

    function checkInteraction(inputs, props, comp_results, flex_results_x, flex_results_y) {
        const { Pu_or_Pa, Mux_or_Max, Muy_or_May, design_method } = inputs;
        
        const Pr = Math.abs(Pu_or_Pa);
        const Mrx = Math.abs(Mux_or_Max);
        const Mry = Math.abs(Muy_or_May);
        
        const Pc = comp_results.phiPn_or_Pn_omega;
        const Mcx = flex_results_x.phiMn_or_Mn_omega;
        const Mcy = flex_results_y.phiMny_or_Mny_omega || 0;
        
        // AISC H1.1
        const B1x = calculateB1Factor(inputs, props, 'x');
        const B1y = calculateB1Factor(inputs, props, 'y');
        
        let ratio, equation;
        const pr_pc = Pc > 0 ? Pr / Pc : 0;
        
        if (pr_pc >= 0.2) {
            // H1-1a
            ratio = pr_pc + (8.0/9.0) * ((B1x * Mrx / Mcx) + (B1y * Mry / Mcy));
            equation = 'H1-1a';
        } else {
            // H1-1b  
            ratio = (pr_pc / 2.0) + ((B1x * Mrx / Mcx) + (B1y * Mry / Mcy));
            equation = 'H1-1b';
        }
        
        return { 
            ratio, 
            equation, 
            reference: "AISC H1.1",
            details: { B1x, B1y }
        };
    }

    function checkShearTorsionInteraction(props, inputs, shear_results, torsion_results) {
        if (inputs.Tu_or_Ta === 0) {
            return { applicable: false };
        }

        const Vr = Math.abs(inputs.Vu_or_Va);
        const Tr = Math.abs(inputs.Tu_or_Ta);
        const Vc = shear_results.phiVn_or_Vn_omega;
        const Tc = torsion_results.phiTn_or_Tn_omega;

        let ratio;
        if (inputs.section_type === 'Rectangular HSS' || inputs.section_type === 'HSS-round') {
            // H3.2 for HSS: Square root interaction
            ratio = Math.sqrt(Math.pow(Vc > 0 ? Vr / Vc : 0, 2) + Math.pow(Tc > 0 ? Tr / Tc : 0, 2));
        } else {
            // For non-HSS (e.g., I-shapes), keep linear as simplified per DG9 approximation
            ratio = (Vc > 0 ? Vr / Vc : 0) + (Tc > 0 ? Tr / Tc : 0);
        }

        return { applicable: true, ratio, reference: "AISC H3.2 (HSS) or DG9 Approx (non-HSS)" };
    }

    function checkCombinedStressH33(props, inputs, torsion_results) {
        if (inputs.section_type !== 'I-Shape' || inputs.Tu_or_Ta === 0 || !torsion_results.details) {
            return { applicable: false };
        }
    
        const { Fy, design_method, Pu_or_Pa, Mux_or_Max, Muy_or_May, Vu_or_Va } = inputs;
        const { Ag, Sx, Sy, tw, d } = props;
        const { sigma_w, tau_sv } = torsion_results.details;

        // Required stresses
        const fa = Math.abs(Pu_or_Pa) / Ag;
        const fbx = Math.abs(Mux_or_Max) * 12 / Sx;
        const fby = Math.abs(Muy_or_May) * 12 / Sy;
        const fv = Math.abs(Vu_or_Va) / (d * tw); // Approx. shear stress on web

        // Total stresses at critical point (flange-web junction)
        const total_normal_stress = fa + fbx + fby + sigma_w;
        const total_shear_stress = fv + tau_sv;

        let ratio;
        let capacity;
        if (design_method === 'LRFD') {
            // H3-6a: (fa + fb)^2 + 3(fv + fvt)^2 <= (phi*Fy)^2
            const phi = 0.90;
            capacity = phi * Fy;
            const required_stress = Math.sqrt(Math.pow(total_normal_stress, 2) + 3 * Math.pow(total_shear_stress, 2));
            ratio = required_stress / capacity;
        } else { // ASD
            // H3-6b: sqrt((fa + fb)^2 + 3(fv + fvt)^2) <= Fy/Omega
            const Omega = 1.67;
            capacity = Fy / Omega;
            const required_stress = Math.sqrt(Math.pow(total_normal_stress, 2) + 3 * Math.pow(total_shear_stress, 2));
            ratio = required_stress / capacity;
        }

        return {
            applicable: true,
            ratio,
            reference: "AISC H3.3",
            details: {
                total_normal_stress,
                total_shear_stress,
                capacity
            }
        };
    }

    function checkTorsionComplete(props, inputs) {
        const { Tu_or_Ta, Fy, E, Lb_input, design_method } = inputs;
        const { J, Cw, d, tf, type, Ag } = props;
        
        if (Tu_or_Ta === 0) return { applicable: false };

        if (type === 'HSS-round' || type === 'Rectangular HSS') {
            return checkTorsion_HSS(props, inputs);
        }
        
        if (type !== 'I-Shape' && type !== 'channel') {
            return { 
                applicable: true, 
                phiTn_or_Tn_omega: 0, 
                governing_limit_state: 'Not Implemented', 
                reference: 'N/A',
                details: { sigma_w: 0, tau_sv: 0, beta: 0 }
            };
        }

        // --- Torsion for Open Sections (I-Shape, Channel) ---
        // This is a complex check based on DG9 and Chapter H.
        // The following is an enhanced approximation.

        const G = E / (2 * (1 + 0.3)); // Shear modulus
        const L = Lb_input * 12; // inches
        const alpha = Math.sqrt(G * J / (E * Cw));
        const beta = alpha * L;
        
        const phi_T = 0.9;
        const omega_T = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_T, omega_T);
        
        // Assume uniform distributed torque m = Tu_or_Ta / L (kip-in per in)
        const m = Tu_or_Ta / L;
        
        // Approximate max warping normal stress (enhanced from DG9 approximations)
        const Wns = (props.bf * (d - tf)) / 4; // Warping statical moment at flange tip
        const sigma_w = (E * Wns * Tu_or_Ta) / (E * Cw * alpha**2 * Math.cosh(alpha * L / 2)); // Simplified for midspan of fixed-end

        // St. Venant shear stress (max at surface)
        const tau_sv = (G * tf * Tu_or_Ta) / (J * alpha * Math.cosh(alpha * L / 2)); // Simplified
        
        const tau_y = 0.6 * Fy;
        
        // Nominal Torsional Strength per H3.1
        // T_n is the lesser of torsional yielding or torsional buckling
        const Tn_yield = tau_y * J; // Simplified, should be based on stress state
        const Tn_buckling = (sigma_w > 0.7 * Fy) ? (0.7 * Fy * Cw) / Wns : Infinity; // Simplified buckling check
        const Tn = Math.min(Tn_yield, Tn_buckling);
        
        return {
            applicable: true,
            phiTn_or_Tn_omega: Tn * factor,
            governing_limit_state: Tn_buckling < Tn_yield ? 'Warping Buckling' : 'Torsional Yielding',
            Tn,
            details: { sigma_w, tau_sv, beta },
            reference: "AISC Design Guide 9 (enhanced with warping stress check)"
        };
    }

    function checkTorsion_HSS(props, inputs) {
        const { Tu_or_Ta, Fy, E, design_method } = inputs;
        const { type, d, bf, tf, Ag } = props;

        const phi_T = 0.9;
        const omega_T = 1.67;
        const factor = getDesignFactor(design_method, phi_T, omega_T);

        let Tn, governing_limit_state;

        if (type === 'Rectangular HSS') {
            // AISC H3.2 for Rectangular HSS
            const h = d - 3 * tf;
            const b = bf - 3 * tf;
            const C = 2 * (h + b) * tf; // Torsional constant from shear flow
            const Fcr_yield = 0.6 * Fy;
            // Buckling check (simplified)
            const h_t = h / tf;
            const Fcr_buckling = (h_t > 2.45 * Math.sqrt(E/Fy)) ? (0.6 * Fy * (2.45 * Math.sqrt(E/Fy)) / h_t) : Fcr_yield;
            const Fcr = Math.min(Fcr_yield, Fcr_buckling);
            Tn = Fcr * C;
            governing_limit_state = Fcr < Fcr_yield ? 'Torsional Buckling (H3)' : 'Torsional Yielding (H3)';
        } else { // HSS-round
            // AISC H3.1 for Round HSS
            const D_t = d / tf;
            const Fcr_yield = 0.6 * Fy;
            const Fcr_buckling1 = (1.23 * E) / (Math.sqrt(D_t) * Math.pow(D_t, 5/4));
            const Fcr_buckling2 = (0.60 * E) / Math.pow(D_t, 3/2);
            const Fcr = Math.min(Math.max(Fcr_buckling1, Fcr_buckling2), Fcr_yield);
            const C = (Math.PI * (d - tf)**2 * tf) / 2; // Torsional constant
            Tn = Fcr * C;
            governing_limit_state = Fcr < Fcr_yield ? 'Torsional Buckling (H3)' : 'Torsional Yielding (H3)';
        }

        return { applicable: true, phiTn_or_Tn_omega: Tn * factor, governing_limit_state, reference: "AISC H3", details: { sigma_w: 0, tau_sv: 0, beta: 0 } };
    }

    function checkWebCrippling(props, inputs) {
        const { Fy, E, lb_bearing, is_end_bearing, k_des } = inputs;
        const { d, tf, tw } = props;

        const phi = 0.75;
        const omega = 2.00;
        const factor = getDesignFactor(inputs.design_method, phi, omega);

        // --- Web Local Yielding (AISC J10.2) ---
        const N_lb = lb_bearing;
        const k_dist = is_end_bearing ? 2.5 * k_des : 5 * k_des;
        const Rn_yield = (N_lb + k_dist) * Fy * tw;

        // --- Web Local Crippling (AISC J10.3) ---
        let Rn_crippling;
        const common_term = Math.sqrt((E * Fy * tf) / tw);

        if (is_end_bearing) {
            // Eq. J10-4
            if ((N_lb / d) <= 0.2) {
                Rn_crippling = 0.80 * tw**2 * (1 + 3 * (N_lb / d) * (tw / tf)**1.5) * common_term;
            } else {
                Rn_crippling = 0.80 * tw**2 * (1 + (3 * N_lb / d - 0.2) * (tw / tf)**1.5) * common_term;
            }
        } else { // Interior load
            // Eq. J10-5
            if ((N_lb / d) <= 0.2) {
                Rn_crippling = 0.40 * tw**2 * (1 + 3 * (N_lb / d) * (tw / tf)**1.5) * common_term;
            } else {
                Rn_crippling = 0.40 * tw**2 * (1 + (2.4 * N_lb / d - 0.2) * (tw / tf)**1.5) * common_term;
            }
        }

        const Rn = Math.min(Rn_yield, Rn_crippling);
        const governing_state = Rn_yield < Rn_crippling ? 'Web Local Yielding (J10.2)' : 'Web Local Crippling (J10.3)';

        return {
            phiRn_or_Rn_omega: Rn * factor, // in kips
            reference: "AISC J10.2 & J10.3",
            governing_state,
            details: { Rn_yield, Rn_crippling, N_lb, k_des }
        };
    }

    function checkSlenderWebFlexure(props, inputs, Mp, My) {
        const { Fy, E } = inputs;
        const { h, tw, bf, tf, Sx } = props;

        const lambda_w = h / tw;
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);

        // F5-6: Web plastification factor
        const aw = (h * tw) / (bf * tf);
        let Rpg;

        const term = (lambda_w - lambda_r_w);
        if (aw <= 10) {
            // F5-6a
            Rpg = 1.0 - (aw / (1200 + 300 * aw)) * term;
        } else {
            // F5-6b
            Rpg = 1.0 - (aw / (1200 + 300 * aw)) * term;
        }
        
        Rpg = Math.max(Rpg, 0.0);
        
        // F5-1: Compression flange yielding
        return Rpg * Fy * Sx;
    }

    function checkWebLocalBuckling(props, inputs, Mp, My) {
        const { Fy, E } = inputs;
        const { h, tw, bf, tf } = props;
        
        const lambda_w = h / tw;
        const lambda_p_w = 3.76 * Math.sqrt(E / Fy);
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);
        
        if (lambda_w <= lambda_p_w) {
            return Mp;
        } else if (lambda_w <= lambda_r_w) {
            // Noncompact web - F4.1
            const aw = (h * tw) / (bf * tf); // Web area / compression flange area
            
            let Rpc;
            if (aw <= 10) {
                Rpc = Mp / My; // F4-9a
            } else {
                Rpc = (Mp / My) - ((Mp / My) - 1.0) * ((lambda_w - lambda_p_w) / (lambda_r_w - lambda_p_w)); // F4-9b corrected
            }
            
            // F4-1: Noncompact web strength
            const ratio = (lambda_w - lambda_p_w) / (lambda_r_w - lambda_p_w);
            return Rpc * (Mp - (Mp - 0.7 * Fy * props.Sx) * ratio);
            
        } else {
            // Slender web - F5 provisions apply
            return checkSlenderWebFlexure(props, inputs, Mp, My);
        }
    }

    function checkHSSLocalBuckling(props, inputs) {
        const { Fy, E } = inputs;
        const { d, bf, tf, type } = props;
        
        if (type !== 'HSS') return { applicable: false };

        // AISC Table B4.1a - Case 6 and 12
        const h = d - 3 * tf; // Clear height
        const b = bf - 3 * tf; // Clear width
        const h_t = h / tf;
        const b_t = b / tf;
        
        // Slenderness limits
        const lambda_p = 1.12 * Math.sqrt(E / Fy); // Compact limit
        const lambda_r = 1.40 * Math.sqrt(E / Fy); // Noncompact limit
        
        // Check flange local buckling
        const flange_slender = b_t > lambda_r;
        const flange_noncompact = b_t > lambda_p && b_t <= lambda_r;
        const flange_compact = b_t <= lambda_p;
        
        // Check web local buckling  
        const web_slender = h_t > lambda_r;
        const web_noncompact = h_t > lambda_p && h_t <= lambda_r;
        const web_compact = h_t <= lambda_p;
        
        // Reduction factors for slender elements
        let Qs = 1.0; // Stiffened element reduction
        let Qa = 1.0; // Unstiffened element reduction
        
        if (flange_slender) {
            // AISC E7.2 - Unstiffened elements
            const f = Fy; // Use Fy for compression
            const kc = 4 / Math.sqrt(h_t); // Between 0.35 and 0.76
            const kc_lim = Math.max(0.35, Math.min(0.76, kc));
            
            if (b_t > 1.03 * Math.sqrt(kc_lim * E / f)) {
                Qs = (0.69 * E) / (f * Math.pow(b_t, 2));
            } else {
                Qs = 1.415 - 0.65 * b_t * Math.sqrt(f / (kc_lim * E));
            }
            Qs = Math.max(Qs, 0.0);
        }
        
        if (web_slender) {
            // AISC E7.2 - Stiffened elements
            const f = Fy;
            if (h_t > 1.49 * Math.sqrt(E / f)) {
                Qa = (0.90 * E) / (f * Math.pow(h_t, 2));
            } else {
                Qa = 1.0;
            }
        }
        
        const Q = Qs * Qa; // Overall reduction factor
        
        return {
            applicable: true,
            flange: { b_t, lambda_p, lambda_r, compact: flange_compact, noncompact: flange_noncompact, slender: flange_slender },
            web: { h_t, lambda_p, lambda_r, compact: web_compact, noncompact: web_noncompact, slender: web_slender },
            reduction_factor: Q,
            is_slender: flange_slender || web_slender,
            reference: "AISC Table B4.1a, E7"
        };
    }

    function validateInputs(inputs) {
        const errors = [];
        const warnings = [];
        
        // Basic validations
        if (inputs.Fy <= 0 || inputs.Fy > 100) {
            errors.push("Yield Strength (Fy) must be between 0 and 100 ksi.");
        }
        // Check for realistic steel grades
        if (inputs.Fy < 36 || inputs.Fy > 80) {
            warnings.push("Unusual steel grade. Verify Fy value.");
        }

        if (inputs.Fu <= inputs.Fy) {
            errors.push("Ultimate Strength (Fu) must be greater than Fy.");
        }
        if (inputs.E <= 0 || inputs.E > 50000) {
            errors.push("Modulus of Elasticity (E) should be around 29,000 ksi for steel.");
        }
        
        // Geometry validations
        if (inputs.d <= 0) errors.push("Section depth must be positive.");
        if (inputs.tf <= 0) errors.push("Flange thickness must be positive.");
        
        // Load validations
        if (Math.abs(inputs.Pu_or_Pa) > 10000) {
            warnings.push("Very high axial load - verify units (kips expected).");
        }
        if (Math.abs(inputs.Mux_or_Max) > 10000) {
            warnings.push("Very high moment - verify units (kip-ft expected).");
        }
        
        return { errors, warnings };
    }

    function run(inputs) {
        const { errors, warnings } = validateInputs(inputs);
        if (errors.length > 0) return { errors, warnings };

        const props = getSectionProperties(inputs);
        
        // Enhanced checks
        // const hss_local_buckling = checkHSSLocalBuckling(props, inputs);
        const flex_results_y = checkFlexureMinorAxisComplete(props, inputs);
        const torsion_results = checkTorsionComplete(props, inputs);

        let axial_results = {};
        if (inputs.Pu_or_Pa > 0) { // Tension
            axial_results = checkTension(props, inputs);
            axial_results.type = 'Tension';
        } else if (inputs.Pu_or_Pa < 0) { // Compression
            axial_results = checkCompression(props, inputs);
            axial_results.type = 'Compression';
        }

        const flex_results = checkFlexure(props, inputs);
        const shear_results = checkShear(props, inputs);
        const web_crippling_results = checkWebCrippling(props, inputs);
        const combined_stress_H33 = checkCombinedStressH33(props, inputs, torsion_results);
        const shear_torsion_interaction = checkShearTorsionInteraction(props, inputs, shear_results, torsion_results);

        let interaction_results = {};
        if (inputs.Pu_or_Pa < 0 && (inputs.Mux_or_Max !== 0 || inputs.Muy_or_May !== 0)) { // Interaction for compression + moment
            interaction_results = checkInteraction(inputs, props, axial_results, flex_results, flex_results_y);
        }

        // Deflection Check (Serviceability)
        let deflection_results = {};
        if (inputs.deflection_span > 0 && inputs.deflection_limit > 0) {
            const L_span_in = inputs.deflection_span * 12; // Convert ft to inches
            const actual_deflection = inputs.actual_deflection_input;
            const allowable_deflection = L_span_in / inputs.deflection_limit;

            deflection_results = {
                actual: actual_deflection,
                allowable: allowable_deflection,
                ratio: allowable_deflection > 0 ? actual_deflection / allowable_deflection : Infinity
            };
        }

        return {
            inputs,
            properties: props,
            warnings,
            // hss_local_buckling,
            flexure: flex_results,
            flexure_y: flex_results_y,
            shear: shear_results,
            axial: axial_results,
            web_crippling: web_crippling_results,
            interaction: interaction_results,
            combined_stress_H33,
            shear_torsion_interaction,
            torsion: torsion_results,
            deflection: deflection_results
        };
    }
    return { run };
})(); // steelChecker

function renderSteelResults(results) {
    const resultsContainer = document.getElementById('steel-results-container');

    // Early exit if there are errors, preventing crashes.
    if (results.errors && results.errors.length > 0) {
        resultsContainer.innerHTML = `
            <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md my-4">
                <p class="font-bold">Input Errors Found:</p>
                <ul class="list-disc list-inside mt-2">${results.errors.map(e => `<li>${e}</li>`).join('')}</ul>
                <p class="mt-2">Please correct the errors and run the check again.</p>
            </div>`;
        return;
    }

    const { inputs, properties, warnings, flexure, flexure_y, axial, shear, web_crippling, interaction, torsion, deflection, shear_torsion_interaction, combined_stress_H33 } = results;
    const method = inputs.design_method;
    const Pu = Math.abs(inputs.Pu_or_Pa);
    const Mux = inputs.Mux_or_Max;
    const Vu = inputs.Vu_or_Va;

    const axial_cap = axial.phiPn_or_Pn_omega || 0;
    const flex_cap = flexure.phiMn_or_Mn_omega;
    const shear_cap = shear.phiVn_or_Vn_omega;
    const torsion_cap = torsion.phiTn_or_Tn_omega || 0;

    const axial_ratio = axial_cap > 0 ? Pu / axial_cap : Infinity;
    const flex_ratio = flex_cap > 0 ? Mux / flex_cap : Infinity;
    const shear_ratio = shear_cap > 0 ? Vu / shear_cap : Infinity;
    const torsion_ratio = torsion_cap > 0 ? Math.abs(inputs.Tu_or_Ta) / torsion_cap : Infinity;
    const deflection_ratio = deflection.ratio || Infinity;

    const getStatus = (ratio) => ratio <= 1.0 ? `<td class="pass">Pass</td>` : `<td class="fail">Fail</td>`;

    const f_sl = flexure.slenderness;
    const cap_prefix = method === 'LRFD' ? 'φ' : '1/Ω * ';
    resultsContainer.innerHTML = `
        ${(results.errors && results.errors.length > 0) ? `
            <!-- This block is now handled at the top of the function -->
        ` : `
        ${(warnings && warnings.length > 0) ? `
            <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-md my-4 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-600">
                <p class="font-bold">Input Warnings:</p>
                <ul class="list-disc list-inside mt-2">${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>
        ` : ''}
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-4">
            <div class="flex justify-end gap-2 -mt-2 -mr-2">
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm print-hidden">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm print-hidden">Copy Report</button>
            </div>
            <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mt-4 rounded-md dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-600">
                <strong>Disclaimer:</strong> This tool provides preliminary design checks based on AISC ${inputs.aisc_standard}. 
                For final designs, verify results using certified software or manual calculations per the current AISC Specification. 
                Some limit states may not be fully implemented. Always consult a licensed structural engineer for critical applications. For non-uniform loading in LTB, adjust Cb manually; variable cross-sections and stiffened elements are not supported.
            </div>
            <div"flex justify-between items-center">
                <h2 class="report-header text-center flex-grow">Steel Check Results (${inputs.aisc_standard})</h2>
                <button data-copy-target-id="steel-check-summary" class="copy-section-btn bg-blue-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-blue-700 text-xs print-hidden">Copy Summary</button>
            </div>
            <table>
                <caption>Calculated Section Properties</caption>
                <tbody>
                    <tr>
                        <td>Radius of Gyration (r<sub>y</sub>)</td><td>${properties.ry.toFixed(2)} in</td>
                        <td>Effective Radius of Gyration (r<sub>ts</sub>)</td><td>${properties.rts ? properties.rts.toFixed(2) + ' in' : 'N/A'}</td>
                    </tr>
                    <tr>
                        <td>Torsional Constant (J)</td><td>${properties.J ? properties.J.toFixed(2) + ' in⁴' : 'N/A'}</td>
                        <td>Warping Constant (C<sub>w</sub>)</td><td>${properties.Cw ? properties.Cw.toExponential(2) + ' in⁶' : 'N/A'}</td>
                    </tr>
                    <tr>
                        <td colspan="4" class="p-0 h-1 bg-gray-200 dark:bg-gray-700 border-0"></td>
                    </tr>
                    <tr>
                        <td>Gross Area (A<sub>g</sub>)</td><td>${properties.Ag.toFixed(3)} in²</td>
                        <td>Depth (d)</td><td>${properties.d.toFixed(3)} in</td>
                    </tr>
                    <tr>
                        <td>Moment of Inertia (I<sub>x</sub>)</td><td>${properties.Ix.toFixed(2)} in⁴</td>
                        <td>Moment of Inertia (I<sub>y</sub>)</td><td>${properties.Iy.toFixed(2)} in⁴</td>
                    </tr>
                    <tr>
                        <td>Section Modulus (S<sub>x</sub>)</td><td>${properties.Sx.toFixed(2)} in³</td>
                        <td>Section Modulus (S<sub>y</sub>)</td><td>${properties.Sy.toFixed(2)} in³</td>
                    </tr>
                    <tr>
                        <td>Plastic Modulus (Z<sub>x</sub>)</td><td>${properties.Zx.toFixed(2)} in³</td>
                        <td>Plastic Modulus (Z<sub>y</sub>)</td><td>${properties.Zy.toFixed(2)} in³</td>
                    </tr>
                </tbody>
            </table>
            <table>
                <caption>Applied Loads Summary</caption>
                <tbody>
                    <tr><td>Axial Load (${method === 'LRFD' ? 'P<sub>u</sub>' : 'P<sub>a</sub>'})</td><td>${inputs.Pu_or_Pa} kips</td></tr>
                    <tr><td>Major Moment (${method === 'LRFD' ? 'M<sub>ux</sub>' : 'M<sub>ax</sub>'})</td><td>${inputs.Mux_or_Max} kip-ft</td></tr>
                    ${inputs.Muy_or_May !== 0 ? `
                    <tr><td>Minor Moment (${method === 'LRFD' ? 'M<sub>uy</sub>' : 'M<sub>ay</sub>'})</td><td>${inputs.Muy_or_May} kip-ft</td></tr>
                    ` : ''}
                    <tr><td>Shear Force (${method === 'LRFD' ? 'V<sub>u</sub>' : 'V<sub>a</sub>'})</td><td>${inputs.Vu_or_Va} kips</td></tr>
                    ${inputs.Tu_or_Ta !== 0 ? `
                    <tr><td>Torsion (${method === 'LRFD' ? 'T<sub>u</sub>' : 'T<sub>a</sub>'})</td><td>${inputs.Tu_or_Ta} kip-in</td></tr>
                    ` : ''}
                </tbody>
            </table>
            <table id="steel-check-summary" class="report-section-copyable">
                <caption>Summary of Design Checks (${method})</caption>
                <thead>
                    <tr>
                        <th>Check</th>
                        <th>Required<br>(${method === 'LRFD' ? 'Pu, Mu, Vu' : 'Pa, Ma, Va'})</th>
                        <th>Capacity<br>(${method === 'LRFD' ? 'φPn, φMn, φVn' : 'Pn/Ω, Mn/Ω, Vn/Ω'})</th>
                        <th>Ratio</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${axial.type ? `
                    <tr>
                        <td>${axial.type}</td>
                        <td>${Pu.toFixed(2)} kips</td>
                        <td>${axial_cap.toFixed(2)} kips</td>
                        <td>${axial_ratio.toFixed(3)}</td>
                        ${getStatus(axial_ratio)}
                    </tr>
                    <tr id="axial-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            ${axial.type === 'Compression' ? `
                                <h4>Compression Breakdown (${axial.reference})</h4>
                                <ul>
                                    <li>Slender Element Factor (Q) = <b>${axial.Q.toFixed(3)}</b></li>
                                    <li>Governing Buckling Mode = <b>${axial.buckling_mode}</b></li>
                                    <li>Elastic Buckling Stress (F<sub>e</sub>) = <b>${(axial.Fe).toFixed(2)} ksi</b></li>
                                    <li>Critical Buckling Stress (F<sub>cr</sub>) = <b>${(axial.Fcr).toFixed(2)} ksi</b></li>
                                    <li>Nominal Capacity (P<sub>n</sub> = F<sub>cr</sub> * A<sub>g</sub>) = ${axial.Fcr.toFixed(2)} ksi * ${properties.Ag.toFixed(2)} in² = <b>${axial.Pn.toFixed(2)} kips</b></li>
                                    <li>Design Capacity (${cap_prefix}P<sub>n</sub>) = <b>${axial_cap.toFixed(2)} kips</b></li>
                                </ul>
                            ` : ''}
                            ${axial.type === 'Tension' ? `
                                <h4>Tension Breakdown (${axial.reference})</h4>
                                <ul>
                                    <li><b>Yielding (D2a):</b> Pn = Fy * Ag = ${inputs.Fy} ksi * ${properties.Ag.toFixed(2)} in² = ${(axial.details.yield.Pn).toFixed(2)} kips</li>
                                    <li><b>Rupture (D2b):</b> Pn = Fu * Ae = ${inputs.Fu} ksi * ${axial.details.rupture.Ae.toFixed(2)} in² = ${(axial.details.rupture.Pn).toFixed(2)} kips</li>
                                    <li>Governing Limit State = <b>${axial.governing_limit_state}</b></li>
                                    <li>Design Capacity (${cap_prefix}P<sub>n</sub>) = <b>${axial_cap.toFixed(2)} kips</b></li>
                                </ul>
                            ` : ''}
                        </div></td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td>Flexure</td>
                        <td>${Mux.toFixed(2)} kip-ft</td>
                        <td>${flex_cap.toFixed(2)} kip-ft</td>
                        <td>${flex_ratio.toFixed(3)}</td>
                        ${getStatus(flex_ratio)}
                    </tr>
                    <tr id="flex-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            <h4>Flexure Breakdown (${flexure.reference})</h4>
                            <ul>
                                <li>Flange Slenderness (λ<sub>f</sub>) = <b>${f_sl.lambda_f.toFixed(2)}</b> (Limits: λ<sub>p</sub>=${f_sl.lambda_p_f.toFixed(2)}, λ<sub>r</sub>=${f_sl.lambda_r_f.toFixed(2)})</li>
                                <li>Web Slenderness (λ<sub>w</sub>) = <b>${f_sl.lambda_w ? f_sl.lambda_w.toFixed(2) : 'N/A'}</b> (Limits: λ<sub>p</sub>=${f_sl.lambda_p_w ? f_sl.lambda_p_w.toFixed(2) : 'N/A'}, λ<sub>r</sub>=${f_sl.lambda_r_w ? f_sl.lambda_r_w.toFixed(2) : 'N/A'})</li>
                                <li>Unbraced Length (L<sub>b</sub>) = <b>${flexure.Lb.toFixed(2)} in</b></li>
                                <li>LTB Limiting Lengths: L<sub>p</sub> = <b>${flexure.Lp.toFixed(2)} in</b>, L<sub>r</sub> = <b>${flexure.Lr.toFixed(2)} in</b></li>
                                <li>Nominal Capacity (M<sub>n</sub>) = <b>${(flexure.Mn).toFixed(2)} kip-in</b> = <b>${(flexure.Mn / 12).toFixed(2)} kip-ft</b></li>
                                ${flexure.Rpg < 1.0 ? `<li>Web Plastification Factor (Rpg) = <b>${flexure.Rpg.toFixed(3)}</b> (due to slender web)</li>` : ''}
                                <li>Governing Limit State = <b>${flexure.governing_limit_state || 'N/A'}</b></li>
                                <li>Design Capacity (${cap_prefix}M<sub>n</sub>) = <b>${flex_cap.toFixed(2)} kip-ft</b></li>
                            </ul>
                        </div></td>
                    </tr>
                    <tr>
                        <td>Shear</td>
                        <td>${Vu.toFixed(2)} kips</td>
                        <td>${shear_cap.toFixed(2)} kips</td>
                        <td>${shear_ratio.toFixed(3)}</td>
                        ${getStatus(shear_ratio)}
                    </tr>
                    <tr id="shear-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            <h4>Shear Breakdown (${shear.reference})</h4>
                            <ul>
                                <li>Web Slenderness (h/t<sub>w</sub>) = <b>${shear.h_tw.toFixed(2)}</b></li>
                                <li>Web Shear Coefficient (C<sub>v</sub>) = <b>${shear.Cv.toFixed(3)}</b></li>
                                <li>Nominal Capacity (V<sub>n</sub> = 0.6*F<sub>y</sub>*A<sub>w</sub>*C<sub>v</sub>) = 0.6 * ${inputs.Fy} * ${(properties.d * properties.tw).toFixed(2)} * ${shear.Cv.toFixed(3)} = <b>${shear.Vn.toFixed(2)} kips</b></li>
                                <li>Governing Limit State = <b>${shear.governing_limit_state || 'N/A'}</b></li>
                                <li>Design Capacity (${cap_prefix}V<sub>n</sub>) = <b>${shear_cap.toFixed(2)} kips</b></li>
                            </ul>
                        </div></td>
                    </tr>
                    ${interaction.ratio ? `
                    <tr>
                        <td>Combined Forces (${interaction.equation})</td>
                        <td colspan="2">Interaction Equation</td>
                        <td>${interaction.ratio.toFixed(3)}</td>
                        ${getStatus(interaction.ratio)}
                    </tr>
                    <tr id="interaction-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            <h4>Combined Axial + Flexure Breakdown (${interaction.reference})</h4>
                            <ul>
                                ${interaction.details && interaction.details.B1x ? `<li>Moment Amplification Factor (B1x) = <b>${interaction.details.B1x.toFixed(3)}</b></li>` : ''}
                                ${interaction.details && interaction.details.B1y ? `<li>Moment Amplification Factor (B1y) = <b>${interaction.details.B1y.toFixed(3)}</b></li>` : ''}
                                <li>Equation: ${interaction.equation === 'H1-1a' ? 'P<sub>r</sub>/P<sub>c</sub> + 8/9 * (M<sub>rx</sub>/M<sub>cx</sub> + M<sub>ry</sub>/M<sub>cy</sub>)' : 'P<sub>r</sub>/(2*P<sub>c</sub>) + (M<sub>rx</sub>/M<sub>cx</sub> + M<sub>ry</sub>/M<sub>cy</sub>)'}</li>
                                <li class="mt-2 text-sm text-gray-600 dark:text-gray-400"><em>Note: This check does not include interaction with shear. Shear interaction is checked separately where applicable per AISC Chapter H.</em></li>
                            </ul>
                        </div></td>
                    </tr>
                    ` : ''}
                    ${torsion.applicable ? `
                    <tr class="border-t dark:border-gray-700">
                        <td>Torsion</td>
                        <td>${Math.abs(inputs.Tu_or_Ta).toFixed(2)} kip-in</td>
                        <td>${torsion_cap > 0 ? torsion_cap.toFixed(2) + ' kip-in' : 'See Interaction'}</td>
                        <td>${torsion_cap > 0 ? torsion_ratio.toFixed(3) : 'N/A'}</td>
                        ${torsion_cap > 0 ? getStatus(torsion_ratio) : '<td>-</td>'}
                    </tr>
                    <tr id="torsion-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            <h4>Torsion Breakdown (${torsion.reference})</h4>
                            <ul>
                                ${torsion.details.sigma_w > 0 ? `<li>Max Warping Normal Stress (σ<sub>w</sub>) = <b>${torsion.details.sigma_w.toFixed(2)} ksi</b></li>` : ''}
                                <li>Governing Limit State: <b>${torsion.governing_limit_state}</b></li>
                                <li>Design Capacity (${cap_prefix}Tn) = <b>${torsion_cap.toFixed(2)} kip-in</b></li>
                            </ul>
                        </div></td>
                    </tr>` : ''}
                    ${shear_torsion_interaction.applicable ? `
                    <tr class="border-t dark:border-gray-700">
                        <td>Combined Shear + Torsion</td>
                        <td colspan="2">Interaction Equation (${shear_torsion_interaction.reference})</td>
                        <td>${(shear_torsion_interaction.ratio).toFixed(3)}</td>
                        ${getStatus(shear_torsion_interaction.ratio)}
                    </tr>
                    ` : ''}
                    ${combined_stress_H33.applicable ? `
                    <tr class="border-t dark:border-gray-700">
                        <td>Combined Stresses (H3.3)</td>
                        <td colspan="2">Von Mises Stress Check</td>
                        <td>${(combined_stress_H33.ratio).toFixed(3)}</td>
                        ${getStatus(combined_stress_H33.ratio)}
                    </tr>
                    <tr id="h33-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            <h4>Combined Stress Breakdown (AISC H3.3)</h4>
                            <ul>
                                <li>Total Required Normal Stress (f<sub>a</sub>+f<sub>b</sub>+σ<sub>w</sub>) = <b>${combined_stress_H33.details.total_normal_stress.toFixed(2)} ksi</b></li>
                                <li>Total Required Shear Stress (f<sub>v</sub>+τ<sub>sv</sub>) = <b>${combined_stress_H33.details.total_shear_stress.toFixed(2)} ksi</b></li>
                                <li>Design Stress Capacity = <b>${combined_stress_H33.details.capacity.toFixed(2)} ksi</b></li>
                            </ul>
                        </div></td>
                    </tr>
                    ` : ''}
                    ${inputs.lb_bearing > 0 ? `
                    <tr class="border-t dark:border-gray-700">
                        <td>Web Crippling</td>
                        <td>${Vu.toFixed(2)} kips</td>
                        <td>${web_crippling.phiRn_or_Rn_omega.toFixed(2)} kips</td>
                        <td>${(Vu / web_crippling.phiRn_or_Rn_omega).toFixed(3)}</td>
                        ${getStatus(Vu / web_crippling.phiRn_or_Rn_omega)}
                    </tr>
                    <tr id="crippling-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            <h4>Web Crippling & Yielding Breakdown (${web_crippling.reference})</h4>
                            <ul>
                                <li>Web Local Yielding Capacity (R<sub>n</sub>) = <b>${web_crippling.details.Rn_yield.toFixed(2)} kips</b></li>
                                <li>Web Local Crippling Capacity (R<sub>n</sub>) = <b>${web_crippling.details.Rn_crippling.toFixed(2)} kips</b></li>
                                <li>Governing Limit State = <b>${web_crippling.governing_state}</b></li>
                                <li>Design Capacity (${cap_prefix}R<sub>n</sub>) = <b>${web_crippling.phiRn_or_Rn_omega.toFixed(2)} kips</b></li>
                            </ul>
                        </div></td>
                    </tr>` : ''}
                </tbody>
            </table>
            ${deflection.actual ? `
            <table>
                <caption>Serviceability Checks</caption>
                <thead>
                    <tr>
                        <th>Check</th>
                        <th>Actual</th>
                        <th>Allowable</th>
                        <th>Ratio</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Deflection</td>
                        <td>${deflection.actual.toFixed(3)} in</td>
                        <td>${deflection.allowable.toFixed(3)} in (L/${inputs.deflection_limit})</td>
                        <td>${deflection.ratio.toFixed(3)}</td>
                        ${getStatus(deflection.ratio)}
                    </tr>
                    <tr id="deflection-details" class="details-row">
                        <td colspan="5" class="p-0"><div class="calc-breakdown">
                            <h4>Deflection Breakdown (Serviceability)</h4>
                            <ul>
                                <li>Actual Deflection = <b>${deflection.actual.toFixed(3)} in</b></li>
                                <li>Allowable Deflection (L / ${inputs.deflection_limit}) = <b>${deflection.allowable.toFixed(3)} in</b></li>
                            </ul>
                        </div></td>
                    </tr>
                </tbody>
            </table>
            ` : ''}
        </div>`}
    `;
}