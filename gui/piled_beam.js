/**
 * Piled Gantry Beam UI Controller & Multi-View CAD Canvas Renderer
 * Standards: NBR 6118:2023 & NBR 6122:2019
 */

let lastBeamResult = null;
let currentGantryX = 12.0;
let isCalculatingBeam = false;
let beamViewMode = 'longitudinal'; // 'longitudinal', 'cross_section', 'diagrams'
let isAnimatingGantry = false;
let gantryAnimReqId = null;
let hasPendingBeamCalc = false;

const PILED_BEAM_SESSION_KEY = 'piled_beam_session_data';

function savePiledBeamSession() {
    try {
        const inputs = {};
        const elements = document.querySelectorAll('#piled-beam-form input, #piled-beam-form select');
        elements.forEach(el => {
            if (!el.id) return;
            if (el.type === 'checkbox') {
                inputs[el.id] = el.checked;
            } else {
                inputs[el.id] = el.value;
            }
        });
        const data = {
            version: '1.1',
            timestamp: Date.now(),
            inputs: inputs
        };
        localStorage.setItem(PILED_BEAM_SESSION_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Erro ao salvar sessão Piled Beam:', e);
    }
}

function loadPiledBeamSession() {
    const raw = localStorage.getItem(PILED_BEAM_SESSION_KEY);
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        if (!data || !data.inputs) return false;

        Object.entries(data.inputs).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el && val !== undefined && val !== null) {
                if (el.type === 'checkbox') {
                    el.checked = !!val;
                } else {
                    el.value = val;
                }
            }
        });
        return true;
    } catch (e) {
        console.warn('Erro ao restaurar sessão Piled Beam:', e);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Restore previous session data if available
    loadPiledBeamSession();

    const inputs = document.querySelectorAll('#piled-beam-form input, #piled-beam-form select');
    inputs.forEach(input => {
        input.addEventListener('input', debounce(() => { triggerCalculation(); savePiledBeamSession(); }, 250));
        input.addEventListener('change', () => { triggerCalculation(); savePiledBeamSession(); });
    });

    ['toggle-envelope-moment', 'toggle-envelope-shear', 'toggle-active-moment'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { if (lastBeamResult) drawCanvas(); });
    });

    // 2. Check for springs calculated in Aoki-Velloso
    checkAndLoadAokiSprings();

    window.addEventListener('resize', () => {
        if (lastBeamResult) drawCanvas();
    });

    // Canvas mouse move for hover ruler
    const canvas = document.getElementById('beamCanvas');
    if (canvas) {
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        canvas.addEventListener('mouseleave', () => {
            if (beamViewMode === 'diagrams') drawCanvas();
        });
    }

    // Save before unload
    window.addEventListener('beforeunload', savePiledBeamSession);

    triggerCalculation();
});

function checkAndLoadAokiSprings() {
    const raw = localStorage.getItem('aoki_springs_piled_beam');
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        const isPending = localStorage.getItem('aoki_springs_piled_beam_pending') === 'true';

        if (isPending || !localStorage.getItem(PILED_BEAM_SESSION_KEY)) {
            let applied = false;
            if (data.pile_spring_kz_kN_m && document.getElementById('pile_spring_kz')) {
                document.getElementById('pile_spring_kz').value = data.pile_spring_kz_kN_m;
                applied = true;
            }
            if (data.pile_spring_kx_fixed_kN_m && document.getElementById('pile_spring_kx')) {
                document.getElementById('pile_spring_kx').value = data.pile_spring_kx_fixed_kN_m;
                applied = true;
            }
            if (data.pile_capacity_adm_kN && document.getElementById('pile_capacity_adm')) {
                document.getElementById('pile_capacity_adm').value = data.pile_capacity_adm_kN;
                applied = true;
            }
            if (data.pile_diameter_m && document.getElementById('pile_diameter')) {
                document.getElementById('pile_diameter').value = data.pile_diameter_m;
                applied = true;
            }
            localStorage.removeItem('aoki_springs_piled_beam_pending');
            savePiledBeamSession();
        }

        const banner = document.getElementById('aoki-import-banner');
        const txt = document.getElementById('aoki-banner-text');
        if (banner && txt) {
            txt.innerHTML = `Molas importadas com sucesso do Aoki-Velloso! <strong>Kz = ${Number(data.pile_spring_kz_kN_m).toLocaleString('pt-BR')} kN/m</strong> | <strong>Kx = ${Number(data.pile_spring_kx_fixed_kN_m).toLocaleString('pt-BR')} kN/m</strong> | <strong>Radm = ${Number(data.pile_capacity_adm_kN).toLocaleString('pt-BR')} kN</strong>`;
            banner.classList.remove('hidden');
        }
    } catch (e) {
        console.warn('Erro ao carregar aoki_springs_piled_beam:', e);
    }
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function parseNum(id, defaultVal = 0.0) {
    const el = document.getElementById(id);
    if (!el || el.value === '' || el.value === null || el.value === undefined) return defaultVal;
    const val = parseFloat(el.value);
    return isNaN(val) ? defaultVal : val;
}

function getFormInputs() {
    return {
        beam_length: parseNum('beam_length', 24.0),
        beam_width: parseNum('beam_width', 0.80),
        beam_height: parseNum('beam_height', 1.20),
        pile_spacing: parseNum('pile_spacing', 3.0),
        cantilever_left: parseNum('cantilever_left', 1.50),

        gantry_load_tf: parseNum('gantry_load_tf', 148.42),
        dynamic_factor: parseNum('dynamic_factor', 1.25),
        num_wheels: parseInt(document.getElementById('num_wheels')?.value || '4', 10),
        wheel_spacing: parseNum('wheel_spacing', 1.40),
        braking_ratio: parseNum('braking_ratio', 0.15),
        transverse_ratio: parseNum('transverse_ratio', 0.10),
        rail_eccentricity: parseNum('rail_eccentricity', 0.05),

        fck: parseNum('fck', 35.0),
        cover: parseNum('cover', 50.0),
        bar_diam: parseNum('bar_diam', 25.0),

        pile_capacity_adm: parseNum('pile_capacity_adm', 1600.0),
        pile_spring_kz: parseNum('pile_spring_kz', 180000.0),
        pile_diameter: parseNum('pile_diameter', 0.80),
        pile_spring_kx: parseNum('pile_spring_kx', 40000.0),

        gantry_position: currentGantryX,

        unit_cost_concrete: parseNum('unit_cost_concrete', 550.0),
        unit_cost_steel: parseNum('unit_cost_steel', 12.50),
        unit_cost_formwork: parseNum('unit_cost_formwork', 85.0),
        unit_cost_drilling: parseNum('unit_cost_drilling', 180.0)
    };
}

async function triggerCalculation() {
    if (isCalculatingBeam) {
        hasPendingBeamCalc = true;
        return;
    }
    isCalculatingBeam = true;
    hasPendingBeamCalc = false;

    const inputs = getFormInputs();
    const slider = document.getElementById('gantry_slider');
    if (slider) {
        slider.max = inputs.beam_length;
        if (parseFloat(slider.value) > inputs.beam_length) {
            slider.value = inputs.beam_length / 2.0;
        }
        currentGantryX = parseFloat(slider.value);
        inputs.gantry_position = currentGantryX;
    }

    try {
        if (window.eel && eel.calculate_piled_beam) {
            const res = await eel.calculate_piled_beam(inputs)();
            if (res && res.success) {
                lastBeamResult = res;
                updateUIResults(res, inputs);
                drawCanvas();
            } else if (res && res.error) {
                console.error("Beam calculation error:", res.error);
            }
        }
    } catch (err) {
        console.error("Eel invocation failed:", err);
    } finally {
        isCalculatingBeam = false;
        if (hasPendingBeamCalc) {
            hasPendingBeamCalc = false;
            triggerCalculation();
        }
    }
}

function updateGantryPosition(val) {
    currentGantryX = parseFloat(val);
    const span = document.getElementById('gantry-pos-val');
    if (span) span.innerText = `${currentGantryX.toFixed(1)} m`;
    drawCanvas();
    triggerCalculation();
}

function switchBeamViewMode(mode) {
    beamViewMode = mode;
    ['long', 'cross', 'diag'].forEach(m => {
        const fullMode = (m === 'long' ? 'longitudinal' : (m === 'cross' ? 'cross_section' : 'diagrams'));
        const btn = document.getElementById(`tab-beam-${m}`);
        if (btn) {
            if (fullMode === mode) {
                btn.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs";
            } else {
                btn.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white";
            }
        }
    });

    const tag = document.getElementById('beam-info-tag');
    if (tag) {
        if (mode === 'longitudinal') tag.innerText = 'Corte Longitudinal & Trem-Tipo';
        else if (mode === 'cross_section') tag.innerText = 'Seção Transversal de Armaduras (NBR 6118)';
        else if (mode === 'diagrams') tag.innerText = 'Envoltórias Contínuas M(x) & V(x)';
    }

    drawCanvas();
}

function toggleBeamAnimation() {
    const icon = document.getElementById('beam-play-icon');
    const txt = document.getElementById('beam-play-text');
    const slider = document.getElementById('gantry_slider');
    const L_beam = parseNum('beam_length', 24.0);

    if (isAnimatingGantry) {
        isAnimatingGantry = false;
        if (gantryAnimReqId) cancelAnimationFrame(gantryAnimReqId);
        if (icon) icon.innerText = '▶';
        if (txt) txt.innerText = 'Animar Pórtico';
    } else {
        isAnimatingGantry = true;
        if (icon) icon.innerText = '⏸';
        if (txt) txt.innerText = 'Pausar';

        let curPos = slider ? parseFloat(slider.value) : 0;
        function stepGantry() {
            if (!isAnimatingGantry) return;
            curPos += 0.10;
            if (curPos > L_beam) curPos = 0.0;
            if (slider) slider.value = curPos.toFixed(2);
            updateGantryPosition(curPos);
            gantryAnimReqId = requestAnimationFrame(stepGantry);
        }
        gantryAnimReqId = requestAnimationFrame(stepGantry);
    }
}

function jumpToGantryCase(caseType) {
    const inputs = getFormInputs();
    const cant = inputs.cantilever_left;
    const sp = inputs.pile_spacing;
    let targetX = 0;

    if (caseType === 'midspan') {
        targetX = cant + 1.5 * sp; // Middle of second span
    } else if (caseType === 'support') {
        targetX = cant + sp; // Exactly over second pile
    }

    const slider = document.getElementById('gantry_slider');
    if (slider) {
        slider.value = targetX.toFixed(2);
        updateGantryPosition(targetX);
    }
}

function applyGantryPreset(type) {
    if (type === 'consag_150') {
        document.getElementById('gantry_load_tf').value = 148.42;
        document.getElementById('num_wheels').value = 4;
        document.getElementById('wheel_spacing').value = 1.40;
        document.getElementById('dynamic_factor').value = 1.25;
    } else if (type === 'industrial_80') {
        document.getElementById('gantry_load_tf').value = 80.0;
        document.getElementById('num_wheels').value = 2;
        document.getElementById('wheel_spacing').value = 2.00;
        document.getElementById('dynamic_factor').value = 1.20;
    } else if (type === 'heavylift_300') {
        document.getElementById('gantry_load_tf').value = 300.0;
        document.getElementById('num_wheels').value = 8;
        document.getElementById('wheel_spacing').value = 1.20;
        document.getElementById('dynamic_factor').value = 1.30;
    } else if (type === 'tb450') {
        document.getElementById('gantry_load_tf').value = 45.0;
        document.getElementById('num_wheels').value = 3;
        document.getElementById('wheel_spacing').value = 1.50;
        document.getElementById('dynamic_factor').value = 1.35;
    }
    triggerCalculation();
}

function updateBadge(id, isOk, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = text;
    el.className = isOk
        ? "px-2 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
        : "px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300";
}

function updateUIResults(res, inputs = null) {
    const env = res.envelope_results || {};
    const des = res.beam_design || {};
    const pcheck = res.piles_check || {};
    const spanOpt = res.span_optimization || [];
    const qty = res.quantities || {};
    const costs = res.cost_estimation || {};

    // Top Cards
    document.getElementById('card-m-pos').innerText = env.M_pos_max_kNm != null ? `${env.M_pos_max_kNm.toFixed(0)}` : '-';
    document.getElementById('card-as-inf').innerText = `As inf = ${des.As_inf_cm2} cm² (${des.detail_inf?.text || '-'})`;

    document.getElementById('card-m-neg').innerText = env.M_neg_max_kNm != null ? `${env.M_neg_max_kNm.toFixed(0)}` : '-';
    document.getElementById('card-as-sup').innerText = `As sup = ${des.As_sup_cm2} cm² (${des.detail_sup?.text || '-'})`;

    document.getElementById('card-v-max').innerText = env.V_max_kN != null ? `${env.V_max_kN.toFixed(0)}` : '-';
    updateBadge('badge-shear-status', des.status_strut === "APROVADO (Biela OK)", des.status_strut || 'OK');
    document.getElementById('card-stirrups').innerText = des.stirrups?.text || '-';

    document.getElementById('card-pile-r-max').innerText = env.R_max_pile_tf != null ? `${env.R_max_pile_tf.toFixed(1)}` : '-';
    const isPileOk = pcheck.status_compression === 'APROVADO';
    updateBadge('badge-pile-beam-status', isPileOk, isPileOk ? `FS = ${pcheck.fs_compression}` : 'SOBRECARGA');
    document.getElementById('card-pile-adm').innerText = `R_adm: ${(pcheck.R_adm_kN / 9.81).toFixed(0)} tf (${pcheck.num_piles} estacas)`;

    // Planilha de Quantitativos de Obra (Terraplenagem e Estrutura)
    const escTotal = (qty.excavation_piles_m3 || 0) + (qty.excavation_mechanized_m3 || 0);
    const concTotal = (qty.concrete_structural_m3 || qty.total_concrete_m3 || 0);

    const badgeEsc = document.getElementById('beam-qty-esc-badge');
    if (badgeEsc) badgeEsc.innerText = `Escavação Total: ${escTotal.toFixed(1)} m³`;

    const badgeConc = document.getElementById('beam-qty-conc-badge');
    if (badgeConc) badgeConc.innerText = `Concreto: ${concTotal.toFixed(1)} m³`;

    if (document.getElementById('beam-qty-esc-estaca')) {
        document.getElementById('beam-qty-esc-estaca').innerText = `${qty.excavation_piles_m3 != null ? qty.excavation_piles_m3.toFixed(1) : '-'} m³`;
        document.getElementById('beam-qty-esc-mec').innerText = `${qty.excavation_mechanized_m3 != null ? qty.excavation_mechanized_m3.toFixed(1) : '-'} m³`;
        document.getElementById('beam-qty-reaterro').innerText = `${qty.backfill_m3 != null ? qty.backfill_m3.toFixed(1) : '-'} m³`;
        document.getElementById('beam-qty-botafora').innerText = `${qty.disposal_m3 != null ? qty.disposal_m3.toFixed(1) : '-'} m³`;
        const fckVal = (inputs && inputs.fck) || parseNum('fck', 35.0);
        if (document.getElementById('beam-qty-conc-desc')) {
            document.getElementById('beam-qty-conc-desc').innerText = `Concreto fck ${fckVal}MPa (Viga + Estacas)`;
        }
        document.getElementById('beam-qty-conc-estrutural').innerText = `${concTotal.toFixed(1)} m³`;
        document.getElementById('beam-qty-conc-magro').innerText = `${qty.concrete_lean_m3 != null ? qty.concrete_lean_m3.toFixed(1) : '-'} m³`;
        document.getElementById('beam-qty-forma').innerText = `${qty.formwork_beam_m2 != null ? qty.formwork_beam_m2.toFixed(1) : '-'} m²`;
        document.getElementById('beam-qty-chumbador').innerText = `${qty.anchor_bolts_qty != null ? qty.anchor_bolts_qty : '-'} un`;
        document.getElementById('beam-qty-aco').innerText = `${qty.total_steel_kg != null ? qty.total_steel_kg.toLocaleString('pt-BR') : '-'} kg (${qty.total_steel_ton?.toFixed(1) || '-'} t)`;
    }

    // Technical Table
    document.getElementById('res-m-sd-pos').innerText = `${des.Md_pos_kNm?.toFixed(1)} kN·m`;
    document.getElementById('res-detail-inf').innerText = `${des.detail_inf?.text || '-'}`;
    document.getElementById('res-m-sd-neg').innerText = `${des.Md_neg_kNm?.toFixed(1)} kN·m`;
    document.getElementById('res-detail-sup').innerText = `${des.detail_sup?.text || '-'}`;
    document.getElementById('res-skin-rebar').innerText = `${des.skin_reinforcement?.text || '-'}`;
    document.getElementById('res-v-sd').innerText = `V_sd = ${des.V_sd_kN?.toFixed(1)} kN ≤ VRd2 = ${des.VRd2_kN?.toFixed(1)} kN (${des.status_strut})`;
    document.getElementById('res-stirrups-desc').innerText = `${des.stirrups?.text} (As,w = ${des.stirrups?.asw_provided_cm2_m} cm²/m)`;
    document.getElementById('res-crack-beam').innerText = `${des.crack_width?.w_k_mm?.toFixed(3)} mm (${des.crack_width?.status})`;

    document.getElementById('res-pile-comp').innerText = `R_máx = ${pcheck.R_max_overall_kN?.toFixed(1)} kN vs R_adm = ${pcheck.R_adm_kN?.toFixed(1)} kN (${pcheck.status_compression})`;
    document.getElementById('res-pile-uplift').innerText = `${pcheck.status_uplift}`;
    document.getElementById('res-pile-h').innerText = `${pcheck.H_per_pile_kN?.toFixed(1)} kN / estaca`;
    document.getElementById('res-pile-m-head').innerText = `${pcheck.M_pile_head_kNm?.toFixed(1)} kN·m`;

    // Span Optimization Table
    const tbody = document.getElementById('span-opt-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        spanOpt.forEach(opt => {
            const tr = document.createElement('tr');
            tr.className = opt.is_current
                ? "bg-blue-50 dark:bg-blue-900/30 font-bold border-b border-blue-200 dark:border-blue-700"
                : "border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50";

            tr.innerHTML = `
                <td class="p-2">${opt.span_m.toFixed(1)}m ${opt.is_current ? '<span class="text-[10px] text-blue-600 dark:text-blue-400 font-bold">(Atual)</span>' : ''}</td>
                <td class="p-2">${opt.num_piles}</td>
                <td class="p-2 font-mono">${opt.total_drilling_m} m</td>
                <td class="p-2 text-right font-mono">${opt.M_pos_max_kNm.toFixed(0)}</td>
                <td class="p-2 text-right font-mono">${opt.M_neg_max_kNm.toFixed(0)}</td>
                <td class="p-2 text-right font-mono text-cyan-600 dark:text-cyan-400 font-bold">${opt.R_max_pile_tf.toFixed(1)}t</td>
                <td class="p-2 text-right font-mono text-emerald-600 dark:text-emerald-400">${opt.As_inf_cm2.toFixed(1)}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function drawCanvas() {
    const canvas = document.getElementById('beamCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Unified RS2 / CAD Slate Background & Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, w, h, true);
        EngCAD.drawGrid(ctx, w, h, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);
    }

    if (beamViewMode === 'longitudinal') {
        drawBeamLongitudinal(ctx, w, h);
    } else if (beamViewMode === 'cross_section') {
        drawBeamCrossSection(ctx, w, h);
    } else if (beamViewMode === 'diagrams') {
        drawBeamDiagrams(ctx, w, h);
    }

    // Floating CAD HUD Overlay (RS2 Standard)
    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        const inputs = getFormInputs();
        const res = lastBeamResult;
        const viewName = beamViewMode === 'longitudinal' ? 'Corte Longitudinal' : (beamViewMode === 'cross_section' ? 'Seção Transversal' : 'Envoltórias Dinâmicas');
        const mPos = res?.envelope?.max_M_pos_kNm ? `${(res.envelope.max_M_pos_kNm / 9.81).toFixed(1)} tf·m` : '--';
        const mNeg = res?.envelope?.max_M_neg_kNm ? `${(res.envelope.max_M_neg_kNm / 9.81).toFixed(1)} tf·m` : '--';
        const vMax = res?.envelope?.max_V_kNm ? `${(res.envelope.max_V_kNm / 9.81).toFixed(1)} tf` : '--';
        EngCAD.updateHUD(canvas.parentElement, `Viga sob Trem-Tipo (${viewName})`, [
            { label: 'Vão / Seção', value: `${inputs.beam_length}m (${inputs.beam_width}m × ${inputs.beam_height}m)`, color: '#38bdf8' },
            { label: 'Trem-Tipo', value: `${inputs.gantry_axle_load_tf || 148.4} tf`, color: '#f59e0b' },
            { label: 'Envoltória M+', value: mPos, color: '#38bdf8' },
            { label: 'Envoltória M-', value: mNeg, color: '#c084fc' }
        ]);
    }
}

// -------------------------------------------------------------
// VISTA 1: CORTE LONGITUDINAL DA VIGA & TREM-TIPO
// -------------------------------------------------------------
function drawBeamLongitudinal(ctx, w, h) {
    const inputs = getFormInputs();
    const res = lastBeamResult;

    const L_beam = inputs.beam_length;
    const marginX = 45;
    const scaleX = (w - 2 * marginX) / L_beam;
    const toPxX = (x) => marginX + x * scaleX;

    const y_ground = 130;
    const h_beam_px = Math.max(30, inputs.beam_height * 38);
    const y_beam_top = y_ground - h_beam_px;
    const y_beam_bottom = y_ground;
    const y_pile_bottom = 265;

    // 1. Ground and Soil Hatching
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marginX - 20, y_ground);
    ctx.lineTo(w - marginX + 20, y_ground);
    ctx.stroke();

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let x = marginX - 10; x <= w - marginX + 10; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, y_ground);
        ctx.lineTo(x - 8, y_ground + 8);
        ctx.stroke();
    }

    // 2. Concrete Runway Beam Body
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.fillRect(toPxX(0), y_beam_top, L_beam * scaleX, h_beam_px);
    ctx.strokeRect(toPxX(0), y_beam_top, L_beam * scaleX, h_beam_px);

    // Crane Rail Profile (TR-68) on top of beam
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.fillRect(toPxX(0), y_beam_top - 6, L_beam * scaleX, 6);
    ctx.strokeRect(toPxX(0), y_beam_top - 6, L_beam * scaleX, 6);

    // Dimension label
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`L = ${L_beam.toFixed(1)} m (bw = ${inputs.beam_width}m x h = ${inputs.beam_height}m)`, toPxX(L_beam / 2), y_beam_top - 42);

    // 3. Piles
    const pileSpacing = inputs.pile_spacing;
    const cantL = inputs.cantilever_left;
    const Dp_px = Math.max(14, inputs.pile_diameter * scaleX * 1.4);

    let px = cantL;
    const pileXCoords = [];
    while (px <= L_beam - 0.49) {
        pileXCoords.push(px);
        px += pileSpacing;
    }

    const pCheck = res?.piles_check;

    pileXCoords.forEach((x_pile, idx) => {
        const cx = toPxX(x_pile);

        const pileInfo = pCheck?.piles?.[idx];
        const R_tf = pileInfo ? pileInfo.R_max_tf : '-';
        const R_curr = pileInfo ? pileInfo.R_current_tf : '-';
        const R_adm_tf = (inputs.pile_capacity_adm || 1600.0) / 9.81;
        const rCurrNum = typeof R_curr === 'number' ? R_curr : parseFloat(R_curr) || 0;
        const ratioCurr = R_adm_tf > 0 ? (rCurrNum / R_adm_tf) : 0;

        let pileColor = '#10b981';
        let pileFill = 'rgba(16, 185, 129, 0.25)';
        if (ratioCurr > 1.0) {
            pileColor = '#ef4444';
            pileFill = 'rgba(239, 68, 68, 0.40)';
        } else if (ratioCurr > 0.75) {
            pileColor = '#f59e0b';
            pileFill = 'rgba(245, 158, 11, 0.35)';
        } else if (rCurrNum > 10.0) {
            pileFill = 'rgba(16, 185, 129, 0.40)';
        }

        // Cylinder
        ctx.fillStyle = pileFill;
        ctx.strokeStyle = pileColor;
        ctx.lineWidth = 2;
        ctx.fillRect(cx - Dp_px / 2, y_ground, Dp_px, y_pile_bottom - y_ground);
        ctx.strokeRect(cx - Dp_px / 2, y_ground, Dp_px, y_pile_bottom - y_ground);

        // Spring coils
        ctx.strokeStyle = pileColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let sy = y_ground + 10; sy < y_pile_bottom - 10; sy += 10) {
            ctx.moveTo(cx - 5, sy);
            ctx.lineTo(cx + 5, sy + 5);
        }
        ctx.stroke();

        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.fillStyle = pileColor;
        ctx.textAlign = 'center';
        ctx.fillText(`E${idx + 1}`, cx, y_pile_bottom + 13);

        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(`R: ${R_curr !== '-' ? R_curr + 't' : '-'}`, cx, y_pile_bottom + 25);

        ctx.font = '8px JetBrains Mono, monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`Env: ${R_tf !== '-' ? R_tf + 't' : '-'}`, cx, y_pile_bottom + 36);
    });

    // 4. Moving Gantry Bogie Train
    const nWheels = inputs.num_wheels;
    const wSpacing = inputs.wheel_spacing;
    const gantryX = currentGantryX;

    const wheelXs = [];
    for (let i = 0; i < nWheels; i++) {
        const offset = (i - (nWheels - 1) / 2.0) * wSpacing;
        wheelXs.push(gantryX + offset);
    }

    // Bogie Equalizer Frame
    const firstWX = toPxX(wheelXs[0]);
    const lastWX = toPxX(wheelXs[wheelXs.length - 1]);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(firstWX - 6, y_beam_top - 16);
    ctx.lineTo(lastWX + 6, y_beam_top - 16);
    ctx.stroke();

    // Central Kingpin and Load Arrow
    const centerWX = toPxX(gantryX);
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(centerWX, y_beam_top - 36);
    ctx.lineTo(centerWX, y_beam_top - 18);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerWX - 6, y_beam_top - 24);
    ctx.lineTo(centerWX, y_beam_top - 18);
    ctx.lineTo(centerWX + 6, y_beam_top - 24);
    ctx.fill();

    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText(`${inputs.gantry_load_tf} tf (φ=${inputs.dynamic_factor})`, centerWX, y_beam_top - 40);

    // Wheels
    wheelXs.forEach(wx => {
        const cx = toPxX(wx);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(cx, y_beam_top - 9, 6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.arc(cx, y_beam_top - 9, 2.5, 0, Math.PI * 2);
        ctx.fill();
    });

    // 5. Envelope preview & Live Gantry Moment below ground
    const showM = document.getElementById('toggle-envelope-moment')?.checked;
    const showV = document.getElementById('toggle-envelope-shear')?.checked;
    const showActiveM = document.getElementById('toggle-active-moment')?.checked ?? true;
    const y_base_env = 390;

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toPxX(0), y_base_env);
    ctx.lineTo(toPxX(L_beam), y_base_env);
    ctx.stroke();

    if (res && res.envelope_results) {
        const pts = res.envelope_results.diagram_points || [];
        const curr_pts = res.envelope_results.current_state_points || [];
        const M_max = Math.max(50, res.envelope_results.M_pos_max_kNm || 0, res.envelope_results.M_neg_max_kNm || 0);
        const V_max = Math.max(50, res.envelope_results.V_max_kN || 0);

        const scaleM = 45.0 / M_max;
        const scaleV = 45.0 / V_max;

        // 5a. Active Live Moment M(x) for current gantry position
        if (showActiveM && curr_pts.length > 0) {
            // Shaded region
            ctx.fillStyle = 'rgba(245, 158, 11, 0.20)';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(toPxX(0), y_base_env);
            curr_pts.forEach(pt => {
                ctx.lineTo(toPxX(pt.x), y_base_env + pt.M * scaleM);
            });
            ctx.lineTo(toPxX(L_beam), y_base_env);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Wheel projection guides down to the live moment curve
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            wheelXs.forEach(wx => {
                if (wx >= 0 && wx <= L_beam) {
                    const cx = toPxX(wx);
                    ctx.beginPath();
                    ctx.moveTo(cx, y_beam_bottom);
                    ctx.lineTo(cx, y_base_env + 35);
                    ctx.stroke();
                }
            });
            ctx.setLineDash([]);
        }

        // 5b. Envelope M+ / M-
        if (showM && pts.length > 0) {
            // M+ (downward)
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([3, 2]);
            ctx.beginPath();
            pts.forEach((pt, i) => {
                const px = toPxX(pt.x);
                const py = y_base_env + pt.M_pos * scaleM;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();

            // M- (upward)
            ctx.strokeStyle = '#c084fc';
            ctx.beginPath();
            pts.forEach((pt, i) => {
                const px = toPxX(pt.x);
                const py = y_base_env + pt.M_neg * scaleM;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // 5c. Envelope Shear
        if (showV && pts.length > 0) {
            ctx.strokeStyle = '#34d399';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            pts.forEach((pt, i) => {
                const px = toPxX(pt.x);
                const py = y_base_env - pt.V_pos * scaleV;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Legend
        ctx.font = 'bold 9px Inter, sans-serif';
        if (showActiveM) {
            ctx.fillStyle = '#f59e0b';
            ctx.textAlign = 'left';
            ctx.fillText(`— M(x) Carga Móvel`, toPxX(0), y_base_env - 42);
        }
        if (showM) {
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'left';
            ctx.fillText(`-- Envoltória M+ / M-`, toPxX(0) + (showActiveM ? 120 : 0), y_base_env - 42);
        }
    }
}

// -------------------------------------------------------------
// VISTA 2: SEÇÃO TRANSVERSAL DETALHADA DE ARMADURAS (NBR 6118)
// -------------------------------------------------------------
function drawBeamCrossSection(ctx, w, h) {
    const inputs = getFormInputs();
    const res = lastBeamResult;

    const bw = inputs.beam_width;
    const H = inputs.beam_height;
    const cover = inputs.cover / 1000.0; // m

    // Center scaled cross-section
    const maxDim = Math.max(bw, H);
    const scale = 250.0 / maxDim;

    const cx = w / 2.0;
    const cy = h / 2.0 + 15;

    const w_px = bw * scale;
    const h_px = H * scale;

    const x1 = cx - w_px / 2.0;
    const y1 = cy - h_px / 2.0;
    const x2 = cx + w_px / 2.0;
    const y2 = cy + h_px / 2.0;

    // 1. Concrete Cross-Section
    ctx.fillStyle = 'rgba(59, 130, 246, 0.20)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.fillRect(x1, y1, w_px, h_px);
    ctx.strokeRect(x1, y1, w_px, h_px);

    // Crane Rail on top
    const rail_w = 40;
    const rail_h = 24;
    const rail_x = cx - rail_w / 2.0 + (inputs.rail_eccentricity * scale);
    const rail_y = y1 - rail_h;

    ctx.fillStyle = '#475569';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.fillRect(rail_x, rail_y, rail_w, rail_h);
    ctx.strokeRect(rail_x, rail_y, rail_w, rail_h);

    ctx.font = 'bold 9px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('TRILHO TR-68', cx + (inputs.rail_eccentricity * scale), rail_y + 15);

    // 2. Closed Stirrups
    const cover_px = cover * scale;
    const st_x1 = x1 + cover_px;
    const st_y1 = y1 + cover_px;
    const st_x2 = x2 - cover_px;
    const st_y2 = y2 - cover_px;

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.rect(st_x1, st_y1, st_x2 - st_x1, st_y2 - st_y1);
    ctx.stroke();

    // 3. Longitudinal Bars
    const des = res?.beam_design;
    const n_inf = des?.detail_inf?.num_bars || 4;
    const n_sup = des?.detail_sup?.num_bars || 4;
    const n_skin = des?.skin_reinforcement?.bars_per_face || 0;

    // Bottom bars (As,inf)
    const bar_r = 5.5;
    const avail_w_st = (st_x2 - st_x1) - 2 * bar_r;

    ctx.fillStyle = '#38bdf8'; // Sky blue
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 1.5;

    for (let i = 0; i < Math.min(6, n_inf); i++) {
        const bx = (st_x1 + bar_r) + (i / max(1, Math.min(6, n_inf) - 1)) * avail_w_st;
        const by = st_y2 - bar_r - 2;
        ctx.beginPath();
        ctx.arc(bx, by, bar_r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // Top bars (As,sup)
    ctx.fillStyle = '#c084fc'; // Purple
    ctx.strokeStyle = '#7e22ce';
    for (let i = 0; i < Math.min(6, n_sup); i++) {
        const bx = (st_x1 + bar_r) + (i / max(1, Math.min(6, n_sup) - 1)) * avail_w_st;
        const by = st_y1 + bar_r + 2;
        ctx.beginPath();
        ctx.arc(bx, by, bar_r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    // Skin reinforcement (Armadura de Pele) along vertical sides
    if (n_skin > 0) {
        ctx.fillStyle = '#14b8a6'; // Teal
        ctx.strokeStyle = '#0f766e';
        const avail_h_st = (st_y2 - st_y1) - 2 * (bar_r + 15);
        for (let j = 0; j < n_skin; j++) {
            const by = (st_y1 + bar_r + 15) + (j / max(1, n_skin - 1)) * avail_h_st;
            // Left face
            ctx.beginPath();
            ctx.arc(st_x1 + bar_r + 1, by, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            // Right face
            ctx.beginPath();
            ctx.arc(st_x2 - bar_r - 1, by, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
    }

    // 4. Dimension Annotations & Callouts
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.fillText(`bw = ${(bw * 100).toFixed(0)} cm`, cx, y2 + 25);

    ctx.textAlign = 'right';
    ctx.fillText(`h = ${(H * 100).toFixed(0)} cm`, x1 - 15, cy);

    // Callout texts
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#c084fc';
    ctx.textAlign = 'left';
    ctx.fillText(`As,sup: ${des?.detail_sup?.text || '-'}`, x2 + 15, st_y1 + 10);

    ctx.fillStyle = '#14b8a6';
    ctx.fillText(`Pele: ${des?.skin_reinforcement?.text || '-'}`, x2 + 15, cy);

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`As,inf: ${des?.detail_inf?.text || '-'}`, x2 + 15, st_y2 - 5);

    ctx.fillStyle = '#10b981';
    ctx.fillText(`${des?.stirrups?.text || '-'}`, x2 + 15, st_y2 + 20);
}

// -------------------------------------------------------------
// VISTA 3: DIAGRAMAS DE ENVOLTÓRIAS COMPLETAS M(x) & V(x)
// -------------------------------------------------------------
function drawBeamDiagrams(ctx, w, h) {
    const inputs = getFormInputs();
    const res = lastBeamResult;

    if (!res || !res.envelope_results || !res.envelope_results.diagram_points) {
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText('Nenhum dado de envoltória disponível.', w / 2, h / 2);
        return;
    }

    const L_beam = inputs.beam_length;
    const marginX = 50;
    const scaleX = (w - 2 * marginX) / L_beam;
    const toPxX = (x) => marginX + x * scaleX;

    const y_base_M = 160;
    const y_base_V = 350;

    const pts = res.envelope_results.diagram_points;
    const curr_pts = res.envelope_results.current_state_points || [];
    const M_max = Math.max(50, res.envelope_results.M_pos_max_kNm, res.envelope_results.M_neg_max_kNm);
    const V_max = Math.max(50, res.envelope_results.V_max_kN);

    const scaleM = 75.0 / M_max;
    const scaleV = 65.0 / V_max;

    // --- MOMENTS DIAGRAM ---
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(`Envoltória de Momentos Fletores M(x) [kN·m] — NBR 6118`, marginX, 35);

    // Axis line
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toPxX(0), y_base_M);
    ctx.lineTo(toPxX(L_beam), y_base_M);
    ctx.stroke();

    // M+ fill & line (downward per civil engineering)
    ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toPxX(0), y_base_M);
    pts.forEach(pt => ctx.lineTo(toPxX(pt.x), y_base_M + pt.M_pos * scaleM));
    ctx.lineTo(toPxX(L_beam), y_base_M);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // M- fill & line (upward over supports)
    ctx.fillStyle = 'rgba(192, 132, 252, 0.20)';
    ctx.strokeStyle = '#c084fc';
    ctx.beginPath();
    ctx.moveTo(toPxX(0), y_base_M);
    pts.forEach(pt => ctx.lineTo(toPxX(pt.x), y_base_M + pt.M_neg * scaleM));
    ctx.lineTo(toPxX(L_beam), y_base_M);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Current gantry position moment curve
    if (curr_pts.length > 0) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(toPxX(0), y_base_M);
        curr_pts.forEach(pt => ctx.lineTo(toPxX(pt.x), y_base_M + pt.M * scaleM));
        ctx.lineTo(toPxX(L_beam), y_base_M);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Gantry wheel indicator lines
        const nWheels = inputs.num_wheels;
        const wSpacing = inputs.wheel_spacing;
        const gantryX = currentGantryX;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        for (let i = 0; i < nWheels; i++) {
            const offset = (i - (nWheels - 1) / 2.0) * wSpacing;
            const wx = gantryX + offset;
            if (wx >= 0 && wx <= L_beam) {
                const cx = toPxX(wx);
                ctx.beginPath();
                ctx.moveTo(cx, y_base_M - 50);
                ctx.lineTo(cx, y_base_M + 70);
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);
    }

    // --- SHEAR DIAGRAM ---
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'left';
    ctx.fillText(`Envoltória de Esforços Cortantes V(x) [kN]`, marginX, y_base_V - 80);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toPxX(0), y_base_V);
    ctx.lineTo(toPxX(L_beam), y_base_V);
    ctx.stroke();

    // Shear envelope
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    pts.forEach((pt, i) => {
        const px = toPxX(pt.x);
        const py = y_base_V - pt.V_pos * scaleV;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();

    ctx.beginPath();
    pts.forEach((pt, i) => {
        const px = toPxX(pt.x);
        const py = y_base_V + pt.V_pos * scaleV;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
}

function handleCanvasMouseMove(e) {
    if (beamViewMode !== 'diagrams') return;
    const canvas = document.getElementById('beamCanvas');
    if (!canvas || !lastBeamResult) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    const L_beam = parseNum('beam_length', 24.0);
    const marginX = 50;
    const scaleX = (canvas.width - 2 * marginX) / L_beam;
    const x_coord = (mouseX - marginX) / scaleX;

    if (x_coord < 0 || x_coord > L_beam) return;

    drawCanvas();

    // Draw ruler line
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(mouseX, 20);
    ctx.lineTo(mouseX, canvas.height - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Hover tooltip
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`x = ${x_coord.toFixed(2)} m`, mouseX, 15);
}

function resetDefaults() {
    if (!confirm('Deseja realmente restaurar todos os parâmetros da Viga para os valores padrão de fábrica?')) {
        return;
    }
    localStorage.removeItem(PILED_BEAM_SESSION_KEY);
    localStorage.removeItem('aoki_springs_piled_beam');
    localStorage.removeItem('aoki_springs_piled_beam_pending');

    const banner = document.getElementById('aoki-import-banner');
    if (banner) banner.classList.add('hidden');

    document.getElementById('beam_length').value = 24.0;
    document.getElementById('beam_width').value = 0.80;
    document.getElementById('beam_height').value = 1.20;
    document.getElementById('pile_spacing').value = 3.0;
    if (document.getElementById('cantilever_left')) document.getElementById('cantilever_left').value = 1.50;
    document.getElementById('gantry_load_tf').value = 148.42;
    document.getElementById('dynamic_factor').value = 1.25;
    if (document.getElementById('num_wheels')) document.getElementById('num_wheels').value = 4;
    if (document.getElementById('wheel_spacing')) document.getElementById('wheel_spacing').value = 1.40;
    if (document.getElementById('braking_ratio')) document.getElementById('braking_ratio').value = 0.15;
    if (document.getElementById('transverse_ratio')) document.getElementById('transverse_ratio').value = 0.10;
    if (document.getElementById('rail_eccentricity')) document.getElementById('rail_eccentricity').value = 0.05;
    if (document.getElementById('fck')) document.getElementById('fck').value = 35.0;
    if (document.getElementById('cover')) document.getElementById('cover').value = 50.0;
    if (document.getElementById('bar_diam')) document.getElementById('bar_diam').value = 25.0;
    document.getElementById('pile_capacity_adm').value = 1600.0;
    if (document.getElementById('pile_spring_kz')) document.getElementById('pile_spring_kz').value = 180000.0;
    if (document.getElementById('pile_diameter')) document.getElementById('pile_diameter').value = 0.80;
    if (document.getElementById('pile_spring_kx')) document.getElementById('pile_spring_kx').value = 40000.0;
    document.getElementById('gantry_slider').value = 12.0;
    triggerCalculation();
    savePiledBeamSession();
}

function max(a, b) {
    return Math.max(a, b);
}
