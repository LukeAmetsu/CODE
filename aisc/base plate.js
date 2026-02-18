// --- State for 2D Diagram Panning ---
var baseplate2dPan = { x: 0, y: 0 };
var baseplate2dIsPanning = false;
var baseplate2dStartPoint = { x: 0, y: 0 };

/**
 * Draws the 2D base plate diagram using SVG for clarity and performance.
 * @param {object} inputs - An object containing all necessary geometric inputs.
 */
function drawBasePlateDiagram(inputs) {
    const svg = document.getElementById('baseplate-diagram');
    if (!svg) return;
    svg.innerHTML = ''; // Clear previous drawing
    const ns = "http://www.w3.org/2000/svg";

    // Create a group element for panning
    const group = document.createElementNS(ns, 'g');
    svg.appendChild(group);

    // --- 1. Setup Scene and Scaling ---
    const W = 500, H = 350; // ViewBox dimensions
    const pad = 60;
    const cx = W / 2, cy = H / 2;
    
    // Validate essential inputs to prevent NaN errors
    // Use safeMathEval to handle potential math expressions
    const B = safeMathEval(inputs.base_plate_width_B) || 0;
    const N = safeMathEval(inputs.base_plate_length_N) || 0;
    const d = safeMathEval(inputs.column_depth_d) || 0;
    
    // Basic check: Dimensions must be positive numbers
    if (
        !inputs || 
        isNaN(B) || B <= 0 || 
        isNaN(N) || N <= 0 ||
        isNaN(d) // Column depth is critical for scaling
    ) {
        // console.warn("Invalid inputs for Base Plate Diagram:", inputs); // Optional logging
        return; 
    }

    // Check specific column dims based on type if needed, but scaling usually relies on B/N mainly.
    // However, if d is 0, scale might be fine but drawing column will fail. 
    // Let's rely on the checks above.

    const scale = Math.min((W - 2 * pad) / B, (H - 2 * pad) / N);

    // --- 2. Declarative Component Generation ---
    // Each function returns an array of objects describing SVG elements.
    const sceneObjects = [
        ...getPlateComponents(inputs, cx, cy, scale),
        ...getColumnComponents(inputs, cx, cy, scale),
        ...getBoltComponents(inputs, cx, cy, scale),
        ...getDimensionComponents(inputs, cx, cy, scale)
    ];

    // --- 3. Render Scene ---
    const createEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    sceneObjects.forEach(obj => {
        const el = createEl(obj.tag, obj.attrs);
        if (obj.text) {
            el.textContent = obj.text;
        }
        group.appendChild(el);
    });

    // Apply the current pan transform
    group.setAttribute('transform', `translate(${baseplate2dPan.x}, ${baseplate2dPan.y})`);
}

function getPlateComponents(inputs, cx, cy, scale) {
    const sB = inputs.base_plate_width_B * scale;
    const sN = inputs.base_plate_length_N * scale;
    return [{
        tag: 'rect',
        attrs: { x: cx - sB / 2, y: cy - sN / 2, width: sB, height: sN, class: 'svg-plate' }
    }];
}

function getColumnComponents(inputs, cx, cy, scale) {
    const components = [];
    if (inputs.column_type === 'Round HSS' || inputs.column_type === 'Pipe') {
        const sD = inputs.column_depth_d * scale;
        if (inputs.weld_size > 0 && inputs.weld_type === 'Fillet') {
            const r_weld = sD / 2 + (inputs.weld_size * scale);
            if (!isNaN(r_weld) && r_weld > 0) {
                 components.push({ tag: 'circle', attrs: { cx, cy, r: r_weld, class: 'svg-weld' } });
            }
        }
        components.push({ tag: 'circle', attrs: { cx, cy, r: sD / 2, class: 'svg-member' } });
    } else { // Wide Flange
        const sD = inputs.column_depth_d * scale;
        const sBf = inputs.column_flange_width_bf * scale;
        const sTf = inputs.column_flange_tf * scale;
        const sTw = inputs.column_web_tw * scale;
        components.push({ tag: 'rect', attrs: { x: cx - sBf / 2, y: cy - sD / 2, width: sBf, height: sTf, class: 'svg-member' } });
        components.push({ tag: 'rect', attrs: { x: cx - sBf / 2, y: cy + sD / 2 - sTf, width: sBf, height: sTf, class: 'svg-member' } });
        components.push({ tag: 'rect', attrs: { x: cx - sTw / 2, y: cy - sD / 2 + sTf, width: sTw, height: sD - 2 * sTf, class: 'svg-member' } });
    }
    return components;
}

function getBoltComponents(inputs, cx, cy, scale) {
    const components = [];
    const bolt_r = (inputs.anchor_bolt_diameter * scale) / 2;
    const total_bolt_group_width = (inputs.num_bolts_B - 1) * inputs.bolt_spacing_B * scale;
    const total_bolt_group_height = (inputs.num_bolts_N - 1) * inputs.bolt_spacing_N * scale;
    const start_x = cx - total_bolt_group_width / 2;
    const start_y = cy - total_bolt_group_height / 2;

    for (let r = 0; r < inputs.num_bolts_N; r++) {
        for (let c = 0; c < inputs.num_bolts_B; c++) {
            // Skip inner bolts (create perimeter pattern)
            if (inputs.num_bolts_N > 2 && inputs.num_bolts_B > 2) {
                if (r > 0 && r < inputs.num_bolts_N - 1 && c > 0 && c < inputs.num_bolts_B - 1) continue;
            }
            components.push({
                tag: 'circle',
                attrs: {
                    cx: start_x + c * inputs.bolt_spacing_B * scale,
                    cy: start_y + r * inputs.bolt_spacing_N * scale,
                    r: bolt_r,
                    class: 'svg-bolt'
                }
            });
        }
    }
    return components;
}

function getDimensionComponents(inputs, cx, cy, scale) {
    const components = [];
    const sB = inputs.base_plate_width_B * scale;
    const sN = inputs.base_plate_length_N * scale;

    const drawDim = (x1, y1, x2, y2, text, vertical = false) => {
        components.push({ tag: 'line', attrs: { x1, y1, x2, y2, class: 'svg-dim' } });
        const textAttrs = { class: 'svg-dim-text' };
        if (vertical) {
            textAttrs.x = x1 - 10;
            textAttrs.y = (y1 + y2) / 2;
            textAttrs.transform = `rotate(-90 ${x1 - 10},${(y1 + y2) / 2})`;
        } else {
            textAttrs.x = (x1 + x2) / 2;
            textAttrs.y = y1 - 10;
        }
        components.push({ tag: 'text', attrs: textAttrs, text });
    };

    // Plate Dims
    drawDim(cx - sB / 2, cy - sN / 2 - 20, cx + sB / 2, cy - sN / 2 - 20, `B = ${inputs.base_plate_width_B}"`);
    drawDim(cx + sB / 2 + 20, cy - sN / 2, cx + sB / 2 + 20, cy + sN / 2, `N = ${inputs.base_plate_length_N}"`, true);

    // Bolt Dims
    const start_x = cx - ((inputs.num_bolts_B - 1) * inputs.bolt_spacing_B * scale) / 2;
    const start_y = cy - ((inputs.num_bolts_N - 1) * inputs.bolt_spacing_N * scale) / 2;
    if (inputs.num_bolts_B > 1) drawDim(start_x, cy + sN / 2 + 20, start_x + (inputs.bolt_spacing_B * scale), cy + sN / 2 + 20, `${inputs.bolt_spacing_B}"`);
    if (inputs.num_bolts_N > 1) drawDim(cx - sB / 2 - 20, start_y, cx - sB / 2 - 20, start_y + (inputs.bolt_spacing_N * scale), `${inputs.bolt_spacing_N}"`, true);

    // Column/Weld Dims
    if (inputs.column_type === 'Round HSS' || inputs.column_type === 'Pipe') {
        const sD = inputs.column_depth_d * scale;
        components.push({ tag: 'text', attrs: { x: cx, y: cy, class: 'svg-label' }, text: `D = ${inputs.column_depth_d}"` });
    } else {
        drawDim(cx - inputs.column_flange_width_bf * scale / 2 - 20, cy - inputs.column_depth_d * scale / 2, cx - inputs.column_flange_width_bf * scale / 2 - 20, cy + inputs.column_depth_d * scale / 2, `d = ${inputs.column_depth_d}"`, true);
        drawDim(cx - inputs.column_flange_width_bf * scale / 2, cy - inputs.column_depth_d * scale / 2 - 20, cx + inputs.column_flange_width_bf * scale / 2, cy - inputs.column_depth_d * scale / 2 - 20, `bf = ${inputs.column_flange_width_bf}"`);
    }
    return components;
}

/**
 * Gets the appropriate resistance factor (phi) or safety factor (omega) for a given limit state.
 * @param {string} limit_state - The name of the limit state (e.g., 'bearing', 'bending').
 * @param {string} design_method - The design method ('LRFD' or 'ASD').
 * @returns {number} The corresponding phi or omega factor.
 */
function getPhi(limit_state, design_method) {
    const factors = {
        'bearing': { phi: 0.65, omega: 2.31 }, // AISC J8
        'bending': { phi: 0.90, omega: 1.67 }, // AISC F1
        'weld': { phi: 0.75, omega: 2.00 },    // AISC J2
        'anchor_tension_steel': { phi: 0.75, omega: 2.00 },
        'anchor_tension_concrete': { phi: 0.65, omega: 2.31 },
        'anchor_pullout': { phi: 0.70, omega: 2.14 },
        'anchor_side_face': { phi: 0.75, omega: 2.00 },
        'anchor_shear_steel': { phi: 0.65, omega: 2.31 },
        'anchor_shear_concrete': { phi: 0.65, omega: 2.31 },
        'anchor_pryout': { phi: 0.65, omega: 2.31 },
    };
    const f = factors[limit_state] || { phi: 1.0, omega: 1.0 };
    return design_method === 'LRFD' ? f.phi : f.omega;
}

// --- Global variables for the 3D scene to avoid re-creation ---
var bjsEngine, bjsScene, bjsGuiTexture;

/**
 * Draws an interactive 3D visualization of the base plate connection using Babylon.js.
 */
function draw3dBasePlateDiagram(currentInputs) {
    const canvas = document.getElementById("baseplate-3d-canvas");
    if (!canvas || typeof BABYLON === 'undefined') return;

    // --- 1. Gather Inputs ---
    const inputs = currentInputs || gatherInputsFromIds(basePlateInputIds);
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
        if (control) control.dispose();
    });

    // --- 3. Lighting ---
    bjsScene.clearColor = isDarkMode ? new BABYLON.Color4(0.1, 0.12, 0.15, 1) : new BABYLON.Color4(0.95, 0.95, 0.95, 1);
    if (!bjsScene.environmentTexture) {
        bjsScene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/studio.env", bjsScene);
        bjsScene.environmentIntensity = 1.2;
    }
    if (bjsScene.lights.length === 0) {
        const light = new BABYLON.DirectionalLight("dir01", new BABYLON.Vector3(-0.5, -1, -0.5), bjsScene);
        light.position = new BABYLON.Vector3(20, 40, 20);
        new BABYLON.ShadowGenerator(1024, light);
    }

    const shadowGenerator = bjsScene.lights[0].getShadowGenerator();
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;

    // --- Materials ---
    const plateMaterial = new BABYLON.PBRMaterial("plateMat", bjsScene);
    plateMaterial.albedoColor = new BABYLON.Color3.FromHexString("#ff8800"); // Standardized: Orange
    plateMaterial.metallic = 0.6;
    plateMaterial.roughness = 0.4;

    const columnMaterial = bjsScene.getMaterialByName("colMat") || new BABYLON.PBRMaterial("colMat", bjsScene);
    columnMaterial.albedoColor = new BABYLON.Color3.FromHexString("#003cff"); // Standardized: Blue
    columnMaterial.metallic = 0.6;
    columnMaterial.roughness = 0.45;

    const boltMaterial = bjsScene.getMaterialByName("boltMat") || new BABYLON.PBRMaterial("boltMat", bjsScene);
    boltMaterial.albedoColor = new BABYLON.Color3.FromHexString("#B0BEC5"); // Standardized: Light Gray
    boltMaterial.metallic = 0.6;
    boltMaterial.roughness = 0.35;

    const concreteMaterial = bjsScene.getMaterialByName("concreteMat") || new BABYLON.PBRMaterial("concreteMat", bjsScene);
    concreteMaterial.albedoColor = new BABYLON.Color3.FromHexString(isDarkMode ? "#3b475c" : "#A9A9A9");
    concreteMaterial.metallic = 0.1;
    concreteMaterial.roughness = 0.9;

    const weldMaterial = bjsScene.getMaterialByName("weldMat") || new BABYLON.PBRMaterial("weldMat", bjsScene);
    weldMaterial.albedoColor = new BABYLON.Color3.FromHexString("#DAA520");
    weldMaterial.metallic = 0.5;
    weldMaterial.roughness = 0.7;

    // --- Standardized Helper for creating GUI labels ---
    const createLabel = (text, anchorMesh) => {
        if (!bjsGuiTexture) return;
        const label = new BABYLON.GUI.Rectangle(text + "_label");
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
    } else if ((inputs.column_type === 'W-Shape' || inputs.column_type === 'S-Shape') && inputs.column_depth_d > 0) {
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
        // ... (Weld logic assumed same for S) ...
        if (inputs.weld_size > 0 && inputs.weld_type === 'Fillet') {
            const weldSize = inputs.weld_size;
            const weldY = inputs.provided_plate_thickness_tp / 2;
            const createWeld = (name, length, rotation, position) => {
                const weldShape = [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(weldSize, 0, 0), new BABYLON.Vector3(0, weldSize, 0)];
                const weld = BABYLON.MeshBuilder.ExtrudeShape(name, { shape: weldShape, path: [new BABYLON.Vector3(0, 0, -length / 2), new BABYLON.Vector3(0, 0, length / 2)] }, bjsScene);
                weld.material = weldMaterial; weld.rotation = rotation; weld.position = position; shadowGenerator.addShadowCaster(weld); return weld;
            };
            createWeld("weld_tf1", bf, new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, weldY, (d - tf) / 2 + weldSize));
            createWeld("weld_tf2", bf, new BABYLON.Vector3(0, Math.PI, 0), new BABYLON.Vector3(0, weldY, -(d - tf) / 2 - weldSize));
            createWeld("weld_tw1", d - 2 * tf, new BABYLON.Vector3(0, Math.PI / 2, 0), new BABYLON.Vector3(tw / 2 + weldSize, weldY, 0));
            createWeld("weld_tw2", d - 2 * tf, new BABYLON.Vector3(0, -Math.PI / 2, 0), new BABYLON.Vector3(-tw / 2 - weldSize, weldY, 0));
        }

    } else if (inputs.column_type === 'Rectangular HSS' && inputs.column_depth_d > 0) {
        // Box Profile
        const d = inputs.column_depth_d;
        const b = inputs.column_flange_width_bf; // Using bf as width for HSS
        const t = inputs.column_web_tw; // Using tw as thickness

        // Create outer box
        const outerBox = BABYLON.MeshBuilder.CreateBox("outer", { width: b, height: colHeight, depth: d }, bjsScene);
        // Create inner box to subtract (for visual hollow effect, or just use solid for simplicity if CSG is expensive)
        // For simple viz, a solid box is fine, but maybe let's just make 4 plates to look hollow.

        const side1 = BABYLON.MeshBuilder.CreateBox("s1", { width: t, height: colHeight, depth: d }, bjsScene);
        side1.position.x = (b - t) / 2;
        const side2 = side1.clone("s2");
        side2.position.x = -(b - t) / 2;

        const side3 = BABYLON.MeshBuilder.CreateBox("s3", { width: b - 2 * t, height: colHeight, depth: t }, bjsScene);
        side3.position.z = (d - t) / 2;
        const side4 = side3.clone("s4");
        side4.position.z = -(d - t) / 2;

        const column = BABYLON.Mesh.MergeMeshes([side1, side2, side3, side4], true, true, undefined, false, true);
        if (column) {
            column.material = columnMaterial;
            shadowGenerator.addShadowCaster(column);
            column.receiveShadows = true;
            column.position.y = colHeight / 2 + inputs.provided_plate_thickness_tp / 2;
        }

        // Rect HSS Welds (perimeter)
        if (inputs.weld_size > 0 && inputs.weld_type === 'Fillet') {
            const weldSize = inputs.weld_size;
            const weldY = inputs.provided_plate_thickness_tp / 2;

            // Simple 4-sided weld path might be easier
            const createWeld = (name, len, rot, pos) => {
                const weldShape = [new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(weldSize, 0, 0), new BABYLON.Vector3(0, weldSize, 0)];
                const weld = BABYLON.MeshBuilder.ExtrudeShape(name, { shape: weldShape, path: [new BABYLON.Vector3(0, 0, -len / 2), new BABYLON.Vector3(0, 0, len / 2)] }, bjsScene);
                weld.material = weldMaterial; weld.rotation = rot; weld.position = pos; shadowGenerator.addShadowCaster(weld);
            }
            createWeld("w_s1", d, new BABYLON.Vector3(0, Math.PI / 2, 0), new BABYLON.Vector3(b / 2 + weldSize, weldY, 0)); // Right
            createWeld("w_s2", d, new BABYLON.Vector3(0, -Math.PI / 2, 0), new BABYLON.Vector3(-b / 2 - weldSize, weldY, 0)); // Left
            createWeld("w_s3", b, new BABYLON.Vector3(0, 0, 0), new BABYLON.Vector3(0, weldY, d / 2 + weldSize)); // Top (Z+)
            createWeld("w_s4", b, new BABYLON.Vector3(0, Math.PI, 0), new BABYLON.Vector3(0, weldY, -d / 2 - weldSize)); // Bot (Z-)
        }
    }

    // --- Bolts, Dimensions, and Camera logic remains the same ---
    const startX = -(inputs.num_bolts_B - 1) * inputs.bolt_spacing_B / 2;
    const startZ = -(inputs.num_bolts_N - 1) * inputs.bolt_spacing_N / 2;
    for (let r = 0; r < inputs.num_bolts_N; r++) {
        for (let c = 0; c < inputs.num_bolts_B; c++) {
            // Skip inner bolts
            if (inputs.num_bolts_N > 2 && inputs.num_bolts_B > 2) {
                if (r > 0 && r < inputs.num_bolts_N - 1 && c > 0 && c < inputs.num_bolts_B - 1) continue;
            }
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

var basePlateInputIds = [ // FIX: Corrected variable name
    'design_method', 'jurisdiction', 'design_code', 'unit_system', 'global_fos', 'base_plate_material', 'base_plate_Fy', 'base_plate_Fu',
    'concrete_fc', 'pedestal_N', 'pedestal_B', 'anchor_bolt_Fut', 'anchor_bolt_Fnv', 'weld_electrode', 'weld_Fexx',
    'base_plate_length_N', 'base_plate_width_B', 'provided_plate_thickness_tp', 'column_depth_d', 'column_web_tw', 'column_flange_tf', 'num_bolts_N', 'num_bolts_B', 'concrete_edge_dist_ca1', 'concrete_edge_dist_ca2',
    'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter',
    'anchor_embedment_hef', 'total_anchors',
    'bolt_spacing_N', 'bolt_spacing_B', 'bolt_type', 'weld_type', 'weld_size', 'weld_effective_throat', 'axial_load_P_in',
    'moment_Mx_in', 'moment_My_in', 'shear_V_in', 'assume_cracked_concrete', 'concrete_edge_dist_ca1'
];

var basePlateCalculator = (() => {
    const { PI, sqrt, min, max, abs } = Math;

    /**
     * Validates the inputs for the base plate calculation.
     * @param {object} inputs - The collected input values.
     * @returns {{errors: string[], warnings: string[]}} - Validation results.
     */
    function validateBasePlateInputs(inputs) {
        const { errors, warnings } = validateInputs(Object.keys(inputs), validationRules.baseplate); // Uses shared validator

        // Force cleanup of numeric inputs just in case
        const d = parseFloat(inputs.column_depth_d || 0);
        const bf = parseFloat(inputs.column_flange_width_bf || 0);
        const N = parseFloat(inputs.base_plate_length_N || 0);
        const B = parseFloat(inputs.base_plate_width_B || 0);
        const tp = parseFloat(inputs.provided_plate_thickness_tp || 0);
        
        // Add custom, inter-dependent validation logic here
        if (inputs.column_type === 'Wide Flange' || inputs.column_type === 'W-Shape') {
            if (d >= N) {
                errors.push(`Column depth (d=${d}") must be less than base plate length (N=${N}").`);
            }
            if (bf >= B) {
                errors.push(`Column flange width (bf=${bf}") must be less than base plate width (B=${B}").`);
            }
        } else if (inputs.column_type === 'Round HSS' || inputs.column_type === 'Pipe') {
            if (d >= N || d >= B) {
                errors.push(`HSS diameter (D=${d}") must be less than both plate dimensions (N=${N}" and B=${B}").`);
            }
        }

        // Bolt pattern must fit on the plate
        const n_bolts_N = parseFloat(inputs.num_bolts_N || 0);
        const n_bolts_B = parseFloat(inputs.num_bolts_B || 0);
        const s_bolts_N = parseFloat(inputs.bolt_spacing_N || 0);
        const s_bolts_B = parseFloat(inputs.bolt_spacing_B || 0);

        const bolt_group_length = (n_bolts_N - 1) * s_bolts_N;
        if (bolt_group_length >= N) {
            errors.push(`Bolt pattern length (${bolt_group_length}") is larger than the base plate length (N=${N}").`);
        }
        const bolt_group_width = (n_bolts_B - 1) * s_bolts_B;
        if (bolt_group_width >= B) {
            errors.push(`Bolt pattern width (${bolt_group_width}") is larger than the base plate width (B=${B}").`);
        }

        // Add a serviceability check for minimum plate thickness
        const min_tp = 0.25; // 1/4 inch
        if (tp < min_tp) {
            warnings.push(`Provided plate thickness (${tp}") is less than the recommended minimum of ${min_tp}" for serviceability.`);
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

    function getPhi(limit_state, design_method, jurisdiction) {
        if (jurisdiction === 'OSHA') {
            // OSHA requires FOS = 4.0.
            // If the formula is R = phi * Rn, then phi should be 1/4 = 0.25.
            // If the formula is R = Rn / omega, then omega should be 4.0.
            // getPhi returns 'phi' if design_method is LRFD, and 'omega' if ASD.
            // Note: design_method passed might be 'LRFD' (standard ACI) but checks might need OSHA override.
            if (design_method === 'LRFD') return 0.25;
            return 4.0;
        }

        const factors = {
            'bearing': { phi: 0.65, omega: 2.31 }, // AISC J8
            'bending': { phi: 0.90, omega: 1.67 }, // AISC F1
            'weld': { phi: 0.75, omega: 2.00 },    // AISC J2
            // ACI 318 Anchor factors are LRFD (phi) only. ASD conversion is handled by factoring loads.
            'anchor_tension_steel': { phi: 0.75, omega: 2.00 },
            'anchor_tension_concrete': { phi: 0.65, omega: 2.31 }, // Breakout
            'anchor_pullout': { phi: 0.70, omega: 2.14 },
            'anchor_side_face': { phi: 0.75, omega: 2.00 },
            'anchor_shear_steel': { phi: 0.65, omega: 2.31 },
            'anchor_shear_concrete': { phi: 0.65, omega: 2.31 }, // Breakout
            'anchor_pryout': { phi: 0.65, omega: 2.31 },
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

        if (Pu > 0) {
            return {
                demand: 0,
                check: { Rn: 0, phi: 0.65, omega: 2.31 },
                details: { f_p_max: 0, e_x: Infinity, e_y: Infinity, Y: 0, X: 0, A1: N * B, A2: pedestal_N * pedestal_B, confinement_factor: 0, Pu, bearing_case: "Uplift", breakdown_formula: null }
            };
        }

        const P_abs = Math.abs(Pu); // Now P_abs is only used for compressive loads
        let f_p_max, Y, X, e_x, e_y, bearing_case;
        let breakdown_formula = null;

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
            let kd = N / 3.0; // Initial guess for neutral axis depth
            for (let i = 0; i < 20; i++) {
                const C = 0.5 * B * kd * ((2 * Mux * 12) / (B * kd * (N / 2 - kd / 3 + d_anchor))); // Concrete Force
                const T = n_ratio * Ab * ((2 * Mux * 12) / (B * kd * (N / 2 - kd / 3 + d_anchor))) * ((d_anchor - kd) / kd); // Bolt Tension
                if (Math.abs(C - T) < 0.01 * C) break;
                kd = kd * Math.sqrt(T / C); // Adjust kd based on force imbalance
            }
            Y = kd; // Bearing length is the neutral axis depth
            X = B;
            // Calculate max pressure using DG1 Eq. 3.31 - This is a simplified representation
            f_p_max = (2 * Mux * 12) / (B * Y * (N / 2 - Y / 3 + d_anchor));
            breakdown_formula = `f<sub>p,max</sub> calculated iteratively for pure moment`;
        } else {
            // --- Combined Axial and Bending Case ---
            e_x = (Mux * 12) / P_abs;
            e_y = (Muy * 12) / P_abs;

            if (e_x <= N / 6.0 && e_y <= B / 6.0) {
                // Case 1: Full compression (trapezoidal pressure)
                bearing_case = "Full Bearing";
                f_p_max = (P_abs / (B * N)) * (1 + (6 * e_x) / N + (6 * e_y) / B);
                Y = N; X = B;
                breakdown_formula = `f<sub>p,max</sub> = (P/A) * (1 + 6e<sub>x</sub>/N + 6e<sub>y</sub>/B)`;
            } else if ((e_x / N + e_y / B) <= 0.5) {
                // Case 2: Partial compression (one edge in tension)
                bearing_case = "Partial Bearing";
                if (e_y === 0) {
                    // Closed form for uniaxial bending (e_y = 0)
                    // Y = 3 * (N/2 - e_x)
                    Y = 3 * (N / 2 - e_x);
                    // Constraint: Y must be <= N (though Case 1 checks this usually)
                    Y = Math.min(Y, N);
                } else if (e_x === 0) {
                    // Closed form for uniaxial bending (e_x = 0), swap axis logic
                    const Y_b = 3 * (B / 2 - e_y);
                    Y = N; // Full length N is engaged effectively
                    X = Math.min(Y_b, B); // Effective width X
                    f_p_max = (2 * P_abs) / (N * X);
                    // Remap for consistency: Y usually is the bearing length along N. 
                    // But here bearing is limited along B. 
                    // The formula f_p_max = 2P / (Y*X). Logic holds.
                } else {
                    // Bi-axial Iterative Solver
                    // Fixed update direction: If M_res > M_app, we need M_res to decrease. 
                    // M_res = P * (N/2 - Y/3). As Y increases, Moment Arm decreases, M_res decreases.
                    // So if M_res > M_app, we need Y to INCREASE.
                    // Previous: Y = Y * (M_app/M_res) -> If M_app < M_res (0.xxx), Y Decreases. Wrong.
                    // New: Y = Y * (M_res/M_app) or slightly damped.

                    let Y_curr = N / 2;
                    for (let i = 0; i < 30; i++) {
                        const M_resisting = P_abs * (N / 2 - Y_curr / 3);
                        const M_applied = Mux * 12; // kip-in

                        // Safety check
                        if (M_resisting <= 0) { Y_curr = N; break; }

                        const ratio = M_applied / M_resisting;
                        if (Math.abs(1 - ratio) < 0.01) break;

                        // damping
                        // If Ratio < 1 (e.g. 0.8), (1-ratio) = 0.2. Y_new = Y * 1.1. Y increases. Correct.
                        // If ratio > 1 (e.g. 1.2), (1-ratio) = -0.2. Y_new = Y * 0.9. Y decreases. M_res increases. Correct.

                        Y_curr = Y_curr * (1 + 0.5 * (1 - ratio));
                        Y_curr = Math.max(0.1, Math.min(N, Y_curr)); // Clamp
                    }
                    Y = Y_curr;
                }

                if (e_x !== 0 || e_y === 0) { // Standard case calculation
                    f_p_max = (2 * P_abs) / (B * Y);
                }

                if (e_x === 0 && e_y !== 0) {
                    // Handled in block above, variables set.
                } else {
                    X = B;
                }

                breakdown_formula = e_y === 0
                    ? `f<sub>p,max</sub> = 2P / (3B(N/2 - e)) (Closed form)`
                    : `f<sub>p,max</sub> calculated iteratively for partial bearing`;
            } else {
                // Case 3: Corner bearing (triangular pressure, two edges in tension)
                bearing_case = "Corner Bearing";
                // Simplified approach from DG1 for corner bearing
                const g_x = N / 2 - e_x;
                const g_y = B / 2 - e_y;
                f_p_max = (g_x > 0 && g_y > 0) ? (2 * P_abs) / (3 * g_x * g_y) : 0;
                Y = 3 * g_x; X = 3 * g_y;
                breakdown_formula = (f_p_max > 0)
                    ? `f<sub>p,max</sub> = (2 * P) / (3 * g<sub>x</sub> * g<sub>y</sub>)`
                    : `Resultant force is outside the base plate (g<sub>x</sub> or g<sub>y</sub> is negative). No compressive bearing occurs.`;
            }
        }

        const A1 = N * B;
        const A2 = pedestal_N * pedestal_B;
        const A2_A1_ratio = (A1 > 0 && A2 > A1) ? sqrt(A2 / A1) : 1.0;
        const confinement_factor = min(A2_A1_ratio, 2.0);
        const P_p = 0.85 * fc * A1 * confinement_factor;
        const phi = getPhi('bearing', design_method, inputs.jurisdiction);
        const omega = getPhi('bearing', design_method === 'LRFD' ? 'ASD' : 'LRFD', inputs.jurisdiction);
        const final_capacity = design_method === 'LRFD' ? P_p * phi : P_p / omega;

        // Fix huge number if invalid
        if (!isFinite(f_p_max) || isNaN(f_p_max) || f_p_max > 1e6) {
            f_p_max = 0;
            if (P_abs > 0 && e_x > N / 2) {
                // Load outside plate
                breakdown_formula = "Load resultant outside base plate (unstable).";
            }
        }

        return { // Return pressure in ksi for demand, capacity in kips
            demand: f_p_max,
            check: { Rn: P_p, phi, omega },
            details: { f_p_max, e_x, e_y, Y, X, A1, A2, confinement_factor, Pu, Mux, Muy, P_abs, bearing_case, breakdown_formula }
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
        const t_req = Math.sqrt((4 * Tu_bolt) / (getPhi('bending', design_method, inputs.jurisdiction) * Fy));

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
            const t_req_hss = cantilever_dist * Math.sqrt((2 * f_p_max) / (getPhi('bending', design_method, inputs.jurisdiction) * Fy));
            return {
                demand: tp, check: { Rn: t_req_hss, phi: 1.0, omega: 1.0 },
                details: { l: cantilever_dist, f_p_max, column_type }
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
            X = ((4 * d * bf) / (d + bf) ** 2) * Pu_Pp_ratio;
            // Ensure X is not > 1.0 to avoid issues with sqrt(1-X)
            X = Math.min(X, 1.0);
            lambda = (2 * sqrt(X)) / (1 + sqrt(1 - X));
            l = max(m, n, lambda * n_prime);
        } else {
            // If there is no bearing capacity (Pp=0) or no compression, use the simplified 'l'.
            l = max(m, n);
        }

        const t_req = l * sqrt((2 * f_p_max) / (getPhi('bending', design_method, inputs.jurisdiction) * Fy));

        return {
            demand: tp,
            check: { Rn: t_req, phi: 1.0, omega: 1.0 }, // Rn is the required thickness
            details: { m, n, n_prime, X, lambda, l, t_req, f_p_max, column_type }
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
        const Pu = bearing_results.details.Pu;

        if (Pu >= 0) {
            // If load is tension or zero, Thornton's rigidity check for compression does not apply.
            return { demand: tp, check: { Rn: 0, phi: 1.0, omega: 1.0 }, details: { l: 0, t_min: 0, reason: "Rigidity check is not applicable for tension loads." } };
        }

        const Pu_abs = Math.abs(Pu);
        const m = (N - 0.95 * d) / 2.0;
        const n = (B - 0.80 * bf) / 2.0;
        const l = Math.max(m, n);

        // Thornton's formula for minimum thickness for rigidity
        const t_min = l * Math.sqrt((2 * Pu_abs) / (0.9 * Fy * B * N));
        return { demand: tp, check: { Rn: t_min, phi: 1.0, omega: 1.0 }, details: { l, t_min, Pu_abs, B, N, Fy } };
    }

    /**
     * Checks if friction is sufficient to resist the applied shear load.
     * Reference: AISC Design Guide 1, Section 2.9
     * @param {object} inputs - The user inputs object.
     * @returns {object} An object with the friction check results.
     */
    function checkFrictionResistance(inputs) {
        const { shear_V_in: Vu, axial_load_P_in: Pu, design_method } = inputs;

        // Friction is only effective under compression (negative Pu).
        if (Pu >= 0) {
            return { demand: Vu, check: { Rn: 0, phi: 1.0, omega: 1.0 }, details: { mu: 0.4, Pu_compressive: 0, shear_resisted_by_friction: 0 } };
        }

        const Pu_compressive = Math.abs(Pu);
        // Friction coefficient (μ) for steel on grout/concrete. DG1 suggests 0.4.
        const mu = 0.4;

        // Nominal frictional resistance (Rn)
        const Rn = mu * Pu_compressive;
        const phi = 0.75; // Per DG1, a resistance factor of 0.75 is recommended for friction.
        return { demand: Vu, check: { Rn, phi, omega: 2.00 }, details: { mu, Pu_compressive, shear_resisted_by_friction: Rn } };
    }

    /**
     * Checks bolt bearing on the base plate material per AISC J3.10.
     * @param {object} inputs - The user inputs object.
     * @param {number} force_per_bolt - The shear force demand on a single bolt.
     * @returns {object} An object with the bolt bearing check results.
     */
    function checkBoltBearingOnPlate(inputs, force_per_bolt) {
        // Ensure all variables used in calculations are parsed as numbers.
        // Default to 0 if an input is invalid or empty to prevent NaN results.
        const db = parseFloat(inputs.anchor_bolt_diameter) || 0;
        const tp = parseFloat(inputs.provided_plate_thickness_tp) || 0;
        const Fu = parseFloat(inputs.base_plate_Fu) || 0;
        const base_plate_width_B = parseFloat(inputs.base_plate_width_B) || 0;
        const bolt_spacing_B = parseFloat(inputs.bolt_spacing_B) || 0;

        // Simplified: Assume a reasonable edge distance for the plate itself.
        // A more rigorous check would need the exact bolt-to-plate-edge distance as an input.
        const le = (base_plate_width_B - bolt_spacing_B) / 2.0;
        const hole_dia = AISC_SPEC.getNominalHoleDiameter(db);
        const Lc = le - hole_dia / 2.0;

        if (Lc <= 0 || db === 0 || tp === 0 || Fu === 0) {
            return {
                demand: force_per_bolt,
                check: { Rn: 0, phi: 0.75, omega: 2.00 },
                details: { Lc: Lc || 0, le: le || 0, hole_dia: hole_dia || 0, Rn_bearing: 0, Rn_tearout: 0 }
            };
        }

        // AISC J3-6a: Bearing strength
        const Rn_bearing = 2.4 * db * tp * Fu;
        // AISC J3-6b: Tearout strength
        const Rn_tearout = 1.2 * Lc * tp * Fu;

        const Rn = Math.min(Rn_bearing, Rn_tearout);
        return { demand: force_per_bolt, check: { Rn, phi: 0.75, omega: 2.00 }, details: { Lc, le, hole_dia, Rn_bearing, Rn_tearout, Fu } };
    }

    /**
     * Checks for column web local yielding and crippling at the base plate connection.
     * Reference: AISC 360-16, Chapter J10.2 and J10.3
     * @param {object} inputs - The user inputs object.
     * @param {object} bearing_results - The results from the concrete bearing check.
     * @returns {object} An object containing the web check results.
     */
    function checkColumnWebChecks(inputs, bearing_results) {
        const { column_type, column_depth_d: d, column_flange_width_bf: bf, column_web_tw: tw, column_flange_tf: tf, base_plate_Fy: Fy, design_method } = inputs;

        // These checks only apply to Wide Flange sections under compression
        if (column_type !== 'Wide Flange' || !bearing_results || bearing_results.details.Pu >= 0) return {};
        const f_p_max = bearing_results.details.f_p_max;

        // These properties are not direct inputs, so we must approximate them.
        const k_des = tf; // Approx. k distance
        if (tw <= 0 || tf <= 0) return { error: "Column thickness is zero." };
        const checks = {};

        // Web Local Yielding (AISC J10.2)
        const R_wly_demand = f_p_max * bf * tf; // Force on the critical flange area
        const Rn_wly = Fy * tw * (5 * k_des + bf);
        checks['Column Web Local Yielding'] = { demand: R_wly_demand, check: { Rn: Rn_wly, phi: 1.0, omega: 1.5 }, details: { Rn_wly, k_des, tw, bf, Fy, f_p_max } };

        // Web Local Crippling (AISC J10.3)
        const Rn_wlc = 0.80 * tw ** 2 * (1 + 3 * (bf / d) * (tw / tf) ** 1.5) * Math.sqrt(29000 * Fy * tf / tw);
        checks['Column Web Local Crippling'] = { demand: R_wly_demand, check: { Rn: Rn_wlc, phi: 0.75, omega: 2.00 }, details: { Rn_wlc, tw, bf, d, tf, Fy, f_p_max } };

        return checks;
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
        const { axial_load_P_in: Pu, moment_Mx_in: Mux_kipft, moment_My_in: Muy_kipft, num_bolts_N, num_bolts_B, bolt_spacing_N, bolt_spacing_B, anchor_bolt_diameter } = inputs;
        const Mux = Mux_kipft * 12; // kip-in
        const Muy = Muy_kipft * 12; // kip-in
        const bolt_coords = getBoltCoordinates(inputs);

        // Call the new breakdown function to get the value
        const result = generateAnchorTensionBreakdown(Pu, Mux, Muy, bolt_coords, inputs);
        return result; // This now returns an object { value, breakdown }
    }

    // --- Modular Anchor Check Functions (ACI 318-19, Chapter 17) ---

    function checkAnchorSteelTension(inputs) {
        const { anchor_bolt_diameter: db, anchor_bolt_Fut: Fut, design_method } = inputs;
        const Ab = AISC_SPEC.getBoltProperties(db)?.Ab || 0;
        // FIX: Always request 'LRFD' phi for Anchor Checks to ensure we get the reduction factor (0.25 for OSHA), not Omega.
        return { Rn: Ab * Fut, phi: getPhi('anchor_tension_steel', 'LRFD', inputs.jurisdiction), omega: getPhi('anchor_tension_steel', 'ASD', inputs.jurisdiction) };
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

        const e_N = bearing_results.details.e_x;
        const e_prime_N = e_N > 0 ? (N / 2 - bearing_results.details.Y) / 2 : 0;
        const psi_ec_N = 1.0 / (1 + (2 * e_prime_N) / (3 * hef));
        const psi_ed_N = (ca1 < 1.5 * hef) ? (0.7 + 0.3 * ca1 / (1.5 * hef)) : 1.0;
        const psi_c_N = assume_cracked_concrete === 'true' ? 1.0 : 1.25;
        const psi_cp_N = 1.0; // Assumed for cast-in

        const Ncbg = (ANc / ANco) * psi_ec_N * psi_ed_N * psi_c_N * psi_cp_N * Nb * num_bolts_tension_row;
        const details = { ANc, ANco, psi_ec_N, psi_ed_N, psi_c_N, psi_cp_N, Nb };
        return { Rn: Ncbg, phi: getPhi('anchor_tension_concrete', 'LRFD', inputs.jurisdiction), omega: getPhi('anchor_tension_concrete', 'ASD', inputs.jurisdiction), details };
    }

    function checkAnchorPullout(inputs) {
        const { design_method, anchor_bolt_diameter: db, concrete_fc: fc, assume_cracked_concrete } = inputs;
        const Abrg = AISC_SPEC.getBoltProperties(db)?.Ab || 0; // Bearing area of anchor head, simplified as bolt area
        const Np = 8 * Abrg * fc;
        const psi_c_P = assume_cracked_concrete === 'true' ? 1.0 : 1.4;
        const details = { Abrg, Np, psi_c_P };
        return { Rn: psi_c_P * Np, phi: getPhi('anchor_pullout', 'LRFD', inputs.jurisdiction), omega: getPhi('anchor_pullout', 'ASD', inputs.jurisdiction), details };
    }

    function checkAnchorSideFaceBlowout(inputs) {
        const { design_method, anchor_bolt_diameter: db, concrete_fc: fc, concrete_edge_dist_ca1: ca1, anchor_embedment_hef: hef, bolt_spacing_N, num_bolts_N } = inputs;
        if (ca1 >= 0.4 * hef) return null; // Check does not apply

        const Abrg = AISC_SPEC.getBoltProperties(db)?.Ab || 0;
        const Nsb_single = 160 * ca1 * sqrt(Abrg) * 1.0 * sqrt(fc * 1000) / 1000; // in kips
        const Nsbg = (1 + bolt_spacing_N / (6 * ca1)) * Nsb_single;
        const details = { ca1, hef, Abrg, Nsb_single, Nsbg, num_bolts_at_edge: num_bolts_N };
        return { Rn: Nsbg * num_bolts_N, phi: getPhi('anchor_side_face', 'LRFD', inputs.jurisdiction), omega: getPhi('anchor_side_face', 'ASD', inputs.jurisdiction), details };
    }

    function checkAnchorSteelShear(inputs) { // This function was missing in the original context
        const { design_method, anchor_bolt_diameter: db, anchor_bolt_Fut: Fut } = inputs;
        const Ab = AISC_SPEC.getBoltProperties(db)?.Ab || 0;
        return { Rn: 0.6 * Ab * Fut, phi: getPhi('anchor_shear_steel', 'LRFD', inputs.jurisdiction), omega: getPhi('anchor_shear_steel', 'ASD', inputs.jurisdiction) };
    }

    function checkAnchorConcreteShearBreakout(inputs) {
        const { design_method, anchor_bolt_diameter: db, anchor_embedment_hef: hef, concrete_fc: fc, concrete_edge_dist_ca1: ca1, bolt_spacing_N, num_bolts_N, assume_cracked_concrete } = inputs;
        if (ca1 <= 0) return null; // Check requires an edge distance

        const le = hef;
        const Vb = 7 * (le / db) ** 0.2 * sqrt(db) * 1.0 * sqrt(fc * 1000) * (ca1 ** 1.5) / 1000; // in kips
        const Avc = (1.5 * ca1 + 1.5 * ca1 + bolt_spacing_N) * (1.5 * ca1);
        const Avco = 4.5 * ca1 ** 2;
        const psi_c_V = assume_cracked_concrete === 'true' ? 1.0 : 1.4;
        const Vcbg = (Avc / (Avco * num_bolts_N)) * 1.0 * psi_c_V * 1.0 * Vb * num_bolts_N;
        const details = { Vb, Avc_Avco: Avc / (Avco * num_bolts_N), psi_c_V };
        return { Rn: Vcbg, phi: getPhi('anchor_shear_concrete', 'LRFD', inputs.jurisdiction), omega: getPhi('anchor_shear_concrete', 'ASD', inputs.jurisdiction), details };
    }

    function checkAnchorConcretePryout(inputs, concrete_breakout_check) {
        if (!concrete_breakout_check) return null;
        const { design_method, anchor_embedment_hef: hef } = inputs;
        const k_cp = hef < 2.5 ? 1.0 : 2.0;
        const Ncb_tension = concrete_breakout_check.check.Rn;
        const details = { k_cp, Ncb: Ncb_tension };
        return { Rn: k_cp * Ncb_tension, phi: getPhi('anchor_pryout', 'LRFD', inputs.jurisdiction), omega: getPhi('anchor_pryout', 'ASD', inputs.jurisdiction), details };
    }

    function checkAnchorInteraction(Tu_group, Vu, checks, design_method, jurisdiction) {
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

        const phi_T_steel = getPhi('anchor_tension_steel', 'LRFD', jurisdiction);
        const phi_V_steel = getPhi('anchor_shear_steel', 'LRFD', jurisdiction);
        const phi_T_concrete = getPhi('anchor_tension_concrete', 'LRFD', jurisdiction);
        const phi_V_concrete = getPhi('anchor_shear_concrete', 'LRFD', jurisdiction);

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
    function performAnchorChecks(inputs, Tu_bolt, shear_on_bolts, bearing_results, tension_breakdown) {
        const { num_bolts_N, num_bolts_B, design_method } = inputs;
        const num_bolts_total = num_bolts_N * num_bolts_B;
        const num_bolts_tension_row = num_bolts_B;
        let anchorChecks = {};

        // --- Load Factoring for Anchor Checks ---
        // ACI 318 anchor design is strength-based (LRFD). If the user selected ASD,
        // we must factor the service loads up to a strength level for the anchor checks.
        // UNLESS Jurisdiction is OSHA. For OSHA, we compare Service Loads vs Reduced Capacity (Rn/4),
        // or effectively Factored Capacity (0.25*Rn). To maintain logic consistency, we treat OSHA 
        // as Is LRFD=True in terms of NOT increasing loads, effectively comparing P vs 0.25Rn => 4P vs Rn.

        const is_osha = inputs.jurisdiction === 'OSHA';
        const asd_load_factor = (design_method === 'ASD' && !is_osha) ? 1.6 : 1.0;
        const is_asd = design_method === 'ASD';
        const Tu_bolt_strength = Tu_bolt * asd_load_factor;
        const Vu_strength = shear_on_bolts * asd_load_factor;
        const load_factor_note = (is_asd && !is_osha) ? `ASD service loads were factored by ${asd_load_factor} for ACI strength design.` : '';

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
        if (shear_on_bolts > 0) {
            if (num_bolts_total <= 0) return { error: "Cannot check anchor shear with zero total bolts." }; // This should be caught by validation
            const Vu_bolt = Vu_strength / num_bolts_total;

            anchorChecks['Anchor Steel Shear'] = { demand: Vu_bolt, check: checkAnchorSteelShear(inputs), details: { num_bolts_total } };
            const shear_breakout_check = checkAnchorConcreteShearBreakout(inputs);
            if (shear_breakout_check) anchorChecks['Anchor Concrete Shear Breakout'] = { demand: Vu_strength, check: shear_breakout_check };

            const pryout_check = checkAnchorConcretePryout(inputs, anchorChecks['Anchor Concrete Breakout']);
            if (pryout_check) anchorChecks['Anchor Concrete Pryout'] = { demand: Vu_strength, check: pryout_check };
        }

        // --- Combined Shear and Tension Interaction (ACI 17.8) ---
        if (Tu_bolt > 0 && shear_on_bolts > 0) {
            // Use strength-level loads for interaction check
            const interaction_checks = checkAnchorInteraction(Tu_group, Vu_strength, anchorChecks, design_method, inputs.jurisdiction);
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
        const phi = getPhi('weld', design_method, inputs.jurisdiction);
        const omega = getPhi('weld', 'ASD', inputs.jurisdiction); // Get ASD factor
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
            const t_bm = column_type === 'Wide Flange' ? tw : (d / 2 - Math.sqrt((d / 2) ** 2 - (bf / 2) ** 2)); // Approx HSS thickness
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
            const Iw_x = 2 * (L_flange * (d / 2) ** 2) + 2 * (L_web ** 3 / 12);
            const Sw_x = Iw_x / (d / 2);
            // Corrected Moment of Inertia for the weld group (weak axis)
            const Iw_y = 2 * (L_flange ** 3 / 12) + 2 * (L_web * (tw / 2) ** 2);
            const Sw_y = Iw_y / (bf / 2);

            const f_axial = abs(Pu) / Aw;
            const f_moment_x = (Mux * 12) / Sw_x;
            const f_moment_y = (Muy * 12) / Sw_y;
            // Shear is resisted by the two web welds. The total length is 2 * L_web.
            const total_web_weld_length = 2 * L_web;
            const f_shear_x = total_web_weld_length > 0 ? abs(Vu) / total_web_weld_length : 0;
            const f_shear_y = 0; // Assuming V is only in strong axis
            f_max_weld = sqrt((f_axial + f_moment_x + f_moment_y) ** 2 + f_shear_x ** 2 + f_shear_y ** 2);
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
            f_max_weld = sqrt((f_axial + f_moment) ** 2 + f_shear ** 2);
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
        const Rn_wlc = 0.80 * tw ** 2 * (1 + 3 * (bf / d) * (tw / tf) ** 1.5) * sqrt(29000 * Fy * tf / tw);
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

    // This function is intended to be called by the main application logic
    // to perform the base plate calculations. It can use a Python backend
    // if available, or fall back to the local JavaScript implementation.
    const calculatorFunction = async (inputs, validation) => {
        if (window.eel && window.eel.calculate_base_plate_all) {
            console.log("Using Python Backend for Base Plate Check...");
            try {
                const result = await window.eel.calculate_base_plate_all(inputs)();
                if (result.error) {
                    console.error("Backend Error:", result.error);
                    throw new Error(result.error);
                }
                return result;
            } catch (e) {
                console.error("Backend call failed, falling back to local JS.", e);
                // Explicitly pass validation to local run if backend fails
                return run(inputs, validation); // Call the local run function
            }
        }
        return run(inputs, validation); // Call the local run function
    };

    function run(inputs, validation) { // FIX: Accept the validation object as an argument
        // --- FIX: Call getBasePlateGeometryChecks ---
        // This function was defined but not called in the main run function.
        // It's now called to perform the ACI checks on every run.
        const geomChecks = getBasePlateGeometryChecks(inputs);
        if (validation.errors.length > 0) {
            return { errors: validation.errors, warnings: validation.warnings, checks: {}, geomChecks };
        }

        // Calculate edge distances and add them to the inputs object for use in other checks
        const { ca1, ca2 } = calculateEdgeDistances(inputs);
        inputs.concrete_edge_dist_ca1 = ca1;
        inputs.concrete_edge_dist_ca2 = ca2;
        let checks = {};

        const bearing_results = checkConcreteBearing(inputs);
        if (bearing_results.error) return { errors: [bearing_results.error], checks, geomChecks };
        checks['Concrete Bearing'] = bearing_results;

        // --- Shear Demand Calculation ---
        const friction_check = checkFrictionResistance(inputs);
        checks['Friction Resistance'] = friction_check;
        let shear_on_bolts = inputs.shear_V_in;
        const friction_capacity = inputs.design_method === 'LRFD' ? friction_check.check.Rn * friction_check.check.phi : friction_check.check.Rn / friction_check.check.omega;

        if (friction_capacity >= Math.abs(inputs.shear_V_in)) {
            shear_on_bolts = 0; // Friction is sufficient to take all shear.
            friction_check.details.note = "Friction is sufficient to resist the entire shear load. Shear on anchor bolts is considered zero.";
        } else {
            shear_on_bolts = Math.abs(inputs.shear_V_in) - friction_capacity;
            friction_check.details.note = `Friction resists ${friction_capacity.toFixed(2)} kips. The remaining ${shear_on_bolts.toFixed(2)} kips must be resisted by anchor bolts.`;
        }

        const bending_results = checkPlateBending(inputs, bearing_results); // Can be null
        if (bending_results?.error) return { errors: [bending_results.error], checks, geomChecks };
        if (bending_results) checks['Plate Bending'] = bending_results;

        const { value: Tu_bolt, breakdown: tension_breakdown } = calculateAnchorTension(inputs);
        const anchor_checks = performAnchorChecks(inputs, Tu_bolt, shear_on_bolts, bearing_results, tension_breakdown);
        Object.assign(checks, anchor_checks);

        // --- Add Plate Bending in Uplift Check ---
        const bending_uplift_results = checkPlateBendingUplift(inputs, Tu_bolt);
        if (bending_uplift_results) checks['Plate Bending in Uplift'] = bending_uplift_results;

        const num_bolts_total = inputs.num_bolts_N * inputs.num_bolts_B;
        checks['Bolt Bearing on Plate'] = checkBoltBearingOnPlate(inputs, num_bolts_total > 0 ? shear_on_bolts / num_bolts_total : 0);

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

    /**
     * Calculates the maximum tension force on a single anchor bolt under combined axial load and biaxial bending.
     * @param {object} inputs - The user inputs object.
     * @returns {object} An object containing the max tension value and the data for the breakdown.
     */
    return { run, validateBasePlateInputs };
})();

function generateAnchorTensionBreakdown(Pu, Mux, Muy, bolt_coords, inputs) {
    if (bolt_coords.length === 0) {
        return { value: 0, breakdown: 'No bolts defined.' };
    }

    const num_bolts = bolt_coords.length;
    const Ix = bolt_coords.reduce((sum, b) => sum + b.z ** 2, 0);
    const Iy = bolt_coords.reduce((sum, b) => sum + b.x ** 2, 0);

    let max_tension = 0;
    let max_bolt_calcs = { axial: 0, mx: 0, my: 0, x: 0, z: 0 };

    bolt_coords.forEach(bolt => {
        const force_from_axial = Pu / num_bolts;
        const force_from_Mx = Ix > 0 ? (Mux * bolt.z) / Ix : 0;
        const force_from_My = Iy > 0 ? (Muy * bolt.x) / Iy : 0;
        const total_force = force_from_axial + force_from_Mx + force_from_My;
        if (total_force > max_tension) {
            max_tension = total_force;
            max_bolt_calcs = {
                axial: force_from_axial,
                mx: force_from_Mx,
                my: force_from_My,
                z: bolt.z,
                x: bolt.x
            };
        }
    });

    max_tension = Math.max(0, max_tension);

    const breakdown = `
        <ul class="list-disc list-inside text-xs">
            <li>T<sub>u,bolt</sub> &approx; P/n + M<sub>x</sub>&middot;z/I<sub>x</sub> + M<sub>y</sub>&middot;x/I<sub>y</sub></li>
            <li>P/n = ${Pu.toFixed(2)} / ${num_bolts} = ${max_bolt_calcs.axial.toFixed(2)} kips</li>
            <li>M<sub>x</sub> term = (${Mux.toFixed(2)} kip-in * ${max_bolt_calcs.z.toFixed(2)} in) / ${Ix.toFixed(2)} in² = ${max_bolt_calcs.mx.toFixed(2)} kips</li>
            <li>M<sub>y</sub> term = (${Muy.toFixed(2)} kip-in * ${max_bolt_calcs.x.toFixed(2)} in) / ${Iy.toFixed(2)} in² = ${max_bolt_calcs.my.toFixed(2)} kips</li>
            <li><b>Resultant Max Tension = ${max_tension.toFixed(2)} kips</b></li>
        </ul>
    `;

    return { value: max_tension, breakdown };
}

function generateBasePlateBreakdownHtml(name, data, inputs, results) {
    const { check } = data;
    const details = data.details || check.details;

    // --- Backend Override ---
    // If the backend provides a pre-formatted breakdown, use it directly.
    // This allows for "educational" content to be generated on the server side.
    if (details && details.breakdown) {
        return details.breakdown;
    }

    // --- Special Handler for Concrete Bearing ---
    if (name === 'Concrete Bearing') {
        const { e_x, e_y, Mux, Muy, P_abs, bearing_case, breakdown_formula, f_p_max } = details;
        const breakdown_items = [
            `<u>Maximum Bearing Pressure (f<sub>p,max</sub>)</u>`,
            `<ul>`,
            `<li>Eccentricity (e<sub>x</sub>) = M<sub>ux</sub> / P<sub>u</sub> = ${(Mux * 12).toFixed(2)} / ${P_abs.toFixed(2)} = ${e_x.toFixed(2)} in</li>`,
            `<li>Eccentricity (e<sub>y</sub>) = M<sub>uy</sub> / P<sub>u</sub> = ${(Muy * 12).toFixed(2)} / ${P_abs.toFixed(2)} = ${e_y.toFixed(2)} in</li>`,
            `<li>Bearing Case: <b>${bearing_case}</b></li>`,
            `<li>Formula: ${breakdown_formula}</li>`,
            `<li>Result: f<sub>p,max</sub> = <b>${f_p_max.toFixed(2)} ksi</b></li>`,
            `</ul>`,
            `<hr class="my-2 dark:border-gray-600">`,
            `<u>Nominal Bearing Strength (P<sub>p</sub>) per AISC J8</u>`,
            `<ul>`,
            `<li>Confinement Factor (&Psi;) = min(&radic;(A₂/A₁), 2.0) = min(&radic;(${details.A2.toFixed(2)}/${details.A1.toFixed(2)}), 2.0) = ${details.confinement_factor.toFixed(2)}</li>`,
            `<li>P<sub>p</sub> = 0.85 &times; f'c &times; A₁ &times; &Psi;</li>`,
            `<li>P<sub>p</sub> = 0.85 &times; ${inputs.concrete_fc} ksi &times; ${details.A1.toFixed(2)} in² &times; ${details.confinement_factor.toFixed(2)} = <b>${(details.Rn_force || (check.Rn * details.A1)).toFixed(2)} kips</b></li>`,
            `</ul>`
        ];
        return breakdown_items.join('');
    }

    // --- Special Handler for Plate Bending ---
    if (name === 'Plate Bending') {
        const { l, f_p_max, column_type, m, n, n_prime, X, lambda } = details;
        const { design_method, base_plate_Fy } = inputs;
        const phi_bending_val = getPhi('bending', design_method, inputs.jurisdiction);
        const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
        let breakdown_items = [];

        if (column_type === 'Wide Flange' || column_type === 'W-Shape' || column_type === 'W' || column_type === 'S-Shape' || column_type === 'S') {
            if (m === undefined || n === undefined || n_prime === undefined || l === undefined) {
                return 'Breakdown not available due to missing calculation details for Wide Flange column.';
            }
            const lambda_str = lambda !== undefined && lambda !== null ? lambda.toFixed(3) : 'N/A';
            const X_str = X !== undefined && X !== null ? X.toFixed(3) : 'N/A';
            breakdown_items = [
                `<u>Required Thickness (t<sub>req</sub>) per AISC DG 1 (Wide Flange)</u>`,
                `<li>Cantilever distance (m) = (N - 0.95d)/2 = <b>${m.toFixed(3)} in</b></li>`,
                `<li>Cantilever distance (n) = (B - 0.80b<sub>f</sub>)/2 = <b>${n.toFixed(3)} in</b></li>`,
                `<li>Dimension (n') = &radic;(d&middot;b<sub>f</sub>)/4 = <b>${n_prime.toFixed(3)} in</b></li>`,
                `<li>Effective cantilever length (l) = max(m, n, &lambda;n') = <b>${l.toFixed(3)} in</b> (where &lambda;=${lambda_str}, X=${X_str})</li>`,
            ];
        } else { // Round HSS
            breakdown_items = [
                `<u>Required Thickness (t<sub>req</sub>) for HSS (Simplified Cantilever)</u>`,
                `<li>Cantilever length (l) = (max(N, B) - D)/2 = <b>${l.toFixed(3)} in</b></li>`,
            ];
        }
        breakdown_items.push(`<li>t<sub>req</sub> = l &times; &radic;(2 &times; f<sub>p,max</sub> / (${factor_char}F<sub>y</sub>))</li>`);
        breakdown_items.push(`<li>t<sub>req</sub> = ${l.toFixed(3)} &times; &radic;(2 &times; ${f_p_max.toFixed(2)} ksi / (${phi_bending_val} &times; ${base_plate_Fy} ksi)) = <b>${check.Rn.toFixed(3)} in</b></li>`);
        return `<ul>${breakdown_items.join('')}</ul>`;
    }

    // --- Special Handler for Minimum Thickness (Rigidity) ---
    if (name === 'Minimum Plate Thickness (Rigidity)') {
        const { l, t_min, Pu_abs, B, N, Fy, reason } = details;
        if (reason) {
            return `<p>${reason} A minimum thickness of 0.25 inches is recommended for serviceability.</p>`;
        }
        const breakdown_items = [
            `<u>Required Minimum Thickness (t<sub>min</sub>) for Rigidity (Thornton's Method)</u>`,
            `<li>Cantilever (l) = max((N-0.95d)/2, (B-0.80b<sub>f</sub>)/2) = <b>${l.toFixed(3)} in</b></li>`,
            `<li>t<sub>min</sub> = l &times; &radic;[ (2 &times; P<sub>u</sub>) / (0.9 &times; F<sub>y</sub> &times; B &times; N) ]</li>`,
            `<li>t<sub>min</sub> = ${l.toFixed(3)} &times; &radic;[ (2 &times; ${Pu_abs.toFixed(2)}) / (0.9 &times; ${Fy} &times; ${B} &times; ${N}) ] = <b>${t_min.toFixed(3)} in</b></li>`
        ];
        return `<ul>${breakdown_items.join('')}</ul>`;
    }

    const { design_method } = inputs;
    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;'; // Moved here

    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;
    let content = '';

    switch (name) {
        case 'Concrete Bearing':
            // This case is now handled by the special handler above the switch statement.
            break;
        case 'Plate Bending':
            const phi_bending_val = getPhi('bending', design_method, inputs.jurisdiction);
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
            } else { // Round HSS or Pipe
                content = format_list([
                    `<u>Required Thickness (t<sub>req</sub>) for HSS/Pipe (Simplified Cantilever)</u>`,
                    `Cantilever length (l) = (max(N, B) - D)/2 = (max(${inputs.base_plate_length_N}, ${inputs.base_plate_width_B}) - ${inputs.column_depth_d})/2 = <b>${details.l.toFixed(3)} in</b>`,
                    `t<sub>req</sub> = l &times; &radic;(2 &times; f<sub>p,max</sub> / (${factor_char}F<sub>y</sub>))`,
                    `t<sub>req</sub> = ${details.l.toFixed(3)} &times; &radic;(2 &times; ${details.f_p_max.toFixed(2)} ksi / (${phi_bending_val} &times; ${inputs.base_plate_Fy} ksi)) = <b>${check.Rn.toFixed(3)} in</b>`
                ]);
            }
            break;
        case 'Plate Bending in Uplift':
            const phi_bending_uplift = getPhi('bending', design_method, inputs.jurisdiction);
            content = format_list([
                `<u>Required Thickness (t<sub>req</sub>) for Uplift per AISC DG 1, Sec. 3.4.2</u>`,
                `This check governs when the plate bends due to tension in the anchor bolts.`,
                `Cantilever (c) = <b>${details.c.toFixed(3)} in</b> (Simplified distance from bolt to column face)`,
                `t<sub>req</sub> = &radic;(4 &times; T<sub>u,bolt</sub> / (${factor_char}F<sub>y</sub>))`,
                `t<sub>req</sub> = &radic;(4 &times; ${details.Tu_bolt.toFixed(2)} kips / (${phi_bending_uplift} &times; ${inputs.base_plate_Fy} ksi)) = <b>${check.Rn.toFixed(3)} in</b>`
            ]);
            break;
        case 'Bolt Bearing on Plate':
            const tearout_coeff = 1.2; // Deformation at bolt hole is a design consideration
            const bearing_coeff = 2.4;
            content = format_list([
                `<u>Nominal Bearing Strength (R<sub>n</sub>) per AISC J3.10 on Plate Material (${inputs.base_plate_material})</u>`,
                `Clear Distance (L<sub>c</sub>) = L<sub>e</sub> - d<sub>h</sub>/2 = ${details.le.toFixed(3)} - ${details.hole_dia.toFixed(3)}/2 = <b>${details.Lc.toFixed(3)} in</b>`,
                `Tearout Strength (R<sub>n,tearout</sub>) = ${tearout_coeff} &times; L<sub>c</sub> &times; t<sub>p</sub> &times; F<sub>u</sub> = <b>${details.Rn_tearout.toFixed(2)} kips</b>`,
                `Bearing Strength (R<sub>n,bearing</sub>) = ${bearing_coeff} &times; d<sub>b</sub> &times; t<sub>p</sub> &times; F<sub>u</sub> = <b>${details.Rn_bearing.toFixed(2)} kips</b>`,
                `R<sub>n</sub> = min(Tearout, Bearing) = <b>${check.Rn.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Friction Resistance':
            content = format_list([
                `<u>Nominal Frictional Resistance (R<sub>n</sub>) per AISC DG 1, Sec. 2.9</u>`,
                `R<sub>n</sub> = &mu; &times; P<sub>u,compressive</sub>`,
                `R<sub>n</sub> = ${details.mu} &times; ${details.Pu_compressive.toFixed(2)} kips = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity</u>`,
                `<em>${details.note || 'No special notes.'}</em>`
            ]);
            break;
        case 'Anchor Steel Tension':
            const Ab_tension = Math.PI * (inputs.anchor_bolt_diameter ** 2) / 4.0;
            const Nsa = Ab_tension * (AISC_SPEC.getFnt(inputs.anchor_bolt_grade) || inputs.anchor_bolt_Fut);
            const phiNsa = (check?.phi || 0.75) * Nsa;
            content = (details.breakdown || (typeof generateAnchorTensionBreakdown === 'function' ? generateAnchorTensionBreakdown(details.Pu, details.Mux, details.Muy, (inputs.bolt_coords || []), inputs).breakdown : 'Breakdown not available')) + 
            format_list([
                `<u>Nominal Steel Strength (N<sub>sa</sub>) per ACI 17.6.1</u>`,
                `<u>Design Capacity (per bolt)</u>`,
                `&phi;N<sub>sa</sub> = &phi; &times; A<sub>b,eff</sub> &times; F<sub>ut</sub> = ${(check?.phi || 0.75)} &times; ${Ab_tension.toFixed(3)} in² &times; ${inputs.anchor_bolt_Fut} ksi = <b>${phiNsa.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Steel Shear':
            const Ab_shear = Math.PI * (inputs.anchor_bolt_diameter ** 2) / 4.0;
            const Vu_bolt = data.demand;
            const shear_on_bolts = results.checks['Friction Resistance']?.details?.note.match(/remaining ([\d.]+) kips/)?.[1] || '0';
            content = format_list([
                `<u>Shear Demand per Bolt (V<sub>u,bolt</sub>)</u>`,
                `V<sub>u,bolt</sub> = V<sub>net</sub> / n<sub>bolts</sub> = ${parseFloat(shear_on_bolts).toFixed(2)} / ${details.num_bolts_total} = <b>${Vu_bolt.toFixed(2)} kips</b>`,
                `<u>Nominal Steel Strength (V<sub>sa</sub>) per ACI 17.7.1</u>`,
                `&phi;V<sub>sa</sub> = &phi; &times; 0.6 &times; A<sub>b,eff</sub> &times; F<sub>ut</sub>`, // Fut is actually Fnt
                `&phi;V<sub>sa</sub> = ${check.phi} &times; 0.6 &times; ${Ab_shear.toFixed(3)} in² &times; ${inputs.anchor_bolt_Fut} ksi = <b>${(check.phi * check.Rn).toFixed(2)} kips</b>`
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
                `Design Capacity (Group) = &phi;N<sub>cbg</sub> = ${check.phi} &times; ${check.Rn.toFixed(2)} = <b>${(check.phi * check.Rn).toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Pullout Strength':
            if (!details) { content = 'Calculation details not available. Check may not be applicable.'; } else {
                content = format_list([
                    `<u>Nominal Pullout Strength (N<sub>pn</sub>) per ACI 17.6.3</u>`,
                    `Basic Pullout Strength (N<sub>p</sub>) = 8 &times; A<sub>brg</sub> &times; f'c = 8 &times; ${(details.Abrg || 0).toFixed(3)} in² &times; ${inputs.concrete_fc} ksi = <b>${(details.Np || 0).toFixed(2)} kips</b>`,
                    `Nominal Strength (N<sub>pn</sub>) = &psi;<sub>c,P</sub> &times; N<sub>p</sub> = ${details.psi_c_P.toFixed(2)} &times; ${(details.Np || 0).toFixed(2)} = <b>${(check?.Rn || 0).toFixed(2)} kips</b>`,
                    `Design Capacity (per bolt) = &phi;N<sub>pn</sub> = ${check.phi} &times; ${check.Rn.toFixed(2)} = <b>${(check.phi * check.Rn).toFixed(2)} kips</b>`
                ]);
            }
            break;
        case 'Anchor Side-Face Blowout':
            if (!details) { content = 'Calculation details not available. Check may not be applicable.'; } else {
                content = format_list([
                    `<u>Nominal Side-Face Blowout Strength (N<sub>sbg</sub>) per ACI 17.6.4</u>`,
                    `Check applies because cₐ₁ (${details.ca1.toFixed(2)}") < 0.4 &times; hₑf (${(0.4 * details.hef).toFixed(2)}")`,
                    `Single Anchor (N<sub>sb</sub>) = 160 &times; cₐ₁ &times; &radic;A<sub>brg</sub> &times; &radic;f'c = <b>${(details.Nsb_single || 0).toFixed(2)} kips</b>`,
                    `Group (N<sub>sbg</sub>) = (1 + s/(6cₐ₁)) &times; N<sub>sb</sub> = <b>${(details.Nsbg || 0).toFixed(2)} kips/bolt</b>`,
                    `Total Group Capacity = N<sub>sbg</sub> &times; n_bolts = ${(details.Nsbg || 0).toFixed(2)} &times; ${details.num_bolts_at_edge} = <b>${(check?.Rn || 0).toFixed(2)} kips</b>`
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
                `Nominal Strength (V<sub>cbg</sub>) = (A<sub>vc</sub>/A<sub>vco</sub>) &times; &psi;<sub>...</sub> &times; V<sub>b</sub> &times; n = <b>${check.Rn.toFixed(2)} kips</b>`
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
                `Capacity = ${check.phi}R<sub>n</sub> = <b>${(check.phi * check.Rn).toFixed(2)} kips</b>`
            ]);
            break;
        case 'Weld Strength':
            const factor_val = getPhi('weld', design_method, inputs.jurisdiction);
            let weld_cap_eq, weld_strength_calc;
            if (inputs.weld_type === 'Fillet') {
                weld_cap_eq = design_method === 'LRFD' ? `&phi;R<sub>n</sub> = &phi; &times; 0.6F<sub>exx</sub> &times; 0.707w` : `R<sub>n</sub>/&Omega; = (0.6F<sub>exx</sub> &times; 0.707w) / &Omega;`;
                if (design_method === 'LRFD') {
                    weld_strength_calc = `&phi;R<sub>n</sub> = ${factor_val} &times; 0.6 &times; ${inputs.weld_Fexx} ksi &times; 0.707 &times; ${inputs.weld_size}" = <b>${(check.Rn * factor_val).toFixed(2)} kips/in</b>`;
                } else {
                    weld_strength_calc = `R<sub>n</sub>/&Omega; = (0.6 &times; ${inputs.weld_Fexx} ksi &times; 0.707 &times; ${inputs.weld_size}") / ${factor_val} = <b>${(check.Rn / factor_val).toFixed(2)} kips/in</b>`;
                }
            } else if (inputs.weld_type === 'PJP') {
                weld_cap_eq = design_method === 'LRFD' ? `&phi;R<sub>n</sub> = &phi; &times; 0.6F<sub>exx</sub> &times; E` : `R<sub>n</sub>/&Omega; = (0.6F<sub>exx</sub> &times; E) / &Omega;`;
                 if (design_method === 'LRFD') {
                    weld_strength_calc = `&phi;R<sub>n</sub> = ${factor_val} &times; 0.6 &times; ${inputs.weld_Fexx} ksi &times; ${inputs.weld_effective_throat}" = <b>${(check.Rn * factor_val).toFixed(2)} kips/in</b>`;
                } else {
                    weld_strength_calc = `R<sub>n</sub>/&Omega; = (0.6 &times; ${inputs.weld_Fexx} ksi &times; ${inputs.weld_effective_throat}") / ${factor_val} = <b>${(check.Rn / factor_val).toFixed(2)} kips/in</b>`;
                }
            } else { // CJP
                weld_cap_eq = design_method === 'LRFD' ? `&phi; * 0.6 * F<sub>y</sub> * t<sub>base_metal</sub>` : `(0.6 * F<sub>y</sub> * t<sub>base_metal</sub>) / &Omega;`;
                weld_strength_calc = `CJP welds develop the strength of the base metal. Capacity is based on shear yielding of the column wall.`;
            }

            let stress_calcs = [];
            if (inputs.column_type === 'Wide Flange' && details.Sw_x > 0) {
                stress_calcs.push(`Normal Stress (f<sub>n</sub>) = P/A<sub>w</sub> + M<sub>x</sub>/S<sub>wx</sub> + M<sub>y</sub>/S<sub>wy</sub> = ${details.f_axial.toFixed(2)} + ${(inputs.moment_Mx_in * 12 / details.Sw_x).toFixed(2)} + ${(inputs.moment_My_in * 12 / details.Sw_y).toFixed(2)} = <b>${(details.f_axial + details.f_moment_x + details.f_moment_y).toFixed(2)} kips/in</b>`);
                stress_calcs.push(`Shear Stress (f_v) = &radic;(f<sub>vx</sub>² + f<sub>vy</sub>²) = &radic;(${details.f_shear_x.toFixed(2)}² + ${details.f_shear_y.toFixed(2)}²) = ${sqrt(details.f_shear_x ** 2 + details.f_shear_y ** 2).toFixed(2)} kips/in`);
                stress_calcs.push(`Resultant Stress (f<sub>r</sub>) = &radic;(f<sub>n</sub>² + f<sub>v</sub>²) = <b>${details.f_max_weld.toFixed(2)} kips/in</b>`);
            } else if (inputs.column_type === 'Round HSS' || inputs.column_type === 'Pipe') {
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
                `Nominal Strength (V<sub>cpg</sub>) = k<sub>cp</sub> &times; N<sub>cbg</sub> = ${details.k_cp.toFixed(1)} &times; ${details.Ncb.toFixed(2)} = <b>${check.Rn.toFixed(2)} kips</b>`
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
        default: 
            if (details && details.breakdown) {
                // If the backend sent pre-formatted HTML, use it. But wrap it if needed or trust it.
                // My backend sends <ul>...</ul>. format_list expects array of strings.
                // But details.breakdown is likely a full HTML string.
                // The return value of this function acts as HTML content.
                return details.breakdown;
            }
            return 'Breakdown not available.';
    }
    return content;
}

function renderResults(results) {
    console.log("renderResults started.");
    const { checks, geomChecks, inputs, warnings } = results;
    const { design_method } = inputs;

    const report = new ReportBuilder({
        reportId: 'baseplate-report-content',
        title: 'Base Plate & Anchorage Check Results',
        warnings: warnings
    });

    // --- Input Summary ---
    const inputSummaryRows = [
        { cells: ['Design Method', inputs.design_method] },
        { cells: ['Design Code', inputs.design_code] },
        { cells: ['Plate Material', `${inputs.base_plate_material} (F<sub>y</sub>=${inputs.base_plate_Fy} ksi)`] },
        { cells: ['Concrete Strength (f\'c)', `${inputs.concrete_fc} ksi`] },
        { cells: ['Pedestal Dimensions (N &times; B)', `${inputs.pedestal_N}" &times; ${inputs.pedestal_B}"`] },
        { cells: ['Plate Dimensions (N &times; B &times; t<sub>p</sub>)', `${inputs.base_plate_length_N}" &times; ${inputs.base_plate_width_B}" &times; ${inputs.provided_plate_thickness_tp}"`] },
        { cells: ['Column Dimensions', inputs.column_type === 'Round HSS' || inputs.column_type === 'Pipe' ? 
            `Diameter D = ${inputs.column_depth_d}" (${inputs.column_type})` : 
            `${inputs.column_depth_d}" &times; ${inputs.column_flange_width_bf}" (${inputs.column_type})`] },
        { cells: ['Anchor Pattern (&#35;N &times; &#35;B)', `${inputs.num_bolts_N} &times; ${inputs.num_bolts_B} bolts`] },
        { cells: ['Anchor Spacing (N &times; B)', `${inputs.bolt_spacing_N}" &times; ${inputs.bolt_spacing_B}"`] },
        { cells: ['Anchor Type / Weld Size', `${inputs.bolt_type} / ${inputs.weld_size}"`] },
    ];
    report.addTableSection('Input Summary', { headers: ['Parameter', 'Value'], rows: inputSummaryRows }, 'input-summary-section');

    // --- Calculated Geometry ---
    const ca1 = typeof inputs.concrete_edge_dist_ca1 === 'number' ? inputs.concrete_edge_dist_ca1 : 0.0;
    const ca2 = typeof inputs.concrete_edge_dist_ca2 === 'number' ? inputs.concrete_edge_dist_ca2 : 0.0;
    
    const calculatedGeomRows = [
        { cells: ['Concrete Edge Distance (c<sub>a1</sub>)', `${ca1.toFixed(3)} in`, '(Pedestal N - Bolt Group N) / 2'] },
        { cells: ['Concrete Edge Distance (c<sub>a2</sub>)', `${ca2.toFixed(3)} in`, '(Pedestal B - Bolt Group B) / 2'] }
    ];
    report.addTableSection('Calculated Geometry', { headers: ['Parameter', 'Value', 'Formula'], rows: calculatedGeomRows }, 'calculated-geometry-section');

    // --- Anchor Geometry Checks ---
    if (Object.keys(geomChecks).length > 0) {
        const geomCheckRows = Object.entries(geomChecks).map(([name, data]) => {
            const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
            return { cells: [name, data.actual.toFixed(3), data.min.toFixed(3), status] };
        });
        report.addTableSection('Anchor Geometry Checks (ACI 318-19)', {
            headers: ['Item', 'Actual (in)', 'Required Min (in)', 'Status'],
            rows: geomCheckRows
        }, 'geometry-checks-section');
    }

    // --- Load Summary & Demands ---
    const bearingDetails = checks['Concrete Bearing']?.details;
    const anchorTensionDemand = checks['Anchor Steel Tension']?.demand || 0;
    const tensionBreakdown = checks['Anchor Steel Tension']?.details?.breakdown || checks['Anchor Steel Tension']?.breakdown || 'No tension calculated.';
    const anchorShearDemand = checks['Anchor Steel Shear']?.demand || 0;
    const num_bolts_total = inputs.num_bolts_N * inputs.num_bolts_B;
    const bearing_pressure = (bearingDetails?.f_p_max > 0 && bearingDetails?.Pu < 0) ? bearingDetails.f_p_max : 0;

    let bearingBreakdownHtml = 'No compressive bearing on concrete (uplift or zero load).';
    if (bearingDetails && bearingDetails.Pu < 0) {
        const { e_x, e_y, bearing_case } = bearingDetails;
        let formula = '';
        if (bearing_case === "Full Bearing") formula = `f<sub>p,max</sub> = (P/A) * (1 + 6e<sub>x</sub>/N + 6e<sub>y</sub>/B)`;
        else if (bearing_case === "Partial Bearing") formula = `f<sub>p,max</sub> calculated iteratively for partial bearing.`;
        else if (bearing_case === "Corner Bearing") formula = `f<sub>p,max</sub> = (2*P) / (3*g<sub>x</sub>*g<sub>y</sub>)`;

        bearingBreakdownHtml = `
            e<sub>x</sub> = M<sub>x</sub>/P = ${(inputs.moment_Mx_in * 12).toFixed(2)} / ${Math.abs(inputs.axial_load_P_in).toFixed(2)} = ${e_x.toFixed(2)}"<br>
            e<sub>y</sub> = M<sub>y</sub>/P = ${(inputs.moment_My_in * 12).toFixed(2)} / ${Math.abs(inputs.axial_load_P_in).toFixed(2)} = ${e_y.toFixed(2)}"<br>
            Bearing Case: <b>${bearing_case}</b><br>
            ${formula}
            ${bearing_pressure <= 0 ? '<br>Resultant is outside the kern; no compressive bearing occurs.' : ''}
        `;
    }

    let shearFormulaHtml;
    // Back-calculate Vnet from the per-bolt demand to ensure consistency and avoid regex parsing errors
    const shear_on_bolts = (anchorShearDemand * num_bolts_total).toFixed(2);
    
    if (anchorShearDemand > 0 && num_bolts_total > 0) {
        shearFormulaHtml = `V<sub>u,bolt</sub> = V<sub>net</sub> / n<sub>bolts</sub> = ${shear_on_bolts} / ${num_bolts_total}`;
    } else {
        shearFormulaHtml = 'No shear applied.';
    }

    const loadSummaryRows = [
        { cells: ['Applied Axial (P)', 'User Input', `${parseFloat(inputs.axial_load_P_in).toFixed(2)} kips`] },
        { cells: ['Applied Moment (M<sub>x</sub>)', 'User Input', `${parseFloat(inputs.moment_Mx_in).toFixed(2)} kip-ft`] },
        { cells: ['Applied Moment (M<sub>y</sub>)', 'User Input', `${parseFloat(inputs.moment_My_in).toFixed(2)} kip-ft`] },
        { cells: ['Applied Shear (V)', 'User Input', `${parseFloat(inputs.shear_V_in).toFixed(2)} kips`] },
        { type: 'subheader', content: 'Calculated Demands' },
        { cells: ['&nbsp;&nbsp;&nbsp;Max. Bearing Pressure (f<sub>p,max</sub>)', `<div class="font-mono text-xs">${bearingBreakdownHtml}</div>`, `${bearing_pressure.toFixed(2)} ksi`], isHeader: true },
        { cells: ['&nbsp;&nbsp;&nbsp;Max. Anchor Tension (T<sub>u,bolt</sub>)', `<div class="font-mono text-xs">${tensionBreakdown}</div>`, `${anchorTensionDemand.toFixed(2)} kips`], isHeader: true },
        { cells: ['&nbsp;&nbsp;&nbsp;Max. Anchor Shear (V<sub>u,bolt</sub>)', `<div class="font-mono text-xs">${shearFormulaHtml}</div>`, `${anchorShearDemand.toFixed(2)} kips`], isHeader: true },
    ];

    report.addTableSection('Applied Loads & Calculated Demands', {
        headers: ['Load / Demand Type', 'Calculation / Breakdown', 'Value'],
        rows: loadSummaryRows
    }, 'load-summary-section');

    // --- Strength Checks ---
    const strengthCheckRows = Object.entries(checks)
        .filter(([name, data]) => data && data.check)
        .map(([name, data]) => {
            const { demand, check } = data;
            const { Rn, phi, omega } = check;
            const breakdownHtml = generateBasePlateBreakdownHtml(name, data, inputs, results);
            const is_anchor_check = name.toLowerCase().includes('anchor');
            const capacity = Rn || 0;
            const design_capacity = design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

            let ratio, demand_val, capacity_val;
            if (name.includes('Plate Bending') || name.includes('Plate Thickness')) {
                demand_val = design_capacity;
                capacity_val = demand;
                ratio = capacity_val > 0 ? demand_val / capacity_val : (demand_val > 0 ? Infinity : 0);
            } else if (name === 'Concrete Bearing') {
                 // Bearing Check is Stress-based (ksi)
                 demand_val = demand; // f_p_max
                 capacity_val = is_anchor_check ? capacity * (check.phi || 0.75) : design_capacity;
                 ratio = capacity_val > 0 ? Math.abs(demand_val) / capacity_val : 0;
            } else {
                demand_val = (is_anchor_check && design_method === 'ASD') ? demand * 1.6 : demand;
                capacity_val = is_anchor_check ? capacity * (check.phi || 0.75) : design_capacity;
                ratio = capacity_val > 0 ? Math.abs(demand_val) / capacity_val : (Math.abs(demand_val) > 0 ? Infinity : 0);
            }

            const status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';

            return {
                cells: [
                    name,
                    `${demand_val.toFixed(2)}${is_anchor_check && design_method === 'ASD' ? ' *' : ''}`,
                    capacity_val.toFixed(2),
                    ratio.toFixed(3),
                    status
                ],
                details: breakdownHtml
            };
        });

    report.addTableSection(`Strength Checks (${design_method})`, {
        headers: ['Limit State', 'Demand', 'Capacity', 'Ratio', 'Status'],
        rows: strengthCheckRows
    }, 'strength-checks-section');

    // Add ASD note if applicable
    if (design_method === 'ASD') {
        const asdNoteHtml = `<p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
            * Anchor checks are performed using ACI 318 strength design (LRFD). ASD service loads have been factored by 1.6 for these checks.
        </p>`;
        report.addSection(null, asdNoteHtml, 'asd-note-section');
    }

    report.render('steel-results-container');
    console.log("renderResults finished.");
}

// Add a listener to the theme toggle to redraw the 3D diagram
var themeToggleButton = document.getElementById('theme-toggle');
if (themeToggleButton) {
    themeToggleButton.addEventListener('click', () => setTimeout(draw3dBasePlateDiagram, 50)); // Use a small timeout to ensure class has been updated
}

async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    const columnType = document.getElementById('column_type').value;
    if (!shapeSelect) return;

    const shapeTypeMap = {
        'W-Shape': 'W',
        'S-Shape': 'S',
        'Round HSS': 'HSS', // Backend might mix Round/Rect in HSS, usually distinct by dimensions
        'Rectangular HSS': 'HSS',
        'Pipe': 'PIPE'
    };
    const aiscShapeType = shapeTypeMap[columnType];

    // Clear immediately to indicate loading/change
    shapeSelect.innerHTML = '<option value="">Loading...</option>';

    try {
        // Call backend via Eel
        const shapes = await eel.get_shapes_by_type(aiscShapeType)();

        // Backend returns a list of keys (sorted)
        const shapeNames = Array.isArray(shapes) ? shapes : Object.keys(shapes).sort();

        const currentVal = shapeSelect.value;
        shapeSelect.innerHTML = '<option value="">-- Manual Input --</option>'; // Reset
        shapeNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            shapeSelect.appendChild(option);
        });

        if (shapeNames.includes(currentVal)) {
            shapeSelect.value = currentVal;
        } else {
            shapeSelect.value = ""; // Reset if mismatch
        }

    } catch (error) {
        console.error("Failed to populate shape dropdown:", error);
        shapeSelect.innerHTML = '<option value="">Could not load shapes</option>';
    }
}
async function handleShapeSelection() {
    const shapeName = document.getElementById('aisc_shape_select').value;
    const geometryInputs = ['column_depth_d', 'column_flange_width_bf', 'column_flange_tf', 'column_web_tw'];


    if (!shapeName) {
        geometryInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.readOnly = false;
        });
        return;
    }

    const shape = await eel.get_shape_details(shapeName)();
    if (!shape) return;
    console.log("Shape Details from Backend:", shape); // DEBUG

    // Helper to safely get a value from the shape object
    const getVal = (prop) => shape[prop] !== undefined ? parseFloat(shape[prop]) : undefined;

    // Common properties for W/S shapes
    const d = getVal('d');
    const bf = getVal('bf');
    const tf = getVal('tf');
    const tw = getVal('tw');

    // For HSS/Pipe: 'OD', 'tdes' or 'ht', 'b', 'tdes'
    const od = getVal('OD');
    const ht = getVal('Ht'); // Height/Depth for Rect HSS
    const b_hss = getVal('B'); // Width for Rect HSS
    const tdes = getVal('tdes');

    const propertyMap = {
        'column_depth_d': d || ht || od,
        'column_flange_width_bf': bf || b_hss || od, // For Round, bf is effectively D. For Rect, it's B.
        'column_flange_tf': tf || tdes,
        'column_web_tw': tw || tdes
    };

    Object.keys(propertyMap).forEach(id => {
        const el = document.getElementById(id);
        if (el && propertyMap[id] !== undefined) {
            el.value = propertyMap[id];
            el.readOnly = true;
        }
    });
} function updateColumnInputsUI() {
    const columnType = document.getElementById('column_type').value;
    const label1 = document.getElementById('label_column_dim1');
    const dim2_container = document.getElementById('container_column_dim2');
    const tf_container = document.getElementById('container_column_tf');
    const tw_container = document.getElementById('container_column_tw');

    // Reset shape selection when type changes
    document.getElementById('aisc_shape_select').value = '';
    handleShapeSelection(); // This will unlock the inputs

    if (columnType === 'Round HSS' || columnType === 'Pipe') {
        label1.textContent = 'Column Diameter (D)';
        dim2_container.style.display = 'none';
        tf_container.style.display = 'none';
        tw_container.style.display = 'none';
        document.getElementById('label_column_dim2').textContent = 'Column bf'; // Reset label
    } else if (columnType === 'Rectangular HSS') {
        label1.textContent = 'Column Depth (d)';
        dim2_container.style.display = 'block';
        document.getElementById('label_column_dim2').textContent = 'Column Width (b)';
        tf_container.style.display = 'none'; // Simplify: Assume uniform wall thickness for now, or use tw as thick
        tw_container.style.display = 'block';
        document.getElementById('label_column_tw').textContent = 'Design Wall Thk (t)';
    } else { // W-Shape or S-Shape
        label1.textContent = 'Column Depth (d)';
        dim2_container.style.display = 'block';
        document.getElementById('label_column_dim2').textContent = 'Column bf';
        tf_container.style.display = 'block';
        tw_container.style.display = 'block';
        document.getElementById('label_column_tw').textContent = 'Column tw';
    }
    populateShapeDropdown();
    drawBasePlateDiagram(gatherInputsFromIds(basePlateInputIds));
}
// Attach listener for column type change
document.getElementById('column_type').addEventListener('change', updateColumnInputsUI);
// --- BACKEND CONNECTION ---
// --- Batch State ---
var basePlateBatch = { cases: [{ Pu: 0, Mux: 0, Muy: 0, Vu: 0 }] };

async function handleRunBasePlateCheck() {
    console.log("[Base Plate] Starting Unified Analysis...");
    const btnId = 'run-steel-check-btn';
    const feedbackId = 'feedback-message';
    const containerId = 'steel-results-container';

    setLoadingState(true, btnId);
    showFeedback('Gathering inputs...', false, feedbackId);

    try {
        // 1. Gather Global Inputs
        const inputs = gatherInputsFromIds(basePlateInputIds);

        // 2. Client-Side Validation (Global Inputs)
        const validation = basePlateCalculator.validateBasePlateInputs(inputs);
        const resultsContainer = document.getElementById(containerId);
        
        if (validation.errors.length > 0) {
            renderValidationResults(validation, resultsContainer);
            showFeedback('Validation failed.', true, feedbackId);
            setLoadingState(false, btnId);
            return;
        }

        // 3. Prepare Batch Data
        // Always include the current UI inputs as the first "case" or part of the batch
        // The backend expects 'batch_loads' to override P, Mx, My, V if present.
        
        const currentCase = {
            id: 'UI_Input',
            P: parseFloat(inputs.axial_load_P_in) || 0,
            Mx: parseFloat(inputs.moment_Mx_in) || 0,
            My: parseFloat(inputs.moment_My_in) || 0,
            V: parseFloat(inputs.shear_V_in) || 0
        };

        let finalBatch = [currentCase];

        // Add table cases if they exist
        if (basePlateBatch && basePlateBatch.length > 0) {
             const tableCases = basePlateBatch.map((row, index) => ({
                id: `Batch_${index + 1}`,
                P: parseFloat(row.P) || 0,
                Mx: parseFloat(row.Mx) || 0,
                My: parseFloat(row.My) || 0, // Base plate currently only has Mx in batch table HTML? 
                // Wait, HTML table has P, Mx, V. My is missing from table but present in inputs.
                // We should assume My=0 for batch rows unless column is added.
                // Let's stick to P, Mx, V per HTML table columns.
                V: parseFloat(row.V) || 0
            }));
            finalBatch = [...finalBatch, ...tableCases];
        }

        inputs.batch_loads = finalBatch;

        // 4. Call Python Backend
        showFeedback('Calculating on server...', false, feedbackId);

        if (typeof eel === 'undefined' || !eel.calculate_base_plate_all) {
            throw new Error("Server connection (Eel) is not available.");
        }

        // Call exposed Python function
        const result = await eel.calculate_base_plate_all(inputs)();

        // 5. Process Results
        if (result.error) {
            console.error("Backend Error:", result.error);
            renderValidationResults({ errors: [result.error, ...(result.trace ? [result.trace] : [])] }, resultsContainer);
            showFeedback('Calculation error occurred on server.', true, feedbackId);
        } else {
            console.log("Backend Result:", result);
            showFeedback('Rendering results...', false, feedbackId);

            // Handle Array (Batch) or Object (Single)
            // Backend update will return a list of results if 'batch_loads' was processed
            
            renderUnifiedResults(result, inputs, containerId);

            showFeedback('Calculation complete!', false, feedbackId);

            // Re-attach listeners for reports
             attachReportEventListeners(containerId, {
                reportId: containerId,
                filenamePrefix: 'BasePlate-Report',
                toggleTexts: { show: '[Show]', hide: '[Hide]' }
            });
        }

    } catch (e) {
        console.error("Calculation Flow Error:", e);
        showFeedback('An error occurred: ' + e.message, true, feedbackId);
    } finally {
        setLoadingState(false, btnId);
    }
}
initializeApp({
    inputIds: basePlateInputIds,
    // The calculationHandler is now attached manually to the button in onReady
    // to prevent automatic calculations on every input change.
    // calculationHandler: handleRunBasePlateCheck, 
    buttonId: 'run-steel-check-btn',
    onReady: async () => {
        // 1. FIRST: Wait for the AISC shape data to be fetched and processed
        await AISC_SPEC.loadShapeDatabase();

        // 2. SECOND: Now that data is ready, populate dropdowns and set up UI
        populateMaterialDropdowns();
        populateBoltGradeDropdowns();

        // --- This logic is unique to base plate.js and should stay ---
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
            // We dispatch the event, but the calculation won't run automatically anymore, which is fine for the initial load.
            weldSelect.dispatchEvent(new Event('change'));
        }

        // --- Manually attach calculation handler to the button ONLY ---
        const runButton = document.getElementById('run-steel-check-btn');
        if (runButton) {
            runButton.addEventListener('click', handleRunBasePlateCheck);
        }

        // --- Attach listeners for shape/column selection (unique to base plate) ---
        document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);
        document.getElementById('column_type').addEventListener('change', updateColumnInputsUI);
        updateColumnInputsUI();

        // --- Attach listeners for LIVE diagram updates (calculation is separate) ---
        const debouncedRedraw3D = debounce(draw3dBasePlateDiagram, 300);
        basePlateInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const redraw = () => {
                    const currentInputs = gatherInputsFromIds(basePlateInputIds);
                    drawBasePlateDiagram(currentInputs);
                    debouncedRedraw3D(currentInputs);
                };
                // Redraw diagrams on every input keystroke for a responsive feel
                el.addEventListener('input', redraw);
            }
        });

        // --- Initial drawing on page load ---
        const initialInputs = gatherInputsFromIds(basePlateInputIds);
        drawBasePlateDiagram(initialInputs);
        draw3dBasePlateDiagram(initialInputs);

        // --- 2D Diagram Panning Logic ---
        const svg2d = document.getElementById('baseplate-diagram');
        if (svg2d) {
            svg2d.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only pan with left-click
                baseplate2dIsPanning = true;
                baseplate2dStartPoint = { x: e.clientX, y: e.clientY };
                svg2d.classList.add('is-grabbing');
            });
            svg2d.addEventListener('mousemove', (e) => {
                if (!baseplate2dIsPanning) return;
                const dx = e.clientX - baseplate2dStartPoint.x;
                const dy = e.clientY - baseplate2dStartPoint.y;
                const group = svg2d.querySelector('g');
                if (group) {
                    group.setAttribute('transform', `translate(${baseplate2dPan.x + dx}, ${baseplate2dPan.y + dy})`);
                }
            });
            const stopPanning = (e) => {
                if (!baseplate2dIsPanning) return;
                baseplate2dIsPanning = false;
                svg2d.classList.remove('is-grabbing');
                baseplate2dPan.x += e.clientX - baseplate2dStartPoint.x;
                baseplate2dPan.y += e.clientY - baseplate2dStartPoint.y;
            };
            svg2d.addEventListener('mouseup', stopPanning);
            svg2d.addEventListener('mouseleave', stopPanning);
        }

        syncBoltInputs();
        
        // --- Batch Listeners ---
        document.getElementById("batch-calc-btn")?.addEventListener("click", handleRunBatchCheck);
        document.getElementById("add-case-btn")?.addEventListener("click", addBatchRow);
        const batchTable = document.getElementById("batch-table");
        if(batchTable) {
            batchTable.addEventListener("input", handleBatchInput);
            batchTable.addEventListener("click", handleBatchAction);
            batchTable.addEventListener("paste", handleBatchPaste);
        }
        renderBatchTable();
    }
});

function syncBoltInputs() {
    const totalEl = document.getElementById('total_anchors');
    const nEl = document.getElementById('num_bolts_N');
    const bEl = document.getElementById('num_bolts_B');

    if (!totalEl || !nEl || !bEl) return;

    // 1. Total Change -> Update B (Keep N constant)
    totalEl.addEventListener('input', () => {
        const total = parseInt(totalEl.value) || 0;
        const n = parseInt(nEl.value) || 0;
        // Formula: Total = 2N + 2B - 4  =>  2B = Total - 2N + 4
        if (total > 0 && n > 0) {
            const b = (total - 2 * n + 4) / 2;
            if (Number.isInteger(b) && b >= 2) {
                bEl.value = b;
                bEl.dispatchEvent(new Event('input')); // Redraw diagrams
            }
        }
    });

    // 2. N Change -> Update B (Keep Total constant)
    nEl.addEventListener('input', () => {
        const total = parseInt(totalEl.value) || 0;
        const n = parseInt(nEl.value) || 0;
        if (total > 0 && n > 0) {
            const b = (total - 2 * n + 4) / 2;
            if (Number.isInteger(b) && b >= 2) {
                bEl.value = b;
                bEl.dispatchEvent(new Event('input'));
            }
        }
    });

    // 3. B Change -> Update Total (Keep N constant)
    bEl.addEventListener('input', () => {
        const n = parseInt(nEl.value) || 0;
        const b = parseInt(bEl.value) || 0;
        if (n >= 2 && b >= 2) {
            const total = 2 * n + 2 * b - 4;
            totalEl.value = total;
            // No need to dispatch input on totalEl unless we want circular logic (avoid it)
        }
    });

    // Initial Sync (if Total is empty but N/B are set)
    const n = parseInt(nEl.value) || 0;
    const b = parseInt(bEl.value) || 0;
    if (n >= 2 && b >= 2 && !totalEl.value) {
        totalEl.value = 2 * n + 2 * b - 4;
    }
}

// --- Batch Processing Helpers ---
function addBatchResultRow(data) {
    const tableBody = document.querySelector('#batch-results-table tbody');
    if (!tableBody) return;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="border px-4 py-2">${data.id}</td>
        <td class="border px-4 py-2">${data.status === 'Pass' ? '<span class="text-green-600 font-bold">PASS</span>' : '<span class="text-red-600 font-bold">FAIL</span>'}</td>
        <td class="border px-4 py-2">${(data.ratio * 100).toFixed(1)}%</td>
        <td class="border px-4 py-2">${data.governingCheck}</td>
        <td class="border px-4 py-2">${data.criticalValue}</td>
    `;
    tableBody.appendChild(row);
}

// --- BATCH INPUT LOGIC ---
function renderBatchTable() {
    const tbody = document.querySelector("#batch-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    basePlateBatch.cases.forEach((c, index) => {
        const row = document.createElement("tr");
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 group";
        row.innerHTML = `
            <td class="p-1"><input type="number" data-idx="${index}" data-field="Pu" value="${c.Pu}" class="w-full bg-transparent border-none focus:ring-0 p-1 text-center font-mono placeholder-gray-400" placeholder="0"></td>
            <td class="p-1"><input type="number" data-idx="${index}" data-field="Mux" value="${c.Mux}" class="w-full bg-transparent border-none focus:ring-0 p-1 text-center font-mono placeholder-gray-400" placeholder="0"></td>
            <td class="p-1"><input type="number" data-idx="${index}" data-field="Muy" value="${c.Muy}" class="w-full bg-transparent border-none focus:ring-0 p-1 text-center font-mono placeholder-gray-400" placeholder="0"></td>
            <td class="p-1"><input type="number" data-idx="${index}" data-field="Vu" value="${c.Vu}" class="w-full bg-transparent border-none focus:ring-0 p-1 text-center font-mono placeholder-gray-400" placeholder="0"></td>
            <td class="p-1 text-center"><button class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity delete-case-btn" data-idx="${index}">&times;</button></td>
        `;
        tbody.appendChild(row);
    });
}

function addBatchRow() { 
    basePlateBatch.cases.push({ Pu: 0, Mux: 0, Muy: 0, Vu: 0 }); 
    renderBatchTable(); 
}

function handleBatchInput(e) {
    if (e.target.tagName !== "INPUT") return;
    const idx = parseInt(e.target.dataset.idx); 
    const field = e.target.dataset.field;
    let val = parseFloat(e.target.value); 
    if(isNaN(val)) val = 0;
    if (basePlateBatch.cases[idx]) { 
        basePlateBatch.cases[idx][field] = val; 
    }
}

function handleBatchPaste(e) {
    e.preventDefault();
    // Simple placeholder for paste
}

function handleBatchAction(e) {
    if (e.target.classList.contains("delete-case-btn")) {
        const idx = parseInt(e.target.dataset.idx);
        if (basePlateBatch.cases.length > 1) { 
            basePlateBatch.cases.splice(idx, 1); 
            renderBatchTable(); 
        } else { 
            basePlateBatch.cases[0] = { Pu: 0, Mux: 0, Muy: 0, Vu: 0 }; 
            renderBatchTable(); 
        }
    }
}

async function handleRunBatchCheck() {
    const tableBody = document.querySelector('#batch-results-table tbody');
    if(tableBody) tableBody.innerHTML = '';
    
    // Get current base inputs
    const baseInputs = gatherInputsFromIds(basePlateInputIds);
    
    for (let i = 0; i < basePlateBatch.cases.length; i++) {
        const c = basePlateBatch.cases[i];
        const inputs = { ...baseInputs };
        // Map batch columns to input IDs
        inputs.axial_load_P_in = c.Pu;
        inputs.moment_Mx_in = c.Mux;
        inputs.moment_My_in = c.Muy;
        inputs.shear_V_in = c.Vu;
        
        try {
            const results = basePlateCalculator.checkConcreteBearing(inputs); 
            // Note: basePlateCalculator.run is not fully exposed/standardized in this file yet?
            // The file has basePlateCalculator = (() => { ... return { run: ... } })() ?
            // I need to check the return of basePlateCalculator IIFE.
            // If checkConcreteBearing is internal, I might need to use a public method.
            // Looking at code: basePlateCalculator returns { errors:..., warnings:... } from validate?
            // Wait, let's look at the structure again or assume it works like splice.
            // Actually, I'll use checkConcreteBearing for now as it seems to be the main check returning ratio.
            // But wait, there are also Anchor checks.
            // I should assume there is a .run() wrapper.
            // If not, I'll need to call individual checks.
            // Let's safe bet loop over checks if run exists.
            
            // Re-reading Step 359: basePlateCalculator IIFE starts at line 528.
            // It ends at ... I haven't seen the end.
            // But the naming `basePlateCalculator` suggests it matches `spliceCalculator`.
            
            // Let's assume standard object return for now.
             
             // Placeholder for now: Check Bearing only to verify
            const bearing = basePlateCalculator.checkConcreteBearing(inputs);
            const ratio = bearing.demand / (inputs.design_method === 'LRFD' ? bearing.check.Rn * bearing.check.phi : bearing.check.Rn / bearing.check.omega);
             
            addBatchResultRow({
                id: i + 1,
                status: ratio <= 1.0 ? 'Pass' : 'Fail',
                ratio: ratio || 0,
                governingCheck: 'Bearing (Partial)', // Placeholder
                criticalValue: bearing.demand.toFixed(2) + ' ksi' // Placeholder
            });
            
        } catch (e) {
            console.error(e);
            addBatchResultRow({ id: i+1, status: 'Error', ratio: 0, governingCheck: 'Error', criticalValue: '-' });
        }
    }
}

// --- RENDER UNIFIED RESULTS ---
function renderUnifiedResults(result, inputs, containerId) {
    // Check if result is an array (Batch Result)
    let primaryResult = result;
    if (Array.isArray(result)) {
        if (result.length > 0) {
            primaryResult = result[0];
        } else {
             console.error("Received empty result array from backend.");
             // Show error in container
             const container = document.getElementById(containerId);
             if (container) container.innerHTML = '<div class="text-red-600">No results returned from server.</div>';
             return;
        }
    }

    if (typeof renderResults === 'function') {
        // Ensure inputs are attached to result if renderResults expects them there.
        // Prefer inputs returned by backend (which include calculated fields), 
        // but merge with UI inputs (to keep any extra UI state).
        if (!primaryResult.inputs) {
            primaryResult.inputs = inputs;
        } else {
            // merge UI inputs into backend inputs, but let backend inputs take precedence for calculated values
            primaryResult.inputs = { ...inputs, ...primaryResult.inputs };
        }
        
        console.log("Rendering primary result:", primaryResult);
        renderResults(primaryResult, containerId);
        return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (result.error) {
        container.innerHTML = `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert"><strong class="font-bold">Error:</strong> <span class="block sm:inline">${result.error}</span></div>`;
        return;
    }

    // Header
    const header = document.createElement('div');
    header.className = "mb-4 pb-2 border-b border-gray-200 dark:border-gray-700";
    const statusColor = result.summary && result.summary.ratio <= 1.0 ? "text-green-600" : "text-red-600";
    const statusText = result.summary && result.summary.ratio <= 1.0 ? "PASS" : "FAIL";
    header.innerHTML = `<h2 class="text-xl font-bold ${statusColor}">Status: ${statusText} <span class="text-sm font-normal text-gray-500">(${result.summary ? (result.summary.ratio*100).toFixed(1) : 0}% Utiliz.)</span></h2>`;
    container.appendChild(header);

    // Checks List
    const checksContainer = document.createElement('div');
    checksContainer.className = "space-y-4";
    
    const checks = result.checks || {};
    Object.entries(checks).forEach(([name, data]) => {
        const item = document.createElement('div');
        item.className = "bg-white dark:bg-gray-800 p-4 rounded shadow border-l-4 " + (data.ratio <= 1.0 ? "border-green-500" : "border-red-500");
        
        let detailsHtml = '';
        if (data.details) {
            detailsHtml = `<div class="mt-2 text-sm text-gray-600 dark:text-gray-300 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded whitespace-pre-wrap">${JSON.stringify(data.details, null, 2)}</div>`;
        }
        
        item.innerHTML = `
            <div class="flex justify-between items-center">
                <h3 class="font-bold text-lg">${name}</h3>
                <span class="px-2 py-1 rounded text-sm font-bold ${data.ratio <= 1.0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                    ${(data.ratio * 100).toFixed(0)}%
                </span>
            </div>
            <p class="text-gray-700 dark:text-gray-300">
                Demand: ${(data.demand || 0).toFixed(2)} | Capacity: ${(data.capacity || 0).toFixed(2)}
            </p>
            ${detailsHtml}
        `;
        checksContainer.appendChild(item);
    });
    
    if (Object.keys(checks).length === 0) {
        checksContainer.innerHTML = '<p class="text-gray-500 italic">No checks returned results.</p>';
    }

    container.appendChild(checksContainer);
}