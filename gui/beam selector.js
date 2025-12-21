/**
 * Beam Selector Logic (AISC Table 3-10 Simulator)
 * Iterates through AISC W-Shapes to find the lightest section for a given Moment and Unbraced Length.
 * Supports LRFD, ASD, and OSHA (F.S.=4) design methods.
 */

const beamData = {
    batchCases: [
        { span: 20, load: 1.0, lb: 20, cb: 1.0 },
        { span: 24, load: 1.2, lb: 24, cb: 1.14 }
    ]
};

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

    // Batch Controls
    if (document.getElementById('batch-run-selector-btn')) {
        document.getElementById('batch-run-selector-btn').addEventListener('click', findLightestBeam);
    }

    document.getElementById('add-case-btn')?.addEventListener('click', () => {
        addBatchRow();
    });

    const batchTable = document.getElementById('batch-table');
    if (batchTable) {
        batchTable.addEventListener('click', handleBatchAction);
        batchTable.addEventListener('input', handleBatchInput);
        batchTable.addEventListener('paste', handleBatchPaste); // Listen for paste on table
    }

    setupBatchExcelImport();

    // Initial Preview
    updateMomentPreview();

    // Populate Desired Section Dropdown
    populateShapesDropdown();

    // Initial Render of Batch Table
    renderBatchTable();
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

// --- BATCH TABLE LOGIC ---

function renderBatchTable() {
    const tbody = document.getElementById('batch-table').querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    beamData.batchCases.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors";

        tr.innerHTML = `
            <td class="p-1 text-center text-xs text-gray-400">${index + 1}</td>
            <td class="p-1"><input type="number" step="0.5" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.span}" data-idx="${index}" data-key="span"></td>
            <td class="p-1"><input type="number" step="0.1" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.load}" data-idx="${index}" data-key="load"></td>
            <td class="p-1"><input type="number" step="0.5" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.lb}" data-idx="${index}" data-key="lb"></td>
            <td class="p-1"><input type="number" step="0.01" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.cb}" data-idx="${index}" data-key="cb"></td>
            <td class="p-1 text-center"><button class="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" data-idx="${index}" data-action="remove" title="Remove Case">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addBatchRow() {
    beamData.batchCases.push({ span: 20, load: 1.0, lb: 20, cb: 1.0 });
    renderBatchTable();
}

function handleBatchInput(e) {
    if (e.target.tagName === 'INPUT') {
        const idx = parseInt(e.target.dataset.idx);
        const key = e.target.dataset.key;
        if (!isNaN(idx) && key) {
            beamData.batchCases[idx][key] = parseFloat(e.target.value) || 0;
        }
    }
}

function handleBatchAction(e) {
    const btn = e.target.closest('button');
    if (btn && btn.dataset.action === 'remove') {
        const idx = parseInt(btn.dataset.idx);
        if (!isNaN(idx)) {
            beamData.batchCases.splice(idx, 1);
            renderBatchTable();
        }
    }
}

function handleBatchPaste(e) {
    // Only capture if pasting into the table container itself or an input within it
    // But we want to allow pasting rows.

    // Prevent default paste behavior to handle it manually
    // e.preventDefault(); 
    // Wait, if user pastes into an input, we might just want let them paste typical text. 
    // But if it's a multi-line paste, we should intercept.

    const clipboardData = (e.clipboardData || window.clipboardData).getData('text');
    if (!clipboardData) return;

    const rows = clipboardData.split(/\\r\\n|\\n|\\r/).filter(r => r.trim() !== '');

    // If only one line/value and inside an input, let default behavior happen (or handle single cell)
    // But here we want to support excel copy-paste of multiple rows.
    if (rows.length <= 1 && e.target.tagName === 'INPUT') return;

    e.preventDefault();

    let startIndex = beamData.batchCases.length;
    // Check if we are pasting starting from a specific row
    const activeInput = document.activeElement;
    if (activeInput && activeInput.tagName === 'INPUT' && activeInput.dataset.idx) {
        startIndex = parseInt(activeInput.dataset.idx);
    }

    const newCases = [];
    rows.forEach(rowStr => {
        // Support Tab or Comma (Excel uses Tab usually)
        let values = rowStr.split('\\t');
        if (values.length === 1) values = rowStr.split(/,|;/);

        // Expected columns: Span | Load | Lb | Cb
        if (values.length >= 2) {
            const span = parseFloat(values[0]) || 0;
            const load = parseFloat(values[1]) || 0;
            const lb = values.length >= 3 ? (parseFloat(values[2]) || span) : span;
            const cb = values.length >= 4 ? (parseFloat(values[3]) || 1.0) : 1.0;

            newCases.push({ span, load, lb, cb });
        }
    });

    if (newCases.length > 0) {
        // Insert or Append
        for (let i = 0; i < newCases.length; i++) {
            const targetIdx = startIndex + i;
            if (targetIdx < beamData.batchCases.length) {
                // Overwrite
                beamData.batchCases[targetIdx] = newCases[i];
            } else {
                // Append
                beamData.batchCases.push(newCases[i]);
            }
        }
        renderBatchTable();
    }
}

function setupBatchExcelImport() {
    const fileInput = document.getElementById('upload-excel');
    if (!fileInput) return;

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // Process JSON array of arrays
            const newCases = [];
            json.forEach(row => {
                if (row.length >= 2 && !isNaN(parseFloat(row[0]))) {
                    const span = parseFloat(row[0]) || 0;
                    const load = parseFloat(row[1]) || 0;
                    const lb = row.length >= 3 ? (parseFloat(row[2]) || span) : span;
                    const cb = row.length >= 4 ? (parseFloat(row[3]) || 1.0) : 1.0;
                    newCases.push({ span, load, lb, cb });
                }
            });

            if (newCases.length > 0) {
                beamData.batchCases = newCases;
                renderBatchTable();
            } else {
                alert("No valid data found in Excel. Expected columns: Span, Load, [Lb], [Cb]");
            }
        };
        reader.readAsArrayBuffer(file);
        fileInput.value = '';
    });
}

// --- MAIN CALCULATION ---
async function findLightestBeam() {
    // 1. Gather Global Inputs
    const method = document.getElementById('design_method').value; // LRFD, ASD, or OSHA
    const Fy = safeMathEval(document.getElementById('Fy').value) || 50;
    // Note: Lb and Cb from single inputs are override defaults if not in batch row, 
    // but for batch we strictly use table values or fallbacks logic.
    const global_Lb = safeMathEval(document.getElementById('Lb').value) || 0;
    const global_Cb = safeMathEval(document.getElementById('Cb').value) || 1.0;

    const nominalDepth = safeMathEval(document.getElementById('nominal_depth').value);
    const checkDeflection = document.getElementById('check_deflection').checked;
    const desiredShape = document.getElementById('desired_section').value;

    // Check if triggered by Batch button
    const isBatch = beamData.batchCases.length > 0;

    // Construct Payload
    // Even for single case, we can use the batch structure or keep legacy.
    // Let's use the legacy structure if batch is empty, for backward compatibility with simple UI usage?
    // Actually, "Run Batch" button explicitly implies we run the table. 
    // The "Find Lightest Beam" button (top) might imply single case from top inputs.
    // However, the prompt says "ALL INPUTS SHOULD BE BATCH".
    // We will check which button was clicked or just prioritize batch if available?
    // Let's update `inputs` to include `batch_loads` sourced from `beamData`.

    // Prepare Batch Payload
    const batchPayload = beamData.batchCases.map(c => ({
        span: c.span,
        load: c.load,
        lb: c.lb, // Explicit Lb per case
        cb: c.cb
    }));

    // Single case inputs (fallback or "Option B" usage)
    const span_calc = safeMathEval(document.getElementById('span_calc').value) || 0;
    const w_load = safeMathEval(document.getElementById('w_load').value) || 0;
    const mu_direct = safeMathEval(document.getElementById('Mu_direct').value);

    // If mu_direct is set, it overrides span/load calculation for the SINGLE case scenario.
    let single_M_req = mu_direct;
    if (single_M_req === null || single_M_req === 0) {
        single_M_req = (w_load * span_calc * span_calc) / 8;
    }

    const inputs = {
        design_method: method,
        fy: Fy,
        // Global Single Inputs (used if batch is null)
        lb_ft: global_Lb,
        cb: global_Cb,
        mu_req: single_M_req,
        span_ft: span_calc,
        w_load: w_load,

        nominal_depth: nominalDepth,
        desired_shape: desiredShape,
        check_deflection: checkDeflection,

        // The New Batch Data
        batch_loads: batchPayload.length > 0 ? batchPayload : null
    };

    // 2. Call Python Backend (Eel)
    try {
        const btn = document.getElementById('run-selector-btn');
        const batchBtn = document.getElementById('batch-run-selector-btn');
        if (btn) btn.disabled = true;
        if (batchBtn) batchBtn.disabled = true;

        console.log("Calling Eel with inputs:", inputs);

        const result = await eel.find_lightest_beam(inputs)();

        if (result && result.error) {
            alert("Calculation Error: " + result.error);
            return;
        }

        // 3. Render
        if (inputs.batch_loads) {
            renderBatchResults(result);
            // Also render the first result in the detailed view for inspection?
            // Or just hide detailed view? 
            // Better to hide or clear single result if running batch. 
            // Usage: User looks at batch table.
        } else {
            document.getElementById('batch-results-container').classList.add('hidden');
            requestAnimationFrame(() => {
                renderResults(result, single_M_req);
            });
        }

    } catch (e) {
        console.error(e);
        alert("Failed to connect to calculation server (Eel). Ensure main_eel.py is running.");
    } finally {
        const btn = document.getElementById('run-selector-btn');
        const batchBtn = document.getElementById('batch-run-selector-btn');
        if (btn) btn.disabled = false;
        if (batchBtn) batchBtn.disabled = false;
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
    `).join('');
}

const beamBatchResults = []; // Store batch results for detail view

function renderBatchResults(data) {
    const container = document.getElementById('batch-results-container');
    const tbody = document.getElementById('batch-results-body');

    // Store data globally for access
    beamBatchResults.length = 0;
    data.forEach(d => beamBatchResults.push(d));

    container.classList.remove('hidden');
    tbody.innerHTML = "";

    data.forEach((row, index) => {
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
        tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer";
        tr.onclick = (e) => {
            // Don't trigger if clicking buttons inside (if any)
            if (e.target.tagName === 'BUTTON') return;
            viewBatchDetails(index);
        };

        tr.innerHTML = `
            <td class="px-4 py-2">${row.span.toFixed(2)}</td>
            <td class="px-4 py-2">${row.load.toFixed(2)}</td>
            <td class="px-4 py-2">${winnerHtml}</td>
            <td class="px-4 py-2">${weight}</td>
            <td class="px-4 py-2">${ratio}</td>
            <td class="px-4 py-2 text-right">
                <button onclick="viewBatchDetails(${index})" class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded border border-blue-200 transition-colors">
                    View Details
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Scroll to batch results
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function viewBatchDetails(index) {
    const data = beamBatchResults[index];
    if (!data || !data.winner) return;

    // Calculate demand for this specific case (Approximate based on span/load)
    // M = wL^2/8
    const M_req = (data.load * data.span * data.span) / 8;

    // Construct a candidate list with just the winner for display
    // The renderResults expects { candidates: [], desired: ... } or array.
    // Since we only have the winner in the batch summary usually, we pass that.

    const mockData = {
        candidates: [data.winner],
        desired: null // We don't have desired analysis for batch rows usually
    };

    renderResults(mockData, M_req);

    // Scroll to details
    document.getElementById('results-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
}