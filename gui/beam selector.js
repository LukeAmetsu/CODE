/**
 * Beam Selector Logic (AISC Table 3-10 Simulator)
 * Iterates through AISC W-Shapes to find the lightest section for a given Moment and Unbraced Length.
 * Supports LRFD, ASD, and OSHA (F.S.=4) design methods.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Input Event Listeners for Real-time Calculation Preview
    const calcInputs = ['span_calc', 'w_load', 'beam_spacing', 'area_load', 'Mu_direct', 'Lb', 'Fy', 'Cb', 'nominal_depth'];
    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Update preview on typing (keeps equation)
            el.addEventListener('input', updateMomentPreview);

            // Evaluate and replace with number on blur (loss of focus)
            el.addEventListener('blur', () => {
                const val = safeMathEval(el.value);
                if (val !== null) {
                    el.value = val % 1 !== 0 ? val.toFixed(3).replace(/\.?0+$/, '') : val; // Clean format
                    updateMomentPreview(); // Re-run preview with final number
                }
            });
        }
    });

    // Depth Checkbox Toggle
    const depthCheck = document.getElementById('depth_limit_check');
    const nominalDepthInput = document.getElementById('nominal_depth');
    depthCheck.addEventListener('change', (e) => {
        if (e.target.checked) {
            nominalDepthInput.classList.remove('hidden');
        } else {
            nominalDepthInput.classList.add('hidden');
        }
    });

    // Main Run Button
    document.getElementById('run-selector-btn').addEventListener('click', findLightestBeam);

    // Initial Preview
    updateMomentPreview();

    // Populate Desired Section Dropdown
    populateShapesDropdown();

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
});

async function populateShapesDropdown() {
    try {
        const shapes = await eel.get_w_shapes()();
        const select = document.getElementById('desired_section');
        shapes.forEach(shape => {
            const opt = document.createElement('option');
            opt.value = shape;
            opt.textContent = shape;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Failed to load shapes for dropdown", e);
    }
}

function updateMomentPreview(e) {
    // If Area Load & Spacing are present, update w_load
    const spacing = safeMathEval(document.getElementById('beam_spacing').value);
    const areaLoad = safeMathEval(document.getElementById('area_load').value);
    const wInput = document.getElementById('w_load');

    // Only update w_load if the trigger wasn't w_load itself (allow manual override)
    // And if we have valid inputs for calculation
    if (e && e.target.id !== 'w_load' && spacing !== null && areaLoad !== null) {
        // w (klf) = (psf * ft) / 1000
        const w = (areaLoad * spacing) / 1000;
        wInput.value = w.toFixed(2);
        wInput.classList.add('bg-gray-100', 'text-gray-600'); // Visual cue it's calculated
    } else if (e && e.target.id === 'w_load') {
        wInput.classList.remove('bg-gray-100', 'text-gray-600'); // Removed cue on manual edit
    }

    const L = safeMathEval(document.getElementById('span_calc').value) || 0;
    const w = safeMathEval(wInput.value) || 0;
    const M = (w * L * L) / 8;
    document.getElementById('moment_preview').textContent = M.toFixed(1);
}

// --- SECURE IMPLEMENTATION ---
async function findLightestBeam() {
    // 1. Gather Inputs
    const method = document.getElementById('design_method').value; // LRFD, ASD, or OSHA
    const Fy = safeMathEval(document.getElementById('Fy').value) || 50;
    const Lb_ft = safeMathEval(document.getElementById('Lb').value) || 0;
    const Cb = safeMathEval(document.getElementById('Cb').value) || 1.0;

    // Determine Required Moment (Frontend Logic)
    // Use safeMathEval to allow equations in Moment input
    let M_req = safeMathEval(document.getElementById('Mu_direct').value);
    let span_ft = 0;
    let w_load = 0;

    if (M_req === null || M_req === 0) {
        // Fallback to calculation
        span_ft = safeMathEval(document.getElementById('span_calc').value) || 0;
        w_load = safeMathEval(document.getElementById('w_load').value) || 0;
        M_req = (w_load * span_ft * span_ft) / 8;
    }

    const nominalDepth = safeMathEval(document.getElementById('nominal_depth').value);
    const checkDeflection = document.getElementById('check_deflection').checked;
    const desiredShape = document.getElementById('desired_section').value;

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

    const inputs = {
        design_method: method,
        fy: Fy,
        lb_ft: Lb_ft,
        cb: Cb,
        mu_req: M_req,
        span_ft: span_ft,
        w_load: w_load,
        nominal_depth: nominalDepth,
        desired_shape: desiredShape,
        check_deflection: checkDeflection,
        batch_loads: batchLoads.length > 0 ? batchLoads : null
    };

    // 2. Call Python Backend (Eel)
    try {
        console.log("Calling Eel...");
        const result = await eel.find_lightest_beam(inputs)();

        if (result && result.error) {
            alert("Calculation Error: " + result.error);
            return;
        }

        // 3. Render
        if (inputs.batch_loads) {
            renderBatchResults(result);
        } else {
            requestAnimationFrame(() => {
                renderResults(result, M_req);
            });
        }

    } catch (e) {
        console.error(e);
        alert("Failed to connect to calculation server (Eel). Ensure main_eel.py is running.");
    }
}

function renderResults(data, demand) {
    const container = document.getElementById('results-container');
    const noResults = document.getElementById('no-results');
    const tbody = document.getElementById('results-body');
    const winnerName = document.getElementById('winner-name');
    const winnerStats = document.getElementById('winner-stats');
    const winnerRatio = document.getElementById('winner-ratio');

    // Desired Section Elements
    const desiredBlock = document.getElementById('desired-result-block');
    const desiredName = document.getElementById('desired-name');
    const desiredStats = document.getElementById('desired-stats');
    const desiredRatio = document.getElementById('desired-ratio');
    const desiredStatus = document.getElementById('desired-status');

    // Handle Response Format (support old format just in case, though we updated backend)
    const candidates = Array.isArray(data) ? data : (data.candidates || []);
    const desired = data.desired; // Object or null

    if (candidates.length === 0 && !desired) {
        container.classList.add('hidden');
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');
    container.classList.remove('hidden');

    // Render Desired Result
    if (desired) {
        desiredBlock.classList.remove('hidden');
        desiredName.textContent = desired.name;
        desiredStats.textContent = `Weight: ${desired.weight} lb/ft • Depth: ${desired.depth}" • Mode: ${desired.mode}`;
        desiredRatio.innerHTML = `<span class="${desired.pass ? 'text-green-600' : 'text-red-600'}">${desired.capacity.toFixed(1)}</span> / <span class="text-gray-500">${demand.toFixed(1)}</span> k-ft <span class="text-xs ml-2 border px-1 rounded ${desired.ratio > 1.0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">${(desired.ratio * 100).toFixed(1)}%</span>`;

        if (desired.pass) {
            desiredStatus.textContent = "PASS";
            desiredStatus.className = "text-sm font-bold mt-1 text-green-600";
            desiredBlock.className = "bg-white dark:bg-gray-800 border-l-4 p-4 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 border-green-500";
        } else {
            desiredStatus.textContent = "FAIL";
            desiredStatus.className = "text-sm font-bold mt-1 text-red-600";
            desiredBlock.className = "bg-white dark:bg-gray-800 border-l-4 p-4 rounded shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 border-red-500";
        }
    } else {
        desiredBlock.classList.add('hidden');
    }

    if (candidates.length > 0) {
        const winner = candidates[0];
        winnerName.textContent = winner.name;
        winnerStats.textContent = `Weight: ${winner.weight} lb/ft • Depth: ${winner.depth}" • Mode: ${winner.mode}`;
        winnerRatio.innerHTML = `<span class="text-green-600">${winner.capacity.toFixed(1)}</span> / <span class="text-gray-500">${demand.toFixed(1)}</span> k-ft <span class="text-xs ml-2 border px-1 rounded ${winner.ratio > 0.9 ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}">${(winner.ratio * 100).toFixed(1)}%</span>`;
    } else {
        // No candidates found (but desired might have failed)
        winnerName.textContent = "No Valid Shape Found";
        winnerStats.textContent = "All shapes either failed capacity or depth limits.";
        winnerRatio.textContent = "--";
    }

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
            <td class="px-6 py-4 text-xs">
                ${beam.deflection > 0 ?
            `<div title="Limit: ${beam.defl_limit.toFixed(2)} in">${beam.deflection.toFixed(3)}"</div>
                     <div class="text-[10px] ${beam.defl_ratio > 1 ? 'text-red-500 font-bold' : 'text-green-600'}">(${Math.round(beam.defl_ratio * 100)}%)</div>`
            : '<span class="text-gray-400">-</span>'} 
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
            </td>
        </tr>
    `).join('');
}

function renderBatchResults(data) {
    const container = document.getElementById('batch-results-container');
    const tbody = document.getElementById('batch-results-body');

    container.classList.remove('hidden');
    tbody.innerHTML = "";

    data.forEach(row => {
        const winner = row.winner;
        let winnerHtml = '<span class="text-gray-400 italic">No Valid Shape</span>';
        let weight = "-";
        let ratio = "-";

        if (winner) {
            winnerHtml = `<span class="font-bold text-gray-900 dark:text-white">${winner.name}</span>`;
            weight = winner.weight;
            const rVal = (winner.ratio * 100).toFixed(1);
            const colorClass = winner.ratio > 1.0 ? 'text-red-600 bg-red-100' : (winner.ratio > 0.9 ? 'text-yellow-600 bg-yellow-100' : 'text-green-600 bg-green-100');
            ratio = `<span class="text-xs px-2 py-1 rounded font-bold ${colorClass}">${rVal}%</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600";
        tr.innerHTML = `
            <td class="px-4 py-2">${row.span.toFixed(2)}</td>
            <td class="px-4 py-2">${row.load.toFixed(2)}</td>
            <td class="px-4 py-2">${winnerHtml}</td>
            <td class="px-4 py-2">${weight}</td>
            <td class="px-4 py-2">${ratio}</td>
        `;
        tbody.appendChild(tr);
    });

    // Scroll to batch results
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}