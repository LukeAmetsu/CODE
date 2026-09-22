/**
 * NBR 8800 & CBCA Steel Connections Controller & 2D Canvas Engine
 */

let currentTypology = 'flexible_end_plate';
let connectionResult = null;

document.addEventListener('DOMContentLoaded', () => {
    selectTypology('flexible_end_plate');
});

function selectTypology(typologyKey) {
    currentTypology = typologyKey;
    const tabs = ['flexible_end_plate', 'double_angle', 'shear_tab', 'extended_end_plate', 'base_plate'];
    const tabShorts = {
        flexible_end_plate: 'fep',
        double_angle: 'da',
        shear_tab: 'st',
        extended_end_plate: 'eep',
        base_plate: 'bp'
    };

    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${tabShorts[t]}`);
        if (btn) {
            if (t === typologyKey) {
                btn.className = 'py-3 px-4 font-semibold text-xs md:text-sm border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 flex items-center gap-1.5';
            } else {
                btn.className = 'py-3 px-4 font-semibold text-xs md:text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1.5';
            }
        }
    });

    renderSpecificInputs();
    triggerConnectionCalculation();
}

function renderSpecificInputs() {
    const panel = document.getElementById('conn-specific-panel');
    if (!panel) return;

    if (currentTypology === 'flexible_end_plate') {
        panel.innerHTML = `
            <h3 class="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span>🔩</span> Geometria da Chapa de Topo Flexível
            </h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <label class="block font-medium mb-1">Esforço Cortante V_sd (kN)</label>
                    <input type="number" id="inp-Vsd" value="150" step="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Nº Linhas de Parafusos</label>
                    <input type="number" id="inp-rows" value="4" min="2" max="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Espaçamento Vertical (pitch) (mm)</label>
                    <input type="number" id="inp-pitch" value="75" step="5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Graminho (gauge) (mm)</label>
                    <input type="number" id="inp-gauge" value="100" step="5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Espessura Chapa t_p (mm)</label>
                    <input type="number" id="inp-tplate" value="9.5" step="1" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Espessura Alma Viga t_w (mm)</label>
                    <input type="number" id="inp-tweb" value="6.3" step="0.5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
            </div>
        `;
    } else if (currentTypology === 'double_angle') {
        panel.innerHTML = `
            <h3 class="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span>📐</span> Dupla Cantoneira de Alma (2L)
            </h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <label class="block font-medium mb-1">Esforço Cortante V_sd (kN)</label>
                    <input type="number" id="inp-Vsd" value="180" step="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Nº Parafusos na Alma</label>
                    <input type="number" id="inp-rows" value="4" min="2" max="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Espessura Cantoneira (mm)</label>
                    <input type="number" id="inp-tangle" value="7.9" step="0.5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Espessura Alma Viga t_w (mm)</label>
                    <input type="number" id="inp-tweb" value="7.1" step="0.5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
            </div>
        `;
    } else if (currentTypology === 'shear_tab') {
        panel.innerHTML = `
            <h3 class="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span>📑</span> Chapa Simples de Alma (Shear Tab)
            </h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <label class="block font-medium mb-1">Esforço Cortante V_sd (kN)</label>
                    <input type="number" id="inp-Vsd" value="120" step="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Nº Parafusos em Linha Única</label>
                    <input type="number" id="inp-numbolts" value="4" min="2" max="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Excentricidade e (mm)</label>
                    <input type="number" id="inp-ecc" value="65" step="5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Espessura Chapa t_p (mm)</label>
                    <input type="number" id="inp-tplate" value="9.5" step="1" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
            </div>
        `;
    } else if (currentTypology === 'extended_end_plate') {
        panel.innerHTML = `
            <h3 class="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span>🔄</span> Chapa Estendida de Momento (Rígida)
            </h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <label class="block font-medium mb-1">Momento Solicitante M_sd (kNm)</label>
                    <input type="number" id="inp-Msd" value="220" step="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Cortante Solicitante V_sd (kN)</label>
                    <input type="number" id="inp-Vsd" value="90" step="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Altura da Viga d_b (mm)</label>
                    <input type="number" id="inp-dbeam" value="450" step="10" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Largura da Mesa bf (mm)</label>
                    <input type="number" id="inp-bfbeam" value="190" step="5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Espessura Chapa Topo tp (mm)</label>
                    <input type="number" id="inp-tplate" value="25" step="1" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Nº Parafusos Mesa Tracionada</label>
                    <input type="number" id="inp-numflange" value="4" min="4" max="8" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
            </div>
        `;
    } else if (currentTypology === 'base_plate') {
        panel.innerHTML = `
            <h3 class="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <span>🏛️</span> Placa de Base de Pilar
            </h3>
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <label class="block font-medium mb-1">Compressão Normal N_sd (kN)</label>
                    <input type="number" id="inp-Nsd" value="450" step="50" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Momento M_sd (kNm)</label>
                    <input type="number" id="inp-Msd" value="35" step="5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Cortante V_sd (kN)</label>
                    <input type="number" id="inp-Vsd" value="40" step="5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Dimensão Chapa Bp x Ap (mm)</label>
                    <div class="flex gap-2">
                        <input type="number" id="inp-Bp" value="350" step="25" oninput="triggerConnectionCalculation()" class="w-1/2 rounded border p-2 bg-white dark:bg-gray-700">
                        <input type="number" id="inp-Ap" value="350" step="25" oninput="triggerConnectionCalculation()" class="w-1/2 rounded border p-2 bg-white dark:bg-gray-700">
                    </div>
                </div>
                <div>
                    <label class="block font-medium mb-1">Espessura da Placa tp (mm)</label>
                    <input type="number" id="inp-tplate" value="22" step="2" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
                <div>
                    <label class="block font-medium mb-1">Concreto Fundação fck (MPa)</label>
                    <input type="number" id="inp-fck" value="25" step="5" oninput="triggerConnectionCalculation()" class="w-full rounded border p-2 bg-white dark:bg-gray-700">
                </div>
            </div>
        `;
    }
}

async function triggerConnectionCalculation() {
    const inputs = {
        type: currentTypology,
        bolt_diameter: document.getElementById('conn-bolt-d')?.value || '3/4"',
        bolt_grade: document.getElementById('conn-bolt-grade')?.value || 'ASTM A325',
        steel_grade: document.getElementById('conn-steel-grade')?.value || 'ASTM A572 Gr50',
        weld_size: parseFloat(document.getElementById('conn-weld-size')?.value || 6.0)
    };

    if (currentTypology === 'flexible_end_plate') {
        inputs.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value || 150);
        inputs.num_bolt_rows = parseInt(document.getElementById('inp-rows')?.value || 4);
        inputs.pitch = parseFloat(document.getElementById('inp-pitch')?.value || 75);
        inputs.gauge = parseFloat(document.getElementById('inp-gauge')?.value || 100);
        inputs.t_plate = parseFloat(document.getElementById('inp-tplate')?.value || 9.5);
        inputs.t_web = parseFloat(document.getElementById('inp-tweb')?.value || 6.3);
    } else if (currentTypology === 'double_angle') {
        inputs.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value || 180);
        inputs.num_bolt_rows = parseInt(document.getElementById('inp-rows')?.value || 4);
        inputs.t_angle = parseFloat(document.getElementById('inp-tangle')?.value || 7.9);
        inputs.t_web = parseFloat(document.getElementById('inp-tweb')?.value || 7.1);
    } else if (currentTypology === 'shear_tab') {
        inputs.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value || 120);
        inputs.num_bolts = parseInt(document.getElementById('inp-numbolts')?.value || 4);
        inputs.eccentricity = parseFloat(document.getElementById('inp-ecc')?.value || 65);
        inputs.t_plate = parseFloat(document.getElementById('inp-tplate')?.value || 9.5);
    } else if (currentTypology === 'extended_end_plate') {
        inputs.M_sd = parseFloat(document.getElementById('inp-Msd')?.value || 220);
        inputs.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value || 90);
        inputs.d_beam = parseFloat(document.getElementById('inp-dbeam')?.value || 450);
        inputs.bf_beam = parseFloat(document.getElementById('inp-bfbeam')?.value || 190);
        inputs.t_plate = parseFloat(document.getElementById('inp-tplate')?.value || 25);
        inputs.num_bolts_flange = parseInt(document.getElementById('inp-numflange')?.value || 4);
    } else if (currentTypology === 'base_plate') {
        inputs.N_sd = parseFloat(document.getElementById('inp-Nsd')?.value || 450);
        inputs.M_sd = parseFloat(document.getElementById('inp-Msd')?.value || 35);
        inputs.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value || 40);
        inputs.B_p = parseFloat(document.getElementById('inp-Bp')?.value || 350);
        inputs.A_p = parseFloat(document.getElementById('inp-Ap')?.value || 350);
        inputs.t_p = parseFloat(document.getElementById('inp-tplate')?.value || 22);
        inputs.fck_concrete = parseFloat(document.getElementById('inp-fck')?.value || 25);
    }

    try {
        if (window.eel && eel.calculate_steel_connection_nbr8800) {
            const res = await eel.calculate_steel_connection_nbr8800(inputs)();
            if (res && res.status === 'success') {
                connectionResult = res;
                updateConnectionUI(res);
                drawConnectionCanvas(res, inputs);
            } else if (res && res.error) {
                console.error("Erro no cálculo da ligação metálica:", res.error);
            }
        }
    } catch (err) {
        console.error("Erro chamando calculate_steel_connection_nbr8800:", err);
    }
}

function updateConnectionUI(res) {
    const s = res.summary;
    const isMoment = currentTypology === 'extended_end_plate';
    const isBase = currentTypology === 'base_plate';

    // Demand & Capacity
    if (isMoment) {
        document.getElementById('conn-res-demand').innerText = s.M_sd.toFixed(1);
        document.getElementById('conn-res-demand-unit').innerText = 'kNm';
        document.getElementById('conn-res-capacity').innerText = s.M_Rd.toFixed(1);
        document.getElementById('conn-res-capacity-unit').innerText = 'kNm';
    } else if (isBase) {
        document.getElementById('conn-res-demand').innerText = s.N_sd.toFixed(0);
        document.getElementById('conn-res-demand-unit').innerText = 'kN';
        document.getElementById('conn-res-capacity').innerText = `tp req: ${s.tp_req.toFixed(1)} mm`;
        document.getElementById('conn-res-capacity-unit').innerText = `(Adotado: ${s.t_p} mm)`;
    } else {
        document.getElementById('conn-res-demand').innerText = s.V_sd.toFixed(1);
        document.getElementById('conn-res-demand-unit').innerText = 'kN';
        document.getElementById('conn-res-capacity').innerText = s.V_Rd.toFixed(1);
        document.getElementById('conn-res-capacity-unit').innerText = 'kN';
    }

    // Utilization
    const urPct = (s.utilization * 100).toFixed(1);
    document.getElementById('conn-res-ur').innerText = `${urPct}%`;
    document.getElementById('conn-res-status').innerText = s.is_approved ? 'Aprovado ✓' : 'Reprovado ✕';
    document.getElementById('conn-res-status').className = s.is_approved ? 'text-base font-extrabold text-emerald-600 my-1' : 'text-base font-extrabold text-rose-600 my-1';

    const badge = document.getElementById('conn-status-badge');
    if (badge) {
        badge.className = s.is_approved ? 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800' : 'px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800';
        badge.innerText = s.is_approved ? '✓ Aprovado' : '✕ Reprovado';
    }

    // Table Checks
    const tbody = document.getElementById('tbody-conn-checks');
    tbody.innerHTML = '';
    res.checks.forEach(c => {
        const tr = document.createElement('tr');
        const pass = c.UR <= 1.0;
        tr.innerHTML = `
            <td class="p-2.5 font-medium">${c.name}</td>
            <td class="p-2.5 font-semibold">${c.capacity}</td>
            <td class="p-2.5">${c.demand}</td>
            <td class="p-2.5 font-bold ${(c.UR*100).toFixed(1)}%">${(c.UR * 100).toFixed(1)}%</td>
            <td class="p-2.5 text-center">
                <span class="px-2 py-0.5 rounded text-[11px] font-bold ${pass ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                    ${pass ? 'OK' : 'FALHA'}
                </span>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Details specifications text
    const detailsDiv = document.getElementById('conn-spec-details');
    let specHtml = '';
    for (const [k, v] of Object.entries(res.details)) {
        specHtml += `<div>• <strong>${k.replace(/_/g, ' ').toUpperCase()}:</strong> ${v}</div>`;
    }
    detailsDiv.innerHTML = specHtml;
}

// -------------------------------------------------------------
// 2D Connection Drawing Engine
// -------------------------------------------------------------
function drawConnectionCanvas(res, inputs) {
    const canvas = document.getElementById('conn-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;

    if (currentTypology === 'flexible_end_plate' || currentTypology === 'extended_end_plate') {
        // Draw Column / Support on the left
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.fillRect(cx - 110, 40, 30, height - 80);

        // Draw End Plate
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        const plateH = currentTypology === 'extended_end_plate' ? 290 : 220;
        ctx.fillRect(cx - 80, cy - plateH / 2, 14, plateH);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(cx - 80, cy - plateH / 2, 14, plateH);

        // Draw Beam profile extending to the right
        ctx.fillStyle = isDark ? '#475569' : '#e2e8f0';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        // Top flange
        ctx.fillRect(cx - 66, cy - 100, 260, 14);
        ctx.strokeRect(cx - 66, cy - 100, 260, 14);
        // Bottom flange
        ctx.fillRect(cx - 66, cy + 86, 260, 14);
        ctx.strokeRect(cx - 66, cy + 86, 260, 14);
        // Web
        ctx.fillRect(cx - 66, cy - 86, 260, 172);

        // Fillet Welds (Beads)
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(cx - 66, cy - 80, 5, 0, Math.PI / 2);
        ctx.lineTo(cx - 66, cy - 80);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx - 66, cy + 80, 5, -Math.PI / 2, 0);
        ctx.lineTo(cx - 66, cy + 80);
        ctx.fill();

        // Draw Bolts
        const numRows = inputs.num_bolt_rows || 4;
        const boltSpacing = (plateH - 60) / Math.max(1, numRows - 1);
        for (let i = 0; i < numRows; i++) {
            const by = (cy - plateH / 2 + 30) + i * boltSpacing;
            drawBoltSymbol(ctx, cx - 85, by);
        }

    } else if (currentTypology === 'double_angle') {
        // Draw Girder Web / Column on the left
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.fillRect(cx - 100, 40, 25, height - 80);

        // Beam extending right
        ctx.fillStyle = isDark ? '#475569' : '#e2e8f0';
        ctx.fillRect(cx - 50, cy - 90, 240, 180);

        // Double Angle (2L)
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(cx - 75, cy - 70, 45, 140);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(cx - 75, cy - 70, 45, 140);

        // Bolts
        const numRows = inputs.num_bolt_rows || 4;
        const boltSpacing = 110 / Math.max(1, numRows - 1);
        for (let i = 0; i < numRows; i++) {
            const by = (cy - 55) + i * boltSpacing;
            drawBoltSymbol(ctx, cx - 52, by);
        }

    } else if (currentTypology === 'shear_tab') {
        // Column Flange
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.fillRect(cx - 100, 40, 25, height - 80);

        // Welded Shear Tab Plate
        ctx.fillStyle = '#64748b';
        ctx.fillRect(cx - 75, cy - 80, 70, 160);
        ctx.strokeRect(cx - 75, cy - 80, 70, 160);

        // Beam web overlapping
        ctx.fillStyle = isDark ? '#475569' : '#e2e8f0';
        ctx.fillRect(cx - 40, cy - 100, 220, 200);

        // Bolts in single line
        const numB = inputs.num_bolts || 4;
        const bSpacing = 120 / Math.max(1, numB - 1);
        for (let i = 0; i < numB; i++) {
            const by = (cy - 60) + i * bSpacing;
            drawBoltSymbol(ctx, cx - 20, by);
        }

    } else if (currentTypology === 'base_plate') {
        // Concrete Pedestal
        ctx.fillStyle = isDark ? '#1e293b' : '#f1f5f9';
        ctx.fillRect(cx - 180, cy + 40, 360, 130);
        ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1';
        ctx.strokeRect(cx - 180, cy + 40, 360, 130);

        // Steel Base Plate
        ctx.fillStyle = '#64748b';
        ctx.fillRect(cx - 140, cy + 20, 280, 20);
        ctx.strokeStyle = '#0f172a';
        ctx.strokeRect(cx - 140, cy + 20, 280, 20);

        // Column extending upward
        ctx.fillStyle = isDark ? '#475569' : '#94a3b8';
        ctx.fillRect(cx - 50, 60, 100, cy - 40);
        ctx.strokeRect(cx - 50, 60, 100, cy - 40);

        // Anchor Bolts (Chumbadores) with hooks
        drawAnchorBolt(ctx, cx - 100, cy + 10);
        drawAnchorBolt(ctx, cx + 100, cy + 10);

        // Label Pedestal
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillText('Pedestal de Concreto Armado', cx - 75, cy + 100);
    }
}

function drawBoltSymbol(ctx, x, y) {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center cross
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
}

function drawAnchorBolt(ctx, x, y) {
    ctx.fillStyle = '#f59e0b';
    // Nut and washer
    ctx.fillRect(x - 7, y - 4, 14, 8);
    // Shaft into concrete
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 90);
    ctx.lineTo(x + 20, y + 90); // 90 degree hook
    ctx.stroke();
}

window.selectTypology = selectTypology;
window.triggerConnectionCalculation = triggerConnectionCalculation;
