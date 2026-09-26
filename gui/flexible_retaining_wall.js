/**
 * Flexible Retaining Walls (Sheet Piles / Diaphragm Walls) Controller & 2D Renderer
 * Powered by Blum's Free Earth Support Method, NBR 8800, NBR 6118 & ArcelorMittal catalogs
 */

let flexWallData = null;

// Default stratigraphy layers
let stratigraphyLayers = [
    { id: 1, name: 'Camada 1: Aterro Arenoso', thickness: 2.5, gamma: 17.0, gamma_sat: 18.0, phi: 30.0, cohesion: 0.0, color: '#d97706' },
    { id: 2, name: 'Camada 2: Argila Siltosa', thickness: 3.5, gamma: 18.5, gamma_sat: 19.5, phi: 24.0, cohesion: 15.0, color: '#854d0e' },
    { id: 3, name: 'Camada 3: Areia Compacta', thickness: 8.0, gamma: 20.0, gamma_sat: 21.0, phi: 36.0, cohesion: 2.0, color: '#0d9488' }
];

// ArcelorMittal Commercial Sheet Pile Catalog (Larssen & Z profiles)
const SHEET_PILE_CATALOG_JS = {
    'PU 12 (Larssen)': { W_el: 1200, I_x: 21600, weight: 89.6, t_w: 8.5, h: 360 },
    'PU 18 (Larssen)': { W_el: 1800, I_x: 38400, weight: 118.0, t_w: 10.0, h: 430 },
    'PU 22 (Larssen)': { W_el: 2200, I_x: 49500, weight: 133.0, t_w: 11.2, h: 450 },
    'PU 28 (Larssen)': { W_el: 2800, I_x: 65800, weight: 152.0, t_w: 13.0, h: 452 },
    'PU 32 (Larssen)': { W_el: 3200, I_x: 78400, weight: 168.0, t_w: 14.5, h: 452 },
    'AU 14': { W_el: 1400, I_x: 28600, weight: 104.0, t_w: 8.5, h: 408 },
    'AU 18': { W_el: 1800, I_x: 39600, weight: 120.0, t_w: 9.7, h: 441 },
    'AU 20': { W_el: 2000, I_x: 44300, weight: 128.0, t_w: 10.0, h: 443 },
    'AU 25': { W_el: 2500, I_x: 56000, weight: 147.0, t_w: 12.0, h: 447 },
    'AZ 18-700': { W_el: 1800, I_x: 37800, weight: 102.5, t_w: 8.5, h: 420 },
    'AZ 26-700': { W_el: 2600, I_x: 60500, weight: 128.5, t_w: 11.5, h: 460 },
    'AZ 36-700N': { W_el: 3600, I_x: 95400, weight: 161.0, t_w: 13.0, h: 499 },
    'AZ 46-700N': { W_el: 4600, I_x: 133400, weight: 195.0, t_w: 15.0, h: 503 }
};

document.addEventListener('DOMContentLoaded', () => {
    initFlexibleWall();
});

function initFlexibleWall() {
    renderStratigraphyLayers();
    toggleFlexibleSupport();
    toggleFlexibleLengthMode();
    toggleFlexibleSoilMode();
    onFlexibleWallTypeChange();
    toggleFlexibleSectionMode();

    const flexInputs = document.querySelectorAll('#flexible-wall-form input, #flexible-wall-form select');
    flexInputs.forEach(input => {
        input.removeEventListener('input', onFlexibleInputChange);
        input.removeEventListener('change', onFlexibleInputChange);
        input.addEventListener('input', onFlexibleInputChange);
        input.addEventListener('change', onFlexibleInputChange);
    });

    triggerFlexibleCalculation();
}

function onFlexibleInputChange() {
    updateEmbedmentPreview();
    triggerFlexibleCalculation();
}

function toggleFlexibleSupport() {
    const isAnchored = document.getElementById('flex_is_anchored')?.value === 'true';
    const anchorRow = document.getElementById('flex_anchor_depth_row');
    if (anchorRow) {
        if (isAnchored) {
            anchorRow.classList.remove('hidden');
        } else {
            anchorRow.classList.add('hidden');
        }
    }
    triggerFlexibleCalculation();
}

function toggleFlexibleLengthMode() {
    const mode = document.getElementById('flex_length_mode')?.value || 'auto';
    const totalRow = document.getElementById('flex_total_length_row');
    if (totalRow) {
        if (mode === 'manual') {
            totalRow.classList.remove('hidden');
            updateEmbedmentPreview();
        } else {
            totalRow.classList.add('hidden');
        }
    }
    triggerFlexibleCalculation();
}

function updateEmbedmentPreview() {
    const H = parseFloat(document.getElementById('flex_H')?.value || 5.0);
    const L = parseFloat(document.getElementById('flex_total_length')?.value || 8.0);
    const previewEl = document.getElementById('flex_calc_embedment_preview');
    if (previewEl) {
        const D = Math.max(0.1, L - H);
        previewEl.innerText = D.toFixed(2);
    }
}

function toggleFlexibleSoilMode() {
    const soilMode = document.getElementById('flex_soil_mode')?.value || 'homogenous';
    const homCont = document.getElementById('flex_homogenous_soil_container');
    const stratCont = document.getElementById('flex_stratified_soil_container');

    if (soilMode === 'stratified') {
        homCont?.classList.add('hidden');
        stratCont?.classList.remove('hidden');
    } else {
        homCont?.classList.remove('hidden');
        stratCont?.classList.add('hidden');
    }
    triggerFlexibleCalculation();
}

function onFlexibleWallTypeChange() {
    const wallType = document.getElementById('flex_wall_type')?.value || 'sheet_pile';
    const steelPanel = document.getElementById('flex_steel_section_panel');
    const concPanel = document.getElementById('flex_concrete_section_panel');
    const steelCard = document.getElementById('flex-steel-section-card');
    const concCard = document.getElementById('flex-concrete-section-card');

    if (wallType === 'sheet_pile') {
        steelPanel?.classList.remove('hidden');
        concPanel?.classList.add('hidden');
        steelCard?.classList.remove('hidden');
        concCard?.classList.add('hidden');
    } else {
        steelPanel?.classList.add('hidden');
        concPanel?.classList.remove('hidden');
        steelCard?.classList.add('hidden');
        concCard?.classList.remove('hidden');
    }
    triggerFlexibleCalculation();
}

function toggleFlexibleSectionMode() {
    const mode = document.getElementById('flex_section_mode')?.value || 'catalog';
    const catRow = document.getElementById('flex_catalog_select_row');
    const custRow = document.getElementById('flex_custom_name_row');

    if (mode === 'catalog') {
        catRow?.classList.remove('hidden');
        custRow?.classList.add('hidden');
        onFlexibleProfileSelected();
    } else if (mode === 'custom') {
        catRow?.classList.add('hidden');
        custRow?.classList.remove('hidden');
    } else { // auto
        catRow?.classList.add('hidden');
        custRow?.classList.add('hidden');
    }
    triggerFlexibleCalculation();
}

function onFlexibleProfileSelected() {
    const sel = document.getElementById('flex_profile_catalog')?.value;
    if (sel && SHEET_PILE_CATALOG_JS[sel]) {
        const p = SHEET_PILE_CATALOG_JS[sel];
        const welEl = document.getElementById('flex_sec_wel');
        const ixEl = document.getElementById('flex_sec_ix');
        const hEl = document.getElementById('flex_sec_h');
        const twEl = document.getElementById('flex_sec_tw');
        const massEl = document.getElementById('flex_sec_mass');

        if (welEl) welEl.value = p.W_el;
        if (ixEl) ixEl.value = p.I_x;
        if (hEl) hEl.value = p.h;
        if (twEl) twEl.value = p.t_w;
        if (massEl) massEl.value = p.weight;
    }
    triggerFlexibleCalculation();
}

function toggleDiaphragmThicknessMode() {
    const mode = document.getElementById('flex_diaphragm_mode')?.value || 'auto';
    const tInput = document.getElementById('flex_diaphragm_t');
    if (tInput) {
        tInput.disabled = (mode === 'auto');
        if (mode === 'auto') {
            tInput.classList.add('opacity-50');
        } else {
            tInput.classList.remove('opacity-50');
        }
    }
    triggerFlexibleCalculation();
}

// -------------------------------------------------------------
// Stratigraphy Layers Management
// -------------------------------------------------------------
function renderStratigraphyLayers() {
    const container = document.getElementById('flex_strat_layers_list');
    if (!container) return;

    container.innerHTML = '';
    stratigraphyLayers.forEach((lay, idx) => {
        const row = document.createElement('div');
        row.className = 'bg-gray-50 dark:bg-gray-700/50 p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 space-y-1.5';
        row.innerHTML = `
            <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 flex-1">
                    <span class="w-3 h-3 rounded-full inline-block shrink-0" style="background-color: ${lay.color};"></span>
                    <input type="text" data-field="name" data-idx="${idx}" value="${lay.name}"
                        class="eng-input text-xs font-semibold py-1 px-1.5 w-full bg-white dark:bg-gray-800">
                </div>
                <button type="button" onclick="removeStratigraphyLayer(${idx})"
                    class="text-rose-600 hover:text-rose-800 dark:text-rose-400 text-xs px-1.5 py-0.5 font-bold"
                    title="Excluir camada">✕</button>
            </div>
            <div class="grid grid-cols-5 gap-1.5 text-[11px]">
                <div>
                    <label class="text-gray-400 block text-[9px]">Espessura (m)</label>
                    <input type="number" step="0.2" min="0.2" data-field="thickness" data-idx="${idx}" value="${lay.thickness}"
                        class="eng-input text-xs py-0.5 px-1 w-full text-center">
                </div>
                <div>
                    <label class="text-gray-400 block text-[9px]">γ (kN/m³)</label>
                    <input type="number" step="0.5" data-field="gamma" data-idx="${idx}" value="${lay.gamma}"
                        class="eng-input text-xs py-0.5 px-1 w-full text-center">
                </div>
                <div>
                    <label class="text-gray-400 block text-[9px]">γ_sat</label>
                    <input type="number" step="0.5" data-field="gamma_sat" data-idx="${idx}" value="${lay.gamma_sat || lay.gamma + 1}"
                        class="eng-input text-xs py-0.5 px-1 w-full text-center">
                </div>
                <div>
                    <label class="text-gray-400 block text-[9px]">ϕ' (°)</label>
                    <input type="number" step="1.0" data-field="phi" data-idx="${idx}" value="${lay.phi}"
                        class="eng-input text-xs py-0.5 px-1 w-full text-center">
                </div>
                <div>
                    <label class="text-gray-400 block text-[9px]">c' (kPa)</label>
                    <input type="number" step="1.0" min="0.0" data-field="cohesion" data-idx="${idx}" value="${lay.cohesion}"
                        class="eng-input text-xs py-0.5 px-1 w-full text-center">
                </div>
            </div>
        `;
        container.appendChild(row);
    });

    // Add listeners to layer input fields
    container.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx, 10);
            const field = e.target.dataset.field;
            if (field === 'name') {
                stratigraphyLayers[idx].name = e.target.value;
            } else {
                stratigraphyLayers[idx][field] = parseFloat(e.target.value) || 0;
            }
            triggerFlexibleCalculation();
        });
    });
}

function addStratigraphyLayer() {
    const idx = stratigraphyLayers.length + 1;
    const colors = ['#d97706', '#854d0e', '#0d9488', '#475569', '#7c3aed', '#ca8a04'];
    stratigraphyLayers.push({
        id: idx,
        name: `Camada ${idx}: Solo Estratificado`,
        thickness: 3.0,
        gamma: 19.0,
        gamma_sat: 20.0,
        phi: 32.0,
        cohesion: 5.0,
        color: colors[(idx - 1) % colors.length]
    });
    renderStratigraphyLayers();
    triggerFlexibleCalculation();
}

function removeStratigraphyLayer(idx) {
    if (stratigraphyLayers.length <= 1) {
        alert("O modelo deve ter pelo menos uma camada de solo.");
        return;
    }
    stratigraphyLayers.splice(idx, 1);
    renderStratigraphyLayers();
    triggerFlexibleCalculation();
}

function loadStratigraphyPreset(presetName) {
    if (presetName === '3layers_sand_clay_dense') {
        stratigraphyLayers = [
            { id: 1, name: 'Camada 1: Aterro Arenoso', thickness: 2.5, gamma: 17.0, gamma_sat: 18.0, phi: 30.0, cohesion: 0.0, color: '#d97706' },
            { id: 2, name: 'Camada 2: Argila Siltosa Média', thickness: 4.0, gamma: 18.5, gamma_sat: 19.5, phi: 24.0, cohesion: 15.0, color: '#854d0e' },
            { id: 3, name: 'Camada 3: Areia Compacta / Saibro', thickness: 8.0, gamma: 20.0, gamma_sat: 21.0, phi: 36.0, cohesion: 2.0, color: '#0d9488' }
        ];
    } else if (presetName === 'excel_strap_layers') {
        stratigraphyLayers = [
            { id: 1, name: 'Aterro (<5 golpes)', thickness: 4.0, gamma: 17.0, gamma_sat: 18.0, phi: 20.0, cohesion: 5.0, nspt: 2, alpha: 1.0, Kh_tf: 400.0, Kh_kN: 4000.0, color: '#d97706' },
            { id: 2, name: 'Aluvionar Argiloso (>4 golpes)', thickness: 1.5, gamma: 16.0, gamma_sat: 17.0, phi: 20.0, cohesion: 12.0, nspt: 5, alpha: 1.43, Kh_tf: 200.0, Kh_kN: 2000.0, color: '#854d0e' },
            { id: 3, name: 'Aluvionar Arenoso (<10 golpes)', thickness: 5.0, gamma: 17.0, gamma_sat: 18.0, phi: 25.0, cohesion: 5.0, nspt: 6, alpha: 2.5, Kh_tf: 300.0, Kh_kN: 3000.0, color: '#0d9488' },
            { id: 4, name: 'Solo Residual (>20 golpes)', thickness: 25.0, gamma: 19.0, gamma_sat: 20.0, phi: 31.0, cohesion: 17.5, nspt: 25, alpha: 2.0, Kh_tf: 3000.0, Kh_kN: 30000.0, color: '#475569' }
        ];
    }
    renderStratigraphyLayers();
    triggerFlexibleCalculation();
}

// -------------------------------------------------------------
// Presets Loader
// -------------------------------------------------------------
function loadFlexiblePreset(presetType) {
    if (presetType === 'strap_excel') {
        document.getElementById('flex_wall_type').value = 'sheet_pile';
        document.getElementById('flex_is_anchored').value = 'false';
        document.getElementById('flex_H').value = 2.5;
        document.getElementById('flex_length_mode').value = 'manual';
        document.getElementById('flex_total_length').value = 12.0;
        document.getElementById('flex_q').value = 30.0;
        document.getElementById('flex_soil_mode').value = 'stratified';
        const zwBack = document.getElementById('flex_zw_back_strat');
        if (zwBack) zwBack.value = 2.5;
        const zwFront = document.getElementById('flex_zw_front_strat');
        if (zwFront) zwFront.value = 2.5;
        const fsPas = document.getElementById('flex_fs_passive_strat');
        if (fsPas) fsPas.value = 1.5;
        stratigraphyLayers = [
            { id: 1, name: 'Aterro (<5 golpes)', thickness: 4.0, gamma: 17.0, gamma_sat: 18.0, phi: 20.0, cohesion: 5.0, nspt: 2, alpha: 1.0, Kh_tf: 400.0, Kh_kN: 4000.0, color: '#d97706' },
            { id: 2, name: 'Aluvionar Argiloso (>4 golpes)', thickness: 1.5, gamma: 16.0, gamma_sat: 17.0, phi: 20.0, cohesion: 12.0, nspt: 5, alpha: 1.43, Kh_tf: 200.0, Kh_kN: 2000.0, color: '#854d0e' },
            { id: 3, name: 'Aluvionar Arenoso (<10 golpes)', thickness: 5.0, gamma: 17.0, gamma_sat: 18.0, phi: 25.0, cohesion: 5.0, nspt: 6, alpha: 2.5, Kh_tf: 300.0, Kh_kN: 3000.0, color: '#0d9488' },
            { id: 4, name: 'Solo Residual (>20 golpes)', thickness: 25.0, gamma: 19.0, gamma_sat: 20.0, phi: 31.0, cohesion: 17.5, nspt: 25, alpha: 2.0, Kh_tf: 3000.0, Kh_kN: 30000.0, color: '#475569' }
        ];
        renderStratigraphyLayers();
        const pSel = document.getElementById('flex_profile_catalog');
        if (pSel) pSel.value = 'AZ 18-700';
        const sMode = document.getElementById('flex_section_mode');
        if (sMode) sMode.value = 'catalog';
    } else if (presetType === 'anchored_sheet_pile') {
        document.getElementById('flex_wall_type').value = 'sheet_pile';
        document.getElementById('flex_is_anchored').value = 'true';
        document.getElementById('flex_H').value = 6.0;
        document.getElementById('flex_anchor_depth').value = 1.2;
        document.getElementById('flex_length_mode').value = 'auto';
        document.getElementById('flex_q').value = 12.0;
        document.getElementById('flex_soil_mode').value = 'homogenous';
        document.getElementById('flex_gamma_retained').value = 18.0;
        document.getElementById('flex_phi_retained').value = 30.0;
        document.getElementById('flex_gamma_passive').value = 19.5;
        document.getElementById('flex_phi_passive').value = 33.0;
        document.getElementById('flex_zw_back').value = 4.0;
        document.getElementById('flex_zw_front').value = 6.0;
        document.getElementById('flex_fs_passive').value = 1.5;
        const pSel = document.getElementById('flex_profile_catalog');
        if (pSel) pSel.value = 'AZ 18-700';
        const sMode = document.getElementById('flex_section_mode');
        if (sMode) sMode.value = 'catalog';
    } else if (presetType === 'cantilever_sheet_pile') {
        document.getElementById('flex_wall_type').value = 'sheet_pile';
        document.getElementById('flex_is_anchored').value = 'false';
        document.getElementById('flex_H').value = 3.5;
        document.getElementById('flex_length_mode').value = 'auto';
        document.getElementById('flex_q').value = 10.0;
        document.getElementById('flex_soil_mode').value = 'homogenous';
        document.getElementById('flex_gamma_retained').value = 18.0;
        document.getElementById('flex_phi_retained').value = 32.0;
        document.getElementById('flex_gamma_passive').value = 19.0;
        document.getElementById('flex_phi_passive').value = 32.0;
        document.getElementById('flex_zw_back').value = 10.0;
        document.getElementById('flex_zw_front').value = 10.0;
        document.getElementById('flex_fs_passive').value = 1.5;
        const pSel = document.getElementById('flex_profile_catalog');
        if (pSel) pSel.value = 'PU 22 (Larssen)';
        const sMode = document.getElementById('flex_section_mode');
        if (sMode) sMode.value = 'catalog';
    } else if (presetType === 'diaphragm_wall') {
        document.getElementById('flex_wall_type').value = 'diaphragm_wall';
        document.getElementById('flex_is_anchored').value = 'true';
        document.getElementById('flex_H').value = 8.0;
        document.getElementById('flex_anchor_depth').value = 1.5;
        document.getElementById('flex_length_mode').value = 'auto';
        document.getElementById('flex_q').value = 15.0;
        document.getElementById('flex_soil_mode').value = 'homogenous';
        document.getElementById('flex_gamma_retained').value = 18.5;
        document.getElementById('flex_phi_retained').value = 30.0;
        document.getElementById('flex_gamma_passive').value = 20.0;
        document.getElementById('flex_phi_passive').value = 34.0;
        document.getElementById('flex_zw_back').value = 3.0;
        document.getElementById('flex_zw_front').value = 8.0;
        document.getElementById('flex_fs_passive').value = 1.5;
        const dMode = document.getElementById('flex_diaphragm_mode');
        if (dMode) dMode.value = 'auto';
    }
    toggleFlexibleSupport();
    toggleFlexibleLengthMode();
    toggleFlexibleSoilMode();
    onFlexibleWallTypeChange();
    toggleFlexibleSectionMode();
    triggerFlexibleCalculation();
}

// -------------------------------------------------------------
// Inputs Collector
// -------------------------------------------------------------
function getFlexibleInputs() {
    const isAnchored = document.getElementById('flex_is_anchored')?.value === 'true';
    const lengthMode = document.getElementById('flex_length_mode')?.value || 'auto';
    const soilMode = document.getElementById('flex_soil_mode')?.value || 'homogenous';
    const H = parseFloat(document.getElementById('flex_H')?.value || 5.0);
    const totalLength = parseFloat(document.getElementById('flex_total_length')?.value || (H + 3.0));

    const isStratified = (soilMode === 'stratified');
    const zwRetained = isStratified 
        ? parseFloat(document.getElementById('flex_zw_back_strat')?.value || 4.0)
        : parseFloat(document.getElementById('flex_zw_back')?.value || 4.0);
    const zwPassive = isStratified 
        ? parseFloat(document.getElementById('flex_zw_front_strat')?.value || 5.0)
        : parseFloat(document.getElementById('flex_zw_front')?.value || 5.0);
    const fsPassive = isStratified
        ? parseFloat(document.getElementById('flex_fs_passive_strat')?.value || 1.5)
        : parseFloat(document.getElementById('flex_fs_passive')?.value || 1.5);

    return {
        wall_type: document.getElementById('flex_wall_type')?.value || 'sheet_pile',
        is_anchored: isAnchored,
        support_type: isAnchored ? 'single_anchor' : 'cantilever',
        H: H,
        excavation_depth: H,
        anchor_depth: parseFloat(document.getElementById('flex_anchor_depth')?.value || 1.0),
        length_mode: lengthMode,
        total_length: totalLength,
        embedment_depth: Math.max(0.5, totalLength - H),
        q_surcharge: parseFloat(document.getElementById('flex_q')?.value || 10.0),
        surcharge: parseFloat(document.getElementById('flex_q')?.value || 10.0),
        soil_mode: soilMode,
        layers: stratigraphyLayers,
        // Homogeneous fallback
        gamma_retained: parseFloat(document.getElementById('flex_gamma_retained')?.value || 18.0),
        phi_retained: parseFloat(document.getElementById('flex_phi_retained')?.value || 30.0),
        c_retained: parseFloat(document.getElementById('flex_c_retained')?.value || 0.0),
        gamma_passive: parseFloat(document.getElementById('flex_gamma_passive')?.value || 19.0),
        phi_passive: parseFloat(document.getElementById('flex_phi_passive')?.value || 32.0),
        c_passive: parseFloat(document.getElementById('flex_c_passive')?.value || 0.0),
        zw_retained: zwRetained,
        water_table_retained: zwRetained,
        zw_passive: zwPassive,
        water_table_excav: zwPassive,
        fs_passive: fsPassive,
        steel_fy: parseFloat(document.getElementById('flex_steel_fy')?.value || 345.0),
        fy_steel: parseFloat(document.getElementById('flex_steel_fy')?.value || 345.0),
        steel_E_GPa: parseFloat(document.getElementById('flex_steel_E')?.value || 210.0),
        section_mode: document.getElementById('flex_section_mode')?.value || 'catalog',
        profile_name: document.getElementById('flex_profile_catalog')?.value || 'PU 18 (Larssen)',
        custom_profile_name: document.getElementById('flex_sec_custom_name')?.value || 'Perfil Personalizado',
        custom_Wel: parseFloat(document.getElementById('flex_sec_wel')?.value || 1800.0),
        custom_Ix: parseFloat(document.getElementById('flex_sec_ix')?.value || 38400.0),
        custom_height: parseFloat(document.getElementById('flex_sec_h')?.value || 430.0),
        custom_tw: parseFloat(document.getElementById('flex_sec_tw')?.value || 10.0),
        custom_mass: parseFloat(document.getElementById('flex_sec_mass')?.value || 118.0),
        wall_thickness_mode: document.getElementById('flex_diaphragm_mode')?.value || 'auto',
        wall_thickness: parseFloat(document.getElementById('flex_diaphragm_t')?.value || 0.60),
        fck_concrete: parseFloat(document.getElementById('flex_fck_concrete')?.value || 30.0),
        fck: parseFloat(document.getElementById('flex_fck_concrete')?.value || 30.0),
        concrete_Ec_GPa: parseFloat(document.getElementById('flex_concrete_Ec')?.value || 26.0),
        cracked_inertia_ratio: parseFloat(document.getElementById('flex_cracked_ratio')?.value || 0.50),
        concrete_cover_cm: parseFloat(document.getElementById('flex_concrete_cover')?.value || 6.0)
    };
}

async function triggerFlexibleCalculation() {
    const inputs = getFlexibleInputs();
    try {
        if (window.eel && eel.calculate_flexible_retaining_wall) {
            const res = await eel.calculate_flexible_retaining_wall(inputs)();
            if (res && res.status === 'success') {
                flexWallData = res;
                updateFlexibleUI(res);
                drawFlexibleWallCanvas(res);
            } else if (res && res.error) {
                console.error("Erro no cálculo da contenção flexível:", res.error);
            }
        }
    } catch (err) {
        console.error("Erro chamando calculate_flexible_retaining_wall:", err);
    }
}

// -------------------------------------------------------------
// Normalized Data Resolver
// -------------------------------------------------------------
function getFlexibleNormalizedData(res) {
    if (!res) return null;
    const inputs = getFlexibleInputs();

    const geo = res.geometry || {
        retained_height: inputs.H,
        embedment_depth: res.summary?.embedment_exec ?? 4.0,
        total_length: res.summary?.total_length ?? (inputs.H + 4.0),
        length_mode: inputs.length_mode
    };

    const isAnchored = (res.forces?.is_anchored !== undefined) 
        ? res.forces.is_anchored 
        : inputs.is_anchored;

    const forces = res.forces || {
        is_anchored: isAnchored,
        anchor_force: res.summary?.anchor_force ?? 0,
        anchor_depth: res.summary?.anchor_depth ?? inputs.anchor_depth,
        max_bending_moment: res.summary?.max_moment ?? 0,
        moment_depth: res.summary?.moment_depth ?? (geo.retained_height * 0.7),
        max_shear: res.summary?.max_shear ?? 0
    };

    const sec = res.section_check || {
        type: res.summary?.wall_type || inputs.wall_type,
        mode: inputs.section_mode,
        approved: (res.steel_design?.status === 'Aprovado') || (res.concrete_design?.status === 'Aprovado'),
        profile: res.steel_design?.selected_profile || inputs.profile_name,
        W_el_provided: res.steel_design?.selected_W_el || inputs.custom_Wel,
        W_el_required: res.steel_design?.W_el_req || 1200,
        utilization: res.steel_design?.utilization || 0.7,
        mass_per_m2: inputs.custom_mass || 118,
        I_x: inputs.custom_Ix || 38400,
        height_mm: inputs.custom_height || 430,
        tw_mm: inputs.custom_tw || 10,
        wall_thickness: res.concrete_design?.thickness || inputs.wall_thickness,
        As_main: res.concrete_design?.As_req || 15.0,
        As_secondary: (res.concrete_design?.As_req || 15.0) * 0.2
    };

    const stab = res.stability || {
        FS_heave: res.hydraulic_check?.fs_piping ?? 99.9,
        heave_safe: (res.hydraulic_check?.fs_piping ?? 99.9) >= 1.5,
        FS_overturning: res.summary?.FS_overturning ?? 1.5,
        overturning_safe: (res.summary?.FS_overturning ?? 1.5) >= 1.30
    };

    const water = res.water || {
        zw_retained: inputs.zw_retained,
        zw_passive: inputs.zw_passive
    };

    const stratigraphy = res.stratigraphy || {
        mode: inputs.soil_mode,
        layers: inputs.layers
    };

    const profiles = {
        depths: res.profiles?.depths || res.profiles?.depth || [],
        moments: res.profiles?.moments || res.profiles?.moment || [],
        shears: res.profiles?.shears || res.profiles?.shear || [],
        net_pressures: res.profiles?.net_pressures || res.profiles?.net_pressure || []
    };

    return { geometry: geo, forces, section_check: sec, stability: stab, water, stratigraphy, profiles };
}

// -------------------------------------------------------------
// Update Results UI Cards
// -------------------------------------------------------------
function updateFlexibleUI(res) {
    const data = getFlexibleNormalizedData(res);
    if (!data) return;

    const geo = data.geometry;
    const loads = data.forces;
    const sec = data.section_check;
    const stab = data.stability;

    // Ficha & Geometria
    const isManual = (geo.length_mode === 'manual');
    const embedTitle = document.getElementById('flex-res-embedment-title');
    if (embedTitle) {
        embedTitle.innerText = isManual ? 'Ficha Definida (D)' : 'Ficha Requerida (D)';
    }

    setText('flex-res-embedment', `${geo.embedment_depth.toFixed(2)} m`);
    setText('flex-res-total-length', `${geo.total_length.toFixed(2)} m`);
    setText('flex-res-retained-height', `${geo.retained_height.toFixed(2)} m`);

    // Estabilidade ao Tombamento / Passivo
    const fsOverEl = document.getElementById('flex-res-fs-overturning');
    if (fsOverEl) {
        const fsVal = stab.FS_overturning || 1.5;
        if (fsVal >= 1.30) {
            fsOverEl.className = 'text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1';
            fsOverEl.innerText = `✓ FS Estabilidade = ${fsVal.toFixed(2)}`;
        } else if (fsVal >= 1.0) {
            fsOverEl.className = 'text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1';
            fsOverEl.innerText = `⚠ FS Atenção = ${fsVal.toFixed(2)} (< 1.30)`;
        } else {
            fsOverEl.className = 'text-[10px] font-bold text-rose-600 dark:text-rose-400 mt-1';
            fsOverEl.innerText = `✕ Ficha Curta! FS = ${fsVal.toFixed(2)} < 1.0`;
        }
    }

    // Forças Solicitantes
    setText('flex-res-anchor-force', loads.is_anchored ? `${loads.anchor_force.toFixed(1)} kN/m` : 'N/A (Livre em Balanço)');
    setText('flex-res-max-moment', `${loads.max_bending_moment.toFixed(1)} kNm/m`);
    setText('flex-res-moment-depth', `a z = ${loads.moment_depth.toFixed(2)} m`);
    setText('flex-res-max-shear', `${loads.max_shear.toFixed(1)} kN/m`);

    // Dimensionamento Estrutural
    const secBadge = document.getElementById('flex-res-status-badge');
    if (secBadge) {
        if (sec.approved) {
            secBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200';
            secBadge.innerText = '✓ Aprovado';
        } else {
            secBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200';
            secBadge.innerText = '⚠ Sobredimensionar';
        }
    }

    if (sec.type === 'sheet_pile') {
        document.getElementById('flex-steel-section-card')?.classList.remove('hidden');
        document.getElementById('flex-concrete-section-card')?.classList.add('hidden');
        setText('flex-res-profile-name', sec.profile);
        setText('flex-res-sec-dims', `h = ${sec.height_mm || '-'} mm • tw = ${sec.tw_mm || '-'} mm`);
        setText('flex-res-wel-prov', `${sec.W_el_provided ? sec.W_el_provided.toFixed(0) : '-'} cm³/m`);
        setText('flex-res-wel-req', `${sec.W_el_required ? sec.W_el_required.toFixed(0) : '-'} cm³/m`);
        setText('flex-res-sec-ix', `${sec.I_x ? sec.I_x.toFixed(0) : '-'}`);
        setText('flex-res-sec-ei', `${res.deflection?.EI_kNm2 ? res.deflection.EI_kNm2.toFixed(0) : '-'}`);
        setText('flex-res-utilization', `${(sec.utilization * 100).toFixed(1)}%`);
        const utilBadge = document.getElementById('flex-res-util-status');
        if (utilBadge) {
            if (sec.utilization <= 1.0) {
                utilBadge.className = 'text-[10px] text-emerald-500 font-semibold';
                utilBadge.innerText = '✓ ELU OK';
            } else {
                utilBadge.className = 'text-[10px] text-rose-500 font-bold';
                utilBadge.innerText = '✕ Sobredim.';
            }
        }
        setText('flex-res-steel-mass', `${sec.mass_per_m2 || '-'}`);
        const modeTag = document.getElementById('flex-res-profile-mode-tag');
        if (modeTag) {
            const m = sec.mode || 'catalog';
            modeTag.innerText = m === 'custom' ? 'Perfil Personalizado' : (m === 'auto' ? 'Catálogo (Auto)' : 'Catálogo ArcelorMittal');
        }
    } else {
        document.getElementById('flex-steel-section-card')?.classList.add('hidden');
        document.getElementById('flex-concrete-section-card')?.classList.remove('hidden');
        setText('flex-res-wall-thickness', `${(sec.wall_thickness * 100).toFixed(0)} cm`);
        setText('flex-res-as-main', `${sec.As_main.toFixed(1)} cm²/m`);
        setText('flex-res-as-sec', `${sec.As_secondary.toFixed(1)} cm²/m`);
    }

    // Sifonamento
    setText('flex-res-fs-heave', `${stab.FS_heave.toFixed(2)}`);

    // Deformação no Topo (ELS)
    const def = res.deflection || { delta_top_mm: 15.0, delta_adm_mm: 20.0, approved: true };
    setText('flex-res-deflection', `${def.delta_top_mm.toFixed(1)} mm`);
    setText('flex-res-deflection-adm', `${def.delta_adm_mm.toFixed(1)}`);
    const defBadge = document.getElementById('flex-res-deflection-badge');
    if (defBadge) {
        if (def.approved) {
            defBadge.className = 'text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1';
            defBadge.innerText = '✓ ELS Aprovado';
        } else {
            defBadge.className = 'text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-1';
            defBadge.innerText = '⚠ ELS Excedido';
        }
    }

    // Verificação Global de Equilíbrio em Balanço (Ref. Excel / STRAP)
    const strapEq = res.global_cantilever_equilibrium || res.summary?.strap_equilibrium;
    if (strapEq) {
        setText('flex-res-strap-ea', `${strapEq.total_Fa_kN != null ? strapEq.total_Fa_kN.toFixed(1) : '-'} kN`);
        setText('flex-res-strap-ea-tf', `${strapEq.total_Fa_tf != null ? strapEq.total_Fa_tf.toFixed(2) : '-'} tf`);
        setText('flex-res-strap-ep', `${strapEq.total_Fp_kN != null ? strapEq.total_Fp_kN.toFixed(1) : '-'} kN`);
        setText('flex-res-strap-ep-tf', `${strapEq.total_Fp_tf != null ? strapEq.total_Fp_tf.toFixed(2) : '-'} tf`);
        setText('flex-res-strap-mtom', `${strapEq.M_tom_base_kNm != null ? strapEq.M_tom_base_kNm.toFixed(1) : '-'} kNm`);
        setText('flex-res-strap-mtom-tf', `${strapEq.M_tom_base_tfm != null ? strapEq.M_tom_base_tfm.toFixed(2) : '-'} tf.m`);
        setText('flex-res-strap-mres', `${strapEq.M_res_base_kNm != null ? strapEq.M_res_base_kNm.toFixed(1) : '-'} kNm`);
        setText('flex-res-strap-mres-tf', `${strapEq.M_res_base_tfm != null ? strapEq.M_res_base_tfm.toFixed(2) : '-'} tf.m`);

        setText('flex-res-strap-fs-desl', strapEq.fs_sliding != null ? strapEq.fs_sliding.toFixed(2) : '-');
        const badgeDesl = document.getElementById('flex-res-strap-badge-desl');
        if (badgeDesl) {
            const fs = strapEq.fs_sliding || 0;
            badgeDesl.innerText = strapEq.status_sliding || (fs >= 1.5 ? 'OK (Seguro)' : (fs >= 1.0 ? 'Limítrofe' : 'FALHA'));
            badgeDesl.className = fs >= 1.5 
                ? 'text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                : (fs >= 1.0 
                    ? 'text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                    : 'text-[10px] px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300');
        }

        setText('flex-res-strap-fs-tomb', strapEq.fs_overturning != null ? strapEq.fs_overturning.toFixed(2) : '-');
        const badgeTomb = document.getElementById('flex-res-strap-badge-tomb');
        if (badgeTomb) {
            const fs = strapEq.fs_overturning || 0;
            badgeTomb.innerText = strapEq.status_overturning || (fs >= 1.5 ? 'OK (Seguro)' : (fs >= 1.0 ? 'Limítrofe' : 'FALHA'));
            badgeTomb.className = fs >= 1.5 
                ? 'text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                : (fs >= 1.0 
                    ? 'text-[10px] px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                    : 'text-[10px] px-2 py-0.5 rounded font-bold bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300');
        }
    }

    // Winkler Springs & STRAP Nodal Discretization Table
    renderStrapSpringsTable(res.springs_table);
}

function renderStrapSpringsTable(rows) {
    const tbody = document.getElementById('flex-strap-springs-tbody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-3 text-gray-400 font-sans">Nenhuma discretização disponível para este caso.</td></tr>';
        return;
    }

    let html = '';
    rows.forEach(r => {
        const hasSpring = (r.K_spring_tf_m > 0);
        html += `<tr class="hover:bg-slate-50 dark:hover:bg-gray-800/60 transition-colors">
            <td class="py-1 px-2 font-bold text-gray-700 dark:text-gray-300">${r.node}</td>
            <td class="py-1 px-2">${r.z_m.toFixed(2)}</td>
            <td class="py-1 px-2 text-[10px] truncate max-w-[120px]" title="${r.layer_name}">${r.layer_name}</td>
            <td class="py-1 px-2 text-right text-rose-600 dark:text-rose-400 font-medium">${r.Fa_node_tf.toFixed(2)}</td>
            <td class="py-1 px-2 text-right text-gray-400">${r.Fa_node_kN.toFixed(1)}</td>
            <td class="py-1 px-2 text-right ${hasSpring ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-gray-300 dark:text-gray-600'}">
                ${hasSpring ? r.K_spring_tf_m.toFixed(1) : '-'}
            </td>
            <td class="py-1 px-2 text-right ${hasSpring ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-gray-300 dark:text-gray-600'}">
                ${hasSpring ? r.F_max_tf.toFixed(2) : '-'}
            </td>
            <td class="py-1 px-2 text-right ${hasSpring ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-gray-300 dark:text-gray-600'}">
                ${hasSpring ? r.x2_yield_mm.toFixed(1) : '-'}
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function copyStrapTableToClipboard() {
    if (!flexWallData || !flexWallData.strap_export) {
        alert('Nenhum dado de mola STRAP disponível para cópia no momento.');
        return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(flexWallData.strap_export).then(() => {
            showStrapCopyFeedback();
        }).catch(() => {
            fallbackCopyStrapText(flexWallData.strap_export);
        });
    } else {
        fallbackCopyStrapText(flexWallData.strap_export);
    }
}

function fallbackCopyStrapText(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        showStrapCopyFeedback();
    } catch (err) {
        console.error('Falha ao copiar:', err);
    }
    document.body.removeChild(textArea);
}

function showStrapCopyFeedback() {
    const btn = document.querySelector('button[onclick="copyStrapTableToClipboard()"]');
    if (btn) {
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<span>✓</span> Copiado!';
        btn.classList.add('bg-emerald-600');
        btn.classList.remove('bg-blue-600');
        setTimeout(() => {
            btn.innerHTML = origHtml;
            btn.classList.remove('bg-emerald-600');
            btn.classList.add('bg-blue-600');
        }, 2200);
    }
}

function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.innerText = txt;
}

// -------------------------------------------------------------
// 2D Canvas Elevation & Diagrams Renderer
// -------------------------------------------------------------
function drawFlexibleWallCanvas(res) {
    const data = getFlexibleNormalizedData(res);
    if (!data) return;

    const canvas = document.getElementById('flex-wall-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. High-DPI Retina/4K Scaling
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || canvas.width || 760;
    const height = rect.height || canvas.height || 460;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // 2. Blueprint Background & Precision CAD Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, width, height, true);
        EngCAD.drawGrid(ctx, width, height, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        // Subtle grid lines
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
        ctx.lineWidth = 0.5;
        for (let x = 0; x < width; x += 24) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += 24) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    }

    const geo = data.geometry;
    const H = geo.retained_height;
    const D = geo.embedment_depth;
    const L = geo.total_length;
    const isAnchored = Boolean(data.forces.is_anchored);
    const dAnc = data.forces.anchor_depth;

    // Viewport layout: Left area = Elevation (48%), Right area = Moment Diagram (52%)
    const margin = 35;
    const viewTop = margin + 15;
    const viewBottom = height - margin;
    const viewH = viewBottom - viewTop;

    const scaleY = viewH / (L * 1.15);
    const wallX = Math.max(140, Math.round(width * 0.23));
    const soilWidth = Math.min(190, Math.round(width * 0.22));

    const yTop = viewTop + 10;
    const yExcav = yTop + H * scaleY;
    const yTip = yTop + L * scaleY;

    // 3. Render Stratified Soil Layers OR Homogeneous Soil
    const isStratified = (data.stratigraphy?.mode === 'stratified');
    const layers = data.stratigraphy?.layers || [];

    if (isStratified && layers.length > 0) {
        // Draw each stratified soil band
        layers.forEach((lay, idx) => {
            const layTopY = yTop + lay.top * scaleY;
            const layBotY = yTop + Math.min(L * 1.2, lay.bottom) * scaleY;
            const layH = layBotY - layTopY;
            if (layH <= 0) return;

            // Retained side (Right of wall)
            ctx.save();
            ctx.fillStyle = lay.color || '#d97706';
            ctx.globalAlpha = 0.18;
            ctx.fillRect(wallX, layTopY, soilWidth, layH);
            ctx.restore();

            // Excavation side (Left of wall, only below yExcav)
            if (layBotY > yExcav) {
                const excavTopY = Math.max(yExcav, layTopY);
                const excavH = layBotY - excavTopY;
                ctx.save();
                ctx.fillStyle = lay.color || '#0d9488';
                ctx.globalAlpha = 0.14;
                ctx.fillRect(margin + 10, excavTopY, wallX - (margin + 10), excavH);
                ctx.restore();
            }

            // Stratum contact line
            if (idx > 0 && layTopY < yTip + 20) {
                ctx.strokeStyle = lay.color || '#64748b';
                ctx.lineWidth = 1.2;
                ctx.setLineDash([4, 4]);

                // Across retained
                ctx.beginPath();
                ctx.moveTo(wallX, layTopY);
                ctx.lineTo(wallX + soilWidth, layTopY);
                ctx.stroke();

                // Across excavation (if below excavation level)
                if (layTopY >= yExcav) {
                    ctx.beginPath();
                    ctx.moveTo(margin + 10, layTopY);
                    ctx.lineTo(wallX, layTopY);
                    ctx.stroke();
                }
                ctx.setLineDash([]);
            }

            // Layer tag pill on right of soil zone
            const tagY = layTopY + layH / 2;
            if (tagY >= yTop && tagY <= yTip + 25) {
                const tagTxt = `${lay.name} (h=${lay.thickness}m, γ=${lay.gamma})`;
                drawFlexPillBadge(ctx, tagTxt, wallX + soilWidth - 8, tagY, '#f1f5f9', 'rgba(15, 23, 42, 0.88)', lay.color || '#64748b', false, true);
            }
        });
    } else {
        // Homogeneous Retained Soil (Right of wall)
        const soilGrad = ctx.createLinearGradient(wallX, yTop, wallX + soilWidth, yTop);
        soilGrad.addColorStop(0, 'rgba(217, 119, 6, 0.25)');
        soilGrad.addColorStop(1, 'rgba(180, 83, 9, 0.10)');
        ctx.fillStyle = soilGrad;
        ctx.fillRect(wallX, yTop, soilWidth, yTip - yTop);

        // Retained soil hatch pattern
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
        ctx.lineWidth = 1;
        for (let y = yTop; y < yTip; y += 18) {
            ctx.beginPath();
            ctx.moveTo(wallX, y);
            ctx.lineTo(wallX + soilWidth, y + 25);
            ctx.stroke();
        }

        // Excavation Soil (Left of wall, below excavation line yExcav)
        const excavGrad = ctx.createLinearGradient(margin + 10, yExcav, wallX, yExcav);
        excavGrad.addColorStop(0, 'rgba(20, 184, 166, 0.08)');
        excavGrad.addColorStop(1, 'rgba(20, 184, 166, 0.22)');
        ctx.fillStyle = excavGrad;
        ctx.fillRect(margin + 10, yExcav, wallX - (margin + 10), yTip - yExcav);
    }

    // 4. Ground lines (Top and Excavation)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(wallX, yTop);
    ctx.lineTo(wallX + soilWidth, yTop);
    ctx.stroke();

    ctx.strokeStyle = '#2dd4bf';
    ctx.beginPath();
    ctx.moveTo(margin + 10, yExcav);
    ctx.lineTo(wallX, yExcav);
    ctx.stroke();

    // Ground hatch ticks
    const drawTicks = (x1, y1, x2, color) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        for (let x = x1 + 5; x < x2 - 5; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, y1);
            ctx.lineTo(x - 6, y1 + 7);
            ctx.stroke();
        }
        ctx.restore();
    };
    drawTicks(wallX, yTop, wallX + soilWidth, '#f59e0b');
    drawTicks(margin + 10, yExcav, wallX, '#2dd4bf');

    // 5. Water Tables
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);

    const zwBack = data.water.zw_retained;
    const zwFront = data.water.zw_passive;
    if (zwBack < L + 1.0) {
        const yWBack = yTop + zwBack * scaleY;
        ctx.beginPath();
        ctx.moveTo(wallX, yWBack);
        ctx.lineTo(wallX + soilWidth, yWBack);
        ctx.stroke();

        drawFlexPillBadge(ctx, `NA Montante (${zwBack.toFixed(1)}m)`, wallX + 18, yWBack - 10, '#38bdf8', 'rgba(15, 23, 42, 0.92)');
    }
    if (zwFront < L + 1.0) {
        const yWFront = yTop + zwFront * scaleY;
        ctx.beginPath();
        ctx.moveTo(margin + 10, yWFront);
        ctx.lineTo(wallX, yWFront);
        ctx.stroke();

        drawFlexPillBadge(ctx, `NA Jusante (${zwFront.toFixed(1)}m)`, margin + 20, yWFront - 10, '#38bdf8', 'rgba(15, 23, 42, 0.92)');
    }
    ctx.setLineDash([]);

    // 6. Flexible Wall Body (Sheet Pile or Diaphragm)
    const isDiaphragm = (data.section_check.type === 'diaphragm_wall');
    const wallThick = isDiaphragm 
        ? Math.max(10, Math.min(22, (data.section_check.wall_thickness || 0.6) * 18))
        : Math.max(8, Math.min(16, (data.section_check.height_mm || 420) / 40));
    const wallGrad = ctx.createLinearGradient(wallX - wallThick / 2, yTop, wallX + wallThick / 2, yTop);
    wallGrad.addColorStop(0, isDiaphragm ? '#34d399' : '#38bdf8');
    wallGrad.addColorStop(1, isDiaphragm ? '#059669' : '#0284c7');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(wallX - wallThick / 2, yTop, wallThick, yTip - yTop);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(wallX - wallThick / 2, yTop, wallThick, yTip - yTop);

    // Profile label badge near bottom of pile
    const profLabel = isDiaphragm 
        ? `Parede Diafragma t=${((data.section_check.wall_thickness || 0.6) * 100).toFixed(0)}cm`
        : `${data.section_check.profile || 'Estaca-Prancha'}`;
    drawFlexPillBadge(ctx, profLabel, wallX + wallThick / 2 + 8, yTip - 10, isDiaphragm ? '#34d399' : '#38bdf8', 'rgba(15, 23, 42, 0.92)', isDiaphragm ? '#059669' : '#0284c7');

    // 7. Anchor / Strut (ONLY drawn if isAnchored is true!)
    if (isAnchored) {
        const yAnc = yTop + dAnc * scaleY;
        const ancEndX = wallX + Math.min(130, soilWidth - 25);
        const ancEndY = yAnc - 20;

        // Tieback cable line
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(wallX, yAnc);
        ctx.lineTo(ancEndX, ancEndY);
        ctx.stroke();

        // Grout bulb
        ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(ancEndX, ancEndY, 18, 8, -0.22, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Steel anchor plate on wall face
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(wallX - wallThick / 2 - 5, yAnc - 7, 5, 14);

        // Technical pill badge
        const ancTxt = `Tirante T = ${data.forces.anchor_force.toFixed(1)} kN/m`;
        drawFlexPillBadge(ctx, ancTxt, wallX + 35, yAnc - 16, '#fda4af', 'rgba(15, 23, 42, 0.94)', '#f43f5e');
    }

    // 8. Dimension Cotas (H, D, and L on Left)
    const dimX = wallX - 42;
    drawDimensionLine(ctx, dimX, yTop, dimX, yExcav, `H = ${H.toFixed(1)} m`);
    drawDimensionLine(ctx, dimX, yExcav, dimX, yTip, `D = ${D.toFixed(1)} m`);

    // Outer total length cota if space allows
    const dimX2 = wallX - 78;
    drawDimensionLine(ctx, dimX2, yTop, dimX2, yTip, `L = ${L.toFixed(1)} m`);

    // Top Crest Deflection Indicator (δ_topo)
    if (res.deflection) {
        const dMm = res.deflection.delta_top_mm;
        const isOk = res.deflection.approved;
        const arrowLen = Math.min(32, Math.max(12, dMm * 0.7));

        ctx.save();
        ctx.strokeStyle = isOk ? '#2dd4bf' : '#f59e0b';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(wallX - wallThick / 2, yTop);
        ctx.lineTo(wallX - wallThick / 2 - arrowLen, yTop);
        ctx.stroke();

        // Arrowhead pointing left
        ctx.fillStyle = isOk ? '#2dd4bf' : '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(wallX - wallThick / 2 - arrowLen, yTop);
        ctx.lineTo(wallX - wallThick / 2 - arrowLen + 5, yTop - 3.5);
        ctx.lineTo(wallX - wallThick / 2 - arrowLen + 5, yTop + 3.5);
        ctx.closePath();
        ctx.fill();

        // Badge positioned above deflection arrow
        const defTxt = `δ_topo = ${dMm.toFixed(1)} mm`;
        drawFlexPillBadge(ctx, defTxt, wallX - wallThick / 2 - arrowLen - 6, yTop - 12, isOk ? '#2dd4bf' : '#fbbf24', 'rgba(15, 23, 42, 0.94)', isOk ? '#0d9488' : '#d97706', false, true);
        ctx.restore();
    }

    // ---------------------------------------------------------
    // 9. DIAGRAMA: Momento Fletor M(z) [kNm/m] (À Direita)
    // ---------------------------------------------------------
    const diagX0 = Math.max(wallX + soilWidth + 35, Math.round(width * 0.48));
    const diagW = width - diagX0 - 30;

    // Title
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Diagrama de Momentos Fletores M(z) [kNm/m]', diagX0, viewTop - 8);

    // Zero Axis Line
    const axisX = diagX0 + 35;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(axisX, yTop);
    ctx.lineTo(axisX, yTip);
    ctx.stroke();

    const depthPts = data.profiles.depths;
    const momentPts = data.profiles.moments;
    const maxM = Math.max(1.0, data.forces.max_bending_moment);
    const scaleM = Math.max(8, (diagW - 70) / maxM);

    if (depthPts.length > 0) {
        ctx.beginPath();
        ctx.moveTo(axisX, yTop);
        for (let i = 0; i < depthPts.length; i++) {
            const z = depthPts[i];
            const M = momentPts[i];
            const py = yTop + z * scaleY;
            const px = axisX + M * scaleM;
            ctx.lineTo(px, py);
        }
        ctx.lineTo(axisX, yTip);
        ctx.closePath();

        // Gradient fill
        const mGrad = ctx.createLinearGradient(axisX, yTop, axisX + maxM * scaleM, yTop);
        mGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
        mGrad.addColorStop(1, 'rgba(56, 189, 248, 0.35)');
        ctx.fillStyle = mGrad;
        ctx.fill();

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Peak M_max indicator
        const yMmax = yTop + data.forces.moment_depth * scaleY;
        const xMmax = axisX + data.forces.max_bending_moment * scaleM;

        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(xMmax, yMmax, 4.5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const mmaxText = `Mmax = ${data.forces.max_bending_moment.toFixed(1)} kNm/m`;
        ctx.font = 'bold 10px Inter, monospace';
        const mbw = ctx.measureText(mmaxText).width + 12;
        const mbx = Math.min(xMmax + 8, width - mbw - 10);
        drawFlexPillBadge(ctx, mmaxText, mbx, yMmax, '#f87171', 'rgba(15, 23, 42, 0.95)', '#ef4444', false);
    }
}

function drawFlexPillBadge(ctx, text, x, y, textColor, bgColor, borderColor = textColor, centered = false, alignRight = false) {
    ctx.save();
    ctx.font = 'bold 10px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const padX = 6;
    const padY = 3;
    const bw = tw + padX * 2;
    const bh = 15 + padY * 2;
    let bx = x;
    if (centered) bx = x - bw / 2;
    else if (alignRight) bx = x - bw;
    const by = y - bh / 2;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + padX, y);
    ctx.restore();
}

function drawDimensionLine(ctx, x1, y1, x2, y2, text) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;

    // Extension lines
    ctx.beginPath();
    ctx.moveTo(x1 + 4, y1);
    ctx.lineTo(x1 - 4, y1);
    ctx.moveTo(x1 + 4, y2);
    ctx.lineTo(x1 - 4, y2);
    // Dimension line
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 45 deg Architectural Ticks
    const tick = 3.5;
    ctx.beginPath();
    ctx.moveTo(x1 - tick, y1 + tick);
    ctx.lineTo(x1 + tick, y1 - tick);
    ctx.moveTo(x2 - tick, y2 + tick);
    ctx.lineTo(x2 + tick, y2 - tick);
    ctx.stroke();

    // High Contrast Text Pill
    const midY = (y1 + y2) / 2;
    ctx.font = 'bold 10px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 10;
    const bh = 16;
    const bx = x1 - bw / 2;
    const by = midY - bh / 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x1, midY);
    ctx.restore();
}

window.initFlexibleWall = initFlexibleWall;
window.loadFlexiblePreset = loadFlexiblePreset;
window.triggerFlexibleCalculation = triggerFlexibleCalculation;
window.toggleFlexibleSupport = toggleFlexibleSupport;
window.toggleFlexibleLengthMode = toggleFlexibleLengthMode;
window.toggleFlexibleSoilMode = toggleFlexibleSoilMode;
window.addStratigraphyLayer = addStratigraphyLayer;
window.removeStratigraphyLayer = removeStratigraphyLayer;
window.loadStratigraphyPreset = loadStratigraphyPreset;
window.copyStrapTableToClipboard = copyStrapTableToClipboard;

/**
 * Export Current Flexible Retaining Wall Model to RS2 FEA 2D Suite
 */
function exportFlexibleToRS2FEA() {
    const inputs = getFlexibleInputs();

    let D = 0;
    if (flexWallData && flexWallData.geometry && flexWallData.geometry.embedment_depth) {
        D = flexWallData.geometry.embedment_depth;
    } else {
        D = inputs.is_anchored ? inputs.H * 0.85 : inputs.H * 1.35;
    }
    D = Math.max(2.0, Math.round(D * 10) / 10);

    const H = inputs.H;
    const isDiaphragm = inputs.wall_type === 'diaphragm_wall';
    const t_wall = isDiaphragm ? 0.80 : 0.40;
    const L_wall = H + D;

    const X_wall_left = 30.0;
    const X_wall_right = X_wall_left + t_wall;
    const X_left = 0.0;
    const X_right = 70.0;

    const Y_bedrock = 0.0;
    const Y_tip = 15.0;
    const Y_cava = Y_tip + D;
    const Y_top = Y_cava + H;
    const Y_anchor = Y_top - inputs.anchor_depth;

    const domain_poly = [
        [X_left, Y_bedrock],
        [X_right, Y_bedrock],
        [X_right, Y_top],
        [X_wall_right, Y_top],
        [X_wall_left, Y_cava],
        [X_left, Y_cava]
    ];

    const bedrock_poly = [
        [X_left, Y_bedrock],
        [X_right, Y_bedrock],
        [X_right, Y_tip - 3.0],
        [X_left, Y_tip - 3.0]
    ];

    const passive_poly = [
        [X_left, Y_tip - 3.0],
        [X_wall_left, Y_tip - 3.0],
        [X_wall_left, Y_cava],
        [X_left, Y_cava]
    ];

    const retained_poly = [
        [X_wall_right, Y_tip - 3.0],
        [X_right, Y_tip - 3.0],
        [X_right, Y_top],
        [X_wall_right, Y_top]
    ];

    const cava_poly = [
        [X_left, Y_cava],
        [X_wall_left, Y_cava],
        [X_wall_left, Y_top],
        [X_left, Y_top]
    ];

    const wall_poly = [
        [X_wall_left, Y_tip],
        [X_wall_right, Y_tip],
        [X_wall_right, Y_top],
        [X_wall_left, Y_top]
    ];

    const materials = [
        {
            name: 'Maciço Rochoso de Base',
            color: '#475569',
            gamma: 24.0,
            E: 1500000.0,
            nu: 0.25,
            c: 350.0,
            phi: 38.0,
            tension: 50.0,
            model: 'mohr_coulomb'
        },
        {
            name: 'Solo de Fundação / Ficha',
            color: '#0d9488',
            gamma: inputs.gamma_passive || 19.0,
            E: 45000.0,
            nu: 0.30,
            c: inputs.c_passive || 5.0,
            phi: inputs.phi_passive || 32.0,
            tension: 0.0,
            model: 'mohr_coulomb'
        },
        {
            name: 'Solo de Montante / Aterro',
            color: '#d97706',
            gamma: inputs.gamma_retained || 18.0,
            E: 30000.0,
            nu: 0.30,
            c: inputs.c_retained || 0.0,
            phi: inputs.phi_retained || 30.0,
            tension: 0.0,
            model: 'mohr_coulomb'
        }
    ];

    if (isDiaphragm) {
        materials.push({
            name: 'Parede Diafragma de Concreto (t=0.8m, fck=' + (inputs.fck_concrete || 30) + 'MPa)',
            color: '#0284c7',
            gamma: 25.0,
            E: 30000000.0,
            nu: 0.20,
            c: 5000.0,
            phi: 45.0,
            tension: 2500.0,
            model: 'elastic'
        });
    } else {
        materials.push({
            name: 'Estaca-Prancha Aço (ArcelorMittal AZ fy=' + (inputs.steel_fy || 345) + 'MPa)',
            color: '#3b82f6',
            gamma: 25.0,
            E: 200000000.0,
            nu: 0.25,
            c: 12000.0,
            phi: 45.0,
            tension: 6000.0,
            model: 'elastic'
        });
    }

    const layer_polygons = [
        { polygon: bedrock_poly, material_idx: 0 },
        { polygon: passive_poly, material_idx: 1 },
        { polygon: retained_poly, material_idx: 2 },
        { polygon: cava_poly, material_idx: 1 },
        { polygon: wall_poly, material_idx: 3 }
    ];

    const anchors = [];
    if (inputs.is_anchored) {
        const L_anchor = Math.max(12.0, Math.round(H * 1.6 * 10) / 10);
        const theta_rad = 15.0 * Math.PI / 180.0;
        const X_anc2 = X_wall_right + L_anchor * Math.cos(theta_rad);
        const Y_anc2 = Y_anchor - L_anchor * Math.sin(theta_rad);

        let T0 = 120.0;
        if (flexWallData && flexWallData.forces && flexWallData.forces.anchor_force) {
            T0 = flexWallData.forces.anchor_force;
        } else {
            T0 = Math.max(80.0, inputs.q_surcharge * 2.0 + 16.0 * H);
        }

        anchors.push({
            id: 1,
            x1: roundCoord(X_wall_right),
            y1: roundCoord(Y_anchor),
            x2: roundCoord(X_anc2),
            y2: roundCoord(Y_anc2),
            ea: 250000.0,
            prestress: Math.round(T0 * 10) / 10,
            active_stages: [3, 4]
        });
    }

    const surcharges = [];
    if (inputs.q_surcharge > 0) {
        surcharges.push({
            x1: roundCoord(X_wall_right + 1.0),
            x2: roundCoord(Math.min(X_right - 1.0, X_wall_right + 1.0 + H * 1.6)),
            q: parseFloat(inputs.q_surcharge)
        });
    }

    const typeLabel = isDiaphragm ? 'Parede Diafragma' : 'Estaca-Prancha Metálica';
    const stages = [
        {
            id: 1,
            name: 'Fase 1: Maciço Inteiriço In-Situ',
            active_polygons: [0, 1, 2, 3],
            reset_disp: true,
            description: 'Equilíbrio geostático confinador inicial antes da abertura de cava.'
        },
        {
            id: 2,
            name: 'Fase 2: Instalação da Contenção (' + typeLabel + ')',
            active_polygons: [0, 1, 2, 3, 4],
            reset_disp: false,
            description: 'Cravação / concretagem do elemento estrutural de contenção (t=' + t_wall + 'm, L=' + L_wall.toFixed(1) + 'm).'
        },
        {
            id: 3,
            name: 'Fase 3: Escavação da Cava' + (inputs.is_anchored ? ' e Protensão do Tirante' : ''),
            active_polygons: [0, 1, 2, 4],
            reset_disp: false,
            description: 'Abertura da cava de ' + H.toFixed(1) + 'm' + (inputs.is_anchored ? ' e aplicação da protensão de tirante.' : '.')
        },
        {
            id: 4,
            name: 'Fase 4: Sobrecargas Operacionais de Borda',
            active_polygons: [0, 1, 2, 4],
            active_surcharges: surcharges.length > 0 ? [0] : [],
            reset_disp: false,
            description: 'Aplicação da sobrecarga nominal de ' + inputs.q_surcharge + ' kPa na borda.'
        }
    ];

    const rs2Model = {
        name: typeLabel + (inputs.is_anchored ? ' Ancorada' : ' em Balanço') + ' (H=' + H.toFixed(1) + 'm, D=' + D.toFixed(1) + 'm)',
        type: 'retaining_wall',
        retaining_type: isDiaphragm ? 'diaphragm' : 'sheet_pile',
        domain_poly: domain_poly,
        internal_boundaries: [],
        layer_polygons: layer_polygons,
        materials: materials,
        anchors: anchors,
        surcharges: surcharges,
        stages: stages,
        target_elem_size: 1.3,
        k0: 0.50
    };

    try {
        sessionStorage.setItem('rs2_imported_model', JSON.stringify(rs2Model));
        window.location.href = 'rs2_fem.html';
    } catch (err) {
        console.error('Falha ao exportar modelo flexível para RS2:', err);
        alert('Erro ao transferir dados para o RS2: ' + err.message);
    }
}

function roundCoord(v) {
    return Math.round(v * 1000) / 1000;
}

window.exportFlexibleToRS2FEA = exportFlexibleToRS2FEA;

// -------------------------------------------------------------
// Memorial de Cálculo & Verificações Técnicas
// -------------------------------------------------------------
function openFlexibleMemorial() {
    const modal = document.getElementById('flex-memorial-modal');
    if (!modal) return;

    if (!flexWallData || !flexWallData.memorial) {
        triggerFlexibleCalculation().then(() => {
            renderFlexibleMemorial(flexWallData);
            modal.classList.remove('hidden');
        });
        return;
    }
    renderFlexibleMemorial(flexWallData);
    modal.classList.remove('hidden');
}

function closeFlexibleMemorial() {
    const modal = document.getElementById('flex-memorial-modal');
    if (modal) modal.classList.add('hidden');
}

function printFlexibleMemorial() {
    const memBody = document.getElementById('flex-memorial-body');
    if (!memBody) return;

    const printWin = window.open('', '_blank', 'width=950,height=800');
    if (!printWin) {
        window.print();
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Memorial de Cálculo - Contenção Flexível</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; margin: 25px; color: #0f172a; line-height: 1.5; font-size: 12px; }
                h1 { font-size: 19px; color: #1e3a8a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-bottom: 12px; }
                h2 { font-size: 14px; color: #1e40af; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-top: 18px; margin-bottom: 8px; }
                h3 { font-size: 12px; color: #334155; margin-top: 10px; margin-bottom: 4px; }
                table { width: 100%; border-collapse: collapse; margin: 8px 0 14px 0; font-size: 11px; }
                th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: left; }
                th { background-color: #f1f5f9; font-weight: bold; color: #1e293b; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-mono { font-family: Consolas, monospace; }
                .badge-ok { background-color: #dcfce7; color: #166534; font-weight: bold; padding: 2px 7px; border-radius: 4px; }
                .badge-warn { background-color: #fef3c7; color: #92400e; font-weight: bold; padding: 2px 7px; border-radius: 4px; }
                .badge-fail { background-color: #fee2e2; color: #991b1b; font-weight: bold; padding: 2px 7px; border-radius: 4px; }
                .eq-box { background: #f8fafc; border-left: 3px solid #3b82f6; padding: 6px 10px; margin: 6px 0; font-family: Consolas, monospace; font-size: 11px; }
                .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; margin-bottom: 10px; }
                @media print {
                    body { margin: 12mm; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>📑 Memorial de Cálculo Geotécnico & Estrutural</h1>
            <div>${memBody.innerHTML}</div>
            <script>window.onload = function() { window.print(); }<\/script>
        </body>
        </html>
    `);
    printWin.document.close();
}

function renderFlexibleMemorial(res) {
    const container = document.getElementById('flex-memorial-body');
    if (!container || !res || !res.memorial) return;

    const m = res.memorial;
    const pInfo = m.project_info;
    const layers = m.soil_layers || [];
    const chkTable = m.checkpoints_table || [];
    const resForces = m.resultants || {};
    const verifs = m.verifications || [];

    let html = `
        <!-- Seção 1: Identificação e Geometria do Projeto -->
        <div class="bg-slate-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-extrabold text-blue-900 dark:text-blue-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>📐</span> 1. Identificação e Geometria do Projeto
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                    <span class="text-gray-500 block">Tipo de Parede:</span>
                    <strong class="text-gray-900 dark:text-gray-100 font-bold">${pInfo.wall_type_label}</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Condição de Apoio:</span>
                    <strong class="text-gray-900 dark:text-gray-100 font-bold">${pInfo.support_type_label}</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Altura Escavada H:</span>
                    <strong class="text-gray-900 dark:text-gray-100 font-bold">${pInfo.H.toFixed(2)} m</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Ficha Executiva D:</span>
                    <strong class="text-blue-600 dark:text-blue-400 font-bold">${pInfo.D_exec.toFixed(2)} m</strong>
                    <span class="text-[10px] text-gray-400 block">(Requerida Blum: ${pInfo.D_req.toFixed(2)} m)</span>
                </div>
                <div>
                    <span class="text-gray-500 block">Comprimento Total L:</span>
                    <strong class="text-indigo-600 dark:text-indigo-400 font-bold">${pInfo.total_length.toFixed(2)} m</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Sobrecarga q no Topo:</span>
                    <strong class="text-gray-900 dark:text-gray-100 font-bold">${pInfo.q_surcharge.toFixed(1)} kPa</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Cota do Tirante:</span>
                    <strong class="text-gray-900 dark:text-gray-100 font-bold">${pInfo.anchor_depth ? pInfo.anchor_depth.toFixed(2) + ' m' : 'N/A (Livre)'}</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Perfil / Seção Adotada:</span>
                    <strong class="text-blue-700 dark:text-blue-300 font-bold">${pInfo.profile_name || 'Personalizado'}</strong>
                    <span class="text-[10px] text-gray-400 block">${pInfo.section_mode === 'custom' ? 'Modo Manual' : 'Catálogo Comercial'}</span>
                </div>
                <div>
                    <span class="text-gray-500 block">Módulo Resistente W_el:</span>
                    <strong class="text-indigo-600 dark:text-indigo-400 font-bold">${pInfo.W_el ? pInfo.W_el.toLocaleString('pt-BR') + ' cm³/m' : '-'}</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Inércia da Seção I_x:</span>
                    <strong class="text-blue-600 dark:text-blue-400 font-bold">${pInfo.I_x ? pInfo.I_x.toLocaleString('pt-BR') + ' cm⁴/m' : (pInfo.I_cm4 ? pInfo.I_cm4.toLocaleString('pt-BR') + ' cm⁴/m' : '-')}</strong>
                </div>
                <div>
                    <span class="text-gray-500 block">Rigidez Flexional EI:</span>
                    <strong class="text-emerald-600 dark:text-emerald-400 font-bold">${pInfo.EI_wall.toLocaleString('pt-BR')} kNm²/m</strong>
                    <span class="text-[10px] text-gray-400 block">E = ${pInfo.E_GPa || 210} GPa</span>
                </div>
                <div>
                    <span class="text-gray-500 block">Resistência do Aço:</span>
                    <strong class="text-gray-900 dark:text-gray-100 font-bold">f_y = ${pInfo.fy_MPa || 345} MPa</strong>
                    ${pInfo.M_rd ? `<span class="text-[10px] text-gray-400 block">M_rd = ${pInfo.M_rd.toFixed(1)} kNm/m</span>` : ''}
                </div>
            </div>
        </div>

        <!-- Seção 2: Caracterização Geotécnica & Coeficientes de Empuxo -->
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-extrabold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span>🌍</span> 2. Parâmetros Geotécnicos & Formulação dos Empuxos
            </h4>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Os coeficientes de empuxo ativo (<code class="font-mono font-bold">Ka</code>) e passivo (<code class="font-mono font-bold">Kp</code>) são computados considerando a teoria de Coulomb com atrito solo-parede <code class="font-mono">δ = 2/3 · ϕ'</code>. Para a resistência passiva, adota-se minoração por <code class="font-mono">FS_passivo = 1.50</code>.
            </p>
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left border border-gray-200 dark:border-gray-700">
                    <thead class="bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 uppercase text-[10px]">
                        <tr>
                            <th class="p-2">Camada</th>
                            <th class="p-2 text-center">Espessura (m)</th>
                            <th class="p-2 text-center">Cotas z (m)</th>
                            <th class="p-2 text-center">γ / γ_sat (kN/m³)</th>
                            <th class="p-2 text-center">ϕ' (°)</th>
                            <th class="p-2 text-center">c' (kPa)</th>
                            <th class="p-2 text-center">Ka (Ativo)</th>
                            <th class="p-2 text-center">Kp (Passivo)</th>
                            <th class="p-2 text-center">Kp,eff (Kp / 1.5)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700 font-mono text-[11px]">
    `;

    layers.forEach(lay => {
        html += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td class="p-2 font-sans font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                    <span class="w-2.5 h-2.5 rounded-full inline-block" style="background-color: ${lay.color || '#3b82f6'};"></span>
                    ${lay.name}
                </td>
                <td class="p-2 text-center">${lay.thickness.toFixed(2)}</td>
                <td class="p-2 text-center">${lay.top.toFixed(1)} → ${lay.bottom.toFixed(1)}</td>
                <td class="p-2 text-center">${lay.gamma.toFixed(1)} / ${lay.gamma_sat.toFixed(1)}</td>
                <td class="p-2 text-center">${lay.phi.toFixed(1)}°</td>
                <td class="p-2 text-center">${lay.cohesion.toFixed(1)}</td>
                <td class="p-2 text-center font-bold text-amber-700 dark:text-amber-300">${lay.Ka.toFixed(3)}</td>
                <td class="p-2 text-center">${lay.Kp.toFixed(3)}</td>
                <td class="p-2 text-center font-bold text-teal-600 dark:text-teal-400">${(lay.Kp / 1.5).toFixed(3)}</td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Seção 3: Tabela Cota a Cota de Tensões e Empuxos -->
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span>📊</span> 3. Memorial Cota a Cota de Tensões Geostáticas e Empuxos Horizontais
            </h4>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">
                Tensões verticais totais <code class="font-mono">σv</code>, poro-pressão <code class="font-mono">u</code>, tensão efetiva <code class="font-mono">σ'v = σv - u</code> e empuxos laterais <code class="font-mono">p'a, p_net</code> integrados nos pontos de descontinuidade do perfil:
            </p>
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left border border-gray-200 dark:border-gray-700">
                    <thead class="bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-200 uppercase text-[10px]">
                        <tr>
                            <th class="p-2">Cota z (m)</th>
                            <th class="p-2">Camada</th>
                            <th class="p-2 text-right">σv (kPa)</th>
                            <th class="p-2 text-right">u (kPa)</th>
                            <th class="p-2 text-right">σ'v (kPa)</th>
                            <th class="p-2 text-right">p'_a (kPa)</th>
                            <th class="p-2 text-right">p_a,tot (kPa)</th>
                            <th class="p-2 text-right">p_p,tot (kPa)</th>
                            <th class="p-2 text-right font-bold">p_net (kPa)</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700 font-mono text-[11px]">
    `;

    chkTable.forEach(row => {
        const netColor = row.p_net >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-teal-600 dark:text-teal-400';
        html += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td class="p-2 font-bold font-sans">${row.z.toFixed(2)}</td>
                <td class="p-2 font-sans text-gray-500">${row.layer_name}</td>
                <td class="p-2 text-right">${row.sigma_v_total.toFixed(1)}</td>
                <td class="p-2 text-right text-cyan-600 dark:text-cyan-400">${row.u_water.toFixed(1)}</td>
                <td class="p-2 text-right font-semibold">${row.sigma_v_eff.toFixed(1)}</td>
                <td class="p-2 text-right">${row.p_act_eff.toFixed(1)}</td>
                <td class="p-2 text-right">${row.p_act_total.toFixed(1)}</td>
                <td class="p-2 text-right">${row.p_pas_total.toFixed(1)}</td>
                <td class="p-2 text-right font-bold ${netColor}">${row.p_net.toFixed(1)}</td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>

            <!-- Resultantes Integradas -->
            <div class="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
                <div class="bg-blue-50 dark:bg-blue-950/30 p-2.5 rounded-lg border border-blue-200 dark:border-blue-900">
                    <span class="text-blue-900 dark:text-blue-300 font-bold block">Empuxo Ativo Total Solicitante (Ea):</span>
                    <strong class="text-base text-blue-700 dark:text-blue-200 font-mono">${resForces.E_a_total?.toFixed(1) || '-'} kN/m</strong>
                    <span class="text-[11px] text-gray-500 block">Ponto de aplicação: z_a = ${resForces.z_a_centroid?.toFixed(2) || '-'} m</span>
                </div>
                <div class="bg-teal-50 dark:bg-teal-950/30 p-2.5 rounded-lg border border-teal-200 dark:border-teal-900">
                    <span class="text-teal-900 dark:text-teal-300 font-bold block">Empuxo Passivo Total Resistente (Ep):</span>
                    <strong class="text-base text-teal-700 dark:text-teal-200 font-mono">${resForces.E_p_total?.toFixed(1) || '-'} kN/m</strong>
                    <span class="text-[11px] text-gray-500 block">Ponto de aplicação: z_p = ${resForces.z_p_centroid?.toFixed(2) || '-'} m</span>
                </div>
            </div>
        </div>

        <!-- Seção 4: Quadro de Verificações Técnicas Detalhadas (ELU & ELS) -->
        <div class="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <h4 class="text-sm font-extrabold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span>🛡️</span> 4. Quadro Completo de Verificações Técnicas Normativas (ELU e ELS)
            </h4>
            <div class="space-y-3">
    `;

    verifs.forEach(v => {
        let badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200';
        let badgeIcon = '✓';
        if (v.status === 'REPROVADO') {
            badgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200';
            badgeIcon = '✕';
        } else if (v.status === 'ATENÇÃO' || v.status === 'ALERTA' || v.status === 'SOBREDIMENSIONAR') {
            badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200';
            badgeIcon = '⚠';
        }

        html += `
            <div class="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30 flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div class="flex-1">
                    <div class="flex items-center gap-2">
                        <strong class="text-xs font-bold text-gray-900 dark:text-gray-100">${v.name}</strong>
                        <span class="text-[10px] text-gray-500 font-mono">(${v.criterion})</span>
                    </div>
                    <p class="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">${v.detail}</p>
                </div>
                <div class="flex items-center gap-3 shrink-0">
                    <span class="font-mono text-xs font-extrabold text-gray-800 dark:text-gray-200">${v.calculated}</span>
                    <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeClass}">
                        ${badgeIcon} ${v.status}
                    </span>
                </div>
            </div>
        `;
    });

    html += `
            </div>
        </div>

        <!-- Seção 5: Conclusão e Premissas -->
        <div class="p-3.5 rounded-xl bg-slate-100 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400">
            <strong class="text-gray-700 dark:text-gray-300 block mb-1">Notas Metodológicas e Normativas:</strong>
            1. Análise executada pelo Método de Suporte Livre de Blum (Free Earth Support) conforme premissas da ABNT NBR 11682 e ArcelorMittal Piling Handbook.<br>
            2. O dimensionamento em flexão adota coeficiente de majoração γf = 1,40 para os esforços solicitantes característicos.<br>
            3. A verificação do Estado Limite de Serviço (ELS) considera a deformação no topo da contenção calculada por integração da curvatura M(z)/EI, comparada ao limite admissível de H/200.
        </div>
    `;

    container.innerHTML = html;
}

window.openFlexibleMemorial = openFlexibleMemorial;
window.closeFlexibleMemorial = closeFlexibleMemorial;
window.printFlexibleMemorial = printFlexibleMemorial;
window.renderFlexibleMemorial = renderFlexibleMemorial;

