// splice.js
console.log('splice.js loaded');
// --- Global variables for the 3D scene ---
let bjsEngine, bjsScene, bjsGuiTexture;
let dimensionElements = { meshes: [], labels: [] };
let isFirstDraw = true; // Flag to control camera auto-fitting
let areDimensionsVisible = true; // Flag to track dimension visibility state

// --- Define all Input IDs that affect the diagram's geometry ---
const diagramInputIds = [
    'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'num_flange_plates',
    'H_fp', 't_fp', 'L_fp', 'H_fp_inner', 't_fp_inner', 'L_fp_inner', 'D_fp', 'Nc_fp',
    'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp', 'g_gage_fp',
    'num_web_plates', 'H_wp', 't_wp', 'L_wp', 'D_wp', 'Nc_wp', 'Nr_wp',
    'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp'
];

// --- Master Bolt Cache ---
let masterBolts = {};

/**
 * Creates or clones a detailed bolt mesh. A master mesh is created for each unique bolt size (diameter/thickness)
 * and subsequent requests for the same size will return a lightweight clone for performance.
 * @param {string} name - The base name for the bolt mesh.
 * @param {object} options - Bolt dimensions and position.
 * @param {number} options.diameter - The diameter of the bolt shank.
 * @param {number} options.thickness - The total thickness of the material being clamped.
 * @param {BABYLON.Vector3} options.position - The geometric center of the material being clamped.
 * @param {BABYLON.Scene} scene - The Babylon.js scene.
 * @returns {BABYLON.Mesh} The merged bolt mesh.
 */
function createBoltMesh(name, options, scene) {
    // FIX: Ensure diameter and thickness are numbers before use.
    const diameter = parseFloat(options.diameter);
    const thickness = parseFloat(options.thickness);
    const { position } = options;
    if (!diameter || !thickness || isNaN(diameter) || isNaN(thickness)) return null; // This check is now more robust

    const masterBoltKey = `d${diameter.toFixed(3)}-t${thickness.toFixed(3)}`;
    let masterBolt = masterBolts[masterBoltKey];

    if (!masterBolt) {
        // --- Create the master bolt if it doesn't exist ---
        const headDiameter = diameter * 1.8;
        const headHeight = diameter * 0.65;
        const washerDiameter = diameter * 2.2;
        const washerHeight = diameter * 0.15;
        const shankLength = thickness + 2 * washerHeight + headHeight;

        // Create parts at the origin
        const shank = BABYLON.MeshBuilder.CreateCylinder("master_shank", { diameter, height: shankLength }, scene);
        const washer1 = BABYLON.MeshBuilder.CreateCylinder("master_washer1", { diameter: washerDiameter, height: washerHeight }, scene);
        washer1.position.y = thickness / 2 + washerHeight / 2;
        const head = BABYLON.MeshBuilder.CreateCylinder("master_head", { diameter: headDiameter, height: headHeight, tessellation: 6 }, scene);
        head.position.y = thickness / 2 + washerHeight + headHeight / 2;
        head.rotation.y = Math.PI / 6;
        const washer2 = BABYLON.MeshBuilder.CreateCylinder("master_washer2", { diameter: washerDiameter, height: washerHeight }, scene);
        washer2.position.y = -thickness / 2 - washerHeight / 2;
        const nut = BABYLON.MeshBuilder.CreateCylinder("master_nut", { diameter: headDiameter, height: headHeight, tessellation: 6 }, scene);
        nut.position.y = -thickness / 2 - washerHeight - headHeight / 2;
        nut.rotation.y = Math.PI / 6;

        masterBolt = BABYLON.Mesh.MergeMeshes([shank, head, nut, washer1, washer2], true, false, null, false, true);
        if (masterBolt) {
            masterBolt.name = masterBoltKey;
            masterBolt.isVisible = false; // Hide the master mesh
            masterBolts[masterBoltKey] = masterBolt; // Cache it
        } else {
            return null; // Failed to create master bolt
        }
    }

    // --- Clone the master bolt to create the new instance ---
    const boltInstance = masterBolt.clone(name, null, true);
    if (boltInstance) {
        boltInstance.position = position; // Move the instance to its final position
        boltInstance.isVisible = true; // Make the clone visible
    }

    return boltInstance;
}


/**
 * Draws an interactive 3D visualization of the splice connection using Babylon.js.
 */
function draw3dSpliceDiagram() {
    const canvas = document.getElementById("splice-3d-canvas");
    if (!canvas || typeof BABYLON === 'undefined') return;

    // --- 1. Gather All Relevant Inputs ---
    const inputs = gatherInputsFromIds(diagramInputIds);
    const isDarkMode = document.documentElement.classList.contains('dark');

    // --- 2. Initialize Scene (if needed) ---
    if (!bjsEngine) {
        bjsEngine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        bjsScene = new BABYLON.Scene(bjsEngine);
        bjsGuiTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, bjsScene);
        
        const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2.5, Math.PI / 2.8, 60, BABYLON.Vector3.Zero(), bjsScene);
        camera.attachControl(canvas, true);
        camera.lowerRadiusLimit = 20;
        camera.upperRadiusLimit = 400;
        camera.wheelPrecision = 10;

        // Prevent page scroll when zooming canvas
        canvas.addEventListener("wheel", (event) => {
            event.preventDefault();
        }, { passive: false });

		const pipeline = new BABYLON.DefaultRenderingPipeline("default", true, bjsScene, [camera]);
		pipeline.samples = 1;
		pipeline.ssaoEnabled = true;
		pipeline.ssaoRatio = 0.1;

        bjsEngine.runRenderLoop(() => {
            if (bjsScene && bjsScene.isReady()) {
                bjsScene.render();
            }
        });
        window.addEventListener('resize', () => bjsEngine.resize());
    }

    // --- Robustly Clear Previous Scene Elements ---
    // FIX: Only dispose of meshes, not materials, lights, or the environment texture.
    // Iterate backwards to safely dispose of meshes while modifying the array.
    for (let i = bjsScene.meshes.length - 1; i >= 0; i--) {
        bjsScene.meshes[i].dispose();
    }
    if (bjsGuiTexture) {
        bjsGuiTexture.getChildren().forEach(control => control.dispose());
    }
    // Clear the dimension elements tracker
    dimensionElements.meshes = [];
    dimensionElements.labels = [];
    masterBolts = {}; // Clear the master bolt cache on each redraw
    
    // --- 3. Lighting & Materials (Create only if they don't exist) ---
    if (bjsScene.lights.length === 0) {
        const light = new BABYLON.DirectionalLight("dir01", new BABYLON.Vector3(-0.5, -1, -0.5), bjsScene);
        light.position = new BABYLON.Vector3(20, 40, 20);
        new BABYLON.ShadowGenerator(1024, light);
    }


    // --- 3. Lighting & Materials ---
    bjsScene.clearColor = isDarkMode ? new BABYLON.Color4(0.1, 0.12, 0.15, 1) : new BABYLON.Color4(0.95, 0.95, 0.95, 1);
    bjsScene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/studio.env", bjsScene);
    bjsScene.environmentIntensity = 1.2;

    const shadowGenerator = bjsScene.lights[0].getShadowGenerator();

    // Use existing materials or create them if they don't exist
    const memberMaterial = bjsScene.getMaterialByName("memberMat") || new BABYLON.PBRMaterial("memberMat", bjsScene);
    memberMaterial.albedoColor = new BABYLON.Color3.FromHexString("#003cff");
    memberMaterial.metallic = 0.6;
    memberMaterial.roughness = 0.45;
    
    const plateMaterial = new BABYLON.PBRMaterial("plateMat", bjsScene);
    plateMaterial.albedoColor = new BABYLON.Color3.FromHexString("#ff8800");
    plateMaterial.metallic = 0.6;
    plateMaterial.roughness = 0.4;

    const boltMaterial = bjsScene.getMaterialByName("boltMat") || new BABYLON.PBRMaterial("boltMat", bjsScene);
    boltMaterial.albedoColor = new BABYLON.Color3.FromHexString("#B0BEC5");
    boltMaterial.metallic = 0.6;
    boltMaterial.roughness = 0.35;
    

    // --- 4. Helper functions for Dimensions ---
    const createLabel = (text, anchorMesh) => {
        const label = new BABYLON.GUI.Rectangle();
        label.height = "18px";
        label.width = `${text.length * 7}px`;
        label.cornerRadius = 5;
        label.thickness = 1;
        label.background = isDarkMode ? "rgba(40, 40, 40, 0.7)" : "rgba(255, 255, 255, 0.7)";
        label.color = isDarkMode ? "#FFFFFF" : "#000000";
        bjsGuiTexture.addControl(label);
        dimensionElements.labels.push(label); // Track label
        const textBlock = new BABYLON.GUI.TextBlock();
        textBlock.text = text;
        textBlock.fontSize = 10;
        label.isVisible = areDimensionsVisible; // Set visibility based on global state
        label.addControl(textBlock);
        label.linkWithMesh(anchorMesh);
        return label;
    };

    const createDimensionLine = (name, value, start, end, offset) => {
        if (!value || value <= 0) return;
        // --- FIX: Use a single, consistent material for all dimension lines ---
        let lineMat = bjsScene.getMaterialByName("dimLineMat");
        if (!lineMat) {
            lineMat = new BABYLON.StandardMaterial("dimLineMat", bjsScene);
        }
        lineMat.emissiveColor = isDarkMode ? new BABYLON.Color3.White() : new BABYLON.Color3.Black();
        lineMat.disableLighting = true;

        const mainLinePoints = [start.add(offset), end.add(offset)];
        const mainLine = BABYLON.MeshBuilder.CreateLines(`${name}_main`, { points: mainLinePoints }, bjsScene);
        mainLine.material = lineMat;
        mainLine.isVisible = areDimensionsVisible; // Set visibility based on global state
        dimensionElements.meshes.push(mainLine);

        const extLine1Points = [start, start.add(offset.scale(1.1))];
        const extLine1 = BABYLON.MeshBuilder.CreateLines(`${name}_ext1`, { points: extLine1Points }, bjsScene);
        extLine1.material = lineMat;
        extLine1.isVisible = areDimensionsVisible; // Set visibility based on global state
        dimensionElements.meshes.push(extLine1);

        const extLine2Points = [end, end.add(offset.scale(1.1))];
        const extLine2 = BABYLON.MeshBuilder.CreateLines(`${name}_ext2`, { points: extLine2Points }, bjsScene);
        extLine2.material = lineMat;
        extLine2.isVisible = areDimensionsVisible; // Set visibility based on global state
        dimensionElements.meshes.push(extLine2);

        const labelAnchor = new BABYLON.AbstractMesh(`${name}_label_anchor`, bjsScene);
        labelAnchor.position = BABYLON.Vector3.Center(start, end).add(offset.scale(1.2));
        createLabel(`${name}=${value}"`, labelAnchor);
    };


    // --- 5. Geometry Creation ---
    const createBeamMember = (name, length) => {
        const { member_d: d, member_bf: bf, member_tf: tf, member_tw: tw } = inputs;
        if (!d || !bf || !tf || !tw) return null;
        const topFlange = BABYLON.MeshBuilder.CreateBox(`${name}_tf`, { width: bf, height: tf, depth: length }, bjsScene);
        topFlange.position.y = (d - tf) / 2;
        const botFlange = BABYLON.MeshBuilder.CreateBox(`${name}_bf`, { width: bf, height: tf, depth: length }, bjsScene);
        botFlange.position.y = -(d - tf) / 2;
        const web = BABYLON.MeshBuilder.CreateBox(`${name}_web`, { width: tw, height: d - 2 * tf, depth: length }, bjsScene);
        const member = BABYLON.Mesh.MergeMeshes([topFlange, botFlange, web], true, true, undefined, false, true);
        if (member) {
            member.material = memberMaterial;
            shadowGenerator.addShadowCaster(member);
            member.receiveShadows = true;
        }
        return member;
    };

    const beamLength = Math.max(inputs.L_fp, inputs.L_wp, 24) || 24;
    const beam1 = createBeamMember("beam1", beamLength);
    if (beam1) beam1.position.z = -(inputs.gap / 2 + beamLength / 2);

    const beam2 = createBeamMember("beam2", beamLength);
    if (beam2) beam2.position.z = (inputs.gap / 2 + beamLength / 2);

    // Flange Plates
    if (inputs.num_flange_plates > 0 && inputs.L_fp > 0 && inputs.H_fp > 0 && inputs.t_fp > 0) {
        const outerFlangePlateTop = BABYLON.MeshBuilder.CreateBox("outer_fp_top", { width: inputs.H_fp, height: inputs.t_fp, depth: inputs.L_fp }, bjsScene);
        outerFlangePlateTop.material = plateMaterial;
        outerFlangePlateTop.position.y = inputs.member_d / 2 + inputs.t_fp / 2;
        shadowGenerator.addShadowCaster(outerFlangePlateTop);
        outerFlangePlateTop.receiveShadows = true;

        const outerFlangePlateBot = outerFlangePlateTop.clone("outer_fp_bot");
        outerFlangePlateBot.position.y = -(inputs.member_d / 2 + inputs.t_fp / 2);
    }

    if (inputs.num_flange_plates == 2 && inputs.L_fp_inner > 0 && inputs.H_fp_inner > 0 && inputs.t_fp_inner > 0) {
        const innerFlangePlateTop = BABYLON.MeshBuilder.CreateBox("inner_fp_top", { width: inputs.H_fp_inner, height: inputs.t_fp_inner, depth: inputs.L_fp_inner }, bjsScene);
        innerFlangePlateTop.material = plateMaterial;
        innerFlangePlateTop.position.y = inputs.member_d / 2 - inputs.member_tf - inputs.t_fp_inner / 2;
        shadowGenerator.addShadowCaster(innerFlangePlateTop);
        innerFlangePlateTop.receiveShadows = true;

        const innerFlangePlateBot = innerFlangePlateTop.clone("inner_fp_bot");
        innerFlangePlateBot.position.y = -(inputs.member_d / 2 - inputs.member_tf - inputs.t_fp_inner / 2);
    }

    // Web Plates
    if (inputs.num_web_plates > 0) {
        if (inputs.L_wp > 0 && inputs.H_wp > 0 && inputs.t_wp > 0) {
            for (let i = 0; i < inputs.num_web_plates; i++) {
                    const webPlate = BABYLON.MeshBuilder.CreateBox(`wp_${i}`, { width: inputs.t_wp, height: inputs.H_wp, depth: inputs.L_wp }, bjsScene);
                    webPlate.material = plateMaterial;
                    const offset = (inputs.member_tw / 2 + inputs.t_wp / 2);
                    webPlate.position.x = (inputs.num_web_plates === 1) ? offset : (i === 0 ? offset : -offset);
                    shadowGenerator.addShadowCaster(webPlate);
                    webPlate.receiveShadows = true;
                }
        }
    }

    // --- Bolt Creation ---
    const createWebBoltGroup = () => {
        const { D_wp: D, Nc_wp: Nc, Nr_wp: Nr, S4_col_spacing_wp: S_col, S5_row_spacing_wp: S_row, S6_end_dist_wp: S_end } = inputs;
        if (inputs.num_web_plates == 0 || !D || !Nc || !Nr) return;

        // Calculate total thickness of the web connection
        const thickness = inputs.member_tw + (inputs.num_web_plates * inputs.t_wp);
        const startY = -((Nr - 1) * S_row) / 2;

        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < Nc; i++) {
                const z_pos = side * (inputs.gap / 2 + S_end + i * S_col);
                for (let j = 0; j < Nr; j++) {
                    const y_pos = startY + j * S_row;

                    const bolt = createBoltMesh(`web_bolt_${side}_${i}_${j}`, {
                        diameter: D,
                        thickness: thickness,
                        position: new BABYLON.Vector3(0, y_pos, z_pos) // Web connection is centered at x=0
                    }, bjsScene);

                    if (bolt) {
                        bolt.material = boltMaterial;
                        bolt.rotation.z = Math.PI / 2; // Correct rotation to align bolt with X-axis
                        shadowGenerator.addShadowCaster(bolt);
                    }
                }
            }
        }
    };

    const createFlangeBoltGroup = () => {
        const { D_fp: D, Nc_fp: Nc, Nr_fp: Nr, S1_col_spacing_fp: S_col, g_gage_fp: gage, S3_end_dist_fp: S_end, num_flange_plates, t_fp, member_tf, t_fp_inner, member_d } = inputs;
        if (inputs.num_flange_plates == 0 || !D || !Nc || !Nr) return;

        let clamped_thickness, y_center_top;

        if (num_flange_plates == 2) {
            // Total thickness of the 3-layer stack (outer plate + flange + inner plate)
            clamped_thickness = t_fp + member_tf + t_fp_inner;
            // Geometric center of the 3-layer stack
            y_center_top = (member_d / 2) + t_fp / 2 - member_tf / 2 - t_fp_inner / 2;
        } else {
            // Total thickness of the 2-layer stack (outer plate + flange)
            clamped_thickness = t_fp + member_tf;
            // Geometric center of the 2-layer stack
            y_center_top = (member_d / 2) + t_fp / 2 - member_tf / 2;
        }
        const y_center_bot = -y_center_top;

        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < Nc; i++) {
                const z_pos = side * (inputs.gap / 2 + S_end + i * S_col);
                const x_positions = gage > 0 ? [-gage / 2, gage / 2] : [0];

                for (const x_p of x_positions) {
                    // Top Flange Bolt
                    const bolt_top = createBoltMesh(`top_flange_bolt_${side}_${i}_${x_p}`, {
                        diameter: D,
                        thickness: clamped_thickness,
                        position: new BABYLON.Vector3(x_p, y_center_top, z_pos)
                    }, bjsScene);
                    if (bolt_top) {
                        bolt_top.material = boltMaterial;
                        shadowGenerator.addShadowCaster(bolt_top);
                    }

                    // Bottom Flange Bolt
                    const bolt_bot = createBoltMesh(`bot_flange_bolt_${side}_${i}_${x_p}`, {
                        diameter: D,
                        thickness: clamped_thickness,
                        position: new BABYLON.Vector3(x_p, y_center_bot, z_pos)
                    }, bjsScene);
                    if (bolt_bot) {
                        bolt_bot.material = boltMaterial;
                        shadowGenerator.addShadowCaster(bolt_bot);
                    }
                }
            }
        }
    };

    createWebBoltGroup();
    createFlangeBoltGroup();


    // --- 6. Data-Driven Dimension Creation ---
    const flangeDimY = inputs.member_d / 2 + inputs.t_fp + 5;
    const flangeDimX = (inputs.member_bf / 2) + 5;
    const webDimX = (inputs.member_tw / 2) + inputs.t_wp + 2;

    const dimensionDefinitions = [
        // --- General ---
        { name: "Gap", value: inputs.gap, start: [0, flangeDimY, -inputs.gap / 2], end: [0, flangeDimY, inputs.gap / 2], offset: [0, 2, 0] },

        // --- Flange Plate & Bolts ---
        { name: "L_fp", value: inputs.L_fp, condition: inputs.L_fp > 0 && inputs.H_fp > 0, start: [-inputs.H_fp / 2, flangeDimY, -inputs.L_fp / 2], end: [-inputs.H_fp / 2, flangeDimY, inputs.L_fp / 2], offset: [-2, 0, 0] },
        { name: "H_fp", value: inputs.H_fp, condition: inputs.L_fp > 0 && inputs.H_fp > 0, start: [-inputs.H_fp / 2, flangeDimY, inputs.L_fp / 2], end: [inputs.H_fp / 2, flangeDimY, inputs.L_fp / 2], offset: [0, 0, 2] },
        { name: "S1", value: inputs.S1_col_spacing_fp, condition: inputs.Nc_fp > 1, start: [flangeDimX, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], end: [flangeDimX, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp + inputs.S1_col_spacing_fp)], offset: [2, 0, 0] },
        { name: "g", value: inputs.g_gage_fp, condition: inputs.g_gage_fp > 0, start: [-inputs.g_gage_fp / 2, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], end: [inputs.g_gage_fp / 2, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], offset: [0, 0, -2] },
        { name: "S3", value: inputs.S3_end_dist_fp, start: [flangeDimX, flangeDimY, -inputs.gap / 2], end: [flangeDimX, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], offset: [2, 0, 0] },

        // --- Web Plate & Bolts ---
        { name: "L_wp", value: inputs.L_wp, condition: inputs.L_wp > 0 && inputs.H_wp > 0, start: [webDimX, -inputs.H_wp / 2, -inputs.L_wp / 2], end: [webDimX, -inputs.H_wp / 2, inputs.L_wp / 2], offset: [2, 0, 0] },
        { name: "H_wp", value: inputs.H_wp, condition: inputs.L_wp > 0 && inputs.H_wp > 0, start: [webDimX, -inputs.H_wp / 2, inputs.L_wp / 2], end: [webDimX, inputs.H_wp / 2, inputs.L_wp / 2], offset: [2, 0, 0] },
        { name: "S4", value: inputs.S4_col_spacing_wp, condition: inputs.Nc_wp > 1, start: [webDimX, ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], end: [webDimX, ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2, -(inputs.gap / 2 + inputs.S6_end_dist_wp + inputs.S4_col_spacing_wp)], offset: [2, 0, 0] },
        { name: "S5", value: inputs.S5_row_spacing_wp, condition: inputs.Nr_wp > 1, start: [webDimX, -((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], end: [webDimX, -((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2 + inputs.S5_row_spacing_wp, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], offset: [2, 0, 0] },
        { name: "S6", value: inputs.S6_end_dist_wp, start: [webDimX, 0, -inputs.gap / 2], end: [webDimX, 0, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], offset: [2, 0, 0] },
    ];

    dimensionDefinitions.forEach(dim => {
        // If a condition is defined and it's false, skip this dimension.
        if (dim.condition !== undefined && !dim.condition) {
            return;
        }
        // Create dimension line if the value is valid.
        if (dim.value > 0) {
            createDimensionLine(
                dim.name,
                dim.value,
                new BABYLON.Vector3(...dim.start),
                new BABYLON.Vector3(...dim.end),
                new BABYLON.Vector3(...dim.offset)
            );
        }
    });


    // --- 7. Final Camera Adjustment ---
    if (isFirstDraw && bjsScene.activeCamera && bjsScene.meshes.length > 0) {
        const allMeshes = bjsScene.meshes.filter(m => m.getBoundingInfo() && !m.name.includes("dim"));
        if (allMeshes.length > 0) {
            let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
            let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

            allMeshes.forEach(mesh => {
                // Important: ensure the mesh's world matrix is computed before getting bounding info
                mesh.computeWorldMatrix(true);
                const boundingBox = mesh.getBoundingInfo().boundingBox;
                min = BABYLON.Vector3.Minimize(min, boundingBox.minimumWorld);
                max = BABYLON.Vector3.Maximize(max, boundingBox.maximumWorld);
            });
            
            const boundingInfo = new BABYLON.BoundingInfo(min, max);

            bjsScene.activeCamera.setTarget(boundingInfo.boundingSphere.center);
            bjsScene.activeCamera.radius = boundingInfo.boundingSphere.radius * 2.8;
            isFirstDraw = false; // Set flag to false after the first auto-fit
        }
    }
}

// --- State for 2D Diagram Panning ---
let splice2dPan = { x: 0, y: 0, scale: 1.0 };
let splice2dIsPanning = false;
let splice2dStartPoint = { x: 0, y: 0 };

/**
 * Draws a 2D elevation view of the splice connection using SVG.
 */
function draw2dSpliceDiagram() {
    const svg = document.getElementById('splice-2d-diagram');
    if (!svg) return;
    svg.innerHTML = ''; // Clear previous drawing
    const ns = "http://www.w3.org/2000/svg";
    
    // FIX: Define helper functions before they are called.
    const createEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };

    const drawDim = (x1, y1, x2, y2, text, vertical = false, offset = 20) => {
        const g = createEl('g', { class: 'svg-dim' });
        const textBg = createEl('text', { 'text-anchor': 'middle' });
        const textFg = createEl('text', { 'text-anchor': 'middle', class: 'svg-dim-text' });
        textBg.textContent = text;
        textFg.textContent = text;

        if (vertical) {
            const midY = (y1 + y2) / 2;
            g.appendChild(createEl('line', { x1: x1, y1: y1, x2: x1, y2: y2 }));
            g.appendChild(createEl('line', { x1: x1 - 5, y1: y1, x2: x1 + 5, y2: y1 }));
            g.appendChild(createEl('line', { x1: x1 - 5, y1: y2, x2: x1 + 5, y2: y2 }));
            textBg.setAttribute('x', x1 - offset); textBg.setAttribute('y', midY);
            textFg.setAttribute('x', x1 - offset); textFg.setAttribute('y', midY);
            textBg.setAttribute('transform', `rotate(-90 ${x1 - offset},${midY})`);
            textFg.setAttribute('transform', `rotate(-90 ${x1 - offset},${midY})`);
        } else {
            const midX = (x1 + x2) / 2;
            g.appendChild(createEl('line', { x1: x1, y1: y1, x2: x2, y2: y1 }));
            g.appendChild(createEl('line', { x1: x1, y1: y1 - 5, x2: x1, y2: y1 + 5 }));
            g.appendChild(createEl('line', { x1: x2, y1: y1 - 5, x2: x2, y2: y1 + 5 }));
            textBg.setAttribute('x', midX); textBg.setAttribute('y', y1 - offset);
            textFg.setAttribute('x', midX); textFg.setAttribute('y', y1 - offset);
        }
        g.appendChild(textBg);
        g.appendChild(textFg);
        return g;
    };

    // Create a group element for panning
    const group = createEl('g', { id: 'splice-2d-pan-group' });
    svg.appendChild(group);

    const inputs = gatherInputsFromIds(diagramInputIds);
    const { member_d, member_tf, gap, L_fp, L_wp, H_wp, t_fp, Nc_fp, S1_col_spacing_fp, S3_end_dist_fp, Nc_wp, S4_col_spacing_wp, S6_end_dist_wp, Nr_wp, S5_row_spacing_wp, D_fp, D_wp } = inputs;

    // --- 1. Setup Scene and Scaling ---
    const W = 800, H = 400;
    const padX = 60, padY = 60;
    const total_length = Math.max(L_fp, L_wp) * 2 + gap;
    const total_height = member_d + 2 * t_fp;

    // FIX: Ensure scale is always a positive, finite number.
    let scale = 0.1; // Default to a small, safe scale.
    if (total_length > 0 && total_height > 0) {
        scale = Math.min((W - 2 * padX) / total_length, (H - 2 * padY) / total_height);
    }
    if (scale <= 0 || !isFinite(scale)) scale = 0.1; // Final safety check.

    const cx = W / 2, cy = H / 2;

    // --- 2. Draw Beam Members ---
    const s_d = member_d * scale;
    const s_tf = member_tf * scale;
    const s_gap = gap * scale;
    const beam_len = Math.max(L_fp, L_wp) * scale + 40;

    const beamLeftX = cx - s_gap / 2 - beam_len; // This was already correct
    group.appendChild(createEl('rect', { x: beamLeftX, y: cy - s_d / 2, width: Math.max(0, beam_len), height: Math.max(0, s_d), class: 'svg-member-outline' }));
    group.appendChild(createEl('line', { x1: beamLeftX, y1: cy - s_d / 2 + s_tf, x2: beamLeftX + beam_len, y2: cy - s_d / 2 + s_tf, class: 'svg-member-line' }));
    group.appendChild(createEl('line', { x1: beamLeftX, y1: cy + s_d / 2 - s_tf, x2: beamLeftX + beam_len, y2: cy + s_d / 2 - s_tf, class: 'svg-member-line' }));

    const beamRightX = cx + s_gap / 2; // This was already correct
    group.appendChild(createEl('rect', { x: beamRightX, y: cy - s_d / 2, width: Math.max(0, beam_len), height: Math.max(0, s_d), class: 'svg-member-outline' }));
    group.appendChild(createEl('line', { x1: beamRightX, y1: cy - s_d / 2 + s_tf, x2: beamRightX + beam_len, y2: cy - s_d / 2 + s_tf, class: 'svg-member-line' }));
    group.appendChild(createEl('line', { x1: beamRightX, y1: cy + s_d / 2 - s_tf, x2: beamRightX + beam_len, y2: cy + s_d / 2 - s_tf, class: 'svg-member-line' }));

    // --- 3. Draw Splice Plates & Bolts ---
    let s_t_fp = 0;
    if (inputs.num_flange_plates > 0 && L_fp > 0) {
        const s_L_fp = L_fp * scale;
        s_t_fp = t_fp * scale;
        group.appendChild(createEl('rect', { x: cx - s_L_fp, y: cy - s_d / 2 - s_t_fp, width: Math.max(0, s_L_fp * 2), height: Math.max(0, s_t_fp), class: 'svg-plate-flange' }));
        group.appendChild(createEl('rect', { x: cx - s_L_fp, y: cy + s_d / 2, width: Math.max(0, s_L_fp * 2), height: Math.max(0, s_t_fp), class: 'svg-plate-flange' }));

        for (let i = 0; i < Nc_fp; i++) {
            const bolt_z_right = (S3_end_dist_fp + i * S1_col_spacing_fp) * scale;
            const bolt_z_left = -bolt_z_right;
            const bolt_r = (D_fp * scale) / 2;
            group.appendChild(createEl('circle', { cx: cx + s_gap / 2 + bolt_z_right, cy: cy - s_d / 2 - s_t_fp / 2, r: bolt_r, class: 'svg-bolt' }));
            group.appendChild(createEl('circle', { cx: cx + s_gap / 2 + bolt_z_right, cy: cy + s_d / 2 + s_t_fp / 2, r: bolt_r, class: 'svg-bolt' }));
            group.appendChild(createEl('circle', { cx: cx - s_gap / 2 + bolt_z_left, cy: cy - s_d / 2 - s_t_fp / 2, r: bolt_r, class: 'svg-bolt' }));
            group.appendChild(createEl('circle', { cx: cx - s_gap / 2 + bolt_z_left, cy: cy + s_d / 2 + s_t_fp / 2, r: bolt_r, class: 'svg-bolt' }));
        }
    }

    if (inputs.num_web_plates > 0 && L_wp > 0) {
        const s_L_wp = L_wp * scale;
        const s_H_wp = H_wp * scale;
        group.appendChild(createEl('rect', { x: cx - s_L_wp, y: cy - s_H_wp / 2, width: Math.max(0, s_L_wp * 2), height: Math.max(0, s_H_wp), class: 'svg-plate-web' }));

        const startY = -((Nr_wp - 1) * S5_row_spacing_wp) / 2 * scale;
        for (let i = 0; i < Nc_wp; i++) {
            const bolt_z_right = (S6_end_dist_wp + i * S4_col_spacing_wp) * scale;
            const bolt_z_left = -bolt_z_right;
            const bolt_r = (D_wp * scale) / 2;
            for (let j = 0; j < Nr_wp; j++) {
                const y_pos = startY + j * S5_row_spacing_wp * scale;
                group.appendChild(createEl('circle', { cx: cx + s_gap / 2 + bolt_z_right, cy: cy + y_pos, r: bolt_r, class: 'svg-bolt' }));
                group.appendChild(createEl('circle', { cx: cx - s_gap / 2 + bolt_z_left, cy: cy + y_pos, r: bolt_r, class: 'svg-bolt' }));
            }
        }
    }

    // --- 4. Draw Dimensions ---
    const dimY_top = cy - s_d / 2 - s_t_fp - 10;
    const dimY_bot = cy + s_d / 2 + s_t_fp + 10;
    const dimX_left = cx - Math.max(L_fp, L_wp) * scale - 40;

    group.appendChild(drawDim(cx - s_gap / 2, dimY_top, cx + s_gap / 2, dimY_top, `Gap=${gap}"`));
    if (L_fp > 0) group.appendChild(drawDim(cx - L_fp * scale, dimY_top - 25, cx + L_fp * scale, dimY_top - 25, `L_fp=${L_fp * 2}"`));
    if (L_wp > 0) group.appendChild(drawDim(cx - L_wp * scale, dimY_bot + 25, cx + L_wp * scale, dimY_bot + 25, `L_wp=${L_wp * 2}"`));
    if (H_wp > 0) group.appendChild(drawDim(dimX_left, cy - H_wp * scale / 2, dimX_left, cy + H_wp * scale / 2, `H_wp=${H_wp}"`, true));

    if (Nc_fp > 1) group.appendChild(drawDim(cx + s_gap / 2 + S3_end_dist_fp * scale, dimY_top, cx + s_gap / 2 + (S3_end_dist_fp + S1_col_spacing_fp) * scale, dimY_top, `S1=${S1_col_spacing_fp}"`));
    if (Nc_wp > 1) group.appendChild(drawDim(cx + s_gap / 2 + S6_end_dist_wp * scale, dimY_bot, cx + s_gap / 2 + (S6_end_dist_wp + S4_col_spacing_wp) * scale, dimY_bot, `S4=${S4_col_spacing_wp}"`));
    if (Nr_wp > 1) group.appendChild(drawDim(dimX_left, cy - S5_row_spacing_wp * scale / 2, dimX_left, cy + S5_row_spacing_wp * scale / 2, `S5=${S5_row_spacing_wp}"`, true));

    // Apply the current pan transform
    group.setAttribute('transform', `translate(${splice2dPan.x}, ${splice2dPan.y}) scale(${splice2dPan.scale})`);
}

// --- Main Calculator Logic (DOM interaction and event handling) ---
const spliceCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
    const { PI, sqrt, min, max, abs } = Math;
    const E_MOD = 29000.0; // ksi
    
    /**
     * Validates the inputs for the splice calculation.
     * @param {object} inputs - The collected input values.
     * @returns {{errors: string[], warnings: string[]}} - Validation results.
     */
    function validateSpliceInputs(inputs) {
        const { errors, warnings } = validateInputs(inputs, validationRules.splice);

        // Custom cross-field validation
        if (inputs.H_fp < inputs.g_gage_fp) {
            errors.push("Flange plate width (H_fp) must be greater than or equal to the bolt gage (g).");
        }

        // Add a warning if no plates are selected
        if (inputs.num_flange_plates == 0 && inputs.num_web_plates == 0) {
            warnings.push("No splice plates are selected. The connection has no capacity.");
        }

        return { errors, warnings };
    }

    // Define a zero-value check object to use as a fallback for bearing calculations.
    const zero_bearing_check = { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };
    
    function checkBoltShear({ grade, threadsIncl, db, numPlanes = 1, fastenerPatternLength = 0 }) {
    const { Fnv, wasReduced } = AISC_SPEC.getFnv(grade, threadsIncl, fastenerPatternLength);
    const Ab = PI * (db ** 2) / 4.0;
    return { Rn: Fnv * Ab * numPlanes, phi: 0.75, omega: 2.00, Fnv, Ab, num_planes: numPlanes, wasReduced };
}

function checkBoltBearing({ db, t_ply, Fu_ply, le, s, isEdgeBolt, deformationIsConsideration, hole_dia }) {
    // AISC 360-22 Eq J3-6.
    const tearout_coeff = deformationIsConsideration ? 1.2 : 1.5;
    const bearing_coeff = deformationIsConsideration ? 2.4 : 3.0;
    const Lc = isEdgeBolt ? le - hole_dia / 2.0 : s - hole_dia;
    if (Lc < 0 || t_ply <= 0) return { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 }; 

    const Rn_tearout = tearout_coeff * Lc * t_ply * (Fu_ply || 0);
    const Rn_bearing = bearing_coeff * db * t_ply * (Fu_ply || 0);
    return { Rn: min(Rn_tearout, Rn_bearing), phi: 0.75, omega: 2.00, Lc, Rn_tearout, Rn_bearing };
}

/**
 * Computes the shear lag factor U for a bolted splice plate per AISC D3.
 * @param {number} plate_width - The width of the splice plate.
 * @param {number} gage - The bolt gage across the plate width.
 * @param {number} num_fastener_rows - The number of fastener rows across the plate width (e.g., 2 for a typical flange splice).
 * @param {number} conn_length - The length of the connection (distance between first and last bolts).
 * @param {number} t_p - Thickness of the plate.
 * @param {number} d_bolt - Diameter of the bolt.
 * @returns {{U: number, U_case2: number, U_case7: number, x_bar: number}}
 */
function computeShearLagFactorU({ plate_width, gage, num_fastener_rows, conn_length, t_p, d_bolt }) {
    if (plate_width <= 0 || conn_length <= 0 || num_fastener_rows <= 0) {
        return { U: 1.0, U_case2: 1.0, U_case7: 1.0, x_bar: 0 };
    }

    // --- Shear Lag Factor U per AISC Table D3.1, Case 2 ---
    // For a symmetric flange splice plate, we analyze half of the plate as a Tee-section.
    // The 'stem' of the Tee is the portion between the bolt lines (gage).
    // The 'flange' of the Tee is the portion outside the bolt lines.
    const flange_width = (plate_width - gage) / 2.0;
    const stem_height = gage / 2.0;
    const area_flange = flange_width * t_p;
    const area_stem = stem_height * t_p;
    const total_area = area_flange + area_stem;

    // x_bar is the distance from the centroid of the Tee section to the connecting face (the bolt line).
    const x_bar = total_area > 0 ? (area_flange * (flange_width / 2.0) - area_stem * (stem_height / 2.0)) / total_area : 0;
    const U_case2 = 1.0 - (Math.abs(x_bar) / conn_length);

    // AISC D3.1, Case 7: For W, M, S shapes, but can be conservatively applied to flange plates.
    // bf/d ratio is analogous to plate_width / gage
    const U_case7 = (plate_width >= (2/3) * gage) ? 0.90 : 0.85;

    return { U: Math.min(1.0, Math.max(U_case2, U_case7)), U_case2, U_case7, x_bar: Math.abs(x_bar) };
}

function checkGrossSectionYielding({ Ag, Fy }) {
    // AISC 360-22 Eq J4-1
    return { Rn: Fy * Ag, phi: 0.90, omega: 1.67, Ag, Fy };
}

/**
 * Checks the tensile rupture strength of a splice plate based on its net section.
 * This aligns with the direct net section check methodology where U=1.0.
 * @param {object} params - The parameters for the check.
 * @param {number} params.bf - The width of the flange or splice plate (in).
 * @param {number} params.tf - The thickness of the flange or splice plate (in).
 * @param {number} params.Fu - The specified minimum tensile strength of the material (ksi).
 * @param {number} params.num_bolts_in_cs - The number of bolts in the critical cross-section.
 * @param {number} params.hole_dia_net_area - The diameter to be deducted for each bolt hole.
 * @returns {{Rn: number, phi: number, omega: number, An: number, Ag: number}} An object with the nominal capacity and calculation details.
 */
function checkFlangeNetSection({ bf, tf, Fu, num_bolts_in_cs, hole_dia_net_area }) {
    const Ag = bf * tf;
    const A_holes = num_bolts_in_cs * hole_dia_net_area * tf;
    const An = Ag - A_holes;

    if (An <= 0) { // Return Fu even on failure so breakdown can display it
        return { Rn: 0, phi: 0.75, omega: 2.00, An: 0, Ag, A_holes, Fu };
    }

    // Nominal Tensile Rupture Strength (Rn) per AISC J4-1(b), assuming U=1.0
    const Rn = Fu * An;

    return { Rn, phi: 0.75, omega: 2.00, An, Ag, A_holes, Fu };
}

/**
 * Calculates block shear rupture strength for a connection per AISC 360-22 Eq J4-5.
 * @param {object} params - Parameters for the check.
 * @param {number} params.Agv - Gross area along the shear path.
 * @param {number} params.Anv - Net area along the shear path.
 * @param {number} params.Agt - Gross area along the tension path.
 * @param {number} params.Ant - Net area along the tension path.
 * @param {number} params.Fu - Specified minimum tensile strength of the material (ksi).
 * @param {number} params.Fy - Specified minimum yield strength of the material (ksi).
 * @param {number} params.Ubs - Shear lag factor for the tension plane (typically 1.0 or 0.5).
 * @param {number} params.num_shear_paths - The number of parallel shear planes (e.g., 2 for a flange splice).
 * @returns {object} An object containing the nominal block shear capacity (Rn).
 */
function checkBlockShear({ Agv, Anv, Ant, Fu, Fy, Ubs = 1.0 }) {
    // AISC 360-22 Eq J4-5
    // The nominal strength Rn is the lesser of two failure modes:
    // 1. Shear rupture + Tension yielding
    // 2. Shear yielding + Tension rupture
    const shear_rupture_term = 0.6 * Fu * Anv;
    const tension_rupture_term = Ubs * Fu * Ant;
    const shear_yield_term = 0.6 * Fy * Agv;

    // AISC Eq. J4-5
    const Rn = Math.min(shear_rupture_term + tension_rupture_term, shear_yield_term + tension_rupture_term);
    
    return { 
        Rn, 
        phi: 0.75, 
        omega: 2.00, 
        details: {
            shear_rupture_term,
            tension_rupture_term,
            shear_yield_limit: shear_yield_term + tension_rupture_term,
            Anv,
            Ant,
            Ubs
        } 
    };
}

function checkShearYielding(Agv, Fy) {
    // AISC 360-22 Eq J4-3
    const Rn = 0.6 * Fy * Agv;
    return { Rn, phi: 1.00, omega: 1.50, Agv, Fy };
}

function checkShearRupture(Anv, Fu) {
    // AISC 360-22 Eq J4-4
    const Rn = 0.6 * Fu * Anv;
    return { Rn, phi: 0.75, omega: 2.00, Anv, Fu };
}

function checkPlateCompression({ Ag, Fy, t, unbraced_length, k=0.65 }) {
    // AISC 360-22 Chapter E
    const r = t / sqrt(12.0);
    const slenderness = r > 0 ? (k * unbraced_length) / r : 0;
    let Fcr, Fe = null;
    if (slenderness <= 25) { // Simplified from E7
         Fcr = Fy;
    } else {
        Fe = (PI**2 * E_MOD) / (slenderness**2);
        Fcr = (Fy / Fe) <= 2.25 ? (0.658**(Fy / Fe)) * Fy : 0.877 * Fe;
    }
    return { Rn: Fcr * Ag, phi: 0.90, omega: 1.67, Fcr, slenderness, r, Fe, Ag, Fy, k, unbraced_length };
}

function checkBoltSlip({ db, faying_surface_class, num_fillers = 0, num_slip_planes, hole_type = 'standard' }) {
    // AISC 360-22 Section J3.8
    const Tb = AISC_SPEC.getTb(db); // Minimum bolt pretension from Table J3.1
    const mu = AISC_SPEC.getMu(faying_surface_class); // Mean slip coefficient from Table J3.5
    const Du = 1.13; // Multiplier that reflects the ratio of mean installed bolt pretension to the specified minimum
    const hf = (num_fillers === 1) ? 1.0 : (num_fillers > 1) ? 0.85 : 1.0; // Factor for fillers

    // Nominal slip resistance per bolt
    const Rn = mu * Du * hf * Tb * num_slip_planes;

    return { Rn, phi: 1.0, omega: 1.5, mu, Du, hf, Tb, num_slip_planes }; // Factors for standard holes
}

function checkBoltTension(grade, db) {
    // AISC 360-22 Table J3.2
    const FntMap = { "A325": 90.0, "A490": 113.0, "F3148": 90.0 };
    const Fnt = FntMap[grade] ?? 0;
    const Ab = PI * (db**2) / 4.0;
    return { Rn: Fnt * Ab, phi: 0.75, omega: 2.00, Fnt, Ab };
}

function checkBeamFlexuralRupture(Sx, Fy, Fu, bf, tf, num_bolts_in_flange_cs, hole_dia_net_area) {
    // AISC 360-16/22 Section F13.2: Strength Reductions for Holes in Tension Flange
    const Afg = bf * tf;
    // num_bolts_in_flange_cs is the number of bolts in the critical cross-section of ONE flange.
    const Afn = (bf - num_bolts_in_flange_cs * hole_dia_net_area) * tf;

    if (Afn <= 0) {
        return { Rn: 0, phi: 0.75, omega: 2.00, Mn_rupture: 0, Afg, Afn, Yt: 0, Sx, Fu, Fy, applies: true };
    }

    // Per AISC F13.2, determine Yt
    const Yt = (Fy / Fu <= 0.8) ? 1.0 : 1.1;

    // Check if the limit state applies per F13.2(a)
    if (Fu * Afn >= Yt * Fy * Afg) {
        // Limit state does not apply, return a very high strength so it doesn't govern.
        return { Rn: Infinity, phi: 0.75, omega: 2.00, Mn_rupture: Infinity, Afg, Afn, Yt, Sx, Fu, Fy, applies: false };
    }

    // Per F13.2(b), calculate the nominal flexural strength based on tensile rupture.
    const Mn_rupture_kip_in = (Fu * Afn / Afg) * Sx;
    return { Rn: Mn_rupture_kip_in, phi: 0.75, omega: 2.00, Mn_rupture: Mn_rupture_kip_in, Afg, Afn, Yt, Sx, Fu, Fy, applies: true };
}
function checkBoltShearTensionInteraction(Tu, Vu, Fnv, grade, db, design_method) {
    // AISC 360-22 Section J3.9
    const Fnt = AISC_SPEC.getFnt(grade);
    const Ab = PI * (db**2) / 4.0;

    if (Ab === 0 || Fnv === 0) return { Rn: 0, phi: 0.75, omega: 2.00 };

    // fv is the required shear stress PER BOLT.
    const fv = Vu / Ab;

    let F_nt_prime;
    if (design_method === 'LRFD') {
        // AISC Eq. J3-3a
        F_nt_prime = 1.3 * Fnt - (Fnt / (0.75 * Fnv)) * fv;
    } else { // ASD
        // AISC Eq. J3-3b
        F_nt_prime = 1.3 * Fnt - ((2.00 / 0.75) * Fnt / Fnv) * fv;
    }
    
    F_nt_prime = Math.min(F_nt_prime, Fnt); // Per J3.9, F'nt shall not exceed Fnt
    F_nt_prime = Math.max(0, F_nt_prime); // Ensure tensile strength is not negative

    const Rn = F_nt_prime * Ab; // Nominal tensile strength adjusted for shear
    return { Rn, phi: 0.75, omega: 2.00, Fnt, Fnv, Ab, fv, F_nt_prime, Tu, Vu }; // phi/omega for tension are used for the final check
}

/**
 * Calculates the resultant force on the critical bolt in a web splice bolt group.
 * This accounts for direct shear (V and H) and the moment induced by the eccentricity of the vertical shear.
 * @param {number} V_load - Vertical shear force on the splice.
 * @param {number} H_load - Horizontal force on the bolt group (from moment couple).
 * @param {number} gap - The gap between the members being spliced.
 * @param {number} Nc - Number of bolt columns.
 * @param {number} Nr - Number of bolt rows.
* @param {number} S_pitch - Spacing between bolt columns (pitch).
* @param {number} S_gage - Spacing between bolt rows (gage).
* @param {number} S_end - End distance from plate edge to first bolt column.
 * @returns {object} An object containing the calculated forces and geometric properties.
 */
function calculateWebSpliceEccentricity(V_load, H_load, gap, Nc, Nr, S_pitch, S_gage, S_end) {
    const num_bolts = Nc * Nr;
    if (num_bolts === 0) {
        return { max_R: 0, eccentricity: 0, M_ecc: 0, Ip: 0, f_vy_direct: 0, f_vx_direct: 0, f_v_moment: 0, f_h_moment: 0, num_bolts: 0 };
    }

    // Eccentricity from bolt group centroid to the splice centerline
    // The load is applied at the gap centerline (gap/2 from the plate edge).
    // The bolt group centroid is at S_end + (Nc-1)*S_pitch/2 from the plate edge.
    const bolt_group_centroid_dist = S_end + (Nc - 1) * S_pitch / 2.0;
    const eccentricity = bolt_group_centroid_dist - (gap / 2.0);
    const M_ecc = V_load * eccentricity; // Moment on bolt group due to shear

    let Ip = 0;
    // Find coordinates of the critical bolt (farthest from the centroid)
    const crit_x = (Nc - 1) * S_pitch / 2.0;
    const crit_y = (Nr - 1) * S_gage / 2.0;

    for (let i = 0; i < Nc; i++) {
        for (let j = 0; j < Nr; j++) {
            const dx = i * S_pitch - crit_x; // x-distance from bolt group centroid
            const dy = j * S_gage - crit_y;  // y-distance from bolt group centroid
            Ip += dx**2 + dy**2;
        }
    }

    // If Ip is zero (e.g., single bolt), the moment components are zero.
    if (Ip === 0) {
        const max_R = sqrt((H_load / num_bolts)**2 + (V_load / num_bolts)**2);
        return { max_R, eccentricity, M_ecc, Ip, f_vy_direct: V_load / num_bolts, f_vx_direct: H_load / num_bolts, f_v_moment: 0, f_h_moment: 0, num_bolts };
    }

    // Direct shear components
    const f_vy_direct = V_load / num_bolts; // Vertical component
    const f_vx_direct = H_load / num_bolts; // Horizontal component

    // Moment-induced shear components on the critical bolt
    const f_v_moment = (M_ecc * crit_x) / Ip; // Vertical component from eccentric moment
    const f_h_moment = (M_ecc * crit_y) / Ip; // Horizontal component from eccentric moment

    // Resultant force on the critical bolt using vector addition
    const R_h = f_vx_direct + f_h_moment;
    const R_v = f_vy_direct + f_v_moment;
    const max_R = sqrt(R_h**2 + R_v**2);

    return { max_R, eccentricity, M_ecc, Ip, f_vy_direct, f_vx_direct, f_v_moment, f_h_moment, num_bolts };
}

/**
 * Checks for prying action on a bolt connection based on AISC Manual Part 9.
 * This function calculates the total required tensile force per bolt, including prying.
 * @param {object} params - Parameters for prying action check.
 * @param {number} params.t_plate - Thickness of the connected plate (in).
 * @param {number} params.Fy_plate - Yield strength of the connected plate (ksi).
 * @param {number} params.b - Distance from bolt centerline to bolt line (in).
 * @param {number} params.a - Distance from bolt centerline to edge of plate or fillet toe (in).
 * @param {number} params.p - Bolt pitch (spacing parallel to the member length) (in).
 * @param {number} params.d_bolt - Nominal bolt diameter (in).
 * @param {number} params.d_hole - Nominal hole diameter (in).
 * @param {number} params.B_bolt - The applied tensile force demand per bolt (kips).
 * @returns {object} An object containing the total required force (T_req), prying force (Q), and critical thickness (tc).
 */
function checkPryingAction({ t_plate, Fy_plate, b, a, p, d_bolt, d_hole, B_bolt }) {
    // B_bolt is the required tension demand per bolt (e.g., Tu / num_bolts)
    if (p <= 0 || Fy_plate <= 0 || B_bolt < 0) {
        return { T_req: B_bolt, Q: 0, tc: Infinity, alpha_prime: 0 };
    }
    
    const b_prime = b - d_bolt / 2.0;
    const a_prime = Math.min(a + d_bolt / 2.0, 1.25 * b);

    if (a_prime <= 0 || b_prime < 0) {
        return { T_req: B_bolt, Q: 0, tc: Infinity, alpha_prime: 0 };
    }

    const rho = b_prime / a_prime;
    const delta = 1 - (d_hole / p);

    if (delta < 0) {
        return { T_req: Infinity, Q: Infinity, tc: 0, alpha_prime: 0 };
    }

    // Critical thickness tc required to eliminate prying, based on the applied DEMAND B_bolt (AISC Eq. 9-27).
    const tc = Math.sqrt((4 * B_bolt * b_prime) / (p * Fy_plate));

    let Q = 0;
    let alpha_prime = 0;
    if (t_plate < tc) { // Prying occurs if the actual plate thickness is less than the critical thickness
        alpha_prime = (1 / (delta * (1 + rho))) * (((t_plate / tc)**2) - 1);
        alpha_prime = Math.max(0, Math.min(alpha_prime, 1.0));
        
        // Prying force Q per bolt, based on the demand B_bolt.
        Q = B_bolt * delta * alpha_prime * rho;
    }

    const T_req = B_bolt + Q; // Total required tension in the bolt is the initial demand plus the prying force.
    
    return { T_req, Q, tc, alpha_prime, delta, rho, b_prime, a_prime, Fy_plate };
}

function getGeometryChecks({ db, s_col, s_row, gage, le_long, le_tran, t_thinner }) { 
    // Implements checks from AISC J3.3, J3.4, and J3.5.
    // Assumes standard round holes.
    // Assumes sheared edges for minimum edge distance lookup (most conservative).
    if (!db) return {}; // Return empty if no bolt diameter is provided
    // For rolled edges or different hole types, Table J3.4 values would change.
    const tolerance = 1e-9; // Small tolerance for floating point comparisons
    const min_le = AISC_SPEC.minEdgeDistanceTable[String(db)] || 1.25 * db; // Use exact values from map where possible
    const min_s = (8 / 3) * db; // AISC J3.4 minimum spacing is 2-2/3 * db
    // From AISC J3.5
    const max_s = min(24 * t_thinner, 12.0);
    return {
        edge_dist_long: { actual: le_long, min: min_le, pass: le_long >= min_le - tolerance },
        edge_dist_tran: { actual: le_tran, min: min_le, pass: le_tran >= min_le - tolerance },
        spacing_col: { actual: s_col, min: min_s, pass: s_col >= min_s - tolerance },
        spacing_row: { actual: s_row, min: min_s, pass: s_row >= min_s - tolerance }, // Spacing between rows on one side of the gage
        spacing_gage: { actual: gage, min: min_s, pass: !gage || (gage >= min_s - tolerance) }, // Gage is also a spacing
        max_spacing_col: { actual: s_col, max: max_s, pass: s_col <= max_s + tolerance },
        max_spacing_row: { actual: s_row, max: max_s, pass: s_row <= max_s + tolerance }
    };
}

function calculateBoltGroupGeometry({ L_plate, H_plate, Nc, Nr, S_col, S_row, S_end_gap, gage }) {
    const edge_dist_gap = S_end_gap;
    const bolt_pattern_width = (Nc > 1 ? (Nc - 1) * S_col : 0);
    const le_long = L_plate - edge_dist_gap - bolt_pattern_width;

    let bolt_pattern_height, le_tran;
    if (gage) { // Flange plate logic with a gage
        bolt_pattern_height = Nr <= 1 ? gage : gage + 2 * (Nr - 1) * S_row;
        le_tran = (H_plate - bolt_pattern_height) / 2.0;
    } else { // Web plate logic without a gage
        bolt_pattern_height = (Nr > 1 ? (Nr - 1) * S_row : 0);
        le_tran = (H_plate - bolt_pattern_height) / 2.0;
    }

    return { 
        le_long: le_long < 0 ? 0 : le_long, // Prevent negative edge distances
        le_tran: le_tran < 0 ? 0 : le_tran,
        edge_dist_gap, 
        bolt_pattern_width, 
        bolt_pattern_height 
    };
}

/**
 * A helper function to perform a standard set of checks on a single splice plate.
 * @param {string} plateName - The name for the checks (e.g., "Outer Plate").
 * @param {object} inputs - The main inputs object.
 * @param {object} config - Configuration for the specific plate check.
 * @returns {object} An object containing the results of the checks for this plate.
 */
function performPlateChecks(plateName, inputs, config) {
    // If plate has no dimensions, skip all checks for it.
    if (config.H_p <= 0 || config.t_p <= 0 || config.L_p <= 0) return {};

    const {
        demand, demand_comp, H_p, t_p, L_p, Fy, Fu,
        Nc, Nr, S_col, S_row, S_end, gage, D_bolt,
        hole_for_net_area, hole_for_bearing
    } = config;

    const plateChecks = {};

    const { le_long, le_tran } = calculateBoltGroupGeometry({
        L_plate: L_p, H_plate: H_p, Nc, Nr, S_col, S_row, S_end_gap: S_end, gage
    });

    // 1. Gross Section Yielding & Compression
    const Ag = H_p * t_p;
    plateChecks[`${plateName} GSY`] = { demand, check: checkGrossSectionYielding({ Ag, Fy }) };
    plateChecks[`${plateName} Compression`] = { demand: demand_comp, check: checkPlateCompression({ Ag, Fy, t: t_p, unbraced_length: S_col }) };

    // 2. Net Section Fracture
    const bolts_in_critical_section = 2 * Nr;
    plateChecks[`${plateName} NSF`] = { demand, check: checkFlangeNetSection({ bf: H_p, tf: t_p, Fu, num_bolts_in_cs: bolts_in_critical_section, hole_dia_net_area: hole_for_net_area }) };

    // 3. Block Shear (Corrected Area Calculations)
    const Agv = (S_end + (Nc - 1) * S_col) * t_p * 2; // Gross shear area (2 paths)
    const Anv = Agv - (Nc * 2) * hole_for_net_area * t_p; // Net shear area (2 paths)
    const Ant = (gage - Nr * hole_for_net_area) * t_p; // Net tension area (1 path across gage)

    plateChecks[`${plateName} Block Shear`] = { demand, check: checkBlockShear({ Agv, Anv, Ant, Fu, Fy, Ubs: 1.0 }) };

    // 4. Bolt Bearing
    const bearing_edge = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing });
    const bearing_int = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing });
    const num_edge_bolts = 2 * Nr;
    const num_int_bolts = (Nc - 1) * 2 * Nr;
    const total_bearing = bearing_edge.Rn * num_edge_bolts + bearing_int.Rn * num_int_bolts;
    plateChecks[`${plateName} Bolt Bearing`] = { demand, check: { Rn: total_bearing, phi: 0.75, omega: 2.00 }, details: { edge: bearing_edge, int: bearing_int, num_edge: num_edge_bolts, num_int: num_int_bolts } };

    return plateChecks;
}

/**
 * A helper function to perform checks on the beam element where it connects to a splice.
 * @param {string} partName - The name of the beam part (e.g., "Flange", "Web").
 * @param {object} inputs - The main inputs object.
 * @param {object} config - Configuration for the specific check.
 * @returns {object} An object containing the results of the checks.
 */
function performBeamConnectionChecks(partName, inputs, config) {
    // If bolt diameter is zero, no bolt checks can be performed.
    if (config.D_bolt <= 0) return {};

    const {
        demand, t_beam, Fu_beam, Fy_beam,
        Nc, Nr, S_col, S_row, S_end, gage, D_bolt,
        hole_for_net_area, hole_for_bearing
    } = config;

    const beamChecks = {};

    // 1. Bolt Bearing on Beam Element
    // FIX: Use a conditional to get the correct plate length property
    const plate_length_prop = partName === 'Flange' ? inputs.L_fp : inputs.L_wp;
    const { le_long } = calculateBoltGroupGeometry({ L_plate: plate_length_prop, Nc, S_col, S_end_gap: S_end });
    const bearing_edge = checkBoltBearing({ db: D_bolt, t_ply: t_beam, Fu_ply: Fu_beam, le: le_long, s: S_col, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing });
    const bearing_int = checkBoltBearing({ db: D_bolt, t_ply: t_beam, Fu_ply: Fu_beam, le: Infinity, s: S_col, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing });
    
    // --- FIX: Double the bolt count if checking a Flange ---
    // The multiplier ensures bolts on both sides of the gage are counted.
    const multiplier = (partName === 'Flange') ? 2 : 1; 
    const num_edge_bolts = Nr * multiplier;
    const num_int_bolts = (Nc - 1) * Nr * multiplier;
    const total_bearing = bearing_edge.Rn * num_edge_bolts + bearing_int.Rn * num_int_bolts;
    beamChecks[`Beam ${partName} Bolt Bearing`] = {
        demand: demand,
        check: { Rn: total_bearing, phi: bearing_edge.phi, omega: bearing_edge.omega },
        details: { edge: bearing_edge, int: bearing_int, num_edge: num_edge_bolts, num_int: num_int_bolts }
    };

    return beamChecks;
}

function performFlangeChecks(inputs, demands) {
    const { total_flange_demand_tension, demand_fp_outer, demand_fp_inner, demand_fp_outer_comp, demand_fp_inner_comp } = demands;
    const checks = {};
    const geomChecks = {};

    // If flange plates are disabled, skip all flange checks
    if (inputs.num_flange_plates == 0) {
        // Return empty objects as no flange checks are applicable.
        return { checks: {}, geomChecks: {}, inputs };
    }
    
    // --- Flange Splice Checks ---
    const hole_nominal_fp = AISC_SPEC.getNominalHoleDiameter(inputs.D_fp, inputs.hole_calc_method, 'standard');
    const hole_for_bearing_fp = hole_nominal_fp;
    const hole_for_net_area_fp = hole_nominal_fp + 1.0 / 16.0; // Per AISC commentary for net area calculations
    
    const { le_long: le_long_fp, le_tran: le_tran_fp, edge_dist_gap: edge_dist_gap_fp, bolt_pattern_height: bolt_pattern_height_fp } = calculateBoltGroupGeometry({
        L_plate: inputs.L_fp,
        H_plate: inputs.H_fp,
        Nc: inputs.Nc_fp,
        Nr: inputs.Nr_fp,
        S_col: inputs.S1_col_spacing_fp,
        S_row: inputs.S2_row_spacing_fp,
        S_end_gap: inputs.S3_end_dist_fp,
        gage: inputs.g_gage_fp
    });

    // Nr_fp is rows on EACH side of the gage, so total bolts per side of splice is Nc * (2 * Nr)
    const num_flange_bolts_per_side = inputs.Nc_fp * (2 * inputs.Nr_fp);
    const num_shear_planes_fp = inputs.num_flange_plates === 2 ? 2 : 1;
    const fastenerPatternLength_flange = (inputs.Nc_fp > 1) ? ((inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp) : 0;
    const single_bolt_shear_fp_check = checkBoltShear({
        grade: inputs.bolt_grade_fp, 
        threadsIncl: inputs.threads_included_fp, 
        db: inputs.D_fp, 
        numPlanes: num_shear_planes_fp, 
        fastenerPatternLength: fastenerPatternLength_flange
    });
    checks['Flange Bolt Shear'] = { 
        demand: total_flange_demand_tension,
        check: { ...single_bolt_shear_fp_check, Rn: single_bolt_shear_fp_check.Rn * num_flange_bolts_per_side },
        details: { Rn_single: single_bolt_shear_fp_check.Rn, num_bolts: num_flange_bolts_per_side }
    };
    
    // --- Beam Flange Tensile Rupture (against flange force) ---
    // This is a direct check of the flange's net area against the tensile force.
    const bolts_in_flange_cs = 2 * inputs.Nr_fp;
    checks['Beam Flange Tensile Rupture'] = {
        demand: total_flange_demand_tension,
        check: checkFlangeNetSection({
            bf: inputs.member_bf, tf: inputs.member_tf, Fu: inputs.member_Fu,
            num_bolts_in_cs: bolts_in_flange_cs,
            hole_dia_net_area: hole_for_net_area_fp
        })
    };

    // --- Outer Plate Checks (using helper) ---
    Object.assign(checks, performPlateChecks("Outer Plate", inputs, {
        demand: demand_fp_outer, demand_comp: demand_fp_outer_comp,
        H_p: inputs.H_fp, t_p: inputs.t_fp, L_p: inputs.L_fp, Fy: inputs.flange_plate_Fy, Fu: inputs.flange_plate_Fu,
        Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
        gage: inputs.g_gage_fp, D_bolt: inputs.D_fp,
        hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
    }));

    // --- Inner Plate Checks (using helper) ---
    if (inputs.num_flange_plates === 2) {
        Object.assign(checks, performPlateChecks("Inner Plate", inputs, {
            demand: demand_fp_inner, demand_comp: demand_fp_inner_comp,
            H_p: inputs.H_fp_inner, t_p: inputs.t_fp_inner, L_p: inputs.L_fp_inner, Fy: inputs.flange_plate_Fy_inner, Fu: inputs.flange_plate_Fu_inner,
            Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
            gage: inputs.g_gage_fp, D_bolt: inputs.D_fp,
            hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
        }));
    }

    // --- Beam Flange Block Shear Check ---
    // This is analogous to the plate block shear check, but on the beam flange material.
    // It also has two shear paths.
    
    // Shear Path (along one line of bolts)
    const L_gv_beam_f = inputs.S3_end_dist_fp + (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp; // Gross length of one shear path
    const L_nv_beam_f = L_gv_beam_f - (inputs.Nc_fp - 0.5) * hole_for_net_area_fp; // Net length of one shear path
    
    // Tension path is across the gage.
    const Ant_beam_f = (inputs.g_gage_fp - (2 * inputs.Nr_fp * hole_for_net_area_fp)) * inputs.member_tf;
    const Agt_beam_f = inputs.g_gage_fp * inputs.member_tf;

    checks['Beam Flange Block Shear'] = { 
        demand: total_flange_demand_tension, 
        check: checkBlockShear({ 
            Agv: L_gv_beam_f * inputs.member_tf,
            Anv: L_nv_beam_f * inputs.member_tf,
            Ant: Ant_beam_f,
            Fu: inputs.member_Fu, Fy: inputs.member_Fy,
            Ubs: 1.0, num_shear_paths: 2
        }),
        details: { t_p: inputs.member_tf, hole_dia: hole_for_net_area_fp, Agv: L_gv_beam_f * inputs.member_tf, Anv: L_nv_beam_f * inputs.member_tf, Agt: Agt_beam_f, Ant: Ant_beam_f }
    };

    // --- Beam Flange Bolt Bearing Check ---
    Object.assign(checks, performBeamConnectionChecks("Flange", inputs, {
        demand: total_flange_demand_tension,
        t_beam: inputs.member_tf, Fu_beam: inputs.member_Fu, Fy_beam: inputs.member_Fy,
        Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
        gage: inputs.g_gage_fp, D_bolt: inputs.D_fp,
        hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
    }));
    // --- Prying Action Check ---
    // --- FIX: Corrected and Consolidated Prying Action Check ---
    // (inside performFlangeChecks function)

    const B_per_bolt = num_flange_bolts_per_side > 0 ? total_flange_demand_tension / num_flange_bolts_per_side : 0;
    const d_hole_pry = hole_for_bearing_fp; // Use the same hole diameter as bearing

    let T_req = B_per_bolt; // Start with the direct tension demand
    let Q_total = 0;
    let prying_details = {};
    
    if (B_per_bolt > 0) {
        if (inputs.num_flange_plates === 2) {
            // Each plate sees half the bolt force
            const B_per_plate = B_per_bolt / 2;
            const b_pry_outer = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
            const a_pry_outer = (inputs.H_fp - bolt_pattern_height_fp) / 2.0;
            const prying_outer = checkPryingAction({ t_plate: inputs.t_fp, Fy_plate: inputs.flange_plate_Fy, b: b_pry_outer, a: a_pry_outer, p: inputs.S1_col_spacing_fp, d_bolt: inputs.D_fp, d_hole: d_hole_pry, B_bolt: B_per_plate /* ✅ Half the bolt force */ });
            
            const b_pry_inner = inputs.g_gage_fp / 2.0;
            const a_pry_inner = (inputs.g_gage_fp / 2.0) + (inputs.member_bf - inputs.member_tw) / 2.0;
            const prying_inner = checkPryingAction({ t_plate: inputs.t_fp_inner, Fy_plate: inputs.flange_plate_Fy_inner, b: b_pry_inner, a: a_pry_inner, p: inputs.S1_col_spacing_fp, d_bolt: inputs.D_fp, d_hole: d_hole_pry, B_bolt: B_per_plate /* ✅ Half the bolt force */ });
            
            Q_total = prying_outer.Q + prying_inner.Q;
            prying_details = { outer: prying_outer, inner: prying_inner };
        } else {
            // Single plate system - full bolt force
            // For a single plate on a W-shape flange:
            // 'b' is from bolt centerline to the web face.
            const b_pry = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
            // 'a' is from bolt centerline to the plate edge.
            const a_pry = (inputs.H_fp - inputs.g_gage_fp) / 2.0;
            const prying_outer = checkPryingAction({ t_plate: inputs.t_fp, Fy_plate: inputs.flange_plate_Fy, b: b_pry, a: a_pry, p: inputs.S1_col_spacing_fp, d_bolt: inputs.D_fp, d_hole: d_hole_pry, B_bolt: B_per_bolt /* ✅ Full bolt force */ });
            Q_total = prying_outer.Q;
            prying_details = { outer: prying_outer };
        }
    
        T_req += Q_total; // Add total prying force to the initial demand

        checks['Flange Bolt Tension with Prying'] = {
            demand: T_req, // The demand is the total required force including prying
            check: checkBoltTension(inputs.bolt_grade_fp, inputs.D_fp), // Check against bolt's nominal capacity
            details: { ...prying_details, B_per_bolt, Q_total, T_req }
        };
    }

    const outer_plate_tc = prying_details.outer?.tc || 0;

    checks['Plate Thickness for Prying'] = {
        demand: inputs.t_fp, // Provided thickness
        check: { Rn: outer_plate_tc, phi: 1.0, omega: 1.0 }, // Required thickness
        // Pass the correct details object to the breakdown generator.
        // The breakdown needs the `B_per_bolt` value which is not inside `prying_details_combined`.
        // We create a new object that includes both for the breakdown function to use.
        details: { ...prying_details, B_per_bolt }
    };
    
    const t_thinner_flange = min(inputs.member_tf, inputs.t_fp, inputs.num_flange_plates === 2 ? inputs.t_fp_inner : Infinity);
    geomChecks['Flange Bolts'] = getGeometryChecks({
        db: inputs.D_fp, 
        s_col: inputs.S1_col_spacing_fp, 
        s_row: inputs.S2_row_spacing_fp, 
        gage: inputs.g_gage_fp,
        le_long: le_long_fp, 
        le_tran: le_tran_fp, 
        t_thinner: t_thinner_flange
    });
    const tolerance = 1e-9;
    const min_le_fp = geomChecks['Flange Bolts'].edge_dist_long.min;
    geomChecks['Flange Bolts'].edge_dist_gap = { actual: edge_dist_gap_fp, min: min_le_fp, pass: edge_dist_gap_fp >= min_le_fp - tolerance };

    return { checks, geomChecks, inputs };
}

/**
 * Computes the bolt group coefficient C using the numerical ICR method.
 * Adapted from Brandt's iterative approach for AISC eccentrically loaded bolt groups.
 * @param {number} boltRow - Number of rows (Nr, along y/vertical).
 * @param {number} boltColumn - Number of columns (Nc, along z/horizontal).
 * @param {number} rowSpacing - Spacing between rows (S_row, in).
 * @param {number} columnSpacing - Spacing between columns (S_col, in).
 * @param {number} eccentricity - Eccentricity along z (in).
 * @param {number} rotation - Optional group rotation in degrees (default 0).
 * @returns {number} The coefficient C (effective number of bolts).
 */
function boltCoefficient(boltRow, boltColumn, rowSpacing, columnSpacing, eccentricity, rotation = 0) {
    const Rv = boltRow;
    const Rh = boltColumn;
    const Sv = rowSpacing;
    const Sh = columnSpacing;
    rotation = rotation * Math.PI / 180; // Convert to radians
    const Ec = Math.abs(eccentricity);

    if (Ec === 0 || Rv === 0 || Rh === 0) return Rv * Rh;

    const boltLoc = [];
    for (let i = 0; i < Rv; i++) {
        for (let k = 0; k < Rh; k++) {
            let y1 = (i * Sv) - (Rv - 1) * Sv / 2; // Vertical coordinate
            let x1 = (k * Sh) - (Rh - 1) * Sh / 2; // Horizontal coordinate
            const dv = x1 * Math.sin(rotation) + y1 * Math.cos(rotation);
            const dh = x1 * Math.cos(rotation) - y1 * Math.sin(rotation); // Simplified without MirrFlag
            boltLoc.push({ dv, dh });
        }
    }

    let xRo = 0; // Horizontal shift from centroid
    let yRo = 0; // Vertical shift from centroid
    const Ru = 1.0; // Normalized ultimate strength (divides out)
    let stp = false;
    let cnt = 0;
    let p = 0; // Initialize p to 0 to handle cases where the loop doesn't run.
    let uFprev = Infinity; // Previous force imbalance
    const cntMax = 5000;
    const epsilon = 1e-6; // Small value to avoid division by near-zero

    while (!stp) {
        cnt++;
        let liMax = 0;
        for (let i = 0; i < boltLoc.length; i++) {
            // Find the bolt furthest from the current trial ICR
            const xi = boltLoc[i].dh + xRo;
            const yi = boltLoc[i].dv + yRo;
            liMax = Math.max(liMax, Math.sqrt(xi ** 2 + yi ** 2));
        }

        let rx = 0; // Horizontal force sum
        let ry = 0; // Vertical force sum
        let m = 0;  // Moment sum
        let j = 0;  // Inertia sum
        for (let i = 0; i < boltLoc.length; i++) {
            // Calculate properties for each bolt based on its distance from the trial ICR
            const xi = boltLoc[i].dh + xRo;
            const yi = boltLoc[i].dv + yRo;
            const ri = Math.sqrt(xi ** 2 + yi ** 2);
            
            // Guard against division by zero if liMax is 0 (e.g., single bolt at origin)
            const delta = liMax > epsilon ? 0.34 * ri / liMax : 0;
            const iRn = Ru * (1 - Math.exp(-10 * delta)) ** 0.55;

            // Sum forces and moments (guard ri for components)
            m += (iRn / Ru) * ri;
            if (ri > epsilon) {
                ry += (iRn / Ru) * (xi / ri); // Vertical component
                rx += (iRn / Ru) * (yi / ri); // Horizontal component
            }
            j += ri ** 2;
        }

        // Calculate total force and force imbalances
        const ro = Ec + xRo; // Effective radius to load line
        p = (Math.abs(ro) > epsilon) ? m / ro : 0; // Guard ro=0
        const uFy = p - ry;  // Vertical imbalance
        const uFx = -rx;     // Horizontal imbalance (no applied horizontal in this frame)
        const uF = Math.sqrt(uFy**2 + uFx**2); // Total imbalance

        // --- Convergence Checks ---
        const stp1 = Math.abs(uFy) <= 0.00001 && Math.abs(uFx) <= 0.00001;
        const stp2 = cnt >= cntMax;
        // Divergence check: if total imbalance starts increasing after more iterations, stop.
        const stp3 = cnt > 50 && uF > uFprev * 1.01;
        stp = stp1 || stp2 || stp3;

        if (stp && !stp1) {
            // Convergence failed; log details for debugging (optional)
            // console.warn(`ICR convergence failed after ${cnt} iterations. Final imbalance: ${uF.toFixed(6)}, xRo: ${xRo.toFixed(4)}, yRo: ${yRo.toFixed(4)}`);
            return NaN; // Or fallback to elastic method if desired
        }

        // Update the trial ICR location
        const mapFunc = (Math.abs(m) > epsilon) ? j / (Rv * Rh * m) : 0; // Guard m=0
        xRo += uFy * mapFunc;
        yRo += uFx * mapFunc;
        uFprev = uF;
    }

    return p; // C coefficient
}

function performWebChecks(inputs, demands) {
    const { V_load, Hw } = demands;
    const checks = {};
    const geomChecks = {};

    // If web plates are disabled, skip all web checks
    if (inputs.num_web_plates == 0) {
        // Add a placeholder check to indicate it was skipped
        checks['Web Bolt Group Shear (ICR)'] = { demand: Math.sqrt(V_load**2 + Hw**2), check: { Rn: 0, phi: 0.75, omega: 2.00 }, details: { note: "Web splice not provided." } };
        return { checks, geomChecks, inputs };
    }

    const hole_nominal_wp = AISC_SPEC.getNominalHoleDiameter(inputs.D_wp, inputs.hole_calc_method);
    const hole_for_bearing_wp = hole_nominal_wp;
    const hole_for_net_area_wp = hole_nominal_wp + 1.0 / 16.0; // Per AISC commentary for net area calculations

    const { le_long: le_long_wp, le_tran: le_tran_wp, edge_dist_gap: edge_dist_gap_wp } = calculateBoltGroupGeometry({
        L_plate: inputs.L_wp,
        H_plate: inputs.H_wp,
        Nc: inputs.Nc_wp,
        Nr: inputs.Nr_wp,
        S_col: inputs.S4_col_spacing_wp,
        S_row: inputs.S5_row_spacing_wp, S_end_gap: inputs.S6_end_dist_wp
    });
    
    const num_web_bolts_per_side = inputs.Nc_wp * inputs.Nr_wp;
    if (num_web_bolts_per_side === 0) return { checks, geomChecks, inputs };

    // --- Bolt Slip Check (if applicable) ---
    if (inputs.connection_type === 'slip-critical') {
        const single_bolt_slip_check = checkBoltSlip({
            db: inputs.D_wp,
            faying_surface_class: inputs.faying_surface_class,
            num_slip_planes: inputs.num_web_plates,
        });
        const total_slip_capacity = single_bolt_slip_check.Rn * num_web_bolts_per_side;
        // Demand is the resultant of V_load and Hw
        checks['Web Bolt Slip'] = { demand: Math.sqrt(V_load**2 + Hw**2), check: { ...single_bolt_slip_check, Rn: total_slip_capacity }, details: { num_bolts: num_web_bolts_per_side } };
    }

    const fastenerPatternLength_web = (inputs.Nr_wp > 1) ? ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) : 0;
    const single_web_bolt_shear_check = checkBoltShear({
        grade: inputs.bolt_grade_wp, 
        threadsIncl: inputs.threads_included_wp, 
        db: inputs.D_wp, 
        numPlanes: inputs.num_web_plates, 
        fastenerPatternLength: fastenerPatternLength_web
    });

    // In performWebChecks...
    const eccentricity = calculateWebSpliceEccentricity(1, 0, inputs.gap, inputs.Nc_wp, inputs.Nr_wp, inputs.S4_col_spacing_wp, inputs.S5_row_spacing_wp, inputs.S6_end_dist_wp).eccentricity; // Get e

    const theta = Math.atan2(Hw, V_load); // Load angle (Hw horizontal/z, V_load vertical/y)
    const resultant_demand = Math.sqrt(V_load ** 2 + Hw ** 2);
    const e_eff = (V_load * eccentricity) / (resultant_demand || 1); // Avoid division by zero

    // Compute C (note: row/col swapped if needed; here row = Nr_wp vertical, column = Nc_wp horizontal)
    const C = boltCoefficient(inputs.Nr_wp, inputs.Nc_wp, inputs.S5_row_spacing_wp, inputs.S4_col_spacing_wp, e_eff, 0);

    const Rn_group = C * single_web_bolt_shear_check.Rn;

    const bolt_group_capacity_check = { 
        Rn: Rn_group, 
        phi: 0.75, 
        omega: 2.00, 
        C, 
        Rn_single: single_web_bolt_shear_check.Rn,
        e_eff: e_eff,
        theta_deg: theta * 180 / Math.PI
    };

    checks['Web Bolt Group Shear (ICR)'] = {
        demand: resultant_demand,
        check: bolt_group_capacity_check,
        details: { ...bolt_group_capacity_check, V_load, Hw, eccentricity }
    };

    const Tu_per_bolt = Hw > 0 ? Hw / num_web_bolts_per_side : 0; // Tension demand per bolt
    const Vu_per_bolt = V_load > 0 ? V_load / num_web_bolts_per_side : 0; // Simplified vertical shear per bolt

    if (Tu_per_bolt > 0) {
        checks['Web Bolt Shear/Tension Interaction'] = {
            demand: Tu_per_bolt,
            check: checkBoltShearTensionInteraction(Tu_per_bolt, Vu_per_bolt, single_web_bolt_shear_check.Fnv, inputs.bolt_grade_wp, inputs.D_wp, inputs.design_method)
        };
    }

    const total_t_wp = inputs.t_wp * inputs.num_web_plates;
    const Agv_wp = inputs.H_wp * total_t_wp;
    checks['Web Plate Gross Shear Yield'] = { 
        demand: V_load, 
        check: checkShearYielding(Agv_wp, inputs.web_plate_Fy),
        details: { H_wp: inputs.H_wp, t_total: total_t_wp }
    };
    const Anv_wp = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp;
    checks['Web Plate Net Shear Rupture'] = { 
        demand: V_load, 
        check: checkShearRupture(Anv_wp, inputs.web_plate_Fu),
        details: { H_wp: inputs.H_wp, Nr_wp: inputs.Nr_wp, hole_dia: hole_for_net_area_wp, t_total: total_t_wp }
    };

    // --- Web Plate Flexural Checks ---
    const { Mu_resisted_by_web } = demands;
    if (Mu_resisted_by_web > 0) {
        const Zx_wp = (total_t_wp * (inputs.H_wp ** 2)) / 4.0;
        const Sx_wp = (total_t_wp * (inputs.H_wp ** 2)) / 6.0;
        const Mn_yield_wp = inputs.web_plate_Fy * Zx_wp;
        checks['Web Plate Flexural Yielding'] = {
            demand: Mu_resisted_by_web,
            check: { Rn: Mn_yield_wp, phi: 0.90, omega: 1.67, Fy: inputs.web_plate_Fy, Zx: Zx_wp }
        };
        const An_wp_flexure = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp;
        const Mn_rupture_wp = inputs.web_plate_Fu * An_wp_flexure * Sx_wp / (inputs.H_wp * total_t_wp);
        checks['Web Plate Flexural Rupture'] = { demand: Mu_resisted_by_web, check: { Rn: Mn_rupture_wp, phi: 0.75, omega: 2.00 } };
    }
    
    // --- Corrected Web Plate Block Shear ---
    const total_t_wp_bs_calc = inputs.t_wp * inputs.num_web_plates; // Total thickness of web plates
    // Shear occurs along the bolt lines (longitudinal)
    const L_gv_single_path = inputs.S6_end_dist_wp + (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp;
    // Two shear paths (top and bottom of the bolt group)
    const Agv_bs = 2 * L_gv_single_path * total_t_wp_bs_calc;
    const Anv_bs = Agv_bs - (2 * inputs.Nc_wp * hole_for_net_area_wp * total_t_wp_bs_calc); // Deduct holes from both paths
    const Ant_bs = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp_bs_calc; // Tension path is transverse

    checks['Web Plate Block Shear'] = {
        demand: V_load,
        check: checkBlockShear({ Agv: Agv_bs, Anv: Anv_bs, Ant: Ant_bs, Fu: inputs.web_plate_Fu, Fy: inputs.web_plate_Fy, Ubs: 1.0 })
    };

    // --- Web Plate Bolt Bearing (Full Group) ---
    const num_edge_bolts_web = inputs.Nr_wp; // All bolts in the first column are edge bolts
    const num_int_bolts_web = (inputs.Nc_wp - 1) * inputs.Nr_wp;
    const bearing_wp_plate_edge = checkBoltBearing({
        db: inputs.D_wp, t_ply: total_t_wp, Fu_ply: inputs.web_plate_Fu,
        le: le_long_wp, s: inputs.S4_col_spacing_wp,
        isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration,
        hole_dia: hole_for_bearing_wp
    });
    const bearing_wp_plate_int = checkBoltBearing({
        db: inputs.D_wp, t_ply: total_t_wp, Fu_ply: inputs.web_plate_Fu,
        le: Infinity, s: inputs.S4_col_spacing_wp, isEdgeBolt: false,
        deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing_wp
    });
    const total_bearing_capacity_plate = (bearing_wp_plate_edge.Rn * num_edge_bolts_web) + (bearing_wp_plate_int.Rn * num_int_bolts_web);
    checks['Web Plate Bolt Bearing'] = { demand: V_load, check: { ...bearing_wp_plate_edge, Rn: total_bearing_capacity_plate }, details: { edge: bearing_wp_plate_edge, int: bearing_wp_plate_int, num_edge: num_edge_bolts_web, num_int: num_int_bolts_web } };
    
    // --- Beam Web Bolt Bearing Check ---
    Object.assign(checks, performBeamConnectionChecks("Web", inputs, {
        demand: V_load,
        t_beam: inputs.member_tw, Fu_beam: inputs.member_Fu, Fy_beam: inputs.member_Fy,
        Nc: inputs.Nc_wp, Nr: inputs.Nr_wp, S_col: inputs.S4_col_spacing_wp, S_row: inputs.S5_row_spacing_wp, S_end: inputs.S6_end_dist_wp,
        D_bolt: inputs.D_wp, hole_for_bearing: hole_for_bearing_wp
    }));

    const t_thinner_web = min(inputs.member_tw, inputs.t_wp * inputs.num_web_plates);
    geomChecks['Web Bolts'] = getGeometryChecks({
        db: inputs.D_wp, 
        s_col: inputs.S4_col_spacing_wp, 
        s_row: inputs.S5_row_spacing_wp, 
        gage: 0, // No gage for web plates
        le_long: le_long_wp, 
        le_tran: le_tran_wp, 
        t_thinner: t_thinner_web
    });
    const tolerance = 1e-9;
    const min_le_wp = geomChecks['Web Bolts'].edge_dist_long.min;
    geomChecks['Web Bolts'].edge_dist_gap = { actual: edge_dist_gap_wp, min: min_le_wp, pass: edge_dist_gap_wp >= min_le_wp - tolerance };

    return { checks, geomChecks, inputs };
}

function performMemberChecks(inputs, demands) {
    const { M_load, V_load, Axial_load } = demands;
    const hole_for_net_area_fp = AISC_SPEC.getNominalHoleDiameter(inputs.D_fp, inputs.hole_calc_method, 'standard') + 1.0 / 16.0;
    const hole_for_net_area_wp = AISC_SPEC.getNominalHoleDiameter(inputs.D_wp, inputs.hole_calc_method, 'standard') + 1.0 / 16.0;
    const checks = {};

    // --- Beam Flexural Yielding (Gross Section) ---
    const Mn_yield = inputs.member_Fy * inputs.member_Zx;
    checks['Beam Flexural Yielding'] = {
        demand: M_load * 12, // kip-in
        check: { Rn: Mn_yield, phi: 0.90, omega: 1.67, Fy: inputs.member_Fy, Zx: inputs.member_Zx }
    };

    const Agv_beam_web = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
    checks['Beam Web Shear Yielding'] = { 
        demand: V_load, 
        check: checkShearYielding(Agv_beam_web, inputs.member_Fy),
        details: { d: inputs.member_d, tf: inputs.member_tf, tw: inputs.member_tw }
    };
    
    // Only check for flexural rupture if there are flange bolts creating holes.
    if (inputs.num_flange_plates > 0) {
        // The number of bolts in the critical section of one flange is 2 * Nr_fp (one for each bolt line on the gage).
        const num_bolts_in_flange_cs = 2 * inputs.Nr_fp;
        checks['Beam Flexural Rupture'] = { demand: M_load * 12, check: checkBeamFlexuralRupture(inputs.member_Sx, inputs.member_Fy, inputs.member_Fu, inputs.member_bf, inputs.member_tf, num_bolts_in_flange_cs, hole_for_net_area_fp) };
    }
    const Anv_beam_web = (inputs.member_d - 2*inputs.member_tf - inputs.Nr_wp * hole_for_net_area_wp) * inputs.member_tw;
    checks['Beam Web Shear Rupture'] = { 
        demand: V_load,
        check: checkShearRupture(Anv_beam_web, inputs.member_Fu),
        details: { d: inputs.member_d, tf: inputs.member_tf, Nr_wp: inputs.Nr_wp, hole_dia: hole_for_net_area_wp, tw: inputs.member_tw }
    };

    // --- Beam Section Tensile Rupture Check (with Shear Lag) ---
    if (Axial_load > 0) {
        const A_gross_approx = 2 * inputs.member_bf * inputs.member_tf + (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw; 
        const A_holes_flange = (2 * inputs.Nr_fp) * hole_for_net_area_fp * inputs.member_tf;
        const A_holes_web = inputs.Nr_wp * hole_for_net_area_wp * inputs.member_tw; // Holes in one line
        const An = A_gross_approx - 2 * A_holes_flange - A_holes_web; // Holes in both flanges

        // --- Shear Lag Factor U per AISC Table D3.1 ---
        // For a W-shape connected by the flanges, Case 7 is often used.
        // U = 0.9 if bf >= 2/3 d, otherwise U = 0.85
        const U_case7 = (inputs.member_bf >= (2/3) * inputs.member_d) ? 0.90 : 0.85;

        // Alternatively, Case 2 can be used.
        const conn_length_flange = (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp;
        const { U: U_case2, x_bar } = computeShearLagFactorU({ plate_width: inputs.member_bf, gage: inputs.g_gage_fp, num_fastener_rows: inputs.Nr_fp, conn_length: conn_length_flange, t_p: inputs.member_tf, d_bolt: inputs.D_fp });

        // Per AISC D3, it is permitted to use the larger value.
        const U = Math.max(U_case2, U_case7);
        
        const Ae = U * An;
        const check = { 
            Rn: inputs.member_Fu * Ae, phi: 0.75, omega: 2.00, 
            An, Ae, U, Fu: inputs.member_Fu, 
            details: { Ag_approx: A_gross_approx, A_holes_flange, A_holes_web, U_case2, U_case7, x_bar, conn_length: conn_length_flange }
        };
        checks['Beam Section Tensile Rupture'] = { demand: Axial_load, check };
    }
    return { checks, inputs };
}

function performChecks(inputs, M_load, V_load) {
    // --- Demand Calculations ---
    const moment_arm_flange = inputs.member_d - inputs.member_tf;
    const flange_force_from_moment = (M_load * 12) / moment_arm_flange;
    const axial_per_flange = inputs.Axial_load / 2.0;
    const total_flange_demand_tension = flange_force_from_moment + axial_per_flange;
    const total_flange_demand_compression = Math.max(0, flange_force_from_moment - axial_per_flange); // Compression cannot be negative
    const demand_fp_outer = (inputs.num_flange_plates == 2) ? total_flange_demand_tension * 0.5 : total_flange_demand_tension;
    const demand_fp_inner = (inputs.num_flange_plates == 2) ? total_flange_demand_tension * 0.5 : 0;
    const demand_fp_outer_comp = (inputs.num_flange_plates == 2) ? total_flange_demand_compression * 0.5 : total_flange_demand_compression;
    const demand_fp_inner_comp = (inputs.num_flange_plates == 2) ? total_flange_demand_compression * 0.5 : 0;

    const flangeResults = performFlangeChecks(inputs, { total_flange_demand_tension, total_flange_demand_compression, demand_fp_outer, demand_fp_inner, demand_fp_outer_comp, demand_fp_inner_comp });

    let Mu_resisted_by_web, Hw;

    if (inputs.num_flange_plates > 0) {
        // If flange plates exist, they take the moment first
        const flange_capacity_for_moment = (flangeResults.checks['Flange Bolt Shear']?.check?.Rn ?? 0);
        const Mu_flange_splice_capacity = flange_capacity_for_moment * moment_arm_flange;
        Mu_resisted_by_web = Math.max(0, Math.abs(M_load * 12) - Mu_flange_splice_capacity);
        Hw = (inputs.H_wp > 0) ? Mu_resisted_by_web / (inputs.H_wp * 0.75) : 0; // Prevent division by zero
    } else {
        // If no flange plates, the web must take the entire moment
        Mu_resisted_by_web = Math.abs(M_load * 12);
        Hw = (inputs.H_wp > 0) ? Mu_resisted_by_web / (inputs.H_wp * 0.75) : 0;
    }

    const webResults = performWebChecks(inputs, { V_load, Hw });
    const memberResults = performMemberChecks(inputs, { M_load, V_load, Axial_load: inputs.Axial_load });

    return {
        checks: { ...flangeResults.checks, ...webResults.checks, ...memberResults.checks }, // FIX: Spread first, then set the correct total Rn
        geomChecks: { ...flangeResults.geomChecks, ...webResults.geomChecks },
        inputs,
        final_loads: { M_load, V_load, Axial_load: inputs.Axial_load },
        demands: { total_flange_demand_tension, total_flange_demand_compression, V_load, Hw, moment_arm_flange, flange_force_from_moment, axial_per_flange, Mu_resisted_by_web }
    };
}

function runSingleCheck(inputs) {
    let M_load = inputs.M_load;
    let V_load = inputs.V_load;

    if (inputs.develop_capacity_check) {
        const Zx = inputs.member_Zx;
        if (Zx > 0) {
            const Mn_kipin = inputs.member_Fy * Zx;
            const phi_b = 0.90; const omega_b = 1.67;
            M_load = (inputs.design_method === 'LRFD' ? phi_b * Mn_kipin : Mn_kipin / omega_b) / 12.0;
        }
        // Use the clear web area for shear capacity calculation, per AISC G2.1
        const Aw = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
        if (Aw > 0) {
            const Vn_kips = 0.6 * inputs.member_Fy * Aw;
            const phi_v_yield = 1.00; const omega_v_yield = 1.50;
            V_load = inputs.design_method === 'LRFD' ? phi_v_yield * Vn_kips : Vn_kips / omega_v_yield;
        }
    }
    return performChecks(inputs, M_load, V_load);
}

function optimizeFlangeBolts(inputs, optimizationLog) {
    const MAX_TOTAL_BOLTS_PER_SIDE = 48; // Increased limit
    const MAX_ROWS_OR_COLS = 10;
    const flangeBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_fp];
    let bestSolution = null;
    let lastFailureReason = "No valid configuration found within limits.";

    for (const d_fp of flangeBoltDiameters) {
        // Iterate by total number of bolts to find the minimum required first.
        for (let total_bolts = 2; total_bolts <= MAX_TOTAL_BOLTS_PER_SIDE; total_bolts += 2) {
            if (bestSolution && total_bolts >= bestSolution.num_bolts_per_side) break; // Found a solution, no need to check for more bolts.

            for (let nc_fp = 1; nc_fp <= MAX_ROWS_OR_COLS; nc_fp++) {
                if (total_bolts % (2 * nc_fp) === 0) {
                    const nr_fp = total_bolts / (2 * nc_fp);
                    if (nr_fp > MAX_ROWS_OR_COLS || nr_fp < 1) continue;

                    const currentInputs = { ...inputs, D_fp: d_fp, Nc_fp: nc_fp, Nr_fp: nr_fp };
                    const results = runSingleCheck(currentInputs);

                    const failingStrengthCheck = Object.entries(results.checks)
                        .filter(([key]) => (key.includes('Flange Bolt') || key.includes('Plate')) && !key.startsWith('Beam'))
                        .find(([key, data]) => {
                            const capacity = inputs.design_method === 'LRFD' ? data.check.Rn * data.check.phi : data.check.Rn / data.check.omega;
                            const ratio = capacity > 0 ? Math.abs(data.demand) / capacity : Infinity;
                            return ratio > 1.0;
                        });

                    const failingGeomCheck = Object.entries(results.geomChecks['Flange Bolts'] || {})
                        .find(([key, data]) => !data.pass);

                    if (!failingStrengthCheck && !failingGeomCheck) {
                        bestSolution = {
                            inputs: currentInputs,
                            num_bolts_per_side: total_bolts
                        };
                        // Break from the nc_fp loop to move to the next total_bolts count (or exit).
                        break; 
                    } else {
                        // Log the last failure reason for this bolt count.
                        if (failingStrengthCheck) lastFailureReason = `Strength check failed: ${failingStrengthCheck[0]}`;
                        else if (failingGeomCheck) lastFailureReason = `Geometry check failed: ${failingGeomCheck[0]}`;
                    }
                }
            }
        }
        if (bestSolution) break; // Found a solution with this diameter, no need to check smaller diameters.
    }

    if (bestSolution) {
        const { Nc_fp, Nr_fp, D_fp } = bestSolution.inputs; // These are undefined here.
        optimizationLog.push(`Flange splice optimized to ${Nc_fp} column(s) and ${Nr_fp} row(s) of ${D_fp}" bolts (${bestSolution.num_bolts_per_side} bolts per side).`);
        return bestSolution.inputs;
    }

    optimizationLog.push(`Flange splice optimization failed. Last failure reason: ${lastFailureReason}`);
    return null;
}

function optimizeWebBolts(inputs, optimizationLog) {
    const MAX_TOTAL_BOLTS_PER_SIDE = 48; // Increased limit
    const webBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_wp];
    let bestSolution = null;
    let lastFailureReason = "No valid configuration found within limits.";

    for (const d_wp of webBoltDiameters) {
        for (let total_bolts = 1; total_bolts <= MAX_TOTAL_BOLTS_PER_SIDE; total_bolts++) {
             // If we already found a solution with fewer bolts, no need to continue this loop.
            if (bestSolution && total_bolts >= bestSolution.num_bolts_per_side) break;

            for (let nr_wp = 1; nr_wp <= total_bolts; nr_wp++) {
                if (total_bolts % nr_wp === 0) {
                    const nc_wp = total_bolts / nr_wp;
                    const currentInputs = { ...inputs, D_wp: d_wp, Nc_wp: nc_wp, Nr_wp: nr_wp };
                    const results = runSingleCheck(currentInputs);

                    const failingStrengthCheck = Object.entries(results.checks)
                        .filter(([key]) => key.includes('Web') && !key.startsWith('Beam'))
                        .find(([key, data]) => {
                            const capacity = inputs.design_method === 'LRFD' ? data.check.Rn * data.check.phi : data.check.Rn / data.check.omega;
                            const ratio = capacity > 0 ? Math.abs(data.demand) / capacity : Infinity;
                            return ratio > 1.0;
                        });

                    const failingGeomCheck = Object.entries(results.geomChecks['Web Bolts'] || {})
                        .find(([key, data]) => !data.pass);

                    if (!failingStrengthCheck && !failingGeomCheck) {
                         bestSolution = {
                            inputs: currentInputs,
                            num_bolts_per_side: total_bolts
                        };
                        // Break the inner loop since we found the best solution for this total_bolts count
                        break;
                    } else {
                        if (failingStrengthCheck) lastFailureReason = `Strength check failed: ${failingStrengthCheck[0]}`;
                        else if (failingGeomCheck) lastFailureReason = `Geometry check failed: ${failingGeomCheck[0]}`;
                    }
                }
            }
            if (bestSolution && total_bolts === bestSolution.num_bolts_per_side) break;
        }
        if (bestSolution) break; // Found a solution with this diameter.
    }


    if (bestSolution) {
        const { Nc_wp, Nr_wp, D_wp } = bestSolution.inputs;
        optimizationLog.push(`Web splice optimized to ${Nc_wp} column(s) and ${Nr_wp} row(s) of ${D_wp}" bolts (${bestSolution.num_bolts_per_side} bolts per side).`);
        return bestSolution.inputs;
    }

    optimizationLog.push(`Web splice optimization failed. Last failure reason: ${lastFailureReason}`);
    return null;
}

function runOptimization(inputs) {
    let optimizationLog = [];

    // --- Step 1: Optimize Flange --- //
    const optimizedFlangeInputs = optimizeFlangeBolts(inputs, optimizationLog);

    if (!optimizedFlangeInputs) {
        // If flange optimization fails, we can't proceed. Return the failure log.
        return { ...runSingleCheck(inputs), optimizationLog }; // Rerun with original inputs to show failure
    }

    // --- Step 2: Optimize Web using the already optimized flange inputs ---
    const finalOptimizedInputs = optimizeWebBolts(optimizedFlangeInputs, optimizationLog);
    
    if (!finalOptimizedInputs) {
        // If web optimization fails, return results with the optimized flange but original web bolts to show the failure.
        return { ...runSingleCheck(optimizedFlangeInputs), optimizationLog };
    }

    // --- Step 3: Success. Run a final check with the fully optimized inputs ---
    const finalResults = runSingleCheck(finalOptimizedInputs);
    return { ...finalResults, optimizationLog };
}
/**
 * Main calculation orchestration function.
 * It takes raw string inputs from the DOM, converts them to numbers,
 * handles optimization logic, and calls the appropriate check functions.
 * @param {object} rawInputs - The inputs object gathered from the DOM.
 * @returns {object} The complete results object.
 */
function run(rawInputs) {
    const inputs = { ...rawInputs };

    // The user inputs TOTAL plate length. Convert to length-per-side for calculations.
    inputs.L_fp = (rawInputs.L_fp || 0) / 2.0;
    inputs.L_fp_inner = (rawInputs.L_fp_inner || 0) / 2.0;
    inputs.L_wp = (rawInputs.L_wp || 0) / 2.0;

    // Convert string properties from DOM to numbers for calculations
    inputs.member_Fy = parseFloat(inputs.member_Fy);
    inputs.member_Fu = parseFloat(inputs.member_Fu);
    inputs.flange_plate_Fy = parseFloat(inputs.flange_plate_Fy);
    inputs.flange_plate_Fu = parseFloat(inputs.flange_plate_Fu);
    inputs.flange_plate_Fy_inner = parseFloat(inputs.flange_plate_Fy_inner);
    inputs.flange_plate_Fu_inner = parseFloat(inputs.flange_plate_Fu_inner);
    inputs.web_plate_Fy = parseFloat(inputs.web_plate_Fy);
    inputs.web_plate_Fu = parseFloat(inputs.web_plate_Fu);

    if (inputs.optimize_bolts_check) {
        return runOptimization(inputs);
    } else {
        return runSingleCheck(inputs);
    }
}

    // Expose private functions for unit testing
    const __test_exports__ = { checkBoltShear, checkBlockShear };

    return { run, __test_exports__ };
})(); // This is a bug, it should be inside the IIFE
const baseBreakdownGenerators = {
    'Flange Bolt Shear': ({ check, details }, common) => {
        const wasReducedText = check.wasReduced ? `<br><span class="text-yellow-600">Note: F<sub>nv</sub> was reduced by 20% for long joint length.</span>` : '';
        return common.format_list([
            `<u>Nominal Shear Strength per bolt (R<sub>n,bolt</sub>)</u>`,
            `R<sub>n,bolt</sub> = F<sub>nv</sub> &times; A<sub>b</sub> &times; n<sub>planes</sub>`,
            `R<sub>n,bolt</sub> = ${common.fmt(check.Fnv, 1)} ksi &times; ${common.fmt(check.Ab, 3)} in² &times; ${check.num_planes} = ${common.fmt(details.Rn_single)} kips${wasReducedText}`,
            `<u>Total Nominal Strength (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = R<sub>n,bolt</sub> &times; n<sub>bolts</sub>`,
            `R<sub>n</sub> = ${common.fmt(details.Rn_single)} kips &times; ${details.num_bolts} = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'GSY': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4-1</u>`,
        `R<sub>n</sub> = F<sub>y</sub> &times; A<sub>g</sub>`,
        `R<sub>n</sub> = ${common.fmt(check.Fy, 1)} ksi &times; ${common.fmt(check.Ag, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'NSF': ({ check }, common) => common.format_list([
        `<u>Net Area (A<sub>n</sub>) per AISC J4.1</u>`,
        `A<sub>n</sub> = A<sub>g</sub> - A<sub>holes</sub> = ${common.fmt(check.Ag, 3)} - ${common.fmt(check.A_holes, 3)} = <b>${common.fmt(check.An, 3)} in²</b>`,
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.1(b)</u>`,
        `R<sub>n</sub> = F<sub>u</sub> &times; A<sub>n</sub> (Shear lag factor U=1.0 for splice plates)`,
        `R<sub>n</sub> = ${common.fmt(check.Fu)} ksi &times; ${common.fmt(check.An, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Block Shear': ({ check }, common) => common.format_list([
        `<u>Nominal Strength per AISC J4.3</u>`,
        `Shear Rupture Path: 0.6 × F<sub>u</sub> × A<sub>nv</sub> = ${common.fmt(check.details.shear_rupture_term)} kips`,
        `Tension Rupture Path: U<sub>bs</sub> × F<sub>u</sub> × A<sub>nt</sub> = ${common.fmt(check.details.tension_rupture_term)} kips`,
        `Shear Yield Limit: 0.6 × F<sub>y</sub> × A<sub>gv</sub> + U<sub>bs</sub> × F<sub>u</sub> × A<sub>nt</sub> = ${common.fmt(check.details.shear_yield_limit)} kips`,
        `R<sub>n</sub> = min(paths) = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Bolt Bearing': ({ check, details, demand }, common) => {
        const tearout_coeff = common.inputs.deformation_is_consideration ? 1.2 : 1.5;
        const bearing_coeff = common.inputs.deformation_is_consideration ? 2.4 : 3.0;
        return common.format_list([
            `Bolt Bearing per AISC J3.10`,
            `Deformation at bolt holes is ${common.inputs.deformation_is_consideration ? '' : '<b>not</b> '}a design consideration.`,
            `<strong>Edge Bolts (per bolt):</strong>`,
            `L<sub>c</sub> = L<sub>e</sub> - d<sub>h</sub>/2 = ${common.fmt(details.edge.Lc, 3)} in`,
            `R<sub>n,tearout</sub> = ${tearout_coeff} &times; L<sub>c</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.edge.Rn_tearout)} kips`,
            `R<sub>n,bearing</sub> = ${bearing_coeff} &times; d<sub>b</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.edge.Rn_bearing)} kips`,
            `R<sub>n,edge</sub> = min(Tearout, Bearing) = ${common.fmt(details.edge.Rn)} kips`,
            `<strong>Interior Bolts (per bolt):</strong>`,
            `L<sub>c</sub> = s - d<sub>h</sub> = ${common.fmt(details.int.Lc, 3)} in`,
            `R<sub>n,tearout</sub> = ${tearout_coeff} &times; L<sub>c</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.int.Rn_tearout)} kips`,
            `R<sub>n,bearing</sub> = ${bearing_coeff} &times; d<sub>b</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.int.Rn_bearing)} kips`,
            `R<sub>n,int</sub> = min(Tearout, Bearing) = ${common.fmt(details.int.Rn)} kips`,
            `<u>Total Nominal Strength (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = n<sub>edge</sub> &times; R<sub>n,edge</sub> + n<sub>int</sub> &times; R<sub>n,int</sub>`,
            `R<sub>n</sub> = ${details.num_edge} &times; ${common.fmt(details.edge.Rn)} + ${details.num_int} &times; ${common.fmt(details.int.Rn)} = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Web Bolt Group Shear (ICR)': ({ check, details, demand }, common) => {
        return common.format_list([
            `<u>Bolt Group Capacity (Instantaneous Center of Rotation Method)</u>`,
            `Reference: AISC Manual Part 7`,
            `Resultant Demand = √(V² + H²) = √(${common.fmt(details.V_load)}² + ${common.fmt(details.Hw)}²) = <b>${common.fmt(demand)} kips</b>`,
            `Load Angle (θ) = atan2(H, V) = <b>${common.fmt(details.theta_deg, 1)}°</b>`,
            `Effective Eccentricity (e_eff) = (V × e) / Resultant = (${common.fmt(details.V_load)} × ${common.fmt(details.eccentricity)}) / ${common.fmt(demand)} = <b>${common.fmt(details.e_eff, 2)} in</b>`,
            `Bolt Group Coefficient (C) = <b>${common.fmt(details.C, 2)}</b> (iterative convergence on ICR location)`,
            `Single Bolt Capacity (R_n,bolt) = <b>${common.fmt(details.Rn_single)} kips</b>`,
            `Nominal Group Capacity (R_n,group) = C × R_n,bolt = ${common.fmt(details.C, 2)} × ${common.fmt(details.Rn_single)} = <b>${common.fmt(check.Rn)} kips</b>`,
            `Design Capacity = ${common.capacity_eq} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Shear Yield': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.2(a)</u>`,
        `R<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>gv</sub>`,
        `R<sub>n</sub> = 0.6 &times; ${common.fmt(check.Fy, 1)} ksi &times; ${common.fmt(check.Agv, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Shear Rupture': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.1</u>`,
        `R<sub>n</sub> = 0.6 &times; F<sub>u</sub> &times; A<sub>nv</sub>`,
        `R<sub>n</sub> = 0.6 &times; ${common.fmt(check.Fu, 1)} ksi &times; ${common.fmt(check.Anv, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Web Bolt Shear/Tension Interaction': ({ check }, common) => common.format_list([
        `<u>Adjusted Tensile Strength per AISC J3.9</u>`,
        `Required Shear Stress (f<sub>rv</sub>) = V<sub>u</sub> / A<sub>b</sub> = ${common.fmt(check.Vu)} / ${common.fmt(check.Ab, 3)} = ${common.fmt(check.fv)} ksi`,
        `Available Tensile Stress (F'<sub>nt</sub>) = 1.3&times;F<sub>nt</sub> - (${common.factor_char}&times;F<sub>nt</sub>/F<sub>nv</sub>)&times;f<sub>rv</sub>`,
        `F'<sub>nt</sub> = 1.3&times;${common.fmt(check.Fnt, 1)} - (${common.factor_val}&times;${common.fmt(check.Fnt, 1)}/${common.fmt(check.Fnv, 1)})&times;${common.fmt(check.fv)} = ${common.fmt(check.F_nt_prime)} ksi`,
        `<u>Adjusted Nominal Tensile Strength (R<sub>n</sub>)</u>`,
        `R<sub>n</sub> = F'<sub>nt</sub> &times; A<sub>b</sub> = ${common.fmt(check.F_nt_prime)} &times; ${common.fmt(check.Ab, 3)} = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Beam Section Tensile Rupture': ({ check }, common) => common.format_list([
        `<u>Effective Net Area (A<sub>e</sub>) per AISC D2</u>`,
        `A<sub>e</sub> = U &times; A<sub>n</sub> = ${common.fmt(check.U, 3)} &times; ${common.fmt(check.An, 3)} in² = ${common.fmt(check.Ae, 3)} in²`,
        `<u>Nominal Strength (R<sub>n</sub>)</u>`,
        `R<sub>n</sub> = F<sub>u</sub> &times; A<sub>e</sub> = ${common.fmt(check.Fu, 1)} ksi &times; ${common.fmt(check.Ae, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Flange Bolt Tension with Prying': (data, common) => {
        const { demand, check, details } = data; // demand is T_req
        const outer_pry = details.outer ? `Outer Plate Q = ${common.fmt(details.outer.Q)} kips (t<sub>c</sub>=${common.fmt(details.outer.tc, 3)} in)` : '';
        const inner_pry = details.inner ? `Inner Plate Q = ${common.fmt(details.inner.Q)} kips (t<sub>c</sub>=${common.fmt(details.inner.tc, 3)} in)` : '';
        return common.format_list([
            `Prying action per AISC Manual Part 9.`,
            outer_pry,
            inner_pry,
            `<u>Total Bolt Tension Demand (T<sub>req</sub>)</u>`,
            `T<sub>req</sub> = B + Q = ${common.fmt(details.B_per_bolt)} + ${common.fmt(details.Q_total)} = <b>${common.fmt(demand)} kips</b>`,
            `<u>Bolt Tensile Capacity (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = F<sub>nt</sub> &times; A<sub>b</sub>`,
            `R<sub>n</sub> = ${common.fmt(check.Fnt, 1)} ksi &times; ${common.fmt(check.Ab, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Beam Flexural Yielding': ({ check }, common) => {
        return common.format_list([
            `<u>Flexural Yielding Check per AISC F2.1</u>`,
            `Nominal Moment Strength (M<sub>n</sub>) = F<sub>y</sub> &times; Z<sub>x</sub>`,
            `M<sub>n</sub> = ${common.fmt(check.Fy)} ksi &times; ${common.fmt(check.Zx)} in³ = <b>${common.fmt(check.Rn)} kip-in</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kip-in</b>`
        ]);
    },
    'Beam Flexural Rupture': ({ check }, common) => {
        if (!check.applies) {
            return common.format_list([
                `<u>Flexural Rupture Check per AISC F13.2</u>`,
                `Applicability: F<sub>u</sub>&times;A<sub>fn</sub> &ge; Y<sub>t</sub>&times;F<sub>y</sub>&times;A<sub>fg</sub>`,
                `${common.fmt(check.Fu)} &times; ${common.fmt(check.Afn,3)} &ge; ${common.fmt(check.Yt)} &times; ${common.fmt(check.Fy)} &times; ${common.fmt(check.Afg,3)}`,
                `${common.fmt(check.Fu * check.Afn)} &ge; ${common.fmt(check.Yt * check.Fy * check.Afg)}`,
                `<b>Limit state of tensile rupture does not apply.</b>`
            ]);
        }
        return common.format_list([
            `<u>Flexural Rupture Check per AISC F13.2</u>`,
            `Y<sub>t</sub> Factor = ${common.fmt(check.Yt, 1)} (since F<sub>y</sub>/F<sub>u</sub> is ${ (check.Fy/check.Fu).toFixed(2) })`,
            `Applicability: F<sub>u</sub>&times;A<sub>fn</sub> &lt; Y<sub>t</sub>&times;F<sub>y</sub>&times;A<sub>fg</sub>, so rupture check is required.`,
            `<u>Nominal Moment Strength (M<sub>n</sub>)</u>`,
            `M<sub>n</sub> = (F<sub>u</sub> &times; A<sub>fn</sub> / A<sub>fg</sub>) &times; S<sub>x</sub>`,
            `M<sub>n</sub> = (${common.fmt(check.Fu)} &times; ${common.fmt(check.Afn, 3)} / ${common.fmt(check.Afg, 3)}) &times; ${common.fmt(check.Sx)} = <b>${common.fmt(check.Rn)} kip-in</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kip-in</b>`
        ]);
    },
    'Plate Thickness for Prying': ({ check, details }, common) => {
        const outer_details = details.outer;
        if (!outer_details) return 'Prying details for outer plate not available.';

        // B_bolt is the demand on the bolts for the outer plate
        const B_bolt = common.inputs.num_flange_plates === 2 
            ? (details.B_per_bolt || 0) * 0.5 
            : (details.B_per_bolt || 0);

        return common.format_list([
            `<u>Required Thickness (t<sub>c</sub>) per AISC Eq. 9-27</u>`,
            `t<sub>c</sub> = &radic;[ (4 &times; B &times; b') / (p &times; F<sub>y,plate</sub>) ]`,
            `t<sub>c</sub> = &radic;[ (4 &times; ${common.fmt(B_bolt)} kips &times; ${common.fmt(outer_details.b_prime, 3)}") / (${common.fmt(common.inputs.S1_col_spacing_fp)}" &times; ${common.fmt(outer_details.Fy_plate)} ksi) ] = <b>${common.fmt(check.Rn, 3)} in</b>`,
            `<em>Note: This check is based on the outer plate geometry and its portion of the bolt tension demand (B). The provided plate thickness should be greater than this required thickness.</em>`
        ]);
    },
    'Compression': ({ check, details }, common) => {
        const slenderness_limit = 4.71 * Math.sqrt(29000 / check.Fy);
        const slenderness_check = `Slenderness (&lambda;) = ${common.fmt(check.slenderness)} &le; 25`;
    
        let fcr_calc = `Since &lambda; &le; 25, F<sub>cr</sub> = F<sub>y</sub> = ${common.fmt(check.Fy)} ksi`;
        if (check.slenderness > 25) {
            fcr_calc = `
                <li>Elastic Buckling Stress (F<sub>e</sub>) = (&pi;² &times; E) / &lambda;² = ${common.fmt(check.Fe)} ksi</li>
                <li>Since F<sub>y</sub> / F<sub>e</sub> = ${(check.Fy / check.Fe).toFixed(3)} &le; 2.25, F<sub>cr</sub> = [0.658<sup>(Fy/Fe)</sup>] &times; F<sub>y</sub> = ${common.fmt(check.Fcr)} ksi</li>
            `;
        }
    
        return common.format_list([
            `<u>Compressive Strength per AISC Chapter E</u>`,
            `Radius of Gyration (r) = t / &radic;12 = ${common.fmt(check.t, 3)} / &radic;12 = ${common.fmt(check.r, 3)} in`,
            `Slenderness (&lambda;) = (k &times; L) / r = (${check.k} &times; ${check.unbraced_length}") / ${common.fmt(check.r, 3)} = ${common.fmt(check.slenderness)}`,
            `<u>Critical Buckling Stress (F<sub>cr</sub>)</u>`,
            fcr_calc,
            `<u>Nominal Compressive Strength (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = F<sub>cr</sub> &times; A<sub>g</sub> = ${common.fmt(check.Fcr)} ksi &times; ${common.fmt(check.Ag, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
};

function getBreakdownGenerator(name) {
    // Direct match first
    if (baseBreakdownGenerators[name]) {
        return baseBreakdownGenerators[name];
    }
    // Keyword-based matching to eliminate aliases
    if (name.includes('Compression')) return baseBreakdownGenerators['Compression'];
    if (name.includes('GSY')) return baseBreakdownGenerators['GSY'];
    if (name.includes('NSF')) return baseBreakdownGenerators['NSF'];
    if (name.includes('Block Shear')) return baseBreakdownGenerators['Block Shear'];
    if (name.includes('Bolt Bearing')) return baseBreakdownGenerators['Bolt Bearing'];
    if (name.includes('Web Bolt Group Shear (ICR)')) return baseBreakdownGenerators['Web Bolt Group Shear (ICR)'];
    if (name.includes('Shear Yield')) return baseBreakdownGenerators['Shear Yield'];
    if (name.includes('Web Bolt Slip')) return baseBreakdownGenerators['Web Bolt Slip'];
    if (name.includes('Shear Rupture')) return baseBreakdownGenerators['Shear Rupture'];
    if (name.includes('Flexural Rupture')) return baseBreakdownGenerators['Beam Flexural Rupture'];
    if (name.includes('Flexural Yielding')) return baseBreakdownGenerators['Beam Flexural Yielding'];
    if (name.includes('Web Bolt Tension with Prying')) return baseBreakdownGenerators['Web Bolt Tension with Prying'];
    if (name.includes('Beam Flange Tensile Rupture')) return baseBreakdownGenerators['NSF']; // Reuse the plate NSF breakdown
    if (name.includes('Plate Thickness for Prying')) return baseBreakdownGenerators['Plate Thickness for Prying'];

    // Fallback
    return () => 'Breakdown not available for this check.';
}

/**
 * Generates the HTML for a specific check's breakdown.
 * This function acts as a bridge between the rendering logic and the individual breakdown generators.
 * @param {string} name - The name of the check.
 * @param {object} data - The data object for the check, containing demand, check results, and details.
 * @param {object} inputs - The full user inputs object.
 * @returns {string} The generated HTML string for the breakdown.
 */
function generateSpliceBreakdownHtml(name, data, inputs) {
    const { check } = data;
    const { design_method } = inputs;

    // Create a common context object to pass to the breakdown generators.
    const common = {
        inputs,
        fmt: (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A',
        format_list: (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`,
        factor_char: design_method === 'LRFD' ? '&phi;' : '&Omega;',
        factor_val: design_method === 'LRFD' ? (check?.phi ?? 0.9) : (check?.omega ?? 1.67),
        capacity_eq: design_method === 'LRFD' ? `&phi;R<sub>n</sub>` : `R<sub>n</sub> / &Omega;`,
        final_capacity: design_method === 'LRFD' ? (check?.Rn || 0) * (check?.phi ?? 0.75) : (check?.Rn || 0) / (check?.omega || 2.00)
    };

    // Get the specific generator function for this check name and execute it.
    const generator = getBreakdownGenerator(name);
    return generator(data, common);
}

async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    if (!shapeSelect) return;
    const shapeTypeSelect = document.getElementById('member_shape_type');
    const selectedShapeType = shapeTypeSelect ? shapeTypeSelect.value : 'W-Shape';

    try {
        // Fetch shapes based on the selected type (W, S, HP, M)
        const shapes = await AISC_SPEC.getShapesByType(selectedShapeType);
        const shapeNames = Object.keys(shapes).sort();

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
        }

    } catch (error) {
        console.error("Failed to populate shape dropdown:", error);
        shapeSelect.innerHTML = '<option value="">Could not load shapes</option>';
    }
}

async function handleShapeSelection() {
    const shapeName = document.getElementById('aisc_shape_select').value;
    const memberInputs = ['member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Zx', 'member_Sx'];

    if (!shapeName) {
        memberInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.readOnly = false;
        });
        return;
    }

    const shape = await AISC_SPEC.getShape(shapeName);
    if (!shape) return;

    const propertyMap = {
        'member_d': shape.d, 'member_bf': shape.bf, 'member_tf': shape.tf, 'member_tw': shape.tw,
        'member_Zx': shape.Zx, 'member_Sx': shape.Sx
    };

    Object.keys(propertyMap).forEach(id => {
        const el = document.getElementById(id);
        if (el && propertyMap[id] !== undefined) {
            el.value = propertyMap[id];
            el.readOnly = true;
        }
    });
}

/**
 * Populates bolt diameter dropdowns with typical sizes from the AISC database.
 * It targets select elements with a `data-is-bolt-diameter-select="true"` attribute.
 */
function populateBoltDiameterDropdowns() {
    if (typeof AISC_SPEC === 'undefined' || !AISC_SPEC.getTypicalBoltSizes) {
        console.warn("AISC_SPEC or getTypicalBoltSizes not available for populateBoltDiameterDropdowns.");
        return;
    }

    const boltSizes = AISC_SPEC.getTypicalBoltSizes();
    if (!boltSizes) {
        console.warn("getTypicalBoltSizes() returned no data.");
        return;
    }

    const boltOptions = Object.entries(boltSizes).map(([decimal, fractional]) =>
        `<option value="${decimal}">${fractional} (${decimal}")</option>`
    ).join('');

    document.querySelectorAll('select[data-is-bolt-diameter-select="true"]').forEach(select => {
        select.innerHTML = boltOptions;
        if (!select.value) select.value = '0.875'; // Set a common default (7/8") if no value is set
    });
}

function getAllInputIdsOnPage() {
    const ids = new Set();
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => ids.add(el.id));
    return Array.from(ids);
}

function renderLoadSummary(rawInputs, final_loads, demands, inputs) {
    const { M_load, V_load, Axial_load } = final_loads;
    const { total_flange_demand_tension, total_flange_demand_compression, Hw, moment_arm_flange, flange_force_from_moment, axial_per_flange, Mu_resisted_by_web } = demands;
    const isCapacityDesign = rawInputs.develop_capacity_check;
    const loadNote = isCapacityDesign ? ' (Calculated from Member Capacity)' : ' (User Input)';

    const rows = [
        { cells: ['Design Moment (M)', `${M_load.toFixed(2)} kip-ft`, loadNote]},
        { cells: ['Design Shear (V)', `${V_load.toFixed(2)} kips`, loadNote] },
        { cells: ['Design Axial (P)', `${Axial_load.toFixed(2)} kips`, '(User Input)'] },
        { type: 'subheader', content: 'Load Distribution' },
        { cells: ['&nbsp;&nbsp;&nbsp;Flange Force from Moment', `T<sub>M</sub> = M / (d-t<sub>f</sub>) = (${M_load.toFixed(2)}*12) / ${moment_arm_flange.toFixed(3)}`, `${flange_force_from_moment.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Flange Force from Axial', `T<sub>P</sub> = P / 2 = ${Axial_load.toFixed(2)} / 2`, `${axial_per_flange.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Total Flange Tension', 'T<sub>u</sub> = T<sub>M</sub> + T<sub>P</sub>', `${total_flange_demand_tension.toFixed(2)} kips`]},
        { cells: ['&nbsp;&nbsp;&nbsp;Total Flange Compression', 'C<sub>u</sub> = T<sub>M</sub> - T<sub>P</sub>', `${total_flange_demand_compression.toFixed(2)} kips`]},
        { type: 'subheader', content: 'Web Splice Forces' },
        { cells: ['&nbsp;&nbsp;&nbsp;Shear on Web Splice', 'V<sub>web</sub> = V', `${V_load.toFixed(2)} kips`]},
        { cells: ['&nbsp;&nbsp;&nbsp;Moment Resisted by Web', 'M<sub>web</sub> = M<sub>total</sub> - M<sub>flange_splice</sub>', `${Mu_resisted_by_web.toFixed(2)} kip-in`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Horizontal Force on Web', 'H<sub>w</sub> = M<sub>web</sub> / (0.75 * H<sub>wp</sub>)', `${Hw.toFixed(2)} kips`]}
    ].map(row => row.type === 'subheader' ? row : { ...row, cells: row.cells.map(cell => cell || '') }); // Ensure all cells are strings

    return {
        title: 'Load Summary',
        table: { headers: ['Load Type / Distribution', 'Calculation', 'Magnitude'], rows: rows }
    };
}

function renderSpliceInputSummary(inputs) {
    const {
        design_method, gap,
        member_d, member_bf, member_tf, member_tw, member_Fy, member_Fu,
        num_flange_plates, H_fp, t_fp, L_fp, flange_plate_Fy, flange_plate_Fu,
        H_fp_inner, t_fp_inner, L_fp_inner,
        Nc_fp, Nr_fp, D_fp, bolt_grade_fp, threads_included_fp, S1_col_spacing_fp, S2_row_spacing_fp, S3_end_dist_fp, g_gage_fp,
        num_web_plates, H_wp, t_wp, L_wp, web_plate_Fy, web_plate_Fu,
        Nc_wp, Nr_wp, D_wp, bolt_grade_wp, threads_included_wp, S4_col_spacing_wp, S5_row_spacing_wp, S6_end_dist_wp
    } = inputs;

    const sections = [
        {
            title: 'General & Member Properties',
            rows: [
                { cells: ['Design Method', design_method] },
                { cells: ['Splice Gap', `${gap}"`] },
                { cells: ['Member', `W-Shape (d=${member_d}", b<sub>f</sub>=${member_bf}", t<sub>f</sub>=${member_tf}", t<sub>w</sub>=${member_tw}")`] },
                { cells: ['Member Material', `F<sub>y</sub>=${member_Fy} ksi, F<sub>u</sub>=${member_Fu} ksi`] }
            ]
        },
    ];

    if (num_flange_plates > 0) {
        sections.push({
            title: 'Flange Splice Details',
            rows: [
                { cells: ['Outer Plate', `PL ${H_fp}" &times; ${L_fp * 2}" &times; ${t_fp}"`] },
                { cells: ['Outer Plate Material', `F<sub>y</sub>=${flange_plate_Fy} ksi, F<sub>u</sub>=${flange_plate_Fu} ksi`] },
                ...(num_flange_plates == 2 ? [
                    { cells: ['Inner Plate', `PL ${H_fp_inner}" &times; ${L_fp_inner * 2}" &times; ${t_fp_inner}"`] },
                    { cells: ['Inner Plate Material', `F<sub>y</sub>=${flange_plate_Fy_inner} ksi, F<sub>u</sub>=${flange_plate_Fu_inner} ksi`] }
                ] : [])
            ]
        });
        sections.push({
            title: 'Flange Bolt Details',
            rows: [
                { cells: ['Configuration', `${Nc_fp * Nr_fp * 2} bolts per side (${Nc_fp} cols &times; ${2 * Nr_fp} rows)`] },
                { cells: ['Bolt Details', `&empty;${D_fp}" ${bolt_grade_fp} (${threads_included_fp ? 'Threads Included' : 'Threads Excluded'})`] },
                { cells: ['Spacing (Pitch, S1)', `${S1_col_spacing_fp}"`] },
                { cells: ['Spacing (Gage, g)', `${g_gage_fp}"`] },
                { cells: ['Spacing (Row, S2)', `${S2_row_spacing_fp}"`] },
                { cells: ['End Distance (S3)', `${S3_end_dist_fp}"`] }
            ]
        });
    }
    if (num_web_plates > 0) {
        sections.push({
            title: 'Web Splice Details',
            rows: [
                { cells: ['Web Plate(s)', `${num_web_plates} &times; PL ${H_wp}" &times; ${L_wp * 2}" &times; ${t_wp}"`] },
                { cells: ['Web Plate Material', `F<sub>y</sub>=${web_plate_Fy} ksi, F<sub>u</sub>=${web_plate_Fu} ksi`] }
            ]
        },
        {
            title: 'Web Bolt Details',
            rows: [
                { cells: ['Configuration', `${Nc_wp * Nr_wp} bolts per side (${Nc_wp} cols &times; ${Nr_wp} rows)`] },
                { cells: ['Bolt Details', `&empty;${D_wp}" ${bolt_grade_wp} (${threads_included_wp ? 'Threads Included' : 'Threads Excluded'})`] },
                { cells: ['Spacing (Pitch, S4)', `${S4_col_spacing_wp}"`] },
                { cells: ['Spacing (Gage, S5)', `${S5_row_spacing_wp}"`] },
                { cells: ['End Distance (S6)', `${S6_end_dist_wp}"`] }
            ]
        });
    }
    return sections;
}

function renderResults(results, rawInputs) {
    const { checks, geomChecks, inputs, final_loads, demands } = results; // `inputs` here are the potentially modified ones from the calc
    const report = new ReportBuilder({
        reportId: 'splice-report-content',
        title: 'Splice Check Results',
        warnings: results.optimizationLog
    });

    // --- Geometry Checks Table ---
    const geomRows = [];
    const addGeomRow = (name, data, isMaxCheck = false) => {
        const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const limit_val = isMaxCheck ? (data.max ?? 'N/A') : (data.min ?? 'N/A');
        const limit_label = isMaxCheck ? 'Maximum' : 'Minimum';
        geomRows.push({ cells: [`${name} (${limit_label})`, data.actual.toFixed(3), limit_val.toFixed(3), status] });
    };
    
    // FIX: Add checks to ensure geomChecks properties exist before accessing them.
    if (geomChecks['Flange Bolts']) {
        addGeomRow('Flange Bolt Edge Distance (Long.)', geomChecks['Flange Bolts'].edge_dist_long);
        addGeomRow('Flange Bolt Edge Distance (Tran.)', geomChecks['Flange Bolts'].edge_dist_tran);
        addGeomRow('Flange Bolt Edge Distance (Gap Side)', geomChecks['Flange Bolts'].edge_dist_gap);
        addGeomRow('Flange Bolt Spacing (Pitch)', geomChecks['Flange Bolts'].spacing_col);
        addGeomRow('Flange Bolt Spacing (Gage)', geomChecks['Flange Bolts'].spacing_gage);
        addGeomRow('Flange Bolt Spacing (Pitch)', geomChecks['Flange Bolts'].max_spacing_col, true);
        addGeomRow('Flange Bolt Spacing (Gage)', geomChecks['Flange Bolts'].max_spacing_row, true);
    }
    if (geomChecks['Web Bolts']) {
        addGeomRow('Web Bolt Edge Distance (Long.)', geomChecks['Web Bolts'].edge_dist_long);
        addGeomRow('Web Bolt Edge Distance (Tran.)', geomChecks['Web Bolts'].edge_dist_tran);
        addGeomRow('Web Bolt Edge Distance (Gap Side)', geomChecks['Web Bolts'].edge_dist_gap);
        addGeomRow('Web Bolt Spacing (Pitch)', geomChecks['Web Bolts'].spacing_col);
        addGeomRow('Web Bolt Spacing (Gage)', geomChecks['Web Bolts'].spacing_row);
        addGeomRow('Web Bolt Spacing (Pitch)', geomChecks['Web Bolts'].max_spacing_col, true);
        addGeomRow('Web Bolt Spacing (Gage)', geomChecks['Web Bolts'].max_spacing_row, true);
    }
    
    report.addTableSection('Geometry & Spacing Checks (AISC J3)', { headers: ['Item', 'Actual (in)', 'Limit (in)', 'Status'], rows: geomRows });

    // --- Load Summary Table ---
    const loadSummaryData = renderLoadSummary(rawInputs, final_loads, demands, inputs);
    report.addTableSection(loadSummaryData.title, loadSummaryData.table);

    // --- Strength Checks Table ---
    const strengthRows = [];
    let checkCounter = 0;
    const addStrengthRow = (name, data, isHeader = false) => {
        if (!data || !data.check) return;

        if (isHeader) {
            strengthRows.push({ type: 'subheader', content: name });
            return;
        }

        checkCounter++;
        const detailId = `details-${checkCounter}`;
        const { demand, check } = data;
        const { Rn, phi, omega } = check;
        const capacity = Rn || 0;
        const design_capacity_raw = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

        let ratio, status, display_demand, display_capacity;

        if (name === 'Plate Thickness for Prying') {
            // For this check, demand is the required thickness (Rn) and capacity is the provided thickness (demand).
            display_demand = design_capacity_raw; // The required thickness (tc) is stored in Rn
            display_capacity = demand; // The provided thickness is stored in the demand field
            ratio = display_capacity > 0 ? display_demand / display_capacity : Infinity;
        } else {
            display_demand = demand;
            display_capacity = design_capacity_raw;
            ratio = display_capacity > 0 ? Math.abs(display_demand) / display_capacity : Infinity;
        }
        status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';

        let demand_unit = 'kips', capacity_unit = 'kips';
        if (name === 'Plate Thickness for Prying') { demand_unit = 'in (req)'; capacity_unit = 'in'; }
        if (name.includes('Flexural')) { display_demand /= 12.0; display_capacity /= 12.0; demand_unit = 'kip-ft'; capacity_unit = 'kip-ft'; }

        const breakdownHtml = generateSpliceBreakdownHtml(name, data, inputs);

        strengthRows.push({
            cells: [
                `${name}`, // The [Show] button will be added by ReportBuilder
                `${display_demand.toFixed(2)} ${demand_unit}`,
                `${display_capacity.toFixed(2)} ${capacity_unit}`,
                ratio.toFixed(3),
                status
            ],
            details: breakdownHtml
        });
    };

    // Define specific check lists for each section to render them in order.
    const flangePlateChecks = [
        'Flange Bolt Shear',
        'Flange Bolt Tension with Prying',
        'Plate Thickness for Prying',
        'Outer Plate GSY',
        'Outer Plate Compression',
        'Outer Plate NSF',
        'Outer Plate Block Shear',
        'Outer Plate Bolt Bearing',
        'Inner Plate GSY',
        'Inner Plate Compression',
        'Inner Plate NSF',
        'Inner Plate Block Shear',
        'Inner Plate Bolt Bearing'
    ];

    const webPlateChecks = [
        'Web Bolt Group Shear (ICR)', // This was already correct
        'Web Bolt Slip',
        'Web Plate Flexural Yielding',
        'Web Plate Flexural Rupture',
        'Web Bolt Tension with Prying',
        'Web Plate Gross Shear Yield',
        'Web Plate Net Shear Rupture',
        'Web Plate Block Shear',
        'Web Plate Bolt Bearing',
    ];

    const memberChecks = [
        'Beam Flange Tensile Rupture',
        'Beam Flange Block Shear',
        'Beam Flange Bolt Bearing',
        'Beam Web Bolt Bearing',
        'Beam Flexural Yielding',
        'Beam Flexural Rupture',
        'Beam Web Shear Yielding',
        'Beam Web Shear Rupture',
        'Beam Section Tensile Rupture'
    ];

    // Conditionally render Flange Plate checks
    if (inputs.num_flange_plates > 0) {
        addStrengthRow('Flange Plate Checks', null, true);
        flangePlateChecks.forEach(name => {
            if (checks[name]) {
                addStrengthRow(name, checks[name]);
            }
        });
    }

    // Conditionally render Web Plate checks
    if (inputs.num_web_plates > 0) {
        addStrengthRow('Web Plate Checks', null, true);
        webPlateChecks.forEach(name => {
            if (checks[name]) {
                addStrengthRow(name, checks[name]);
            }
        });
    }

    addStrengthRow('Member Checks (at Splice)', null, true);
    memberChecks.forEach(name => {
        if (checks[name]) {
            addStrengthRow(name, checks[name]);
        }
    });

    const inputSummarySections = renderSpliceInputSummary(rawInputs);
    inputSummarySections.forEach(section => {
        report.addTableSection(section.title, { headers: ['Parameter', 'Value'], rows: section.rows });
    });

    report.addTableSection(`Strength Checks (${inputs.design_method})`, {
        headers: ['Limit State', 'Demand', 'Capacity', 'Ratio', 'Status'],
        rows: strengthRows.map(row => {
            // The ReportBuilder expects a specific object structure.
            // We map the generated rows to this structure.
            if (row.type === 'subheader') return row; // Pass subheaders through
            return { cells: row.cells, details: row.details };
        })
    });

    report.render('results-container');
}

// --- Input Gathering and Orchestration (Legacy, kept for reference) ---
const inputIds = [
    'design_method', 'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Fy', 'member_Fu',
    'member_material', 'member_Zx', 'member_Sx', 'M_load', 'V_load', 'Axial_load', 'develop_capacity_check', 'deformation_is_consideration', 'g_gage_fp', 'optimize_bolts_check', 'optimize_diameter_check', 'optimize_web_plates_check', 'optimize_flange_plates_check',
    'member_shape_type', 'num_flange_plates', 'flange_plate_material', 'flange_plate_Fy', 'flange_plate_Fu', 'H_fp', 't_fp', 'L_fp',
    'flange_plate_material_inner', 'flange_plate_Fy_inner', 'flange_plate_Fu_inner', 'H_fp_inner', 't_fp_inner', 'L_fp_inner',
    'Nc_fp', 'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp',
    'num_web_plates', 'web_plate_material', 'web_plate_Fy', 'web_plate_Fu', 'H_wp', 't_wp', 'L_wp', 'connection_type', 'faying_surface_class',
    'Nc_wp', 'Nr_wp', 'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp',
    'D_fp', 'bolt_grade_fp', 'threads_included_fp', 'D_wp', 'bolt_grade_wp', 'threads_included_wp',
    'aisc_shape_select' // Added shape select to the list
];

const handleRunSpliceCheck = createCalculationHandler({
    inputIds: inputIds,
    storageKey: 'splice-inputs',
    validationRuleKey: 'splice',
    validatorFunction: spliceCalculator.validateSpliceInputs,
    calculatorFunction: (rawInputs) => spliceCalculator.run(rawInputs),
    renderFunction: renderResults,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn',
    reportId: 'splice-report-content',
    filenamePrefix: 'Splice-Check-Report'
});

initializeApp({
    inputIds: inputIds,
    calculationHandler: handleRunSpliceCheck,
    // Expose private functions for unit testing
    __test_exports__: {
        checkBoltShear: spliceCalculator.checkBoltShear,
        checkBlockShear: spliceCalculator.checkBlockShear
    },
    onReady: () => {
    populateMaterialDropdowns();
    populateBoltGradeDropdowns();
    populateBoltDiameterDropdowns();
    populateShapeDropdown();
    document.getElementById('member_shape_type').addEventListener('change', populateShapeDropdown);
    document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);

        // --- Dimension Toggle Logic ---
        const toggleDimensionsBtn = document.getElementById('toggle-dimensions-btn');
        if (toggleDimensionsBtn) {
            toggleDimensionsBtn.addEventListener('click', () => {
                if (dimensionElements) {
                    areDimensionsVisible = !areDimensionsVisible;
                    dimensionElements.meshes.forEach(mesh => { if (mesh) mesh.isVisible = areDimensionsVisible; });
                    dimensionElements.labels.forEach(label => { if (label) label.isVisible = areDimensionsVisible; });
                    toggleDimensionsBtn.textContent = areDimensionsVisible ? 'Hide Dimensions' : 'Show Dimensions';
                }
            });
        }

        // --- Attach event listeners for DYNAMIC diagram updates with debouncing ---
        const debouncedRedraw3D = debounce(draw3dSpliceDiagram, 300);
        diagramInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const redraw = () => {
                    // Redraw both 2D and 3D diagrams on any relevant input change
                    draw2dSpliceDiagram();
                    debouncedRedraw3D();
                };
                el.addEventListener('input', redraw);
                el.addEventListener('change', redraw);
            }
        });

        // Initial draw
        setTimeout(draw3dSpliceDiagram, 100);
        setTimeout(draw2dSpliceDiagram, 100);

        // --- 2D Diagram Panning Logic ---
        const svg2d = document.getElementById('splice-2d-diagram');
        if (svg2d) {
            svg2d.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Only pan with left-click
                splice2dIsPanning = true;
                splice2dStartPoint = { x: e.clientX, y: e.clientY };
                svg2d.classList.add('is-grabbing');
            });
            svg2d.addEventListener('mousemove', (e) => {
                if (!splice2dIsPanning) return;
                const dx = (e.clientX - splice2dStartPoint.x) / splice2dPan.scale;
                const dy = (e.clientY - splice2dStartPoint.y) / splice2dPan.scale;
                const group = svg2d.querySelector('#splice-2d-pan-group');
                if (group) {
                    group.setAttribute('transform', `translate(${splice2dPan.x + dx}, ${splice2dPan.y + dy}) scale(${splice2dPan.scale})`);
                }
            });
            const stopPanning = (e) => {
                if (!splice2dIsPanning) return;
                splice2dIsPanning = false;
                svg2d.classList.remove('is-grabbing');
                splice2dPan.x += (e.clientX - splice2dStartPoint.x) / splice2dPan.scale;
                splice2dPan.y += (e.clientY - splice2dStartPoint.y) / splice2dPan.scale;
            };
            svg2d.addEventListener('mouseup', stopPanning);
            svg2d.addEventListener('mouseleave', stopPanning);

            svg2d.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomFactor = 1.1;
                const oldScale = splice2dPan.scale;
                const newScale = e.deltaY < 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
                splice2dPan.scale = Math.max(0.1, Math.min(10, newScale)); // Clamp zoom

                const pt = svg2d.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const svgP = pt.matrixTransform(svg2d.getScreenCTM().inverse());

                splice2dPan.x = svgP.x - (svgP.x - splice2dPan.x) * (splice2dPan.scale / oldScale);
                splice2dPan.y = svgP.y - (svgP.y - splice2dPan.y) * (splice2dPan.scale / oldScale);

                const group = svg2d.querySelector('#splice-2d-pan-group');
                if (group) {
                    group.setAttribute('transform', `translate(${splice2dPan.x}, ${splice2dPan.y}) scale(${splice2dPan.scale})`);
                }
            });
        }
    }
});
