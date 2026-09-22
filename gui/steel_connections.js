/**
 * Unified Steel Connections Controller (ABNT NBR 8800 & AISC 360-22)
 * Executive RS2-Style Layout for Base Plate & Splice Connections
 * 
 * Pure mathematical switch between:
 * 1. ABNT NBR 8800 / CBCA (Manuais Brasileiros)
 * 2. AISC 360-22 (LRFD - Load & Resistance Factor Design)
 * 3. AISC 360-22 (ASD - Allowable Strength Design)
 */

// Global State
let currentStandard = 'nbr'; // 'nbr' | 'aisc_lrfd' | 'aisc_asd'
let currentTypology = 'base_plate'; // Default to base_plate per user request
let connectionResult = null;

// Database of standard W & HP profiles for quick 1-click selection
const STANDARD_PROFILES = {
    'W150x22.5': { d: 152, bf: 152, tw: 5.8, tf: 6.6, Zx: 184, weight: 22.5 },
    'W200x35.9': { d: 201, bf: 165, tw: 6.2, tf: 10.2, Zx: 382, weight: 35.9 },
    'W250x44.9': { d: 260, bf: 148, tw: 7.6, tf: 13.0, Zx: 604, weight: 44.9 },
    'W250x73':   { d: 253, bf: 254, tw: 8.6, tf: 14.2, Zx: 984, weight: 73.0 },
    'W310x38.7': { d: 310, bf: 165, tw: 5.8, tf: 9.7,  Zx: 629, weight: 38.7 },
    'W310x79':   { d: 306, bf: 254, tw: 8.8, tf: 14.6, Zx: 1400, weight: 79.0 },
    'W310x107':  { d: 311, bf: 306, tw: 10.9, tf: 17.0, Zx: 1980, weight: 107.0 },
    'W360x44':   { d: 352, bf: 171, tw: 6.9, tf: 9.8,  Zx: 775, weight: 44.0 },
    'W360x134':  { d: 356, bf: 369, tw: 15.3, tf: 24.9, Zx: 3260, weight: 134.0 },
    'W410x60':   { d: 407, bf: 178, tw: 7.7, tf: 12.8, Zx: 1190, weight: 60.0 },
    'W530x85':   { d: 535, bf: 166, tw: 8.9, tf: 16.5, Zx: 2060, weight: 85.0 },
    'HP310x125': { d: 312, bf: 310, tw: 15.5, tf: 15.5, Zx: 1880, weight: 125.0 }
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const stdParam = urlParams.get('standard');
    const typeParam = urlParams.get('typology') || urlParams.get('type');

    if (typeParam && ['base_plate', 'splice', 'flexible_end_plate', 'double_angle', 'shear_tab', 'extended_end_plate'].includes(typeParam)) {
        currentTypology = typeParam;
    }

    if (stdParam) {
        const s = stdParam.toLowerCase();
        if (s === 'aisc' || s === 'aisc_lrfd' || s === 'lrfd') {
            currentStandard = 'aisc_lrfd';
        } else if (s === 'aisc_asd' || s === 'asd') {
            currentStandard = 'aisc_asd';
        } else {
            currentStandard = 'nbr';
        }
    }

    // 2. Initialize UI
    updateStandardUI();
    selectTypology(currentTypology);
});

// =============================================================
// STANDARD SWITCHER (NBR 8800 vs AISC 360 LRFD vs AISC 360 ASD)
// =============================================================
function switchStandard(std) {
    currentStandard = std;
    updateStandardUI();
    renderSpecificInputs();
    triggerConnectionCalculation();
}
window.switchStandard = switchStandard;

function updateStandardUI() {
    const btnNbr = document.getElementById('btn-switch-nbr');
    const btnAiscLrfd = document.getElementById('btn-switch-aisc-lrfd');
    const btnAiscAsd = document.getElementById('btn-switch-aisc-asd');
    const normBadge = document.getElementById('header-norm-badge');

    const activeClass = 'std-tab-btn active flex items-center gap-2 px-3.5 py-2 rounded-lg font-bold text-xs md:text-sm transition-all shadow-xs';
    const inactiveClass = 'std-tab-btn flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs md:text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all';

    if (btnNbr) btnNbr.className = (currentStandard === 'nbr') ? activeClass : inactiveClass;
    if (btnAiscLrfd) btnAiscLrfd.className = (currentStandard === 'aisc_lrfd') ? activeClass : inactiveClass;
    if (btnAiscAsd) btnAiscAsd.className = (currentStandard === 'aisc_asd') ? activeClass : inactiveClass;

    const canvasTitle = document.getElementById('conn-canvas-title');
    const tableTitle = document.getElementById('conn-table-title');
    const thCap = document.getElementById('th-capacity');
    const thDem = document.getElementById('th-demand');
    const kpiDem = document.getElementById('conn-kpi-demand-title');
    const kpiCap = document.getElementById('conn-kpi-cap-title');
    const kpiUr = document.getElementById('conn-kpi-ur-title');
    const kpiUrSub = document.getElementById('conn-res-ur-sub');
    const specHeader = document.getElementById('conn-spec-header-title');

    if (currentStandard === 'nbr') {
        if (normBadge) normBadge.innerText = 'ABNT NBR 8800:2008 (CBCA)';
        if (canvasTitle) canvasTitle.innerText = 'Detalhe Gráfico da Ligação (ABNT NBR 8800 / CBCA)';
        if (tableTitle) tableTitle.innerText = 'Estados Limites Últimos (NBR 8800)';
        if (thCap) thCap.innerText = 'Capacidade Rd';
        if (thDem) thDem.innerText = 'Solicitação Sd';
        if (kpiDem) kpiDem.innerText = 'Esforço Sd';
        if (kpiCap) kpiCap.innerText = 'Capacidade Rd';
        if (kpiUr) kpiUr.innerText = 'Utilização';
        if (kpiUrSub) kpiUrSub.innerText = 'Sd / Rd';
        if (specHeader) specHeader.innerText = 'Especificações Construtivas Detalhadas (ABNT NBR 8800 / CBCA):';
    } else if (currentStandard === 'aisc_lrfd') {
        if (normBadge) normBadge.innerText = 'AISC 360-22 (LRFD)';
        if (canvasTitle) canvasTitle.innerText = '2D Connection Detail (AISC 360-22 LRFD)';
        if (tableTitle) tableTitle.innerText = 'Limit States & Design Strength (AISC 360-22 LRFD)';
        if (thCap) thCap.innerText = 'Design Str. φRn';
        if (thDem) thDem.innerText = 'Required Str. Ru';
        if (kpiDem) kpiDem.innerText = 'Demand Ru';
        if (kpiCap) kpiCap.innerText = 'Capacity φRn';
        if (kpiUr) kpiUr.innerText = 'Util. Ratio';
        if (kpiUrSub) kpiUrSub.innerText = 'Ru / φRn';
        if (specHeader) specHeader.innerText = 'Detailed Constructive Specifications (AISC 360-22 LRFD):';
    } else {
        if (normBadge) normBadge.innerText = 'AISC 360-22 (ASD)';
        if (canvasTitle) canvasTitle.innerText = '2D Connection Detail (AISC 360-22 ASD)';
        if (tableTitle) tableTitle.innerText = 'Limit States & Allowable Strength (AISC 360-22 ASD)';
        if (thCap) thCap.innerText = 'Allowable Str. Rn/Ω';
        if (thDem) thDem.innerText = 'Required Str. Ra';
        if (kpiDem) kpiDem.innerText = 'Demand Ra';
        if (kpiCap) kpiCap.innerText = 'Capacity Rn/Ω';
        if (kpiUr) kpiUr.innerText = 'Util. Ratio';
        if (kpiUrSub) kpiUrSub.innerText = 'Ra / (Rn/Ω)';
        if (specHeader) specHeader.innerText = 'Detailed Constructive Specifications (AISC 360-22 ASD):';
    }
}

// =============================================================
// TYPOLOGY TABS NAVIGATION
// =============================================================
function selectTypology(typologyKey) {
    currentTypology = typologyKey;
    const tabs = ['base_plate', 'splice', 'flexible_end_plate', 'double_angle', 'shear_tab', 'extended_end_plate'];
    const tabShorts = {
        base_plate: 'bp',
        splice: 'sp',
        flexible_end_plate: 'fep',
        double_angle: 'da',
        shear_tab: 'st',
        extended_end_plate: 'eep'
    };

    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${tabShorts[t]}`);
        if (btn) {
            if (t === typologyKey) {
                btn.className = 'py-2.5 px-4 font-semibold text-xs md:text-sm border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 flex items-center gap-1.5 transition-all cursor-pointer';
            } else {
                btn.className = 'py-2.5 px-4 font-semibold text-xs md:text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center gap-1.5 transition-all cursor-pointer';
            }
        }
    });

    renderSpecificInputs();
    triggerConnectionCalculation();
}
window.selectTypology = selectTypology;

// =============================================================
// RS2-STYLE EXECUTIVE INPUT CARDS RENDERER
// =============================================================
function renderSpecificInputs() {
    const container = document.getElementById('conn-cards-container');
    if (!container) return;

    // Standard-adaptive label helpers
    const vLabel = currentStandard === 'nbr' ? 'Esforço Cortante V_sd (kN)' : (currentStandard === 'aisc_asd' ? 'Shear Force Va (kN)' : 'Shear Force Vu (kN)');
    const mLabel = currentStandard === 'nbr' ? 'Momento Fletor M_sd (kNm)' : (currentStandard === 'aisc_asd' ? 'Bending Moment Ma (kNm)' : 'Bending Moment Mu (kNm)');
    const nLabel = currentStandard === 'nbr' ? 'Carga Axial N_sd (kN)' : (currentStandard === 'aisc_asd' ? 'Axial Load Pa (kN)' : 'Axial Load Pu (kN)');
    const fcLabel = currentStandard === 'nbr' ? 'fck do Concreto (MPa)' : "Concrete f'c (MPa)";

    if (currentTypology === 'base_plate') {
        container.innerHTML = `
            <!-- Panel 0: Perfil do Pilar & Materiais (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                        <span>🏛️</span> Perfil do Pilar & Materiais
                    </h3>
                    <span id="bp-col-badge" class="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-bold px-2 py-0.5 rounded">
                        W250x73 • A572 Gr50
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-indigo-50/50 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Dimensões da Seção:</span>
                        <span id="bp-sum-col-dims" class="font-mono font-semibold text-gray-800 dark:text-gray-200">d = 253 mm | bf = 254 mm</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Espessuras (tw / tf):</span>
                        <span id="bp-sum-col-thick" class="font-mono text-gray-800 dark:text-gray-200">tw = 8.6 mm | tf = 14.2 mm</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Solda Pilar-Placa:</span>
                        <span id="bp-sum-col-weld" class="font-semibold text-emerald-600 dark:text-emerald-400">Filete fw = 6.0 mm (aw = 4.2 mm)</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div class="col-span-2">
                        <label class="eng-label">Perfil Padronizado do Pilar</label>
                        <select id="bp-profile-select" onchange="onBasePlateProfileSelect(this.value)" class="eng-select font-semibold">
                            <option value="W250x73" selected>W250x73 (Pilar Padrão - bf=254 mm)</option>
                            <option value="W150x22.5">W150x22.5 (Pilar Leve - bf=152 mm)</option>
                            <option value="W200x35.9">W200x35.9 (bf=165 mm)</option>
                            <option value="W250x44.9">W250x44.9 (bf=148 mm)</option>
                            <option value="W310x79">W310x79 (bf=254 mm)</option>
                            <option value="W310x107">W310x107 (Pilar Robusto - bf=306 mm)</option>
                            <option value="W360x134">W360x134 (Pórtico Pesado - bf=369 mm)</option>
                            <option value="HP310x125">HP310x125 (Estaca/Pilar HP - bf=310 mm)</option>
                            <option value="custom">Personalizado (Digitar medidas)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Altura Pilar d (mm)</label>
                        <input type="number" id="inp-dcol" value="253" step="1" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Largura Mesa bf (mm)</label>
                        <input type="number" id="inp-bfcol" value="254" step="1" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Alma tw (mm)</label>
                        <input type="number" id="inp-twcol" value="8.6" step="0.1" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Mesa tf (mm)</label>
                        <input type="number" id="inp-tfcol" value="14.2" step="0.1" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Aço Estrutural</label>
                        <select id="conn-steel-grade" onchange="onInputChange()" class="eng-select">
                            <option value="ASTM A572 Gr50" selected>ASTM A572 Gr.50 (fy=345 MPa)</option>
                            <option value="ASTM A36">ASTM A36 (fy=250 MPa)</option>
                            <option value="USI CIVIL 300">USI CIVIL 300 (fy=300 MPa)</option>
                            <option value="USI CIVIL 350">USI CIVIL 350 (fy=350 MPa)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Perna da Solda fw (mm)</label>
                        <input type="number" id="conn-weld-size" value="6.0" step="1.0" min="3.0" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>

            <!-- Panel 1: Dimensões da Placa de Base & Concreto (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>📐</span> Placa de Base & Pedestal de Concreto
                    </h3>
                    <span id="bp-geom-badge" class="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold px-2 py-0.5 rounded">
                        380×380×25.4 mm • C25
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-blue-50/50 dark:bg-blue-950/30 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Áreas de Apoio:</span>
                        <span id="bp-sum-areas" class="font-mono text-gray-800 dark:text-gray-200">A1 = 1444 cm² | A2 = 3600 cm²</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Efeito de Confinamento:</span>
                        <span id="bp-sum-conf" class="font-semibold text-indigo-600 dark:text-indigo-400">√(A2/A1) = 1.58 ≤ 2.00</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Balanços Críticos (m, n, λn'):</span>
                        <span id="bp-sum-cantilevers" class="font-mono text-xs text-emerald-600 dark:text-emerald-400">m = 69.8 mm | n = 88.4 mm</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">Comprimento Placa N / Ap (mm)</label>
                        <input type="number" id="inp-bpN" value="380" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Largura Placa B / Bp (mm)</label>
                        <input type="number" id="inp-bpB" value="380" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Placa tp (mm)</label>
                        <input type="number" id="inp-tplate" value="25.4" step="1.0" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">${fcLabel}</label>
                        <input type="number" id="inp-fck" value="25" step="5" min="15" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Largura Pedestal B_c (mm)</label>
                        <input type="number" id="inp-pedB" value="600" step="20" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Comprimento Pedestal A_c (mm)</label>
                        <input type="number" id="inp-pedN" value="600" step="20" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>

            <!-- Panel 2: Chumbadores & Furação da Base (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>🔩</span> Chumbadores & Furação da Base
                    </h3>
                    <span id="bp-anchor-badge" class="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 font-bold px-2 py-0.5 rounded">
                        4x 3/4" • ASTM A307
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-amber-50/50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Furação da Placa Base:</span>
                        <span id="bp-sum-hole" class="font-mono text-gray-800 dark:text-gray-200">d0 = 21.0 mm (furo padrão)</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Disposição dos Tirantes:</span>
                        <span id="bp-sum-anchor-pos" class="font-semibold text-gray-800 dark:text-gray-200">4 Cantos (gb = 260 mm, pb = 260 mm)</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Área Efetiva Total:</span>
                        <span id="bp-sum-anchor-area" class="font-mono text-amber-700 dark:text-amber-400 font-bold">Ase = 11.4 cm²</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">Diâmetro Chumbador db</label>
                        <select id="conn-bolt-d" onchange="onInputChange()" class="eng-select">
                            <option value="1/2&quot;">1/2" (12.7 mm)</option>
                            <option value="5/8&quot;">5/8" (15.9 mm)</option>
                            <option value="3/4&quot;" selected>3/4" (19.05 mm)</option>
                            <option value="7/8&quot;">7/8" (22.2 mm)</option>
                            <option value="1&quot;">1" (25.4 mm)</option>
                            <option value="1-1/8&quot;">1-1/8" (28.6 mm)</option>
                            <option value="1-1/4&quot;">1-1/4" (31.8 mm)</option>
                            <option value="M16">M16 (16.0 mm)</option>
                            <option value="M20">M20 (20.0 mm)</option>
                            <option value="M24">M24 (24.0 mm)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Classe do Chumbador</label>
                        <select id="conn-bolt-grade" onchange="onInputChange()" class="eng-select">
                            <option value="ASTM A307" selected>ASTM A307 (fub = 415 MPa)</option>
                            <option value="ASTM A325">ASTM A325 (fub = 825 MPa)</option>
                            <option value="SAE 1020">SAE 1020 (fub = 380 MPa)</option>
                            <option value="ISO 8.8">Grau 8.8 (fub = 800 MPa)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Quantidade de Chumbadores</label>
                        <select id="inp-num-anchors" onchange="onInputChange()" class="eng-select">
                            <option value="2">2 Chumbadores (Eixo Central)</option>
                            <option value="4" selected>4 Chumbadores (Cantos / 2 Linhas)</option>
                            <option value="6">6 Chumbadores (3 Linhas)</option>
                            <option value="8">8 Chumbadores (Pórtico Pesado)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Embutimento no Concreto hef (mm)</label>
                        <input type="number" id="inp-hef" value="300" step="25" min="150" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Dist. Transversal gb (mm)</label>
                        <input type="number" id="inp-gb" value="260" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Dist. Longitudinal pb (mm)</label>
                        <input type="number" id="inp-pb" value="260" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>

            <!-- Panel 3: Esforços Solicitantes no Apoio (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>⚡</span> Esforços Solicitantes no Apoio
                    </h3>
                    <span id="bp-load-badge" class="text-[10px] bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 font-bold px-2 py-0.5 rounded">
                        ELU Solicitante
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-rose-50/50 dark:bg-rose-950/30 p-2.5 rounded-xl border border-rose-100 dark:border-rose-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Excentricidade e = M/N:</span>
                        <span id="bp-sum-ecc" class="font-mono text-gray-800 dark:text-gray-200">e = 0.0 mm (Pequena Excentricidade)</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Tração nos Chumbadores:</span>
                        <span id="bp-sum-tension" class="font-semibold text-emerald-600 dark:text-emerald-400">Tu = 0.0 kN (Sem tração ativa)</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Atrito Basal Disponível:</span>
                        <span id="bp-sum-fric" class="font-mono text-blue-600 dark:text-blue-400">μ·N = 140.0 kN (Atrito suficiente)</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">${nLabel}</label>
                        <input type="number" id="inp-Nsd" value="350" step="25" oninput="onInputChange()" class="eng-input font-bold">
                    </div>
                    <div>
                        <label class="eng-label">${mLabel}</label>
                        <input type="number" id="inp-Msd" value="0" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">${vLabel}</label>
                        <input type="number" id="inp-Vsd" value="40" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Coeficiente de Atrito μ</label>
                        <input type="number" id="inp-mu" value="0.45" step="0.05" min="0.2" max="0.7" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>
        `;
    } else if (currentTypology === 'splice') {
        container.innerHTML = `
            <!-- Panel 0: Perfil Conectado & Materiais (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                        <span>🔗</span> Perfil Conectado & Materiais
                    </h3>
                    <span id="sp-member-badge" class="text-[10px] bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 font-bold px-2 py-0.5 rounded">
                        W360x44 • A572 Gr50
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-indigo-50/50 dark:bg-indigo-950/30 p-2.5 rounded-xl border border-indigo-100 dark:border-indigo-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Dimensões da Viga/Pilar:</span>
                        <span id="sp-sum-member-dims" class="font-mono font-semibold text-gray-800 dark:text-gray-200">d = 352 mm | bf = 171 mm</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Espessuras (tw / tf):</span>
                        <span id="sp-sum-member-thick" class="font-mono text-gray-800 dark:text-gray-200">tw = 6.9 mm | tf = 9.8 mm</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Módulo Plástico & Momento:</span>
                        <span id="sp-sum-member-cap" class="font-semibold text-emerald-600 dark:text-emerald-400">Zx = 775 cm³ | Mpl = 267.4 kNm</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div class="col-span-2">
                        <label class="eng-label">Perfil Padronizado</label>
                        <select id="sp-profile-select" onchange="onSpliceProfileSelect(this.value)" class="eng-select font-semibold">
                            <option value="W360x44" selected>W360x44 (Viga de Piso - d=352 mm)</option>
                            <option value="W200x35.9">W200x35.9 (d=201 mm)</option>
                            <option value="W250x44.9">W250x44.9 (d=260 mm)</option>
                            <option value="W310x38.7">W310x38.7 (d=310 mm)</option>
                            <option value="W310x79">W310x79 (Pilar Contínuo - d=306 mm)</option>
                            <option value="W410x60">W410x60 (Viga Principal - d=407 mm)</option>
                            <option value="W530x85">W530x85 (Grande Vão - d=535 mm)</option>
                            <option value="custom">Personalizado (Digitar medidas)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Altura Viga d (mm)</label>
                        <input type="number" id="inp-dbeam" value="352" step="5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Largura Mesa bf (mm)</label>
                        <input type="number" id="inp-bfbeam" value="171" step="5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Alma tw (mm)</label>
                        <input type="number" id="inp-twbeam" value="6.9" step="0.1" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Mesa tf (mm)</label>
                        <input type="number" id="inp-tfbeam" value="9.8" step="0.1" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Aço dos Membros e Chapas</label>
                        <select id="conn-steel-grade" onchange="onInputChange()" class="eng-select">
                            <option value="ASTM A572 Gr50" selected>ASTM A572 Gr.50 (fy=345 MPa)</option>
                            <option value="ASTM A36">ASTM A36 (fy=250 MPa)</option>
                            <option value="USI CIVIL 300">USI CIVIL 300 (fy=300 MPa)</option>
                            <option value="USI CIVIL 350">USI CIVIL 350 (fy=350 MPa)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Perna da Solda fw (mm)</label>
                        <input type="number" id="conn-weld-size" value="6.0" step="1.0" min="3.0" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>

            <!-- Panel 1: Chapas de Emenda da Mesa (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>📑</span> Chapas de Emenda de Mesa (Flange)
                    </h3>
                    <span id="sp-flange-badge" class="text-[10px] bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 font-bold px-2 py-0.5 rounded">
                        2x Chapas t=12.7 mm
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-blue-50/50 dark:bg-blue-950/30 p-2.5 rounded-xl border border-blue-100 dark:border-blue-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Braço de Alavanca df:</span>
                        <span id="sp-sum-df" class="font-mono text-gray-800 dark:text-gray-200">df = 342.2 mm (d - tf)</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Força de Tração na Mesa:</span>
                        <span id="sp-sum-tf" class="font-semibold text-indigo-600 dark:text-indigo-400">Tf = M / df = 526.0 kN</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Área Bruta / Líquida Mesa:</span>
                        <span id="sp-sum-flange-areas" class="font-mono text-gray-800 dark:text-gray-200">Ag = 21.6 cm² | An = 16.8 cm²</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">Largura Chapa Mesa b_pf (mm)</label>
                        <input type="number" id="inp-bfp" value="170" step="5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Comprimento Chapa L_pf (mm)</label>
                        <input type="number" id="inp-lfp" value="400" step="20" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Chapa t_pf (mm)</label>
                        <input type="number" id="inp-tfp" value="12.7" step="0.5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Nº Parafusos Mesa (por lado)</label>
                        <select id="inp-num-bolts-f" onchange="onInputChange()" class="eng-select font-semibold">
                            <option value="2">2 Parafusos (1 linha de 2)</option>
                            <option value="4" selected>4 Parafusos (2 linhas de 2)</option>
                            <option value="6">6 Parafusos (3 linhas de 2)</option>
                            <option value="8">8 Parafusos (4 linhas de 2)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Panel 2: Chapas de Emenda da Alma (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>🛡️</span> Chapas de Emenda de Alma (Web)
                    </h3>
                    <span id="sp-web-badge" class="text-[10px] bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-300 font-bold px-2 py-0.5 rounded">
                        2x Chapas t=6.35 mm
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-purple-50/50 dark:bg-purple-950/30 p-2.5 rounded-xl border border-purple-100 dark:border-purple-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Configuração de Alma:</span>
                        <span class="font-semibold text-purple-600 dark:text-purple-400">2 Chapas (Corte Duplo nos Parafusos)</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Área de Cisalhamento:</span>
                        <span id="sp-sum-web-area" class="font-mono text-gray-800 dark:text-gray-200">Agw = 33.0 cm²</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Folga da Alma:</span>
                        <span class="text-emerald-600 dark:text-emerald-400 font-medium">Livre dos raios de concordância k</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">Altura Chapa Alma h_pw (mm)</label>
                        <input type="number" id="inp-hwp" value="260" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Comprimento Chapa L_pw (mm)</label>
                        <input type="number" id="inp-lwp" value="250" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Cada Chapa t_pw (mm)</label>
                        <input type="number" id="inp-twp" value="6.35" step="0.5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Nº Parafusos Alma (por lado)</label>
                        <select id="inp-num-bolts-w" onchange="onInputChange()" class="eng-select font-semibold">
                            <option value="4">4 Parafusos (2 linhas x 2 cols)</option>
                            <option value="6" selected>6 Parafusos (3 linhas x 2 cols)</option>
                            <option value="8">8 Parafusos (4 linhas x 2 cols)</option>
                            <option value="3">3 Parafusos (3 linhas x 1 col)</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Panel 3: Parafusos da Ligação (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>🔩</span> Parafusos & Furação da Emenda
                    </h3>
                    <span id="sp-bolts-badge" class="text-[10px] bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-300 font-bold px-2 py-0.5 rounded">
                        3/4" ASTM A325
                    </span>
                </div>

                <!-- RS2 Summary Preview Box -->
                <div class="bg-amber-50/50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-100 dark:border-amber-900/50 text-xs space-y-1.5">
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Furação da Ligação:</span>
                        <span id="sp-sum-hole" class="font-mono text-gray-800 dark:text-gray-200">d0 = 21.0 mm | emin = 28 mm</span>
                    </div>
                    <div class="flex justify-between items-center text-gray-700 dark:text-gray-300">
                        <span class="text-[11px] font-medium text-gray-500 dark:text-gray-400">Cisalhamento Simples / Duplo:</span>
                        <span id="sp-sum-shear-cap" class="font-mono text-amber-700 dark:text-amber-400 font-semibold">VR,1 = 79.5 kN | VR,2 = 159.0 kN</span>
                    </div>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">Diâmetro do Parafuso</label>
                        <select id="conn-bolt-d" onchange="onInputChange()" class="eng-select">
                            <option value="5/8&quot;">5/8" (15.9 mm)</option>
                            <option value="3/4&quot;" selected>3/4" (19.05 mm)</option>
                            <option value="7/8&quot;">7/8" (22.2 mm)</option>
                            <option value="1&quot;">1" (25.4 mm)</option>
                            <option value="M16">M16 (16.0 mm)</option>
                            <option value="M20">M20 (20.0 mm)</option>
                            <option value="M24">M24 (24.0 mm)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Classe do Parafuso</label>
                        <select id="conn-bolt-grade" onchange="onInputChange()" class="eng-select">
                            <option value="ASTM A325" selected>ASTM A325 (fub = 825 MPa)</option>
                            <option value="ASTM A490">ASTM A490 (fub = 1035 MPa)</option>
                            <option value="ISO 8.8">ISO 8.8 (fub = 800 MPa)</option>
                            <option value="ISO 10.9">ISO 10.9 (fub = 1000 MPa)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Passo Longitudinal p (mm)</label>
                        <input type="number" id="inp-pitch" value="75" step="5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Graminho / Distância Transv. g (mm)</label>
                        <input type="number" id="inp-gauge" value="90" step="5" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>

            <!-- Panel 4: Esforços Solicitantes na Emenda (RS2 Style) -->
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>⚡</span> Esforços Solicitantes na Emenda
                    </h3>
                    <span id="sp-load-badge" class="text-[10px] bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300 font-bold px-2 py-0.5 rounded">
                        ELU Solicitante
                    </span>
                </div>

                <!-- Grid Inputs -->
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">${mLabel}</label>
                        <input type="number" id="inp-Msd" value="180" step="10" oninput="onInputChange()" class="eng-input font-bold text-indigo-600 dark:text-indigo-400">
                    </div>
                    <div>
                        <label class="eng-label">${vLabel}</label>
                        <input type="number" id="inp-Vsd" value="45" step="5" oninput="onInputChange()" class="eng-input font-bold text-blue-600 dark:text-blue-400">
                    </div>
                    <div class="col-span-2">
                        <label class="eng-label">${nLabel}</label>
                        <input type="number" id="inp-Nsd" value="0" step="20" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>
        `;
    } else {
        // Fallback for shear tab, flexible end plate, etc. rendered in unified cards
        container.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>🔩</span> Materiais & Parafusos
                    </h3>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">Diâmetro Parafuso</label>
                        <select id="conn-bolt-d" onchange="onInputChange()" class="eng-select">
                            <option value="1/2&quot;">1/2" (12.7 mm)</option>
                            <option value="5/8&quot;">5/8" (15.9 mm)</option>
                            <option value="3/4&quot;" selected>3/4" (19.05 mm)</option>
                            <option value="7/8&quot;">7/8" (22.2 mm)</option>
                            <option value="1&quot;">1" (25.4 mm)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Classe do Parafuso</label>
                        <select id="conn-bolt-grade" onchange="onInputChange()" class="eng-select">
                            <option value="ASTM A325" selected>ASTM A325 (fub=825 MPa)</option>
                            <option value="ASTM A490">ASTM A490 (fub=1035 MPa)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Aço Estrutural</label>
                        <select id="conn-steel-grade" onchange="onInputChange()" class="eng-select">
                            <option value="ASTM A572 Gr50" selected>ASTM A572 Gr.50 (fy=345 MPa)</option>
                            <option value="ASTM A36">ASTM A36 (fy=250 MPa)</option>
                        </select>
                    </div>
                    <div>
                        <label class="eng-label">Perna Solda fw (mm)</label>
                        <input type="number" id="conn-weld-size" value="6.0" step="1.0" min="3.0" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h3 class="text-xs md:text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>📐</span> Geometria & Cargas
                    </h3>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div>
                        <label class="eng-label">${vLabel}</label>
                        <input type="number" id="inp-Vsd" value="150" step="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Nº Linhas Parafusos</label>
                        <input type="number" id="inp-rows" value="4" min="2" max="10" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espaçamento p (mm)</label>
                        <input type="number" id="inp-pitch" value="75" step="5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Graminho g (mm)</label>
                        <input type="number" id="inp-gauge" value="100" step="5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Chapa tp (mm)</label>
                        <input type="number" id="inp-tplate" value="9.5" step="0.5" oninput="onInputChange()" class="eng-input">
                    </div>
                    <div>
                        <label class="eng-label">Espessura Alma tw (mm)</label>
                        <input type="number" id="inp-tweb" value="6.3" step="0.5" oninput="onInputChange()" class="eng-input">
                    </div>
                </div>
            </div>
        `;
    }

    updateLiveCardPreviews();
}

function onInputChange() {
    updateLiveCardPreviews();
    triggerConnectionCalculation();
}
window.onInputChange = onInputChange;

function onBasePlateProfileSelect(profName) {
    if (profName && STANDARD_PROFILES[profName]) {
        const p = STANDARD_PROFILES[profName];
        if (document.getElementById('inp-dcol')) document.getElementById('inp-dcol').value = p.d;
        if (document.getElementById('inp-bfcol')) document.getElementById('inp-bfcol').value = p.bf;
        if (document.getElementById('inp-twcol')) document.getElementById('inp-twcol').value = p.tw;
        if (document.getElementById('inp-tfcol')) document.getElementById('inp-tfcol').value = p.tf;
    }
    onInputChange();
}
window.onBasePlateProfileSelect = onBasePlateProfileSelect;

function onSpliceProfileSelect(profName) {
    if (profName && STANDARD_PROFILES[profName]) {
        const p = STANDARD_PROFILES[profName];
        if (document.getElementById('inp-dbeam')) document.getElementById('inp-dbeam').value = p.d;
        if (document.getElementById('inp-bfbeam')) document.getElementById('inp-bfbeam').value = p.bf;
        if (document.getElementById('inp-twbeam')) document.getElementById('inp-twbeam').value = p.tw;
        if (document.getElementById('inp-tfbeam')) document.getElementById('inp-tfbeam').value = p.tf;
        if (document.getElementById('inp-bfp')) document.getElementById('inp-bfp').value = p.bf;
        if (document.getElementById('inp-hwp')) document.getElementById('inp-hwp').value = Math.max(100, Math.round(p.d - 2 * p.tf - 40));
    }
    onInputChange();
}
window.onSpliceProfileSelect = onSpliceProfileSelect;

// =============================================================
// LIVE CARD PREVIEW METRICS (RS2 Real-Time Summary Sync)
// =============================================================
function updateLiveCardPreviews() {
    if (currentTypology === 'base_plate') {
        const dCol = parseFloat(document.getElementById('inp-dcol')?.value) || 253;
        const bfCol = parseFloat(document.getElementById('inp-bfcol')?.value) || 254;
        const twCol = parseFloat(document.getElementById('inp-twcol')?.value) || 8.6;
        const tfCol = parseFloat(document.getElementById('inp-tfcol')?.value) || 14.2;
        const bpN = parseFloat(document.getElementById('inp-bpN')?.value) || 380;
        const bpB = parseFloat(document.getElementById('inp-bpB')?.value) || 380;
        const tp = parseFloat(document.getElementById('inp-tplate')?.value) || 25.4;
        const pedB = parseFloat(document.getElementById('inp-pedB')?.value) || 600;
        const pedN = parseFloat(document.getElementById('inp-pedN')?.value) || 600;
        const fck = parseFloat(document.getElementById('inp-fck')?.value) || 25;
        const nsd = parseFloat(document.getElementById('inp-Nsd')?.value) || 350;
        const msd = parseFloat(document.getElementById('inp-Msd')?.value) || 0;
        const nAnchors = parseInt(document.getElementById('inp-num-anchors')?.value) || 4;
        const boltD = document.getElementById('conn-bolt-d')?.value || '3/4"';

        const A1 = (bpB * bpN) / 100.0; // cm2
        const A2 = (pedB * pedN) / 100.0; // cm2
        const conf = Math.min(2.0, Math.sqrt(A2 / Math.max(1, A1)));

        const m = Math.max(1.0, (bpN - 0.95 * dCol) / 2.0);
        const n = Math.max(1.0, (bpB - 0.80 * bfCol) / 2.0);

        const ecc = nsd > 0 ? (msd * 1000.0 / nsd) : 0.0;
        const kern = bpN / 6.0;

        const colDimsEl = document.getElementById('bp-sum-col-dims');
        if (colDimsEl) colDimsEl.innerText = `d = ${dCol} mm | bf = ${bfCol} mm`;
        const colThickEl = document.getElementById('bp-sum-col-thick');
        if (colThickEl) colThickEl.innerText = `tw = ${twCol} mm | tf = ${tfCol} mm`;
        const areasEl = document.getElementById('bp-sum-areas');
        if (areasEl) areasEl.innerText = `A1 = ${A1.toFixed(0)} cm² | A2 = ${A2.toFixed(0)} cm²`;
        const confEl = document.getElementById('bp-sum-conf');
        if (confEl) confEl.innerText = `√(A2/A1) = ${conf.toFixed(2)} ≤ 2.00`;
        const cantEl = document.getElementById('bp-sum-cantilevers');
        if (cantEl) cantEl.innerText = `m = ${m.toFixed(1)} mm | n = ${n.toFixed(1)} mm`;
        const eccEl = document.getElementById('bp-sum-ecc');
        if (eccEl) {
            eccEl.innerText = `e = ${ecc.toFixed(1)} mm (${ecc <= kern ? 'e ≤ Ap/6: Pequena Excentricidade' : 'e > Ap/6: Grande Excentricidade'})`;
        }
        const tensionEl = document.getElementById('bp-sum-tension');
        if (tensionEl) {
            tensionEl.innerText = ecc <= kern ? 'Tu = 0.0 kN (Sem tração ativa)' : 'Tu > 0 (Chumbadores tracionados)';
            tensionEl.className = ecc <= kern ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'font-semibold text-amber-600 dark:text-amber-400';
        }
        const fricEl = document.getElementById('bp-sum-fric');
        if (fricEl) {
            const mu = parseFloat(document.getElementById('inp-mu')?.value) || 0.45;
            fricEl.innerText = `μ·N = ${(mu * nsd).toFixed(1)} kN (Fricção Base)`;
        }

        const badgeGeom = document.getElementById('bp-geom-badge');
        if (badgeGeom) badgeGeom.innerText = `${bpN}×${bpB}×${tp} mm • C${fck}`;
        const badgeAnchor = document.getElementById('bp-anchor-badge');
        if (badgeAnchor) badgeAnchor.innerText = `${nAnchors}x ${boltD}`;
    } else if (currentTypology === 'splice') {
        const dBeam = parseFloat(document.getElementById('inp-dbeam')?.value) || 352;
        const bfBeam = parseFloat(document.getElementById('inp-bfbeam')?.value) || 171;
        const twBeam = parseFloat(document.getElementById('inp-twbeam')?.value) || 6.9;
        const tfBeam = parseFloat(document.getElementById('inp-tfbeam')?.value) || 9.8;
        const bfp = parseFloat(document.getElementById('inp-bfp')?.value) || 170;
        const tfp = parseFloat(document.getElementById('inp-tfp')?.value) || 12.7;
        const hwp = parseFloat(document.getElementById('inp-hwp')?.value) || 260;
        const twp = parseFloat(document.getElementById('inp-twp')?.value) || 6.35;
        const msd = parseFloat(document.getElementById('inp-Msd')?.value) || 180;

        const df = dBeam - tfBeam;
        const Tf = df > 0 ? (msd * 1000.0) / (df / 1000.0) : 0.0;
        const Agf = (bfp * tfp) / 100.0;
        const Agw = (2.0 * hwp * twp) / 100.0;

        const memDimsEl = document.getElementById('sp-sum-member-dims');
        if (memDimsEl) memDimsEl.innerText = `d = ${dBeam} mm | bf = ${bfBeam} mm`;
        const memThickEl = document.getElementById('sp-sum-member-thick');
        if (memThickEl) memThickEl.innerText = `tw = ${twBeam} mm | tf = ${tfBeam} mm`;
        const dfEl = document.getElementById('sp-sum-df');
        if (dfEl) dfEl.innerText = `df = ${df.toFixed(1)} mm (d - tf)`;
        const tfEl = document.getElementById('sp-sum-tf');
        if (tfEl) tfEl.innerText = `Tf = M / df = ${Tf.toFixed(1)} kN`;
        const flangeAreasEl = document.getElementById('sp-sum-flange-areas');
        if (flangeAreasEl) flangeAreasEl.innerText = `Ag = ${Agf.toFixed(1)} cm²`;
        const webAreaEl = document.getElementById('sp-sum-web-area');
        if (webAreaEl) webAreaEl.innerText = `Agw = ${Agw.toFixed(1)} cm² (2 chapas)`;

        const flangeBadge = document.getElementById('sp-flange-badge');
        if (flangeBadge) flangeBadge.innerText = `Chapas Mesa t=${tfp} mm`;
        const webBadge = document.getElementById('sp-web-badge');
        if (webBadge) webBadge.innerText = `2x Chapas Alma t=${twp} mm`;
    }
}

// =============================================================
// CALCULATION TRIGGER (PURE MATHEMATICAL ADAPTATION)
// =============================================================
async function triggerConnectionCalculation() {
    const boltD = document.getElementById('conn-bolt-d')?.value || '3/4"';
    const boltGrade = document.getElementById('conn-bolt-grade')?.value || 'ASTM A325';
    const steelGrade = document.getElementById('conn-steel-grade')?.value || 'ASTM A572 Gr50';
    const weldSize = parseFloat(document.getElementById('conn-weld-size')?.value) || 6.0;

    let standardName = 'NBR 8800';
    let methodName = 'LRFD';
    if (currentStandard === 'aisc_lrfd') {
        standardName = 'AISC 360';
        methodName = 'LRFD';
    } else if (currentStandard === 'aisc_asd') {
        standardName = 'AISC 360';
        methodName = 'ASD';
    }

    const payload = {
        type: currentTypology,
        standard: standardName,
        method: methodName,
        bolt_d: boltD,
        bolt_grade: boltGrade,
        steel_grade: steelGrade,
        weld_leg: weldSize
    };

    if (currentTypology === 'base_plate') {
        payload.N_sd = parseFloat(document.getElementById('inp-Nsd')?.value) || 350;
        payload.M_sd = parseFloat(document.getElementById('inp-Msd')?.value) || 0;
        payload.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value) || 40;
        payload.B = parseFloat(document.getElementById('inp-bpB')?.value) || 380;
        payload.N = parseFloat(document.getElementById('inp-bpN')?.value) || 380;
        payload.t_plate = parseFloat(document.getElementById('inp-tplate')?.value) || 25.4;
        payload.fck = parseFloat(document.getElementById('inp-fck')?.value) || 25;
        payload.d_col = parseFloat(document.getElementById('inp-dcol')?.value) || 253;
        payload.bf_col = parseFloat(document.getElementById('inp-bfcol')?.value) || 254;
        payload.tw_col = parseFloat(document.getElementById('inp-twcol')?.value) || 8.6;
        payload.tf_col = parseFloat(document.getElementById('inp-tfcol')?.value) || 14.2;
        payload.pedestal_B = parseFloat(document.getElementById('inp-pedB')?.value) || 600;
        payload.pedestal_N = parseFloat(document.getElementById('inp-pedN')?.value) || 600;
        payload.num_anchors = parseInt(document.getElementById('inp-num-anchors')?.value) || 4;
        payload.mu = parseFloat(document.getElementById('inp-mu')?.value) || 0.45;
        payload.anchor_spacing_g = parseFloat(document.getElementById('inp-gb')?.value) || 260;
        payload.anchor_spacing_p = parseFloat(document.getElementById('inp-pb')?.value) || 260;
    } else if (currentTypology === 'splice') {
        payload.M_sd = parseFloat(document.getElementById('inp-Msd')?.value) || 180;
        payload.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value) || 45;
        payload.N_sd = parseFloat(document.getElementById('inp-Nsd')?.value) || 0;
        payload.d_beam = parseFloat(document.getElementById('inp-dbeam')?.value) || 352;
        payload.b_f = parseFloat(document.getElementById('inp-bfbeam')?.value) || 171;
        payload.t_w = parseFloat(document.getElementById('inp-twbeam')?.value) || 6.9;
        payload.t_f = parseFloat(document.getElementById('inp-tfbeam')?.value) || 9.8;
        payload.b_fp = parseFloat(document.getElementById('inp-bfp')?.value) || 170;
        payload.L_fp = parseFloat(document.getElementById('inp-lfp')?.value) || 400;
        payload.t_fp = parseFloat(document.getElementById('inp-tfp')?.value) || 12.7;
        payload.num_bolts_f = parseInt(document.getElementById('inp-num-bolts-f')?.value) || 4;
        payload.h_wp = parseFloat(document.getElementById('inp-hwp')?.value) || 260;
        payload.L_wp = parseFloat(document.getElementById('inp-lwp')?.value) || 250;
        payload.t_wp = parseFloat(document.getElementById('inp-twp')?.value) || 6.35;
        payload.num_bolts_w = parseInt(document.getElementById('inp-num-bolts-w')?.value) || 6;
        payload.pitch = parseFloat(document.getElementById('inp-pitch')?.value) || 75;
        payload.gauge = parseFloat(document.getElementById('inp-gauge')?.value) || 90;
    } else if (currentTypology === 'flexible_end_plate') {
        payload.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value) || 150;
        payload.num_rows = parseInt(document.getElementById('inp-rows')?.value) || 4;
        payload.pitch = parseFloat(document.getElementById('inp-pitch')?.value) || 75;
        payload.gauge = parseFloat(document.getElementById('inp-gauge')?.value) || 100;
        payload.t_plate = parseFloat(document.getElementById('inp-tplate')?.value) || 9.5;
        payload.t_web = parseFloat(document.getElementById('inp-tweb')?.value) || 6.3;
    } else if (currentTypology === 'double_angle') {
        payload.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value) || 180;
        payload.num_rows = parseInt(document.getElementById('inp-rows')?.value) || 4;
        payload.t_angle = parseFloat(document.getElementById('inp-tangle')?.value) || 7.9;
        payload.t_web = parseFloat(document.getElementById('inp-tweb')?.value) || 7.1;
    } else if (currentTypology === 'shear_tab') {
        payload.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value) || 120;
        payload.num_bolts = parseInt(document.getElementById('inp-numbolts')?.value) || 4;
        payload.t_plate = parseFloat(document.getElementById('inp-tplate')?.value) || 9.5;
        payload.t_web = parseFloat(document.getElementById('inp-tweb')?.value) || 6.3;
    } else if (currentTypology === 'extended_end_plate') {
        payload.M_sd = parseFloat(document.getElementById('inp-Msd')?.value) || 120;
        payload.V_sd = parseFloat(document.getElementById('inp-Vsd')?.value) || 80;
        payload.d_beam = parseFloat(document.getElementById('inp-dbeam')?.value) || 400;
        payload.b_f = parseFloat(document.getElementById('inp-bf')?.value) || 180;
        payload.t_plate = parseFloat(document.getElementById('inp-tplate')?.value) || 19.0;
        payload.gauge = parseFloat(document.getElementById('inp-gauge')?.value) || 100;
    }

    try {
        let res = null;
        if (window.eel && eel.calculate_steel_connection) {
            res = await eel.calculate_steel_connection(payload)();
        } else if (window.eel && eel.calculate_steel_connection_nbr8800) {
            res = await eel.calculate_steel_connection_nbr8800(payload)();
        }

        if (res && res.status === 'success') {
            connectionResult = res;
            updateSummaryUI(res);
            renderChecksTable(res.limit_states || res.checks || [], res.status_overall);
            renderConstructiveDetails(res.detailing || res.details || {});
            drawConnectionDetail(payload, res);
        }
    } catch (err) {
        console.error("Erro no cálculo da conexão metálica:", err);
    }
}
window.triggerConnectionCalculation = triggerConnectionCalculation;

function updateSummaryUI(res) {
    const demandEl = document.getElementById('conn-res-demand');
    const capEl = document.getElementById('conn-res-capacity');
    const urEl = document.getElementById('conn-res-ur');
    const statusEl = document.getElementById('conn-res-status');
    const badgeEl = document.getElementById('conn-status-badge');
    const unitDemandEl = document.getElementById('conn-res-demand-unit');
    const unitCapEl = document.getElementById('conn-res-capacity-unit');

    const unit = (currentTypology === 'extended_end_plate' || currentTypology === 'splice') ? 'kNm' : 'kN';
    if (unitDemandEl) unitDemandEl.innerText = unit;
    if (unitCapEl) unitCapEl.innerText = unit;

    const isOk = res.status_overall === 'OK';

    if (demandEl) demandEl.innerText = res.demand?.toFixed(1) || '-';
    if (capEl) capEl.innerText = res.capacity_limiting?.toFixed(1) || '-';
    if (urEl) {
        const urPct = ((res.utilization_ratio || 0) * 100).toFixed(1);
        urEl.innerText = `${urPct}%`;
        urEl.className = `text-lg font-extrabold ${res.utilization_ratio <= 1.0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400'} my-0.5`;
    }
    if (statusEl) {
        const statusText = isOk 
            ? (currentStandard === 'nbr' ? 'Aprovado' : 'Pass / OK')
            : (currentStandard === 'nbr' ? 'Não Atende' : 'Fails Check');
        statusEl.innerText = statusText;
        statusEl.className = `text-sm font-extrabold ${isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'} my-0.5`;
    }
    if (badgeEl) {
        let badgeText = '';
        if (currentStandard === 'nbr') {
            badgeText = isOk ? '✓ Aprovado NBR 8800' : '✗ Não Atende ELU';
        } else if (currentStandard === 'aisc_lrfd') {
            badgeText = isOk ? '✓ OK AISC 360 (LRFD)' : '✗ Fails AISC (LRFD)';
        } else {
            badgeText = isOk ? '✓ OK AISC 360 (ASD)' : '✗ Fails AISC (ASD)';
        }
        badgeEl.innerText = badgeText;
        badgeEl.className = isOk 
            ? 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
            : 'px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
    }
}

function renderChecksTable(checks, overallStatus) {
    const tbody = document.getElementById('tbody-conn-checks');
    if (!tbody) return;

    if (!checks || checks.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-500">Nenhuma verificação disponível.</td></tr>';
        return;
    }

    let html = '';
    checks.forEach(c => {
        const isOk = c.status === 'OK';
        const urVal = c.ratio ? (c.ratio * 100).toFixed(1) + '%' : '-';
        html += `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                <td class="p-2.5 font-medium text-gray-800 dark:text-gray-200">
                    <div>${c.limit_state}</div>
                    <div class="text-[10px] text-gray-400 font-mono">${c.ref || (currentStandard === 'nbr' ? 'NBR 8800' : 'AISC 360')}</div>
                </td>
                <td class="p-2.5 font-mono text-emerald-600 dark:text-emerald-400">${c.capacity?.toFixed(1)} ${c.unit || 'kN'}</td>
                <td class="p-2.5 font-mono text-blue-600 dark:text-blue-400">${c.demand?.toFixed(1)} ${c.unit || 'kN'}</td>
                <td class="p-2.5 font-mono font-bold ${c.ratio <= 1.0 ? 'text-gray-700 dark:text-gray-300' : 'text-rose-600 dark:text-rose-400'}">${urVal}</td>
                <td class="p-2.5 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isOk ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}">
                        ${isOk ? 'OK' : 'FALHA'}
                    </span>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

function renderConstructiveDetails(specs) {
    const el = document.getElementById('conn-spec-details');
    if (!el) return;

    let items = [];
    const isNbr = (currentStandard === 'nbr');

    if (specs.hole_dia) {
        items.push(isNbr 
            ? `• Furos padrão (Tabela 11): diâmetro <strong>${specs.hole_dia} mm</strong>.`
            : `• Standard holes (Table J3.3): diameter <strong>${specs.hole_dia} mm</strong>.`);
    }
    if (specs.e_min) {
        items.push(isNbr
            ? `• Distância mínima de borda e_min (Tabela 13): <strong>${specs.e_min} mm</strong>.`
            : `• Minimum edge distance e_min (Table J3.4M): <strong>${specs.e_min} mm</strong>.`);
    }
    if (specs.p_min) {
        items.push(isNbr
            ? `• Espaçamento mínimo entre eixos p_min: <strong>${specs.p_min} mm</strong> (2.7 d).`
            : `• Minimum bolt pitch p_min: <strong>${specs.p_min} mm</strong> (2-2/3 d).`);
    }
    if (specs.tp_recommended) {
        items.push(isNbr
            ? `• Espessura mínima recomendada da placa base: <strong>${specs.tp_recommended} mm</strong> (balanço crítico l = ${specs.l_crit} mm).`
            : `• Required base plate thickness: <strong>${specs.tp_recommended} mm</strong> (cantilever l = ${specs.l_crit} mm).`);
    }
    if (specs.flange_plate_dim) {
        items.push(`• Chapas de mesa: <strong>${specs.flange_plate_dim}</strong> (${specs.flange_bolts_per_side} parafusos por lado).`);
    }
    if (specs.web_plate_dim) {
        items.push(`• Chapas de alma: <strong>${specs.web_plate_dim}</strong> (${specs.web_bolts_per_side} parafusos por lado).`);
    }
    if (specs.weld_throat) {
        items.push(isNbr
            ? `• Garganta efetiva da solda aw: <strong>${specs.weld_throat} mm</strong> (0.707 fw).`
            : `• Effective weld throat aw: <strong>${specs.weld_throat} mm</strong> (0.707 w).`);
    }

    if (items.length === 0) {
        el.innerHTML = isNbr 
            ? "• Geometria e folgas dentro dos parâmetros prescritos pela NBR 8800 / CBCA."
            : "• Geometry and clearances conform to AISC 360-22 specifications.";
    } else {
        el.innerHTML = items.join('<br>');
    }
}

// =============================================================
// PRESETS & TEST BENCHMARKS (RS2 DNA)
// =============================================================
function loadConnectionPreset(presetKey) {
    if (presetKey.startsWith('bp_')) {
        selectTypology('base_plate');
        if (presetKey === 'bp_w250_light') {
            onBasePlateProfileSelect('W250x73');
            setVal('inp-bpN', 380); setVal('inp-bpB', 380); setVal('inp-tplate', 25.4);
            setVal('inp-pedB', 600); setVal('inp-pedN', 600); setVal('inp-fck', 25);
            setVal('conn-bolt-d', '3/4"'); setVal('conn-bolt-grade', 'ASTM A307');
            setVal('inp-num-anchors', '4'); setVal('inp-hef', 300);
            setVal('inp-Nsd', 350); setVal('inp-Msd', 0); setVal('inp-Vsd', 40);
        } else if (presetKey === 'bp_w310_medium') {
            onBasePlateProfileSelect('W310x107');
            setVal('inp-bpN', 460); setVal('inp-bpB', 460); setVal('inp-tplate', 31.8);
            setVal('inp-pedB', 700); setVal('inp-pedN', 700); setVal('inp-fck', 30);
            setVal('conn-bolt-d', '7/8"'); setVal('conn-bolt-grade', 'ASTM A325');
            setVal('inp-num-anchors', '4'); setVal('inp-hef', 400);
            setVal('inp-Nsd', 600); setVal('inp-Msd', 85); setVal('inp-Vsd', 70);
        } else if (presetKey === 'bp_w360_heavy') {
            onBasePlateProfileSelect('W360x134');
            setVal('inp-bpN', 550); setVal('inp-bpB', 520); setVal('inp-tplate', 38.1);
            setVal('inp-pedB', 850); setVal('inp-pedN', 850); setVal('inp-fck', 35);
            setVal('conn-bolt-d', '1"'); setVal('conn-bolt-grade', 'ASTM A325');
            setVal('inp-num-anchors', '4'); setVal('inp-hef', 500);
            setVal('inp-Nsd', 850); setVal('inp-Msd', 220); setVal('inp-Vsd', 120);
        } else if (presetKey === 'bp_hp310_high') {
            onBasePlateProfileSelect('HP310x125');
            setVal('inp-bpN', 550); setVal('inp-bpB', 550); setVal('inp-tplate', 50.8);
            setVal('inp-pedB', 900); setVal('inp-pedN', 900); setVal('inp-fck', 40);
            setVal('conn-bolt-d', '1"'); setVal('conn-bolt-grade', 'ASTM A325');
            setVal('inp-num-anchors', '8'); setVal('inp-hef', 600);
            setVal('inp-Nsd', 2200); setVal('inp-Msd', 40); setVal('inp-Vsd', 50);
        }
    } else if (presetKey.startsWith('sp_')) {
        selectTypology('splice');
        if (presetKey === 'sp_w360_floor') {
            onSpliceProfileSelect('W360x44');
            setVal('inp-bfp', 170); setVal('inp-lfp', 400); setVal('inp-tfp', 12.7); setVal('inp-num-bolts-f', '4');
            setVal('inp-hwp', 260); setVal('inp-lwp', 250); setVal('inp-twp', 6.35); setVal('inp-num-bolts-w', '6');
            setVal('conn-bolt-d', '3/4"'); setVal('conn-bolt-grade', 'ASTM A325');
            setVal('inp-Msd', 180); setVal('inp-Vsd', 45); setVal('inp-Nsd', 0);
        } else if (presetKey === 'sp_w410_roof') {
            onSpliceProfileSelect('W410x60');
            setVal('inp-bfp', 180); setVal('inp-lfp', 460); setVal('inp-tfp', 15.9); setVal('inp-num-bolts-f', '4');
            setVal('inp-hwp', 300); setVal('inp-lwp', 280); setVal('inp-twp', 7.9); setVal('inp-num-bolts-w', '6');
            setVal('conn-bolt-d', '7/8"'); setVal('conn-bolt-grade', 'ASTM A325');
            setVal('inp-Msd', 320); setVal('inp-Vsd', 140); setVal('inp-Nsd', 0);
        } else if (presetKey === 'sp_w310_column') {
            onSpliceProfileSelect('W310x79');
            setVal('inp-bfp', 250); setVal('inp-lfp', 450); setVal('inp-tfp', 19.0); setVal('inp-num-bolts-f', '6');
            setVal('inp-hwp', 220); setVal('inp-lwp', 260); setVal('inp-twp', 9.5); setVal('inp-num-bolts-w', '6');
            setVal('conn-bolt-d', '7/8"'); setVal('conn-bolt-grade', 'ASTM A490');
            setVal('inp-Msd', 110); setVal('inp-Vsd', 50); setVal('inp-Nsd', 950);
        } else if (presetKey === 'sp_w530_heavy') {
            onSpliceProfileSelect('W530x85');
            setVal('inp-bfp', 170); setVal('inp-lfp', 550); setVal('inp-tfp', 22.2); setVal('inp-num-bolts-f', '6');
            setVal('inp-hwp', 420); setVal('inp-lwp', 320); setVal('inp-twp', 9.5); setVal('inp-num-bolts-w', '8');
            setVal('conn-bolt-d', '1"'); setVal('conn-bolt-grade', 'ASTM A490');
            setVal('inp-Msd', 580); setVal('inp-Vsd', 220); setVal('inp-Nsd', 0);
        }
    } else if (presetKey === 'fep_w360') {
        selectTypology('flexible_end_plate');
        setVal('inp-Vsd', 150); setVal('inp-rows', 4);
    } else if (presetKey === 'da_w410') {
        selectTypology('double_angle');
        setVal('inp-Vsd', 180); setVal('inp-rows', 4);
    } else if (presetKey === 'st_w310') {
        selectTypology('shear_tab');
        setVal('inp-Vsd', 120); setVal('inp-numbolts', 4);
    } else if (presetKey === 'eep_w460') {
        selectTypology('extended_end_plate');
        setVal('inp-Msd', 120); setVal('inp-Vsd', 80);
    }

    onInputChange();
}
window.loadConnectionPreset = loadConnectionPreset;

function loadBenchmarkConnection(benchKey) {
    if (benchKey === 'bench_cbca_bp1') {
        switchStandard('nbr');
        loadConnectionPreset('bp_w250_light');
        setVal('inp-Nsd', 400); setVal('inp-Msd', 0); setVal('inp-Vsd', 30);
    } else if (benchKey === 'bench_aisc_dg1_ex41') {
        switchStandard('aisc_lrfd');
        loadConnectionPreset('bp_w310_medium');
        setVal('inp-Nsd', 550); setVal('inp-Msd', 65); setVal('inp-Vsd', 60);
    } else if (benchKey === 'bench_aisc_dg1_ex43') {
        switchStandard('aisc_lrfd');
        loadConnectionPreset('bp_w360_heavy');
        setVal('inp-Nsd', 450); setVal('inp-Msd', 240); setVal('inp-Vsd', 110);
    } else if (benchKey === 'bench_nbr_splice_w360') {
        switchStandard('nbr');
        loadConnectionPreset('sp_w360_floor');
        setVal('inp-Msd', 180); setVal('inp-Vsd', 120); setVal('inp-Nsd', 0);
    } else if (benchKey === 'bench_aisc_splice_iia1') {
        switchStandard('aisc_lrfd');
        loadConnectionPreset('sp_w360_floor');
    } else if (benchKey === 'bench_aisc_splice_iia2') {
        switchStandard('aisc_asd');
        loadConnectionPreset('sp_w360_floor');
        setVal('inp-Msd', 120); setVal('inp-Vsd', 30);
    }
    onInputChange();
}
window.loadBenchmarkConnection = loadBenchmarkConnection;

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

// JSON Project Save & Load
function exportConnectionJSON() {
    const data = {
        standard: currentStandard,
        typology: currentTypology,
        timestamp: new Date().toISOString()
    };
    document.querySelectorAll('#steel-connection-form input, #steel-connection-form select').forEach(el => {
        if (el.id) data[el.id] = el.value;
    });

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `steel_connection_${currentTypology}_${currentStandard}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
window.exportConnectionJSON = exportConnectionJSON;

function importConnectionJSON(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.standard) switchStandard(data.standard);
            if (data.typology) selectTypology(data.typology);
            setTimeout(() => {
                Object.keys(data).forEach(k => {
                    if (k !== 'standard' && k !== 'typology') setVal(k, data[k]);
                });
                onInputChange();
            }, 100);
        } catch (err) {
            alert('Erro ao carregar arquivo de conexão: ' + err.message);
        }
    };
    reader.readAsText(file);
}
window.importConnectionJSON = importConnectionJSON;

function exportCanvasImage() {
    const canvas = document.getElementById('conn-canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `connection_${currentTypology}_${currentStandard}.png`;
    a.click();
}
window.exportCanvasImage = exportCanvasImage;

// =============================================================
// 2D CANVAS DETAILING ENGINE (UNIFIED 2D MULTI-VIEW)
// =============================================================
function drawConnectionDetail(inputs, result) {
    const canvas = document.getElementById('conn-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Unified RS2 / CAD Slate Background & Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, width, height, true);
        EngCAD.drawGrid(ctx, width, height, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
    }

    const cx = width / 2;
    const cy = height / 2;

    // Draw standard watermark tag in top right
    ctx.save();
    let stdTag = 'ABNT NBR 8800 (CBCA)';
    let stdColor = '#2563eb';
    if (currentStandard === 'aisc_lrfd') {
        stdTag = 'AISC 360-22 (LRFD)';
        stdColor = '#4f46e5';
    } else if (currentStandard === 'aisc_asd') {
        stdTag = 'AISC 360-22 (ASD)';
        stdColor = '#059669';
    }
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = stdColor;
    ctx.textAlign = 'right';
    ctx.fillText(stdTag, width - 16, 24);
    ctx.restore();

    if (currentTypology === 'base_plate') {
        // Concrete Pedestal
        ctx.fillStyle = isDark ? '#1e293b' : '#f1f5f9';
        ctx.fillRect(cx - 210, cy + 40, 420, 130);
        ctx.strokeStyle = isDark ? '#475569' : '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 210, cy + 40, 420, 130);

        // Pedestal Concrete Hatching Lines
        ctx.save();
        ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
        ctx.lineWidth = 1;
        for (let x = cx - 200; x < cx + 210; x += 30) {
            ctx.beginPath();
            ctx.moveTo(x, cy + 40);
            ctx.lineTo(x + 20, cy + 170);
            ctx.stroke();
        }
        ctx.restore();

        // Grout Bed / Argamassa de Graute (50 mm layer)
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.fillRect(cx - 170, cy + 28, 340, 12);
        ctx.strokeStyle = '#94a3b8';
        ctx.strokeRect(cx - 170, cy + 28, 340, 12);

        // Steel Base Plate
        ctx.fillStyle = '#64748b';
        ctx.fillRect(cx - 150, cy + 8, 300, 20);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - 150, cy + 8, 300, 20);

        // Column W-section extending upward
        const dColW = 120;
        ctx.fillStyle = isDark ? '#475569' : '#94a3b8';
        ctx.fillRect(cx - dColW / 2, 45, dColW, cy - 37);
        ctx.strokeRect(cx - dColW / 2, 45, dColW, cy - 37);

        // Column Flanges (I-shape in elevation)
        ctx.fillStyle = isDark ? '#334155' : '#64748b';
        ctx.fillRect(cx - dColW / 2, 45, 14, cy - 37);
        ctx.fillRect(cx + dColW / 2 - 14, 45, 14, cy - 37);

        // Fillet Welds at column base
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(cx - dColW / 2 - 6, cy + 2, 6, 6);
        ctx.fillRect(cx + dColW / 2, cy + 2, 6, 6);

        // Anchor Bolts (Chumbadores) with hooks
        const nAnch = inputs.num_anchors || 4;
        const offsetAnch = 110;
        drawAnchorBolt(ctx, cx - offsetAnch, cy - 2);
        drawAnchorBolt(ctx, cx + offsetAnch, cy - 2);
        if (nAnch >= 6) {
            drawAnchorBolt(ctx, cx - offsetAnch * 0.45, cy - 2);
            drawAnchorBolt(ctx, cx + offsetAnch * 0.45, cy - 2);
        }

        // Dimension lines & labels
        ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Placa Base: ${inputs.N || 380} × ${inputs.B || 380} × ${inputs.t_plate || 25.4} mm`, cx, cy + 22);

        // Pedestal Label
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = 'bold 11px Inter, sans-serif';
        const pedLabel = currentStandard === 'nbr' 
            ? `Pedestal de Concreto C${inputs.fck || 25} (NBR 6118) • ${inputs.pedestal_B || 600}x${inputs.pedestal_N || 600} mm` 
            : `Concrete Pedestal f'c = ${inputs.fck || 25} MPa (AISC DG1) • ${inputs.pedestal_B || 600}x${inputs.pedestal_N || 600} mm`;
        ctx.fillText(pedLabel, cx, cy + 120);

        // Applied load arrows
        drawLoadVectors(ctx, cx, 35, inputs.N_sd || 350, inputs.M_sd || 0, inputs.V_sd || 40);

    } else if (currentTypology === 'splice') {
        // Splice Elevation View: Left Beam and Right Beam meeting with a 10mm gap
        const beamH = 140;
        const beamY = cy - beamH / 2;
        const gap = 10;

        // Left Beam
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.fillRect(cx - 230, beamY, 230 - gap / 2, beamH);
        ctx.strokeStyle = isDark ? '#475569' : '#94a3b8';
        ctx.strokeRect(cx - 230, beamY, 230 - gap / 2, beamH);

        // Right Beam
        ctx.fillRect(cx + gap / 2, beamY, 230 - gap / 2, beamH);
        ctx.strokeRect(cx + gap / 2, beamY, 230 - gap / 2, beamH);

        // Flanges of the beams
        ctx.fillStyle = isDark ? '#1e293b' : '#94a3b8';
        ctx.fillRect(cx - 230, beamY, 230 - gap / 2, 12); // Top left
        ctx.fillRect(cx - 230, beamY + beamH - 12, 230 - gap / 2, 12); // Bot left
        ctx.fillRect(cx + gap / 2, beamY, 230 - gap / 2, 12); // Top right
        ctx.fillRect(cx + gap / 2, beamY + beamH - 12, 230 - gap / 2, 12); // Bot right

        // Flange Splice Plates (Top and Bottom)
        const fpW = 200;
        const fpH = 14;
        ctx.fillStyle = '#64748b';
        ctx.fillRect(cx - fpW / 2, beamY - fpH, fpW, fpH); // Top plate
        ctx.strokeRect(cx - fpW / 2, beamY - fpH, fpW, fpH);
        ctx.fillRect(cx - fpW / 2, beamY + beamH, fpW, fpH); // Bot plate
        ctx.strokeRect(cx - fpW / 2, beamY + beamH, fpW, fpH);

        // Web Splice Plates (Left & Right side of gap)
        const wpW = 160;
        const wpH = beamH - 40;
        ctx.fillStyle = isDark ? '#475569' : '#e2e8f0';
        ctx.fillRect(cx - wpW / 2, cy - wpH / 2, wpW, wpH);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - wpW / 2, cy - wpH / 2, wpW, wpH);

        // Flange Bolts
        const nBf = inputs.num_bolts_f || 4;
        const fSpacing = 35;
        for (let i = 0; i < Math.min(4, nBf); i++) {
            const bx = (cx - 70) + (i < 2 ? i * fSpacing : (i + 1) * fSpacing + 5);
            drawBoltSymbol(ctx, bx, beamY - fpH / 2);
            drawBoltSymbol(ctx, bx, beamY + beamH + fpH / 2);
        }

        // Web Bolts in Grid (2 columns on left, 2 columns on right)
        const nBw = inputs.num_bolts_w || 6;
        const nRowsW = Math.max(2, Math.round(nBw / 2));
        const rowSpacing = (wpH - 30) / Math.max(1, nRowsW - 1);
        for (let r = 0; r < nRowsW; r++) {
            const by = (cy - wpH / 2 + 15) + r * rowSpacing;
            drawBoltSymbol(ctx, cx - 45, by);
            drawBoltSymbol(ctx, cx - 18, by);
            drawBoltSymbol(ctx, cx + 18, by);
            drawBoltSymbol(ctx, cx + 45, by);
        }

        // Labels
        ctx.fillStyle = isDark ? '#cbd5e1' : '#475569';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Chapas de Mesa: ${inputs.b_fp || 170} × ${inputs.t_fp || 12.7} mm`, cx, beamY - fpH - 8);
        ctx.fillText(`2x Chapas de Alma: ${inputs.h_wp || 260} × ${inputs.t_wp || 6.35} mm`, cx, cy + wpH / 2 + 16);

        // Solicitations (Moment and Shear indicators)
        drawLoadVectors(ctx, cx - 180, cy, inputs.N_sd || 0, inputs.M_sd || 180, inputs.V_sd || 45);

    } else if (currentTypology === 'flexible_end_plate' || currentTypology === 'extended_end_plate') {
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.fillRect(cx - 110, 30, 25, height - 60);

        ctx.fillStyle = '#64748b';
        const plateH = currentTypology === 'extended_end_plate' ? 240 : 180;
        ctx.fillRect(cx - 85, cy - plateH / 2, 16, plateH);
        ctx.strokeRect(cx - 85, cy - plateH / 2, 16, plateH);

        ctx.fillStyle = isDark ? '#475569' : '#e2e8f0';
        ctx.fillRect(cx - 69, cy - 80, 220, 160);
        ctx.strokeRect(cx - 69, cy - 80, 220, 160);

        ctx.fillStyle = isDark ? '#334155' : '#94a3b8';
        ctx.fillRect(cx - 69, cy - 80, 220, 14);
        ctx.fillRect(cx - 69, cy + 66, 220, 14);

        const numRows = inputs.num_rows || 4;
        const spacing = (plateH - 40) / Math.max(1, numRows - 1);
        for (let i = 0; i < numRows; i++) {
            const by = (cy - plateH / 2 + 20) + i * spacing;
            drawBoltSymbol(ctx, cx - 98, by);
        }

        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`hp = ${plateH} mm`, cx - 77, cy + plateH / 2 + 18);
    } else {
        // Generic shear connection
        ctx.fillStyle = isDark ? '#334155' : '#cbd5e1';
        ctx.fillRect(cx - 100, 30, 25, height - 60);
        ctx.fillStyle = '#64748b';
        ctx.fillRect(cx - 75, cy - 80, 70, 160);
        ctx.strokeRect(cx - 75, cy - 80, 70, 160);
        ctx.fillStyle = isDark ? '#475569' : '#e2e8f0';
        ctx.fillRect(cx - 40, cy - 100, 220, 200);

        for (let i = 0; i < 4; i++) {
            drawBoltSymbol(ctx, cx - 20, (cy - 60) + i * 40);
        }
    }

    // Floating CAD HUD Overlay (RS2 Standard)
    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        let typoName = 'Placa de Base';
        if (currentTypology === 'shear_tab') typoName = 'Chapa de Cisalhamento (Shear Tab)';
        else if (currentTypology === 'flexible_end_plate') typoName = 'Chapa de Topo Flexível';
        else if (currentTypology === 'extended_end_plate') typoName = 'Chapa de Topo Estendida';
        else if (currentTypology === 'direct_splice') typoName = 'Emenda Direta de Viga';

        const ratioVal = result?.governing_ratio ? `${(result.governing_ratio * 100).toFixed(1)}%` : (result?.max_ratio ? `${(result.max_ratio * 100).toFixed(1)}%` : '--');
        const isOk = result?.is_ok !== undefined ? result.is_ok : (result?.status === 'PASS');
        EngCAD.updateHUD(canvas.parentElement, `Ligação Metálica (${typoName})`, [
            { label: 'Tipologia', value: typoName, color: '#38bdf8' },
            { label: 'Norma', value: currentStandard === 'nbr' ? 'ABNT NBR 8800' : 'AISC 360', color: '#f1f5f9' },
            { label: 'Taxa de Trabalho', value: ratioVal, color: isOk ? '#10b981' : '#ef4444' }
        ]);
    }
}

function drawBoltSymbol(ctx, x, y) {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 3.5, y);
    ctx.lineTo(x + 3.5, y);
    ctx.moveTo(x, y - 3.5);
    ctx.lineTo(x, y + 3.5);
    ctx.stroke();
}

function drawAnchorBolt(ctx, x, y) {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x - 7, y - 4, 14, 8); // Nut and washer
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 95);
    ctx.lineTo(x + 22, y + 95); // J-Hook
    ctx.stroke();
}

function drawLoadVectors(ctx, x, y, N, M, V) {
    ctx.save();
    ctx.lineWidth = 2;

    // Normal Axial Force
    if (N !== 0) {
        ctx.strokeStyle = '#2563eb';
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.moveTo(x, y - 25);
        ctx.lineTo(x, y + 5);
        ctx.stroke();
        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(x - 5, y - 2);
        ctx.lineTo(x, y + 6);
        ctx.lineTo(x + 5, y - 2);
        ctx.fill();

        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`N = ${N} kN`, x + 8, y - 10);
    }

    // Moment Curve
    if (M !== 0) {
        ctx.strokeStyle = '#9333ea';
        ctx.fillStyle = '#9333ea';
        ctx.beginPath();
        ctx.arc(x, y - 5, 22, -Math.PI * 0.7, Math.PI * 0.2, false);
        ctx.stroke();
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillText(`M = ${M} kNm`, x + 24, y - 20);
    }

    // Shear Force
    if (V !== 0) {
        ctx.strokeStyle = '#059669';
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.moveTo(x - 20, y + 10);
        ctx.lineTo(x + 10, y + 10);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 5, y + 6);
        ctx.lineTo(x + 12, y + 10);
        ctx.lineTo(x + 5, y + 14);
        ctx.fill();
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillText(`V = ${V} kN`, x - 15, y + 24);
    }
    ctx.restore();
}
