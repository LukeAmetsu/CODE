/**
 * Draws the 2D base plate diagram using SVG for clarity and performance.
 */
function drawBasePlateDiagram() {
    const svg = document.getElementById('baseplate-diagram');
    if (!svg) return;
    svg.innerHTML = ''; // Clear previous drawing

    // Helper to get numeric values from inputs
    const getVal = id => parseFloat(document.getElementById(id)?.value) || 0;
    
    const inputs = {
        N: getVal('base_plate_length_N'),
        B: getVal('base_plate_width_B'),
        D: getVal('column_depth_d'),
        bf: getVal('column_flange_width_bf'),
        tf: getVal('column_flange_tf'),
        tw: getVal('column_web_tw'),
        colType: document.getElementById('column_type')?.value,
        bolt_d: getVal('anchor_bolt_diameter'),
        bolt_sN: getVal('bolt_spacing_N'),
        bolt_sB: getVal('bolt_spacing_B'), 
        weldType: document.getElementById('weld_type')?.value,
        num_N: getVal('num_bolts_N'),
        num_B: getVal('num_bolts_B'),
        weld: getVal('weld_size')
    };

    const W = 500, H = 350; // ViewBox dimensions
    const pad = 60;
    const cx = W / 2, cy = H / 2;
    const ns = "http://www.w3.org/2000/svg";

    if (inputs.B <= 0 || inputs.N <= 0) return; // Exit if plate dimensions are invalid

    const scale = Math.min((W - 2 * pad) / inputs.B, (H - 2 * pad) / inputs.N);
    const sB = inputs.B * scale;
    const sN = inputs.N * scale;

    const createEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    // 1. Draw Plate
    svg.appendChild(createEl('rect', { x: cx - sB / 2, y: cy - sN / 2, width: sB, height: sN, class: 'svg-plate' }));

    // 2. Draw Column and Weld
    if (inputs.colType === 'Round HSS') {
        const sD = inputs.D * scale;
        if (inputs.weld > 0 && inputs.weldType === 'Fillet') {
            svg.appendChild(createEl('circle', { cx, cy, r: sD / 2 + (inputs.weld * scale), class: 'svg-weld' }));
        }
        svg.appendChild(createEl('circle', { cx, cy, r: sD / 2, class: 'svg-member' }));
    } else { // Wide Flange
        const sD = inputs.D * scale;
        const sBf = inputs.bf * scale;
        const sTf = inputs.tf * scale;
        const sTw = inputs.tw * scale;

        svg.appendChild(createEl('rect', { x: cx - sBf / 2, y: cy - sD / 2, width: sBf, height: sTf, class: 'svg-member' })); // Top flange
        svg.appendChild(createEl('rect', { x: cx - sBf / 2, y: cy + sD / 2 - sTf, width: sBf, height: sTf, class: 'svg-member' })); // Bottom flange
        svg.appendChild(createEl('rect', { x: cx - sTw / 2, y: cy - sD / 2 + sTf, width: sTw, height: sD - 2 * sTf, class: 'svg-member' })); // Web
    }
    
    // 3. Draw Bolts
    const bolt_r = (inputs.bolt_d * scale) / 2;
    const total_bolt_group_width = (inputs.num_B - 1) * inputs.bolt_sB * scale;
    const total_bolt_group_height = (inputs.num_N - 1) * inputs.bolt_sN * scale;
    const start_x = cx - total_bolt_group_width / 2;
    const start_y = cy - total_bolt_group_height / 2;

    for (let r = 0; r < inputs.num_N; r++) {
        for (let c = 0; c < inputs.num_B; c++) {
            svg.appendChild(createEl('circle', { 
                cx: start_x + c * inputs.bolt_sB * scale, 
                cy: start_y + r * inputs.bolt_sN * scale, 
                r: bolt_r, 
                class: 'svg-bolt' 
            }));
        }
    }

    // 4. Draw Dimensions
    const drawDim = (x1, y1, x2, y2, text, vertical = false) => {
        svg.appendChild(createEl('line', { x1, y1, x2, y2, class: 'svg-dim' }));
        const textEl = createEl('text', { class: 'svg-dim-text' });
        textEl.textContent = text;
        if(vertical) {
            textEl.setAttribute('x', x1 - 10);
            textEl.setAttribute('y', (y1 + y2) / 2);
            textEl.setAttribute('transform', `rotate(-90 ${x1-10},${(y1+y2)/2})`);
        } else {
            textEl.setAttribute('x', (x1 + x2) / 2);
            textEl.setAttribute('y', y1 - 10);
        }
        svg.appendChild(textEl);
    };

    // Plate Dims
    drawDim(cx - sB / 2, cy - sN / 2 - 20, cx + sB / 2, cy - sN / 2 - 20, `B = ${inputs.B}"`);
    drawDim(cx + sB / 2 + 20, cy - sN / 2, cx + sB / 2 + 20, cy + sN / 2, `N = ${inputs.N}"`, true);

    // Bolt Dims
    if (inputs.num_B > 1) drawDim(start_x, cy + sN / 2 + 20, start_x + (inputs.bolt_sB * scale), cy + sN / 2 + 20, `${inputs.bolt_sB}"`);
    if (inputs.num_N > 1) drawDim(cx - sB / 2 - 20, start_y, cx - sB / 2 - 20, start_y + (inputs.bolt_sN * scale), `${inputs.bolt_sN}"`, true);
    
    // Column/Weld Dims
    if (inputs.colType === 'Round HSS') {
        const colText = createEl('text', {x: cx, y: cy, class: 'svg-label'});
        colText.textContent = `D = ${inputs.D}"`;
        svg.appendChild(colText);
    } else {
        drawDim(cx - inputs.bf * scale / 2 - 20, cy - inputs.D * scale / 2, cx - inputs.bf * scale / 2 - 20, cy + inputs.D * scale / 2, `d = ${inputs.D}"`, true);
        drawDim(cx - inputs.bf * scale / 2, cy - inputs.D * scale / 2 - 20, cx + inputs.bf * scale / 2, cy - inputs.D * scale / 2 - 20, `bf = ${inputs.bf}"`);
    }
}

// --- Global variables for the 3D scene to avoid re-creation ---
let bjsEngine, bjsScene, bjsGuiTexture;

/**
 * Draws an interactive 3D visualization of the base plate connection using Babylon.js.
 */
function draw3dBasePlateDiagram() {
    const canvas = document.getElementById("baseplate-3d-canvas");
    if (!canvas || typeof BABYLON === 'undefined') return;

    // --- 1. Gather Inputs ---
    const inputs = gatherInputsFromIds(basePlateInputIds);
    const isDarkMode = document.documentElement.classList.contains('dark');

    // --- 2. Initialize Scene, Camera, Renderer, and GUI (only once) ---
    if (!bjsEngine) {
        bjsEngine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        bjsScene = new BABYLON.Scene(bjsEngine);
        bjsGuiTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, bjsScene);

        const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2.2, Math.PI / 2.5, 50, BABYLON.Vector3.Zero(), bjsScene);
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 5;
        camera.upperRadiusLimit = 400;
        camera.wheelPrecision = 10;
        
        // Add a rendering pipeline for better visuals (SSAO, etc.)
        const pipeline = new BABYLON.DefaultRenderingPipeline("default", true, bjsScene, [camera]);
        pipeline.samples = 4; // Anti-aliasing
        pipeline.ssaoEnabled = true;
        pipeline.ssaoRatio = 0.4; // Lower ratio for better performance

        canvas.addEventListener("wheel", (event) => {
            event.preventDefault();
        }, { passive: false }); // The { passive: false } is important for some browsers

        bjsEngine.runRenderLoop(() => {
            if (bjsScene.isReady()) {
                bjsScene.render();
            }
        });
        window.addEventListener('resize', () => bjsEngine.resize());
    }

    // --- FIX: Clear previous elements instead of disposing the entire scene ---
    bjsScene.meshes.forEach(mesh => mesh.dispose());
    bjsGuiTexture.getChildren().forEach(control => {
        control.dispose();
    });
    // Clear materials, lights, and environment texture more robustly
    while (bjsScene.materials.length > 0) {
        bjsScene.materials[0].dispose(true, false);
    }
    while (bjsScene.lights.length > 0) {
        bjsScene.lights[0].dispose();
    }
    if (bjsScene.environmentTexture) {
        bjsScene.environmentTexture.dispose();
    }

    // --- 3. Lighting ---
    bjsScene.clearColor = isDarkMode ? new BABYLON.Color4(0.1, 0.12, 0.15, 1) : new BABYLON.Color4(0.95, 0.95, 0.95, 1);
    bjsScene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/studio.env", bjsScene);
    bjsScene.environmentIntensity = 1.2;

    const light = new BABYLON.DirectionalLight("dir01", new BABYLON.Vector3(-0.5, -1, -0.5), bjsScene);
    light.position = new BABYLON.Vector3(20, 40, 20);

    const shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;

    // --- Materials ---
    const plateMaterial = new BABYLON.PBRMaterial("plateMat", bjsScene);
    plateMaterial.albedoColor = new BABYLON.Color3.FromHexString("#ff8800"); // Standardized: Orange
    plateMaterial.metallic = 0.6;
    plateMaterial.roughness = 0.4;

    const columnMaterial = new BABYLON.PBRMaterial("colMat", bjsScene);
    columnMaterial.albedoColor = new BABYLON.Color3.FromHexString("#003cff"); // Standardized: Blue
    columnMaterial.metallic = 0.6;
    columnMaterial.roughness = 0.45;

    const boltMaterial = new BABYLON.PBRMaterial("boltMat", bjsScene);
    boltMaterial.albedoColor = new BABYLON.Color3.FromHexString("#B0BEC5"); // Standardized: Light Gray
    boltMaterial.metallic = 0.6;
    boltMaterial.roughness = 0.35;
    
    const concreteMaterial = new BABYLON.PBRMaterial("concreteMat", bjsScene);
    concreteMaterial.albedoColor = new BABYLON.Color3.FromHexString(isDarkMode ? "#3b475c" : "#A9A9A9");
    concreteMaterial.metallic = 0.1;
    concreteMaterial.roughness = 0.9;
    
    const weldMaterial = new BABYLON.PBRMaterial("weldMat", bjsScene);
    weldMaterial.albedoColor = new BABYLON.Color3.FromHexString("#DAA520");
    weldMaterial.metallic = 0.5;
    weldMaterial.roughness = 0.7;

    // --- Standardized Helper for creating GUI labels ---
    const createLabel = (text, anchorMesh) => {
        const label = new BABYLON.GUI.Rectangle();
        label.height = "18px";
        label.width = `${text.length * 7}px`;
        label.cornerRadius = 5;
        label.thickness = 1;
        label.background = isDarkMode ? "rgba(40, 40, 40, 0.7)" : "rgba(255, 255, 255, 0.7)";
        label.color = isDarkMode ? "#FFFFFF" : "#000000";
        bjsGuiTexture.addControl(label);

        const textBlock = new BABYLON.GUI.TextBlock();
        textBlock.text = text;
        textBlock.fontSize = 10;
        label.addControl(textBlock);
        
        if (anchorMesh) {
            label.linkWithMesh(anchorMesh);
        }
        return label;
    };

    // --- Standardized Helper for creating Dimension Lines ---
    const createDimensionLine = (name, value, start, end, offset) => {
        if (!value || value <= 0) return;
        const lineMat = new BABYLON.StandardMaterial(`${name}_mat`, bjsScene);
        lineMat.emissiveColor = isDarkMode ? new BABYLON.Color3.White() : new BABYLON.Color3.Black();
        lineMat.disableLighting = true;

        const mainLinePoints = [start.add(offset), end.add(offset)];
        const mainLine = BABYLON.MeshBuilder.CreateLines(`${name}_main`, { points: mainLinePoints }, bjsScene);
        mainLine.material = lineMat;

        const extLine1Points = [start, start.add(offset.scale(1.1))];
        const extLine1 = BABYLON.MeshBuilder.CreateLines(`${name}_ext1`, { points: extLine1Points }, bjsScene);
        extLine1.material = lineMat;

        const extLine2Points = [end, end.add(offset.scale(1.1))];
        const extLine2 = BABYLON.MeshBuilder.CreateLines(`${name}_ext2`, { points: extLine2Points }, bjsScene);
        extLine2.material = lineMat;

        const labelAnchor = new BABYLON.AbstractMesh(`${name}_label_anchor`, bjsScene);
        labelAnchor.position = BABYLON.Vector3.Center(start, end).add(offset.scale(1.2));
        createLabel(`${name}=${value}"`, labelAnchor);
    };


    // --- Geometries (Pedestal, Plate, etc.) ---
    // This part remains mostly the same...
    const pedestalHeight = Math.max(12, inputs.anchor_embedment_hef * 1.5);
    const pedestal = BABYLON.MeshBuilder.CreateBox("pedestal", { width: inputs.pedestal_B, height: pedestalHeight, depth: inputs.pedestal_N }, bjsScene);
    pedestal.material = concreteMaterial;
    pedestal.receiveShadows = true;
    pedestal.position.y = -inputs.provided_plate_thickness_tp / 2 - (pedestalHeight / 2);

    const plate = BABYLON.MeshBuilder.CreateBox("plate", { width: inputs.base_plate_width_B, height: inputs.provided_plate_thickness_tp, depth: inputs.base_plate_length_N }, bjsScene);
    plate.material = plateMaterial;
    shadowGenerator.addShadowCaster(plate);
    plate.receiveShadows = true;

    // --- Column & **FIXED WELD** Geometry ---
    const colHeight = 12;
    if (inputs.column_type === 'Round HSS' && inputs.column_depth_d > 0) {
        const hss = BABYLON.MeshBuilder.CreateCylinder("hss", { diameter: inputs.column_depth_d, height: colHeight }, bjsScene);
        hss.material = columnMaterial;
        shadowGenerator.addShadowCaster(hss);
        hss.position.y = colHeight / 2 + inputs.provided_plate_thickness_tp / 2;

        if (inputs.weld_size > 0 && inputs.weld_type === 'Fillet') {
            const w = inputs.weld_size;
            const column_radius = inputs.column_depth_d / 2;
            
            // Define the triangular profile for the lathe
            const weldProfile = [
                new BABYLON.Vector3(column_radius, 0, 0),
                new BABYLON.Vector3(column_radius + w, 0, 0),
                new BABYLON.Vector3(column_radius, w, 0),
                new BABYLON.Vector3(column_radius, 0, 0) // Close the shape
            ];

            const weld = BABYLON.MeshBuilder.CreateLathe("weld", {
                shape: weldProfile,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE
            }, bjsScene);

            weld.material = weldMaterial;
            shadowGenerator.addShadowCaster(weld);
            weld.position.y = inputs.provided_plate_thickness_tp / 2; // Position it on top of the base plate

            // Weld Label Anchor
            const weldLabelAnchor = new BABYLON.TransformNode("weld_label_anchor", bjsScene);
            weldLabelAnchor.position = new BABYLON.Vector3(column_radius + w, inputs.provided_plate_thickness_tp / 2 + w / 2, 0);
            createLabel(`${w}" Weld`, weldLabelAnchor, isDarkMode);
        }
    } else if (inputs.column_type === 'Wide Flange' && inputs.column_depth_d > 0) {
        const { column_depth_d: d, column_flange_width_bf: bf, column_flange_tf: tf, column_web_tw: tw } = inputs;

        const topFlange = BABYLON.MeshBuilder.CreateBox("tf", { width: bf, height: colHeight, depth: tf }, bjsScene);
        topFlange.position.z = (d - tf) / 2;
        const botFlange = topFlange.clone("bf");
        botFlange.position.z = -(d - tf) / 2;
        const web = BABYLON.MeshBuilder.CreateBox("web", { width: tw, height: colHeight, depth: d - 2 * tf }, bjsScene);
        const column = BABYLON.Mesh.MergeMeshes([topFlange, botFlange, web], true, true, undefined, false, true);
        if (column) {
            column.material = columnMaterial;
            shadowGenerator.addShadowCaster(column);
            column.receiveShadows = true;
            column.position.y = colHeight / 2 + inputs.provided_plate_thickness_tp / 2;
        }

        if (inputs.weld_size > 0 && inputs.weld_type === 'Fillet') {
            const weldSize = inputs.weld_size;
            const weldY = inputs.provided_plate_thickness_tp / 2;
            const createWeld = (name, length, rotation, position) => {
                const weldShape = [ new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(weldSize, 0, 0), new BABYLON.Vector3(0, weldSize, 0) ];
                const weld = BABYLON.MeshBuilder.ExtrudeShape(name, { shape: weldShape, path: [new BABYLON.Vector3(0, 0, -length/2), new BABYLON.Vector3(0, 0, length/2)] }, bjsScene);
                weld.material = weldMaterial; weld.rotation = rotation; weld.position = position; shadowGenerator.addShadowCaster(weld); return weld;
            };
            createWeld("weld_tf1", bf, new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, weldY, (d - tf) / 2 + weldSize));
            createWeld("weld_tf2", bf, new BABYLON.Vector3(0, Math.PI, 0), new BABYLON.Vector3(0, weldY, -(d - tf) / 2 - weldSize));
            createWeld("weld_tw1", d - 2*tf, new BABYLON.Vector3(0, Math.PI/2, 0), new BABYLON.Vector3(tw/2 + weldSize, weldY, 0));
            createWeld("weld_tw2", d - 2*tf, new BABYLON.Vector3(0, -Math.PI/2, 0), new BABYLON.Vector3(-tw/2 - weldSize, weldY, 0));
        }
    }

    // --- Bolts, Dimensions, and Camera logic remains the same ---
    const startX = -(inputs.num_bolts_B - 1) * inputs.bolt_spacing_B / 2;
    const startZ = -(inputs.num_bolts_N - 1) * inputs.bolt_spacing_N / 2;
    for (let r = 0; r < inputs.num_bolts_N; r++) {
        for (let c = 0; c < inputs.num_bolts_B; c++) {
            const bolt = BABYLON.MeshBuilder.CreateCylinder(`bolt_${r}_${c}`, { diameter: inputs.anchor_bolt_diameter, height: inputs.anchor_embedment_hef }, bjsScene);
            bolt.material = boltMaterial;
            shadowGenerator.addShadowCaster(bolt);
            bolt.position.set(startX + c * inputs.bolt_spacing_B, -inputs.anchor_embedment_hef / 2 + inputs.provided_plate_thickness_tp / 2, startZ + r * inputs.bolt_spacing_N);
        }
    }

    // (Dimensioning and camera auto-fit logic from previous response goes here)
    const B = inputs.base_plate_width_B;
    const N = inputs.base_plate_length_N;
    const tp = inputs.provided_plate_thickness_tp;
    const y_pos = tp / 2; // Dimensions will be on the top surface of the plate

    // Plate Dimension N (along Z-axis)
    createDimensionLine("N", N, new BABYLON.Vector3(B / 2, y_pos, -N / 2), new BABYLON.Vector3(B / 2, y_pos, N / 2), new BABYLON.Vector3(4, 0, 0));

    // Plate Dimension B (along X-axis)
    createDimensionLine("B", B, new BABYLON.Vector3(-B / 2, y_pos, N / 2), new BABYLON.Vector3(B / 2, y_pos, N / 2), new BABYLON.Vector3(0, 0, 4));

    // Bolt Spacing B
    if (inputs.num_bolts_B > 1) {
        const start = new BABYLON.Vector3(startX, y_pos, startZ);
        const end = new BABYLON.Vector3(startX + inputs.bolt_spacing_B, y_pos, startZ);
        createDimensionLine("s_B", inputs.bolt_spacing_B, start, end, new BABYLON.Vector3(0, 0, -4));
    }
    
    // Bolt Spacing N
    if (inputs.num_bolts_N > 1) {
        const start = new BABYLON.Vector3(startX, y_pos, startZ);
        const end = new BABYLON.Vector3(startX, y_pos, startZ + inputs.bolt_spacing_N);
        createDimensionLine("s_N", inputs.bolt_spacing_N, start, end, new BABYLON.Vector3(-4, 0, 0));
    }

    if (bjsScene.activeCamera && bjsScene.meshes.length > 0) {
        // Focus specifically on the base plate for the initial zoom.
        const plateMesh = bjsScene.getMeshByName("plate");
        if (plateMesh) {
            const camera = bjsScene.activeCamera;
            const boundingInfo = plateMesh.getBoundingInfo();
            camera.setTarget(boundingInfo.boundingSphere.center);
            // A multiplier is needed to frame the plate nicely.
            camera.radius = boundingInfo.boundingSphere.radius * 4;
        }
    }
}

const basePlateInputIds = [ // FIX: Corrected variable name
    'design_method', 'design_code', 'unit_system', 'base_plate_material', 'base_plate_Fy',
    'concrete_fc', 'pedestal_N', 'pedestal_B', 'anchor_bolt_Fut', 'anchor_bolt_Fnv', 'weld_electrode', 'weld_Fexx', 
    'base_plate_length_N', 'base_plate_width_B', 'provided_plate_thickness_tp', 'column_depth_d', 'column_web_tw', 'column_flange_tf', 'num_bolts_N', 'num_bolts_B', 'concrete_edge_dist_ca1', 'concrete_edge_dist_ca2',
    'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter',
    'anchor_embedment_hef',
    'bolt_spacing_N', 'bolt_spacing_B', 'bolt_type', 'weld_type', 'weld_size', 'weld_effective_throat', 'axial_load_P_in',
    'moment_Mx_in', 'moment_My_in', 'shear_V_in', 'assume_cracked_concrete', 'concrete_edge_dist_ca1'
];

const basePlateCalculator = (() => {
    const { PI, sqrt, min, max, abs } = Math;

    /**
     * Validates the inputs for the base plate calculation.
     * @param {object} inputs - The collected input values.
     * @returns {{errors: string[], warnings: string[]}} - Validation results.
     */
    function validateBasePlateInputs(inputs) {
        const { errors, warnings } = validateInputs(inputs, validationRules.baseplate); // Uses shared validator

        // Add custom, inter-dependent validation logic here
        if (inputs.column_type === 'Wide Flange') {
            if (inputs.column_depth_d >= inputs.base_plate_length_N) {
                errors.push("Column depth (d) must be less than base plate length (N).");
            }
            if (inputs.column_flange_width_bf >= inputs.base_plate_width_B) {
                errors.push("Column flange width (bf) must be less than base plate width (B).");
            }
        } else if (inputs.column_type === 'Round HSS') {
            if (inputs.column_depth_d >= inputs.base_plate_length_N || inputs.column_depth_d >= inputs.base_plate_width_B) {
                errors.push("HSS diameter (D) must be less than both plate dimensions (N and B).");
            }
        }

        // Bolt pattern must fit on the plate
        const bolt_group_length = (inputs.num_bolts_N - 1) * inputs.bolt_spacing_N;
        if (bolt_group_length >= inputs.base_plate_length_N) {
            errors.push("Bolt pattern length (along N) is larger than the base plate length (N).");
        }
        const bolt_group_width = (inputs.num_bolts_B - 1) * inputs.bolt_spacing_B;
        if (bolt_group_width >= inputs.base_plate_width_B) {
            errors.push("Bolt pattern width (along B) is larger than the base plate width (B).");
        }

        // Add a serviceability check for minimum plate thickness
        const min_tp = 0.25; // 1/4 inch
        if (inputs.provided_plate_thickness_tp < min_tp) {
            warnings.push(`Provided plate thickness (${inputs.provided_plate_thickness_tp}") is less than the recommended minimum of ${min_tp}" for serviceability.`);
        }

        return { errors, warnings };
    }

    /**
     * Performs geometry checks for anchor bolts based on ACI 318 requirements.
     * @param {object} inputs - The collected input values.
     * @returns {object} An object containing the geometry check results.
     */
    function getBasePlateGeometryChecks(inputs) { // FIX: Corrected function name
        const { anchor_bolt_diameter: db, bolt_spacing_N, bolt_spacing_B, bolt_type, concrete_edge_dist_ca1, concrete_edge_dist_ca2 } = inputs;
        const checks = {};
        const tolerance = 1e-9;

        // --- ACI 318-19, Section 17.7 - Minimum spacing and edge distance for cast-in anchors ---
        if (bolt_type === 'Cast-in') {
            // ACI 17.7.1: Minimum anchor spacing (s) shall be 4*da for cast-in anchors.
            const s_min = 4 * db; 
            // ACI 17.7.2: Minimum edge distance (ca,min) shall be 6*da for cast-in anchors in tension.
            const ca_min = 6 * db; 

            checks['Min Anchor Spacing (N)'] = { actual: bolt_spacing_N, min: s_min, pass: bolt_spacing_N >= s_min - tolerance };
            checks['Min Anchor Spacing (B)'] = { actual: bolt_spacing_B, min: s_min, pass: bolt_spacing_B >= s_min - tolerance };
            checks['Min Edge Distance (ca1)'] = { actual: concrete_edge_dist_ca1, min: ca_min, pass: concrete_edge_dist_ca1 >= ca_min - tolerance };
            checks['Min Edge Distance (ca2)'] = { actual: concrete_edge_dist_ca2, min: ca_min, pass: concrete_edge_dist_ca2 >= ca_min - tolerance };
        } else { // Post-installed
            // For post-installed anchors, minimum spacing and edge distance are specified by the manufacturer's ESR.
            // This calculator does not have a database for these values, so we cannot perform a check.
            // A warning could be added here if desired.
        }
        return checks;
    }

    function getPhi(limit_state, design_method) {
        const factors = {
            'bearing': { phi: 0.65, omega: 2.31 }, // AISC J8
            'bending': { phi: 0.90, omega: 1.67 }, // AISC F1
            'weld': { phi: 0.75, omega: 2.00 },    // AISC J2
            // ACI 318 Anchor factors are LRFD (phi) only. ASD conversion is handled by factoring loads.
            'anchor_tension_steel': { phi: 0.75, omega: 2.00 }, // Kept omega for steel check consistency, but will use phi.
            'anchor_tension_concrete': { phi: 0.65 }, // Breakout
            'anchor_pullout': { phi: 0.70 },
            'anchor_side_face': { phi: 0.75 },
            'anchor_shear_steel': { phi: 0.65, omega: 2.31 }, // Kept omega for steel check consistency, but will use phi.
            'anchor_shear_concrete': { phi: 0.65 }, // Breakout
            'anchor_pryout': { phi: 0.65 },
        };
        const f = factors[limit_state] || { phi: 1.0, omega: 1.0 };
        return design_method === 'LRFD' ? f.phi : f.omega;
    }

    /**
     * Calculates concrete bearing pressure under combined axial load and biaxial bending.
     * Handles full bearing, partial bearing (triangular/trapezoidal), and pure moment cases.
     * Reference: AISC Design Guide 1, 2nd Ed., Section 3.1 & 3.3
     * @param {object} inputs - The user inputs object.
     * @returns {object} An object with bearing check results.
     */
    function checkConcreteBearing(inputs) {
        const { design_method, base_plate_length_N: N, base_plate_width_B: B, concrete_fc: fc, axial_load_P_in: Pu, moment_Mx_in: Mux, moment_My_in: Muy, pedestal_N, pedestal_B } = inputs;
        
        // **FIX**: If Pu is positive (tension/uplift), there is no bearing pressure.
        if (Pu > 0) {
            return {
                demand: 0,
                check: { Rn: 0, phi: 0.65, omega: 2.31 },
                details: { f_p_max: 0, e_x: Infinity, e_y: Infinity, Y: 0, X: 0, A1: N * B, A2: pedestal_N * pedestal_B, confinement_factor: 0, Pu, bearing_case: "Uplift" }
            };
        }

        const P_abs = Math.abs(Pu); // Now P_abs is only used for compressive loads
        let f_p_max, Y, X, e_x, e_y, bearing_case;
        let breakdown_html = '';

        if (P_abs === 0 && (Mux > 0 || Muy > 0)) {
            // --- Pure Moment Case (AISC Design Guide 1, Section 3.3.3) ---
            // This solves the cubic equation for the neutral axis depth 'kd' based on equilibrium.
            bearing_case = "Pure Moment";
            e_x = Infinity; e_y = Infinity;

            const { num_bolts_N, bolt_spacing_N, anchor_bolt_diameter } = inputs;
            const E_steel = 29000; // ksi
            const E_concrete = 57 * sqrt(fc * 1000) / 1000; // ksi
            const n_ratio = E_steel / E_concrete;
            const Ab = Math.PI * (anchor_bolt_diameter ** 2) / 4.0;
            const d_anchor = (N / 2.0) - ((num_bolts_N - 1) * bolt_spacing_N / 2.0); // Dist from plate center to anchor row

            // Correctly solve the cubic equation for kd derived from equilibrium:
            // M = C*(d_anchor + N/2 - Y/3) where C = T = 0.5 * B * Y * f_p_max
            // And from strain compatibility: f_p_max = (E_c/E_s) * f_t * (Y / (d_anchor - Y))
            // This simplifies to a cubic equation in the form of a*kd^3 + b*kd^2 + c*kd + d = 0
            const a = B / 3.0;
            const b = (B * d_anchor) / 2.0;
            const c = - ( (Mux * 12) / E_concrete + n_ratio * Ab * d_anchor );
            const d = - ( n_ratio * Ab * d_anchor * d_anchor );

            // Use a numerical root finder for the cubic equation (e.g., Newton-Raphson or a simpler iterative method)
            // For simplicity here, we'll use an iterative approach that converges on the correct equilibrium.
            let kd = N / 3.0; // Initial guess for neutral axis depth
            for (let i = 0; i < 20; i++) {
                const C = 0.5 * B * kd * kd * E_concrete * ( (d_anchor - kd) / kd ); // Concrete force
                const T = n_ratio * Ab * E_concrete * (d_anchor - kd); // Bolt tension force
                const M_resisting = C * (d_anchor + N/2.0 - kd/3.0);
                // Adjust kd based on the moment error
                kd = kd * Math.sqrt((Mux * 12) / M_resisting);
            }
            Y = kd; // Bearing length is the neutral axis depth
            X = B;
            // Calculate max pressure using DG1 Eq. 3.31
            f_p_max = (2 * Mux * 12) / (B * kd * (N / 2 - kd / 3 + d_anchor));
            breakdown_html = `f<sub>p,max</sub> = <b>${f_p_max.toFixed(2)} ksi</b> (Calculated iteratively for pure moment)`;
        } else {
            // --- Combined Axial and Bending Case ---
            e_x = (Mux * 12) / P_abs;
            e_y = (Muy * 12) / P_abs;

            if (e_x <= N / 6 && e_y <= B / 6) {
                // Case 1: Full compression (trapezoidal pressure)
                bearing_case = "Full Bearing";
                f_p_max = (P_abs / (B * N)) * (1 + (6 * e_x) / N + (6 * e_y) / B);
                Y = N; X = B;
                breakdown_html = `f<sub>p,max</sub> = (P/A) * (1 + 6e<sub>x</sub>/N + 6e<sub>y</sub>/B) = (${P_abs.toFixed(2)}/(${B}*${N})) * (1 + 6*${e_x.toFixed(2)}/${N} + 6*${e_y.toFixed(2)}/${B}) = <b>${f_p_max.toFixed(2)} ksi</b>`;
            } else if (e_x / N + e_y / B <= 0.5) {
                // Case 2: Partial compression (one edge in tension)
                // Correct iterative solution based on AISC DG1, Section 3.3.2
                bearing_case = "Partial Bearing";
                let Y_trial = N / 2.0; // Initial guess for bearing length
                let P_calc = 0;
                const TOLERANCE = 0.001 * P_abs;

                for (let i = 0; i < 30; i++) {
                    // For a given Y, calculate the max pressure f_p_max that satisfies moment equilibrium
                    // M = P * e_x = C * (N/2 - Y/3)  =>  P = M / e_x
                    // C = 0.5 * f_p_max * Y * B
                    // M = 0.5 * f_p_max * Y * B * (N/2 - Y/3)
                    // f_p_max = (2 * M) / (Y * B * (N/2 - Y/3))
                    const moment_kip_in = Mux * 12;
                    const f_p_max_trial = (2 * moment_kip_in) / (B * Y_trial * (N/2 - Y_trial/3));

                    // Now calculate the axial load P that this pressure distribution can support
                    P_calc = 0.5 * f_p_max_trial * Y_trial * B;

                    // Check if calculated P matches the applied P
                    if (Math.abs(P_calc - P_abs) < TOLERANCE) break;

                    // Adjust Y_trial for the next iteration
                    Y_trial = Y_trial * (P_abs / P_calc);
                }
                f_p_max = (2 * P_abs) / (B * Y_trial);
                Y = Y_trial;
                X = B; // Effective bearing width
                breakdown_html = `f<sub>p,max</sub> = <b>${f_p_max.toFixed(2)} ksi</b> (Calculated iteratively for partial bearing)`;
            } else {
                // Case 3: Corner bearing (triangular pressure, two edges in tension)
                bearing_case = "Corner Bearing";
                // Simplified approach from DG1 for corner bearing
                const g_x = N / 2 - e_x;
                const g_y = B / 2 - e_y;
                f_p_max = (g_x > 0 && g_y > 0) ? (2 * P_abs) / (3 * g_x * g_y) : 0;
                Y = 3 * g_x; X = 3 * g_y;
                if (f_p_max > 0) {
                    breakdown_html = `f<sub>p,max</sub> = (2 * P) / (3 * g<sub>x</sub> * g<sub>y</sub>) = (2 * ${P_abs.toFixed(2)}) / (3 * ${g_x.toFixed(2)} * ${g_y.toFixed(2)}) = <b>${f_p_max.toFixed(2)} ksi</b>`;
                } else {
                    breakdown_html = `Resultant force is outside the base plate (g<sub>x</sub> or g<sub>y</sub> is negative). No compressive bearing occurs.`;
                }
            }
        }

        const A1 = N * B;
        const A2 = pedestal_N * pedestal_B;
        const A2_A1_ratio = (A1 > 0 && A2 > A1) ? sqrt(A2 / A1) : 1.0;
        const confinement_factor = min(A2_A1_ratio, 2.0);
        const P_p = 0.85 * fc * A1 * confinement_factor;
        const phi = getPhi('bearing', design_method);
        const omega = getPhi('bearing', design_method === 'LRFD' ? 'ASD' : 'LRFD');
        const final_capacity = design_method === 'LRFD' ? P_p * phi : P_p / omega;

        const breakdown = `
            <u>Maximum Bearing Pressure (f<sub>p,max</sub>)</u>
            <ul>
                <li>Eccentricity (e<sub>x</sub>) = M<sub>ux</sub> / P<sub>u</sub> = ${(Mux * 12).toFixed(2)} / ${P_abs.toFixed(2)} = ${e_x.toFixed(2)} in</li>
                <li>Eccentricity (e<sub>y</sub>) = M<sub>uy</sub> / P<sub>u</sub> = ${(Muy * 12).toFixed(2)} / ${P_abs.toFixed(2)} = ${e_y.toFixed(2)} in</li>
                <li>Bearing Case: <b>${bearing_case}</b></li>
                <li>Calculation: ${breakdown_html}</li>
            </ul>`;

        return { // Return pressure in ksi for demand, capacity in kips
            demand: f_p_max,
            check: { Rn: P_p, phi, omega },
            details: { f_p_max, e_x, e_y, Y, X, A1, A2, confinement_factor, Pu, bearing_case },
            breakdown
        };
    }

    /**
     * Calculates required plate thickness due to bending from anchor bolt tension (uplift).
     * Reference: AISC Design Guide 1, 2nd Ed., Section 3.4.2
     * @param {object} inputs - The user inputs object.
     * @param {number} Tu_bolt - The maximum tension demand on a single anchor bolt.
     * @returns {object|null} An object with the plate bending check results for uplift, or null if no tension.
     */
    function checkPlateBendingUplift(inputs, Tu_bolt) {
        if (Tu_bolt <= 0) return null;

        const { provided_plate_thickness_tp: tp, base_plate_Fy: Fy, design_method, bolt_spacing_N, bolt_spacing_B, column_type, column_depth_d, column_flange_width_bf } = inputs;

        // Cantilever distance 'c' is the distance from the critical bolt to the column face.
        // This is a simplified approach. A more rigorous analysis would consider the bolt pattern.
        const c_N = (bolt_spacing_N - (column_type === 'Round HSS' ? column_depth_d : column_depth_d)) / 2.0;
        const c_B = (bolt_spacing_B - (column_type === 'Round HSS' ? column_depth_d : column_flange_width_bf)) / 2.0;
        const c = Math.max(c_N, c_B, 0); // Use the larger cantilever, ensure it's not negative.

        // AISC DG1 Eq. 3-33
        const t_req = Math.sqrt((4 * Tu_bolt) / (getPhi('bending', design_method) * Fy));

        return { demand: tp, check: { Rn: t_req, phi: 1.0, omega: 1.0 }, details: { c, Tu_bolt } };
    }

    function checkPlateBending(inputs, bearing_results) {
        const { base_plate_length_N: N, base_plate_width_B: B, column_depth_d: d, column_flange_width_bf: bf, base_plate_Fy: Fy, provided_plate_thickness_tp: tp, column_type, design_method } = inputs;
        const f_p_max = bearing_results.details.f_p_max;
        const Pu_abs = Math.abs(bearing_results.details.Pu);
        const Pp = bearing_results.check.Rn; // Nominal bearing strength
        
        if (f_p_max <= 0) {
            return null; // No bearing pressure, so no bending to check.
        }

        if (column_type === 'Round HSS') {
            // Simplified cantilever method for HSS columns
            const cantilever_dist = (Math.max(N, B) - d) / 2.0;
            const t_req_hss = cantilever_dist * Math.sqrt((2 * f_p_max) / (getPhi('bending', design_method) * Fy));
            return {
                demand: tp, check: { Rn: t_req_hss, phi: 1.0, omega: 1.0 },
                details: { l: cantilever_dist, f_p_max }
            };
        }

        // --- Cantilever and Plate Dimensions for WF columns per AISC DG1, Section 3.3.4 ---
        const m = (N - 0.95 * d) / 2.0;
        const n = (B - 0.80 * bf) / 2.0;
        const n_prime = sqrt(d * bf) / 4.0;

        // --- More accurate 'l' calculation using lambda*n' ---
        // Reference: AISC Design Guide 1, 2nd Ed., Eq. 3-11 to 3-13
        let l, lambda, X;

        // This block now correctly handles both pure compression and pure moment cases.
        // In a pure moment case, the compressive force C from the stress block is used instead of Pu.
        if (Pp > 0) {
            let effective_compressive_force = Pu_abs;
            if (Pu_abs === 0 && bearing_results.details.bearing_case === "Pure Moment") {
                // For pure moment, the compressive force C is equal to the tensile force T.
                // We can calculate C from the triangular pressure block: C = 0.5 * f_p_max * Y * B
                const { Y, B: plate_B } = bearing_results.details;
                effective_compressive_force = 0.5 * f_p_max * Y * plate_B;
            }

            const Pu_Pp_ratio = effective_compressive_force / Pp;
            X = ((4 * d * bf) / (d + bf)**2) * Pu_Pp_ratio;
            // Ensure X is not > 1.0 to avoid issues with sqrt(1-X)
            X = Math.min(X, 1.0); 
            lambda = (2 * sqrt(X)) / (1 + sqrt(1 - X));
            l = max(m, n, lambda * n_prime);
        } else {
            // If there is no bearing capacity (Pp=0) or no compression, use the simplified 'l'.
            l = max(m, n);
        }

        const t_req = l * sqrt((2 * f_p_max) / (getPhi('bending', design_method) * Fy));

        return {
            demand: tp,
            check: { Rn: t_req, phi: 1.0, omega: 1.0 }, // Rn is the required thickness
            details: { m, n, n_prime, X, lambda, l, t_req, f_p_max }
        };
    }

    /**
     * Calculates the minimum required plate thickness for rigidity based on Thornton's method.
     * This is a serviceability check to ensure the plate behaves as assumed (rigid).
     * Reference: AISC Design Guide 1, 2nd Ed., Section 3.3.4 and Thornton's research.
     * @param {object} inputs - The user inputs object.
     * @param {object} bearing_results - The results from the concrete bearing check.
     * @returns {object} An object with the minimum required thickness check.
     */
    function checkMinimumThickness(inputs, bearing_results) {
        const { base_plate_length_N: N, base_plate_width_B: B, column_depth_d: d, column_flange_width_bf: bf, base_plate_Fy: Fy, provided_plate_thickness_tp: tp, design_method } = inputs;
        const Pu_abs = Math.abs(bearing_results.details.Pu);

        if (Pu_abs <= 0) {
            // If there's no compression, Thornton's formula doesn't apply. Fallback to a common minimum.
            return { demand: tp, check: { Rn: 0.25, phi: 1.0, omega: 1.0 }, details: { l: 0, t_min: 0.25, reason: "No compression load." } };
        }

        const m = (N - 0.95 * d) / 2.0;
        const n = (B - 0.80 * bf) / 2.0;
        const l = Math.max(m, n);

        // Thornton's formula for minimum thickness for rigidity
        const t_min = l * Math.sqrt((2 * Pu_abs) / (0.9 * Fy * B * N));
        return { demand: tp, check: { Rn: t_min, phi: 1.0, omega: 1.0 }, details: { l, t_min, Pu_abs, B, N, Fy } };
    }

    /**
     * Calculates the coordinates of each anchor bolt relative to the centroid of the bolt group.
     * @param {object} inputs - The user inputs object.
     * @returns {Array<{x: number, z: number}>} An array of bolt coordinate objects.
     */
    function getBoltCoordinates(inputs) {
        const { num_bolts_N, num_bolts_B, bolt_spacing_N, bolt_spacing_B } = inputs;
        const coords = [];

        const start_x = -(num_bolts_B - 1) * bolt_spacing_B / 2.0;
        const start_z = -(num_bolts_N - 1) * bolt_spacing_N / 2.0;

        for (let r = 0; r < num_bolts_N; r++) {
            for (let c = 0; c < num_bolts_B; c++) {
                coords.push({
                    x: start_x + c * bolt_spacing_B,
                    z: start_z + r * bolt_spacing_N
                });
            }
        }
        return coords;
    }
    /**
     * Calculates the maximum tension force on a single anchor bolt under combined axial load and biaxial bending.
     * @param {object} inputs - The user inputs object.
     * @param {object} bearing_results - The results from the concrete bearing check.
     * @returns {number} The maximum tension force in kips.
     */
    function calculateAnchorTension(inputs) {
        const { axial_load_P_in: Pu, moment_Mx_in: Mux_kipft, moment_My_in: Muy_kipft, num_bolts_N, num_bolts_B, bolt_spacing_N, bolt_spacing_B } = inputs;
        const Mux = Mux_kipft * 12; // kip-in
        const Muy = Muy_kipft * 12; // kip-in
        const bolt_coords = getBoltCoordinates(inputs);

        // Call the new breakdown function to get the value
        const result = generateAnchorTensionBreakdown(Pu, Mux, Muy, bolt_coords, inputs);
        return result; // This now returns an object { value, breakdown }
    }

    // --- Modular Anchor Check Functions (ACI 318-19, Chapter 17) ---

    function checkAnchorSteelTension(inputs) { // FIX: Corrected function name
        const { anchor_bolt_diameter: db, anchor_bolt_Fut: Fut, design_method } = inputs;
        const Ab = PI * (db ** 2) / 4.0;
        return { Rn: Ab * Fut, phi: getPhi('anchor_tension_steel', design_method), omega: getPhi('anchor_tension_steel', 'ASD') };
    }

    function checkAnchorConcreteBreakout(inputs, bearing_results) {
        const { design_method, anchor_embedment_hef: hef, concrete_fc: fc, concrete_edge_dist_ca1: ca1, bolt_spacing_B, num_bolts_B, base_plate_length_N: N, assume_cracked_concrete } = inputs;
        const num_bolts_tension_row = num_bolts_B;

        const k_c = inputs.bolt_type === 'Cast-in' ? 24 : 17;
        const lambda_a = 1.0; // Normal weight concrete
        const Nb = k_c * lambda_a * sqrt(fc * 1000) * hef ** 1.5 / 1000; // Eq. 17.6.2.2.1, in kips
        const ANco = 9 * hef ** 2; // Eq. 17.6.2.1b

        const s_max_N = 3 * hef;
        const s_eff_B = bolt_spacing_B > s_max_N ? s_max_N : bolt_spacing_B; // Effective spacing
        const ANc = (ca1 + 1.5 * hef) * ((num_bolts_tension_row - 1) * s_eff_B + 2 * 1.5 * hef); // Projected area

        const e_N = bearing_results.details.e;
        const e_prime_N = e_N > 0 ? (N / 2 - bearing_results.details.Y) / 2 : 0;
        const psi_ec_N = 1.0 / (1 + (2 * e_prime_N) / (3 * hef));
        const psi_ed_N = (ca1 < 1.5 * hef) ? (0.7 + 0.3 * ca1 / (1.5 * hef)) : 1.0;
        const psi_c_N = assume_cracked_concrete === 'true' ? 1.0 : 1.25;
        const psi_cp_N = 1.0; // Assumed for cast-in

        const Ncbg = (ANc / ANco) * psi_ec_N * psi_ed_N * psi_c_N * psi_cp_N * Nb * num_bolts_tension_row;
        const details = { ANc, ANco, psi_ec_N, psi_ed_N, psi_c_N, psi_cp_N, Nb };
        return { Rn: Ncbg, phi: getPhi('anchor_tension_concrete', design_method), omega: getPhi('anchor_tension_concrete', 'ASD'), details };
    }

    function checkAnchorPullout(inputs) {
        const { design_method, anchor_bolt_diameter: db, concrete_fc: fc, assume_cracked_concrete } = inputs;
        const Abrg = PI * (db ** 2); // Simplified bearing area
        const Np = 8 * Abrg * fc;
        const psi_c_P = assume_cracked_concrete === 'true' ? 1.0 : 1.4;
        const details = { Abrg, Np, psi_c_P };
        return { Rn: psi_c_P * Np, phi: getPhi('anchor_pullout', design_method), omega: getPhi('anchor_pullout', 'ASD'), details };
    }

    function checkAnchorSideFaceBlowout(inputs) {
        const { design_method, anchor_bolt_diameter: db, concrete_fc: fc, concrete_edge_dist_ca1: ca1, anchor_embedment_hef: hef, bolt_spacing_N, num_bolts_N } = inputs;
        if (ca1 >= 0.4 * hef) return null; // Check does not apply

        const Abrg = PI * (db ** 2);
        const Nsb_single = 160 * ca1 * sqrt(Abrg) * 1.0 * sqrt(fc * 1000) / 1000; // in kips
        const Nsbg = (1 + bolt_spacing_N / (6 * ca1)) * Nsb_single;
        const details = { ca1, hef, Abrg, Nsb_single, Nsbg, num_bolts_at_edge: num_bolts_N };
        return { Rn: Nsbg * num_bolts_N, phi: getPhi('anchor_side_face', design_method), omega: getPhi('anchor_side_face', 'ASD'), details };
    }

    function checkAnchorSteelShear(inputs) {
        const { design_method, anchor_bolt_diameter: db, anchor_bolt_Fut: Fut } = inputs;
        const Ab = PI * (db ** 2) / 4.0;
        return { Rn: 0.6 * Ab * Fut, phi: getPhi('anchor_shear_steel', design_method), omega: getPhi('anchor_shear_steel', 'ASD') };
    }

    function checkAnchorConcreteShearBreakout(inputs) {
        const { design_method, anchor_bolt_diameter: db, anchor_embedment_hef: hef, concrete_fc: fc, concrete_edge_dist_ca1: ca1, bolt_spacing_N, num_bolts_N, assume_cracked_concrete } = inputs;
        if (ca1 <= 0) return null; // Check requires an edge distance

        const le = hef;
        const Vb = 7 * (le / db)**0.2 * sqrt(db) * 1.0 * sqrt(fc * 1000) * (ca1**1.5) / 1000; // in kips
        const Avc = (1.5 * ca1 + 1.5 * ca1 + bolt_spacing_N) * (1.5 * ca1);
        const Avco = 4.5 * ca1**2;
        const psi_c_V = assume_cracked_concrete === 'true' ? 1.0 : 1.4;
        const Vcbg = (Avc / (Avco * num_bolts_N)) * 1.0 * psi_c_V * 1.0 * Vb * num_bolts_N;
        const details = { Vb, Avc_Avco: Avc / (Avco * num_bolts_N), psi_c_V };
        return { Rn: Vcbg, phi: getPhi('anchor_shear_concrete', design_method), omega: getPhi('anchor_shear_concrete', 'ASD'), details };
    }

    function checkAnchorConcretePryout(inputs, concrete_breakout_check) {
        if (!concrete_breakout_check) return null;
        const { design_method, anchor_embedment_hef: hef } = inputs;
        const k_cp = hef < 2.5 ? 1.0 : 2.0;
        const Ncb_tension = concrete_breakout_check.check.Rn;
        const details = { k_cp, Ncb: Ncb_tension };
        return { Rn: k_cp * Ncb_tension, phi: getPhi('anchor_pryout', design_method), omega: getPhi('anchor_pryout', 'ASD'), details };
    }

    function checkAnchorInteraction(Tu_group, Vu, checks, design_method) {
        const { 'Anchor Steel Tension': T_steel, 'Anchor Steel Shear': V_steel, 'Anchor Concrete Breakout': T_concrete_breakout, 'Anchor Pullout Strength': T_pullout, 'Anchor Side-Face Blowout': T_sideface, 'Anchor Concrete Shear Breakout': V_concrete_breakout, 'Anchor Concrete Pryout': V_pryout } = checks;

        // --- Steel Interaction ---
        const T_steel_cap = T_steel?.check?.Rn || Infinity;
        const V_steel_cap = V_steel?.check?.Rn || Infinity;
        const num_bolts_tension_row = T_steel?.details?.num_bolts_tension_row || 1;
        const num_bolts_total = V_steel?.details?.num_bolts_total || 1;

        let steel_interaction, concrete_interaction;
        let steel_details, concrete_details;

        const T_concrete_cap = Math.min(
            T_concrete_breakout?.check?.Rn || Infinity,
            (T_pullout?.check?.Rn || Infinity) * num_bolts_tension_row,
            T_sideface?.check?.Rn || Infinity // This is already a group capacity
        );
        const V_concrete_cap = Math.min(V_concrete_breakout?.check?.Rn || Infinity, V_pryout?.check?.Rn || Infinity);

        // --- ACI 318 Anchor Interaction is ALWAYS strength-based (LRFD) ---
        // The demands (Tu_group, Vu) passed to this function are already factored to strength level.
        // We will use phi factors regardless of the user's overall design_method selection.

        const phi_T_steel = getPhi('anchor_tension_steel', 'LRFD');
        const phi_V_steel = getPhi('anchor_shear_steel', 'LRFD');
        const phi_T_concrete = getPhi('anchor_tension_concrete', 'LRFD');
        const phi_V_concrete = getPhi('anchor_shear_concrete', 'LRFD');

        const phi_Tn_steel_group = phi_T_steel * T_steel_cap * num_bolts_tension_row;
        const phi_Vn_steel_group = phi_V_steel * V_steel_cap * num_bolts_total;
        steel_interaction = (phi_Tn_steel_group > 0 ? Tu_group / phi_Tn_steel_group : 0) + (phi_Vn_steel_group > 0 ? Vu / phi_Vn_steel_group : 0);
        steel_details = { Tu: Tu_group, Vu, phiTn: phi_Tn_steel_group, phiVn: phi_Vn_steel_group, is_lrfd: true };

        const phi_Tn_concrete_group = phi_T_concrete * T_concrete_cap;
        const phi_Vn_concrete_group = phi_V_concrete * V_concrete_cap;
        concrete_interaction = (phi_Tn_concrete_group > 0 ? Tu_group / phi_Tn_concrete_group : 0) + (phi_Vn_concrete_group > 0 ? Vu / phi_Vn_concrete_group : 0);
        concrete_details = { Tu: Tu_group, Vu, phiTn: phi_Tn_concrete_group, phiVn: phi_Vn_concrete_group, is_lrfd: true };

        return {
            'Anchor Combined Shear and Tension (Steel)': {
                demand: steel_interaction,
            check: { Rn: design_method === 'LRFD' ? 1.2 : 1.0, phi: 1.0, omega: 1.0 },
                details: steel_details
            },
            'Anchor Combined Shear and Tension (Concrete)': {
                demand: concrete_interaction,
            check: { Rn: design_method === 'LRFD' ? 1.2 : 1.0, phi: 1.0, omega: 1.0 },
                details: concrete_details
            }
        };
    }

    /**
     * Orchestrates all anchor checks by calling modular functions for each limit state.
     * @param {object} inputs - The user inputs.
     * @param {number} Tu_bolt - The calculated tension demand per bolt.
     * @param {object} bearing_results - The results from the concrete bearing check.
     * @returns {object} An object containing all anchor check results.
     */
    function performAnchorChecks(inputs, Tu_bolt, bearing_results, tension_breakdown) {
        const { num_bolts_N, num_bolts_B, shear_V_in, design_method } = inputs;
        const num_bolts_total = num_bolts_N * num_bolts_B;
        const num_bolts_tension_row = num_bolts_B;
        const anchorChecks = {};

        // --- Load Factoring for Anchor Checks ---
        // ACI 318 anchor design is strength-based (LRFD). If the user selected ASD,
        // we must factor the service loads up to a strength level for the anchor checks.
        const asd_load_factor = 1.6; // Conservative load factor for converting ASD to LRFD.
        const is_asd = design_method === 'ASD';
        const Tu_bolt_strength = is_asd ? Tu_bolt * asd_load_factor : Tu_bolt;
        const Vu_strength = is_asd ? shear_V_in * asd_load_factor : shear_V_in;
        const load_factor_note = is_asd ? `ASD service loads were factored by ${asd_load_factor} for ACI strength design.` : '';

        const Tu_group = Tu_bolt_strength * num_bolts_tension_row;

        // --- ANCHOR TENSION CHECKS ---
        if (Tu_bolt > 0) {
            // const Tu_group = Tu_bolt * num_bolts_tension_row; // This variable is defined but not used here. It's used in the interaction check later.
            anchorChecks['Anchor Steel Tension'] = { demand: Tu_bolt, check: checkAnchorSteelTension(inputs), details: { num_bolts_tension_row, breakdown: tension_breakdown } };
            anchorChecks['Anchor Concrete Breakout'] = { demand: Tu_group, check: checkAnchorConcreteBreakout(inputs, bearing_results) };

            if (inputs.bolt_type === 'Cast-in') {
                anchorChecks['Anchor Pullout Strength'] = { demand: Tu_bolt, check: checkAnchorPullout(inputs) };
                const side_face_check = checkAnchorSideFaceBlowout(inputs);
                if (side_face_check) anchorChecks['Anchor Side-Face Blowout'] = { demand: Tu_group, check: side_face_check };
            }
        }

        // --- ANCHOR SHEAR CHECKS ---
        if (shear_V_in > 0) {
            if (num_bolts_total <= 0) return { error: "Cannot check anchor shear with zero total bolts." }; // This should be caught by validation
            const Vu_bolt = Vu_strength / num_bolts_total;

            anchorChecks['Anchor Steel Shear'] = { demand: Vu_bolt, check: checkAnchorSteelShear(inputs), details: { num_bolts_total } };
            const shear_breakout_check = checkAnchorConcreteShearBreakout(inputs);
            if (shear_breakout_check) anchorChecks['Anchor Concrete Shear Breakout'] = { demand: Vu_strength, check: shear_breakout_check };

            const pryout_check = checkAnchorConcretePryout(inputs, anchorChecks['Anchor Concrete Breakout']);
            if (pryout_check) anchorChecks['Anchor Concrete Pryout'] = { demand: Vu_strength, check: pryout_check };
        }

        // --- Combined Shear and Tension Interaction (ACI 17.8) ---
        if (Tu_bolt > 0 && shear_V_in > 0) {
            // Use strength-level loads for interaction check
            const interaction_checks = checkAnchorInteraction(Tu_group, Vu_strength, anchorChecks, design_method);
            Object.assign(anchorChecks, interaction_checks);
        }

        return anchorChecks;
    }

    /**
     * Calculates weld strength using the Elastic Vector Method per AISC Manual Part 8.
     * This method accurately determines the maximum stress on a weld group subjected to
     * combined axial, shear, and moment loads.
     * @param {object} inputs - The user inputs object.
     * @returns {object|null} An object with the weld check results or null if not applicable.
     */
    function checkWeldStrength(inputs, bearing_results) {
        const { weld_type, weld_size, weld_effective_throat, column_type, column_depth_d: d, column_flange_width_bf: bf, column_web_tw: tw, column_flange_tf: tf, axial_load_P_in: Pu, moment_Mx_in: Mux, moment_My_in: Muy, shear_V_in: Vu, weld_Fexx: Fexx, base_plate_Fy: Fy, design_method } = inputs;
        if (weld_type === 'Fillet' && weld_size <= 0) return null;
        if (weld_type === 'PJP' && weld_effective_throat <= 0) return null;

        // --- 1. Calculate Weld Capacity ---
        const phi = getPhi('weld', design_method);
        const omega = getPhi('weld', 'ASD'); // Get ASD factor
        let Rn_weld_per_in, design_strength_weld_per_in;

        if (weld_type === 'Fillet') {
            // AISC Spec J2.4: Strength is based on effective throat area.
            Rn_weld_per_in = 0.6 * Fexx * (weld_size * 0.707);
        } else if (weld_type === 'PJP') {
            // AISC Spec J2.4: Strength is based on effective throat area (E).
            // Assuming weld metal strength governs.
            Rn_weld_per_in = 0.6 * Fexx * weld_effective_throat;
        } else { // CJP
            // AISC Spec J2.4: Strength is governed by the base metal.
            // We check shear yielding of the base metal (column wall).
            const t_bm = column_type === 'Wide Flange' ? tw : (d / 2 - Math.sqrt((d/2)**2 - (bf/2)**2)); // Approx HSS thickness
            Rn_weld_per_in = 0.6 * Fy * t_bm;
        }

        design_strength_weld_per_in = design_method === 'LRFD' ? Rn_weld_per_in * phi : Rn_weld_per_in / omega;


        // --- 2. Calculate Weld Group Properties and Stresses ---
        let f_max_weld, weld_details;
        if (column_type === 'Wide Flange') {
            // For a wide flange, the weld is around the perimeter.
            const L_flange = bf;
            const L_web = d - 2 * tf;
            const Aw = 2 * L_flange + 2 * L_web;
            // Corrected Moment of Inertia for the weld group (strong axis)
            // I = Σ(I_own + A*d^2) for each weld segment
            const Iw_x = 2 * (L_flange * (d / 2)**2) + 2 * (L_web**3 / 12);
            const Sw_x = Iw_x / (d / 2);
            // Corrected Moment of Inertia for the weld group (weak axis)
            const Iw_y = 2 * (L_flange**3 / 12) + 2 * (L_web * (tw / 2)**2);
            const Sw_y = Iw_y / (bf / 2);

            const f_axial = abs(Pu) / Aw;
            const f_moment_x = (Mux * 12) / Sw_x;
            const f_moment_y = (Muy * 12) / Sw_y;
            // Shear is resisted by the two web welds. The total length is 2 * L_web.
            const total_web_weld_length = 2 * L_web;
            const f_shear_x = total_web_weld_length > 0 ? abs(Vu) / total_web_weld_length : 0;
            const f_shear_y = 0; // Assuming V is only in strong axis
            f_max_weld = sqrt((f_axial + f_moment_x + f_moment_y)**2 + f_shear_x**2 + f_shear_y**2);
            weld_details = { Lw: Aw, Aw, Iw_x, Sw_x, Iw_y, Sw_y, f_axial, f_moment_x, f_moment_y, f_shear_x, f_shear_y, f_max_weld, L_web };

        } else { // Round HSS
            const r = d / 2.0;
            if (r <= 0) return { error: "Column radius is zero." };
            const Aw = 2 * PI * r;
            const Sw = PI * r ** 2; // Correct Section Modulus for a thin ring weld group
            const Jw = 2 * PI * r ** 3; // Polar Moment of Inertia for a thin ring weld group
            const f_axial = Pu / Aw; // Axial stress
            const f_moment = (Mux * 12) / Sw; // Bending stress (assuming M is Mux)
            const f_shear = (2 * Vu) / Aw; // Shear stress for a thin-walled circular section
            f_max_weld = sqrt((f_axial + f_moment)**2 + f_shear**2);
            weld_details = { Aw, Sw, Jw, f_axial, f_moment, f_shear, f_max_weld };
        }

        return { demand: f_max_weld, check: { Rn: design_strength_weld_per_in, phi: 1.0, omega: 1.0 }, details: weld_details };
    }

    function checkColumnWebChecks(inputs, bearing_results) {
        const { column_type, column_depth_d: d, column_flange_width_bf: bf, column_web_tw: tw, column_flange_tf: tf, base_plate_Fy: Fy, design_method } = inputs;
        
        // These checks only apply to Wide Flange sections under compression
        if (column_type !== 'Wide Flange' || !bearing_results || bearing_results.details.Pu > 0) return {};
        const f_p_max = bearing_results.details.f_p_max;

        // These properties are not direct inputs, so we must approximate them.
        const k_des = tf; // Approx. k distance
        if (tw <= 0 || tf <= 0) return { error: "Approximated column thickness is zero." };
        const checks = {};

        // Web Local Yielding (AISC J10.2)
        const R_wly_demand = f_p_max * bf * tf; // Force on the critical flange area
        const Rn_wly = Fy * tw * (5 * k_des + bf);
        checks['Column Web Local Yielding'] = {
            demand: R_wly_demand,
            check: { Rn: Rn_wly, phi: 1.0, omega: 1.5 },
            details: { Rn_wly, k_des, tw, bf, Fy }
        };

        // Web Local Crippling (AISC J10.3)
        const Rn_wlc = 0.80 * tw**2 * (1 + 3 * (bf / d) * (tw / tf)**1.5) * sqrt(29000 * Fy * tf / tw);
        checks['Column Web Local Crippling'] = {
            demand: R_wly_demand, // Same demand
            check: { Rn: Rn_wlc, phi: 0.75, omega: 2.00 },
            details: { Rn_wlc, tw, bf, d, tf, Fy }
        };

        return checks;
    }

    function calculateEdgeDistances(inputs) {
        const { pedestal_N, num_bolts_N, bolt_spacing_N, pedestal_B, num_bolts_B, bolt_spacing_B } = inputs;
        // Edge distance along N dimension
        const bolt_group_length = (num_bolts_N > 1) ? (num_bolts_N - 1) * bolt_spacing_N : 0;
        const ca1 = (pedestal_N - bolt_group_length) / 2.0;
        // Edge distance along B dimension
        const bolt_group_width = (num_bolts_B > 1) ? (num_bolts_B - 1) * bolt_spacing_B : 0;
        const ca2 = (pedestal_B - bolt_group_width) / 2.0;
        return { ca1: ca1 >= 0 ? ca1 : 0, ca2: ca2 >= 0 ? ca2 : 0 };
    }
    function run(inputs) {
        // --- FIX: Call getBasePlateGeometryChecks ---
        // This function was defined but not called in the main run function.
        // It's now called to perform the ACI checks on every run.
        const geomChecks = getBasePlateGeometryChecks(inputs); 

        const validation = validateBasePlateInputs(inputs);
        if (validation.errors.length > 0) {
            return { errors: validation.errors, warnings: validation.warnings, checks: {}, geomChecks };
        }

        // Calculate edge distances and add them to the inputs object for use in other checks
        const { ca1, ca2 } = calculateEdgeDistances(inputs);
        inputs.concrete_edge_dist_ca1 = ca1;
        inputs.concrete_edge_dist_ca2 = ca2;
        const checks = {};

        const bearing_results = checkConcreteBearing(inputs);
        if (bearing_results.error) return { errors: [bearing_results.error], checks, geomChecks };
        checks['Concrete Bearing'] = bearing_results;
        
        const bending_results = checkPlateBending(inputs, bearing_results); // Can be null
        if (bending_results?.error) return { errors: [bending_results.error], checks, geomChecks };
        if (bending_results) checks['Plate Bending'] = bending_results;

        const { value: Tu_bolt, breakdown: tension_breakdown } = calculateAnchorTension(inputs); // Capture the breakdown string
        const anchor_checks = performAnchorChecks(inputs, Tu_bolt, bearing_results, tension_breakdown);
        Object.assign(checks, anchor_checks);

        const weld_check = checkWeldStrength(inputs, bearing_results);
        if (weld_check?.error) return { errors: [weld_check.error], checks, geomChecks };
        if (weld_check) checks['Weld Strength'] = weld_check;

        const web_checks = checkColumnWebChecks(inputs, bearing_results);
        if (web_checks?.error) return { errors: [web_checks.error], checks, geomChecks };
        Object.assign(checks, web_checks);

        // Add minimum thickness check based on Thornton's formula
        checks['Minimum Plate Thickness (Rigidity)'] = checkMinimumThickness(inputs, bearing_results);

        return { checks, geomChecks, inputs, warnings: validation.warnings };
    }

    return { run };
})();

function renderBasePlateStrengthChecks(results) {
    const { checks, inputs: calcInputs } = results; // Use a different name to avoid conflict
    const { design_method } = calcInputs;

    const tableRowsHtml = Object.entries(checks)
        .filter(([name, data]) => data && data.check) // Ensure the check exists
        .map(([name, data], index) => {
            const detailId = `bp-details-${index}`;
            const { demand, check } = data;
            const { Rn, phi, omega } = check;
            const breakdownHtml = generateBasePlateBreakdownHtml(name, data, calcInputs); // Pass full inputs
            
            // For anchor checks, the capacity is always LRFD-based (phi*Rn)
            // For other checks, it depends on the user's design_method selection.
            const is_anchor_check = name.toLowerCase().includes('anchor');
            
            const capacity = Rn || 0;
            const design_capacity = design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);
 
            let ratio, demand_val, capacity_val;
            if (name.includes('Plate Bending') || name.includes('Plate Thickness')) {
                // For thickness, demand is provided, capacity is required. Ratio is req/prov.
                demand_val = demand;             // provided tp
                capacity_val = design_capacity; // required t_req
                ratio = demand_val > 0 ? capacity_val / demand_val : Infinity;
            } else {
                demand_val = is_anchor_check && design_method === 'ASD' ? demand * 1.6 : demand; // Apply load factor for ASD anchor checks
                capacity_val = is_anchor_check ? capacity * (check.phi || 0.75) : design_capacity; // Use LRFD capacity for anchor checks
                ratio = capacity_val > 0 ? Math.abs(demand_val) / capacity_val : Infinity;
            }

            const status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';

            return `
                <tr class="border-t dark:border-gray-700">
                    <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${demand_val.toFixed(2)}${is_anchor_check && design_method === 'ASD' ? ' *' : ''}</td>
                    <td>${capacity_val.toFixed(2)}</td>
                    <td>${ratio.toFixed(3)}</td>
                    <td class="font-semibold">${status}</td>
                </tr>
                <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td></tr>
            `;
        }).join('');

    const asd_note = design_method === 'ASD' ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
        * Anchor checks are performed using ACI 318 strength design (LRFD). ASD service loads have been factored by 1.6 for these checks.
    </p>` : '';

    const html = `
        <div id="strength-checks-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center">                <h3 class="report-header">C. Strength Checks (${design_method})</h3>
                <button data-copy-target-id="strength-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 results-table">
                    <caption class="report-caption">Strength Checks (${design_method})</caption>
                    <thead>
                        <tr>
                            <th class="w-2/5">Limit State</th>
                            <th>Demand</th>
                            <th>Capacity</th>
                            <th>Ratio</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRowsHtml}
                    </tbody>
                </table>
                ${asd_note}
            </div>
        </div>
    `;
    return html;
}

function renderBasePlateInputSummary(inputs) {
    const {
        design_method, design_code, base_plate_material, base_plate_Fy, concrete_fc,
        base_plate_length_N, base_plate_width_B, provided_plate_thickness_tp, pedestal_N, pedestal_B, num_bolts_N, num_bolts_B,
        column_depth_d, column_flange_width_bf, column_type,
        anchor_bolt_diameter, anchor_embedment_hef, num_bolts_total, bolt_spacing_N, bolt_spacing_B, bolt_type, weld_size
    } = inputs;

    return `
    <div id="input-summary-section" class="report-section-copyable">
        <div class="flex justify-between items-center">
            <h3 class="report-header">1. Input Summary</h3>
            <button data-copy-target-id="input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">General & Material Properties</caption>
                <tbody>
                    <tr><td>Design Method</td><td>${design_method}</td></tr>
                    <tr><td>Design Code</td><td>${design_code}</td></tr>
                    <tr><td>Plate Material</td><td>${base_plate_material} (F<sub>y</sub>=${base_plate_Fy} ksi)</td></tr>
                    <tr><td>Concrete Strength (f'c)</td><td>${concrete_fc} ksi</td></tr>
                    <tr><td>Pedestal Dimensions (N &times; B)</td><td>${pedestal_N}" &times; ${pedestal_B}"</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Geometric & Anchor Properties</caption>
                <tbody>
                    <tr><td>Plate Dimensions (N &times; B &times; t<sub>p</sub>)</td><td>${base_plate_length_N}" &times; ${base_plate_width_B}" &times; ${provided_plate_thickness_tp}"</td></tr>
                    <tr><td>Column Dimensions (d &times; b<sub>f</sub>)</td><td>${column_depth_d}" &times; ${column_flange_width_bf}" (${column_type})</td></tr>
                    <tr><td>Anchor Pattern (&#35;N &times; &#35;B)</td><td>${num_bolts_N} &times; ${num_bolts_B} bolts</td></tr>
                    <tr><td>Anchor Spacing (N &times; B)</td><td>${bolt_spacing_N}" &times; ${bolt_spacing_B}"</td></tr>
                    <tr><td>Anchor Type / Weld Size</td><td>${bolt_type} / ${weld_size}"</td></tr>
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderCalculatedGeometry(inputs) {
    const { concrete_edge_dist_ca1, concrete_edge_dist_ca2 } = inputs;

    const rows = [
        `<tr><td>Concrete Edge Distance (c<sub>a1</sub>)</td><td>${concrete_edge_dist_ca1.toFixed(3)} in</td><td>(Pedestal N - Bolt Group N) / 2</td></tr>`,
        `<tr><td>Concrete Edge Distance (c<sub>a2</sub>)</td><td>${concrete_edge_dist_ca2.toFixed(3)} in</td><td>(Pedestal B - Bolt Group B) / 2</td></tr>`
    ];

    return `
    <div id="calculated-geometry-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Calculated Geometry</h3>
            <button data-copy-target-id="calculated-geometry-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <thead><tr><th>Parameter</th><th>Value</th><th>Formula</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    </div>`;
}

function renderBasePlateGeometryChecks(geomChecks) {
    if (Object.keys(geomChecks).length === 0) return '';

    const rows = Object.entries(geomChecks).map(([name, data]) => { // FIX: Corrected variable name
        const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        return `<tr><td>${name}</td><td>${data.actual.toFixed(3)}</td><td>${data.min.toFixed(3)}</td><td>${status}</td></tr>`;
    }).join('');

    return `
    <div id="geometry-checks-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">2. Geometry & Spacing Checks (ACI 318-19)</h3>
            <button data-copy-target-id="geometry-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                    <caption class="report-caption">A. Anchor Geometry Checks</caption>
                <thead><tr><th>Item</th><th>Actual (in)</th><th>Required Min (in)</th><th>Status</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function renderBasePlateLoadSummary(inputs, checks) {
    const { axial_load_P_in: Pu, moment_Mx_in: Mux, moment_My_in: Muy, shear_V_in: Vu, num_bolts_N, num_bolts_B, base_plate_length_N, base_plate_width_B } = inputs;
    
    // Get details from the checks object and recalculate demands with corrected functions
    const bearingDetails = checks['Concrete Bearing']?.details;
    // FIX: The anchor tension demand and breakdown are already calculated and stored in the 'checks' object.
    // We should retrieve them from there instead of calling the private `calculateAnchorTension` function again.
    const anchorTensionDemand = checks['Anchor Steel Tension']?.demand || 0;
    const tensionBreakdown = checks['Anchor Steel Tension']?.details?.breakdown || 'No tension calculated.';
    const anchorShearDemand = checks['Anchor Steel Shear']?.demand || 0;
    const num_bolts_total = num_bolts_N * num_bolts_B;

    // A negative bearing pressure indicates uplift, so the actual bearing pressure is zero.
    const bearing_pressure = (bearingDetails?.f_p_max > 0 && bearingDetails?.Pu < 0) ? bearingDetails.f_p_max : 0;

    const rows = [
        `<tr><td>Applied Axial (P)</td><td>User Input</td><td>${Pu.toFixed(2)} kips</td></tr>`,
        `<tr><td>Applied Moment (M<sub>x</sub>)</td><td>User Input</td><td>${Mux.toFixed(2)} kip-ft</td></tr>`,
        `<tr><td>Applied Moment (M<sub>y</sub>)</td><td>User Input</td><td>${Muy.toFixed(2)} kip-ft</td></tr>`,
        `<tr><td>Applied Shear (V)</td><td>User Input</td><td>${Vu.toFixed(2)} kips</td></tr>`,
        `<tr><td colspan="3" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Calculated Demands</td></tr>`
    ];

    // --- Bearing Pressure Breakdown ---
    let bearingBreakdown = 'No compressive bearing on concrete (uplift or zero load).';
    if (bearingDetails && bearingDetails.Pu < 0) { // Only show eccentricity if there is compression
        const { e_x, e_y, bearing_case } = bearingDetails;
        let formula = '';
        if (bearing_case === "Full Bearing") {
            formula = `f<sub>p,max</sub> = (P/A) * (1 + 6e<sub>x</sub>/N + 6e<sub>y</sub>/B)`;
        } else if (bearing_case === "Partial Bearing") {
            formula = `f<sub>p,max</sub> calculated iteratively for partial bearing.`;
        } else if (bearing_case === "Corner Bearing") {
            formula = `f<sub>p,max</sub> = (2*P) / (3*g<sub>x</sub>*g<sub>y</sub>)`;
        }

        bearingBreakdown = `
            e<sub>x</sub> = M<sub>x</sub>/P = ${(Mux * 12).toFixed(2)} / ${Math.abs(Pu).toFixed(2)} = ${e_x.toFixed(2)}"<br>
            e<sub>y</sub> = M<sub>y</sub>/P = ${(Muy * 12).toFixed(2)} / ${Math.abs(Pu).toFixed(2)} = ${e_y.toFixed(2)}"<br>
            Bearing Case: <b>${bearing_case}</b><br>
            ${formula}
        `;
        if (bearing_pressure <= 0) {
            bearingBreakdown += `<br>Resultant is outside the kern; no compressive bearing occurs.`;
        }
    }
     rows.push(`
        <tr class="font-semibold">
            <td>&nbsp;&nbsp;&nbsp;Max. Bearing Pressure (f<sub>p,max</sub>)</td>
            <td class="font-mono text-xs">${bearingBreakdown}</td>
            <td>${bearing_pressure.toFixed(2)} ksi</td>
        </tr>
    `);

    // --- Anchor Tension Breakdown ---
    rows.push(`
       <tr class="font-semibold">
           <td>&nbsp;&nbsp;&nbsp;Max. Anchor Tension (T<sub>u,bolt</sub>)</td>
           <td class="font-mono text-xs">${tensionBreakdown}</td>
           <td>${anchorTensionDemand.toFixed(2)} kips</td>
       </tr>
   `);

    // --- Anchor Shear Breakdown ---
    let shearFormula;
    if (anchorShearDemand > 0 && num_bolts_total > 0) {
        shearFormula = `V<sub>u,bolt</sub> = V<sub>total</sub> / n<sub>bolts</sub> = ${Vu.toFixed(2)} / ${num_bolts_total}`;
    } else {
        shearFormula = 'No shear applied.';
    }

     rows.push(`
        <tr class="font-semibold">
            <td>&nbsp;&nbsp;&nbsp;Max. Anchor Shear (V<sub>u,bolt</sub>)</td>
            <td>${shearFormula}</td>
            <td>${anchorShearDemand.toFixed(2)} kips</td>
        </tr>
    `);

    // --- Return the final HTML ---
    return `
    <div id="load-summary-section" class="report-section-copyable mt-6 mb-2">
        <div class="flex justify-between items-center">            <h3 class="report-header">B. Load Summary & Demands</h3>
            <button data-copy-target-id="load-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">Applied Loads & Calculated Demands</caption>
                <thead><tr><th>Load / Demand Type</th><th>Calculation / Breakdown</th><th>Value</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    </div>`;
}

function generateAnchorTensionBreakdown(Pu, Mux, Muy, bolt_coords, inputs) {
    if (bolt_coords.length === 0) {
        return { value: 0, breakdown: 'No bolts defined.' };
    }

    const Ab = Math.PI * (inputs.anchor_bolt_diameter ** 2) / 4.0;

    // Correctly calculate the moment of inertia of the bolt group area: I = Σ(A_b * d²)
    let I_bg_x = 0, I_bg_y = 0;
    bolt_coords.forEach(bolt => {
        I_bg_x += Ab * (bolt.z ** 2);
        I_bg_y += Ab * (bolt.x ** 2);
    });

    let max_tension = 0;
    let breakdown_lines = [];
    let max_bolt_z = 0;
    let max_bolt_x = 0;

    bolt_coords.forEach(bolt => {
        const axial_force = Pu / bolt_coords.length;
        // Force from moment about x-axis: F_x = M_x * z / I_x * A_b
        // The stress is (M*z/I), and force is stress * A_b.
        const stress_from_Mx = I_bg_x > 0 ? (Mux * bolt.z) / I_bg_x : 0;
        // Stress from moment about y-axis: σ_y = M_y * x / I_y
        const stress_from_My = I_bg_y > 0 ? (Muy * bolt.x) / I_bg_y : 0;
        // Total stress on the bolt
        const total_stress = stress_from_Mx + stress_from_My;
        // Total force is axial force + (stress * area)
        const total_force = axial_force + total_stress * Ab;

        if (total_force > max_tension) {
            max_tension = total_force;
            max_bolt_z = bolt.z;
            max_bolt_x = bolt.x;
            breakdown_lines = [
                `<b>Formula:</b> T<sub>u,bolt</sub> &approx; P/n + (M<sub>x</sub>&middot;z/I<sub>x</sub> + M<sub>y</sub>&middot;x/I<sub>y</sub>) &times; A<sub>b</sub>`, // Formula is conceptual
                `<b>P/n:</b> ${Pu.toFixed(2)} kips / ${bolt_coords.length} bolts = ${axial_force.toFixed(2)} kips`,
                `<b>Stress from M<sub>x</sub>:</b> (${Mux.toFixed(2)} kip-in &times; ${max_bolt_z.toFixed(2)}") / ${I_bg_x.toFixed(2)} in⁴ = ${stress_from_Mx.toFixed(2)} ksi`, // I_x is now Σ(A*d²)
                `<b>Stress from M<sub>y</sub>:</b> (${Muy.toFixed(2)} kip-in &times; ${max_bolt_x.toFixed(2)}") / ${I_bg_y.toFixed(2)} in⁴ = ${stress_from_My.toFixed(2)} ksi`, // I_y is now Σ(A*d²)
                `<b>Force from Stress:</b> (${stress_from_Mx.toFixed(2)} + ${stress_from_My.toFixed(2)}) ksi &times; ${Ab.toFixed(3)} in² = ${(total_stress * Ab).toFixed(2)} kips`,
            ];
        }
    });

    if (max_tension <= 0) {
        breakdown_lines.push('No tension calculated.');
    }

    return { value: max_tension > 0 ? max_tension : 0, breakdown: breakdown_lines.join('<br>') };
}

function generateBasePlateBreakdownHtml(name, data, inputs) {
    const { check } = data;
    const details = data.details || check.details;

    const { design_method } = inputs;

    // For anchor checks, we always use LRFD (phi factors).
    const is_anchor_check = name.toLowerCase().includes('anchor');
    const effective_design_method = is_anchor_check ? 'LRFD' : design_method;

    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? (check?.phi ?? 0.9) : (check?.omega ?? 1.67);
    const capacity_eq = design_method === 'LRFD' ? `${factor_char}R<sub>n</sub>` : `R<sub>n</sub> / ${factor_char}`;
    const final_capacity = design_method === 'LRFD' ? check.Rn * factor_val : check.Rn / factor_val;

    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;
    let content = '';

    // If a pre-formatted breakdown exists (like for anchor tension), use it.
    if (data.breakdown) {
        // For anchor tension, we need to add the capacity calculation part.
        const Ab_tension = Math.PI * (inputs.anchor_bolt_diameter ** 2) / 4.0;
        const Nsa = Ab_tension * inputs.anchor_bolt_Fut;
        const phiNsa = (check?.phi || 0.75) * Nsa;
        return `${data.breakdown}<br><hr class="my-2"><b>Capacity (per bolt):</b><br>&phi;N<sub>sa</sub> = &phi; &times; A<sub>b,eff</sub> &times; F<sub>ut</sub> = ${(check?.phi || 0.75)} &times; ${Ab_tension.toFixed(3)} in² &times; ${inputs.anchor_bolt_Fut} ksi = <b>${phiNsa.toFixed(2)} kips</b>`;
    }

    switch (name) {
        case 'Concrete Bearing':
            content = format_list([
                `<u>Nominal Bearing Strength (P<sub>p</sub>) per AISC J8</u>`,
                `Confinement Factor (&Psi;) = min(&radic;(A₂/A₁), 2.0) = min(&radic;(${details.A2.toFixed(2)}/${details.A1.toFixed(2)}), 2.0) = ${details.confinement_factor.toFixed(2)}`,
                `P<sub>p</sub> = 0.85 &times; f'c &times; A₁ &times; &Psi;`,
                `P<sub>p</sub> = 0.85 &times; ${inputs.concrete_fc} ksi &times; ${details.A1.toFixed(2)} in² &times; ${details.confinement_factor.toFixed(2)} = <b>${check.Rn.toFixed(2)} kips</b> (This is total capacity, not a pressure)`,
                `<u>Design Capacity</u>`,
            ]);
            break;
        case 'Plate Bending':
            const phi_bending_val = getPhi('bending', design_method);
            if (inputs.column_type === 'Wide Flange') {
                const X_val = details.X !== undefined ? details.X.toFixed(3) : 'N/A';
                const lambda_val = details.lambda !== undefined ? details.lambda.toFixed(3) : 'N/A';
                content = format_list([
                    `<u>Required Thickness (t<sub>req</sub>) per AISC DG 1 (Wide Flange)</u>`,
                    `Cantilever distance (m) = (N - 0.95d)/2 = (${inputs.base_plate_length_N} - 0.95 &times; ${inputs.column_depth_d})/2 = <b>${details.m.toFixed(3)} in</b>`,
                    `Cantilever distance (n) = (B - 0.80b<sub>f</sub>)/2 = (${inputs.base_plate_width_B} - 0.80 &times; ${inputs.column_flange_width_bf})/2 = <b>${details.n.toFixed(3)} in</b>`,
                    `Dimension (n') = &radic;(d&middot;b<sub>f</sub>)/4 = &radic;(${inputs.column_depth_d} &middot; ${inputs.column_flange_width_bf})/4 = <b>${details.n_prime.toFixed(3)} in</b>`,
                    `Effective cantilever length (l) = max(m, n, &lambda;n') = <b>${details.l.toFixed(3)} in</b> (where &lambda;=${lambda_val}, X=${X_val})`,
                    `t<sub>req</sub> = l &times; &radic;(2 &times; f<sub>p,max</sub> / (${factor_char}F<sub>y</sub>))`,
                    `t<sub>req</sub> = ${details.l.toFixed(3)} &times; &radic;(2 &times; ${details.f_p_max.toFixed(2)} ksi / (${phi_bending_val} &times; ${inputs.base_plate_Fy} ksi)) = <b>${check.Rn.toFixed(3)} in</b>`
                ]);
            } else { // Round HSS
                content = format_list([
                    `<u>Required Thickness (t<sub>req</sub>) for HSS (Simplified Cantilever)</u>`,
                    `Cantilever length (l) = (max(N, B) - D)/2 = (max(${inputs.base_plate_length_N}, ${inputs.base_plate_width_B}) - ${inputs.column_depth_d})/2 = <b>${details.l.toFixed(3)} in</b>`,
                    `t<sub>req</sub> = l &times; &radic;(2 &times; f<sub>p,max</sub> / (${factor_char}F<sub>y</sub>))`,
                    `t<sub>req</sub> = ${details.l.toFixed(3)} &times; &radic;(2 &times; ${details.f_p_max.toFixed(2)} ksi / (${phi_bending_val} &times; ${inputs.base_plate_Fy} ksi)) = <b>${check.Rn.toFixed(3)} in</b>`
                ]);
            }
            break;
        case 'Plate Bending in Uplift':
            const phi_bending_uplift = getPhi('bending', design_method);
            content = format_list([
                `<u>Required Thickness (t<sub>req</sub>) for Uplift per AISC DG 1, Sec. 3.4.2</u>`,
                `This check governs when the plate bends due to tension in the anchor bolts.`,
                `Cantilever (c) = <b>${details.c.toFixed(3)} in</b> (Simplified distance from bolt to column face)`,
                `t<sub>req</sub> = &radic;(4 &times; T<sub>u,bolt</sub> / (${factor_char}F<sub>y</sub>))`,
                `t<sub>req</sub> = &radic;(4 &times; ${details.Tu_bolt.toFixed(2)} kips / (${phi_bending_uplift} &times; ${inputs.base_plate_Fy} ksi)) = <b>${check.Rn.toFixed(3)} in</b>`
            ]);
            break;
        case 'Anchor Steel Tension':
            // This case is now primarily handled by the `data.breakdown` logic at the top.
            // This is a fallback.
            content = format_list([
                `<u>Nominal Steel Strength (N<sub>sa</sub>) per ACI 17.6.1</u>`,
                `&phi;N<sub>sa</sub> = &phi; &times; A<sub>b,eff</sub> &times; F<sub>ut</sub> = <b>${final_capacity.toFixed(2)} kips</b>`,
                `<u>Design Capacity (per bolt)</u>`,
                `Capacity = &phi;N<sub>sa</sub> = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Steel Shear':
            const Ab_shear = Math.PI * (inputs.anchor_bolt_diameter ** 2) / 4.0;
            const Vu_bolt = data.demand;
            content = format_list([
                `<u>Shear Demand per Bolt (V<sub>u,bolt</sub>)</u>`,
                `V<sub>u,bolt</sub> = V<sub>u,total</sub> / n<sub>bolts</sub> = ${inputs.shear_V_in.toFixed(2)} / ${details.num_bolts_total} = <b>${Vu_bolt.toFixed(2)} kips</b>`,
                `<hr class="my-2">`,
                `<u>Nominal Steel Strength (V<sub>sa</sub>) per ACI 17.7.1</u>`,
                `&phi;V<sub>sa</sub> = &phi; &times; 0.6 &times; A<sub>b,eff</sub> &times; F<sub>ut</sub>`,
                `&phi;V<sub>sa</sub> = ${check.phi} &times; 0.6 &times; ${Ab_shear.toFixed(3)} in² &times; ${inputs.anchor_bolt_Fut} ksi = <b>${final_capacity.toFixed(2)} kips</b>`,
                `<u>Design Capacity (per bolt)</u>`,
                `Capacity = &phi;V<sub>sa</sub> = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Concrete Breakout':
            if (!details) { return 'Breakdown not available. The check may not have been applicable or an error occurred.'; }
            content = format_list([
                `<u>Nominal Concrete Breakout Strength (N<sub>cbg</sub>) per ACI 17.6.2</u>`,
                `Basic Strength (N<sub>b</sub>) = k<sub>c</sub>&lambda;<sub>a</sub>&radic;f'c &times; h<sub>ef</sub><sup>1.5</sup> = ${details.Nb.toFixed(2)} kips`,
                `Area Ratio (A<sub>Nc</sub>/A<sub>Nco</sub>) = ${details.ANc.toFixed(1)} / ${details.ANco.toFixed(1)} = ${(details.ANc / details.ANco).toFixed(3)}`,
                `Modification Factors: &psi;<sub>ec,N</sub>=${details.psi_ec_N.toFixed(3)}, &psi;<sub>ed,N</sub>=${details.psi_ed_N.toFixed(3)}, &psi;<sub>c,N</sub>=${details.psi_c_N.toFixed(3)}`,
                `Nominal Strength (N<sub>cbg</sub>) = (A<sub>Nc</sub>/A<sub>Nco</sub>) &times; &psi;<sub>...</sub> &times; N<sub>b</sub> &times; n = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (Group)</u>`,
                `Capacity = &phi;N<sub>cbg</sub> = ${check.phi} &times; ${check.Rn.toFixed(2)} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Pullout Strength':
            if (!details) { content = 'Calculation details not available. Check may not be applicable.'; } else {
                content = format_list([
                        `<u>Nominal Pullout Strength (N<sub>pn</sub>) per ACI 17.6.3</u>`,
                        `Basic Pullout Strength (N<sub>p</sub>) = 8 &times; A<sub>brg</sub> &times; f'c = 8 &times; ${(details.Abrg || 0).toFixed(3)} in² &times; ${inputs.concrete_fc} ksi = <b>${(details.Np || 0).toFixed(2)} kips</b>`,
                        `Nominal Strength (N<sub>pn</sub>) = &psi;<sub>c,P</sub> &times; N<sub>p</sub> = ${details.psi_c_P.toFixed(2)} &times; ${(details.Np || 0).toFixed(2)} = <b>${(check?.Rn || 0).toFixed(2)} kips</b>`,
                        `<u>Design Capacity (per bolt)</u>`,
                        `Capacity = &phi;N<sub>pn</sub> = ${check.phi} &times; ${check.Rn.toFixed(2)} = <b>${final_capacity.toFixed(2)} kips</b>`
                ]);
            }
            break;
        case 'Anchor Side-Face Blowout':
            if (!details) { content = 'Calculation details not available. Check may not be applicable.'; } else {
                content = format_list([
                        `<u>Nominal Side-Face Blowout Strength (N<sub>sbg</sub>) per ACI 17.6.4</u>`,
                        `Check applies because cₐ₁ (${details.ca1.toFixed(2)}") < 0.4 &times; hₑf (${(0.4*details.hef).toFixed(2)}")`,
                        `Single Anchor (N<sub>sb</sub>) = 160 &times; cₐ₁ &times; &radic;A<sub>brg</sub> &times; &radic;f'c = <b>${(details.Nsb_single || 0).toFixed(2)} kips</b>`,
                        `Group (N<sub>sbg</sub>) = (1 + s/(6cₐ₁)) &times; N<sub>sb</sub> = <b>${(details.Nsbg || 0).toFixed(2)} kips/bolt</b>`,
                        `Total Group Capacity = N<sub>sbg</sub> &times; n_bolts = ${(details.Nsbg || 0).toFixed(2)} &times; ${details.num_bolts_at_edge} = <b>${(check?.Rn || 0).toFixed(2)} kips</b>`,
                        `<u>Design Capacity (Group)</u>`,
                        `Capacity = &phi;N<sub>sbg</sub> = ${check.phi} &times; ${check.Rn.toFixed(2)} = <b>${final_capacity.toFixed(2)} kips</b>`
                ]);
            }
            break;
        case 'Anchor Concrete Shear Breakout':
            if (!details) {
                return 'Breakdown not available. Check is not applicable for the given geometry (e.g., edge distance is zero).';
            }
            content = format_list([
                `<u>Nominal Concrete Shear Breakout Strength (V<sub>cbg</sub>) per ACI 17.7.2</u>`,
                `Basic Strength (V<sub>b</sub>) = 7(lₑ/dₐ)⁰·²&radic;dₐ&lambda;ₐ&radic;f'c &times; cₐ₁¹·⁵ = <b>${details.Vb.toFixed(2)} kips</b>`,
                `Area Ratio (A<sub>vc</sub>/A<sub>vco</sub>) = <b>${details.Avc_Avco.toFixed(3)}</b>`,
                `Nominal Strength (V<sub>cbg</sub>) = (A<sub>vc</sub>/A<sub>vco</sub>) &times; &psi;<sub>...</sub> &times; V<sub>b</sub> &times; n = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (Group)</u>`,
                `Capacity = &phi;V<sub>cbg</sub> = ${check.phi} &times; ${check.Rn.toFixed(2)} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Combined Shear and Tension (Steel)':
        case 'Anchor Combined Shear and Tension (Concrete)':
            const type = name.includes('Steel') ? 'Steel' : 'Concrete';
            let interaction_formula, t_term, v_term;
            if (details.is_lrfd) {
                interaction_formula = `(T<sub>u</sub> / &phi;T<sub>n</sub>) + (V<sub>u</sub> / &phi;V<sub>n</sub>) &le; 1.2 (ACI Eq. 17.8.3-1)`;
                t_term = `T<sub>u</sub> / &phi;T<sub>n</sub> = ${details.Tu.toFixed(2)} / ${details.phiTn.toFixed(2)} = ${(details.Tu / details.phiTn).toFixed(3)}`;
                v_term = `V<sub>u</sub> / &phi;V<sub>n</sub> = ${details.Vu.toFixed(2)} / ${details.phiVn.toFixed(2)} = ${(details.Vu / details.phiVn).toFixed(3)}`;
            } else { // ASD
                interaction_formula = `(T<sub>a</sub> / (T<sub>n</sub>/&Omega;)) + (V<sub>a</sub> / (V<sub>n</sub>/&Omega;)) &le; 1.0`;
                t_term = `T<sub>a</sub> / (T<sub>n</sub>/&Omega;) = ${details.Tu.toFixed(2)} / ${details.Tn_omega_t.toFixed(2)} = ${(details.Tu / details.Tn_omega_t).toFixed(3)}`;
                v_term = `V<sub>a</sub> / (V<sub>n</sub>/&Omega;) = ${details.Vu.toFixed(2)} / ${details.Vn_omega_v.toFixed(2)} = ${(details.Vu / details.Vn_omega_v).toFixed(3)}`;
            }
            content = format_list([
                `<u>Interaction Check per ACI 318-19, Section 17.8 (${type})</u>`,
                `Interaction Equation: ${interaction_formula}`,
                t_term, v_term,
                `Interaction Value = <b>${data.demand.toFixed(3)}</b>`,
            ]);
            break;
        case 'Column Web Local Yielding':
        case 'Column Web Local Crippling': // FIX: Corrected case name
            const demand_force = details.f_p_max * inputs.column_flange_width_bf * inputs.column_flange_tf;
            content = format_list([
                `Demand Force on Flange = f<sub>p,max</sub> &times; b<sub>f</sub> &times; t<sub>f</sub> = ${details.f_p_max.toFixed(2)} &times; ${inputs.column_flange_width_bf} &times; ${inputs.column_flange_tf} = <b>${demand_force.toFixed(2)} kips</b>`,
                `<u>Nominal Strength (R<sub>n</sub>) per AISC J10</u>`,
                `R<sub>n</sub> = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Weld Strength':
            let weld_cap_eq, weld_strength_calc;
            if (inputs.weld_type === 'Fillet') {
                weld_cap_eq = design_method === 'LRFD' ? `&phi; * 0.6 * F<sub>exx</sub> * 0.707 * w` : `(0.6 * F<sub>exx</sub> * 0.707 * w) / &Omega;`;
                weld_strength_calc = `Design Strength = ${factor_val} * 0.6 * ${inputs.weld_Fexx} ksi * 0.707 * ${inputs.weld_size}" = <b>${check.Rn.toFixed(2)} kips/in</b>`;
            } else if (inputs.weld_type === 'PJP') {
                weld_cap_eq = design_method === 'LRFD' ? `&phi; * 0.6 * F<sub>exx</sub> * E` : `(0.6 * F<sub>exx</sub> * E) / &Omega;`;
                weld_strength_calc = `Design Strength = ${factor_val} * 0.6 * ${inputs.weld_Fexx} ksi * ${inputs.weld_effective_throat}" = <b>${check.Rn.toFixed(2)} kips/in</b>`;
            } else { // CJP
                weld_cap_eq = design_method === 'LRFD' ? `&phi; * 0.6 * F<sub>y</sub> * t<sub>base_metal</sub>` : `(0.6 * F<sub>y</sub> * t<sub>base_metal</sub>) / &Omega;`;
                weld_strength_calc = `CJP welds develop the strength of the base metal. Capacity is based on shear yielding of the column wall.`;
            }

            let stress_calcs = [];
            if (inputs.column_type === 'Wide Flange' && details.Sw_x > 0) {
                stress_calcs.push(`Normal Stress (f<sub>n</sub>) = P/A<sub>w</sub> + M<sub>x</sub>/S<sub>wx</sub> + M<sub>y</sub>/S<sub>wy</sub> = ${details.f_axial.toFixed(2)} + ${(inputs.moment_Mx_in * 12 / details.Sw_x).toFixed(2)} + ${(inputs.moment_My_in * 12 / details.Sw_y).toFixed(2)} = <b>${(details.f_axial + details.f_moment_x + details.f_moment_y).toFixed(2)} kips/in</b>`);
                stress_calcs.push(`Shear Stress (f_v) = &radic;(f<sub>vx</sub>² + f<sub>vy</sub>²) = &radic;(${details.f_shear_x.toFixed(2)}² + ${details.f_shear_y.toFixed(2)}²) = ${sqrt(details.f_shear_x**2 + details.f_shear_y**2).toFixed(2)} kips/in`);
                stress_calcs.push(`Resultant Stress (f<sub>r</sub>) = &radic;(f<sub>n</sub>² + f<sub>v</sub>²) = <b>${details.f_max_weld.toFixed(2)} kips/in</b>`);
            } else if (inputs.column_type === 'Round HSS') {
                stress_calcs.push(`Normal Stress (f<sub>n</sub>) = P/A<sub>w</sub> + M/S<sub>w</sub> = ${details.f_axial.toFixed(2)} + ${details.f_moment.toFixed(2)} = ${(details.f_axial + details.f_moment).toFixed(2)} kips/in`); // Muy not handled for HSS yet
                stress_calcs.push(`Shear Stress (f<sub>v</sub>) = 2V/A<sub>w</sub> = ${details.f_shear.toFixed(2)} kips/in`);
                stress_calcs.push(`Resultant Stress (f<sub>r</sub>) = &radic;(f<sub>n</sub>² + f<sub>v</sub>²) = <b>${details.f_max_weld.toFixed(2)} kips/in</b>`);
            } else {
                stress_calcs.push('Stress calculation details not available for this column type.');
            }
            content = format_list([
                `Reference: AISC Manual, Part 8 - Elastic Vector Method`,
                ...stress_calcs,
                `Weld Design Strength Formula: ${weld_cap_eq}`,
                weld_strength_calc
            ]);
            break;
        case 'Anchor Concrete Pryout':
            if (!details) { return 'Breakdown not available. Check is not applicable (e.g., no tension on bolts or preceding checks failed).'; }
            content = format_list([
                `<u>Nominal Pryout Strength (V<sub>cpg</sub>) per ACI 17.7.3</u>`,
                `Pryout Factor (k<sub>cp</sub>) = <b>${details.k_cp.toFixed(1)}</b> (since h<sub>ef</sub> ${inputs.anchor_embedment_hef < 2.5 ? '<' : '>='} 2.5")`,
                `Nominal Concrete Breakout Strength (N<sub>cbg</sub>) = <b>${details.Ncb.toFixed(2)} kips</b> (from tension analysis)`,
                `Nominal Strength (V<sub>cpg</sub>) = k<sub>cp</sub> &times; N<sub>cbg</sub> = ${details.k_cp.toFixed(1)} &times; ${details.Ncb.toFixed(2)} = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (Group)</u>`,
                `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Minimum Plate Thickness (Rigidity)':
            if (details.Pu_abs <= 0) {
                return `No compression load applied. A minimum thickness of <b>0.25 inches</b> is recommended for serviceability.`;
            }
            content = format_list([
                `<u>Required Minimum Thickness (t<sub>min</sub>) for Rigidity (Thornton's Method)</u>`,
                `Cantilever (l) = max((N-0.95d)/2, (B-0.80b<sub>f</sub>)/2) = <b>${details.l.toFixed(3)} in</b>`,
                `t<sub>min</sub> = l &times; &radic;[ (2 &times; P<sub>u</sub>) / (0.9 &times; F<sub>y</sub> &times; B &times; N) ]`,
                `t<sub>min</sub> = ${details.l.toFixed(3)} &times; &radic;[ (2 &times; ${details.Pu_abs.toFixed(2)}) / (0.9 &times; ${details.Fy} &times; ${details.B} &times; ${details.N}) ] = <b>${check.Rn.toFixed(3)} in</b>`
            ]);
            break;
        default: return 'Breakdown not available.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

function renderResults(results) {
    const { checks, geomChecks, inputs } = results;
    
    const inputSummaryHtml = renderBasePlateInputSummary(inputs);
    const calculatedGeometryHtml = renderCalculatedGeometry(inputs);
    const geometryChecksHtml = renderBasePlateGeometryChecks(geomChecks);
    const loadSummaryHtml = renderBasePlateLoadSummary(inputs, checks);
    const strengthChecksHtml = renderBasePlateStrengthChecks(results); // Pass the whole results object


    const finalHtml = `
        <div id="baseplate-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end flex-wrap gap-2 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Show All Details</button>
                <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Full Report</button>
            </div>
            <h2 class="report-title text-center">Base Plate & Anchorage Check Results</h2>
            ${inputSummaryHtml}
            ${calculatedGeometryHtml}
            ${geometryChecksHtml}
            ${loadSummaryHtml}
            ${strengthChecksHtml}
        </div>`;

    document.getElementById('steel-results-container').innerHTML = finalHtml;
}

document.addEventListener('DOMContentLoaded', () => {

    function populateMaterialDropdowns() {
        const gradeOptions = Object.keys(AISC_SPEC.structuralSteelGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');

        const select = document.getElementById('base_plate_material');
        if (select) {
            select.innerHTML = gradeOptions;
            select.value = 'A36'; // Default for base plates
            select.addEventListener('change', (e) => {
                const grade = AISC_SPEC.getSteelGrade(e.target.value);
                if (grade) {
                    if (e.target.dataset.fyTarget) document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                }
            });
            select.dispatchEvent(new Event('change')); // Trigger initial population
        }
 
        // Debounce the 3D diagram redraw for performance.
        const debouncedRedraw3D = debounce(draw3dBasePlateDiagram, 300);
 
        // Add event listeners to all inputs to redraw diagrams on input/change.
        basePlateInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Redraw 2D diagram instantly.
                // Redraw 3D diagram after a short delay to prevent lag.
                const redraw = () => { drawBasePlateDiagram(); debouncedRedraw3D(); };
                el.addEventListener('input', redraw);
                el.addEventListener('change', redraw);
            }
        });
        // --- Populate Weld Electrode Dropdown ---
        const weldOptions = Object.keys(AISC_SPEC.weldElectrodes).map(grade => `<option value="${grade}">${grade}</option>`).join('');
        const weldSelect = document.getElementById('weld_electrode');
        if (weldSelect) {
            weldSelect.innerHTML = weldOptions;
            weldSelect.value = 'E70XX'; // Default
            weldSelect.addEventListener('change', (e) => {
                const electrode = AISC_SPEC.weldElectrodes[e.target.value];
                if (electrode) document.getElementById(e.target.dataset.fexxTarget).value = electrode.Fexx;
            });
            weldSelect.dispatchEvent(new Event('change'));
        }

        // --- Populate Bolt Grade Dropdown ---
        const boltGradeOptions = Object.keys(AISC_SPEC.boltGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');
        const boltSelect = document.getElementById('anchor_bolt_grade');
        const threadsCheckbox = document.getElementById('anchor_threads_included');

        function updateBoltProperties() {
            const grade = boltSelect.value;
            const threadsIncl = threadsCheckbox.checked;
            const { Fnv } = AISC_SPEC.getFnv(grade, threadsIncl);
            const Fnt = AISC_SPEC.getFnt(grade); // Note: AISC provides Fnt (nominal tensile stress), not Fut. Using Fnt for Fut.

            document.getElementById(boltSelect.dataset.futTarget).value = Fnt;
            document.getElementById(boltSelect.dataset.fnvTarget).value = Fnv;
        }

        if (boltSelect && threadsCheckbox) {
            boltSelect.innerHTML = boltGradeOptions;
            boltSelect.value = 'A325'; // A common default
            boltSelect.addEventListener('change', updateBoltProperties);
            threadsCheckbox.addEventListener('change', updateBoltProperties);
            updateBoltProperties(); // Initial population
        }
    }

    // Add a listener to the theme toggle to redraw the 3D diagram
    const themeToggleButton = document.getElementById('theme-toggle');
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', () => setTimeout(draw3dBasePlateDiagram, 50)); // Use a small timeout to ensure class has been updated
    }

    function updateColumnInputsUI() {
        const columnType = document.getElementById('column_type').value;
        const label1 = document.getElementById('label_column_dim1');
        const dim2_container = document.getElementById('container_column_dim2');
        const tf_container = document.getElementById('container_column_tf');
        const tw_container = document.getElementById('container_column_tw');

        if (columnType === 'Round HSS') {
            label1.textContent = 'Column Diameter (D)';
            dim2_container.style.display = 'none';
            tf_container.style.display = 'none';
            tw_container.style.display = 'none';
        } else { // Wide Flange
            label1.textContent = 'Column Depth (d)';
            dim2_container.style.display = 'block';
            tf_container.style.display = 'block';
            tw_container.style.display = 'block';
        }
        // Redraw diagram whenever the type changes
        drawBasePlateDiagram();
    }

    // Attach listener for column type change
    document.getElementById('column_type').addEventListener('change', updateColumnInputsUI);

    const handleRunBasePlateCheck = createCalculationHandler({
        inputIds: basePlateInputIds,
        storageKey: 'baseplate-inputs',
        validatorFunction: basePlateCalculator.validateBasePlateInputs, // Use custom validator
        calculatorFunction: basePlateCalculator.run,
        renderFunction: renderResults,
        resultsContainerId: 'steel-results-container',
        buttonId: 'run-steel-check-btn'
    });
    injectHeader({
        activePage: 'base-plate',
        pageTitle: 'AISC Base Plate & Anchorage Checker',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({
        footerPlaceholderId: 'footer-placeholder'
    });

    initializeSharedUI();
    // Populate dropdowns first to ensure event listeners are attached before local storage is loaded.
    populateMaterialDropdowns();
    updateColumnInputsUI(); // Set initial state
 
    // --- Auto-save inputs to localStorage on any input change, with debouncing ---
    const debouncedSave = debounce(() => {
        const inputs = gatherInputsFromIds(basePlateInputIds);
        saveInputsToLocalStorage('baseplate-inputs', inputs);
    }, 300); // Wait 300ms after the user stops typing to save.

    basePlateInputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', debouncedSave);
    });

    loadInputsFromLocalStorage('baseplate-inputs', basePlateInputIds);

    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunBasePlateCheck);
    
    const handleSaveInputs = createSaveInputsHandler(basePlateInputIds, 'baseplate-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(basePlateInputIds, handleRunBasePlateCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    
    // Diagram copy buttons
    document.getElementById('copy-2d-diagram-btn').addEventListener('click', () => handleCopyDiagramToClipboard('baseplate-diagram'));
    document.getElementById('copy-3d-diagram-btn').addEventListener('click', () => handleCopyDiagramToClipboard('3d-diagram-container'));

    // Initial drawing of the diagram on page load
    drawBasePlateDiagram();
    draw3dBasePlateDiagram();

    document.getElementById('steel-results-container').addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('.toggle-details-btn');
        if (toggleBtn) {
            const detailId = toggleBtn.dataset.toggleId;
            const row = document.getElementById(detailId);
            if (row) {
                row.classList.toggle('is-visible');
                toggleBtn.textContent = row.classList.contains('is-visible') ? '[Hide]' : '[Show]';
            }
        }
        if (event.target.id === 'toggle-all-details-btn') {
            const mainButton = event.target;
            const shouldShow = mainButton.dataset.state === 'hidden';
            document.querySelectorAll('#steel-results-container .details-row').forEach(row => row.classList.toggle('is-visible', shouldShow));
            document.querySelectorAll('#steel-results-container .toggle-details-btn').forEach(button => {
                button.textContent = shouldShow ? '[Hide]' : '[Show]';
            });
            mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
            mainButton.textContent = shouldShow ? 'Hide All Details' : 'Show All Details';
        }


        if (event.target.id === 'copy-report-btn') {
            handleCopyToClipboard('baseplate-report-content', 'feedback-message');
        }
        if (event.target.id === 'print-report-btn') {
            window.print();
        }
        if (event.target.id === 'download-pdf-btn') {
            handleDownloadPdf('baseplate-report-content', 'Base-Plate-Report.pdf');
        }
        if (event.target.id === 'download-word-btn') {
            handleDownloadWord('baseplate-report-content', 'Base-Plate-Report.doc');
        }

        // Handle individual section copy buttons
        const copyBtn = event.target.closest('.copy-section-btn');
        if (copyBtn) {
            const targetId = copyBtn.dataset.copyTargetId;
            if (targetId) {
                handleCopyToClipboard(targetId, 'feedback-message');
            }
        }
    });
});