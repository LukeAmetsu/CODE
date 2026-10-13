let lastRainRunResults = null;

const rainInputIds = [
    'rain_asce_standard', 'rain_unit_system', 'rain_design_method', 'rain_jurisdiction', 'rain_tributary_area',
    'rain_intensity', 'rain_static_head', 'rain_hydraulic_head', 'dh_auto_calc_toggle', 'rain_drain_type', 'rain_scupper_width', 'rain_drain_diameter'
];

const rainLoadCalculator = (() => {
    function run(inputs) {
        // Use default values to prevent NaN errors if optional fields are empty
        const {
            rain_static_head: ds = 0,
            rain_hydraulic_head: dh_manual = 0,
            rain_intensity: i = 0,
            rain_tributary_area: A = 0,
            rain_unit_system: unit_system,
            rain_jurisdiction: jurisdiction,
            dh_auto_calc_toggle: dh_auto_calc,
            rain_drain_type: drain_type,
            rain_scupper_width: scupper_width = 0,
            rain_drain_diameter: drain_diameter = 0
        } = inputs;

        let dh = dh_manual; // Start with manual value
        let dh_calc_note = "";
        const warnings = [];
        const is_metric = unit_system === 'metric';

        if (dh_auto_calc) {
            // Per IPC, Q (gpm) = 0.0104 * A (sqft) * i (in/hr)
            const A_sqft = is_metric ? A * 10.7639 : A;
            const i_in = is_metric ? i / 25.4 : i;
            const Q_gpm = 0.0104 * A_sqft * i_in;
            
            if (drain_type === 'scupper') {
                const scupper_width_in = is_metric ? scupper_width / 25.4 : scupper_width;
                if (scupper_width_in > 0) {
                    const dh_in = Math.pow(Q_gpm / (213 * scupper_width_in), 2/3);
                    dh = is_metric ? dh_in * 25.4 : dh_in;
                    dh_calc_note = `d_h calculated from Q = ${Q_gpm.toFixed(1)} gpm and a ${scupper_width}-${is_metric ? 'mm' : 'in'} wide scupper.`;
                } else {
                    dh = 0;
                    dh_calc_note = "Scupper width must be > 0 to calculate d_h.";
                }
            } else { // drain
                const drain_diameter_in = is_metric ? drain_diameter / 25.4 : drain_diameter;
                if (drain_diameter_in > 0) {
                    const dh_in = Math.pow(Q_gpm / (24.5 * Math.pow(drain_diameter_in, 2)), 2);
                    dh = is_metric ? dh_in * 25.4 : dh_in;
                    dh_calc_note = `d_h calculated from Q = ${Q_gpm.toFixed(1)} gpm and a ${drain_diameter}-${is_metric ? 'mm' : 'in'} diameter drain.`;
                } else {
                    dh = 0;
                    dh_calc_note = "Drain diameter must be > 0 to calculate d_h.";
                }
            }
        }

        if (dh > ds) {
            warnings.push(`The calculated hydraulic head ($d_h =$ ${dh.toFixed(2)}) is greater than the static head ($d_s =$ ${ds.toFixed(2)}). This indicates the secondary drainage system may be undersized for the given rainfall intensity and could lead to ponding instability. Review drainage design.`);
        }

        const R_nominal = is_metric ? 0.0098 * (ds + dh) : 5.2 * (ds + dh);
        const jurisdiction_note = (jurisdiction === "NYCBC 2022") ? "NYCBC 2022 adopts ASCE 7-16 for rain loads. Note: The hydraulic head (dh) must be based on the 100-year hourly rainfall rate of 4 in/hr as per the NYC Plumbing Code." : "";

        return {
            inputs,
            results: {
                R_nominal, dh_final: dh,
                R_strength: 1.6 * R_nominal,
                R_asd: 1.0 * R_nominal
            },
            jurisdiction_note,
            dh_calc_note,
            warnings,
            success: true
        };
    }
    return { run };
})();

const handleRunRainCheck = createCalculationHandler({
    inputIds: rainInputIds,
    storageKey: 'rain-calculator-inputs',
    validationRuleKey: 'rain', // This key is used for validation and report naming
    calculatorFunction: (inputs, validation) => rainLoadCalculator.run(inputs, validation),
    renderFunction: renderRainResults,
    resultsContainerId: 'rain-results-container',
    buttonId: 'run-rain-calculation-btn',
    feedbackElId: 'feedback-message'
});

initializeApp({
    inputIds: rainInputIds,
    buttonId: 'run-rain-calculation-btn',
    calculationHandler: handleRunRainCheck,
    onReady: () => {
        const unitSelect = document.getElementById('rain_unit_system');
        const updateBadges = (unit) => {
            const is_m = unit === 'metric';
            document.querySelectorAll('.rain-d-unit').forEach(el => el.textContent = is_m ? '[mm]' : '[in]');
            document.querySelectorAll('.rain-a-unit').forEach(el => el.textContent = is_m ? '[m²]' : '[ft²]');
            document.querySelectorAll('.rain-i-unit').forEach(el => el.textContent = is_m ? '[mm/hr]' : '[in/hr]');
        };

        if (unitSelect) {
            let currentUnit = unitSelect.value || 'imperial';
            updateBadges(currentUnit);

            unitSelect.addEventListener('change', (e) => {
                const newUnit = e.target.value;
                if (newUnit === currentUnit) return;

                const dFactor = newUnit === 'metric' ? 25.4 : (1 / 25.4);
                const aFactor = newUnit === 'metric' ? 0.092903 : (1 / 0.092903);
                const iFactor = newUnit === 'metric' ? 25.4 : (1 / 25.4);

                const dFields = ['rain_static_head', 'rain_hydraulic_head', 'rain_scupper_width', 'rain_drain_diameter'];
                dFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.value !== '') {
                        const v = parseFloat(el.value);
                        if (!isNaN(v) && v !== 0) el.value = (v * dFactor).toFixed(1);
                    }
                });
                const aEl = document.getElementById('rain_tributary_area');
                if (aEl && aEl.value !== '') {
                    const v = parseFloat(aEl.value);
                    if (!isNaN(v) && v !== 0) aEl.value = (v * aFactor).toFixed(0);
                }
                const iEl = document.getElementById('rain_intensity');
                if (iEl && iEl.value !== '') {
                    const v = parseFloat(iEl.value);
                    if (!isNaN(v) && v !== 0) iEl.value = (v * iFactor).toFixed(1);
                }

                currentUnit = newUnit;
                updateBadges(newUnit);
                document.getElementById('run-rain-calculation-btn')?.click();
            });
        }

        document.getElementById('rain_city_selector').addEventListener('change', (event) => {
            const intensity = event.target.value;
            if (intensity) {
                const is_m = document.getElementById('rain_unit_system')?.value === 'metric';
                const val = parseFloat(intensity);
                document.getElementById('rain_intensity').value = is_m ? (val * 25.4).toFixed(1) : val.toFixed(1);
            }
        });
    }
});

function generateRainSummary(inputs, results, p_unit, dh_calc_note) {
    const { R_strength, R_asd } = results;
    const finalLoad = (inputs.design_method === 'ASD') ? R_asd : R_strength;
    const noteHtml = dh_calc_note ? `<p class="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">${dh_calc_note}</p>` : '';

    return `<div class="border rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
                <h3 class="text-xl font-semibold text-center mb-4">Governing Load Summary (${inputs.design_method})</h3>
                <div class="text-center">
                    <p class="text-4xl font-bold">${finalLoad.toFixed(2)} <span class="text-2xl font-medium">${p_unit}</span></p>
                    ${noteHtml}
                </div>
            </div>`;
}

function renderRainResults(results) {
    if (!results || !results.success) return;
    lastRainRunResults = results;
    const { inputs, jurisdiction_note, dh_calc_note, warnings } = results;
    const { R_nominal, R_strength, R_asd, dh_final } = results.results;
    const p_unit = inputs.rain_unit_system === 'imperial' ? 'psf' : 'kPa';
    const d_unit = inputs.rain_unit_system === 'imperial' ? 'in' : 'mm';
    const i_unit = inputs.rain_unit_system === 'imperial' ? 'in/hr' : 'mm/hr';
    const a_unit = inputs.rain_unit_system === 'imperial' ? 'ft²' : 'm²';

    const report = new ReportBuilder({
        reportId: 'rain-report-content',
        title: `RAIN LOAD CALCULATION REPORT (${inputs.rain_asce_standard})`,
        actionButtons: [
            { id: 'send-to-combos-btn', text: 'Send to Combos', classes: 'bg-purple-600 hover:bg-purple-700' }
        ]
    });

    const factor = inputs.rain_unit_system === 'imperial' ? '5.2' : '0.0098';
    const paramsHtml = `<ul class="summary-list">
        <li><strong>Tributary Area ($A$):</strong> ${(inputs.rain_tributary_area || 0).toFixed(0)} ${a_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>
        <li><strong>Rainfall Intensity ($i$):</strong> ${(inputs.rain_intensity || 0).toFixed(2)} ${i_unit} <span class="ref">[Plumbing Code / ASCE 7, C8.3]</span></li>
        <li><strong>Static Head ($d_s$):</strong> ${(inputs.rain_static_head || 0).toFixed(2)} ${d_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>
        <li><strong>Hydraulic Head ($d_h$):</strong> ${dh_final.toFixed(2)} ${d_unit} <span class="ref">[ASCE 7, Sec. 8.2]</span></li>
        ${inputs.dh_auto_calc_toggle ? `<li><span class="pl-4 text-sm text-gray-500 dark:text-gray-400">&hookrightarrow; ${dh_calc_note}</span></li>` : ''}
        <li><strong>Nominal Rain Load ($R$):</strong> ${R_nominal.toFixed(2)} ${p_unit} <span class="ref">[ASCE 7, Eq. 8.3-1]</span></li>
    </ul>`;
    report.addSection('Design Parameters', paramsHtml, 'rain-params-section');

    const summaryHtml = generateRainSummary({ design_method: inputs.rain_design_method }, results.results, p_unit, dh_calc_note);
    report.addSection('Governing Load Summary', summaryHtml, 'rain-summary-section');

    const breakdownHtml = `<ul class="space-y-2">
        <li><strong>Formula (ASCE 7 Eq 8.3-1):</strong> $R = ${factor} \cdot (d_s + d_h)$</li>
        <li><strong>Static Head ($d_s$):</strong> ${(inputs.rain_static_head || 0).toFixed(2)} ${d_unit}</li>
        ${inputs.dh_auto_calc_toggle ? `<li><strong>Hydraulic Head (d<sub>h</sub>) Calculation:</strong><ul class="list-disc list-inside pl-4 text-sm"><li>${dh_calc_note}</li><li>Calculated $d_h$ = <b>${dh_final.toFixed(2)} ${d_unit}</b></li></ul></li>` : `<li><strong>Hydraulic Head ($d_h$):</strong> ${dh_final.toFixed(2)} ${d_unit}</li>`}
        <li><strong>Nominal Load ($R$):</strong> $R = ${factor} \cdot (${(inputs.rain_static_head || 0).toFixed(2)} + ${dh_final.toFixed(2)}) =$ <b>${R_nominal.toFixed(2)} ${p_unit}</b></li>
        <hr class="dark:border-gray-600 my-4">
        <p><strong>Strength Design Load (LRFD):</strong> 1.6 * ${R_nominal.toFixed(2)} = <strong>${R_strength.toFixed(2)} ${p_unit}</strong></p>
        <p><strong>Allowable Stress Design Load (ASD):</strong> 1.0 * ${R_nominal.toFixed(2)} = <strong>${R_asd.toFixed(2)} ${p_unit}</strong></p>
    </ul>`;
    report.addSection('Calculation Breakdown', breakdownHtml, 'rain-breakdown-section');

    report.render('rain-results-container');
}