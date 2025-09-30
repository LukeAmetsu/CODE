// --- 1. CONFIGURAÇÕES E DADOS BASE (NBR 8681 e 6118) ---
// This section defines the core coefficients and load types according to Brazilian standards.
const LOAD_TYPES = {
    'Peso Próprio (PP)': { isVariable: false, subtype: 'pp' },
    'Permanente (G)': { isVariable: false, subtype: 'default' },
    'Permanente (Retração/Recalque)': { isVariable: false, subtype: 'recalque' },
    'Flutuação (Equilíbrio)': { isVariable: true, subtype: 'equilibrio' },
    'Uso Residencial (Q)': { isVariable: true, psi0: 0.5, psi1: 0.4, psi2: 0.3 },
    'Uso Escritório/Loja (Q)': { isVariable: true, psi0: 0.7, psi1: 0.4, psi2: 0.3 },
    'Garagem/Estacionamento (Q)': { isVariable: true, psi0: 0.7, psi1: 0.6, psi2: 0.4 },
    'Vento (W)': { isVariable: true, psi0: 0.6, psi1: 0.3, psi2: 0.0 },
    'Temperatura (T)': { isVariable: true, psi0: 0.6, psi1: 0.5, psi2: 0.3 },
    'Líquidos (Truncado)': { isVariable: true, psi0: 0.5, psi1: 0.4, psi2: 0.3 },
    'Outras Ações Variáveis (Q)': { isVariable: true, psi0: 0.8, psi1: 0.6, psi2: 0.4 },
};
const GAMMA_G_DESF = 1.4;
const GAMMA_G_FAV = 1.0;
const GAMMA_PP_DESF = 1.35; // Per NBR 6118
const GAMMA_Q = 1.4;
const GAMMA_RECALQUE_DESF = 1.2; // Per NBR 6118
const GAMMA_RECALQUE_FAV = 0.0;

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
    
    function addLoadRow() {
        const rowId = `row-${Date.now()}`;
        const row = document.createElement('div');
        row.id = rowId;
        row.className = 'grid grid-cols-1 md:grid-cols-[2fr_2fr_1fr] gap-3 items-center';

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

        const removeButton = document.createElement('button');
        removeButton.textContent = "Remover";
        removeButton.className = 'bg-red-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-600 text-sm';
        removeButton.onclick = () => document.getElementById(rowId).remove();
        
        row.appendChild(loadName);
        row.appendChild(loadType);
        row.appendChild(removeButton);

        loadsContainer.appendChild(row);
    }

    addLoadBtn.addEventListener('click', addLoadRow);
    generateReportBtn.addEventListener('click', generateReportHandler);
    initializeSharedUI();

    // Add initial row
    addLoadRow();
});

function generateReportHandler() {
    const reportOutput = document.getElementById('report-output');
    reportOutput.innerHTML = '';

    const userLoads = [];
    const rows = document.getElementById('loads-container').children;
    for (const row of rows) {
        const name = row.querySelector('.load-name').value;
        const type = row.querySelector('.load-type').value;
        if (name && type) {
            userLoads.push({ name, type });
        }
    }

    if (userLoads.length === 0) {
        reportOutput.innerHTML = `<p class="text-red-500 text-center">Por favor, adicione pelo menos um carregamento com nome e tipo definidos.</p>`;
        return;
    }

    const permanentes = userLoads.filter(l => !LOAD_TYPES[l.type].isVariable);
    const variaveis = userLoads.filter(l => LOAD_TYPES[l.type].isVariable);
    const equilibrio_loads = variaveis.filter(l => LOAD_TYPES[l.type].subtype === 'equilibrio');
    const variaveis_normais = variaveis.filter(l => LOAD_TYPES[l.type].subtype !== 'equilibrio');

    const combinations = { elu_desf: [], elu_fav: [], elu_equilibrio: [], els: [] };

    // --- Logic for Equilibrium Combination ---
    if (equilibrio_loads.length > 0) {
        equilibrio_loads.forEach(eq_load => {
            const perm_fav_parts = permanentes
                .filter(g => LOAD_TYPES[g.type].subtype !== 'recalque')
                .map(g => `1.00 * ${g.name}`);
            const buoyancy_part = `1.00 * ${eq_load.name}`;
            const formula_parts = [...perm_fav_parts, buoyancy_part];
            combinations.elu_equilibrio.push({
                title: `Verificação de Equilíbrio com ${eq_load.name}`,
                formula: formula_parts.join(" + ")
            });
        });
    }
    
    // --- Logic for Normal ELU Combinations ---
    if (variaveis_normais.length > 0) {
        variaveis_normais.forEach(q_p => {
            // Desfavorable
            const desf_parts_perm = permanentes.map(g => {
                const subtype = LOAD_TYPES[g.type].subtype;
                if (subtype === 'recalque') return `${GAMMA_RECALQUE_DESF.toFixed(2)} * ${g.name}`;
                if (subtype === 'pp') return `${GAMMA_PP_DESF.toFixed(2)} * ${g.name}`;
                return `${GAMMA_G_DESF.toFixed(2)} * ${g.name}`;
            });

            let desf_parts_var = [`${GAMMA_Q.toFixed(2)} * ${q_p.name}`];
            variaveis_normais.forEach(q => {
                if (q === q_p || (q_p.type.includes('Vento') && q.type.includes('Vento'))) return;
                const coeff = GAMMA_Q * LOAD_TYPES[q.type].psi0;
                desf_parts_var.push(`${coeff.toFixed(2)} * ${q.name}`);
            });
            combinations.elu_desf.push({
                title: `Ação Principal: ${q_p.name}`,
                formula: [...desf_parts_perm, ...desf_parts_var].join(" + ")
            });
        });
    } else if (permanentes.length > 0) {
        // Only permanent loads
        const parts = permanentes.map(g => {
             const subtype = LOAD_TYPES[g.type].subtype;
             if (subtype === 'recalque') return `${GAMMA_RECALQUE_DESF.toFixed(2)} * ${g.name}`;
             if (subtype === 'pp') return `${GAMMA_PP_DESF.toFixed(2)} * ${g.name}`;
             return `${GAMMA_G_DESF.toFixed(2)} * ${g.name}`;
        });
        combinations.elu_desf.push({ title: 'Apenas Ações Permanentes', formula: parts.join(" + ") });
    }
    
    // --- Logic for ELS Combinations ---
    const qp_parts = permanentes.map(g => `1.00 * ${g.name}`);
    variaveis_normais.forEach(q => qp_parts.push(`${LOAD_TYPES[q.type].psi2.toFixed(2)} * ${q.name}`));
    combinations.els.push({ title: 'ELS - Quase Permanente', formula: qp_parts.join(" + ") });

    if (variaveis_normais.length > 0) {
        variaveis_normais.forEach(q_p => {
            // Frequente
            const freq_parts_perm = permanentes.map(g => `1.00 * ${g.name}`);
            let freq_parts_var = [`1.00 * ${q_p.name}`];
            variaveis_normais.forEach(q => {
                 if (q === q_p || (q_p.type.includes('Vento') && q.type.includes('Vento'))) return;
                 freq_parts_var.push(`${LOAD_TYPES[q.type].psi1.toFixed(2)} * ${q.name}`);
            });
            combinations.els.push({ title: `ELS - Frequente (${q_p.name} Princ.)`, formula: [...freq_parts_perm, ...freq_parts_var].join(" + ") });

            // Rara
            const rara_parts_perm = permanentes.map(g => `1.00 * ${g.name}`);
            let rara_parts_var = [`1.00 * ${q_p.name}`];
            variaveis_normais.forEach(q => {
                if (q === q_p || (q_p.type.includes('Vento') && q.type.includes('Vento'))) return;
                 rara_parts_var.push(`${LOAD_TYPES[q.type].psi0.toFixed(2)} * ${q.name}`);
            });
             combinations.els.push({ title: `ELS - Rara (${q_p.name} Princ.)`, formula: [...rara_parts_perm, ...rara_parts_var].join(" + ") });
        });
    }
    
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
             sectionHTML += `<div class="p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
                                <p class="font-semibold text-gray-800 dark:text-gray-300">${c.title}</p>
                                <p class="text-sm text-blue-600 dark:text-blue-400 font-mono break-words">${c.formula}</p>
                             </div>`;
        });
        sectionHTML += `</div></div>`;
        return sectionHTML;
    }

    html += createSectionHTML('ELU - Combinações Normais', combinations.elu_desf);
    html += createSectionHTML('ELU - Verificação de Equilíbrio (Corpo Rígido)', combinations.elu_equilibrio);
    html += createSectionHTML('Estado Limite de Serviço (ELS)', combinations.els);
    
    html += `</div>`;
    reportOutput.innerHTML = html;

    document.getElementById('download-pdf-btn')?.addEventListener('click', () => {
        handleDownloadPdf('nbr-report-content', 'NBR-Combinacoes-Relatorio.pdf');
    });
}