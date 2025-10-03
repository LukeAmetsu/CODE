/**
 * Factory function to create a generic SVG diagram drawer.
 * This reduces code duplication between the flange and web diagram functions.
 * @param {object} config - Configuration object for the specific diagram.
 * @returns {function} A function that draws the configured diagram.
 */
function createDiagramDrawer(config) {
    return function() {
        const svg = document.getElementById(config.svgId);
        if (!svg) return;
        svg.innerHTML = ''; // Clear previous drawing

        const getVal = (id, isString = false) => {
            const el = document.getElementById(id);
            if (!el) return isString ? '' : 0;
            return isString ? el.value : parseFloat(el.value) || 0;
        };
        
        // Gather all inputs defined in the config
        const inputs = {};
        config.inputIds.forEach(id => {
            inputs[id] = getVal(id, id === 'column_type'); // Special handling for string input
        });

        // Drawing parameters
        const { W, H } = config.viewBox;
        const pad = 50; // Increased padding to ensure labels fit
        const cx = W / 2;
        const cy = H / 2;

        // Calculate scale using a provided function
        const { total_len, total_h } = config.getScaleDimensions(inputs);
        const scale = Math.min((W - 2 * pad) / total_len, (H - 2 * pad) / total_h);
        if (!isFinite(scale) || scale <= 0) return;

        // Dynamically set the viewBox to fit the content
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

        const ns = "http://www.w3.org/2000/svg";
        const createEl = (tag, attrs) => {
            const el = document.createElementNS(ns, tag);
            for (const k in attrs) el.setAttribute(k, attrs[k]);
            return el;
        };

        // Create a drawing context to pass to the specific drawing functions
        const drawContext = { svg, inputs, W, H, cx, cy, scale, createEl };

        // Call the specific drawing functions from the configuration
        config.drawPlate(drawContext);
        config.drawMember(drawContext);
        config.drawBolts(drawContext);
        config.drawDimensions(drawContext);
    };
}

const drawBasePlateDiagram = createDiagramDrawer({
    svgId: 'baseplate-diagram',
    viewBox: { W: 500, H: 350 }, // Adjusted default viewBox
    inputIds: ['base_plate_length_N', 'base_plate_width_B', 'column_depth_d', 'column_flange_width_bf', 'column_flange_tf', 'column_web_tw', 'column_type', 'anchor_bolt_diameter', 'bolt_spacing_N', 'bolt_spacing_B', 'num_bolts_N', 'num_bolts_B'],
    getScaleDimensions: (i) => ({
        total_len: i.base_plate_width_B,
        total_h: i.base_plate_length_N
    }),
    drawPlate: ({ svg, inputs, cx, cy, scale, createEl }) => {
        const sN = inputs.base_plate_length_N * scale;
        const sB = inputs.base_plate_width_B * scale;
        svg.appendChild(createEl('rect', { x: cx - sB / 2, y: cy - sN / 2, width: sB, height: sN, class: 'svg-plate' }));
    },
    drawMember: ({ svg, inputs, cx, cy, scale, createEl }) => {
        if (inputs.column_type === 'Round HSS') {
            const s_diam = inputs.column_depth_d * scale;
            svg.appendChild(createEl('circle', { cx: cx, cy: cy, r: s_diam / 2, class: 'svg-member' }));
        } else { // Wide Flange
            const d = inputs.column_depth_d;
            const bf = inputs.column_flange_width_bf;
            const tf = inputs.column_flange_tf;
            const tw = inputs.column_web_tw;

            // Draw the I-beam shape
            svg.appendChild(createEl('rect', { x: cx - (bf * scale) / 2, y: cy - (d * scale) / 2, width: bf * scale, height: tf * scale, class: 'svg-member' })); // Top Flange
            svg.appendChild(createEl('rect', { x: cx - (bf * scale) / 2, y: cy + (d * scale) / 2 - (tf * scale), width: bf * scale, height: tf * scale, class: 'svg-member' })); // Bottom Flange
            svg.appendChild(createEl('rect', { x: cx - (tw * scale) / 2, y: cy - (d * scale) / 2 + (tf * scale), width: tw * scale, height: (d - 2 * tf) * scale, class: 'svg-member' })); // Web
        }
    },
    drawBolts: ({ svg, inputs, cx, cy, scale, createEl }) => {
        const s_bolt_N = inputs.bolt_spacing_N * scale;
        const s_bolt_B = inputs.bolt_spacing_B * scale; // This is spacing between bolts in a row
        const bolt_r = (inputs.anchor_bolt_diameter * scale) / 2;

        const num_cols = inputs.num_bolts_B;
        const num_rows = inputs.num_bolts_N;

        if (num_rows <= 0 || num_cols <= 0) return; // Don't draw if bolt config is invalid

        // Calculate starting position to center the bolt group
        const total_bolt_group_width = (num_cols - 1) * s_bolt_B;
        const total_bolt_group_height = (num_rows - 1) * s_bolt_N;
        const start_x = cx - total_bolt_group_width / 2;
        const start_y = cy - total_bolt_group_height / 2;

        for (let r = 0; r < num_rows; r++) {
            for (let c = 0; c < num_cols; c++) {
                const bolt_cx = start_x + c * s_bolt_B;
                const bolt_cy = start_y + r * s_bolt_N;
                svg.appendChild(createEl('circle', { cx: bolt_cx, cy: bolt_cy, r: bolt_r, class: 'svg-bolt' }));
            }
        }
    },
    drawDimensions: ({ svg, inputs, cx, cy, scale, createEl }) => {
        const sN = inputs.base_plate_length_N * scale;
        const sB = inputs.base_plate_width_B * scale;
        const sd = inputs.column_depth_d * scale;
        // Plate Width (B)
        svg.appendChild(createEl('line', { x1: cx - sB / 2, y1: cy - sN / 2 - 10, x2: cx + sB / 2, y2: cy - sN / 2 - 10, class: 'svg-dim' }));
        svg.appendChild(createEl('text', { x: cx, y: cy - sN / 2 - 15, class: 'svg-dim-text' })).textContent = `B = ${inputs.base_plate_width_B}"`;
        // Plate Length (N)
        svg.appendChild(createEl('line', { x1: cx - sB / 2 - 10, y1: cy - sN / 2, x2: cx - sB / 2 - 10, y2: cy + sN / 2, class: 'svg-dim' }));
        svg.appendChild(createEl('text', { x: cx - sB / 2 - 15, y: cy, class: 'svg-dim-text', transform: `rotate(-90 ${cx - sB/2 - 15},${cy})` })).textContent = `N = ${inputs.base_plate_length_N}"`;
        
        if (inputs.column_type === 'Round HSS') {
            svg.appendChild(createEl('line', { x1: cx - sd / 2, y1: cy - sd / 2 - 5, x2: cx + sd / 2, y2: cy - sd / 2 - 5, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: cx, y: cy - sd / 2 - 10, class: 'svg-dim-text' })).textContent = `D = ${inputs.column_depth_d}"`;
        } else { // Wide Flange
            const sbf = inputs.column_flange_width_bf * scale;
            svg.appendChild(createEl('line', { x1: cx - sbf / 2 - 5, y1: cy - sd / 2, x2: cx - sbf / 2 - 5, y2: cy + sd / 2, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: cx - sbf / 2 - 10, y: cy, class: 'svg-dim-text', transform: `rotate(-90 ${cx - sbf/2 - 10},${cy})` })).textContent = `d = ${inputs.column_depth_d}"`;
            svg.appendChild(createEl('line', { x1: cx - sbf / 2, y1: cy - sd / 2 - 5, x2: cx + sbf / 2, y2: cy - sd / 2 - 5, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: cx, y: cy - sd / 2 - 10, class: 'svg-dim-text' })).textContent = `bf = ${inputs.column_flange_width_bf}"`;
        }

        // Bolt Spacing Dimensions
        const { num_bolts_N, num_bolts_B, bolt_spacing_N, bolt_spacing_B } = inputs;
        const s_bolt_N = bolt_spacing_N * scale;
        const s_bolt_B = bolt_spacing_B * scale;

        const total_bolt_group_width = (num_bolts_B - 1) * s_bolt_B;
        const total_bolt_group_height = (num_bolts_N - 1) * s_bolt_N;
        const start_x = cx - total_bolt_group_width / 2;
        const start_y = cy - total_bolt_group_height / 2;

        if (num_bolts_B > 1) {
            const dim_y_bolt = cy + sN / 2 + 20;
            svg.appendChild(createEl('line', { x1: start_x, y1: dim_y_bolt, x2: start_x + s_bolt_B, y2: dim_y_bolt, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: start_x + s_bolt_B / 2, y: dim_y_bolt + 15, class: 'svg-dim-text' })).textContent = `B Spacing = ${bolt_spacing_B}"`;
        }
        if (num_bolts_N > 1) {
            const dim_x_bolt = cx - sB / 2 - 40;
            svg.appendChild(createEl('line', { x1: dim_x_bolt, y1: start_y, x2: dim_x_bolt, y2: start_y + s_bolt_N, class: 'svg-dim' }));
            svg.appendChild(createEl('text', { x: dim_x_bolt - 5, y: start_y + s_bolt_N / 2, class: 'svg-dim-text', transform: `rotate(-90 ${dim_x_bolt - 5},${start_y + s_bolt_N / 2})` })).textContent = `N Spacing = ${bolt_spacing_N}"`;
        }
    }
});

/**
 * Draws an interactive 3D visualization of the base plate connection using Three.js.
 */
function draw3dBasePlateDiagram() {
    const container = document.getElementById('3d-diagram-container');
    if (!container || typeof THREE === 'undefined') return;

    // --- 1. Gather Inputs ---
    const getVal = (id, isString = false) => {
        const el = document.getElementById(id);
        if (!el) return isString ? '' : 0;
        return isString ? el.value : parseFloat(el.value) || 0;
    };
    const inputs = gatherInputsFromIds(basePlateInputIds);
    inputs.weld_size = getVal('weld_size');

    // --- 2. Scene Setup ---
    container.innerHTML = '';
    const scene = new THREE.Scene();
    const isDarkMode = document.documentElement.classList.contains('dark');
    scene.background = new THREE.Color(isDarkMode ? 0x2d3748 : 0xf0f0f0); // Dark gray-blue for dark mode
    
    // FIX: The container's height is 0 due to the aspect-ratio padding trick.
    // We must use the container's width for both width and height to match the 1:1 aspect ratio set in CSS.
    const width = container.clientWidth;
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000); // Use 1:1 aspect ratio for the camera
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, width); // Set renderer to be a square based on the container's width
    container.appendChild(renderer.domElement);
    container.renderer = renderer; // Store renderer for access by other functions
    container.scene = scene;       // Store scene
    container.camera = camera;     // Store camera
    
    const labelRenderer = new THREE.CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none'; // Allow orbit controls to work
    container.appendChild(labelRenderer.domElement);

    // --- 3. Lighting ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(50, 100, 75);
    scene.add(light);

    // --- Label Helper ---
    function createLabel(text) {
        const div = document.createElement('div');
        div.className = 'text-xs bg-black bg-opacity-60 text-white px-1.5 py-0.5 rounded-md';
        div.textContent = text;
        return new THREE.CSS2DObject(div);
    }

    // --- 4. Materials ---
    const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x607d8b, metalness: 0.5, roughness: 0.6 });
    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0x455a64, metalness: 0.7, roughness: 0.5 });
    const boltMaterial = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.8, roughness: 0.4 });
    const concreteMaterial = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.9, metalness: 0.1 });
    const weldMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.3, roughness: 0.7, transparent: true, opacity: 0.8 });

    // --- 5. Geometries ---
    // Concrete Pedestal
    const pedestalHeight = Math.max(12, inputs.anchor_embedment_hef * 1.5); // Give it a reasonable height for visualization
    const pedestalGeom = new THREE.BoxGeometry(inputs.pedestal_B, pedestalHeight, inputs.pedestal_N);
    const pedestalMesh = new THREE.Mesh(pedestalGeom, concreteMaterial);
    // Position the top of the pedestal at the bottom of the base plate
    pedestalMesh.position.y = -inputs.provided_plate_thickness_tp - (pedestalHeight / 2);
    scene.add(pedestalMesh);

    // Base Plate
    const plateGeom = new THREE.BoxGeometry(inputs.base_plate_width_B, inputs.provided_plate_thickness_tp, inputs.base_plate_length_N);
    const plateMesh = new THREE.Mesh(plateGeom, plateMaterial);
    plateMesh.position.y = -inputs.provided_plate_thickness_tp / 2;
    
    const labelN = createLabel(`N = ${inputs.base_plate_length_N}"`);
    labelN.position.set(inputs.base_plate_width_B / 2 + 4, -inputs.provided_plate_thickness_tp / 2, 0);
    plateMesh.add(labelN);
    const labelB = createLabel(`B = ${inputs.base_plate_width_B}"`);
    labelB.position.set(0, -inputs.provided_plate_thickness_tp / 2, inputs.base_plate_length_N / 2 + 4);
    plateMesh.add(labelB);
    scene.add(plateMesh);

    // Column
    if (inputs.column_type === 'Wide Flange') {
        const colGroup = new THREE.Group();
        const topFlangeGeom = new THREE.BoxGeometry(inputs.column_flange_width_bf, inputs.column_flange_tf, inputs.column_depth_d);
        const topFlange = new THREE.Mesh(topFlangeGeom, columnMaterial);
        topFlange.position.y = (inputs.column_depth_d / 2) - (inputs.column_flange_tf / 2); // Position top flange at the top
        const bottomFlange = topFlange.clone();
        bottomFlange.position.y = -(inputs.column_depth_d / 2) + (inputs.column_flange_tf / 2); // Position bottom flange at the bottom
        const webGeom = new THREE.Mesh(new THREE.BoxGeometry(inputs.column_web_tw, inputs.column_depth_d - 2 * inputs.column_flange_tf, inputs.column_depth_d), columnMaterial); // Web is in between
        
        colGroup.add(topFlange, bottomFlange, webGeom);
        colGroup.rotation.x = -Math.PI / 2; // Rotate to stand up
        colGroup.position.y = 12 / 2; // Position column stub

        const labelD = createLabel(`d = ${inputs.column_depth_d}"`);
        labelD.position.set(inputs.column_flange_width_bf / 2 + 4, 0, 0);
        colGroup.add(labelD);
        const labelBf = createLabel(`bf = ${inputs.column_flange_width_bf}"`);
        labelBf.position.set(0, inputs.column_depth_d / 2 + 4, 0);
        colGroup.add(labelBf);

        scene.add(colGroup);
    } else if (inputs.column_type === 'Round HSS') { // Round HSS
        const hssGeom = new THREE.CylinderGeometry(inputs.column_depth_d / 2, inputs.column_depth_d / 2, 12, 32); // 12" tall stub
        const hssMesh = new THREE.Mesh(hssGeom, columnMaterial);
        hssMesh.position.y = 12 / 2;
        const labelD_hss = createLabel(`D = ${inputs.column_depth_d}"`);
        labelD_hss.position.set(inputs.column_depth_d / 2 + 4, 6, 0);
        hssMesh.add(labelD_hss);
        scene.add(hssMesh);
    }

    // Weld Geometry
    if (inputs.weld_size > 0) {
        const w = inputs.weld_size;
        const weldGroup = new THREE.Group();
        weldGroup.position.y = w / 2; // Position weld on top of the plate

        if (inputs.column_type === 'Wide Flange') {
            const d = inputs.column_depth_d, bf = inputs.column_flange_width_bf, tf = inputs.column_flange_tf, tw = inputs.column_web_tw;
            // Flange welds
            weldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(bf, w, w), weldMaterial).translateZ(d/2 - w/2));
            weldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(bf, w, w), weldMaterial).translateZ(-d/2 + w/2));
            // Web welds
            weldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(w, w, d - 2*tf), weldMaterial).translateX(tw/2 + w/2));
            weldGroup.add(new THREE.Mesh(new THREE.BoxGeometry(w, w, d - 2*tf), weldMaterial).translateX(-tw/2 - w/2));
        } else { // Round HSS
            weldGroup.add(new THREE.Mesh(new THREE.TorusGeometry(inputs.column_depth_d/2, w, 16, 64), weldMaterial).rotateX(Math.PI/2));
        }
        scene.add(weldGroup);
    }

    // Anchor Bolts
    const startX = -(inputs.num_bolts_B - 1) * inputs.bolt_spacing_B / 2;
    const startZ = -(inputs.num_bolts_N - 1) * inputs.bolt_spacing_N / 2;
    for (let r = 0; r < inputs.num_bolts_N; r++) {
        for (let c = 0; c < inputs.num_bolts_B; c++) {
            const boltGeom = new THREE.CylinderGeometry(inputs.anchor_bolt_diameter / 2, inputs.anchor_bolt_diameter / 2, inputs.anchor_embedment_hef, 16);
            const boltMesh = new THREE.Mesh(boltGeom, boltMaterial);
            boltMesh.position.set(startX + c * inputs.bolt_spacing_B, -inputs.provided_plate_thickness_tp - inputs.anchor_embedment_hef / 2, startZ + r * inputs.bolt_spacing_N);
            // Add label to the first bolt only
            if (r === 0 && c === 0) {
                const labelHef = createLabel(`hef = ${inputs.anchor_embedment_hef}"`);
                labelHef.position.set(inputs.anchor_bolt_diameter / 2 + 2, -inputs.anchor_embedment_hef / 2, 0);
                boltMesh.add(labelHef);
            }
            scene.add(boltMesh);
        }
    }

    // Bolt Spacing Labels
    if (inputs.num_bolts_B > 1) {
        const labelB_spacing = createLabel(`B Spacing = ${inputs.bolt_spacing_B}"`);
        labelB_spacing.position.set(startX + inputs.bolt_spacing_B / 2, 0, startZ - 4);
        scene.add(labelB_spacing);
    }
    if (inputs.num_bolts_N > 1) {
        const labelN_spacing = createLabel(`N Spacing = ${inputs.bolt_spacing_N}"`);
        labelN_spacing.position.set(startX - 4, 0, startZ + inputs.bolt_spacing_N / 2);
        // Rotate the label to be parallel with the dimension
        labelN_spacing.element.style.transform += ' rotate(90deg)';
        scene.add(labelN_spacing);
    }

    // --- 6. Camera and Controls ---
    camera.position.set(Math.max(inputs.pedestal_B, inputs.pedestal_N) * 1.2, Math.max(inputs.pedestal_B, inputs.pedestal_N) * 0.8, Math.max(inputs.pedestal_B, inputs.pedestal_N) * 1.2);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const animate = () => { requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); labelRenderer.render(scene, camera); };
    animate();
}

const basePlateInputIds = [
    'design_method', 'design_code', 'unit_system', 'base_plate_material', 'base_plate_Fy',
    'concrete_fc', 'pedestal_N', 'pedestal_B', 'anchor_bolt_Fut', 'anchor_bolt_Fnv', 'weld_electrode', 'weld_Fexx', 
    'base_plate_length_N', 'base_plate_width_B', 'provided_plate_thickness_tp', 'column_depth_d', 'column_web_tw', 'column_flange_tf', 'num_bolts_N', 'num_bolts_B',
    'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter',
    'anchor_embedment_hef',
    'bolt_spacing_N', 'bolt_spacing_B', 'bolt_type', 'weld_size', 'axial_load_P_in',
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
        const { anchor_bolt_diameter: db, bolt_spacing_N, bolt_spacing_B, bolt_type, base_plate_length_N, base_plate_width_B, num_bolts_N, num_bolts_B, pedestal_N, pedestal_B } = inputs;
        const checks = {};
        const tolerance = 1e-9;

        // --- Calculate Actual Edge Distances ---
        // These are the distances from the center of the outermost bolts to the edge of the concrete pedestal.
        const bolt_group_length = (num_bolts_N - 1) * bolt_spacing_N;
        const bolt_group_width = (num_bolts_B - 1) * bolt_spacing_B;
        const ca1_actual = (pedestal_N - bolt_group_length) / 2.0;
        const ca2_actual = (pedestal_B - bolt_group_width) / 2.0;

        // --- ACI 318-19, Section 17.7 - Minimum spacing and edge distance for cast-in anchors ---
        if (bolt_type === 'Cast-in') {
            // ACI 17.7.1: Minimum anchor spacing (s) shall be 4*da for cast-in anchors.
            const s_min = 4 * db; 
            // ACI 17.7.2: Minimum edge distance (ca,min) shall be 6*da for cast-in anchors in tension.
            const ca_min = 6 * db; 

            checks['Min Anchor Spacing (N)'] = { actual: bolt_spacing_N, min: s_min, pass: bolt_spacing_N >= s_min - tolerance };
            checks['Min Anchor Spacing (B)'] = { actual: bolt_spacing_B, min: s_min, pass: bolt_spacing_B >= s_min - tolerance };
            checks['Min Edge Distance (ca1)'] = { actual: ca1_actual, min: ca_min, pass: ca1_actual >= ca_min - tolerance };
            checks['Min Edge Distance (ca2)'] = { actual: ca2_actual, min: ca_min, pass: ca2_actual >= ca_min - tolerance };
        } else { // Post-installed
            // For post-installed anchors, minimum spacing and edge distance are specified by the manufacturer's ESR.
            // This calculator does not have a database for these values, so we cannot perform a check.
            // A warning could be added here if desired.
        }
        return checks;
    }

    function getPhi(limit_state, design_method) {
        const factors = {
            'bearing': { phi: 0.65, omega: 2.31 },
            'bending': { phi: 0.90, omega: 1.67 },
            'anchor_tension_steel': { phi: 0.75, omega: 2.00 },
            'anchor_tension_concrete': { phi: 0.65, omega: 2.31 }, // Breakout
            'anchor_pullout': { phi: 0.70, omega: 2.14 },
            'anchor_side_face': { phi: 0.70, omega: 2.14 },
            'anchor_shear_steel': { phi: 0.65, omega: 2.31 },
            'anchor_shear_concrete': { phi: 0.65, omega: 2.31 }, // Breakout
            'anchor_pryout': { phi: 0.65, omega: 2.31 },
            'weld': { phi: 0.75, omega: 2.00 }
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
        const P_abs = Math.abs(Pu);

        let f_p_max, Y, X, e_x, e_y, bearing_case;
        
        if (P_abs < 1e-6 && (Mux > 0 || Muy > 0)) {
            // --- Pure Moment Case ---
            // Simplified approach assuming neutral axis at plate centerline.
            // Tension T and Compression C form a couple to resist the moment.
            bearing_case = "Pure Moment";
            e_x = Infinity; e_y = Infinity;
            Y = N / 2; X = B / 2; // Assume half the plate is in compression
            const C = (Mux * 12) / (N / 3 + (N - inputs.bolt_spacing_N) / 2); // Simplified lever arm
            f_p_max = (2 * C) / (B * Y);
        } else {
            // --- Combined Axial and Bending Case ---
            e_x = (Mux * 12) / P_abs;
            e_y = (Muy * 12) / P_abs;

            if (e_x <= N / 6 && e_y <= B / 6) {
                // Case 1: Full compression (trapezoidal pressure)
                bearing_case = "Full Bearing";
                f_p_max = (P_abs / (B * N)) * (1 + (6 * e_x) / N + (6 * e_y) / B);
                Y = N; X = B;
            } else if (e_x / N + e_y / B <= 0.5) {
                // Case 2: Partial compression (triangular/trapezoidal pressure, one edge in tension)
                bearing_case = "Partial Bearing";
                // Iterative solution is complex. Use simplified uniaxial check for now.
                // This is conservative as it ignores biaxial effects that might reduce pressure.
                const f_p_x = (P_abs / (B * N)) * (1 + (6 * e_x) / N);
                const f_p_y = (P_abs / (B * N)) * (1 + (6 * e_y) / B);
                f_p_max = Math.max(f_p_x, f_p_y);
                Y = 3 * (N / 2 - e_x); // Effective length for x-axis moment
                X = 3 * (B / 2 - e_y); // Effective width for y-axis moment
            } else {
                // Case 3: Corner bearing (triangular pressure, two edges in tension)
                bearing_case = "Corner Bearing";
                // Simplified approach from DG1 for corner bearing
                const g_x = N / 2 - e_x;
                const g_y = B / 2 - e_y;
                f_p_max = (2 * P_abs) / (3 * g_x * g_y);
                Y = 3 * g_x; X = 3 * g_y;
            }
        }

        const A1 = N * B;
        const A2 = pedestal_N * pedestal_B;
        const A2_A1_ratio = (A1 > 0 && A2 > A1) ? sqrt(A2 / A1) : 1.0;
        const confinement_factor = min(A2_A1_ratio, 2.0);
        const P_p = 0.85 * fc * A1 * confinement_factor;
        const phi = getPhi('bearing', design_method);
        const omega = getPhi('bearing', design_method === 'LRFD' ? 'ASD' : 'LRFD');

        return { // Return pressure in ksi for demand, capacity in kips
            demand: f_p_max,
            check: { Rn: P_p, phi, omega },
            details: { f_p_max, e_x, e_y, Y, X, A1, A2, confinement_factor, Pu, bearing_case }
        };
    }

    function checkPlateBending(inputs, bearing_results) {
        const { base_plate_length_N: N, base_plate_width_B: B, column_depth_d: d, column_flange_width_bf: bf, base_plate_Fy: Fy, provided_plate_thickness_tp: tp, column_type } = inputs;
        const f_p_max = bearing_results.details.f_p_max;

        if (column_type !== 'Wide Flange') return null; // Bending check is for WF columns

        const m = (N - 0.95 * d) / 2.0;
        const n = (B - 0.80 * bf) / 2.0;
        const l = max(m, n); // Simplified 'l' from DG1. For a more complex case, lambda*n' would be needed.
        const t_req = l * sqrt((2 * f_p_max) / (getPhi('bending', inputs.design_method) * Fy));

        return {
            demand: tp,
            check: { Rn: t_req, phi: 1.0, omega: 1.0 },
            details: { m, n, l, t_req }
        };
    }

    /**
     * Calculates the maximum tension force on a single anchor bolt under combined axial load and biaxial bending.
     * @param {object} inputs - The user inputs object.
     * @param {object} bearing_results - The results from the concrete bearing check.
     * @returns {number} The maximum tension force in kips.
     */
    function calculateAnchorTension(inputs, bearing_results) { // FIX: Corrected function name
        const { axial_load_P_in: Pu, moment_Mx_in: Mux, moment_My_in: Muy, base_plate_length_N: N, base_plate_width_B: B, num_bolts_N, num_bolts_B, bolt_spacing_N, bolt_spacing_B } = inputs;
        
        if (!bearing_results || !bearing_results.details) return 0;
        const { f_p_max, Y, X, bearing_case } = bearing_results.details;

        // Calculate bolt group properties
        const num_bolts_total = num_bolts_N * num_bolts_B;
        if (num_bolts_total === 0) return 0;

        let sum_dist_sq = 0;
        const bolt_coords = [];
        const start_x = -(num_bolts_N - 1) * bolt_spacing_N / 2;
        const start_y = -(num_bolts_B - 1) * bolt_spacing_B / 2;

        for (let i = 0; i < num_bolts_N; i++) {
            for (let j = 0; j < num_bolts_B; j++) {
                const x = start_x + i * bolt_spacing_N;
                const y = start_y + j * bolt_spacing_B;
                bolt_coords.push({ x, y });
                sum_dist_sq += x**2 + y**2;
            }
        }

        // Calculate compression resultant and its location
        const C = (f_p_max * X * Y) / 2;
        const c_loc_x = N / 2 - Y / 3;
        const c_loc_y = B / 2 - X / 3;

        // Calculate tension on the most stressed bolt (simplified linear distribution)
        const T_total = (Mux * 12 + Muy * 12 - Math.abs(Pu) * (c_loc_x + c_loc_y)) / (bolt_coords[0].x + bolt_coords[0].y); // Simplified lever arm
        const Tu_max = (Pu / num_bolts_total) + (Mux * 12 * Math.abs(bolt_coords[0].x)) / sum_dist_sq + (Muy * 12 * Math.abs(bolt_coords[0].y)) / sum_dist_sq;

        return max(0, Tu_max);
    }

    // --- Modular Anchor Check Functions (ACI 318-19, Chapter 17) ---

    function checkAnchorSteelTension(inputs) {
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

    function checkAnchorInteraction(Tu_group, Vu, checks) {
        const { 'Anchor Steel Tension': T_steel, 'Anchor Steel Shear': V_steel, 'Anchor Concrete Breakout': T_concrete_breakout, 'Anchor Pullout Strength': T_pullout, 'Anchor Side-Face Blowout': T_sideface, 'Anchor Concrete Shear Breakout': V_concrete_breakout, 'Anchor Concrete Pryout': V_pryout } = checks;

        // --- Steel Interaction ---
        const T_steel_cap = T_steel?.check?.Rn || Infinity;
        const V_steel_cap = V_steel?.check?.Rn || Infinity;
        const phi_T_steel = T_steel?.check?.phi || 1.0;
        const phi_V_steel = V_steel?.check?.phi || 1.0;
        const num_bolts_tension_row = T_steel?.details?.num_bolts_tension_row || 1;
        const num_bolts_total = V_steel?.details?.num_bolts_total || 1;

        const steel_interaction = (Tu_group / (phi_T_steel * T_steel_cap * num_bolts_tension_row)) + (Vu / (phi_V_steel * V_steel_cap * num_bolts_total));

        // --- Concrete Interaction ---
        const T_concrete_cap = Math.min(
            T_concrete_breakout?.check?.Rn || Infinity,
            (T_pullout?.check?.Rn || Infinity) * num_bolts_tension_row,
            T_sideface?.check?.Rn || Infinity
        );
        const V_concrete_cap = Math.min(
            V_concrete_breakout?.check?.Rn || Infinity,
            V_pryout?.check?.Rn || Infinity
        );
        const phi_T_concrete = T_concrete_breakout?.check?.phi || 1.0;
        const phi_V_concrete = V_concrete_breakout?.check?.phi || 1.0;

        const concrete_interaction = (Tu_group / (phi_T_concrete * T_concrete_cap)) + (Vu / (phi_V_concrete * V_concrete_cap));

        return {
            'Anchor Combined Shear and Tension (Steel)': {
                demand: steel_interaction,
                check: { Rn: 1.2, phi: 1.0, omega: 1.0 },
                details: { Tu: Tu_group, Vu, phiTn: phi_T_steel * T_steel_cap * num_bolts_tension_row, phiVn: phi_V_steel * V_steel_cap * num_bolts_total }
            },
            'Anchor Combined Shear and Tension (Concrete)': {
                demand: concrete_interaction,
                check: { Rn: 1.2, phi: 1.0, omega: 1.0 },
                details: { Tu: Tu_group, Vu, phiTn: phi_T_concrete * T_concrete_cap, phiVn: phi_V_concrete * V_concrete_cap }
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
    function performAnchorChecks(inputs, Tu_bolt, bearing_results) {
        const { num_bolts_N, num_bolts_B, shear_V_in: Vu } = inputs;
        const num_bolts_total = num_bolts_N * num_bolts_B;
        const num_bolts_tension_row = num_bolts_B;
        const anchorChecks = {};

        // --- ANCHOR TENSION CHECKS ---
        if (Tu_bolt > 0) {
            const Tu_group = Tu_bolt * num_bolts_tension_row;
            anchorChecks['Anchor Steel Tension'] = { demand: Tu_bolt, check: checkAnchorSteelTension(inputs), details: { num_bolts_tension_row } };
            anchorChecks['Anchor Concrete Breakout'] = { demand: Tu_group, check: checkAnchorConcreteBreakout(inputs, bearing_results) };

            if (inputs.bolt_type === 'Cast-in') {
                anchorChecks['Anchor Pullout Strength'] = { demand: Tu_bolt, check: checkAnchorPullout(inputs) };
                const side_face_check = checkAnchorSideFaceBlowout(inputs);
                if (side_face_check) anchorChecks['Anchor Side-Face Blowout'] = { demand: Tu_group, check: side_face_check };
            }
        }

        // --- ANCHOR SHEAR CHECKS ---
        if (Vu > 0) {
            if (num_bolts_total <= 0) return { error: "Cannot check anchor shear with zero total bolts." };
            const Vu_bolt = Vu / num_bolts_total;

            anchorChecks['Anchor Steel Shear'] = { demand: Vu_bolt, check: checkAnchorSteelShear(inputs), details: { num_bolts_total } };
            const shear_breakout_check = checkAnchorConcreteShearBreakout(inputs);
            if (shear_breakout_check) anchorChecks['Anchor Concrete Shear Breakout'] = { demand: Vu, check: shear_breakout_check };

            const pryout_check = checkAnchorConcretePryout(inputs, anchorChecks['Anchor Concrete Breakout']);
            if (pryout_check) anchorChecks['Anchor Concrete Pryout'] = { demand: Vu, check: pryout_check };
        }

        // --- Combined Shear and Tension Interaction (ACI 17.8) ---
        if (Tu_bolt > 0 && Vu > 0) {
            const Tu_group = Tu_bolt * num_bolts_tension_row;
            const interaction_checks = checkAnchorInteraction(Tu_group, Vu, anchorChecks);
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
        const { weld_size, column_type, column_depth_d: d, column_flange_width_bf: bf, column_web_tw: tw, column_flange_tf: tf, axial_load_P_in: Pu, moment_Mx_in: Mux, moment_My_in: Muy, shear_V_in: Vu, weld_Fexx: Fexx, design_method } = inputs;
        if (weld_size <= 0) return null;

        // --- 1. Calculate Weld Capacity ---
        // Per AISC Spec J2.4, the strength of the weld is based on its effective throat area.
        const Rn_weld_per_in = 0.6 * Fexx * (weld_size * 0.707);
        const phi = getPhi('weld', design_method);
        const omega = getPhi('weld', 'ASD'); // Get ASD factor
        const design_strength_weld_per_in = design_method === 'LRFD' ? Rn_weld_per_in * phi : Rn_weld_per_in / omega;

        // --- 2. Calculate Weld Group Properties and Stresses ---
        let f_max_weld, weld_details;
        if (column_type === 'Wide Flange') {
            // For a wide flange, the weld is around the perimeter.
            const web_weld_length = d - 2 * tf; // Length of weld along web
            const Aw = (2 * bf) + (2 * web_weld_length); // Total weld length
            const Iw_x = (2 * bf * (d / 2)**2) + (2 * (web_weld_length**3) / 12); // Moment of Inertia of weld group
            const Iw_y = (2 * tf * (bf**3) / 12) + (2 * (d-2*tf) * (tw**3)/12) + (2 * d * (bf/2)**2); // Approx.
            const f_axial = abs(Pu) / Aw;
            const f_moment_x = (Mux * 12 * (d / 2)) / Iw_x;
            const f_moment_y = (Muy * 12 * (bf / 2)) / Iw_y;
            const f_shear_x = abs(Vu) / (2 * web_weld_length); // Shear resisted by web welds (strong axis)
            const f_shear_y = 0; // Assuming V is only in strong axis
            f_max_weld = sqrt((f_axial + f_moment_x + f_moment_y)**2 + f_shear_x**2 + f_shear_y**2);
            weld_details = { Lw: Aw, Aw, Iw_x, Iw_y, f_axial, f_moment_x, f_moment_y, f_shear_x, f_shear_y, f_max_weld };

        } else { // Round HSS
            const r = d / 2.0;
            if (r <= 0) return { error: "Column radius is zero." };
            const Aw = 2 * PI * r;
            const Sw = PI * r ** 2;
            const Iw = PI * r ** 3; // Section property for thin ring
            const f_axial = Pu / Aw; // Axial stress
            const f_moment = (Mux * 12) / Sw; // Bending stress (assuming M is Mux)
            const f_shear = (2 * Vu) / Aw; // Shear stress for a thin-walled circular section
            f_max_weld = sqrt((f_axial + f_moment)**2 + f_shear**2);
            weld_details = { Aw, Sw, Iw, f_axial, f_moment, f_shear, f_max_weld };
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

    function run(inputs) {
        // --- FIX: Call getBasePlateGeometryChecks ---
        // This function was defined but not called in the main run function.
        // It's now called to perform the ACI checks on every run.
        const geomChecks = getBasePlateGeometryChecks(inputs); 

        const validation = validateBasePlateInputs(inputs);
        if (validation.errors.length > 0) {
            return { errors: validation.errors, warnings: validation.warnings, checks: {}, geomChecks };
        }

        const checks = {};

        const bearing_results = checkConcreteBearing(inputs);
        if (bearing_results.error) return { errors: [bearing_results.error], checks, geomChecks };
        checks['Concrete Bearing'] = bearing_results;
        
        const bending_results = checkPlateBending(inputs, bearing_results); // Can be null
        if (bending_results?.error) return { errors: [bending_results.error], checks, geomChecks };
        if (bending_results) checks['Plate Bending'] = bending_results;

        const Tu_bolt = calculateAnchorTension(inputs, bearing_results);
        const anchor_checks = performAnchorChecks(inputs, Tu_bolt, bearing_results);
        Object.assign(checks, anchor_checks);

        const weld_check = checkWeldStrength(inputs, bearing_results);
        if (weld_check?.error) return { errors: [weld_check.error], checks, geomChecks };
        if (weld_check) checks['Weld Strength'] = weld_check;

        const web_checks = checkColumnWebChecks(inputs, bearing_results);
        if (web_checks?.error) return { errors: [web_checks.error], checks, geomChecks };
        Object.assign(checks, web_checks);

        // Add minimum thickness check
        checks['Minimum Plate Thickness'] = {
            demand: inputs.provided_plate_thickness_tp,
            check: { Rn: 0.25, phi: 1.0, omega: 1.0 } // Required is 0.25", capacity is provided
        };

        return { checks, geomChecks, inputs, warnings: validation.warnings };
    }

    return { run };
})();

function renderBasePlateStrengthChecks(results) {
    const { checks, inputs } = results; // Corrected destructuring
    const { design_method } = inputs;

    const tableRowsHtml = Object.entries(checks)
        .filter(([name, data]) => data && data.check) // Ensure the check exists
        .map(([name, data], index) => {
            const detailId = `bp-details-${index}`;
            const { demand, check } = data;
            const { Rn, phi, omega } = check;
            const breakdownHtml = generateBasePlateBreakdownHtml(name, data, inputs); // Pass full inputs

            const capacity = Rn || 0;
            const design_capacity = design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

            let ratio, demand_val, capacity_val;
            if (name === 'Plate Bending' || name === 'Weld Strength' || name === 'Minimum Plate Thickness') {
                // For thickness, demand is provided, capacity is required. Ratio is req/prov.
                demand_val = demand; // provided tp
                capacity_val = design_capacity; // required t_req
                ratio = demand_val > 0 ? capacity_val / demand_val : Infinity;
            } else {
                demand_val = demand;
                capacity_val = design_capacity;
                ratio = capacity_val > 0 ? Math.abs(demand_val) / capacity_val : Infinity;
            }

            const status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';

            return `
                <tr class="border-t dark:border-gray-700">
                    <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${demand_val.toFixed(2)}</td>
                    <td>${capacity_val.toFixed(2)}</td>
                    <td>${ratio.toFixed(3)}</td>
                    <td class="font-semibold">${status}</td>
                </tr>
                <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td></tr>
            `;
        }).join('');

    const html = `
        <div id="strength-checks-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center">
                <h3 class="report-header">4. Strength Checks (${design_method})</h3>
                <button data-copy-target-id="strength-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 results-table">
                    <caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">Strength Checks (${design_method})</caption>
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

function renderBasePlateGeometryChecks(geomChecks) {
    if (Object.keys(geomChecks).length === 0) return '';

    const rows = Object.entries(geomChecks).map(([name, data]) => {
        const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        return `<tr><td>${name}</td><td>${data.actual.toFixed(3)}</td><td>${data.min.toFixed(3)}</td><td>${status}</td></tr>`;
    }).join(''); // FIX: Corrected variable name

    return `
    <div id="geometry-checks-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center">
            <h3 class="report-header">2. Geometry & Spacing Checks (ACI 318-19)</h3>
            <button data-copy-target-id="geometry-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">Anchor Geometry Checks</caption>
                <thead><tr><th>Item</th><th>Actual (in)</th><th>Required Min (in)</th><th>Status</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function renderBasePlateLoadSummary(inputs, checks) {
    const { axial_load_P_in: Pu, moment_Mx_in: Mux, moment_My_in: Muy, shear_V_in: Vu } = inputs;
    const bearing_pressure = checks['Concrete Bearing']?.details?.f_p_max || 0;
    const anchor_tension = checks['Anchor Steel Tension']?.demand || 0;
    const anchor_shear = checks['Anchor Steel Shear']?.demand || 0;

    const rows = [
        `<tr><td>Applied Axial (P)</td><td>${Pu.toFixed(2)} kips</td></tr>`,
        `<tr><td>Applied Moment (M<sub>x</sub> / M<sub>y</sub>)</td><td>${Mux.toFixed(2)} / ${Muy.toFixed(2)} kip-ft</td></tr>`,
        `<tr><td>Applied Shear (V)</td><td>${Vu.toFixed(2)} kips</td></tr>`,
        `<tr class="border-t dark:border-gray-700"><td class="font-semibold">Max. Bearing Pressure (f<sub>p,max</sub>)</td><td>${bearing_pressure.toFixed(2)} ksi</td></tr>`,
        `<tr class="border-t dark:border-gray-700"><td class="font-semibold">Max. Anchor Tension (T<sub>u,bolt</sub>)</td><td>${anchor_tension.toFixed(2)} kips</td></tr>`,
        `<tr class="border-t dark:border-gray-700"><td class="font-semibold">Max. Anchor Shear (V<sub>u,bolt</sub>)</td><td>${anchor_shear.toFixed(2)} kips</td></tr>`
    ];

    return `
    <div id="load-summary-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center">
            <h3 class="report-header">3. Load Summary</h3>
            <button data-copy-target-id="load-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">Applied Loads & Calculated Demands</caption>
                <thead><tr><th>Load / Demand Type</th><th>Magnitude</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    `;
}

function generateBasePlateBreakdownHtml(name, data, inputs) {
    const { check, details } = data;
    const { design_method } = inputs;
    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? check.phi : check.omega;
    const capacity_eq = design_method === 'LRFD' ? `${factor_char}R<sub>n</sub>` : `R<sub>n</sub> / ${factor_char}`;
    const final_capacity = design_method === 'LRFD' ? check.Rn * factor_val : check.Rn / factor_val;

    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;
    let content = '';

    switch (name) {
        case 'Concrete Bearing':
            const confinement_limit = 1.7 * inputs.concrete_fc * details.A1;
            content = format_list([
                `<u>Nominal Bearing Strength (P<sub>p</sub>) per AISC J8</u>`,
                `Confinement Factor (&Psi;) = min(&radic;(A₂/A₁), 2.0) = min(&radic;(${details.A2.toFixed(2)}/${details.A1.toFixed(2)}), 2.0) = ${details.confinement_factor.toFixed(2)}`,
                `P<sub>p</sub> = 0.85 &times; f'c &times; A₁ &times; &Psi;`,
                `P<sub>p</sub> = 0.85 &times; ${inputs.concrete_fc} ksi &times; ${details.A1.toFixed(2)} in² &times; ${details.confinement_factor.toFixed(2)} = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq} = ${final_capacity.toFixed(2)} kips`
            ]);
            break;
        case 'Plate Bending':
            const phi_bending = getPhi('bending', design_method);
            content = format_list([
                `<u>Required Thickness (t<sub>req</sub>) per AISC DG 1</u>`,
                `Cantilever distance (m) = (N - 0.95d)/2 = (${inputs.base_plate_length_N} - 0.95 &times; ${inputs.column_depth_d})/2 = <b>${details.m.toFixed(3)} in</b>`,
                `Cantilever distance (n) = (B - 0.80b<sub>f</sub>)/2 = (${inputs.base_plate_width_B} - 0.80 &times; ${inputs.column_flange_width_bf})/2 = <b>${details.n.toFixed(3)} in</b>`,
                `Effective cantilever length (l) = max(m, n) = <b>${details.l.toFixed(3)} in</b>`,
                `t<sub>req</sub> = l &times; &radic;(2 &times; f<sub>p,max</sub> / (${factor_char}F<sub>y</sub>))`,
                `t<sub>req</sub> = ${details.l.toFixed(3)} &times; &radic;(2 &times; ${details.f_p_max.toFixed(2)} ksi / (${phi_bending} &times; ${inputs.base_plate_Fy} ksi)) = <b>${check.Rn.toFixed(3)} in</b>`
            ]);
            break;
        case 'Anchor Steel Tension':
            const Ab_tension = Math.PI * (inputs.anchor_bolt_diameter ** 2) / 4.0;
            content = format_list([
                `<u>Nominal Steel Strength (N<sub>sa</sub>) per ACI 17.6.1</u>`,
                `N<sub>sa</sub> = A<sub>b,eff</sub> &times; F<sub>ut</sub>`,
                `N<sub>sa</sub> = ${Ab_tension.toFixed(3)} in² &times; ${inputs.anchor_bolt_Fut} ksi = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (per bolt)</u>`,
                `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Steel Shear':
            const Ab_shear = Math.PI * (inputs.anchor_bolt_diameter ** 2) / 4.0;
            content = format_list([
                `<u>Nominal Steel Strength (V<sub>sa</sub>) per ACI 17.7.1</u>`,
                `V<sub>sa</sub> = 0.6 &times; A<sub>b,eff</sub> &times; F<sub>ut</sub>`,
                `V<sub>sa</sub> = 0.6 &times; ${Ab_shear.toFixed(3)} in² &times; ${inputs.anchor_bolt_Fut} ksi = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (per bolt)</u>`,
                `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Concrete Breakout':
            // FIX: Add a guard clause to prevent errors if the check fails and details are missing.
            if (!details) {
                return 'Breakdown not available. The check may not have been applicable or an error occurred.';
            }
            content = format_list([
                `<u>Nominal Concrete Breakout Strength (N<sub>cbg</sub>) per ACI 17.6.2</u>`,
                `Basic Strength (N<sub>b</sub>) = k<sub>c</sub>&lambda;<sub>a</sub>&radic;f'c &times; h<sub>ef</sub><sup>1.5</sup> = ${details.Nb.toFixed(2)} kips`,
                `Area Ratio (A<sub>Nc</sub>/A<sub>Nco</sub>) = ${details.ANc.toFixed(1)} / ${details.ANco.toFixed(1)} = ${(details.ANc / details.ANco).toFixed(3)}`,
                `Modification Factors: &psi;<sub>ec,N</sub>=${details.psi_ec_N.toFixed(3)}, &psi;<sub>ed,N</sub>=${details.psi_ed_N.toFixed(3)}, &psi;<sub>c,N</sub>=${details.psi_c_N.toFixed(3)}`,
                `N<sub>cbg</sub> = (A<sub>Nc</sub>/A<sub>Nco</sub>) &times; &psi;<sub>ec,N</sub> &times; &psi;<sub>ed,N</sub> &times; &psi;<sub>c,N</sub> &times; &psi;<sub>cp,N</sub> &times; N<sub>b</sub> &times; n`,
                `N<sub>cbg</sub> = ${(details.ANc / details.ANco).toFixed(3)} &times; ${details.psi_ec_N.toFixed(3)} &times; ${details.psi_ed_N.toFixed(3)} &times; ${details.psi_c_N.toFixed(3)} &times; 1.0 &times; ${details.Nb.toFixed(2)} &times; ${inputs.num_bolts_B} = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (Group)</u>`,
                `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Pullout Strength':
            content = format_list([
                ...(details ? [
                    `<u>Nominal Pullout Strength (N<sub>pn</sub>) per ACI 17.6.3</u>`,
                    `Basic Pullout Strength (N<sub>p</sub>) = 8 &times; A<sub>brg</sub> &times; f'c = 8 &times; ${(details.Abrg || 0).toFixed(3)} in² &times; ${inputs.concrete_fc} ksi = <b>${(details.Np || 0).toFixed(2)} kips</b>`,
                    `N<sub>pn</sub> = &psi;<sub>c,P</sub> &times; N<sub>p</sub> = ${details.psi_c_P.toFixed(2)} &times; ${(details.Np || 0).toFixed(2)} = <b>${(check?.Rn || 0).toFixed(2)} kips</b>`,
                    `<u>Design Capacity (per bolt)</u>`,
                    `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
                ] : ['Calculation details not available. Check may not be applicable.'])
            ]);
            break;
        case 'Anchor Side-Face Blowout':
            content = format_list([
                ...(details ? [
                    `<u>Nominal Side-Face Blowout Strength (N<sub>sbg</sub>) per ACI 17.6.4</u>`,
                    `Check applies because cₐ₁ (${details.ca1.toFixed(2)}") < 0.4 &times; hₑf (${(0.4*details.hef).toFixed(2)}")`,
                    `Single Anchor (N<sub>sb</sub>) = 160 &times; cₐ₁ &times; &radic;A<sub>brg</sub> &times; &radic;f'c = <b>${(details.Nsb_single || 0).toFixed(2)} kips</b>`,
                    `Group (N<sub>sbg</sub>) = (1 + s/(6cₐ₁)) &times; N<sub>sb</sub> = <b>${(details.Nsbg || 0).toFixed(2)} kips/bolt</b>`,
                    `Total Group Capacity = N<sub>sbg</sub> &times; n_bolts = ${(details.Nsbg || 0).toFixed(2)} &times; ${details.num_bolts_at_edge} = <b>${(check?.Rn || 0).toFixed(2)} kips</b>`,
                    `<u>Design Capacity (Group)</u>`,
                    `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
                ] : ['Calculation details not available. Check may not be applicable.'])
            ]);
            break;
        case 'Anchor Concrete Shear Breakout':
            // FIX: Add a guard clause to prevent errors if the check is not applicable and details are missing.
            if (!details) {
                return 'Breakdown not available. Check is not applicable for the given geometry (e.g., edge distance is zero).';
            }
            content = format_list([
                `<u>Nominal Concrete Shear Breakout Strength (V<sub>cbg</sub>) per ACI 17.7.2</u>`,
                `Basic Strength (V<sub>b</sub>) = 7(lₑ/dₐ)⁰·²&radic;dₐ&lambda;ₐ&radic;f'c &times; cₐ₁¹·⁵ = <b>${details.Vb.toFixed(2)} kips</b>`,
                `Area Ratio (A<sub>vc</sub>/A<sub>vco</sub>) = <b>${details.Avc_Avco.toFixed(3)}</b>`,
                `V<sub>cbg</sub> = (A<sub>vc</sub>/A<sub>vco</sub>) &times; &psi;<sub>ed,V</sub> &times; &psi;<sub>c,V</sub> &times; &psi;<sub>h,V</sub> &times; V<sub>b</sub> &times; n`,
                `V<sub>cbg</sub> = ${details.Avc_Avco.toFixed(3)} &times; 1.0 &times; ${details.psi_c_V.toFixed(2)} &times; 1.0 &times; ${details.Vb.toFixed(2)} &times; ${inputs.num_bolts_N} = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (Group)</u>`,
                `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Anchor Combined Shear and Tension (Steel)':
        case 'Anchor Combined Shear and Tension (Concrete)':
            const type = name.includes('Steel') ? 'Steel' : 'Concrete';
            content = format_list([
                `Reference: ACI 318-19, Section 17.8 (${type})`,
                `Interaction Equation: (T<sub>u</sub> / &phi;T<sub>n</sub>) + (V<sub>u</sub> / &phi;V<sub>n</sub>) &le; 1.2`,
                `T<sub>u</sub> / &phi;T<sub>n</sub> = ${details.Tu.toFixed(2)} kips / ${details.phiTn.toFixed(2)} kips = ${(details.Tu / details.phiTn).toFixed(3)}`,
                `V<sub>u</sub> / &phi;V<sub>n</sub> = ${details.Vu.toFixed(2)} kips / ${details.phiVn.toFixed(2)} kips = ${(details.Vu / details.phiVn).toFixed(3)}`,
                `Interaction Value = ${(details.Tu / details.phiTn).toFixed(3)} + ${(details.Vu / details.phiVn).toFixed(3)} = <b>${data.demand.toFixed(3)}</b>`,
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
            const weld_cap_eq = design_method === 'LRFD' ? `0.75 * 0.6 * F<sub>exx</sub> * 0.707 * w` : `(0.6 * F<sub>exx</sub> * 0.707 * w) / 2.00`;
            let stress_calcs = [];
            if (inputs.column_type === 'Wide Flange') {
                stress_calcs.push(`Normal Stress (f<sub>n</sub>) = P/A<sub>w</sub> + M<sub>x</sub>/S<sub>wx</sub> + M<sub>y</sub>/S<sub>wy</sub> = ${details.f_axial.toFixed(2)} + ${details.f_moment_x.toFixed(2)} + ${details.f_moment_y.toFixed(2)} = <b>${(details.f_axial + details.f_moment_x + details.f_moment_y).toFixed(2)} kips/in</b>`);
                stress_calcs.push(`Shear Stress (f_v) = &radic;(f<sub>vx</sub>² + f<sub>vy</sub>²) = &radic;(${details.f_shear_x.toFixed(2)}² + ${details.f_shear_y.toFixed(2)}²) = ${sqrt(details.f_shear_x**2 + details.f_shear_y**2).toFixed(2)} kips/in`);
                stress_calcs.push(`Resultant Stress (f<sub>r</sub>) = &radic;(f<sub>n</sub>² + f<sub>v</sub>²) = <b>${details.f_max_weld.toFixed(2)} kips/in</b>`);
            } else { // Round HSS
                stress_calcs.push(`Normal Stress (f_n) = P/A<sub>w</sub> + M/S<sub>w</sub> = ${details.f_axial.toFixed(2)} + ${details.f_moment.toFixed(2)} = ${(details.f_axial + details.f_moment).toFixed(2)} kips/in`); // Muy not handled for HSS yet
                stress_calcs.push(`Shear Stress (f<sub>v</sub>) = 2V/A<sub>w</sub> = ${details.f_shear.toFixed(2)} kips/in`);
                stress_calcs.push(`Resultant Stress (f<sub>r</sub>) = &radic;(f<sub>n</sub>² + f<sub>v</sub>²) = <b>${details.f_max_weld.toFixed(2)} kips/in</b>`);
            }
            content = format_list([`Reference: AISC Manual, Part 8 - Elastic Vector Method`].concat(stress_calcs, [
                `Weld Design Strength = ${weld_cap_eq} = <b>${check.Rn.toFixed(2)} kips/in</b>`
            ]));
            break;
        case 'Anchor Concrete Pryout':
            // FIX: Add a guard clause to prevent errors if the check is not applicable and details are missing.
            if (!details) {
                return 'Breakdown not available. Check is not applicable (e.g., no tension on bolts or preceding checks failed).';
            }
            content = format_list([
                `<u>Nominal Pryout Strength (V<sub>cpg</sub>) per ACI 17.7.3</u>`,
                `Pryout Factor (k<sub>cp</sub>) = <b>${details.k_cp.toFixed(1)}</b> (since h<sub>ef</sub> ${inputs.anchor_embedment_hef < 2.5 ? '<' : '>='} 2.5")`,
                `Nominal Concrete Breakout Strength (N<sub>cbg</sub>) = <b>${details.Ncb.toFixed(2)} kips</b> (from tension analysis)`,
                `V<sub>cpg</sub> = k<sub>cp</sub> &times; N<sub>cbg</sub> = ${details.k_cp.toFixed(1)} &times; ${details.Ncb.toFixed(2)} = <b>${check.Rn.toFixed(2)} kips</b>`,
                `<u>Design Capacity (Group)</u>`,
                `Capacity = ${capacity_eq} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        case 'Minimum Plate Thickness':
            content = format_list([
                `A minimum plate thickness of <b>0.25 inches</b> is recommended for serviceability and to ensure rigid behavior.`,
                `Provided thickness = <b>${inputs.provided_plate_thickness_tp} inches</b>.`
            ]);
            break;
        default: return 'Breakdown not available.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

function renderResults(results) {
    const { checks, geomChecks, inputs } = results;

    const inputSummaryHtml = renderBasePlateInputSummary(inputs);
    const geometryChecksHtml = renderBasePlateGeometryChecks(geomChecks);
    const loadSummaryHtml = renderBasePlateLoadSummary(inputs, checks);
    const strengthChecksHtml = renderBasePlateStrengthChecks(results); // Pass the whole results object

    const finalHtml = `
        <div id="baseplate-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end flex-wrap gap-2 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Show All Details</button>
                <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
            </div>
            <h2 class="report-title text-center">Base Plate & Anchorage Check Results</h2>
            ${inputSummaryHtml}
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
                    document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                }
            });
            select.dispatchEvent(new Event('change')); // Trigger initial population
        }

        // Add event listeners to diagram inputs
        const diagramInputIds = ['base_plate_length_N', 'base_plate_width_B', 'column_depth_d', 'column_flange_width_bf', 'column_type', 'anchor_bolt_diameter', 'bolt_spacing_N', 'bolt_spacing_B', 'num_bolts_total', 'num_bolts_tension_row'];
        diagramInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', drawBasePlateDiagram);
                el.addEventListener('input', draw3dBasePlateDiagram); // Also update 3D diagram
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
            label1.textContent = 'Column d'; // This was the line causing the error
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
        inputIds: basePlateInputIds, // FIX: Corrected variable name
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
    loadInputsFromLocalStorage('baseplate-inputs', basePlateInputIds);

    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunBasePlateCheck);
    
    // Auto-run on input change
    basePlateInputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('change', handleRunBasePlateCheck);
    });

    const handleSaveInputs = createSaveInputsHandler(basePlateInputIds, 'baseplate-inputs.txt');
    const handleLoadInputs = createLoadInputsHandler(basePlateInputIds, handleRunBasePlateCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
    
    // Diagram copy buttons
    document.getElementById('copy-2d-diagram-btn').addEventListener('click', () => handleCopyDiagramToClipboard('diagram-2d-container'));
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
    });
});