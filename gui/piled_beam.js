/**
 * Piled Gantry Beam UI Controller & Interactive Moving Load Canvas Renderer
 */

let lastBeamResult = null;
let currentGantryX = 12.0;
let isCalculatingBeam = false;

document.addEventListener('DOMContentLoaded', () => {
    const inputs = document.querySelectorAll('#piled-beam-form input, #piled-beam-form select');
    inputs.forEach(input => {
        input.addEventListener('input', debounce(triggerCalculation, 250));
        input.addEventListener('change', triggerCalculation);
    });

    // Check for springs calculated in Aoki-Velloso
    checkAndLoadAokiSprings();

    window.addEventListener('resize', () => {
        if (lastBeamResult) drawCanvas();
    });

    triggerCalculation();
});

function checkAndLoadAokiSprings() {
    const raw = localStorage.getItem('aoki_springs_piled_beam');
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
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
        if (data.pile_tension_adm_kN && document.getElementById('pile_tension_adm')) {
            document.getElementById('pile_tension_adm').value = data.pile_tension_adm_kN;
            applied = true;
        }
        if (data.pile_diameter_m && document.getElementById('pile_diameter')) {
            document.getElementById('pile_diameter').value = data.pile_diameter_m;
            applied = true;
        }
        if (data.pile_length_m && document.getElementById('pile_length')) {
            document.getElementById('pile_length').value = data.pile_length_m;
            applied = true;
        }
        if (applied) {
            const banner = document.getElementById('aoki-import-banner');
            const txt = document.getElementById('aoki-banner-text');
            if (banner && txt) {
                txt.innerHTML = `Molas importadas com sucesso do Aoki-Velloso! <strong>Kz = ${Number(data.pile_spring_kz_kN_m).toLocaleString('pt-BR')} kN/m</strong> | <strong>Kx = ${Number(data.pile_spring_kx_fixed_kN_m).toLocaleString('pt-BR')} kN/m</strong> | <strong>Radm = ${Number(data.pile_capacity_adm_kN).toLocaleString('pt-BR')} kN</strong> | <strong>Tadm = ${Number(data.pile_tension_adm_kN).toLocaleString('pt-BR')} kN</strong>`;
                banner.classList.remove('hidden');
            }
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

        fck: parseNum('fck', 35.0),
        cover: parseNum('cover', 50.0),

        pile_capacity_adm: parseNum('pile_capacity_adm', 1600.0),
        pile_spring_kz: parseNum('pile_spring_kz', 180000.0),
        pile_diameter: parseNum('pile_diameter', 0.80),
        pile_spring_kx: parseNum('pile_spring_kx', 40000.0)
    };
}

async function triggerCalculation() {
    if (isCalculatingBeam) return;
    isCalculatingBeam = true;

    const inputs = getFormInputs();
    const slider = document.getElementById('gantry_slider');
    if (slider) {
        slider.max = inputs.beam_length;
        if (parseFloat(slider.value) > inputs.beam_length) {
            slider.value = inputs.beam_length / 2.0;
        }
        currentGantryX = parseFloat(slider.value);
    }

    try {
        if (window.eel && eel.calculate_piled_beam) {
            const res = await eel.calculate_piled_beam(inputs)();
            if (res && res.success) {
                lastBeamResult = res;
                updateUIResults(res);
                drawCanvas();
            } else if (res && res.error) {
                console.error("Beam calculation error:", res.error);
            }
        }
    } catch (err) {
        console.error("Eel invocation failed:", err);
    } finally {
        isCalculatingBeam = false;
    }
}

function updateGantryPosition(val) {
    currentGantryX = parseFloat(val);
    const span = document.getElementById('gantry-pos-val');
    if (span) span.innerText = `${currentGantryX.toFixed(1)} m`;
    drawCanvas();
}

function updateBadge(id, isOk, text) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = text;
    el.className = isOk
        ? "px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
        : "px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300";
}

function updateUIResults(res) {
    const env = res.envelope_results || {};
    const des = res.beam_design || {};
    const pcheck = res.piles_check || {};
    const spanOpt = res.span_optimization || [];

    // Top Cards
    document.getElementById('card-m-pos').innerText = env.M_pos_max_kNm != null ? `${env.M_pos_max_kNm.toFixed(1)}` : '-';
    document.getElementById('card-as-inf').innerText = `As inf = ${des.As_inf_cm2} cm² (${des.detail_inf?.text || '-'})`;

    document.getElementById('card-m-neg').innerText = env.M_neg_max_kNm != null ? `${env.M_neg_max_kNm.toFixed(1)}` : '-';
    document.getElementById('card-as-sup').innerText = `As sup = ${des.As_sup_cm2} cm² (${des.detail_sup?.text || '-'})`;

    document.getElementById('card-v-max').innerText = env.V_max_kN != null ? `${env.V_max_kN.toFixed(1)}` : '-';
    updateBadge('badge-shear-status', des.status_strut === "APROVADO (Biela OK)", des.status_strut || 'OK');
    document.getElementById('card-stirrups').innerText = des.stirrups?.text || '-';

    document.getElementById('card-pile-r-max').innerText = env.R_max_pile_tf != null ? `${env.R_max_pile_tf.toFixed(1)}` : '-';
    const isPileOk = pcheck.status_compression === 'APROVADO';
    updateBadge('badge-pile-beam-status', isPileOk, isPileOk ? `FS = ${pcheck.fs_compression}` : 'SOBRECARGA');
    document.getElementById('card-pile-adm').innerText = `Capacidade R_adm: ${(pcheck.R_adm_kN / 9.81).toFixed(0)} tf (${pcheck.num_piles} estacas)`;

    // Technical Table
    document.getElementById('res-m-sd-pos').innerText = `${des.Md_pos_kNm?.toFixed(1)} kN·m`;
    document.getElementById('res-detail-inf').innerText = `${des.detail_inf?.text || '-'}`;
    document.getElementById('res-m-sd-neg').innerText = `${des.Md_neg_kNm?.toFixed(1)} kN·m`;
    document.getElementById('res-detail-sup').innerText = `${des.detail_sup?.text || '-'}`;
    document.getElementById('res-v-sd').innerText = `V_sd = ${des.V_sd_kN?.toFixed(1)} kN ≤ VRd2 = ${des.VRd2_kN?.toFixed(1)} kN (${des.status_strut})`;
    document.getElementById('res-stirrups-desc').innerText = `${des.stirrups?.text} (As,w = ${des.stirrups?.asw_provided_cm2_m} cm²/m)`;
    document.getElementById('res-crack-beam').innerText = `${des.crack_width?.w_k_mm?.toFixed(3)} mm (Lim = 0.20 mm - ${des.crack_width?.status})`;

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
                <td class="p-2">${opt.span_m.toFixed(1)} ${opt.is_current ? '<span class="text-[10px] text-blue-600 dark:text-blue-400">(Atual)</span>' : ''}</td>
                <td class="p-2">${opt.num_piles}</td>
                <td class="p-2">${opt.total_drilling_m} m</td>
                <td class="p-2 text-right font-mono">${opt.M_pos_max_kNm.toFixed(0)}</td>
                <td class="p-2 text-right font-mono">${opt.M_neg_max_kNm.toFixed(0)}</td>
                <td class="p-2 text-right font-mono">${opt.R_max_pile_kN.toFixed(0)}</td>
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

    ctx.clearRect(0, 0, w, h);

    const inputs = getFormInputs();
    const res = lastBeamResult;

    const L_beam = inputs.beam_length;
    const marginX = 40;
    const scaleX = (w - 2 * marginX) / L_beam;

    const toPxX = (x) => marginX + x * scaleX;

    // Layout Heights
    const y_ground = 120;
    const h_beam_px = Math.max(25, inputs.beam_height * 35);
    const y_beam_top = y_ground - h_beam_px;
    const y_pile_bottom = 260;

    // 1. Draw Ground Line
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(marginX - 20, y_ground);
    ctx.lineTo(w - marginX + 20, y_ground);
    ctx.stroke();

    // Soil Hatching
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let x = marginX - 10; x <= w - marginX + 10; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, y_ground);
        ctx.lineTo(x - 8, y_ground + 8);
        ctx.stroke();
    }

    // 2. Draw Concrete Beam Body
    ctx.fillStyle = 'rgba(59, 130, 246, 0.25)'; // Blue fill
    ctx.strokeStyle = '#60a5fa'; // Blue-400
    ctx.lineWidth = 2.5;
    ctx.fillRect(toPxX(0), y_beam_top, L_beam * scaleX, h_beam_px);
    ctx.strokeRect(toPxX(0), y_beam_top, L_beam * scaleX, h_beam_px);

    // Dimension labels
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`L = ${L_beam.toFixed(1)} m (bw = ${inputs.beam_width}m x h = ${inputs.beam_height}m)`, toPxX(L_beam / 2), y_beam_top - 38);

    // 3. Draw Piles
    const pileSpacing = inputs.pile_spacing;
    const cantL = inputs.cantilever_left;
    const Dp_px = Math.max(14, inputs.pile_diameter * scaleX * 1.5);

    let px = cantL;
    const pileXCoords = [];
    while (px <= L_beam - 0.5) {
        pileXCoords.push(px);
        px += pileSpacing;
    }

    const pCheck = res?.piles_check;
    const R_adm = pCheck?.R_adm_kN || 1600.0;

    pileXCoords.forEach((x_pile, idx) => {
        const cx = toPxX(x_pile);

        // Draw pile cylinder
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.fillRect(cx - Dp_px / 2, y_ground, Dp_px, y_pile_bottom - y_ground);
        ctx.strokeRect(cx - Dp_px / 2, y_ground, Dp_px, y_pile_bottom - y_ground);

        // Pile spring coils graphic
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let sy = y_ground + 10; sy < y_pile_bottom - 10; sy += 10) {
            ctx.moveTo(cx - 5, sy);
            ctx.lineTo(cx + 5, sy + 5);
        }
        ctx.stroke();

        // Label pile number & reaction
        const pileInfo = pCheck?.piles?.[idx];
        const R_tf = pileInfo ? pileInfo.R_max_tf : (res ? (res.envelope_results.R_max_pile_tf * 0.85).toFixed(1) : '-');

        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = '#10b981';
        ctx.textAlign = 'center';
        ctx.fillText(`E${idx + 1}`, cx, y_pile_bottom + 14);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(`${R_tf}t`, cx, y_pile_bottom + 26);
    });

    // 4. Draw Gantry Moving Load Train at slider position
    const nWheels = inputs.num_wheels;
    const wSpacing = inputs.wheel_spacing;
    const gantryX = currentGantryX;

    const wheelXs = [];
    for (let i = 0; i < nWheels; i++) {
        const offset = (i - (nWheels - 1) / 2.0) * wSpacing;
        wheelXs.push(gantryX + offset);
    }

    // Draw Bogie frame
    const firstWX = toPxX(wheelXs[0]);
    const lastWX = toPxX(wheelXs[wheelXs.length - 1]);
    ctx.strokeStyle = '#f59e0b'; // Amber
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(firstWX - 8, y_beam_top - 12);
    ctx.lineTo(lastWX + 8, y_beam_top - 12);
    ctx.stroke();

    // Central Kingpin and Load Label
    const centerWX = toPxX(gantryX);
    ctx.fillStyle = '#ef4444'; // Red arrow
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;

    // Load Arrow
    ctx.beginPath();
    ctx.moveTo(centerWX, y_beam_top - 32);
    ctx.lineTo(centerWX, y_beam_top - 14);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerWX - 6, y_beam_top - 20);
    ctx.lineTo(centerWX, y_beam_top - 14);
    ctx.lineTo(centerWX + 6, y_beam_top - 20);
    ctx.fill();

    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText(`${inputs.gantry_load_tf} tf (φ=${inputs.dynamic_factor})`, centerWX, y_beam_top - 36);

    // Draw individual Wheels
    wheelXs.forEach(wx => {
        const cx = toPxX(wx);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(cx, y_beam_top - 5, 5, 0, Math.PI * 2);
        ctx.fill();

        // Small downward force tick
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, y_beam_top - 12);
        ctx.lineTo(cx, y_beam_top - 5);
        ctx.stroke();
    });

    // 5. Draw Envelope Diagram in lower region of canvas
    const showM = document.getElementById('toggle-envelope-moment')?.checked;
    const showV = document.getElementById('toggle-envelope-shear')?.checked;
    const y_baseline_diagram = 380;

    // Baseline axis
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toPxX(0), y_baseline_diagram);
    ctx.lineTo(toPxX(L_beam), y_baseline_diagram);
    ctx.stroke();

    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText('0.0', toPxX(0) - 18, y_baseline_diagram + 3);

    if (res && res.envelope_results && res.envelope_results.diagram_points) {
        const pts = res.envelope_results.diagram_points;
        const M_max = Math.max(100, res.envelope_results.M_pos_max_kNm, res.envelope_results.M_neg_max_kNm);
        const V_max = Math.max(100, res.envelope_results.V_max_kN);

        const scaleM = 50.0 / M_max;
        const scaleV = 50.0 / V_max;

        if (showM) {
            // Positive Envelope (M+ plotted downward per civil engineering convention)
            ctx.strokeStyle = '#38bdf8'; // Sky-400
            ctx.lineWidth = 2;
            ctx.beginPath();
            pts.forEach((pt, i) => {
                const px = toPxX(pt.x);
                const py = y_baseline_diagram + pt.M_pos * scaleM;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();

            // Negative Envelope (M- plotted upward)
            ctx.strokeStyle = '#c084fc'; // Purple-400
            ctx.lineWidth = 2;
            ctx.beginPath();
            pts.forEach((pt, i) => {
                const px = toPxX(pt.x);
                const py = y_baseline_diagram + pt.M_neg * scaleM;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();

            // Legend on bottom
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'left';
            ctx.fillText(`— Envoltória M+ (Máx = ${res.envelope_results.M_pos_max_kNm.toFixed(0)} kN·m)`, toPxX(0), y_baseline_diagram + 65);
            ctx.fillStyle = '#c084fc';
            ctx.fillText(`— Envoltória M- (Máx = -${res.envelope_results.M_neg_max_kNm.toFixed(0)} kN·m)`, toPxX(L_beam / 2), y_baseline_diagram + 65);
        }

        if (showV) {
            // Shear Envelope V(x)
            ctx.strokeStyle = '#f59e0b'; // Amber-500
            ctx.lineWidth = 2;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            pts.forEach((pt, i) => {
                const px = toPxX(pt.x);
                const py = y_baseline_diagram - pt.V_pos * scaleV;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.fillStyle = '#f59e0b';
            ctx.textAlign = 'right';
            ctx.fillText(`-- Envoltória V (Máx = ±${res.envelope_results.V_max_kN.toFixed(0)} kN)`, toPxX(L_beam), y_baseline_diagram + 65);
        }
    }
}

function resetDefaults() {
    document.getElementById('beam_length').value = 24.0;
    document.getElementById('beam_width').value = 0.80;
    document.getElementById('beam_height').value = 1.20;
    document.getElementById('pile_spacing').value = 3.0;
    document.getElementById('gantry_load_tf').value = 148.42;
    document.getElementById('dynamic_factor').value = 1.25;
    document.getElementById('pile_capacity_adm').value = 1600.0;
    triggerCalculation();
}
