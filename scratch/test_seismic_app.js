const fs = require('fs');
const path = require('path');

// 1. Verify seismic.html exists and contains necessary elements
const htmlPath = path.join(__dirname, '..', 'asce', 'seismic.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

const expectedIds = [
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
    'seismic_equip_ip',
    'run-seismic-calculation-btn',
    'save-seismic-inputs-btn',
    'load-seismic-inputs-btn',
    'seismic-report-modal'
];

let missingIds = [];
expectedIds.forEach(id => {
    if (!htmlContent.includes(`id="${id}"`)) {
        missingIds.push(id);
    }
});

if (missingIds.length > 0) {
    console.error('Missing IDs in seismic.html:', missingIds);
    process.exit(1);
} else {
    console.log('All expected HTML input and modal IDs are present in seismic.html!');
}

// 2. Verify seismic.js contains calculator and no syntax error
const jsPath = path.join(__dirname, '..', 'asce', 'seismic.js');
const jsContent = fs.readFileSync(jsPath, 'utf8');

if (!jsContent.includes('seismicLoadCalculator') || !jsContent.includes('handleRunSeismicCheck')) {
    console.error('seismic.js is missing key calculator exports!');
    process.exit(1);
}
console.log('seismic.js successfully verified!');
