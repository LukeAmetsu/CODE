let lastSeismicRunResults = null;
let spectrumChartInstance = null;
let storiesChartInstance = null;

const seismicInputIds = [
    'seismic_asce_standard',
    'seismic_unit_system',
    'seismic_risk_category',
    'seismic_site_class',
    'seismic_ss',
    'seismic_s1',
    'seismic_tl',
    'seismic_fa',
    'seismic_fv',
    'seismic_sfrs_type',
    'seismic_r',
    'seismic_omega0',
    'seismic_cd',
    'seismic_height_hn',
    'seismic_num_stories',
    'seismic_weight_w',
    'seismic_period_t',
    'seismic_redundancy_rho',
    'seismic_is_wharf',
    'seismic_wharf_deck_w',
    'seismic_wharf_num_piles',
    'seismic_wharf_pile_diam',
    'seismic_wharf_pile_sub_len',
    'seismic_wharf_pile_total_len',
    'seismic_wharf_cm',
    'seismic_include_equipment',
    'seismic_equip_wp',
    'seismic_equip_zh',
    'seismic_equip_ap',
    'seismic_equip_rp',
    'seismic_equip_ip'
];

// SFRS Library with normative ASCE 7-22 parameters
const sfrsLibrary = {
    wharf_ductile_concrete_piles: { name: 'Cais Estaqueado - Estacas Concreto Dúctil (ASCE 61 / ASCE 7)', R: 3.0, Omega0: 2.0, Cd: 3.0 },
    wharf_ductile_steel_piles: { name: 'Cais Estaqueado - Estacas Tubulares Metálicas Dúcteis (ASCE 61)', R: 3.5, Omega0: 2.0, Cd: 3.5 },
    wharf_standard_piles: { name: 'Estrutura Portuária Convencional (ASCE 7 Tab. 15.4-2)', R: 2.5, Omega0: 2.0, Cd: 2.5 },
    steel_smf: { name: 'Steel Special Moment Frames (SMF)', R: 8.0, Omega0: 3.0, Cd: 5.5 },
    steel_imf: { name: 'Steel Intermediate Moment Frames (IMF)', R: 4.5, Omega0: 3.0, Cd: 4.0 },
    steel_scbf: { name: 'Steel Special Concentrically Braced Frames (SCBF)', R: 6.0, Omega0: 2.0, Cd: 5.0 },
    steel_brbf: { name: 'Buckling-Restrained Braced Frames (BRBF)', R: 8.0, Omega0: 2.5, Cd: 5.0 },
    concrete_smrf: { name: 'Special Reinforced Concrete Moment Frames', R: 8.0, Omega0: 3.0, Cd: 5.5 },
    concrete_shear_wall: { name: 'Special Reinforced Concrete Shear Walls', R: 5.0, Omega0: 2.5, Cd: 5.0 },
    cantilever_column: { name: 'Cantilever Column Systems', R: 2.5, Omega0: 1.25, Cd: 2.5 },
    custom: { name: 'Personalizado', R: 3.0, Omega0: 2.0, Cd: 3.0 }
};

// Preset Configurations
function loadSeismicPreset(type) {
    const isMetric = (document.getElementById('seismic_unit_system')?.value || 'metric') === 'metric';

    if (type === 'wharf_port') {
        document.getElementById('seismic_sfrs_type').value = 'wharf_ductile_concrete_piles';
        document.getElementById('seismic_risk_category').value = 'IV';
        document.getElementById('seismic_site_class').value = 'D';
        document.getElementById('seismic_ss').value = '1.50';
        document.getElementById('seismic_s1').value = '0.60';
        document.getElementById('seismic_tl').value = '8.0';
        document.getElementById('seismic_height_hn').value = isMetric ? '24.0' : '78.7';
        document.getElementById('seismic_num_stories').value = '1';
        document.getElementById('seismic_weight_w').value = isMetric ? '50000' : '11240';
        document.getElementById('seismic_period_t').value = '';
        
        document.getElementById('seismic_is_wharf').checked = true;
        toggleWharfSection(true);
        document.getElementById('seismic_wharf_deck_w').value = isMetric ? '35000' : '7868';
        document.getElementById('seismic_wharf_num_piles').value = '36';
        document.getElementById('seismic_wharf_pile_diam').value = isMetric ? '1.20' : '3.94';
        document.getElementById('seismic_wharf_pile_sub_len').value = isMetric ? '18.0' : '59.0';
        document.getElementById('seismic_wharf_pile_total_len').value = isMetric ? '24.0' : '78.7';
        document.getElementById('seismic_wharf_cm').value = '1.00';

        document.getElementById('seismic_include_equipment').checked = true;
        toggleEquipmentSection(true);
        document.getElementById('seismic_equip_wp').value = isMetric ? '1500' : '337';
        document.getElementById('seismic_equip_zh').value = '1.0';
        document.getElementById('seismic_equip_ap').value = '2.5';
        document.getElementById('seismic_equip_rp').value = '3.0';
        document.getElementById('seismic_equip_ip').value = '1.5';
    } else if (type === 'steel_smf_building') {
        document.getElementById('seismic_sfrs_type').value = 'steel_smf';
        document.getElementById('seismic_risk_category').value = 'II';
        document.getElementById('seismic_site_class').value = 'C';
        document.getElementById('seismic_ss').value = '1.20';
        document.getElementById('seismic_s1').value = '0.45';
        document.getElementById('seismic_tl').value = '6.0';
        document.getElementById('seismic_height_hn').value = isMetric ? '24.0' : '78.7';
        document.getElementById('seismic_num_stories').value = '6';
        document.getElementById('seismic_weight_w').value = isMetric ? '36000' : '8090';
        document.getElementById('seismic_period_t').value = '0.92';
        
        document.getElementById('seismic_is_wharf').checked = false;
        toggleWharfSection(false);
        document.getElementById('seismic_include_equipment').checked = false;
        toggleEquipmentSection(false);
    } else if (type === 'concrete_wall_building') {
        document.getElementById('seismic_sfrs_type').value = 'concrete_shear_wall';
        document.getElementById('seismic_risk_category').value = 'III';
        document.getElementById('seismic_site_class').value = 'D';
        document.getElementById('seismic_ss').value = '1.00';
        document.getElementById('seismic_s1').value = '0.40';
        document.getElementById('seismic_tl').value = '8.0';
        document.getElementById('seismic_height_hn').value = isMetric ? '30.0' : '98.4';
        document.getElementById('seismic_num_stories').value = '10';
        document.getElementById('seismic_weight_w').value = isMetric ? '80000' : '17980';
        document.getElementById('seismic_period_t').value = '0.75';
        
        document.getElementById('seismic_is_wharf').checked = false;
        toggleWharfSection(false);
        document.getElementById('seismic_include_equipment').checked = false;
        toggleEquipmentSection(false);
    } else if (type === 'port_crane_equipment') {
        document.getElementById('seismic_sfrs_type').value = 'wharf_ductile_concrete_piles';
        document.getElementById('seismic_risk_category').value = 'IV';
        document.getElementById('seismic_site_class').value = 'D';
        document.getElementById('seismic_ss').value = '1.50';
        document.getElementById('seismic_s1').value = '0.60';
        
        document.getElementById('seismic_is_wharf').checked = true;
        toggleWharfSection(true);
        document.getElementById('seismic_include_equipment').checked = true;
        toggleEquipmentSection(true);
        document.getElementById('seismic_equip_wp').value = isMetric ? '5000' : '1124';
        document.getElementById('seismic_equip_zh').value = '1.0';
        document.getElementById('seismic_equip_ap').value = '2.5';
        document.getElementById('seismic_equip_rp').value = '3.0';
        document.getElementById('seismic_equip_ip').value = '1.5';
    }

    handleSfrsPresetChange();
    handleSpectralInputsChange();
    updateApproximatePeriod();
    document.getElementById('run-seismic-calculation-btn')?.click();
}

window.loadSeismicPreset = loadSeismicPreset;

function handleSfrsPresetChange() {
    const preset = document.getElementById('seismic_sfrs_type')?.value || 'wharf_ductile_concrete_piles';
    const data = sfrsLibrary[preset] || sfrsLibrary.custom;
    
    const rEl = document.getElementById('seismic_r');
    const oEl = document.getElementById('seismic_omega0');
    const cdEl = document.getElementById('seismic_cd');
    if (rEl) rEl.value = data.R;
    if (oEl) oEl.value = data.Omega0;
    if (cdEl) cdEl.value = data.Cd;

    updateApproximatePeriod();
}
window.handleSfrsPresetChange = handleSfrsPresetChange;

function toggleWharfSection(checked) {
    const container = document.getElementById('wharf-inputs-container');
    if (container) {
        if (checked) container.classList.remove('hidden');
        else container.classList.add('hidden');
    }
}
window.toggleWharfSection = toggleWharfSection;

function toggleEquipmentSection(checked) {
    const container = document.getElementById('equipment-inputs-container');
    if (container) {
        if (checked) container.classList.remove('hidden');
        else container.classList.add('hidden');
    }
}
window.toggleEquipmentSection = toggleEquipmentSection;

function toggleManualSiteCoefs(checked) {
    const faEl = document.getElementById('seismic_fa');
    const fvEl = document.getElementById('seismic_fv');
    if (faEl && fvEl) {
        faEl.readOnly = !checked;
        fvEl.readOnly = !checked;
        if (checked) {
            faEl.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'cursor-not-allowed');
            fvEl.classList.remove('bg-gray-100', 'dark:bg-gray-700', 'cursor-not-allowed');
        } else {
            faEl.classList.add('bg-gray-100', 'dark:bg-gray-700', 'cursor-not-allowed');
            fvEl.classList.add('bg-gray-100', 'dark:bg-gray-700', 'cursor-not-allowed');
            handleSpectralInputsChange();
        }
    }
}
window.toggleManualSiteCoefs = toggleManualSiteCoefs;

function getSiteCoefficients(siteClass, ss, s1) {
    const sc = siteClass.toUpperCase().trim();
    const faTable = {
        'A': [0.8, 0.8, 0.8, 0.8, 0.8],
        'B': [0.9, 0.9, 0.9, 0.9, 0.9],
        'BC': [1.0, 1.0, 1.0, 1.0, 1.0],
        'C': [1.3, 1.3, 1.2, 1.2, 1.2],
        'CD': [1.4, 1.3, 1.2, 1.1, 1.1],
        'D': [1.6, 1.4, 1.2, 1.1, 1.0],
        'DE': [2.0, 1.5, 1.2, 1.0, 0.9],
        'E': [2.4, 1.7, 1.3, 0.9, 0.9],
        'F': [1.6, 1.4, 1.2, 1.1, 1.0]
    };
    const fvTable = {
        'A': [0.8, 0.8, 0.8, 0.8, 0.8],
        'B': [0.8, 0.8, 0.8, 0.8, 0.8],
        'BC': [1.0, 1.0, 1.0, 1.0, 1.0],
        'C': [1.5, 1.5, 1.5, 1.5, 1.4],
        'CD': [1.8, 1.7, 1.6, 1.5, 1.4],
        'D': [2.4, 2.2, 2.0, 1.9, 1.8],
        'DE': [2.8, 2.5, 2.3, 2.1, 1.9],
        'E': [4.2, 3.8, 3.4, 3.0, 2.8],
        'F': [2.4, 2.2, 2.0, 1.9, 1.8]
    };

    const faRow = faTable[sc] || faTable['D'];
    const fvRow = fvTable[sc] || fvTable['D'];

    const ssPts = [0.25, 0.50, 0.75, 1.00, 1.25];
    let fa = faRow[2];
    if (ss <= ssPts[0]) fa = faRow[0];
    else if (ss >= ssPts[ssPts.length - 1]) fa = faRow[faRow.length - 1];
    else {
        for (let i = 0; i < ssPts.length - 1; i++) {
            if (ss >= ssPts[i] && ss <= ssPts[i + 1]) {
                const t = (ss - ssPts[i]) / (ssPts[i + 1] - ssPts[i]);
                fa = faRow[i] + t * (faRow[i + 1] - faRow[i]);
                break;
            }
        }
    }

    const s1Pts = [0.10, 0.20, 0.30, 0.40, 0.50];
    let fv = fvRow[2];
    if (s1 <= s1Pts[0]) fv = fvRow[0];
    else if (s1 >= s1Pts[s1Pts.length - 1]) fv = fvRow[fvRow.length - 1];
    else {
        for (let i = 0; i < s1Pts.length - 1; i++) {
            if (s1 >= s1Pts[i] && s1 <= s1Pts[i + 1]) {
                const t = (s1 - s1Pts[i]) / (s1Pts[i + 1] - s1Pts[i]);
                fv = fvRow[i] + t * (fvRow[i + 1] - fvRow[i]);
                break;
            }
        }
    }

    return { fa: parseFloat(fa.toFixed(3)), fv: parseFloat(fv.toFixed(3)) };
}

function handleSpectralInputsChange() {
    const isManual = document.getElementById('override-site-coefs')?.checked;
    if (isManual) return;

    const sc = document.getElementById('seismic_site_class')?.value || 'D';
    const ss = parseFloat(document.getElementById('seismic_ss')?.value) || 1.5;
    const s1 = parseFloat(document.getElementById('seismic_s1')?.value) || 0.6;

    const { fa, fv } = getSiteCoefficients(sc, ss, s1);
    const faEl = document.getElementById('seismic_fa');
    const fvEl = document.getElementById('seismic_fv');
    if (faEl) faEl.value = fa.toFixed(2);
    if (fvEl) fvEl.value = fv.toFixed(2);

    updateApproximatePeriod();
}
window.handleSpectralInputsChange = handleSpectralInputsChange;
window.handleSiteClassChange = handleSpectralInputsChange;

function updateImportanceFactor() {
    const risk = document.getElementById('seismic_risk_category')?.value || 'IV';
    const map = { 'I': 1.0, 'II': 1.0, 'III': 1.25, 'IV': 1.5 };
    const ie = map[risk] || 1.25;
    const equipIp = document.getElementById('seismic_equip_ip');
    if (equipIp && risk === 'IV') equipIp.value = '1.5';
}
window.updateImportanceFactor = updateImportanceFactor;

function updateApproximatePeriod() {
    const hn = parseFloat(document.getElementById('seismic_height_hn')?.value) || 24.0;
    const isMetric = (document.getElementById('seismic_unit_system')?.value || 'metric') === 'metric';
    const sfrs = document.getElementById('seismic_sfrs_type')?.value || 'wharf_ductile_concrete_piles';
    
    let Ct = 0.0488;
    let x = 0.75;
    if (sfrs.includes('steel_smf')) {
        Ct = isMetric ? 0.0724 : 0.028;
        x = 0.80;
    } else if (sfrs.includes('concrete_smrf')) {
        Ct = isMetric ? 0.0466 : 0.016;
        x = 0.90;
    } else if (sfrs.includes('braced') || sfrs.includes('scbf') || sfrs.includes('brbf')) {
        Ct = isMetric ? 0.0731 : 0.020;
        x = 0.75;
    } else if (sfrs.includes('wharf')) {
        Ct = isMetric ? 0.0650 : 0.025;
        x = 0.75;
    } else {
        Ct = isMetric ? 0.0488 : 0.020;
        x = 0.75;
    }

    const Ta = Ct * Math.pow(Math.max(0.1, hn), x);
    const taEl = document.getElementById('ta-calc-display');
    if (taEl) {
        taEl.textContent = `Ta = ${Ta.toFixed(3)}s (Ct=${Ct}, x=${x})`;
    }
}
window.updateApproximatePeriod = updateApproximatePeriod;

// Client-Side Standalone JS Calculator
const seismicLoadCalculator = (() => {
    function run(inputs) {
        const standard = inputs.seismic_asce_standard || 'ASCE 7-22';
        const unit_system = inputs.seismic_unit_system || 'metric';
        const is_metric = (unit_system === 'metric');

        const risk_cat = inputs.seismic_risk_category || 'IV';
        const importance_map = { 'I': 1.00, 'II': 1.00, 'III': 1.25, 'IV': 1.50 };
        const Ie = importance_map[risk_cat] || 1.25;

        const site_class = inputs.seismic_site_class || 'D';
        const Ss = parseFloat(inputs.seismic_ss) || 1.50;
        const S1 = parseFloat(inputs.seismic_s1) || 0.60;
        const TL = parseFloat(inputs.seismic_tl) || 8.0;

        let Fa = parseFloat(inputs.seismic_fa);
        let Fv = parseFloat(inputs.seismic_fv);
        if (isNaN(Fa) || isNaN(Fv)) {
            const auto = getSiteCoefficients(site_class, Ss, S1);
            Fa = auto.fa;
            Fv = auto.fv;
        }

        const SMS = Fa * Ss;
        const SM1 = Fv * S1;
        const SDS = (2.0 / 3.0) * SMS;
        const SD1 = (2.0 / 3.0) * SM1;

        // Seismic Design Category
        let sdc_sds = SDS < 0.167 ? 'A' : (SDS < 0.33 ? 'B' : (SDS < 0.50 ? 'C' : 'D'));
        let sdc_sd1 = SD1 < 0.067 ? 'A' : (SD1 < 0.133 ? 'B' : (SD1 < 0.20 ? 'C' : 'D'));
        const order = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6 };
        let governing_sdc = order[sdc_sds] >= order[sdc_sd1] ? sdc_sds : sdc_sd1;
        if (S1 >= 0.75) {
            governing_sdc = (risk_cat === 'IV') ? 'F' : (order[governing_sdc] < order['E'] ? 'E' : governing_sdc);
        }

        // SFRS Parameters
        const sfrs_preset = inputs.seismic_sfrs_type || 'wharf_ductile_concrete_piles';
        const preset_data = sfrsLibrary[sfrs_preset] || sfrsLibrary.wharf_ductile_concrete_piles;
        const R = parseFloat(inputs.seismic_r) || preset_data.R;
        const Omega0 = parseFloat(inputs.seismic_omega0) || preset_data.Omega0;
        const Cd = parseFloat(inputs.seismic_cd) || preset_data.Cd;

        const hn = parseFloat(inputs.seismic_height_hn) || (is_metric ? 24.0 : 78.7);
        const num_stories = parseInt(inputs.seismic_num_stories) || 1;

        // Ta calculation
        let Ct = 0.0488;
        let x_exp = 0.75;
        if (sfrs_preset.includes('steel_smf')) { Ct = is_metric ? 0.0724 : 0.028; x_exp = 0.80; }
        else if (sfrs_preset.includes('concrete_smrf')) { Ct = is_metric ? 0.0466 : 0.016; x_exp = 0.90; }
        else if (sfrs_preset.includes('braced') || sfrs_preset.includes('scbf')) { Ct = is_metric ? 0.0731 : 0.020; x_exp = 0.75; }
        else if (sfrs_preset.includes('wharf')) { Ct = is_metric ? 0.0650 : 0.025; x_exp = 0.75; }
        else { Ct = is_metric ? 0.0488 : 0.020; x_exp = 0.75; }

        const Ta = Ct * Math.pow(Math.max(0.1, hn), x_exp);

        // Cu Table 12.8-1
        let Cu = 1.40;
        if (SD1 <= 0.10) Cu = 1.70;
        else if (SD1 <= 0.15) Cu = 1.70 - ((SD1 - 0.10) / 0.05) * 0.10;
        else if (SD1 <= 0.20) Cu = 1.60 - ((SD1 - 0.15) / 0.05) * 0.10;
        else if (SD1 <= 0.30) Cu = 1.50 - ((SD1 - 0.20) / 0.10) * 0.10;
        else Cu = 1.40;

        const T_max = Cu * Ta;
        const user_period = parseFloat(inputs.seismic_period_t);
        let T = Ta;
        let reason = `Período Fundamental Aproximado Ta = ${Ta.toFixed(3)}s (Eq. 12.8-7)`;
        if (!isNaN(user_period) && user_period > 0) {
            if (user_period > T_max) {
                T = T_max;
                reason = `Período Analítico T=${user_period.toFixed(3)}s limitado por T_max=${T_max.toFixed(3)}s (Cu=${Cu.toFixed(2)})`;
            } else {
                T = user_period;
                reason = `Período Analítico T = ${user_period.toFixed(3)}s`;
            }
        }

        const T0 = SDS > 0 ? 0.2 * (SD1 / SDS) : 0;
        const Ts = SDS > 0 ? (SD1 / SDS) : 0;

        // Cs Seismic Response Coefficient
        const R_over_Ie = R / Ie;
        const Cs_base = SDS / R_over_Ie;
        let Cs_max = (T <= TL) ? (SD1 / (T * R_over_Ie)) : ((SD1 * TL) / (Math.pow(T, 2) * R_over_Ie));
        const Cs_min_std = Math.max(0.044 * SDS * Ie, 0.01);
        let Cs_min_s1 = (S1 >= 0.60) ? (0.5 * S1) / R_over_Ie : 0.0;
        const Cs_min = Math.max(Cs_min_std, Cs_min_s1);

        const Cs_calc = Math.min(Cs_base, Cs_max);
        const Cs = Math.max(Cs_calc, Cs_min);

        // Effective Weight W
        const W_total = parseFloat(inputs.seismic_weight_w) || (is_metric ? 50000.0 : 11240.0);
        const V = Cs * W_total;
        const V_overstrength = Omega0 * V;

        const rho = parseFloat(inputs.seismic_redundancy_rho) || 1.0;
        const Ev_factor = 0.2 * SDS;

        // Vertical distribution
        let k_exp = 1.0;
        if (T >= 2.5) k_exp = 2.0;
        else if (T > 0.5) k_exp = 1.0 + ((T - 0.5) / 2.0);

        const stories_data = [];
        const w_per_story = W_total / Math.max(1, num_stories);
        const story_height_step = hn / Math.max(1, num_stories);

        let sum_w_h_k = 0;
        const temp_levels = [];
        for (let s = 1; s <= num_stories; s++) {
            const hx = s * story_height_step;
            const whk = w_per_story * Math.pow(hx, k_exp);
            sum_w_h_k += whk;
            temp_levels.push({ level: s, hx: hx, wx: w_per_story, whk: whk });
        }

        let cum_shear = 0;
        for (let i = temp_levels.length - 1; i >= 0; i--) {
            const lvl = temp_levels[i];
            const Cvx = sum_w_h_k > 0 ? (lvl.whk / sum_w_h_k) : (1.0 / num_stories);
            const Fx = Cvx * V;
            cum_shear += Fx;
            stories_data.push({
                story: lvl.level,
                height_m: parseFloat(lvl.hx.toFixed(2)),
                weight_kN: parseFloat(lvl.wx.toFixed(1)),
                Cvx: parseFloat(Cvx.toFixed(4)),
                Fx_kN: parseFloat(Fx.toFixed(1)),
                Vx_kN: parseFloat(cum_shear.toFixed(1)),
                Fx_tf: parseFloat((is_metric ? Fx / 9.80665 : Fx).toFixed(1)),
                Vx_tf: parseFloat((is_metric ? cum_shear / 9.80665 : cum_shear).toFixed(1))
            });
        }
        stories_data.reverse();

        let Mot = 0;
        stories_data.forEach(s => { Mot += s.Fx_kN * s.height_m; });

        // Wharf Module (ASCE 61)
        const is_wharf = Boolean(inputs.seismic_is_wharf);
        const wharf_deck_weight = parseFloat(inputs.seismic_wharf_deck_w) || (is_metric ? 35000 : 7868);
        const num_piles = parseInt(inputs.seismic_wharf_num_piles) || 36;
        const pile_diam = parseFloat(inputs.seismic_wharf_pile_diam) || (is_metric ? 1.20 : 3.94);
        const pile_sub_len = parseFloat(inputs.seismic_wharf_pile_sub_len) || (is_metric ? 18.0 : 59.0);
        const pile_tot_len = parseFloat(inputs.seismic_wharf_pile_total_len) || (is_metric ? 24.0 : 78.7);
        const Cm = parseFloat(inputs.seismic_wharf_cm) || 1.0;

        const pile_unit_w = Math.PI * Math.pow(pile_diam / 2.0, 2) * (is_metric ? 24.0 : 150.0 / 1000.0);
        const W_piles = num_piles * pile_tot_len * pile_unit_w;
        const gamma_w = is_metric ? 10.05 : 0.064;
        const vol_sub = Math.PI * Math.pow(pile_diam / 2.0, 2) * pile_sub_len;
        const W_hydro_added = num_piles * Cm * gamma_w * vol_sub;
        const W_wharf_eff = wharf_deck_weight + (0.5 * W_piles) + W_hydro_added;
        const V_wharf = Cs * W_wharf_eff;
        const V_pile_avg = V_wharf / Math.max(1, num_piles);
        const V_pile_overstrength = Omega0 * V_pile_avg;

        // Nonstructural Equipment (Chapter 13)
        const include_equipment = Boolean(inputs.seismic_include_equipment);
        const ap = parseFloat(inputs.seismic_equip_ap) || 2.5;
        const Rp = parseFloat(inputs.seismic_equip_rp) || 3.0;
        const Ip = parseFloat(inputs.seismic_equip_ip) || 1.5;
        const Wp = parseFloat(inputs.seismic_equip_wp) || (is_metric ? 1500 : 337);
        const zh = parseFloat(inputs.seismic_equip_zh) || 1.0;

        const Fp_base = ((0.4 * ap * SDS * Wp) / (Rp / Ip)) * (1.0 + 2.0 * zh);
        const Fp_max = 1.6 * SDS * Ip * Wp;
        const Fp_min = 0.3 * SDS * Ip * Wp;
        const Fp_gov = Math.max(Fp_min, Math.min(Fp_base, Fp_max));

        // Spectrum Curve Points
        const t_end = Math.max(4.0, TL + 1.0);
        const spectrum_points = [];
        const steps = 60;
        const dt = t_end / steps;

        for (let i = 0; i <= steps; i++) {
            const cur_t = parseFloat((i * dt).toFixed(3));
            let sa = 0;
            if (cur_t === 0) sa = 0.4 * SDS;
            else if (cur_t < T0) sa = SDS * (0.4 + 0.6 * (cur_t / T0));
            else if (cur_t <= Ts) sa = SDS;
            else if (cur_t <= TL) sa = SD1 / cur_t;
            else sa = (SD1 * TL) / Math.pow(cur_t, 2);
            spectrum_points.push({ T: cur_t, Sa: parseFloat(sa.toFixed(4)) });
        }

        [T0, Ts, TL, T].forEach(kt => {
            if (kt > 0 && kt <= t_end) {
                let sa = 0;
                if (kt < T0) sa = SDS * (0.4 + 0.6 * (kt / T0));
                else if (kt <= Ts) sa = SDS;
                else if (kt <= TL) sa = SD1 / kt;
                else sa = (SD1 * TL) / Math.pow(kt, 2);
                spectrum_points.push({ T: parseFloat(kt.toFixed(3)), Sa: parseFloat(sa.toFixed(4)) });
            }
        });

        spectrum_points.sort((a, b) => a.T - b.T);
        const unique_spectrum = [];
        const seen_t = new Set();
        spectrum_points.forEach(pt => {
            if (!seen_t.has(pt.T)) {
                seen_t.add(pt.T);
                unique_spectrum.push(pt);
            }
        });

        return {
            success: true,
            standard: standard,
            unit_system: unit_system,
            risk_category: risk_cat,
            importance_factor_Ie: Ie,
            site_class: site_class,
            spectral_parameters: {
                Ss: Ss, S1: S1, Fa: Fa, Fv: Fv,
                SMS: parseFloat(SMS.toFixed(3)), SM1: parseFloat(SM1.toFixed(3)),
                SDS: parseFloat(SDS.toFixed(3)), SD1: parseFloat(SD1.toFixed(3)),
                T0: parseFloat(T0.toFixed(3)), Ts: parseFloat(Ts.toFixed(3)), TL: TL
            },
            sdc: {
                governing: governing_sdc,
                sdc_sds: sdc_sds,
                sdc_sd1: sdc_sd1
            },
            sfrs: {
                preset: sfrs_preset,
                name: preset_data.name,
                R: R, Omega0: Omega0, Cd: Cd
            },
            periods: {
                Ta: parseFloat(Ta.toFixed(3)),
                Cu: parseFloat(Cu.toFixed(2)),
                T_max: parseFloat(T_max.toFixed(3)),
                T_operating: parseFloat(T.toFixed(3)),
                reason: reason
            },
            seismic_coefficient_cs: {
                Cs_governing: parseFloat(Cs.toFixed(4)),
                Cs_base: parseFloat(Cs_base.toFixed(4)),
                Cs_max: parseFloat(Cs_max.toFixed(4)),
                Cs_min: parseFloat(Cs_min.toFixed(4)),
                Cs_min_s1: parseFloat(Cs_min_s1.toFixed(4))
            },
            base_shear: {
                W_total: parseFloat(W_total.toFixed(1)),
                V: parseFloat(V.toFixed(1)),
                V_tf: parseFloat((is_metric ? V / 9.80665 : V).toFixed(1)),
                V_overstrength: parseFloat(V_overstrength.toFixed(1)),
                V_overstrength_tf: parseFloat((is_metric ? V_overstrength / 9.80665 : V_overstrength).toFixed(1)),
                Mot: parseFloat(Mot.toFixed(1)),
                Mot_tfm: parseFloat((is_metric ? Mot / 9.80665 : Mot).toFixed(1))
            },
            vertical_effects: {
                rho: rho,
                Ev_factor: parseFloat(Ev_factor.toFixed(3)),
                lrfd_comb_grav_seismic: `(1.2 + ${Ev_factor.toFixed(2)})D + ${rho}QE + L = ${(1.2 + Ev_factor).toFixed(2)}D + ${rho}QE + L`,
                lrfd_comb_uplift: `(0.9 - ${Ev_factor.toFixed(2)})D + ${rho}QE = ${(0.9 - Ev_factor).toFixed(2)}D + ${rho}QE`
            },
            stories: stories_data,
            wharf_module: {
                is_applicable: is_wharf,
                deck_weight: parseFloat(wharf_deck_weight.toFixed(1)),
                num_piles: num_piles,
                pile_diameter: pile_diam,
                pile_submerged_len: pile_sub_len,
                piles_self_weight: parseFloat(W_piles.toFixed(1)),
                hydrodynamic_added_weight: parseFloat(W_hydro_added.toFixed(1)),
                total_effective_seismic_weight: parseFloat(W_wharf_eff.toFixed(1)),
                V_wharf: parseFloat(V_wharf.toFixed(1)),
                V_wharf_tf: parseFloat((is_metric ? V_wharf / 9.80665 : V_wharf).toFixed(1)),
                V_per_pile_avg: parseFloat(V_pile_avg.toFixed(1)),
                V_per_pile_avg_tf: parseFloat((is_metric ? V_pile_avg / 9.80665 : V_pile_avg).toFixed(1)),
                V_per_pile_overstrength: parseFloat(V_pile_overstrength.toFixed(1)),
                V_per_pile_overstrength_tf: parseFloat((is_metric ? V_pile_overstrength / 9.80665 : V_pile_overstrength).toFixed(1))
            },
            nonstructural_equipment: {
                is_applicable: include_equipment,
                ap: ap, Rp: Rp, Ip: Ip,
                Wp: parseFloat(Wp.toFixed(1)),
                z_over_h: zh,
                Fp_base: parseFloat(Fp_base.toFixed(1)),
                Fp_min: parseFloat(Fp_min.toFixed(1)),
                Fp_max: parseFloat(Fp_max.toFixed(1)),
                Fp_governing: parseFloat(Fp_gov.toFixed(1)),
                Fp_tf: parseFloat((is_metric ? Fp_gov / 9.80665 : Fp_gov).toFixed(1))
            },
            spectrum_curve: unique_spectrum
        };
    }

    return { run };
})();

// Calculation handler connecting Eel and JS engine
const handleRunSeismicCheck = createCalculationHandler({
    inputIds: seismicInputIds,
    storageKey: 'seismic-calculator-inputs',
    validationRuleKey: 'seismic',
    calculatorFunction: async (inputs, validation) => {
        if (typeof window.eel !== 'undefined' && typeof window.eel.calculate_asce_seismic === 'function') {
            try {
                const pyRes = await window.eel.calculate_asce_seismic(inputs)();
                if (pyRes && pyRes.success) return pyRes;
            } catch (err) {
                console.warn("Eel seismic backend error, falling back to JS calculator:", err);
            }
        }
        return seismicLoadCalculator.run(inputs, validation);
    },
    renderFunction: renderSeismicResults,
    resultsContainerId: 'seismic-results-container',
    buttonId: 'run-seismic-calculation-btn',
    feedbackElId: 'feedback-message'
});

function renderSeismicResults(data) {
    lastSeismicRunResults = data;
    const container = document.getElementById('seismic-results-container');
    if (!container) return;

    const { spectral_parameters, sdc, sfrs, periods, seismic_coefficient_cs, base_shear, stories, wharf_module, nonstructural_equipment, unit_system } = data;
    const is_m = (unit_system === 'metric');

    const f_unit = is_m ? 'kN' : 'kips';
    const f_alt = is_m ? 'tf' : 'kips';
    const l_unit = is_m ? 'm' : 'ft';

    // Update schematic badge
    const diagBadge = document.getElementById('diagram-sdc-badge');
    if (diagBadge) {
        diagBadge.textContent = `SDC: ${sdc.governing}`;
    }

    let html = `
    <div class="space-y-6 animate-fade-in">
        <!-- Top Executive KPI Card -->
        <div class="p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 text-white rounded-2xl shadow-xl">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                    <span class="text-xs font-semibold uppercase tracking-wider text-blue-200">ASCE 7-22 / 7-16 • Cap. 11, 12, 13 & ASCE 61</span>
                    <h3 class="text-2xl font-black">Cargas Sísmicas & Análise Estática Equivalente (ELF)</h3>
                </div>
                <div class="flex items-center gap-2">
                    <span class="px-3 py-1 rounded-full text-xs font-black uppercase bg-rose-500/80 text-white border border-rose-400/30">SDC ${sdc.governing}</span>
                    <span class="px-3 py-1 rounded-full text-xs font-bold bg-white/20 text-white">${unit_system.toUpperCase()}</span>
                    <button type="button" onclick="openSeismicReportModal()" class="px-3.5 py-1 rounded-full text-xs font-bold bg-amber-400 hover:bg-amber-300 text-gray-950 transition flex items-center gap-1 shadow-xs cursor-pointer">
                        <span>📄</span> Memorial de Cálculo Técnico
                    </button>
                </div>
            </div>

            <p class="text-sm text-blue-200 mb-6 flex items-center gap-2">
                <span>⚡</span> Sistema: <span class="font-bold text-white underline decoration-blue-400">${sfrs.name}</span> (R = ${sfrs.R}, Ω₀ = ${sfrs.Omega0}, Cd = ${sfrs.Cd})
            </p>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/15">
                    <span class="text-xs text-blue-200 uppercase font-semibold">Cortante Basal ($V$)</span>
                    <div class="text-2xl font-black mt-1 text-white">${base_shear.V.toLocaleString()} <span class="text-sm font-normal">${f_unit}</span></div>
                    <span class="text-xs text-amber-300 font-bold">${base_shear.V_tf.toLocaleString()} ${f_alt}</span>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/15">
                    <span class="text-xs text-blue-200 uppercase font-semibold">Coeficiente Sísmico ($C_s$)</span>
                    <div class="text-2xl font-black mt-1 text-white">${seismic_coefficient_cs.Cs_governing.toFixed(4)}</div>
                    <span class="text-xs text-blue-300">Base: ${seismic_coefficient_cs.Cs_base.toFixed(4)} | Min: ${seismic_coefficient_cs.Cs_min.toFixed(4)}</span>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/15">
                    <span class="text-xs text-blue-200 uppercase font-semibold">Período Operante ($T$)</span>
                    <div class="text-2xl font-black mt-1 text-white">${periods.T_operating.toFixed(3)} <span class="text-sm font-normal">s</span></div>
                    <span class="text-xs text-emerald-300 font-semibold">Ta = ${periods.Ta.toFixed(3)}s | Tmax = ${periods.T_max.toFixed(3)}s</span>
                </div>
                <div class="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/15">
                    <span class="text-xs text-blue-200 uppercase font-semibold">Sobrerresistência ($\Omega_0 V$)</span>
                    <div class="text-2xl font-black mt-1 text-rose-300">${base_shear.V_overstrength.toLocaleString()} <span class="text-sm font-normal">${f_unit}</span></div>
                    <span class="text-xs text-rose-200">${base_shear.V_overstrength_tf.toLocaleString()} ${f_alt}</span>
                </div>
            </div>
        </div>

        <!-- Spectral & Design Parameters Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Card 1: Espectro de Projeto (SDS, SD1, SMS, SM1) -->
            <div class="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h4 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <span>📈</span> Acelerações Espectrais
                    </h4>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">Sec. 11.4</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                    <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-750">
                        <span class="text-gray-500 block">Ss / S1:</span>
                        <b class="text-gray-800 dark:text-gray-100">${spectral_parameters.Ss.toFixed(2)}g / ${spectral_parameters.S1.toFixed(2)}g</b>
                    </div>
                    <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-750">
                        <span class="text-gray-500 block">Fa / Fv:</span>
                        <b class="text-gray-800 dark:text-gray-100">${spectral_parameters.Fa.toFixed(2)} / ${spectral_parameters.Fv.toFixed(2)}</b>
                    </div>
                    <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                        <span class="block">SDS (Design):</span>
                        <b class="text-base font-black">${spectral_parameters.SDS.toFixed(3)}g</b>
                    </div>
                    <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                        <span class="block">SD1 (Design):</span>
                        <b class="text-base font-black">${spectral_parameters.SD1.toFixed(3)}g</b>
                    </div>
                    <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-750 col-span-2">
                        <span class="text-gray-500 block">Períodos de Canto:</span>
                        <b>T0 = ${spectral_parameters.T0.toFixed(3)}s | Ts = ${spectral_parameters.Ts.toFixed(3)}s | TL = ${spectral_parameters.TL.toFixed(1)}s</b>
                    </div>
                </div>
            </div>

            <!-- Card 2: Categoria de Projeto Sísmico (SDC) -->
            <div class="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h4 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <span>🛡️</span> Categoria Sísmica (SDC)
                    </h4>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">Tab. 11.6</span>
                </div>
                <div class="space-y-2 text-xs">
                    <div class="p-2.5 rounded-lg bg-purple-50 dark:bg-purple-950/40 flex items-center justify-between">
                        <span class="font-semibold text-purple-900 dark:text-purple-200">SDC Governante:</span>
                        <span class="px-2.5 py-1 rounded-md text-sm font-black bg-purple-600 text-white">Categoria ${sdc.governing}</span>
                    </div>
                    <div class="text-[11px] text-gray-600 dark:text-gray-300 space-y-1">
                        <div>• Por SDS (${spectral_parameters.SDS.toFixed(3)}g): <b>SDC ${sdc.sdc_sds}</b></div>
                        <div>• Por SD1 (${spectral_parameters.SD1.toFixed(3)}g): <b>SDC ${sdc.sdc_sd1}</b></div>
                        <div>• Risco ${data.risk_category} (Ie = ${data.importance_factor_Ie}) | Solo Classe ${data.site_class}</div>
                    </div>
                    <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-750 text-[11px] text-gray-600 dark:text-gray-400">
                        ${sdc.governing >= 'D' ? '⚠️ Exige detalhamento sismorresistente especial com ductilidade estrita.' : 'Ductilidade convencional permitida.'}
                    </div>
                </div>
            </div>

            <!-- Card 3: Efeito Vertical & Tombamento -->
            <div class="p-5 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
                <div class="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
                    <h4 class="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                        <span>⚖️</span> Efeito Vertical & Tombamento
                    </h4>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">Sec. 12.4</span>
                </div>
                <div class="space-y-2 text-xs">
                    <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-750">
                        <span class="text-gray-500 block">Momento de Tombamento Basal ($M_{ot}$):</span>
                        <b class="text-base font-extrabold text-indigo-700 dark:text-indigo-400">${base_shear.Mot.toLocaleString()} ${f_unit}·${l_unit}</b>
                        <span class="text-[11px] text-gray-400 block">${base_shear.Mot_tfm.toLocaleString()} tf·m</span>
                    </div>
                    <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
                        <div><b>Efeito Sísmico Vertical:</b> $E_v = 0.2 S_{DS} D = ${(data.vertical_effects.Ev_factor).toFixed(2)} D$</div>
                        <div><b>Combinação Gravidade:</b> ${data.vertical_effects.lrfd_comb_grav_seismic}</div>
                        <div><b>Combinação Alívio:</b> ${data.vertical_effects.lrfd_comb_uplift}</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Charts Row: Response Spectrum Plot & Story Distribution Profile -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <!-- Left Chart: Espectro de Resposta de Projeto (Chart.js) -->
            <div class="lg:col-span-7 bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h4 class="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                            <span>📈</span> Espectro de Aceleração de Projeto $S_a(T)$
                        </h4>
                        <span class="text-xs text-gray-500">ASCE 7-22 Fig. 11.4-1 com período operacional marcado</span>
                    </div>
                    <div class="flex items-center gap-2 text-xs">
                        <span class="inline-flex items-center gap-1 font-bold text-blue-600 dark:text-blue-400">
                            <span class="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span> Espectro
                        </span>
                        <span class="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400">
                            <span class="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span> Ponto T Operante
                        </span>
                    </div>
                </div>
                <div class="h-72 w-full relative">
                    <canvas id="seismic-spectrum-canvas"></canvas>
                </div>
            </div>

            <!-- Right Chart: Story Shear & Force Profile (Chart.js) -->
            <div class="lg:col-span-5 bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs">
                <div class="flex items-center justify-between mb-4">
                    <div>
                        <h4 class="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                            <span>🏢</span> Perfil Vertical de Cortante $V_x$
                        </h4>
                        <span class="text-xs text-gray-500">Distribuição estática equivalente por pavimento</span>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                        Eq. 12.8-11
                    </span>
                </div>
                <div class="h-72 w-full relative">
                    <canvas id="seismic-stories-canvas"></canvas>
                </div>
            </div>
        </div>

        <!-- Full Story Force Distribution Table -->
        <div class="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
            <div class="flex items-center justify-between">
                <div>
                    <h4 class="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                        <span>📊</span> Distribuição Vertical de Forças Sísmicas nos Pavimentos (Sec. 12.8.3)
                    </h4>
                    <span class="text-xs text-gray-500">Expoente de distribuição vertical: k = ${data.periods.T_operating <= 0.5 ? '1.00' : (data.periods.T_operating >= 2.5 ? '2.00' : (1.0 + (data.periods.T_operating - 0.5)/2.0).toFixed(2))}</span>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                    <thead class="bg-gray-100 dark:bg-gray-700 uppercase font-bold text-gray-700 dark:text-gray-300">
                        <tr>
                            <th class="p-2.5">Pavimento / Nível</th>
                            <th class="p-2.5">Altura $h_x$ [${l_unit}]</th>
                            <th class="p-2.5">Peso $w_x$ [${f_unit}]</th>
                            <th class="p-2.5">Fator $C_{vx}$</th>
                            <th class="p-2.5">Força Lateral $F_x$ [${f_unit}]</th>
                            <th class="p-2.5">Cortante $V_x$ [${f_unit}]</th>
                            <th class="p-2.5">Força $F_x$ [${f_alt}]</th>
                            <th class="p-2.5">Cortante $V_x$ [${f_alt}]</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 dark:divide-gray-700 font-mono">
                        ${stories.map(s => `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-750">
                                <td class="p-2.5 font-bold font-sans">Nível ${s.story}</td>
                                <td class="p-2.5">${s.height_m.toFixed(2)}</td>
                                <td class="p-2.5">${s.weight_kN.toLocaleString()}</td>
                                <td class="p-2.5 text-blue-600 dark:text-blue-400 font-bold">${s.Cvx.toFixed(4)}</td>
                                <td class="p-2.5 font-bold text-rose-600 dark:text-rose-400">${s.Fx_kN.toLocaleString()}</td>
                                <td class="p-2.5 font-bold text-indigo-600 dark:text-indigo-400">${s.Vx_kN.toLocaleString()}</td>
                                <td class="p-2.5 text-gray-600 dark:text-gray-300">${s.Fx_tf.toLocaleString()}</td>
                                <td class="p-2.5 text-gray-600 dark:text-gray-300">${s.Vx_tf.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Specialized Marine Wharf (ASCE 61) & Equipment (Chapter 13) Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            ${wharf_module.is_applicable ? `
                <div class="p-5 bg-gradient-to-br from-indigo-50/60 to-white dark:from-indigo-950/30 dark:to-gray-800 rounded-2xl border border-indigo-200 dark:border-indigo-800/60 shadow-xs space-y-3">
                    <div class="flex items-center justify-between border-b border-indigo-100 dark:border-indigo-800/40 pb-2">
                        <h4 class="text-sm font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                            <span>⚓</span> Cais Portuário & Estacas (ASCE 61 Sec. 3.4.2)
                        </h4>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">Piers & Wharves</span>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="grid grid-cols-2 gap-2">
                            <div class="p-2 rounded-lg bg-white dark:bg-gray-750 border border-indigo-100 dark:border-indigo-800/40">
                                <span class="text-gray-500 block">Massa Hidrodinâmica ($W_{hydro}$):</span>
                                <b class="text-sm text-indigo-700 dark:text-indigo-400">${wharf_module.hydrodynamic_added_weight.toLocaleString()} ${f_unit}</b>
                            </div>
                            <div class="p-2 rounded-lg bg-white dark:bg-gray-750 border border-indigo-100 dark:border-indigo-800/40">
                                <span class="text-gray-500 block">Peso Sísmico Efetivo Total:</span>
                                <b class="text-sm text-gray-900 dark:text-white">${wharf_module.total_effective_seismic_weight.toLocaleString()} ${f_unit}</b>
                            </div>
                        </div>
                        <div class="p-3 rounded-xl bg-white dark:bg-gray-750 border border-indigo-200 dark:border-indigo-800 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-gray-800 dark:text-gray-200">Demanda Cortante Média por Estaca ($V_{pile}$):</span>
                                <span class="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">${wharf_module.V_per_pile_avg.toLocaleString()} ${f_unit} (${wharf_module.V_per_pile_avg_tf} ${f_alt})</span>
                            </div>
                            <div class="flex items-center justify-between text-[11px] pt-1 border-t border-gray-100 dark:border-gray-700">
                                <span class="text-rose-600 dark:text-rose-400 font-semibold">Cortante com Sobrerresistência ($\Omega_0 V_{pile}$):</span>
                                <span class="font-mono font-bold text-rose-600 dark:text-rose-400">${wharf_module.V_per_pile_overstrength.toLocaleString()} ${f_unit} (${wharf_module.V_per_pile_overstrength_tf} ${f_alt})</span>
                            </div>
                        </div>
                        <p class="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                            Mesa do Cais com ${wharf_module.num_piles} estacas de Ø${wharf_module.pile_diameter}m com trecho submerso de ${wharf_module.pile_submerged_len}m. Cortante basal específico do cais: ${wharf_module.V_wharf.toLocaleString()} ${f_unit}.
                        </p>
                    </div>
                </div>
            ` : ''}

            ${nonstructural_equipment.is_applicable ? `
                <div class="p-5 bg-gradient-to-br from-amber-50/60 to-white dark:from-amber-950/30 dark:to-gray-800 rounded-2xl border border-amber-200 dark:border-amber-800/60 shadow-xs space-y-3">
                    <div class="flex items-center justify-between border-b border-amber-100 dark:border-amber-800/40 pb-2">
                        <h4 class="text-sm font-bold text-amber-900 dark:text-amber-300 flex items-center gap-2">
                            <span>🏗️</span> Equipamentos & Guindastes (ASCE 7 Cap. 13)
                        </h4>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">Sec. 13.3</span>
                    </div>
                    <div class="space-y-2 text-xs">
                        <div class="grid grid-cols-2 gap-2">
                            <div class="p-2 rounded-lg bg-white dark:bg-gray-750 border border-amber-100 dark:border-amber-800/40">
                                <span class="text-gray-500 block">Peso do Equipamento ($W_p$):</span>
                                <b class="text-sm text-gray-900 dark:text-white">${nonstructural_equipment.Wp.toLocaleString()} ${f_unit}</b>
                            </div>
                            <div class="p-2 rounded-lg bg-white dark:bg-gray-750 border border-amber-100 dark:border-amber-800/40">
                                <span class="text-gray-500 block">Fatores $a_p / R_p / I_p$:</span>
                                <b class="text-sm text-gray-900 dark:text-white">${nonstructural_equipment.ap} / ${nonstructural_equipment.Rp} / ${nonstructural_equipment.Ip}</b>
                            </div>
                        </div>
                        <div class="p-3 rounded-xl bg-white dark:bg-gray-750 border border-amber-200 dark:border-amber-800 space-y-1.5">
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-amber-950 dark:text-amber-200">Força Sísmica Horizontal ($F_p$):</span>
                                <span class="font-mono font-black text-sm text-amber-600 dark:text-amber-400">${nonstructural_equipment.Fp_governing.toLocaleString()} ${f_unit} (${nonstructural_equipment.Fp_tf} ${f_alt})</span>
                            </div>
                            <div class="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-700">
                                <span>Limites Normativos Eq. 13.3-1 a 13.3-3:</span>
                                <span>Min: ${nonstructural_equipment.Fp_min.toLocaleString()} | Max: ${nonstructural_equipment.Fp_max.toLocaleString()} ${f_unit}</span>
                            </div>
                        </div>
                        <p class="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                            Força lateral para fixação de chumbadores, trilhos de guindaste e conexões mecânicas no nível z/h = ${nonstructural_equipment.z_over_h}.
                        </p>
                    </div>
                </div>
            ` : ''}
        </div>
    </div>
    `;

    container.innerHTML = html;

    // Render the two charts
    setTimeout(() => {
        renderSpectrumChart(data.spectrum_curve, periods.T_operating, seismic_coefficient_cs.Cs_governing, spectral_parameters.SDS, spectral_parameters.SD1, spectral_parameters.T0, spectral_parameters.Ts, spectral_parameters.TL);
        renderStoriesChart(stories, is_m);
    }, 50);
}

function renderSpectrumChart(curvePoints, T_operating, Cs_gov, SDS, SD1, T0, Ts, TL) {
    const canvas = document.getElementById('seismic-spectrum-canvas');
    if (!canvas) return;

    if (spectrumChartInstance) {
        spectrumChartInstance.destroy();
        spectrumChartInstance = null;
    }

    const labels = curvePoints.map(p => p.T);
    const dataSa = curvePoints.map(p => p.Sa);

    // Find operating point Sa
    let operatingSa = SDS;
    if (T_operating < T0) operatingSa = SDS * (0.4 + 0.6 * (T_operating / T0));
    else if (T_operating <= Ts) operatingSa = SDS;
    else if (T_operating <= TL) operatingSa = SD1 / T_operating;
    else operatingSa = (SD1 * TL) / Math.pow(T_operating, 2);

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    spectrumChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Espectro de Projeto Sa(T)',
                    data: curvePoints.map(p => ({ x: p.T, y: p.Sa })),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: `Período Operante T=${T_operating.toFixed(2)}s`,
                    data: [{ x: T_operating, y: operatingSa }],
                    borderColor: '#ef4444',
                    backgroundColor: '#ef4444',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: textColor, font: { size: 11, family: 'Inter' } }
                },
                tooltip: {
                    callbacks: {
                        label: function (ctx) {
                            return `${ctx.dataset.label}: T=${ctx.parsed.x}s, Sa=${ctx.parsed.y}g`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Período Fundamental T [s]', color: textColor, font: { weight: 'bold' } },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y: {
                    title: { display: true, text: 'Aceleração Espectral Sa [g]', color: textColor, font: { weight: 'bold' } },
                    grid: { color: gridColor },
                    ticks: { color: textColor },
                    min: 0
                }
            }
        }
    });
}

function renderStoriesChart(stories, isMetric) {
    const canvas = document.getElementById('seismic-stories-canvas');
    if (!canvas) return;

    if (storiesChartInstance) {
        storiesChartInstance.destroy();
        storiesChartInstance = null;
    }

    const labels = stories.map(s => `Nível ${s.story} (${s.height_m}m)`);
    const dataVx = stories.map(s => s.Vx_kN);
    const dataFx = stories.map(s => s.Fx_kN);

    const isDark = document.documentElement.classList.contains('dark');
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    storiesChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Força Lateral Fx [kN]',
                    data: dataFx,
                    backgroundColor: 'rgba(239, 68, 68, 0.75)',
                    borderRadius: 4
                },
                {
                    label: 'Cortante Acumulado Vx [kN]',
                    data: dataVx,
                    backgroundColor: 'rgba(79, 70, 229, 0.75)',
                    borderRadius: 4
                }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: textColor, font: { size: 10, family: 'Inter' } }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Força [kN]', color: textColor, font: { weight: 'bold' } },
                    grid: { color: gridColor },
                    ticks: { color: textColor }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: textColor }
                }
            }
        }
    });
}

// Executive Technical Memorial Report (KaTeX + PDF/Word)
function openSeismicReportModal() {
    if (!lastSeismicRunResults) return;

    const modal = document.getElementById('seismic-report-modal');
    const body = document.getElementById('seismic-modal-report-body');
    if (!modal || !body) return;

    const data = lastSeismicRunResults;
    const { spectral_parameters, sdc, sfrs, periods, seismic_coefficient_cs, base_shear, stories, wharf_module, nonstructural_equipment, unit_system } = data;
    const is_m = (unit_system === 'metric');
    const f_unit = is_m ? 'kN' : 'kips';
    const l_unit = is_m ? 'm' : 'ft';

    let contentHtml = `
    <div id="seismic-modal-report-content" class="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100 space-y-6">
        
        <!-- Header Document -->
        <div class="border-b-2 border-indigo-600 pb-4 flex justify-between items-start">
            <div>
                <h1 class="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    Memorial Técnico de Cálculo Sísmico
                </h1>
                <p class="text-xs text-gray-500 font-semibold mt-0.5">
                    Análise Estática Equivalente (ELF) & Espectro de Resposta — ASCE 7-22 / ASCE 7-16 & ASCE 61
                </p>
            </div>
            <div class="text-right text-xs">
                <span class="px-2 py-0.5 rounded font-black bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
                    SDC ${sdc.governing}
                </span>
                <p class="text-[10px] text-gray-400 mt-1">Data: ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
        </div>

        <!-- 1. Parâmetros Sísmicos Mapeados e Efeito de Sítio -->
        <div>
            <h2 class="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
                1. Parâmetros Sísmicos de Entrada e Coeficientes de Sítio (Capítulo 11)
            </h2>
            <p class="text-xs text-gray-600 dark:text-gray-300 mb-2 leading-relaxed">
                Acelerogramas de referência para sismo com 2% de probabilidade de excedência em 50 anos ($MCE_R$), ajustados pela classe de solo <b>${data.site_class}</b> conforme Tabelas 11.4-1 e 11.4-2:
            </p>
            <div class="bg-gray-50 dark:bg-gray-750 p-3 rounded-lg text-xs font-mono space-y-1">
                <div>• Acelerações Mapeadas: $S_s = ${spectral_parameters.Ss.toFixed(2)}\\text{g}$, $S_1 = ${spectral_parameters.S1.toFixed(2)}\\text{g}$, $T_L = ${spectral_parameters.TL.toFixed(1)}\\text{s}$</div>
                <div>• Coeficientes de Solo: $F_a = ${spectral_parameters.Fa.toFixed(2)}$, $F_v = ${spectral_parameters.Fv.toFixed(2)}$</div>
                <div>• Acelerações MCE_R Amplificadas:</div>
                <div class="pl-4">$S_{MS} = F_a \\cdot S_s = ${spectral_parameters.Fa.toFixed(2)} \\times ${spectral_parameters.Ss.toFixed(2)} = ${spectral_parameters.SMS.toFixed(3)}\\text{g}$</div>
                <div class="pl-4">$S_{M1} = F_v \\cdot S_1 = ${spectral_parameters.Fv.toFixed(2)} \\times ${spectral_parameters.S1.toFixed(2)} = ${spectral_parameters.SM1.toFixed(3)}\\text{g}$</div>
                <div>• Acelerações Espectrais de Projeto ($2/3$ do MCE_R per Seção 11.4.5):</div>
                <div class="pl-4 font-bold text-blue-600 dark:text-blue-400">$S_{DS} = \\frac{2}{3} S_{MS} = \\frac{2}{3} \\times ${spectral_parameters.SMS.toFixed(3)} = ${spectral_parameters.SDS.toFixed(3)}\\text{g}$</div>
                <div class="pl-4 font-bold text-blue-600 dark:text-blue-400">$S_{D1} = \\frac{2}{3} S_{M1} = \\frac{2}{3} \\times ${spectral_parameters.SM1.toFixed(3)} = ${spectral_parameters.SD1.toFixed(3)}\\text{g}$</div>
                <div>• Períodos de Canto do Espectro:</div>
                <div class="pl-4">$T_0 = 0.2 \\frac{S_{D1}}{S_{DS}} = ${spectral_parameters.T0.toFixed(3)}\\text{s}$, $T_s = \\frac{S_{D1}}{S_{DS}} = ${spectral_parameters.Ts.toFixed(3)}\\text{s}$</div>
            </div>
        </div>

        <!-- 2. Categoria de Projeto Sísmico (SDC) -->
        <div>
            <h2 class="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
                2. Determinação da Categoria de Projeto Sísmico (SDC - Seção 11.6)
            </h2>
            <div class="bg-gray-50 dark:bg-gray-750 p-3 rounded-lg text-xs space-y-1">
                <div>• Categoria de Risco Estrutural: <b>${data.risk_category}</b> $\\rightarrow I_e = ${data.importance_factor_Ie}$</div>
                <div>• Tabela 11.6-1 (com base em $S_{DS} = ${spectral_parameters.SDS.toFixed(3)}\\text{g}$): <b>SDC ${sdc.sdc_sds}</b></div>
                <div>• Tabela 11.6-2 (com base em $S_{D1} = ${spectral_parameters.SD1.toFixed(3)}\\text{g}$): <b>SDC ${sdc.sdc_sd1}</b></div>
                ${spectral_parameters.S1 >= 0.75 ? `<div class="text-rose-600 font-bold">• Condição $S_1 \\ge 0.75\\text{g}$ ativa: SDC mínimo atribuído = ${sdc.governing}</div>` : ''}
                <div class="font-bold text-indigo-700 dark:text-indigo-300 pt-1 border-t border-gray-200 dark:border-gray-700">
                    $\\Rightarrow$ Categoria Sísmica Governante: <b>SDC ${sdc.governing}</b>
                </div>
            </div>
        </div>

        <!-- 3. Período Fundamental e Coeficiente Sísmico Cs -->
        <div>
            <h2 class="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
                3. Período Fundamental e Coeficiente Sísmico ($C_s$ - Seção 12.8.1)
            </h2>
            <div class="bg-gray-50 dark:bg-gray-750 p-3 rounded-lg text-xs font-mono space-y-1.5">
                <div>• Sistema Resistente (SFRS): <b>${sfrs.name}</b> ($R = ${sfrs.R}$, $\\Omega_0 = ${sfrs.Omega0}$, $C_d = ${sfrs.Cd}$)</div>
                <div>• Período Fundamental Estimado (Eq. 12.8-7): $T_a = C_t \\cdot h_n^x = ${periods.Ta.toFixed(3)}\\text{s}$</div>
                <div>• Limite Superior per Tabela 12.8-1: $C_u = ${periods.Cu.toFixed(2)} \\Rightarrow T_{max} = C_u \\cdot T_a = ${periods.T_max.toFixed(3)}\\text{s}$</div>
                <div>• Período Adotado no Cálculo: <b>$T = ${periods.T_operating.toFixed(3)}\\text{s}$</b> (${periods.reason})</div>
                
                <div class="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div>• Coeficiente Sísmico Básico (Eq. 12.8-2):</div>
                    <div class="pl-4">$C_{s,base} = \\frac{S_{DS}}{R / I_e} = \\frac{${spectral_parameters.SDS.toFixed(3)}}{${sfrs.R} / ${data.importance_factor_Ie}} = ${seismic_coefficient_cs.Cs_base.toFixed(4)}$</div>
                    <div>• Limite Superior (Eq. 12.8-3 / 12.8-4):</div>
                    <div class="pl-4">$C_{s,max} = \\frac{S_{D1}}{T \\cdot (R / I_e)} = \\frac{${spectral_parameters.SD1.toFixed(3)}}{${periods.T_operating.toFixed(3)} \\times (${sfrs.R} / ${data.importance_factor_Ie})} = ${seismic_coefficient_cs.Cs_max.toFixed(4)}$</div>
                    <div>• Limite Inferior Mínimo (Eq. 12.8-5 & 12.8-6):</div>
                    <div class="pl-4">$C_{s,min} = \\max(0.044 S_{DS} I_e, 0.01) = ${seismic_coefficient_cs.Cs_min.toFixed(4)}$</div>
                    <div class="pl-4 font-bold text-indigo-700 dark:text-indigo-400">$\\Rightarrow C_{s,governante} = \\mathbf{${seismic_coefficient_cs.Cs_governing.toFixed(4)}}$</div>
                </div>
            </div>
        </div>

        <!-- 4. Força Cortante Basal e Momento de Tombamento -->
        <div>
            <h2 class="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
                4. Força Cortante Basal e Efeitos Sísmicos Globais (Seção 12.8)
            </h2>
            <div class="bg-gray-50 dark:bg-gray-750 p-3 rounded-lg text-xs font-mono space-y-1.5">
                <div>• Peso Sísmico Efetivo Total: $W = ${base_shear.W_total.toLocaleString()} \\text{ ${f_unit}}$</div>
                <div class="font-bold text-sm text-blue-600 dark:text-blue-400">
                    • Cortante Basal de Projeto (Eq. 12.8-1):
                    <div class="pl-4">$V = C_s \\cdot W = ${seismic_coefficient_cs.Cs_governing.toFixed(4)} \\times ${base_shear.W_total.toLocaleString()} = \\mathbf{${base_shear.V.toLocaleString()} \\text{ ${f_unit}}}$ (${base_shear.V_tf.toLocaleString()} tf)</div>
                </div>
                <div class="text-rose-600 dark:text-rose-400">
                    • Cortante com Sobrerresistência para Fundações/Conexões (Seção 12.4.3):
                    <div class="pl-4">$V_{over} = \\Omega_0 \\cdot V = ${sfrs.Omega0} \\times ${base_shear.V.toLocaleString()} = \\mathbf{${base_shear.V_overstrength.toLocaleString()} \\text{ ${f_unit}}}$</div>
                </div>
                <div>• Momento de Tombamento na Base: $M_{ot} = \\sum (F_x \\cdot h_x) = \\mathbf{${base_shear.Mot.toLocaleString()}\\text{ ${f_unit}}\\cdot\\text{${l_unit}}}$</div>
            </div>
        </div>

        <!-- 5. Módulo de Cais Portuário e Massa Hidrodinâmica Adicionada -->
        ${wharf_module.is_applicable ? `
            <div>
                <h2 class="text-sm font-extrabold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
                    5. Estrutura Portuária & Massa Hidrodinâmica Adicionada (ASCE 61 Seção 3.4.2)
                </h2>
                <div class="bg-gray-50 dark:bg-gray-750 p-3 rounded-lg text-xs font-mono space-y-1.5">
                    <div>• Peso da Mesa / Superestrutura: $W_{deck} = ${wharf_module.deck_weight.toLocaleString()} \\text{ ${f_unit}}$</div>
                    <div>• Número de Estacas: $n = ${wharf_module.num_piles}$ unidades de diâmetro $D = ${wharf_module.pile_diameter}\\text{m}$</div>
                    <div>• Trecho Submerso da Estaca: $L_{sub} = ${wharf_module.pile_submerged_len}\\text{m}$</div>
                    <div>• Massa Hidrodinâmica Adicionada (Arrasto Inercial da Coluna D'água):</div>
                    <div class="pl-4">$W_{hydro} = n \\cdot C_m \\cdot \\gamma_w \\cdot \\frac{\\pi D^2}{4} \\cdot L_{sub} = \\mathbf{${wharf_module.hydrodynamic_added_weight.toLocaleString()} \\text{ ${f_unit}}}$</div>
                    <div>• Peso Sísmico Virtual Efetivo do Cais: $W_{eff} = W_{deck} + 0.5 W_{piles} + W_{hydro} = ${wharf_module.total_effective_seismic_weight.toLocaleString()} \\text{ ${f_unit}}$</div>
                    <div class="font-bold text-indigo-700 dark:text-indigo-400">
                        • Cortante Médio por Estaca: $V_{pile} = \\frac{V_{wharf}}{n} = \\frac{${wharf_module.V_wharf.toLocaleString()}}{${wharf_module.num_piles}} = \\mathbf{${wharf_module.V_per_pile_avg.toLocaleString()} \\text{ ${f_unit}}}$ (${wharf_module.V_per_pile_avg_tf} tf)
                    </div>
                </div>
            </div>
        ` : ''}

        <!-- 6. Assinatura do Relatório -->
        <div class="pt-6 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 flex justify-between items-center">
            <span>Engenharia Estrutural & Portuária • Relatório Gerado Automaticamente</span>
            <span class="font-mono text-[10px]">ASCE 7-22 / ASCE 61 CALC ENGINE v2.0</span>
        </div>
    </div>
    `;

    body.innerHTML = contentHtml;
    modal.classList.remove('hidden');

    // Wire Modal Buttons
    const closeBtn = document.getElementById('modal-close-btn');
    const footerCloseBtn = document.getElementById('modal-footer-close-btn');
    const pdfBtn = document.getElementById('modal-download-pdf-btn');
    const wordBtn = document.getElementById('modal-download-word-btn');
    const copyBtn = document.getElementById('modal-copy-btn');

    const closeModal = () => modal.classList.add('hidden');
    if (closeBtn) closeBtn.onclick = closeModal;
    if (footerCloseBtn) footerCloseBtn.onclick = closeModal;

    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);

    if (pdfBtn) {
        pdfBtn.onclick = () => {
            const el = document.getElementById('seismic-modal-report-content');
            if (!el) return;
            const opt = {
                margin: 10,
                filename: `Memorial_Sismico_ASCE7_${sdc.governing}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };
            if (typeof html2pdf !== 'undefined') {
                html2pdf().set(opt).from(el).save();
            } else {
                window.print();
            }
        };
    }

    if (wordBtn) {
        wordBtn.onclick = () => {
            if (typeof handleDownloadWord === 'function') {
                handleDownloadWord('seismic-modal-report-content', `Memorial_Sismico_ASCE7_${sdc.governing}.doc`);
            } else {
                const el = document.getElementById('seismic-modal-report-content');
                if (!el) return;
                const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Relatório Sísmico</title></head><body>";
                const footer = "</body></html>";
                const sourceHTML = header + el.innerHTML + footer;
                const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(sourceHTML);
                const a = document.createElement("a");
                document.body.appendChild(a);
                a.href = source;
                a.download = `Memorial_Sismico_ASCE7_${sdc.governing}.doc`;
                a.click();
                document.body.removeChild(a);
            }
        };
    }

    if (copyBtn) {
        copyBtn.onclick = () => {
            if (typeof handleCopy === 'function') {
                handleCopy('seismic-modal-report-content');
            } else {
                const el = document.getElementById('seismic-modal-report-content');
                if (el) {
                    navigator.clipboard.writeText(el.innerText).then(() => {
                        const originalText = copyBtn.innerHTML;
                        copyBtn.innerHTML = '<span>✅</span> Copiado!';
                        setTimeout(() => { copyBtn.innerHTML = originalText; }, 2000);
                    });
                }
            }
        };
    }
}
window.openSeismicReportModal = openSeismicReportModal;

// Initialize Page with shared utils
initializeApp({
    inputIds: seismicInputIds,
    buttonId: 'run-seismic-calculation-btn',
    calculationHandler: handleRunSeismicCheck,
    onReady: () => {
        const unitSelect = document.getElementById('seismic_unit_system');
        const updateUnitBadges = (unit) => {
            const is_m = (unit === 'metric');
            document.querySelectorAll('.seismic-l-unit').forEach(el => el.textContent = is_m ? '[m]' : '[ft]');
            document.querySelectorAll('.seismic-f-unit').forEach(el => el.textContent = is_m ? '[kN]' : '[kips]');
            
            const bannerIcon = document.getElementById('unit-system-banner-icon');
            const bannerTitle = document.getElementById('unit-system-banner-title');
            const bannerDesc = document.getElementById('unit-system-banner-desc');
            if (bannerIcon && bannerTitle && bannerDesc) {
                if (is_m) {
                    bannerIcon.textContent = '🌍';
                    bannerTitle.textContent = 'Sistema de Unidades Ativo: Métrico';
                    bannerDesc.innerHTML = 'Dimensões em <b>metros [m]</b>, forças sísmicas e peso em <b>quilonewtons [kN]</b> e <b>toneladas-força [tf]</b>, períodos em <b>segundos [s]</b>.';
                } else {
                    bannerIcon.textContent = '🇺🇸';
                    bannerTitle.textContent = 'Sistema de Unidades Ativo: Imperial';
                    bannerDesc.innerHTML = 'Dimensões em <b>pés [ft]</b>, forças sísmicas e peso em <b>kips [1000 lb]</b>, períodos em <b>segundos [s]</b>.';
                }
            }
        };

        if (unitSelect) {
            let currentUnit = unitSelect.value || 'metric';
            updateUnitBadges(currentUnit);

            unitSelect.addEventListener('change', (e) => {
                const newUnit = e.target.value;
                if (newUnit === currentUnit) return;

                const lFactor = (newUnit === 'imperial') ? (1.0 / 0.3048) : 0.3048;
                const fFactor = (newUnit === 'imperial') ? 0.2248089 : (1.0 / 0.2248089);

                // Convert dimensions and weights
                const lFields = ['seismic_height_hn', 'seismic_wharf_pile_diam', 'seismic_wharf_pile_sub_len', 'seismic_wharf_pile_total_len'];
                lFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.value !== '') {
                        const val = parseFloat(el.value);
                        if (!isNaN(val) && val > 0) el.value = (val * lFactor).toFixed(2);
                    }
                });

                const fFields = ['seismic_weight_w', 'seismic_wharf_deck_w', 'seismic_equip_wp'];
                fFields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.value !== '') {
                        const val = parseFloat(el.value);
                        if (!isNaN(val) && val > 0) el.value = (val * fFactor).toFixed(0);
                    }
                });

                currentUnit = newUnit;
                updateUnitBadges(newUnit);
                updateApproximatePeriod();
                document.getElementById('run-seismic-calculation-btn')?.click();
            });
        }

        // Initialize state
        handleSpectralInputsChange();
        handleSfrsPresetChange();
        updateApproximatePeriod();
        
        // Auto trigger initial calculation
        setTimeout(() => {
            document.getElementById('run-seismic-calculation-btn')?.click();
        }, 100);
    }
});
