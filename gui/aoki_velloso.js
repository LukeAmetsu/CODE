/**
 * Aoki-Velloso Foundation Calculator UI & Chart Controller
 */

let SOIL_TYPES_LIST = [
    "AREIA", "AREIA SILTOSA", "AREIA SILTOARGILOSA", "AREIA ARGILOSSILTOSA",
    "AREIA ARGILOSA", "SILTE ARENOSO", "SILTE ARENOARGILOSO", "SILTE ARGILOARENOSO",
    "SILTE ARGILOSO", "ARGILA ARENOSA", "ARGILA ARENOSSILTOSA", "ARGILA SILTOARENOSA",
    "ARGILA SILTOSA", "ARGILA", "ROCHA"
];

let PILE_FACTORS_MAP = {
    "PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO": { F1: 2.5, F2: 3.5 },
    "FRANKI DE FUSTE APILOADO": { F1: 2.3, F2: 3.0 },
    "FRANKI DE FUSTE VIBRADO": { F1: 2.3, F2: 3.2 },
    "METÁLICA": { F1: 1.75, F2: 3.5 },
    "PRÉ-MOLDADA DE CONCRETO CRAVADA POR PRENSAGEM": { F1: 1.2, F2: 2.3 },
    "ESCAVADA COM LAMA BENTONÍTICA": { F1: 3.5, F2: 4.5 },
    "RAIZ": { F1: 2.2, F2: 2.4 },
    "STRAUSS": { F1: 4.2, F2: 3.9 },
    "HÉLICE CONTÍNUA": { F1: 3.0, F2: 3.8 }
};

let currentProfile = [];
let chartNsptInstance = null;
let chartCapacityInstance = null;
let latestCalculatedSprings = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch metadata & default profile from backend if Eel is present
    if (typeof eel !== 'undefined' && eel.get_aoki_reference_data) {
        try {
            const refData = await eel.get_aoki_reference_data()();
            if (refData) {
                if (refData.soil_types) SOIL_TYPES_LIST = refData.soil_types;
                if (refData.pile_factors) PILE_FACTORS_MAP = refData.pile_factors;
                if (refData.default_profile) currentProfile = JSON.parse(JSON.stringify(refData.default_profile));
            }
        } catch (err) {
            console.warn("Could not load backend Aoki reference data, using built-in defaults.", err);
        }
    }

    if (!currentProfile || currentProfile.length === 0) {
        currentProfile = getBuiltinDefaultProfile();
    }

    // 2. Setup form listeners
    setupEventListeners();
    updatePileFactors();

    // 3. Render initial table & trigger calculation
    renderLayersTable();
    triggerCalculation();
});

function getBuiltinDefaultProfile() {
    return [
        { depth: 1, soil_type: "ARGILA SILTOARENOSA", nspt: 2.4 },
        { depth: 2, soil_type: "ARGILA SILTOARENOSA", nspt: 1.4 },
        { depth: 3, soil_type: "ARGILA SILTOARENOSA", nspt: 1.9 },
        { depth: 4, soil_type: "ARGILA SILTOARENOSA", nspt: 2.6 },
        { depth: 5, soil_type: "ARGILA SILTOARENOSA", nspt: 3.6 },
        { depth: 6, soil_type: "ARGILA SILTOARENOSA", nspt: 3.6 },
        { depth: 7, soil_type: "ARGILA SILTOARENOSA", nspt: 3.9 },
        { depth: 8, soil_type: "ARGILA SILTOARENOSA", nspt: 7.3 },
        { depth: 9, soil_type: "ARGILA SILTOARENOSA", nspt: 7.3 },
        { depth: 10, soil_type: "ARGILA SILTOARENOSA", nspt: 8.4 },
        { depth: 11, soil_type: "ARGILA SILTOARENOSA", nspt: 12.6 },
        { depth: 12, soil_type: "ARGILA SILTOARENOSA", nspt: 11.0 },
        { depth: 13, soil_type: "ARGILA SILTOARENOSA", nspt: 10.0 },
        { depth: 14, soil_type: "ARGILA SILTOARENOSA", nspt: 15.0 },
        { depth: 15, soil_type: "ARGILA SILTOARENOSA", nspt: 22.4 },
        { depth: 16, soil_type: "ARGILA SILTOARENOSA", nspt: 20.6 },
        { depth: 17, soil_type: "ROCHA", nspt: 60.0 }
    ];
}

function setupEventListeners() {
    const inputs = document.querySelectorAll('#diameter, #width_b, #height_h, #depth_pile, #allowable_settlement_mm, #soil_gamma, #num_piles, #structure_mass_ton');
    inputs.forEach(input => {
        input.addEventListener('input', () => triggerCalculation());
        input.addEventListener('change', () => triggerCalculation());
    });
}

function toggleGeometryInputs() {
    const geo = document.getElementById('geometry').value;
    const diamCont = document.getElementById('diam-container');
    const rectCont = document.getElementById('rect-container');
    if (geo === 'Circular') {
        diamCont.classList.remove('hidden');
        rectCont.classList.add('hidden');
    } else {
        diamCont.classList.add('hidden');
        rectCont.classList.remove('hidden');
    }
}

function updatePileFactors() {
    const pType = document.getElementById('pile_type').value;
    const f = PILE_FACTORS_MAP[pType] || { F1: 2.5, F2: 3.5 };
    document.getElementById('val-f1').innerText = f.F1.toFixed(2);
    document.getElementById('val-f2').innerText = f.F2.toFixed(2);
}

function parseNum(id, def = 0.0) {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
}

function getPayload() {
    return {
        geometry: document.getElementById('geometry').value,
        diameter: parseNum('diameter', 1.0),
        width_b: parseNum('width_b', 1.0),
        height_h: parseNum('height_h', 1.0),
        depth_pile: parseNum('depth_pile', 16.0),
        pile_type: document.getElementById('pile_type').value,
        allowable_settlement_mm: parseNum('allowable_settlement_mm', 5.0),
        soil_gamma: parseNum('soil_gamma', 1.8),
        num_piles: parseInt(parseNum('num_piles', 15)),
        structure_mass_ton: parseNum('structure_mass_ton', 1690.4),
        profile: currentProfile
    };
}

function triggerCalculation() {
    const payload = getPayload();

    if (typeof eel !== 'undefined' && eel.calculate_aoki_velloso) {
        eel.calculate_aoki_velloso(payload)(function (response) {
            if (response && response.success) {
                updateUIResults(response);
            } else {
                console.error("Aoki Calculation Error:", response?.error);
            }
        });
    }
}

function updateUIResults(res) {
    const cap = res.capacities || {};
    const stiff = res.stiffness_and_damping || {};
    const geo = res.geometry || {};

    // KPIs
    document.getElementById('kpi-radm-tf').innerText = `${cap.R_adm_tf.toFixed(1)} tf`;
    document.getElementById('kpi-radm-kn').innerText = `${cap.R_adm_kN.toFixed(1)} kN`;

    document.getElementById('kpi-radm-group-tf').innerText = `${cap.R_adm_group_tf.toFixed(0)} tf`;
    document.getElementById('kpi-group-info').innerText = `${payload_num_piles()} estacas (${cap.R_adm_group_kN.toFixed(0)} kN)`;

    document.getElementById('kpi-rl-tf').innerText = `${cap.R_shaft_tf.toFixed(1)} tf`;
    document.getElementById('kpi-rl-pct').innerText = `${cap.ratio_shaft_pct}% do total`;

    document.getElementById('kpi-rp-tf').innerText = `${cap.R_tip_tf.toFixed(1)} tf`;
    document.getElementById('kpi-rp-pct').innerText = `${cap.ratio_tip_pct}% do total`;

    document.getElementById('kpi-kz-tf-m').innerText = `${stiff.Kz_static_single_tf_m.toLocaleString()} tf/m`;
    document.getElementById('kpi-kz-kn-mm').innerText = `${stiff.Kz_static_single_kN_mm.toFixed(1)} kN/mm`;

    document.getElementById('kpi-dgz').innerText = `${stiff.Dgz_percent.toFixed(1)} %`;
    document.getElementById('kpi-dgxy').innerText = `Dgxy: ${stiff.Dgxy_percent.toFixed(1)} %`;

    // Executive summary
    document.getElementById('res-area').innerText = `${geo.area_m2.toFixed(3)} m²`;
    document.getElementById('res-perim').innerText = `${geo.perimeter_m.toFixed(3)} m`;
    document.getElementById('res-kz-dyn').innerText = `${stiff.Kz_dyn_group_tf_m.toLocaleString()} tf/m`;
    document.getElementById('res-kh-dyn').innerText = `${stiff.Kh_dyn_group_tf_m.toLocaleString()} tf/m`;
    document.getElementById('res-cgcz').innerText = `${stiff.Cgcz_tf_s_m.toLocaleString()} tf·s/m`;
    document.getElementById('res-cgcxy').innerText = `${stiff.Cgcxy_tf_s_m.toLocaleString()} tf·s/m`;

    // Update Structural Springs Cards (Radier e Viga Estaqueada)
    if (res.structural_springs) {
        latestCalculatedSprings = res.structural_springs;
        const raft = res.structural_springs.for_piled_raft || {};
        const beam = res.structural_springs.for_piled_beam || {};

        // Radier Estaqueado
        const raftKzEl = document.getElementById('spring-raft-kz');
        const raftKzSub = document.getElementById('spring-raft-kz-sub');
        const raftRadmEl = document.getElementById('spring-raft-radm');
        const raftRadmSub = document.getElementById('spring-raft-radm-sub');
        const raftQnegEl = document.getElementById('spring-raft-qneg');
        const raftKsEl = document.getElementById('spring-raft-ks');

        if (raftKzEl) raftKzEl.innerText = `${raft.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m`;
        if (raftKzSub) raftKzSub.innerText = `${raft.pile_spring_kz_tf_m.toLocaleString('pt-BR')} tf/m (${raft.pile_spring_kz_kN_mm.toFixed(1)} kN/mm)`;
        if (raftRadmEl) raftRadmEl.innerText = `${raft.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN`;
        if (raftRadmSub) raftRadmSub.innerText = `${raft.pile_capacity_adm_tf.toFixed(1)} tf/estaca`;
        if (raftQnegEl) raftQnegEl.innerText = `${raft.q_negative_friction_kN.toLocaleString('pt-BR')} kN`;
        if (raftKsEl) raftKsEl.innerText = `${raft.subgrade_ks_kN_m3.toLocaleString('pt-BR')} kN/m³`;

        // Viga Estaqueada
        const beamKzEl = document.getElementById('spring-beam-kz');
        const beamKzSub = document.getElementById('spring-beam-kz-sub');
        const beamKxEl = document.getElementById('spring-beam-kx');
        const beamKxSub = document.getElementById('spring-beam-kx-sub');
        const beamRadmEl = document.getElementById('spring-beam-radm');
        const beamTadmEl = document.getElementById('spring-beam-tadm');

        if (beamKzEl) beamKzEl.innerText = `${beam.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m`;
        if (beamKzSub) beamKzSub.innerText = `Apoio axial (D = ${beam.pile_diameter_m}m)`;
        if (beamKxEl) beamKxEl.innerText = `${beam.pile_spring_kx_fixed_kN_m.toLocaleString('pt-BR')} kN/m`;
        if (beamKxSub) beamKxSub.innerText = `Rotulada: ${beam.pile_spring_kx_pinned_kN_m.toLocaleString('pt-BR')} kN/m`;
        if (beamRadmEl) beamRadmEl.innerText = `${beam.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN`;
        if (beamTadmEl) beamTadmEl.innerText = `${beam.pile_tension_adm_kN.toLocaleString('pt-BR')} kN`;
    }

    // Update table calculated columns
    if (res.layers) {
        updateTableCalculatedValues(res.layers, geo.depth_pile_m);
    }

    // Update Charts
    updateCharts(res);
}

function exportSpringsToPiledRaft() {
    if (!latestCalculatedSprings || !latestCalculatedSprings.for_piled_raft) {
        alert("Calcule os resultados antes de exportar as molas.");
        return;
    }
    const data = latestCalculatedSprings.for_piled_raft;
    localStorage.setItem('aoki_springs_piled_raft', JSON.stringify(data));
    
    if (confirm(`✅ Molas calculadas com sucesso!\n\n• Mola Vertical (Kz) = ${data.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m (${data.pile_spring_kz_tf_m.toLocaleString('pt-BR')} tf/m)\n• Capacidade Adm. (Radm) = ${data.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN (${data.pile_capacity_adm_tf.toFixed(1)} tf)\n• Atrito Negativo (Qneg) = ${data.q_negative_friction_kN} kN\n• Reação do Radier (ks) = ${data.subgrade_ks_kN_m3} kN/m³\n\nDeseja abrir o Radier Estaqueado agora com esses parâmetros pré-carregados?`)) {
        window.location.href = 'piled_raft.html';
    }
}

function exportSpringsToPiledBeam() {
    if (!latestCalculatedSprings || !latestCalculatedSprings.for_piled_beam) {
        alert("Calcule os resultados antes de exportar as molas.");
        return;
    }
    const data = latestCalculatedSprings.for_piled_beam;
    localStorage.setItem('aoki_springs_piled_beam', JSON.stringify(data));
    
    if (confirm(`✅ Molas calculadas com sucesso!\n\n• Mola Vertical (Kz) = ${data.pile_spring_kz_kN_m.toLocaleString('pt-BR')} kN/m (${data.pile_spring_kz_tf_m.toLocaleString('pt-BR')} tf/m)\n• Mola Horizontal (Kx Engastada) = ${data.pile_spring_kx_fixed_kN_m.toLocaleString('pt-BR')} kN/m\n• Mola Horizontal (Kx Rotulada) = ${data.pile_spring_kx_pinned_kN_m.toLocaleString('pt-BR')} kN/m\n• Capacidade Compressão (Radm) = ${data.pile_capacity_adm_kN.toLocaleString('pt-BR')} kN\n• Capacidade Tração (Tadm) = ${data.pile_tension_adm_kN} kN\n\nDeseja abrir a Viga de Coroamento agora com esses parâmetros pré-carregados?`)) {
        window.location.href = 'piled_beam.html';
    }
}

function payload_num_piles() {
    return parseInt(parseNum('num_piles', 15));
}

function renderLayersTable() {
    const tbody = document.getElementById('layers-table-body');
    tbody.innerHTML = '';

    currentProfile.forEach((lay, idx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        tr.id = `layer-row-${idx}`;

        // Build Soil Select
        let optionsHtml = '';
        SOIL_TYPES_LIST.forEach(st => {
            const sel = (lay.soil_type.toUpperCase() === st.toUpperCase()) ? 'selected' : '';
            optionsHtml += `<option value="${st}" ${sel}>${st}</option>`;
        });

        tr.innerHTML = `
            <td class="py-2 px-3 font-semibold text-gray-700 dark:text-gray-200">
                <input type="number" step="0.5" min="0.5" value="${lay.depth}" onchange="onLayerChange(${idx}, 'depth', this.value)" class="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs">
            </td>
            <td class="py-2 px-3">
                <select onchange="onLayerChange(${idx}, 'soil_type', this.value)" class="w-48 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs">
                    ${optionsHtml}
                </select>
            </td>
            <td class="py-2 px-3">
                <input type="number" step="0.5" min="0.5" value="${lay.nspt}" onchange="onLayerChange(${idx}, 'nspt', this.value)" class="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
            </td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400" id="calc-rl-${idx}">--</td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400" id="calc-rp-${idx}">--</td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400" id="calc-kz-${idx}">--</td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400" id="calc-kh-${idx}">--</td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400" id="calc-g-${idx}">--</td>
            <td class="py-2 px-3 text-gray-600 dark:text-gray-400" id="calc-vs-${idx}">--</td>
            <td class="py-2 px-3 text-center">
                <button type="button" onclick="deleteSoilLayer(${idx})" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors" title="Excluir Camada">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateTableCalculatedValues(layers, pileDepth) {
    layers.forEach((lay, idx) => {
        const elRl = document.getElementById(`calc-rl-${idx}`);
        const elRp = document.getElementById(`calc-rp-${idx}`);
        const elKz = document.getElementById(`calc-kz-${idx}`);
        const elKh = document.getElementById(`calc-kh-${idx}`);
        const elG = document.getElementById(`calc-g-${idx}`);
        const elVs = document.getElementById(`calc-vs-${idx}`);

        if (elRl) elRl.innerText = lay.rl_kg_m2 ? lay.rl_kg_m2.toFixed(0) : '--';
        if (elRp) elRp.innerText = lay.rp_kg_m2 ? lay.rp_kg_m2.toFixed(0) : '--';
        if (elKz) elKz.innerText = lay.Kz_static_tf_m ? lay.Kz_static_tf_m.toLocaleString() : '--';
        if (elKh) elKh.innerText = lay.Kxy_min_tf_m ? lay.Kxy_min_tf_m.toFixed(0) : '--';
        if (elG) elG.innerText = lay.G_tf_m2 ? lay.G_tf_m2.toFixed(0) : '--';
        if (elVs) elVs.innerText = lay.Vs_m_s ? lay.Vs_m_s.toFixed(0) : '--';

        const row = document.getElementById(`layer-row-${idx}`);
        if (row) {
            if (lay.depth > pileDepth) {
                row.classList.add('opacity-40');
            } else {
                row.classList.remove('opacity-40');
            }
        }
    });
}

function onLayerChange(index, field, value) {
    if (field === 'depth' || field === 'nspt') {
        currentProfile[index][field] = parseFloat(value) || 0;
    } else {
        currentProfile[index][field] = value;
    }
    triggerCalculation();
}

function addSoilLayer() {
    const lastDepth = currentProfile.length > 0 ? currentProfile[currentProfile.length - 1].depth : 0;
    currentProfile.push({
        depth: lastDepth + 1.0,
        soil_type: "ARGILA SILTOARENOSA",
        nspt: 10.0
    });
    renderLayersTable();
    triggerCalculation();
}

function deleteSoilLayer(index) {
    if (currentProfile.length <= 1) {
        alert("O perfil deve conter pelo menos uma camada de solo.");
        return;
    }
    currentProfile.splice(index, 1);
    renderLayersTable();
    triggerCalculation();
}

function loadReferencePreset() {
    currentProfile = getBuiltinDefaultProfile();
    document.getElementById('geometry').value = 'Circular';
    document.getElementById('diameter').value = 1.0;
    document.getElementById('depth_pile').value = 16.0;
    document.getElementById('pile_type').value = 'PRÉ-MOLDADA DE CONCRETO CRAVA A PERCUSSÃO';
    document.getElementById('allowable_settlement_mm').value = 5.0;
    document.getElementById('soil_gamma').value = 1.8;
    document.getElementById('num_piles').value = 15;
    document.getElementById('structure_mass_ton').value = 1690.4;
    toggleGeometryInputs();
    updatePileFactors();
    renderLayersTable();
    triggerCalculation();
}

function updateCharts(res) {
    if (!res || !res.layers) return;
    const layers = res.layers;
    const pileDepth = res.geometry.depth_pile_m;

    const depths = layers.map(l => l.depth);
    const nspts = layers.map(l => l.nspt);

    // Compute cumulative capacity vs depth
    const area = res.geometry.area_m2;
    const perim = res.geometry.perimeter_m;
    let cumRl = 0;
    const cumCapacity = [];
    const cumShaft = [];

    layers.forEach((l, i) => {
        const dz = (i === 0) ? l.depth : (l.depth - layers[i - 1].depth);
        const dRl = (l.rl_kg_m2 * dz * perim) / 1000.0;
        cumRl += dRl;
        const currentRp = (l.rp_kg_m2 * area) / 1000.0;
        cumShaft.push(round2(cumRl));
        cumCapacity.push(round2(cumRl + currentRp));
    });

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    // Chart 1: N_SPT Profile
    const ctx1 = document.getElementById('chartNspt').getContext('2d');
    if (chartNsptInstance) chartNsptInstance.destroy();

    chartNsptInstance = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: depths,
            datasets: [{
                label: 'N_SPT (golpes)',
                data: nspts,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                borderWidth: 2.5,
                fill: true,
                tension: 0.2,
                pointRadius: 4,
                pointBackgroundColor: '#2563eb'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => `N_SPT: ${ctx.parsed.y} golpes (Prof: ${ctx.label} m)`
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Profundidade (m)', color: textColor, font: { size: 11 } },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    title: { display: true, text: 'N_SPT (golpes)', color: textColor, font: { size: 11 } },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    beginAtZero: true
                }
            }
        }
    });

    // Chart 2: Cumulative Resistance Curve
    const ctx2 = document.getElementById('chartCapacity').getContext('2d');
    if (chartCapacityInstance) chartCapacityInstance.destroy();

    chartCapacityInstance = new Chart(ctx2, {
        type: 'line',
        data: {
            labels: depths,
            datasets: [
                {
                    label: 'Carga Total R_adm (tf)',
                    data: cumCapacity,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.2,
                    pointRadius: 3
                },
                {
                    label: 'Atrito Lateral Acumulado R_l (tf)',
                    data: cumShaft,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.2,
                    pointRadius: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: textColor, font: { size: 11 } } }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Profundidade (m)', color: textColor, font: { size: 11 } },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    title: { display: true, text: 'Capacidade (tf)', color: textColor, font: { size: 11 } },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    beginAtZero: true
                }
            }
        }
    });
}

function round2(v) {
    return Math.round(v * 100) / 100;
}

function saveProjectJSON() {
    const payload = getPayload();
    const data = {
        app: "AokiVellosoCalculator",
        version: "1.0",
        timestamp: new Date().toISOString(),
        inputs: payload
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aoki_velloso_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function loadProjectJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.inputs) {
                const inp = data.inputs;
                if (inp.geometry) document.getElementById('geometry').value = inp.geometry;
                if (inp.diameter != null) document.getElementById('diameter').value = inp.diameter;
                if (inp.width_b != null) document.getElementById('width_b').value = inp.width_b;
                if (inp.height_h != null) document.getElementById('height_h').value = inp.height_h;
                if (inp.depth_pile != null) document.getElementById('depth_pile').value = inp.depth_pile;
                if (inp.pile_type) document.getElementById('pile_type').value = inp.pile_type;
                if (inp.allowable_settlement_mm != null) document.getElementById('allowable_settlement_mm').value = inp.allowable_settlement_mm;
                if (inp.soil_gamma != null) document.getElementById('soil_gamma').value = inp.soil_gamma;
                if (inp.num_piles != null) document.getElementById('num_piles').value = inp.num_piles;
                if (inp.structure_mass_ton != null) document.getElementById('structure_mass_ton').value = inp.structure_mass_ton;
                if (inp.profile) currentProfile = inp.profile;

                toggleGeometryInputs();
                updatePileFactors();
                renderLayersTable();
                triggerCalculation();
            }
        } catch (err) {
            alert("Erro ao ler arquivo JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

function exportTableCSV() {
    let csv = "Profundidade (m);Tipo de Solo;N_SPT\n";
    currentProfile.forEach(l => {
        csv += `${l.depth};${l.soil_type};${l.nspt}\n`;
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estratigrafia_aoki_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
