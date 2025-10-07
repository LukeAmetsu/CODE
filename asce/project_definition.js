const projectInputIds = [
    'asce_standard', 'risk_category', 'jurisdiction', 'building_length_L',
    'building_width_B', 'mean_roof_height', 'eave_height', 'roof_type', 'roof_slope_deg'
];

document.addEventListener('DOMContentLoaded', () => {
    // Inject Header & Footer
    injectHeader({
        activePage: 'project_definition', // A new key for the nav config
        pageTitle: 'ASCE Project Definition',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    // Load any existing project data to pre-fill the form
    loadInputsFromLocalStorage('buildingProjectData', projectInputIds);

    // Initial draw and event listeners
    drawBuildingDiagram();
    projectInputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', drawBuildingDiagram);
    });

    document.getElementById('save-project-btn').addEventListener('click', () => {
        const projectData = gatherInputsFromIds(projectInputIds);
        saveInputsToLocalStorage('buildingProjectData', projectData);
        showFeedback('Project data saved! Redirecting to Wind Load Calculator...', false, 'feedback-message');
        setTimeout(() => {
            window.location.href = 'wind.html';
        }, 1500);
    });
});

let bjsEngine, bjsScene;

function drawBuildingDiagram() {
    const canvas = document.getElementById("building-canvas");
    if (!canvas || typeof BABYLON === 'undefined') return;
    const inputs = gatherInputsFromIds(projectInputIds);

    if (!bjsEngine) {
        bjsEngine = new BABYLON.Engine(canvas, true);
        bjsScene = new BABYLON.Scene(bjsEngine);
        const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 200, BABYLON.Vector3.Zero(), bjsScene);
        camera.attachControl(canvas, true);
        new BABYLON.HemisphericLight("light", new BABYLON.Vector3(1, 1, 0), bjsScene);
        bjsEngine.runRenderLoop(() => bjsScene.render());
        window.addEventListener('resize', () => bjsEngine.resize());
    }

    // Clear previous building
    bjsScene.meshes.forEach(mesh => mesh.dispose());

    const {
        building_length_L: L,
        building_width_B: B,
        eave_height: He,
        mean_roof_height: H,
        roof_type,
        roof_slope_deg
    } = inputs;

    const mat = new BABYLON.StandardMaterial("mat", bjsScene);
    mat.alpha = 0.7;

    const box = BABYLON.MeshBuilder.CreateBox("box", {width: B, height: He, depth: L}, bjsScene);
    box.material = mat;
    box.position.y = He / 2;

    const roof = createRoof(inputs, bjsScene);
    if(roof) roof.material = mat;

    // Auto-frame the building
    const allMeshes = bjsScene.meshes;
    if (allMeshes.length > 0) {
        let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
        let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
        allMeshes.forEach(mesh => {
            mesh.computeWorldMatrix(true);
            const boundingBox = mesh.getBoundingInfo().boundingBox;
            min = BABYLON.Vector3.Minimize(min, boundingBox.minimumWorld);
            max = BABYLON.Vector3.Maximize(max, boundingBox.maximumWorld);
        });
        const boundingInfo = new BABYLON.BoundingInfo(min, max);
        bjsScene.activeCamera.setTarget(boundingInfo.boundingSphere.center);
        bjsScene.activeCamera.radius = boundingInfo.boundingSphere.radius * 2;
    }
}

function createRoof(inputs, scene) {
    const { building_length_L: L, building_width_B: B, eave_height: He, mean_roof_height: H, roof_type } = inputs;
    const peak_height = H + (H - He); // Total height at the peak

    if (roof_type === 'gable') {
        const roof = new BABYLON.Mesh("roof", scene);
        const positions = [
            -B/2, He, -L/2,  -B/2, He, L/2,  B/2, He, L/2,  B/2, He, -L/2, // Base
            0, peak_height, -L/2,  0, peak_height, L/2  // Ridge
        ];
        const indices = [
            0, 1, 5,  0, 5, 4, // Left face
            2, 3, 4,  2, 4, 5, // Right face
            1, 2, 5,  3, 0, 4  // Ends
        ];
        const vertexData = new BABYLON.VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.applyToMesh(roof);
        return roof;
    } else { // Flat, Hip, Monoslope
        const roof = BABYLON.MeshBuilder.CreateBox("roof", {width: B, height: (H - He) * 2, depth: L}, scene);
        roof.position.y = He + (H - He);
        return roof;
    }
}