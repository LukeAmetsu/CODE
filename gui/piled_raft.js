/**
 * Piled Raft Foundation UI Controller & Multi-View CAD Canvas Renderer
 * Standards: NBR 6118:2023 & NBR 6122:2019
 */

let lastResult = null;
let isCalculating = false;
let currentViewMode = 'plan'; // 'plan', 'section', 'heatmap'
let isAnimatingTransit = false;
let animationReqId = null;

// Sobrecargas adicionais
let additionalPointLoads = [];
let additionalDistributedLoads = [];
let hoverMousePos = null;

const PILED_RAFT_SESSION_KEY = 'piled_raft_session_data';

function savePiledRaftSession() {
    try {
        const inputs = {};
        const elements = document.querySelectorAll('#piled-raft-form input, #piled-raft-form select');
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
            inputs: inputs,
            additionalPointLoads: additionalPointLoads,
            additionalDistributedLoads: additionalDistributedLoads
        };
        localStorage.setItem(PILED_RAFT_SESSION_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('Erro ao salvar sessão Piled Raft:', e);
    }
}

function loadPiledRaftSession() {
    const raw = localStorage.getItem(PILED_RAFT_SESSION_KEY);
    if (!raw) return false;
    try {
        const data = JSON.parse(raw);
        if (!data) return false;

        if (data.inputs) {
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
        }
        if (Array.isArray(data.additionalPointLoads)) {
            additionalPointLoads = data.additionalPointLoads;
        }
        if (Array.isArray(data.additionalDistributedLoads)) {
            additionalDistributedLoads = data.additionalDistributedLoads;
        }
        return true;
    } catch (e) {
        console.warn('Erro ao restaurar sessão Piled Raft:', e);
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Restore previous session data if available
    loadPiledRaftSession();

    const inputs = document.querySelectorAll('#piled-raft-form input, #piled-raft-form select');
    inputs.forEach(input => {
        input.addEventListener('input', debounce(() => { triggerCalculation(); savePiledRaftSession(); }, 250));
        input.addEventListener('change', () => { triggerCalculation(); savePiledRaftSession(); });
    });

    // 2. Check for springs calculated in Aoki-Velloso (will update springs if newly exported)
    checkAndLoadAokiSprings();

    // 3. Render initial tables (with restored loads)
    renderPointLoadsTable();
    renderDistributedLoadsTable();

    // Canvas listeners
    const canvas = document.getElementById('raftCanvas');
    if (canvas) {
        canvas.addEventListener('mousemove', handleCanvasMouseMove);
        canvas.addEventListener('mouseleave', handleCanvasMouseLeave);
    }

    // Canvas resize handling
    window.addEventListener('resize', () => {
        if (lastResult) drawCanvas();
    });

    // Save before leaving page
    window.addEventListener('beforeunload', savePiledRaftSession);

    // Initial trigger
    triggerCalculation();
});

// -------------------------------------------------------------
// GERENCIADOR DE SOBRECARGAS ADICIONAIS (PONTUAIS E DISTRIBUÍDAS)
// -------------------------------------------------------------
function renderPointLoadsTable() {
    const tbody = document.getElementById('point-loads-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (additionalPointLoads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-2 text-center text-gray-400 italic">Nenhuma carga concentrada adicional</td></tr>`;
        return;
    }

    additionalPointLoads.forEach((pt, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50';
        tr.innerHTML = `
            <td class="p-1"><input type="text" value="${pt.name || 'P' + (idx+1)}" onchange="updatePointLoad(${idx}, 'name', this.value)" class="w-16 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"></td>
            <td class="p-1"><input type="number" step="0.5" value="${pt.x}" onchange="updatePointLoad(${idx}, 'x', this.value)" class="w-14 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono"></td>
            <td class="p-1"><input type="number" step="0.5" value="${pt.y}" onchange="updatePointLoad(${idx}, 'y', this.value)" class="w-14 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono"></td>
            <td class="p-1"><input type="number" step="50" value="${pt.P}" onchange="updatePointLoad(${idx}, 'P', this.value)" class="w-16 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono font-bold text-rose-600"></td>
            <td class="p-1"><input type="number" step="0.2" min="0.2" value="${pt.pad_width || 1.0}" onchange="updatePointLoad(${idx}, 'pad_width', this.value)" class="w-14 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono"></td>
            <td class="p-1 text-center"><button type="button" onclick="removePointLoad(${idx})" class="text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30" title="Remover">✕</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addPointLoadRow() {
    const lx = parseNum('raft_length_x', 16.0);
    const ly = parseNum('raft_length_y', 12.0);
    additionalPointLoads.push({
        name: `P${additionalPointLoads.length + 1}`,
        x: parseFloat((lx / 2.0).toFixed(1)),
        y: parseFloat((ly / 2.0).toFixed(1)),
        P: 400.0,
        pad_width: 1.0
    });
    renderPointLoadsTable();
    triggerCalculation();
}

function updatePointLoad(idx, field, val) {
    if (!additionalPointLoads[idx]) return;
    if (field === 'name') {
        additionalPointLoads[idx].name = val;
    } else {
        additionalPointLoads[idx][field] = parseFloat(val) || 0.0;
    }
    triggerCalculation();
}

function removePointLoad(idx) {
    additionalPointLoads.splice(idx, 1);
    renderPointLoadsTable();
    triggerCalculation();
}

function renderDistributedLoadsTable() {
    const tbody = document.getElementById('dist-loads-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (additionalDistributedLoads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-2 text-center text-gray-400 italic">Nenhuma sobrecarga distribuída adicional</td></tr>`;
        return;
    }

    additionalDistributedLoads.forEach((dl, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-700/50';
        tr.innerHTML = `
            <td class="p-1"><input type="text" value="${dl.name || 'Q' + (idx+1)}" onchange="updateDistributedLoad(${idx}, 'name', this.value)" class="w-16 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"></td>
            <td class="p-1">
                <div class="flex items-center gap-1">
                    <input type="number" step="0.5" value="${dl.x1}" onchange="updateDistributedLoad(${idx}, 'x1', this.value)" class="w-12 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono">
                    <span>-</span>
                    <input type="number" step="0.5" value="${dl.x2}" onchange="updateDistributedLoad(${idx}, 'x2', this.value)" class="w-12 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono">
                </div>
            </td>
            <td class="p-1">
                <div class="flex items-center gap-1">
                    <input type="number" step="0.5" value="${dl.y1}" onchange="updateDistributedLoad(${idx}, 'y1', this.value)" class="w-12 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono">
                    <span>-</span>
                    <input type="number" step="0.5" value="${dl.y2}" onchange="updateDistributedLoad(${idx}, 'y2', this.value)" class="w-12 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono">
                </div>
            </td>
            <td class="p-1"><input type="number" step="5" value="${dl.q}" onchange="updateDistributedLoad(${idx}, 'q', this.value)" class="w-14 p-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-mono font-bold text-indigo-600"></td>
            <td class="p-1 text-center"><button type="button" onclick="removeDistributedLoad(${idx})" class="text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30" title="Remover">✕</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addDistributedLoadRow() {
    const lx = parseNum('raft_length_x', 16.0);
    const ly = parseNum('raft_length_y', 12.0);
    additionalDistributedLoads.push({
        name: `Q${additionalDistributedLoads.length + 1}`,
        x1: parseFloat(Math.max(0, lx * 0.2).toFixed(1)),
        x2: parseFloat(Math.min(lx, lx * 0.6).toFixed(1)),
        y1: parseFloat(Math.max(0, ly * 0.2).toFixed(1)),
        y2: parseFloat(Math.min(ly, ly * 0.7).toFixed(1)),
        q: 25.0
    });
    renderDistributedLoadsTable();
    triggerCalculation();
}

function updateDistributedLoad(idx, field, val) {
    if (!additionalDistributedLoads[idx]) return;
    if (field === 'name') {
        additionalDistributedLoads[idx].name = val;
    } else {
        additionalDistributedLoads[idx][field] = parseFloat(val) || 0.0;
    }
    triggerCalculation();
}

function removeDistributedLoad(idx) {
    additionalDistributedLoads.splice(idx, 1);
    renderDistributedLoadsTable();
    triggerCalculation();
}

function checkAndLoadAokiSprings() {
    const raw = localStorage.getItem('aoki_springs_piled_raft');
    if (!raw) return;
    try {
        const data = JSON.parse(raw);
        const isPending = localStorage.getItem('aoki_springs_piled_raft_pending') === 'true';

        // Apply springs if newly exported from Aoki, or if form hasn't been populated
        if (isPending || !localStorage.getItem(PILED_RAFT_SESSION_KEY)) {
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
            localStorage.removeItem('aoki_springs_piled_raft_pending');
            savePiledRaftSession();
        }

        const banner = document.getElementById('aoki-import-banner');
        const txt = document.getElementById('aoki-banner-text');
        if (banner && txt) {
            txt.innerHTML = `Molas importadas com sucesso do Aoki-Velloso! <strong>Kz = ${Number(data.pile_spring_kz_kN_m).toLocaleString('pt-BR')} kN/m</strong> | <strong>Radm = ${Number(data.pile_capacity_adm_kN).toLocaleString('pt-BR')} kN</strong> | <strong>ks = ${Number(data.subgrade_ks_kN_m3).toLocaleString('pt-BR')} kN/m³</strong>`;
            banner.classList.remove('hidden');
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

        // Cargas móveis & Concomitância
        moving_load_mode: document.getElementById('moving_load_mode')?.value || 'concomitant',

        spmt_num_lines: parseInt(document.getElementById('spmt_num_lines')?.value || '6', 10),
        spmt_line_load: parseNum('spmt_line_load', 350.0),
        spmt_line_spacing: parseNum('spmt_line_spacing', 1.50),
        spmt_gauge: parseNum('spmt_gauge', 2.40),
        spmt_corridor_y: parseNum('spmt_corridor_y', 6.0),
        spmt_current_pos: parseNum('spmt_pos_slider', 8.0),

        gantry_total_load_tf: parseNum('gantry_total_load_tf', 148.42),
        gantry_leg_load_tf: parseNum('gantry_leg_load_tf', 74.21),
        gantry_wheels_per_leg: parseInt(document.getElementById('gantry_wheels_per_leg')?.value || '4', 10),
        gantry_wheel_spacing: parseNum('gantry_wheel_spacing', 1.40),
        gantry_edge_distance: parseNum('gantry_edge_distance', 1.00),
        gantry_sync_spmt: document.getElementById('gantry_sync_spmt')?.checked !== false,

        q_live: parseNum('q_live', 10.0),

        heavy_rigging_load: parseNum('heavy_rigging_load', 0.0),
        heavy_rigging_x: parseNum('heavy_rigging_x', 8.0),
        heavy_rigging_y: parseNum('heavy_rigging_y', 6.0),

        point_loads: additionalPointLoads.map(p => ({
            name: p.name || 'P',
            x: parseFloat(p.x) || 0.0,
            y: parseFloat(p.y) || 0.0,
            P: parseFloat(p.P) || 0.0,
            pad_width: parseFloat(p.pad_width) || 1.0
        })),
        distributed_loads: additionalDistributedLoads.map(d => ({
            name: d.name || 'Q',
            x1: Math.min(parseFloat(d.x1) || 0.0, parseFloat(d.x2) || 0.0),
            x2: Math.max(parseFloat(d.x1) || 0.0, parseFloat(d.x2) || 0.0),
            y1: Math.min(parseFloat(d.y1) || 0.0, parseFloat(d.y2) || 0.0),
            y2: Math.max(parseFloat(d.y1) || 0.0, parseFloat(d.y2) || 0.0),
            q: parseFloat(d.q) || 0.0
        })),

        unit_cost_concrete: parseNum('unit_cost_concrete', 550.0),
        unit_cost_steel: parseNum('unit_cost_steel', 12.50),
        unit_cost_formwork: parseNum('unit_cost_formwork', 85.0),
        unit_cost_drilling: parseNum('unit_cost_drilling', 180.0)
    };
}

async function triggerCalculation() {
    if (isCalculating) return;
    isCalculating = true;

    const inputs = getFormInputs();
    
    // Sync slider max with raft length
    const slider = document.getElementById('spmt_pos_slider');
    if (slider) {
        slider.min = -2.0;
        slider.max = inputs.raft_length_x + 2.0;
        const curVal = parseFloat(slider.value);
        if (curVal > inputs.raft_length_x + 2.0) {
            slider.value = inputs.raft_length_x / 2.0;
        }
        inputs.spmt_current_pos = parseFloat(slider.value);
    }

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
            console.warn("Eel not connected. Running offline calculation fallback.");
        }
    } catch (err) {
        console.error("Eel invocation failed:", err);
    } finally {
        isCalculating = false;
    }
}

function updateSpmtPosition(val) {
    const num = parseFloat(val);
    const span = document.getElementById('spmt_pos_val');
    if (span) span.innerText = `${num.toFixed(1)} m`;
    drawCanvas();
    debounce(triggerCalculation, 150)();
}

function goToGoverningPosition() {
    if (!lastResult || !lastResult.piles_summary) return;
    const govX = lastResult.piles_summary.governing_spmt_x;
    if (govX != null) {
        const slider = document.getElementById('spmt_pos_slider');
        if (slider) slider.value = govX;
        updateSpmtPosition(govX);
    }
}

function toggleTransitAnimation() {
    const btn = document.getElementById('btn-play-transit');
    const icon = document.getElementById('play-icon');
    const txt = document.getElementById('play-text');
    const slider = document.getElementById('spmt_pos_slider');
    const Lx = parseNum('raft_length_x', 16.0);

    if (isAnimatingTransit) {
        isAnimatingTransit = false;
        if (animationReqId) cancelAnimationFrame(animationReqId);
        if (icon) icon.innerText = '▶';
        if (txt) txt.innerText = 'Animar Tráfego';
    } else {
        isAnimatingTransit = true;
        if (icon) icon.innerText = '⏸';
        if (txt) txt.innerText = 'Pausar';

        let curPos = slider ? parseFloat(slider.value) : 0;
        function stepAnim() {
            if (!isAnimatingTransit) return;
            curPos += 0.12;
            if (curPos > Lx + 2.0) curPos = -2.0;
            if (slider) slider.value = curPos.toFixed(2);
            updateSpmtPosition(curPos);
            animationReqId = requestAnimationFrame(stepAnim);
        }
        animationReqId = requestAnimationFrame(stepAnim);
    }
}

function switchViewMode(mode) {
    currentViewMode = mode;
    ['plan', 'section', 'heatmap'].forEach(m => {
        const btn = document.getElementById(`tab-${m}`);
        if (btn) {
            if (m === mode) {
                btn.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs";
            } else {
                btn.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white";
            }
        }
    });

    const infoTag = document.getElementById('canvas-info-tag');
    const hoverInfo = document.getElementById('heatmap-hover-info');
    const heatmapControls = document.getElementById('heatmap-controls-bar');
    const punchingWrap = document.getElementById('toggle-punching-wrap');
    const rebarWrap = document.getElementById('toggle-rebar-wrap');

    if (mode === 'heatmap') {
        if (infoTag) infoTag.innerText = 'Mapa de Calor 2D Contínuo';
        if (heatmapControls) {
            heatmapControls.classList.remove('hidden');
            heatmapControls.classList.add('flex');
        }
        if (hoverInfo) hoverInfo.classList.remove('hidden');
        if (punchingWrap) punchingWrap.classList.add('hidden');
        if (rebarWrap) rebarWrap.classList.add('hidden');
    } else {
        if (infoTag) {
            if (mode === 'plan') infoTag.innerText = 'Planta Baixa & Trânsito SPMT';
            else if (mode === 'section') infoTag.innerText = 'Corte Geotécnico & Estratos';
        }
        if (heatmapControls) {
            heatmapControls.classList.add('hidden');
            heatmapControls.classList.remove('flex');
        }
        if (hoverInfo) hoverInfo.classList.add('hidden');
        if (punchingWrap) punchingWrap.classList.remove('hidden');
        if (rebarWrap) rebarWrap.classList.remove('hidden');
    }

    drawCanvas();
}

function handleCanvasMouseMove(e) {
    if (currentViewMode !== 'heatmap') return;
    const canvas = document.getElementById('raftCanvas');
    if (!canvas || !lastResult) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = (e.clientX - rect.left) * scaleX;
    const clientY = (e.clientY - rect.top) * scaleY;

    // Scale factors
    const inputs = getFormInputs();
    const Lx = inputs.raft_length_x;
    const Ly = inputs.raft_length_y;
    const margin = 50;
    const scale = Math.min((canvas.width - 2 * margin) / Lx, (canvas.height - 2 * margin) / Ly);
    const offsetX = (canvas.width - Lx * scale) / 2.0;
    const offsetY = (canvas.height - Ly * scale) / 2.0;

    const mx = (clientX - offsetX) / scale;
    const my = Ly - (clientY - offsetY) / scale;

    const hoverInfo = document.getElementById('heatmap-hover-info');
    if (!hoverInfo) return;

    if (mx >= 0 && mx <= Lx && my >= 0 && my <= Ly) {
        hoverMousePos = { x: mx, y: my };
        const grid = lastResult.heatmap_grid;
        if (grid && grid.xs && grid.ys) {
            const field = document.getElementById('heatmap_field_select')?.value || 'settlement';
            let matrix = grid.settlements_mm;
            let fieldLabel = 'Recalque';
            let fieldUnit = 'mm';
            if (field === 'soil_pressure') {
                matrix = grid.soil_pressures_kPa;
                fieldLabel = 'Tensão Solo';
                fieldUnit = 'kPa';
            } else if (field === 'pile_util') {
                matrix = grid.pile_util_pct;
                fieldLabel = 'Util. Estaca';
                fieldUnit = '%';
            } else if (field === 'moment') {
                matrix = grid.moments_kNm_m;
                fieldLabel = 'Momento';
                fieldUnit = 'kN·m/m';
            }

            const i = Math.max(0, Math.min(grid.nx - 1, Math.round((mx / Lx) * (grid.nx - 1))));
            const j = Math.max(0, Math.min(grid.ny - 1, Math.round((my / Ly) * (grid.ny - 1))));
            const val = matrix && matrix[j] ? matrix[j][i] : 0.0;

            hoverInfo.innerText = `X: ${mx.toFixed(2)}m | Y: ${my.toFixed(2)}m | ${fieldLabel}: ${val.toFixed(1)} ${fieldUnit}`;
        }
    } else {
        hoverMousePos = null;
        hoverInfo.innerText = 'X: -, Y: -, Val: -';
    }
}

function handleCanvasMouseLeave() {
    hoverMousePos = null;
    const hoverInfo = document.getElementById('heatmap-hover-info');
    if (hoverInfo) hoverInfo.innerText = 'X: -, Y: -, Val: -';
}

function getTurboColor(t) {
    t = Math.max(0.0, Math.min(1.0, t));
    let r, g, b;
    if (t < 0.25) {
        const f = t / 0.25;
        r = Math.round(30 + f * (6 - 30));
        g = Math.round(64 + f * (182 - 64));
        b = Math.round(175 + f * (212 - 175));
    } else if (t < 0.5) {
        const f = (t - 0.25) / 0.25;
        r = Math.round(6 + f * (16 - 6));
        g = Math.round(182 + f * (185 - 182));
        b = Math.round(212 + f * (129 - 212));
    } else if (t < 0.75) {
        const f = (t - 0.5) / 0.25;
        r = Math.round(16 + f * (245 - 16));
        g = Math.round(185 + f * (158 - 185));
        b = Math.round(129 + f * (11 - 129));
    } else {
        const f = (t - 0.75) / 0.25;
        r = Math.round(245 + f * (239 - 245));
        g = Math.round(158 + f * (68 - 158));
        b = Math.round(11 + f * (68 - 11));
    }
    return `rgb(${r},${g},${b})`;
}

function syncGantryLegFromTotal() {
    const tot = parseNum('gantry_total_load_tf', 0.0);
    const legInput = document.getElementById('gantry_leg_load_tf');
    if (legInput) legInput.value = (tot / 2.0).toFixed(2);
    updateGantryTrackCoordsLabel();
}

function syncGantryTotalFromLeg() {
    const leg = parseNum('gantry_leg_load_tf', 0.0);
    const totInput = document.getElementById('gantry_total_load_tf');
    if (totInput) totInput.value = (leg * 2.0).toFixed(2);
    updateGantryTrackCoordsLabel();
}

function centerSpmtCorridor() {
    const Ly = parseNum('raft_length_y', 12.0);
    const corr = document.getElementById('spmt_corridor_y');
    if (corr) {
        corr.value = (Ly / 2.0).toFixed(2);
        triggerCalculation();
    }
}

function selectMovingLoadMode(mode) {
    const sel = document.getElementById('moving_load_mode');
    if (sel) {
        sel.value = mode;
        triggerCalculation();
    }
}

function updateGantryTrackCoordsLabel() {
    const Ly = parseNum('raft_length_y', 12.0);
    const d = parseNum('gantry_edge_distance', 1.0);
    const lbl = document.getElementById('gantry-tracks-coords-label');
    if (lbl) {
        lbl.innerText = `y1: ${d.toFixed(1)}m | y2: ${(Ly - d).toFixed(1)}m`;
    }
}

function applyEquipmentPreset(type) {
    if (type === 'concomitant_spmt_gantry') {
        if (document.getElementById('moving_load_mode')) document.getElementById('moving_load_mode').value = 'concomitant';
        document.getElementById('spmt_num_lines').value = 6;
        document.getElementById('spmt_line_load').value = 350.0;
        document.getElementById('gantry_total_load_tf').value = 148.42;
        document.getElementById('gantry_leg_load_tf').value = 74.21;
        document.getElementById('heavy_rigging_load').value = 0.0;
    } else if (type === 'gantry_only') {
        if (document.getElementById('moving_load_mode')) document.getElementById('moving_load_mode').value = 'gantry_only';
        document.getElementById('spmt_num_lines').value = 0;
        document.getElementById('spmt_line_load').value = 0.0;
        document.getElementById('gantry_total_load_tf').value = 148.42;
        document.getElementById('gantry_leg_load_tf').value = 74.21;
        document.getElementById('heavy_rigging_load').value = 0.0;
    } else if (type === 'spmt_4l') {
        if (document.getElementById('moving_load_mode')) document.getElementById('moving_load_mode').value = 'spmt_only';
        document.getElementById('spmt_num_lines').value = 4;
        document.getElementById('spmt_line_load').value = 350.0;
        document.getElementById('gantry_total_load_tf').value = 0.0;
        document.getElementById('gantry_leg_load_tf').value = 0.0;
        document.getElementById('heavy_rigging_load').value = 0.0;
    } else if (type === 'spmt_6l') {
        if (document.getElementById('moving_load_mode')) document.getElementById('moving_load_mode').value = 'spmt_only';
        document.getElementById('spmt_num_lines').value = 6;
        document.getElementById('spmt_line_load').value = 350.0;
        document.getElementById('gantry_total_load_tf').value = 0.0;
        document.getElementById('gantry_leg_load_tf').value = 0.0;
        document.getElementById('heavy_rigging_load').value = 0.0;
    } else if (type === 'spmt_8l') {
        if (document.getElementById('moving_load_mode')) document.getElementById('moving_load_mode').value = 'spmt_only';
        document.getElementById('spmt_num_lines').value = 8;
        document.getElementById('spmt_line_load').value = 350.0;
        document.getElementById('gantry_total_load_tf').value = 0.0;
        document.getElementById('gantry_leg_load_tf').value = 0.0;
        document.getElementById('heavy_rigging_load').value = 0.0;
    } else if (type === 'spmt_12l') {
        if (document.getElementById('moving_load_mode')) document.getElementById('moving_load_mode').value = 'spmt_only';
        document.getElementById('spmt_num_lines').value = 12;
        document.getElementById('spmt_line_load').value = 350.0;
        document.getElementById('gantry_total_load_tf').value = 0.0;
        document.getElementById('gantry_leg_load_tf').value = 0.0;
        document.getElementById('heavy_rigging_load').value = 0.0;
    } else if (type === 'heavy_only') {
        if (document.getElementById('moving_load_mode')) document.getElementById('moving_load_mode').value = 'spmt_only';
        document.getElementById('spmt_num_lines').value = 0;
        document.getElementById('spmt_line_load').value = 0.0;
        document.getElementById('gantry_total_load_tf').value = 0.0;
        document.getElementById('gantry_leg_load_tf').value = 0.0;
        document.getElementById('heavy_rigging_load').value = 2500.0;
    }
    updateGantryTrackCoordsLabel();
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

function updateUIResults(res) {
    const ld = res.load_distribution || {};
    const piles = res.piles_summary || {};
    const settle = res.settlements || {};
    const punch = res.punching_shear || {};
    const reinf = res.reinforcement || {};
    const qty = res.quantities || {};
    const costs = res.cost_estimation || {};

    // 0. Active Mode Badge & Equipment Coordinates
    const mode = res.moving_load_mode || 'concomitant';
    const modeBadge = document.getElementById('active-mode-badge');
    if (modeBadge) {
        if (mode === 'concomitant') {
            modeBadge.innerText = 'Concomitante (SPMT Centro + Pórtico Bordas)';
            modeBadge.className = 'px-3 py-1 rounded-lg text-xs font-black bg-purple-600 text-white shadow-xs';
        } else if (mode === 'spmt_only') {
            modeBadge.innerText = 'Não Concomitante: Apenas SPMT Centro';
            modeBadge.className = 'px-3 py-1 rounded-lg text-xs font-black bg-blue-600 text-white shadow-xs';
        } else if (mode === 'gantry_only') {
            modeBadge.innerText = 'Não Concomitante: Apenas Pórtico Bordas';
            modeBadge.className = 'px-3 py-1 rounded-lg text-xs font-black bg-amber-600 text-white shadow-xs';
        } else if (mode === 'governing_envelope') {
            modeBadge.innerText = 'Envoltória Governante de Projeto';
            modeBadge.className = 'px-3 py-1 rounded-lg text-xs font-black bg-rose-600 text-white shadow-xs';
        }
    }
    updateGantryTrackCoordsLabel();

    // 1. Top Badges & Cards
    document.getElementById('card-total-p').innerText = ld.total_vertical_tf ? `${ld.total_vertical_tf.toFixed(0)}` : '-';
    document.getElementById('badge-alpha-pr').innerText = ld.alpha_pr != null ? `α_pr: ${(ld.alpha_pr * 100).toFixed(0)}%` : '-';
    document.getElementById('card-alpha-desc').innerText = `Estacas: ${ld.load_to_piles_pct}% (${ld.load_to_piles_kN} kN) | Solo: ${ld.load_to_soil_pct}%`;

    const isPileOk = piles.max_reaction_kN <= piles.pile_capacity_adm_kN;
    document.getElementById('card-max-reaction').innerText = piles.max_reaction_tf ? `${piles.max_reaction_tf.toFixed(1)}` : '-';
    updateBadge('badge-pile-status', isPileOk, isPileOk ? `FS = ${piles.fs_capacity_min}` : 'SOBRECARGA');
    document.getElementById('card-pile-fs').innerText = `Capacidade R_adm: ${(piles.pile_capacity_adm_kN / 9.81).toFixed(0)} tf (Pior X = ${piles.governing_spmt_x}m)`;

    const isSettleOk = settle.max_settlement_mm <= 25.0;
    document.getElementById('card-max-settle').innerText = settle.max_settlement_mm != null ? `${settle.max_settlement_mm.toFixed(1)}` : '-';
    updateBadge('badge-settle-status', isSettleOk, isSettleOk ? 'OK (≤ 25mm)' : 'ALERTA');
    document.getElementById('card-settle-diff').innerText = `Diferencial: ${settle.differential_mm} mm (θ = ${settle.angular_distortion})`;

    const isPunchOk = punch.overall_status === 'APROVADO';
    const punchRatio = (punch.tau_Sd1_MPa / punch.tau_Rd1_MPa).toFixed(2);
    document.getElementById('card-punch-ratio').innerText = `${punchRatio}`;
    updateBadge('badge-punch-status', isPunchOk, punch.overall_status);
    document.getElementById('card-punch-studs').innerText = punch.needs_studs ? `Asw = ${punch.A_sw_cm2} cm² (Studs)` : 'Dispensada armadura';

    // 1B. Comparative Study Table (Cargas Concomitantes vs Não Concomitantes)
    const comp = res.comparative_cases || {};
    const spmtC = comp.spmt_only || {};
    const gantryC = comp.gantry_only || {};
    const concC = comp.concomitant || {};
    const govC = comp.governing || {};

    const setCompVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val !== undefined && val !== null ? val : '-';
    };

    setCompVal('cmp-spmt-equip', spmtC.equipment_total_tf != null ? `${spmtC.equipment_total_tf} tf` : '-');
    setCompVal('cmp-gantry-equip', gantryC.equipment_total_tf != null ? `${gantryC.equipment_total_tf} tf` : '-');
    setCompVal('cmp-conc-equip', concC.equipment_total_tf != null ? `${concC.equipment_total_tf} tf` : '-');
    setCompVal('cmp-gov-equip', concC.equipment_total_tf != null ? `${concC.equipment_total_tf} tf` : '-');

    setCompVal('cmp-spmt-tot', spmtC.total_vertical_tf != null ? `${spmtC.total_vertical_tf} tf` : '-');
    setCompVal('cmp-gantry-tot', gantryC.total_vertical_tf != null ? `${gantryC.total_vertical_tf} tf` : '-');
    setCompVal('cmp-conc-tot', concC.total_vertical_tf != null ? `${concC.total_vertical_tf} tf` : '-');
    setCompVal('cmp-gov-tot', concC.total_vertical_tf != null ? `${concC.total_vertical_tf} tf` : '-');

    setCompVal('cmp-spmt-rmax', spmtC.max_reaction_tf != null ? `${spmtC.max_reaction_tf} tf (${spmtC.max_reaction_kN} kN)` : '-');
    setCompVal('cmp-gantry-rmax', gantryC.max_reaction_tf != null ? `${gantryC.max_reaction_tf} tf (${gantryC.max_reaction_kN} kN)` : '-');
    setCompVal('cmp-conc-rmax', concC.max_reaction_tf != null ? `${concC.max_reaction_tf} tf (${concC.max_reaction_kN} kN)` : '-');
    setCompVal('cmp-gov-rmax', govC.max_reaction_tf != null ? `${govC.max_reaction_tf} tf` : '-');

    setCompVal('cmp-spmt-fs', spmtC.fs_capacity != null ? `FS = ${spmtC.fs_capacity} (${spmtC.status_capacity})` : '-');
    setCompVal('cmp-gantry-fs', gantryC.fs_capacity != null ? `FS = ${gantryC.fs_capacity} (${gantryC.status_capacity})` : '-');
    setCompVal('cmp-conc-fs', concC.fs_capacity != null ? `FS = ${concC.fs_capacity} (${concC.status_capacity})` : '-');
    setCompVal('cmp-gov-fs', govC.min_fs_capacity != null ? `FS_mín = ${govC.min_fs_capacity}` : '-');

    setCompVal('cmp-spmt-w', spmtC.max_settlement_mm != null ? `${spmtC.max_settlement_mm} mm` : '-');
    setCompVal('cmp-gantry-w', gantryC.max_settlement_mm != null ? `${gantryC.max_settlement_mm} mm` : '-');
    setCompVal('cmp-conc-w', concC.max_settlement_mm != null ? `${concC.max_settlement_mm} mm` : '-');
    setCompVal('cmp-gov-w', govC.max_settlement_mm != null ? `${govC.max_settlement_mm} mm` : '-');

    setCompVal('cmp-spmt-punch', spmtC.punching_ratio != null ? `${spmtC.punching_ratio} (${spmtC.punching_status})` : '-');
    setCompVal('cmp-gantry-punch', gantryC.punching_ratio != null ? `${gantryC.punching_ratio} (${gantryC.punching_status})` : '-');
    setCompVal('cmp-conc-punch', concC.punching_ratio != null ? `${concC.punching_ratio} (${concC.punching_status})` : '-');
    setCompVal('cmp-gov-punch', concC.punching_ratio != null ? `${concC.punching_ratio} (${concC.punching_status})` : '-');

    setCompVal('cmp-spmt-m', spmtC.moment_design_kNm_m != null ? `${spmtC.moment_design_kNm_m} kN·m/m` : '-');
    setCompVal('cmp-gantry-m', gantryC.moment_design_kNm_m != null ? `${gantryC.moment_design_kNm_m} kN·m/m` : '-');
    setCompVal('cmp-conc-m', concC.moment_design_kNm_m != null ? `${concC.moment_design_kNm_m} kN·m/m` : '-');
    setCompVal('cmp-gov-m', govC.max_moment_kNm_m != null ? `${govC.max_moment_kNm_m} kN·m/m` : '-');

    setCompVal('cmp-spmt-as', spmtC.as_req_cm2_m != null ? `${spmtC.as_req_cm2_m} cm²/m` : '-');
    setCompVal('cmp-gantry-as', gantryC.as_req_cm2_m != null ? `${gantryC.as_req_cm2_m} cm²/m` : '-');
    setCompVal('cmp-conc-as', concC.as_req_cm2_m != null ? `${concC.as_req_cm2_m} cm²/m` : '-');
    setCompVal('cmp-gov-as', govC.max_as_req_cm2_m != null ? `${govC.max_as_req_cm2_m} cm²/m` : '-');

    setCompVal('cmp-spmt-pile', spmtC.critical_pile_id ? `Estaca #${spmtC.critical_pile_id} (${spmtC.critical_pile_coord?.[0]}m, ${spmtC.critical_pile_coord?.[1]}m)` : '-');
    setCompVal('cmp-gantry-pile', gantryC.critical_pile_id ? `Estaca #${gantryC.critical_pile_id} (${gantryC.critical_pile_coord?.[0]}m, ${gantryC.critical_pile_coord?.[1]}m)` : '-');
    setCompVal('cmp-conc-pile', concC.critical_pile_id ? `Estaca #${concC.critical_pile_id} (${concC.critical_pile_coord?.[0]}m, ${concC.critical_pile_coord?.[1]}m)` : '-');
    setCompVal('cmp-gov-pile', `Governado por: ${govC.governing_case_name || 'Concomitante'}`);

    // 2. Executive Civil Quantities Table (Levantamento de Quantitativos)
    const setElemText = (id, text) => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    };

    const escEstaca = qty.excavation_piles_m3 != null ? qty.excavation_piles_m3.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-';
    const escMec = qty.excavation_mechanized_m3 != null ? qty.excavation_mechanized_m3.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-';
    const totalEsc = (qty.excavation_piles_m3 || 0) + (qty.excavation_mechanized_m3 || 0);
    const reaterro = qty.backfill_m3 != null ? qty.backfill_m3.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-';
    const botafora = qty.disposal_m3 != null ? qty.disposal_m3.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-';
    const concEstrutural = qty.concrete_structural_m3 != null ? qty.concrete_structural_m3.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-';
    const concMagro = qty.concrete_lean_m3 != null ? qty.concrete_lean_m3.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-';
    const totalConc = (qty.concrete_structural_m3 || 0) + (qty.concrete_lean_m3 || 0);
    const forma = qty.formwork_m2 != null ? qty.formwork_m2.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '-';
    const aco = qty.total_steel_kg != null ? qty.total_steel_kg.toLocaleString('pt-BR', {minimumFractionDigits: 0, maximumFractionDigits: 0}) : '-';

    setElemText('raft-qty-esc-badge', `Escavação: ${totalEsc.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1})} m³`);
    setElemText('raft-qty-conc-badge', `Concreto: ${totalConc.toLocaleString('pt-BR', {minimumFractionDigits: 1, maximumFractionDigits: 1})} m³`);

    setElemText('raft-qty-esc-estaca', escEstaca);
    setElemText('raft-qty-esc-mec', escMec);
    setElemText('raft-qty-reaterro', reaterro);
    setElemText('raft-qty-botafora', botafora);
    setElemText('raft-qty-conc-estrutural', concEstrutural);
    setElemText('raft-qty-conc-magro', concMagro);
    setElemText('raft-qty-forma', forma);
    setElemText('raft-qty-aco', aco);

    // 3. Technical Table (NBR 6118 / NBR 6122)
    document.getElementById('res-F-Sd').innerText = `${punch.critical_force_FSd_kN?.toFixed(1)} kN (γf·R_max)`;
    document.getElementById('res-tau-0').innerText = `u0 = ${punch.u0_m} m | τ_Sd0 = ${punch.tau_Sd0_MPa?.toFixed(2)} MPa`;
    document.getElementById('res-tau-rd2').innerText = `${punch.tau_Rd2_MPa?.toFixed(2)} MPa (${punch.status_strut_0})`;
    document.getElementById('res-tau-1').innerText = `u1 = ${punch.u1_m} m | τ_Sd1 = ${punch.tau_Sd1_MPa?.toFixed(2)} MPa`;
    document.getElementById('res-tau-rd1').innerText = `${punch.tau_Rd1_MPa?.toFixed(2)} MPa`;
    document.getElementById('res-studs-desc').innerText = punch.stud_status;

    document.getElementById('res-M-sd').innerText = `${reinf.M_design_kNm_m?.toFixed(1)} kN·m / m`;
    document.getElementById('res-As-req').innerText = `${reinf.As_final_cm2_m?.toFixed(2)} cm²/m`;
    document.getElementById('res-mesh-inf').innerText = reinf.bottom_mesh?.text || '-';
    document.getElementById('res-mesh-sup').innerText = reinf.top_mesh?.text || '-';
    document.getElementById('res-crack-width').innerText = `${reinf.crack_width?.w_k_mm?.toFixed(3)} mm (${reinf.crack_width?.status})`;
}

function drawCanvas() {
    const canvas = document.getElementById('raftCanvas');
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

    if (currentViewMode === 'plan') {
        drawPlanView(ctx, w, h);
    } else if (currentViewMode === 'section') {
        drawSectionView(ctx, w, h);
    } else if (currentViewMode === 'heatmap') {
        drawHeatmapView(ctx, w, h);
    }

    // Floating CAD HUD Overlay (RS2 Standard)
    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        const inputs = getFormInputs();
        const res = lastResult;
        const maxUtil = res?.punching?.max_utilization !== undefined ? `${(res.punching.max_utilization * 100).toFixed(1)}%` : '--';
        const qTot = res?.total_weight_tf ? `${res.total_weight_tf.toFixed(1)} tf` : (inputs.spmt_payload_tf ? `${inputs.spmt_payload_tf} tf` : '--');
        const viewName = currentViewMode === 'plan' ? 'Planta Baixa' : (currentViewMode === 'section' ? 'Corte Geotécnico' : 'Mapa de Calor');
        EngCAD.updateHUD(canvas.parentElement, `Radier Estaqueado (${viewName})`, [
            { label: 'Dimensões', value: `${inputs.raft_length_x}m × ${inputs.raft_length_y}m × ${inputs.raft_thickness}m`, color: '#38bdf8' },
            { label: 'Estacas', value: `${res?.piles_summary?.total_piles || (inputs.piles_nx * inputs.piles_ny) || 0} un (Ø ${inputs.pile_diameter}m)`, color: '#f1f5f9' },
            { label: 'Carga Móvel', value: qTot, color: '#f59e0b' },
            { label: 'Punção Máx', value: maxUtil, color: (res?.punching?.max_utilization || 0) > 1.0 ? '#ef4444' : '#10b981' }
        ]);
    }
}

// -------------------------------------------------------------
// VISTA 1: PLANTA BAIXA & TRÂNSITO SPMT
// -------------------------------------------------------------
function drawPlanView(ctx, w, h) {
    const inputs = getFormInputs();
    const res = lastResult;

    const Lx = inputs.raft_length_x;
    const Ly = inputs.raft_length_y;

    const margin = 50;
    const scaleX = (w - 2 * margin) / Lx;
    const scaleY = (h - 2 * margin) / Ly;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = (w - Lx * scale) / 2.0;
    const offsetY = (h - Ly * scale) / 2.0;

    const toPxX = (x) => offsetX + x * scale;
    const toPxY = (y) => offsetY + (Ly - y) * scale;

    // 2. Raft Slab Boundary (CAD Blueprint Hatching)
    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    const slabX = toPxX(0);
    const slabY = toPxY(Ly);
    const slabW = Lx * scale;
    const slabH = Ly * scale;
    ctx.fillRect(slabX, slabY, slabW, slabH);
    ctx.strokeRect(slabX, slabY, slabW, slabH);

    // Diagonal engineering hatch
    ctx.save();
    ctx.beginPath();
    ctx.rect(slabX, slabY, slabW, slabH);
    ctx.clip();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    const diag = Math.max(slabW, slabH) * 2;
    for (let d = -diag; d < diag; d += 16) {
        ctx.beginPath();
        ctx.moveTo(slabX + d, slabY);
        ctx.lineTo(slabX + d + diag, slabY + diag);
        ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    // Engineering Dimension lines (Cotas Técnicas RS2)
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawDimension(ctx, toPxX(0), toPxY(0), toPxX(Lx), toPxY(0), `Lx = ${Lx.toFixed(1)} m`, { offset: 24, isDark: true });
        EngCAD.drawDimension(ctx, toPxX(0), toPxY(Ly), toPxX(0), toPxY(0), `Ly = ${Ly.toFixed(1)} m`, { offset: -24, isDark: true });
    } else {
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.fillText(`Lx = ${Lx.toFixed(1)} m`, toPxX(Lx / 2), toPxY(0) + 24);
        ctx.textAlign = 'right';
        ctx.fillText(`Ly = ${Ly.toFixed(1)} m`, toPxX(0) - 10, toPxY(Ly / 2));
    }

    // 3. Reinforcement Mesh Grid (if toggled)
    const showRebar = document.getElementById('toggle-rebar')?.checked;
    if (showRebar) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
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

    // 4. Traffic Corridor Guide
    const cy = inputs.spmt_corridor_y;
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(toPxX(-2), toPxY(cy));
    ctx.lineTo(toPxX(Lx + 2), toPxY(cy));
    ctx.stroke();
    ctx.setLineDash([]);

    // 5. Piles
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

            // Punching perimeter u1
            if (showPunch && ratio > 0.65) {
                ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.arc(px, py, r_punch_px, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Pile circle
            ctx.beginPath();
            ctx.arc(px, py, Math.max(6, r_px), 0, Math.PI * 2);

            if (ratio > 1.0) {
                ctx.fillStyle = '#ef4444'; // Overcapacity Red
                ctx.strokeStyle = '#fca5a5';
            } else if (ratio > 0.8) {
                ctx.fillStyle = '#f59e0b'; // Amber
                ctx.strokeStyle = '#fde68a';
            } else {
                ctx.fillStyle = '#10b981'; // Green
                ctx.strokeStyle = '#6ee7b7';
            }
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label reaction
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(`${p.reaction_tf}t`, px, py + 3);
        });
    }

    // 6. Configuração dos Equipamentos Móveis e Modos de Análise
    const currentMode = inputs.moving_load_mode || 'concomitant';
    const showSpmt = (currentMode === 'concomitant' || currentMode === 'spmt_only' || currentMode === 'governing_envelope') && inputs.spmt_num_lines > 0;
    const showGantry = (currentMode === 'concomitant' || currentMode === 'gantry_only' || currentMode === 'governing_envelope') && (inputs.gantry_total_load_tf > 0 || inputs.gantry_leg_load_tf > 0);

    const spmtX = parseNum('spmt_pos_slider', 8.0);
    const gantryX = inputs.gantry_sync_spmt ? spmtX : parseNum('gantry_current_pos_x', spmtX);

    // 6A. Pórtico Rolante nas Duas Bordas (Gantry Crane on 2 Raft Edges)
    if (showGantry) {
        const edgeDist = inputs.gantry_edge_distance || 1.0;
        const yLeg1 = edgeDist;
        const yLeg2 = Ly - edgeDist;
        const nWheels = inputs.gantry_wheels_per_leg || 4;
        const wSpacing = inputs.gantry_wheel_spacing || 1.40;
        const startGantryX = gantryX - (nWheels - 1) * wSpacing / 2.0;

        // 6A.1 Trilhos de Aço nas Duas Bordas (Tracks along X)
        [yLeg1, yLeg2].forEach((trY, tIdx) => {
            const pyTrack = toPxY(trY);
            // Dormentes / chapas base de apoio
            ctx.fillStyle = 'rgba(71, 85, 105, 0.35)';
            ctx.fillRect(toPxX(-2.0), pyTrack - 4, (Lx + 4.0) * scale, 8);

            // Linha do trilho de aço
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(toPxX(-2.0), pyTrack);
            ctx.lineTo(toPxX(Lx + 2.0), pyTrack);
            ctx.stroke();

            // Marcações dos trilhos
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'left';
            ctx.fillText(`Trilho Borda ${tIdx === 0 ? 'Sul' : 'Norte'} (y=${trY.toFixed(1)}m)`, toPxX(0) + 6, pyTrack - 8);
        });

        // 6A.2 Viga Transversal Principal da Ponte do Pórtico (Conectando as 2 pernas sobre o radier)
        const beamW_m = 1.3;
        const gX1 = toPxX(gantryX - beamW_m / 2.0);
        const gX2 = toPxX(gantryX + beamW_m / 2.0);
        const gY_top = toPxY(yLeg2);
        const gY_bottom = toPxY(yLeg1);

        // Viga principal translúcida com gradiente industrial
        const gantryGrad = ctx.createLinearGradient(gX1, 0, gX2, 0);
        gantryGrad.addColorStop(0, 'rgba(245, 158, 11, 0.25)');
        gantryGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.40)');
        gantryGrad.addColorStop(1, 'rgba(217, 119, 6, 0.25)');
        ctx.fillStyle = gantryGrad;
        ctx.fillRect(gX1, gY_top, gX2 - gX1, gY_bottom - gY_top);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.strokeRect(gX1, gY_top, gX2 - gX1, gY_bottom - gY_top);

        // Treliçamento estrutural da viga transversal
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const nBays = 8;
        const bayDy = (yLeg2 - yLeg1) / nBays;
        for (let b = 0; b < nBays; b++) {
            const yA = toPxY(yLeg1 + b * bayDy);
            const yB = toPxY(yLeg1 + (b + 1) * bayDy);
            ctx.moveTo(gX1, yA);
            ctx.lineTo(gX2, yB);
            ctx.moveTo(gX2, yA);
            ctx.lineTo(gX1, yB);
        }
        ctx.stroke();

        // 6A.3 Carrinho Guincho / Trolley & Moitão Centralizado
        const trolleyY = toPxY(cy);
        const trollW = 1.8 * scale;
        const trollH = 1.2 * scale;
        ctx.fillStyle = '#b45309';
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 2;
        ctx.fillRect(toPxX(gantryX) - trollW / 2, trolleyY - trollH / 2, trollW, trollH);
        ctx.strokeRect(toPxX(gantryX) - trollW / 2, trolleyY - trollH / 2, trollW, trollH);

        // Cabos de içamento / Moitão
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(toPxX(gantryX), trolleyY, 4, 0, Math.PI * 2);
        ctx.stroke();

        // 6A.4 Truques de Rodas e Vigas Balancins nas duas bordas
        [yLeg1, yLeg2].forEach((legY, legIdx) => {
            const pyLeg = toPxY(legY);
            const bX1 = toPxX(startGantryX - 0.4);
            const bX2 = toPxX(startGantryX + (nWheels - 1) * wSpacing + 0.4);
            const bH = 0.5 * scale;

            // Viga balancim da perna
            ctx.fillStyle = '#d97706';
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = 2;
            ctx.fillRect(bX1, pyLeg - bH / 2, bX2 - bX1, bH);
            ctx.strokeRect(bX1, pyLeg - bH / 2, bX2 - bX1, bH);

            // Rodas do truque
            for (let wi = 0; wi < nWheels; wi++) {
                const wx = startGantryX + wi * wSpacing;
                const pxW = toPxX(wx);
                const rw_w = 0.6 * scale;
                const rw_h = 0.28 * scale;

                ctx.fillStyle = '#78350f';
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 1.5;
                ctx.fillRect(pxW - rw_w / 2, pyLeg - rw_h / 2, rw_w, rw_h);
                ctx.strokeRect(pxW - rw_w / 2, pyLeg - rw_h / 2, rw_w, rw_h);

                // Flange da roda
                ctx.fillStyle = '#f59e0b';
                ctx.beginPath();
                ctx.arc(pxW, pyLeg, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }

            // Pilar de base da perna
            ctx.fillStyle = '#b45309';
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2;
            const legFootW = 0.8 * scale;
            ctx.fillRect(toPxX(gantryX) - legFootW / 2, pyLeg - legFootW / 2, legFootW, legFootW);
            ctx.strokeRect(toPxX(gantryX) - legFootW / 2, pyLeg - legFootW / 2, legFootW, legFootW);

            // Carga por perna
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.fillStyle = '#fbbf24';
            ctx.textAlign = 'center';
            const legTf = (inputs.gantry_total_load_tf / 2.0).toFixed(1);
            const legLabelY = legIdx === 0 ? pyLeg + 20 : pyLeg - 12;
            ctx.fillText(`Perna ${legIdx === 0 ? 'Sul' : 'Norte'}: ${legTf} tf`, toPxX(gantryX), legLabelY);
        });

        // Título do Pórtico
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.fillText(`Pórtico Rolante 2 Bordas: ${inputs.gantry_total_load_tf} tf`, toPxX(gantryX), gY_top - 18);
    }

    // 6B. Linha de Eixo (SPMT) no Centro do Radier
    if (showSpmt) {
        const nLines = inputs.spmt_num_lines;
        const lSpacing = inputs.spmt_line_spacing;
        const gauge = inputs.spmt_gauge;
        const startX = spmtX - (nLines - 1) * lSpacing / 2.0;

        // Chassi central da Linha de Eixo
        const bX1 = toPxX(startX - 0.6);
        const bX2 = toPxX(startX + (nLines - 1) * lSpacing + 0.6);
        const bY1 = toPxY(cy - gauge / 2.0 - 0.4);
        const bY2 = toPxY(cy + gauge / 2.0 + 0.4);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.fillRect(bX1, bY2, bX2 - bX1, bY1 - bY2);
        ctx.strokeRect(bX1, bY2, bX2 - bX1, bY1 - bY2);

        // Truques e rodas do SPMT
        for (let i = 0; i < nLines; i++) {
            const wx = startX + i * lSpacing;
            const px = toPxX(wx);
            const pyL = toPxY(cy - gauge / 2.0);
            const pyR = toPxY(cy + gauge / 2.0);
            const w_w = 0.7 * scale;
            const w_h = 0.35 * scale;

            // Linha de eixo
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(px, pyL);
            ctx.lineTo(px, pyR);
            ctx.stroke();

            // Pneus Esquerdo e Direito
            [pyL, pyR].forEach(py => {
                ctx.fillStyle = '#38bdf8';
                ctx.strokeStyle = '#0369a1';
                ctx.lineWidth = 1.5;
                ctx.fillRect(px - w_w / 2, py - w_h / 2, w_w, w_h);
                ctx.strokeRect(px - w_w / 2, py - w_h / 2, w_w, w_h);
            });
        }

        // Rótulo SPMT
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        const spmtTf = (inputs.spmt_line_load * nLines / 9.81).toFixed(0);
        ctx.fillText(`SPMT ${nLines}L (${spmtTf} tf) [Centro]`, toPxX(spmtX), bY2 - 8);
    }

    // 7. Heavy Rigging / Turbine Load
    if (inputs.heavy_rigging_load > 0) {
        const hx = toPxX(inputs.heavy_rigging_x);
        const hy = toPxY(inputs.heavy_rigging_y);
        const pad_sz = 1.2 * scale;

        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.fillRect(hx - pad_sz / 2, hy - pad_sz / 2, pad_sz, pad_sz);
        ctx.strokeRect(hx - pad_sz / 2, hy - pad_sz / 2, pad_sz, pad_sz);

        // Crosshair
        ctx.beginPath();
        ctx.moveTo(hx - pad_sz, hy);
        ctx.lineTo(hx + pad_sz, hy);
        ctx.moveTo(hx, hy - pad_sz);
        ctx.lineTo(hx, hy + pad_sz);
        ctx.stroke();

        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = '#f87171';
        ctx.textAlign = 'center';
        ctx.fillText(`Turbina / Pick-up: ${(inputs.heavy_rigging_load / 9.81).toFixed(0)} tf`, hx, hy - pad_sz / 2 - 6);
    }

    // 8. Sobrecargas Distribuídas Adicionais
    if (additionalDistributedLoads.length > 0) {
        additionalDistributedLoads.forEach(dl => {
            const minX = Math.min(dl.x1, dl.x2);
            const maxX = Math.max(dl.x1, dl.x2);
            const minY = Math.min(dl.y1, dl.y2);
            const maxY = Math.max(dl.y1, dl.y2);
            if (maxX <= minX || maxY <= minY || dl.q <= 0) return;

            const rx1 = toPxX(minX);
            const rx2 = toPxX(maxX);
            const ry1 = toPxY(maxY);
            const ry2 = toPxY(minY);

            ctx.fillStyle = 'rgba(99, 102, 241, 0.20)';
            ctx.fillRect(rx1, ry1, rx2 - rx1, ry2 - ry1);

            ctx.strokeStyle = '#818cf8';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
            ctx.setLineDash([]);

            // Diagonal hatch pattern
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
            ctx.lineWidth = 1;
            const wBox = rx2 - rx1;
            const hBox = ry2 - ry1;
            for (let d = 10; d < wBox + hBox; d += 15) {
                const sx = Math.min(rx2, rx1 + d);
                const sy = ry1 + Math.max(0, d - wBox);
                const ex = rx1 + Math.max(0, d - hBox);
                const ey = Math.min(ry2, ry1 + d);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }

            // Center label
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillStyle = '#c7d2fe';
            ctx.textAlign = 'center';
            ctx.fillText(`${dl.name}: ${dl.q} kPa`, (rx1 + rx2) / 2, (ry1 + ry2) / 2 + 4);
        });
    }

    // 9. Cargas Concentradas Adicionais
    if (additionalPointLoads.length > 0) {
        additionalPointLoads.forEach(pt => {
            if (pt.P <= 0) return;
            const px = toPxX(pt.x);
            const py = toPxY(pt.y);
            const pad_sz = Math.max(12, (pt.pad_width || 1.0) * scale);

            ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2;
            ctx.fillRect(px - pad_sz / 2, py - pad_sz / 2, pad_sz, pad_sz);
            ctx.strokeRect(px - pad_sz / 2, py - pad_sz / 2, pad_sz, pad_sz);

            // Crosshair
            ctx.beginPath();
            ctx.moveTo(px - pad_sz * 0.7, py);
            ctx.lineTo(px + pad_sz * 0.7, py);
            ctx.moveTo(px, py - pad_sz * 0.7);
            ctx.lineTo(px, py + pad_sz * 0.7);
            ctx.stroke();

            // Label
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.fillStyle = '#fdba74';
            ctx.textAlign = 'center';
            ctx.fillText(`${pt.name}: ${(pt.P / 9.81).toFixed(0)} tf`, px, py - pad_sz / 2 - 4);
        });
    }
}

// -------------------------------------------------------------
// VISTA 2: CORTE GEOTÉCNICO & ESTRATOS DE SOLO
// -------------------------------------------------------------
function drawSectionView(ctx, w, h) {
    const inputs = getFormInputs();
    const res = lastResult;

    const Lx = inputs.raft_length_x;
    const H_raft = inputs.raft_thickness;
    const L_pile = inputs.pile_length;
    const H_soft = inputs.h_soft_layer;

    const marginX = 60;
    const scaleX = (w - 2 * marginX) / Lx;
    
    // Vertical scaling
    const total_depth = H_raft + L_pile + 3.0;
    const scaleY = (h - 90) / total_depth;
    
    const y_ground = 70;
    const y_raft_top = y_ground - H_raft * scaleY;
    const y_soft_cutoff = y_ground + H_soft * scaleY;
    const y_pile_tip = y_ground + L_pile * scaleY;
    const y_bottom = h - 20;

    const toPxX = (x) => marginX + x * scaleX;

    // 1. Soil Strata Layers
    // Layer 1: Soft Layer (Ignored / Argila Mole)
    ctx.fillStyle = '#1e293b'; // Slate dark
    ctx.fillRect(marginX - 30, y_ground, (Lx * scaleX) + 60, y_soft_cutoff - y_ground);
    
    // Hatching for soft layer
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let sy = y_ground + 15; sy < y_soft_cutoff; sy += 20) {
        ctx.beginPath();
        ctx.moveTo(marginX - 25, sy);
        ctx.lineTo(w - marginX + 25, sy);
        ctx.stroke();
    }

    // Layer 2: Bearing Resistant Layer (Areia/Rocha)
    ctx.fillStyle = '#0f172a'; // Deep slate
    ctx.fillRect(marginX - 30, y_soft_cutoff, (Lx * scaleX) + 60, y_bottom - y_soft_cutoff);

    // Bearing layer stipple/dots
    ctx.fillStyle = '#475569';
    for (let bx = marginX - 20; bx < w - marginX + 20; bx += 30) {
        for (let by = y_soft_cutoff + 15; by < y_bottom; by += 25) {
            ctx.beginPath();
            ctx.arc(bx + (by % 10), by, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Ground Line (NT 0.00)
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(marginX - 40, y_ground);
    ctx.lineTo(w - marginX + 40, y_ground);
    ctx.stroke();

    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText('NT ± 0.00 m', marginX - 10, y_ground - 4);

    // Soft layer cutoff line
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(marginX - 40, y_soft_cutoff);
    ctx.lineTo(w - marginX + 40, y_soft_cutoff);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'right';
    ctx.fillText(`Descarte Mole: -${H_soft.toFixed(1)} m`, marginX - 10, y_soft_cutoff - 4);

    // Bearing layer label
    ctx.fillStyle = '#34d399';
    ctx.textAlign = 'right';
    ctx.fillText(`Estrato Resistente (NSPT ≥ 30)`, marginX - 10, y_soft_cutoff + 35);

    // 2. Concrete Raft Slab
    ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.fillRect(toPxX(0), y_raft_top, Lx * scaleX, (H_raft * scaleY));
    ctx.strokeRect(toPxX(0), y_raft_top, Lx * scaleX, (H_raft * scaleY));

    // Reinforcement layers in slab (Top and Bottom red/blue lines)
    ctx.strokeStyle = '#38bdf8'; // Top mesh
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(toPxX(0) + 4, y_raft_top + 6);
    ctx.lineTo(toPxX(Lx) - 4, y_raft_top + 6);
    ctx.stroke();

    ctx.strokeStyle = '#10b981'; // Bottom mesh
    ctx.beginPath();
    ctx.moveTo(toPxX(0) + 4, y_ground - 6);
    ctx.lineTo(toPxX(Lx) - 4, y_ground - 6);
    ctx.stroke();

    // Raft label
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`Radier de Concreto h = ${H_raft.toFixed(2)} m (fck = ${inputs.fck} MPa)`, toPxX(Lx / 2), y_raft_top + (H_raft * scaleY) / 2 + 4);

    // 3. Piles in profile along X
    const nx = inputs.num_piles_x;
    const Dp_px = Math.max(12, inputs.pile_diameter * scaleX * 1.2);
    const edgeX = (Lx - (nx - 1) * (res?.piles_summary?.spacing_x_m || 3.0)) / 2.0;
    const spX = res?.piles_summary?.spacing_x_m || 3.0;

    for (let i = 0; i < nx; i++) {
        const px_m = edgeX + i * spX;
        const cx = toPxX(px_m);

        // Cylinder
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.fillRect(cx - Dp_px / 2, y_ground, Dp_px, (L_pile * scaleY));
        ctx.strokeRect(cx - Dp_px / 2, y_ground, Dp_px, (L_pile * scaleY));

        // Spring coils at tip
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let sy = y_pile_tip - 15; sy < y_pile_tip + 15; sy += 6) {
            ctx.moveTo(cx - 5, sy);
            ctx.lineTo(cx + 5, sy + 3);
        }
        ctx.stroke();

        ctx.font = 'bold 9px JetBrains Mono, monospace';
        ctx.fillStyle = '#34d399';
        ctx.textAlign = 'center';
        ctx.fillText(`E-X${i+1}`, cx, y_pile_tip + 28);
    }

    // 4. Equipamentos Móveis sobre o Radier em Perfil Longitudinal
    const currentMode = inputs.moving_load_mode || 'concomitant';
    const showSpmtSec = (currentMode === 'concomitant' || currentMode === 'spmt_only' || currentMode === 'governing_envelope') && inputs.spmt_num_lines > 0;
    const showGantrySec = (currentMode === 'concomitant' || currentMode === 'gantry_only' || currentMode === 'governing_envelope') && (inputs.gantry_total_load_tf > 0);
    const spmtX_sec = parseNum('spmt_pos_slider', 8.0);
    const gantryX_sec = inputs.gantry_sync_spmt ? spmtX_sec : parseNum('gantry_current_pos_x', spmtX_sec);

    // SPMT no Corte (Face superior da laje)
    if (showSpmtSec && -1.0 <= spmtX_sec && spmtX_sec <= Lx + 1.0) {
        const sx = toPxX(spmtX_sec);
        const spmtW_px = Math.max(24, (inputs.spmt_num_lines * inputs.spmt_line_spacing) * scaleX);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 2;
        ctx.fillRect(sx - spmtW_px / 2, y_raft_top - 14, spmtW_px, 10);
        ctx.strokeRect(sx - spmtW_px / 2, y_raft_top - 14, spmtW_px, 10);

        // Rodas do SPMT
        ctx.fillStyle = '#38bdf8';
        for (let ri = -spmtW_px / 2 + 3; ri <= spmtW_px / 2 - 3; ri += 8) {
            ctx.beginPath();
            ctx.arc(sx + ri, y_raft_top - 2, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.fillText(`SPMT (${((inputs.spmt_num_lines * inputs.spmt_line_load)/9.81).toFixed(0)} tf)`, sx, y_raft_top - 18);
    }

    // Perna do Pórtico no Corte (Face superior da laje)
    if (showGantrySec && -1.0 <= gantryX_sec && gantryX_sec <= Lx + 1.0) {
        const gx = toPxX(gantryX_sec);
        const gW_px = Math.max(20, (inputs.gantry_wheels_per_leg * inputs.gantry_wheel_spacing) * scaleX);

        // Viga balancim da perna
        ctx.fillStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 2;
        ctx.fillRect(gx - gW_px / 2, y_raft_top - 16, gW_px, 8);
        ctx.strokeRect(gx - gW_px / 2, y_raft_top - 16, gW_px, 8);

        // Coluna do pórtico subindo
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(gx, y_raft_top - 16);
        ctx.lineTo(gx, y_raft_top - 35);
        ctx.stroke();

        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.textAlign = 'center';
        ctx.fillText(`Pórtico Rolante (${inputs.gantry_total_load_tf.toFixed(0)} tf)`, gx, y_raft_top - 38);
    }

    // Pile tip depth callout
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(marginX - 40, y_pile_tip);
    ctx.lineTo(w - marginX + 40, y_pile_tip);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(`Ponta das Estacas: -${L_pile.toFixed(1)} m`, w - marginX + 30, y_pile_tip - 4);
}

// -------------------------------------------------------------
// VISTA 3: MAPA DE CALOR DE REAÇÕES & TENSÕES
// -------------------------------------------------------------
function drawHeatmapView(ctx, w, h) {
    const inputs = getFormInputs();
    const res = lastResult;

    const Lx = inputs.raft_length_x;
    const Ly = inputs.raft_length_y;

    const margin = 50;
    const scale = Math.min((w - 2 * margin) / Lx, (h - 2 * margin) / Ly);
    const offsetX = (w - Lx * scale) / 2.0;
    const offsetY = (h - Ly * scale) / 2.0;

    const toPxX = (x) => offsetX + x * scale;
    const toPxY = (y) => offsetY + (Ly - y) * scale;

    // Background
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, w, h);

    if (!res || !res.heatmap_grid) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Aguardando cálculo para renderizar o mapa contínuo...', w / 2, h / 2);
        return;
    }

    const grid = res.heatmap_grid;
    const field = document.getElementById('heatmap_field_select')?.value || 'settlement';
    let matrix, minVal, maxVal, fieldTitle, unit;

    if (field === 'soil_pressure') {
        matrix = grid.soil_pressures_kPa;
        minVal = grid.min_soil_pressure_kPa !== undefined ? grid.min_soil_pressure_kPa : 0.0;
        maxVal = grid.max_soil_pressure_kPa !== undefined ? grid.max_soil_pressure_kPa : 100.0;
        fieldTitle = 'Tensão de Contato no Solo σ';
        unit = 'kPa';
    } else if (field === 'pile_util') {
        matrix = grid.pile_util_pct;
        minVal = grid.min_pile_util_pct !== undefined ? grid.min_pile_util_pct : 0.0;
        maxVal = Math.max(100.0, grid.max_pile_util_pct !== undefined ? grid.max_pile_util_pct : 100.0);
        fieldTitle = 'Taxa de Utilização das Estacas (R_i / R_adm)';
        unit = '%';
    } else if (field === 'moment') {
        matrix = grid.moments_kNm_m;
        minVal = grid.min_moment_kNm_m !== undefined ? grid.min_moment_kNm_m : 0.0;
        maxVal = grid.max_moment_kNm_m !== undefined ? grid.max_moment_kNm_m : 500.0;
        fieldTitle = 'Momento Fletor de Projeto Radier M_d';
        unit = 'kN·m/m';
    } else {
        // default settlement
        matrix = grid.settlements_mm;
        minVal = grid.min_settlement_mm !== undefined ? grid.min_settlement_mm : 0.0;
        maxVal = grid.max_settlement_mm !== undefined ? grid.max_settlement_mm : 25.0;
        fieldTitle = 'Recalques Verticais do Radier w';
        unit = 'mm';
    }

    if (maxVal <= minVal) maxVal = minVal + 1.0;

    // 1. Continuous Cell Rendering
    const nx = grid.nx;
    const ny = grid.ny;
    const xs = grid.xs;
    const ys = grid.ys;

    if (matrix && matrix.length >= ny && matrix[0].length >= nx) {
        for (let j = 0; j < ny - 1; j++) {
            const y0 = ys[j];
            const y1 = ys[j + 1];
            const pyTop = toPxY(y1);
            const pyBottom = toPxY(y0);
            const cellH = pyBottom - pyTop;

            for (let i = 0; i < nx - 1; i++) {
                const x0 = xs[i];
                const x1 = xs[i + 1];
                const pxLeft = toPxX(x0);
                const pxRight = toPxX(x1);
                const cellW = pxRight - pxLeft;

                const val = 0.25 * (matrix[j][i] + matrix[j][i + 1] + matrix[j + 1][i] + matrix[j + 1][i + 1]);
                const norm = (val - minVal) / (maxVal - minVal);

                ctx.fillStyle = getTurboColor(norm);
                ctx.fillRect(pxLeft, pyTop, cellW + 0.6, cellH + 0.6);
            }
        }
    }

    // 2. Raft Border & Grid Lines
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(toPxX(0), toPxY(Ly), Lx * scale, Ly * scale);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (let x = 2; x < Lx; x += 2) {
        ctx.beginPath();
        ctx.moveTo(toPxX(x), toPxY(0));
        ctx.lineTo(toPxX(x), toPxY(Ly));
        ctx.stroke();
    }
    for (let y = 2; y < Ly; y += 2) {
        ctx.beginPath();
        ctx.moveTo(toPxX(0), toPxY(y));
        ctx.lineTo(toPxX(Lx), toPxY(y));
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // 3. Grid Coordinates / Ticks
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    for (let x = 0; x <= Lx; x += (Lx > 20 ? 4 : 2)) {
        ctx.fillText(`${x}m`, toPxX(x), toPxY(0) + 14);
    }
    ctx.textAlign = 'right';
    for (let y = 0; y <= Ly; y += (Ly > 20 ? 4 : 2)) {
        ctx.fillText(`${y}m`, toPxX(0) - 6, toPxY(y) + 3);
    }

    // 4. Overlays: Additional Distributed Loads (dashed box)
    if (additionalDistributedLoads.length > 0) {
        additionalDistributedLoads.forEach(dl => {
            const minX = Math.min(dl.x1, dl.x2);
            const maxX = Math.max(dl.x1, dl.x2);
            const minY = Math.min(dl.y1, dl.y2);
            const maxY = Math.max(dl.y1, dl.y2);
            if (maxX <= minX || maxY <= minY || dl.q <= 0) return;
            const rx1 = toPxX(minX);
            const rx2 = toPxX(maxX);
            const ry1 = toPxY(maxY);
            const ry2 = toPxY(minY);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(rx1, ry1, rx2 - rx1, ry2 - ry1);
            ctx.setLineDash([]);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${dl.name} (${dl.q}kPa)`, (rx1 + rx2) / 2, (ry1 + ry2) / 2 + 3);
        });
    }

    // 5. Overlays: Piles & Reactions
    if (res.piles_summary && res.piles_summary.piles_detail) {
        const piles = res.piles_summary.piles_detail;
        const R_adm = res.piles_summary.pile_capacity_adm_kN;
        const Dp = inputs.pile_diameter;
        const r_px = Math.max(8, (Dp / 2.0) * scale);

        piles.forEach(p => {
            const px = toPxX(p.x);
            const py = toPxY(p.y);
            const ratio = p.reaction_kN / R_adm;

            ctx.beginPath();
            ctx.arc(px, py, r_px, 0, Math.PI * 2);
            ctx.fillStyle = ratio > 1.0 ? '#ef4444' : (ratio > 0.8 ? '#f59e0b' : '#059669');
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            // Label reaction
            ctx.font = 'bold 8.5px JetBrains Mono, monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(`${p.reaction_tf}t`, px, py + 3);
        });
    }

    // 6. Overlays: SPMT Wheel Positions
    const spmtX = parseNum('spmt_pos_slider', 8.0);
    const nLines = inputs.spmt_num_lines;
    const lSpacing = inputs.spmt_line_spacing;
    const gauge = inputs.spmt_gauge;
    const cy = inputs.spmt_corridor_y;
    const startX = spmtX - (nLines - 1) * lSpacing / 2.0;

    if (nLines > 0) {
        for (let i = 0; i < nLines; i++) {
            const wx = startX + i * lSpacing;
            if (wx >= -0.5 && wx <= Lx + 0.5) {
                const px = toPxX(wx);
                const pyL = toPxY(cy - gauge / 2.0);
                const pyR = toPxY(cy + gauge / 2.0);

                [pyL, pyR].forEach(py => {
                    ctx.fillStyle = '#38bdf8';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1;
                    ctx.fillRect(px - 4, py - 3, 8, 6);
                    ctx.strokeRect(px - 4, py - 3, 8, 6);
                });
            }
        }
    }

    // 7. Overlays: Heavy Rigging Load
    if (inputs.heavy_rigging_load > 0) {
        const hx = toPxX(inputs.heavy_rigging_x);
        const hy = toPxY(inputs.heavy_rigging_y);
        ctx.fillStyle = '#dc2626';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(hx, hy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = 'bold 8.5px JetBrains Mono, monospace';
        ctx.fillStyle = '#fca5a5';
        ctx.textAlign = 'center';
        ctx.fillText('Turbina', hx, hy - 9);
    }

    // 8. Overlays: Additional Point Loads
    if (additionalPointLoads.length > 0) {
        additionalPointLoads.forEach(pt => {
            if (pt.P <= 0) return;
            const px = toPxX(pt.x);
            const py = toPxY(pt.y);
            ctx.fillStyle = '#ea580c';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.font = 'bold 8.5px JetBrains Mono, monospace';
            ctx.fillStyle = '#fed7aa';
            ctx.textAlign = 'center';
            ctx.fillText(`${pt.name}`, px, py - 8);
        });
    }

    // 9. Sleek Colorbar Legend
    const legW = 260;
    const legH = 12;
    const legX = (w - legW) / 2.0;
    const legY = h - 34;

    const legGrad = ctx.createLinearGradient(legX, 0, legX + legW, 0);
    const stops = 10;
    for (let s = 0; s <= stops; s++) {
        legGrad.addColorStop(s / stops, getTurboColor(s / stops));
    }
    ctx.fillStyle = legGrad;
    ctx.fillRect(legX, legY, legW, legH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(legX, legY, legW, legH);

    // Legend Title & Numbers
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.fillText(`${fieldTitle} (${unit})`, legX + legW / 2, legY - 5);

    ctx.font = '9.5px JetBrains Mono, monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.fillText(`${minVal.toFixed(1)}`, legX, legY + legH + 12);
    ctx.textAlign = 'center';
    ctx.fillText(`${((minVal + maxVal) / 2.0).toFixed(1)}`, legX + legW / 2, legY + legH + 12);
    ctx.textAlign = 'right';
    ctx.fillText(`${maxVal.toFixed(1)}`, legX + legW, legY + legH + 12);
}

function resetDefaults() {
    if (!confirm('Deseja realmente restaurar todos os parâmetros do Radier para os valores padrão de fábrica?')) {
        return;
    }
    localStorage.removeItem(PILED_RAFT_SESSION_KEY);
    localStorage.removeItem('aoki_springs_piled_raft');
    localStorage.removeItem('aoki_springs_piled_raft_pending');

    const banner = document.getElementById('aoki-import-banner');
    if (banner) banner.classList.add('hidden');

    additionalPointLoads = [];
    additionalDistributedLoads = [];
    renderPointLoadsTable();
    renderDistributedLoadsTable();

    document.getElementById('raft_length_x').value = 16.0;
    document.getElementById('raft_length_y').value = 12.0;
    document.getElementById('raft_thickness').value = 1.20;
    document.getElementById('fck').value = 35.0;
    if (document.getElementById('cover')) document.getElementById('cover').value = 50.0;
    if (document.getElementById('bar_diam')) document.getElementById('bar_diam').value = 20.0;
    document.getElementById('num_piles_x').value = 5;
    document.getElementById('num_piles_y').value = 4;
    document.getElementById('pile_diameter').value = 0.80;
    document.getElementById('pile_length').value = 18.0;
    document.getElementById('pile_capacity_adm').value = 1800.0;
    document.getElementById('pile_spring_kz').value = 180000.0;
    document.getElementById('h_soft_layer').value = 8.50;
    document.getElementById('subgrade_ks').value = 8000.0;
    document.getElementById('spmt_num_lines').value = 6;
    document.getElementById('spmt_line_load').value = 350.0;
    document.getElementById('spmt_gauge').value = 2.40;
    document.getElementById('heavy_rigging_load').value = 2500.0;
    document.getElementById('spmt_pos_slider').value = 8.0;
    triggerCalculation();
    savePiledRaftSession();
}
