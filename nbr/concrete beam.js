/**
 * @file concrete beam.js
 * @description NBR 6118 Prestressed Concrete Beam Checker.
 * Translates the logic from the provided Jupyter Notebook into a web application.
 */

const concreteBeamCalculator = (() => {
    /**
     * Calculates the complete geometric properties of a non-self-intersecting polygon.
     * @param {Array<[number, number]>} vertices - An array of [x, y] coordinates.
     * @returns {object|null} A dictionary containing the calculated properties or null if invalid.
     */
    function calculateSectionProperties(vertices) {
        if (!vertices || vertices.length < 3) return null;

        const points = [...vertices, vertices[0]]; // Close the polygon
        let A = 0.0, Qx = 0.0, Qy = 0.0, Ix = 0.0, Iy = 0.0;

        for (let i = 0; i < vertices.length; i++) {
            const [x0, y0] = points[i];
            const [x1, y1] = points[i+1];
            const term = (x0 * y1) - (x1 * y0);
            A += term;
            Qx += (x0 + x1) * term;
            Qy += (y0 + y1) * term;
            Ix += (y0 ** 2 + y0 * y1 + y1 ** 2) * term;
            Iy += (x0 ** 2 + x0 * x1 + x1 ** 2) * term;
        }

        A /= 2.0;
        if (Math.abs(A) < 1e-9) return null;

        const cx = Qx / (6.0 * A);
        const cy = Qy / (6.0 * A);

        const I_origin_x = Ix / 12.0;
        const I_origin_y = Iy / 12.0;

        const I_cx = I_origin_x - A * cy ** 2;
        const I_cy = I_origin_y - A * cx ** 2;

        const y_min = Math.min(...vertices.map(p => p[1]));
        const y_max = Math.max(...vertices.map(p => p[1]));
        const yi = cy - y_min;
        const ys = y_max - cy;

        const Wi = Math.abs(yi) > 1e-9 ? Math.abs(I_cx) / Math.abs(yi) : Infinity;
        const Ws = Math.abs(ys) > 1e-9 ? Math.abs(I_cx) / Math.abs(ys) : Infinity;

        return {
            area: Math.abs(A),
            centroid: { x: cx, y: cy },
            I: { x: Math.abs(I_cx), y: Math.abs(I_cy) },
            W: { i: Wi, s: Ws },
            y_min, y_max, yi, ys
        };
    }

    /**
     * Solves for a parabola y = ax^2 + bx + c given a start point and the vertex.
     * @param {[number, number]} p_start - The start point [x, y].
     * @param {[number, number]} p_vertex - The vertex point [x, y].
     * @returns {{a: number, b: number, c: number}|null}
     */
    function solveParabolaWithVertex(p_start, p_vertex) {
        const [x_start, y_start] = p_start;
        const [x_v, y_v] = p_vertex;

        if (Math.abs(x_start - x_v) < 1e-9) return null;

        const a = (y_start - y_v) / (x_start - x_v) ** 2;
        const b = -2 * a * x_v;
        const c = y_v + a * x_v ** 2;
        return { a, b, c };
    }

    /**
     * Main calculation function.
     * @param {object} inputs - The gathered user inputs.
     * @returns {object} The results of the calculation.
     */
    function run(inputs) {
        const { vertices, fck, load_pp, load_perm, load_var, beam_length, cable_path } = inputs;

        // --- 1. Section Properties ---
        const props = calculateSectionProperties(vertices);
        if (!props) {
            return { errors: ["Invalid beam cross-section vertices. Ensure the polygon is valid and does not self-intersect."] };
        }

        // Convert properties from cm to m for calculations
        const A_m2 = props.area / 1e4;
        const Wi_m3 = props.W.i / 1e6;
        const Ws_m3 = props.W.s / 1e6;

        // --- 2. Material Properties (NBR 6118) ---
        const fctm = 0.3 * fck ** (2 / 3);
        const fctk_inf = 0.7 * fctm;
        const fctf = 1.2 * fctk_inf;

        // --- 3. Load Combinations ---
        const comb_freq = load_pp + load_perm + 0.6 * load_var;
        const comb_qperm = load_pp + load_perm + 0.4 * load_var;

        // --- 4. Bending Moments (kN.m) ---
        const M_freq = (comb_freq * beam_length ** 2) / 8;
        const M_qperm = (comb_qperm * beam_length ** 2) / 8;

        // --- 5. Stresses (MPa = MN/m^2) ---
        const sigma_inf_freq = -M_freq / 1000 / Wi_m3;
        const sigma_inf_qperm = -M_qperm / 1000 / Ws_m3;

        // Find eccentricity at mid-span from the detailed path for the prestress calculation
        // This is a simplification; a full analysis would check stresses along the entire path.
        const ecc_mid = getEccentricityAt(beam_length / 2, cable_path);

        // --- 6. Prestressing Force Estimation (based on ELS-F) ---
        // σ_inf = -P/A - P*e/Wi - M/Wi <= fctf
        // P * (1/A + e/Wi) >= -fctf - M/Wi
        // P >= (-fctf - M/Wi) / (1/A + e/Wi)
        const P_req_min = (-fctf - (M_freq / 1000 / Wi_m3)) / ((1 / A_m2) + (Math.abs(ecc_mid) / Wi_m3));

        const results = {
            properties: props,
            materials: { fck, fctm, fctk_inf, fctf },
            loads: { pp: load_pp, perm: load_perm, var: load_var },
            combinations: { freq: comb_freq, qperm: comb_qperm },
            moments: { freq: M_freq, qperm: M_qperm },
            stresses: { inf_freq: sigma_inf_freq, inf_qperm: sigma_inf_qperm },
            prestress: { P_req_min_MPa: P_req_min, P_req_min_kN: P_req_min * 1000 }
        };

        return { checks: results, inputs };
    }

    /**
     * Calculates the eccentricity 'y' at a given position 'x' along the beam,
     * based on the defined cable path segments.
     * @param {number} x_pos - The position along the beam length.
     * @param {Array<object>} cable_path - The array of cable path points.
     * @returns {number} The calculated eccentricity at x_pos.
     */
    function getEccentricityAt(x_pos, cable_path) {
        if (!cable_path || cable_path.length < 2) return 0;
    
        for (let i = 0; i < cable_path.length - 1; i++) {
            const p1 = cable_path[i];
            const p2 = cable_path[i+1];
    
            // Check if x_pos is within the current segment [p1.x, p2.x]
            if (x_pos >= p1.x && x_pos <= p2.x) {
                // If the segment starting at p1 is 'Parabolic' AND there is a point p3 to define the full parabola
                if (p1.type === 'Parabolic' && i + 2 < cable_path.length) {
                    const p_vertex = p2;
                    const p_end = cable_path[i+2];
                    // Check if x_pos is within the first half of the parabola [p1.x, p_vertex.x]
                    if (x_pos <= p_vertex.x) {
                        const parabola = solveParabolaWithVertex([p1.x, p1.y], [p_vertex.x, p_vertex.y]);
                        return parabola ? (parabola.a * (x_pos - p_vertex.x)**2 + p_vertex.y) : interpolate(x_pos, [p1.x, p_vertex.x], [p1.y, p_vertex.y]);
                    }
                    // Check if x_pos is within the second half of the parabola [p_vertex.x, p_end.x]
                    if (x_pos > p_vertex.x && x_pos <= p_end.x) {
                        const parabola = solveParabolaWithVertex([p_end.x, p_end.y], [p_vertex.x, p_vertex.y]);
                        return parabola ? (parabola.a * (x_pos - p_vertex.x)**2 + p_vertex.y) : interpolate(x_pos, [p_vertex.x, p_end.x], [p_vertex.y, p_end.y]);
                    }
                } else { // The segment is 'Straight' or it's the last segment in the path
                    return interpolate(x_pos, [p1.x, p2.x], [p1.y, p2.y]);
                }
            }
        }
        return cable_path[cable_path.length - 1].y; // Fallback to last point
    }
    return { run, calculateSectionProperties, solveParabolaWithVertex, getEccentricityAt };
})();

/**
 * --- UI and Drawing Functions ---
 */
document.addEventListener('DOMContentLoaded', () => {

    const inputIds = [
        'design_code', 'unit_system', 'fck', 'load_pp', 'load_perm', 'load_var',
        'beam_length', 'beam_height', 'beam_coords'
    ];

    function parseVertices(text) {
        return text.split('\n')
            .map(line => line.trim().split(/[,; ]+/).map(Number))
            .filter(pair => pair.length === 2 && !isNaN(pair[0]) && !isNaN(pair[1]));
    }

    function gatherCablePath() {
        const container = document.getElementById('cable-path-container');
        return Array.from(container.querySelectorAll('.cable-path-row')).map(row => ({
            x: parseFloat(row.querySelector('.cable-x').value) || 0,
            y: parseFloat(row.querySelector('.cable-y').value) || 0,
            type: row.querySelector('.cable-type').value
        }));
    }

    function addCablePointRow(containerId, point = { x: 0, y: 0, type: 'Straight' }) {
        const container = document.getElementById(containerId);
        const row = document.createElement('div');
        row.className = 'grid grid-cols-[1fr_1fr_1.5fr_auto] gap-2 items-center cable-path-row';
        
        row.innerHTML = `
            <input type="number" class="cable-x w-full" value="${point.x}">
            <input type="number" class="cable-y w-full" value="${point.y}">
            <select class="cable-type w-full">
                <option value="Straight" ${point.type === 'Straight' ? 'selected' : ''}>Straight</option>
                <option value="Parabolic" ${point.type === 'Parabolic' ? 'selected' : ''}>Parabolic</option>
            </select>
            <button class="remove-point-btn text-red-500 hover:text-red-700 w-8 h-8 flex items-center justify-center">&times;</button>
        `;
        
        row.querySelector('.remove-point-btn').addEventListener('click', (e) => {
            e.preventDefault();
            row.remove();
            debouncedDraw();
        });

        container.appendChild(row);
        // Attach listener to the new row
        row.querySelectorAll('input, select').forEach(el => el.addEventListener('input', debouncedDraw));
    }

    function gatherBeamInputs() {
        const inputs = gatherInputsFromIds(inputIds);
        inputs.vertices = parseVertices(inputs.beam_coords);
        inputs.cable_path = gatherCablePath();
        return inputs;
    }

    /**
     * Draws a polygon on a canvas context, scaling and centering it.
     * @param {CanvasRenderingContext2D} ctx - The canvas context.
     * @param {Array<[number, number]>} vertices - The polygon vertices.
     * @param {number} width - Canvas width.
     * @param {number} height - Canvas height.
     * @param {object} [props] - Optional pre-calculated properties.
     */
    function drawPolygon(ctx, vertices, width, height, props) {
        if (!vertices || vertices.length < 3) return;

        const xCoords = vertices.map(v => v[0]);
        const yCoords = vertices.map(v => v[1]);
        const minX = Math.min(...xCoords);
        const maxX = Math.max(...xCoords);
        const minY = Math.min(...yCoords);
        const maxY = Math.max(...yCoords);

        const shapeWidth = maxX - minX;
        const shapeHeight = maxY - minY;

        if (shapeWidth <= 0 || shapeHeight <= 0) return;

        const padding = 30;
        const scale = Math.min((width - 2 * padding) / shapeWidth, (height - 2 * padding) / shapeHeight);

        ctx.clearRect(0, 0, width, height);
        ctx.save();

        // Center the drawing
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, -scale); // Flip Y-axis
        ctx.translate(-(minX + shapeWidth / 2), -(minY + shapeHeight / 2));

        // Draw Polygon
        ctx.beginPath();
        ctx.moveTo(vertices[0][0], vertices[0][1]);
        for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i][0], vertices[i][1]);
        }
        ctx.closePath();

        ctx.fillStyle = 'lightblue';
        ctx.fill();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2 / scale;
        ctx.stroke();

        // Draw Centroid
        if (props && props.centroid) {
            const { x, y } = props.centroid;
            ctx.beginPath();
            ctx.arc(x, y, 5 / scale, 0, 2 * Math.PI);
            ctx.fillStyle = 'red';
            ctx.fill();
        }

        ctx.restore();
    }

    function drawCrossSectionDiagram() {
        const canvas = document.getElementById('cross-section-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const vertices = parseVertices(document.getElementById('beam_coords').value);
        const props = concreteBeamCalculator.calculateSectionProperties(vertices);
        drawPolygon(ctx, vertices, canvas.width, canvas.height, props);
    }

    function drawLongitudinalDiagram() {
        const canvas = document.getElementById('longitudinal-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const inputs = gatherBeamInputs();

        const { beam_length: L, beam_height: H_cm, ecc_start, ecc_mid, ecc_end } = inputs;
        const H = H_cm / 100; // to meters

        const padding = 40;
        const width = canvas.width;
        const height = canvas.height;

        const scaleX = (width - 2 * padding) / L;
        const scaleY = (height - 2 * padding) / (H * 2); // Scale to fit eccentricities

        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.translate(padding, height / 2);

        // Draw Beam Outline
        ctx.fillStyle = 'lightgrey';
        ctx.fillRect(0, -H / 2 * scaleY, L * scaleX, H * scaleY);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, -H / 2 * scaleY, L * scaleX, H * scaleY);

        // Draw Centroidal Axis
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(L * scaleX, 0);
        ctx.stroke();
        ctx.setLineDash([]);

        // --- Draw Cable Path ---
        ctx.beginPath();
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2.5;

        const path = inputs.cable_path;
        if (path && path.length > 0) {
            ctx.moveTo(path[0].x * scaleX, -path[0].y * scaleY);
            for (let i = 0; i < path.length - 1; i++) {
                const p_start = path[i];
                const p_next = path[i+1];

                if (p_start.type === 'Parabolic' && i + 2 < path.length) {
                    // A full parabolic segment is defined by 3 points: start, vertex, end.
                    const p_vertex = p_next;
                    const p_end = path[i+2];

                    // Draw first half of parabola (p_start to p_vertex)
                    const parabola1 = solveParabolaWithVertex([p_start.x, p_start.y], [p_vertex.x, p_vertex.y]);
                    if (parabola1) {
                        for (let x = p_start.x; x <= p_vertex.x; x += (p_vertex.x - p_start.x) / 25) {
                            ctx.lineTo(x * scaleX, -(parabola1.a * (x - p_vertex.x)**2 + p_vertex.y) * scaleY);
                        }
                    }
                    // Draw second half of parabola (p_vertex to p_end)
                    const parabola2 = solveParabolaWithVertex([p_end.x, p_end.y], [p_vertex.x, p_vertex.y]);
                     if (parabola2) {
                        for (let x = p_vertex.x; x <= p_end.x; x += (p_end.x - p_vertex.x) / 25) {
                            ctx.lineTo(x * scaleX, -(parabola2.a * (x - p_vertex.x)**2 + p_vertex.y) * scaleY);
                        }
                    }
                    i++; // Increment i an extra time because we've processed 3 points (i, i+1, i+2)
                } else {
                    // It's a straight segment or the last segment in the path
                    ctx.lineTo(p_next.x * scaleX, -p_next.y * scaleY);
                }
            }
        }
        ctx.stroke();

        path.forEach(({x, y}) => {
            ctx.beginPath();
            ctx.arc(x * scaleX, -y * scaleY, 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'red';
            ctx.fill();
        });

        ctx.restore();
    }

    function renderResults(results) {
        const { checks, inputs } = results;
        if (!checks) {
            document.getElementById('results-container').innerHTML = '';
            return;
        }

        const fmt = (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A';

        const props = checks.properties;
        const mats = checks.materials;
        const moments = checks.moments;
        const stresses = checks.stresses;
        const prestress = checks.prestress;

        const html = `
        <div id="concrete-beam-report" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end">
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Report</button>
            </div>
            <h2 class="report-title text-center">Prestressed Beam Analysis Results (NBR 6118)</h2>

            <div id="section-props-summary" class="report-section-copyable">
                <h3 class="report-header">Section Properties</h3>
                <table class="w-full mt-2 summary-table">
                    <tr><td>Area (A)</td><td>${fmt(props.area, 2)} cm²</td></tr>
                    <tr><td>Centroid (c<sub>x</sub>, c<sub>y</sub>)</td><td>(${fmt(props.centroid.x, 2)}, ${fmt(props.centroid.y, 2)}) cm</td></tr>
                    <tr><td>Moment of Inertia (I<sub>x</sub>)</td><td>${fmt(props.I.x, 2)} cm⁴</td></tr>
                    <tr><td>Distance to Inf. Fiber (y<sub>i</sub>)</td><td>${fmt(props.yi, 2)} cm</td></tr>
                    <tr><td>Distance to Sup. Fiber (y<sub>s</sub>)</td><td>${fmt(props.ys, 2)} cm</td></tr>
                    <tr><td>Section Modulus (W<sub>i</sub>)</td><td>${fmt(props.W.i, 2)} cm³</td></tr>
                    <tr><td>Section Modulus (W<sub>s</sub>)</td><td>${fmt(props.W.s, 2)} cm³</td></tr>
                </table>
            </div>

            <div id="loads-summary" class="report-section-copyable mt-6">
                <h3 class="report-header">Loads, Moments & Stresses</h3>
                <table class="w-full mt-2 summary-table">
                    <caption class="report-caption">Material Properties</caption>
                    <tr><td>Concrete Strength (f<sub>ck</sub>)</td><td>${fmt(mats.fck, 0)} MPa</td></tr>
                    <tr><td>Tensile Strength, Frequent (f<sub>ct,f</sub>)</td><td>${fmt(mats.fctf, 2)} MPa</td></tr>
                    <caption class="report-caption mt-2">Load Combinations & Moments</caption>
                    <tr><td>Frequent Combination Load</td><td>${fmt(checks.combinations.freq, 2)} kN/m</td></tr>
                    <tr><td>Quasi-Permanent Combination Load</td><td>${fmt(checks.combinations.qperm, 2)} kN/m</td></tr>
                    <tr><td>Moment, Frequent (M<sub>freq</sub>)</td><td>${fmt(moments.freq, 2)} kN.m</td></tr>
                    <tr><td>Moment, Quasi-Permanent (M<sub>qp</sub>)</td><td>${fmt(moments.qperm, 2)} kN.m</td></tr>
                    <caption class="report-caption mt-2">Calculated Stresses</caption>
                    <tr><td>Stress, Inf. Fiber (Frequent)</td><td>${fmt(stresses.inf_freq, 2)} MPa (Tension)</td></tr>
                    <tr><td>Stress, Sup. Fiber (Quasi-Perm.)</td><td>${fmt(stresses.inf_qperm, 2)} MPa (Compression)</td></tr>
                </table>
            </div>

            <div id="prestress-summary" class="report-section-copyable mt-6">
                <h3 class="report-header">Prestressing Force Estimation (ELS-F)</h3>
                <div class="p-4 bg-gray-100 dark:bg-gray-700 rounded-md">
                    <p class="text-lg font-semibold">Minimum Required Prestressing Force (P):</p>
                    <p class="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">${fmt(prestress.P_req_min_kN, 2)} kN</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400">This force is estimated to satisfy the tensile stress limit (f<sub>ct,f</sub>) at the bottom fiber under the frequent load combination.</p>
                </div>
            </div>
        </div>
        `;
        document.getElementById('results-container').innerHTML = html;
    }

    const handleRunCheck = createCalculationHandler({
        gatherInputsFunction: gatherBeamInputs,
        storageKey: 'concrete-beam-inputs',
        calculatorFunction: concreteBeamCalculator.run,
        renderFunction: renderResults,
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });

    // --- Event Listeners ---
    document.getElementById('run-check-btn').addEventListener('click', handleRunCheck);

    const debouncedDraw = debounce(() => {
        drawCrossSectionDiagram();
        drawLongitudinalDiagram();
    }, 300);

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', debouncedDraw);
        }
    });

    // Setup for the new cable path UI
    const defaultCablePath = [
        { x: 0, y: 0.4, type: 'Parabolic' },
        { x: 9, y: -0.3, type: 'Parabolic' },
        { x: 18, y: 0.3, type: 'Straight' }
    ];
    defaultCablePath.forEach(p => addCablePointRow('cable-path-container', p));
    document.getElementById('add-cable-point-btn').addEventListener('click', () => addCablePointRow('cable-path-container'));

    // --- Page Initialization ---
    injectHeader({
        activePage: 'concrete-beam',
        pageTitle: 'NBR Prestressed Concrete Beam Checker',
        headerPlaceholderId: 'header-placeholder'
    });
    injectFooter({ footerPlaceholderId: 'footer-placeholder' });
    initializeSharedUI();

    // Initial draw on page load
    drawCrossSectionDiagram();
    drawLongitudinalDiagram();

    // Results container event delegation for copy button
    document.getElementById('results-container').addEventListener('click', (event) => {
        if (event.target.id === 'copy-report-btn') {
            handleCopyToClipboard('concrete-beam-report', 'feedback-message');
        }
    });
});