// --- Global variables for the 3D scene ---
let bjsEngine, bjsScene, bjsGuiTexture, dimensionElements = { meshes: [], labels: [] };

// --- Define all Input IDs that affect the diagram's geometry ---
const diagramInputIds = [
    'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'num_flange_plates',
    'H_fp', 't_fp', 'L_fp', 'H_fp_inner', 't_fp_inner', 'L_fp_inner', 'D_fp', 'Nc_fp',
    'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp', 'g_gage_fp',
    'num_web_plates', 'H_wp', 't_wp', 'L_wp', 'D_wp', 'Nc_wp', 'Nr_wp',
    'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp'
];


/**
 * Creates a detailed bolt mesh with a hexagonal head, nut, and washers, positioned and scaled correctly.
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

    // Dimensions
    const headDiameter = diameter * 1.8;
    const headHeight = diameter * 0.65;
    const washerDiameter = diameter * 2.2;
    const washerHeight = diameter * 0.15;
    // Shank should be long enough to go through material, washers, and engage the nut
    const shankLength = thickness + 2 * washerHeight + headHeight;

    // Create parts at the origin before merging and moving
    const shank = BABYLON.MeshBuilder.CreateCylinder(`${name}_shank`, { diameter, height: shankLength }, scene);

    // Position washer ON TOP of the clamped material surface
    const washer1 = BABYLON.MeshBuilder.CreateCylinder(`${name}_washer1`, { diameter: washerDiameter, height: washerHeight }, scene);
    washer1.position.y = thickness / 2 + washerHeight / 2;

    // Position head ON TOP of the washer
    const head = BABYLON.MeshBuilder.CreateCylinder(`${name}_head`, { diameter: headDiameter, height: headHeight, tessellation: 6 }, scene);
    head.position.y = thickness / 2 + washerHeight + headHeight / 2;
    head.rotation.y = Math.PI / 6;

    // Position second washer BELOW the clamped material surface
    const washer2 = BABYLON.MeshBuilder.CreateCylinder(`${name}_washer2`, { diameter: washerDiameter, height: washerHeight }, scene);
    washer2.position.y = -thickness / 2 - washerHeight / 2;

    // Position nut BELOW the second washer
    const nut = BABYLON.MeshBuilder.CreateCylinder(`${name}_nut`, { diameter: headDiameter, height: headHeight, tessellation: 6 }, scene);
    nut.position.y = -thickness / 2 - washerHeight - headHeight / 2;
    nut.rotation.y = Math.PI / 6;

    // Merge all parts into a single mesh
    const boltMesh = BABYLON.Mesh.MergeMeshes([shank, head, nut, washer1, washer2], true, false, null, false, true);
    if (boltMesh) {
        boltMesh.name = name;
        boltMesh.position = position; // Move the entire assembly to its final position
    }
    return boltMesh;
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
    while (bjsScene.meshes.length > 0) {
        bjsScene.meshes[0].dispose(false, true);
    }
    while (bjsScene.materials.length > 0) {
        bjsScene.materials[0].dispose(true, false);
    }
    if (bjsScene.environmentTexture) {
        bjsScene.environmentTexture.dispose();
    }
    while (bjsScene.lights.length > 0) {
        bjsScene.lights[0].dispose();
    }
    if (bjsGuiTexture) {
        bjsGuiTexture.getChildren().forEach(control => control.dispose());
    }
    // Clear the dimension elements tracker
    dimensionElements.meshes = [];
    dimensionElements.labels = [];



    // --- 3. Lighting & Materials ---
    bjsScene.clearColor = isDarkMode ? new BABYLON.Color4(0.1, 0.12, 0.15, 1) : new BABYLON.Color4(0.95, 0.95, 0.95, 1);
    bjsScene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/studio.env", bjsScene);
    bjsScene.environmentIntensity = 1.2;

    // Add a directional light to cast shadows
    const light = new BABYLON.DirectionalLight("dir01", new BABYLON.Vector3(-0.5, -1, -0.5), bjsScene);
    light.position = new BABYLON.Vector3(20, 40, 20);

    // Shadow generator
    const shadowGenerator = new BABYLON.ShadowGenerator(1024, light);
    shadowGenerator.useBlurExponentialShadowMap = true;
    shadowGenerator.blurKernel = 32;

    const memberMaterial = new BABYLON.PBRMaterial("memberMat", bjsScene);
    memberMaterial.albedoColor = new BABYLON.Color3.FromHexString("#003cff");
    memberMaterial.metallic = 0.6;
    memberMaterial.roughness = 0.45;
    
    const plateMaterial = new BABYLON.PBRMaterial("plateMat", bjsScene);
    plateMaterial.albedoColor = new BABYLON.Color3.FromHexString("#ff8800");
    plateMaterial.metallic = 0.6;
    plateMaterial.roughness = 0.4;

    const boltMaterial = new BABYLON.PBRMaterial("boltMat", bjsScene);
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
        label.addControl(textBlock);
        label.linkWithMesh(anchorMesh);
        return label;
    };

    const createDimensionLine = (name, value, start, end, offset) => {
        if (!value || value <= 0) return;
        const lineMat = new BABYLON.StandardMaterial(`${name}_mat`, bjsScene);
        lineMat.emissiveColor = isDarkMode ? new BABYLON.Color3.White() : new BABYLON.Color3.Black();
        lineMat.disableLighting = true;

        const mainLinePoints = [start.add(offset), end.add(offset)];
        const mainLine = BABYLON.MeshBuilder.CreateLines(`${name}_main`, { points: mainLinePoints }, bjsScene);
        mainLine.material = lineMat;
        dimensionElements.meshes.push(mainLine);

        const extLine1Points = [start, start.add(offset.scale(1.1))];
        const extLine1 = BABYLON.MeshBuilder.CreateLines(`${name}_ext1`, { points: extLine1Points }, bjsScene);
        extLine1.material = lineMat;
        dimensionElements.meshes.push(extLine1);

        const extLine2Points = [end, end.add(offset.scale(1.1))];
        const extLine2 = BABYLON.MeshBuilder.CreateLines(`${name}_ext2`, { points: extLine2Points }, bjsScene);
        extLine2.material = lineMat;
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


    // --- 6. Add Dimensions ---
    const dimYOffset = inputs.member_d / 2 + inputs.t_fp + 5;
    const dimXOffset = (inputs.member_bf / 2) + 5;

    // Gap
    createDimensionLine("Gap", inputs.gap, new BABYLON.Vector3(0, dimYOffset, -inputs.gap / 2), new BABYLON.Vector3(0, dimYOffset, inputs.gap / 2), new BABYLON.Vector3(0, 2, 0));

    // Flange Plate Dimensions
    if (inputs.L_fp > 0 && inputs.H_fp > 0) {
        createDimensionLine("L_fp", inputs.L_fp, new BABYLON.Vector3(-inputs.H_fp / 2, dimYOffset, -inputs.L_fp / 2), new BABYLON.Vector3(-inputs.H_fp / 2, dimYOffset, inputs.L_fp / 2), new BABYLON.Vector3(-2, 0, 0));
        createDimensionLine("H_fp", inputs.H_fp, new BABYLON.Vector3(-inputs.H_fp / 2, dimYOffset, inputs.L_fp / 2), new BABYLON.Vector3(inputs.H_fp / 2, dimYOffset, inputs.L_fp / 2), new BABYLON.Vector3(0, 0, 2));
    }

    // Flange Bolt Dimensions
    if (inputs.Nc_fp > 1) {
        const s1_z_start = -(inputs.gap / 2 + inputs.S3_end_dist_fp);
        const s1_z_end = s1_z_start - inputs.S1_col_spacing_fp;
        createDimensionLine("S1", inputs.S1_col_spacing_fp, new BABYLON.Vector3(dimXOffset, dimYOffset, s1_z_start), new BABYLON.Vector3(dimXOffset, dimYOffset, s1_z_end), new BABYLON.Vector3(2, 0, 0));
    }
    if (inputs.g_gage_fp > 0) {
        const gage_z = -(inputs.gap / 2 + inputs.S3_end_dist_fp);
        createDimensionLine("g", inputs.g_gage_fp, new BABYLON.Vector3(-inputs.g_gage_fp / 2, dimYOffset, gage_z), new BABYLON.Vector3(inputs.g_gage_fp / 2, dimYOffset, gage_z), new BABYLON.Vector3(0, 0, -2));
    }
    createDimensionLine("S3", inputs.S3_end_dist_fp, new BABYLON.Vector3(dimXOffset, dimYOffset, -inputs.gap / 2), new BABYLON.Vector3(dimXOffset, dimYOffset, -(inputs.gap / 2 + inputs.S3_end_dist_fp)), new BABYLON.Vector3(2, 0, 0));

    // Web Plate Dimensions
    const webDimXOffset = (inputs.member_tw / 2) + inputs.t_wp + 2;
    if (inputs.L_wp > 0 && inputs.H_wp > 0) {
        createDimensionLine("L_wp", inputs.L_wp, new BABYLON.Vector3(webDimXOffset, -inputs.H_wp / 2, -inputs.L_wp / 2), new BABYLON.Vector3(webDimXOffset, -inputs.H_wp / 2, inputs.L_wp / 2), new BABYLON.Vector3(2, 0, 0));
        createDimensionLine("H_wp", inputs.H_wp, new BABYLON.Vector3(webDimXOffset, -inputs.H_wp / 2, inputs.L_wp / 2), new BABYLON.Vector3(webDimXOffset, inputs.H_wp / 2, inputs.L_wp / 2), new BABYLON.Vector3(2, 0, 0));
    }

    // Web Bolt Dimensions
    if (inputs.Nc_wp > 1) {
        const s4_z_start = -(inputs.gap / 2 + inputs.S6_end_dist_wp);
        const s4_z_end = s4_z_start - inputs.S4_col_spacing_wp;
        const s4_y = ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2;
        createDimensionLine("S4", inputs.S4_col_spacing_wp, new BABYLON.Vector3(webDimXOffset, s4_y, s4_z_start), new BABYLON.Vector3(webDimXOffset, s4_y, s4_z_end), new BABYLON.Vector3(2, 0, 0));
    }
    if (inputs.Nr_wp > 1) {
        const s5_y_start = -((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2;
        const s5_y_end = s5_y_start + inputs.S5_row_spacing_wp;
        const s5_z = -(inputs.gap / 2 + inputs.S6_end_dist_wp);
        createDimensionLine("S5", inputs.S5_row_spacing_wp, new BABYLON.Vector3(webDimXOffset, s5_y_start, s5_z), new BABYLON.Vector3(webDimXOffset, s5_y_end, s5_z), new BABYLON.Vector3(2, 0, 0));
    }
    createDimensionLine("S6", inputs.S6_end_dist_wp, new BABYLON.Vector3(webDimXOffset, 0, -inputs.gap / 2), new BABYLON.Vector3(webDimXOffset, 0, -(inputs.gap / 2 + inputs.S6_end_dist_wp)), new BABYLON.Vector3(2, 0, 0));


    // --- 7. Final Camera Adjustment ---
    if (bjsScene.activeCamera && bjsScene.meshes.length > 0) {
        const allMeshes = bjsScene.meshes.filter(m => m.isVisible && m.getBoundingInfo() && !m.name.includes("dim"));
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
        }
    }
}

// --- Main Calculator Logic (DOM interaction and event handling) ---
const spliceCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
    const { PI, sqrt, min, max, abs } = Math;
    const E_MOD = 29000.0; // ksi
    
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

function checkBlockShear({ L_gv, L_nv, L_gt, L_nt, t_p, Fu, Fy, num_tension_rows, num_shear_paths = 1 }) {
    // AISC 360-22 Eq J4-5
    const Ubs = (num_tension_rows || 1) > 1 ? 0.5 : 1.0;

    // --- Path 1: Shear along bolt lines, tension across the end of the plate ---
    const Agv1 = num_shear_paths * L_gv * t_p;
    const Anv1 = num_shear_paths * L_nv * t_p;
    const Agt1 = L_gt * t_p; // Gross tension path at the end

    const tension_term1 = Ubs * Fu * Agt1; // Path 1 uses the gross tension area at the end of the plate.
    const path1_rupture = (0.6 * Fu * Anv1) + tension_term1;
    const path1_yield = (0.6 * Fy * Agv1) + tension_term1;
    const Rn1 = Math.min(path1_rupture, path1_yield) || 0;

    // --- Path 2: Shear along bolt lines, tension between bolt lines ---
    const Agv2 = Agv1; // Same shear path
    const Anv2 = Anv1;
    const Ant2 = L_nt * t_p; // Net tension path between bolt lines

    const tension_term2 = Ubs * Fu * Ant2; // Path 2 uses the net tension area between bolts.
    const path2_rupture = (0.6 * Fu * Anv2) + tension_term2;
    const path2_yield = (0.6 * Fy * Agv2) + tension_term2;
    const Rn2 = Math.min(path2_rupture, path2_yield) || 0;

    const Rn = Math.min(Rn1, Rn2);
    const governing_path = Rn1 < Rn2 ? 1 : 2;

    return { 
        Rn, phi: 0.75, omega: 2.00, Ubs, governing_path,
        path1: { Rn: Rn1, Agv: Agv1, Anv: Anv1, Ant: Agt1, path_yield: path1_yield, path_rupture: path1_rupture },
        path2: { Rn: Rn2, Agv: Agv2, Anv: Anv2, Ant: Ant2, path_yield: path2_yield, path_rupture: path2_rupture }
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
 * Checks for prying action on a bolt connection.
 * @param {object} params - Parameters for prying action check.
 * @param {number} params.t_plate - Thickness of the connected plate (in).
 * @param {number} params.Fy_plate - Yield strength of the connected plate (ksi).
 * @param {number} params.b - Distance from bolt centerline to toe of fillet or edge of plate (in).
 * @param {number} params.a - Distance from bolt centerline to point of contraflexure (in).
 * @param {number} params.p - Bolt pitch (spacing along the line of force) (in).
 * @param {number} params.d_bolt - Nominal bolt diameter (in).
 * @param {number} params.d_hole - Nominal hole diameter (in).
 * @param {number} params.B_bolt - Required tensile force per bolt (demand) (kips).
 * @returns {object} An object containing the total required tensile force (including prying), prying force, and critical thickness.
 */
function checkPryingAction({ t_plate, Fy_plate, b, a, p, d_bolt, d_hole, B_bolt }) {
    // Per AISC Manual Part 9, simplified for T-stub or similar flexural elements
    // This function is designed for bolts in tension.
    if (p <= 0 || Fy_plate <= 0 || B_bolt < 0) return { Q_prime: 0, T_req: B_bolt, tc: Infinity, alpha_prime: 0, b_prime: b, a_prime: a, rho: 0, delta: 0 };
    
    const b_prime = b - d_bolt / 2.0;
    const a_prime = min(a + d_bolt / 2.0, 1.25 * b_prime); // AISC Manual Part 9, Eq. 9-28

    if (a_prime <= 0 || b_prime < 0) return { Q_prime: 0, T_req: B_bolt, tc: Infinity, alpha_prime: 0, b_prime, a_prime, rho: 0, delta: 0 };

    const rho = b_prime / a_prime;
    const delta = 1 - (d_hole / p);

    if (delta <= 0) return { Q_prime: Infinity, T_req: Infinity, tc: 0, alpha_prime: 0, b_prime, a_prime, rho, delta }; // Invalid geometry or holes too close

    // Critical thickness tc is calculated based on the applied demand B, per AISC Eq. 9-27.
    const tc = sqrt((4 * B_bolt * b_prime) / (p * Fy_plate));

    let Q_prime = 0;
    let alpha_prime = 0;
    if (t_plate < tc) { // Prying occurs if actual thickness is less than critical thickness
        alpha_prime = (1 / delta) * (((t_plate / tc)**2) - 1); // AISC Manual Part 9, Eq. 9-29
        alpha_prime = max(0, min(alpha_prime, 1.0)); // alpha' cannot be negative or > 1
        Q_prime = B_bolt * delta * alpha_prime * rho; // AISC Manual Part 9, Eq. 9-30
    }
    const T_req = B_bolt + Q_prime;
    return { T_req, Q_prime, tc, alpha_prime, delta, rho, b_prime, a_prime, Fy_plate };
}

function getGeometryChecks({ db, s_col, s_row, le_long, le_tran, t_thinner }) { 
    // Implements checks from AISC J3.3, J3.4, and J3.5.
    // Assumes standard round holes.
    // Assumes sheared edges for minimum edge distance lookup (most conservative).
    if (!db) return {}; // Return empty if no bolt diameter is provided
    // For rolled edges or different hole types, Table J3.4 values would change.
    const tolerance = 1e-9; // Small tolerance for floating point comparisons
    const min_le = AISC_SPEC.minEdgeDistanceTable[String(db)] || 1.25 * db; // Use exact values from map where possible
    const min_s = (8/3) * db; // AISC J3.4 minimum spacing is 2-2/3 * db
    // From AISC J3.5
    const max_s = min(24 * t_thinner, 12.0);
    return {
        edge_dist_long: { actual: le_long, min: min_le, pass: le_long >= min_le - tolerance },
        edge_dist_tran: { actual: le_tran, min: min_le, pass: le_tran >= min_le - tolerance },
        spacing_col: { actual: s_col, min: min_s, pass: s_col >= min_s - tolerance },
        spacing_row: { actual: s_row, min: min_s, pass: s_row >= min_s - tolerance },
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
    const {
        demand, demand_comp, H_p, t_p, L_p, Fy, Fu,
        Nc, Nr, S_col, S_row, S_end, gage, D_bolt,
        hole_for_net_area, hole_for_bearing
    } = config;

    const plateChecks = {};

    const { le_long, le_tran, edge_dist_gap, bolt_pattern_height } = calculateBoltGroupGeometry({
        L_plate: L_p, H_plate: H_p, Nc, Nr, S_col, S_row,
        S_end_gap: S_end, 
        gage
    });

    // 1. Gross Section Yielding & Compression
    const Ag = H_p * t_p;
    plateChecks[`${plateName} GSY`] = {
        demand: demand,
        check: checkGrossSectionYielding({ Ag, Fy }),
        details: { H_p, t_p }
    };
    plateChecks[`${plateName} Compression`] = {
        demand: demand_comp,
        check: checkPlateCompression({ Ag, Fy, t: t_p, unbraced_length: S_col })
    };

    // 2. Net Section Fracture
    const bolts_in_critical_section = 2 * Nr;
    plateChecks[`${plateName} NSF`] = { 
        demand: demand, 
        check: checkFlangeNetSection({ 
            bf: H_p, tf: t_p, Fu: Fu, 
            num_bolts_in_cs: bolts_in_critical_section, 
            hole_dia_net_area: hole_for_net_area 
        }) 
    };

    // 3. Block Shear
    // --- FIX: Calculate parameters for BOTH potential block shear paths ---
    // Path 1: Tear-out from the end of the plate.
    // Path 2: Tear-out between the bolt lines.
    
    // Shear path parameters are the same for both failure modes.
    // This is the length of a single shear path along one line of bolts.
    const L_gv = S_end + (Nc - 1) * S_col;
    const L_nv = L_gv - (Nc - 0.5) * hole_for_net_area;
    
    // Tension path parameters differ for each failure mode.
    // Path 1: Tension across the end of the plate.
    const L_gt_path1 = le_tran; // Gross tension length is the transverse edge distance.
    // Path 2: Tension between the bolt lines.
    const L_gt_path2 = gage; // Gross tension length is the gage.
    const L_nt_path2 = gage - (2 * Nr * hole_for_net_area); // Net length deducts bolts.

    plateChecks[`${plateName} Block Shear`] = {
        demand: demand,
        check: checkBlockShear({ L_gv, L_nv, L_gt: L_gt_path1, L_nt: L_nt_path2, t_p, Fu, Fy, num_tension_rows: Nr, num_shear_paths: 2 }),
        details: { t_p, hole_dia: hole_for_net_area }
    };

    // 4. Bolt Bearing
    // --- FIX: Use the calculated 'le_long' for the edge distance ---
    const bearing_edge = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing });
    const bearing_int = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing });
    
    // This assumes bolts are mirrored across the gage line.
    // The "edge" bolts are the ones in the first column (Nc=1).
    const num_edge_bolts = 2 * Nr; 
    const num_int_bolts = (Nc - 1) * 2 * Nr;
    
    const total_bearing = bearing_edge.Rn * num_edge_bolts + bearing_int.Rn * num_int_bolts;
    plateChecks[`${plateName} Bolt Bearing`] = {
        demand: demand,
        check: { Rn: total_bearing, phi: bearing_edge.phi, omega: bearing_edge.omega },
        details: { edge: bearing_edge, int: bearing_int, num_edge: num_edge_bolts, num_int: num_int_bolts }
    };

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
    
    // Tension Path (across the gage)
    const L_gt_beam_f = inputs.g_gage_fp; // Gross length of the tension path
    const L_nt_beam_f = inputs.g_gage_fp - (2 * inputs.Nr_fp * hole_for_net_area_fp); // Net length, deducting all bolts on the tension line

    checks['Beam Flange Block Shear'] = { 
        demand: total_flange_demand_tension, 
        check: checkBlockShear({ 
            L_gv: L_gv_beam_f, L_nv: L_nv_beam_f, L_gt: L_gt_beam_f, L_nt: L_nt_beam_f, 
            t_p: inputs.member_tf, Fu: inputs.member_Fu, Fy: inputs.member_Fy, 
            num_tension_rows: inputs.Nr_fp, num_shear_paths: 2
        }),
        details: { t_p: inputs.member_tf, hole_dia: hole_for_net_area_fp }
    };

    // --- Prying Action Check ---
    // --- FIX: Corrected and Consolidated Prying Action Check ---
    // (inside performFlangeChecks function)

    const B_per_bolt = num_flange_bolts_per_side > 0 ? total_flange_demand_tension / num_flange_bolts_per_side : 0;
    const d_hole_pry = AISC_SPEC.getNominalHoleDiameter(inputs.D_fp, inputs.hole_calc_method, 'standard');

    let T_req_total = B_per_bolt;
    let prying_details_combined = {};
    let outer_plate_tc = 0;

    if (B_per_bolt > 0) {
        let Q_total = 0;
        
        // --- Outer Plate Prying ---
        const B_plate_outer = inputs.num_flange_plates === 2 ? B_per_bolt * 0.5 : B_per_bolt;
        const b_pry_outer = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
        const a_pry_outer = (inputs.H_fp - bolt_pattern_height_fp) / 2.0;
        
        const prying_outer_details = checkPryingAction({
            t_plate: inputs.t_fp, 
            Fy_plate: inputs.flange_plate_Fy, 
            b: b_pry_outer, a: a_pry_outer, 
            p: inputs.S1_col_spacing_fp, 
            d_bolt: inputs.D_fp, d_hole: d_hole_pry, 
            B_bolt: B_plate_outer 
        });
        Q_total += prying_outer_details.Q_prime;
        prying_details_combined.outer = { ...prying_outer_details, B_bolt: B_plate_outer }; // Include B_bolt for the breakdown
        outer_plate_tc = prying_outer_details.tc;

        // --- Inner Plate Prying ---
        if (inputs.num_flange_plates === 2) {
            const B_plate_inner = B_per_bolt * 0.5;
            const b_pry_inner = inputs.g_gage_fp / 2.0;
            const a_pry_inner = (inputs.g_gage_fp / 2.0) + (inputs.member_bf - inputs.member_tw) / 2.0;

            const prying_inner_details = checkPryingAction({
                t_plate: inputs.t_fp_inner, Fy_plate: inputs.flange_plate_Fy_inner, 
                b: b_pry_inner, a: a_pry_inner, p: inputs.S1_col_spacing_fp, 
                d_bolt: inputs.D_fp, d_hole: d_hole_pry, B_bolt: B_plate_inner
            });
            Q_total += prying_inner_details.Q_prime;
            prying_details_combined.inner = prying_inner_details;
        }

        T_req_total = B_per_bolt + Q_total;

        checks['Flange Bolt Tension with Prying'] = {
            demand: T_req_total,
            check: checkBoltTension(inputs.bolt_grade_fp, inputs.D_fp),
            details: { ...prying_details_combined, B_per_bolt, Q_total, T_req: T_req_total }
        };
    }

    checks['Plate Thickness for Prying'] = {
        demand: inputs.t_fp, // Provided thickness
        check: { Rn: outer_plate_tc, phi: 1.0, omega: 1.0 }, // Required thickness
        // Pass the correct details object to the breakdown generator.
        // The breakdown needs the `B_per_bolt` value which is not inside `prying_details_combined`.
        // We create a new object that includes both for the breakdown function to use.
        details: { ...prying_details_combined, B_per_bolt }
    };
    
    const t_thinner_flange = min(inputs.member_tf, inputs.t_fp, inputs.num_flange_plates === 2 ? inputs.t_fp_inner : Infinity);
    geomChecks['Flange Bolts'] = getGeometryChecks({
        db: inputs.D_fp, 
        s_col: inputs.S1_col_spacing_fp, 
        s_row: inputs.S2_row_spacing_fp, 
        le_long: le_long_fp, 
        le_tran: le_tran_fp, 
        t_thinner: t_thinner_flange
    });
    const tolerance = 1e-9;
    const min_le_fp = geomChecks['Flange Bolts'].edge_dist_long.min;
    geomChecks['Flange Bolts'].edge_dist_gap = { actual: edge_dist_gap_fp, min: min_le_fp, pass: edge_dist_gap_fp >= min_le_fp - tolerance };

    return { checks, geomChecks, inputs };
}

function performWebChecks(inputs, demands) {
    const { V_load, Hw } = demands;
    const checks = {};
    const geomChecks = {};

    const hole_nominal_wp = AISC_SPEC.getNominalHoleDiameter(inputs.D_wp, inputs.hole_calc_method);
    const hole_for_bearing_wp = hole_nominal_wp;
    const hole_for_net_area_wp = hole_nominal_wp + 1.0 / 16.0; // Per AISC commentary for net area calculations

    const { le_long: le_long_wp, le_tran: le_tran_wp, edge_dist_gap: edge_dist_gap_wp } = calculateBoltGroupGeometry({
        L_plate: inputs.L_wp,
        H_plate: inputs.H_wp,
        Nc: inputs.Nc_wp,
        Nr: inputs.Nr_wp,
        S_col: inputs.S4_col_spacing_wp,
        S_row: inputs.S5_row_spacing_wp,
        S_end_gap: inputs.S6_end_dist_wp
    });

    const num_web_bolts_per_side = inputs.Nc_wp * inputs.Nr_wp;
    if (num_web_bolts_per_side === 0) return { checks, geomChecks, inputs };

    const fastenerPatternLength_web = (inputs.Nr_wp > 1) ? ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) : 0;
    const single_web_bolt_shear_check = checkBoltShear({
        grade: inputs.bolt_grade_wp, 
        threadsIncl: inputs.threads_included_wp, 
        db: inputs.D_wp, 
        numPlanes: inputs.num_web_plates, 
        fastenerPatternLength: fastenerPatternLength_web
    });

    // The demand on the bolt group is the vector sum of Vertical Shear (V) and Horizontal Force (Hw)
    const total_demand_on_group = Math.sqrt(V_load**2 + Hw**2);
    const total_bolt_group_capacity = single_web_bolt_shear_check.Rn * num_web_bolts_per_side;
    
    checks['Web Bolt Group Shear'] = { 
        demand: total_demand_on_group, 
        check: { ...single_web_bolt_shear_check, Rn: total_bolt_group_capacity }, // Store total capacity
        details: { Rn_single: single_web_bolt_shear_check.Rn, num_bolts: num_web_bolts_per_side, V_load, Hw }
    };

    const avg_force_per_bolt = total_demand_on_group / num_web_bolts_per_side;

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
    
    // --- FIX: Correct Web Plate Block Shear Area Calculations ---
    // Gross area in shear (horizontal path)
    const L_gv_wp = inputs.S6_end_dist_wp + (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp;
    const Agv_wp_bs = L_gv_wp * total_t_wp;
    // Net area in shear (deduct 1/2 hole at start and end, and full holes in between)
    const Anv_wp_bs = Agv_wp_bs - ((inputs.Nc_wp - 1) + 0.5) * hole_for_net_area_wp * total_t_wp;

    // Gross area in tension (vertical path)
    const Agt_wp_bs = le_tran_wp * total_t_wp;
    // Net area in tension (deduct 1/2 hole)
    const Ant_wp_bs = Agt_wp_bs - (0.5 * hole_for_net_area_wp * total_t_wp);

    checks['Web Plate Block Shear'] = { 
        demand: V_load, 
        check: checkBlockShear({ L_gv: L_gv_wp, L_nv: Anv_wp_bs / total_t_wp, L_gt: Agt_wp_bs / total_t_wp, L_nt: Ant_wp_bs / total_t_wp, t_p: total_t_wp, Fu: inputs.web_plate_Fu, Fy: inputs.web_plate_Fy, num_tension_rows: 1, num_shear_paths: 1 })
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
    
    // --- Beam Web Bolt Bearing (Full Group) ---
    const bearing_web_beam_edge = checkBoltBearing({
        db: inputs.D_wp, t_ply: inputs.member_tw, Fu_ply: inputs.member_Fu,
        le: le_long_wp, s: inputs.S4_col_spacing_wp,
        isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration,
        hole_dia: hole_for_bearing_wp
    });
    const bearing_web_beam_int = checkBoltBearing({
        db: inputs.D_wp, t_ply: inputs.member_tw, Fu_ply: inputs.member_Fu,
        le: Infinity, s: inputs.S4_col_spacing_wp, isEdgeBolt: false,
        deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing_wp
    });
    const total_bearing_capacity_beam_web = (bearing_web_beam_edge.Rn * num_edge_bolts_web) + (bearing_web_beam_int.Rn * num_int_bolts_web);
    checks['Beam Web Bolt Bearing'] = { demand: V_load, check: { ...bearing_web_beam_edge, Rn: total_bearing_capacity_beam_web }, details: { edge: bearing_web_beam_edge, int: bearing_web_beam_int, num_edge: num_edge_bolts_web, num_int: num_int_bolts_web } };

    const t_thinner_web = min(inputs.member_tw, inputs.t_wp * inputs.num_web_plates);
    geomChecks['Web Bolts'] = getGeometryChecks({
        db: inputs.D_wp, 
        s_col: inputs.S4_col_spacing_wp, 
        s_row: inputs.S5_row_spacing_wp, 
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

    const Agv_beam_web = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
    checks['Beam Web Shear Yielding'] = { 
        demand: V_load, 
        check: checkShearYielding(Agv_beam_web, inputs.member_Fy),
        details: { d: inputs.member_d, tf: inputs.member_tf, tw: inputs.member_tw }
    };
    
    // The number of bolts in the critical section of one flange is 2 * Nr_fp (one for each bolt line on the gage).
    const num_bolts_in_flange_cs = 2 * inputs.Nr_fp;
    checks['Beam Flexural Rupture'] = { demand: M_load * 12, check: checkBeamFlexuralRupture(inputs.member_Sx, inputs.member_Fy, inputs.member_Fu, inputs.member_bf, inputs.member_tf, num_bolts_in_flange_cs, hole_for_net_area_fp) };

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
        const A_holes_web = inputs.Nr_wp * hole_for_net_area_wp * inputs.member_tw;
        const An = A_gross_approx - A_holes_flange - A_holes_web;

        // Shear Lag Factor U per AISC Table D3.1, Case 7 (W, M, S shapes with flange connections)
        const An_conn = 2 * (inputs.member_bf - inputs.Nr_fp * hole_for_net_area_fp) * inputs.member_tf;
        const Ag_conn = 2 * inputs.member_bf * inputs.member_tf;
        const U = Ag_conn > 0 ? An_conn / Ag_conn : 1.0;
        
        const Ae = U * An;
        const check = { 
            Rn: inputs.member_Fu * Ae, phi: 0.75, omega: 2.00, 
            An, Ae, U, Fu: inputs.member_Fu, 
            details: { Ag_approx: A_gross_approx, A_holes_flange, A_holes_web, An_conn, Ag_conn, hole_dia: hole_for_net_area_fp } // Corrected hole_dia
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
    const total_flange_demand_compression = flange_force_from_moment - axial_per_flange;
    const demand_fp_outer = inputs.num_flange_plates === 2 ? total_flange_demand_tension * 0.5 : total_flange_demand_tension;
    const demand_fp_inner = inputs.num_flange_plates === 2 ? total_flange_demand_tension * 0.5 : 0;
    const demand_fp_outer_comp = inputs.num_flange_plates === 2 ? total_flange_demand_compression * 0.5 : total_flange_demand_compression;
    const demand_fp_inner_comp = inputs.num_flange_plates === 2 ? total_flange_demand_compression * 0.5 : 0;

    const flangeResults = performFlangeChecks(inputs, { total_flange_demand_tension, total_flange_demand_compression, demand_fp_outer, demand_fp_inner, demand_fp_outer_comp, demand_fp_inner_comp });
    const flange_capacity_for_moment = (flangeResults.checks['Flange Bolt Shear']?.check?.Rn ?? 0);
    const Mu_flange_splice_capacity = flange_capacity_for_moment * moment_arm_flange;
    const Mu_resisted_by_web = Math.max(0, Math.abs(M_load * 12) - Mu_flange_splice_capacity);
    const Hw = (inputs.H_wp > 0) ? Mu_resisted_by_web / (inputs.H_wp * 0.75) : 0; // Prevent division by zero
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
        const Aw = inputs.member_d * inputs.member_tw;
        if (Aw > 0) {
            const Vn_kips = 0.6 * inputs.member_Fy * Aw;
            const phi_v_yield = 1.00; const omega_v_yield = 1.50;
            V_load = inputs.design_method === 'LRFD' ? phi_v_yield * Vn_kips : Vn_kips / omega_v_yield;
        }
    }
    return performChecks(inputs, M_load, V_load);
}

function optimizeFlangeBolts(inputs, optimizationLog) {
    const MAX_TOTAL_BOLTS_PER_SIDE = 40;
    const MAX_ROWS_OR_COLS = 10;
    const flangeBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_fp];
    let bestSolution = null;

    for (const d_fp of flangeBoltDiameters) {
        for (let nc_fp = 1; nc_fp <= MAX_ROWS_OR_COLS; nc_fp++) {
            for (let nr_fp = 1; nr_fp <= MAX_ROWS_OR_COLS; nr_fp++) {
                const num_bolts_per_side = nc_fp * (2 * nr_fp);
                if (num_bolts_per_side > MAX_TOTAL_BOLTS_PER_SIDE) continue;

                // If we already have a solution with fewer bolts, don't bother checking this one.
                if (bestSolution && num_bolts_per_side >= bestSolution.num_bolts_per_side) {
                    continue;
                }

                const currentInputs = { ...inputs, D_fp: d_fp, Nc_fp: nc_fp, Nr_fp: nr_fp };
                const results = runSingleCheck(currentInputs);

                const allFlangeChecksPass = Object.entries(results.checks)
                    .filter(([key]) => (key.includes('Flange Bolt') || key.includes('Plate')) && !key.startsWith('Beam'))
                    .every(([key, data]) => {
                        const capacity = inputs.design_method === 'LRFD' ? data.check.Rn * data.check.phi : data.check.Rn / data.check.omega;
                        if (key === 'Plate Thickness for Prying') {
                            return data.demand >= capacity;
                        }
                        return Math.abs(data.demand) <= capacity;
                    });

                const flangeGeomOk = Object.values(results.geomChecks['Flange Bolts']).every(check => check.pass);

                if (allFlangeChecksPass && flangeGeomOk) {
                    // This is the best solution found so far. Store it.
                    bestSolution = {
                        inputs: currentInputs,
                        num_bolts_per_side: num_bolts_per_side
                    };
                }
            }
        }
    }

    if (bestSolution) {
        const { Nc_fp, Nr_fp, D_fp } = bestSolution.inputs;
        optimizationLog.push(`Flange splice optimized to ${Nc_fp} column(s) and ${Nr_fp} row(s) of ${D_fp}" bolts (${bestSolution.num_bolts_per_side} bolts per side).`);
        return bestSolution.inputs;
    }

    optimizationLog.push(`Flange splice optimization failed to converge.`);
    return null;
}

function optimizeWebBolts(inputs, optimizationLog) {
    const MAX_TOTAL_BOLTS_PER_SIDE = 40;
    const webBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_wp];
    let bestSolution = null;

    for (const d_wp of webBoltDiameters) {
        for (let total_bolts = 1; total_bolts <= MAX_TOTAL_BOLTS_PER_SIDE; total_bolts++) {
             // If we already found a solution with fewer bolts, no need to continue this loop.
            if(bestSolution && total_bolts >= bestSolution.num_bolts_per_side) {
                continue;
            }

            for (let nr_wp = 1; nr_wp <= total_bolts; nr_wp++) {
                if (total_bolts % nr_wp === 0) {
                    const nc_wp = total_bolts / nr_wp;
                    const currentInputs = { ...inputs, D_wp: d_wp, Nc_wp: nc_wp, Nr_wp: nr_wp };
                    const results = runSingleCheck(currentInputs);

                    const allWebChecksPass = Object.entries(results.checks)
                        .filter(([key]) => key.includes('Web') && !key.startsWith('Beam'))
                        .every(([key, data]) => {
                            const capacity = inputs.design_method === 'LRFD' ? data.check.Rn * data.check.phi : data.check.Rn / data.check.omega;
                            return Math.abs(data.demand) <= capacity;
                        });

                    const webGeomOk = Object.values(results.geomChecks['Web Bolts']).every(check => check.pass);

                    if (allWebChecksPass && webGeomOk) {
                         bestSolution = {
                            inputs: currentInputs,
                            num_bolts_per_side: total_bolts
                        };
                        // Break the inner loop since we found the best solution for this total_bolts count
                        break;
                    }
                }
            }
        }
    }

    if (bestSolution) {
        const { Nc_wp, Nr_wp, D_wp } = bestSolution.inputs;
        optimizationLog.push(`Web splice optimized to ${Nc_wp} column(s) and ${Nr_wp} row(s) of ${D_wp}" bolts (${bestSolution.num_bolts_per_side} bolts per side).`);
        return bestSolution.inputs;
    }

    optimizationLog.push(`Web splice optimization failed to converge.`);
    return null;
}

function runOptimization(inputs) {
    let optimizationLog = [];

    // --- Step 1: Optimize Flange ---
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
        `A<sub>n</sub> = A<sub>g</sub> - A<sub>holes</sub> = ${common.fmt(check.Ag, 3)} - ${common.fmt(check.A_holes, 3)} = ${common.fmt(check.An, 3)} in²`,
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.1(b)</u>`,
        `R<sub>n</sub> = F<sub>u</sub> &times; A<sub>n</sub> (Shear lag factor U=1.0 for splice plates)`,
        `R<sub>n</sub> = ${common.fmt(check.Fu)} ksi &times; ${common.fmt(check.An, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Block Shear': ({ check }, common) => common.format_list([
        `<u>Path 1: Tear-out from Plate End (Governing Path: ${check.governing_path === 1 ? '<b>Yes</b>' : 'No'})</u>`,
        `R<sub>n1</sub> = min(0.6*F<sub>y</sub>*A<sub>gv</sub> + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub>, 0.6*F<sub>u</sub>*A<sub>nv</sub> + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub>)`,
        `R<sub>n1</sub> = min(${common.fmt(check.path1.path_yield)}, ${common.fmt(check.path1.path_rupture)}) = ${common.fmt(check.path1.Rn)} kips`,
        `<u>Path 2: Tear-out between Bolt Lines (Governing Path: ${check.governing_path === 2 ? '<b>Yes</b>' : 'No'})</u>`,
        `R<sub>n2</sub> = min(0.6*F<sub>y</sub>*A<sub>gv</sub> + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub>, 0.6*F<sub>u</sub>*A<sub>nv</sub> + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub>)`,
        `R<sub>n2</sub> = min(${common.fmt(check.path2.path_yield)}, ${common.fmt(check.path2.path_rupture)}) = ${common.fmt(check.path2.Rn)} kips`,
        `<u>Nominal Strength (R<sub>n</sub>)</u>`,
        `R<sub>n</sub> = min(R<sub>n1</sub>, R<sub>n2</sub>) = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
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
    'Web Bolt Group Shear': ({ check, details, demand }, common) => common.format_list([
        `Simplified bolt group analysis.`,
        `<u>Total Demand on Bolt Group</u>`,
        `Vertical Force (V) = ${common.fmt(details.V_load)} kips`,
        `Horizontal Force (H<sub>w</sub>) = ${common.fmt(details.Hw)} kips`,
        `Resultant Demand (R<sub>u</sub>) = &radic;(V² + H<sub>w</sub>²) = <b>${common.fmt(demand)} kips</b>`,
        `<u>Total Capacity of Bolt Group</u>`,
        `Capacity per Bolt = ${common.fmt(details.Rn_single)} kips`,
        `Total Nominal Capacity (R<sub>n</sub>) = Capacity per Bolt &times; n<sub>bolts</sub>`,
        `R<sub>n</sub> = ${common.fmt(details.Rn_single)} &times; ${details.num_bolts} = <b>${common.fmt(check.Rn)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Shear Yield': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.2(a)</u>`,
        `R<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>gv</sub>`,
        `R<sub>n</sub> = 0.6 &times; ${common.fmt(check.Fy, 1)} ksi &times; ${common.fmt(check.Agv, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Shear Rupture': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.2(b)</u>`,
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
        const { demand, check, details } = data;
        const outer_pry = details.outer ? `Outer Plate Q' = ${common.fmt(details.outer.Q_prime)} kips (t<sub>c</sub>=${common.fmt(details.outer.tc, 3)} in)` : '';
        const inner_pry = details.inner ? `Inner Plate Q' = ${common.fmt(details.inner.Q_prime)} kips (t<sub>c</sub>=${common.fmt(details.inner.tc, 3)} in)` : '';
        return common.format_list([
            `Prying action per AISC Manual Part 9.`,
            `<u>Total Bolt Tension Demand (T<sub>req</sub>)</u>`,
            `T<sub>req</sub> = B + Q' = ${common.fmt(details.B_per_bolt)} + ${common.fmt(details.Q_total)} = <b>${common.fmt(demand)} kips</b>`,
            `<u>Bolt Tensile Capacity (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = F<sub>nt</sub> &times; A<sub>b</sub>`,
            `R<sub>n</sub> = ${common.fmt(check.Fnt, 1)} ksi &times; ${common.fmt(check.Ab, 3)} in² = ${common.fmt(check.Rn)} kips`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
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
        const outer_pry = details.outer;
        if (!outer_pry) return 'Prying details for outer plate not available.';

        // B_bolt is the demand on the bolts for the outer plate
        const B_bolt = common.inputs.num_flange_plates === 2 
            ? (details.B_per_bolt || 0) * 0.5 
            : (details.B_per_bolt || 0);

        return common.format_list([
            `<u>Required Thickness (t<sub>c</sub>) per AISC Eq. 9-27</u>`,
            `t<sub>c</sub> = &radic;[ (4 &times; B &times; b') / (p &times; F<sub>y,plate</sub>) ]`,
            `t<sub>c</sub> = &radic;[ (4 &times; ${common.fmt(B_bolt)} kips &times; ${common.fmt(details.outer.b_prime, 3)}") / (${common.fmt(common.inputs.S1_col_spacing_fp)}" &times; ${common.fmt(details.outer.Fy_plate)} ksi) ] = <b>${common.fmt(check.Rn, 3)} in</b>`,
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
    if (name.includes('Web Bolt Group Shear')) return baseBreakdownGenerators['Web Bolt Group Shear'];
    if (name.includes('Shear Yield')) return baseBreakdownGenerators['Shear Yield'];
    if (name.includes('Shear Rupture')) return baseBreakdownGenerators['Shear Rupture'];
    if (name.includes('Flexural Rupture')) return baseBreakdownGenerators['Beam Flexural Rupture'];
    if (name.includes('Web Bolt Tension with Prying')) return baseBreakdownGenerators['Web Bolt Tension with Prying'];
    if (name.includes('Beam Flange Tensile Rupture')) return baseBreakdownGenerators['NSF']; // Reuse the plate NSF breakdown
    if (name.includes('Plate Thickness for Prying')) return baseBreakdownGenerators['Plate Thickness for Prying'];

    // Fallback
    return () => 'Breakdown not available for this check.';
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

function getAllInputIdsOnPage() {
    const ids = new Set();
    document.querySelectorAll('input[id], select[id]').forEach(el => ids.add(el.id));
    return Array.from(ids);
}


function createReportTable(config) {
    const { id, caption, headers, rows } = config;
    if (!rows || rows.length === 0) return '';

    let tableHtml = `
        <div id="${id}" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center">
                <h3 class="report-header">${caption}</h3>
                <button data-copy-target-id="${id}" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2">
                    <caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">${caption}</caption>
                    <thead>
                        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
                    </thead>
                    <tbody>
                        ${rows.join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    return tableHtml;
}

function renderLoadSummary(rawInputs, final_loads, demands, inputs) {
    const { M_load, V_load, Axial_load } = final_loads;
    const { total_flange_demand_tension, total_flange_demand_compression, Hw, moment_arm_flange, flange_force_from_moment, axial_per_flange, Mu_resisted_by_web } = demands;
    const isCapacityDesign = rawInputs.develop_capacity_check;
    const loadNote = isCapacityDesign ? ' (Calculated from Member Capacity)' : ' (User Input)';

    const rows = [
        `<tr><td>Design Moment (M)</td><td>${M_load.toFixed(2)} kip-ft</td><td>${loadNote}</td></tr>`,
        `<tr><td>Design Shear (V)</td><td>${V_load.toFixed(2)} kips</td><td>${loadNote}</td></tr>`,
        `<tr><td>Design Axial (P)</td><td>${Axial_load.toFixed(2)} kips</td><td>(User Input)</td></tr>`,
        `<tr><td colspan="3" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Load Distribution</td></tr>`,
        `<tr><td>&nbsp;&nbsp;&nbsp;Flange Force from Moment</td><td>T<sub>M</sub> = M / (d-t<sub>f</sub>) = (${M_load.toFixed(2)}*12) / ${moment_arm_flange.toFixed(3)}</td><td>${flange_force_from_moment.toFixed(2)} kips</td></tr>`,
        `<tr><td>&nbsp;&nbsp;&nbsp;Flange Force from Axial</td><td>T<sub>P</sub> = P / 2 = ${Axial_load.toFixed(2)} / 2</td><td>${axial_per_flange.toFixed(2)} kips</td></tr>`,
        `<tr class="font-semibold"><td>&nbsp;&nbsp;&nbsp;Total Flange Tension</td><td>T<sub>u</sub> = T<sub>M</sub> + T<sub>P</sub></td><td>${total_flange_demand_tension.toFixed(2)} kips</td></tr>`,
        `<tr class="font-semibold"><td>&nbsp;&nbsp;&nbsp;Total Flange Compression</td><td>C<sub>u</sub> = T<sub>M</sub> - T<sub>P</sub></td><td>${total_flange_demand_compression.toFixed(2)} kips</td></tr>`,
        `<tr><td colspan="3" class="p-0 h-1 bg-gray-200 dark:bg-gray-700 border-0"></td></tr>`,
        `<tr class="font-semibold"><td>&nbsp;&nbsp;&nbsp;Shear on Web Splice</td><td>V<sub>web</sub> = V</td><td>${V_load.toFixed(2)} kips</td></tr>`,
        `<tr><td>&nbsp;&nbsp;&nbsp;Moment Resisted by Web</td><td>M<sub>web</sub> = M<sub>total</sub> - M<sub>flange_splice</sub></td><td>${Mu_resisted_by_web.toFixed(2)} kip-in</td></tr>`,
        `<tr class="font-semibold"><td>&nbsp;&nbsp;&nbsp;Horizontal Force on Web</td><td>H<sub>w</sub> = M<sub>web</sub> / (0.75 * H<sub>wp</sub>)</td><td>${Hw.toFixed(2)} kips</td></tr>`
    ];

    return createReportTable({
        id: 'splice-load-summary-section',
        caption: 'Load Summary',
        headers: ['Load Type / Distribution', 'Calculation', 'Magnitude'],
        rows: rows
    });
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

    let html = `
    <div id="splice-input-summary-section" class="report-section-copyable">
        <div class="flex justify-between items-center">
            <h3 class="report-header">Input Summary</h3>
            <button data-copy-target-id="splice-input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden" data-copy-ignore>Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2">
                <caption class="report-caption">General & Member Properties</caption>
                <tbody>
                    <tr><td>Design Method</td><td>${design_method}</td></tr>
                    <tr><td>Splice Gap</td><td>${gap}"</td></tr>
                    <tr><td class="font-semibold">Member</td><td>W-Shape (d=${member_d}", b<sub>f</sub>=${member_bf}", t<sub>f</sub>=${member_tf}", t<sub>w</sub>=${member_tw}")</td></tr>
                    <tr><td>Member Material</td><td>F<sub>y</sub>=${member_Fy} ksi, F<sub>u</sub>=${member_Fu} ksi</td></tr>
                </tbody>
            </table>

            <table class="w-full mt-4">
                <caption class="report-caption">Flange Splice Details</caption>
                <tbody>
                    <tr><td class="font-semibold">Outer Plate</td><td>PL ${H_fp}" &times; ${L_fp}" &times; ${t_fp}"</td></tr>
                    <tr><td>Outer Plate Material</td><td>F<sub>y</sub>=${flange_plate_Fy} ksi, F<sub>u</sub>=${flange_plate_Fu} ksi</td></tr>
                    ${num_flange_plates == 2 ? `
                    <tr><td class="font-semibold">Inner Plate</td><td>2 x PL ${H_fp_inner}" &times; ${L_fp_inner}" &times; ${t_fp_inner}"</td></tr>
                    <tr><td>Inner Plate Material</td><td>F<sub>y</sub>=${flange_plate_Fy_inner} ksi, F<sub>u</sub>=${flange_plate_Fu_inner} ksi</td></tr>
                    ` : ''}
                </tbody>
            </table>

            <table class="w-full mt-4">
                <caption class="report-caption">Flange Bolt Details</caption>
                <tbody>
                    <tr><td>Configuration</td><td>${Nc_fp * Nr_fp * 4} total bolts (${2*Nc_fp} cols &times; ${2 * Nr_fp} rows )</td></tr>
                    <tr><td>Bolt Details</td><td>&empty;${D_fp}" ${bolt_grade_fp} (${threads_included_fp ? 'Threads Included' : 'Threads Excluded'})</td></tr>
                    <tr><td>Spacing (Pitch, S1)</td><td>${S1_col_spacing_fp}"</td></tr>
                    <tr><td>Spacing (Gage, g)</td><td>${g_gage_fp}"</td></tr>
                    <tr><td>Spacing (Row, S2)</td><td>${S2_row_spacing_fp}"</td></tr>
                    <tr><td>End Distance (S3)</td><td>${S3_end_dist_fp}"</td></tr>
                </tbody>
            </table>

            <table class="w-full mt-4">
                <caption class="report-caption">Web Splice Details</caption>
                <tbody>
                    <tr><td class="font-semibold">Web Plate(s)</td><td>${num_web_plates} &times; PL ${H_wp}" &times; ${L_wp }" &times; ${t_wp}"</td></tr>
                    <tr><td>Web Plate Material</td><td>F<sub>y</sub>=${web_plate_Fy} ksi, F<sub>u</sub>=${web_plate_Fu} ksi</td></tr>
                </tbody>
            </table>

            <table class="w-full mt-4">
                <caption class="report-caption">Web Bolt Details</caption>
                <tbody>
                    <tr><td>Configuration</td><td>${Nc_wp * Nr_wp * 2} total bolts (${2*Nc_wp} cols &times; ${2*Nr_wp} rows)</td></tr>
                    <tr><td>Bolt Details</td><td>&empty;${D_wp}" ${bolt_grade_wp} (${threads_included_wp ? 'Threads Included' : 'Threads Excluded'})</td></tr>
                    <tr><td>Spacing (Pitch, S4)</td><td>${S4_col_spacing_wp}"</td></tr>
                    <tr><td>Spacing (Gage, S5)</td><td>${S5_row_spacing_wp}"</td></tr>
                    <tr><td>End Distance (S6)</td><td>${S6_end_dist_wp}"</td></tr>
                </tbody>
            </table>
        </div>
    </div>`;
    return html;
}

function renderResults(results, rawInputs) {
    const { checks, geomChecks, inputs, final_loads, demands } = results; // `inputs` here are the potentially modified ones from the calc
    let optimizationHtml = '';
	if (results.optimizationLog && results.optimizationLog.length > 0) {
		optimizationHtml = `<div class="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 my-4 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-600" id="optimization-log-section">
			<p class="font-bold">Optimization Log:</p>
			<ul class="list-disc list-inside mt-2 text-sm">${results.optimizationLog.map(log => `<li>${log}</li>`).join('')}</ul>
		</div>`;
	}

    // --- Geometry Checks Table ---
    const geomRows = [];
    const addGeomRow = (name, data, isMaxCheck = false) => {
        const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const limit_val = isMaxCheck ? data.max : data.min;
        const limit_label = isMaxCheck ? 'Maximum' : 'Minimum';
        geomRows.push(`<tr><td>${name} (${limit_label})</td><td>${data.actual.toFixed(3)}</td><td>${limit_val.toFixed(3)}</td><td>${status}</td></tr>`);
    };

    addGeomRow('Flange Bolt Edge Distance (Long.)', geomChecks['Flange Bolts'].edge_dist_long);
    addGeomRow('Flange Bolt Edge Distance (Tran.)', geomChecks['Flange Bolts'].edge_dist_tran);
    addGeomRow('Flange Bolt Edge Distance (Gap Side)', geomChecks['Flange Bolts'].edge_dist_gap);
    addGeomRow('Flange Bolt Spacing (Pitch)', geomChecks['Flange Bolts'].spacing_col);
    addGeomRow('Flange Bolt Spacing (Gage)', geomChecks['Flange Bolts'].spacing_row);
    addGeomRow('Flange Bolt Spacing (Pitch)', geomChecks['Flange Bolts'].max_spacing_col, true);
    addGeomRow('Flange Bolt Spacing (Gage)', geomChecks['Flange Bolts'].max_spacing_row, true);
    addGeomRow('Web Bolt Edge Distance (Long.)', geomChecks['Web Bolts'].edge_dist_long);
    addGeomRow('Web Bolt Edge Distance (Tran.)', geomChecks['Web Bolts'].edge_dist_tran);
    addGeomRow('Web Bolt Edge Distance (Gap Side)', geomChecks['Web Bolts'].edge_dist_gap);
    addGeomRow('Web Bolt Spacing (Pitch)', geomChecks['Web Bolts'].spacing_col);
    addGeomRow('Web Bolt Spacing (Gage)', geomChecks['Web Bolts'].spacing_row);
    addGeomRow('Web Bolt Spacing (Pitch)', geomChecks['Web Bolts'].max_spacing_col, true);
    addGeomRow('Web Bolt Spacing (Gage)', geomChecks['Web Bolts'].max_spacing_row, true);

    const geometryTableHtml = createReportTable({
        id: 'splice-geom-checks-section',
        caption: 'Geometry & Spacing Checks (AISC J3)',
        headers: ['Item', 'Actual (in)', 'Limit (in)', 'Status'],
        rows: geomRows
    });

    // --- Load Summary Table ---
    const loadSummaryHtml = renderLoadSummary(rawInputs, final_loads, demands, inputs);

    // --- Strength Checks Table ---
    const strengthRows = [];
    let checkCounter = 0;
    const addStrengthRow = (name, data, isHeader = false) => {
        if (isHeader) {
            strengthRows.push(`<tr><td colspan="5" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">${name}</td></tr>`);
            return;
        }
        if (!data || !data.check) return;

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
        if (name === 'Plate Thickness for Prying') { demand_unit = 'in'; capacity_unit = 'in (req)'; }
        if (name === 'Beam Flexural Rupture') { display_demand /= 12.0; display_capacity /= 12.0; demand_unit = 'kip-ft'; capacity_unit = 'kip-ft'; }

        const breakdownHtml = generateSpliceBreakdownHtml(name, data, inputs);

        strengthRows.push(`
            <tr class="border-t dark:border-gray-700">
                <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                <td>${display_demand.toFixed(2)} ${demand_unit}</td><td>${display_capacity.toFixed(2)} ${capacity_unit}</td><td>${ratio.toFixed(3)}</td><td>${status}</td>
            </tr>
            <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td></tr>
        `);
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
        'Web Bolt Group Shear',
        'Web Bolt Tension with Prying',
        'Web Plate Gross Shear Yield',
        'Web Plate Net Shear Rupture',
        'Web Plate Block Shear',
        'Web Plate Bolt Bearing'
    ];

    const memberChecks = [
        'Beam Flange Tensile Rupture',
        'Beam Flange Block Shear',
        'Beam Web Bolt Bearing',
        'Beam Flexural Rupture',
        'Beam Web Shear Yielding',
        'Beam Web Shear Rupture',
        'Beam Section Tensile Rupture'
    ];

    // Render each section by iterating through the defined lists
    addStrengthRow('Flange Plate Checks', null, true);
    flangePlateChecks.forEach(name => {
        if (checks[name]) {
            addStrengthRow(name, checks[name]);
        }
    });

    addStrengthRow('Web Plate Checks', null, true);
    webPlateChecks.forEach(name => {
        if (checks[name]) {
            addStrengthRow(name, checks[name]);
        }
    });

    addStrengthRow('Member Web and Flange Checks', null, true);
    memberChecks.forEach(name => {
        if (checks[name]) {
            addStrengthRow(name, checks[name]);
        }
    });

    const strengthTableHtml = createReportTable({
        id: 'splice-strength-checks-section',
        caption: `Strength Checks (${inputs.design_method})`,
        headers: ['Limit State', 'Demand', 'Capacity', 'Ratio', 'Status'],
        rows: strengthRows
    });

    // --- Final Assembly ---
    const finalHtml = `
        <div id="splice-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
                <div class="flex justify-end flex-wrap gap-2 -mt-2 -mr-2 print-hidden">
                    <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm print-hidden" data-state="hidden">Show All Details</button>
                    <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm print-hidden">Copy Full Report</button>
                </div>
                <h2 class="report-title text-center">Splice Check Results</h2>
                ${renderSpliceInputSummary(rawInputs)}
                ${optimizationHtml} 
                ${geometryTableHtml}
                ${loadSummaryHtml}
                ${strengthTableHtml}
        </div>`;

    document.getElementById('results-container').innerHTML = `<div id="report-wrapper">${finalHtml}</div>`;
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

document.addEventListener('DOMContentLoaded', () => {
    // --- Standard page setup ---
    injectHeader({ activePage: 'splice', pageTitle: 'AISC Splice Connection Checker', headerPlaceholderId: 'header-placeholder' });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();
    populateMaterialDropdowns();
    populateBoltGradeDropdowns();
    
    // --- Dimension Toggle Logic ---
    const toggleDimensionsBtn = document.getElementById('toggle-dimensions-btn');
    if (toggleDimensionsBtn) {
        toggleDimensionsBtn.addEventListener('click', () => {
            if (dimensionElements && dimensionElements.meshes.length > 0) {
                const isVisible = !dimensionElements.meshes[0].isVisible;
                dimensionElements.meshes.forEach(mesh => { if(mesh) mesh.isVisible = isVisible; });
                dimensionElements.labels.forEach(label => { if(label) label.isVisible = isVisible; });
                toggleDimensionsBtn.textContent = isVisible ? 'Hide Dimensions' : 'Show Dimensions';
            }
        });
    }


    // --- Get all input IDs for the main calculation logic ---
    const allCalcInputIds = getAllInputIdsOnPage();

    const handleRunCheck = createCalculationHandler({
        inputIds: allCalcInputIds,
        storageKey: 'splice-inputs',
        validationRuleKey: 'splice',
        gatherInputsFunction: () => gatherInputsFromIds(allCalcInputIds),
        calculatorFunction: (rawInputs) => spliceCalculator.run(rawInputs),
        renderFunction: renderResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });

	document.getElementById('run-check-btn').addEventListener('click', handleRunCheck);
	document.getElementById('save-inputs-btn').addEventListener('click', createSaveInputsHandler(allCalcInputIds, 'splice-inputs.txt'));
	document.getElementById('load-inputs-btn').addEventListener('click', () => {
		initiateLoadInputsFromFile('file-input', (loadedInputs) => {
			handleRunCheck(); // Run check after loading
			draw3dSpliceDiagram(); // Redraw diagram after loading
		});
    });
    
    // --- Attach event listeners for DYNAMIC diagram updates with debouncing ---
    const debouncedRedraw3D = debounce(draw3dSpliceDiagram, 300);

    diagramInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Redraw 3D diagram after a short delay to prevent lag and race conditions.
            el.addEventListener('input', debouncedRedraw3D);
            el.addEventListener('change', debouncedRedraw3D); // For select dropdowns
        }
    });

    // --- Load saved data and perform initial draw ---
    loadInputsFromLocalStorage('splice-inputs', allCalcInputIds, () => {
        handleRunCheck();
        setTimeout(draw3dSpliceDiagram, 100); // Initial draw after a short delay
    });

    // If no data is loaded from local storage, draw the initial state
    if (!localStorage.getItem('splice-inputs')) {
         setTimeout(draw3dSpliceDiagram, 100);
    }
    
	document.getElementById('results-container').addEventListener('click', (event) => {
        const button = event.target.closest('.toggle-details-btn');
        if (button) {
            const detailId = button.dataset.toggleId;
            const row = document.getElementById(detailId);
            if (row) {
                row.classList.toggle('is-visible');
                button.textContent = row.classList.contains('is-visible') ? '[Hide]' : '[Show]';
            }
        }
        if (event.target.id === 'toggle-all-details-btn') {
            const mainButton = event.target;
            const shouldShow = mainButton.dataset.state === 'hidden';
            const allDetailRows = document.querySelectorAll('#results-container .details-row');
            const allToggleButtons = document.querySelectorAll('#results-container .toggle-details-btn');

            allDetailRows.forEach(row => {
                row.classList.toggle('is-visible', shouldShow);
            });

            allToggleButtons.forEach(button => {
                button.textContent = shouldShow ? '[Hide]' : '[Show]';
            });

            mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
            mainButton.textContent = shouldShow ? 'Hide All Details' : 'Show All Details';
        }
        const copyBtn = event.target.closest('.copy-section-btn');
        if (copyBtn) {
            const targetId = copyBtn.dataset.copyTargetId;
            if (targetId) {
                handleCopyToClipboard(targetId, 'feedback-message');
            }
        }
        if (event.target.id === 'copy-report-btn') {
            handleCopyToClipboard('results-container', 'feedback-message');
        }
        if (event.target.id === 'print-report-btn') {
            window.print();
        }
        if (event.target.id === 'download-pdf-btn') {
            handleDownloadPdf('results-container', 'Splice-Report.pdf');
        }
        if (event.target.id === 'download-word-btn') {
            handleDownloadWord('splice-report-content', 'Splice-Report.doc');
        }
	});
});