/**
 * 3D Strut and Tie Model Calculator
 * Features: Frontend for Python Solver, Babylon.js Visualization
 */

// --- Global State ---
let stmEngine = null;
let stmScene = null;
let nodeCounter = 1;

const DEFAULT_NODES = [
    { id: 1, x: 0, y: 0, z: 0, fixed: true, load: 0 },
    { id: 2, x: 10, y: 0, z: 0, fixed: true, load: 0 },
    { id: 3, x: 5, y: 8, z: 0, fixed: false, load: -50 } // Apex
];
const DEFAULT_MEMBERS = [
    { start: 1, end: 3, type: 'strut' },
    { start: 2, end: 3, type: 'strut' },
    { start: 1, end: 2, type: 'tie' }
];

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Shared Utils (Header/Footer)
    if (typeof injectHeader === 'function') {
        injectHeader({
            activePage: 'stm',
            pageTitle: 'strut_tie', // Add key to i18n if needed
            headerPlaceholderId: 'header-placeholder',
            pathPrefix: '../'
        });
    }
    if (typeof injectFooter === 'function') {
        injectFooter({
            footerPlaceholderId: 'footer-placeholder',
            pathPrefix: '../'
        });
    }
    
    // 2. Setup Default Data
    renderNodeTable(DEFAULT_NODES);
    renderMemberTable(DEFAULT_MEMBERS);

    // 3. UI Event Listeners
    document.getElementById('add-node-btn').addEventListener('click', () => addNodeRow());
    document.getElementById('add-member-btn').addEventListener('click', () => addMemberRow());
    document.getElementById('run-stm-btn').addEventListener('click', handleCalculation); // Explicitly attach
    
    // 4. Initialize Babylon Engine
    init3D();
});

// --- UI Helpers for Dynamic Tables ---

function renderNodeTable(nodes) {
    const tbody = document.querySelector('#nodes-table tbody');
    tbody.innerHTML = '';
    nodes.forEach(n => addNodeRow(n));
    if (nodes.length > 0) nodeCounter = Math.max(...nodes.map(n => n.id)) + 1;
}

function renderMemberTable(members) {
    const tbody = document.querySelector('#members-table tbody');
    tbody.innerHTML = '';
    members.forEach(m => addMemberRow(m));
}

function addNodeRow(data = null) {
    const tbody = document.querySelector('#nodes-table tbody');
    const tr = document.createElement('tr');
    const id = data ? data.id : nodeCounter++;
    
    tr.innerHTML = `
        <td class="p-1"><input type="number" class="node-id w-12 p-1 border rounded text-center bg-gray-100 dark:bg-gray-700" value="${id}" readonly></td>
        <td class="p-1"><input type="number" class="node-x w-16 p-1 border rounded dark:bg-gray-700" value="${data?.x ?? 0}" step="0.1"></td>
        <td class="p-1"><input type="number" class="node-y w-16 p-1 border rounded dark:bg-gray-700" value="${data?.y ?? 0}" step="0.1"></td>
        <td class="p-1"><input type="number" class="node-z w-16 p-1 border rounded dark:bg-gray-700" value="${data?.z ?? 0}" step="0.1"></td>
        <td class="p-1 text-center"><input type="checkbox" class="node-fix" ${data?.fixed ? 'checked' : ''}></td>
        <td class="p-1"><input type="number" class="node-load w-16 p-1 border rounded dark:bg-gray-700" value="${data?.load ?? 0}"></td>
        <td class="p-1"><button onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

function addMemberRow(data = null) {
    const tbody = document.querySelector('#members-table tbody');
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
        <td class="p-1"><input type="number" class="mem-start w-16 p-1 border rounded dark:bg-gray-700" value="${data?.start ?? 1}"></td>
        <td class="p-1"><input type="number" class="mem-end w-16 p-1 border rounded dark:bg-gray-700" value="${data?.end ?? 2}"></td>
        <td class="p-1">
            <select class="mem-type p-1 border rounded w-24 dark:bg-gray-700">
                <option value="strut" ${data?.type === 'strut' ? 'selected' : ''}>Strut</option>
                <option value="tie" ${data?.type === 'tie' ? 'selected' : ''}>Tie</option>
            </select>
        </td>
        <td class="p-1"><button onclick="this.closest('tr').remove()" class="text-red-500 hover:text-red-700">&times;</button></td>
    `;
    tbody.appendChild(tr);
}

function gatherSTMInputs() {
    const nodes = [];
    document.querySelectorAll('#nodes-table tbody tr').forEach(tr => {
        nodes.push({
            id: parseInt(tr.querySelector('.node-id').value),
            x: parseFloat(tr.querySelector('.node-x').value) || 0,
            y: parseFloat(tr.querySelector('.node-y').value) || 0,
            z: parseFloat(tr.querySelector('.node-z').value) || 0,
            fixed: tr.querySelector('.node-fix').checked,
            load: parseFloat(tr.querySelector('.node-load').value) || 0
        });
    });

    const members = [];
    document.querySelectorAll('#members-table tbody tr').forEach(tr => {
        members.push({
            start: parseInt(tr.querySelector('.mem-start').value),
            end: parseInt(tr.querySelector('.mem-end').value),
            type: tr.querySelector('.mem-type').value
        });
    });

    return {
        fc: parseFloat(document.getElementById('fc').value) || 4,
        fy: parseFloat(document.getElementById('fy').value) || 60,
        nodes,
        members
    };
}

// --- Main Handler ---

async function handleCalculation() {
    const inputs = gatherSTMInputs();
    
    if (typeof showFeedback === 'function') {
        showFeedback('Calculating...', 'info', 'feedback-message');
    }
    
    const btn = document.getElementById('run-stm-btn');
    if(btn) {
        btn.disabled = true;
        btn.textContent = "Calculating...";
    }

    try {
        // CALL PYTHON API via EEL
        if (!window.eel || !window.eel.solve_stm) {
            throw new Error("Eel not initialized or solve_stm not found.");
        }

        const solveResult = await window.eel.solve_stm(inputs)();

        if (solveResult.error) {
            if (typeof showFeedback === 'function') showFeedback(solveResult.error, 'error', 'feedback-message');
            else alert(solveResult.error);
            return;
        }

        // 2. Update Visualization
        // Note: results comes as a list directly or inside 'results' key? 
        // Backend returns "return results" (list) OR {'error': ...}
        // Let's check backend... returns a list of result dicts if successful.
        
        let results = solveResult;
        if (solveResult.results) results = solveResult.results; // Handle if wrapped

        update3D(inputs, results);

        // 3. Generate Report
        // Using generic reporter if available, or simple logic
        // We can reuse the existing generateReport logic if we update it to use HTML string building
        generateReport(inputs, results);
        
        if (typeof showFeedback === 'function') showFeedback('Calculation complete!', 'success', 'feedback-message');

    } catch (error) {
        console.error(error);
        if (typeof showFeedback === 'function') showFeedback(`Error: ${error.message}`, 'error', 'feedback-message');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "Calculate (Python) & Visualize";
        }
    }
}

function generateReport(inputs, results) {
    const container = document.getElementById('stm-results-container');
    if (!container) return;

    // Build Report HTML
    let html = `
        <div id="stm-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md mt-6">
            <div class="flex justify-between items-center border-b pb-4 mb-4">
                <h2 class="text-2xl font-bold text-gray-800 dark:text-white">Strut and Tie Calculation Report</h2>
                <div class="space-x-2 print-hidden">
                    <button class="btn-copy-report bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 px-3 py-1 rounded text-sm transition" onclick="handleCopy('stm-report-content', {engine: stmEngine, scene: stmScene})">
                        Copy to Clipboard
                    </button>
                </div>
            </div>

            <div class="mb-6">
                <h3 class="text-lg font-semibold mb-2 text-blue-600 dark:text-blue-400">Analysis Summary</h3>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <p><b>Total Nodes:</b> ${inputs.nodes.length}</p>
                    <p><b>Total Members:</b> ${inputs.members.length}</p>
                    <p><b>Materials:</b> f'c = ${inputs.fc} ksi, fy = ${inputs.fy} ksi</p>
                    <p class="text-gray-500">Calculated via Python/NumPy Backend</p>
                </div>
            </div>

            <div class="mb-6">
                <h3 class="text-lg font-semibold mb-2 text-blue-600 dark:text-blue-400">Member Forces</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left border-collapse">
                        <thead class="bg-gray-100 dark:bg-gray-700">
                            <tr>
                                <th class="p-2 border dark:border-gray-600">Member</th>
                                <th class="p-2 border dark:border-gray-600">Nodes</th>
                                <th class="p-2 border dark:border-gray-600">Type</th>
                                <th class="p-2 border dark:border-gray-600">Force</th>
                                <th class="p-2 border dark:border-gray-600">Length</th>
                                <th class="p-2 border dark:border-gray-600">Status</th>
                            </tr>
                        </thead>
                        <tbody>
    `;

    results.forEach(r => {
        // Basic Capacity Checks
        let capacity = 0;
        let area_assumed = 10; 
        
        if (r.type === 'strut') {
            capacity = 0.85 * inputs.fc * area_assumed; 
        } else {
            capacity = inputs.fy * area_assumed;
        }
        
        const mag = Math.abs(r.force);
        const ratio = mag / capacity;
        
        let statusText = "OK";
        let statusClass = "text-green-600 font-bold";
        
        if (r.type === 'strut' && r.force > 0.1) {
            statusText = "Tension in Strut!";
            statusClass = "text-red-600 font-bold";
        } else if (r.type === 'tie' && r.force < -0.1) {
            statusText = "Comp. in Tie!";
            statusClass = "text-red-600 font-bold";
        } else if (ratio > 1.0) {
            statusText = "Overstressed";
            statusClass = "text-red-600 font-bold";
        }

        html += `
            <tr class="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td class="p-2 border dark:border-gray-600">Member ${r.id}</td>
                <td class="p-2 border dark:border-gray-600">${r.start_node} ➝ ${r.end_node}</td>
                <td class="p-2 border dark:border-gray-600">${r.type.toUpperCase()}</td>
                <td class="p-2 border dark:border-gray-600 font-mono">${r.force.toFixed(2)} kips</td>
                <td class="p-2 border dark:border-gray-600">${r.length.toFixed(2)} ft</td>
                <td class="p-2 border dark:border-gray-600 ${statusClass}">${statusText}</td>
            </tr>
        `;
    });

    html += `
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="text-xs text-gray-500 mt-4 border-t pt-2">
                * Note: Capacity checks assume an arbitrary area of 10 in² for preliminary purposes.
            </div>
        </div>
    `;

    container.innerHTML = html;
}


// --- Babylon.js Visualization ---

function init3D() {
    const canvas = document.getElementById("renderCanvas");
    stmEngine = new BABYLON.Engine(canvas, true);
    
    const createScene = function () {
        const scene = new BABYLON.Scene(stmEngine);
        scene.clearColor = new BABYLON.Color4(0.95, 0.95, 0.95, 1); 

        // Camera
        const camera = new BABYLON.ArcRotateCamera("camera1", Math.PI / 2, Math.PI / 3, 20, new BABYLON.Vector3(5, 5, 0), scene);
        camera.attachControl(canvas, true);
        camera.wheelPrecision = 50;

        // Light
        const light = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.8;

        return scene;
    };

    stmScene = createScene();
    
    stmEngine.runRenderLoop(function () {
        stmScene.render();
    });

    window.addEventListener("resize", function () {
        stmEngine.resize();
    });
}

function update3D(inputs, results) {
    if (!stmScene) return;

    // Dispose old meshes
    stmScene.meshes.forEach(m => {
        if (m.name !== "ground" && m.id !== "ground") m.dispose();
    });
    
    // Axes
    new BABYLON.AxesViewer(stmScene, 2);

    // Map Node Positions
    const nodeMap = {};
    inputs.nodes.forEach(n => {
        nodeMap[n.id] = new BABYLON.Vector3(n.x, n.y, n.z);
        
        // Node
        const sphere = BABYLON.MeshBuilder.CreateSphere("node"+n.id, {diameter: 0.5}, stmScene);
        sphere.position = nodeMap[n.id];
        
        const mat = new BABYLON.StandardMaterial("matNode", stmScene);
        mat.diffuseColor = n.fixed ? BABYLON.Color3.Black() : BABYLON.Color3.Gray();
        sphere.material = mat;

        // Support Box
        if (n.fixed) {
            const box = BABYLON.MeshBuilder.CreateBox("support"+n.id, {size: 0.8}, stmScene);
            box.position = nodeMap[n.id].add(new BABYLON.Vector3(0, -0.6, 0));
        }

        // Load Arrow
        if (n.load !== 0) {
            // Visualize load vector
            const dir = new BABYLON.Vector3(0, n.load > 0 ? 1 : -1, 0); // Y direction
            const origin = nodeMap[n.id];
            const length = 2;
            
            // Draw a red line for load
            const lines = BABYLON.MeshBuilder.CreateLines("loadLine"+n.id, {
                points: [origin, origin.add(dir.scale(length))]
            }, stmScene);
            lines.color = BABYLON.Color3.Purple();
        }
    });

    // Draw Members
    inputs.members.forEach((m, idx) => {
        const p1 = nodeMap[m.start];
        const p2 = nodeMap[m.end];
        if (!p1 || !p2) return;

        // Color Coding based on result
        const res = results[idx];
        const force = res ? res.force : 0;
        
        // Compression (Negative) -> Blue, Tension (Positive) -> Red
        // Standard STM: Struts (Comp) = Dashed/Blue, Ties (Tens) = Solid/Red
        
        let color;
        if (force < 0) color = BABYLON.Color3.Blue();      // Compression
        else if (force > 0) color = BABYLON.Color3.Red();  // Tension
        else color = BABYLON.Color3.Gray();                // Zero force

        // Struts thicker
        const thickness = m.type === 'strut' ? 0.35 : 0.15;

        const tube = BABYLON.MeshBuilder.CreateTube("mem"+idx, {
            path: [p1, p2],
            radius: thickness,
            cap: BABYLON.Mesh.CAP_ALL
        }, stmScene);

        const mat = new BABYLON.StandardMaterial("matMem"+idx, stmScene);
        mat.diffuseColor = color;
        tube.material = mat;
    });
}