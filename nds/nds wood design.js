var lastWoodRunResults = null; // To hold the results for report generation

var inputIds = [
    'Fb_unadjusted', 'Fv_unadjusted', 'Fc_perp_unadjusted', 'Fc_unadjusted', 'E_unadjusted', 'E_min_unadjusted', 'jurisdiction',
    'b_width', 'd_depth', 'unbraced_length_L', 'effective_length_factor_K', 'bearing_length_Lb',
    'load_duration', 'wet_service', 'temperature', 'flat_use', 'incising', 'repetitive_member', 'deflection_span', 'deflection_limit',
    'axial_load_P', 'moment_load_M', 'shear_load_V'
];

// --- Backend Integration ---
var woodChecker = {
    run: async (inputs) => {
        if (typeof eel === 'undefined') {
            console.error("Eel is not loaded. Make sure the server is running.");
            return { error: "Backend connection failed." };
        }
        // Pass inputs to Python backend
        // Note: Python returns a dict matching the structure expected by renderWoodResults
        return await eel.calculate_wood_nds(inputs)();
    }
};

// --- Species & Grade Logic ---
let woodDatabase = {};

async function initWoodPage() {
    if (typeof eel !== 'undefined') {
        try {
            woodDatabase = await eel.get_wood_species()();
            populateSpeciesDropdown();
        } catch (e) {
            console.error("Failed to load wood species:", e);
        }
    }
}

function populateSpeciesDropdown() {
    const selector = document.getElementById('wood_selector');
    if (!selector) return;

    // Clear existing (except first)
    selector.innerHTML = '<option value="">Custom (Manual Input)</option>';

    Object.keys(woodDatabase).forEach(species => {
        const group = document.createElement('optgroup');
        group.label = species;

        Object.keys(woodDatabase[species]).forEach(grade => {
            const option = document.createElement('option');
            option.value = `${species}|${grade}`;
            option.textContent = `${species} - ${grade}`;
            group.appendChild(option);
        });
        selector.appendChild(group);
    });

    selector.addEventListener('change', onWoodSelectionChange);
}

function onWoodSelectionChange(e) {
    const val = e.target.value;
    if (!val) {
        // Custom selected: Unlock inputs? Or just leave as is.
        // Optional: unlock inputs
        toggleInputLocks(false);
        return;
    }

    const [species, grade] = val.split('|');
    if (woodDatabase[species] && woodDatabase[species][grade]) {
        const props = woodDatabase[species][grade];

        // Populate inputs
        setInputValue('Fb_unadjusted', props.Fb);
        setInputValue('Fv_unadjusted', props.Fv);
        setInputValue('Fc_perp_unadjusted', props.Fcp); // Dict uses Fcp
        setInputValue('Fc_unadjusted', props.Fc);
        setInputValue('E_unadjusted', props.E);
        setInputValue('E_min_unadjusted', props.Emin); // Dict uses Emin

        // Lock inputs to prevent confusion?
        // toggleInputLocks(true);
    }
}

function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function toggleInputLocks(locked) {
    const ids = ['Fb_unadjusted', 'Fv_unadjusted', 'Fc_perp_unadjusted', 'Fc_unadjusted', 'E_unadjusted', 'E_min_unadjusted'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.readOnly = locked;
            el.classList.toggle('bg-gray-100', locked);
            el.classList.toggle('bg-white', !locked);
        }
    });
}

var handleRunWoodCheck = createCalculationHandler({
    inputIds: inputIds,
    storageKey: 'wood-design-inputs',
    validationRuleKey: 'wood',
    calculatorFunction: woodChecker.run,
    renderFunction: renderWoodResults,
    resultsContainerId: 'wood-results-container',
    buttonId: 'run-wood-check-btn'
});

initializeApp({
    inputIds: inputIds,
    calculationHandler: handleRunWoodCheck,
    buttonId: 'run-wood-check-btn'
});

document.addEventListener('DOMContentLoaded', () => {
    initWoodPage();
});

function renderWoodResults(calculationOutput) {
    lastWoodRunResults = calculationOutput;
    const wood_results = calculationOutput;
    const adj = wood_results.adjusted;
    const actual = wood_results.actuals;
    const ratios = wood_results.ratios;
    const deflection = wood_results.deflection;
    const inputs = wood_results.inputs; // Use processed inputs

    const checks = [
        { // Flexure
            name: 'Flexure (Bending)',
            actual: `${actual.fb.toFixed(2)} psi`,
            allowable: `${adj.Fb_prime.toFixed(2)} psi`,
            ratio: ratios.fb.toFixed(3),
            status: ratios.fb <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `
                <ul>
                    <li>Actual Bending Stress (f<sub>b</sub>) = M / S<sub>x</sub> = ${inputs.M.toFixed(0)} lb-in / ${actual.Sx.toFixed(3)} in³ = <b>${actual.fb.toFixed(2)} psi</b></li>
                    <li>Allowable Bending Stress (F'<sub>b</sub>) = F<sub>b</sub> * C<sub>D</sub> * C<sub>M</sub> * C<sub>t</sub> * C<sub>L</sub> * C<sub>F</sub> * C<sub>i</sub> * C<sub>r</sub> * C<sub>OSHA</sub></li>
                    <li>F'<sub>b</sub> = ${inputs.Fb.toFixed(0)} * ${wood_results.factors.CD.toFixed(2)} * ${wood_results.factors.CM_Fb.toFixed(2)} * ${wood_results.factors.Ct.toFixed(2)} * ${wood_results.factors.CL.toFixed(3)} * ${wood_results.factors.CF.toFixed(3)} * ${wood_results.factors.Ci.toFixed(2)} * ${wood_results.factors.Cr.toFixed(2)} * ${wood_results.factors.C_OSHA.toFixed(2)} = <b>${adj.Fb_prime.toFixed(2)} psi</b></li>
                    <li>Beam Stability Factor (C<sub>L</sub>) = <b>${wood_results.factors.CL.toFixed(3)}</b> (from R<sub>B</sub> = ${wood_results.Rb.toFixed(2)})</li>
                </ul>`
        },
        { // Shear
            name: 'Shear',
            actual: `${actual.fv.toFixed(2)} psi`,
            allowable: `${adj.Fv_prime.toFixed(2)} psi`,
            ratio: ratios.fv.toFixed(3),
            status: ratios.fv <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `
                <ul>
                    <li>Actual Shear Stress (f<sub>v</sub>) = 1.5 * V / A = 1.5 * ${inputs.V.toFixed(0)} lb / ${actual.A.toFixed(3)} in² = <b>${actual.fv.toFixed(2)} psi</b></li>
                    <li>Allowable Shear Stress (F'<sub>v</sub>) = F<sub>v</sub> * C<sub>D</sub> * C<sub>M</sub> * C<sub>t</sub> * C<sub>i</sub> * C<sub>OSHA</sub></li>
                    <li>F'<sub>v</sub> = ${inputs.Fv.toFixed(0)} * ${wood_results.factors.CD.toFixed(2)} * ${wood_results.factors.CM_Fv.toFixed(2)} * ${wood_results.factors.Ct.toFixed(2)} * ${wood_results.factors.Ci.toFixed(2)} * ${wood_results.factors.C_OSHA.toFixed(2)} = <b>${adj.Fv_prime.toFixed(2)} psi</b></li>
                </ul>`
        },
        { // Compression
            name: 'Compression',
            actual: `${actual.fc.toFixed(2)} psi`,
            allowable: `${adj.Fc_prime.toFixed(2)} psi`,
            ratio: ratios.fc.toFixed(3),
            status: ratios.fc <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `
                <ul>
                    <li>Actual Compression Stress (f<sub>c</sub>) = P / A = ${inputs.P.toFixed(0)} lb / ${actual.A.toFixed(3)} in² = <b>${actual.fc.toFixed(2)} psi</b></li>
                    <li>Allowable Compression Stress (F'<sub>c</sub>) = F<sub>c</sub>* * C<sub>P</sub> * C<sub>OSHA</sub> = ${wood_results.Fc_star.toFixed(2)} psi * ${wood_results.factors.Cp.toFixed(3)} * ${wood_results.factors.C_OSHA.toFixed(2)} = <b>${adj.Fc_prime.toFixed(2)} psi</b></li>
                    <li>Column Stability Factor (C<sub>P</sub>) = <b>${wood_results.factors.Cp.toFixed(3)}</b> (from L<sub>e</sub>/d = ${wood_results.Le_d.toFixed(2)})</li>
                </ul>`
        },
        { // Deflection
            name: 'Deflection',
            actual: `${deflection.actual.toFixed(3)} in`,
            allowable: `${deflection.allowable.toFixed(3)} in (L/${inputs.deflection_limit_divisor.toFixed(0)})`,
            ratio: deflection.ratio.toFixed(3),
            status: deflection.ratio <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `
                <ul>
                    <li>Allowable Deflection = Span / ${inputs.deflection_limit_divisor.toFixed(0)} = ${inputs.deflection_span.toFixed(2)} in / ${inputs.deflection_limit_divisor.toFixed(0)} = <b>${deflection.allowable.toFixed(3)} in</b></li>
                    <li>Actual Deflection (δ) = 5*M*L² / (48*E'*I) = (5 * ${inputs.M.toFixed(0)} * ${inputs.deflection_span.toFixed(2)}²) / (48 * ${deflection.E_adj.toExponential(2)} * ${(actual.Sx * inputs.d / 2).toFixed(2)}) = <b>${deflection.actual.toFixed(3)} in</b></li>
                </ul>`
        },
        { // Interaction
            name: 'Combined Bending + Axial',
            actual: `Eq. 3.9-3`,
            allowable: "1.00",
            ratio: wood_results.interaction.toFixed(3),
            status: wood_results.interaction <= 1.0 ? 'Pass' : 'Fail',
            breakdown: `
                <ul>
                    <li>Equation: (f<sub>c</sub> / F'<sub>c</sub>)² + f<sub>b</sub> / (F'<sub>b</sub> * (1 - f<sub>c</sub>/F<sub>cE</sub>))</li>
                    <li>Interaction = (${actual.fc.toFixed(2)} / ${adj.Fc_prime.toFixed(2)})² + ${actual.fb.toFixed(2)} / (${adj.Fb_prime.toFixed(2)} * (1 - ${actual.fc.toFixed(2)}/${wood_results.Fce.toFixed(2)})) = <b>${wood_results.interaction.toFixed(3)}</b></li>
                </ul>`
        }
    ];

    const report = new ReportBuilder({
        reportId: 'wood-report-content',
        title: 'NDS Wood Member Check Summary (ASD)'
    });

    const factorRows = Object.entries(wood_results.factors).map(([key, value]) => {
        const factorMap = {
            CD: { name: 'Load Duration (C<sub>D</sub>)', ref: 'NDS 2.3.2' },
            CM_Fb: { name: 'Wet Service (C<sub>M,Fb</sub>)', ref: 'NDS Table 4.3.1' },
            CM_Fv: { name: 'Wet Service (C<sub>M,Fv</sub>)', ref: 'NDS Table 4.3.1' }, // Added safely
            CM_Fc: { name: 'Wet Service (C<sub>M,Fc</sub>)', ref: 'NDS Table 4.3.1' },
            CM_Fc_perp: { name: 'Wet Service (C<sub>M,Fc_perp</sub>)', ref: 'NDS Table 4.3.1' },
            CM_E: { name: 'Wet Service (C<sub>M,E</sub>)', ref: 'NDS Table 4.3.1' },
            CM_E_min: { name: 'Wet Service (C<sub>M,Emin</sub>)', ref: 'NDS Table 4.3.1' },
            Ct: { name: 'Temperature (C<sub>t</sub>)', ref: 'NDS 2.3.3' },
            CF: { name: 'Size Factor (C<sub>F</sub>)', ref: 'NDS 4.3.6' },
            Ci: { name: 'Incising (C<sub>i</sub>)', ref: 'NDS 4.3.8' },
            Cr: { name: 'Repetitive Member (C<sub>r</sub>)', ref: 'NDS 4.3.9' },
            Cb: { name: 'Bearing Area (C<sub>b</sub>)', ref: 'NDS 3.10.4' },
            CL: { name: 'Beam Stability (C<sub>L</sub>)', ref: 'NDS 3.3.3' },
            Cp: { name: 'Column Stability (C<sub>P</sub>)', ref: 'NDS 3.7.1' },
            C_OSHA: { name: 'OSHA Safety Factor (C<sub>OSHA</sub>)', ref: 'OSHA 1926' },
        };
        const info = factorMap[key];
        if (info) {
            return { cells: [info.name, value.toFixed(3), info.ref] };
        }
        // Handle specific CM keys if multiple might appear?
        // JS loop iterates factors. Keys like CM_Fb exist.
        return null;
    }).filter(Boolean);

    report.addTableSection('NDS Adjustment Factors', { headers: ['Factor', 'Value', 'Reference'], rows: factorRows }, 'wood-factors-section');

    const checkRows = checks.map(check => ({
        cells: [check.name, check.actual, check.allowable, check.ratio, check.status],
        details: check.breakdown
    }));

    report.addTableSection('Strength & Serviceability Checks', {
        headers: ['Check', 'Actual', 'Allowable', 'Ratio', 'Status'],
        rows: checkRows
    });

    report.render('wood-results-container');
}