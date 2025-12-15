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

// --- SECURE IMPLEMENTATION ---
async function calculateAngleSupport() {
    // 1. Get Inputs
    const inputs = {
        beam_span: parseFloat(document.getElementById('beam_span').value) || 0,
        beam_spacing: parseFloat(document.getElementById('beam_spacing').value) || 0,
        area_load: parseFloat(document.getElementById('area_load').value) || 0,
        num_bolts: parseInt(document.getElementById('num_bolts').value) || 1,
        bolt_diameter: document.getElementById('bolt_diameter').value,
        embedment_index: parseInt(document.getElementById('embedment').value),
        angle_leg: parseFloat(document.getElementById('angle_leg').value) || 4,
        angle_thick: parseFloat(document.getElementById('angle_thick').value) || 0.375,
        angle_len: parseFloat(document.getElementById('angle_len').value) || 8,
        angle_fy: parseFloat(document.getElementById('angle_fy').value) || 36,
        angle_config: document.getElementById('angle_config').value
    };

    // 2. Call Python Backend (Eel)
    try {
        console.log("Calling Eel...");
        // Eel function returns a promise
        const data = await eel.calculate_angle_support(inputs)();

        if (data.error) {
            alert("Calculation Error: " + data.error);
            return;
        }

        // 3. Render Results
        // Map Python keys to JS expectation
        if (data.anchor_details) data.anchor = data.anchor_details;
        if (data.spec_string) data.specString = data.spec_string;
        if (data.pass_all !== undefined) data.passAll = data.pass_all;

        renderResults(data);

    } catch (e) {
        console.error(e);
        alert("Failed to connect to calculation server (Eel). Ensure main_eel.py is running.");
    }
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