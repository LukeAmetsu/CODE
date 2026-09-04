/**
 * Beam-to-Column Connection Calculator Logic & 3D Visualization
 */

let shapesDB = {};
let selectedBeam = null;
let selectedColumn = null;

// Materials Database
const materialsDB = {
    "A36": { Fy: 36, Fu: 58 },
    "A992": { Fy: 50, Fu: 65 },
    "A572-50": { Fy: 50, Fu: 65 },
    "A53-B": { Fy: 35, Fu: 60 },
    "A500-B": { Fy: 42, Fu: 58 },
    "A500-C": { Fy: 46, Fu: 62 }
};

document.addEventListener('DOMContentLoaded', async () => {
    initTabs();
    initViewToggles();
    await initDropdowns();

    // Toggles logic
    const colConnType = document.getElementById('sp_col_conn_type');
    const colWeld = document.getElementById('sp_col_weld_inputs');
    const colBolt = document.getElementById('sp_col_bolt_inputs');
    colConnType.addEventListener('change', () => {
        if(colConnType.value === 'Welded') {
            colWeld.classList.remove('hidden');
            colBolt.classList.add('hidden');
        } else {
            colWeld.classList.add('hidden');
            colBolt.classList.remove('hidden');
        }
        updateScene();
    });

    const beamConnType = document.getElementById('sp_beam_conn_type');
    const beamWeld = document.getElementById('sp_beam_weld_inputs');
    const beamBolt = document.getElementById('sp_beam_bolt_inputs');
    beamConnType.addEventListener('change', () => {
        if(beamConnType.value === 'Welded') {
            beamWeld.classList.remove('hidden');
            beamBolt.classList.add('hidden');
        } else {
            beamWeld.classList.add('hidden');
            beamBolt.classList.remove('hidden');
        }
        updateScene();
    });

    const momentToggle = document.getElementById('include_moment');
    const momentInputs = document.getElementById('moment_inputs_container');
    if (momentToggle && momentInputs) {
        momentToggle.addEventListener('change', () => {
            if (momentToggle.checked) {
                momentInputs.classList.remove('hidden');
            } else {
                momentInputs.classList.add('hidden');
            }
            updateScene();
        });
    }

    const fpType = document.getElementById('fp_type');
    const plateInputs = document.getElementById('moment_plate_inputs');
    const angleInputs = document.getElementById('moment_angle_inputs');
    if (fpType && plateInputs && angleInputs) {
        fpType.addEventListener('change', () => {
            if (fpType.value === 'Angle') {
                plateInputs.classList.add('hidden');
                angleInputs.classList.remove('hidden');
            } else {
                plateInputs.classList.remove('hidden');
                angleInputs.classList.add('hidden');
            }
            updateScene();
        });
    }

    document.getElementById('calculate-btn').addEventListener('click', runCalculation);
    
    // Auto-update 3D when inputs change
    document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', updateScene);
    });

    initBabylon();
});

function initTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.add('hidden'));

            btn.classList.add('active');
            const target = document.getElementById(btn.dataset.target);
            if (target) target.classList.remove('hidden');
        });
    });
}

function initViewToggles() {
    const viewBtns = document.querySelectorAll('.view-btn');
    const view3D = document.getElementById('view-3d');
    const viewReport = document.getElementById('view-report');

    viewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            viewBtns.forEach(b => b.classList.remove('active', 'bg-blue-50', 'text-blue-700', 'dark:bg-blue-900/30', 'dark:text-blue-300'));
            btn.classList.add('active', 'bg-blue-50', 'text-blue-700', 'dark:bg-blue-900/30', 'dark:text-blue-300');

            if (btn.dataset.view === '3d') {
                view3D.classList.remove('hidden');
                viewReport.classList.add('hidden');
                engine.resize();
            } else {
                view3D.classList.add('hidden');
                viewReport.classList.remove('hidden');
            }
        });
    });
}

function populateMaterialDropdown(selectId, defaultMat) {
    const select = document.getElementById(selectId);
    select.innerHTML = '';
    for (const mat in materialsDB) {
        const option = document.createElement('option');
        option.value = mat;
        option.textContent = mat;
        if (mat === defaultMat) option.selected = true;
        select.appendChild(option);
    }
}

async function initDropdowns() {
    populateMaterialDropdown('column_material', 'A992');
    populateMaterialDropdown('beam_material', 'A992');
    populateMaterialDropdown('sp_material', 'A36');
    populateMaterialDropdown('fp_material', 'A36');

    try {
        const shapesList = await eel.get_shapes_by_type('W')();
        const beamSelect = document.getElementById('beam_shape_select');
        const colSelect = document.getElementById('column_shape_select');
        
        shapesList.forEach(shape => {
            beamSelect.add(new Option(shape, shape));
            colSelect.add(new Option(shape, shape));
        });

        // Set defaults
        if(shapesList.includes("W14X90")) colSelect.value = "W14X90";
        if(shapesList.includes("W18X50")) beamSelect.value = "W18X50";
        
        await loadShapeDetails();
        
        colSelect.addEventListener('change', loadShapeDetails);
        beamSelect.addEventListener('change', loadShapeDetails);
    } catch(e) {
        console.error("Error loading shapes:", e);
    }
}

async function loadShapeDetails() {
    const colShape = document.getElementById('column_shape_select').value;
    const beamShape = document.getElementById('beam_shape_select').value;

    if (colShape) selectedColumn = await eel.get_shape_details(colShape)();
    if (beamShape) selectedBeam = await eel.get_shape_details(beamShape)();
    
    updateScene();
}

// --- BABYLON 3D VISUALIZATION ---
let canvas, engine, scene, camera;
let beamMesh, colMesh, shearTabMesh, topFPMesh, botFPMesh;
let boltMeshes = [];

function initBabylon() {
    canvas = document.getElementById("renderCanvas");
    engine = new BABYLON.Engine(canvas, true);

    const createScene = function () {
        const s = new BABYLON.Scene(engine);
        s.clearColor = new BABYLON.Color4(0.9, 0.9, 0.9, 1);
        if (document.documentElement.classList.contains('dark')) {
            s.clearColor = new BABYLON.Color4(0.1, 0.1, 0.12, 1);
        }

        camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 4, Math.PI / 3, 50, BABYLON.Vector3.Zero(), s);
        camera.attachControl(canvas, true);
        camera.wheelPrecision = 20;

        const light1 = new BABYLON.HemisphericLight("light1", new BABYLON.Vector3(1, 1, 0), s);
        const light2 = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), s);
        light2.intensity = 0.7;

        return s;
    };

    scene = createScene();
    
    engine.runRenderLoop(function () {
        scene.render();
    });

    window.addEventListener("resize", function () {
        engine.resize();
    });

    updateScene();
}

function createIShapeProfile(shapeData) {
    if(!shapeData) return [];
    const d = shapeData.d;
    const bf = shapeData.bf;
    const tf = shapeData.tf;
    const tw = shapeData.tw;

    return [
        new BABYLON.Vector3(-bf/2, 0, -d/2),
        new BABYLON.Vector3(bf/2, 0, -d/2),
        new BABYLON.Vector3(bf/2, 0, -d/2 + tf),
        new BABYLON.Vector3(tw/2, 0, -d/2 + tf),
        new BABYLON.Vector3(tw/2, 0, d/2 - tf),
        new BABYLON.Vector3(bf/2, 0, d/2 - tf),
        new BABYLON.Vector3(bf/2, 0, d/2),
        new BABYLON.Vector3(-bf/2, 0, d/2),
        new BABYLON.Vector3(-bf/2, 0, d/2 - tf),
        new BABYLON.Vector3(-tw/2, 0, d/2 - tf),
        new BABYLON.Vector3(-tw/2, 0, -d/2 + tf),
        new BABYLON.Vector3(-bf/2, 0, -d/2 + tf)
    ];
}

function updateScene() {
    if (!scene || !selectedColumn || !selectedBeam) return;

    // Clear old meshes
    if (beamMesh) beamMesh.dispose();
    if (colMesh) colMesh.dispose();
    if (shearTabMesh) shearTabMesh.dispose();
    if (topFPMesh) topFPMesh.dispose();
    if (botFPMesh) botFPMesh.dispose();
    boltMeshes.forEach(b => b.dispose());
    boltMeshes = [];

    // Materials
    const steelMatCol = new BABYLON.StandardMaterial("steelCol", scene);
    steelMatCol.diffuseColor = new BABYLON.Color3(0.0, 0.8, 0.9); // Cyan-ish for primary
    
    const steelMatBeam = new BABYLON.StandardMaterial("steelBeam", scene);
    steelMatBeam.diffuseColor = new BABYLON.Color3(0.9, 0.6, 0.3); // Orange-ish for secondary

    const plateMat = new BABYLON.StandardMaterial("plate", scene);
    plateMat.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8); // Blue-ish for plates

    const boltMat = new BABYLON.StandardMaterial("bolt", scene);
    boltMat.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8); // Silver for bolts

    const primaryType = document.getElementById('primary_member_type').value;

    // 1. Primary Member (Column or Beam)
    const colProf = createIShapeProfile(selectedColumn);
    const colLength = 48; // 4 ft for visual
    colProf.push(colProf[0]); // close shape
    colMesh = BABYLON.MeshBuilder.ExtrudePolygon("col", {shape: colProf, depth: colLength, sideOrientation: BABYLON.Mesh.DOUBLESIDE}, scene);
    colMesh.material = steelMatCol;
    
    // Reset rotations
    colMesh.rotation = new BABYLON.Vector3(0, 0, 0);
    colMesh.position = new BABYLON.Vector3(0, 0, 0);

    const colD = selectedColumn.d;
    const colBf = selectedColumn.bf;
    const colTw = selectedColumn.tw;
    
    let supportFaceZ = colD / 2; // Default if framing into flange
    
    if (primaryType === 'Column') {
        colMesh.position.y = colLength / 2;
    } else {
        // Beam-to-Beam (Primary is horizontal, framing into web)
        // Rotate so it lies along X axis, and web is vertical
        colMesh.rotation.z = Math.PI / 2;
        colMesh.rotation.x = Math.PI / 2;
        colMesh.position.x = -colLength / 2;
        supportFaceZ = colTw / 2; // Framing into web
    }

    // 2. Beam (Horizontal framing into column flange)
    const beamProf = createIShapeProfile(selectedBeam);
    const beamLength = 36;
    beamProf.push(beamProf[0]);
    beamMesh = BABYLON.MeshBuilder.ExtrudePolygon("beam", {shape: beamProf, depth: beamLength, sideOrientation: BABYLON.Mesh.DOUBLESIDE}, scene);
    beamMesh.material = steelMatBeam;
    
    // Rotate beam so it's horizontal. 
    // rotation.x = -PI/2 puts it along the positive Z axis.
    beamMesh.rotation.x = -Math.PI / 2;
    
    // After rotation: Width(bf) is along X, Depth(d) is along Y. Web is vertical. 
    // It extrudes towards positive Z.
    
    const gap = 0.5; // inch
    // Position beam to frame into primary support face
    beamMesh.position.z = supportFaceZ + gap;
    
    // Focus camera
    camera.setTarget(new BABYLON.Vector3(0, 0, supportFaceZ));
    camera.radius = selectedColumn.d + selectedBeam.d + 15;

    // 3. Shear Plates (or Angles)
    const plateType = document.getElementById('sp_plate_type').value;
    const isDouble = plateType === 'Double';
    const isBoltedCol = document.getElementById('sp_col_conn_type').value === 'Bolted';
    const spThick = parseFloat(document.getElementById('sp_thickness').value) || 0.375;
    const spWidth = parseFloat(document.getElementById('sp_width').value) || 5;
    const spRows = parseFloat(document.getElementById('sp_beam_bolt_rows').value) || 4;
    const spPitch = parseFloat(document.getElementById('sp_beam_bolt_spacing').value) || 3;
    
    let spHeight = parseFloat(document.getElementById('sp_length').value);
    if (!spHeight) {
        if (document.getElementById('sp_beam_conn_type').value === 'Bolted') {
            spHeight = spRows * spPitch + 3;
        } else {
            spHeight = selectedBeam.d - 2 * selectedBeam.tf - 2; // Default for welded
        }
    }

    // Web Legs (Plate extending along Z)
    shearTabMesh = BABYLON.MeshBuilder.CreateBox("sp", {width: spThick, height: spHeight, depth: spWidth}, scene);
    shearTabMesh.material = plateMat;
    shearTabMesh.position.z = supportFaceZ + spWidth/2;
    shearTabMesh.position.y = 0;
    
    let parts = [shearTabMesh];
    const osLegWidth = 3; // Visual width of the outstanding leg

    if(isDouble) {
        shearTabMesh.position.x = selectedBeam.tw/2 + spThick/2;
        
        let shearTabMesh2 = BABYLON.MeshBuilder.CreateBox("sp2", {width: spThick, height: spHeight, depth: spWidth}, scene);
        shearTabMesh2.material = plateMat;
        shearTabMesh2.position.z = supportFaceZ + spWidth/2;
        shearTabMesh2.position.y = 0;
        shearTabMesh2.position.x = -(selectedBeam.tw/2 + spThick/2);
        parts.push(shearTabMesh2);

        // If Double or Bolted to Col, assume they are angles and draw outstanding legs
        let osLeg1 = BABYLON.MeshBuilder.CreateBox("os1", {width: osLegWidth, height: spHeight, depth: spThick}, scene);
        osLeg1.material = plateMat;
        osLeg1.position.z = supportFaceZ + spThick/2;
        osLeg1.position.y = 0;
        osLeg1.position.x = selectedBeam.tw/2 + spThick + osLegWidth/2;
        parts.push(osLeg1);

        let osLeg2 = BABYLON.MeshBuilder.CreateBox("os2", {width: osLegWidth, height: spHeight, depth: spThick}, scene);
        osLeg2.material = plateMat;
        osLeg2.position.z = supportFaceZ + spThick/2;
        osLeg2.position.y = 0;
        osLeg2.position.x = -(selectedBeam.tw/2 + spThick + osLegWidth/2);
        parts.push(osLeg2);
        
    } else {
        shearTabMesh.position.x = selectedBeam.tw/2 + spThick/2;
        
        // Single Angle outstanding leg
        if (isBoltedCol) {
            let osLeg1 = BABYLON.MeshBuilder.CreateBox("os1", {width: osLegWidth, height: spHeight, depth: spThick}, scene);
            osLeg1.material = plateMat;
            osLeg1.position.z = supportFaceZ + spThick/2;
            osLeg1.position.y = 0;
            osLeg1.position.x = selectedBeam.tw/2 + spThick + osLegWidth/2;
            parts.push(osLeg1);
        }
    }
    
    shearTabMesh = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
    
    // Draw Bolts for Shear Plate (Beam Web)
    const beamConnType = document.getElementById('sp_beam_conn_type').value;
    const boltDia = parseFloat(document.getElementById('sp_bolt_dia').value) || 0.75;
    
    if (beamConnType === 'Bolted') {
        const boltLen = selectedBeam.tw + (isDouble ? 2 * spThick : spThick) + 1; // 1 inch extra
        
        for (let i = 0; i < spRows; i++) {
            let b = BABYLON.MeshBuilder.CreateCylinder("bolt", {diameter: boltDia, height: boltLen}, scene);
            b.material = boltMat;
            b.rotation.z = Math.PI / 2; // Horizontal along X
            
            let startY = ((spRows - 1) * spPitch) / 2;
            b.position.y = startY - i * spPitch;
            b.position.z = supportFaceZ + spWidth - 1.5; // Edge distance
            b.position.x = isDouble ? 0 : (selectedBeam.tw/2 + spThick/2) / 2;
            
            boltMeshes.push(b);
        }
    }

    // Draw Bolts for Column Face
    if (isBoltedCol) {
        const colBoltLen = spThick + selectedColumn.tf + 1;
        for (let i = 0; i < spRows; i++) {
            let startY = ((spRows - 1) * spPitch) / 2;
            let by = startY - i * spPitch;
            let bz = supportFaceZ; // Flush with col face

            let xPos = selectedBeam.tw/2 + spThick + osLegWidth/2;
            
            let b1 = BABYLON.MeshBuilder.CreateCylinder("bolt_col", {diameter: boltDia, height: colBoltLen}, scene);
            b1.material = boltMat;
            b1.rotation.x = Math.PI / 2; // Horizontal along Z
            b1.position.y = by;
            b1.position.z = bz;
            b1.position.x = xPos;
            boltMeshes.push(b1);

            if (isDouble) {
                let b2 = BABYLON.MeshBuilder.CreateCylinder("bolt_col2", {diameter: boltDia, height: colBoltLen}, scene);
                b2.material = boltMat;
                b2.rotation.x = Math.PI / 2;
                b2.position.y = by;
                b2.position.z = bz;
                b2.position.x = -xPos;
                boltMeshes.push(b2);
            }
        }
    }

    // 4. Flange Connections (Moment)
    const includeMoment = document.getElementById('include_moment')?.checked;
    if (includeMoment) {
        const fpType = document.getElementById('fp_type')?.value || 'Plate';

        if (fpType === 'Plate') {
            const fpThick = parseFloat(document.getElementById('fp_thickness').value) || 0.75;
            const fpWidth = parseFloat(document.getElementById('fp_width').value) || 8;
            const fpLength = 12; // Visual guess

            // Top Flange Plate
            topFPMesh = BABYLON.MeshBuilder.CreateBox("topFP", {width: fpWidth, height: fpThick, depth: fpLength}, scene);
            topFPMesh.material = plateMat;
            topFPMesh.position.z = supportFaceZ + fpLength/2;
            topFPMesh.position.y = selectedBeam.d/2 + fpThick/2;
            topFPMesh.position.x = 0;

            // Bottom Flange Plate
            botFPMesh = BABYLON.MeshBuilder.CreateBox("botFP", {width: fpWidth, height: fpThick, depth: fpLength}, scene);
            botFPMesh.material = plateMat;
            botFPMesh.position.z = supportFaceZ + fpLength/2;
            botFPMesh.position.y = -selectedBeam.d/2 - fpThick/2;
            botFPMesh.position.x = 0;
        } else {
            // Flange Angles
            const t = parseFloat(document.getElementById('fa_thickness').value) || 0.5;
            const L = parseFloat(document.getElementById('fa_length').value) || 8;
            const legC = parseFloat(document.getElementById('fa_leg_col').value) || 4;
            const legB = parseFloat(document.getElementById('fa_leg_beam').value) || 4;

            // TOP ANGLE
            // Column Leg (goes up)
            let topAngleCol = BABYLON.MeshBuilder.CreateBox("taC", {width: L, height: legC, depth: t}, scene);
            topAngleCol.material = plateMat;
            topAngleCol.position.z = supportFaceZ + t/2;
            topAngleCol.position.y = selectedBeam.d/2 + legC/2;
            topAngleCol.position.x = 0;
            // Beam Leg (rests on flange)
            let topAngleBeam = BABYLON.MeshBuilder.CreateBox("taB", {width: L, height: t, depth: legB}, scene);
            topAngleBeam.material = plateMat;
            topAngleBeam.position.z = supportFaceZ + legB/2;
            topAngleBeam.position.y = selectedBeam.d/2 + t/2;
            topAngleBeam.position.x = 0;

            // BOTTOM ANGLE
            // Column Leg (goes down)
            let botAngleCol = BABYLON.MeshBuilder.CreateBox("baC", {width: L, height: legC, depth: t}, scene);
            botAngleCol.material = plateMat;
            botAngleCol.position.z = supportFaceZ + t/2;
            botAngleCol.position.y = -selectedBeam.d/2 - legC/2;
            botAngleCol.position.x = 0;
            // Beam Leg (rests under flange)
            let botAngleBeam = BABYLON.MeshBuilder.CreateBox("baB", {width: L, height: t, depth: legB}, scene);
            botAngleBeam.material = plateMat;
            botAngleBeam.position.z = supportFaceZ + legB/2;
            botAngleBeam.position.y = -selectedBeam.d/2 - t/2;
            botAngleBeam.position.x = 0;
            
            // Note: In a real visualizer we'd draw bolts here too, but for simplicity we skip moment bolts in 3D right now.
        }
    }
}

// --- CALCULATION LOGIC ---
async function runCalculation() {
    const btn = document.getElementById('calculate-btn');
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Processing...`;
    
    // Switch to Report View
    document.querySelector('[data-view="report"]').click();
    document.getElementById('report-content').innerHTML = "<p class='text-center p-8'>Calculating in Python Backend...</p>";

    // Collect inputs
    const isDoublePlate = document.getElementById('sp_plate_type').value === 'Double';
    const includeMoment = document.getElementById('include_moment')?.checked;
    
    const colConnType = document.getElementById('sp_col_conn_type').value;
    const beamConnType = document.getElementById('sp_beam_conn_type').value;
    
    const inputs = {
        design_method: document.getElementById('design_method').value,
        jurisdiction: document.getElementById('jurisdiction').value,
        primary_member_type: document.getElementById('primary_member_type').value,
        
        load_v: parseFloat(document.getElementById('load_v').value) || 0,
        load_m: parseFloat(document.getElementById('load_m').value) || 0,
        include_moment: includeMoment,

        beam: selectedBeam,
        col: selectedColumn,
        beam_mat: materialsDB[document.getElementById('beam_material').value] || {Fy: 50, Fu: 65},
        col_mat: materialsDB[document.getElementById('column_material').value] || {Fy: 50, Fu: 65},

        plate_type: document.getElementById('sp_plate_type').value,
        col_conn_type: colConnType,
        beam_conn_type: beamConnType,

        bolt_grade: document.getElementById('sp_bolt_grade').value,
        db: parseFloat(document.getElementById('sp_bolt_dia').value) || 0.75,
        num_planes: isDoublePlate ? 2 : 1,

        // Shear Tab
        t_ply: parseFloat(document.getElementById('sp_thickness').value) || 0.375,
        t_ply_total: (parseFloat(document.getElementById('sp_thickness').value) || 0.375) * (isDoublePlate ? 2 : 1),
        sp_width: parseFloat(document.getElementById('sp_width').value) || 5,
        sp_length: parseFloat(document.getElementById('sp_length').value) || 12,
        Fu_ply: materialsDB[document.getElementById('sp_material').value]?.Fu || 58,
        Fy_ply: materialsDB[document.getElementById('sp_material').value]?.Fy || 36,
        le: 1.5, // Assumed edge dist
        
        // Connections
        beam_bolt_rows: parseFloat(document.getElementById('sp_beam_bolt_rows').value) || 4,
        beam_bolt_spacing: parseFloat(document.getElementById('sp_beam_bolt_spacing').value) || 3,
        beam_weld_size: parseFloat(document.getElementById('sp_beam_weld_size').value) || 4,
        
        col_bolt_rows: parseFloat(document.getElementById('sp_col_bolt_rows').value) || 4,
        col_bolt_spacing: parseFloat(document.getElementById('sp_col_bolt_spacing').value) || 3,
        col_weld_size: parseFloat(document.getElementById('sp_col_weld_size').value) || 4,
        
        // Moment Connection
        fp_type: document.getElementById('fp_type')?.value || 'Plate',
        fp_thick: parseFloat(document.getElementById('fp_thickness')?.value) || 0.75,
        fp_width: parseFloat(document.getElementById('fp_width')?.value) || 8,
        fp_Fu: materialsDB[document.getElementById('fp_material')?.value]?.Fu || 58,
        fp_Fy: materialsDB[document.getElementById('fp_material')?.value]?.Fy || 36,
        fp_bolt_rows: parseFloat(document.getElementById('fp_bolt_rows')?.value) || 4,
        fp_weld_type: document.getElementById('fp_weld_type')?.value || 'CJP',
        fp_weld_size: parseFloat(document.getElementById('fp_weld_size')?.value) || 6,

        // Flange Angle inputs
        fa_thickness: parseFloat(document.getElementById('fa_thickness')?.value) || 0.5,
        fa_length: parseFloat(document.getElementById('fa_length')?.value) || 8,
        fa_leg_col: parseFloat(document.getElementById('fa_leg_col')?.value) || 4,
        fa_leg_beam: parseFloat(document.getElementById('fa_leg_beam')?.value) || 4,
        fa_col_bolt_rows: parseFloat(document.getElementById('fa_col_bolt_rows')?.value) || 2,
        fa_col_bolt_spacing: parseFloat(document.getElementById('fa_col_bolt_spacing')?.value) || 3,
        fa_beam_bolt_rows: parseFloat(document.getElementById('fa_beam_bolt_rows')?.value) || 2,
        fa_beam_bolt_spacing: parseFloat(document.getElementById('fa_beam_bolt_spacing')?.value) || 3,

        FEXX: 70
    };

    try {
        const results = await eel.calculate_beam_column(inputs)();
        if (results.error) {
            document.getElementById('report-content').innerHTML = `<div class="bg-red-50 p-4 border border-red-200 text-red-800"><h3 class="font-bold">Error</h3><pre class="text-xs whitespace-pre-wrap">${results.trace}</pre></div>`;
            return;
        }

        renderReport(results, inputs);
    } catch(e) {
        document.getElementById('report-content').innerHTML = `<div class="bg-red-50 p-4 border border-red-200 text-red-800 font-bold">Failed to communicate with Eel Backend.</div>`;
    } finally {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg> Calculate`;
    }
}

function renderReport(results, inputs) {
    const rc = document.getElementById('report-content');
    let html = `
        <div class="border-b-2 border-black pb-2 mb-6">
            <h1 class="text-2xl font-bold uppercase tracking-widest text-gray-800">Connection Calc Report</h1>
            <p class="text-xs text-gray-500">Method: ${inputs.design_method} | Code: ${inputs.jurisdiction}</p>
        </div>
        
        <h2 class="text-lg font-bold bg-gray-100 p-2 border-l-4 border-blue-600 mb-4">Summary</h2>
        <div class="grid grid-cols-2 gap-4 mb-8">
            <div class="border p-2 rounded">
                <span class="text-xs text-gray-500 block">Shear Demand (Vu)</span>
                <span class="font-bold text-lg">${inputs.load_v.toFixed(1)} k</span>
            </div>
            <div class="border p-2 rounded">
                <span class="text-xs text-gray-500 block">Moment Demand (Mu)</span>
                <span class="font-bold text-lg">${inputs.load_m.toFixed(1)} k-ft</span>
            </div>
        </div>
    `;

    for (const [category, checksList] of Object.entries(results.checks)) {
        if (!checksList || checksList.length === 0) continue;
        
        html += `<h2 class="text-lg font-bold bg-gray-100 p-2 border-l-4 border-blue-600 mb-4 mt-6">${category} Limit States</h2>`;
        html += `<div class="space-y-4 mb-8">`;
        
        for (const check of checksList) {
            const statusColor = check.status === 'OK' ? 'text-green-600' : 'text-red-600';
            const noteHtml = check.notes ? `<p class="text-xs text-gray-500 mt-1 italic">${check.notes}</p>` : '';
            const stepsHtml = check.steps ? `
                <details class="mt-2 text-xs bg-gray-50 border p-2 rounded">
                    <summary class="cursor-pointer text-gray-600 font-medium hover:text-blue-600">Show step-by-step calculations</summary>
                    <div class="mt-2 text-gray-700 font-mono whitespace-pre-wrap leading-relaxed">${check.steps}</div>
                </details>
            ` : '';
            
            html += `
                <div class="border p-4 shadow-sm rounded">
                    <h3 class="font-bold border-b pb-1 mb-2">${check.name}</h3>
                    <p class="text-sm">Capacity (ϕRn or Rn/Ω) = ${check.capacity.toFixed(2)} ${check.unit}</p>
                    <div class="mt-2 ${statusColor} font-bold">
                        Demand / Capacity Ratio: ${check.ratio.toFixed(2)} - ${check.status}
                    </div>
                    ${stepsHtml}
                    ${noteHtml}
                </div>
            `;
        }
        
        html += `</div>`;
    }

    rc.innerHTML = html;
}
