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
    const getStatus = (ratio) => ratio <= 1.0 ? `<span class="pass">OK</span>` : `<span class="fail">NÃO OK</span>`;

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

    resultsContainer.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 class="text-2xl font-bold text-center border-b pb-2">Relatório de Verificação Detalhado (NBR 6118)</h2>
            <table class="w-full mt-4">
                <caption>Verificações de Cálculo (ELU)</caption>
                <thead><tr><th>Verificação</th><th>Solicitante (Sd)</th><th>Resistente (Rd)</th><th>Ratio</th><th>Status</th></tr></thead>
                <tbody>
                    <tr><td>Flexão</td><td>${(inputs.Msd / 100).toFixed(2)} kN·m</td><td>${(flex.Mrd / 100).toFixed(2)} kN·m</td><td>${M_ratio.toFixed(3)}</td><td>${getStatus(M_ratio)}</td></tr>
                    <tr><td>Cisalhamento</td><td>${inputs.Vsd.toFixed(2)} kN</td><td>${shear.VRd.toFixed(2)} kN</td><td>${V_ratio.toFixed(3)}</td><td>${getStatus(V_ratio)}</td></tr>
                    <tr><td>Verif. Biela Comprimida</td><td>${inputs.Vsd.toFixed(2)} kN</td><td>${shear.VRd2.toFixed(2)} kN</td><td>${V_max_ratio.toFixed(3)}</td><td>${getStatus(V_max_ratio)}</td></tr>
                </tbody>
            </table>
            <div class="calc-breakdown mt-4">
                <h4>Detalhes da Flexão</h4>
                <ul>
                    <li>Altura Útil (d): ${flex.d.toFixed(2)} cm</li>
                    <li>Área de Aço (A<sub>s</sub>): ${flex.As.toFixed(2)} cm²</li>
                    <li>Linha Neutra (x): ${flex.x.toFixed(2)} cm</li>
                    <li>Relação x/d: ${flex.x_d_ratio.toFixed(3)} (${flex.dominio})</li>
                </ul>
            </div>
            <div class="calc-breakdown mt-4">
                <h4>Detalhes do Cisalhamento</h4>
                <ul>
                    <li>Contribuição do Concreto (V<sub>c</sub>): ${shear.Vc.toFixed(2)} kN</li>
                    <li>Contribuição dos Estribos (V<sub>sw</sub>): ${shear.Vsw.toFixed(2)} kN</li>
                    <li>Resistência Máxima (V<sub>Rd2</sub>): ${shear.VRd2.toFixed(2)} kN</li>
                </ul>
            </div>
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
});