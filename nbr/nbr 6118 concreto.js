/**
 * Unified Reinforced Concrete Cross-Section Calculator (M-N-V)
 * ABNT NBR 6118:2023 | ACI 318-22 | Eurocode 2 (EN 1992-1-1)
 * Combines Beam Flexure, Shear, and PCalc M-N Interaction Surface
 */

const nbr6118InputIds = [
    'fck', 'fyk', 'bw', 'h', 'c',
    'num_barras', 'diam_barra',
    'num_barras_top', 'diam_barra_top',
    's_estribo', 'diam_estribo', 'pernas_estribo',
    'Msd', 'Vsd', 'Nsd'
];

let activeRebarMode = 'beam'; // 'beam' | 'bars'
let customBars = [];

const PRESETS = {
    convencional: {
        fck: 30, fyk: 500, bw: 20, h: 50, c: 3.0,
        num_barras: 4, diam_barra: '16.0',
        num_barras_top: 2, diam_barra_top: '10.0',
        diam_estribo: '8.0', pernas_estribo: 2, s_estribo: 15,
        Msd: 100, Vsd: 60, Nsd: 0
    },
    baldrame: {
        fck: 30, fyk: 500, bw: 25, h: 60, c: 3.5,
        num_barras: 4, diam_barra: '16.0',
        num_barras_top: 2, diam_barra_top: '12.5',
        diam_estribo: '8.0', pernas_estribo: 2, s_estribo: 15,
        Msd: 120, Vsd: 80, Nsd: -250
    },
    tirante: {
        fck: 30, fyk: 500, bw: 25, h: 50, c: 3.0,
        num_barras: 4, diam_barra: '20.0',
        num_barras_top: 2, diam_barra_top: '12.5',
        diam_estribo: '8.0', pernas_estribo: 2, s_estribo: 12,
        Msd: 70, Vsd: 40, Nsd: 150
    },
    transicao: {
        fck: 40, fyk: 500, bw: 35, h: 90, c: 4.0,
        num_barras: 6, diam_barra: '25.0',
        num_barras_top: 4, diam_barra_top: '16.0',
        diam_estribo: '10.0', pernas_estribo: 4, s_estribo: 10,
        Msd: 450, Vsd: 250, Nsd: -200
    },
    dupla_armadura: {
        fck: 25, fyk: 500, bw: 25, h: 55, c: 3.0,
        num_barras: 4, diam_barra: '20.0',
        num_barras_top: 4, diam_barra_top: '16.0',
        diam_estribo: '8.0', pernas_estribo: 2, s_estribo: 12,
        Msd: 220, Vsd: 90, Nsd: 0
    }
};

function switchRebarMode(mode) {
    activeRebarMode = mode;
    const btnBeam = document.getElementById('tab-btn-beam');
    const btnBars = document.getElementById('tab-btn-bars');
    const viewBeam = document.getElementById('rebar-mode-beam');
    const viewBars = document.getElementById('rebar-mode-bars');

    if (mode === 'beam') {
        btnBeam?.classList.add('active');
        btnBars?.classList.remove('active');
        viewBeam?.classList.remove('hidden');
        viewBars?.classList.add('hidden');
    } else {
        btnBars?.classList.add('active');
        btnBeam?.classList.remove('active');
        viewBars?.classList.remove('hidden');
        viewBeam?.classList.add('hidden');
        if (customBars.length === 0) {
            generateRebarPattern();
        } else {
            renderBarsTable();
        }
    }
    updateRebarPreviews();
    if (typeof handleRunNbrCheck === 'function') handleRunNbrCheck();
}

function generateRebarPattern() {
    const bw = parseFloat(document.getElementById('bw')?.value || 20);
    const h = parseFloat(document.getElementById('h')?.value || 50);
    const c = parseFloat(document.getElementById('c')?.value || 3);
    const nBot = parseInt(document.getElementById('num_barras')?.value || 4);
    const dBot = parseFloat(document.getElementById('diam_barra')?.value || 16);
    const nTop = parseInt(document.getElementById('num_barras_top')?.value || 2);
    const dTop = parseFloat(document.getElementById('diam_barra_top')?.value || 10);

    customBars = [];
    const effX1 = c + 1.0;
    const effX2 = bw - c - 1.0;
    const effYBot = c + 1.0;
    const effYTop = h - c - 1.0;

    // Bottom row
    for (let i = 0; i < nBot; i++) {
        const x = nBot > 1 ? effX1 + i * (effX2 - effX1) / (nBot - 1) : bw / 2;
        customBars.push({ x: round(x, 1), y: round(effYBot, 1), diametro: dBot });
    }

    // Top row
    for (let i = 0; i < nTop; i++) {
        const x = nTop > 1 ? effX1 + i * (effX2 - effX1) / (nTop - 1) : bw / 2;
        customBars.push({ x: round(x, 1), y: round(effYTop, 1), diametro: dTop });
    }

    renderBarsTable();
}

function renderBarsTable() {
    const tbody = document.getElementById('bars-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    customBars.forEach((bar, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50';
        tr.innerHTML = `
            <td class="px-2 py-1"><input type="number" step="0.5" value="${bar.x}" onchange="updateBarProp(${idx}, 'x', this.value)" class="w-16 p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600"></td>
            <td class="px-2 py-1"><input type="number" step="0.5" value="${bar.y}" onchange="updateBarProp(${idx}, 'y', this.value)" class="w-16 p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600"></td>
            <td class="px-2 py-1">
                <select onchange="updateBarProp(${idx}, 'diametro', this.value)" class="p-1 border rounded text-xs dark:bg-gray-700 dark:border-gray-600">
                    ${[6.3, 8.0, 10.0, 12.5, 16.0, 20.0, 25.0, 32.0].map(d => `<option value="${d}" ${d === bar.diametro ? 'selected' : ''}>${d} mm</option>`).join('')}
                </select>
            </td>
            <td class="px-2 py-1 text-center">
                <button type="button" onclick="removeBar(${idx})" class="text-red-500 hover:text-red-700 text-xs font-bold">&times;</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateBarProp(idx, prop, val) {
    if (customBars[idx]) {
        customBars[idx][prop] = parseFloat(val);
        if (typeof handleRunNbrCheck === 'function') handleRunNbrCheck();
    }
}

function addRebarRow() {
    const bw = parseFloat(document.getElementById('bw')?.value || 20);
    const h = parseFloat(document.getElementById('h')?.value || 50);
    customBars.push({ x: round(bw / 2, 1), y: round(h / 2, 1), diametro: 16.0 });
    renderBarsTable();
    if (typeof handleRunNbrCheck === 'function') handleRunNbrCheck();
}

function removeBar(idx) {
    customBars.splice(idx, 1);
    renderBarsTable();
    if (typeof handleRunNbrCheck === 'function') handleRunNbrCheck();
}

function round(val, dec = 2) {
    return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec);
}

function setConcreteCode(code) {
    const input = document.getElementById('selected_code');
    if (input) input.value = code;

    const btns = {
        nbr: document.getElementById('code-btn-nbr'),
        aci: document.getElementById('code-btn-aci'),
        ec2: document.getElementById('code-btn-ec2'),
        all: document.getElementById('code-btn-all')
    };

    const baseClass = "flex-1 md:flex-initial px-3.5 py-2 rounded-xl text-xs font-semibold transition-all text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 flex items-center justify-center gap-1.5";
    Object.values(btns).forEach(b => { if (b) b.className = baseClass; });

    const activeBtn = btns[code];
    const badge = document.getElementById('active-code-badge');
    const sfTitle = document.getElementById('sf-title');
    const sfVals = document.getElementById('sf-vals');
    const sfDesc = document.getElementById('sf-desc');

    if (code === 'nbr') {
        if (activeBtn) activeBtn.className = "flex-1 md:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm bg-emerald-600 text-white border border-emerald-500/30 flex items-center justify-center gap-1.5";
        if (badge) {
            badge.textContent = "NBR 6118:2023";
            badge.className = "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider";
        }
        if (sfTitle) sfTitle.innerHTML = "🇧🇷 Fatores de Segurança NBR 6118:2023";
        if (sfVals) sfVals.innerHTML = "&gamma;<sub>c</sub> = 1.40 | &gamma;<sub>s</sub> = 1.15";
        if (sfDesc) sfDesc.innerHTML = "Flexão: Domínios 2/3 (x/d &le; 0.45) • Cortante Modelo I com termo axial (&sigma;<sub>cp</sub>)";
    } else if (code === 'aci') {
        if (activeBtn) activeBtn.className = "flex-1 md:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm bg-blue-600 text-white border border-blue-500/30 flex items-center justify-center gap-1.5";
        if (badge) {
            badge.textContent = "ACI 318-22";
            badge.className = "bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider";
        }
        if (sfTitle) sfTitle.innerHTML = "🇺🇸 Strength Reduction Factors ACI 318-22";
        if (sfVals) sfVals.innerHTML = "&phi;<sub>flex</sub> = 0.65 – 0.90 (&epsilon;<sub>t</sub>) | &phi;<sub>v</sub> = 0.75";
        if (sfDesc) sfDesc.innerHTML = "Whitney Stress Block (&beta;<sub>1</sub>) • Shear &phi;V<sub>c</sub> modificado por carga axial P<sub>u</sub>";
    } else if (code === 'ec2') {
        if (activeBtn) activeBtn.className = "flex-1 md:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm bg-indigo-600 text-white border border-indigo-500/30 flex items-center justify-center gap-1.5";
        if (badge) {
            badge.textContent = "Eurocode 2";
            badge.className = "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider";
        }
        if (sfTitle) sfTitle.innerHTML = "🇪🇺 Coeficientes Parciais Eurocode 2";
        if (sfVals) sfVals.innerHTML = "&gamma;<sub>C</sub> = 1.50 | &gamma;<sub>S</sub> = 1.15 | &alpha;<sub>cc</sub> = 1.0";
        if (sfDesc) sfDesc.innerHTML = "Bielas Inclinadas: cot&theta; = 2.5 (21.8&deg;) • V<sub>Rd,c</sub> com efeito &sigma;<sub>cp</sub> = N/A<sub>c</sub>";
    } else if (code === 'all') {
        if (activeBtn) activeBtn.className = "flex-1 md:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm bg-purple-600 text-white border border-purple-500/30 flex items-center justify-center gap-1.5";
        if (badge) {
            badge.textContent = "Comparativo Multi-Norma";
            badge.className = "bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wider";
        }
        if (sfTitle) sfTitle.innerHTML = "🌐 Comparação Integrada: NBR vs ACI vs EC2";
        if (sfVals) sfVals.innerHTML = "NBR: &gamma;<sub>c</sub>=1.4 | ACI: &phi;=0.90/0.75 | EC2: &gamma;<sub>C</sub>=1.5";
        if (sfDesc) sfDesc.innerHTML = "Análise simultânea das capacidades resistentes, taxas de trabalho e envoltórias M-N";
    }

    if (typeof handleRunNbrCheck === 'function') {
        handleRunNbrCheck();
    }
}

function loadPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;
    Object.keys(p).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = p[id];
    });
    updateRebarPreviews();
    if (typeof handleRunNbrCheck === 'function') {
        handleRunNbrCheck();
    }
}

function updateRebarPreviews() {
    const numBot = parseFloat(document.getElementById('num_barras')?.value || 0);
    const phiBot = parseFloat(document.getElementById('diam_barra')?.value || 0);
    const asBot = numBot * (Math.PI * Math.pow(phiBot / 10, 2) / 4);

    const asPreview = document.getElementById('as-preview');
    if (asPreview) {
        asPreview.innerHTML = `<span>As = <b>${asBot.toFixed(2)} cm²</b> (${numBot}&Phi;${phiBot} mm)</span>`;
    }

    const numTop = parseFloat(document.getElementById('num_barras_top')?.value || 0);
    const phiTop = parseFloat(document.getElementById('diam_barra_top')?.value || 0);
    const asTop = numTop * (Math.PI * Math.pow(phiTop / 10, 2) / 4);

    const asTopPreview = document.getElementById('as-top-preview');
    if (asTopPreview) {
        asTopPreview.innerHTML = `<span>As' = <b>${asTop.toFixed(2)} cm²</b> (${numTop}&Phi;${phiTop} mm)</span>`;
    }

    const phiEst = parseFloat(document.getElementById('diam_estribo')?.value || 6.3);
    const pernas = parseFloat(document.getElementById('pernas_estribo')?.value || 2);
    const s = parseFloat(document.getElementById('s_estribo')?.value || 15);
    const asw = pernas * (Math.PI * Math.pow(phiEst / 10, 2) / 4);
    const aswM = s > 0 ? (asw / s) * 100 : 0;

    const aswPreview = document.getElementById('asw-preview');
    if (aswPreview) {
        aswPreview.innerHTML = `<span>Asw/s = <b>${aswM.toFixed(2)} cm²/m</b> (${pernas} ramos &Phi;${phiEst} c/ ${s}cm)</span>`;
    }
}

/**
 * Technical CAD 2D Cross-Section Drawing (EngCAD Blueprint)
 */
function drawBeamCanvas(inputs, res) {
    const canvas = document.getElementById('beamCanvas');
    if (!canvas) return;

    const bw = parseFloat(inputs.bw) || 20;
    const h = parseFloat(inputs.h) || 50;
    const c = parseFloat(inputs.c) || 3;
    const numBot = parseInt(inputs.num_barras) || 3;
    const phiBot = (parseFloat(inputs.diam_barra) || 16) / 10.0;
    const numTop = parseInt(inputs.num_barras_top) || 2;
    const phiTop = (parseFloat(inputs.diam_barra_top) || 10) / 10.0;
    const phiEst = (parseFloat(inputs.diam_estribo) || 8) / 10.0;

    const flx = res?.flexure_details || {};
    const x_cm = flx.x || (h * 0.3);

    const cad = EngCAD.setupCanvas(canvas, 480, 320);
    if (!cad) return;
    const { ctx, width, height } = cad;
    const isDark = document.documentElement.classList.contains('dark') || true;

    EngCAD.drawBackground(ctx, width, height, isDark);
    EngCAD.drawGrid(ctx, width, height, { isDark, step: 24 });

    // Auto-scale to fit section inside canvas with generous margins for dimensions
    const marginX = 80;
    const marginY = 55;
    const availW = width - 2 * marginX;
    const availH = height - 2 * marginY;
    const scale = Math.min(availW / bw, availH / h);

    const secW = bw * scale;
    const secH = h * scale;
    const originX = (width - secW) / 2;
    const originY = (height - secH) / 2;

    // 1. Concrete Cross Section Body
    ctx.save();
    ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.07)' : 'rgba(241, 245, 249, 0.9)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.fillRect(originX, originY, secW, secH);
    ctx.strokeRect(originX, originY, secW, secH);

    // 2. Compressed Concrete Zone
    const compH = Math.min(secH, Math.max(2, (0.8 * x_cm) * scale));
    const compGrad = ctx.createLinearGradient(originX, originY, originX, originY + compH);
    compGrad.addColorStop(0, 'rgba(239, 68, 68, 0.32)');
    compGrad.addColorStop(1, 'rgba(239, 68, 68, 0.12)');
    ctx.fillStyle = compGrad;
    ctx.fillRect(originX, originY, secW, compH);

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(originX, originY + compH);
    ctx.lineTo(originX + secW, originY + compH);
    ctx.stroke();

    // 3. Neutral Axis (L.N.)
    const lnY = originY + x_cm * scale;
    EngCAD.drawNeutralAxis(ctx, originX - 15, lnY, originX + secW + 15, lnY, `L.N. (x = ${x_cm.toFixed(1)} cm)`, { isDark });

    // 4. Stirrup (Estribo) with corner bend radius
    const stX = originX + c * scale;
    const stY = originY + c * scale;
    const stW = Math.max(10, secW - 2 * c * scale);
    const stH = Math.max(10, secH - 2 * c * scale);
    EngCAD.drawStirrup(ctx, stX, stY, stW, stH, 8, { isDark, stroke: '#38bdf8', lineWidth: 2 });

    // 5. Reinforcement Bars
    if (activeRebarMode === 'bars' && customBars.length > 0) {
        customBars.forEach(b => {
            const bx = originX + b.x * scale;
            const by = originY + secH - b.y * scale;
            const rPx = Math.max(3, (b.diametro / 20.0) * scale);
            EngCAD.drawRebar(ctx, bx, by, rPx, { isDark, fill: '#3b82f6', stroke: '#1d4ed8' });
        });
    } else {
        // Bottom Steel Bars (As)
        const botY = originY + secH - (c + phiEst + phiBot / 2) * scale;
        const xStartBot = originX + (c + phiEst + phiBot / 2) * scale;
        const xEndBot = originX + secW - (c + phiEst + phiBot / 2) * scale;
        const rBotPx = Math.max(3, (phiBot * scale) / 2);

        for (let i = 0; i < numBot; i++) {
            const bx = numBot > 1 ? xStartBot + i * (xEndBot - xStartBot) / (numBot - 1) : originX + secW / 2;
            EngCAD.drawRebar(ctx, bx, botY, rBotPx, { isDark, fill: '#3b82f6', stroke: '#1d4ed8' });
        }

        // Top Steel Bars (As')
        if (numTop > 0) {
            const topY = originY + (c + phiEst + phiTop / 2) * scale;
            const xStartTop = originX + (c + phiEst + phiTop / 2) * scale;
            const xEndTop = originX + secW - (c + phiEst + phiTop / 2) * scale;
            const rTopPx = Math.max(2.5, (phiTop * scale) / 2);

            for (let i = 0; i < numTop; i++) {
                const bx = numTop > 1 ? xStartTop + i * (xEndTop - xStartTop) / (numTop - 1) : originX + secW / 2;
                EngCAD.drawRebar(ctx, bx, topY, rTopPx, { isDark, fill: '#f59e0b', stroke: '#b45309' });
            }
        }
    }

    // 6. Dimensions (Cotas) with crisp text pill knockout badges
    EngCAD.drawDimension(ctx, originX, originY + secH, originX + secW, originY + secH, `${bw} cm`, {
        offset: 28,
        isDark,
        font: "bold 11px 'Inter', sans-serif"
    });
    EngCAD.drawDimension(ctx, originX, originY + secH, originX, originY, `${h} cm`, {
        offset: -32,
        isDark,
        font: "bold 11px 'Inter', sans-serif"
    });
    ctx.restore();

    // 7. Live HUD Overlay
    const container = canvas.parentElement;
    if (container && typeof EngCAD.updateHUD === 'function') {
        const utilFlex = (res?.summary?.utilization_flexure || 0) * 100;
        const statusColor = (res?.summary?.is_safe) ? '#10b981' : '#ef4444';
        EngCAD.updateHUD(container, 'SEÇÃO CONCRETO ARMADO', [
            { label: 'Mrd', value: `${flx.Mrd_kNm || 0} kN·m`, color: '#38bdf8' },
            { label: 'VRd', value: `${res?.shear_details?.VRd || 0} kN`, color: '#c084fc' },
            { label: 'x/d', value: `${flx.x_d_ratio || 0}`, color: flx.is_ductile ? '#10b981' : '#ef4444' },
            { label: 'Status', value: res?.summary?.is_safe ? 'CONFORME' : 'NÃO PASSA', color: statusColor }
        ]);
    }
}

/**
 * Interactive M-N Interaction Diagram (Envoltória de Capacidade)
 */
function drawMnDiagram(inputs, res) {
    const canvas = document.getElementById('mnCanvas');
    if (!canvas) return;

    const curve = res?.mn_curve || { N: [], M: [] };
    const Msd = parseFloat(inputs.Msd) || 0;
    const Nsd = parseFloat(inputs.Nsd) || 0;

    const cad = EngCAD.setupCanvas(canvas, 480, 320);
    if (!cad) return;
    const { ctx, width, height } = cad;
    const isDark = document.documentElement.classList.contains('dark') || true;

    EngCAD.drawBackground(ctx, width, height, isDark);
    EngCAD.drawGrid(ctx, width, height, { isDark, step: 24 });

    if (!curve.N || curve.N.length === 0) {
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Calculando Envoltória M-N...', width / 2, height / 2);
        return;
    }

    // Determine domain bounds for M and N
    const maxM = Math.max(Msd * 1.25, ...curve.M, 50.0);
    const minN = Math.min(Nsd * 1.2, ...curve.N, -50.0); // Maximum compression
    const maxN = Math.max(Nsd * 1.2, ...curve.N, 50.0);  // Maximum tension

    const padLeft = 60;
    const padRight = 35;
    const padTop = 35;
    const padBot = 45;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBot;

    const toPxM = (m) => padLeft + (m / maxM) * plotW;
    // N: minN (bottom) to maxN (top)
    const toPxN = (n) => padTop + plotH - ((n - minN) / (maxN - minN)) * plotH;

    // Zero-lines
    const zeroN_Y = toPxN(0);
    ctx.strokeStyle = isDark ? 'rgba(148, 163, 184, 0.40)' : 'rgba(100, 116, 139, 0.40)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, zeroN_Y);
    ctx.lineTo(padLeft + plotW, zeroN_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill M-N Envelope area
    ctx.beginPath();
    for (let i = 0; i < curve.N.length; i++) {
        const px = toPxM(curve.M[i]);
        const py = toPxN(curve.N[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    // Close to zero M
    ctx.lineTo(padLeft, toPxN(curve.N[curve.N.length - 1]));
    ctx.lineTo(padLeft, toPxN(curve.N[0]));
    ctx.closePath();

    const envGrad = ctx.createLinearGradient(padLeft, padTop, padLeft + plotW, padTop + plotH);
    envGrad.addColorStop(0, 'rgba(59, 130, 246, 0.28)');
    envGrad.addColorStop(1, 'rgba(147, 51, 234, 0.12)');
    ctx.fillStyle = envGrad;
    ctx.fill();

    // Stroke Envelope curve
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < curve.N.length; i++) {
        const px = toPxM(curve.M[i]);
        const py = toPxN(curve.N[i]);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Design operating load point (Msd, Nsd)
    const ptX = toPxM(Msd);
    const ptY = toPxN(Nsd);

    // Crosshairs
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(padLeft, ptY);
    ctx.lineTo(ptX, ptY);
    ctx.lineTo(ptX, padTop + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Glowing Point
    ctx.beginPath();
    ctx.arc(ptX, ptY, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ptX, ptY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    // Point label badge
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    const ptLabel = `(${Msd.toFixed(0)} kNm, ${Nsd.toFixed(0)} kN)`;
    const textW = ctx.measureText(ptLabel).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(ptX + 7, ptY - 18, textW + 12, 18, 4);
        ctx.fill();
        ctx.stroke();
    }
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(ptLabel, ptX + 13, ptY - 5);

    // Axes and Labels
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
    ctx.textAlign = 'center';
    ctx.fillText('Momento Fletor M [kN·m]', padLeft + plotW / 2, height - 10);

    ctx.save();
    ctx.translate(14, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Força Normal N [kN] (Compr. < 0 < Tração)', 0, 0);
    ctx.restore();

    // Ticks on axes
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
    ctx.textAlign = 'right';
    ctx.fillText(`${maxN.toFixed(0)}`, padLeft - 6, toPxN(maxN) + 3);
    ctx.fillText(`0`, padLeft - 6, zeroN_Y + 3);
    ctx.fillText(`${minN.toFixed(0)}`, padLeft - 6, toPxN(minN) + 3);

    ctx.textAlign = 'center';
    ctx.fillText('0', padLeft, padTop + plotH + 16);
    ctx.fillText(`${(maxM / 2).toFixed(0)}`, padLeft + plotW / 2, padTop + plotH + 16);
    ctx.fillText(`${maxM.toFixed(0)}`, padLeft + plotW, padTop + plotH + 16);
}

/**
 * Renders executive KPI summary, verification breakdown table and report
 */
function renderNbrResults(data) {
    if (!data) return;

    const res = data.results || {};
    const inputs = data.inputs || {};
    const active_code = data.active_code || 'nbr';
    const comp = data.comparison || [];

    const flx = res.flexure_details || {};
    const shr = res.shear_details || {};
    const sum = res.summary || {};

    // 1. Status Banner
    const banner = document.getElementById('status-banner');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusSub = document.getElementById('status-subtitle');
    const statusBadge = document.getElementById('status-ratio-badge');

    const isSafe = sum.is_safe;
    const maxUtilPct = ((sum.max_util || 0) * 100.0).toFixed(1);

    if (banner) {
        if (isSafe) {
            banner.className = "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-4 flex items-center justify-between shadow-sm";
            if (statusIcon) statusIcon.textContent = "✅";
            if (statusTitle) {
                statusTitle.textContent = "SEÇÃO CONFORME (SEGURANÇA ATENDIDA)";
                statusTitle.className = "text-base font-bold text-emerald-800 dark:text-emerald-300";
            }
            if (statusSub) {
                statusSub.textContent = `Todos os critérios (${res.code_name || 'ELU'}) foram atendidos satisfatoriamente.`;
                statusSub.className = "text-xs text-emerald-700 dark:text-emerald-400";
            }
            if (statusBadge) {
                statusBadge.textContent = `Max Util: ${maxUtilPct}%`;
                statusBadge.className = "inline-block bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider";
            }
        } else {
            banner.className = "bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-700 rounded-xl p-4 flex items-center justify-between shadow-sm";
            if (statusIcon) statusIcon.textContent = "❌";
            if (statusTitle) {
                statusTitle.textContent = "SEÇÃO NÃO CONFORME (CAPACIDADE ESGOTADA)";
                statusTitle.className = "text-base font-bold text-red-800 dark:text-red-300";
            }
            if (statusSub) {
                statusSub.textContent = `A seção atinge limite crítico em ${sum.governing_failure || 'Dimensionamento'}. Redimensione altura ou armaduras.`;
                statusSub.className = "text-xs text-red-700 dark:text-red-400";
            }
            if (statusBadge) {
                statusBadge.textContent = `Max Util: ${maxUtilPct}%`;
                statusBadge.className = "inline-block bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider";
            }
        }
    }

    // 2. KPI Cards
    const flexUtilPct = ((sum.utilization_flexure || 0) * 100.0).toFixed(1);
    const shearUtilPct = ((sum.utilization_shear || 0) * 100.0).toFixed(1);
    const bielaUtilPct = ((sum.utilization_biela || 0) * 100.0).toFixed(1);

    updateKpi('kpi-flexure-val', 'kpi-flexure-badge', 'kpi-flexure-bar', 'kpi-flexure-detail',
        `${flexUtilPct}%`, sum.utilization_flexure <= 1.0, flexUtilPct,
        `${inputs.Msd || 0} / ${flx.Mrd_kNm || 0} kN·m`);

    updateKpi('kpi-shear-val', 'kpi-shear-badge', 'kpi-shear-bar', 'kpi-shear-detail',
        `${shearUtilPct}%`, sum.utilization_shear <= 1.0, shearUtilPct,
        `${inputs.Vsd || 0} / ${shr.VRd || 0} kN`);

    updateKpi('kpi-biela-val', 'kpi-biela-badge', 'kpi-biela-bar', 'kpi-biela-detail',
        `${bielaUtilPct}%`, sum.utilization_biela <= 1.0, bielaUtilPct,
        `${inputs.Vsd || 0} / ${shr.VRd2 || 0} kN`);

    const kpiDom = document.getElementById('kpi-dom-val');
    const kpiRho = document.getElementById('kpi-rho-val');
    const kpiXdBar = document.getElementById('kpi-xd-bar');
    const kpiXdDet = document.getElementById('kpi-xd-detail');
    if (kpiDom) kpiDom.textContent = flx.dominio || 'Domínio 3';
    if (kpiRho) kpiRho.textContent = `ρ=${flx.rho_s_pct || 0}%`;
    if (kpiXdBar) kpiXdBar.style.width = `${Math.min(100, ((flx.x_d_ratio || 0) / (flx.x_d_limit || 0.45)) * 100)}%`;
    if (kpiXdDet) kpiXdDet.textContent = `x/d = ${flx.x_d_ratio || 0} (lim: ${flx.x_d_limit || 0.45})`;

    // 3. Draw Both 2D CAD Section and M-N Interaction Diagram
    drawBeamCanvas(inputs, res);
    drawMnDiagram(inputs, res);

    // 4. Report & Breakdown Table
    renderDetailedReport(data);
}

function updateKpi(valId, badgeId, barId, detId, valText, isPass, pctVal, detText) {
    const elVal = document.getElementById(valId);
    const elBadge = document.getElementById(badgeId);
    const elBar = document.getElementById(barId);
    const elDet = document.getElementById(detId);

    if (elVal) elVal.textContent = valText;
    if (elBadge) {
        elBadge.textContent = isPass ? 'OK' : 'FALHA';
        elBadge.className = isPass
            ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400'
            : 'text-xs font-semibold text-red-600 dark:text-red-400';
    }
    if (elBar) {
        elBar.style.width = `${Math.min(100, Math.max(0, pctVal))}%`;
        elBar.className = isPass ? 'bg-emerald-500 h-full rounded-full' : 'bg-red-500 h-full rounded-full';
    }
    if (elDet) elDet.textContent = detText;
}

function renderDetailedReport(data) {
    const report = new CalculationReport({
        title: 'Memória de Cálculo da Seção de Concreto Armado',
        subtitle: `Norma: ${data.results?.code_name || 'ABNT NBR 6118:2023'} • Flexão, Esforço Normal & Cisalhamento`,
        author: 'Antigravity Concrete Engine'
    });

    const active_code = data.active_code || 'nbr';
    const comp = data.comparison || [];
    const res = data.results || {};
    const flx = res.flexure_details || {};
    const shr = res.shear_details || {};
    const sum = res.summary || {};
    const inp = data.inputs || {};

    if (active_code === 'all') {
        const compRows = comp.map(c => [
            `${c.flag} ${c.code_name}`,
            c.factors,
            `${c.Mrd_kNm} kN·m`,
            `${c.util_flex_pct}%`,
            `${c.VRd_kN} kN`,
            `${c.util_shear_pct}%`,
            `${c.max_util_pct}%`,
            c.is_safe ? '<span class="text-emerald-600 font-bold">✓ Conforme</span>' : '<span class="text-red-600 font-bold">✗ Falha</span>'
        ]);

        report.addTableSection('Comparativo Multi-Normativo de Capacidade', {
            headers: ['Norma', 'Coeficientes', 'Momento Mrd', 'Util. Flexão', 'Cortante VRd', 'Util. Cortante', 'Max Util', 'Status'],
            rows: compRows
        }, 'multi-code-table');
    }

    // Standard check rows
    const checks = [
        {
            name: 'Flexão com Esforço Normal (M-N)',
            sd: `${inp.Msd} kN·m (N=${inp.Nsd || 0} kN)`,
            rd: `${flx.Mrd_kNm} kN·m`,
            ratio: `${sum.utilization_flexure}`,
            pct: `${(sum.utilization_flexure * 100).toFixed(1)}%`,
            ok: sum.utilization_flexure <= 1.0,
            detail: `Linha neutra x = ${flx.x} cm, x/d = ${flx.x_d_ratio} (lim: ${flx.x_d_limit}). ${flx.dominio}`
        },
        {
            name: 'Cisalhamento (Armadura Transversal)',
            sd: `${inp.Vsd} kN`,
            rd: `${shr.VRd} kN`,
            ratio: `${sum.utilization_shear}`,
            pct: `${(sum.utilization_shear * 100).toFixed(1)}%`,
            ok: sum.utilization_shear <= 1.0,
            detail: `Vc = ${shr.Vc} kN, Vsw = ${shr.Vsw} kN, Asw/s = ${shr.Asw_per_m} cm²/m`
        },
        {
            name: 'Esmagamento da Biela de Compressão',
            sd: `${inp.Vsd} kN`,
            rd: `${shr.VRd2} kN`,
            ratio: `${sum.utilization_biela}`,
            pct: `${(sum.utilization_biela * 100).toFixed(1)}%`,
            ok: sum.utilization_biela <= 1.0,
            detail: `Tensão de compressão na biela de concreto dentro do limite resistente`
        },
        {
            name: 'Armadura Mínima e Ductilidade',
            sd: `As = ${flx.As} cm²`,
            rd: `As,min = ${flx.As_min} cm²`,
            ratio: `${round(flx.As_min / flx.As, 3)}`,
            pct: `${round((flx.As / flx.As_min) * 100, 1)}%`,
            ok: flx.As >= flx.As_min && flx.is_ductile,
            detail: `Taxa geométrica ρ = ${flx.rho_s_pct}% (máx: 4.0%). Ductilidade atendida.`
        }
    ];

    const tableRows = checks.map(c => [
        `<b>${c.name}</b><br><span class="text-[11px] text-gray-500">${c.detail}</span>`,
        c.sd,
        c.rd,
        c.ratio,
        c.pct,
        c.ok ? '<span class="text-emerald-600 font-bold">OK</span>' : '<span class="text-red-600 font-bold">NÃO ATENDE</span>'
    ]);

    report.addTableSection(`Verificações Normativas de Dimensionamento (${res.code_name || 'ELU'})`, {
        headers: ['Verificação', 'Solicitante (Sd)', 'Resistente (Rd)', 'Razão', 'Utilização', 'Status'],
        rows: tableRows
    }, 'concrete-checks-table');

    report.render('results-container');
}

// Calculation Handler
var handleRunNbrCheck = createCalculationHandler({
    inputIds: nbr6118InputIds,
    storageKey: 'concrete-section-inputs',
    validationRuleKey: 'nbr_concreto',
    calculatorFunction: async (inputs) => {
        const i = { ...inputs };
        i.code = document.getElementById('selected_code')?.value || 'nbr';
        if (activeRebarMode === 'bars' && customBars.length > 0) {
            i.bars = customBars;
        }

        if (window.eel && (window.eel.calculate_concrete_beam || window.eel.calculate_nbr_concrete)) {
            const eelFn = window.eel.calculate_concrete_beam || window.eel.calculate_nbr_concrete;
            const res = await eelFn(i)();
            if (res && res.results) {
                return res;
            }
        }
        return null;
    },
    renderFunction: renderNbrResults,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn'
});

document.addEventListener('DOMContentLoaded', () => {
    nbr6118InputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                updateRebarPreviews();
            });
            el.addEventListener('change', () => {
                updateRebarPreviews();
                if (typeof handleRunNbrCheck === 'function') handleRunNbrCheck();
            });
        }
    });

    window.addEventListener('resize', () => {
        if (typeof handleRunNbrCheck === 'function') handleRunNbrCheck();
    });

    updateRebarPreviews();
    setTimeout(() => {
        if (typeof handleRunNbrCheck === 'function') handleRunNbrCheck();
    }, 150);
});

initializeApp({
    inputIds: nbr6118InputIds,
    calculationHandler: handleRunNbrCheck
});