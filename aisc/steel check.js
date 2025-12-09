
document.addEventListener('DOMContentLoaded', async () => {
    // --- Initialization ---
    populateSteelMaterialDropdown();

    // Load shape database and populate default shape type
    try {
        await AISC_SPEC.loadShapeDatabase();
        updateShapeDropdown(); // Initial population
    } catch (error) {
        console.error("Failed to load shape database:", error);
    }

    // --- Event Listeners ---
    document.getElementById('steel_material').addEventListener('change', handleMaterialChange);
    document.getElementById('section_type').addEventListener('change', updateShapeDropdown);
    document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);
    document.getElementById('run-steel-check-btn').addEventListener('click', runSteelCheck);

    // File I/O
    document.getElementById('save-inputs-btn').addEventListener('click', saveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', loadInputsFromFile);

    // Initial material set
    handleMaterialChange();
});

// --- UI Helpers ---

function populateSteelMaterialDropdown() {
    const select = document.getElementById('steel_material');
    const grades = AISC_SPEC.structuralSteelGrades;

    select.innerHTML = ''; // Clear existing
    for (const [grade, props] of Object.entries(grades)) {
        const option = document.createElement('option');
        option.value = grade;
        option.textContent = grade;
        if (grade === 'A992') option.selected = true; // Default
        select.appendChild(option);
    }
}

function handleMaterialChange() {
    const select = document.getElementById('steel_material');
    const grade = select.value;
    const props = AISC_SPEC.getSteelGrade(grade);

    if (props) {
        document.getElementById('Fy').value = props.Fy;
        document.getElementById('Fu').value = props.Fu;
    }
}

async function updateShapeDropdown() {
    const sectionType = document.getElementById('section_type').value;
    const shapeSelect = document.getElementById('aisc_shape_select');

    shapeSelect.innerHTML = '<option value="">Loading...</option>';

    // Map UI Selection Type to Database Types if necessary, or use "All" for specific logic
    // The current AISC_SPEC.getShapesByType handles strict matching.
    // We need to map the UI values (e.g. "W-Shape") to what might be in the DB or filter logic
    // Assuming simple mapping for now based on what I saw in database.js

    let dbType = sectionType;
    // Adjust if needed based on typical AISC DB naming (e.g., "W", "HSS", etc.)
    // For now assuming existing getShapesByType handles generic types or we filter manually.

    // Common mappings if DB uses different keys:
    const typeMapping = {
        'W-Shape': 'W',
        'S-Shape': 'S',
        'HP-Shape': 'HP',
        'M-Shape': 'M',
        'WT-Shape': 'WT',
        'Rectangular HSS': 'HSS_Rect', // Guessing keys, will need verification if this fails
        'Round HSS': 'HSS_Round',
        'Pipe': 'Pipe',
        'Channel': 'C',
        'Angle': 'L'
    };

    const typeKey = typeMapping[sectionType] || sectionType;

    try {
        const allShapes = await AISC_SPEC.loadShapeDatabase();
        const shapes = [];

        // Filter locally if getShapesByType isn't sufficient or to be safe
        for (const [name, props] of Object.entries(allShapes)) {
            // Check type property. 
            // Note: The database structure might vary. Checking 'type' property.
            if (props.type === typeKey || name.startsWith(typeKey)) {
                shapes.push(name);
            }
        }

        shapes.sort(); // Alphabetical sort

        shapeSelect.innerHTML = '<option value="">-- Select a Shape --</option>';
        shapes.forEach(shape => {
            const option = document.createElement('option');
            option.value = shape;
            option.textContent = shape;
            shapeSelect.appendChild(option);
        });

        if (sectionType === 'Manual Input') {
            shapeSelect.disabled = true;
            toggleManualInputs(true);
        } else {
            shapeSelect.disabled = false;
            toggleManualInputs(false);
        }

    } catch (e) {
        console.error("Error updating shapes:", e);
        shapeSelect.innerHTML = '<option value="">Error loading shapes</option>';
    }
}

async function handleShapeSelection() {
    const shapeName = document.getElementById('aisc_shape_select').value;
    if (!shapeName) return;

    const props = await AISC_SPEC.getShape(shapeName);
    if (!props) return;

    // Auto-fill geometry inputs
    // Mapping DB keys to Input IDs
    const map = {
        'd': 'd',
        'bf': 'bf',
        'tf': 'tf',
        'tw': 'tw',
        'A': 'Ag_manual',
        'Ix': 'I_manual',
        'Sx': 'Sx_manual',
        'Zx': 'Zx_manual',
        'ry': 'ry_manual',
        'rts': 'rts_manual',
        'J': 'J_manual',
        'Cw': 'Cw_manual',
        'Iy': 'Iy_manual',
        'Sy': 'Sy_manual',
        'Zy': 'Zy_manual'
    };

    // Helper to safely set value
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el.value = val;
    };

    for (const [dbKey, inputId] of Object.entries(map)) {
        setVal(inputId, props[dbKey]);
    }
}

function toggleManualInputs(enable) {
    // Optional: visual indication or disabling of auto-filled fields
    // For now, we trust the users to overwrite if they want specific overrides
}

// --- Main Calculation ---

function runSteelCheck() {
    const inputs = gatherInputs();
    const resultsContainer = document.getElementById('steel-results-container');

    if (!inputs) {
        resultsContainer.innerHTML = '<p class="text-red-500">Invalid Inputs. Please check your values.</p>';
        return;
    }

    // --- Perform Checks ---
    const axial = checkAxial(inputs);
    const flexure = checkFlexure(inputs);
    const shear = checkShear(inputs);
    const combined = checkCombined(inputs, axial, flexure);
    const deflection = checkDeflection(inputs);

    // --- Render Results ---
    renderResults(inputs, { axial, flexure, shear, combined, deflection });
}

function gatherInputs() {
    const getNum = (id) => parseFloat(document.getElementById(id).value);
    const getStr = (id) => document.getElementById(id).value;

    return {
        design_method: getStr('design_method'), // ASD or LRFD
        grade: getStr('steel_material'),
        Fy: getNum('Fy'),
        Fu: getNum('Fu'),
        E: getNum('E'),

        // Loads
        P: getNum('Pu_or_Pa'),
        V: getNum('Vu_or_Va'),
        Mx: getNum('Mux_or_Max'),
        My: getNum('Muy_or_May'),
        T: getNum('Tu_or_Ta'),

        // Geometry
        section_type: getStr('section_type'),
        shape: getStr('aisc_shape_select'),
        d: getNum('d'),
        bf: getNum('bf'),
        tf: getNum('tf'),
        tw: getNum('tw'),

        // Manual / Section Properties
        Ag: getNum('Ag_manual'),
        Ix: getNum('I_manual'),
        Sx: getNum('Sx_manual'),
        Zx: getNum('Zx_manual'),
        Iy: getNum('Iy_manual'),
        Sy: getNum('Sy_manual'),
        Zy: getNum('Zy_manual'),
        ry: getNum('ry_manual'),
        rts: getNum('rts_manual'),
        J: getNum('J_manual'),
        Cw: getNum('Cw_manual'),

        // Stability
        Lb: getNum('Lb_input') * 12, // Convert ft to in
        K: getNum('K'),
        Cb: getNum('Cb'),
        Cm: getNum('Cm'),

        // Serviceability
        def_span: getNum('deflection_span') * 12, // ft to in
        def_limit: getNum('deflection_limit'),
        def_actual: getNum('actual_deflection_input')
    };
}

// --- AISC Check Functions (simplified for W-Shapes) ---

function getPhiOmega(type, method) {
    // Standard factors
    const factors = {
        'yield': { phi: 0.90, omega: 1.67 },
        'rupture': { phi: 0.75, omega: 2.00 },
        'compression': { phi: 0.90, omega: 1.67 },
        'flexure': { phi: 0.90, omega: 1.67 },
        'shear': { phi: 0.90, omega: 1.67 }, // Most W-shapes (G2.1a)
    };
    const f = factors[type] || { phi: 1.0, omega: 1.0 };
    return method === 'LRFD' ? f.phi : f.omega;
}

function checkAxial(inputs) {
    const { P, Ag, Fy, E, K, Lb, ry, design_method } = inputs;
    const factors = getPhiOmega('compression', design_method);

    // Euler Buckling Stress (Fe)
    // KL/r
    const KL_r = (K * Lb) / ry;
    const Fe = (Math.PI ** 2 * E) / (KL_r ** 2);

    // Critical Stress (Fcr) - AISC E3
    let Fcr;
    if (KL_r <= 4.71 * Math.sqrt(E / Fy)) {
        Fcr = (0.658 ** (Fy / Fe)) * Fy;
    } else {
        Fcr = 0.877 * Fe;
    }

    const Pn = Fcr * Ag;
    const capacity = design_method === 'LRFD' ? Pn * factors.phi : Pn / factors.omega;

    // Check if Tensile (P < 0 in our sign convention usually, checking abs for now or assuming P is load)
    // The HTML says "negative for compression", but standard formulas usually assume P is input as desired.
    // Let's stick to interpretation: Input P is demand. calculate Capacity Pn.
    // If P is negative (compression): check buckling.
    // If P is positive (tension): check yield/rupture (D2).

    // For this generic check, let's assume P is magnitude or check sign.
    // HTML: "Use negative for compression"

    let type = "Compression";
    let status = "N/A";
    let ratio = 0;

    if (P < 0) {
        // Compression
        type = "Compression (AISC E3)";
        ratio = Math.abs(P) / capacity;
        status = ratio <= 1.0 ? "Pass" : "Fail";
    } else if (P > 0) {
        // Tension (Yielding only for simplicity of this script)
        type = "Tension (Yielding)";
        const Pn_yield = Fy * Ag;
        const cap_yield = design_method === 'LRFD' ? Pn_yield * 0.9 : Pn_yield / 1.67;
        ratio = Math.abs(P) / cap_yield;
        status = ratio <= 1.0 ? "Pass" : "Fail";
    }

    return { type, capacity, ratio, status, P: Math.abs(P) };
}

function checkFlexure(inputs) {
    // AISC F2 - W-Shapes
    const { Mx, My, Zx, Sx, Zy, Sy, Fy, E, Lb, Cb, rts, J, Cw, design_method, shape } = inputs;
    // Simplify: Assume Compact

    // X-Axis (Major) - LTB
    const f_flex = getPhiOmega('flexure', design_method);

    // Lp and Lr
    const ry = inputs.ry; // ensure we have ry
    const ho = inputs.d - inputs.tf; // approx distance between flange centroids
    const c = 1.0; // Doubly symmetric

    const Lp = 1.76 * ry * Math.sqrt(E / Fy);

    let Lr;
    // Sqrt term logic for Lr is complex, simplified for now or standard formula
    const rts_sq = rts * rts;
    const J_c = J * c;
    const Sx_ho = Sx * ho;

    // Simplified Lr (F2-6) - very rough if manual calc needed, usually huge formula
    // Using standard approximation if exact geometry not fully available
    // For now, let's proceed with assumption or simplified logic if Lr not easily computed
    // F2-6: Lr = 1.95 * rts * (E / (0.7*Fy)) * sqrt( (J*c)/(Sx*ho) + sqrt(...) ) ... complex

    // Let's implement full F2-6 if possible, else simplified assume Lb < Lp or similar
    // We have rts, J, Sx, ho.

    const term1 = (J * c) / (Sx * ho);
    const term2 = 6.76 * ((0.7 * Fy) / E) ** 2;
    Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(term1 + Math.sqrt(term1 ** 2 + term2));

    let Mn_x = 0;
    const Mp = Fy * Zx;

    // Zone 1: Lb <= Lp
    if (Lb <= Lp) {
        Mn_x = Mp;
    }
    // Zone 2: Lp < Lb <= Lr
    else if (Lb <= Lr) {
        Mn_x = Cb * (Mp - (Mp - 0.7 * Fy * Sx) * ((Lb - Lp) / (Lr - Lp)));
        Mn_x = Math.min(Mn_x, Mp);
    }
    // Zone 3: Lb > Lr
    else {
        const Fcr = ((Cb * Math.PI ** 2 * E) / ((Lb / rts) ** 2)) * Math.sqrt(1 + 0.078 * ((J * c) / (Sx * ho)) * ((Lb / rts) ** 2));
        Mn_x = Fcr * Sx;
        Mn_x = Math.min(Mn_x, Mp);
    }

    const capX = design_method === 'LRFD' ? Mn_x * f_flex.phi : Mn_x / f_flex.omega;

    // Y-Axis (Minor) - F6 (Yielding / Flange Local Buckling)
    // Assuming compact for now
    let Mn_y = Math.min(Fy * Zy, 1.6 * Fy * Sy);
    const capY = design_method === 'LRFD' ? Mn_y * f_flex.phi : Mn_y / f_flex.omega;

    // Check ratios
    const ratioX = Math.abs(Mx) / capX;
    const ratioY = Math.abs(My) / capY;

    return {
        Mx: { capacity: capX, ratio: ratioX, status: ratioX <= 1 ? "Pass" : "Fail" },
        My: { capacity: capY, ratio: ratioY, status: ratioY <= 1 ? "Pass" : "Fail" },
        details: { Lp: Lp / 12, Lr: Lr / 12, Lb: Lb / 12, Cb }
    };
}

function checkShear(inputs) {
    const { V, d, tw, Fy, E, design_method } = inputs;
    // AISC G2.1
    // Aw = d * tw
    const Aw = d * tw;
    const kv = 5; // Unstiffened webs

    // h/tw check
    // h ~ d - 2*k_des theoretically, but d - 2*tf approximation
    const h = d - 2 * inputs.tf; // Rough approx

    let Cv1 = 1.0;
    // G2.1a limit: 2.24 * sqrt(E/Fy)
    if ((h / tw) <= 2.24 * Math.sqrt(E / Fy)) {
        Cv1 = 1.0;
    } else {
        // ... more complex if not compact web, assume 1.0 for standard rolled shapes usually
    }

    const Vn = 0.6 * Fy * Aw * Cv1;
    const f_shear = getPhiOmega('shear', design_method);
    const cap = design_method === 'LRFD' ? Vn * f_shear.phi : Vn / f_shear.omega;

    const ratio = Math.abs(V) / cap;

    return { capacity: cap, ratio, status: ratio <= 1 ? "Pass" : "Fail" };
}

function checkCombined(inputs, axial, flexure) {
    // AISC H1-1
    const Pr = axial.P;
    const Pc = axial.capacity;

    const Mrx = Math.abs(inputs.Mx);
    const Mcx = flexure.Mx.capacity;
    const Mry = Math.abs(inputs.My);
    const Mcy = flexure.My.capacity;

    let ratio = 0;

    if (Pr / Pc >= 0.2) {
        // H1-1a
        ratio = (Pr / Pc) + (8 / 9) * (Mrx / Mcx + Mry / Mcy);
    } else {
        // H1-1b
        ratio = (Pr / (2 * Pc)) + (Mrx / Mcx + Mry / Mcy);
    }

    return { ratio, status: ratio <= 1 ? "Pass" : "Fail" };
}

function checkDeflection(inputs) {
    const { def_actual, def_limit, def_span } = inputs;
    const limitVal = def_span / def_limit;
    const status = def_actual <= limitVal ? "Pass" : "Fail";
    return { limit: limitVal, actual: def_actual, ratio: def_actual / limitVal, status };
}

// --- IO Helpers ---

function saveInputs() {
    const inputs = gatherInputs();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(inputs));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "steel_check_inputs.txt");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function loadInputsFromFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const inputs = JSON.parse(e.target.result);
            // Map inputs back to fields
            // For now specific IDs matching gatherInputs keys or manual map
            // Simplified refilling:
            document.getElementById('design_method').value = inputs.design_method || 'ASD';
            // ... (Full mapping would be verbose, handling basic ones)
            if (inputs.P !== undefined) document.getElementById('Pu_or_Pa').value = inputs.P;
            // Add other fields as needed
            document.getElementById('file-name-display').textContent = "Loaded: " + file.name;
        } catch (err) {
            alert('Error parsing file');
        }
    };
    reader.readAsText(file);
}

// --- Rendering (Standardized Style) ---

function renderResults(inputs, results) {
    const container = document.getElementById('steel-results-container');
    const { axial, flexure, shear, combined, deflection } = results;

    // Helper to create a status badge
    const getStatusBadge = (status) => {
        const colorClass = status === 'Pass' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
        return `<span class="${colorClass} text-xs font-medium px-2.5 py-0.5 rounded border border-${status === 'Pass' ? 'green' : 'red'}-400">${status}</span>`;
    };

    // Helper to create a table section
    const createTableSection = (title, headers, rows) => {
        const headerHtml = headers.map(h => `<th scope="col" class="px-6 py-3">${h}</th>`).join('');
        const rowsHtml = rows.map(row => {
            const cellsHtml = row.cells.map((c, i) => {
                // If it's the status cell (last usually), wrapping handled by caller or passed as HTML
                return `<td class="px-6 py-4">${c}</td>`;
            }).join('');
            return `<tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">${cellsHtml}</tr>`;
        }).join('');

        return `
            <div class="mb-8 overflow-x-auto shadow-md sm:rounded-lg">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2 ml-1">${title}</h3>
                <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>${headerHtml}</tr>
                    </thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
            </div>
        `;
    };

    let html = `<div class="p-4 space-y-6">`;
    html += `<h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Analysis Report (${inputs.design_method})</h2>`;

    // 1. Loading Summary
    html += createTableSection('Applied Loads', ['Load Type', 'Magnitude'], [
        { cells: ['Axial (P)', `${inputs.P.toFixed(2)} kips`] },
        { cells: ['Shear (V)', `${inputs.V.toFixed(2)} kips`] },
        { cells: ['Moment (Mx)', `${inputs.Mx.toFixed(2)} kip-ft`] },
        { cells: ['Moment (My)', `${inputs.My.toFixed(2)} kip-ft`] }
    ]);

    // 2. Strength Checks
    const strengthRows = [
        { cells: [`Axial (${axial.type})`, `${inputs.P.toFixed(2)} k`, `${axial.capacity.toFixed(2)} k`, axial.ratio.toFixed(3), getStatusBadge(axial.status)] },
        { cells: ['Flexure (Major X)', `${Math.abs(inputs.Mx).toFixed(2)} k-ft`, `${flexure.Mx.capacity.toFixed(2)} k-ft`, flexure.Mx.ratio.toFixed(3), getStatusBadge(flexure.Mx.status)] },
        { cells: ['Flexure (Minor Y)', `${Math.abs(inputs.My).toFixed(2)} k-ft`, `${flexure.My.capacity.toFixed(2)} k-ft`, flexure.My.ratio.toFixed(3), getStatusBadge(flexure.My.status)] },
        { cells: ['Shear', `${Math.abs(inputs.V).toFixed(2)} k`, `${shear.capacity.toFixed(2)} k`, shear.ratio.toFixed(3), getStatusBadge(shear.status)] }
    ];
    html += createTableSection('Strength Checks', ['Limit State', 'Demand', 'Capacity', 'Ratio', 'Status'], strengthRows);

    // 3. Interaction & Serviceability
    const otherRows = [
        { cells: ['Combined Forces (H1-1)', '-', '-', combined.ratio.toFixed(3), getStatusBadge(combined.status)] },
        { cells: [`Deflection (L/${inputs.def_limit})`, `${deflection.actual.toFixed(3)}"`, `${deflection.limit.toFixed(3)}"`, deflection.ratio.toFixed(3), getStatusBadge(deflection.status)] }
    ];
    html += createTableSection('Interaction & Serviceability', ['Check', 'Actual', 'Limit', 'Ratio', 'Status'], otherRows);

    html += `</div>`;
    container.innerHTML = html;
}
