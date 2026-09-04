/**
 * Retaining Wall Stability UI & 2D Canvas Renderer with CAD Dimension Lines (Cotas)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Register event listeners for live drawing updates
    const formInputs = document.querySelectorAll('#retaining-wall-form input, #retaining-wall-form select');
    formInputs.forEach(input => {
        input.addEventListener('input', () => {
            triggerCalculation();
        });
        input.addEventListener('change', () => {
            triggerCalculation();
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
 * CAD-Style Dimensioning Helper Function (Linha de Cota)
 */
function drawDimension(ctx, p1, p2, offsetPx, label, isVertical = false, color = '#64748b') {
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

    // 1. Linhas de Chamada (Extension Lines)
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(cx1 + (isVertical ? Math.sign(offsetPx) * 5 : 0), cy1 + (!isVertical ? Math.sign(offsetPx) * 5 : 0));
    ctx.moveTo(x2, y2);
    ctx.lineTo(cx2 + (isVertical ? Math.sign(offsetPx) * 5 : 0), cy2 + (!isVertical ? Math.sign(offsetPx) * 5 : 0));
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Linha de Cota Principal
    ctx.beginPath();
    ctx.moveTo(cx1, cy1);
    ctx.lineTo(cx2, cy2);
    ctx.stroke();

    // 3. Setas ou Ticks nas extremidades
    const arrowSize = 4;
    const drawArrow = (x, y, angle) => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - arrowSize * Math.cos(angle - Math.PI / 6), y - arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x - arrowSize * Math.cos(angle + Math.PI / 6), y - arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    };

    const angle = Math.atan2(cy2 - cy1, cx2 - cx1);
    drawArrow(cx1, cy1, angle + Math.PI);
    drawArrow(cx2, cy2, angle);

    // 4. Texto da Cota com fundo protegido
    const midX = (cx1 + cx2) / 2;
    const midY = (cy1 + cy2) / 2;

    ctx.font = '500 11px Inter, sans-serif';
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // pill background shadow
    ctx.fillRect(midX - textWidth / 2 - 3, midY - 7, textWidth + 6, 14);

    ctx.fillStyle = '#cbd5e1'; // slate-300
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, midX, midY);

    ctx.restore();
}

/**
 * HTML5 2D Canvas Retaining Wall Drawing Engine
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

    // Clear Background
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.fillRect(0, 0, width, height);

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

    // Determine scale & margins to fit wall, dimensions, and stress diagram cleanly
    const marginX = 85;
    const marginY = 65;
    const total_draw_width = B + 2.5; // space for dimensions & force vectors
    const total_draw_height = H_total + key_d + 1.8;

    const scaleX = (width - 2 * marginX) / total_draw_width;
    const scaleY = (height - 2 * marginY) / total_draw_height;
    const scale = Math.min(scaleX, scaleY);

    // Origin (0,0) at toe front bottom of footing
    const originX = marginX + 0.8 * scale;
    const originY = height - marginY - (key_d + 1.0) * scale;

    const toPxX = (x) => originX + x * scale;
    const toPxY = (y) => originY - y * scale;
    const P = (x, y) => ({ x: toPxX(x), y: toPxY(y) });

    // 1. Draw Foundation Soil Below Base
    ctx.fillStyle = '#1e293b'; // slate-800
    ctx.beginPath();
    ctx.rect(0, toPxY(0), width, height - toPxY(0));
    ctx.fill();

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, toPxY(0));
    ctx.lineTo(width, toPxY(0));
    ctx.stroke();

    // 1.5 Draw Front Soil Layer (Aterro Frontal / Passivo em frente à puntera)
    const H_front = inputs.toe_embedment;
    if (H_front > 0) {
        ctx.fillStyle = 'rgba(20, 184, 166, 0.35)'; // teal-500 vibrant translucent
        ctx.beginPath();
        ctx.moveTo(toPxX(-1.2), toPxY(0));
        ctx.lineTo(toPxX(-1.2), toPxY(t_base + H_front));
        ctx.lineTo(toPxX(L_toe), toPxY(t_base + H_front));
        ctx.lineTo(toPxX(L_toe), toPxY(t_base));
        ctx.lineTo(toPxX(0), toPxY(t_base));
        ctx.lineTo(toPxX(0), toPxY(0));
        ctx.closePath();
        ctx.fill();

        // Top Surface Line of Front Soil
        ctx.strokeStyle = '#14b8a6'; // teal-500
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(toPxX(-1.2), toPxY(t_base + H_front));
        ctx.lineTo(toPxX(L_toe), toPxY(t_base + H_front));
        ctx.stroke();
        ctx.setLineDash([]);

        // Front Soil Label
        ctx.fillStyle = '#2dd4bf'; // teal-400
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Aterro Frontal (${H_front.toFixed(2)} m)`, toPxX(-0.6), toPxY(t_base + H_front) - 8);
    }

    // 2. Draw Backfill Soil behind wall stem
    const x_stem_back_base = L_toe + b_bot;
    const x_stem_top_front = L_toe + b_front;
    const x_stem_top_back = x_stem_top_front + b_top;

    ctx.fillStyle = 'rgba(180, 83, 9, 0.22)'; // amber-700 translucent
    ctx.beginPath();
    ctx.moveTo(toPxX(x_stem_back_base), toPxY(t_base));
    ctx.lineTo(toPxX(x_stem_top_back), toPxY(t_base + H_stem));
    ctx.lineTo(toPxX(B), toPxY(t_base + H_stem + H_slope));
    ctx.lineTo(toPxX(B), toPxY(t_base));
    ctx.closePath();
    ctx.fill();

    // Draw Backfill Slope Line
    ctx.strokeStyle = '#f59e0b'; // amber-500
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(toPxX(x_stem_top_back), toPxY(t_base + H_stem));
    ctx.lineTo(toPxX(B), toPxY(t_base + H_stem + H_slope));
    ctx.lineTo(toPxX(B + 1.0), toPxY(t_base + H_stem + H_slope + 1.0 * Math.tan(beta_rad)));
    ctx.stroke();
    ctx.setLineDash([]);

    // 3. Draw Water Table (if any)
    if (inputs.water_height > 0) {
        const H_w = Math.min(inputs.water_height, H_total);
        if (H_w > t_base) {
            const h_water_soil = H_w - t_base;
            ctx.fillStyle = 'rgba(6, 182, 212, 0.2)'; // cyan translucent
            ctx.fillRect(toPxX(x_stem_back_base), toPxY(H_w), (B - x_stem_back_base) * scale, h_water_soil * scale);
        }

        ctx.strokeStyle = '#06b6d4'; // cyan-500
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(toPxX(x_stem_back_base), toPxY(H_w));
        ctx.lineTo(toPxX(B + 0.8), toPxY(H_w));
        ctx.stroke();
    }

    // 4. Draw Concrete Retaining Wall Polygon (FIXED PERFECT PATH)
    ctx.fillStyle = '#3b82f6'; // blue-500
    ctx.strokeStyle = '#60a5fa'; // blue-400
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    // (1) Footing Toe Front Bottom
    ctx.moveTo(toPxX(0), toPxY(0));
    // (2) Footing Toe Front Top
    ctx.lineTo(toPxX(0), toPxY(t_base));
    // (3) Top of Toe to Base of Stem Front
    ctx.lineTo(toPxX(L_toe), toPxY(t_base));
    // (4) Stem Front Slope to Stem Top Front
    ctx.lineTo(toPxX(x_stem_top_front), toPxY(t_base + H_stem));
    // (5) Stem Top Face to Stem Top Back
    ctx.lineTo(toPxX(x_stem_top_back), toPxY(t_base + H_stem));
    // (6) Stem Back Slope down to Stem Base Back (Top of Heel Slab!)
    ctx.lineTo(toPxX(x_stem_back_base), toPxY(t_base));
    // (7) Top of Heel Slab to Heel Back Tip
    ctx.lineTo(toPxX(B), toPxY(t_base));
    // (8) Heel Back Tip down to Footing Bottom
    ctx.lineTo(toPxX(B), toPxY(0));

    // (9) Base Bottom & Shear Key (if present)
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

    // 5. Draw Surcharge Arrows (if q > 0)
    if (inputs.q_surcharge > 0) {
        ctx.strokeStyle = '#ef4444'; // red-500
        ctx.fillStyle = '#ef4444';
        ctx.lineWidth = 1.5;

        const numArrows = 4;
        const arrowStep = L_heel / numArrows;
        for (let i = 0; i <= numArrows; i++) {
            const ax = x_stem_back_base + i * arrowStep;
            const ay_top = t_base + H_stem + (i * arrowStep) * Math.tan(beta_rad) + 0.5;
            const ay_bot = ay_top - 0.35;

            ctx.beginPath();
            ctx.moveTo(toPxX(ax), toPxY(ay_top));
            ctx.lineTo(toPxX(ax), toPxY(ay_bot));
            ctx.stroke();

            // Arrow head
            ctx.beginPath();
            ctx.moveTo(toPxX(ax) - 3, toPxY(ay_bot) + 5);
            ctx.lineTo(toPxX(ax), toPxY(ay_bot));
            ctx.lineTo(toPxX(ax) + 3, toPxY(ay_bot) + 5);
            ctx.fill();
        }
        ctx.font = '500 11px Inter, sans-serif';
        ctx.fillText(`q = ${inputs.q_surcharge} kPa`, toPxX(x_stem_back_base + L_heel / 2), toPxY(t_base + H_stem + H_slope + 0.6));
    }

    // 6. Draw Active Pressure Resultant Force Arrow (P_a,h & P_a,v)
    if (res && res.earth_pressures) {
        const ep = res.earth_pressures;
        const P_h = ep.total_P_h;
        const P_v = ep.total_P_v || 0.0;
        const isCoulomb = (ep.theory || '').toUpperCase() === 'COULOMB' && P_v > 0.01;

        ctx.strokeStyle = '#f43f5e'; // rose-500
        ctx.fillStyle = '#f43f5e';
        ctx.lineWidth = 2.5;

        const arrowY = t_base + H_stem / 3.0;
        const arrowX_end = isCoulomb ? x_stem_back_base : B;
        const arrowX_start = arrowX_end + 1.0;
        const arrowY_start = isCoulomb ? arrowY + (1.0 * Math.tan(Math.min(0.7, (ep.angle_force_deg || 20) * Math.PI / 180))) : arrowY;

        ctx.beginPath();
        ctx.moveTo(toPxX(arrowX_start), toPxY(arrowY_start));
        ctx.lineTo(toPxX(arrowX_end), toPxY(arrowY));
        ctx.stroke();

        // Arrow head directed towards wall
        const angleArr = Math.atan2(toPxY(arrowY) - toPxY(arrowY_start), toPxX(arrowX_end) - toPxX(arrowX_start));
        const ahSize = 8;
        ctx.beginPath();
        ctx.moveTo(toPxX(arrowX_end), toPxY(arrowY));
        ctx.lineTo(toPxX(arrowX_end) - ahSize * Math.cos(angleArr - Math.PI / 6), toPxY(arrowY) - ahSize * Math.sin(angleArr - Math.PI / 6));
        ctx.lineTo(toPxX(arrowX_end) - ahSize * Math.cos(angleArr + Math.PI / 6), toPxY(arrowY) - ahSize * Math.sin(angleArr + Math.PI / 6));
        ctx.closePath();
        ctx.fill();

        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'left';
        if (isCoulomb) {
            ctx.fillText(`P_a = ${(Math.sqrt(P_h**2 + P_v**2)).toFixed(1)} kN/m`, toPxX(arrowX_start) + 4, toPxY(arrowY_start) - 4);
            ctx.fillText(`(P_h=${P_h.toFixed(1)}, P_v=${P_v.toFixed(1)}, δ=${ep.wall_friction_deg}°)`, toPxX(arrowX_start) + 4, toPxY(arrowY_start) + 12);
        } else {
            ctx.fillText(`P_a,h = ${P_h.toFixed(1)} kN/m (Rankine, Ka=${ep.Ka.toFixed(3)})`, toPxX(arrowX_start) + 4, toPxY(arrowY) + 4);
        }
    }

    // 7. Draw Base Contact Soil Pressure Diagram
    if (res && res.stability) {
        const q_toe = res.stability.q_toe;
        const q_heel = res.stability.q_heel;
        const max_q = res.stability.q_max;

        if (max_q > 0) {
            const h_scale_q = 0.5 / Math.max(max_q, 100);

            const h_toe_px = q_toe * h_scale_q * scale;
            const h_heel_px = q_heel * h_scale_q * scale;

            ctx.fillStyle = 'rgba(244, 63, 94, 0.25)'; // rose-500 translucent
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 1.5;

            ctx.beginPath();
            ctx.moveTo(toPxX(0), toPxY(0));
            ctx.lineTo(toPxX(0), toPxY(0) + h_toe_px);
            ctx.lineTo(toPxX(B), toPxY(0) + h_heel_px);
            ctx.lineTo(toPxX(B), toPxY(0));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Stress Labels
            ctx.fillStyle = '#f43f5e';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${q_toe.toFixed(1)} kPa`, toPxX(0), toPxY(0) + h_toe_px + 14);
            ctx.fillText(`${q_heel.toFixed(1)} kPa`, toPxX(B), toPxY(0) + h_heel_px + 14);
        }
    }

    // ====================================================================
    // 8. TECHNICAL CAD DIMENSION LINES (COTAS TÉCNICAS REQUISITADAS)
    // ====================================================================

    // Cota 1: Height of Stem - Vertical line on the left of stem
    drawDimension(ctx, P(L_toe, t_base), P(x_stem_top_front, t_base + H_stem), -30, `${H_stem.toFixed(2)} m`, true, '#38bdf8');

    // Cota 2: Footing Thickness - Vertical line on the left of toe
    drawDimension(ctx, P(0, 0), P(0, t_base), -30, `${t_base.toFixed(2)} m`, true, '#94a3b8');

    // Cota 3: Stem Top Width - Horizontal line above stem top
    drawDimension(ctx, P(x_stem_top_front, t_base + H_stem), P(x_stem_top_back, t_base + H_stem), 22, `${b_top.toFixed(2)} m`, false, '#38bdf8');

    // Cota 4: Stem Base Width - Horizontal line at stem base
    if (b_bot !== b_top || b_front > 0) {
        drawDimension(ctx, P(L_toe, t_base), P(x_stem_back_base, t_base), 18, `${b_bot.toFixed(2)} m`, false, '#60a5fa');
    }

    // Cota 5: Toe Length - Horizontal line under toe
    if (L_toe > 0.001) {
        drawDimension(ctx, P(0, 0), P(L_toe, 0), -22, `${L_toe.toFixed(2)} m`, false, '#94a3b8');
    }

    // Cota 6: Heel Length - Horizontal line under heel
    if (L_heel > 0.001) {
        drawDimension(ctx, P(x_stem_back_base, 0), P(B, 0), -22, `${L_heel.toFixed(2)} m`, false, '#94a3b8');
    }

    // Cota 7: Total Base Width - Main horizontal line below entire footing
    drawDimension(ctx, P(0, 0), P(B, 0), -48, `${B.toFixed(2)} m`, false, '#f59e0b');

    // Cota 8: Shear Key Dimensions (if key active)
    if (inputs.has_key && key_d > 0 && key_w > 0) {
        const k_start = key_pos;
        const k_end = key_pos + key_w;
        // Key Depth
        drawDimension(ctx, P(k_start, 0), P(k_start, -key_d), -20, `${key_d.toFixed(2)} m`, true, '#a855f7');
        // Key Width
        drawDimension(ctx, P(k_start, -key_d), P(k_end, -key_d), -18, `${key_w.toFixed(2)} m`, false, '#a855f7');
    }

    // Cota 9: Front Soil Cover Height (H_front)
    if (inputs.toe_embedment > 0) {
        drawDimension(ctx, P(-0.5, 0), P(-0.5, inputs.toe_embedment), -15, `${inputs.toe_embedment.toFixed(2)} m`, true, '#14b8a6');
    }

    // Passive Earth Force Vector (P_p)
    if (res && res.earth_pressures && res.earth_pressures.use_passive && res.earth_pressures.P_passive_used > 0) {
        const P_p = res.earth_pressures.P_passive_used;
        ctx.strokeStyle = '#10b981'; // emerald-500
        ctx.fillStyle = '#10b981';
        ctx.lineWidth = 2.5;

        const arrowY = (inputs.toe_embedment + key_d) / 3.0;
        const arrowX_start = -0.7;
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

        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`P_p = ${P_p.toFixed(1)} kN/m`, toPxX(arrowX_start) - 4, toPxY(arrowY) + 4);
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

        // 1. Stem Main Vertical Rebar (Face Tracionada / Posterior)
        // From stem top down to base bottom, then bent horizontally under heel
        ctx.strokeStyle = '#f43f5e'; // rose-500
        ctx.lineWidth = 3.0;
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

        // 2. Stem Front Face Bar (Face Frontal / Retração / Montagem)
        ctx.strokeStyle = '#38bdf8'; // sky-400
        ctx.lineWidth = 2.0;
        const frontBarX_top = x_stem_top_front + c_stem;
        const frontBarX_bot = L_toe + b_front + c_stem;
        const hookX_toe = Math.max(c_base, frontBarX_bot - 0.35);

        ctx.beginPath();
        ctx.moveTo(toPxX(frontBarX_top), toPxY(barY_top));
        ctx.lineTo(toPxX(frontBarX_bot), toPxY(barY_bot));
        ctx.lineTo(toPxX(hookX_toe), toPxY(barY_bot));
        ctx.stroke();

        // 3. Toe Bottom Rebar (Armadura Inferior da Puntera)
        ctx.strokeStyle = '#6366f1'; // indigo-500
        ctx.lineWidth = 2.6;
        const toeX_left = c_base;
        const toeX_right = Math.min(B - c_base, L_toe + b_bot * 0.7);
        const toeY_bar = c_base;

        ctx.beginPath();
        ctx.moveTo(toPxX(toeX_left), toPxY(t_base - c_base)); // Vertical bend
        ctx.lineTo(toPxX(toeX_left), toPxY(toeY_bar));
        ctx.lineTo(toPxX(toeX_right), toPxY(toeY_bar));
        ctx.stroke();

        // 4. Heel Top Rebar (Armadura Superior do Calcanhar)
        ctx.strokeStyle = '#c084fc'; // purple-400
        ctx.lineWidth = 2.6;
        const heelX_left = Math.max(c_base, L_toe + b_bot * 0.2);
        const heelX_right = B - c_base;
        const heelY_bar = t_base - c_base;

        ctx.beginPath();
        ctx.moveTo(toPxX(heelX_left), toPxY(heelY_bar));
        ctx.lineTo(toPxX(heelX_right), toPxY(heelY_bar));
        ctx.lineTo(toPxX(heelX_right), toPxY(c_base)); // Vertical bend
        ctx.stroke();

        // 5. Horizontal Distribution Dots along Stem
        ctx.fillStyle = '#fbbf24'; // amber-400
        const numDistBars = Math.max(3, Math.floor(H_stem / 0.30));
        for (let i = 1; i <= numDistBars; i++) {
            const frac = i / (numDistBars + 1);
            const dotY = t_base + frac * H_stem;
            const dotX_back = barX_bot + frac * (barX_top - barX_bot) - 0.035;
            const dotX_front = frontBarX_bot + frac * (frontBarX_top - frontBarX_bot) + 0.035;

            [dotX_back, dotX_front].forEach(dx => {
                ctx.beginPath();
                ctx.arc(toPxX(dx), toPxY(dotY), 2.8, 0, 2 * Math.PI);
                ctx.fill();
            });
        }

        // 6. Longitudinal Distribution Dots in Footing
        const numFootingDots = Math.max(3, Math.floor(B / 0.35));
        for (let i = 1; i <= numFootingDots; i++) {
            const dotX = c_base + (i / (numFootingDots + 1)) * (B - 2 * c_base);
            // Bottom layer
            ctx.beginPath();
            ctx.arc(toPxX(dotX), toPxY(c_base + 0.04), 2.5, 0, 2 * Math.PI);
            ctx.fill();
            // Top layer (in heel zone)
            if (dotX > x_stem_back_base) {
                ctx.beginPath();
                ctx.arc(toPxX(dotX), toPxY(t_base - c_base - 0.04), 2.5, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        // 7. Callout Labels with Protected Badges
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const drawCallout = (text, px, py, color, strokeColor) => {
            const tw = ctx.measureText(text).width;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
            ctx.fillRect(px - tw / 2 - 5, py - 8, tw + 10, 16);
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(px - tw / 2 - 5, py - 8, tw + 10, 16);
            ctx.fillStyle = color;
            ctx.fillText(text, px, py);
        };

        if (reinf.haste?.detailing) {
            const midX = (barX_bot + barX_top) / 2;
            const midY = t_base + H_stem * 0.5;
            drawCallout(`Haste: ${reinf.haste.detailing.text}`, toPxX(midX) - 60, toPxY(midY), '#f43f5e', '#f43f5e');
        }

        if (reinf.puntera?.detailing && L_toe > 0.4) {
            drawCallout(`Puntera: ${reinf.puntera.detailing.text}`, toPxX(L_toe * 0.5), toPxY(c_base) + 18, '#818cf8', '#6366f1');
        }

        if (reinf.calcanhar?.detailing && L_heel > 0.4) {
            drawCallout(`Calcanhar: ${reinf.calcanhar.detailing.text}`, toPxX(x_stem_back_base + L_heel * 0.5), toPxY(t_base - c_base) - 18, '#e879f9', '#c084fc');
        }

        ctx.restore();
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
