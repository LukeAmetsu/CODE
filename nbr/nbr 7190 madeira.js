const nbr7190InputIds = [
    'fc0k', 'fvk', 'Ec0_ef', 'b', 'h', 'L', 'kmod1', 'kmod2', 'Msd', 'Vsd'
];

const nbr7190Calculator = (() => {
    function calculate(inputs) {
        const i = { ...inputs };
        // Convert to base units (kN, cm)
        i.Msd = i.Msd * 100; // kN·m to kN·cm

        const res = {};
        const gamma_wc = 1.4; // Coníferas
        const gamma_wv = 1.8;

        const kmod = i.kmod1 * i.kmod2 * 1.0; // kmod3 = 1.0

        // Resistências de Cálculo
        res.fcd = (kmod * i.fc0k) / gamma_wc; // MPa
        res.fvd = (kmod * i.fvk) / gamma_wv; // MPa

        // Solicitações (Stresses)
        res.sigma_md = (i.Msd * 6) / (i.b * i.h ** 2); // kN/cm²
        res.tau_vd = (i.Vsd * 1.5) / (i.b * i.h); // kN/cm²

        // Ratios
        res.flexao_ratio = res.fcd > 0 ? res.sigma_md / (res.fcd / 10) : Infinity; // convert fcd to kN/cm²
        res.cisalhamento_ratio = res.fvd > 0 ? res.tau_vd / (res.fvd / 10) : Infinity;

        // Deformação (ELS)
        const I = (i.b * i.h ** 3) / 12; // cm^4
        const L_cm = i.L * 100;
        // Assuming a uniformly distributed load that generates the input moment Msd
        const w_d = (8 * i.Msd) / (L_cm ** 2); // kN/cm
        res.deformacao_imediata = (5 * w_d * L_cm ** 4) / (384 * (i.Ec0_ef / 10) * I); // Ec0_ef in kN/cm²
        res.limite_deformacao = L_cm / 350;
        res.deformacao_ratio = res.limite_deformacao > 0 ? res.deformacao_imediata / res.limite_deformacao : Infinity;

        return { inputs: i, results: res };
    }

    return { calculate };
})();

function renderNbr7190Results(calc_results) {
    const { inputs, results } = calc_results;
    const summaryContainer = document.getElementById('summary-results-wood');
    const resultsContainer = document.getElementById('results-container-wood');

    const getStatus = (ratio) => ratio <= 1.0 ? `<span class="pass">OK</span>` : `<span class="fail">FALHA</span>`;

    summaryContainer.innerHTML = `
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Flexão (σ<sub>md</sub> / f<sub>cd</sub>):</span> <strong class="${results.flexao_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.flexao_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Cisalhamento (τ<sub>vd</sub> / f<sub>vd</sub>):</span> <strong class="${results.cisalhamento_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.cisalhamento_ratio.toFixed(3)}</strong></p>
        </div>
         <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Deformação (δ / δ<sub>lim</sub>):</span> <strong class="${results.deformacao_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.deformacao_ratio.toFixed(3)}</strong></p>
        </div>
    `;

    const checks = [
        {
            name: 'Flexão',
            demand: results.sigma_md,
            capacity: results.fcd / 10,
            ratio: results.flexao_ratio,
            unit: 'kN/cm²',
            breakdown: `
                <h4>Cálculo da Tensão de Flexão</h4>
                <ul>
                    <li>Tensão Solicitante (σ<sub>md</sub>) = (6 * M<sub>sd</sub>) / (b * h²) = (6 * ${inputs.Msd.toFixed(2)}) / (${inputs.b} * ${inputs.h}²) = <b>${results.sigma_md.toFixed(2)} kN/cm²</b></li>
                    <li>Resistência de Cálculo (f<sub>cd</sub>) = (k<sub>mod</sub> * f<sub>c0,k</sub>) / γ<sub>wc</sub> = (${(inputs.kmod1 * inputs.kmod2).toFixed(2)} * ${inputs.fc0k}) / 1.4 = <b>${(results.fcd / 10).toFixed(2)} kN/cm²</b></li>
                </ul>`
        },
        {
            name: 'Cisalhamento',
            demand: results.tau_vd,
            capacity: results.fvd / 10,
            ratio: results.cisalhamento_ratio,
            unit: 'kN/cm²',
            breakdown: `
                <h4>Cálculo da Tensão de Cisalhamento</h4>
                <ul>
                    <li>Tensão Solicitante (τ<sub>vd</sub>) = (1.5 * V<sub>sd</sub>) / (b * h) = (1.5 * ${inputs.Vsd}) / (${inputs.b} * ${inputs.h}) = <b>${results.tau_vd.toFixed(2)} kN/cm²</b></li>
                    <li>Resistência de Cálculo (f<sub>vd</sub>) = (k<sub>mod</sub> * f<sub>v,k</sub>) / γ<sub>wv</sub> = (${(inputs.kmod1 * inputs.kmod2).toFixed(2)} * ${inputs.fvk}) / 1.8 = <b>${(results.fvd / 10).toFixed(2)} kN/cm²</b></li>
                </ul>`
        },
        {
            name: 'Deformação (Flecha)',
            demand: results.deformacao_imediata,
            capacity: results.limite_deformacao,
            ratio: results.deformacao_ratio,
            unit: 'cm',
            breakdown: `
                <h4>Cálculo da Deformação (ELS)</h4>
                <ul>
                    <li>Flecha Limite (δ<sub>lim</sub>) = L / 350 = ${(inputs.L * 100).toFixed(0)} cm / 350 = <b>${results.limite_deformacao.toFixed(2)} cm</b></li>
                    <li>Flecha Imediata (δ) = (5 * w * L⁴) / (384 * E * I) = <b>${results.deformacao_imediata.toFixed(2)} cm</b></li>
                    <li><small>(Assumindo carga uniforme que gera o momento M<sub>sd</sub>)</small></li>
                </ul>`
        }
    ];

    const checkRows = checks.map((check, index) => {
        const detailId = `wood-detail-${index}`;
        return `
            <tr class="border-t dark:border-gray-700">
                <td>${check.name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                <td>${check.demand.toFixed(2)} ${check.unit}</td>
                <td>${check.capacity.toFixed(2)} ${check.unit}</td>
                <td>${check.ratio.toFixed(3)}</td>
                <td>${getStatus(check.ratio)}</td>
            </tr>
            <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${check.breakdown}</div></td></tr>
        `;
    }).join('');

    resultsContainer.innerHTML = `
        <div id="wood-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Mostrar Detalhes</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Baixar PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copiar Relatório</button>
            </div>
            <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação Detalhado</h2>
            <table class="w-full mt-4 results-table">
                <caption>Verificações (ELU e ELS)</caption>
                <thead><tr><th>Verificação</th><th>Solicitante (Sd)</th><th>Resistente (Rd)</th><th>Ratio</th><th>Status</th></tr></thead>
                <tbody>
                    ${checkRows}
                </tbody>
            </table>
        </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const handleRunNbr7190Check = createCalculationHandler({
        inputIds: nbr7190InputIds,
        storageKey: 'nbr7190-inputs',
        validationRuleKey: 'nbr_madeira',
        calculatorFunction: nbr7190Calculator.calculate,
        renderFunction: renderNbr7190Results,
        resultsContainerId: 'results-container-wood',
        buttonId: 'run-wood-check-btn'
    });
    injectHeader({ activePage: 'wood-design', pageTitle: 'Verificador de Peças de Madeira (NBR 7190:1997)', headerPlaceholderId: 'header-placeholder' });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    loadInputsFromLocalStorage('nbr7190-inputs', nbr7190InputIds);

    const handleSaveInputs = createSaveInputsHandler(nbr7190InputIds, 'nbr7190-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(nbr7190InputIds, handleRunNbr7190Check);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    document.getElementById('run-wood-check-btn').addEventListener('click', handleRunNbr7190Check);

    document.getElementById('results-container-wood').addEventListener('click', (event) => {
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
            document.querySelectorAll('#results-container-wood .details-row').forEach(row => row.classList.toggle('is-visible', shouldShow));
            document.querySelectorAll('#results-container-wood .toggle-details-btn').forEach(button => button.textContent = shouldShow ? '[Esconder]' : '[Mostrar]');
            mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
            mainButton.textContent = shouldShow ? 'Esconder Detalhes' : 'Mostrar Detalhes';
        }
        if (event.target.id === 'copy-report-btn') handleCopyToClipboard('wood-report-content', 'feedback-message');
        if (event.target.id === 'download-pdf-btn') handleDownloadPdf('wood-report-content', 'NBR7190-Relatorio.pdf');
    });
});