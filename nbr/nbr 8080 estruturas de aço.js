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

    const getStatus = (ratio) => ratio <= 1.0 ? `<span class="pass">OK</span>` : `<span class="fail">NÃO OK</span>`;

    summaryContainer.innerHTML = `
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Compressão Axial:</span> <strong class="${N_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${N_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Flexão (Eixo X):</span> <strong class="${M_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${M_ratio.toFixed(3)}</strong></p>
        </div>
        <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
            <p class="flex justify-between"><span>Interação N + M:</span> <strong class="${results.interaction_ratio <= 1.0 ? 'text-green-600' : 'text-red-600'}">${results.interaction_ratio.toFixed(3)}</strong></p>
        </div>
    `;

    resultsContainer.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação Detalhado</h2>
            <table class="w-full mt-4">
                <caption>Resistências de Cálculo</caption>
                <thead><tr><th>Verificação</th><th>Solicitante (Sd)</th><th>Resistente (Rd)</th><th>Ratio</th><th>Status</th></tr></thead>
                <tbody>
                    <tr><td>Compressão Axial</td><td>${(inputs.Nsd / 1000).toFixed(2)} kN</td><td>${NcRd_kN} kN</td><td>${N_ratio.toFixed(3)}</td><td>${getStatus(N_ratio)}</td></tr>
                    <tr><td>Flexão (Eixo X)</td><td>${(inputs.Msdx / 10 ** 6).toFixed(2)} kN·m</td><td>${Mrd_kNm} kN·m</td><td>${M_ratio.toFixed(3)}</td><td>${getStatus(M_ratio)}</td></tr>
                    <tr><td>Interação N + M</td><td colspan="2">Equação NBR 8800 5.4.2.2</td><td>${results.interaction_ratio.toFixed(3)}</td><td>${getStatus(results.interaction_ratio)}</td></tr>
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
});