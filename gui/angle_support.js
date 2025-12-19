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
        { h_nom: 3.5, end: 6.0, T_allow: 1170, V_allow: 915 },
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

    document.getElementById('bolt_diameter').addEventListener('change', updateEmbedmentOptions);

    // Toggle Batch
    const batchBtn = document.getElementById('toggle-batch-btn');
    const batchSec = document.getElementById('batch-section');
    if (batchBtn) {
        batchBtn.addEventListener('click', () => {
            batchSec.classList.toggle('hidden');
            const isHidden = batchSec.classList.contains('hidden');
            batchBtn.querySelector('span').textContent = isHidden ? "▶ Batch Load Check (Optional)" : "▼ Batch Load Check (Optional)";
        });
    }

    // Auto-calc on enter in inputs
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        // Hide results on change
        input.addEventListener('change', () => {
            if (input.id !== 'bolt_diameter') document.getElementById('results-area').classList.add('hidden');
        });

        // Add blur listener for equation evaluation on text inputs
        if (input.type === 'text' || input.type === 'number') {
            input.addEventListener('blur', () => {
                const val = safeMathEval(input.value);
                if (val !== null) {
                    input.value = val % 1 !== 0 ? val.toFixed(3).replace(/\.?0+$/, '') : val;
                }
            });
        }
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
        beam_span: safeMathEval(document.getElementById('beam_span').value) || 0,
        beam_spacing: safeMathEval(document.getElementById('beam_spacing').value) || 0,
        area_load: safeMathEval(document.getElementById('area_load').value) || 0,
        num_bolts: Math.floor(safeMathEval(document.getElementById('num_bolts').value) || 1),
        bolt_diameter: document.getElementById('bolt_diameter').value,
        embedment_index: parseInt(document.getElementById('embedment').value),
        angle_leg: parseFloat(document.getElementById('angle_leg').value) || 4,
        angle_thick: parseFloat(document.getElementById('angle_thick').value) || 0.375,
        // angle_len removed
        angle_fy: safeMathEval(document.getElementById('angle_fy').value) || 36,
        angle_config: document.getElementById('angle_config').value,
        design_method: document.getElementById('angle_method').value
    };

    // Batch Input Parsing
    const batchText = document.getElementById('batch-input').value.trim();
    let batchLoads = [];
    if (batchText) {
        const lines = batchText.split('\n');
        lines.forEach(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                const s = safeMathEval(parts[0]);
                const l = safeMathEval(parts[1]);
                if (s !== null && l !== null) {
                    batchLoads.push({ span: s, load: l });
                }
            }
        });
    }
    if (batchLoads.length > 0) inputs.batch_loads = batchLoads;

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

        if (data.spec_string) data.specString = data.spec_string;
        if (data.pass_all !== undefined) data.passAll = data.pass_all;

        if (Array.isArray(data)) {
            renderBatchResults(data);
        } else {
            renderResults(data);
        }

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
        if (data.ratio_bend > 1.0) failReasons.push("Loc. Bend");
        if (data.ratio_long > 1.0) failReasons.push("Long. Bend");
        desc.textContent = "Fail: " + failReasons.join(", ");

        statusText = "FAIL";
        quickStatus.className = "mt-4 text-center p-3 rounded font-bold bg-red-100 text-red-800";
    }

    // Show worst ratio in quick status
    const maxRatio = Math.max(data.interaction, data.ratio_bend, data.ratio_long || 0);
    quickStatus.textContent = statusText + " (" + maxRatio.toFixed(2) + ")";

    quickStatus.classList.remove('hidden');
    valDisplay.textContent = maxRatio.toFixed(2);

    // Update Tables
    document.getElementById('res-w').textContent = data.w_klf.toFixed(2) + " klf";
    document.getElementById('res-reaction').textContent = data.V_total.toFixed(2) + " kips";
    document.getElementById('res-total-bolts').textContent = data.n_bolts_total;
    document.getElementById('res-bolts-angle').textContent = data.n_bolts_angle;
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

    // Longitudinal Bending Results
    document.getElementById('res-span-long').textContent = (data.span_long || 0).toFixed(2) + '"';
    document.getElementById('res-m-long').textContent = (data.M_long || 0).toFixed(2) + " k-in";
    document.getElementById('res-zx-long').textContent = (data.section_modulus || 0).toFixed(2) + " in³";
    document.getElementById('res-ma-long').textContent = (data.Ma_long_allow || 0).toFixed(2) + " k-in";

    const ratioLongEl = document.getElementById('res-ratio-long');
    const dlVal = data.ratio_long || 0;
    ratioLongEl.textContent = dlVal.toFixed(2);
    if (dlVal > 1.0) {
        ratioLongEl.className = "py-2 text-right font-bold text-red-600";
    } else {
        ratioLongEl.className = "py-2 text-right font-bold text-green-600";
    }

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

function renderBatchResults(data) {
    const container = document.getElementById('batch-results-container');
    const tbody = document.getElementById('batch-results-body');

    container.classList.remove('hidden');
    tbody.innerHTML = "";

    data.forEach(row => {
        if (row.error) return;

        const pass = row.pass;
        const ratio = row.max_ratio.toFixed(2);

        let resultHtml = pass ?
            '<span class="text-green-600 font-bold">PASS</span>' :
            '<span class="text-red-600 font-bold">FAIL</span>';

        let ratioHtml = `<span class="${pass ? 'text-green-600' : 'text-red-600'}">${ratio}</span>`;

        const tr = document.createElement('tr');
        tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600";
        tr.innerHTML = `
            <td class="px-4 py-2">${row.span.toFixed(2)}</td>
            <td class="px-4 py-2">${row.load.toFixed(2)}</td>
            <td class="px-4 py-2">${resultHtml}</td>
            <td class="px-4 py-2">${ratioHtml}</td>
        `;
        tbody.appendChild(tr);
    });

    // Scroll to batch results
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}