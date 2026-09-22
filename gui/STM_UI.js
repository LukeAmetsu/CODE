/**
 * 3D Strut and Tie Model (STM) Calculator & Optimization Engine
 * NBR 6118:2023 / ACI 318-19 - Metric Units (kN, cm)
 */

let babylonEngine = null;
let babylonScene = null;
let nodeCounter = 1;
let lastOptimizationResult = null;

const DEFAULT_PRESETS = {
    'pile-cap-3d-3piles': {
        geometry: { L: 220, H: 110, B: 220 },
        nodes: [
            { id: 1, x: 110, y: 0, z: 187, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 2, x: 43.3, y: 0, z: 71.5, fixedX: false, fixedY: true, fixedZ: false, fixed: false, fx: 0, fy: 0, fz: 0 },
            { id: 3, x: 176.7, y: 0, z: 71.5, fixedX: false, fixedY: true, fixedZ: true, fixed: false, fx: 0, fy: 0, fz: 0 },
            { id: 4, x: 110, y: 93.5, z: 110, fixedX: false, fixedY: false, fixedZ: false, fixed: false, fx: 0, fy: -600, fz: 0 }
        ],
        members: [
            { start: 1, end: 4, type: 'strut' },
            { start: 2, end: 4, type: 'strut' },
            { start: 3, end: 4, type: 'strut' },
            { start: 1, end: 2, type: 'tie' },
            { start: 2, end: 3, type: 'tie' },
            { start: 3, end: 1, type: 'tie' }
        ]
    },
    'pile-cap-3d-4piles': {
        geometry: { L: 200, H: 100, B: 200 },
        nodes: [
            { id: 1, x: 30, y: 0, z: 30, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 2, x: 170, y: 0, z: 30, fixedX: false, fixedY: true, fixedZ: true, fixed: false, fx: 0, fy: 0, fz: 0 },
            { id: 3, x: 170, y: 0, z: 170, fixedX: false, fixedY: true, fixedZ: false, fixed: false, fx: 0, fy: 0, fz: 0 },
            { id: 4, x: 30, y: 0, z: 170, fixedX: true, fixedY: true, fixedZ: false, fixed: false, fx: 0, fy: 0, fz: 0 },
            { id: 5, x: 100, y: 85, z: 100, fixedX: false, fixedY: false, fixedZ: false, fixed: false, fx: 0, fy: -800, fz: 0 }
        ],
        members: [
            { start: 1, end: 5, type: 'strut' },
            { start: 2, end: 5, type: 'strut' },
            { start: 3, end: 5, type: 'strut' },
            { start: 4, end: 5, type: 'strut' },
            { start: 1, end: 2, type: 'tie' },
            { start: 2, end: 3, type: 'tie' },
            { start: 3, end: 4, type: 'tie' },
            { start: 4, end: 1, type: 'tie' }
        ]
    },
    'corbel-3d': {
        geometry: { L: 90, H: 80, B: 40 },
        nodes: [
            { id: 1, x: 0, y: 0, z: 8, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 2, x: 0, y: 0, z: 32, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 3, x: 0, y: 68, z: 8, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 4, x: 0, y: 68, z: 32, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 5, x: 58.5, y: 68, z: 20, fixedX: false, fixedY: false, fixedZ: false, fixed: false, fx: 40, fy: -200, fz: 25 }
        ],
        members: [
            { start: 1, end: 5, type: 'strut' },
            { start: 2, end: 5, type: 'strut' },
            { start: 3, end: 5, type: 'tie' },
            { start: 4, end: 5, type: 'tie' }
        ]
    },
    'deep-beam': {
        geometry: { L: 200, H: 100, B: 20 },
        nodes: [
            { id: 1, x: 20, y: 0, z: 10, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 2, x: 180, y: 0, z: 10, fixedX: false, fixedY: true, fixedZ: true, fixed: false, fx: 0, fy: 0, fz: 0 },
            { id: 3, x: 100, y: 85, z: 10, fixedX: false, fixedY: false, fixedZ: false, fixed: false, fx: 0, fy: -250, fz: 0 }
        ],
        members: [
            { start: 1, end: 3, type: 'strut' },
            { start: 2, end: 3, type: 'strut' },
            { start: 1, end: 2, type: 'tie' }
        ]
    },
    'corbel': {
        geometry: { L: 80, H: 80, B: 25 },
        nodes: [
            { id: 1, x: 0, y: 0, z: 12.5, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 2, x: 50, y: 68, z: 12.5, fixedX: false, fixedY: false, fixedZ: false, fixed: false, fx: 0, fy: -180, fz: 0 },
            { id: 3, x: 0, y: 68, z: 12.5, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 }
        ],
        members: [
            { start: 2, end: 1, type: 'strut' },
            { start: 3, end: 2, type: 'tie' }
        ]
    },
    'pile-cap': {
        geometry: { L: 180, H: 90, B: 50 },
        nodes: [
            { id: 1, x: 30, y: 0, z: 25, fixedX: true, fixedY: true, fixedZ: true, fixed: true, fx: 0, fy: 0, fz: 0 },
            { id: 2, x: 150, y: 0, z: 25, fixedX: false, fixedY: true, fixedZ: true, fixed: false, fx: 0, fy: 0, fz: 0 },
            { id: 3, x: 90, y: 75, z: 25, fixedX: false, fixedY: false, fixedZ: false, fixed: false, fx: 0, fy: -400, fz: 0 }
        ],
        members: [
            { start: 1, end: 3, type: 'strut' },
            { start: 2, end: 3, type: 'strut' },
            { start: 1, end: 2, type: 'tie' }
        ]
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initial Preset (3D Pile Cap with 3 piles)
    loadPresetModel('pile-cap-3d-3piles');

    // 2. UI Event Listeners
    document.getElementById('add-node-btn')?.addEventListener('click', () => addNodeRow());
    document.getElementById('add-member-btn')?.addEventListener('click', () => addMemberRow());
    document.getElementById('run-stm-btn')?.addEventListener('click', handleCalculation);
    document.getElementById('generate-btn')?.addEventListener('click', handleGeneration);
    document.getElementById('template-select')?.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            loadPresetModel(e.target.value);
        }
    });

    ['geom-x', 'geom-y', 'geom-z'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', () => {
            update3D(gatherSTMInputs(), []);
        });
    });

    // Optimization Module Listeners
    const angleRange = document.getElementById('opt-min-angle-range');
    const angleVal = document.getElementById('opt-min-angle-val');
    if (angleRange && angleVal) {
        angleRange.addEventListener('input', (e) => {
            angleVal.textContent = `${e.target.value}°`;
        });
    }

    document.getElementById('optimize-btn')?.addEventListener('click', handleOptimization);
    document.getElementById('opt-apply-btn')?.addEventListener('click', applyOptimizedGeometry);

    // 3. Initialize Babylon Engine
    init3D();

    // 4. Initial calculation
    setTimeout(() => {
        handleCalculation();
    }, 250);
});

function loadPresetModel(presetKey) {
    const preset = DEFAULT_PRESETS[presetKey];
    if (!preset) return;

    if (preset.geometry) {
        if (document.getElementById('geom-x')) document.getElementById('geom-x').value = preset.geometry.L;
        if (document.getElementById('geom-y')) document.getElementById('geom-y').value = preset.geometry.H;
        if (document.getElementById('geom-z')) document.getElementById('geom-z').value = preset.geometry.B;
    }

    renderNodeTable(preset.nodes);
    renderMemberTable(preset.members);
    update3D(gatherSTMInputs(), []);
}

function renderNodeTable(nodes) {
    const tbody = document.querySelector('#nodes-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (nodes.length > 0) {
        const maxId = Math.max(...nodes.map(n => n.id));
        nodeCounter = maxId + 1;
    }

    nodes.forEach(node => {
        addNodeRow(node, tbody);
    });
}

function addNodeRow(node = null, tbody = null) {
    if (!tbody) tbody = document.querySelector('#nodes-table tbody');
    if (!tbody) return;

    const id = node ? node.id : nodeCounter++;
    const x = node ? node.x : 0;
    const y = node ? node.y : 0;
    const z = node ? (node.z ?? 0) : 0;

    const fixedX = node ? (node.fixedX !== undefined ? node.fixedX : !!node.fixed) : false;
    const fixedY = node ? (node.fixedY !== undefined ? node.fixedY : !!node.fixed) : false;
    const fixedZ = node ? (node.fixedZ !== undefined ? node.fixedZ : !!node.fixed) : false;

    const fx = node ? (node.fx ?? node.loadX ?? 0) : 0;
    const fy = node ? (node.fy ?? node.loadY ?? node.load ?? 0) : 0;
    const fz = node ? (node.fz ?? node.loadZ ?? 0) : 0;

    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.className = "hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors";
    tr.innerHTML = `
        <td class="p-2 font-bold text-gray-700 dark:text-gray-300">${id}</td>
        <td class="p-1"><input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-1 text-xs node-x" value="${x}" step="any"></td>
        <td class="p-1"><input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-1 text-xs node-y" value="${y}" step="any"></td>
        <td class="p-1"><input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-1 text-xs node-z" value="${z}" step="any"></td>
        <td class="p-1 text-center whitespace-nowrap">
            <div class="flex items-center justify-center gap-1">
                <label class="text-[10px] flex items-center font-mono cursor-pointer text-gray-600 dark:text-gray-300" title="Apoio Fixo X"><input type="checkbox" class="node-fixed-x rounded mr-0.5 text-blue-600" ${fixedX ? 'checked' : ''}>X</label>
                <label class="text-[10px] flex items-center font-mono cursor-pointer text-gray-600 dark:text-gray-300" title="Apoio Fixo Y"><input type="checkbox" class="node-fixed-y rounded mr-0.5 text-blue-600" ${fixedY ? 'checked' : ''}>Y</label>
                <label class="text-[10px] flex items-center font-mono cursor-pointer text-gray-600 dark:text-gray-300" title="Apoio Fixo Z"><input type="checkbox" class="node-fixed-z rounded mr-0.5 text-blue-600" ${fixedZ ? 'checked' : ''}>Z</label>
            </div>
        </td>
        <td class="p-1">
            <div class="grid grid-cols-3 gap-1">
                <input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-[11px] node-fx" value="${fx}" placeholder="Fx" title="Força Fx (kN)" step="any">
                <input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded px-1 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 node-fy" value="${fy}" placeholder="Fy" title="Força Fy (kN)" step="any">
                <input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 text-[11px] node-fz" value="${fz}" placeholder="Fz" title="Força Fz (kN)" step="any">
            </div>
        </td>
        <td class="p-1 text-center">
            <button type="button" class="text-rose-500 hover:text-rose-700 text-xs px-1 delete-node-btn" title="Excluir Nó">&times;</button>
        </td>
    `;

    tr.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            update3D(gatherSTMInputs(), []);
        });
    });

    tr.querySelector('.delete-node-btn')?.addEventListener('click', () => {
        tr.remove();
        update3D(gatherSTMInputs(), []);
    });

    tbody.appendChild(tr);
    if (!node) update3D(gatherSTMInputs(), []);
}

function renderMemberTable(members) {
    const tbody = document.querySelector('#members-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    members.forEach(member => {
        addMemberRow(member, tbody);
    });
}

function addMemberRow(member = null, tbody = null) {
    if (!tbody) tbody = document.querySelector('#members-table tbody');
    if (!tbody) return;

    const start = member ? member.start : '';
    const end = member ? member.end : '';
    const type = member ? member.type : 'strut';

    const tr = document.createElement('tr');
    tr.className = "hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors";
    tr.innerHTML = `
        <td class="p-1"><input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 text-xs member-start" value="${start}" placeholder="Nó 1"></td>
        <td class="p-1"><input type="number" class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-1 text-xs member-end" value="${end}" placeholder="Nó 2"></td>
        <td class="p-1">
            <select class="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-1 py-1 text-xs font-semibold member-type cursor-pointer">
                <option value="strut" ${type === 'strut' ? 'selected' : ''}>Biela (C)</option>
                <option value="tie" ${type === 'tie' ? 'selected' : ''}>Tirante (T)</option>
            </select>
        </td>
        <td class="p-1 text-right font-mono font-bold text-xs member-result">--</td>
        <td class="p-1 text-center">
            <button type="button" class="text-rose-500 hover:text-rose-700 text-xs px-1 delete-member-btn" title="Excluir Barra">&times;</button>
        </td>
    `;

    tr.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', () => {
            update3D(gatherSTMInputs(), []);
        });
    });

    tr.querySelector('.delete-member-btn')?.addEventListener('click', () => {
        tr.remove();
        update3D(gatherSTMInputs(), []);
    });

    tbody.appendChild(tr);
    if (!member) update3D(gatherSTMInputs(), []);
}

function gatherSTMInputs() {
    const L = parseFloat(document.getElementById('geom-x')?.value) || 200;
    const H = parseFloat(document.getElementById('geom-y')?.value) || 100;
    const B = parseFloat(document.getElementById('geom-z')?.value) || 20;

    const nodes = [];
    document.querySelectorAll('#nodes-table tbody tr').forEach(tr => {
        const fixedX = tr.querySelector('.node-fixed-x')?.checked || false;
        const fixedY = tr.querySelector('.node-fixed-y')?.checked || false;
        const fixedZ = tr.querySelector('.node-fixed-z')?.checked || false;
        const fx = parseFloat(tr.querySelector('.node-fx')?.value) || 0;
        const fy = parseFloat(tr.querySelector('.node-fy')?.value) || 0;
        const fz = parseFloat(tr.querySelector('.node-fz')?.value) || 0;

        nodes.push({
            id: parseInt(tr.dataset.id),
            x: parseFloat(tr.querySelector('.node-x')?.value) || 0,
            y: parseFloat(tr.querySelector('.node-y')?.value) || 0,
            z: parseFloat(tr.querySelector('.node-z')?.value) || 0,
            fixedX: fixedX,
            fixedY: fixedY,
            fixedZ: fixedZ,
            fixed: fixedX && fixedY && fixedZ,
            fx: fx,
            fy: fy,
            fz: fz,
            load: fy,
            loadX: fx,
            loadZ: fz
        });
    });

    const members = [];
    document.querySelectorAll('#members-table tbody tr').forEach(tr => {
        const start = parseInt(tr.querySelector('.member-start')?.value) || 0;
        const end = parseInt(tr.querySelector('.member-end')?.value) || 0;
        const type = tr.querySelector('.member-type')?.value || 'strut';
        if (start > 0 && end > 0) {
            members.push({ start, end, type });
        }
    });

    return {
        geometry: { L, H, B },
        nodes,
        members
    };
}

async function handleGeneration() {
    const template = document.getElementById('template-select')?.value || 'pile-cap-3d-3piles';
    if (template === 'custom') return;

    const inputs = gatherSTMInputs();

    try {
        if (window.eel && window.eel.generate_stm_template) {
            const result = await window.eel.generate_stm_template(template, inputs.geometry)();
            if (result && result.nodes && result.members) {
                renderNodeTable(result.nodes);
                renderMemberTable(result.members);
                update3D(gatherSTMInputs(), []);
                handleCalculation();
                return;
            }
        }
    } catch (e) {
        console.warn("Eel generation failed, falling back to local preset", e);
    }

    // Local fallback
    loadPresetModel(template);
    handleCalculation();
}

async function handleCalculation() {
    const data = gatherSTMInputs();

    if (data.nodes.length < 2 || data.members.length < 1) {
        return;
    }

    try {
        let result = null;
        if (window.eel && window.eel.solve_stm) {
            result = await window.eel.solve_stm(data)();
        } else if (window.eel && window.eel.solve_stm_truss) {
            result = await window.eel.solve_stm_truss(data)();
        }

        if (!result || result.error) {
            showStmBanner(false, result ? result.error : "Erro na análise da treliça");
            return;
        }

        // Update Member Results in Table
        const rows = document.querySelectorAll('#members-table tbody tr');
        result.results.forEach((res, idx) => {
            if (rows[idx]) {
                const cell = rows[idx].querySelector('.member-result');
                if (cell) {
                    const isComp = res.force < -0.05;
                    const isTens = res.force > 0.05;
                    cell.textContent = `${Math.abs(res.force).toFixed(1)} kN (${isComp ? 'C' : (isTens ? 'T' : '0')})`;
                    cell.className = `p-1 text-right font-mono font-bold text-xs member-result ${isComp ? 'text-rose-600 dark:text-rose-400' : (isTens ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400')}`;
                }
            }
        });

        // Update 3D Canvas with results
        update3D(data, result.results);

        // Update KPI Cards and Banner
        updateStmAnalytics(data, result);

        // Render detailed verification table
        renderStmReport(data, result);

    } catch (e) {
        console.error("Calculation failed", e);
        showStmBanner(false, "Falha na comunicação com o solver: " + e);
    }
}

function updateStmAnalytics(data, result) {
    const summary = result.summary || {};
    const maxComp = summary.max_compression_kN || 0;
    const maxTens = summary.max_tension_kN || 0;
    const minAngle = summary.min_angle_deg || 0;
    const isAnglePass = summary.angle_check_pass !== false;
    const totalEnergy = summary.total_strain_energy_kNcm || 0;
    const totalTieWeight = summary.total_tie_weight_kg || 0;

    document.getElementById('kpi-comp-val').textContent = `${maxComp.toFixed(1)} kN`;
    document.getElementById('kpi-tens-val').textContent = `${maxTens.toFixed(1)} kN`;
    document.getElementById('kpi-energy-val').textContent = `${totalEnergy.toFixed(1)}`;
    const steelSub = document.getElementById('kpi-steel-sub');
    if (steelSub) steelSub.textContent = `Aço tirantes: ${totalTieWeight.toFixed(1)} kg (${(summary.total_tie_volume_cm3 || 0).toFixed(0)} cm³) | ${data.nodes.length} nós`;

    const angleValEl = document.getElementById('kpi-angle-val');
    const angleBadgeEl = document.getElementById('kpi-angle-badge');
    if (minAngle > 0) {
        angleValEl.textContent = `${minAngle.toFixed(1)}°`;
        angleBadgeEl.textContent = isAnglePass ? `≥ 25° (OK)` : `< 25° (Alerta)`;
        angleBadgeEl.className = isAnglePass ? 'text-xs font-semibold text-emerald-600 dark:text-emerald-400' : 'text-xs font-semibold text-rose-600 dark:text-rose-400';
    } else {
        angleValEl.textContent = `--°`;
    }

    const hasWarnings = (result.warnings && result.warnings.length > 0);
    showStmBanner(!hasWarnings, hasWarnings ? result.warnings.join(' | ') : "Treliça em equilíbrio e ângulos normativos conformes (NBR 6118 / ACI 318).");
}

function showStmBanner(isSafe, message) {
    const banner = document.getElementById('status-banner');
    const icon = document.getElementById('status-icon');
    const title = document.getElementById('status-title');
    const subtitle = document.getElementById('status-subtitle');
    const badge = document.getElementById('status-badge');

    if (!banner) return;

    if (isSafe) {
        banner.className = "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-4 flex items-center justify-between shadow-sm";
        icon.textContent = "✅";
        title.className = "text-base font-bold text-emerald-800 dark:text-emerald-300";
        title.textContent = "TRELIÇA EM EQUILÍBRIO & CONFORME";
        subtitle.className = "text-xs text-emerald-700 dark:text-emerald-400";
        subtitle.textContent = message || "Todos os nós estão em equilíbrio estático e os ângulos entre bielas e tirantes respeitam o limite normativo (θ ≥ 25°).";
        badge.className = "inline-block bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider";
        badge.textContent = "Modelo Válido";
    } else {
        banner.className = "bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl p-4 flex items-center justify-between shadow-sm";
        icon.textContent = "⚠️";
        title.className = "text-base font-bold text-amber-800 dark:text-amber-300";
        title.textContent = "ATENÇÃO NORMATIVA / VINCULAÇÃO";
        subtitle.className = "text-xs text-amber-700 dark:text-amber-400";
        subtitle.textContent = message;
        badge.className = "inline-block bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider";
        badge.textContent = "Revisar";
    }
}

function renderStmReport(data, result) {
    const container = document.getElementById('stm-results-container');
    if (!container) return;

    const summary = result.summary || {};

    const rows = result.results.map(r => {
        const isComp = r.force < -0.05;
        const isTens = r.force > 0.05;
        const nature = isComp ? '<span class="text-rose-600 dark:text-rose-400 font-bold">Compressão (Biela)</span>'
                             : (isTens ? '<span class="text-blue-600 dark:text-blue-400 font-bold">Tração (Tirante)</span>' : '<span class="text-gray-400">Nula</span>');

        const areaText = isTens ? `<span class="font-bold text-blue-600">${r.as_req_cm2.toFixed(2)} cm²</span> <span class="text-[10px] text-gray-400">(Aço)</span>`
                               : (isComp ? `<span class="font-bold text-rose-600">${r.ac_req_cm2.toFixed(1)} cm²</span> <span class="text-[10px] text-gray-400">(Concreto)</span>` : '--');

        return `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors border-b border-gray-100 dark:border-gray-700 text-xs">
                <td class="p-2 font-bold">${r.id}</td>
                <td class="p-2 font-mono">Nó ${r.start_node} &rarr; Nó ${r.end_node}</td>
                <td class="p-2">${r.length.toFixed(1)} cm</td>
                <td class="p-2 uppercase font-semibold text-gray-500">${r.type}</td>
                <td class="p-2 font-mono font-bold ${isComp ? 'text-rose-600 dark:text-rose-400' : (isTens ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400')}">
                    ${Math.abs(r.force).toFixed(2)} kN
                </td>
                <td class="p-2">${nature}</td>
                <td class="p-2">${areaText}</td>
                <td class="p-2 font-mono text-gray-600 dark:text-gray-300">${(r.strain_energy_kNcm || 0).toFixed(2)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="border-b border-gray-100 dark:border-gray-700 pb-2 mb-3 flex items-center justify-between">
            <h2 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span>📋</span> Dimensionamento e Esforços Normais nas Barras (NBR 6118 / ACI 318)
            </h2>
            <span class="text-xs text-gray-500">Rigidez Direta 3D (FEM)</span>
        </div>

        <!-- Global Performance Bar -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 bg-gray-50 dark:bg-gray-750 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
            <div>
                <span class="text-gray-500 dark:text-gray-400 block text-[11px]">Trabalho de Deformação</span>
                <span class="font-bold text-purple-600 dark:text-purple-400">${(summary.total_strain_energy_kNcm || 0).toFixed(2)} kN·cm</span>
            </div>
            <div>
                <span class="text-gray-500 dark:text-gray-400 block text-[11px]">Consumo Aço Tirantes</span>
                <span class="font-bold text-blue-600 dark:text-blue-400">${(summary.total_tie_weight_kg || 0).toFixed(2)} kg (${(summary.total_tie_volume_cm3 || 0).toFixed(1)} cm³)</span>
            </div>
            <div>
                <span class="text-gray-500 dark:text-gray-400 block text-[11px]">Volume Bielas Concreto</span>
                <span class="font-bold text-rose-600 dark:text-rose-400">${((summary.total_strut_volume_cm3 || 0)/1000).toFixed(2)} dm³</span>
            </div>
            <div>
                <span class="text-gray-500 dark:text-gray-400 block text-[11px]">Critério Angular NBR</span>
                <span class="font-bold ${summary.angle_check_pass ? 'text-emerald-600' : 'text-rose-600'}">${(summary.min_angle_deg || 0).toFixed(1)}° (${summary.angle_check_pass ? 'Aprovado' : 'Reprovado'})</span>
            </div>
        </div>

        <div class="overflow-x-auto">
            <table class="w-full text-left">
                <thead class="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs">
                    <tr>
                        <th class="p-2">#</th>
                        <th class="p-2">Barra</th>
                        <th class="p-2">Compr.</th>
                        <th class="p-2">Tipo</th>
                        <th class="p-2">Esforço Sd</th>
                        <th class="p-2">Regime</th>
                        <th class="p-2">Área Requerida</th>
                        <th class="p-2">W (kN·cm)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
}

function update3D(inputs, results) {
    if (!babylonScene) return;

    // Dispose old meshes except ground/sky
    const meshesToDispose = babylonScene.meshes.filter(m => m.name !== "ground" && m.id !== "ground");
    meshesToDispose.forEach(m => m.dispose());

    new BABYLON.AxesViewer(babylonScene, 20);

    // 1. Concrete Prism (Bounding Box)
    if (inputs.geometry) {
        const { L, H, B } = inputs.geometry;
        if (L > 0 && H > 0 && B > 0) {
            const box = BABYLON.MeshBuilder.CreateBox("concretePrism", {
                width: L,
                height: H,
                depth: B
            }, babylonScene);

            box.position = new BABYLON.Vector3(L / 2, H / 2, B / 2);

            const mat = new BABYLON.StandardMaterial("matConcrete", babylonScene);
            mat.diffuseColor = new BABYLON.Color3(0.55, 0.65, 0.75);
            mat.alpha = 0.20;
            mat.backFaceCulling = false;
            box.material = mat;
            box.isPickable = false;

            box.enableEdgesRendering();
            box.edgesWidth = 2.0;
            box.edgesColor = new BABYLON.Color4(0.3, 0.45, 0.65, 0.6);
        }
    }

    // 2. Nodes, Supports and 3D Load Vectors
    const nodeMap = {};
    inputs.nodes.forEach(n => {
        const pos = new BABYLON.Vector3(n.x, n.y, n.z || 0);
        nodeMap[n.id] = pos;

        const isFixed = n.fixed || (n.fixedX && n.fixedY && n.fixedZ);
        const hasAnySupport = n.fixed || n.fixedX || n.fixedY || n.fixedZ;

        // Node Sphere
        const sphere = BABYLON.MeshBuilder.CreateSphere("node_" + n.id, { diameter: 4.5 }, babylonScene);
        sphere.position = pos;

        const mat = new BABYLON.StandardMaterial("matNode_" + n.id, babylonScene);
        mat.diffuseColor = hasAnySupport ? new BABYLON.Color3(0.15, 0.15, 0.2) : new BABYLON.Color3(0.85, 0.85, 0.9);
        sphere.material = mat;

        // Support Mesh
        if (hasAnySupport) {
            const support = BABYLON.MeshBuilder.CreateBox("support_" + n.id, { size: 6.5 }, babylonScene);
            support.position = pos.add(new BABYLON.Vector3(0, -4.5, 0));
            const supMat = new BABYLON.StandardMaterial("matSup_" + n.id, babylonScene);
            supMat.diffuseColor = new BABYLON.Color3(0.25, 0.28, 0.35);
            support.material = supMat;
        }

        // 3D Resultant Load Vector Arrow
        const fx = n.fx || n.loadX || 0;
        const fy = n.fy !== undefined ? n.fy : (n.loadY !== undefined ? n.loadY : (n.load || 0));
        const fz = n.fz || n.loadZ || 0;
        const mag = Math.sqrt(fx * fx + fy * fy + fz * fz);

        if (mag > 0.05) {
            const dir = new BABYLON.Vector3(fx / mag, fy / mag, fz / mag);
            const arrowLen = Math.min(32, Math.max(16, mag * 0.035));
            const arrowStart = pos.subtract(dir.scale(arrowLen));

            const arrowLine = BABYLON.MeshBuilder.CreateLines("arrow_" + n.id, {
                points: [arrowStart, pos]
            }, babylonScene);
            arrowLine.color = new BABYLON.Color3(0.85, 0.15, 0.95);

            // Arrow Head Cone pointing at the node
            const cone = BABYLON.MeshBuilder.CreateCylinder("arrowCone_" + n.id, {
                diameterTop: 0,
                diameterBottom: 4.0,
                height: 6.0
            }, babylonScene);
            cone.position = pos.subtract(dir.scale(3.0));
            
            // Align cone with load vector
            const axis = BABYLON.Vector3.Cross(new BABYLON.Vector3(0, 1, 0), dir);
            const dot = BABYLON.Vector3.Dot(new BABYLON.Vector3(0, 1, 0), dir);
            const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (axis.length() > 0.001) {
                cone.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis.normalize(), angle);
            } else if (dot < -0.999) {
                cone.rotationQuaternion = BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1, 0, 0), Math.PI);
            }

            const coneMat = new BABYLON.StandardMaterial("matCone_" + n.id, babylonScene);
            coneMat.diffuseColor = new BABYLON.Color3(0.85, 0.15, 0.95);
            cone.material = coneMat;
        }
    });

    // 3. Members (Struts & Ties as 3D Cylindrical Tubes)
    inputs.members.forEach((m, idx) => {
        const p1 = nodeMap[m.start];
        const p2 = nodeMap[m.end];
        if (!p1 || !p2) return;

        const res = results[idx];
        const force = res ? res.force : (m.type === 'tie' ? 100 : -100);

        // Color coding: Red for Strut (Compression), Blue for Tie (Tension)
        let memberColor;
        if (force < -0.05 || m.type === 'strut') {
            memberColor = new BABYLON.Color3(0.92, 0.18, 0.18); // Crimson Red
        } else if (force > 0.05 || m.type === 'tie') {
            memberColor = new BABYLON.Color3(0.18, 0.48, 0.96); // Electric Blue
        } else {
            memberColor = new BABYLON.Color3(0.55, 0.55, 0.55);
        }

        const radius = (m.type === 'strut') ? 2.8 : 1.8;

        const tube = BABYLON.MeshBuilder.CreateTube("member_" + idx, {
            path: [p1, p2],
            radius: radius,
            cap: BABYLON.Mesh.CAP_ALL
        }, babylonScene);

        const tubeMat = new BABYLON.StandardMaterial("matTube_" + idx, babylonScene);
        tubeMat.diffuseColor = memberColor;
        tubeMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        tube.material = tubeMat;
    });

    // Auto-focus camera on structure
    if (inputs.geometry) {
        const target = new BABYLON.Vector3(inputs.geometry.L / 2, inputs.geometry.H / 2, inputs.geometry.B / 2);
        const camera = babylonScene.activeCamera;
        if (camera) {
            camera.target = target;
            camera.radius = Math.max(inputs.geometry.L, inputs.geometry.H, inputs.geometry.B) * 1.65;
        }
    }
}

function init3D() {
    const canvas = document.getElementById('renderCanvas');
    if (!canvas) return;

    babylonEngine = new BABYLON.Engine(canvas, true);
    babylonScene = new BABYLON.Scene(babylonEngine);
    babylonScene.clearColor = new BABYLON.Color4(0.07, 0.09, 0.14, 1); // Dark blue-gray backdrop

    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 3, Math.PI / 2.8, 300, new BABYLON.Vector3(110, 55, 110), babylonScene);
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 18;
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 2000;

    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0.2, 1, 0.2), babylonScene);
    light.intensity = 0.9;

    const dirLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(0.6, -1, 0.6), babylonScene);
    dirLight.intensity = 0.45;

    babylonEngine.runRenderLoop(() => {
        babylonScene.render();
    });

    window.addEventListener("resize", () => {
        babylonEngine.resize();
    });
}

// -------------------------------------------------------------------------
// Optimization Module Handlers
// -------------------------------------------------------------------------

async function handleOptimization() {
    const data = gatherSTMInputs();
    const btn = document.getElementById('optimize-btn');
    const spinner = document.getElementById('optimize-spinner');
    const resultsBox = document.getElementById('opt-results-box');

    if (data.nodes.length < 3 || data.members.length < 2) {
        alert("Forneça um modelo completo de treliça para otimizar.");
        return;
    }

    const objective = document.getElementById('opt-objective')?.value || 'strain_energy';
    const minAngle = parseFloat(document.getElementById('opt-min-angle-range')?.value) || 25.0;
    const cover = parseFloat(document.getElementById('opt-cover')?.value) || 5.0;

    data.objective = objective;
    data.min_angle = minAngle;
    data.cover = cover;

    if (btn) btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');

    try {
        let result = null;
        if (window.eel && window.eel.optimize_stm) {
            result = await window.eel.optimize_stm(data)();
        }

        if (!result || result.error) {
            alert("Erro na otimização: " + (result ? result.error : "Sem resposta do solver"));
            return;
        }

        lastOptimizationResult = result;

        // Display results in UI
        const opt = result.optimized;
        const init = result.initial;

        document.getElementById('opt-energy-reduction').textContent = `-${opt.energy_reduction_pct.toFixed(1)}%`;
        document.getElementById('opt-energy-val').textContent = `${opt.strain_energy_kNcm.toFixed(1)} kN·cm (era ${init.strain_energy_kNcm.toFixed(1)})`;

        document.getElementById('opt-steel-reduction').textContent = `-${opt.tie_reduction_pct.toFixed(1)}%`;
        document.getElementById('opt-steel-val').textContent = `${opt.tie_weight_kg.toFixed(2)} kg (${opt.tie_volume_cm3.toFixed(1)} cm³) (era ${init.tie_weight_kg.toFixed(2)} kg)`;

        document.getElementById('opt-final-angle').textContent = `${opt.min_angle_deg.toFixed(1)}°`;
        const badge = document.getElementById('opt-angle-badge');
        if (badge) {
            badge.textContent = opt.angle_check_pass ? `≥ ${minAngle}° (OK)` : `< ${minAngle}° (Alerta)`;
            badge.className = opt.angle_check_pass ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-rose-600';
        }

        document.getElementById('opt-final-comp').textContent = `${opt.max_compression_kN.toFixed(1)} kN`;
        document.getElementById('opt-status-msg').textContent = result.message || "Otimização concluída com sucesso!";

        if (resultsBox) resultsBox.classList.remove('hidden');

        // Temporarily render optimized configuration in 3D canvas for preview
        update3D({ geometry: data.geometry, nodes: opt.nodes, members: data.members }, opt.results);

    } catch (e) {
        console.error("Optimization failed:", e);
        alert("Falha ao executar otimização: " + e);
    } finally {
        if (btn) btn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
    }
}

function applyOptimizedGeometry() {
    if (!lastOptimizationResult || !lastOptimizationResult.optimized || !lastOptimizationResult.optimized.nodes) {
        alert("Nenhum resultado de otimização disponível para aplicar.");
        return;
    }

    const optNodes = lastOptimizationResult.optimized.nodes;
    renderNodeTable(optNodes);
    handleCalculation();

    const feedback = document.getElementById('feedback-message');
    if (feedback) {
        feedback.innerHTML = `<span class="text-emerald-600 font-bold">✨ Geometria otimizada aplicada com sucesso à treliça!</span>`;
        setTimeout(() => { feedback.innerHTML = ''; }, 4000);
    }
}

// -------------------------------------------------------------------------
// File Save / Load Handlers
// -------------------------------------------------------------------------

function saveProjectJSON() {
    const data = {
        app: "STM_Strut_and_Tie_NBR6118",
        version: "3.0",
        timestamp: new Date().toISOString(),
        stmData: gatherSTMInputs()
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stm_modelo_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadProjectJSON(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const parsed = JSON.parse(e.target.result);
            const stm = parsed.stmData || parsed;

            if (stm.geometry) {
                if (document.getElementById('geom-x')) document.getElementById('geom-x').value = stm.geometry.L;
                if (document.getElementById('geom-y')) document.getElementById('geom-y').value = stm.geometry.H;
                if (document.getElementById('geom-z')) document.getElementById('geom-z').value = stm.geometry.B;
            }

            if (stm.nodes && Array.isArray(stm.nodes)) renderNodeTable(stm.nodes);
            if (stm.members && Array.isArray(stm.members)) renderMemberTable(stm.members);

            update3D(gatherSTMInputs(), []);
            handleCalculation();
        } catch (err) {
            console.error('Error loading STM JSON:', err);
            alert('Falha ao carregar arquivo JSON do STM.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

window.saveProjectJSON = saveProjectJSON;
window.loadProjectJSON = loadProjectJSON;