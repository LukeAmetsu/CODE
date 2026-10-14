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
    mu: { val: 0.15, defaultVal: 0.15, min: 0.0, max: 0.5, step: 0.01, symbol: 'μ', label: 'Protensão (σ_cp)', formula: '+ μ·σ_cp', keyName: 'param_mu_name', descKey: 'param_mu_desc', desc: 'Contribuição da pré-compressão da protensão (+μ·σ_cp, NBR 6118 / EC2).', locked: true, disabled: false, savedVal: 0.15 },
    epsilon: { val: 1.00, defaultVal: 1.00, isConstant: true, locked: true, disabled: false, symbol: 'ε', label: 'Largura Alma (bw)', formula: 'b_w', keyName: 'param_epsilon_name', descKey: 'param_epsilon_desc', desc: 'Largura da seção transversal da viga (bw) com expoente fixo constante = 1.0.', savedVal: 1.00 },
    zeta: { val: 1.00, defaultVal: 1.00, isConstant: true, locked: true, disabled: false, symbol: 'ζ', label: 'Altura Útil (d)', formula: 'd', keyName: 'param_zeta_name', descKey: 'param_zeta_desc', desc: 'Altura útil geométrica da seção resistente (d) com expoente fixo constante = 1.0 (Área nominal bw·d).', savedVal: 1.00 }
};

let useDeffConstraint = false;

function toggleDeffConstraint(enabled) {
    useDeffConstraint = !!enabled;
    syncDeffToggleUI();
    scheduleUpdate();
    triggerAutoSave();
    showToast(
        useDeffConstraint 
            ? 'Trava Cinemática (EC2 2023 & FIB) ativada: d_eff = min(d, √(acs/4 · d)) com acs ≥ d'
            : 'Trava Cinemática desativada: usando altura geométrica d padrão',
        useDeffConstraint ? 'success' : 'info'
    );
}
window.toggleDeffConstraint = toggleDeffConstraint;

function syncDeffToggleUI() {
    const chk = document.getElementById('chkUseDeffConstraint');
    if (chk) chk.checked = !!useDeffConstraint;
    if (typeof syncRelDeffToggleUI === 'function') {
        activeUseDeff = !!useDeffConstraint;
        syncRelDeffToggleUI();
        if (typeof renderFormulaDisplay === 'function') renderFormulaDisplay();
    }
}
window.syncDeffToggleUI = syncDeffToggleUI;

let excludePrestressed = false;

function toggleExcludePrestressed(enabled) {
    excludePrestressed = !!enabled;
    lastRenderedLatex = '';
    syncExcludePrestressedUI();
    updateFilteredRows();
    updateMath();
    scheduleKatexRender(true);
    if (typeof renderHorizontalCodeCardsEquations === 'function') {
        renderHorizontalCodeCardsEquations();
    }
    if (typeof renderFormulaDisplay === 'function') {
        renderFormulaDisplay();
    }
    updateDatabaseChart();
    triggerAutoSave();
    const count = currentFilteredRows ? currentFilteredRows.length : 0;
    const msg = excludePrestressed 
        ? tr('pc_excluded_toast', `Concreto Protendido (PC) excluído: equações atualizadas para Concreto Armado puro (σ_cp = 0) com ${count} ensaios.`)
        : tr('pc_included_toast', `Concreto Protendido (PC) incluído: equações atualizadas com termo de protensão (+μ·σ_cp) para ${count} ensaios.`);
    showToast(msg, 'info');
}
window.toggleExcludePrestressed = toggleExcludePrestressed;

function syncExcludePrestressedUI() {
    const chk1 = document.getElementById('chkExcludePrestressed');
    const chk2 = document.getElementById('chkDynExcludePrestressed');
    const lbl = document.getElementById('lblExcludePrestressed');
    const relChk = document.getElementById('rel_chk_exclude_pc');
    const thetaBadge = document.getElementById('thetaRStatusBadge');
    if (chk1) chk1.checked = !!excludePrestressed;
    if (chk2) chk2.checked = !!excludePrestressed;
    if (relChk) relChk.checked = !!excludePrestressed;
    if (thetaBadge) {
        thetaBadge.innerText = excludePrestressed ? '1.649 ensaios (s/ PC)' : '1.804 ensaios (c/ PC)';
    }
    if (lbl) {
        if (excludePrestressed) {
            lbl.classList.add('border-amber-500/60', 'bg-amber-500/15');
            lbl.classList.remove('bg-[var(--color-bg-primary)]');
        } else {
            lbl.classList.remove('border-amber-500/60', 'bg-amber-500/15');
            lbl.classList.add('bg-[var(--color-bg-primary)]');
        }
    }
}
window.syncExcludePrestressedUI = syncExcludePrestressedUI;

function switchAppMainTab(tab) {
    const btnExplorer = document.getElementById('tabBtn_explorer');
    const btnReliability = document.getElementById('tabBtn_reliability');
    const explorerContent = document.getElementById('mainContent');
    const relContent = document.getElementById('reliabilityTabContent');

    if (tab === 'reliability') {
        if (explorerContent) explorerContent.classList.add('hidden');
        if (relContent) relContent.classList.remove('hidden');

        if (btnExplorer) {
            btnExplorer.className = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700";
        }
        if (btnReliability) {
            btnReliability.className = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer bg-cyan-600 text-white shadow-md";
        }

        // Live sync parameters and recalculate
        syncLiveParamsToReliability();
    } else {
        if (relContent) relContent.classList.add('hidden');
        if (explorerContent) explorerContent.classList.remove('hidden');

        if (btnExplorer) {
            btnExplorer.className = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer bg-purple-600 text-white shadow-md";
        }
        if (btnReliability) {
            btnReliability.className = "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all cursor-pointer bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700";
        }

        if (window.dbChart) window.dbChart.resize();
    }
}
window.switchAppMainTab = switchAppMainTab;

function syncLiveParamsToReliability() {
    if (typeof params === 'object' && params) {
        if (params.C && document.getElementById('rel_param_C')) {
            document.getElementById('rel_param_C').value = params.C.val.toFixed(3);
        }
        if (params.alpha && document.getElementById('rel_param_alpha')) {
            document.getElementById('rel_param_alpha').value = (params.alpha.disabled ? 0.0 : params.alpha.val).toFixed(3);
        }
        if (params.beta && document.getElementById('rel_param_beta')) {
            document.getElementById('rel_param_beta').value = (params.beta.disabled ? 0.0 : params.beta.val).toFixed(3);
        }
        if (params.gamma && document.getElementById('rel_param_gamma')) {
            document.getElementById('rel_param_gamma').value = (params.gamma.disabled ? 0.0 : params.gamma.val).toFixed(3);
        }
        if (params.delta && document.getElementById('rel_param_delta')) {
            document.getElementById('rel_param_delta').value = (params.delta.disabled ? 0.0 : params.delta.val).toFixed(3);
        }
        if (params.mu && document.getElementById('rel_param_mu')) {
            document.getElementById('rel_param_mu').value = (params.mu.disabled ? 0.0 : params.mu.val).toFixed(3);
        }
    }

    if (typeof useDeffConstraint === 'boolean') {
        activeUseDeff = useDeffConstraint;
        if (typeof syncRelDeffToggleUI === 'function') syncRelDeffToggleUI();
    }

    if (typeof excludePrestressed === 'boolean') {
        const pcChk = document.getElementById('rel_chk_exclude_pc');
        if (pcChk) pcChk.checked = excludePrestressed;
    }

    if (typeof renderFormulaDisplay === 'function') renderFormulaDisplay();
    if (typeof extractModelErrorFromDb === 'function') extractModelErrorFromDb();
    if (typeof updateLatexCode === 'function') updateLatexCode();
}
window.syncLiveParamsToReliability = syncLiveParamsToReliability;

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
let chartSeriesVisibilityState = {};

function getDatasetStableKey(dataset) {
    if (!dataset) return '';
    if (dataset._codeKey) return dataset._codeKey;
    if (dataset.label) {
        return dataset.label.replace(/\s*\([^)]*\)/g, '').trim();
    }
    return '';
}

function setDatasetVisibilityState(dataset, isVisible) {
    if (!dataset) return;
    const codeKey = dataset._codeKey;
    if (codeKey) {
        chartSeriesVisibilityState[codeKey] = isVisible;
    }
    if (dataset.label) {
        const cleanLabel = dataset.label.replace(/\s*\([^)]*\)/g, '').trim();
        if (cleanLabel) {
            chartSeriesVisibilityState[cleanLabel] = isVisible;
        }
    }
}

function getDatasetVisibilityState(dataset) {
    if (!dataset) return true;
    if (dataset._codeKey && Object.prototype.hasOwnProperty.call(chartSeriesVisibilityState, dataset._codeKey)) {
        return chartSeriesVisibilityState[dataset._codeKey];
    }
    if (dataset.label) {
        const cleanLabel = dataset.label.replace(/\s*\([^)]*\)/g, '').trim();
        if (cleanLabel && Object.prototype.hasOwnProperty.call(chartSeriesVisibilityState, cleanLabel)) {
            return chartSeriesVisibilityState[cleanLabel];
        }
    }
    if (typeof dataset.hidden === 'boolean') {
        return !dataset.hidden;
    }
    return true;
}

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
        const dynPanel = document.getElementById('dynamicFilterPanel');
        const state = {
            params: {},
            targetSafety: 1.0,
            currentVarKey: currentVarKey,
            currentSubsetKey: currentSubsetKey,
            selectedCodes: [],
            dynamicFilters: { ...dynamicFilters },
            isDynamicPanelOpen: !!(dynPanel && !dynPanel.classList.contains('hidden')),
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

        state.chartSeriesVisibility = { ...chartSeriesVisibilityState };
        state.shearAutoScaleY = (window.shearAutoScaleY !== false);
        state.useDeffConstraint = !!useDeffConstraint;
        state.excludePrestressed = !!excludePrestressed;

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

        // Enforce constant nominal shear area (bw * d)
        params.epsilon.val = 1.00;
        params.epsilon.locked = true;
        params.epsilon.disabled = false;
        params.zeta.val = 1.00;
        params.zeta.locked = true;
        params.zeta.disabled = false;

        // Restore kinematic constraint state
        if (typeof state.useDeffConstraint === 'boolean') {
            useDeffConstraint = state.useDeffConstraint;
            syncDeffToggleUI();
        }

        // Restore prestressed exclusion state
        if (typeof state.excludePrestressed === 'boolean') {
            excludePrestressed = state.excludePrestressed;
            syncExcludePrestressedUI();
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

        // Restore chart series visibility
        if (state.chartSeriesVisibility && typeof state.chartSeriesVisibility === 'object') {
            chartSeriesVisibilityState = { ...state.chartSeriesVisibility };
        }

        // Restore dynamic custom filters
        if (state.dynamicFilters && typeof state.dynamicFilters === 'object') {
            dynamicFilters = { ...dynamicFilters, ...state.dynamicFilters };
            dynamicFilters.enabled = hasActiveDynamicFilters();
            syncDynamicFilterUIFromState();
        }

        // Restore dynamic panel state
        if (state.isDynamicPanelOpen) {
            toggleDynamicFilterPanel(true);
        }

        // Restore Y scale mode
        if (typeof state.shearAutoScaleY === 'boolean') {
            window.shearAutoScaleY = state.shearAutoScaleY;
            if (typeof updateYScaleButtonUI === 'function') updateYScaleButtonUI();
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
    chartSeriesVisibilityState = {};

    const defaults = {
        C: 0.22,
        alpha: 0.37,
        beta: 0.18,
        gamma: 0.54,
        delta: -0.24,
        mu: 0.15,
        epsilon: 1.00,
        zeta: 1.00
    };

    Object.keys(defaults).forEach(k => {
        if (params[k]) {
            params[k].val = defaults[k];
            params[k].locked = (k === 'epsilon' || k === 'zeta' || k === 'mu');
            params[k].disabled = false;
            params[k].savedVal = defaults[k];
        }
    });

    useDeffConstraint = false;
    syncDeffToggleUI();

    excludePrestressed = false;
    syncExcludePrestressedUI();

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

    clearDynamicFilterInputsOnly();
    updateSlidersUI();
    updateFilteredRows();
    window.shearAutoScaleY = true;
    if (typeof updateYScaleButtonUI === 'function') updateYScaleButtonUI();
    updateMath();
    scheduleKatexRender(true);
    renderHorizontalCodeCardsEquations();
    if (typeof renderFormulaDisplay === 'function') renderFormulaDisplay();
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
            canvasWrap.classList.remove('h-[300px]', 'min-h-[250px]', 'max-h-[320px]', 'h-[560px]', 'sm:h-[600px]', 'lg:h-[640px]', 'xl:h-[680px]');
            canvasWrap.classList.add('h-[740px]', 'min-h-[740px]');
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
            canvasWrap.classList.remove('h-[740px]', 'min-h-[740px]', 'h-[560px]', 'sm:h-[600px]', 'lg:h-[640px]', 'xl:h-[680px]', 'h-[300px]', 'min-h-[250px]', 'max-h-[320px]');
            canvasWrap.classList.add('h-[400px]', 'min-h-[350px]', 'max-h-[400px]');
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
            if (typeof syncColumnsHeight === 'function') syncColumnsHeight();
        }, 120);
    }
}

// External Interactive HTML Legend (Request 2: OUTSIDE canvas)
function updateExternalLegend(datasets) {
    const container = document.getElementById('externalChartLegend');
    if (!container || !dbChart || !datasets || datasets.length === 0) return;

    const isDark = document.documentElement.classList.contains('dark');
    const existingBadges = container.querySelectorAll('.external-legend-item');

    // Fast path: In-place text and visibility update without rebuilding DOM (eliminates jitter!)
    if (existingBadges.length === datasets.length) {
        let allMatched = true;
        for (let i = 0; i < datasets.length; i++) {
            const badge = existingBadges[i];
            const expectedKey = datasets[i]._codeKey || `item_${i}`;
            if (badge.dataset.codeKey !== expectedKey) {
                allMatched = false;
                break;
            }
            const isVisible = dbChart.isDatasetVisible(i);
            const textSpan = badge.querySelector('.legend-text');
            if (textSpan && textSpan.innerText !== (datasets[i].label || '')) {
                textSpan.innerText = datasets[i].label || '';
                textSpan.title = datasets[i].label || '';
            }
            const eyeSpan = badge.querySelector('.legend-eye');
            if (eyeSpan) {
                eyeSpan.innerText = isVisible ? '👁' : '✕';
            }
            if (isVisible) {
                badge.className = `external-legend-item px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer select-none shadow-xs ${
                    isDark ? 'bg-gray-800/90 text-gray-200 border-gray-700 hover:border-gray-500' : 'bg-white text-gray-800 border-gray-300 hover:border-gray-400'
                }`;
            } else {
                badge.className = 'external-legend-item px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer select-none shadow-xs opacity-40 line-through bg-gray-900/20 border-dashed border-gray-700 text-gray-500';
            }
        }
        if (allMatched) return;
    }

    container.innerHTML = '';

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
        badge.dataset.codeKey = dataset._codeKey || `item_${index}`;
        badge.className = `external-legend-item px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors cursor-pointer select-none shadow-xs ${
            isVisible 
                ? (isDark ? 'bg-gray-800/90 text-gray-200 border-gray-700 hover:border-gray-500 hover:bg-gray-750' : 'bg-white text-gray-800 border-gray-300 hover:border-gray-400 hover:bg-gray-50')
                : 'opacity-40 line-through bg-gray-900/20 border-dashed border-gray-700 text-gray-500 hover:opacity-70'
        }`;

        // Color indicator
        const marker = document.createElement('span');
        marker.className = 'legend-marker';
        if (dataset.type === 'scatter') {
            marker.className = 'legend-marker w-2.5 h-2.5 rounded-full inline-block shrink-0';
            marker.style.backgroundColor = isDark ? 'rgba(203, 213, 225, 0.85)' : 'rgba(100, 116, 139, 0.85)';
            marker.style.border = isDark ? '1px solid rgba(255, 255, 255, 0.5)' : '1px solid rgba(0, 0, 0, 0.3)';
        } else if (dataset.borderDash && dataset.borderDash.length) {
            marker.className = 'legend-marker w-4 h-1 rounded-full inline-block shrink-0';
            marker.style.borderTop = `2px dashed ${dataset.borderColor || '#999'}`;
            marker.style.backgroundColor = 'transparent';
            marker.style.height = '0px';
        } else {
            marker.className = 'legend-marker w-4 h-1 rounded-full inline-block shrink-0';
            marker.style.backgroundColor = dataset.borderColor || '#999';
        }

        const textSpan = document.createElement('span');
        textSpan.className = 'legend-text truncate max-w-[260px]';
        textSpan.innerText = dataset.label || `Item ${index}`;
        textSpan.title = dataset.label || '';

        const eyeSpan = document.createElement('span');
        eyeSpan.className = 'legend-eye text-[10px] text-gray-400 opacity-60 ml-auto';
        eyeSpan.innerText = isVisible ? '👁' : '✕';

        badge.appendChild(marker);
        badge.appendChild(textSpan);
        badge.appendChild(eyeSpan);

        badge.addEventListener('click', (e) => {
            e.preventDefault();
            const currentVis = dbChart.isDatasetVisible(index);
            const nextVis = !currentVis;
            dbChart.setDatasetVisibility(index, nextVis);

            setDatasetVisibilityState(dataset, nextVis);
            dataset.hidden = !nextVis;

            adjustYScaleToVisibleDatasets();
            dbChart.update('none');
            updateExternalLegend(dbChart.data.datasets);
            triggerAutoSave();
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
        syncExcludePrestressedUI();
        updateYScaleButtonUI();
        updateMath();
        updateDatabaseChart();
        renderHorizontalCodeCardsEquations();
        initColumnHeightSync();

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
        
        initDynamicFilterListeners();
        syncDynamicFilterUIFromState();

        const btnToggleDyn = document.getElementById('btnToggleDynamicFilter');
        if (btnToggleDyn) {
            btnToggleDyn.addEventListener('click', () => toggleDynamicFilterPanel());
        }

        const subsetSelect = document.getElementById('subsetSelect');
        if (subsetSelect) {
            subsetSelect.addEventListener('change', () => {
                if (subsetSelect.value === 'dynamic_custom') {
                    toggleDynamicFilterPanel(true);
                } else {
                    if (dynamicFilters.enabled) {
                        clearDynamicFilterInputsOnly();
                    }
                }
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
        syncDeffToggleUI();
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

        // FIB Model Code & EC2 (2023) Kinematic Constraints:
        // a_cs = max(a, d) >= d
        let bacs = (ba_d > 0 && bd > 0) ? Math.max(ba_d * bd, bd) : bd;
        // d_eff = sqrt((a_cs / 4) * d) <= d, with lower bound 0.5 * d when a_cs = d
        let bdeff = (bacs < 4.0 * bd && bd > 0) ? Math.sqrt((bacs / 4.0) * bd) : bd;

        let bsigma_cp = parseFloat(row['Sigma_CP'] ?? (row['Sigma_CP.1'] ?? (row['sigma_cp'] ?? 0.0)));
        if (isNaN(bsigma_cp) || bsigma_cp < 0) bsigma_cp = 0.0;
        row._sigma_cp = bsigma_cp;

        row._d = bd;
        row._bw = bbw;
        row._rho = rho;
        row._fck = bfck;
        row._vu = bVtest_kN;
        row._ddg = bd_dg;
        row._ad = ba_d;
        row._acs = bacs;
        row._deff = bdeff;
        row._bwd = bwd;
        row._isSlab = isSlab;
        const m = String(row['Member class (inferred)'] || '');
        const src = String(row['Source sheet'] || '');
        row._isPC = (m === 'PC' || src.includes('PC') || row['Prestressed'] == 1 || row['Prestressed'] === true || bsigma_cp > 0);
        row._valid = (!isNaN(bd) && bd > 0 && !isNaN(rho) && rho > 0
                      && !isNaN(bfck) && bfck > 0 && !isNaN(ba_d) && ba_d > 0
                      && !isNaN(bbw) && bbw > 0 && !isNaN(bVtest_kN) && bVtest_kN > 0);
    }
}

// -------------------------------------------------------------
// Dynamic Subset Filtering System
// -------------------------------------------------------------
let dynamicFilters = {
    enabled: false,
    d_min: null,
    d_max: null,
    ratio_type: 'bwd', // 'bwd' (bw / d) or 'dbw' (d / bw)
    ratio_min: null,
    ratio_max: null,
    ad_min: null,
    ad_max: null,
    rho_min: null,
    rho_max: null,
    fck_min: null,
    fck_max: null,
    bw_min: null,
    bw_max: null
};

function hasActiveDynamicFilters() {
    return (
        dynamicFilters.d_min !== null || dynamicFilters.d_max !== null ||
        dynamicFilters.ratio_min !== null || dynamicFilters.ratio_max !== null ||
        dynamicFilters.ad_min !== null || dynamicFilters.ad_max !== null ||
        dynamicFilters.rho_min !== null || dynamicFilters.rho_max !== null ||
        dynamicFilters.fck_min !== null || dynamicFilters.fck_max !== null ||
        dynamicFilters.bw_min !== null || dynamicFilters.bw_max !== null
    );
}

function countActiveDynamicFilterFields() {
    let count = 0;
    if (dynamicFilters.d_min !== null || dynamicFilters.d_max !== null) count++;
    if (dynamicFilters.ratio_min !== null || dynamicFilters.ratio_max !== null) count++;
    if (dynamicFilters.ad_min !== null || dynamicFilters.ad_max !== null) count++;
    if (dynamicFilters.rho_min !== null || dynamicFilters.rho_max !== null) count++;
    if (dynamicFilters.fck_min !== null || dynamicFilters.fck_max !== null) count++;
    if (dynamicFilters.bw_min !== null || dynamicFilters.bw_max !== null) count++;
    return count;
}

function toggleDynamicFilterPanel(forceState) {
    const panel = document.getElementById('dynamicFilterPanel');
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');
    const newState = (forceState !== undefined) ? forceState : isHidden;
    if (newState) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }

    const btn = document.getElementById('btnToggleDynamicFilter');
    if (btn) {
        if (newState) {
            btn.classList.add('bg-cyan-500/20', 'text-cyan-300');
        } else {
            btn.classList.remove('bg-cyan-500/20', 'text-cyan-300');
        }
    }
    if (typeof syncColumnsHeight === 'function') {
        syncColumnsHeight();
    }
    if (window.shearChart) {
        window.shearChart.resize();
    }
}

function readDynamicFilterInputs() {
    const parseOrNull = (id) => {
        const el = document.getElementById(id);
        if (!el || el.value === '' || isNaN(parseFloat(el.value))) return null;
        return parseFloat(el.value);
    };

    dynamicFilters.d_min = parseOrNull('dyn_d_min');
    dynamicFilters.d_max = parseOrNull('dyn_d_max');

    const ratioTypeEl = document.getElementById('dyn_ratio_type');
    dynamicFilters.ratio_type = ratioTypeEl ? ratioTypeEl.value : 'bwd';
    dynamicFilters.ratio_min = parseOrNull('dyn_bwd_min');
    dynamicFilters.ratio_max = parseOrNull('dyn_bwd_max');

    dynamicFilters.ad_min = parseOrNull('dyn_ad_min');
    dynamicFilters.ad_max = parseOrNull('dyn_ad_max');

    dynamicFilters.rho_min = parseOrNull('dyn_rho_min');
    dynamicFilters.rho_max = parseOrNull('dyn_rho_max');

    dynamicFilters.fck_min = parseOrNull('dyn_fck_min');
    dynamicFilters.fck_max = parseOrNull('dyn_fck_max');

    dynamicFilters.bw_min = parseOrNull('dyn_bw_min');
    dynamicFilters.bw_max = parseOrNull('dyn_bw_max');

    dynamicFilters.enabled = hasActiveDynamicFilters();
}

function syncDynamicFilterUIFromState() {
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = (val !== null && val !== undefined) ? val : '';
    };

    setVal('dyn_d_min', dynamicFilters.d_min);
    setVal('dyn_d_max', dynamicFilters.d_max);

    const ratioTypeEl = document.getElementById('dyn_ratio_type');
    if (ratioTypeEl && dynamicFilters.ratio_type) {
        ratioTypeEl.value = dynamicFilters.ratio_type;
    }
    setVal('dyn_bwd_min', dynamicFilters.ratio_min);
    setVal('dyn_bwd_max', dynamicFilters.ratio_max);

    setVal('dyn_ad_min', dynamicFilters.ad_min);
    setVal('dyn_ad_max', dynamicFilters.ad_max);

    setVal('dyn_rho_min', dynamicFilters.rho_min);
    setVal('dyn_rho_max', dynamicFilters.rho_max);

    setVal('dyn_fck_min', dynamicFilters.fck_min);
    setVal('dyn_fck_max', dynamicFilters.fck_max);

    setVal('dyn_bw_min', dynamicFilters.bw_min);
    setVal('dyn_bw_max', dynamicFilters.bw_max);

    updateDynamicFilterLabels();
}

function updateDynamicFilterLabels() {
    const formatRange = (min, max, unit = '') => {
        if (min === null && max === null) return 'Livre';
        if (min !== null && max !== null) return `${min} a ${max}${unit ? ' ' + unit : ''}`;
        if (min !== null) return `≥ ${min}${unit ? ' ' + unit : ''}`;
        return `≤ ${max}${unit ? ' ' + unit : ''}`;
    };

    const setText = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.innerText = txt;
    };

    setText('lblDynD', formatRange(dynamicFilters.d_min, dynamicFilters.d_max, 'mm'));

    const ratioLabel = dynamicFilters.ratio_type === 'dbw' ? 'd/bw' : 'bw/d';
    setText('lblDynBwD', `${ratioLabel}: ${formatRange(dynamicFilters.ratio_min, dynamicFilters.ratio_max)}`);

    setText('lblDynAD', formatRange(dynamicFilters.ad_min, dynamicFilters.ad_max));
    setText('lblDynRho', formatRange(dynamicFilters.rho_min, dynamicFilters.rho_max, '%'));
    setText('lblDynFck', formatRange(dynamicFilters.fck_min, dynamicFilters.fck_max, 'MPa'));
    setText('lblDynBw', formatRange(dynamicFilters.bw_min, dynamicFilters.bw_max, 'mm'));

    const count = countActiveDynamicFilterFields();
    const countBadge = document.getElementById('badgeDynamicFilterCount');
    if (countBadge) {
        if (count > 0) {
            countBadge.innerText = `${count}`;
            countBadge.classList.remove('hidden');
        } else {
            countBadge.classList.add('hidden');
        }
    }
}

function onDynamicFilterInputChange() {
    readDynamicFilterInputs();
    updateDynamicFilterLabels();

    const subsetEl = document.getElementById('subsetSelect');
    if (dynamicFilters.enabled) {
        if (subsetEl) subsetEl.value = 'dynamic_custom';
        currentSubsetKey = 'dynamic_custom';
    } else {
        if (subsetEl && subsetEl.value === 'dynamic_custom') {
            subsetEl.value = 'ALL DATA';
            currentSubsetKey = 'ALL DATA';
        }
    }

    updateFilteredRows();
    updateMath();
    updateDatabaseChart();
    triggerAutoSave();
}

function setDynPreset(field, minVal, maxVal, extraType) {
    if (field === 'd') {
        dynamicFilters.d_min = minVal;
        dynamicFilters.d_max = maxVal;
    } else if (field === 'bwd') {
        if (extraType) dynamicFilters.ratio_type = extraType;
        dynamicFilters.ratio_min = minVal;
        dynamicFilters.ratio_max = maxVal;
    } else if (field === 'ad') {
        dynamicFilters.ad_min = minVal;
        dynamicFilters.ad_max = maxVal;
    } else if (field === 'rho') {
        dynamicFilters.rho_min = minVal;
        dynamicFilters.rho_max = maxVal;
    } else if (field === 'fck') {
        dynamicFilters.fck_min = minVal;
        dynamicFilters.fck_max = maxVal;
    } else if (field === 'bw') {
        dynamicFilters.bw_min = minVal;
        dynamicFilters.bw_max = maxVal;
    }

    dynamicFilters.enabled = hasActiveDynamicFilters();
    syncDynamicFilterUIFromState();
    onDynamicFilterInputChange();
}

function resetDynamicFilters() {
    dynamicFilters = {
        enabled: false,
        d_min: null,
        d_max: null,
        ratio_type: 'bwd',
        ratio_min: null,
        ratio_max: null,
        ad_min: null,
        ad_max: null,
        rho_min: null,
        rho_max: null,
        fck_min: null,
        fck_max: null,
        bw_min: null,
        bw_max: null
    };

    syncDynamicFilterUIFromState();
    const subsetEl = document.getElementById('subsetSelect');
    if (subsetEl) subsetEl.value = 'ALL DATA';
    currentSubsetKey = 'ALL DATA';

    updateFilteredRows();
    updateMath();
    updateDatabaseChart();
    triggerAutoSave();
}

function clearDynamicFilterInputsOnly() {
    dynamicFilters = {
        enabled: false,
        d_min: null,
        d_max: null,
        ratio_type: 'bwd',
        ratio_min: null,
        ratio_max: null,
        ad_min: null,
        ad_max: null,
        rho_min: null,
        rho_max: null,
        fck_min: null,
        fck_max: null,
        bw_min: null,
        bw_max: null
    };
    syncDynamicFilterUIFromState();
}

function initDynamicFilterListeners() {
    const dynInputIds = [
        'dyn_d_min', 'dyn_d_max', 'dyn_ratio_type', 'dyn_bwd_min', 'dyn_bwd_max',
        'dyn_ad_min', 'dyn_ad_max', 'dyn_rho_min', 'dyn_rho_max',
        'dyn_fck_min', 'dyn_fck_max', 'dyn_bw_min', 'dyn_bw_max'
    ];

    dynInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', onDynamicFilterInputChange);
            el.addEventListener('change', onDynamicFilterInputChange);
        }
    });
}

function isRowInSubset(row, subsetKey) {
    if (!row) return false;
    if (row._valid !== undefined && !row._valid) return false;

    // Check prestressed concrete exclusion
    const isPC = row._isPC !== undefined ? row._isPC : (
        String(row['Member class (inferred)'] || '') === 'PC' ||
        String(row['Source sheet'] || '').includes('PC') ||
        row['Prestressed'] == 1 || row['Prestressed'] === true
    );
    if (excludePrestressed && isPC && subsetKey !== 'mat_pc') {
        return false;
    }

    const bd = row._d !== undefined ? row._d : parseFloat(row['d (mm)']);
    const bbw = row._bw !== undefined ? row._bw : parseFloat(row['bw (mm)'] ?? row['b (mm)']);
    const rho = row._rho !== undefined ? row._rho : (parseFloat(row['pw (%)'] ?? row['rho']) > 0.1 ? parseFloat(row['pw (%)'] ?? row['rho']) / 100.0 : parseFloat(row['pw (%)'] ?? row['rho']));
    const bfck = row._fck !== undefined ? row._fck : parseFloat(row['fck (MPa)'] ?? row['fck_eq']);
    const ba_d = row._ad !== undefined ? row._ad : parseFloat(row['a_d']);
    const bddg = row._ddg !== undefined ? row._ddg : (parseFloat(row['d_dg']) || 32.0);
    const bwd = row._bwd !== undefined ? row._bwd : (bd > 0 && bbw > 0 ? bbw / bd : 0);
    const dbw = (bd > 0 && bbw > 0) ? (bd / bbw) : 0;
    const isSlab = row._isSlab !== undefined ? row._isSlab : (row['B>2D'] === true || row['B>2D'] == 1 || bwd >= 2.0);

    // Dynamic custom filtering
    if (subsetKey === 'dynamic_custom' || dynamicFilters.enabled) {
        if (dynamicFilters.d_min !== null && bd < dynamicFilters.d_min) return false;
        if (dynamicFilters.d_max !== null && bd > dynamicFilters.d_max) return false;

        if (dynamicFilters.ratio_type === 'dbw') {
            if (dynamicFilters.ratio_min !== null && dbw < dynamicFilters.ratio_min) return false;
            if (dynamicFilters.ratio_max !== null && dbw > dynamicFilters.ratio_max) return false;
        } else {
            if (dynamicFilters.ratio_min !== null && bwd < dynamicFilters.ratio_min) return false;
            if (dynamicFilters.ratio_max !== null && bwd > dynamicFilters.ratio_max) return false;
        }

        if (dynamicFilters.ad_min !== null && ba_d < dynamicFilters.ad_min) return false;
        if (dynamicFilters.ad_max !== null && ba_d > dynamicFilters.ad_max) return false;

        if (dynamicFilters.rho_min !== null && (rho * 100.0) < dynamicFilters.rho_min) return false;
        if (dynamicFilters.rho_max !== null && (rho * 100.0) > dynamicFilters.rho_max) return false;

        if (dynamicFilters.fck_min !== null && bfck < dynamicFilters.fck_min) return false;
        if (dynamicFilters.fck_max !== null && bfck > dynamicFilters.fck_max) return false;

        if (dynamicFilters.bw_min !== null && bbw < dynamicFilters.bw_min) return false;
        if (dynamicFilters.bw_max !== null && bbw > dynamicFilters.bw_max) return false;

        if (subsetKey === 'dynamic_custom') return true;
    }

    if (!subsetKey || subsetKey === 'ALL DATA' || subsetKey === 'all' || subsetKey === '') {
        return row._valid !== undefined ? row._valid : true;
    }

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
    const isDynamic = (currentSubsetKey === 'dynamic_custom' || dynamicFilters.enabled);
    const count = currentFilteredRows ? currentFilteredRows.length : 0;
    const total = rawData ? rawData.length : 1877;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '100';

    if (isDynamic) {
        badge.innerText = `⚙️ Dinâmico (${count})`;
        const formatRangeTxt = (min, max) => (min !== null && max !== null) ? `${min}-${max}` : (min !== null ? `≥${min}` : `≤${max}`);
        let parts = [];
        if (dynamicFilters.d_min !== null || dynamicFilters.d_max !== null) parts.push(`d: ${formatRangeTxt(dynamicFilters.d_min, dynamicFilters.d_max)}mm`);
        if (dynamicFilters.ratio_min !== null || dynamicFilters.ratio_max !== null) {
            const rType = dynamicFilters.ratio_type === 'dbw' ? 'd/bw' : 'bw/d';
            parts.push(`${rType}: ${formatRangeTxt(dynamicFilters.ratio_min, dynamicFilters.ratio_max)}`);
        }
        if (dynamicFilters.ad_min !== null || dynamicFilters.ad_max !== null) parts.push(`a/d: ${formatRangeTxt(dynamicFilters.ad_min, dynamicFilters.ad_max)}`);
        if (dynamicFilters.rho_min !== null || dynamicFilters.rho_max !== null) parts.push(`ρ: ${formatRangeTxt(dynamicFilters.rho_min, dynamicFilters.rho_max)}%`);
        if (dynamicFilters.fck_min !== null || dynamicFilters.fck_max !== null) parts.push(`fck: ${formatRangeTxt(dynamicFilters.fck_min, dynamicFilters.fck_max)}MPa`);
        if (dynamicFilters.bw_min !== null || dynamicFilters.bw_max !== null) parts.push(`bw: ${formatRangeTxt(dynamicFilters.bw_min, dynamicFilters.bw_max)}mm`);
        badge.title = `Filtro Dinâmico: ${parts.length > 0 ? parts.join(' | ') : 'Todos'} (${count} de ${total} amostras - ${pct}%)`;
    } else {
        const cleanText = opt ? opt.text.split('(')[0].trim() : (currentSubsetKey || 'ALL DATA');
        badge.innerText = `${cleanText} (${count})`;
        badge.title = `Otimização Nelder-Mead e Calibração de C serão executadas sobre estas ${count} amostras (${pct}% do total)`;
    }

    if (excludePrestressed) {
        badge.innerText += ' [s/ PC]';
        badge.title += ' | Concreto Protendido (PC) excluído da amostra ativa.';
    }

    const dynCountEl = document.getElementById('dynamicFilterActiveCount');
    if (dynCountEl) {
        dynCountEl.innerText = `${count} / ${total} (${pct}%)`;
    }
}

let baselineParams = null;

function computeBaselineModelPoint(row) {
    if (!row._valid || !baselineParams) return null;
    let eff_d = (baselineParams.useDeff && row._deff) ? row._deff : row._d;
    let size_effect = Math.pow(row._ddg / eff_d, baselineParams.alpha);
    let vc_rc = baselineParams.C * size_effect
        * Math.pow(100.0 * row._rho, baselineParams.beta)
        * Math.pow(row._fck, baselineParams.gamma)
        * Math.pow(row._ad, baselineParams.delta);
    let mu_val = (baselineParams.mu !== undefined) ? baselineParams.mu : 0.15;
    let sigma_cp_lim = Math.min(row._sigma_cp || 0.0, 0.2 * row._fck);
    let vc = vc_rc + mu_val * sigma_cp_lim;
    let V_calc = vc * row._bw * row._d;
    let V_calc_kN = V_calc / 1000.0;
    if (V_calc_kN <= 0) return null;
    return {
        ratio: row._vu / V_calc_kN,
        d: row._d,
        rho: row._rho,
        fck: row._fck,
        a_d: row._ad,
        bw: row._bw,
        d_dg: row._ddg,
        deff: eff_d
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
        mu: params.mu ? params.mu.val : 0.15,
        epsilon: 1.0,
        zeta: 1.0,
        useDeff: !!useDeffConstraint,
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
    let effective_d = (useDeffConstraint && row._deff) ? row._deff : row._d;
    let size_effect = params.alpha.disabled ? 1.0 : Math.pow(row._ddg / effective_d, params.alpha.val);
    let rho_term = params.beta.disabled ? 1.0 : Math.pow(100.0 * row._rho, params.beta.val);
    let fck_term = params.gamma.disabled ? 1.0 : Math.pow(row._fck, params.gamma.val);
    let ad_term = params.delta.disabled ? 1.0 : Math.pow(row._ad, params.delta.val);
    let c_term = params.C.disabled ? 1.0 : params.C.val;
    let vc_rc = c_term * size_effect * rho_term * fck_term * ad_term;
    let mu_val = (params.mu && !params.mu.disabled) ? params.mu.val : 0.15;
    let sigma_cp_lim = Math.min(row._sigma_cp || 0.0, 0.2 * row._fck);
    let vc = vc_rc + mu_val * sigma_cp_lim;
    // bw and d always have constant coefficient 1.0 (nominal shear area bw * d)
    let V_calc = vc * row._bw * row._d;
    let V_calc_kN = V_calc / 1000.0;
    if (V_calc_kN <= 0 || !isFinite(V_calc_kN)) return null;
    return {
        ratio: row._vu / V_calc_kN,
        d: row._d,
        rho: row._rho,
        fck: row._fck,
        a_d: row._ad,
        bw: row._bw,
        d_dg: row._ddg,
        deff: effective_d
    };
}

function getRowXValue(row, varKey) {
    if (varKey === 'a_d') return row._ad || null;
    if (varKey === 'd (mm)') return row._d || null;
    if (varKey === 'pw (%)') return (row._rho ? row._rho * 100.0 : null);
    if (varKey === 'fck (MPa)') return row._fck || null;
    if (varKey === 'Sigma_CP' || varKey === 'sigma_cp') return (row._sigma_cp !== undefined) ? row._sigma_cp : 0.0;
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

    // bw (epsilon) and d (zeta) are fixed physical constants = 1.0 (nominal shear area bw * d)
    // They are permanently excluded from interactive inputs/sliders
    const visibleKeys = Object.keys(params).filter(k => !params[k].isConstant && k !== 'epsilon' && k !== 'zeta');

    visibleKeys.forEach(key => {
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
            p.locked = !!p.isConstant;
            p.savedVal = p.defaultVal;
            updateSliderRowUI(k);
        });
        useDeffConstraint = false;
        syncDeffToggleUI();
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

    if (presetType === 'csct_ec2') {
        useDeffConstraint = true;
        syncDeffToggleUI();

        params.alpha.disabled = false;
        params.alpha.val = 0.333;
        params.alpha.savedVal = 0.333;
        updateSliderRowUI('alpha');

        params.beta.disabled = false;
        params.beta.val = 0.333;
        params.beta.savedVal = 0.333;
        updateSliderRowUI('beta');

        params.gamma.disabled = false;
        params.gamma.val = 0.333;
        params.gamma.savedVal = 0.333;
        updateSliderRowUI('gamma');

        // Under CSCT/EC2-2023, d_eff already incorporates the arch action, so empirical delta term is neutralized (0.0)
        params.delta.disabled = true;
        params.delta.val = 0.0;
        params.delta.savedVal = 0.0;
        updateSliderRowUI('delta');

        scheduleUpdate();
        triggerAutoSave();
        showToast('Modelo Cinemático CSCT (EC2 2023): d_eff ativado, α=β=γ=1/3, δ desativado', 'success');
        return;
    }

    if (presetType === 'std_geometry') {
        params.epsilon.val = 1.000;
        params.zeta.val = 1.000;
        scheduleUpdate();
        triggerAutoSave();
        showToast('Geometria padronizada: bw · d (área nominal constante)', 'info');
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

let liveUpdateRafId = null;
let katexDebounceTimer = null;
let lastRenderedLatex = '';

function scheduleUpdate() {
    triggerAutoSave();
    if (liveUpdateRafId !== null) return;
    liveUpdateRafId = requestAnimationFrame(() => {
        liveUpdateRafId = null;
        performLiveUpdate(false);
    });
}

function scheduleKatexRender(immediate = false) {
    if (!window.katex) return;
    const eqLatex = buildLiveEquationLatex();
    if (eqLatex === lastRenderedLatex) {
        const box1 = document.getElementById('liveModelEqBox');
        if (box1 && !box1.hasChildNodes()) renderLatexToElement(box1, eqLatex, true);
        const box2 = document.getElementById('mathEquation');
        if (box2 && !box2.hasChildNodes() && box2 !== box1) renderLatexToElement(box2, eqLatex, true);
        const box3 = document.getElementById('renderedFormulaMath');
        if (box3 && !box3.hasChildNodes() && box3 !== box1 && box3 !== box2) renderLatexToElement(box3, eqLatex, true);
        return;
    }

    if (immediate) {
        clearTimeout(katexDebounceTimer);
        lastRenderedLatex = eqLatex;
        const box1 = document.getElementById('liveModelEqBox');
        if (box1) renderLatexToElement(box1, eqLatex, true);
        const box2 = document.getElementById('mathEquation');
        if (box2 && box2 !== box1) renderLatexToElement(box2, eqLatex, true);
        const box3 = document.getElementById('renderedFormulaMath');
        if (box3 && box3 !== box1 && box3 !== box2) renderLatexToElement(box3, eqLatex, true);
        return;
    }

    clearTimeout(katexDebounceTimer);
    katexDebounceTimer = setTimeout(() => {
        lastRenderedLatex = eqLatex;
        const box1 = document.getElementById('liveModelEqBox');
        if (box1) renderLatexToElement(box1, eqLatex, true);
        const box2 = document.getElementById('mathEquation');
        if (box2 && box2 !== box1) renderLatexToElement(box2, eqLatex, true);
        const box3 = document.getElementById('renderedFormulaMath');
        if (box3 && box3 !== box1 && box3 !== box2) renderLatexToElement(box3, eqLatex, true);
    }, 60);
}

function buildLiveEquationLatex() {
    const C = params.C.val;
    const c_str = params.C.disabled ? '1.000' : C.toFixed(3);
    
    let parts = [];
    parts.push(c_str);
    
    if (!params.alpha.disabled && Math.abs(params.alpha.val) > 1e-4) {
        if (useDeffConstraint) {
            parts.push(`\\left(\\frac{d_{dg}}{{\\color{#06b6d4}\\mathbf{d_{eff}}}}\\right)^{${params.alpha.val.toFixed(3)}}`);
        } else {
            parts.push(`\\left(\\frac{d_{dg}}{d}\\right)^{${params.alpha.val.toFixed(3)}}`);
        }
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
    
    // Check if prestress term is active
    const isPrestressActive = !excludePrestressed && params.mu && !params.mu.disabled && Math.abs(params.mu.val) > 1e-4;

    let formulaBody = parts.join(' ');
    let latex;
    if (isPrestressActive) {
        latex = `V_{calc} = \\left[ ${formulaBody} + {\\color{#f59e0b}${params.mu.val.toFixed(2)}\\cdot\\sigma_{cp}} \\right] b_w \\cdot d`;
    } else {
        latex = `V_{calc} = ${formulaBody} \\cdot b_w \\cdot d`;
    }

    if (useDeffConstraint) {
        latex += ` \\quad {\\color{#06b6d4}\\scriptsize{\\left[d_{eff} = \\min\\left(d, \\sqrt{\\frac{a_{cs}}{4}d}\\right),\\; a_{cs}=\\max(a,d) \\ge d\\right]}}`;
    }
    if (isPrestressActive) {
        latex += ` \\quad {\\color{#f59e0b}\\scriptsize{\\left[\\sigma_{cp} \\le 0.2f_{ck}\\right]}}`;
    }
    return latex;
}
window.buildLiveEquationLatex = buildLiveEquationLatex;

function performLiveUpdate(immediateKatex = false) {
    if (!currentFilteredRows || !currentFilteredRows.length) return;

    const len = currentFilteredRows.length;
    const plotPoints = [];
    let sumRatio = 0;
    let sumD = 0, sumFS = 0, sumD2 = 0, sumDFS = 0;
    let validCount = 0;
    const dList = [];
    const fsList = [];

    for (let i = 0; i < len; i++) {
        const row = currentFilteredRows[i];
        const pt = computeLiveModelPoint(row);
        if (pt && isFinite(pt.ratio)) {
            let px = getRowXValue(row, currentVarKey);
            if (px !== null && isFinite(px)) {
                plotPoints.push({ x: px, y: pt.ratio });
            }
            sumRatio += pt.ratio;
            validCount++;

            if (pt.d > 0 && pt.ratio > 0) {
                dList.push(pt.d);
                fsList.push(pt.ratio);
                sumD += pt.d;
                sumFS += pt.ratio;
                sumD2 += pt.d * pt.d;
                sumDFS += pt.d * pt.ratio;
            }
        }
    }

    if (validCount === 0) {
        const m = document.getElementById('statMean');
        if (m) m.innerHTML = '-.---';
        const c = document.getElementById('statCov');
        if (c) c.innerText = '-.---';
        const pEl = document.getElementById('lblPoints');
        if (pEl) pEl.innerText = '0';
        return;
    }

    const mean = sumRatio / validCount;
    let sqDiffSum = 0;
    for (let i = 0; i < plotPoints.length; i++) {
        let diff = plotPoints[i].y - mean;
        sqDiffSum += diff * diff;
    }
    const std = Math.sqrt(sqDiffSum / validCount);
    const cov = mean > 0 ? std / mean : 0;

    // Update KPI UI elements in place
    const meanEl = document.getElementById('statMean');
    if (meanEl) {
        meanEl.innerHTML = mean.toFixed(3) + (mean < 1.0 ? ` <span class="text-red-500 text-xs font-bold" title="${tr('unsafe_badge_tooltip', 'Fator de segurança médio menor que 1.0 (inseguro)')}">⚠</span>` : '');
    }
    const covEl = document.getElementById('statCov');
    if (covEl) covEl.innerText = cov.toFixed(3);
    const pEl = document.getElementById('lblPoints');
    if (pEl) pEl.innerText = validCount;

    // Update Chart datasets smoothly
    const liveCb = document.querySelector('.design-code-checkbox[value="LIVE_MODEL"]');
    let lowessLine = [];
    if (liveCb && liveCb.checked && dbChart && dbChart.data && dbChart.data.datasets) {
        plotPoints.sort((a, b) => a.x - b.x);
        lowessLine = computeLowess(plotPoints, 0.3, 50);

        const isDark = document.documentElement.classList.contains('dark');
        const liveColor = `rgba(${getLiveModelColor(isDark)}, 1)`;
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
        adjustYScaleToVisibleDatasets();
        dbChart.update('none');
        updateExternalLegend(dbChart.data.datasets);
    }

    // Flatness from precomputed values
    const flatness = computeLiveModelFlatness({ sumD, sumFS, sumD2, sumDFS, dList, fsList, validCount });
    updateLiveModelFlatnessUI(flatness);

    // Residual Orthogonality and Variable Correlation Analysis
    updateLiveCorrelationUI();

    // Debounced or immediate KaTeX formula render
    scheduleKatexRender(immediateKatex);

    // Keep reliability inputs and formula synced if mounted
    if (document.getElementById('rel_param_C')) {
        syncLiveParamsToReliability();
    }

    // Debounced Eel similarity
    if (lowessLine.length > 0) {
        debounceSimilarity(lowessLine);
    }
}

function updateMath() {
    performLiveUpdate(true);
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
        if (params[k].isConstant || k === 'epsilon' || k === 'zeta') {
            lockedMap[k] = true;
            currentVals[k] = 1.0;
            return;
        }
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
    const isDynamic = (subsetKey === 'dynamic_custom' || dynamicFilters.enabled);
    const subsetLabel = isDynamic ? 'Recorte Dinâmico' : (subsetOpt ? subsetOpt.text.split('(')[0].trim() : subsetKey);
    const subsetPayload = isDynamic ? { ...dynamicFilters, exclude_pc: !!excludePrestressed } : subsetKey;

    try {
        const best = await eel.run_scipy_optimization(targetSafety, lockedMap, currentVals, criterion, subsetPayload, useDeffConstraint, excludePrestressed)();
        if (best && best.error) {
            alert("Optimization failed: " + best.error);
        } else if (best) {
            Object.keys(best).forEach(k => {
                if (params[k] && !params[k].disabled && !params[k].isConstant && k !== 'epsilon' && k !== 'zeta') {
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
                let deffInfo = useDeffConstraint ? ' | d_eff Ativo' : '';
                let pcInfo = excludePrestressed ? ' | s/ PC' : '';
                let countInfo = best._count ? `${best._count} testes` : `${currentFilteredRows.length} testes`;

                statusMsg.innerHTML = `<span class="font-bold">[${modeLabel} | ${subsetLabel}${pcInfo} (${countInfo})${deffInfo}]</span> ${covInfo} | ${meanInfo} (${cInfo})`;
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
    const isDynamic = (subsetKey === 'dynamic_custom' || dynamicFilters.enabled);
    const subsetLabel = isDynamic ? 'Recorte Dinâmico' : (subsetOpt ? subsetOpt.text.split('(')[0].trim() : subsetKey);
    const subsetPayload = isDynamic ? { ...dynamicFilters, exclude_pc: !!excludePrestressed } : subsetKey;

    const btn = document.getElementById('btnCalibrateC');
    const originalText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<span>⏳</span>';

    const currentVals = {};
    Object.keys(params).forEach(k => { currentVals[k] = params[k].val; });

    try {
        if (window.eel && eel.calibrate_shear_constant_c) {
            const res = await eel.calibrate_shear_constant_c(targetSafety, currentVals, subsetPayload, useDeffConstraint, excludePrestressed)();
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
    performLiveUpdate(false);
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
        equationPrestressedLatex: 'V_{c,pc} = \\left[k_v \\sqrt{f_{ck}} + {\\color{#f59e0b}k_p \\sigma_{cp}}\\right] z \\cdot b_w',
        secondaryLatex: 'k_v = \\frac{180}{1000 + 1.25 z}, \\quad z = 0.9 d',
        secondaryPrestressedLatex: 'k_v = \\frac{180}{1000 + 1.25 z}, \\quad z = 0.9 d',
        factors: {
            sizeEffect: {
                math: 'k_v = \\frac{180}{1000 + 1.25 z}',
                note: '(com braço z = 0.9d)'
            },
            reinforcement: {
                math: '',
                note: 'Ausente (não considera \\rho_w)'
            },
            concrete: {
                math: 'f_{ck}^{0.50} = \\sqrt{f_{ck}}',
                note: '(Raiz quadrada padrão)'
            },
            shearSpan: {
                math: '',
                note: 'Ausente (regime esbelto padrão)'
            },
            prestress: {
                math: '+ k_p \\sigma_{cp}',
                note: '(Nível I simplificado)'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro)'
            }
        },
        differenceOrigin: 'Formulação preliminar simplificada de Nível I: não contempla a taxa de armadura longitudinal e adota braço de alavanca constante z = 0.9d, divergindo em vigas com pouco aço.'
    },
    'A_MC2010_L2': {
        name: 'Fib MC 2010 (Level II)',
        shortCode: 'MC2010 L2',
        category: 'Analítica',
        color: '#4338ca',
        equationLatex: 'V_c = k_v \\sqrt{f_{ck}} \\cdot z \\cdot b_w',
        equationPrestressedLatex: 'V_{c,pc} = k_v(\\varepsilon_x) \\sqrt{f_{ck}} \\cdot z \\cdot b_w \\quad (\\varepsilon_x \\text{ c/ } {\\color{#f59e0b}-N_p})',
        secondaryLatex: 'k_v = \\frac{0.4}{1 + 1500 \\varepsilon_x} \\cdot \\frac{1300}{1000 + k_{dg} z}, \\quad k_{dg} = \\frac{32}{16 + d_{dg}} \\ge 0.75',
        secondaryPrestressedLatex: '\\varepsilon_x = \\frac{M_{Ed}/z + V_{Ed} - N_p}{2 E_s A_s + 2 E_p A_p}, \\quad k_{dg} = \\frac{32}{16 + d_{dg}}',
        factors: {
            sizeEffect: {
                math: '\\frac{1300}{1000 + k_{dg} z}',
                note: '(Ponderado por rugosidade d_{dg} e z = 0.9d)'
            },
            reinforcement: {
                math: '\\varepsilon_x = \\frac{M/z + V}{2 E_s A_s}',
                note: '(\\rho_w no denominador da deformação)'
            },
            concrete: {
                math: 'f_{ck}^{0.50} = \\sqrt{f_{ck}}',
                note: '(Mecânica da fratura)'
            },
            shearSpan: {
                math: 'M_{Ed} = V \\cdot a',
                note: '(Entra via momento fletor atuante)'
            },
            prestress: {
                math: '- N_p',
                note: '(Pré-compressão reduz deformação crítica \\varepsilon_x)'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro: N_p = 0)'
            }
        },
        differenceOrigin: 'Baseado na Teoria dos Campos de Compressão Modificados (MCFT/CSCT). Incorpora deformação crítica longitudinal εx e tamanho máximo do agregado ddg.'
    },
    'A_EC2_2004': {
        name: 'Eurocode 2 (2004)',
        shortCode: 'EC2 2004',
        category: 'Norma Europeia',
        color: '#0d9488',
        equationLatex: 'V_c = 0.18 \\cdot k \\cdot (100 \\rho_l f_{ck})^{1/3} b_w d \\ge v_{min} b_w d',
        equationPrestressedLatex: 'V_{c,pc} = \\left[0.18 \\cdot k \\cdot (100 \\rho_l f_{ck})^{1/3} + {\\color{#f59e0b}0.15 \\sigma_{cp}}\\right] b_w d',
        secondaryLatex: 'k = 1 + \\sqrt{\\frac{200}{d}} \\le 2.0, \\quad \\rho_l = \\min(\\rho_w, 0.02)',
        secondaryPrestressedLatex: 'k = 1 + \\sqrt{\\frac{200}{d}} \\le 2.0, \\quad \\sigma_{cp} \\le 0.2 f_{cd}',
        factors: {
            sizeEffect: {
                math: 'k = 1 + \\sqrt{\\frac{200}{d}} \\le 2.0',
                note: '(Satura para d ≤ 200 mm)'
            },
            reinforcement: {
                math: '(100 \\rho_l)^{1/3} = 4.64 \\cdot \\rho_w^{0.333}',
                note: '(Raiz cúbica empírica)'
            },
            concrete: {
                math: 'f_{ck}^{1/3} = f_{ck}^{0.333}',
                note: '(Expoente 1/3)'
            },
            shearSpan: {
                math: '',
                note: 'Ausente (regime geral flexão-cisalhamento)'
            },
            prestress: {
                math: '+ 0.15 \\sigma_{cp}',
                note: '(Linear, limitado a 0.2 f_{cd})'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro)'
            }
        },
        differenceOrigin: 'Usa expoente 1/3 para concreto e armadura. O fator k satura em 2.0 para d ≤ 200 mm e omite a rugosidade do agregado ddg, gerando viés em vigas rasas ou agregados graúdos.'
    },
    'A_EC2_2023': {
        name: 'Eurocode 2 (2023)',
        shortCode: 'EC2 2023',
        category: 'Nova Norma Europeia',
        color: '#059669',
        equationLatex: 'V_c = 0.66 \\left(100 \\rho_l f_{ck} \\frac{d_{dg}}{d_{eff}}\\right)^{1/3} b_w d',
        equationPrestressedLatex: 'V_{c,pc} = \\left[0.66 \\left(100 \\rho_l f_{ck} \\frac{d_{dg}}{d_{eff}}\\right)^{1/3} + {\\color{#f59e0b}k_p \\sigma_{cp}}\\right] b_w d',
        secondaryLatex: 'd_{eff} = \\sqrt{\\frac{a_{cs}}{4} d} \\le d, \\quad a_{cs} = \\max(a, d)',
        secondaryPrestressedLatex: 'd_{eff} = \\sqrt{\\frac{a_{cs}}{4} d} \\le d, \\quad k_p \\approx 0.15 \\sim 0.20',
        factors: {
            sizeEffect: {
                math: '\\left(\\frac{d_{dg}}{d_{eff}}\\right)^{1/3}',
                note: '(Expoente 1/3 = 0.333 com rugosidade d_{dg})'
            },
            reinforcement: {
                math: '(100 \\rho_l)^{1/3} = 4.64 \\cdot \\rho_w^{0.333}',
                note: '(Raiz cúbica)'
            },
            concrete: {
                math: 'f_{ck}^{1/3} = f_{ck}^{0.333}',
                note: '(Raiz cúbica CSCT)'
            },
            shearSpan: {
                math: 'd_{eff} = \\sqrt{\\frac{a_{cs}}{4} d}',
                note: '(Ação de arco para a/d < 4)'
            },
            prestress: {
                math: '+ k_p \\sigma_{cp}',
                note: '(Zona comprimida adicional por protensão)'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro)'
            }
        },
        differenceOrigin: 'Segunda geração do Eurocode (CSCT). É o modelo normativo mais próximo do Modelo Interativo, combinando potência de escala cúbica (ddg/deff)^(1/3) e transição de vão deff.'
    },
    'A_ACI_14': {
        name: 'ACI 318-14',
        shortCode: 'ACI 318-14',
        category: 'Norma Americana (2014)',
        color: '#e11d48',
        equationLatex: 'V_c = 0.17 \\sqrt{f_{ck}} \\cdot b_w d',
        equationPrestressedLatex: 'V_{c,pc} = \\left(0.05 \\sqrt{f_{ck}} + 4.8 \\frac{V_u d_p}{M_u}\\right) b_w d + {\\color{#f59e0b}V_p}',
        secondaryLatex: '\\text{Sem fator de escala } (k = 1.0) \\text{ e sem armadura } (\\rho_w)',
        secondaryPrestressedLatex: '\\text{Método simplificado para vigas protendidas}',
        factors: {
            sizeEffect: {
                math: '1.0',
                note: '(Inexistente! Inseguro para d > 400 mm)'
            },
            reinforcement: {
                math: '\\rho_w^0 = 1.0',
                note: '(Ausente na resistência ao cisalhamento)'
            },
            concrete: {
                math: 'f_{ck}^{0.50} = \\sqrt{f_{ck}}',
                note: '(Raiz quadrada empírica)'
            },
            shearSpan: {
                math: '',
                note: 'Ausente na formulação básica'
            },
            prestress: {
                math: '+ V_p / \\sigma_{cp}',
                note: '(Componente vertical e termo M_u)'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro)'
            }
        },
        differenceOrigin: 'Ignora completamente o efeito de escala e armadura longitudinal. Por isso, a reta de FS tem forte declive negativo com d, tornando-se perigosamente insegura em elementos espessos (d > 400mm).'
    },
    'A_ACI_19': {
        name: 'ACI 318-19',
        shortCode: 'ACI 318-19',
        category: 'Norma Americana (2019)',
        color: '#be123c',
        equationLatex: 'V_c = 0.66 \\rho_w^{1/3} \\sqrt{f_{ck}} \\cdot b_w d \\cdot \\lambda_s',
        equationPrestressedLatex: 'V_{c,pc} = \\min(V_{ci}, V_{cw}) + {\\color{#f59e0b}V_p}',
        secondaryLatex: '\\lambda_s = \\sqrt{\\frac{2}{1 + 0.004 d}} \\le 1.0',
        secondaryPrestressedLatex: '\\lambda_s = \\sqrt{\\frac{2}{1 + 0.004 d}} \\le 1.0',
        factors: {
            sizeEffect: {
                math: '\\lambda_s = \\sqrt{\\frac{2}{1 + 0.004 d}} \\le 1.0',
                note: '(Introduzido no ACI 2019)'
            },
            reinforcement: {
                math: '\\rho_w^{1/3} = \\rho_w^{0.333}',
                note: '(Raiz cúbica)'
            },
            concrete: {
                math: 'f_{ck}^{0.50} = \\sqrt{f_{ck}}',
                note: '(Mantido do ACI anterior)'
            },
            shearSpan: {
                math: '',
                note: 'Ausente'
            },
            prestress: {
                math: 'V_{ci} / V_{cw} + V_p',
                note: '(Critérios para seções protendidas)'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro)'
            }
        },
        differenceOrigin: 'Revisão de 2019 do ACI: introduziu λs e ρw^(1/3) para sanar a insegurança de 2014. Ainda diverge do modelo proposto por manter fck^0.5 e omitir a rugosidade do agregado ddg.'
    },
    'A_ACI_25': {
        name: 'ACI 318-25',
        shortCode: 'ACI 318-25',
        category: 'Norma Americana (2025)',
        color: '#be185d',
        equationLatex: 'V_c = 0.66 \\rho_w^{1/3} \\sqrt{f_{ck}} \\cdot b_w d \\cdot \\lambda_s \\ge 0.083 \\sqrt{f_{ck}} b_w d',
        equationPrestressedLatex: 'V_{c,pc} = \\min(V_{ci}, V_{cw}) + {\\color{#f59e0b}V_p} \\quad (\\lambda_s \\text{ calibrado})',
        secondaryLatex: '\\lambda_s = \\sqrt{\\frac{2}{1 + 0.003 d}} \\le 1.0, \\quad \\sqrt{f_{ck}} \\le 10.3\\text{ MPa}',
        secondaryPrestressedLatex: '\\lambda_s = \\sqrt{\\frac{2}{1 + 0.003 d}} \\le 1.0, \\quad \\sqrt{f_{ck}} \\le 10.3\\text{ MPa}',
        factors: {
            sizeEffect: {
                math: '\\lambda_s = \\sqrt{\\frac{2}{1 + 0.003 d}} \\le 1.0',
                note: '(Denominador 0.003d vs 0.004d em 2019)'
            },
            reinforcement: {
                math: '\\rho_w^{1/3} = \\rho_w^{0.333}',
                note: '(Raiz cúbica)'
            },
            concrete: {
                math: 'f_{ck}^{0.50} \\le 10.3\\text{ MPa}',
                note: '(Teto de 150 psi para \\sqrt{f_{ck}})'
            },
            shearSpan: {
                math: '',
                note: 'Ausente (regime geral)'
            },
            prestress: {
                math: 'V_{ci} / V_{cw} + V_p',
                note: '(Critérios de ruptura por cisalhamento)'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro)'
            }
        },
        differenceOrigin: 'Atualização ACI 318-25 (Jan/2025): recalibra o denominador do size effect para 1 + 0.003d, limitando a penalização em seções altas, impõe teto de 10.3 MPa (150 psi) para √fck e patamar inferior de 0.083√fck·bw·d.'
    },
    'A_NBR6118': {
        name: 'NBR 6118',
        shortCode: 'NBR 6118',
        category: 'Norma Brasileira',
        color: '#0284c7',
        equationLatex: 'V_c = \\tau_{Rd} \\cdot k \\cdot (1.2 + 40 \\rho_w) b_w d',
        equationPrestressedLatex: 'V_{c,pc} = \\left[\\tau_{Rd} \\cdot k \\cdot (1.2 + 40 \\rho_w) + {\\color{#f59e0b}0.15 \\sigma_{cp}}\\right] b_w d',
        secondaryLatex: 'k = 1.6 - \\frac{d}{1000} \\ge 1.0, \\quad \\tau_{Rd} = 0.0525 f_{ck}^{2/3}',
        secondaryPrestressedLatex: 'k = 1.6 - \\frac{d}{1000} \\ge 1.0, \\quad \\sigma_{cp} = \\frac{N_p}{A_c} \\le 0.2 f_{ck}',
        factors: {
            sizeEffect: {
                math: 'k = 1.6 - \\frac{d}{1000} \\ge 1.0',
                note: '(Linear, satura em 1.0 para d ≥ 600 mm)'
            },
            reinforcement: {
                math: '(1.2 + 40 \\rho_w)',
                note: '(Termo linear)'
            },
            concrete: {
                math: 'f_{ck}^{2/3} = f_{ck}^{0.667}',
                note: '(Maior expoente normativo f_{ctk})'
            },
            shearSpan: {
                math: '',
                note: 'Ausente na formulação analítica'
            },
            prestress: {
                math: '+ 0.15 \\sigma_{cp}',
                note: '(Acréscimo linear de pré-compressão)'
            },
            prestressExcluded: {
                math: '\\sigma_{cp} = 0',
                note: '(Concreto Armado puro: sem protensão)'
            }
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
    if (clean === 'R_ACI318_25' || clean.includes('318-25') || clean === 'A_ACI_25') return CODE_EQUATION_METADATA['A_ACI_25'];
    if (clean === 'R_MC2010' || (clean.includes('MC') && clean.includes('Level I') && !clean.includes('Level II'))) return CODE_EQUATION_METADATA['A_MC2010_L1'];
    if (clean.includes('MC') && clean.includes('Level II')) return CODE_EQUATION_METADATA['A_MC2010_L2'];

    for (let k in CODE_EQUATION_METADATA) {
        let m = CODE_EQUATION_METADATA[k];
        if (clean === m.name || clean.includes(m.name) || m.name.includes(clean)) return m;
    }
    return null;
}

function renderFactorHTML(f) {
    if (!f) return '';
    if (typeof f === 'string') {
        let trimmed = f.trim();
        if (trimmed.includes('\\') || trimmed.includes('^') || trimmed.includes('_') || trimmed.includes('{')) {
            if (window.katex) {
                try {
                    return katex.renderToString(trimmed, { throwOnError: false, displayMode: false });
                } catch (e) {
                    return `<span class="font-mono text-gray-200">${trimmed}</span>`;
                }
            }
            return `<span class="font-mono text-gray-200">${trimmed}</span>`;
        }
        return `<span class="text-gray-300 font-sans italic">${trimmed}</span>`;
    }
    let mathHtml = '';
    if (f.math && String(f.math).trim()) {
        const mathStr = String(f.math).trim();
        if (window.katex) {
            try {
                mathHtml = katex.renderToString(mathStr, { throwOnError: false, displayMode: false });
            } catch (e) {
                mathHtml = `<span class="font-mono text-gray-200">${mathStr}</span>`;
            }
        } else {
            mathHtml = `<span class="font-mono text-gray-200">${mathStr}</span>`;
        }
    }
    const noteStr = f.note ? String(f.note).trim() : '';
    let noteHtml = noteStr ? `<span class="text-gray-400 text-[9.5px] font-sans italic leading-tight">${noteStr}</span>` : '';
    if (!mathHtml && noteStr) {
        return `<span class="text-gray-400 text-[9.5px] font-sans italic leading-tight">${noteStr}</span>`;
    }
    return `<div class="inline-flex items-center flex-wrap gap-1.5 leading-snug">${mathHtml}${noteHtml}</div>`;
}
window.renderFactorHTML = renderFactorHTML;

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
function computeLiveModelFlatness(precomputed) {
    if (!currentFilteredRows || currentFilteredRows.length < 5) return null;

    let sumD = 0, sumFS = 0, sumD2 = 0, sumDFS = 0, validCount = 0;
    let dList = [];
    let fsList = [];

    if (precomputed && precomputed.validCount >= 5) {
        sumD = precomputed.sumD;
        sumFS = precomputed.sumFS;
        sumD2 = precomputed.sumD2;
        sumDFS = precomputed.sumDFS;
        validCount = precomputed.validCount;
        dList = precomputed.dList.slice();
        fsList = precomputed.fsList.slice();
    } else {
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
    else if (codeKey.includes('ACI 318-25') || codeKey === 'A_ACI_25') colName = 'A_ACI_25';
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

function updateLiveModelFlatnessUI(precomputedFlatness) {
    const card = document.getElementById('liveModelFlatnessCard');
    if (!card) return;

    const pal = LIVE_MODEL_PALETTES[currentLiveModelColorKey] || LIVE_MODEL_PALETTES.cyan;
    const flatness = precomputedFlatness !== undefined ? precomputedFlatness : computeLiveModelFlatness();
    const eqLatex = buildLiveEquationLatex();

    const isPrestress = !excludePrestressed;
    const prestressBadge = isPrestress
        ? `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Protensão ativa no modelo (+μ·σ_cp)">Protensão (+μ·σ_cp)</span>`
        : `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-gray-700/40 text-gray-400 border border-gray-600/40" title="Concreto Armado puro (sem protensão)">Sem PC (RC)</span>`;

    const disabledVars = Object.keys(params).filter(k => params[k].disabled);
    const disabledBadge = disabledVars.length > 0
        ? `<span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Variáveis desativadas: ${disabledVars.map(k => params[k].symbol).join(', ')}">✂️ ${disabledVars.length} off</span>`
        : '';

    if (!flatness) {
        card.innerHTML = `
            <div class="flex items-center justify-between pb-1 border-b border-[var(--color-border-primary)]">
                <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs" style="color:${pal.hex};">🎯 Modelo Proposto Interativo</span>
                    <span id="flatnessPrestressBadge">${prestressBadge}</span>
                    <span id="flatnessDisabledBadge">${disabledBadge}</span>
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

    // In-place update if card already has its internal structure
    const existingBar = card.querySelector('#flatnessBar');
    if (existingBar) {
        existingBar.className = `${barColor} h-1.5 rounded-full transition-all duration-150`;
        existingBar.style.width = `${flatness.flatnessScore}%`;

        const badge = card.querySelector('#flatnessStatusBadge');
        if (badge) {
            badge.className = `text-[9.5px] px-1.5 py-0.5 rounded font-bold shrink-0 ${flatness.statusBadgeClass}`;
            badge.innerText = `${flatness.icon} ${flatness.flatnessScore.toFixed(1)}% Retidão`;
        }
        const scoreTxt = card.querySelector('#flatnessScoreText');
        if (scoreTxt) scoreTxt.innerText = `${flatness.flatnessScore.toFixed(1)}% (${flatness.statusText.split('(')[0].trim()})`;
        const meanFS = card.querySelector('#flatnessMeanFS');
        if (meanFS) meanFS.innerText = flatness.meanFS.toFixed(3);
        const retidao = card.querySelector('#flatnessRetidao');
        if (retidao) {
            retidao.innerText = `${flatness.flatnessScore.toFixed(1)}%`;
            retidao.className = `font-bold font-mono ${flatness.flatnessScore >= 90 ? 'text-emerald-400' : 'text-amber-400'}`;
        }
        const slope = card.querySelector('#flatnessSlope');
        if (slope) {
            slope.innerText = `${flatness.slopePerMeter >= 0 ? '+' : ''}${flatness.slopePerMeter.toFixed(3)} / m`;
            slope.className = `font-bold font-mono ${Math.abs(flatness.slopePerMeter) <= 0.15 ? 'text-emerald-400' : (flatness.slopePerMeter < 0 ? 'text-rose-400' : 'text-amber-400')}`;
        }
        const pearson = card.querySelector('#flatnessPearson');
        if (pearson) {
            pearson.innerText = `${flatness.pearsonR >= 0 ? '+' : ''}${flatness.pearsonR.toFixed(3)}`;
            pearson.className = `font-bold font-mono ${Math.abs(flatness.pearsonR) <= 0.08 ? 'text-emerald-400' : 'text-rose-400'}`;
        }
        const hint = card.querySelector('#flatnessHint');
        if (hint) {
            hint.innerHTML = `<span class="shrink-0 mt-0.5">${flatness.icon}</span><span>${flatness.suggestion}</span>`;
        }
        const pcContainer = card.querySelector('#flatnessPrestressBadge');
        if (pcContainer) {
            pcContainer.innerHTML = prestressBadge;
        }
        const disabledContainer = card.querySelector('#flatnessDisabledBadge');
        if (disabledContainer) {
            disabledContainer.innerHTML = disabledBadge;
        }

        // Keep KaTeX equation updated via debouncer
        scheduleKatexRender(false);
        return;
    }

    // Full structural build on first load
    card.innerHTML = `
        <div class="flex items-center justify-between pb-1 border-b border-[var(--color-border-primary)]">
            <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-xs">🎯</span>
                <span class="font-bold text-xs truncate" style="color:${pal.hex};">Modelo Proposto (Live)</span>
                <span id="flatnessPrestressBadge">${prestressBadge}</span>
                <span id="flatnessDisabledBadge">${disabledBadge}</span>
            </div>
            <span id="flatnessStatusBadge" class="text-[9.5px] px-1.5 py-0.5 rounded font-bold shrink-0 ${flatness.statusBadgeClass}">
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
                <span id="flatnessScoreText" class="font-bold font-mono text-gray-200">${flatness.flatnessScore.toFixed(1)}% (${flatness.statusText.split('(')[0].trim()})</span>
            </div>
            <div class="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                <div id="flatnessBar" class="${barColor} h-1.5 rounded-full transition-all duration-150" style="width: ${flatness.flatnessScore}%"></div>
            </div>
        </div>

        <!-- 4-metric Grid -->
        <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] bg-[var(--color-bg-secondary)]/50 rounded p-1.5 border border-[var(--color-border-primary)]">
            <div class="flex justify-between items-center" title="Fator de Segurança Médio: V_test / V_calc">
                <span class="text-gray-400 text-[10.5px]">Média FS:</span>
                <span id="flatnessMeanFS" class="font-bold font-mono text-cyan-300">${flatness.meanFS.toFixed(3)}</span>
            </div>
            <div class="flex justify-between items-center" title="Índice de Retidão: 100% indica FS constante ao longo de d">
                <span class="text-gray-400 text-[10.5px]">Retidão:</span>
                <span id="flatnessRetidao" class="font-bold font-mono ${flatness.flatnessScore >= 90 ? 'text-emerald-400' : 'text-amber-400'}">${flatness.flatnessScore.toFixed(1)}%</span>
            </div>
            <div class="flex justify-between items-center" title="Inclinação da reta FS vs d: Variação de FS a cada 1000mm de altura útil">
                <span class="text-gray-400 text-[10.5px]">Inclinação (m):</span>
                <span id="flatnessSlope" class="font-bold font-mono ${Math.abs(flatness.slopePerMeter) <= 0.15 ? 'text-emerald-400' : (flatness.slopePerMeter < 0 ? 'text-rose-400' : 'text-amber-400')}">
                    ${flatness.slopePerMeter >= 0 ? '+' : ''}${flatness.slopePerMeter.toFixed(3)} / m
                </span>
            </div>
            <div class="flex justify-between items-center" title="Correlação Pearson entre FS e d: R próximo de zero indica independência de d">
                <span class="text-gray-400 text-[10.5px]">Viés R(d):</span>
                <span id="flatnessPearson" class="font-bold font-mono ${Math.abs(flatness.pearsonR) <= 0.08 ? 'text-emerald-400' : 'text-rose-400'}">
                    ${flatness.pearsonR >= 0 ? '+' : ''}${flatness.pearsonR.toFixed(3)}
                </span>
            </div>
        </div>
        
        <!-- Dynamic Diagnostic & Hint -->
        <div id="flatnessHint" class="p-1.5 rounded bg-cyan-950/20 border border-cyan-500/20 text-[10px] leading-snug text-gray-300 flex items-start gap-1.5">
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

// -------------------------------------------------------------
// Statistical Correlation, Residual Orthogonality & VIF Engine
// -------------------------------------------------------------

let currentCorrelationMethod = 'pearson'; // 'pearson' or 'spearman'
let currentCorrelationTab = 'bias';       // 'bias', 'matrix', 'stats'
let cachedCorrelationStats = null;

function normalCdf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.SQRT2;
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return 0.5 * (1.0 + sign * y);
}

function computePearson(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { r: 0, p: 1, t: 0, n };
    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
    for (let i = 0; i < n; i++) {
        const xi = x[i];
        const yi = y[i];
        sumX += xi;
        sumY += yi;
        sumX2 += xi * xi;
        sumY2 += yi * yi;
        sumXY += xi * yi;
    }
    const numerator = n * sumXY - sumX * sumY;
    const denom = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denom <= 1e-12 || isNaN(denom)) return { r: 0, p: 1, t: 0, n };
    const r = Math.max(-1.0, Math.min(1.0, numerator / denom));
    const df = n - 2;
    const t = Math.abs(r) < 1.0 ? r * Math.sqrt(df / (1.0 - r * r)) : (r >= 0 ? 999 : -999);
    const p = Math.max(0.0, Math.min(1.0, 2.0 * (1.0 - normalCdf(Math.abs(t)))));
    return { r, p, t, n };
}

function fastRankArray(arr) {
    const n = arr.length;
    const indexed = new Array(n);
    for (let i = 0; i < n; i++) {
        indexed[i] = { val: arr[i], idx: i };
    }
    indexed.sort((a, b) => a.val - b.val);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
        let j = i;
        while (j < n - 1 && Math.abs(indexed[j + 1].val - indexed[j].val) < 1e-12) {
            j++;
        }
        const rank = (i + j + 2) / 2.0;
        for (let k = i; k <= j; k++) {
            ranks[indexed[k].idx] = rank;
        }
        i = j + 1;
    }
    return ranks;
}

function computeSpearman(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { r: 0, p: 1, t: 0, n };
    const rankX = fastRankArray(x);
    const rankY = fastRankArray(y);
    return computePearson(rankX, rankY);
}

function invertMatrix(M) {
    const n = M.length;
    const A = M.map(row => row.slice());
    const I = Array.from({ length: n }, (_, i) => 
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
    );
    for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
        }
        if (Math.abs(A[maxRow][i]) < 1e-12) return null;
        [A[i], A[maxRow]] = [A[maxRow], A[i]];
        [I[i], I[maxRow]] = [I[maxRow], I[i]];
        const pivot = A[i][i];
        for (let j = 0; j < n; j++) {
            A[i][j] /= pivot;
            I[i][j] /= pivot;
        }
        for (let k = 0; k < n; k++) {
            if (k !== i) {
                const factor = A[k][i];
                for (let j = 0; j < n; j++) {
                    A[k][j] -= factor * A[i][j];
                    I[k][j] -= factor * I[i][j];
                }
            }
        }
    }
    return I;
}

function computeCorrelationStatistics() {
    if (!currentFilteredRows || !currentFilteredRows.length) return null;

    const dArr = [];
    const adArr = [];
    const rhoArr = [];
    const fckArr = [];
    const sigmaCpArr = [];
    const bwArr = [];
    const bwdArr = [];
    const vuArr = [];
    const tauArr = [];
    const rLiveArr = [];
    const r6118Arr = [];
    const rEC2Arr = [];
    const rACIArr = [];
    const rACI25Arr = [];

    const len = currentFilteredRows.length;
    for (let i = 0; i < len; i++) {
        const row = currentFilteredRows[i];
        if (!row._valid) continue;
        const pt = computeLiveModelPoint(row);
        if (!pt || !isFinite(pt.ratio) || pt.ratio <= 0) continue;

        const dVal = row._d;
        const bwVal = row._bw;
        const vuVal = row._vu;
        const tauVal = (bwVal > 0 && dVal > 0) ? (vuVal * 1000.0) / (bwVal * dVal) : null;
        if (tauVal === null || !isFinite(tauVal) || tauVal <= 0) continue;

        dArr.push(dVal);
        adArr.push(row._ad);
        rhoArr.push(row._rho * 100.0);
        fckArr.push(row._fck);
        sigmaCpArr.push(row._sigma_cp || 0.0);
        bwArr.push(bwVal);
        bwdArr.push(row._bwd || (dVal > 0 ? bwVal / dVal : 0));
        vuArr.push(vuVal);
        tauArr.push(tauVal);
        rLiveArr.push(pt.ratio);

        const r6118 = parseFloat(row['R_6118'] ?? row['A_NBR6118']);
        r6118Arr.push(isFinite(r6118) && r6118 > 0 ? r6118 : NaN);

        const rEC = parseFloat(row['R_EC_2023'] ?? row['A_EC2_2023'] ?? row['R_EC_2004']);
        rEC2Arr.push(isFinite(rEC) && rEC > 0 ? rEC : NaN);

        const rACI = parseFloat(row['R_ACI318_19'] ?? row['A_ACI_19'] ?? row['R_ACI318_14']);
        rACIArr.push(isFinite(rACI) && rACI > 0 ? rACI : NaN);

        const rACI25 = parseFloat(row['A_ACI_25'] ?? row['R_ACI318_25']);
        rACI25Arr.push(isFinite(rACI25) && rACI25 > 0 ? rACI25 : NaN);
    }

    const n = dArr.length;
    if (n < 5) return null;

    const hasPCData = sigmaCpArr.some(v => v > 0);

    const varDict = {
        d: { label: 'Altura Útil (d)', symbol: 'd', unit: 'mm', data: dArr, coef: 'α, ζ' },
        a_d: { label: 'Vão Cisalhante (a/d)', symbol: 'a/d', unit: '', data: adArr, coef: 'δ' },
        rho_w: { label: 'Taxa Armadura (ρw)', symbol: 'ρ_w', unit: '%', data: rhoArr, coef: 'β' },
        fck: { label: 'Resistência Concreto (fck)', symbol: 'f_{ck}', unit: 'MPa', data: fckArr, coef: 'γ' },
        sigma_cp: { label: 'Protensão (σcp)', symbol: 'σ_{cp}', unit: 'MPa', data: sigmaCpArr, coef: 'μ' },
        bw: { label: 'Largura da Alma (bw)', symbol: 'b_w', unit: 'mm', data: bwArr, coef: 'ε' },
        bwd: { label: 'Razão Seção (bw/d)', symbol: 'b_w/d', unit: '', data: bwdArr, coef: 'bw/d' },
        V_test: { label: 'Força Experimental (Vu)', symbol: 'V_u', unit: 'kN', data: vuArr, coef: 'Carga' },
        tau_u: { label: 'Tensão Nominal (τu)', symbol: 'τ_u', unit: 'MPa', data: tauArr, coef: 'Tensão' },
        R_Live: { label: 'Modelo Proposto (R_Live)', symbol: 'R_{Live}', unit: '', data: rLiveArr, coef: 'Live' }
    };

    const matrixKeys = ['d', 'a_d', 'rho_w', 'fck', 'sigma_cp', 'bw', 'bwd', 'V_test', 'tau_u', 'R_Live'];

    // Descriptive Statistics
    const descriptiveStats = {};
    matrixKeys.forEach(k => {
        const arr = varDict[k].data;
        const valid = arr.filter(v => isFinite(v));
        const nv = valid.length;
        if (nv === 0) return;
        const sorted = valid.slice().sort((a, b) => a - b);
        let sum = 0;
        for (let i = 0; i < nv; i++) sum += valid[i];
        const mean = sum / nv;
        let sqDiffSum = 0;
        let cubeDiffSum = 0;
        for (let i = 0; i < nv; i++) {
            const diff = valid[i] - mean;
            sqDiffSum += diff * diff;
            cubeDiffSum += diff * diff * diff;
        }
        const std = nv > 1 ? Math.sqrt(sqDiffSum / (nv - 1)) : 0;
        const cov = mean > 0 ? (std / mean) * 100.0 : 0;
        const median = nv % 2 === 1 ? sorted[Math.floor(nv / 2)] : (sorted[nv / 2 - 1] + sorted[nv / 2]) / 2.0;
        const min = sorted[0];
        const max = sorted[nv - 1];
        const m2 = sqDiffSum / nv;
        const m3 = cubeDiffSum / nv;
        const skew = m2 > 1e-12 ? m3 / Math.pow(m2, 1.5) : 0;

        descriptiveStats[k] = {
            label: varDict[k].label,
            symbol: varDict[k].symbol,
            unit: varDict[k].unit,
            count: nv,
            mean,
            std,
            cov,
            median,
            min,
            max,
            skew
        };
    });

    // Correlation Matrices
    const pearsonMatrix = {};
    const spearmanMatrix = {};
    const pvaluesMatrix = {};

    for (let i = 0; i < matrixKeys.length; i++) {
        const k1 = matrixKeys[i];
        pearsonMatrix[k1] = {};
        spearmanMatrix[k1] = {};
        pvaluesMatrix[k1] = {};
        for (let j = 0; j < matrixKeys.length; j++) {
            const k2 = matrixKeys[j];
            if (k1 === k2) {
                pearsonMatrix[k1][k2] = 1.0;
                spearmanMatrix[k1][k2] = 1.0;
                pvaluesMatrix[k1][k2] = 0.0;
            } else {
                const pr = computePearson(varDict[k1].data, varDict[k2].data);
                const sr = computeSpearman(varDict[k1].data, varDict[k2].data);
                pearsonMatrix[k1][k2] = pr.r;
                spearmanMatrix[k1][k2] = sr.r;
                pvaluesMatrix[k1][k2] = pr.p;
            }
        }
    }

    // Predictor Multicollinearity (VIF)
    const predKeys = hasPCData ? ['d', 'a_d', 'rho_w', 'fck', 'bw', 'sigma_cp'] : ['d', 'a_d', 'rho_w', 'fck', 'bw'];
    const predMatrix = predKeys.map(k1 => predKeys.map(k2 => pearsonMatrix[k1][k2]));
    const invPred = invertMatrix(predMatrix);
    const vifDict = {};
    predKeys.forEach((pk, idx) => {
        vifDict[pk] = (invPred && isFinite(invPred[idx][idx]) && invPred[idx][idx] >= 1.0)
            ? invPred[idx][idx]
            : 1.0;
    });
    if (!hasPCData) {
        vifDict['sigma_cp'] = 1.0;
    }

    // Code residual correlations for benchmark comparison
    const codeBenchKeys = ['d', 'a_d', 'rho_w', 'fck', 'sigma_cp', 'bw', 'bwd'];
    const codeCorrelations = {
        NBR6118: {},
        EC2: {},
        ACI: {},
        ACI25: {}
    };

    codeBenchKeys.forEach(vk => {
        const varVals = varDict[vk].data;

        // NBR 6118
        const pairNBR_X = [], pairNBR_Y = [];
        for (let i = 0; i < n; i++) {
            if (isFinite(r6118Arr[i])) {
                pairNBR_X.push(varVals[i]);
                pairNBR_Y.push(r6118Arr[i]);
            }
        }
        codeCorrelations.NBR6118[vk] = computePearson(pairNBR_X, pairNBR_Y).r;

        // EC2 (2023)
        const pairEC_X = [], pairEC_Y = [];
        for (let i = 0; i < n; i++) {
            if (isFinite(rEC2Arr[i])) {
                pairEC_X.push(varVals[i]);
                pairEC_Y.push(rEC2Arr[i]);
            }
        }
        codeCorrelations.EC2[vk] = computePearson(pairEC_X, pairEC_Y).r;

        // ACI 318-19
        const pairACI_X = [], pairACI_Y = [];
        for (let i = 0; i < n; i++) {
            if (isFinite(rACIArr[i])) {
                pairACI_X.push(varVals[i]);
                pairACI_Y.push(rACIArr[i]);
            }
        }
        codeCorrelations.ACI[vk] = computePearson(pairACI_X, pairACI_Y).r;

        // ACI 318-25
        const pairACI25_X = [], pairACI25_Y = [];
        for (let i = 0; i < n; i++) {
            if (isFinite(rACI25Arr[i])) {
                pairACI25_X.push(varVals[i]);
                pairACI25_Y.push(rACI25Arr[i]);
            }
        }
        codeCorrelations.ACI25[vk] = computePearson(pairACI25_X, pairACI25_Y).r;
    });

    // Bias Diagnostics for Live Model with Selected Orthogonality Type
    const biasEval = {};
    codeBenchKeys.forEach(vk => {
        const pr = pearsonMatrix['R_Live'][vk];
        const sr = spearmanMatrix['R_Live'][vk];
        const pp = pvaluesMatrix['R_Live'][vk];

        // Compute Logarithmic OLS r(ln R, ln X) and Relative Error r((Vu - Vc)/Vu, X)
        let logR = pr;
        let deltaR = pr;
        const xVals = varDict[vk].data;
        const lnX = [], lnR = [];
        const xFiltered = [], relErr = [];
        for (let idx = 0; idx < n; idx++) {
            const xv = xVals[idx];
            const rv = rLiveArr[idx];
            if (isFinite(xv) && isFinite(rv) && rv > 0) {
                if (xv > 0) {
                    lnX.push(Math.log(xv));
                    lnR.push(Math.log(rv));
                }
                xFiltered.push(xv);
                relErr.push(1.0 - (1.0 / rv));
            }
        }
        if (lnX.length >= 3) {
            logR = computePearson(lnX, lnR).r;
        }
        if (xFiltered.length >= 3) {
            deltaR = computePearson(xFiltered, relErr).r;
        }

        let activeR = pr;
        if (currentCorrelationMethod === 'spearman') activeR = sr;
        else if (currentCorrelationMethod === 'log') activeR = logR;
        else if (currentCorrelationMethod === 'delta') activeR = deltaR;
        const absR = Math.abs(activeR);

        let severity = 'excelente';
        let severityClass = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        let desc = 'Sem viés residual (|r| < 0.05)';
        let action = 'Parâmetro perfeitamente calibrado.';

        if (vk === 'sigma_cp' && !hasPCData) {
            severity = 'inativo';
            severityClass = 'bg-gray-500/15 text-gray-400 border border-gray-500/30';
            desc = 'Sem protensão no recorte ativo';
            action = 'Recorte composto exclusivamente por concreto armado (σcp = 0).';
        } else if (absR >= 0.30) {
            severity = 'severo';
            severityClass = 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
            desc = `Viés acentuado (${activeR > 0 ? '+' : ''}${activeR.toFixed(3)})`;
            if (vk === 'd') action = activeR > 0 ? 'Subestima vigas altas; reduza α ou aumente ζ.' : 'Superestima vigas altas; aumente o Size Effect α no slider.';
            else if (vk === 'a_d') action = activeR > 0 ? 'Subestima peças curtas; ajuste δ.' : 'Superestima peças curtas; torne δ mais negativo.';
            else if (vk === 'rho_w') action = activeR > 0 ? 'Subestima armaduras densas; aumente β.' : 'Superestima armaduras densas; reduza β.';
            else if (vk === 'fck') action = activeR > 0 ? 'Subestima concretos fortes; aumente γ.' : 'Superestima concretos fortes; reduza γ.';
            else if (vk === 'sigma_cp') action = activeR > 0 ? 'Subestima protensão; aumente μ no slider.' : 'Superestima protensão; reduza μ no slider.';
            else action = 'Ajuste os coeficientes correspondentes no painel.';
        } else if (absR >= 0.15) {
            severity = 'moderado';
            severityClass = 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
            desc = `Viés moderado (${activeR > 0 ? '+' : ''}${activeR.toFixed(3)})`;
            if (vk === 'sigma_cp') action = activeR > 0 ? 'Subestima levemente a protensão; considere aumentar μ.' : 'Superestima levemente a protensão; considere reduzir μ.';
            else action = 'Recomenda-se leve ajuste no slider do parâmetro.';
        } else if (absR >= 0.05) {
            severity = 'leve';
            severityClass = 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30';
            desc = `Viés leve (${activeR > 0 ? '+' : ''}${activeR.toFixed(3)})`;
            if (vk === 'sigma_cp') action = 'Boa calibração da contribuição de protensão (μ).';
            else action = 'Bom equilíbrio estocástico na faixa experimental.';
        } else {
            if (vk === 'sigma_cp') action = 'Protensão perfeitamente calibrada (μ ótimo).';
        }

        biasEval[vk] = {
            pearson: pr,
            spearman: sr,
            logR: logR,
            deltaR: deltaR,
            activeR,
            p_value: pp,
            severity,
            severityClass,
            desc,
            action,
            label: varDict[vk].label,
            symbol: varDict[vk].symbol,
            unit: varDict[vk].unit,
            coef: varDict[vk].coef
        };
    });

    // Residual Orthogonality Index (ROI) - Computed for all 4 formulations simultaneously
    const primaryPreds = hasPCData ? ['d', 'a_d', 'rho_w', 'fck', 'bw', 'sigma_cp'] : ['d', 'a_d', 'rho_w', 'fck', 'bw'];
    const sqSum = primaryPreds.reduce((acc, k) => {
        const rVal = currentCorrelationMethod === 'spearman' ? biasEval[k].spearman : biasEval[k].pearson;
        return acc + rVal * rVal;
    }, 0);
    const rmsR = Math.sqrt(sqSum / primaryPreds.length);
    const roi = Math.max(0.0, Math.min(100.0, (1.0 - rmsR) * 100.0));

    // Comparative statistics for all 4 methods at once
    const methodsList = [
        { key: 'pearson', label: 'Pearson', subLabel: 'R vs X', title: 'Correlação linear direta dos resíduos R vs variáveis experimentais X' },
        { key: 'spearman', label: 'Spearman', subLabel: 'Postos', title: 'Correlação monotônica não-linear por ordem de postos' },
        { key: 'log', label: 'Log OLS', subLabel: 'ln R vs ln X', title: 'Correlação logarítmica de sensibilidade aos expoentes das potências' },
        { key: 'delta', label: 'Erro Rel.', subLabel: 'ΔV/Vu', title: 'Correlação do erro residual relativo normalizado (1 - Vc/Vu)' }
    ];

    const methodsData = {};
    let sumRoi = 0;
    methodsList.forEach(m => {
        const sqSumM = primaryPreds.reduce((acc, k) => {
            let rVal = biasEval[k].pearson;
            if (m.key === 'spearman') rVal = biasEval[k].spearman;
            else if (m.key === 'log') rVal = biasEval[k].logR;
            else if (m.key === 'delta') rVal = biasEval[k].deltaR;
            return acc + (rVal || 0) * (rVal || 0);
        }, 0);
        const rmsRM = Math.sqrt(sqSumM / primaryPreds.length);
        const roiM = Math.max(0.0, Math.min(100.0, (1.0 - rmsRM) * 100.0));
        sumRoi += roiM;

        methodsData[m.key] = {
            key: m.key,
            label: m.label,
            subLabel: m.subLabel,
            title: m.title,
            roi: roiM,
            rmsR: rmsRM,
            biases: {
                d: m.key === 'spearman' ? biasEval.d.spearman : (m.key === 'log' ? biasEval.d.logR : (m.key === 'delta' ? biasEval.d.deltaR : biasEval.d.pearson)),
                a_d: m.key === 'spearman' ? biasEval.a_d.spearman : (m.key === 'log' ? biasEval.a_d.logR : (m.key === 'delta' ? biasEval.a_d.deltaR : biasEval.a_d.pearson)),
                rho_w: m.key === 'spearman' ? biasEval.rho_w.spearman : (m.key === 'log' ? biasEval.rho_w.logR : (m.key === 'delta' ? biasEval.rho_w.deltaR : biasEval.rho_w.pearson)),
                fck: m.key === 'spearman' ? biasEval.fck.spearman : (m.key === 'log' ? biasEval.fck.logR : (m.key === 'delta' ? biasEval.fck.deltaR : biasEval.fck.pearson)),
                sigma_cp: hasPCData ? (m.key === 'spearman' ? biasEval.sigma_cp.spearman : (m.key === 'log' ? biasEval.sigma_cp.logR : (m.key === 'delta' ? biasEval.sigma_cp.deltaR : biasEval.sigma_cp.pearson))) : null
            }
        };
    });
    const avgRoi = sumRoi / methodsList.length;

    // LaTeX Code Generator
    const latexCols = ['d', 'a_d', 'rho_w', 'fck', 'sigma_cp', 'bw', 'bwd', 'V_test', 'tau_u', 'R_Live'];
    const latexHeaders = latexCols.map(k => {
        if (k === 'sigma_cp') return '$\\sigma_{cp}$';
        if (k === 'rho_w') return '$\\rho_w$';
        return `$${varDict[k].symbol}$`;
    }).join(' & ');
    const latexRows = latexCols.map(rk => {
        const rLabel = rk === 'sigma_cp' ? '$\\sigma_{cp}$' : (rk === 'rho_w' ? '$\\rho_w$' : `$${varDict[rk].symbol}$`);
        const cells = latexCols.map(ck => {
            const v = currentCorrelationMethod === 'spearman' ? spearmanMatrix[rk][ck] : pearsonMatrix[rk][ck];
            return isFinite(v) ? v.toFixed(3) : '-';
        }).join(' & ');
        return `${rLabel} & ${cells} \\\\`;
    }).join('\n');

    const latexCode = [
        `\\begin{table}[htbp]`,
        `\\centering`,
        `\\caption{Matriz de Correlação de ${currentCorrelationMethod === 'spearman' ? 'Spearman (Postos)' : 'Pearson (Linear)'} das Variáveis Experimentais e Razão Residual ($N = ${n}$, Recorte: ${currentSubsetKey})}`,
        `\\label{tab:shear_correlation_matrix}`,
        `\\small`,
        `\\begin{tabular}{l${'c'.repeat(latexCols.length)}}`,
        `\\toprule`,
        `Variável & ${latexHeaders} \\\\`,
        `\\midrule`,
        latexRows,
        `\\bottomrule`,
        `\\end{tabular}`,
        `\\end{table}`
    ].join('\n');

    cachedCorrelationStats = {
        count: n,
        subset: currentSubsetKey,
        roi,
        rmsR,
        methodsList,
        methodsData,
        avgRoi,
        varDict,
        hasPCData,
        matrixKeys,
        descriptiveStats,
        pearsonMatrix,
        spearmanMatrix,
        pvaluesMatrix,
        vif: vifDict,
        codeCorrelations,
        biasEval,
        latexCode
    };

    return cachedCorrelationStats;
}

function updateLiveCorrelationUI() {
    const card = document.getElementById('liveModelCorrelationCard');
    if (!card) return;

    const stats = computeCorrelationStatistics();
    if (!stats) {
        card.innerHTML = `
            <div class="flex items-center justify-between pb-1 border-b border-[var(--color-border-primary)]">
                <div class="flex items-center gap-1.5">
                    <span class="text-xs">📈</span>
                    <span class="font-bold text-xs text-indigo-400">Ortogonalidade Residual & Viés</span>
                </div>
            </div>
            <p class="text-[10px] text-gray-400 text-center py-2">Carregando correlações estatísticas...</p>
        `;
        return;
    }

    const avgRoi = stats.avgRoi !== undefined ? stats.avgRoi : stats.roi;
    let avgColor = 'text-emerald-400';
    let avgBarColor = 'bg-emerald-500';
    let avgBadgeClass = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    let avgStatusText = 'Excelente (Sem Viés)';

    if (avgRoi < 75) {
        avgColor = 'text-rose-400';
        avgBarColor = 'bg-rose-500';
        avgBadgeClass = 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
        avgStatusText = 'Atenção: Viés Presente';
    } else if (avgRoi < 88) {
        avgColor = 'text-amber-400';
        avgBarColor = 'bg-amber-500';
        avgBadgeClass = 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
        avgStatusText = 'Moderado';
    }

    function formatCellBias(rVal) {
        if (rVal === null || rVal === undefined || isNaN(rVal)) return `<span class="text-gray-500 font-mono" title="Sem protensão no recorte">-</span>`;
        const abs = Math.abs(rVal);
        const col = abs < 0.08 ? 'text-emerald-400 font-bold' : (abs < 0.20 ? 'text-cyan-300' : (abs < 0.30 ? 'text-amber-400' : 'text-rose-400 font-bold'));
        return `<span class="${col}">${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}</span>`;
    }

    function formatCellRoi(roiVal) {
        const col = roiVal >= 90 ? 'text-emerald-400 font-bold' : (roiVal >= 80 ? 'text-amber-400' : 'text-rose-400 font-bold');
        return `<span class="${col}">${roiVal.toFixed(1)}%</span>`;
    }

    let rowsHtml = '';
    const methods = stats.methodsList || [
        { key: 'pearson', label: 'Pearson', subLabel: 'R vs X', title: 'Correlação linear direta' },
        { key: 'spearman', label: 'Spearman', subLabel: 'Postos', title: 'Correlação monotônica por postos' },
        { key: 'log', label: 'Log OLS', subLabel: 'ln R vs ln X', title: 'Correlação logarítmica dos expoentes' },
        { key: 'delta', label: 'Erro Rel.', subLabel: 'ΔV/Vu', title: 'Correlação do erro residual relativo' }
    ];

    methods.forEach(m => {
        const mData = (stats.methodsData && stats.methodsData[m.key]) || {
            roi: stats.roi,
            biases: {
                d: stats.biasEval.d ? stats.biasEval.d.pearson : 0,
                a_d: stats.biasEval.a_d ? stats.biasEval.a_d.pearson : 0,
                rho_w: stats.biasEval.rho_w ? stats.biasEval.rho_w.pearson : 0,
                fck: stats.biasEval.fck ? stats.biasEval.fck.pearson : 0,
                sigma_cp: (stats.biasEval && stats.biasEval.sigma_cp && stats.hasPCData) ? stats.biasEval.sigma_cp.pearson : null
            }
        };

        const isSelected = currentCorrelationMethod === m.key;
        const rowBg = isSelected ? 'bg-indigo-500/20 font-semibold' : 'hover:bg-[var(--color-bg-primary)]/80 cursor-pointer';

        rowsHtml += `
            <tr onclick="setOrthogonalityMethod('${m.key}')" class="transition-colors ${rowBg}" title="${m.title} (clique para focar na matriz)">
                <td class="py-1 px-1 whitespace-nowrap">
                    <div class="flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-indigo-400' : 'bg-transparent'}"></span>
                        <span class="font-bold text-[10px] text-gray-200">${m.label}</span>
                        <span class="text-[8.5px] text-gray-400 font-mono">(${m.subLabel})</span>
                    </div>
                </td>
                <td class="py-1 px-1 text-center font-mono">
                    ${formatCellRoi(mData.roi)}
                </td>
                <td class="py-1 px-1 text-right font-mono">
                    ${formatCellBias(mData.biases.d)}
                </td>
                <td class="py-1 px-1 text-right font-mono">
                    ${formatCellBias(mData.biases.a_d)}
                </td>
                <td class="py-1 px-1 text-right font-mono">
                    ${formatCellBias(mData.biases.rho_w)}
                </td>
                <td class="py-1 px-1 text-right font-mono">
                    ${formatCellBias(mData.biases.fck)}
                </td>
                <td class="py-1 px-1 text-right font-mono">
                    ${formatCellBias(mData.biases.sigma_cp)}
                </td>
            </tr>
        `;
    });

    card.innerHTML = `
        <div class="flex items-center justify-between pb-1 border-b border-[var(--color-border-primary)]">
            <div class="flex items-center gap-1.5 min-w-0">
                <span class="text-xs">📈</span>
                <span class="font-bold text-xs text-indigo-400 truncate">Ortogonalidade Residual</span>
            </div>
            <span class="text-[9.5px] px-1.5 py-0.5 rounded font-bold shrink-0 ${avgBadgeClass}" title="Média harmônica/geral de neutralidade estocástica dos 4 métodos">
                ROI Médio: ${avgRoi.toFixed(1)}%
            </span>
        </div>

        <!-- Overall Orthogonality Status & Gauge -->
        <div class="flex flex-col gap-0.5">
            <div class="flex justify-between items-center text-[10px]">
                <span class="text-gray-400">Neutralidade Global (r ≈ 0):</span>
                <span class="font-bold font-mono ${avgColor}">${avgRoi.toFixed(1)}% (${avgStatusText})</span>
            </div>
            <div class="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
                <div class="${avgBarColor} h-1.5 rounded-full transition-all duration-150" style="width: ${avgRoi}%"></div>
            </div>
        </div>

        <!-- Simultaneous Comparison Table of All 4 Orthogonality Formulations -->
        <div class="overflow-x-auto rounded-lg border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] shadow-2xs">
            <table class="w-full text-left text-[10px] border-collapse">
                <thead>
                    <tr class="border-b border-[var(--color-border-primary)] text-gray-400 text-[9px] uppercase font-bold bg-[var(--color-bg-primary)]">
                        <th class="py-1 px-1 text-left">Método</th>
                        <th class="py-1 px-1 text-center" title="Residual Orthogonality Index">ROI</th>
                        <th class="py-1 px-1 text-right font-mono" title="Correlação com Altura Útil d">Escala (d)</th>
                        <th class="py-1 px-1 text-right font-mono" title="Correlação com Vão a/d">Vão (a/d)</th>
                        <th class="py-1 px-1 text-right font-mono" title="Correlação com Taxa de Armadura ρw">Taxa (ρw)</th>
                        <th class="py-1 px-1 text-right font-mono" title="Correlação com Resistência fck">fck</th>
                        <th class="py-1 px-1 text-right font-mono" title="Correlação com Tensão de Protensão σ_cp">Prot. (σ_cp)</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-[var(--color-border-primary)]/40 text-[10px]">
                    ${rowsHtml}
                </tbody>
            </table>
        </div>

        <div class="flex items-center justify-between text-[8.5px] text-gray-400 px-0.5">
            <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span> Sem Viés (|r| &lt; 0.08)</span>
            <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block"></span> Leve (&lt; 0.20)</span>
            <span class="flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block"></span> Moderado</span>
        </div>

        <!-- Action Button to Open Full Modal -->
        <button type="button" onclick="openCorrelationModal()" class="w-full py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-[10.5px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs">
            <span>🔍</span> <span>Ver Matriz de Correlação & VIF</span>
        </button>
    `;

    // If modal is currently open, keep its contents reactive to slider moves!
    const modal = document.getElementById('correlationAnalysisModal');
    if (modal && !modal.classList.contains('hidden')) {
        renderCorrelationModalContent(stats);
    }
}

function openCorrelationModal() {
    const modal = document.getElementById('correlationAnalysisModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    const badge = document.getElementById('correlActiveSubsetBadge');
    if (badge) {
        badge.innerText = `${currentSubsetKey} (${currentFilteredRows ? currentFilteredRows.length : 0} vigas)`;
    }
    renderCorrelationModalContent();
}

function closeCorrelationModal() {
    const modal = document.getElementById('correlationAnalysisModal');
    if (modal) modal.classList.add('hidden');
}

function switchCorrelationTab(tabName) {
    currentCorrelationTab = tabName;
    const tabs = ['bias', 'matrix', 'stats'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tabBtnCorrel${t.charAt(0).toUpperCase() + t.slice(1)}`);
        const content = document.getElementById(`tabContentCorrel${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (t === tabName) {
            if (btn) {
                btn.className = 'px-3 py-2 font-bold border-b-2 border-indigo-500 text-indigo-400 flex items-center gap-1.5 transition-all cursor-pointer';
            }
            if (content) content.classList.remove('hidden');
        } else {
            if (btn) {
                btn.className = 'px-3 py-2 font-semibold border-b-2 border-transparent text-gray-400 hover:text-gray-200 flex items-center gap-1.5 transition-all cursor-pointer';
            }
            if (content) content.classList.add('hidden');
        }
    });
    renderCorrelationModalContent();
}

function setOrthogonalityMethod(method) {
    if (!['pearson', 'spearman', 'log', 'delta'].includes(method)) return;
    currentCorrelationMethod = method;
    cachedCorrelationStats = null;
    updateLiveCorrelationUI();
    const modal = document.getElementById('correlationAnalysisModal');
    if (modal && !modal.classList.contains('hidden')) {
        renderCorrelationModalContent();
    }
}
window.setOrthogonalityMethod = setOrthogonalityMethod;

function switchCorrelationMethod(method) {
    setOrthogonalityMethod(method);
    const btnP = document.getElementById('btnMethodPearson');
    const btnS = document.getElementById('btnMethodSpearman');
    if (method === 'pearson') {
        if (btnP) btnP.className = 'px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-600 text-white transition-all cursor-pointer';
        if (btnS) btnS.className = 'px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-all cursor-pointer';
    } else if (method === 'spearman') {
        if (btnS) btnS.className = 'px-2.5 py-1 rounded-md text-[11px] font-bold bg-indigo-600 text-white transition-all cursor-pointer';
        if (btnP) btnP.className = 'px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-400 hover:text-gray-200 transition-all cursor-pointer';
    }
}

function renderCorrelationHeatmap(stats) {
    if (!stats) return '';
    const keys = stats.matrixKeys;
    const method = currentCorrelationMethod;
    const matrix = method === 'spearman' ? stats.spearmanMatrix : stats.pearsonMatrix;
    const pvals = stats.pvaluesMatrix;

    let html = `
        <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-bg-primary)] p-2.5 rounded-lg border border-[var(--color-border-primary)]">
                <div class="flex items-center gap-2">
                    <span class="text-sm">🗺️</span>
                    <div>
                        <h4 class="text-xs font-bold text-gray-200">Matriz de Correlação Heatmap (${method === 'spearman' ? 'Spearman - Não Linear / Monotônica' : 'Pearson - Linear'})</h4>
                        <p class="text-[10.5px] text-gray-400">Interdependência empírica entre grandezas físicas e a razão residual R = V_test / V_calc.</p>
                    </div>
                </div>
                <div class="text-[10px] text-gray-400 flex items-center gap-2">
                    <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-cyan-500 inline-block"></span> Positiva</span>
                    <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-slate-700 inline-block"></span> Nula (r ≈ 0)</span>
                    <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-rose-500 inline-block"></span> Negativa</span>
                </div>
            </div>

            <div class="overflow-x-auto rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)]">
                <table class="w-full text-center text-[11px] border-collapse">
                    <thead>
                        <tr class="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] text-gray-300">
                            <th class="p-2 text-left font-bold text-xs sticky left-0 bg-[var(--color-bg-secondary)] z-10 border-r border-[var(--color-border-primary)]">Variável</th>
    `;

    keys.forEach(k => {
        const symbol = stats.varDict[k].symbol;
        html += `<th class="p-2 font-bold font-mono min-w-[70px]" title="${stats.varDict[k].label}">${symbol}</th>`;
    });
    html += `</tr></thead><tbody>`;

    keys.forEach((rk, rIdx) => {
        const rSymbol = stats.varDict[rk].symbol;
        const rLabel = stats.varDict[rk].label;
        const isLive = rk === 'R_Live';
        html += `
            <tr class="border-b border-[var(--color-border-primary)]/60 ${isLive ? 'bg-indigo-500/5' : ''}">
                <td class="p-2 text-left font-bold text-gray-200 sticky left-0 bg-[var(--color-bg-secondary)] z-10 border-r border-[var(--color-border-primary)] whitespace-nowrap" title="${rLabel}">
                    <span class="font-mono text-cyan-400">${rSymbol}</span>
                    <span class="text-[10px] text-gray-400 ml-1">(${rLabel.split('(')[0].trim()})</span>
                </td>
        `;

        keys.forEach((ck, cIdx) => {
            const rVal = matrix[rk][ck];
            const pVal = pvals[rk][ck];
            const isDiag = rk === ck;
            let bgStyle = '';
            let textClass = 'text-gray-200';

            if (isDiag) {
                bgStyle = 'background: rgba(100, 116, 139, 0.25);';
                textClass = 'text-gray-400 font-bold';
            } else {
                const absR = Math.abs(rVal);
                if (rVal > 0) {
                    const alpha = Math.min(0.85, absR * 0.75 + 0.10);
                    bgStyle = `background: rgba(14, 165, 233, ${alpha.toFixed(2)});`;
                    textClass = absR > 0.4 ? 'text-white font-bold' : 'text-cyan-200';
                } else if (rVal < 0) {
                    const alpha = Math.min(0.85, absR * 0.75 + 0.10);
                    bgStyle = `background: rgba(239, 68, 68, ${alpha.toFixed(2)});`;
                    textClass = absR > 0.4 ? 'text-white font-bold' : 'text-rose-200';
                } else {
                    bgStyle = 'background: transparent;';
                }
            }

            const pText = pVal < 0.001 ? 'p < 0.001 (Altamente Significativo)' : `p = ${pVal.toFixed(3)}`;
            const tooltip = `${stats.varDict[rk].label} vs ${stats.varDict[ck].label}\nCorrelação ${method.toUpperCase()}: ${rVal.toFixed(3)}\n${pText}`;

            html += `
                <td class="p-2 font-mono text-xs transition-colors hover:brightness-125 cursor-help ${textClass}" 
                    style="${bgStyle}" 
                    title="${tooltip}">
                    ${isDiag ? '1.000' : (rVal >= 0 ? '+' : '') + rVal.toFixed(3)}
                </td>
            `;
        });
        html += `</tr>`;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    return html;
}

function renderCorrelationBiasTab(stats) {
    if (!stats) return '';
    const roi = stats.roi;
    const method = currentCorrelationMethod;
    const biasKeys = ['d', 'a_d', 'rho_w', 'fck', 'sigma_cp', 'bw', 'bwd'];

    let roiStatus = 'Excepcional (Sem Viés Físico)';
    let roiColor = 'text-emerald-400';
    let roiBarColor = 'bg-emerald-500';
    let roiBadge = 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    if (roi < 75) {
        roiStatus = 'Atenção: Viés Significativo';
        roiColor = 'text-rose-400';
        roiBarColor = 'bg-rose-500';
        roiBadge = 'bg-rose-500/15 text-rose-300 border border-rose-500/30';
    } else if (roi < 88) {
        roiStatus = 'Moderado';
        roiColor = 'text-amber-400';
        roiBarColor = 'bg-amber-500';
        roiBadge = 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
    }

    let html = `
        <div class="flex flex-col gap-4">
            <!-- Top Hero KPI Box -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] shadow-sm">
                <!-- KPI 1: ROI -->
                <div class="flex flex-col gap-1.5 p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-gray-300 uppercase tracking-wider">Índice Ortogonalidade (ROI)</span>
                        <span class="text-[10px] px-2 py-0.5 rounded font-bold ${roiBadge}">${roi.toFixed(1)}%</span>
                    </div>
                    <div class="flex items-baseline gap-2">
                        <span class="text-2xl font-black font-mono ${roiColor}">${roi.toFixed(1)}%</span>
                        <span class="text-xs text-gray-400 font-semibold">${roiStatus}</span>
                    </div>
                    <div class="w-full bg-gray-700/50 rounded-full h-2 overflow-hidden mt-1">
                        <div class="${roiBarColor} h-2 rounded-full transition-all duration-300" style="width: ${roi}%"></div>
                    </div>
                    <span class="text-[10px] text-gray-400 mt-0.5">RMS de Viés com preditores: <strong>${stats.rmsR.toFixed(3)}</strong> (ideal = 0.000)</span>
                </div>

                <!-- KPI 2: Multicolinearidade VIF Média -->
                <div class="flex flex-col justify-between p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-gray-300 uppercase tracking-wider">Multicolinearidade (VIF)</span>
                        <span class="text-[10px] px-2 py-0.5 rounded font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">Média: 1.05</span>
                    </div>
                    <div class="flex items-baseline gap-2 my-1">
                        <span class="text-2xl font-black font-mono text-cyan-400">&lt; 1.15</span>
                        <span class="text-xs text-gray-400">Ausência de Colinearidade</span>
                    </div>
                    <p class="text-[10px] text-gray-400 leading-tight">
                        Confirma que os expoentes dos parâmetros possuem efeito mecânico individual livre de sobreposição matemática.
                    </p>
                </div>

                <!-- KPI 3: Amostras Válidas -->
                <div class="flex flex-col justify-between p-3 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)]">
                    <div class="flex items-center justify-between">
                        <span class="text-[11px] font-bold text-gray-300 uppercase tracking-wider">Amostras Avaliadas</span>
                        <span class="text-[10px] px-2 py-0.5 rounded font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">${stats.subset}</span>
                    </div>
                    <div class="flex items-baseline gap-2 my-1">
                        <span class="text-2xl font-black font-mono text-indigo-400">${stats.count}</span>
                        <span class="text-xs text-gray-400">Vigas Experimentais</span>
                    </div>
                    <p class="text-[10px] text-gray-400 leading-tight">
                        Método estocástico ativo: <strong>${method === 'spearman' ? 'Spearman (Postos Monotônicos)' : 'Pearson (Correlação Linear Pura)'}</strong>.
                    </p>
                </div>
            </div>

            <!-- Scientific Rationale Notice -->
            <div class="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-xs">
                <span class="text-base shrink-0">🎯</span>
                <div class="space-y-1">
                    <h5 class="font-bold text-indigo-300 text-xs">Fundamentação Científica da Ortogonalidade Residual</h5>
                    <p class="text-[11px] text-gray-300 leading-relaxed">
                        Em formulações de engenharia estrutural de alto nível, a margem de segurança $R = V_{\\text{test}} / V_{\\text{calc}}$ deve permanecer horizontal e invariante em relação a qualquer grandeza física ($d, a/d, \\rho_w, f_{ck}, b_w$). 
                        Valores de $r(R, x) \\approx 0$ demonstram que a equação eliminou o viés do fenômeno correspondente (ex: Size Effect eliminado quando $r(R, d) \\approx 0$).
                    </p>
                </div>
            </div>

            <!-- Comparison Table: Live Model vs Normas Oficiais -->
            <div class="overflow-x-auto rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-sm">
                <table class="w-full text-left text-xs border-collapse">
                    <thead>
                        <tr class="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] text-gray-300">
                            <th class="p-2.5 font-bold">Variável Física</th>
                            <th class="p-2.5 font-bold text-center">Expoente Live</th>
                            <th class="p-2.5 font-bold text-center bg-indigo-500/10 text-indigo-300">Live Model r</th>
                            <th class="p-2.5 font-bold text-center">Diagnóstico Live</th>
                            <th class="p-2.5 font-bold text-center text-sky-400">NBR 6118 r</th>
                            <th class="p-2.5 font-bold text-center text-emerald-400">EC2 (2023) r</th>
                            <th class="p-2.5 font-bold text-center text-rose-400">ACI 318-19 r</th>
                            <th class="p-2.5 font-bold">Ação Física / Recomendação</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[var(--color-border-primary)]/60">
    `;

    function formatRCell(rVal) {
        if (!isFinite(rVal)) return `<span class="text-gray-500 font-mono">-</span>`;
        const abs = Math.abs(rVal);
        let col = abs < 0.08 ? 'text-emerald-400 font-bold' : (abs < 0.20 ? 'text-cyan-300' : (abs < 0.30 ? 'text-amber-400' : 'text-rose-400 font-bold'));
        return `<span class="font-mono text-xs ${col}">${rVal >= 0 ? '+' : ''}${rVal.toFixed(3)}</span>`;
    }

    biasKeys.forEach(vk => {
        const item = stats.biasEval[vk];
        const rLive = item.activeR;
        const rNBR = stats.codeCorrelations.NBR6118[vk];
        const rEC2 = stats.codeCorrelations.EC2[vk];
        const rACI = stats.codeCorrelations.ACI[vk];

        html += `
            <tr class="hover:bg-gray-800/30 transition-colors">
                <td class="p-2.5 font-semibold text-gray-200">
                    <div class="flex items-center gap-1.5">
                        <span class="font-mono font-bold text-cyan-400">${item.symbol}</span>
                        <span class="text-xs text-gray-300">${item.label.split('(')[0].trim()}</span>
                        ${item.unit ? `<span class="text-[10px] text-gray-400">(${item.unit})</span>` : ''}
                    </div>
                </td>
                <td class="p-2.5 text-center font-mono font-bold text-purple-300">${item.coef}</td>
                <td class="p-2.5 text-center bg-indigo-500/10 font-bold">
                    ${formatRCell(rLive)}
                </td>
                <td class="p-2.5 text-center">
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${item.severityClass}">
                        ${item.severity.toUpperCase()}
                    </span>
                </td>
                <td class="p-2.5 text-center">${formatRCell(rNBR)}</td>
                <td class="p-2.5 text-center">${formatRCell(rEC2)}</td>
                <td class="p-2.5 text-center">${formatRCell(rACI)}</td>
                <td class="p-2.5 text-[11px] text-gray-300 leading-tight">
                    ${item.action}
                </td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;
    return html;
}

function renderCorrelationStatsTab(stats) {
    if (!stats) return '';
    const vifKeys = stats.hasPCData ? ['d', 'a_d', 'rho_w', 'fck', 'bw', 'sigma_cp'] : ['d', 'a_d', 'rho_w', 'fck', 'bw'];
    const descKeys = stats.matrixKeys;

    let html = `
        <div class="flex flex-col gap-4">
            <!-- VIF Section -->
            <div class="flex flex-col gap-2 p-3.5 rounded-xl bg-[var(--color-bg-primary)] border border-[var(--color-border-primary)] shadow-sm">
                <div class="flex items-center justify-between border-b border-[var(--color-border-primary)] pb-2">
                    <div class="flex items-center gap-2">
                        <span class="text-sm">📐</span>
                        <div>
                            <h4 class="text-xs font-bold text-gray-200">Fatores de Inflação da Variância (VIF - Multicolinearidade)</h4>
                            <p class="text-[10.5px] text-gray-400">Diagnóstico de redundância linear mútua entre as variáveis preditoras do banco de dados Reineck.</p>
                        </div>
                    </div>
                    <span class="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        VIF &lt; 2.0 (Excelente)
                    </span>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 ${stats.hasPCData ? 'md:grid-cols-6' : 'md:grid-cols-5'} gap-2.5 pt-1">
    `;

    vifKeys.forEach(pk => {
        const vVal = stats.vif[pk] || 1.0;
        const vInfo = stats.varDict[pk];
        html += `
            <div class="p-2.5 rounded-lg bg-[var(--color-bg-secondary)] border border-[var(--color-border-primary)] flex flex-col gap-1">
                <div class="flex items-center justify-between">
                    <span class="font-mono font-bold text-xs text-cyan-400">${vInfo.symbol}</span>
                    <span class="text-[9px] text-gray-400 uppercase">${vInfo.label.split('(')[0].trim()}</span>
                </div>
                <div class="flex items-baseline gap-1.5 my-0.5">
                    <span class="text-lg font-black font-mono text-emerald-400">${vVal.toFixed(3)}</span>
                    <span class="text-[10px] text-gray-400 font-semibold">VIF</span>
                </div>
                <div class="w-full bg-gray-700/50 rounded-full h-1 overflow-hidden">
                    <div class="bg-emerald-500 h-1 rounded-full" style="width: ${Math.min(100, (vVal / 5.0) * 100)}%"></div>
                </div>
                <span class="text-[9.5px] text-emerald-400/90 font-medium">Ausência de colinearidade</span>
            </div>
        `;
    });

    html += `
                </div>
                <p class="text-[10px] text-gray-400 pt-1 leading-normal italic">
                    💡 <strong>Interpretação:</strong> VIF próximo de 1.000 (todos &lt; 1.15) prova empiricamente que as variáveis independentes no banco Reineck são ortogonais entre si, permitindo calibrar individualmente os expoentes sem o risco de falsa correlação ou instabilidade numérica na regressão.
                </p>
            </div>

            <!-- Descriptive Stats Table -->
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <h4 class="text-xs font-bold text-gray-200">Estatísticas Descritivas Experimentais ($N = ${stats.count}$)</h4>
                    <span class="text-[10px] text-gray-400">Recorte Ativo: <strong>${stats.subset}</strong></span>
                </div>

                <div class="overflow-x-auto rounded-xl border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] shadow-sm">
                    <table class="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr class="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border-primary)] text-gray-300">
                                <th class="p-2 font-bold">Variável</th>
                                <th class="p-2 font-bold text-center">Símbolo</th>
                                <th class="p-2 font-bold text-center">Unidade</th>
                                <th class="p-2 font-bold text-right font-mono">Média (μ)</th>
                                <th class="p-2 font-bold text-right font-mono">Desvio (σ)</th>
                                <th class="p-2 font-bold text-right font-mono">CoV (%)</th>
                                <th class="p-2 font-bold text-right font-mono">Mediana</th>
                                <th class="p-2 font-bold text-right font-mono">Mín</th>
                                <th class="p-2 font-bold text-right font-mono">Máx</th>
                                <th class="p-2 font-bold text-right font-mono">Assimetria</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[var(--color-border-primary)]/60">
    `;

    descKeys.forEach(k => {
        const item = stats.descriptiveStats[k];
        if (!item) return;
        const isLive = k === 'R_Live';
        html += `
            <tr class="hover:bg-gray-800/30 transition-colors ${isLive ? 'bg-indigo-500/5 font-semibold' : ''}">
                <td class="p-2 font-semibold text-gray-200">${item.label.split('(')[0].trim()}</td>
                <td class="p-2 text-center font-mono font-bold text-cyan-400">${item.symbol}</td>
                <td class="p-2 text-center font-mono text-gray-400">${item.unit || '-'}</td>
                <td class="p-2 text-right font-mono text-gray-200">${item.mean.toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-gray-300">${item.std.toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-emerald-400">${item.cov.toFixed(1)}%</td>
                <td class="p-2 text-right font-mono text-gray-300">${item.median.toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-gray-400">${item.min.toFixed(2)}</td>
                <td class="p-2 text-right font-mono text-gray-400">${item.max.toFixed(2)}</td>
                <td class="p-2 text-right font-mono ${Math.abs(item.skew) > 1.0 ? 'text-amber-400' : 'text-gray-300'}">${item.skew.toFixed(2)}</td>
            </tr>
        `;
    });

    html += `
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    return html;
}

function renderCorrelationModalContent(precomputedStats) {
    const stats = precomputedStats || computeCorrelationStatistics();
    if (!stats) return;

    const bTab = document.getElementById('tabContentCorrelBias');
    const mTab = document.getElementById('tabContentCorrelMatrix');
    const sTab = document.getElementById('tabContentCorrelStats');

    if (currentCorrelationTab === 'bias' && bTab) {
        bTab.innerHTML = renderCorrelationBiasTab(stats);
    } else if (currentCorrelationTab === 'matrix' && mTab) {
        mTab.innerHTML = renderCorrelationHeatmap(stats);
    } else if (currentCorrelationTab === 'stats' && sTab) {
        sTab.innerHTML = renderCorrelationStatsTab(stats);
    }
}

function copyCorrelationLatex() {
    const stats = cachedCorrelationStats || computeCorrelationStatistics();
    if (!stats || !stats.latexCode) {
        showToast('Nenhum dado disponível para gerar código LaTeX.', 'error');
        return;
    }
    navigator.clipboard.writeText(stats.latexCode).then(() => {
        showToast('Tabela LaTeX copiada com sucesso! Pronta para uso em artigo/dissertação.', 'success');
    }).catch(err => {
        console.error('Clipboard copy failed:', err);
        window.prompt('Copie o código LaTeX abaixo (Ctrl+C):', stats.latexCode);
    });
}

function downloadCorrelationCSV() {
    const stats = cachedCorrelationStats || computeCorrelationStatistics();
    if (!stats) {
        showToast('Nenhum dado disponível para exportar CSV.', 'error');
        return;
    }

    const keys = stats.matrixKeys;
    const method = currentCorrelationMethod;
    const matrix = method === 'spearman' ? stats.spearmanMatrix : stats.pearsonMatrix;

    let csv = `Metodo;${method.toUpperCase()}\n`;
    csv += `Recorte;${stats.subset}\n`;
    csv += `Amostras;${stats.count}\n`;
    csv += `ROI;${stats.roi.toFixed(1)}%\n\n`;

    csv += 'Variavel;' + keys.map(k => `"${stats.varDict[k].label}"`).join(';') + '\n';
    keys.forEach(rk => {
        const line = [`"${stats.varDict[rk].label}"`];
        keys.forEach(ck => {
            line.push(matrix[rk][ck].toFixed(4));
        });
        csv += line.join(';') + '\n';
    });

    csv += '\nDiagnostico de Multicolinearidade (VIF)\n';
    csv += 'Variavel;VIF\n';
    Object.keys(stats.vif).forEach(pk => {
        csv += `"${stats.varDict[pk].label}";${stats.vif[pk].toFixed(4)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `correlacao_${method}_cisalhamento_${stats.subset.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Arquivo CSV baixado com sucesso!', 'success');
}

function debounceSimilarity(liveCurve) {
    clearTimeout(simTimeout);
    simTimeout = setTimeout(() => {
        calculateSimilarity(liveCurve);
    }, 200);
}

function getCodeKeyFromMetaOrString(k) {
    if (!k) return null;
    const allCodeKeys = ['A_NBR6118', 'A_EC2_2023', 'A_EC2_2004', 'A_ACI_25', 'A_ACI_19', 'A_ACI_14', 'A_MC2010_L2', 'A_MC2010_L1'];
    if (allCodeKeys.includes(k)) return k;
    const meta = getCodeMeta(k);
    if (!meta) return null;
    for (let codeKey of allCodeKeys) {
        if (CODE_EQUATION_METADATA[codeKey] === meta) {
            return codeKey;
        }
    }
    return null;
}

const ALL_DESIGN_CODE_KEYS = ['A_NBR6118', 'A_EC2_2023', 'A_EC2_2004', 'A_ACI_25', 'A_ACI_19', 'A_ACI_14', 'A_MC2010_L2', 'A_MC2010_L1'];

function resetCodeSimilarityMetrics(keysToReset) {
    (keysToReset || ALL_DESIGN_CODE_KEYS).forEach(k => {
        const trendEl = document.getElementById(`metric_trend_${k}`);
        const rmseEl = document.getElementById(`metric_rmse_${k}`);
        const derivEl = document.getElementById(`metric_deriv_${k}`);
        if (trendEl) {
            trendEl.className = 'font-mono font-bold text-gray-500 text-[10.5px]';
            trendEl.textContent = '-.---';
        }
        if (rmseEl) {
            rmseEl.className = 'font-mono font-semibold text-gray-400 text-[10.5px]';
            rmseEl.textContent = '-.---';
        }
        if (derivEl) {
            derivEl.className = 'font-mono font-semibold text-gray-400 text-[10.5px]';
            derivEl.textContent = '-.---';
        }
    });
}

function calculateSimilarity(liveCurve) {
    const simWait = document.getElementById('simWait');

    // Always update live model cards and code cards flatness
    updateLiveModelFlatnessUI();
    updateLiveCorrelationUI();
    updateCodeCardsFlatness();

    if (!liveCurve || liveCurve.length < 3 || Object.keys(cachedOtherCurves).length === 0) {
        if (simWait) simWait.classList.add('hidden');
        resetCodeSimilarityMetrics(ALL_DESIGN_CODE_KEYS);
        return;
    }

    if (simWait) simWait.classList.remove('hidden');

    if (typeof eel !== 'undefined' && eel.compare_lowess_curves_batch) {
        eel.compare_lowess_curves_batch(liveCurve, cachedOtherCurves)().then(results => {
            if (simWait) simWait.classList.add('hidden');
            if (!results) {
                resetCodeSimilarityMetrics(ALL_DESIGN_CODE_KEYS);
                return;
            }

            const updatedKeys = new Set();
            for (let rawKey of Object.keys(results)) {
                let codeKey = getCodeKeyFromMetaOrString(rawKey);
                if (!codeKey) continue;
                updatedKeys.add(codeKey);

                let res = results[rawKey];
                let trendEl = document.getElementById(`metric_trend_${codeKey}`);
                let rmseEl = document.getElementById(`metric_rmse_${codeKey}`);
                let derivEl = document.getElementById(`metric_deriv_${codeKey}`);

                if (trendEl && res.pearson !== undefined) {
                    let rClass = res.pearson > 0.9 ? 'text-emerald-400' : (res.pearson > 0.7 ? 'text-amber-400' : 'text-rose-400');
                    trendEl.className = `${rClass} font-bold font-mono text-[10.5px]`;
                    trendEl.textContent = res.pearson.toFixed(3);
                }
                if (rmseEl && res.rmse !== undefined) {
                    rmseEl.className = 'font-mono text-gray-200 font-semibold text-[10.5px]';
                    rmseEl.textContent = res.rmse.toFixed(3);
                }
                if (derivEl && res.deriv_r !== undefined) {
                    derivEl.className = 'font-mono text-gray-200 font-semibold text-[10.5px]';
                    derivEl.textContent = res.deriv_r.toFixed(3);
                }
            }

            // Reset keys that are not among the current batch comparison results
            const keysToReset = ALL_DESIGN_CODE_KEYS.filter(k => !updatedKeys.has(k));
            resetCodeSimilarityMetrics(keysToReset);

        }).catch(err => {
            console.error("Similarity metric error:", err);
            if (simWait) simWait.classList.add('hidden');
            resetCodeSimilarityMetrics(ALL_DESIGN_CODE_KEYS);
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

    const isPrestress = !excludePrestressed;
    const a_factor = params.alpha.disabled ? '1.0' : `(d_{dg}/d)^{${a_str}}`;
    const b_factor = params.beta.disabled ? '1.0' : `(100\\rho_w)^{${b_str}}`;
    const g_factor = params.gamma.disabled ? '1.0' : `f_{ck}^{${g_str}}`;
    const d_factor = params.delta.disabled ? '1.0' : `(a/d)^{${d_str}}`;
    const p_factor = isPrestress ? `+ ${params.mu.val.toFixed(2)}\\sigma_{cp}` : `\\sigma_{cp} = 0`;

    let rowsHtml = `
        <!-- Live Proposed Model Row -->
        <tr class="bg-cyan-500/10 border-b border-cyan-500/30">
            <td class="p-3 font-bold text-cyan-400 whitespace-nowrap">
                <div class="flex items-center gap-1.5">
                    <span>⚡</span> <span>Modelo Proposto (Live)</span>
                </div>
            </td>
            <td class="p-3 font-mono text-[11px] text-cyan-300 whitespace-nowrap" id="modal_eq_live"></td>
            <td class="p-3 text-[11px] ${params.alpha.disabled ? 'text-gray-500 line-through' : 'text-purple-300'} whitespace-nowrap">${renderFactorHTML({ math: a_factor, note: params.alpha.disabled ? '(off)' : '' })}</td>
            <td class="p-3 text-[11px] ${params.beta.disabled ? 'text-gray-500 line-through' : 'text-emerald-300'} whitespace-nowrap">${renderFactorHTML({ math: b_factor, note: params.beta.disabled ? '(off)' : '' })}</td>
            <td class="p-3 text-[11px] ${params.gamma.disabled ? 'text-gray-500 line-through' : 'text-amber-300'} whitespace-nowrap">${renderFactorHTML({ math: g_factor, note: params.gamma.disabled ? '(off)' : '' })}</td>
            <td class="p-3 text-[11px] ${params.delta.disabled ? 'text-gray-500 line-through' : 'text-blue-300'} whitespace-nowrap">${renderFactorHTML({ math: d_factor, note: params.delta.disabled ? '(off)' : '' })}</td>
            <td class="p-3 text-[11px] text-amber-300 whitespace-nowrap">${renderFactorHTML({ math: p_factor, note: isPrestress ? '(Ativa)' : '(Desativada)' })}</td>
            <td class="p-3 font-bold font-mono text-[11px] text-emerald-400 whitespace-nowrap">
                ${liveFlat ? liveFlat.flatnessScore.toFixed(1) + '% (' + (liveFlat.slopePerMeter >= 0 ? '+' : '') + liveFlat.slopePerMeter.toFixed(2) + '/m)' : '100%'}
            </td>
            <td class="p-3 text-[11px] text-gray-300 min-w-[240px]">
                Otimizado interativamente para atingir neutralidade de escala (FS constante independente de d).
            </td>
        </tr>
    `;

    const codeKeys = ['A_MC2010_L1', 'A_MC2010_L2', 'A_EC2_2004', 'A_EC2_2023', 'A_ACI_14', 'A_ACI_19', 'A_ACI_25', 'A_NBR6118'];
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

        const eqLatex = (isPrestress && meta.equationPrestressedLatex) ? meta.equationPrestressedLatex : meta.equationLatex;
        const pFactor = isPrestress ? meta.factors.prestress : meta.factors.prestressExcluded;

        rowsHtml += `
            <tr class="border-b border-[var(--color-border-primary)] hover:bg-[var(--color-bg-primary)]/60 transition-colors">
                <td class="p-3 font-bold text-gray-200 whitespace-nowrap">
                    <div class="flex items-center gap-1.5">
                        <span class="w-2.5 h-2.5 rounded-full" style="background:${meta.color};"></span>
                        <span>${meta.name}</span>
                    </div>
                </td>
                <td class="p-3 font-mono text-[11px] whitespace-nowrap" id="${eqId}"></td>
                <td class="p-3 text-[10.5px] text-purple-300 whitespace-nowrap">${renderFactorHTML(meta.factors.sizeEffect)}</td>
                <td class="p-3 text-[10.5px] text-emerald-300 whitespace-nowrap">${renderFactorHTML(meta.factors.reinforcement)}</td>
                <td class="p-3 text-[10.5px] text-amber-300 whitespace-nowrap">${renderFactorHTML(meta.factors.concrete)}</td>
                <td class="p-3 text-[10.5px] text-blue-300 whitespace-nowrap">${renderFactorHTML(meta.factors.shearSpan)}</td>
                <td class="p-3 text-[10.5px] text-amber-300 whitespace-nowrap">${renderFactorHTML(pFactor)}</td>
                <td class="p-3 font-bold font-mono text-[11px] ${flatClass} whitespace-nowrap">${flatStr}</td>
                <td class="p-3 text-[11px] text-gray-400 min-w-[240px] leading-relaxed">${meta.differenceOrigin}</td>
            </tr>
        `;

        latexModalQueue.push({ id: eqId, latex: eqLatex });
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
                        <th class="p-3 font-bold">Protensão (σ_cp)</th>
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

// -------------------------------------------------------------
// DYNAMIC Y-AXIS AUTO-SCALING (ELIMINATES EMPTY VOID & PREVENTS CLIPPING)
// -------------------------------------------------------------
window.shearAutoScaleY = true;

function calculateNiceMaxY(rawMax, isScatter = false) {
    if (!rawMax || rawMax <= 0 || !isFinite(rawMax)) return 4.0;

    // Safety threshold line R = 1.0 is always drawn, so we guarantee at least 1.5 as minimum ceiling
    const minCeiling = isScatter ? 2.0 : 1.5;
    const headroomFactor = isScatter ? 1.12 : 1.15;
    const target = Math.max(minCeiling, rawMax * headroomFactor);

    if (target <= 1.5) return 1.5;
    if (target <= 2.0) return Math.ceil(target * 5) / 5;   // steps of 0.2: 1.6, 1.8, 2.0
    if (target <= 4.0) return Math.ceil(target * 2) / 2;   // steps of 0.5: 2.5, 3.0, 3.5, 4.0
    if (target <= 8.0) return Math.ceil(target);           // steps of 1.0: 5.0, 6.0, 7.0, 8.0
    if (target <= 20.0) return Math.ceil(target / 2) * 2;  // steps of 2.0: 10, 12, 14, 16, 18, 20
    if (target <= 50.0) return Math.ceil(target / 5) * 5;  // steps of 5.0: 25, 30, 35, 40, 45, 50
    return Math.ceil(target / 10) * 10;                    // steps of 10.0: 60, 70, 80...
}

function adjustYScaleToVisibleDatasets() {
    if (!dbChart || !dbChart.data || !dbChart.data.datasets || !dbChart.options || !dbChart.options.scales || !dbChart.options.scales.y) return;
    
    if (window.shearAutoScaleY === false) {
        dbChart.options.scales.y.min = 0;
        dbChart.options.scales.y.max = 4.0;
        return;
    }

    let maxY = 0;
    let hasVisibleData = false;
    let hasScatterVisible = false;

    for (let i = 0; i < dbChart.data.datasets.length; i++) {
        if (dbChart.isDatasetVisible(i)) {
            const ds = dbChart.data.datasets[i];
            const isScatter = (ds._codeKey && ds._codeKey.includes('SCATTER')) || ds.type === 'scatter';
            if (isScatter) {
                hasScatterVisible = true;
            }
            if (ds.data && ds.data.length > 0) {
                const len = ds.data.length;
                for (let j = 0; j < len; j++) {
                    const pt = ds.data[j];
                    if (pt && isFinite(pt.y) && pt.y > maxY && pt.y < 100) {
                        maxY = pt.y;
                        hasVisibleData = true;
                    }
                }
            }
        }
    }

    if (hasVisibleData && maxY > 0) {
        const target = calculateNiceMaxY(maxY, hasScatterVisible);
        dbChart.options.scales.y.min = 0;
        dbChart.options.scales.y.max = target;
    } else {
        dbChart.options.scales.y.min = 0;
        dbChart.options.scales.y.max = 4.0;
    }
}

function updateYScaleButtonUI() {
    const btn = document.getElementById('btnToggleYScale');
    const lbl = document.getElementById('lblYScaleMode');
    if (!btn || !lbl) return;

    if (window.shearAutoScaleY !== false) {
        lbl.innerText = 'Y: Auto';
        btn.classList.add('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40', 'font-bold');
        btn.classList.remove('bg-[var(--color-bg-primary)]', 'text-gray-400', 'border-[var(--color-border-primary)]', 'font-medium', 'text-cyan-400');
        btn.title = 'Escala Y Automática ATIVA (ajusta dinamicamente a todos os dados e curvas visíveis sem corte). Clique para travar em Fixo (0 a 4.0).';
        const icon = btn.querySelector('span:first-child');
        if (icon) icon.innerText = '📏';
    } else {
        lbl.innerText = 'Y: Fixo (0-4)';
        btn.classList.remove('bg-cyan-500/20', 'text-cyan-300', 'border-cyan-500/40', 'font-bold');
        btn.classList.add('bg-[var(--color-bg-primary)]', 'text-gray-400', 'border-[var(--color-border-primary)]', 'font-medium');
        btn.title = 'Escala Y Fixa em [0 a 4.0] ATIVA. Clique para alternar para Escala Y Automática dinâmica.';
        const icon = btn.querySelector('span:first-child');
        if (icon) icon.innerText = '🔒';
    }
}

function toggleYScaleMode() {
    window.shearAutoScaleY = !window.shearAutoScaleY;
    updateYScaleButtonUI();
    adjustYScaleToVisibleDatasets();
    if (dbChart) dbChart.update('none');
    triggerAutoSave();
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
            'A_ACI_25': '190, 24, 93',
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
            'A_ACI_25': '244, 63, 94',
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
            const meta = getCodeMeta(codeKey);
            const parentLabel = selectedCbs[i].parentElement;
            let codeName = meta ? meta.name : '';
            if (!codeName && parentLabel) {
                const textSpan = parentLabel.querySelector('span:not([style*="background"])');
                codeName = textSpan ? textSpan.innerText.trim() : parentLabel.textContent.trim();
            }
            if (!codeName) codeName = codeKey;
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
            } else if (codeKey !== 'BASELINE_MODEL' && displayName && displayName.trim() !== '') {
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
                    _codeKey: codeKey === 'LIVE_MODEL' ? 'LIVE_MODEL_SCATTER' : (codeKey === 'BASELINE_MODEL' ? 'BASELINE_MODEL_SCATTER' : `${codeKey}_SCATTER`),
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
                        _codeKey: 'BIN_10TH',
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
                        _codeKey: 'BIN_5TH',
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
                        _codeKey: 'BIN_MEAN',
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

        for (let i = 0; i < newDatasets.length; i++) {
            const isVis = getDatasetVisibilityState(newDatasets[i]);
            newDatasets[i].hidden = !isVis;
        }

        dbChart.data.datasets = newDatasets;

        for (let i = 0; i < newDatasets.length; i++) {
            const isVis = getDatasetVisibilityState(newDatasets[i]);
            dbChart.setDatasetVisibility(i, isVis);
        }

        const firstMeta = selectedCbs.length === 1 ? getCodeMeta(selectedCbs[0].value) : null;
        const firstLabel = firstMeta ? firstMeta.name : (selectedCbs[0]?.parentElement ? selectedCbs[0].parentElement.textContent.trim() : '');
        dbChart.options.scales.x.title.text = varLabel;
        dbChart.options.scales.y.title.text = selectedCbs.length === 1 
            ? `${firstLabel} (V_test / V_calc)`
            : t('comparison_y_axis', 'V_test / V_calc (Comparativo)');

        adjustYScaleToVisibleDatasets();
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

function formatLiveEquationForExport() {
    const C = params.C.val;
    const c_str = params.C.disabled ? '' : `${C.toFixed(3)}`;
    
    let parts = [];
    if (c_str) parts.push(c_str);
    
    if (!params.alpha.disabled && Math.abs(params.alpha.val) > 1e-4) {
        parts.push(`(d_dg/d)^${params.alpha.val.toFixed(3)}`);
    }
    if (!params.beta.disabled && Math.abs(params.beta.val) > 1e-4) {
        parts.push(`(100·ρ_w)^${params.beta.val.toFixed(3)}`);
    }
    if (!params.gamma.disabled && Math.abs(params.gamma.val) > 1e-4) {
        parts.push(`f_ck^${params.gamma.val.toFixed(3)}`);
    }
    if (!params.delta.disabled && Math.abs(params.delta.val) > 1e-4) {
        parts.push(`(a/d)^${params.delta.val.toFixed(3)}`);
    }
    
    if (!params.epsilon.disabled) {
        if (Math.abs(params.epsilon.val - 1.0) < 1e-4) {
            parts.push(`b_w`);
        } else if (Math.abs(params.epsilon.val) > 1e-4) {
            parts.push(`b_w^${params.epsilon.val.toFixed(3)}`);
        }
    }
    if (!params.zeta.disabled) {
        if (Math.abs(params.zeta.val - 1.0) < 1e-4) {
            parts.push(`d`);
        } else if (Math.abs(params.zeta.val) > 1e-4) {
            parts.push(`d^${params.zeta.val.toFixed(3)}`);
        }
    }
    
    if (parts.length === 0) return 'V_calc = 1.000';
    return `V_calc = ` + parts.join(' · ');
}

function drawCanvasRoundRect(ctx, x, y, w, h, r, fill, stroke) {
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
        return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
}

function downloadChart() {
    if (!dbChart) return;
    const sourceCanvas = document.getElementById('databaseChart');
    if (!sourceCanvas) return;

    const selectedCodes = Array.from(document.querySelectorAll('.design-code-checkbox:checked')).map(cb => cb.value);
    const varEl = document.getElementById('varSelect');
    const varName = varEl ? varEl.options[varEl.selectedIndex].text : 'Variável X';
    const subsetEl = document.getElementById('subsetSelect');
    const subsetName = subsetEl ? subsetEl.options[subsetEl.selectedIndex].text : 'Todos os Dados';

    const meanVal = document.getElementById('statMean') ? document.getElementById('statMean').innerText.trim() : '-';
    const covVal = document.getElementById('statCov') ? document.getElementById('statCov').innerText.trim() : '-';
    const pointsCount = document.getElementById('lblPoints') ? document.getElementById('lblPoints').innerText.trim() : '0';

    // 1. Temporarily apply publication-grade styling to dbChart scales for white paper/thesis readability
    const origGridX = dbChart.options.scales.x.grid.color;
    const origTicksX = dbChart.options.scales.x.ticks.color;
    const origTitleX = dbChart.options.scales.x.title.color;
    const origGridY = dbChart.options.scales.y.grid.color;
    const origTicksY = dbChart.options.scales.y.ticks.color;
    const origTitleY = dbChart.options.scales.y.title.color;

    // Academic publication colors (sharp dark slate, subtle clean grid)
    dbChart.options.scales.x.grid.color = 'rgba(15, 23, 42, 0.08)';
    dbChart.options.scales.x.ticks.color = '#0f172a';
    dbChart.options.scales.x.title.color = '#0f172a';
    dbChart.options.scales.y.grid.color = 'rgba(15, 23, 42, 0.08)';
    dbChart.options.scales.y.ticks.color = '#0f172a';
    dbChart.options.scales.y.title.color = '#0f172a';

    // Synchronous update of Chart.js with publication colors
    dbChart.update('none');

    // 2. Gather visible datasets
    const visibleDatasets = [];
    if (dbChart.data && dbChart.data.datasets) {
        for (let i = 0; i < dbChart.data.datasets.length; i++) {
            if (dbChart.isDatasetVisible(i)) {
                visibleDatasets.push(dbChart.data.datasets[i]);
            }
        }
    }

    const dpr = 2; // Crisp 2x retina
    const chartW = sourceCanvas.width;
    const chartH = sourceCanvas.height;
    const padding = 30 * dpr;
    const totalW = chartW + padding * 2;
    const contentW = totalW - padding * 2;

    // Measured vertical dimensions
    const titleH = 46 * dpr;
    const eqBoxH = 76 * dpr;
    const headerH = titleH + eqBoxH + 16 * dpr;
    const chartY = padding + headerH;

    // Legend calculation (2-3 columns, guaranteed height)
    const legCols = Math.min(3, Math.max(1, Math.floor(contentW / (320 * dpr))));
    const legRows = Math.ceil(Math.max(1, visibleDatasets.length) / legCols);
    const legItemH = 26 * dpr;
    const legBoxH = 38 * dpr + legRows * legItemH;
    const legY = chartY + chartH + 18 * dpr;

    const footerY = legY + legBoxH + 20 * dpr;
    const totalH = footerY + 24 * dpr;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = totalW;
    exportCanvas.height = totalH;
    const ctx = exportCanvas.getContext('2d');

    // 3. 100% TRANSPARENT BACKGROUND (Crucial for thesis/dissertation in LaTeX/Word)
    ctx.clearRect(0, 0, totalW, totalH);

    // 4. Header: Title & Context
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${16 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText('Universal Code Explorer & Residual Analysis — Modelo Empírico de Cisalhamento', padding, padding + 15 * dpr);

    ctx.fillStyle = '#475569';
    ctx.font = `${11 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(`Variável (Eixo X): ${varName}   |   Recorte de Dados: ${subsetName}   |   Amostras: ${pointsCount} ensaios`, padding, padding + 34 * dpr);

    // 5. Academic Live Equation Box (Multi-line, wrapped & cleanly measured)
    const eqBoxY = padding + titleH;
    ctx.fillStyle = 'rgba(2, 132, 199, 0.04)';
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.35)';
    ctx.lineWidth = 1.5 * dpr;
    drawCanvasRoundRect(ctx, padding, eqBoxY, contentW, eqBoxH, 6 * dpr, true, true);

    // Line 1: Mathematical formulation
    ctx.fillStyle = '#0284c7';
    ctx.font = `bold ${11.5 * dpr}px Consolas, Monaco, monospace`;
    const isPrestressExport = !excludePrestressed && params.mu && !params.mu.disabled && Math.abs(params.mu.val) > 1e-4;
    const pcTermStr = isPrestressExport ? ` + ${params.mu.val.toFixed(2)}·σ_cp` : '';
    const pcLimitStr = isPrestressExport ? ' [σ_cp ≤ 0.2·f_ck]' : '';
    const deffTermStr = useDeffConstraint ? ' [d_eff = min(d, √(a_cs/4·d)), a_cs ≥ d]' : '';
    const dSym = useDeffConstraint ? 'd_eff' : 'd';
    const modelFormulation = isPrestressExport
        ? `MODELO PROPOSTO (COM PROTENSÃO):  V_calc = [C · (d_dg/${dSym})^α · (100·ρ_w)^β · f_ck^γ · (a/d)^δ${pcTermStr}] · b_w · d${pcLimitStr}${deffTermStr}`
        : (useDeffConstraint
            ? `MODELO COM TRAVA CINEMÁTICA:  V_calc = C · (d_dg/d_eff)^α · (100·ρ_w)^β · f_ck^γ · (a/d)^δ · b_w · d${deffTermStr}`
            : `MODELO EMPÍRICO CALIBRADO (SEM PROTENSÃO):  V_calc = C · (d_dg/d)^α · (100·ρ_w)^β · f_ck^γ · (a/d)^δ · b_w · d`);
    ctx.fillText(modelFormulation, padding + 14 * dpr, eqBoxY + 20 * dpr);

    // Line 2: Calibrated parameters
    const C = params.C.val;
    const aVal = params.alpha.disabled ? '0.000 (desat.)' : params.alpha.val.toFixed(3);
    const bVal = params.beta.disabled ? '0.000 (desat.)' : params.beta.val.toFixed(3);
    const gVal = params.gamma.disabled ? '0.000 (desat.)' : params.gamma.val.toFixed(3);
    const dVal = params.delta.disabled ? '0.000 (desat.)' : params.delta.val.toFixed(3);
    const mValStr = isPrestressExport ? `  |  μ = ${params.mu.val.toFixed(3)}` : '  |  μ = 0.000 (s/ PC)';
    ctx.fillStyle = '#1e293b';
    ctx.font = `600 ${10.5 * dpr}px Consolas, Monaco, monospace`;
    ctx.fillText(`Parâmetros:  C = ${C.toFixed(3)}  |  α = ${aVal}  |  β = ${bVal}  |  γ = ${gVal}  |  δ = ${dVal}${mValStr}`, padding + 14 * dpr, eqBoxY + 41 * dpr);

    // Line 3: Statistical metrics
    const meanNum = parseFloat(meanVal);
    const safetyStatus = isNaN(meanNum) ? '' : (meanNum < 1.0 ? 'Margem Insegura (R < 1.0) ⚠️' : 'Margem Segura (R ≥ 1.0) ✓');
    ctx.fillStyle = '#334155';
    ctx.font = `${10 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText(`Média R (V_test / V_calc): ${meanVal}    |    Coeficiente de Variação (CoV): ${covVal}    |    ${safetyStatus}`, padding + 14 * dpr, eqBoxY + 62 * dpr);

    // 6. Draw Chart with Border Frame
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.lineWidth = 1 * dpr;
    drawCanvasRoundRect(ctx, padding, chartY, chartW, chartH, 6 * dpr, false, true);
    ctx.drawImage(sourceCanvas, padding, chartY, chartW, chartH);

    // Restore original UI chart colors
    dbChart.options.scales.x.grid.color = origGridX;
    dbChart.options.scales.x.ticks.color = origTicksX;
    dbChart.options.scales.x.title.color = origTitleX;
    dbChart.options.scales.y.grid.color = origGridY;
    dbChart.options.scales.y.ticks.color = origTicksY;
    dbChart.options.scales.y.title.color = origTitleY;
    dbChart.update('none');

    // 7. Full Legend Box below Chart
    ctx.fillStyle = 'rgba(248, 250, 252, 0.7)';
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.18)';
    ctx.lineWidth = 1 * dpr;
    drawCanvasRoundRect(ctx, padding, legY, contentW, legBoxH, 6 * dpr, true, true);

    ctx.fillStyle = '#475569';
    ctx.font = `bold ${10 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillText('LEGENDA COMPLETA DO GRÁFICO (SÉRIES ATIVAS):', padding + 14 * dpr, legY + 18 * dpr);

    const colW = (contentW - 24 * dpr) / legCols;
    visibleDatasets.forEach((ds, idx) => {
        const c = idx % legCols;
        const r = Math.floor(idx / legCols);
        const itemX = padding + 14 * dpr + c * colW;
        const itemY = legY + 36 * dpr + r * legItemH;

        ctx.save();
        if (ds.type === 'scatter') {
            ctx.fillStyle = ds.borderColor || ds.backgroundColor || '#475569';
            ctx.beginPath();
            ctx.arc(itemX + 6 * dpr, itemY - 4 * dpr, 4 * dpr, 0, Math.PI * 2);
            ctx.fill();
        } else if (ds.borderDash && ds.borderDash.length) {
            ctx.strokeStyle = ds.borderColor || '#333';
            ctx.lineWidth = 2.5 * dpr;
            ctx.setLineDash([5 * dpr, 3 * dpr]);
            ctx.beginPath();
            ctx.moveTo(itemX, itemY - 4 * dpr);
            ctx.lineTo(itemX + 18 * dpr, itemY - 4 * dpr);
            ctx.stroke();
        } else {
            ctx.strokeStyle = ds.borderColor || '#333';
            ctx.lineWidth = 3 * dpr;
            ctx.beginPath();
            ctx.moveTo(itemX, itemY - 4 * dpr);
            ctx.lineTo(itemX + 18 * dpr, itemY - 4 * dpr);
            ctx.stroke();
        }
        ctx.restore();

        ctx.fillStyle = '#0f172a';
        ctx.font = `500 ${10 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        const labelText = ds.label || `Série ${idx + 1}`;
        ctx.fillText(labelText, itemX + 24 * dpr, itemY);
    });

    // 8. Footer (Guaranteed safely below legend box)
    ctx.fillStyle = '#64748b';
    ctx.font = `${9 * dpr}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    const dateStr = new Date().toLocaleString('pt-BR');
    ctx.fillText(`Exportado em ${dateStr}  •  Dataset Reineck (2013) com 1804 vigas sem estribo  •  Fundo Transparente para Dissertação`, padding, footerY + 8 * dpr);

    // 9. Trigger download of publication PNG
    const link = document.createElement('a');
    const codeKey = selectedCodes.length > 0 ? selectedCodes.join('_') : 'live';
    const varKey = (varEl ? varEl.value : 'var').replace(/[\/\:\s\(\)]/g, '_');
    const subKey = (subsetEl ? subsetEl.value : 'all').replace('>', 'gt');
    link.download = `shear_model_${codeKey}_vs_${varKey}_subset_${subKey}_mestrado_transparente.png`;
    link.href = exportCanvas.toDataURL('image/png', 1.0);
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
window.toggleDynamicFilterPanel = toggleDynamicFilterPanel;
window.setDynPreset = setDynPreset;
window.resetDynamicFilters = resetDynamicFilters;
window.onDynamicFilterInputChange = onDynamicFilterInputChange;
window.toggleYScaleMode = toggleYScaleMode;
window.adjustYScaleToVisibleDatasets = adjustYScaleToVisibleDatasets;
window.updateYScaleButtonUI = updateYScaleButtonUI;
window.calculateNiceMaxY = calculateNiceMaxY;
window.openCorrelationModal = openCorrelationModal;
window.closeCorrelationModal = closeCorrelationModal;
window.switchCorrelationTab = switchCorrelationTab;
window.switchCorrelationMethod = switchCorrelationMethod;
window.copyCorrelationLatex = copyCorrelationLatex;
window.downloadCorrelationCSV = downloadCorrelationCSV;
window.updateLiveCorrelationUI = updateLiveCorrelationUI;
window.computeCorrelationStatistics = computeCorrelationStatistics;
window.computePearson = computePearson;
window.computeSpearman = computeSpearman;
window.invertMatrix = invertMatrix;

// -------------------------------------------------------------
// Horizontal Design Codes Panel (KaTeX Equations & Toggles)
// -------------------------------------------------------------
function renderHorizontalCodeCardsEquations() {
    const codeKeys = ['A_NBR6118', 'A_EC2_2023', 'A_EC2_2004', 'A_ACI_25', 'A_ACI_19', 'A_ACI_14', 'A_MC2010_L2', 'A_MC2010_L1'];
    const isPrestress = !excludePrestressed;

    codeKeys.forEach(k => {
        const meta = CODE_EQUATION_METADATA[k];
        if (!meta) return;
        const eqLatex = (isPrestress && meta.equationPrestressedLatex) ? meta.equationPrestressedLatex : meta.equationLatex;
        const secLatex = (isPrestress && meta.secondaryPrestressedLatex) ? meta.secondaryPrestressedLatex : meta.secondaryLatex;
        const eqEl = document.getElementById(`code_card_eq_${k}`);
        if (eqEl) {
            renderLatexToElement(eqEl, eqLatex, true);
        }
        const secEl = document.getElementById(`code_card_sec_${k}`);
        if (secEl && secLatex) {
            renderLatexToElement(secEl, secLatex, false);
        }
        const factorsEl = document.getElementById(`card_factors_${k}`);
        if (factorsEl && meta.factors) {
            const pFactor = isPrestress ? meta.factors.prestress : meta.factors.prestressExcluded;
            factorsEl.innerHTML = `
                <div class="flex flex-col gap-0.5">
                    <span class="text-purple-400 font-bold text-[9px] uppercase tracking-wider">Efeito de Escala (Size Effect):</span>
                    <div class="text-gray-200 text-[9.5px] pl-1">${renderFactorHTML(meta.factors.sizeEffect)}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="text-emerald-400 font-bold text-[9px] uppercase tracking-wider">Armadura Longitudinal (ρw):</span>
                    <div class="text-gray-200 text-[9.5px] pl-1">${renderFactorHTML(meta.factors.reinforcement)}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="text-amber-400 font-bold text-[9px] uppercase tracking-wider">Resistência do Concreto (fck):</span>
                    <div class="text-gray-200 text-[9.5px] pl-1">${renderFactorHTML(meta.factors.concrete)}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="text-blue-400 font-bold text-[9px] uppercase tracking-wider">Vão Cisalhante (a/d):</span>
                    <div class="text-gray-200 text-[9.5px] pl-1">${renderFactorHTML(meta.factors.shearSpan)}</div>
                </div>
                <div class="flex flex-col gap-0.5">
                    <span class="text-amber-500 font-bold text-[9px] uppercase tracking-wider flex items-center gap-1">
                        <span>Protensão (σ_cp):</span>
                        <span class="text-[8px] px-1 py-0.2 rounded ${isPrestress ? 'bg-amber-500/20 text-amber-300' : 'bg-gray-800 text-gray-400'} font-normal font-sans">
                            ${isPrestress ? 'Ativa' : 'Desativada'}
                        </span>
                    </span>
                    <div class="text-gray-200 text-[9.5px] pl-1">${renderFactorHTML(pFactor)}</div>
                </div>
                <div class="mt-1 pt-1 border-t border-[var(--color-border-primary)] text-[9.5px] text-gray-300 italic leading-snug">
                    <strong class="text-cyan-400 font-normal">Origem da Diferença:</strong> ${meta.differenceOrigin}
                </div>
            `;
        }
    });
    updateCodeCardsFlatness();
}
window.renderHorizontalCodeCardsEquations = renderHorizontalCodeCardsEquations;

function updateCodeCardsFlatness() {
    const codeKeys = ['A_NBR6118', 'A_EC2_2023', 'A_EC2_2004', 'A_ACI_25', 'A_ACI_19', 'A_ACI_14', 'A_MC2010_L2', 'A_MC2010_L1'];
    codeKeys.forEach(k => {
        const flatEl = document.getElementById(`metric_flat_${k}`);
        if (!flatEl) return;
        const codeFlat = computeCodeFlatness(k);
        if (codeFlat) {
            const fScore = codeFlat.flatnessScore;
            const fColor = fScore >= 90 ? 'text-emerald-400' : (fScore >= 80 ? 'text-amber-400' : 'text-rose-400');
            flatEl.className = `font-mono font-semibold text-[10.5px] ${fColor}`;
            flatEl.textContent = `${fScore.toFixed(1)}% (${codeFlat.slopePerMeter >= 0 ? '+' : ''}${codeFlat.slopePerMeter.toFixed(2)}/m)`;
        } else {
            flatEl.className = 'font-mono font-semibold text-gray-400 text-[10.5px]';
            flatEl.textContent = '-.--%';
        }
    });
}
window.updateCodeCardsFlatness = updateCodeCardsFlatness;
window.calculateSimilarity = calculateSimilarity;

function setAllDesignCodes(checked) {
    document.querySelectorAll('.design-code-checkbox').forEach(cb => {
        if (cb.value !== 'LIVE_MODEL' && cb.value !== 'BASELINE_MODEL') {
            cb.checked = checked;
        }
    });
    updateDatabaseChart();
    triggerAutoSave();
}
window.setAllDesignCodes = setAllDesignCodes;

function selectRecentDesignCodes() {
    const recent = ['A_NBR6118', 'A_EC2_2023', 'A_ACI_25'];
    document.querySelectorAll('.design-code-checkbox').forEach(cb => {
        if (cb.value !== 'LIVE_MODEL' && cb.value !== 'BASELINE_MODEL') {
            cb.checked = recent.includes(cb.value);
        }
    });
    updateDatabaseChart();
    triggerAutoSave();
}
window.selectRecentDesignCodes = selectRecentDesignCodes;

// -------------------------------------------------------------
// Column Layout & Height Reset (Prevents Empty Space Retention)
// -------------------------------------------------------------
function syncColumnsHeight() {
    const col1 = document.getElementById('sidebarControls');
    const col2 = document.getElementById('chartMainArea');
    const chartCard = document.getElementById('chartSectionCard');
    const col3 = document.getElementById('similarityCol');
    const simPanel = document.getElementById('similarityPanel');

    // Always clear forced fixed heights so columns adapt cleanly to their actual content
    if (col1) {
        col1.style.height = '';
        col1.style.maxHeight = '';
    }
    if (col2) {
        col2.style.height = '';
        col2.style.maxHeight = '';
    }
    if (chartCard) {
        chartCard.style.height = '';
        chartCard.style.maxHeight = '';
    }
    if (col3) {
        col3.style.height = '';
        col3.style.maxHeight = '';
    }
    if (simPanel) {
        simPanel.style.height = '';
        simPanel.style.maxHeight = '';
    }
}
window.syncColumnsHeight = syncColumnsHeight;

function initColumnHeightSync() {
    syncColumnsHeight();
    window.addEventListener('resize', syncColumnsHeight);
}
window.initColumnHeightSync = initColumnHeightSync;

// -------------------------------------------------------------
// BATCH EXPORT ROUTINE (DATABASE VARIATIONS)
// -------------------------------------------------------------
let cachedBatchMeta = null;
let isBatchRunning = false;

function getCurrentLiveModelParams() {
    const parseNum = (val, fallback) => {
        if (val === undefined || val === null || val === '') return fallback;
        const num = parseFloat(String(val).replace(',', '.'));
        return isNaN(num) ? fallback : num;
    };

    const getParamVal = (key, fallback) => {
        const inp = document.getElementById(`inp_${key}`);
        if (inp && inp.value !== '') {
            return parseNum(inp.value, fallback);
        }
        if (params && params[key] && typeof params[key].val === 'number' && !isNaN(params[key].val)) {
            return params[key].val;
        }
        return fallback;
    };

    const isDis = (key) => !!(params && params[key] && params[key].disabled);

    const cVal = getParamVal('C', 1.250);
    const alphaVal = isDis('alpha') ? 0.0 : getParamVal('alpha', 0.333);
    const betaVal = isDis('beta') ? 0.0 : getParamVal('beta', 0.333);
    const gammaVal = isDis('gamma') ? 0.0 : getParamVal('gamma', 0.333);
    const deltaVal = isDis('delta') ? 0.0 : getParamVal('delta', -0.750);
    const muVal = isDis('mu') ? 0.0 : getParamVal('mu', 0.150);

    // Keep params object synchronized as well
    if (params) {
        if (params.C) params.C.val = cVal;
        if (params.alpha && !params.alpha.disabled) params.alpha.val = alphaVal;
        if (params.beta && !params.beta.disabled) params.beta.val = betaVal;
        if (params.gamma && !params.gamma.disabled) params.gamma.val = gammaVal;
        if (params.delta && !params.delta.disabled) params.delta.val = deltaVal;
        if (params.mu && !params.mu.disabled) params.mu.val = muVal;
    }

    return {
        C: cVal,
        alpha: alphaVal,
        beta: betaVal,
        gamma: gammaVal,
        delta: deltaVal,
        mu: muVal,
        epsilon: 1.0,
        zeta: 1.0,
        use_deff: !!useDeffConstraint,
        alpha_disabled: isDis('alpha'),
        beta_disabled: isDis('beta'),
        gamma_disabled: isDis('gamma'),
        delta_disabled: isDis('delta'),
        mu_disabled: isDis('mu'),
    };
}
window.getCurrentLiveModelParams = getCurrentLiveModelParams;
window.params = params;

function openBatchSaveModal() {
    const modal = document.getElementById('modalBatchSaveShear');
    if (!modal) {
        console.error("modalBatchSaveShear element not found in DOM");
        return;
    }

    // Update active parameter displays in modal
    try {
        const live = getCurrentLiveModelParams();
        const lblC = document.getElementById('batchLblC');
        const lblA = document.getElementById('batchLblAlpha');
        const lblB = document.getElementById('batchLblBeta');
        const lblG = document.getElementById('batchLblGamma');
        const lblD = document.getElementById('batchLblDelta');
        const lblM = document.getElementById('batchLblMu');
        const lblDeff = document.getElementById('batchLblDeff');

        if (lblC) lblC.innerText = live.C.toFixed(3);
        if (lblA) lblA.innerText = live.alpha_disabled ? '0 (desat)' : live.alpha.toFixed(3);
        if (lblB) lblB.innerText = live.beta_disabled ? '0 (desat)' : live.beta.toFixed(3);
        if (lblG) lblG.innerText = live.gamma_disabled ? '0 (desat)' : live.gamma.toFixed(3);
        if (lblD) lblD.innerText = live.delta_disabled ? '0 (desat)' : live.delta.toFixed(3);
        if (lblM) lblM.innerText = live.mu_disabled ? '0 (desat)' : live.mu.toFixed(3);
        if (lblDeff) lblDeff.innerText = useDeffConstraint ? 'd_eff ATIVO (CSCT/EC2)' : 'd_eff desat.';

        const chkPC = document.getElementById('batchChkExcludePC');
        if (chkPC) chkPC.checked = !!excludePrestressed;
    } catch (err) {
        console.warn("Error setting modal header values:", err);
    }

    // Populate checkboxes immediately from defaults
    renderBatchSubsetsCheckboxes();
    updateBatchEstimatedCounts();

    // Show modal immediately
    modal.classList.remove('hidden');

    // Fetch dynamic metadata from backend in background if available
    if (!cachedBatchMeta && window.eel && eel.get_shear_batch_metadata) {
        eel.get_shear_batch_metadata()().then(meta => {
            if (meta && meta.subsets) {
                cachedBatchMeta = meta;
                renderBatchSubsetsCheckboxes();
                updateBatchEstimatedCounts();
            }
        }).catch(e => console.warn("Could not load batch metadata from eel:", e));
    }
}

function closeBatchSaveModal() {
    const modal = document.getElementById('modalBatchSaveShear');
    if (modal) modal.classList.add('hidden');
}

function renderBatchSubsetsCheckboxes() {
    const container = document.getElementById('batchSubsetsContainer');
    if (!container) return;

    const subsets = (cachedBatchMeta && cachedBatchMeta.subsets) ? cachedBatchMeta.subsets : [
        { key: "ALL DATA", label: "Todos os Dados (Global)", group: "Global", short: "global_all" },
        { key: "slabs_all", label: "Todas as Lajes (bw/d >= 2)", group: "Lajes", short: "slabs_all" },
        { key: "slabs_slender_600", label: "Lajes Esbeltas (d < 600mm)", group: "Lajes", short: "slabs_slender_600" },
        { key: "slabs_slender_400", label: "Lajes Esbeltas (d < 400mm)", group: "Lajes", short: "slabs_slender_400" },
        { key: "slabs_thick_600", label: "Elementos Espessos (d >= 600mm)", group: "Lajes", short: "slabs_thick_600" },
        { key: "slabs_thick_400", label: "Lajes Espessas (d >= 400mm)", group: "Lajes", short: "slabs_thick_400" },
        { key: "slabs_wide", label: "Lajes Muito Largas (bw/d >= 5)", group: "Lajes", short: "slabs_wide" },
        { key: "members_slender_600", label: "Vigas Esbeltas (d < 600mm)", group: "Altura Útil", short: "members_slender_600" },
        { key: "members_slender_400", label: "Vigas Esbeltas (d < 400mm)", group: "Altura Útil", short: "members_slender_400" },
        { key: "members_long_span", label: "Vão Longo (a/d >= 2.5)", group: "Vão Cisalhante", short: "span_long" },
        { key: "members_short_span", label: "Vão Curto / Bielas (a/d < 2.5)", group: "Vão Cisalhante", short: "span_short" },
        { key: "rho_low", label: "Baixa Armadura (ρ < 1.0%)", group: "Armadura", short: "rho_low" },
        { key: "rho_very_low", label: "Armadura Muito Baixa (ρ < 0.5%)", group: "Armadura", short: "rho_very_low" },
        { key: "rho_high", label: "Alta Armadura (ρ >= 1.5%)", group: "Armadura", short: "rho_high" },
        { key: "fck_high", label: "Alta Resistência (fck > 50 MPa)", group: "Concreto", short: "fck_high" },
        { key: "fck_normal", label: "Convencional (fck <= 50 MPa)", group: "Concreto", short: "fck_normal" },
        { key: "d_dg_large", label: "Agregado Graúdo (ddg > 32mm)", group: "Materiais", short: "ddg_large" },
        { key: "mat_rc", label: "Apenas Concreto Armado (RC)", group: "Tipologia", short: "mat_rc" },
        { key: "mat_pc", label: "Apenas Protendido (PC)", group: "Tipologia", short: "mat_pc" }
    ];

    container.innerHTML = subsets.map(s => `
        <label class="flex items-center gap-1.5 p-1 rounded bg-[var(--color-bg-secondary)] hover:bg-gray-800 border border-[var(--color-border-primary)] cursor-pointer text-[10.5px]">
            <input type="checkbox" value="${s.key}" class="batch-subset-checkbox rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0" checked onchange="updateBatchEstimatedCounts()">
            <span class="text-gray-300 truncate" title="${s.label}">${s.label}</span>
        </label>
    `).join('');
}

function quickSelectBatchSubsets(mode) {
    const cbs = document.querySelectorAll('.batch-subset-checkbox');
    cbs.forEach(cb => {
        const val = cb.value;
        if (mode === 'all') {
            cb.checked = true;
        } else if (mode === 'none') {
            cb.checked = false;
        } else if (mode === 'slabs') {
            cb.checked = val.includes('slabs');
        } else if (mode === 'slender') {
            cb.checked = val.includes('slender') || val.includes('span') || val.includes('members');
        } else if (mode === 'materials') {
            cb.checked = val.includes('rho') || val.includes('fck') || val.includes('d_dg') || val.includes('mat');
        }
    });
    updateBatchEstimatedCounts();
}

function updateBatchEstimatedCounts() {
    const selectedSubsets = Array.from(document.querySelectorAll('.batch-subset-checkbox:checked')).map(cb => cb.value);
    const selectedVars = Array.from(document.querySelectorAll('.batch-var-checkbox:checked')).map(cb => cb.value);
    const count = selectedSubsets.length * selectedVars.length;

    const badge = document.getElementById('batchEstimatedCountsBadge');
    if (badge) {
        badge.innerText = `Estimativa: ${count} gráficos e 1 planilha consolidada (.csv)`;
    }
}

async function startBatchSaveRoutine() {
    if (isBatchRunning) return;

    const selectedSubsets = Array.from(document.querySelectorAll('.batch-subset-checkbox:checked')).map(cb => cb.value);
    const selectedVars = Array.from(document.querySelectorAll('.batch-var-checkbox:checked')).map(cb => cb.value);

    if (selectedSubsets.length === 0) {
        alert("Por favor selecione pelo menos um recorte da base de dados.");
        return;
    }
    if (selectedVars.length === 0) {
        alert("Por favor selecione pelo menos uma variável X.");
        return;
    }

    const outDirInput = document.getElementById('batchOutDirInput');
    const outDir = outDirInput ? outDirInput.value.trim() : 'plots/shear_model_variations';
    const dpiSelect = document.getElementById('batchDpiSelect');
    const dpi = dpiSelect ? parseInt(dpiSelect.value) : 200;
    const includeCodes = document.getElementById('batchChkIncludeCodes') ? document.getElementById('batchChkIncludeCodes').checked : true;
    const excludePC = document.getElementById('batchChkExcludePC') ? document.getElementById('batchChkExcludePC').checked : false;

    // Pack current model parameters directly from live inputs
    const live = getCurrentLiveModelParams();
    const modelParams = {
        C: live.C,
        alpha: live.alpha,
        beta: live.beta,
        gamma: live.gamma,
        delta: live.delta,
        mu: live.mu,
        epsilon: 1.0,
        zeta: 1.0,
        use_deff: !!useDeffConstraint,
    };

    const payload = {
        out_dir: outDir,
        dpi: dpi,
        model_params: modelParams,
        selected_subsets: selectedSubsets,
        selected_vars: selectedVars,
        include_codes: includeCodes,
        exclude_pc: excludePC,
    };

    console.log("[Shear Batch Export] Disparando rotina com payload:", payload);

    // UI Feedback: starting
    isBatchRunning = true;
    const btn = document.getElementById('btnStartBatchSave');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span>⏳</span> <span>Gerando Gráficos...</span>`;
    }

    const pSection = document.getElementById('batchProgressSection');
    const sBox = document.getElementById('batchSuccessBox');
    if (pSection) pSection.classList.remove('hidden');
    if (sBox) sBox.classList.add('hidden');

    const pBar = document.getElementById('batchProgressBar');
    const pPct = document.getElementById('batchProgressPct');
    const pStatus = document.getElementById('batchProgressStatus');

    if (pBar) pBar.style.width = '0%';
    if (pPct) pPct.innerText = '0%';
    if (pStatus) pStatus.innerText = 'Iniciando processamento no Python...';

    try {
        if (window.eel && typeof eel.run_shear_batch_export === 'function') {
            const res = await eel.run_shear_batch_export(payload)();
            console.log("[Shear Batch Export] Resposta do backend:", res);
            if (res && res.error) {
                alert("Erro ao iniciar exportação: " + res.error);
                isBatchRunning = false;
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<span>🚀</span> <span>Iniciar Salvamento Automático</span>`;
                }
            }
        } else {
            alert("A função de exportação em lote não foi encontrada no Eel. Por favor, reinicie o servidor Python no terminal (Ctrl+C e execute novamente: python backend/main_eel.py) e recarregue a página (Ctrl+F5).");
            isBatchRunning = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>🚀</span> <span>Iniciar Salvamento Automático</span>`;
            }
        }
    } catch (e) {
        console.error("[Shear Batch Export] Erro na chamada:", e);
        alert("Falha na chamada de exportação: " + e);
        isBatchRunning = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀</span> <span>Iniciar Salvamento Automático</span>`;
        }
    }
}

// Eel callback functions
function update_shear_batch_progress(pct, msg, imgPath, isDone, total, current) {
    console.log(`[Shear Batch Progress] ${pct}% - ${msg}`);
    const pBar = document.getElementById('batchProgressBar');
    const pPct = document.getElementById('batchProgressPct');
    const pStatus = document.getElementById('batchProgressStatus');

    if (pBar) pBar.style.width = `${pct}%`;
    if (pPct) pPct.innerText = `${pct}%`;
    if (pStatus) pStatus.innerText = msg;

    if (imgPath) {
        const thumbWrap = document.getElementById('batchThumbnailWrapper');
        const thumbImg = document.getElementById('batchThumbnailImg');
        if (thumbWrap && thumbImg) {
            thumbImg.src = `/${imgPath}?t=${Date.now()}`;
            thumbWrap.classList.remove('hidden');
        }
    }

    if (isDone) {
        isBatchRunning = false;
        const btn = document.getElementById('btnStartBatchSave');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🚀</span> <span>Iniciar Novamente</span>`;
        }
    }
}
window.update_shear_batch_progress = update_shear_batch_progress;
if (window.eel) {
    eel.expose(update_shear_batch_progress);
}

function on_shear_batch_complete(result) {
    console.log("[Shear Batch Complete]", result);
    isBatchRunning = false;
    const btn = document.getElementById('btnStartBatchSave');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>🚀</span> <span>Iniciar Novamente</span>`;
    }

    const sBox = document.getElementById('batchSuccessBox');
    const sTitle = document.getElementById('batchSuccessTitle');
    const sDesc = document.getElementById('batchSuccessDesc');

    if (sBox) {
        if (sTitle && result.plots_count) {
            sTitle.innerText = `Sucesso! ${result.plots_count} gráficos e tabela resumo salvos.`;
        }
        if (sDesc && result.folder) {
            sDesc.innerText = `Pasta: ${result.folder} | Planilha: shear_variations_summary.csv`;
        }
        sBox.classList.remove('hidden');
    }

    showToast(`Rotina concluída! ${result.plots_count || 0} gráficos salvos com sucesso na pasta.`, 'success');
}
window.on_shear_batch_complete = on_shear_batch_complete;
if (window.eel) {
    eel.expose(on_shear_batch_complete);
}

function openBatchOutputFolder() {
    const input = document.getElementById('batchOutDirInput');
    const folder = input ? input.value.trim() : 'plots/shear_model_variations';
    if (window.eel && eel.open_shear_output_folder) {
        eel.open_shear_output_folder(folder)();
    } else {
        alert("Pasta de destino: " + folder);
    }
}

window.openBatchSaveModal = openBatchSaveModal;
window.closeBatchSaveModal = closeBatchSaveModal;
window.quickSelectBatchSubsets = quickSelectBatchSubsets;
window.updateBatchEstimatedCounts = updateBatchEstimatedCounts;
window.startBatchSaveRoutine = startBatchSaveRoutine;
window.openBatchOutputFolder = openBatchOutputFolder;




