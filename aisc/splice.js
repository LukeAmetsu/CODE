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
    const { diameter, thickness, position } = options;
    if (!diameter || !thickness || isNaN(diameter) || isNaN(thickness)) return null;

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
    if (inputs.L_fp > 0 && inputs.H_fp > 0 && inputs.t_fp > 0) {
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
    for (let i = 0; i < inputs.num_web_plates; i++) {
        if (inputs.L_wp > 0 && inputs.H_wp > 0 && inputs.t_wp > 0) {
            const webPlate = BABYLON.MeshBuilder.CreateBox(`wp_${i}`, { width: inputs.t_wp, height: inputs.H_wp, depth: inputs.L_wp }, bjsScene);
            webPlate.material = plateMaterial;
            const offset = (inputs.member_tw / 2 + inputs.t_wp / 2 + (i > 0 ? inputs.t_wp : 0));
            webPlate.position.x = i % 2 === 0 ? offset : -offset;
            shadowGenerator.addShadowCaster(webPlate);
            webPlate.receiveShadows = true;
        }
    }

    // --- Bolt Creation ---
    const createWebBoltGroup = () => {
        const { D_wp: D, Nc_wp: Nc, Nr_wp: Nr, S4_col_spacing_wp: S_col, S5_row_spacing_wp: S_row, S6_end_dist_wp: S_end } = inputs;
        if (!D || !Nc || !Nr) return;

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
                        bolt.rotation.z = Math.PI / 2; // Orient horizontally
                        shadowGenerator.addShadowCaster(bolt);
                    }
                }
            }
        }
    };

    const createFlangeBoltGroup = () => {
        const { D_fp: D, Nc_fp: Nc, Nr_fp: Nr, S1_col_spacing_fp: S_col, g_gage_fp: gage, S3_end_dist_fp: S_end, num_flange_plates, t_fp, member_tf, t_fp_inner, member_d } = inputs;
        if (!D || !Nc || !Nr) return;

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

// --- Main Calculator Logic (DOM interaction and event handling) ---
const spliceCalculator = (() => {
/**
 * Main calculation orchestration function.
 * It takes raw string inputs from the DOM, converts them to numbers,
 * handles optimization logic, and calls the appropriate check functions.
 * @param {object} rawInputs - The inputs object gathered from the DOM.
 * @returns {object} The complete results object.
 */
function run(rawInputs) {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
    const { PI, sqrt, min, max, abs } = Math;
    const E_MOD = 29000.0; // ksi
    
    // Define a zero-value check object to use as a fallback for bearing calculations.
    const zero_bearing_check = { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };
    

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
    }    // Expose private functions for unit testing
    const __test_exports__ = { checkBoltShear, checkBlockShear };
    return { run, __test_exports__ };}
})();
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

function validateSpliceInputs(inputs) {
    const { errors, warnings } = validateInputs(inputs, validationRules.splice);

    // --- Flange Splice ---
    if (inputs.H_fp < inputs.g_gage_fp) {
        errors.push("Flange plate width (H_fp) must be greater than or equal to the bolt gage (g).");
    }
    const flange_bolt_pattern_length = inputs.S3_end_dist_fp + (inputs.Nc_fp > 1 ? (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp : 0);
    if (flange_bolt_pattern_length > inputs.L_fp / 2) {
        errors.push("Flange bolt pattern length exceeds half the plate length (L_fp/2). Increase L_fp or reduce bolt spacing/end distance.");
    }
    if (inputs.H_fp > inputs.member_bf) {
        warnings.push("Flange plate width (H_fp) is wider than the member flange (bf). This is unusual.");
    }

    // --- Web Splice ---
    const web_bolt_pattern_height = (inputs.Nr_wp > 1 ? (inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp : 0);
    if (web_bolt_pattern_height > inputs.H_wp) {
        errors.push("Web bolt pattern height exceeds the web plate height (H_wp).");
    }
    const web_bolt_pattern_length = inputs.S6_end_dist_wp + (inputs.Nc_wp > 1 ? (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp : 0);
    if (web_bolt_pattern_length > inputs.L_wp / 2) {
        errors.push("Web bolt pattern length exceeds half the plate length (L_wp/2). Increase L_wp or reduce bolt spacing/end distance.");
    }
    const clear_web_depth = inputs.member_d - 2 * inputs.member_tf;
    if (inputs.H_wp > clear_web_depth) {
        errors.push(`Web plate height (H_wp = ${inputs.H_wp}") cannot be greater than the clear web depth of the member (${clear_web_depth.toFixed(2)}").`);
    }

    return { errors, warnings };
}


function populateMaterialDropdowns() {
    const materialOnChange = (e) => {
        const grade = AISC_SPEC.getSteelGrade(e.target.value);
        if (grade) {
            if (e.target.dataset.fyTarget) document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
            if (e.target.dataset.fuTarget) document.getElementById(e.target.dataset.fuTarget).value = grade.Fu;
        }
    };

    const configs = [
        { ids: ['member_material'], options: AISC_SPEC.structuralSteelGrades, defaultValue: 'A992', onChange: materialOnChange },
        { ids: ['flange_plate_material', 'flange_plate_material_inner', 'web_plate_material'], options: AISC_SPEC.structuralSteelGrades, defaultValue: 'A36', onChange: materialOnChange },
    ];

    configs.forEach(config => {
        const optionsHtml = Object.keys(config.options).map(key => `<option value="${key}">${key}</option>`).join('');
        config.ids.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.innerHTML = optionsHtml;
                if (config.defaultValue) select.value = config.defaultValue;
                if (config.onChange) {
                    select.addEventListener('change', config.onChange);
                    select.dispatchEvent(new Event('change'));
                }
            }
        });
    });
}

function populateBoltGradeDropdowns() {
    const boltGradeOptions = Object.keys(AISC_SPEC.boltGrades).map(grade => `<option value="${grade}">${grade}</option>`).join('');
    ['bolt_grade_fp', 'bolt_grade_wp'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            select.innerHTML = boltGradeOptions;
            select.value = 'A325';
        }
    });
}

async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    if (!shapeSelect) return;

    try {
        // Splice calculator is for I-shapes
        const shapes = await AISC_SPEC.getShapesByType('I-Shape');
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

function getAllInputIdsOnPage() {
    const ids = new Set();
    document.querySelectorAll('input[id], select[id]').forEach(el => ids.add(el.id));
    return Array.from(ids);
}

function renderLoadSummary(rawInputs, final_loads, demands, inputs) {
    const { M_load, V_load, Axial_load } = final_loads;
    const { total_flange_demand_tension, total_flange_demand_compression, Hw, moment_arm_flange, flange_force_from_moment, axial_per_flange, Mu_resisted_by_web } = demands;
    const isCapacityDesign = rawInputs.develop_capacity_check;
    const loadNote = isCapacityDesign ? ' (Calculated from Member Capacity)' : ' (User Input)';

    const rows = [
        { cells: ['Design Moment (M)', `${M_load.toFixed(2)} kip-ft`, loadNote] },
        { cells: ['Design Shear (V)', `${V_load.toFixed(2)} kips`, loadNote] },
        { cells: ['Design Axial (P)', `${Axial_load.toFixed(2)} kips`, '(User Input)'] },
        { type: 'subheader', content: 'Load Distribution' },
        { cells: ['&nbsp;&nbsp;&nbsp;Flange Force from Moment', `T<sub>M</sub> = M / (d-t<sub>f</sub>) = (${M_load.toFixed(2)}*12) / ${moment_arm_flange.toFixed(3)}`, `${flange_force_from_moment.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Flange Force from Axial', `T<sub>P</sub> = P / 2 = ${Axial_load.toFixed(2)} / 2`, `${axial_per_flange.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Total Flange Tension', 'T<sub>u</sub> = T<sub>M</sub> + T<sub>P</sub>', `<b>${total_flange_demand_tension.toFixed(2)} kips</b>`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Total Flange Compression', 'C<sub>u</sub> = T<sub>M</sub> - T<sub>P</sub>', `<b>${total_flange_demand_compression.toFixed(2)} kips</b>`] },
        { type: 'subheader', content: 'Web Splice Demands' },
        { cells: ['&nbsp;&nbsp;&nbsp;Shear on Web Splice', 'V<sub>web</sub> = V', `<b>${V_load.toFixed(2)} kips</b>`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Moment Resisted by Web', 'M<sub>web</sub> = M<sub>total</sub> - M<sub>flange_splice</sub>', `${Mu_resisted_by_web.toFixed(2)} kip-in`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Horizontal Force on Web', 'H<sub>w</sub> = M<sub>web</sub> / (0.75 * H<sub>wp</sub>)', `<b>${Hw.toFixed(2)} kips</b>`] },
    ];

    return {
        headers: ['Load Type / Distribution', 'Calculation', 'Magnitude'],
        rows: rows
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
        {
            title: 'Flange Splice Details',
            rows: [
                { cells: ['Outer Plate', `PL ${H_fp}" &times; ${L_fp * 2}" &times; ${t_fp}"`] },
                { cells: ['Outer Plate Material', `F<sub>y</sub>=${flange_plate_Fy} ksi, F<sub>u</sub>=${flange_plate_Fu} ksi`] },
                ...(num_flange_plates == 2 ? [
                    { cells: ['Inner Plate', `2 x PL ${H_fp_inner}" &times; ${L_fp_inner * 2}" &times; ${t_fp_inner}"`] },
                    { cells: ['Inner Plate Material', `F<sub>y</sub>=${flange_plate_Fy_inner} ksi, F<sub>u</sub>=${flange_plate_Fu_inner} ksi`] }
                ] : [])
            ]
        },
        {
            title: 'Flange Bolt Details',
            rows: [
                { cells: ['Configuration', `${Nc_fp * Nr_fp * 4} total bolts (${2 * Nc_fp} cols &times; ${2 * Nr_fp} rows)`] },
                { cells: ['Bolt Details', `&empty;${D_fp}" ${bolt_grade_fp} (${threads_included_fp ? 'Threads Included' : 'Threads Excluded'})`] },
                { cells: ['Spacing (Pitch, S1)', `${S1_col_spacing_fp}"`] },
                { cells: ['Spacing (Gage, g)', `${g_gage_fp}"`] },
                { cells: ['Spacing (Row, S2)', `${S2_row_spacing_fp}"`] },
                { cells: ['End Distance (S3)', `${S3_end_dist_fp}"`] }
            ]
        },
        {
            title: 'Web Splice Details',
            rows: [
                { cells: ['Web Plate(s)', `${num_web_plates} &times; PL ${H_wp}" &times; ${L_wp * 2}" &times; ${t_wp}"`] },
                { cells: ['Web Plate Material', `F<sub>y</sub>=${web_plate_Fy} ksi, F<sub>u</sub>=${web_plate_Fu} ksi`] }
            ]
        },
        {
            title: 'Web Bolt Details',
            rows: [
                { cells: ['Configuration', `${Nc_wp * Nr_wp * 2} total bolts (${2 * Nc_wp} cols &times; ${2 * Nr_wp} rows)`] },
                { cells: ['Bolt Details', `&empty;${D_wp}" ${bolt_grade_wp} (${threads_included_wp ? 'Threads Included' : 'Threads Excluded'})`] },
                { cells: ['Spacing (Pitch, S4)', `${S4_col_spacing_wp}"`] },
                { cells: ['Spacing (Gage, S5)', `${S5_row_spacing_wp}"`] },
                { cells: ['End Distance (S6)', `${S6_end_dist_wp}"`] }
            ]
        }
    ];

    return sections.map(sec => `<table class="w-full mt-2 summary-table"><caption class="report-caption">${sec.title}</caption><tbody>${sec.rows.map(r => `<tr><td>${r.cells[0]}</td><td>${r.cells[1]}</td></tr>`).join('')}</tbody></table>`).join('');
}

function renderSpliceResults(results, rawInputs) {
    const { checks, geomChecks, inputs, final_loads, demands, optimizationLog } = results;

    const report = new ReportBuilder({
        reportId: 'splice-report-content',
        title: 'Splice Check Results'
    });

    report.addSection('Input Summary', renderSpliceInputSummary(rawInputs), 'splice-input-summary-section');

    if (optimizationLog && optimizationLog.length > 0) {
        const optimizationHtml = `<div class="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 my-4 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-600" id="optimization-log-section">
            <p class="font-bold">Optimization Log</p>
            <ul class="list-disc list-inside mt-2 text-sm">${optimizationLog.map(log => `<li>${log}</li>`).join('')}</ul>
        </div>`;
        report.addSection(null, optimizationHtml);
    }

    const geomRows = Object.entries(geomChecks).flatMap(([groupName, groupChecks]) => 
        Object.entries(groupChecks).map(([checkName, data]) => {
            const isMaxCheck = checkName.startsWith('max_');
            const status = data.pass ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>';
            const limit_label = isMaxCheck ? 'Maximum' : 'Minimum';
            const name = `${groupName.replace(' Bolts', '')} ${checkName.replace(/_/g, ' ')} (${limit_label})`;
            return { cells: [name, data.actual.toFixed(3), (isMaxCheck ? data.max : data.min).toFixed(3), status] };
        })
    );
    report.addTableSection('Geometry & Spacing Checks (AISC J3)', {
        headers: ['Item', 'Actual (in)', 'Limit (in)', 'Status'],
        rows: geomRows
    }, 'splice-geom-checks-section');

    report.addTableSection('Load Summary', renderLoadSummary(rawInputs, final_loads, demands, inputs), 'splice-load-summary-section');

    const strengthCheckSections = {
        'Flange Plate Checks': [
            'Flange Bolt Shear', 'Flange Bolt Tension with Prying', 'Plate Thickness for Prying',
            'Outer Plate GSY', 'Outer Plate Compression', 'Outer Plate NSF', 'Outer Plate Block Shear', 'Outer Plate Bolt Bearing',
            'Inner Plate GSY', 'Inner Plate Compression', 'Inner Plate NSF', 'Inner Plate Block Shear', 'Inner Plate Bolt Bearing'
        ],
        'Web Plate Checks': [
            'Web Bolt Group Shear (ICR)', 'Web Bolt Slip', 'Web Plate Flexural Yielding', 'Web Plate Flexural Rupture',
            'Web Bolt Tension with Prying', 'Web Plate Gross Shear Yield', 'Web Plate Net Shear Rupture', 'Web Plate Block Shear', 'Web Plate Bolt Bearing'
        ],
        'Member Web and Flange Checks': [
            'Beam Flange Tensile Rupture', 'Beam Flange Block Shear', 'Beam Flange Bolt Bearing', 'Beam Web Bolt Bearing',
            'Beam Flexural Yielding', 'Beam Flexural Rupture', 'Beam Web Shear Yielding', 'Beam Web Shear Rupture', 'Beam Section Tensile Rupture'
        ]
    };

    const strengthRows = [];
    for (const [sectionTitle, checkNames] of Object.entries(strengthCheckSections)) {
        const sectionHasChecks = checkNames.some(name => checks[name]);
        if (!sectionHasChecks) continue;

        strengthRows.push({ type: 'subheader', content: sectionTitle });

        checkNames.forEach(name => {
            const data = checks[name];
            if (!data || !data.check) return;

            const { demand, check } = data;
            const { Rn, phi, omega } = check;
            const capacity = Rn || 0;
            const design_capacity_raw = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

            let ratio, display_demand, display_capacity, demand_unit = 'kips', capacity_unit = 'kips';

            if (name === 'Plate Thickness for Prying') {
                display_demand = design_capacity_raw;
                display_capacity = demand;
                ratio = display_capacity > 0 ? display_demand / display_capacity : Infinity;
                demand_unit = 'in (req)'; capacity_unit = 'in';
            } else {
                display_demand = demand;
                display_capacity = design_capacity_raw;
                ratio = display_capacity > 0 ? Math.abs(display_demand) / display_capacity : Infinity;
                if (name.includes('Flexural')) {
                    display_demand /= 12.0; display_capacity /= 12.0;
                    demand_unit = 'kip-ft'; capacity_unit = 'kip-ft';
                }
            }
            const status = ratio <= 1.0 ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>';

            strengthRows.push({
                type: 'data',
                cells: [name, `${display_demand.toFixed(2)} ${demand_unit}`, `${display_capacity.toFixed(2)} ${capacity_unit}`, ratio.toFixed(3), status],
                details: generateSpliceBreakdownHtml(name, data, inputs)
            });
        });
    }

    report.addTableSection(`Strength Checks (${inputs.design_method})`, {
        headers: ['Limit State', 'Demand', 'Capacity', 'Ratio', 'Status'],
        rows: strengthRows
    }, 'splice-strength-checks-section');

    report.render('results-container');
}

// --- Input Gathering and Orchestration (Legacy, kept for reference) ---
const inputIds = [
    'design_method', 'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Fy', 'member_Fu',
    'member_material', 'member_Zx', 'member_Sx', 'M_load', 'V_load', 'Axial_load', 'develop_capacity_check', 'deformation_is_consideration', 'g_gage_fp', 'optimize_bolts_check', 'optimize_diameter_check',
    'num_flange_plates', 'flange_plate_material', 'flange_plate_Fy', 'flange_plate_Fu', 'H_fp', 't_fp', 'L_fp',
    'flange_plate_material_inner', 'flange_plate_Fy_inner', 'flange_plate_Fu_inner', 'H_fp_inner', 't_fp_inner', 'L_fp_inner',
    'Nc_fp', 'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp',
    'num_web_plates', 'web_plate_material', 'web_plate_Fy', 'web_plate_Fu', 'H_wp', 't_wp', 'L_wp', 'connection_type', 'faying_surface_class',
    'Nc_wp', 'Nr_wp', 'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp',
    'D_fp', 'bolt_grade_fp', 'threads_included_fp', 'D_wp', 'bolt_grade_wp', 'threads_included_wp',
];

document.addEventListener('DOMContentLoaded', async () => {
    const allCalcInputIds = getAllInputIdsOnPage();

    const handleRunCheck = createCalculationHandler({
        inputIds: allCalcInputIds,
        storageKey: 'splice-inputs',
        validatorFunction: (inputs) => validateSpliceInputs(inputs),
        gatherInputsFunction: () => gatherInputsFromIds(allCalcInputIds),
        calculatorFunction: (rawInputs) => spliceCalculator.run(rawInputs),
        renderFunction: renderResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });
    
    await initializeApp({
        pageKey: 'splice',
        pageTitle: 'AISC Splice Connection Checker',
        inputIds: allCalcInputIds,
        calculationHandler: handleRunCheck,
        buttonId: 'run-check-btn',
        onReady: () => {
            populateMaterialDropdowns();
            populateBoltGradeDropdowns();
            // Attach report event listeners here, after the app is ready
            attachReportEventListeners('results-container', {
                reportId: 'splice-report-content',
                filenamePrefix: 'Splice-Report',
                toggleTexts: { show: '[Show]', hide: '[Hide]', showAll: 'Show All Details', hideAll: 'Hide All Details' }
            });
            populateShapeDropdown();
            document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);
            
            const toggleDimensionsBtn = document.getElementById('toggle-dimensions-btn');
            if (toggleDimensionsBtn) {
                toggleDimensionsBtn.addEventListener('click', () => {
                    if (dimensionElements) {
                        areDimensionsVisible = !areDimensionsVisible;
                        dimensionElements.meshes.forEach(mesh => { if (mesh) mesh.isVisible = areDimensionsVisible; });
                        dimensionElements.labels.forEach(label => { if(label) label.isVisible = areDimensionsVisible; });
                        toggleDimensionsBtn.textContent = areDimensionsVisible ? 'Hide Dimensions' : 'Show Dimensions';
                    }
                });
            }
            
            const debouncedRedraw3D = debounce(draw3dSpliceDiagram, 300);
            diagramInputIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', debouncedRedraw3D);
                    el.addEventListener('change', debouncedRedraw3D);
                }
            });
            
            // Initial draw after inputs are potentially loaded from storage
            setTimeout(draw3dSpliceDiagram, 100);
        }
    });

});