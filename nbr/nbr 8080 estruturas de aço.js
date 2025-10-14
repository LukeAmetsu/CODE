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

function renderNbr8800Results(calc_results) {
    const { inputs, results } = calc_results;
    const summaryContainer = document.getElementById('summary-results');
    const resultsContainer = document.getElementById('results-container');

    const NcRd_kN = (results.NcRd / 1000).toFixed(2);
    const Mrd_kNm = (results.Mrd / 10 ** 6).toFixed(2);
    const N_ratio = results.NcRd > 0 ? (inputs.Nsd / results.NcRd) : Infinity;
    const M_ratio = results.Mrd > 0 ? (inputs.Msdx / results.Mrd) : Infinity;

    const getStatus = (ratio) => ratio <= 1.0 ? `<span class="pass">OK</span>` : `<span class="fail">FALHA</span>`;

    summaryContainer.innerHTML = `
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Compressão (N<sub>Sd</sub> / N<sub>c,Rd</sub>):</span> <strong class="${N_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${N_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Flexão (M<sub>Sd,x</sub> / M<sub>Rd,x</sub>):</span> <strong class="${M_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${M_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Interação (N+M):</span> <strong class="${results.interaction_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.interaction_ratio.toFixed(3)}</strong></p>
        </div>
    `;

    const checks = [
        {
            name: 'Compressão Axial',
            demand: inputs.Nsd / 1000,
            capacity: results.NcRd / 1000,
            ratio: N_ratio,
            unit: 'kN',
            breakdown: `<h4>Cálculo de Compressão Axial Resistente (N<sub>c,Rd</sub>)</h4>
                <ul>
                    <li>Força Axial de Escoamento (N<sub>pl</sub>) = A<sub>g</sub> &times; f<sub>y</sub> = ${(inputs.Ag / 100).toFixed(2)} cm² &times; ${(inputs.fy / 10).toFixed(2)} kN/cm² = ${((inputs.Ag * inputs.fy) / 1000).toFixed(2)} kN</li>
                    <li>Força Axial Elástica de Flambagem (N<sub>e</sub>) = &pi;²EI / (KL)² = <b>${(results.Ne / 1000).toFixed(2)} kN</b></li>
                    <li>Índice de Esbeltez Reduzido (&lambda;<sub>0</sub>) = &radic;(N<sub>pl</sub> / N<sub>e</sub>) = <b>${results.lambda_0.toFixed(3)}</b></li>
                    <li>Fator de Redução (&chi;) = <b>${results.chi.toFixed(3)}</b> (baseado em &lambda;<sub>0</sub>)</li>
                    <li>Resistência (N<sub>c,Rd</sub>) = (&chi; &times; A<sub>g</sub> &times; f<sub>y</sub>) / &gamma;<sub>a1</sub> = <b>${NcRd_kN} kN</b></li>
                </ul>`
        },
        {
            name: 'Flexão (Eixo X)',
            demand: inputs.Msdx / 10**6,
            capacity: results.Mrd / 10**6,
            ratio: M_ratio,
            unit: 'kN·m',
            breakdown: `<h4>Cálculo de Momento Fletor Resistente (M<sub>Rd,x</sub>)</h4>
                <ul>
                    <li>Momento de Plastificação (M<sub>pl</sub>) = Z<sub>x</sub> &times; f<sub>y</sub> = ${(inputs.Zx / 1000).toFixed(2)} cm³ &times; ${(inputs.fy / 10).toFixed(2)} kN/cm² = ${((inputs.Zx * inputs.fy) / 10**6).toFixed(2)} kN·m</li>
                    <li>Resistência (M<sub>Rd,x</sub>) = M<sub>pl</sub> / &gamma;<sub>a1</sub> = <b>${Mrd_kNm} kN·m</b></li>
                    <li><small>Nota: Flambagem lateral com torção (FLT) não foi verificada neste cálculo simplificado.</small></li>
                </ul>`
        },
        {
            name: 'Interação N + M',
            demand: results.interaction_ratio,
            capacity: 1.0,
            ratio: results.interaction_ratio,
            unit: '',
            breakdown: `<h4>Verificação de Interação Força Axial + Momento Fletor (NBR 8800:2008, Seção 5.4.2.2)</h4>
                <ul>
                    <li>Relação de Compressão = N<sub>Sd</sub> / N<sub>c,Rd</sub> = ${(inputs.Nsd / 1000).toFixed(2)} / ${NcRd_kN} = <b>${N_ratio.toFixed(3)}</b></li>
                    <li>Equação de Interação Aplicada: <b>${N_ratio >= 0.2 ? '(N<sub>Sd</sub>/N<sub>c,Rd</sub>) + (8/9)*(M<sub>Sd,x</sub>/M<sub>Rd,x</sub>)' : '(N<sub>Sd</sub>/2N<sub>c,Rd</sub>) + (M<sub>Sd,x</sub>/M<sub>Rd,x</sub>)'}</b></li>
                    <li>Resultado = <b>${results.interaction_ratio.toFixed(3)}</b></li>
                </ul>`
        }
    ];

    const checkRows = checks.map((check, index) => {
        const detailId = `steel-detail-${index}`;
        return `
            <tr class="border-t dark:border-gray-700">
                <td>${check.name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Mostrar]</button></td>
                <td>${check.demand.toFixed(2)} ${check.unit}</td>
                <td>${check.capacity.toFixed(2)} ${check.unit}</td>
                <td>${check.ratio.toFixed(3)}</td>
                <td>${getStatus(check.ratio)}</td>
            </tr>
            <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${check.breakdown}</div></td></tr>
        `;
    }).join('');

    resultsContainer.innerHTML = `
        <div id="steel-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Mostrar Detalhes</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Baixar PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copiar Relatório</button>
            </div>
            <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação Detalhado (NBR 8800)</h2>
            <table class="w-full mt-4 results-table">
                <caption>Resistências de Cálculo</caption>
                <thead><tr><th>Verificação</th><th>Solicitante (Sd)</th><th>Resistente (Rd)</th><th>Ratio</th><th>Status</th></tr></thead>
                <tbody>
                    ${checkRows}
                </tbody>
            </table>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    const handleRunNbr8800Check = createCalculationHandler({
        inputIds: nbr8800InputIds,
        storageKey: 'nbr8800-inputs',
        validationRuleKey: 'nbr_aco',
        calculatorFunction: nbr8800Calculator.calculate,
        renderFunction: renderNbr8800Results,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });
    injectHeader({ activePage: 'nbr-aco', pageTitle: 'Verificador de Perfis de Aço (NBR 8800:2008)', headerPlaceholderId: 'header-placeholder' });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    loadInputsFromLocalStorage('nbr8800-inputs', nbr8800InputIds);

    const handleSaveInputs = createSaveInputsHandler(nbr8800InputIds, 'nbr8800-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(nbr8800InputIds, handleRunNbr8800Check);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    document.getElementById('run-check-btn').addEventListener('click', handleRunNbr8800Check);

    document.getElementById('results-container').addEventListener('click', (event) => {
        const button = event.target.closest('.toggle-details-btn');
        if (button) {
            const detailId = button.dataset.toggleId;
            const row = document.getElementById(detailId);
            if (row) {
                row.classList.toggle('is-visible');
                button.textContent = row.classList.contains('is-visible') ? '[Esconder]' : '[Mostrar]';
            }
        }
        if (event.target.id === 'toggle-all-details-btn') {
            const mainButton = event.target;
            const shouldShow = mainButton.dataset.state === 'hidden';
            document.querySelectorAll('#results-container .details-row').forEach(row => row.classList.toggle('is-visible', shouldShow));
            document.querySelectorAll('#results-container .toggle-details-btn').forEach(button => button.textContent = shouldShow ? '[Esconder]' : '[Mostrar]');
            mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
            mainButton.textContent = shouldShow ? 'Esconder Detalhes' : 'Mostrar Detalhes';
        }
        if (event.target.id === 'copy-report-btn') handleCopyToClipboard('steel-report-content', 'feedback-message');
        if (event.target.id === 'download-pdf-btn') handleDownloadPdf('steel-report-content', 'NBR8800-Relatorio.pdf');
    });
});