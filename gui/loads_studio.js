/**
 * Central de Cargas & Ações Estruturais - loads_studio.js
 * Suporte a NBR 6123, NBR 15421, NBR 6120, NBR 8681 e ASCE 7-16 / 7-22
 */

// Estado Global
let currentTab = 'wind';
let currentStandard = 'nbr'; // 'nbr' ou 'asce'
let nbrWindChartInstance = null;
let nbrSeismicChartInstance = null;

// Cargas calculadas mantidas em memória para transferência entre abas
const calculatedStore = {
    wind: { base_shear: 0, overturning_moment: 0, q_top: 0, p_pos: 0, p_neg: 0 },
    seismic: { base_shear: 0, overturning_moment: 0, cs: 0, ta: 0 },
    rain: { nominal_pressure: 0, total_head: 0 },
    roof_live: { total_load: 0.25 }
};

// Casos de Carga da Aba de Combinações
let loadCases = [
    { id: 'PP', name: 'Peso Próprio (G1)', type: 'permanent', value: 120.0, gamma_fav: 1.0, gamma_unfav: 1.4, psi0: 1.0, psi1: 1.0, psi2: 1.0, xorGroup: '' },
    { id: 'PERM', name: 'Carga Permanente Adicional (G2)', type: 'permanent', value: 50.0, gamma_fav: 1.0, gamma_unfav: 1.4, psi0: 1.0, psi1: 1.0, psi2: 1.0, xorGroup: '' },
    { id: 'Q_USO', name: 'Sobrecarga de Utilização (Q1)', type: 'variable', value: 60.0, gamma_fav: 0.0, gamma_unfav: 1.4, psi0: 0.70, psi1: 0.60, psi2: 0.40, xorGroup: '' },
    { id: 'VENTO_POS', name: 'Vento Pressão (V+)', type: 'variable', value: 35.0, gamma_fav: 0.0, gamma_unfav: 1.4, psi0: 0.60, psi1: 0.30, psi2: 0.00, xorGroup: 'WIND' },
    { id: 'VENTO_NEG', name: 'Vento Sucção (V-)', type: 'variable', value: -25.0, gamma_fav: 0.0, gamma_unfav: 1.4, psi0: 0.60, psi1: 0.30, psi2: 0.00, xorGroup: 'WIND' },
];

let generatedCombinations = [];

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Injeção de Header e Footer
    if (typeof injectHeader === 'function') {
        injectHeader({
            activePage: 'analysis_loads',
            pageTitle: 'loads_studio',
            headerPlaceholderId: 'header-placeholder',
            pathPrefix: '../'
        });
    }
    if (typeof injectFooter === 'function') {
        injectFooter({
            footerPlaceholderId: 'footer-placeholder',
            pathPrefix: '../'
        });
    }

    // Leitura de parâmetros de URL (ex: ?tab=seismic&norm=nbr)
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const normParam = urlParams.get('norm');

    if (normParam && (normParam === 'nbr' || normParam === 'asce')) {
        setStandard(normParam);
    }
    if (tabParam && ['wind', 'seismic', 'rain', 'snow', 'tsunami', 'combos'].includes(tabParam)) {
        switchStudioTab(tabParam);
    }

    // Inicializa tabela de combinações
    renderLoadCasesTable();

    // Executa cálculos padrão NBR iniciais
    setTimeout(() => {
        calculateNbrWind();
        calculateNbrSeismic();
        calculateNbrRain();
        calculateNbrRoofLive();
        runUniversalCombinations();
    }, 400);
});

// ==============================================================================
// GESTÃO DE NAVEGAÇÃO E NORMAS
// ==============================================================================

function switchStudioTab(tab) {
    currentTab = tab;

    // Atualiza botões
    const tabs = ['wind', 'seismic', 'rain', 'snow', 'tsunami', 'combos'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const panel = document.getElementById(`panel-${t}`);
        if (btn) {
            if (t === tab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
        if (panel) {
            panel.style.display = (t === tab) ? 'block' : 'none';
        }
    });

    // Atualiza label do botão de cálculo
    const btnLabel = document.getElementById('btn-calc-label');
    if (btnLabel) {
        const labels = {
            wind: 'Calcular Vento',
            seismic: 'Calcular Sismo',
            rain: 'Calcular Chuva',
            snow: 'Calcular Cobertura',
            tsunami: 'Calcular Tsunami',
            combos: 'Gerar Combinações'
        };
        btnLabel.textContent = labels[tab] || 'Calcular';
    }

    // Se a aba tiver gráfico e estiver visível, redimensiona
    if (tab === 'wind' && nbrWindChartInstance) {
        nbrWindChartInstance.resize();
    }
    if (tab === 'seismic' && nbrSeismicChartInstance) {
        nbrSeismicChartInstance.resize();
    }
}

function setStandard(standard) {
    currentStandard = standard;

    const btnNbr = document.getElementById('btn-standard-nbr');
    const btnAsce = document.getElementById('btn-standard-asce');
    const activeBadge = document.getElementById('active-standard-badge');

    if (standard === 'nbr') {
        if (btnNbr) {
            btnNbr.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-emerald-600 text-white shadow-xs';
        }
        if (btnAsce) {
            btnAsce.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900';
        }
        if (activeBadge) {
            activeBadge.className = 'badge-norm bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800';
            activeBadge.textContent = '🇧🇷 ABNT NBR (NBR 6123 • NBR 15421 • NBR 6120 • NBR 8681)';
        }

        // Vento
        document.getElementById('wind-nbr-container').style.display = 'block';
        document.getElementById('wind-asce-container').style.display = 'none';
        document.getElementById('badge-wind-norm').textContent = 'NBR 6123';
        document.getElementById('badge-wind-norm').className = 'text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';

        // Sismo
        document.getElementById('seismic-nbr-container').style.display = 'block';
        document.getElementById('seismic-asce-container').style.display = 'none';
        document.getElementById('badge-seismic-norm').textContent = 'NBR 15421';
        document.getElementById('badge-seismic-norm').className = 'text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';

        // Chuva
        document.getElementById('rain-nbr-container').style.display = 'block';
        document.getElementById('rain-asce-container').style.display = 'none';
        document.getElementById('badge-rain-norm').textContent = 'NBR 6120';
        document.getElementById('badge-rain-norm').className = 'text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';

        // Neve
        const snowSel = document.getElementById('snow_norm_selector');
        if (snowSel) snowSel.value = 'nbr';
        onSnowNormSelectorChange();

    } else {
        // ASCE
        if (btnAsce) {
            btnAsce.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 bg-blue-600 text-white shadow-xs';
        }
        if (btnNbr) {
            btnNbr.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900';
        }
        if (activeBadge) {
            activeBadge.className = 'badge-norm bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800';
            activeBadge.textContent = '🇺🇸 ASCE 7 (ASCE 7-16 • ASCE 7-22 • ASCE 61 • IBC)';
        }

        // Vento
        document.getElementById('wind-nbr-container').style.display = 'none';
        document.getElementById('wind-asce-container').style.display = 'block';
        document.getElementById('badge-wind-norm').textContent = 'ASCE 7';
        document.getElementById('badge-wind-norm').className = 'text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';

        // Sismo
        document.getElementById('seismic-nbr-container').style.display = 'none';
        document.getElementById('seismic-asce-container').style.display = 'block';
        document.getElementById('badge-seismic-norm').textContent = 'ASCE 7-22';
        document.getElementById('badge-seismic-norm').className = 'text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';

        // Chuva
        document.getElementById('rain-nbr-container').style.display = 'none';
        document.getElementById('rain-asce-container').style.display = 'block';
        document.getElementById('badge-rain-norm').textContent = 'ASCE 7 Ch.8';
        document.getElementById('badge-rain-norm').className = 'text-[10px] px-1.5 py-0.5 rounded font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';

        // Neve
        const snowSel = document.getElementById('snow_norm_selector');
        if (snowSel) snowSel.value = 'asce';
        onSnowNormSelectorChange();
    }
}

function calculateCurrentTab() {
    if (currentTab === 'wind') {
        if (currentStandard === 'nbr') calculateNbrWind();
    } else if (currentTab === 'seismic') {
        if (currentStandard === 'nbr') calculateNbrSeismic();
    } else if (currentTab === 'rain') {
        if (currentStandard === 'nbr') calculateNbrRain();
    } else if (currentTab === 'snow') {
        calculateNbrRoofLive();
    } else if (currentTab === 'combos') {
        runUniversalCombinations();
    }
}

// ==============================================================================
// MÓDULO 1: VENTO NBR 6123:1988
// ==============================================================================

const NBR_WIND_CITIES = {
    'São Paulo (SP)': 40,
    'Campinas / Interior (SP)': 42,
    'Santos / Litoral (SP)': 42,
    'Rio de Janeiro (RJ)': 35,
    'Belo Horizonte (MG)': 35,
    'Vitória (ES)': 35,
    'Curitiba (PR)': 42,
    'Foz do Iguaçu (PR)': 45,
    'Florianópolis (SC)': 42,
    'Porto Alegre (RS)': 45,
    'Caxias do Sul / Serra Gaúcha (RS)': 48,
    'Brasília (DF)': 35,
    'Goiânia (GO)': 35,
    'Campo Grande (MS)': 40,
    'Cuiabá (MT)': 35,
    'Salvador (BA)': 30,
    'Recife (PE)': 30,
    'Fortaleza (CE)': 30,
    'Belém (PA)': 30,
    'Manaus (AM)': 30
};

function onNbrWindCityChange() {
    const city = document.getElementById('nbr_wind_city').value;
    if (NBR_WIND_CITIES[city]) {
        document.getElementById('nbr_wind_v0').value = NBR_WIND_CITIES[city];
    }
}

function toggleNbrTopoInputs() {
    const topo = document.getElementById('nbr_wind_topo').value;
    const slopeGroup = document.getElementById('nbr_wind_slope_group');
    if (slopeGroup) {
        slopeGroup.style.display = (topo === 'flat') ? 'none' : 'block';
    }
}

async function calculateNbrWind() {
    const payload = {
        v0: parseFloat(document.getElementById('nbr_wind_v0').value) || 40.0,
        topography: document.getElementById('nbr_wind_topo').value,
        slope_deg: parseFloat(document.getElementById('nbr_wind_slope')?.value || 0),
        category: document.getElementById('nbr_wind_category').value,
        building_class: document.getElementById('nbr_wind_class').value,
        s3_group: document.getElementById('nbr_wind_s3').value,
        height: parseFloat(document.getElementById('nbr_wind_height').value) || 30.0,
        width: parseFloat(document.getElementById('nbr_wind_width').value) || 20.0,
        depth: parseFloat(document.getElementById('nbr_wind_depth').value) || 30.0,
        floors: parseInt(document.getElementById('nbr_wind_floors').value) || 1,
        cpi: parseFloat(document.getElementById('nbr_wind_cpi').value) || -0.30,
        // Parâmetros do Pórtico 2D / Treliça para o STRAP
        frame_span: parseFloat(document.getElementById('nbr_frame_span')?.value) || 18.0,
        frame_eaves_h: parseFloat(document.getElementById('nbr_frame_eaves_h')?.value) || 15.0,
        frame_truss_h_eaves: parseFloat(document.getElementById('nbr_frame_truss_eaves')?.value) || 1.0,
        frame_truss_h_ridge: parseFloat(document.getElementById('nbr_frame_truss_ridge')?.value) || 2.0,
        frame_spacing: parseFloat(document.getElementById('nbr_frame_spacing')?.value) || 6.0,
        purlin_spacing: parseFloat(document.getElementById('nbr_frame_purlin_d')?.value) || 1.5,
        dead_roof_kpa: parseFloat(document.getElementById('nbr_frame_dead_roof')?.value) || 0.20,
        live_roof_kpa: parseFloat(document.getElementById('nbr_frame_live_roof')?.value) || 0.25,
        equip_roof_kpa: parseFloat(document.getElementById('nbr_frame_equip_roof')?.value) || 0.15
    };

    let result = null;
    if (typeof eel !== 'undefined' && typeof eel.calculate_nbr_wind === 'function') {
        try {
            result = await eel.calculate_nbr_wind(payload)();
        } catch (e) {
            console.warn('Erro ao chamar backend Python para vento NBR:', e);
        }
    }

    if (!result || result.status !== 'success') {
        result = clientCalcWindNbr(payload);
    }

    renderNbrWindResults(result);
}

function clientCalcWindNbr(p) {
    // Fallback Client-side puro da NBR 6123
    const s1 = (p.topography === 'flat' || p.slope_deg <= 3) ? 1.0 : (1.0 + Math.tan(p.slope_deg * Math.PI / 180));
    const s3Table = { '1': 1.10, '2': 1.00, '3': 0.95, '4': 0.88, '5': 0.83 };
    const s3 = s3Table[p.s3_group] || 1.00;

    const bTable = { 'I': 1.10, 'II': 1.00, 'III': 0.94, 'IV': 0.86, 'V': 0.74 };
    const pExpTable = { 'I': 0.06, 'II': 0.09, 'III': 0.12, 'IV': 0.15, 'V': 0.23 };
    const frTable = { 'A': 1.00, 'B': 0.98, 'C': 0.93 };

    const b = bTable[p.category] || 0.86;
    const pExp = pExpTable[p.category] || 0.15;
    const fr = frTable[p.building_class] || 0.98;

    const s2_top = b * fr * Math.pow(Math.max(10, p.height) / 10, pExp);
    const vk_top = p.v0 * s1 * s2_top * s3;
    const q_top_pa = 0.613 * vk_top * vk_top;
    const q_top_kpa = q_top_pa / 1000.0;

    const ca = 1.20;
    const floorH = p.height / p.floors;
    let totalShear = 0;
    let totalMoment = 0;
    const levels = [];
    const profile = [];

    for (let fl = 1; fl <= p.floors; fl++) {
        const z = fl * floorH;
        const z_mid = z - floorH / 2;
        const s2_mid = b * fr * Math.pow(Math.max(5, z_mid) / 10, pExp);
        const vk_mid = p.v0 * s1 * s2_mid * s3;
        const q_mid_kpa = (0.613 * vk_mid * vk_mid) / 1000.0;
        const area = p.width * floorH;
        const force = ca * q_mid_kpa * area;
        const mom = force * z_mid;

        totalShear += force;
        totalMoment += mom;

        levels.push({
            floor: fl,
            z: z.toFixed(2),
            z_mid: z_mid.toFixed(2),
            s2: s2_mid.toFixed(3),
            vk: vk_mid.toFixed(2),
            q_kpa: q_mid_kpa.toFixed(3),
            trib_area: area.toFixed(2),
            force_kn: force.toFixed(2),
            moment_knm: mom.toFixed(2)
        });
    }

    for (let i = 1; i <= 10; i++) {
        const z = (i * p.height / 10);
        const s2_z = b * fr * Math.pow(Math.max(5, z) / 10, pExp);
        const vk_z = p.v0 * s1 * s2_z * s3;
        const q_kpa = (0.613 * vk_z * vk_z) / 1000.0;
        profile.push({ z: z.toFixed(1), vk: vk_z.toFixed(1), q_kpa: q_kpa.toFixed(3) });
    }

    const strapFrame = clientCalcPortalFrameStrap(p, q_top_kpa);

    return {
        status: 'success',
        parameters: {
            v0: p.v0, s1: s1.toFixed(3), s2_top: s2_top.toFixed(3), s3: s3.toFixed(3),
            vk_top: vk_top.toFixed(2), q_top_kpa: q_top_kpa.toFixed(3), ca: ca, cpi: p.cpi
        },
        summary: {
            base_shear_kn: totalShear.toFixed(2),
            base_overturning_moment_knm: totalMoment.toFixed(2)
        },
        pressures: {
            windward: { cpe: 0.70, p_kpa: ((0.70 - p.cpi) * q_top_kpa).toFixed(3) },
            leeward: { cpe: -0.40, p_kpa: ((-0.40 - p.cpi) * q_top_kpa).toFixed(3) },
            sides: { cpe: -0.60, p_kpa: ((-0.60 - p.cpi) * q_top_kpa).toFixed(3) }
        },
        profile: profile,
        levels: levels,
        portal_frame_strap: strapFrame
    };
}

function clientCalcPortalFrameStrap(p, q_top_kpa) {
    const span = p.frame_span || 18.0;
    const eaves_h = p.frame_eaves_h || 15.0;
    const truss_h_eaves = p.frame_truss_h_eaves || 1.0;
    const truss_h_ridge = p.frame_truss_h_ridge || 2.0;
    const spacing = p.frame_spacing || 6.0;
    const purlin = p.purlin_spacing || 1.5;
    const dead_kpa = p.dead_roof_kpa || 0.20;
    const live_kpa = p.live_roof_kpa || 0.25;
    const equip_kpa = p.equip_roof_kpa || 0.15;
    const q = q_top_kpa || 0.536;

    const delta_h = Math.max(0, truss_h_ridge - truss_h_eaves);
    const half_span = span / 2.0;
    const slope_tan = half_span > 0 ? (delta_h / half_span) : 0;
    const slope_deg = Math.atan(slope_tan) * (180 / Math.PI);
    const slope_pct = slope_tan * 100;
    const rafter_len = Math.sqrt(half_span * half_span + delta_h * delta_h);

    const cpe_wall_windward = 0.70;
    const cpe_wall_leeward = -0.50;
    const cpe_roof_windward = slope_deg <= 10.0 ? -0.80 : -0.70;
    const cpe_roof_leeward = slope_deg <= 10.0 ? -0.50 : -0.40;

    const cpi_suction = -0.30;
    const cpi_overpressure = 0.20;

    const w_d2 = +(dead_kpa * spacing).toFixed(2);
    const p_d2 = +(w_d2 * purlin).toFixed(2);
    const w_l3 = +(live_kpa * spacing).toFixed(2);
    const p_l3 = +(w_l3 * purlin).toFixed(2);
    const w_l4 = +(equip_kpa * spacing).toFixed(2);
    const p_l4 = +(w_l4 * purlin).toFixed(2);

    // 5:W1 (Cpi = -0.30)
    const cp_w5_p_w = +(cpe_wall_windward - cpi_suction).toFixed(2); // +1.00
    const w_w5_p_w = +(cp_w5_p_w * q * spacing).toFixed(2);
    const p_w5_p_w = +(cp_w5_p_w * q).toFixed(3);

    const cp_w5_p_l = +(cpe_wall_leeward - cpi_suction).toFixed(2); // -0.20
    const w_w5_p_l = +(cp_w5_p_l * q * spacing).toFixed(2);
    const p_w5_p_l = +(cp_w5_p_l * q).toFixed(3);

    const cp_w5_r_w = +(cpe_roof_windward - cpi_suction).toFixed(2); // -0.50
    const w_w5_r_w = +(cp_w5_r_w * q * spacing).toFixed(2);
    const p_w5_r_w = +(cp_w5_r_w * q).toFixed(3);
    const nod_w5_r_w = +(w_w5_r_w * purlin).toFixed(2);

    const cp_w5_r_l = +(cpe_roof_leeward - cpi_suction).toFixed(2); // -0.20
    const w_w5_r_l = +(cp_w5_r_l * q * spacing).toFixed(2);
    const p_w5_r_l = +(cp_w5_r_l * q).toFixed(3);
    const nod_w5_r_l = +(w_w5_r_l * purlin).toFixed(2);

    // 6:W2 (Cpi = +0.20 - ARRANCAMENTO)
    const cp_w6_p_w = +(cpe_wall_windward - cpi_overpressure).toFixed(2); // +0.50
    const w_w6_p_w = +(cp_w6_p_w * q * spacing).toFixed(2);
    const p_w6_p_w = +(cp_w6_p_w * q).toFixed(3);

    const cp_w6_p_l = +(cpe_wall_leeward - cpi_overpressure).toFixed(2); // -0.70
    const w_w6_p_l = +(cp_w6_p_l * q * spacing).toFixed(2);
    const p_w6_p_l = +(cp_w6_p_l * q).toFixed(3);

    const cp_w6_r_w = +(cpe_roof_windward - cpi_overpressure).toFixed(2); // -1.00
    const w_w6_r_w = +(cp_w6_r_w * q * spacing).toFixed(2);
    const p_w6_r_w = +(cp_w6_r_w * q).toFixed(3);
    const nod_w6_r_w = +(w_w6_r_w * purlin).toFixed(2);

    const cp_w6_r_l = +(cpe_roof_leeward - cpi_overpressure).toFixed(2); // -0.70
    const w_w6_r_l = +(cp_w6_r_l * q * spacing).toFixed(2);
    const p_w6_r_l = +(cp_w6_r_l * q).toFixed(3);
    const nod_w6_r_l = +(w_w6_r_l * purlin).toFixed(2);

    // 7:W3 (Sentido Oposto)
    const w_w7_p_w = -w_w6_p_w;
    const w_w7_p_l = -w_w6_p_l;

    return {
        geometry: {
            span: span, eaves_h: eaves_h, truss_h_eaves: truss_h_eaves, truss_h_ridge: truss_h_ridge,
            delta_h: +delta_h.toFixed(2), slope_deg: +slope_deg.toFixed(2), slope_pct: +slope_pct.toFixed(1),
            rafter_len: +rafter_len.toFixed(2), frame_spacing: spacing, purlin_spacing: purlin
        },
        coefficients: {
            cpe_wall_windward, cpe_wall_leeward, cpe_roof_windward, cpe_roof_leeward,
            cpi_suction, cpi_overpressure
        },
        loads: {
            w_d2, p_d2, w_l3, p_l3, w_l4, p_l4,
            wind_suction_cpi_neg: {
                w_pilar_windward: w_w5_p_w, w_pilar_leeward: w_w5_p_l,
                w_roof_windward: w_w5_r_w, w_roof_leeward: w_w5_r_l,
                p_roof_windward: nod_w5_r_w, p_roof_leeward: nod_w5_r_l
            },
            wind_overpressure_cpi_pos: {
                w_pilar_windward: w_w6_p_w, w_pilar_leeward: w_w6_p_l,
                w_roof_windward: w_w6_r_w, w_roof_leeward: w_w6_r_l,
                p_roof_windward: nod_w6_r_w, p_roof_leeward: nod_w6_r_l
            }
        },
        load_cases: [
            {
                id: '1:pp', name: '1:pp - Peso Próprio Estrutura',
                type_strap: 'Self-weight (Automático)', where: 'Todas as barras (pilares e treliça)',
                direction: 'Global Z (-1.0)', pressure_kpa: 'Calculado p/ STRAP',
                linear_load_knm: 'Auto (aço 78.5 kN/m³)', nodal_load_kn: 'Auto',
                notes: 'Ativar no STRAP em Edit > Loads > Self-weight com fator -1.0 em Z.'
            },
            {
                id: '2:Peso telhas', name: '2:Peso telhas - Telhas, Terças e Acessórios',
                type_strap: 'Beam Load / Joint Load', where: 'Banzo Superior (Água Esq e Água Dir)',
                direction: 'Global Z (para baixo)', pressure_kpa: dead_kpa.toFixed(2),
                linear_load_knm: `-${w_d2.toFixed(2)}`, nodal_load_kn: `-${p_d2.toFixed(2)}`,
                notes: 'Carga permanente de cobertura.'
            },
            {
                id: '3:SC Telhado', name: '3:SC Telhado - Sobrecarga Cobertura (NBR 6120)',
                type_strap: 'Beam Load / Joint Load', where: 'Banzo Superior (projeção horizontal)',
                direction: 'Global Z (para baixo)', pressure_kpa: live_kpa.toFixed(2),
                linear_load_knm: `-${w_l3.toFixed(2)}`, nodal_load_kn: `-${p_l3.toFixed(2)}`,
                notes: 'Sobrecarga de manutenção sem acesso ao público.'
            },
            {
                id: '4:SC EQUIPA...', name: '4:SC EQUIPA... - Utilidades e Cargas Suspensas',
                type_strap: 'Beam Load / Joint Load', where: 'Banzo Superior / Nós das Terças',
                direction: 'Global Z (para baixo)', pressure_kpa: equip_kpa.toFixed(2),
                linear_load_knm: `-${w_l4.toFixed(2)}`, nodal_load_kn: `-${p_l4.toFixed(2)}`,
                notes: 'Instalações mecânicas, iluminação, dutos e utilidades.'
            },
            {
                id: '5:W1', name: '5:W1 - Vento 90° Sucção Interna (Cpi = -0.30)',
                type_strap: 'Beam Load / Joint Load', where: 'Pilares e Banzo Superior',
                direction: 'Horiz. em X e Normal às barras',
                pressure_kpa: `Pilar W: +${p_w5_p_w.toFixed(2)} | Pilar L: ${p_w5_p_l.toFixed(2)} | Teto W: ${p_w5_r_w.toFixed(2)} | Teto L: ${p_w5_r_l.toFixed(2)}`,
                linear_load_knm: `Pilar W: +${w_w5_p_w.toFixed(2)} | Pilar L: ${w_w5_p_l.toFixed(2)} | Teto W: ${w_w5_r_w.toFixed(2)} | Teto L: ${w_w5_r_l.toFixed(2)}`,
                nodal_roof_kn: `Teto W: ${nod_w5_r_w.toFixed(2)} | Teto L: ${nod_w5_r_l.toFixed(2)}`,
                notes: 'Crítico para momento fletor máximo na base do pilar a barlavento.'
            },
            {
                id: '6:W2', name: '6:W2 - Vento 90° Sobrepressão (Cpi = +0.20) [ARRANCAMENTO]',
                type_strap: 'Beam Load / Joint Load', where: 'Pilares e Banzo Superior',
                direction: 'Horiz. em X e Normal às barras',
                pressure_kpa: `Pilar W: +${p_w6_p_w.toFixed(2)} | Pilar L: ${p_w6_p_l.toFixed(2)} | Teto W: ${p_w6_r_w.toFixed(2)} | Teto L: ${p_w6_r_l.toFixed(2)}`,
                linear_load_knm: `Pilar W: +${w_w6_p_w.toFixed(2)} | Pilar L: ${w_w6_p_l.toFixed(2)} | Teto W: ${w_w6_r_w.toFixed(2)} | Teto L: ${w_w6_r_l.toFixed(2)}`,
                nodal_roof_kn: `Teto W: ${nod_w6_r_w.toFixed(2)} | Teto L: ${nod_w6_r_l.toFixed(2)}`,
                notes: 'CRÍTICO: Maior sucção na cobertura. Arrancamento de sapatas e compressão no banzo inferior.'
            },
            {
                id: '7:W3', name: '7:W3 - Vento -90° (Sentido Oposto Direita->Esquerda)',
                type_strap: 'Beam Load / Joint Load', where: 'Pilares e Banzo Superior (Invertido)',
                direction: 'Horiz. em X (-) e Normal às barras',
                pressure_kpa: `Pilar Dir: -${p_w6_p_w.toFixed(2)} | Pilar Esq: -${p_w6_p_l.toFixed(2)}`,
                linear_load_knm: `Pilar Dir: ${w_w7_p_w.toFixed(2)} | Pilar Esq: ${w_w7_p_l.toFixed(2)}`,
                nodal_roof_kn: `Teto Dir: ${nod_w6_r_w.toFixed(2)} | Teto Esq: ${nod_w6_r_l.toFixed(2)}`,
                notes: 'Simetria inversa para dimensionamento de ambos os pilares e chumbadores.'
            }
        ],
        combinations: [
            { no: 1, title: '1*1.25+2*1.25+3*1.50+4*1.50+5*0.84', c1: 1.25, c2: 1.25, c3: 1.5, c4: 1.5, c5: 0.84, c6: null, c7: null, type: 'ELU - Gravitacional com W1', goal: 'Compressão máxima em pilares e banzos com W1 secundário (1.4 * 0.60 = 0.84).' },
            { no: 2, title: '1*1.00+2*1.00+5*1.40', c1: 1.0, c2: 1.0, c3: null, c4: null, c5: 1.4, c6: null, c7: null, type: 'ELU - Arrancamento com W1', goal: 'Tração em chumbadores e sapatas com W1 (peso favorável 1.0, sem sobrecargas).' },
            { no: 3, title: '1*1.25+2*1.25+3*1.50+4*1.50+6*0.84', c1: 1.25, c2: 1.25, c3: 1.5, c4: 1.5, c5: null, c6: 0.84, c7: null, type: 'ELU - Gravitacional com W2', goal: 'Compressão máxima em pilares e banzos com W2 secundário.' },
            { no: 4, title: '1*1.00+2*1.00+6*1.40', c1: 1.0, c2: 1.0, c3: null, c4: null, c5: null, c6: 1.4, c7: null, type: 'ELU - Arrancamento Crítico com W2', goal: 'CRÍTICA: Máxima tração em chumbadores e compressão no banzo inferior com W2 (+0.20).' },
            { no: 5, title: '1*1.25+2*1.25+3*1.50+4*1.50+7*0.84', c1: 1.25, c2: 1.25, c3: 1.5, c4: 1.5, c5: null, c6: null, c7: 0.84, type: 'ELU - Gravitacional com W3', goal: 'Compressão máxima com W3 secundário.' },
            { no: 6, title: '1*1.00+2*1.00+7*1.40', c1: 1.0, c2: 1.0, c3: null, c4: null, c5: null, c6: null, c7: 1.4, type: 'ELU - Arrancamento com W3', goal: 'Arrancamento e tração nas fundações com W3.' },
            { no: 7, title: '1*1.00+2*1.00+3*0.30+4*0.30', c1: 1.0, c2: 1.0, c3: 0.3, c4: 0.3, c5: null, c6: null, c7: null, type: 'ELS - Quase-Permanente', goal: 'Flecha vertical da treliça sob cargas quase-permanentes (L/250 a L/350).' },
            { no: 8, title: '1*1.00+2*1.00+3*0.30+4*0.30+5*0.60', c1: 1.0, c2: 1.0, c3: 0.3, c4: 0.3, c5: 0.6, c6: null, c7: null, type: 'ELS - Deslocamento com W1', goal: 'Deriva lateral e flecha com W1 (limite H/300 a H/400 nos pilares).' },
            { no: 9, title: '1*1.00+2*1.00+3*0.30+4*0.30+6*0.60', c1: 1.0, c2: 1.0, c3: 0.3, c4: 0.3, c5: null, c6: 0.6, c7: null, type: 'ELS - Deslocamento com W2', goal: 'Deriva lateral e flecha sob vento W2.' },
            { no: 10, title: '1*1.00+2*1.00+3*0.30+4*0.30+7*0.60', c1: 1.0, c2: 1.0, c3: 0.3, c4: 0.3, c5: null, c6: null, c7: 0.6, type: 'ELS - Deslocamento com W3', goal: 'Deriva lateral e flecha sob vento W3.' },
            { no: 11, title: '1*1.00+2*1.00+5*0.60', c1: 1.0, c2: 1.0, c3: null, c4: null, c5: 0.6, c6: null, c7: null, type: 'ELS - Levantamento Cobertura W1', goal: 'Verificação de fixadores e vedações de cobertura sob W1.' },
            { no: 12, title: '1*1.00+2*1.00+6*0.60', c1: 1.0, c2: 1.0, c3: null, c4: null, c5: null, c6: 0.6, c7: null, type: 'ELS - Levantamento Cobertura W2', goal: 'Máximo levantamento da cobertura em serviço sob sucção de W2.' },
            { no: 13, title: '1*1.00+2*1.00+7*0.60', c1: 1.0, c2: 1.0, c3: null, c4: null, c5: null, c6: null, c7: 0.6, type: 'ELS - Levantamento Cobertura W3', goal: 'Levantamento da cobertura sob vento oposto W3.' },
            { no: 14, title: '1*1.25+2*1.25+3*1.05+4*1.05+5*1.40', c1: 1.25, c2: 1.25, c3: 1.05, c4: 1.05, c5: 1.4, c6: null, c7: null, type: 'ELU - Momento Base com W1', goal: 'Momento fletor máximo na base do pilar a barlavento (W1 principal 1.4, sobrecarga ψ0 = 0.70 -> 1.05).' },
            { no: 15, title: '1*1.25+2*1.25+3*1.05+4*1.05+6*1.40', c1: 1.25, c2: 1.25, c3: 1.05, c4: 1.05, c5: null, c6: 1.4, c7: null, type: 'ELU - Momento Base com W2', goal: 'Momento fletor na base sob W2 principal.' },
            { no: 16, title: '1*1.25+2*1.25+3*1.05+4*1.05+7*1.40', c1: 1.25, c2: 1.25, c3: 1.05, c4: 1.05, c5: null, c6: null, c7: 1.4, type: 'ELU - Momento Base com W3', goal: 'Momento fletor na base do pilar sob W3 principal.' }
        ],
        rules: {
            never_combine: [
                'NUNCA JUNTAR 5:W1, 6:W2 e 7:W3 na mesma combinação: São hipóteses de vento mutuamente exclusivas!',
                'NUNCA SOMAR SOBRECARGAS (3:SC Telhado e 4:SC EQUIPA) em combinações de arrancamento (Comb 2, 4 e 6): Fator vazio/zero!',
                'NUNCA MAJORAR PESO PRÓPRIO NO ARRANCAMENTO: Utilizar fator favorável 1.00 para 1:pp e 2:Peso telhas nas combinações de arrancamento.'
            ],
            always_combine: [
                'DEVEM SER JUNTOS: 1:pp e 2:Peso telhas atuam juntos em todas as 16 combinações reais.',
                'DEVEM SER JUNTOS NO ELU GRAVITACIONAL (Comb 1, 3, 5): 1:pp (1.25) + 2:Peso telhas (1.25) + 3:SC Telhado (1.50) + 4:SC EQUIPA (1.50) + Vento secundário (0.84).',
                'DEVEM SER JUNTOS NO ELU VENTO PREPONDERANTE (Comb 14, 15, 16): 1:pp (1.25) + 2:Peso telhas (1.25) + 3:SC Telhado (1.05) + 4:SC EQUIPA (1.05) + Vento principal (1.40).'
            ]
        }
    };
}

let currentStrapData = null;
let currentStrapDiagramCase = '6:W2';

function selectStrapDiagramCase(caseId) {
    currentStrapDiagramCase = caseId;
    document.querySelectorAll('.strap-diag-btn').forEach(btn => {
        if (btn.textContent.trim().startsWith(caseId) || btn.textContent.includes(caseId)) {
            btn.classList.add('bg-indigo-600', 'text-white', 'font-bold', 'active');
            btn.classList.remove('border-gray-300', 'hover:bg-gray-200');
        } else {
            btn.classList.remove('bg-indigo-600', 'text-white', 'font-bold', 'active');
            btn.classList.add('border-gray-300');
        }
    });
    const badge = document.getElementById('strap-diagram-badge');
    if (badge) {
        if (caseId === '1:pp') {
            badge.className = 'text-[10px] px-2 py-0.5 rounded font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
            badge.textContent = '1:pp - Peso Próprio Automático (Z = -1.0)';
        } else if (caseId === '2:Peso telhas') {
            badge.className = 'text-[10px] px-2 py-0.5 rounded font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
            badge.textContent = '2:Peso telhas - Telhas, Terças e Acessórios';
        } else if (caseId === '3:SC Telhado') {
            badge.className = 'text-[10px] px-2 py-0.5 rounded font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
            badge.textContent = '3:SC Telhado - Sobrecarga Manutenção NBR 6120';
        } else if (caseId === '4:SC EQUIPA...') {
            badge.className = 'text-[10px] px-2 py-0.5 rounded font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
            badge.textContent = '4:SC EQUIPA... - Utilidades e Cargas Suspensas';
        } else if (caseId === '5:W1') {
            badge.className = 'text-[10px] px-2 py-0.5 rounded font-extrabold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
            badge.textContent = '5:W1 - Vento 90° Sucção Interna (Cpi = -0.30)';
        } else if (caseId === '6:W2') {
            badge.className = 'text-[10px] px-2 py-0.5 rounded font-extrabold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-extrabold';
            badge.textContent = '6:W2 - Arrancamento Crítico & Compressão Banzo Inf. (Cpi = +0.20)';
        } else if (caseId === '7:W3') {
            badge.className = 'text-[10px] px-2 py-0.5 rounded font-extrabold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';
            badge.textContent = '7:W3 - Vento -90° Oposto (Sentido Direita->Esquerda)';
        }
    }
    drawStrapFrame(caseId);
}

function renderStrapPortalFrame(strapData, qTop) {
    if (!strapData) return;
    currentStrapData = strapData;
    const g = strapData.geometry;
    
    // Atualiza Badges de Geometria
    if (document.getElementById('strap-disp-span')) document.getElementById('strap-disp-span').textContent = g.span;
    if (document.getElementById('strap-disp-height')) document.getElementById('strap-disp-height').textContent = g.eaves_h;
    if (document.getElementById('strap-disp-pitch-deg')) document.getElementById('strap-disp-pitch-deg').textContent = g.slope_deg;
    if (document.getElementById('strap-disp-pitch-pct')) document.getElementById('strap-disp-pitch-pct').textContent = g.slope_pct;
    if (document.getElementById('strap-disp-spacing')) document.getElementById('strap-disp-spacing').textContent = g.frame_spacing;
    if (document.getElementById('strap-disp-purlin')) document.getElementById('strap-disp-purlin').textContent = g.purlin_spacing;
    if (document.getElementById('strap-disp-q')) document.getElementById('strap-disp-q').textContent = qTop || '0.536';
    if (document.getElementById('strap-disp-rafter')) document.getElementById('strap-disp-rafter').textContent = g.rafter_len;
    if (document.getElementById('strap-table-spacing-val')) document.getElementById('strap-table-spacing-val').textContent = g.frame_spacing;
    
    const pitchClass = document.getElementById('strap-disp-pitch-class');
    if (pitchClass) {
        pitchClass.textContent = g.slope_deg <= 10.0 ? 'θ ≤ 10° (Baixa incl. Tabela 5)' : 'θ > 10° (Tabela 5)';
    }

    // Tabela de Casos de Carregamento (Load Cases 1 a 7)
    const tbodyCases = document.getElementById('strap-loadcases-tbody');
    if (tbodyCases && strapData.load_cases) {
        tbodyCases.innerHTML = strapData.load_cases.map(lc => {
            let badgeColor = 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
            if (lc.id.includes('1:pp') || lc.id.includes('2:Peso')) badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
            if (lc.id.includes('3:SC') || lc.id.includes('4:SC')) badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
            if (lc.id.includes('5:W1')) badgeColor = 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
            if (lc.id.includes('6:W2')) badgeColor = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 font-extrabold';
            if (lc.id.includes('7:W3')) badgeColor = 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300';

            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="p-2.5 font-bold">
                        <span class="px-2 py-0.5 rounded text-[11px] ${badgeColor}">${lc.id}</span>
                    </td>
                    <td class="p-2.5 font-semibold text-gray-900 dark:text-gray-100">${lc.name}</td>
                    <td class="p-2.5 font-mono text-[11px] text-gray-600 dark:text-gray-400">${lc.type_strap}</td>
                    <td class="p-2.5 text-gray-700 dark:text-gray-300">${lc.where}</td>
                    <td class="p-2.5 font-mono">${lc.pressure_kpa}</td>
                    <td class="p-2.5 font-bold font-mono text-indigo-700 dark:text-indigo-400">${lc.linear_load_knm}</td>
                    <td class="p-2.5 font-mono text-blue-700 dark:text-blue-400">${lc.nodal_roof_kn || lc.nodal_load_kn || '---'}</td>
                    <td class="p-2.5 text-gray-500 dark:text-gray-400">${lc.direction}</td>
                </tr>
            `;
        }).join('');
    }

    // Tabela de Combinações Exata do STRAP (16 Linhas com Matriz de Fatores)
    const tbodyCombos = document.getElementById('strap-combos-tbody');
    const combos = strapData.combinations || strapData.strap_combinations;
    if (tbodyCombos && combos) {
        tbodyCombos.innerHTML = combos.map(cb => {
            let typeBadge = cb.type.startsWith('ELU') 
                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' 
                : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300';

            const isCriticalUplift = cb.no === 4;
            const rowClass = isCriticalUplift 
                ? 'bg-red-50/50 dark:bg-red-950/20 font-semibold' 
                : (cb.no % 2 === 0 ? 'bg-gray-50/50 dark:bg-gray-800/20' : '');

            const fmtCell = (val, isUpliftCol = false) => {
                if (val === null || val === undefined || val === '') {
                    return '<span class="text-gray-300 dark:text-gray-600 font-normal">—</span>';
                }
                if (isUpliftCol) {
                    return `<span class="font-extrabold text-red-600 dark:text-red-400">${val}</span>`;
                }
                return `<span class="font-bold text-gray-800 dark:text-gray-200">${val}</span>`;
            };

            return `
                <tr class="hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 transition-colors ${rowClass}">
                    <td class="p-2 border border-gray-200 dark:border-gray-700 font-bold text-purple-700 dark:text-purple-400">${cb.no}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 text-left font-bold text-gray-900 dark:text-gray-100 font-mono text-[11px] truncate" title="${cb.title}">
                        ${cb.title}
                    </td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-950/10">${fmtCell(cb.c1)}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 bg-blue-50/30 dark:bg-blue-950/10">${fmtCell(cb.c2)}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 bg-amber-50/30 dark:bg-amber-950/10">${fmtCell(cb.c3)}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 bg-amber-50/30 dark:bg-amber-950/10">${fmtCell(cb.c4)}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 bg-purple-50/30 dark:bg-purple-950/10">${fmtCell(cb.c5)}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 bg-red-50/30 dark:bg-red-950/10">${fmtCell(cb.c6, true)}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 bg-purple-50/30 dark:bg-purple-950/10">${fmtCell(cb.c7)}</td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 text-left font-sans">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${typeBadge} mr-1">${cb.type}</span>
                        <span class="text-[11px] text-gray-600 dark:text-gray-400">${cb.goal}</span>
                    </td>
                    <td class="p-2 border border-gray-200 dark:border-gray-700 text-center font-sans">
                        <button type="button" onclick="copySingleCombo('${cb.title}')" title="Copiar Equação" class="p-1 px-2.5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-gray-700 dark:text-gray-300 hover:text-indigo-600 transition-colors text-[11px] font-semibold cursor-pointer">
                            📋 Copiar
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Desenha o diagrama esquemático com o caso ativo
    drawStrapFrame(currentStrapDiagramCase);
}

window.addEventListener('resize', () => {
    if (currentStrapData && currentTab === 'wind') {
        drawStrapFrame(currentStrapDiagramCase);
    }
});

function drawStrapFrame(caseId) {
    const canvas = document.getElementById('strapFrameCanvas');
    if (!canvas) return;
    
    // Configura dimensões do canvas para alta resolução (Retina)
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = (rect.width || 800) * dpr;
    canvas.height = (rect.height || 280) * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const W = rect.width || 800;
    const H = rect.height || 280;

    ctx.clearRect(0, 0, W, H);

    // Dados geométricos
    const g = currentStrapData?.geometry || { span: 18, eaves_h: 15, truss_h_eaves: 1.0, truss_h_ridge: 2.0 };
    const lds = currentStrapData?.loads;

    // Escala e margens
    const marginX = 80;
    const marginY = 50;
    const groundY = H - 35;
    const frameW = W - 2 * marginX;
    
    const xLeft = marginX;
    const xRight = marginX + frameW;
    const xMid = marginX + frameW / 2;

    const colH_px = (H - 110);
    const yEaves = groundY - colH_px;
    const trussEaves_px = 16;
    const trussRidge_px = 32;

    const yBotLeft = yEaves;
    const yBotRight = yEaves;
    const yBotMid = yEaves;

    const yTopLeft = yEaves - trussEaves_px;
    const yTopRight = yEaves - trussEaves_px;
    const yTopMid = yEaves - trussRidge_px;

    // 1. Chão e Apoios
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xLeft - 30, groundY);
    ctx.lineTo(xRight + 30, groundY);
    ctx.stroke();

    // Hachura de terra
    ctx.lineWidth = 1;
    for (let x = xLeft - 30; x <= xRight + 30; x += 10) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 6, groundY + 8);
        ctx.stroke();
    }

    // Desenha apoios (triângulos articulados)
    function drawSupport(x, y) {
        ctx.fillStyle = '#6b7280';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8, y + 12);
        ctx.lineTo(x + 8, y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    drawSupport(xLeft, groundY - 12);
    drawSupport(xRight, groundY - 12);

    // 2. Pilares Verticais
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    // Pilar Esquerdo
    ctx.moveTo(xLeft, groundY - 12);
    ctx.lineTo(xLeft, yEaves);
    // Pilar Direito
    ctx.moveTo(xRight, groundY - 12);
    ctx.lineTo(xRight, yEaves);
    ctx.stroke();

    // 3. Treliça (Banzos e Diagonais)
    // Banzo Inferior
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(xLeft, yBotLeft);
    ctx.lineTo(xMid, yBotMid);
    ctx.lineTo(xRight, yBotRight);
    ctx.stroke();

    // Banzo Superior
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#1d4ed8'; // Azul
    ctx.beginPath();
    ctx.moveTo(xLeft, yTopLeft);
    ctx.lineTo(xMid, yTopMid);
    ctx.lineTo(xRight, yTopRight);
    ctx.stroke();

    // Montantes nos beirais e cumeeira
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#64748b';
    ctx.beginPath();
    ctx.moveTo(xLeft, yBotLeft); ctx.lineTo(xLeft, yTopLeft);
    ctx.moveTo(xMid, yBotMid); ctx.lineTo(xMid, yTopMid);
    ctx.moveTo(xRight, yBotRight); ctx.lineTo(xRight, yTopRight);
    ctx.stroke();

    // Diagonais da treliça (subdivisão em 6 painéis)
    const panels = 6;
    const dx = frameW / panels;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#94a3b8';
    ctx.beginPath();
    for (let i = 1; i < panels; i++) {
        const px = xLeft + i * dx;
        const ratio = i <= panels / 2 ? (i / (panels / 2)) : ((panels - i) / (panels / 2));
        const pyTop = yTopLeft - ratio * (trussRidge_px - trussEaves_px);
        const pyBot = yBotMid;
        // montante interno
        ctx.moveTo(px, pyBot);
        ctx.lineTo(px, pyTop);
        // diagonal
        if (i <= panels / 2) {
            ctx.moveTo(px - dx, pyBot);
            ctx.lineTo(px, pyTop);
        } else {
            ctx.moveTo(px, pyTop);
            ctx.lineTo(px + dx, pyBot);
        }
    }
    ctx.stroke();

    // 4. Anotações de Cotas
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Vão = ${g.span}m`, xMid, groundY + 20);
    
    ctx.textAlign = 'right';
    ctx.fillText(`H = ${g.eaves_h}m`, xLeft - 15, groundY - colH_px / 2);
    ctx.fillText(`h = ${g.truss_h_eaves}m`, xLeft - 8, yEaves - 8);

    ctx.textAlign = 'center';
    ctx.fillText(`h = ${g.truss_h_ridge}m`, xMid, yTopMid - 16);

    // 5. Desenho das Cargas por Caso de Carga
    function drawArrow(fromX, fromY, toX, toY, color = '#2563eb', headLen = 6) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 6), toY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 6), toY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    if (caseId.includes('1:pp')) {
        const color = '#3b82f6';
        // Setas para baixo em pilares e cobertura representando peso próprio
        for (let y = groundY - 25; y >= yEaves; y -= 28) {
            drawArrow(xLeft - 10, y - 15, xLeft - 10, y, color);
            drawArrow(xRight + 10, y - 15, xRight + 10, y, color);
        }
        for (let i = 1; i < 10; i++) {
            const rx = xLeft + i * (frameW / 10);
            const ratio = i <= 5 ? (i / 5) : ((10 - i) / 5);
            const ryTop = yTopLeft - ratio * (trussRidge_px - trussEaves_px);
            drawArrow(rx, ryTop - 18, rx, ryTop - 2, color);
        }
        ctx.fillStyle = color;
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('1:pp - Peso Próprio da Estrutura Metálica (Auto STRAP Z = -1.0)', xMid, yTopMid - 35);

    } else if (caseId.includes('2:Peso') || caseId.includes('3:SC') || caseId.includes('4:SC')) {
        const isD2 = caseId.includes('2:Peso');
        const isL3 = caseId.includes('3:SC');
        const color = isD2 ? '#16a34a' : (isL3 ? '#d97706' : '#ea580c');
        const valText = isD2 ? `w = -${lds?.w_d2 || 1.20} kN/m` : (isL3 ? `w = -${lds?.w_l3 || 1.50} kN/m` : `w = -${lds?.w_l4 || 0.90} kN/m`);

        // Setas verticais para baixo no banzo superior
        const numArrows = 10;
        for (let i = 0; i <= numArrows; i++) {
            const rx = xLeft + i * (frameW / numArrows);
            const ratio = i <= numArrows / 2 ? (i / (numArrows / 2)) : ((numArrows - i) / (numArrows / 2));
            const ryTop = yTopLeft - ratio * (trussRidge_px - trussEaves_px);
            drawArrow(rx, ryTop - 25, rx, ryTop - 3, color);
        }
        ctx.fillStyle = color;
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${caseId}: Carga Vertical na Cobertura (${valText})`, xMid, yTopMid - 35);

    } else if (caseId.includes('5:W1')) {
        const color = '#8b5cf6';
        const wWind = lds?.wind_suction_cpi_neg || lds?.wind_w1 || {};

        // Pilar Barlavento (empurrando para a direita)
        for (let y = groundY - 20; y >= yEaves; y -= 24) {
            drawArrow(xLeft - 30, y, xLeft - 3, y, color);
        }
        ctx.fillStyle = color;
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`+${wWind.w_pilar_windward || 3.22} kN/m`, xLeft - 35, groundY - colH_px / 2);

        // Pilar Sotavento (sucção puxando para fora / direita)
        for (let y = groundY - 20; y >= yEaves; y -= 24) {
            drawArrow(xRight + 3, y, xRight + 25, y, '#7c3aed');
        }
        ctx.fillStyle = '#7c3aed';
        ctx.textAlign = 'left';
        ctx.fillText(`${wWind.w_pilar_leeward || -0.64} kN/m`, xRight + 30, groundY - colH_px / 2);

        // Cobertura Barlavento (sucção normal para fora)
        for (let i = 1; i < 5; i++) {
            const rx = xLeft + i * (frameW / 10);
            const ratio = i / 5;
            const ry = yTopLeft - ratio * (trussRidge_px - trussEaves_px);
            drawArrow(rx, ry - 3, rx - 6, ry - 22, color);
        }
        ctx.fillText(`${wWind.w_roof_windward || -1.61} kN/m`, xLeft + frameW * 0.25 - 20, yTopMid - 30);

        // Cobertura Sotavento (sucção normal para fora)
        for (let i = 6; i < 10; i++) {
            const rx = xLeft + i * (frameW / 10);
            const ratio = (10 - i) / 5;
            const ry = yTopRight - ratio * (trussRidge_px - trussEaves_px);
            drawArrow(rx, ry - 3, rx + 6, ry - 22, '#7c3aed');
        }
        ctx.fillText(`${wWind.w_roof_leeward || -0.64} kN/m`, xLeft + frameW * 0.75 + 10, yTopMid - 30);

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText('5:W1 - Vento 90° Sucção Interna (Cpi = -0.30)', xMid, yTopMid - 42);

    } else if (caseId.includes('6:W2')) {
        const color = '#dc2626'; // Vermelho crítico
        const wWind = lds?.wind_overpressure_cpi_pos || lds?.wind_w2 || {};

        // Pilar Barlavento
        for (let y = groundY - 20; y >= yEaves; y -= 24) {
            drawArrow(xLeft - 25, y, xLeft - 3, y, '#ea580c');
        }
        ctx.fillStyle = '#ea580c';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`+${wWind.w_pilar_windward || 1.61} kN/m`, xLeft - 30, groundY - colH_px / 2);

        // Pilar Sotavento (forte sucção para a direita)
        for (let y = groundY - 20; y >= yEaves; y -= 24) {
            drawArrow(xRight + 3, y, xRight + 30, y, color);
        }
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.fillText(`${wWind.w_pilar_leeward || -2.25} kN/m`, xRight + 35, groundY - colH_px / 2);

        // Cobertura Barlavento (MÁXIMA SUCÇÃO DE ARRANCAMENTO)
        for (let i = 1; i < 5; i++) {
            const rx = xLeft + i * (frameW / 10);
            const ratio = i / 5;
            const ry = yTopLeft - ratio * (trussRidge_px - trussEaves_px);
            drawArrow(rx, ry - 3, rx - 10, ry - 30, color, 8);
        }
        ctx.fillStyle = color;
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`MÁXIMA SUCÇÃO: ${wWind.w_roof_windward || -3.22} kN/m`, xLeft + frameW * 0.25 - 10, yTopMid - 42);

        // Cobertura Sotavento (FORTE SUCÇÃO)
        for (let i = 6; i < 10; i++) {
            const rx = xLeft + i * (frameW / 10);
            const ratio = (10 - i) / 5;
            const ry = yTopRight - ratio * (trussRidge_px - trussEaves_px);
            drawArrow(rx, ry - 3, rx + 10, ry - 28, color, 7);
        }
        ctx.fillText(`SUCÇÃO: ${wWind.w_roof_leeward || -2.25} kN/m`, xLeft + frameW * 0.75 + 10, yTopMid - 42);

        // Banner de Alerta Crítico no Canvas
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(xMid - 180, 8, 360, 22);
        ctx.strokeStyle = '#ef4444';
        ctx.strokeRect(xMid - 180, 8, 360, 22);
        ctx.fillStyle = '#b91c1c';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚠️ CRÍTICO: Arrancamento de Fundações & Compressão no Banzo Inferior', xMid, 23);

    } else if (caseId.includes('7:W3')) {
        const color = '#9333ea';
        const wWind = lds?.wind_overpressure_cpi_pos || lds?.wind_w2 || {};

        // Vento vindo da direita (Sentido Inverso)
        for (let y = groundY - 20; y >= yEaves; y -= 24) {
            drawArrow(xRight + 30, y, xRight + 3, y, color);
        }
        ctx.fillStyle = color;
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`-${wWind.w_pilar_windward || 1.61} kN/m`, xRight + 35, groundY - colH_px / 2);

        for (let y = groundY - 20; y >= yEaves; y -= 24) {
            drawArrow(xLeft - 3, y, xLeft - 25, y, '#7e22ce');
        }
        ctx.fillStyle = '#7e22ce';
        ctx.textAlign = 'right';
        ctx.fillText(`-${wWind.w_pilar_leeward || 2.25} kN/m`, xLeft - 30, groundY - colH_px / 2);

        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText('7:W3 - Vento Invertido -90° (Sentido Direita -> Esquerda)', xMid, yTopMid - 42);
    }
}

function copySingleCombo(formula) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(formula).then(() => {
            alert(`📋 Equação copiada para o STRAP:\n\n${formula}`);
        }).catch(() => {
            prompt("Copie a equação abaixo:", formula);
        });
    } else {
        prompt("Copie a equação abaixo:", formula);
    }
}

function copyStrapCombinationsText() {
    const combos = currentStrapData?.combinations || currentStrapData?.strap_combinations;
    if (!currentStrapData || !combos) {
        alert("Execute a análise de vento primeiro.");
        return;
    }
    
    // Formato Tabulado (TSV) pronto para colar no Excel ou STRAP
    let tsv = "No.\tTitle\t1:pp\t2:Peso telhas\t3:SC Telhado\t4:SC EQUIPA...\t5:W1\t6:W2\t7:W3\n";
    combos.forEach(cb => {
        const c1 = cb.c1 !== null && cb.c1 !== undefined ? cb.c1 : '';
        const c2 = cb.c2 !== null && cb.c2 !== undefined ? cb.c2 : '';
        const c3 = cb.c3 !== null && cb.c3 !== undefined ? cb.c3 : '';
        const c4 = cb.c4 !== null && cb.c4 !== undefined ? cb.c4 : '';
        const c5 = cb.c5 !== null && cb.c5 !== undefined ? cb.c5 : '';
        const c6 = cb.c6 !== null && cb.c6 !== undefined ? cb.c6 : '';
        const c7 = cb.c7 !== null && cb.c7 !== undefined ? cb.c7 : '';
        tsv += `${cb.no}\t${cb.title}\t${c1}\t${c2}\t${c3}\t${c4}\t${c5}\t${c6}\t${c7}\n`;
    });

    if (navigator.clipboard) {
        navigator.clipboard.writeText(tsv).then(() => {
            alert("📋 Matriz de 16 combinações do STRAP copiada em formato tabulado!\n\nVocê pode colar diretamente no STRAP ou no Excel.");
        });
    } else {
        prompt("Copie a tabela tabulada abaixo:", tsv);
    }
}

function exportStrapReportTxt() {
    if (!currentStrapData) {
        alert("Execute a análise primeiro.");
        return;
    }
    const g = currentStrapData.geometry;
    const combos = currentStrapData.combinations || currentStrapData.strap_combinations || [];
    let txt = "========================================================================\n";
    txt += "MEMORIAL DE CARGAS E COMBINAÇÕES PARA O STRAP - PÓRTICO 2D / GALPÃO\n";
    txt += "Normas: ABNT NBR 6123:1988, ABNT NBR 6120:2019, ABNT NBR 8681, ABNT NBR 8800\n";
    txt += "========================================================================\n\n";
    txt += "1. DADOS GEOMÉTRICOS DO PÓRTICO:\n";
    txt += `• Vão Livre (L): ${g.span} m\n`;
    txt += `• Altura do Pilar / Beiral (H): ${g.eaves_h} m\n`;
    txt += `• Altura da Treliça no Beiral: ${g.truss_h_eaves} m\n`;
    txt += `• Altura da Treliça na Cumeeira: ${g.truss_h_ridge} m\n`;
    txt += `• Inclinação da Cobertura: ${g.slope_deg}° (${g.slope_pct}%) [${g.slope_deg <= 10 ? 'Baixa Inclinação θ ≤ 10°' : 'θ > 10°'}]\n`;
    txt += `• Comprimento Inclinado da Barra: ${g.rafter_len} m\n`;
    txt += `• Modulação entre Pórticos (s): ${g.frame_spacing} m\n`;
    txt += `• Espaçamento entre Terças (d): ${g.purlin_spacing} m\n\n`;

    txt += "2. CASOS DE CARREGAMENTO A CRIAR NO STRAP (LOAD CASES 1 A 7):\n";
    currentStrapData.load_cases.forEach(lc => {
        txt += `\n[${lc.id}] - ${lc.name}\n`;
        txt += `  Tipo STRAP: ${lc.type_strap}\n`;
        txt += `  Onde Aplicar: ${lc.where}\n`;
        txt += `  Pressão: ${lc.pressure_kpa} kN/m²\n`;
        txt += `  Carga Linear Distribuída: ${lc.linear_load_knm} kN/m\n`;
        txt += `  Carga Nodal por Terça: ${lc.nodal_roof_kn || lc.nodal_load_kn} kN\n`;
        txt += `  Direção/Eixo: ${lc.direction}\n`;
        txt += `  Observações: ${lc.notes}\n`;
    });

    txt += "\n\n3. DIRETRIZES DE ASSOCIAÇÃO: QUAIS VALORES DEVEM SER JUNTOS OU NÃO:\n\n";
    txt += "⛔ O QUE NUNCA JUNTAR:\n";
    currentStrapData.rules?.never_combine?.forEach(r => txt += `• ${r}\n`);

    txt += "\n✅ O QUE DEVE SER JUNTO:\n";
    currentStrapData.rules?.always_combine?.forEach(r => txt += `• ${r}\n`);

    txt += "\n\n4. MATRIZ EXATA DE COMBINAÇÕES DO STRAP (16 COMBINAÇÕES):\n";
    txt += "No. | Title | 1:pp | 2:Peso telhas | 3:SC Telhado | 4:SC EQUIPA... | 5:W1 | 6:W2 | 7:W3 | Objetivo\n";
    txt += "----+-------+------+---------------+--------------+----------------+------+------+------+---------\n";
    combos.forEach(cb => {
        const c1 = cb.c1 !== null && cb.c1 !== undefined ? cb.c1 : '—';
        const c2 = cb.c2 !== null && cb.c2 !== undefined ? cb.c2 : '—';
        const c3 = cb.c3 !== null && cb.c3 !== undefined ? cb.c3 : '—';
        const c4 = cb.c4 !== null && cb.c4 !== undefined ? cb.c4 : '—';
        const c5 = cb.c5 !== null && cb.c5 !== undefined ? cb.c5 : '—';
        const c6 = cb.c6 !== null && cb.c6 !== undefined ? cb.c6 : '—';
        const c7 = cb.c7 !== null && cb.c7 !== undefined ? cb.c7 : '—';
        txt += `${String(cb.no).padEnd(3)} | ${cb.title.padEnd(35)} | ${String(c1).padEnd(4)} | ${String(c2).padEnd(13)} | ${String(c3).padEnd(12)} | ${String(c4).padEnd(14)} | ${String(c5).padEnd(4)} | ${String(c6).padEnd(4)} | ${String(c7).padEnd(4)} | ${cb.goal}\n`;
    });

    downloadTextFile('memorial_cargas_portico_strap_nbr6123.txt', txt);
}

function renderNbrWindResults(res) {
    const p = res.parameters;
    const s = res.summary;

    calculatedStore.wind.base_shear = parseFloat(s.base_shear_kn);
    calculatedStore.wind.overturning_moment = parseFloat(s.base_overturning_moment_knm);
    calculatedStore.wind.q_top = parseFloat(p.q_top_kpa);
    calculatedStore.wind.p_pos = parseFloat(res.pressures.windward.p_kpa);
    calculatedStore.wind.p_neg = parseFloat(res.pressures.leeward.p_kpa);

    // KPIs
    document.getElementById('kpi-nbr-wind-shear').textContent = s.base_shear_kn;
    document.getElementById('kpi-nbr-wind-moment').textContent = s.base_overturning_moment_knm;
    document.getElementById('kpi-nbr-wind-vk').textContent = p.vk_top;
    document.getElementById('kpi-nbr-wind-vk-kmh').textContent = `${(parseFloat(p.vk_top) * 3.6).toFixed(1)} km/h`;
    document.getElementById('kpi-nbr-wind-qtop').textContent = p.q_top_kpa;

    // Pressões
    document.getElementById('nbr-face-windward').textContent = `${res.pressures.windward.p_kpa} kN/m²`;
    document.getElementById('nbr-cpe-windward').textContent = `+${res.pressures.windward.cpe}`;
    document.getElementById('nbr-cpi-val').textContent = p.cpi;

    document.getElementById('nbr-face-leeward').textContent = `${res.pressures.leeward.p_kpa} kN/m²`;
    document.getElementById('nbr-cpe-leeward').textContent = `${res.pressures.leeward.cpe}`;

    document.getElementById('nbr-face-sides').textContent = `${res.pressures.sides.p_kpa} kN/m²`;
    document.getElementById('nbr-cpe-sides').textContent = `${res.pressures.sides.cpe}`;
    document.getElementById('nbr-ca-display').textContent = p.ca;

    // Tabela Pavimentos
    const tbody = document.getElementById('nbr-wind-floors-tbody');
    if (tbody && res.levels) {
        tbody.innerHTML = res.levels.map(l => `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="p-2 font-bold">${l.floor}º Pav.</td>
                <td class="p-2">${l.z} m</td>
                <td class="p-2">${l.s2}</td>
                <td class="p-2">${l.vk}</td>
                <td class="p-2">${l.q_kpa}</td>
                <td class="p-2">${l.trib_area}</td>
                <td class="p-2 font-bold text-blue-600 dark:text-blue-400">${l.force_kn}</td>
                <td class="p-2">${l.moment_knm}</td>
            </tr>
        `).reverse().join('');
    }

    // Gráfico Chart.js
    renderNbrWindChart(res.profile || []);

    // Renderiza o módulo do Pórtico 2D para o STRAP
    renderStrapPortalFrame(res.portal_frame_strap, p.q_top_kpa);
}

function renderNbrWindChart(profile) {
    const ctx = document.getElementById('nbrWindChart');
    if (!ctx) return;

    const labels = profile.map(pt => `${pt.z}m`);
    const vkData = profile.map(pt => pt.vk);
    const qData = profile.map(pt => (parseFloat(pt.q_kpa) * 10).toFixed(2)); // escala visual para plot conjunto

    if (nbrWindChartInstance) {
        nbrWindChartInstance.destroy();
    }

    nbrWindChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Velocidade Vk (m/s)',
                    data: vkData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Pressão Dinâmica q (x10 kN/m²)',
                    data: qData,
                    borderColor: '#7c3aed',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } }
            },
            scales: {
                x: { title: { display: true, text: 'Altura z (m)', font: { size: 10 } } },
                y: { title: { display: true, text: 'Magnitude', font: { size: 10 } } }
            }
        }
    });
}

function exportNbrWindTableCsv() {
    let csv = "Pavimento;Cota_z_m;S2;Vk_ms;q_kpa;Area_m2;Forca_Fx_kN;Momento_kNm\n";
    const rows = document.querySelectorAll('#nbr-wind-floors-tbody tr');
    rows.forEach(tr => {
        const cols = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        if (cols.length >= 8) {
            csv += cols.join(';') + '\n';
        }
    });
    downloadTextFile('vento_nbr6123_pavimentos.csv', csv);
}

// ==============================================================================
// MÓDULO 2: SISMO NBR 15421:2006
// ==============================================================================

const NBR_SEISMIC_ZONES = {
    '0': 0.025,
    '1': 0.050,
    '2': 0.100,
    '3': 0.150,
    '4': 0.200
};

function onNbrSeismicZoneChange() {
    const z = document.getElementById('nbr_seismic_zone').value;
    if (NBR_SEISMIC_ZONES[z]) {
        document.getElementById('nbr_seismic_ag').value = NBR_SEISMIC_ZONES[z];
    }
}

async function calculateNbrSeismic() {
    const payload = {
        seismic_zone: document.getElementById('nbr_seismic_zone').value,
        custom_ag: parseFloat(document.getElementById('nbr_seismic_ag').value) || 0.050,
        soil_class: document.getElementById('nbr_seismic_soil').value,
        structural_system: document.getElementById('nbr_seismic_system').value,
        importance_category: document.getElementById('nbr_seismic_importance').value,
        total_weight: parseFloat(document.getElementById('nbr_seismic_weight').value) || 15000.0,
        total_height: parseFloat(document.getElementById('nbr_seismic_height').value) || 30.0,
        num_floors: parseInt(document.getElementById('nbr_seismic_floors').value) || 10,
        user_period: parseFloat(document.getElementById('nbr_seismic_period')?.value || 0)
    };

    let result = null;
    if (typeof eel !== 'undefined' && typeof eel.calculate_nbr_seismic === 'function') {
        try {
            result = await eel.calculate_nbr_seismic(payload)();
        } catch (e) {
            console.warn('Erro backend sismo NBR:', e);
        }
    }

    if (!result || result.status !== 'success') {
        result = clientCalcSeismicNbr(payload);
    }

    renderNbrSeismicResults(result);
}

function clientCalcSeismicNbr(p) {
    const ag = p.custom_ag;
    const FaTable = { 'A': 0.8, 'B': 1.0, 'C': 1.2, 'D': 1.5, 'E': 2.0 };
    const FvTable = { 'A': 0.8, 'B': 1.0, 'C': 1.6, 'D': 2.2, 'E': 3.2 };
    const Fa = FaTable[p.soil_class] || 1.4;
    const Fv = FvTable[p.soil_class] || 2.0;

    const Ts = Fv / Fa;
    const T0 = 0.2 * Ts;

    const rTable = {
        portico_concreto_especial: 7.0,
        portico_concreto_intermediario: 4.5,
        portico_concreto_ordinario: 3.0,
        paredes_cisalhamento_concreto: 5.0,
        portico_aco_especial: 7.0,
        portico_aco_intermediario: 4.5,
        alvenaria_estrutural_armada: 2.5,
        alvenaria_nao_armada: 1.5
    };
    const R = rTable[p.structural_system] || 4.5;
    const I = { 'I': 0.8, 'II': 1.0, 'III': 1.25, 'IV': 1.5 }[p.importance_category] || 1.0;

    const Ta = p.user_period > 0 ? p.user_period : (0.0466 * Math.pow(p.total_height, 0.9));

    let Sa_elastic = 0;
    if (Ta < T0) {
        Sa_elastic = ag * Fa * (1.0 + 1.5 * (Ta / T0));
    } else if (Ta <= Ts) {
        Sa_elastic = 2.5 * ag * Fa;
    } else {
        Sa_elastic = 2.5 * ag * Fv / Ta;
    }

    const Cs = Math.max(0.01, (Sa_elastic * I) / R);
    const V0 = Cs * p.total_weight;

    const k = Ta <= 0.5 ? 1.0 : (Ta >= 2.5 ? 2.0 : (1.0 + (Ta - 0.5) / 2.0));
    const floorH = p.total_height / p.num_floors;
    const floorW = p.total_weight / p.num_floors;

    let sum_whk = 0;
    for (let fl = 1; fl <= p.num_floors; fl++) {
        sum_whk += floorW * Math.pow(fl * floorH, k);
    }

    const levels = [];
    let cumShear = 0;
    let totalMom = 0;

    for (let fl = p.num_floors; fl >= 1; fl--) {
        const z = fl * floorH;
        const cvx = (floorW * Math.pow(z, k)) / sum_whk;
        const fx = cvx * V0;
        cumShear += fx;
        const mom = fx * z;
        totalMom += mom;

        levels.push({
            floor: fl,
            height_m: z.toFixed(2),
            weight_kn: floorW.toFixed(1),
            cvx: cvx.toFixed(4),
            lateral_force_kn: fx.toFixed(2),
            story_shear_kn: cumShear.toFixed(2),
            overturning_moment_knm: mom.toFixed(2)
        });
    }

    const spectrum = [];
    for (let i = 1; i <= 60; i++) {
        const t = (i * 0.05);
        let sa_e = 0;
        if (t < T0) sa_e = ag * Fa * (1 + 1.5 * t / T0);
        else if (t <= Ts) sa_e = 2.5 * ag * Fa;
        else sa_e = 2.5 * ag * Fv / t;
        spectrum.push({ T: t.toFixed(2), Sa_elastic: sa_e.toFixed(4), Sa_design: Math.max(0.01, (sa_e * I) / R).toFixed(4) });
    }

    return {
        status: 'success',
        parameters: {
            seismic_zone: p.seismic_zone,
            ag: ag, Fa: Fa, Fv: Fv, T0: T0.toFixed(3), Ts: Ts.toFixed(3),
            R: R, I: I, Ta: Ta.toFixed(3),
            dispensado_nbr: (p.seismic_zone === '0' && ag <= 0.025)
        },
        results: {
            Sa_Ta_g: Sa_elastic.toFixed(4),
            Cs_design: Cs.toFixed(4),
            base_shear_kn: V0.toFixed(2),
            base_moment_knm: totalMom.toFixed(2)
        },
        levels: levels,
        spectrum: spectrum
    };
}

function renderNbrSeismicResults(res) {
    const p = res.parameters;
    const r = res.results;

    calculatedStore.seismic.base_shear = parseFloat(r.base_shear_kn);
    calculatedStore.seismic.overturning_moment = parseFloat(r.base_moment_knm);
    calculatedStore.seismic.cs = parseFloat(r.Cs_design);
    calculatedStore.seismic.ta = parseFloat(p.Ta);

    // Alerta de dispensa
    const dispAlert = document.getElementById('nbr-seismic-dispensation-alert');
    if (dispAlert) {
        dispAlert.style.display = p.dispensado_nbr ? 'flex' : 'none';
    }

    // KPIs
    document.getElementById('kpi-nbr-seis-v0').textContent = r.base_shear_kn;
    const totalW = parseFloat(document.getElementById('nbr_seismic_weight').value) || 15000;
    const pct = ((parseFloat(r.base_shear_kn) / totalW) * 100).toFixed(1);
    document.getElementById('kpi-nbr-seis-v0-pct').textContent = `${pct}% do Peso W`;

    document.getElementById('kpi-nbr-seis-cs').textContent = r.Cs_design;
    document.getElementById('kpi-nbr-seis-ta').textContent = p.Ta;
    document.getElementById('kpi-nbr-seis-ts').textContent = `Ts = ${p.Ts} s`;
    document.getElementById('kpi-nbr-seis-moment').textContent = r.base_moment_knm;

    // Tabela
    const tbody = document.getElementById('nbr-seismic-floors-tbody');
    if (tbody && res.levels) {
        tbody.innerHTML = res.levels.map(l => `
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td class="p-2 font-bold">${l.floor}º Pav.</td>
                <td class="p-2">${l.height_m} m</td>
                <td class="p-2">${l.weight_kn}</td>
                <td class="p-2">${l.cvx}</td>
                <td class="p-2 font-bold text-purple-600 dark:text-purple-400">${l.lateral_force_kn}</td>
                <td class="p-2">${l.story_shear_kn}</td>
                <td class="p-2">${l.overturning_moment_knm}</td>
            </tr>
        `).join('');
    }

    // Gráfico de espectro
    renderNbrSeismicChart(res.spectrum || [], p.Ta, r.Sa_Ta_g);
}

function renderNbrSeismicChart(spectrum, taVal, saVal) {
    const ctx = document.getElementById('nbrSeismicChart');
    if (!ctx) return;

    const labels = spectrum.map(s => `${s.T}s`);
    const saElastic = spectrum.map(s => s.Sa_elastic);
    const saDesign = spectrum.map(s => s.Sa_design);

    if (nbrSeismicChartInstance) {
        nbrSeismicChartInstance.destroy();
    }

    nbrSeismicChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Espectro Elástico Sa (g)',
                    data: saElastic,
                    borderColor: '#9333ea',
                    backgroundColor: 'rgba(147, 51, 234, 0.08)',
                    fill: true,
                    tension: 0.2
                },
                {
                    label: 'Espectro de Projeto Sa,d (g)',
                    data: saDesign,
                    borderColor: '#2563eb',
                    fill: false,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } }
            },
            scales: {
                x: { title: { display: true, text: 'Período T (s)', font: { size: 10 } } },
                y: { title: { display: true, text: 'Aceleração Espectral Sa (g)', font: { size: 10 } } }
            }
        }
    });
}

function exportNbrSeismicTableCsv() {
    let csv = "Pavimento;Altura_m;Peso_kN;Cvx;Forca_Fx_kN;Cortante_Acumulado_kN;Momento_kNm\n";
    const rows = document.querySelectorAll('#nbr-seismic-floors-tbody tr');
    rows.forEach(tr => {
        const cols = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
        if (cols.length >= 7) {
            csv += cols.join(';') + '\n';
        }
    });
    downloadTextFile('sismo_nbr15421_pavimentos.csv', csv);
}

// ==============================================================================
// MÓDULO 3: CHUVA & EMPOÇAMENTO (NBR 6120 / NBR 10844)
// ==============================================================================

const NBR_RAIN_CITIES = {
    'São Paulo (SP)': 180,
    'Rio de Janeiro (RJ)': 195,
    'Belo Horizonte (MG)': 175,
    'Curitiba (PR)': 160,
    'Porto Alegre (RS)': 170,
    'Florianópolis (SC)': 175,
    'Brasília (DF)': 165,
    'Salvador (BA)': 185,
    'Recife (PE)': 190,
    'Belém (PA)': 210,
    'Manaus (AM)': 200
};

function onNbrRainCityChange() {
    const city = document.getElementById('nbr_rain_city').value;
    if (NBR_RAIN_CITIES[city]) {
        document.getElementById('nbr_rain_i').value = NBR_RAIN_CITIES[city];
    }
}

function toggleNbrDrainInputs() {
    const t = document.getElementById('nbr_rain_drain_type').value;
    document.getElementById('nbr_rain_scupper_group').style.display = (t === 'scupper') ? 'block' : 'none';
    document.getElementById('nbr_rain_drain_group').style.display = (t === 'drain') ? 'block' : 'none';
}

async function calculateNbrRain() {
    const payload = {
        intensity_mm_h: parseFloat(document.getElementById('nbr_rain_i').value) || 180.0,
        tributary_area_m2: parseFloat(document.getElementById('nbr_rain_area').value) || 250.0,
        static_head_ds_mm: parseFloat(document.getElementById('nbr_rain_ds').value) || 50.0,
        drain_type: document.getElementById('nbr_rain_drain_type').value,
        scupper_width_mm: parseFloat(document.getElementById('nbr_rain_scupper_w')?.value || 300),
        drain_diam_mm: parseFloat(document.getElementById('nbr_rain_drain_diam')?.value || 150),
        beam_span_m: parseFloat(document.getElementById('nbr_rain_span')?.value || 6.0),
        beam_spacing_m: parseFloat(document.getElementById('nbr_rain_spacing')?.value || 2.0),
        beam_inertia_cm4: parseFloat(document.getElementById('nbr_rain_inertia')?.value || 2500),
        elastic_modulus_gpa: parseFloat(document.getElementById('nbr_rain_emod')?.value || 200)
    };

    let result = null;
    if (typeof eel !== 'undefined' && typeof eel.calculate_nbr_rain === 'function') {
        try {
            result = await eel.calculate_nbr_rain(payload)();
        } catch (e) {
            console.warn('Erro backend chuva NBR:', e);
        }
    }

    if (!result || result.status !== 'success') {
        result = clientCalcRainNbr(payload);
    }

    renderNbrRainResults(result);
}

function clientCalcRainNbr(p) {
    const Q_m3s = (p.intensity_mm_h * p.tributary_area_m2) / (3.6e6);
    const Q_L_min = Q_m3s * 60000;

    let dh_mm = 0;
    if (p.drain_type === 'scupper') {
        const b = p.scupper_width_mm / 1000.0;
        dh_mm = 1000.0 * Math.pow(Q_m3s / (1.838 * b), 2.0 / 3.0);
    } else {
        const d = p.drain_diam_mm / 1000.0;
        const area = Math.PI * d * d / 4.0;
        dh_mm = 1000.0 * (Math.pow(Q_m3s, 2) / (2 * 9.81 * Math.pow(0.60 * area, 2)));
    }

    const hp_mm = p.static_head_ds_mm + dh_mm;
    const p_rain_kpa = 0.010 * hp_mm;

    // Deflexão
    const q_lin = p_rain_kpa * p.beam_spacing_m;
    const EI = (p.elastic_modulus_gpa * 1e6) * (p.beam_inertia_cm4 * 1e-8);
    const delta_m = (5 * q_lin * Math.pow(p.beam_span_m, 4)) / (384 * EI);
    const delta_mm = delta_m * 1000;
    const ponding_ratio = (10 * p.beam_spacing_m * Math.pow(p.beam_span_m, 4)) / (Math.pow(Math.PI, 4) * EI);

    const warnings = [];
    if (dh_mm > p.static_head_ds_mm) {
        warnings.append ? warnings.append("dh > ds") : warnings.push("Lâmina hidráulica dh maior que soleira ds.");
    }

    return {
        status: 'success',
        parameters: {
            flow_rate_L_min: Q_L_min.toFixed(1),
            flow_rate_m3s: Q_m3s.toFixed(5),
            static_head_ds_mm: p.static_head_ds_mm.toFixed(1),
            hydraulic_head_dh_mm: dh_mm.toFixed(1),
            total_head_hp_mm: hp_mm.toFixed(1)
        },
        results: {
            rain_pressure_kpa: p_rain_kpa.toFixed(3),
            rain_pressure_kgf_m2: (p_rain_kpa * 100).toFixed(1),
            deflection_mm: delta_mm.toFixed(2),
            ponding_ratio: ponding_ratio.toFixed(3),
            ponding_stable: ponding_ratio < 0.60
        },
        warnings: warnings
    };
}

function renderNbrRainResults(res) {
    const p = res.parameters;
    const r = res.results;

    calculatedStore.rain.nominal_pressure = parseFloat(r.rain_pressure_kpa);
    calculatedStore.rain.total_head = parseFloat(p.total_head_hp_mm);

    document.getElementById('kpi-nbr-rain-hp').textContent = p.total_head_hp_mm;
    document.getElementById('kpi-nbr-rain-heads').textContent = `ds (${p.static_head_ds_mm}) + dh (${p.hydraulic_head_dh_mm})`;

    document.getElementById('kpi-nbr-rain-load').textContent = r.rain_pressure_kpa;
    document.getElementById('kpi-nbr-rain-load-kgf').textContent = `${r.rain_pressure_kgf_m2} kgf/m²`;

    document.getElementById('kpi-nbr-rain-flow').textContent = p.flow_rate_L_min;
    document.getElementById('kpi-nbr-rain-flow-m3s').textContent = `${p.flow_rate_m3s} m³/s`;

    const stabEl = document.getElementById('kpi-nbr-rain-stability');
    if (r.ponding_stable) {
        stabEl.textContent = 'ESTÁVEL';
        stabEl.className = 'text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1';
    } else {
        stabEl.textContent = 'RISCO PONDING';
        stabEl.className = 'text-xl font-extrabold text-red-600 dark:text-red-400 mt-1';
    }
    document.getElementById('kpi-nbr-rain-deflection').textContent = `Flecha: ${r.deflection_mm} mm (Ratio: ${r.ponding_ratio})`;

    // Alertas
    const alertsBox = document.getElementById('nbr-rain-alerts-container');
    if (alertsBox) {
        if (!r.ponding_stable) {
            alertsBox.innerHTML = `
                <div class="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-900 dark:text-red-200">
                    <strong>⚠️ Perigo de Colapso por Empoçamento:</strong> O índice de flexibilidade (${r.ponding_ratio}) excede 0.60. Aumente a inércia da viga ou diminua o vão.
                </div>
            `;
        } else {
            alertsBox.innerHTML = '';
        }
    }
}

// ==============================================================================
// MÓDULO 4: NEVE & COBERTURA (NBR 6120)
// ==============================================================================

function onSnowNormSelectorChange() {
    const val = document.getElementById('snow_norm_selector').value;
    const nbrBox = document.getElementById('nbr_snow_box');
    const asceBox = document.getElementById('asce-snow-embed-box');

    if (val === 'nbr') {
        if (nbrBox) nbrBox.style.display = 'block';
        if (asceBox) asceBox.style.display = 'none';
    } else {
        if (nbrBox) nbrBox.style.display = 'none';
        if (asceBox) asceBox.style.display = 'block';
    }
}

function calculateNbrRoofLive() {
    const usage = document.getElementById('nbr_roof_usage').value;
    const hail = document.getElementById('nbr_hail_toggle').value;

    const usageLoads = { manutencao: 0.25, placas_solares: 0.50, terraco: 1.50, heliponto: 3.00 };
    const hailLoads = { none: 0.0, low: 0.50, high: 1.00 };

    const q_live = usageLoads[usage] || 0.25;
    const q_hail = hailLoads[hail] || 0.0;
    const total = q_live + q_hail;

    calculatedStore.roof_live.total_load = total;

    document.getElementById('kpi-roof-live-val').textContent = q_live.toFixed(2);
    document.getElementById('kpi-roof-total-val').textContent = total.toFixed(2);
}

// ==============================================================================
// MÓDULO 6: COMBINAÇÕES DE AÇÕES & INTEGRAÇÃO CRUZADA
// ==============================================================================

function renderLoadCasesTable() {
    const tbody = document.getElementById('combos-load-cases-tbody');
    if (!tbody) return;

    tbody.innerHTML = loadCases.map((c, idx) => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="p-2 font-bold">${c.name}</td>
            <td class="p-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${c.type === 'permanent' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}">
                    ${c.type === 'permanent' ? 'Permanente' : 'Variável'}
                </span>
            </td>
            <td class="p-2">
                <input type="number" value="${c.value}" step="1" onchange="updateLoadCaseValue(${idx}, this.value)" class="eng-input py-1 px-2 text-xs w-28">
            </td>
            <td class="p-2">${c.gamma_unfav}</td>
            <td class="p-2">${c.psi0}</td>
            <td class="p-2">${c.psi1}</td>
            <td class="p-2">${c.psi2}</td>
            <td class="p-2 text-gray-500">${c.xorGroup || '-'}</td>
            <td class="p-2 text-center">
                <button type="button" onclick="removeLoadCase(${idx})" class="text-red-500 hover:text-red-700 font-bold px-1.5 py-0.5 rounded">✕</button>
            </td>
        </tr>
    `).join('');
}

function updateLoadCaseValue(idx, val) {
    if (loadCases[idx]) {
        loadCases[idx].value = parseFloat(val) || 0;
    }
}

function removeLoadCase(idx) {
    loadCases.splice(idx, 1);
    renderLoadCasesTable();
}

function addCustomLoadRow() {
    const name = prompt("Nome da nova ação (ex: Ponte Rolante, Recalque):", "Sobrecarga Especial");
    if (!name) return;
    const val = parseFloat(prompt("Valor característico da ação (kN ou kN/m²):", "20.0")) || 20.0;

    loadCases.push({
        id: `VAR_${Date.now()}`,
        name: name,
        type: 'variable',
        value: val,
        gamma_fav: 0.0,
        gamma_unfav: 1.4,
        psi0: 0.70,
        psi1: 0.60,
        psi2: 0.40,
        xorGroup: ''
    });

    renderLoadCasesTable();
}

function sendActiveLoadToCombos() {
    importActiveLoadsIntoTable();
    switchStudioTab('combos');
    runUniversalCombinations();
}

function importActiveLoadsIntoTable() {
    // Atualiza ou insere cargas de vento
    if (calculatedStore.wind.base_shear > 0) {
        const vPos = loadCases.find(c => c.id === 'VENTO_POS');
        if (vPos) vPos.value = round(calculatedStore.wind.base_shear, 1);

        const vNeg = loadCases.find(c => c.id === 'VENTO_NEG');
        if (vNeg) vNeg.value = -round(calculatedStore.wind.base_shear * 0.7, 1);
    }

    // Insere ou atualiza Sismo
    if (calculatedStore.seismic.base_shear > 0) {
        let seis = loadCases.find(c => c.id === 'SISMO_NBR');
        if (!seis) {
            loadCases.push({
                id: 'SISMO_NBR',
                name: 'Ação Sísmica NBR 15421 (E)',
                type: 'variable',
                value: round(calculatedStore.seismic.base_shear, 1),
                gamma_fav: 0.0,
                gamma_unfav: 1.0,
                psi0: 1.0,
                psi1: 1.0,
                psi2: 0.30,
                xorGroup: 'SEIS'
            });
        } else {
            seis.value = round(calculatedStore.seismic.base_shear, 1);
        }
    }

    // Insere ou atualiza Chuva
    if (calculatedStore.rain.nominal_pressure > 0) {
        let rain = loadCases.find(c => c.id === 'CHUVA_NBR');
        if (!rain) {
            loadCases.push({
                id: 'CHUVA_NBR',
                name: 'Empoçamento Pluvial NBR 6120 (R)',
                type: 'variable',
                value: round(calculatedStore.rain.nominal_pressure * 20.0, 1), // multiplicado por área ou força
                gamma_fav: 0.0,
                gamma_unfav: 1.4,
                psi0: 0.60,
                psi1: 0.40,
                psi2: 0.00,
                xorGroup: ''
            });
        } else {
            rain.value = round(calculatedStore.rain.nominal_pressure * 20.0, 1);
        }
    }

    renderLoadCasesTable();
    alert("✅ Cargas calculadas nas abas de Vento, Sismo e Chuva foram integradas à tabela de Combinações!");
}

async function runUniversalCombinations() {
    const permCases = loadCases.filter(c => c.type === 'permanent');
    const varCases = loadCases.filter(c => c.type === 'variable');

    generatedCombinations = [];

    // 1. ELU Normal (Combinações com cada variável como principal)
    varCases.forEach((mainVar, idx) => {
        let formula = '';
        let total = 0;

        // Permanentes
        permCases.forEach(p => {
            const term = p.gamma_unfav * p.value;
            total += term;
            formula += `${p.gamma_unfav}·${p.name} + `;
        });

        // Variável principal
        const mainTerm = mainVar.gamma_unfav * mainVar.value;
        total += mainTerm;
        formula += `${mainVar.gamma_unfav}·${mainVar.name}`;

        // Acompanhantes
        varCases.forEach((secVar, sIdx) => {
            if (sIdx !== idx && (!secVar.xorGroup || secVar.xorGroup !== mainVar.xorGroup)) {
                const secTerm = secVar.gamma_unfav * secVar.psi0 * secVar.value;
                total += secTerm;
                formula += ` + ${secVar.gamma_unfav}·${secVar.psi0}·${secVar.name}`;
            }
        });

        generatedCombinations.push({
            id: `ELU_${idx + 1}`,
            state: 'ELU Normal',
            main: mainVar.name,
            formula: formula,
            value: round(total, 2)
        });
    });

    // 2. ELS Quase Permanente
    let qpTotal = 0;
    let qpFormula = '';
    permCases.forEach(p => {
        qpTotal += p.value;
        qpFormula += `1.0·${p.name} + `;
    });
    varCases.forEach(v => {
        qpTotal += v.psi2 * v.value;
        qpFormula += `${v.psi2}·${v.name} + `;
    });
    qpFormula = qpFormula.replace(/\s\+\s$/, '');
    generatedCombinations.push({
        id: 'ELS_QP_1',
        state: 'ELS Quase-Perm.',
        main: 'Ações de Longa Duração',
        formula: qpFormula,
        value: round(qpTotal, 2)
    });

    // 3. ELS Frequente
    varCases.forEach((mainVar, idx) => {
        let fTotal = 0;
        let fFormula = '';
        permCases.forEach(p => {
            fTotal += p.value;
            fFormula += `1.0·${p.name} + `;
        });
        fTotal += mainVar.psi1 * mainVar.value;
        fFormula += `${mainVar.psi1}·${mainVar.name}`;

        varCases.forEach((secVar, sIdx) => {
            if (sIdx !== idx) {
                fTotal += secVar.psi2 * secVar.value;
                fFormula += ` + ${secVar.psi2}·${secVar.name}`;
            }
        });

        generatedCombinations.push({
            id: `ELS_FREQ_${idx + 1}`,
            state: 'ELS Frequente',
            main: mainVar.name,
            formula: fFormula,
            value: round(fTotal, 2)
        });
    });

    renderCombosResults();
}

function renderCombosResults() {
    const tbody = document.getElementById('combos-results-tbody');
    if (!tbody) return;

    if (generatedCombinations.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-gray-400">Nenhuma combinação gerada.</td></tr>`;
        return;
    }

    tbody.innerHTML = generatedCombinations.map(c => `
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
            <td class="p-2 font-mono font-bold text-xs">${c.id}</td>
            <td class="p-2">
                <span class="px-2 py-0.5 rounded text-[10px] font-bold ${c.state.includes('ELU') ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'}">
                    ${c.state}
                </span>
            </td>
            <td class="p-2 font-medium">${c.main}</td>
            <td class="p-2 text-gray-600 dark:text-gray-400 text-[11px] font-mono">${c.formula}</td>
            <td class="p-2 font-bold text-blue-600 dark:text-blue-400 text-xs">${c.value}</td>
        </tr>
    `).join('');

    // KPIs
    const eluCombos = generatedCombinations.filter(c => c.state.includes('ELU'));
    const elsCombos = generatedCombinations.filter(c => c.state.includes('ELS'));

    document.getElementById('kpi-count-elu').textContent = eluCombos.length;
    document.getElementById('kpi-count-els').textContent = elsCombos.length;

    if (eluCombos.length > 0) {
        const values = eluCombos.map(c => c.value);
        document.getElementById('kpi-envelope-max').textContent = `${Math.max(...values).toFixed(2)}`;
        document.getElementById('kpi-envelope-min').textContent = `${Math.min(...values).toFixed(2)}`;
    }
}

function exportCombosExcel() {
    let csv = "ID;Estado_Limite;Acao_Principal;Equacao_Fatorada;Valor_Resultante\n";
    generatedCombinations.forEach(c => {
        csv += `"${c.id}";"${c.state}";"${c.main}";"${c.formula}";${c.value}\n`;
    });
    downloadTextFile('combinacoes_de_acoes_nbr8681.csv', csv);
}

// Utilitários de Estado
function saveProjectState() {
    const data = {
        standard: currentStandard,
        tab: currentTab,
        loadCases: loadCases,
        calculatedStore: calculatedStore
    };
    localStorage.setItem('loads_studio_project', JSON.stringify(data));
    alert("💾 Projeto de Cargas & Ações salvo localmente!");
}

function loadProjectState() {
    const raw = localStorage.getItem('loads_studio_project');
    if (!raw) {
        alert("Nenhum projeto salvo anteriormente encontrado.");
        return;
    }
    try {
        const data = JSON.parse(raw);
        if (data.standard) setStandard(data.standard);
        if (data.tab) switchStudioTab(data.tab);
        if (data.loadCases) {
            loadCases = data.loadCases;
            renderLoadCasesTable();
        }
        runUniversalCombinations();
        alert("📂 Projeto de Cargas & Ações carregado com sucesso!");
    } catch (e) {
        alert("Erro ao ler dados salvos.");
    }
}

function round(val, digits = 2) {
    return Number(Math.round(val + 'e' + digits) + 'e-' + digits);
}

function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}
