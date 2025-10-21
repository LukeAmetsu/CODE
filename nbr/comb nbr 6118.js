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

initializeApp({
    calculationHandler: createCalculationHandler({
        gatherInputsFunction: gatherNbrLoads,
        calculatorFunction: nbrComboCalculator.calculate,
        renderFunction: renderNbrComboResults,
        resultsContainerId: 'report-output',
        buttonId: 'generate-report-btn', // Corrected button ID
        validationRuleKey: 'nbr_combos', // Added for consistency
        feedbackElId: 'feedback-message'
    }),
    onReady: () => {
        const loadsContainer = document.getElementById('loads-container');
        const addLoadBtn = document.getElementById('add-load-btn');
        addLoadBtn.addEventListener('click', () => addLoadRow(loadsContainer));
        addLoadRow(loadsContainer); // Add initial row
    }
});

function addLoadRow(container, load = { name: '', type: 'Uso Residencial (Q)', value: '' }) {
        const rowId = `row-${Date.now()}`;
        const row = document.createElement('div');
        row.id = rowId;
        row.className = 'grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr_auto] gap-3 items-center load-row';

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
        loadValue.className = 'load-value w-full';
        loadValue.value = load.value;

        const removeButton = document.createElement('button');
        removeButton.textContent = "Remover";
        removeButton.className = 'bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 text-sm';
        removeButton.onclick = () => document.getElementById(rowId).remove();
        
        row.appendChild(loadName);
        row.appendChild(loadType);
        row.appendChild(loadValue);
        row.appendChild(removeButton);

    container.appendChild(row);
}

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

function gatherNbrLoads() {
    return Array.from(document.querySelectorAll('.load-row')).map(row => {
        return {
            name: row.querySelector('.load-name').value,
            type: row.querySelector('.load-type').value,
            value: parseFloat(row.querySelector('.load-value').value) || 0
        };
    }).filter(l => l.name && l.type);
}

function renderNbrComboResults(fullResults) {
    const { combinations, inputs } = fullResults;

    const report = new ReportBuilder({
        reportId: 'nbr-report-content',
        title: 'Relatório de Combinações NBR (8681 / 6118)',
    });

    const inputSummaryRows = inputs.map(load => {
        return { cells: [load.name, load.type, load.value.toFixed(2)] };
    });

    report.addTableSection('Cargas de Entrada', {
        headers: ['Nome da Carga', 'Tipo (NBR 8681)', 'Valor'],
        rows: inputSummaryRows
    }, 'nbr-inputs-summary');

    const createComboTableSection = (title, combos) => {
        if (!combos || combos.length === 0) return;

        const rows = combos.map(c => ({
            cells: [c.title, `<code class="text-sm">${c.formula}</code>`, `<b>${c.result.toFixed(2)}</b>`]
        }));
        report.addTableSection(title, { headers: ['Combinação', 'Fórmula', 'Resultado'], rows });
    };

    createComboTableSection('ELU - Combinações Últimas', combinations.elu);
    createComboTableSection('ELS - Combinação Rara', combinations.els_rara);
    createComboTableSection('ELS - Combinação Frequente', combinations.els_freq);
    createComboTableSection('ELS - Combinação Quase-Permanente', combinations.els_qp);

    report.render('report-output');
}