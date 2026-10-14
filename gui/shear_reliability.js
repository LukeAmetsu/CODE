/**
 * Structural Reliability & Partial Safety Factor Calibration (FORM / Monte Carlo)
 * Frontend Logic & Interactive Dashboard
 */

let relChart = null;
let currentGraphTab = 'sensitivity';
let lastReliabilityResult = null;
let lastMultiCodeResult = null;
let lastLoadRatioResult = null;
let activeUseDeff = false;
let isComputing = false;
let activeCodePreset = 'PROPOSED';

function parseNum(val, defaultVal = 0.0) {
    if (val === undefined || val === null) return defaultVal;
    if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
    const s = String(val).trim().replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? defaultVal : n;
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check if launched inside unified window with active shear model
    if (typeof window.useDeffConstraint === 'boolean') {
        activeUseDeff = window.useDeffConstraint;
    }

    // 2. Try restoring from shear model session or local session
    restoreSavedState();

    // 3. Initialize KaTeX formula display & sync toggles
    syncRelDeffToggleUI();
    renderFormulaDisplay();

    // 4. Initialize Chart.js
    initReliabilityChart();

    // 5. Attach input change triggers
    attachInputListeners();

    // 6. Initial automatic calculation
    setTimeout(() => {
        executeReliabilityCalculation();
    }, 200);
});

function attachInputListeners() {
    const paramInputs = [
        'rel_param_C', 'rel_param_alpha', 'rel_param_beta', 
        'rel_param_gamma', 'rel_param_delta', 'rel_param_mu'
    ];
    paramInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                if (id === 'rel_param_delta') {
                    const dVal = parseFloat(el.value || 0);
                    if (Math.abs(dVal) < 1e-4) {
                        const archChk = document.getElementById('rel_chk_arch_correction');
                        if (archChk) archChk.checked = true;
                    }
                }
                renderFormulaDisplay();
                clearTimeout(window._relCalcDebounce);
                window._relCalcDebounce = setTimeout(() => {
                    triggerReactiveThetaRSync();
                }, 400);
            });
        }
    });

    const secInputs = [
        'sec_fck', 'sec_bw', 'sec_d', 'sec_rho', 'sec_ad', 'sec_ddg',
        'sec_gamma_v', 'sec_k_k', 'sec_gamma_g', 'sec_gamma_q', 'sec_chi'
    ];
    secInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                clearTimeout(window._relCalcDebounce);
                window._relCalcDebounce = setTimeout(() => {
                    executeReliabilityCalculation();
                }, 300);
            });
        }
    });
}

function triggerReactiveThetaRSync() {
    clearTimeout(window._relSyncDebounce);
    window._relSyncDebounce = setTimeout(async () => {
        await extractModelErrorFromDb(true); // silent = true
    }, 250);
}
window.triggerReactiveThetaRSync = triggerReactiveThetaRSync;

function syncRelDeffToggleUI() {
    const badge = document.getElementById('badgeActiveDeff');
    if (badge) {
        badge.innerText = activeUseDeff ? 'd_eff ATIVO (CSCT / EC2 & FIB)' : 'd_eff Padrão (d)';
        badge.className = activeUseDeff
            ? 'text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600 shadow-2xs'
            : 'text-[10px] px-2 py-0.5 rounded font-mono bg-gray-800 text-gray-400 border border-gray-700';
    }
    const chk = document.getElementById('rel_chk_use_deff');
    if (chk) chk.checked = !!activeUseDeff;

    const tabBadge = document.getElementById('tabReliabilityDeffBadge');
    if (tabBadge) {
        tabBadge.innerText = activeUseDeff ? 'd_eff Ativo' : 'd_eff Off';
        tabBadge.className = activeUseDeff
            ? 'text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'text-[10px] px-1.5 py-0.2 rounded font-mono text-gray-400 bg-gray-800 border border-gray-700';
    }
}
window.syncRelDeffToggleUI = syncRelDeffToggleUI;

function toggleRelDeffConstraint(enabled) {
    activeUseDeff = !!enabled;
    if (typeof window.useDeffConstraint === 'boolean') {
        window.useDeffConstraint = activeUseDeff;
        if (typeof window.syncDeffToggleUI === 'function') window.syncDeffToggleUI();
        if (typeof window.updateMath === 'function') window.updateMath();
        if (typeof window.updateDatabaseChart === 'function') window.updateDatabaseChart();
    }
    syncRelDeffToggleUI();
    renderFormulaDisplay();
    triggerReactiveThetaRSync();
}
window.toggleRelDeffConstraint = toggleRelDeffConstraint;

function renderFormulaDisplay() {
    const mathBox = document.getElementById('renderedFormulaMath');
    if (!mathBox) return;

    if (typeof window.useDeffConstraint === 'boolean') {
        activeUseDeff = window.useDeffConstraint;
    }

    const cVal = parseNum(document.getElementById('rel_param_C')?.value, 1.25);
    const aVal = parseNum(document.getElementById('rel_param_alpha')?.value, 0.333);
    const bVal = parseNum(document.getElementById('rel_param_beta')?.value, 0.333);
    const gVal = parseNum(document.getElementById('rel_param_gamma')?.value, 0.333);
    const dVal = parseNum(document.getElementById('rel_param_delta')?.value, -0.75);
    const mVal = parseNum(document.getElementById('rel_param_mu')?.value, 0.15);
    const excludePc = document.getElementById('rel_chk_exclude_pc')?.checked ?? false;

    const deffStr = activeUseDeff ? '{\\color{#06b6d4}\\mathbf{d_{eff}}}' : 'd';
    
    let parts = [];
    parts.push(cVal.toFixed(3));
    if (Math.abs(aVal) > 1e-4) parts.push(`\\left(\\frac{d_{dg}}{${deffStr}}\\right)^{${aVal.toFixed(3)}}`);
    if (Math.abs(bVal) > 1e-4) parts.push(`(100\\rho_w)^{${bVal.toFixed(3)}}`);
    if (Math.abs(gVal) > 1e-4) parts.push(`f_c^{${gVal.toFixed(3)}}`);
    if (Math.abs(dVal) > 1e-4) parts.push(`\\left(\\frac{a}{d}\\right)^{${dVal.toFixed(3)}}`);
    
    let core = parts.join(' \\cdot ');
    let latexStr;
    if (!excludePc && Math.abs(mVal) > 1e-4) {
        latexStr = `V_R = \\left[ ${core} + {\\color{#f59e0b}${mVal.toFixed(2)}\\cdot\\sigma_{cp}} \\right] b_w \\cdot d`;
    } else {
        latexStr = `V_R = ${core} \\cdot b_w \\cdot d`;
    }
    
    if (activeUseDeff) {
        latexStr += ` \\quad {\\color{#06b6d4}\\scriptsize{\\left[d_{eff} = \\min\\left(d, \\sqrt{\\frac{a_{cs}}{4}d}\\right),\\; a_{cs}=\\max(a,d) \\ge d\\right]}}`;
    }
    if (!excludePc && Math.abs(mVal) > 1e-4) {
        latexStr += ` \\quad {\\color{#f59e0b}\\scriptsize{\\left[\\sigma_{cp} \\le 0.2 f_{ck}\\right]}}`;
    }

    syncRelDeffToggleUI();

    if (window.katex) {
        try {
            katex.render(latexStr, mathBox, { throwOnError: false, displayMode: true });
        } catch (e) {
            mathBox.innerText = latexStr;
        }
    } else {
        mathBox.innerText = latexStr;
    }
}
window.renderFormulaDisplay = renderFormulaDisplay;

function toggleRelExcludePc(enabled) {
    if (typeof window.toggleExcludePrestressed === 'function') {
        window.toggleExcludePrestressed(enabled);
    }
    renderFormulaDisplay();
    extractModelErrorFromDb();
}
window.toggleRelExcludePc = toggleRelExcludePc;

function getSectionNominalInputs() {
    return {
        fck: parseNum(document.getElementById('sec_fck')?.value, 30.0),
        bw: parseNum(document.getElementById('sec_bw')?.value, 250.0),
        d: parseNum(document.getElementById('sec_d')?.value, 400.0),
        rho: parseNum(document.getElementById('sec_rho')?.value, 1.20) / 100.0,
        ad: parseNum(document.getElementById('sec_ad')?.value, 3.0),
        ddg: parseNum(document.getElementById('sec_ddg')?.value, 32.0),
        gamma_v: parseNum(document.getElementById('sec_gamma_v')?.value, 1.40),
        k_k: parseNum(document.getElementById('sec_k_k')?.value, 1.00),
        gamma_g: parseNum(document.getElementById('sec_gamma_g')?.value, 1.40),
        gamma_q: parseNum(document.getElementById('sec_gamma_q')?.value, 1.40),
        chi: parseNum(document.getElementById('sec_chi')?.value, 0.30),
    };
}

function getModelParameters() {
    const archCorr = document.getElementById('rel_chk_arch_correction') ? document.getElementById('rel_chk_arch_correction').checked : true;
    const slenderOnly = document.getElementById('rel_chk_slender_only') ? document.getElementById('rel_chk_slender_only').checked : false;
    return {
        C: parseNum(document.getElementById('rel_param_C')?.value, 1.25),
        alpha: parseNum(document.getElementById('rel_param_alpha')?.value, 0.333),
        beta: parseNum(document.getElementById('rel_param_beta')?.value, 0.333),
        gamma: parseNum(document.getElementById('rel_param_gamma')?.value, 0.333),
        delta: parseNum(document.getElementById('rel_param_delta')?.value, -0.75),
        mu: parseNum(document.getElementById('rel_param_mu')?.value, 0.15),
        use_deff: activeUseDeff,
        arch_correction: archCorr,
        slender_only: slenderOnly,
        code_preset: activeCodePreset,
    };
}

function getProbabilisticVariablesConfig() {
    return {
        fc: {
            bias: parseNum(document.getElementById('cov_bias_fc')?.value, 1.15),
            cov: parseNum(document.getElementById('cov_val_fc')?.value, 0.17),
        },
        bw: {
            bias: parseNum(document.getElementById('cov_bias_bw')?.value, 1.00),
            cov: parseNum(document.getElementById('cov_val_bw')?.value, 0.03),
        },
        d: {
            bias: parseNum(document.getElementById('cov_bias_d')?.value, 0.99),
            cov: parseNum(document.getElementById('cov_val_d')?.value, 0.04),
        },
        rho: {
            bias: parseNum(document.getElementById('cov_bias_rho')?.value, 1.00),
            cov: parseNum(document.getElementById('cov_val_rho')?.value, 0.04),
        },
        theta_R: {
            bias: parseNum(document.getElementById('cov_bias_theta_R')?.value, 1.00),
            cov: parseNum(document.getElementById('cov_val_theta_R')?.value, 0.15),
        },
        G: {
            bias: parseNum(document.getElementById('cov_bias_G')?.value, 1.05),
            cov: parseNum(document.getElementById('cov_val_G')?.value, 0.09),
        },
        Q: {
            bias: parseNum(document.getElementById('cov_bias_Q')?.value, 0.70),
            cov: parseNum(document.getElementById('cov_val_Q')?.value, 0.25),
        },
    };
}

function importParamsFromShearModel() {
    try {
        const raw = localStorage.getItem('interactive_shear_session_v2');
        if (!raw) {
            showToast("Nenhuma sessão salva do Shear Model encontrada. Usando valores atuais.", "info");
            return;
        }
        const state = JSON.parse(raw);
        if (state && state.params) {
            const p = state.params;
            if (p.C) document.getElementById('rel_param_C').value = p.C.val.toFixed(3);
            if (p.alpha) document.getElementById('rel_param_alpha').value = (p.alpha.disabled ? 0.0 : p.alpha.val).toFixed(3);
            if (p.beta) document.getElementById('rel_param_beta').value = (p.beta.disabled ? 0.0 : p.beta.val).toFixed(3);
            if (p.gamma) document.getElementById('rel_param_gamma').value = (p.gamma.disabled ? 0.0 : p.gamma.val).toFixed(3);
            if (p.delta) document.getElementById('rel_param_delta').value = (p.delta.disabled ? 0.0 : p.delta.val).toFixed(3);
            if (p.mu) document.getElementById('rel_param_mu').value = (p.mu.disabled ? 0.0 : p.mu.val).toFixed(3);

            if (typeof state.useDeffConstraint === 'boolean') {
                activeUseDeff = state.useDeffConstraint;
                const badge = document.getElementById('badgeActiveDeff');
                if (badge) {
                    badge.innerText = activeUseDeff ? 'd_eff ATIVO (CSCT/EC2)' : 'd_eff Padrão';
                    badge.className = activeUseDeff ? 'text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700' : 'text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700';
                }
            }

            if (typeof state.excludePrestressed === 'boolean') {
                const pcChk = document.getElementById('rel_chk_exclude_pc');
                if (pcChk) pcChk.checked = state.excludePrestressed;
                const thetaBadge = document.getElementById('thetaRStatusBadge');
                if (thetaBadge) {
                    thetaBadge.innerText = state.excludePrestressed ? '1.649 ensaios (s/ PC)' : '1.804 ensaios (c/ PC)';
                }
            }

            renderFormulaDisplay();
            showToast("Parâmetros do Shear Model importados com sucesso!", "success");
            executeReliabilityCalculation();
        }
    } catch (e) {
        console.error("Erro ao importar parâmetros:", e);
        showToast("Erro ao importar parâmetros: " + e, "error");
    }
}

function restoreSavedState() {
    const raw = localStorage.getItem('shear_reliability_session');
    if (!raw) {
        // Fallback: try importing directly from shear model
        importParamsFromShearModel();
        return;
    }
    try {
        const state = JSON.parse(raw);
        if (state.section) {
            if (state.section.fck) document.getElementById('sec_fck').value = state.section.fck;
            if (state.section.bw) document.getElementById('sec_bw').value = state.section.bw;
            if (state.section.d) document.getElementById('sec_d').value = state.section.d;
            if (state.section.rho) document.getElementById('sec_rho').value = (state.section.rho * 100).toFixed(2);
            if (state.section.ad) document.getElementById('sec_ad').value = state.section.ad;
            if (state.section.gamma_v) document.getElementById('sec_gamma_v').value = state.section.gamma_v;
            if (state.section.chi) document.getElementById('sec_chi').value = state.section.chi;
        }
        if (state.params) {
            if (state.params.C) document.getElementById('rel_param_C').value = state.params.C;
            if (state.params.alpha) document.getElementById('rel_param_alpha').value = state.params.alpha;
            if (state.params.beta) document.getElementById('rel_param_beta').value = state.params.beta;
            if (state.params.gamma) document.getElementById('rel_param_gamma').value = state.params.gamma;
            if (state.params.delta) document.getElementById('rel_param_delta').value = state.params.delta;
            if (state.params.mu) document.getElementById('rel_param_mu').value = state.params.mu;
        }
    } catch (e) {}
}

function saveState() {
    const state = {
        section: getSectionNominalInputs(),
        params: getModelParameters(),
        rv: getProbabilisticVariablesConfig(),
    };
    try {
        localStorage.setItem('shear_reliability_session', JSON.stringify(state));
    } catch (e) {}
}

function loadDefaultJCSSVars() {
    document.getElementById('cov_bias_fc').value = '1.15';
    document.getElementById('cov_val_fc').value = '0.17';
    document.getElementById('cov_bias_bw').value = '1.00';
    document.getElementById('cov_val_bw').value = '0.03';
    document.getElementById('cov_bias_d').value = '0.99';
    document.getElementById('cov_val_d').value = '0.04';
    document.getElementById('cov_bias_rho').value = '1.00';
    document.getElementById('cov_val_rho').value = '0.04';
    document.getElementById('cov_bias_theta_R').value = '1.00';
    document.getElementById('cov_val_theta_R').value = '0.15';
    document.getElementById('cov_bias_G').value = '1.05';
    document.getElementById('cov_val_G').value = '0.09';
    document.getElementById('cov_bias_Q').value = '0.70';
    document.getElementById('cov_val_Q').value = '0.25';
    showToast("Variáveis restauradas para os padrões internacionais do JCSS / NBR 6118.", "info");
    executeReliabilityCalculation();
}

async function extractModelErrorFromDb(silent = false) {
    const dVal = parseFloat(document.getElementById('rel_param_delta')?.value || 0);
    const archChkEl = document.getElementById('rel_chk_arch_correction');
    if (Math.abs(dVal) < 1e-4 && archChkEl && !archChkEl.checked) {
        archChkEl.checked = true;
    }
    const params = getModelParameters();
    const excludePc = document.getElementById('rel_chk_exclude_pc') ? document.getElementById('rel_chk_exclude_pc').checked : true;
    const archCorr = archChkEl ? archChkEl.checked : (Math.abs(dVal) < 1e-4 || true);
    const slenderOnly = document.getElementById('rel_chk_slender_only') ? document.getElementById('rel_chk_slender_only').checked : false;

    try {
        if (!window.eel || !eel.get_shear_model_error_stats) {
            if (!silent) showToast("Backend Python não conectado.", "error");
            return;
        }
        if (!silent) showToast("Calculando estatística θ_R da base experimental...", "info");
        const res = await eel.get_shear_model_error_stats({
            model_params: params,
            subset_key: "ALL DATA",
            exclude_pc: excludePc,
            arch_correction: archCorr,
            slender_only: slenderOnly,
        })();

        if (res && res.success) {
            const meanEl = document.getElementById('cov_bias_theta_R');
            const covEl = document.getElementById('cov_val_theta_R');
            if (meanEl) meanEl.value = res.mean.toFixed(3);
            if (covEl) covEl.value = res.cov.toFixed(3);

            const badge = document.getElementById('thetaRStatusBadge');
            if (badge) {
                const archTag = res.arch_correction ? ', c/ Arco' : '';
                const slenderTag = res.slender_only ? ', Esbeltas' : '';
                badge.innerText = `${res.samples} ensaios (${excludePc ? 's/ PC' : 'c/ PC'}${archTag}${slenderTag})`;
            }

            if (!silent) {
                showToast(`θ_R extraído de ${res.samples} ensaios: Média = ${res.mean.toFixed(3)} | COV = ${(res.cov * 100).toFixed(1)}%`, "success");
            }
            executeReliabilityCalculation();
        } else {
            if (!silent) showToast("Erro ao extrair dados de erro de modelo.", "error");
        }
    } catch (e) {
        console.error(e);
        if (!silent) showToast("Falha na chamada de erro de modelo: " + e, "error");
    }
}

async function executeReliabilityCalculation() {
    if (isComputing) return;
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    saveState();
    isComputing = true;
    setLoadingState(true);

    try {
        if (!window.eel || !eel.run_shear_reliability_analysis) {
            showToast("Backend Python não disponível.", "error");
            isComputing = false;
            setLoadingState(false);
            return;
        }

        const payload = {
            section: section,
            model_params: params,
            rv_config: rvConfig,
            target_beta: 3.80,
            code_design: 'PROPOSED',
            run_monte_carlo: false,
        };

        const res = await eel.run_shear_reliability_analysis(payload)();
        isComputing = false;
        setLoadingState(false);

        if (res && res.success && res.form) {
            lastReliabilityResult = res.form;
            updateDashboardKPIs(res.form);
            updateDesignPointMPP(res.form);
            updateLatexCode(section, params, rvConfig, res.form);

            if (currentGraphTab === 'sensitivity') {
                renderSensitivityChart(res.form.sensitivity_pct);
            } else if (currentGraphTab === 'load_ratio') {
                if (lastLoadRatioResult) renderLoadRatioChart(lastLoadRatioResult);
                else loadLoadRatioCurve();
            } else if (currentGraphTab === 'multicodes') {
                if (lastMultiCodeResult) renderMultiCodeChart(lastMultiCodeResult);
                else executeMultiCodeComparison();
            }
        } else {
            showToast("Erro no cálculo FORM: " + (res?.error || "Desconhecido"), "error");
        }
    } catch (e) {
        isComputing = false;
        setLoadingState(false);
        console.error(e);
        showToast("Falha na análise FORM: " + e, "error");
    }
}

function updateDashboardKPIs(form) {
    const betaEl = document.getElementById('kpiBetaValue');
    const betaStatusEl = document.getElementById('kpiBetaStatus');
    const pfEl = document.getElementById('kpiPfValue');
    const vrdEl = document.getElementById('kpiVRdValue');
    const iterEl = document.getElementById('kpiFormIterations');

    const beta = form.beta;
    const pf = form.pf;
    const vrd = form.design_values ? form.design_values.V_Rd : 0;

    if (betaEl) betaEl.innerText = beta.toFixed(3);
    if (pfEl) {
        pfEl.innerText = pf < 1e-6 ? pf.toExponential(2) : (pf * 100).toFixed(4) + '%';
        pfEl.title = `Pf = ${pf.toExponential(4)}`;
    }
    if (vrdEl) vrdEl.innerText = `${vrd.toFixed(1)} kN`;
    if (iterEl) iterEl.innerText = `Iterações FORM: ${form.iterations} (HL-RF)`;

    if (betaStatusEl) {
        if (beta >= 3.80) {
            betaStatusEl.innerText = "✓ Seguro (≥ 3.80)";
            betaStatusEl.className = "font-bold text-emerald-400";
        } else if (beta >= 3.00) {
            betaStatusEl.innerText = "⚠️ Abaixo Alvo (< 3.80)";
            betaStatusEl.className = "font-bold text-amber-400";
        } else {
            betaStatusEl.innerText = "✕ Inseguro (< 3.00)";
            betaStatusEl.className = "font-bold text-rose-400";
        }
    }
}

function updateDesignPointMPP(form) {
    const container = document.getElementById('designPointContainer');
    if (!container || !form.design_point_X) return;

    const dp = form.design_point_X;
    const items = [
        { label: "fc*", val: dp.fc ? dp.fc.toFixed(1) + " MPa" : "-" },
        { label: "bw*", val: dp.bw ? dp.bw.toFixed(0) + " mm" : "-" },
        { label: "d*", val: dp.d ? dp.d.toFixed(0) + " mm" : "-" },
        { label: "ρw*", val: dp.rho ? (dp.rho * 100).toFixed(2) + "%" : "-" },
        { label: "θ_R*", val: dp.theta_R ? dp.theta_R.toFixed(3) : "-" },
        { label: "G*", val: dp.G ? dp.G.toFixed(1) + " kN" : "-" },
        { label: "Q*", val: dp.Q ? dp.Q.toFixed(1) + " kN" : "-" },
    ];

    container.innerHTML = items.map(it => `
        <div class="p-2 rounded-xl bg-gray-900/60 border border-gray-800 flex flex-col items-center">
            <span class="text-gray-400 text-[10px] font-semibold">${it.label}</span>
            <span class="text-cyan-300 font-mono font-bold mt-0.5">${it.val}</span>
        </div>
    `).join('');
}

async function executeMonteCarloVerification() {
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    setLoadingState(true);
    showToast("Executando Simulação de Monte Carlo com 20.000 amostras...", "info");

    try {
        const payload = {
            section: section,
            model_params: params,
            rv_config: rvConfig,
            run_monte_carlo: true,
            mc_samples: 20000,
        };
        const res = await eel.run_shear_reliability_analysis(payload)();
        setLoadingState(false);

        if (res && res.mc) {
            const mc = res.mc;
            const formBeta = res.form ? res.form.beta : 0;
            const msg = `Monte Carlo Concluído: β_MC = ${mc.beta_mc.toFixed(3)} | Pf = ${mc.pf_mc.toExponential(2)} (Falhas: ${mc.failures} em ${mc.n_samples}). FORM = ${formBeta.toFixed(3)}`;
            showToast(msg, "success");
            alert(msg + `\n\nIntervalo de Confiança 95%: [${mc.ci_95[0].toExponential(2)}, ${mc.ci_95[1].toExponential(2)}]\nCoeficiente de Variação de Pf: ${(mc.cov_pf * 100).toFixed(1)}%`);
        }
    } catch (e) {
        setLoadingState(false);
        showToast("Erro no Monte Carlo: " + e, "error");
    }
}

async function executeOptimalFactorCalibration() {
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    setLoadingState(true);
    showToast("Otimizando γ_v para atingir β = 3.80...", "info");

    try {
        const payload = {
            section: section,
            model_params: params,
            rv_config: rvConfig,
            target_beta: 3.80,
        };
        const res = await eel.calibrate_shear_partial_factor(payload)();
        setLoadingState(false);

        if (res && res.success) {
            const valStr = res.optimal_gamma_v.toFixed(3);
            const gammaEl = document.getElementById('kpiCalibratedGamma');
            if (gammaEl) gammaEl.innerText = valStr;

            // Update gamma input with exact calibrated value
            const secGammaInput = document.getElementById('sec_gamma_v');
            if (secGammaInput) secGammaInput.value = valStr;

            if (res.hit_upper_bound || res.avg_beta < 3.70) {
                const covVal = rvConfig.theta_R ? (rvConfig.theta_R.cov * 100).toFixed(1) : "35.0";
                const warnMsg = `⚠️ Limite superior atingido (γ_v = ${valStr}) com β = ${res.avg_beta.toFixed(3)} (< 3.80). A dispersão experimental elevada (COV = ${covVal}%) impede atingir o alvo de segurança. Reajuste os expoentes da equação base ou use o botão 'Calibrar C (γ_v = 1.40 fixo)'.`;
                showToast(warnMsg, "warning");
                alert(warnMsg);
            } else {
                const msg = `✓ Calibração Concluída! γ_v calibrado = ${valStr} cravando β = ${res.avg_beta.toFixed(3)} (≥ 3.800).`;
                showToast(msg, "success");
            }

            // Re-run FORM to reflect exact calibrated factor on card ÍNDICE B
            await executeReliabilityCalculation();
        } else {
            showToast("Erro na calibração: " + (res?.error || "Desconhecido"), "error");
        }
    } catch (e) {
        setLoadingState(false);
        showToast("Erro na calibração de γ_v: " + e, "error");
    }
}

async function executeOptimalConstantCalibration() {
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    setLoadingState(true);
    showToast("Calibrando Constante C para γ_v = 1.40 fixo e β = 3.80...", "info");

    try {
        const payload = {
            section: section,
            model_params: params,
            rv_config: rvConfig,
            target_beta: 3.80,
            gamma_v: 1.40,
        };
        const fn = (window.eel && eel.calibrate_shear_reliability_constant_c) ? eel.calibrate_shear_reliability_constant_c : eel.calibrate_shear_constant_c;
        const res = await fn(payload)();
        setLoadingState(false);

        if (res && res.success) {
            // Update input C
            const cInput = document.getElementById('rel_param_C');
            if (cInput) cInput.value = res.optimal_C.toFixed(4);

            // Update gamma_v to 1.40
            const gammaInput = document.getElementById('sec_gamma_v');
            if (gammaInput) gammaInput.value = '1.40';

            // Update theta_R mean
            const thetaMeanInput = document.getElementById('cov_bias_theta_R');
            if (thetaMeanInput) thetaMeanInput.value = res.resulting_mean_theta_R.toFixed(3);

            renderFormulaDisplay();

            if (res.reached_target) {
                const msg = `✓ Constante C Calibrada! C_k = ${res.optimal_C.toFixed(4)} (p/ γ_v = 1.40 fixo), gerando μ_θR = ${res.resulting_mean_theta_R.toFixed(3)} e β = ${res.avg_beta.toFixed(3)}.`;
                showToast(msg, "success");
            } else {
                const warnMsg = `⚠️ Constante C calculada em ${res.optimal_C.toFixed(4)} com β = ${res.avg_beta.toFixed(3)}.`;
                showToast(warnMsg, "warning");
            }

            executeReliabilityCalculation();
        } else {
            showToast("Erro na calibração de C: " + (res?.error || "Falha no otimizador"), "error");
        }
    } catch (e) {
        setLoadingState(false);
        showToast("Erro na calibração de C: " + e, "error");
    }
}
window.executeOptimalConstantCalibration = executeOptimalConstantCalibration;

function applyReliabilityPreset(presetKey) {
    activeCodePreset = presetKey;
    const archChk = document.getElementById('rel_chk_arch_correction');
    const pcChk = document.getElementById('rel_chk_exclude_pc');

    if (presetKey === 'PROPOSED') {
        const cInp = document.getElementById('rel_param_C'); if (cInp) cInp.value = '1.250';
        const aInp = document.getElementById('rel_param_alpha'); if (aInp) aInp.value = '0.333';
        const bInp = document.getElementById('rel_param_beta'); if (bInp) bInp.value = '0.333';
        const gInp = document.getElementById('rel_param_gamma'); if (gInp) gInp.value = '0.333';
        const dInp = document.getElementById('rel_param_delta'); if (dInp) dInp.value = '-0.750';
        const mInp = document.getElementById('rel_param_mu'); if (mInp) mInp.value = '0.150';
        const kkInp = document.getElementById('sec_k_k'); if (kkInp) kkInp.value = '1.00';
        const gvInp = document.getElementById('sec_gamma_v'); if (gvInp) gvInp.value = '1.40';
        const chkDeff = document.getElementById('rel_chk_use_deff'); if (chkDeff) chkDeff.checked = false;
        activeUseDeff = false;
        syncRelDeffToggleUI();
        showToast("Preset carregado: Nova Proposta (Tese) - Modelo contínuo (a/d)^δ", "info");
    } else if (presetKey === 'NBR6118') {
        const cInp = document.getElementById('rel_param_C'); if (cInp) cInp.value = '0.120';
        const aInp = document.getElementById('rel_param_alpha'); if (aInp) aInp.value = '0.000';
        const bInp = document.getElementById('rel_param_beta'); if (bInp) bInp.value = '0.333';
        const gInp = document.getElementById('rel_param_gamma'); if (gInp) gInp.value = '0.667';
        const dInp = document.getElementById('rel_param_delta'); if (dInp) dInp.value = '0.000';
        const mInp = document.getElementById('rel_param_mu'); if (mInp) mInp.value = '0.150';
        const kkInp = document.getElementById('sec_k_k'); if (kkInp) kkInp.value = '0.70';
        const gvInp = document.getElementById('sec_gamma_v'); if (gvInp) gvInp.value = '1.40';
        const chkDeff = document.getElementById('rel_chk_use_deff'); if (chkDeff) chkDeff.checked = false;
        activeUseDeff = false;
        syncRelDeffToggleUI();
        if (archChk) archChk.checked = true;
        if (pcChk) pcChk.checked = true;
        showToast("Preset carregado: NBR 6118:2023 (C = 0.120, β = 0.333, k_k = 0.70, γ_v = 1.40, correção de arco ativa)", "info");
    } else if (presetKey === 'EC2_2023') {
        const cInp = document.getElementById('rel_param_C'); if (cInp) cInp.value = '0.600';
        const aInp = document.getElementById('rel_param_alpha'); if (aInp) aInp.value = '0.333';
        const bInp = document.getElementById('rel_param_beta'); if (bInp) bInp.value = '0.333';
        const gInp = document.getElementById('rel_param_gamma'); if (gInp) gInp.value = '0.333';
        const dInp = document.getElementById('rel_param_delta'); if (dInp) dInp.value = '0.000';
        const mInp = document.getElementById('rel_param_mu'); if (mInp) mInp.value = '0.150';
        const kkInp = document.getElementById('sec_k_k'); if (kkInp) kkInp.value = '1.00';
        const gvInp = document.getElementById('sec_gamma_v'); if (gvInp) gvInp.value = '1.40';
        const chkDeff = document.getElementById('rel_chk_use_deff'); if (chkDeff) chkDeff.checked = true;
        activeUseDeff = true;
        syncRelDeffToggleUI();
        if (archChk) archChk.checked = true;
        if (pcChk) pcChk.checked = true;
        showToast("Preset carregado: Eurocode 2 (2023) / CSCT (d_eff ativo, k_k = 1.00, γ_v = 1.40, correção de arco ativa)", "info");
    } else if (presetKey === 'ACI318') {
        const cInp = document.getElementById('rel_param_C'); if (cInp) cInp.value = '0.142';
        const aInp = document.getElementById('rel_param_alpha'); if (aInp) aInp.value = '0.000';
        const bInp = document.getElementById('rel_param_beta'); if (bInp) bInp.value = '0.333';
        const gInp = document.getElementById('rel_param_gamma'); if (gInp) gInp.value = '0.500';
        const dInp = document.getElementById('rel_param_delta'); if (dInp) dInp.value = '0.000';
        const mInp = document.getElementById('rel_param_mu'); if (mInp) mInp.value = '0.150';
        const kkInp = document.getElementById('sec_k_k'); if (kkInp) kkInp.value = '1.00';
        const gvInp = document.getElementById('sec_gamma_v'); if (gvInp) gvInp.value = '1.333';
        const chkDeff = document.getElementById('rel_chk_use_deff'); if (chkDeff) chkDeff.checked = false;
        activeUseDeff = false;
        syncRelDeffToggleUI();
        if (archChk) archChk.checked = true;
        if (pcChk) pcChk.checked = true;
        showToast("Preset carregado: ACI 318-19 (C = 0.142, β = 0.333, γ = 0.500, μ = 0.150, k_k = 1.00, γ_v = 1.333, Excluir PC)", "info");
    }
    renderFormulaDisplay();
    triggerReactiveThetaRSync();
}
window.applyReliabilityPreset = applyReliabilityPreset;

async function loadLoadRatioCurve() {
    if (isComputing) return;
    updateTabButtonsUI('load_ratio');
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    isComputing = true;
    setLoadingState(true);
    try {
        const res = await eel.compare_shear_reliability_codes({
            section: section,
            model_params: params,
            rv_config: rvConfig,
            chi_values: [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]
        })();
        isComputing = false;
        setLoadingState(false);

        if (res && res.success && res.codes) {
            lastLoadRatioResult = res;
            renderLoadRatioChart(res);
        }
    } catch (e) {
        isComputing = false;
        setLoadingState(false);
        console.error(e);
    }
}

async function executeMultiCodeComparison() {
    if (isComputing) return;
    updateTabButtonsUI('multicodes');
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    isComputing = true;
    setLoadingState(true);
    showToast("Calculando curvas de confiabilidade para todos os códigos normativos...", "info");

    try {
        const res = await eel.compare_shear_reliability_codes({
            section: section,
            model_params: params,
            rv_config: rvConfig,
            chi_values: [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]
        })();
        isComputing = false;
        setLoadingState(false);

        if (res && res.success && res.codes) {
            lastMultiCodeResult = res;
            renderMultiCodeChart(res);
            showToast("Comparativo normativo concluído!", "success");
        }
    } catch (e) {
        isComputing = false;
        setLoadingState(false);
        console.error(e);
        showToast("Erro na comparação: " + e, "error");
    }
}

async function updateLatexCode(section, params, rvConfig, formResult = null) {
    try {
        const sec = section || getSectionNominalInputs();
        const par = params || getModelParameters();
        const rvc = rvConfig || getProbabilisticVariablesConfig();
        const fRes = formResult || lastReliabilityResult;

        if (!window.eel || typeof eel.generate_shear_reliability_latex !== 'function') {
            return;
        }

        const res = await eel.generate_shear_reliability_latex({
            section: sec,
            model_params: par,
            rv_config: rvc,
            form_result: fRes
        })();

        if (res && res.success && res.latex) {
            const txt = document.getElementById('latexOutputTextarea');
            if (txt) txt.value = res.latex;
            const block = document.getElementById('latexOutputBlock');
            if (block) block.textContent = res.latex;
        } else if (res && res.error) {
            console.error("[LaTeX Export Error]:", res.error);
        }
    } catch (e) {
        console.error("[updateLatexCode]:", e);
    }
}
window.updateLatexCode = updateLatexCode;

function copyLatexCodeToClipboard() {
    const txt = document.getElementById('latexOutputTextarea');
    const block = document.getElementById('latexOutputBlock');
    const code = (txt && txt.value) ? txt.value : (block ? block.textContent : '');

    if (!code || code.trim().startsWith('% O código LaTeX será gerado')) {
        showToast("Nenhum código para copiar. Execute a análise primeiro.", "info");
        return;
    }

    navigator.clipboard.writeText(code).then(() => {
        const lbl = document.getElementById('lblCopyLatex');
        const ico = document.getElementById('icoCopyLatex');
        if (lbl) lbl.innerText = "Copiado com Sucesso!";
        if (ico) ico.innerText = "✓";
        setTimeout(() => {
            if (lbl) lbl.innerText = "Copiar Código LaTeX";
            if (ico) ico.innerText = "📋";
        }, 2200);
        showToast("Código LaTeX da tabela copiado para a área de transferência!", "success");
    }).catch(() => {
        showToast("Selecione o texto manualmente para copiar.", "info");
    });
}
window.copyLatexCodeToClipboard = copyLatexCodeToClipboard;

function setLoadingState(isLoading) {
    const overlay = document.getElementById('chartLoadingOverlay');
    const btn = document.getElementById('btnRunFORM');
    if (overlay) {
        if (isLoading) overlay.classList.remove('hidden');
        else overlay.classList.add('hidden');
    }
    if (btn) {
        btn.disabled = isLoading;
        btn.style.opacity = isLoading ? '0.7' : '1.0';
    }
}

// -------------------------------------------------------------
// CHART.JS VISUALIZATION MANAGEMENT
// -------------------------------------------------------------

function initReliabilityChart() {
    const ctx = document.getElementById('reliabilityMainChart')?.getContext('2d');
    if (!ctx) return;

    relChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 400 },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#cbd5e1', font: { family: 'Inter', size: 11 } }
                }
            }
        }
    });
}

function updateTabButtonsUI(tabKey) {
    currentGraphTab = tabKey;
    const btnSens = document.getElementById('tabBtnSensitivity');
    const btnRatio = document.getElementById('tabBtnLoadRatio');
    const btnMulti = document.getElementById('tabBtnMultiCodes');
    const subtitle = document.getElementById('graphActiveSubtitle');

    const activeClass = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-cyan-600 text-white shadow-xs cursor-pointer";
    const inactiveClass = "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all bg-gray-800 text-gray-300 hover:text-white cursor-pointer";

    if (btnSens) btnSens.className = tabKey === 'sensitivity' ? activeClass : inactiveClass;
    if (btnRatio) btnRatio.className = tabKey === 'load_ratio' ? activeClass : inactiveClass;
    if (btnMulti) btnMulti.className = tabKey === 'multicodes' ? activeClass : inactiveClass;

    if (tabKey === 'sensitivity') {
        if (subtitle) subtitle.innerText = "Importância percentual das variáveis na probabilidade de falha (α_i²)";
    } else if (tabKey === 'load_ratio') {
        if (subtitle) subtitle.innerText = "Variação do Índice β em função da razão de carga acidental χ = Q / (G + Q)";
    } else if (tabKey === 'multicodes') {
        if (subtitle) subtitle.innerText = "Comparativo do Índice de Confiabilidade β entre Códigos Normativos";
    }
}

function switchGraphTab(tabKey) {
    updateTabButtonsUI(tabKey);

    if (tabKey === 'sensitivity') {
        if (lastReliabilityResult) {
            renderSensitivityChart(lastReliabilityResult.sensitivity_pct);
        } else {
            executeReliabilityCalculation();
        }
    } else if (tabKey === 'load_ratio') {
        if (lastLoadRatioResult) {
            renderLoadRatioChart(lastLoadRatioResult);
        } else {
            loadLoadRatioCurve();
        }
    } else if (tabKey === 'multicodes') {
        if (lastMultiCodeResult) {
            renderMultiCodeChart(lastMultiCodeResult);
        } else {
            executeMultiCodeComparison();
        }
    }
}

function renderSensitivityChart(sensitivityMap) {
    if (!relChart || !sensitivityMap) return;

    const labels = [
        "Concreto (fc)", "Geometria (bw, d)", "Taxa Aço (ρw)",
        "Erro Modelo (θ_R)", "Carga Permanente (G)", "Carga Acidental (Q)", "Outros"
    ];

    const fcVal = sensitivityMap.fc || 0;
    const geomVal = (sensitivityMap.bw || 0) + (sensitivityMap.d || 0);
    const rhoVal = sensitivityMap.rho || 0;
    const thetaRVal = sensitivityMap.theta_R || 0;
    const gVal = sensitivityMap.G || 0;
    const qVal = sensitivityMap.Q || 0;
    const othersVal = (sensitivityMap.ad || 0) + (sensitivityMap.theta_S || 0);

    const dataVals = [fcVal, geomVal, rhoVal, thetaRVal, gVal, qVal, othersVal];

    relChart.destroy();
    const ctx = document.getElementById('reliabilityMainChart')?.getContext('2d');
    relChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataVals.map(v => parseFloat(v.toFixed(1))),
                backgroundColor: [
                    '#06b6d4', // Cyan (fc)
                    '#3b82f6', // Blue (geom)
                    '#10b981', // Emerald (rho)
                    '#a855f7', // Purple (theta_R)
                    '#64748b', // Slate (G)
                    '#f59e0b', // Amber (Q)
                    '#475569'  // Gray (others)
                ],
                borderWidth: 2,
                borderColor: '#0f172a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#cbd5e1', font: { family: 'Inter', size: 11 } }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return ` ${context.label}: ${context.parsed}% de contribuição na falha`;
                        }
                    }
                }
            }
        }
    });
}

function renderLoadRatioChart(res) {
    if (!relChart || !res || !res.codes || !res.codes.PROPOSED) return;

    const prop = res.codes.PROPOSED;
    const labels = prop.points.map(p => `χ = ${p.chi.toFixed(2)}`);
    const betaVals = prop.points.map(p => p.beta);

    relChart.destroy();
    const ctx = document.getElementById('reliabilityMainChart')?.getContext('2d');
    relChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Nova Formulação (Tese)',
                    data: betaVals,
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 5,
                    pointBackgroundColor: '#06b6d4'
                },
                {
                    label: 'Alvo β = 3.80 (NBR 6118 / JCSS)',
                    data: labels.map(() => 3.80),
                    borderColor: '#ef4444',
                    borderWidth: 2,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Razão de Cargas χ = Q / (G + Q)', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#cbd5e1' }
                },
                y: {
                    title: { display: true, text: 'Índice de Confiabilidade β', color: '#94a3b8' },
                    min: 2.0,
                    max: 6.0,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#cbd5e1' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { color: '#cbd5e1' } }
            }
        }
    });
}

function renderMultiCodeChart(res) {
    if (!relChart || !res || !res.codes) return;

    const codes = res.codes;
    const chiVals = res.chi_values;
    const labels = chiVals.map(c => `χ = ${c.toFixed(2)}`);

    const datasets = Object.keys(codes).map(k => {
        const cd = codes[k];
        return {
            label: cd.label,
            data: cd.points.map(p => p.beta),
            borderColor: cd.color,
            backgroundColor: 'transparent',
            borderWidth: k === 'PROPOSED' ? 3.5 : 2,
            tension: 0.3,
            pointRadius: 4,
            pointBackgroundColor: cd.color
        };
    });

    // Add target line
    datasets.push({
        label: 'Alvo β = 3.80 (NBR / fib)',
        data: labels.map(() => 3.80),
        borderColor: '#ef4444',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        fill: false
    });

    relChart.destroy();
    const ctx = document.getElementById('reliabilityMainChart')?.getContext('2d');
    relChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: 'Razão de Cargas χ = Q / (G + Q)', color: '#94a3b8' },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#cbd5e1' }
                },
                y: {
                    title: { display: true, text: 'Índice de Confiabilidade β', color: '#94a3b8' },
                    min: 2.0,
                    max: 6.0,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#cbd5e1' }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { color: '#cbd5e1' } }
            }
        }
    });
}

function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }
    while (container.children.length >= 3) {
        container.removeChild(container.firstChild);
    }
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-emerald-600 text-white shadow-emerald-900/40' : (type === 'error' ? 'bg-red-600 text-white shadow-red-900/40' : 'bg-gray-800 text-gray-100 border border-gray-700 shadow-gray-900/40');
    toast.className = `${bgClass} px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : (type === 'error' ? '⚠' : 'ℹ')}</span> <span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));
    setTimeout(() => {
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}
