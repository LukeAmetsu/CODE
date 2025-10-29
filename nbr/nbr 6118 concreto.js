// nbr 6118 concreto.js
console.log('nbr 6118 concreto.js loaded');
const nbr6118InputIds = [
    'fck', 'fyk', 'bw', 'h', 'c', 'num_barras', 'diam_barra',
    'diam_estribo', 'pernas_estribo', 's_estribo', 'Msd', 'Vsd'
];

const nbr6118Calculator = (() => {
    function calculate(inputs) {
        const i = { ...inputs };
        // Convert to base units (kN, cm)
        i.Msd = i.Msd * 100; // kN·m to kN·cm

        const res = {};
        const gamma_c = 1.4, gamma_s = 1.15;
        const fcd = i.fck / gamma_c;
        const fyd = i.fyk / gamma_s;

        // Flexão
        const d = i.h - i.c - (i.diam_estribo / 10) - (i.diam_barra / 20);
        const As = i.num_barras * (Math.PI * (i.diam_barra / 10) ** 2 / 4);
        const x = (As * fyd) / (0.85 * fcd * 0.8 * i.bw);
        const x_d_ratio = d > 0 ? x / d : Infinity;
        const dominio = x_d_ratio <= 0.45 ? '2 ou 3 (Dúctil)' : '4 ou 5 (Frágil)';
        const Mrd = As * fyd * (d - 0.4 * x);
        res.flexure_details = { Mrd, d, As, x, x_d_ratio, dominio };

        // Cisalhamento
        const Asw = i.pernas_estribo * (Math.PI * (i.diam_estribo / 10) ** 2 / 4);
        const fctd = (0.21 * Math.pow(i.fck, 2 / 3)) / gamma_c;
        const Vc = 0.6 * fctd * i.bw * d;
        const Vsw = (Asw / i.s_estribo) * 0.9 * d * fyd;
        const VRd2 = 0.27 * (1 - i.fck / 250) * fcd * i.bw * (0.9 * d);
        const VRd = Vc + Vsw;
        res.shear_details = { VRd, Vc, Vsw, VRd2 };

        return { inputs: i, results: res };
    }

    return { calculate };
})();

function generateConcreteBreakdownHtml(check) {
    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;

    switch (check.name) {
        case 'Flexão':
            return format_list([
                `<b>Altura Útil (d):</b> ${check.details.d.toFixed(2)} cm`,
                `<b>Área de Aço (A<sub>s</sub>):</b> ${check.details.As.toFixed(2)} cm²`,
                `<b>Linha Neutra (x):</b> ${check.details.x.toFixed(2)} cm`,
                `<b>Relação x/d:</b> ${check.details.x_d_ratio.toFixed(3)} (${check.details.dominio})`,
                `<b>Momento Resistente (M<sub>Rd</sub>):</b> A<sub>s</sub> &times; f<sub>yd</sub> &times; (d - 0.4x) = <b>${(check.capacity).toFixed(2)} kN·m</b>`
            ]);
        case 'Cisalhamento':
            return format_list([
                `<b>Contribuição do Concreto (V<sub>c</sub>):</b> 0.6 &times; f<sub>ctd</sub> &times; b<sub>w</sub> &times; d = <b>${check.details.Vc.toFixed(2)} kN</b>`,
                `<b>Contribuição dos Estribos (V<sub>sw</sub>):</b> (A<sub>sw</sub>/s) &times; 0.9d &times; f<sub>yd</sub> = <b>${check.details.Vsw.toFixed(2)} kN</b>`,
                `<b>Força Cortante Resistente (V<sub>Rd</sub>):</b> V<sub>c</sub> + V<sub>sw</sub> = <b>${check.capacity.toFixed(2)} kN</b>`
            ]);
        case 'Verif. Biela Comprimida':
            return format_list([
                `<b>Resistência Máxima (V<sub>Rd2</sub>):</b> 0.27 &times; (1 - f<sub>ck</sub>/250) &times; f<sub>cd</sub> &times; b<sub>w</sub> &times; 0.9d = <b>${check.capacity.toFixed(2)} kN</b>`
            ]);
        default: return 'Detalhes não disponíveis.';
    }
}

function renderNbrResults(calc_results) {
    const { inputs, results } = calc_results;

    const checks = [
        {
            name: 'Flexão',
            demand: inputs.Msd / 100,
            capacity: results.flexure_details.Mrd / 100,
            ratio: (results.flexure_details.Mrd > 0) ? inputs.Msd / results.flexure_details.Mrd : Infinity,
            unit: 'kN·m',
            details: results.flexure_details
        },
        {
            name: 'Cisalhamento',
            demand: inputs.Vsd,
            capacity: results.shear_details.VRd,
            ratio: (results.shear_details.VRd > 0) ? inputs.Vsd / results.shear_details.VRd : Infinity,
            unit: 'kN',
            details: results.shear_details
        },
        {
            name: 'Verif. Biela Comprimida',
            demand: inputs.Vsd,
            capacity: results.shear_details.VRd2,
            ratio: (results.shear_details.VRd2 > 0) ? inputs.Vsd / results.shear_details.VRd2 : Infinity,
            unit: 'kN',
            details: results.shear_details
        }
    ];

    const report = new ReportBuilder({
        reportId: 'concrete-report-content',
        title: 'Relatório de Verificação Detalhado (NBR 6118)',
    });

    const inputRows = [
        { cells: ['Resist. Concreto (f<sub>ck</sub>)', `${inputs.fck} MPa`] },
        { cells: ['Resist. Aço (f<sub>yk</sub>)', `${inputs.fyk} MPa`] },
        { cells: ['Largura da Viga (b<sub>w</sub>)', `${inputs.bw} cm`] },
        { cells: ['Altura da Viga (h)', `${inputs.h} cm`] },
        { cells: ['Cobrimento (c)', `${inputs.c} cm`] },
        { cells: ['Armadura de Flexão', `${inputs.num_barras} &Phi; ${inputs.diam_barra} mm`] },
        { cells: ['Armadura de Cisalhamento', `&Phi; ${inputs.diam_estribo} c/ ${inputs.s_estribo} cm (${inputs.pernas_estribo} ramos)`] },
        { cells: ['Momento Solicitante (M<sub>Sd</sub>)', `${inputs.Msd / 100} kN·m`] },
        { cells: ['Força Cortante (V<sub>Sd</sub>)', `${inputs.Vsd} kN`] }
    ];
    report.addTableSection('Resumo dos Dados de Entrada', { headers: ['Parâmetro', 'Valor'], rows: inputRows }, 'input-summary-section');
    
    const tableRows = checks.map(check => {
        return {
            cells: [
                check.name,
                `${check.demand.toFixed(2)} ${check.unit}`,
                `${check.capacity.toFixed(2)} ${check.unit}`,
                check.ratio.toFixed(3),
                `${(check.ratio * 100).toFixed(1)}%`,
                check.ratio <= 1.0 ? '<span class="pass">OK</span>' : '<span class="fail">FALHA</span>'
            ],
            details: generateConcreteBreakdownHtml(check)
        };
    });

    report.addTableSection('Verificações de Cálculo (ELU)', {
        headers: ['Verificação', 'Solicitante', 'Resistente', 'Razão', 'Utilização (%)', 'Status'],
        rows: tableRows
    }, 'concrete-checks-table');

    report.render('results-container');
}

const handleRunNbrCheck = createCalculationHandler({
    inputIds: nbr6118InputIds,
    storageKey: 'nbr6118-inputs',
    validationRuleKey: 'nbr_concreto', // This key is used for validation and report naming
    calculatorFunction: nbr6118Calculator.calculate,
    renderFunction: renderNbrResults,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn',
    reportId: 'concrete-report-content',
    filenamePrefix: 'NBR-6118-Concrete-Report'
});

initializeApp({
    // pageKey and pageTitle are now found automatically
    inputIds: nbr6118InputIds,
    calculationHandler: handleRunNbrCheck
});