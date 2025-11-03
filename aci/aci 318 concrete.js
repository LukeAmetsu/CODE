// aci 318 concrete.js
console.log('aci 318 concrete.js loaded');
const aciInputIds = [
    'fc', 'fy', 'b', 'h', 'cover', 'num_bars', 'bar_size',
    'stirrup_size', 'stirrup_legs', 'stirrup_spacing', 'Mu', 'Vu'
];

const BAR_AREAS = { 3: 0.11, 4: 0.20, 5: 0.31, 6: 0.44, 7: 0.60, 8: 0.79, 9: 1.00, 10: 1.27, 11: 1.56 };

const aciCalculator = (() => {
    function calculate(inputs) {
        const i = { ...inputs };
        // Convert to base units (lbs, inches)
        i.Mu = i.Mu * 12000;
        i.Vu = i.Vu * 1000;

        const res = {};
        const Es = 29000000; // psi

        // --- Flexure Calculation (ACI 318-19 Ch. 9 & 22) ---
        const stirrup_dia = BAR_AREAS[i.stirrup_size] ? i.stirrup_size / 8 : 0;
        const bar_dia = BAR_AREAS[i.bar_size] ? i.bar_size / 8 : 0;
        const d = i.h - i.cover - stirrup_dia - (bar_dia / 2);
        const As = i.num_bars * (BAR_AREAS[i.bar_size] || 0);
        const beta1 = Math.max(0.65, Math.min(0.85, 0.85 - 0.05 * ((i.fc - 4000) / 1000)));
        const a = (As * i.fy) / (0.85 * i.fc * i.b);
        const c = a / beta1;
        const strain_t = c > 0 ? (d - c) / c * 0.003 : Infinity;
        const phi_f = strain_t >= 0.005 ? 0.90 : (strain_t > (i.fy / Es) ? 0.65 + 0.25 * ((strain_t - (i.fy / Es)) / (0.005 - (i.fy / Es))) : 0.65);
        const Mn = As * i.fy * (d - a / 2);
        res.phiMn = phi_f * Mn;
        res.flexure_details = { d, As, a, c, strain_t, phi_f, Mn };

        // --- Shear Calculation (ACI 318-19 Ch. 22) ---
        const Av = i.stirrup_legs * (BAR_AREAS[i.stirrup_size] || 0);
        const Vc = 2 * Math.sqrt(i.fc) * i.b * d;
        const Vs = (Av * i.fy * d) / i.stirrup_spacing;
        const Vs_max = 8 * Math.sqrt(i.fc) * i.b * d;
        const phi_v = 0.75;
        res.phiVn = phi_v * (Vc + Math.min(Vs, Vs_max));
        res.shear_details = { Vc, Vs, Vs_max, Av, phi_v };

        return { inputs: i, results: res };
    }

    return { calculate };
})();

function generateAciBreakdownHtml(check) {
    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;

    if (check.type === 'flexure') {
        return format_list([
            `<b>${getTranslation('report_effective_depth')} (d):</b> ${check.details.d.toFixed(3)} in`,
            `<b>${getTranslation('report_area_of_steel')} (A<sub>s</sub>):</b> ${check.details.As.toFixed(3)} in²`,
            `<b>${getTranslation('report_depth_comp_block')} (a):</b> ${check.details.a.toFixed(3)} in`,
            `<b>${getTranslation('report_neutral_axis_depth')} (c):</b> ${check.details.c.toFixed(3)} in`,
            `<b>${getTranslation('report_tensile_strain')} (&epsilon;<sub>t</sub>):</b> ${check.details.strain_t.toFixed(5)} (${check.details.strain_t >= 0.005 ? getTranslation('tension_controlled') : getTranslation('transition')})`,
            `<b>${getTranslation('report_strength_reduction_factor')} (&phi;<sub>f</sub>):</b> ${check.details.phi_f.toFixed(3)}`,
        ]);
    }
    if (check.type === 'shear') {
        return format_list([
            `<b>${getTranslation('report_concrete_capacity')} (V<sub>c</sub>):</b> ${(check.details.Vc / 1000).toFixed(2)} kips`,
            `<b>${getTranslation('report_stirrup_capacity')} (V<sub>s</sub>):</b> ${(check.details.Vs / 1000).toFixed(2)} kips`,
            `<b>${getTranslation('report_max_stirrup_capacity')} (V<sub>s,max</sub>):</b> ${(check.details.Vs_max / 1000).toFixed(2)} kips`,
        ]);
    }
    return getTranslation('details_not_available');
}

function renderAciResults(calc_results) {
    const { inputs, results } = calc_results;

    const report = new ReportBuilder({
        reportId: 'aci-report-content',
        title: getTranslation('report_title_aci'),
    });

    const inputRows = [
        { cells: [getTranslation('concrete_strength_fc'), `${calc_results.inputs.fc} psi`] },
        { cells: [getTranslation('steel_yield_strength_fy'), `${calc_results.inputs.fy} psi`] },
        { cells: [getTranslation('beam_geometry_b_h'), `${calc_results.inputs.b}" x ${calc_results.inputs.h}"`] },
        { cells: [getTranslation('flexural_reinforcement'), `${calc_results.inputs.num_bars} - #${calc_results.inputs.bar_size} bars`] },
        { cells: [getTranslation('shear_reinforcement'), `#${calc_results.inputs.stirrup_size} @ ${calc_results.inputs.stirrup_spacing}" (${calc_results.inputs.stirrup_legs} legs)`] },
        { cells: [getTranslation('factored_moment_mu'), `${calc_results.inputs.Mu / 12000} kip-ft`] },
        { cells: [getTranslation('factored_shear_vu'), `${calc_results.inputs.Vu / 1000} kips`] },
    ];
    report.addTableSection(getTranslation('input_summary'), { headers: [getTranslation('parameter'), getTranslation('value')], rows: inputRows }, 'aci-input-summary');

    const M_ratio = results.phiMn > 0 ? inputs.Mu / results.phiMn : Infinity;
    const V_ratio = results.phiVn > 0 ? inputs.Vu / results.phiVn : Infinity;

    const flexureRow = {
        cells: [getTranslation('moment_capacity'), `${(inputs.Mu / 12000).toFixed(2)} kip-ft`, `${(results.phiMn / 12000).toFixed(2)} kip-ft`, M_ratio.toFixed(3), `${(M_ratio * 100).toFixed(1)}%`, M_ratio <= 1.0 ? `<span class="pass">${getTranslation('pass')}</span>` : `<span class="fail">${getTranslation('fail')}</span>`],
        details: generateAciBreakdownHtml({ type: 'flexure', details: results.flexure_details })
    };
    report.addTableSection(getTranslation('flexural_design_check'), {
        headers: [getTranslation('check'), getTranslation('demand'), getTranslation('capacity'), getTranslation('ratio'), getTranslation('utilization_pct'), getTranslation('status')],
        rows: [flexureRow]
    }, 'aci-flexure-check');

    const shearRow = {
        cells: [getTranslation('shear_capacity'), `${(inputs.Vu / 1000).toFixed(2)} kips`, `${(results.phiVn / 1000).toFixed(2)} kips`, V_ratio.toFixed(3), `${(V_ratio * 100).toFixed(1)}%`, V_ratio <= 1.0 ? `<span class="pass">${getTranslation('pass')}</span>` : `<span class="fail">${getTranslation('fail')}</span>`],
        details: generateAciBreakdownHtml({ type: 'shear', details: results.shear_details })
    };
    report.addTableSection(getTranslation('shear_design_check'), {
        headers: [getTranslation('check'), getTranslation('demand'), getTranslation('capacity'), getTranslation('ratio'), getTranslation('utilization_pct'), getTranslation('status')],
        rows: [shearRow]
    }, 'aci-shear-check');

    report.render('results-container');
}

const handleRunAciCheck = createCalculationHandler({
    inputIds: aciInputIds,
    storageKey: 'aci-concrete-inputs',
    validationRuleKey: 'aci_concrete',
    calculatorFunction: aciCalculator.calculate,
    renderFunction: renderAciResults,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn',
    reportId: 'aci-report-content',
    filenamePrefix: 'ACI-318-Concrete-Report'
});

initializeApp({
    inputIds: aciInputIds,
    calculationHandler: handleRunAciCheck
});