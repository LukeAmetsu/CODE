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
    document.getElementById('run-stm-btn').addEventListener('click', handleCalculation); 
    document.getElementById('generate-btn').addEventListener('click', handleGeneration); 
    
    // Live update for geometry inputs
    ['geom-x', 'geom-y', 'geom-z'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
             update3D(gatherSTMInputs(), []);
        });
    });

    // 4. Initialize Babylon Engine
    init3D();
});

// --- Table Helpers ---

function renderNodeTable(nodes) {
    const tbody = document.querySelector('#nodes-table tbody');
    tbody.innerHTML = '';
    
    // Update nodeCounter if needed
    if (nodes.length > 0) {
        const maxId = Math.max(...nodes.map(n => n.id));
        if (maxId >= nodeCounter) nodeCounter = maxId + 1;
    }

    nodes.forEach(node => {
        addNodeRow(node, tbody);
    });
}

function addNodeRow(node = null, tbody = null) {
    if (!tbody) tbody = document.querySelector('#nodes-table tbody');
    
    const id = node ? node.id : nodeCounter++;
    const x = node ? node.x : 0;
    const y = node ? node.y : 0;
    const z = node ? node.z : 0;
    const fixed = node ? node.fixed : false;
    const load = node ? node.load : 0;

    const tr = document.createElement('tr');
    tr.dataset.id = id;
    tr.innerHTML = `
        <td>${id}</td>
        <td><input type="number" class="form-control form-control-sm node-x" value="${x}" step="any"></td>
        <td><input type="number" class="form-control form-control-sm node-y" value="${y}" step="any"></td>
        <td><input type="number" class="form-control form-control-sm node-z" value="${z}" step="any"></td>
        <td><input type="checkbox" class="form-check-input node-fixed" ${fixed ? 'checked' : ''}></td>
        <td><input type="number" class="form-control form-control-sm node-load" value="${load}" step="any"></td>
        <td>
            <button class="btn btn-sm btn-outline-danger delete-node-btn" title="Delete Node">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;

    // Event Listeners for inputs to update 3D immediately
    tr.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
             // Defer update slightly to avoid lagging on every keystroke if needed, but direct is usually fine
             update3D(gatherSTMInputs(), []);
        });
    });

    tr.querySelector('.delete-node-btn').addEventListener('click', () => {
        tr.remove();
        update3D(gatherSTMInputs(), []);
    });

    tbody.appendChild(tr);
    
    // If added manually, update 3D
    if (!node) update3D(gatherSTMInputs(), []);
}

function renderMemberTable(members) {
    const tbody = document.querySelector('#members-table tbody');
    tbody.innerHTML = '';
    members.forEach(member => {
        addMemberRow(member, tbody);
    });
}

function addMemberRow(member = null, tbody = null) {
    if (!tbody) tbody = document.querySelector('#members-table tbody');

    const start = member ? member.start : '';
    const end = member ? member.end : '';
    const type = member ? member.type : 'strut';

    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="number" class="form-control form-control-sm member-start" value="${start}" placeholder="Start Node ID"></td>
        <td><input type="number" class="form-control form-control-sm member-end" value="${end}" placeholder="End Node ID"></td>
        <td>
            <select class="form-select form-select-sm member-type">
                <option value="strut" ${type === 'strut' ? 'selected' : ''}>Strut</option>
                <option value="tie" ${type === 'tie' ? 'selected' : ''}>Tie</option>
            </select>
        </td>
        <td class="member-result">--</td>
        <td>
            <button class="btn btn-sm btn-outline-danger delete-member-btn" title="Delete Member">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    
    tr.querySelectorAll('input, select').forEach(input => {
        input.addEventListener('input', () => {
             update3D(gatherSTMInputs(), []);
        });
    });

    tr.querySelector('.delete-member-btn').addEventListener('click', () => {
        tr.remove();
        update3D(gatherSTMInputs(), []);
    });

    tbody.appendChild(tr);
    
    if (!member) update3D(gatherSTMInputs(), []);
}

function gatherSTMInputs() {
    // 1. Geometry
    const L = parseFloat(document.getElementById('geom-x').value) || 0;
    const H = parseFloat(document.getElementById('geom-y').value) || 0;
    const B = parseFloat(document.getElementById('geom-z').value) || 0;

    // 2. Nodes
    const nodes = [];
    document.querySelectorAll('#nodes-table tbody tr').forEach(tr => {
        nodes.push({
            id: parseInt(tr.dataset.id),
            x: parseFloat(tr.querySelector('.node-x').value) || 0,
            y: parseFloat(tr.querySelector('.node-y').value) || 0,
            z: parseFloat(tr.querySelector('.node-z').value) || 0,
            fixed: tr.querySelector('.node-fixed').checked,
            load: parseFloat(tr.querySelector('.node-load').value) || 0
        });
    });

    // 3. Members
    const members = [];
    document.querySelectorAll('#members-table tbody tr').forEach(tr => {
        members.push({
            start: parseInt(tr.querySelector('.member-start').value) || 0,
            end: parseInt(tr.querySelector('.member-end').value) || 0,
            type: tr.querySelector('.member-type').value
        });
    });

    return {
        geometry: { L, H, B },
        nodes,
        members
    };
}

// --- Logic Handlers ---

async function handleCalculation() {
    if (!stmEngine) {
        // Initialize if not already (should be in init3D or lazy load)
        // For local development without py script attached properly it might fail
        // But let's assume 'eel' is exposed or we mock it.
        // If we really need to call python:
        if (window.eel && window.eel.solve_stm_system) {
            stmEngine = { solve_truss_system: window.eel.solve_stm_system }; 
        } else {
             console.warn("Eel not found, using Mock Engine or failing.");
             return;
        }
    }

    const data = gatherSTMInputs();
    
    // Basic validation
    if (data.nodes.length < 2 || data.members.length < 1) {
        alert("Please define at least 2 nodes and 1 member.");
        return;
    }

    // Call Backend
    try {
        const result = await window.eel.solve_stm(data)();
        if (result.error) {
            alert("Error: " + result.error);
        } else {
            // Update Table Results
            const rows = document.querySelectorAll('#members-table tbody tr');
            result.results.forEach((res, idx) => {
                if (rows[idx]) {
                    const cell = rows[idx].querySelector('.member-result');
                    cell.textContent = `${res.force.toFixed(2)} (${res.force < 0 ? 'C' : 'T'})`;
                    // Color code text
                    cell.style.color = res.force < 0 ? 'blue' : (res.force > 0 ? 'red' : 'black');
                }
            });

            // Update 3D
            update3D(data, result.results);
            
            // Show Warnings
            if (result.warnings && result.warnings.length > 0) {
                 alert("Warnings:\n" + result.warnings.join("\n"));
            }
        }
    } catch (e) {
        console.error("Calculation failed", e);
        alert("Calculation failed: " + e);
    }
}

async function handleGeneration() {
    const template = document.getElementById('template-select').value;
    const inputs = gatherSTMInputs();
    
    // Call backend to generate nodes/members
    try {
        const result = await window.eel.generate_stm_template(template, inputs.geometry)();
        if (result) {
            renderNodeTable(result.nodes);
            renderMemberTable(result.members);
            update3D(gatherSTMInputs(), []); // Refresh 3D without results
        }
    } catch (e) {
        console.error("Generation failed", e);
        alert("Generation failed: " + e);
    }
}

function update3D(inputs, results) {
    if (!stmScene) return;

    // Dispose old meshes
    stmScene.meshes.forEach(m => {
        if (m.name !== "ground" && m.id !== "ground" && m.name !== "skyBox") {
             // Keep camera/lights if they are meshes (usually nodes/lights are separate)
             // Better: Dispose strictly created meshes.
             m.dispose();
        }
    });
    
    // Axes
    new BABYLON.AxesViewer(stmScene, 2);

    // 1. Draw Member Geometry (Transparent Box)
    if (inputs.geometry) {
        const { L, H, B } = inputs.geometry;
        if (L > 0 && H > 0 && B > 0) {
            const box = BABYLON.MeshBuilder.CreateBox("memberGeo", {
                width: L,
                height: H,
                depth: B
            }, stmScene);
            
            // Position: Center depends on origin. 
            // Our nodes usually start at (0,0,0). So box should be from 0 to L in X, 0 to H in Y.
            // Z center depends on thickness B. Assuming centered at Z=0.
            box.position = new BABYLON.Vector3(L/2, H/2, 0);
            
            const mat = new BABYLON.StandardMaterial("matGeo", stmScene);
            mat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.9);
            mat.alpha = 0.2; // Transparent
            mat.backFaceCulling = false;
            box.material = mat;
            box.isPickable = false; // Don't interfere with node picking if added later
        }
    }

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
        // Check if results exist and correspond to this member (by index or ID)
        // Ideally results should be a map or matched by ID. Current backend returns list in same order.
        // Let's assume order is preserved for now.
        const res = results[idx];
        const force = res ? res.force : 0;
        
        let color;
        if (force < -0.01) color = BABYLON.Color3.Blue();      // Compression
        else if (force > 0.01) color = BABYLON.Color3.Red();  // Tension
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

function init3D() {
    const canvas = document.getElementById('renderCanvas');
    if (!canvas) {
        console.warn('stmScene canvas not found. 3D visualization disabled.');
        return;
    }
    stmEngine = new BABYLON.Engine(canvas, true);
    stmScene = new BABYLON.Scene(stmEngine);
    stmScene.clearColor = new BABYLON.Color4(0.95, 0.95, 0.95, 1);
    
    // Camera
    const camera = new BABYLON.ArcRotateCamera("camera", Math.PI / 4, Math.PI / 3, 30, BABYLON.Vector3.Zero(), stmScene);
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 50;

    // Light
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), stmScene);
    light.intensity = 0.7;

    stmEngine.runRenderLoop(() => {
        stmScene.render();
    });

    window.addEventListener("resize", () => {
        stmEngine.resize();
    });
}

// =========================================================================
// STM PROJECT SAVE / LOAD
// =========================================================================

function saveProjectJSON() {
    const data = {
        app: "STM_Strut_and_Tie",
        version: "1.0",
        timestamp: new Date().toISOString(),
        stmData: gatherSTMInputs()
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `stm_model_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof showUniversalToast === 'function') {
        showUniversalToast('STM Model saved successfully! 💾');
    }
}

function loadProjectJSON(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            const stm = parsed.stmData || parsed;

            if (stm.geometry) {
                if (document.getElementById('geom-x')) document.getElementById('geom-x').value = stm.geometry.L;
                if (document.getElementById('geom-y')) document.getElementById('geom-y').value = stm.geometry.H;
                if (document.getElementById('geom-z')) document.getElementById('geom-z').value = stm.geometry.B;
            }

            if (stm.nodes && Array.isArray(stm.nodes)) {
                renderNodeTable(stm.nodes);
            }
            if (stm.members && Array.isArray(stm.members)) {
                renderMemberTable(stm.members);
            }

            const current = gatherSTMInputs();
            update3D(current, []);

            if (typeof showUniversalToast === 'function') {
                showUniversalToast('STM Model loaded successfully! ✅');
            }
        } catch (err) {
            console.error('Error loading STM JSON:', err);
            alert('Failed to load STM project file. Ensure it is valid JSON.');
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsText(file);
}

window.saveProjectJSON = saveProjectJSON;
window.loadProjectJSON = loadProjectJSON;
window.exportProjectJSON = saveProjectJSON;
window.importProjectJSON = loadProjectJSON;