// This now includes all fields that need to be saved and passed to other calculators.
const projectInputIds = [
    'asce_standard', 'risk_category', 'jurisdiction', 'design_method', 'unit_system',
    'exposure_category', 'topographic_factor_Kzt', 'basic_wind_speed', 'ground_snow_load', 'rain_intensity',
    'ground_elevation', 'effective_wind_area', 'roof_type_manual', 'temporary_construction',
    'enclosure_classification'
];

document.addEventListener('DOMContentLoaded', () => {
    injectHeader({
        activePage: 'project_definition',
        pageTitle: 'ASCE Project Geometry Definition',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    const debouncedProcessAndUpdate = debounce(processAndUpdate, 250);

    const setupCoordinateTable = (containerId, addButtonId, defaultPoints) => {
        const container = document.getElementById(containerId);
        container.addEventListener('input', debouncedProcessAndUpdate);

        document.getElementById(addButtonId).addEventListener('click', () => {
            addPointRow(containerId, { x: 0, y: 0 });
            processAndUpdate();
        });
        
        // Populate with default or saved points
        return populateCoordinateTable(containerId, defaultPoints);
    };

    const savedData = JSON.parse(localStorage.getItem('buildingProjectData')) || {};
    const defaultElevPoints = [{x:0,y:0},{x:100,y:0},{x:100,y:40},{x:50,y:50},{x:0,y:40},{x:0,y:0}];
    const defaultSectPoints = [{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:30,y:50},{x:0,y:40},{x:0,y:0}];

    setupCoordinateTable('elevation-coords-container', 'add-elevation-point-btn', savedData.elevation_coords || defaultElevPoints);
    setupCoordinateTable('section-coords-container', 'add-section-point-btn', savedData.section_coords || defaultSectPoints);
    
    // Load other inputs
    loadInputsFromLocalStorage('buildingProjectData', projectInputIds);

    // Add event listeners for non-coordinate inputs
     projectInputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', debouncedProcessAndUpdate);
    });

    document.getElementById('save-project-btn').addEventListener('click', () => {
        // Gather all data again on save to ensure it's current
        const directInputs = gatherInputsFromIds(projectInputIds);
        const elevationPoints = gatherCoordinates('elevation-coords-container');
        const sectionPoints = gatherCoordinates('section-coords-container');
        const calculatedGeometry = calculateGeometry(elevationPoints, sectionPoints);

        // This object now contains EVERYTHING needed by the other calculators
        const projectData = {
            ...directInputs,
            ...calculatedGeometry,
            elevation_coords: elevationPoints,
            section_coords: sectionPoints,
            // Use the manual override if selected, otherwise use the auto-detected value
            roof_type: directInputs.roof_type_manual === 'auto' ? calculatedGeometry.roof_type : directInputs.roof_type_manual
        };
        
        // Save the comprehensive data object
        saveInputsToLocalStorage('buildingProjectData', projectData);
        showFeedback('Project data saved! Redirecting to the Wind Load Calculator...', false, 'feedback-message');
        
        // Redirect after a short delay
        setTimeout(() => {
            window.location.href = 'wind.html';
        }, 1500);
    });

    processAndUpdate(); // Initial run on page load
});

function addPointRow(containerId, point = {x: 0, y: 0}) {
    const container = document.getElementById(containerId);
    const row = document.createElement('div');
    row.className = 'grid grid-cols-[1fr_1fr_auto] gap-2 items-center coord-row';
    
    row.innerHTML = `
        <input type="number" class="coord-x w-full" value="${point.x}">
        <input type="number" class="coord-y w-full" value="${point.y}">
        <button class="remove-point-btn text-red-500 hover:text-red-700 w-8 h-8 flex items-center justify-center">&times;</button>
    `;
    
    row.querySelector('.remove-point-btn').addEventListener('click', () => {
        row.remove();
        document.dispatchEvent(new Event('geometryUpdated'));
    });

    container.appendChild(row);
}

function populateCoordinateTable(containerId, points) {
    const container = document.getElementById(containerId);
    // Clear existing rows except the header
    container.querySelectorAll('.coord-row').forEach(row => row.remove());
    if (points && points.length > 0) {
        points.forEach(point => addPointRow(containerId, point));
    }
}

function gatherCoordinates(containerId) {
    const container = document.getElementById(containerId);
    return Array.from(container.querySelectorAll('.coord-row')).map(row => ({
        x: parseFloat(row.querySelector('.coord-x').value) || 0,
        y: parseFloat(row.querySelector('.coord-y').value) || 0
    }));
}

// Attach a single debounced update handler to the document
function processAndUpdate() {
    const inputs = gatherInputsFromIds(projectInputIds);
    const elevationPoints = gatherCoordinates('elevation-coords-container');
    const sectionPoints = gatherCoordinates('section-coords-container');

    drawGeometryOnCanvas('elevation-canvas', elevationPoints);
    drawGeometryOnCanvas('section-canvas', sectionPoints);

    const geometryData = calculateGeometry(elevationPoints, sectionPoints);
    displayCalculatedData(geometryData);
}
document.addEventListener('geometryUpdated', debounce(processAndUpdate, 250));


// --- The functions below remain the same as the previous response ---
// calculateGeometry(), displayCalculatedData(), drawGeometryOnCanvas()
function calculateGeometry(elevationPoints, sectionPoints) {
    if (elevationPoints.length < 3 || sectionPoints.length < 3) return {};

    // Basic Dimensions
    const elevXs = elevationPoints.map(p => p.x);
    const elevYs = elevationPoints.map(p => p.y);
    const sectXs = sectionPoints.map(p => p.x);
    const sectYs = sectionPoints.map(p => p.y);

    const L = Math.max(...elevXs) - Math.min(...elevXs);
    const B = Math.max(...sectXs) - Math.min(...sectXs);
    const H_peak = Math.max(...elevYs, ...sectYs);
    const H_eave = Math.min(...elevationPoints.filter(p => p.y > 0).map(p => p.y));

    // Roof Type Detection
    let roof_type = 'complex';
    const topElevPoints = elevationPoints.filter(p => p.y >= H_eave).sort((a, b) => a.x - b.x);
    if (topElevPoints.length === 2 && topElevPoints[0].y !== topElevPoints[1].y) roof_type = 'monoslope';
    if (topElevPoints.length === 3 && topElevPoints[0].y === topElevPoints[2].y && topElevPoints[1].y > topElevPoints[0].y) roof_type = 'gable';
    if (topElevPoints.length > 3 && topElevPoints.every((p, i, arr) => i === 0 || p.y !== arr[i-1].y)) roof_type = 'sawtooth';

    // Roof Slope (average of the steepest slope)
    let maxSlope = 0;
    for (let i = 1; i < topElevPoints.length; i++) {
        const run = Math.abs(topElevPoints[i].x - topElevPoints[i-1].x);
        const rise = Math.abs(topElevPoints[i].y - topElevPoints[i-1].y);
        if (run > 0) {
            maxSlope = Math.max(maxSlope, Math.atan(rise / run) * (180 / Math.PI));
        }
    }

    return {
        building_length_L: L,
        building_width_B: B,
        mean_roof_height: H_peak,
        eave_height: H_eave,
        roof_type: roof_type,
        roof_slope_deg: maxSlope,
        eave_to_ridge_distance_W: B / 2
    };
}

function displayCalculatedData(data) {
    const container = document.getElementById('calculated-data');
    if (!container || !data.building_length_L) {
        container.innerHTML = `<p class="text-red-500">Invalid coordinates. Please define a closed shape starting at (0,0).</p>`;
        return;
    }
    container.innerHTML = `
        <h4 class="font-semibold border-t dark:border-gray-600 pt-3">Calculated Geometric Properties:</h4>
        <ul class="list-disc list-inside space-y-1 mt-2">
            <li>Building Length (L): <b>${data.building_length_L.toFixed(2)}</b></li>
            <li>Building Width (B): <b>${data.building_width_B.toFixed(2)}</b></li>
            <li>Eave Height: <b>${data.eave_height.toFixed(2)}</b></li>
            <li>Mean Roof Height (h): <b>${data.mean_roof_height.toFixed(2)}</b></li>
            <li>Detected Roof Type: <b>${data.roof_type}</b></li>
            <li>Max Roof Slope: <b>${data.roof_slope_deg.toFixed(2)}°</b></li>
        </ul>`;
}

function drawGeometryOnCanvas(canvasId, points) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    if (points.length < 2) return;

    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    const rangeX = maxX - minX;
    const rangeY = maxY - minY;

    if(rangeX === 0 || rangeY === 0) return;

    const scale = Math.min(width / rangeX, height / rangeY) * 0.8;
    const offsetX = (width - rangeX * scale) / 2 - minX * scale;
    const offsetY = (height + rangeY * scale) / 2 + minY * scale;

    ctx.beginPath();
    ctx.moveTo(points[0].x * scale + offsetX, -points[0].y * scale + offsetY);
    points.slice(1).forEach(p => ctx.lineTo(p.x * scale + offsetX, -p.y * scale + offsetY));
    
    ctx.strokeStyle = document.documentElement.classList.contains('dark') ? '#9ca3af' : '#4b5563';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw origin point
    ctx.beginPath();
    ctx.arc(offsetX, offsetY, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
}