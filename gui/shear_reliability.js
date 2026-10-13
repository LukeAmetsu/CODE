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

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize KaTeX formula display
    renderFormulaDisplay();

    // 2. Try restoring from shear model session or local session
    restoreSavedState();

    // 3. Initialize Chart.js
    initReliabilityChart();

    // 4. Attach input change triggers
    attachInputListeners();

    // 5. Initial automatic calculation
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
        if (el) el.addEventListener('input', () => renderFormulaDisplay());
    });
}

function renderFormulaDisplay() {
    const mathBox = document.getElementById('renderedFormulaMath');
    if (!mathBox) return;

    const cVal = parseFloat(document.getElementById('rel_param_C')?.value || 1.25);
    const aVal = parseFloat(document.getElementById('rel_param_alpha')?.value || 0.333);
    const bVal = parseFloat(document.getElementById('rel_param_beta')?.value || 0.333);
    const gVal = parseFloat(document.getElementById('rel_param_gamma')?.value || 0.333);
    const dVal = parseFloat(document.getElementById('rel_param_delta')?.value || -0.75);
    const mVal = parseFloat(document.getElementById('rel_param_mu')?.value || 0.15);

    const deffStr = activeUseDeff ? 'd_{\\text{eff}}' : 'd';
    const latexStr = `V_R = \\left[ ${cVal.toFixed(2)} \\cdot \\left(\\frac{d_{dg}}{${deffStr}}\\right)^{${aVal.toFixed(2)}} \\cdot (100\\rho_w)^{${bVal.toFixed(2)}} \\cdot f_c^{${gVal.toFixed(2)}} \\cdot \\left(\\frac{a}{d}\\right)^{${dVal.toFixed(2)}} + ${mVal.toFixed(2)}\\sigma_{cp} \\right] b_w d`;

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

function getSectionNominalInputs() {
    return {
        fck: parseFloat(document.getElementById('sec_fck')?.value || 30.0),
        bw: parseFloat(document.getElementById('sec_bw')?.value || 250.0),
        d: parseFloat(document.getElementById('sec_d')?.value || 400.0),
        rho: parseFloat(document.getElementById('sec_rho')?.value || 1.20) / 100.0,
        ad: parseFloat(document.getElementById('sec_ad')?.value || 3.0),
        ddg: parseFloat(document.getElementById('sec_ddg')?.value || 32.0),
        gamma_v: parseFloat(document.getElementById('sec_gamma_v')?.value || 1.40),
        gamma_g: parseFloat(document.getElementById('sec_gamma_g')?.value || 1.40),
        gamma_q: parseFloat(document.getElementById('sec_gamma_q')?.value || 1.40),
        chi: parseFloat(document.getElementById('sec_chi')?.value || 0.30),
    };
}

function getModelParameters() {
    return {
        C: parseFloat(document.getElementById('rel_param_C')?.value || 1.25),
        alpha: parseFloat(document.getElementById('rel_param_alpha')?.value || 0.333),
        beta: parseFloat(document.getElementById('rel_param_beta')?.value || 0.333),
        gamma: parseFloat(document.getElementById('rel_param_gamma')?.value || 0.333),
        delta: parseFloat(document.getElementById('rel_param_delta')?.value || -0.75),
        mu: parseFloat(document.getElementById('rel_param_mu')?.value || 0.15),
        use_deff: activeUseDeff,
    };
}

function getProbabilisticVariablesConfig() {
    return {
        fc: {
            bias: parseFloat(document.getElementById('cov_bias_fc')?.value || 1.15),
            cov: parseFloat(document.getElementById('cov_val_fc')?.value || 0.17),
        },
        bw: {
            bias: parseFloat(document.getElementById('cov_bias_bw')?.value || 1.00),
            cov: parseFloat(document.getElementById('cov_val_bw')?.value || 0.03),
        },
        d: {
            bias: parseFloat(document.getElementById('cov_bias_d')?.value || 0.99),
            cov: parseFloat(document.getElementById('cov_val_d')?.value || 0.04),
        },
        rho: {
            bias: parseFloat(document.getElementById('cov_bias_rho')?.value || 1.00),
            cov: parseFloat(document.getElementById('cov_val_rho')?.value || 0.04),
        },
        theta_R: {
            bias: parseFloat(document.getElementById('cov_bias_theta_R')?.value || 1.00),
            cov: parseFloat(document.getElementById('cov_val_theta_R')?.value || 0.15),
        },
        G: {
            bias: parseFloat(document.getElementById('cov_bias_G')?.value || 1.05),
            cov: parseFloat(document.getElementById('cov_val_G')?.value || 0.09),
        },
        Q: {
            bias: parseFloat(document.getElementById('cov_bias_Q')?.value || 0.70),
            cov: parseFloat(document.getElementById('cov_val_Q')?.value || 0.25),
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

async function extractModelErrorFromDb() {
    const params = getModelParameters();
    try {
        if (!window.eel || !eel.get_shear_model_error_stats) {
            showToast("Backend Python não conectado.", "error");
            return;
        }
        showToast("Calculando estatística θ_R sobre 1804+ ensaios...", "info");
        const res = await eel.get_shear_model_error_stats({
            model_params: params,
            subset_key: "ALL DATA",
            exclude_pc: false
        })();

        if (res && res.success) {
            document.getElementById('cov_bias_theta_R').value = res.mean.toFixed(2);
            document.getElementById('cov_val_theta_R').value = res.cov.toFixed(2);
            showToast(`θ_R extraído de ${res.samples} ensaios: Média = ${res.mean.toFixed(3)} | COV = ${(res.cov * 100).toFixed(1)}%`, "success");
            executeReliabilityCalculation();
        } else {
            showToast("Erro ao extrair dados de erro de modelo.", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Falha na chamada de erro de modelo: " + e, "error");
    }
}

async function executeReliabilityCalculation() {
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    saveState();
    setLoadingState(true);

    try {
        if (!window.eel || !eel.run_shear_reliability_analysis) {
            showToast("Backend Python não disponível.", "error");
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
        setLoadingState(false);

        if (res && res.success && res.form) {
            lastReliabilityResult = res.form;
            updateDashboardKPIs(res.form);
            updateDesignPointMPP(res.form);
            updateLatexCode(section, params, rvConfig);

            if (currentGraphTab === 'sensitivity') {
                renderSensitivityChart(res.form.sensitivity_pct);
            } else if (currentGraphTab === 'load_ratio') {
                loadLoadRatioCurve();
            } else if (currentGraphTab === 'multicodes') {
                executeMultiCodeComparison();
            }
        } else {
            showToast("Erro no cálculo FORM: " + (res?.error || "Desconhecido"), "error");
        }
    } catch (e) {
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
            const gammaEl = document.getElementById('kpiCalibratedGamma');
            if (gammaEl) gammaEl.innerText = res.recommended_standard_gamma.toFixed(2);

            const msg = `Calibração Concluída! γ_v ótimo = ${res.optimal_gamma_v.toFixed(3)} (Recomendado na norma: ${res.recommended_standard_gamma.toFixed(2)}) com β médio = ${res.avg_beta.toFixed(3)}.`;
            showToast(msg, "success");

            // Update gamma input with calibrated value
            const secGammaInput = document.getElementById('sec_gamma_v');
            if (secGammaInput) secGammaInput.value = res.recommended_standard_gamma.toFixed(2);

            // Re-run FORM to reflect calibrated factor
            executeReliabilityCalculation();
        }
    } catch (e) {
        setLoadingState(false);
        showToast("Erro na calibração de γ_v: " + e, "error");
    }
}

async function loadLoadRatioCurve() {
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    setLoadingState(true);
    try {
        const res = await eel.compare_shear_reliability_codes({
            section: section,
            model_params: params,
            rv_config: rvConfig,
            chi_values: [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]
        })();
        setLoadingState(false);

        if (res && res.success && res.codes) {
            lastLoadRatioResult = res;
            renderLoadRatioChart(res);
        }
    } catch (e) {
        setLoadingState(false);
    }
}

async function executeMultiCodeComparison() {
    switchGraphTab('multicodes');
    const section = getSectionNominalInputs();
    const params = getModelParameters();
    const rvConfig = getProbabilisticVariablesConfig();

    setLoadingState(true);
    showToast("Calculando curvas de confiabilidade para todos os códigos normativos...", "info");

    try {
        const res = await eel.compare_shear_reliability_codes({
            section: section,
            model_params: params,
            rv_config: rvConfig,
            chi_values: [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]
        })();
        setLoadingState(false);

        if (res && res.success && res.codes) {
            lastMultiCodeResult = res;
            renderMultiCodeChart(res);
            showToast("Comparativo normativo concluído!", "success");
        }
    } catch (e) {
        setLoadingState(false);
        showToast("Erro na comparação: " + e, "error");
    }
}

async function updateLatexCode(section, params, rvConfig) {
    try {
        const res = await eel.generate_shear_reliability_latex({
            section: section,
            model_params: params,
            rv_config: rvConfig,
        })();
        if (res && res.latex) {
            const txt = document.getElementById('latexOutputTextarea');
            if (txt) txt.value = res.latex;
        }
    } catch (e) {}
}

function copyLatexCodeToClipboard() {
    const txt = document.getElementById('latexOutputTextarea');
    if (!txt || !txt.value) {
        showToast("Nenhum código para copiar.", "info");
        return;
    }
    navigator.clipboard.writeText(txt.value).then(() => {
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

function switchGraphTab(tabKey) {
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
        if (lastReliabilityResult) renderSensitivityChart(lastReliabilityResult.sensitivity_pct);
        else executeReliabilityCalculation();
    } else if (tabKey === 'load_ratio') {
        if (subtitle) subtitle.innerText = "Variação do Índice β em função da razão de carga acidental χ = Q / (G + Q)";
        loadLoadRatioCurve();
    } else if (tabKey === 'multicodes') {
        if (subtitle) subtitle.innerText = "Comparativo do Índice de Confiabilidade β entre Códigos Normativos";
        if (lastMultiCodeResult) renderMultiCodeChart(lastMultiCodeResult);
        else executeMultiCodeComparison();
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
