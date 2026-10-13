/**
 * Combinações de Cargas nas Bases (MIETC • Multi-Bases)
 * Frontend Engine & Reatividade
 */

// Estado Global da Aplicação
let currentWorkbookData = null;
let currentResults = null;
let activeSheetName = '';
let activeFilterPrefix = '';
let searchQuery = '';
let currentSort = 'name_asc';
let currentEnvelopeView = 'all';
let recalcTimeout = null;
let configuredFootingGroups = [];
let activeTableView = 'individual'; // 'individual', 'combined' ou 'similarity'
let enableCombinedFootings = true;
let similarityTolerance = 0.20; // 20% de tolerância padrão para famílias

// Catálogo de Categorias e Ações
const ACTION_CATEGORIES = {
    'Fundações Rasas & Geotécnica': [
        'Solo Seco (Empuxo)',
        'Solo Saturado (Empuxo)',
        'Pressão Hidrostática / Água',
        'Subpressão / Uplift',
        'Sobrecarga no Tardoz (Q_solo)'
    ],
    'Estruturais & Permanentes': [
        'Peso Próprio (PP)',
        'Permanente (G)',
        'Equipamentos Fixos'
    ],
    'Sobrecargas de Uso': [
        'Operação / Correia (TCO)',
        'Partida / Transitório (TCP)',
        'Uso Residencial (Q)',
        'Uso Escritório/Loja (Q)',
        'Garagem/Estacionamento (Q)',
        'Cobertura / Manutenção (Q)',
        'Ponte Rolante / Guindaste (Q)',
        'Outras Ações Variáveis (Q)'
    ],
    'Climáticos & Ambientais': [
        'Vento (W)',
        'Temperatura (T)'
    ],
    'Acidentais & Especiais': [
        'Sobrecarga Acidental (SCA)',
        'Sismo (E)',
        'Impacto / Choque Acidental',
        'Carga Acidental de Montagem',
        'Incêndio / Ação Excepcional',
        'Outras Ações Acidentais'
    ]
};

const INITIAL_PRESET_ROWS = [
    { name: 'PP', type: 'Peso Próprio (PP)', value: 100.0, gamma: 1.35, group: '', excludes: '', requires: '', can_zero: false },
    { name: 'CP', type: 'Permanente (G)', value: 40.0, gamma: 1.40, group: '', excludes: '', requires: '', can_zero: false },
    { name: 'SCM', type: 'Cobertura / Manutenção (Q)', value: 25.0, gamma: 1.50, group: '', excludes: '', requires: '', can_zero: true },
    { name: 'SCP', type: 'Uso Residencial (Q)', value: 20.0, gamma: 1.50, group: '', excludes: '', requires: '', can_zero: true },
    { name: 'TCO', type: 'Operação / Correia (TCO)', value: 15.0, gamma: 1.40, group: 'Operação/Partida', excludes: 'TCP', requires: '', can_zero: true },
    { name: 'TCP', type: 'Partida / Transitório (TCP)', value: 10.0, gamma: 1.20, group: 'Operação/Partida', excludes: 'TCO, CVX+, CVY+, Vento', requires: '', can_zero: true },
    { name: 'T', type: 'Temperatura (T)', value: 5.0, gamma: 1.20, group: '', excludes: '', requires: '', can_zero: true },
    { name: 'CVX+', type: 'Vento (W)', value: 35.0, gamma: 1.40, group: 'Vento', excludes: 'TCP', requires: '', can_zero: false },
    { name: 'CVY+', type: 'Vento (W)', value: 30.0, gamma: 1.40, group: 'Vento', excludes: 'TCP', requires: '', can_zero: false },
    { name: 'SCA', type: 'Sobrecarga Acidental (SCA)', value: 18.0, gamma: 1.50, group: '', excludes: '', requires: '', can_zero: true }
];

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', function () {
    // Inicializa cabeçalho de envoltórias
    renderSummaryTableHead();
    // Inicializa tabela de carregamentos e regras com presets
    initLoadRulesPreview();
    // Inicializa painel de sapatas conjuntas
    renderFootingGroups();
    // Tenta carregar a planilha padrão imediatamente para conveniência do usuário
    setTimeout(loadDefaultWorkbook, 300);
});

/**
 * Constrói as opções HTML do select de tipo de ação
 */
function buildTypeSelectOptions(selectedType) {
    let html = '';
    const icons = {
        'Peso Próprio (PP)': '🧱',
        'Permanente (G)': '🏗️',
        'Equipamentos Fixos': '⚙️',
        'Solo Seco (Empuxo)': '🏜️',
        'Solo Saturado (Empuxo)': '🌊',
        'Pressão Hidrostática / Água': '💧',
        'Subpressão / Uplift': '⬆️',
        'Sobrecarga no Tardoz (Q_solo)': '🚛',
        'Operação / Correia (TCO)': '⚙️',
        'Partida / Transitório (TCP)': '⚡',
        'Uso Residencial (Q)': '🛋️',
        'Uso Escritório/Loja (Q)': '🏢',
        'Garagem/Estacionamento (Q)': '🚗',
        'Cobertura / Manutenção (Q)': '👷',
        'Ponte Rolante / Guindaste (Q)': '🏗️',
        'Outras Ações Variáveis (Q)': '⚡',
        'Vento (W)': '💨',
        'Temperatura (T)': '🌡️',
        'Sobrecarga Acidental (SCA)': '⚠️',
        'Impacto / Choque Acidental': '💥',
        'Carga Acidental de Montagem': '🏗️',
        'Incêndio / Ação Excepcional': '🔥',
        'Outras Ações Acidentais': '⚡',
        'Sismo (E)': '🌋'
    };

    Object.keys(ACTION_CATEGORIES).forEach(cat => {
        html += `<optgroup label="${cat}">`;
        ACTION_CATEGORIES[cat].forEach(t => {
            const icon = icons[t] || '📌';
            const isSel = (t === selectedType) ? 'selected' : '';
            html += `<option value="${t}" ${isSel}>${icon} ${t}</option>`;
        });
        html += `</optgroup>`;
    });
    return html;
}

/**
 * Adiciona uma linha na tabela de Carregamentos e Regras de Associação
 */
function addLoadActionRow(load) {
    const container = document.getElementById('loads-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs items-center transition-all hover:border-blue-500/50 dark:hover:border-blue-500/50';

    const defaultName = load?.name || `Carga ${container.children.length + 1}`;
    const defaultType = load?.type || 'Outras Ações Variáveis (Q)';
    const defaultValue = (load?.value !== undefined && load?.value !== null) ? load.value : 15.0;
    const defaultGamma = (load?.gamma !== undefined && load?.gamma !== null && load?.gamma !== '') ? load.gamma : '';
    const defaultGroup = load?.group || '';
    const defaultExcludes = load?.excludes || '';
    const defaultReq = load?.requires || '';
    const defaultCanZero = load?.can_zero !== undefined ? load.can_zero : (load?.name === 'PP' ? false : true);

    row.innerHTML = `
        <div class="sm:col-span-2">
            <input type="text" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs font-semibold text-gray-900 dark:text-gray-100 load-name focus:ring-2 focus:ring-blue-500 focus:outline-none" value="${defaultName}" placeholder="Ação (ex: TCP)">
        </div>
        <div class="sm:col-span-2">
            <select class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-1.5 py-1.5 text-[11px] load-type font-medium cursor-pointer text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                ${buildTypeSelectOptions(defaultType)}
            </select>
        </div>
        <div class="sm:col-span-1">
            <input type="number" step="any" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-1.5 py-1.5 text-xs font-bold text-right load-val text-indigo-600 dark:text-indigo-400 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none" value="${defaultValue}" placeholder="Valor">
        </div>
        <div class="sm:col-span-1">
            <input type="number" step="0.05" min="0" max="5" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-1 py-1.5 text-xs font-bold text-center load-gamma text-violet-700 dark:text-violet-300 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none" value="${defaultGamma}" placeholder="Auto" title="Coeficiente de ponderação γ_f (ex: 1.35, 1.40, 1.20, 1.50). Deixe vazio para usar a norma.">
        </div>
        <div class="sm:col-span-1">
            <input type="text" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-1 py-1.5 text-[11px] text-center load-group font-medium text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none" value="${defaultGroup}" placeholder="Ex: Vento" title="Grupo de Exclusão Mútua (XOR): ações no mesmo grupo nunca atuam juntas.">
        </div>
        <div class="sm:col-span-2">
            <input type="text" class="w-full bg-gray-50 dark:bg-gray-900 border border-rose-300 dark:border-rose-900/60 rounded-lg px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300 font-semibold load-excludes placeholder-rose-300/70 focus:ring-2 focus:ring-rose-500 focus:outline-none" value="${defaultExcludes}" placeholder="Ex: TCP, Vento" title="Exclusão Específica (NOT): ações ou grupos incompatíveis com esta ação (separados por vírgula).">
        </div>
        <div class="sm:col-span-1">
            <select class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-1 py-1.5 text-[11px] load-requires cursor-pointer text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none" title="Coexistência Obrigatória (AND): esta ação só atua se a selecionada estiver presente.">
                <option value="">-- Nenhum --</option>
                ${defaultReq ? `<option value="${defaultReq}" selected>${defaultReq}</option>` : ''}
            </select>
        </div>
        <div class="sm:col-span-1 text-center flex flex-col items-center justify-center">
            <input type="checkbox" class="load-can-zero w-4 h-4 text-amber-600 bg-gray-50 dark:bg-gray-900 border-gray-300 dark:border-gray-600 rounded focus:ring-amber-500 cursor-pointer" ${defaultCanZero ? 'checked' : ''} title="Marque para permitir que esta ação seja zerada em combinações de alívio e tração máxima">
        </div>
        <div class="sm:col-span-1 text-center">
            <button type="button" class="text-rose-500 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-base delete-load-btn transition-colors cursor-pointer mx-auto" title="Excluir Carga">✕</button>
        </div>
    `;

    // Eventos da linha
    row.querySelector('.delete-load-btn')?.addEventListener('click', function () {
        row.remove();
        updateCompanionSelects();
        updateRulesSummary();
        scheduleRecalculate();
    });

    row.querySelector('.load-name')?.addEventListener('input', function () {
        updateCompanionSelects();
        updateRulesSummary();
        scheduleRecalculate();
    });

    row.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', function () {
            updateCompanionSelects();
            updateRulesSummary();
            scheduleRecalculate();
        });
    });

    container.appendChild(row);
}

/**
 * Adiciona uma nova linha em branco de carga customizada
 */
function addNewLoadActionRow() {
    addLoadActionRow({
        name: `Sobrecarga Adicional ${(document.querySelectorAll('#loads-container > div').length + 1)}`,
        type: 'Outras Ações Variáveis (Q)',
        value: 10.0,
        gamma: 1.40,
        group: '',
        excludes: '',
        requires: ''
    });
    updateCompanionSelects();
    updateRulesSummary();
    scheduleRecalculate();
}

/**
 * Atualiza os dropdowns de "Requer (AND)" com os nomes atuais das ações
 */
function updateCompanionSelects() {
    const rows = document.querySelectorAll('#loads-container > div');
    const names = [];
    rows.forEach(r => {
        const n = r.querySelector('.load-name')?.value?.trim();
        if (n) names.push(n);
    });

    rows.forEach(r => {
        const sel = r.querySelector('.load-requires');
        if (!sel) return;
        const currentVal = sel.value;
        const myName = r.querySelector('.load-name')?.value?.trim();

        let opts = '<option value="">-- Nenhuma --</option>';
        names.forEach(name => {
            if (name !== myName) {
                opts += `<option value="${name}" ${name === currentVal ? 'selected' : ''}>${name}</option>`;
            }
        });
        sel.innerHTML = opts;
    });
}

/**
 * Atualiza os badges dinâmicos de regras ativas
 */
function updateRulesSummary() {
    const rows = document.querySelectorAll('#loads-container > div');
    const container = document.getElementById('active-rules-summary');
    if (!container) return;

    const groups = {};
    const exclusions = [];
    const companions = [];
    const zeroableList = [];
    let soloSeco = null;
    let agua = null;

    rows.forEach(r => {
        const n = r.querySelector('.load-name')?.value?.trim();
        const t = r.querySelector('.load-type')?.value || '';
        const g = r.querySelector('.load-group')?.value?.trim();
        const excl = r.querySelector('.load-excludes')?.value?.trim();
        const req = r.querySelector('.load-requires')?.value?.trim();
        const canZero = r.querySelector('.load-can-zero')?.checked ?? false;

        if (g && n) {
            if (!groups[g]) groups[g] = [];
            groups[g].push(n);
        }
        if (excl && n) {
            exclusions.push({ from: n, excludes: excl });
        }
        if (req && n) {
            companions.push({ from: n, to: req });
        }
        if (canZero && n) {
            zeroableList.push(n);
        }
        if (n && (n.toLowerCase().includes('seco') || t.toLowerCase().includes('seco'))) soloSeco = n;
        if (n && (n.toLowerCase().includes('água') || n.toLowerCase().includes('agua') || t.toLowerCase().includes('água'))) agua = n;
    });

    let html = '';

    // 1. Regras de Exclusão por Grupo (XOR)
    Object.keys(groups).forEach(grp => {
        if (groups[grp].length > 1) {
            html += `
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                    <span>🚫 Exclusão Grupo (${grp}):</span> <span class="font-bold">${groups[grp].join(' ⊄ ')}</span>
                </div>
            `;
        }
    });

    // 2. Regras de Exclusão Específica Direta (NOT)
    exclusions.forEach(e => {
        html += `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-semibold">
                <span>⚡ Exclusão Direta:</span> <span class="font-bold">[${e.from}]</span> ⊄ exclui <span class="font-bold">[${e.excludes}]</span>
            </div>
        `;
    });

    // 2.1 Destaque Especial: Vento Seletivo (Partida vs Outras Ações)
    const hasWindExcludedFromStarting = exclusions.some(e =>
        (e.from.toUpperCase().includes('TCP') && (e.excludes.toUpperCase().includes('CV') || e.excludes.toUpperCase().includes('VENTO'))) ||
        ((e.from.toUpperCase().includes('CV') || e.from.toUpperCase().includes('VENTO')) && e.excludes.toUpperCase().includes('TCP'))
    );
    if (hasWindExcludedFromStarting) {
        html += `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 text-xs font-semibold shadow-2xs">
                <span>💨 Vento Seletivo:</span> Excluído na Partida (TCP), mas <span class="underline font-bold">permitido</span> com Operação (TCO), Material e demais ações.
            </div>
        `;
    }

    // 3. Regras de Coexistência (AND)
    companions.forEach(c => {
        html += `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <span>🔗 Coexistência Obrigatória:</span> <span class="font-bold">[${c.from}]</span> ⟹ requer <span class="font-bold">[${c.to}]</span>
            </div>
        `;
    });

    // 4. Ações Zeráveis para Alívio Crítico / Máxima Tração
    if (zeroableList.length > 0) {
        html += `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 text-xs font-semibold" title="Estas ações serão zeradas em combinações variantes conservadoras para avaliar a máxima tração (arrancamento) e alívio de peso na fundação">
                <span>🛡️ Zeráveis p/ Alívio Crítico:</span> <span class="font-bold">${zeroableList.join(', ')}</span> (fator 0.00 gerado)
            </div>
        `;
    }

    // 5. Condição Física: Solo Seco vs Água
    if (soloSeco && agua) {
        html += `
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">
                <span>💧 Condição Física:</span> <span class="font-bold">[${soloSeco}]</span> desativa automaticamente <span class="font-bold">[${agua}]</span>
            </div>
        `;
    }

    if (!html) {
        html = '<span class="text-xs text-gray-400 italic">Nenhuma regra especial ativa. Todas as ações elegíveis atuarão conforme as permutações da norma selecionada.</span>';
    }

    container.innerHTML = html;
}

/**
 * Inicializa a tabela com o preview do preset inicial
 */
function initLoadRulesPreview() {
    const container = document.getElementById('loads-container');
    if (!container) return;
    container.innerHTML = '';
    INITIAL_PRESET_ROWS.forEach(r => addLoadActionRow(r));
    updateCompanionSelects();
    updateRulesSummary();
}

/**
 * Sincroniza a tabela com as ações da aba atual da planilha MIETC
 */
function initLoadRulesFromSheet(sheetData) {
    if (!sheetData) return;
    const container = document.getElementById('loads-container');
    if (!container) return;

    container.innerHTML = '';
    const actions = sheetData.actions_catalog || [];
    const distinctItems = [...new Set(actions.map(a => a.item))];
    const basesData = sheetData.bases_data || {};
    const basesList = sheetData.bases_list || [];

    distinctItems.forEach(item => {
        // Estima valor máximo característico nas bases
        let maxVal = 0.0;
        basesList.forEach(b => {
            const comps = basesData[b]?.[item] || {};
            maxVal = Math.max(maxVal, Math.abs(comps.V || 0.0), Math.abs(comps.X || 0.0), Math.abs(comps.Y || 0.0));
        });

        let type = 'Outras Ações Variáveis (Q)';
        let group = '';
        let excludes = '';
        let requires = '';
        let canZero = true;
        let gamma = '';

        if (item === 'PP') {
            type = 'Peso Próprio (PP)';
            canZero = false;
            gamma = 1.35;
        } else if (item === 'CP') {
            type = 'Permanente (G)';
            canZero = false;
            gamma = 1.40;
        } else if (item === 'SCM') {
            type = 'Cobertura / Manutenção (Q)';
            gamma = 1.50;
        } else if (item === 'SCP') {
            type = 'Uso Residencial (Q)';
            gamma = 1.50;
        } else if (item === 'TCO') {
            type = 'Operação / Correia (TCO)';
            group = 'Operação/Partida';
            excludes = 'TCP';
            gamma = 1.40;
        } else if (item === 'TCP') {
            type = 'Partida / Transitório (TCP)';
            group = 'Operação/Partida';
            excludes = 'TCO, CVX+, CVY+, Vento';
            gamma = 1.20;
        } else if (item === 'TCQ') {
            type = 'Ponte Rolante / Guindaste (Q)';
            group = 'Talha';
            gamma = 1.40;
        } else if (item === 'CVX+' || item === 'CVY+') {
            type = 'Vento (W)';
            group = 'Vento';
            excludes = 'TCP';
            canZero = false; // Vento de tombamento é a ação causadora de tração
            gamma = 1.40;
        } else if (item === 'T+' || item === 'T-' || item === 'T') {
            type = 'Temperatura (T)';
            gamma = 1.20;
        } else if (item === 'SCA' || item.includes('SCA') || item.toLowerCase().includes('acidental')) {
            type = 'Sobrecarga Acidental (SCA)';
            gamma = 1.50;
        }

        addLoadActionRow({
            name: item,
            type: type,
            value: Math.round(maxVal * 100) / 100,
            gamma: gamma,
            group: group,
            excludes: excludes,
            requires: requires,
            can_zero: canZero
        });
    });

    updateCompanionSelects();
    updateRulesSummary();
}

/**
 * Restaura regras e grupos padrões
 */
function resetDefaultLoadRules() {
    if (currentWorkbookData && activeSheetName && currentWorkbookData.sheets[activeSheetName]) {
        initLoadRulesFromSheet(currentWorkbookData.sheets[activeSheetName]);
    } else {
        initLoadRulesPreview();
    }
    recalculateCombinations();
}

// =========================================================================
// Gerenciamento de Sapatas Conjuntas & Agrupamento de Bases (Mesma Sapata)
// =========================================================================

/**
 * Detecta e agrupa automaticamente pares subsequentes (ex: BT1+BT2, BT3+BT4)
 */
function autoGroupPairs(basesList) {
    if (!basesList || basesList.length === 0) return;

    // Ordenação natural das bases (BT1, BT2, ..., BT10)
    const sorted = [...basesList].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const groupsByPrefix = {};
    const regex = /^([a-zA-Z_]+)(\d+)?/;

    sorted.forEach(b => {
        const m = b.trim().match(regex);
        const prefix = m ? m[1].toUpperCase() : 'BASE';
        if (!groupsByPrefix[prefix]) groupsByPrefix[prefix] = [];
        groupsByPrefix[prefix].push(b);
    });

    configuredFootingGroups = [];
    let counter = 1;

    Object.keys(groupsByPrefix).forEach(prefix => {
        const list = groupsByPrefix[prefix];
        let i = 0;
        while (i < list.length) {
            if (i + 1 < list.length) {
                const pair = [list[i], list[i + 1]];
                configuredFootingGroups.push({
                    id: `sapata_${counter}`,
                    name: `Sapata ${counter} (${pair[0]} + ${pair[1]})`,
                    bases: pair
                });
                counter++;
                i += 2;
            } else {
                configuredFootingGroups.push({
                    id: `sapata_${counter}`,
                    name: `Sapata ${counter} (${list[i]})`,
                    bases: [list[i]]
                });
                counter++;
                i += 1;
            }
        }
    });

    renderFootingGroups();
}

/**
 * Disparado pelo botão '⚡ Auto-Agrupar Pares'
 */
function autoGroupPairsClick() {
    const sheetData = currentWorkbookData?.sheets?.[activeSheetName];
    const bases = sheetData?.bases_list || sheetData?.bases_names || (currentResults?.summary_table ? currentResults.summary_table.map(r => r.base) : []);
    if (!bases || bases.length === 0) {
        alert('Nenhuma base encontrada na planilha para agrupamento.');
        return;
    }

    const toggle = document.getElementById('toggle-combined-footings');
    if (toggle && !toggle.checked) {
        toggle.checked = true;
    }

    autoGroupPairs(bases);
    setMainTableView('combined');
    scheduleRecalculate();
}

/**
 * Adiciona uma nova sapata para agrupamento personalizado
 */
function addNewFootingGroupRow() {
    const sheetData = currentWorkbookData?.sheets?.[activeSheetName];
    const availableBases = sheetData?.bases_list || sheetData?.bases_names || (currentResults?.summary_table ? currentResults.summary_table.map(r => r.base) : []);
    const idx = configuredFootingGroups.length + 1;
    const newGid = `sapata_${Date.now()}_${idx}`;

    const usedBases = new Set();
    configuredFootingGroups.forEach(g => g.bases.forEach(b => usedBases.add(b)));
    const freeBases = availableBases.filter(b => !usedBases.has(b));
    const initialBases = freeBases.length >= 2 ? [freeBases[0], freeBases[1]] : (freeBases.length === 1 ? [freeBases[0]] : []);

    const toggle = document.getElementById('toggle-combined-footings');
    if (toggle && !toggle.checked) {
        toggle.checked = true;
    }

    const name = `Sapata ${idx}${initialBases.length ? ' (' + initialBases.join(' + ') + ')' : ''}`;

    configuredFootingGroups.push({
        id: newGid,
        name: name,
        bases: initialBases
    });

    renderFootingGroups();
    setMainTableView('combined');
    scheduleRecalculate();
}

/**
 * Limpa todos os agrupamentos de sapata
 */
function clearFootingGroups() {
    configuredFootingGroups = [];
    renderFootingGroups();
    scheduleRecalculate();
}

/**
 * Remove um agrupamento de sapata
 */
function removeFootingGroup(gid) {
    configuredFootingGroups = configuredFootingGroups.filter(g => g.id !== gid);
    renderFootingGroups();
    scheduleRecalculate();
}

/**
 * Atualiza o nome da sapata conjunta
 */
function updateFootingGroupName(gid, newName) {
    const grp = configuredFootingGroups.find(g => g.id === gid);
    if (grp) {
        grp.name = newName.trim() || `Sapata (${grp.bases.join(' + ')})`;
        scheduleRecalculate();
    }
}

/**
 * Alterna a presença de uma base no grupo da sapata
 */
function toggleBaseInFootingGroup(gid, baseName) {
    const grp = configuredFootingGroups.find(g => g.id === gid);
    if (!grp) return;
    const pos = grp.bases.indexOf(baseName);
    if (pos >= 0) {
        grp.bases.splice(pos, 1);
    } else {
        grp.bases.push(baseName);
    }
    renderFootingGroups();
    scheduleRecalculate();
}

/**
 * Alterna a ativação geral do módulo de sapatas conjuntas
 */
function onToggleCombinedFootings() {
    const chk = document.getElementById('toggle-combined-footings');
    enableCombinedFootings = chk ? chk.checked : true;
    scheduleRecalculate();
}

/**
 * Renderiza o painel de sapatas conjuntas
 */
function renderFootingGroups() {
    const container = document.getElementById('footing-groups-container');
    if (!container) return;

    const sheetData = currentWorkbookData?.sheets?.[activeSheetName];
    const availableBases = (sheetData?.bases_list || sheetData?.bases_names || []).length > 0
        ? (sheetData.bases_list || sheetData.bases_names)
        : (currentResults?.summary_table ? currentResults.summary_table.map(r => r.base) : []);

    if (configuredFootingGroups.length === 0) {
        container.innerHTML = `
            <div class="py-6 text-center text-gray-400 text-xs italic bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                Nenhum agrupamento de sapata configurado. Clique em <span class="font-bold text-indigo-600 dark:text-indigo-400">"⚡ Auto-Agrupar Pares"</span> para emparelhar automaticamente montantes subsequentes (BT1+BT2, BT3+BT4) ou <span class="font-bold text-blue-600 dark:text-blue-400">"+ Nova Sapata"</span> para selecionar manualmente.
            </div>
        `;
        updateFootingGroupsSummary();
        return;
    }

    let html = '';
    configuredFootingGroups.forEach((grp) => {
        const memberCount = grp.bases.length;
        const countBadgeColor = memberCount >= 2
            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
            : (memberCount === 1 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300');

        html += `
            <div class="p-3 bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs transition-all hover:border-indigo-400/60 dark:hover:border-indigo-500/60" id="group-card-${grp.id}">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-gray-100 dark:border-gray-700/60">
                    <div class="flex items-center gap-2 flex-1">
                        <span class="text-base">🏛️</span>
                        <input type="text" value="${grp.name}" onchange="updateFootingGroupName('${grp.id}', this.value)" class="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-1.5 text-xs font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none flex-1 max-w-sm" placeholder="Nome da Sapata Conjunta">
                        <span class="${countBadgeColor} text-[11px] font-bold px-2 py-0.5 rounded-full">
                            ${memberCount} bases agrupadas
                        </span>
                    </div>
                    <div class="flex items-center gap-1.5 self-end sm:self-auto">
                        <button type="button" onclick="removeFootingGroup('${grp.id}')" class="text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1" title="Excluir este agrupamento">
                            <span>✕</span> Excluir
                        </button>
                    </div>
                </div>

                <div class="mt-2.5">
                    <span class="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                        Bases/montantes que apoiam nesta sapata:
                    </span>
                    <div class="flex flex-wrap items-center gap-1.5">
        `;

        availableBases.forEach(bName => {
            const isMember = grp.bases.includes(bName);
            if (isMember) {
                html += `
                    <button type="button" onclick="toggleBaseInFootingGroup('${grp.id}', '${bName}')" class="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-600 text-white shadow-xs hover:bg-indigo-700 transition-all cursor-pointer flex items-center gap-1" title="Clique para remover ${bName} desta sapata">
                        <span>✓</span> ${bName}
                    </button>
                `;
            } else {
                html += `
                    <button type="button" onclick="toggleBaseInFootingGroup('${grp.id}', '${bName}')" class="px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 border border-gray-200 dark:border-gray-600 transition-all cursor-pointer flex items-center gap-1" title="Clique para incluir ${bName} nesta sapata">
                        <span>+</span> ${bName}
                    </button>
                `;
            }
        });

        html += `
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    updateFootingGroupsSummary();
}

/**
 * Atualiza o resumo de sapatas configuradas e badge de contagem
 */
function updateFootingGroupsSummary() {
    const summaryText = document.getElementById('footing-groups-count-text');
    const badge = document.getElementById('combined-badge-count');
    const totalGroups = configuredFootingGroups.length;
    const totalGroupedBases = configuredFootingGroups.reduce((acc, g) => acc + g.bases.length, 0);

    if (badge) {
        badge.innerText = totalGroups;
    }

    if (summaryText) {
        if (totalGroups === 0) {
            summaryText.innerText = 'Nenhuma sapata conjunta configurada. Clique em "Auto-Agrupar Pares" ou "+ Nova Sapata".';
        } else {
            summaryText.innerHTML = `<span>🏛️ <strong>${totalGroups}</strong> sapatas conjuntas ativas integrando <strong>${totalGroupedBases}</strong> bases. Esforços simultâneos somados algebricamente por combinação.</span>`;
        }
    }
}

/**
 * Agenda recálculo com debounce
 */
function scheduleRecalculate() {
    clearTimeout(recalcTimeout);
    recalcTimeout = setTimeout(recalculateCombinations, 350);
}

/**
 * Coleta as regras lógicas e cargas customizadas da interface
 */
function collectRulesAndCustomLoads() {
    const rows = document.querySelectorAll('#loads-container > div');
    const action_rules = {};
    const custom_loads = [];
    const sheetData = currentWorkbookData?.sheets?.[activeSheetName];
    const sheetActions = new Set((sheetData?.actions_catalog || []).map(a => a.item));

    rows.forEach(r => {
        const name = r.querySelector('.load-name')?.value?.trim();
        const type = r.querySelector('.load-type')?.value;
        const val = parseFloat(r.querySelector('.load-val')?.value) || 0.0;
        const gamma = parseFloat(r.querySelector('.load-gamma')?.value) || 1.40;
        const group = r.querySelector('.load-group')?.value?.trim() || '';
        const excludes = r.querySelector('.load-excludes')?.value?.trim() || '';
        const requires = r.querySelector('.load-requires')?.value?.trim() || '';
        const can_zero = r.querySelector('.load-can-zero')?.checked ?? (name !== 'PP');

        if (!name) return;

        action_rules[name] = {
            group: group,
            excludes: excludes,
            requires: requires,
            type: type,
            can_zero: can_zero,
            gamma: gamma
        };

        if (!sheetActions.has(name)) {
            custom_loads.push({
                name: name,
                type: type,
                value: val,
                gamma: gamma,
                group: group,
                excludes: excludes,
                requires: requires,
                can_zero: can_zero,
                direction: 'V'
            });
        }
    });

    const enable_zero_load_scenarios = document.getElementById('toggle-zero-scenarios')?.checked ?? true;
    const enable_combined = document.getElementById('toggle-combined-footings')?.checked ?? true;

    let base_groups = [];
    if (enable_combined && configuredFootingGroups && configuredFootingGroups.length > 0) {
        base_groups = configuredFootingGroups.map(g => ({
            id: g.id,
            name: g.name,
            bases: g.bases
        }));
    }

    return { action_rules, custom_loads, enable_zero_load_scenarios, base_groups };
}


/**
 * Carrega a planilha padrão do repositório (Refs/Cópia de Cargas nas bases MIETC.xlsx)
 */
async function loadDefaultWorkbook() {
    const statusText = document.getElementById('status-text');
    const indicator = document.getElementById('status-indicator');
    const btn = document.getElementById('btn-load-default');

    if (statusText) statusText.innerText = 'Carregando planilha padrão Refs/Cópia de Cargas nas bases MIETC.xlsx...';
    if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse';
    if (btn) btn.disabled = true;

    try {
        if (typeof eel !== 'undefined' && eel.mietc_load_default_workbook) {
            const res = await eel.mietc_load_default_workbook()();
            if (res.status === 'success') {
                processLoadedWorkbook(res.data, res.file_name);
            } else {
                showError('Erro ao carregar planilha padrão: ' + (res.error || 'Falha desconhecida.'));
            }
        } else {
            showError('Comunicação com backend Eel não disponível no momento.');
        }
    } catch (err) {
        showError('Falha na requisição: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * Processa upload de arquivo local (.xlsx) pelo usuário
 */
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const statusText = document.getElementById('status-text');
    const indicator = document.getElementById('status-indicator');
    if (statusText) statusText.innerText = `Processando arquivo: ${file.name}...`;
    if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse';

    const reader = new FileReader();
    reader.onload = async function (e) {
        const base64 = e.target.result;
        try {
            if (typeof eel !== 'undefined' && eel.mietc_parse_uploaded_file) {
                const res = await eel.mietc_parse_uploaded_file(base64, file.name)();
                if (res.status === 'success') {
                    processLoadedWorkbook(res.data, res.file_name);
                } else {
                    showError('Erro ao processar planilha: ' + (res.error || 'Formato incompatível.'));
                }
            } else {
                showError('Backend Eel não conectado.');
            }
        } catch (err) {
            showError('Erro durante o envio do arquivo: ' + err.message);
        }
    };
    reader.readAsDataURL(file);
}

/**
 * Atualiza o estado da aplicação com os dados da planilha analisada
 */
function processLoadedWorkbook(data, filename) {
    currentWorkbookData = data;
    const sheetSelect = document.getElementById('sheet-select');
    const statusText = document.getElementById('status-text');
    const indicator = document.getElementById('status-indicator');
    const metadataBox = document.getElementById('file-metadata');
    const metaFilename = document.getElementById('meta-filename');
    const metaBases = document.getElementById('meta-bases-count');

    if (!data.sheet_names || data.sheet_names.length === 0) {
        showError('Nenhuma folha com estrutura de cargas nas bases encontrada na planilha.');
        return;
    }

    // Preenche seletor de abas
    sheetSelect.innerHTML = '';
    data.sheet_names.forEach((sname, idx) => {
        const opt = document.createElement('option');
        opt.value = sname;
        const bCount = data.sheets[sname]?.bases_count || 0;
        opt.innerText = `${sname} (${bCount} bases)`;
        if (idx === 0) opt.selected = true;
        sheetSelect.appendChild(opt);
    });

    activeSheetName = data.sheet_names[0];

    // Status
    if (statusText) statusText.innerText = `Planilha carregada com sucesso (${data.sheet_names.length} abas disponíveis).`;
    if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500';
    if (metadataBox) metadataBox.classList.remove('hidden');
    if (metaFilename) metaFilename.innerText = `📄 ${filename || 'Planilha MIETC'}`;

    // Inicializa as regras e ações para a folha selecionada
    initLoadRulesFromSheet(data.sheets[activeSheetName]);

    // Limpa grupos de sapatas anteriores para evitar persistência de bases de outras abas/planilhas
    configuredFootingGroups = [];

    // Auto-detecta pares de sapatas subsequentes apenas se forem montantes de torre (BT1+BT2, BA1+BA2...)
    const initialBases = data.sheets[activeSheetName]?.bases_list || data.sheets[activeSheetName]?.bases_names || [];
    const hasTowerLegs = initialBases.some(b => /^B[TA]\d+/i.test(b.trim()));
    if (hasTowerLegs) {
        autoGroupPairs(initialBases);
    } else {
        renderFootingGroups();
    }

    // Recalcula para a primeira aba
    recalculateCombinations();
}

/**
 * Disparado quando o usuário troca de aba
 */
function onSheetChange() {
    const sheetSelect = document.getElementById('sheet-select');
    activeSheetName = sheetSelect.value;
    if (currentWorkbookData && activeSheetName && currentWorkbookData.sheets[activeSheetName]) {
        initLoadRulesFromSheet(currentWorkbookData.sheets[activeSheetName]);
        configuredFootingGroups = [];
        const sBases = currentWorkbookData.sheets[activeSheetName].bases_list || currentWorkbookData.sheets[activeSheetName].bases_names || [];
        const hasTowerLegs = sBases.some(b => /^B[TA]\d+/i.test(b.trim()));
        if (hasTowerLegs) {
            autoGroupPairs(sBases);
        } else {
            renderFootingGroups();
        }
    }
    recalculateCombinations();
}

/**
 * Chama o motor do backend para calcular combinações e envoltórias
 */
async function recalculateCombinations() {
    if (!currentWorkbookData || !activeSheetName) return;

    const sheetData = currentWorkbookData.sheets[activeSheetName];
    if (!sheetData) return;

    const standard = document.getElementById('standard-select')?.value || 'NBR 8681';
    const method = document.getElementById('method-select')?.value || 'ELU_NORMAL';
    const statusText = document.getElementById('status-text');

    if (statusText) statusText.innerText = `Calculando combinações (${standard} • ${method}) para ${sheetData.bases_count} bases...`;

    const options = collectRulesAndCustomLoads();

    try {
        if (typeof eel !== 'undefined' && eel.mietc_calculate_combinations) {
            const res = await eel.mietc_calculate_combinations(sheetData, standard, method, options)();
            if (res.status === 'success') {
                currentResults = res.results;
                renderResults();
                if (statusText) statusText.innerText = `Cálculo concluído: ${currentResults.total_bases} bases processadas com sucesso na aba ${activeSheetName}.`;
            } else {
                showError('Erro no cálculo: ' + (res.error || 'Falha desconhecida.'));
            }
        }
    } catch (err) {
        showError('Erro ao executar combinações: ' + err.message);
    }
}

/**
 * Renderiza todos os componentes da interface com os novos resultados
 */
function renderResults() {
    if (!currentResults) return;

    renderKPIs();
    if (activeTableView === 'similarity') {
        renderSimilarityView();
    } else {
        renderSummaryTableHead();
        renderSummaryTable();
    }
    renderSimilarityView(); // Atualiza contadores, KPIs e tabelas de similaridade em background
    renderRawLoads();
    updateFilterChips();
}

/**
 * Atualiza os Cards de KPIs globais
 */
function renderKPIs() {
    const kpi = currentResults.global_kpi || {};

    const elTotal = document.getElementById('kpi-total-bases');
    const elSheet = document.getElementById('kpi-active-sheet');
    const elVmax = document.getElementById('kpi-global-vmax');
    const elVmaxBase = document.getElementById('kpi-global-vmax-base');
    const elVmin = document.getElementById('kpi-global-vmin');
    const elVminBase = document.getElementById('kpi-global-vmin-base');
    const elHmax = document.getElementById('kpi-global-hmax');
    const elHmaxBase = document.getElementById('kpi-global-hmax-base');
    const metaBases = document.getElementById('meta-bases-count');

    if (elTotal) elTotal.innerText = currentResults.total_bases;
    if (elSheet) elSheet.innerText = `Aba ativa: ${activeSheetName}`;
    if (metaBases) metaBases.innerText = `${currentResults.total_bases} Bases`;

    if (elVmax) elVmax.innerText = `${formatNumber(kpi.V_max)} kN`;
    if (elVmaxBase) elVmaxBase.innerText = `Base Governante: ${kpi.V_max_base || '--'}`;

    if (elVmin) elVmin.innerText = `${formatNumber(kpi.V_min)} kN`;
    if (elVminBase) elVminBase.innerText = `Base Governante: ${kpi.V_min_base || '--'}`;

    if (elHmax) elHmax.innerText = `${formatNumber(kpi.H_max)} kN`;
    if (elHmaxBase) elHmaxBase.innerText = `Base Governante: ${kpi.H_max_base || '--'}`;
}

/**
 * Alterna entre a visualização de Todas as 6 Envoltórias ou foco em uma específica
 */
function setEnvelopeView(view) {
    currentEnvelopeView = view;

    const buttons = document.querySelectorAll('.env-tab-btn');
    buttons.forEach(btn => {
        if (btn.id === `env-btn-${view}`) {
            btn.className = 'env-tab-btn active px-2.5 py-1 rounded-lg font-bold bg-emerald-600 text-white shadow-xs cursor-pointer';
        } else {
            btn.className = 'env-tab-btn px-2.5 py-1 rounded-lg font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer';
        }
    });

    renderSummaryTableHead();
    renderSummaryTable();
}

/**
 * Renderiza o cabeçalho dinâmico da Tabela Resumo de Envoltórias
 */
/**
 * Renderiza o cabeçalho dinâmico da Tabela Resumo de Envoltórias
 */
function renderSummaryTableHead() {
    setTimeout(() => { const th = document.getElementById('summary-table-head'); if (th && window.renderLatex) window.renderLatex(th); }, 50);
    const thead = document.getElementById('summary-table-head');
    if (!thead) return;

    const baseColTitle = (activeTableView === 'combined') ? 'Sapata (Conjunto)' : 'Base';

    if (currentEnvelopeView === 'all') {
        thead.innerHTML = `
            <tr class="bg-gray-100 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-[11px]">
                <th rowspan="2" class="py-2.5 px-3 text-center border-r border-gray-200 dark:border-gray-700">${baseColTitle}</th>
                <th colspan="5" class="py-1.5 px-2 text-center bg-gray-200/70 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200 font-extrabold">1. Picos Globais (kN, kNm)</th>
                <th colspan="6" class="py-1.5 px-2 text-center bg-blue-50 dark:bg-blue-950/40 border-r border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 font-extrabold">2. $V_{\max}$ & Concomitantes</th>
                <th colspan="6" class="py-1.5 px-2 text-center bg-amber-50 dark:bg-amber-950/40 border-r border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-300 font-extrabold">3. $V_{\min}$ & Concomitantes</th>
                <th colspan="6" class="py-1.5 px-2 text-center bg-emerald-50 dark:bg-emerald-950/40 border-r border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-extrabold">4. $X_{\max}$ & Concomitantes</th>
                <th colspan="6" class="py-1.5 px-2 text-center bg-indigo-50 dark:bg-indigo-950/40 border-r border-indigo-200 dark:border-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-extrabold">5. $Y_{\max}$ & Concomitantes</th>
                <th colspan="6" class="py-1.5 px-2 text-center bg-purple-50 dark:bg-purple-950/40 border-r border-purple-200 dark:border-purple-900/40 text-purple-700 dark:text-purple-300 font-extrabold">6. $H_{\max}$ & Concomitantes</th>
                <th rowspan="2" class="py-2.5 px-3 text-center">Ações</th>
            </tr>
            <tr class="text-[10px] text-gray-500 dark:text-gray-400">
                <!-- 1. Picos -->
                <th class="py-1.5 px-2 text-right">$V_{\text{pico}}$</th>
                <th class="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400">$|M|_{\text{pico}}$</th>
                <th class="py-1.5 px-2 text-right">$|X|_{\text{pico}}$</th>
                <th class="py-1.5 px-2 text-right">$|Y|_{\text{pico}}$</th>
                <th class="py-1.5 px-2 text-right border-r border-gray-200 dark:border-gray-700">$H_{\text{pico}}$</th>
                <!-- 2. V_max -->
                <th class="py-1.5 px-2 text-right font-bold text-blue-600 dark:text-blue-400">$V_{\max}$</th>
                <th class="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$X_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$Y_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$H_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-left border-r border-blue-200 dark:border-blue-900/40">Combinação</th>
                <!-- 3. V_min -->
                <th class="py-1.5 px-2 text-right font-bold text-amber-600 dark:text-amber-400">$V_{\min}$</th>
                <th class="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$X_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$Y_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$H_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-left border-r border-amber-200 dark:border-amber-900/40">Combinação</th>
                <!-- 4. X_max -->
                <th class="py-1.5 px-2 text-right font-bold text-emerald-600 dark:text-emerald-400">$|X|_{\max}$</th>
                <th class="py-1.5 px-2 text-right">$V_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$Y_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$H_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-left border-r border-emerald-200 dark:border-emerald-900/40">Combinação</th>
                <!-- 5. Y_max -->
                <th class="py-1.5 px-2 text-right font-bold text-indigo-600 dark:text-indigo-400">$|Y|_{\max}$</th>
                <th class="py-1.5 px-2 text-right">$V_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$X_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$H_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-left border-r border-indigo-200 dark:border-indigo-900/40">Combinação</th>
                <!-- 6. H_max -->
                <th class="py-1.5 px-2 text-right font-bold text-purple-600 dark:text-purple-400">$H_{\max}$</th>
                <th class="py-1.5 px-2 text-right">$V_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$X_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-right">$Y_{\text{conc}}$</th>
                <th class="py-1.5 px-2 text-left border-r border-purple-200 dark:border-purple-900/40">Combinação</th>
            </tr>
        `;
    } else if (currentEnvelopeView === 'peaks') {
        thead.innerHTML = `
            <tr>
                <th class="py-3 px-3 text-center w-28">${baseColTitle}</th>
                <th class="py-3 px-4 text-right text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20">1. $V_{\max,\text{pico}}$ (kN)</th>
                <th class="py-3 px-4 text-right text-amber-600 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20">1. $|M|_{\max,\text{pico}}$ (kNm)</th>
                <th class="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">1. $|X|_{\max,\text{pico}}$ (kN)</th>
                <th class="py-3 px-4 text-right text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20">1. $|Y|_{\max,\text{pico}}$ (kN)</th>
                <th class="py-3 px-4 text-right text-purple-600 dark:text-purple-400 bg-purple-50/40 dark:bg-purple-950/20">1. $H_{\text{res},\max}$ (kN)</th>
                <th class="py-3 px-3 text-center">Detalhar</th>
            </tr>
        `;
    } else if (currentEnvelopeView === 'vmax') {
        thead.innerHTML = `
            <tr>
                <th class="py-3 px-3 text-center w-28">${baseColTitle}</th>
                <th class="py-3 px-4 text-right text-blue-600 dark:text-blue-400 bg-blue-50/40 dark:bg-blue-950/20 font-bold">2. $V_{\max}$ (kN)</th>
                <th class="py-3 px-3 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$ (kNm)</th>
                <th class="py-3 px-3 text-right">$X_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right">$Y_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right text-purple-600 dark:text-purple-400">$H_{\text{res}}$ (kN)</th>
                <th class="py-3 px-4 text-left">Combinação Crítica Governante</th>
                <th class="py-3 px-3 text-center">Detalhar</th>
            </tr>
        `;
    } else if (currentEnvelopeView === 'vmin') {
        thead.innerHTML = `
            <tr>
                <th class="py-3 px-3 text-center w-28">${baseColTitle}</th>
                <th class="py-3 px-4 text-right text-amber-600 dark:text-amber-400 bg-amber-50/40 dark:bg-amber-950/20 font-bold">3. $V_{\min}$ / Alívio (kN)</th>
                <th class="py-3 px-3 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$ (kNm)</th>
                <th class="py-3 px-3 text-right">$X_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right">$Y_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right text-purple-600 dark:text-purple-400">$H_{\text{res}}$ (kN)</th>
                <th class="py-3 px-4 text-left">Combinação Crítica Governante</th>
                <th class="py-3 px-3 text-center">Detalhar</th>
            </tr>
        `;
    } else if (currentEnvelopeView === 'xmax') {
        thead.innerHTML = `
            <tr>
                <th class="py-3 px-3 text-center w-28">${baseColTitle}</th>
                <th class="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20 font-bold">4. $|X|_{\max}$ (kN)</th>
                <th class="py-3 px-3 text-right text-blue-600 dark:text-blue-400">$V_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$ (kNm)</th>
                <th class="py-3 px-3 text-right">$Y_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right text-purple-600 dark:text-purple-400">$H_{\text{res}}$ (kN)</th>
                <th class="py-3 px-4 text-left">Combinação Crítica Governante</th>
                <th class="py-3 px-3 text-center">Detalhar</th>
            </tr>
        `;
    } else if (currentEnvelopeView === 'ymax') {
        thead.innerHTML = `
            <tr>
                <th class="py-3 px-3 text-center w-28">${baseColTitle}</th>
                <th class="py-3 px-4 text-right text-indigo-600 dark:text-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20 font-bold">5. $|Y|_{\max}$ (kN)</th>
                <th class="py-3 px-3 text-right text-blue-600 dark:text-blue-400">$V_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$ (kNm)</th>
                <th class="py-3 px-3 text-right">$X_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right text-purple-600 dark:text-purple-400">$H_{\text{res}}$ (kN)</th>
                <th class="py-3 px-4 text-left">Combinação Crítica Governante</th>
                <th class="py-3 px-3 text-center">Detalhar</th>
            </tr>
        `;
    } else if (currentEnvelopeView === 'hmax') {
        thead.innerHTML = `
            <tr>
                <th class="py-3 px-3 text-center w-28">${baseColTitle}</th>
                <th class="py-3 px-4 text-right text-purple-600 dark:text-purple-400 bg-purple-50/40 dark:bg-purple-950/20 font-bold">6. $H_{\text{res},\max}$ (kN)</th>
                <th class="py-3 px-3 text-right text-blue-600 dark:text-blue-400">$V_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right text-amber-600 dark:text-amber-400">$M_{\text{conc}}$ (kNm)</th>
                <th class="py-3 px-3 text-right">$X_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-3 text-right">$Y_{\text{conc}}$ (kN)</th>
                <th class="py-3 px-4 text-left">Combinação Crítica Governante</th>
                <th class="py-3 px-3 text-center">Detalhar</th>
            </tr>
        `;
    }
}

/**
 * Renderiza a Tabela Resumo de Envoltórias de todas as bases ou sapatas conjuntas
 */
function renderSummaryTable() {
    const tbody = document.getElementById('summary-table-body');
    const rowCountBadge = document.getElementById('table-row-count-badge');
    if (!tbody || !currentResults) return;

    let items = [];
    if (activeTableView === 'combined') {
        items = [...((currentResults.combined_footings && currentResults.combined_footings.summary_table) || [])];
    } else {
        items = [...(currentResults.summary_table || [])];
    }

    // Aplica busca por texto
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        items = items.filter(it => it.base.toLowerCase().includes(q));
    }

    // Aplica filtro por prefixo de chip (ex: BT, BA, BM, BC) apenas no modo individual
    if (activeFilterPrefix && activeTableView === 'individual') {
        items = items.filter(it => it.base.toUpperCase().startsWith(activeFilterPrefix.toUpperCase()));
    }

    // Aplica ordenação
    items.sort((a, b) => {
        if (currentSort === 'name_asc') return a.base.localeCompare(b.base, undefined, { numeric: true });
        if (currentSort === 'vmax_desc') return b.V_max - a.V_max;
        if (currentSort === 'vmin_asc') return a.V_min - b.V_min;
        if (currentSort === 'hmax_desc') return b.H_max - a.H_max;
        return 0;
    });

    if (rowCountBadge) {
        if (activeTableView === 'combined') {
            rowCountBadge.innerText = `${items.length} sapatas conjuntas`;
        } else {
            rowCountBadge.innerText = `${items.length} de ${currentResults.total_bases} bases`;
        }
    }

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="32" class="py-8 text-center text-gray-400 italic">
                    ${activeTableView === 'combined'
                        ? 'Nenhuma sapata conjunta configurada. Clique em "⚡ Auto-Agrupar Pares (BT1+BT2...)" no painel acima para gerar as sapatas automaticamente.'
                        : 'Nenhuma base encontrada para os filtros selecionados.'}
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    items.forEach((it, idx) => {
        const bgRow = idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/60 dark:bg-gray-800/50';
        const vMinHighlight = it.V_min < 0 
            ? 'text-rose-600 dark:text-rose-400 font-extrabold bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded' 
            : 'text-amber-600 dark:text-amber-400 font-bold';

        const baseColHtml = it.is_combined ? `
            <div class="flex flex-col items-center justify-center">
                <span class="inline-block bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 px-2 py-0.5 rounded text-xs mono-num font-extrabold">
                    🏛️ ${it.base}
                </span>
                <span class="text-[10px] text-gray-500 font-bold mt-0.5">${(it.member_bases || []).join(' + ')}</span>
            </div>
        ` : `
            <span class="inline-block bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs mono-num font-extrabold">
                ${it.base}
            </span>
        `;

        const actionBtnHtml = it.is_combined ? `
            <button type="button" onclick="openFootingDecompositionModal('${it.base}')" class="bg-indigo-50 hover:bg-indigo-600 hover:text-white dark:bg-indigo-950/60 dark:hover:bg-indigo-600 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold py-1 px-2.5 rounded-lg transition-all shadow-2xs cursor-pointer flex items-center gap-1 mx-auto" title="Ver parcelas e esforços de cada montante nesta sapata">
                <span>🔍</span> Decomp.
            </button>
        ` : `
            <button type="button" onclick="openBaseDetailModal('${it.base}')" class="bg-gray-100 hover:bg-emerald-600 hover:text-white dark:bg-gray-700 dark:hover:bg-emerald-600 text-gray-700 dark:text-gray-200 text-[11px] font-bold py-1 px-2.5 rounded-lg transition-all shadow-2xs cursor-pointer">
                🔍 Ver
            </button>
        `;

        if (currentEnvelopeView === 'all') {
            html += `
                <tr class="${bgRow} hover:bg-emerald-50/50 dark:hover:bg-emerald-950/30 transition-colors">
                    <!-- Base -->
                    <td class="py-2.5 px-3 text-center font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700/60">
                        ${baseColHtml}
                    </td>

                    <!-- 1. Picos Globais -->
                    <td class="py-2 px-2 text-right mono-num font-semibold text-gray-800 dark:text-gray-200">${formatNumber(it.peak_V ?? it.V_max)}</td>
                    <td class="py-2 px-2 text-right mono-num font-semibold text-amber-600 dark:text-amber-400">${formatNumber(it.peak_M ?? it.M_max)}</td>
                    <td class="py-2 px-2 text-right mono-num font-semibold text-gray-800 dark:text-gray-200">${formatNumber(it.peak_X ?? it.X_max)}</td>
                    <td class="py-2 px-2 text-right mono-num font-semibold text-gray-800 dark:text-gray-200">${formatNumber(it.peak_Y ?? it.Y_max)}</td>
                    <td class="py-2 px-2 text-right mono-num font-semibold text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700/60">${formatNumber(it.peak_H ?? it.H_max)}</td>

                    <!-- 2. $V_{\max}$ & Concomitantes -->
                    <td class="py-2 px-2 text-right mono-num font-bold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/10">${formatNumber(it.V_max)}</td>
                    <td class="py-2 px-2 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.V_max_M)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_max_X)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_max_Y)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_max_H)}</td>
                    <td class="py-2 px-2 text-left text-gray-700 dark:text-gray-200 truncate max-w-[160px] font-mono text-[11px] border-r border-blue-200 dark:border-blue-900/40" title="${it.V_max_comb || ''} &#10;Fórmula: ${it.V_max_formula || ''}">${it.V_max_formula || it.V_max_comb || '--'}</td>

                    <!-- 3. $V_{\min}$ & Concomitantes -->
                    <td class="py-2 px-2 text-right mono-num font-bold bg-amber-50/30 dark:bg-amber-950/10"><span class="${vMinHighlight}">${formatNumber(it.V_min)}</span></td>
                    <td class="py-2 px-2 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.V_min_M)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_min_X)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_min_Y)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_min_H)}</td>
                    <td class="py-2 px-2 text-left text-gray-700 dark:text-gray-200 truncate max-w-[160px] font-mono text-[11px] border-r border-amber-200 dark:border-amber-900/40" title="${it.V_min_comb || ''} &#10;Fórmula: ${it.V_min_formula || ''}">${it.V_min_formula || it.V_min_comb || '--'}</td>

                    <!-- 4. $X_{\max}$ & Concomitantes -->
                    <td class="py-2 px-2 text-right mono-num font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10">${formatNumber(it.X_max)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.X_max_V)}</td>
                    <td class="py-2 px-2 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.X_max_M)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.X_max_Y)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.X_max_H)}</td>
                    <td class="py-2 px-2 text-left text-gray-700 dark:text-gray-200 truncate max-w-[160px] font-mono text-[11px] border-r border-emerald-200 dark:border-emerald-900/40" title="${it.X_max_comb || ''} &#10;Fórmula: ${it.X_max_formula || ''}">${it.X_max_formula || it.X_max_comb || '--'}</td>

                    <!-- 5. $Y_{\max}$ & Concomitantes -->
                    <td class="py-2 px-2 text-right mono-num font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10">${formatNumber(it.Y_max)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.Y_max_V)}</td>
                    <td class="py-2 px-2 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.Y_max_M)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.Y_max_X)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.Y_max_H)}</td>
                    <td class="py-2 px-2 text-left text-gray-700 dark:text-gray-200 truncate max-w-[160px] font-mono text-[11px] border-r border-indigo-200 dark:border-indigo-900/40" title="${it.Y_max_comb || ''} &#10;Fórmula: ${it.Y_max_formula || ''}">${it.Y_max_formula || it.Y_max_comb || '--'}</td>

                    <!-- 6. $H_{\max}$ & Concomitantes -->
                    <td class="py-2 px-2 text-right mono-num font-bold text-purple-600 dark:text-purple-400 bg-purple-50/30 dark:bg-purple-950/10">${formatNumber(it.H_max)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.H_max_V)}</td>
                    <td class="py-2 px-2 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.H_max_M)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.H_max_X)}</td>
                    <td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.H_max_Y)}</td>
                    <td class="py-2 px-2 text-left text-gray-700 dark:text-gray-200 truncate max-w-[160px] font-mono text-[11px] border-r border-purple-200 dark:border-purple-900/40" title="${it.H_max_comb || ''} &#10;Fórmula: ${it.H_max_formula || ''}">${it.H_max_formula || it.H_max_comb || '--'}</td>

                    <!-- Detalhar -->
                    <td class="py-2.5 px-3 text-center">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        } else if (currentEnvelopeView === 'peaks') {
            html += `
                <tr class="${bgRow} hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                    <td class="py-2.5 px-3 text-center font-bold text-gray-900 dark:text-white">
                        ${baseColHtml}
                    </td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/10">${formatNumber(it.peak_V ?? it.V_max)}</td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-950/10">${formatNumber(it.peak_M ?? it.M_max)}</td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10">${formatNumber(it.peak_X ?? it.X_max)}</td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10">${formatNumber(it.peak_Y ?? it.Y_max)}</td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-purple-600 dark:text-purple-400 bg-purple-50/30 dark:bg-purple-950/10">${formatNumber(it.peak_H ?? it.H_max)}</td>
                    <td class="py-2.5 px-3 text-center">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        } else if (currentEnvelopeView === 'vmax') {
            html += `
                <tr class="${bgRow} hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                    <td class="py-2.5 px-3 text-center font-bold text-gray-900 dark:text-white">
                        ${baseColHtml}
                    </td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/10">${formatNumber(it.V_max)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.V_max_M)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_max_X)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_max_Y)}</td>
                    <td class="py-2.5 px-3 text-right mono-num font-bold text-purple-600 dark:text-purple-400">${formatNumber(it.V_max_H)}</td>
                    <td class="py-2.5 px-4 text-left">
                        <div class="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-sm" title="${it.V_max_formula || ''}">${it.V_max_formula || it.V_max_comb || '--'}</div>
                        <div class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-sm" title="${it.V_max_comb || ''}">${it.V_max_comb || ''}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        } else if (currentEnvelopeView === 'vmin') {
            html += `
                <tr class="${bgRow} hover:bg-amber-50/40 dark:hover:bg-amber-950/20 transition-colors">
                    <td class="py-2.5 px-3 text-center font-bold text-gray-900 dark:text-white">
                        ${baseColHtml}
                    </td>
                    <td class="py-2.5 px-4 text-right mono-num bg-amber-50/30 dark:bg-amber-950/10"><span class="${vMinHighlight}">${formatNumber(it.V_min)}</span></td>
                    <td class="py-2.5 px-3 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.V_min_M)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_min_X)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.V_min_Y)}</td>
                    <td class="py-2.5 px-3 text-right mono-num font-bold text-purple-600 dark:text-purple-400">${formatNumber(it.V_min_H)}</td>
                    <td class="py-2.5 px-4 text-left">
                        <div class="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-sm" title="${it.V_min_formula || ''}">
                            ${it.V_min_formula || it.V_min_comb || '--'}
                            ${(it.V_min_comb && it.V_min_comb.includes('Zerada')) ? '<span class="ml-1 text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold px-1.5 py-0.2 rounded">Alívio Crítico</span>' : ''}
                        </div>
                        <div class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-sm" title="${it.V_min_comb || ''}">${it.V_min_comb || ''}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        } else if (currentEnvelopeView === 'xmax') {
            html += `
                <tr class="${bgRow} hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors">
                    <td class="py-2.5 px-3 text-center font-bold text-gray-900 dark:text-white">
                        ${baseColHtml}
                    </td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/30 dark:bg-emerald-950/10">${formatNumber(it.X_max)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-blue-600 dark:text-blue-400">${formatNumber(it.X_max_V)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.X_max_M)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.X_max_Y)}</td>
                    <td class="py-2.5 px-3 text-right mono-num font-bold text-purple-600 dark:text-purple-400">${formatNumber(it.X_max_H)}</td>
                    <td class="py-2.5 px-4 text-left">
                        <div class="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-sm" title="${it.X_max_formula || ''}">${it.X_max_formula || it.X_max_comb || '--'}</div>
                        <div class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-sm" title="${it.X_max_comb || ''}">${it.X_max_comb || ''}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        } else if (currentEnvelopeView === 'ymax') {
            html += `
                <tr class="${bgRow} hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors">
                    <td class="py-2.5 px-3 text-center font-bold text-gray-900 dark:text-white">
                        ${baseColHtml}
                    </td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/30 dark:bg-indigo-950/10">${formatNumber(it.Y_max)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-blue-600 dark:text-blue-400">${formatNumber(it.Y_max_V)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.Y_max_M)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.Y_max_X)}</td>
                    <td class="py-2.5 px-3 text-right mono-num font-bold text-purple-600 dark:text-purple-400">${formatNumber(it.Y_max_H)}</td>
                    <td class="py-2.5 px-4 text-left">
                        <div class="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-sm" title="${it.Y_max_formula || ''}">${it.Y_max_formula || it.Y_max_comb || '--'}</div>
                        <div class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-sm" title="${it.Y_max_comb || ''}">${it.Y_max_comb || ''}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        } else if (currentEnvelopeView === 'hmax') {
            html += `
                <tr class="${bgRow} hover:bg-purple-50/40 dark:hover:bg-purple-950/20 transition-colors">
                    <td class="py-2.5 px-3 text-center font-bold text-gray-900 dark:text-white">
                        ${baseColHtml}
                    </td>
                    <td class="py-2.5 px-4 text-right mono-num font-bold text-purple-600 dark:text-purple-400 bg-purple-50/30 dark:bg-purple-950/10">${formatNumber(it.H_max)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-blue-600 dark:text-blue-400">${formatNumber(it.H_max_V)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-amber-600 dark:text-amber-400">${formatNumber(it.H_max_M)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.H_max_X)}</td>
                    <td class="py-2.5 px-3 text-right mono-num text-gray-600 dark:text-gray-400">${formatNumber(it.H_max_Y)}</td>
                    <td class="py-2.5 px-4 text-left">
                        <div class="font-mono text-xs font-semibold text-gray-800 dark:text-gray-200 truncate max-w-sm" title="${it.H_max_formula || ''}">${it.H_max_formula || it.H_max_comb || '--'}</div>
                        <div class="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-sm" title="${it.H_max_comb || ''}">${it.H_max_comb || ''}</div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        ${actionBtnHtml}
                    </td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = html;
    if (window.renderLatex) window.renderLatex(tbody);
}

/**
 * Alterna a visualização entre Bases Individuais, Sapatas Conjuntas e Similaridade / Tipificação
 */
function setMainTableView(view) {
    activeTableView = view;
    const btnIndiv = document.getElementById('tab-view-individual');
    const btnComb = document.getElementById('tab-view-combined');
    const btnSim = document.getElementById('tab-view-similarity');
    const title = document.getElementById('table-main-title');
    const subtitle = document.getElementById('table-subtitle');
    const stdContainer = document.getElementById('standard-table-container');
    const simContainer = document.getElementById('similarity-view-container');

    // Reset de estilos padrão nos botões de aba
    [btnIndiv, btnComb, btnSim].forEach(btn => {
        if (btn) {
            btn.className = 'px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer flex items-center gap-1.5';
        }
    });

    if (view === 'individual') {
        if (btnIndiv) btnIndiv.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-xs cursor-pointer';
        if (title) title.innerHTML = `<span>📋</span> Envoltórias por Base Individual (kN)`;
        if (subtitle) subtitle.innerText = 'Cargas máximas e mínimas para cada montante individual com esforços concomitantes.';
        if (stdContainer) stdContainer.classList.remove('hidden');
        if (simContainer) simContainer.classList.add('hidden');
        renderSummaryTableHead();
        renderSummaryTable();
    } else if (view === 'combined') {
        if (btnComb) btnComb.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition-all bg-indigo-600 text-white shadow-xs cursor-pointer flex items-center gap-1.5';
        if (title) title.innerHTML = `<span>🏛️</span> Envoltórias de Sapatas Conjuntas (kN)`;
        if (subtitle) subtitle.innerText = 'Cargas simultâneas somadas das bases que compõem a mesma sapata (ex: BT1 + BT2) por combinação normativa.';
        if (stdContainer) stdContainer.classList.remove('hidden');
        if (simContainer) simContainer.classList.add('hidden');
        renderSummaryTableHead();
        renderSummaryTable();
    } else if (view === 'similarity') {
        if (btnSim) btnSim.className = 'px-3 py-1.5 text-xs font-bold rounded-lg transition-all bg-purple-600 text-white shadow-xs cursor-pointer flex items-center gap-1.5';
        if (title) title.innerHTML = `<span>🎯</span> Similaridade & Tipificação para Dimensionamento (kN)`;
        if (subtitle) subtitle.innerText = 'Agrupamento inteligente de bases em famílias típicas por envoltória governante para otimização de fôrmas e armaduras.';
        if (stdContainer) stdContainer.classList.add('hidden');
        if (simContainer) simContainer.classList.remove('hidden');
        renderSimilarityView();
    }
}

/**
 * Disparado pelo slider de tolerância de similaridade
 */
function onSimilarityToleranceChange(val) {
    similarityTolerance = parseFloat(val) / 100.0;
    updateToleranceButtons();
    triggerSimilarityClustering();
}

/**
 * Define tolerância rápida (10%, 20%, 30%)
 */
function setSimilarityTolerance(percent) {
    const range = document.getElementById('similarity-tolerance-range');
    const valText = document.getElementById('sim-tol-val');
    if (range) range.value = percent;
    if (valText) valText.innerText = percent + '%';
    similarityTolerance = percent / 100.0;
    updateToleranceButtons();
    triggerSimilarityClustering();
}

/**
 * Atualiza visual dos botões de tolerância rápida
 */
function updateToleranceButtons() {
    const currPct = Math.round(similarityTolerance * 100);
    document.querySelectorAll('.sim-tol-btn').forEach(btn => {
        const text = btn.innerText;
        if (text.includes(currPct + '%')) {
            btn.className = 'sim-tol-btn active px-2.5 py-1 rounded-lg font-bold bg-purple-600 text-white shadow-2xs cursor-pointer';
        } else {
            btn.className = 'sim-tol-btn px-2.5 py-1 rounded-lg font-semibold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-400 text-gray-700 dark:text-gray-300 transition-all cursor-pointer';
        }
    });
}

/**
 * Re-agrupa as bases por similaridade chamando o backend Eel de forma reativa instantânea
 */
async function triggerSimilarityClustering() {
    if (!currentResults || !currentResults.summary_items) return;
    try {
        if (typeof eel !== 'undefined' && eel.mietc_cluster_by_similarity) {
            const res = await eel.mietc_cluster_by_similarity(currentResults.summary_items, similarityTolerance)();
            if (res.status === 'success') {
                currentResults.similarity_clustering = res.data;
                renderSimilarityView();
            }
        }
    } catch (err) {
        console.error('Erro ao agrupar por similaridade:', err);
    }
}

/**
 * Renderiza o painel completo de Similaridade e Tipificação (KPIs, Tabela 1 e Tabela 2)
 */
function renderSimilarityView() {
    if (!currentResults) return;
    const simData = currentResults.similarity_clustering;
    const badgeCount = document.getElementById('similarity-badge-count');
    if (!simData) {
        if (badgeCount) badgeCount.innerText = '0';
        return;
    }

    if (badgeCount) badgeCount.innerText = simData.total_families || 0;

    // Mini KPIs
    const elTot = document.getElementById('sim-kpi-total-families');
    const elRed = document.getElementById('sim-kpi-reduction');
    const elTens = document.getElementById('sim-kpi-tension-families');
    const elComp = document.getElementById('sim-kpi-compression-families');

    if (elTot) elTot.innerText = simData.total_families;
    if (elTens) elTens.innerText = simData.tension_families;
    if (elComp) elComp.innerText = simData.compression_families;
    if (elRed) {
        const totalBases = currentResults.total_bases || 1;
        const redPct = Math.round((1.0 - simData.total_families / totalBases) * 100);
        elRed.innerText = `${redPct}% de redução em tipos`;
    }

    // Tabela 1: Síntese das Famílias Típicas e Envoltórias Governantes
    const famBody = document.getElementById('similarity-families-body');
    if (famBody) {
        let famHtml = '';
        (simData.families || []).forEach(f => {
            const isTension = f.mode === 'TRAÇÃO';
            const badgeTypeCls = isTension
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border-amber-300'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border-blue-300';
            const govLoads = f.governing_loads || {};
            const combVmax = govLoads.comb_V_max || '--';
            const combVmin = govLoads.comb_V_min || '--';
            const combHmax = govLoads.comb_H_max || '--';

            // Lista de pílulas das bases integrantes
            const basesPills = (f.bases || []).map(b => {
                const isGov = b === f.governing_base;
                const cls = isGov
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300';
                return `<span class="inline-block px-1.5 py-0.5 rounded text-[10px] ${cls}">${isGov ? '★ ' : ''}${b}</span>`;
            }).join(' ');

            famHtml += `
                <tr class="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                    <td class="py-2.5 px-3">
                        <div class="flex items-center gap-1.5">
                            <span class="px-2 py-0.5 rounded-lg text-xs font-extrabold border ${badgeTypeCls}">${f.family_id}</span>
                            <span class="text-[10px] text-gray-400 uppercase font-semibold">(${f.mode})</span>
                        </div>
                    </td>
                    <td class="py-2.5 px-2 text-center font-bold text-gray-800 dark:text-gray-200">${f.bases_count}</td>
                    <td class="py-2.5 px-3 max-w-xs">
                        <div class="flex flex-wrap gap-1 items-center max-h-20 overflow-y-auto custom-scrollbar">
                            ${basesPills}
                        </div>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <span class="font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg text-xs border border-emerald-200 dark:border-emerald-800">
                            ★ ${f.governing_base}
                        </span>
                    </td>
                    <td class="py-2.5 px-3 text-right">
                        <span class="font-bold text-blue-600 dark:text-blue-400 block">${formatNumber(govLoads.V_max)}</span>
                        <span class="text-[9px] text-gray-400 block truncate max-w-[140px] ml-auto" title="${combVmax}">${combVmax}</span>
                    </td>
                    <td class="py-2.5 px-3 text-right">
                        <span class="font-bold text-amber-600 dark:text-amber-400 block">${formatNumber(govLoads.V_min)}</span>
                        <span class="text-[9px] text-gray-400 block truncate max-w-[140px] ml-auto" title="${combVmin}">${combVmin}</span>
                    </td>
                    <td class="py-2.5 px-3 text-right">
                        <span class="font-bold text-purple-600 dark:text-purple-400 block">${formatNumber(govLoads.H_max)}</span>
                        <span class="text-[9px] text-gray-400 block truncate max-w-[140px] ml-auto" title="${combHmax}">${combHmax}</span>
                    </td>
                    <td class="py-2.5 px-3 text-center">
                        <button type="button" onclick="openBaseDetailModal('${f.governing_base}')" class="text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-1 px-2.5 rounded-lg transition-all cursor-pointer" title="Ver todas as combinações da base governante">
                            🔍 Combinações
                        </button>
                    </td>
                </tr>
            `;
        });
        famBody.innerHTML = famHtml || `<tr><td colspan="8" class="py-8 text-center text-gray-400 italic">Nenhuma família gerada.</td></tr>`;
    }

    // Tabela 2: Relação Nominal de Todas as Bases com Taxa de Solicitação (%)
    const basesBody = document.getElementById('similarity-bases-body');
    if (basesBody) {
        let bHtml = '';
        (simData.families || []).forEach(f => {
            const isTension = f.mode === 'TRAÇÃO';
            const fBadge = isTension
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300';

            (f.members || []).forEach(m => {
                const isGov = m.is_governing;
                const ratio = m.max_ratio ?? 100.0;
                const condBadge = isGov
                    ? '<span class="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-extrabold px-2 py-0.5 rounded-full text-[10px] border border-emerald-300">★ GOVERNANTE</span>'
                    : '<span class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium px-2 py-0.5 rounded-full text-[10px]">Envelopada</span>';

                // Cor da barra de progresso baseada na taxa de utilização
                let barColor = 'bg-emerald-500';
                if (ratio < 70) barColor = 'bg-amber-500';
                if (ratio < 50) barColor = 'bg-blue-500';

                bHtml += `
                    <tr class="hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors ${isGov ? 'bg-emerald-50/30 dark:bg-emerald-950/20 font-bold' : ''}">
                        <td class="py-2 px-3 font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                            <span>${m.base}</span>
                        </td>
                        <td class="py-2 px-3">
                            <span class="px-2 py-0.5 rounded-md text-[11px] font-extrabold ${fBadge}">${f.family_id}</span>
                        </td>
                        <td class="py-2 px-3 text-center">${condBadge}</td>
                        <td class="py-2 px-3 text-right text-blue-600 dark:text-blue-400">${formatNumber(m.V_max)}</td>
                        <td class="py-2 px-3 text-right text-amber-600 dark:text-amber-400">${formatNumber(m.V_min)}</td>
                        <td class="py-2 px-3 text-right text-purple-600 dark:text-purple-400">${formatNumber(m.H_max)}</td>
                        <td class="py-2 px-3 text-center">
                            <div class="inline-flex items-center gap-2">
                                <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                    <div class="${barColor} h-2 rounded-full" style="width: ${Math.min(ratio, 100)}%"></div>
                                </div>
                                <span class="text-xs font-bold mono-num w-11 text-right ${isGov ? 'text-emerald-700 dark:text-emerald-400 font-extrabold' : 'text-gray-700 dark:text-gray-300'}">${ratio.toFixed(1)}%</span>
                            </div>
                        </td>
                    </tr>
                `;
            });
        });
        basesBody.innerHTML = bHtml || `<tr><td colspan="7" class="py-8 text-center text-gray-400 italic">Nenhum dado encontrado.</td></tr>`;
    }
}

/**
 * Adota as famílias de similaridade como grupos de Sapatas Conjuntas para cálculo simultâneo
 */
function applySimilarityAsFootingGroups() {
    if (!currentResults || !currentResults.similarity_clustering) {
        alert('Nenhum agrupamento por similaridade disponível no momento.');
        return;
    }

    const families = currentResults.similarity_clustering.families || [];
    if (families.length === 0) {
        alert('Nenhuma família identificada.');
        return;
    }

    // Configura sapatas conjuntas a partir das famílias que possuem 2 ou mais bases
    configuredFootingGroups = [];
    families.forEach(f => {
        if (f.bases && f.bases.length > 1) {
            configuredFootingGroups.push({
                name: `Sapata ${f.family_id}`,
                bases: [...f.bases]
            });
        }
    });

    renderFootingGroups();
    setMainTableView('combined');
    recalculateCombinations();

    alert(`Sucesso! ${configuredFootingGroups.length} sapatas conjuntas geradas a partir das famílias de bases similares.`);
}

/**
 * Botão no painel de sapatas conjuntas: Agrupar por Similaridade
 */
function autoGroupBySimilarityClick() {
    applySimilarityAsFootingGroups();
}

/**
 * Copia resumo das famílias para a área de transferência em formato TSV
 */
function copySimilarityTableToClipboard() {
    if (!currentResults || !currentResults.similarity_clustering) {
        alert('Nenhum dado de similaridade para copiar.');
        return;
    }

    const families = currentResults.similarity_clustering.families || [];
    let text = `TIPO\tMODO\tQTD_BASES\tBASES_INTEGRANTES\tBASE_GOVERNANTE\tV_MAX_KN\tV_MIN_KN\tH_RES_KN\tCOMB_VMAX\tCOMB_VMIN\tCOMB_HMAX\n`;
    families.forEach(f => {
        const gov = f.governing_loads || {};
        text += `${f.family_id}\t${f.mode}\t${f.bases_count}\t${f.bases.join(', ')}\t${f.governing_base}\t${gov.V_max}\t${gov.V_min}\t${gov.H_max}\t${gov.comb_V_max || ''}\t${gov.comb_V_min || ''}\t${gov.comb_H_max || ''}\n`;
    });

    navigator.clipboard.writeText(text).then(() => {
        alert('Resumo das Famílias Típicas copiado para a área de transferência!');
    }).catch(err => {
        alert('Erro ao copiar: ' + err.message);
    });
}


/**
 * Abre o modal de decomposição da sapata conjunta
 */
function openFootingDecompositionModal(footingName) {
    const modal = document.getElementById('footing-decomposition-modal');
    const titleEl = document.getElementById('modal-footing-name');
    const decompBody = document.getElementById('modal-footing-decomp-body');
    const combosBody = document.getElementById('modal-footing-combos-body');
    if (!modal || !currentResults) return;

    const cf = currentResults.combined_footings || {};
    const footingData = cf.footings_details?.[footingName];
    if (!footingData) return;

    if (titleEl) titleEl.innerText = footingName;

    // 1. Tabela de Decomposição das Envoltórias Governantes
    if (decompBody) {
        let decompHtml = '';
        const envs = footingData.envelopes || {};
        const cases = [
            { key: 'V_max', label: '2. V Máximo (Compressão Total)', color: 'text-blue-600 dark:text-blue-400' },
            { key: 'V_min', label: '3. V Mínimo (Alívio/Tração Total)', color: 'text-amber-600 dark:text-amber-400' },
            { key: 'X_max', label: '4. |X| Máximo (Cisalhamento X)', color: 'text-emerald-600 dark:text-emerald-400' },
            { key: 'Y_max', label: '5. |Y| Máximo (Cisalhamento Y)', color: 'text-indigo-600 dark:text-indigo-400' },
            { key: 'H_max', label: '6. H Resultante Máximo', color: 'text-purple-600 dark:text-purple-400' }
        ];

        cases.forEach(cDef => {
            const envObj = envs[cDef.key];
            if (!envObj) return;

            const combTitle = envObj.combination || '--';
            const bk = envObj.base_breakdown || {};
            const totV = (cDef.key === 'V_max' || cDef.key === 'V_min') ? envObj.value : (envObj.concomitant_V ?? 0.0);
            const totM = (cDef.key === 'M_max') ? envObj.value : (envObj.concomitant_M ?? 0.0);
            const totX = (cDef.key === 'X_max') ? envObj.value : (envObj.concomitant_X ?? 0.0);
            const totY = (cDef.key === 'Y_max') ? envObj.value : (envObj.concomitant_Y ?? 0.0);
            const totH = (cDef.key === 'H_max') ? envObj.value : (envObj.concomitant_H ?? 0.0);

            // Linha TOTAL SAPATA
            decompHtml += `
                <tr class="bg-indigo-50/70 dark:bg-indigo-950/40 border-t-2 border-indigo-200 dark:border-indigo-800 font-bold">
                    <td class="py-2 px-3 ${cDef.color}">${cDef.label}</td>
                    <td class="py-2 px-3 text-gray-900 dark:text-white uppercase font-extrabold">🏛️ TOTAL SAPATA</td>
                    <td class="py-2 px-3 text-gray-700 dark:text-gray-300 font-normal text-[11px] truncate max-w-xs" title="${combTitle}">${combTitle}</td>
                    <td class="py-2 px-3 text-right ${cDef.color}">${formatNumber(totV)}</td>
                    <td class="py-2 px-3 text-right text-amber-600 dark:text-amber-400 font-bold">${formatNumber(totM)}</td>
                    <td class="py-2 px-3 text-right">${formatNumber(totX)}</td>
                    <td class="py-2 px-3 text-right">${formatNumber(totY)}</td>
                    <td class="py-2 px-3 text-right text-purple-600 dark:text-purple-400">${formatNumber(totH)}</td>
                </tr>
            `;

            // Linhas de cada base integrante
            (footingData.member_bases || []).forEach(bName => {
                const bLoads = bk[bName] || { V: 0, M: 0, X: 0, Y: 0, H_res: 0 };
                decompHtml += `
                    <tr class="bg-white dark:bg-gray-800/80 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="py-1.5 px-3 text-gray-400 text-[11px] pl-6">↳ Parcela</td>
                        <td class="py-1.5 px-3 font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                            <span>${bName}</span>
                        </td>
                        <td class="py-1.5 px-3 text-gray-400 text-[11px] italic">(mesma combinação acima)</td>
                        <td class="py-1.5 px-3 text-right font-semibold text-blue-600 dark:text-blue-400">${formatNumber(bLoads.V)}</td>
                        <td class="py-1.5 px-3 text-right text-amber-600 dark:text-amber-400 font-semibold">${formatNumber(bLoads.M)}</td>
                        <td class="py-1.5 px-3 text-right">${formatNumber(bLoads.X)}</td>
                        <td class="py-1.5 px-3 text-right">${formatNumber(bLoads.Y)}</td>
                        <td class="py-1.5 px-3 text-right text-purple-600 dark:text-purple-400">${formatNumber(bLoads.H_res)}</td>
                    </tr>
                `;
            });
        });

        decompBody.innerHTML = decompHtml;
    }

    // 2. Tabela de Todas as Combinações da Sapata
    if (combosBody) {
        let combosHtml = '';
        (footingData.combinations || []).forEach((c, idx) => {
            const bgRow = idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/70 dark:bg-gray-900/40';
            const lsColor = c.limit_state === 'ELU' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300';
            combosHtml += `
                <tr class="${bgRow} hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30">
                    <td class="py-2 px-3"><span class="${lsColor} px-2 py-0.5 rounded text-[11px] font-bold">${c.limit_state}</span></td>
                    <td class="py-2 px-3 font-semibold text-gray-800 dark:text-gray-200">${c.title}</td>
                    <td class="py-2 px-3 text-gray-500 text-[11px] mono-num">${c.formula || '--'}</td>
                    <td class="py-2 px-3 text-right font-bold text-blue-600 dark:text-blue-400">${formatNumber(c.V)}</td>
                    <td class="py-2 px-3 text-right text-amber-600 dark:text-amber-400 font-semibold">${formatNumber(c.M)}</td>
                    <td class="py-2 px-3 text-right">${formatNumber(c.X)}</td>
                    <td class="py-2 px-3 text-right">${formatNumber(c.Y)}</td>
                    <td class="py-2 px-3 text-right font-bold text-purple-600 dark:text-purple-400">${formatNumber(c.H_res)}</td>
                </tr>
            `;
        });
        combosBody.innerHTML = combosHtml;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Fecha o modal de decomposição da sapata conjunta
 */
function closeFootingDecompositionModal() {
    const modal = document.getElementById('footing-decomposition-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Renderiza a visualização dos dados brutos carregados na planilha
 */
function renderRawLoads() {
    const headerRow = document.getElementById('raw-loads-header-row');
    const tbody = document.getElementById('raw-loads-body');
    if (!headerRow || !tbody || !currentWorkbookData || !activeSheetName) return;

    const sheetData = currentWorkbookData.sheets[activeSheetName];
    if (!sheetData) return;

    const basesList = sheetData.bases_list || [];
    const actions = sheetData.actions_catalog || [];
    const basesData = sheetData.bases_data || {};

    // Reconstrói o cabeçalho
    headerRow.innerHTML = `
        <th class="py-2.5 px-3 text-gray-700 dark:text-gray-300">Ação</th>
        <th class="py-2.5 px-2 text-center text-gray-700 dark:text-gray-300">Dir.</th>
    `;
    basesList.forEach(b => {
        const th = document.createElement('th');
        th.className = 'py-2.5 px-2 text-right mono-num text-gray-700 dark:text-gray-300 font-bold';
        th.innerText = b;
        headerRow.appendChild(th);
    });

    // Linhas
    let rowsHtml = '';
    actions.forEach((act, idx) => {
        const bgRow = idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/40';
        rowsHtml += `
            <tr class="${bgRow}">
                <td class="py-2 px-3 text-gray-800 dark:text-gray-200 font-medium">
                    <span class="font-bold">${act.item}</span> <span class="text-[10px] text-gray-400">(${act.group})</span>
                </td>
                <td class="py-2 px-2 text-center font-bold text-gray-600 dark:text-gray-400">${act.direction}</td>
        `;

        basesList.forEach(b => {
            const val = basesData[b]?.[act.item]?.[act.direction] ?? 0.0;
            const valFormatted = Number(val).toFixed(2);
            rowsHtml += `<td class="py-2 px-2 text-right mono-num text-gray-600 dark:text-gray-300">${valFormatted}</td>`;
        });

        rowsHtml += `</tr>`;
    });

    tbody.innerHTML = rowsHtml;
}

/**
 * Abre o Modal com todas as combinações analíticas da base selecionada
 */
function openBaseDetailModal(baseName) {
    if (!currentResults || !currentResults.bases_details) return;

    const bdata = currentResults.bases_details[baseName];
    if (!bdata) return;

    const modal = document.getElementById('base-detail-modal');
    const modalName = document.getElementById('modal-base-name');
    const modalSubtitle = document.getElementById('modal-base-subtitle');
    const tbody = document.getElementById('modal-combos-body');

    if (modalName) modalName.innerText = baseName;
    if (modalSubtitle) modalSubtitle.innerText = `${bdata.combinations_count} combinações calculadas para a base ${baseName} (${currentResults.standard} • ${currentResults.method})`;

    const env = bdata.envelopes || {};
    const peaks = env.peaks || {};

    // 1. Picos Globais
    const elPeakV = document.getElementById('m-peak-v');
    const elPeakM = document.getElementById('m-peak-m');
    const elPeakX = document.getElementById('m-peak-x');
    const elPeakY = document.getElementById('m-peak-y');
    const elPeakH = document.getElementById('m-peak-h');
    if (elPeakV) elPeakV.innerText = `${formatNumber(peaks.V_max ?? env.V_max?.value)} kN`;
    if (elPeakM) elPeakM.innerText = `${formatNumber(peaks.M_max ?? env.M_max?.value)} kNm`;
    if (elPeakX) elPeakX.innerText = `${formatNumber(peaks.X_max ?? env.X_max?.value)} kN`;
    if (elPeakY) elPeakY.innerText = `${formatNumber(peaks.Y_max ?? env.Y_max?.value)} kN`;
    if (elPeakH) elPeakH.innerText = `${formatNumber(peaks.H_max ?? env.H_max?.value)} kN`;

    // 2. V Máx e Concomitantes
    const elVmax = document.getElementById('modal-env-vmax');
    const elVmaxSub = document.getElementById('modal-env-vmax-sub');
    if (elVmax) elVmax.innerText = `${formatNumber(env.V_max?.value)} kN`;
    if (elVmaxSub) elVmaxSub.innerText = `M: ${formatNumber(env.V_max?.concomitant_M)} | X: ${formatNumber(env.V_max?.concomitant_X)} | Y: ${formatNumber(env.V_max?.concomitant_Y)} | H: ${formatNumber(env.V_max?.concomitant_H)}`;

    // 3. V Mín e Concomitantes
    const elVmin = document.getElementById('modal-env-vmin');
    const elVminSub = document.getElementById('modal-env-vmin-sub');
    if (elVmin) elVmin.innerText = `${formatNumber(env.V_min?.value)} kN`;
    if (elVminSub) elVminSub.innerText = `M: ${formatNumber(env.V_min?.concomitant_M)} | X: ${formatNumber(env.V_min?.concomitant_X)} | Y: ${formatNumber(env.V_min?.concomitant_Y)} | H: ${formatNumber(env.V_min?.concomitant_H)}`;

    // 4. X Máx e Concomitantes
    const elXmax = document.getElementById('modal-env-xmax');
    const elXmaxSub = document.getElementById('modal-env-xmax-sub');
    if (elXmax) elXmax.innerText = `${formatNumber(env.X_max?.value)} kN`;
    if (elXmaxSub) elXmaxSub.innerText = `V: ${formatNumber(env.X_max?.concomitant_V)} | M: ${formatNumber(env.X_max?.concomitant_M)} | Y: ${formatNumber(env.X_max?.concomitant_Y)} | H: ${formatNumber(env.X_max?.concomitant_H)}`;

    // 5. Y Máx e Concomitantes
    const elYmax = document.getElementById('modal-env-ymax');
    const elYmaxSub = document.getElementById('modal-env-ymax-sub');
    if (elYmax) elYmax.innerText = `${formatNumber(env.Y_max?.value)} kN`;
    if (elYmaxSub) elYmaxSub.innerText = `V: ${formatNumber(env.Y_max?.concomitant_V)} | M: ${formatNumber(env.Y_max?.concomitant_M)} | X: ${formatNumber(env.Y_max?.concomitant_X)} | H: ${formatNumber(env.Y_max?.concomitant_H)}`;

    // 6. H Máx e Concomitantes
    const elHmax = document.getElementById('modal-env-hmax');
    const elHmaxSub = document.getElementById('modal-env-hmax-sub');
    if (elHmax) elHmax.innerText = `${formatNumber(env.H_max?.value)} kN`;
    if (elHmaxSub) elHmaxSub.innerText = `V: ${formatNumber(env.H_max?.concomitant_V)} | M: ${formatNumber(env.H_max?.concomitant_M)} | X: ${formatNumber(env.H_max?.concomitant_X)} | Y: ${formatNumber(env.H_max?.concomitant_Y)}`;

    let html = '';
    const combos = bdata.combinations || [];

    combos.forEach((c, idx) => {
        const bg = idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-800/50';
        const isVmax = Math.abs(c.V - (env.V_max?.value || 0)) < 0.01;
        const isVmin = Math.abs(c.V - (env.V_min?.value || 0)) < 0.01;
        const isXmax = Math.abs(Math.abs(c.X) - (env.X_max?.value || 0)) < 0.01;
        const isYmax = Math.abs(Math.abs(c.Y) - (env.Y_max?.value || 0)) < 0.01;
        const isHmax = Math.abs(c.H_res - (env.H_max?.value || 0)) < 0.01;

        let badgeState = '';
        if (c.limit_state.includes('ELU')) badgeState = 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300';
        else if (c.limit_state.includes('Rara')) badgeState = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
        else badgeState = 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300';

        html += `
            <tr class="${bg} hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-colors">
                <td class="py-2.5 px-3">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeState}">
                        ${c.limit_state}
                    </span>
                </td>
                <td class="py-2.5 px-3 font-semibold text-gray-900 dark:text-white">
                    ${c.title}
                    ${(c.is_zeroed_variant || (c.title && c.title.includes('Zerada'))) ? '<span class="ml-1 text-[9px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold px-1.5 py-0.2 rounded" title="Cenário conservador com ação zerada para máxima tração/alívio">Alívio Crítico</span>' : ''}
                    ${isVmax ? '<span class="ml-1 text-[9px] bg-blue-600 text-white font-extrabold px-1.5 py-0.2 rounded">V Máx</span>' : ''}
                    ${isVmin ? '<span class="ml-1 text-[9px] bg-amber-600 text-white font-extrabold px-1.5 py-0.2 rounded">V Mín</span>' : ''}
                    ${isXmax ? '<span class="ml-1 text-[9px] bg-emerald-600 text-white font-extrabold px-1.5 py-0.2 rounded">X Máx</span>' : ''}
                    ${isYmax ? '<span class="ml-1 text-[9px] bg-indigo-600 text-white font-extrabold px-1.5 py-0.2 rounded">Y Máx</span>' : ''}
                    ${isHmax ? '<span class="ml-1 text-[9px] bg-purple-600 text-white font-extrabold px-1.5 py-0.2 rounded">H Máx</span>' : ''}
                </td>
                <td class="py-2.5 px-3 text-gray-600 dark:text-gray-400 mono-num text-[11px] truncate max-w-xs" title="${c.formula}">
                    ${c.formula}
                </td>
                <td class="py-2.5 px-3 text-right mono-num font-bold ${c.V >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'}">
                    ${formatNumber(c.V)}
                </td>
                <td class="py-2.5 px-3 text-right mono-num font-semibold text-amber-600 dark:text-amber-400">
                    ${formatNumber(c.M)}
                </td>
                <td class="py-2.5 px-3 text-right mono-num text-gray-700 dark:text-gray-300">
                    ${formatNumber(c.X)}
                </td>
                <td class="py-2.5 px-3 text-right mono-num text-gray-700 dark:text-gray-300">
                    ${formatNumber(c.Y)}
                </td>
                <td class="py-2.5 px-3 text-right mono-num font-bold text-purple-600 dark:text-purple-400">
                    ${formatNumber(c.H_res)}
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (window.renderLatex) window.renderLatex(tbody);
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

/**
 * Fecha o Modal de Detalhamento
 */
function closeBaseDetailModal() {
    const modal = document.getElementById('base-detail-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

/**
 * Filtro por texto na busca rápida
 */
function filterBasesTable() {
    const input = document.getElementById('base-search-input');
    searchQuery = input ? input.value.trim() : '';
    renderSummaryTable();
}

/**
 * Filtro rápido por chip (ex: 'BT', 'BA', 'BM', etc.)
 */
function setQuickFilter(prefix) {
    activeFilterPrefix = prefix;

    const chips = document.querySelectorAll('.chip-filter');
    chips.forEach(c => {
        const text = c.innerText.trim();
        if ((prefix === '' && text === 'Todas') || text === prefix) {
            c.className = 'chip-filter active px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white shadow-xs';
        } else {
            c.className = 'chip-filter px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-all';
        }
    });

    renderSummaryTable();
}

/**
 * Ordenação da Tabela
 */
function sortBasesTable() {
    const sel = document.getElementById('sort-select');
    currentSort = sel ? sel.value : 'name_asc';
    renderSummaryTable();
}

/**
 * Atualiza chips de filtro com base nos prefixos reais encontrados
 */
function updateFilterChips() {
    if (!currentResults || !currentResults.summary_table) return;

    const container = document.getElementById('quick-filter-chips');
    if (!container) return;

    const prefixes = new Set();
    currentResults.summary_table.forEach(it => {
        const match = it.base.match(/^[A-Za-z]+/);
        if (match) prefixes.add(match[0]);
    });

    const sortedPrefixes = Array.from(prefixes).sort();
    let html = `
        <button type="button" onclick="setQuickFilter('')" class="chip-filter ${activeFilterPrefix === '' ? 'active bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'} px-2.5 py-1 rounded-lg text-xs font-bold transition-all">Todas</button>
    `;

    sortedPrefixes.forEach(p => {
        const isActive = activeFilterPrefix === p;
        const cls = isActive ? 'active bg-emerald-600 text-white' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200';
        html += `
            <button type="button" onclick="setQuickFilter('${p}')" class="chip-filter ${cls} px-2.5 py-1 rounded-lg text-xs font-semibold transition-all">${p}</button>
        `;
    });

    container.innerHTML = html;
}

/**
 * Toggle do card colapsável de carregamentos brutos
 */
function toggleRawLoadsCard() {
    const content = document.getElementById('raw-loads-content');
    const icon = document.getElementById('raw-loads-toggle-icon');
    if (!content) return;

    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        if (icon) icon.innerText = 'Ocultar ▲';
    } else {
        content.classList.add('hidden');
        if (icon) icon.innerText = 'Mostrar ▼';
    }
}

/**
 * Exporta os resultados diretamente em Excel (.xlsx) com duas abas formatadas
 */
async function exportToExcel() {
    if (!currentResults) {
        alert('Nenhum resultado disponível para exportação.');
        return;
    }

    const fname = `Combinacoes_Bases_${activeSheetName}_${currentResults.standard.replace(/\s+/g, '_')}.xlsx`;
    try {
        if (typeof eel !== 'undefined' && eel.mietc_export_excel) {
            const res = await eel.mietc_export_excel(currentResults, fname)();
            if (res.status === 'success') {
                downloadBase64File(res.base64, res.filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            } else {
                alert('Erro ao exportar Excel: ' + (res.error || 'Falha desconhecida.'));
            }
        }
    } catch (err) {
        alert('Falha na geração do Excel: ' + err.message);
    }
}

/**
 * Exporta relatório resumido em Word (.doc)
 */
function exportToWord() {
    if (!currentResults) {
        alert('Nenhum resultado disponível para exportação.');
        return;
    }

    const isCombined = activeTableView === 'combined';
    const items = isCombined
        ? (currentResults.combined_footings?.summary_table || [])
        : (currentResults.summary_table || []);

    const reportTitle = isCombined
        ? 'Relatório Executivo de Envoltórias de Sapatas Conjuntas'
        : 'Relatório Executivo de Envoltórias de Cargas nas Bases';

    let docHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>${reportTitle}</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; }
                h1 { font-size: 16pt; color: #0f172a; margin-bottom: 4px; }
                h2 { font-size: 12pt; color: #334155; margin-top: 18px; margin-bottom: 8px; }
                .subtitle { font-size: 9pt; color: #64748b; margin-bottom: 16px; }
                table { border-collapse: collapse; width: 100%; margin-top: 10px; }
                th, td { border: 1px solid #cbd5e1; padding: 5px 8px; font-size: 9pt; }
                th { background-color: #1e293b; color: #ffffff; text-align: center; }
                .num { text-align: right; font-family: 'Consolas', monospace; }
                .kpi-box { background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; margin-bottom: 12px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <h1>${reportTitle}</h1>
            <div class="subtitle">
                Aba: <strong>${activeSheetName}</strong> | Norma: <strong>${currentResults.standard}</strong> | Método: <strong>${currentResults.method}</strong> | Total: <strong>${items.length} ${isCombined ? 'sapatas conjuntas' : 'bases'}</strong>
            </div>

            <div class="kpi-box">
                <strong>Envoltórias Globais Críticas:</strong><br>
                • Compressão Máxima (V_máx): <strong>${formatNumber(currentResults.global_kpi.V_max)} kN</strong> (Base: ${currentResults.global_kpi.V_max_base})<br>
                • Alívio / Tração Mínima (V_mín): <strong>${formatNumber(currentResults.global_kpi.V_min)} kN</strong> (Base: ${currentResults.global_kpi.V_min_base})<br>
                • Momento Máximo (|M|_máx): <strong>${formatNumber(currentResults.global_kpi.M_max)} kNm</strong> (Base: ${currentResults.global_kpi.M_max_base || '--'})<br>
                • Resultante Horizontal Máxima (H_máx): <strong>${formatNumber(currentResults.global_kpi.H_max)} kN</strong> (Base: ${currentResults.global_kpi.H_max_base})
            </div>

            <h2>${isCombined ? 'Tabela de Envoltórias de Projeto por Sapata Conjunta' : 'Tabela de Envoltórias de Projeto por Base'}</h2>
            <table>
                <thead>
                    <tr>
                        <th>${isCombined ? 'Sapata (Bases)' : 'Base'}</th>
                        <th>V Máx (kN)</th>
                        <th>M Concom. (kNm)</th>
                        <th>Comb. Crítica V_máx</th>
                        <th>X Concom.</th>
                        <th>Y Concom.</th>
                        <th>V Mín (kN)</th>
                        <th>M Concom. (kNm)</th>
                        <th>Comb. Crítica V_mín</th>
                        <th>X Concom.</th>
                        <th>Y Concom.</th>
                        <th>H_res Máx (kN)</th>
                        <th>Comb. Crítica H</th>
                        <th>V Concom.</th>
                        <th>M Concom. (kNm)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    items.forEach(it => {
        const baseName = isCombined ? `${it.base} (${(it.member_bases || []).join(' + ')})` : it.base;
        docHtml += `
            <tr>
                <td style="text-align:center; font-weight:bold;">${baseName}</td>
                <td class="num" style="color:#2563eb; font-weight:bold;">${formatNumber(it.V_max)}</td>
                <td class="num" style="color:#d97706;">${formatNumber(it.V_max_M)}</td>
                <td>${it.V_max_formula || it.V_max_comb || '--'}</td>
                <td class="num">${formatNumber(it.V_max_X)}</td>
                <td class="num">${formatNumber(it.V_max_Y)}</td>
                <td class="num" style="color:#d97706; font-weight:bold;">${formatNumber(it.V_min)}</td>
                <td class="num" style="color:#d97706;">${formatNumber(it.V_min_M)}</td>
                <td>${it.V_min_formula || it.V_min_comb || '--'}</td>
                <td class="num">${formatNumber(it.V_min_X)}</td>
                <td class="num">${formatNumber(it.V_min_Y)}</td>
                <td class="num" style="color:#7c3aed; font-weight:bold;">${formatNumber(it.H_max)}</td>
                <td>${it.H_max_formula || it.H_max_comb || '--'}</td>
                <td class="num">${formatNumber(it.H_max_V)}</td>
                <td class="num" style="color:#d97706;">${formatNumber(it.H_max_M)}</td>
            </tr>
        `;
    });

    docHtml += `
                </tbody>
            </table>
        </body>
        </html>
    `;

    const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isCombined ? `Relatorio_Sapatas_Conjuntas_${activeSheetName}.doc` : `Relatorio_Envoltorias_${activeSheetName}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Copia a tabela resumo formatada como TSV para a área de transferência
 */
function copySummaryTableToClipboard() {
    if (!currentResults) return;

    const isCombined = activeTableView === 'combined';
    const items = isCombined
        ? (currentResults.combined_footings?.summary_table || [])
        : (currentResults.summary_table || []);

    if (items.length === 0) {
        alert('Nenhum dado disponível para cópia.');
        return;
    }

    const colHeader = isCombined ? "Sapata\tBases Integrantes\t" : "Base\t";
    let tsv = colHeader + "V Máx (kN)\tM Concom. (kNm)\tComb. Crítica V_máx\tX Concom.\tY Concom.\tV Mín (kN)\tM Concom. (kNm)\tComb. Crítica V_mín\tX Concom.\tY Concom.\tH_res Máx (kN)\tComb. Crítica H\tV Concom.\tM Concom. (kNm)\t|M| Máx\t|X| Máx\t|Y| Máx\n";

    items.forEach(it => {
        const vMaxC = it.V_max_formula || it.V_max_comb || '--';
        const vMinC = it.V_min_formula || it.V_min_comb || '--';
        const hMaxC = it.H_max_formula || it.H_max_comb || '--';
        if (isCombined) {
            tsv += `${it.base}\t${(it.member_bases || []).join(' + ')}\t${it.V_max}\t${it.V_max_M}\t${vMaxC}\t${it.V_max_X}\t${it.V_max_Y}\t${it.V_min}\t${it.V_min_M}\t${vMinC}\t${it.V_min_X}\t${it.V_min_Y}\t${it.H_max}\t${hMaxC}\t${it.H_max_V}\t${it.H_max_M}\t${it.M_max}\t${it.X_max}\t${it.Y_max}\n`;
        } else {
            tsv += `${it.base}\t${it.V_max}\t${it.V_max_M}\t${vMaxC}\t${it.V_max_X}\t${it.V_max_Y}\t${it.V_min}\t${it.V_min_M}\t${vMinC}\t${it.V_min_X}\t${it.V_min_Y}\t${it.H_max}\t${hMaxC}\t${it.H_max_V}\t${it.H_max_M}\t${it.M_max}\t${it.X_max}\t${it.Y_max}\n`;
        }
    });

    navigator.clipboard.writeText(tsv).then(() => {
        alert(`Tabela de ${isCombined ? 'sapatas conjuntas' : 'envoltórias'} copiada para a área de transferência! Você já pode colar diretamente no Excel.`);
    }).catch(err => {
        alert('Erro ao copiar tabela: ' + err.message);
    });
}

/**
 * Utilitário de download de arquivo base64
 */
function downloadBase64File(base64, filename, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Formata números com duas casas decimais
 */
function formatNumber(val) {
    if (val === undefined || val === null || isNaN(val)) return '0.00';
    return Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Exibe mensagem de erro no status bar
 */
function showError(msg) {
    console.error(msg);
    const statusText = document.getElementById('status-text');
    const indicator = document.getElementById('status-indicator');
    if (statusText) statusText.innerText = '❌ ' + msg;
    if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
}
