// nbr 7190 madeira.js
console.log('nbr 7190 madeira.js loaded');
const nbr7190InputIds = [
    'fc0k', 'fvk', 'Ec0_ef', 'b', 'h', 'L', 'kmod1', 'kmod2', 'Msd', 'Vsd'
];

const nbr7190Calculator = (() => {
    function calculate(inputs) {
        console.group('--- NBR 7190 Wood Calculation ---');
        console.log('1. Raw Inputs:', JSON.parse(JSON.stringify(inputs)));

        const i = { ...inputs };
        // Convert to base units (kN, cm)
        i.Msd = i.Msd * 100; // kN·m to kN·cm

        const res = {};
        const gamma_wc = 1.4; // Coníferas
        const gamma_wv = 1.8;

        const kmod = i.kmod1 * i.kmod2 * 1.0; // kmod3 = 1.0
        console.log('2. Intermediate Factors:', { kmod, gamma_wc, gamma_wv });


        // Resistências de Cálculo
        res.fcd = (kmod * i.fc0k) / gamma_wc; // MPa
        res.fvd = (kmod * i.fvk) / gamma_wv; // MPa
        console.log('3. Design Strengths (MPa):', { fcd: res.fcd, fvd: res.fvd });

        // Solicitações (Stresses)
        console.group('--- ELU Checks ---');
        res.sigma_md = (i.Msd * 6) / (i.b * i.h ** 2); // kN/cm²
        res.tau_vd = (i.Vsd * 1.5) / (i.b * i.h); // kN/cm²
        console.log('Stresses (kN/cm²):', { sigma_md: res.sigma_md, tau_vd: res.tau_vd });


        // Ratios
        res.flexao_ratio = res.fcd > 0 ? res.sigma_md / (res.fcd / 10) : Infinity; // convert fcd to kN/cm²
        res.cisalhamento_ratio = res.fvd > 0 ? res.tau_vd / (res.fvd / 10) : Infinity;
        console.log('Utilization Ratios (ELU):', { flexao_ratio: res.flexao_ratio, cisalhamento_ratio: res.cisalhamento_ratio });
        console.groupEnd();

        // Deformação (ELS)
        console.group('--- ELS Check (Deflection) ---');
        const I = (i.b * i.h ** 3) / 12; // cm^4
        const L_cm = i.L * 100;
        // Assuming a uniformly distributed load that generates the input moment Msd
        const w_d = (8 * i.Msd) / (L_cm ** 2); // kN/cm
        res.deformacao_imediata = (5 * w_d * L_cm ** 4) / (384 * (i.Ec0_ef / 10) * I); // Ec0_ef in kN/cm²
        res.limite_deformacao = L_cm / 350;
        res.deformacao_ratio = res.limite_deformacao > 0 ? res.deformacao_imediata / res.limite_deformacao : Infinity;
        console.log('Deflection Intermediate:', { I, L_cm, w_d, limite_deformacao: res.limite_deformacao });
        console.log('Deflection Result (cm):', { deformacao_imediata: res.deformacao_imediata });
        console.log('Deflection Ratio:', res.deformacao_ratio);
        console.groupEnd();


        console.log('4. Final Results Object:', JSON.parse(JSON.stringify(res)));
        console.groupEnd();
        return { inputs: i, results: res };
    }

    return { calculate };
})();

function generateWoodBreakdownHtml(check) {
    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;

    switch (check.name) {
        case 'Flexão':
            return format_list([
                `<b>Tensão Solicitante (σ<sub>md</sub>):</b> (6 * M<sub>sd</sub>) / (b * h²) = <b>${check.demand.toFixed(2)} kN/cm²</b>`,
                `<b>Resistência de Cálculo (f<sub>cd</sub>):</b> (k<sub>mod</sub> * f<sub>c0,k</sub>) / γ<sub>wc</sub> = <b>${check.capacity.toFixed(2)} kN/cm²</b>`
            ]);
        case 'Cisalhamento':
            return format_list([
                `<b>Tensão Solicitante (τ<sub>vd</sub>):</b> (1.5 * V<sub>sd</sub>) / (b * h) = <b>${check.demand.toFixed(2)} kN/cm²</b>`,
                `<b>Resistência de Cálculo (f<sub>vd</sub>):</b> (k<sub>mod</sub> * f<sub>v,k</sub>) / γ<sub>wv</sub> = <b>${check.capacity.toFixed(2)} kN/cm²</b>`
            ]);
        case 'Deformação (Flecha)':
            return format_list([
                `<b>Flecha Limite (δ<sub>lim</sub>):</b> L / 350 = <b>${check.capacity.toFixed(2)} cm</b>`,
                `<b>Flecha Imediata (δ):</b> (5 * w * L⁴) / (384 * E * I) = <b>${check.demand.toFixed(2)} cm</b>`,
                `<small>(Assumindo carga uniforme que gera o momento M<sub>sd</sub>)</small>`
            ]);
        default: return 'Detalhes não disponíveis.';
    }
}

function renderNbr7190Results(calc_results) {
    const { inputs, results } = calc_results;

    const report = new ReportBuilder({
        reportId: 'wood-report-content',
        title: 'Relatório de Verificação Detalhado (NBR 7190)',
    });

    const inputRows = [
        { cells: ['Resist. à Compressão (f<sub>c0,k</sub>)', `${inputs.fc0k} MPa`] },
        { cells: ['Resist. ao Cisalhamento (f<sub>v,k</sub>)', `${inputs.fvk} MPa`] },
        { cells: ['Módulo de Elasticidade (E<sub>c0,ef</sub>)', `${inputs.Ec0_ef} MPa`] },
        { cells: ['Largura (b)', `${inputs.b} cm`] },
        { cells: ['Altura (h)', `${inputs.h} cm`] },
        { cells: ['Vão (L)', `${inputs.L} m`] },
        { cells: ['k<sub>mod,1</sub> (Classe de Carregamento)', `${inputs.kmod1}`] },
        { cells: ['k<sub>mod,2</sub> (Classe de Umidade)', `${inputs.kmod2}`] },
        { cells: ['Momento Solicitante (M<sub>Sd</sub>)', `${inputs.Msd / 100} kN·m`] },
        { cells: ['Força Cortante (V<sub>Sd</sub>)', `${inputs.Vsd} kN`] }
    ];
    report.addTableSection('Resumo dos Dados de Entrada', { headers: ['Parâmetro', 'Valor'], rows: inputRows }, 'input-summary-section');
    
    const tableRows = [
        { name: 'Flexão', demand: results.sigma_md, capacity: results.fcd / 10, ratio: results.flexao_ratio, unit: 'kN/cm²' },
        { name: 'Cisalhamento', demand: results.tau_vd, capacity: results.fvd / 10, ratio: results.cisalhamento_ratio, unit: 'kN/cm²' },
        { name: 'Deformação (Flecha)', demand: results.deformacao_imediata, capacity: results.limite_deformacao, ratio: results.deformacao_ratio, unit: 'cm' }
    ].map(check => ({
        type: 'data',
        cells: [check.name, `${check.demand.toFixed(2)} ${check.unit}`, `${check.capacity.toFixed(2)} ${check.unit}`, check.ratio.toFixed(3), check.ratio <= 1.0 ? '<span class="pass">OK</span>' : '<span class="fail">FALHA</span>'],
        details: generateWoodBreakdownHtml(check)
    }));

    report.addTableSection('Verificações (ELU e ELS)', {
        headers: ['Verificação', 'Solicitante', 'Resistente', 'Razão', 'Status'],
        rows: tableRows
    });

    report.render('results-container-wood');
}

const handleRunNbr7190Check = createCalculationHandler({
    inputIds: nbr7190InputIds,
    storageKey: 'nbr7190-inputs',
    validationRuleKey: 'nbr_madeira',
    calculatorFunction: nbr7190Calculator.calculate,
    renderFunction: renderNbr7190Results,
    resultsContainerId: 'results-container-wood',
    buttonId: 'run-wood-check-btn',
    reportId: 'wood-report-content',
    filenamePrefix: 'NBR-7190-Wood-Report'
}); 
initializeApp({
    inputIds: nbr7190InputIds,
    calculationHandler: handleRunNbr7190Check,
    onReady: () => {
        // The attachReportEventListeners is now handled by createCalculationHandler
    }
});