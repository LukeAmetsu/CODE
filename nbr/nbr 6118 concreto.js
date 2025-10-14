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

function renderNbrResults(calc_results) {
    const { inputs, results } = calc_results;
    const { flexure_details: flex, shear_details: shear } = results;
    const summaryContainer = document.getElementById('summary-results');
    const resultsContainer = document.getElementById('results-container');

    const M_ratio = flex.Mrd > 0 ? inputs.Msd / flex.Mrd : Infinity;
    const V_ratio = shear.VRd > 0 ? inputs.Vsd / shear.VRd : Infinity;
    const V_max_ratio = shear.VRd2 > 0 ? inputs.Vsd / shear.VRd2 : Infinity;
    const getStatus = (ratio) => ratio <= 1.0 ? `<span class="pass">OK</span>` : `<span class="fail">FALHA</span>`;

    summaryContainer.innerHTML = `
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Flexão (M<sub>Sd</sub> / M<sub>Rd</sub>):</span> <strong class="${M_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${M_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Cisalhamento (V<sub>Sd</sub> / V<sub>Rd</sub>):</span> <strong class="${V_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${V_ratio.toFixed(3)}</strong></p>
        </div>
         <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Biela Comprimida (V<sub>Sd</sub> / V<sub>Rd2</sub>):</span> <strong class="${V_max_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${V_max_ratio.toFixed(3)}</strong></p>
        </div>
    `;

    const checks = [
        {
            name: 'Flexão',
            demand: inputs.Msd / 100,
            capacity: flex.Mrd / 100,
            ratio: M_ratio,
            unit: 'kN·m',
            breakdown: `<h4>Cálculo de Flexão (ELU)</h4>
                <ul>
                    <li>Altura Útil (d): ${flex.d.toFixed(2)} cm</li>
                    <li>Área de Aço (A<sub>s</sub>): ${flex.As.toFixed(2)} cm²</li>
                    <li>Linha Neutra (x): ${flex.x.toFixed(2)} cm</li>
                    <li>Relação x/d: ${flex.x_d_ratio.toFixed(3)} (${flex.dominio})</li>
                    <li>Momento Resistente (M<sub>Rd</sub>) = A<sub>s</sub> &times; f<sub>yd</sub> &times; (d - 0.4x) = <b>${(flex.Mrd / 100).toFixed(2)} kN·m</b></li>
                </ul>`
        },
        {
            name: 'Cisalhamento',
            demand: inputs.Vsd,
            capacity: shear.VRd,
            ratio: V_ratio,
            unit: 'kN',
            breakdown: `<h4>Cálculo de Cisalhamento (ELU)</h4>
                <ul>
                    <li>Contribuição do Concreto (V<sub>c</sub>) = 0.6 &times; f<sub>ctd</sub> &times; b<sub>w</sub> &times; d = <b>${shear.Vc.toFixed(2)} kN</b></li>
                    <li>Contribuição dos Estribos (V<sub>sw</sub>) = (A<sub>sw</sub>/s) &times; 0.9d &times; f<sub>yd</sub> = <b>${shear.Vsw.toFixed(2)} kN</b></li>
                    <li>Força Cortante Resistente (V<sub>Rd</sub>) = V<sub>c</sub> + V<sub>sw</sub> = <b>${shear.VRd.toFixed(2)} kN</b></li>
                </ul>`
        },
        {
            name: 'Verif. Biela Comprimida',
            demand: inputs.Vsd,
            capacity: shear.VRd2,
            ratio: V_max_ratio,
            unit: 'kN',
            breakdown: `<h4>Verificação da Biela Comprimida de Concreto (ELU)</h4>
                <ul>
                    <li>Resistência Máxima (V<sub>Rd2</sub>) = 0.27 &times; (1 - f<sub>ck</sub>/250) &times; f<sub>cd</sub> &times; b<sub>w</sub> &times; 0.9d = <b>${shear.VRd2.toFixed(2)} kN</b></li>
                    <li>Esta é a força cortante máxima que a viga pode resistir para evitar o esmagamento da biela de compressão.</li>
                </ul>`
        }
    ];

    const checkRows = checks.map((check, index) => {
        const detailId = `concrete-detail-${index}`;
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
        <div id="concrete-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <div class="flex justify-end gap-2 mb-4 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Mostrar Detalhes</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Baixar PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copiar Relatório</button>
            </div>
            <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação Detalhado (NBR 6118)</h2>
            <table class="w-full mt-4 results-table">
                <caption>Verificações de Cálculo (ELU)</caption>
                <thead><tr><th>Verificação</th><th>Solicitante (Sd)</th><th>Resistente (Rd)</th><th>Ratio</th><th>Status</th></tr></thead>
                <tbody>
                    ${checkRows}
                </tbody>
            </table>
        </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
    const handleRunNbrCheck = createCalculationHandler({
        inputIds: nbr6118InputIds,
        storageKey: 'nbr6118-inputs',
        validationRuleKey: 'nbr_concreto',
        calculatorFunction: nbr6118Calculator.calculate,
        renderFunction: renderNbrResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });
    injectHeader({ activePage: 'nbr-concreto', pageTitle: 'Verificador de Viga de Concreto (NBR 6118:2014)', headerPlaceholderId: 'header-placeholder' });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    loadInputsFromLocalStorage('nbr6118-inputs', nbr6118InputIds);

    const handleSaveInputs = createSaveInputsHandler(nbr6118InputIds, 'nbr6118-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(nbr6118InputIds, handleRunNbrCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    document.getElementById('run-check-btn').addEventListener('click', handleRunNbrCheck);

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
        if (event.target.id === 'copy-report-btn') handleCopyToClipboard('concrete-report-content', 'feedback-message');
        if (event.target.id === 'download-pdf-btn') handleDownloadPdf('concrete-report-content', 'NBR6118-Relatorio.pdf');
    });
});