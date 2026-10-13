let lastTsunamiRunResults = null;

const tsunamiInputIds = [
    'tsunami_asce_standard',
    'tsunami_unit_system',
    'tsunami_risk_category',
    'tsunami_design_method',
    'tsunami_inundation_depth',
    'tsunami_flow_velocity',
    'tsunami_fluid_density',
    'tsunami_internal_depth',
    'tsunami_submerged_volume',
    'tsunami_structure_type',
    'tsunami_component_width',
    'tsunami_member_shape',
    'tsunami_drag_coefficient',
    'tsunami_include_debris',
    'tsunami_debris_target',
    'tsunami_debris_type',
    'tsunami_debris_mass',
    'tsunami_debris_stiffness',
    'tsunami_orientation_factor',
    'tsunami_target_stiffness',
    'tsunami_include_surge',
    'tsunami_include_damming',
    'tsunami_damming_width',
    // Estruturas Portuárias & Cais Estaqueado: Mesa e Estacas
    'tsunami_deck_height',
    'tsunami_deck_width',
    'tsunami_deck_length',
    'tsunami_deck_type',
    'tsunami_deck_venting',
    'tsunami_deck_cd',
    'tsunami_deck_csx',
    'tsunami_deck_cv',
    'tsunami_include_scour',
    'tsunami_scour_depth'
];

let currentTsunamiPiles = [
    { id: 'Estaca 1 (Ø 1.2m, L=21m)', diameter: 1.2, length: 21.0, cd: 1.2 },
    { id: 'Estaca 2 (Ø 1.5m, L=21m)', diameter: 1.5, length: 21.0, cd: 1.2 },
    { id: 'Estaca 3 (Ø 1.2m, L=18m)', diameter: 1.2, length: 18.0, cd: 1.2 },
    { id: 'Estaca 4 (Ø 1.2m, L=15m)', diameter: 1.2, length: 15.0, cd: 1.2 },
    { id: 'Estaca 5 (Ø 1.2m, L=13m)', diameter: 1.2, length: 13.0, cd: 1.2 },
    { id: 'Estaca 6 (Ø 1.2m, L=6m)', diameter: 1.2, length: 6.0, cd: 1.2 }
];

function onPileDiamChange(inputEl) {
    const val = parseFloat(inputEl.value);
    if (!isNaN(val) && val > 0) {
        const row = inputEl.closest('tr');
        const idInput = row ? row.querySelector('.pile-id') : null;
        if (idInput && idInput.value.includes('Ø')) {
            idInput.value = idInput.value.replace(/Ø\s*[\d\.]+\s*m/i, `Ø ${val.toFixed(1)}m`);
        }
    }
}

function renderPilesTable() {
    const tbody = document.getElementById('tbody-piles');
    if (!tbody) return;
    tbody.innerHTML = '';
    currentTsunamiPiles.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50 dark:hover:bg-gray-750';
        tr.innerHTML = `
            <td class="p-2"><input type="text" value="${p.id}" class="pile-id w-36 p-1 border rounded bg-white dark:bg-gray-700 font-sans text-xs"></td>
            <td class="p-2"><input type="number" step="0.05" value="${p.diameter}" oninput="onPileDiamChange(this)" class="pile-diam w-20 p-1 border rounded bg-white dark:bg-gray-700 text-xs font-mono font-bold"></td>
            <td class="p-2"><input type="number" step="0.5" value="${p.length}" class="pile-len w-20 p-1 border rounded bg-white dark:bg-gray-700 text-xs font-mono font-bold"></td>
            <td class="p-2"><input type="number" step="0.05" value="${p.cd}" class="pile-cd w-16 p-1 border rounded bg-white dark:bg-gray-700 text-xs font-mono"></td>
            <td class="p-2 text-center"><button type="button" onclick="deletePileRow(${idx})" class="text-rose-500 hover:text-rose-700 font-bold cursor-pointer">✕</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function readPilesFromTable() {
    const rows = document.querySelectorAll('#tbody-piles tr');
    if (rows.length === 0) return currentTsunamiPiles;
    const piles = [];
    rows.forEach((tr, i) => {
        const diamVal = parseFloat(tr.querySelector('.pile-diam')?.value || 1.2);
        let idVal = tr.querySelector('.pile-id')?.value || `Estaca ${i + 1}`;
        if (idVal.includes('Ø') && !isNaN(diamVal)) {
            idVal = idVal.replace(/Ø\s*[\d\.]+\s*m/i, `Ø ${diamVal.toFixed(1)}m`);
        }
        piles.push({
            id: idVal,
            diameter: diamVal,
            length: parseFloat(tr.querySelector('.pile-len')?.value || 21.0),
            cd: parseFloat(tr.querySelector('.pile-cd')?.value || 1.2)
        });
    });
    currentTsunamiPiles = piles;
    return piles;
}

function addPileRow() {
    readPilesFromTable();
    const nextIdx = currentTsunamiPiles.length + 1;
    currentTsunamiPiles.push({
        id: `Estaca ${nextIdx} (Ø 1.2m, L=21m)`,
        diameter: 1.2,
        length: 21.0,
        cd: 1.2
    });
    renderPilesTable();
}

function deletePileRow(idx) {
    readPilesFromTable();
    currentTsunamiPiles.splice(idx, 1);
    renderPilesTable();
}

function resetPilesToDefault() {
    currentTsunamiPiles = [
        { id: 'Estaca 1 (Ø 1.2m, L=21m)', diameter: 1.2, length: 21.0, cd: 1.2 },
        { id: 'Estaca 2 (Ø 1.5m, L=21m)', diameter: 1.5, length: 21.0, cd: 1.2 },
        { id: 'Estaca 3 (Ø 1.2m, L=18m)', diameter: 1.2, length: 18.0, cd: 1.2 },
        { id: 'Estaca 4 (Ø 1.2m, L=15m)', diameter: 1.2, length: 15.0, cd: 1.2 },
        { id: 'Estaca 5 (Ø 1.2m, L=13m)', diameter: 1.2, length: 13.0, cd: 1.2 },
        { id: 'Estaca 6 (Ø 1.2m, L=6m)', diameter: 1.2, length: 6.0, cd: 1.2 }
    ];
    renderPilesTable();
}

// Preset library for debris per ASCE 7-22 Table 6.11-1 and Table 6.11-2 (Orientation Co)
const debrisPresets = {
    imperial: {
        container_loaded: { mass: 40000, stiffness: 2940000, co: 0.65 },
        container_teu: { mass: 28990, stiffness: 2940000, co: 0.65 },
        container_empty: { mass: 5000, stiffness: 480000, co: 0.65 },
        log: { mass: 1000, stiffness: 1320000, co: 1.00 },
        vehicle: { mass: 4000, stiffness: 340000, co: 0.65 },
        boulder: { mass: 8000, stiffness: 6800000, co: 1.00 }
    },
    metric: {
        container_loaded: { mass: 18144, stiffness: 42900, co: 0.65 },
        container_teu: { mass: 13150, stiffness: 42900, co: 0.65 },
        container_empty: { mass: 2268, stiffness: 7000, co: 0.65 },
        log: { mass: 454, stiffness: 19200, co: 1.00 },
        vehicle: { mass: 1814, stiffness: 5000, co: 0.65 },
        boulder: { mass: 3628, stiffness: 100000, co: 1.00 }
    }
};

function handleStructureTypeChange() {
    const type = document.getElementById('tsunami_structure_type')?.value || 'cais_wharf';
    const isoFields = document.getElementById('isolated-geometry-fields');
    if (isoFields) {
        if (type === 'isolated_member') {
            isoFields.classList.remove('hidden');
        } else {
            isoFields.classList.add('hidden');
        }
    }
    updateAutomaticCoefficients();
}

function updateAutomaticCoefficients() {
    const isManual = document.getElementById('override-cd-manual')?.checked;
    if (isManual) return;

    const structureType = document.getElementById('tsunami_structure_type')?.value || 'cais_wharf';
    const cdInput = document.getElementById('tsunami_drag_coefficient');
    const badge = document.getElementById('cd-auto-badge');
    const expl = document.getElementById('cd-formula-explanation');

    if (structureType === 'cais_wharf') {
        const h_deck = parseFloat(document.getElementById('tsunami_deck_height')?.value) || 2.55;
        const B_deck = parseFloat(document.getElementById('tsunami_deck_width')?.value) || 32.0;
        const ar = B_deck / Math.max(0.01, h_deck);
        let cd = 2.0;
        if (ar <= 1.0) {
            cd = 2.0;
        } else if (ar >= 5.0) {
            cd = 1.20;
        } else {
            cd = 2.0 - 0.20 * (ar - 1.0);
        }
        if (cdInput) cdInput.value = cd.toFixed(2);
        if (badge) badge.innerText = `Auto: Tab. 6.10-1 (B/h = ${ar.toFixed(1)})`;
        if (expl) expl.innerText = `ASCE 7 Tab. 6.10-1: Mesa retangular com B/h = ${ar.toFixed(1)} => Cd = ${cd.toFixed(2)}`;
    } else {
        const shape = document.getElementById('tsunami_member_shape')?.value || 'wall';
        let cd = 2.0;
        let desc = 'Parede / Fachada (Cd = 2.00)';
        if (shape === 'round_column') {
            cd = 1.20;
            desc = 'Pilar Circular (Cd = 1.20)';
        } else if (shape === 'diamond') {
            cd = 1.60;
            desc = 'Pilar Losangular (Cd = 1.60)';
        } else if (shape === 'square_column' || shape === 'wall') {
            cd = 2.00;
            desc = 'Seção Retangular / Parede (Cd = 2.00)';
        }
        if (shape !== 'custom' && cdInput) {
            cdInput.value = cd.toFixed(2);
            if (badge) badge.innerText = `Auto: Tab. 6.10-1`;
            if (expl) expl.innerText = desc;
        }
    }
}

function updateDeckCoefficients() {
    const isManual = document.getElementById('override-deck-coefs')?.checked;
    const h_deck = parseFloat(document.getElementById('tsunami_deck_height')?.value) || 2.55;
    const B_deck = parseFloat(document.getElementById('tsunami_deck_width')?.value) || 32.0;
    const ar = B_deck / Math.max(0.01, h_deck);

    const ratioLbl = document.getElementById('deck-cd-ratio-lbl');
    if (ratioLbl) ratioLbl.innerText = `B/h = ${ar.toFixed(1)}`;

    if (!isManual) {
        // 1. Cd per Table 6.10-1
        let cd = 2.0;
        if (ar <= 1.0) cd = 2.0;
        else if (ar >= 5.0) cd = 1.20;
        else cd = 2.0 - 0.20 * (ar - 1.0);

        const cdEl = document.getElementById('tsunami_deck_cd');
        if (cdEl) cdEl.value = cd.toFixed(2);

        // 2. Csx shape factor per ASCE 7 Section 6.10
        const deckType = document.getElementById('tsunami_deck_type')?.value || 'solid_slab';
        let csx = 1.00;
        if (deckType === 'i_girder') csx = 1.25;
        else if (deckType === 'grated') csx = 0.85;
        else csx = 1.00;

        const csxEl = document.getElementById('tsunami_deck_csx');
        if (csxEl) csxEl.value = csx.toFixed(2);

        // 3. Cv uplift coefficient per Eq. 6.10-11
        const venting = document.getElementById('tsunami_deck_venting')?.value || 'submerged_steady';
        let cv = 1.00;
        if (venting === 'air_entrapment') cv = 1.50;
        else if (venting === 'slamming_wave') cv = 2.00;
        else cv = 1.00;

        const cvEl = document.getElementById('tsunami_deck_cv');
        if (cvEl) cvEl.value = cv.toFixed(2);
    }

    updateAutomaticCoefficients();
}

function toggleManualCd(manual) {
    const cdInput = document.getElementById('tsunami_drag_coefficient');
    const badge = document.getElementById('cd-auto-badge');
    if (!cdInput) return;
    if (manual) {
        cdInput.removeAttribute('readonly');
        cdInput.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'cursor-not-allowed');
        cdInput.classList.add('bg-white', 'dark:bg-gray-800');
        if (badge) {
            badge.innerText = 'Manual';
            badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300';
        }
    } else {
        cdInput.setAttribute('readonly', 'true');
        cdInput.classList.add('bg-gray-100', 'dark:bg-gray-700', 'cursor-not-allowed');
        cdInput.classList.remove('bg-white', 'dark:bg-gray-800');
        if (badge) {
            badge.innerText = 'Auto: Tab. 6.10-1';
            badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300';
        }
        updateAutomaticCoefficients();
    }
}

function toggleManualDeckCoefs(manual) {
    const ids = ['tsunami_deck_cd', 'tsunami_deck_csx', 'tsunami_deck_cv'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (manual) {
            el.removeAttribute('readonly');
            el.classList.remove('border-0', 'bg-transparent');
            el.classList.add('border', 'border-blue-400', 'rounded', 'p-1', 'bg-white', 'dark:bg-gray-700');
        } else {
            el.setAttribute('readonly', 'true');
            el.classList.add('border-0', 'bg-transparent');
            el.classList.remove('border', 'border-blue-400', 'rounded', 'p-1', 'bg-white', 'dark:bg-gray-700');
        }
    });
    if (!manual) {
        updateDeckCoefficients();
    }
}

function handleDebrisTypeChange() {
    const type = document.getElementById('tsunami_debris_type')?.value || 'container_loaded';
    const unit = document.getElementById('tsunami_unit_system')?.value || 'metric';
    const preset = debrisPresets[unit]?.[type];
    if (preset) {
        const massEl = document.getElementById('tsunami_debris_mass');
        const stiffEl = document.getElementById('tsunami_debris_stiffness');
        const coEl = document.getElementById('tsunami_orientation_factor');
        if (massEl) massEl.value = preset.mass;
        if (stiffEl) stiffEl.value = preset.stiffness;
        if (coEl && preset.co !== undefined) coEl.value = preset.co.toString();
    }
    const targetDesc = document.getElementById('deck-debris-type-desc');
    if (targetDesc) {
        const optText = document.getElementById('tsunami_debris_type')?.selectedOptions?.[0]?.text || type;
        targetDesc.innerText = optText;
    }
}

function handleDebrisTargetChange() {
    const target = document.getElementById('tsunami_debris_target')?.value || 'deck';
    const badge = document.getElementById('deck-debris-status-badge');
    const card = document.getElementById('deck-debris-summary-card');
    if (badge) {
        if (target === 'deck') {
            badge.innerText = 'Ativo no Deck';
            badge.className = 'px-1.5 py-0.2 rounded text-[10px] font-bold bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300';
            if (card) card.classList.remove('opacity-60');
        } else if (target === 'piles') {
            badge.innerText = 'Alocado em Estaca';
            badge.className = 'px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300';
            if (card) card.classList.add('opacity-60');
        } else {
            badge.innerText = 'Alocado na Estrutura Frontal';
            badge.className = 'px-1.5 py-0.2 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300';
            if (card) card.classList.add('opacity-60');
        }
    }
}

function loadCaisTsunamiPreset() {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const unitEl = document.getElementById('tsunami_unit_system');
    if (unitEl) {
        unitEl.value = 'metric';
        unitEl.dispatchEvent(new Event('change'));
    }
    setVal('tsunami_structure_type', 'cais_wharf');
    setVal('tsunami_flow_velocity', '8.0');
    setVal('tsunami_fluid_density', '1130.0');
    setVal('tsunami_risk_category', 'IV');
    setVal('tsunami_inundation_depth', '21.0');
    setVal('tsunami_deck_height', '2.55');
    setVal('tsunami_deck_width', '32.0');
    setVal('tsunami_deck_length', '1.0');
    setVal('tsunami_deck_type', 'solid_slab');
    setVal('tsunami_deck_venting', 'submerged_steady');

    const debCb = document.getElementById('tsunami_include_debris');
    if (debCb) debCb.checked = true;
    setVal('tsunami_debris_target', 'deck');
    setVal('tsunami_debris_type', 'container_teu');
    setVal('tsunami_debris_mass', '13150');
    setVal('tsunami_debris_stiffness', '42900');
    setVal('tsunami_orientation_factor', '0.65');
    setVal('tsunami_target_stiffness', 'rigid');

    const scourCb = document.getElementById('tsunami_include_scour');
    if (scourCb) scourCb.checked = false;
    setVal('tsunami_scour_depth', '4.0');

    handleStructureTypeChange();
    updateDeckCoefficients();
    handleDebrisTypeChange();
    handleDebrisTargetChange();

    resetPilesToDefault();
    setTimeout(() => {
        document.getElementById('run-tsunami-calculation-btn')?.click();
    }, 50);
}

window.addPileRow = addPileRow;
window.deletePileRow = deletePileRow;
window.resetPilesToDefault = resetPilesToDefault;
window.loadCaisTsunamiPreset = loadCaisTsunamiPreset;
window.handleStructureTypeChange = handleStructureTypeChange;
window.updateAutomaticCoefficients = updateAutomaticCoefficients;
window.updateDeckCoefficients = updateDeckCoefficients;
window.toggleManualCd = toggleManualCd;
window.toggleManualDeckCoefs = toggleManualDeckCoefs;
window.handleDebrisTypeChange = handleDebrisTypeChange;
window.handleDebrisTargetChange = handleDebrisTargetChange;

const tsunamiLoadCalculator = (() => {
    function run(inputs) {
        const standard = inputs.tsunami_asce_standard || 'ASCE 7-22';
        const unit_system = inputs.tsunami_unit_system || 'imperial';
        const is_metric = (unit_system === 'metric');
        const risk = inputs.tsunami_risk_category || 'II';
        const design_method = inputs.tsunami_design_method || 'LRFD';

        let h = parseFloat(inputs.tsunami_inundation_depth) || (is_metric ? 3.0 : 10.0);
        const u = parseFloat(inputs.tsunami_flow_velocity) || (is_metric ? 4.5 : 15.0);
        const rho_val = parseFloat(inputs.tsunami_fluid_density) || (is_metric ? 1200.0 : 75.0);
        const h_int = parseFloat(inputs.tsunami_internal_depth) || 0.0;
        const V_sub = parseFloat(inputs.tsunami_submerged_volume) || (is_metric ? 8.5 : 300.0);

        let B = parseFloat(inputs.tsunami_component_width) || (is_metric ? 4.5 : 15.0);
        const Cd = parseFloat(inputs.tsunami_drag_coefficient) || 2.0;

        const include_damming = Boolean(inputs.tsunami_include_damming);
        const delta_B = include_damming ? (parseFloat(inputs.tsunami_damming_width) || (is_metric ? 3.0 : 10.0)) : 0.0;
        const B_eff = B + delta_B;

        const include_surge = Boolean(inputs.tsunami_include_surge);
        const include_debris = Boolean(inputs.tsunami_include_debris);

        const debris_type = inputs.tsunami_debris_type || 'log';
        const W_debris = parseFloat(inputs.tsunami_debris_mass) || (is_metric ? 454.0 : 1000.0);
        const k_debris_input = parseFloat(inputs.tsunami_debris_stiffness) || (is_metric ? 19200.0 : 1320000.0);
        const Co = parseFloat(inputs.tsunami_orientation_factor) || 0.65;
        const target_stiffness = inputs.tsunami_target_stiffness || 'rigid';

        const its_map = { "I": 0.80, "II": 1.00, "III": 1.25, "IV": 1.25 };
        const Its = its_map[risk] || 1.00;

        const warnings = [];
        if (h <= 0) {
            h = 0.01;
            warnings.push("A profundidade de inundação deve ser maior que zero.");
        }
        if (B <= 0) {
            B = 0.01;
            warnings.push("A largura do componente deve ser maior que zero.");
        }

        let Fr = 0;
        let Fd = 0, qd = 0, zd = 0, Md = 0;
        let Fs = 0, zs = 0, Ms = 0;
        let Fh = 0, ph_base = 0, zh = 0, Mh = 0;
        let Fb = 0;
        let Fi = 0, td = 0, impulse_J = 0, zi = 0, Mi = 0;

        if (is_metric) {
            const g = 9.80665; // m/s²
            Fr = u / Math.sqrt(g * h);

            // Drag Fd (kN) and qd (kPa) per ASCE 7-22 Section 6.10.2 Eq. 6.10-1
            const rho_m = rho_val; // kg/m³
            const Fd_N = 0.5 * rho_m * Its * Cd * B_eff * h * Math.pow(u, 2);
            Fd = Fd_N / 1000.0;
            qd = (0.5 * rho_m * Its * Cd * Math.pow(u, 2)) / 1000.0;
            zd = h / 2.0;
            Md = Fd * zd;

            // Surge
            Fs = include_surge ? 1.5 * Fd : 0.0;
            zs = h / 2.0;
            Ms = Fs * zs;

            // Hydrostatic
            const gamma_s = rho_m * g; // N/m³
            const Fh_N = 0.5 * gamma_s * B * Math.max(0, Math.pow(h, 2) - Math.pow(h_int, 2));
            Fh = Fh_N / 1000.0;
            ph_base = (gamma_s * Math.max(0, h - h_int)) / 1000.0;
            zh = h / 3.0;
            Mh = Fh * zh;

            // Buoyancy
            Fb = (gamma_s * V_sub) / 1000.0;

            // Debris
            if (include_debris) {
                const kd_N_m = k_debris_input * 1000.0; // from kN/m to N/m
                const k_eff = (target_stiffness === 'rigid') ? kd_N_m : (kd_N_m / 2.0);
                const m_debris = W_debris; // kg
                const Fi_N = Its * Co * u * Math.sqrt(Math.max(0, k_eff * m_debris));
                Fi = Fi_N / 1000.0;
                td = (Math.PI / 2.0) * Math.sqrt(Math.max(0, m_debris / Math.max(1.0, k_eff)));
                impulse_J = (2.0 / Math.PI) * Fi_N * td;
                zi = h;
                Mi = Fi * zi;
            }
        } else {
            const g = 32.174; // ft/s²
            Fr = u / Math.sqrt(g * h);

            // Drag Fd (kips) and qd (psf) per ASCE 7-22 Section 6.10.2 Eq. 6.10-1
            const gamma_s = rho_val; // lb/ft³
            const rho_mass = gamma_s / g; // slugs/ft³
            const Fd_lb = 0.5 * rho_mass * Its * Cd * B_eff * h * Math.pow(u, 2);
            Fd = Fd_lb / 1000.0;
            qd = 0.5 * rho_mass * Its * Cd * Math.pow(u, 2);
            zd = h / 2.0;
            Md = Fd * zd;

            // Surge
            Fs = include_surge ? 1.5 * Fd : 0.0;
            zs = h / 2.0;
            Ms = Fs * zs;

            // Hydrostatic
            const Fh_lb = 0.5 * gamma_s * B * Math.max(0, Math.pow(h, 2) - Math.pow(h_int, 2));
            Fh = Fh_lb / 1000.0;
            ph_base = gamma_s * Math.max(0, h - h_int);
            zh = h / 3.0;
            Mh = Fh * zh;

            // Buoyancy
            Fb = (gamma_s * V_sub) / 1000.0;

            // Debris
            if (include_debris) {
                const kd_lb_ft = k_debris_input;
                const k_eff = (target_stiffness === 'rigid') ? kd_lb_ft : (kd_lb_ft / 2.0);
                const m_debris = W_debris / g; // slugs
                const Fi_lb = Its * Co * u * Math.sqrt(Math.max(0, k_eff * m_debris));
                Fi = Fi_lb / 1000.0;
                td = (Math.PI / 2.0) * Math.sqrt(Math.max(0, m_debris / Math.max(1.0, k_eff)));
                impulse_J = (2.0 / Math.PI) * Fi_lb * td;
                zi = h;
                Mi = Fi * zi;
            }
        }

        // Combinations
        const case_flow_lat = Fd + Fh;
        const case_flow_moment = Md + Mh;

        const case_surge_lat = include_surge ? (Fs + Fh) : case_flow_lat;
        const case_surge_moment = include_surge ? (Ms + Mh) : case_flow_moment;

        const case_impact_lat = include_debris ? (Fd + Fh + Fi) : case_flow_lat;
        const case_impact_moment = include_debris ? (Md + Mh + Mi) : case_flow_moment;

        let governing_case = "";
        let Ts_nom = 0;
        let M_governing = 0;

        if (case_impact_lat >= case_surge_lat && case_impact_lat >= case_flow_lat) {
            governing_case = "Impacto de Detritos + Arrasto + Hidrostática (Debris Impact + Flow)";
            Ts_nom = case_impact_lat;
            M_governing = case_impact_moment;
        } else if (case_surge_lat >= case_flow_lat) {
            governing_case = "Surto Hidrodinâmico Impulsivo (Bore Surge Front)";
            Ts_nom = case_surge_lat;
            M_governing = case_surge_moment;
        } else {
            governing_case = "Fluxo Estacionário Máximo (Steady Inundation Flow)";
            Ts_nom = case_flow_lat;
            M_governing = case_flow_moment;
        }

        const design_factor = (design_method === 'LRFD') ? 1.00 : 0.70;
        const Ts_design = Ts_nom * design_factor;
        const M_design = M_governing * design_factor;

        const wet_area = B_eff * h;
        const q_equiv_nom = is_metric ? (Ts_nom / wet_area) : ((Ts_nom * 1000.0) / wet_area);
        const q_equiv_design = is_metric ? (Ts_design / wet_area) : ((Ts_design * 1000.0) / wet_area);

        const flow_regime = (Fr > 1.05) ? "Supercrítico (Fr > 1.0)" : ((Fr < 0.95) ? "Subcrítico (Fr < 1.0)" : "Crítico (Fr ≈ 1.0)");

        // =========================================================================
        // ESTRUTURAS PORTUÁRIAS & CAIS ESTAQUEADO (DECK & PILES)
        // =========================================================================
        const deck_height = parseFloat(inputs.tsunami_deck_height) || (is_metric ? 2.55 : 8.37);
        const deck_width = parseFloat(inputs.tsunami_deck_width) || (is_metric ? 32.0 : 105.0);
        const deck_length = parseFloat(inputs.tsunami_deck_length) || (is_metric ? 1.0 : 3.28);

        // Aspect ratio AR = B / h
        const ar_deck = deck_width / Math.max(0.01, deck_height);
        const auto_deck_cd = (ar_deck <= 1.0) ? 2.00 : (ar_deck >= 5.0 ? 1.20 : (2.00 - 0.20 * (ar_deck - 1.0)));
        const deck_cd = parseFloat(inputs.tsunami_deck_cd) || auto_deck_cd;

        // Shape factor Csx per typology
        const deck_type = inputs.tsunami_deck_type || 'solid_slab';
        const csx_map = { solid_slab: 1.00, i_girder: 1.25, box_girder: 1.00, grated: 0.85 };
        const deck_csx = parseFloat(inputs.tsunami_deck_csx) || (csx_map[deck_type] || 1.00);

        // Uplift coefficient Cv per Eq. 6.10-11
        const deck_venting = inputs.tsunami_deck_venting || 'submerged_steady';
        const cv_map = { submerged_steady: 1.00, air_entrapment: 1.50, slamming_wave: 2.00 };
        const deck_cv = parseFloat(inputs.tsunami_deck_cv) || (cv_map[deck_venting] || 1.00);

        const include_scour = Boolean(inputs.tsunami_include_scour !== false && inputs.tsunami_include_scour !== 'false');
        const scour_depth = include_scour ? (parseFloat(inputs.tsunami_scour_depth) || (is_metric ? 4.0 : 13.12)) : 0.0;

        const debris_target = inputs.tsunami_debris_target || 'deck';

        let subpressure_kPa = 0, subpressure_tf_m2 = 0, subpressure_force_kN = 0, subpressure_force_tf = 0;
        let Fdx_linear_kN_m = 0, Fdx_linear_tf_m = 0, Fdx_total_kN = 0, Fdx_total_tf = 0;
        let Fni_cont_kN = 0, Fi_cont_kN = 0, Fi_cont_tf = 0;

        if (is_metric) {
            const g = 9.80665;
            const rho_m = rho_val;
            // Subpressão ASCE 7-22 Eq. 6.10-11 estrita sem Cv: P_p = 0.5 * rho_s * I_ts * u^2 (Pa)
            const Pp_Pa = 0.5 * rho_m * Its * Math.pow(u, 2);
            subpressure_kPa = Pp_Pa / 1000.0;
            subpressure_tf_m2 = subpressure_kPa / g;
            subpressure_force_kN = subpressure_kPa * deck_width * deck_length;
            subpressure_force_tf = subpressure_force_kN / g;

            // Arraste linear da mesa: Fdx = 0.5 * rho_s * I_ts * Cd * Csx * h_deck * u^2 (N/m)
            const Fdx_N_m = 0.5 * rho_m * Its * deck_cd * deck_csx * deck_height * Math.pow(u, 2);
            Fdx_linear_kN_m = Fdx_N_m / 1000.0;
            Fdx_linear_tf_m = Fdx_linear_kN_m / g;
            Fdx_total_kN = Fdx_linear_kN_m * deck_length;
            Fdx_total_tf = Fdx_total_kN / g;

            // Impacto de Contêiner na Mesa (ASCE 7-22 Sec. 6.11 / Tabela 6.11-2: Co = 0.65 obrigatório)
            if (include_debris && (debris_target === 'deck' || !debris_target)) {
                const co_cont = 0.65;
                const kd_N_m = k_debris_input * 1000.0;
                const keff_cont = (target_stiffness === 'rigid') ? kd_N_m : (kd_N_m / 2.0);
                const m_cont = W_debris;
                const Fni_N = u * Math.sqrt(Math.max(0, keff_cont * m_cont));
                Fni_cont_kN = Fni_N / 1000.0;
                const Fi_N = Its * co_cont * Fni_N;
                Fi_cont_kN = Fi_N / 1000.0;
                Fi_cont_tf = Fi_cont_kN / g;
            }
        } else {
            const g = 32.174;
            const gamma_s = rho_val;
            const rho_mass = gamma_s / g;
            // Eq. 6.10-11 estrita sem Cv
            const Pp_psf = 0.5 * rho_mass * Its * Math.pow(u, 2);
            subpressure_kPa = Pp_psf * 0.0478803;
            subpressure_tf_m2 = subpressure_kPa / 9.80665;
            const subpressure_force_kips = (Pp_psf * deck_width * deck_length) / 1000.0;
            subpressure_force_kN = subpressure_force_kips * 4.44822;
            subpressure_force_tf = subpressure_force_kN / 9.80665;

            const Fdx_lb_ft = 0.5 * rho_mass * Its * deck_cd * deck_csx * deck_height * Math.pow(u, 2);
            const Fdx_kips_ft = Fdx_lb_ft / 1000.0;
            Fdx_linear_kN_m = Fdx_kips_ft * 14.5939;
            Fdx_linear_tf_m = Fdx_linear_kN_m / 9.80665;
            Fdx_total_kN = Fdx_linear_kN_m * (deck_length * 0.3048);
            Fdx_total_tf = Fdx_total_kN / 9.80665;

            // Impacto de Contêiner na Mesa (Co = 0.65 per Tab. 6.11-2)
            if (include_debris && (debris_target === 'deck' || !debris_target)) {
                const co_cont = 0.65;
                const kd_lb_ft = k_debris_input;
                const keff_cont_imp = (target_stiffness === 'rigid') ? kd_lb_ft : (kd_lb_ft / 2.0);
                const m_cont_slugs = W_debris / g;
                const Fni_lb = u * Math.sqrt(Math.max(0, keff_cont_imp * m_cont_slugs));
                Fni_cont_kN = (Fni_lb * 4.44822) / 1000.0;
                const Fi_lb = Its * co_cont * Fni_lb;
                Fi_cont_kN = (Fi_lb * 4.44822) / 1000.0;
                Fi_cont_tf = Fi_cont_kN / 9.80665;
            }
        }

        // Piles
        const piles_raw = inputs.tsunami_piles || currentTsunamiPiles;
        const calculated_piles = [];
        let total_pile_drag_kN = 0.0, total_pile_drag_tf = 0.0;

        piles_raw.forEach((p_item, idx) => {
            const pid = p_item.id || `Estaca ${idx + 1}`;
            const diam = parseFloat(p_item.diameter) || (is_metric ? 1.2 : 3.94);
            const p_len = parseFloat(p_item.length) || (is_metric ? 21.0 : 68.9);
            const p_cd = parseFloat(p_item.cd) || 1.2;
            const p_eff_len = p_len + scour_depth;

            let Fw_kN = 0, Fw_tf = 0, M_base_kNm = 0, M_base_tfm = 0;

            if (is_metric) {
                const g = 9.80665;
                const rho_m = rho_val;
                const Fw_N = 0.5 * rho_m * Its * p_cd * diam * p_eff_len * Math.pow(u, 2);
                Fw_kN = Fw_N / 1000.0;
                Fw_tf = Fw_kN / g;
                M_base_kNm = Fw_kN * (p_eff_len / 2.0);
                M_base_tfm = Fw_tf * (p_eff_len / 2.0);
            } else {
                const g = 32.174;
                const rho_mass = rho_val / g;
                const Fw_lb = 0.5 * rho_mass * Its * p_cd * diam * p_eff_len * Math.pow(u, 2);
                const Fw_kips = Fw_lb / 1000.0;
                Fw_kN = Fw_kips * 4.44822;
                Fw_tf = Fw_kN / 9.80665;
                const M_kipft = Fw_kips * (p_eff_len / 2.0);
                M_base_kNm = M_kipft * 1.35582;
                M_base_tfm = M_base_kNm / 9.80665;
            }

            total_pile_drag_kN += Fw_kN;
            total_pile_drag_tf += Fw_tf;

            calculated_piles.push({
                id: pid,
                diameter: parseFloat(diam.toFixed(2)),
                length: parseFloat(p_len.toFixed(2)),
                scour_depth: parseFloat(scour_depth.toFixed(2)),
                effective_length: parseFloat(p_eff_len.toFixed(2)),
                cd: parseFloat(p_cd.toFixed(2)),
                Fw_kN: parseFloat(Fw_kN.toFixed(1)),
                Fw_tf: parseFloat(Fw_tf.toFixed(1)),
                M_base_kNm: parseFloat(M_base_kNm.toFixed(1)),
                M_base_tfm: parseFloat(M_base_tfm.toFixed(1))
            });
        });

        const deck_results = {
            deck_height,
            deck_width,
            deck_length,
            deck_cd,
            deck_csx,
            deck_cv,
            subpressure_kPa: parseFloat(subpressure_kPa.toFixed(2)),
            subpressure_tf_m2: parseFloat(subpressure_tf_m2.toFixed(2)),
            subpressure_force_kN: parseFloat(subpressure_force_kN.toFixed(1)),
            subpressure_force_tf: parseFloat(subpressure_force_tf.toFixed(1)),
            Fdx_linear_kN_m: parseFloat(Fdx_linear_kN_m.toFixed(1)),
            Fdx_linear_tf_m: parseFloat(Fdx_linear_tf_m.toFixed(1)),
            Fdx_total_kN: parseFloat(Fdx_total_kN.toFixed(1)),
            container_mass: W_debris,
            container_stiffness: k_debris_input,
            container_co: Co,
            debris_target,
            debris_type,
            container_impact_Fni_kN: parseFloat(Fni_cont_kN.toFixed(1)),
            container_impact_Fi_kN: parseFloat(Fi_cont_kN.toFixed(1)),
            container_impact_Fi_tf: parseFloat(Fi_cont_tf.toFixed(1)),
            scour_depth: parseFloat(scour_depth.toFixed(2)),
            include_scour
        };

        return {
            inputs,
            standard,
            unit_system,
            risk_category: risk,
            Its,
            hydraulic: {
                Fr,
                flow_regime,
                h_max: h,
                u_max: u,
                B_eff,
                wet_area
            },
            forces: {
                drag: { force: Fd, pressure: qd, arm: zd, moment: Md },
                surge: { force: Fs, applicable: include_surge, arm: zs, moment: Ms },
                hydrostatic: { force: Fh, pressure_base: ph_base, arm: zh, moment: Mh },
                buoyancy: { force: Fb },
                debris: {
                    force: Fi,
                    applicable: include_debris,
                    duration_s: td,
                    impulse: impulse_J,
                    arm: zi,
                    moment: Mi,
                    type: debris_type
                }
            },
            cases: {
                steady_flow: { lateral: case_flow_lat, moment: case_flow_moment },
                bore_surge: { lateral: case_surge_lat, moment: case_surge_moment },
                debris_impact: { lateral: case_impact_lat, moment: case_impact_moment }
            },
            results: {
                governing_case,
                Ts_nominal: Ts_nom,
                Ts_design: Ts_design,
                M_nominal: M_governing,
                M_design,
                Fb_uplift: Fb,
                q_equiv_nominal: q_equiv_nom,
                q_equiv_design,
                design_method,
                design_factor
            },
            deck_and_piles: {
                deck: deck_results,
                piles: calculated_piles,
                total_pile_drag_kN: parseFloat(total_pile_drag_kN.toFixed(1)),
                total_pile_drag_tf: parseFloat(total_pile_drag_tf.toFixed(1))
            },
            warnings,
            success: true
        };
    }
    return { run };
})();



const handleRunTsunamiCheck = createCalculationHandler({
    inputIds: tsunamiInputIds,
    storageKey: 'tsunami-calculator-inputs',
    validationRuleKey: 'tsunami',
    calculatorFunction: async (inputs, validation) => {
        inputs.tsunami_piles = readPilesFromTable();
        if (typeof window.eel !== 'undefined' && typeof window.eel.calculate_asce_tsunami === 'function') {
            try {
                const pyRes = await window.eel.calculate_asce_tsunami(inputs)();
                if (pyRes && pyRes.success) return pyRes;
            } catch (err) {
                console.warn("Eel backend error, falling back to JS calculator:", err);
            }
        }
        return tsunamiLoadCalculator.run(inputs, validation);
    },
    renderFunction: renderTsunamiResults,
    resultsContainerId: 'tsunami-results-container',
    buttonId: 'run-tsunami-calculation-btn',
    feedbackElId: 'feedback-message'
});

function renderTsunamiResults(data) {
    lastTsunamiRunResults = data;
    const container = document.getElementById('tsunami-results-container');
    if (!container) return;

    const { results, forces, hydraulic, inputs, unit_system } = data;
    const is_m = (unit_system === 'metric');

    const f_unit = is_m ? 'kN' : 'kips';
    const p_unit = is_m ? 'kPa' : 'psf';
    const m_unit = is_m ? 'kN·m' : 'kip·ft';
    const l_unit = is_m ? 'm' : 'ft';
    const v_unit = is_m ? 'm/s' : 'ft/s';

    const method = results.design_method || 'LRFD';
    const badgeColor = method === 'LRFD' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';

    let html = `
    <div class="space-y-6 animate-fade-in">
        <!-- Top Executive KPI Card -->
        <div class="p-6 bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl shadow-xl">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <span class="text-xs font-semibold uppercase tracking-wider text-blue-200">ASCE 7-22 / 7-16 Capítulo 6</span>
                    <h3 class="text-2xl font-black">Cargas de Tsunami e Impacto de Detritos</h3>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-3 py-1 rounded-full text-xs font-bold uppercase ${badgeColor}">${method} (Fator = ${results.design_factor.toFixed(2)})</span>
                    <span class="px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white">${unit_system.toUpperCase()}</span>
                </div>
            </div>

            <p class="text-sm text-blue-200 mb-6 flex items-center gap-2">
                <i class="fas fa-crown text-amber-300"></i> Condição Governante: <span class="font-bold text-white underline decoration-amber-400">${results.governing_case}</span>
            </p>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/15">
                    <div class="text-xs text-blue-200 font-medium">Força Lateral Total ($T_s$)</div>
                    <div class="text-2xl font-black text-white mt-1">${results.Ts_design.toFixed(2)} <span class="text-sm font-normal text-blue-200">${f_unit}</span></div>
                    <div class="text-[11px] text-blue-300 mt-1">Nominal: ${results.Ts_nominal.toFixed(2)} ${f_unit}</div>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/15">
                    <div class="text-xs text-blue-200 font-medium">Pressão Equivalente ($q_{equiv}$)</div>
                    <div class="text-2xl font-black text-amber-300 mt-1">${results.q_equiv_design.toFixed(2)} <span class="text-sm font-normal text-blue-200">${p_unit}</span></div>
                    <div class="text-[11px] text-blue-300 mt-1">Na área molhada $B \\cdot h$</div>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/15">
                    <div class="text-xs text-blue-200 font-medium">Momento de Tombamento ($M_t$)</div>
                    <div class="text-2xl font-black text-white mt-1">${results.M_design.toFixed(1)} <span class="text-sm font-normal text-blue-200">${m_unit}</span></div>
                    <div class="text-[11px] text-blue-300 mt-1">Nominal: ${results.M_nominal.toFixed(1)} ${m_unit}</div>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-lg p-4 border border-white/15">
                    <div class="text-xs text-blue-200 font-medium">Empuxo de Flotação ($F_b$)</div>
                    <div class="text-2xl font-black text-cyan-300 mt-1">${results.Fb_uplift.toFixed(2)} <span class="text-sm font-normal text-blue-200">${f_unit}</span></div>
                    <div class="text-[11px] text-blue-300 mt-1">Elevação vertical</div>
                </div>
            </div>
        </div>

        <!-- Hydraulic & Component Status -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Regime Hidráulico do Fluxo</div>
                <div class="text-lg font-bold text-gray-800 dark:text-gray-100 mt-1">${hydraulic.flow_regime}</div>
                <div class="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Número de Froude: <strong class="font-mono text-blue-600 dark:text-blue-400">Fr = ${hydraulic.Fr.toFixed(2)}</strong><br>
                    Velocidade: <span class="font-mono">${hydraulic.u_max} ${v_unit}</span> | Profundidade: <span class="font-mono">${hydraulic.h_max} ${l_unit}</span>
                </div>
            </div>

            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Geometria e Obstrução</div>
                <div class="text-lg font-bold text-gray-800 dark:text-gray-100 mt-1">Largura Efetiva: ${hydraulic.B_eff.toFixed(2)} ${l_unit}</div>
                <div class="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Área Molhada: <span class="font-mono">${hydraulic.wet_area.toFixed(2)} ${l_unit}²</span><br>
                    Coeficiente de Arrasto: <span class="font-mono text-purple-600 dark:text-purple-400">Cd = ${parseFloat(inputs.tsunami_drag_coefficient).toFixed(2)}</span>
                </div>
            </div>

            <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fator de Importância Tsunami</div>
                <div class="text-lg font-bold text-gray-800 dark:text-gray-100 mt-1">Categoria de Risco: ${data.risk_category}</div>
                <div class="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    Fator $I_{ts} = <strong class="text-emerald-600 dark:text-emerald-400">${data.Its.toFixed(2)}</strong><br>
                    Norma Vigente: <span class="font-semibold">${data.standard}</span>
                </div>
            </div>
        </div>

        <!-- Detailed Forces Breakdown Table -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
                <h4 class="font-bold text-base text-gray-800 dark:text-gray-100 flex items-center gap-2">
                    <i class="fas fa-list-check text-blue-600"></i> Detalhamento das Ações e Forças Individuais
                </h4>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm text-left">
                    <thead class="text-xs uppercase bg-gray-100 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300">
                        <tr>
                            <th class="px-4 py-3">Tipo de Força</th>
                            <th class="px-4 py-3">Referência ASCE</th>
                            <th class="px-4 py-3">Força Nominal</th>
                            <th class="px-4 py-3">Pressão / Magnitude</th>
                            <th class="px-4 py-3">Braço de Alavanca ($z$)</th>
                            <th class="px-4 py-3">Momento Base</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-750">
                            <td class="px-4 py-3 font-semibold text-blue-700 dark:text-blue-400">🌊 Arrasto Hidrodinâmico ($F_d$)</td>
                            <td class="px-4 py-3 text-xs text-gray-500">Sec. 6.10.2</td>
                            <td class="px-4 py-3 font-bold">${forces.drag.force.toFixed(2)} ${f_unit}</td>
                            <td class="px-4 py-3">${forces.drag.pressure.toFixed(2)} ${p_unit}</td>
                            <td class="px-4 py-3 font-mono">${forces.drag.arm.toFixed(2)} ${l_unit}</td>
                            <td class="px-4 py-3 font-mono">${forces.drag.moment.toFixed(1)} ${m_unit}</td>
                        </tr>
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-750">
                            <td class="px-4 py-3 font-semibold text-indigo-700 dark:text-indigo-400">⚡ Surto Impulsivo (Bore $F_s$)</td>
                            <td class="px-4 py-3 text-xs text-gray-500">Sec. 6.10.1</td>
                            <td class="px-4 py-3 font-bold">${forces.surge.applicable ? `${forces.surge.force.toFixed(2)} ${f_unit}` : '<span class="text-gray-400">N/A</span>'}</td>
                            <td class="px-4 py-3">${forces.surge.applicable ? `${(forces.drag.pressure * 1.5).toFixed(2)} ${p_unit}` : '-'}</td>
                            <td class="px-4 py-3 font-mono">${forces.surge.applicable ? `${forces.surge.arm.toFixed(2)} ${l_unit}` : '-'}</td>
                            <td class="px-4 py-3 font-mono">${forces.surge.applicable ? `${forces.surge.moment.toFixed(1)} ${m_unit}` : '-'}</td>
                        </tr>
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-750">
                            <td class="px-4 py-3 font-semibold text-teal-700 dark:text-teal-400">⚖️ Empuxo Hidrostático ($F_h$)</td>
                            <td class="px-4 py-3 text-xs text-gray-500">Sec. 6.9.1</td>
                            <td class="px-4 py-3 font-bold">${forces.hydrostatic.force.toFixed(2)} ${f_unit}</td>
                            <td class="px-4 py-3">${forces.hydrostatic.pressure_base.toFixed(2)} ${p_unit} (base)</td>
                            <td class="px-4 py-3 font-mono">${forces.hydrostatic.arm.toFixed(2)} ${l_unit}</td>
                            <td class="px-4 py-3 font-mono">${forces.hydrostatic.moment.toFixed(1)} ${m_unit}</td>
                        </tr>
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-750">
                            <td class="px-4 py-3 font-semibold text-rose-700 dark:text-rose-400">🪵 Impacto de Detrito ($F_i$)</td>
                            <td class="px-4 py-3 text-xs text-gray-500">Sec. 6.11.2</td>
                            <td class="px-4 py-3 font-bold text-rose-600 dark:text-rose-400">${forces.debris.applicable ? `${forces.debris.force.toFixed(2)} ${f_unit}` : '<span class="text-gray-400">Desativado</span>'}</td>
                            <td class="px-4 py-3">${forces.debris.applicable ? `Duração: ${(forces.debris.duration_s * 1000).toFixed(1)} ms` : '-'}</td>
                            <td class="px-4 py-3 font-mono">${forces.debris.applicable ? `${forces.debris.arm.toFixed(2)} ${l_unit}` : '-'}</td>
                            <td class="px-4 py-3 font-mono">${forces.debris.applicable ? `${forces.debris.moment.toFixed(1)} ${m_unit}` : '-'}</td>
                        </tr>
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-750 bg-gray-50/50 dark:bg-gray-800/40">
                            <td class="px-4 py-3 font-semibold text-cyan-700 dark:text-cyan-400">🎈 Flotação / Buoyancy ($F_b$)</td>
                            <td class="px-4 py-3 text-xs text-gray-500">Sec. 6.9.2</td>
                            <td class="px-4 py-3 font-bold text-cyan-600 dark:text-cyan-400">${forces.buoyancy.force.toFixed(2)} ${f_unit} (Uplift)</td>
                            <td class="px-4 py-3">Vertical ascendente</td>
                            <td class="px-4 py-3">-</td>
                            <td class="px-4 py-3">-</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Dedicated Section: Estruturas Portuárias & Cais Estaqueado (Mesa do Tabuleiro & Estacas) -->
        ${(() => {
            const dp = data.deck_and_piles;
            if (!dp) return '';
            const dk = dp.deck;
            const piles = dp.piles || [];

            let pileRowsHtml = '';
            piles.forEach(p => {
                pileRowsHtml += `
                    <tr class="hover:bg-amber-50/50 dark:hover:bg-amber-950/20">
                        <td class="px-3 py-2 font-bold text-gray-900 dark:text-gray-100">${p.id}</td>
                        <td class="px-3 py-2 font-mono">${p.diameter.toFixed(2)} ${l_unit}</td>
                        <td class="px-3 py-2 font-mono">${p.length.toFixed(1)} ${l_unit}</td>
                        <td class="px-3 py-2 font-mono text-gray-500">${p.scour_depth > 0 ? `+${p.scour_depth.toFixed(1)} ${l_unit}` : '-'}</td>
                        <td class="px-3 py-2 font-mono font-semibold">${p.effective_length.toFixed(1)} ${l_unit}</td>
                        <td class="px-3 py-2 font-mono font-black text-amber-600 dark:text-amber-400">${p.Fw_tf.toFixed(1)} tf <span class="text-xs font-normal text-gray-500">(${p.Fw_kN.toFixed(1)} kN)</span></td>
                        <td class="px-3 py-2 font-mono text-gray-600 dark:text-gray-300">${p.M_base_tfm.toFixed(1)} tf·m <span class="text-xs font-normal text-gray-500">(${p.M_base_kNm.toFixed(0)} kNm)</span></td>
                    </tr>
                `;
            });

            return `
            <div class="bg-gradient-to-br from-blue-50/40 via-white to-indigo-50/30 dark:from-gray-800 dark:via-gray-800 dark:to-gray-850 rounded-xl shadow-md border-2 border-indigo-200 dark:border-indigo-800/80 p-5 space-y-5">
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 dark:border-gray-700 pb-3">
                    <div class="flex items-center gap-2">
                        <span class="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-base">⚓</span>
                        <div>
                            <h4 class="font-black text-base text-gray-900 dark:text-white">Verificação Especial de Cais Estaqueado & Estruturas Portuárias</h4>
                            <p class="text-xs text-indigo-700 dark:text-indigo-300">ASCE 7 Capítulo 6 • Subpressão (Equação 6.10-11), Arraste na Mesa, Impacto e Arraste Individual de Estacas</p>
                        </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                        Fluxo $u = ${hydraulic.u_max} ${v_unit}$ • $I_{ts} = ${data.Its.toFixed(2)}$
                    </span>
                </div>

                <!-- 2-Column Summary: Mesa do Tabuleiro & Resumo Estacas -->
                <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                    <!-- Mesa do Tabuleiro Results Card -->
                    <div class="lg:col-span-5 bg-white dark:bg-gray-750 p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 shadow-2xs space-y-3.5">
                        <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                            <span class="font-extrabold text-xs uppercase tracking-wide text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                                <span>🚢</span> Mesa do Tabuleiro (Deck)
                            </span>
                            <span class="text-[11px] font-mono text-gray-500">h=${dk.deck_height}m, B=${dk.deck_width}m</span>
                        </div>

                        <!-- Subpressão Eq 6.10-11 -->
                        <div class="p-3 bg-cyan-50/70 dark:bg-cyan-950/40 rounded-lg border border-cyan-200 dark:border-cyan-800">
                            <div class="text-[11px] font-bold text-cyan-900 dark:text-cyan-200 flex items-center justify-between">
                                <span>Subpressão Hidrodinâmica Ascendente (Eq. 6.10-11)</span>
                                <span class="font-mono text-cyan-600 dark:text-cyan-400">P_p = 0.5·ρ_s·I·C_v·u²</span>
                            </div>
                            <div class="mt-1.5 flex items-baseline justify-between">
                                <div>
                                    <span class="text-xl font-black text-cyan-700 dark:text-cyan-300">${dk.subpressure_tf_m2.toFixed(2)}</span>
                                    <span class="text-xs font-bold text-cyan-800 dark:text-cyan-400">tf/m²</span>
                                    <span class="text-[11px] text-gray-500 ml-1">(${dk.subpressure_kPa.toFixed(1)} kPa)</span>
                                </div>
                                <div class="text-right">
                                    <span class="text-[10px] text-gray-500 block uppercase">Força Total Up</span>
                                    <span class="text-sm font-black text-cyan-800 dark:text-cyan-200">${dk.subpressure_force_tf.toFixed(1)} tf</span>
                                    <span class="text-[10px] text-gray-500">(${dk.subpressure_force_kN.toFixed(0)} kN)</span>
                                </div>
                            </div>
                        </div>

                        <!-- Arraste Linear da Mesa -->
                        <div class="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div class="text-[11px] font-bold text-blue-900 dark:text-blue-200 flex items-center justify-between">
                                <span>Força de Arraste Linear no Tabuleiro ($F_{dx}$)</span>
                                <span class="font-mono text-blue-600 dark:text-blue-400">Sec. 6.10.2</span>
                            </div>
                            <div class="mt-1.5 flex items-baseline justify-between">
                                <div>
                                    <span class="text-xl font-black text-blue-700 dark:text-blue-300">${dk.Fdx_linear_tf_m.toFixed(1)}</span>
                                    <span class="text-xs font-bold text-blue-800 dark:text-blue-400">tf/m</span>
                                    <span class="text-[11px] text-gray-500 ml-1">(${dk.Fdx_linear_kN_m.toFixed(1)} kN/m)</span>
                                </div>
                                <div class="text-right">
                                    <span class="text-[10px] text-gray-500 block uppercase">Total Vão (${dk.deck_length}m)</span>
                                    <span class="text-sm font-black text-blue-800 dark:text-blue-200">${dk.Fdx_total_tf.toFixed(1)} tf</span>
                                </div>
                            </div>
                        </div>

                        <!-- Impacto de Detrito na Mesa -->
                        <div class="p-3 bg-rose-50/70 dark:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-800">
                            <div class="text-[11px] font-bold text-rose-900 dark:text-rose-200 flex items-center justify-between">
                                <span>Impacto de Detrito na Mesa ($F_i$)</span>
                                <span class="font-mono text-rose-600 dark:text-rose-400">Sec. 6.11 ($m=${dk.container_mass}${is_m ? 'kg' : 'lb'}$)</span>
                            </div>
                            <div class="mt-1.5 flex items-baseline justify-between">
                                <div>
                                    <span class="text-xl font-black text-rose-700 dark:text-rose-300">${dk.container_impact_Fi_tf.toFixed(0)}</span>
                                    <span class="text-xs font-bold text-rose-800 dark:text-rose-400">tf</span>
                                    <span class="text-[11px] text-gray-500 ml-1">(${dk.container_impact_Fi_kN.toFixed(0)} kN)</span>
                                </div>
                                <div class="text-right text-[11px] text-gray-500">
                                    <span>$F_{ni} = ${dk.container_impact_Fni_kN.toFixed(0)}\\text{ kN}$</span><br>
                                    <span>$C_o = ${dk.container_co}$</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Tabela de Estacas Individuais -->
                    <div class="lg:col-span-7 bg-white dark:bg-gray-750 p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 shadow-2xs space-y-3">
                        <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                            <span class="font-extrabold text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                                <span>🪵</span> Arraste Hidrodinâmico Individual por Estaca ($F_w$)
                            </span>
                            <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                                ${piles.length} Estacas Definidas
                            </span>
                        </div>

                        <div class="overflow-x-auto max-h-[320px]">
                            <table class="w-full text-xs text-left">
                                <thead class="bg-gray-100 dark:bg-gray-700/70 uppercase text-gray-600 dark:text-gray-300 sticky top-0">
                                    <tr>
                                        <th class="px-3 py-2">Estaca</th>
                                        <th class="px-3 py-2">Diâm. ($b$)</th>
                                        <th class="px-3 py-2">Compr. ($h_e$)</th>
                                        <th class="px-3 py-2">Erosão</th>
                                        <th class="px-3 py-2">$h_{eff}$</th>
                                        <th class="px-3 py-2 font-black text-amber-700 dark:text-amber-300">Arrasto $F_w$</th>
                                        <th class="px-3 py-2">Momento Base</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                                    ${pileRowsHtml}
                                </tbody>
                            </table>
                        </div>

                        <!-- Footer Total -->
                        <div class="p-2.5 bg-amber-50 dark:bg-amber-950/40 rounded-lg border border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs">
                            <span class="font-bold text-amber-950 dark:text-amber-200">Força Total de Arraste em Todas as Estacas ($\Sigma F_w$):</span>
                            <span class="font-mono font-black text-amber-700 dark:text-amber-300 text-sm">
                                ${dp.total_pile_drag_tf.toFixed(1)} tf <span class="text-xs font-normal text-gray-600 dark:text-gray-400">(${dp.total_pile_drag_kN.toFixed(1)} kN)</span>
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            `;
        })()}

        <!-- Action Buttons -->
        <div class="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button id="send-to-combos-tsunami-btn" class="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold text-sm shadow transition flex items-center gap-2">
                <i class="fas fa-layer-group"></i> Enviar para Combinações de Cargas ASCE
            </button>
            <button id="generate-tsunami-report-btn" class="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-sm shadow transition flex items-center gap-2">
                <i class="fas fa-file-invoice"></i> Visualizar Relatório Técnico (Pop-up)
            </button>
        </div>
    </div>
    `;

    container.innerHTML = html;

    // Update Debris summary card in Deck inputs panel
    const deckDebrisVal = document.getElementById('deck-debris-fi-val');
    if (deckDebrisVal) {
        const dp = data.deck_and_piles;
        const dk = dp?.deck;
        if (dk && dk.container_impact_Fi_tf > 0) {
            deckDebrisVal.innerText = `${dk.container_impact_Fi_tf.toFixed(0)} tf (${dk.container_impact_Fi_kN.toFixed(0)} kN)`;
        } else if (forces.debris && forces.debris.applicable) {
            const fiVal = forces.debris.force;
            const tfVal = (is_m ? (fiVal / 9.80665) : (fiVal * 1000 / 2204.62)).toFixed(0);
            deckDebrisVal.innerText = `${tfVal} tf (${fiVal.toFixed(0)} ${f_unit})`;
        } else {
            deckDebrisVal.innerText = 'Desativado';
        }
    }

    // Attach Action Listeners
    document.getElementById('send-to-combos-tsunami-btn')?.addEventListener('click', () => {
        sendTsunamiToCombos(data);
    });

    document.getElementById('generate-tsunami-report-btn')?.addEventListener('click', () => {
        openTsunamiReportModal(data);
    });
}

function sendTsunamiToCombos(data) {
    if (!data || !data.results) {
        showFeedback("Nenhum resultado de tsunami disponível para exportação.", true);
        return;
    }

    const { results, unit_system } = data;
    // Export equivalent area pressure q_equiv_nominal or governing lateral pressure
    const tsPressure = parseFloat(results.q_equiv_nominal.toFixed(2));

    const comboPayload = {
        source: 'Tsunami & Debris Calculator (ASCE 7-22)',
        type: 'Tsunami',
        loads: {
            combo_tsunami_load_ts: tsPressure
        },
        unit_system: unit_system
    };

    localStorage.setItem('loadsForCombinator', JSON.stringify(comboPayload));
    showFeedback("Cargas de Tsunami transferidas com sucesso para o Módulo de Combinações!", false);
    setTimeout(() => {
        window.location.href = 'combos.html';
    }, 400);
}

function openTsunamiReportModal(data) {
    if (!data || !data.results) {
        showFeedback("Execute o cálculo primeiro antes de visualizar o relatório.", true);
        return;
    }

    const modal = document.getElementById('tsunami-report-modal');
    const modalBody = document.getElementById('tsunami-modal-report-body');
    if (!modal || !modalBody) return;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    const { results, forces, hydraulic, inputs, unit_system, cases } = data;
    const is_m = (unit_system === 'metric');
    const f_unit = is_m ? 'kN' : 'kips';
    const p_unit = is_m ? 'kPa' : 'psf';
    const m_unit = is_m ? 'kN·m' : 'kip·ft';
    const m_unit_latex = is_m ? '\\text{kN}\\cdot\\text{m}' : '\\text{kip}\\cdot\\text{ft}';
    const l_unit = is_m ? 'm' : 'ft';
    const v_unit = is_m ? 'm/s' : 'ft/s';
    const rho_unit = is_m ? 'kg/m³' : 'lb/ft³';
    const rho_unit_latex = is_m ? '\\text{kg/m}^3' : '\\text{lb/ft}^3';
    const gamma_unit = is_m ? 'kN/m³' : 'lb/ft³';
    const gamma_unit_latex = is_m ? '\\text{kN/m}^3' : '\\text{lb/ft}^3';
    const acc_unit_latex = is_m ? '\\text{m/s}^2' : '\\text{ft/s}^2';
    const area_unit_latex = is_m ? '\\text{m}^2' : '\\text{ft}^2';
    const vol_unit_latex = is_m ? '\\text{m}^3' : '\\text{ft}^3';
    const impulse_unit_latex = is_m ? '\\text{N}\\cdot\\text{s}' : '\\text{lb}\\cdot\\text{s}';

    if (typeof ReportBuilder === 'undefined') {
        modalBody.innerHTML = `
            <div class="p-6 text-center text-red-600 font-bold">
                Biblioteca ReportBuilder não encontrada. Por favor recarregue a página.
            </div>`;
        return;
    }

    const report = new ReportBuilder({
        reportId: 'tsunami-modal-report-content',
        title: `MEMÓRIA DE CÁLCULO E RELATÓRIO TÉCNICO DE CARGAS DE TSUNAMI (${data.standard})`,
        actionButtons: []
    });

    const h = hydraulic.h_max;
    const u = hydraulic.u_max;
    const Fr = hydraulic.Fr;
    const Cd = parseFloat(inputs.tsunami_drag_coefficient) || 2.0;
    const B = parseFloat(inputs.tsunami_component_width) || (is_m ? 4.5 : 15.0);
    const B_eff = hydraulic.B_eff;
    const delta_B = B_eff - B;
    const A_wet = hydraulic.wet_area;
    const rho_val = parseFloat(inputs.tsunami_fluid_density) || (is_m ? 1200.0 : 75.0);
    const h_int = parseFloat(inputs.tsunami_internal_depth) || 0.0;
    const V_sub = parseFloat(inputs.tsunami_submerged_volume) || (is_m ? 8.5 : 300.0);
    const g = is_m ? 9.80665 : 32.174;
    const gamma_s = is_m ? (rho_val * g / 1000.0) : rho_val; // kN/m³ ou lb/ft³
    const rho_mass_slugs = (!is_m) ? (rho_val / g) : 0;

    // Detritos
    const W_debris = parseFloat(inputs.tsunami_debris_mass) || (is_m ? 454.0 : 1000.0);
    const k_debris = parseFloat(inputs.tsunami_debris_stiffness) || (is_m ? 19200.0 : 1320000.0);
    const Co = parseFloat(inputs.tsunami_orientation_factor) || 0.65;
    const target_stiffness = inputs.tsunami_target_stiffness || 'rigid';
    const m_mass = is_m ? W_debris : (W_debris / g);
    const m_mass_unit = is_m ? 'kg' : 'slugs';
    const k_eff = is_m ? (target_stiffness === 'rigid' ? (k_debris * 1000.0) : (k_debris * 1000.0 / 2.0)) : (target_stiffness === 'rigid' ? k_debris : (k_debris / 2.0));
    const k_unit = is_m ? 'kN/m' : 'lb/ft';
    const df = results.design_factor;

    // =========================================================================
    // SEÇÃO 1: DIRETRIZES, SUPOSIÇÕES E FATORES NORMATIVOS
    // =========================================================================
    const sec1Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <p class="text-gray-600 dark:text-gray-300">
            Este relatório apresenta a memória de cálculo analítica detalhada dos carregamentos de tsunami atuantes sobre a edificação ou componente estrutural costeiro, em estrita conformidade com os requisitos do <b>${data.standard} - Capítulo 6 (Tsunami Loads and Effects)</b>.
        </p>

        <div class="overflow-x-auto">
            <table class="w-full results-table eng-table text-xs">
                <thead>
                    <tr class="bg-gray-100 dark:bg-gray-700">
                        <th class="p-2 text-left">Parâmetro / Fator</th>
                        <th class="p-2 text-center">Símbolo</th>
                        <th class="p-2 text-center">Valor Adotado</th>
                        <th class="p-2 text-left">Referência Normativa</th>
                        <th class="p-2 text-left">Premissa / Justificativa Técnica</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="p-2 font-semibold">Norma de Referência</td>
                        <td class="p-2 text-center font-mono">-</td>
                        <td class="p-2 text-center font-bold text-blue-600">${data.standard}</td>
                        <td class="p-2">Capítulo 6</td>
                        <td class="p-2">Diretriz padrão para projeto costeiro resiliente a tsunamis.</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Categoria de Risco</td>
                        <td class="p-2 text-center font-mono">-</td>
                        <td class="p-2 text-center font-bold">Categoria ${data.risk_category}</td>
                        <td class="p-2">Tabela 1.5-1</td>
                        <td class="p-2">Classificação de ocupação e consequências de colapso estrutural.</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Fator de Importância Tsunami</td>
                        <td class="p-2 text-center font-mono">$I_{ts}$</td>
                        <td class="p-2 text-center font-bold text-emerald-600">${data.Its.toFixed(2)}</td>
                        <td class="p-2">Tabela 6.8-1</td>
                        <td class="p-2">Majorador de segurança das forças de tsunami conforme a Categoria ${data.risk_category}.</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Método de Dimensionamento</td>
                        <td class="p-2 text-center font-mono">$\\alpha_{design}$</td>
                        <td class="p-2 text-center font-bold">${results.design_method} (Fator = ${df.toFixed(2)})</td>
                        <td class="p-2">Sec. 2.4 / 6.12</td>
                        <td class="p-2">${results.design_method === 'LRFD' ? 'Método dos Estados Limites Últimos (Strength Design, fator 1.00).' : 'Método das Tensões Admissíveis (ASD, fator 0.70 sobre ações nominais).'}</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Densidade Fluida com Sedimentos</td>
                        <td class="p-2 text-center font-mono">$\\rho_s$</td>
                        <td class="p-2 text-center font-bold font-mono">${rho_val.toFixed(1)} ${rho_unit}</td>
                        <td class="p-2">Sec. 6.8</td>
                        <td class="p-2">A água do mar limpa possui $\\rho_0 \\approx 1.025\\text{ kg/m}^3$ ($64\\text{ lb/ft}^3$). A norma prescreve $\\rho_s \\ge 1.1\\rho_0$ e recomenda $\\rho_s = 1.2\\rho_0$ para incorporar o carreamento de sedimentos (areia e solo).</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Coeficiente de Arrasto</td>
                        <td class="p-2 text-center font-mono">$C_d$</td>
                        <td class="p-2 text-center font-bold font-mono">${Cd.toFixed(2)}</td>
                        <td class="p-2">Tabela 6.10-1</td>
                        <td class="p-2">Geometria da seção do elemento (${inputs.tsunami_member_shape}).</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Fator de Orientação do Detrito</td>
                        <td class="p-2 text-center font-mono">$C_o$</td>
                        <td class="p-2 text-center font-bold font-mono">${Co.toFixed(2)}</td>
                        <td class="p-2">Tabela 6.11-2</td>
                        <td class="p-2">${Co === 0.65 ? 'Orientação longitudinal/oblíqua provável (impacto padrão realista).' : 'Orientação frontal perpendicular desfavorável.'}</td>
                    </tr>
                    <tr>
                        <td class="p-2 font-semibold">Rigidez do Alvo Estrutural</td>
                        <td class="p-2 text-center font-mono">$k_s$</td>
                        <td class="p-2 text-center font-bold">${target_stiffness === 'rigid' ? 'Rígido' : 'Elástico'}</td>
                        <td class="p-2">Sec. 6.11.2</td>
                        <td class="p-2">${target_stiffness === 'rigid' ? 'Alvo considerado indeformável ($k_s \\to \\infty \\implies k = k_d$). Hipótese conservadora máxima.' : 'Alvo deformável em série ($k_s \\approx k_d \\implies k = k_d / 2$).'}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
    `;
    report.addSection("1. Diretrizes de Projeto, Suposições e Fatores Normativos", sec1Html, "tsunami-sec-params");

    // =========================================================================
    // SEÇÃO 2: HIDRÁULICA DO ESCOAMENTO E NÚMERO DE FROUDE
    // =========================================================================
    const sec2Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100 mb-2">2.1. Número de Froude e Caracterização do Regime de Fluxo</h4>
            <p class="text-gray-600 dark:text-gray-300 mb-2">
                O número de Froude ($Fr$) expressa a relação entre as forças inerciais do escoamento e as forças gravitacionais, definindo a transição entre regimes subcrítico, crítico e supercrítico:
            </p>
            <div class="p-2.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 font-mono text-center text-sm my-2">
                $$Fr = \\frac{u_{max}}{\\sqrt{g \\cdot h_{max}}}$$
            </div>
            <div class="space-y-1 text-gray-700 dark:text-gray-300">
                <p>• <b>Aceleração da gravidade:</b> $g = ${g.toFixed(5)}\\text{ }${acc_unit_latex}$</p>
                <p>• <b>Profundidade máxima de inundação:</b> $h_{max} = ${h.toFixed(2)}\\text{ ${l_unit}}$</p>
                <p>• <b>Velocidade máxima de escoamento:</b> $u_{max} = ${u.toFixed(2)}\\text{ ${v_unit}}$</p>
                <p>• <b>Celeridade da onda em águas rasas:</b> $c = \\sqrt{g \\cdot h_{max}} = \\sqrt{${g.toFixed(2)} \\times ${h.toFixed(2)}} = \\mathbf{${Math.sqrt(g * h).toFixed(2)}\\text{ ${v_unit}}}$</p>
                <p>• <b>Substituição direta:</b> $Fr = \\frac{${u.toFixed(2)}}{\\sqrt{${g.toFixed(2)} \\times ${h.toFixed(2)}}} = \\frac{${u.toFixed(2)}}{${Math.sqrt(g * h).toFixed(2)}} = \\mathbf{${Fr.toFixed(3)}}$</p>
                <p>• <b>Diagnóstico do Regime:</b> <span class="px-2 py-0.5 rounded font-bold ${Fr > 1.05 ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200' : 'bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200'}">${hydraulic.flow_regime}</span> ${Fr > 1 ? '(Escoamento torrencial supercrítico com grande capacidade de choque dinâmico e arraste).' : '(Escoamento subcrítico dominado por forças hidrostáticas e arrasto moderado).'}</p>
            </div>
        </div>

        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100 mb-2">2.2. Obstrução Estrutural, Área Projetada e Represamento de Detritos (Damming)</h4>
            <p class="text-gray-600 dark:text-gray-300 mb-2">
                Conforme ASCE 7-22 Seção 6.10.2, a largura de obstrução efetiva $B_{eff}$ deve considerar o acúmulo de detritos em pórticos contíguos (represamento $\\Delta B$):
            </p>
            <div class="space-y-1 text-gray-700 dark:text-gray-300">
                <p>• <b>Largura geométrica projetada do elemento:</b> $B = ${B.toFixed(2)}\\text{ ${l_unit}}$</p>
                <p>• <b>Largura adicional por represamento:</b> $\\Delta B = ${delta_B.toFixed(2)}\\text{ ${l_unit}}$ ${inputs.tsunami_include_damming ? '(Ativado via Damming)' : '(Desativado)'}</p>
                <p>• <b>Largura efetiva total de escoamento:</b> $B_{eff} = B + \\Delta B = ${B.toFixed(2)} + ${delta_B.toFixed(2)} = \\mathbf{${B_eff.toFixed(2)}\\text{ ${l_unit}}}$</p>
                <p>• <b>Área molhada projetada efetiva:</b> $A_{wet} = B_{eff} \\cdot h_{max} = ${B_eff.toFixed(2)} \\times ${h.toFixed(2)} = \\mathbf{${A_wet.toFixed(2)}\\text{ }${area_unit_latex}}$</p>
                <p>• <b>Peso específico com sedimento:</b> $\\gamma_s = \\rho_s \\cdot g = \\mathbf{${gamma_s.toFixed(2)}\\text{ }${gamma_unit_latex}}$</p>
            </div>
        </div>
    </div>
    `;
    report.addSection("2. Hidráulica do Escoamento e Análise de Froude", sec2Html, "tsunami-sec-hydraulics");

    // =========================================================================
    // SEÇÃO 3: FORÇA DE ARRASTO HIDRODINÂMICO (FD)
    // =========================================================================
    const sec3Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <p class="text-gray-600 dark:text-gray-300">
            A força de arrasto quase-estática representa o empuxo hidrodinâmico contínuo exercido pelo fluxo do tsunami em regime permanente de passagem pelo obstáculo (ASCE 7-22 Seção 6.10.2):
        </p>
        <div class="p-2.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 font-mono text-center text-sm my-2">
            $$F_d = \\frac{1}{2} \\cdot \\rho_s \\cdot I_{ts} \\cdot C_d \\cdot B_{eff} \\cdot h_{max} \\cdot u_{max}^2$$
        </div>
        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
            <h5 class="font-bold text-gray-800 dark:text-gray-200">Substituição Numérica Passo a Passo (ASCE 7-22 Eq. 6.10-1):</h5>
            ${is_m ? `
                <p>$$F_d = \\frac{0.5 \\times (${rho_val.toFixed(1)}\\text{ kg/m}^3) \\times ${data.Its.toFixed(2)} \\times ${Cd.toFixed(2)} \\times (${B_eff.toFixed(2)}\\text{ m}) \\times (${h.toFixed(2)}\\text{ m}) \\times (${u.toFixed(2)}\\text{ m/s})^2}{1000} = \\mathbf{${forces.drag.force.toFixed(2)}\\text{ kN}}$$</p>
                <p>• <b>Pressão hidrodinâmica média ($q_d$):</b> $q_d = \\frac{1}{2} \\cdot \\rho_s \\cdot I_{ts} \\cdot C_d \\cdot u_{max}^2 = \\frac{0.5 \\times ${rho_val.toFixed(1)} \\times ${data.Its.toFixed(2)} \\times ${Cd.toFixed(2)} \\times (${u.toFixed(2)})^2}{1000} = \\mathbf{${forces.drag.pressure.toFixed(2)}\\text{ kPa}}$</p>
            ` : `
                <p>$$F_d = \\frac{0.5 \\times (${rho_mass_slugs.toFixed(3)}\\text{ slugs/ft}^3) \\times ${data.Its.toFixed(2)} \\times ${Cd.toFixed(2)} \\times (${B_eff.toFixed(2)}\\text{ ft}) \\times (${h.toFixed(2)}\\text{ ft}) \\times (${u.toFixed(2)}\\text{ ft/s})^2}{1000} = \\mathbf{${forces.drag.force.toFixed(2)}\\text{ kips}}$$</p>
                <p>• <b>Pressão hidrodinâmica média ($q_d$):</b> $q_d = 0.5 \\times ${rho_mass_slugs.toFixed(3)} \\times ${data.Its.toFixed(2)} \\times ${Cd.toFixed(2)} \\times (${u.toFixed(2)})^2 = \\mathbf{${forces.drag.pressure.toFixed(2)}\\text{ psf}}$</p>
            `}
            <p>• <b>Fator de Importância ($I_{ts}$):</b> $I_{ts} = ${data.Its.toFixed(2)}$ (Categoria de Risco ${data.risk_category} per Tab. 6.8-1).</p>
            <p>• <b>Ponto de aplicação da resultante (centroide retangular):</b> $z_d = \\frac{h_{max}}{2} = \\frac{${h.toFixed(2)}}{2} = \\mathbf{${forces.drag.arm.toFixed(2)}\\text{ ${l_unit}}}$ a partir da base.</p>
            <p>• <b>Momento de tombamento na base:</b> $M_d = F_d \\cdot z_d = ${forces.drag.force.toFixed(2)}\\text{ ${f_unit}} \\times ${forces.drag.arm.toFixed(2)}\\text{ ${l_unit}} = \\mathbf{${forces.drag.moment.toFixed(1)}\\text{ }${m_unit_latex}}$</p>
        </div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">
            <b>Suposições Normativas:</b> Considera escoamento uniforme quase-estático com perfil de velocidades verticalmente homogêneo e coeficiente de forma $C_d = ${Cd.toFixed(2)}$ calibrado em ensaios em canal de ondas.
        </div>
    </div>
    `;
    report.addSection("3. Memória de Cálculo: Arrasto Hidrodinâmico ($F_d$ - Sec. 6.10.2)", sec3Html, "tsunami-sec-drag");

    // =========================================================================
    // SEÇÃO 4: SURTO HIDRODINÂMICO (BORE SURGE FS)
    // =========================================================================
    const sec4Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <p class="text-gray-600 dark:text-gray-300">
            Quando a onda de tsunami se propaga como um ressalto hidráulico ou onda quebrando (bore), o impacto inicial na chegada da frente de onda gera forças dinâmicas impulsivas amplificadas antes da estabilização do fluxo estacionário (ASCE 7-22 Seção 6.10.1):
        </p>
        <div class="p-2.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 font-mono text-center text-sm my-2">
            $$F_s = 1.5 \\cdot F_d$$
        </div>
        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
            <h5 class="font-bold text-gray-800 dark:text-gray-200">Substituição Numérica:</h5>
            ${forces.surge.applicable ? `
                <p>$$F_s = 1.5 \\times (${forces.drag.force.toFixed(2)}\\text{ ${f_unit}}) = \\mathbf{${forces.surge.force.toFixed(2)}\\text{ ${f_unit}}}$$</p>
                <p>• <b>Braço de alavanca da resultante:</b> $z_s = \\frac{h_{max}}{2} = \\mathbf{${forces.surge.arm.toFixed(2)}\\text{ ${l_unit}}}$</p>
                <p>• <b>Momento de tombamento na base:</b> $M_s = F_s \\cdot z_s = ${forces.surge.force.toFixed(2)} \\times ${forces.surge.arm.toFixed(2)} = \\mathbf{${forces.surge.moment.toFixed(1)}\\text{ }${m_unit_latex}}$</p>
            ` : `
                <p class="text-gray-500 italic">Efeito de surto desativado nas opções de cálculo ($F_s = 0.0\\text{ ${f_unit}}$).</p>
            `}
        </div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">
            <b>Suposições Normativas:</b> O fator 1.5 modela o surto impulsivo transitório (momentum surge) com base nas equações de conservação de quantidade de movimento aplicadas à frente bore com desprendimento turbulento.
        </div>
    </div>
    `;
    report.addSection("4. Memória de Cálculo: Surto Hidrodinâmico (Bore Surge $F_s$ - Sec. 6.10.1)", sec4Html, "tsunami-sec-surge");

    // =========================================================================
    // SEÇÃO 5: EMPUXO HIDROSTÁTICO (FH)
    // =========================================================================
    const sec5Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <p class="text-gray-600 dark:text-gray-300">
            A força hidrostática atua devido ao acúmulo de lâmina d'água represada contra a face da estrutura, considerando eventual desnível entre a cota externa inundada e o nível interno da edificação (ASCE 7-22 Seção 6.9.1):
        </p>
        <div class="p-2.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 font-mono text-center text-sm my-2">
            $$F_h = \\frac{1}{2} \\cdot \\gamma_s \\cdot B \\cdot (h_{max}^2 - h_{int}^2)$$
        </div>
        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
            <h5 class="font-bold text-gray-800 dark:text-gray-200">Substituição Numérica Passo a Passo:</h5>
            <p>• <b>Pressão hidrostática líquida na base:</b> $p_{h,base} = \\gamma_s \\cdot (h_{max} - h_{int}) = ${gamma_s.toFixed(2)} \\times (${h.toFixed(2)} - ${h_int.toFixed(2)}) = \\mathbf{${forces.hydrostatic.pressure_base.toFixed(2)}\\text{ ${p_unit}}}$</p>
            ${is_m ? `
                <p>$$F_h = 0.5 \\times (${gamma_s.toFixed(3)}\\text{ kN/m}^3) \\times (${B.toFixed(2)}\\text{ m}) \\times [(${h.toFixed(2)})^2 - (${h_int.toFixed(2)})^2] = \\mathbf{${forces.hydrostatic.force.toFixed(2)}\\text{ kN}}$$</p>
            ` : `
                <p>$$F_h = \\frac{0.5 \\times (${gamma_s.toFixed(1)}\\text{ lb/ft}^3) \\times (${B.toFixed(2)}\\text{ ft}) \\times [(${h.toFixed(2)})^2 - (${h_int.toFixed(2)})^2]}{1000} = \\mathbf{${forces.hydrostatic.force.toFixed(2)}\\text{ kips}}$$</p>
            `}
            <p>• <b>Ponto de aplicação (centroide triangular):</b> $z_h = \\frac{h_{max}}{3} = \\frac{${h.toFixed(2)}}{3} = \\mathbf{${forces.hydrostatic.arm.toFixed(2)}\\text{ ${l_unit}}}$ a partir da base.</p>
            <p>• <b>Momento hidrostático na base:</b> $M_h = F_h \\cdot z_h = ${forces.hydrostatic.force.toFixed(2)}\\text{ ${f_unit}} \\times ${forces.hydrostatic.arm.toFixed(2)}\\text{ ${l_unit}} = \\mathbf{${forces.hydrostatic.moment.toFixed(1)}\\text{ }${m_unit_latex}}$</p>
        </div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">
            <b>Suposições Normativas:</b> Considera distribuição hidrostática linear do fluido saturado de sedimentos com gravidade local e nível interno retido $h_{int} = ${h_int.toFixed(2)}\\text{ ${l_unit}}$.
        </div>
    </div>
    `;
    report.addSection("5. Memória de Cálculo: Empuxo Hidrostático Desbalanceado ($F_h$ - Sec. 6.9.1)", sec5Html, "tsunami-sec-hydrostatic");

    // =========================================================================
    // SEÇÃO 6: FLOTAÇÃO E UPLIFT ASCENDENTE (FB)
    // =========================================================================
    const sec6Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <p class="text-gray-600 dark:text-gray-300">
            O empuxo de flotação vertical ascendente atua sobre o volume submerso da estrutura conforme o Princípio de Arquimedes com fluido denso (ASCE 7-22 Seção 6.9.2):
        </p>
        <div class="p-2.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 font-mono text-center text-sm my-2">
            $$F_b = \\gamma_s \\cdot V_{sub}$$
        </div>
        <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
            <h5 class="font-bold text-gray-800 dark:text-gray-200">Substituição Numérica:</h5>
            ${is_m ? `
                <p>$$F_b = (${gamma_s.toFixed(3)}\\text{ kN/m}^3) \\times (${V_sub.toFixed(2)}\\text{ m}^3) = \\mathbf{${forces.buoyancy.force.toFixed(2)}\\text{ kN}}$$ (Força vertical ascendente / Uplift)</p>
            ` : `
                <p>$$F_b = \\frac{(${gamma_s.toFixed(1)}\\text{ lb/ft}^3) \\times (${V_sub.toFixed(2)}\\text{ ft}^3)}{1000} = \\mathbf{${forces.buoyancy.force.toFixed(2)}\\text{ kips}}$$ (Força vertical ascendente / Uplift)</p>
            `}
        </div>
        <div class="text-[11px] text-gray-500 dark:text-gray-400">
            <b>Alerta de Engenharia Geotécnica:</b> Essa força vertical reduz a carga axial estabilizante das fundações. Deve ser garantido peso próprio ou ancoragem com fator de segurança contra arranque $\\ge 1.50$.
        </div>
    </div>
    `;
    report.addSection("6. Memória de Cálculo: Flotação Ascendente ($F_b$ - Sec. 6.9.2)", sec6Html, "tsunami-sec-buoyancy");

    // =========================================================================
    // SEÇÃO 7: IMPACTO DINÂMICO DE DETRITOS (FI)
    // =========================================================================
    const sec7Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <p class="text-gray-600 dark:text-gray-300">
            O carregamento impulsivo de impacto de detritos flutuantes carreados pelo fluxo do tsunami sobre elementos verticais é calculado conforme a formulação dinâmica do ASCE 7-22 Seção 6.11:
        </p>
        <div class="p-2.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 font-mono text-center text-sm my-2">
            $$F_i = I_{ts} \\cdot C_o \\cdot u_{max} \\cdot \\sqrt{k \\cdot m}$$
        </div>
        ${forces.debris.applicable ? `
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <h5 class="font-bold text-gray-800 dark:text-gray-200">Parâmetros e Rigidez do Sistema Colidente:</h5>
                <p>• <b>Detrito Padronizado:</b> ${inputs.tsunami_debris_type} (${W_debris.toFixed(0)} ${is_m ? 'kg' : 'lb'})</p>
                <p>• <b>Massa do Detrito ($m$):</b> $m = ${m_mass.toFixed(1)}\\text{ ${m_mass_unit}}$</p>
                <p>• <b>Rigidez do Detrito ($k_d$):</b> $k_d = ${k_debris.toFixed(0)}\\text{ ${k_unit}}$</p>
                <p>• <b>Rigidez do Elemento Estrutural ($k_s$):</b> ${target_stiffness === 'rigid' ? 'Alvo Indeformável ($k_s \\to \\infty$)' : 'Alvo Deformável ($k_s \\approx k_d$)'}</p>
                <p>• <b>Rigidez Efetiva do Impacto ($k$):</b> $k = (1/k_d + 1/k_s)^{-1} = \\mathbf{${(k_eff / (is_m ? 1000 : 1)).toFixed(0)}\\text{ ${k_unit}}}$</p>
                <p>• <b>Fator de Orientação ($C_o$):</b> $C_o = ${Co.toFixed(2)}$</p>
                <p>• <b>Fator de Importância ($I_{ts}$):</b> $I_{ts} = ${data.Its.toFixed(2)}$</p>
                
                <h5 class="font-bold text-gray-800 dark:text-gray-200 pt-2 border-t dark:border-gray-700">Substituição Numérica:</h5>
                <p>$$F_i = ${data.Its.toFixed(2)} \\times ${Co.toFixed(2)} \\times (${u.toFixed(2)}\\text{ ${v_unit}}) \\times \\sqrt{${k_eff.toFixed(0)} \\times ${m_mass.toFixed(1)}} = \\mathbf{${forces.debris.force.toFixed(2)}\\text{ ${f_unit}}}$$</p>
                <p>• <b>Duração do Pulso de Colisão ($t_d$):</b> $t_d = \\frac{\\pi}{2} \\cdot \\sqrt{\\frac{m}{k}} = \\frac{\\pi}{2} \\cdot \\sqrt{\\frac{${m_mass.toFixed(1)}}{${k_eff.toFixed(0)}}} = \\mathbf{${(forces.debris.duration_s * 1000).toFixed(1)}\\text{ ms}}$</p>
                <p>• <b>Impulso Integral ($J$):</b> $J = \\frac{2}{\\pi} \\cdot F_i \\cdot t_d = \\mathbf{${forces.debris.impulse.toFixed(1)}\\text{ }${impulse_unit_latex}}$</p>
                <p>• <b>Ponto de Aplicação ($z_i$):</b> O detrito flutua na superfície livre: $z_i = h_{max} = \\mathbf{${forces.debris.arm.toFixed(2)}\\text{ ${l_unit}}}$ a partir da base.</p>
                <p>• <b>Momento de Tombamento por Impacto:</b> $M_i = F_i \\cdot z_i = ${forces.debris.force.toFixed(2)} \\times ${forces.debris.arm.toFixed(2)} = \\mathbf{${forces.debris.moment.toFixed(1)}\\text{ }${m_unit_latex}}$</p>
            </div>
        ` : `
            <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 italic">
                Cálculo de impacto de detritos desativado pelo usuário ($F_i = 0.0\\text{ ${f_unit}}$).
            </div>
        `}
        <div class="text-[11px] text-gray-500 dark:text-gray-400">
            <b>Suposições Normativas:</b> Considera impacto frontal linear elástico de curta duração de um detrito rígido/deformável transladando à velocidade do fluxo de crista $u_{max}$.
        </div>
    </div>
    `;
    report.addSection("7. Memória de Cálculo: Impacto Dinâmico de Detritos ($F_i$ - Sec. 6.11)", sec7Html, "tsunami-sec-debris");

    // =========================================================================
    // SEÇÃO 8: COMBINAÇÕES NORMATIVAS E CASO GOVERNANTE (SEC. 6.12)
    // =========================================================================
    const c1_lat = cases.steady_flow.lateral;
    const c1_mom = cases.steady_flow.moment;
    const c2_lat = cases.bore_surge.lateral;
    const c2_mom = cases.bore_surge.moment;
    const c3_lat = cases.debris_impact.lateral;
    const c3_mom = cases.debris_impact.moment;

    const sec8Html = `
    <div class="space-y-3 text-xs leading-relaxed">
        <p class="text-gray-600 dark:text-gray-300">
            A norma ASCE 7-22 Seção 6.12 prescreve que o elemento estrutural e as fundações devem ser dimensionados para a condição que gerar a <b>força lateral crítica máxima</b> dentre os 3 casos de carregamento simultâneos:
        </p>

        <div class="overflow-x-auto">
            <table class="w-full results-table eng-table text-xs">
                <thead>
                    <tr class="bg-gray-100 dark:bg-gray-700">
                        <th class="p-2 text-left">Caso Normativo (Sec. 6.12)</th>
                        <th class="p-2 text-left">Equação de Composição</th>
                        <th class="p-2 text-center">Força Nominal</th>
                        <th class="p-2 text-center">Força de Projeto (${results.design_method})</th>
                        <th class="p-2 text-center">Momento de Projeto (${results.design_method})</th>
                        <th class="p-2 text-center">Classificação</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="${c1_lat >= c2_lat && c1_lat >= c3_lat ? 'bg-emerald-50 dark:bg-emerald-950/40 font-bold border-l-4 border-emerald-500' : ''}">
                        <td class="p-2 font-semibold">Caso 1: Escoamento Estacionário</td>
                        <td class="p-2 font-mono text-[11px]">$F_d + F_h$</td>
                        <td class="p-2 text-center font-mono">${c1_lat.toFixed(2)} ${f_unit}</td>
                        <td class="p-2 text-center font-mono font-bold">${(c1_lat * df).toFixed(2)} ${f_unit}</td>
                        <td class="p-2 text-center font-mono">${(c1_mom * df).toFixed(1)} ${m_unit}</td>
                        <td class="p-2 text-center">${c1_lat >= c2_lat && c1_lat >= c3_lat ? '<span class="text-emerald-600 dark:text-emerald-400 font-extrabold">★ CRÍTICO / GOVERNANTE</span>' : 'Verificado'}</td>
                    </tr>
                    <tr class="${c2_lat > c1_lat && c2_lat >= c3_lat ? 'bg-emerald-50 dark:bg-emerald-950/40 font-bold border-l-4 border-emerald-500' : ''}">
                        <td class="p-2 font-semibold">Caso 2: Surto Frontal (Bore Surge)</td>
                        <td class="p-2 font-mono text-[11px]">$F_s + F_h$</td>
                        <td class="p-2 text-center font-mono">${c2_lat.toFixed(2)} ${f_unit}</td>
                        <td class="p-2 text-center font-mono font-bold">${(c2_lat * df).toFixed(2)} ${f_unit}</td>
                        <td class="p-2 text-center font-mono">${(c2_mom * df).toFixed(1)} ${m_unit}</td>
                        <td class="p-2 text-center">${c2_lat > c1_lat && c2_lat >= c3_lat ? '<span class="text-emerald-600 dark:text-emerald-400 font-extrabold">★ CRÍTICO / GOVERNANTE</span>' : (forces.surge.applicable ? 'Verificado' : 'Desativado')}</td>
                    </tr>
                    <tr class="${c3_lat >= c2_lat && c3_lat > c1_lat ? 'bg-emerald-50 dark:bg-emerald-950/40 font-bold border-l-4 border-emerald-500' : ''}">
                        <td class="p-2 font-semibold">Caso 3: Impacto de Detritos em Fluxo</td>
                        <td class="p-2 font-mono text-[11px]">$F_d + F_h + F_i$</td>
                        <td class="p-2 text-center font-mono">${c3_lat.toFixed(2)} ${f_unit}</td>
                        <td class="p-2 text-center font-mono font-bold">${(c3_lat * df).toFixed(2)} ${f_unit}</td>
                        <td class="p-2 text-center font-mono">${(c3_mom * df).toFixed(1)} ${m_unit}</td>
                        <td class="p-2 text-center">${c3_lat >= c2_lat && c3_lat > c1_lat ? '<span class="text-emerald-600 dark:text-emerald-400 font-extrabold">★ CRÍTICO / GOVERNANTE</span>' : (forces.debris.applicable ? 'Verificado' : 'Desativado')}</td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2">
            <h5 class="font-bold text-sm text-blue-900 dark:text-blue-100">Resultado Final de Dimensionamento (${results.design_method}):</h5>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                <div class="p-2 bg-white dark:bg-gray-800 rounded shadow-2xs">
                    <div class="text-[10px] text-gray-500 uppercase">Força de Projeto ($T_s$)</div>
                    <div class="text-base font-black text-blue-600 dark:text-blue-400">${results.Ts_design.toFixed(2)} ${f_unit}</div>
                </div>
                <div class="p-2 bg-white dark:bg-gray-800 rounded shadow-2xs">
                    <div class="text-[10px] text-gray-500 uppercase">Momento na Base ($M$)</div>
                    <div class="text-base font-black text-purple-600 dark:text-purple-400">${results.M_design.toFixed(1)} ${m_unit}</div>
                </div>
                <div class="p-2 bg-white dark:bg-gray-800 rounded shadow-2xs">
                    <div class="text-[10px] text-gray-500 uppercase">Pressão Equivalente ($q$)</div>
                    <div class="text-base font-black text-emerald-600 dark:text-emerald-400">${results.q_equiv_design.toFixed(2)} ${p_unit}</div>
                </div>
                <div class="p-2 bg-white dark:bg-gray-800 rounded shadow-2xs">
                    <div class="text-[10px] text-gray-500 uppercase">Empuxo Vertical ($F_b$)</div>
                    <div class="text-base font-black text-cyan-600 dark:text-cyan-400">${results.Fb_uplift.toFixed(2)} ${f_unit}</div>
                </div>
            </div>
            <p class="text-[11px] text-blue-950 dark:text-blue-200 mt-2">
                • <b>Condição Crítica:</b> <b>${results.governing_case}</b><br>
                • <b>Fórmula da Pressão Lateral Uniforme Equivalente:</b> $q_{equiv,design} = \\frac{T_{s,design}}{A_{wet}} = \\frac{${results.Ts_design.toFixed(2)}}{${A_wet.toFixed(2)}} = \\mathbf{${results.q_equiv_design.toFixed(2)}\\text{ ${p_unit}}}$
            </p>
        </div>
    </div>
    `;
    report.addSection("8. Combinações Normativas e Determinação do Caso Crítico (Sec. 6.12)", sec8Html, "tsunami-sec-cases");

    // =========================================================================
    // SEÇÃO 9: ESTRUTURAS PORTUÁRIAS E CAIS ESTAQUEADO (MESA & ESTACAS)
    // =========================================================================
    const dp = data.deck_and_piles;
    if (dp) {
        const dk = dp.deck;
        const piles = dp.piles || [];

        let pileRowsReport = '';
        piles.forEach((p, idx) => {
            pileRowsReport += `
                <tr>
                    <td class="p-2 font-bold">${p.id}</td>
                    <td class="p-2 text-center font-mono">${p.diameter.toFixed(2)} m</td>
                    <td class="p-2 text-center font-mono">${p.length.toFixed(1)} m</td>
                    <td class="p-2 text-center font-mono">${p.scour_depth > 0 ? `${p.scour_depth.toFixed(1)} m` : '-'}</td>
                    <td class="p-2 text-center font-mono font-semibold">${p.effective_length.toFixed(1)} m</td>
                    <td class="p-2 text-center font-mono font-black text-amber-600">${p.Fw_tf.toFixed(1)} tf <span class="text-[10px] text-gray-500 font-normal">(${p.Fw_kN.toFixed(1)} kN)</span></td>
                    <td class="p-2 text-center font-mono">${p.M_base_tfm.toFixed(1)} tf·m <span class="text-[10px] text-gray-500 font-normal">(${p.M_base_kNm.toFixed(0)} kNm)</span></td>
                </tr>
            `;
        });

        const secWharfHtml = `
        <div class="space-y-4 text-xs leading-relaxed">
            <p class="text-gray-600 dark:text-gray-300">
                Esta seção apresenta a verificação específica para <b>estruturas portuárias de cais estaqueado</b> submersas pelo fluxo de tsunami, contemplando a <b>subpressão hidrodinâmica na mesa do tabuleiro segundo a Equação 6.10-11</b> do ASCE 7, o arraste hidrodinâmico na mesa, o impacto de contêineres e a determinação das forças de arraste individual para estacas de diferentes diâmetros e comprimentos.
            </p>

            <!-- 1. Mesa do Tabuleiro -->
            <div class="p-3 bg-blue-50/70 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 space-y-2">
                <h4 class="font-bold text-xs uppercase tracking-wider text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                    <span>🚢</span> 1. Mesa do Tabuleiro (Deck) — Subpressão, Arraste e Impacto
                </h4>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <!-- Subpressão Eq 6.10-11 -->
                    <div class="p-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-2xs border border-blue-100 dark:border-gray-700">
                        <div class="text-[11px] font-bold text-cyan-800 dark:text-cyan-300">Subpressão Ascendente (Eq. 6.10-11)</div>
                        <div class="text-sm font-black text-cyan-600 dark:text-cyan-400 mt-1">${dk.subpressure_tf_m2.toFixed(2)} tf/m² <span class="text-[11px] font-normal text-gray-500">(${dk.subpressure_kPa.toFixed(1)} kPa)</span></div>
                        <p class="text-[10px] text-gray-500 mt-1">
                            $P_p = 0.5 \cdot \rho_s \cdot I_{ts} \cdot u^2 = 0.5 \cdot ${(rho_val / 1000).toFixed(2)} \cdot ${data.Its.toFixed(2)} \cdot ${u.toFixed(1)}^2 = \mathbf{${dk.subpressure_tf_m2.toFixed(2)}\text{ tf/m}^2}$ (${dk.subpressure_kPa.toFixed(1)}\text{ kPa})<br>
                            Força Total Up: <b>${dk.subpressure_force_tf.toFixed(1)} tf</b> (${dk.subpressure_force_kN.toFixed(0)} kN)
                        </p>
                    </div>

                    <!-- Arraste Linear -->
                    <div class="p-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-2xs border border-blue-100 dark:border-gray-700">
                        <div class="text-[11px] font-bold text-blue-800 dark:text-blue-300">Arraste Linear na Mesa ($F_{dx}$)</div>
                        <div class="text-sm font-black text-blue-600 dark:text-blue-400 mt-1">${dk.Fdx_linear_tf_m.toFixed(1)} tf/m <span class="text-[11px] font-normal text-gray-500">(${dk.Fdx_linear_kN_m.toFixed(1)} kN/m)</span></div>
                        <p class="text-[10px] text-gray-500 mt-1">
                            $F_{dx} = 0.5 \cdot \rho_s \cdot I_{ts} \cdot C_d \cdot C_{sx} \cdot h_{deck} \cdot u^2$<br>
                            Para $h_{deck} = ${dk.deck_height}\text{ m}$: <b>${dk.Fdx_linear_tf_m.toFixed(1)} tf/m</b>
                        </p>
                    </div>

                    <!-- Impacto de Contêiner -->
                    <div class="p-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-2xs border border-blue-100 dark:border-gray-700">
                        <div class="text-[11px] font-bold text-rose-800 dark:text-rose-300">Impacto de Contêiner na Mesa ($F_i$)</div>
                        <div class="text-sm font-black text-rose-600 dark:text-rose-400 mt-1">${dk.container_impact_Fi_tf.toFixed(0)} tf <span class="text-[11px] font-normal text-gray-500">(${dk.container_impact_Fi_kN.toFixed(0)} kN)</span></div>
                        <p class="text-[10px] text-gray-500 mt-1">
                            $F_{ni} = u_{max} \cdot \sqrt{k \cdot m_d} = ${u.toFixed(1)} \cdot \sqrt{${(k_eff).toFixed(0)} \cdot ${m_mass.toFixed(0)}} = \mathbf{${dk.container_impact_Fni_kN.toFixed(0)}\text{ kN}}$<br>
                            $F_i = I_{ts} \cdot C_o \cdot F_{ni} = ${data.Its.toFixed(2)} \cdot 0.65 \cdot ${dk.container_impact_Fni_kN.toFixed(0)} = \mathbf{${dk.container_impact_Fi_kN.toFixed(0)}\text{ kN}} = \mathbf{${dk.container_impact_Fi_tf.toFixed(0)}\text{ tf}}$
                        </p>
                    </div>
                </div>
            </div>

            <!-- 2. Arraste Individual de Estacas -->
            <div class="p-3 bg-amber-50/70 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800 space-y-2">
                <div class="flex items-center justify-between">
                    <h4 class="font-bold text-xs uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <span>🪵</span> 2. Cargas de Arraste Individual de Estacas (Diferentes Diâmetros e Comprimentos)
                    </h4>
                    <span class="text-[11px] font-bold text-amber-800 dark:text-amber-300">Fórmula: $F_w = 0.5 \\cdot \\rho_s \\cdot I_{ts} \\cdot C_d \\cdot b \\cdot h_{eff} \\cdot u^2$</span>
                </div>

                <div class="overflow-x-auto">
                    <table class="w-full results-table eng-table text-xs">
                        <thead>
                            <tr class="bg-amber-100/70 dark:bg-amber-900/50">
                                <th class="p-2 text-left">Estaca</th>
                                <th class="p-2 text-center">Diâmetro ($b$)</th>
                                <th class="p-2 text-center">Compr. ($h_e$)</th>
                                <th class="p-2 text-center">Erosão ($d_{scour}$)</th>
                                <th class="p-2 text-center">Compr. Efetivo</th>
                                <th class="p-2 text-center">Arraste Individual ($F_w$)</th>
                                <th class="p-2 text-center">Momento na Base</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${pileRowsReport}
                        </tbody>
                    </table>
                </div>

                <div class="flex items-center justify-between pt-1 font-bold text-amber-950 dark:text-amber-200">
                    <span>Força Total Acumulada de Arraste em Todas as Estacas ($\\Sigma F_w$):</span>
                    <span class="font-mono text-sm font-black text-amber-700 dark:text-amber-300">${dp.total_pile_drag_tf.toFixed(1)} tf (${dp.total_pile_drag_kN.toFixed(1)} kN)</span>
                </div>
            </div>
        </div>
        `;
        report.addSection("9. Verificação Especial de Cais Estaqueado: Mesa & Estacas (ASCE 7 Sec. 6.10 / Eq. 6.10-11)", secWharfHtml, "tsunami-sec-wharf-piles");
    }

    // =========================================================================
    // SEÇÃO 10: DIRETRIZES TÉCNICAS E RECOMENDAÇÕES ESTRUTURAIS
    // =========================================================================
    const sec10Html = `
    <div class="space-y-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
        <ul class="list-disc list-inside space-y-1.5 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <li><b>Resistência ao Tombamento e Deslizamento:</b> As fundações devem ser dimensionadas para resistir ao momento fletor na base $M_{design} = ${results.M_design.toFixed(1)}\\text{ }${m_unit_latex}$ e força cortante total $T_{s,design} = ${results.Ts_design.toFixed(2)}\\text{ ${f_unit}}$ com fator de segurança geotécnico mínimo de $1.50$.</li>
            <li><b>Ancoragem contra Subpressão e Flotação ($F_b$):</b> A força ascendente de $F_b = ${results.Fb_uplift.toFixed(2)}\\text{ ${f_unit}}$ deve ser equilibrada pelo peso próprio permanente estabilizante minorado ($0.9D$ em LRFD ou $0.6D$ em ASD), ou compensada com estacas tracionadas.</li>
            <li><b>Resistência ao Impacto Local de Detritos (Sec. 6.11):</b> O elemento vertical (pilar/parede) deve possuir detalhamento dútil com armadura de confinamento transversal (estribos fechados) para evitar fratura frágil por cisalhamento ou punção sob a força concentrada de impacto $F_i = ${forces.debris.force.toFixed(2)}\\text{ ${f_unit}}$.</li>
            <li><b>Aberturas para Alívio Hidrostático:</b> Recomenda-se a previsão de aberturas de alívio ou janelas descartáveis no nível inferior para permitir a equalização rápida dos níveis d'água ($h_{int} \\approx h_{max}$), reduzindo o empuxo hidrostático desbalanceado $F_h$.</li>
        </ul>
        <div class="text-[11px] text-gray-500 dark:text-gray-400 italic text-right pt-1">
            Memória gerada em conformidade com as formulações analíticas do ASCE 7-22 Chapter 6.
        </div>
    </div>
    `;
    const recSectionNum = dp ? "10" : "9";
    report.addSection(`${recSectionNum}. Diretrizes Técnicas de Dimensionamento Estrutural (Sec. 6.13 / 6.14)`, sec10Html, "tsunami-sec-recommendations");

    // Renderiza no corpo do modal
    report.render('tsunami-modal-report-body');
    setupModalButtons();
}

function setupModalButtons() {
    const modal = document.getElementById('tsunami-report-modal');
    if (!modal) return;

    const closeModal = () => {
        modal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    };

    const closeBtn = document.getElementById('modal-close-btn');
    if (closeBtn) closeBtn.onclick = closeModal;

    const footerCloseBtn = document.getElementById('modal-footer-close-btn');
    if (footerCloseBtn) footerCloseBtn.onclick = closeModal;

    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };

    const handleEsc = (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeModal();
            window.removeEventListener('keydown', handleEsc);
        }
    };
    window.addEventListener('keydown', handleEsc);

    const pdfBtn = document.getElementById('modal-download-pdf-btn');
    if (pdfBtn) {
        pdfBtn.onclick = () => {
            if (typeof handleDownloadPdf === 'function') {
                handleDownloadPdf('tsunami-modal-report-content', 'Relatorio_Cargas_Tsunami_ASCE7.pdf');
            } else {
                window.print();
            }
        };
    }

    const wordBtn = document.getElementById('modal-download-word-btn');
    if (wordBtn) {
        wordBtn.onclick = () => {
            if (typeof handleDownloadWord === 'function') {
                handleDownloadWord('tsunami-modal-report-content', 'Relatorio_Cargas_Tsunami_ASCE7.doc');
            } else {
                alert("Download Word não disponível.");
            }
        };
    }

    const copyBtn = document.getElementById('modal-copy-btn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            if (typeof handleCopy === 'function') {
                handleCopy('tsunami-modal-report-content');
            }
        };
    }
}

initializeApp({
    inputIds: tsunamiInputIds,
    buttonId: 'run-tsunami-calculation-btn',
    calculationHandler: handleRunTsunamiCheck,
    onReady: () => {
        const unitSelect = document.getElementById('tsunami_unit_system');
        const debrisToggle = document.getElementById('tsunami_include_debris');
        const dammingToggle = document.getElementById('tsunami_include_damming');
        const shapeSelect = document.getElementById('tsunami_member_shape');
        const debrisPresetSelect = document.getElementById('tsunami_debris_type');

        const updateUnitBadges = (unit) => {
            const is_m = (unit === 'metric');
            document.querySelectorAll('.tsunami-l-unit').forEach(el => el.textContent = is_m ? '[m]' : '[ft]');
            document.querySelectorAll('.tsunami-v-unit').forEach(el => el.textContent = is_m ? '[m/s]' : '[ft/s]');
            document.querySelectorAll('.tsunami-rho-unit').forEach(el => el.textContent = is_m ? '[kg/m³]' : '[lb/ft³]');
            document.querySelectorAll('.tsunami-vol-unit').forEach(el => el.textContent = is_m ? '[m³]' : '[ft³]');
            document.querySelectorAll('.tsunami-w-unit').forEach(el => el.textContent = is_m ? '[kg]' : '[lb]');
            document.querySelectorAll('.tsunami-k-unit').forEach(el => el.textContent = is_m ? '[kN/m]' : '[lb/ft]');

            // Update Dynamic Guidance Banner
            const banner = document.getElementById('unit-system-banner');
            const icon = document.getElementById('unit-system-banner-icon');
            const title = document.getElementById('unit-system-banner-title');
            const desc = document.getElementById('unit-system-banner-desc');
            if (banner && icon && title && desc) {
                if (is_m) {
                    banner.className = "mt-4 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-400 dark:border-emerald-600 text-xs transition-all shadow-xs";
                    icon.textContent = "🌍";
                    title.textContent = "Sistema de Unidades Ativo: Métrico (SI) — Insira em Unidades Métricas";
                    title.className = "font-extrabold text-emerald-950 dark:text-emerald-100 text-xs";
                    desc.className = "text-emerald-900 dark:text-emerald-200 mt-1 leading-relaxed";
                    desc.innerHTML = "Todos os campos esperam valores no <b>Sistema Internacional (SI)</b>: profundidade em <b>metros [m]</b>, velocidade em <b>[m/s]</b>, densidade em <b>[kg/m³]</b> (ex: 1.200), massa em <b>[kg]</b> e rigidez em <b>[kN/m]</b>. As forças calculadas serão apresentadas em <b>kN</b>, momentos em <b>kN·m</b> e pressões em <b>kPa</b>.";
                } else {
                    banner.className = "mt-4 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border-2 border-blue-400 dark:border-blue-600 text-xs transition-all shadow-xs";
                    icon.textContent = "🇺🇸";
                    title.textContent = "Sistema de Unidades Ativo: Imperial (US Customary) — Insira em Unidades Imperiais";
                    title.className = "font-extrabold text-blue-950 dark:text-blue-100 text-xs";
                    desc.className = "text-blue-900 dark:text-blue-200 mt-1 leading-relaxed";
                    desc.innerHTML = "Todos os campos esperam valores em <b>Unidades Imperiais</b>: profundidade em <b>pés [ft]</b>, velocidade em <b>[ft/s]</b>, densidade/peso específico em <b>[lb/ft³]</b> (ex: 75), peso do detrito em <b>[lb]</b> e rigidez em <b>[lb/ft]</b>. As forças calculadas serão em <b>kips</b> e pressões em <b>psf</b>.";
                }
            }

            // Update specific labels and hints for fluid & debris
            const rhoLabel = document.getElementById('tsunami_fluid_density_label');
            if (rhoLabel) {
                rhoLabel.textContent = is_m ? "Massa Específica / Densidade do Fluido (ρs)" : "Peso Específico do Fluido com Sedimento (γs)";
            }
            const debrisLabel = document.getElementById('tsunami_debris_mass_label');
            if (debrisLabel) {
                debrisLabel.textContent = is_m ? "Massa do Detrito (m)" : "Peso do Detrito (W)";
            }

            // Update input placeholders
            const placeholders = {
                'tsunami_inundation_depth': is_m ? '3.0 (m)' : '10.0 (ft)',
                'tsunami_flow_velocity': is_m ? '4.5 (m/s)' : '15.0 (ft/s)',
                'tsunami_fluid_density': is_m ? '1200.0 (kg/m³)' : '75.0 (lb/ft³)',
                'tsunami_internal_depth': is_m ? '0.0 (m)' : '0.0 (ft)',
                'tsunami_submerged_volume': is_m ? '8.5 (m³)' : '300.0 (ft³)',
                'tsunami_component_width': is_m ? '4.5 (m)' : '15.0 (ft)',
                'tsunami_damming_width': is_m ? '3.0 (m)' : '10.0 (ft)',
                'tsunami_debris_mass': is_m ? '454 (kg)' : '1000 (lb)',
                'tsunami_debris_stiffness': is_m ? '19200 (kN/m)' : '1320000 (lb/ft)'
            };
            Object.entries(placeholders).forEach(([id, ph]) => {
                const el = document.getElementById(id);
                if (el) el.placeholder = ph;
            });
        };

        if (unitSelect) {
            let currentUnit = unitSelect.value || 'imperial';
            updateUnitBadges(currentUnit);

            unitSelect.addEventListener('change', (e) => {
                const newUnit = e.target.value;
                if (newUnit === currentUnit) return;

                const lFactor = (newUnit === 'metric') ? 0.3048 : (1.0 / 0.3048);
                const rhoFactor = (newUnit === 'metric') ? 16.018463 : (1.0 / 16.018463);
                const volFactor = (newUnit === 'metric') ? 0.0283168 : (1.0 / 0.0283168);
                const wFactor = (newUnit === 'metric') ? 0.453592 : (1.0 / 0.453592);
                const kFactor = (newUnit === 'metric') ? 0.0145939 : (1.0 / 0.0145939);

                // Length & velocity
                const lFields = ['tsunami_inundation_depth', 'tsunami_internal_depth', 'tsunami_component_width', 'tsunami_damming_width', 'tsunami_flow_velocity'];
                lFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.value !== '') {
                        const val = parseFloat(el.value);
                        if (!isNaN(val) && val !== 0) el.value = (val * lFactor).toFixed(2);
                    }
                });

                // Density
                const rhoEl = document.getElementById('tsunami_fluid_density');
                if (rhoEl && rhoEl.value !== '') {
                    const val = parseFloat(rhoEl.value);
                    if (!isNaN(val) && val !== 0) rhoEl.value = (val * rhoFactor).toFixed(1);
                }

                // Submerged volume
                const volEl = document.getElementById('tsunami_submerged_volume');
                if (volEl && volEl.value !== '') {
                    const val = parseFloat(volEl.value);
                    if (!isNaN(val) && val !== 0) volEl.value = (val * volFactor).toFixed(2);
                }

                // Debris mass & stiffness
                const massEl = document.getElementById('tsunami_debris_mass');
                if (massEl && massEl.value !== '') {
                    const val = parseFloat(massEl.value);
                    if (!isNaN(val) && val !== 0) massEl.value = (val * wFactor).toFixed(0);
                }

                const stiffEl = document.getElementById('tsunami_debris_stiffness');
                if (stiffEl && stiffEl.value !== '') {
                    const val = parseFloat(stiffEl.value);
                    if (!isNaN(val) && val !== 0) stiffEl.value = (val * kFactor).toFixed(0);
                }

                currentUnit = newUnit;
                updateUnitBadges(newUnit);
                document.getElementById('run-tsunami-calculation-btn')?.click();
            });
        }

        // Debris checkbox toggle
        if (debrisToggle) {
            debrisToggle.addEventListener('change', (e) => {
                const container = document.getElementById('debris-inputs-container');
                if (container) {
                    if (e.target.checked) {
                        container.classList.remove('hidden');
                    } else {
                        container.classList.add('hidden');
                    }
                }
            });
        }

        // Damming checkbox toggle
        if (dammingToggle) {
            dammingToggle.addEventListener('change', (e) => {
                const options = document.getElementById('damming-options');
                if (options) {
                    if (e.target.checked) {
                        options.classList.remove('hidden');
                    } else {
                        options.classList.add('hidden');
                    }
                }
            });
        }

        // Member shape change
        if (shapeSelect) {
            shapeSelect.addEventListener('change', (e) => {
                const shape = e.target.value;
                const cdInput = document.getElementById('tsunami_drag_coefficient');
                if (!cdInput) return;
                switch (shape) {
                    case 'wall':
                    case 'square_column':
                        cdInput.value = '2.0';
                        break;
                    case 'round_column':
                        cdInput.value = '1.2';
                        break;
                    case 'diamond':
                        cdInput.value = '1.6';
                        break;
                    default:
                        break;
                }
            });
        }

        // Debris preset change
        if (debrisPresetSelect) {
            debrisPresetSelect.addEventListener('change', (e) => {
                const type = e.target.value;
                if (type === 'custom') return;
                const unit = document.getElementById('tsunami_unit_system')?.value || 'imperial';
                const preset = debrisPresets[unit]?.[type];
                if (preset) {
                    const massEl = document.getElementById('tsunami_debris_mass');
                    const stiffEl = document.getElementById('tsunami_debris_stiffness');
                    if (massEl) massEl.value = preset.mass;
                    if (stiffEl) stiffEl.value = preset.stiffness;
                }
            });
        }

        // Initialize piles table
        renderPilesTable();
    }
});
