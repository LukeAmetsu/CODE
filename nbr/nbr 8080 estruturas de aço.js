const nbr8800InputIds = [
    'fy', 'E', 'd', 'bf', 'tf', 'tw', 'Ag', 'Zx', 'rx', 'ry',
    'Lb', 'Cb', 'Nsd', 'Msdx'
];

const nbr8800Calculator = (() => {
    function calculate(inputs) {
        const i = { ...inputs };
        // Convert to base units (N, mm)
        i.Lb = i.Lb * 1000; // m to mm
        i.Nsd = i.Nsd * 1000; // kN to N
        i.Msdx = i.Msdx * 1000 * 1000; // kN·m to N·mm

        const res = {};
        const gamma_a1 = 1.10;

        // 1. Classificação da Seção
        const lambda_mesa = (i.bf / 2) / i.tf;
        const lambda_p_mesa = 0.38 * Math.sqrt(i.E / i.fy);
        res.classificacao_mesa = lambda_mesa <= lambda_p_mesa ? 'Compacta' : 'Não Compacta';

        const h = i.d - 2 * i.tf;
        const lambda_alma = h / i.tw;
        const lambda_p_alma = 3.76 * Math.sqrt(i.E / i.fy);
        res.classificacao_alma = lambda_alma <= lambda_p_alma ? 'Compacta' : 'Compacta';

        // 2. Resistência à Compressão Axial
        const K = 1.0; // Fator de flambagem
        const Lc = K * i.Lb;
        const Ne = (Math.PI ** 2 * i.E * (i.Ag * i.ry ** 2)) / (Lc ** 2);
        const lambda_0 = Math.sqrt((i.Ag * i.fy) / Ne);
        let chi = 0;
        if (lambda_0 <= 1.5) chi = 0.658 ** (lambda_0 ** 2);
        else chi = 0.877 / (lambda_0 ** 2);
        const NcRd = (chi * i.Ag * i.fy) / gamma_a1;
        res.NcRd = NcRd; // em N
        res.Ne = Ne;
        res.lambda_0 = lambda_0;
        res.chi = chi;

        // 3. Resistência à Flexão
        const Mrd = (i.Zx * i.fy) / gamma_a1;
        res.Mrd = Mrd; // em N·mm

        // 4. Verificação da Interação
        let interaction_ratio = 0;
        if (res.NcRd > 0 && res.Mrd > 0) {
            const ratio_N = i.Nsd / res.NcRd;
            const ratio_M = i.Msdx / res.Mrd;
            if (ratio_N >= 0.2) {
                interaction_ratio = ratio_N + (8 / 9) * ratio_M;
            } else {
                interaction_ratio = (ratio_N / 2) + ratio_M;
            }
        }
        res.interaction_ratio = interaction_ratio;

        return { inputs: i, results: res };
    }
    return { calculate };
})();

function renderSteelInputSummary(inputs) {
    const rows = [
        `<tr><td>Resist. ao Escoamento (f<sub>y</sub>)</td><td>${inputs.fy} MPa</td></tr>`,
        `<tr><td>Módulo de Elasticidade (E)</td><td>${inputs.E} MPa</td></tr>`,
        `<tr><td>Altura do Perfil (d)</td><td>${inputs.d} mm</td></tr>`,
        `<tr><td>Largura da Mesa (b<sub>f</sub>)</td><td>${inputs.bf} mm</td></tr>`,
        `<tr><td>Espessura da Mesa (t<sub>f</sub>)</td><td>${inputs.tf} mm</td></tr>`,
        `<tr><td>Espessura da Alma (t<sub>w</sub>)</td><td>${inputs.tw} mm</td></tr>`,
        `<tr><td>Área Bruta (A<sub>g</sub>)</td><td>${inputs.Ag} mm²</td></tr>`,
        `<tr><td>Módulo Plástico (Z<sub>x</sub>)</td><td>${inputs.Zx} mm³</td></tr>`,
        `<tr><td>Dist. entre Contenções (L<sub>b</sub>)</td><td>${inputs.Lb} m</td></tr>`,
        `<tr><td>Força Axial Solicitante (N<sub>Sd</sub>)</td><td>${inputs.Nsd} kN</td></tr>`,
        `<tr><td>Momento Fletor Solicitante (M<sub>Sd,x</sub>)</td><td>${inputs.Msdx} kN·m</td></tr>`
    ].join('');

    return `
    <div class="copy-content">
        <table class="w-full mt-2 summary-table"><tbody>${rows}</tbody></table>
    </div>`;
}

function generateSteelBreakdownHtml(check) {
    switch (check.name) {
        case 'Compressão Axial':
            return `
                <ul>
                    <li>Força Axial de Escoamento (N<sub>pl</sub>) = A<sub>g</sub> &times; f<sub>y</sub> = <b>${((check.details.Ag * check.details.fy) / 1000).toFixed(2)} kN</b></li>
                    <li>Força Axial Elástica de Flambagem (N<sub>e</sub>) = &pi;²EI / (KL)² = <b>${(check.details.Ne / 1000).toFixed(2)} kN</b></li>
                    <li>Índice de Esbeltez Reduzido (&lambda;<sub>0</sub>) = &radic;(N<sub>pl</sub> / N<sub>e</sub>) = <b>${check.details.lambda_0.toFixed(3)}</b></li>
                    <li>Fator de Redução (&chi;) = <b>${check.details.chi.toFixed(3)}</b> (baseado em &lambda;<sub>0</sub>)</li>
                    <li>Resistência (N<sub>c,Rd</sub>) = (&chi; &times; A<sub>g</sub> &times; f<sub>y</sub>) / &gamma;<sub>a1</sub> = <b>${(check.capacity).toFixed(2)} kN</b></li>
                </ul>`;
        case 'Flexão (Eixo X)':
            return `
                <ul>
                    <li>Momento de Plastificação (M<sub>pl</sub>) = Z<sub>x</sub> &times; f<sub>y</sub> = <b>${((check.details.Zx * check.details.fy) / 10**6).toFixed(2)} kN·m</b></li>
                    <li>Resistência (M<sub>Rd,x</sub>) = M<sub>pl</sub> / &gamma;<sub>a1</sub> = <b>${(check.capacity).toFixed(2)} kN·m</b></li>
                    <li><small>Nota: Flambagem lateral com torção (FLT) não foi verificada neste cálculo simplificado.</small></li>
                </ul>`;
        case 'Interação N + M':
            return `
                <ul>
                    <li>Relação de Compressão = N<sub>Sd</sub> / N<sub>c,Rd</sub> = <b>${check.details.N_ratio.toFixed(3)}</b></li>
                    <li>Equação de Interação Aplicada: <b>${check.details.equation}</b></li>
                    <li>Resultado = <b>${check.demand.toFixed(3)}</b></li>
                </ul>`;
        default: return 'Detalhes não disponíveis.';
    }
}

function renderNbr8800Results(calc_results) {
    const { inputs, results } = calc_results;

    const checks = [
        {
            name: 'Compressão Axial',
            demand: calc_results.inputs.Nsd / 1000,
            capacity: results.NcRd / 1000,
            ratio: results.NcRd > 0 ? (calc_results.inputs.Nsd / results.NcRd) : Infinity,
            unit: 'kN',
            details: { ...results, Ag: inputs.Ag, fy: inputs.fy }
        },
        {
            name: 'Flexão (Eixo X)',
            demand: calc_results.inputs.Msdx / 10**6,
            capacity: results.Mrd / 10**6,
            ratio: results.Mrd > 0 ? (calc_results.inputs.Msdx / results.Mrd) : Infinity,
            unit: 'kN·m',
            details: { ...results, Zx: inputs.Zx, fy: inputs.fy }
        },
        {
            name: 'Interação N + M',
            demand: results.interaction_ratio,
            capacity: 1.0,
            ratio: results.interaction_ratio,
            unit: '',
            details: { N_ratio: results.NcRd > 0 ? (calc_results.inputs.Nsd / results.NcRd) : Infinity, equation: (results.NcRd > 0 ? (calc_results.inputs.Nsd / results.NcRd) : Infinity) >= 0.2 ? '(N<sub>Sd</sub>/N<sub>c,Rd</sub>) + (8/9)*(M<sub>Sd,x</sub>/M<sub>Rd,x</sub>)' : '(N<sub>Sd</sub>/2N<sub>c,Rd</sub>) + (M<sub>Sd,x</sub>/M<sub>Rd,x</sub>)' }
        }
    ];

    const inputSummaryHtml = renderSteelInputSummary(calc_results.inputs);

    const report = new ReportBuilder({
        reportId: 'steel-report-content',
        title: 'Relatório de Verificação Detalhado (NBR 8800)',
    });

    report.addSection('Resumo dos Dados de Entrada', inputSummaryHtml, 'input-summary-section');
    
    const tableRows = checks.map(check => {
        if (!check.name) return null; // Skip if it's not a valid check row
        return {
            type: 'data',
            cells: [check.name, `${check.demand.toFixed(2)} ${check.unit}`, `${check.capacity.toFixed(2)} ${check.unit}`, check.ratio.toFixed(3), `${(check.ratio * 100).toFixed(1)}%`, check.ratio <= 1.0 ? '<span class="pass">OK</span>' : '<span class="fail">FALHA</span>'],
            details: generateSteelBreakdownHtml(check)
        };
    }).filter(Boolean);

    report.addTableSection('Resistências de Cálculo', {
        headers: ['Verificação', 'Solicitante', 'Resistente', 'Rácio', 'Utilização (%)', 'Status'],
        rows: tableRows
    });

    report.render('results-container'); // Render into the main container
}

const handleRunNbr8800Check = createCalculationHandler({
    inputIds: nbr8800InputIds,
    storageKey: 'nbr8800-inputs',
    validationRuleKey: 'nbr_aco', // This key is used for validation and report naming
    calculatorFunction: nbr8800Calculator.calculate,
    renderFunction: renderNbr8800Results,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn'
});

initializeApp({
    inputIds: nbr8800InputIds,
    calculationHandler: handleRunNbr8800Check
});