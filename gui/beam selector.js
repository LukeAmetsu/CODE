/**
 * Beam Selector Logic (AISC Table 3-10 Simulator)
 * Iterates through AISC W-Shapes to find the lightest section for a given Moment and Unbraced Length.
 * Supports LRFD, ASD, and OSHA (F.S.=4) design methods.
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

// --- SECURE IMPLEMENTATION ---
async function findLightestBeam() {
    // 1. Gather Inputs
    const method = document.getElementById('design_method').value; // LRFD, ASD, or OSHA
    const Fy = parseFloat(document.getElementById('Fy').value) || 50;
    const Lb_ft = parseFloat(document.getElementById('Lb').value) || 0;
    const Cb = parseFloat(document.getElementById('Cb').value) || 1.0;

    // Determine Required Moment (Frontend Logic)
    let M_req = parseFloat(document.getElementById('Mu_direct').value);
    let span_ft = 0;
    let w_load = 0;

    if (isNaN(M_req) || M_req === 0) {
        // Fallback to calculation
        span_ft = parseFloat(document.getElementById('span_calc').value) || 0;
        w_load = parseFloat(document.getElementById('w_load').value) || 0;
        M_req = (w_load * span_ft * span_ft) / 8;
    }

    const maxDepth = parseFloat(document.getElementById('max_depth').value);

    const inputs = {
        design_method: method,
        fy: Fy,
        lb_ft: Lb_ft,
        cb: Cb,
        mu_req: M_req,
        span_ft: span_ft,
        w_load: w_load,
        max_depth: maxDepth
    };

    // 2. Call Python Backend (Eel)
    try {
        console.log("Calling Eel...");
        const validCandidates = await eel.find_lightest_beam(inputs)();

        if (validCandidates && validCandidates.error) {
            alert("Calculation Error: " + validCandidates.error);
            return;
        }

        // 3. Render
        // Keys from Python need to match renderResults expectation
        requestAnimationFrame(() => {
            renderResults(validCandidates, M_req);
        });

    } catch (e) {
        console.error(e);
        alert("Failed to connect to calculation server (Eel). Ensure main_eel.py is running.");
    }
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
            <td class="px-6 py-4 text-gray-600 dark:text-gray-400">${beam.Mp.toFixed(1)}</td>
            <td class="px-6 py-4 text-gray-600 dark:text-gray-400">${beam.Mr.toFixed(1)}</td>
            <td class="px-6 py-4 text-xs text-gray-500">
                ${beam.Lp.toFixed(1)} / ${beam.Lr.toFixed(1)}
            </td>
            <td class="px-6 py-4 text-xs text-gray-500">
                ${beam.Ix}
            </td>
        </tr>
    `).join('');
}