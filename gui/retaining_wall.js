/**
 * Retaining Wall Stability UI & 2D Canvas Renderer with CAD Dimension Lines (Cotas)
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. Restore previous session data if available
    if (typeof loadFormSession === 'function') {
        const restored = loadFormSession('retaining_wall_session_data', '#retaining-wall-form');
        if (restored) {
            toggleKeyOptions();
            toggleTheoryOptions();
        }
    }

    // Register event listeners for live drawing updates and auto-saving
    const formInputs = document.querySelectorAll('#retaining-wall-form input, #retaining-wall-form select');
    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            triggerCalculation();
            if (typeof saveFormSession === 'function') {
                saveFormSession('retaining_wall_session_data', '#retaining-wall-form');
            }
        });
        input.addEventListener('change', () => {
            triggerCalculation();
            if (typeof saveFormSession === 'function') {
                saveFormSession('retaining_wall_session_data', '#retaining-wall-form');
            }
        });
    });

    const phiInput = document.getElementById('phi_soil');
    if (phiInput) {
        phiInput.addEventListener('input', updateSuggestedDelta);
    }
    const wallFrictionInput = document.getElementById('wall_friction');
    if (wallFrictionInput) {
        wallFrictionInput.addEventListener('input', () => {
            wallFrictionInput.dataset.customized = 'true';
        });
    }

    // Auto-save on page unload
    window.addEventListener('beforeunload', () => {
        if (typeof saveFormSession === 'function') {
            saveFormSession('retaining_wall_session_data', '#retaining-wall-form');
        }
    });

    // Initial calculation & render
    triggerCalculation();
});

function toggleKeyOptions() {
    const hasKey = document.getElementById('has_key').checked;
    const keyOpts = document.getElementById('key-options');
    if (hasKey) {
        keyOpts.classList.remove('hidden');
    } else {
        keyOpts.classList.add('hidden');
    }
    triggerCalculation();
}

function toggleTheoryOptions() {
    const theory = document.getElementById('theory')?.value;
    const opts = document.getElementById('coulomb-options');
    if (opts) {
        if (theory === 'coulomb') {
            opts.classList.remove('hidden');
            updateSuggestedDelta();
        } else {
            opts.classList.add('hidden');
        }
    }
    triggerCalculation();
}

function updateSuggestedDelta() {
    const phi = parseNum('phi_soil', 30.0);
    const sug = (2.0 / 3.0 * phi).toFixed(1);
    const span = document.getElementById('delta-suggested');
    if (span) span.innerText = sug;
    const input = document.getElementById('wall_friction');
    if (input && (!input.value || input.dataset.customized !== 'true')) {
        input.value = sug;
    }
}

function parseNum(id, defaultVal = 0.0) {
    const el = document.getElementById(id);
    if (!el || el.value === '' || el.value === null || el.value === undefined) {
        return defaultVal;
    }
    const val = parseFloat(el.value);
    return isNaN(val) ? defaultVal : val;
}

function getFormInputs() {
    const stem_bot_w = parseNum('stem_bot_width', 0.5);
    const stem_top_w = parseNum('stem_top_width', 0.3);
    const raw_batter = parseNum('stem_front_batter', 0.0);

    // Clamp stem front batter so it never exceeds available taper (stem_bot_w - stem_top_w)
    const max_taper = Math.max(0, stem_bot_w - stem_top_w);
    const stem_front_batter = Math.max(0, Math.min(raw_batter, max_taper));

    return {
        stem_height: parseNum('stem_height', 4.0),
        base_thickness: parseNum('base_thickness', 0.5),
        stem_top_width: stem_top_w,
        stem_bot_width: stem_bot_w,
        toe_length: parseNum('toe_length', 0.8),
        heel_length: parseNum('heel_length', 1.7),
        stem_front_batter: stem_front_batter,

        has_key: document.getElementById('has_key')?.checked || false,
        key_depth: parseNum('key_depth', 0.5),
        key_width: parseNum('key_width', 0.4),
        key_pos: parseNum('key_pos', 1.0),

        gamma_soil: parseNum('gamma_soil', 18.0),
        phi_soil: parseNum('phi_soil', 30.0),
        backfill_slope: parseNum('backfill_slope', 0.0),
        q_surcharge: parseNum('q_surcharge', 10.0),
        water_height: parseNum('water_height', 0.0),
        drainage_eff: parseNum('drainage_eff', 1.0),
        theory: document.getElementById('theory')?.value || 'rankine',
        wall_friction: parseNum('wall_friction', (2.0 / 3.0 * parseNum('phi_soil', 30.0))),

        phi_found: parseNum('phi_found', 30.0),
        base_friction_coef: parseNum('base_friction_coef', 0.30),
        cohesion_found: parseNum('cohesion_found', 0.0),
        q_adm: parseNum('q_adm', 200.0),
        base_soil_type: document.getElementById('base_soil_type')?.value || 'Silte',
        base_spt: parseNum('base_spt', 15.0),
        toe_embedment: parseNum('toe_embedment', 0.5),

        gamma_front: parseNum('gamma_front', 18.0),
        phi_front: parseNum('phi_front', 30.0),
        cohesion_front: parseNum('cohesion_front', 0.0),
        use_passive: document.getElementById('use_passive')?.checked || false,

        // Reinforcement inputs
        fck: parseNum('fck', 25.0),
        fyk: parseNum('fyk', 500.0),
        cover_stem: parseNum('cover_stem', 40.0),
        cover_base: parseNum('cover_base', 50.0),
        bar_diam: parseNum('bar_diam', 16.0),
        gamma_f: parseNum('gamma_f', 1.4)
    };
}

function triggerCalculation() {
    const inputs = getFormInputs();

    // Check if Eel is available (running inside Eel desktop app)
    if (typeof eel !== 'undefined' && eel.calculate_retaining_wall) {
        eel.calculate_retaining_wall(inputs)(function (response) {
            if (response && response.success) {
                updateUIResults(response);
                drawWallCanvas(inputs, response);
            } else if (response && response.error) {
                console.error("Calculation Error:", response.error);
                drawWallCanvas(inputs, null);
            }
        });
    } else {
        console.warn("Eel backend not detected. Running in standalone preview mode.");
        drawWallCanvas(inputs, null);
    }
}

function updateUIResults(res) {
    if (!res || !res.success) return;

    const geo = res.geometry;
    const ep = res.earth_pressures;
    const st = res.stability;
    const disp = res.displacement || {};

    // 4 Main Stability Cards
    // Overturning
    document.getElementById('val-fs-overturning').innerText = st.fs_overturning.toFixed(2);
    updateBadge('badge-overturning', st.fs_overturning >= st.fs_overturning_target, `FS = ${st.fs_overturning.toFixed(2)} ≥ ${st.fs_overturning_target}`);

    // Sliding
    document.getElementById('val-fs-sliding').innerText = st.fs_sliding.toFixed(2);
    updateBadge('badge-sliding', st.fs_sliding >= st.fs_sliding_target, `FS = ${st.fs_sliding.toFixed(2)} ≥ ${st.fs_sliding_target}`);

    // Eccentricity
    document.getElementById('val-eccentricity').innerText = `e = ${st.eccentricity.toFixed(2)} m`;
    updateBadge('badge-eccentricity', st.eccentricity <= st.eccentricity_limit, st.status_eccentricity);

    // Bearing Capacity
    document.getElementById('val-qmax').innerText = `${st.q_max.toFixed(1)} kPa`;
    updateBadge('badge-bearing', st.status_bearing === 'APROVADO', `q_max ≤ ${st.q_adm.toFixed(0)} kPa`);

    // Top Displacement (Ref v3)
    if (document.getElementById('val-disp-total') && disp.d_total_cm != null) {
        document.getElementById('val-disp-total').innerText = `${disp.d_total_cm.toFixed(2)} cm`;
        updateBadge('badge-displacement', disp.status === 'APROVADO', `d_tot = ${disp.d_total_cm.toFixed(2)} cm (Lim = ${disp.d_limit_cm.toFixed(2)} cm)`);
    }

    // Quantities Section
    const qty = res.quantities || {};
    const structural = res.structural || {};
    if (document.getElementById('res-vol-concrete')) {
        document.getElementById('res-vol-concrete').innerText = qty.concrete_volume_m3_per_m != null ? `${qty.concrete_volume_m3_per_m.toFixed(2)} m³/m` : '-';
    }
    if (document.getElementById('res-weight-concrete')) {
        document.getElementById('res-weight-concrete').innerText = qty.concrete_weight_kN_per_m != null ? `${qty.concrete_weight_kN_per_m.toFixed(1)} kN/m` : '-';
    }

    // Detailed Geotechnical Table
    if (document.getElementById('res-theory-info')) {
        const isCoulomb = (ep.theory || '').toUpperCase() === 'COULOMB';
        document.getElementById('res-theory-info').innerText = isCoulomb
            ? `Coulomb (δ = ${ep.wall_friction_deg != null ? ep.wall_friction_deg.toFixed(1) : '20.0'}°)`
            : 'Rankine (sem atrito no dorso, δ = 0°)';
    }
    if (document.getElementById('res-Ka')) {
        document.getElementById('res-Ka').innerText = ep.Ka != null ? ep.Ka.toFixed(4) : '-';
    }
    document.getElementById('res-base-B').innerText = `${geo.base_width_B.toFixed(2)} m`;
    document.getElementById('res-P-h').innerText = `${ep.total_P_h.toFixed(1)} kN/m`;
    if (document.getElementById('res-P-v')) {
        document.getElementById('res-P-v').innerText = ep.total_P_v != null ? `${ep.total_P_v.toFixed(1)} kN/m` : '0.0 kN/m';
    }
    document.getElementById('res-M-overturning').innerText = `${st.M_overturning.toFixed(1)} kN·m/m`;
    document.getElementById('res-M-resisting').innerText = `${st.M_resisting.toFixed(1)} kN·m/m`;
    document.getElementById('res-R-sliding').innerText = `${st.total_sliding_resistance.toFixed(1)} kN/m`;
    document.getElementById('res-q-toe').innerText = `${st.q_toe.toFixed(1)} kPa`;
    document.getElementById('res-q-heel').innerText = `${st.q_heel.toFixed(1)} kPa`;

    // Soil-Structure Top Displacement Details
    if (document.getElementById('res-ks') && disp.ks_kN_m3 != null) {
        document.getElementById('res-ks').innerText = `${disp.ks_kN_m3.toLocaleString()} kN/m³`;
        document.getElementById('res-k-theta').innerText = `${disp.K_theta_kNm_rad.toLocaleString()} kN·m/rad`;
        document.getElementById('res-d-rot').innerText = `${disp.d_rot_cm.toFixed(2)} cm (${(disp.d_rot_cm / disp.d_total_cm * 100).toFixed(0)}%)`;
        document.getElementById('res-d-trans').innerText = `${disp.d_trans_cm.toFixed(2)} cm (${(disp.d_trans_cm / disp.d_total_cm * 100).toFixed(0)}%)`;
        document.getElementById('res-d-flex').innerText = `${disp.d_flex_cm.toFixed(2)} cm (${(disp.d_flex_cm / disp.d_total_cm * 100).toFixed(0)}%)`;
        document.getElementById('res-d-total-limit').innerText = `${disp.d_total_cm.toFixed(2)} cm ≤ ${disp.d_limit_cm.toFixed(2)} cm (${disp.status})`;
    }

    // Structural Design Forces
    document.getElementById('res-M-stem').innerText = structural.M_stem_base_kNm != null ? `${structural.M_stem_base_kNm.toFixed(1)} kN·m/m` : '-';
    document.getElementById('res-V-stem').innerText = structural.V_stem_base_kN != null ? `${structural.V_stem_base_kN.toFixed(1)} kN/m` : '-';
    if (document.getElementById('res-M-toe')) {
        document.getElementById('res-M-toe').innerText = structural.M_toe_kNm != null ? `${structural.M_toe_kNm.toFixed(1)} kN·m/m` : '-';
    }
    if (document.getElementById('res-M-heel')) {
        document.getElementById('res-M-heel').innerText = structural.M_heel_kNm != null ? `${structural.M_heel_kNm.toFixed(1)} kN·m/m` : '-';
    }

    // Reinforcement NBR 6118 & Detailing
    const reinf = res.reinforcement;
    if (reinf) {
        if (document.getElementById('res-rebar-materials')) {
            document.getElementById('res-rebar-materials').innerText =
                `fck = ${reinf.fck} MPa • CA-${reinf.fyk} • Cobrimentos: ${reinf.haste?.cover || 40}mm / ${reinf.puntera?.cover || 50}mm • γf = ${reinf.gamma_f}`;
        }

        // Haste
        const haste = reinf.haste;
        if (haste) {
            if (document.getElementById('res-haste-h')) document.getElementById('res-haste-h').innerText = `${haste.h.toFixed(2)} m`;
            if (document.getElementById('res-haste-d')) document.getElementById('res-haste-d').innerText = `${haste.d.toFixed(3)} m`;
            if (document.getElementById('res-haste-Md')) document.getElementById('res-haste-Md').innerText = `${haste.Md.toFixed(1)} kN·m/m`;
            if (document.getElementById('res-haste-As-req')) document.getElementById('res-haste-As-req').innerText = `${haste.As_req.toFixed(2)} cm²/m`;
            if (document.getElementById('res-haste-As-min')) document.getElementById('res-haste-As-min').innerText = `${haste.As_min.toFixed(2)} cm²/m`;
            if (document.getElementById('res-haste-As-final')) document.getElementById('res-haste-As-final').innerText = `${haste.As_final.toFixed(2)} cm²/m`;
            if (document.getElementById('badge-rebar-haste')) updateBadge('badge-rebar-haste', !haste.doubly_reinforced, haste.status);
            if (document.getElementById('res-haste-detailing') && haste.detailing) {
                document.getElementById('res-haste-detailing').innerText = `${haste.detailing.text} (As = ${haste.detailing.as_provided.toFixed(2)} cm²/m)`;
            }
        }

        // Puntera
        const puntera = reinf.puntera;
        if (puntera) {
            if (document.getElementById('res-puntera-h')) document.getElementById('res-puntera-h').innerText = `${puntera.h.toFixed(2)} m`;
            if (document.getElementById('res-puntera-d')) document.getElementById('res-puntera-d').innerText = `${puntera.d.toFixed(3)} m`;
            if (document.getElementById('res-puntera-Md')) document.getElementById('res-puntera-Md').innerText = `${puntera.Md.toFixed(1)} kN·m/m`;
            if (document.getElementById('res-puntera-As-req')) document.getElementById('res-puntera-As-req').innerText = `${puntera.As_req.toFixed(2)} cm²/m`;
            if (document.getElementById('res-puntera-As-min')) document.getElementById('res-puntera-As-min').innerText = `${puntera.As_min.toFixed(2)} cm²/m`;
            if (document.getElementById('res-puntera-As-final')) document.getElementById('res-puntera-As-final').innerText = `${puntera.As_final.toFixed(2)} cm²/m`;
            if (document.getElementById('badge-rebar-puntera')) updateBadge('badge-rebar-puntera', !puntera.doubly_reinforced, puntera.status);
            if (document.getElementById('res-puntera-detailing') && puntera.detailing) {
                document.getElementById('res-puntera-detailing').innerText = `${puntera.detailing.text} (As = ${puntera.detailing.as_provided.toFixed(2)} cm²/m)`;
            }
        }

        // Calcanhar
        const calcanhar = reinf.calcanhar;
        if (calcanhar) {
            if (document.getElementById('res-calcanhar-h')) document.getElementById('res-calcanhar-h').innerText = `${calcanhar.h.toFixed(2)} m`;
            if (document.getElementById('res-calcanhar-d')) document.getElementById('res-calcanhar-d').innerText = `${calcanhar.d.toFixed(3)} m`;
            if (document.getElementById('res-calcanhar-Md')) document.getElementById('res-calcanhar-Md').innerText = `${calcanhar.Md.toFixed(1)} kN·m/m`;
            if (document.getElementById('res-calcanhar-As-req')) document.getElementById('res-calcanhar-As-req').innerText = `${calcanhar.As_req.toFixed(2)} cm²/m`;
            if (document.getElementById('res-calcanhar-As-min')) document.getElementById('res-calcanhar-As-min').innerText = `${calcanhar.As_min.toFixed(2)} cm²/m`;
            if (document.getElementById('res-calcanhar-As-final')) document.getElementById('res-calcanhar-As-final').innerText = `${calcanhar.As_final.toFixed(2)} cm²/m`;
            if (document.getElementById('badge-rebar-calcanhar')) updateBadge('badge-rebar-calcanhar', !calcanhar.doubly_reinforced, calcanhar.status);
            if (document.getElementById('res-calcanhar-detailing') && calcanhar.detailing) {
                document.getElementById('res-calcanhar-detailing').innerText = `${calcanhar.detailing.text} (As = ${calcanhar.detailing.as_provided.toFixed(2)} cm²/m)`;
            }
        }

        // Shear Check
        const shear = reinf.shear;
        if (shear) {
            if (document.getElementById('res-shear-info')) {
                document.getElementById('res-shear-info').innerText = `Vd = ${shear.Vd_kN.toFixed(1)} kN • τv = ${shear.tau_v_MPa.toFixed(2)} MPa ≤ τlim = ${shear.tau_lim_MPa.toFixed(2)} MPa`;
            }
            if (document.getElementById('badge-shear')) {
                updateBadge('badge-shear', shear.status === 'APROVADO', `τv ≤ ${shear.tau_lim_MPa.toFixed(2)} MPa`);
            }
        }

        // Quantities & Detailing summary
        const qties = reinf.quantities;
        if (qties) {
            if (document.getElementById('res-total-steel-kg')) {
                document.getElementById('res-total-steel-kg').innerText = `${qties.total_steel_kg_per_m.toFixed(1)}`;
            }
            if (document.getElementById('res-steel-ratio')) {
                document.getElementById('res-steel-ratio').innerText = `${qties.steel_ratio_kg_m3.toFixed(1)}`;
            }
        }
        if (reinf.haste_horizontal?.detailing && document.getElementById('res-haste-horiz')) {
            document.getElementById('res-haste-horiz').innerText = `${reinf.haste_horizontal.detailing.text}`;
        }
        if (reinf.haste_frontal?.detailing && document.getElementById('res-haste-front')) {
            document.getElementById('res-haste-front').innerText = `${reinf.haste_frontal.detailing.text}`;
        }
    }
}

function loadReferenceMemoV3() {
    document.getElementById('stem_height').value = 4.73;
    document.getElementById('base_thickness').value = 0.70;
    document.getElementById('stem_top_width').value = 0.70;
    document.getElementById('stem_bot_width').value = 1.50;
    document.getElementById('toe_length').value = 1.00;
    document.getElementById('heel_length').value = 4.25;
    document.getElementById('stem_front_batter').value = 0.0;

    document.getElementById('gamma_soil').value = 20.0;
    document.getElementById('phi_soil').value = 30.0;
    document.getElementById('backfill_slope').value = 0.0;
    document.getElementById('q_surcharge').value = 58.0;
    document.getElementById('water_height').value = 0.0;
    document.getElementById('theory').value = 'rankine';

    document.getElementById('toe_embedment').value = 1.0;
    document.getElementById('gamma_front').value = 20.0;
    document.getElementById('phi_front').value = 30.0;
    document.getElementById('use_passive').checked = true;

    document.getElementById('phi_found').value = 30.0;
    document.getElementById('cohesion_found').value = 0.0;
    document.getElementById('q_adm').value = 200.0;
    document.getElementById('base_soil_type').value = 'Silte';
    document.getElementById('base_spt').value = 15;

    if (document.getElementById('has_key')) {
        document.getElementById('has_key').checked = false;
        toggleKeyOptions();
    }

    triggerCalculation();
}

function updateBadge(badgeId, isPass, text) {
    const badge = document.getElementById(badgeId);
    badge.innerText = isPass ? 'APROVADO' : 'REPROVADO';
    badge.title = text;
    if (isPass) {
        badge.className = 'inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30';
    } else {
        badge.className = 'inline-block px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30';
    }
}

/**
 * CAD-Style Dimensioning Helper Function (Linha de Cota Profissional)
 */
function drawDimension(ctx, p1, p2, offsetPx, label, isVertical = false, color = '#94a3b8') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2;

    let x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    let cx1, cy1, cx2, cy2;

    if (isVertical) {
        cx1 = x1 + offsetPx;
        cy1 = y1;
        cx2 = x2 + offsetPx;
        cy2 = y2;
    } else {
        cx1 = x1;
        cy1 = y1 + offsetPx;
        cx2 = x2;
        cy2 = y2 + offsetPx;
    }

    // 1. Linhas de Chamada (Extension Lines) com folga inicial do objeto
    const extOver = 4;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    if (isVertical) {
        const dir = Math.sign(offsetPx) || 1;
        ctx.moveTo(x1 + dir * 2, y1);
        ctx.lineTo(cx1 + dir * extOver, cy1);
        ctx.moveTo(x2 + dir * 2, y2);
        ctx.lineTo(cx2 + dir * extOver, cy2);
    } else {
        const dir = Math.sign(offsetPx) || 1;
        ctx.moveTo(x1, y1 + dir * 2);
        ctx.lineTo(cx1, cy1 + dir * extOver);
        ctx.moveTo(x2, y2 + dir * 2);
        ctx.lineTo(cx2, cy2 + dir * extOver);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Linha de Cota Principal
    ctx.beginPath();
    ctx.moveTo(cx1, cy1);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();

    // 3. Ticks Arquitetônicos a 45 graus (Norma ABNT/CAD)
    const tickLen = 4.5;
    const drawTick = (x, y) => {
        ctx.beginPath();
        ctx.moveTo(x - tickLen, y + tickLen);
        ctx.lineTo(x + tickLen, y - tickLen);
        ctx.stroke();
    };
    drawTick(cx1, cy1);
    drawTick(cx2, cy2);

    // 4. Texto da Cota em Pill Badge de Alto Contraste
    const midX = (cx1 + cx2) / 2;
    const midY = (cy1 + cy2) / 2;

    ctx.font = 'bold 10px Inter, monospace';
    const textWidth = ctx.measureText(label).width;
    const padX = 5, padY = 3;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(midX - textWidth / 2 - padX, midY - 7 - padY, textWidth + padX * 2, 14 + padY * 2, 4);
    } else {
        ctx.rect(midX - textWidth / 2 - padX, midY - 7 - padY, textWidth + padX * 2, 14 + padY * 2);
    }
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY);

    ctx.restore();
}

/**
 * HTML5 2D Canvas Retaining Wall Drawing Engine (Design CAD Premium)
 */
function drawWallCanvas(inputs, res) {
    const canvas = document.getElementById('wallCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Resize canvas dynamically to parent container size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * (window.devicePixelRatio || 1);
    canvas.height = rect.height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    const width = rect.width;
    const height = rect.height;

    // Clear Background with rich engineering dark slate & RS2 CAD Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, width, height, true);
        EngCAD.drawGrid(ctx, width, height, { step: 30, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0b1329';
        ctx.fillRect(0, 0, width, height);
    }

    // Geometry Variables
    const H_stem = inputs.stem_height;
    const t_base = inputs.base_thickness;
    const L_toe = inputs.toe_length;
    const L_heel = inputs.heel_length;
    const b_bot = inputs.stem_bot_width;
    const b_top = inputs.stem_top_width;
    const b_front = inputs.stem_front_batter;
    const B = L_toe + b_bot + L_heel;
    const beta_rad = (inputs.backfill_slope || 0) * Math.PI / 180.0;
    const H_slope = L_heel * Math.tan(beta_rad);
    const H_total = H_stem + t_base + H_slope;
    const key_d = inputs.has_key ? inputs.key_depth : 0.0;
    const key_w = inputs.has_key ? inputs.key_width : 0.0;
    const key_pos = inputs.has_key ? inputs.key_pos : 0.0;

    // Dynamic Model Bounding Box (in meters) to center wall cleanly on wide viewports:
    // Left: dimension lines & front soil (~ -1.6m)
    // Right: backfill & active pressure vectors (~ B + 1.8m)
    // Bottom: shear key & contact pressure distribution (~ -(key_d + 1.4m))
    // Top: surcharge arrows & crest (~ H_total + 1.2m)
    const modelMinX = -1.6;
    const modelMaxX = B + 1.8;
    const modelMinY = -(key_d + 1.4);
    const modelMaxY = H_total + 1.2;

    const modelW = Math.max(1.0, modelMaxX - modelMinX);
    const modelH = Math.max(1.0, modelMaxY - modelMinY);

    const padX = 35;
    const padY = 35;
    const availW = Math.max(100, width - 2 * padX);
    const availH = Math.max(100, height - 2 * padY);

    const scale = Math.min(availW / modelW, availH / modelH);

    // Center the model in the canvas
    const modelMidX = (modelMinX + modelMaxX) / 2;
    const modelMidY = (modelMinY + modelMaxY) / 2;

    const originX = (width / 2) - modelMidX * scale;
    const originY = (height / 2) + modelMidY * scale;

    const toPxX = (x) => originX + x * scale;
    const toPxY = (y) => originY - y * scale;
    const P = (x, y) => ({ x: toPxX(x), y: toPxY(y) });

    // Geotechnical Ground Surface Hatch Helper
    const drawGroundSurface = (x1, y1, x2, y2, color = '#64748b') => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const len = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const step = 14;
        const tick = 6;
        ctx.lineWidth = 1.0;
        ctx.strokeStyle = color;
        for (let s = 4; s < len - 4; s += step) {
            const px = x1 + s * Math.cos(angle);
            const py = y1 + s * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + tick * Math.cos(angle + Math.PI / 4), py + tick * Math.sin(angle + Math.PI / 4));
            ctx.stroke();
        }
        ctx.restore();
    };

    // 1. Draw Foundation Soil Below Base
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.rect(0, toPxY(0), width, height - toPxY(0));
    ctx.fill();

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, toPxY(0));
    ctx.lineTo(width, toPxY(0));
    ctx.stroke();

    // 1.5 Draw Front Soil Layer (Aterro Frontal / Passivo)
    const H_front = inputs.toe_embedment;
    if (H_front > 0) {
        const frontGrad = ctx.createLinearGradient(toPxX(-1.5), toPxY(0), toPxX(L_toe), toPxY(0));
        frontGrad.addColorStop(0, 'rgba(20, 184, 166, 0.10)');
        frontGrad.addColorStop(1, 'rgba(20, 184, 166, 0.25)');

        ctx.fillStyle = frontGrad;
        ctx.beginPath();
        ctx.moveTo(toPxX(-1.5), toPxY(0));
        ctx.lineTo(toPxX(-1.5), toPxY(t_base + H_front));
        ctx.lineTo(toPxX(L_toe), toPxY(t_base + H_front));
        ctx.lineTo(toPxX(L_toe), toPxY(t_base));
        ctx.lineTo(toPxX(0), toPxY(t_base));
        ctx.lineTo(toPxX(0), toPxY(0));
        ctx.closePath();
        ctx.fill();

        // Top Surface of Front Soil with ground symbols
        drawGroundSurface(toPxX(-1.5), toPxY(t_base + H_front), toPxX(L_toe), toPxY(t_base + H_front), '#14b8a6');

        // Front Soil Label cleanly placed to the left
        const lblFrontX = toPxX(-0.8);
        const lblFrontY = toPxY(t_base + H_front) - 12;
        ctx.font = 'bold 10px Inter, sans-serif';
        const fw = ctx.measureText(`Aterro Frontal (${H_front.toFixed(2)}m)`).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lblFrontX - fw / 2 - 5, lblFrontY - 8, fw + 10, 16, 4);
        else ctx.rect(lblFrontX - fw / 2 - 5, lblFrontY - 8, fw + 10, 16);
        ctx.fill();
        ctx.strokeStyle = '#14b8a6';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.fillStyle = '#2dd4bf';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Aterro Frontal (${H_front.toFixed(2)}m)`, lblFrontX, lblFrontY);
    }

    // 2. Draw Backfill Soil behind wall stem
    const x_stem_back_base = L_toe + b_bot;
    const x_stem_top_front = L_toe + b_front;
    const x_stem_top_back = x_stem_top_front + b_top;

    const backfillGrad = ctx.createLinearGradient(toPxX(x_stem_back_base), toPxY(t_base), toPxX(B + 1.2), toPxY(t_base));
    backfillGrad.addColorStop(0, 'rgba(217, 119, 6, 0.22)');
    backfillGrad.addColorStop(1, 'rgba(180, 83, 9, 0.12)');

    ctx.fillStyle = backfillGrad;
    ctx.beginPath();
    ctx.moveTo(toPxX(x_stem_back_base), toPxY(t_base));
    ctx.lineTo(toPxX(x_stem_top_back), toPxY(t_base + H_stem));
    ctx.lineTo(toPxX(B + 0.8), toPxY(t_base + H_stem + (L_heel + 0.8) * Math.tan(beta_rad)));
    ctx.lineTo(toPxX(B + 0.8), toPxY(t_base));
    ctx.lineTo(toPxX(B), toPxY(t_base));
    ctx.closePath();
    ctx.fill();

    // Subtle 45 deg soil hatching in backfill
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toPxX(x_stem_back_base), toPxY(t_base));
    ctx.lineTo(toPxX(x_stem_top_back), toPxY(t_base + H_stem));
    ctx.lineTo(toPxX(B + 0.8), toPxY(t_base + H_stem + (L_heel + 0.8) * Math.tan(beta_rad)));
    ctx.lineTo(toPxX(B + 0.8), toPxY(t_base));
    ctx.lineTo(toPxX(B), toPxY(t_base));
    ctx.closePath();
    ctx.clip();
    for (let hx = toPxX(x_stem_top_front) - 100; hx < toPxX(B + 1.5); hx += 22) {
        ctx.beginPath();
        ctx.moveTo(hx, toPxY(t_base + H_stem + 1.5));
        ctx.lineTo(hx + 120, toPxY(t_base - 1.0));
        ctx.stroke();
    }
    ctx.restore();

    // Draw Backfill Top Ground Surface with CAD symbols
    drawGroundSurface(
        toPxX(x_stem_top_back), toPxY(t_base + H_stem),
        toPxX(B + 0.8), toPxY(t_base + H_stem + (L_heel + 0.8) * Math.tan(beta_rad)),
        '#f59e0b'
    );

    // 3. Draw Water Table (if any)
    if (inputs.water_height > 0) {
        const H_w = Math.min(inputs.water_height, H_total);
        if (H_w > t_base) {
            const h_water_soil = H_w - t_base;
            ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
            ctx.fillRect(toPxX(x_stem_back_base), toPxY(H_w), (B - x_stem_back_base) * scale, h_water_soil * scale);
        }

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(toPxX(x_stem_back_base), toPxY(H_w));
        ctx.lineTo(toPxX(B + 0.8), toPxY(H_w));
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 4. Draw Concrete Retaining Wall Polygon with rich architectural gradient
    const wallGrad = ctx.createLinearGradient(toPxX(0), toPxY(t_base + H_stem), toPxX(0), toPxY(0));
    wallGrad.addColorStop(0, '#2563eb');
    wallGrad.addColorStop(1, '#1d4ed8');

    ctx.fillStyle = wallGrad;
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 2.2;

    ctx.beginPath();
    ctx.moveTo(toPxX(0), toPxY(0));
    ctx.lineTo(toPxX(0), toPxY(t_base));
    ctx.lineTo(toPxX(L_toe), toPxY(t_base));
    ctx.lineTo(toPxX(x_stem_top_front), toPxY(t_base + H_stem));
    ctx.lineTo(toPxX(x_stem_top_back), toPxY(t_base + H_stem));
    ctx.lineTo(toPxX(x_stem_back_base), toPxY(t_base));
    ctx.lineTo(toPxX(B), toPxY(t_base));
    ctx.lineTo(toPxX(B), toPxY(0));

    // Base Shear Key
    if (inputs.has_key && key_d > 0 && key_w > 0) {
        const k_start = key_pos;
        const k_end = key_pos + key_w;
        ctx.lineTo(toPxX(k_end), toPxY(0));
        ctx.lineTo(toPxX(k_end), toPxY(-key_d));
        ctx.lineTo(toPxX(k_start), toPxY(-key_d));
        ctx.lineTo(toPxX(k_start), toPxY(0));
    }

    ctx.lineTo(toPxX(0), toPxY(0));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle construction joint dashed line between stem and footing base
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(toPxX(L_toe), toPxY(t_base));
    ctx.lineTo(toPxX(x_stem_back_base), toPxY(t_base));
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Draw Surcharge Arrows (if q > 0)
    if (inputs.q_surcharge > 0) {
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = '#ef4444';
        ctx.lineWidth = 1.6;

        const numArrows = 5;
        const arrowStep = L_heel / numArrows;
        for (let i = 0; i <= numArrows; i++) {
            const ax = x_stem_back_base + i * arrowStep;
            const ay_base = t_base + H_stem + (i * arrowStep) * Math.tan(beta_rad);
            const ay_top = ay_base + 0.65;

            ctx.beginPath();
            ctx.moveTo(toPxX(ax), toPxY(ay_top));
            ctx.lineTo(toPxX(ax), toPxY(ay_base + 0.05));
            ctx.stroke();

            // Arrow head
            ctx.beginPath();
            ctx.moveTo(toPxX(ax) - 3.5, toPxY(ay_base + 0.05) - 6);
            ctx.lineTo(toPxX(ax), toPxY(ay_base + 0.05));
            ctx.lineTo(toPxX(ax) + 3.5, toPxY(ay_base + 0.05) - 6);
            ctx.fill();
        }

        // Pill badge for q
        const qX = toPxX(x_stem_back_base + L_heel / 2);
        const qY = toPxY(t_base + H_stem + H_slope + 0.85);
        ctx.font = 'bold 11px Inter, sans-serif';
        const qw = ctx.measureText(`q = ${inputs.q_surcharge} kPa`).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(qX - qw / 2 - 6, qY - 9, qw + 12, 18, 5);
        else ctx.rect(qX - qw / 2 - 6, qY - 9, qw + 12, 18);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`q = ${inputs.q_surcharge} kPa`, qX, qY);
    }

    // 6. Draw Active Pressure Resultant Force Arrow (P_a,h & P_a,v)
    if (res && res.earth_pressures) {
        const ep = res.earth_pressures;
        const P_h = ep.total_P_h;
        const P_v = ep.total_P_v || 0.0;
        const isCoulomb = (ep.theory || '').toUpperCase() === 'COULOMB' && P_v > 0.01;

        ctx.strokeStyle = '#f43f5e';
        ctx.fillStyle = '#f43f5e';
        ctx.lineWidth = 2.2;

        const arrowY = t_base + H_stem / 3.0;
        const arrowX_end = isCoulomb ? x_stem_back_base : B;
        const arrowLen = 65;
        const endPxX = toPxX(arrowX_end);
        const endPxY = toPxY(arrowY);
        const startPxX = endPxX + arrowLen;
        const startPxY = isCoulomb ? endPxY - (arrowLen * Math.tan(Math.min(0.7, (ep.angle_force_deg || 20) * Math.PI / 180))) : endPxY;

        ctx.beginPath();
        ctx.moveTo(startPxX, startPxY);
        ctx.lineTo(endPxX, endPxY);
        ctx.stroke();

        // Arrowhead
        const angleArr = Math.atan2(endPxY - startPxY, endPxX - startPxX);
        const ahSize = 9;
        ctx.beginPath();
        ctx.moveTo(endPxX, endPxY);
        ctx.lineTo(endPxX - ahSize * Math.cos(angleArr - Math.PI / 6), endPxY - ahSize * Math.sin(angleArr - Math.PI / 6));
        ctx.lineTo(endPxX - ahSize * Math.cos(angleArr + Math.PI / 6), endPxY - ahSize * Math.sin(angleArr + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        // Pill badge for Pa placed neatly to the right
        const paText = isCoulomb
            ? `P_a = ${(Math.sqrt(P_h ** 2 + P_v ** 2)).toFixed(1)} kN/m (δ=${ep.wall_friction_deg}°)`
            : `P_a,h = ${P_h.toFixed(1)} kN/m (Rankine, Ka=${ep.Ka.toFixed(3)})`;
        ctx.font = 'bold 10px Inter, sans-serif';
        const paw = ctx.measureText(paText).width;
        const pax = startPxX + 8;
        const pay = startPxY;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(pax, pay - 10, paw + 14, 20, 5);
        else ctx.rect(pax, pay - 10, paw + 14, 20);
        ctx.fill();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#fda4af';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(paText, pax + 7, pay);
    }

    // Passive Earth Force Vector (P_p)
    if (res && res.earth_pressures && res.earth_pressures.use_passive && res.earth_pressures.P_passive_used > 0) {
        const P_p = res.earth_pressures.P_passive_used;
        ctx.strokeStyle = '#10b981';
        ctx.fillStyle = '#10b981';
        ctx.lineWidth = 2.2;

        const arrowY = (inputs.toe_embedment + key_d) / 3.0;
        const arrowX_start = -0.8;
        const arrowX_end = 0;

        ctx.beginPath();
        ctx.moveTo(toPxX(arrowX_start), toPxY(arrowY));
        ctx.lineTo(toPxX(arrowX_end), toPxY(arrowY));
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(toPxX(arrowX_end) - 8, toPxY(arrowY) - 5);
        ctx.lineTo(toPxX(arrowX_end), toPxY(arrowY));
        ctx.lineTo(toPxX(arrowX_end) - 8, toPxY(arrowY) + 5);
        ctx.fill();

        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`P_p = ${P_p.toFixed(1)} kN/m`, toPxX(arrowX_start) - 4, toPxY(arrowY) + 4);
    }

    // ====================================================================
    // 7. TECHNICAL CAD DIMENSION LINES (ESTRUTURA EM FAIXAS NÃO COLIDENTES)
    // ====================================================================

    // Cota 1: Altura da Haste (Faixa 1 interna à esquerda: offset -25px)
    drawDimension(ctx, P(L_toe, t_base), P(L_toe, t_base + H_stem), -25, `${H_stem.toFixed(2)} m`, true, '#38bdf8');

    // Cota 2: Espessura da Sapata (Faixa 1 interna: offset -25px)
    drawDimension(ctx, P(0, 0), P(0, t_base), -25, `${t_base.toFixed(2)} m`, true, '#e2e8f0');

    // Cota 3: Altura Total da Parede (Faixa 2 intermediária: offset -55px)
    drawDimension(ctx, P(0, 0), P(0, t_base + H_stem), -55, `H = ${(H_stem + t_base).toFixed(2)} m`, true, '#f59e0b');

    // Cota 4: Altura do Solo Frontal D_f (Faixa 3 externa: no limite do aterro frontal x = -1.2)
    // Ficando em x = -1.2 com offset -16px, fica a mais de 50px de distância de t_base, eliminando a colisão "0.50 m m"
    if (inputs.toe_embedment > 0) {
        drawDimension(ctx, P(-1.2, 0), P(-1.2, inputs.toe_embedment), -16, `D_f = ${inputs.toe_embedment.toFixed(2)} m`, true, '#14b8a6');
    }

    // Cota 5: Largura do Topo da Haste (Acima do topo: offset negativo em Y de tela)
    drawDimension(ctx, P(x_stem_top_front, t_base + H_stem), P(x_stem_top_back, t_base + H_stem), -22, `${b_top.toFixed(2)} m`, false, '#38bdf8');

    // ====================================================================
    // COTAS INFERIORES: Linha 1 (+24px componentes) e Linha 2 (+48px total)
    // ====================================================================
    // Linha 1: Puntera, Base Haste e Calcanhar
    if (L_toe > 0.001) {
        drawDimension(ctx, P(0, 0), P(L_toe, 0), 24, `${L_toe.toFixed(2)} m`, false, '#e2e8f0');
    }
    if (b_bot > 0.001) {
        drawDimension(ctx, P(L_toe, 0), P(x_stem_back_base, 0), 24, `${b_bot.toFixed(2)} m`, false, '#60a5fa');
    }
    if (L_heel > 0.001) {
        drawDimension(ctx, P(x_stem_back_base, 0), P(B, 0), 24, `${L_heel.toFixed(2)} m`, false, '#e2e8f0');
    }

    // Linha 2: Largura Total da Base B
    drawDimension(ctx, P(0, 0), P(B, 0), 48, `B = ${B.toFixed(2)} m`, false, '#f59e0b');

    // Cotas do Dente de Cisalhamento (se ativo)
    if (inputs.has_key && key_d > 0 && key_w > 0) {
        const k_start = key_pos;
        const k_end = key_pos + key_w;
        drawDimension(ctx, P(k_start, 0), P(k_start, -key_d), -18, `${key_d.toFixed(2)} m`, true, '#c084fc');
        drawDimension(ctx, P(k_start, -key_d), P(k_end, -key_d), 20, `${key_w.toFixed(2)} m`, false, '#c084fc');
    }

    // ====================================================================
    // 8. DIAGRAMA DE PRESSÃO DE CONTATO NO SOLO (BASE ISOLADA LIMPA)
    // ====================================================================
    if (res && res.stability) {
        const q_toe = res.stability.q_toe;
        const q_heel = res.stability.q_heel;
        const max_q = res.stability.q_max;
        const q_adm = inputs.q_adm || 200.0;

        if (max_q > 0) {
            // Linha de base dedicada posicionada ABAIXO das cotas inferiores
            const pressBaseY = toPxY(0) + (inputs.has_key ? Math.max(key_d * scale, 0) + 72 : 75);

            // Eixo de referência
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(toPxX(0) - 15, pressBaseY);
            ctx.lineTo(toPxX(B) + 15, pressBaseY);
            ctx.stroke();

            // Marcas nos extremos da sapata
            ctx.beginPath();
            ctx.moveTo(toPxX(0), pressBaseY - 4);
            ctx.lineTo(toPxX(0), pressBaseY + 4);
            ctx.moveTo(toPxX(B), pressBaseY - 4);
            ctx.lineTo(toPxX(B), pressBaseY + 4);
            ctx.stroke();

            // Altura do trapézio
            const maxTrapH = 32;
            const qRef = Math.max(max_q, q_adm, 1.0);
            const h_toe_px = (q_toe / qRef) * maxTrapH;
            const h_heel_px = (q_heel / qRef) * maxTrapH;

            // Preenchimento gradiente elegante
            const trapGrad = ctx.createLinearGradient(toPxX(0), pressBaseY, toPxX(B), pressBaseY);
            trapGrad.addColorStop(0, q_toe <= q_adm ? 'rgba(59, 130, 246, 0.35)' : 'rgba(239, 68, 68, 0.40)');
            trapGrad.addColorStop(1, q_heel >= 0 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.40)');

            ctx.fillStyle = trapGrad;
            ctx.beginPath();
            ctx.moveTo(toPxX(0), pressBaseY);
            ctx.lineTo(toPxX(0), pressBaseY + h_toe_px);
            ctx.lineTo(toPxX(B), pressBaseY + h_heel_px);
            ctx.lineTo(toPxX(B), pressBaseY);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = q_toe <= q_adm ? '#38bdf8' : '#f43f5e';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(toPxX(0), pressBaseY + h_toe_px);
            ctx.lineTo(toPxX(B), pressBaseY + h_heel_px);
            ctx.stroke();

            // Setas verticais de compressão
            const numPressArrows = 6;
            const pStep = B / numPressArrows;
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
            ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
            ctx.lineWidth = 1.0;
            for (let i = 0; i <= numPressArrows; i++) {
                const pxX = toPxX(i * pStep);
                const frac = i / numPressArrows;
                const pY_end = pressBaseY + h_toe_px + frac * (h_heel_px - h_toe_px);
                if (pY_end > pressBaseY + 3) {
                    ctx.beginPath();
                    ctx.moveTo(pxX, pressBaseY);
                    ctx.lineTo(pxX, pY_end);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(pxX - 2.5, pY_end - 4);
                    ctx.lineTo(pxX, pY_end);
                    ctx.lineTo(pxX + 2.5, pY_end - 4);
                    ctx.fill();
                }
            }

            // Badges para Tensões no Solo
            const drawStressBadge = (text, x, y, isSafe) => {
                ctx.font = 'bold 10px Inter, monospace';
                const tw = ctx.measureText(text).width;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(x - tw / 2 - 6, y - 8, tw + 12, 17, 4);
                else ctx.rect(x - tw / 2 - 6, y - 8, tw + 12, 17);
                ctx.fill();
                ctx.strokeStyle = isSafe ? '#34d399' : '#f87171';
                ctx.lineWidth = 1.0;
                ctx.stroke();
                ctx.fillStyle = isSafe ? '#a7f3d0' : '#fca5a5';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(text, x, y);
            };

            const toeSafe = q_toe <= q_adm;
            const heelSafe = q_heel >= 0;
            drawStressBadge(`σ_toe = ${q_toe.toFixed(1)} kPa`, toPxX(0) + 18, pressBaseY + h_toe_px + 14, toeSafe);
            drawStressBadge(`σ_heel = ${q_heel.toFixed(1)} kPa`, toPxX(B) - 18, pressBaseY + h_heel_px + 14, heelSafe);

            // Eccentricity Check Badge
            const eVal = res.stability.eccentricity ?? res.stability.e;
            const eLimit = B / 6.0;
            const eSafe = (eVal != null) && (eVal <= eLimit);
            if (eVal != null) {
                drawStressBadge(`e = ${eVal.toFixed(2)}m (≤ B/6 = ${eLimit.toFixed(2)}m ${eSafe ? '✓' : '⚠'})`, toPxX(B / 2), pressBaseY - 14, eSafe);
            }
        }
    }

    // ====================================================================
    // 9. ESTIMATED REINFORCEMENT SCHEMATIC (NBR 6118)
    // ====================================================================
    const showRebar = document.getElementById('toggle-rebar-view')?.checked;
    if (showRebar && res && res.reinforcement) {
        const reinf = res.reinforcement;
        const c_stem = (inputs.cover_stem || 40) / 1000.0;
        const c_base = (inputs.cover_base || 50) / 1000.0;

        ctx.save();

        // 1. Stem Main Vertical Rebar (Face Tracionada Posterior)
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.8;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const barX_top = x_stem_top_back - c_stem;
        const barY_top = t_base + H_stem - c_stem;
        const barX_bot = x_stem_back_base - c_stem;
        const barY_bot = c_base + 0.04;
        const hookX_heel = Math.min(B - c_base, barX_bot + 0.55);

        ctx.beginPath();
        ctx.moveTo(toPxX(barX_top), toPxY(barY_top));
        ctx.lineTo(toPxX(barX_bot), toPxY(barY_bot));
        ctx.lineTo(toPxX(hookX_heel), toPxY(barY_bot));
        ctx.stroke();

        // 2. Stem Front Face Bar (Face Frontal)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.8;
        const frontBarX_top = x_stem_top_front + c_stem;
        const frontBarX_bot = L_toe + b_front + c_stem;
        const hookX_toe = Math.max(c_base, frontBarX_bot - 0.35);

        ctx.beginPath();
        ctx.moveTo(toPxX(frontBarX_top), toPxY(barY_top));
        ctx.lineTo(toPxX(frontBarX_bot), toPxY(barY_bot));
        ctx.lineTo(toPxX(hookX_toe), toPxY(barY_bot));
        ctx.stroke();

        // 3. Toe Bottom Rebar (Puntera)
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2.2;
        const toeX_left = c_base;
        const toeX_right = Math.min(B - c_base, L_toe + b_bot * 0.7);
        const toeY_bar = c_base;

        ctx.beginPath();
        ctx.moveTo(toPxX(toeX_left), toPxY(t_base - c_base));
        ctx.lineTo(toPxX(toeX_left), toPxY(toeY_bar));
        ctx.lineTo(toPxX(toeX_right), toPxY(toeY_bar));
        ctx.stroke();

        // 4. Heel Top Rebar (Calcanhar)
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2.2;
        const heelX_left = Math.max(c_base, L_toe + b_bot * 0.2);
        const heelX_right = B - c_base;
        const heelY_bar = t_base - c_base;

        ctx.beginPath();
        ctx.moveTo(toPxX(heelX_left), toPxY(heelY_bar));
        ctx.lineTo(toPxX(heelX_right), toPxY(heelY_bar));
        ctx.lineTo(toPxX(heelX_right), toPxY(c_base));
        ctx.stroke();

        // 5. Horizontal Distribution Dots along Stem (espaçamento realista e elegante)
        ctx.fillStyle = '#fbbf24';
        const numDistBars = Math.max(3, Math.floor(H_stem / 0.40));
        for (let i = 1; i <= numDistBars; i++) {
            const frac = i / (numDistBars + 1);
            const dotY = t_base + frac * H_stem;
            const dotX_back = barX_bot + frac * (barX_top - barX_bot) - 0.03;
            const dotX_front = frontBarX_bot + frac * (frontBarX_top - frontBarX_bot) + 0.03;

            [dotX_back, dotX_front].forEach(dx => {
                ctx.beginPath();
                ctx.arc(toPxX(dx), toPxY(dotY), 2.5, 0, 2 * Math.PI);
                ctx.fill();
            });
        }

        // 6. Longitudinal Distribution Dots in Footing
        const numFootingDots = Math.max(3, Math.floor(B / 0.45));
        for (let i = 1; i <= numFootingDots; i++) {
            const dotX = c_base + (i / (numFootingDots + 1)) * (B - 2 * c_base);
            ctx.beginPath();
            ctx.arc(toPxX(dotX), toPxY(c_base + 0.035), 2.2, 0, 2 * Math.PI);
            ctx.fill();
            if (dotX > x_stem_back_base) {
                ctx.beginPath();
                ctx.arc(toPxX(dotX), toPxY(t_base - c_base - 0.035), 2.2, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // Leader Lines & Callout Badges
        const drawCalloutWithLeader = (text, targetX, targetY, boxX, boxY, color, strokeColor) => {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(targetX, targetY);
            const elbowX = (targetX + boxX) / 2;
            ctx.lineTo(elbowX, boxY);
            ctx.lineTo(boxX, boxY);
            ctx.stroke();

            // Ponto de fixação na armadura
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(targetX, targetY, 3.2, 0, 2 * Math.PI);
            ctx.fill();

            // Pill box
            ctx.font = 'bold 10px Inter, sans-serif';
            const tw = ctx.measureText(text).width;
            const padX = 6;
            const bw = tw + padX * 2;
            const bh = 17;
            const bx = boxX > targetX ? boxX : boxX - bw;
            const by = boxY - bh / 2;

            ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
            else ctx.rect(bx, by, bw, bh);
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.0;
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, bx + padX, boxY);
        };

        // Callout 1: Haste (aponta para a barra tracionada, estende para o solo limpo)
        if (reinf.haste?.detailing) {
            const tgtX = toPxX(barX_bot + 0.55 * (barX_top - barX_bot));
            const tgtY = toPxY(t_base + 0.55 * H_stem);
            const bxX = tgtX + 45;
            const bxY = tgtY - 16;
            drawCalloutWithLeader(`Haste: ${reinf.haste.detailing.text}`, tgtX, tgtY, bxX, bxY, '#fda4af', '#f43f5e');
        }

        // Callout 2: Puntera (aponta para a armadura inferior da puntera)
        if (reinf.puntera?.detailing && L_toe > 0.3) {
            const tgtX = toPxX(L_toe * 0.4);
            const tgtY = toPxY(c_base);
            const bxX = toPxX(0) - 22;
            const bxY = toPxY(t_base * 0.5);
            drawCalloutWithLeader(`Puntera: ${reinf.puntera.detailing.text}`, tgtX, tgtY, bxX, bxY, '#a5b4fc', '#6366f1');
        }

        // Callout 3: Calcanhar (aponta para a armadura superior do calcanhar)
        if (reinf.calcanhar?.detailing && L_heel > 0.3) {
            const tgtX = toPxX(x_stem_back_base + L_heel * 0.5);
            const tgtY = toPxY(t_base - c_base);
            const bxX = tgtX + 25;
            const bxY = toPxY(t_base + 0.35 * H_stem);
            drawCalloutWithLeader(`Calcanhar: ${reinf.calcanhar.detailing.text}`, tgtX, tgtY, bxX, bxY, '#e879f9', '#c084fc');
        }

        ctx.restore();
    }

    if (typeof EngCAD !== 'undefined' && canvas.parentElement && res && res.stability) {
        EngCAD.updateHUD(canvas.parentElement, 'Muro de Arrimo (Estabilidade)', [
            { label: 'Geometria (H / B)', value: `${(H_stem + t_base).toFixed(2)}m / ${B.toFixed(2)}m` },
            { label: 'FS Tombamento', value: `${res.stability.fs_overturning.toFixed(2)}`, color: res.stability.fs_overturning >= 1.5 ? '#10b981' : '#f43f5e' },
            { label: 'FS Deslizamento', value: `${res.stability.fs_sliding.toFixed(2)}`, color: res.stability.fs_sliding >= 1.5 ? '#10b981' : '#f43f5e' },
            { label: 'q_max / q_adm', value: `${res.stability.q_max.toFixed(1)} / ${(inputs.q_adm || 200).toFixed(0)} kPa` }
        ]);
    }
}

/**
 * Save Project Data to JSON File
 */
function saveProjectJSON() {
    const inputs = getFormInputs();
    const data = {
        app: "RetainingWallCalculator",
        version: "1.0",
        timestamp: new Date().toISOString(),
        inputs: inputs
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `muro_arrimo_projeto_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Load Project Data from Uploaded JSON File
 */
function loadProjectJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            const inputs = data.inputs || data; // handle direct inputs or wrapped format

            // Populate all form elements by ID
            for (const [key, value] of Object.entries(inputs)) {
                const el = document.getElementById(key);
                if (el) {
                    if (el.type === 'checkbox') {
                        el.checked = Boolean(value);
                    } else {
                        el.value = value;
                    }
                }
            }

            // Sync conditional UI elements
            toggleKeyOptions();

            // Trigger recalculation and redraw
            triggerCalculation();

            // Reset file input so user can reload same file if desired
            event.target.value = '';

            alert('Projeto de Muro de Arrimo carregado com sucesso!');
        } catch (err) {
            console.error("Error loading JSON file:", err);
            alert("Erro ao ler o arquivo JSON. Certifique-se de que é um arquivo válido de projeto.");
        }
    };
    reader.readAsText(file);
}

/**
 * Export Current Retaining Wall Model to RS2 FEA 2D Suite
 * Compiles real structural stiffnesses (EI, EA), conforming multi-layer mesh boundaries,
 * backfill, foundation, shear key and operation surcharges for MEF and SSR global stability.
 */
function exportToRS2FEA() {
    const inputs = getFormInputs();

    // 1. Dimensions
    const stem_h = inputs.stem_height;
    const t_base = inputs.base_thickness;
    const b_bot = inputs.stem_bot_width;
    const b_top = inputs.stem_top_width;
    const toe = inputs.toe_length;
    const heel = inputs.heel_length;
    const batter = inputs.stem_front_batter;
    const has_key = Boolean(inputs.has_key);
    const key_d = has_key ? inputs.key_depth : 0.0;
    const key_w = has_key ? inputs.key_width : 0.0;
    const key_pos = has_key ? inputs.key_pos : 0.0;
    const toe_emb = Math.max(0.0, inputs.toe_embedment || 0.5);

    const H_wall = stem_h + t_base;
    const B_base = toe + b_bot + heel;
    const H_found = Math.max(5.0, Math.round(H_wall * 1.0 * 10) / 10);
    const L_left = Math.max(7.0, Math.round(H_wall * 1.4 * 10) / 10);
    const L_right = Math.max(8.0, Math.round(H_wall * 1.6 * 10) / 10);

    // 2. Global Coordinates
    const X_toe = L_left;
    const X_stem_bot_f = X_toe + toe;
    const X_stem_top_f = X_stem_bot_f + batter;
    const X_stem_top_b = X_stem_top_f + b_top;
    const X_stem_bot_b = X_stem_bot_f + b_bot;
    const X_heel = X_toe + B_base;
    const X_right = X_heel + L_right;

    const Y_base_bot = H_found;
    const Y_base_top = Y_base_bot + t_base;
    const Y_stem_top = Y_base_bot + H_wall;
    const Y_toe_ground = Y_base_bot + toe_emb;

    // Interface intersection along front stem face if front soil covers footing
    let X_front_stem = X_stem_bot_f;
    if (toe_emb > t_base && stem_h > 0) {
        const dy = Y_toe_ground - Y_base_top;
        X_front_stem = X_stem_bot_f + batter * (dy / stem_h);
    }

    // 3. Conforming Layer Polygons
    // Wall Polygon
    const wall_poly = [];
    wall_poly.push([roundCoord(X_toe), roundCoord(Y_base_bot)]);
    if (has_key && key_w > 0 && key_d > 0) {
        const X_k1 = X_toe + key_pos;
        const X_k2 = X_k1 + key_w;
        wall_poly.push([roundCoord(X_k1), roundCoord(Y_base_bot)]);
        wall_poly.push([roundCoord(X_k1), roundCoord(Y_base_bot - key_d)]);
        wall_poly.push([roundCoord(X_k2), roundCoord(Y_base_bot - key_d)]);
        wall_poly.push([roundCoord(X_k2), roundCoord(Y_base_bot)]);
    }
    wall_poly.push([roundCoord(X_heel), roundCoord(Y_base_bot)]);
    wall_poly.push([roundCoord(X_heel), roundCoord(Y_base_top)]);
    wall_poly.push([roundCoord(X_stem_bot_b), roundCoord(Y_base_top)]);
    wall_poly.push([roundCoord(X_stem_top_b), roundCoord(Y_stem_top)]);
    wall_poly.push([roundCoord(X_stem_top_f), roundCoord(Y_stem_top)]);
    if (toe_emb > t_base) {
        wall_poly.push([roundCoord(X_front_stem), roundCoord(Y_toe_ground)]);
    }
    wall_poly.push([roundCoord(X_stem_bot_f), roundCoord(Y_base_top)]);
    wall_poly.push([roundCoord(X_toe), roundCoord(Y_base_top)]);

    // Foundation Polygon (Layer 0)
    const found_poly = [
        [0.0, 0.0],
        [roundCoord(X_right), 0.0],
        [roundCoord(X_right), roundCoord(Y_base_bot)],
        [roundCoord(X_heel), roundCoord(Y_base_bot)]
    ];
    if (has_key && key_w > 0 && key_d > 0) {
        const X_k1 = X_toe + key_pos;
        const X_k2 = X_k1 + key_w;
        found_poly.push([roundCoord(X_k2), roundCoord(Y_base_bot)]);
        found_poly.push([roundCoord(X_k2), roundCoord(Y_base_bot - key_d)]);
        found_poly.push([roundCoord(X_k1), roundCoord(Y_base_bot - key_d)]);
        found_poly.push([roundCoord(X_k1), roundCoord(Y_base_bot)]);
    }
    found_poly.push([roundCoord(X_toe), roundCoord(Y_base_bot)]);
    found_poly.push([0.0, roundCoord(Y_base_bot)]);

    // Backfill Polygon (Layer 1)
    const backfill_poly = [
        [roundCoord(X_stem_bot_b), roundCoord(Y_base_top)],
        [roundCoord(X_heel), roundCoord(Y_base_top)],
        [roundCoord(X_heel), roundCoord(Y_base_bot)],
        [roundCoord(X_right), roundCoord(Y_base_bot)],
        [roundCoord(X_right), roundCoord(Y_stem_top)],
        [roundCoord(X_stem_top_b), roundCoord(Y_stem_top)]
    ];

    // Front Cover Soil (Layer 3)
    let front_poly = null;
    if (toe_emb > 0) {
        if (toe_emb <= t_base) {
            front_poly = [
                [0.0, roundCoord(Y_base_bot)],
                [roundCoord(X_toe), roundCoord(Y_base_bot)],
                [roundCoord(X_toe), roundCoord(Y_toe_ground)],
                [0.0, roundCoord(Y_toe_ground)]
            ];
        } else {
            front_poly = [
                [0.0, roundCoord(Y_base_bot)],
                [roundCoord(X_toe), roundCoord(Y_base_bot)],
                [roundCoord(X_toe), roundCoord(Y_base_top)],
                [roundCoord(X_stem_bot_f), roundCoord(Y_base_top)],
                [roundCoord(X_front_stem), roundCoord(Y_toe_ground)],
                [0.0, roundCoord(Y_toe_ground)]
            ];
        }
    }

    // Outer Domain Boundary
    const domain_poly = [
        [0.0, 0.0],
        [roundCoord(X_right), 0.0],
        [roundCoord(X_right), roundCoord(Y_stem_top)],
        [roundCoord(X_stem_top_b), roundCoord(Y_stem_top)],
        [roundCoord(X_stem_top_f), roundCoord(Y_stem_top)]
    ];
    if (front_poly) {
        if (toe_emb > t_base) {
            domain_poly.push([roundCoord(X_front_stem), roundCoord(Y_toe_ground)]);
        } else {
            domain_poly.push([roundCoord(X_toe), roundCoord(Y_base_top)]);
            domain_poly.push([roundCoord(X_toe), roundCoord(Y_toe_ground)]);
        }
        domain_poly.push([0.0, roundCoord(Y_toe_ground)]);
    } else {
        domain_poly.push([roundCoord(X_stem_bot_f), roundCoord(Y_base_top)]);
        domain_poly.push([roundCoord(X_toe), roundCoord(Y_base_top)]);
        domain_poly.push([roundCoord(X_toe), roundCoord(Y_base_bot)]);
        domain_poly.push([0.0, roundCoord(Y_base_bot)]);
    }

    // 4. Materials
    const materials = [
        {
            name: 'Solo de Fundação (' + (inputs.base_soil_type || 'Silte Arenoso') + ')',
            color: '#64748b',
            gamma: 19.5,
            E: 60000.0,
            nu: 0.28,
            c: Math.max(5.0, inputs.cohesion_found || 15.0),
            phi: Math.max(20.0, inputs.phi_found || 30.0),
            tension: 5.0
        },
        {
            name: 'Solo de Aterro Compactado',
            color: '#d97706',
            gamma: Math.max(15.0, inputs.gamma_soil || 18.0),
            E: 35000.0,
            nu: 0.30,
            c: 2.0,
            phi: Math.max(22.0, inputs.phi_soil || 30.0),
            tension: 2.0
        },
        {
            name: 'Concreto Armado (Muro de Arrimo fck=' + (inputs.fck || 25) + 'MPa)',
            color: '#0284c7',
            gamma: 25.0,
            E: 28000000.0,
            nu: 0.20,
            c: 4000.0,
            phi: 42.0,
            tension: 2000.0,
            model: 'elastic'
        }
    ];

    const layer_polygons = [
        { polygon: found_poly, material_idx: 0 },
        { polygon: backfill_poly, material_idx: 1 },
        { polygon: wall_poly, material_idx: 2 }
    ];

    if (front_poly) {
        materials.push({
            name: 'Solo Frontal (Passivo)',
            color: '#0d9488',
            gamma: Math.max(16.0, inputs.gamma_front || 18.0),
            E: 40000.0,
            nu: 0.28,
            c: Math.max(2.0, inputs.cohesion_front || 8.0),
            phi: Math.max(20.0, inputs.phi_front || 30.0),
            tension: 3.0
        });
        layer_polygons.push({ polygon: front_poly, material_idx: 3 });
    }

    // 5. Surcharges
    const surcharges = [];
    if (inputs.q_surcharge > 0) {
        surcharges.push({
            x1: roundCoord(X_stem_top_b + 0.5),
            x2: roundCoord(X_right - 0.5),
            q: parseFloat(inputs.q_surcharge)
        });
    }

    // 6. Stages
    const activeLayersBase = [0];
    const activeLayersWall = front_poly ? [0, 2, 3] : [0, 2];
    const activeLayersBackfill = front_poly ? [0, 1, 2, 3] : [0, 1, 2];

    const stages = [
        {
            id: 1,
            name: 'Fase 1: Fundação In-Situ',
            active_layers: activeLayersBase,
            reset_disp: true,
            description: 'Equilíbrio litostático natural da fundação virgem (deslocamentos zerados).'
        },
        {
            id: 2,
            name: 'Fase 2: Concretagem da Sapata e Muro',
            active_layers: activeLayersWall,
            reset_disp: false,
            description: 'Construção da sapata com dente de chave e fuste em concreto armado.'
        },
        {
            id: 3,
            name: 'Fase 3: Aterro de Tardoz Compactado',
            active_layers: activeLayersBackfill,
            reset_disp: false,
            description: 'Lançamento e compactação do reaterro gerando empuxo ativo e flexão do muro.'
        },
        {
            id: 4,
            name: 'Fase 4: Sobrecargas de Operação',
            active_layers: activeLayersBackfill,
            active_surcharges: surcharges.length > 0 ? [0] : [],
            reset_disp: false,
            description: 'Aplicação da sobrecarga nominal q=' + inputs.q_surcharge + ' kPa na crista do aterro.'
        }
    ];

    // Build RS2 Model Object
    const rs2Model = {
        name: 'Muro de Arrimo em Balanço (H=' + H_wall.toFixed(1) + 'm, B=' + B_base.toFixed(1) + 'm)',
        type: 'retaining_wall',
        retaining_type: 'cantilever',
        domain_poly: domain_poly,
        internal_boundaries: [],
        layer_polygons: layer_polygons,
        materials: materials,
        surcharges: surcharges,
        stages: stages,
        target_elem_size: 1.1,
        k0: 0.50
    };

    // Save payload to sessionStorage and redirect
    try {
        sessionStorage.setItem('rs2_imported_model', JSON.stringify(rs2Model));
        window.location.href = 'rs2_fem.html';
    } catch (err) {
        console.error('Falha ao exportar modelo para RS2:', err);
        alert('Erro ao transferir dados para o RS2: ' + err.message);
    }
}

function roundCoord(v) {
    return Math.round(v * 1000) / 1000;
}

window.exportToRS2FEA = exportToRS2FEA;

