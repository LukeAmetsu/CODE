/**
 * Continuous RC Beams Controller & Envelope Renderer (NBR 6118)
 */

let beamSpans = [];
let beamResults = null;

document.addEventListener('DOMContentLoaded', () => {
    loadBeamPreset('3_spans_typical');
});

function loadBeamPreset(presetKey) {
    if (presetKey === '3_spans_typical') {
        document.getElementById('beam-fck').value = '30';
        document.getElementById('beam-dprime').value = '4.0';
        document.getElementById('beam-caa').value = 'II';
        document.getElementById('beam-delta').value = '0.90';
        beamSpans = [
            { L: 5.5, bw: 20.0, h: 55.0, g: 22.0, q: 12.0 },
            { L: 6.0, bw: 20.0, h: 55.0, g: 22.0, q: 12.0 },
            { L: 5.0, bw: 20.0, h: 55.0, g: 22.0, q: 12.0 }
        ];
    } else if (presetKey === '2_spans_heavy') {
        document.getElementById('beam-fck').value = '35';
        document.getElementById('beam-dprime').value = '4.5';
        document.getElementById('beam-caa').value = 'II';
        document.getElementById('beam-delta').value = '0.85';
        beamSpans = [
            { L: 6.5, bw: 25.0, h: 65.0, g: 35.0, q: 25.0 },
            { L: 6.5, bw: 25.0, h: 65.0, g: 35.0, q: 25.0 }
        ];
    } else if (presetKey === '4_spans_bridge') {
        document.getElementById('beam-fck').value = '40';
        document.getElementById('beam-dprime').value = '5.0';
        document.getElementById('beam-caa').value = 'III';
        document.getElementById('beam-delta').value = '0.85';
        beamSpans = [
            { L: 8.0, bw: 35.0, h: 80.0, g: 45.0, q: 30.0 },
            { L: 10.0, bw: 35.0, h: 80.0, g: 45.0, q: 30.0 },
            { L: 10.0, bw: 35.0, h: 80.0, g: 45.0, q: 30.0 },
            { L: 8.0, bw: 35.0, h: 80.0, g: 45.0, q: 30.0 }
        ];
    }

    renderSpansTable();
    triggerBeamCalculation();
}

function renderSpansTable() {
    const tbody = document.getElementById('tbody-spans');
    if (!tbody) return;
    tbody.innerHTML = '';

    beamSpans.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="p-2 font-bold text-gray-700 dark:text-gray-300">Vão ${idx + 1}</td>
            <td class="p-2"><input type="number" step="0.1" min="1.0" value="${s.L}" oninput="updateSpanProp(${idx}, 'L', this.value)" class="w-16 rounded border p-1 bg-white dark:bg-gray-700"></td>
            <td class="p-2"><input type="number" step="1" min="10" value="${s.bw}" oninput="updateSpanProp(${idx}, 'bw', this.value)" class="w-16 rounded border p-1 bg-white dark:bg-gray-700"></td>
            <td class="p-2"><input type="number" step="1" min="15" value="${s.h}" oninput="updateSpanProp(${idx}, 'h', this.value)" class="w-16 rounded border p-1 bg-white dark:bg-gray-700"></td>
            <td class="p-2"><input type="number" step="1" min="0" value="${s.g}" oninput="updateSpanProp(${idx}, 'g', this.value)" class="w-16 rounded border p-1 bg-white dark:bg-gray-700"></td>
            <td class="p-2"><input type="number" step="1" min="0" value="${s.q}" oninput="updateSpanProp(${idx}, 'q', this.value)" class="w-16 rounded border p-1 bg-white dark:bg-gray-700"></td>
            <td class="p-2 text-center">
                <button type="button" onclick="removeSpanRow(${idx})" class="text-rose-500 hover:text-rose-700 font-bold" ${beamSpans.length <= 1 ? 'disabled style="opacity:0.3"' : ''}>✕</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('count-spans').innerText = beamSpans.length;
}

function updateSpanProp(idx, prop, val) {
    if (beamSpans[idx]) {
        beamSpans[idx][prop] = parseFloat(val) || 0;
        triggerBeamCalculation();
    }
}

function addSpanRow() {
    const last = beamSpans[beamSpans.length - 1] || { L: 5.0, bw: 20.0, h: 50.0, g: 20.0, q: 10.0 };
    beamSpans.push({ L: last.L, bw: last.bw, h: last.h, g: last.g, q: last.q });
    renderSpansTable();
    triggerBeamCalculation();
}

function removeSpanRow(idx) {
    if (beamSpans.length > 1) {
        beamSpans.splice(idx, 1);
        renderSpansTable();
        triggerBeamCalculation();
    }
}

function getBeamNormalizedData(res) {
    if (!res) return { spans_detailed: [], geometry: { total_length: 0 }, envelope: null, takeoff: null };

    // Support both res.spans_detailed and fallback from res.spans
    const spans = res.spans_detailed || (res.spans ? res.spans.map((s, idx) => ({
        span_id: s.span_idx || s.span_id || (idx + 1),
        L: s.L || s.length || 5.0,
        M_pos_d: s.M_pos_max || s.M_pos_d || 0,
        M_neg_d_left: s.M_neg_left || s.M_neg_d_left || 0,
        flexure_pos: s.flexure_pos || { As_req: s.design?.As_pos || 0, bar_suggestion: s.design?.pos_detail || '-' },
        flexure_neg_left: s.flexure_neg_left || { As_req: s.design?.As_neg || 0, bar_suggestion: s.design?.neg_detail || '-' },
        shear: s.shear || { stirrups_suggestion: s.design?.stirrup_detail || '-' },
        crack: s.crack || { is_safe: (s.design?.wk || 0) <= 0.3, wk_mm: s.design?.wk || 0 },
        deflection: s.deflection || { is_safe: (s.design?.defl_mm || 0) <= (s.design?.defl_lim_mm || 999), a_total_cm: (s.design?.defl_mm || 0) / 10.0 }
    })) : []);

    const takeoff = res.takeoff || {
        concrete_volume_m3: res.summary?.concrete_volume || 0,
        formwork_area_m2: res.summary?.formwork_area || 0,
        steel_mass_kg: res.summary?.total_steel_kg || 0
    };

    const geometry = res.geometry || {
        total_length: res.summary?.total_length || (spans.reduce((acc, sp) => acc + (sp.L || 0), 0)),
        num_spans: spans.length
    };

    let envelope = res.envelope;
    if (!envelope && res.spans) {
        let x = [], M_max = [], M_min = [];
        res.spans.forEach(s => {
            if (s.xs_global) x.push(...s.xs_global);
            if (s.Md_max) M_max.push(...s.Md_max);
            if (s.Md_min) M_min.push(...s.Md_min);
        });
        if (x.length > 0) envelope = { x, M_max, M_min };
    }

    return { spans_detailed: spans, takeoff, geometry, envelope };
}

async function triggerBeamCalculation() {
    const modelData = {
        fck: parseFloat(document.getElementById('beam-fck')?.value || 30),
        d_prime: (parseFloat(document.getElementById('beam-dprime')?.value || 4.0)) / 100.0, // convert cm to m
        caa: document.getElementById('beam-caa')?.value || 'II',
        delta: parseFloat(document.getElementById('beam-delta')?.value || 0.90),
        spans: beamSpans.map(s => ({
            L: s.L,
            length: s.L,
            bw: s.bw / 100.0, // convert cm to m
            h: s.h / 100.0,
            g: s.g,
            q: s.q
        }))
    };

    try {
        if (window.eel && eel.calculate_continuous_rc_beam) {
            const res = await eel.calculate_continuous_rc_beam(modelData)();
            if (res && res.status === 'success') {
                beamResults = res;
                const normalized = getBeamNormalizedData(res);
                updateBillOfMaterials(normalized.takeoff);
                renderDetailingTable(normalized);
                drawEnvelopeCanvas(normalized);
            } else if (res && res.error) {
                console.error("Erro no cálculo da viga contínua:", res.error);
            }
        }
    } catch (err) {
        console.error("Erro chamando calculate_continuous_rc_beam:", err);
    }
}

function updateBillOfMaterials(takeoff) {
    if (!takeoff) return;
    document.getElementById('res-bom-vol').innerText = (takeoff.concrete_volume_m3 || 0).toFixed(2);
    document.getElementById('res-bom-forms').innerText = (takeoff.formwork_area_m2 || 0).toFixed(1);
    document.getElementById('res-bom-steel').innerText = (takeoff.steel_mass_kg || 0).toFixed(0);
}

function renderDetailingTable(res) {
    const tbody = document.getElementById('tbody-rebar-results');
    if (!tbody) return;
    tbody.innerHTML = '';

    const data = getBeamNormalizedData(res);
    data.spans_detailed.forEach(s => {
        // Sagging (vão)
        const trSpan = document.createElement('tr');
        trSpan.innerHTML = `
            <td class="p-2.5 font-bold text-blue-600">Vão ${s.span_id} (Positivo)</td>
            <td class="p-2.5 font-semibold">${(s.M_pos_d || 0).toFixed(1)} kNm</td>
            <td class="p-2.5">${(s.flexure_pos?.As_req || 0).toFixed(2)} cm²</td>
            <td class="p-2.5 font-bold text-gray-900 dark:text-gray-100">${s.flexure_pos?.bar_suggestion || '-'}</td>
            <td class="p-2.5">${s.shear?.stirrups_suggestion || '-'}</td>
            <td class="p-2.5 ${s.crack?.is_safe ? 'text-emerald-600' : 'text-rose-600 font-bold'}">
                ${(s.crack?.wk_mm || 0).toFixed(2)} mm ${s.crack?.is_safe ? '✓' : '⚠'}
            </td>
            <td class="p-2.5 ${s.deflection?.is_safe ? 'text-emerald-600' : 'text-rose-600 font-bold'}">
                ${(s.deflection?.a_total_cm || 0).toFixed(2)} cm ${s.deflection?.is_safe ? '✓' : '⚠'}
            </td>
        `;
        tbody.appendChild(trSpan);

        // Hogging at left support (if internal)
        if (s.span_id > 1 && s.flexure_neg_left) {
            const trSupp = document.createElement('tr');
            trSupp.className = 'bg-rose-50/50 dark:bg-rose-950/20';
            trSupp.innerHTML = `
                <td class="p-2.5 font-bold text-rose-600">Apoio P${s.span_id} (Negativo)</td>
                <td class="p-2.5 font-semibold">${(s.M_neg_d_left || 0).toFixed(1)} kNm</td>
                <td class="p-2.5">${(s.flexure_neg_left?.As_req || 0).toFixed(2)} cm²</td>
                <td class="p-2.5 font-bold text-gray-900 dark:text-gray-100">${s.flexure_neg_left?.bar_suggestion || '-'}</td>
                <td class="p-2.5 text-gray-400">-</td>
                <td class="p-2.5 text-gray-400">-</td>
                <td class="p-2.5 text-gray-400">-</td>
            `;
            tbody.appendChild(trSupp);
        }
    });
}

// -------------------------------------------------------------
// 2D Moment Envelope Canvas Renderer
// -------------------------------------------------------------
function drawEnvelopeCanvas(res) {
    const canvas = document.getElementById('beam-envelope-canvas');
    const data = getBeamNormalizedData(res);
    if (!canvas || !data.envelope || !data.envelope.x || data.envelope.x.length === 0) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    const isDark = document.documentElement.classList.contains('dark') || true;

    // 1. Unified CAD Blueprint Background & Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, width, height, isDark);
        EngCAD.drawGrid(ctx, width, height, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
    }

    const env = data.envelope;
    const totalL = data.geometry?.total_length || 1;
    const marginX = 45;
    const drawW = width - 2 * marginX;

    // Brazilian tension convention:
    // Positive moment (sagging) creates tension at the bottom -> plotted DOWNWARDS (+Y canvas)
    // Negative moment (hogging) creates tension at the top -> plotted UPWARDS (-Y canvas)
    const zeroY = height * 0.45;

    let absMaxM = 1.0;
    if (env.M_max) env.M_max.forEach(v => { if (Math.abs(v) > absMaxM) absMaxM = Math.abs(v); });
    if (env.M_min) env.M_min.forEach(v => { if (Math.abs(v) > absMaxM) absMaxM = Math.abs(v); });

    const scaleX = drawW / totalL;
    const scaleM = (height * 0.38) / absMaxM;

    // 1. Draw Axis
    ctx.strokeStyle = isDark ? '#64748b' : '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginX, zeroY);
    ctx.lineTo(marginX + drawW, zeroY);
    ctx.stroke();

    // 2. Draw Supports
    let curX = 0;
    data.spans_detailed.forEach((s, idx) => {
        drawSupportTriangle(ctx, marginX + curX * scaleX, zeroY, `P${idx + 1}`, isDark);
        curX += s.L;
    });
    // Final support
    drawSupportTriangle(ctx, marginX + curX * scaleX, zeroY, `P${data.spans_detailed.length + 1}`, isDark);

    // 3. Draw Envelope Shaded Region (between M_min and M_max)
    ctx.beginPath();
    // M_max line (Brazilian: positive M goes DOWN => zeroY + M * scaleM)
    for (let i = 0; i < env.x.length; i++) {
        const px = marginX + env.x[i] * scaleX;
        const py = zeroY + env.M_max[i] * scaleM;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    // M_min line back
    for (let i = env.x.length - 1; i >= 0; i--) {
        const px = marginX + env.x[i] * scaleX;
        const py = zeroY + env.M_min[i] * scaleM;
        ctx.lineTo(px, py);
    }
    ctx.closePath();

    ctx.fillStyle = 'rgba(59, 130, 246, 0.20)';
    ctx.fill();

    // 4. Draw Stroke Curves
    // Positive boundary (Blue)
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < env.x.length; i++) {
        const px = marginX + env.x[i] * scaleX;
        const py = zeroY + env.M_max[i] * scaleM;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Negative boundary (Red)
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < env.x.length; i++) {
        const px = marginX + env.x[i] * scaleX;
        const py = zeroY + env.M_min[i] * scaleM;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // 5. Annotations: Peak Positive & Negative Moments
    data.spans_detailed.forEach(s => {
        // Pos peak
        const xPos = marginX + (s.span_id - 0.5) * s.L * scaleX;
        const yPos = zeroY + s.M_pos_d * scaleM;
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText(`+${s.M_pos_d.toFixed(1)}`, xPos - 14, yPos + 16);

        // Neg peak (left support)
        if (s.M_neg_d_left < -1.0) {
            const xNeg = marginX + (s.span_id - 1) * s.L * scaleX;
            const yNeg = zeroY + s.M_neg_d_left * scaleM;
            ctx.fillStyle = '#f87171';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.fillText(`${s.M_neg_d_left.toFixed(1)}`, xNeg - 12, yNeg - 8);
        }
    });

    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        EngCAD.updateHUD(canvas.parentElement, 'Envoltória de Momentos Fletores', [
            { label: 'Vãos Totais', value: `${data.spans_detailed.length} vãos (${totalL.toFixed(1)}m)` },
            { label: 'Momento Máx. (+)', value: `+${absMaxM.toFixed(1)} kN·m`, color: '#38bdf8' },
            { label: 'Convenção', value: 'NBR 6118 (Tração Embaixo)' }
        ]);
    }
}

function drawSupportTriangle(ctx, px, py, name, isDark) {
    ctx.fillStyle = isDark ? '#38bdf8' : '#0284c7';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - 7, py + 12);
    ctx.lineTo(px + 7, py + 12);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(name, px - 6, py + 24);
}

window.loadBeamPreset = loadBeamPreset;
window.triggerBeamCalculation = triggerBeamCalculation;
window.updateSpanProp = updateSpanProp;
window.addSpanRow = addSpanRow;
window.removeSpanRow = removeSpanRow;
