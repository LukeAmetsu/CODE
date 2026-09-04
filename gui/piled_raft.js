/**
 * Piled Raft Foundation UI Controller & 2D CAD Canvas Renderer
 */

let lastResult = null;
let isCalculating = false;

document.addEventListener('DOMContentLoaded', () => {
    const inputs = document.querySelectorAll('#piled-raft-form input, #piled-raft-form select');
    inputs.forEach(input => {
        input.addEventListener('input', debounce(triggerCalculation, 250));
        input.addEventListener('change', triggerCalculation);
    });

    // Check for springs calculated in Aoki-Velloso
    checkAndLoadAokiSprings();

    // Handle window resize
    window.addEventListener('resize', () => {
        if (lastResult) drawCanvas();
    });

    triggerCalculation();
});

function checkAndLoadAokiSprings() {
    const raw = localStorage.getItem('aoki_springs_piled_raft');
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        let applied = false;
        if (data.pile_spring_kz_kN_m && document.getElementById('pile_spring_kz')) {
            document.getElementById('pile_spring_kz').value = data.pile_spring_kz_kN_m;
            applied = true;
        }
        if (data.pile_capacity_adm_kN && document.getElementById('pile_capacity_adm')) {
            document.getElementById('pile_capacity_adm').value = data.pile_capacity_adm_kN;
            applied = true;
        }
        if (data.subgrade_ks_kN_m3 && document.getElementById('subgrade_ks')) {
            document.getElementById('subgrade_ks').value = data.subgrade_ks_kN_m3;
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
        if (data.h_soft_cutoff_m && document.getElementById('h_soft_layer')) {
            document.getElementById('h_soft_layer').value = data.h_soft_cutoff_m;
            applied = true;
        }
        if (applied) {
            const banner = document.getElementById('aoki-import-banner');
            const txt = document.getElementById('aoki-banner-text');
            if (banner && txt) {
                txt.innerHTML = `Molas importadas com sucesso do Aoki-Velloso! <strong>Kz = ${Number(data.pile_spring_kz_kN_m).toLocaleString('pt-BR')} kN/m</strong> | <strong>Radm = ${Number(data.pile_capacity_adm_kN).toLocaleString('pt-BR')} kN</strong> | <strong>ks = ${Number(data.subgrade_ks_kN_m3).toLocaleString('pt-BR')} kN/m³</strong>`;
                banner.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.warn('Erro ao carregar aoki_springs_piled_raft:', e);
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
        raft_length_x: parseNum('raft_length_x', 16.0),
        raft_length_y: parseNum('raft_length_y', 12.0),
        raft_thickness: parseNum('raft_thickness', 1.20),
        fck: parseNum('fck', 35.0),
        cover: parseNum('cover', 50.0),
        bar_diam: parseNum('bar_diam', 20.0),

        num_piles_x: parseInt(document.getElementById('num_piles_x')?.value || '5', 10),
        num_piles_y: parseInt(document.getElementById('num_piles_y')?.value || '4', 10),
        pile_diameter: parseNum('pile_diameter', 0.80),
        pile_length: parseNum('pile_length', 18.0),
        pile_capacity_adm: parseNum('pile_capacity_adm', 1800.0),
        pile_spring_kz: parseNum('pile_spring_kz', 180000.0),
        h_soft_layer: parseNum('h_soft_layer', 8.50),
        subgrade_ks: parseNum('subgrade_ks', 8000.0),

        spmt_num_lines: parseInt(document.getElementById('spmt_num_lines')?.value || '6', 10),
        spmt_line_load: parseNum('spmt_line_load', 350.0),
        spmt_line_spacing: parseNum('spmt_line_spacing', 1.50),
        spmt_gauge: parseNum('spmt_gauge', 2.40),

        heavy_rigging_load: parseNum('heavy_rigging_load', 2500.0),
        heavy_rigging_x: parseNum('heavy_rigging_x', 8.0),
        heavy_rigging_y: parseNum('heavy_rigging_y', 6.0)
    };
}

async function triggerCalculation() {
    if (isCalculating) return;
    isCalculating = true;

    const inputs = getFormInputs();

    try {
        if (window.eel && eel.calculate_piled_raft) {
            const res = await eel.calculate_piled_raft(inputs)();
            if (res && res.success) {
                lastResult = res;
                updateUIResults(res);
                drawCanvas();
            } else if (res && res.error) {
                console.error("Calculation error:", res.error);
            }
        } else {
            console.warn("Eel not connected. Running offline preview.");
        }
    } catch (err) {
        console.error("Eel invocation failed:", err);
    } finally {
        isCalculating = false;
    }
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
    const ld = res.load_distribution || {};
    const piles = res.piles_summary || {};
    const settle = res.settlements || {};
    const punch = res.punching_shear || {};
    const reinf = res.reinforcement || {};
    const qty = res.quantities || {};

    // 1. Top Badges
    document.getElementById('card-total-p').innerText = ld.total_vertical_tf ? `${ld.total_vertical_tf.toFixed(0)} tf` : '-';
    document.getElementById('badge-alpha-pr').innerText = ld.alpha_pr != null ? `α_pr: ${(ld.alpha_pr * 100).toFixed(0)}%` : '-';
    document.getElementById('card-alpha-desc').innerText = `Estacas: ${ld.load_to_piles_pct}% (${ld.load_to_piles_kN} kN) | Solo: ${ld.load_to_soil_pct}%`;

    const isPileOk = piles.max_reaction_kN <= piles.pile_capacity_adm_kN;
    document.getElementById('card-max-reaction').innerText = piles.max_reaction_tf ? `${piles.max_reaction_tf.toFixed(1)} tf` : '-';
    updateBadge('badge-pile-status', isPileOk, isPileOk ? `FS = ${piles.fs_capacity_min}` : 'SOBRECARGA');
    document.getElementById('card-pile-fs').innerText = `Capacidade R_adm: ${(piles.pile_capacity_adm_kN / 9.81).toFixed(0)} tf / estaca`;

    const isSettleOk = settle.max_settlement_mm <= 25.0;
    document.getElementById('card-max-settle').innerText = settle.max_settlement_mm != null ? `${settle.max_settlement_mm.toFixed(1)} mm` : '-';
    updateBadge('badge-settle-status', isSettleOk, isSettleOk ? 'OK (≤ 25mm)' : 'ALERTA');
    document.getElementById('card-settle-diff').innerText = `Diferencial: ${settle.differential_mm} mm (θ = ${settle.angular_distortion})`;

    const isPunchOk = punch.overall_status === 'APROVADO';
    const punchRatio = (punch.tau_Sd1_MPa / punch.tau_Rd1_MPa).toFixed(2);
    document.getElementById('card-punch-ratio').innerText = `${punchRatio}`;
    updateBadge('badge-punch-status', isPunchOk, punch.overall_status);
    document.getElementById('card-punch-studs').innerText = punch.needs_studs ? `Asw = ${punch.A_sw_cm2} cm² (Studs)` : 'Sem armadura necessária';

    // 2. Technical Table
    document.getElementById('res-F-Sd').innerText = `${punch.critical_force_FSd_kN.toFixed(1)} kN (γf·R_max)`;
    document.getElementById('res-tau-0').innerText = `u0 = ${punch.u0_m} m | τ_Sd0 = ${punch.tau_Sd0_MPa.toFixed(2)} MPa`;
    document.getElementById('res-tau-rd2').innerText = `${punch.tau_Rd2_MPa.toFixed(2)} MPa (${punch.status_strut_0})`;
    document.getElementById('res-tau-1').innerText = `u1 = ${punch.u1_m} m | τ_Sd1 = ${punch.tau_Sd1_MPa.toFixed(2)} MPa`;
    document.getElementById('res-tau-rd1').innerText = `${punch.tau_Rd1_MPa.toFixed(2)} MPa`;
    document.getElementById('res-studs-desc').innerText = punch.stud_status;

    document.getElementById('res-M-sd').innerText = `${reinf.M_design_kNm_m.toFixed(1)} kN·m / m`;
    document.getElementById('res-As-req').innerText = `${reinf.As_final_cm2_m.toFixed(2)} cm²/m (Mín = ${reinf.As_min_cm2_m.toFixed(2)})`;
    document.getElementById('res-mesh-rebar').innerText = reinf.detailing?.text || '-';
    document.getElementById('res-crack-width').innerText = `${reinf.crack_width?.w_k_mm.toFixed(3)} mm (Lim = 0.20 mm - ${reinf.crack_width?.status})`;

    document.getElementById('res-vol-raft').innerText = `${qty.concrete_raft_m3.toFixed(1)} m³`;
    document.getElementById('res-vol-piles').innerText = `${qty.concrete_piles_m3.toFixed(1)} m³`;
    document.getElementById('res-steel-total').innerText = `${(qty.total_steel_kg / 1000.0).toFixed(1)} toneladas CA-50`;
}

function drawCanvas() {
    const canvas = document.getElementById('raftCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const inputs = getFormInputs();
    const res = lastResult;

    const Lx = inputs.raft_length_x;
    const Ly = inputs.raft_length_y;

    // Margins & Scale
    const margin = 50;
    const scaleX = (w - 2 * margin) / Lx;
    const scaleY = (h - 2 * margin) / Ly;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (w - Lx * scale) / 2.0;
    const offsetY = (h - Ly * scale) / 2.0;

    const toPxX = (x) => offsetX + x * scale;
    const toPxY = (y) => offsetY + (Ly - y) * scale; // Invert Y for engineering coordinates

    // 1. Draw Grid Lines
    ctx.strokeStyle = '#334155'; // slate-700
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (let x = 0; x <= Lx; x += 2) {
        ctx.beginPath();
        ctx.moveTo(toPxX(x), toPxY(0));
        ctx.lineTo(toPxX(x), toPxY(Ly));
        ctx.stroke();
    }
    for (let y = 0; y <= Ly; y += 2) {
        ctx.beginPath();
        ctx.moveTo(toPxX(0), toPxY(y));
        ctx.lineTo(toPxX(Lx), toPxY(y));
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // 2. Draw Raft Concrete Slab Boundary
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)'; // Blue subtle fill
    ctx.strokeStyle = '#38bdf8'; // sky-400
    ctx.lineWidth = 3;
    ctx.fillRect(toPxX(0), toPxY(Ly), Lx * scale, Ly * scale);
    ctx.strokeRect(toPxX(0), toPxY(Ly), Lx * scale, Ly * scale);

    // Dimension labels on borders
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText(`Lx = ${Lx.toFixed(1)} m`, toPxX(Lx / 2), toPxY(0) + 24);
    ctx.textAlign = 'right';
    ctx.fillText(`Ly = ${Ly.toFixed(1)} m`, toPxX(0) - 12, toPxY(Ly / 2));

    // 3. Draw Reinforcement Mesh Grid (if toggled)
    const showRebar = document.getElementById('toggle-rebar')?.checked;
    if (showRebar) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)'; // Emerald subtle
        ctx.lineWidth = 1;
        for (let x = 0.5; x < Lx; x += 1.0) {
            ctx.beginPath();
            ctx.moveTo(toPxX(x), toPxY(0));
            ctx.lineTo(toPxX(x), toPxY(Ly));
            ctx.stroke();
        }
        for (let y = 0.5; y < Ly; y += 1.0) {
            ctx.beginPath();
            ctx.moveTo(toPxX(0), toPxY(y));
            ctx.lineTo(toPxX(Lx), toPxY(y));
            ctx.stroke();
        }
    }

    // 4. Draw Piles
    const Dp = inputs.pile_diameter;
    const r_px = (Dp / 2.0) * scale;
    const showPunch = document.getElementById('toggle-punching')?.checked;
    const d_eff = res?.raft_geometry?.d_eff_m || 1.10;
    const r_punch_px = ((Dp / 2.0) + 2.0 * d_eff) * scale;

    if (res && res.piles_summary && res.piles_summary.piles_detail) {
        const piles = res.piles_summary.piles_detail;
        const R_adm = res.piles_summary.pile_capacity_adm_kN;

        piles.forEach(p => {
            const px = toPxX(p.x);
            const py = toPxY(p.y);
            const ratio = p.reaction_kN / R_adm;

            // Punching perimeter u1 around pile (if toggled)
            if (showPunch && ratio > 0.6) {
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.4)'; // Rose dashed
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(px, py, r_punch_px, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Pile body circle
            ctx.beginPath();
            ctx.arc(px, py, Math.max(5, r_px), 0, Math.PI * 2);

            if (ratio > 1.0) {
                ctx.fillStyle = '#ef4444'; // Red overcapacity
                ctx.strokeStyle = '#fca5a5';
            } else if (ratio > 0.8) {
                ctx.fillStyle = '#f59e0b'; // Amber high load
                ctx.strokeStyle = '#fde68a';
            } else {
                ctx.fillStyle = '#10b981'; // Green safe
                ctx.strokeStyle = '#6ee7b7';
            }
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label reaction
            ctx.font = '500 10px Inter, sans-serif';
            ctx.fillStyle = '#f8fafc';
            ctx.textAlign = 'center';
            ctx.fillText(`${p.reaction_tf}t`, px, py + 3);
        });
    }

    // 5. Draw SPMT Wheel Trucks & Axle Lines
    if (res && res.loads_mapped) {
        res.loads_mapped.forEach(load => {
            if (load.name.includes("SPMT")) {
                const lx = toPxX(load.x);
                const ly = toPxY(load.y);
                const wheel_w = 0.6 * scale;
                const wheel_h = 0.3 * scale;

                ctx.fillStyle = '#38bdf8'; // Sky blue tire pad
                ctx.strokeStyle = '#0284c7';
                ctx.lineWidth = 1.5;
                ctx.fillRect(lx - wheel_w / 2, ly - wheel_h / 2, wheel_w, wheel_h);
                ctx.strokeRect(lx - wheel_w / 2, ly - wheel_h / 2, wheel_w, wheel_h);
            }
        });
    }

    // 6. Draw Heavy Rigging Concentrated Load
    const hx = toPxX(inputs.heavy_rigging_x);
    const hy = toPxY(inputs.heavy_rigging_y);
    const pad_sz = 1.2 * scale;

    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.fillRect(hx - pad_sz / 2, hy - pad_sz / 2, pad_sz, pad_sz);
    ctx.strokeRect(hx - pad_sz / 2, hy - pad_sz / 2, pad_sz, pad_sz);

    // Crosshair
    ctx.beginPath();
    ctx.moveTo(hx - pad_sz, hy);
    ctx.lineTo(hx + pad_sz, hy);
    ctx.moveTo(hx, hy - pad_sz);
    ctx.lineTo(hx, hy + pad_sz);
    ctx.stroke();

    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#f87171';
    ctx.textAlign = 'center';
    ctx.fillText(`Turbina / Pick-up: ${(inputs.heavy_rigging_load / 9.81).toFixed(0)} tf`, hx, hy - pad_sz / 2 - 8);
}

function resetDefaults() {
    document.getElementById('raft_length_x').value = 16.0;
    document.getElementById('raft_length_y').value = 12.0;
    document.getElementById('raft_thickness').value = 1.20;
    document.getElementById('fck').value = 35.0;
    document.getElementById('num_piles_x').value = 5;
    document.getElementById('num_piles_y').value = 4;
    document.getElementById('pile_diameter').value = 0.80;
    document.getElementById('pile_length').value = 18.0;
    document.getElementById('pile_capacity_adm').value = 1800.0;
    document.getElementById('spmt_num_lines').value = 6;
    document.getElementById('spmt_line_load').value = 350.0;
    document.getElementById('heavy_rigging_load').value = 2500.0;
    triggerCalculation();
}
