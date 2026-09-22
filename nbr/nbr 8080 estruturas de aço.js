var nbr8800InputIds = [
    'fy', 'E', 'd', 'bf', 'tf', 'tw', 'Ag', 'Zx', 'rx', 'ry',
    'Lb', 'Cb', 'Nsd', 'Msdx'
];

var GERDAU_W_PROFILES = {
    'W 530 x 82.0': { d: 528, bf: 209, tf: 13.3, tw: 8.9, Ag: 10500, Zx: 2060000, rx: 213, ry: 43.8 },
    'W 410 x 53.0': { d: 403, bf: 177, tf: 10.9, tw: 7.5, Ag: 6800, Zx: 1060000, rx: 167, ry: 38.6 },
    'W 360 x 44.0': { d: 352, bf: 171, tf: 9.8, tw: 6.9, Ag: 5710, Zx: 779000, rx: 146, ry: 37.8 },
    'W 310 x 38.7': { d: 310, bf: 165, tf: 9.7, tw: 5.8, Ag: 4980, Zx: 616000, rx: 130, ry: 37.1 },
    'W 250 x 32.7': { d: 258, bf: 146, tf: 9.1, tw: 6.1, Ag: 4210, Zx: 433000, rx: 108, ry: 32.8 },
    'W 200 x 22.5': { d: 206, bf: 102, tf: 8.0, tw: 6.2, Ag: 2900, Zx: 251000, rx: 85.6, ry: 22.3 },
    'W 150 x 13.0': { d: 148, bf: 100, tf: 4.9, tw: 4.3, Ag: 1660, Zx: 122000, rx: 60.8, ry: 21.4 }
};

function loadSteelProfile(profileKey) {
    const p = GERDAU_W_PROFILES[profileKey];
    if (!p) return;
    Object.keys(p).forEach(k => {
        const el = document.getElementById(k);
        if (el) el.value = p[k];
    });
    handleRunNbr8800Check();
}

var nbr8800Calculator = (() => {
    function calculate(inputs) {
        const i = { ...inputs };
        // Base units: N, mm
        const Lb_mm = i.Lb * 1000.0;
        const Nsd_N = i.Nsd * 1000.0;
        const Msdx_Nmm = i.Msdx * 1e6;

        const gamma_a1 = 1.10;
        const res = {};

        // 1. Compactness (Mesa e Alma)
        const lambda_mesa = (i.bf / 2.0) / i.tf;
        const lambda_p_mesa = 0.38 * Math.sqrt(i.E / i.fy);
        res.classificacao_mesa = lambda_mesa <= lambda_p_mesa ? 'Compacta' : 'Não Compacta';

        const h_w = Math.max(1.0, i.d - 2.0 * i.tf);
        const lambda_alma = h_w / i.tw;
        const lambda_p_alma = 3.76 * Math.sqrt(i.E / i.fy);
        res.classificacao_alma = lambda_alma <= lambda_p_alma ? 'Compacta' : 'Não Compacta';

        // 2. Axial Compression NcRd
        const K = 1.0;
        const Lc = K * Lb_mm;
        const Ne = (Math.PI ** 2 * i.E * (i.Ag * i.ry ** 2)) / (Lc ** 2);
        const lambda_0 = Ne > 0 ? Math.sqrt((i.Ag * i.fy) / Ne) : 0;
        let chi = 0;
        if (lambda_0 <= 1.5) chi = Math.pow(0.658, lambda_0 ** 2);
        else chi = 0.877 / (lambda_0 ** 2);
        const NcRd_N = (chi * i.Ag * i.fy) / gamma_a1;
        res.NcRd = NcRd_N;
        res.Ne = Ne;
        res.lambda_0 = lambda_0;
        res.chi = chi;

        // 3. Flexure with FLT (NBR 8800 Item 5.4.2)
        const Cb = Math.max(1.0, Number(i.Cb) || 1.0);
        const Mpl_Nmm = i.Zx * i.fy;
        const Lp_mm = 1.76 * i.ry * Math.sqrt(i.E / i.fy);

        const Ix_approx = (1.0 / 12.0) * i.tw * (h_w ** 3) + 2.0 * ((1.0 / 12.0) * i.bf * (i.tf ** 3) + i.bf * i.tf * (((i.d - i.tf) / 2.0) ** 2));
        const Wx_approx = Ix_approx / (i.d / 2.0);
        const Mr_Nmm = 0.7 * i.fy * Wx_approx;

        const r_ts_denom = 12.0 * (1.0 + (1.0 / 6.0) * (h_w * i.tw) / (i.bf * i.tf));
        const r_ts = i.bf / Math.sqrt(Math.max(1.0, r_ts_denom));
        const J_approx = (2.0 * i.bf * (i.tf ** 3) + h_w * (i.tw ** 3)) / 3.0;
        const h0 = Math.max(1.0, i.d - i.tf);

        const term_bracket = (Wx_approx * h0 > 0) ? J_approx / (Wx_approx * h0) : 0;
        const inner_root = Math.sqrt(term_bracket ** 2 + 6.76 * ((0.7 * i.fy / i.E) ** 2));
        const Lr_mm = 1.95 * r_ts * (i.E / (0.7 * i.fy)) * Math.sqrt(Math.max(0.0, term_bracket + inner_root));

        let Mn_Nmm = Mpl_Nmm;
        let regime_flt = 'Contido (Sem FLT)';
        if (Lb_mm <= Lp_mm) {
            Mn_Nmm = Mpl_Nmm;
            regime_flt = 'Contido (Sem FLT)';
        } else if (Lb_mm <= Lr_mm) {
            Mn_Nmm = Cb * (Mpl_Nmm - (Mpl_Nmm - Mr_Nmm) * ((Lb_mm - Lp_mm) / (Lr_mm - Lp_mm)));
            Mn_Nmm = Math.min(Mpl_Nmm, Math.max(0.0, Mn_Nmm));
            regime_flt = 'Inelástico (FLT Inelástica)';
        } else {
            const slenderness = Lb_mm / r_ts;
            const Mcr_Nmm = (Cb * (Math.PI ** 2) * i.E / (slenderness ** 2)) * Math.sqrt(1.0 + 0.078 * (J_approx / (Wx_approx * h0)) * (slenderness ** 2));
            Mn_Nmm = Math.min(Mpl_Nmm, Math.max(0.0, Mcr_Nmm));
            regime_flt = 'Elástico (FLT Elástica)';
        }

        const Mrd_Nmm = Mn_Nmm / gamma_a1;
        res.Mrd = Mrd_Nmm;
        res.Mpl = Mpl_Nmm;
        res.Lp = Lp_mm;
        res.Lr = Lr_mm;
        res.regime_flt = regime_flt;

        // 4. Interaction N + M
        let interaction_ratio = 0;
        if (NcRd_N > 0 && Mrd_Nmm > 0) {
            const ratio_N = Nsd_N / NcRd_N;
            const ratio_M = Msdx_Nmm / Mrd_Nmm;
            if (ratio_N >= 0.2) {
                interaction_ratio = ratio_N + (8.0 / 9.0) * ratio_M;
            } else {
                interaction_ratio = (ratio_N / 2.0) + ratio_M;
            }
        }
        res.interaction_ratio = interaction_ratio;

        return { inputs: i, results: res };
    }
    return { calculate };
})();

function drawSteelCanvas(inputs) {
    const canvas = document.getElementById('steelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#E5E7EB' : '#1F2937';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)';
    const steelFill = isDark ? '#1E3A8A' : '#BFDBFE';
    const steelBorder = isDark ? '#60A5FA' : '#1D4ED8';
    const dimColor = isDark ? '#9CA3AF' : '#6B7280';

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    const d = inputs.d || 533;
    const bf = inputs.bf || 210;
    const tf = inputs.tf || 15.6;
    const tw = inputs.tw || 10.2;

    const marginX = 140;
    const marginY = 30;
    const availW = width - 2 * marginX;
    const availH = height - 2 * marginY;
    const scale = Math.min(availW / bf, availH / d);

    const dPx = d * scale;
    const bfPx = bf * scale;
    const tfPx = Math.max(3, tf * scale);
    const twPx = Math.max(3, tw * scale);

    const x0 = (width - bfPx) / 2;
    const y0 = (height - dPx) / 2;

    // Draw I Profile Path
    ctx.fillStyle = steelFill;
    ctx.strokeStyle = steelBorder;
    ctx.lineWidth = 2;

    ctx.beginPath();
    // Top Flange
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + bfPx, y0);
    ctx.lineTo(x0 + bfPx, y0 + tfPx);
    ctx.lineTo(x0 + (bfPx + twPx) / 2, y0 + tfPx);
    // Web right
    ctx.lineTo(x0 + (bfPx + twPx) / 2, y0 + dPx - tfPx);
    // Bottom Flange right
    ctx.lineTo(x0 + bfPx, y0 + dPx - tfPx);
    ctx.lineTo(x0 + bfPx, y0 + dPx);
    // Bottom Flange left
    ctx.lineTo(x0, y0 + dPx);
    ctx.lineTo(x0, y0 + dPx - tfPx);
    ctx.lineTo(x0 + (bfPx - twPx) / 2, y0 + dPx - tfPx);
    // Web left
    ctx.lineTo(x0 + (bfPx - twPx) / 2, y0 + tfPx);
    ctx.lineTo(x0, y0 + tfPx);
    ctx.closePath();

    ctx.fill();
    ctx.stroke();

    // Centerlines / Principal Axes
    ctx.save();
    ctx.strokeStyle = '#EF4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);

    // Axis X-X (horizontal)
    const midY = y0 + dPx / 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 25, midY); ctx.lineTo(x0 + bfPx + 25, midY);
    ctx.stroke();

    // Axis Y-Y (vertical)
    const midX = x0 + bfPx / 2;
    ctx.beginPath();
    ctx.moveTo(midX, y0 - 15); ctx.lineTo(midX, y0 + dPx + 15);
    ctx.stroke();
    ctx.restore();

    // Axis Labels
    ctx.fillStyle = '#EF4444';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('X', x0 + bfPx + 28, midY + 3);
    ctx.textAlign = 'center';
    ctx.fillText('Y', midX, y0 - 18);

    // Dimension Lines
    ctx.fillStyle = dimColor;
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1;
    ctx.font = '11px Inter, sans-serif';

    // Dimension bf (Top)
    const dimYTop = y0 - 12;
    ctx.beginPath();
    ctx.moveTo(x0, dimYTop); ctx.lineTo(x0 + bfPx, dimYTop);
    ctx.moveTo(x0, dimYTop - 3); ctx.lineTo(x0, dimYTop + 3);
    ctx.moveTo(x0 + bfPx, dimYTop - 3); ctx.lineTo(x0 + bfPx, dimYTop + 3);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(`bf = ${bf} mm`, midX, dimYTop - 5);

    // Dimension d (Left)
    const dimXLeft = x0 - 20;
    ctx.beginPath();
    ctx.moveTo(dimXLeft, y0); ctx.lineTo(dimXLeft, y0 + dPx);
    ctx.moveTo(dimXLeft - 3, y0); ctx.lineTo(dimXLeft + 3, y0);
    ctx.moveTo(dimXLeft - 3, y0 + dPx); ctx.lineTo(dimXLeft + 3, y0 + dPx);
    ctx.stroke();
    ctx.save();
    ctx.translate(dimXLeft - 8, midY);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`d = ${d} mm`, 0, 0);
    ctx.restore();
}

function updateSteelFeedback(calc_results) {
    const { inputs, results } = calc_results;
    const interRatio = results.interaction_ratio || 0;
    const interPct = (interRatio * 100).toFixed(1);
    const isPass = interRatio <= 1.0;

    // 1. Status Banner
    const banner = document.getElementById('status-banner');
    const icon = document.getElementById('status-icon');
    const title = document.getElementById('status-title');
    const subtitle = document.getElementById('status-subtitle');
    const badge = document.getElementById('status-badge');

    if (isPass) {
        banner.className = "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-4 flex items-center justify-between shadow-sm";
        icon.textContent = "✅";
        title.className = "text-base font-bold text-emerald-800 dark:text-emerald-300";
        title.textContent = "PERFIL CONFORME À NBR 8800:2008";
        subtitle.className = "text-xs text-emerald-700 dark:text-emerald-400";
        subtitle.textContent = `A interação flexo-compressão (${interPct}%) e as verificações de estabilidade atendem plenamente à norma.`;
        badge.className = "inline-block bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider";
        badge.textContent = `Interação: ${interPct}%`;
    } else {
        banner.className = "bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700 rounded-xl p-4 flex items-center justify-between shadow-sm";
        icon.textContent = "⚠️";
        title.className = "text-base font-bold text-rose-800 dark:text-rose-300";
        title.textContent = "PERFIL SOBRECARREGADO (NÃO CONFORME)";
        subtitle.className = "text-xs text-rose-700 dark:text-rose-400";
        subtitle.textContent = `A taxa de solicitação (${interPct}%) ultrapassa a capacidade última do perfil sob a combinação ELU.`;
        badge.className = "inline-block bg-rose-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider";
        badge.textContent = `Interação: ${interPct}%`;
    }

    // 2. KPI Cards
    document.getElementById('kpi-inter-val').textContent = `${interPct}%`;
    const interBar = document.getElementById('kpi-inter-bar');
    interBar.style.width = `${Math.min(100, interRatio * 100)}%`;
    interBar.className = isPass ? 'bg-emerald-500 h-full rounded-full' : 'bg-rose-500 h-full rounded-full';
    document.getElementById('kpi-inter-badge').textContent = isPass ? 'OK' : 'FALHA';
    document.getElementById('kpi-inter-badge').className = isPass ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400' : 'text-xs font-semibold text-rose-600 dark:text-rose-400';

    const NcRd_kN = (results.NcRd / 1000.0) || 1;
    const compRatio = inputs.Nsd / NcRd_kN;
    const compPct = (compRatio * 100).toFixed(1);
    document.getElementById('kpi-comp-val').textContent = `${compPct}%`;
    document.getElementById('kpi-comp-chi').textContent = `\u03C7 = ${results.chi.toFixed(2)}`;
    document.getElementById('kpi-comp-bar').style.width = `${Math.min(100, compRatio * 100)}%`;
    document.getElementById('kpi-comp-detail').textContent = `${inputs.Nsd.toFixed(0)} / ${NcRd_kN.toFixed(0)} kN`;

    const Mrd_kNm = (results.Mrd / 1e6) || 1;
    const flexRatio = inputs.Msdx / Mrd_kNm;
    const flexPct = (flexRatio * 100).toFixed(1);
    document.getElementById('kpi-flex-val').textContent = `${flexPct}%`;
    document.getElementById('kpi-flex-bar').style.width = `${Math.min(100, flexRatio * 100)}%`;
    document.getElementById('kpi-flex-detail').textContent = `${inputs.Msdx.toFixed(0)} / ${Mrd_kNm.toFixed(0)} kN·m`;

    document.getElementById('kpi-flt-regime').textContent = results.regime_flt.split(' ')[0];
    document.getElementById('kpi-classif-badge').textContent = `${results.classificacao_mesa}/${results.classificacao_alma}`;
    document.getElementById('kpi-flt-detail').textContent = `Lp=${((results.Lp || 0)/1000).toFixed(1)}m | Lr=${((results.Lr || 0)/1000).toFixed(1)}m`;

    // 3. Draw Canvas
    drawSteelCanvas(inputs);
}

function renderNbr8800Results(calc_results) {
    const { inputs, results } = calc_results;

    updateSteelFeedback(calc_results);

    const NcRd_kN = results.NcRd / 1000.0;
    const Mrd_kNm = results.Mrd / 1e6;

    const checks = [
        {
            name: 'Compressão Axial (Flambagem Global)',
            demand: inputs.Nsd,
            capacity: NcRd_kN,
            ratio: NcRd_kN > 0 ? inputs.Nsd / NcRd_kN : Infinity,
            unit: 'kN'
        },
        {
            name: 'Flexão em Torno do Eixo X (com FLT)',
            demand: inputs.Msdx,
            capacity: Mrd_kNm,
            ratio: Mrd_kNm > 0 ? inputs.Msdx / Mrd_kNm : Infinity,
            unit: 'kN·m'
        },
        {
            name: 'Interação Flexo-Compressão (Equação NBR 8800)',
            demand: results.interaction_ratio,
            capacity: 1.0,
            ratio: results.interaction_ratio,
            unit: ''
        }
    ];

    const report = new ReportBuilder({
        reportId: 'steel-report-content',
        title: 'Relatório de Verificação NBR 8800:2008'
    });

    const tableRows = checks.map(check => {
        const utilPct = (check.ratio * 100).toFixed(1);
        const isOk = check.ratio <= 1.0;
        return {
            cells: [
                `<span class="font-semibold text-gray-900 dark:text-white">${check.name}</span>`,
                `${check.demand.toFixed(2)} ${check.unit}`,
                `${check.capacity.toFixed(2)} ${check.unit}`,
                check.ratio.toFixed(3),
                `<span class="font-bold ${isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">${utilPct}%</span>`,
                isOk ? '<span class="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 text-xs font-bold px-2.5 py-0.5 rounded-full">OK</span>'
                     : '<span class="bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 text-xs font-bold px-2.5 py-0.5 rounded-full">FALHA</span>'
            ]
        };
    });

    report.addTableSection('Verificações de Resistência e Estabilidade (ELU)', {
        headers: ['Verificação', 'Solicitante (Sd)', 'Resistente (Rd)', 'Razão', 'Utilização (%)', 'Status'],
        rows: tableRows
    }, 'steel-checks-table');

    report.render('results-container');
}

var handleRunNbr8800Check = createCalculationHandler({
    inputIds: nbr8800InputIds,
    storageKey: 'nbr8800-inputs',
    validationRuleKey: 'nbr_aco',
    calculatorFunction: async (inputs) => {
        if (window.eel && window.eel.calculate_steel_structure) {
            const res = await window.eel.calculate_steel_structure(inputs)();
            if (res && res.results) return res;
        }
        return nbr8800Calculator.calculate(inputs);
    },
    renderFunction: renderNbr8800Results,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn'
});

document.addEventListener('DOMContentLoaded', () => {
    nbr8800InputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', handleRunNbr8800Check);
        }
    });

    window.addEventListener('resize', () => {
        const canvas = document.getElementById('steelCanvas');
        if (canvas) handleRunNbr8800Check();
    });

    setTimeout(handleRunNbr8800Check, 150);
});

initializeApp({
    inputIds: nbr8800InputIds,
    calculationHandler: handleRunNbr8800Check
});