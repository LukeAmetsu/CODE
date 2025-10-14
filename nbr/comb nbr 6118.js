// --- 1. CONFIGURAÇÕES E DADOS BASE (NBR 8681 e 6118) ---
// This section defines the core coefficients and load types according to Brazilian standards.
const LOAD_TYPES = {
    'Peso Próprio (PP)': { isVariable: false, gamma_g: 1.35 },
    'Permanente (G)': { isVariable: false, gamma_g: 1.40 },
    'Permanente (Retração/Recalque)': { isVariable: false, gamma_g: 1.20 },
    'Uso Residencial (Q)': { isVariable: true, psi0: 0.5, psi1: 0.4, psi2: 0.3, gamma_q: 1.4 },
    'Uso Escritório/Loja (Q)': { isVariable: true, psi0: 0.7, psi1: 0.4, psi2: 0.3, gamma_q: 1.4 },
    'Garagem/Estacionamento (Q)': { isVariable: true, psi0: 0.7, psi1: 0.6, psi2: 0.4, gamma_q: 1.4 },
    'Vento (W)': { isVariable: true, psi0: 0.6, psi1: 0.3, psi2: 0.0, gamma_q: 1.4 },
    'Temperatura (T)': { isVariable: true, psi0: 0.6, psi1: 0.5, psi2: 0.3, gamma_q: 1.4 },
    'Líquidos (Truncado)': { isVariable: true, psi0: 0.5, psi1: 0.4, psi2: 0.3, gamma_q: 1.4 },
    'Outras Ações Variáveis (Q)': { isVariable: true, psi0: 0.8, psi1: 0.6, psi2: 0.4, gamma_q: 1.4 },
};

document.addEventListener('DOMContentLoaded', () => {

    injectHeader({
        activePage: 'comb-nbr',
        pageTitle: 'Gerador Interativo de Combinações NBR 8681',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({
        footerPlaceholderId: 'footer-placeholder'
    });

    const loadsContainer = document.getElementById('loads-container');
    const addLoadBtn = document.getElementById('add-load-btn');
    const generateReportBtn = document.getElementById('generate-report-btn');
    
    function addLoadRow(load = { name: '', type: 'Uso Residencial (Q)', value: 1.0 }) {
        const rowId = `row-${Date.now()}`;
        const row = document.createElement('div');
        row.id = rowId;
        row.className = 'grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_auto] gap-3 items-center';

        const loadName = document.createElement('input');
        loadName.type = 'text';
        loadName.placeholder = 'Ex: Vento X+, Sobrecarga 1';
        loadName.className = 'load-name';

        const loadType = document.createElement('select');
        loadType.className = 'load-type';
        Object.keys(LOAD_TYPES).forEach(key => {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = key;
            loadType.appendChild(option);
        });

        const loadValue = document.createElement('input');
        loadValue.type = 'number';
        loadValue.placeholder = 'Valor (ex: 10)';
        loadValue.className = 'load-value';
        loadValue.value = load.value;

        const removeButton = document.createElement('button');
        removeButton.textContent = "Remover";
        removeButton.className = 'bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 text-sm';
        removeButton.onclick = () => document.getElementById(rowId).remove();
        
        row.appendChild(loadName);
        row.appendChild(loadType);
        row.appendChild(loadValue);
        row.appendChild(removeButton);

        loadsContainer.appendChild(row);
    }

    addLoadBtn.addEventListener('click', addLoadRow);
    generateReportBtn.addEventListener('click', generateReportHandler);
    initializeSharedUI();

    // Add initial row
    addLoadRow();
});

const nbrComboCalculator = (() => {
    function calculate(userLoads) {
        const permanentes = userLoads.filter(l => !LOAD_TYPES[l.type].isVariable);
        const variaveis = userLoads.filter(l => LOAD_TYPES[l.type].isVariable);
        const combinations = { elu: [], els_rara: [], els_freq: [], els_qp: [] };

        // --- 1. ELU - Combinações Normais ---
        if (variaveis.length > 0) {
            variaveis.forEach((q_principal, index) => {
                let formula = [];
                let formulaString = [];

                // Add permanent loads
                permanentes.forEach(g => {
                    const factor = LOAD_TYPES[g.type].gamma_g;
                    formula.push(`${factor} * ${g.value}`);
                    formulaString.push(`${factor.toFixed(2)}*${g.name}`);
                });

                // Add principal variable load
                const qp_type = LOAD_TYPES[q_principal.type];
                formula.push(`${qp_type.gamma_q} * ${q_principal.value}`);
                formulaString.push(`${qp_type.gamma_q.toFixed(2)}*${q_principal.name}`);

                // Add other variable loads
                variaveis.forEach((q_sec, sec_index) => {
                    if (index === sec_index) return; // Skip the principal one
                    const qs_type = LOAD_TYPES[q_sec.type];
                    const factor = qp_type.gamma_q * qs_type.psi0;
                    formula.push(`${factor} * ${q_sec.value}`);
                    formulaString.push(`${factor.toFixed(2)}*${q_sec.name}`);
                });

                combinations.elu.push({
                    title: `ELU (Principal: ${q_principal.name})`,
                    formula: formulaString.join(' + '),
                    result: eval(formula.join(' + '))
                });
            });
        } else { // Only permanent loads
            let formula = permanentes.map(g => `${LOAD_TYPES[g.type].gamma_g} * ${g.value}`);
            let formulaString = permanentes.map(g => `${LOAD_TYPES[g.type].gamma_g.toFixed(2)}*${g.name}`);
            combinations.elu.push({
                title: 'ELU (Apenas Cargas Permanentes)',
                formula: formulaString.join(' + '),
                result: eval(formula.join(' + '))
            });
        }

        // --- 2. ELS - Combinações ---
        // ELS - Quase-Permanente (one combination)
        let els_qp_formula = permanentes.map(g => `1.0 * ${g.value}`);
        let els_qp_formulaString = permanentes.map(g => `1.00*${g.name}`);
        variaveis.forEach(q => {
            els_qp_formula.push(`${LOAD_TYPES[q.type].psi2} * ${q.value}`);
            els_qp_formulaString.push(`${LOAD_TYPES[q.type].psi2.toFixed(2)}*${q.name}`);
        });
        combinations.els_qp.push({
            title: 'ELS - Quase-Permanente',
            formula: els_qp_formulaString.join(' + '),
            result: eval(els_qp_formula.join(' + '))
        });

        // ELS - Frequente & Rara (iterate through each variable load as principal)
        if (variaveis.length > 0) {
            variaveis.forEach((q_principal, index) => {
                let els_freq_formula = permanentes.map(g => `1.0 * ${g.value}`);
                let els_freq_formulaString = permanentes.map(g => `1.00*${g.name}`);
                let els_rara_formula = [...els_freq_formula];
                let els_rara_formulaString = [...els_freq_formulaString];

                // Add principal variable load
                els_freq_formula.push(`1.0 * ${q_principal.value}`);
                els_freq_formulaString.push(`1.00*${q_principal.name}`);
                els_rara_formula.push(`1.0 * ${q_principal.value}`);
                els_rara_formulaString.push(`1.00*${q_principal.name}`);

                // Add other variable loads
                variaveis.forEach((q_sec, sec_index) => {
                    if (index === sec_index) return;
                    const qs_type = LOAD_TYPES[q_sec.type];
                    els_freq_formula.push(`${qs_type.psi2} * ${q_sec.value}`);
                    els_freq_formulaString.push(`${qs_type.psi2.toFixed(2)}*${q_sec.name}`);
                    els_rara_formula.push(`${qs_type.psi1} * ${q_sec.value}`);
                    els_rara_formulaString.push(`${qs_type.psi1.toFixed(2)}*${q_sec.name}`);
                });

                combinations.els_freq.push({
                    title: `ELS - Frequente (Principal: ${q_principal.name})`,
                    formula: els_freq_formulaString.join(' + '),
                    result: eval(els_freq_formula.join(' + '))
                });
                combinations.els_rara.push({
                    title: `ELS - Rara (Principal: ${q_principal.name})`,
                    formula: els_rara_formulaString.join(' + '),
                    result: eval(els_rara_formula.join(' + '))
                });
            });
        }
        return { combinations };
    }
    return { calculate };
})();

function generateReportHandler() {
    const reportOutput = document.getElementById('report-output');
    const userLoads = Array.from(document.getElementById('loads-container').children)
        .map(row => ({
            name: row.querySelector('.load-name').value,
            type: row.querySelector('.load-type').value,
            value: parseFloat(row.querySelector('.load-value').value) || 0
        }))
        .filter(l => l.name && l.type);
    
    if (userLoads.length === 0) {
        reportOutput.innerHTML = `<p class="text-red-500 text-center">Por favor, adicione pelo menos um carregamento com nome, tipo e valor definidos.</p>`;
        return;
    }
    
    const { combinations } = nbrComboCalculator.calculate(userLoads);

    // --- Render HTML ---
    let html = `<div id="nbr-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
                <div class="flex justify-end gap-2 -mt-2 -mr-2 print-hidden">
                    <button data-copy-target-id="nbr-report-content" class="copy-section-btn bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copiar Relatório</button>
                    <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Baixar PDF</button>
                </div>`;
    
    function createSectionHTML(title, combos) {
        if (combos.length === 0) return '';
        let sectionHTML = `<div class="form-section !p-4"><h3 class="report-header">${title}</h3><div class="space-y-3 mt-3">`;
        combos.forEach(c => {
             sectionHTML += `<div class="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md">
                                <p class="font-semibold text-gray-800 dark:text-gray-300">${c.title}</p>
                                <p class="text-sm text-blue-600 dark:text-blue-400 font-mono break-words">${c.formula} = <b>${c.result.toFixed(2)}</b></p>
                             </div>`;
        });
        sectionHTML += `</div></div>`;
        return sectionHTML;
    }

    html += createSectionHTML('ELU - Combinações Normais', combinations.elu);
    html += createSectionHTML('ELS - Combinação Rara', combinations.els_rara);
    html += createSectionHTML('ELS - Combinação Frequente', combinations.els_freq);
    html += createSectionHTML('ELS - Combinação Quase-Permanente', combinations.els_qp);
    
    html += `</div>`;
    reportOutput.innerHTML = html;

    document.getElementById('download-pdf-btn')?.addEventListener('click', () => {
        handleDownloadPdf('nbr-report-content', 'NBR-Combinacoes-Relatorio.pdf');
    });
}