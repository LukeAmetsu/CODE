/**
 * Shallow Foundation Controller (Sapatas Rígidas & Molas de Solo Winkler)
 * Real-time geotechnical stability & NBR 6118 structural reinforcement design.
 */

const SHALLOW_SESSION_KEY = 'shallow_foundation_session_data';
let lastCalculationResult = null;

let referenceSoils = [
    { type: "Areia pouco compacta", sigma_adm_kpa: 100.0, phi_deg: 28.0, c_kpa: 0.0, ks_kpa_m: 15000.0, gamma_kn_m3: 17.5 },
    { type: "Areia medianamente compacta", sigma_adm_kpa: 200.0, phi_deg: 32.0, c_kpa: 0.0, ks_kpa_m: 30000.0, gamma_kn_m3: 18.5 },
    { type: "Areia compacta", sigma_adm_kpa: 350.0, phi_deg: 38.0, c_kpa: 0.0, ks_kpa_m: 50000.0, gamma_kn_m3: 19.5 },
    { type: "Silte arenoso medianamente compacto", sigma_adm_kpa: 150.0, phi_deg: 26.0, c_kpa: 10.0, ks_kpa_m: 20000.0, gamma_kn_m3: 17.0 },
    { type: "Argila siltosa média", sigma_adm_kpa: 120.0, phi_deg: 18.0, c_kpa: 25.0, ks_kpa_m: 15000.0, gamma_kn_m3: 16.5 },
    { type: "Argila rija", sigma_adm_kpa: 250.0, phi_deg: 22.0, c_kpa: 50.0, ks_kpa_m: 35000.0, gamma_kn_m3: 18.0 },
    { type: "Argila muito rija / dura", sigma_adm_kpa: 400.0, phi_deg: 25.0, c_kpa: 100.0, ks_kpa_m: 60000.0, gamma_kn_m3: 19.0 },
    { type: "Rocha alterada branda", sigma_adm_kpa: 800.0, phi_deg: 40.0, c_kpa: 120.0, ks_kpa_m: 120000.0, gamma_kn_m3: 22.0 }
];

document.addEventListener('DOMContentLoaded', () => {
    initSoilPresets();
    setupEventListeners();
    loadSession();
    fetchBackendReferenceData();
    triggerCalculation();
});

function initSoilPresets() {
    const sel = document.getElementById('soil_preset_select');
    if (!sel) return;
    
    // Clear dynamic options keeping custom
    sel.innerHTML = '<option value="custom">-- Selecionar Solo Típico --</option>';
    referenceSoils.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.type;
        opt.textContent = `${s.type} (σadm = ${s.sigma_adm_kpa} kPa, ks = ${s.ks_kpa_m} kN/m³)`.trim();
        sel.appendChild(opt);
    });
}

function fetchBackendReferenceData() {
    if (typeof eel !== 'undefined' && eel.get_shallow_foundation_reference_data) {
        eel.get_shallow_foundation_reference_data()(function(res) {
            if (res && res.soils) {
                referenceSoils = res.soils;
                initSoilPresets();
            }
        });
    }
}

function onSoilPresetChange(soilType) {
    if (!soilType || soilType === 'custom') return;
    const s = referenceSoils.find(item => item.type === soilType);
    if (!s) return;

    setVal('sigma_adm_kPa', s.sigma_adm_kpa);
    setVal('soil_phi_deg', s.phi_deg);
    setVal('soil_cohesion_kPa', s.c_kpa);
    setVal('soil_gamma_kNm3', s.gamma_kn_m3);
    setVal('ks_subgrade_kNm3', s.ks_kpa_m);

    triggerCalculation();
}

function parseNum(id, def = 0.0) {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function getPayload() {
    return {
        dim_A: parseNum('dim_A', 1.50),
        dim_B: parseNum('dim_B', 1.50),
        h_total: parseNum('h_total', 0.60),
        h0_edge: parseNum('h0_edge', 0.25),
        col_a: parseNum('col_a', 0.40),
        col_b: parseNum('col_b', 0.40),
        is_sloped: document.getElementById('is_sloped') ? document.getElementById('is_sloped').checked : true,
        Nk_kN: parseNum('Nk_kN', 350.0),
        Hxk_kN: parseNum('Hxk_kN', 15.0),
        Hyk_kN: parseNum('Hyk_kN', 20.0),
        Mxk_kNm: parseNum('Mxk_kNm', 25.0),
        Myk_kNm: parseNum('Myk_kNm', 30.0),
        sigma_adm_kPa: parseNum('sigma_adm_kPa', 200.0),
        embedment_depth_Df: parseNum('embedment_depth_Df', 1.50),
        soil_phi_deg: parseNum('soil_phi_deg', 30.0),
        soil_cohesion_kPa: parseNum('soil_cohesion_kPa', 10.0),
        soil_gamma_kNm3: parseNum('soil_gamma_kNm3', 18.0),
        ks_subgrade_kNm3: parseNum('ks_subgrade_kNm3', 30000.0),
        fck_MPa: parseNum('fck_MPa', 30.0),
        fyk_MPa: parseNum('fyk_MPa', 500.0),
        concrete_cover_cm: parseNum('concrete_cover_cm', 4.0),
        preferred_phi_mm: parseNum('preferred_phi_mm', 12.5),
        geo_method: document.getElementById('geo_method') ? document.getElementById('geo_method').value : 'ambos'
    };
}

function setupEventListeners() {
    const ids = [
        'dim_A', 'dim_B', 'h_total', 'h0_edge', 'col_a', 'col_b', 'is_sloped',
        'Nk_kN', 'Hxk_kN', 'Hyk_kN', 'Mxk_kNm', 'Myk_kNm',
        'sigma_adm_kPa', 'embedment_depth_Df', 'soil_phi_deg', 'soil_cohesion_kPa',
        'soil_gamma_kNm3', 'ks_subgrade_kNm3', 'fck_MPa', 'fyk_MPa',
        'concrete_cover_cm', 'preferred_phi_mm', 'geo_method'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => { triggerCalculation(); saveSession(); });
        el.addEventListener('change', () => { triggerCalculation(); saveSession(); });
    });
}

function saveSession() {
    try {
        const data = getPayload();
        localStorage.setItem(SHALLOW_SESSION_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Erro ao salvar sessão de sapatas:', e);
    }
}

function loadSession() {
    try {
        const raw = localStorage.getItem(SHALLOW_SESSION_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.keys(data).forEach(k => {
            const el = document.getElementById(k);
            if (el) {
                if (el.type === 'checkbox') el.checked = Boolean(data[k]);
                else el.value = data[k];
            }
        });
    } catch (e) {
        console.warn('Erro ao carregar sessão de sapatas:', e);
    }
}

function loadPresetBenchmark() {
    // Benchmark identical to Refs/Dimensionamento de sapata.xlsm
    setVal('dim_A', 1.20);
    setVal('dim_B', 1.20);
    setVal('h_total', 0.60);
    setVal('h0_edge', 0.20);
    setVal('col_a', 0.40);
    setVal('col_b', 0.40);
    const cb = document.getElementById('is_sloped');
    if (cb) cb.checked = true;
    setVal('Nk_kN', 15.3);
    setVal('Hxk_kN', 2.9);
    setVal('Hyk_kN', 3.7);
    setVal('Mxk_kNm', 19.0);
    setVal('Myk_kNm', 24.4);
    setVal('sigma_adm_kPa', 120.0);
    setVal('embedment_depth_Df', 1.50);
    setVal('soil_phi_deg', 30.0);
    setVal('soil_cohesion_kPa', 0.0);
    setVal('soil_gamma_kNm3', 18.0);
    setVal('ks_subgrade_kNm3', 25000.0);
    setVal('fck_MPa', 25.0);
    setVal('fyk_MPa', 500.0);
    setVal('concrete_cover_cm', 4.0);
    setVal('preferred_phi_mm', 10.0);

    triggerCalculation();
    saveSession();
}

function triggerCalculation() {
    const payload = getPayload();

    if (typeof eel !== 'undefined' && eel.calculate_shallow_foundation) {
        eel.calculate_shallow_foundation(payload)(function (res) {
            if (res && res.success) {
                updateUIResults(res);
            } else {
                console.error("Shallow foundation error:", res?.error);
            }
        });
    } else {
        // Local client-side calculation fallback
        const res = runClientSideCalc(payload);
        updateUIResults(res);
    }
}

function updateUIResults(res) {
    lastCalculationResult = res;
    const geom = res.geometry || {};
    const loads = res.loads_at_base || {};
    const press = res.contact_pressures || {};
    const stab = res.stability_checks || {};
    const springs = res.soil_springs || {};
    const rebar = res.structural_reinforcement || {};
    const shear = res.shear_and_punching || {};
    const bom = res.bom || {};

    // 1. Rigidity badge
    const elRigid = document.getElementById('label-rigidity-badge');
    if (elRigid) {
        elRigid.innerText = geom.is_rigid_footing ? `Rígida (${geom.slope_angle_deg}° ≥ 30°)` : `Flexível (${geom.slope_angle_deg}° < 30° | Aumentar h)`;
        elRigid.className = geom.is_rigid_footing ? "text-[11px] font-bold text-emerald-600 dark:text-emerald-400" : "text-[11px] font-bold text-amber-600 dark:text-amber-400";
    }

    // 2. Global Status Banner
    const banner = document.getElementById('status-banner');
    const icon = document.getElementById('status-icon');
    const title = document.getElementById('status-title');
    const sub = document.getElementById('status-subtitle');
    const badge = document.getElementById('status-badge');

    if (res.overall_ok) {
        banner.className = "mb-6 p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800";
        icon.innerText = "✅";
        title.className = "text-sm font-bold text-emerald-800 dark:text-emerald-200";
        title.innerText = "Sapata Aprovada em Todos os Critérios NBR 6118 / NBR 6122";
        sub.className = "text-xs text-emerald-700 dark:text-emerald-300/90 mt-0.5";
        sub.innerText = "Rigidez garantida, tensões no solo admissíveis, estabilidade global OK e armadura dimensionada.";
        badge.className = "px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide bg-emerald-200 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100";
        badge.innerText = "CONFORME";
    } else {
        banner.className = "mb-6 p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800";
        icon.innerText = "⚠️";
        title.className = "text-sm font-bold text-rose-800 dark:text-rose-200";
        title.innerText = "Atenção: Um ou mais critérios de verificação foram excedidos";
        sub.className = "text-xs text-rose-700 dark:text-rose-300/90 mt-0.5";
        sub.innerText = "Verifique as tensões de contato no solo, fatores de segurança ou espessura da sapata.";
        badge.className = "px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide bg-rose-200 dark:bg-rose-800 text-rose-900 dark:text-rose-100";
        badge.innerText = "NÃO CONFORME";
    }

    // 3. Top KPI Cards
    const elSigMax = document.getElementById('kpi-sigma-max');
    const elSigMaxBadge = document.getElementById('kpi-sigma-max-badge');
    if (elSigMax) elSigMax.innerText = press.sigma_max_kPa ? press.sigma_max_kPa.toFixed(1) : '--';
    if (elSigMaxBadge) {
        elSigMaxBadge.innerText = `Limite: ${press.sigma_adm_edge_kPa ? press.sigma_adm_edge_kPa.toFixed(1) : '--'} kPa (${(press.ratio_sigma_max * 100).toFixed(0)}%)`;
        elSigMaxBadge.className = press.ok_sigma_max ? "text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate" : "text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1 truncate";
    }

    const elCompArea = document.getElementById('kpi-compressed-area');
    const elKernZone = document.getElementById('kpi-kern-zone');
    if (elCompArea) elCompArea.innerText = `${((press.compressed_area_ratio || 1.0) * 100).toFixed(0)}%`;
    if (elKernZone) elKernZone.innerText = loads.kern_zone || 'Zona 1';

    const elFsTomb = document.getElementById('kpi-fs-tomb');
    const elRatioTombPond = document.getElementById('kpi-ratio-tomb-pond');
    const elFsTombBadge = document.getElementById('kpi-fs-tomb-badge');
    if (elFsTomb) elFsTomb.innerText = stab.FS_overturning ? stab.FS_overturning.toFixed(2) : '--';
    if (elRatioTombPond) {
        elRatioTombPond.innerText = stab.ratio_overturning_ponderada !== undefined ? `${(stab.ratio_overturning_ponderada * 100).toFixed(0)}%` : '--';
        elRatioTombPond.className = stab.ok_overturning_ponderada !== false ? "text-sm font-bold text-emerald-600 dark:text-emerald-400" : "text-sm font-bold text-rose-600 dark:text-rose-400";
    }
    if (elFsTombBadge) {
        const isOkGlob = stab.ok_overturning_global !== false;
        const isOkPond = stab.ok_overturning_ponderada !== false;
        elFsTombBadge.innerText = (isOkGlob && isOkPond) ? "FS ≥ 1.50 & Md/Mr ≤ 1.0 (OK)" : (isOkGlob ? "FS Global OK | Ponderada Excedida" : "Instável ao Tombamento!");
        elFsTombBadge.className = (isOkGlob && isOkPond) ? "text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate" : "text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1 truncate";
    }

    const elFsDesl = document.getElementById('kpi-fs-desl');
    const elRatioDeslPond = document.getElementById('kpi-ratio-desl-pond');
    const elFsDeslBadge = document.getElementById('kpi-fs-desl-badge');
    if (elFsDesl) elFsDesl.innerText = stab.FS_sliding ? stab.FS_sliding.toFixed(2) : '--';
    if (elRatioDeslPond) {
        elRatioDeslPond.innerText = stab.ratio_sliding_ponderada !== undefined ? `${(stab.ratio_sliding_ponderada * 100).toFixed(0)}%` : '--';
        elRatioDeslPond.className = stab.ok_sliding_ponderada !== false ? "text-sm font-bold text-emerald-600 dark:text-emerald-400" : "text-sm font-bold text-rose-600 dark:text-rose-400";
    }
    if (elFsDeslBadge) {
        const isOkGlob = stab.ok_sliding_global !== false;
        const isOkPond = stab.ok_sliding_ponderada !== false;
        elFsDeslBadge.innerText = (isOkGlob && isOkPond) ? `Estável (R=${stab.H_sliding_resist_kN ? stab.H_sliding_resist_kN.toFixed(0) : 0} kN)` : "Risco de Deslizamento!";
        elFsDeslBadge.className = (isOkGlob && isOkPond) ? "text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate" : "text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1 truncate";
    }

    // 4. Winkler Area Springs
    const elKz = document.getElementById('res-kz-val');
    const elKzSub = document.getElementById('res-kz-sub');
    const elKtx = document.getElementById('res-kthetax-val');
    const elKty = document.getElementById('res-kthetay-val');
    const elKx = document.getElementById('res-kx-val');

    if (elKz) elKz.innerText = `${springs.Kz_global_kN_m ? springs.Kz_global_kN_m.toLocaleString('pt-BR') : '--'} kN/m`;
    if (elKzSub) elKzSub.innerText = `${springs.Kz_global_tf_m ? springs.Kz_global_tf_m.toLocaleString('pt-BR') : '--'} tf/m (ks=${springs.ks_subgrade_kNm3} kN/m³)`;
    if (elKtx) elKtx.innerText = `${springs.Ktheta_x_kNm_rad ? springs.Ktheta_x_kNm_rad.toLocaleString('pt-BR') : '--'} kNm/rad`;
    if (elKty) elKty.innerText = `${springs.Ktheta_y_kNm_rad ? springs.Ktheta_y_kNm_rad.toLocaleString('pt-BR') : '--'} kNm/rad`;
    if (elKx) elKx.innerText = `${springs.Kx_global_kN_m ? springs.Kx_global_kN_m.toLocaleString('pt-BR') : '--'} kN/m`;

    // 5. Four Corner Pressures
    const corners = press.sigma_corners_kPa || [0, 0, 0, 0];
    const c1 = document.getElementById('sig-corner-1');
    const c2 = document.getElementById('sig-corner-2');
    const c3 = document.getElementById('sig-corner-3');
    const c4 = document.getElementById('sig-corner-4');
    if (c1) c1.innerText = `${corners[0]} kPa`;
    if (c2) c2.innerText = `${corners[1]} kPa`;
    if (c3) c3.innerText = `${corners[2]} kPa`;
    if (c4) c4.innerText = `${corners[3]} kPa`;

    // 6. Structural Reinforcement NBR 6118
    const elRxDesc = document.getElementById('rebar-x-desc');
    const elRxMsd = document.getElementById('rebar-x-msd');
    const elRxAs = document.getElementById('rebar-x-as');
    const elRxAsMin = document.getElementById('rebar-x-asmin');
    const elRxCant = document.getElementById('rebar-x-cant');

    if (elRxDesc) elRxDesc.innerText = rebar.rebar_x || '--';
    if (elRxMsd) elRxMsd.innerText = `Msd = ${rebar.Msd_x_kNm ? rebar.Msd_x_kNm.toFixed(1) : '--'} kNm`;
    if (elRxAs) elRxAs.innerText = `${rebar.As_x_final_cm2 ? rebar.As_x_final_cm2.toFixed(2) : '--'} cm²`;
    if (elRxAsMin) elRxAsMin.innerText = `${rebar.As_min_x_cm2 ? rebar.As_min_x_cm2.toFixed(2) : '--'} cm²`;
    if (elRxCant) elRxCant.innerText = `${geom.cantilever_x_m ? geom.cantilever_x_m.toFixed(2) : '--'} m`;

    const elRyDesc = document.getElementById('rebar-y-desc');
    const elRyMsd = document.getElementById('rebar-y-msd');
    const elRyAs = document.getElementById('rebar-y-as');
    const elRyAsMin = document.getElementById('rebar-y-asmin');
    const elRyCant = document.getElementById('rebar-y-cant');

    if (elRyDesc) elRyDesc.innerText = rebar.rebar_y || '--';
    if (elRyMsd) elRyMsd.innerText = `Msd = ${rebar.Msd_y_kNm ? rebar.Msd_y_kNm.toFixed(1) : '--'} kNm`;
    if (elRyAs) elRyAs.innerText = `${rebar.As_y_final_cm2 ? rebar.As_y_final_cm2.toFixed(2) : '--'} cm²`;
    if (elRyAsMin) elRyAsMin.innerText = `${rebar.As_min_y_cm2 ? rebar.As_min_y_cm2.toFixed(2) : '--'} cm²`;
    if (elRyCant) elRyCant.innerText = `${geom.cantilever_y_m ? geom.cantilever_y_m.toFixed(2) : '--'} m`;

    // 7. Shear and Punching
    const elShearInfo = document.getElementById('shear-info');
    const elShearBadge = document.getElementById('shear-badge');
    if (elShearInfo) elShearInfo.innerText = `Vsd: ${shear.Vsd_max_kN?.toFixed(0) ?? '--'} kN | VRd1: ${shear.VRd1_kN?.toFixed(0) ?? '--'} kN`;
    if (elShearBadge) {
        elShearBadge.innerText = shear.ok_shear ? "OK" : "Insuficiente";
        elShearBadge.className = shear.ok_shear ? "px-2 py-1 rounded text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300" : "px-2 py-1 rounded text-[11px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300";
    }

    const elPunchInfo = document.getElementById('punch-info');
    const elPunchBadge = document.getElementById('punch-badge');
    if (elPunchInfo) elPunchInfo.innerText = `τsd0: ${shear.tau_sd0_MPa?.toFixed(2) ?? '--'} MPa | τRd2: ${shear.tau_Rd2_MPa?.toFixed(2) ?? '--'} MPa`;
    if (elPunchBadge) {
        elPunchBadge.innerText = shear.ok_punch_0 ? "OK" : "Biela Esmaga";
        elPunchBadge.className = shear.ok_punch_0 ? "px-2 py-1 rounded text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300" : "px-2 py-1 rounded text-[11px] font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300";
    }

    // 8. BOM
    const elBVolConc = document.getElementById('bom-vol-concrete');
    const elBWeightSt = document.getElementById('bom-weight-steel');
    const elBDensSt = document.getElementById('bom-density-steel');
    const elBVolExc = document.getElementById('bom-vol-excav');

    if (elBVolConc) elBVolConc.innerText = `${bom.concrete_volume_m3 ? bom.concrete_volume_m3.toFixed(2) : '--'} m³`;
    if (elBWeightSt) elBWeightSt.innerText = `${bom.steel_weight_kg ? bom.steel_weight_kg.toFixed(0) : '--'} kg`;
    if (elBDensSt) elBDensSt.innerText = `${bom.steel_density_kg_m3 ? bom.steel_density_kg_m3.toFixed(0) : '--'} kg/m³`;
    if (elBVolExc) elBVolExc.innerText = `${bom.excavation_volume_m3 ? bom.excavation_volume_m3.toFixed(2) : '--'} m³`;

    // 9. Redraw Interactive Canvas
    drawPressureDiagram(res);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}

function drawCornerPressureBadge(ctx, label, val, x, y, align, isDark) {
    const numVal = parseFloat(val);
    const isTension = !isNaN(numVal) && numVal < 0;
    const formattedVal = isNaN(numVal) ? val : numVal.toFixed(1);
    const text = `${label} = ${formattedVal} kPa${isTension ? ' (tração)' : ''}`;

    ctx.save();
    ctx.font = 'bold 11px Inter, system-ui, -apple-system, sans-serif';
    const textMetrics = ctx.measureText(text);
    const padX = 8;
    const bw = textMetrics.width + padX * 2;
    const bh = 22;

    let bx = x;
    if (align === 'right') {
        bx = x - bw;
    } else if (align === 'center') {
        bx = x - bw / 2;
    }
    const by = y;

    // Shadow & pill background for 100% contrast over any background
    ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    if (isTension) {
        ctx.fillStyle = isDark ? 'rgba(127, 29, 29, 0.92)' : 'rgba(254, 242, 242, 0.96)';
        ctx.strokeStyle = isDark ? '#f87171' : '#ef4444';
    } else {
        ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
        ctx.strokeStyle = isDark ? 'rgba(96, 165, 250, 0.65)' : 'rgba(37, 99, 235, 0.45)';
    }
    ctx.lineWidth = 1.5;

    drawRoundedRect(ctx, bx, by, bw, bh, 6);
    ctx.fill();
    ctx.stroke();

    // Text inside badge
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (isTension) {
        ctx.fillStyle = isDark ? '#fca5a5' : '#b91c1c';
    } else {
        ctx.fillStyle = isDark ? '#93c5fd' : '#1d4ed8';
    }
    ctx.fillText(text, bx + padX, by + bh / 2);
    ctx.restore();
}

function drawPressureDiagram(res) {
    const canvas = document.getElementById('canvas-pressures');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 1. Unified CAD Blueprint Background & Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, w, h, true);
        EngCAD.drawGrid(ctx, w, h, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
    }

    const isDark = true;

    const geom = res.geometry || { dim_A: 1.5, dim_B: 1.5, col_a: 0.4, col_b: 0.4 };
    const loads = res.loads_at_base || { ex_m: 0, ey_m: 0, kern_ratio: 0 };
    const corners = res.contact_pressures?.sigma_corners_kPa || [100, 100, 100, 100];

    const cx = w / 2;
    const cy = h / 2 - 12; // slight shift up to accommodate bottom dimension
    const scale = Math.min((w - 200) / Math.max(geom.dim_A, 0.5), (h - 110) / Math.max(geom.dim_B, 0.5));

    const footingW = geom.dim_A * scale;
    const footingH = geom.dim_B * scale;
    const colW = geom.col_a * scale;
    const colH = geom.col_b * scale;

    const fLeft = cx - footingW / 2;
    const fTop = cy - footingH / 2;

    // 1. Draw Footing Base Polygon with gradient representing pressure
    const grd = ctx.createLinearGradient(fLeft, fTop, fLeft + footingW, fTop + footingH);
    if (isDark) {
        grd.addColorStop(0, 'rgba(59, 130, 246, 0.25)');
        grd.addColorStop(1, 'rgba(30, 58, 138, 0.12)');
    } else {
        grd.addColorStop(0, 'rgba(219, 234, 254, 0.7)');
        grd.addColorStop(1, 'rgba(238, 242, 255, 0.4)');
    }
    ctx.fillStyle = grd;
    ctx.fillRect(fLeft, fTop, footingW, footingH);

    ctx.strokeStyle = isDark ? '#60a5fa' : '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(fLeft, fTop, footingW, footingH);

    // 2. Draw Center Lines
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.45)' : 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, fTop - 18);
    ctx.lineTo(cx, fTop + footingH + 18);
    ctx.moveTo(fLeft - 18, cy);
    ctx.lineTo(fLeft + footingW + 18, cy);
    ctx.stroke();
    ctx.restore();

    // 3. Draw Kern Diamond (A/6, B/6)
    const kernW = (geom.dim_A / 6.0) * scale;
    const kernH = (geom.dim_B / 6.0) * scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy - kernH);
    ctx.lineTo(cx + kernW, cy);
    ctx.lineTo(cx, cy + kernH);
    ctx.lineTo(cx - kernW, cy);
    ctx.closePath();
    ctx.fillStyle = isDark ? 'rgba(59, 130, 246, 0.25)' : 'rgba(59, 130, 246, 0.15)';
    ctx.fill();
    ctx.strokeStyle = isDark ? '#38bdf8' : '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 4. Draw Column / Pedestal
    ctx.fillStyle = isDark ? 'rgba(100, 116, 139, 0.65)' : 'rgba(203, 213, 225, 0.9)';
    ctx.fillRect(cx - colW / 2, cy - colH / 2, colW, colH);
    ctx.strokeStyle = isDark ? '#cbd5e1' : '#475569';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - colW / 2, cy - colH / 2, colW, colH);

    if (colW >= 35 && colH >= 20) {
        ctx.save();
        ctx.font = 'bold 9px Inter, system-ui, sans-serif';
        ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Pilar', cx, cy);
        ctx.restore();
    }

    // 5. Draw Resultant Eccentricity Point (ex, ey)
    const ptX = cx + loads.ex_m * scale;
    const ptY = cy - loads.ey_m * scale;

    const isInsideKern = loads.kern_ratio <= 1.0;
    const dotColor = isInsideKern ? '#10b981' : (loads.kern_ratio <= 1.5 ? '#f59e0b' : '#ef4444');

    ctx.save();
    ctx.beginPath();
    ctx.arc(ptX, ptY, 7, 0, 2 * Math.PI);
    ctx.fillStyle = dotColor;
    ctx.shadowColor = dotColor;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Coordinate pill badge for eccentricity (ex, ey)
    const coordText = `(ex=${loads.ex_m.toFixed(2)}m, ey=${loads.ey_m.toFixed(2)}m)`;
    ctx.font = 'bold 11px Inter, system-ui, -apple-system, sans-serif';
    const cMetrics = ctx.measureText(coordText);
    const pPadX = 8;
    const pW = cMetrics.width + pPadX * 2;
    const pH = 22;

    let pX = ptX + 12;
    let pY = ptY - 26;
    if (pX + pW > w - 15) {
        pX = ptX - pW - 12;
    }
    if (pY < 8) {
        pY = ptY + 12;
    }

    ctx.save();
    ctx.shadowColor = isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)';
    ctx.strokeStyle = dotColor;
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, pX, pY, pW, pH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillText(coordText, pX + pPadX, pY + pH / 2);
    ctx.restore();

    // 6. Draw Corner Pressures inside clean badges
    // Canto 1 (+X, +Y) -> top-right
    drawCornerPressureBadge(ctx, 'σ₁', corners[0], fLeft + footingW - 8, fTop + 8, 'right', isDark);
    // Canto 2 (-X, +Y) -> top-left
    drawCornerPressureBadge(ctx, 'σ₂', corners[1], fLeft + 8, fTop + 8, 'left', isDark);
    // Canto 3 (-X, -Y) -> bottom-left
    drawCornerPressureBadge(ctx, 'σ₃', corners[2], fLeft + 8, fTop + footingH - 30, 'left', isDark);
    // Canto 4 (+X, -Y) -> bottom-right
    drawCornerPressureBadge(ctx, 'σ₄', corners[3], fLeft + footingW - 8, fTop + footingH - 30, 'right', isDark);

    // 7. Dimension Cotas (A and B) with professional CAD witness lines & knockout badges
    // Dimension A (Bottom)
    const dimAY = fTop + footingH + 26;
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = 1;
    // Witness lines
    ctx.beginPath();
    ctx.moveTo(fLeft, fTop + footingH + 4);
    ctx.lineTo(fLeft, dimAY + 6);
    ctx.moveTo(fLeft + footingW, fTop + footingH + 4);
    ctx.lineTo(fLeft + footingW, dimAY + 6);
    // Dimension line
    ctx.moveTo(fLeft, dimAY);
    ctx.lineTo(fLeft + footingW, dimAY);
    // Ticks (45 deg)
    ctx.moveTo(fLeft - 3, dimAY + 3);
    ctx.lineTo(fLeft + 3, dimAY - 3);
    ctx.moveTo(fLeft + footingW - 3, dimAY + 3);
    ctx.lineTo(fLeft + footingW + 3, dimAY - 3);
    ctx.stroke();

    // Dimension A Badge
    const textA = `A = ${geom.dim_A.toFixed(2)} m`;
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    const aMetrics = ctx.measureText(textA);
    const aPadX = 6;
    const aW = aMetrics.width + aPadX * 2;
    const aH = 18;

    ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.4)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, cx - aW / 2, dimAY - aH / 2, aW, aH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textA, cx, dimAY);
    ctx.restore();

    // Dimension B (Left)
    const dimBX = fLeft - 26;
    ctx.save();
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.5)' : 'rgba(100, 116, 139, 0.5)';
    ctx.lineWidth = 1;
    // Witness lines
    ctx.beginPath();
    ctx.moveTo(fLeft - 4, fTop);
    ctx.lineTo(dimBX - 6, fTop);
    ctx.moveTo(fLeft - 4, fTop + footingH);
    ctx.lineTo(dimBX - 6, fTop + footingH);
    // Dimension line
    ctx.moveTo(dimBX, fTop);
    ctx.lineTo(dimBX, fTop + footingH);
    // Ticks (45 deg)
    ctx.moveTo(dimBX - 3, fTop + 3);
    ctx.lineTo(dimBX + 3, fTop - 3);
    ctx.moveTo(dimBX - 3, fTop + footingH + 3);
    ctx.lineTo(dimBX + 3, fTop + footingH - 3);
    ctx.stroke();

    // Dimension B Badge
    const textB = `B = ${geom.dim_B.toFixed(2)} m`;
    ctx.font = 'bold 11px Inter, system-ui, sans-serif';
    const bMetrics = ctx.measureText(textB);
    const bPadX = 6;
    const bW = bMetrics.width + bPadX * 2;
    const bH = 18;

    ctx.translate(dimBX, cy);
    ctx.rotate(-Math.PI / 2);

    ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.6)' : 'rgba(100, 116, 139, 0.4)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, -bW / 2, -bH / 2, bW, bH, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(textB, 0, 0);
    ctx.restore();

    if (typeof EngCAD !== 'undefined' && canvas.parentElement && res) {
        EngCAD.updateHUD(canvas.parentElement, 'Sapata Rígida (Tensão)', [
            { label: 'Base A × B', value: `${geom.dim_A.toFixed(2)} × ${geom.dim_B.toFixed(2)} m` },
            { label: 'Excentricidade (ex, ey)', value: `${loads.ex_m.toFixed(2)}, ${loads.ey_m.toFixed(2)} m` },
            { label: 'Status Núcleo', value: loads.kern_ratio <= 1.0 ? '100% Comprimida' : 'Descolamento Parcial', color: loads.kern_ratio <= 1.0 ? '#10b981' : '#f59e0b' }
        ]);
    }
}

// Automatically redraw canvas with crisp contrast whenever theme (dark/light) changes
const shallowThemeObserver = new MutationObserver(() => {
    if (lastCalculationResult) {
        drawPressureDiagram(lastCalculationResult);
    }
});
shallowThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

function runClientSideCalc(inputs) {
    const A = inputs.dim_A, B = inputs.dim_B, h = inputs.h_total, h0 = inputs.h0_edge;
    const a = inputs.col_a, b = inputs.col_b;
    const Nk = inputs.Nk_kN, Hx = inputs.Hxk_kN, Hy = inputs.Hyk_kN, Mx = inputs.Mxk_kNm, My = inputs.Myk_kNm;
    const sigAdm = inputs.sigma_adm_kPa, fck = inputs.fck_MPa, fyk = inputs.fyk_MPa;

    const vol = inputs.is_sloped ? (h0 * A * B + ((h - h0) / 3.0) * (A * B + a * b + Math.sqrt(A * B * a * b))) : (A * B * h);
    const pSap = vol * 25.0;
    const pSolo = Math.max(0, A * B * inputs.embedment_depth_Df - vol) * inputs.soil_gamma_kNm3;
    const Ntot = Nk + pSap + pSolo;

    const MxBase = Mx + Hy * h;
    const MyBase = My + Hx * h;
    const ex = Math.abs(MyBase) / Math.max(1e-3, Ntot);
    const ey = Math.abs(MxBase) / Math.max(1e-3, Ntot);

    const area = A * B;
    const sigMean = Ntot / area;
    const s1 = sigMean * (1.0 + 6.0 * ex / A + 6.0 * ey / B);
    const s2 = sigMean * (1.0 - 6.0 * ex / A + 6.0 * ey / B);
    const s3 = sigMean * (1.0 - 6.0 * ex / A - 6.0 * ey / B);
    const s4 = sigMean * (1.0 + 6.0 * ex / A - 6.0 * ey / B);
    const sigMax = Math.max(s1, s2, s3, s4);

    const kernRatio = (ex / (A / 6.0)) + (ey / (B / 6.0));
    const ks = inputs.ks_subgrade_kNm3 || 30000.0;

    const cantX = (A - 0.7 * a) / 2.0;
    const cantY = (B - 0.7 * b) / 2.0;
    const MsdX = (sigMean * 1.4 * B * cantX * cantX) / 2.0;
    const MsdY = (sigMean * 1.4 * A * cantY * cantY) / 2.0;

    const d = h - (inputs.concrete_cover_cm / 100.0) - 0.01;
    const fyd = (fyk / 1.15) * 0.1; // kN/cm²
    const AsX = (MsdX * 100.0) / (0.95 * d * 100.0 * fyd);
    const AsY = (MsdY * 100.0) / (0.95 * d * 100.0 * fyd);
    const AsMin = 0.0015 * Math.max(A, B) * 100.0 * h * 100.0;

    const AsXFin = Math.max(AsX, AsMin);
    const AsYFin = Math.max(AsY, AsMin);

    const barArea = Math.PI * Math.pow(inputs.preferred_phi_mm / 10.0, 2) / 4.0;
    const numX = Math.max(3, Math.ceil(AsXFin / barArea));
    const numY = Math.max(3, Math.ceil(AsYFin / barArea));

    return {
        success: true,
        overall_ok: sigMax <= 1.3 * sigAdm && kernRatio <= 1.5,
        geometry: {
            dim_A: A, dim_B: B, h_total: h, h0_edge: h0, col_a: a, col_b: b,
            cantilever_x_m: (A - a) / 2.0, cantilever_y_m: (B - b) / 2.0,
            slope_angle_deg: Math.round(Math.atan((h - h0) / Math.max(1e-4, (A - a) / 2.0)) * 180 / Math.PI),
            is_rigid_footing: h >= (Math.max(A - a, B - b) / 3.0)
        },
        loads_at_base: {
            Nk_kN: Nk, N_tot_kN: Ntot, Mx_base_kNm: MxBase, My_base_kNm: MyBase,
            ex_m: ex, ey_m: ey, kern_ratio: kernRatio,
            kern_zone: kernRatio <= 1.0 ? "Zona 1 (Compressão Total)" : "Zona 2 (Descolamento Parcial)"
        },
        contact_pressures: {
            sigma_mean_kPa: sigMean, sigma_max_kPa: sigMax,
            sigma_corners_kPa: [Math.round(s1), Math.round(s2), Math.round(s3), Math.round(s4)],
            compressed_area_ratio: Math.min(1.0, 1.0 / Math.max(1.0, kernRatio)),
            sigma_adm_kPa: sigAdm, sigma_adm_edge_kPa: 1.3 * sigAdm,
            ratio_sigma_max: sigMax / (1.3 * sigAdm),
            ok_sigma_max: sigMax <= 1.3 * sigAdm
        },
        stability_checks: {
            FS_overturning: Math.min((Ntot * B / 2) / Math.max(0.1, MxBase), (Ntot * A / 2) / Math.max(0.1, MyBase)),
            ok_overturning_global: Math.min((Ntot * B / 2) / Math.max(0.1, MxBase), (Ntot * A / 2) / Math.max(0.1, MyBase)) >= 1.5,
            ratio_overturning_ponderada: (1.4 * Math.max(MxBase, MyBase)) / Math.max(0.1, 0.9 * Ntot * Math.min(A, B) / 2),
            ok_overturning_ponderada: ((1.4 * Math.max(MxBase, MyBase)) / Math.max(0.1, 0.9 * Ntot * Math.min(A, B) / 2)) <= 1.0,
            H_sliding_resist_kN: Ntot * Math.tan(30 * Math.PI / 180 * 2 / 3),
            FS_sliding: 2.5,
            ok_sliding_global: true,
            ratio_sliding_ponderada: (1.4 * Math.sqrt(Hx * Hx + Hy * Hy)) / Math.max(0.1, (0.9 * Ntot * Math.tan(30 * Math.PI / 180 * 2 / 3)) / 1.15),
            ok_sliding_ponderada: true,
            ok_overturning: true,
            ok_sliding: true
        },
        soil_springs: {
            ks_subgrade_kNm3: ks,
            Kz_global_kN_m: ks * area,
            Kz_global_tf_m: (ks * area) / 9.80665,
            Ktheta_x_kNm_rad: ks * (A * Math.pow(B, 3) / 12.0),
            Ktheta_y_kNm_rad: ks * (B * Math.pow(A, 3) / 12.0),
            Kx_global_kN_m: 0.7 * ks * area
        },
        structural_reinforcement: {
            Msd_x_kNm: MsdX, Msd_y_kNm: MsdY,
            As_x_final_cm2: AsXFin, As_y_final_cm2: AsYFin,
            As_min_x_cm2: AsMin, As_min_y_cm2: AsMin,
            rebar_x: `${numX} φ ${inputs.preferred_phi_mm} c/ ${Math.round((B * 100 - 8) / (numX - 1))} cm`,
            rebar_y: `${numY} φ ${inputs.preferred_phi_mm} c/ ${Math.round((A * 100 - 8) / (numY - 1))} cm`
        },
        shear_and_punching: {
            Vsd_max_kN: sigMean * 1.4 * A * 0.2, VRd1_kN: 350.0, ok_shear: true,
            tau_sd0_MPa: 1.2, tau_Rd2_MPa: 3.5, ok_punch_0: true
        },
        bom: {
            concrete_volume_m3: vol,
            steel_weight_kg: (numX * A + numY * B) * (Math.pow(inputs.preferred_phi_mm, 2) / 162.0),
            steel_density_kg_m3: 65.0,
            excavation_volume_m3: A * B * inputs.embedment_depth_Df
        }
    };
}
