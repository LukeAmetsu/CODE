/**
 * Beam Selector Logic (AISC Table 3-10 Simulator)
 * Iterates through AISC W-Shapes to find the lightest section for a given Moment and Unbraced Length.
 * Supports LRFD, ASD, and OSHA (F.S.=4) design methods.
 */

var beamData = {
    batchCases: [
        { span: 20, cant: 0, trib: 10, load: 100, lb: 20, cb: 1.0 }, // Example: 100 psf on 10' trib
        { span: 24, cant: 6, trib: 0, load: 1.2, lb: 24, cb: 1.0 }   // Example: Cantilever
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    if (typeof initializeSharedUI === 'function') initializeSharedUI();
    // Input Event Listeners for Real-time Calculation Preview
    // Input Event Listeners for equation parsing
    const calcInputs = ['Lb', 'Fy', 'Cb', 'nominal_depth'];
    calcInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Evaluate and replace with number on blur (loss of focus)
            el.addEventListener('blur', () => {
                const val = safeMathEval(el.value);
                if (val !== null) {
                    el.value = val % 1 !== 0 ? val.toFixed(3).replace(/\.?0+$/, '') : val; // Clean format
                }
            });
        }
    });

    // Depth Checkbox Toggle
    const depthCheck = document.getElementById('depth_limit_check');
    const nominalDepthInput = document.getElementById('nominal_depth');
    depthCheck?.addEventListener('change', (e) => {
        if (e.target.checked) {
            nominalDepthInput.classList.remove('hidden');
        } else {
            nominalDepthInput.classList.add('hidden');
        }
    });

    // Cantilever Checkbox Toggle
    const cantCheck = document.getElementById('check_cantilever');
    const cantInputs = document.getElementById('cantilever_inputs');
    cantCheck?.addEventListener('change', (e) => {
        if (e.target.checked) {
            cantInputs.classList.remove('hidden');
        } else {
            cantInputs.classList.add('hidden');
        }
    });

    // Inventory Checkbox Toggle
    const invCheck = document.getElementById('check_inventory');
    const invInputs = document.getElementById('inventory_inputs');
    invCheck?.addEventListener('change', (e) => {
        if (e.target.checked) {
            invInputs.classList.remove('hidden');
        } else {
            invInputs.classList.add('hidden');
        }
    });

    // Main Run Button (Removed)

    // Batch Controls
    if (document.getElementById('batch-run-selector-btn')) {
        document.getElementById('batch-run-selector-btn').addEventListener('click', findLightestBeam);
    }

    if (document.getElementById('export-excel-btn')) {
        document.getElementById('export-excel-btn').addEventListener('click', exportBatchToExcel);
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

    // Initial Preview Removed
    // Populate Desired Section Dropdown
    populateShapesDropdown('W');

    // Shape Type Listener
    document.getElementById('shape_type').addEventListener('change', (e) => {
        populateShapesDropdown(e.target.value);
    });

    // Initial Render of Batch Table
    renderBatchTable();
});

async function populateShapesDropdown(type) {
    try {
        const select = document.getElementById('desired_section');
        select.innerHTML = '<option value="">-- Check Specific Beam --</option>'; // Clear existing
        
        // Use the generic get_shapes_by_type exposed in main_eel.py
        const shapes = await eel.get_shapes_by_type(type)();
        shapes.sort(); // Alphabetical sort is usually fine
        
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

// updateMomentPreview removed

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
            <td class="p-1"><input type="text" inputmode="decimal" step="0.5" class="numeric-input w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.span}" data-idx="${index}" data-key="span"></td>
            <td class="p-1"><input type="text" inputmode="decimal" step="0.5" placeholder="-" class="numeric-input w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.trib || ''}" data-idx="${index}" data-key="trib"></td>
            <td class="p-1"><input type="text" inputmode="decimal" step="0.1" class="numeric-input w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.load}" data-idx="${index}" data-key="load"></td>
            <td class="p-1"><input type="text" inputmode="decimal" step="0.5" placeholder="0" class="numeric-input w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-orange-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 outline-none transition-all text-orange-600 font-bold" value="${item.cant || 0}" data-idx="${index}" data-key="cant"></td>
            <td class="p-1"><input type="text" inputmode="decimal" step="0.5" class="numeric-input w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.lb}" data-idx="${index}" data-key="lb"></td>
            <td class="p-1"><input type="text" inputmode="decimal" step="0.01" class="numeric-input w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all" value="${item.cb}" data-idx="${index}" data-key="cb"></td>
            <td class="p-1 text-center"><button class="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" data-idx="${index}" data-action="remove" title="Remove Case">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addBatchRow() {
    beamData.batchCases.push({ span: 20, cant: 0, trib: 0, load: 1.0, lb: 20, cb: 1.0 });
    renderBatchTable();
}

function handleBatchInput(e) {
    updateBatchInputs(e, beamData.batchCases);
}

function handleBatchAction(e) {
    handleBatchDelete(e, beamData.batchCases, renderBatchTable, { span: 0, trib: 0, load: 0, cant: 0, lb: 0, cb: 1.0 });
}

function handleBatchPaste(e) {
    const p = (v, def) => { let r = safeMathEval(v); return r !== null && !isNaN(r) ? r : def; };
    const rowMapper = (values) => {
        if (values.length >= 2) {
            const span = p(values[0], 0);
            const trib = values.length >= 2 ? p(values[1], 0) : 0;
            const load = values.length >= 3 ? p(values[2], 0) : 0;
            const cant = values.length >= 4 ? p(values[3], 0) : 0;
            const lb = values.length >= 5 ? p(values[4], span) : span;
            const cb = values.length >= 6 ? p(values[5], 1.0) : 1.0;
            return { span, trib, load, cant, lb, cb };
        }
        return null;
    };
    parsePasteToBatch(e, beamData.batchCases, rowMapper, renderBatchTable);
}

function setupBatchExcelImport() {
    const fileInput = document.getElementById('upload-excel');
    if (!fileInput) return;
    
    fileInput.addEventListener('change', (e) => {
        const p = (v, def) => { let r = safeMathEval(v); return r !== null && !isNaN(r) ? r : def; };
        const rowMapper = (row) => {
            if (row.length >= 1 && p(row[0], null) !== null) {
                const span = p(row[0], 0);
                const trib = row.length >= 2 ? p(row[1], 0) : 0;
                const load = row.length >= 3 ? p(row[2], 0) : 0;
                const cant = row.length >= 4 ? p(row[3], 0) : 0;
                const lb = row.length >= 5 ? p(row[4], span) : span;
                const cb = row.length >= 6 ? p(row[5], 1.0) : 1.0;
                return { span, trib, load, cant, lb, cb };
            }
            return null;
        };
        parseExcelToBatch(e, beamData.batchCases, rowMapper, renderBatchTable, "No valid data found in Excel. Expected columns: Span, Load, [Lb], [Cb]");
    });
}

// --- MAIN CALCULATION ---
async function findLightestBeam() {
    // 1. Gather Global Inputs
    const shapeType = document.getElementById('shape_type').value;
    const method = document.getElementById('design_method').value; // LRFD, ASD, or OSHA
    const Fy = safeMathEval(document.getElementById('Fy').value) || 50;
    // Note: Lb and Cb from single inputs are override defaults if not in batch row, 
    // but for batch we strictly use table values or fallbacks logic.
    const global_Lb = safeMathEval(document.getElementById('Lb').value) || 0;
    const global_Cb = safeMathEval(document.getElementById('Cb').value) || 1.0;

    const isCantilever = document.getElementById('check_cantilever').checked;
    const global_Cant = isCantilever ? (safeMathEval(document.getElementById('cantilever_ft').value) || 0) : 0;

    const checkDeflection = document.getElementById('check_deflection').checked;

    const depthChecked = document.getElementById('depth_limit_check').checked;
    const nominalDepth = depthChecked ? (safeMathEval(document.getElementById('nominal_depth').value) || 0) : 0;
    const desiredShape = document.getElementById('desired_section').value;
    
    const checkDouble = document.getElementById('check_double').checked;

    const maxRatioPct = safeMathEval(document.getElementById('max_ratio').value) || 100;
    const maxRatio = maxRatioPct / 100.0;

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
    const batchPayload = beamData.batchCases.map(c => {
        // --- Calculate w and M based on inputs ---

        // 1. Determine Linear Load (w)
        let w_val = c.load; // Default assumption: KLF
        if (c.trib > 0) {
            // If Trib provided, Load is PSF -> Convert to KLF
            w_val = (c.load * c.trib) / 1000.0;
        }

        // 2. Determine Moment (M_req)
        // If cantilever (c.cant > 0), load is only on cantilever.
        // M_cant = (w * cant * cant) / 2
        // Backspan for stability calc on backend, but for Moment Requirement we send M_calc.
        let m_req = 0;
        
        if (c.cant > 0) {
            // Cantilever Moment (Negative) at support
            // Load + SW (SW is added in backend? Or here?)
            // Backend adds SW. Here we calculate Moment from USER LOAD.
            m_req = (w_val * c.cant * c.cant) / 2.0;
        } else {
            // Simple Span Moment
            m_req = (w_val * c.span * c.span) / 8.0;
        }

        return {
            span: c.span,
            load: w_val, // Pass the calculated linear load to backend (for logging/display)
            mu_req: m_req, // Explicitly pass the calculated Moment
            lb: c.lb,
            cb: c.cb,
            cantilever_ft: c.cant || 0
        };
    });

    const cb = document.getElementById('Cb'); // ... existing logic ignores Single Lb/Cb if batch

    // Parse restricted inventory
    let restricted_pool = null;
    if (document.getElementById('check_inventory').checked) {
        const text = document.getElementById('inventory_data').value;
        if (text.trim()) {
            restricted_pool = {};
            const lines = text.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                const parts = line.split(/[\t ,]+/);
                if (parts.length >= 2) {
                    const shape = parts[0].toUpperCase();
                    const lb = safeMathEval(parts[1]);
                    if (shape && lb !== null) {
                        restricted_pool[shape] = lb;
                    }
                }
            }
        }
    }

    const inputs = {
        shape_type: shapeType,
        design_method: method,
        fy: Fy,
        // Single inputs are obsolete, batch is the only entry point
        lb_ft: global_Lb,
        cb: global_Cb,
        mu_req: 0,
        span_ft: 0,
        w_load: 0,
        cantilever_ft: 0,

        nominal_depth: nominalDepth,
        desired_shape: desiredShape,
        check_deflection: checkDeflection,
        check_double: checkDouble,
        max_ratio: maxRatio,

        batch_loads: batchPayload,
        restricted_pool: restricted_pool
    };

    if (batchPayload.length === 0) {
        alert("Please add at least one case to the batch table.");
        return;
    }

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
        
        let fosHtml = "";
        if (desired.fos_ot && desired.fos_ot < 999) {
            fosHtml = ` • OT FOS: <span class="${desired.fos_ot < 1.5 ? 'text-red-600 font-bold' : 'text-green-600'}">${desired.fos_ot.toFixed(2)}</span>`;
        }
        desiredStats.innerHTML += fosHtml;

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
        if (winner.fos_ot && winner.fos_ot < 999) {
             winnerStats.innerHTML += ` • <span title="Overturning Factor of Safety">OT FOS: ${winner.fos_ot.toFixed(2)}</span>`;
        }
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

var beamBatchResults = []; // Store batch results for detail view

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

            if (winner.fos_ot && winner.fos_ot < 999) {
                 const fosClass = winner.fos_ot < 1.5 ? 'text-red-600' : 'text-gray-500';
                 ratio += `<br><span class="text-[10px] ${fosClass}">FOS ${winner.fos_ot.toFixed(2)}</span>`;
            }
        }

        const tr = document.createElement('tr');
        tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer";
        tr.onclick = (e) => {
            // Don't trigger if clicking buttons inside (if any)
            if (e.target.tagName === 'BUTTON') return;
            viewBatchDetails(index);
        };

        tr.innerHTML = `
            <td class="px-4 py-2 font-bold text-gray-400 text-xs">${index + 1}</td>
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

function exportBatchToExcel() {
    if (!beamBatchResults || beamBatchResults.length === 0) {
        alert("No results to export. Please run your calculation first.");
        return;
    }

    const exportData = beamBatchResults.map((resultRow, index) => {
        const inputRow = beamData.batchCases[index] || {};
        
        let winnerName = "No Valid Shape";
        let weight = "-";
        let ratio = "-";
        let capacity = "-";
        let mode = "-";
        let reaction = "-";
        
        if (resultRow.winner) {
            winnerName = resultRow.winner.name;
            weight = resultRow.winner.weight;
            ratio = (resultRow.winner.ratio * 100).toFixed(1) + "%";
            capacity = resultRow.winner.capacity.toFixed(2);
            mode = resultRow.winner.mode;
            reaction = resultRow.winner.rxn_kips !== undefined ? resultRow.winner.rxn_kips.toFixed(2) : "-";
        }

        return {
            "Case #": index + 1,
            "Span (ft)": inputRow.span !== undefined ? inputRow.span : resultRow.span,
            "Trib (ft)": inputRow.trib || 0,
            "Load": inputRow.load !== undefined ? inputRow.load : resultRow.load,
            "Cantilever (ft)": inputRow.cant || 0,
            "Lb (ft)": inputRow.lb !== undefined ? inputRow.lb : (inputRow.span || resultRow.span),
            "Cb": inputRow.cb || 1.0,
            "Winner": winnerName,
            "Weight (lb/ft)": weight,
            "Capacity (k-ft)": capacity,
            "Max Reaction (kips)": reaction,
            "Ratio (D/C)": ratio,
            "Governing Mode": mode
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Batch Results");
    
    XLSX.writeFile(workbook, "Beam_Batch_Results.xlsx");
}

async function viewBatchDetails(index) {
    // FIX: Use the SOURCE input data, not the result data (which lacks lb info)
    const data = beamData.batchCases[index];
    if (!data) return;

    // RE-RUN LOGIC For Details View
    // Must match the batch logic above

    // 1. Determine Linear Load (w)
    let w_val = data.load;
    if (data.trib > 0) {
        w_val = (data.load * data.trib) / 1000.0;
    }

    // 2. Determine Moment (M_req)
    let m_req = 0;
    if (data.cant > 0) {
        m_req = (w_val * data.cant * data.cant) / 2.0;
    } else {
        m_req = (w_val * data.span * data.span) / 8.0;
    }

    // Calculate demand for display reference
    const M_req = m_req;

    // To show full details (all candidates), we need to re-run the calculation for this specific case.

    // 1. Gather Inputs derived from this batch row
    const method = document.getElementById('design_method').value;
    const Fy = safeMathEval(document.getElementById('Fy').value) || 50;

    const depthChecked = document.getElementById('depth_limit_check').checked;
    const nominalDepth = depthChecked ? (safeMathEval(document.getElementById('nominal_depth').value) || 0) : 0;

    const checkDeflection = document.getElementById('check_deflection').checked;
    const checkDouble = document.getElementById('check_double').checked;
    const desiredShape = document.getElementById('desired_section').value;
    const maxRatioPct = safeMathEval(document.getElementById('max_ratio').value) || 100;

    const singleInputs = {
        shape_type: document.getElementById('shape_type').value, // Use current UI selection or from data? 
        // Technically batch data should store shape type if we support mixed batches. 
        // For now, assuming batch runs under current global shape setting.
        design_method: method,
        fy: Fy,
        lb_ft: data.lb !== undefined ? data.lb : data.span,
        cb: data.cb || 1.0,
        mu_req: m_req,           // Pass explicit calculated moment
        span_ft: data.span,
        w_load: w_val,           // Pass calculated linear load
        nominal_depth: nominalDepth,
        desired_shape: desiredShape,
        check_deflection: checkDeflection,
        check_double: checkDouble,
        check_double: checkDouble,
        max_ratio: maxRatioPct / 100.0, // Re-calc or pass? We didn't grab it in viewBatchDetails local scope yet
        cantilever_ft: data.cant || 0,
        batch_loads: null,
        restricted_pool: null
    };

    // Evaluate restricted pool again correctly in this scope
    if (document.getElementById('check_inventory').checked) {
        const text = document.getElementById('inventory_data').value;
        if (text.trim()) {
            singleInputs.restricted_pool = {};
            const lines = text.split('\n');
            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                const parts = line.split(/[\t ,]+/);
                if (parts.length >= 2) {
                    const shape = parts[0].toUpperCase();
                    const lb = safeMathEval(parts[1]);
                    if (shape && lb !== null) {
                        singleInputs.restricted_pool[shape] = lb;
                    }
                }
            }
        }
    }

    try {
        // Show loading state?
        const container = document.getElementById('results-container');
        container.classList.remove('hidden');
        document.getElementById('results-body').innerHTML = '<tr><td colspan="10" class="text-center py-4">Loading details...</td></tr>';
        container.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const result = await eel.find_lightest_beam(singleInputs)();

        if (result && result.error) {
            console.error(result.error);
            document.getElementById('results-body').innerHTML = `<tr><td colspan="10" class="text-center py-4 text-red-500">Error: ${result.error}</td></tr>`;
            return;
        }

        renderResults(result, M_req);

    } catch (e) {
        console.error("Error fetching detail view", e);
    }
}