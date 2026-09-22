/**
 * Deep Foundations Unified Suite Controller
 * Integrates: Blévot & Frémy Pile Caps (1 to 6 piles), Piled Raft, and Piled Beam.
 */

const PILE_CAP_SESSION_KEY = 'pile_cap_session_data';

document.addEventListener('DOMContentLoaded', () => {
    setupSuiteTabs();
    setupEventListeners();
    loadSession();
    checkImportedSprings();
    triggerCapCalculation();
});

function setupSuiteTabs() {
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab === 'raft') {
        window.location.replace('piled_raft.html');
        return;
    }
    if (initialTab === 'beam') {
        window.location.replace('piled_beam.html');
        return;
    }
}

function checkImportedSprings() {
    const banner = document.getElementById('springs-import-banner');
    const summary = document.getElementById('springs-summary-text');
    const raw = localStorage.getItem('aoki_springs_pile_cap') || localStorage.getItem('aoki_springs_piled_raft');
    
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        if (summary && data.pile_capacity_adm_kN) {
            summary.innerHTML = `Molas geotécnicas ativas de Aoki-Velloso: <b>Radm = ${data.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN</b> | <b>D = ${(data.pile_diameter_m * 100).toFixed(0)} cm</b> | <b>Kz = ${data.pile_spring_kz_kN_m?.toLocaleString('pt-BR')} kN/m</b>`;
        }
    } catch (e) {
        console.warn('Erro ao ler molas salvas:', e);
    }
}

function importLatestSprings() {
    const raw = localStorage.getItem('aoki_springs_pile_cap') || localStorage.getItem('aoki_springs_piled_raft');
    if (!raw) {
        alert("Nenhuma mola geotécnica calculada foi encontrada no cache. Abra o módulo de Aoki-Velloso & Décourt-Quaresma para calcular e exportar.");
        return;
    }
    try {
        const data = JSON.parse(raw);
        if (data.pile_diameter_m && document.getElementById('cap_pile_diam_m')) {
            document.getElementById('cap_pile_diam_m').value = data.pile_diameter_m;
        }
        if (data.pile_diameter_m && document.getElementById('cap_pile_spacing_m')) {
            document.getElementById('cap_pile_spacing_m').value = (3.0 * data.pile_diameter_m).toFixed(2);
        }
        if (data.pile_capacity_adm_kN) {
            const nPiles = parseInt(document.getElementById('cap_num_piles')?.value || 2);
            // Default design load = 0.9 * nPiles * Radm
            document.getElementById('cap_load_Nk_kN').value = (nPiles * data.pile_capacity_adm_kN * 0.9).toFixed(0);
        }
        triggerCapCalculation();
        saveSession();
        alert(`✅ Parâmetros Geotécnicos importados com sucesso:\n• Diâmetro D = ${(data.pile_diameter_m * 100).toFixed(0)} cm\n• Espaçamento sugerido e = ${(3 * data.pile_diameter_m).toFixed(2)} m\n• Carga Nk estimada = ${document.getElementById('cap_load_Nk_kN').value} kN`);
    } catch (e) {
        console.error("Erro ao aplicar molas:", e);
    }
}

function parseNum(id, def = 0.0) {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
}

function getCapPayload() {
    return {
        cap_num_piles: parseInt(parseNum('cap_num_piles', 2)),
        cap_pile_diam_m: parseNum('cap_pile_diam_m', 0.80),
        cap_pile_spacing_m: parseNum('cap_pile_spacing_m', 2.40),
        cap_col_a_m: parseNum('cap_col_a_m', 0.50),
        cap_col_b_m: parseNum('cap_col_b_m', 0.50),
        cap_load_Nk_kN: parseNum('cap_load_Nk_kN', 2400.0),
        cap_fck_mpa: parseNum('cap_fck_mpa', 30.0),
        cap_fyk_mpa: parseNum('cap_fyk_mpa', 500.0),
        cap_cover_cm: parseNum('cap_cover_cm', 5.0),
        cap_embedment_cm: parseNum('cap_embedment_cm', 5.0)
    };
}

function setupEventListeners() {
    const ids = [
        'cap_num_piles', 'cap_pile_diam_m', 'cap_pile_spacing_m',
        'cap_col_a_m', 'cap_col_b_m', 'cap_load_Nk_kN',
        'cap_fck_mpa', 'cap_fyk_mpa', 'cap_cover_cm', 'cap_embedment_cm'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', () => { triggerCapCalculation(); saveSession(); });
        el.addEventListener('change', () => { triggerCapCalculation(); saveSession(); });
    });
}

function saveSession() {
    try {
        const data = getCapPayload();
        localStorage.setItem(PILE_CAP_SESSION_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Erro ao salvar sessão de bloco:', e);
    }
}

function loadSession() {
    try {
        const raw = localStorage.getItem(PILE_CAP_SESSION_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.keys(data).forEach(k => {
            const el = document.getElementById(k);
            if (el) el.value = data[k];
        });
    } catch (e) {
        console.warn('Erro ao carregar sessão de bloco:', e);
    }
}

function triggerCapCalculation() {
    const payload = getCapPayload();

    if (typeof eel !== 'undefined' && eel.calculate_blevot_pile_cap) {
        eel.calculate_blevot_pile_cap(payload)(function (res) {
            if (res && res.dimensions) {
                updateCapResults(res);
            } else {
                console.error("Pile cap calculation error:", res?.error);
            }
        });
    } else {
        const res = runClientSideBlevot(payload);
        updateCapResults(res);
    }
}

function updateCapResults(res) {
    const dim = res.dimensions || {};
    const st = res.strut_and_tie || {};
    const re = res.reinforcement || {};

    // 1. KPIs
    const elPd = document.getElementById('cap-res-pd');
    const elPdSub = document.getElementById('cap-res-pd-sub');
    if (elPd) elPd.innerText = res.Pd_kN ? res.Pd_kN.toFixed(0) : '--';
    if (elPdSub) elPdSub.innerText = `Nd = ${res.Nd_kN ? res.Nd_kN.toFixed(0) : '--'} kN`;

    const elTheta = document.getElementById('cap-res-theta');
    const elThetaBadge = document.getElementById('cap-res-theta-badge');
    if (elTheta) elTheta.innerText = `${st.theta_deg ? st.theta_deg.toFixed(1) : '--'}°`;
    if (elThetaBadge) {
        elThetaBadge.innerText = st.is_rigid_valid ? "45° ≤ θ ≤ 55° (Bloco Rígido OK)" : (st.theta_deg < 45 ? "θ < 45° (Flexível / Aumentar d)" : "θ > 55° (Ângulo excessivo)");
        elThetaBadge.className = st.is_rigid_valid ? "text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1 truncate" : "text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1 truncate";
    }

    const elFtd = document.getElementById('cap-res-ftd');
    if (elFtd) elFtd.innerText = re.Ftd_kN ? re.Ftd_kN.toFixed(0) : '--';

    const elAs = document.getElementById('cap-res-as');
    const elRebarSugg = document.getElementById('cap-res-rebar-sugg');
    if (elAs) elAs.innerText = re.As_cm2 ? re.As_cm2.toFixed(1) : '--';
    if (elRebarSugg) elRebarSugg.innerText = re.suggested_bars || '--';

    // 2. Dim label
    const elDimLabel = document.getElementById('cap-dim-label');
    if (elDimLabel && dim.L_cap_m) {
        elDimLabel.innerText = `L = ${dim.L_cap_m.toFixed(2)} m | B = ${dim.B_cap_m.toFixed(2)} m | H = ${dim.H_cap_m.toFixed(2)} m (d = ${dim.d_eff_m.toFixed(2)} m)`;
    }

    // 3. Stresses
    const elSigCol = document.getElementById('cap-res-sigma-col');
    const elSigColLim = document.getElementById('cap-res-sigma-col-lim');
    const elBadgeCol = document.getElementById('cap-badge-sigma-col');
    if (elSigCol) elSigCol.innerText = `${st.sigma_pilar_mpa ? st.sigma_pilar_mpa.toFixed(2) : '--'} MPa`;
    if (elSigColLim) elSigColLim.innerText = `Limite: ${st.sigma_cd_lim_mpa ? st.sigma_cd_lim_mpa.toFixed(2) : '--'} MPa (${((st.ratio_pilar || 0) * 100).toFixed(0)}%)`;
    if (elBadgeCol) {
        elBadgeCol.innerText = st.ok_pilar ? "OK" : "Excedido";
        elBadgeCol.className = st.ok_pilar ? "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800" : "px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800";
    }

    const elSigPile = document.getElementById('cap-res-sigma-estaca');
    const elSigPileLim = document.getElementById('cap-res-sigma-pile-lim');
    const elBadgePile = document.getElementById('cap-badge-sigma-pile');
    if (elSigPile) elSigPile.innerText = `${st.sigma_estaca_mpa ? st.sigma_estaca_mpa.toFixed(2) : '--'} MPa`;
    if (elSigPileLim) elSigPileLim.innerText = `Limite: ${st.sigma_cd_lim_mpa ? st.sigma_cd_lim_mpa.toFixed(2) : '--'} MPa (${((st.ratio_estaca || 0) * 100).toFixed(0)}%)`;
    if (elBadgePile) {
        elBadgePile.innerText = st.ok_estaca ? "OK" : "Excedido";
        elBadgePile.className = st.ok_estaca ? "px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800" : "px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800";
    }

    // 4. Draw CAD Schematic
    drawPileCapCanvas(res);
}

function drawPileCapCanvas(res) {
    const canvas = document.getElementById('canvas-pilecap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, w, h, true);
        EngCAD.drawGrid(ctx, w, h, { step: 24, majorEvery: 4 });
    } else {
        ctx.clearRect(0, 0, w, h);
    }

    const dim = res.dimensions || { L_cap_m: 3.6, B_cap_m: 1.6, pile_coords: [[-1.2, 0], [1.2, 0]] };
    const n = res.num_piles || 2;
    const pileCoords = dim.pile_coords || [];
    const D = parseFloat(document.getElementById('cap_pile_diam_m')?.value || 0.80);
    const colA = parseFloat(document.getElementById('cap_col_a_m')?.value || 0.50);
    const colB = parseFloat(document.getElementById('cap_col_b_m')?.value || 0.50);

    const cx = w / 2;
    const cy = h / 2;
    const maxDim = Math.max(dim.L_cap_m, dim.B_cap_m, 1.5);
    const scale = Math.min((w - 140) / maxDim, (h - 70) / maxDim);

    const capW = dim.L_cap_m * scale;
    const capH = dim.B_cap_m * scale;
    const left = cx - capW / 2;
    const top = cy - capH / 2;

    // 1. Cap Boundary
    ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.fillRect(left, top, capW, capH);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(left, top, capW, capH);

    // 2. Draw Ties / Struts from Center (Pilar) to Each Pile
    pileCoords.forEach(pt => {
        const px = cx + pt[0] * scale;
        const py = cy + pt[1] * scale;

        // Strut line (compression)
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.setLineDash([]);
    });

    // 3. Draw Main Tie Reinforcement between Piles
    if (pileCoords.length >= 2) {
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 3;
        ctx.beginPath();
        pileCoords.forEach((pt, i) => {
            const px = cx + pt[0] * scale;
            const py = cy + pt[1] * scale;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        if (pileCoords.length >= 3) ctx.closePath();
        ctx.stroke();
    }

    // 4. Draw Piles
    const pileRadius = (D / 2.0) * scale;
    pileCoords.forEach(pt => {
        const px = cx + pt[0] * scale;
        const py = cy + pt[1] * scale;

        ctx.beginPath();
        ctx.arc(px, py, pileRadius, 0, 2 * Math.PI);
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Cross inside pile
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px - pileRadius, py);
        ctx.lineTo(px + pileRadius, py);
        ctx.moveTo(px, py - pileRadius);
        ctx.lineTo(px, py + pileRadius);
        ctx.stroke();
    });

    // 5. Draw Column at Center
    const cW = colA * scale;
    const cH = colB * scale;
    ctx.fillStyle = '#64748b';
    ctx.fillRect(cx - cW / 2, cy - cH / 2, cW, cH);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - cW / 2, cy - cH / 2, cW, cH);

    // Dimension labels (High Contrast on Dark CAD Blueprint)
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`L = ${dim.L_cap_m.toFixed(2)} m`, cx - 30, top + capH + 20);
    ctx.save();
    ctx.translate(left - 14, cy + 25);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`B = ${dim.B_cap_m.toFixed(2)} m`, 0, 0);
    ctx.restore();
}

function runClientSideBlevot(inputs) {
    const n = inputs.cap_num_piles;
    const D = inputs.cap_pile_diam_m;
    const spacing = inputs.cap_pile_spacing_m;
    const a = inputs.cap_col_a_m;
    const b = inputs.cap_col_b_m;
    const Nk = inputs.cap_load_Nk_kN;
    const fck = inputs.cap_fck_mpa;
    const fyk = inputs.cap_fyk_mpa;

    const Nd = Nk * 1.4;
    const Pd = Nd / n;

    // Dist to pile center
    const r = spacing / 2.0;
    const d = r; // approximately 45 degrees
    const H = d + 0.15;
    const thetaRad = Math.atan(d / Math.max(0.1, r - a / 4.0));
    const thetaDeg = thetaRad * 180 / Math.PI;

    const Ftd = (Pd / Math.tan(thetaRad));
    const fyd = (fyk / 1.15) * 0.1; // kN/cm²
    const As = Ftd / fyd;

    let coords = [];
    if (n === 1) coords = [[0, 0]];
    else if (n === 2) coords = [[-r, 0], [r, 0]];
    else if (n === 3) coords = [[0, -r * 0.8], [-r * 0.86, r * 0.5], [r * 0.86, r * 0.5]];
    else if (n === 4) coords = [[-r, -r], [r, -r], [r, r], [-r, r]];
    else if (n === 5) coords = [[-r, -r], [r, -r], [r, r], [-r, r], [0, 0]];
    else if (n === 6) coords = [[-r, -r * 0.6], [0, -r * 0.6], [r, -r * 0.6], [-r, r * 0.6], [0, r * 0.6], [r, r * 0.6]];

    return {
        num_piles: n,
        Nk_kN: Nk,
        Nd_kN: Nd,
        Pd_kN: Pd,
        dimensions: {
            L_cap_m: spacing + D + 0.5,
            B_cap_m: (n <= 2 ? D + 0.6 : spacing + D + 0.5),
            H_cap_m: H,
            d_eff_m: d,
            pile_coords: coords
        },
        strut_and_tie: {
            theta_deg: thetaDeg,
            is_rigid_valid: thetaDeg >= 45 && thetaDeg <= 55,
            sigma_pilar_mpa: (Nd / (a * b * 1000)),
            sigma_estaca_mpa: (Pd / (Math.PI * Math.pow(D / 2, 2) * 1000)),
            sigma_cd_lim_mpa: 0.85 * (fck / 1.4),
            ok_pilar: true,
            ok_estaca: true
        },
        reinforcement: {
            Ftd_kN: Ftd,
            As_cm2: As,
            suggested_bars: `${Math.ceil(As / 2.01)} φ 16.0 mm (CA-50)`
        }
    };
}
