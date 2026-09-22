/**
 * Aoki-Velloso & Décourt-Quaresma Foundation Calculator UI & Chart Controller
 * (+ Bloco de Coroamento sobre Estacas pelo Método de Blévot & Frémy / NBR 6118)
 */

let SOIL_TYPES_LIST = [
    "AREIA", "AREIA SILTOSA", "AREIA SILTOARGILOSA", "AREIA ARGILOSSILTOSA",
    "AREIA ARGILOSA", "SILTE ARENOSO", "SILTE ARENOARGILOSO", "SILTE ARGILOARENOSO",
    "SILTE ARGILOSO", "ARGILA ARENOSA", "ARGILA ARENOSSILTOSA", "ARGILA SILTOARENOSA",
    "ARGILA SILTOSA", "ARGILA", "ROCHA"
];

let PILE_FACTORS_MAP = {
    "PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO": { F1: 2.5, F2: 3.5 },
    "FRANKI DE FUSTE APILOADO": { F1: 2.3, F2: 3.0 },
    "FRANKI DE FUSTE VIBRADO": { F1: 2.3, F2: 3.2 },
    "METÁLICA": { F1: 1.75, F2: 3.5 },
    "PRÉ-MOLDADA DE CONCRETO CRAVADA POR PRENSAGEM": { F1: 1.2, F2: 2.3 },
    "ESCAVADA COM LAMA BENTONÍTICA": { F1: 3.5, F2: 4.5 },
    "RAIZ": { F1: 2.2, F2: 2.4 },
    "STRAUSS": { F1: 4.2, F2: 3.9 },
    "HÉLICE CONTÍNUA": { F1: 3.0, F2: 3.8 }
};

let DECOURT_FACTORS_MAP = {
    "PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO": { alpha: 1.0, beta: 1.0 },
    "PRÉ-MOLDADA DE CONCRETO CRAVADA POR PRENSAGEM": { alpha: 1.0, beta: 1.0 },
    "METÁLICA": { alpha: 1.0, beta: 1.0 },
    "FRANKI DE FUSTE APILOADO": { alpha: 1.0, beta: 1.0 },
    "FRANKI DE FUSTE VIBRADO": { alpha: 1.0, beta: 1.0 },
    "HÉLICE CONTÍNUA": { alpha: 0.3, beta: 1.0 },
    "ESCAVADA COM LAMA BENTONÍTICA": { alpha: 0.5, beta: 0.8 },
    "ESCAVADA A SECO": { alpha: 0.5, beta: 0.8 },
    "RAIZ": { alpha: 0.85, beta: 1.5 },
    "STRAUSS": { alpha: 0.5, beta: 1.0 },
    "ÔMEGA": { alpha: 1.0, beta: 1.1 }
};

let currentProfile = [];
let chartNsptInstance = null;
let chartCapacityInstance = null;
let chartSpringsInstance = null;
let chartEarthPressureInstance = null;
let latestCalculatedSprings = null;
let latestResult = null;
let activeTab = 'comparison';

const AOKI_SESSION_KEY = 'aoki_velloso_session_data';

function switchMainTab(tabKey) {
    activeTab = tabKey;
    const tabs = ['comparison', 'aoki', 'decourt'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const view = document.getElementById(`view-tab-${t}`);
        if (btn) {
            if (t === tabKey) {
                btn.className = "tab-btn px-4 py-2 rounded-xl text-xs font-bold transition-all border border-blue-600 bg-blue-600 text-white flex items-center gap-1.5 shadow-sm";
            } else {
                btn.className = "tab-btn px-4 py-2 rounded-xl text-xs font-semibold transition-all border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1.5";
            }
        }
        if (view) {
            if (t === tabKey) {
                view.classList.remove('hidden');
            } else {
                view.classList.add('hidden');
            }
        }
    });
}

function saveAokiSession() {
    try {
        const inputs = {
            geometry: document.getElementById('geometry')?.value,
            diameter: document.getElementById('diameter')?.value,
            width_b: document.getElementById('width_b')?.value,
            height_h: document.getElementById('height_h')?.value,
            depth_pile: document.getElementById('depth_pile')?.value,
            pile_type: document.getElementById('pile_type')?.value,
            allowable_settlement_mm: document.getElementById('allowable_settlement_mm')?.value,
            soil_gamma: document.getElementById('soil_gamma')?.value,
            num_piles: document.getElementById('num_piles')?.value,
            structure_mass_ton: document.getElementById('structure_mass_ton')?.value,
            cap_num_piles: document.getElementById('cap_num_piles')?.value,
            cap_load_Nk_kN: document.getElementById('cap_load_Nk_kN')?.value,
            cap_col_a_m: document.getElementById('cap_col_a_m')?.value,
            cap_col_b_m: document.getElementById('cap_col_b_m')?.value,
            cap_pile_spacing_m: document.getElementById('cap_pile_spacing_m')?.value,
            cap_fck_mpa: document.getElementById('cap_fck_mpa')?.value,
            cap_fyk_mpa: document.getElementById('cap_fyk_mpa')?.value,
            cap_cover_cm: document.getElementById('cap_cover_cm')?.value,
            cap_embedment_cm: document.getElementById('cap_embedment_cm')?.value,
            active_tab: activeTab
        };
        const data = {
            version: '2.0',
            timestamp: Date.now(),
            inputs: inputs,
            profile: currentProfile
        };
        localStorage.setItem(AOKI_SESSION_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Erro ao salvar sessão Aoki-Velloso:', e);
    }
}

function loadAokiSession() {
    const raw = localStorage.getItem(AOKI_SESSION_KEY);
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        if (!data) return false;
        let applied = false;

        if (data.inputs) {
            Object.entries(data.inputs).forEach(([id, val]) => {
                const el = document.getElementById(id);
                if (el && val !== undefined && val !== null) {
                    el.value = val;
                    applied = true;
                }
            });
            if (data.inputs.active_tab) {
                switchMainTab(data.inputs.active_tab);
            }
        }
        if (Array.isArray(data.profile) && data.profile.length > 0) {
            currentProfile = JSON.parse(JSON.stringify(data.profile));
            applied = true;
        }

        if (applied) {
            const banner = document.getElementById('session-restore-banner');
            if (banner) banner.classList.remove('hidden');
        }
        return applied;
    } catch (e) {
        console.warn('Erro ao restaurar sessão Aoki-Velloso:', e);
        return false;
    }
}

function resetDefaults() {
    if (!confirm('Deseja realmente restaurar todos os parâmetros e perfil de solo para os valores padrão de fábrica?')) {
        return;
    }
    localStorage.removeItem(AOKI_SESSION_KEY);
    const banner = document.getElementById('session-restore-banner');
    if (banner) banner.classList.add('hidden');
    loadReferencePreset();
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch metadata & default profile from backend if Eel is present
    let defaultBackendProfile = null;
    if (typeof eel !== 'undefined' && eel.get_aoki_reference_data) {
        try {
            const refData = await eel.get_aoki_reference_data()();
            if (refData) {
                if (refData.soil_types) SOIL_TYPES_LIST = refData.soil_types;
                if (refData.pile_factors) PILE_FACTORS_MAP = refData.pile_factors;
                if (refData.decourt_pile_factors) DECOURT_FACTORS_MAP = refData.decourt_pile_factors;
                if (refData.default_profile) defaultBackendProfile = refData.default_profile;
            }
        } catch (err) {
            console.warn("Could not load backend Aoki reference data, using built-in defaults.", err);
        }
    }

    // 2. Try to restore previous user session; if none exists, use backend or builtin defaults
    const restored = loadAokiSession();
    if (!restored || !currentProfile || currentProfile.length === 0) {
        currentProfile = defaultBackendProfile ? JSON.parse(JSON.stringify(defaultBackendProfile)) : getBuiltinDefaultProfile();
    }

    // 3. Setup form listeners and update factors
    setupEventListeners();
    toggleGeometryInputs();
    updatePileFactors();

    // 4. Render initial table & trigger calculation
    renderLayersTable();
    triggerCalculation();

    // 5. Ensure latest session is persisted before window navigates
    window.addEventListener('beforeunload', saveAokiSession);
});

function getBuiltinDefaultProfile() {
    return [
        { depth: 1, soil_type: "ARGILA SILTOARENOSA", nspt: 2.4 },
        { depth: 2, soil_type: "ARGILA SILTOARENOSA", nspt: 1.4 },
        { depth: 3, soil_type: "ARGILA SILTOARENOSA", nspt: 1.9 },
        { depth: 4, soil_type: "ARGILA SILTOARENOSA", nspt: 2.6 },
        { depth: 5, soil_type: "ARGILA SILTOARENOSA", nspt: 3.6 },
        { depth: 6, soil_type: "ARGILA SILTOARENOSA", nspt: 3.6 },
        { depth: 7, soil_type: "ARGILA SILTOARENOSA", nspt: 3.9 },
        { depth: 8, soil_type: "ARGILA SILTOARENOSA", nspt: 7.3 },
        { depth: 9, soil_type: "ARGILA SILTOARENOSA", nspt: 7.3 },
        { depth: 10, soil_type: "ARGILA SILTOARENOSA", nspt: 8.4 },
        { depth: 11, soil_type: "ARGILA SILTOARENOSA", nspt: 12.6 },
        { depth: 12, soil_type: "ARGILA SILTOARENOSA", nspt: 11.0 },
        { depth: 13, soil_type: "ARGILA SILTOARENOSA", nspt: 10.0 },
        { depth: 14, soil_type: "ARGILA SILTOARENOSA", nspt: 15.0 },
        { depth: 15, soil_type: "ARGILA SILTOARENOSA", nspt: 22.4 },
        { depth: 16, soil_type: "ARGILA SILTOARENOSA", nspt: 20.6 },
        { depth: 17, soil_type: "ROCHA", nspt: 60.0 }
    ];
}

function setupEventListeners() {
    const inputs = document.querySelectorAll('#diameter, #width_b, #height_h, #depth_pile, #allowable_settlement_mm, #soil_gamma, #num_piles, #structure_mass_ton, #cap_load_Nk_kN, #cap_col_a_m, #cap_col_b_m, #cap_pile_spacing_m, #cap_fck_mpa, #cap_fyk_mpa, #cap_cover_cm, #cap_embedment_cm');
    inputs.forEach(input => {
        input.addEventListener('input', () => { triggerCalculation(); saveAokiSession(); });
        input.addEventListener('change', () => { triggerCalculation(); saveAokiSession(); });
    });
}

function toggleGeometryInputs() {
    const geo = document.getElementById('geometry').value;
    const diamCont = document.getElementById('diam-container');
    const rectCont = document.getElementById('rect-container');
    if (geo === 'Circular') {
        diamCont.classList.remove('hidden');
        rectCont.classList.add('hidden');
    } else {
        diamCont.classList.add('hidden');
        rectCont.classList.remove('hidden');
    }
}

function updatePileFactors() {
    const pType = document.getElementById('pile_type').value;
    const fAoki = PILE_FACTORS_MAP[pType] || { F1: 2.5, F2: 3.5 };
    const fDecourt = DECOURT_FACTORS_MAP[pType] || { alpha: 1.0, beta: 1.0 };
    
    document.getElementById('val-f1').innerText = fAoki.F1.toFixed(2);
    document.getElementById('val-f2').innerText = fAoki.F2.toFixed(2);
    
    const elAlpha = document.getElementById('val-alpha');
    const elBeta = document.getElementById('val-beta');
    if (elAlpha) elAlpha.innerText = fDecourt.alpha.toFixed(2);
    if (elBeta) elBeta.innerText = fDecourt.beta.toFixed(2);
}

function parseNum(id, def = 0.0) {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
}

function getPayload() {
    const epH     = parseNum('ep-input-H', 5.0);
    const epDelta = parseNum('ep-input-delta', 0.0);
    const epPhi   = parseNum('ep-input-phi', 0.0);
    const epC     = parseNum('ep-input-c', 0.0);

    const earthPressure = { H_m: epH, delta_deg: epDelta };
    if (epPhi > 0) earthPressure.phi_deg = epPhi;
    if (epC > 0)   earthPressure.c_kPa   = epC;

    return {
        geometry: document.getElementById('geometry').value,
        diameter: parseNum('diameter', 1.0),
        width_b: parseNum('width_b', 1.0),
        height_h: parseNum('height_h', 1.0),
        depth_pile: parseNum('depth_pile', 16.0),
        pile_type: document.getElementById('pile_type').value,
        allowable_settlement_mm: parseNum('allowable_settlement_mm', 5.0),
        soil_gamma: parseNum('soil_gamma', 1.8),
        num_piles: parseInt(parseNum('num_piles', 15)),
        structure_mass_ton: parseNum('structure_mass_ton', 1690.4),
        profile: currentProfile,
        cap_num_piles: parseInt(parseNum('cap_num_piles', 2)),
        cap_pile_diam_m: parseNum('diameter', 1.0),
        cap_pile_spacing_m: parseNum('cap_pile_spacing_m', 1.80),
        cap_col_a_m: parseNum('cap_col_a_m', 0.40),
        cap_col_b_m: parseNum('cap_col_b_m', 0.40),
        cap_load_Nk_kN: parseNum('cap_load_Nk_kN', 1500.0),
        cap_fck_mpa: parseNum('cap_fck_mpa', 30.0),
        cap_fyk_mpa: parseNum('cap_fyk_mpa', 500.0),
        cap_cover_cm: parseNum('cap_cover_cm', 5.0),
        cap_embedment_cm: parseNum('cap_embedment_cm', 5.0),
        earth_pressure: earthPressure
    };
}

function triggerCalculation() {
    const payload = getPayload();
    saveAokiSession();

    if (typeof eel !== 'undefined' && eel.calculate_aoki_velloso) {
        eel.calculate_aoki_velloso(payload)(function (response) {
            if (response && response.success) {
                updateUIResults(response);
            } else {
                console.error("Aoki & Décourt Calculation Error:", response?.error);
            }
        });
    }
}

function updateUIResults(res) {
    const cap = res.capacities || {};
    const stiff = res.stiffness_and_damping || {};
    const geo = res.geometry || {};
    const decourt = res.decourt_quaresma || {};
    const comp = res.comparison || {};
    const pileCap = res.pile_cap || {};

    // 1. COMPARISON TAB KPIS
    const elCompAokiTf = document.getElementById('kpi-comp-aoki-tf');
    const elCompAokiKn = document.getElementById('kpi-comp-aoki-kn');
    const elCompAokiSub = document.getElementById('kpi-comp-aoki-sub');
    if (elCompAokiTf) elCompAokiTf.innerText = `${cap.R_adm_tf ? cap.R_adm_tf.toFixed(1) : '--'} tf`;
    if (elCompAokiKn) elCompAokiKn.innerText = `${cap.R_adm_kN ? cap.R_adm_kN.toFixed(1) : '--'} kN (FS=2.0)`;
    if (elCompAokiSub) elCompAokiSub.innerText = `Rl: ${cap.R_shaft_tf ? cap.R_shaft_tf.toFixed(1) : '--'} tf | Rp: ${cap.R_tip_tf ? cap.R_tip_tf.toFixed(1) : '--'} tf`;

    const elCompDecourtTf = document.getElementById('kpi-comp-decourt-tf');
    const elCompDecourtKn = document.getElementById('kpi-comp-decourt-kn');
    const elCompDecourtSub = document.getElementById('kpi-comp-decourt-sub');
    if (elCompDecourtTf) elCompDecourtTf.innerText = `${decourt.R_adm_tf ? decourt.R_adm_tf.toFixed(1) : '--'} tf`;
    if (elCompDecourtKn) elCompDecourtKn.innerText = `${decourt.R_adm_kN ? decourt.R_adm_kN.toFixed(1) : '--'} kN (FS=2.0)`;
    if (elCompDecourtSub) elCompDecourtSub.innerText = `α: ${decourt.alpha ?? '--'} | β: ${decourt.beta ?? '--'}`;

    const elCompMeanTf = document.getElementById('kpi-comp-mean-tf');
    const elCompMeanKn = document.getElementById('kpi-comp-mean-kn');
    if (elCompMeanTf && comp.mean) elCompMeanTf.innerText = `${comp.mean.R_adm_tf ? comp.mean.R_adm_tf.toFixed(1) : '--'} tf`;
    if (elCompMeanKn && comp.mean) elCompMeanKn.innerText = `${comp.mean.R_adm_kN ? comp.mean.R_adm_kN.toFixed(1) : '--'} kN`;

    const elCompConservTf = document.getElementById('kpi-comp-conserv-tf');
    const elCompConservKn = document.getElementById('kpi-comp-conserv-kn');
    const elCompConservGov = document.getElementById('kpi-comp-conserv-method');
    if (elCompConservTf && comp.conservative) elCompConservTf.innerText = `${comp.conservative.R_adm_tf ? comp.conservative.R_adm_tf.toFixed(1) : '--'} tf`;
    if (elCompConservKn && comp.conservative) elCompConservKn.innerText = `${comp.conservative.R_adm_kN ? comp.conservative.R_adm_kN.toFixed(1) : '--'} kN`;
    if (elCompConservGov && comp.conservative) elCompConservGov.innerText = `Gov.: ${comp.conservative.governing_method} (Δ ${comp.conservative.diff_percent}%)`;

    const elCompKzTf = document.getElementById('kpi-comp-kz-tf-m');
    const elCompKzKn = document.getElementById('kpi-comp-kz-kn-mm');
    if (elCompKzTf && stiff.Kz_static_single_tf_m) elCompKzTf.innerText = `${stiff.Kz_static_single_tf_m.toLocaleString()} tf/m`;
    if (elCompKzKn && stiff.Kz_static_single_kN_mm) elCompKzKn.innerText = `${stiff.Kz_static_single_kN_mm.toFixed(1)} kN/mm`;

    const elCompCapAs = document.getElementById('kpi-comp-cap-as');
    const elCompCapRebar = document.getElementById('kpi-comp-cap-rebar');
    const elCompCapStatus = document.getElementById('kpi-comp-cap-status');
    if (elCompCapAs && pileCap.reinforcement) elCompCapAs.innerText = `${pileCap.reinforcement.As_cm2.toFixed(1)} cm²`;
    if (elCompCapRebar && pileCap.reinforcement) elCompCapRebar.innerText = pileCap.reinforcement.suggested_bars;
    if (elCompCapStatus && pileCap.strut_and_tie) {
        elCompCapStatus.innerText = pileCap.strut_and_tie.is_rigid_valid ? 'Bielas: Rígido 45°-55° (OK)' : 'Bielas: Fora da faixa rígida';
        elCompCapStatus.className = pileCap.strut_and_tie.is_rigid_valid ? "text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1" : "text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1";
    }

    // 2. AOKI-VELLOSO DETAILED KPIS
    const elRadmTf = document.getElementById('kpi-radm-tf');
    const elRadmKn = document.getElementById('kpi-radm-kn');
    if (elRadmTf) elRadmTf.innerText = `${cap.R_adm_tf ? cap.R_adm_tf.toFixed(1) : '--'} tf`;
    if (elRadmKn) elRadmKn.innerText = `${cap.R_adm_kN ? cap.R_adm_kN.toFixed(1) : '--'} kN`;

    const elRadmGrp = document.getElementById('kpi-radm-group-tf');
    const elGrpInfo = document.getElementById('kpi-group-info');
    if (elRadmGrp) elRadmGrp.innerText = `${cap.R_adm_group_tf ? cap.R_adm_group_tf.toFixed(0) : '--'} tf`;
    if (elGrpInfo) elGrpInfo.innerText = `${payload_num_piles()} estacas (${cap.R_adm_group_kN ? cap.R_adm_group_kN.toFixed(0) : '--'} kN)`;

    const elRlTf = document.getElementById('kpi-rl-tf');
    const elRlPct = document.getElementById('kpi-rl-pct');
    if (elRlTf) elRlTf.innerText = `${cap.R_shaft_tf ? cap.R_shaft_tf.toFixed(1) : '--'} tf`;
    if (elRlPct) elRlPct.innerText = `${cap.ratio_shaft_pct ?? '--'}% do total`;

    const elRpTf = document.getElementById('kpi-rp-tf');
    const elRpPct = document.getElementById('kpi-rp-pct');
    if (elRpTf) elRpTf.innerText = `${cap.R_tip_tf ? cap.R_tip_tf.toFixed(1) : '--'} tf`;
    if (elRpPct) elRpPct.innerText = `${cap.ratio_tip_pct ?? '--'}% do total`;

    const elKzTf = document.getElementById('kpi-kz-tf-m');
    const elKzKn = document.getElementById('kpi-kz-kn-mm');
    if (elKzTf && stiff.Kz_static_single_tf_m) elKzTf.innerText = `${stiff.Kz_static_single_tf_m.toLocaleString()} tf/m`;
    if (elKzKn && stiff.Kz_static_single_kN_mm) elKzKn.innerText = `${stiff.Kz_static_single_kN_mm.toFixed(1)} kN/mm`;

    const elDgz = document.getElementById('kpi-dgz');
    const elDgxy = document.getElementById('kpi-dgxy');
    if (elDgz && stiff.Dgz_percent !== undefined) elDgz.innerText = `${stiff.Dgz_percent.toFixed(1)} %`;
    if (elDgxy && stiff.Dgxy_percent !== undefined) elDgxy.innerText = `Dgxy: ${stiff.Dgxy_percent.toFixed(1)} %`;

    // 3. DÉCOURT-QUARESMA DETAILED KPIS
    const elDecourtRadmTf = document.getElementById('kpi-decourt-radm-tf');
    const elDecourtRadmKn = document.getElementById('kpi-decourt-radm-kn');
    if (elDecourtRadmTf) elDecourtRadmTf.innerText = `${decourt.R_adm_tf ? decourt.R_adm_tf.toFixed(1) : '--'} tf`;
    if (elDecourtRadmKn) elDecourtRadmKn.innerText = `${decourt.R_adm_kN ? decourt.R_adm_kN.toFixed(1) : '--'} kN`;

    const elDecourtParcTf = document.getElementById('kpi-decourt-radm-parc-tf');
    const elDecourtParcKn = document.getElementById('kpi-decourt-radm-parc-kn');
    if (elDecourtParcTf) elDecourtParcTf.innerText = `${decourt.R_adm_partial_tf ? decourt.R_adm_partial_tf.toFixed(1) : '--'} tf`;
    if (elDecourtParcKn) elDecourtParcKn.innerText = `${decourt.R_adm_partial_kN ? decourt.R_adm_partial_kN.toFixed(1) : '--'} kN (Fsp=4/Fsl=1.3)`;

    const elDecourtRlTf = document.getElementById('kpi-decourt-rl-tf');
    const elDecourtRlSub = document.getElementById('kpi-decourt-rl-sub');
    if (elDecourtRlTf) elDecourtRlTf.innerText = `${decourt.R_shaft_tf ? decourt.R_shaft_tf.toFixed(1) : '--'} tf`;
    if (elDecourtRlSub) elDecourtRlSub.innerText = `${decourt.ratio_shaft_pct ?? '--'}% do total (β=${decourt.beta ?? '--'})`;

    const elDecourtRpTf = document.getElementById('kpi-decourt-rp-tf');
    const elDecourtRpSub = document.getElementById('kpi-decourt-rp-sub');
    if (elDecourtRpTf) elDecourtRpTf.innerText = `${decourt.R_tip_tf ? decourt.R_tip_tf.toFixed(1) : '--'} tf`;
    if (elDecourtRpSub) elDecourtRpSub.innerText = `qp: ${decourt.qp_kpa ? decourt.qp_kpa.toFixed(0) : '--'} kPa (α=${decourt.alpha ?? '--'})`;

    const elDecourtC = document.getElementById('kpi-decourt-c-val');
    const elDecourtNp = document.getElementById('kpi-decourt-np-val');
    if (elDecourtC) elDecourtC.innerText = `${decourt.tip_C_kpa ? decourt.tip_C_kpa.toFixed(0) : '--'} kPa`;
    if (elDecourtNp) elDecourtNp.innerText = `Np (3 pts): ${decourt.np_clamped ? decourt.np_clamped.toFixed(1) : '--'}`;

    const elDecourtFactors = document.getElementById('kpi-decourt-factors');
    const elDecourtPType = document.getElementById('kpi-decourt-p-type');
    if (elDecourtFactors) elDecourtFactors.innerText = `α=${decourt.alpha ?? '--'} | β=${decourt.beta ?? '--'}`;
    if (elDecourtPType) elDecourtPType.innerText = document.getElementById('pile_type').value;

    // 4. BLÉVOT PILE CAP DETAILED KPIS
    if (pileCap.dimensions && pileCap.strut_and_tie && pileCap.reinforcement) {
        const dim = pileCap.dimensions;
        const st = pileCap.strut_and_tie;
        const re = pileCap.reinforcement;

        const elNd = document.getElementById('kpi-blevot-nd');
        const elPd = document.getElementById('kpi-blevot-pd');
        if (elNd) elNd.innerText = `${pileCap.Nd_kN.toFixed(0)} kN`;
        if (elPd) elPd.innerText = `Pd: ${pileCap.Pd_kN.toFixed(0)} kN/estaca (Nk=${pileCap.Nk_kN} kN)`;

        const elGeom = document.getElementById('kpi-blevot-geom');
        const elVol = document.getElementById('kpi-blevot-vol');
        if (elGeom) elGeom.innerText = `${dim.L_cap_m.toFixed(2)} x ${dim.B_cap_m.toFixed(2)} x ${dim.H_cap_m.toFixed(2)} m`;
        if (elVol) elVol.innerText = `Vol: ${dim.volume_m3.toFixed(2)} m³ (d = ${dim.d_eff_m.toFixed(2)} m)`;

        const elTheta = document.getElementById('kpi-blevot-theta');
        const elRigidBadge = document.getElementById('kpi-blevot-rigid-badge');
        if (elTheta) elTheta.innerText = `${st.theta_deg.toFixed(1)} °`;
        if (elRigidBadge) {
            elRigidBadge.innerText = st.is_rigid_valid ? '45° ≤ θ ≤ 55° (Bloco Rígido OK)' : (st.theta_deg < 45 ? 'θ < 45° (Bloco Flexível / Aumentar d)' : 'θ > 55° (Ângulo excessivo)');
            elRigidBadge.className = st.is_rigid_valid ? "text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5" : "text-xs font-bold text-amber-600 dark:text-amber-400 mt-0.5";
        }

        const elSigPil = document.getElementById('kpi-blevot-sigma-pilar');
        const elSigPilLim = document.getElementById('kpi-blevot-sigma-pilar-lim');
        if (elSigPil) elSigPil.innerText = `${st.sigma_pilar_mpa.toFixed(2)} MPa`;
        if (elSigPilLim) elSigPilLim.innerText = `Limite: ${st.sigma_cd_lim_mpa.toFixed(2)} MPa (${(st.ratio_pilar * 100).toFixed(0)}% ${st.ok_pilar ? 'OK' : 'Excedido'})`;

        const elSigEst = document.getElementById('kpi-blevot-sigma-estaca');
        const elSigEstLim = document.getElementById('kpi-blevot-sigma-estaca-lim');
        if (elSigEst) elSigEst.innerText = `${st.sigma_estaca_mpa.toFixed(2)} MPa`;
        if (elSigEstLim) elSigEstLim.innerText = `Limite: ${st.sigma_cd_lim_mpa.toFixed(2)} MPa (${(st.ratio_estaca * 100).toFixed(0)}% ${st.ok_estaca ? 'OK' : 'Excedido'})`;

        const elAs = document.getElementById('kpi-blevot-as');
        const elRebarSugg = document.getElementById('kpi-blevot-rebar-sugg');
        if (elAs) elAs.innerText = `${re.As_cm2.toFixed(2)} cm²`;
        if (elRebarSugg) elRebarSugg.innerText = `Tirante Ftd=${re.Ftd_kN.toFixed(0)} kN | ${re.suggested_bars}`;
    }

    // 5. EXECUTIVE SUMMARY
    const elArea = document.getElementById('res-area');
    const elPerim = document.getElementById('res-perim');
    const elKzDyn = document.getElementById('res-kz-dyn');
    const elKhDyn = document.getElementById('res-kh-dyn');
    const elCgcz = document.getElementById('res-cgcz');
    const elCgcxy = document.getElementById('res-cgcxy');

    if (elArea && geo.area_m2) elArea.innerText = `${geo.area_m2.toFixed(3)} m²`;
    if (elPerim && geo.perimeter_m) elPerim.innerText = `${geo.perimeter_m.toFixed(3)} m`;
    if (elKzDyn && stiff.Kz_dyn_group_tf_m) elKzDyn.innerText = `${stiff.Kz_dyn_group_tf_m.toLocaleString()} tf/m`;
    if (elKhDyn && stiff.Kh_dyn_group_tf_m) elKhDyn.innerText = `${stiff.Kh_dyn_group_tf_m.toLocaleString()} tf/m`;
    if (elCgcz && stiff.Cgcz_tf_s_m) elCgcz.innerText = `${stiff.Cgcz_tf_s_m.toLocaleString()} tf·s/m`;
    if (elCgcxy && stiff.Cgcxy_tf_s_m) elCgcxy.innerText = `${stiff.Cgcxy_tf_s_m.toLocaleString()} tf·s/m`;

    // 6. INTERACTION SPRINGS
    if (res.springs_for_integrations) {
        latestCalculatedSprings = res.springs_for_integrations;
        const raft = latestCalculatedSprings.for_piled_raft;
        const beam = latestCalculatedSprings.for_piled_beam;

        // Raft card
        const raftKzEl = document.getElementById('spring-raft-kz');
        const raftKzSubEl = document.getElementById('spring-raft-kz-sub');
        const raftRadmEl = document.getElementById('spring-raft-radm');
        const raftRadmSubEl = document.getElementById('spring-raft-radm-sub');
        const raftQnegEl = document.getElementById('spring-raft-qneg');
        const raftKsEl = document.getElementById('spring-raft-ks');

        if (raftKzEl) raftKzEl.innerText = `${raft.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m`;
        if (raftKzSubEl) raftKzSubEl.innerText = `${raft.pile_spring_kz_tf_m.toLocaleString('pt-BR')} tf/m`;
        if (raftRadmEl) raftRadmEl.innerText = `${raft.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN`;
        if (raftRadmSubEl) raftRadmSubEl.innerText = `${raft.pile_capacity_adm_tf.toFixed(1)} tf/estaca`;
        if (raftQnegEl) raftQnegEl.innerText = `${raft.q_negative_friction_kN} kN`;
        if (raftKsEl) raftKsEl.innerText = `${raft.subgrade_ks_kN_m3} kN/m³`;

        // Beam card
        const beamKzEl = document.getElementById('spring-beam-kz');
        const beamKxEl = document.getElementById('spring-beam-kx');
        const beamRadmEl = document.getElementById('spring-beam-radm');
        const beamTadmEl = document.getElementById('spring-beam-tadm');

        if (beamKzEl) beamKzEl.innerText = `${beam.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m`;
        if (beamKxEl) beamKxEl.innerText = `${beam.pile_spring_kx_fixed_kN_m.toLocaleString('pt-BR')} kN/m`;
        if (beamRadmEl) beamRadmEl.innerText = `${beam.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN`;
        if (beamTadmEl) beamTadmEl.innerText = `${beam.pile_tension_adm_kN} kN`;
    }

    // 7. STRATIGRAPHY TABLE
    if (res.layers) {
        updateTableCalculatedValues(res.layers, geo.depth_pile_m);
    }

    // 8. DUAL CAPACITY CHARTS
    updateCharts(res);
}

function exportSpringsToPileCap() {
    if (!latestCalculatedSprings || !latestCalculatedSprings.for_piled_raft) {
        alert("Calcule os resultados antes de exportar as molas.");
        return;
    }
    const raft = latestCalculatedSprings.for_piled_raft;
    const beam = latestCalculatedSprings.for_piled_beam;
    const data = {
        pile_diameter_m: raft.pile_diameter_m,
        pile_length_m: raft.pile_length_m,
        pile_capacity_adm_kN: raft.pile_capacity_adm_kN,
        pile_capacity_adm_tf: raft.pile_capacity_adm_tf,
        pile_spring_kz_kN_m: raft.pile_spring_kz_kN_m,
        pile_spring_kx_kN_m: beam ? beam.pile_spring_kx_fixed_kN_m : 25000.0,
        exported_at: Date.now()
    };
    localStorage.setItem('aoki_springs_pile_cap', JSON.stringify(data));
    localStorage.setItem('aoki_springs_pile_cap_pending', 'true');
    saveAokiSession();

    if (confirm(`✅ Molas e Capacidade Geotécnica exportadas com sucesso!\n\n• Diâmetro = ${(data.pile_diameter_m * 100).toFixed(0)} cm\n• Comprimento = ${data.pile_length_m} m\n• Capacidade Adm. (Radm) = ${data.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN (${data.pile_capacity_adm_tf.toFixed(1)} tf)\n• Rigidez Vertical (Kz) = ${data.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m\n\nDeseja abrir o módulo de Fundações Profundas Estruturais (Bloco de Coroamento) agora?`)) {
        window.location.href = 'deep_foundations.html?tab=pilecap';
    }
}

function exportSpringsToPiledRaft() {
    if (!latestCalculatedSprings || !latestCalculatedSprings.for_piled_raft) {
        alert("Calcule os resultados antes de exportar as molas.");
        return;
    }
    const data = latestCalculatedSprings.for_piled_raft;
    data.exported_at = Date.now();
    localStorage.setItem('aoki_springs_piled_raft', JSON.stringify(data));
    localStorage.setItem('aoki_springs_piled_raft_pending', 'true');
    saveAokiSession();
    
    if (confirm(`✅ Molas calculadas com sucesso!\n\n• Mola Vertical (Kz) = ${data.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m (${data.pile_spring_kz_tf_m.toLocaleString('pt-BR')} tf/m)\n• Capacidade Adm. (Radm) = ${data.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN (${data.pile_capacity_adm_tf.toFixed(1)} tf)\n• Atrito Negativo (Qneg) = ${data.q_negative_friction_kN} kN\n• Reação do Radier (ks) = ${data.subgrade_ks_kN_m3} kN/m³\n\nDeseja abrir o Radier Estaqueado agora com esses parâmetros pré-carregados?`)) {
        window.location.href = 'piled_raft.html';
    }
}

function exportSpringsToPiledBeam() {
    if (!latestCalculatedSprings || !latestCalculatedSprings.for_piled_beam) {
        alert("Calcule os resultados antes de exportar as molas.");
        return;
    }
    const data = latestCalculatedSprings.for_piled_beam;
    data.exported_at = Date.now();
    localStorage.setItem('aoki_springs_piled_beam', JSON.stringify(data));
    localStorage.setItem('aoki_springs_piled_beam_pending', 'true');
    saveAokiSession();
    
    if (confirm(`✅ Molas calculadas com sucesso!\n\n• Mola Vertical (Kz) = ${data.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m (${data.pile_spring_kz_tf_m.toLocaleString('pt-BR')} tf/m)\n• Mola Horizontal (Kx Engastada) = ${data.pile_spring_kx_fixed_kN_m.toLocaleString('pt-BR')} kN/m\n• Mola Horizontal (Kx Rotulada) = ${data.pile_spring_kx_pinned_kN_m.toLocaleString('pt-BR')} kN/m\n• Capacidade Compressão (Radm) = ${data.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN\n• Capacidade Tração (Tadm) = ${data.pile_tension_adm_kN} kN\n\nDeseja abrir a Viga de Coroamento agora com esses parâmetros pré-carregados?`)) {
        window.location.href = 'piled_beam.html';
    }
}

function payload_num_piles() {
    return parseInt(parseNum('num_piles', 15));
}

function renderLayersTable() {
    const tbody = document.getElementById('layers-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    currentProfile.forEach((lay, idx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        tr.id = `layer-row-${idx}`;

        // Build Soil Select
        let optionsHtml = '';
        SOIL_TYPES_LIST.forEach(st => {
            const sel = (lay.soil_type.toUpperCase() === st.toUpperCase()) ? 'selected' : '';
            optionsHtml += `<option value="${st}" ${sel}>${st}</option>`;
        });

        tr.innerHTML = `
            <td class="py-2 px-3 font-semibold text-gray-700 dark:text-gray-200">
                <input type="number" step="0.5" min="0.5" value="${lay.depth}" onchange="onLayerChange(${idx}, 'depth', this.value)" class="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs">
            </td>
            <td class="py-2 px-3">
                <select onchange="onLayerChange(${idx}, 'soil_type', this.value)" class="w-44 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs truncate">
                    ${optionsHtml}
                </select>
            </td>
            <td class="py-2 px-3">
                <input type="number" step="0.5" min="0.5" value="${lay.nspt}" onchange="onLayerChange(${idx}, 'nspt', this.value)" class="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
            </td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400 font-mono" id="calc-rl-${idx}">--</td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400 font-mono" id="calc-rp-${idx}">--</td>
            <td class="py-2 px-3 text-indigo-600 dark:text-indigo-400 font-mono" id="calc-decourt-c-${idx}">--</td>
            <td class="py-2 px-3 text-indigo-600 dark:text-indigo-400 font-mono" id="calc-decourt-ql-${idx}">--</td>
            <td class="py-2 px-3 text-emerald-600 dark:text-emerald-400 font-bold font-mono" id="calc-radm-aoki-${idx}">--</td>
            <td class="py-2 px-3 text-blue-600 dark:text-blue-400 font-bold font-mono" id="calc-radm-decourt-${idx}">--</td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400 font-mono" id="calc-kz-${idx}">--</td>
            <td class="py-2 px-3 text-center">
                <button type="button" onclick="deleteSoilLayer(${idx})" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors" title="Excluir Camada">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateTableCalculatedValues(layers, pileDepth) {
    layers.forEach((lay, idx) => {
        const elRl = document.getElementById(`calc-rl-${idx}`);
        const elRp = document.getElementById(`calc-rp-${idx}`);
        const elDecC = document.getElementById(`calc-decourt-c-${idx}`);
        const elDecQl = document.getElementById(`calc-decourt-ql-${idx}`);
        const elRadmAoki = document.getElementById(`calc-radm-aoki-${idx}`);
        const elRadmDec = document.getElementById(`calc-radm-decourt-${idx}`);
        const elKz = document.getElementById(`calc-kz-${idx}`);

        if (elRl) elRl.innerText = lay.rl_kg_m2 ? lay.rl_kg_m2.toFixed(0) : '--';
        if (elRp) elRp.innerText = lay.rp_kg_m2 ? lay.rp_kg_m2.toFixed(0) : '--';
        if (elDecC) elDecC.innerText = lay.decourt_c_kpa ? lay.decourt_c_kpa.toFixed(0) : '--';
        if (elDecQl) elDecQl.innerText = lay.decourt_ql_kpa ? lay.decourt_ql_kpa.toFixed(1) : '--';
        if (elRadmAoki) elRadmAoki.innerText = lay.radm_tf ? `${lay.radm_tf.toFixed(1)} tf` : '--';
        if (elRadmDec) elRadmDec.innerText = lay.decourt_radm_tf ? `${lay.decourt_radm_tf.toFixed(1)} tf` : '--';
        if (elKz) elKz.innerText = lay.Kz_static_tf_m ? lay.Kz_static_tf_m.toLocaleString() : '--';

        const row = document.getElementById(`layer-row-${idx}`);
        if (row) {
            if (lay.depth > pileDepth) {
                row.classList.add('opacity-40');
            } else {
                row.classList.remove('opacity-40');
            }
        }
    });
}

function onLayerChange(index, field, value) {
    if (field === 'depth' || field === 'nspt') {
        currentProfile[index][field] = parseFloat(value) || 0;
    } else {
        currentProfile[index][field] = value;
    }
    triggerCalculation();
}

function addSoilLayer() {
    const lastDepth = currentProfile.length > 0 ? currentProfile[currentProfile.length - 1].depth : 0;
    currentProfile.push({
        depth: lastDepth + 1.0,
        soil_type: "ARGILA SILTOARENOSA",
        nspt: 10.0
    });
    renderLayersTable();
    triggerCalculation();
}

function deleteSoilLayer(index) {
    if (currentProfile.length <= 1) {
        alert("O perfil deve conter pelo menos uma camada de solo.");
        return;
    }
    currentProfile.splice(index, 1);
    renderLayersTable();
    triggerCalculation();
}

function loadReferencePreset() {
    currentProfile = getBuiltinDefaultProfile();
    document.getElementById('geometry').value = 'Circular';
    document.getElementById('diameter').value = 1.0;
    document.getElementById('depth_pile').value = 16.0;
    document.getElementById('pile_type').value = 'PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO';
    document.getElementById('allowable_settlement_mm').value = 5.0;
    document.getElementById('soil_gamma').value = 1.8;
    document.getElementById('num_piles').value = 15;
    document.getElementById('structure_mass_ton').value = 1690.4;
    
    // Pile cap defaults
    const elCapN = document.getElementById('cap_num_piles');
    if (elCapN) elCapN.value = 2;
    const elCapLoad = document.getElementById('cap_load_Nk_kN');
    if (elCapLoad) elCapLoad.value = 1500.0;
    const elCapA = document.getElementById('cap_col_a_m');
    if (elCapA) elCapA.value = 0.40;
    const elCapB = document.getElementById('cap_col_b_m');
    if (elCapB) elCapB.value = 0.40;
    const elCapS = document.getElementById('cap_pile_spacing_m');
    if (elCapS) elCapS.value = 1.80;
    const elCapFck = document.getElementById('cap_fck_mpa');
    if (elCapFck) elCapFck.value = 30.0;
    const elCapFyk = document.getElementById('cap_fyk_mpa');
    if (elCapFyk) elCapFyk.value = 500.0;
    const elCapCover = document.getElementById('cap_cover_cm');
    if (elCapCover) elCapCover.value = 5.0;
    const elCapEmb = document.getElementById('cap_embedment_cm');
    if (elCapEmb) elCapEmb.value = 5.0;

    toggleGeometryInputs();
    updatePileFactors();
    renderLayersTable();
    triggerCalculation();
}

function updateCharts(res) {
    if (!res || !res.layers) return;
    latestResult = res;
    const layers = res.layers;

    const depths = layers.map(l => l.depth);
    const nspts = layers.map(l => l.nspt);
    const aokiRadm = layers.map(l => l.radm_tf || 0);
    const aokiRl = layers.map(l => l.accum_rl_tf || 0);
    const decourtRadm = layers.map(l => l.decourt_radm_tf || 0);
    const decourtRl = layers.map(l => l.decourt_accum_rl_tf || 0);

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    // ── Chart 1: N_SPT Profile ────────────────────────────────────────────────
    const ctx1 = document.getElementById('chartNspt')?.getContext('2d');
    if (ctx1) {
        if (chartNsptInstance) chartNsptInstance.destroy();
        chartNsptInstance = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: depths,
                datasets: [{
                    label: 'N_SPT (golpes)',
                    data: nspts,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.15)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.2,
                    pointRadius: 4,
                    pointBackgroundColor: '#2563eb'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { size: 11 } } },
                    tooltip: { callbacks: { label: ctx => `N_SPT: ${ctx.parsed.y} golpes (Prof: ${ctx.label} m)` } }
                },
                scales: {
                    x: { title: { display: true, text: 'Profundidade (m)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { title: { display: true, text: 'N_SPT (golpes)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
                }
            }
        });
    }

    // ── Chart 2: Cumulative Resistance Curves ─────────────────────────────────
    const ctx2 = document.getElementById('chartCapacity')?.getContext('2d');
    if (ctx2) {
        if (chartCapacityInstance) chartCapacityInstance.destroy();
        chartCapacityInstance = new Chart(ctx2, {
            type: 'line',
            data: {
                labels: depths,
                datasets: [
                    { label: 'Aoki-Velloso R_adm (tf)', data: aokiRadm, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.12)', borderWidth: 2.5, tension: 0.2, pointRadius: 3.5, pointBackgroundColor: '#059669' },
                    { label: 'Décourt-Quaresma R_adm (tf)', data: decourtRadm, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.12)', borderWidth: 2.5, tension: 0.2, pointRadius: 3.5, pointBackgroundColor: '#2563eb' },
                    { label: 'Atrito Aoki R_l (tf)', data: aokiRl, borderColor: '#f59e0b', borderWidth: 1.8, borderDash: [5, 4], tension: 0.2, pointRadius: 2 },
                    { label: 'Atrito Décourt R_l (tf)', data: decourtRl, borderColor: '#06b6d4', borderWidth: 1.8, borderDash: [3, 3], tension: 0.2, pointRadius: 2 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { size: 10 } } },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} tf` } }
                },
                scales: {
                    x: { title: { display: true, text: 'Profundidade da Ponta (m)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor } },
                    y: { title: { display: true, text: 'Capacidade Admissível (tf)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
                }
            }
        });
    }

    // ── Chart 3: Molas Dinâmicas e Estáticas por Metro ────────────────────────
    const ctx3 = document.getElementById('chartSprings')?.getContext('2d');
    if (ctx3 && res.springs_per_meter && res.springs_per_meter.length > 0) {
        if (chartSpringsInstance) chartSpringsInstance.destroy();
        const spm = res.springs_per_meter;
        chartSpringsInstance = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: spm.map(s => s.depth),
                datasets: [
                    { label: 'Kz dinâmico/m (kN/m/m)', data: spm.map(s => s.Kz_dyn_kN_m_per_m), borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.13)', borderWidth: 2.5, tension: 0.2, pointRadius: 4, pointBackgroundColor: '#7c3aed', fill: false },
                    { label: 'Kh dinâmico/m (kN/m/m)', data: spm.map(s => s.Kh_dyn_kN_m_per_m), borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.10)', borderWidth: 2.5, tension: 0.2, pointRadius: 4, pointBackgroundColor: '#d97706', fill: false },
                    { label: 'Kz estático/m (kN/m/m)', data: spm.map(s => s.Kz_static_kN_m_per_m), borderColor: '#10b981', borderWidth: 1.8, borderDash: [5, 4], tension: 0.2, pointRadius: 3, fill: false }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { size: 10 } } },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString('pt-BR', {maximumFractionDigits: 0})} kN/m/m`, title: ctx => `Prof: ${ctx[0].label} m` } }
                },
                scales: {
                    y: { title: { display: true, text: 'Profundidade (m)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor }, reverse: true },
                    x: { title: { display: true, text: 'Rigidez por metro (kN/m/m)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
                }
            }
        });
    }

    // ── Chart 4: Empuxo Ativo e Passivo (Rankine + Coulomb) ───────────────────
    const ctx4 = document.getElementById('chartEarthPressure')?.getContext('2d');
    if (ctx4 && res.earth_pressure && res.earth_pressure.stress_diagram) {
        if (chartEarthPressureInstance) chartEarthPressureInstance.destroy();
        updateEarthPressureKPIs(res.earth_pressure);
        const diag = res.earth_pressure.stress_diagram;
        chartEarthPressureInstance = new Chart(ctx4, {
            type: 'line',
            data: {
                labels: diag.map(d => d.z),
                datasets: [
                    { label: 'σa Rankine (kPa)', data: diag.map(d => d.sigma_a_rankine), borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 2.5, tension: 0.1, pointRadius: 2, fill: 'origin' },
                    { label: 'σp Rankine (kPa)', data: diag.map(d => d.sigma_p_rankine), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', borderWidth: 2.5, tension: 0.1, pointRadius: 2, fill: 'origin' },
                    { label: 'σa Coulomb (kPa)', data: diag.map(d => d.sigma_a_coulomb), borderColor: '#f97316', borderWidth: 1.8, borderDash: [5, 4], tension: 0.1, pointRadius: 2 },
                    { label: 'σp Coulomb (kPa)', data: diag.map(d => d.sigma_p_coulomb), borderColor: '#06b6d4', borderWidth: 1.8, borderDash: [5, 4], tension: 0.1, pointRadius: 2 }
                ]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: textColor, font: { size: 10 } } },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.x.toFixed(1)} kPa`, title: ctx => `Prof: ${ctx[0].label} m` } }
                },
                scales: {
                    y: { title: { display: true, text: 'Profundidade (m)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor }, reverse: true },
                    x: { title: { display: true, text: 'Pressão (kPa)', color: textColor, font: { size: 11 } }, ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
                }
            }
        });
    }
}

/**
 * Exporta um gráfico Chart.js como PNG de alta resolução (3× DPI).
 * transparent=true → fundo transparente (ideal para Word/PowerPoint)
 * transparent=false → fundo branco
 */
function downloadChartPNG(chartInstance, filename, transparent = true) {
    if (!chartInstance) { alert('Gráfico não disponível.'); return; }
    const origCanvas = chartInstance.canvas;
    const scale = 3; // 3× = ~300 DPI equivalente
    const w = origCanvas.width * scale;
    const h = origCanvas.height * scale;

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');

    if (!transparent) {
        octx.fillStyle = document.documentElement.classList.contains('dark') ? '#1e293b' : '#ffffff';
        octx.fillRect(0, 0, w, h);
    }
    // Escala o canvas original para o offscreen em 3×
    octx.drawImage(origCanvas, 0, 0, w, h);

    const url = offscreen.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'grafico_aoki.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

/**
 * Copia um gráfico Chart.js para a área de transferência como PNG (fundo transparente).
 */
async function copyChartToClipboard(chartInstance) {
    if (!chartInstance) { alert('Gráfico não disponível.'); return; }
    const origCanvas = chartInstance.canvas;
    const scale = 3;
    const w = origCanvas.width * scale;
    const h = origCanvas.height * scale;

    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const octx = offscreen.getContext('2d');
    octx.drawImage(origCanvas, 0, 0, w, h);

    try {
        offscreen.toBlob(async (blob) => {
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
            const btn = event?.target;
            if (btn) { const orig = btn.textContent; btn.textContent = '✅ Copiado!'; setTimeout(() => btn.textContent = orig, 1800); }
        }, 'image/png');
    } catch (e) {
        alert('Não foi possível copiar para a área de transferência: ' + e.message);
    }
}

/** Atualiza os KPIs de empuxo na interface */
function updateEarthPressureKPIs(ep) {
    if (!ep) return;
    const ids = {
        'ep-phi':        ep.phi_deg?.toFixed(1) + '°' + (ep.inferred ? ' (estimado)' : ''),
        'ep-gamma':      ep.gamma_kN_m3?.toFixed(1) + ' kN/m³',
        'ep-c':          ep.c_kPa?.toFixed(1) + ' kPa',
        'ep-H':          ep.H_m?.toFixed(1) + ' m',
        'ep-ka-rank':    ep.Ka_rankine?.toFixed(4),
        'ep-kp-rank':    ep.Kp_rankine?.toFixed(4),
        'ep-ka-coul':    ep.Ka_coulomb?.toFixed(4),
        'ep-kp-coul':    ep.Kp_coulomb?.toFixed(4),
        'ep-ea-rank':    ep.Ea_rankine_kN_m?.toFixed(1) + ' kN/m',
        'ep-ep-rank':    ep.Ep_rankine_kN_m?.toFixed(1) + ' kN/m',
        'ep-ea-coul':    ep.Ea_coulomb_kN_m?.toFixed(1) + ' kN/m',
        'ep-ep-coul':    ep.Ep_coulomb_kN_m?.toFixed(1) + ' kN/m',
        'ep-ya':         (ep.ya_rankine_m?.toFixed(2) || '--') + ' m da base',
    };
    Object.entries(ids).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    });
}

function round2(v) {
    return Math.round(v * 100) / 100;
}

function saveProjectJSON() {
    const payload = getPayload();
    const data = {
        app: "DeepFoundationsSuite",
        version: "2.0",
        methods: ["Aoki-Velloso (1975)", "Décourt-Quaresma (1978/1996)", "Blévot & Frémy (1967)"],
        timestamp: new Date().toISOString(),
        inputs: payload
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fundacoes_profundas_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadProjectJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.inputs) {
                const inp = data.inputs;
                if (inp.geometry) document.getElementById('geometry').value = inp.geometry;
                if (inp.diameter != null) document.getElementById('diameter').value = inp.diameter;
                if (inp.width_b != null) document.getElementById('width_b').value = inp.width_b;
                if (inp.height_h != null) document.getElementById('height_h').value = inp.height_h;
                if (inp.depth_pile != null) document.getElementById('depth_pile').value = inp.depth_pile;
                if (inp.pile_type) document.getElementById('pile_type').value = inp.pile_type;
                if (inp.allowable_settlement_mm != null) document.getElementById('allowable_settlement_mm').value = inp.allowable_settlement_mm;
                if (inp.soil_gamma != null) document.getElementById('soil_gamma').value = inp.soil_gamma;
                if (inp.num_piles != null) document.getElementById('num_piles').value = inp.num_piles;
                if (inp.structure_mass_ton != null) document.getElementById('structure_mass_ton').value = inp.structure_mass_ton;
                
                if (inp.cap_num_piles != null) document.getElementById('cap_num_piles').value = inp.cap_num_piles;
                if (inp.cap_load_Nk_kN != null) document.getElementById('cap_load_Nk_kN').value = inp.cap_load_Nk_kN;
                if (inp.cap_col_a_m != null) document.getElementById('cap_col_a_m').value = inp.cap_col_a_m;
                if (inp.cap_col_b_m != null) document.getElementById('cap_col_b_m').value = inp.cap_col_b_m;
                if (inp.cap_pile_spacing_m != null) document.getElementById('cap_pile_spacing_m').value = inp.cap_pile_spacing_m;
                if (inp.cap_fck_mpa != null) document.getElementById('cap_fck_mpa').value = inp.cap_fck_mpa;
                if (inp.cap_fyk_mpa != null) document.getElementById('cap_fyk_mpa').value = inp.cap_fyk_mpa;
                if (inp.cap_cover_cm != null) document.getElementById('cap_cover_cm').value = inp.cap_cover_cm;
                if (inp.cap_embedment_cm != null) document.getElementById('cap_embedment_cm').value = inp.cap_embedment_cm;

                if (inp.profile) currentProfile = inp.profile;

                toggleGeometryInputs();
                updatePileFactors();
                renderLayersTable();
                triggerCalculation();
            }
        } catch (err) {
            alert("Erro ao ler arquivo JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

function exportTableCSV() {
    let csv = "Profundidade (m);Tipo de Solo;N_SPT\n";
    currentProfile.forEach(l => {
        csv += `${l.depth};${l.soil_type};${l.nspt}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estratigrafia_fundacoes_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
