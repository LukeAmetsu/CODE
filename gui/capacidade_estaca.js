/**
 * Controlador de Interface e Gráficos da Capacidade de Estacas Escavadas
 * Método: FHWA GEC 010 / Mayne Beta-Method
 * Baseado na planilha 'Refs/capacidade estaca.xlsx'
 */

// Estado Global
let projectData = {
    water_table_m: 3.0,
    fs: 2.0,
    fs_global: 2.0,
    fs_lateral: 1.5,
    fs_ponta: 3.0,
    apply_beta_fhwa_limit: true,
    beta_shallow_stress_limit_kpa: 43.1,
    beta_cap_kp_tan_phi: true,
    target_load_kN: 21400.0,
    percentile: 10.0,
    casing_reduction_pct: 10.0,
    casing_reduction_mode: "excel_formula", // 'excel_formula' (Radm * 0.9) ou 'lateral_only' (Rs * 0.9)
    casing_length_m: null, // metros com camisa (null = estaca toda)
    kp_base: 0.59,
    pa_kpa: 101.3,
    cn_max: 2.0,
    critical_sounding: "SPT-01",
    soil_groups: {
        "Relleno (Aterro)": { gamma_dry: 17.0, gamma_sub: 10.0 },
        "Areias": { gamma_dry: 18.5, gamma_sub: 8.5 },
        "Gravas": { gamma_dry: 20.0, gamma_sub: 10.5 },
        "Finos": { gamma_dry: 18.0, gamma_sub: 11.0 }
    },
    piles: [
        { id: "pile_48in", name: "Estaca D=1.20m (48\")", diam_in: 48, diam_m: 1.20, perimeter_m: 3.76, area_m2: 1.13 },
        { id: "pile_54in", name: "Estaca D=1.30m (54\")", diam_in: 54, diam_m: 1.30, perimeter_m: 4.08, area_m2: 1.32 },
        { id: "pile_60in", name: "Estaca D=1.50m (60\")", diam_in: 60, diam_m: 1.50, perimeter_m: 4.71, area_m2: 1.76 }
    ],
    axes: [
        { name: "A", cota_inicio_m: 20.75, target_load_kN: 21400.0 },
        { name: "B", cota_inicio_m: 19.00, target_load_kN: 21400.0 },
        { name: "C", cota_inicio_m: 14.40, target_load_kN: 21400.0 },
        { name: "D", cota_inicio_m: 9.35, target_load_kN: 21400.0 },
        { name: "E", cota_inicio_m: 4.60, target_load_kN: 21400.0 }
    ],
    soundings: {}
};

let analysisResult = null;
let activeSoundingName = "SPT-01";
let activeTab = "summary";

// Instâncias de Gráficos (Chart.js)
let chartCapacityCompInst = null;
let chartDiametersCompInst = null;
let chartStratigraphyInst = null;
let chartStrengthsInst = null;
let chartSoundingCapacityInst = null;
let chartAxesInst = null;

// Paleta de Cores
const PALETTE = {
    blue: "#2563EB",
    indigo: "#4F46E5",
    sky: "#0284C7",
    emerald: "#059669",
    amber: "#D97706",
    rose: "#E11D48",
    purple: "#7C3AED",
    slate: "#475569",
    targetLine: "#DC2626"
};

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    loadReferenceData();
});

// Alternância de Abas
function switchTab(tabId) {
    activeTab = tabId;
    const tabs = ["summary", "axes", "soundings", "parameters"];

    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const view = document.getElementById(`view-tab-${t}`);
        if (!btn || !view) return;

        if (t === tabId) {
            btn.className = "tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all border border-blue-600 bg-blue-600 text-white flex items-center gap-1.5 shadow-xs whitespace-nowrap";
            view.classList.remove("hidden");
        } else {
            btn.className = "tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all border border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1.5 whitespace-nowrap";
            view.classList.add("hidden");
        }
    });

    // Re-renderiza gráficos quando a aba se torna visível
    setTimeout(() => {
        if (tabId === "summary") renderSummaryCharts();
        if (tabId === "axes") renderAxesChart();
        if (tabId === "soundings") renderSoundingCharts();
    }, 50);
}

// Carrega Dados de Referência
function loadReferenceData() {
    if (typeof eel !== "undefined" && eel.get_capacidade_estaca_reference_data) {
        eel.get_capacidade_estaca_reference_data()((res) => {
            if (res && res.success && res.data) {
                projectData = Object.assign(projectData, res.data);
                populateUIParameters();
                populateSoundingSelectors();
                triggerCalculation();
            } else {
                fetchFallbackJSON();
            }
        });
    } else {
        fetchFallbackJSON();
    }
}

function fetchFallbackJSON() {
    fetch("../backend/calculators/capacidade_estaca_data.json")
        .then(r => r.json())
        .then(data => {
            projectData = Object.assign(projectData, data);
            populateUIParameters();
            populateSoundingSelectors();
            triggerCalculation();
        })
        .catch(err => {
            console.warn("Fallback JSON fetch error:", err);
            triggerCalculation();
        });
}

function populateUIParameters() {
    const elNa = document.getElementById("input-water-table");
    const elFs = document.getElementById("input-fs");
    const elFsQuick = document.getElementById("quick-input-fs");
    const elFsLat = document.getElementById("input-fs-lateral");
    const elFsLatQuick = document.getElementById("quick-input-fs-s");
    const elFsPonta = document.getElementById("input-fs-ponta");
    const elFsPontaQuick = document.getElementById("quick-input-fs-p");
    const elFhwaBeta = document.getElementById("check-apply-beta-fhwa");
    const elFhwaBetaQuick = document.getElementById("quick-check-fhwa-beta");
    const elShallowStress = document.getElementById("input-shallow-stress");
    const elBetaCapKp = document.getElementById("check-beta-cap-kp");
    const elTarget = document.getElementById("input-target-load");
    const elPerc = document.getElementById("input-percentile");
    const elCrit = document.getElementById("input-critical-sounding");
    const elCasingParam = document.getElementById("input-casing-reduction");
    const elCasingQuick = document.getElementById("quick-input-casing-pct");
    const elCasingMode = document.getElementById("select-casing-mode");
    const elCasingModeQuick = document.getElementById("quick-select-casing-mode");
    const elKp = document.getElementById("input-kp-base");
    const elCn = document.getElementById("input-cn-max");
    const elPa = document.getElementById("input-pa-kpa");

    const fsGlob = projectData.fs_global ?? projectData.fs ?? 2.0;
    const fsLat = projectData.fs_lateral ?? 1.5;
    const fsTip = projectData.fs_ponta ?? 3.0;
    const fhwaBeta = projectData.apply_beta_fhwa_limit ?? true;
    const shallowStress = projectData.beta_shallow_stress_limit_kpa ?? 43.1;
    const capKp = projectData.beta_cap_kp_tan_phi ?? true;

    if (elNa) elNa.value = projectData.water_table_m;
    if (elFs) elFs.value = fsGlob;
    if (elFsQuick) elFsQuick.value = fsGlob;
    if (elFsLat) elFsLat.value = fsLat;
    if (elFsLatQuick) elFsLatQuick.value = fsLat;
    if (elFsPonta) elFsPonta.value = fsTip;
    if (elFsPontaQuick) elFsPontaQuick.value = fsTip;
    if (elFhwaBeta) elFhwaBeta.checked = fhwaBeta;
    if (elFhwaBetaQuick) elFhwaBetaQuick.checked = fhwaBeta;
    if (elShallowStress) elShallowStress.value = shallowStress;
    if (elBetaCapKp) elBetaCapKp.checked = capKp;

    if (elTarget) elTarget.value = projectData.target_load_kN;
    if (elPerc) elPerc.value = projectData.percentile;
    if (elCrit && projectData.critical_sounding) elCrit.value = projectData.critical_sounding;
    if (elCasingParam) elCasingParam.value = projectData.casing_reduction_pct ?? 10;
    if (elCasingQuick) elCasingQuick.value = projectData.casing_reduction_pct ?? 10;
    const elCasingLenParam = document.getElementById("input-casing-length");
    const elCasingLenQuick = document.getElementById("quick-input-casing-len");
    if (elCasingLenParam) elCasingLenParam.value = (projectData.casing_length_m !== null && projectData.casing_length_m !== undefined) ? projectData.casing_length_m : "";
    if (elCasingLenQuick) elCasingLenQuick.value = (projectData.casing_length_m !== null && projectData.casing_length_m !== undefined) ? projectData.casing_length_m : "";
    if (elCasingMode) elCasingMode.value = projectData.casing_reduction_mode || "excel_formula";
    if (elCasingModeQuick) elCasingModeQuick.value = projectData.casing_reduction_mode || "excel_formula";
    if (elKp) elKp.value = projectData.kp_base ?? 0.59;
    if (elCn) elCn.value = projectData.cn_max ?? 2.0;
    if (elPa) elPa.value = projectData.pa_kpa ?? 101.3;

    // Extrapolação de solo profundo baseada na menor profundidade dos testes
    const minInfo = detectMinSoundingDepth();
    const elSptDepth = document.getElementById("input-spt01-depth");
    if (elSptDepth) {
        if (!projectData.spt01_measured_depth_m && !projectData.base_depth_m) {
            elSptDepth.value = minInfo.minDepth;
            projectData.spt01_measured_depth_m = minInfo.minDepth;
            projectData.base_depth_m = minInfo.minDepth;
        } else {
            elSptDepth.value = projectData.base_depth_m ?? projectData.spt01_measured_depth_m ?? minInfo.minDepth;
        }
    }
    const elExtrapPerc = document.getElementById("input-extrap-percentile");
    if (elExtrapPerc) elExtrapPerc.value = projectData.extrapolation_n_percentile ?? 15;
    const elExtrapSoil = document.getElementById("select-extrap-soil");
    if (elExtrapSoil) elExtrapSoil.value = projectData.extrapolation_soil_group || "auto";
    const elExtrapMax = document.getElementById("input-extrap-max-depth");
    if (elExtrapMax) elExtrapMax.value = projectData.extrapolation_max_depth_m ?? 132.6;

    updateKPIs();
    renderSoilGroupsTable();
    renderPilesTable();
}

function syncCasingPct(val) {
    const num = Math.max(0, Math.min(100, parseFloat(val) || 0));
    projectData.casing_reduction_pct = num;
    const factor = 1.0 - (num / 100.0);
    const factorStr = factor.toFixed(2);

    const elQuick = document.getElementById("quick-input-casing-pct");
    const elParam = document.getElementById("input-casing-reduction");
    const elBadge = document.getElementById("quick-casing-factor-badge");
    const elKpiRed = document.getElementById("kpi-casing-reduction");
    const elKpiFactor = document.getElementById("kpi-casing-factor");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elBadge) elBadge.innerText = `(x${factorStr})`;
    if (elKpiRed) elKpiRed.innerText = `-${num}%`;
    if (elKpiFactor) elKpiFactor.innerText = `(x${factorStr})`;

    updateKPIs();
    triggerCalculation();
}

function syncCasingLength(val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    projectData.casing_length_m = num;

    const elQuick = document.getElementById("quick-input-casing-len");
    const elParam = document.getElementById("input-casing-length");

    if (elQuick && (num === null ? elQuick.value !== "" : parseFloat(elQuick.value) !== num)) {
        elQuick.value = (num === null) ? "" : num;
    }
    if (elParam && (num === null ? elParam.value !== "" : parseFloat(elParam.value) !== num)) {
        elParam.value = (num === null) ? "" : num;
    }

    updateKPIs();
    triggerCalculation();
}

function syncCasingMode(val) {
    projectData.casing_reduction_mode = val;
    const elQuick = document.getElementById("quick-select-casing-mode");
    const elParam = document.getElementById("select-casing-mode");
    if (elQuick && elQuick.value !== val) elQuick.value = val;
    if (elParam && elParam.value !== val) elParam.value = val;
    triggerCalculation();
}

function syncFSGlobal(val) {
    const num = Math.max(0.1, parseFloat(val) || 2.0);
    projectData.fs = num;
    projectData.fs_global = num;
    const elQuick = document.getElementById("quick-input-fs");
    const elParam = document.getElementById("input-fs");
    const elKpi = document.getElementById("kpi-fs");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(2);
    triggerCalculation();
}

function syncFS(val) {
    syncFSGlobal(val);
}

function syncFSLateral(val) {
    const num = Math.max(0.1, parseFloat(val) || 1.5);
    projectData.fs_lateral = num;
    const elQuick = document.getElementById("quick-input-fs-s");
    const elParam = document.getElementById("input-fs-lateral");
    const elKpi = document.getElementById("kpi-fs-dif-s");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(1);
    triggerCalculation();
}

function syncFSPonta(val) {
    const num = Math.max(0.1, parseFloat(val) || 3.0);
    projectData.fs_ponta = num;
    const elQuick = document.getElementById("quick-input-fs-p");
    const elParam = document.getElementById("input-fs-ponta");
    const elKpi = document.getElementById("kpi-fs-dif-p");

    if (elQuick && parseFloat(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseFloat(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(1);
    triggerCalculation();
}

function syncFHWABeta(checked) {
    const isChecked = !!checked;
    projectData.apply_beta_fhwa_limit = isChecked;
    const elQuick = document.getElementById("quick-check-fhwa-beta");
    const elParam = document.getElementById("check-apply-beta-fhwa");
    const elKpi = document.getElementById("kpi-fhwa-beta-status");

    if (elQuick && elQuick.checked !== isChecked) elQuick.checked = isChecked;
    if (elParam && elParam.checked !== isChecked) elParam.checked = isChecked;
    if (elKpi) elKpi.innerText = isChecked ? "ATIVO (σ'v ≥ 43.1 kPa)" : "DESATIVADO";
    triggerCalculation();
}

function syncPileDiameter(idx, val) {
    const dVal = parseFloat(val);
    if (isNaN(dVal) || dVal <= 0) return;
    if (projectData.piles && projectData.piles[idx]) {
        const p = projectData.piles[idx];
        p.diam_m = dVal;
        p.diam_in = Math.round(dVal / 0.0254);
        p.perimeter_m = Math.floor(Math.PI * dVal * 100) / 100;
        p.area_m2 = Math.floor(Math.PI * Math.pow(dVal / 2, 2) * 100) / 100;
        p.name = `Estaca D=${dVal.toFixed(2)}m (${p.diam_in}")`;

        updatePileHeaders();
        renderPilesTable();
        triggerCalculation();
    }
}

function updatePileHeaders() {
    const piles = projectData.piles || [];
    piles.forEach((p, idx) => {
        document.querySelectorAll(`.th-pile-sub-${idx}`).forEach(el => {
            el.innerText = `${p.diam_m.toFixed(2)}m`;
        });
        document.querySelectorAll(`.th-axis-sub-${idx}`).forEach(el => {
            el.innerText = `D=${p.diam_m.toFixed(2)}m`;
        });
        const qIn = document.getElementById(`quick-input-diam-${idx}`);
        if (qIn && document.activeElement !== qIn) {
            qIn.value = p.diam_m.toFixed(2);
        }
    });

    const chartPileSel = document.getElementById("chart-pile-select");
    if (chartPileSel && piles.length >= 3) {
        chartPileSel.options[0].text = `D = ${piles[0].diam_m.toFixed(2)} m (${piles[0].diam_in}")`;
        chartPileSel.options[1].text = `D = ${piles[1].diam_m.toFixed(2)} m (${piles[1].diam_in}")`;
        chartPileSel.options[2].text = `D = ${piles[2].diam_m.toFixed(2)} m (${piles[2].diam_in}")`;
    }
}

function updateAxisCotaTopo(axisName, val) {
    const newCota = parseFloat(val);
    if (isNaN(newCota)) return;
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.cota_topo_m = newCota;
        ax.cota_inicio_m = newCota;
        triggerCalculation();
    }
}

function detectMinSoundingDepth() {
    const soundings = projectData.soundings || {};
    let minDepth = 44.4;
    let minSounding = "SPT-01";
    let found = false;

    for (const [name, layers] of Object.entries(soundings)) {
        if (!Array.isArray(layers) || layers.length === 0) continue;
        let mDepth = 0;
        if (name === "SPT-01") {
            const realLayers = layers.filter(l => !l.is_extrapolated && (parseFloat(l.z_fim) <= 44.401 || parseFloat(l.z_fim) <= (projectData.spt01_measured_depth_m || 44.401)));
            mDepth = realLayers.length > 0 ? Math.max(...realLayers.map(l => parseFloat(l.z_fim) || 0)) : (projectData.spt01_measured_depth_m || 44.4);
        } else {
            const realLayers = layers.filter(l => !l.is_extrapolated);
            mDepth = realLayers.length > 0 ? Math.max(...realLayers.map(l => parseFloat(l.z_fim) || 0)) : Math.max(...layers.map(l => parseFloat(l.z_fim) || 0));
        }
        if (mDepth > 0 && (!found || mDepth < minDepth)) {
            minDepth = mDepth;
            minSounding = name;
            found = true;
        }
    }
    return { minDepth: Math.round(minDepth * 10) / 10, minSounding };
}

function autoDetectAndSetMinDepth() {
    const info = detectMinSoundingDepth();
    const inputDepth = document.getElementById("input-spt01-depth");
    if (inputDepth) {
        inputDepth.value = info.minDepth;
        syncExtrapolationSettings();
    }
}

function syncExtrapolationSettings() {
    projectData.spt01_measured_depth_m = parseFloat(document.getElementById("input-spt01-depth")?.value || 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseFloat(document.getElementById("input-extrap-percentile")?.value || 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseFloat(document.getElementById("input-extrap-max-depth")?.value || 132.6);
    triggerCalculation();
}

function populateSoundingSelectors() {
    const selActive = document.getElementById("select-active-sounding");
    const selCrit = document.getElementById("input-critical-sounding");

    if (!selActive) return;

    const names = Object.keys(projectData.soundings || {});
    selActive.innerHTML = "";
    if (selCrit) selCrit.innerHTML = "";

    names.forEach(n => {
        const opt = document.createElement("option");
        opt.value = n;
        opt.text = n;
        if (n === activeSoundingName) opt.selected = true;
        selActive.appendChild(opt);

        if (selCrit) {
            const optC = document.createElement("option");
            optC.value = n;
            optC.text = n;
            if (n === (projectData.critical_sounding || "SPT-01")) optC.selected = true;
            selCrit.appendChild(optC);
        }
    });

    // Opção síntese estatística
    const optMed = document.createElement("option");
    const pVal = projectData.percentile || 10;
    optMed.value = `SPT médio (P${pVal}%)`;
    optMed.text = `SPT médio (P${pVal}%)`;
    selActive.appendChild(optMed);

    if (selCrit) {
        const optCritMed = document.createElement("option");
        optCritMed.value = `SPT médio (P${pVal}%)`;
        optCritMed.text = `SPT médio (P${pVal}%)`;
        selCrit.appendChild(optCritMed);
    }
}

// Execução do Cálculo
function triggerCalculation() {
    // Lê parâmetros da interface
    projectData.water_table_m = parseFloat(document.getElementById("input-water-table")?.value || 3.0);
    projectData.fs_global = parseFloat(document.getElementById("input-fs")?.value || 2.0);
    projectData.fs = projectData.fs_global;
    projectData.fs_lateral = parseFloat(document.getElementById("input-fs-lateral")?.value || 1.5);
    projectData.fs_ponta = parseFloat(document.getElementById("input-fs-ponta")?.value || 3.0);
    projectData.apply_beta_fhwa_limit = document.getElementById("check-apply-beta-fhwa") ? document.getElementById("check-apply-beta-fhwa").checked : true;
    projectData.beta_shallow_stress_limit_kpa = parseFloat(document.getElementById("input-shallow-stress")?.value || 43.1);
    projectData.beta_cap_kp_tan_phi = document.getElementById("check-beta-cap-kp") ? document.getElementById("check-beta-cap-kp").checked : true;

    projectData.target_load_kN = parseFloat(document.getElementById("input-target-load")?.value || 21400.0);
    projectData.percentile = parseFloat(document.getElementById("input-percentile")?.value || 10.0);
    projectData.critical_sounding = document.getElementById("input-critical-sounding")?.value || "SPT-01";
    projectData.casing_reduction_pct = parseFloat(document.getElementById("input-casing-reduction")?.value ?? 10.0);
    projectData.casing_reduction_mode = document.getElementById("select-casing-mode")?.value || "excel_formula";
    const casingLenVal = document.getElementById("input-casing-length")?.value ?? document.getElementById("quick-input-casing-len")?.value;
    if (casingLenVal !== "" && casingLenVal !== null && casingLenVal !== undefined) {
        const parsedLen = parseFloat(casingLenVal);
        projectData.casing_length_m = (!isNaN(parsedLen) && parsedLen >= 0) ? parsedLen : null;
    } else {
        projectData.casing_length_m = null;
    }
    projectData.kp_base = parseFloat(document.getElementById("input-kp-base")?.value || 0.59);
    projectData.cn_max = parseFloat(document.getElementById("input-cn-max")?.value || 2.0);
    projectData.pa_kpa = parseFloat(document.getElementById("input-pa-kpa")?.value || 101.3);

    // Parâmetros de Extrapolação de Solo Profundo
    projectData.spt01_measured_depth_m = parseFloat(document.getElementById("input-spt01-depth")?.value || 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseFloat(document.getElementById("input-extrap-percentile")?.value || 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseFloat(document.getElementById("input-extrap-max-depth")?.value || 132.6);

    updateKPIs();

    if (typeof eel !== "undefined" && eel.calculate_capacidade_estaca) {
        eel.calculate_capacidade_estaca(projectData)((res) => {
            if (res && res.success) {
                analysisResult = res;
                updateUIWithResults();
            } else {
                console.warn("Eel calculation error, running client-side:", res?.error);
                runClientSideCalculation();
            }
        });
    } else {
        runClientSideCalculation();
    }
}

function updateKPIs() {
    const elTarget = document.getElementById("kpi-target-load");
    const elNa = document.getElementById("kpi-water-table");
    const elFs = document.getElementById("kpi-fs");
    const elFsDifS = document.getElementById("kpi-fs-dif-s");
    const elFsDifP = document.getElementById("kpi-fs-dif-p");
    const elFhwaBeta = document.getElementById("kpi-fhwa-beta-status");
    const elCrit = document.getElementById("kpi-critical-sounding");
    const elPerc = document.getElementById("kpi-percentile");
    const elSummaryTarget = document.getElementById("summary-target-text");
    const elCasingRed = document.getElementById("kpi-casing-reduction");
    const elCasingFactor = document.getElementById("kpi-casing-factor");
    const elBadge = document.getElementById("quick-casing-factor-badge");
    const elBadgeInfo = document.getElementById("badge-casing-info");
    const elCasingLenBadge = document.getElementById("kpi-casing-len-badge");

    const fsGlob = projectData.fs_global ?? projectData.fs ?? 2.0;
    const fsLat = projectData.fs_lateral ?? 1.5;
    const fsTip = projectData.fs_ponta ?? 3.0;
    const fhwaBeta = projectData.apply_beta_fhwa_limit ?? true;

    const casingPct = projectData.casing_reduction_pct ?? 10.0;
    const casingFactor = 1.0 - (casingPct / 100.0);
    const factorStr = casingFactor.toFixed(2);
    const casingLen = projectData.casing_length_m;

    if (elTarget) elTarget.innerText = Number(projectData.target_load_kN).toLocaleString("pt-BR");
    if (elNa) elNa.innerText = Number(projectData.water_table_m).toFixed(2);
    if (elFs) elFs.innerText = Number(fsGlob).toFixed(2);
    if (elFsDifS) elFsDifS.innerText = Number(fsLat).toFixed(1);
    if (elFsDifP) elFsDifP.innerText = Number(fsTip).toFixed(1);
    if (elFhwaBeta) elFhwaBeta.innerText = fhwaBeta ? "ATIVO (σ'v ≥ 43.1 kPa)" : "DESATIVADO";
    if (elCrit) elCrit.innerText = projectData.critical_sounding || "SPT-01";
    if (elPerc) elPerc.innerText = `${projectData.percentile}%`;
    if (elSummaryTarget) elSummaryTarget.innerText = `${Number(projectData.target_load_kN).toLocaleString("pt-BR")} kN`;
    if (elCasingRed) elCasingRed.innerText = `-${casingPct}%`;
    if (elCasingFactor) elCasingFactor.innerText = `(x${factorStr})`;
    if (elBadge) elBadge.innerText = `(x${factorStr})`;

    let casingInfoText = `Camisa: -${casingPct}% (Fator ${factorStr})`;
    if (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0) {
        casingInfoText += ` nos primeiros ${casingLen.toFixed(1)}m`;
        if (elCasingLenBadge) elCasingLenBadge.innerText = `Primeiros ${casingLen.toFixed(1)}m`;
    } else {
        if (elCasingLenBadge) elCasingLenBadge.innerText = "Estaca inteira";
    }
    if (elBadgeInfo) elBadgeInfo.innerText = casingInfoText;

    // Atualização dinâmica dos textos de FS na Aba 1
    const selFsMode = document.getElementById("select-summary-fs-mode");
    if (selFsMode && selFsMode.options.length >= 3) {
        selFsMode.options[0].text = `Comparativo: FS Global (${Number(fsGlob).toFixed(1)}) vs FS Diferenciado (${Number(fsLat).toFixed(1)} / ${Number(fsTip).toFixed(1)})`;
        selFsMode.options[1].text = `Apenas FS Global (${Number(fsGlob).toFixed(1)})`;
        selFsMode.options[2].text = `Apenas FS Diferenciado (${Number(fsLat).toFixed(1)} / ${Number(fsTip).toFixed(1)})`;
    }
    const thRadm = document.getElementById("summary-th-radm");
    if (thRadm) {
        thRadm.innerText = `Capacidade Admissível Radm (kN - FS=${Number(fsGlob).toFixed(1)})`;
    }

    // Badge de extrapolação na Aba 4
    renderExtrapolationEstimates();
}

function renderExtrapolationEstimates() {
    const est = analysisResult?.extrapolation_estimates;
    const minInfo = detectMinSoundingDepth();

    // 1. Atualiza hint do input de menor profundidade medida
    const hintDepth = document.getElementById("detected-min-depth-hint");
    if (hintDepth) {
        const detectedD = analysisResult?.min_test_depth_m ?? minInfo.minDepth;
        const detectedS = analysisResult?.min_test_sounding ?? minInfo.minSounding;
        hintDepth.innerText = `Menor cota medida: ${Number(detectedD).toFixed(1)} m (${detectedS})`;
    }

    // 2. Atualiza texto da opção auto no select (sem Areia hardcoded!)
    const optAuto = document.getElementById("opt-extrap-auto");
    const modalGroup = est?.modal_soil_group || "Solo mais comum";
    const modalPct = est?.modal_soil_pct ? ` (${est.modal_soil_pct}%)` : "";
    if (optAuto) {
        optAuto.text = `Mais comum na sondagem: ${modalGroup}${modalPct}`;
    }

    const hintModal = document.getElementById("detected-modal-soil-hint");
    if (hintModal) {
        hintModal.innerText = est ? `Mais comum: ${est.modal_soil_group} (${est.modal_soil_count} de ${est.total_measured_layers} camadas)` : "Identificado da sondagem";
    }

    // 3. Badge superior do card de extrapolação
    const extrapBadge = document.getElementById("extrap-status-badge");
    if (extrapBadge) {
        const nEst = est?.estimated_n60 ?? 27;
        const sAdopted = est?.adopted_soil_group || (projectData.extrapolation_soil_group === 'auto' ? modalGroup : (projectData.extrapolation_soil_group || modalGroup));
        const pEst = est?.n_percentile ?? projectData.extrapolation_n_percentile ?? 15;
        extrapBadge.innerText = `N estimado = ${nEst} (${sAdopted} - P${pEst}%)`;
    }

    // 4. Preenche os 6 cards de estimativas detalhadas
    if (est) {
        const elLayersBadge = document.getElementById("extrap-summary-layers-badge");
        if (elLayersBadge) {
            elLayersBadge.innerText = `${est.num_extrapolated_layers} camadas sintetizadas (${Number(est.extrapolated_length_m).toFixed(1)} m)`;
        }

        const elSoilGroup = document.getElementById("est-soil-group");
        if (elSoilGroup) {
            elSoilGroup.innerText = `${est.adopted_soil_group} (${est.modal_sucs || 'SUCS'})`;
        }

        const elSoilOccur = document.getElementById("est-soil-occurrence");
        if (elSoilOccur) {
            elSoilOccur.innerText = `${est.modal_soil_count} de ${est.total_measured_layers} camadas (${est.modal_soil_pct}%)`;
        }

        const elN60 = document.getElementById("est-n60-val");
        if (elN60) elN60.innerText = est.estimated_n60;

        const elN60Stats = document.getElementById("est-n60-stats");
        if (elN60Stats) {
            elN60Stats.innerText = `Média: ${est.n_mean} | Mediana: ${est.n_median}`;
        }

        const elPhi = document.getElementById("est-phi-val");
        if (elPhi) elPhi.innerText = `${Number(est.estimated_phi_deg).toFixed(1)}°`;

        const elQs = document.getElementById("est-qs-val");
        if (elQs) elQs.innerText = `${Number(est.avg_qs_kpa).toFixed(1)} kPa`;

        const elQsRange = document.getElementById("est-qs-range");
        if (elQsRange) {
            elQsRange.innerText = `${Number(est.min_qs_kpa).toFixed(1)} a ${Number(est.max_qs_kpa).toFixed(1)} kPa`;
        }

        const elQp = document.getElementById("est-qp-val");
        if (elQp) elQp.innerText = `${Number(est.avg_qp_kpa).toLocaleString("pt-BR", {maximumFractionDigits: 1})} kPa`;

        const elInterval = document.getElementById("est-interval-val");
        if (elInterval) {
            elInterval.innerText = `${Number(est.base_depth_m).toFixed(1)} m → ${Number(est.max_depth_m).toFixed(1)} m`;
        }

        const elCount = document.getElementById("est-layers-count");
        if (elCount) {
            elCount.innerText = `${est.num_extrapolated_layers} camadas (dz = 0.60m)`;
        }
    }
}

// Atualização Completa da Interface
function updateUIWithResults() {
    if (!analysisResult) return;

    renderExtrapolationEstimates();
    renderSummaryTable();
    renderSummaryCharts();
    renderAxesTable();
    renderAxesChart();
    renderDetailedLayersTable();
    renderSoundingCharts();
}

// RENDER TABELA SÍNTESE
// RENDER TABELA SÍNTESE
function renderSummaryTable() {
    const tbody = document.getElementById("summary-table-body");
    if (!tbody || !analysisResult) return;

    tbody.innerHTML = "";
    const summary = analysisResult.summary_table || [];
    const fsMode = document.getElementById("select-summary-fs-mode")?.value || "both";

    summary.forEach((row, idx) => {
        const tr = document.createElement("tr");
        tr.className = (idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/30") +
            " hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors";

        const isSynth = row.sounding_name.includes("médio");
        const isCritical = row.sounding_name === analysisResult.critical_sounding_used;

        let nameHtml = `<span class="font-bold text-gray-900 dark:text-white">${row.sounding_name}</span>`;
        if (isCritical) {
            nameHtml += ` <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Crítica</span>`;
        }
        if (isSynth) {
            nameHtml += ` <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">Síntese</span>`;
        }

        const p48 = row.piles["pile_48in"] || {};
        const p54 = row.piles["pile_54in"] || {};
        const p60 = row.piles["pile_60in"] || {};

        const fmtVal = (v) => (v !== undefined && v !== null && v !== "N/A") ? Number(v).toLocaleString("pt-BR") : "N/A";
        const fmtProf = (v) => (v !== undefined && v !== null && v !== "N/A") ? `${Number(v).toFixed(1)} m` : "<span class='text-rose-500 font-bold'>N/A</span>";

        const renderRadmCell = (p) => {
            const radmGlob = fmtVal(p.max_radm_kN);
            const radmDif = fmtVal(p.max_radm_dif_kN ?? p.max_radm_kN);
            if (fsMode === "global") {
                return `<span class="font-bold text-blue-700 dark:text-blue-300">${radmGlob}</span>`;
            } else if (fsMode === "differentiated") {
                return `<span class="font-bold text-purple-700 dark:text-purple-300">${radmDif}</span>`;
            } else {
                return `<div><span class="font-bold text-blue-700 dark:text-blue-300">${radmGlob}</span><br><span class="text-[10px] text-purple-600 dark:text-purple-400 font-bold">${radmDif} (dif)</span></div>`;
            }
        };

        const renderTargetProfCell = (p) => {
            const profGlob = fmtProf(p.depth_for_target_m);
            const profDif = fmtProf(p.depth_for_target_dif_m ?? p.depth_for_target_m);
            if (fsMode === "global") {
                return `<span class="font-bold text-indigo-700 dark:text-indigo-300">${profGlob}</span>`;
            } else if (fsMode === "differentiated") {
                return `<span class="font-bold text-purple-700 dark:text-purple-300">${profDif}</span>`;
            } else {
                return `<div><span class="font-bold text-indigo-700 dark:text-indigo-300">${profGlob}</span><br><span class="text-[10px] text-purple-600 dark:text-purple-400 font-bold">${profDif} (dif)</span></div>`;
            }
        };

        tr.innerHTML = `
            <td class="p-3 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">${nameHtml}</td>
            <td class="p-2 text-center font-mono">${fmtVal(p48.max_rn_kN)}</td>
            <td class="p-2 text-center font-mono">${fmtVal(p54.max_rn_kN)}</td>
            <td class="p-2 text-center font-mono border-r border-gray-200 dark:border-gray-700">${fmtVal(p60.max_rn_kN)}</td>
            <td class="p-2 text-center font-mono">${renderRadmCell(p48)}</td>
            <td class="p-2 text-center font-mono">${renderRadmCell(p54)}</td>
            <td class="p-2 text-center font-mono border-r border-gray-200 dark:border-gray-700">${renderRadmCell(p60)}</td>
            <td class="p-2 text-center font-mono text-gray-500">${fmtProf(p48.depth_at_max_m)}</td>
            <td class="p-2 text-center font-mono text-gray-500">${fmtProf(p54.depth_at_max_m)}</td>
            <td class="p-2 text-center font-mono text-gray-500 border-r border-gray-200 dark:border-gray-700">${fmtProf(p60.depth_at_max_m)}</td>
            <td class="p-2 text-center font-mono">${renderTargetProfCell(p48)}</td>
            <td class="p-2 text-center font-mono">${renderTargetProfCell(p54)}</td>
            <td class="p-2 text-center font-mono">${renderTargetProfCell(p60)}</td>
        `;

        tbody.appendChild(tr);
    });
}

function updateSummaryFocus() {
    renderSummaryTable();
}

// RENDER GRÁFICOS DA ABA 1 (VISÃO GERAL)
function renderSummaryCharts() {
    if (!analysisResult) return;

    // 1. Chart Radm vs Depth Comparison
    const ctxComp = document.getElementById("chart-capacity-comparison");
    const pileId = document.getElementById("chart-pile-select")?.value || "pile_48in";

    if (ctxComp) {
        if (chartCapacityCompInst) chartCapacityCompInst.destroy();

        const datasets = [];
        const soundings = analysisResult.soundings || {};
        const colors = [PALETTE.blue, PALETTE.emerald, PALETTE.purple, PALETTE.amber, PALETTE.sky, PALETTE.rose, "#10B981"];

        let cIdx = 0;
        let maxDepthGlobal = 0;

        for (const [sName, sData] of Object.entries(soundings)) {
            const pCap = sData.capacities?.[pileId];
            if (!pCap) continue;

            const pts = pCap.depths.map((d, i) => ({ x: pCap.radm[i], y: d }));
            if (pCap.depths.length > 0) {
                const lastD = pCap.depths[pCap.depths.length - 1];
                if (lastD > maxDepthGlobal) maxDepthGlobal = lastD;
            }

            const isSynth = sName.includes("médio");
            datasets.push({
                label: sName,
                data: pts,
                borderColor: isSynth ? "#9333EA" : colors[cIdx % colors.length],
                borderWidth: isSynth ? 3 : 2,
                borderDash: isSynth ? [5, 4] : [],
                pointRadius: 0,
                tension: 0.1
            });
            cIdx++;
        }

        // Linha da Carga Alvo
        const targetLoad = analysisResult.target_load_kN || 21400;
        datasets.push({
            label: `Carga Alvo (${Number(targetLoad).toLocaleString("pt-BR")} kN)`,
            data: [
                { x: targetLoad, y: 0 },
                { x: targetLoad, y: Math.min(maxDepthGlobal, 65) }
            ],
            borderColor: PALETTE.targetLine,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
        });

        chartCapacityCompInst = new Chart(ctxComp, {
            type: "line",
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "nearest", axis: "y", intersect: false },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: `Capacidade Admissível Radm (kN - FS=${Number(analysisResult.fs_global ?? 2.0).toFixed(1)})` },
                        grid: { color: "rgba(156, 163, 175, 0.15)" }
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Profundidade (m)" },
                        grid: { color: "rgba(156, 163, 175, 0.15)" },
                        max: Math.min(maxDepthGlobal, 65)
                    }
                }
            }
        });
    }

    // 2. Chart Diameters Comparison on Critical Sounding
    const ctxDiam = document.getElementById("chart-diameters-comparison");
    const critSoundingName = analysisResult.critical_sounding_used || "SPT-01";
    const lblCrit = document.getElementById("label-critical-sounding-chart");
    if (lblCrit) lblCrit.innerText = critSoundingName;

    if (ctxDiam) {
        if (chartDiametersCompInst) chartDiametersCompInst.destroy();

        const sData = analysisResult.soundings?.[critSoundingName];
        if (sData) {
            const datasets = [];
            const piles = analysisResult.piles || [];
            const pileColors = [PALETTE.blue, PALETTE.emerald, PALETTE.purple];

            piles.forEach((p, idx) => {
                const pCap = sData.capacities?.[p.id];
                if (!pCap) return;
                const pts = pCap.depths.map((d, i) => ({ x: pCap.radm[i], y: d }));
                datasets.push({
                    label: p.name,
                    data: pts,
                    borderColor: pileColors[idx % pileColors.length],
                    borderWidth: 2.5,
                    pointRadius: 0,
                    tension: 0.1
                });
            });

            // Target Line
            const targetLoad = analysisResult.target_load_kN || 21400;
            datasets.push({
                label: `Carga Alvo (${Number(targetLoad).toLocaleString("pt-BR")} kN)`,
                data: [
                    { x: targetLoad, y: 0 },
                    { x: targetLoad, y: 65 }
                ],
                borderColor: PALETTE.targetLine,
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false
            });

            chartDiametersCompInst = new Chart(ctxDiam, {
                type: "line",
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: "linear",
                            title: { display: true, text: "Capacidade Admissível Radm (kN)" },
                            grid: { color: "rgba(156, 163, 175, 0.15)" }
                        },
                        y: {
                            type: "linear",
                            reverse: true,
                            title: { display: true, text: "Profundidade (m)" },
                            grid: { color: "rgba(156, 163, 175, 0.15)" },
                            max: 65
                        }
                    }
                }
            });
        }
    }
}

// RENDER TABELA E GRÁFICO DA ABA 2 (EIXOS)
function renderAxesTable() {
    const tbody = document.getElementById("axes-table-body");
    const selAxis = document.getElementById("select-chart-axis");
    if (!tbody || !analysisResult) return;

    tbody.innerHTML = "";
    if (selAxis) selAxis.innerHTML = "";

    const axes = analysisResult.axes_analysis || [];
    const fsGlob = analysisResult.fs_global ?? analysisResult.fs ?? projectData.fs_global ?? 2.0;
    const fsLat = analysisResult.fs_lateral ?? projectData.fs_lateral ?? 1.5;
    const fsTip = analysisResult.fs_ponta ?? projectData.fs_ponta ?? 3.0;

    axes.forEach((ax, idx) => {
        const cotaTopo = (ax.cota_topo_m !== undefined) ? ax.cota_topo_m : ax.cota_inicio_m;
        const p48 = ax.piles["pile_48in"] || {};
        const p54 = ax.piles["pile_54in"] || {};
        const p60 = ax.piles["pile_60in"] || {};

        const fmtProf = (v) => (v !== undefined && v !== null && v !== "N/A") ? `${Number(v).toFixed(2)} m` : "<span class='text-rose-500 font-bold'>N/A</span>";

        // Cota Fundo e Embutimento Global (FS = 2.0)
        const fundoGlob48 = p48.cota_fundo_global_m ?? p48.cota_fundo_m;
        const fundoGlob54 = p54.cota_fundo_global_m ?? p54.cota_fundo_m;
        const fundoGlob60 = p60.cota_fundo_global_m ?? p60.cota_fundo_m;

        const embGlob48 = p48.embutimento_global_m ?? p48.embutimento_m;
        const embGlob54 = p54.embutimento_global_m ?? p54.embutimento_m;
        const embGlob60 = p60.embutimento_global_m ?? p60.embutimento_m;

        // Cota Fundo e Embutimento Diferenciado (FSs=1.5 / FSp=3.0)
        const fundoDif48 = p48.cota_fundo_dif_m ?? fundoGlob48;
        const fundoDif54 = p54.cota_fundo_dif_m ?? fundoGlob54;
        const fundoDif60 = p60.cota_fundo_dif_m ?? fundoGlob60;

        const embDif48 = p48.embutimento_dif_m ?? embGlob48;
        const embDif54 = p54.embutimento_dif_m ?? embGlob54;
        const embDif60 = p60.embutimento_dif_m ?? embGlob60;

        // Linha 1: FS Global = 2.0
        const tr1 = document.createElement("tr");
        tr1.className = (idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50/60 dark:bg-gray-700/20") + " hover:bg-blue-50/40 dark:hover:bg-blue-900/10";
        tr1.innerHTML = `
            <td rowspan="2" class="p-3 border-r border-b border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white align-middle">
                Eixo ${ax.name}
            </td>
            <td rowspan="2" class="p-2.5 text-center font-mono font-bold text-sky-700 dark:text-sky-300 border-r border-b border-gray-200 dark:border-gray-700 align-middle">
                <div class="flex items-center justify-center gap-1">
                    <input type="number" step="0.05" value="${Number(cotaTopo).toFixed(2)}" onchange="updateAxisCotaTopo('${ax.name}', this.value)" class="w-20 px-1.5 py-1 text-center font-mono font-bold text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-sky-500 shadow-xs" title="Cota de arrasamento / início do fuste">
                    <span class="text-xs text-gray-500">m</span>
                </div>
            </td>
            <td class="p-2 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    <span>🛡️</span> FS Global = ${Number(fsGlob).toFixed(1)}
                </span>
            </td>
            <td class="p-2 text-center font-mono font-bold text-blue-700 dark:text-blue-300">${fmtProf(fundoGlob48)}</td>
            <td class="p-2 text-center font-mono font-bold text-blue-700 dark:text-blue-300">${fmtProf(fundoGlob54)}</td>
            <td class="p-2 text-center font-mono font-bold text-blue-700 dark:text-blue-300 border-r border-gray-200 dark:border-gray-700">${fmtProf(fundoGlob60)}</td>
            <td class="p-2 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">${fmtProf(embGlob48)}</td>
            <td class="p-2 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">${fmtProf(embGlob54)}</td>
            <td class="p-2 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">${fmtProf(embGlob60)}</td>
            <td rowspan="2" class="p-2 text-center border-b border-gray-200 dark:border-gray-700 align-middle">
                <button type="button" onclick="editAxis(${idx})" class="p-1 text-blue-600 hover:text-blue-800" title="Editar">✏️</button>
                <button type="button" onclick="deleteAxis(${idx})" class="p-1 text-rose-600 hover:text-rose-800" title="Excluir">🗑️</button>
            </td>
        `;
        tbody.appendChild(tr1);

        // Linha 2: FS Diferenciado
        const tr2 = document.createElement("tr");
        tr2.className = (idx % 2 === 0 ? "bg-purple-50/20 dark:bg-purple-950/10" : "bg-purple-50/40 dark:bg-purple-950/20") + " hover:bg-purple-100/30 border-b border-gray-200 dark:border-gray-700";
        tr2.innerHTML = `
            <td class="p-2 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    <span>⚖️</span> DIF (FS<sub>s</sub>=${Number(fsLat).toFixed(1)} / FS<sub>p</sub>=${Number(fsTip).toFixed(1)})
                </span>
            </td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${fmtProf(fundoDif48)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${fmtProf(fundoDif54)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300 border-r border-gray-200 dark:border-gray-700">${fmtProf(fundoDif60)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${fmtProf(embDif48)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${fmtProf(embDif54)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${fmtProf(embDif60)}</td>
        `;
        tbody.appendChild(tr2);

        if (selAxis) {
            const opt = document.createElement("option");
            opt.value = ax.name;
            opt.text = `Eixo ${ax.name} (Cota TOPO: ${Number(cotaTopo).toFixed(2)}m)`;
            selAxis.appendChild(opt);
        }
    });
}

function renderAxesChart() {
    const ctx = document.getElementById("chart-axes-capacity");
    if (!ctx || !analysisResult) return;

    if (chartAxesInst) chartAxesInst.destroy();

    const axisName = document.getElementById("select-chart-axis")?.value || "A";
    const ax = (analysisResult.axes_analysis || []).find(a => a.name === axisName);
    if (!ax) return;

    // Calcula capacidade iniciando do topo deste eixo
    const critSoundingName = analysisResult.critical_sounding_used || "SPT-01";
    const sData = analysisResult.soundings?.[critSoundingName];
    if (!sData) return;

    const layers = sData.layers || [];
    const cotaIni = (ax.cota_topo_m !== undefined) ? ax.cota_topo_m : ax.cota_inicio_m;
    const targetLoad = ax.target_load_kN;
    const fs = analysisResult.fs || projectData.fs || 2.0;

    const casingPct = analysisResult.casing_reduction_pct ?? projectData.casing_reduction_pct ?? 10.0;
    const casingFactor = 1.0 - (casingPct / 100.0);
    const casingMode = analysisResult.casing_reduction_mode ?? projectData.casing_reduction_mode ?? "excel_formula";
    const casingLen = (ax.casing_length_m !== undefined && ax.casing_length_m !== null) ? ax.casing_length_m : (analysisResult.casing_length_m ?? projectData.casing_length_m);

    const datasets = [];
    const piles = analysisResult.piles || [];
    const colors = [PALETTE.blue, PALETTE.emerald, PALETTE.purple];

    piles.forEach((p, idx) => {
        let sumRs = 0;
        const pts = [];
        const perim = p.perimeter_m;
        const area = p.area_m2;

        layers.forEach(lyr => {
            const zFim = lyr.z_fim;
            const zIni = lyr.z_ini;
            const dz = lyr.dz;
            if (zFim <= cotaIni) return;

            const zA = Math.max(zIni, cotaIni);
            const zB = zFim;
            const effDz = Math.max(0, zB - zA);
            if (effDz <= 0) return;

            const rp = lyr.qp * area;
            let radm = 0;

            if (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0) {
                const casingEnd = cotaIni + casingLen;
                const casedDz = Math.max(0, Math.min(zB, casingEnd) - zA);
                const uncasedDz = Math.max(0, effDz - casedDz);
                sumRs += lyr.qs * perim * (casedDz * casingFactor + uncasedDz * 1.0);
                radm = Math.floor((rp + sumRs) / fs);
            } else {
                sumRs += lyr.qs * perim * effDz;
                if (casingMode === "excel_formula") {
                    radm = Math.floor((rp + sumRs) / fs) * casingFactor;
                } else {
                    radm = Math.floor((rp + sumRs * casingFactor) / fs);
                }
            }

            pts.push({ x: radm, y: zFim });
        });

        const cLabel = (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0)
            ? `${p.name} (Camisa ${casingLen}m: -${casingPct}%)`
            : `${p.name} (c/ Camisa -${casingPct}%)`;

        datasets.push({
            label: cLabel,
            data: pts,
            borderColor: colors[idx % colors.length],
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.1
        });
    });

    // Target Line
    datasets.push({
        label: `Carga Alvo (${Number(targetLoad).toLocaleString("pt-BR")} kN)`,
        data: [{ x: targetLoad, y: cotaIni }, { x: targetLoad, y: 65 }],
        borderColor: PALETTE.targetLine,
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0
    });

    // Cota de Início Line
    datasets.push({
        label: `Cota TOPO (${cotaIni.toFixed(2)} m)`,
        data: [{ x: 0, y: cotaIni }, { x: 30000, y: cotaIni }],
        borderColor: "#64748B",
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0
    });

    chartAxesInst = new Chart(ctx, {
        type: "line",
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: "linear",
                    title: { display: true, text: "Capacidade Admissível Acumulada Radm (kN)" },
                    grid: { color: "rgba(156, 163, 175, 0.15)" }
                },
                y: {
                    type: "linear",
                    reverse: true,
                    title: { display: true, text: "Cota de Fundo da Estaca (m)" },
                    grid: { color: "rgba(156, 163, 175, 0.15)" },
                    min: Math.max(0, Math.floor(cotaIni - 2)),
                    max: 65
                }
            }
        }
    });
}

// RENDER ABA 3: DETALHAMENTO DA SONDAGEM
function changeActiveSounding() {
    activeSoundingName = document.getElementById("select-active-sounding")?.value || "SPT-01";
    renderDetailedLayersTable();
    renderSoundingCharts();
}

function renderDetailedLayersTable() {
    const tbody = document.getElementById("detailed-layers-body");
    const countEl = document.getElementById("sounding-layer-count");
    if (!tbody || !analysisResult) return;

    tbody.innerHTML = "";
    const sData = analysisResult.soundings?.[activeSoundingName];
    if (!sData) return;

    const layers = sData.layers || [];
    const caps = sData.capacities?.["pile_48in"] || {};
    if (countEl) countEl.innerText = `${layers.length} camadas (${layers[0]?.z_ini || 0}m a ${layers[layers.length - 1]?.z_fim || 0}m)`;

    layers.forEach((lyr, idx) => {
        const tr = document.createElement("tr");
        tr.className = (idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/30") +
            " hover:bg-blue-50/50 dark:hover:bg-blue-900/20";

        let soilBadgeClass = "soil-badge-aterro";
        if (lyr.soil_group === "Areias") soilBadgeClass = "soil-badge-areias";
        else if (lyr.soil_group === "Gravas") soilBadgeClass = "soil-badge-gravas";
        else if (lyr.soil_group === "Finos") soilBadgeClass = "soil-badge-finos";

        const rsVal = caps.rs_segment?.[idx] || 0;
        const rnVal = caps.rn?.[idx] || 0;
        const radmVal = caps.radm?.[idx] || 0;
        const radmDifVal = caps.radm_dif?.[idx] ?? radmVal;

        const kpTanPhiStr = (lyr.kp_tan_phi !== undefined) ? lyr.kp_tan_phi.toFixed(3) : "-";
        const betaRawStr = (lyr.beta_raw !== undefined) ? lyr.beta_raw.toFixed(3) : (lyr.beta !== undefined ? lyr.beta.toFixed(3) : "-");
        const betaFhwaStr = (lyr.beta !== undefined) ? lyr.beta.toFixed(3) : "-";

        const isExtrap = !!lyr.is_extrapolated;
        const extrapBadge = isExtrap ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700" title="Camada estimada abaixo da profundidade executada do SPT">estimado</span>` : "";

        tr.innerHTML = `
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.z_ini.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.z_fim.toFixed(1)}</td>
            <td class="p-2 text-center font-bold border-r border-gray-200 dark:border-gray-700">${lyr.n1_60}</td>
            <td class="p-2 border-r border-gray-200 dark:border-gray-700">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${soilBadgeClass}">${lyr.soil_group}</span>
                ${extrapBadge}
            </td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 text-gray-500">${lyr.sucs || "-"}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.gamma.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.sigma_v.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.n60.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.phi_deg.toFixed(1)}°</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 font-mono">${kpTanPhiStr}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 text-gray-500 font-mono">${betaRawStr}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 font-bold bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300 font-mono">${betaFhwaStr}</td>
            <td class="p-2 text-center font-bold text-amber-700 dark:text-amber-300 border-r border-gray-200 dark:border-gray-700">${lyr.qs.toFixed(1)}</td>
            <td class="p-2 text-center font-bold text-purple-700 dark:text-purple-300 border-r border-gray-200 dark:border-gray-700">${lyr.qp.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${rsVal.toFixed(0)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${rnVal.toFixed(0)}</td>
            <td class="p-2 text-center font-bold text-blue-700 dark:text-blue-300 border-r border-gray-200 dark:border-gray-700">${radmVal}</td>
            <td class="p-2 text-center font-bold text-purple-700 dark:text-purple-300">${radmDifVal}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSoundingCharts() {
    if (!analysisResult) return;
    const sData = analysisResult.soundings?.[activeSoundingName];
    if (!sData) return;

    const layers = sData.layers || [];
    const depths = layers.map(l => l.z_fim);
    const n1 = layers.map(l => l.n1_60);
    const n60 = layers.map(l => l.n60);
    const phi = layers.map(l => l.phi_deg);
    const qs = layers.map(l => l.qs);
    const qp = layers.map(l => l.qp);
    const sigV = layers.map(l => l.sigma_v);

    // Atualiza pills de resumo rápido nos cabeçalhos dos gráficos
    const maxDepthVal = depths.length > 0 ? Math.max(...depths) : 0;
    const maxN1 = n1.length > 0 ? Math.max(...n1) : 0;
    const maxN60 = n60.length > 0 ? Math.max(...n60) : 0;
    const maxPhi = phi.length > 0 ? Math.max(...phi) : 0;
    const maxQs = qs.length > 0 ? Math.max(...qs) : 0;
    const maxQp = qp.length > 0 ? Math.max(...qp) : 0;
    const maxSigV = sigV.length > 0 ? Math.max(...sigV) : 0;

    const pDepth = document.getElementById("pill-strat-depth");
    if (pDepth) pDepth.innerText = `Prof. máx: ${maxDepthVal.toFixed(1)} m`;
    const pN1 = document.getElementById("pill-strat-n1");
    if (pN1) pN1.innerText = `N₁₍₆₀₎ máx: ${maxN1}`;
    const pN60 = document.getElementById("pill-strat-n60");
    if (pN60) pN60.innerText = `N₆₀ máx: ${maxN60.toFixed(1)}`;
    const pPhi = document.getElementById("pill-strat-phi");
    if (pPhi) pPhi.innerText = `φ' máx: ${maxPhi.toFixed(1)}°`;

    const pQs = document.getElementById("pill-strength-qs");
    if (pQs) pQs.innerText = `qₛ máx: ${maxQs.toFixed(1)} kPa`;
    const pQp = document.getElementById("pill-strength-qp");
    if (pQp) pQp.innerText = `qₚ máx: ${Math.round(maxQp).toLocaleString('pt-BR')} kPa`;
    const pSigv = document.getElementById("pill-strength-sigv");
    if (pSigv) pSigv.innerText = `σ'ᵥ máx: ${Math.round(maxSigV).toLocaleString('pt-BR')} kPa`;

    // 1. Chart Stratigraphy (N1_60, N60, phi')
    const ctxStrat = document.getElementById("chart-sounding-stratigraphy");
    if (ctxStrat) {
        if (chartStratigraphyInst) chartStratigraphyInst.destroy();

        chartStratigraphyInst = new Chart(ctxStrat, {
            type: "line",
            data: {
                datasets: [
                    {
                        label: "N1_60 (Original)",
                        data: depths.map((d, i) => ({ x: n1[i], y: d })),
                        borderColor: PALETTE.blue,
                        borderWidth: 2,
                        pointRadius: 1,
                        tension: 0.1
                    },
                    {
                        label: "N60 (Corrigido σ'v)",
                        data: depths.map((d, i) => ({ x: n60[i], y: d })),
                        borderColor: PALETTE.emerald,
                        borderWidth: 2,
                        pointRadius: 1,
                        tension: 0.1
                    },
                    {
                        label: "Ângulo φ' (°)",
                        data: depths.map((d, i) => ({ x: phi[i], y: d })),
                        borderColor: PALETTE.amber,
                        borderWidth: 2,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        mode: "index",
                        intersect: false,
                        callbacks: {
                            title: (items) => `Profundidade: ${items[0]?.parsed?.y !== undefined ? items[0].parsed.y.toFixed(1) : ''} m`,
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.x !== undefined ? item.parsed.x.toFixed(1) : item.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Golpes N_SPT / Ângulo φ' (°)", font: { weight: "bold", size: 11 } },
                        grid: { color: "rgba(156, 163, 175, 0.15)" }
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Profundidade (m)", font: { weight: "bold", size: 12 } },
                        ticks: {
                            stepSize: 10,
                            callback: (val) => `${val} m`,
                            font: { size: 11, weight: "600" }
                        },
                        grid: { color: "rgba(156, 163, 175, 0.20)" }
                    }
                }
            }
        });
    }

    // 2. Chart Strengths (qs, qp, sigma_v)
    const ctxStrength = document.getElementById("chart-sounding-strengths");
    if (ctxStrength) {
        if (chartStrengthsInst) chartStrengthsInst.destroy();

        chartStrengthsInst = new Chart(ctxStrength, {
            type: "line",
            data: {
                datasets: [
                    {
                        label: "qs - Atrito Lateral (kPa)",
                        data: depths.map((d, i) => ({ x: qs[i], y: d })),
                        borderColor: PALETTE.amber,
                        borderWidth: 2.2,
                        pointRadius: 0,
                        tension: 0.1
                    },
                    {
                        label: "qp - Ponta Unitária (kPa)",
                        data: depths.map((d, i) => ({ x: qp[i], y: d })),
                        borderColor: PALETTE.purple,
                        borderWidth: 2.2,
                        pointRadius: 0,
                        tension: 0.1
                    },
                    {
                        label: "σ'v - Tensão Efetiva (kPa)",
                        data: depths.map((d, i) => ({ x: sigV[i], y: d })),
                        borderColor: PALETTE.slate,
                        borderWidth: 1.5,
                        borderDash: [5, 5],
                        pointRadius: 0,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        mode: "index",
                        intersect: false,
                        callbacks: {
                            title: (items) => `Profundidade: ${items[0]?.parsed?.y !== undefined ? items[0].parsed.y.toFixed(1) : ''} m`,
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.x !== undefined ? Math.round(item.parsed.x).toLocaleString('pt-BR') : item.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Tensão / Resistência Unitária (kPa)", font: { weight: "bold", size: 11 } },
                        grid: { color: "rgba(156, 163, 175, 0.15)" }
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Profundidade (m)", font: { weight: "bold", size: 12 } },
                        ticks: {
                            stepSize: 10,
                            callback: (val) => `${val} m`,
                            font: { size: 11, weight: "600" }
                        },
                        grid: { color: "rgba(156, 163, 175, 0.20)" }
                    }
                }
            }
        });
    }

    // 3. Chart 3: Sounding Capacity Radm(z) for active borehole
    const ctxCap = document.getElementById("chart-sounding-capacity");
    if (ctxCap) {
        if (chartSoundingCapacityInst) chartSoundingCapacityInst.destroy();

        const p48 = sData.capacities?.["pile_48in"];
        const p54 = sData.capacities?.["pile_54in"];
        const p60 = sData.capacities?.["pile_60in"];

        const maxRadm48 = p48?.max_radm || (p48?.radm?.length ? Math.max(...p48.radm) : 0);
        const maxRadm54 = p54?.max_radm || (p54?.radm?.length ? Math.max(...p54.radm) : 0);
        const maxRadm60 = p60?.max_radm || (p60?.radm?.length ? Math.max(...p60.radm) : 0);

        const pill48 = document.getElementById("pill-cap-p48");
        if (pill48) pill48.innerText = `1.2m máx: ${Math.round(maxRadm48).toLocaleString('pt-BR')} kN`;
        const pill54 = document.getElementById("pill-cap-p54");
        if (pill54) pill54.innerText = `1.3m máx: ${Math.round(maxRadm54).toLocaleString('pt-BR')} kN`;
        const pill60 = document.getElementById("pill-cap-p60");
        if (pill60) pill60.innerText = `1.5m máx: ${Math.round(maxRadm60).toLocaleString('pt-BR')} kN`;

        const datasetsCap = [];
        if (p48 && p48.depths && p48.radm) {
            datasetsCap.push({
                label: "Ø 1.2 m (48\")",
                data: p48.depths.map((d, i) => ({ x: p48.radm[i], y: d })),
                borderColor: PALETTE.blue,
                borderWidth: 2.2,
                pointRadius: 0,
                tension: 0.1
            });
        }
        if (p54 && p54.depths && p54.radm) {
            datasetsCap.push({
                label: "Ø 1.3 m (54\")",
                data: p54.depths.map((d, i) => ({ x: p54.radm[i], y: d })),
                borderColor: PALETTE.emerald,
                borderWidth: 2.2,
                pointRadius: 0,
                tension: 0.1
            });
        }
        if (p60 && p60.depths && p60.radm) {
            datasetsCap.push({
                label: "Ø 1.5 m (60\")",
                data: p60.depths.map((d, i) => ({ x: p60.radm[i], y: d })),
                borderColor: PALETTE.amber,
                borderWidth: 2.2,
                pointRadius: 0,
                tension: 0.1
            });
        }

        const targetKn = projectData.target_load_kn || 10000;
        const maxDepthProfile = depths.length > 0 ? Math.max(...depths) : 60;
        datasetsCap.push({
            label: `Carga Alvo (${Math.round(targetKn).toLocaleString('pt-BR')} kN)`,
            data: [{ x: targetKn, y: 0 }, { x: targetKn, y: maxDepthProfile }],
            borderColor: PALETTE.rose,
            borderWidth: 1.8,
            borderDash: [6, 4],
            pointRadius: 0
        });

        chartSoundingCapacityInst = new Chart(ctxCap, {
            type: "line",
            data: { datasets: datasetsCap },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    tooltip: {
                        mode: "index",
                        intersect: false,
                        callbacks: {
                            title: (items) => `Profundidade: ${items[0]?.parsed?.y !== undefined ? items[0].parsed.y.toFixed(1) : ''} m`,
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.x !== undefined ? Math.round(item.parsed.x).toLocaleString('pt-BR') + ' kN' : item.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Capacidade Admissível Radm (kN)", font: { weight: "bold", size: 11 } },
                        grid: { color: "rgba(156, 163, 175, 0.15)" }
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Profundidade (m)", font: { weight: "bold", size: 12 } },
                        ticks: {
                            stepSize: 10,
                            callback: (val) => `${val} m`,
                            font: { size: 11, weight: "600" }
                        },
                        grid: { color: "rgba(156, 163, 175, 0.20)" }
                    }
                }
            }
        });
    }
}

// Funções de Controle de Layout e Altura dos Gráficos Geotécnicos
function setSoundingChartsLayout(mode) {
    const grid = document.getElementById("sounding-charts-grid");
    const cardCap = document.getElementById("card-sounding-capacity");
    const btn2Col = document.getElementById("btn-layout-2col");
    const btn3Col = document.getElementById("btn-layout-3col");
    const btn1Col = document.getElementById("btn-layout-1col");
    if (!grid) return;

    const activeBtnClass = "px-2.5 py-1 text-xs font-bold rounded-lg border border-blue-600 bg-blue-600 text-white shadow-xs transition-all";
    const inactiveBtnClass = "px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all";

    if (mode === "1col") {
        grid.className = "grid grid-cols-1 gap-6";
        if (cardCap) cardCap.classList.remove("hidden");
        if (btn1Col) btn1Col.className = activeBtnClass;
        if (btn2Col) btn2Col.className = inactiveBtnClass;
        if (btn3Col) btn3Col.className = inactiveBtnClass;
    } else if (mode === "3col") {
        grid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";
        if (cardCap) cardCap.classList.remove("hidden");
        if (btn3Col) btn3Col.className = activeBtnClass;
        if (btn2Col) btn2Col.className = inactiveBtnClass;
        if (btn1Col) btn1Col.className = inactiveBtnClass;
    } else {
        // Modo Padrão: 2 colunas
        grid.className = "grid grid-cols-1 lg:grid-cols-2 gap-6";
        if (cardCap) cardCap.classList.add("hidden");
        if (btn2Col) btn2Col.className = activeBtnClass;
        if (btn3Col) btn3Col.className = inactiveBtnClass;
        if (btn1Col) btn1Col.className = inactiveBtnClass;
    }

    setTimeout(() => {
        if (chartStratigraphyInst) chartStratigraphyInst.resize();
        if (chartStrengthsInst) chartStrengthsInst.resize();
        if (chartSoundingCapacityInst) chartSoundingCapacityInst.resize();
    }, 100);
}

function setSoundingChartsHeight(heightPx) {
    const c1 = document.getElementById("chart-wrap-stratigraphy");
    const c2 = document.getElementById("chart-wrap-strengths");
    const c3 = document.getElementById("chart-wrap-capacity");
    if (c1) {
        c1.style.height = `${heightPx}px`;
        c1.style.minHeight = `${heightPx}px`;
    }
    if (c2) {
        c2.style.height = `${heightPx}px`;
        c2.style.minHeight = `${heightPx}px`;
    }
    if (c3) {
        c3.style.height = `${heightPx}px`;
        c3.style.minHeight = `${heightPx}px`;
    }

    const heights = [600, 750, 900];
    heights.forEach(h => {
        const btn = document.getElementById(`btn-height-${h}`);
        if (btn) {
            if (h === heightPx) {
                btn.className = "px-2.5 py-1 text-xs font-bold rounded-lg border border-blue-600 bg-blue-600 text-white shadow-xs transition-all";
            } else {
                btn.className = "px-2 py-1 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all";
            }
        }
    });

    setTimeout(() => {
        if (chartStratigraphyInst) chartStratigraphyInst.resize();
        if (chartStrengthsInst) chartStrengthsInst.resize();
        if (chartSoundingCapacityInst) chartSoundingCapacityInst.resize();
    }, 100);
}

// EXPORTAÇÃO E CÓPIA DE GRÁFICOS COM FUNDO TRANSPARENTE
async function copyChartToClipboardTransparent(canvasId, btn) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        showToast("Gráfico não encontrado.", "error");
        return;
    }

    try {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                showToast("Erro ao processar imagem transparente.", "error");
                return;
            }

            try {
                if (navigator.clipboard && window.ClipboardItem) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ "image/png": blob })
                    ]);
                    showToast("Gráfico copiado com fundo transparente! Pronto para colar (Ctrl+V).", "success");
                    if (btn) {
                        const originalHtml = btn.innerHTML;
                        btn.innerHTML = `<span>✓</span> Copiado!`;
                        btn.classList.add("bg-emerald-600", "text-white", "border-emerald-600");
                        setTimeout(() => {
                            btn.innerHTML = originalHtml;
                            btn.classList.remove("bg-emerald-600", "text-white", "border-emerald-600");
                        }, 2000);
                    }
                } else {
                    downloadChartTransparent(canvasId, `${canvasId}_transparente.png`);
                    showToast("Área de transferência restrita. Arquivo PNG transparente baixado automaticamente!", "info");
                }
            } catch (err) {
                console.warn("Clipboard API falhou, acionando download:", err);
                downloadChartTransparent(canvasId, `${canvasId}_transparente.png`);
                showToast("Imagem PNG transparente baixada com sucesso!", "info");
            }
        }, "image/png");
    } catch (e) {
        console.error("Erro ao exportar gráfico transparente:", e);
        showToast("Falha ao exportar gráfico.", "error");
    }
}

function downloadChartTransparent(canvasId, customName) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    try {
        const link = document.createElement("a");
        link.download = customName || `${canvasId}_transparente.png`;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Download do PNG transparente concluído!", "success");
    } catch (e) {
        console.error("Erro no download transparente:", e);
        showToast("Erro ao baixar PNG.", "error");
    }
}

function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bgColors = {
        success: "bg-emerald-600 text-white border-emerald-700 shadow-emerald-500/20",
        error: "bg-rose-600 text-white border-rose-700 shadow-rose-500/20",
        info: "bg-blue-600 text-white border-blue-700 shadow-blue-500/20",
        warning: "bg-amber-600 text-white border-amber-700 shadow-amber-500/20"
    };
    const icons = {
        success: "✓",
        error: "✕",
        info: "ℹ",
        warning: "⚠"
    };

    toast.className = `flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold border pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `<span class="text-sm font-bold">${icons[type] || "ℹ"}</span> <span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
        toast.classList.add("translate-y-0", "opacity-100");
    });

    setTimeout(() => {
        toast.classList.remove("translate-y-0", "opacity-100");
        toast.classList.add("translate-y-2", "opacity-0");
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3500);
}

// RENDER TABELAS DA ABA 4 (PARÂMETROS E GEOMETRIA)
function renderSoilGroupsTable() {
    const tbody = document.getElementById("soil-groups-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    for (const [grp, p] of Object.entries(projectData.soil_groups || {})) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="p-2 font-bold text-gray-800 dark:text-gray-200">${grp}</td>
            <td class="p-2 text-center font-mono">
                <input type="number" step="0.5" value="${p.gamma_dry}" onchange="updateSoilWeight('${grp}', 'gamma_dry', this.value)" class="w-16 px-1.5 py-0.5 text-center text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
            </td>
            <td class="p-2 text-center font-mono">
                <input type="number" step="0.5" value="${p.gamma_sub}" onchange="updateSoilWeight('${grp}', 'gamma_sub', this.value)" class="w-16 px-1.5 py-0.5 text-center text-xs rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
            </td>
        `;
        tbody.appendChild(tr);
    }
}

function updateSoilWeight(grp, prop, val) {
    if (projectData.soil_groups?.[grp]) {
        projectData.soil_groups[grp][prop] = parseFloat(val);
        triggerCalculation();
    }
}

function renderPilesTable() {
    const tbody = document.getElementById("piles-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";
    (projectData.piles || []).forEach((p, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="p-2.5 font-bold text-gray-800 dark:text-gray-200">${p.name}</td>
            <td class="p-2.5 text-center font-mono">${p.diam_in}"</td>
            <td class="p-2.5 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                <div class="flex items-center justify-center gap-1">
                    <input type="number" step="0.05" min="0.4" max="3.0" value="${p.diam_m.toFixed(2)}" onchange="syncPileDiameter(${idx}, this.value)" class="w-20 px-1.5 py-1 text-center font-mono font-bold text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 shadow-xs" title="Editar diâmetro da estaca">
                    <span class="text-xs text-gray-500">m</span>
                </div>
            </td>
            <td class="p-2.5 text-center font-mono">${p.perimeter_m.toFixed(2)} m</td>
            <td class="p-2.5 text-center font-mono">${p.area_m2.toFixed(2)} m²</td>
        `;
        tbody.appendChild(tr);
    });
}

// AÇÕES DE EIXO
function addNewAxis() {
    const name = prompt("Nome do novo eixo de fundação (ex: F):", "F");
    if (!name) return;
    const cotaStr = prompt(`Cota de início/arrasamento para o Eixo ${name} (em metros):`, "10.0");
    if (!cotaStr) return;
    const cota = parseFloat(cotaStr);
    if (isNaN(cota)) return;

    projectData.axes.push({
        name: name.trim().toUpperCase(),
        cota_inicio_m: cota,
        target_load_kN: projectData.target_load_kN
    });
    triggerCalculation();
}

function editAxis(idx) {
    const ax = projectData.axes[idx];
    if (!ax) return;
    const newCota = prompt(`Editar Cota de início do Eixo ${ax.name} (m):`, ax.cota_inicio_m);
    if (newCota === null) return;
    const cVal = parseFloat(newCota);
    if (!isNaN(cVal)) {
        ax.cota_inicio_m = cVal;
        triggerCalculation();
    }
}

function deleteAxis(idx) {
    if (projectData.axes.length <= 1) {
        alert("É necessário manter ao menos um eixo de fundação.");
        return;
    }
    if (confirm(`Deseja remover o Eixo ${projectData.axes[idx].name}?`)) {
        projectData.axes.splice(idx, 1);
        triggerCalculation();
    }
}

// AÇÕES DE CAMADAS
function addNewLayer() {
    const layers = projectData.soundings?.[activeSoundingName];
    if (!layers) return;
    const lastLyr = layers[layers.length - 1];
    const zIni = lastLyr ? lastLyr.z_fim : 0;
    const zFim = zIni + 0.6;
    const nVal = lastLyr ? lastLyr.n1_60 : 30;
    const grp = lastLyr ? lastLyr.soil_group : "Areias";

    layers.push({
        z_ini: Math.round(zIni * 10) / 10,
        z_fim: Math.round(zFim * 10) / 10,
        n1_60: nVal,
        soil_group: grp,
        sucs: "SP-SM"
    });
    triggerCalculation();
}

function resetActiveSounding() {
    if (confirm(`Restaurar a sondagem ${activeSoundingName} para os dados originais da planilha?`)) {
        loadReferenceData();
    }
}

// EXPORTAÇÃO EXCEL
function exportAnalysisToExcel() {
    if (!analysisResult) {
        alert("Execute o cálculo antes de exportar.");
        return;
    }

    if (typeof eel !== "undefined" && eel.export_capacidade_estaca_excel) {
        eel.export_capacidade_estaca_excel(analysisResult)((res) => {
            if (res && res.success) {
                alert(`Planilha Excel gerada com sucesso!\nSalva em: ${res.filepath}`);
            } else {
                alert("Erro ao exportar Excel via Eel: " + (res?.error || "Desconhecido"));
            }
        });
    } else {
        alert("A exportação direta para arquivo físico Excel requer execução com o backend Python ativo.\nUse 'python run_capacidade_estaca.py --export' no terminal para gerar a planilha.");
    }
}

function extrapolateSoundingLayersJS(layers, sName) {
    if (sName !== "SPT-01" && !sName.includes("SPT-01")) return layers;
    const measuredDepth = projectData.spt01_measured_depth_m ?? 44.4;
    const maxDepth = projectData.extrapolation_max_depth_m ?? 132.6;
    const targetPercentile = projectData.extrapolation_n_percentile ?? 15.0;
    const forcedSoil = projectData.extrapolation_soil_group;

    const realLayers = layers.filter(l => l.z_fim <= measuredDepth + 1e-4);
    if (realLayers.length === 0) return layers;

    // Determina solo modal e percentil de N
    const grpCounts = {};
    const nList = [];
    realLayers.forEach(l => {
        const grp = l.soil_group || "Areias";
        grpCounts[grp] = (grpCounts[grp] || 0) + 1;
        nList.push(l.n1_60);
    });

    let modalSoil = forcedSoil || "Areias";
    if (!forcedSoil) {
        let maxC = 0;
        for (const [g, c] of Object.entries(grpCounts)) {
            if (c > maxC) { maxC = c; modalSoil = g; }
        }
    }

    nList.sort((a, b) => a - b);
    let pIdx = Math.floor((targetPercentile / 100.0) * nList.length);
    pIdx = Math.max(0, Math.min(nList.length - 1, pIdx));
    const nSynth = Math.max(1, Math.round(nList[pIdx]));

    const result = realLayers.map(l => ({ ...l, is_extrapolated: false }));
    let lastZ = realLayers[realLayers.length - 1].z_fim;

    while (lastZ < maxDepth - 1e-4) {
        const nextZ = Math.round((lastZ + 0.6) * 100) / 100;
        result.push({
            z_ini: lastZ,
            z_fim: nextZ,
            dz: 0.6,
            n1_60: nSynth,
            soil_group: modalSoil,
            sucs: (modalSoil === "Areias") ? "SP-SM" : "CL",
            is_extrapolated: true
        });
        lastZ = nextZ;
    }
    return result;
}

// CÁLCULO CLIENT-SIDE EM CASO DE AUSÊNCIA DO BACKEND
function runClientSideCalculation() {
    const wt = projectData.water_table_m;
    const fsGlobal = projectData.fs_global ?? projectData.fs ?? 2.0;
    const fsLateral = projectData.fs_lateral ?? 1.5;
    const fsPonta = projectData.fs_ponta ?? 3.0;
    const applyBetaFhwa = projectData.apply_beta_fhwa_limit ?? true;
    const shallowStressLimit = projectData.beta_shallow_stress_limit_kpa ?? 43.1;
    const capKp = projectData.beta_cap_kp_tan_phi ?? true;

    const targetLoad = projectData.target_load_kN;
    const sGroups = projectData.soil_groups;
    const soundings = projectData.soundings;

    // Normaliza geometria de estacas
    const piles = (projectData.piles || []).map((p, idx) => {
        const d = p.diam_m || 1.20;
        const dIn = Math.round(d / 0.0254);
        const perim = Math.floor(Math.PI * d * 100) / 100;
        const area = Math.floor(Math.PI * Math.pow(d / 2, 2) * 100) / 100;
        return {
            id: p.id || `pile_${dIn}in`,
            name: `Estaca D=${d.toFixed(2)}m (${dIn}")`,
            diam_in: dIn,
            diam_m: d,
            perimeter_m: perim,
            area_m2: area
        };
    });

    const analyzedSoundings = {};
    const summaryTable = [];

    for (const [sName, rawLayersInput] of Object.entries(soundings)) {
        const rawLayers = extrapolateSoundingLayersJS(rawLayersInput, sName);
        const procLayers = [];
        let sigmaVPrev = 0;

        rawLayers.forEach((lyr, idx) => {
            const zIni = lyr.z_ini;
            const zFim = lyr.z_fim;
            const dz = zFim - zIni;
            const n1 = Math.max(1, lyr.n1_60);
            const grp = lyr.soil_group || "Areias";
            const grpParam = sGroups[grp] || { gamma_dry: 18.5, gamma_sub: 8.5 };
            const gamma = (zIni < wt) ? grpParam.gamma_dry : grpParam.gamma_sub;

            let sigmaV = 0;
            if (idx === 0) {
                sigmaV = (dz / 2) * gamma;
            } else {
                const prev = procLayers[idx - 1];
                sigmaV = sigmaVPrev + (prev.dz / 2) * prev.gamma + (dz / 2) * gamma;
            }
            sigmaVPrev = sigmaV;

            const pa = projectData.pa_kpa ?? 101.3;
            const cn = Math.min(projectData.cn_max ?? 2.0, Math.sqrt(pa / Math.max(sigmaV, 0.1)));
            const n60 = n1 / Math.max(cn, 0.01);
            const phiDeg = 27.5 + 9.2 * Math.log10(n1);
            const phiRad = (phiDeg * Math.PI) / 180;
            const sinPhi = Math.sin(phiRad);
            const tanPhi = Math.tan(phiRad);

            // FHWA GEC 010 Eq. 10-13: Rankine Kp and capping
            const kpRankine = (1 + sinPhi) / Math.max(1 - sinPhi, 0.001);
            const kpTanPhi = kpRankine * tanPhi;

            const sigmaP = (grp === "Areias") ? (pa * 0.47 * Math.pow(n60, 0.8)) : (pa * 0.15 * n60);
            const ocrRaw = Math.max(sigmaP / Math.max(sigmaV, 0.01), 0.01);
            const betaRaw = (1 - sinPhi) * Math.pow(ocrRaw, sinPhi) * tanPhi;

            // Shallow depth effective vertical stress limitation (900 psf = 43.1 kPa)
            const sigVEff = (applyBetaFhwa && sigmaV < shallowStressLimit) ? shallowStressLimit : sigmaV;
            const ocrAdopted = Math.max(sigmaP / Math.max(sigVEff, 0.01), 0.01);
            let betaAdopted = (1 - sinPhi) * Math.pow(ocrAdopted, sinPhi) * tanPhi;
            if (capKp && betaAdopted > kpTanPhi) {
                betaAdopted = kpTanPhi;
            }

            const qs = betaAdopted * sigmaV;
            const qp = (projectData.kp_base ?? 0.59) * Math.pow((n60 * pa) / Math.max(sigmaV, 0.01), 0.8) * sigmaV;

            procLayers.push({
                index: idx,
                z_ini: zIni,
                z_fim: zFim,
                dz: dz,
                n1_60: n1,
                soil_group: grp,
                sucs: lyr.sucs || "",
                gamma: gamma,
                sigma_v: sigmaV,
                cn: cn,
                n60: n60,
                phi_deg: phiDeg,
                sigma_p: sigmaP,
                kp_rankine: kpRankine,
                kp_tan_phi: kpTanPhi,
                beta_raw: betaRaw,
                beta: betaAdopted,
                qs: qs,
                qp: qp,
                is_extrapolated: !!lyr.is_extrapolated
            });
        });

        // Capacidades por estaca
        const capResults = {};
        const casingPct = projectData.casing_reduction_pct ?? 10.0;
        const casingFactor = 1.0 - (casingPct / 100.0);
        const casingMode = projectData.casing_reduction_mode || "excel_formula";

        piles.forEach(p => {
            const perim = p.perimeter_m;
            const area = p.area_m2;
            let sumRs = 0;
            let maxRn = 0;
            let maxRadmGlob = 0;
            let maxRadmDif = 0;
            let depthAtMax = 0;
            let depthForTargetGlob = null;
            let depthForTargetDif = null;

            const depths = [];
            const rsSegments = [];
            const rsCum = [];
            const rpList = [];
            const rnList = [];
            const radmList = [];
            const radmDifList = [];

            procLayers.forEach(l => {
                const rsSeg = l.qs * perim * l.dz;
                sumRs += rsSeg;
                const rp = l.qp * area;
                const rn = rp + sumRs;

                let radmGlob = 0;
                let radmDif = 0;

                if (casingMode === "excel_formula") {
                    radmGlob = Math.floor(rn / fsGlobal) * casingFactor;
                    radmDif = Math.floor((sumRs / fsLateral) + (rp / fsPonta)) * casingFactor;
                } else {
                    radmGlob = Math.floor((rp + sumRs * casingFactor) / fsGlobal);
                    radmDif = Math.floor(((sumRs * casingFactor) / fsLateral) + (rp / fsPonta));
                }

                if (rn > maxRn) {
                    maxRn = rn;
                    maxRadmGlob = radmGlob;
                    maxRadmDif = radmDif;
                    depthAtMax = l.z_fim;
                }
                if (depthForTargetGlob === null && radmGlob >= targetLoad) {
                    depthForTargetGlob = l.z_fim;
                }
                if (depthForTargetDif === null && radmDif >= targetLoad) {
                    depthForTargetDif = l.z_fim;
                }

                depths.push(l.z_fim);
                rsSegments.push(rsSeg);
                rsCum.push(sumRs);
                rpList.push(rp);
                rnList.push(rn);
                radmList.push(radmGlob);
                radmDifList.push(radmDif);
            });

            capResults[p.id] = {
                id: p.id,
                name: p.name,
                diam_m: p.diam_m,
                depths: depths,
                rs_segment: rsSegments,
                rs_cumulative: rsCum,
                rp: rpList,
                rn: rnList,
                radm: radmList,
                radm_dif: radmDifList,
                max_rn: maxRn,
                max_radm: maxRadmGlob,
                max_radm_dif: maxRadmDif,
                depth_at_max: depthAtMax,
                depth_for_target: depthForTargetGlob,
                depth_for_target_dif: depthForTargetDif,
                reached_target: (depthForTargetGlob !== null),
                reached_target_dif: (depthForTargetDif !== null)
            };
        });

        analyzedSoundings[sName] = {
            name: sName,
            layers: procLayers,
            capacities: capResults
        };

        const row = { sounding_name: sName, piles: {} };
        for (const [pid, pdata] of Object.entries(capResults)) {
            row.piles[pid] = {
                diam_m: pdata.diam_m,
                max_rn_kN: pdata.max_rn,
                max_radm_kN: pdata.max_radm,
                max_radm_dif_kN: pdata.max_radm_dif,
                depth_at_max_m: pdata.depth_at_max,
                depth_for_target_m: pdata.depth_for_target ?? "N/A",
                depth_for_target_dif_m: pdata.depth_for_target_dif ?? "N/A"
            };
        }
        summaryTable.push(row);
    }

    // Análise por Eixo (Passo a passo com redução por camisa metálica)
    const critName = projectData.critical_sounding || "SPT-01";
    const critData = analyzedSoundings[critName] || Object.values(analyzedSoundings)[0];
    const critLayers = critData?.layers || [];
    const axesResults = [];

    const casingPct = projectData.casing_reduction_pct ?? 10.0;
    const casingFactor = 1.0 - (casingPct / 100.0);
    const casingMode = projectData.casing_reduction_mode || "excel_formula";

    (projectData.axes || []).forEach(ax => {
        const cotaTopo = (ax.cota_topo_m !== undefined) ? ax.cota_topo_m : ax.cota_inicio_m;
        const pTarget = ax.target_load_kN || targetLoad;
        const casingLen = (ax.casing_length_m !== undefined && ax.casing_length_m !== null) ? ax.casing_length_m : projectData.casing_length_m;
        const axInfo = {
            name: ax.name,
            cota_topo_m: cotaTopo,
            cota_inicio_m: cotaTopo,
            target_load_kN: pTarget,
            casing_length_m: casingLen,
            piles: {}
        };

        const firstProf = Math.ceil(cotaTopo / 0.6) * 0.6;
        const maxLayersZ = critLayers.length > 0 ? critLayers[critLayers.length - 1].z_fim : 132.6;
        const maxSteps = Math.max(1, Math.floor((maxLayersZ - firstProf) / 0.6) + 1);

        piles.forEach(p => {
            let depthFundoGlob = null;
            let depthFundoDif = null;
            let maxRadmGlob = 0;
            let maxRadmDif = 0;

            for (let k = 0; k < maxSteps; k++) {
                const z = Math.round((firstProf + k * 0.6) * 100) / 100;
                let sumRs = 0;
                let qpAtTip = 0;

                critLayers.forEach(l => {
                    if (l.z_ini >= z) return;
                    if (l.z_fim <= cotaTopo) return;

                    const effZIni = Math.max(l.z_ini, cotaTopo);
                    const effZFim = Math.min(l.z_fim, z);
                    const effDz = effZFim - effZIni;

                    if (effDz > 0) {
                        if (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0) {
                            const casingEnd = cotaTopo + casingLen;
                            const casedDz = Math.max(0, Math.min(effZFim, casingEnd) - effZIni);
                            const uncasedDz = Math.max(0, effDz - casedDz);
                            sumRs += l.qs * p.perimeter_m * (casedDz * casingFactor + uncasedDz * 1.0);
                        } else {
                            if (casingMode === "lateral_only") {
                                sumRs += l.qs * p.perimeter_m * effDz * casingFactor;
                            } else {
                                sumRs += l.qs * p.perimeter_m * effDz;
                            }
                        }
                    }
                    if (l.z_ini < z && z <= l.z_fim) {
                        qpAtTip = l.qp;
                    }
                });

                if (qpAtTip === 0 && critLayers.length > 0) {
                    qpAtTip = critLayers[critLayers.length - 1].qp;
                }

                const rp = qpAtTip * p.area_m2;
                let radmGlob = 0;
                let radmDif = 0;

                if (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0) {
                    radmGlob = Math.floor((rp + sumRs) / fsGlobal);
                    radmDif = Math.floor((sumRs / fsLateral) + (rp / fsPonta));
                } else {
                    if (casingMode === "excel_formula") {
                        radmGlob = Math.floor((rp + sumRs) / fsGlobal) * casingFactor;
                        radmDif = Math.floor((sumRs / fsLateral) + (rp / fsPonta)) * casingFactor;
                    } else {
                        radmGlob = Math.floor((rp + sumRs * casingFactor) / fsGlobal);
                        radmDif = Math.floor(((sumRs * casingFactor) / fsLateral) + (rp / fsPonta));
                    }
                }

                if (radmGlob > maxRadmGlob) maxRadmGlob = radmGlob;
                if (radmDif > maxRadmDif) maxRadmDif = radmDif;

                if (depthFundoGlob === null && radmGlob >= pTarget) {
                    depthFundoGlob = z;
                }
                if (depthFundoDif === null && radmDif >= pTarget) {
                    depthFundoDif = z;
                }

                if (depthFundoGlob !== null && depthFundoDif !== null) {
                    break;
                }
            }

            const embutimentoGlob = (depthFundoGlob !== null) ? Math.round((depthFundoGlob - cotaTopo) * 100) / 100 : null;
            const embutimentoDif = (depthFundoDif !== null) ? Math.round((depthFundoDif - cotaTopo) * 100) / 100 : null;

            axInfo.piles[p.id] = {
                name: p.name,
                diam_m: p.diam_m,
                cota_fundo_m: depthFundoGlob ?? "N/A",
                embutimento_m: embutimentoGlob ?? "N/A",
                cota_fundo_global_m: depthFundoGlob ?? "N/A",
                embutimento_global_m: embutimentoGlob ?? "N/A",
                cota_fundo_dif_m: depthFundoDif ?? "N/A",
                embutimento_dif_m: embutimentoDif ?? "N/A",
                comprimento_util_m: embutimentoGlob ?? "N/A",
                reached_target_global: (depthFundoGlob !== null),
                reached_target_dif: (depthFundoDif !== null),
                max_radm: maxRadmGlob,
                max_radm_dif: maxRadmDif
            };
        });

        axesResults.push(axInfo);
    });

    const minInfo = detectMinSoundingDepth();
    let localEst = analysisResult?.extrapolation_estimates;
    if (!localEst) {
        const baseSName = (critName in soundings) ? critName : minInfo.minSounding;
        const sLayers = soundings[baseSName] || [];
        const baseD = projectData.base_depth_m ?? projectData.spt01_measured_depth_m ?? minInfo.minDepth;
        const measuredL = sLayers.filter(l => !l.is_extrapolated && (parseFloat(l.z_fim) <= baseD + 0.01));
        const grps = measuredL.map(l => l.soil_group).filter(Boolean);
        const counts = {};
        grps.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
        let modalG = "Areias";
        let modalC = 0;
        for (const [g, c] of Object.entries(counts)) {
            if (c > modalC) { modalC = c; modalG = g; }
        }
        const modalP = grps.length > 0 ? Math.round((modalC / grps.length) * 1000) / 10 : 0;
        const adoptedG = (projectData.extrapolation_soil_group && projectData.extrapolation_soil_group !== "auto") ? projectData.extrapolation_soil_group : modalG;
        const nVals = measuredL.map(l => parseFloat(l.n1_60) || 10).sort((a, b) => a - b);
        const pIdx = Math.max(0, Math.min(nVals.length - 1, Math.floor(nVals.length * ((projectData.extrapolation_n_percentile ?? 15) / 100))));
        const nEst = nVals.length > 0 ? Math.round(nVals[pIdx]) : 27;
        const phiEst = Math.round((27.5 + 9.2 * Math.log10(Math.max(1, nEst))) * 10) / 10;
        const maxD = projectData.extrapolation_max_depth_m ?? 132.6;
        const numL = Math.max(0, Math.round((maxD - baseD) / 0.6));

        localEst = {
            base_depth_m: baseD,
            max_depth_m: maxD,
            extrapolated_length_m: Math.max(0, maxD - baseD),
            num_extrapolated_layers: numL,
            modal_soil_group: modalG,
            modal_soil_count: modalC,
            total_measured_layers: grps.length,
            modal_soil_pct: modalP,
            modal_sucs: (modalG === "Gravas" ? "GW-GM" : "SP-SM"),
            adopted_soil_group: adoptedG,
            n_percentile: projectData.extrapolation_n_percentile ?? 15,
            estimated_n60: nEst,
            n_mean: nVals.length > 0 ? Math.round((nVals.reduce((a, b) => a + b, 0) / nVals.length) * 10) / 10 : nEst,
            n_median: nVals.length > 0 ? nVals[Math.floor(nVals.length / 2)] : nEst,
            estimated_phi_deg: phiEst,
            avg_qs_kpa: (adoptedG === "Gravas" ? 330.8 : 280.0),
            min_qs_kpa: (adoptedG === "Gravas" ? 209.5 : 180.0),
            max_qs_kpa: (adoptedG === "Gravas" ? 438.9 : 390.0),
            avg_qp_kpa: (adoptedG === "Gravas" ? 3105.1 : 2750.0)
        };
    }

    analysisResult = {
        success: true,
        water_table_m: wt,
        fs: fsGlobal,
        fs_global: fsGlobal,
        fs_lateral: fsLateral,
        fs_ponta: fsPonta,
        apply_beta_fhwa_limit: applyBetaFhwa,
        beta_shallow_stress_limit_kpa: shallowStressLimit,
        beta_cap_kp_tan_phi: capKp,
        casing_reduction_pct: casingPct,
        casing_reduction_mode: casingMode,
        casing_length_m: projectData.casing_length_m,
        kp_base: projectData.kp_base ?? 0.59,
        pa_kpa: projectData.pa_kpa ?? 101.3,
        cn_max: projectData.cn_max ?? 2.0,
        target_load_kN: targetLoad,
        percentile: projectData.percentile,
        critical_sounding_used: critName,
        piles: piles,
        soil_groups: sGroups,
        summary_table: summaryTable,
        axes_analysis: axesResults,
        soundings: analyzedSoundings,
        min_test_depth_m: minInfo.minDepth,
        min_test_sounding: minInfo.minSounding,
        base_depth_m: projectData.base_depth_m ?? minInfo.minDepth,
        extrapolation_estimates: localEst
    };

    updateUIWithResults();
}
