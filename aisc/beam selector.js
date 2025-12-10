/**
 * Beam Selector Logic (AISC Table 3-10 Simulator)
 * Iterates through AISC W-Shapes to find the lightest section for a given Moment and Unbraced Length.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Input Event Listeners for Real-time Calculation Preview
    const calcInputs = ['span_calc', 'w_load'];
    calcInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', updateMomentPreview);
    });

    // Depth Checkbox Toggle
    const depthCheck = document.getElementById('depth_limit_check');
    const maxDepthInput = document.getElementById('max_depth');
    depthCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            maxDepthInput.classList.remove('hidden');
        } else {
            maxDepthInput.classList.add('hidden');
        }
    });

    // Main Run Button
    document.getElementById('run-selector-btn').addEventListener('click', findLightestBeam);

    // Initial Preview
    updateMomentPreview();
});

function updateMomentPreview() {
    const L = parseFloat(document.getElementById('span_calc').value) || 0;
    const w = parseFloat(document.getElementById('w_load').value) || 0;
    const M = (w * L * L) / 8;
    document.getElementById('moment_preview').textContent = M.toFixed(1);
}

async function findLightestBeam() {
    // 1. Gather Inputs
    const method = document.getElementById('design_method').value; // LRFD or ASD
    const Fy = parseFloat(document.getElementById('Fy').value) || 50;
    const E = 29000;
    const Lb_ft = parseFloat(document.getElementById('Lb').value) || 0;
    const Lb_in = Lb_ft * 12;
    const Cb = parseFloat(document.getElementById('Cb').value) || 1.0;

    // Determine Required Moment
    let M_req = parseFloat(document.getElementById('Mu_direct').value);
    console.log("Raw Mu_direct value:", document.getElementById('Mu_direct').value);
    console.log("Parsed M_req (direct):", M_req);

    if (isNaN(M_req) || M_req === 0) {
        // Fallback to calculation
        const L = parseFloat(document.getElementById('span_calc').value) || 0;
        const w = parseFloat(document.getElementById('w_load').value) || 0;
        console.log(`Fallback calculation inputs - L: ${L}, w: ${w}`);
        M_req = (w * L * L) / 8;
        console.log("Calculated M_req:", M_req);
    }

    // Depth Limit
    const useDepthLimit = document.getElementById('depth_limit_check').checked;
    const maxDepth = parseFloat(document.getElementById('max_depth').value);

    // 2. Fetch Database
    // Using the shared AISC_SPEC utility if available, otherwise direct access
    let shapes = {};
    if (typeof AISC_SPEC !== 'undefined' && AISC_SPEC.getShapesByType) {
        shapes = await AISC_SPEC.getShapesByType('W-Shape');
    } else if (typeof AISC_SHAPES_DATABASE !== 'undefined') {
        // Fallback if database.js helper isn't loaded but the JSON is
        for (let key in AISC_SHAPES_DATABASE) {
            if (AISC_SHAPES_DATABASE[key].type === 'W-Shape') shapes[key] = AISC_SHAPES_DATABASE[key];
        }
    } else {
        alert("Database not loaded properly.");
        return;
    }

    const validCandidates = [];

    // 3. Iterate and Calculate
    for (const [name, props] of Object.entries(shapes)) {
        // Basic filtering
        if (useDepthLimit && props.d > maxDepth) continue;

        // Parse weight from name (e.g., W12X26 -> 26)
        const weight = parseFloat(name.split('X')[1]);
        if (isNaN(weight)) continue;

        // Ensure we have necessary props (some might be missing in simplified DBs)
        if (!props.Zx || !props.Sx || !props.ry || !props.J || !props.cw && props.cw !== 0) continue;

        // --- AISC F2 Calculation Logic ---

        // 1. Geometric Constants
        // rts calculation if missing (AISC Eq. F2-7)
        let rts = props.rts;
        if (!rts) {
            const ho = props.d - props.tf; // approx if ho missing
            rts = Math.sqrt(Math.sqrt(props.Iy * props.Cw) / props.Sx);
        }

        const ho = props.ho || (props.d - props.tf);
        const c = 1.0; // Doubly symmetric W-shape

        // 2. Calculate Lp (Eq. F2-5)
        const Lp_in = 1.76 * props.ry * Math.sqrt(E / Fy);
        const Lp_ft = Lp_in / 12;

        // 3. Calculate Lr (Eq. F2-6)
        const J = props.J;
        const Sx = props.Sx;

        const term1 = (J * c) / (Sx * ho);
        const term2 = Math.pow(term1, 2) + 6.76 * Math.pow(0.7 * Fy / E, 2);
        const Lr_in = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(term1 + Math.sqrt(term2));
        const Lr_ft = Lr_in / 12;

        // 4. Calculate Nominal Capacity Mn
        const Mp = Fy * props.Zx; // Plastic Moment (in-kips)
        let Mn = 0;
        let mode = "";

        if (Lb_in <= Lp_in) {
            // Zone 1: Plastic
            Mn = Mp;
            mode = "Plastic (Z1)";
        } else if (Lb_in <= Lr_in) {
            // Zone 2: Inelastic LTB
            // Mn = Cb [Mp - (Mp - 0.7FySx)((Lb-Lp)/(Lr-Lp))] <= Mp
            const Mr = 0.7 * Fy * Sx;
            const term = (Lb_in - Lp_in) / (Lr_in - Lp_in);
            Mn = Cb * (Mp - (Mp - Mr) * term);
            Mn = Math.min(Mn, Mp);
            mode = "Inelastic LTB (Z2)";
        } else {
            // Zone 3: Elastic LTB
            // Fcr = ...
            const fcr_term1 = (Cb * Math.PI * Math.PI * E) / Math.pow(Lb_in / rts, 2);
            const fcr_term2 = Math.sqrt(1 + 0.078 * (J * c / (Sx * ho)) * Math.pow(Lb_in / rts, 2));
            const Fcr = fcr_term1 * fcr_term2;

            // Limit Fcr to Mp stress equivalent isn't usually done here directly, 
            // but Mn cannot exceed Mp.
            Mn = Fcr * Sx;
            Mn = Math.min(Mn, Mp);
            mode = "Elastic LTB (Z3)";
        }

        // 5. Convert to Design Strength
        let capacity = 0; // in k-ft
        if (method === 'LRFD') {
            capacity = (0.9 * Mn) / 12;
        } else {
            capacity = (Mn / 1.67) / 12;
        }

        if (isNaN(capacity)) {
            console.warn(`NaN Capacity for ${name}. Mn: ${Mn}, method: ${method}, Fy: ${Fy}, Sx: ${props.Sx}, Zx: ${props.Zx}`);
        }

        // 6. Check Demand
        const ratio = M_req / capacity;

        if (capacity >= M_req) {
            validCandidates.push({
                name,
                weight,
                depth: props.d,
                capacity,
                ratio,
                Lp: Lp_ft,
                Lr: Lr_ft,
                mode,
                rawProp: props
            });
        }
    }

    // 4. Sort Results
    // Primary Sort: Weight (Ascending)
    // Secondary Sort: Depth (Ascending) for same weight
    validCandidates.sort((a, b) => {
        if (Math.abs(a.weight - b.weight) > 0.1) return a.weight - b.weight;
        return a.depth - b.depth;
    });

    // 5. Render
    renderResults(validCandidates, M_req);
}

function renderResults(candidates, demand) {
    const container = document.getElementById('results-container');
    const noResults = document.getElementById('no-results');
    const tbody = document.getElementById('results-body');
    const winnerName = document.getElementById('winner-name');
    const winnerStats = document.getElementById('winner-stats');
    const winnerRatio = document.getElementById('winner-ratio');

    if (candidates.length === 0) {
        container.classList.add('hidden');
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    container.classList.remove('hidden');

    // Top Result
    const winner = candidates[0];
    winnerName.textContent = winner.name;
    winnerStats.textContent = `Weight: ${winner.weight} lb/ft • Depth: ${winner.depth}" • Mode: ${winner.mode}`;
    winnerRatio.innerHTML = `<span class="text-green-600">${winner.capacity.toFixed(1)}</span> / <span class="text-gray-500">${demand.toFixed(1)}</span> k-ft <span class="text-xs ml-2 border px-1 rounded ${winner.ratio > 0.9 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">${(winner.ratio * 100).toFixed(1)}%</span>`;

    // Table Rows (Show Top 10)
    tbody.innerHTML = candidates.slice(0, 10).map((beam, index) => `
        <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 ${index === 0 ? 'bg-green-50 dark:bg-green-900/20' : ''}">
            <td class="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                ${beam.name} ${index === 0 ? '🏆' : ''}
            </td>
            <td class="px-6 py-4">${beam.weight}</td>
            <td class="px-6 py-4">${beam.depth}</td>
            <td class="px-6 py-4 font-bold text-blue-600 dark:text-blue-400">${beam.capacity.toFixed(1)}</td>
            <td class="px-6 py-4">
                <div class="flex items-center">
                    <div class="w-16 bg-gray-200 rounded-full h-1.5 dark:bg-gray-700 mr-2">
                        <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${Math.min(beam.ratio * 100, 100)}%"></div>
                    </div>
                    ${(beam.ratio).toFixed(2)}
                </div>
            </td>
            <td class="px-6 py-4 text-xs text-gray-500">
                ${beam.Lp.toFixed(1)} / ${beam.Lr.toFixed(1)}
            </td>
            <td class="px-6 py-4 text-xs italic">
                ${beam.mode}
            </td>
        </tr>
    `).join('');
}