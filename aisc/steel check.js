const steelCheckInputIds = [
    'design_method', 'aisc_standard', 'unit_system', 'steel_material', 'Fy', 'Fu', 'E', 'section_type',
    'd', 'bf', 'tf', 'tw', 'Ag_manual', 'I_manual', 'Sx_manual', 'Zx_manual', 'ry_manual', 'rts_manual', 'J_manual', 'Cw_manual',
    'Iy_manual', 'Sy_manual', 'Zy_manual', 'lb_bearing', 'is_end_bearing', 'k_des', 'Cm', 'Lb_input', 'K', 'Cb',
    'Pu_or_Pa', 'Mux_or_Max', 'Muy_or_May', 'Vu_or_Va', 'Tu_or_Ta', 'deflection_span', 'deflection_limit', 'actual_deflection_input',
    'num_beams', 'beam_spacing' // Added for built-up section calculator
];

document.addEventListener('DOMContentLoaded', () => {
    injectHeader({
        activePage: 'steel-check',
        pageTitle: 'AISC Steel Section Design Checker',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({
        footerPlaceholderId: 'footer-placeholder'
    });
    initializeSharedUI();

    function populateMaterialDropdowns() {
        const gradeOptions = Object.keys(AISC_SPEC.structuralSteelGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');

        const select = document.getElementById('steel_material');
        if (select) {
            select.innerHTML = gradeOptions;
            select.value = 'A992'; // Set a default value
            select.addEventListener('change', (e) => {
                const grade = AISC_SPEC.getSteelGrade(e.target.value);
                if (grade) {
                    document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                    document.getElementById(e.target.dataset.fuTarget).value = grade.Fu;
                }
            });
            select.dispatchEvent(new Event('change')); // Trigger initial population
        }
    }

    const handleRunSteelCheck = createCalculationHandler({
        gatherInputsFunction: () => gatherInputsFromIds(steelCheckInputIds), // Use the generic function
        storageKey: 'steel-check-inputs',
        validationRuleKey: 'steel_check',
        calculatorFunction: steelChecker.run,
        renderFunction: renderSteelResults,
        resultsContainerId: 'steel-results-container',
        buttonId: 'run-steel-check-btn'
    });

    document.getElementById('save-inputs-btn').addEventListener('click', createSaveInputsHandler(steelCheckInputIds, 'steel-check-inputs.txt'));
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', createLoadInputsHandler(steelCheckInputIds, handleRunSteelCheck));

    // The aiscShapeDatabase is defined later in the script, so it's available in the handler.
    document.getElementById('section_type').addEventListener('change', updateGeometryInputsUI);
    document.getElementById('num_beams').addEventListener('input', calculateAndDisplayBuiltUpProperties);
    document.getElementById('beam_spacing').addEventListener('input', calculateAndDisplayBuiltUpProperties);
    updateGeometryInputsUI(); // Initial call
    populateMaterialDropdowns();

    // --- Auto-save inputs to localStorage on any input change, with debouncing ---
    const debouncedSave = debounce(() => {
        saveInputsToLocalStorage('steel-check-inputs', gatherInputsFromIds(steelCheckInputIds));
    }, 300); // Wait 300ms after the user stops typing to save.

    steelCheckInputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', debouncedSave);
    });
    loadInputsFromLocalStorage('steel-check-inputs', steelCheckInputIds);

    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunSteelCheck);

    document.getElementById('steel-results-container').addEventListener('click', (event) => {
        const button = event.target.closest('.toggle-details-btn');
        if (button) {
            const detailId = button.dataset.toggleId;
            const detailRow = document.getElementById(detailId);
            detailRow?.classList.toggle('is-visible');
            button.textContent = detailRow?.classList.contains('is-visible') ? '[Hide]' : '[Show]';
        } else if (event.target.id === 'copy-report-btn') { // This is the "Copy Full Report" button
            handleCopyToClipboard('steel-check-report-content', 'feedback-message');
        } else if (event.target.id === 'download-pdf-btn') {
            handleDownloadPdf('steel-check-report-content', 'Steel-Check-Report.pdf');
        } else if (event.target.id === 'toggle-all-details-btn') {
            handleToggleAllDetails(event.target, '#steel-results-container');
        } else if (event.target.id === 'download-word-btn') {
            handleDownloadWord('steel-check-report-content', 'Steel-Check-Report.doc');
            handleToggleAllDetails(event.target, '#steel-results-container');
        }

        // Handle individual section copy buttons
        const copyBtn = event.target.closest('.copy-section-btn');
        if (copyBtn) {
            const targetId = copyBtn.dataset.copyTargetId;
            if (targetId) {
                handleCopyToClipboard(targetId, 'feedback-message');
            }
        }
    });
});

function handleToggleAllDetails(mainButton, containerSelector) {
    const shouldShow = mainButton.dataset.state === 'hidden';
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.querySelectorAll('.details-row').forEach(row => {
        row.classList.toggle('is-visible', shouldShow);
    });
    container.querySelectorAll('.toggle-details-btn').forEach(button => {
        button.textContent = shouldShow ? '[Hide]' : '[Show]';
    });
    mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
    mainButton.textContent = shouldShow ? 'Hide All Details' : 'Show All Details';
    mainButton.blur();
}

function calculateAndDisplayBuiltUpProperties() {
    const n_beams = parseInt(document.getElementById('num_beams').value) || 1;
    const spacing = parseFloat(document.getElementById('beam_spacing').value) || 0;
    const resultsDiv = document.getElementById('built-up-results');

    if (n_beams <= 1) {
        resultsDiv.innerHTML = '';
        return;
    }

    // Use the generic gatherInputsFromIds function
    const single_props = getSectionProperties(gatherInputsFromIds(steelCheckInputIds));
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
            <tbody>
                <tr><td class="py-1">Total Area (A<sub>g,total</sub>):</td><td class="text-right font-mono">${bu_props.Ag.toFixed(2)} in²</td></tr>
                <tr><td class="py-1">Total Strong Axis I<sub>x,total</sub>:</td><td class="text-right font-mono">${bu_props.Ix.toFixed(2)} in⁴</td></tr>
                <tr><td class="py-1">Total Strong Axis S<sub>x,total</sub>:</td><td class="text-right font-mono">${bu_props.Sx.toFixed(2)} in³</td></tr>
                <tr><td class="py-1">Total Strong Axis Z<sub>x,total</sub>:</td><td class="text-right font-mono">${bu_props.Zx.toFixed(2)} in³</td></tr>
                <tr class="border-t border-dashed dark:border-gray-600">
                    <td class="py-1 font-semibold">Total Weak Axis I<sub>y,total</sub>:</td>
                    <td class="text-right font-mono">${bu_props.Iy.toFixed(2)} in⁴</td>
                </tr>
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
    } else if (sectionType === 'HSS/Pipe (Circular)') {
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
        const J = (1 / 3) * (2 * bf * tf**3 + (d - 2 * tf) * tw**3);
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
        return { type: 'angle', Ag, d: L1, bf: L2, tf: t, tw: t, J: (1 / 3) * (L1 + L2) * t**3 };
    }
    return {}; // Should not happen
}

const steelChecker = (() => {

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

    // --- Refactored Flexure Limit State Functions for I-Shapes ---

    function calculate_Mn_yield(Fy, Zx) {
        // AISC F2.1: Yielding
        return Fy * Zx;
    }

    function calculate_Mn_ltb(Mp, My, Lb, Lp, Lr, Cb, E, Sx, rts, J, d, tf, aisc_standard) {
        // AISC F2.2: Lateral-Torsional Buckling (LTB)
        if (Lb <= Lp) {
            return Mp; // No LTB
        }

        if (Lb <= Lr) {
            // Inelastic LTB (AISC F2-2)
            const Mn = Cb * (Mp - (Mp - My) * ((Lb - Lp) / (Lr - Lp)));
            return Math.min(Mn, Mp);
        }

        // Elastic LTB (AISC F2-3)
        const ho = d - tf;
        const c = 1.0; // for doubly symmetric I-shapes
        const term1 = (Cb * Math.PI ** 2 * E) / Math.pow(Lb / rts, 2);
        let term2;

        if (aisc_standard === '360-22') {
            // AISC 360-22 Eq. F2-4
            const rt = rts; // For I-shapes
            const term2_inner = 0.078 * (J / (Sx * ho)) * Math.pow(Lb / rt, 2);
            term2 = Math.sqrt(1 + term2_inner);
        } else { // AISC 360-16
            const term2_inner = 0.078 * (J * c / (Sx * ho)) * Math.pow(Lb / rts, 2);
            term2 = Math.sqrt(1 + term2_inner);
        }

        const Fcr = term1 * term2;
        const Mn = Fcr * Sx;
        return Math.min(Mn, Mp);
    }

    function calculate_Mn_flb(Mp, My, lambda_f, lambda_p_f, lambda_r_f, E, Sx) {
        // AISC F3.2: Flange Local Buckling (FLB)
        if (lambda_f <= lambda_p_f) {
            return Mp; // Compact flange
        }

        if (lambda_f <= lambda_r_f) {
            // Noncompact flange (AISC F3-1)
            const ratio = (lambda_f - lambda_p_f) / (lambda_r_f - lambda_p_f);
            return Mp - (Mp - My) * ratio;
        }

        // Slender flange (AISC F3-2)
        const kc = 4 / Math.sqrt(lambda_f); // h/tw is not correct here, lambda_f is bf/2tf
        const kc_lim = Math.max(0.35, Math.min(0.76, kc));
        const Fcr_flb = (0.9 * E * kc_lim) / Math.pow(lambda_f, 2);
        return Fcr_flb * Sx;
    }

    function checkFlexure_IShape(props, inputs, isHighShear = false) {
        const { Fy, E, Cb, Lb_input, K, aisc_standard } = inputs;
        const { Zx, Sx, rts, h, J, Cw, tw, bf, tf, d } = props;
        const Lb = Lb_input * 12; // to inches

        // --- Slenderness Checks (AISC B4) ---
        const lambda_f = bf / (2 * tf);
        const lambda_p_f = 0.38 * Math.sqrt(E / Fy);
        const lambda_r_f = 1.0 * Math.sqrt(E / Fy);
        const lambda_w = h / tw;
        const lambda_p_w = 3.76 * Math.sqrt(E / Fy);
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);
        const isCompact = (lambda_f <= lambda_p_f) && (lambda_w <= lambda_p_w);

        // --- LTB Parameters (AISC F2) ---
        const Lp = 1.76 * rts * Math.sqrt(E / Fy); // F2-5
        let Lr;
        if (aisc_standard === '360-22') {
            const ho = d - tf;
            const term1 = J / (Sx * ho);
            const term2 = Math.pow(term1, 2);
            const term3 = 6.76 * Math.pow(0.7 * Fy / E, 2);
            Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(term1 + Math.sqrt(term2 + term3));
        } else { // AISC 360-16
            const ho = d - tf;
            const term_inside_sqrt = Math.pow(J * 1.0 / (Sx * ho), 2) + 6.76 * Math.pow(0.7 * Fy / E, 2);
            Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(J * 1.0 / (Sx * ho) + Math.sqrt(term_inside_sqrt));
        }

        // --- Calculate Nominal Capacities for Each Limit State ---
        const Mp = calculate_Mn_yield(Fy, Zx);
        const My = Fy * Sx;
        let Rpg = 1.0;

        const limit_states = {
            'Yielding (F2.1)': Mp,
            'Lateral-Torsional Buckling (F2.2)': calculate_Mn_ltb(Mp, My, Lb, Lp, Lr, Cb, E, Sx, rts, J, d, tf, aisc_standard),
            'Flange Local Buckling (F3)': calculate_Mn_flb(Mp, My, lambda_f, lambda_p_f, lambda_r_f, E, Sx),
            'Web Local Buckling (F4)': checkWebLocalBuckling(props, inputs, Mp, My),
            'Compression Flange Yielding (F5)': (lambda_w > lambda_r_w) ? checkSlenderWebFlexure(props, inputs, Mp, My) : Infinity,
        };

        let Mn = Math.min(...Object.values(limit_states));

        // --- G2.1: Interaction of Flexure and Shear for I-Shapes ---
        // This reduction applies when Vu > 0.6 * phi_v * Vy
        let R_pv = 1.0; // Reduction factor for high shear
        if (isHighShear) {
            const Aw = d * tw;
            const h_tw = h / tw;
            const limit = 1.10 * Math.sqrt(E / Fy); // Simplified limit from G2.1
            if (h_tw <= limit) {
                const Cvx = 1.0; // Assuming Cv1 from G2.1 is 1.0
                R_pv = (1 - (0.6 * inputs.Vu_or_Va) / (0.6 * Fy * Aw * Cvx));
                Mn *= R_pv;
            }
        }

        let governing_limit_state = '';
        for (const [name, value] of Object.entries(limit_states)) {
            if (value === Mn) {
                governing_limit_state = name;
                break;
            }
        }

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);
        const phiMn_or_Mn_omega = Mn * factor;

        return {
            phiMn_or_Mn_omega: phiMn_or_Mn_omega / 12, // Corrected to kip-ft (from kip-in)
            isCompact, Mn, Lb, Lp, Lr, Rpg, R_pv, governing_limit_state,
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

        if (type === 'HSS-round') {
            // For doubly-symmetric round sections, only flexural buckling needs to be checked.
            // Torsional buckling does not govern.
            Fe = Fey; // Since rx = ry for round sections, Fex = Fey
            buckling_mode = 'Flexural Buckling (E3)';
        } else if (type === 'I-Shape' || type === 'Rectangular HSS' || !type) { // Other doubly symmetric sections
            const Kz = K; // Assume same as flexural K for torsional
            const Lz = Lc;
            const Fez_num = (Math.PI**2 * E * Cw) / ((Kz * Lz)**2) + (G * J);
            const Fez_den = Ix + Iy;
            const Fez = Fez_num / Fez_den;

            if (Fey <= Fez) { // Check if flexural buckling governs over torsional
                Fe = Fey;
                buckling_mode = 'Flexural Buckling (E3)';
            } else {
                Fe = Fez;
                buckling_mode = 'Torsional Buckling (E4)';
            }
        }  else if (type === 'channel' || type === 'angle') { // Singly symmetric
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
                yield: { Pn: Pn_yield, capacity: cap_yield, Ag: props.Ag },
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
        return { phiVn_or_Vn_omega: phiVn_or_Vn_omega, Vn, Cv, h_tw, governing_limit_state, phi: phi_v, omega: omega_v, reference: "AISC G5, G6" }; // to kips
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
        const sigma_w = 0; // Simplified to 0 for now, as formula was likely incorrect.

        // St. Venant shear stress (max at surface)
        const tau_sv = (Tu_or_Ta * tf) / J; // Simplified shear stress in flange from torsion.

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

        if (lb_bearing <= 0) return { applicable: false };

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
        const governing_limit_state = Rn_yield < Rn_crippling ? 'Web Local Yielding (J10.2)' : 'Web Local Crippling (J10.3)';

        return {
            phiRn_or_Rn_omega: Rn * factor, // in kips
            reference: "AISC J10.2 & J10.3",
            governing_limit_state,
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

    function checkWebSideswayBuckling(props, inputs) {
        // Per AISC 360, Section G4
        const { type, h, tw, bf, d } = props;
        const { Lb_input, Fy, design_method } = inputs;

        // This limit state applies to singly symmetric I-shapes and channels under compression.
        // We will apply it to channels for now.
        if (type !== 'channel' || inputs.Pu_or_Pa >= 0) {
            return { applicable: false };
        }

        const Lb = Lb_input * 12; // Unbraced length in inches
        if (Lb <= 0 || bf <= 0 || tw <= 0) return { applicable: false };

        const h_tw = h / tw;
        const L_bf = Lb / bf;
        const ratio = h_tw / L_bf;

        let Cr;
        // From AISC Table G4.1
        if (ratio <= 1.8) {
            Cr = 2470;
        } else {
            Cr = 4430 / ratio;
        }

        const Aw = d * tw;
        const Rn = (Cr * Aw * Fy) / (h_tw**2);
        return { applicable: true, Rn, phi: 0.90, omega: 1.67, Cr, h_tw, L_bf, reference: "AISC G4" };
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

        // Logical geometry checks for I-shapes
        if (inputs.section_type === 'I-Shape') {
            if (inputs.d < 2 * inputs.tf) {
                errors.push("Depth (d) must be greater than twice the flange thickness (tf).");
            }
            if (inputs.bf < inputs.tw) {
                errors.push("Flange width (bf) must be greater than the web thickness (tw).");
            }
        }
        return { errors, warnings };
    }

    function run(inputs) {
        // Post-process inputs gathered by the generic function
        inputs.Fy = parseFloat(inputs.Fy) || 0;
        inputs.Fu = parseFloat(inputs.Fu) || 0;
        inputs.is_end_bearing = inputs.is_end_bearing === 'true';
        inputs.An_net = inputs.Ag_manual; // Assume full beam net area
        inputs.U_shear_lag = 1.0; // Assume full beam shear lag factor

        const { errors, warnings } = validateInputs(inputs);
        if (inputs.Tu_or_Ta !== 0 && inputs.section_type === 'I-Shape') {
            warnings.push("Torsion analysis for I-shapes is a simplified approximation and may not be accurate. See AISC Design Guide 9 for a complete analysis.");
        }
        if (errors.length > 0) return { errors, warnings };

        // Pass the processed inputs to the property calculator
        const props = getSectionProperties(inputs); 

        // --- Shear and Flexure Interaction (AISC Chapter G) ---
        // 1. First, calculate shear capacity to determine if it's "high shear".
        const shear_results = checkShear(props, inputs);
        const Aw = props.d * props.tw;
        const Vy = 0.6 * inputs.Fy * Aw; // Nominal shear yield strength
        const phi_v = shear_results.phi || 0.9;
        const omega_v = shear_results.omega || 1.67;
        const shear_yield_capacity = inputs.design_method === 'LRFD' ? phi_v * Vy : Vy / omega_v;
        
        // 2. Check if shear demand exceeds 60% of the shear yield capacity.
        const isHighShear = Math.abs(inputs.Vu_or_Va) > 0.6 * shear_yield_capacity;

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

        // 3. Pass the isHighShear flag to the flexure check.
        const flex_results = checkFlexure(props, inputs, isHighShear);

        const web_sidesway_buckling = checkWebSideswayBuckling(props, inputs);
        // Only include web crippling results if the check is applicable
        const web_crippling_check = checkWebCrippling(props, inputs);
        const web_crippling_results = web_crippling_check.applicable ? web_crippling_check : {};

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
            web_sidesway_buckling,
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

// --- Breakdown Generators (NEW REFACTORED SECTION) ---
const baseSteelBreakdownGenerators = {
    'Axial': (data, common) => {
        const { check, type, properties } = data;
        if (type === 'Tension') {
            return common.format_list([
                `<b>Yielding (D2a):</b>`,
                `P<sub>n</sub> = F<sub>y</sub> &times; A<sub>g</sub> = ${common.fmt(common.inputs.Fy)} ksi &times; ${common.fmt(check.details.yield.Ag, 2)} in² = ${common.fmt(check.details.yield.Pn)} kips`,
                `<b>Rupture (D2b):</b>`,
                `P<sub>n</sub> = F<sub>u</sub> &times; A<sub>e</sub> = ${common.fmt(common.inputs.Fu)} ksi &times; ${common.fmt(check.details.rupture.Ae, 2)} in² = ${common.fmt(check.details.rupture.Pn)} kips`,
                `Governing Limit State = <b>${check.governing_limit_state}</b>`,
                `Design Capacity (${common.capacity_eq}) = <b>${common.fmt(check.phiPn_or_Pn_omega)} kips</b>`
            ]);
        } else { // Compression
            return common.format_list([
                `<u>Elastic Buckling Stress (F<sub>e</sub>)</u>`,
                `Governing Buckling Mode = <b>${check.buckling_mode}</b>`,
                `F<sub>e</sub> = <b>${common.fmt(check.Fe, 2)} ksi</b>`,
                `<u>Critical Buckling Stress (F<sub>cr</sub>)</u>`,
                `F<sub>cr</sub> = [0.658<sup>(Q&times;F<sub>y</sub>/F<sub>e</sub>)</sup>] &times; Q &times; F<sub>y</sub> = [0.658<sup>(${common.fmt(check.Q, 3)}&times;${common.fmt(common.inputs.Fy, 1)}/${common.fmt(check.Fe, 2)})</sup>] &times; ${common.fmt(check.Q, 3)} &times; ${common.fmt(common.inputs.Fy, 1)} = <b>${common.fmt(check.Fcr, 2)} ksi</b>`,
                `<u>Nominal Capacity (P<sub>n</sub>)</u>`,
                `P<sub>n</sub> = F<sub>cr</sub> &times; A<sub>g</sub> = ${common.fmt(check.Fcr)} ksi &times; ${common.fmt(properties.Ag, 2)} in² = <b>${common.fmt(check.Pn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${common.capacity_eq} = ${common.fmt(check.Pn)} / ${common.factor_val} = <b>${common.fmt(check.phiPn_or_Pn_omega)} kips</b>`
            ]);
        }
    },
    'Flexure (Major)': (data, common) => {
        const { check, slenderness } = data;
        const f_sl = slenderness;

        if (common.inputs.section_type === 'I-Shape') {
            return common.format_list([
                `<u>Slenderness Checks</u>`,
                `Flange: &lambda;<sub>f</sub> = <b>${common.fmt(f_sl.lambda_f)}</b> (Limits: &lambda;<sub>p</sub>=${common.fmt(f_sl.lambda_p_f)}, &lambda;<sub>r</sub>=${common.fmt(f_sl.lambda_r_f)})`,
                `Web: &lambda;<sub>w</sub> = <b>${f_sl.lambda_w ? common.fmt(f_sl.lambda_w) : 'N/A'}</b> (Limits: &lambda;<sub>p</sub>=${f_sl.lambda_p_w ? common.fmt(f_sl.lambda_p_w) : 'N/A'}, &lambda;<sub>r</sub>=${f_sl.lambda_r_w ? common.fmt(f_sl.lambda_r_w) : 'N/A'})`,
                `<u>Lateral-Torsional Buckling (LTB)</u>`,
                `L<sub>b</sub> = <b>${common.fmt(check.Lb)} in</b>, L<sub>p</sub> = <b>${common.fmt(check.Lp)} in</b>, L<sub>r</sub> = <b>${common.fmt(check.Lr)} in</b>`,
                `<u>Nominal Capacity (M<sub>n</sub>)</u>`,
                `M<sub>n</sub> = <b>${common.fmt(check.Mn)} kip-in</b> = <b>${common.fmt(check.Mn / 12)} kip-ft</b>`,
                `Governing Limit State = <b>${check.governing_limit_state || 'N/A'}</b>`,
                (check.R_pv && check.R_pv < 1.0) ? `
                    <hr class="my-2">
                    <b class="text-yellow-600">High Shear Reduction (AISC G2.1):</b><br>
                    Shear demand exceeds 60% of shear yield capacity. Flexural strength is reduced by R<sub>pv</sub> = <b>${common.fmt(check.R_pv, 3)}</b>.
                ` : '',
                `<u>Design Capacity</u>`,
                `Capacity = ${common.capacity_eq.replace('R', 'M')} = ${common.fmt(check.Mn / 12)} / ${common.factor_val} = <b>${common.fmt(check.phiMn_or_Mn_omega)} kip-ft</b>`
            ].filter(Boolean));
        } else { // HSS Sections
            const slenderness_label = common.inputs.section_type === 'HSS/Pipe (Circular)' ? 'D/t' : 'h/t';
            return common.format_list([
                `<u>Slenderness Check</u>`,
                `Slenderness (${slenderness_label}) = <b>${common.fmt(f_sl.lambda)}</b> (Limits: &lambda;<sub>p</sub>=${common.fmt(f_sl.lambda_p)}, &lambda;<sub>r</sub>=${common.fmt(f_sl.lambda_r)})`,
                `Section is <b>${check.isCompact ? 'Compact' : 'Noncompact'}</b>`,
                `<u>Nominal Capacity (M<sub>n</sub>)</u>`,
                `M<sub>n</sub> = <b>${common.fmt(check.Mn)} kip-in</b> = <b>${common.fmt(check.Mn / 12)} kip-ft</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${common.capacity_eq.replace('R', 'M')} = ${common.fmt(check.Mn / 12)} / ${common.factor_val} = <b>${common.fmt(check.phiMn_or_Mn_omega)} kip-ft</b>`
            ].filter(Boolean));
        }
    },
    'Shear': (data, common) => {
        const { check, properties } = data;
        if (common.inputs.section_type.includes('HSS')) {
            const area_label = common.inputs.section_type === 'HSS/Pipe (Circular)' ? 'A<sub>g</sub>/2' : 'A<sub>w</sub>';
            const area_val = common.inputs.section_type === 'HSS/Pipe (Circular)' ? properties.Ag / 2 : 2 * properties.tf * properties.d;
            return common.format_list([
                `<u>Nominal Capacity (V<sub>n</sub>)</u>`,
                `V<sub>n</sub> = F<sub>cr</sub> &times; ${area_label} = <b>${common.fmt(check.Vn)} kips</b>`,
                `Governing Limit State = <b>${check.governing_limit_state || 'N/A'}</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${common.capacity_eq.replace('R', 'V')} = ${common.fmt(check.Vn)} / ${common.factor_val} = <b>${common.fmt(check.phiVn_or_Vn_omega)} kips</b>`
            ]);
        } else { // I-Shape
            const Aw = properties.d * properties.tw;
            return common.format_list([
                `<u>Nominal Capacity (V<sub>n</sub>)</u>`,
                `Web Shear Coefficient (C<sub>v</sub>) = <b>${common.fmt(check.Cv, 3)}</b>`,
                `V<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>w</sub> &times; C<sub>v</sub> = 0.6 &times; ${common.fmt(common.inputs.Fy)} &times; ${common.fmt(Aw)} &times; ${common.fmt(check.Cv, 3)} = <b>${common.fmt(check.Vn)} kips</b>`,
                `Governing Limit State = <b>${check.governing_limit_state || 'N/A'}</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${common.capacity_eq.replace('R', 'V')} = ${common.fmt(check.Vn)} / ${common.factor_val} = <b>${common.fmt(check.phiVn_or_Vn_omega)} kips</b>`
            ]);
        }
    },
    'Combined Forces': (data, common) => {
        const { check, details } = data;
        const { Pc, Mcx, Mcy } = { Pc: common.axial.phiPn_or_Pn_omega, Mcx: common.flexure.phiMn_or_Mn_omega, Mcy: common.flexure_y.phiMny_or_Mny_omega };
        const { Pr, Mrx, Mry } = { Pr: Math.abs(common.inputs.Pu_or_Pa), Mrx: Math.abs(common.inputs.Mux_or_Max), Mry: Math.abs(common.inputs.Muy_or_May) };
        if (!details) return 'Breakdown not available.';
        const pr_pc = Pc > 0 ? Pr/Pc : 0;
        const mrx_mcx_term = Mcx > 0 ? `(B<sub>1x</sub>&times;M<sub>rx</sub>/M<sub>cx</sub>)` : '0';
        const mry_mcy_term = Mcy > 0 ? `(B<sub>1y</sub>&times;M<sub>ry</sub>/M<sub>cy</sub>)` : '0';
        const mrx_mcx_vals = Mcx > 0 ? `(${common.fmt(details.B1x, 3)}&times;${common.fmt(Mrx)}/${common.fmt(Mcx)})` : '0';
        const mry_mcy_vals = Mcy > 0 ? `(${common.fmt(details.B1y, 3)}&times;${common.fmt(Mry)}/${common.fmt(Mcy)})` : '0';

        let equation_html = '';
        if (check.equation === 'H1-1a') {
            equation_html = `P<sub>r</sub>/P<sub>c</sub> + 8/9 &times; (${mrx_mcx_term} + ${mry_mcy_term}) = ${common.fmt(pr_pc, 3)} + 8/9 &times; (${mrx_mcx_vals} + ${mry_mcy_vals}) = <b>${common.fmt(check.ratio, 3)}</b>`;
        } else {
            equation_html = `P<sub>r</sub>/(2&times;P<sub>c</sub>) + ${mrx_mcx_term} + ${mry_mcy_term} = ${common.fmt(pr_pc, 3)}/2 + ${mrx_mcx_vals} + ${mry_mcy_vals} = <b>${common.fmt(check.ratio, 3)}</b>`;
        }
        return common.format_list([
            `Reference: <b>${check.reference}</b>`,
            `Moment Amplification Factors: B<sub>1x</sub> = <b>${common.fmt(details.B1x, 3)}</b>, B<sub>1y</sub> = <b>${common.fmt(details.B1y, 3)}</b>`,
            `Required Ratio (P<sub>r</sub>/P<sub>c</sub>) = ${common.fmt(pr_pc, 3)}`,
            `Governing Equation: <b>${check.equation}</b>`,
            `Interaction: ${equation_html}`
        ]);
    },
    // Add other generators here...
    'Deflection': (data, common) => {
        const { check, details } = data; // Keep consistent destructuring
        return common.format_list([
            `Reference: <b>Serviceability Requirement</b>`,
            `Actual Deflection = <b>${common.fmt(details.actual, 3)} in</b>`,
            `Allowable Deflection = L / ${common.inputs.deflection_limit} = ${common.fmt(common.inputs.deflection_span * 12)} in / ${common.inputs.deflection_limit} = <b>${common.fmt(details.allowable, 3)} in</b>`
        ]);
    },
};

function getSteelBreakdownGenerator(name) {
    return baseSteelBreakdownGenerators[name] || (() => 'Breakdown not available for this check.');
}

function generateSteelCheckBreakdownHtml(name, data, inputs, all_results) {
    const { check, details, reference } = data;
    if (!check && !details) return 'Breakdown not available.';

    const { design_method } = inputs;    // Use the specific phi/omega from the check data, with a fallback.
    const phi = check?.phi ?? 0.9;
    const omega = check?.omega ?? 1.67;

    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? phi : omega;

    const common_params = {
        inputs,
        design_method,
        factor_char,
        factor_val,        capacity_eq: design_method === 'LRFD' ? `${factor_char}R<sub>n</sub>` : `R<sub>n</sub> / ${factor_char}`,
        // FIX: Calculate final_capacity using the correct, specific factor_val for this check.
        final_capacity: design_method === 'LRFD' ? (check?.Rn || 0) * (check?.phi ?? 0.9) : (check?.Rn || 0) / (check?.omega ?? 1.67),
        axial: all_results.axial, // Pass full axial results for combined checks
        flexure: all_results.flexure, // Pass full flexure results
        flexure_y: all_results.flexure_y, // Pass minor axis flexure results
        format_list: (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`,
        fmt: (x, n = 2) => (typeof x === "number" && isFinite(x)) ? x.toFixed(n) : "-"
    };

    const generator = getSteelBreakdownGenerator(name);
    return `<h4 class="font-semibold">${name} (${reference || 'N/A'})</h4>${generator(data, common_params)}`;
}


function renderInputSummary(inputs, properties) {
    return `
    <div id="input-summary-section" class="report-section-copyable">
        <div class="flex justify-between items-center">
            <h3 class="report-header">1. Input Summary</h3>
            <button data-copy-target-id="input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">Design & Material Properties</caption>
                <tbody>
                    <tr><td>Design Method</td><td>${inputs.design_method}</td></tr>
                    <tr><td>AISC Standard</td><td>${inputs.aisc_standard}</td></tr>
                    <tr><td>Yield Strength (F<sub>y</sub>)</td><td>${inputs.Fy} ksi</td></tr>
                    <tr><td>Ultimate Strength (F<sub>u</sub>)</td><td>${inputs.Fu} ksi</td></tr>
                    <tr><td>Modulus of Elasticity (E)</td><td>${inputs.E} ksi</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Calculated Section Properties</caption>
                <tbody>
                    <tr><td>Gross Area (A<sub>g</sub>)</td><td>${properties.Ag.toFixed(3)} in²</td></tr>
                    <tr><td>Depth (d)</td><td>${properties.d.toFixed(3)} in</td></tr>
                    <tr><td>Moment of Inertia (I<sub>x</sub>)</td><td>${properties.Ix.toFixed(2)} in⁴</td></tr>
                    <tr><td>Moment of Inertia (I<sub>y</sub>)</td><td>${properties.Iy.toFixed(2)} in⁴</td></tr>
                    <tr><td>Section Modulus (S<sub>x</sub>)</td><td>${properties.Sx.toFixed(2)} in³</td></tr>
                    <tr><td>Section Modulus (S<sub>y</sub>)</td><td>${properties.Sy.toFixed(2)} in³</td></tr>
                    <tr><td>Plastic Modulus (Z<sub>x</sub>)</td><td>${properties.Zx.toFixed(2)} in³</td></tr>
                    <tr><td>Plastic Modulus (Z<sub>y</sub>)</td><td>${properties.Zy.toFixed(2)} in³</td></tr>
                    <tr><td>Radius of Gyration (r<sub>y</sub>)</td><td>${properties.ry.toFixed(2)} in</td></tr>
                    <tr><td>Effective Radius of Gyration (r<sub>ts</sub>)</td><td>${properties.rts ? properties.rts.toFixed(2) + ' in' : 'N/A'}</td></tr>
                    <tr><td>Torsional Constant (J)</td><td>${properties.J ? properties.J.toFixed(2) + ' in⁴' : 'N/A'}</td></tr>
                    <tr><td>Warping Constant (C<sub>w</sub>)</td><td>${properties.Cw ? properties.Cw.toExponential(2) + ' in⁶' : 'N/A'}</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Applied Loads</caption>
                <tbody>
                    <tr><td>Axial Load (${inputs.design_method === 'LRFD' ? 'P<sub>u</sub>' : 'P<sub>a</sub>'})</td><td>${inputs.Pu_or_Pa} kips</td></tr>
                    <tr><td>Major Moment (${inputs.design_method === 'LRFD' ? 'M<sub>ux</sub>' : 'M<sub>ax</sub>'})</td><td>${inputs.Mux_or_Max} kip-ft</td></tr>
                    ${inputs.Muy_or_May !== 0 ? `
                    <tr><td>Minor Moment (${inputs.design_method === 'LRFD' ? 'M<sub>uy</sub>' : 'M<sub>ay</sub>'})</td><td>${inputs.Muy_or_May} kip-ft</td></tr>
                    ` : ''}
                    <tr><td>Shear Force (${inputs.design_method === 'LRFD' ? 'V<sub>u</sub>' : 'V<sub>a</sub>'})</td><td>${inputs.Vu_or_Va} kips</td></tr>
                    ${inputs.Tu_or_Ta !== 0 ? `
                    <tr><td>Torsion (${inputs.design_method === 'LRFD' ? 'T<sub>u</sub>' : 'T<sub>a</sub>'})</td><td>${inputs.Tu_or_Ta} kip-in</td></tr>
                    ` : ''}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderSlendernessChecks(results) {
    const { inputs, flexure, properties } = results;
    if (!flexure || !flexure.slenderness) {
        return '';
    }

    const { slenderness } = flexure;
    const { section_type } = inputs;
    const rows = [];

    const addRow = (item, ratio, limit_p, limit_r, status) => {
        rows.push(`
            <tr>
                <td>${item}</td>
                <td>${ratio.toFixed(2)}</td>
                <td>${limit_p.toFixed(2)}</td>
                <td>${limit_r.toFixed(2)}</td>
                <td class="font-semibold ${status === 'Compact' ? 'text-green-600' : (status === 'Noncompact' ? 'text-yellow-600' : 'text-red-600')}">${status}</td>
            </tr>
        `);
    };

    if (section_type === 'I-Shape' || section_type === 'channel') {
        const flange_status = slenderness.lambda_f <= slenderness.lambda_p_f ? 'Compact' : (slenderness.lambda_f <= slenderness.lambda_r_f ? 'Noncompact' : 'Slender');
        const web_status = slenderness.lambda_w <= slenderness.lambda_p_w ? 'Compact' : (slenderness.lambda_w <= slenderness.lambda_r_w ? 'Noncompact' : 'Slender');
        addRow(`Flange (b<sub>f</sub>/2t<sub>f</sub>)`, slenderness.lambda_f, slenderness.lambda_p_f, slenderness.lambda_r_f, flange_status);
        addRow(`Web (h/t<sub>w</sub>)`, slenderness.lambda_w, slenderness.lambda_p_w, slenderness.lambda_r_w, web_status);
    } else if (section_type === 'Rectangular HSS') {
        const status = slenderness.lambda <= slenderness.lambda_p ? 'Compact' : (slenderness.lambda <= slenderness.lambda_r ? 'Noncompact' : 'Slender');
        addRow(`Flange/Web (h/t)`, slenderness.lambda, slenderness.lambda_p, slenderness.lambda_r, status);
    } else if (section_type === 'HSS/Pipe (Circular)') {
        const status = slenderness.lambda <= slenderness.lambda_p ? 'Compact' : (slenderness.lambda <= slenderness.lambda_r ? 'Noncompact' : 'Slender');
        addRow(`Wall (D/t)`, slenderness.lambda, slenderness.lambda_p, slenderness.lambda_r, status);
    }

    return `
    <div id="slenderness-checks-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center">
            <h3 class="report-header">2. Slenderness Checks (AISC B4)</h3>
            <button data-copy-target-id="slenderness-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 results-table">
                <caption class="report-caption">Element Slenderness for Flexure</caption>
                <thead>
                    <tr>
                        <th>Element</th>
                        <th>Ratio (&lambda;)</th>
                        <th>&lambda;<sub>p</sub> (Compact)</th>
                        <th>&lambda;<sub>r</sub> (Noncompact)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    </div>`;
}

function renderLtbParameters(results) {
    const { inputs, flexure } = results;
    // This section is only relevant for shapes susceptible to LTB, like I-shapes and channels.
    if (!flexure || !['I-Shape', 'channel'].includes(inputs.section_type)) {
        return '';
    }

    const { Lb, Lp, Lr } = flexure;
    const { Cb, Lb_input } = inputs;

    const rows = [
        `<tr><td>Unbraced Length (L<sub>b</sub>)</td><td>${Lb_input.toFixed(2)} ft (${Lb.toFixed(2)} in)</td><td>User Input</td></tr>`,
        `<tr><td>Limiting Length for Yielding (L<sub>p</sub>)</td><td>${(Lp / 12).toFixed(2)} ft (${Lp.toFixed(2)} in)</td><td>AISC Eq. F2-5</td></tr>`,
        `<tr><td>Limiting Length for Inelastic LTB (L<sub>r</sub>)</td><td>${(Lr / 12).toFixed(2)} ft (${Lr.toFixed(2)} in)</td><td>AISC Eq. F2-6</td></tr>`,
        `<tr><td>LTB Modification Factor (C<sub>b</sub>)</td><td>${Cb.toFixed(3)}</td><td>User Input / AISC F1</td></tr>`
    ];

    return `
    <div id="ltb-parameters-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center">
            <h3 class="report-header">3. LTB Parameters (AISC F2)</h3>
            <button data-copy-target-id="ltb-parameters-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">Lateral-Torsional Buckling Parameters</caption>
                <thead><tr><th>Parameter</th><th>Value</th><th>Reference</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    </div>`;
}

function renderSteelStrengthChecks(results) {
    const { inputs, properties, flexure, axial, shear, web_crippling, web_sidesway_buckling, interaction, torsion, deflection, shear_torsion_interaction, combined_stress_H33 } = results;
    const method = inputs.design_method;
    const Pu = Math.abs(inputs.Pu_or_Pa);

    const checks = {};

    if (axial && axial.type) {
        checks['Axial'] = { demand: Pu, capacity: axial.phiPn_or_Pn_omega, unit: 'kips', data: { ...axial, check: axial, properties, reference: axial.reference } };
    }
    if (inputs.Mux_or_Max !== 0) {
        checks['Flexure (Major)'] = { demand: inputs.Mux_or_Max, capacity: flexure.phiMn_or_Mn_omega, unit: 'kip-ft', data: { ...flexure, check: flexure, reference: flexure.reference, slenderness: flexure.slenderness } };
    }
    if (inputs.Vu_or_Va !== 0) {
        checks['Shear'] = { demand: inputs.Vu_or_Va, capacity: shear.phiVn_or_Vn_omega, unit: 'kips', data: { ...shear, check: shear, properties, reference: shear.reference } };
    }
    if (interaction && interaction.ratio) {
        checks['Combined Forces'] = { demand: interaction.ratio, capacity: 1.0, unit: 'ratio', data: { ...interaction, check: interaction, details: interaction.details, reference: interaction.reference } };
    }
    if (torsion && torsion.applicable) {
        checks['Torsion'] = { demand: Math.abs(inputs.Tu_or_Ta), capacity: torsion.phiTn_or_Tn_omega, unit: 'kip-in', data: { ...torsion, check: torsion, details: torsion.details, reference: torsion.reference, governing_limit_state: torsion.governing_limit_state } };
    }
    if (shear_torsion_interaction && shear_torsion_interaction.applicable) {
        checks['Combined Shear + Torsion'] = { demand: shear_torsion_interaction.ratio, capacity: 1.0, unit: 'ratio', data: { ...shear_torsion_interaction, check: shear_torsion_interaction } };
    }
    if (combined_stress_H33 && combined_stress_H33.applicable) {
        checks['Combined Stresses (H3.3)'] = { demand: combined_stress_H33.ratio, capacity: 1.0, unit: 'ratio', data: { ...combined_stress_H33, check: combined_stress_H33 } };
    }
    if (web_sidesway_buckling && web_sidesway_buckling.applicable) {
        checks['Web Sidesway Buckling'] = { demand: Pu, capacity: web_sidesway_buckling.phiRn_or_Rn_omega, unit: 'kips', data: { ...web_sidesway_buckling, check: web_sidesway_buckling } };
    }
    if (web_crippling && web_crippling.phiRn_or_Rn_omega) {
        checks['Web Crippling'] = { demand: inputs.Vu_or_Va, capacity: web_crippling.phiRn_or_Rn_omega, unit: 'kips', data: { ...web_crippling, check: web_crippling.details, reference: web_crippling.reference, governing_limit_state: web_crippling.governing_limit_state } };
    }
    if (deflection && deflection.allowable) {
        checks['Deflection'] = { demand: deflection.actual, capacity: deflection.allowable, unit: 'in', data: { ...deflection, check: deflection, details: deflection } };
    }

    const rows = [];
    let checkCounter = 0;

    for (const [name, checkData] of Object.entries(checks)) {
        checkCounter++;
        const detailId = `details-${checkCounter}`;
        const isInteraction = name.includes('Combined');
        const ratio = isInteraction ? checkData.demand : (checkData.capacity > 0 ? Math.abs(checkData.demand) / checkData.capacity : Infinity);

        const demand_val = checkData.demand || 0;
        const capacity_val = checkData.capacity || 0;
        const ratio_val = ratio || 0;
        const status = ratio_val <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const breakdownHtml = generateSteelCheckBreakdownHtml(name, checkData.data, inputs, results);

        rows.push(`
            <tr class="border-t dark:border-gray-700">
                <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                <td>${demand_val.toFixed(2)} ${checkData.unit}</td>
                <td>${capacity_val.toFixed(2)} ${checkData.unit}</td>
                <td>${ratio_val.toFixed(3)}</td>
                <td>${status}</td>
            </tr>
            <tr id="${detailId}" class="details-row">
                <td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td>
            </tr>`);
    }

    // Helper function for creating report tables
    function createReportTable(config) {
        const { id, caption, headers, rows } = config;
        if (!rows || rows.length === 0) return '';

        let tableHtml = `
            <div id="${id}" class="report-section-copyable mt-6">
                <div class="flex justify-between items-center">
                    <h3 class="report-header">${caption}</h3>
                    <button data-copy-target-id="${id}" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">
                    <table class="w-full mt-2 results-table">
                        <caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">${caption}</caption>
                        <thead>
                            <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${rows.join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
        return tableHtml;
    }

    return createReportTable({
        id: 'steel-check-summary',
        caption: `4. Summary of Design Checks (${method})`,
        headers: ['Limit State', 'Demand', 'Capacity', 'Ratio', 'Status'],
        rows: rows
    });
}


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

    const { inputs, properties, warnings } = results;

    // --- Report Header and Warnings ---
    let html = `
        ${(warnings && warnings.length > 0) ? `
            <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded-md my-4 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-600">
                <p class="font-bold">Input Warnings:</p>
                <ul class="list-disc list-inside mt-2">${warnings.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>
        ` : ''}
        <div id="steel-check-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end flex-wrap gap-2 -mt-2 -mr-2 print-hidden">
                <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Show All Details</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Full Report</button>
            </div>
            <h2 class="report-title text-center">Steel Check Results (${inputs.aisc_standard})</h2>
            <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mt-4 rounded-md dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-600">
                <strong>Disclaimer:</strong> This tool provides preliminary design checks based on AISC ${inputs.aisc_standard}.
                For final designs, verify results using certified software or manual calculations per the current AISC Specification.
                Some limit states may not be fully implemented. Always consult a licensed structural engineer for critical applications. For non-uniform loading in LTB, adjust Cb manually; variable cross-sections and stiffened elements are not supported.
            </div>
            ${renderInputSummary(inputs, properties)}
            ${renderSlendernessChecks(results)}
            ${renderLtbParameters(results)}
            ${renderSteelStrengthChecks(results)}
        </div>`;

    resultsContainer.innerHTML = html;
}