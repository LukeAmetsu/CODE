/**
 * Single Angle Support Calculator
 * Logic: Masonry Anchors (DeWalt AC100+ Gold)
 * Interaction: Linear (v/V + t/T <= 1.0)
 * Note: Tension is calculated as Reaction / N_bolts per user specification.
 */

// --- Simplified Database: DeWalt AC100+ Gold in Grout Filled Masonry ---
// Values are typical ALLOWABLE (ASD) loads for standard embedment depths.
// Source approximation: DeWalt Tech Manual for AC100+ Gold in Grout Filled CMU.
const DEWALT_MASONRY_DATA = {
    "0.375": {
        name: "3/8\"",
        embedment: 3.375,
        T_allow: 515, // lbs
        V_allow: 635  // lbs
    },
    "0.5": {
        name: "1/2\"",
        embedment: 4.5,
        T_allow: 885, // lbs
        V_allow: 1115 // lbs
    },
    "0.625": {
        name: "5/8\"",
        embedment: 5.625,
        T_allow: 1395, // lbs
        V_allow: 1815 // lbs
    },
    "0.75": {
        name: "3/4\"",
        embedment: 6.75,
        T_allow: 1850, // lbs
        V_allow: 2420 // lbs
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Attach event listener
    document.getElementById('calc-btn').addEventListener('click', calculateAngleSupport);

    // Auto-calc on enter in inputs
    const inputs = document.querySelectorAll('input, select');
    inputs.forEach(input => {
        input.addEventListener('change', () => {
            // Optional: Auto-calc or just clear results
            document.getElementById('results-area').classList.add('hidden');
        });
    });
});

function calculateAngleSupport() {
    // 1. Get Inputs
    const L = parseFloat(document.getElementById('beam_span').value) || 0;
    const spacing = parseFloat(document.getElementById('beam_spacing').value) || 0;
    const areaLoad = parseFloat(document.getElementById('area_load').value) || 0;

    const nBolts = parseInt(document.getElementById('num_bolts').value) || 1;
    const dia = document.getElementById('bolt_diameter').value;

    // 2. Calculate Demands
    // Linear Load w (klf) = (psf * ft) / 1000
    const w_klf = (areaLoad * spacing) / 1000;

    // Total Reaction V (kips) = w * L / 2 (Simply Supported)
    const V_total = (w_klf * L) / 2;

    // Per Bolt Forces (User Logic: T = V/n, V = V/n)
    const v_bolt = V_total / nBolts; // Shear per bolt
    const t_bolt = V_total / nBolts; // Tension per bolt (as requested)

    // 3. Get Capacities
    const anchor = DEWALT_MASONRY_DATA[dia];
    if (!anchor) {
        alert("Invalid bolt diameter selected.");
        return;
    }

    // Convert capacities to Kips for calculation
    const V_allow = anchor.V_allow / 1000;
    const T_allow = anchor.T_allow / 1000;

    // 4. Check Interaction
    // Linear Interaction: v/V + t/T <= 1.0
    const ratio_v = v_bolt / V_allow;
    const ratio_t = t_bolt / T_allow;
    const interaction = ratio_v + ratio_t;

    // 5. Render Results
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
        anchor
    });
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
    if (data.interaction <= 1.0) {
        banner.className = "p-6 rounded-lg shadow-md border-l-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-green-50 dark:bg-green-900/20 border-green-500 text-green-900 dark:text-green-100";
        title.textContent = "PASS";
        title.className = "text-2xl font-bold text-green-700 dark:text-green-400";
        desc.textContent = "Capacity is sufficient.";

        quickStatus.textContent = "PASS (" + data.interaction.toFixed(2) + ")";
        quickStatus.className = "mt-4 text-center p-3 rounded font-bold bg-green-100 text-green-800";
    } else {
        banner.className = "p-6 rounded-lg shadow-md border-l-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-red-50 dark:bg-red-900/20 border-red-500 text-red-900 dark:text-red-100";
        title.textContent = "FAIL";
        title.className = "text-2xl font-bold text-red-700 dark:text-red-400";
        desc.textContent = "Bolts are overstressed.";

        quickStatus.textContent = "FAIL (" + data.interaction.toFixed(2) + ")";
        quickStatus.className = "mt-4 text-center p-3 rounded font-bold bg-red-100 text-red-800";
    }

    quickStatus.classList.remove('hidden');
    valDisplay.textContent = data.interaction.toFixed(2);

    // Update Tables
    document.getElementById('res-w').textContent = data.w_klf.toFixed(2) + " klf";
    document.getElementById('res-reaction').textContent = data.V_total.toFixed(2) + " kips";
    document.getElementById('res-v-bolt').textContent = data.v_bolt.toFixed(3) + " kips";
    document.getElementById('res-t-bolt').textContent = data.t_bolt.toFixed(3) + " kips";

    document.getElementById('res-dia').textContent = data.anchor.name;
    document.getElementById('res-v-allow').textContent = data.V_allow.toFixed(3) + " kips";
    document.getElementById('res-t-allow').textContent = data.T_allow.toFixed(3) + " kips";

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