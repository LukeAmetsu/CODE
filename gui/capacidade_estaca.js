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
    apply_shallow_stress_limit: true, // Trava de tensão mínima rasa sigma'v >= 43.1 kPa para não ter valores altos de beta
    beta_shallow_stress_limit_kpa: 43.1,
    beta_cap_kp_tan_phi: true,
    target_load_kN: 21400.0,
    percentile: 10.0,
    casing_reduction_pct: 10.0,
    casing_reduction_mode: "excel_formula", // 'excel_formula' (Radm * 0.9) ou 'lateral_only' (Rs * 0.9)
    casing_length_m: null, // metros com camisa (null = estaca toda)
    lateral_method: "mayne_fhwa", // 'mayne_fhwa' ou 'aashto_2007'
    tip_method: "aashto_2007", // 'aashto_2007' ou 'aashto_2024'
    soil_above_removed: false, // Se true, acima da cota inicial não há solo (ativo automaticamente na AASHTO)
    soil_above_height_m: null, // metros de solo sobrejacente considerado (null/'full' = sobrecarga original; 0 = totalmente removido)
    apply_qs_cap: true, // Trava unitária qs <= 0.19 MPa (4.0 ksf) AASHTO 2017
    apply_qp_cap: true, // Trava unitária qp <= 60 ksf (2.87 MPa). False = Sem limite (Haskoning)
    apply_beta_limits: true, // Trava de valores numéricos de beta [beta_min <= beta <= beta_max] (AASHTO / O'Neill)
    beta_depth_ref: "relative_to_top", // 'relative_to_top' (z - z_topo) [Haskoning] ou 'absolute' (z=0) [FHWA]
    is_haskoning_compare_active: false, // Se true, exibe comparação e deltas com a Haskoning
    qs_max_ksf: 4.0, // Limite unitário lateral AASHTO 2007 (4.0 ksf = 191.52 kPa ~ 192 kPa)
    qp_max_ksf: 60.0, // Limite unitário de ponta AASHTO 2024 (60.0 ksf = 2872.82 kPa)
    beta_min: 0.25, // Limite inferior de beta (AASHTO 2017: 0.25)
    beta_max: 1.8, // Limite superior de beta (AASHTO 2017: 1.8)
    kp_base: 0.59,
    pa_kpa: 101.3,
    cn_max: 2.0,
    critical_sounding: "SPT-01",
    consider_pile_weight: false, // Se true, calcula e desconta peso próprio efetivo (Net Capacity)
    concrete_unit_weight: 24.0, // kN/m³ peso específico do concreto armado
    water_unit_weight: 10.0, // kN/m³ peso específico da água
    pile_weight_mode: "submerged_concrete", // 'submerged_concrete' (γ'c = 14 kN/m³) ou 'displaced_soil' (γc - γsoil)
    pile_length_above_start_m: 0.0, // Comprimento da estaca acima da cota de início (m)
    soil_groups: {
        "Relleno (Aterro)": { gamma_dry: 17.0, gamma_sub: 10.0 },
        "Areias": { gamma_dry: 18.5, gamma_sub: 8.5 },
        "Gravas": { gamma_dry: 20.0, gamma_sub: 10.5 },
        "Finos": { gamma_dry: 18.0, gamma_sub: 11.0 }
    },
    piles: [
        { id: "pile_48in", name: "Drilled Shaft D=1.20m (48\")", diam_in: 48, diam_m: 1.20, perimeter_m: 3.76, area_m2: 1.13 },
        { id: "pile_54in", name: "Drilled Shaft D=1.30m (54\")", diam_in: 54, diam_m: 1.30, perimeter_m: 4.08, area_m2: 1.32 },
        { id: "pile_60in", name: "Drilled Shaft D=1.50m (60\")", diam_in: 60, diam_m: 1.50, perimeter_m: 4.71, area_m2: 1.76 }
    ],
    axes: [
        { name: "A", cota_inicio_m: 20.75 },
        { name: "B", cota_inicio_m: 19.00 },
        { name: "C", cota_inicio_m: 14.40 },
        { name: "D", cota_inicio_m: 9.35 },
        { name: "E", cota_inicio_m: 4.60 }
    ],
    soundings: {}
};

let analysisResult = null;
let activeSoundingName = "SPT-01";
let activeTab = "summary";
let isPresentationMode = false;

// Instâncias de Gráficos (Chart.js)
let chartCapacityCompInst = null;
let chartDiametersCompInst = null;
let chartStratigraphyInst = null;
let chartStrengthsInst = null;
let chartSoundingCapacityInst = null;
let chartAxesInst = null;
let chartTargetDepthsSummaryInst = null;

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

// Dados de Referência e Benchmark da Haskoning DHV (FOS = 2.8, Cargas de Serviço Máximas)
const HASKONING_BENCHMARK = {
    "A": { top_el_m: 20.75, target_load_kN: 6350, tip_el_m: 49.00, emb_m: 30.00, diam_m: 1.50 },
    "B": { top_el_m: 19.00, target_load_kN: 6700, tip_el_m: 48.20, emb_m: 31.00, diam_m: 1.50 },
    "C": { top_el_m: 14.40, target_load_kN: 6850, tip_el_m: 40.92, emb_m: 30.50, diam_m: 1.50 },
    "D": { top_el_m: 9.35,  target_load_kN: 7350, tip_el_m: 37.14, emb_m: 32.50, diam_m: 1.50 },
    "E": { top_el_m: 4.60,  target_load_kN: 12050, tip_el_m: 43.86, emb_m: 40.00, diam_m: 1.50 }
};

// Helper para conversão de valores matemáticos e equações
function parseMath(val, fallback = 0) {
    if (val === null || val === undefined) return fallback;
    if (typeof val === "number") return isFinite(val) ? val : fallback;
    const str = String(val).trim();
    if (str === "") return fallback;
    if (typeof safeMathEval === "function") {
        const res = safeMathEval(str);
        if (res !== null && isFinite(res)) return res;
    } else if (typeof window !== "undefined" && typeof window.safeMathEval === "function") {
        const res = window.safeMathEval(str);
        if (res !== null && isFinite(res)) return res;
    }
    const num = parseFloat(str.replace(",", "."));
    return (!isNaN(num) && isFinite(num)) ? num : fallback;
}

// Inicialização
document.addEventListener("DOMContentLoaded", () => {
    if (typeof enableMathInInputs === "function") enableMathInInputs();
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
        if (tabId === "parameters") renderTab4AxesTable();
    }, 50);
}

const CAPACIDADE_ESTACA_STORAGE_KEY = "capacidade_estaca_user_settings_v2";

function showAutoSaveIndicator(text = "Session Saved", isSuccess = true) {
    const badge = document.getElementById("tab4-save-status-badge");
    const txt = document.getElementById("tab4-save-status-text");
    const dot = document.getElementById("tab4-save-status-dot");
    if (!badge || !txt) return;

    txt.innerText = text;
    if (isSuccess) {
        badge.className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 shadow-xs transition-all";
        if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500";
    } else {
        badge.className = "px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 shadow-xs transition-all";
        if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-500 animate-pulse";
    }
}

function saveProjectState(flashVisual = false) {
    try {
        const payloadToSave = {
            axes: (projectData.axes || []).map(a => ({
                name: a.name,
                cota_inicio_m: (a.cota_topo_m !== undefined) ? a.cota_topo_m : a.cota_inicio_m,
                cota_topo_m: (a.cota_topo_m !== undefined) ? a.cota_topo_m : a.cota_inicio_m,
                target_load_kN: a.target_load_kN || projectData.target_load_kN || 21400.0,
                casing_length_m: a.casing_length_m ?? null,
                pile_length_above_start_m: a.pile_length_above_start_m ?? null,
                has_custom_target: !!a.has_custom_target
            })),
            fs: projectData.fs,
            fs_global: projectData.fs_global,
            fs_lateral: projectData.fs_lateral,
            fs_ponta: projectData.fs_ponta,
            lateral_method: projectData.lateral_method,
            tip_method: projectData.tip_method,
            soil_above_removed: projectData.soil_above_removed,
            soil_above_height_m: projectData.soil_above_height_m,
            apply_qs_cap: projectData.apply_qs_cap,
            apply_qp_cap: projectData.apply_qp_cap,
            beta_depth_ref: projectData.beta_depth_ref,
            is_haskoning_compare_active: projectData.is_haskoning_compare_active,
            qs_max_ksf: projectData.qs_max_ksf,
            qp_max_ksf: projectData.qp_max_ksf,
            beta_min: projectData.beta_min ?? 0.25,
            beta_max: projectData.beta_max ?? 1.8,
            apply_beta_limits: projectData.apply_beta_limits !== false,
            apply_beta_fhwa_limit: projectData.apply_beta_fhwa_limit,
            apply_shallow_stress_limit: projectData.apply_shallow_stress_limit !== false,
            beta_shallow_stress_limit_kpa: projectData.beta_shallow_stress_limit_kpa,
            beta_cap_kp_tan_phi: projectData.beta_cap_kp_tan_phi,
            casing_reduction_pct: projectData.casing_reduction_pct,
            casing_reduction_mode: projectData.casing_reduction_mode,
            casing_length_m: projectData.casing_length_m,
            consider_pile_weight: projectData.consider_pile_weight,
            concrete_unit_weight: projectData.concrete_unit_weight,
            water_unit_weight: projectData.water_unit_weight,
            pile_weight_mode: projectData.pile_weight_mode,
            pile_length_above_start_m: projectData.pile_length_above_start_m ?? 0.0,
            water_table_m: projectData.water_table_m,
            target_load_kN: projectData.target_load_kN,
            percentile: projectData.percentile,
            kp_base: projectData.kp_base,
            cn_max: projectData.cn_max,
            pa_kpa: projectData.pa_kpa,
            critical_sounding: projectData.critical_sounding,
            base_depth_m: projectData.base_depth_m,
            spt01_measured_depth_m: projectData.spt01_measured_depth_m,
            extrapolation_n_percentile: projectData.extrapolation_n_percentile,
            extrapolation_soil_group: projectData.extrapolation_soil_group,
            extrapolation_max_depth_m: projectData.extrapolation_max_depth_m,
            last_saved: new Date().toISOString()
        };

        // 1. Grava no localStorage do navegador
        localStorage.setItem(CAPACIDADE_ESTACA_STORAGE_KEY, JSON.stringify(payloadToSave));

        // 2. Se backend Eel estiver conectado, salva no arquivo JSON do projeto
        if (typeof eel !== "undefined" && eel.save_capacidade_estaca_project_data) {
            eel.save_capacidade_estaca_project_data(payloadToSave)((res) => {
                if (res && res.success) {
                    showAutoSaveIndicator("Disk & Browser Saved", true);
                } else {
                    showAutoSaveIndicator("Browser Saved", true);
                }
            });
        } else {
            showAutoSaveIndicator("Browser Saved", true);
        }
    } catch (e) {
        console.warn("Error saving project state:", e);
    }
}

// Carrega Dados de Referência
function loadReferenceData() {
    if (typeof eel !== "undefined" && eel.get_capacidade_estaca_reference_data) {
        eel.get_capacidade_estaca_reference_data()((res) => {
            if (res && res.success && res.data) {
                applyLoadedData(res.data);
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
            applyLoadedData(data);
        })
        .catch(err => {
            console.warn("Fallback JSON fetch error:", err);
            triggerCalculation();
        });
}

function applyLoadedData(baseData) {
    projectData = Object.assign(projectData, baseData);

    // Recupera dados persistidos do usuário no localStorage
    try {
        const rawSaved = localStorage.getItem(CAPACIDADE_ESTACA_STORAGE_KEY);
        if (rawSaved) {
            const saved = JSON.parse(rawSaved);
            if (saved && typeof saved === "object") {
                // Mescla axes preservando cota_topo_m e cota_inicio_m
                if (Array.isArray(saved.axes) && saved.axes.length > 0) {
                    projectData.axes = saved.axes.map(savedAx => {
                        const baseAx = (projectData.axes || []).find(a => a.name === savedAx.name) || {};
                        const cota = (savedAx.cota_topo_m !== undefined) ? savedAx.cota_topo_m : ((savedAx.cota_inicio_m !== undefined) ? savedAx.cota_inicio_m : baseAx.cota_inicio_m);
                        const lenAbove = (savedAx.pile_length_above_start_m !== undefined) ? savedAx.pile_length_above_start_m : baseAx.pile_length_above_start_m;
                        return {
                            ...baseAx,
                            ...savedAx,
                            cota_inicio_m: cota,
                            cota_topo_m: cota,
                            pile_length_above_start_m: lenAbove
                        };
                    });
                }
                // Mescla demais chaves salvas
                Object.keys(saved).forEach(k => {
                    if (k !== "axes" && k !== "soundings" && k !== "last_saved" && saved[k] !== undefined) {
                        projectData[k] = saved[k];
                    }
                });
                showAutoSaveIndicator("Loaded Saved Session", true);
            }
        }
    } catch (err) {
        console.warn("Could not parse saved project data:", err);
    }

    populateUIParameters();
    populateSoundingSelectors();
    renderTab4AxesTable();
    triggerCalculation();
}

function resetToFactoryDefaults() {
    if (!confirm("Are you sure you want to reset all axes cut-off elevations and project parameters to initial factory defaults?")) {
        return;
    }
    localStorage.removeItem(CAPACIDADE_ESTACA_STORAGE_KEY);
    fetch("../backend/calculators/capacidade_estaca_data.json")
        .then(r => r.json())
        .then(data => {
            projectData = Object.assign({}, data);
            populateUIParameters();
            populateSoundingSelectors();
            renderTab4AxesTable();
            triggerCalculation();
            showAutoSaveIndicator("Reset to Defaults", false);
        })
        .catch(err => {
            location.reload();
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
    const applyShallowStress = projectData.apply_shallow_stress_limit !== false;

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
    const elBetaCapKpQuick = document.getElementById("quick-check-beta-cap-kp");
    if (elBetaCapKpQuick) elBetaCapKpQuick.checked = capKp;
    const elShallowStressQuick = document.getElementById("quick-check-shallow-stress");
    const elShallowStressParam = document.getElementById("check-apply-shallow-stress");
    if (elShallowStressQuick) elShallowStressQuick.checked = applyShallowStress;
    if (elShallowStressParam) elShallowStressParam.checked = applyShallowStress;

    if (elTarget) elTarget.value = projectData.target_load_kN;
    const elTargetQuick = document.getElementById("quick-input-target-load");
    if (elTargetQuick) elTargetQuick.value = projectData.target_load_kN;
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

    // Métodos normativos de cálculo (Lateral & Ponta)
    const elLatMethod = document.getElementById("select-lateral-method");
    const elLatMethodQuick = document.getElementById("quick-select-lateral-method");
    const elTipMethod = document.getElementById("select-tip-method");
    const elTipMethodQuick = document.getElementById("quick-select-tip-method");
    const elQsMax = document.getElementById("input-qs-max-ksf");
    const elQpMax = document.getElementById("input-qp-max-ksf");

    const latMethod = projectData.lateral_method || "mayne_fhwa";
    const tipMethod = projectData.tip_method || "aashto_2007";
    const qsMax = projectData.qs_max_ksf ?? 4.0;
    const qpMax = projectData.qp_max_ksf ?? 60.0;

    if (elLatMethod) elLatMethod.value = latMethod;
    if (elLatMethodQuick) elLatMethodQuick.value = latMethod;
    if (elTipMethod) elTipMethod.value = tipMethod;
    if (elTipMethodQuick) elTipMethodQuick.value = tipMethod;
    if (elQsMax) elQsMax.value = qsMax;
    if (elQpMax) elQpMax.value = qpMax;

    const betaMin = projectData.beta_min ?? 0.25;
    const betaMax = projectData.beta_max ?? 1.8;
    const elBetaMin = document.getElementById("input-beta-min");
    const elBetaMax = document.getElementById("input-beta-max");
    const elBetaMinQuick = document.getElementById("quick-input-beta-min");
    const elBetaMaxQuick = document.getElementById("quick-input-beta-max");
    if (elBetaMin) elBetaMin.value = betaMin;
    if (elBetaMax) elBetaMax.value = betaMax;
    if (elBetaMinQuick) elBetaMinQuick.value = betaMin;
    if (elBetaMaxQuick) elBetaMaxQuick.value = betaMax;

    const applyBetaLimits = projectData.apply_beta_limits !== false;
    const elBetaLimitsQuick = document.getElementById("quick-check-apply-beta-limits");
    const elBetaLimitsParam = document.getElementById("check-apply-beta-limits");
    if (elBetaLimitsQuick) elBetaLimitsQuick.checked = applyBetaLimits;
    if (elBetaLimitsParam) elBetaLimitsParam.checked = applyBetaLimits;
    updateBetaInputsEnabled(applyBetaLimits);

    // Remoção / espessura do solo acima da cota inicial
    const isAashto = (latMethod === "aashto_2007");
    const soilAbove = (projectData.soil_above_removed !== undefined) ? !!projectData.soil_above_removed : isAashto;
    projectData.soil_above_removed = soilAbove;
    const elSoilAbove = document.getElementById("check-soil-above-removed");
    if (elSoilAbove) elSoilAbove.checked = (projectData.soil_above_height_m === 0 || (projectData.soil_above_height_m === null && soilAbove));
    const elSoilH = document.getElementById("input-soil-above-height");
    if (elSoilH) {
        if (projectData.soil_above_height_m === "full" || (!projectData.soil_above_removed && (projectData.soil_above_height_m === null || projectData.soil_above_height_m === undefined))) {
            elSoilH.value = "";
            elSoilH.placeholder = "Total";
        } else if (projectData.soil_above_height_m !== null && projectData.soil_above_height_m !== undefined) {
            elSoilH.value = projectData.soil_above_height_m;
        } else {
            elSoilH.value = soilAbove ? "0" : "";
            elSoilH.placeholder = soilAbove ? "0" : "Total";
        }
    }

    // Travas unitárias (qs & qp) e referência de profundidade beta (Haskoning)
    const applyQsCap = projectData.apply_qs_cap !== false;
    const applyQpCap = projectData.apply_qp_cap !== false;
    const betaDepthRef = projectData.beta_depth_ref || "relative_to_top";

    const elQsCapQuick = document.getElementById("quick-check-apply-qs-cap");
    const elQsCapParam = document.getElementById("check-apply-qs-cap");
    if (elQsCapQuick) elQsCapQuick.checked = applyQsCap;
    if (elQsCapParam) elQsCapParam.checked = applyQsCap;

    const elQpCapQuick = document.getElementById("quick-check-apply-qp-cap");
    const elQpCapParam = document.getElementById("check-apply-qp-cap");
    if (elQpCapQuick) elQpCapQuick.checked = applyQpCap;
    if (elQpCapParam) elQpCapParam.checked = applyQpCap;

    const elBetaRefQuick = document.getElementById("quick-select-beta-depth-ref");
    const elBetaRefParam = document.getElementById("select-beta-depth-ref");
    if (elBetaRefQuick) elBetaRefQuick.value = betaDepthRef;
    if (elBetaRefParam) elBetaRefParam.value = betaDepthRef;

    const labelQpStatus = document.getElementById("label-qp-cap-status");
    if (labelQpStatus) {
        if (applyQpCap) {
            labelQpStatus.innerHTML = `🔒 Trava de ponta ATIVA ($q_p \\le ${qpMax.toFixed(1)}\\text{ ksf} = ${(qpMax * 47.88).toFixed(1)}\\text{ kPa}$).`;
            labelQpStatus.className = "text-[10px] text-purple-700 dark:text-purple-300 font-bold block";
        } else {
            labelQpStatus.innerHTML = `🔓 Trava de ponta DESATIVADA (Sem Limite / Unconstrained — Haskoning Critério 5).`;
            labelQpStatus.className = "text-[10px] text-emerald-600 dark:text-emerald-400 font-black block";
        }
        window.renderLatex?.(labelQpStatus);
    }

    // Banner e botão de comparação Haskoning
    const isHaskActive = !!projectData.is_haskoning_compare_active;
    const bannerHask = document.getElementById("haskoning-compare-banner");
    const btnHask = document.getElementById("btn-toggle-haskoning-compare");
    if (bannerHask) {
        if (isHaskActive) bannerHask.classList.remove("hidden");
        else bannerHask.classList.add("hidden");
    }
    if (btnHask) {
        if (isHaskActive) {
            btnHask.className = "px-2.5 py-1 text-xs font-bold rounded-xl border border-violet-600 bg-violet-600 text-white shadow-xs transition-all flex items-center gap-1";
            btnHask.innerHTML = `<span>✓</span> Haskoning Ativo`;
        } else {
            btnHask.className = "px-2.5 py-1 text-xs font-bold rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 transition-all flex items-center gap-1 shadow-2xs";
            btnHask.innerHTML = `<span>🎯</span> Comparar Haskoning`;
        }
    }

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

    // Peso próprio da estaca & Net Capacity
    const elWeightQuick = document.getElementById("quick-check-pile-weight");
    const elWeightParam = document.getElementById("input-consider-pile-weight");
    const elConcGamma = document.getElementById("input-concrete-unit-weight");
    const elWaterGamma = document.getElementById("input-water-unit-weight");
    const elConcGammaSubQuick = document.getElementById("quick-input-gamma-sub-conc");
    const elWeightMode = document.getElementById("select-pile-weight-mode");
    const elBadgeSub = document.getElementById("badge-gamma-sub-conc");

    const considerWeight = projectData.consider_pile_weight ?? false;
    const concGamma = projectData.concrete_unit_weight ?? 24.0;
    const waterGamma = projectData.water_unit_weight ?? 10.0;
    const gammaSub = Math.max(0, concGamma - waterGamma);

    if (elWeightQuick) elWeightQuick.checked = considerWeight;
    if (elWeightParam) elWeightParam.checked = considerWeight;
    if (elConcGamma) elConcGamma.value = concGamma;
    if (elWaterGamma) elWaterGamma.value = waterGamma;
    if (elConcGammaSubQuick) elConcGammaSubQuick.value = gammaSub.toFixed(1);
    if (elBadgeSub) elBadgeSub.innerText = `${gammaSub.toFixed(1)} kN/m³`;
    if (elWeightMode) elWeightMode.value = projectData.pile_weight_mode || "submerged_concrete";

    const elLenAboveQuick = document.getElementById("quick-input-pile-len-above");
    const elLenAboveParam = document.getElementById("input-pile-length-above-start");
    const pileLenAbove = projectData.pile_length_above_start_m ?? 0.0;
    if (elLenAboveQuick) elLenAboveQuick.value = Number(pileLenAbove).toFixed(1);
    if (elLenAboveParam) elLenAboveParam.value = Number(pileLenAbove).toFixed(1);

    updatePileWeightPreview();

    updateKPIs();
    renderSoilGroupsTable();
    renderPilesTable();
}

function syncPileWeight(checked) {
    projectData.consider_pile_weight = !!checked;
    const elQuick = document.getElementById("quick-check-pile-weight");
    const elParam = document.getElementById("input-consider-pile-weight");
    if (elQuick && elQuick.checked !== !!checked) elQuick.checked = !!checked;
    if (elParam && elParam.checked !== !!checked) elParam.checked = !!checked;

    const selTable = document.getElementById("select-axes-table-basis");
    const selChart = document.getElementById("select-chart-axis-basis");
    if (selTable) selTable.value = checked ? "net" : "gross";
    if (selChart) selChart.value = checked ? "net" : "gross";

    updatePileWeightPreview();
    triggerCalculation();
}

function syncConcreteGamma(val) {
    const num = Math.max(10, Math.min(40, parseMath(val, 24.0)));
    projectData.concrete_unit_weight = num;
    const elParam = document.getElementById("input-concrete-unit-weight");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;

    const gammaW = projectData.water_unit_weight ?? 10.0;
    const gammaSub = Math.max(0, num - gammaW);
    const elQuickSub = document.getElementById("quick-input-gamma-sub-conc");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elQuickSub) elQuickSub.value = gammaSub.toFixed(1);
    if (badgeSub) badgeSub.innerText = `${gammaSub.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncWaterGamma(val) {
    const num = Math.max(5, Math.min(15, parseMath(val, 10.0)));
    projectData.water_unit_weight = num;
    const elParam = document.getElementById("input-water-unit-weight");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;

    const gammaC = projectData.concrete_unit_weight ?? 24.0;
    const gammaSub = Math.max(0, gammaC - num);
    const elQuickSub = document.getElementById("quick-input-gamma-sub-conc");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elQuickSub) elQuickSub.value = gammaSub.toFixed(1);
    if (badgeSub) badgeSub.innerText = `${gammaSub.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncConcreteGammaSub(val) {
    const num = Math.max(0, Math.min(30, parseMath(val, 14.0)));
    const gammaW = projectData.water_unit_weight ?? 10.0;
    projectData.concrete_unit_weight = num + gammaW;

    const elParamC = document.getElementById("input-concrete-unit-weight");
    const badgeSub = document.getElementById("badge-gamma-sub-conc");
    if (elParamC) elParamC.value = (num + gammaW).toFixed(1);
    if (badgeSub) badgeSub.innerText = `${num.toFixed(1)} kN/m³`;

    updatePileWeightPreview();
    triggerCalculation();
}

function syncPileWeightMode(val) {
    projectData.pile_weight_mode = val;
    const elParam = document.getElementById("select-pile-weight-mode");
    if (elParam && elParam.value !== val) elParam.value = val;
    triggerCalculation();
}

function syncPileLengthAboveStart(val) {
    const num = Math.max(0, parseMath(val, 0.0));
    projectData.pile_length_above_start_m = num;
    const elQuick = document.getElementById("quick-input-pile-len-above");
    const elParam = document.getElementById("input-pile-length-above-start");
    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num.toFixed(1);
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num.toFixed(1);
    saveProjectState();
    triggerCalculation();
}

function updatePileWeightPreview() {
    const elBadge = document.getElementById("quick-pile-weight-preview");
    if (!elBadge) return;
    const gammaC = projectData.concrete_unit_weight ?? 24.0;
    const gammaW = projectData.water_unit_weight ?? 10.0;
    const gammaSub = Math.max(0, gammaC - gammaW);
    // Para D=1.50m (Área = pi * 0.75^2 ~ 1.767 m2) em 45m de comprimento submerso:
    const area60 = Math.PI * Math.pow(1.5 / 2, 2);
    const wEst = area60 * 45 * gammaSub;
    elBadge.innerText = `~${Math.round(wEst).toLocaleString('en-US')} kN (45m)`;
    elBadge.title = `Effective submerged weight for D=1.50m shaft (Area=${area60.toFixed(2)}m²) over 45m depth at γ'=${gammaSub.toFixed(1)} kN/m³`;
}

function syncCasingPct(val) {
    const num = Math.max(0, Math.min(100, parseMath(val, 0)));
    projectData.casing_reduction_pct = num;
    const factor = 1.0 - (num / 100.0);
    const factorStr = factor.toFixed(2);

    const elQuick = document.getElementById("quick-input-casing-pct");
    const elParam = document.getElementById("input-casing-reduction");
    const elBadge = document.getElementById("quick-casing-factor-badge");
    const elKpiRed = document.getElementById("kpi-casing-reduction");
    const elKpiFactor = document.getElementById("kpi-casing-factor");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
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
        const parsed = parseMath(raw, NaN);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    projectData.casing_length_m = num;

    const elQuick = document.getElementById("quick-input-casing-len");
    const elParam = document.getElementById("input-casing-length");

    if (elQuick && (num === null ? elQuick.value !== "" : parseMath(elQuick.value) !== num)) {
        elQuick.value = (num === null) ? "" : num;
    }
    if (elParam && (num === null ? elParam.value !== "" : parseMath(elParam.value) !== num)) {
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
    const num = Math.max(0.1, parseMath(val, 2.0));
    projectData.fs = num;
    projectData.fs_global = num;
    const elQuick = document.getElementById("quick-input-fs");
    const elParam = document.getElementById("input-fs");
    const elKpi = document.getElementById("kpi-fs");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(2);
    triggerCalculation();
}

function syncFS(val) {
    syncFSGlobal(val);
}

function syncFSLateral(val) {
    const num = Math.max(0.1, parseMath(val, 1.5));
    projectData.fs_lateral = num;
    const elQuick = document.getElementById("quick-input-fs-s");
    const elParam = document.getElementById("input-fs-lateral");
    const elKpi = document.getElementById("kpi-fs-dif-s");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = num.toFixed(1);
    triggerCalculation();
}

function syncFSPonta(val) {
    const num = Math.max(0.1, parseMath(val, 3.0));
    projectData.fs_ponta = num;
    const elQuick = document.getElementById("quick-input-fs-p");
    const elParam = document.getElementById("input-fs-ponta");
    const elKpi = document.getElementById("kpi-fs-dif-p");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
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

function syncLateralMethod(val) {
    projectData.lateral_method = val;
    const elQuick = document.getElementById("quick-select-lateral-method");
    const elParam = document.getElementById("select-lateral-method");
    if (elQuick && elQuick.value !== val) elQuick.value = val;
    if (elParam && elParam.value !== val) elParam.value = val;

    // Se estacas pela AASHTO, acima da cota inicial não há solo
    const isAashto = (val === "aashto_2007");
    projectData.soil_above_removed = isAashto;
    const elSoilAbove = document.getElementById("check-soil-above-removed");
    if (elSoilAbove && elSoilAbove.checked !== isAashto) elSoilAbove.checked = isAashto;

    updateKPIs();
    saveProjectState();
    triggerCalculation();
    showToast(isAashto ? "AASHTO ativado: acima da cota inicial não há solo (σ'v = 0 no topo)." : "Método FHWA selecionado.", "info");
}

function syncTipMethod(val) {
    projectData.tip_method = val;
    const elQuick = document.getElementById("quick-select-tip-method");
    const elParam = document.getElementById("select-tip-method");
    if (elQuick && elQuick.value !== val) elQuick.value = val;
    if (elParam && elParam.value !== val) elParam.value = val;
    updateKPIs();
    triggerCalculation();
}

function syncQsMax(val) {
    const num = Math.max(0.1, parseMath(val, 4.0));
    projectData.qs_max_ksf = num;
    const elParam = document.getElementById("input-qs-max-ksf");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    triggerCalculation();
}

function syncQpMax(val) {
    const num = Math.max(1.0, parseMath(val, 60.0));
    projectData.qp_max_ksf = num;
    const elParam = document.getElementById("input-qp-max-ksf");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    triggerCalculation();
}

function syncBetaMin(val) {
    const num = Math.max(0.01, parseMath(val, 0.25));
    projectData.beta_min = num;
    const elParam = document.getElementById("input-beta-min");
    const elQuick = document.getElementById("quick-input-beta-min");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;

    saveProjectState();
    triggerCalculation();
    showToast(`Limite inferior de β ajustado para ${num.toFixed(2)}.`, "info");
}

function syncBetaMax(val) {
    const num = Math.max(0.1, parseMath(val, 1.8));
    projectData.beta_max = num;
    const elParam = document.getElementById("input-beta-max");
    const elQuick = document.getElementById("quick-input-beta-max");
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;

    saveProjectState();
    triggerCalculation();
    showToast(`Limite superior de β ajustado para ${num.toFixed(2)} (AASHTO 2017).`, "info");
}

function syncApplyBetaLimits(checked) {
    const isChecked = !!checked;
    projectData.apply_beta_limits = isChecked;
    const elQuick = document.getElementById("quick-check-apply-beta-limits");
    const elParam = document.getElementById("check-apply-beta-limits");
    if (elQuick && elQuick.checked !== isChecked) elQuick.checked = isChecked;
    if (elParam && elParam.checked !== isChecked) elParam.checked = isChecked;

    updateBetaInputsEnabled(isChecked);
    saveProjectState();
    triggerCalculation();
    showToast(isChecked ? "Trava de limites de β (min/max) ATIVADA." : "Trava de limites de β DESATIVADA (β livre / sem corte).", "info");
}

function updateBetaInputsEnabled(enabled) {
    ["input-beta-min", "input-beta-max", "quick-input-beta-min", "quick-input-beta-max"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = !enabled;
            if (!enabled) {
                el.classList.add("opacity-40", "cursor-not-allowed");
            } else {
                el.classList.remove("opacity-40", "cursor-not-allowed");
            }
        }
    });
    const badge = document.getElementById("badge-beta-limits-status");
    if (badge) {
        if (enabled) {
            const bMin = projectData.beta_min ?? 0.25;
            const bMax = projectData.beta_max ?? 1.8;
            badge.innerText = `${bMin.toFixed(2)} ≤ β ≤ ${bMax.toFixed(2)}`;
            badge.className = "text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 font-bold";
        } else {
            badge.innerText = "LIVRE (Sem trava)";
            badge.className = "text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-bold";
        }
    }
}

function syncBetaCapKp(checked) {
    const isChecked = !!checked;
    projectData.beta_cap_kp_tan_phi = isChecked;
    const elQuick = document.getElementById("quick-check-beta-cap-kp");
    const elParam = document.getElementById("check-beta-cap-kp");
    if (elQuick && elQuick.checked !== isChecked) elQuick.checked = isChecked;
    if (elParam && elParam.checked !== isChecked) elParam.checked = isChecked;

    saveProjectState();
    triggerCalculation();
    showToast(isChecked ? "Trava β ≤ Kp·tan(φ') ATIVADA." : "Trava β ≤ Kp·tan(φ') DESATIVADA.", "info");
}

function syncShallowStressLimit(checked) {
    const isChecked = !!checked;
    projectData.apply_shallow_stress_limit = isChecked;
    const elQuick = document.getElementById("quick-check-shallow-stress");
    const elParam = document.getElementById("check-apply-shallow-stress");
    if (elQuick && elQuick.checked !== isChecked) elQuick.checked = isChecked;
    if (elParam && elParam.checked !== isChecked) elParam.checked = isChecked;

    saveProjectState();
    triggerCalculation();
    showToast(isChecked ? "Trava de tensão rasa σ'v ≥ 43.1 kPa ATIVADA." : "Trava de tensão rasa DESATIVADA (usa σ'v real na superfície).", "info");
}

function syncApplyQsCap(checked) {
    const isChecked = !!checked;
    projectData.apply_qs_cap = isChecked;
    const elQuick = document.getElementById("quick-check-apply-qs-cap");
    const elParam = document.getElementById("check-apply-qs-cap");
    if (elQuick && elQuick.checked !== isChecked) elQuick.checked = isChecked;
    if (elParam && elParam.checked !== isChecked) elParam.checked = isChecked;

    saveProjectState();
    triggerCalculation();
    showToast(isChecked ? "Trava unitária qs ≤ 0.19 MPa ATIVADA." : "Trava unitária qs DESATIVADA (Sem Limite).", "info");
}

function syncApplyQpCap(checked) {
    const isChecked = !!checked;
    projectData.apply_qp_cap = isChecked;
    const elQuick = document.getElementById("quick-check-apply-qp-cap");
    const elParam = document.getElementById("check-apply-qp-cap");
    if (elQuick && elQuick.checked !== isChecked) elQuick.checked = isChecked;
    if (elParam && elParam.checked !== isChecked) elParam.checked = isChecked;

    const labelQpStatus = document.getElementById("label-qp-cap-status");
    if (labelQpStatus) {
        if (isChecked) {
            const qpMax = projectData.qp_max_ksf ?? 60.0;
            labelQpStatus.innerHTML = `🔒 Trava de ponta ATIVA ($q_p \\le ${qpMax.toFixed(1)}\\text{ ksf} = ${(qpMax * 47.88).toFixed(1)}\\text{ kPa}$).`;
            labelQpStatus.className = "text-[10px] text-purple-700 dark:text-purple-300 font-bold block";
        } else {
            labelQpStatus.innerHTML = `🔓 Trava de ponta DESATIVADA (Sem Limite / Unconstrained — Haskoning Critério 5).`;
            labelQpStatus.className = "text-[10px] text-emerald-600 dark:text-emerald-400 font-black block";
        }
        window.renderLatex?.(labelQpStatus);
    }

    saveProjectState();
    triggerCalculation();
    showToast(isChecked ? "Trava de ponta qp ≤ 60 ksf ATIVADA." : "Trava de ponta DESATIVADA: modo Sem Limite (Haskoning)!", isChecked ? "info" : "success");
}

function syncBetaDepthRef(val) {
    projectData.beta_depth_ref = val;
    const elQuick = document.getElementById("quick-select-beta-depth-ref");
    const elParam = document.getElementById("select-beta-depth-ref");
    if (elQuick && elQuick.value !== val) elQuick.value = val;
    if (elParam && elParam.value !== val) elParam.value = val;

    saveProjectState();
    triggerCalculation();
    showToast(`Referência de profundidade do β: ${val === 'relative_to_top' ? 'Relativo ao topo da estaca (z - z_topo)' : 'Absoluto da superfície (z=0)'}`, "info");
}

function updateSoilAboveHeight(val) {
    if (val === "" || val === null || val === undefined || String(val).toLowerCase() === "full" || String(val).toLowerCase() === "total") {
        projectData.soil_above_height_m = "full";
        projectData.soil_above_removed = false;
        const elH = document.getElementById("input-soil-above-height");
        if (elH) { elH.value = ""; elH.placeholder = "Total"; }
        const elC = document.getElementById("check-soil-above-removed");
        if (elC) elC.checked = false;
        showToast("Solo acima mantido (sobrecarga original total da sondagem).", "info");
    } else {
        const num = parseFloat(val);
        if (isNaN(num) || num < 0) {
            projectData.soil_above_height_m = "full";
            projectData.soil_above_removed = false;
            const elH = document.getElementById("input-soil-above-height");
            if (elH) { elH.value = ""; elH.placeholder = "Total"; }
            const elC = document.getElementById("check-soil-above-removed");
            if (elC) elC.checked = false;
            showToast("Solo acima mantido (sobrecarga original total da sondagem).", "info");
        } else {
            projectData.soil_above_height_m = num;
            projectData.soil_above_removed = true;
            const elH = document.getElementById("input-soil-above-height");
            if (elH) elH.value = num;
            const elC = document.getElementById("check-soil-above-removed");
            if (elC) elC.checked = (num === 0);
            showToast(num === 0
                ? "Solo acima totalmente removido (AASHTO: σ'v = 0 no topo da estaca)."
                : `Sobrecarga de solo acima fixada em ${num} m.`, "info");
        }
    }

    saveProjectState();
    triggerCalculation();
}

function setSoilAbovePreset(val) {
    const elH = document.getElementById("input-soil-above-height");
    if (elH) {
        elH.value = (val === "full") ? "" : val;
    }
    updateSoilAboveHeight(val);
}

function syncSoilAboveRemoved(checked) {
    updateSoilAboveHeight(checked ? 0 : "full");
}

function applyHaskoningPreset() {
    // Aplica os 5 critérios da Haskoning DHV:
    // 1. Cargas de serviço máximas por eixo (A: 6350, B: 6700, C: 6850, D: 7350, E: 12050 kN)
    // 2. Global FOS = 2.8
    // 3. AASHTO 2012 / 2017
    // 4. Skin Friction limitado a 0.19 MPa (4.0 ksf = 191.5 kPa)
    // 5. End Bearing SEM LIMITE (Unconstrained, apply_qp_cap = false)
    // Extra: beta calculado relativo ao topo da estaca (z - z_topo) e sem solo acima
    projectData.fs_global = 2.8;
    projectData.fs = 2.8;
    projectData.lateral_method = "aashto_2007";
    projectData.tip_method = "aashto_2007";
    projectData.soil_above_removed = true;
    projectData.soil_above_height_m = 0;
    projectData.apply_qs_cap = true;
    projectData.qs_max_ksf = 4.0;
    projectData.apply_qp_cap = false; // Haskoning Critério 5: Sem limite de ponta
    projectData.beta_depth_ref = "relative_to_top";
    projectData.beta_min = 0.25;
    projectData.beta_max = 1.8;
    projectData.apply_beta_limits = true;
    projectData.apply_shallow_stress_limit = true;
    projectData.beta_cap_kp_tan_phi = true;
    projectData.is_haskoning_compare_active = true;

    // Aplica as cargas de serviço aos eixos
    if (Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            if (HASKONING_BENCHMARK[ax.name]) {
                ax.target_load_kN = HASKONING_BENCHMARK[ax.name].target_load_kN;
                ax.has_custom_target = true;
            }
        });
    }

    populateUIParameters();
    renderTab4AxesTable();
    saveProjectState();
    triggerCalculation();
    showToast("🎯 Modo Haskoning aplicado: FS=2.8, Cargas de Serviço, qs ≤ 0.19 MPa, qp sem limite, β relativo ao topo!", "success");
}

function applyStandardPreset() {
    // Restaura parâmetros normativos padrão FHWA / AASHTO
    projectData.fs_global = 2.0;
    projectData.fs = 2.0;
    projectData.fs_lateral = 1.5;
    projectData.fs_ponta = 3.0;
    projectData.lateral_method = "mayne_fhwa";
    projectData.tip_method = "aashto_2007";
    projectData.soil_above_removed = false;
    projectData.soil_above_height_m = "full";
    projectData.apply_qs_cap = true;
    projectData.qs_max_ksf = 4.0;
    projectData.apply_qp_cap = true;
    projectData.qp_max_ksf = 60.0;
    projectData.beta_min = 0.25;
    projectData.beta_max = 1.8;
    projectData.apply_beta_limits = true;
    projectData.apply_shallow_stress_limit = true;
    projectData.beta_cap_kp_tan_phi = true;
    projectData.beta_depth_ref = "absolute";
    projectData.target_load_kN = 21400.0;
    projectData.is_haskoning_compare_active = false;

    if (Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            ax.target_load_kN = 21400.0;
            ax.has_custom_target = false;
        });
    }

    populateUIParameters();
    renderTab4AxesTable();
    saveProjectState();
    triggerCalculation();
    showToast("⚖️ Modo Padrão FHWA/AASHTO restaurado: FS=2.0 (Global), Carga 21.400 kN, travas normativas ativas.", "info");
}

function toggleHaskoningComparison() {
    projectData.is_haskoning_compare_active = !projectData.is_haskoning_compare_active;
    const isAct = projectData.is_haskoning_compare_active;

    const banner = document.getElementById("haskoning-compare-banner");
    const btn = document.getElementById("btn-toggle-haskoning-compare");
    if (banner) {
        if (isAct) banner.classList.remove("hidden");
        else banner.classList.add("hidden");
    }
    if (btn) {
        if (isAct) {
            btn.className = "px-2.5 py-1 text-xs font-bold rounded-xl border border-violet-600 bg-violet-600 text-white shadow-xs transition-all flex items-center gap-1";
            btn.innerHTML = `<span>✓</span> Haskoning Ativo`;
        } else {
            btn.className = "px-2.5 py-1 text-xs font-bold rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 transition-all flex items-center gap-1 shadow-2xs";
            btn.innerHTML = `<span>🎯</span> Comparar Haskoning`;
        }
    }

    saveProjectState();
    renderAxesTable();
    showToast(isAct ? "Visualização comparativa com a Haskoning ativada na tabela de eixos!" : "Comparação Haskoning desativada.", "info");
}

function syncTargetLoad(val) {
    const num = Math.max(1, parseMath(val, 21400.0));
    projectData.target_load_kN = num;

    if (projectData.axes && Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            if (!ax.has_custom_target) {
                ax.target_load_kN = num;
            }
        });
    }

    const elQuick = document.getElementById("quick-input-target-load");
    const elParam = document.getElementById("input-target-load");
    const elKpi = document.getElementById("kpi-target-load");
    const elSummaryTarget = document.getElementById("summary-target-text");
    const elSummaryCritBadge = document.getElementById("summary-crit-target-badge");

    if (elQuick && parseMath(elQuick.value) !== num) elQuick.value = num;
    if (elParam && parseMath(elParam.value) !== num) elParam.value = num;
    if (elKpi) elKpi.innerText = Number(num).toLocaleString("pt-BR");
    if (elSummaryTarget) elSummaryTarget.innerText = `${Number(num).toLocaleString("pt-BR")} kN`;
    if (elSummaryCritBadge) elSummaryCritBadge.innerText = `Alvo: ${Number(num).toLocaleString("pt-BR")} kN`;

    updateKPIs();
    triggerCalculation();
}

function syncPileDiameter(idx, val) {
    const dVal = parseMath(val, NaN);
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
    const num = parseMath(val, NaN);
    if (isNaN(num)) return;
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.cota_inicio_m = num;
        ax.cota_topo_m = num;

        // Sincroniza inputs em ambas as abas se existirem
        const inTab2 = document.getElementById(`input-axis-cota-${axisName}`);
        if (inTab2 && parseMath(inTab2.value) !== num) inTab2.value = num.toFixed(2);
        const inTab4 = document.getElementById(`input-tab4-axis-cota-${axisName}`);
        if (inTab4 && parseMath(inTab4.value) !== num) inTab4.value = num.toFixed(2);

        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisTargetLoad(axisName, val) {
    const num = parseMath(val, NaN);
    if (isNaN(num) || num <= 0) return;
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.target_load_kN = num;
        ax.has_custom_target = true;
        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisCasingLength(axisName, val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseMath(raw, NaN);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.casing_length_m = num;
        saveProjectState();
        triggerCalculation();
    }
}

function updateAxisLengthAbove(axisName, val) {
    const raw = (typeof val === "string") ? val.trim() : val;
    let num = null;
    if (raw !== "" && raw !== null && raw !== undefined) {
        const parsed = parseMath(raw, NaN);
        if (!isNaN(parsed) && parsed >= 0) {
            num = parsed;
        }
    }
    const ax = (projectData.axes || []).find(a => a.name === axisName);
    if (ax) {
        ax.pile_length_above_start_m = num;
        saveProjectState();
        triggerCalculation();
    }
}

function renderTab4AxesTable() {
    const tbody = document.getElementById("tab4-axes-table-body");
    if (!tbody) return;
    tbody.innerHTML = "";

    const axes = projectData.axes || [];
    const axesResults = analysisResult?.axes_analysis || [];
    const isNet = projectData.consider_pile_weight ?? false;

    axes.forEach((ax, idx) => {
        const cotaTopo = (ax.cota_topo_m !== undefined) ? ax.cota_topo_m : ax.cota_inicio_m;
        const targetLoad = ax.target_load_kN || projectData.target_load_kN || 21400;
        const casingLen = (ax.casing_length_m !== undefined && ax.casing_length_m !== null) ? ax.casing_length_m : "";
        const lenAbove = (ax.pile_length_above_start_m !== undefined && ax.pile_length_above_start_m !== null) ? ax.pile_length_above_start_m : "";

        const resAx = axesResults.find(a => a.name === ax.name);
        const p48 = resAx?.piles?.["pile_48in"] || {};
        const p60 = resAx?.piles?.["pile_60in"] || {};

        const fmtVal = (v) => (v !== undefined && v !== null && v !== "N/A") ? `${Number(v).toFixed(2)} m` : "<span class='text-rose-500 font-bold'>N/A</span>";

        const tip48 = isNet ? (p48.cota_fundo_net_global_m ?? p48.cota_fundo_global_m) : (p48.cota_fundo_gross_global_m ?? p48.cota_fundo_global_m);
        const emb48 = isNet ? (p48.embutimento_net_global_m ?? p48.embutimento_global_m) : (p48.embutimento_gross_global_m ?? p48.embutimento_global_m);

        const tip60 = isNet ? (p60.cota_fundo_net_global_m ?? p60.cota_fundo_global_m) : (p60.cota_fundo_gross_global_m ?? p60.cota_fundo_global_m);
        const emb60 = isNet ? (p60.embutimento_net_global_m ?? p60.embutimento_global_m) : (p60.embutimento_gross_global_m ?? p60.embutimento_global_m);

        const w60 = p60.w_pile_net_target_global_kN || p60.w_pile_gross_target_global_kN || 0;

        const tr = document.createElement("tr");
        tr.className = (idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50/50 dark:bg-gray-750/30") + " hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors";
        tr.innerHTML = `
            <td class="p-3 text-center font-bold text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700/60">
                <span class="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 font-black text-xs shadow-xs">
                    ${ax.name}
                </span>
            </td>
            <td class="p-2 text-center border-b border-gray-100 dark:border-gray-700/60">
                <div class="inline-flex items-center justify-center gap-1">
                    <input type="number" id="input-tab4-axis-cota-${ax.name}" step="0.05" value="${Number(cotaTopo).toFixed(2)}" onchange="updateAxisCotaTopo('${ax.name}', this.value)" class="w-24 px-2 py-1 text-center font-mono font-black text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 shadow-xs" title="Top elevation where pile starts (cut-off level)">
                    <span class="text-xs text-gray-400 font-semibold">m</span>
                </div>
            </td>
            <td class="p-2 text-center border-b border-gray-100 dark:border-gray-700/60">
                <div class="inline-flex items-center justify-center gap-1">
                    <input type="number" id="input-tab4-axis-target-${ax.name}" step="100" min="1000" max="100000" value="${Math.round(targetLoad)}" onchange="updateAxisTargetLoad('${ax.name}', this.value)" class="w-28 px-2 py-1 text-center font-mono font-bold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 shadow-xs" title="Target load for this axis (default 21,400 kN)">
                    <span class="text-xs text-gray-400 font-semibold">kN</span>
                </div>
            </td>
            <td class="p-2 text-center border-b border-gray-100 dark:border-gray-700/60">
                <div class="inline-flex items-center justify-center gap-1">
                    <input type="number" id="input-tab4-axis-casing-${ax.name}" step="0.5" min="0" placeholder="Default" value="${casingLen !== '' ? casingLen : ''}" onchange="updateAxisCasingLength('${ax.name}', this.value)" class="w-24 px-2 py-1 text-center font-mono text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-rose-500 shadow-xs placeholder-gray-400 dark:placeholder-gray-500" title="Specific steel casing length for this axis">
                    <span class="text-xs text-gray-400 font-semibold">m</span>
                </div>
            </td>
            <td class="p-2 text-center border-b border-gray-100 dark:border-gray-700/60">
                <div class="inline-flex items-center justify-center gap-1">
                    <input type="number" id="input-tab4-axis-len-above-${ax.name}" step="0.5" min="0" placeholder="0.0" value="${lenAbove !== '' ? lenAbove : ''}" onchange="updateAxisLengthAbove('${ax.name}', this.value)" class="w-20 px-2 py-1 text-center font-mono font-bold text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-xl bg-white dark:bg-gray-700 focus:ring-2 focus:ring-amber-500 shadow-xs placeholder-gray-400 dark:placeholder-gray-500" title="Length of pile extending above start depth (m)">
                    <span class="text-xs text-gray-400 font-semibold">m</span>
                </div>
            </td>
            <td class="p-2 text-center font-mono border-b border-gray-100 dark:border-gray-700/60">
                <span class="font-extrabold text-blue-700 dark:text-blue-300">${fmtVal(tip48)}</span>
                <span class="text-[10px] text-gray-500 block">L = ${fmtVal(emb48)}</span>
            </td>
            <td class="p-2 text-center font-mono border-b border-gray-100 dark:border-gray-700/60">
                <span class="font-extrabold text-indigo-700 dark:text-indigo-300">${fmtVal(tip60)}</span>
                <span class="text-[10px] text-gray-500 block">L = ${fmtVal(emb60)}</span>
            </td>
            <td class="p-2 text-center font-mono text-xs border-b border-gray-100 dark:border-gray-700/60">
                ${isNet ? `<span class="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 font-bold">W ≈ ${Math.round(w60)} kN (D=1.5m)</span>` : `<span class="text-gray-400">Disabled (Gross)</span>`}
            </td>
        `;
        tbody.appendChild(tr);
    });
    if (typeof enableMathInInputs === "function") enableMathInInputs();
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
    projectData.spt01_measured_depth_m = parseMath(document.getElementById("input-spt01-depth")?.value, 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseMath(document.getElementById("input-extrap-percentile")?.value, 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseMath(document.getElementById("input-extrap-max-depth")?.value, 132.6);
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
    optMed.text = `SPT Mean / Synthesis (P${pVal}%)`;
    selActive.appendChild(optMed);

    if (selCrit) {
        const optCritMed = document.createElement("option");
        optCritMed.value = `SPT médio (P${pVal}%)`;
        optCritMed.text = `SPT Mean / Synthesis (P${pVal}%)`;
        selCrit.appendChild(optCritMed);
    }
}

// Execução do Cálculo
function triggerCalculation() {
    // Lê parâmetros da interface (aceita números diretos e equações matemáticas)
    projectData.water_table_m = parseMath(document.getElementById("input-water-table")?.value, 3.0);
    projectData.fs_global = parseMath(document.getElementById("input-fs")?.value, 2.0);
    projectData.fs = projectData.fs_global;
    projectData.fs_lateral = parseMath(document.getElementById("input-fs-lateral")?.value, 1.5);
    projectData.fs_ponta = parseMath(document.getElementById("input-fs-ponta")?.value, 3.0);
    projectData.apply_beta_fhwa_limit = document.getElementById("check-apply-beta-fhwa") ? document.getElementById("check-apply-beta-fhwa").checked : true;
    const elShallowStress = document.getElementById("quick-check-shallow-stress") || document.getElementById("check-apply-shallow-stress");
    projectData.apply_shallow_stress_limit = elShallowStress ? elShallowStress.checked : true;
    projectData.beta_shallow_stress_limit_kpa = parseMath(document.getElementById("input-shallow-stress")?.value, 43.1);
    const elBetaCapKp = document.getElementById("quick-check-beta-cap-kp") || document.getElementById("check-beta-cap-kp");
    projectData.beta_cap_kp_tan_phi = elBetaCapKp ? elBetaCapKp.checked : true;
    const elBetaLimits = document.getElementById("quick-check-apply-beta-limits") || document.getElementById("check-apply-beta-limits");
    projectData.apply_beta_limits = elBetaLimits ? elBetaLimits.checked : true;
    updateBetaInputsEnabled(projectData.apply_beta_limits);

    const targetInputVal = document.getElementById("quick-input-target-load")?.value || document.getElementById("input-target-load")?.value;
    if (targetInputVal !== undefined && targetInputVal !== "") {
        const parsedTarget = parseMath(targetInputVal, NaN);
        if (!isNaN(parsedTarget) && parsedTarget > 0) {
            projectData.target_load_kN = parsedTarget;
        }
    }
    if (projectData.axes && Array.isArray(projectData.axes)) {
        projectData.axes.forEach(ax => {
            if (!ax.has_custom_target) {
                ax.target_load_kN = projectData.target_load_kN;
            }
        });
    }
    projectData.percentile = parseMath(document.getElementById("input-percentile")?.value, 10.0);
    projectData.critical_sounding = document.getElementById("input-critical-sounding")?.value || "SPT-01";
    projectData.casing_reduction_pct = parseMath(document.getElementById("input-casing-reduction")?.value, 10.0);
    projectData.casing_reduction_mode = document.getElementById("select-casing-mode")?.value || "excel_formula";
    const casingLenVal = document.getElementById("input-casing-length")?.value ?? document.getElementById("quick-input-casing-len")?.value;
    if (casingLenVal !== "" && casingLenVal !== null && casingLenVal !== undefined) {
        const parsedLen = parseMath(casingLenVal, NaN);
        projectData.casing_length_m = (!isNaN(parsedLen) && parsedLen >= 0) ? parsedLen : null;
    } else {
        projectData.casing_length_m = null;
    }
    projectData.kp_base = parseMath(document.getElementById("input-kp-base")?.value, 0.59);
    projectData.cn_max = parseMath(document.getElementById("input-cn-max")?.value, 2.0);
    projectData.pa_kpa = parseMath(document.getElementById("input-pa-kpa")?.value, 101.3);

    const lenAboveVal = document.getElementById("input-pile-length-above-start")?.value ?? document.getElementById("quick-input-pile-len-above")?.value;
    if (lenAboveVal !== "" && lenAboveVal !== null && lenAboveVal !== undefined) {
        const parsedLenAbove = parseMath(lenAboveVal, NaN);
        projectData.pile_length_above_start_m = (!isNaN(parsedLenAbove) && parsedLenAbove >= 0) ? parsedLenAbove : 0.0;
    }

    // Métodos normativos de cálculo
    projectData.lateral_method = document.getElementById("quick-select-lateral-method")?.value || document.getElementById("select-lateral-method")?.value || "mayne_fhwa";
    projectData.tip_method = document.getElementById("quick-select-tip-method")?.value || document.getElementById("select-tip-method")?.value || "aashto_2007";
    projectData.qs_max_ksf = parseMath(document.getElementById("input-qs-max-ksf")?.value, 4.0);
    projectData.qp_max_ksf = parseMath(document.getElementById("input-qp-max-ksf")?.value, 60.0);
    projectData.beta_min = parseMath(document.getElementById("input-beta-min")?.value || document.getElementById("quick-input-beta-min")?.value, 0.25);
    projectData.beta_max = parseMath(document.getElementById("input-beta-max")?.value || document.getElementById("quick-input-beta-max")?.value, 1.8);

    const elQsCap = document.getElementById("quick-check-apply-qs-cap") || document.getElementById("check-apply-qs-cap");
    if (elQsCap) projectData.apply_qs_cap = elQsCap.checked;

    const elQpCap = document.getElementById("quick-check-apply-qp-cap") || document.getElementById("check-apply-qp-cap");
    if (elQpCap) projectData.apply_qp_cap = elQpCap.checked;

    const elBetaRef = document.getElementById("quick-select-beta-depth-ref") || document.getElementById("select-beta-depth-ref");
    if (elBetaRef) projectData.beta_depth_ref = elBetaRef.value;

    const elSoilAbove = document.getElementById("check-soil-above-removed");
    if (elSoilAbove) {
        projectData.soil_above_removed = elSoilAbove.checked;
    } else if (projectData.soil_above_removed === undefined) {
        projectData.soil_above_removed = (projectData.lateral_method === "aashto_2007");
    }

    // Parâmetros de Extrapolação de Solo Profundo
    projectData.spt01_measured_depth_m = parseMath(document.getElementById("input-spt01-depth")?.value, 44.4);
    projectData.base_depth_m = projectData.spt01_measured_depth_m;
    projectData.extrapolation_n_percentile = parseMath(document.getElementById("input-extrap-percentile")?.value, 15.0);
    projectData.extrapolation_soil_group = document.getElementById("select-extrap-soil")?.value || "auto";
    projectData.extrapolation_max_depth_m = parseMath(document.getElementById("input-extrap-max-depth")?.value, 132.6);

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
    const elQuickTarget = document.getElementById("quick-input-target-load");
    const elParamTarget = document.getElementById("input-target-load");
    const elNa = document.getElementById("kpi-water-table");
    const elFs = document.getElementById("kpi-fs");
    const elFsDifS = document.getElementById("kpi-fs-dif-s");
    const elFsDifP = document.getElementById("kpi-fs-dif-p");
    const elFhwaBeta = document.getElementById("kpi-fhwa-beta-status");
    const elCrit = document.getElementById("kpi-critical-sounding");
    const elPerc = document.getElementById("kpi-percentile");
    const elSummaryTarget = document.getElementById("summary-target-text");
    const elSummaryCritBadge = document.getElementById("summary-crit-target-badge");
    const elCasingRed = document.getElementById("kpi-casing-reduction");
    const elCasingFactor = document.getElementById("kpi-casing-factor");
    const elBadge = document.getElementById("quick-casing-factor-badge");
    const elBadgeInfo = document.getElementById("badge-casing-info");
    const elCasingLenBadge = document.getElementById("kpi-casing-len-badge");
    const elBadgeAxisNorms = document.getElementById("badge-axis-norms-info");

    const fsGlob = projectData.fs_global ?? projectData.fs ?? 2.0;
    const fsLat = projectData.fs_lateral ?? 1.5;
    const fsTip = projectData.fs_ponta ?? 3.0;
    const fhwaBeta = projectData.apply_beta_fhwa_limit ?? true;

    const casingPct = projectData.casing_reduction_pct ?? 10.0;
    const casingFactor = 1.0 - (casingPct / 100.0);
    const factorStr = casingFactor.toFixed(2);
    const casingLen = projectData.casing_length_m;

    if (elTarget) elTarget.innerText = Number(projectData.target_load_kN).toLocaleString("en-US");
    if (elQuickTarget && parseFloat(elQuickTarget.value) !== projectData.target_load_kN) elQuickTarget.value = projectData.target_load_kN;
    if (elParamTarget && parseFloat(elParamTarget.value) !== projectData.target_load_kN) elParamTarget.value = projectData.target_load_kN;
    if (elSummaryCritBadge) elSummaryCritBadge.innerText = `Target: ${Number(projectData.target_load_kN).toLocaleString("en-US")} kN`;
    if (elNa) elNa.innerText = Number(projectData.water_table_m).toFixed(2);
    if (elFs) elFs.innerText = Number(fsGlob).toFixed(2);
    if (elFsDifS) elFsDifS.innerText = Number(fsLat).toFixed(1);
    if (elFsDifP) elFsDifP.innerText = Number(fsTip).toFixed(1);
    if (elFhwaBeta) elFhwaBeta.innerText = fhwaBeta ? "ACTIVE (σ'v ≥ 43.1 kPa)" : "DISABLED";
    if (elCrit) elCrit.innerText = projectData.critical_sounding || "SPT-01";
    if (elPerc) elPerc.innerText = `${projectData.percentile}%`;
    if (elSummaryTarget) elSummaryTarget.innerText = `${Number(projectData.target_load_kN).toLocaleString("en-US")} kN`;
    if (elCasingRed) elCasingRed.innerText = `-${casingPct}%`;
    if (elCasingFactor) elCasingFactor.innerText = `(x${factorStr})`;
    if (elBadge) elBadge.innerText = `(x${factorStr})`;

    // Atualização dinâmica dos textos dos selects de modo de camisa com o fator ativo
    const elQuickCasingMode = document.getElementById("quick-select-casing-mode");
    const elParamCasingMode = document.getElementById("select-casing-mode");
    if (elQuickCasingMode) {
        const optTot = elQuickCasingMode.querySelector("option[value='excel_formula']");
        const optLat = elQuickCasingMode.querySelector("option[value='lateral_only']");
        if (optTot) optTot.textContent = `Total Capacity (Radm × ${factorStr})`;
        if (optLat) optLat.textContent = `Side Friction Only (Rs × ${factorStr})`;
    }
    if (elParamCasingMode) {
        const optTot = elParamCasingMode.querySelector("option[value='excel_formula']");
        const optLat = elParamCasingMode.querySelector("option[value='lateral_only']");
        if (optTot) optTot.textContent = `Total Allowable Capacity (Radm × ${factorStr} — Global Reduction)`;
        if (optLat) optLat.textContent = `Shaft Side Friction Only (Rs × ${factorStr} — Base/Tip intact)`;
    }

    if (elBadgeAxisNorms) {
        const latMethod = projectData.lateral_method || "mayne_fhwa";
        const tipMethod = projectData.tip_method || "aashto_2007";
        const latTxt = (latMethod === "aashto_2007") ? "AASHTO 2007 (≤4 ksf)" : "FHWA (Mayne)";
        const tipTxt = (tipMethod === "aashto_2024") ? "AASHTO 2024 (≤60 ksf)" : "AASHTO 2007";
        elBadgeAxisNorms.innerText = `Lateral: ${latTxt} | Tip: ${tipTxt}`;
    }

    let casingInfoText = `Casing: -${casingPct}% (Factor ${factorStr})`;
    if (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0) {
        casingInfoText += ` in the first ${casingLen.toFixed(1)}m`;
        if (elCasingLenBadge) elCasingLenBadge.innerText = `First ${casingLen.toFixed(1)}m`;
    } else {
        if (elCasingLenBadge) elCasingLenBadge.innerText = "Full shaft length";
    }
    if (elBadgeInfo) elBadgeInfo.innerText = casingInfoText;

    // Atualização dinâmica dos textos de FS na Aba 1
    const selFsMode = document.getElementById("select-summary-fs-mode");
    if (selFsMode && selFsMode.options.length >= 3) {
        selFsMode.options[0].text = `Comparison: Global FS (${Number(fsGlob).toFixed(1)}) vs Differentiated FS (${Number(fsLat).toFixed(1)} / ${Number(fsTip).toFixed(1)})`;
        selFsMode.options[1].text = `Global FS Only (${Number(fsGlob).toFixed(1)})`;
        selFsMode.options[2].text = `Differentiated FS Only (${Number(fsLat).toFixed(1)} / ${Number(fsTip).toFixed(1)})`;
    }
    const thRadm = document.getElementById("summary-th-radm");
    if (thRadm) {
        thRadm.innerHTML = `Allowable Capacity $R_{adm}\\text{ (kN - } FS=${Number(fsGlob).toFixed(1)}\\text{)}$`;
        window.renderLatex?.(thRadm);
    }

    // Badge de extrapolação na Aba 4
    renderExtrapolationEstimates();
}

let inspectedExtrapSounding = "SPT-01";

function changeExtrapInspectSounding(sName) {
    inspectedExtrapSounding = sName;
    renderExtrapolationEstimates(sName);
}

function renderExtrapolationEstimates(targetSounding) {
    const sName = targetSounding || inspectedExtrapSounding || activeSoundingName || "SPT-01";
    inspectedExtrapSounding = sName;

    // Sincroniza select de inspeção de sondagem na Aba 4 se existir
    const selInspect = document.getElementById("select-extrap-inspect-sounding");
    if (selInspect && selInspect.value !== sName) {
        selInspect.value = sName;
    }

    // Busca estimativa específica da sondagem solicitada
    const sData = analysisResult?.soundings?.[sName];
    const est = analysisResult?.extrapolation_estimates_by_sounding?.[sName]
             || sData?.extrapolation_estimates
             || analysisResult?.extrapolation_estimates;

    // Atualiza badge de status de extrapolação na Aba 3 (Active Boring)
    const activeBadgeText = document.getElementById("active-sounding-extrap-text");
    if (activeBadgeText) {
        const curActiveName = activeSoundingName || "SPT-01";
        const curActiveEst = analysisResult?.extrapolation_estimates_by_sounding?.[curActiveName]
                          || analysisResult?.soundings?.[curActiveName]?.extrapolation_estimates;
        if (curActiveEst) {
            activeBadgeText.innerText = `${curActiveName}: Extrapolated from ${Number(curActiveEst.base_depth_m).toFixed(1)}m to ${Number(curActiveEst.max_depth_m).toFixed(1)}m (${curActiveEst.adopted_soil_group}, N=${curActiveEst.estimated_n60})`;
        } else {
            activeBadgeText.innerText = `${curActiveName}: Standard measured profile`;
        }
    }

    if (!est) return;

    // 1. Atualiza hint do input de menor profundidade medida
    const hintDepth = document.getElementById("detected-min-depth-hint");
    if (hintDepth) {
        hintDepth.innerText = `Measured depth for ${sName}: ${Number(est.base_depth_m).toFixed(1)} m`;
    }

    // 2. Atualiza texto da opção auto no select (sem solo hardcoded!)
    const optAuto = document.getElementById("opt-extrap-auto");
    const modalGroup = est.modal_soil_group || "Most frequent soil";
    const modalPct = est.modal_soil_pct ? ` (${est.modal_soil_pct}%)` : "";
    if (optAuto) {
        optAuto.text = `Specific to each boring (e.g. ${sName}: ${modalGroup}${modalPct})`;
    }

    const hintModal = document.getElementById("detected-modal-soil-hint");
    if (hintModal) {
        hintModal.innerText = `${sName} most frequent: ${est.modal_soil_group} (${est.modal_soil_count} of ${est.total_measured_layers} layers)`;
    }

    // 3. Badge superior do card de extrapolação
    const extrapBadge = document.getElementById("extrap-status-badge");
    if (extrapBadge) {
        const nEst = est.estimated_n60 ?? 27;
        const sAdopted = est.adopted_soil_group || modalGroup;
        const pEst = est.n_percentile ?? projectData.extrapolation_n_percentile ?? 15;
        extrapBadge.innerText = `${sName}: Estimated N = ${nEst} (${sAdopted} - P${pEst}%)`;
    }

    // 4. Preenche os 6 cards de estimativas detalhadas especificamente para esta sondagem
    const elLayersBadge = document.getElementById("extrap-summary-layers-badge");
    if (elLayersBadge) {
        elLayersBadge.innerText = `${sName}: ${est.num_extrapolated_layers} synthesized layers (${Number(est.extrapolated_length_m).toFixed(1)} m)`;
    }

    const elSoilGroup = document.getElementById("est-soil-group");
    if (elSoilGroup) {
        elSoilGroup.innerText = `${est.adopted_soil_group} (${est.modal_sucs || 'USCS'})`;
    }

    const elSoilOccur = document.getElementById("est-soil-occurrence");
    if (elSoilOccur) {
        elSoilOccur.innerText = `${est.modal_soil_count} of ${est.total_measured_layers} layers (${est.modal_soil_pct}%)`;
    }

    const elN60 = document.getElementById("est-n60-val");
    if (elN60) elN60.innerText = est.estimated_n60;

    const elN60Stats = document.getElementById("est-n60-stats");
    if (elN60Stats) {
        elN60Stats.innerText = `Mean: ${est.n_mean} | Median: ${est.n_median}`;
    }

    const elPhi = document.getElementById("est-phi-val");
    if (elPhi) elPhi.innerText = `${Number(est.estimated_phi_deg).toFixed(1)}°`;

    const elQs = document.getElementById("est-qs-val");
    if (elQs) elQs.innerText = `${Number(est.avg_qs_kpa).toFixed(1)} kPa`;

    const elQsRange = document.getElementById("est-qs-range");
    if (elQsRange) {
        elQsRange.innerText = `${Number(est.min_qs_kpa).toFixed(1)} to ${Number(est.max_qs_kpa).toFixed(1)} kPa`;
    }

    const elQp = document.getElementById("est-qp-val");
    if (elQp) elQp.innerText = `${Number(est.avg_qp_kpa).toLocaleString("en-US", {maximumFractionDigits: 1})} kPa`;

    const elInterval = document.getElementById("est-interval-val");
    if (elInterval) {
        elInterval.innerText = `${Number(est.base_depth_m).toFixed(1)} m → ${Number(est.max_depth_m).toFixed(1)} m`;
    }

    const elCount = document.getElementById("est-layers-count");
    if (elCount) {
        elCount.innerText = `${est.num_extrapolated_layers} layers (dz = 0.60m)`;
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
    renderTab4AxesTable();
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

        const isSynth = row.sounding_name.toLowerCase().includes("médio") || row.sounding_name.toLowerCase().includes("mean") || row.sounding_name.toLowerCase().includes("synth");
        const isCritical = row.sounding_name === analysisResult.critical_sounding_used;

        let nameHtml = `<span class="font-bold text-gray-900 dark:text-white">${row.sounding_name}</span>`;
        if (isCritical) {
            nameHtml += ` <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">Governing</span>`;
        }
        if (isSynth) {
            nameHtml += ` <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">Synthesis</span>`;
        }

        const p48 = row.piles["pile_48in"] || {};
        const p54 = row.piles["pile_54in"] || {};
        const p60 = row.piles["pile_60in"] || {};

        const fmtVal = (v) => (v !== undefined && v !== null && v !== "N/A") ? Number(v).toLocaleString("en-US") : "N/A";
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

        const targetLoad = analysisResult.target_load_kN || 21400;
        let maxVisibleX1 = targetLoad;

        const datasets = [];
        const soundings = analysisResult.soundings || {};
        const colors = [PALETTE.blue, PALETTE.emerald, PALETTE.purple, PALETTE.amber, PALETTE.sky, PALETTE.rose, "#10B981"];

        let maxReqDepth1 = 0;
        let maxAvailableDepth1 = 65;
        for (const [sName, sData] of Object.entries(soundings)) {
            const pCap = sData.capacities?.[pileId];
            if (!pCap) continue;
            const dTarget = parseFloat(pCap.depth_for_target);
            if (!isNaN(dTarget) && dTarget > maxReqDepth1) maxReqDepth1 = dTarget;
            const dTargetDif = parseFloat(pCap.depth_for_target_dif);
            if (!isNaN(dTargetDif) && dTargetDif > maxReqDepth1) maxReqDepth1 = dTargetDif;
            if (pCap.depths && pCap.depths.length > 0) {
                const maxD = pCap.depths[pCap.depths.length - 1];
                if (maxD > maxAvailableDepth1) maxAvailableDepth1 = maxD;
            }
        }
        let chartYMax = 65;
        if (maxReqDepth1 > 0) {
            chartYMax = Math.min(maxAvailableDepth1, Math.max(65, Math.ceil((maxReqDepth1 + 6) / 5) * 5));
        }

        let cIdx = 0;

        for (const [sName, sData] of Object.entries(soundings)) {
            const pCap = sData.capacities?.[pileId];
            if (!pCap) continue;

            const pts = [];
            for (let i = 0; i < pCap.depths.length; i++) {
                const d = pCap.depths[i];
                if (d <= chartYMax + 0.6) {
                    const r = pCap.radm[i];
                    pts.push({ x: r, y: d });
                    if (r > maxVisibleX1) maxVisibleX1 = r;
                }
            }

            const isSynth = sName.toLowerCase().includes("médio") || sName.toLowerCase().includes("mean") || sName.toLowerCase().includes("synth");
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
        datasets.push({
            label: `Target Load (${Number(targetLoad).toLocaleString("en-US")} kN)`,
            data: [
                { x: targetLoad, y: 0 },
                { x: targetLoad, y: chartYMax }
            ],
            borderColor: PALETTE.targetLine,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false
        });

        const rawMaxX1 = Math.max(targetLoad * 1.20, maxVisibleX1 * 1.06);
        const roundStep1 = rawMaxX1 > 40000 ? 5000 : 2500;
        const chartXMax1 = Math.ceil(rawMaxX1 / roundStep1) * roundStep1;

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
                        title: { display: true, text: `Allowable Capacity Radm (kN - FS=${Number(analysisResult.fs_global ?? 2.0).toFixed(1)})` },
                        grid: { color: "rgba(156, 163, 175, 0.15)" },
                        min: 0,
                        max: chartXMax1
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Depth (m)" },
                        grid: { color: "rgba(156, 163, 175, 0.15)" },
                        max: chartYMax,
                        ticks: {
                            stepSize: chartYMax > 80 ? 10 : 5
                        }
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
            const targetLoad = analysisResult.target_load_kN || projectData.target_load_kN || 21400;
            let maxVisibleX2 = targetLoad;

            const datasets = [];
            const piles = analysisResult.piles || [];
            const pileColors = [PALETTE.blue, PALETTE.emerald, PALETTE.purple];
            const fsMode = document.getElementById("select-summary-fs-mode")?.value || "both";
            const fsGlob = analysisResult.fs_global ?? analysisResult.fs ?? projectData.fs_global ?? 2.0;
            const fsLat = analysisResult.fs_lateral ?? projectData.fs_lateral ?? 1.5;
            const fsTip = analysisResult.fs_ponta ?? projectData.fs_ponta ?? 3.0;

            let maxReqDepth2 = 0;
            let maxAvailableDepth2 = 65;
            piles.forEach(p => {
                const pCap = sData.capacities?.[p.id];
                if (!pCap) return;
                const dTarget = parseFloat(pCap.depth_for_target);
                if (!isNaN(dTarget) && dTarget > maxReqDepth2) maxReqDepth2 = dTarget;
                const dTargetDif = parseFloat(pCap.depth_for_target_dif);
                if (!isNaN(dTargetDif) && dTargetDif > maxReqDepth2) maxReqDepth2 = dTargetDif;
                if (pCap.depths && pCap.depths.length > 0) {
                    const maxD = pCap.depths[pCap.depths.length - 1];
                    if (maxD > maxAvailableDepth2) maxAvailableDepth2 = maxD;
                }
            });
            let chartYMax = 65;
            if (maxReqDepth2 > 0) {
                chartYMax = Math.min(maxAvailableDepth2, Math.max(65, Math.ceil((maxReqDepth2 + 6) / 5) * 5));
            }

            piles.forEach((p, idx) => {
                const pCap = sData.capacities?.[p.id];
                if (!pCap) return;

                if (fsMode === "global" || fsMode === "both") {
                    const pts = [];
                    for (let i = 0; i < pCap.depths.length; i++) {
                        const d = pCap.depths[i];
                        if (d <= chartYMax + 0.6) {
                            const r = pCap.radm[i];
                            pts.push({ x: r, y: d });
                            if (r > maxVisibleX2) maxVisibleX2 = r;
                        }
                    }
                    datasets.push({
                        label: (fsMode === "both") ? `${p.name} - Global (FS=${Number(fsGlob).toFixed(1)})` : `${p.name} (Global)`,
                        data: pts,
                        borderColor: pileColors[idx % pileColors.length],
                        borderWidth: 2.5,
                        pointRadius: 0,
                        tension: 0.1
                    });
                }

                if ((fsMode === "differentiated" || fsMode === "both") && pCap.radm_dif) {
                    const ptsDif = [];
                    for (let i = 0; i < pCap.depths.length; i++) {
                        const d = pCap.depths[i];
                        if (d <= chartYMax + 0.6) {
                            const r = pCap.radm_dif[i];
                            ptsDif.push({ x: r, y: d });
                            if (r > maxVisibleX2) maxVisibleX2 = r;
                        }
                    }
                    datasets.push({
                        label: (fsMode === "both") ? `${p.name} - DIF (FSs=${Number(fsLat).toFixed(1)} / FSp=${Number(fsTip).toFixed(1)})` : `${p.name} (Differentiated)`,
                        data: ptsDif,
                        borderColor: pileColors[idx % pileColors.length],
                        borderWidth: (fsMode === "both") ? 2.0 : 2.5,
                        borderDash: (fsMode === "both") ? [6, 4] : [],
                        pointRadius: 0,
                        tension: 0.1
                    });
                }
            });

            // Target Line
            datasets.push({
                label: `Target Load (${Number(targetLoad).toLocaleString("en-US")} kN)`,
                data: [
                    { x: targetLoad, y: 0 },
                    { x: targetLoad, y: chartYMax }
                ],
                borderColor: PALETTE.targetLine,
                borderWidth: 2,
                borderDash: [6, 4],
                pointRadius: 0,
                fill: false
            });

            const rawMaxX2 = Math.max(targetLoad * 1.20, maxVisibleX2 * 1.06);
            const roundStep2 = rawMaxX2 > 40000 ? 5000 : 2500;
            const chartXMax2 = Math.ceil(rawMaxX2 / roundStep2) * roundStep2;

            let xTitle = "Allowable Capacity Radm (kN)";
            if (fsMode === "global") xTitle = `Allowable Capacity Radm (kN - Global FS = ${Number(fsGlob).toFixed(1)})`;
            else if (fsMode === "differentiated") xTitle = `Allowable Capacity Radm (kN - DIF FSs=${Number(fsLat).toFixed(1)} / FSp=${Number(fsTip).toFixed(1)})`;
            else xTitle = `Allowable Capacity Radm (kN - Global vs DIF)`;

            chartDiametersCompInst = new Chart(ctxDiam, {
                type: "line",
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: "linear",
                            title: { display: true, text: xTitle },
                            grid: { color: "rgba(156, 163, 175, 0.15)" },
                            min: 0,
                            max: chartXMax2
                        },
                        y: {
                            type: "linear",
                            reverse: true,
                            title: { display: true, text: "Depth (m)" },
                            grid: { color: "rgba(156, 163, 175, 0.15)" },
                            max: chartYMax,
                            ticks: {
                                stepSize: chartYMax > 80 ? 10 : 5
                            }
                        }
                    }
                }
            });
        }
    }

    // 3. Chart Target Depths Summary across Soundings
    const ctxDepths = document.getElementById("chart-target-depths-summary");
    if (ctxDepths) {
        if (chartTargetDepthsSummaryInst) chartTargetDepthsSummaryInst.destroy();

        const summary = analysisResult.summary_table || [];
        const labels = summary.map(r => r.sounding_name);
        const data48 = summary.map(r => (r.piles?.["pile_48in"]?.depth_for_target_m !== undefined && r.piles?.["pile_48in"]?.depth_for_target_m !== null) ? Number(r.piles["pile_48in"].depth_for_target_m) : null);
        const data54 = summary.map(r => (r.piles?.["pile_54in"]?.depth_for_target_m !== undefined && r.piles?.["pile_54in"]?.depth_for_target_m !== null) ? Number(r.piles["pile_54in"].depth_for_target_m) : null);
        const data60 = summary.map(r => (r.piles?.["pile_60in"]?.depth_for_target_m !== undefined && r.piles?.["pile_60in"]?.depth_for_target_m !== null) ? Number(r.piles["pile_60in"].depth_for_target_m) : null);

        chartTargetDepthsSummaryInst = new Chart(ctxDepths, {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "Ø 1.2 m (48\")",
                        data: data48,
                        backgroundColor: PALETTE.blue + "CC",
                        borderColor: PALETTE.blue,
                        borderWidth: 1.5,
                        borderRadius: 4
                    },
                    {
                        label: "Ø 1.3 m (54\")",
                        data: data54,
                        backgroundColor: PALETTE.emerald + "CC",
                        borderColor: PALETTE.emerald,
                        borderWidth: 1.5,
                        borderRadius: 4
                    },
                    {
                        label: "Ø 1.5 m (60\")",
                        data: data60,
                        backgroundColor: PALETTE.purple + "CC",
                        borderColor: PALETTE.purple,
                        borderWidth: 1.5,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { weight: "600", size: 11 } }
                    },
                    y: {
                        type: "linear",
                        title: { display: true, text: "Required Depth (m)" },
                        grid: { color: "rgba(156, 163, 175, 0.15)" },
                        ticks: {
                            callback: (v) => `${v} m`
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw !== null ? Number(ctx.raw).toFixed(1) + ' m' : 'Does not reach'}`
                        }
                    }
                }
            }
        });
    }
}

// Funções de Controle de Layout da Aba 1 (Visão Geral)
function setSummaryChartsLayout(mode) {
    const grid = document.getElementById("summary-charts-grid");
    const btn3Col = document.getElementById("btn-summary-layout-3col");
    const btn2Col = document.getElementById("btn-summary-layout-2col");
    const btn1Col = document.getElementById("btn-summary-layout-1col");
    if (!grid) return;

    const activeBtnClass = "px-2.5 py-1 text-xs font-bold rounded-lg border border-blue-600 bg-blue-600 text-white shadow-xs transition-all";
    const inactiveBtnClass = "px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all";

    if (mode === "1col") {
        grid.className = "grid grid-cols-1 gap-6";
        if (btn1Col) btn1Col.className = activeBtnClass;
        if (btn2Col) btn2Col.className = inactiveBtnClass;
        if (btn3Col) btn3Col.className = inactiveBtnClass;
    } else if (mode === "2col") {
        grid.className = "grid grid-cols-1 lg:grid-cols-2 gap-6";
        if (btn2Col) btn2Col.className = activeBtnClass;
        if (btn3Col) btn3Col.className = inactiveBtnClass;
        if (btn1Col) btn1Col.className = inactiveBtnClass;
    } else {
        // Modo Padrão: 3 colunas
        grid.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6";
        if (btn3Col) btn3Col.className = activeBtnClass;
        if (btn2Col) btn2Col.className = inactiveBtnClass;
        if (btn1Col) btn1Col.className = inactiveBtnClass;
    }

    setTimeout(() => {
        if (chartCapacityCompInst) chartCapacityCompInst.resize();
        if (chartDiametersCompInst) chartDiametersCompInst.resize();
        if (chartTargetDepthsSummaryInst) chartTargetDepthsSummaryInst.resize();
    }, 100);
}

// Funções de Controle de Layout da Aba 2 (Capacidade por Eixo)
function setAxesLayout(mode) {
    const grid = document.getElementById("axes-layout-grid");
    const btn2Col = document.getElementById("btn-axes-layout-2col");
    const btn1Col = document.getElementById("btn-axes-layout-1col");
    if (!grid) return;

    const activeBtnClass = "px-2.5 py-1 text-xs font-bold rounded-lg border border-blue-600 bg-blue-600 text-white shadow-xs transition-all";
    const inactiveBtnClass = "px-2.5 py-1 text-xs font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all";

    if (mode === "1col") {
        grid.className = "grid grid-cols-1 gap-6";
        if (btn1Col) btn1Col.className = activeBtnClass;
        if (btn2Col) btn2Col.className = inactiveBtnClass;
    } else {
        // Modo Padrão: 2 colunas (Tabela à esquerda, Gráfico à direita)
        grid.className = "grid grid-cols-1 xl:grid-cols-2 gap-6 items-start";
        if (btn2Col) btn2Col.className = activeBtnClass;
        if (btn1Col) btn1Col.className = inactiveBtnClass;
    }

    setTimeout(() => {
        if (chartAxesInst) chartAxesInst.resize();
    }, 100);
}

// RENDER TABELA E GRÁFICO DA ABA 2 (EIXOS)
function renderAxesTable() {
    const tbody = document.getElementById("axes-table-body");
    const selAxis = document.getElementById("select-chart-axis");
    if (!tbody || !analysisResult) return;

    const prevSelVal = selAxis?.value;
    tbody.innerHTML = "";
    if (selAxis) selAxis.innerHTML = "";

    const axes = analysisResult.axes_analysis || [];
    const fsGlob = analysisResult.fs_global ?? analysisResult.fs ?? projectData.fs_global ?? 2.0;
    const fsLat = analysisResult.fs_lateral ?? projectData.fs_lateral ?? 1.5;
    const fsTip = analysisResult.fs_ponta ?? projectData.fs_ponta ?? 3.0;
    const tableBasis = document.getElementById("select-axes-table-basis")?.value || (projectData.consider_pile_weight ? "net" : "gross");

    axes.forEach((ax, idx) => {
        const cotaTopo = (ax.cota_topo_m !== undefined) ? ax.cota_topo_m : ax.cota_inicio_m;
        const p48 = ax.piles["pile_48in"] || {};
        const p54 = ax.piles["pile_54in"] || {};
        const p60 = ax.piles["pile_60in"] || {};

        const fmtProf = (v) => (v !== undefined && v !== null && v !== "N/A") ? `${Number(v).toFixed(2)} m` : "<span class='text-rose-500 font-bold'>N/A</span>";

        // Global values
        const fGross48 = p48.cota_fundo_gross_global_m ?? p48.cota_fundo_global_m ?? p48.cota_fundo_m;
        const eGross48 = p48.embutimento_gross_global_m ?? p48.embutimento_global_m ?? p48.embutimento_m;
        const fNet48 = p48.cota_fundo_net_global_m ?? fGross48;
        const eNet48 = p48.embutimento_net_global_m ?? eGross48;
        const wNet48 = p48.w_pile_net_target_global_kN ?? 0;

        const fGross54 = p54.cota_fundo_gross_global_m ?? p54.cota_fundo_global_m ?? p54.cota_fundo_m;
        const eGross54 = p54.embutimento_gross_global_m ?? p54.embutimento_global_m ?? p54.embutimento_m;
        const fNet54 = p54.cota_fundo_net_global_m ?? fGross54;
        const eNet54 = p54.embutimento_net_global_m ?? eGross54;
        const wNet54 = p54.w_pile_net_target_global_kN ?? 0;

        const fGross60 = p60.cota_fundo_gross_global_m ?? p60.cota_fundo_global_m ?? p60.cota_fundo_m;
        const eGross60 = p60.embutimento_gross_global_m ?? p60.embutimento_global_m ?? p60.embutimento_m;
        const fNet60 = p60.cota_fundo_net_global_m ?? fGross60;
        const eNet60 = p60.embutimento_net_global_m ?? eGross60;
        const wNet60 = p60.w_pile_net_target_global_kN ?? 0;

        // Diferenciado values
        const fGrossDif48 = p48.cota_fundo_gross_dif_m ?? p48.cota_fundo_dif_m ?? fGross48;
        const eGrossDif48 = p48.embutimento_gross_dif_m ?? p48.embutimento_dif_m ?? eGross48;
        const fNetDif48 = p48.cota_fundo_net_dif_m ?? fGrossDif48;
        const eNetDif48 = p48.embutimento_net_dif_m ?? eGrossDif48;
        const wNetDif48 = p48.w_pile_net_target_dif_kN ?? 0;

        const fGrossDif54 = p54.cota_fundo_gross_dif_m ?? p54.cota_fundo_dif_m ?? fGross54;
        const eGrossDif54 = p54.embutimento_gross_dif_m ?? p54.embutimento_dif_m ?? eGross54;
        const fNetDif54 = p54.cota_fundo_net_dif_m ?? fGrossDif54;
        const eNetDif54 = p54.embutimento_net_dif_m ?? eGrossDif54;
        const wNetDif54 = p54.w_pile_net_target_dif_kN ?? 0;

        const fGrossDif60 = p60.cota_fundo_gross_dif_m ?? p60.cota_fundo_dif_m ?? fGross60;
        const eGrossDif60 = p60.embutimento_gross_dif_m ?? p60.embutimento_dif_m ?? eGross60;
        const fNetDif60 = p60.cota_fundo_net_dif_m ?? fGrossDif60;
        const eNetDif60 = p60.embutimento_net_dif_m ?? eGrossDif60;
        const wNetDif60 = p60.w_pile_net_target_dif_kN ?? 0;

        const renderFundoCell = (fNet, fGross, w) => {
            if (tableBasis === "compare") {
                return `<div><span class="font-bold text-blue-700 dark:text-blue-300">${fmtProf(fNet)}</span> <span class="text-[9px] text-amber-600 dark:text-amber-400 font-extrabold">(Net)</span><br><span class="text-[10px] text-gray-400 font-medium">${fmtProf(fGross)} (Gross)</span></div>`;
            } else if (tableBasis === "net") {
                const subTxt = w > 0 ? `<br><span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold" title="Effective submerged self-weight">W ≈ ${Math.round(w).toLocaleString('en-US')} kN</span>` : "";
                return `<div><span class="font-bold text-blue-700 dark:text-blue-300">${fmtProf(fNet)}</span>${subTxt}</div>`;
            } else {
                return `<span class="font-bold text-blue-700 dark:text-blue-300">${fmtProf(fGross)}</span>`;
            }
        };

        const renderEmbCell = (eNet, eGross, w) => {
            if (tableBasis === "compare") {
                return `<div><span class="font-bold text-emerald-700 dark:text-emerald-300">${fmtProf(eNet)}</span> <span class="text-[9px] text-amber-600 dark:text-amber-400 font-extrabold">(Net)</span><br><span class="text-[10px] text-gray-400 font-medium">${fmtProf(eGross)} (Gross, W=${Math.round(w)} kN)</span></div>`;
            } else if (tableBasis === "net") {
                const subTxt = w > 0 ? `<br><span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold">Net (W deducted)</span>` : "";
                return `<div><span class="font-bold text-emerald-700 dark:text-emerald-300">${fmtProf(eNet)}</span>${subTxt}</div>`;
            } else {
                return `<span class="font-bold text-emerald-700 dark:text-emerald-300">${fmtProf(eGross)}</span>`;
            }
        };

        const renderFundoDifCell = (fNet, fGross, w) => {
            if (tableBasis === "compare") {
                return `<div><span class="font-bold text-purple-700 dark:text-purple-300">${fmtProf(fNet)}</span> <span class="text-[9px] text-amber-600 dark:text-amber-400 font-extrabold">(Net)</span><br><span class="text-[10px] text-gray-400 font-medium">${fmtProf(fGross)} (Gross)</span></div>`;
            } else if (tableBasis === "net") {
                const subTxt = w > 0 ? `<br><span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold" title="Effective submerged self-weight">W ≈ ${Math.round(w).toLocaleString('en-US')} kN</span>` : "";
                return `<div><span class="font-bold text-purple-700 dark:text-purple-300">${fmtProf(fNet)}</span>${subTxt}</div>`;
            } else {
                return `<span class="font-bold text-purple-700 dark:text-purple-300">${fmtProf(fGross)}</span>`;
            }
        };

        const renderEmbDifCell = (eNet, eGross, w) => {
            if (tableBasis === "compare") {
                return `<div><span class="font-bold text-purple-700 dark:text-purple-300">${fmtProf(eNet)}</span> <span class="text-[9px] text-amber-600 dark:text-amber-400 font-extrabold">(Net)</span><br><span class="text-[10px] text-gray-400 font-medium">${fmtProf(eGross)} (Gross, W=${Math.round(w)} kN)</span></div>`;
            } else if (tableBasis === "net") {
                const subTxt = w > 0 ? `<br><span class="text-[9px] text-amber-600 dark:text-amber-400 font-bold">Net (W deducted)</span>` : "";
                return `<div><span class="font-bold text-purple-700 dark:text-purple-300">${fmtProf(eNet)}</span>${subTxt}</div>`;
            } else {
                return `<span class="font-bold text-purple-700 dark:text-purple-300">${fmtProf(eGross)}</span>`;
            }
        };

        const haskData = HASKONING_BENCHMARK[ax.name];
        const isHaskActive = !!projectData.is_haskoning_compare_active;

        const renderFundoHaskComp = (fNet, fGross, w) => {
            const baseHtml = renderFundoCell(fNet, fGross, w);
            if (!isHaskActive || !haskData) return baseHtml;
            const targetVal = (tableBasis === "gross") ? fGross : fNet;
            const numVal = parseFloat(targetVal);
            if (isNaN(numVal)) return baseHtml;

            const delta = numVal - haskData.tip_el_m;
            const sign = delta > 0 ? "+" : "";
            const absDelta = Math.abs(delta);
            let pillColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700";
            if (absDelta > 3.0) {
                pillColor = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700";
            } else if (absDelta > 1.5) {
                pillColor = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-700";
            }

            return `
                <div>
                    ${baseHtml}
                    <div class="mt-1 pt-1 border-t border-violet-200 dark:border-violet-900/60 flex flex-col items-center">
                        <span class="text-[9px] text-violet-700 dark:text-violet-300 font-bold">Hask: <b>${haskData.tip_el_m.toFixed(2)}m</b></span>
                        <span class="text-[8px] font-black px-1.5 py-0.2 rounded-full border ${pillColor}" title="Diferença da Cota de Fundo calculada em relação à Haskoning (${haskData.tip_el_m.toFixed(2)}m)">
                            Δ ${sign}${delta.toFixed(2)}m
                        </span>
                    </div>
                </div>
            `;
        };

        const renderEmbHaskComp = (eNet, eGross, w) => {
            const baseHtml = renderEmbCell(eNet, eGross, w);
            if (!isHaskActive || !haskData) return baseHtml;
            const targetVal = (tableBasis === "gross") ? eGross : eNet;
            const numVal = parseFloat(targetVal);
            if (isNaN(numVal)) return baseHtml;

            const delta = numVal - haskData.emb_m;
            const sign = delta > 0 ? "+" : "";
            const absDelta = Math.abs(delta);
            let pillColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700";
            if (absDelta > 3.0) {
                pillColor = "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700";
            } else if (absDelta > 1.5) {
                pillColor = "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-700";
            }

            return `
                <div>
                    ${baseHtml}
                    <div class="mt-1 pt-1 border-t border-violet-200 dark:border-violet-900/60 flex flex-col items-center">
                        <span class="text-[9px] text-violet-700 dark:text-violet-300 font-bold">Hask: <b>${haskData.emb_m.toFixed(1)}m</b></span>
                        <span class="text-[8px] font-black px-1.5 py-0.2 rounded-full border ${pillColor}" title="Diferença do Embutimento calculado em relação à Haskoning (${haskData.emb_m.toFixed(1)}m)">
                            Δ ${sign}${delta.toFixed(2)}m
                        </span>
                    </div>
                </div>
            `;
        };

        let axisNameHtml = `<span class="font-bold text-gray-900 dark:text-white">Axis ${ax.name}</span>`;
        if (isHaskActive && haskData) {
            axisNameHtml = `
                <div>
                    <span class="text-sm font-black text-gray-900 dark:text-white">Axis ${ax.name}</span>
                    <span class="text-[9px] font-bold block text-violet-600 dark:text-violet-400 mt-0.5">P: ${haskData.target_load_kN.toLocaleString('pt-BR')} kN</span>
                </div>
            `;
        }

        // Linha 1: FS Global
        const tr1 = document.createElement("tr");
        tr1.className = (idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50/60 dark:bg-gray-700/20") + " hover:bg-blue-50/40 dark:hover:bg-blue-900/10";
        tr1.innerHTML = `
            <td rowspan="2" class="p-3 border-r border-b border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white align-middle">
                ${axisNameHtml}
            </td>
            <td rowspan="2" class="p-2.5 text-center font-mono font-bold text-sky-700 dark:text-sky-300 border-r border-b border-gray-200 dark:border-gray-700 align-middle">
                <div class="flex items-center justify-center gap-1">
                    <input type="number" id="input-axis-cota-${ax.name}" step="0.05" value="${Number(cotaTopo).toFixed(2)}" onchange="updateAxisCotaTopo('${ax.name}', this.value)" class="w-20 px-1.5 py-1 text-center font-mono font-bold text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-sky-500 shadow-xs" title="Cut-off elevation / shaft top elevation">
                    <span class="text-xs text-gray-500">m</span>
                </div>
            </td>
            <td class="p-2 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    <span>🛡️</span> Global FS = ${Number(fsGlob).toFixed(2)}
                </span>
            </td>
            <td class="p-2 text-center font-mono font-bold text-blue-700 dark:text-blue-300">${renderFundoCell(fNet48, fGross48, wNet48)}</td>
            <td class="p-2 text-center font-mono font-bold text-blue-700 dark:text-blue-300">${renderFundoCell(fNet54, fGross54, wNet54)}</td>
            <td class="p-2 text-center font-mono font-bold text-blue-700 dark:text-blue-300 border-r border-gray-200 dark:border-gray-700">${renderFundoHaskComp(fNet60, fGross60, wNet60)}</td>
            <td class="p-2 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">${renderEmbCell(eNet48, eGross48, wNet48)}</td>
            <td class="p-2 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">${renderEmbCell(eNet54, eGross54, wNet54)}</td>
            <td class="p-2 text-center font-mono font-bold text-emerald-700 dark:text-emerald-300">${renderEmbHaskComp(eNet60, eGross60, wNet60)}</td>
            <td rowspan="2" class="p-2 text-center border-b border-gray-200 dark:border-gray-700 align-middle">
                <button type="button" onclick="editAxis(${idx})" class="p-1 text-blue-600 hover:text-blue-800" title="Edit">✏️</button>
                <button type="button" onclick="deleteAxis(${idx})" class="p-1 text-rose-600 hover:text-rose-800" title="Delete">🗑️</button>
            </td>
        `;
        const selectThisAxis = (fsMode) => {
            if (selAxis && selAxis.value !== ax.name) {
                selAxis.value = ax.name;
            }
            if (fsMode) {
                const selFsMode = document.getElementById("select-chart-axis-fs-mode");
                if (selFsMode) selFsMode.value = fsMode;
            }
            renderAxesChart();
            updateActiveTableRowHighlight(ax.name, fsMode);
        };
        tr1.setAttribute("data-axis", ax.name);
        tr1.setAttribute("data-fs-mode", "global");
        tr1.style.cursor = "pointer";
        tr1.title = `Click to view chart for Axis ${ax.name} (Global FS)`;
        tr1.onclick = (e) => {
            if (["INPUT", "BUTTON"].includes(e.target.tagName)) return;
            selectThisAxis("global");
        };
        tbody.appendChild(tr1);

        // Linha 2: FS Diferenciado
        const tr2 = document.createElement("tr");
        tr2.setAttribute("data-axis", ax.name);
        tr2.setAttribute("data-fs-mode", "differentiated");
        tr2.className = (idx % 2 === 0 ? "bg-purple-50/20 dark:bg-purple-950/10" : "bg-purple-50/40 dark:bg-purple-950/20") + " hover:bg-purple-100/30 border-b border-gray-200 dark:border-gray-700 transition-all";
        tr2.style.cursor = "pointer";
        tr2.title = `Click to view chart for Axis ${ax.name} (DIF FS)`;
        tr2.onclick = (e) => {
            if (["INPUT", "BUTTON"].includes(e.target.tagName)) return;
            selectThisAxis("differentiated");
        };
        tr2.innerHTML = `
            <td class="p-2 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                    <span>⚖️</span> DIF (FS<sub>s</sub>=${Number(fsLat).toFixed(2)} / FS<sub>p</sub>=${Number(fsTip).toFixed(2)})
                </span>
            </td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${renderFundoDifCell(fNetDif48, fGrossDif48, wNetDif48)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${renderFundoDifCell(fNetDif54, fGrossDif54, wNetDif54)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300 border-r border-gray-200 dark:border-gray-700">${renderFundoHaskComp(fNetDif60, fGrossDif60, wNetDif60)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${renderEmbDifCell(eNetDif48, eGrossDif48, wNetDif48)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${renderEmbDifCell(eNetDif54, eGrossDif54, wNetDif54)}</td>
            <td class="p-2 text-center font-mono font-bold text-purple-700 dark:text-purple-300">${renderEmbHaskComp(eNetDif60, eGrossDif60, wNetDif60)}</td>
        `;
        tbody.appendChild(tr2);

        if (selAxis) {
            const opt = document.createElement("option");
            opt.value = ax.name;
            opt.text = `Axis ${ax.name} (Top El.: ${Number(cotaTopo).toFixed(2)}m)`;
            selAxis.appendChild(opt);
        }
    });

    if (selAxis && prevSelVal && Array.from(selAxis.options).some(o => o.value === prevSelVal)) {
        selAxis.value = prevSelVal;
    }

    const selDiam = document.getElementById("select-chart-axis-diameter");
    if (selDiam && analysisResult.piles && analysisResult.piles.length > 0) {
        const prevDiamVal = selDiam.value;
        selDiam.innerHTML = "";
        const optAll = document.createElement("option");
        optAll.value = "all";
        optAll.text = "All Diameters (Todos)";
        selDiam.appendChild(optAll);
        analysisResult.piles.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.text = `${p.name} (D=${Number(p.diam_m).toFixed(2)}m)`;
            selDiam.appendChild(opt);
        });
        if (prevDiamVal && Array.from(selDiam.options).some(o => o.value === prevDiamVal)) {
            selDiam.value = prevDiamVal;
        }
    }
    const currAxis = selAxis?.value || (axes[0]?.name);
    const currFsMode = document.getElementById("select-chart-axis-fs-mode")?.value || "both";
    updateActiveTableRowHighlight(currAxis, currFsMode);
    if (typeof enableMathInInputs === "function") enableMathInInputs();
}

function updateActiveTableRowHighlight(axisName, fsMode) {
    const tbody = document.getElementById("axes-table-body");
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr");
    rows.forEach(r => {
        r.classList.remove("ring-2", "ring-inset", "ring-blue-500", "ring-purple-500", "bg-blue-50/70", "bg-purple-100/60");
        const rAxis = r.getAttribute("data-axis");
        const rMode = r.getAttribute("data-fs-mode");
        if (rAxis === axisName) {
            if (!fsMode || fsMode === "both" || rMode === fsMode) {
                if (rMode === "global") {
                    r.classList.add("ring-2", "ring-inset", "ring-blue-500", "bg-blue-50/70");
                } else if (rMode === "differentiated") {
                    r.classList.add("ring-2", "ring-inset", "ring-purple-500", "bg-purple-100/60");
                }
            }
        }
    });
}

function syncAxesBasis(source) {
    const elTableBasis = document.getElementById("select-axes-table-basis");
    const elChartBasis = document.getElementById("select-chart-axis-basis");
    if (!elTableBasis || !elChartBasis) return;
    if (source === "table" && elChartBasis.value !== elTableBasis.value) {
        elChartBasis.value = elTableBasis.value;
        renderAxesChart();
    } else if (source === "chart" && elTableBasis.value !== elChartBasis.value) {
        elTableBasis.value = elChartBasis.value;
        renderAxesTable();
    }
}

function renderAxesChart() {
    const ctx = document.getElementById("chart-axes-capacity");
    if (!ctx || !analysisResult) return;

    if (chartAxesInst) chartAxesInst.destroy();

    const isPpt = isPresentationMode;
    const isDark = document.documentElement.classList.contains('dark');
    const titleFont = { family: "'Inter', sans-serif", weight: "bold", size: isPpt ? 14 : 12 };
    const tickFont = { family: "'Inter', sans-serif", weight: isPpt ? "bold" : "600", size: isPpt ? 12 : 11 };
    const legendLabelFont = { family: "'Inter', sans-serif", weight: isPpt ? "bold" : "600", size: isPpt ? 13 : 11 };
    const textColor = isDark ? "#E2E8F0" : "#0F172A";
    const tickColor = isDark ? "#94A3B8" : "#334155";
    const gridColor = isDark ? "rgba(156, 163, 175, 0.20)" : "rgba(156, 163, 175, 0.25)";

    const axisName = document.getElementById("select-chart-axis")?.value || "A";
    const ax = (analysisResult.axes_analysis || []).find(a => a.name === axisName);
    if (!ax) return;

    const fsMode = document.getElementById("select-chart-axis-fs-mode")?.value || "both";
    updateActiveTableRowHighlight(axisName, fsMode);

    // Calcula capacidade iniciando do topo deste eixo
    const critSoundingName = analysisResult.critical_sounding_used || "SPT-01";
    const sData = analysisResult.soundings?.[critSoundingName];
    if (!sData) return;

    const layers = (ax && ax.layers && ax.layers.length > 0)
        ? ax.layers
        : (sData.layers || []);
    const cotaIni = (ax.cota_topo_m !== undefined) ? ax.cota_topo_m : ax.cota_inicio_m;
    const targetLoad = (ax.target_load_kN !== undefined && ax.target_load_kN !== null)
        ? ax.target_load_kN
        : (analysisResult.target_load_kN || projectData.target_load_kN || 21400);

    const fsGlob = analysisResult.fs_global ?? analysisResult.fs ?? projectData.fs_global ?? 2.0;
    const fsLat = analysisResult.fs_lateral ?? projectData.fs_lateral ?? 1.5;
    const fsTip = analysisResult.fs_ponta ?? projectData.fs_ponta ?? 3.0;

    const casingPct = analysisResult.casing_reduction_pct ?? projectData.casing_reduction_pct ?? 10.0;
    const casingFactor = 1.0 - (casingPct / 100.0);
    const casingMode = analysisResult.casing_reduction_mode ?? projectData.casing_reduction_mode ?? "excel_formula";
    const casingLen = (ax.casing_length_m !== undefined && ax.casing_length_m !== null) ? ax.casing_length_m : (analysisResult.casing_length_m ?? projectData.casing_length_m);

    const chartBasis = document.getElementById("select-chart-axis-basis")?.value || (projectData.consider_pile_weight ? "net" : "gross");

    const concGamma = projectData.concrete_unit_weight ?? 24.0;
    const waterGamma = projectData.water_unit_weight ?? 10.0;
    const gammaSubConc = Math.max(0, concGamma - waterGamma);
    const wt = projectData.water_table_m ?? 3.0;

    const maxStratumDepth = layers.length > 0 ? layers[layers.length - 1].z_fim : 132.6;
    const userDepthChoice = document.getElementById("select-chart-axis-depth-max")?.value || "auto";

    let chartYMax = 65;
    if (userDepthChoice === "full") {
        chartYMax = maxStratumDepth;
    } else if (!isNaN(parseFloat(userDepthChoice)) && parseFloat(userDepthChoice) > 0) {
        chartYMax = Math.min(maxStratumDepth, parseFloat(userDepthChoice));
    } else {
        // Auto mode: find maximum required depth across piles for this axis
        let maxRequiredDepth = 0;
        if (ax && ax.piles) {
            Object.values(ax.piles).forEach(p => {
                const cand = [];
                if (chartBasis === "net" || chartBasis === "compare") {
                    if (fsMode === "global" || fsMode === "both") cand.push(p.cota_fundo_net_global_m);
                    if (fsMode === "differentiated" || fsMode === "both") cand.push(p.cota_fundo_net_dif_m);
                }
                if (chartBasis === "gross" || chartBasis === "compare") {
                    if (fsMode === "global" || fsMode === "both") cand.push(p.cota_fundo_gross_global_m);
                    if (fsMode === "differentiated" || fsMode === "both") cand.push(p.cota_fundo_gross_dif_m);
                }
                cand.push(p.cota_fundo_m, p.cota_fundo_global_m, p.cota_fundo_dif_m);
                cand.forEach(v => {
                    const num = parseFloat(v);
                    if (!isNaN(num) && num > maxRequiredDepth) {
                        maxRequiredDepth = num;
                    }
                });
            });
        }

        if (maxRequiredDepth > 0) {
            // Buffer of 6m, rounded up to nearest 5m
            const buffered = Math.ceil((maxRequiredDepth + 6) / 5) * 5;
            chartYMax = Math.min(maxStratumDepth, Math.max(65, buffered));
        } else {
            // Fallback: If no pile has reached the target yet, show down to max stratum depth or 100m
            chartYMax = Math.min(maxStratumDepth, 100);
        }

        const optAuto = document.getElementById("select-chart-axis-depth-max")?.querySelector("option[value='auto']");
        if (optAuto) {
            optAuto.text = `Auto (${Math.round(chartYMax)}m)`;
        }
    }
    const selectedDiam = document.getElementById("select-chart-axis-diameter")?.value || "all";
    const selectedComp = document.getElementById("select-chart-axis-component")?.value || "total";

    const allPiles = analysisResult.piles || [];
    let pilesToRender = allPiles;
    if (selectedDiam !== "all") {
        const matching = allPiles.filter(p => p.id === selectedDiam || String(p.diam_m) === selectedDiam);
        if (matching.length > 0) pilesToRender = matching;
    }

    const datasets = [];
    const colors = [PALETTE.blue, PALETTE.emerald, PALETTE.purple, PALETTE.amber];
    let maxVisibleRadm = (selectedComp === "lateral" || selectedComp === "tip") ? 1000 : targetLoad;

    const axLenAbove = (ax.pile_length_above_start_m !== undefined && ax.pile_length_above_start_m !== null)
        ? Number(ax.pile_length_above_start_m)
        : Number(projectData.pile_length_above_start_m || 0.0);

    const isSinglePile = pilesToRender.length === 1;

    pilesToRender.forEach((p, idx) => {
        const wAbove = (axLenAbove > 0 && projectData.consider_pile_weight) ? (p.area_m2 * axLenAbove * gammaSubConc) : 0;
        let sumW = wAbove;
        let sumRs = 0;
        const ptsGrossGlob = [];
        const ptsGrossDif = [];
        const ptsNetGlob = [];
        const ptsNetDif = [];
        const ptsLatGlob = [];
        const ptsTipGlob = [];
        const ptsLatDif = [];
        const ptsTipDif = [];

        const perim = p.perimeter_m;
        const area = p.area_m2;

        // Ponto inicial na Cota de Topo / Início (Embutimento = 0.0 m)
        // No topo: atrito lateral Rs = 0. Se consider_pile_weight estiver ativo, desconta o peso acima da cota (wAbove).
        const lyrTopo = layers.find(l => l.z_ini <= cotaIni && l.z_fim >= cotaIni) || layers[0];
        const qpTopo = lyrTopo ? (lyrTopo.qp || 0) : 0;
        const rpTopo = qpTopo * area;
        let radmTipGlobInit = Math.floor(rpTopo / fsGlob);
        let radmTipDifInit = Math.floor(rpTopo / fsTip);
        if (casingMode === "excel_formula" && (!casingLen || casingLen > 0)) {
            radmTipGlobInit = Math.floor((rpTopo / fsGlob) * casingFactor);
            radmTipDifInit = Math.floor((rpTopo / fsTip) * casingFactor);
        }

        const radmNetGlobInit = Math.max(0, Math.floor(radmTipGlobInit - wAbove));
        const radmNetDifInit = Math.max(0, Math.floor(radmTipDifInit - wAbove));

        ptsGrossGlob.push({ x: radmTipGlobInit, y: cotaIni, wPile: 0, radmNet: radmNetGlobInit, radmGross: radmTipGlobInit, comp: 'total', lyr: lyrTopo });
        ptsGrossDif.push({ x: radmTipDifInit, y: cotaIni, wPile: 0, radmNet: radmNetDifInit, radmGross: radmTipDifInit, comp: 'total', lyr: lyrTopo });
        ptsNetGlob.push({ x: radmNetGlobInit, y: cotaIni, wPile: wAbove, radmGross: radmTipGlobInit, radmNet: radmNetGlobInit, comp: 'total', lyr: lyrTopo });
        ptsNetDif.push({ x: radmNetDifInit, y: cotaIni, wPile: wAbove, radmGross: radmTipDifInit, radmNet: radmNetDifInit, comp: 'total', lyr: lyrTopo });

        ptsLatGlob.push({ x: 0, y: cotaIni, wPile: wAbove, comp: 'lateral', lyr: lyrTopo });
        ptsTipGlob.push({ x: radmTipGlobInit, y: cotaIni, wPile: wAbove, comp: 'tip', lyr: lyrTopo });
        ptsLatDif.push({ x: 0, y: cotaIni, wPile: wAbove, comp: 'lateral', lyr: lyrTopo });
        ptsTipDif.push({ x: radmTipDifInit, y: cotaIni, wPile: wAbove, comp: 'tip', lyr: lyrTopo });

        layers.forEach(lyr => {
            const zFim = lyr.z_fim;
            const zIni = lyr.z_ini;
            const dz = lyr.dz;
            if (zFim <= cotaIni) return;
            if (zIni >= chartYMax) return;

            const zA = Math.max(zIni, cotaIni);
            const zB = Math.min(zFim, chartYMax);
            const effDz = Math.max(0, zB - zA);
            if (effDz <= 0) return;

            const rp = lyr.qp * area;
            let radmGlob = 0;
            let radmDif = 0;
            let radmLatGlob = 0;
            let radmTipGlob = 0;
            let radmLatDif = 0;
            let radmTipDif = 0;

            if (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0) {
                const casingEnd = cotaIni + casingLen;
                const casedDz = Math.max(0, Math.min(zB, casingEnd) - zA);
                const uncasedDz = Math.max(0, effDz - casedDz);
                sumRs += lyr.qs * perim * (casedDz * casingFactor + uncasedDz * 1.0);
                const rn = rp + sumRs;
                radmGlob = Math.floor(rn / fsGlob);
                radmDif = Math.floor((sumRs / fsLat) + (rp / fsTip));
                radmLatGlob = Math.floor(sumRs / fsGlob);
                radmTipGlob = Math.floor(rp / fsGlob);
                radmLatDif = Math.floor(sumRs / fsLat);
                radmTipDif = Math.floor(rp / fsTip);
            } else {
                let rsSeg = lyr.qs * perim * dz;
                if (casingMode === "lateral_only") {
                    rsSeg *= casingFactor;
                }
                sumRs += rsSeg;
                const rn = rp + sumRs;

                if (casingMode === "excel_formula") {
                    radmGlob = Math.floor((rn / fsGlob) * casingFactor);
                    radmDif = Math.floor(((sumRs / fsLat) + (rp / fsTip)) * casingFactor);
                    radmLatGlob = Math.floor((sumRs / fsGlob) * casingFactor);
                    radmTipGlob = Math.floor((rp / fsGlob) * casingFactor);
                    radmLatDif = Math.floor((sumRs / fsLat) * casingFactor);
                    radmTipDif = Math.floor((rp / fsTip) * casingFactor);
                } else {
                    radmGlob = Math.floor(rn / fsGlob);
                    radmDif = Math.floor((sumRs / fsLat) + (rp / fsTip));
                    radmLatGlob = Math.floor(sumRs / fsGlob);
                    radmTipGlob = Math.floor(rp / fsGlob);
                    radmLatDif = Math.floor(sumRs / fsLat);
                    radmTipDif = Math.floor(rp / fsTip);
                }
            }

            // Submerged concrete effective self-weight
            let effGamma = gammaSubConc;
            if (projectData.pile_weight_mode === "displaced_soil") {
                const soilGamma = (zB > wt) ? (lyr.gamma_sub ?? 10.0) : (lyr.gamma_total ?? 18.0);
                const cG = (zB > wt) ? gammaSubConc : concGamma;
                effGamma = Math.max(0, cG - soilGamma);
            } else {
                if (zB <= wt) {
                    effGamma = concGamma;
                } else if (zA >= wt) {
                    effGamma = gammaSubConc;
                } else {
                    const dzDry = Math.max(0, wt - zA);
                    const dzSub = Math.max(0, zB - wt);
                    effGamma = (dzDry * concGamma + dzSub * gammaSubConc) / effDz;
                }
            }
            const wSeg = area * effDz * effGamma;
            sumW += wSeg;

            const radmNetGlob = Math.max(0, Math.floor(radmGlob - sumW));
            const radmNetDif = Math.max(0, Math.floor(radmDif - sumW));

            ptsGrossGlob.push({ x: radmGlob, y: zB, wPile: sumW, radmNet: radmNetGlob, radmGross: radmGlob, comp: 'total', lyr: lyr });
            ptsGrossDif.push({ x: radmDif, y: zB, wPile: sumW, radmNet: radmNetDif, radmGross: radmDif, comp: 'total', lyr: lyr });
            ptsNetGlob.push({ x: radmNetGlob, y: zB, wPile: sumW, radmGross: radmGlob, radmNet: radmNetGlob, comp: 'total', lyr: lyr });
            ptsNetDif.push({ x: radmNetDif, y: zB, wPile: sumW, radmGross: radmDif, radmNet: radmNetDif, comp: 'total', lyr: lyr });

            ptsLatGlob.push({ x: radmLatGlob, y: zB, wPile: sumW, comp: 'lateral', lyr: lyr });
            ptsTipGlob.push({ x: radmTipGlob, y: zB, wPile: sumW, comp: 'tip', lyr: lyr });
            ptsLatDif.push({ x: radmLatDif, y: zB, wPile: sumW, comp: 'lateral', lyr: lyr });
            ptsTipDif.push({ x: radmTipDif, y: zB, wPile: sumW, comp: 'tip', lyr: lyr });

            if (selectedComp === 'lateral') {
                if (radmLatGlob > maxVisibleRadm) maxVisibleRadm = radmLatGlob;
                if (radmLatDif > maxVisibleRadm) maxVisibleRadm = radmLatDif;
            } else if (selectedComp === 'tip') {
                if (radmTipGlob > maxVisibleRadm) maxVisibleRadm = radmTipGlob;
                if (radmTipDif > maxVisibleRadm) maxVisibleRadm = radmTipDif;
            } else {
                if (radmGlob > maxVisibleRadm) maxVisibleRadm = radmGlob;
                if (radmDif > maxVisibleRadm) maxVisibleRadm = radmDif;
            }
        });

        const cLabelSuffix = (casingLen !== null && casingLen !== undefined && !isNaN(casingLen) && casingLen >= 0)
            ? `(Casing ${casingLen}m: -${casingPct}%)`
            : `(Casing -${casingPct}%)`;

        const baseColor = colors[idx % colors.length];

        // CASO 1: AMOSTRAGEM SEPARADA (LATERAL, PONTA E TOTAL)
        if (selectedComp === "separated") {
            const isNet = (chartBasis === "net" || chartBasis === "compare");
            const totPts = isNet ? (fsMode === "global" ? ptsNetGlob : ptsNetDif) : (fsMode === "global" ? ptsGrossGlob : ptsGrossDif);
            const latPts = (fsMode === "global") ? ptsLatGlob : ptsLatDif;
            const tipPts = (fsMode === "global") ? ptsTipGlob : ptsTipDif;

            // Paleta IDÊNTICA à referência: Total = Laranja (#EA580C), Lateral = Cinza (#9CA3AF), Ponta = Amarelo (#EAB308)
            const colorTotal = isSinglePile ? "#EA580C" : baseColor;
            const colorLat = isSinglePile ? "#9CA3AF" : baseColor;
            const colorTip = isSinglePile ? "#EAB308" : baseColor;

            // 1. Total Capacity Curve
            const fsLabelTot = (fsMode === "global") ? `FS=${Number(fsGlob).toFixed(2)}` : `DIF: FSs=${Number(fsLat).toFixed(2)}/FSp=${Number(fsTip).toFixed(2)}`;
            datasets.push({
                label: isSinglePile
                    ? `Total Net Radm,net (${fsLabelTot})`
                    : `${p.name} - Total (${fsLabelTot})`,
                data: totPts,
                borderColor: colorTotal,
                borderWidth: isPpt ? 3.5 : 2.6,
                pointRadius: 0,
                tension: 0.1
            });

            // 2. Lateral Capacity Curve (Atrito Lateral)
            const fsLabelLat = (fsMode === "global") ? `FS=${Number(fsGlob).toFixed(2)}` : `FSs=${Number(fsLat).toFixed(2)}`;
            datasets.push({
                label: isSinglePile
                    ? `Lateral Capacity Rs_adm (${fsLabelLat})`
                    : `${p.name} - Lateral (${fsLabelLat})`,
                data: latPts,
                borderColor: colorLat,
                borderDash: [6, 4],
                borderWidth: isPpt ? 3.0 : 2.2,
                pointRadius: 0,
                tension: 0.1
            });

            // 3. Tip Capacity Curve (Resistência de Ponta)
            const fsLabelTip = (fsMode === "global") ? `FS=${Number(fsGlob).toFixed(2)}` : `FSp=${Number(fsTip).toFixed(2)}`;
            datasets.push({
                label: isSinglePile
                    ? `Tip Capacity Rp_adm (${fsLabelTip})`
                    : `${p.name} - Ponta (${fsLabelTip})`,
                data: tipPts,
                borderColor: colorTip,
                borderDash: [6, 4],
                borderWidth: isPpt ? 3.0 : 2.2,
                pointRadius: 0,
                tension: 0.1
            });

            if (chartBasis === "compare") {
                const totGrossPts = (fsMode === "global") ? ptsGrossGlob : ptsGrossDif;
                datasets.push({
                    label: `${p.name} - Gross (No Wpile)`,
                    data: totGrossPts,
                    borderColor: colorTotal,
                    borderDash: [4, 4],
                    borderWidth: 1.8,
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        }
        // CASO 2: APENAS LATERAL
        else if (selectedComp === "lateral") {
            const colorLat = isSinglePile ? "#9CA3AF" : baseColor;
            if (fsMode === "global" || fsMode === "both") {
                datasets.push({
                    label: `${p.name} - Lateral (FS=${Number(fsGlob).toFixed(2)})`,
                    data: ptsLatGlob,
                    borderColor: colorLat,
                    borderWidth: isPpt ? 3.2 : 2.5,
                    borderDash: (fsMode === "both") ? [] : [6, 4],
                    pointRadius: 0,
                    tension: 0.1
                });
            }
            if (fsMode === "differentiated" || fsMode === "both") {
                datasets.push({
                    label: `${p.name} - Lateral DIF (FSs=${Number(fsLat).toFixed(2)})`,
                    data: ptsLatDif,
                    borderColor: colorLat,
                    borderWidth: isPpt ? 3.0 : 2.2,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        }
        // CASO 3: APENAS PONTA
        else if (selectedComp === "tip") {
            const colorTip = isSinglePile ? "#EAB308" : baseColor;
            if (fsMode === "global" || fsMode === "both") {
                datasets.push({
                    label: `${p.name} - Ponta (FS=${Number(fsGlob).toFixed(2)})`,
                    data: ptsTipGlob,
                    borderColor: colorTip,
                    borderWidth: isPpt ? 3.2 : 2.5,
                    borderDash: (fsMode === "both") ? [] : [6, 4],
                    pointRadius: 0,
                    tension: 0.1
                });
            }
            if (fsMode === "differentiated" || fsMode === "both") {
                datasets.push({
                    label: `${p.name} - Ponta DIF (FSp=${Number(fsTip).toFixed(2)})`,
                    data: ptsTipDif,
                    borderColor: colorTip,
                    borderWidth: isPpt ? 3.0 : 2.2,
                    borderDash: [6, 4],
                    pointRadius: 0,
                    tension: 0.1
                });
            }
        }
        // CASO 4: CAPACIDADE TOTAL (PADRÃO)
        else {
            // 1. Caso Global
            if (fsMode === "global" || fsMode === "both") {
                if (chartBasis === "compare") {
                    datasets.push({
                        label: `${p.name} - Gross (FS=${Number(fsGlob).toFixed(2)})`,
                        data: ptsGrossGlob,
                        borderColor: baseColor,
                        borderWidth: isPpt ? 3.5 : 2.2,
                        pointRadius: 0,
                        tension: 0.1
                    });
                    datasets.push({
                        label: `${p.name} - Net (-Wpile)`,
                        data: ptsNetGlob,
                        borderColor: baseColor,
                        borderDash: [5, 4],
                        borderWidth: isPpt ? 3.2 : 2.2,
                        pointRadius: 0,
                        tension: 0.1
                    });
                } else if (chartBasis === "net") {
                    datasets.push({
                        label: `${p.name} - Net (FS=${Number(fsGlob).toFixed(2)}) ${cLabelSuffix}`,
                        data: ptsNetGlob,
                        borderColor: baseColor,
                        borderWidth: isPpt ? 3.5 : 2.5,
                        pointRadius: 0,
                        tension: 0.1
                    });
                } else {
                    datasets.push({
                        label: `${p.name} - Gross (FS=${Number(fsGlob).toFixed(2)}) ${cLabelSuffix}`,
                        data: ptsGrossGlob,
                        borderColor: baseColor,
                        borderWidth: isPpt ? 3.5 : 2.5,
                        pointRadius: 0,
                        tension: 0.1
                    });
                }
            }

            // 2. Caso Diferenciado (FS lateral e FS ponta)
            if (fsMode === "differentiated" || fsMode === "both") {
                if (chartBasis === "compare") {
                    datasets.push({
                        label: `${p.name} - Gross DIF (FSs=${Number(fsLat).toFixed(2)}/FSp=${Number(fsTip).toFixed(2)})`,
                        data: ptsGrossDif,
                        borderColor: baseColor,
                        borderDash: [8, 4],
                        borderWidth: isPpt ? 3.0 : 1.8,
                        pointRadius: 0,
                        tension: 0.1
                    });
                    datasets.push({
                        label: `${p.name} - Net DIF (-Wpile)`,
                        data: ptsNetDif,
                        borderColor: baseColor,
                        borderDash: [2, 3],
                        borderWidth: isPpt ? 3.0 : 1.8,
                        pointRadius: 0,
                        tension: 0.1
                    });
                } else if (chartBasis === "net") {
                    datasets.push({
                        label: `${p.name} - Net DIF (FSs=${Number(fsLat).toFixed(2)}/FSp=${Number(fsTip).toFixed(2)}) ${cLabelSuffix}`,
                        data: ptsNetDif,
                        borderColor: baseColor,
                        borderDash: (fsMode === "both") ? [6, 4] : [],
                        borderWidth: (fsMode === "both") ? (isPpt ? 3.0 : 2.0) : (isPpt ? 3.5 : 2.5),
                        pointRadius: 0,
                        tension: 0.1
                    });
                } else {
                    datasets.push({
                        label: `${p.name} - Gross DIF (FSs=${Number(fsLat).toFixed(2)}/FSp=${Number(fsTip).toFixed(2)}) ${cLabelSuffix}`,
                        data: ptsGrossDif,
                        borderColor: baseColor,
                        borderDash: (fsMode === "both") ? [6, 4] : [],
                        borderWidth: (fsMode === "both") ? (isPpt ? 3.0 : 2.0) : (isPpt ? 3.5 : 2.5),
                        pointRadius: 0,
                        tension: 0.1
                    });
                }
            }
        }
    });

    // Define limite inteligente do eixo X cobrindo a carga alvo e as curvas visíveis com folga proporcional
    const showTargetLine = (selectedComp !== "lateral" && selectedComp !== "tip") || (targetLoad <= maxVisibleRadm * 1.5);
    const rawMaxX = showTargetLine ? Math.max(targetLoad * 1.15, maxVisibleRadm * 1.06) : maxVisibleRadm * 1.12;
    const roundStep = rawMaxX > 40000 ? 5000 : (rawMaxX > 10000 ? 2500 : 1000);
    const chartXMax = Math.ceil(rawMaxX / roundStep) * roundStep;

    // Target Line (se aplicável)
    if (showTargetLine) {
        datasets.push({
            label: `Target Load (${Number(targetLoad).toLocaleString("en-US")} kN)`,
            data: [{ x: targetLoad, y: cotaIni }, { x: targetLoad, y: chartYMax }],
            borderColor: PALETTE.targetLine,
            borderWidth: isPpt ? 3.0 : 2.0,
            borderDash: [6, 4],
            pointRadius: 0
        });

        // Pontos de interceptação da Meta da Tabela (Target Pins)
        if (ax && ax.piles) {
            pilesToRender.forEach((p, pIdx) => {
                const pInfo = ax.piles[p.id];
                if (!pInfo) return;
                const pColor = colors[pIdx % colors.length];

                // Global Target Pins
                if (fsMode === "global" || fsMode === "both") {
                    if (chartBasis === "gross" || chartBasis === "compare") {
                        const depth = pInfo.cota_fundo_gross_global_m ?? pInfo.cota_fundo_global_m;
                        if (depth && !isNaN(parseFloat(depth))) {
                            datasets.push({
                                label: `🎯 Meta Gross Global: ${parseFloat(depth).toFixed(2)}m (${p.name || p.id})`,
                                data: [{ x: targetLoad, y: parseFloat(depth) }],
                                borderColor: PALETTE.blue,
                                backgroundColor: PALETTE.blue,
                                pointRadius: isPpt ? 7 : 5,
                                pointHoverRadius: isPpt ? 9 : 7,
                                pointStyle: 'circle',
                                showLine: false
                            });
                        }
                    }
                    if (chartBasis === "net" || chartBasis === "compare") {
                        const depth = pInfo.cota_fundo_net_global_m;
                        if (depth && !isNaN(parseFloat(depth))) {
                            datasets.push({
                                label: `🎯 Meta Net Global: ${parseFloat(depth).toFixed(2)}m (${p.name || p.id})`,
                                data: [{ x: targetLoad, y: parseFloat(depth) }],
                                borderColor: PALETTE.blue,
                                backgroundColor: PALETTE.blue,
                                pointRadius: isPpt ? 7 : 5,
                                pointHoverRadius: isPpt ? 9 : 7,
                                pointStyle: 'rectRot',
                                showLine: false
                            });
                        }
                    }
                }

                // DIF Target Pins
                if (fsMode === "differentiated" || fsMode === "both") {
                    if (chartBasis === "gross" || chartBasis === "compare") {
                        const depth = pInfo.cota_fundo_gross_dif_m ?? pInfo.cota_fundo_dif_m;
                        if (depth && !isNaN(parseFloat(depth))) {
                            datasets.push({
                                label: `🎯 Meta Gross DIF: ${parseFloat(depth).toFixed(2)}m (${p.name || p.id})`,
                                data: [{ x: targetLoad, y: parseFloat(depth) }],
                                borderColor: PALETTE.purple,
                                backgroundColor: PALETTE.purple,
                                pointRadius: isPpt ? 7 : 5,
                                pointHoverRadius: isPpt ? 9 : 7,
                                pointStyle: 'circle',
                                showLine: false
                            });
                        }
                    }
                    if (chartBasis === "net" || chartBasis === "compare") {
                        const depth = pInfo.cota_fundo_net_dif_m;
                        if (depth && !isNaN(parseFloat(depth))) {
                            datasets.push({
                                label: `🎯 Meta Net DIF: ${parseFloat(depth).toFixed(2)}m (${p.name || p.id})`,
                                data: [{ x: targetLoad, y: parseFloat(depth) }],
                                borderColor: PALETTE.purple,
                                backgroundColor: PALETTE.purple,
                                pointRadius: isPpt ? 7 : 5,
                                pointHoverRadius: isPpt ? 9 : 7,
                                pointStyle: 'rectRot',
                                showLine: false
                            });
                        }
                    }
                }
            });
        }
    }

    // Top Elevation Line
    datasets.push({
        label: `Top El. (${cotaIni.toFixed(2)} m)`,
        data: [{ x: 0, y: cotaIni }, { x: chartXMax, y: cotaIni }],
        borderColor: "#64748B",
        borderWidth: isPpt ? 2.5 : 1.5,
        borderDash: [4, 4],
        pointRadius: 0
    });

    let xAxisTitle = "Cumulative Allowable Capacity Radm (kN)";
    if (selectedComp === "lateral") {
        xAxisTitle = `Allowable Shaft / Lateral Resistance Rs_adm (kN)`;
    } else if (selectedComp === "tip") {
        xAxisTitle = `Allowable Tip / Base Resistance Rp_adm (kN)`;
    } else if (selectedComp === "separated") {
        xAxisTitle = `Allowable Capacity (kN) — Breakdown: Lateral, Tip & Total (${chartBasis === 'net' ? 'Net' : 'Gross'})`;
    } else if (chartBasis === "net") {
        xAxisTitle = `Cumulative Net Allowable Capacity Radm,net = Radm - Wpile (kN)`;
    } else if (chartBasis === "compare") {
        xAxisTitle = `Cumulative Capacity Radm (kN) - Gross vs Net (Deducting Wpile)`;
    } else {
        xAxisTitle = `Cumulative Gross Allowable Capacity Radm,gross (kN)`;
    }

    const badgeCaps = document.getElementById("badge-axis-caps-info");
    if (badgeCaps) {
        const totalBetaCaps = layers.filter(l => l.beta_capped).length;
        const totalQsCaps = layers.filter(l => l.qs_capped).length;
        const totalQpCaps = layers.filter(l => l.qp_capped).length;
        const activeSummary = [];
        if (totalBetaCaps > 0) activeSummary.push(`β ≤ Kp·tanφ' (${totalBetaCaps})`);
        if (totalQsCaps > 0) activeSummary.push(`qs ≤ 4 ksf (${totalQsCaps})`);
        if (totalQpCaps > 0) activeSummary.push(`qp ≤ 60 ksf (${totalQpCaps})`);

        if (activeSummary.length > 0) {
            badgeCaps.classList.remove("hidden");
            badgeCaps.innerHTML = `⚠️ Caps: ${activeSummary.join(" | ")}`;
        } else {
            badgeCaps.classList.add("hidden");
        }
    }

    chartAxesInst = new Chart(ctx, {
        type: "line",
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "nearest", axis: "y", intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        boxWidth: isPpt ? 20 : 14,
                        boxHeight: isPpt ? 9 : 7,
                        font: legendLabelFont,
                        color: textColor,
                        padding: isPpt ? 12 : 8
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => {
                            const yVal = items[0]?.parsed?.y;
                            if (yVal === undefined) return '';
                            const emb = (yVal - cotaIni).toFixed(2);
                            let titleStr = `Tip Elevation: ${yVal.toFixed(2)} m (Net Embedment: ${emb} m)`;
                            const rawObj = items[0]?.raw;
                            const lyr = rawObj?.lyr;
                            if (lyr && lyr.any_cap_active) {
                                const capList = [];
                                if (lyr.beta_capped) {
                                    if (lyr.beta_cap_reason === "kp_tan_phi") capList.push("β ≤ Kp·tan(φ')");
                                    else if (lyr.beta_cap_reason === "shallow_stress") capList.push("σ'v < 43.1 kPa");
                                    else capList.push("β Capped");
                                }
                                if (lyr.qs_capped) capList.push("qs ≤ 4.0 ksf");
                                if (lyr.qp_capped) capList.push("qp ≤ 60.0 ksf");
                                titleStr += ` ⚠️ [Layer Cap: ${capList.join(', ')}]`;
                            }
                            return titleStr;
                        },
                        label: (item) => {
                            const rawObj = item.raw;
                            const xVal = item.parsed.x !== undefined ? Math.round(item.parsed.x).toLocaleString('en-US') + ' kN' : item.raw;
                            if (rawObj && typeof rawObj === 'object') {
                                if (rawObj.comp === 'lateral') {
                                    return ` ${item.dataset.label}: ${xVal} (Lateral / Shaft Resistance)`;
                                }
                                if (rawObj.comp === 'tip') {
                                    return ` ${item.dataset.label}: ${xVal} (Tip / Base Resistance)`;
                                }
                                if (rawObj.wPile !== undefined) {
                                    const wStr = Math.round(rawObj.wPile).toLocaleString('en-US') + ' kN';
                                    if (rawObj.radmGross !== undefined && rawObj.radmNet !== undefined) {
                                        if (item.dataset.label && item.dataset.label.includes("Net")) {
                                            return ` ${item.dataset.label}: ${xVal} [Radm,gross: ${Math.round(rawObj.radmGross).toLocaleString('en-US')} kN - W_pile: ${wStr}]`;
                                        } else {
                                            return ` ${item.dataset.label}: ${xVal} [Radm,net: ${Math.round(rawObj.radmNet).toLocaleString('en-US')} kN (descontando W_pile: ${wStr})]`;
                                        }
                                    }
                                }
                            }
                            return ` ${item.dataset.label}: ${xVal}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: "linear",
                    title: { display: true, text: xAxisTitle, font: titleFont, color: textColor },
                    ticks: { font: tickFont, color: tickColor },
                    grid: { color: gridColor },
                    min: 0,
                    max: chartXMax
                },
                y: {
                    type: "linear",
                    reverse: true,
                    title: { display: true, text: "Drilled Shaft Tip Elevation (m)", font: titleFont, color: textColor },
                    ticks: {
                        stepSize: chartYMax > 80 ? 10 : 5,
                        callback: (val) => `${val} m`,
                        font: tickFont,
                        color: tickColor
                    },
                    grid: { color: gridColor },
                    min: Math.max(0, Math.floor(cotaIni - 2)),
                    max: chartYMax
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
    renderExtrapolationEstimates(activeSoundingName);
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
    if (countEl) countEl.innerText = `${layers.length} layers (${layers[0]?.z_ini || 0}m to ${layers[layers.length - 1]?.z_fim || 0}m)`;

    const soilDisplayMap = {
        "Relleno (Aterro)": "Backfill / Fill",
        "Areias": "Sands",
        "Gravas": "Gravels",
        "Finos": "Fines / Clays"
    };

    layers.forEach((lyr, idx) => {
        const tr = document.createElement("tr");
        tr.className = (idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700/30") +
            " hover:bg-blue-50/50 dark:hover:bg-blue-900/20";

        let soilBadgeClass = "soil-badge-aterro";
        if (lyr.soil_group === "Areias") soilBadgeClass = "soil-badge-areias";
        else if (lyr.soil_group === "Gravas") soilBadgeClass = "soil-badge-gravas";
        else if (lyr.soil_group === "Finos") soilBadgeClass = "soil-badge-finos";

        const soilDisplayName = soilDisplayMap[lyr.soil_group] || lyr.soil_group;

        const rsVal = caps.rs_segment?.[idx] || 0;
        const rnVal = caps.rn?.[idx] || 0;
        const radmVal = caps.radm?.[idx] || 0;
        const radmDifVal = caps.radm_dif?.[idx] ?? radmVal;

        const kpTanPhiStr = (lyr.kp_tan_phi !== undefined) ? lyr.kp_tan_phi.toFixed(3) : "-";
        const betaRawStr = (lyr.beta_raw !== undefined) ? lyr.beta_raw.toFixed(3) : (lyr.beta !== undefined ? lyr.beta.toFixed(3) : "-");
        const betaFhwaStr = (lyr.beta !== undefined) ? lyr.beta.toFixed(3) : "-";

        let betaBadge = "";
        if (lyr.beta_capped) {
            const capReason = lyr.beta_cap_reason === "kp_tan_phi" ? "Normative Cap: Limited by Kp·tan(φ')" :
                              lyr.beta_cap_reason === "shallow_stress" ? "Normative Cap: Shallow stress σ'v < 43.1 kPa" :
                              lyr.beta_cap_reason ? `Normative Cap: ${lyr.beta_cap_reason}` : "Normative Cap Active";
            betaBadge = `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700" title="${capReason}">🔒 cap</span>`;
        }

        let qsBadge = "";
        if (lyr.qs_capped) {
            qsBadge = `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-700" title="AASHTO 2007: qs limited to 4.0 ksf (191.5 kPa)">🔒 4ksf</span>`;
        }

        let qpBadge = "";
        if (lyr.qp_capped) {
            qpBadge = `<span class="ml-1 px-1 py-0.5 rounded text-[8px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-700" title="AASHTO 2024: qp limited to 60.0 ksf (2872.8 kPa)">🔒 60ksf</span>`;
        }

        const isExtrap = !!lyr.is_extrapolated;
        const extrapBadge = isExtrap ? `<span class="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-700" title="Synthesized layer below SPT execution depth">estimated</span>` : "";

        tr.innerHTML = `
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.z_ini.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.z_fim.toFixed(1)}</td>
            <td class="p-2 text-center font-bold border-r border-gray-200 dark:border-gray-700">${lyr.n1_60}</td>
            <td class="p-2 border-r border-gray-200 dark:border-gray-700">
                <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${soilBadgeClass}">${soilDisplayName}</span>
                ${extrapBadge}
            </td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 text-gray-500">${lyr.sucs || "-"}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.gamma.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.sigma_v.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.n60.toFixed(1)}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700">${lyr.phi_deg.toFixed(1)}°</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 font-mono">${kpTanPhiStr}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 text-gray-500 font-mono">${betaRawStr}</td>
            <td class="p-2 text-center border-r border-gray-200 dark:border-gray-700 font-bold bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300 font-mono">${betaFhwaStr}${betaBadge}</td>
            <td class="p-2 text-center font-bold text-amber-700 dark:text-amber-300 border-r border-gray-200 dark:border-gray-700">${lyr.qs.toFixed(1)}${qsBadge}</td>
            <td class="p-2 text-center font-bold text-purple-700 dark:text-purple-300 border-r border-gray-200 dark:border-gray-700">${lyr.qp.toFixed(1)}${qpBadge}</td>
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
    if (pDepth) pDepth.innerText = `Max Depth: ${maxDepthVal.toFixed(1)} m`;
    const pN1 = document.getElementById("pill-strat-n1");
    if (pN1) pN1.innerText = `Max N₁₍₆₀₎: ${maxN1}`;
    const pN60 = document.getElementById("pill-strat-n60");
    if (pN60) pN60.innerText = `Max N₆₀: ${maxN60.toFixed(1)}`;
    const pPhi = document.getElementById("pill-strat-phi");
    if (pPhi) pPhi.innerText = `Max φ': ${maxPhi.toFixed(1)}°`;

    const pQs = document.getElementById("pill-strength-qs");
    if (pQs) pQs.innerText = `Max qₛ: ${maxQs.toFixed(1)} kPa`;
    const pQp = document.getElementById("pill-strength-qp");
    if (pQp) pQp.innerText = `Max qₚ: ${Math.round(maxQp).toLocaleString('en-US')} kPa`;
    const pSigv = document.getElementById("pill-strength-sigv");
    if (pSigv) pSigv.innerText = `Max σ'ᵥ: ${Math.round(maxSigV).toLocaleString('en-US')} kPa`;

    const countBetaCap = layers.filter(l => l.beta_capped).length;
    const countQsCap = layers.filter(l => l.qs_capped).length;
    const countQpCap = layers.filter(l => l.qp_capped).length;
    const pCaps = document.getElementById("pill-strength-caps");
    if (pCaps) {
        const totalCaps = countBetaCap + countQsCap + countQpCap;
        if (totalCaps > 0) {
            const capParts = [];
            if (countBetaCap > 0) capParts.push(`${countBetaCap} layers β≤Kp·tanφ'`);
            if (countQsCap > 0) capParts.push(`${countQsCap} layers qs≤4ksf`);
            if (countQpCap > 0) capParts.push(`${countQpCap} layers qp≤60ksf`);
            pCaps.innerText = `Caps: ${capParts.join(" | ")}`;
            pCaps.className = "px-2 py-0.5 rounded-md bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 font-bold text-[10px] border border-rose-300 dark:border-rose-700";
        } else {
            pCaps.innerText = "Caps: None";
            pCaps.className = "px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold text-[10px] border border-emerald-200 dark:border-emerald-800";
        }
    }

    // Definições visuais adaptativas para o Modo Apresentação (PPT/Projetor)
    const isPpt = isPresentationMode;
    const isDark = document.documentElement.classList.contains('dark');
    const titleFont = { family: "'Inter', sans-serif", weight: "bold", size: isPpt ? 14 : 11 };
    const tickFont = { family: "'Inter', sans-serif", weight: isPpt ? "bold" : "600", size: isPpt ? 12 : 10 };
    const yTickFont = { family: "'Inter', sans-serif", weight: isPpt ? "bold" : "600", size: isPpt ? 12 : 11 };
    const legendLabelFont = { family: "'Inter', sans-serif", weight: isPpt ? "bold" : "600", size: isPpt ? 13 : 11 };
    const textColor = isDark ? "#E2E8F0" : "#0F172A";
    const tickColor = isDark ? "#94A3B8" : "#334155";
    const gridColorX = isDark ? "rgba(156, 163, 175, 0.20)" : "rgba(156, 163, 175, 0.25)";
    const gridColorY = isDark ? "rgba(156, 163, 175, 0.25)" : "rgba(156, 163, 175, 0.30)";

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
                        borderWidth: isPpt ? 3.2 : 2.0,
                        pointRadius: isPpt ? 2 : 1,
                        tension: 0.1
                    },
                    {
                        label: "N60 (Corrected σ'v)",
                        data: depths.map((d, i) => ({ x: n60[i], y: d })),
                        borderColor: PALETTE.emerald,
                        borderWidth: isPpt ? 3.2 : 2.0,
                        pointRadius: isPpt ? 2 : 1,
                        tension: 0.1
                    },
                    {
                        label: "Friction Angle φ' (°)",
                        data: depths.map((d, i) => ({ x: phi[i], y: d })),
                        borderColor: PALETTE.amber,
                        borderWidth: isPpt ? 3.0 : 2.0,
                        borderDash: isPpt ? [5, 4] : [4, 4],
                        pointRadius: 0,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            boxWidth: isPpt ? 20 : 14,
                            boxHeight: isPpt ? 9 : 7,
                            font: legendLabelFont,
                            color: textColor,
                            padding: isPpt ? 12 : 8
                        }
                    },
                    tooltip: {
                        mode: "index",
                        intersect: false,
                        callbacks: {
                            title: (items) => `Depth: ${items[0]?.parsed?.y !== undefined ? items[0].parsed.y.toFixed(1) : ''} m`,
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.x !== undefined ? item.parsed.x.toFixed(1) : item.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Blowcount N_SPT / Friction Angle φ' (°)", font: titleFont, color: textColor },
                        ticks: { font: tickFont, color: tickColor },
                        grid: { color: gridColorX }
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Depth (m)", font: titleFont, color: textColor },
                        ticks: {
                            stepSize: 10,
                            callback: (val) => `${val} m`,
                            font: yTickFont,
                            color: tickColor
                        },
                        grid: { color: gridColorY }
                    }
                }
            }
        });
    }

    // 2. Chart Strengths (qs, qp, sigma_v or beta vs Kp*tan(phi))
    const ctxStrength = document.getElementById("chart-sounding-strengths");
    const strengthMode = document.getElementById("select-strength-chart-mode")?.value || "resistances";

    if (ctxStrength) {
        if (chartStrengthsInst) chartStrengthsInst.destroy();

        let strengthDatasets = [];
        let xStrengthTitle = "Stress / Unit Resistance (kPa)";

        if (strengthMode === "beta_kp") {
            xStrengthTitle = "Side Friction Coefficient β and Kp·tan(φ') (Dimensionless)";

            // Dataset 1: Beta Design (Effective / Capped)
            strengthDatasets.push({
                label: "β (Design / Effective)",
                data: layers.map(l => ({ x: l.beta, y: l.z_fim, lyr: l })),
                borderColor: PALETTE.blue,
                borderWidth: isPpt ? 3.5 : 2.5,
                pointRadius: layers.map(l => l.beta_capped ? (isPpt ? 7.5 : 5.5) : 0),
                pointHoverRadius: layers.map(l => l.beta_capped ? 9 : 4),
                pointBackgroundColor: layers.map(l => l.beta_capped ? "#EF4444" : PALETTE.blue),
                pointBorderColor: layers.map(l => l.beta_capped ? "#991B1B" : "#1E40AF"),
                pointBorderWidth: isPpt ? 2.5 : 2,
                tension: 0.1
            });

            // Dataset 2: Beta Raw (Mayne Uncapped)
            strengthDatasets.push({
                label: "β_raw (Mayne Uncapped)",
                data: layers.map(l => ({ x: l.beta_raw, y: l.z_fim, lyr: l })),
                borderColor: "#94A3B8",
                borderWidth: isPpt ? 2.8 : 1.8,
                borderDash: [5, 4],
                pointRadius: 0,
                tension: 0.1
            });

            // Dataset 3: Kp * tan(phi) (Normative Upper Limit)
            strengthDatasets.push({
                label: "Kp · tan(φ') (Normative Cap Limit)",
                data: layers.map(l => ({ x: l.kp_tan_phi, y: l.z_fim, lyr: l })),
                borderColor: PALETTE.amber,
                borderWidth: isPpt ? 3.0 : 2.2,
                borderDash: [3, 3],
                pointRadius: 0,
                tension: 0.1
            });

            if (analysisResult.lateral_method === "aashto_2007") {
                const bMaxVal = analysisResult.beta_max ?? 1.8;
                const bMinVal = analysisResult.beta_min ?? 0.25;
                strengthDatasets.push({
                    label: `AASHTO Upper Cap (β=${bMaxVal})`,
                    data: [{ x: bMaxVal, y: 0 }, { x: bMaxVal, y: maxDepthVal }],
                    borderColor: "#DC2626",
                    borderWidth: isPpt ? 2.8 : 1.8,
                    borderDash: [6, 4],
                    pointRadius: 0
                });
                strengthDatasets.push({
                    label: `AASHTO Lower Bound (β=${bMinVal})`,
                    data: [{ x: bMinVal, y: 0 }, { x: bMinVal, y: maxDepthVal }],
                    borderColor: "#F59E0B",
                    borderWidth: isPpt ? 2.0 : 1.4,
                    borderDash: [4, 4],
                    pointRadius: 0
                });
            }
        } else {
            // "resistances"
            xStrengthTitle = "Stress / Unit Resistance (kPa)";

            // 1. qs
            strengthDatasets.push({
                label: "qs - Unit Skin Friction (kPa)",
                data: layers.map(l => ({ x: l.qs, y: l.z_fim, lyr: l })),
                borderColor: PALETTE.amber,
                borderWidth: isPpt ? 3.2 : 2.2,
                pointRadius: layers.map(l => (l.qs_capped || l.beta_capped) ? (isPpt ? 6.5 : 4.5) : 0),
                pointHoverRadius: layers.map(l => (l.qs_capped || l.beta_capped) ? 8 : 4),
                pointBackgroundColor: layers.map(l => l.qs_capped ? "#EF4444" : (l.beta_capped ? "#F59E0B" : PALETTE.amber)),
                pointBorderColor: layers.map(l => l.qs_capped ? "#991B1B" : (l.beta_capped ? "#B45309" : PALETTE.amber)),
                pointBorderWidth: isPpt ? 2.2 : 1.5,
                tension: 0.1
            });

            // 2. qp
            strengthDatasets.push({
                label: "qp - Unit End Bearing (kPa)",
                data: layers.map(l => ({ x: l.qp, y: l.z_fim, lyr: l })),
                borderColor: PALETTE.purple,
                borderWidth: isPpt ? 3.2 : 2.2,
                pointRadius: layers.map(l => l.qp_capped ? (isPpt ? 7.5 : 5.5) : 0),
                pointHoverRadius: layers.map(l => l.qp_capped ? 9 : 4),
                pointBackgroundColor: layers.map(l => l.qp_capped ? "#EF4444" : PALETTE.purple),
                pointBorderColor: layers.map(l => l.qp_capped ? "#991B1B" : "#7E22CE"),
                pointBorderWidth: isPpt ? 2.2 : 1.5,
                tension: 0.1
            });

            // 3. sigma_v
            strengthDatasets.push({
                label: "σ'v - Effective Overburden Stress (kPa)",
                data: depths.map((d, i) => ({ x: sigV[i], y: d })),
                borderColor: PALETTE.slate,
                borderWidth: isPpt ? 2.2 : 1.5,
                borderDash: [5, 5],
                pointRadius: 0,
                tension: 0.1
            });

            // Reference Lines for Normative Caps
            if (analysisResult.lateral_method === "aashto_2007" || countQsCap > 0) {
                strengthDatasets.push({
                    label: "AASHTO qs Cap = 4.0 ksf (191.5 kPa)",
                    data: [{ x: 191.52, y: 0 }, { x: 191.52, y: maxDepthVal }],
                    borderColor: "#EF4444",
                    borderWidth: isPpt ? 2.8 : 2,
                    borderDash: [6, 4],
                    pointRadius: 0
                });
            }

            if (analysisResult.tip_method === "aashto_2024" || countQpCap > 0) {
                strengthDatasets.push({
                    label: "AASHTO 2024 qp Cap = 60.0 ksf (2,872.8 kPa)",
                    data: [{ x: 2872.82, y: 0 }, { x: 2872.82, y: maxDepthVal }],
                    borderColor: "#A855F7",
                    borderWidth: isPpt ? 2.8 : 2,
                    borderDash: [6, 4],
                    pointRadius: 0
                });
            }
        }

        chartStrengthsInst = new Chart(ctxStrength, {
            type: "line",
            data: { datasets: strengthDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            boxWidth: isPpt ? 20 : 14,
                            boxHeight: isPpt ? 9 : 7,
                            font: legendLabelFont,
                            color: textColor,
                            padding: isPpt ? 12 : 8
                        }
                    },
                    tooltip: {
                        mode: "nearest",
                        axis: "y",
                        intersect: false,
                        callbacks: {
                            title: (items) => `Depth: ${items[0]?.parsed?.y !== undefined ? items[0].parsed.y.toFixed(1) : ''} m`,
                            label: (item) => {
                                const rawObj = item.raw;
                                const lyr = rawObj?.lyr;
                                const xVal = item.parsed.x !== undefined ? (strengthMode === "beta_kp" ? item.parsed.x.toFixed(3) : Math.round(item.parsed.x).toLocaleString('en-US')) : item.raw;
                                let line = ` ${item.dataset.label}: ${xVal}`;
                                if (lyr) {
                                    if (item.dataset.label.includes("qs") && lyr.qs_capped) {
                                        line += ` ⚠️ [Capped at 4.0 ksf / 191.5 kPa]`;
                                    } else if (item.dataset.label.includes("qs") && lyr.beta_capped) {
                                        const r = lyr.beta_cap_reason === "kp_tan_phi" ? "Kp·tan(φ')" : "σ'v < 43.1 kPa";
                                        line += ` ⚠️ [β capped by ${r}: β=${lyr.beta}, Raw=${lyr.beta_raw}]`;
                                    } else if (item.dataset.label.includes("qp") && lyr.qp_capped) {
                                        line += ` ⚠️ [Capped at 60.0 ksf / 2,872.8 kPa]`;
                                    } else if (item.dataset.label.includes("β (Design") && lyr.beta_capped) {
                                        const r = lyr.beta_cap_reason === "kp_tan_phi" ? "Limited by Kp·tan(φ')" :
                                                  lyr.beta_cap_reason === "shallow_stress" ? "Limited by shallow stress (σ'v < 43.1 kPa)" :
                                                  lyr.beta_cap_reason ? `Limited by ${lyr.beta_cap_reason}` : "Normative Cap Active";
                                        line += ` ⚠️ [${r}] (Raw=${lyr.beta_raw}, Cap=${lyr.kp_tan_phi})`;
                                    }
                                }
                                return line;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: xStrengthTitle, font: titleFont, color: textColor },
                        ticks: { font: tickFont, color: tickColor },
                        grid: { color: gridColorX },
                        min: 0
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Depth (m)", font: titleFont, color: textColor },
                        ticks: {
                            stepSize: 10,
                            callback: (val) => `${val} m`,
                            font: yTickFont,
                            color: tickColor
                        },
                        grid: { color: gridColorY }
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
        if (pill48) pill48.innerText = `1.2m max: ${Math.round(maxRadm48).toLocaleString('en-US')} kN`;
        const pill54 = document.getElementById("pill-cap-p54");
        if (pill54) pill54.innerText = `1.3m max: ${Math.round(maxRadm54).toLocaleString('en-US')} kN`;
        const pill60 = document.getElementById("pill-cap-p60");
        if (pill60) pill60.innerText = `1.5m max: ${Math.round(maxRadm60).toLocaleString('en-US')} kN`;

        const datasetsCap = [];
        if (p48 && p48.depths && p48.radm) {
            datasetsCap.push({
                label: "Ø 1.2 m (48\")",
                data: p48.depths.map((d, i) => ({ x: p48.radm[i], y: d })),
                borderColor: PALETTE.blue,
                borderWidth: isPpt ? 3.2 : 2.2,
                pointRadius: 0,
                tension: 0.1
            });
        }
        if (p54 && p54.depths && p54.radm) {
            datasetsCap.push({
                label: "Ø 1.3 m (54\")",
                data: p54.depths.map((d, i) => ({ x: p54.radm[i], y: d })),
                borderColor: PALETTE.emerald,
                borderWidth: isPpt ? 3.2 : 2.2,
                pointRadius: 0,
                tension: 0.1
            });
        }
        if (p60 && p60.depths && p60.radm) {
            datasetsCap.push({
                label: "Ø 1.5 m (60\")",
                data: p60.depths.map((d, i) => ({ x: p60.radm[i], y: d })),
                borderColor: PALETTE.amber,
                borderWidth: isPpt ? 3.2 : 2.2,
                pointRadius: 0,
                tension: 0.1
            });
        }

        const targetKn = projectData.target_load_kN || analysisResult?.target_load_kN || 21400;
        const maxDepthProfile = depths.length > 0 ? Math.max(...depths) : 60;
        datasetsCap.push({
            label: `Target Load (${Math.round(targetKn).toLocaleString('en-US')} kN)`,
            data: [{ x: targetKn, y: 0 }, { x: targetKn, y: maxDepthProfile }],
            borderColor: PALETTE.rose,
            borderWidth: isPpt ? 2.8 : 1.8,
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
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            boxWidth: isPpt ? 20 : 14,
                            boxHeight: isPpt ? 9 : 7,
                            font: legendLabelFont,
                            color: textColor,
                            padding: isPpt ? 12 : 8
                        }
                    },
                    tooltip: {
                        mode: "index",
                        intersect: false,
                        callbacks: {
                            title: (items) => `Depth: ${items[0]?.parsed?.y !== undefined ? items[0].parsed.y.toFixed(1) : ''} m`,
                            label: (item) => ` ${item.dataset.label}: ${item.parsed.x !== undefined ? Math.round(item.parsed.x).toLocaleString('en-US') + ' kN' : item.raw}`
                        }
                    }
                },
                scales: {
                    x: {
                        type: "linear",
                        title: { display: true, text: "Allowable Capacity Radm (kN)", font: titleFont, color: textColor },
                        ticks: { font: tickFont, color: tickColor },
                        grid: { color: gridColorX }
                    },
                    y: {
                        type: "linear",
                        reverse: true,
                        title: { display: true, text: "Depth (m)", font: titleFont, color: textColor },
                        ticks: {
                            stepSize: 10,
                            callback: (val) => `${val} m`,
                            font: yTickFont,
                            color: tickColor
                        },
                        grid: { color: gridColorY }
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
    } else if (mode === "2col") {
        grid.className = "grid grid-cols-1 lg:grid-cols-2 gap-6";
        if (cardCap) cardCap.classList.add("hidden");
        if (btn2Col) btn2Col.className = activeBtnClass;
        if (btn3Col) btn3Col.className = inactiveBtnClass;
        if (btn1Col) btn1Col.className = inactiveBtnClass;
    } else {
        // Modo Padrão: 3 colunas (os 3 gráficos lado a lado)
        grid.className = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4";
        if (cardCap) cardCap.classList.remove("hidden");
        if (btn3Col) btn3Col.className = activeBtnClass;
        if (btn2Col) btn2Col.className = inactiveBtnClass;
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

// CONTROLE DE MODO APRESENTAÇÃO (PPT)
function togglePresentationMode() {
    isPresentationMode = !isPresentationMode;
    const btn = document.getElementById("btn-toggle-presentation-mode");
    if (btn) {
        if (isPresentationMode) {
            btn.classList.add("bg-purple-600", "text-white", "border-purple-600", "shadow-sm");
            btn.classList.remove("bg-white", "dark:bg-gray-700", "text-purple-700", "dark:text-purple-300");
            btn.innerHTML = `<span>📺</span> <b>Modo PPT: ATIVO</b>`;
            showToast("Modo Apresentação ativado: Linhas mais grossas e fontes ampliadas para PPT/Projetor!", "info");
        } else {
            btn.classList.remove("bg-purple-600", "text-white", "border-purple-600", "shadow-sm");
            btn.classList.add("bg-white", "dark:bg-gray-700", "text-purple-700", "dark:text-purple-300");
            btn.innerHTML = `<span>📺</span> Modo Apresentação (PPT)`;
            showToast("Modo Apresentação desativado.", "info");
        }
    }
    renderSoundingCharts();
    renderAxesChart();
    if (typeof renderSummaryCharts === "function") renderSummaryCharts();
}

function getChartInstanceByCanvasId(canvasId) {
    if (canvasId === "chart-sounding-stratigraphy") return chartStratigraphyInst;
    if (canvasId === "chart-sounding-strengths") return chartStrengthsInst;
    if (canvasId === "chart-sounding-capacity") return chartSoundingCapacityInst;
    if (canvasId === "chart-capacity-comparison") return chartCapacityCompInst;
    if (canvasId === "chart-diameters-comparison") return chartDiametersCompInst;
    if (canvasId === "chart-target-depths-summary") return chartTargetDepthsSummaryInst;
    if (canvasId === "chart-axes-capacity") return chartAxesInst;
    return (typeof Chart !== "undefined" && Chart.getChart) ? Chart.getChart(canvasId) : null;
}

// EXPORTAÇÃO EM VETOR SVG (EDITÁVEL NO POWERPOINT VIA "CONVERTER EM FORMA")
function exportChartToSvg(canvasId, customFilename) {
    const chart = getChartInstanceByCanvasId(canvasId);
    if (!chart) {
        showToast("Gráfico não encontrado.", "error");
        return;
    }

    const width = chart.width || 800;
    const height = chart.height || 750;
    const chartArea = chart.chartArea || { left: 70, top: 40, right: width - 20, bottom: height - 60 };
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="background-color: #ffffff; font-family: 'Arial', sans-serif;">\n`;
    svg += `  <rect width="100%" height="100%" fill="#ffffff"/>\n`;

    // 1. Grid Lines
    svg += `  <g id="grid-lines" stroke="#e2e8f0" stroke-width="1">\n`;
    if (xScale && xScale.ticks) {
        xScale.ticks.forEach(t => {
            const x = xScale.getPixelForValue(t.value);
            if (x >= chartArea.left - 2 && x <= chartArea.right + 2) {
                svg += `    <line x1="${x.toFixed(1)}" y1="${chartArea.top.toFixed(1)}" x2="${x.toFixed(1)}" y2="${chartArea.bottom.toFixed(1)}" />\n`;
            }
        });
    }
    if (yScale && yScale.ticks) {
        yScale.ticks.forEach(t => {
            const y = yScale.getPixelForValue(t.value);
            if (y >= chartArea.top - 2 && y <= chartArea.bottom + 2) {
                svg += `    <line x1="${chartArea.left.toFixed(1)}" y1="${y.toFixed(1)}" x2="${chartArea.right.toFixed(1)}" y2="${y.toFixed(1)}" />\n`;
            }
        });
    }
    svg += `  </g>\n`;

    // 2. Axes lines and labels
    svg += `  <g id="axes" stroke="#475569" stroke-width="1.5">\n`;
    svg += `    <line x1="${chartArea.left.toFixed(1)}" y1="${chartArea.top.toFixed(1)}" x2="${chartArea.left.toFixed(1)}" y2="${chartArea.bottom.toFixed(1)}" />\n`;
    svg += `    <line x1="${chartArea.left.toFixed(1)}" y1="${chartArea.bottom.toFixed(1)}" x2="${chartArea.right.toFixed(1)}" y2="${chartArea.bottom.toFixed(1)}" />\n`;
    svg += `  </g>\n`;

    // Ticks and numbers
    svg += `  <g id="tick-labels" fill="#334155" font-size="12" font-weight="bold" text-anchor="middle">\n`;
    if (xScale && xScale.ticks) {
        xScale.ticks.forEach(t => {
            const x = xScale.getPixelForValue(t.value);
            if (x >= chartArea.left - 10 && x <= chartArea.right + 10) {
                const txt = t.label !== undefined ? t.label : t.value;
                svg += `    <text x="${x.toFixed(1)}" y="${(chartArea.bottom + 18).toFixed(1)}">${escapeXml(String(txt))}</text>\n`;
            }
        });
    }
    if (yScale && yScale.ticks) {
        yScale.ticks.forEach(t => {
            const y = yScale.getPixelForValue(t.value);
            if (y >= chartArea.top - 10 && y <= chartArea.bottom + 10) {
                const label = typeof t.label === "string" ? t.label : `${t.value} m`;
                svg += `    <text x="${(chartArea.left - 8).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeXml(String(label))}</text>\n`;
            }
        });
    }
    svg += `  </g>\n`;

    // Axis titles
    svg += `  <g id="axis-titles" fill="#0f172a" font-size="13" font-weight="bold">\n`;
    if (xScale && xScale.options?.title?.text) {
        svg += `    <text x="${((chartArea.left + chartArea.right) / 2).toFixed(1)}" y="${(height - 12).toFixed(1)}" text-anchor="middle">${escapeXml(xScale.options.title.text)}</text>\n`;
    }
    if (yScale && yScale.options?.title?.text) {
        const midY = (chartArea.top + chartArea.bottom) / 2;
        svg += `    <text x="20" y="${midY.toFixed(1)}" text-anchor="middle" transform="rotate(-90 20 ${midY.toFixed(1)})">${escapeXml(yScale.options.title.text)}</text>\n`;
    }
    svg += `  </g>\n`;

    // 3. Legend at top
    if (chart.legend && chart.legend.legendItems) {
        svg += `  <g id="legend" font-size="12" font-weight="bold" fill="#1e293b">\n`;
        let legX = chartArea.left;
        let legY = Math.max(16, chartArea.top - 18);
        chart.legend.legendItems.forEach(item => {
            const color = item.strokeStyle || item.fillStyle || "#2563eb";
            const text = item.text || "";
            svg += `    <rect x="${legX.toFixed(1)}" y="${(legY - 9).toFixed(1)}" width="16" height="8" rx="2" fill="${color}" stroke="${color}"/>\n`;
            svg += `    <text x="${(legX + 22).toFixed(1)}" y="${legY.toFixed(1)}">${escapeXml(text)}</text>\n`;
            legX += text.length * 7.5 + 36;
            if (legX > chartArea.right - 50) {
                legX = chartArea.left;
                legY += 16;
            }
        });
        svg += `  </g>\n`;
    }

    // 4. Datasets (Paths and Points)
    svg += `  <g id="datasets">\n`;
    chart.data.datasets.forEach((ds, dsIdx) => {
        if (!ds.data || ds.data.length === 0) return;
        const color = ds.borderColor || "#2563eb";
        const strokeW = ds.borderWidth || 2.5;
        const dash = ds.borderDash ? ds.borderDash.join(",") : "";
        const dashAttr = dash ? ` stroke-dasharray="${dash}"` : "";

        let pathD = "";
        const points = [];
        ds.data.forEach((pt, i) => {
            if (pt.x === undefined || pt.y === undefined) return;
            const px = xScale.getPixelForValue(pt.x);
            const py = yScale.getPixelForValue(pt.y);
            if (isNaN(px) || isNaN(py)) return;
            pathD += (i === 0 || pathD === "") ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
            points.push({ x: px, y: py, pt, i });
        });

        if (pathD) {
            svg += `    <path d="${pathD}" fill="none" stroke="${color}" stroke-width="${strokeW}"${dashAttr} stroke-linejoin="round" stroke-linecap="round" />\n`;
        }

        points.forEach(({ x, y, pt, i }) => {
            let r = 0;
            if (typeof ds.pointRadius === "function") r = ds.pointRadius({ dataIndex: i });
            else if (Array.isArray(ds.pointRadius)) r = ds.pointRadius[i] || 0;
            else if (typeof ds.pointRadius === "number") r = ds.pointRadius;

            if (r > 1) {
                let pBg = color;
                if (Array.isArray(ds.pointBackgroundColor)) pBg = ds.pointBackgroundColor[i] || color;
                else if (typeof ds.pointBackgroundColor === "string") pBg = ds.pointBackgroundColor;

                let pBorder = "#ffffff";
                if (Array.isArray(ds.pointBorderColor)) pBorder = ds.pointBorderColor[i] || "#ffffff";
                else if (typeof ds.pointBorderColor === "string") pBorder = ds.pointBorderColor;

                let pBw = ds.pointBorderWidth || 1.5;
                svg += `    <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${pBg}" stroke="${pBorder}" stroke-width="${pBw}"/>\n`;
            }
        });
    });
    svg += `  </g>\n`;
    svg += `</svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = customFilename || `${canvasId}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("SVG Vetorial baixado! No PowerPoint, use 'Inserir > Imagem' e clique em 'Converter em Forma' para editar.", "success");
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// CÓPIA EM ALTA RESOLUÇÃO (300 DPI / 2.5X) PARA O POWERPOINT
async function copyChartHighRes(canvasId, btn, scale = 2.5) {
    const originalCanvas = document.getElementById(canvasId);
    if (!originalCanvas) {
        showToast("Gráfico não encontrado.", "error");
        return;
    }

    try {
        const offCanvas = document.createElement("canvas");
        offCanvas.width = originalCanvas.width * scale;
        offCanvas.height = originalCanvas.height * scale;
        const ctx = offCanvas.getContext("2d");

        // Fundo branco sólido com alta nitidez para apresentações
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        // Desenha o gráfico escalado com interpolação de alta qualidade
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(originalCanvas, 0, 0, offCanvas.width, offCanvas.height);

        offCanvas.toBlob(async (blob) => {
            if (!blob) {
                showToast("Erro ao processar imagem HD.", "error");
                return;
            }
            try {
                if (navigator.clipboard && window.ClipboardItem) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ "image/png": blob })
                    ]);
                    showToast("Gráfico HD (300 DPI) copiado! Cole no PPT com Ctrl+V.", "success");
                    if (btn) {
                        const originalHtml = btn.innerHTML;
                        btn.innerHTML = `<span>✓</span> Copiado HD!`;
                        btn.classList.add("bg-emerald-600", "text-white", "border-emerald-600");
                        setTimeout(() => {
                            btn.innerHTML = originalHtml;
                            btn.classList.remove("bg-emerald-600", "text-white", "border-emerald-600");
                        }, 2000);
                    }
                } else {
                    downloadChartTransparent(canvasId, `${canvasId}_hd.png`);
                    showToast("Clipboard restrito. Imagem HD baixada!", "info");
                }
            } catch (err) {
                console.warn("Clipboard API failed:", err);
                downloadChartTransparent(canvasId, `${canvasId}_hd.png`);
                showToast("Imagem HD baixada com sucesso!", "info");
            }
        }, "image/png");
    } catch (e) {
        console.error("Error copying HD chart:", e);
        showToast("Falha ao exportar gráfico HD.", "error");
    }
}

// EXPORTAÇÃO POWERPOINT PPTX COM GRÁFICOS NATIVOS EDITÁVEIS
function exportSoundingPPTX() {
    if (!analysisResult) {
        alert("Por favor, execute a análise antes de exportar os slides.");
        return;
    }

    const sName = activeSoundingName || "SPT-01";
    showToast(`Gerando slides PPTX editáveis para ${sName}...`, "info");

    if (typeof eel !== "undefined" && eel.export_capacidade_estaca_pptx) {
        eel.export_capacidade_estaca_pptx(analysisResult, sName)((res) => {
            if (res && res.success) {
                showToast(`PowerPoint gerado com sucesso! Abrindo arquivo...`, "success");
            } else {
                alert("Erro ao gerar PowerPoint: " + (res?.error || "Desconhecido"));
            }
        });
    } else {
        alert("A exportação direta para PPTX requer o backend Python ativo.");
    }
}

// EXPORTAÇÃO SVG ESPECÍFICA DO EIXO ATIVO
function exportAxisSvg() {
    const axisName = document.getElementById("select-chart-axis")?.value || "A";
    exportChartToSvg("chart-axes-capacity", `perfil_capacidade_eixo_${axisName}.svg`);
}

// EXPORTAÇÃO POWERPOINT PPTX COM GRÁFICO NATIVO EDITÁVEL DO EIXO ATIVO
function exportActiveAxisPPTX() {
    if (!analysisResult) {
        alert("Por favor, execute a análise antes de exportar o slide do eixo.");
        return;
    }
    const axisName = document.getElementById("select-chart-axis")?.value || "A";
    showToast(`Gerando slide PPTX editável para o Eixo ${axisName}...`, "info");

    if (typeof eel !== "undefined" && eel.export_capacidade_estaca_axis_pptx) {
        eel.export_capacidade_estaca_axis_pptx(analysisResult, axisName)((res) => {
            if (res && res.success) {
                showToast(`PowerPoint do Eixo ${axisName} gerado com sucesso! Abrindo arquivo...`, "success");
            } else {
                alert("Erro ao gerar PowerPoint do Eixo: " + (res?.error || "Desconhecido"));
            }
        });
    } else {
        alert("A exportação direta para PPTX requer o backend Python ativo.");
    }
}

// EXPORTAÇÃO E CÓPIA DE GRÁFICOS COM FUNDO TRANSPARENTE
async function copyChartToClipboardTransparent(canvasId, btn) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        showToast("Chart not found.", "error");
        return;
    }

    try {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                showToast("Error processing transparent image.", "error");
                return;
            }

            try {
                if (navigator.clipboard && window.ClipboardItem) {
                    await navigator.clipboard.write([
                        new ClipboardItem({ "image/png": blob })
                    ]);
                    showToast("Chart copied with transparent background! Ready to paste (Ctrl+V).", "success");
                    if (btn) {
                        const originalHtml = btn.innerHTML;
                        btn.innerHTML = `<span>✓</span> Copied!`;
                        btn.classList.add("bg-emerald-600", "text-white", "border-emerald-600");
                        setTimeout(() => {
                            btn.innerHTML = originalHtml;
                            btn.classList.remove("bg-emerald-600", "text-white", "border-emerald-600");
                        }, 2000);
                    }
                } else {
                    downloadChartTransparent(canvasId, `${canvasId}_transparent.png`);
                    showToast("Clipboard restricted. Transparent PNG automatically downloaded!", "info");
                }
            } catch (err) {
                console.warn("Clipboard API failed, triggering download:", err);
                downloadChartTransparent(canvasId, `${canvasId}_transparent.png`);
                showToast("Transparent PNG downloaded successfully!", "info");
            }
        }, "image/png");
    } catch (e) {
        console.error("Error exporting transparent chart:", e);
        showToast("Failed to export chart.", "error");
    }
}

function downloadChartTransparent(canvasId, customName) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    try {
        const link = document.createElement("a");
        link.download = customName || `${canvasId}_transparent.png`;
        link.href = canvas.toDataURL("image/png");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast("Transparent PNG downloaded successfully!", "success");
    } catch (e) {
        console.error("Error downloading transparent PNG:", e);
        showToast("Error downloading PNG.", "error");
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

    const groupDisplayMap = {
        "Relleno (Aterro)": "Backfill / Fill",
        "Areias": "Sands",
        "Gravas": "Gravels",
        "Finos": "Fines / Clays"
    };

    tbody.innerHTML = "";
    for (const [grp, p] of Object.entries(projectData.soil_groups || {})) {
        const tr = document.createElement("tr");
        const displayName = groupDisplayMap[grp] || grp;
        tr.innerHTML = `
            <td class="p-2 font-bold text-gray-800 dark:text-gray-200">${displayName}</td>
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
                    <input type="number" step="0.05" min="0.4" max="3.0" value="${p.diam_m.toFixed(2)}" onchange="syncPileDiameter(${idx}, this.value)" class="w-20 px-1.5 py-1 text-center font-mono font-bold text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 shadow-xs" title="Edit shaft diameter">
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
    const name = prompt("New foundation axis name (e.g., F):", "F");
    if (!name) return;
    const cotaStr = prompt(`Top / cut-off elevation for Axis ${name} (in meters):`, "10.0");
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
    const newCota = prompt(`Edit top / cut-off elevation for Axis ${ax.name} (m):`, ax.cota_inicio_m);
    if (newCota === null) return;
    const cVal = parseFloat(newCota);
    if (!isNaN(cVal)) {
        ax.cota_inicio_m = cVal;
        triggerCalculation();
    }
}

function deleteAxis(idx) {
    if (projectData.axes.length <= 1) {
        alert("At least one foundation axis must be maintained.");
        return;
    }
    if (confirm(`Remove Axis ${projectData.axes[idx].name}?`)) {
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
    if (confirm(`Reset boring ${activeSoundingName} to original spreadsheet data?`)) {
        loadReferenceData();
    }
}

// EXPORTAÇÃO EXCEL
function exportAnalysisToExcel() {
    if (!analysisResult) {
        alert("Please run the analysis before exporting.");
        return;
    }

    if (typeof eel !== "undefined" && eel.export_capacidade_estaca_excel) {
        eel.export_capacidade_estaca_excel(analysisResult)((res) => {
            if (res && res.success) {
                alert(`Excel workbook generated successfully!\nSaved at: ${res.filepath}`);
            } else {
                alert("Error exporting Excel via Eel: " + (res?.error || "Unknown"));
            }
        });
    } else {
        alert("Direct export to Excel requires active Python backend.\nRun 'python run_capacidade_estaca.py --export' in terminal to generate the spreadsheet.");
    }
}

function extrapolateSoundingLayersJS(layers, sName) {
    if (!Array.isArray(layers) || layers.length === 0) return [];
    const maxDepth = projectData.extrapolation_max_depth_m ?? 132.6;
    const targetPercentile = projectData.extrapolation_n_percentile ?? 15.0;
    const forcedSoil = projectData.extrapolation_soil_group;

    let realLayers;
    if (sName === "SPT-01") {
        const cutoff = projectData.spt01_measured_depth_m ?? 44.4;
        realLayers = layers.filter(l => !l.is_extrapolated && parseFloat(l.z_fim) <= cutoff + 1e-4);
        if (realLayers.length === 0) realLayers = layers.filter(l => parseFloat(l.z_fim) <= cutoff + 1e-4);
    } else {
        realLayers = layers.filter(l => !l.is_extrapolated);
        if (realLayers.length === 0) realLayers = [...layers];
    }
    if (realLayers.length === 0) return layers;

    const measuredDepth = Math.max(...realLayers.map(l => parseFloat(l.z_fim) || 0));

    // Determina solo modal e percentil de N estritamente desta sondagem
    const grpCounts = {};
    const sucsCounts = {};
    const nList = [];
    realLayers.forEach(l => {
        const grp = l.soil_group || "Areias";
        grpCounts[grp] = (grpCounts[grp] || 0) + 1;
        if (l.sucs) sucsCounts[l.sucs] = (sucsCounts[l.sucs] || 0) + 1;
        nList.push(parseFloat(l.n1_60) || 10.0);
    });

    let modalSoil = "Areias";
    let maxC = 0;
    for (const [g, c] of Object.entries(grpCounts)) {
        if (c > maxC) { maxC = c; modalSoil = g; }
    }

    let modalSucs = modalSoil === "Areias" ? "SP-SM" : "GW-GM";
    let maxS = 0;
    for (const [s, c] of Object.entries(sucsCounts)) {
        if (c > maxS) { maxS = c; modalSucs = s; }
    }

    const lastLayer = realLayers[realLayers.length - 1];
    let adoptedSoil = modalSoil;
    let adoptedSucs = modalSucs;

    if (forcedSoil === "last_layer" || forcedSoil === "bottom_layer") {
        adoptedSoil = lastLayer?.soil_group || modalSoil;
        adoptedSucs = lastLayer?.sucs || modalSucs;
    } else if (forcedSoil && forcedSoil !== "auto") {
        adoptedSoil = forcedSoil;
    }

    nList.sort((a, b) => a - b);
    let pIdx = Math.floor(((targetPercentile ?? 15.0) / 100.0) * nList.length);
    pIdx = Math.max(0, Math.min(nList.length - 1, pIdx));
    const nSynth = Math.max(1, Math.round(nList[pIdx] || 27));

    const result = realLayers.map(l => ({ ...l, is_extrapolated: false }));
    let lastZ = measuredDepth;

    while (lastZ < maxDepth - 1e-4) {
        const nextZ = Math.round((lastZ + 0.6) * 100) / 100;
        result.push({
            z_ini: lastZ,
            z_fim: nextZ,
            dz: 0.6,
            n1_60: nSynth,
            soil_group: adoptedSoil,
            sucs: adoptedSucs,
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
            name: `Drilled Shaft D=${d.toFixed(2)}m (${dIn}")`,
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

            // Determinação de beta e resistência lateral unitária (qs)
            const latMethod = projectData.lateral_method || "mayne_fhwa";
            const tipMethod = projectData.tip_method || "aashto_2007";
            const qsMaxKsf = projectData.qs_max_ksf ?? 4.0;
            const qpMaxKsf = projectData.qp_max_ksf ?? 60.0;
            const applyQsCap = projectData.apply_qs_cap !== false;
            const applyQpCap = projectData.apply_qp_cap !== false;
            const betaDepthRef = projectData.beta_depth_ref || "relative_to_top";
            const zMid = zIni + dz / 2;

            const applyBetaLimits = projectData.apply_beta_limits !== false;
            const bMinVal = projectData.beta_min ?? 0.25;
            const bMaxVal = projectData.beta_max ?? (grp === "Gravas" ? 1.8 : 1.2);

            let qs = 0;
            let betaAdopted = 0;
            let betaRaw = 0;
            let betaCapped = false;

            if (latMethod === "aashto_2007") {
                const zRef = (betaDepthRef === "relative_to_top" && lyr.z_ref_offset) ? Math.max(0, zMid - lyr.z_ref_offset) : zMid;
                const zFt = Math.max(0, zRef / 0.3048);
                const sqrtZ = Math.sqrt(zFt);
                const bFormula = (grp === "Gravas") ? (2.0 - 0.150 * sqrtZ) : (1.5 - 0.135 * sqrtZ);
                const bCalc = (n60 >= 15) ? bFormula : ((n60 / 15) * bFormula);
                if (applyBetaLimits) {
                    betaAdopted = Math.max(bMinVal, Math.min(bMaxVal, bCalc));
                    betaCapped = (betaAdopted < bCalc - 1e-4) || (bCalc < bMinVal - 1e-4);
                } else {
                    betaAdopted = bCalc;
                    betaCapped = false;
                }
                betaRaw = bCalc;
                const qsLimit = qsMaxKsf * 47.8802589;
                qs = applyQsCap ? Math.min(betaAdopted * sigmaV, qsLimit) : (betaAdopted * sigmaV);
            } else {
                const sigmaP = (grp === "Areias") ? (pa * 0.47 * Math.pow(n60, 0.8)) : (pa * 0.15 * n60);
                const ocrRaw = Math.max(sigmaP / Math.max(sigmaV, 0.01), 0.01);
                betaRaw = (1 - sinPhi) * Math.pow(ocrRaw, sinPhi) * tanPhi;

                const useShallow = applyBetaFhwa && (projectData.apply_shallow_stress_limit !== false);
                const sigVEff = (useShallow && sigmaV < shallowStressLimit) ? shallowStressLimit : sigmaV;
                const ocrAdopted = Math.max(sigmaP / Math.max(sigVEff, 0.01), 0.01);
                let bCalc = (1 - sinPhi) * Math.pow(ocrAdopted, sinPhi) * tanPhi;
                if (applyBetaFhwa && capKp && bCalc > kpTanPhi) {
                    bCalc = kpTanPhi;
                }
                if (applyBetaLimits) {
                    betaAdopted = Math.max(bMinVal, Math.min(bMaxVal, bCalc));
                } else {
                    betaAdopted = bCalc;
                }
                betaCapped = (betaAdopted < (betaRaw - 0.0001));
                const qsLimit = qsMaxKsf * 47.8802589;
                qs = applyQsCap ? Math.min(betaAdopted * sigmaV, qsLimit) : (betaAdopted * sigmaV);
            }

            // Determinação da resistência de ponta unitária (qp)
            let qp = 0;
            if (tipMethod === "aashto_2024") {
                const qpKsf = applyQpCap ? Math.min(1.2 * n60, qpMaxKsf) : (1.2 * n60);
                qp = qpKsf * 47.8802589;
            } else {
                const qpUncapped = (projectData.kp_base ?? 0.59) * Math.pow((n60 * pa) / Math.max(sigmaV, 0.01), 0.8) * sigmaV;
                const qpLimit = qpMaxKsf * 47.8802589;
                qp = applyQpCap ? Math.min(qpUncapped, qpLimit) : qpUncapped;
            }

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
        const considerWeight = projectData.consider_pile_weight ?? false;
        const gammaConc = projectData.concrete_unit_weight ?? 24.0;
        const gammaW = projectData.water_unit_weight ?? 10.0;
        const gammaSubConc = gammaConc - gammaW;
        const weightMode = projectData.pile_weight_mode || "submerged_concrete";

        const pileLenAbove = Number(projectData.pile_length_above_start_m || 0.0);

        piles.forEach(p => {
            const perim = p.perimeter_m;
            const area = p.area_m2;
            let sumRs = 0;
            const wAbove = (pileLenAbove > 0) ? (area * pileLenAbove * gammaSubConc) : 0;
            let sumW = wAbove;
            let maxRn = 0;
            let maxRadmGlob = 0;
            let maxRadmDif = 0;
            let maxRadmNetGlob = 0;
            let maxRadmNetDif = 0;
            let depthAtMax = 0;
            let depthForTargetGlob = null;
            let depthForTargetDif = null;
            let depthForTargetNetGlob = null;
            let depthForTargetNetDif = null;

            const depths = [];
            const rsSegments = [];
            const rsCum = [];
            const wSegments = [];
            const wCum = [];
            const rpList = [];
            const rnList = [];
            const radmList = [];
            const radmDifList = [];
            const radmNetList = [];
            const radmNetDifList = [];

            procLayers.forEach(l => {
                const rsSeg = l.qs * perim * l.dz;
                sumRs += rsSeg;

                // Seg weight
                let effGamma = 0;
                if (weightMode === "displaced_soil") {
                    const soilGamma = (l.z_fim > wt) ? (l.gamma) : (l.gamma);
                    const concG = (l.z_fim > wt) ? gammaSubConc : gammaConc;
                    effGamma = Math.max(0, concG - soilGamma);
                } else {
                    if (l.z_fim <= wt) {
                        effGamma = gammaConc;
                    } else if (l.z_ini >= wt) {
                        effGamma = gammaSubConc;
                    } else {
                        const dzDry = Math.max(0, wt - l.z_ini);
                        const dzSub = Math.max(0, l.z_fim - wt);
                        effGamma = (dzDry * gammaConc + dzSub * gammaSubConc) / l.dz;
                    }
                }
                const wSeg = area * l.dz * effGamma;
                sumW += wSeg;

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

                const radmNetGlob = Math.max(0, Math.floor(radmGlob - sumW));
                const radmNetDif = Math.max(0, Math.floor(radmDif - sumW));

                if (rn > maxRn) {
                    maxRn = rn;
                    maxRadmGlob = radmGlob;
                    maxRadmDif = radmDif;
                    maxRadmNetGlob = radmNetGlob;
                    maxRadmNetDif = radmNetDif;
                    depthAtMax = l.z_fim;
                }
                if (depthForTargetGlob === null && radmGlob >= targetLoad) {
                    depthForTargetGlob = l.z_fim;
                }
                if (depthForTargetDif === null && radmDif >= targetLoad) {
                    depthForTargetDif = l.z_fim;
                }
                if (depthForTargetNetGlob === null && radmNetGlob >= targetLoad) {
                    depthForTargetNetGlob = l.z_fim;
                }
                if (depthForTargetNetDif === null && radmNetDif >= targetLoad) {
                    depthForTargetNetDif = l.z_fim;
                }

                depths.push(l.z_fim);
                rsSegments.push(rsSeg);
                rsCum.push(sumRs);
                wSegments.push(wSeg);
                wCum.push(sumW);
                rpList.push(rp);
                rnList.push(rn);
                radmList.push(radmGlob);
                radmDifList.push(radmDif);
                radmNetList.push(radmNetGlob);
                radmNetDifList.push(radmNetDif);
            });

            capResults[p.id] = {
                id: p.id,
                name: p.name,
                diam_m: p.diam_m,
                depths: depths,
                rs_segment: rsSegments,
                rs_cumulative: rsCum,
                w_segment: wSegments,
                w_cumulative: wCum,
                rp: rpList,
                rn: rnList,
                radm: radmList,
                radm_dif: radmDifList,
                radm_net: radmNetList,
                radm_net_dif: radmNetDifList,
                max_rn: maxRn,
                max_radm: considerWeight ? maxRadmNetGlob : maxRadmGlob,
                max_radm_dif: considerWeight ? maxRadmNetDif : maxRadmDif,
                max_radm_gross: maxRadmGlob,
                max_radm_dif_gross: maxRadmDif,
                max_radm_net: maxRadmNetGlob,
                max_radm_dif_net: maxRadmNetDif,
                depth_at_max: depthAtMax,
                depth_for_target: considerWeight ? depthForTargetNetGlob : depthForTargetGlob,
                depth_for_target_dif: considerWeight ? depthForTargetNetDif : depthForTargetDif,
                depth_for_target_gross: depthForTargetGlob,
                depth_for_target_dif_gross: depthForTargetDif,
                depth_for_target_net: depthForTargetNetGlob,
                depth_for_target_dif_net: depthForTargetNetDif,
                reached_target: ((considerWeight ? depthForTargetNetGlob : depthForTargetGlob) !== null),
                reached_target_dif: ((considerWeight ? depthForTargetNetDif : depthForTargetDif) !== null)
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
    const considerWeight = projectData.consider_pile_weight ?? false;
    const gammaConc = projectData.concrete_unit_weight ?? 24.0;
    const gammaW = projectData.water_unit_weight ?? 10.0;
    const gammaSubConc = gammaConc - gammaW;
    const weightMode = projectData.pile_weight_mode || "submerged_concrete";

    (projectData.axes || []).forEach(ax => {
        const cotaTopo = (ax.cota_topo_m !== undefined) ? ax.cota_topo_m : ax.cota_inicio_m;
        const pTarget = ax.target_load_kN || targetLoad;
        const casingLen = (ax.casing_length_m !== undefined && ax.casing_length_m !== null) ? ax.casing_length_m : projectData.casing_length_m;
        const axLenAbove = (ax.pile_length_above_start_m !== undefined && ax.pile_length_above_start_m !== null)
            ? Number(ax.pile_length_above_start_m)
            : Number(projectData.pile_length_above_start_m || 0.0);
        const axInfo = {
            name: ax.name,
            cota_topo_m: cotaTopo,
            cota_inicio_m: cotaTopo,
            target_load_kN: pTarget,
            casing_length_m: casingLen,
            pile_length_above_start_m: axLenAbove,
            piles: {}
        };

        const firstProf = Math.ceil(cotaTopo / 0.6) * 0.6;
        const maxLayersZ = critLayers.length > 0 ? critLayers[critLayers.length - 1].z_fim : 132.6;
        const maxSteps = Math.max(1, Math.floor((maxLayersZ - firstProf) / 0.6) + 1);

        piles.forEach(p => {
            const wAbove = (axLenAbove > 0) ? (p.area_m2 * axLenAbove * gammaSubConc) : 0;
            let depthFundoGlob = null;
            let depthFundoDif = null;
            let depthFundoNetGlob = null;
            let depthFundoNetDif = null;
            let maxRadmGlob = 0;
            let maxRadmDif = 0;
            let maxRadmNetGlob = 0;
            let maxRadmNetDif = 0;
            let wAtTargetGlob = 0;
            let wAtTargetDif = 0;
            let wAtTargetNetGlob = 0;
            let wAtTargetNetDif = 0;
            let sumW = wAbove;

            for (let k = 0; k < maxSteps; k++) {
                const z = Math.round((firstProf + k * 0.6) * 100) / 100;
                let sumRs = 0;
                let qpAtTip = 0;
                let curSumW = wAbove;

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

                        // Peso próprio efetivo
                        let effGamma = 0;
                        if (weightMode === "displaced_soil") {
                            const soilGamma = (effZFim > wt) ? (l.gamma) : (l.gamma);
                            const concG = (effZFim > wt) ? gammaSubConc : gammaConc;
                            effGamma = Math.max(0, concG - soilGamma);
                        } else {
                            if (effZFim <= wt) {
                                effGamma = gammaConc;
                            } else if (effZIni >= wt) {
                                effGamma = gammaSubConc;
                            } else {
                                const dzDry = Math.max(0, wt - effZIni);
                                const dzSub = Math.max(0, effZFim - wt);
                                effGamma = (dzDry * gammaConc + dzSub * gammaSubConc) / effDz;
                            }
                        }
                        curSumW += p.area_m2 * effDz * effGamma;
                    }
                    if (l.z_ini < z && z <= l.z_fim) {
                        qpAtTip = l.qp;
                    }
                });

                if (qpAtTip === 0 && critLayers.length > 0) {
                    qpAtTip = critLayers[critLayers.length - 1].qp;
                }

                sumW = curSumW;
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

                const radmNetGlob = Math.max(0, Math.floor(radmGlob - sumW));
                const radmNetDif = Math.max(0, Math.floor(radmDif - sumW));

                if (radmGlob > maxRadmGlob) maxRadmGlob = radmGlob;
                if (radmDif > maxRadmDif) maxRadmDif = radmDif;
                if (radmNetGlob > maxRadmNetGlob) maxRadmNetGlob = radmNetGlob;
                if (radmNetDif > maxRadmNetDif) maxRadmNetDif = radmNetDif;

                if (depthFundoGlob === null && radmGlob >= pTarget) {
                    depthFundoGlob = z;
                    wAtTargetGlob = sumW;
                }
                if (depthFundoDif === null && radmDif >= pTarget) {
                    depthFundoDif = z;
                    wAtTargetDif = sumW;
                }
                if (depthFundoNetGlob === null && radmNetGlob >= pTarget) {
                    depthFundoNetGlob = z;
                    wAtTargetNetGlob = sumW;
                }
                if (depthFundoNetDif === null && radmNetDif >= pTarget) {
                    depthFundoNetDif = z;
                    wAtTargetNetDif = sumW;
                }

                if (depthFundoGlob !== null && depthFundoDif !== null && depthFundoNetGlob !== null && depthFundoNetDif !== null) {
                    break;
                }
            }

            const embGrossGlob = (depthFundoGlob !== null) ? Math.round((depthFundoGlob - cotaTopo) * 100) / 100 : null;
            const embGrossDif = (depthFundoDif !== null) ? Math.round((depthFundoDif - cotaTopo) * 100) / 100 : null;
            const embNetGlob = (depthFundoNetGlob !== null) ? Math.round((depthFundoNetGlob - cotaTopo) * 100) / 100 : null;
            const embNetDif = (depthFundoNetDif !== null) ? Math.round((depthFundoNetDif - cotaTopo) * 100) / 100 : null;

            const activeFundoGlob = considerWeight ? depthFundoNetGlob : depthFundoGlob;
            const activeEmbGlob = considerWeight ? embNetGlob : embGrossGlob;
            const activeFundoDif = considerWeight ? depthFundoNetDif : depthFundoDif;
            const activeEmbDif = considerWeight ? embNetDif : embGrossDif;
            const activeMaxRadmGlob = considerWeight ? maxRadmNetGlob : maxRadmGlob;
            const activeMaxRadmDif = considerWeight ? maxRadmNetDif : maxRadmDif;

            axInfo.piles[p.id] = {
                name: p.name,
                diam_m: p.diam_m,
                area_m2: p.area_m2,
                perimeter_m: p.perimeter_m,
                cota_fundo_m: (activeFundoGlob !== null) ? Math.round(activeFundoGlob * 10) / 10 : "N/A",
                embutimento_m: (activeEmbGlob !== null) ? Math.round(activeEmbGlob * 100) / 100 : "N/A",
                comprimento_util_m: (activeEmbGlob !== null) ? Math.round(activeEmbGlob * 100) / 100 : "N/A",
                reached_target: (activeFundoGlob !== null),
                max_radm: Math.round(activeMaxRadmGlob),

                cota_fundo_global_m: (activeFundoGlob !== null) ? Math.round(activeFundoGlob * 10) / 10 : "N/A",
                embutimento_global_m: (activeEmbGlob !== null) ? Math.round(activeEmbGlob * 100) / 100 : "N/A",
                max_radm_global: Math.round(activeMaxRadmGlob),

                cota_fundo_dif_m: (activeFundoDif !== null) ? Math.round(activeFundoDif * 10) / 10 : "N/A",
                embutimento_dif_m: (activeEmbDif !== null) ? Math.round(activeEmbDif * 100) / 100 : "N/A",
                reached_target_dif: (activeFundoDif !== null),
                max_radm_dif: Math.round(activeMaxRadmDif),

                cota_fundo_gross_global_m: (depthFundoGlob !== null) ? Math.round(depthFundoGlob * 10) / 10 : "N/A",
                embutimento_gross_global_m: (embGrossGlob !== null) ? Math.round(embGrossGlob * 100) / 100 : "N/A",
                max_radm_gross_global: Math.round(maxRadmGlob),
                w_pile_gross_target_global_kN: Math.round(wAtTargetGlob),

                cota_fundo_net_global_m: (depthFundoNetGlob !== null) ? Math.round(depthFundoNetGlob * 10) / 10 : "N/A",
                embutimento_net_global_m: (embNetGlob !== null) ? Math.round(embNetGlob * 100) / 100 : "N/A",
                max_radm_net_global: Math.round(maxRadmNetGlob),
                w_pile_net_target_global_kN: Math.round(wAtTargetNetGlob),

                cota_fundo_gross_dif_m: (depthFundoDif !== null) ? Math.round(depthFundoDif * 10) / 10 : "N/A",
                embutimento_gross_dif_m: (embGrossDif !== null) ? Math.round(embGrossDif * 100) / 100 : "N/A",
                max_radm_gross_dif: Math.round(maxRadmDif),
                w_pile_gross_target_dif_kN: Math.round(wAtTargetDif),

                cota_fundo_net_dif_m: (depthFundoNetDif !== null) ? Math.round(depthFundoNetDif * 10) / 10 : "N/A",
                embutimento_net_dif_m: (embNetDif !== null) ? Math.round(embNetDif * 100) / 100 : "N/A",
                max_radm_net_dif: Math.round(maxRadmNetDif),
                w_pile_net_target_dif_kN: Math.round(wAtTargetNetDif),
                w_above_kN: Math.round(wAbove),
                pile_length_above_start_m: axLenAbove,
                w_pile_effective_total_kN: Math.round(sumW)
            };
        });

        axesResults.push(axInfo);
    });

    const minInfo = detectMinSoundingDepth();
    const extrapolationEstimatesBySounding = {};

    for (const [sName, sLayers] of Object.entries(soundings)) {
        let realL;
        if (sName === "SPT-01") {
            const cutoff = projectData.spt01_measured_depth_m ?? 44.4;
            realL = sLayers.filter(l => !l.is_extrapolated && parseFloat(l.z_fim) <= cutoff + 1e-4);
            if (realL.length === 0) realL = sLayers.filter(l => parseFloat(l.z_fim) <= cutoff + 1e-4);
        } else {
            realL = sLayers.filter(l => !l.is_extrapolated);
            if (realL.length === 0) realL = [...sLayers];
        }
        const baseD = realL.length > 0 ? Math.max(...realL.map(l => parseFloat(l.z_fim) || 0)) : (projectData.base_depth_m ?? 44.4);

        const grps = realL.map(l => l.soil_group).filter(Boolean);
        const counts = {};
        const sucsCounts = {};
        grps.forEach(g => { counts[g] = (counts[g] || 0) + 1; });
        realL.forEach(l => { if (l.sucs) sucsCounts[l.sucs] = (sucsCounts[l.sucs] || 0) + 1; });

        let modalG = "Areias";
        let modalC = 0;
        for (const [g, c] of Object.entries(counts)) {
            if (c > modalC) { modalC = c; modalG = g; }
        }
        let modalS = modalG === "Areias" ? "SP-SM" : "GW-GM";
        let maxS = 0;
        for (const [s, c] of Object.entries(sucsCounts)) {
            if (c > maxS) { maxS = c; modalS = s; }
        }

        const lastLayer = realL[realL.length - 1];
        let adoptedG = modalG;
        let adoptedS = modalS;
        const forcedG = projectData.extrapolation_soil_group;

        if (forcedG === "last_layer" || forcedG === "bottom_layer") {
            adoptedG = lastLayer?.soil_group || modalG;
            adoptedS = lastLayer?.sucs || modalS;
        } else if (forcedG && forcedG !== "auto") {
            adoptedG = forcedG;
        }

        const modalP = grps.length > 0 ? Math.round((modalC / grps.length) * 1000) / 10 : 0;
        const nVals = realL.map(l => parseFloat(l.n1_60) || 10).sort((a, b) => a - b);
        const pIdx = Math.max(0, Math.min(nVals.length - 1, Math.floor(nVals.length * ((projectData.extrapolation_n_percentile ?? 15) / 100))));
        const nEst = nVals.length > 0 ? Math.round(nVals[pIdx]) : 27;
        const phiEst = Math.round((27.5 + 9.2 * Math.log10(Math.max(1, nEst))) * 10) / 10;
        const maxD = projectData.extrapolation_max_depth_m ?? 132.6;
        const numL = Math.max(0, Math.round((maxD - baseD) / 0.6));

        const estS = {
            sounding_name: sName,
            base_depth_m: baseD,
            max_depth_m: maxD,
            extrapolated_length_m: Math.max(0, maxD - baseD),
            num_extrapolated_layers: numL,
            modal_soil_group: modalG,
            modal_soil_count: modalC,
            total_measured_layers: grps.length,
            modal_soil_pct: modalP,
            modal_sucs: modalS,
            adopted_soil_group: adoptedG,
            adopted_sucs: adoptedS,
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
        extrapolationEstimatesBySounding[sName] = estS;
        if (analyzedSoundings[sName]) {
            analyzedSoundings[sName].extrapolation_estimates = estS;
        }
    }

    const defaultEstName = (critName in extrapolationEstimatesBySounding) ? critName : (minInfo.minSounding in extrapolationEstimatesBySounding ? minInfo.minSounding : "SPT-01");
    const localEst = extrapolationEstimatesBySounding[defaultEstName] || Object.values(extrapolationEstimatesBySounding)[0];

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
        extrapolation_estimates: localEst,
        extrapolation_estimates_by_sounding: extrapolationEstimatesBySounding
    };

    updateUIWithResults();
}
