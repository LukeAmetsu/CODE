let rawData = [];
let dbChart = null;
let isUpdatingExplorer = false;
let pendingUpdate = false;
let rAFPending = false;
let simTimeout = null;

const SHEAR_SESSION_STORAGE_KEY = 'interactive_shear_session_v2';
let isFocusMode = false;
let autoSaveTimeout = null;

const params = {
    C: { val: 0.22, defaultVal: 0.22, min: 0.02, max: 1.5, step: 0.01, symbol: 'C', label: 'Constante C', formula: 'C', keyName: 'param_c_name', descKey: 'param_c_desc', desc: 'Fator de escala de calibração que ajusta o nível médio global de segurança.', locked: false, disabled: false, savedVal: 0.22 },
    alpha: { val: 0.37, defaultVal: 0.37, min: -1.0, max: 1.0, step: 0.01, symbol: 'α', label: 'Size Effect (α)', formula: '(d_dg/d)^α', keyName: 'param_alpha_name', descKey: 'param_alpha_desc', desc: 'Efeito de Escala: perda de resistência ao cortante com o aumento da altura d.', locked: false, disabled: false, savedVal: 0.37 },
    beta: { val: 0.18, defaultVal: 0.18, min: -1.0, max: 1.0, step: 0.01, symbol: 'β', label: 'Taxa Armadura (β)', formula: '(100ρ_w)^β', keyName: 'param_beta_name', descKey: 'param_beta_desc', desc: 'Taxa de armadura longitudinal com fator multiplicativo 100 dentro do expoente: (100·ρ_w)^β (estilo Eurocode 2-23).', locked: false, disabled: false, savedVal: 0.18 },
    gamma: { val: 0.54, defaultVal: 0.54, min: -1.0, max: 1.0, step: 0.01, symbol: 'γ', label: 'Resistência fck (γ)', formula: 'f_ck^γ', keyName: 'param_gamma_name', descKey: 'param_gamma_desc', desc: 'Resistência do concreto à compressão e tração.', locked: false, disabled: false, savedVal: 0.54 },
    delta: { val: -0.24, defaultVal: -0.24, min: -1.5, max: 0.5, step: 0.01, symbol: 'δ', label: 'Vão Cisalhante (δ)', formula: '(a/d)^δ', keyName: 'param_delta_name', descKey: 'param_delta_desc', desc: 'Relação vão/altura útil (a/d): transição biela direta vs mecanismo de viga.', locked: false, disabled: false, savedVal: -0.24 },
    epsilon: { val: 0.90, defaultVal: 0.90, min: 0.0, max: 2.0, step: 0.01, symbol: 'ε', label: 'Largura Alma (ε)', formula: 'b_w^ε', keyName: 'param_epsilon_name', descKey: 'param_epsilon_desc', desc: 'Largura da seção transversal da viga (bw).', locked: false, disabled: false, savedVal: 0.90 },
    zeta: { val: 1.32, defaultVal: 1.32, min: 0.0, max: 2.0, step: 0.01, symbol: 'ζ', label: 'Altura Útil (ζ)', formula: 'd^ζ', keyName: 'param_zeta_name', descKey: 'param_zeta_desc', desc: 'Altura útil geométrica da seção resistente (d).', locked: false, disabled: false, savedVal: 1.32 }
};

function tr(key, fallback = null) {
    if (window.i18n && typeof window.i18n.get === 'function') {
        const val = window.i18n.get(key, fallback);
        if (val && val !== key) return val;
    }
    return fallback !== null ? fallback : key;
}

let currentSubsetKey = 'ALL DATA';
let currentVarKey = 'd (mm)';
let currentFilteredRows = [];
let cachedStaticDatasets = [];
let cachedOtherCurves = {};
let cachedOverallMaxX = 1000;

// Color Palettes for Live Empirical Model (Default: RS2 Electric Cyan)
const LIVE_MODEL_PALETTES = {
    cyan: {
        dark: '34, 211, 238',      // #22d3ee Electric Cyan (RS2)
        light: '2, 132, 199',       // #0284c7 Sky/Cyan
        hex: '#22d3ee',
        name: 'Ciano Elétrico (RS2)'
    },
    purple: {
        dark: '192, 132, 252',     // #c084fc Vibrant Violet
        light: '147, 51, 234',      // #9333ea Purple
        hex: '#c084fc',
        name: 'Violeta Neon'
    },
    amber: {
        dark: '251, 191, 36',      // #fbbf24 Bright Gold
        light: '217, 119, 6',       // #d97706 Amber
        hex: '#fbbf24',
        name: 'Dourado / Âmbar'
    },
    emerald: {
        dark: '52, 211, 153',      // #34d399 Emerald
        light: '5, 150, 105',       // #059669 Emerald
        hex: '#34d399',
        name: 'Verde Esmeralda'
    }
};

let currentLiveModelColorKey = localStorage.getItem('interactive_shear_live_color') || 'cyan';

function getLiveModelColor(isDark = false) {
    const pal = LIVE_MODEL_PALETTES[currentLiveModelColorKey] || LIVE_MODEL_PALETTES.cyan;
    return isDark ? pal.dark : pal.light;
}

function setLiveModelColor(colorKey) {
    if (!LIVE_MODEL_PALETTES[colorKey]) return;
    currentLiveModelColorKey = colorKey;
    try {
        localStorage.setItem('interactive_shear_live_color', colorKey);
    } catch (e) {}
    updateLiveModelColorUI();
    if (dbChart) {
        updateDatabaseChart();
    }
    showToast(`Cor do Modelo Empírico: ${LIVE_MODEL_PALETTES[colorKey].name}`, 'info');
}

function updateLiveModelColorUI() {
    const pal = LIVE_MODEL_PALETTES[currentLiveModelColorKey] || LIVE_MODEL_PALETTES.cyan;
    const titleEl = document.getElementById('lblLiveModelText');
    if (titleEl) {
        titleEl.style.color = pal.hex;
    }
    const mathBox = document.getElementById('mathEquation');
    if (mathBox) {
        mathBox.style.color = pal.hex;
    }
    Object.keys(LIVE_MODEL_PALETTES).forEach(k => {
        const btn = document.getElementById(`swatch_${k}`);
        if (btn) {
            if (k === currentLiveModelColorKey) {
                btn.className = 'w-4 h-4 rounded-full transition-transform scale-110 ring-2 ring-white ring-offset-1 ring-offset-gray-900 shadow-sm cursor-pointer';
            } else {
                btn.className = 'w-3.5 h-3.5 rounded-full transition-transform hover:scale-125 opacity-60 hover:opacity-100 cursor-pointer';
            }
        }
    });
}
window.setLiveModelColor = setLiveModelColor;

// Toast Notifications
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bgClass = type === 'success' 
        ? 'bg-emerald-600 text-white shadow-emerald-900/40' 
        : (type === 'error' ? 'bg-red-600 text-white shadow-red-900/40' : 'bg-gray-800 text-gray-100 border border-gray-700 shadow-gray-900/40');
    toast.className = `${bgClass} px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ')}</span> <span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    });
    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

// Indicator for auto-saved changes
function showSavedIndicator() {
    const ind = document.getElementById('autoSaveIndicator');
    if (!ind) return;
    ind.classList.remove('hidden');
    clearTimeout(ind._fadeTimer);
    ind._fadeTimer = setTimeout(() => {
        ind.classList.add('hidden');
    }, 2200);
}

// Persist Session State to localStorage (Request 1)
function saveSessionState() {
    try {
        const state = {
            params: {},
            targetSafety: 1.0,
            currentVarKey: currentVarKey,
            currentSubsetKey: currentSubsetKey,
            selectedCodes: [],
            timestamp: Date.now()
        };

        Object.keys(params).forEach(k => {
            state.params[k] = {
                val: params[k].val,
                locked: !!params[k].locked,
                disabled: !!params[k].disabled,
                savedVal: params[k].savedVal
            };
        });

        const inpSafety = document.getElementById('inpTargetSafety');
        if (inpSafety && !isNaN(parseFloat(inpSafety.value))) {
            state.targetSafety = parseFloat(inpSafety.value);
        }

        const varEl = document.getElementById('varSelect');
        if (varEl) state.currentVarKey = varEl.value;

        const subEl = document.getElementById('subsetSelect');
        if (subEl) state.currentSubsetKey = subEl.value;

        document.querySelectorAll('.design-code-checkbox:checked').forEach(cb => {
            state.selectedCodes.push(cb.value);
        });

        const critEl = document.querySelector('input[name="optCriterion"]:checked');
        if (critEl) state.optCriterion = critEl.value;

        localStorage.setItem(SHEAR_SESSION_STORAGE_KEY, JSON.stringify(state));
        showSavedIndicator();
    } catch (e) {
        console.warn("Could not save session state:", e);
    }
}

function triggerAutoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(saveSessionState, 350);
}

function saveSessionStateManually() {
    saveSessionState();
    showToast(tr('session_saved_toast', 'Sessão salva com sucesso!'), 'success');
}

function loadSessionState() {
    try {
        const raw = localStorage.getItem(SHEAR_SESSION_STORAGE_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);
        if (!state) return false;

        // Restore params
        if (state.params && typeof state.params === 'object') {
            Object.keys(state.params).forEach(k => {
                if (params[k]) {
                    if (typeof state.params[k].val === 'number' && !isNaN(state.params[k].val)) {
                        params[k].val = state.params[k].val;
                    }
                    if (typeof state.params[k].locked === 'boolean') {
                        params[k].locked = state.params[k].locked;
                    }
                    if (typeof state.params[k].disabled === 'boolean') {
                        params[k].disabled = state.params[k].disabled;
                    }
                    if (typeof state.params[k].savedVal === 'number') {
                        params[k].savedVal = state.params[k].savedVal;
                    }
                }
            });
        }

        // Restore target safety
        if (typeof state.targetSafety === 'number' && !isNaN(state.targetSafety)) {
            const inp = document.getElementById('inpTargetSafety');
            if (inp) inp.value = state.targetSafety.toFixed(2);
        }

        // Restore variable select
        if (state.currentVarKey) {
            currentVarKey = state.currentVarKey;
            const varEl = document.getElementById('varSelect');
            if (varEl) varEl.value = state.currentVarKey;
        }

        // Restore subset select
        if (state.currentSubsetKey) {
            currentSubsetKey = state.currentSubsetKey;
            const subEl = document.getElementById('subsetSelect');
            if (subEl) subEl.value = state.currentSubsetKey;
        }

        // Restore selected code checkboxes
        if (Array.isArray(state.selectedCodes) && state.selectedCodes.length > 0) {
            document.querySelectorAll('.design-code-checkbox').forEach(cb => {
                cb.checked = state.selectedCodes.includes(cb.value);
            });
        }

        // Restore optimization criterion
        if (state.optCriterion && typeof setOptimizationCriterion === 'function') {
            setOptimizationCriterion(state.optCriterion);
        }

        return true;
    } catch (e) {
        console.warn("Could not load session state:", e);
        return false;
    }
}

function resetToDefaults() {
    const msg = tr('reset_confirm', 'Deseja restaurar todos os parâmetros e opções para os valores padrão?');
    if (!confirm(msg)) return;

    localStorage.removeItem(SHEAR_SESSION_STORAGE_KEY);

    const defaults = {
        C: 0.22,
        alpha: 0.37,
        beta: 0.18,
        gamma: 0.54,
        delta: -0.24,
        epsilon: 0.90,
        zeta: 1.32
    };

    Object.keys(defaults).forEach(k => {
        if (params[k]) {
            params[k].val = defaults[k];
            params[k].locked = false;
            params[k].disabled = false;
            params[k].savedVal = defaults[k];
        }
    });

    const inpSafety = document.getElementById('inpTargetSafety');
    if (inpSafety) inpSafety.value = '1.0';

    const varEl = document.getElementById('varSelect');
    if (varEl) {
        varEl.value = 'd (mm)';
        currentVarKey = 'd (mm)';
    }

    const subEl = document.getElementById('subsetSelect');
    if (subEl) {
        subEl.value = 'ALL DATA';
        currentSubsetKey = 'ALL DATA';
    }

    document.querySelectorAll('.design-code-checkbox').forEach(cb => {
        cb.checked = (cb.value === 'LIVE_MODEL');
    });

    updateSlidersUI();
    updateFilteredRows();
    updateMath();
    updateDatabaseChart();
    if (typeof setOptimizationCriterion === 'function') setOptimizationCriterion('cov');
    showToast(tr('defaults_restored_toast', 'Padrões de fábrica restaurados.'), 'info');
}

// Focus Mode: Expand Chart to Full Screen Width
function toggleFocusMode() {
    isFocusMode = !isFocusMode;
    const sidebar = document.getElementById('sidebarControls');
    const simCol = document.getElementById('similarityCol');
    const chartArea = document.getElementById('chartMainArea');
    const canvasWrap = document.getElementById('canvasWrapper');
    const chartSection = document.getElementById('chartSectionCard');
    const btn = document.getElementById('btnFocusMode');
    const icon = document.getElementById('focusIcon');
    const text = document.getElementById('focusText');

    if (isFocusMode) {
        if (sidebar) sidebar.classList.add('hidden');
        if (simCol) simCol.classList.add('hidden');
        if (chartArea) {
            chartArea.classList.remove('lg:col-span-6', 'xl:col-span-6');
            chartArea.classList.add('lg:col-span-12', 'col-span-12');
        }
        if (canvasWrap) {
            canvasWrap.classList.remove('h-[440px]', 'sm:h-[480px]');
            canvasWrap.classList.add('h-[650px]', 'min-h-[650px]');
        }
        if (chartSection) {
            chartSection.classList.add('ring-2', 'ring-cyan-500/40', 'shadow-xl');
        }
        if (btn) {
            btn.classList.add('bg-cyan-600', 'text-slate-900', 'shadow-md');
            btn.classList.remove('bg-cyan-500/15', 'text-cyan-400');
        }
        if (icon) icon.innerText = '⤓';
        if (text) {
            text.innerText = tr('focus_mode_exit', 'Sair do Modo Isolado');
            text.setAttribute('data-i18n', 'focus_mode_exit');
        }
    } else {
        if (sidebar) sidebar.classList.remove('hidden');
        if (simCol) simCol.classList.remove('hidden');
        if (chartArea) {
            chartArea.classList.remove('lg:col-span-12', 'col-span-12');
            chartArea.classList.add('lg:col-span-6', 'xl:col-span-6');
        }
        if (canvasWrap) {
            canvasWrap.classList.remove('h-[650px]', 'min-h-[650px]');
            canvasWrap.classList.add('h-[440px]', 'sm:h-[480px]');
        }
        if (chartSection) {
            chartSection.classList.remove('ring-2', 'ring-cyan-500/40', 'shadow-xl');
        }
        if (btn) {
            btn.classList.remove('bg-cyan-600', 'text-slate-900', 'shadow-md');
            btn.classList.add('bg-cyan-500/15', 'text-cyan-400');
        }
        if (icon) icon.innerText = '⛶';
        if (text) {
            text.innerText = tr('focus_mode_enter', 'Modo Isolado');
            text.setAttribute('data-i18n', 'focus_mode_enter');
        }
    }

    if (dbChart) {
        setTimeout(() => {
            dbChart.resize();
            dbChart.update('none');
        }, 120);
    }
}

// External Interactive HTML Legend (Request 2: OUTSIDE canvas)
function updateExternalLegend(datasets) {
    const container = document.getElementById('externalChartLegend');
    if (!container || !dbChart || !datasets || datasets.length === 0) return;

    container.innerHTML = '';
    const isDark = document.documentElement.classList.contains('dark');

    // Include curves and the experimental test dataset
    const items = [];
    for (let i = 0; i < datasets.length; i++) {
        const ds = datasets[i];
        items.push({ index: i, dataset: ds });
    }

    if (items.length === 0) {
        container.innerHTML = `<span class="text-xs text-gray-400 italic">${tr('no_curves_selected', 'Nenhuma curva selecionada')}</span>`;
        return;
    }

    items.forEach(({ index, dataset }) => {
        const isVisible = dbChart.isDatasetVisible(index);
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = `external-legend-item px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-2 transition-all cursor-pointer select-none shadow-xs ${
            isVisible 
                ? (isDark ? 'bg-gray-800/90 text-gray-200 border-gray-700 hover:border-gray-500 hover:bg-gray-750' : 'bg-white text-gray-800 border-gray-300 hover:border-gray-400 hover:bg-gray-50')
                : 'opacity-40 line-through bg-gray-900/20 border-dashed border-gray-700 text-gray-500 hover:opacity-70'
        }`;

        // Color indicator
        const marker = document.createElement('span');
        if (dataset.type === 'scatter') {
            marker.className = 'w-2.5 h-2.5 rounded-full inline-block shrink-0';
            marker.style.backgroundColor = isDark ? 'rgba(203, 213, 225, 0.85)' : 'rgba(100, 116, 139, 0.85)';
            marker.style.border = isDark ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid rgba(0, 0, 0, 0.3)';
        } else if (dataset.borderDash && dataset.borderDash.length) {
            marker.className = 'w-4 h-1 rounded-full inline-block shrink-0';
            marker.style.borderTop = `2px dashed ${dataset.borderColor || '#999'}`;
            marker.style.backgroundColor = 'transparent';
            marker.style.height = '0px';
        } else {
            marker.className = 'w-4 h-1 rounded-full inline-block shrink-0';
            marker.style.backgroundColor = dataset.borderColor || '#999';
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'truncate max-w-[280px]';
        textSpan.innerText = dataset.label || `Item ${index}`;
        textSpan.title = dataset.label || '';

        const eyeSpan = document.createElement('span');
        eyeSpan.className = 'text-[10px] text-gray-400 opacity-60 ml-auto';
        eyeSpan.innerText = isVisible ? '👁' : '✕';

        badge.appendChild(marker);
        badge.appendChild(textSpan);
        badge.appendChild(eyeSpan);

        badge.addEventListener('click', (e) => {
            e.preventDefault();
            const currentVis = dbChart.isDatasetVisible(index);
            const nextVis = !currentVis;
            dbChart.setDatasetVisibility(index, nextVis);

            dbChart.update('none');
            updateExternalLegend(dbChart.data.datasets);
        });

        container.appendChild(badge);
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Inject Hub header if needed
    if (typeof injectHeader === 'function') {
        const ph = document.getElementById('header-placeholder');
        if (ph && !ph.querySelector('header')) {
            injectHeader({
                activePage: 'interactive_shear',
                pageTitle: 'Interactive Shear Formula',
                headerPlaceholderId: 'header-placeholder',
                pathPrefix: '../'
            });
        }
    }

    if (window.i18n && typeof window.i18n.initialize === 'function') {
        try {
            await window.i18n.initialize();
        } catch (e) {
            console.warn('i18n init error:', e);
        }
    }

    // Load saved session state from last session (Request 1)
    const sessionRestored = loadSessionState();

    buildSliders();

    try {
        // High-speed load: backend cached pickle loads in ~18ms
        const resAll = await eel.get_all_codes_dataset()();
        if (Array.isArray(resAll) && resAll.length > 0) {
            rawData = resAll;
        } else if (resAll && !resAll.error) {
            rawData = resAll;
        } else {
            console.error("Failed to load ALL DATA:", resAll ? resAll.error : "Empty response");
        }

        preprocessData(rawData);
        updateFilteredRows();

        const loading = document.getElementById('loadingIndicator');
        if (loading) loading.classList.add('hidden');
        const main = document.getElementById('mainContent');
        if (main) main.classList.remove('hidden');

        initDatabaseChart();
        updateMath();
        updateDatabaseChart();

        document.querySelectorAll('.design-code-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                updateDatabaseChart();
                triggerAutoSave();
            });
        });
        
        const varSelect = document.getElementById('varSelect');
        if (varSelect) {
            varSelect.addEventListener('change', () => {
                currentVarKey = varSelect.value;
                updateDatabaseChart();
                triggerAutoSave();
            });
        }
        
        const subsetSelect = document.getElementById('subsetSelect');
        if (subsetSelect) {
            subsetSelect.addEventListener('change', () => {
                updateFilteredRows();
                updateMath();
                updateDatabaseChart();
                triggerAutoSave();
            });
        }

        const inpSafety = document.getElementById('inpTargetSafety');
        if (inpSafety) {
            inpSafety.addEventListener('input', () => {
                triggerAutoSave();
            });
        }

        if (sessionRestored) {
            showToast(tr('session_restored_toast', 'Sessão anterior restaurada com sucesso!'), 'success');
            showSavedIndicator();
        }
        loadBaselineState();
        updateActiveSubsetBadge();
        updateLiveModelColorUI();
    } catch (e) {
        console.error("Failed to load shear dataset: ", e);
    }

    const btnOpt = document.getElementById('btnOptimize');
    if (btnOpt) btnOpt.addEventListener('click', optimizeEquation);
});

// React dynamically to language switch
window.addEventListener('languageChanged', () => {
    buildSliders();
    updateMath();
    updateDatabaseChart();
});
window.addEventListener('pageTranslated', () => {
    buildSliders();
});

function preprocessData(rows) {
    if (!rows || !rows.length) return;
    const len = rows.length;
    for (let i = 0; i < len; i++) {
        const row = rows[i];
        let bd = parseFloat(row['d (mm)']);
        let bbw = parseFloat(row['bw (mm)'] ?? row['b (mm)']);
        if (isNaN(bbw) && !isNaN(parseFloat(row['bw/d ratio'])) && !isNaN(bd)) {
            bbw = parseFloat(row['bw/d ratio']) * bd;
        }
        let brho = parseFloat(row['pw (%)'] ?? (row['rho'] != null ? row['rho'] * 100.0 : NaN));
        let rho = brho > 0.1 ? brho / 100.0 : brho;
        let bfck = parseFloat(row['fck (MPa)'] ?? row['fck_eq']);
        let bVtest_kN = parseFloat(row['Vu (kN)']);
        let bd_dg = parseFloat(row['d_dg']);
        if (isNaN(bd_dg) || bd_dg <= 0) bd_dg = 32.0;

        let ba_d = parseFloat(row['a_d']);
        if (isNaN(ba_d) || ba_d <= 0) {
            let ba_mm = parseFloat(row['a_cs'] ?? (row['a (mm)'] ?? (parseFloat(row['a:M/V (mm)']) * 1000.0)));
            if (!isNaN(ba_mm) && !isNaN(bd) && bd > 0) ba_d = ba_mm / bd;
        }

        let bwd = (bd > 0 && bbw > 0) ? (bbw / bd) : 0;
        let isSlab = (row['B>2D'] === true || row['B>2D'] == 1 || bwd >= 2.0);

        row._d = bd;
        row._bw = bbw;
        row._rho = rho;
        row._fck = bfck;
        row._vu = bVtest_kN;
        row._ddg = bd_dg;
        row._ad = ba_d;
        row._bwd = bwd;
        row._isSlab = isSlab;
        row._valid = (!isNaN(bd) && bd > 0 && !isNaN(rho) && rho > 0
                      && !isNaN(bfck) && bfck > 0 && !isNaN(ba_d) && ba_d > 0
                      && !isNaN(bbw) && bbw > 0 && !isNaN(bVtest_kN) && bVtest_kN > 0);
    }
}

function isRowInSubset(row, subsetKey) {
    if (!row) return false;
    if (row._valid !== undefined && !row._valid) return false;

    if (!subsetKey || subsetKey === 'ALL DATA' || subsetKey === 'all' || subsetKey === '') {
        return row._valid !== undefined ? row._valid : true;
    }

    const bd = row._d !== undefined ? row._d : parseFloat(row['d (mm)']);
    const bbw = row._bw !== undefined ? row._bw : parseFloat(row['bw (mm)'] ?? row['b (mm)']);
    const rho = row._rho !== undefined ? row._rho : (parseFloat(row['pw (%)'] ?? row['rho']) > 0.1 ? parseFloat(row['pw (%)'] ?? row['rho']) / 100.0 : parseFloat(row['pw (%)'] ?? row['rho']));
    const bfck = row._fck !== undefined ? row._fck : parseFloat(row['fck (MPa)'] ?? row['fck_eq']);
    const ba_d = row._ad !== undefined ? row._ad : parseFloat(row['a_d']);
    const bddg = row._ddg !== undefined ? row._ddg : (parseFloat(row['d_dg']) || 32.0);
    const bwd = row._bwd !== undefined ? row._bwd : (bd > 0 && bbw > 0 ? bbw / bd : 0);
    const isSlab = row._isSlab !== undefined ? row._isSlab : (row['B>2D'] === true || row['B>2D'] == 1 || bwd >= 2.0);

    // Slabs subsets
    if (subsetKey === 'slabs_slender_600') {
        return isSlab && bd < 600.0;
    }
    if (subsetKey === 'slabs_slender_400' || subsetKey === 'slabs_slender') {
        return isSlab && bd < 400.0;
    }
    if (subsetKey === 'slabs_thick_600' || subsetKey === 'B>600mm') {
        return bd >= 600.0;
    }
    if (subsetKey === 'slabs_thick_400') {
        return isSlab && bd >= 400.0;
    }
    if (subsetKey === 'slabs_all' || subsetKey === 'B>2D') {
        return isSlab;
    }
    if (subsetKey === 'slabs_wide' || subsetKey === 'B>5D') {
        const b5d = row['B>5D'];
        return bwd >= 5.0 || b5d === true || b5d == 1;
    }

    // Depth subsets
    if (subsetKey === 'members_slender_600' || subsetKey === 'd<600') {
        return bd < 600.0;
    }
    if (subsetKey === 'members_slender_400' || subsetKey === 'd<400') {
        return bd < 400.0;
    }
    if (subsetKey === 'd>400') {
        return bd > 400.0;
    }
    if (subsetKey === 'bw>300') {
        return bbw > 300.0;
    }

    // a/d span subsets
    if (subsetKey === 'members_long_span' || subsetKey === 'members_slender' || subsetKey === 'a_d>2.5') {
        return ba_d >= 2.5;
    }
    if (subsetKey === 'members_short_span' || subsetKey === 'members_short' || subsetKey === 'a_d<2.5') {
        return ba_d > 0 && ba_d < 2.5;
    }

    // Reinforcement & Materials
    if (subsetKey === 'rho_low' || subsetKey === 'rho<1') {
        return rho < 0.01;
    }
    if (subsetKey === 'rho_very_low') {
        return rho < 0.005;
    }
    if (subsetKey === 'rho_high') {
        return rho >= 0.015;
    }
    if (subsetKey === 'fck_high' || subsetKey === 'fck>50') {
        return bfck > 50.0;
    }
    if (subsetKey === 'fck_normal' || subsetKey === 'fck<=50') {
        return bfck <= 50.0;
    }
    if (subsetKey === 'd_dg_large' || subsetKey === 'd_dg>32') {
        return bddg > 32.0;
    }
    if (subsetKey === 'mat_rc') {
        const m = String(row['Member class (inferred)'] || '');
        const src = String(row['Source sheet'] || '');
        return m === 'RC' || (!src.includes('PC') && (!row['Prestressed'] || row['Prestressed'] == 0));
    }
    if (subsetKey === 'mat_pc') {
        const m = String(row['Member class (inferred)'] || '');
        const src = String(row['Source sheet'] || '');
        return m === 'PC' || src.includes('PC') || row['Prestressed'] == 1;
    }

    return true;
}

function updateFilteredRows() {
    const subsetEl = document.getElementById('subsetSelect');
    currentSubsetKey = subsetEl ? subsetEl.value : 'ALL DATA';
    currentFilteredRows = [];
    for (let i = 0; i < rawData.length; i++) {
        let row = rawData[i];
        if (isRowInSubset(row, currentSubsetKey)) {
            currentFilteredRows.push(row);
        }
    }
    updateActiveSubsetBadge();
}

function updateActiveSubsetBadge() {
    const badge = document.getElementById('activeSubsetBadge');
    if (!badge) return;
    const subsetEl = document.getElementById('subsetSelect');
    const opt = subsetEl && subsetEl.selectedIndex >= 0 ? subsetEl.options[subsetEl.selectedIndex] : null;
    const cleanText = opt ? opt.text.split('(')[0].trim() : (currentSubsetKey || 'ALL DATA');
    const count = currentFilteredRows ? currentFilteredRows.length : 0;
    badge.innerText = `${cleanText} (${count})`;
    badge.title = `Otimização Nelder-Mead e Calibração de C serão executadas sobre estas ${count} amostras`;
}

let baselineParams = null;

function computeBaselineModelPoint(row) {
    if (!row._valid || !baselineParams) return null;
    let size_effect = Math.pow(row._ddg / row._d, baselineParams.alpha);
    let vc = baselineParams.C * size_effect
        * Math.pow(100.0 * row._rho, baselineParams.beta)
        * Math.pow(row._fck, baselineParams.gamma)
        * Math.pow(row._ad, baselineParams.delta);
    let V_calc = vc * Math.pow(row._bw, baselineParams.epsilon) * Math.pow(row._d, baselineParams.zeta);
    let V_calc_kN = V_calc / 1000.0;
    if (V_calc_kN <= 0) return null;
    return {
        ratio: row._vu / V_calc_kN,
        d: row._d,
        rho: row._rho,
        fck: row._fck,
        a_d: row._ad,
        bw: row._bw,
        d_dg: row._ddg
    };
}

function pinCurrentModelAsBaseline() {
    const subsetEl = document.getElementById('subsetSelect');
    const opt = subsetEl && subsetEl.selectedIndex >= 0 ? subsetEl.options[subsetEl.selectedIndex] : null;
    const subsetName = opt ? opt.text.split('(')[0].trim() : (currentSubsetKey || 'ALL DATA');

    baselineParams = {
        C: params.C.val,
        alpha: params.alpha.val,
        beta: params.beta.val,
        gamma: params.gamma.val,
        delta: params.delta.val,
        epsilon: params.epsilon.val,
        zeta: params.zeta.val,
        subsetKey: currentSubsetKey,
        subsetName: subsetName,
        timestamp: Date.now()
    };

    try {
        localStorage.setItem('SHEAR_BASELINE_MODEL', JSON.stringify(baselineParams));
    } catch (e) {
        console.warn("Could not save baseline model:", e);
    }

    updateBaselineUI();
    updateDatabaseChart();
    showToast(`Modelo de referência fixado (${subsetName}). Troque o recorte de dados para comparar!`, 'success');
}

function clearBaselineModel() {
    baselineParams = null;
    try {
        localStorage.removeItem('SHEAR_BASELINE_MODEL');
    } catch (e) {}

    updateBaselineUI();
    updateDatabaseChart();
    showToast('Modelo de referência removido.', 'info');
}

function updateBaselineUI() {
    const statusBadge = document.getElementById('baselineStatusBadge');
    const clearBtn = document.getElementById('btnClearBaseline');
    const cbContainer = document.getElementById('baselineCheckboxContainer');
    const cbText = document.getElementById('baselineCheckboxText');
    const cb = document.getElementById('cbBaselineModel');

    if (baselineParams) {
        if (statusBadge) {
            statusBadge.innerText = `Fixado: ${baselineParams.subsetName}`;
            statusBadge.className = "text-[10px] text-amber-400 font-bold";
        }
        if (clearBtn) clearBtn.classList.remove('hidden');
        if (cbContainer) cbContainer.classList.remove('hidden');
        if (cbText) cbText.innerText = `📌 Referência (${baselineParams.subsetName})`;
        if (cb) cb.checked = true;
    } else {
        if (statusBadge) {
            statusBadge.innerText = "Nenhum fixado";
            statusBadge.className = "text-[10px] text-gray-400";
        }
        if (clearBtn) clearBtn.classList.add('hidden');
        if (cbContainer) cbContainer.classList.add('hidden');
        if (cb) cb.checked = false;
    }
}

function loadBaselineState() {
    try {
        const raw = localStorage.getItem('SHEAR_BASELINE_MODEL');
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data && typeof data.C === 'number') {
            baselineParams = data;
            updateBaselineUI();
        }
    } catch (e) {
        console.warn("Could not restore baseline model:", e);
    }
}

function computeLiveModelPoint(row) {
    if (!row._valid) return null;
    let size_effect = params.alpha.disabled ? 1.0 : Math.pow(row._ddg / row._d, params.alpha.val);
    let rho_term = params.beta.disabled ? 1.0 : Math.pow(100.0 * row._rho, params.beta.val);
    let fck_term = params.gamma.disabled ? 1.0 : Math.pow(row._fck, params.gamma.val);
    let ad_term = params.delta.disabled ? 1.0 : Math.pow(row._ad, params.delta.val);
    let c_term = params.C.disabled ? 1.0 : params.C.val;
    let bw_term = params.epsilon.disabled ? 1.0 : Math.pow(row._bw, params.epsilon.val);
    let d_term = params.zeta.disabled ? 1.0 : Math.pow(row._d, params.zeta.val);
    let vc = c_term * size_effect * rho_term * fck_term * ad_term;
    let V_calc = vc * bw_term * d_term;
    let V_calc_kN = V_calc / 1000.0;
    if (V_calc_kN <= 0 || !isFinite(V_calc_kN)) return null;
    return {
        ratio: row._vu / V_calc_kN,
        d: row._d,
        rho: row._rho,
        fck: row._fck,
        a_d: row._ad,
        bw: row._bw,
        d_dg: row._ddg
    };
}

function getRowXValue(row, varKey) {
    if (varKey === 'a_d') return row._ad || null;
    if (varKey === 'd (mm)') return row._d || null;
    if (varKey === 'pw (%)') return (row._rho ? row._rho * 100.0 : null);
    if (varKey === 'fck (MPa)') return row._fck || null;
    if (varKey === 'a:M/V (mm)') {
        let v = parseFloat(row['a_cs'] ?? (row['a (mm)'] ?? (parseFloat(row['a:M/V (mm)']) * 1000.0)));
        return isNaN(v) ? null : v;
    }
    if (varKey === 'bw (mm)') return row._bw || null;
    if (varKey === 'd_dg') return row._ddg || 32.0;
    let fallback = parseFloat(row[varKey]);
    return isNaN(fallback) ? null : fallback;
}

function buildSliders() {
    const container = document.getElementById('slidersContainer');
    if (!container) return;
    container.innerHTML = '';

    Object.keys(params).forEach(key => {
        const p = params[key];
        const row = document.createElement('div');
        row.id = `row_${key}`;

        const labelText = tr(p.keyName, p.label || p.defaultLabel);
        const descText = tr(p.descKey, p.desc || '');

        row.innerHTML = `
            <div class="flex items-center gap-1 min-w-0 flex-grow">
                <!-- Toggle Switch / Button (Activate/Deactivate Variable) -->
                <button type="button" id="btn_toggle_${key}" class="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 border transition-all cursor-pointer" title="Ativar/Desativar variável para simplificar a equação">
                    <span id="ico_toggle_${key}">✓</span>
                </button>
                <!-- Lock Button (Nelder-Mead Optimization) -->
                <button type="button" id="btn_lock_${key}" class="w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 border transition-all cursor-pointer" title="Travar/Destravar na otimização">
                    <span id="ico_lock_${key}">🔓</span>
                </button>
                <div class="flex items-baseline gap-1 min-w-0">
                    <span class="font-black text-cyan-400 font-mono text-xs shrink-0">${p.symbol}</span>
                    <span id="lbl_${key}" class="text-[11px] font-semibold truncate text-gray-200" title="${descText}">${labelText}</span>
                </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <input type="number" id="inp_${key}" value="${p.val.toFixed(3)}" step="${p.step}" 
                    class="exponent-input text-right font-mono font-bold text-xs rounded transition-all focus:outline-none"
                    style="width: 68px !important; min-width: 62px !important; max-width: 74px !important; height: 24px !important; min-height: 24px !important; padding: 1px 4px !important; border: 1.5px solid !important; line-height: 18px !important;"
                    title="${p.formula} = ${p.val.toFixed(3)}">
            </div>
        `;

        container.appendChild(row);

        const inp = document.getElementById(`inp_${key}`);
        const btnLock = document.getElementById(`btn_lock_${key}`);
        const btnToggle = document.getElementById(`btn_toggle_${key}`);

        btnToggle.addEventListener('click', () => {
            toggleVariable(key);
        });

        btnLock.addEventListener('click', () => {
            if (params[key].disabled) return;
            params[key].locked = !params[key].locked;
            updateSliderRowUI(key);
            triggerAutoSave();
        });

        inp.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value);
            if (isNaN(v)) return;
            params[key].val = v;
            scheduleUpdate();
        });

        inp.addEventListener('change', (e) => {
            let v = parseFloat(e.target.value);
            if (isNaN(v)) return;
            params[key].val = v;
            inp.value = v.toFixed(3);
            scheduleUpdate();
            triggerAutoSave();
        });

        inp.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (params[key].disabled) return;
            const delta = e.deltaY < 0 ? (p.step || 0.01) : -(p.step || 0.01);
            let current = parseFloat(inp.value);
            if (isNaN(current)) current = p.val;
            let nextVal = parseFloat((current + delta).toFixed(3));
            p.val = nextVal;
            inp.value = nextVal.toFixed(3);
            scheduleUpdate();
            triggerAutoSave();
        }, { passive: false });

        updateSliderRowUI(key);
    });
}

function updateSliderRowUI(key) {
    const p = params[key];
    const row = document.getElementById(`row_${key}`);
    const btnToggle = document.getElementById(`btn_toggle_${key}`);
    const icoToggle = document.getElementById(`ico_toggle_${key}`);
    const btnLock = document.getElementById(`btn_lock_${key}`);
    const icoLock = document.getElementById(`ico_lock_${key}`);
    const lbl = document.getElementById(`lbl_${key}`);
    const inp = document.getElementById(`inp_${key}`);

    if (!row) return;

    if (p.disabled) {
        // Disabled state: term neutralized in formula
        row.className = 'flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg border transition-all bg-red-950/20 border-red-500/30 border-dashed opacity-80';
        if (btnToggle) {
            btnToggle.className = 'w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 border transition-all cursor-pointer bg-red-500/25 text-red-400 border-red-500/50 hover:bg-red-500/40 shadow-xs';
            btnToggle.title = tr('toggle_tooltip_disabled', 'Variável desativada da equação (termo = 1.0). Clique para reativar');
            if (icoToggle) icoToggle.innerText = '⊘';
        }
        if (btnLock) {
            btnLock.className = 'w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 border transition-all cursor-not-allowed bg-gray-800 text-gray-500 border-gray-700 opacity-40';
            btnLock.disabled = true;
            btnLock.title = tr('lock_tooltip_disabled_var', 'Variável desativada (permanece travada em 0.0)');
            if (icoLock) icoLock.innerText = '🔒';
        }
        if (lbl) {
            lbl.className = 'text-[11px] font-semibold truncate line-through text-gray-500';
            lbl.innerHTML = `${tr(p.keyName, p.label || p.defaultLabel)} <span class="text-[9px] text-red-400 font-mono font-normal no-underline">(off)</span>`;
        }
        if (inp) {
            inp.disabled = true;
            inp.value = (key === 'C' ? '1.000' : '0.000');
            inp.className = 'exponent-input text-right font-mono font-bold text-xs rounded transition-all border-gray-700 text-gray-500 bg-gray-800/60 cursor-not-allowed opacity-60';
        }
    } else {
        // Active state
        if (btnToggle) {
            btnToggle.className = 'w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 border transition-all cursor-pointer bg-cyan-500/15 text-cyan-400 border-cyan-500/40 hover:bg-cyan-500/30 shadow-xs';
            btnToggle.title = tr('toggle_tooltip_active', 'Variável ativa na fórmula. Clique para desativar e simplificar a equação');
            if (icoToggle) icoToggle.innerText = '✓';
        }
        if (btnLock) {
            btnLock.disabled = false;
            if (p.locked) {
                btnLock.className = 'w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 border transition-all cursor-pointer bg-amber-500/20 text-amber-400 border-amber-500/60 shadow-xs';
                btnLock.title = tr('lock_tooltip_locked', 'Coeficiente travado na otimização (Clique para destravar)');
                if (icoLock) icoLock.innerText = '🔒';
            } else {
                btnLock.className = 'w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 border transition-all cursor-pointer bg-[var(--color-bg-secondary)] text-gray-400 border-[var(--color-border-primary)] hover:text-gray-200';
                btnLock.title = tr('lock_tooltip_free', 'Coeficiente livre (Clique para travar)');
                if (icoLock) icoLock.innerText = '🔓';
            }
        }
        if (lbl) {
            lbl.className = `text-[11px] font-semibold truncate ${p.locked ? 'text-amber-400' : 'text-gray-200'}`;
            lbl.innerText = tr(p.keyName, p.label || p.defaultLabel);
        }
        if (inp) {
            inp.disabled = false;
            inp.value = p.val.toFixed(3);
            inp.className = `exponent-input text-right font-mono font-bold text-xs rounded transition-all focus:outline-none ${p.locked ? 'border-amber-500 text-amber-400 bg-amber-500/10' : 'border-gray-600 text-cyan-400 bg-[var(--color-bg-secondary)] focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'}`;
        }
        if (p.locked) {
            row.className = 'flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg border transition-all bg-amber-500/10 border-amber-500/40 shadow-2xs';
        } else {
            row.className = 'flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg border transition-all bg-[var(--color-bg-primary)] border-[var(--color-border-primary)] hover:border-cyan-500/30';
        }
    }
}

function updateLockUI(key) {
    updateSliderRowUI(key);
}

function toggleVariable(key) {
    const p = params[key];
    if (!p) return;
    p.disabled = !p.disabled;
    if (p.disabled) {
        p.savedVal = (p.val !== 0) ? p.val : (p.savedVal ?? p.defaultVal);
        p.val = (key === 'C') ? 1.0 : 0.0;
        p.wasLockedBeforeDisable = p.locked;
        p.locked = true;
    } else {
        p.val = (p.savedVal !== null && p.savedVal !== undefined) ? p.savedVal : p.defaultVal;
        p.locked = p.wasLockedBeforeDisable ?? false;
    }
    updateSliderRowUI(key);
    scheduleUpdate();
    triggerAutoSave();
    showToast(p.disabled 
        ? `Variável ${p.symbol} desativada (simplificada da equação)` 
        : `Variável ${p.symbol} reativada (${p.val.toFixed(3)})`, 
        p.disabled ? 'info' : 'success'
    );
}
window.toggleVariable = toggleVariable;

function quickSimplifyPreset(presetType) {
    if (presetType === 'reset_all') {
        Object.keys(params).forEach(k => {
            const p = params[k];
            p.disabled = false;
            p.val = p.defaultVal;
            p.locked = false;
            p.savedVal = p.defaultVal;
            updateSliderRowUI(k);
        });
        scheduleUpdate();
        triggerAutoSave();
        showToast('Fórmula completa restaurada (padrão Reineck)', 'info');
        return;
    }

    if (presetType === 'no_size_effect') {
        toggleVariable('alpha');
        return;
    }

    if (presetType === 'no_ad') {
        toggleVariable('delta');
        return;
    }

    if (presetType === 'no_rho') {
        toggleVariable('beta');
        return;
    }

    if (presetType === 'std_geometry') {
        params.epsilon.disabled = false;
        params.epsilon.val = 1.000;
        params.epsilon.savedVal = 1.000;
        updateSliderRowUI('epsilon');

        params.zeta.disabled = false;
        params.zeta.val = 1.000;
        params.zeta.savedVal = 1.000;
        updateSliderRowUI('zeta');

        scheduleUpdate();
        triggerAutoSave();
        showToast('Geometria padronizada: bw · d (área nominal)', 'info');
        return;
    }
}
window.quickSimplifyPreset = quickSimplifyPreset;

function updateSlidersUI() {
    Object.keys(params).forEach(key => {
        const p = params[key];
        const inp = document.getElementById(`inp_${key}`);
        if (inp) inp.value = p.val.toFixed(3);
        const sl = document.getElementById(`slider_${key}`);
        if (sl) sl.value = p.val;
        updateSliderRowUI(key);
    });
}

function scheduleUpdate() {
    updateMath();
    triggerAutoSave();
    const liveCb = document.querySelector('.design-code-checkbox[value="LIVE_MODEL"]');
    if (liveCb && liveCb.checked) {
        if (!rAFPending) {
            rAFPending = true;
            requestAnimationFrame(() => {
                rAFPending = false;
                updateLiveModelOnly();
            });
        }
    }
}

function buildLiveEquationLatex() {
    const C = params.C.val;
    const c_str = params.C.disabled ? '1.000' : C.toFixed(3);
    
    let parts = [];
    parts.push(c_str);
    
    if (!params.alpha.disabled && Math.abs(params.alpha.val) > 1e-4) {
        parts.push(`\\left(\\frac{d_{dg}}{d}\\right)^{${params.alpha.val.toFixed(3)}}`);
    }
    if (!params.beta.disabled && Math.abs(params.beta.val) > 1e-4) {
        parts.push(`\\left(100\\rho_w\\right)^{${params.beta.val.toFixed(3)}}`);
    }
    if (!params.gamma.disabled && Math.abs(params.gamma.val) > 1e-4) {
        parts.push(`f_{ck}^{${params.gamma.val.toFixed(3)}}`);
    }
    if (!params.delta.disabled && Math.abs(params.delta.val) > 1e-4) {
        parts.push(`\\left(\\frac{a}{d}\\right)^{${params.delta.val.toFixed(3)}}`);
    }
    
    if (!params.epsilon.disabled) {
        if (Math.abs(params.epsilon.val - 1.0) < 1e-4) {
            parts.push(`b_w`);
        } else if (Math.abs(params.epsilon.val) > 1e-4) {
            parts.push(`b_w^{${params.epsilon.val.toFixed(3)}}`);
        }
    }
    if (!params.zeta.disabled) {
        if (Math.abs(params.zeta.val - 1.0) < 1e-4) {
            parts.push(`d`);
        } else if (Math.abs(params.zeta.val) > 1e-4) {
            parts.push(`d^{${params.zeta.val.toFixed(3)}}`);
        }
    }
    
    let formulaBody = parts.join(' ');
    return `V_{calc} = ${formulaBody}`;
}
window.buildLiveEquationLatex = buildLiveEquationLatex;

function updateMath() {
    if (!currentFilteredRows || !currentFilteredRows.length) return;

    let sumRatio = 0;
    const ratios = [];
    const len = currentFilteredRows.length;

    for (let i = 0; i < len; i++) {
        let row = currentFilteredRows[i];
        let pt = computeLiveModelPoint(row);
        if (pt) {
            ratios.push(pt.ratio);
            sumRatio += pt.ratio;
        }
    }

    const validCount = ratios.length;
    if (validCount === 0) {
        const m = document.getElementById('statMean');
        if (m) m.innerHTML = '-.---';
        const c = document.getElementById('statCov');
        if (c) c.innerText = '-.---';
        const pEl = document.getElementById('lblPoints');
        if (pEl) pEl.innerText = '0';
        return;
    }

    let mean = sumRatio / validCount;
    let sqDiffSum = 0;
    for (let i = 0; i < validCount; i++) {
        let diff = ratios[i] - mean;
        sqDiffSum += diff * diff;
    }
    let std = Math.sqrt(sqDiffSum / validCount);
    let cov = mean > 0 ? std / mean : 0;

    const meanEl = document.getElementById('statMean');
    if (meanEl) {
        meanEl.innerHTML = mean.toFixed(3) + (mean < 1.0 ? ` <span class="text-red-500 text-xs font-bold" title="${tr('unsafe_badge_tooltip', 'Fator de segurança médio menor que 1.0 (inseguro)')}">⚠</span>` : '');
    }
    const covEl = document.getElementById('statCov');
    if (covEl) {
        covEl.innerText = cov.toFixed(3);
    }
    const pEl = document.getElementById('lblPoints');
    if (pEl) {
        pEl.innerText = validCount;
    }

    // Render Live KaTeX Equation
    if (window.katex) {
        const eqStr = buildLiveEquationLatex();
        const eqContainer = document.getElementById('mathEquation');
        if (eqContainer) {
            katex.render(eqStr, eqContainer, {
                throwOnError: false,
                displayMode: true
            });
        }
        const eqBox2 = document.getElementById('liveModelEqBox');
        if (eqBox2 && eqBox2 !== eqContainer) {
            katex.render(eqStr, eqBox2, {
                throwOnError: false,
                displayMode: true
            });
        }
    }
    if (typeof updateLiveModelFlatnessUI === 'function') {
        updateLiveModelFlatnessUI();
    }
}

function setOptimizationCriterion(criterion) {
    const isCov = criterion === 'cov';
    const radCov = document.getElementById('optCritCov');
    const radMean = document.getElementById('optCritMean');
    const lblCov = document.getElementById('lblOptCov');
    const lblMean = document.getElementById('lblOptMean');
    const btnText = document.getElementById('btnOptimizeText');
    const hintText = document.getElementById('optCriterionHint');

    if (radCov) radCov.checked = isCov;
    if (radMean) radMean.checked = !isCov;

    if (lblCov) {
        if (isCov) {
            lblCov.className = "flex flex-col p-2.5 rounded-lg border-2 border-purple-500 bg-purple-500/10 cursor-pointer transition-all shadow-xs";
        } else {
            lblCov.className = "flex flex-col p-2.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] cursor-pointer transition-all hover:border-purple-400/50 hover:bg-purple-900/10";
        }
    }
    if (lblMean) {
        if (!isCov) {
            lblMean.className = "flex flex-col p-2.5 rounded-lg border-2 border-indigo-500 bg-indigo-500/10 cursor-pointer transition-all shadow-xs";
        } else {
            lblMean.className = "flex flex-col p-2.5 rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] cursor-pointer transition-all hover:border-indigo-400/50 hover:bg-indigo-900/10";
        }
    }
    if (btnText) {
        btnText.innerText = isCov 
            ? tr('opt_btn_cov', 'Otimizar COV Mínimo (Nelder-Mead)') 
            : tr('opt_btn_mean', 'Otimizar R Médio Alvo (Nelder-Mead)');
    }
    if (hintText) {
        hintText.innerHTML = isCov 
            ? tr('opt_hint_cov_detail', '• <strong>Mínimo COV</strong>: Nelder-Mead varia apenas os expoentes livres para menor dispersão; a constante C <strong>não é variada</strong>.') 
            : tr('opt_hint_mean_detail', '• <strong>R Médio Alvo</strong>: Nelder-Mead calibra a formulação em torno da Margem Média Alvo informada.');
    }
    triggerAutoSave();
}

async function optimizeEquation() {
    const btn = document.getElementById('btnOptimize');
    if (!btn) return;
    const statusMsg = document.getElementById('optStatusMsg');
    const originalText = btn.innerHTML;
    const t = tr;

    const criterionEl = document.querySelector('input[name="optCriterion"]:checked');
    const criterion = criterionEl ? criterionEl.value : 'cov';
    const isCov = criterion === 'cov';

    btn.innerHTML = `<span class="animate-pulse">${tr('opt_running', 'Running SciPy Nelder-Mead...')}</span>`;
    btn.disabled = true;
    if (statusMsg) statusMsg.classList.add('hidden');

    const tsInput = document.getElementById('inpTargetSafety');
    let targetSafety = 1.0;
    if (tsInput && !isNaN(parseFloat(tsInput.value))) {
        targetSafety = parseFloat(tsInput.value);
    }

    const lockedMap = {};
    const currentVals = {};
    const lockedLabels = [];
    const freeLabels = [];

    Object.keys(params).forEach(k => {
        const isLockedOrDisabled = !!params[k].locked || !!params[k].disabled;
        lockedMap[k] = isLockedOrDisabled;
        currentVals[k] = params[k].val;
        if (isLockedOrDisabled) {
            lockedLabels.push(k);
        } else {
            // In COV mode, C is never varied by definition
            if (isCov && k === 'C') {
                // Not counted as free for Nelder-Mead in COV mode
            } else {
                freeLabels.push(k);
            }
        }
    });

    if (freeLabels.length === 0) {
        alert(t('all_locked_alert', 'Todos os coeficientes ajustáveis estão travados ou desativados! Destrave pelo menos um expoente (🔓) para que o algoritmo Nelder-Mead possa otimizá-lo.'));
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    const subsetEl = document.getElementById('subsetSelect');
    const subsetKey = subsetEl ? subsetEl.value : (currentSubsetKey || 'ALL DATA');
    const subsetOpt = subsetEl && subsetEl.selectedIndex >= 0 ? subsetEl.options[subsetEl.selectedIndex] : null;
    const subsetLabel = subsetOpt ? subsetOpt.text.split('(')[0].trim() : subsetKey;

    try {
        const best = await eel.run_scipy_optimization(targetSafety, lockedMap, currentVals, criterion, subsetKey)();
        if (best && best.error) {
            alert("Optimization failed: " + best.error);
        } else if (best) {
            Object.keys(best).forEach(k => {
                if (params[k] && !params[k].disabled) {
                    params[k].val = best[k];
                    let s = document.getElementById(`slider_${k}`);
                    if (s) {
                        if (best[k] < parseFloat(s.min)) s.min = (best[k] > 0 ? 0 : Math.floor(best[k] * 10) / 10);
                        if (best[k] > parseFloat(s.max)) s.max = Math.ceil(best[k] * 10) / 10;
                    }
                }
            });
            updateSlidersUI();
            updateMath();
            updateDatabaseChart();
            triggerAutoSave();

            if (statusMsg) {
                let covInfo = best._cov != null ? `COV = ${best._cov}%` : '';
                let meanInfo = best._mean != null ? `Média R = ${best._mean}` : '';
                let cInfo = params.C ? `C = ${params.C.val.toFixed(3)}` : '';
                let modeLabel = isCov ? 'Mínimo COV (C mantido)' : 'R Médio Alvo';
                let countInfo = best._count ? `${best._count} testes` : `${currentFilteredRows.length} testes`;

                statusMsg.innerHTML = `<span class="font-bold">[${modeLabel} | ${subsetLabel} (${countInfo})]</span> ${covInfo} | ${meanInfo} (${cInfo})`;
                statusMsg.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error("Optimization error:", e);
        alert("Erro ao executar otimização: " + e);
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
}

/**
 * Instant Analytical Calibration of Constant C
 * Multiplies C by (currentMean / targetSafety) on the active subset to hit target safety margin exactly,
 * without altering any of the exponents and keeping the COV 100% constant.
 */
async function calibrateConstantC() {
    const tsInput = document.getElementById('inpTargetSafety');
    let targetSafety = 1.0;
    if (tsInput && !isNaN(parseFloat(tsInput.value))) {
        targetSafety = parseFloat(tsInput.value);
    }
    if (targetSafety <= 0) targetSafety = 1.0;

    const subsetEl = document.getElementById('subsetSelect');
    const subsetKey = subsetEl ? subsetEl.value : (currentSubsetKey || 'ALL DATA');
    const subsetOpt = subsetEl && subsetEl.selectedIndex >= 0 ? subsetEl.options[subsetEl.selectedIndex] : null;
    const subsetLabel = subsetOpt ? subsetOpt.text.split('(')[0].trim() : subsetKey;

    const btn = document.getElementById('btnCalibrateC');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<span>⏳</span>';

    const currentVals = {};
    Object.keys(params).forEach(k => { currentVals[k] = params[k].val; });

    try {
        if (window.eel && eel.calibrate_shear_constant_c) {
            const res = await eel.calibrate_shear_constant_c(targetSafety, currentVals, subsetKey)();
            if (res && res.C) {
                params.C.val = parseFloat(res.C.toFixed(3));
                const s = document.getElementById('slider_C');
                if (s) {
                    if (res.C < parseFloat(s.min)) s.min = (res.C > 0 ? 0 : Math.floor(res.C * 10) / 10);
                    if (res.C > parseFloat(s.max)) s.max = Math.ceil(res.C * 10) / 10;
                }
                updateSlidersUI();
                updateMath();
                updateDatabaseChart();
                triggerAutoSave();
                let countInfo = res.count ? `${res.count} testes` : `${currentFilteredRows.length} testes`;
                showToast(`Constante C calibrada para ${res.C.toFixed(3)} no recorte [${subsetLabel}] (${countInfo}): Média = ${res.mean}, COV = ${res.cov}%`, 'success');
                if (btn) btn.innerHTML = originalText;
                return;
            }
        }
    } catch (e) {
        console.warn('Fallback to client-side calibration:', e);
    }

    // High-precision Client-side Analytical Fallback evaluated on the active subset rows
    let sumR = 0, countR = 0;
    for (let i = 0; i < currentFilteredRows.length; i++) {
        let pt = computeLiveModelPoint(currentFilteredRows[i]);
        if (pt && isFinite(pt.ratio)) {
            sumR += pt.ratio;
            countR++;
        }
    }
    let currentMean = countR > 0 ? (sumR / countR) : 1.0;
    if (isNaN(currentMean) || currentMean <= 0) currentMean = 1.0;

    const newC = params.C.val * (currentMean / targetSafety);
    params.C.val = parseFloat(newC.toFixed(3));
    const s = document.getElementById('slider_C');
    if (s) {
        if (params.C.val < parseFloat(s.min)) s.min = (params.C.val > 0 ? 0 : Math.floor(params.C.val * 10) / 10);
        if (params.C.val > parseFloat(s.max)) s.max = Math.ceil(params.C.val * 10) / 10;
    }
    updateSlidersUI();
    updateMath();
    updateDatabaseChart();
    triggerAutoSave();
    showToast(`Constante C ajustada para ${params.C.val.toFixed(3)} no recorte [${subsetLabel}] (${countR} testes)`, 'success');
    if (btn) btn.innerHTML = originalText;
}
window.calibrateConstantC = calibrateConstantC;


// High-speed O(k) LOWESS using 2-pointer binary search on sorted array (0.25ms vs 12ms)
function computeLowess(validPts, frac = 0.3, numEval = 50) {
    if (!validPts || validPts.length < 3) return [];
    const n = validPts.length;
    const k = Math.max(4, Math.min(n, Math.ceil(frac * n)));
    const minX = validPts[0].x;
    const maxX = validPts[n - 1].x;
    if (minX === maxX) return [];

    const result = [];
    const step = (maxX - minX) / (numEval - 1);

    for (let e = 0; e < numEval; e++) {
        const x0 = minX + e * step;

        let low = 0, high = n - 1;
        while (low <= high) {
            let mid = (low + high) >> 1;
            if (validPts[mid].x < x0) low = mid + 1;
            else high = mid - 1;
        }
        let center = Math.max(0, Math.min(n - 1, low));

        let left = center, right = center;
        while ((right - left + 1) < k) {
            if (left > 0 && right < n - 1) {
                let distL = Math.abs(validPts[left - 1].x - x0);
                let distR = Math.abs(validPts[right + 1].x - x0);
                if (distL <= distR) left--;
                else right++;
            } else if (left > 0) {
                left--;
            } else if (right < n - 1) {
                right++;
            } else {
                break;
            }
        }

        const dMax = Math.max(Math.abs(validPts[left].x - x0), Math.abs(validPts[right].x - x0));
        if (dMax <= 1e-9) {
            let sumY = 0;
            for (let i = left; i <= right; i++) sumY += validPts[i].y;
            result.push({ x: x0, y: sumY / (right - left + 1) });
            continue;
        }

        let sumW = 0, sumWx = 0, sumWy = 0, sumWxx = 0, sumWxy = 0;
        for (let i = left; i <= right; i++) {
            const pt = validPts[i];
            const u = Math.abs(pt.x - x0) / dMax;
            const w = Math.pow(1 - u * u * u, 3);
            const dx = pt.x - x0;
            sumW += w;
            sumWx += w * dx;
            sumWy += w * pt.y;
            sumWxx += w * dx * dx;
            sumWxy += w * dx * pt.y;
        }

        const denom = sumW * sumWxx - sumWx * sumWx;
        let y0 = Math.abs(denom) < 1e-12 ? (sumWy / sumW) : ((sumWy * sumWxx - sumWx * sumWxy) / denom);
        if (isFinite(y0)) {
            result.push({ x: x0, y: Math.max(0, y0) });
        }
    }
    return result;
}

function calculateBins(dataPoints, numBins = 10) {
    if (!dataPoints || dataPoints.length === 0) return { p05: [], p10: [], pMean: [] };
    let minX = Infinity;
    let maxX = -Infinity;

    for (let i = 0; i < dataPoints.length; i++) {
        let x = dataPoints[i].x;
        if (isFinite(x)) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
        }
    }
    if (!isFinite(minX) || !isFinite(maxX) || minX === maxX) return { p05: [], p10: [], pMean: [] };

    let binWidth = (maxX - minX) / numBins;
    let bins = Array.from({ length: numBins }, () => []);

    for (let i = 0; i < dataPoints.length; i++) {
        let dp = dataPoints[i];
        if (!isFinite(dp.x) || !isFinite(dp.y)) continue;
        let bIdx = Math.floor((dp.x - minX) / binWidth);
        if (bIdx >= numBins) bIdx = numBins - 1;
        if (bIdx < 0) bIdx = 0;
        bins[bIdx].push(dp.y);
    }

    let p05 = [];
    let p10 = [];
    let pMean = [];

    for (let i = 0; i < numBins; i++) {
        let bData = bins[i].slice().sort((a, b) => a - b);
        let centerX = minX + (i + 0.5) * binWidth;

        if (bData.length > 0) {
            let sum = 0;
            for (let v of bData) sum += v;
            let mean = sum / bData.length;
            pMean.push({ x: centerX, y: mean });
        }

        if (bData.length >= 3) {
            let idx05 = Math.floor(0.05 * bData.length);
            let idx10 = Math.floor(0.10 * bData.length);
            p05.push({ x: centerX, y: bData[idx05] });
            p10.push({ x: centerX, y: bData[idx10] });
        }
    }
    return { p05, p10, pMean };
}

// High-speed 60fps update: updates ONLY the Live Model dataset when sliders change
function updateLiveModelOnly() {
    if (!dbChart || !dbChart.data || !dbChart.data.datasets) return;
    const liveCb = document.querySelector('.design-code-checkbox[value="LIVE_MODEL"]');
    if (!liveCb || !liveCb.checked) return;

    const isDark = document.documentElement.classList.contains('dark');
    const liveColor = `rgba(${getLiveModelColor(isDark)}, 1)`;

    const plotPoints = [];
    const len = currentFilteredRows.length;
    for (let i = 0; i < len; i++) {
        const row = currentFilteredRows[i];
        const pt = computeLiveModelPoint(row);
        if (pt) {
            let px = getRowXValue(row, currentVarKey);
            if (px !== null && isFinite(px) && isFinite(pt.ratio)) {
                plotPoints.push({ x: px, y: pt.ratio });
            }
        }
    }

    plotPoints.sort((a, b) => a.x - b.x);

    let sum = 0;
    for (let i = 0; i < plotPoints.length; i++) sum += plotPoints[i].y;
    let mean = plotPoints.length > 0 ? sum / plotPoints.length : 0;
    let sqSum = 0;
    for (let i = 0; i < plotPoints.length; i++) sqSum += Math.pow(plotPoints[i].y - mean, 2);
    let std = plotPoints.length > 0 ? Math.sqrt(sqSum / plotPoints.length) : 0;
    let cov = mean > 0 ? std / mean : 0;

    let lowessLine = computeLowess(plotPoints, 0.3, 50);

    // Update Live Model scatter & curve in Chart datasets
    const ds = dbChart.data.datasets;
    for (let i = 0; i < ds.length; i++) {
        if (ds[i]._codeKey === 'LIVE_MODEL_SCATTER') {
            ds[i].data = plotPoints;
        } else if (ds[i]._codeKey === 'LIVE_MODEL_CURVE') {
            ds[i].data = lowessLine;
            ds[i].borderColor = liveColor;
            ds[i].label = `Live Equation (Mean: ${mean.toFixed(2)}, CoV: ${cov.toFixed(2)})`;
        }
    }

    dbChart.update('none');
    updateExternalLegend(dbChart.data.datasets);

    // Immediately update live model flatness indicator at 60fps
    if (typeof updateLiveModelFlatnessUI === 'function') {
        updateLiveModelFlatnessUI();
    }

    // Debounce Python similarity call by 200ms so slider dragging is never blocked
    debounceSimilarity(lowessLine);
}

// -------------------------------------------------------------
// DESIGN CODES EQUATION & FACTORS METADATA
// Detailed mathematical equations, physical factors and bias origin
// -------------------------------------------------------------
const CODE_EQUATION_METADATA = {
    'A_MC2010_L1': {
        name: 'Fib MC 2010 (Level I)',
        shortCode: 'MC2010 L1',
        category: 'Analítica',
        color: '#4f46e5',
        equationLatex: 'V_c = k_v \\sqrt{f_{ck}} \\cdot z \\cdot b_w',
        secondaryLatex: 'k_v = \\frac{180}{1000 + 1.25 z}, \\quad z = 0.9 d',
        factors: {
            sizeEffect: 'k_v = \\frac{180}{1000 + 1.25 z} \\quad (z = 0.9d)',
            reinforcement: 'Ausente (não considera \\rho_w)',
            concrete: 'f_{ck}^{0.50} \\quad (\\sqrt{f_{ck}})',
            shearSpan: 'Ausente (viga esbelta padrão)',
            geometry: 'b_w \\cdot z = 0.9 b_w d'
        },
        differenceOrigin: 'Formulação preliminar simplificada de Nível I: não contempla a taxa de armadura longitudinal e adota braço de alavanca constante z = 0.9d, divergindo em vigas com pouco aço.'
    },
    'A_MC2010_L2': {
        name: 'Fib MC 2010 (Level II)',
        shortCode: 'MC2010 L2',
        category: 'Analítica',
        color: '#4338ca',
        equationLatex: 'V_c = k_v \\sqrt{f_{ck}} \\cdot z \\cdot b_w',
        secondaryLatex: 'k_v = \\frac{0.4}{1 + 1500 \\varepsilon_x} \\cdot \\frac{1300}{1000 + k_{dg} z}, \\quad k_{dg} = \\frac{32}{16 + d_{dg}} \\ge 0.75',
        factors: {
            sizeEffect: '\\frac{1300}{1000 + k_{dg} z} \\quad \\text{ponderado por rugosidade } d_{dg}',
            reinforcement: '\\varepsilon_x = \\frac{M_{Ed}/z + V_{Ed}}{2 E_s A_s} \\implies \\rho_w \\text{ no denominador}',
            concrete: 'f_{ck}^{0.50} \\quad (\\sqrt{f_{ck}})',
            shearSpan: 'Entra via momento atuante M_{Ed} = V \\cdot a',
            geometry: 'b_w \\cdot z = 0.9 b_w d'
        },
        differenceOrigin: 'Baseado na Teoria dos Campos de Compressão Modificados (MCFT/CSCT). Incorpora deformação crítica longitudinal εx e tamanho máximo do agregado ddg.'
    },
    'A_EC2_2004': {
        name: 'Eurocode 2 (2004)',
        shortCode: 'EC2 2004',
        category: 'Norma Europeia',
        color: '#0d9488',
        equationLatex: 'V_c = 0.18 \\cdot k \\cdot (100 \\rho_l f_{ck})^{1/3} b_w d \\ge v_{min} b_w d',
        secondaryLatex: 'k = 1 + \\sqrt{\\frac{200}{d}} \\le 2.0, \\quad \\rho_l = \\min(\\rho_w, 0.02)',
        factors: {
            sizeEffect: 'k = 1 + \\sqrt{200/d} \\le 2.0 \\quad (\\text{satura para } d \\le 200\\text{mm})',
            reinforcement: '(100 \\rho_l)^{1/3} = 4.64 \\cdot \\rho_w^{0.333}',
            concrete: 'f_{ck}^{1/3} = f_{ck}^{0.333}',
            shearSpan: 'Ausente (regime de flexão-cisalhamento)',
            geometry: 'b_w \\cdot d'
        },
        differenceOrigin: 'Usa expoente 1/3 para concreto e armadura. O fator k satura em 2.0 para d ≤ 200 mm e omite a rugosidade do agregado ddg, gerando viés em vigas rasas ou agregados graúdos.'
    },
    'A_EC2_2023': {
        name: 'Eurocode 2 (2023)',
        shortCode: 'EC2 2023',
        category: 'Nova Norma Europeia',
        color: '#059669',
        equationLatex: 'V_c = 0.66 \\left(100 \\rho_l f_{ck} \\frac{d_{dg}}{d_{eff}}\\right)^{1/3} b_w d',
        secondaryLatex: 'd_{eff} = \\sqrt{\\frac{a_{cs}}{4} d} \\le d, \\quad a_{cs} = \\max(a_d \\cdot d, d)',
        factors: {
            sizeEffect: '\\left(\\frac{d_{dg}}{d_{eff}}\\right)^{1/3} \\implies \\text{expoente exato } 0.333 \\text{ com } d_{dg}',
            reinforcement: '(100 \\rho_l)^{1/3} = 4.64 \\cdot \\rho_w^{0.333}',
            concrete: 'f_{ck}^{1/3} = f_{ck}^{0.333}',
            shearSpan: 'Entra via d_{eff} = \\sqrt{(a_{cs}/4) d} \\text{ (ação de arco para } a/d < 4)',
            geometry: 'b_w \\cdot d'
        },
        differenceOrigin: 'Segunda geração do Eurocode (CSCT). É o modelo normativo mais próximo do Modelo Interativo, combinando potência de escala cúbica (ddg/deff)^(1/3) e transição de vão deff.'
    },
    'A_ACI_14': {
        name: 'ACI 318-14',
        shortCode: 'ACI 318-14',
        category: 'Norma Americana (2014)',
        color: '#e11d48',
        equationLatex: 'V_c = 0.17 \\sqrt{f_{ck}} \\cdot b_w d',
        secondaryLatex: '\\text{Sem fator de escala } (k = 1.0) \\text{ e sem armadura longitudinal } (\\rho_w)',
        factors: {
            sizeEffect: '1.0 \\quad (\\text{Inexistente!})',
            reinforcement: 'Ausente (\\rho_w^0)',
            concrete: 'f_{ck}^{0.50} \\quad (\\sqrt{f_{ck}})',
            shearSpan: 'Ausente (fórmula simplificada)',
            geometry: 'b_w \\cdot d'
        },
        differenceOrigin: 'Ignora completamente o efeito de escala e armadura longitudinal. Por isso, a reta de FS tem forte declive negativo com d, tornando-se perigosamente insegura em elementos espessos (d > 400mm).'
    },
    'A_ACI_19': {
        name: 'ACI 318-19',
        shortCode: 'ACI 318-19',
        category: 'Norma Americana (2019)',
        color: '#be123c',
        equationLatex: 'V_c = 0.66 \\rho_w^{1/3} \\sqrt{f_{ck}} \\cdot b_w d \\cdot \\lambda_s',
        secondaryLatex: '\\lambda_s = \\sqrt{\\frac{2}{1 + 0.004 d}} \\le 1.0',
        factors: {
            sizeEffect: '\\lambda_s = \\sqrt{2 / (1 + 0.004 d)} \\le 1.0',
            reinforcement: '\\rho_w^{1/3} = \\rho_w^{0.333}',
            concrete: 'f_{ck}^{0.50} \\quad (\\sqrt{f_{ck}})',
            shearSpan: 'Ausente',
            geometry: 'b_w \\cdot d'
        },
        differenceOrigin: 'Revisão de 2019 do ACI: introduziu λs e ρw^(1/3) para sanar a insegurança de 2014. Ainda diverge do modelo proposto por manter fck^0.5 e omitir a rugosidade do agregado ddg.'
    },
    'A_NBR6118': {
        name: 'NBR 6118',
        shortCode: 'NBR 6118',
        category: 'Norma Brasileira',
        color: '#0284c7',
        equationLatex: 'V_c = \\tau_{Rd} \\cdot k \\cdot (1.2 + 40 \\rho_w) b_w d',
        secondaryLatex: 'k = 1.6 - \\frac{d}{1000} \\ge 1.0, \\quad \\tau_{Rd} = 0.0525 f_{ck}^{2/3}',
        factors: {
            sizeEffect: 'k = 1.6 - d/1000 \\ge 1.0 \\quad (\\text{linear, satura em } 1.0 \\text{ para } d \\ge 600\\text{mm})',
            reinforcement: '(1.2 + 40 \\rho_w) \\quad (\\text{termo linear})',
            concrete: 'f_{ck}^{2/3} = f_{ck}^{0.667} \\quad (\\text{maior expoente entre todas as normas})',
            shearSpan: 'Ausente na formulação analítica',
            geometry: 'b_w \\cdot d'
        },
        differenceOrigin: 'A NBR trunca o efeito de escala em d = 600mm (k = 1.0), subestimando a perda de resistência em elementos espessos; usa termo linear de armadura e tração fctk (fck^0.667).'
    }
};

function getCodeMeta(keyOrName) {
    if (!keyOrName) return null;
    let clean = String(keyOrName).trim();
    if (CODE_EQUATION_METADATA[clean]) return CODE_EQUATION_METADATA[clean];

    if (clean === 'R_6118' || clean.includes('NBR')) return CODE_EQUATION_METADATA['A_NBR6118'];
    if (clean === 'R_EC_2004' || (clean.includes('2004') && clean.includes('Eurocode'))) return CODE_EQUATION_METADATA['A_EC2_2004'];
    if (clean === 'R_EC_2023' || (clean.includes('2023') && clean.includes('Eurocode'))) return CODE_EQUATION_METADATA['A_EC2_2023'];
    if (clean === 'R_ACI318_14' || clean.includes('318-14')) return CODE_EQUATION_METADATA['A_ACI_14'];
    if (clean === 'R_ACI318_19' || clean.includes('318-19')) return CODE_EQUATION_METADATA['A_ACI_19'];
    if (clean === 'R_MC2010' || (clean.includes('MC') && clean.includes('Level I') && !clean.includes('Level II'))) return CODE_EQUATION_METADATA['A_MC2010_L1'];
    if (clean.includes('MC') && clean.includes('Level II')) return CODE_EQUATION_METADATA['A_MC2010_L2'];

    for (let k in CODE_EQUATION_METADATA) {
        let m = CODE_EQUATION_METADATA[k];
        if (clean === m.name || clean.includes(m.name) || m.name.includes(clean)) return m;
    }
    return null;
}

function renderLatexToElement(el, latex, displayMode = false) {
    if (!el) return;
    if (window.katex) {
        try {
            katex.render(latex, el, {
                throwOnError: false,
                displayMode: displayMode
            });
            return;
        } catch (e) {
            console.warn("KaTeX render error:", e);
        }
    }
    el.innerText = latex;
}

// -------------------------------------------------------------
// VERIFICAÇÃO DE RETIDÃO (FLATNESS) DA EQUAÇÃO PROPOSTA VS ALTURA ÚTIL (d)
// Calcula inclinação linear m (slope), Pearson R e Flatness Score
// -------------------------------------------------------------
function computeLiveModelFlatness() {
    if (!currentFilteredRows || currentFilteredRows.length < 5) return null;

    let sumD = 0, sumFS = 0, sumD2 = 0, sumDFS = 0, validCount = 0;
    const dList = [];
    const fsList = [];

    for (let i = 0; i < currentFilteredRows.length; i++) {
        const row = currentFilteredRows[i];
        const pt = computeLiveModelPoint(row);
        if (pt && pt.d > 0 && isFinite(pt.ratio) && pt.ratio > 0) {
            let d = pt.d;
            let fs = pt.ratio;
            dList.push(d);
            fsList.push(fs);
            sumD += d;
            sumFS += fs;
            sumD2 += d * d;
            sumDFS += d * fs;
            validCount++;
        }
    }

    if (validCount < 5) return null;

    let meanD = sumD / validCount;
    let meanFS = sumFS / validCount;
    let varD = (sumD2 / validCount) - (meanD * meanD);
    if (varD <= 1e-6) return null;

    let covDFS = (sumDFS / validCount) - (meanD * meanFS);
    let slope = covDFS / varD;
    let slopePerMeter = slope * 1000.0; // Delta FS por 1000mm

    let varFS = 0;
    for (let i = 0; i < validCount; i++) {
        let diff = fsList[i] - meanFS;
        varFS += diff * diff;
    }
    varFS = varFS / validCount;
    let stdFS = Math.sqrt(varFS);
    let stdD = Math.sqrt(varD);
    let pearsonR = (stdD > 0 && stdFS > 0) ? (covDFS / (stdD * stdFS)) : 0;

    dList.sort((a, b) => a - b);
    let d10 = dList[Math.floor(0.10 * validCount)];
    let d90 = dList[Math.floor(0.90 * validCount)];
    let dSpan = Math.max(100, d90 - d10);

    let driftAcrossSpan = Math.abs(slope) * dSpan;
    let flatnessScore = Math.max(0, Math.min(100, (1.0 - (driftAcrossSpan / meanFS)) * 100.0));

    let statusText = '';
    let statusBadgeClass = '';
    let icon = '';
    let suggestion = '';

    if (flatnessScore >= 90.0 && Math.abs(slopePerMeter) <= 0.15) {
        statusText = 'Quase Constante (Horizontal)';
        statusBadgeClass = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        icon = '🟢';
        suggestion = 'Excelente neutralidade de escala! O fator de segurança é uniforme e independe da altura útil d.';
    } else if (slopePerMeter < -0.15) {
        statusText = 'Inclinada para Baixo (Perde FS com d)';
        statusBadgeClass = 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
        icon = '⚠️';
        suggestion = 'Elementos de maior altura útil perdem segurança relativa. Dica: Aumente o Size Effect (α) ou reduza ζ.';
    } else if (slopePerMeter > 0.15) {
        statusText = 'Inclinada para Cima (Ganha FS com d)';
        statusBadgeClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
        icon = '📈';
        suggestion = 'Elementos altos ganham margem de segurança desproporcional. Dica: Reduza o Size Effect (α) ou aumente ζ.';
    } else {
        statusText = 'Leve Inclinação Residual';
        statusBadgeClass = 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30';
        icon = '🟡';
        suggestion = 'Formulação muito próxima da neutralidade, com pequena inclinação residual.';
    }

    return {
        meanFS,
        slope,
        slopePerMeter,
        pearsonR,
        flatnessScore,
        statusText,
        statusBadgeClass,
        icon,
        suggestion,
        validCount,
        dMin: dList[0],
        dMax: dList[validCount - 1],
        d10,
        d90
    };
}

function computeCodeFlatness(codeKey) {
    if (!currentFilteredRows || currentFilteredRows.length < 5) return null;

    let colName = codeKey;
    if (codeKey.includes('MC2010 (Level I)') || codeKey === 'A_MC2010_L1') colName = 'A_MC2010_L1';
    else if (codeKey.includes('MC2010 (Level II)') || codeKey === 'A_MC2010_L2') colName = 'A_MC2010_L2';
    else if (codeKey.includes('Eurocode 2 (2004)') || codeKey === 'A_EC2_2004') colName = 'A_EC2_2004';
    else if (codeKey.includes('Eurocode 2 (2023)') || codeKey === 'A_EC2_2023') colName = 'A_EC2_2023';
    else if (codeKey.includes('ACI 318-14') || codeKey === 'A_ACI_14') colName = 'A_ACI_14';
    else if (codeKey.includes('ACI 318-19') || codeKey === 'A_ACI_19') colName = 'A_ACI_19';
    else if (codeKey.includes('NBR 6118') || codeKey === 'A_NBR6118') colName = 'A_NBR6118';
    else if (codeKey.startsWith('R_')) colName = codeKey;

    let sumD = 0, sumFS = 0, sumD2 = 0, sumDFS = 0, count = 0;
    const dList = [];
    const fsList = [];

    for (let i = 0; i < currentFilteredRows.length; i++) {
        const row = currentFilteredRows[i];
        let d = row._d !== undefined ? row._d : parseFloat(row['d (mm)']);
        let fs = parseFloat(row[colName]);
        if (isFinite(d) && d > 0 && isFinite(fs) && fs > 0) {
            dList.push(d);
            fsList.push(fs);
            sumD += d;
            sumFS += fs;
            sumD2 += d * d;
            sumDFS += d * fs;
            count++;
        }
    }

    if (count < 5) return null;
    let meanD = sumD / count;
    let meanFS = sumFS / count;
    let varD = (sumD2 / count) - (meanD * meanD);
    if (varD <= 1e-6) return null;

    let covDFS = (sumDFS / count) - (meanD * meanFS);
    let slope = covDFS / varD;
    let slopePerMeter = slope * 1000.0;

    dList.sort((a, b) => a - b);
    let d10 = dList[Math.floor(0.10 * count)];
    let d90 = dList[Math.floor(0.90 * count)];
    let dSpan = Math.max(100, d90 - d10);
    let drift = Math.abs(slope) * dSpan;
    let flatnessScore = Math.max(0, Math.min(100, (1.0 - (drift / meanFS)) * 100.0));

    return {
        meanFS,
        slope,
        slopePerMeter,
        flatnessScore,
        count
    };
}

function updateLiveModelFlatnessUI() {
    const card = document.getElementById('liveModelFlatnessCard');
    if (!card) return;

    const pal = LIVE_MODEL_PALETTES[currentLiveModelColorKey] || LIVE_MODEL_PALETTES.cyan;
    const flatness = computeLiveModelFlatness();
    const eqLatex = buildLiveEquationLatex();

    const disabledVars = Object.keys(params).filter(k => params[k].disabled);
    const disabledBadge = disabledVars.length > 0
        ? `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Variáveis desativadas: ${disabledVars.map(k => params[k].symbol).join(', ')}">✂️ ${disabledVars.length} off</span>`
        : '';

    if (!flatness) {
        card.innerHTML = `
            <div class="flex items-center justify-between pb-1 border-b border-[var(--color-border-primary)]">
                <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs" style="color:${pal.hex};">🎯 Modelo Proposto Interativo</span>
                    ${disabledBadge}
                </div>
            </div>
            <div id="liveModelEqBox" class="py-1 text-center font-mono text-[11px] overflow-x-auto"></div>
            <p class="text-[10px] text-gray-400 text-center">Aguardando dados para avaliar retidão vs altura útil...</p>
        `;
        renderLatexToElement(document.getElementById('liveModelEqBox'), eqLatex, true);
        const mathEqEl = document.getElementById('mathEquation');
        if (mathEqEl && mathEqEl !== document.getElementById('liveModelEqBox')) {
            renderLatexToElement(mathEqEl, eqLatex, true);
        }
        return;
    }

    let barColor = 'bg-emerald-500';
    if (flatness.flatnessScore < 75) barColor = 'bg-rose-500';
    else if (flatness.flatnessScore < 88) barColor = 'bg-amber-500';
    else if (flatness.flatnessScore < 94) barColor = 'bg-cyan-500';

    card.innerHTML = `
        <div class="flex items-center justify-between pb-1 border-b border-[var(--color-border-primary)]">
            <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-xs">🎯</span>
                <span class="font-bold text-xs truncate" style="color:${pal.hex};">Modelo Proposto (Live)</span>
                ${disabledBadge}
            </div>
            <span class="text-[9.5px] px-1.5 py-0.5 rounded font-bold shrink-0 ${flatness.statusBadgeClass}">
                ${flatness.icon} ${flatness.flatnessScore.toFixed(1)}% Retidão
            </span>
        </div>
        
        <!-- Live Dynamic KaTeX Equation -->
        <div class="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded px-2 py-1 overflow-x-auto shadow-inner">
            <div id="liveModelEqBox" class="text-center font-mono text-[11px]" style="color:${pal.hex};"></div>
        </div>
        
        <!-- Retidão Progress Bar -->
        <div class="flex flex-col gap-1 mt-0.5">
            <div class="flex justify-between items-center text-[10px]">
                <span class="text-gray-400">Retidão vs Altura Útil (d):</span>
                <span class="font-bold font-mono text-gray-200">${flatness.flatnessScore.toFixed(1)}% (${flatness.statusText.split('(')[0].trim()})</span>
            </div>
            <div class="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                <div class="${barColor} h-1.5 rounded-full transition-all duration-300" style="width: ${flatness.flatnessScore}%"></div>
            </div>
        </div>

        <!-- 4-metric Grid -->
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] bg-[var(--color-bg-secondary)]/50 rounded p-1.5 border border-[var(--color-border-primary)]">
            <div class="flex justify-between items-center" title="Fator de Segurança Médio: V_test / V_calc">
                <span class="text-gray-400 text-[10.5px]">Média FS:</span>
                <span class="font-bold font-mono text-cyan-300">${flatness.meanFS.toFixed(3)}</span>
            </div>
            <div class="flex justify-between items-center" title="Índice de Retidão: 100% indica FS constante ao longo de d">
                <span class="text-gray-400 text-[10.5px]">Retidão:</span>
                <span class="font-bold font-mono ${flatness.flatnessScore >= 90 ? 'text-emerald-400' : 'text-amber-400'}">${flatness.flatnessScore.toFixed(1)}%</span>
            </div>
            <div class="flex justify-between items-center" title="Inclinação da reta FS vs d: Variação de FS a cada 1000mm de altura útil">
                <span class="text-gray-400 text-[10.5px]">Inclinação (m):</span>
                <span class="font-bold font-mono ${Math.abs(flatness.slopePerMeter) <= 0.15 ? 'text-emerald-400' : (flatness.slopePerMeter < 0 ? 'text-rose-400' : 'text-amber-400')}">
                    ${flatness.slopePerMeter >= 0 ? '+' : ''}${flatness.slopePerMeter.toFixed(3)} / m
                </span>
            </div>
            <div class="flex justify-between items-center" title="Correlação Pearson entre FS e d: R próximo de zero indica independência de d">
                <span class="text-gray-400 text-[10.5px]">Viés R(d):</span>
                <span class="font-bold font-mono ${Math.abs(flatness.pearsonR) <= 0.08 ? 'text-emerald-400' : 'text-rose-400'}">
                    ${flatness.pearsonR >= 0 ? '+' : ''}${flatness.pearsonR.toFixed(3)}
                </span>
            </div>
        </div>
        
        <!-- Dynamic Diagnostic & Hint -->
        <div class="p-1.5 rounded bg-cyan-950/20 border border-cyan-500/20 text-[10px] leading-snug text-gray-300 flex items-start gap-1.5">
            <span class="shrink-0 mt-0.5">${flatness.icon}</span>
            <span>${flatness.suggestion}</span>
        </div>
    `;

    renderLatexToElement(document.getElementById('liveModelEqBox'), eqLatex, true);
    const mathEqEl = document.getElementById('mathEquation');
    if (mathEqEl && mathEqEl !== document.getElementById('liveModelEqBox')) {
        renderLatexToElement(mathEqEl, eqLatex, true);
    }
}

function debounceSimilarity(liveCurve) {
    clearTimeout(simTimeout);
    simTimeout = setTimeout(() => {
        calculateSimilarity(liveCurve);
    }, 200);
}

function calculateSimilarity(liveCurve) {
    const simPanel = document.getElementById('similarityPanel');
    const simWait = document.getElementById('simWait');
    const simContent = document.getElementById('similarityContent');

    // Always update the live model flatness card
    updateLiveModelFlatnessUI();

    if (!liveCurve || liveCurve.length < 3 || Object.keys(cachedOtherCurves).length === 0) {
        if (simWait) simWait.classList.add('hidden');
        if (simContent) {
            simContent.innerHTML = `
                <div class="flex flex-col items-center justify-center p-3.5 text-center border border-dashed border-[var(--color-border-primary)] rounded-lg bg-[var(--color-bg-primary)] text-[var(--color-text-secondary)]">
                    <span class="text-xl mb-1.5 opacity-60">📊</span>
                    <p class="text-xs font-bold text-gray-300 mb-1">Nenhuma norma selecionada</p>
                    <p class="text-[10.5px] text-gray-400 leading-normal">Marque as normas de comparação (NBR, Eurocode, ACI ou Fib MC) para comparar equações, fatores e similaridade.</p>
                </div>`;
        }
        return;
    }

    if (simWait) simWait.classList.remove('hidden');

    if (typeof eel !== 'undefined' && eel.compare_lowess_curves_batch) {
        eel.compare_lowess_curves_batch(liveCurve, cachedOtherCurves)().then(results => {
            if (simWait) simWait.classList.add('hidden');
            let html = '';
            let cardIndex = 0;
            const latexQueue = [];

            for (let k in results) {
                cardIndex++;
                let res = results[k];
                let name = k;
                let rClass = res.pearson > 0.9 ? 'text-emerald-400' : (res.pearson > 0.7 ? 'text-amber-400' : 'text-rose-400');
                let meta = getCodeMeta(name);
                let codeFlat = computeCodeFlatness(name);
                let cardId = `norma_card_${cardIndex}`;

                let eqHtmlId = `eq_latex_${cardIndex}`;
                let secEqHtmlId = `sec_latex_${cardIndex}`;

                let flatnessBadge = '';
                if (codeFlat) {
                    let fScore = codeFlat.flatnessScore;
                    let fColor = fScore >= 90 ? 'text-emerald-400' : (fScore >= 80 ? 'text-amber-400' : 'text-rose-400');
                    flatnessBadge = `
                        <div class="col-span-2 flex justify-between items-center border-t border-[var(--color-border-primary)] pt-1 mt-0.5 text-[10.5px]" title="Retidão da própria norma vs d: quanto mais reto, mais constante é a segurança da norma">
                            <span class="text-gray-400">Retidão Norma (d):</span>
                            <span class="font-mono font-semibold ${fColor}">${fScore.toFixed(1)}% (${codeFlat.slopePerMeter >= 0 ? '+' : ''}${codeFlat.slopePerMeter.toFixed(2)}/m)</span>
                        </div>
                    `;
                }

                html += `
                <div class="flex flex-col border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] rounded-lg p-2.5 shadow-xs transition-all hover:border-cyan-500/40">
                    <!-- Header -->
                    <div class="flex justify-between items-center mb-1.5 pb-1 border-b border-[var(--color-border-primary)]">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="w-2 h-2 rounded-full shrink-0" style="background:${meta ? meta.color : '#38bdf8'};"></span>
                            <span class="font-bold text-xs text-gray-200 truncate" title="${name}">
                                ${name}
                            </span>
                        </div>
                        <span class="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-300 font-medium shrink-0">
                            ${meta ? meta.category : 'Norma'}
                        </span>
                    </div>

                    <!-- Code Equation Display (KaTeX) -->
                    <div class="bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] rounded p-1.5 mb-2 overflow-x-auto shadow-inner flex flex-col gap-0.5">
                        <div id="${eqHtmlId}" class="text-center font-mono text-[11px] text-cyan-300"></div>
                        ${meta && meta.secondaryLatex ? `<div id="${secEqHtmlId}" class="text-center font-mono text-[9.5px] text-gray-400"></div>` : ''}
                    </div>

                    <!-- Metrics Grid -->
                    <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                        <div class="flex justify-between items-center" title="Pearson R: Similaridade do formato da tendência">
                            <span class="text-gray-400 text-[10.5px]">Trend (R):</span> 
                            <span class="${rClass} font-bold font-mono">${res.pearson.toFixed(3)}</span>
                        </div>
                        <div class="flex justify-between items-center" title="RMSE: Distância absoluta vertical">
                            <span class="text-gray-400 text-[10.5px]">RMSE:</span> 
                            <span class="font-mono text-gray-200 font-semibold">${res.rmse.toFixed(3)}</span>
                        </div>
                        <div class="col-span-2 flex justify-between items-center border-t border-[var(--color-border-primary)] pt-1 mt-0.5" title="Derivative Pearson R: Taxa e inflexão da curva">
                            <span class="text-gray-400 text-[10.5px]">Rate/Deriv (R):</span> 
                            <span class="font-mono text-gray-200 font-semibold">${res.deriv_r.toFixed(3)}</span>
                        </div>
                        ${flatnessBadge}
                    </div>

                    <!-- Toggle Factors & Origin of Difference -->
                    ${meta ? `
                    <div class="mt-2 pt-1 border-t border-gray-700/60">
                        <button type="button" onclick="toggleFactorDetails('${cardId}')" class="w-full text-[10.5px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center justify-between py-0.5 cursor-pointer">
                            <span class="flex items-center gap-1"><span>🔍</span> <span>Fatores & Diferenças</span></span>
                            <span class="text-[9px] opacity-70">Expandir ▾</span>
                        </button>
                        
                        <div id="${cardId}" class="hidden flex flex-col gap-1.5 mt-1.5 p-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] text-[10.5px] animate-in fade-in duration-150">
                            <div class="flex flex-col gap-0.5">
                                <span class="text-purple-400 font-bold text-[9.5px] uppercase tracking-wider">Efeito de Escala (Size Effect):</span>
                                <span class="text-gray-200 font-mono text-[10px] pl-1.5">${meta.factors.sizeEffect}</span>
                            </div>
                            <div class="flex flex-col gap-0.5">
                                <span class="text-emerald-400 font-bold text-[9.5px] uppercase tracking-wider">Armadura Longitudinal (ρw):</span>
                                <span class="text-gray-200 font-mono text-[10px] pl-1.5">${meta.factors.reinforcement}</span>
                            </div>
                            <div class="flex flex-col gap-0.5">
                                <span class="text-amber-400 font-bold text-[9.5px] uppercase tracking-wider">Resistência do Concreto (fck):</span>
                                <span class="text-gray-200 font-mono text-[10px] pl-1.5">${meta.factors.concrete}</span>
                            </div>
                            <div class="flex flex-col gap-0.5">
                                <span class="text-blue-400 font-bold text-[9.5px] uppercase tracking-wider">Vão Cisalhante (a/d):</span>
                                <span class="text-gray-200 font-mono text-[10px] pl-1.5">${meta.factors.shearSpan}</span>
                            </div>
                            <div class="mt-1 pt-1 border-t border-[var(--color-border-primary)] text-[10px] text-gray-300 italic leading-snug">
                                <strong class="text-cyan-400 font-normal">Origem da Diferença:</strong> ${meta.differenceOrigin}
                            </div>
                        </div>
                    </div>` : ''}
                </div>`;

                if (meta) {
                    latexQueue.push({ id: eqHtmlId, latex: meta.equationLatex });
                    if (meta.secondaryLatex) {
                        latexQueue.push({ id: secEqHtmlId, latex: meta.secondaryLatex });
                    }
                }
            }

            if (simContent) simContent.innerHTML = html;

            // Render all KaTeX expressions in the newly inserted cards
            latexQueue.forEach(item => {
                renderLatexToElement(document.getElementById(item.id), item.latex, true);
            });
        }).catch(err => {
            console.error("Similarity metric error:", err);
            if (simWait) simWait.classList.add('hidden');
        });
    }
}

function toggleFactorDetails(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden');
}

// -------------------------------------------------------------
// MODAL: MATRIZ COMPARATIVA DE EQUAÇÕES E FATORES
// -------------------------------------------------------------
function openFactorsModal() {
    const modal = document.getElementById('factorsComparisonModal');
    if (!modal) return;
    renderFactorsModalContent();
    modal.classList.remove('hidden');
}

function closeFactorsModal() {
    const modal = document.getElementById('factorsComparisonModal');
    if (!modal) return;
    modal.classList.add('hidden');
}

function renderFactorsModalContent() {
    const container = document.getElementById('factorsModalContent');
    if (!container) return;

    const C_str = params.C.val.toFixed(3);
    const a_str = params.alpha.val.toFixed(3);
    const b_str = params.beta.val.toFixed(3);
    const g_str = params.gamma.val.toFixed(3);
    const d_str = params.delta.val.toFixed(3);
    const e_str = params.epsilon.val.toFixed(3);
    const z_str = params.zeta.val.toFixed(3);
    const liveFlat = computeLiveModelFlatness();
    const liveLatex = buildLiveEquationLatex();

    const a_factor = params.alpha.disabled ? '1.0 \\text{ (off)}' : `(d_{dg}/d)^{${a_str}}`;
    const b_factor = params.beta.disabled ? '1.0 \\text{ (off)}' : `(100\\rho_w)^{${b_str}}`;
    const g_factor = params.gamma.disabled ? '1.0 \\text{ (off)}' : `f_{ck}^{${g_str}}`;
    const d_factor = params.delta.disabled ? '1.0 \\text{ (off)}' : `(a/d)^{${d_str}}`;

    let rowsHtml = `
        <!-- Live Proposed Model Row -->
        <tr class="bg-cyan-500/10 border-b border-cyan-500/30">
            <td class="p-3 font-bold text-cyan-400 whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                    <span>⚡</span> <span>Modelo Proposto (Live)</span>
                </div>
            </td>
            <td class="p-3 font-mono text-[11px] text-cyan-300 whitespace-nowrap" id="modal_eq_live"></td>
            <td class="p-3 font-mono text-[11px] ${params.alpha.disabled ? 'text-gray-500 line-through' : 'text-purple-300'} whitespace-nowrap">${a_factor}</td>
            <td class="p-3 font-mono text-[11px] ${params.beta.disabled ? 'text-gray-500 line-through' : 'text-emerald-300'} whitespace-nowrap">${b_factor}</td>
            <td class="p-3 font-mono text-[11px] ${params.gamma.disabled ? 'text-gray-500 line-through' : 'text-amber-300'} whitespace-nowrap">${g_factor}</td>
            <td class="p-3 font-mono text-[11px] ${params.delta.disabled ? 'text-gray-500 line-through' : 'text-blue-300'} whitespace-nowrap">${d_factor}</td>
            <td class="p-3 font-bold font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                ${liveFlat ? liveFlat.flatnessScore.toFixed(1) + '% (' + (liveFlat.slopePerMeter >= 0 ? '+' : '') + liveFlat.slopePerMeter.toFixed(2) + '/m)' : '100%'}
            </td>
            <td class="p-3 text-[11px] text-gray-300 min-w-[240px]">
                Otimizado interativamente para atingir neutralidade de escala (FS constante independente de d).
            </td>
        </tr>
    `;

    const codeKeys = ['A_MC2010_L1', 'A_MC2010_L2', 'A_EC2_2004', 'A_EC2_2023', 'A_ACI_14', 'A_ACI_19', 'A_NBR6118'];
    const latexModalQueue = [{ id: 'modal_eq_live', latex: liveLatex }];

    codeKeys.forEach((k, idx) => {
        const meta = CODE_EQUATION_METADATA[k];
        if (!meta) return;
        const codeFlat = computeCodeFlatness(k);
        const eqId = `modal_eq_code_${idx}`;

        let flatStr = codeFlat 
            ? `${codeFlat.flatnessScore.toFixed(1)}% (${codeFlat.slopePerMeter >= 0 ? '+' : ''}${codeFlat.slopePerMeter.toFixed(2)}/m)`
            : 'N/A';
        let flatClass = codeFlat && codeFlat.flatnessScore >= 90 ? 'text-emerald-400' : (codeFlat && codeFlat.flatnessScore >= 80 ? 'text-amber-400' : 'text-rose-400');

        rowsHtml += `
            <tr class="border-b border-[var(--color-border-primary)] hover:bg-[var(--color-bg-primary)]/60 transition-colors">
                <td class="p-3 font-bold text-gray-200 whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full" style="background:${meta.color};"></span>
                        <span>${meta.name}</span>
                    </div>
                </td>
                <td class="p-3 font-mono text-[11px] whitespace-nowrap" id="${eqId}"></td>
                <td class="p-3 font-mono text-[10.5px] text-purple-300 whitespace-nowrap">${meta.factors.sizeEffect}</td>
                <td class="p-3 font-mono text-[10.5px] text-emerald-300 whitespace-nowrap">${meta.factors.reinforcement}</td>
                <td class="p-3 font-mono text-[10.5px] text-amber-300 whitespace-nowrap">${meta.factors.concrete}</td>
                <td class="p-3 font-mono text-[10.5px] text-blue-300 whitespace-nowrap">${meta.factors.shearSpan}</td>
                <td class="p-3 font-bold font-mono text-[11px] ${flatClass} whitespace-nowrap">${flatStr}</td>
                <td class="p-3 text-[11px] text-gray-400 min-w-[240px] leading-relaxed">${meta.differenceOrigin}</td>
            </tr>
        `;

        latexModalQueue.push({ id: eqId, latex: meta.equationLatex });
    });

    container.innerHTML = `
        <div class="overflow-x-auto rounded-xl border border-[var(--color-border-primary)]">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="bg-[var(--color-bg-primary)] border-b border-[var(--color-border-primary)] text-gray-400 text-[10.5px] uppercase tracking-wider">
                        <th class="p-3 font-bold">Norma / Modelo</th>
                        <th class="p-3 font-bold">Equação Resistente (Vc)</th>
                        <th class="p-3 font-bold">Efeito de Escala (Size Effect)</th>
                        <th class="p-3 font-bold">Taxa Longitudinal (ρw)</th>
                        <th class="p-3 font-bold">Resistência Concreto (fck)</th>
                        <th class="p-3 font-bold">Vão Cisalhante (a/d)</th>
                        <th class="p-3 font-bold">Retidão vs d</th>
                        <th class="p-3 font-bold">Origem Física da Diferença</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-[var(--color-border-primary)]">
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;

    latexModalQueue.forEach(item => {
        renderLatexToElement(document.getElementById(item.id), item.latex, false);
    });
}

// Full chart rebuild when variable, subset, or checkboxes toggle
async function updateDatabaseChart() {
    if (!rawData || !rawData.length || isUpdatingExplorer || !dbChart) return;
    isUpdatingExplorer = true;

    try {
        const selectedCbs = Array.from(document.querySelectorAll('.design-code-checkbox:checked'));
        const varSelectEl = document.getElementById('varSelect');
        currentVarKey = varSelectEl ? varSelectEl.value : 'd (mm)';
        const varLabel = varSelectEl && varSelectEl.selectedIndex >= 0 ? varSelectEl.options[varSelectEl.selectedIndex].text : currentVarKey;

        if (selectedCbs.length === 0) {
            dbChart.data.datasets = [];
            dbChart.update('none');
            const lbl = document.getElementById('lblPoints');
            if (lbl) lbl.innerText = '0';
            return;
        }

        const isDark = document.documentElement.classList.contains('dark');
        const t = tr;

        const colorPaletteLight = {
            'LIVE_MODEL': '147, 51, 234',
            'BASELINE_MODEL': '217, 119, 6',
            'R_6118': '37, 99, 235',
            'R_EC_2004': '22, 163, 74',
            'R_EC_2023': '13, 148, 136',
            'R_ACI318_14': '220, 38, 38',
            'R_ACI318_19': '234, 88, 12',
            'R_MC2010': '202, 138, 4',
            'A_MC2010_L1': '79, 70, 229',
            'A_MC2010_L2': '67, 56, 202',
            'A_EC2_2004': '13, 148, 136',
            'A_EC2_2023': '5, 150, 105',
            'A_ACI_14': '225, 29, 72',
            'A_ACI_19': '190, 18, 60',
            'A_NBR6118': '2, 132, 199'
        };

        const colorPaletteDark = {
            'LIVE_MODEL': '216, 180, 254',
            'BASELINE_MODEL': '245, 158, 11',
            'R_6118': '96, 165, 250',
            'R_EC_2004': '74, 222, 128',
            'R_EC_2023': '52, 211, 153',
            'R_ACI318_14': '248, 113, 113',
            'R_ACI318_19': '251, 146, 60',
            'R_MC2010': '250, 204, 21',
            'A_MC2010_L1': '165, 180, 252',
            'A_MC2010_L2': '129, 140, 248',
            'A_EC2_2004': '45, 212, 191',
            'A_EC2_2023': '52, 211, 153',
            'A_ACI_14': '251, 113, 133',
            'A_ACI_19': '244, 114, 182',
            'A_NBR6118': '56, 189, 248'
        };

        const currentPalette = isDark ? colorPaletteDark : colorPaletteLight;
        const fallbackBaseColor = isDark ? '226, 232, 240' : '100, 116, 139';

        let newDatasets = [];
        let overallMaxX = 0;
        let primaryPointsLength = 0;
        cachedOtherCurves = {};
        let liveCurveData = null;

        for (let i = 0; i < selectedCbs.length; i++) {
            const codeKey = selectedCbs[i].value;
            const spanEl = selectedCbs[i].parentElement ? selectedCbs[i].parentElement.querySelector('span') : null;
            const codeName = spanEl ? spanEl.innerText.trim() : codeKey;
            const baseColor = currentPalette[codeKey] || fallbackBaseColor;

            const plotPoints = [];
            const len = currentFilteredRows.length;
            for (let r = 0; r < len; r++) {
                const row = currentFilteredRows[r];
                let px = getRowXValue(row, currentVarKey);
                let py = null;

                if (codeKey === 'LIVE_MODEL') {
                    let pt = computeLiveModelPoint(row);
                    if (pt) py = pt.ratio;
                } else if (codeKey === 'BASELINE_MODEL') {
                    let pt = computeBaselineModelPoint(row);
                    if (pt) py = pt.ratio;
                } else {
                    let rawY = row[codeKey];
                    if (rawY !== null && rawY !== undefined) {
                        py = parseFloat(rawY);
                    }
                }

                if (px !== null && py !== null && isFinite(px) && isFinite(py)) {
                    plotPoints.push({ x: px, y: py });
                }
            }

            plotPoints.sort((a, b) => a.x - b.x);

            if (i === 0) {
                primaryPointsLength = plotPoints.length;
            }

            let sumRatio = 0;
            for (let pt of plotPoints) sumRatio += pt.y;
            let mean = plotPoints.length > 0 ? sumRatio / plotPoints.length : 0;
            
            let sqDiffSum = 0;
            for (let pt of plotPoints) sqDiffSum += Math.pow(pt.y - mean, 2);
            let std = plotPoints.length > 0 ? Math.sqrt(sqDiffSum / plotPoints.length) : 0;
            let cov = mean > 0 ? std / mean : 0;

            if (plotPoints.length > 0 && plotPoints[plotPoints.length - 1].x > overallMaxX) {
                overallMaxX = plotPoints[plotPoints.length - 1].x;
            }

            let lowessLine = computeLowess(plotPoints, 0.3, 50);
            let displayName = (codeKey === 'BASELINE_MODEL' && baselineParams)
                ? `📌 Referência [${baselineParams.subsetName}]`
                : codeName;

            if (codeKey === 'LIVE_MODEL') {
                liveCurveData = lowessLine;
            } else {
                cachedOtherCurves[displayName] = lowessLine;
            }

            // Scatter points
            if (i === 0 || selectedCbs.length === 1 || codeKey === 'BASELINE_MODEL') {
                const scatterBg = isDark ? 'rgba(148, 163, 184, 0.28)' : 'rgba(100, 116, 139, 0.20)';
                const scatterBorder = isDark ? 'rgba(203, 213, 225, 0.50)' : 'rgba(71, 85, 105, 0.45)';
                const scatterLabel = (codeKey === 'LIVE_MODEL')
                    ? `${t('dataset_samples', 'Amostras Experimentais (Dataset)')} (${plotPoints.length})`
                    : `${displayName} (${t('elements_label', 'Elementos')})`;

                newDatasets.push({
                    _codeKey: codeKey === 'LIVE_MODEL' ? 'LIVE_MODEL_SCATTER' : (codeKey === 'BASELINE_MODEL' ? 'BASELINE_MODEL_SCATTER' : codeKey),
                    label: scatterLabel,
                    data: plotPoints,
                    type: 'scatter',
                    backgroundColor: scatterBg,
                    borderColor: scatterBorder,
                    pointRadius: isDark ? 2.8 : 2.6,
                    pointHoverRadius: 5.5,
                    pointHoverBackgroundColor: '#38bdf8',
                    pointHoverBorderColor: '#ffffff',
                    borderWidth: 0.8,
                    order: 10 + i
                });
                
                if (selectedCbs.length === 1) {
                    let perc = calculateBins(plotPoints, 10);
                    newDatasets.push({
                        label: t('bin_10th_line', 'Percentil 10% (Bin)'),
                        data: perc.p10,
                        type: 'line',
                        showLine: true,
                        borderColor: isDark ? 'rgba(253, 186, 116, 1)' : 'rgba(234, 88, 12, 1)',
                        borderDash: [5, 5],
                        pointRadius: 4,
                        borderWidth: 2,
                        fill: false,
                        order: 3
                    });
                    newDatasets.push({
                        label: t('bin_5th_line', 'Percentil 5% (Bin)'),
                        data: perc.p05,
                        type: 'line',
                        showLine: true,
                        borderColor: isDark ? 'rgba(252, 165, 165, 1)' : 'rgba(220, 38, 38, 1)',
                        borderDash: [2, 2],
                        pointRadius: 4,
                        borderWidth: 2,
                        fill: false,
                        order: 2
                    });
                    newDatasets.push({
                        label: t('bin_mean_line', 'Média (Bin)'),
                        data: perc.pMean,
                        type: 'line',
                        showLine: true,
                        borderColor: isDark ? 'rgba(134, 239, 172, 1)' : 'rgba(22, 163, 74, 1)',
                        borderDash: [5, 5],
                        pointRadius: 4,
                        borderWidth: 2,
                        fill: false,
                        order: 4
                    });
                }
            }

            let lowessColor = codeKey === 'LIVE_MODEL'
                ? `rgba(${getLiveModelColor(isDark)}, 1)`
                : (codeKey === 'BASELINE_MODEL'
                    ? (isDark ? 'rgba(245, 158, 11, 1)' : 'rgba(217, 119, 6, 1)')
                    : `rgba(${baseColor}, 1)`);

            newDatasets.push({
                _codeKey: codeKey === 'LIVE_MODEL' ? 'LIVE_MODEL_CURVE' : `${codeKey}_CURVE`,
                label: `${displayName} (Mean: ${mean.toFixed(2)}, CoV: ${cov.toFixed(2)})`,
                data: lowessLine,
                type: 'line',
                showLine: true,
                borderColor: lowessColor,
                borderDash: (codeKey === 'BASELINE_MODEL') ? [6, 4] : undefined,
                pointRadius: 0,
                borderWidth: (codeKey === 'LIVE_MODEL' || codeKey === 'BASELINE_MODEL') ? 3.5 : 2.5,
                fill: false,
                order: (codeKey === 'LIVE_MODEL') ? 0 : ((codeKey === 'BASELINE_MODEL') ? 1 : (5 - i))
            });
        }

        cachedOverallMaxX = overallMaxX;

        // Safety threshold line at y = 1.0
        newDatasets.push({
            _codeKey: 'SAFETY_THRESHOLD',
            label: t('safety_threshold_line', 'Linha de Segurança (R = 1.0)'),
            data: [{ x: 0, y: 1.0 }, { x: overallMaxX > 0 ? overallMaxX * 1.05 : 1000, y: 1.0 }],
            type: 'line',
            showLine: true,
            borderColor: isDark ? 'rgba(248, 113, 113, 0.95)' : 'rgba(220, 38, 38, 0.90)',
            borderDash: [6, 4],
            pointRadius: 0,
            borderWidth: 2,
            fill: 'start',
            backgroundColor: isDark ? 'rgba(248, 113, 113, 0.12)' : 'rgba(220, 38, 38, 0.08)',
            order: 1
        });

        const lblPoints = document.getElementById('lblPoints');
        if (lblPoints) lblPoints.innerText = primaryPointsLength;

        // Theme colors for grid & axes
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)';
        const axisColor = isDark ? '#e2e8f0' : '#334155';
        const legendTextColor = isDark ? '#f8fafc' : '#1e293b';

        if (dbChart && dbChart.options && dbChart.options.scales) {
            if (dbChart.options.scales.x) {
                dbChart.options.scales.x.grid.color = gridColor;
                dbChart.options.scales.x.ticks.color = axisColor;
                dbChart.options.scales.x.title.color = axisColor;
            }
            if (dbChart.options.scales.y) {
                dbChart.options.scales.y.grid.color = gridColor;
                dbChart.options.scales.y.ticks.color = axisColor;
                dbChart.options.scales.y.title.color = axisColor;
            }
            if (dbChart.options.plugins && dbChart.options.plugins.legend && dbChart.options.plugins.legend.labels) {
                dbChart.options.plugins.legend.labels.color = legendTextColor;
            }
        }

        dbChart.data.datasets = newDatasets;
        dbChart.options.scales.x.title.text = varLabel;
        dbChart.options.scales.y.title.text = selectedCbs.length === 1 
            ? (selectedCbs[0].parentElement ? selectedCbs[0].parentElement.querySelector('span').innerText.trim() : '') + ' (V_test / V_calc)'
            : t('comparison_y_axis', 'V_test / V_calc (Comparativo)');

        dbChart.update('none');
        updateExternalLegend(dbChart.data.datasets);

        if (liveCurveData && Object.keys(cachedOtherCurves).length > 0) {
            debounceSimilarity(liveCurveData);
        } else {
            calculateSimilarity(null);
        }
    } catch (err) {
        console.error("Error updating database chart:", err);
    } finally {
        isUpdatingExplorer = false;
        if (pendingUpdate) {
            pendingUpdate = false;
            updateDatabaseChart();
        }
    }
}

function initDatabaseChart() {
    const canvas = document.getElementById('databaseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#e2e8f0' : '#334155';

    dbChart = new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                mode: 'nearest',
                intersect: false
            },
            plugins: {
                // Completely removed from inside the canvas; rendered externally in #externalChartLegend
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            let x = context.parsed.x !== null ? context.parsed.x.toFixed(2) : '';
                            let y = context.parsed.y !== null ? context.parsed.y.toFixed(2) : '';
                            return `${label}: (X: ${x}, R: ${y})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Variable', font: { size: 13, weight: 'bold' }, color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor },
                    min: 0
                },
                y: {
                    title: { display: true, text: 'V_test / V_calc (Ratio)', font: { size: 13, weight: 'bold' }, color: textColor },
                    grid: { color: gridColor },
                    ticks: { color: textColor },
                    min: 0,
                    max: 4.0
                }
            }
        }
    });
}

function downloadChart() {
    if (!dbChart) return;
    const link = document.createElement('a');

    const selectedCodes = Array.from(document.querySelectorAll('.design-code-checkbox:checked')).map(cb => cb.value);
    const codeKey = selectedCodes.length > 0 ? selectedCodes.join('_') : 'none';
    const varKey = (document.getElementById('varSelect') ? document.getElementById('varSelect').value : 'var').replace(/[\/\:\s\(\)]/g, '_');
    const subsetKey = (document.getElementById('subsetSelect') ? document.getElementById('subsetSelect').value : 'all').replace('>', 'gt');

    link.download = `plot_${codeKey}_vs_${varKey}_subset_${subsetKey}.png`;
    link.href = document.getElementById('databaseChart').toDataURL('image/png', 1.0);
    link.click();
}

// React to dark/light mode toggles immediately
const shearThemeObserver = new MutationObserver(() => {
    if (dbChart) {
        updateDatabaseChart();
    }
});
shearThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

// Expose functions globally for inline HTML event handlers
window.saveSessionStateManually = saveSessionStateManually;
window.resetToDefaults = resetToDefaults;
window.toggleFocusMode = toggleFocusMode;
window.downloadChart = downloadChart;
window.optimizeEquation = optimizeEquation;
window.setOptimizationCriterion = setOptimizationCriterion;
window.calibrateConstantC = calibrateConstantC;
window.pinCurrentModelAsBaseline = pinCurrentModelAsBaseline;
window.clearBaselineModel = clearBaselineModel;
window.openFactorsModal = openFactorsModal;
window.closeFactorsModal = closeFactorsModal;
window.toggleFactorDetails = toggleFactorDetails;
window.updateLiveModelFlatnessUI = updateLiveModelFlatnessUI;


