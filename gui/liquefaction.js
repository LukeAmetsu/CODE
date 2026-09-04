/**
 * Soil Liquefaction Triggering Analysis UI & Chart Controller
 */

let activeMode = 'profile'; // 'profile' or 'layers'

let defaultBoreholeLayers = [
    { depth: 1.0, water_depth: 3.5, gamma: 19.0, n1_60: 33.0, fc_pct: 10.0, a_max: 0.55, mw: 7.5 },
    { depth: 2.0, water_depth: 3.5, gamma: 19.0, n1_60: 12.0, fc_pct: 15.0, a_max: 0.55, mw: 7.5 },
    { depth: 3.0, water_depth: 3.5, gamma: 19.0, n1_60: 25.0, fc_pct: 5.0, a_max: 0.55, mw: 7.5 },
    { depth: 4.0, water_depth: 3.5, gamma: 19.0, n1_60: 8.0, fc_pct: 30.0, a_max: 0.55, mw: 7.5 },
    { depth: 5.0, water_depth: 3.5, gamma: 19.0, n1_60: 33.0, fc_pct: 10.0, a_max: 0.55, mw: 8.0 },
    { depth: 6.0, water_depth: 3.5, gamma: 19.0, n1_60: 28.0, fc_pct: 10.0, a_max: 0.55, mw: 7.5 },
    { depth: 7.0, water_depth: 3.5, gamma: 19.0, n1_60: 22.0, fc_pct: 12.0, a_max: 0.55, mw: 7.5 },
    { depth: 8.0, water_depth: 3.5, gamma: 19.0, n1_60: 18.0, fc_pct: 15.0, a_max: 0.55, mw: 7.5 },
    { depth: 9.0, water_depth: 3.5, gamma: 19.0, n1_60: 14.0, fc_pct: 18.0, a_max: 0.55, mw: 7.5 },
    { depth: 10.0, water_depth: 3.5, gamma: 19.0, n1_60: 26.0, fc_pct: 10.0, a_max: 0.55, mw: 7.5 },
    { depth: 12.0, water_depth: 3.5, gamma: 19.0, n1_60: 30.0, fc_pct: 8.0, a_max: 0.55, mw: 7.5 },
    { depth: 14.0, water_depth: 3.5, gamma: 19.0, n1_60: 32.0, fc_pct: 10.0, a_max: 0.55, mw: 7.5 },
    { depth: 16.0, water_depth: 3.5, gamma: 19.0, n1_60: 35.0, fc_pct: 5.0, a_max: 0.55, mw: 7.5 },
];

let currentBoreholeLayers = [];
let currentProfileData = [];
let chartFsInstance = null;
let chartCsrCrrInstance = null;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Fetch presets from backend if available
    if (typeof eel !== 'undefined' && eel.get_liquefaction_reference_data) {
        try {
            const ref = await eel.get_liquefaction_reference_data()();
            if (ref && ref.borehole_layers_defaults) {
                defaultBoreholeLayers = ref.borehole_layers_defaults;
            }
        } catch (err) {
            console.warn("Could not load backend liquefaction presets, using local defaults.", err);
        }
    }

    currentBoreholeLayers = JSON.parse(JSON.stringify(defaultBoreholeLayers));

    // 2. Setup listeners for inputs
    setupProfileListeners();
    setupLayerGlobalListeners();

    // 3. Initial execution
    renderBoreholeLayersTable();
    triggerProfileCalculation();
});

function switchMode(mode) {
    activeMode = mode;
    const btnProf = document.getElementById('tab-btn-profile');
    const btnLay = document.getElementById('tab-btn-layers');
    const viewProf = document.getElementById('view-profile');
    const viewLay = document.getElementById('view-layers');

    if (mode === 'profile') {
        btnProf.className = "px-5 py-2.5 text-sm font-bold rounded-lg transition-all bg-blue-600 text-white shadow-sm flex items-center gap-2";
        btnLay.className = "px-5 py-2.5 text-sm font-medium rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2";
        viewProf.classList.remove('hidden');
        viewLay.classList.add('hidden');
        triggerProfileCalculation();
    } else {
        btnLay.className = "px-5 py-2.5 text-sm font-bold rounded-lg transition-all bg-amber-600 text-white shadow-sm flex items-center gap-2";
        btnProf.className = "px-5 py-2.5 text-sm font-medium rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2";
        viewLay.classList.remove('hidden');
        viewProf.classList.add('hidden');
        triggerLayersCalculation();
    }
}

function parseNum(id, def = 0.0) {
    const el = document.getElementById(id);
    if (!el) return def;
    const v = parseFloat(el.value);
    return isNaN(v) ? def : v;
}

function setupProfileListeners() {
    const ids = ['prof_na', 'prof_gamma', 'prof_fc', 'prof_n1_min', 'prof_n1_med', 'prof_n1_max',
                 'prof_a0_min', 'prof_a0_max', 'prof_mw_min', 'prof_mw_med', 'prof_mw_max',
                 'prof_max_depth', 'prof_depth_step'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => triggerProfileCalculation());
            el.addEventListener('change', () => triggerProfileCalculation());
        }
    });
}

function setupLayerGlobalListeners() {
    const ids = ['layer_def_amax', 'layer_def_mw', 'layer_def_na', 'layer_def_gamma', 'layer_formulation'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => triggerLayersCalculation());
            el.addEventListener('change', () => triggerLayersCalculation());
        }
    });
}

// ----------------------------------------------------
// MODE 1: PARAMETRIC PROFILE LOGIC
// ----------------------------------------------------

function getProfilePayload() {
    return {
        water_depth: parseNum('prof_na', 3.5),
        soil_gamma: parseNum('prof_gamma', 19.0),
        fines_content_fc: parseNum('prof_fc', 10.0),
        n1_60_min: parseNum('prof_n1_min', 27.0),
        n1_60_med: parseNum('prof_n1_med', 33.0),
        n1_60_max: parseNum('prof_n1_max', 58.0),
        a0_min: parseNum('prof_a0_min', 0.55),
        a0_max: parseNum('prof_a0_max', 0.70),
        mw_min: parseNum('prof_mw_min', 6.0),
        mw_med: parseNum('prof_mw_med', 7.5),
        mw_max: parseNum('prof_mw_max', 8.5),
        max_depth: parseNum('prof_max_depth', 20.0),
        depth_step: parseNum('prof_depth_step', 0.5)
    };
}

function triggerProfileCalculation() {
    const payload = getProfilePayload();
    if (typeof eel !== 'undefined' && eel.calculate_liquefaction_profile) {
        eel.calculate_liquefaction_profile(payload)(function (response) {
            if (response && response.success) {
                currentProfileData = response.profile;
                updateProfileUI(response);
            } else {
                console.error("Profile calculation error:", response?.error);
            }
        });
    }
}

function updateProfileUI(res) {
    const scen = res.summary_scenarios;

    // Minimum FS overall
    const fsMinOverall = Math.min(
        scen.a0_min.scenario_min.fs_min,
        scen.a0_min.scenario_med.fs_min,
        scen.a0_min.scenario_max.fs_min,
        scen.a0_max.scenario_min.fs_min,
        scen.a0_max.scenario_med.fs_min,
        scen.a0_max.scenario_max.fs_min
    );

    updateStatusBanner(fsMinOverall, 9.0);

    // Update Scenario Pills
    const setScen = (id, obj) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.innerText = `FS ${obj.fs_min.toFixed(3)} @ ${obj.depth_crit_m}m`;
        el.className = (obj.fs_min < 1.0) ? "text-red-600 font-black" : ((obj.fs_min < 1.2) ? "text-amber-600 font-bold" : "text-emerald-600 font-semibold");
    };

    setScen('scen-a0min-min', scen.a0_min.scenario_min);
    setScen('scen-a0min-med', scen.a0_min.scenario_med);
    setScen('scen-a0min-max', scen.a0_min.scenario_max);

    setScen('scen-a0max-min', scen.a0_max.scenario_min);
    setScen('scen-a0max-med', scen.a0_max.scenario_med);
    setScen('scen-a0max-max', scen.a0_max.scenario_max);

    // Update Table
    const tbody = document.getElementById('profile-table-body');
    tbody.innerHTML = '';
    res.profile.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        if (row.fs_a0max_min < 1.0) {
            tr.className += " bg-red-50/40 dark:bg-red-950/20";
        }
        tr.innerHTML = `
            <td class="py-2 px-3 font-bold text-gray-800 dark:text-gray-200">${row.depth.toFixed(1)}</td>
            <td class="py-2 px-3">${row.sigma_v.toFixed(1)}</td>
            <td class="py-2 px-3">${row.u.toFixed(1)}</td>
            <td class="py-2 px-3 font-semibold">${row.sigma_v_eff.toFixed(1)}</td>
            <td class="py-2 px-3 text-gray-500">${row.rd.toFixed(4)}</td>
            <td class="py-2 px-3">${row.csr_a0_min.toFixed(4)}</td>
            <td class="py-2 px-3 font-medium">${row.csr_a0_max.toFixed(4)}</td>
            <td class="py-2 px-3 ${formatFsColor(row.fs_a0min_min)}">${row.fs_a0min_min.toFixed(3)}</td>
            <td class="py-2 px-3 ${formatFsColor(row.fs_a0min_med)}">${row.fs_a0min_med.toFixed(3)}</td>
            <td class="py-2 px-3 font-bold ${formatFsColor(row.fs_a0max_min)}">${row.fs_a0max_min.toFixed(3)}</td>
            <td class="py-2 px-3 ${formatFsColor(row.fs_a0max_med)}">${row.fs_a0max_med.toFixed(3)}</td>
        `;
        tbody.appendChild(tr);
    });

    // Update Chart
    renderChartFsProfile(res.profile);
}

function formatFsColor(fs) {
    if (fs < 1.0) return "text-red-600 dark:text-red-400 font-black";
    if (fs < 1.2) return "text-amber-600 dark:text-amber-400 font-bold";
    return "text-emerald-600 dark:text-emerald-400";
}

function renderChartFsProfile(rows) {
    const depths = rows.map(r => r.depth);
    const fsCrit = rows.map(r => r.fs_a0max_min);
    const fsMed = rows.map(r => r.fs_a0max_med);
    const fsMinMin = rows.map(r => r.fs_a0min_min);

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const ctx = document.getElementById('chartFsProfile').getContext('2d');
    if (chartFsInstance) chartFsInstance.destroy();

    chartFsInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: depths,
            datasets: [
                {
                    label: 'FS Crítico (a0=máx, N1=mín)',
                    data: fsCrit,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    borderWidth: 2.5,
                    tension: 0.2,
                    pointRadius: 2
                },
                {
                    label: 'FS Moderado (a0=máx, N1=méd)',
                    data: fsMed,
                    borderColor: '#f59e0b',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 2
                },
                {
                    label: 'FS Base (a0=mín, N1=mín)',
                    data: fsMinMin,
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    tension: 0.2,
                    pointRadius: 2
                },
                {
                    label: 'Limiar FS = 1.0 (Liquefação)',
                    data: depths.map(() => 1.0),
                    borderColor: '#dc2626',
                    borderWidth: 2,
                    borderDash: [6, 6],
                    pointRadius: 0
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
                    title: { display: true, text: 'Profundidade (m)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    title: { display: true, text: 'Fator de Segurança (FS)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    min: 0,
                    max: 4.0
                }
            }
        }
    });
}

// ----------------------------------------------------
// MODE 2: BOREHOLE SPT LAYERS LOGIC
// ----------------------------------------------------

function getLayersPayload() {
    const formEl = document.getElementById('layer_formulation');
    return {
        default_a_max: parseNum('layer_def_amax', 0.55),
        default_mw: parseNum('layer_def_mw', 7.5),
        default_water_depth: parseNum('layer_def_na', 3.5),
        default_soil_gamma: parseNum('layer_def_gamma', 19.0),
        formulation: formEl ? formEl.value : 'nceer',
        layers: currentBoreholeLayers
    };
}

function triggerLayersCalculation() {
    const payload = getLayersPayload();
    if (typeof eel !== 'undefined' && eel.calculate_liquefaction_layers) {
        eel.calculate_liquefaction_layers(payload)(function (response) {
            if (response && response.success) {
                updateLayersUI(response);
            } else {
                console.error("Layers calculation error:", response?.error);
            }
        });
    }
}

function updateLayersUI(res) {
    const summ = res.summary;
    updateStatusBanner(summ.min_fs, summ.crit_depth_m);

    document.getElementById('stat-num-liq').innerText = summ.num_liquefiable_layers;
    document.getElementById('stat-thick-liq').innerText = `${summ.estimated_liquefiable_thickness_m} m`;
    document.getElementById('stat-overall').innerText = summ.overall_status;
    document.getElementById('stat-overall').className = (summ.num_liquefiable_layers > 0) ? "text-red-600 font-bold" : "text-emerald-600 font-bold";

    // Update table
    res.layers.forEach((lay, idx) => {
        const elEff = document.getElementById(`lay-eff-${idx}`);
        const elN1cs = document.getElementById(`lay-n1cs-${idx}`);
        const elCsr = document.getElementById(`lay-csr-${idx}`);
        const elCrr = document.getElementById(`lay-crr-${idx}`);
        const elFsNceer = document.getElementById(`lay-fs-nceer-${idx}`);
        const elFsRef = document.getElementById(`lay-fs-ref-${idx}`);
        const elStatus = document.getElementById(`lay-status-${idx}`);

        if (elEff) elEff.innerText = lay.sigma_v_eff.toFixed(1);
        if (elN1cs) elN1cs.innerText = lay.n1_60_cs.toFixed(1);
        if (elCsr) elCsr.innerText = lay.csr.toFixed(3);
        if (elCrr) elCrr.innerText = lay.crr_7_5.toFixed(3);
        if (elFsNceer) {
            const val = (lay.fs_nceer_standard != null ? lay.fs_nceer_standard : lay.fs);
            elFsNceer.innerText = val.toFixed(3);
            elFsNceer.className = `py-2 px-3 font-bold ${formatFsColor(val)}`;
        }
        if (elFsRef) {
            const val = (lay.fs_spreadsheet != null ? lay.fs_spreadsheet : lay.fs);
            elFsRef.innerText = val.toFixed(3);
            elFsRef.className = `py-2 px-3 font-medium text-gray-500 dark:text-gray-400 ${formatFsColor(val)}`;
        }
        if (elStatus) {
            elStatus.innerText = lay.status;
            elStatus.className = `py-2 px-3 text-center font-bold text-xs ${formatBadgeClass(lay.risk_level)}`;
        }
    });

    renderChartCsrCrr(res.layers);
}

function formatBadgeClass(risk) {
    if (risk === 'critical') return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded px-2 py-0.5";
    if (risk === 'warning') return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-0.5";
    return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded px-2 py-0.5";
}

function renderBoreholeLayersTable() {
    const tbody = document.getElementById('layers-table-body');
    tbody.innerHTML = '';

    currentBoreholeLayers.forEach((lay, idx) => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors";
        tr.id = `layer-row-${idx}`;

        tr.innerHTML = `
            <td class="py-2 px-3 font-semibold">
                <input type="number" step="0.5" min="0.5" value="${lay.depth}" onchange="onBoreholeChange(${idx}, 'depth', this.value)" class="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs font-bold">
            </td>
            <td class="py-2 px-3">
                <input type="number" step="1" min="1" value="${lay.n1_60}" onchange="onBoreholeChange(${idx}, 'n1_60', this.value)" class="w-16 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs font-bold text-blue-600 dark:text-blue-400">
            </td>
            <td class="py-2 px-3">
                <input type="number" step="1" min="0" max="100" value="${lay.fc_pct}" onchange="onBoreholeChange(${idx}, 'fc_pct', this.value)" class="w-14 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-1 text-xs">
            </td>
            <td class="py-2 px-3" id="lay-eff-${idx}">--</td>
            <td class="py-2 px-3 font-semibold" id="lay-n1cs-${idx}">--</td>
            <td class="py-2 px-3" id="lay-csr-${idx}">--</td>
            <td class="py-2 px-3" id="lay-crr-${idx}">--</td>
            <td class="py-2 px-3 font-bold" id="lay-fs-nceer-${idx}">--</td>
            <td class="py-2 px-3 font-medium text-gray-500" id="lay-fs-ref-${idx}">--</td>
            <td class="py-2 px-3 text-center" id="lay-status-${idx}">--</td>
            <td class="py-2 px-3 text-center">
                <button type="button" onclick="deleteBoreholeLayer(${idx})" class="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors" title="Excluir Cota">
                    🗑️
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function onBoreholeChange(index, field, val) {
    currentBoreholeLayers[index][field] = parseFloat(val) || 0;
    triggerLayersCalculation();
}

function addBoreholeLayer() {
    const lastDepth = currentBoreholeLayers.length > 0 ? currentBoreholeLayers[currentBoreholeLayers.length - 1].depth : 0;
    currentBoreholeLayers.push({
        depth: lastDepth + 1.0,
        water_depth: parseNum('layer_def_na', 3.5),
        gamma: parseNum('layer_def_gamma', 19.0),
        n1_60: 20.0,
        fc_pct: 10.0,
        a_max: parseNum('layer_def_amax', 0.55),
        mw: parseNum('layer_def_mw', 7.5)
    });
    renderBoreholeLayersTable();
    triggerLayersCalculation();
}

function deleteBoreholeLayer(index) {
    if (currentBoreholeLayers.length <= 1) {
        alert("A sondagem deve conter pelo menos uma cota de ensaio.");
        return;
    }
    currentBoreholeLayers.splice(index, 1);
    renderBoreholeLayersTable();
    triggerLayersCalculation();
}

function renderChartCsrCrr(layers) {
    const depths = layers.map(l => l.depth);
    const csrs = layers.map(l => l.csr);
    const crrs = layers.map(l => l.crr_7_5);

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const ctx = document.getElementById('chartCsrCrr').getContext('2d');
    if (chartCsrCrrInstance) chartCsrCrrInstance.destroy();

    chartCsrCrrInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: depths,
            datasets: [
                {
                    label: 'CSR (Demanda Sísmica)',
                    data: csrs,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    borderWidth: 2.5,
                    tension: 0.2,
                    pointRadius: 4
                },
                {
                    label: 'CRR_7.5 (Resistência do Solo)',
                    data: crrs,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    borderWidth: 2.5,
                    tension: 0.2,
                    pointRadius: 4
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
                    title: { display: true, text: 'Profundidade (m)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor }
                },
                y: {
                    title: { display: true, text: 'Razão de Tensões Cíclicas (CSR / CRR)', color: textColor },
                    ticks: { color: textColor },
                    grid: { color: gridColor },
                    beginAtZero: true
                }
            }
        }
    });
}

function updateStatusBanner(minFs, critDepth) {
    const banner = document.getElementById('status-banner');
    const icon = document.getElementById('banner-icon');
    const title = document.getElementById('banner-title');
    const desc = document.getElementById('banner-desc');
    const elMinFs = document.getElementById('banner-min-fs');
    const elCritDepth = document.getElementById('banner-crit-depth');

    elMinFs.innerText = minFs != null ? minFs.toFixed(3) : '--';
    elCritDepth.innerText = critDepth != null ? `${critDepth.toFixed(1)} m` : '--';

    if (minFs == null) return;

    if (minFs < 1.0) {
        banner.className = "mb-8 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-red-50 border-red-400 text-red-900 dark:bg-red-950/50 dark:border-red-700 dark:text-red-200 animate-pulse";
        icon.innerText = "🚨";
        title.innerText = "ALERTA CRÍTICO: RISCO IMINENTE DE LIQUEFAÇÃO DETECTADO";
        desc.innerText = "Fator de segurança inferior a 1.0 na profundidade crítica indicada. Recomenda-se tratamento de solo, drenagem ou fundação profunda.";
    } else if (minFs < 1.2) {
        banner.className = "mb-8 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-amber-50 border-amber-400 text-amber-900 dark:bg-amber-950/50 dark:border-amber-700 dark:text-amber-200";
        icon.innerText = "⚠️";
        title.innerText = "ZONA DE ATENÇÃO: MARGEM DE SEGURANÇA REDUZIDA (FS < 1.2)";
        desc.innerText = "Solo com vulnerabilidade potencial para terremotos de maior magnitude ou aceleração de pico superior.";
    } else {
        banner.className = "mb-8 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200";
        icon.innerText = "🛡️";
        title.innerText = "SOLO ESTÁVEL / SEGURO CONTRA LIQUEFAÇÃO";
        desc.innerText = "O fator de segurança mínimo calculado em todas as profundidades é superior ao limiar de projeto (FS ≥ 1.2).";
    }
}

function loadReferencePreset() {
    if (activeMode === 'profile') {
        document.getElementById('prof_na').value = 3.5;
        document.getElementById('prof_gamma').value = 19.0;
        document.getElementById('prof_fc').value = 10.0;
        document.getElementById('prof_n1_min').value = 27;
        document.getElementById('prof_n1_med').value = 33;
        document.getElementById('prof_n1_max').value = 58;
        document.getElementById('prof_a0_min').value = 0.55;
        document.getElementById('prof_a0_max').value = 0.70;
        document.getElementById('prof_mw_min').value = 6.0;
        document.getElementById('prof_mw_med').value = 7.5;
        document.getElementById('prof_mw_max').value = 8.5;
        document.getElementById('prof_max_depth').value = 20.0;
        document.getElementById('prof_depth_step').value = 0.5;
        triggerProfileCalculation();
    } else {
        currentBoreholeLayers = JSON.parse(JSON.stringify(defaultBoreholeLayers));
        document.getElementById('layer_def_amax').value = 0.55;
        document.getElementById('layer_def_mw').value = 7.5;
        document.getElementById('layer_def_na').value = 3.5;
        document.getElementById('layer_def_gamma').value = 19.0;
        renderBoreholeLayersTable();
        triggerLayersCalculation();
    }
}

function saveProjectJSON() {
    const data = {
        app: "SoilLiquefactionCalculator",
        version: "1.0",
        timestamp: new Date().toISOString(),
        mode: activeMode,
        profile_inputs: getProfilePayload(),
        layers_inputs: getLayersPayload()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `liquefacao_projeto_${new Date().toISOString().slice(0, 10)}.json`;
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
            if (data.profile_inputs) {
                const p = data.profile_inputs;
                if (p.water_depth != null) document.getElementById('prof_na').value = p.water_depth;
                if (p.soil_gamma != null) document.getElementById('prof_gamma').value = p.soil_gamma;
                if (p.fines_content_fc != null) document.getElementById('prof_fc').value = p.fines_content_fc;
                if (p.n1_60_min != null) document.getElementById('prof_n1_min').value = p.n1_60_min;
                if (p.n1_60_med != null) document.getElementById('prof_n1_med').value = p.n1_60_med;
                if (p.n1_60_max != null) document.getElementById('prof_n1_max').value = p.n1_60_max;
                if (p.a0_min != null) document.getElementById('prof_a0_min').value = p.a0_min;
                if (p.a0_max != null) document.getElementById('prof_a0_max').value = p.a0_max;
                if (p.mw_min != null) document.getElementById('prof_mw_min').value = p.mw_min;
                if (p.mw_med != null) document.getElementById('prof_mw_med').value = p.mw_med;
                if (p.mw_max != null) document.getElementById('prof_mw_max').value = p.mw_max;
            }
            if (data.layers_inputs && data.layers_inputs.layers) {
                currentBoreholeLayers = data.layers_inputs.layers;
            }
            if (data.mode) {
                switchMode(data.mode);
            } else {
                triggerProfileCalculation();
            }
        } catch (err) {
            alert("Erro ao ler JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

function exportProfileCSV() {
    let csv = "Profundidade (m);Sigma_v (kPa);u (kPa);Sigma_v_eff (kPa);rd;CSR_a0_min;CSR_a0_max;FS_a0min_min;FS_a0min_med;FS_a0max_min;FS_a0max_med\n";
    currentProfileData.forEach(r => {
        csv += `${r.depth};${r.sigma_v};${r.u};${r.sigma_v_eff};${r.rd};${r.csr_a0_min};${r.csr_a0_max};${r.fs_a0min_min};${r.fs_a0min_med};${r.fs_a0max_min};${r.fs_a0max_med}\n`;
    });
    downloadCSV(csv, `perfil_liquefacao_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportLayersCSV() {
    let csv = "Profundidade (m);N1_60;FC (%);a_max (g);Mw;FS_NCEER;FS_Planilha\n";
    currentBoreholeLayers.forEach((l, idx) => {
        const fsNceer = document.getElementById(`lay-fs-nceer-${idx}`)?.innerText || '';
        const fsRef = document.getElementById(`lay-fs-ref-${idx}`)?.innerText || '';
        csv += `${l.depth};${l.n1_60};${l.fc_pct};${l.a_max};${l.mw};${fsNceer};${fsRef}\n`;
    });
    downloadCSV(csv, `sondagem_liquefacao_${new Date().toISOString().slice(0, 10)}.csv`);
}

function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
