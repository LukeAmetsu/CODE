// --- GERADOR UNIVERSAL DE COMBINAÇÕES DE AÇÕES MULTICÓDIGO ---
// Normas: NBR 8681/6118 (Brasil), Eurocode EN 1990 (Europa), ASCE 7-16/7-22 (EUA)
// Suporte a Exclusão Mútua (XOR), Coexistência Obrigatória (AND) e Amplas Origens de Esforços

var LOAD_CATALOG = {
    // 1. Geotécnicos e Hidráulicos
    'Solo Seco (Empuxo)': {
        isVariable: false, category: 'geotech', icon: '⛰️', asce_type: 'H',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 1.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 1.00, xi: 0.85 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Solo Saturado (Empuxo)': {
        isVariable: false, category: 'geotech', icon: '🌊', asce_type: 'H',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 1.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 1.00, xi: 0.85 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Pressão Hidrostática / Água': {
        isVariable: false, category: 'geotech', icon: '💧', asce_type: 'F',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 1.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 1.00, xi: 0.85 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },
    'Subpressão / Uplift': {
        isVariable: false, category: 'geotech', icon: '⬆️', asce_type: 'F',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 0.90 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 0.90, xi: 0.85 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },
    'Sobrecarga no Tardoz (Q_solo)': {
        isVariable: true, category: 'geotech', icon: '🚜', asce_type: 'H',
        nbr: { gamma_q: 1.40, psi0: 0.70, psi1: 0.60, psi2: 0.40 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },

    // 2. Estruturais e Permanentes
    'Peso Próprio (PP)': {
        isVariable: false, category: 'structure', icon: '🧱', asce_type: 'D',
        nbr: { gamma_g_unfav: 1.35, gamma_g_fav: 1.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 1.00, xi: 0.85 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },
    'Permanente (G)': {
        isVariable: false, category: 'structure', icon: '🏛️', asce_type: 'D',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 1.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 1.00, xi: 0.85 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },
    'Permanente (Retração/Recalque)': {
        isVariable: false, category: 'structure', icon: '📐', asce_type: 'D',
        nbr: { gamma_g_unfav: 1.20, gamma_g_fav: 0.00 },
        ec: { gamma_G_unfav: 1.20, gamma_G_fav: 0.00, xi: 1.00 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },
    'Equipamentos Fixos': {
        isVariable: false, category: 'structure', icon: '⚙️', asce_type: 'D',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 1.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 1.00, xi: 0.85 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },

    // 3. Sobrecargas de Uso (Live Loads)
    'Uso Residencial (Q)': {
        isVariable: true, category: 'use', icon: '🏠', asce_type: 'L',
        nbr: { gamma_q: 1.40, psi0: 0.50, psi1: 0.40, psi2: 0.30 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Uso Escritório/Loja (Q)': {
        isVariable: true, category: 'use', icon: '🏢', asce_type: 'L',
        nbr: { gamma_q: 1.40, psi0: 0.70, psi1: 0.40, psi2: 0.30 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Garagem/Estacionamento (Q)': {
        isVariable: true, category: 'use', icon: '🚗', asce_type: 'L',
        nbr: { gamma_q: 1.40, psi0: 0.70, psi1: 0.60, psi2: 0.40 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.70, psi2: 0.60 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Garagem / Tráfego Pesado (Q)': {
        isVariable: true, category: 'use', icon: '🚛', asce_type: 'L',
        nbr: { gamma_q: 1.40, psi0: 0.80, psi1: 0.70, psi2: 0.60 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Cobertura / Manutenção (Q)': {
        isVariable: true, category: 'use', icon: '🪜', asce_type: 'Lr',
        nbr: { gamma_q: 1.40, psi0: 0.60, psi1: 0.30, psi2: 0.00 },
        ec: { gamma_Q: 1.50, psi0: 0.00, psi1: 0.00, psi2: 0.00 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Guarda-Corpo (Q)': {
        isVariable: true, category: 'use', icon: '🛡️', asce_type: 'L',
        nbr: { gamma_q: 1.40, psi0: 0.80, psi1: 0.60, psi2: 0.40 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Ponte Rolante / Guindaste (Q)': {
        isVariable: true, category: 'use', icon: '🏗️', asce_type: 'L',
        nbr: { gamma_q: 1.40, psi0: 0.80, psi1: 0.70, psi2: 0.50 },
        ec: { gamma_Q: 1.50, psi0: 1.00, psi1: 0.90, psi2: 0.80 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Outras Ações Variáveis (Q)': {
        isVariable: true, category: 'use', icon: '📦', asce_type: 'L',
        nbr: { gamma_q: 1.40, psi0: 0.80, psi1: 0.60, psi2: 0.40 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },

    // 4. Climáticos & Ambientais
    'Vento (W)': {
        isVariable: true, category: 'wind', icon: '💨', asce_type: 'W',
        nbr: { gamma_q: 1.40, psi0: 0.60, psi1: 0.30, psi2: 0.00 },
        ec: { gamma_Q: 1.50, psi0: 0.60, psi1: 0.20, psi2: 0.00 },
        asce: { factor_lrfd: 1.00, factor_asd: 0.60 }
    },
    'Temperatura (T)': {
        isVariable: true, category: 'temperature', icon: '🌡️', asce_type: 'T',
        nbr: { gamma_q: 1.40, psi0: 0.60, psi1: 0.50, psi2: 0.30 },
        ec: { gamma_Q: 1.50, psi0: 0.60, psi1: 0.50, psi2: 0.00 },
        asce: { factor_lrfd: 1.20, factor_asd: 0.75 }
    },
    'Neve (S)': {
        isVariable: true, category: 'snow', icon: '❄️', asce_type: 'S',
        nbr: { gamma_q: 1.40, psi0: 0.60, psi1: 0.30, psi2: 0.00 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.20 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Chuva / Empoçamento (R)': {
        isVariable: true, category: 'rain', icon: '🌧️', asce_type: 'R',
        nbr: { gamma_q: 1.40, psi0: 0.60, psi1: 0.30, psi2: 0.00 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.00 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Líquidos (Truncado)': {
        isVariable: true, category: 'liquid', icon: '🧪', asce_type: 'F',
        nbr: { gamma_q: 1.40, psi0: 0.50, psi1: 0.40, psi2: 0.30 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },

    // 5. Acidentais / Sísmicos
    'Sismo (E)': {
        isVariable: true, category: 'seismic', icon: '⚡', asce_type: 'E',
        nbr: { gamma_q: 1.00, psi0: 0.30, psi1: 0.20, psi2: 0.00 },
        ec: { gamma_Q: 1.00, psi0: 0.00, psi1: 0.00, psi2: 0.00 },
        asce: { factor_lrfd: 1.00, factor_asd: 0.70 }
    },
    'Impacto / Choque Acidental': {
        isVariable: true, category: 'accidental', icon: '💥', asce_type: 'A',
        nbr: { gamma_q: 1.00, psi0: 0.00, psi1: 0.00, psi2: 0.00 },
        ec: { gamma_Q: 1.00, psi0: 0.00, psi1: 0.00, psi2: 0.00 },
        asce: { factor_lrfd: 1.00, factor_asd: 1.00 }
    },

    // 6. Fundações Rasas (Sapatas & Geotécnica NBR 6122)
    'Sapata: Peso Próprio + Solo (G_est)': {
        isVariable: false, category: 'geotech_foundation', icon: '🏛️', asce_type: 'D',
        geo_role: 'stabilizing',
        nbr: { gamma_g_unfav: 1.35, gamma_g_fav: 0.90 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 0.90, xi: 0.85 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },
    'Pilar: Carga Normal Permanente (Nk_g)': {
        isVariable: false, category: 'geotech_foundation', icon: '⬇️', asce_type: 'D',
        geo_role: 'stabilizing',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 0.90 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 0.90, xi: 0.85 },
        asce: { factor_lrfd: 1.20, factor_asd: 1.00 }
    },
    'Pilar: Sobrecarga Normal (Nk_q)': {
        isVariable: true, category: 'geotech_foundation', icon: '👥', asce_type: 'L',
        geo_role: 'vertical_variable',
        nbr: { gamma_q: 1.40, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        ec: { gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Pilar: Força Horizontal Permanente (Hk_g)': {
        isVariable: false, category: 'geotech_foundation', icon: '➡️', asce_type: 'D',
        geo_role: 'destabilizing_horizontal',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 0.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 0.00, xi: 0.85 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Pilar: Força Horizontal Vento (Hk_w)': {
        isVariable: true, category: 'geotech_foundation', icon: '💨', asce_type: 'W',
        geo_role: 'destabilizing_horizontal',
        nbr: { gamma_q: 1.40, psi0: 0.60, psi1: 0.30, psi2: 0.00 },
        ec: { gamma_Q: 1.50, psi0: 0.60, psi1: 0.20, psi2: 0.00 },
        asce: { factor_lrfd: 1.00, factor_asd: 0.60 }
    },
    'Pilar: Momento Fletor Permanente (Mk_g)': {
        isVariable: false, category: 'geotech_foundation', icon: '🔄', asce_type: 'D',
        geo_role: 'destabilizing_moment',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 0.00 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 0.00, xi: 0.85 },
        asce: { factor_lrfd: 1.60, factor_asd: 1.00 }
    },
    'Pilar: Momento Fletor Vento (Mk_w)': {
        isVariable: true, category: 'geotech_foundation', icon: '🌪️', asce_type: 'W',
        geo_role: 'destabilizing_moment',
        nbr: { gamma_q: 1.40, psi0: 0.60, psi1: 0.30, psi2: 0.00 },
        ec: { gamma_Q: 1.50, psi0: 0.60, psi1: 0.20, psi2: 0.00 },
        asce: { factor_lrfd: 1.00, factor_asd: 0.60 }
    }
};

var COMBO_PRESETS = {
    fundacao_rasa_tomb_desl: [
        { name: 'Peso Próprio Sapata + Solo (G_est)', type: 'Sapata: Peso Próprio + Solo (G_est)', value: 85.0, group: '', requires: '' },
        { name: 'Normal Permanente Pilar (Nk_g)', type: 'Pilar: Carga Normal Permanente (Nk_g)', value: 250.0, group: '', requires: '' },
        { name: 'Sobrecarga de Uso Pilar (Nk_q)', type: 'Pilar: Sobrecarga Normal (Nk_q)', value: 120.0, group: '', requires: '' },
        { name: 'Força Horizontal Vento (Hk_w)', type: 'Pilar: Força Horizontal Vento (Hk_w)', value: 35.0, group: '', requires: '' },
        { name: 'Momento Tombante Vento (Mk_w)', type: 'Pilar: Momento Fletor Vento (Mk_w)', value: 65.0, group: '', requires: '' }
    ],
    fundacao_rasa_completa: [
        { name: 'Peso Próprio Sapata + Terra (G_est)', type: 'Sapata: Peso Próprio + Solo (G_est)', value: 90.0, group: '', requires: '' },
        { name: 'Normal Permanente Pilar (Nk_g)', type: 'Pilar: Carga Normal Permanente (Nk_g)', value: 300.0, group: '', requires: '' },
        { name: 'Sobrecarga Utilização (Nk_q)', type: 'Pilar: Sobrecarga Normal (Nk_q)', value: 140.0, group: '', requires: '' },
        { name: 'Força Horizontal Permanente (Hk_g)', type: 'Pilar: Força Horizontal Permanente (Hk_g)', value: 12.0, group: '', requires: '' },
        { name: 'Força Horizontal Vento (Hk_w)', type: 'Pilar: Força Horizontal Vento (Hk_w)', value: 28.0, group: '', requires: '' },
        { name: 'Momento Permanente (Mk_g)', type: 'Pilar: Momento Fletor Permanente (Mk_g)', value: 20.0, group: '', requires: '' },
        { name: 'Momento Vento (Mk_w)', type: 'Pilar: Momento Fletor Vento (Mk_w)', value: 55.0, group: '', requires: '' }
    ],
    muro_arrimo: [
        { name: 'Peso Próprio Muro (PP)', type: 'Peso Próprio (PP)', value: 45.0, group: '', requires: '' },
        { name: 'Empuxo Solo Seco', type: 'Solo Seco (Empuxo)', value: 35.0, group: 'Solo', requires: '' },
        { name: 'Empuxo Solo Saturado', type: 'Solo Saturado (Empuxo)', value: 25.0, group: 'Solo', requires: 'Pressão da Água' },
        { name: 'Pressão da Água', type: 'Pressão Hidrostática / Água', value: 18.0, group: '', requires: '' },
        { name: 'Sobrecarga Tráfego no Tardoz', type: 'Sobrecarga no Tardoz (Q_solo)', value: 12.0, group: '', requires: '' }
    ],
    edificio: [
        { name: 'Peso Próprio (G1)', type: 'Peso Próprio (PP)', value: 30.0, group: '', requires: '' },
        { name: 'Revestimento (G2)', type: 'Permanente (G)', value: 15.0, group: '', requires: '' },
        { name: 'Sobrecarga Residencial (Q)', type: 'Uso Residencial (Q)', value: 20.0, group: '', requires: '' },
        { name: 'Vento Transversal (W)', type: 'Vento (W)', value: 12.0, group: 'Vento', requires: '' }
    ],
    galpao: [
        { name: 'Estrutura Metálica (PP)', type: 'Peso Próprio (PP)', value: 8.0, group: '', requires: '' },
        { name: 'Sobrecarga de Manutenção (Q)', type: 'Cobertura / Manutenção (Q)', value: 5.0, group: '', requires: '' },
        { name: 'Vento Sucção (W_suc)', type: 'Vento (W)', value: -16.0, group: 'Vento', requires: '' },
        { name: 'Vento Sobrepressão (W_sob)', type: 'Vento (W)', value: 14.0, group: 'Vento', requires: '' }
    ],
    subterraneo: [
        { name: 'Laje de Fundo / Radier (PP)', type: 'Peso Próprio (PP)', value: 40.0, group: '', requires: '' },
        { name: 'Solo Saturado Lateral', type: 'Solo Saturado (Empuxo)', value: 30.0, group: 'Solo', requires: 'Água Lateral' },
        { name: 'Água Lateral', type: 'Pressão Hidrostática / Água', value: 22.0, group: '', requires: '' },
        { name: 'Subpressão de Fundo (U)', type: 'Subpressão / Uplift', value: -25.0, group: '', requires: 'Água Lateral' }
    ]
};

var currentCombinationsData = null;
var currentStandard = 'NBR 8681';
var currentMethod = 'ELU_NORMAL';

function getMeta(type) {
    if (LOAD_CATALOG[type]) return LOAD_CATALOG[type];
    var isVar = type.indexOf('(Q)') !== -1 || type.indexOf('(W)') !== -1 || type.indexOf('Variável') !== -1;
    return {
        isVariable: isVar, category: isVar ? 'use' : 'structure', icon: '📌', asce_type: isVar ? 'L' : 'D',
        nbr: { gamma_g_unfav: 1.40, gamma_g_fav: 1.00, gamma_q: 1.40, psi0: 0.70, psi1: 0.40, psi2: 0.30 },
        ec: { gamma_G_unfav: 1.35, gamma_G_fav: 1.00, gamma_Q: 1.50, psi0: 0.70, psi1: 0.50, psi2: 0.30 },
        asce: { factor_lrfd: isVar ? 1.60 : 1.20, factor_asd: 1.00 }
    };
}

function loadComboPreset(presetKey) {
    var loads = COMBO_PRESETS[presetKey];
    if (!loads) return;

    var container = document.getElementById('loads-container');
    if (!container) return;
    container.innerHTML = '';

    loads.forEach(function(l) {
        addLoadRow(l);
    });

    updateCompanionSelects();
    updateRulesSummary();
    handleGenerateCombinations();
}

function updateCompanionSelects() {
    var rows = document.querySelectorAll('#loads-container > div');
    var loadNames = [];
    rows.forEach(function(r) {
        var n = r.querySelector('.load-name')?.value.trim();
        if (n) loadNames.push(n);
    });

    rows.forEach(function(r) {
        var sel = r.querySelector('.load-requires');
        if (!sel) return;
        var currentVal = sel.value;
        var myName = r.querySelector('.load-name')?.value.trim();

        var opts = '<option value="">-- Nenhuma --</option>';
        loadNames.forEach(function(name) {
            if (name !== myName) {
                opts += '<option value="' + name + '"' + (name === currentVal ? ' selected' : '') + '>' + name + '</option>';
            }
        });
        sel.innerHTML = opts;
    });
}

function updateRulesSummary() {
    var rows = document.querySelectorAll('#loads-container > div');
    var container = document.getElementById('active-rules-summary');
    if (!container) return;

    var groups = {};
    var companions = [];
    var soloSeco = null;
    var agua = null;

    rows.forEach(function(r) {
        var n = r.querySelector('.load-name')?.value.trim();
        var t = r.querySelector('.load-type')?.value;
        var g = r.querySelector('.load-group')?.value.trim();
        var req = r.querySelector('.load-requires')?.value.trim();

        if (g && n) {
            if (!groups[g]) groups[g] = [];
            groups[g].push(n);
        }
        if (req && n) {
            companions.push({ from: n, to: req });
        }
        if (n && (n.toLowerCase().includes('seco') || t.toLowerCase().includes('seco'))) soloSeco = n;
        if (n && (n.toLowerCase().includes('água') || n.toLowerCase().includes('agua') || t.toLowerCase().includes('água'))) agua = n;
    });

    var html = '';

    // Regras de Exclusão (XOR)
    Object.keys(groups).forEach(function(grp) {
        if (groups[grp].length > 1) {
            html += '<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">' +
                '<span>🚫 Exclusão (' + grp + '):</span> <span class="font-bold">' + groups[grp].join(' ⊄ ') + '</span> (nunca atuam juntas)' +
                '</div>';
        }
    });

    // Regras de Coexistência (AND)
    companions.forEach(function(c) {
        html += '<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">' +
            '<span>🔗 Coexistência Obrigatória:</span> <span class="font-bold">[' + c.from + ']</span> ⟹ requer <span class="font-bold">[' + c.to + ']</span> (atuam juntas)' +
            '</div>';
    });

    // Incompatibilidade Solo Seco + Água
    if (soloSeco && agua) {
        html += '<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-xs font-semibold">' +
            '<span>💧 Condição Física:</span> <span class="font-bold">[' + soloSeco + ']</span> desativa automaticamente <span class="font-bold">[' + agua + ']</span> (nível seco)' +
            '</div>';
    }

    if (!html) {
        html = '<span class="text-xs text-gray-400 italic">Nenhuma regra especial ativa. Todas as ações elegíveis atuarão conforme as permutações da norma selecionada.</span>';
    }

    container.innerHTML = html;
}

function addLoadRow(load) {
    var container = document.getElementById('loads-container');
    if (!container) return;

    var row = document.createElement('div');
    row.className = 'grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 bg-white dark:bg-gray-800/90 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xs items-center transition-all hover:border-blue-500/50 dark:hover:border-blue-500/50';

    var defaultName = load ? load.name : ('Carga ' + (container.children.length + 1));
    var defaultType = load ? load.type : Object.keys(LOAD_CATALOG)[0];
    var defaultValue = load ? load.value : 15.0;
    var defaultGroup = load ? (load.group || '') : '';
    var defaultReq = load ? (load.requires || '') : '';

    var categories = {
        'Fundações Rasas & Sapatas': [
            'Sapata: Peso Próprio + Solo (G_est)',
            'Pilar: Carga Normal Permanente (Nk_g)',
            'Pilar: Sobrecarga Normal (Nk_q)',
            'Pilar: Força Horizontal Permanente (Hk_g)',
            'Pilar: Força Horizontal Vento (Hk_w)',
            'Pilar: Momento Fletor Permanente (Mk_g)',
            'Pilar: Momento Fletor Vento (Mk_w)'
        ],
        'Geotécnicos & Hidráulicos': ['Solo Seco (Empuxo)', 'Solo Saturado (Empuxo)', 'Pressão Hidrostática / Água', 'Subpressão / Uplift', 'Sobrecarga no Tardoz (Q_solo)'],
        'Estruturais & Permanentes': ['Peso Próprio (PP)', 'Permanente (G)', 'Permanente (Retração/Recalque)', 'Equipamentos Fixos'],
        'Sobrecargas de Uso': ['Uso Residencial (Q)', 'Uso Escritório/Loja (Q)', 'Garagem/Estacionamento (Q)', 'Garagem / Tráfego Pesado (Q)', 'Cobertura / Manutenção (Q)', 'Guarda-Corpo (Q)', 'Ponte Rolante / Guindaste (Q)', 'Outras Ações Variáveis (Q)'],
        'Climáticos & Ambientais': ['Vento (W)', 'Temperatura (T)', 'Neve (S)', 'Chuva / Empoçamento (R)', 'Líquidos (Truncado)'],
        'Acidentais & Sísmicos': ['Sismo (E)', 'Impacto / Choque Acidental']
    };

    var typeOptions = '';
    Object.keys(categories).forEach(function(catName) {
        typeOptions += '<optgroup label="' + catName + '">';
        categories[catName].forEach(function(t) {
            var meta = LOAD_CATALOG[t] || {};
            var icon = meta.icon || '📌';
            typeOptions += '<option value="' + t + '" ' + (t === defaultType ? 'selected' : '') + '>' + icon + ' ' + t + '</option>';
        });
        typeOptions += '</optgroup>';
    });

    row.innerHTML = `
        <div class="sm:col-span-3">
            <input type="text" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-2 text-xs font-semibold text-gray-900 dark:text-gray-100 load-name focus:ring-2 focus:ring-blue-500 focus:outline-none" value="${defaultName}" placeholder="Nome da Ação">
        </div>
        <div class="sm:col-span-3">
            <select class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-2 text-xs load-type font-medium cursor-pointer text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                ${typeOptions}
            </select>
        </div>
        <div class="sm:col-span-2">
            <input type="number" step="any" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-2 text-xs font-bold text-right load-value text-indigo-600 dark:text-indigo-400 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none" value="${defaultValue}" placeholder="Valor (kN)">
        </div>
        <div class="sm:col-span-2">
            <input type="text" class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2.5 py-2 text-xs text-center load-group font-medium text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none" value="${defaultGroup}" placeholder="Ex: Solo" title="Grupo de Exclusão Mútua (XOR): ações no mesmo grupo nunca atuam juntas.">
        </div>
        <div class="sm:col-span-1">
            <select class="w-full bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-1 py-2 text-[11px] load-requires cursor-pointer text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500 focus:outline-none" title="Coexistência Obrigatória (AND): esta ação só atua se a ação selecionada estiver presente.">
                <option value="">--</option>
                ${defaultReq ? `<option value="${defaultReq}" selected>${defaultReq}</option>` : ''}
            </select>
        </div>
        <div class="sm:col-span-1 text-center">
            <button type="button" class="text-rose-500 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/60 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-base delete-load-btn transition-colors cursor-pointer mx-auto" title="Excluir Carga">✕</button>
        </div>
    `;

    row.querySelector('.delete-load-btn')?.addEventListener('click', function() {
        row.remove();
        updateCompanionSelects();
        updateRulesSummary();
        handleGenerateCombinations();
    });

    row.querySelector('.load-name')?.addEventListener('input', function() {
        updateCompanionSelects();
        updateRulesSummary();
    });

    row.querySelectorAll('input, select').forEach(function(el) {
        el.addEventListener('change', function() {
            updateCompanionSelects();
            updateRulesSummary();
            handleGenerateCombinations();
        });
    });

    container.appendChild(row);
}

function gatherLoads() {
    var rows = document.querySelectorAll('#loads-container > div');
    var loads = [];
    rows.forEach(function(r, idx) {
        var name = r.querySelector('.load-name')?.value.trim() || ('Ação ' + (idx + 1));
        var type = r.querySelector('.load-type')?.value || 'Permanente (G)';
        var value = parseFloat(r.querySelector('.load-value')?.value) || 0;
        var group = r.querySelector('.load-group')?.value.trim() || '';
        var requires = r.querySelector('.load-requires')?.value.trim() || '';
        loads.push({
            id: 'load_' + idx,
            name: name,
            type: type,
            value: value,
            group: group,
            requires: requires
        });
    });
    return loads;
}

// --- MOTOR DE REGRAS E COMBINATÓRIA CLIENT-SIDE ---
var universalComboCalculator = (function() {

    function generateValidSubsets(userLoads) {
        var exclusiveGroups = {};
        var independentPerms = [];
        var independentVars = [];

        userLoads.forEach(function(l) {
            var meta = getMeta(l.type);
            var isVar = meta.isVariable;
            var grp = (l.group || '').trim();

            if (grp) {
                if (!exclusiveGroups[grp]) exclusiveGroups[grp] = [];
                exclusiveGroups[grp].push(l);
            } else {
                if (isVar) independentVars.push(l);
                else independentPerms.push(l);
            }
        });

        var baseSets = [independentPerms.slice()];

        // Ramificar grupos de exclusão (XOR)
        Object.keys(exclusiveGroups).forEach(function(grpName) {
            var items = exclusiveGroups[grpName];
            var newBaseSets = [];
            baseSets.forEach(function(bSet) {
                var allPerm = items.every(function(it) { return !getMeta(it.type).isVariable; });
                if (!allPerm) {
                    newBaseSets.push(bSet.slice());
                }
                items.forEach(function(it) {
                    newBaseSets.push(bSet.concat([it]));
                });
            });
            baseSets = newBaseSets;
        });

        // Ramificar variáveis independentes
        var candidateSets = baseSets;
        independentVars.forEach(function(v) {
            var newCand = [];
            candidateSets.forEach(function(cSet) {
                newCand.push(cSet.slice());
                newCand.push(cSet.concat([v]));
            });
            candidateSets = newCand;
        });

        // Filtrar dependências (AND) e condições físicas
        var validSets = [];
        candidateSets.forEach(function(cand) {
            var candNames = cand.map(function(l) { return l.name.trim(); });
            var isValid = true;

            for (var i = 0; i < cand.length; i++) {
                var l = cand[i];
                if (l.requires && l.requires.trim()) {
                    var reqName = l.requires.trim();
                    if (candNames.indexOf(reqName) === -1) {
                        isValid = false;
                        break;
                    }
                }
            }

            var hasSoloSeco = cand.some(function(l) {
                var s = (l.name + ' ' + l.type).toLowerCase();
                return s.includes('seco');
            });
            var hasAgua = cand.some(function(l) {
                var s = (l.name + ' ' + l.type).toLowerCase();
                return s.includes('água') || s.includes('agua') || s.includes('hidrostática');
            });

            if (hasSoloSeco && hasAgua) {
                isValid = false;
            }

            if (isValid) {
                validSets.push(cand);
            }
        });

        return validSets.length > 0 ? validSets : [userLoads];
    }

    function classifyGeoRole(load) {
        var meta = getMeta(load.type);
        if (meta.geo_role) return meta.geo_role;
        var nameType = ((load.name || '') + ' ' + (load.type || '')).toLowerCase();
        if (nameType.includes('subpress') || nameType.includes('uplift') || nameType.includes('flutua')) return 'uplift';
        if (nameType.includes('momento') || nameType.includes('m_') || nameType.includes('fletor') || nameType.includes('tomb')) return 'destabilizing_moment';
        if (nameType.includes('horizontal') || nameType.includes('h_') || nameType.includes('empuxo') || nameType.includes('vento') || nameType.includes('cortante') || nameType.includes('desliz')) return 'destabilizing_horizontal';
        if (nameType.includes('peso') || nameType.includes('pp') || nameType.includes('sapata') || nameType.includes('normal perm') || nameType.includes('g_est') || nameType.includes('estabiliz')) return 'stabilizing';
        if (meta.isVariable) return 'vertical_variable';
        return 'stabilizing';
    }

    function calculate(userLoads, standard, method) {
        var validSubsets = generateValidSubsets(userLoads);
        var std = (standard || 'NBR 8681').toUpperCase();
        var methodUpper = (method || 'ELU_NORMAL').toUpperCase();

        if (methodUpper.includes('GEO') || methodUpper.includes('TOMB') || methodUpper.includes('DESL') || methodUpper.includes('FS_GLOBAL') || methodUpper.includes('PONDERADA')) {
            return calcGeotechnical(validSubsets, method, standard);
        } else if (std.includes('EUROCODE') || std.includes('EN 1990') || std.includes('EC0')) {
            return calcEurocode(validSubsets, method);
        } else if (std.includes('ASCE') || std.includes('IBC')) {
            return calcASCE(validSubsets, method);
        } else {
            return calcNBR(validSubsets, method);
        }
    }

    function calcGeotechnical(validSubsets, method, standard) {
        var methodUpper = (method || 'GEO_COMPLETA').toUpperCase();
        var isGlobalOnly = methodUpper.includes('FS_GLOBAL') && !methodUpper.includes('COMPLETA') && !methodUpper.includes('PONDERADA');
        var isPonderadaOnly = methodUpper.includes('PONDERADA') && !methodUpper.includes('COMPLETA') && !methodUpper.includes('FS_GLOBAL');
        var includePonderada = !isGlobalOnly;
        var includeGlobal = !isPonderadaOnly;

        var combinations = { elu: [], els_rara: [], els_freq: [], els_qp: [] };
        var seen = { elu: {}, els_rara: {}, els_freq: {}, els_qp: {} };

        var std = (standard || 'NBR 8681').toUpperCase();
        var isEurocode = std.includes('EUROCODE') || std.includes('EN 1990') || std.includes('EC7');

        var gammaFav = 0.90;
        var gammaUnfavG = isEurocode ? 1.35 : 1.40;
        var gammaUnfavEquG = isEurocode ? 1.10 : 1.35;
        var gammaQ = isEurocode ? 1.50 : 1.40;

        validSubsets.forEach(function(loadSet) {
            var perms = loadSet.filter(function(l) { return !getMeta(l.type).isVariable; });
            var vars_ = loadSet.filter(function(l) { return getMeta(l.type).isVariable; });

            // 1. COMBINAÇÕES PONDERADAS (ELU)
            if (includePonderada) {
                // 1.A EQU - Tombamento Crítico
                var destabVars = vars_.filter(function(v) {
                    var role = classifyGeoRole(v);
                    var nt = ((v.name || '') + ' ' + (v.type || '')).toLowerCase();
                    return role === 'destabilizing_moment' || role === 'destabilizing_horizontal' || role === 'uplift' || nt.includes('vento');
                });

                if (destabVars.length > 0) {
                    destabVars.forEach(function(qPrinc) {
                        var valTerms = [];
                        var strTerms = [];
                        perms.forEach(function(p) {
                            var role = classifyGeoRole(p);
                            var f = (role === 'stabilizing') ? gammaFav : gammaUnfavEquG;
                            valTerms.push(f * p.value);
                            strTerms.push(f.toFixed(2) + '*' + p.name);
                        });

                        valTerms.push(gammaQ * qPrinc.value);
                        strTerms.push(gammaQ.toFixed(2) + '*' + qPrinc.name);

                        destabVars.forEach(function(qSec) {
                            if (qSec === qPrinc) return;
                            var metaQs = getMeta(qSec.type);
                            var psi0 = isEurocode ? metaQs.ec.psi0 : metaQs.nbr.psi0;
                            var fSec = gammaQ * psi0;
                            valTerms.push(fSec * qSec.value);
                            strTerms.push(fSec.toFixed(2) + '*' + qSec.name);
                        });

                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'EQU - Tombamento Crítico (Alívio 0.90G + ' + qPrinc.name + ')',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0),
                                category: 'tombamento',
                                limit_state: 'EQU (Tombamento)',
                                criterion: 'M_dst,d <= M_stb,d (NBR 6122 Anexo A)',
                                standard: isEurocode ? 'Eurocode EN 1990 (EQU)' : 'NBR 6122 / NBR 8681'
                            });
                        }
                    });
                } else {
                    var hasDestabPerm = perms.some(function(p) {
                        var role = classifyGeoRole(p);
                        return role === 'destabilizing_moment' || role === 'destabilizing_horizontal' || role === 'uplift';
                    });
                    if (hasDestabPerm) {
                        var valTerms = [];
                        var strTerms = [];
                        perms.forEach(function(p) {
                            var role = classifyGeoRole(p);
                            var f = (role === 'stabilizing') ? gammaFav : gammaUnfavEquG;
                            valTerms.push(f * p.value);
                            strTerms.push(f.toFixed(2) + '*' + p.name);
                        });
                        if (valTerms.length > 0) {
                            var form = strTerms.join(' + ');
                            if (!seen.elu[form]) {
                                seen.elu[form] = true;
                                combinations.elu.push({
                                    title: 'EQU - Tombamento Crítico (Alívio 0.90G + Empuxo Permanente)',
                                    formula: form,
                                    result: valTerms.reduce(function(a, b) { return a + b; }, 0),
                                    category: 'tombamento',
                                    limit_state: 'EQU (Tombamento)',
                                    criterion: 'M_dst,d <= M_stb,d (NBR 6122 Anexo A)',
                                    standard: isEurocode ? 'Eurocode EN 1990 (EQU)' : 'NBR 6122 / NBR 8681'
                                });
                            }
                        }
                    }
                }

                // 1.B GEO-SLI - Deslizamento Crítico
                var horizVars = vars_.filter(function(v) {
                    var role = classifyGeoRole(v);
                    var nt = ((v.name || '') + ' ' + (v.type || '')).toLowerCase();
                    return role === 'destabilizing_horizontal' || nt.includes('vento');
                });

                if (horizVars.length > 0) {
                    horizVars.forEach(function(qPrinc) {
                        var valTerms = [];
                        var strTerms = [];
                        perms.forEach(function(p) {
                            var role = classifyGeoRole(p);
                            var f = (role === 'stabilizing') ? gammaFav : gammaUnfavG;
                            valTerms.push(f * p.value);
                            strTerms.push(f.toFixed(2) + '*' + p.name);
                        });

                        valTerms.push(gammaQ * qPrinc.value);
                        strTerms.push(gammaQ.toFixed(2) + '*' + qPrinc.name);

                        horizVars.forEach(function(qSec) {
                            if (qSec === qPrinc) return;
                            var metaQs = getMeta(qSec.type);
                            var psi0 = isEurocode ? metaQs.ec.psi0 : metaQs.nbr.psi0;
                            var fSec = gammaQ * psi0;
                            valTerms.push(fSec * qSec.value);
                            strTerms.push(fSec.toFixed(2) + '*' + qSec.name);
                        });

                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'GEO-SLI - Deslizamento Crítico (Normal 0.90G + H máx ' + qPrinc.name + ')',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0),
                                category: 'deslizamento',
                                limit_state: 'GEO-SLI (Deslizamento)',
                                criterion: 'H_sd <= R_sd (NBR 6122 § 7.3 / Anexo B)',
                                standard: isEurocode ? 'Eurocode EN 1990 (GEO)' : 'NBR 6122 / NBR 8681'
                            });
                        }
                    });
                } else {
                    var hasDestabHorizPerm = perms.some(function(p) {
                        return classifyGeoRole(p) === 'destabilizing_horizontal';
                    });
                    if (hasDestabHorizPerm) {
                        var valTerms = [];
                        var strTerms = [];
                        perms.forEach(function(p) {
                            var role = classifyGeoRole(p);
                            var f = (role === 'stabilizing') ? gammaFav : gammaUnfavG;
                            valTerms.push(f * p.value);
                            strTerms.push(f.toFixed(2) + '*' + p.name);
                        });
                        if (valTerms.length > 0) {
                            var form = strTerms.join(' + ');
                            if (!seen.elu[form]) {
                                seen.elu[form] = true;
                                combinations.elu.push({
                                    title: 'GEO-SLI - Deslizamento Crítico (Normal 0.90G + Empuxo)',
                                    formula: form,
                                    result: valTerms.reduce(function(a, b) { return a + b; }, 0),
                                    category: 'deslizamento',
                                    limit_state: 'GEO-SLI (Deslizamento)',
                                    criterion: 'H_sd <= R_sd (NBR 6122 § 7.3 / Anexo B)',
                                    standard: isEurocode ? 'Eurocode EN 1990 (GEO)' : 'NBR 6122 / NBR 8681'
                                });
                            }
                        }
                    }
                }

                // 1.C GEO-STR - Capacidade de Carga Máxima
                if (vars_.length > 0) {
                    vars_.forEach(function(qPrinc) {
                        var valTerms = [];
                        var strTerms = [];
                        perms.forEach(function(p) {
                            valTerms.push(gammaUnfavG * p.value);
                            strTerms.push(gammaUnfavG.toFixed(2) + '*' + p.name);
                        });

                        valTerms.push(gammaQ * qPrinc.value);
                        strTerms.push(gammaQ.toFixed(2) + '*' + qPrinc.name);

                        vars_.forEach(function(qSec) {
                            if (qSec === qPrinc) return;
                            var metaQs = getMeta(qSec.type);
                            var psi0 = isEurocode ? metaQs.ec.psi0 : metaQs.nbr.psi0;
                            var fSec = gammaQ * psi0;
                            valTerms.push(fSec * qSec.value);
                            strTerms.push(fSec.toFixed(2) + '*' + qSec.name);
                        });

                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'GEO-STR - Capacidade de Carga Máx (Princ: ' + qPrinc.name + ')',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0),
                                category: 'capacidade_carga',
                                limit_state: 'GEO-STR (Capacidade de Carga)',
                                criterion: 'N_sd <= R_sd (NBR 6122 / NBR 6118)',
                                standard: isEurocode ? 'Eurocode EN 1990 (STR/GEO)' : 'NBR 6122 / NBR 8681'
                            });
                        }
                    });
                } else {
                    var valTerms = [];
                    var strTerms = [];
                    perms.forEach(function(p) {
                        valTerms.push(gammaUnfavG * p.value);
                        strTerms.push(gammaUnfavG.toFixed(2) + '*' + p.name);
                    });
                    if (valTerms.length > 0) {
                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'GEO-STR - Capacidade de Carga (Apenas Permanentes)',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0),
                                category: 'capacidade_carga',
                                limit_state: 'GEO-STR (Capacidade de Carga)',
                                criterion: 'N_sd <= R_sd (NBR 6122 / NBR 6118)',
                                standard: isEurocode ? 'Eurocode EN 1990 (STR/GEO)' : 'NBR 6122 / NBR 8681'
                            });
                        }
                    }
                }
            }

            // 2. FS GLOBAL / ELS SERVIÇO
            if (includeGlobal) {
                // 2.A FS Global: Tombamento
                var valTermsTomb = perms.map(function(p) { return 1.0 * p.value; });
                var strTermsTomb = perms.map(function(p) { return '1.00*' + p.name; });

                if (vars_.length > 0) {
                    vars_.forEach(function(qPrinc) {
                        var vTomb = valTermsTomb.slice();
                        var sTomb = strTermsTomb.slice();
                        vTomb.push(1.0 * qPrinc.value);
                        sTomb.push('1.00*' + qPrinc.name);

                        vars_.forEach(function(qSec) {
                            if (qSec === qPrinc) return;
                            var metaQs = getMeta(qSec.type);
                            var psi0 = isEurocode ? metaQs.ec.psi0 : metaQs.nbr.psi0;
                            vTomb.push(psi0 * qSec.value);
                            sTomb.push(psi0.toFixed(2) + '*' + qSec.name);
                        });

                        var form = sTomb.join(' + ');
                        if (!seen.els_rara[form]) {
                            seen.els_rara[form] = true;
                            combinations.els_rara.push({
                                title: 'FS Global - Tombamento & Rara (Princ: ' + qPrinc.name + ')',
                                formula: form,
                                result: vTomb.reduce(function(a, b) { return a + b; }, 0),
                                category: 'tombamento',
                                limit_state: 'FS Global (Tombamento)',
                                criterion: 'FS_tomb >= 1.50 (ou 1.20 c/ vento) - NBR 6122',
                                standard: 'NBR 6122 (FS Global)'
                            });
                        }
                    });
                } else if (valTermsTomb.length > 0) {
                    var form = strTermsTomb.join(' + ');
                    if (!seen.els_rara[form]) {
                        seen.els_rara[form] = true;
                        combinations.els_rara.push({
                            title: 'FS Global - Tombamento (Permanente)',
                            formula: form,
                            result: valTermsTomb.reduce(function(a, b) { return a + b; }, 0),
                            category: 'tombamento',
                            limit_state: 'FS Global (Tombamento)',
                            criterion: 'FS_tomb >= 1.50 - NBR 6122',
                            standard: 'NBR 6122 (FS Global)'
                        });
                    }
                }

                // 2.B FS Global: Deslizamento
                var formDesl = loadSet.map(function(l) { return '1.00*' + l.name; }).join(' + ');
                if (formDesl && !seen.els_rara[formDesl]) {
                    seen.els_rara[formDesl] = true;
                    combinations.els_rara.push({
                        title: 'FS Global - Deslizamento (Cargas Características)',
                        formula: formDesl,
                        result: loadSet.reduce(function(a, l) { return a + l.value; }, 0),
                        category: 'deslizamento',
                        limit_state: 'FS Global (Deslizamento)',
                        criterion: 'FS_desl >= 1.50 (ou 1.20 c/ vento) - NBR 6122',
                        standard: 'NBR 6122 (FS Global)'
                    });
                }

                // 2.C ELS Quase-Permanente
                var qpVals = perms.map(function(g) { return 1.0 * g.value; });
                var qpStrs = perms.map(function(g) { return '1.00*' + g.name; });
                vars_.forEach(function(q) {
                    var psi2 = isEurocode ? getMeta(q.type).ec.psi2 : getMeta(q.type).nbr.psi2;
                    qpVals.push(psi2 * q.value);
                    qpStrs.push(psi2.toFixed(2) + '*' + q.name);
                });
                var qpForm = qpStrs.join(' + ');
                if (!seen.els_qp[qpForm]) {
                    seen.els_qp[qpForm] = true;
                    combinations.els_qp.push({
                        title: 'FS Global / ELS - Quase-Permanente (Recalques / Deformação Lenta)',
                        formula: qpForm,
                        result: qpVals.reduce(function(a, b) { return a + b; }, 0),
                        category: 'capacidade_carga',
                        limit_state: 'ELS (Quase-Permanente)',
                        criterion: 'Recalques Admissíveis e Tensão Efetiva NBR 6122',
                        standard: 'NBR 6122 / NBR 8681'
                    });
                }

                // 2.D ELS Frequente
                if (vars_.length > 0) {
                    vars_.forEach(function(qPrinc) {
                        var fVals = perms.map(function(g) { return 1.0 * g.value; });
                        var fStrs = perms.map(function(g) { return '1.00*' + g.name; });
                        var metaQp = getMeta(qPrinc.type);
                        var psi1P = isEurocode ? metaQp.ec.psi1 : metaQp.nbr.psi1;
                        fVals.push(psi1P * qPrinc.value);
                        fStrs.push(psi1P.toFixed(2) + '*' + qPrinc.name);

                        vars_.forEach(function(qSec) {
                            if (qSec === qPrinc) return;
                            var metaQs = getMeta(qSec.type);
                            var psi2S = isEurocode ? metaQs.ec.psi2 : metaQs.nbr.psi2;
                            fVals.push(psi2S * qSec.value);
                            fStrs.push(psi2S.toFixed(2) + '*' + qSec.name);
                        });

                        var fForm = fStrs.join(' + ');
                        if (!seen.els_freq[fForm]) {
                            seen.els_freq[fForm] = true;
                            combinations.els_freq.push({
                                title: 'FS Global / ELS - Frequente (Princ: ' + qPrinc.name + ')',
                                formula: fForm,
                                result: fVals.reduce(function(a, b) { return a + b; }, 0),
                                category: 'servico',
                                limit_state: 'ELS (Frequente)',
                                criterion: 'Fissuração em fundações de concreto NBR 6118',
                                standard: 'NBR 6122 / NBR 8681'
                            });
                        }
                    });
                }
            }
        });

        return { combinations: combinations };
    }

    function calcNBR(validSubsets, method) {
        var combinations = { elu: [], els_rara: [], els_freq: [], els_qp: [] };
        var seen = { elu: {}, els_rara: {}, els_freq: {}, els_qp: {} };
        var isSpecial = method && (method.includes('ESPECIAL') || method.includes('CONSTRUCAO'));

        validSubsets.forEach(function(loadSet) {
            var perms = loadSet.filter(function(l) { return !getMeta(l.type).isVariable; });
            var vars_ = loadSet.filter(function(l) { return getMeta(l.type).isVariable; });

            var permSets = [[]];
            perms.forEach(function(p) {
                var meta = getMeta(p.type);
                var gUnfav = isSpecial ? 1.25 : meta.nbr.gamma_g_unfav;
                var gFav = meta.nbr.gamma_g_fav;
                var newSets = [];
                permSets.forEach(function(ex) {
                    newSets.push(ex.concat([{ load: p, factor: gUnfav }]));
                    if (gFav !== gUnfav) {
                        newSets.push(ex.concat([{ load: p, factor: gFav }]));
                    }
                });
                permSets = newSets;
            });

            // ELU
            permSets.forEach(function(permSet) {
                if (vars_.length > 0) {
                    vars_.forEach(function(qPrinc) {
                        var valTerms = [];
                        var strTerms = [];
                        permSet.forEach(function(pd) {
                            valTerms.push(pd.factor * pd.load.value);
                            strTerms.push(pd.factor.toFixed(2) + '*' + pd.load.name);
                        });

                        var metaQp = getMeta(qPrinc.type);
                        var gQ = isSpecial ? 1.20 : metaQp.nbr.gamma_q;
                        valTerms.push(gQ * qPrinc.value);
                        strTerms.push(gQ.toFixed(2) + '*' + qPrinc.name);

                        vars_.forEach(function(qSec) {
                            if (qSec === qPrinc) return;
                            var metaQs = getMeta(qSec.type);
                            var factor = gQ * metaQs.nbr.psi0;
                            valTerms.push(factor * qSec.value);
                            strTerms.push(factor.toFixed(2) + '*' + qSec.name);
                        });

                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'ELU (Princ: ' + qPrinc.name + ')',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0)
                            });
                        }
                    });
                } else {
                    var valTerms = [];
                    var strTerms = [];
                    permSet.forEach(function(pd) {
                        valTerms.push(pd.factor * pd.load.value);
                        strTerms.push(pd.factor.toFixed(2) + '*' + pd.load.name);
                    });
                    if (valTerms.length > 0) {
                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'ELU (Apenas Permanentes)',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0)
                            });
                        }
                    }
                }
            });

            // ELS Quase-Permanente
            var qpVals = perms.map(function(g) { return 1.0 * g.value; });
            var qpStrs = perms.map(function(g) { return '1.00*' + g.name; });
            vars_.forEach(function(q) {
                var psi2 = getMeta(q.type).nbr.psi2;
                qpVals.push(psi2 * q.value);
                qpStrs.push(psi2.toFixed(2) + '*' + q.name);
            });
            var qpForm = qpStrs.join(' + ');
            if (!seen.els_qp[qpForm]) {
                seen.els_qp[qpForm] = true;
                combinations.els_qp.push({
                    title: 'ELS - Quase-Permanente',
                    formula: qpForm,
                    result: qpVals.reduce(function(a, b) { return a + b; }, 0)
                });
            }

            // ELS Frequente & Rara
            if (vars_.length > 0) {
                vars_.forEach(function(qPrinc) {
                    var fVals = perms.map(function(g) { return 1.0 * g.value; });
                    var fStrs = perms.map(function(g) { return '1.00*' + g.name; });
                    var rVals = fVals.slice();
                    var rStrs = fStrs.slice();

                    var metaQp = getMeta(qPrinc.type);
                    fVals.push(metaQp.nbr.psi1 * qPrinc.value);
                    fStrs.push(metaQp.nbr.psi1.toFixed(2) + '*' + qPrinc.name);

                    rVals.push(1.0 * qPrinc.value);
                    rStrs.push('1.00*' + qPrinc.name);

                    vars_.forEach(function(qSec) {
                        if (qSec === qPrinc) return;
                        var metaQs = getMeta(qSec.type);
                        fVals.push(metaQs.nbr.psi2 * qSec.value);
                        fStrs.push(metaQs.nbr.psi2.toFixed(2) + '*' + qSec.name);

                        rVals.push(metaQs.nbr.psi1 * qSec.value);
                        rStrs.push(metaQs.nbr.psi1.toFixed(2) + '*' + qSec.name);
                    });

                    var fForm = fStrs.join(' + ');
                    if (!seen.els_freq[fForm]) {
                        seen.els_freq[fForm] = true;
                        combinations.els_freq.push({
                            title: 'ELS - Frequente (Princ: ' + qPrinc.name + ')',
                            formula: fForm,
                            result: fVals.reduce(function(a, b) { return a + b; }, 0)
                        });
                    }

                    var rForm = rStrs.join(' + ');
                    if (!seen.els_rara[rForm]) {
                        seen.els_rara[rForm] = true;
                        combinations.els_rara.push({
                            title: 'ELS - Rara (Princ: ' + qPrinc.name + ')',
                            formula: rForm,
                            result: rVals.reduce(function(a, b) { return a + b; }, 0)
                        });
                    }
                });
            }
        });

        return { combinations: combinations };
    }

    function calcEurocode(validSubsets, method) {
        var combinations = { elu: [], els_rara: [], els_freq: [], els_qp: [] };
        var seen = { elu: {}, els_rara: {}, els_freq: {}, els_qp: {} };
        var isEqu = method && method.includes('EQU');

        var gammaGunfav = isEqu ? 1.10 : 1.35;
        var gammaGfav = isEqu ? 0.90 : 1.00;
        var gammaQ = 1.50;

        validSubsets.forEach(function(loadSet) {
            var perms = loadSet.filter(function(l) { return !getMeta(l.type).isVariable; });
            var vars_ = loadSet.filter(function(l) { return getMeta(l.type).isVariable; });

            var permSets = [[]];
            perms.forEach(function(p) {
                var newSets = [];
                permSets.forEach(function(ex) {
                    newSets.push(ex.concat([{ load: p, factor: gammaGunfav }]));
                    if (gammaGfav !== gammaGunfav) {
                        newSets.push(ex.concat([{ load: p, factor: gammaGfav }]));
                    }
                });
                permSets = newSets;
            });

            // ELU
            permSets.forEach(function(permSet) {
                if (vars_.length > 0) {
                    vars_.forEach(function(qPrinc) {
                        var valTerms = [];
                        var strTerms = [];
                        permSet.forEach(function(pd) {
                            valTerms.push(pd.factor * pd.load.value);
                            strTerms.push(pd.factor.toFixed(2) + '*' + pd.load.name);
                        });

                        valTerms.push(gammaQ * qPrinc.value);
                        strTerms.push(gammaQ.toFixed(2) + '*' + qPrinc.name);

                        vars_.forEach(function(qSec) {
                            if (qSec === qPrinc) return;
                            var psi0 = getMeta(qSec.type).ec.psi0;
                            var f = gammaQ * psi0;
                            valTerms.push(f * qSec.value);
                            strTerms.push(f.toFixed(2) + '*' + qSec.name);
                        });

                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'EC-ELU (Q_princ: ' + qPrinc.name + ')',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0)
                            });
                        }
                    });
                } else {
                    var valTerms = [];
                    var strTerms = [];
                    permSet.forEach(function(pd) {
                        valTerms.push(pd.factor * pd.load.value);
                        strTerms.push(pd.factor.toFixed(2) + '*' + pd.load.name);
                    });
                    if (valTerms.length > 0) {
                        var form = strTerms.join(' + ');
                        if (!seen.elu[form]) {
                            seen.elu[form] = true;
                            combinations.elu.push({
                                title: 'EC-ELU (Permanentes)',
                                formula: form,
                                result: valTerms.reduce(function(a, b) { return a + b; }, 0)
                            });
                        }
                    }
                }
            });

            // ELS Quase-Permanente
            var qpVals = perms.map(function(g) { return 1.0 * g.value; });
            var qpStrs = perms.map(function(g) { return '1.00*' + g.name; });
            vars_.forEach(function(q) {
                var psi2 = getMeta(q.type).ec.psi2;
                qpVals.push(psi2 * q.value);
                qpStrs.push(psi2.toFixed(2) + '*' + q.name);
            });
            var qpForm = qpStrs.join(' + ');
            if (!seen.els_qp[qpForm]) {
                seen.els_qp[qpForm] = true;
                combinations.els_qp.push({
                    title: 'EC-ELS Quase-Permanente',
                    formula: qpForm,
                    result: qpVals.reduce(function(a, b) { return a + b; }, 0)
                });
            }

            // ELS Característica e Frequente
            if (vars_.length > 0) {
                vars_.forEach(function(qPrinc) {
                    var fVals = perms.map(function(g) { return 1.0 * g.value; });
                    var fStrs = perms.map(function(g) { return '1.00*' + g.name; });
                    var cVals = fVals.slice();
                    var cStrs = fStrs.slice();

                    var metaQp = getMeta(qPrinc.type);
                    fVals.push(metaQp.ec.psi1 * qPrinc.value);
                    fStrs.push(metaQp.ec.psi1.toFixed(2) + '*' + qPrinc.name);

                    cVals.push(1.0 * qPrinc.value);
                    cStrs.push('1.00*' + qPrinc.name);

                    vars_.forEach(function(qSec) {
                        if (qSec === qPrinc) return;
                        var metaQs = getMeta(qSec.type);
                        fVals.push(metaQs.ec.psi2 * qSec.value);
                        fStrs.push(metaQs.ec.psi2.toFixed(2) + '*' + qSec.name);

                        cVals.push(metaQs.ec.psi0 * qSec.value);
                        cStrs.push(metaQs.ec.psi0.toFixed(2) + '*' + qSec.name);
                    });

                    var fForm = fStrs.join(' + ');
                    if (!seen.els_freq[fForm]) {
                        seen.els_freq[fForm] = true;
                        combinations.els_freq.push({
                            title: 'EC-ELS Frequente (Q1: ' + qPrinc.name + ')',
                            formula: fForm,
                            result: fVals.reduce(function(a, b) { return a + b; }, 0)
                        });
                    }

                    var cForm = cStrs.join(' + ');
                    if (!seen.els_rara[cForm]) {
                        seen.els_rara[cForm] = true;
                        combinations.els_rara.push({
                            title: 'EC-ELS Característica (Q1: ' + qPrinc.name + ')',
                            formula: cForm,
                            result: cVals.reduce(function(a, b) { return a + b; }, 0)
                        });
                    }
                });
            }
        });

        return { combinations: combinations };
    }

    function calcASCE(validSubsets, method) {
        var isASD = method && method.includes('ASD');
        var combinations = { elu: [], els_rara: [], els_freq: [], els_qp: [] };
        var seen = {};

        validSubsets.forEach(function(loadSet) {
            var byType = {};
            loadSet.forEach(function(l) {
                var meta = getMeta(l.type);
                var atype = meta.asce_type || 'D';
                if (!byType[atype]) byType[atype] = [];
                byType[atype].push(l);
            });

            function addCombo(factors, title) {
                var valTerms = [];
                var strTerms = [];
                Object.keys(factors).forEach(function(atype) {
                    var f = factors[atype];
                    if (f === 0 || !byType[atype]) return;
                    byType[atype].forEach(function(l) {
                        valTerms.push(f * l.value);
                        strTerms.push(f.toFixed(2) + '*' + l.name);
                    });
                });

                if (valTerms.length > 0) {
                    var form = strTerms.join(' + ');
                    if (!seen[form]) {
                        seen[form] = true;
                        var target = isASD ? 'els_rara' : 'elu';
                        combinations[target].push({
                            title: title,
                            formula: form,
                            result: valTerms.reduce(function(a, b) { return a + b; }, 0)
                        });
                    }
                }
            }

            if (!isASD) {
                addCombo({ D: 1.4, F: 1.4 }, 'ASCE LRFD 1 (1.4D+1.4F)');
                addCombo({ D: 1.2, L: 1.6, Lr: 0.5, S: 0.5, R: 0.5, H: 1.6, F: 1.2 }, 'ASCE LRFD 2 (1.2D+1.6L+1.6H+1.2F)');
                addCombo({ D: 1.2, Lr: 1.6, S: 1.6, R: 1.6, L: 1.0, H: 1.6, F: 1.2 }, 'ASCE LRFD 3 (1.2D+1.6Roof+L+1.6H+1.2F)');
                addCombo({ D: 1.2, W: 1.0, L: 1.0, Lr: 0.5, S: 0.5, R: 0.5, H: 1.6, F: 1.2 }, 'ASCE LRFD 4 (1.2D+1.0W+L+1.6H+1.2F)');
                addCombo({ D: 1.2, E: 1.0, L: 1.0, S: 0.2, H: 1.6, F: 1.2 }, 'ASCE LRFD 5 (1.2D+1.0E+L+1.6H+1.2F)');
                addCombo({ D: 0.9, W: 1.0, H: 1.6, F: 1.2 }, 'ASCE LRFD 6 (0.9D+1.0W+1.6H+1.2F)');
                addCombo({ D: 0.9, E: 1.0, H: 1.6, F: 1.2 }, 'ASCE LRFD 7 (0.9D+1.0E+1.6H+1.2F)');
                addCombo({ D: 0.9, H: 1.6, F: 1.2 }, 'ASCE LRFD 8 (0.9D+1.6H+1.2F)');
                addCombo({ D: 0.9 }, 'ASCE LRFD 9 (0.9D Alívio)');
            } else {
                addCombo({ D: 1.0, F: 1.0 }, 'ASCE ASD 1 (D+F)');
                addCombo({ D: 1.0, L: 1.0, H: 1.0, F: 1.0 }, 'ASCE ASD 2 (D+L+H+F)');
                addCombo({ D: 1.0, Lr: 1.0, S: 1.0, R: 1.0, H: 1.0, F: 1.0 }, 'ASCE ASD 3 (D+Roof+H+F)');
                addCombo({ D: 1.0, L: 0.75, Lr: 0.75, S: 0.75, R: 0.75, H: 1.0, F: 1.0 }, 'ASCE ASD 4 (D+0.75L+0.75Roof+H+F)');
                addCombo({ D: 1.0, W: 0.6, H: 1.0, F: 1.0 }, 'ASCE ASD 5 (D+0.6W+H+F)');
                addCombo({ D: 1.0, L: 0.75, W: 0.45, Lr: 0.75, S: 0.75, R: 0.75, H: 1.0, F: 1.0 }, 'ASCE ASD 6 (D+0.75L+0.45W+H+F)');
                addCombo({ D: 0.6, W: 0.6, H: 1.0, F: 1.0 }, 'ASCE ASD 7 (0.6D+0.6W+H+F)');
                addCombo({ D: 0.6, H: 1.0, F: 1.0 }, 'ASCE ASD 8 (0.6D+H+F)');
                addCombo({ D: 0.6 }, 'ASCE ASD 9 (0.6D Alívio)');
            }
        });

        return { combinations: combinations };
    }

    return { calculate: calculate };
})();

async function handleGenerateCombinations() {
    var userLoads = gatherLoads();
    if (userLoads.length === 0) {
        document.getElementById('report-output').innerHTML = '';
        return;
    }

    var stdSelect = document.getElementById('standard-select');
    var methodSelect = document.getElementById('method-select');
    currentStandard = stdSelect ? stdSelect.value : 'NBR 8681';
    currentMethod = methodSelect ? methodSelect.value : 'ELU_NORMAL';

    var payload = {
        loads: userLoads,
        standard: currentStandard,
        method: currentMethod
    };

    var result = null;
    try {
        if (window.eel && window.eel.calculate_universal_combinations) {
            result = await window.eel.calculate_universal_combinations(payload)();
        } else if (window.eel && window.eel.calculate_nbr_combinations) {
            result = await window.eel.calculate_nbr_combinations(payload)();
        }
    } catch (e) {
        console.warn("Eel calculation failed, using local universal solver fallback.", e);
    }

    if (!result || !result.combinations) {
        result = universalComboCalculator.calculate(userLoads, currentStandard, currentMethod);
    }

    currentCombinationsData = result.combinations;
    updateEnvelopesKPI(result.combinations);
    renderCombinationsReport(result.combinations);
}

function updateEnvelopesKPI(combos) {
    var maxElu = -Infinity;
    var minElu = Infinity;
    var maxEluTitle = '--';
    var minEluTitle = '--';

    var eluList = combos.elu || [];
    // If ASD mode, results might be in els_rara
    if (eluList.length === 0 && (combos.els_rara || []).length > 0) {
        eluList = combos.els_rara;
    }

    eluList.forEach(function(c) {
        if (c.result > maxElu) {
            maxElu = c.result;
            maxEluTitle = c.title;
        }
        if (c.result < minElu) {
            minElu = c.result;
            minEluTitle = c.title;
        }
    });

    if (eluList.length > 0 && maxElu !== -Infinity) {
        document.getElementById('kpi-max-elu').textContent = maxElu.toFixed(2);
        document.getElementById('kpi-max-elu-comb').textContent = maxEluTitle;
        document.getElementById('kpi-min-elu').textContent = minElu.toFixed(2);
        document.getElementById('kpi-min-elu-comb').textContent = minEluTitle;
    } else {
        document.getElementById('kpi-max-elu').textContent = '0.00';
        document.getElementById('kpi-min-elu').textContent = '0.00';
    }

    // ELS Rara / Característica
    var maxRara = -Infinity;
    (combos.els_rara || []).forEach(function(c) {
        if (c.result > maxRara) maxRara = c.result;
    });
    if (maxRara !== -Infinity) {
        document.getElementById('kpi-els-rara').textContent = maxRara.toFixed(2);
    } else {
        document.getElementById('kpi-els-rara').textContent = '0.00';
    }

    // ELS QP
    var maxQp = -Infinity;
    (combos.els_qp || []).forEach(function(c) {
        if (c.result > maxQp) maxQp = c.result;
    });
    if (maxQp !== -Infinity) {
        document.getElementById('kpi-els-qp').textContent = maxQp.toFixed(2);
    } else {
        document.getElementById('kpi-els-qp').textContent = '0.00';
    }
}

function renderCombinationsReport(combos) {
    var container = document.getElementById('report-output');
    if (!container) return;

    var filterVal = document.getElementById('combo-filter-select')?.value || 'ALL';
    var userLoads = gatherLoads();
    var std = currentStandard || 'NBR 8681';
    var method = currentMethod || 'ELU_NORMAL';
    var reportDate = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    var sections = [
        { key: 'elu', title: 'Combinações Últimas (ELU / LRFD / STR-GEO)', badge: 'ELU' },
        { key: 'els_rara', title: 'Combinações de Serviço Raras / Características / ASD', badge: 'ELS Rara' },
        { key: 'els_freq', title: 'Combinações de Serviço Frequentes', badge: 'ELS Freq' },
        { key: 'els_qp', title: 'Combinações de Serviço Quase-Permanentes', badge: 'ELS QP' }
    ];

    // 1. Tabela de Inputs e Carregamentos
    var inputsRows = userLoads.map(function(l, idx) {
        var meta = getMeta(l.type);
        var nat = meta.isVariable ? 'Variável (Q)' : 'Permanente (G)';
        var grpText = l.group ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">${l.group} (XOR)</span>` : '<span class="text-gray-400 text-[11px]">-</span>';
        var reqText = l.requires ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">Requer: ${l.requires} (AND)</span>` : '<span class="text-gray-400 text-[11px]">-</span>';
        
        var coefInfo = '';
        if (std.includes('ASCE')) {
            coefInfo = `Tipo ASCE: ${meta.asce_type || 'D'}`;
        } else if (std.includes('Eurocode')) {
            coefInfo = meta.isVariable ? `&gamma;<sub>Q</sub>=1.50, &psi;<sub>0</sub>=${meta.ec.psi0}` : `&gamma;<sub>G</sub>=1.35/1.00`;
        } else {
            coefInfo = meta.isVariable ? `&gamma;<sub>q</sub>=1.40, &psi;<sub>0</sub>=${meta.nbr.psi0}` : `&gamma;<sub>g</sub>=1.35-1.40/1.00`;
        }

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/40 border-b border-gray-100 dark:border-gray-700/80 text-xs">
                <td class="p-2.5 font-bold text-gray-500 dark:text-gray-400">${idx + 1}</td>
                <td class="p-2.5 font-semibold text-gray-900 dark:text-gray-100">${meta.icon || '📌'} ${l.name}</td>
                <td class="p-2.5 text-gray-600 dark:text-gray-300">${l.type}</td>
                <td class="p-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">${l.value.toFixed(2)}</td>
                <td class="p-2.5 text-center text-[11px] text-gray-600 dark:text-gray-300 font-medium">${nat}</td>
                <td class="p-2.5 text-center">${grpText}</td>
                <td class="p-2.5 text-center">${reqText}</td>
                <td class="p-2.5 text-gray-500 dark:text-gray-400 text-[11px]">${coefInfo}</td>
            </tr>
        `;
    }).join('');

    // 2. Considerações e Regras Ativas
    var rulesSummaryHtml = document.getElementById('active-rules-summary')?.innerHTML || '';
    if (!rulesSummaryHtml || rulesSummaryHtml.includes('Nenhuma regra')) {
        rulesSummaryHtml = '<span class="text-xs text-gray-500 italic">Todas as ações elegíveis atuarão conforme as permutações universais da norma selecionada.</span>';
    }

    var maxEluVal = document.getElementById('kpi-max-elu')?.textContent || '0.00';
    var maxEluComb = document.getElementById('kpi-max-elu-comb')?.textContent || '--';
    var minEluVal = document.getElementById('kpi-min-elu')?.textContent || '0.00';
    var minEluComb = document.getElementById('kpi-min-elu-comb')?.textContent || '--';
    var maxRaraVal = document.getElementById('kpi-els-rara')?.textContent || '0.00';
    var maxQpVal = document.getElementById('kpi-els-qp')?.textContent || '0.00';

    // 3. Montar Seções de Combinações Filtradas
    var comboSectionsHtml = '';
    sections.forEach(function(sec) {
        var list = combos[sec.key] || [];
        if (list.length === 0) return;

        var filteredList = list.filter(function(item) {
            if (filterVal === 'ALL') return true;
            var text = (item.title + ' ' + item.formula + ' ' + (item.category || '') + ' ' + (item.limit_state || '')).toLowerCase();
            if (filterVal === 'Tombamento') {
                return text.includes('tomb') || text.includes('equ');
            }
            if (filterVal === 'Deslizamento') {
                return text.includes('desliz') || text.includes('sli');
            }
            if (filterVal === 'Capacidade') {
                return text.includes('capacidade') || text.includes('str') || text.includes('recalque') || text.includes('quase-permanente');
            }
            return text.includes(filterVal.toLowerCase());
        });

        if (filteredList.length === 0 && filterVal !== 'ALL') return;

        var tableRows = filteredList.map(function(item, idx) {
            var isMax = maxEluVal === item.result.toFixed(2);
            var isMin = minEluVal === item.result.toFixed(2);
            var badgeExtremo = isMax 
                ? '<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-500 border border-rose-500/30">MÁX CRÍTICO</span>' 
                : (isMin ? '<span class="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-500 border border-blue-500/30">MÍN ALÍVIO</span>' : '');

            var geoBadge = '';
            if (item.category === 'tombamento' || (item.title && item.title.includes('Tombamento'))) {
                geoBadge = '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-400/40">⚖️ Tombamento</span>';
            } else if (item.category === 'deslizamento' || (item.title && item.title.includes('Deslizamento'))) {
                geoBadge = '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-400/40">🛷 Deslizamento</span>';
            } else if (item.category === 'capacidade_carga' || (item.title && (item.title.includes('Capacidade') || item.title.includes('Tensão')))) {
                geoBadge = '<span class="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-400/40">🏛️ Tensão Solo</span>';
            }

            var critInfo = item.criterion ? `<div class="text-[10px] text-gray-500 dark:text-gray-400 font-normal mt-0.5 italic">Critério: ${item.criterion}</div>` : '';

            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors border-b border-gray-100 dark:border-gray-700/80 text-xs">
                    <td class="p-2.5 font-bold w-12 text-gray-500 dark:text-gray-400">${idx + 1}</td>
                    <td class="p-2.5 font-semibold text-gray-900 dark:text-gray-100">${item.title} ${geoBadge} ${badgeExtremo}${critInfo}</td>
                    <td class="p-2.5 font-mono text-gray-700 dark:text-gray-300">${item.formula}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400 text-sm">${item.result.toFixed(2)}</td>
                </tr>
            `;
        }).join('');

        comboSectionsHtml += `
            <div class="report-section mt-6 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-xs">
                <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-900/80 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700/80">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-2">
                        <span>🏷️</span> ${sec.title}
                    </h3>
                    <span class="text-xs bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                        ${filteredList.length} combinações
                    </span>
                </div>
                <div class="overflow-x-auto max-h-80 overflow-y-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 text-xs sticky top-0 shadow-xs">
                            <tr>
                                <th class="p-2.5 w-12 font-bold">#</th>
                                <th class="p-2.5 font-bold">Identificação da Combinação</th>
                                <th class="p-2.5 font-bold">Fórmula Analítica Ponderada</th>
                                <th class="p-2.5 text-right font-bold">Valor (kN / kNm)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    var reportHtml = `
        <div id="combinacoes-official-report" class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-6">
            
            <!-- Barra de Ações e Exportação do Relatório -->
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-3.5 gap-3 print-hidden">
                <div class="flex items-center gap-2">
                    <span class="text-xl">📑</span>
                    <div>
                        <h2 class="text-sm font-extrabold text-gray-900 dark:text-white uppercase tracking-wider">
                            Relatório Técnico de Combinações de Ações
                        </h2>
                        <span class="text-xs text-gray-500 dark:text-gray-400">Emissão formal para memória de cálculo e memorial descritivo</span>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    <button type="button" onclick="handleCopy('combinacoes-official-report')" class="bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 text-xs font-semibold py-1.5 px-3 rounded-lg border border-gray-300 dark:border-gray-600 transition flex items-center gap-1" title="Copiar relatório formatado">
                        <span>📋</span> Copiar
                    </button>
                    <button type="button" onclick="handleDownloadWord('combinacoes-official-report', 'Relatorio_Combinacoes_${std.replace(/[\s\/\\]/g, '_')}.doc')" class="bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-semibold py-1.5 px-3 rounded-lg border border-indigo-200 dark:border-indigo-800 transition flex items-center gap-1" title="Exportar para Microsoft Word (.doc)">
                        <span>📄</span> Word
                    </button>
                    <button type="button" onclick="handleDownloadPdf('combinacoes-official-report', 'Relatorio_Combinacoes_${std.replace(/[\s\/\\]/g, '_')}.pdf')" class="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold py-1.5 px-3 rounded-lg border border-rose-200 dark:border-rose-800 transition flex items-center gap-1" title="Exportar para PDF oficial diagramado">
                        <span>📑</span> PDF
                    </button>
                    <button type="button" onclick="exportCombinationsCSV()" class="bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 text-xs font-semibold py-1.5 px-3 rounded-lg border border-emerald-200 dark:border-emerald-800 transition flex items-center gap-1" title="Baixar planilha CSV">
                        <span>📊</span> CSV
                    </button>
                    <button type="button" onclick="window.print()" class="bg-gray-800 hover:bg-black text-white dark:bg-gray-100 dark:hover:bg-white dark:text-gray-900 text-xs font-semibold py-1.5 px-3 rounded-lg shadow-sm transition flex items-center gap-1" title="Imprimir relatório">
                        <span>🖨️</span> Imprimir
                    </button>
                </div>
            </div>

            <!-- Cabeçalho Técnico / Metadados -->
            <div class="grid grid-cols-1 md:grid-cols-4 gap-3 bg-gray-50 dark:bg-gray-900/70 p-4 rounded-xl border border-gray-200 dark:border-gray-700/80 text-xs shadow-xs">
                <div>
                    <span class="text-gray-500 dark:text-gray-400 block font-medium">Norma de Referência:</span>
                    <span class="font-bold text-gray-900 dark:text-gray-100 text-sm">${std}</span>
                </div>
                <div>
                    <span class="text-gray-500 dark:text-gray-400 block font-medium">Método / Estado Limite:</span>
                    <span class="font-bold text-gray-900 dark:text-gray-100 text-sm">${method}</span>
                </div>
                <div>
                    <span class="text-gray-500 dark:text-gray-400 block font-medium">Data / Emissão:</span>
                    <span class="font-bold text-gray-900 dark:text-gray-100 text-sm">${reportDate}</span>
                </div>
                <div>
                    <span class="text-gray-500 dark:text-gray-400 block font-medium">Ações Ativas:</span>
                    <span class="font-bold text-indigo-600 dark:text-indigo-400 text-sm">${userLoads.length} ações cadastradas</span>
                </div>
            </div>

            <!-- 1. Tabela de Inputs e Ações Carregadas -->
            <div>
                <h3 class="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>1.</span> Dados de Entrada e Ações Solicitantes (Inputs & Loads)
                </h3>
                <div class="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                    <table class="w-full text-left">
                        <thead class="bg-gray-100 dark:bg-gray-900/80 text-gray-700 dark:text-gray-200 text-[11px] font-bold uppercase tracking-wider">
                            <tr>
                                <th class="p-2.5 w-10">#</th>
                                <th class="p-2.5">Ação / Identificação</th>
                                <th class="p-2.5">Origem / Categoria</th>
                                <th class="p-2.5 text-right">Valor Caract. (kN)</th>
                                <th class="p-2.5 text-center">Natureza</th>
                                <th class="p-2.5 text-center">Grupo Exclusivo</th>
                                <th class="p-2.5 text-center">Coexistência</th>
                                <th class="p-2.5">Ponderadores / Fatores</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${inputsRows}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 2. Considerações Normativas e Hipóteses de Projeto -->
            <div class="bg-gray-50 dark:bg-gray-900/70 p-4 rounded-xl border border-gray-200 dark:border-gray-700/80 text-xs space-y-2.5 shadow-xs">
                <h3 class="font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-1.5 text-xs">
                    <span>2.</span> Considerações Normativas & Hipóteses de Projeto
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-gray-600 dark:text-gray-300">
                    <div class="space-y-1.5">
                        <p>• <b class="text-gray-900 dark:text-gray-100">Estados Limites Últimos (ELU / LRFD)</b>: dimensionamento contra perda de equilíbrio, esgotamento da capacidade resistente e instabilidade geotécnica.</p>
                        <p>• <b class="text-gray-900 dark:text-gray-100">Estados Limites de Serviço (ELS / ASD)</b>: verificações de deformações excessivas, fissuração e flechas em serviço de longa duração.</p>
                    </div>
                    <div class="space-y-1.5">
                        <p>• <b class="text-gray-900 dark:text-gray-100">Ponderação de Ações Permanentes</b>: consideração simultânea de esforços favoráveis e desfavoráveis para captura do pior caso de tombamento/alívio.</p>
                        <p>• <b class="text-gray-900 dark:text-gray-100">Ações Variáveis Concorrentes</b>: alternância sistemática de ação variável principal e redução de simultaneidade (&psi;<sub>0</sub> / fatores de acompanhamento).</p>
                    </div>
                </div>
            </div>

            <!-- 3. Regras de Associação Lógica e Condições Geotécnicas -->
            <div class="bg-gray-50 dark:bg-gray-900/70 p-4 rounded-xl border border-gray-200 dark:border-gray-700/80 text-xs space-y-2.5 shadow-xs">
                <h3 class="font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider flex items-center gap-1.5 text-xs">
                    <span>3.</span> Regras de Associação Lógica e Condições Geotécnicas
                </h3>
                <p class="text-gray-600 dark:text-gray-300">
                    O motor aplicou filtragem combinatória estrita para garantir compatibilidade física e geotécnica:
                </p>
                <div class="flex flex-wrap gap-2 pt-1">
                    ${rulesSummaryHtml}
                </div>
            </div>

            <!-- 4. Resumo Executivo das Envoltórias Extremas (Critical Envelopes) -->
            <div>
                <h3 class="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>4.</span> Envoltórias Extremas de Cálculo (Critical Envelopes)
                </h3>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div class="p-3 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl">
                        <span class="text-rose-600 dark:text-rose-400 font-bold block">Envoltória Máx. ELU / LRFD</span>
                        <span class="text-lg font-extrabold text-rose-700 dark:text-rose-300 font-mono">${maxEluVal} kN</span>
                        <span class="text-[11px] text-gray-500 dark:text-gray-400 block truncate mt-0.5">${maxEluComb}</span>
                    </div>
                    <div class="p-3 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <span class="text-blue-600 dark:text-blue-400 font-bold block">Envoltória Mín. ELU / Alívio</span>
                        <span class="text-lg font-extrabold text-blue-700 dark:text-blue-300 font-mono">${minEluVal} kN</span>
                        <span class="text-[11px] text-gray-500 dark:text-gray-400 block truncate mt-0.5">${minEluComb}</span>
                    </div>
                    <div class="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                        <span class="text-emerald-600 dark:text-emerald-400 font-bold block">Máx. ELS Rara / ASD</span>
                        <span class="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 font-mono">${maxRaraVal} kN</span>
                        <span class="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">Tensão Admissível / Fissuração</span>
                    </div>
                    <div class="p-3 bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl">
                        <span class="text-purple-600 dark:text-purple-400 font-bold block">Máx. ELS Quase-Permanente</span>
                        <span class="text-lg font-extrabold text-purple-700 dark:text-purple-300 font-mono">${maxQpVal} kN</span>
                        <span class="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">Fluência / Deformação Diferida</span>
                    </div>
                </div>
            </div>

            <!-- 5. Tabela Completa de Combinações Geradas -->
            <div>
                <h3 class="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>5.</span> Memória de Cálculo Analítica das Combinações
                </h3>
                ${comboSectionsHtml || '<div class="p-6 text-center text-gray-400 italic">Nenhuma combinação gerada para o filtro selecionado.</div>'}
            </div>

            <!-- Rodapé do Relatório -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>Calculadora Estrutural & Geotécnica • Código Unificado de Combinações</span>
                <span>Relatório emitido automaticamente via Antigravity Engine</span>
            </div>
        </div>
    `;

    container.innerHTML = reportHtml;
}

function handleStandardChange() {
    var std = document.getElementById('standard-select')?.value || 'NBR 8681';
    var methodSelect = document.getElementById('method-select');
    if (!methodSelect) return;

    if (std === 'NBR 8681') {
        methodSelect.innerHTML = `
            <option value="ELU_NORMAL" selected>ELU Normal + ELS (Rara, Freq, QP)</option>
            <option value="ELU_ESPECIAL">ELU Especial / Construção</option>
        `;
    } else if (std === 'Eurocode EN 1990') {
        methodSelect.innerHTML = `
            <option value="STR_GEO_B" selected>STR/GEO Set B (Eq. 6.10)</option>
            <option value="STR_GEO_610AB">STR/GEO (Eq. 6.10a / 6.10b)</option>
            <option value="EQU">EQU (Perda de Equilíbrio)</option>
        `;
    } else if (std === 'ASCE 7-16 / 7-22') {
        methodSelect.innerHTML = `
            <option value="LRFD" selected>LRFD (Strength Design)</option>
            <option value="ASD">ASD (Allowable Stress Design)</option>
        `;
    }

    handleGenerateCombinations();
}

function exportCombinationsCSV() {
    if (!currentCombinationsData) {
        alert("Gere as combinações primeiro.");
        return;
    }

    var csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Norma;Estado_Limite;Numero;Titulo;Formula;Resultado\r\n";

    ['elu', 'els_rara', 'els_freq', 'els_qp'].forEach(function(groupKey) {
        var list = currentCombinationsData[groupKey] || [];
        list.forEach(function(item, idx) {
            var formattedResult = item.result.toFixed(2).replace('.', ',');
            var cleanFormula = item.formula.replace(/"/g, '""');
            csvContent += `${currentStandard};${groupKey.toUpperCase()};${idx + 1};"${item.title}";"${cleanFormula}";${formattedResult}\r\n`;
        });
    });

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `combinacoes_${currentStandard.replace(/[\s\/\\]/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('add-load-btn')?.addEventListener('click', function() {
        addLoadRow();
        updateCompanionSelects();
        updateRulesSummary();
    });
    document.getElementById('generate-report-btn')?.addEventListener('click', handleGenerateCombinations);
    document.getElementById('standard-select')?.addEventListener('change', handleStandardChange);
    document.getElementById('method-select')?.addEventListener('change', handleGenerateCombinations);
    document.getElementById('combo-filter-select')?.addEventListener('change', function() {
        if (currentCombinationsData) renderCombinationsReport(currentCombinationsData);
    });

    // Iniciar com o preset Geotécnico solicitado pelo usuário!
    loadComboPreset('muro_arrimo');
});