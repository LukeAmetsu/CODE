/**
 * Single Angle Support Calculator
 * Logic: Masonry Anchors (DeWalt AC100+ Gold)
 * Interaction: Linear (v/V + t/T <= 1.0)
 * Note: Tension is calculated as Reaction / N_bolts per user specification.
 */

// --- Updated Database: DeWalt AC100+ Gold in Brick Masonry ---
// Source: User Provided Table (Face of Brick)
const MASONRY_TABLE = {
    "0.375": [
        { h_nom: 3.5, end: 2.5, T_allow: 720, V_allow: 900 },
        { h_nom: 3.5, end: 6.0, T_allow: 1170, V_allow: 915 }, // Using the conservative 6" end dist row for different values? Table has duplicate 3.5 with diff End Dist. 
        // Logic: Should probably pick the one based on End Distance available? 
        // User request: "add the user input for the allowable embedment". 
        // If user picks 3.5 embedment, which Capacity do we use? The lower one is safer (End 2.5). The higher one requires End=6. 
        // I will assume the user provides Embedment. I should probably show "3.5 (End 2.5")" and "3.5 (End 6")" in the dropdown?
        // Or simplified: Just store them and let dynamic logic handle it. 
        // For now, I'll distinguish by including End Dist in label or Just assume standard conservative? 
        // User table has: 
        // 1. 3/8, 3.5, End 2.5 --> T=720, V=900
        // 2. 3/8, 3.5, End 6.0 --> T=1170, V=915
        // 3. 3/8, 6.0, End 6.0 --> T=2085, V=915
        { h_nom: 3.5, end: 6.0, label: "3.5\" (High Capacity - Min End 6\")", T_allow: 1170, V_allow: 915 },
        { h_nom: 6.0, end: 6.0, T_allow: 2085, V_allow: 915 }
    ],
    "0.5": [
        { h_nom: 6.0, end: 8.0, T_allow: 2300, V_allow: 1860 }
    ],
    "0.625": [
        { h_nom: 3.125, end: 9.5, T_allow: 945, V_allow: 1540 },
        { h_nom: 6.0, end: 9.5, T_allow: 1985, V_allow: 1540 }
    ],
    // 3/4" in table? 
    // Table shows: 5/8 anchor uses 3/4 drill. 
    // Table does NOT show 3/4 anchor. 
    // Removing 3/4 option support from logic or mapping if needed. 
    // I will remove 3/4 from valid inputs in UI update or just return null.
};

// Flattened for easier Dropdown population (Diameter -> Options)
// We need to differentiate the two 3/8" @ 3.5" options.
// Option ID logic: "dia-embed-end"

document.addEventListener('DOMContentLoaded', () => {
    // Populate Initial Embedment
    updateEmbedmentOptions();

    // Attach event listener
    document.getElementById('calc-btn').addEventListener('click', calculateAngleSupport);
    document.getElementById('bolt_diameter').addEventListener('change', updateEmbedmentOptions);

    // Auto-calc on enter in inputs
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            if (input.id !== 'bolt_diameter') document.getElementById('results-area').classList.add('hidden');
        });
    });
});

function updateEmbedmentOptions() {
    const dia = document.getElementById('bolt_diameter').value;
    const embedSelect = document.getElementById('embedment');
    embedSelect.innerHTML = "";

    const options = MASONRY_TABLE[dia];
    if (!options) {
        // Handle case where diameter has no data (e.g. 3/4" was in old code but not new table)
        const opt = document.createElement('option');
        opt.text = "No Data";
        embedSelect.add(opt);
        return;
    }

    // Special handling for 3/8 duplicates
    // We will just list them all.
    options.forEach((entry, idx) => {
        const opt = document.createElement('option');
        // If label exists use it, else format standard
        if (entry.label) {
            opt.text = entry.label;
        } else {
            opt.text = `${entry.h_nom}" (Min End ${entry.end}")`;
        }
        opt.value = idx; // Use index to retrieve full object later
        embedSelect.add(opt);
    });
}

function calculateAngleSupport() {
    // 1. Get Inputs
    const L = parseFloat(document.getElementById('beam_span').value) || 0;
    const spacing = parseFloat(document.getElementById('beam_spacing').value) || 0;
    const areaLoad = parseFloat(document.getElementById('area_load').value) || 0;

    const nBolts = parseInt(document.getElementById('num_bolts').value) || 1;
    const dia = document.getElementById('bolt_diameter').value;
    const embedIdx = parseInt(document.getElementById('embedment').value);

    const legSize = parseFloat(document.getElementById('angle_leg').value) || 4;
    const t = parseFloat(document.getElementById('angle_thick').value) || 0.375;
    const userAngleLen = parseFloat(document.getElementById('angle_len').value) || 8;
    const Fy = parseFloat(document.getElementById('angle_fy').value) || 36;
    const config = document.getElementById('angle_config').value; // single or double

    // 2. Calculate Demands
    // Linear Load w (klf) = (psf * ft) / 1000
    const w_klf = (areaLoad * spacing) / 1000;

    // Total Reaction V (kips) = w * L / 2 (Simply Supported)
    const V_total = (w_klf * L) / 2;

    // Side Configuration
    const num_angles = (config === 'double') ? 2 : 1;
    const V_angle = V_total / num_angles;
    const nBoltsTotal = nBolts;
    const nBoltsAngle = nBoltsTotal / num_angles;

    // Angle Bending Demand
    const e = legSize / 2;
    const Mu = V_angle * e; // k-in

    // Per Bolt Forces
    const v_bolt = V_angle / nBoltsAngle;
    let t_bolt = 0;
    if (config === 'single') {
        t_bolt = V_total / nBoltsTotal;
    } else {
        const T_force_angle = Mu / legSize;
        t_bolt = T_force_angle / nBoltsAngle;
    }

    // 3. Get Capacities
    const tableData = MASONRY_TABLE[dia];
    let anchor = null;
    if (tableData && tableData[embedIdx]) {
        anchor = tableData[embedIdx];
    }

    if (!anchor) {
        alert("Invalid anchor/embedment selection.");
        return;
    }

    // Convert capacities to Kips
    const V_allow = anchor.V_allow / 1000;
    const T_allow = anchor.T_allow / 1000;

    // 4. Check Interaction
    const ratio_v = v_bolt / V_allow;
    const ratio_t = t_bolt / T_allow;
    const interaction = ratio_v + ratio_t;

    // Check Bending
    // Z for angle leg (flat plate bending)
    const Z_plastic = (userAngleLen * Math.pow(t, 2)) / 4;
    const Mn = Fy * Z_plastic;
    // ASD Check: Ma = Mn / Omega (Omega = 1.67 for Yielding)
    const Ma_allow = Mn / 1.67;
    const ratio_bend = Mu / Ma_allow;

    // 5. Recommended Length Calculation
    // Note 3: "minimum of 16 anchor diameters on center"
    const reqSpacing = 16 * parseFloat(dia);
    const minEndDist = anchor.end;

    let recLength_calc = 0;
    if (nBoltsAngle <= 1) {
        recLength_calc = 2 * minEndDist;
    } else {
        recLength_calc = ((nBoltsAngle - 1) * reqSpacing) + (2 * minEndDist);
    }
    recLength_calc += 2.0; // Add 2" buffer per user request

    // Generate String
    const configStr = (config === 'double') ? "2L" : "L";
    const specString = `${configStr}${legSize}x${legSize}x${formatFraction(t)}x${recLength_calc.toFixed(1)}"`;

    // Overall Status
    const passAnchor = interaction <= 1.0;
    const passBend = ratio_bend <= 1.0;
    const passAll = passAnchor && passBend;

    renderResults({
        w_klf,
        V_total,
        v_bolt,
        t_bolt,
        V_allow,
        T_allow,
        ratio_v,
        ratio_t,
        interaction,
        anchor,
        e,
        Mu,
        Z_plastic,
        Ma_allow,
        ratio_bend,
        passAll,
        specString,
        recLength_calc,
        nBoltsTotal,
        nBoltsAngle
    });
}

// Helper for fractions
function formatFraction(val) {
    if (val === 0.125) return "1/8";
    if (val === 0.1875) return "3/16";
    if (val === 0.25) return "1/4";
    if (val === 0.3125) return "5/16";
    if (val === 0.375) return "3/8";
    if (val === 0.5) return "1/2";
    if (val === 0.625) return "5/8";
    if (val === 0.75) return "3/4";
    if (val === 1.0) return "1";
    return val;
}

function renderResults(data) {
    const resultsArea = document.getElementById('results-area');
    const quickStatus = document.getElementById('quick-status');
    const banner = document.getElementById('status-banner');
    const title = document.getElementById('status-title');
    const desc = document.getElementById('status-desc');
    const valDisplay = document.getElementById('interaction-value');

    resultsArea.classList.remove('hidden');

    // Update Banner Style
    let statusText = "";
    if (data.passAll) {
        banner.className = "p-6 rounded-lg shadow-md border-l-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-green-50 dark:bg-green-900/20 border-green-500 text-green-900 dark:text-green-100";
        title.textContent = "PASS";
        title.className = "text-2xl font-bold text-green-700 dark:text-green-400";
        desc.textContent = "Capacity is sufficient.";

        statusText = "PASS";
        quickStatus.className = "mt-4 text-center p-3 rounded font-bold bg-green-100 text-green-800";
    } else {
        banner.className = "p-6 rounded-lg shadow-md border-l-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-100";
        title.textContent = "FAIL";
        title.className = "text-2xl font-bold text-red-700 dark:text-red-400";

        let failReasons = [];
        if (data.interaction > 1.0) failReasons.push("Anchors");
        if (data.ratio_bend > 1.0) failReasons.push("Bending");
        desc.textContent = "Fail: " + failReasons.join(", ");

        statusText = "FAIL";
        quickStatus.className = "mt-4 text-center p-3 rounded font-bold bg-red-100 text-red-800";
    }

    // Show worst ratio in quick status
    const maxRatio = Math.max(data.interaction, data.ratio_bend);
    quickStatus.textContent = statusText + " (" + maxRatio.toFixed(2) + ")";

    quickStatus.classList.remove('hidden');
    valDisplay.textContent = maxRatio.toFixed(2);

    // Update Tables
    document.getElementById('res-w').textContent = data.w_klf.toFixed(2) + " klf";
    document.getElementById('res-reaction').textContent = data.V_total.toFixed(2) + " kips";
    document.getElementById('res-total-bolts').textContent = data.nBoltsTotal;
    document.getElementById('res-bolts-angle').textContent = data.nBoltsAngle;
    document.getElementById('res-v-bolt').textContent = data.v_bolt.toFixed(3) + " kips";
    document.getElementById('res-t-bolt').textContent = data.t_bolt.toFixed(3) + " kips";

    // Fix Diameter Display: Use the selected text from dropdown
    const diaSelect = document.getElementById('bolt_diameter');
    const diaText = diaSelect.options[diaSelect.selectedIndex].text;
    document.getElementById('res-dia').textContent = diaText;
    document.getElementById('res-embed').textContent = data.anchor.h_nom + '"';

    document.getElementById('res-v-allow').textContent = data.V_allow.toFixed(3) + " kips";
    document.getElementById('res-t-allow').textContent = data.T_allow.toFixed(3) + " kips";

    // Angle Bending Results
    document.getElementById('res-arm').textContent = data.e.toFixed(3) + " in";
    document.getElementById('res-mu').textContent = data.Mu.toFixed(2) + " k-in";
    document.getElementById('res-z').textContent = data.Z_plastic.toFixed(3) + " in³";
    document.getElementById('res-phimn').textContent = data.Ma_allow.toFixed(2) + " k-in";

    const ratioBendEl = document.getElementById('res-ratio-bend');
    ratioBendEl.textContent = data.ratio_bend.toFixed(2);
    if (data.ratio_bend > 1.0) {
        ratioBendEl.className = "py-2 text-right font-bold text-red-600";
    } else {
        ratioBendEl.className = "py-2 text-right font-bold text-green-600";
    }

    const specEl = document.getElementById('spec-string');
    if (specEl) specEl.textContent = data.specString;

    // Equation Terms
    document.getElementById('eq-v-term').textContent = data.ratio_v.toFixed(2);
    document.getElementById('eq-t-term').textContent = data.ratio_t.toFixed(2);
    document.getElementById('eq-total').textContent = data.interaction.toFixed(2);

    // Style the total equation number
    const eqTotalEl = document.getElementById('eq-total');
    if (data.interaction > 1.0) {
        eqTotalEl.classList.add('text-red-600');
        eqTotalEl.classList.remove('text-green-600', 'text-gray-800', 'dark:text-white');
    } else {
        eqTotalEl.classList.add('text-green-600');
        eqTotalEl.classList.remove('text-red-600', 'text-gray-800', 'dark:text-white');
    }
}