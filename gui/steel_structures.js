/**
 * steel_structures.js - Unified Steel Structures Module (NBR 8800:2008 & AISC 360-16/22)
 * LukeAmetsu/CODE - Executive Structural Suite
 */

// --- STATE MANAGEMENT ---
let currentStandard = 'nbr'; // 'nbr' | 'aisc'
let currentUnit = 'metric';   // 'metric' | 'imperial'
let currentProfileName = 'W 530 x 82.0';

// --- GERDAU W PROFILES (Metric: mm, mm², mm³, mm⁴) ---
const GERDAU_W_PROFILES = {
    'W 610 x 101.0': { d: 603, bf: 228, tf: 14.9, tw: 10.5, Ag: 12900, Zx: 2890000, rx: 247, ry: 48.0 },
    'W 530 x 82.0':  { d: 528, bf: 209, tf: 13.3, tw: 8.9,  Ag: 10500, Zx: 2060000, rx: 213, ry: 43.8 },
    'W 530 x 66.0':  { d: 525, bf: 165, tf: 11.4, tw: 8.9,  Ag: 8400,  Zx: 1570000, rx: 209, ry: 33.7 },
    'W 460 x 52.0':  { d: 450, bf: 152, tf: 10.8, tw: 7.6,  Ag: 6660,  Zx: 1090000, rx: 179, ry: 31.1 },
    'W 410 x 53.0':  { d: 403, bf: 177, tf: 10.9, tw: 7.5,  Ag: 6800,  Zx: 1060000, rx: 167, ry: 38.6 },
    'W 410 x 38.8':  { d: 399, bf: 140, tf: 8.8,  tw: 6.4,  Ag: 4940,  Zx: 720000,  rx: 160, ry: 29.0 },
    'W 360 x 44.0':  { d: 352, bf: 171, tf: 9.8,  tw: 6.9,  Ag: 5710,  Zx: 779000,  rx: 146, ry: 37.8 },
    'W 310 x 38.7':  { d: 310, bf: 165, tf: 9.7,  tw: 5.8,  Ag: 4980,  Zx: 616000,  rx: 130, ry: 37.1 },
    'W 310 x 28.3':  { d: 309, bf: 102, tf: 8.9,  tw: 6.0,  Ag: 3650,  Zx: 412000,  rx: 124, ry: 22.2 },
    'W 250 x 32.7':  { d: 258, bf: 146, tf: 9.1,  tw: 6.1,  Ag: 4210,  Zx: 433000,  rx: 108, ry: 32.8 },
    'W 200 x 22.5':  { d: 206, bf: 102, tf: 8.0,  tw: 6.2,  Ag: 2900,  Zx: 251000,  rx: 85.6, ry: 22.3 },
    'W 150 x 18.0':  { d: 153, bf: 102, tf: 7.1,  tw: 5.8,  Ag: 2340,  Zx: 144000,  rx: 63.4, ry: 22.8 },
    'W 150 x 13.0':  { d: 148, bf: 100, tf: 4.9,  tw: 4.3,  Ag: 1660,  Zx: 122000,  rx: 60.8, ry: 21.4 }
};

// --- DEFAULT AISC SHAPES (Imperial: in, in², in³, in⁴) ---
const DEFAULT_AISC_SHAPES = {
    'W21X50': { d: 20.8, bf: 6.53, tf: 0.535, tw: 0.38, Ag: 14.7, Zx: 110, rx: 8.18, ry: 1.30 },
    'W18X50': { d: 18.0, bf: 7.50, tf: 0.570, tw: 0.355, Ag: 14.7, Zx: 101, rx: 7.38, ry: 1.65 },
    'W16X40': { d: 16.0, bf: 7.00, tf: 0.505, tw: 0.305, Ag: 11.8, Zx: 73.0, rx: 6.63, ry: 1.57 },
    'W14X90': { d: 14.0, bf: 14.5, tf: 0.710, tw: 0.440, Ag: 26.5, Zx: 157, rx: 6.14, ry: 3.70 },
    'W14X68': { d: 14.0, bf: 10.0, tf: 0.720, tw: 0.415, Ag: 20.0, Zx: 115, rx: 6.01, ry: 2.46 },
    'W14X22': { d: 13.7, bf: 5.00, tf: 0.335, tw: 0.230, Ag: 6.49, Zx: 33.2, rx: 5.54, ry: 1.04 },
    'W12X53': { d: 12.1, bf: 9.99, tf: 0.575, tw: 0.345, Ag: 15.6, Zx: 77.9, rx: 5.23, ry: 2.48 },
    'W10X49': { d: 9.98, bf: 10.0, tf: 0.560, tw: 0.340, Ag: 14.4, Zx: 60.4, rx: 4.35, ry: 2.54 },
    'W8X24':  { d: 7.93, bf: 6.50, tf: 0.400, tw: 0.245, Ag: 7.08, Zx: 23.2, rx: 3.42, ry: 1.61 },
    'W6X15':  { d: 5.99, bf: 5.99, tf: 0.260, tw: 0.230, Ag: 4.43, Zx: 10.8, rx: 2.56, ry: 1.46 }
};

let aiscDatabaseCache = { ...DEFAULT_AISC_SHAPES };

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Check URL query parameters (e.g. ?standard=aisc or ?standard=nbr)
    const urlParams = new URLSearchParams(window.location.search);
    const stdParam = urlParams.get('standard');
    if (stdParam && (stdParam.toLowerCase() === 'aisc' || stdParam.toLowerCase() === 'nbr')) {
        setStandard(stdParam.toLowerCase());
    } else {
        setStandard('nbr');
    }

    // 2. Fetch full AISC database if Eel is connected
    loadAiscDatabase();

    // 3. Trigger initial calculation & canvas render
    triggerCalculation();
});

// --- STANDARD SWITCHER ---
function setStandard(standard) {
    currentStandard = standard;
    const btnNbr = document.getElementById('btn-switch-nbr');
    const btnAisc = document.getElementById('btn-switch-aisc');
    const gerdauBox = document.getElementById('gerdau-selector-container');
    const aiscBox = document.getElementById('aisc-selector-container');
    const stdTag = document.getElementById('design-std-tag');
    const methodSelect = document.getElementById('design-method');
    const headerBadge = document.getElementById('header-badge-norm');

    const labelNsd = document.getElementById('label-nsd');
    const labelMsdx = document.getElementById('label-msdx');

    if (standard === 'nbr') {
        btnNbr.classList.add('active');
        btnNbr.classList.remove('text-gray-600', 'dark:text-gray-400');
        btnAisc.classList.remove('active');
        btnAisc.classList.add('text-gray-600', 'dark:text-gray-400');

        gerdauBox.classList.remove('hidden');
        aiscBox.classList.add('hidden');
        stdTag.textContent = 'ABNT NBR 8800:2008';
        if (headerBadge) headerBadge.textContent = 'ABNT NBR 8800:2008 (Brasil)';

        methodSelect.value = 'ELU';
        if (labelNsd) labelNsd.innerHTML = 'N<sub>Sd</sub>';
        if (labelMsdx) labelMsdx.innerHTML = 'M<sub>Sd,x</sub>';

        // Set Metric units by default for NBR
        if (currentUnit !== 'metric') {
            document.getElementById('unit-system').value = 'metric';
            handleUnitChange('metric');
        } else {
            const gVal = document.getElementById('gerdau-select').value;
            loadGerdauProfile(gVal);
        }
    } else {
        btnAisc.classList.add('active');
        btnAisc.classList.remove('text-gray-600', 'dark:text-gray-400');
        btnNbr.classList.remove('active');
        btnNbr.classList.add('text-gray-600', 'dark:text-gray-400');

        gerdauBox.classList.add('hidden');
        aiscBox.classList.remove('hidden');
        stdTag.textContent = 'AISC 360-16 / 360-22';
        if (headerBadge) headerBadge.textContent = 'AISC 360-16/22 (USA)';

        methodSelect.value = 'LRFD';
        if (labelNsd) labelNsd.innerHTML = 'P<sub>u</sub> / P<sub>a</sub>';
        if (labelMsdx) labelMsdx.innerHTML = 'M<sub>ux</sub> / M<sub>ax</sub>';

        // Populate AISC dropdown if empty
        populateAiscDropdown();

        // If currently in metric, switch to imperial for AISC by default
        if (currentUnit !== 'imperial') {
            document.getElementById('unit-system').value = 'imperial';
            handleUnitChange('imperial');
        } else {
            const aVal = document.getElementById('aisc-shape-select').value || 'W14X90';
            loadAiscShape(aVal);
        }
    }
    triggerCalculation();
}

// --- UNIT SYSTEM HANDLING ---
function handleUnitChange(newUnit) {
    const oldUnit = currentUnit;
    currentUnit = newUnit;

    const stressUnits = document.querySelectorAll('.unit-stress');
    const forceUnits = document.querySelectorAll('.unit-force');
    const momentUnits = document.querySelectorAll('.unit-moment');
    const lengthUnits = document.querySelectorAll('.unit-length');
    const fyLabel = document.querySelectorAll('.unit-fy-label');

    if (newUnit === 'imperial') {
        stressUnits.forEach(el => el.textContent = 'ksi');
        forceUnits.forEach(el => el.textContent = 'kips');
        momentUnits.forEach(el => el.textContent = 'kip·ft');
        lengthUnits.forEach(el => el.textContent = 'ft');
        fyLabel.forEach(el => el.innerHTML = 'F<sub>y</sub>');

        // Convert inputs from Metric to Imperial if switching
        if (oldUnit === 'metric') {
            convertInputsToImperial();
        }
    } else {
        stressUnits.forEach(el => el.textContent = 'MPa');
        forceUnits.forEach(el => el.textContent = 'kN');
        momentUnits.forEach(el => el.textContent = 'kN·m');
        lengthUnits.forEach(el => el.textContent = 'm');
        fyLabel.forEach(el => el.innerHTML = 'f<sub>y</sub>');

        // Convert inputs from Imperial to Metric if switching
        if (oldUnit === 'imperial') {
            convertInputsToMetric();
        }
    }

    triggerCalculation();
}

function convertInputsToImperial() {
    const fy = parseFloat(document.getElementById('input-fy').value) || 345;
    document.getElementById('input-fy').value = +(fy / 6.89476).toFixed(1);

    const d = parseFloat(document.getElementById('dim-d').value) || 528;
    const bf = parseFloat(document.getElementById('dim-bf').value) || 209;
    const tf = parseFloat(document.getElementById('dim-tf').value) || 13.3;
    const tw = parseFloat(document.getElementById('dim-tw').value) || 8.9;
    const ag = parseFloat(document.getElementById('dim-ag').value) || 10500;
    const zx = parseFloat(document.getElementById('dim-zx').value) || 2060000;
    const rx = parseFloat(document.getElementById('dim-rx').value) || 213;
    const ry = parseFloat(document.getElementById('dim-ry').value) || 43.8;

    document.getElementById('dim-d').value = +(d / 25.4).toFixed(2);
    document.getElementById('dim-bf').value = +(bf / 25.4).toFixed(2);
    document.getElementById('dim-tf').value = +(tf / 25.4).toFixed(3);
    document.getElementById('dim-tw').value = +(tw / 25.4).toFixed(3);
    document.getElementById('dim-ag').value = +(ag / 645.16).toFixed(2);
    document.getElementById('dim-zx').value = +(zx / 16387.064).toFixed(1);
    document.getElementById('dim-rx').value = +(rx / 25.4).toFixed(2);
    document.getElementById('dim-ry').value = +(ry / 25.4).toFixed(2);

    const nsd = parseFloat(document.getElementById('load-nsd').value) || 500;
    const msdx = parseFloat(document.getElementById('load-msdx').value) || 220;
    const lb = parseFloat(document.getElementById('stab-lb').value) || 5.0;

    document.getElementById('load-nsd').value = +(nsd / 4.44822).toFixed(1);
    document.getElementById('load-msdx').value = +(msdx / 1.35582).toFixed(1);
    document.getElementById('stab-lb').value = +(lb * 3.28084).toFixed(1);
}

function convertInputsToMetric() {
    const fy = parseFloat(document.getElementById('input-fy').value) || 50;
    document.getElementById('input-fy').value = +(fy * 6.89476).toFixed(0);

    const d = parseFloat(document.getElementById('dim-d').value) || 20.8;
    const bf = parseFloat(document.getElementById('dim-bf').value) || 6.53;
    const tf = parseFloat(document.getElementById('dim-tf').value) || 0.535;
    const tw = parseFloat(document.getElementById('dim-tw').value) || 0.380;
    const ag = parseFloat(document.getElementById('dim-ag').value) || 14.7;
    const zx = parseFloat(document.getElementById('dim-zx').value) || 110;
    const rx = parseFloat(document.getElementById('dim-rx').value) || 8.18;
    const ry = parseFloat(document.getElementById('dim-ry').value) || 1.30;

    document.getElementById('dim-d').value = +(d * 25.4).toFixed(1);
    document.getElementById('dim-bf').value = +(bf * 25.4).toFixed(1);
    document.getElementById('dim-tf').value = +(tf * 25.4).toFixed(1);
    document.getElementById('dim-tw').value = +(tw * 25.4).toFixed(1);
    document.getElementById('dim-ag').value = +(ag * 645.16).toFixed(0);
    document.getElementById('dim-zx').value = +(zx * 16387.064).toFixed(0);
    document.getElementById('dim-rx').value = +(rx * 25.4).toFixed(1);
    document.getElementById('dim-ry').value = +(ry * 25.4).toFixed(1);

    const nsd = parseFloat(document.getElementById('load-nsd').value) || 112;
    const msdx = parseFloat(document.getElementById('load-msdx').value) || 162;
    const lb = parseFloat(document.getElementById('stab-lb').value) || 16.4;

    document.getElementById('load-nsd').value = +(nsd * 4.44822).toFixed(0);
    document.getElementById('load-msdx').value = +(msdx * 1.35582).toFixed(0);
    document.getElementById('stab-lb').value = +(lb / 3.28084).toFixed(1);
}

// --- STEEL GRADE SELECTOR ---
function handleSteelGradeChange(grade) {
    const fyInput = document.getElementById('input-fy');
    if (currentUnit === 'metric') {
        if (grade.includes('A572 Gr50') || grade.includes('A992')) fyInput.value = 345;
        else if (grade.includes('A36')) fyInput.value = 250;
        else if (grade.includes('USI-SAC')) fyInput.value = 350;
    } else {
        if (grade.includes('A572 Gr50') || grade.includes('A992')) fyInput.value = 50;
        else if (grade.includes('A36')) fyInput.value = 36;
        else if (grade.includes('USI-SAC')) fyInput.value = 50;
    }
    triggerCalculation();
}

// --- PROFILE LOADING (GERDAU) ---
function loadGerdauProfile(profileKey) {
    const p = GERDAU_W_PROFILES[profileKey];
    if (!p) return;
    currentProfileName = profileKey;
    document.getElementById('canvas-profile-name').textContent = profileKey;

    if (currentUnit === 'metric') {
        document.getElementById('dim-d').value = p.d;
        document.getElementById('dim-bf').value = p.bf;
        document.getElementById('dim-tf').value = p.tf;
        document.getElementById('dim-tw').value = p.tw;
        document.getElementById('dim-ag').value = p.Ag;
        document.getElementById('dim-zx').value = p.Zx;
        document.getElementById('dim-rx').value = p.rx;
        document.getElementById('dim-ry').value = p.ry;
    } else {
        document.getElementById('dim-d').value = +(p.d / 25.4).toFixed(2);
        document.getElementById('dim-bf').value = +(p.bf / 25.4).toFixed(2);
        document.getElementById('dim-tf').value = +(p.tf / 25.4).toFixed(3);
        document.getElementById('dim-tw').value = +(p.tw / 25.4).toFixed(3);
        document.getElementById('dim-ag').value = +(p.Ag / 645.16).toFixed(2);
        document.getElementById('dim-zx').value = +(p.Zx / 16387.064).toFixed(1);
        document.getElementById('dim-rx').value = +(p.rx / 25.4).toFixed(2);
        document.getElementById('dim-ry').value = +(p.ry / 25.4).toFixed(2);
    }
    triggerCalculation();
}

// --- PROFILE LOADING (AISC) ---
async function loadAiscDatabase() {
    if (typeof eel !== 'undefined' && eel.get_aisc_database) {
        try {
            const dbShapes = await eel.get_aisc_database()();
            if (dbShapes && Object.keys(dbShapes).length > 0) {
                aiscDatabaseCache = dbShapes;
                populateAiscDropdown();
            }
        } catch (e) {
            console.warn('Eel AISC database fetch note:', e);
        }
    }
}

function populateAiscDropdown() {
    const select = document.getElementById('aisc-shape-select');
    if (!select || select.options.length > 5) return; // already populated

    select.innerHTML = '';
    const groupW = document.createElement('optgroup');
    groupW.label = 'AISC W-Shapes (Wide Flange)';

    const keys = Object.keys(aiscDatabaseCache);
    keys.forEach(k => {
        if (k.startsWith('W') || !k.includes('-')) {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = k;
            groupW.appendChild(opt);
        }
    });
    select.appendChild(groupW);

    // Set default
    select.value = 'W14X90';
}

function loadAiscShape(shapeKey) {
    const s = aiscDatabaseCache[shapeKey];
    if (!s) return;
    currentProfileName = shapeKey;
    document.getElementById('canvas-profile-name').textContent = shapeKey;

    // Determine if s is from Python DB dictionary (which might have fields 'd', 'bf', 'tf', 'tw', 'A', 'Zx', 'rx', 'ry')
    const dVal = parseFloat(s.d || s.D || 14.0);
    const bfVal = parseFloat(s.bf || s.Bf || s.BF || 14.5);
    const tfVal = parseFloat(s.tf || s.Tf || s.TF || 0.71);
    const twVal = parseFloat(s.tw || s.Tw || s.TW || 0.44);
    const agVal = parseFloat(s.Ag || s.A || 26.5);
    const zxVal = parseFloat(s.Zx || s.ZX || 157.0);
    const rxVal = parseFloat(s.rx || s.Rx || s.RX || 6.14);
    const ryVal = parseFloat(s.ry || s.Ry || s.RY || 3.70);

    if (currentUnit === 'imperial') {
        document.getElementById('dim-d').value = dVal;
        document.getElementById('dim-bf').value = bfVal;
        document.getElementById('dim-tf').value = tfVal;
        document.getElementById('dim-tw').value = twVal;
        document.getElementById('dim-ag').value = agVal;
        document.getElementById('dim-zx').value = zxVal;
        document.getElementById('dim-rx').value = rxVal;
        document.getElementById('dim-ry').value = ryVal;
    } else {
        document.getElementById('dim-d').value = +(dVal * 25.4).toFixed(1);
        document.getElementById('dim-bf').value = +(bfVal * 25.4).toFixed(1);
        document.getElementById('dim-tf').value = +(tfVal * 25.4).toFixed(1);
        document.getElementById('dim-tw').value = +(twVal * 25.4).toFixed(1);
        document.getElementById('dim-ag').value = +(agVal * 645.16).toFixed(0);
        document.getElementById('dim-zx').value = +(zxVal * 16387.064).toFixed(0);
        document.getElementById('dim-rx').value = +(rxVal * 25.4).toFixed(1);
        document.getElementById('dim-ry').value = +(ryVal * 25.4).toFixed(1);
    }
    triggerCalculation();
}

function setCustomSection() {
    currentProfileName = 'Personalizado';
    document.getElementById('canvas-profile-name').textContent = 'Seção Personalizada';
}

function handleDimensionChange() {
    setCustomSection();
    triggerCalculation();
}

// --- CALCULATION ENGINE DISPATCHER ---
function triggerCalculation() {
    const rawInputs = getFormInputs();

    let calcResult;
    if (currentStandard === 'nbr') {
        calcResult = calculateNBR8800(rawInputs);
    } else {
        calcResult = calculateAISC360(rawInputs);
    }

    updateKPIs(calcResult);
    renderReport(calcResult);
    drawSteelCanvas(rawInputs);
}

function getFormInputs() {
    return {
        standard: currentStandard,
        unit: currentUnit,
        method: document.getElementById('design-method').value,
        fy: parseFloat(document.getElementById('input-fy').value) || (currentUnit === 'metric' ? 345 : 50),
        d: parseFloat(document.getElementById('dim-d').value) || (currentUnit === 'metric' ? 528 : 20.8),
        bf: parseFloat(document.getElementById('dim-bf').value) || (currentUnit === 'metric' ? 209 : 6.53),
        tf: parseFloat(document.getElementById('dim-tf').value) || (currentUnit === 'metric' ? 13.3 : 0.535),
        tw: parseFloat(document.getElementById('dim-tw').value) || (currentUnit === 'metric' ? 8.9 : 0.38),
        Ag: parseFloat(document.getElementById('dim-ag').value) || (currentUnit === 'metric' ? 10500 : 14.7),
        Zx: parseFloat(document.getElementById('dim-zx').value) || (currentUnit === 'metric' ? 2060000 : 110),
        rx: parseFloat(document.getElementById('dim-rx').value) || (currentUnit === 'metric' ? 213 : 8.18),
        ry: parseFloat(document.getElementById('dim-ry').value) || (currentUnit === 'metric' ? 43.8 : 1.30),
        Nsd: parseFloat(document.getElementById('load-nsd').value) || 0,
        Msdx: parseFloat(document.getElementById('load-msdx').value) || 0,
        Lb: parseFloat(document.getElementById('stab-lb').value) || (currentUnit === 'metric' ? 5.0 : 16.4),
        Cb: parseFloat(document.getElementById('stab-cb').value) || 1.0,
        K: parseFloat(document.getElementById('stab-k').value) || 1.0,
        E: currentUnit === 'metric' ? 200000 : 29000
    };
}

// --- NBR 8800:2008 CALCULATION CORE ---
function calculateNBR8800(inputs) {
    // Normalise to Base Units: N, mm, MPa
    let fy = inputs.fy;
    let E = 200000; // MPa
    let d = inputs.d;
    let bf = inputs.bf;
    let tf = inputs.tf;
    let tw = inputs.tw;
    let Ag = inputs.Ag;
    let Zx = inputs.Zx;
    let rx = inputs.rx;
    let ry = inputs.ry;
    let Lb_mm = inputs.Lb * 1000.0;
    let Nsd_N = inputs.Nsd * 1000.0;
    let Msdx_Nmm = inputs.Msdx * 1e6;

    if (inputs.unit === 'imperial') {
        fy = inputs.fy * 6.89476;
        E = inputs.E * 6.89476;
        d = inputs.d * 25.4;
        bf = inputs.bf * 25.4;
        tf = inputs.tf * 25.4;
        tw = inputs.tw * 25.4;
        Ag = inputs.Ag * 645.16;
        Zx = inputs.Zx * 16387.064;
        rx = inputs.rx * 25.4;
        ry = inputs.ry * 25.4;
        Lb_mm = inputs.Lb * 0.3048 * 1000.0;
        Nsd_N = inputs.Nsd * 4448.22;
        Msdx_Nmm = inputs.Msdx * 1.35582e6;
    }

    const gamma_a1 = 1.10;
    const K = inputs.K;
    const Cb = Math.max(1.0, inputs.Cb);

    // 1. Classificação da Seção (FLM / FLA)
    const lambda_mesa = (bf / 2.0) / tf;
    const lambda_p_mesa = 0.38 * Math.sqrt(E / fy);
    const lambda_r_mesa = 1.00 * Math.sqrt(E / fy);
    const status_mesa = lambda_mesa <= lambda_p_mesa ? 'Compacta' : (lambda_mesa <= lambda_r_mesa ? 'Não Compacta' : 'Esbelta');

    const h_w = Math.max(1.0, d - 2.0 * tf);
    const lambda_alma = h_w / tw;
    const lambda_p_alma = 3.76 * Math.sqrt(E / fy);
    const lambda_r_alma = 5.70 * Math.sqrt(E / fy);
    const status_alma = lambda_alma <= lambda_p_alma ? 'Compacta' : (lambda_alma <= lambda_r_alma ? 'Não Compacta' : 'Esbelta');

    // 2. Compressão Axial (Nc,Rd)
    const Lc = K * Lb_mm;
    const slenderness_x = rx > 0 ? (K * Lb_mm) / rx : 999;
    const slenderness_y = ry > 0 ? (K * Lb_mm) / ry : 999;
    const max_slenderness = Math.max(slenderness_x, slenderness_y);

    const Ne = (Math.PI ** 2 * E * (Ag * ry ** 2)) / (Lc ** 2);
    const lambda_0 = Ne > 0 ? Math.sqrt((Ag * fy) / Ne) : 0;
    let chi = 0;
    if (lambda_0 <= 1.5) {
        chi = Math.pow(0.658, lambda_0 ** 2);
    } else {
        chi = 0.877 / (lambda_0 ** 2);
    }
    const NcRd_N = (chi * Ag * fy) / gamma_a1;
    const NcRd_user = inputs.unit === 'metric' ? NcRd_N / 1000.0 : NcRd_N / 4448.22;

    // 3. Flexão com Verificação de FLT (NBR 8800:2008 Item 5.4.2)
    const Mpl_Nmm = Zx * fy;
    const Lp_mm = 1.76 * ry * Math.sqrt(E / fy);

    const Ix_approx = (1.0 / 12.0) * tw * (h_w ** 3) + 2.0 * ((1.0 / 12.0) * bf * (tf ** 3) + bf * tf * (((d - tf) / 2.0) ** 2));
    const Wx_approx = Ix_approx / (d / 2.0);
    const Mr_Nmm = 0.7 * fy * Wx_approx;

    const r_ts_denom = 12.0 * (1.0 + (1.0 / 6.0) * (h_w * tw) / (bf * tf));
    const r_ts = bf / Math.sqrt(Math.max(1.0, r_ts_denom));
    const J_approx = (2.0 * bf * (tf ** 3) + h_w * (tw ** 3)) / 3.0;
    const h0 = Math.max(1.0, d - tf);

    const term_bracket = (Wx_approx * h0 > 0) ? J_approx / (Wx_approx * h0) : 0;
    const inner_root = Math.sqrt(term_bracket ** 2 + 6.76 * ((0.7 * fy / E) ** 2));
    const Lr_mm = 1.95 * r_ts * (E / (0.7 * fy)) * Math.sqrt(Math.max(0.0, term_bracket + inner_root));

    let Mn_Nmm = Mpl_Nmm;
    let regime_flt = 'Contido (Sem FLT)';
    if (Lb_mm <= Lp_mm) {
        Mn_Nmm = Mpl_Nmm;
        regime_flt = 'Contido (L_b ≤ L_p)';
    } else if (Lb_mm <= Lr_mm) {
        Mn_Nmm = Cb * (Mpl_Nmm - (Mpl_Nmm - Mr_Nmm) * ((Lb_mm - Lp_mm) / (Lr_mm - Lp_mm)));
        Mn_Nmm = Math.min(Mpl_Nmm, Math.max(0.0, Mn_Nmm));
        regime_flt = 'Inelástico (L_p < L_b ≤ L_r)';
    } else {
        const slenderness_flt = Lb_mm / r_ts;
        const Mcr_Nmm = (Cb * (Math.PI ** 2) * E / (slenderness_flt ** 2)) * Math.sqrt(1.0 + 0.078 * (J_approx / (Wx_approx * h0)) * (slenderness_flt ** 2));
        Mn_Nmm = Math.min(Mpl_Nmm, Math.max(0.0, Mcr_Nmm));
        regime_flt = 'Elástico (L_b > L_r)';
    }

    const Mrd_Nmm = Mn_Nmm / gamma_a1;
    const Mrd_user = inputs.unit === 'metric' ? Mrd_Nmm / 1e6 : Mrd_Nmm / 1.35582e6;

    // 4. Interação N + M (Item 5.5.1.2)
    let ratio_N = 0;
    let ratio_M = 0;
    let interaction_ratio = 0;
    let eq_used = 'N/A';

    if (NcRd_N > 0 && Mrd_Nmm > 0) {
        ratio_N = Math.max(0, Nsd_N) / NcRd_N;
        ratio_M = Math.abs(Msdx_Nmm) / Mrd_Nmm;

        if (ratio_N >= 0.20) {
            interaction_ratio = ratio_N + (8.0 / 9.0) * ratio_M;
            eq_used = 'N_Sd/N_cRd + 8/9 (M_Sdx/M_Rdx) ≤ 1.0';
        } else {
            interaction_ratio = (ratio_N / 2.0) + ratio_M;
            eq_used = 'N_Sd/(2 N_cRd) + M_Sdx/M_Rdx ≤ 1.0';
        }
    }

    return {
        standard: 'NBR 8800:2008',
        method: 'ELU (γa1=1.10)',
        unit: inputs.unit,
        status_mesa,
        status_alma,
        lambda_mesa,
        lambda_p_mesa,
        lambda_alma,
        lambda_p_alma,
        max_slenderness,
        chi,
        lambda_0,
        NcRd: NcRd_user,
        Nsd: inputs.Nsd,
        ratio_N,
        Mrd: Mrd_user,
        Msdx: inputs.Msdx,
        ratio_M,
        Lp: inputs.unit === 'metric' ? Lp_mm / 1000 : Lp_mm / (25.4 * 12),
        Lr: inputs.unit === 'metric' ? Lr_mm / 1000 : Lr_mm / (25.4 * 12),
        Lb: inputs.Lb,
        regime_flt,
        interaction_ratio,
        eq_used,
        is_ok: interaction_ratio <= 1.00 && max_slenderness <= 200
    };
}

// --- AISC 360-16/22 CALCULATION CORE ---
function calculateAISC360(inputs) {
    // Imperial Base Units: kips, in, ksi, kip-ft
    let Fy = inputs.fy;
    let E = 29000.0;
    let d = inputs.d;
    let bf = inputs.bf;
    let tf = inputs.tf;
    let tw = inputs.tw;
    let Ag = inputs.Ag;
    let Zx = inputs.Zx;
    let rx = inputs.rx;
    let ry = inputs.ry;
    let Lb_in = inputs.Lb * 12.0;
    let Pu = inputs.Nsd;
    let Mux = inputs.Msdx;

    if (inputs.unit === 'metric') {
        Fy = inputs.fy / 6.89476;
        E = inputs.E / 6.89476;
        d = inputs.d / 25.4;
        bf = inputs.bf / 25.4;
        tf = inputs.tf / 25.4;
        tw = inputs.tw / 25.4;
        Ag = inputs.Ag / 645.16;
        Zx = inputs.Zx / 16387.064;
        rx = inputs.rx / 25.4;
        ry = inputs.ry / 25.4;
        Lb_in = inputs.Lb * 39.3701;
        Pu = inputs.Nsd / 4.44822;
        Mux = inputs.Msdx / 1.35582;
    }

    const method = inputs.method === 'ASD' ? 'ASD' : 'LRFD';
    const phi_c = 0.90;
    const omega_c = 1.67;
    const phi_b = 0.90;
    const omega_b = 1.67;
    const K = inputs.K;
    const Cb = Math.max(1.0, inputs.Cb);

    // 1. Compactness (Table B4.1b)
    const lambda_f = bf / (2.0 * tf);
    const lambda_pf = 0.38 * Math.sqrt(E / Fy);
    const lambda_rf = 1.00 * Math.sqrt(E / Fy);
    const status_mesa = lambda_f <= lambda_pf ? 'Compact' : (lambda_f <= lambda_rf ? 'Noncompact' : 'Slender');

    const h_w = Math.max(0.1, d - 2.0 * tf);
    const lambda_w = h_w / tw;
    const lambda_pw = 3.76 * Math.sqrt(E / Fy);
    const lambda_rw = 5.70 * Math.sqrt(E / Fy);
    const status_alma = lambda_w <= lambda_pw ? 'Compact' : (lambda_w <= lambda_rw ? 'Noncompact' : 'Slender');

    // 2. Axial Compression (Chapter E)
    const KL_rx = (K * Lb_in) / rx;
    const KL_ry = (K * Lb_in) / ry;
    const max_slenderness = Math.max(KL_rx, KL_ry);

    const Fe = (Math.PI ** 2 * E) / (max_slenderness ** 2);
    const limit_el = 4.71 * Math.sqrt(E / Fy);
    let Fcr = 0;
    if (max_slenderness <= limit_el) {
        Fcr = Math.pow(0.658, Fy / Fe) * Fy;
    } else {
        Fcr = 0.877 * Fe;
    }
    const Pn = Fcr * Ag; // kips
    const Pc = method === 'LRFD' ? phi_c * Pn : Pn / omega_c;
    const Pc_user = inputs.unit === 'imperial' ? Pc : Pc * 4.44822;

    // 3. Flexure (Chapter F)
    const Mp = Fy * Zx; // kip-in
    const Lp_in = 1.76 * ry * Math.sqrt(E / Fy);

    // Section parameters for LTB
    const ho = Math.max(0.1, d - tf);
    const Iy_approx = (2.0 * tf * Math.pow(bf, 3)) / 12.0 + (h_w * Math.pow(tw, 3)) / 12.0;
    const Ix_approx = (tw * Math.pow(h_w, 3)) / 12.0 + 2.0 * ((bf * Math.pow(tf, 3)) / 12.0 + bf * tf * Math.pow(ho / 2.0, 2));
    const Sx = Ix_approx / (d / 2.0);
    const J_approx = (2.0 * bf * Math.pow(tf, 3) + h_w * Math.pow(tw, 3)) / 3.0;
    const rts = bf / Math.sqrt(12.0 * (1.0 + (1.0 / 6.0) * (h_w * tw) / (bf * tf)));

    const c = 1.0;
    const term1 = (J_approx * c) / (Sx * ho);
    const inner_root = Math.sqrt(term1 ** 2 + 6.76 * Math.pow((0.7 * Fy) / E, 2));
    const Lr_in = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(Math.max(0.0, term1 + inner_root));

    let Mn = Mp;
    let regime_flt = 'Full Plasticity (Lb ≤ Lp)';
    if (Lb_in <= Lp_in) {
        Mn = Mp;
        regime_flt = 'No LTB (Lb ≤ Lp)';
    } else if (Lb_in <= Lr_in) {
        Mn = Cb * (Mp - (Mp - 0.7 * Fy * Sx) * ((Lb_in - Lp_in) / (Lr_in - Lp_in)));
        Mn = Math.min(Mp, Math.max(0.0, Mn));
        regime_flt = 'Inelastic LTB (Lp < Lb ≤ Lr)';
    } else {
        const slend_ltb = Lb_in / rts;
        const Fcr_ltb = (Cb * Math.PI ** 2 * E / (slend_ltb ** 2)) * Math.sqrt(1.0 + 0.078 * (J_approx * c / (Sx * ho)) * (slend_ltb ** 2));
        Mn = Math.min(Mp, Fcr_ltb * Sx);
        regime_flt = 'Elastic LTB (Lb > Lr)';
    }

    const Mc = method === 'LRFD' ? (phi_b * Mn) / 12.0 : (Mn / omega_b) / 12.0; // kip-ft
    const Mc_user = inputs.unit === 'imperial' ? Mc : Mc * 1.35582;

    // 4. Interaction (Chapter H, Eq. H1-1a / H1-1b)
    let ratio_N = 0;
    let ratio_M = 0;
    let interaction_ratio = 0;
    let eq_used = 'N/A';

    if (Pc > 0 && Mc > 0) {
        ratio_N = Math.max(0, Pu) / Pc;
        ratio_M = Math.abs(Mux) / Mc;

        if (ratio_N >= 0.20) {
            interaction_ratio = ratio_N + (8.0 / 9.0) * ratio_M;
            eq_used = method === 'LRFD' ? 'Pu/φPn + 8/9(Mux/φMnx) ≤ 1.0 (Eq. H1-1a)' : 'Pa/(Pn/Ω) + 8/9(Max/(Mnx/Ω)) ≤ 1.0 (Eq. H1-1a)';
        } else {
            interaction_ratio = (ratio_N / 2.0) + ratio_M;
            eq_used = method === 'LRFD' ? 'Pu/(2φPn) + Mux/φMnx ≤ 1.0 (Eq. H1-1b)' : 'Pa/(2Pn/Ω) + Max/(Mnx/Ω) ≤ 1.0 (Eq. H1-1b)';
        }
    }

    return {
        standard: 'AISC 360-16/22',
        method: method,
        unit: inputs.unit,
        status_mesa,
        status_alma,
        lambda_mesa: lambda_f,
        lambda_p_mesa: lambda_pf,
        lambda_alma: lambda_w,
        lambda_p_alma: lambda_pw,
        max_slenderness,
        chi: Fcr / Fy,
        lambda_0: 0,
        NcRd: Pc_user,
        Nsd: inputs.Nsd,
        ratio_N,
        Mrd: Mc_user,
        Msdx: inputs.Msdx,
        ratio_M,
        Lp: inputs.unit === 'imperial' ? Lp_in / 12.0 : (Lp_in * 25.4) / 1000.0,
        Lr: inputs.unit === 'imperial' ? Lr_in / 12.0 : (Lr_in * 25.4) / 1000.0,
        Lb: inputs.Lb,
        regime_flt,
        interaction_ratio,
        eq_used,
        is_ok: interaction_ratio <= 1.00 && max_slenderness <= 200
    };
}

// --- UPDATE UI KPIS ---
function updateKPIs(res) {
    const banner = document.getElementById('status-banner');
    const statusIcon = document.getElementById('status-icon');
    const statusTitle = document.getElementById('status-title');
    const statusSub = document.getElementById('status-subtitle');
    const statusBadge = document.getElementById('status-badge');

    const dcrPercent = (res.interaction_ratio * 100).toFixed(1);

    if (res.is_ok) {
        banner.className = 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700 rounded-xl p-4 flex items-center justify-between shadow-sm';
        statusIcon.textContent = '✅';
        statusTitle.className = 'text-base font-bold text-emerald-800 dark:text-emerald-300';
        statusTitle.textContent = `PERFIL CONFORME (${res.standard})`;
        statusSub.className = 'text-xs text-emerald-700 dark:text-emerald-400';
        statusSub.textContent = `As checagens de flambagem local (FLM/FLA), flambagem global e interação atendem à norma.`;
        statusBadge.className = 'inline-block bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider';
        statusBadge.textContent = `Interação: ${dcrPercent}%`;
    } else {
        banner.className = 'bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-700 rounded-xl p-4 flex items-center justify-between shadow-sm';
        statusIcon.textContent = '⚠️';
        statusTitle.className = 'text-base font-bold text-rose-800 dark:text-rose-300';
        statusTitle.textContent = `PERFIL NÃO CONFORME (${res.standard})`;
        statusSub.className = 'text-xs text-rose-700 dark:text-rose-400';
        statusSub.textContent = res.max_slenderness > 200 ? 'A esbeltez máxima ultrapassa o limite normativo (KL/r > 200).' : 'A equação de interação flexo-compressão ultrapassa 1.000.';
        statusBadge.className = 'inline-block bg-rose-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider';
        statusBadge.textContent = `Interação: ${dcrPercent}%`;
    }

    // KPI 1: Interaction
    document.getElementById('kpi-inter-val').textContent = `${dcrPercent}%`;
    const badgeInter = document.getElementById('kpi-inter-badge');
    badgeInter.textContent = res.interaction_ratio <= 1.0 ? 'OK' : 'FALHA';
    badgeInter.className = res.interaction_ratio <= 1.0 ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-rose-600';
    const barInter = document.getElementById('kpi-inter-bar');
    barInter.style.width = `${Math.min(100, res.interaction_ratio * 100)}%`;
    barInter.className = res.interaction_ratio <= 1.0 ? 'bg-emerald-500 h-full rounded-full' : 'bg-rose-500 h-full rounded-full';

    // KPI 2: Compression
    const compPercent = (res.ratio_N * 100).toFixed(1);
    document.getElementById('kpi-comp-val').textContent = `${compPercent}%`;
    document.getElementById('kpi-comp-factor').textContent = `χ = ${res.chi.toFixed(2)}`;
    document.getElementById('kpi-comp-bar').style.width = `${Math.min(100, res.ratio_N * 100)}%`;
    const fUnit = res.unit === 'metric' ? 'kN' : 'kips';
    document.getElementById('kpi-comp-detail').textContent = `${res.Nsd.toFixed(0)} / ${res.NcRd.toFixed(0)} ${fUnit}`;

    // KPI 3: Flexure
    const flexPercent = (res.ratio_M * 100).toFixed(1);
    document.getElementById('kpi-flex-val').textContent = `${flexPercent}%`;
    document.getElementById('kpi-flt-regime').textContent = res.regime_flt.split('(')[0].trim();
    document.getElementById('kpi-flex-bar').style.width = `${Math.min(100, res.ratio_M * 100)}%`;
    const mUnit = res.unit === 'metric' ? 'kN·m' : 'kip·ft';
    document.getElementById('kpi-flex-detail').textContent = `${res.Msdx.toFixed(0)} / ${res.Mrd.toFixed(0)} ${mUnit}`;

    // KPI 4: Slenderness
    document.getElementById('kpi-slenderness-val').textContent = res.max_slenderness.toFixed(1);
    const slendBadge = document.getElementById('kpi-slenderness-badge');
    slendBadge.textContent = res.max_slenderness <= 200 ? '≤ 200 (OK)' : '> 200 (FALHA)';
    slendBadge.className = res.max_slenderness <= 200 ? 'text-xs font-semibold text-emerald-600' : 'text-xs font-semibold text-rose-600';
    document.getElementById('kpi-slenderness-bar').style.width = `${Math.min(100, (res.max_slenderness / 200) * 100)}%`;
}

// --- RENDER DETAILED REPORT ---
function renderReport(res) {
    const container = document.getElementById('steel-report-container');
    if (!container) return;

    const fUnit = res.unit === 'metric' ? 'kN' : 'kips';
    const mUnit = res.unit === 'metric' ? 'kN·m' : 'kip·ft';
    const lUnit = res.unit === 'metric' ? 'm' : 'ft';

    container.innerHTML = `
        <div class="border-b border-gray-100 dark:border-gray-700 pb-2 mb-3 flex items-center justify-between">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span>📋</span> Memória de Cálculo Detalhada (${res.standard})
            </h3>
            <span class="text-xs px-2 py-0.5 rounded font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                ${res.method}
            </span>
        </div>

        <div class="overflow-x-auto text-xs">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 font-semibold">
                        <th class="py-2 px-2">Verificação / Estado Limite</th>
                        <th class="py-2 px-2">Parâmetros Obtidos</th>
                        <th class="py-2 px-2">Solicitante</th>
                        <th class="py-2 px-2">Resistente</th>
                        <th class="py-2 px-2 text-center">Taxa (DCR)</th>
                        <th class="py-2 px-2 text-right">Status</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 dark:divide-gray-700/60 font-medium">
                    <!-- Flange Compactness -->
                    <tr>
                        <td class="py-2.5 px-2">
                            <span class="font-bold text-gray-800 dark:text-gray-200">Compacidade da Mesa (FLM)</span>
                            <div class="text-[10px] text-gray-400">λ = bf/(2·tf) vs λp = 0.38√(E/fy)</div>
                        </td>
                        <td class="py-2.5 px-2">λ = ${res.lambda_mesa.toFixed(2)} | λp = ${res.lambda_p_mesa.toFixed(2)}</td>
                        <td class="py-2.5 px-2">-</td>
                        <td class="py-2.5 px-2"><span class="px-2 py-0.5 rounded text-[11px] font-bold ${res.status_mesa.includes('Compact') ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700'}">${res.status_mesa}</span></td>
                        <td class="py-2.5 px-2 text-center">${(res.lambda_mesa / res.lambda_p_mesa).toFixed(2)}</td>
                        <td class="py-2.5 px-2 text-right">
                            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${res.status_mesa.includes('Compact') ? 'text-emerald-600' : 'text-amber-600'}">OK</span>
                        </td>
                    </tr>

                    <!-- Web Compactness -->
                    <tr>
                        <td class="py-2.5 px-2">
                            <span class="font-bold text-gray-800 dark:text-gray-200">Compacidade da Alma (FLA)</span>
                            <div class="text-[10px] text-gray-400">λ = hw/tw vs λp = 3.76√(E/fy)</div>
                        </td>
                        <td class="py-2.5 px-2">λ = ${res.lambda_alma.toFixed(2)} | λp = ${res.lambda_p_alma.toFixed(2)}</td>
                        <td class="py-2.5 px-2">-</td>
                        <td class="py-2.5 px-2"><span class="px-2 py-0.5 rounded text-[11px] font-bold ${res.status_alma.includes('Compact') ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700'}">${res.status_alma}</span></td>
                        <td class="py-2.5 px-2 text-center">${(res.lambda_alma / res.lambda_p_alma).toFixed(2)}</td>
                        <td class="py-2.5 px-2 text-right">
                            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${res.status_alma.includes('Compact') ? 'text-emerald-600' : 'text-amber-600'}">OK</span>
                        </td>
                    </tr>

                    <!-- Axial Compression -->
                    <tr>
                        <td class="py-2.5 px-2">
                            <span class="font-bold text-gray-800 dark:text-gray-200">Compressão Axial</span>
                            <div class="text-[10px] text-gray-400">Flambagem por flexão em torno do eixo Y</div>
                        </td>
                        <td class="py-2.5 px-2">KL/r = ${res.max_slenderness.toFixed(1)} | χ = ${res.chi.toFixed(2)}</td>
                        <td class="py-2.5 px-2 font-mono">${res.Nsd.toFixed(1)} ${fUnit}</td>
                        <td class="py-2.5 px-2 font-mono">${res.NcRd.toFixed(1)} ${fUnit}</td>
                        <td class="py-2.5 px-2 text-center font-bold font-mono">${(res.ratio_N * 100).toFixed(1)}%</td>
                        <td class="py-2.5 px-2 text-right">
                            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${res.ratio_N <= 1.0 ? 'text-emerald-600' : 'text-rose-600'}">${res.ratio_N <= 1.0 ? 'CONFORME' : 'FALHA'}</span>
                        </td>
                    </tr>

                    <!-- Flexure & FLT -->
                    <tr>
                        <td class="py-2.5 px-2">
                            <span class="font-bold text-gray-800 dark:text-gray-200">Flexão Maior & FLT</span>
                            <div class="text-[10px] text-gray-400">${res.regime_flt} (Lp=${res.Lp.toFixed(2)}${lUnit}, Lb=${res.Lb.toFixed(2)}${lUnit}, Lr=${res.Lr.toFixed(2)}${lUnit})</div>
                        </td>
                        <td class="py-2.5 px-2 font-mono">${res.regime_flt.split('(')[0]}</td>
                        <td class="py-2.5 px-2 font-mono">${res.Msdx.toFixed(1)} ${mUnit}</td>
                        <td class="py-2.5 px-2 font-mono">${res.Mrd.toFixed(1)} ${mUnit}</td>
                        <td class="py-2.5 px-2 text-center font-bold font-mono">${(res.ratio_M * 100).toFixed(1)}%</td>
                        <td class="py-2.5 px-2 text-right">
                            <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${res.ratio_M <= 1.0 ? 'text-emerald-600' : 'text-rose-600'}">${res.ratio_M <= 1.0 ? 'CONFORME' : 'FALHA'}</span>
                        </td>
                    </tr>

                    <!-- Interaction Equation -->
                    <tr class="bg-gray-50/70 dark:bg-gray-800/60">
                        <td class="py-3 px-2">
                            <span class="font-extrabold text-blue-600 dark:text-blue-400">Equação de Interação Global</span>
                            <div class="text-[10px] text-gray-500 font-mono mt-0.5">${res.eq_used}</div>
                        </td>
                        <td class="py-3 px-2 text-xs text-gray-600 dark:text-gray-400">${res.ratio_N >= 0.2 ? 'N/NRd ≥ 0.20' : 'N/NRd < 0.20'}</td>
                        <td class="py-3 px-2 font-mono font-bold">${res.interaction_ratio.toFixed(3)}</td>
                        <td class="py-3 px-2 font-mono font-bold">1.000</td>
                        <td class="py-3 px-2 text-center font-extrabold font-mono text-sm ${res.interaction_ratio <= 1.0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
                            ${(res.interaction_ratio * 100).toFixed(1)}%
                        </td>
                        <td class="py-3 px-2 text-right">
                            <span class="px-2.5 py-1 rounded-full text-xs font-bold ${res.is_ok ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}">
                                ${res.is_ok ? 'APROVADO' : 'REPROVADO'}
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
}

// --- 2D CANVAS SECTION DRAWING ---
function drawSteelCanvas(inputs) {
    const canvas = document.getElementById('steelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 1. Unified RS2 / CAD Slate Background & Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, width, height, true);
        EngCAD.drawGrid(ctx, width, height, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
    }

    const d = inputs.d || 528;
    const bf = inputs.bf || 209;
    const tf = inputs.tf || 13.3;
    const tw = inputs.tw || 8.9;

    const marginX = 140;
    const marginY = 30;
    const availW = width - 2 * marginX;
    const availH = height - 2 * marginY;
    const scale = Math.min(availW / bf, availH / d);

    const dPx = d * scale;
    const bfPx = bf * scale;
    const tfPx = Math.max(4, tf * scale);
    const twPx = Math.max(4, tw * scale);

    const x0 = (width - bfPx) / 2;
    const y0 = (height - dPx) / 2;

    // 2. Draw I-Beam Profile (CAD Blueprint Style with Subtle Hatching)
    ctx.save();
    ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;

    ctx.beginPath();
    // Top flange
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + bfPx, y0);
    ctx.lineTo(x0 + bfPx, y0 + tfPx);
    ctx.lineTo(x0 + (bfPx + twPx) / 2, y0 + tfPx);
    // Web right
    ctx.lineTo(x0 + (bfPx + twPx) / 2, y0 + dPx - tfPx);
    // Bottom flange right
    ctx.lineTo(x0 + bfPx, y0 + dPx - tfPx);
    ctx.lineTo(x0 + bfPx, y0 + dPx);
    // Bottom flange left
    ctx.lineTo(x0, y0 + dPx);
    ctx.lineTo(x0, y0 + dPx - tfPx);
    ctx.lineTo(x0 + (bfPx - twPx) / 2, y0 + dPx - tfPx);
    // Web left
    ctx.lineTo(x0 + (bfPx - twPx) / 2, y0 + tfPx);
    ctx.lineTo(x0, y0 + tfPx);
    ctx.closePath();

    ctx.fill();

    // Clip for subtle 45-deg blueprint hatching
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    const diag = Math.max(bfPx, dPx) * 2;
    for (let l = -diag; l < diag; l += 14) {
        ctx.beginPath();
        ctx.moveTo(x0 + l, y0);
        ctx.lineTo(x0 + l + diag, y0 + diag);
        ctx.stroke();
    }
    ctx.restore();

    ctx.stroke();
    ctx.restore();

    // 3. Centroidal Axes (Dashed Amber/Cyan)
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);

    // Axis X-X (horizontal)
    const midY = y0 + dPx / 2;
    ctx.beginPath();
    ctx.moveTo(x0 - 25, midY); ctx.lineTo(x0 + bfPx + 25, midY);
    ctx.stroke();

    // Axis Y-Y (vertical)
    const midX = x0 + bfPx / 2;
    ctx.beginPath();
    ctx.moveTo(midX, y0 - 15); ctx.lineTo(midX, y0 + dPx + 15);
    ctx.stroke();
    ctx.restore();

    // Axis Labels
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('X', x0 + bfPx + 28, midY + 3);
    ctx.textAlign = 'center';
    ctx.fillText('Y', midX, y0 - 18);

    const unitSuffix = inputs.unit === 'metric' ? 'mm' : 'in';

    // 4. Engineering Dimension lines (Cotas Técnicas RS2)
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawDimension(ctx, x0, y0, x0 + bfPx, y0, `bf = ${bf} ${unitSuffix}`, { offset: -16, isDark: true });
        EngCAD.drawDimension(ctx, x0, y0, x0, y0 + dPx, `d = ${d} ${unitSuffix}`, { offset: -24, isDark: true });
        EngCAD.drawDimension(ctx, x0 + bfPx, y0, x0 + bfPx, y0 + tfPx, `tf = ${tf}`, { offset: 16, isDark: true });
        EngCAD.drawDimension(ctx, x0 + (bfPx - twPx) / 2, y0 + dPx / 2, x0 + (bfPx + twPx) / 2, y0 + dPx / 2, `tw = ${tw}`, { offset: 14, isDark: true });
    } else {
        ctx.fillStyle = '#94a3b8';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.font = '11px Inter, sans-serif';

        const dimYTop = y0 - 10;
        ctx.beginPath();
        ctx.moveTo(x0, dimYTop); ctx.lineTo(x0 + bfPx, dimYTop);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillText(`bf = ${bf} ${unitSuffix}`, midX, dimYTop - 5);

        const dimXLeft = x0 - 20;
        ctx.beginPath();
        ctx.moveTo(dimXLeft, y0); ctx.lineTo(dimXLeft, y0 + dPx);
        ctx.stroke();
        ctx.save();
        ctx.translate(dimXLeft - 8, midY);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(`d = ${d} ${unitSuffix}`, 0, 0);
        ctx.restore();
    }

    // 5. Floating CAD HUD Overlay (RS2 Standard)
    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        EngCAD.updateHUD(canvas.parentElement, 'Perfil Laminado (Seção I)', [
            { label: 'Perfil', value: currentProfileName || 'Customizado', color: '#38bdf8' },
            { label: 'Dimensões (d × bf)', value: `${d} × ${bf} ${unitSuffix}`, color: '#f1f5f9' },
            { label: 'Espessuras (tf / tw)', value: `${tf} / ${tw} ${unitSuffix}`, color: '#f59e0b' },
            { label: 'Área A', value: inputs.A ? `${inputs.A} cm²` : '--', color: '#10b981' }
        ]);
    }
}

// --- SAVE & LOAD JSON ---
function saveSteelJSON() {
    const inputs = getFormInputs();
    inputs.profileName = currentProfileName;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(inputs, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `steel_check_${currentProfileName.replace(/\s+/g, '_')}.json`);
    dlAnchor.click();
}

function loadSteelJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.standard) setStandard(data.standard);
            if (data.unit) {
                document.getElementById('unit-system').value = data.unit;
                handleUnitChange(data.unit);
            }
            if (data.method) document.getElementById('design-method').value = data.method;
            if (data.fy) document.getElementById('input-fy').value = data.fy;
            if (data.d) document.getElementById('dim-d').value = data.d;
            if (data.bf) document.getElementById('dim-bf').value = data.bf;
            if (data.tf) document.getElementById('dim-tf').value = data.tf;
            if (data.tw) document.getElementById('dim-tw').value = data.tw;
            if (data.Ag) document.getElementById('dim-ag').value = data.Ag;
            if (data.Zx) document.getElementById('dim-zx').value = data.Zx;
            if (data.rx) document.getElementById('dim-rx').value = data.rx;
            if (data.ry) document.getElementById('dim-ry').value = data.ry;
            if (data.Nsd !== undefined) document.getElementById('load-nsd').value = data.Nsd;
            if (data.Msdx !== undefined) document.getElementById('load-msdx').value = data.Msdx;
            if (data.Lb !== undefined) document.getElementById('stab-lb').value = data.Lb;
            if (data.Cb !== undefined) document.getElementById('stab-cb').value = data.Cb;
            if (data.K !== undefined) document.getElementById('stab-k').value = data.K;
            if (data.profileName) {
                currentProfileName = data.profileName;
                document.getElementById('canvas-profile-name').textContent = data.profileName;
            }
            triggerCalculation();
        } catch (err) {
            alert("Erro ao ler o arquivo JSON: " + err.message);
        }
    };
    reader.readAsText(file);
}

// --- PDF EXPORT ---
function exportReportPDF() {
    window.print();
}
