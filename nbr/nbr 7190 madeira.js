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

    const getStatus = (ratio) => ratio <= 1.0 ? `<span class="pass">OK</span>` : `<span class="fail">NÃO OK</span>`;

    summaryContainer.innerHTML = `
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Flexão:</span> <strong class="${results.flexao_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.flexao_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Cisalhamento:</span> <strong class="${results.cisalhamento_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.cisalhamento_ratio.toFixed(3)}</strong></p>
        </div>
         <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Deformação (ELS):</span> <strong class="${results.deformacao_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.deformacao_ratio.toFixed(3)}</strong></p>
        </div>
    `;

    resultsContainer.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação Detalhado</h2>
            <table class="w-full mt-4">
                <caption>Verificações (ELU e ELS)</caption>
                <thead><tr><th>Verificação</th><th>Solicitante (Sd)</th><th>Resistente (Rd)</th><th>Ratio</th><th>Status</th></tr></thead>
                <tbody>
                    <tr>
                        <td>Flexão</td>
                        <td>${results.sigma_md.toFixed(2)} kN/cm²</td>
                        <td>${(results.fcd / 10).toFixed(2)} kN/cm²</td>
                        <td>${results.flexao_ratio.toFixed(3)}</td>
                        <td>${getStatus(results.flexao_ratio)}</td>
                    </tr>
                    <tr>
                        <td>Cisalhamento</td>
                        <td>${results.tau_vd.toFixed(2)} kN/cm²</td>
                        <td>${(results.fvd / 10).toFixed(2)} kN/cm²</td>
                        <td>${results.cisalhamento_ratio.toFixed(3)}</td>
                        <td>${getStatus(results.cisalhamento_ratio)}</td>
                    </tr>
                    <tr>
                        <td>Deformação</td>
                        <td>${results.deformacao_imediata.toFixed(2)} cm</td>
                        <td>${results.limite_deformacao.toFixed(2)} cm (L/350)</td>
                        <td>${results.deformacao_ratio.toFixed(3)}</td>
                        <td>${getStatus(results.deformacao_ratio)}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
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
    injectHeader({ activePage: 'nbr-madeira', pageTitle: 'Verificador de Peças de Madeira (NBR 7190:1997)', headerPlaceholderId: 'header-placeholder' });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    loadInputsFromLocalStorage('nbr7190-inputs', nbr7190InputIds);

    const handleSaveInputs = createSaveInputsHandler(nbr7190InputIds, 'nbr7190-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(nbr7190InputIds, handleRunNbr7190Check);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    document.getElementById('run-wood-check-btn').addEventListener('click', handleRunNbr7190Check);
});