// --- FIXED: Add missing helper functions ---

/**
 * Linear interpolation function.
 * @param {number} x - The value to interpolate.
 * @param {array} xs - Sorted array of x-values.
 * @param {array} ys - Corresponding y-values.
 * @returns {number} Interpolated value.
 */
function interpolate(x, xs, ys) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1]) {
      return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]);
    }
  }
  return NaN; // Fallback if no interval found
}

/**
 * Sanitizes HTML strings to prevent XSS.
 * @param {string} str - The string to sanitize.
 * @returns {string} Sanitized string.
 */
function sanitizeHTML(input) {
  const str = String(input || ''); // Coerce to string, handle undefined/null as empty string
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// --- GLOBAL VARIABLES for state management ---
let lastWindRunResults = null;

/**
 * Safely formats a number to a fixed number of decimal places, returning 'N/A' if the number is null, undefined, or not finite.
 * @param {number | null | undefined} val - The number to format.
 * @param {number} [digits=2] - The number of decimal places.
 * @returns {string} The formatted number or 'N/A'.
 */
function safeToFixed(val, digits = 2) {
    // FIX: Explicitly check for null/undefined before calling isFinite, as isFinite(null) is true.
    if (val === null || val === undefined || !isFinite(val)) {
        return "N/A";
    }
    return val.toFixed(digits);
}

function addRangeIndicators() {
    document.querySelectorAll('input[type="number"][min], input[type="number"][max]').forEach(input => {
        const min = input.min ? `Min: ${input.min}` : '';
        const max = input.max ? `Max: ${input.max}` : '';
        const hint = `<div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${[min, max].filter(Boolean).join(' | ')}</div>`;
        input.insertAdjacentHTML('afterend', hint);
    });
}

const windInputIds = [
    'asce_standard', 'unit_system', 'risk_category', 'design_method',
    'jurisdiction', 'ground_elevation',
    'basic_wind_speed', 'exposure_category', 'mean_roof_height', 'building_flexibility',
    'fundamental_period',
    'building_length_L', 'building_width_B', 'enclosure_classification', 'roof_type', 'roof_slope_deg',
    'structure_type', 'solidity_ratio', 'member_shape', 'member_diameter', // Open sign inputs
    'sign_width_B', 'sign_height_s', 'clearance_z', // Solid sign inputs
    'chimney_height', 'chimney_diameter', 'corner_radius_r', // Chimney/Tank inputs
    'tower_height', 'tower_width', 'tower_solidity_ratio', 'tower_member_shape', // Trussed Tower inputs
    'scaffold_width_Br', 'scaffold_height_hr', // Rooftop Structure inputs
    'arched_roof_rise', 'arched_roof_spring_point', // Arched Roof inputs
    'topographic_factor_Kzt', 'gust_effect_factor_g', 'temporary_construction',
    'wind_obstruction', 'effective_wind_area', 'calculate_height_varying_pressure'
];

// FIXED: Updated all rendering functions to use bullet points and paragraphs instead of tables for screenshot-like style

function renderDesignParameters(inputs, intermediate, units) {
  let html = '<div id="design-parameters" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">1. DESIGN PARAMETERS</h3>';
  html += '<button data-copy-target-id="design-parameters" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  html += '<ul class="list-disc list-inside dark:text-gray-300">';
  
  // FIXED: Use <li> for each parameter in "Parameter: Value [Note]" format
  html += `<li>Risk Category: ${sanitizeHTML(inputs.risk_category)} [ASCE 7, Table 1.5-1]</li>`;
  html += `<li>Basic Design Wind Speed (V): ${sanitizeHTML(inputs.basic_wind_speed)} ${units.v_unit} [User Input / Jurisdiction]</li>`;
  html += `<li>Building Dimensions (L x B): ${sanitizeHTML(inputs.building_length_L)} x ${sanitizeHTML(inputs.building_width_B)} ${units.h_unit}</li>`;
  html += `<li>Exposure Category: ${sanitizeHTML(inputs.exposure_category)} [ASCE 7, Sec. 26.7]</li>`;
  html += `<li>Building Height (h): ${sanitizeHTML(inputs.mean_roof_height)} ${units.h_unit}</li>`;
  html += `<li>L/B Ratio (Wind L to L): ${safeToFixed(inputs.building_length_L / inputs.building_width_B, 2)} [Used for Leeward Cp]</li>`;
  html += `<li>L/B Ratio (Wind L to B): ${safeToFixed(inputs.building_width_B / inputs.building_length_L, 2)} [Used for Leeward Cp]</li>`;
  html += `<li>Wind Directionality Factor (Kd): ${safeToFixed(intermediate.Kd, 2)} [ASCE 7 Table 26.6-1]</li>`;
  html += `<li>Topographic Factor (Kzt): ${sanitizeHTML(inputs.topographic_factor_Kzt)} [ASCE 7, Sec. 26.8]</li>`;
  html += `<li>Ground Elevation Factor (Ke): ${safeToFixed(intermediate.Ke, 2)} [ASCE 7 Table 26.9-1 (Elevation: ${sanitizeHTML(inputs.ground_elevation)} ft)]</li>`;
  html += `<li>Gust Effect Factor (G): ${sanitizeHTML(inputs.gust_effect_factor_g)} [User Input]</li>`;
  html += `<li>Enclosure Type: ${sanitizeHTML(inputs.enclosure_classification)} [User Input]</li>`;
  html += `<li>Solidity Ratio (ε): ${sanitizeHTML(inputs.solidity_ratio)}</li>`;
  html += `<li>Member Shape: Flat</li>`;
  html += `<li>Velocity Pressure Coefficient (Kz): ${safeToFixed(intermediate.Kz, 3)} [ASCE 7 Table 26.9-1 (Exposure C)]</li>`;
  html += `<li>Internal Pressure Coefficient (GCpi): ±${sanitizeHTML(inputs.GCpi_abs)} [ASCE 7 Table 26.13-1 (Enclosed)]</li>`;
  
  html += '</ul></div></div>';
  return html;
}

function renderHeightVaryingTable(heightVaryingResults, leeward_pressure, inputs, units) {
  if (!heightVaryingResults || heightVaryingResults.length === 0) return '';
  
  const { p_unit, h_unit } = units;
  const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
  
  let html = '<div id="height-varying-section" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">4. Height-Varying Windward Wall Pressures</h3>';
  html += '<button data-copy-target-id="height-varying-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  html += '<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Windward wall pressures at various heights. Leeward wall pressure is constant.</p>';
  html += '<ul class="list-disc list-inside dark:text-gray-300">';
  
  heightVaryingResults.forEach(row => {
    html += `<li>Height = ${safeToFixed(row.height, 1)} ${h_unit}: K<sub>z</sub> = ${safeToFixed(row.Kz, 3)}, q<sub>z</sub> = ${safeToFixed(row.qz, 2)} ${p_unit}, Windward (+) = ${safeToFixed(row.p_pos * factor, 2)} ${p_unit}, Windward (-) = ${safeToFixed(row.p_neg * factor, 2)} ${p_unit}</li>`;
  });
  
  html += '</ul>';
  html += `<p class="text-sm text-gray-500 dark:text-gray-400 mt-2"><strong>Note:</strong> Leeward wall pressure (constant): ${safeToFixed(leeward_pressure * factor, 2)} ${p_unit}</p>`;
  html += '</div></div>';
  return html;
}

function renderCalculationBreakdown(results, units) {
    const { inputs, intermediate } = results;
    const { p_unit, v_unit, h_unit } = units;
    
    let html = '<div id="calculation-breakdown" class="mt-6 report-section-copyable">';
    html += '<div class="flex justify-between items-center mb-4">';
    html += '<h3 class="report-header flex-grow">2. DETAILED CALCULATION BREAKDOWN</h3>';
    html += '<button data-copy-target-id="calculation-breakdown" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
    html += '</div>';
    html += '<div class="copy-content calc-breakdown">';
    
    // FIXED: Use paragraphs and bold for A) Intermediate Calculations
    html += '<h4 class="font-semibold text-lg mb-2">A) INTERMEDIATE CALCULATIONS</h4>';
    html += `<p>· Factors: I<sub>w</sub> = ${safeToFixed(intermediate.Iw, 3)}, K<sub>d</sub> = ${safeToFixed(intermediate.Kd, 3)}, K<sub>zt</sub> = ${sanitizeHTML(inputs.topographic_factor_Kzt)}, G = ${sanitizeHTML(inputs.gust_effect_factor_g)}, GC<sub>pi</sub> = ${sanitizeHTML(inputs.GCpi_abs)}</p>`;
    html += `<p>· Exposure Constants (α, z<sub>g</sub>): ${safeToFixed(intermediate.alpha, 2)}, ${safeToFixed(intermediate.zg, 1)} ${units.h_unit}</p>`;
    html += `<p>· Elevation Factor (K<sub>e</sub>): ${safeToFixed(intermediate.Ke, 2)} [ASCE 7-16 Table 26.9-1 (Elevation: 100 ft)]</p>`;
    html += `<p>· Exposure Coefficient (K<sub>z</sub>): ${safeToFixed(intermediate.Kz, 3)} [ASCE 7-16 Table 26.9-1 (Exposure C)]</p>`;
    html += `<p>· Velocity Pressure (q<sub>h</sub>): ${safeToFixed(intermediate.qz, 3)} ${p_unit}</p>`;
    
    // Design Pressure Formula
    html += '<div class="mb-4">';
    html += '<h4 class="font-semibold text-lg mb-2">B) DESIGN PRESSURE FORMULA</h4>';
    html += '<p class="mb-2">p = q * G * C<sub>f</sub> [ASCE 7 Eq. 29.5-1]</p>';
    html += '</div>';
    
    html += '</div></div>';
    return html;
}

function renderMwfrsSection(directional_results, inputs, intermediate, mwfrs_method, units) {
  const { p_unit } = units;
  const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
  
  let html = `<div id="mwfrs-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">3. MWFRS Design Pressures (${mwfrs_method})</h3>
                  <button data-copy-target-id="mwfrs-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">`;

  // Wind Perpendicular to L
  if (directional_results.perp_to_L) {
    html += `<h4 class="font-semibold text-lg mt-4 mb-2">Wind Perpendicular to Building Length (L)</h4>`;
    html += '<ul class="list-disc list-inside dark:text-gray-300 mb-6">';
    directional_results.perp_to_L.forEach(result => {
      const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
      const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
      html += `<li>${sanitizeHTML(result.surface)}: Cp = ${safeToFixed(result.cp, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  }

  // Wind Perpendicular to B
  if (directional_results.perp_to_B) {
    html += `<h4 class="font-semibold text-lg mt-4 mb-2">Wind Perpendicular to Building Width (B)</h4>`;
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.perp_to_B.forEach(result => {
      const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
      const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
      html += `<li>${sanitizeHTML(result.surface)}: Cp = ${safeToFixed(result.cp, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  }

  html += `</div></div>`;
  return html;
}

function renderOpenBuildingResults(directional_results, open_building_ref, inputs, units) {
  const { p_unit } = units;
  const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
  
  let html = `<div id="open-building-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">3. Open Building Net Pressures</h3>
                  <button data-copy-target-id="open-building-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">
                <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">
                  Reference: ${sanitizeHTML(open_building_ref || 'ASCE 7 Ch. 27/29')}
                </p>`;

  // Check if this is rooftop structure data (high-rise open building)
  if (directional_results.rooftop_structure) {
    html += '<p class="mb-2">· Formula: p = q<sub>h</sub> × GCr</p>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.rooftop_structure.forEach(result => {
      const pressure = inputs.design_method === 'ASD' ? result.pressure_asd : result.pressure;
      html += `<li>${sanitizeHTML(result.surface)}: GCr = ${safeToFixed(result.GCr, 2)}, Design Pressure = ${safeToFixed(pressure, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  } else if (directional_results.open_roof) {
    // Low-rise open building
    html += '<p class="mb-2">· Formula: p = q<sub>h</sub> × G × CN</p>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.open_roof.forEach(result => {
      const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
      const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
      html += `<li>${sanitizeHTML(result.surface)}: CN (+) = ${safeToFixed(result.cn_pos, 2)}, CN (-) = ${safeToFixed(result.cn_neg, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  }

  html += `</div></div>`;
  return html;
}

function renderCandCSection(candc, inputs, units, directional_results) {
  if (!candc || !candc.applicable) return '';
  const { is_imp, p_unit } = units;
  let html = `<div id="candc-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">6. Components & Cladding (C&C) Pressures</h3>
                  <button data-copy-target-id="candc-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Calculated for Effective Wind Area A = ${sanitizeHTML(inputs.effective_wind_area)} ${is_imp ? 'ft²' : 'm²'}. Reference: ${sanitizeHTML(candc.ref)}.
                </p>
                ${generateCandCDiagram(inputs, candc)}`;

  if (candc.is_high_rise) {
    html += '<h4 class="font-semibold text-lg mb-2">High-Rise C&C Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    for (const zone in candc.pressures) {
      const data = candc.pressures[zone];
      const p_pos_lrfd = data.p_pos;
      const p_neg_lrfd = data.p_neg;
      const p_pos_asd = p_pos_lrfd * 0.6;
      const p_neg_asd = p_neg_lrfd * 0.6;
      html += `<li>${sanitizeHTML(zone)}: GCp (+) = ${safeToFixed(data.gcp_pos, 2)}, GCp (-) = ${safeToFixed(data.gcp_neg, 2)}, LRFD Pressure (+ / -) = ${safeToFixed(p_pos_lrfd, 2)} / ${safeToFixed(p_neg_lrfd, 2)} ${p_unit}, ASD Pressure (+ / -) = ${safeToFixed(p_pos_asd, 2)} / ${safeToFixed(p_neg_asd, 2)} ${p_unit}</li>`;
    }
    html += '</ul>';
  } else {
    html += '<h4 class="font-semibold text-lg mb-2">Low-Rise C&C Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    for (const zone in candc.pressures) {
      const data = candc.pressures[zone];
      const pressure = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
      html += `<li>${sanitizeHTML(zone)}: GCp = ${safeToFixed(data.gcp, 2)}, Design Pressure (${inputs.design_method}) = ${safeToFixed(pressure, 2)} ${p_unit}</li>`;
    }
    html += '</ul>';
  }
  html += `</div></div>`;
  return html;
}

function renderTorsionalCase(torsional_case, inputs, units) {
  if (!torsional_case) return '';
  
  const { h_unit } = units;
  const M_unit = inputs.unit_system === 'imperial' ? 'lb-ft' : 'N-m';
  
  let html = '<div id="torsional-section" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">5. Torsional Load Case</h3>';
  html += '<button data-copy-target-id="torsional-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  html += '<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Torsional moment per ASCE 7 Figure 27.4-8, Case 2. Apply with 75% of Case 1 wall pressures.</p>';
  html += '<ul class="list-disc list-inside dark:text-gray-300">';
  
  if (torsional_case.perp_to_L) {
    html += `<li>Wind Direction: Perpendicular to L, Torsional Moment M<sub>t</sub> = ${safeToFixed(torsional_case.perp_to_L.Mt, 0)} ${M_unit}, Eccentricity = 0.15 × B = ${safeToFixed(0.15 * inputs.building_width_B, 2)} ${h_unit}</li>`;
  }
  
  if (torsional_case.perp_to_B) {
    html += `<li>Wind Direction: Perpendicular to B, Torsional Moment M<sub>t</sub> = ${safeToFixed(torsional_case.perp_to_B.Mt, 0)} ${M_unit}, Eccentricity = 0.15 × L = ${safeToFixed(0.15 * inputs.building_length_L, 2)} ${h_unit}</li>`;
  }
  
  html += '</ul>';
  html += '</div></div>';
  return html;
}

function generateWindSummary(inputs, directional_results, candc, p_unit) {
  let html = '<div id="wind-summary" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">Summary of Key Pressures</h3>';
  html += '<button data-copy-target-id="wind-summary" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  
  // MWFRS Governing Pressures
  if (directional_results && (directional_results.perp_to_L || directional_results.perp_to_B)) {
    let max_ww = -Infinity, min_ww = Infinity;
    let max_lw = -Infinity, min_lw = Infinity;
    
    const allResults = [
        ...(directional_results.perp_to_L || []),
        ...(directional_results.perp_to_B || [])
    ];
    
    allResults.forEach(r => {
        const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
        const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
        
        if (r.surface.includes('Windward Wall')) {
            max_ww = Math.max(max_ww, p_pos);
            min_ww = Math.min(min_ww, p_neg);
        }
        if (r.surface.includes('Leeward Wall')) {
            max_lw = Math.max(max_lw, p_pos);
            min_lw = Math.min(min_lw, p_neg);
        }
    });
    
    html += '<h4 class="font-semibold text-lg mb-2">MWFRS Governing Pressures</h4>';
    html += '<ul class="list-disc list-inside mb-4 dark:text-gray-300">';
    if (isFinite(max_ww)) html += `<li>Windward Wall: ${safeToFixed(max_ww, 2)} to ${safeToFixed(min_ww, 2)} ${p_unit}</li>`;
    if (isFinite(max_lw)) html += `<li>Leeward Wall: ${safeToFixed(max_lw, 2)} to ${safeToFixed(min_lw, 2)} ${p_unit}</li>`;
    html += '</ul>';
  }
  
  // C&C Summary
  if (candc && candc.applicable && candc.pressures) {
    let max_candc = -Infinity, min_candc = Infinity;
    
    for (const data of Object.values(candc.pressures)) {
      const p_pos = inputs.design_method === 'ASD' ? (data.p_pos || 0) * 0.6 : (data.p_pos || 0);
      const p_neg = inputs.design_method === 'ASD' ? (data.p_neg || 0) * 0.6 : (data.p_neg || 0);
      max_candc = Math.max(max_candc, p_pos);
      min_candc = Math.min(min_candc, p_neg);
    }
    
    html += '<h4 class="font-semibold text-lg mb-2">C&C Governing Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    html += `<li>Maximum: ${safeToFixed(max_candc, 2)} ${p_unit}</li>`;
    html += `<li>Minimum (Suction): ${safeToFixed(min_candc, 2)} ${p_unit}</li>`;
    html += '</ul>';
  }
  
  html += '</div></div>';
  return html;
}

// =================================================================================
//  UI INJECTION & INITIALIZATION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {    
    // 1. Create the main calculation handler first, so it's available to other functions.
    const handleRunWindCalculation = createCalculationHandler({
        inputIds: windInputIds,
        storageKey: 'wind-calculator-inputs',
        validatorFunction: validateWindInputs,
        calculatorFunction: windLoadCalculator.run,
        renderFunction: renderWindResults,
        resultsContainerId: 'results-container',
        feedbackElId: 'feedback-message', // Explicitly pass feedback element ID
        buttonId: 'run-calculation-btn'
    });

    // --- EVENT HANDLERS ---
    function attachEventListeners() {
        document.getElementById('mean_roof_height').addEventListener('input', (event) => {
            const h = parseFloat(event.target.value) || 0;
            const is_imp = document.getElementById('unit_system').value === 'imperial';
            const limit = is_imp ? 60 : 18.3;
            document.getElementById('tall-building-section').classList.toggle('hidden', h <= limit);
        });

        // Create file-based handlers
        const handleSaveWindInputs = createSaveInputsHandler(windInputIds, 'wind-inputs.txt');
        const handleLoadWindInputs = createLoadInputsHandler(windInputIds, handleRunWindCalculation);

        // Attach handlers to buttons
        document.getElementById('run-calculation-btn').addEventListener('click', handleRunWindCalculation);
        document.getElementById('save-inputs-btn').addEventListener('click', handleSaveWindInputs);
        document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('wind-file-input'));
        document.getElementById('wind-file-input').addEventListener('change', (e) => handleLoadWindInputs(e));

        document.body.addEventListener('click', async (event) => {
            const copyBtn = event.target.closest('.copy-section-btn');
            if (copyBtn) {
                const targetId = copyBtn.dataset.copyTargetId;
                if (targetId) {
                    await handleCopyToClipboard(targetId, 'feedback-message');
                }
            }
            if (event.target.id === 'copy-report-btn') {
                await handleCopyToClipboard('wind-report-content', 'feedback-message');
            }
            if (event.target.id === 'send-to-combos-btn' && lastWindRunResults) {
                sendWindToCombos(lastWindRunResults);
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            if (event.target.id === 'download-pdf-btn') {
                handleDownloadPdf('wind-report-content', 'Wind-Load-Report.pdf');
            }
            if (event.target.id === 'download-word-btn') {
                handleDownloadWord('wind-report-content', 'Wind-Load-Report.doc');
            }
            const button = event.target.closest('.toggle-details-btn');
            if (button) {
                const detailId = button.dataset.toggleId;
                const detailRow = document.getElementById(detailId);
                if (detailRow) {
                    detailRow.classList.toggle('is-visible');
                    button.textContent = detailRow.classList.contains('is-visible') ? '[Hide]' : '[Show]';
                }
            }
        });
    }

    // 3. Define the main app initialization function.
    function initializeApp() {
        initializeSharedUI();
        attachEventListeners();
        addRangeIndicators();
        // Use a small timeout to ensure all elements are ready before triggering a calculation from localStorage
        setTimeout(() => {
            loadInputsFromLocalStorage('wind-calculator-inputs', windInputIds);
        }, 100);
    }

    // 4. Run the app.
    initializeApp();    
}); // END DOMContentLoaded

// =================================================================================
//  WIND LOAD CALCULATOR LOGIC
// =================================================================================

const windLoadCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
// Internal pressure coefficient GCpi
// Reference: ASCE 7-16/22 Table 26.13-1
function getInternalPressureCoefficient(enclosureClass) {
        const map = {
            "Enclosed": [0.18, "ASCE 7 Table 26.13-1 (Enclosed)"],
            "Partially Enclosed": [0.55, "ASCE 7 Table 26.13-1 (Partially Enclosed)"],
            "Open": [0.00, "ASCE 7 Table 26.13-1 (Open)"]
        };
        return map[enclosureClass] || [0.00, "Invalid Enclosure"];
    }

    /**
     * Calculates the net force coefficient (Cf) for open signs and lattice frameworks.
     * Reference: ASCE 7-16/22 Figure 29.5-1
     * @param {number} solidity_ratio - The ratio of solid area to gross area (ε).
     * @param {object} options - An object containing member_shape, V (wind speed), b (diameter), and unit_system.
     * @returns {{Cf: number, ref: string}}
     */
    function getOpenSignCf(solidity_ratio, options) {
        const { member_shape, V, b, unit_system } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0)); // Clamp between 0 and 1

        if (member_shape === 'flat') {
            // Interpolate for flat-sided members from Figure 29.5-1
            const cf = interpolate(epsilon, [0.1, 0.3, 0.5, 1.0], [1.8, 1.7, 1.6, 2.0]);
            return { Cf: cf, ref: "ASCE 7 Fig. 29.5-1 (Flat Members)" };
        } else { // 'round' members
            // For round members, Cf depends on V*sqrt(b) and epsilon.
            // V must be in ft/s and b in ft.
            const V_fps = unit_system === 'imperial' ? V * 1.467 : V * 3.281;
            const b_ft = unit_system === 'imperial' ? b : b * 3.281;
            const V_sqrt_b = V_fps * Math.sqrt(b_ft);

            // Interpolation data from ASCE 7-16 Fig 29.5-1 for round members
            const epsilon_points = [0.1, 0.3, 0.5, 1.0];
            const cf_low_reynolds = [0.7, 0.8, 0.8, 1.2]; // For V*sqrt(b) < 2.5
            const cf_high_reynolds = [1.2, 1.3, 1.3, 1.5]; // For V*sqrt(b) >= 2.5

            const cf_values = (V_sqrt_b < 2.5) ? cf_low_reynolds : cf_high_reynolds;
            const cf = interpolate(epsilon, epsilon_points, cf_values);
            return { Cf: cf, ref: `ASCE 7 Fig. 29.5-1 (Round, V√b=${safeToFixed(V_sqrt_b, 1)})` };
        }
    }

    /**
     * Calculates the net pressure coefficient (CN) for solid freestanding signs.
     * Reference: ASCE 7-16/22 Figure 29.3-1
     * @param {number} B - Width of the sign.
     * @param {number} s - Height of the sign.
     * @param {number} h - Height to the top of the sign.
     * @returns {{CN: number, ref: string}}
     */
    function getSolidSignCn(B, s, h) {
        if (!isFinite(B) || !isFinite(s) || !isFinite(h)) {
            return { CN: 0, ref: "Invalid dimensions for Solid Sign" };
        }

        const M = s > 0 ? B / s : 0;
        const s_over_h = h > 0 ? s / h : 0;

        // Interpolation data from ASCE 7-16 Fig 29.3-1
        const M_points = [0.25, 1, 2, 4, 10, 20, 40];
        const CN_at_s_over_h_1 = [1.2, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6];
        const CN_at_s_over_h_0 = [1.8, 1.85, 1.9, 1.9, 1.95, 1.95, 2.0];

        const CN = interpolate(M, M_points, s_over_h < 0.5 ? CN_at_s_over_h_0 : CN_at_s_over_h_1);
        return { CN, ref: `ASCE 7 Fig. 29.3-1 (M=${safeToFixed(M, 2)}, s/h=${safeToFixed(s_over_h, 2)})` };
    }

    /**
     * Returns the net pressure coefficients (GCr) for rooftop structures on buildings with h > 60ft.
     * This function now correctly uses Figure 29.5-1 for open lattice frameworks (like scaffolds)
     * and falls back to a solid coefficient for other cases.
     * @param {object} inputs - The main user inputs object.
     * @returns {{GCrh: number, GCrv: number, ref: string}} Object with horizontal and vertical coefficients.
     */
    function getRooftopStructureCoefficients(inputs) {
        const { scaffold_width_Br, scaffold_height_hr, solidity_ratio, member_shape, V_in, unit_system } = inputs;

        if (!isFinite(scaffold_width_Br) || scaffold_width_Br <= 0 || !isFinite(scaffold_height_hr) || scaffold_height_hr <= 0) {
            return { GCrh: 0, GCrv: 0, ref: "Invalid rooftop structure dimensions" };
        }

        // --- CORRECTED LOGIC for Open Lattice Frameworks (Scaffolds) ---
        // Use getOpenSignCf which implements ASCE 7-16 Fig 29.5-1
        const cf_options = {
            member_shape: member_shape,
            V: V_in,
            b: 1.0, // Assume a typical member size of 1ft for Reynolds number check, as it's not a primary input here.
            unit_system: unit_system
        };
        const { Cf, ref } = getOpenSignCf(solidity_ratio, cf_options);
        const GCrh = Cf; // For open frameworks, the force coefficient is Cf.

        // Vertical uplift for open frames is generally smaller. 1.5 is a conservative value for solid objects.
        // A value of 0.8 is more reasonable for open frames, though code is less explicit.
        const GCrv = 1.5; // Coefficient for vertical force (uplift)

        return { GCrh, GCrv, ref };
    }


    /**
     * Calculates the net force coefficient (Cf) for chimneys, tanks, and similar structures.
     * Reference: ASCE 7-16/22 Figure 29.4-1
     * @param {object} options - An object containing shape, h, D, qz, r, and unit_system.
     * @returns {{Cf: number, ref: string}}
     */
    function getChimneyCf(options) {
        const { shape, h, D, qz, r, unit_system } = options;
        if (D <= 0 || h <= 0) return { Cf: 0, ref: "Invalid dimensions" };

        const h_over_D = h / D;
        const h_D_points = [1, 7, 25];
        let cf_values;

        switch (shape) {
            case 'Square':
                const r_over_D = r / D;
                cf_values = (r_over_D >= 0.05)
                    ? [1.0, 1.1, 1.2] // Rounded
                    : [1.3, 1.4, 2.0]; // Sharp
                const Cf_sq = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_sq, ref: `ASCE 7 Fig. 29.4-1 (Square, r/D=${safeToFixed(r_over_D, 2)})` };

            case 'Hexagonal':
            case 'Octagonal':
                cf_values = [1.0, 1.2, 1.4];
                const Cf_hex = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_hex, ref: `ASCE 7 Fig. 29.4-1 (${shape})` };

            case 'Round':
                // D must be in ft and qz in psf for the D*sqrt(qz) parameter.
                const D_ft = unit_system === 'imperial' ? D : D * 3.281;
                const qz_psf = unit_system === 'imperial' ? qz : qz * 0.020885;
                const D_sqrt_qz = D_ft * Math.sqrt(qz_psf);

                if (D_sqrt_qz < 2.5) { // Moderately smooth, subcritical
                    cf_values = [0.5, 0.6, 0.7];
                } else { // Rough or supercritical
                    cf_values = [0.7, 0.8, 0.9];
                }
                const Cf_round = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_round, ref: `ASCE 7 Fig. 29.4-1 (Round, D√q_z=${safeToFixed(D_sqrt_qz, 1)})` };

            default:
                return { Cf: 1.4, ref: "ASCE 7 Fig. 29.4-1 (Default/Unknown)" };
        }
    }

    /**
     * Calculates the net force coefficient (Cf) for trussed towers.
     * Reference: ASCE 7-16/22 Tables 29.6-1 and 29.6-2
     * @param {object} options - An object containing structure_type, solidity_ratio, and member_shape.
     * @returns {{Cf: number, ref: string}}
     */
    function getTrussedTowerCf(options) {
        const { structure_type, solidity_ratio, member_shape } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0));
        let Cf;
        let ref;

        if (member_shape === 'flat') {
            // ASCE 7 Table 29.6-1 for flat-sided members
            Cf = 4.0 * epsilon**2 - 5.9 * epsilon + 4.0;
            ref = "ASCE 7 Table 29.6-1 (Flat Members)";
        } else { // round members
            // ASCE 7 Table 29.6-2 for round members
            if (structure_type.includes('Square')) {
                Cf = 3.4 * epsilon**2 - 4.7 * epsilon + 2.7;
                ref = "ASCE 7 Table 29.6-2 (Square Tower, Round Members)";
            } else { // Triangular or All Other
                Cf = 2.6 * epsilon**2 - 3.5 * epsilon + 2.2;
                ref = "ASCE 7 Table 29.6-2 (Triangular Tower, Round Members)";
            }
        }
        return { Cf: Math.max(Cf, 0), ref }; // Ensure Cf is not negative
    }

    /**
     * Calculates the net pressure coefficient (CN) for arched roofs.
     * Reference: ASCE 7-16/22 Figure 27.3-3
     * @param {object} options - An object containing r (rise), B (span), h (eave height), and spring_point.
     * @returns {{cnMap: object, ref: string}}
     */
    function getArchedRoofCn(options) {
        const { r, B, h, spring_point } = options;
        if (B <= 0) return { cnMap: {}, ref: "Invalid span" };

        const r_over_B = r / B;
        const h_over_B = spring_point === 'On Ground' ? 0 : h / B;
        const cnMap = {};

        // Interpolation data from ASCE 7-16 Fig 27.3-3
        const r_B_points = [0.05, 0.2, 0.3, 0.4, 0.5];

        // Windward Quarter
        const cn_windward_ground = [0.9, 1.1, 1.1, 1.1, 1.1];
        const cn_windward_elevated = [1.5, 1.4, 1.4, 1.4, 1.4];
        const cn_windward = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_windward_ground), interpolate(r_over_B, r_B_points, cn_windward_elevated)]);
        cnMap['Windward Quarter'] = cn_windward;

        // Center Half (and Leeward Quarter)
        const cn_center_h_B_0 = [-0.7, -0.8, -1.0, -1.1, -1.1];
        const cn_center_h_B_0_5 = [-0.9, -0.8, -0.8, -0.8, -0.8];
        const cn_center = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_center_h_B_0), interpolate(r_over_B, r_B_points, cn_center_h_B_0_5)]);
        cnMap['Center Half & Leeward Quarter'] = cn_center;

        return { cnMap, ref: `ASCE 7 Fig. 27.3-3 (r/B=${safeToFixed(r_over_B, 2)}, h/B=${safeToFixed(h_over_B, 2)})` };
    }

    // Detailed Cp values for Gable and Hip roofs
    // Reference: ASCE 7-16/22 Figure 27.3-2
    function getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem) {
        const cpMap = {};
        const theta = roofSlopeDeg;
        const h_over_L = L > 0 ? h / L : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        // Calculate 'a' per ASCE 7-16/22 Section 27.3.2
        const least_dim = Math.min(L, B);
        let a = Math.min(0.1 * least_dim, 0.4 * h);
        const min_a_val1 = 0.04 * least_dim;
        const min_a_val2 = unitSystem === 'imperial' ? 3.0 : 0.9;
        a = Math.max(a, min_a_val1, min_a_val2);

        const a_str = `(a=${safeToFixed(a, 1)} ${h_unit})`;

        // Interpolation functions for Cp based on theta and h/L
        // Windward zones (1, 2, 3)
        const cp_1_windward = interpolate(theta, [10, 20, 30, 45], [-0.7, -0.4, 0.2, 0.4]);
        const cp_2_windward = interpolate(theta, [10, 20, 30, 45], [-0.9, -0.7, -0.2, 0.4]);
        const cp_3_windward = interpolate(theta, [20, 30, 45], [-1.3, -1.0, -0.5]);

        // Leeward zones (1, 2, 3)
        const cp_1_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.5, -0.5, -0.3]);
        const cp_2_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.7, -0.7, -0.5]);
        const cp_3_leeward = -0.9;

        // Assign values to the map
        cpMap[`Roof Zone 1 (Windward)`] = cp_1_windward;
        cpMap[`Roof Zone 2 (Windward) ${a_str}`] = cp_2_windward;
        if (theta >= 20) {
            cpMap[`Roof Zone 3 (Windward) ${a_str}`] = cp_3_windward;
        }

        cpMap[`Roof Zone 1 (Leeward)`] = cp_1_leeward;
        cpMap[`Roof Zone 2 (Leeward) ${a_str}`] = cp_2_leeward;
        cpMap[`Roof Zone 3 (Leeward) ${a_str}`] = cp_3_leeward;

        if (isHip) {
            // Hip roof end zones (1E, 2E, 3E)
            const cp_1E = interpolate(theta, [10, 20, 27], [-0.9, -0.7, -0.5]);
            const cp_2E = interpolate(theta, [10, 20, 27], [-1.3, -0.9, -0.7]);
            const cp_3E = interpolate(theta, [20, 27], [-1.3, -1.0]);

            cpMap[`Hip End Zone 1E`] = cp_1E;
            cpMap[`Hip End Zone 2E ${a_str}`] = cp_2E;
            if (theta >= 20) {
                cpMap[`Hip End Zone 3E ${a_str}`] = cp_3E;
            }
        }

        // Side walls are always -0.7
        cpMap["Side Wall"] = -0.7;

        return cpMap;
    }

    // Cp values for buildings of all heights (Analytical Procedure)
    // Reference: ASCE 7-16 Figure 27.3-1
    function getAnalyticalCpValues(h, dim_parallel_to_wind, dim_perp_to_wind, roofSlopeDeg) {
    const cpMap = {};
    const L_over_B = dim_perp_to_wind > 0 ? dim_parallel_to_wind / dim_perp_to_wind : 0;
    
    cpMap["Windward Wall"] = 0.8;
    cpMap["Side Wall"] = -0.7;
    // Leeward wall Cp depends on L/B ratio
    cpMap[`Leeward Wall (L/B = ${safeToFixed(L_over_B, 2)})`] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
    
    
    // Roof coefficients also depend on h/L ratio
    const h_over_L = dim_parallel_to_wind > 0 ? h / dim_parallel_to_wind : 0;
    
    if (h_over_L <= 0.8) { // Note: ASCE 7-16 Fig 27.3-1 uses h/L, not h/B
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.7, -0.5, -0.3, -0.2, 0.0, 0.2, 0.4]); // This was missing a value in the original code
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20], [-0.3, -0.5, -0.6]);
    } else {
        // ASCE 7-16 Fig. 27.3-1 uses h/L, not h/B
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.9, -0.7, -0.4, -0.3, -0.2, 0.0, 0.4]);
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = -0.7;
    }
    
    return { cpMap };
}

    // Net pressure coefficients CN for Open Buildings with Free Roofs
    // Reference: ASCE 7-16/22 Figure 27.3-4
    function getOpenBuildingCnValues(roofSlopeDeg, isObstructed, roofType) {
        const cnMap = {};
        const theta = Math.abs(roofSlopeDeg); // Use absolute slope
        const caseKey = isObstructed ? 'obstructed' : 'unobstructed';

        // For flat roofs (theta <= 5 deg), use the values for theta = 5 deg.
        // ASCE 7-16/22 Fig 27.3-4 starts its charts at 5 degrees.
        const interp_theta = Math.max(theta, 5);

        // Net Pressure Coefficients, CN, for Monoslope Roofs
        const monoslope_map = {
            unobstructed: {
                zones: ['Zone 2', 'Zone 3'],
                // FIX: Interpolate using interp_theta to handle flat roofs (theta < 5)
                windward_qtr: [interpolate(interp_theta, [5, 30, 45], [0.8, 1.2, 1.2]), interpolate(interp_theta, [5, 30, 45], [1.2, 1.8, 1.8])],
                middle_half:  [interpolate(interp_theta, [5, 30, 45], [-0.8, -0.8, -0.8]), interpolate(interp_theta, [5, 30, 45], [-1.2, -1.2, -1.2])],
                leeward_qtr:  [interpolate(interp_theta, [5, 30, 45], [-0.6, -0.5, -0.5]), interpolate(interp_theta, [5, 30, 45], [-1.0, -0.8, -0.8])]
            },
            obstructed: {
                zones: ['Zone 2', 'Zone 3'],
                windward_qtr: [interpolate(theta, [5, 30, 45], [1.6, 2.4, 2.4]), interpolate(theta, [5, 30, 45], [2.2, 3.3, 3.3])],
                middle_half:  [interpolate(theta, [5, 30, 45], [-1.6, -1.6, -1.6]), interpolate(theta, [5, 30, 45], [-2.2, -2.2, -2.2])],
                leeward_qtr:  [interpolate(theta, [5, 30, 45], [-1.2, -1.0, -1.0]), interpolate(theta, [5, 30, 45], [-1.6, -1.4, -1.4])]
            }
        };

        // For pitched/troughed/flat, we use the monoslope values for each half
        const data = monoslope_map[caseKey];
        cnMap[`Windward Roof (First Quarter)`] = { cn_pos: data.windward_qtr[0], cn_neg: -data.windward_qtr[0] };
        cnMap[`Windward Roof (Zone 3)`] = { cn_pos: data.windward_qtr[1], cn_neg: -data.windward_qtr[1] };
        cnMap[`Middle Roof Area (Half)`] = { cn_pos: data.middle_half[0], cn_neg: -data.middle_half[0] };
        cnMap[`Middle Roof Area (Zone 3)`] = { cn_pos: data.middle_half[1], cn_neg: -data.middle_half[1] };
        cnMap[`Leeward Roof (Last Quarter)`] = { cn_pos: data.leeward_qtr[0], cn_neg: -data.leeward_qtr[0] };
        cnMap[`Leeward Roof (Zone 3)`] = { cn_pos: data.leeward_qtr[1], cn_neg: -data.leeward_qtr[1] };

        return { cnMap, ref: `ASCE 7 Fig 27.3-4 (${caseKey} flow)` };
    }

    // External pressure coefficients Cp
    // Reference: ASCE 7-16/22 Figures 27.4-1, 27.4-2, 27.4-3 (now includes edge/corner zones for flat roofs)
    // NOTE: For more complex roof shapes, see future improvement
    function getCpValues(standard, h, L, B, roofType, roofSlopeDeg, unitSystem) {
        const cpMap = {};
        const refNotes = {};
        const L_over_B = B > 0 ? L / B : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        cpMap["Windward Wall"] = 0.8;
        refNotes["Windward Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Side Wall"] = -0.7;
        refNotes["Side Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Leeward Wall"] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
        refNotes["Leeward Wall"] = "ASCE 7 Fig. 27.4-1 (varies with L/B)";

        if (roofType === "flat") {
            if (standard === "ASCE 7-22") {
                // ASCE 7-22 Figure 27.4-1 (Zoned approach)
                let a = Math.min(0.1 * Math.min(L, B), 0.4 * h);
                const min_a = unitSystem === 'imperial' ? 3.0 : 0.9;
                a = Math.max(a, min_a);
                cpMap[`Roof Zone 1 (0 to ${safeToFixed(a, 1)} ${h_unit})`] = -0.9;
                cpMap[`Roof Zone 2 (${safeToFixed(a, 1)} to ${safeToFixed(2*a, 1)} ${h_unit})`] = -0.5;
                cpMap[`Roof Zone 3 (> ${safeToFixed(2*a, 1)} ${h_unit})`] = -0.3;
                refNotes["Roof"] = "ASCE 7-22 Fig. 27.4-1 (Zoned approach)";
            } else { // ASCE 7-16
                // ASCE 7-16 Figure 27.4-1 (h/L approach)
                const h_over_L = L > 0 ? h / L : 0;
                if (h_over_L <= 0.5) {
                    cpMap[`Roof (0 to ${safeToFixed(h/2, 1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${safeToFixed(h/2, 1)} to ${safeToFixed(h, 1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${safeToFixed(h, 1)} to ${safeToFixed(2*h, 1)} ${h_unit})`] = -0.5;
                    cpMap[`Roof (> ${safeToFixed(2*h, 1)} ${h_unit})`] = -0.3;
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L ≤ 0.5)";
                } else { // ASCE 7-16 Fig. 27.4-1 (h/L > 0.5)
                    cpMap[`Roof (0 to ${safeToFixed(h/2, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -1.3]);
                    cpMap[`Roof (${safeToFixed(h/2, 1)} to ${safeToFixed(h, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -0.7]);
                    cpMap[`Roof (> ${safeToFixed(h, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.5, -0.4]);
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L > 0.5)";
                }
            }
        } else if (["gable", "hip"].includes(roofType)) {
            const isHip = roofType === 'hip';
            const gableHipCp = getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem);
            Object.assign(cpMap, gableHipCp);
            refNotes["Roof"] = `ASCE 7-16/22 Fig. 27.4-2 (${isHip ? 'Hip' : 'Gable'})`;
        }
        return { cpMap, refNotes };
    }

// Directionality factor Kd
// Reference: ASCE 7-16/22 Table 26.6-1
function getKdFactor(structureType, asce_standard) {
        const kdMap = {
            "Buildings (MWFRS, C&C)": [0.85, "ASCE 7 Table 26.6-1 (Buildings)"],
            "Arched Roofs": [0.85, "ASCE 7 Table 26.6-1 (Arched Roofs)"],
            "Solid Freestanding Signs/Walls": [0.85, "ASCE 7 Table 26.6-1 (Signs/Walls)"],
            "Open Signs/Frames": [0.85, "ASCE 7 Table 26.6-1 (Open Signs)"],
            "Trussed Towers (Triangular, Square, Rectangular)": [0.85, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Trussed Towers (All Other Cross Sections)": [0.95, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Chimneys, Tanks (Square)": [0.90, "ASCE 7 Table 26.6-1 (Square)"], // This is for C&C, MWFRS is 0.85
            "Chimneys, Tanks (Round)": [0.95, "ASCE 7 Table 26.6-1 (Round)"], // This is for C&C, MWFRS is 0.85
            "Chimneys, Tanks (Hexagonal)": [0.95, "ASCE 7 Table 26.6-1 (Hexagonal)"]
        };
        // ASCE 7-22, Table 26.6-1, Note 3 states Kd=1.0 for MWFRS of other structures.
        // This includes open signs.
        if (asce_standard === 'ASCE 7-22' && structureType === 'Open Signs/Frames') {
            return [1.0, "ASCE 7-22 Table 26.6-1, Note 3"];
        }

        return kdMap[structureType] || [1.0, "ASCE 7 Table 26.6-1 (Default)"];
    }

// Importance factor Iw
// Reference: ASCE 7-16/22 Table 1.5-2
function getImportanceFactor(category, standard) {
        const factors = standard === "ASCE 7-22" ? { "I": 0.75, "II": 1.00, "III": 1.15, "IV": 1.15 } : { "I": 0.87, "II": 1.00, "III": 1.15, "IV": 1.15 };
        const ref = standard === "ASCE 7-22" ? "ASCE 7-22 Table 1.5-2" : "ASCE 7-16 Table 1.5-2";
        return [factors[category] || 1.00, ref];
    }

// Wind exposure constants (alpha, zg)
// Reference: ASCE 7-16/22 Table 26.9-1
function getExposureConstants(category, units) {
    const expMap = {
        'B': { alpha: 7.0, zg_imp: 1200.0, zg_metric: 365.8, ref: "ASCE 7 Table 26.9-1 (Exposure B)" },
        'C': { alpha: 9.5, zg_imp: 900.0, zg_metric: 274.3, ref: "ASCE 7 Table 26.9-1 (Exposure C)" },
        'D': { alpha: 11.5, zg_imp: 700.0, zg_metric: 213.4, ref: "ASCE 7 Table 26.9-1 (Exposure D)" }
    };
    const data = expMap[category] || expMap['C'];
    const zg = units === 'imperial' ? data.zg_imp : data.zg_metric;
    return { alpha: data.alpha, zg, ref_note: data.ref };
}

// Calculation of exposure factor Kz
// Reference: ASCE 7-16/22 Section 26.10, Eq. 26.10-1
// Table 26.10-1 for exposure constants
function calculateKz(h, category, units) { // Refactored for readability
    // --- 1. Input Validation (Guard Clauses) ---
    if (!isFinite(h) || h < 0 || !category) {
        console.error("Invalid parameters for calculateKz:", { h, category });
        return { Kz: 1.0, alpha: 0, zg: 0, ref_note: "Error: Invalid input" };
    }

    const { alpha, zg, ref_note } = getExposureConstants(category, units);
    if (!isFinite(alpha) || !isFinite(zg) || alpha <= 0 || zg <= 0) {
        console.error("Invalid exposure constants from getExposureConstants:", { alpha, zg });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Invalid exposure constants" };
    }

    // --- 2. Main Calculation Logic ---
    const min_h = units === 'imperial' ? 15.0 : 4.6;
    const calc_h = Math.max(h, min_h);
    const Kz = 2.01 * Math.pow(calc_h / zg, 2 / alpha);

    // --- 3. Output Validation ---
    if (!isFinite(Kz)) {
        console.error("Kz calculation resulted in a non-finite value:", { calc_h, zg, alpha });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Kz calculation failed" };
    }

    return { Kz, alpha, zg, ref_note };
}

// Elevation factor Ke
// Reference: ASCE 7-16 Table 26.9-1; ASCE 7-22 Section 26.9 (Ke=1.0)
function calculateKe(elevation, units, standard) {
        if (standard === "ASCE 7-22") return [1.0, "ASCE 7-22 Section 26.9 (Ke = 1.0)"];
        const elev_ft = [-500, 0, 500, 1000, 2000, 3000, 4000, 5000, 6000];
        const ke_vals = [1.05, 1.00, 0.95, 0.90, 0.82, 0.74, 0.67, 0.61, 0.55];
        const elev_calc = units === 'metric' ? elevation * 3.28084 : elevation;
        const ke_val = interpolate(elev_calc, elev_ft, ke_vals);
        return [ke_val, `ASCE 7-16 Table 26.9-1 (Elevation: ${safeToFixed(elev_calc, 0)} ft)`];
    }

// Wind velocity pressure qz
// Reference: ASCE 7-16/22 Eq. 26.10-1
function calculateVelocityPressure(Kz, Kzt, Kd, Ke, V, standard, riskCat, units) {
    // Validate all inputs
    const safeKz = isFinite(Kz) && Kz > 0 ? Kz : 1.0;
    const safeKzt = isFinite(Kzt) && Kzt > 0 ? Kzt : 1.0;
    const safeKd = isFinite(Kd) && Kd > 0 ? Kd : 0.85;
    const safeKe = isFinite(Ke) && Ke > 0 ? Ke : 1.0;
    const safeV = isFinite(V) && V > 0 ? V : 100; // Default safe wind speed
    
    const [Iw, iw_ref] = getImportanceFactor(riskCat, standard);
    const constant = units === 'imperial' ? 0.00256 : 0.613;
    
    let qz, ref_note;
    if (standard === 'ASCE 7-22') {
        // ASCE 7-22 includes Iw directly in the velocity pressure equation.
        qz = constant * safeKz * safeKzt * safeKd * safeKe * Iw * (safeV * safeV); 
        ref_note = `ASCE 7-22 Eq. 26.10-1 (Iw = ${Iw.toFixed(2)} from ${iw_ref})`;
    } else { // ASCE 7-16 and other fallbacks
        // ASCE 7-16 does NOT include Iw in the velocity pressure equation. It's applied later in load combinations.
        qz = constant * safeKz * safeKzt * safeKd * safeKe * (safeV * safeV);
        ref_note = "ASCE 7-16 Eq. 26.10-1";
    }
    
    // Final validation
    if (!isFinite(qz) || qz < 0) {
        console.warn("Invalid qz calculated, using fallback");
        qz = units === 'imperial' ? 10.0 : 500.0; // Reasonable fallback
        ref_note += " - Fallback value used due to calculation issue";
    }
    
    return { qz, ref_note };
}

/**
 * Calculates design pressure.
 * Kd is applied here, not in qz.
 */
function calculateDesignPressure(q_ext, q_int, G, Cp, GCpi, Kd) {
    const external_pressure = q_ext * G * Cp;
    const internal_pressure = q_int * GCpi;
    return Kd * (external_pressure - internal_pressure);
}
    // --- C&C Calculation Helpers for h > 60 ft ---

    /**
     * A generic helper for 2D interpolation of GCp values for high-rise buildings.
     * It interpolates first based on the logarithm of the effective wind area,
     * and then based on the building height.
     * @param {object} gcp_data - The data object containing GCp values, heights, and areas.
     * @param {number} A - The effective wind area.
     * @param {number} h - The mean roof height.
     * @returns {object} An object mapping zones to their interpolated positive and negative GCp values.
     */
    function interpolateHighRiseGcp(gcp_data, A, h) {
        const log_areas = gcp_data.areas.map(Math.log);
        const log_A = Math.log(A);
        const results = {};

        // Iterate over the zones defined in the gcp_data object (e.g., 'Wall Zone 4', 'Roof Zone 1'').
        for (const zone of Object.keys(gcp_data).filter(k => k !== 'heights' && k !== 'areas')) {
            const zoneData = gcp_data[zone];
            
            // 1. Interpolate across area for each height point in the table.
            const pos_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, zoneData.pos));
            const neg_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, zoneData.neg));
            
            // 2. Interpolate across height using the results from the area interpolation.
            results[zone] = {
                positive: interpolate(h, gcp_data.heights, pos_vals_at_h),
                negative: interpolate(h, gcp_data.heights, neg_vals_at_h)
            };
        }
        return results;
    }

    function calculateWallPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Wall Zone 4': { pos: [0.9, 0.9, 0.8], neg: [-1.0, -0.9, -0.8] },
            'Wall Zone 5': { pos: [0.9, 0.9, 0.8], neg: [-1.2, -1.1, -1.0] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    function calculateSteepRoofCandC(A, h, theta) {
        // ASCE 7-16 Figure 30.5-2 for Steep Roofs (theta > 7 deg)
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            "Zone 1'": { pos: [0.7, 0.5, 0.3], neg: [-1.0, -0.9, -0.7] },
            "Zone 2'": { pos: [0.9, 0.7, 0.5], neg: [-1.8, -1.4, -1.0] },
            "Zone 3'": { pos: [1.3, 1.0, 0.7], neg: [-2.6, -2.0, -1.4] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    function calculateLowSlopeRoofPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            "Roof Zone 1'": { pos: [0.7, 0.5, 0.3], neg: [-1.1, -0.9, -0.7] },
            "Roof Zone 2'": { pos: [0.7, 0.5, 0.3], neg: [-1.8, -1.4, -1.0] },
            "Roof Zone 3'": { pos: [0.7, 0.5, 0.3], neg: [-2.6, -2.0, -1.4] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    /**
     * Calculates C&C pressures for high-rise buildings (h > 60ft) by selecting the appropriate
     * data tables and converting the resulting GCp values to pressures.
     * @param {object} inputs - The user inputs object.
     * @param {number} qh - The velocity pressure at the mean roof height.
     * @param {number} GCpi_abs - The absolute value of the internal pressure coefficient.
     * @returns {object} An object containing the calculated pressures and other metadata.
     */
    function calculateHighRiseCandCPressures(inputs, qh, GCpi_abs) {
        // Add console warning if C&C pressures cannot be calculated for the given inputs.
        console.warn('No C&C pressures calculated for high-rise - check inputs:', {
            effective_wind_area: inputs.effective_wind_area, 
            roof_type: inputs.roof_type 
        });
        const { mean_roof_height: h, effective_wind_area: A, roof_slope_deg, roof_type, unit_system } = inputs;
        const warnings = [];
        const results = {};

        // Wall pressures (Figure 30.5-1)
        Object.assign(results, calculateWallPressuresHighRise(A, h));

        // Roof pressures based on roof type and slope
        const is_low_slope = roof_slope_deg <= 7;
        if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && is_low_slope)) {
            Object.assign(results, calculateLowSlopeRoofPressuresHighRise(A, h));
        } else if (['gable', 'hip'].includes(roof_type) && !is_low_slope) {
            Object.assign(results, calculateSteepRoofCandC(A, h, roof_slope_deg));
        } else {
            warnings.push(`C&C pressures for '${roof_type}' roofs on high-rise buildings are not explicitly covered by the prescriptive methods in ASCE 7-16 Ch. 30 and are not calculated.`);
            return { applicable: false, pressures: {}, ref: "Unsupported roof type for high-rise C&C", warnings };
        }

        // Convert GCp values to final pressures
        const finalPressures = {};
        for (const [zone, gcps] of Object.entries(results)) {
            if (typeof gcps.positive !== 'number' || typeof gcps.negative !== 'number') continue;

            const p1 = qh * (gcps.positive - GCpi_abs);
            const p2 = qh * (gcps.positive - (-GCpi_abs));
            const p3 = qh * (gcps.negative - GCpi_abs);
            const p4 = qh * (gcps.negative - (-GCpi_abs));

            finalPressures[zone] = {
                gcp_pos: gcps.positive, gcp_neg: gcps.negative,
                p_pos: Math.max(p1, p2, p3, p4), p_neg: Math.min(p1, p2, p3, p4)
            };
        }

        return { applicable: true, pressures: finalPressures, ref: `ASCE 7-16 Ch. 30, Part 2 (h > ${unit_system === 'imperial' ? '60ft' : '18.3m'})`, is_high_rise: true, warnings };
    }

    // Enhanced C&C calculation function
    function calculateCandCPressuresEnhanced(inputs, qh, GCpi_abs) {
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type, unit_system } = inputs;
        const h = mean_roof_height;
        const A = effective_wind_area;
        const is_high_rise = unit_system === 'imperial' ? h > 60 : h > 18.3;
        const warnings = [];

        // ASCE 7-16 Chapter 30, Part 2: Buildings with h > 60 ft
        if (is_high_rise) {
            return calculateHighRiseCandCPressures(inputs, qh, GCpi_abs);
        }

        // Fallback to existing h <= 60 ft calculations
        return calculateLowRiseCandCPressures(inputs, qh, GCpi_abs);
    }

    // Data store for ASCE 7-16 C&C GCp values for low-rise buildings (h <= 60ft)
    const GCP_DATA = {
        wall: {
            zone4: [-1.1, -1.1, -1.1, -1.1, -1.0, -0.9], // Fig 30.3-1
            zone5: [-1.4, -1.3, -1.2, -1.1, -1.0, -0.9]  // Fig 30.3-1
        },
        gable: { // Fig 30.3-2
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5],
                zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5],
                zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5]
            }
        },
        hip: { // Fig 30.3-3
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5], zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5],
                zone1E: [-1.3, -1.3, -1.1, -1.0, -0.7, -0.5], zone2E: [-2.2, -2.0, -1.6, -1.3, -0.8, -0.5], zone3E: [-2.8, -2.5, -2.0, -1.5, -0.8, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5], zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5],
                zone1E: [-1.5, -1.5, -1.3, -1.1, -0.7, -0.5], zone2E: [-2.5, -2.3, -1.8, -1.4, -0.8, -0.5], zone3E: [-3.3, -3.0, -2.3, -1.7, -0.8, -0.5]
            }
        }
    };

    /**
     * Helper to get GCp values for different roof types by interpolating based on slope.
     */
    function getGcpValuesForRoof(roof_type, theta) {
        const roofData = GCP_DATA[roof_type];
        if (!roofData) return {};

        const interpolate_gcp_array = (arrA, arrB) => arrA.map((valA, i) => interpolate(theta, [7, 27], [valA, arrB[i]]));

        if (theta <= 7) return roofData.caseA;
        if (theta > 45) return roofData.caseB; // Per figures, use Case B for theta > 27
        if (theta > 7 && theta <= 27) {
            const interpolated_gcp = {};
            for (const zone in roofData.caseA) {
                interpolated_gcp[zone] = interpolate_gcp_array(roofData.caseA[zone], roofData.caseB[zone]);
            }
            return interpolated_gcp;
        }
        return roofData.caseB; // 27 < theta <= 45
    }

    function calculateLowRiseCandCPressures(inputs, qz, GCpi_abs) { // Refactored for readability
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type } = inputs;
        const A = effective_wind_area;
        const theta = roof_slope_deg;

        // Setup for logarithmic interpolation based on effective wind area
        const area_points = [10, 20, 50, 100, 500, 1000];
        const log_area_points = area_points.map(Math.log);
        const log_A = Math.log(A);
        const logInterpolate = (gcp_values) => interpolate(log_A, log_area_points, gcp_values);

        const gcp_map = {};

        // Wall Pressures (Fig 30.3-1)
        gcp_map['Wall Zone 4 (Interior)'] = logInterpolate(GCP_DATA.wall.zone4);
        gcp_map['Wall Zone 5 (Corners)'] = logInterpolate(GCP_DATA.wall.zone5);

        // Roof Pressures
        if (['gable', 'hip'].includes(roof_type)) {
            const roof_gcp_arrays = getGcpValuesForRoof(roof_type, theta);
            const zone_map = { zone1: 'Roof Zone 1 (Interior)', zone2: 'Roof Zone 2 (Edges)', zone3: 'Roof Zone 3 (Corners)', zone1E: 'Roof End Zone 1E', zone2E: 'Roof End Zone 2E', zone3E: 'Roof End Zone 3E' };
            for (const zone in roof_gcp_arrays) {
                gcp_map[zone_map[zone]] = logInterpolate(roof_gcp_arrays[zone]);
            }
        }

        const final_pressures = {};
        for (const zone in gcp_map) {
            const gcp = gcp_map[zone];
            // p = qh * (GCp - GCpi)
            const p_pos_gcp = qz * (gcp - (-GCpi_abs)); // Uplift GCp is negative, check with internal suction
            const p_neg_gcp = qz * (gcp - (+GCpi_abs)); // Uplift GCp is negative, check with internal pressure
            final_pressures[zone] = {
                gcp: gcp,
                p_pos: Math.max(p_pos_gcp, p_neg_gcp), // Not typical for these figures, but for completeness
                p_neg: Math.min(p_pos_gcp, p_neg_gcp) // C&C is usually governed by suction
            };
        }
        return { applicable: true, pressures: final_pressures, ref: "ASCE 7 Ch. 30, Part 1 (h<=60ft)" };
    }

    function calculateHeightVaryingPressures(inputs, intermediate_globals) {
        const { exposure_category, unit_system, risk_category, mean_roof_height, design_method } = inputs;
        const { Kzt, Kd, Ke, V_in, effective_standard, abs_gcpi, G, qz: qh } = intermediate_globals;
    
        // Better validation
        if (!inputs || !intermediate_globals || !mean_roof_height || mean_roof_height <= 0 || !exposure_category) {
            console.error("Invalid inputs for height varying pressure calculation");
            return [];
        }
    
        const results = [];
        const is_imp = unit_system === 'imperial';
        const step = is_imp ? 5 : 1.5;
        const heights = [];
    
        // Generate height points
        for (let z = 0; z <= mean_roof_height; z += step) {
            heights.push(z);
        }
        // Ensure roof height is included if the step doesn't land on it
        if (heights[heights.length - 1] < mean_roof_height) {
            heights.push(mean_roof_height);
        }
    
        for (const z of heights) {
            // Calculate Kz for each height
            const { Kz } = calculateKz(z, exposure_category, unit_system);
            // Calculate velocity pressure at height z
            const { qz } = calculateVelocityPressure(Kz, Kzt, Kd, Ke, V_in, effective_standard, risk_category, unit_system);
    
            // Use the main design pressure function for consistency. Cp for windward wall is 0.8.
            const p_pos = calculateDesignPressure(qz, qh, G, 0.8, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, qh, G, 0.8, -abs_gcpi);
    
            results.push({ height: z, Kz, qz, p_pos, p_neg });
        }
        return results;
    }

    /**
     * Retrieves constants for gust effect factor calculation from ASCE 7-16 Table 26.11-1.
     * // Reference: ASCE 7-16 Table 26.11-1
     */
    function getGustCalculationConstants(exposure_category, unit_system) {
        const constants = {
            'B': { b_bar: 0.47, c: 0.30, l: 320, epsilon_bar: 1/3.0 },
            'C': { b_bar: 0.65, c: 0.20, l: 500, epsilon_bar: 1/5.0 },
            'D': { b_bar: 0.80, c: 0.15, l: 650, epsilon_bar: 1/8.0 }
        };
        const metric_multipliers = { b_bar: 1.32, c: 1.5, l: 0.3048, epsilon_bar: 1.0 };

        let data = constants[exposure_category] || constants['C']; // Default to C

        if (unit_system === 'metric') {
            data = {
                b_bar: data.b_bar * metric_multipliers.b_bar,
                c: data.c * metric_multipliers.c,
                l: data.l * metric_multipliers.l,
                epsilon_bar: data.epsilon_bar
            };
        }
        return data;
    }

    /**
     * Calculates the mean hourly wind speed at a given height.
     * // Reference: ASCE 7-16 Eq. 26.11-7
     */
    function calculateMeanHourlyWindSpeed(V_in, z_effective, zg, alpha, b_bar, unit_system) {
        // For Imperial units, V_in (mph) is converted to fps. For Metric, V_in (m/s) is used directly.
        const V_bar_33ft = V_in * b_bar * Math.pow(33 / zg, 1 / alpha) * (unit_system === 'imperial' ? (88/60) : 1);
        return V_bar_33ft * Math.pow(z_effective / 33, 1 / alpha);
    }

    /**
     * Calculates the resonant response factor, R.
     * // Reference: ASCE 7-16 Eq. 26.11-10
     */
    function calculateResonantResponseFactor(n1, V_z_bar, Lz_bar) {
        // Damping ratio (beta) is typically 0.01 for steel buildings and 0.015 for concrete buildings.
        // ASCE 7-16 Section C26.11.3 suggests 0.01 is a reasonable general assumption.
        const damping_ratio = 0.01;
        const N1 = (n1 * Lz_bar) / V_z_bar;
        const Rn = (7.47 * N1) / Math.pow(1 + 10.3 * N1, 5/3);
        const Rh = (1 / N1) - (1 / (2 * N1 * N1)) * (1 - Math.exp(-2 * N1));
        const RB = Rh; // For simplicity, assuming B=h, so Rh = RB

        return Math.sqrt((1 / damping_ratio) * Rn * Rh * RB);
    }

    /**
     * Calculates the Gust Effect Factor G for flexible structures per ASCE 7-16 Section 26.11.
     */
    function calculateGustEffectFactor(inputs, intermediate) { // Refactored for readability
        if (inputs.building_flexibility !== 'Flexible' || !inputs.fundamental_period) {
            return { G: 0.85, ref: "ASCE 7-16 Sec. 26.11.1 (Rigid Structure)" };
        } // Corrected validation
        const { V_in, unit_system, mean_roof_height, building_length_L, building_width_B, exposure_category, fundamental_period } = inputs;
        const { alpha, zg } = intermediate; // Defensive destructuring
        const n1 = fundamental_period > 0 ? 1 / fundamental_period : 0;

        const { b_bar, c, l, epsilon_bar } = getGustCalculationConstants(exposure_category, unit_system);

        const z_bar = 0.6 * mean_roof_height;
        const min_z = unit_system === 'imperial' ? 15.0 : 4.6;
        const z_bar_effective = Math.max(z_bar, min_z);
        
        const V_z_bar = calculateMeanHourlyWindSpeed(V_in, z_bar_effective, zg, alpha, b_bar, unit_system);
        // Turbulence Intensity, Iz_bar. Ref: ASCE 7-16 Eq. 26.11-7
        const Iz_bar = c * Math.pow(33 / z_bar_effective, 1/6);
        const ref_h = unit_system === 'imperial' ? 33 : 10; // 33 ft or 10 m
        // Integral Length Scale, Lz_bar. Ref: ASCE 7-16 Eq. 26.11-8
        const Lz_bar = l * Math.pow(z_bar_effective / ref_h, epsilon_bar);
    
        // Peak factor for background response (gQ) is taken as 3.4 per ASCE 7-16 Section 26.11.2.
        const gQ = 3.4;
        // Peak factor for resonant response, gR. Ref: ASCE 7-16 Eq. 26.11-9
        const gR = Math.sqrt(2 * Math.log(3600 * n1)) + (0.577 / Math.sqrt(2 * Math.log(3600 * n1)));
    
        // Background Response Factor, Q. Ref: ASCE 7-16 Eq. 26.11-14
        const Q = Math.sqrt(1 / (1 + 0.63 * Math.pow(Math.max(mean_roof_height, building_length_L) / Lz_bar, 0.63)));
        const R = calculateResonantResponseFactor(n1, V_z_bar, Lz_bar);

        // Gust-Effect Factor, Gf. Ref: ASCE 7-16 Eq. 26.11-6
        const Gf = (1 + 1.7 * Iz_bar * Math.sqrt(gQ*gQ * Q*Q + gR*gR * R*R)) / (1 + 1.7 * gQ * Iz_bar);
    
        return {
            G: Gf,
            ref: `ASCE 7-16 Eq. 26.11-6 (Flexible, G=${safeToFixed(Gf, 3)})`
        };
    }

    function calculateRoofPressureByDistance(inputs, intermediate_globals, cp_map, building_dimension_parallel_to_wind) {
        const { gust_effect_factor_g } = inputs;
        const { qz, abs_gcpi } = intermediate_globals;
        const results = [];
        const L = building_dimension_parallel_to_wind;

        // Create an array of distances to evaluate
        const distances = [];
        for (let i = 0; i <= 20; i++) { // Evaluate at 21 points (every 5%)
            distances.push(L * (i / 20));
        }

        // Create a lookup from the cp_map
        const roof_zones = [];
        for (const [surface, cp] of Object.entries(cp_map)) {
            if (!surface.toLowerCase().includes('roof')) continue; // Only consider roof surfaces
            // Regex to find zones like "Roof (0 to 30 ft)"
            const matches = surface.match(/\((\d+(\.\d+)?)\s*to\s*(\d+(\.\d+)?)/);
            if (matches) {
                roof_zones.push({ start: parseFloat(matches[1]), end: parseFloat(matches[3]), cp });
            }
        }

        distances.forEach(dist => {
            // Find the correct Cp value for the current distance from the pre-calculated zones
            let cp_at_dist = roof_zones.find(zone => dist >= zone.start && dist <= zone.end)?.cp ?? 
                             (cp_map["Leeward Roof"] || cp_map["Roof Leeward"] || -0.3); // Fallback to leeward value

            const p_pos = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, -abs_gcpi);
            const distance_ratio = L > 0 ? dist / L : 0;
            results.push({ distance: dist, cp: cp_at_dist, p_pos, p_neg, distance_ratio });
        });

        return results;
    }

    /**
     * Calculates MWFRS pressures for low-rise buildings (h <= 60ft).
     * @param {object} inputs - The user inputs.
     * @param {object} intermediate_globals - Pre-calculated intermediate values (qz, G, etc.).
     * @returns {object} An object containing the directional results.
     */
    function calculateLowRisePressures(inputs, intermediate_globals) {
        const { effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system } = inputs;
        const { qz, G, abs_gcpi, Kd } = intermediate_globals;
        const directional_results = {};

        // Wind Perpendicular to L (wind parallel to L)
        const { cpMap: cp_map_L } = getCpValues(effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${safeToFixed(building_length_L / building_width_B, 2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd) * 0.6
        }));

        // Wind Perpendicular to B (wind parallel to B)
        const { cpMap: cp_map_B } = getCpValues(effective_standard, mean_roof_height, building_width_B, building_length_L, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${safeToFixed(building_width_B / building_length_L, 2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd) * 0.6
        }));

        return directional_results;
    }

    /**
     * Calculates MWFRS pressures for high-rise buildings (h > 60ft).
     * @param {object} inputs - The user inputs.
     * @param {object} intermediate_globals - Pre-calculated intermediate values (qz, G, etc.).
     * @returns {object} An object containing the directional results.
     */
    function calculateHighRisePressures(inputs, intermediate_globals) {
        const { mean_roof_height, building_length_L, building_width_B, roof_slope_deg } = inputs;
        const { qz, G, abs_gcpi, Kd } = intermediate_globals;
        const directional_results = {};

        // Wind perpendicular to L (Building Length is parallel to wind)
        const { cpMap: cp_map_L } = getAnalyticalCpValues(mean_roof_height, building_length_L, building_width_B, roof_slope_deg);
        directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => ({
            surface, cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd) * 0.6
        }));

        // Wind perpendicular to B (Building Width is parallel to wind)
        const { cpMap: cp_map_B } = getAnalyticalCpValues(mean_roof_height, building_width_B, building_length_L, roof_slope_deg);
        directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => ({
            surface, cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi, Kd) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi, Kd) * 0.6
        }));

        return directional_results;
    }

    // --- PUBLIC API ---
    function run(inputs, validation) {
        let effective_standard = inputs.asce_standard;
        let v_input = inputs.basic_wind_speed;
        let v_unreduced = inputs.basic_wind_speed;
        let jurisdiction_note = "", temporary_structure_note = "";

        // Step 1: Force flexible analysis for tall buildings
        const is_high_rise = inputs.mean_roof_height > 60 && inputs.unit_system === 'imperial';
        if (is_high_rise) {
            inputs.building_flexibility = 'Flexible';
        }

        if (inputs.jurisdiction === "NYCBC 2022") {
            effective_standard = "ASCE 7-16";
            const risk_v_map = { "I": 110, "II": 117, "III": 127, "IV": 132 };
            v_input = risk_v_map[inputs.risk_category] || 117;
            v_unreduced = v_input;
            jurisdiction_note = `NYCBC 2022 wind speed of ${safeToFixed(v_input, 0)} mph for Risk Category ${inputs.risk_category} has been applied (Table 1609.3).`;
        }

        if (inputs.temporary_construction === "Yes") {
            v_input *= 0.8;
            const v_unit = inputs.unit_system === 'imperial' ? 'mph' : 'm/s';
            temporary_structure_note = `A 0.8 reduction factor has been applied for temporary construction (PROJECT-SPECIFIC ALLOWANCE, NOT ASCE 7). Calculation wind speed is ${safeToFixed(v_input, 1)} ${v_unit} (reduced from ${v_unreduced} ${v_unit}).`;
        }

        const [abs_gcpi, gcpi_ref] = getInternalPressureCoefficient(inputs.enclosure_classification);
        const [Kd, kd_ref] = getKdFactor(inputs.structure_type, inputs.asce_standard);
        const [Ke, ke_ref] = calculateKe(inputs.ground_elevation, inputs.unit_system, effective_standard);
        const { Kz, alpha, zg, ref_note: kz_ref } = calculateKz(inputs.mean_roof_height, inputs.exposure_category, inputs.unit_system); // Kz at roof height h
        const { qz, ref_note: qz_ref } = calculateVelocityPressure(Kz, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);
        const [Iw, iw_ref] = getImportanceFactor(inputs.risk_category, effective_standard); // Defensive destructuring
        const kzResult = calculateKz(inputs.mean_roof_height, inputs.exposure_category, inputs.unit_system);
        const Kz_val = kzResult.Kz || 1.0;
        const alpha_val = kzResult.alpha || 0;
        const zg_val = kzResult.zg || 0;
        const kz_ref_val = kzResult.ref_note || "Error: Kz calculation failed";
        
        const intermediate_for_G = { alpha, zg, Kz, Iw };
        const { G, ref: g_ref } = calculateGustEffectFactor({ ...inputs, V_in: v_input }, intermediate_for_G);

        const windResults = {
            inputs: { ...inputs, V_in: v_input, V_unreduced: v_unreduced, GCpi_abs: abs_gcpi, effective_standard: effective_standard, effective_wind_area: inputs.effective_wind_area },
            intermediate: { Kz, Kz_ref: kz_ref, Ke, ke_ref, qz, qz_ref, Kd, Kd_ref: kd_ref, GCpi_ref: gcpi_ref, alpha, zg, Iw, iw_ref },
            directional_results: {}, jurisdiction_note, temporary_structure_note, 
            warnings: validation.warnings, errors: validation.errors
        };

        // Add warning after results object is created
        if (is_high_rise) {
            windResults.warnings.push("Structure treated as 'Flexible' due to height > 60 ft.");
        }

        // --- Handle Open Signs as a special case ---
        if (inputs.structure_type === 'Open Signs/Frames') {
            const cf_options = {
                // FIX: Ensure all required options are passed to getOpenSignCf
                // The original call was missing these, which could lead to errors.
                member_shape: inputs.member_shape,
                V: v_input, // Use the jurisdictional/factored wind speed
                b: inputs.member_diameter,
                unit_system: inputs.unit_system
            };
            const { Cf, ref } = getOpenSignCf(inputs.solidity_ratio, cf_options);
            // Force F = qz * G * Cf * As (ASCE 7-16 Eq. 29.5-1)
            // The calculator outputs pressure, so we provide p = qz * G * Cf
            const pressure = qz * G * Cf;
            windResults.open_sign_results = {
                Cf, 
                ref,
                pressure,
                pressure_asd: pressure * 0.6
            };
            // Set a flag to indicate this is an open sign calculation
            windResults.is_open_sign = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        };

        // --- Handle Solid Freestanding Signs as a special case ---
        if (inputs.structure_type === 'Solid Freestanding Signs/Walls') {
            const h_sign = inputs.sign_height_s + inputs.clearance_z;
            // Calculate Kz at the centroid of the sign area
            const { Kz: Kz_sign } = calculateKz(inputs.clearance_z + inputs.sign_height_s / 2, inputs.exposure_category, inputs.unit_system);
            // Recalculate qz at the sign's centroid height
            const { qz: qz_sign } = calculateVelocityPressure(Kz_sign, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);

            const { CN, ref } = getSolidSignCn(inputs.sign_width_B, inputs.sign_height_s, h_sign);
            // Force F = qz * G * CN * As (ASCE 7-16 Eq. 29.3-1)
            // The calculator outputs pressure, so we provide p = qz * G * CN
            const pressure = qz_sign * G * CN;
            windResults.solid_sign_results = {
                CN, ref, pressure, pressure_asd: pressure * 0.6,
                h_sign, Kz_sign, qz_sign
            };
            windResults.is_solid_sign = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // --- Handle Chimneys, Tanks, and Similar Structures ---
        const chimney_types = ['Chimneys, Tanks (Square)', 'Chimneys, Tanks (Hexagonal)', 'Chimneys, Tanks (Octagonal)', 'Chimneys, Tanks (Round)'];
        if (chimney_types.includes(inputs.structure_type)) {
            const h_struct = inputs.chimney_height;
            // Calculate Kz and qz at the top of the structure (h)
            const { Kz: Kz_struct } = calculateKz(h_struct, inputs.exposure_category, inputs.unit_system);
            const { qz: qz_struct } = calculateVelocityPressure(Kz_struct, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);

            const shape = inputs.structure_type.match(/\(([^)]+)\)/)[1];
            const cf_options = {
                shape: shape, h: h_struct, D: inputs.chimney_diameter, qz: qz_struct,
                r: inputs.corner_radius_r, unit_system: inputs.unit_system
            };
            const { Cf, ref } = getChimneyCf(cf_options);
            // Force F = qz * G * Cf * A (ASCE 7-16 Eq. 29.4-1)
            // The calculator outputs pressure, p = qz * G * Cf, to be applied to the solid area Af.
            const pressure = qz_struct * G * Cf;
            windResults.chimney_results = {
                Cf, ref, pressure, pressure_asd: pressure * 0.6,
                h_struct, Kz_struct, qz_struct
            };
            windResults.is_chimney = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // --- Handle Trussed Towers ---
        const is_truss_tower = inputs.structure_type.includes('Trussed Towers');
        if (is_truss_tower) {
            // Calculate qz at the centroid of the tower (h/2)
            const { Kz: Kz_tower } = calculateKz(inputs.tower_height / 2, inputs.exposure_category, inputs.unit_system);
            const { qz: qz_tower } = calculateVelocityPressure(Kz_tower, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);

            const cf_options = {
                structure_type: inputs.structure_type,
                solidity_ratio: inputs.tower_solidity_ratio,
                member_shape: inputs.tower_member_shape
            };
            const { Cf, ref } = getTrussedTowerCf(cf_options);
            // Force F = qz * G * Cf * Af (ASCE 7-16 Eq. 29.6-1)
            // The calculator outputs pressure, p = qz * G * Cf, to be applied to the solid area Af.
            const pressure = qz_tower * G * Cf;
            windResults.truss_tower_results = {
                Cf, ref, pressure, pressure_asd: pressure * 0.6,
                Kz_tower, qz_tower
            };
            windResults.is_truss_tower = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // --- Handle Arched Roofs ---
        if (inputs.structure_type === 'Arched Roofs') {
            const cn_options = {
                r: inputs.arched_roof_rise,
                B: inputs.building_width_B, // Span is the width
                h: inputs.mean_roof_height, // Height to eave
                spring_point: inputs.arched_roof_spring_point
            };
            const { cnMap, ref } = getArchedRoofCn(cn_options);
            // Pressure p = qh * G * CN (ASCE 7-16 Eq. 27.3-3)
            windResults.arched_roof_results = {
                cnMap, ref,
                pressures: Object.fromEntries(Object.entries(cnMap).map(([zone, CN]) => [
                    zone, { CN, pressure: qz * G * CN, pressure_asd: qz * G * CN * 0.6 }
                ]))
            };
            windResults.is_arched_roof = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // Handle Open Buildings separately as they use Net Pressure Coefficients (CN)
        if (inputs.enclosure_classification === 'Open') {
            // Step 3: Differentiate between low-rise and high-rise open buildings
            if (is_high_rise) {
                // --- New logic for Rooftop Structures on High-Rise Buildings ---
                const { GCrh, GCrv, ref } = getRooftopStructureCoefficients(inputs);

                // This was a key missing piece. The logic now correctly calculates pressures
                // for rooftop structures on high-rise open buildings, which was previously
                // falling through and causing empty results.

                // The formula is P = qh * (GCr). The Gust Effect Factor is included in GCr.
                const p_horizontal = qz * GCrh;
                const p_vertical_uplift = qz * GCrv;

                windResults.directional_results['rooftop_structure'] = [
                    { surface: "Horizontal Drag Force Pressure", pressure: p_horizontal, pressure_asd: p_horizontal * 0.6, GCr: GCrh },
                    { surface: "Vertical Uplift Force Pressure", pressure: p_vertical_uplift, pressure_asd: p_vertical_uplift * 0.6, GCr: GCrv }
                ];
                windResults.open_building_ref = ref;

            } else { // Low-Rise Open Buildings
                // --- Existing logic for Low-Rise Open Buildings ---
                if (['flat', 'monoslope', 'pitched_troughed'].includes(inputs.roof_type)) {
                    const { cnMap, ref } = getOpenBuildingCnValues(inputs.roof_slope_deg, inputs.wind_obstruction === 'obstructed', inputs.roof_type);
                    windResults.directional_results['open_roof'] = Object.entries(cnMap).map(([surface, cn_vals]) => {
                        const p_pos = qz * G * cn_vals.cn_pos;
                        const p_neg = qz * G * cn_vals.cn_neg;
                        return { surface, cp: null, cn_pos: cn_vals.cn_pos, cn_neg: cn_vals.cn_neg, p_pos, p_neg, p_pos_asd: p_pos * 0.6, p_neg_asd: p_neg * 0.6 };
                    });
                    windResults.open_building_ref = ref;
                } else {
                    windResults.warnings.push("For Low-Rise Open buildings, only 'Flat', 'Monoslope', and 'Pitched/Troughed' roof types are currently supported.");
                }
            }
            return windResults;
        }

        const intermediate_globals = { Kzt: inputs.topographic_factor_Kzt, Kd, Ke, V_in: v_input, effective_standard, abs_gcpi, G, qz };
        const is_tall_building = inputs.mean_roof_height > (inputs.unit_system === 'imperial' ? 60 : 18.3);

        if (is_tall_building) {
            windResults.mwfrs_method = "Analytical Procedure (All Heights)";
            windResults.directional_results = calculateHighRisePressures(inputs, intermediate_globals);
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        } else { // Low-Rise Building
            windResults.mwfrs_method = "Directional Procedure (Low-Rise)";
            windResults.directional_results = calculateLowRisePressures(inputs, intermediate_globals);
            windResults.heightVaryingResults_L = null;
        }

        // Conditionally nullify the height-varying results if the user has opted out.
        // This check is performed after the main logic to allow the option to apply to both tall and potentially low-rise buildings if ever enabled.
        if (inputs.calculate_height_varying_pressure === 'No') {
            windResults.heightVaryingResults_L = null;
        } else if (is_tall_building && !windResults.heightVaryingResults_L) {
            // If it's a tall building and the user wants the calculation, it should have been done already.
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        } else if (!is_tall_building && inputs.calculate_height_varying_pressure === 'Yes') {
            // For low-rise, only calculate if explicitly requested.
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        }

        // Calculate C&C pressures
        const candc_results = calculateCandCPressuresEnhanced(inputs, qz, abs_gcpi);
        windResults.candc = candc_results;
        if (candc_results.warnings && candc_results.warnings.length > 0) {
            windResults.warnings.push(...candc_results.warnings);
        }

        // Torsional Load Case (ASCE 7-16/22 Fig 27.4-8, Case 2)
        // Applies to enclosed and partially enclosed low-rise buildings
        if (!is_tall_building && ["Enclosed", "Partially Enclosed"].includes(inputs.enclosure_classification)) {
            const results_L = windResults.directional_results['perp_to_L'];
            const results_B = windResults.directional_results['perp_to_B'];
            
            // Only proceed with torsional calculations if both directional results are available.
            if (results_L && results_B) {
                const cp_map_L = Object.fromEntries(results_L.map(r => [r.surface, r.cp]));
                const cp_map_B = Object.fromEntries(results_B.map(r => [r.surface, r.cp]));

                // Wind perpendicular to L (acting on face B)
                const p_ww_L = qz * G * (cp_map_L["Windward Wall"] || 0);
                const p_lw_L = qz * G * (cp_map_L["Leeward Wall"] || 0);
                const F_ww_L = p_ww_L * (inputs.building_width_B * inputs.mean_roof_height);
                const F_lw_L = p_lw_L * (inputs.building_width_B * inputs.mean_roof_height);
                const Mt_L = 0.75 * (Math.abs(F_ww_L) + Math.abs(F_lw_L)) * (0.15 * inputs.building_width_B);

                // Wind perpendicular to B (acting on face L)
                const p_ww_B = qz * G * (cp_map_B["Windward Wall"] || 0);
                const p_lw_B = qz * G * (cp_map_B["Leeward Wall"] || 0);
                const F_ww_B = p_ww_B * (inputs.building_length_L * inputs.mean_roof_height);
                const F_lw_B = p_lw_B * (inputs.building_length_L * inputs.mean_roof_height);
                const Mt_B = 0.75 * (Math.abs(F_ww_B) + Math.abs(F_lw_B)) * (0.15 * inputs.building_length_L);
                
                windResults.torsional_case = {
                    perp_to_L: { Mt: Mt_L, note: "Apply with 75% of Case 1 wall pressures." },
                    perp_to_B: { Mt: Mt_B, note: "Apply with 75% of Case 1 wall pressures." }
                };
            }
        }

        return windResults;
    }

    return { run };
})();

/**
 * Gathers all wind-related inputs from the DOM.
 * @returns {object} An object containing all the input values.
 */
function gatherWindInputs() {
    return gatherInputsFromIds(windInputIds);
}

/**
 * Validates the gathered wind inputs against a set of rules.
 * @param {object} inputs - The input values to validate.
 * @returns {object} An object containing arrays of errors and warnings.
 */
function validateWindInputs(inputs) {
    const { errors, warnings } = validateInputs(inputs, validationRules.wind, 'wind.js');

    // Add specific, inter-dependent validation logic here
    if (['gable', 'hip'].includes(inputs.roof_type) && inputs.roof_slope_deg > 45) {
        errors.push("Gable/hip roof slope must be <= 45° for this calculator's implementation of ASCE 7 Fig 27.3-2.");
    }
    const isImperial = inputs.unit_system === 'imperial';
    const vRange = isImperial ? [85, 200] : [38, 90];
    if (inputs.basic_wind_speed < vRange[0] || inputs.basic_wind_speed > vRange[1]) {
        warnings.push(`Wind speed ${inputs.basic_wind_speed} ${isImperial ? 'mph' : 'm/s'} is outside the typical ASCE 7 range (${vRange[0]}-${vRange[1]}).`);
    }

    return { errors, warnings };
}

/**
 * Executes the core wind load calculation logic.
 * @param {object} inputs - The validated input values.
 * @param {object} validation - The validation object, which may contain warnings to be passed through.
 * @returns {object} The complete results object from the calculation.
 */
function performWindCalculation(inputs, validation) { // This function was missing in the original context
    try {
        return windLoadCalculator.run(inputs, validation);
    } catch (error) {
        console.error('An unexpected error occurred during the wind calculation.', error);
        return { errors: ['An unexpected error occurred during the wind calculation. Check console for details.'], warnings: [] };
    }
}

function renderRoofPressureChart(canvasId, pressureData, building_dimension, design_method, units) { // This function was missing in the original context
    const factor = design_method === 'ASD' ? 0.6 : 1.0;
    const labels = pressureData.map(p => safeToFixed(p.distance, 1));
    const data = pressureData.map(p => safeToFixed(p.p_neg * factor, 2));

    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') {
        console.warn('Chart.js not available or canvas not found');
        if (ctx) ctx.parentElement.innerHTML = `<div class="text-center text-red-500">Chart.js library not loaded.</div>`;
        return;
    }

    try {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Roof Suction (${units.p_unit})`,
                    data: data,
                    borderColor: '#3b82f6', // blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Pressure Distribution (Length: ${building_dimension} ${units.h_unit})`
                    },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: `Distance from Windward Edge (${units.h_unit})` }
                    },
                    y: {
                        title: { display: true, text: `Pressure (${units.p_unit})` }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Chart.js initialization failed:', error);
        ctx.parentElement.innerHTML = `<div class="text-center text-red-500">Chart could not be rendered.</div>`;
    }
}

function generateCandCDiagram(inputs, candc) { // This function was missing in the original context
    if (!candc || !candc.applicable) return '';

    const { mean_roof_height: h, building_length_L: L, building_width_B: B, roof_type, roof_slope_deg, unit_system } = inputs;
    const h_unit = unit_system === 'imperial' ? 'ft' : 'm';
    const is_high_rise = candc.is_high_rise;

    // Calculate 'a' for zone dimensions
    const least_dim = Math.min(L, B);
    let a = Math.min(0.1 * least_dim, 0.4 * h);
    const min_a_val = unit_system === 'imperial' ? 3.0 : 0.9;
    a = Math.max(a, 0.04 * least_dim, min_a_val);

    const a_val_str = safeToFixed(a, 1);
    const a_str = `a = ${a_val_str} ${h_unit}`;

    let roof_diagram = '';
    let wall_diagram = '';

    // --- Wall Diagram (Elevation) ---
    const wall_zone_5_label = is_high_rise ? "Zone 5" : "Zone 5 (Corners)";
    const wall_zone_4_label = is_high_rise ? "Zone 4" : "Zone 4 (Interior)";
    wall_diagram = `
        <div class="diagram my-4">
            <div class="max-w-sm mx-auto">
                <h4 class="text-center font-semibold text-sm mb-2">Wall C&C Zones (Elevation)</h4>
                <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                    <!-- Building Outline -->
                    <rect x="50" y="50" width="300" height="120" class="svg-member" />
                    <!-- Zone 5 -->
                    <rect x="50" y="50" width="${a_val_str}" height="120" fill="#ef4444" opacity="0.5" />
                    <rect x="${350 - a_val_str}" y="50" width="${a_val_str}" height="120" fill="#ef4444" opacity="0.5" />
                    <!-- Zone 4 -->
                    <rect x="${50 + parseFloat(a_val_str)}" y="50" width="${300 - 2 * a_val_str}" height="120" fill="#facc15" opacity="0.5" />
                    <!-- Labels -->
                    <text x="200" y="110" class="svg-label" text-anchor="middle">${wall_zone_4_label}</text>
                    <text x="${50 + a_val_str / 2}" y="80" class="svg-label" text-anchor="middle">${wall_zone_5_label}</text>
                    <text x="${350 - a_val_str / 2}" y="80" class="svg-label" text-anchor="middle">${wall_zone_5_label}</text>
                    <!-- Dimension 'a' -->
                    <line x1="50" y1="180" x2="${50 + a_val_str}" y2="180" class="svg-dim" />
                    <text x="${50 + a_val_str / 2}" y="190" class="svg-dim-text">${a_str}</text>
                </svg>
            </div>
        </div>`;

    // --- Roof Diagram (Plan View) ---
    const roof_zone_3_label = is_high_rise ? "Zone 3'" : "Zone 3 (Corners)";
    const roof_zone_2_label = is_high_rise ? "Zone 2'" : "Zone 2 (Edges)";
    const roof_zone_1_label = is_high_rise ? "Zone 1'" : "Zone 1 (Interior)";

    if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && roof_slope_deg <= 7)) {
        let hip_zones = '';
        if (roof_type === 'hip') {
            hip_zones = `
                <path d="M50 50 L 150 100 L 50 150 Z" fill="#9333ea" opacity="0.5" />
                <path d="M350 50 L 250 100 L 350 150 Z" fill="#9333ea" opacity="0.5" />
                <text x="100" y="105" class="svg-label" text-anchor="middle">End Zones</text>
                <text x="300" y="105" class="svg-label" text-anchor="middle">End Zones</text>
            `;
        }
        roof_diagram = `
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <h4 class="text-center font-semibold text-sm mb-2">Roof C&C Zones (Plan View)</h4>
                    <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <!-- Base Roof -->
                        <rect x="50" y="50" width="300" height="100" class="svg-member" />
                        <!-- Zone 1 -->
                        <rect x="${50 + parseFloat(a_val_str)}" y="${50 + parseFloat(a_val_str)}" width="${300 - 2 * a_val_str}" height="${100 - 2 * a_val_str}" fill="#4ade80" opacity="0.5" />
                        <!-- Zone 2 -->
                        <path d="M50 50 h 300 v 100 h -300 z M ${50 + parseFloat(a_val_str)} ${50 + parseFloat(a_val_str)} v ${100 - 2 * a_val_str} h ${300 - 2 * a_val_str} v -${100 - 2 * a_val_str} z" fill-rule="evenodd" fill="#facc15" opacity="0.5" />
                        <!-- Zone 3 -->
                        <path d="M50 50 h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M${350 - a_val_str} 50 h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M50 ${150 - a_val_str} h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M${350 - a_val_str} ${150 - a_val_str} h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        ${hip_zones}
                        <!-- Labels -->
                        <text x="200" y="105" class="svg-label" text-anchor="middle">${roof_zone_1_label}</text>
                        <text x="200" y="70" class="svg-label" text-anchor="middle">${roof_zone_2_label}</text>
                        <text x="80" y="70" class="svg-label" text-anchor="middle">${roof_zone_3_label}</text>
                    </svg>
                </div>
            </div>`;
    } else if (['gable', 'hip'].includes(roof_type)) { // Steep slope
        const ridge_line = roof_type === 'gable' ? `<line x1="50" y1="100" x2="350" y2="100" stroke-dasharray="4 2" class="svg-dim" />` : `<line x1="150" y1="100" x2="250" y2="100" stroke-dasharray="4 2" class="svg-dim" />`;
        const hip_lines = roof_type === 'hip' ? `<line x1="50" y1="50" x2="150" y2="100" class="svg-dim" /><line x1="50" y1="150" x2="150" y2="100" class="svg-dim" /><line x1="350" y1="50" x2="250" y2="100" class="svg-dim" /><line x1="350" y1="150" x2="250" y2="100" class="svg-dim" />` : '';
        roof_diagram = `
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <h4 class="text-center font-semibold text-sm mb-2">Roof C&C Zones (Plan View, Slope > 7°</h4>
                    <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <rect x="50" y="50" width="300" height="100" class="svg-member" />
                        ${ridge_line} ${hip_lines}
                        <!-- Zones -->
                        <rect x="${50 + parseFloat(a_val_str)}" y="50" width="${300 - 2 * a_val_str}" height="100" fill="#4ade80" opacity="0.5" />
                        <path d="M50 50 h 300 v 100 h -300 z M ${50 + parseFloat(a_val_str)} 50 v 100 h ${300 - 2 * a_val_str} v -100 z" fill-rule="evenodd" fill="#facc15" opacity="0.5" />
                        <rect x="50" y="50" width="${a_val_str}" height="100" fill="#ef4444" opacity="0.5" />
                        <rect x="${350 - a_val_str}" y="50" width="${a_val_str}" height="100" fill="#ef4444" opacity="0.5" />
                        <!-- Labels -->
                        <text x="200" y="105" class="svg-label" text-anchor="middle">${roof_zone_1_label}</text>
                        <text x="${50 + a_val_str + (300 - 2 * a_val_str) / 2}" y="70" class="svg-label" text-anchor="middle" transform="rotate(-15 200 70)">${roof_zone_2_label}</text>
                        <text x="${50 + a_val_str / 2}" y="105" class="svg-label" text-anchor="middle">${roof_zone_3_label}</text>
                    </svg>
                </div>
            </div>`;
    }

    return `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${wall_diagram}${roof_diagram}</div>`;
}

/**
 * Renders the MWFRS (Main Wind Force Resisting System) section.
 */
function renderMwfrsSection(directional_results, inputs, intermediate, mwfrs_method, units) {
    const { p_unit } = units;
    const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
    
    let html = `<div id="mwfrs-section" class="mt-6 report-section-copyable">
                    <div class="flex justify-between items-center mb-4">
                    <h3 class="report-header flex-grow">3. MWFRS Design Pressures (${mwfrs_method})</h3>
                    <button data-copy-target-id="mwfrs-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                    </div>
                    <div class="copy-content">`;

    // Wind Perpendicular to L
    if (directional_results.perp_to_L) {
        html += `<h4 class="font-semibold text-lg mt-4 mb-2">Wind Perpendicular to Building Length (L)</h4>`;
        html += '<ul class="list-disc list-inside dark:text-gray-300 mb-6">';
        directional_results.perp_to_L.forEach(result => {
            const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
            html += `<li>${sanitizeHTML(result.surface)}: Cp = ${safeToFixed(result.cp, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
        });
        html += '</ul>';
    }

    // Wind Perpendicular to B
    if (directional_results.perp_to_B) {
        html += `<h4 class="font-semibold text-lg mt-4 mb-2">Wind Perpendicular to Building Width (B)</h4>`;
        html += '<ul class="list-disc list-inside dark:text-gray-300">';
        directional_results.perp_to_B.forEach(result => {
            const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
            const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
            html += `<li>${sanitizeHTML(result.surface)}: Cp = ${safeToFixed(result.cp, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
        });
        html += '</ul>';
    }

    html += `</div></div>`;
    return html;
}

function renderOpenBuildingResults(directional_results, open_building_ref, inputs, units) {
  const { p_unit } = units;
  const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
  
  let html = `<div id="open-building-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">3. Open Building Net Pressures</h3>
                  <button data-copy-target-id="open-building-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">
                <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">
                  Reference: ${sanitizeHTML(open_building_ref || 'ASCE 7 Ch. 27/29')}
                </p>`;

  // Check if this is rooftop structure data (high-rise open building)
  if (directional_results.rooftop_structure) {
    html += '<p class="mb-2">· Formula: p = q<sub>h</sub> × GCr</p>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.rooftop_structure.forEach(result => {
      const pressure = inputs.design_method === 'ASD' ? result.pressure_asd : result.pressure;
      html += `<li>${sanitizeHTML(result.surface)}: GCr = ${safeToFixed(result.GCr, 2)}, Design Pressure = ${safeToFixed(pressure, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  } else if (directional_results.open_roof) {
    // Low-rise open building
    html += '<p class="mb-2">· Formula: p = q<sub>h</sub> × G × CN</p>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.open_roof.forEach(result => {
      const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
      const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
      html += `<li>${sanitizeHTML(result.surface)}: CN (+) = ${safeToFixed(result.cn_pos, 2)}, CN (-) = ${safeToFixed(result.cn_neg, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  }

  html += `</div></div>`;
  return html;
}

function renderCandCSection(candc, inputs, units, directional_results) {
  if (!candc || !candc.applicable) return '';
  const { is_imp, p_unit } = units;
  let html = `<div id="candc-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">6. Components & Cladding (C&C) Pressures</h3>
                  <button data-copy-target-id="candc-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Calculated for Effective Wind Area A = ${sanitizeHTML(inputs.effective_wind_area)} ${is_imp ? 'ft²' : 'm²'}. Reference: ${sanitizeHTML(candc.ref)}.
                </p>
                ${generateCandCDiagram(inputs, candc)}`;

  if (candc.is_high_rise) {
    html += '<h4 class="font-semibold text-lg mb-2">High-Rise C&C Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    for (const zone in candc.pressures) {
      const data = candc.pressures[zone];
      const p_pos_lrfd = data.p_pos;
      const p_neg_lrfd = data.p_neg;
      const p_pos_asd = p_pos_lrfd * 0.6;
      const p_neg_asd = p_neg_lrfd * 0.6;
      html += `<li>${sanitizeHTML(zone)}: GCp (+) = ${safeToFixed(data.gcp_pos, 2)}, GCp (-) = ${safeToFixed(data.gcp_neg, 2)}, LRFD Pressure (+ / -) = ${safeToFixed(p_pos_lrfd, 2)} / ${safeToFixed(p_neg_lrfd, 2)} ${p_unit}, ASD Pressure (+ / -) = ${safeToFixed(p_pos_asd, 2)} / ${safeToFixed(p_neg_asd, 2)} ${p_unit}</li>`;
    }
    html += '</ul>';
  } else {
    html += '<h4 class="font-semibold text-lg mb-2">Low-Rise C&C Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    for (const zone in candc.pressures) {
      const data = candc.pressures[zone];
      const pressure = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
      html += `<li>${sanitizeHTML(zone)}: GCp = ${safeToFixed(data.gcp, 2)}, Design Pressure (${inputs.design_method}) = ${safeToFixed(pressure, 2)} ${p_unit}</li>`;
    }
    html += '</ul>';
  }
  html += `</div></div>`;
  return html;
}

function renderTorsionalCase(torsional_case, inputs, units) {
  if (!torsional_case) return '';
  
  const { h_unit } = units;
  const M_unit = inputs.unit_system === 'imperial' ? 'lb-ft' : 'N-m';
  
  let html = '<div id="torsional-section" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">5. Torsional Load Case</h3>';
  html += '<button data-copy-target-id="torsional-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  html += '<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Torsional moment per ASCE 7 Figure 27.4-8, Case 2. Apply with 75% of Case 1 wall pressures.</p>';
  html += '<ul class="list-disc list-inside dark:text-gray-300">';
  
  if (torsional_case.perp_to_L) {
    html += `<li>Wind Direction: Perpendicular to L, Torsional Moment M<sub>t</sub> = ${safeToFixed(torsional_case.perp_to_L.Mt, 0)} ${M_unit}, Eccentricity = 0.15 × B = ${safeToFixed(0.15 * inputs.building_width_B, 2)} ${h_unit}</li>`;
  }
  
  if (torsional_case.perp_to_B) {
    html += `<li>Wind Direction: Perpendicular to B, Torsional Moment M<sub>t</sub> = ${safeToFixed(torsional_case.perp_to_B.Mt, 0)} ${M_unit}, Eccentricity = 0.15 × L = ${safeToFixed(0.15 * inputs.building_length_L, 2)} ${h_unit}</li>`;
  }
  
  html += '</ul>';
  html += '</div></div>';
  return html;
}

function generateWindSummary(inputs, directional_results, candc, p_unit) {
  let html = '<div id="wind-summary" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">Summary of Key Pressures</h3>';
  html += '<button data-copy-target-id="wind-summary" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  
  // MWFRS Governing Pressures
  if (directional_results && (directional_results.perp_to_L || directional_results.perp_to_B)) {
    let max_ww = -Infinity, min_ww = Infinity;
    let max_lw = -Infinity, min_lw = Infinity;
    
    const allResults = [
        ...(directional_results.perp_to_L || []),
        ...(directional_results.perp_to_B || [])
    ];
    
    allResults.forEach(r => {
        const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
        const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
        
        if (r.surface.includes('Windward Wall')) {
            max_ww = Math.max(max_ww, p_pos);
            min_ww = Math.min(min_ww, p_neg);
        }
        if (r.surface.includes('Leeward Wall')) {
            max_lw = Math.max(max_lw, p_pos);
            min_lw = Math.min(min_lw, p_neg);
        }
    });
    
    html += '<h4 class="font-semibold text-lg mb-2">MWFRS Governing Pressures</h4>';
    html += '<ul class="list-disc list-inside mb-4 dark:text-gray-300">';
    if (isFinite(max_ww)) html += `<li>Windward Wall: ${safeToFixed(max_ww, 2)} to ${safeToFixed(min_ww, 2)} ${p_unit}</li>`;
    if (isFinite(max_lw)) html += `<li>Leeward Wall: ${safeToFixed(max_lw, 2)} to ${safeToFixed(min_lw, 2)} ${p_unit}</li>`;
    html += '</ul>';
  }
  
  // C&C Summary
  if (candc && candc.applicable && candc.pressures) {
    let max_candc = -Infinity, min_candc = Infinity;
    
    for (const data of Object.values(candc.pressures)) {
      const p_pos = inputs.design_method === 'ASD' ? (data.p_pos || 0) * 0.6 : (data.p_pos || 0);
      const p_neg = inputs.design_method === 'ASD' ? (data.p_neg || 0) * 0.6 : (data.p_neg || 0);
      max_candc = Math.max(max_candc, p_pos);
      min_candc = Math.min(min_candc, p_neg);
    }
    
    html += '<h4 class="font-semibold text-lg mb-2">C&C Governing Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    html += `<li>Maximum: ${safeToFixed(max_candc, 2)} ${p_unit}</li>`;
    html += `<li>Minimum (Suction): ${safeToFixed(min_candc, 2)} ${p_unit}</li>`;
    html += '</ul>';
  }
  
  html += '</div></div>';
  return html;
}

// =================================================================================
//  UI INJECTION & INITIALIZATION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {    
    // 1. Create the main calculation handler first, so it's available to other functions.
    const handleRunWindCalculation = createCalculationHandler({
        inputIds: windInputIds,
        storageKey: 'wind-calculator-inputs',
        validatorFunction: validateWindInputs,
        calculatorFunction: windLoadCalculator.run,
        renderFunction: renderWindResults,
        resultsContainerId: 'results-container',
        feedbackElId: 'feedback-message', // Explicitly pass feedback element ID
        buttonId: 'run-calculation-btn'
    });

    // --- EVENT HANDLERS ---
    function attachEventListeners() {
        document.getElementById('mean_roof_height').addEventListener('input', (event) => {
            const h = parseFloat(event.target.value) || 0;
            const is_imp = document.getElementById('unit_system').value === 'imperial';
            const limit = is_imp ? 60 : 18.3;
            document.getElementById('tall-building-section').classList.toggle('hidden', h <= limit);
        });

        // Create file-based handlers
        const handleSaveWindInputs = createSaveInputsHandler(windInputIds, 'wind-inputs.txt');
        const handleLoadWindInputs = createLoadInputsHandler(windInputIds, handleRunWindCalculation);

        // Attach handlers to buttons
        document.getElementById('run-calculation-btn').addEventListener('click', handleRunWindCalculation);
        document.getElementById('save-inputs-btn').addEventListener('click', handleSaveWindInputs);
        document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('wind-file-input'));
        document.getElementById('wind-file-input').addEventListener('change', (e) => handleLoadWindInputs(e));

        document.body.addEventListener('click', async (event) => {
            const copyBtn = event.target.closest('.copy-section-btn');
            if (copyBtn) {
                const targetId = copyBtn.dataset.copyTargetId;
                if (targetId) {
                    await handleCopyToClipboard(targetId, 'feedback-message');
                }
            }
            if (event.target.id === 'copy-report-btn') {
                await handleCopyToClipboard('wind-report-content', 'feedback-message');
            }
            if (event.target.id === 'send-to-combos-btn' && lastWindRunResults) {
                sendWindToCombos(lastWindRunResults);
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            if (event.target.id === 'download-pdf-btn') {
                handleDownloadPdf('wind-report-content', 'Wind-Load-Report.pdf');
            }
            if (event.target.id === 'download-word-btn') {
                handleDownloadWord('wind-report-content', 'Wind-Load-Report.doc');
            }
            const button = event.target.closest('.toggle-details-btn');
            if (button) {
                const detailId = button.dataset.toggleId;
                const detailRow = document.getElementById(detailId);
                if (detailRow) {
                    detailRow.classList.toggle('is-visible');
                    button.textContent = detailRow.classList.contains('is-visible') ? '[Hide]' : '[Show]';
                }
            }
        });
    }

    // 3. Define the main app initialization function.
    function initializeApp() {
        initializeSharedUI();
        attachEventListeners();
        addRangeIndicators();
        // Use a small timeout to ensure all elements are ready before triggering a calculation from localStorage
        setTimeout(() => {
            loadInputsFromLocalStorage('wind-calculator-inputs', windInputIds);
        }, 100);
    }

    // 4. Run the app.
    initializeApp();    
}); // END DOMContentLoaded

// =================================================================================
//  WIND LOAD CALCULATOR LOGIC
// =================================================================================

const windLoadCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
// Internal pressure coefficient GCpi
// Reference: ASCE 7-16/22 Table 26.13-1
function getInternalPressureCoefficient(enclosureClass) {
        const map = {
            "Enclosed": [0.18, "ASCE 7 Table 26.13-1 (Enclosed)"],
            "Partially Enclosed": [0.55, "ASCE 7 Table 26.13-1 (Partially Enclosed)"],
            "Open": [0.00, "ASCE 7 Table 26.13-1 (Open)"]
        };
        return map[enclosureClass] || [0.00, "Invalid Enclosure"];
    }

    /**
     * Calculates the net force coefficient (Cf) for open signs and lattice frameworks.
     * Reference: ASCE 7-16/22 Figure 29.5-1
     * @param {number} solidity_ratio - The ratio of solid area to gross area (ε).
     * @param {object} options - An object containing member_shape, V (wind speed), b (diameter), and unit_system.
     * @returns {{Cf: number, ref: string}}
     */
    function getOpenSignCf(solidity_ratio, options) {
        const { member_shape, V, b, unit_system } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0)); // Clamp between 0 and 1

        if (member_shape === 'flat') {
            // Interpolate for flat-sided members from Figure 29.5-1
            const cf = interpolate(epsilon, [0.1, 0.3, 0.5, 1.0], [1.8, 1.7, 1.6, 2.0]);
            return { Cf: cf, ref: "ASCE 7 Fig. 29.5-1 (Flat Members)" };
        } else { // 'round' members
            // For round members, Cf depends on V*sqrt(b) and epsilon.
            // V must be in ft/s and b in ft.
            const V_fps = unit_system === 'imperial' ? V * 1.467 : V * 3.281;
            const b_ft = unit_system === 'imperial' ? b : b * 3.281;
            const V_sqrt_b = V_fps * Math.sqrt(b_ft);

            // Interpolation data from ASCE 7-16 Fig 29.5-1 for round members
            const epsilon_points = [0.1, 0.3, 0.5, 1.0];
            const cf_low_reynolds = [0.7, 0.8, 0.8, 1.2]; // For V*sqrt(b) < 2.5
            const cf_high_reynolds = [1.2, 1.3, 1.3, 1.5]; // For V*sqrt(b) >= 2.5

            const cf_values = (V_sqrt_b < 2.5) ? cf_low_reynolds : cf_high_reynolds;
            const cf = interpolate(epsilon, epsilon_points, cf_values);
            return { Cf: cf, ref: `ASCE 7 Fig. 29.5-1 (Round, V√b=${safeToFixed(V_sqrt_b, 1)})` };
        }
    }

    /**
     * Calculates the net pressure coefficient (CN) for solid freestanding signs.
     * Reference: ASCE 7-16/22 Figure 29.3-1
     * @param {number} B - Width of the sign.
     * @param {number} s - Height of the sign.
     * @param {number} h - Height to the top of the sign.
     * @returns {{CN: number, ref: string}}
     */
    function getSolidSignCn(B, s, h) {
        if (!isFinite(B) || !isFinite(s) || !isFinite(h)) {
            return { CN: 0, ref: "Invalid dimensions for Solid Sign" };
        }

        const M = s > 0 ? B / s : 0;
        const s_over_h = h > 0 ? s / h : 0;

        // Interpolation data from ASCE 7-16 Fig 29.3-1
        const M_points = [0.25, 1, 2, 4, 10, 20, 40];
        const CN_at_s_over_h_1 = [1.2, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6];
        const CN_at_s_over_h_0 = [1.8, 1.85, 1.9, 1.9, 1.95, 1.95, 2.0];

        const CN = interpolate(M, M_points, s_over_h < 0.5 ? CN_at_s_over_h_0 : CN_at_s_over_h_1);
        return { CN, ref: `ASCE 7 Fig. 29.3-1 (M=${safeToFixed(M, 2)}, s/h=${safeToFixed(s_over_h, 2)})` };
    }

    /**
     * Returns the net pressure coefficients (GCr) for rooftop structures on buildings with h > 60ft.
     * This function now correctly uses Figure 29.5-1 for open lattice frameworks (like scaffolds)
     * and falls back to a solid coefficient for other cases.
     * @param {object} inputs - The main user inputs object.
     * @returns {{GCrh: number, GCrv: number, ref: string}} Object with horizontal and vertical coefficients.
     */
    function getRooftopStructureCoefficients(inputs) {
        const { scaffold_width_Br, scaffold_height_hr, solidity_ratio, member_shape, V_in, unit_system } = inputs;

        if (!isFinite(scaffold_width_Br) || scaffold_width_Br <= 0 || !isFinite(scaffold_height_hr) || scaffold_height_hr <= 0) {
            return { GCrh: 0, GCrv: 0, ref: "Invalid rooftop structure dimensions" };
        }

        // --- CORRECTED LOGIC for Open Lattice Frameworks (Scaffolds) ---
        // Use getOpenSignCf which implements ASCE 7-16 Fig 29.5-1
        const cf_options = {
            member_shape: member_shape,
            V: V_in,
            b: 1.0, // Assume a typical member size of 1ft for Reynolds number check, as it's not a primary input here.
            unit_system: unit_system
        };
        const { Cf, ref } = getOpenSignCf(solidity_ratio, cf_options);
        const GCrh = Cf; // For open frameworks, the force coefficient is Cf.

        // Vertical uplift for open frames is generally smaller. 1.5 is a conservative value for solid objects.
        // A value of 0.8 is more reasonable for open frames, though code is less explicit.
        const GCrv = 1.5; // Coefficient for vertical force (uplift)

        return { GCrh, GCrv, ref };
    }


    /**
     * Calculates the net force coefficient (Cf) for chimneys, tanks, and similar structures.
     * Reference: ASCE 7-16/22 Figure 29.4-1
     * @param {object} options - An object containing shape, h, D, qz, r, and unit_system.
     * @returns {{Cf: number, ref: string}}
     */
    function getChimneyCf(options) {
        const { shape, h, D, qz, r, unit_system } = options;
        if (D <= 0 || h <= 0) return { Cf: 0, ref: "Invalid dimensions" };

        const h_over_D = h / D;
        const h_D_points = [1, 7, 25];
        let cf_values;

        switch (shape) {
            case 'Square':
                const r_over_D = r / D;
                cf_values = (r_over_D >= 0.05)
                    ? [1.0, 1.1, 1.2] // Rounded
                    : [1.3, 1.4, 2.0]; // Sharp
                const Cf_sq = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_sq, ref: `ASCE 7 Fig. 29.4-1 (Square, r/D=${safeToFixed(r_over_D, 2)})` };

            case 'Hexagonal':
            case 'Octagonal':
                cf_values = [1.0, 1.2, 1.4];
                const Cf_hex = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_hex, ref: `ASCE 7 Fig. 29.4-1 (${shape})` };

            case 'Round':
                // D must be in ft and qz in psf for the D*sqrt(qz) parameter.
                const D_ft = unit_system === 'imperial' ? D : D * 3.281;
                const qz_psf = unit_system === 'imperial' ? qz : qz * 0.020885;
                const D_sqrt_qz = D_ft * Math.sqrt(qz_psf);

                if (D_sqrt_qz < 2.5) { // Moderately smooth, subcritical
                    cf_values = [0.5, 0.6, 0.7];
                } else { // Rough or supercritical
                    cf_values = [0.7, 0.8, 0.9];
                }
                const Cf_round = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_round, ref: `ASCE 7 Fig. 29.4-1 (Round, D√q_z=${safeToFixed(D_sqrt_qz, 1)})` };

            default:
                return { Cf: 1.4, ref: "ASCE 7 Fig. 29.4-1 (Default/Unknown)" };
        }
    }

    /**
     * Calculates the net force coefficient (Cf) for trussed towers.
     * Reference: ASCE 7-16/22 Tables 29.6-1 and 29.6-2
     * @param {object} options - An object containing structure_type, solidity_ratio, and member_shape.
     * @returns {{Cf: number, ref: string}}
     */
    function getTrussedTowerCf(options) {
        const { structure_type, solidity_ratio, member_shape } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0));
        let Cf;
        let ref;

        if (member_shape === 'flat') {
            // ASCE 7 Table 29.6-1 for flat-sided members
            Cf = 4.0 * epsilon**2 - 5.9 * epsilon + 4.0;
            ref = "ASCE 7 Table 29.6-1 (Flat Members)";
        } else { // round members
            // ASCE 7 Table 29.6-2 for round members
            if (structure_type.includes('Square')) {
                Cf = 3.4 * epsilon**2 - 4.7 * epsilon + 2.7;
                ref = "ASCE 7 Table 29.6-2 (Square Tower, Round Members)";
            } else { // Triangular or All Other
                Cf = 2.6 * epsilon**2 - 3.5 * epsilon + 2.2;
                ref = "ASCE 7 Table 29.6-2 (Triangular Tower, Round Members)";
            }
        }
        return { Cf: Math.max(Cf, 0), ref }; // Ensure Cf is not negative
    }

    /**
     * Calculates the net pressure coefficient (CN) for arched roofs.
     * Reference: ASCE 7-16/22 Figure 27.3-3
     * @param {object} options - An object containing r (rise), B (span), h (eave height), and spring_point.
     * @returns {{cnMap: object, ref: string}}
     */
    function getArchedRoofCn(options) {
        const { r, B, h, spring_point } = options;
        if (B <= 0) return { cnMap: {}, ref: "Invalid span" };

        const r_over_B = r / B;
        const h_over_B = spring_point === 'On Ground' ? 0 : h / B;
        const cnMap = {};

        // Interpolation data from ASCE 7-16 Fig 27.3-3
        const r_B_points = [0.05, 0.2, 0.3, 0.4, 0.5];

        // Windward Quarter
        const cn_windward_ground = [0.9, 1.1, 1.1, 1.1, 1.1];
        const cn_windward_elevated = [1.5, 1.4, 1.4, 1.4, 1.4];
        const cn_windward = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_windward_ground), interpolate(r_over_B, r_B_points, cn_windward_elevated)]);
        cnMap['Windward Quarter'] = cn_windward;

        // Center Half (and Leeward Quarter)
        const cn_center_h_B_0 = [-0.7, -0.8, -1.0, -1.1, -1.1];
        const cn_center_h_B_0_5 = [-0.9, -0.8, -0.8, -0.8, -0.8];
        const cn_center = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_center_h_B_0), interpolate(r_over_B, r_B_points, cn_center_h_B_0_5)]);
        cnMap['Center Half & Leeward Quarter'] = cn_center;

        return { cnMap, ref: `ASCE 7 Fig. 27.3-3 (r/B=${safeToFixed(r_over_B, 2)}, h/B=${safeToFixed(h_over_B, 2)})` };
    }

    // Detailed Cp values for Gable and Hip roofs
    // Reference: ASCE 7-16/22 Figure 27.3-2
    function getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem) {
        const cpMap = {};
        const theta = roofSlopeDeg;
        const h_over_L = L > 0 ? h / L : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        // Calculate 'a' per ASCE 7-16/22 Section 27.3.2
        const least_dim = Math.min(L, B);
        let a = Math.min(0.1 * least_dim, 0.4 * h);
        const min_a_val1 = 0.04 * least_dim;
        const min_a_val2 = unitSystem === 'imperial' ? 3.0 : 0.9;
        a = Math.max(a, min_a_val1, min_a_val2);

        const a_str = `(a=${safeToFixed(a, 1)} ${h_unit})`;

        // Interpolation functions for Cp based on theta and h/L
        // Windward zones (1, 2, 3)
        const cp_1_windward = interpolate(theta, [10, 20, 30, 45], [-0.7, -0.4, 0.2, 0.4]);
        const cp_2_windward = interpolate(theta, [10, 20, 30, 45], [-0.9, -0.7, -0.2, 0.4]);
        const cp_3_windward = interpolate(theta, [20, 30, 45], [-1.3, -1.0, -0.5]);

        // Leeward zones (1, 2, 3)
        const cp_1_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.5, -0.5, -0.3]);
        const cp_2_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.7, -0.7, -0.5]);
        const cp_3_leeward = -0.9;

        // Assign values to the map
        cpMap[`Roof Zone 1 (Windward)`] = cp_1_windward;
        cpMap[`Roof Zone 2 (Windward) ${a_str}`] = cp_2_windward;
        if (theta >= 20) {
            cpMap[`Roof Zone 3 (Windward) ${a_str}`] = cp_3_windward;
        }

        cpMap[`Roof Zone 1 (Leeward)`] = cp_1_leeward;
        cpMap[`Roof Zone 2 (Leeward) ${a_str}`] = cp_2_leeward;
        cpMap[`Roof Zone 3 (Leeward) ${a_str}`] = cp_3_leeward;

        if (isHip) {
            // Hip roof end zones (1E, 2E, 3E)
            const cp_1E = interpolate(theta, [10, 20, 27], [-0.9, -0.7, -0.5]);
            const cp_2E = interpolate(theta, [10, 20, 27], [-1.3, -0.9, -0.7]);
            const cp_3E = interpolate(theta, [20, 27], [-1.3, -1.0]);

            cpMap[`Hip End Zone 1E`] = cp_1E;
            cpMap[`Hip End Zone 2E ${a_str}`] = cp_2E;
            if (theta >= 20) {
                cpMap[`Hip End Zone 3E ${a_str}`] = cp_3E;
            }
        }

        // Side walls are always -0.7
        cpMap["Side Wall"] = -0.7;

        return cpMap;
    }

    // Cp values for buildings of all heights (Analytical Procedure)
    // Reference: ASCE 7-16 Figure 27.3-1
    function getAnalyticalCpValues(h, dim_parallel_to_wind, dim_perp_to_wind, roofSlopeDeg) {
    const cpMap = {};
    const L_over_B = dim_perp_to_wind > 0 ? dim_parallel_to_wind / dim_perp_to_wind : 0;
    
    cpMap["Windward Wall"] = 0.8;
    cpMap["Side Wall"] = -0.7;
    // Leeward wall Cp depends on L/B ratio
    cpMap[`Leeward Wall (L/B = ${safeToFixed(L_over_B, 2)})`] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
    
    
    // Roof coefficients also depend on h/L ratio
    const h_over_L = dim_parallel_to_wind > 0 ? h / dim_parallel_to_wind : 0;
    
    if (h_over_L <= 0.8) { // Note: ASCE 7-16 Fig 27.3-1 uses h/L, not h/B
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.7, -0.5, -0.3, -0.2, 0.0, 0.2, 0.4]); // This was missing a value in the original code
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20], [-0.3, -0.5, -0.6]);
    } else {
        // ASCE 7-16 Fig. 27.3-1 uses h/L, not h/B
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.9, -0.7, -0.4, -0.3, -0.2, 0.0, 0.4]);
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = -0.7;
    }
    
    return { cpMap };
}

    // Net pressure coefficients CN for Open Buildings with Free Roofs
    // Reference: ASCE 7-16/22 Figure 27.3-4
    function getOpenBuildingCnValues(roofSlopeDeg, isObstructed, roofType) {
        const cnMap = {};
        const theta = Math.abs(roofSlopeDeg); // Use absolute slope
        const caseKey = isObstructed ? 'obstructed' : 'unobstructed';

        // For flat roofs (theta <= 5 deg), use the values for theta = 5 deg.
        // ASCE 7-16/22 Fig 27.3-4 starts its charts at 5 degrees.
        const interp_theta = Math.max(theta, 5);

        // Net Pressure Coefficients, CN, for Monoslope Roofs
        const monoslope_map = {
            unobstructed: {
                zones: ['Zone 2', 'Zone 3'],
                // FIX: Interpolate using interp_theta to handle flat roofs (theta < 5)
                windward_qtr: [interpolate(interp_theta, [5, 30, 45], [0.8, 1.2, 1.2]), interpolate(interp_theta, [5, 30, 45], [1.2, 1.8, 1.8])],
                middle_half:  [interpolate(interp_theta, [5, 30, 45], [-0.8, -0.8, -0.8]), interpolate(interp_theta, [5, 30, 45], [-1.2, -1.2, -1.2])],
                leeward_qtr:  [interpolate(interp_theta, [5, 30, 45], [-0.6, -0.5, -0.5]), interpolate(interp_theta, [5, 30, 45], [-1.0, -0.8, -0.8])]
            },
            obstructed: {
                zones: ['Zone 2', 'Zone 3'],
                windward_qtr: [interpolate(theta, [5, 30, 45], [1.6, 2.4, 2.4]), interpolate(theta, [5, 30, 45], [2.2, 3.3, 3.3])],
                middle_half:  [interpolate(theta, [5, 30, 45], [-1.6, -1.6, -1.6]), interpolate(theta, [5, 30, 45], [-2.2, -2.2, -2.2])],
                leeward_qtr:  [interpolate(theta, [5, 30, 45], [-1.2, -1.0, -1.0]), interpolate(theta, [5, 30, 45], [-1.6, -1.4, -1.4])]
            }
        };

        // For pitched/troughed/flat, we use the monoslope values for each half
        const data = monoslope_map[caseKey];
        cnMap[`Windward Roof (First Quarter)`] = { cn_pos: data.windward_qtr[0], cn_neg: -data.windward_qtr[0] };
        cnMap[`Windward Roof (Zone 3)`] = { cn_pos: data.windward_qtr[1], cn_neg: -data.windward_qtr[1] };
        cnMap[`Middle Roof Area (Half)`] = { cn_pos: data.middle_half[0], cn_neg: -data.middle_half[0] };
        cnMap[`Middle Roof Area (Zone 3)`] = { cn_pos: data.middle_half[1], cn_neg: -data.middle_half[1] };
        cnMap[`Leeward Roof (Last Quarter)`] = { cn_pos: data.leeward_qtr[0], cn_neg: -data.leeward_qtr[0] };
        cnMap[`Leeward Roof (Zone 3)`] = { cn_pos: data.leeward_qtr[1], cn_neg: -data.leeward_qtr[1] };

        return { cnMap, ref: `ASCE 7 Fig 27.3-4 (${caseKey} flow)` };
    }

    // External pressure coefficients Cp
    // Reference: ASCE 7-16/22 Figures 27.4-1, 27.4-2, 27.4-3 (now includes edge/corner zones for flat roofs)
    // NOTE: For more complex roof shapes, see future improvement
    function getCpValues(standard, h, L, B, roofType, roofSlopeDeg, unitSystem) {
        const cpMap = {};
        const refNotes = {};
        const L_over_B = B > 0 ? L / B : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        cpMap["Windward Wall"] = 0.8;
        refNotes["Windward Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Side Wall"] = -0.7;
        refNotes["Side Wall"] = "ASCE 7 Fig. 27.4-1";
        cpMap["Leeward Wall"] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
        refNotes["Leeward Wall"] = "ASCE 7 Fig. 27.4-1 (varies with L/B)";

        if (roofType === "flat") {
            if (standard === "ASCE 7-22") {
                // ASCE 7-22 Figure 27.4-1 (Zoned approach)
                let a = Math.min(0.1 * Math.min(L, B), 0.4 * h);
                const min_a = unitSystem === 'imperial' ? 3.0 : 0.9;
                a = Math.max(a, min_a);
                cpMap[`Roof Zone 1 (0 to ${safeToFixed(a, 1)} ${h_unit})`] = -0.9;
                cpMap[`Roof Zone 2 (${safeToFixed(a, 1)} to ${safeToFixed(2*a, 1)} ${h_unit})`] = -0.5;
                cpMap[`Roof Zone 3 (> ${safeToFixed(2*a, 1)} ${h_unit})`] = -0.3;
                refNotes["Roof"] = "ASCE 7-22 Fig. 27.4-1 (Zoned approach)";
            } else { // ASCE 7-16
                // ASCE 7-16 Figure 27.4-1 (h/L approach)
                const h_over_L = L > 0 ? h / L : 0;
                if (h_over_L <= 0.5) {
                    cpMap[`Roof (0 to ${safeToFixed(h/2, 1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${safeToFixed(h/2, 1)} to ${safeToFixed(h, 1)} ${h_unit})`] = -0.9;
                    cpMap[`Roof (${safeToFixed(h, 1)} to ${safeToFixed(2*h, 1)} ${h_unit})`] = -0.5;
                    cpMap[`Roof (> ${safeToFixed(2*h, 1)} ${h_unit})`] = -0.3;
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L ≤ 0.5)";
                } else { // ASCE 7-16 Fig. 27.4-1 (h/L > 0.5)
                    cpMap[`Roof (0 to ${safeToFixed(h/2, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -1.3]);
                    cpMap[`Roof (${safeToFixed(h/2, 1)} to ${safeToFixed(h, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.9, -0.7]);
                    cpMap[`Roof (> ${safeToFixed(h, 1)} ${h_unit})`] = interpolate(h_over_L, [0.5, 1.0], [-0.5, -0.4]);
                    refNotes["Roof"] = "ASCE 7-16 Fig. 27.4-1 (h/L > 0.5)";
                }
            }
        } else if (["gable", "hip"].includes(roofType)) {
            const isHip = roofType === 'hip';
            const gableHipCp = getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem);
            Object.assign(cpMap, gableHipCp);
            refNotes["Roof"] = `ASCE 7-16/22 Fig. 27.4-2 (${isHip ? 'Hip' : 'Gable'})`;
        }
        return { cpMap, refNotes };
    }

// Directionality factor Kd
// Reference: ASCE 7-16/22 Table 26.6-1
function getKdFactor(structureType, asce_standard) {
        const kdMap = {
            "Buildings (MWFRS, C&C)": [0.85, "ASCE 7 Table 26.6-1 (Buildings)"],
            "Arched Roofs": [0.85, "ASCE 7 Table 26.6-1 (Arched Roofs)"],
            "Solid Freestanding Signs/Walls": [0.85, "ASCE 7 Table 26.6-1 (Signs/Walls)"],
            "Open Signs/Frames": [0.85, "ASCE 7 Table 26.6-1 (Open Signs)"],
            "Trussed Towers (Triangular, Square, Rectangular)": [0.85, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Trussed Towers (All Other Cross Sections)": [0.95, "ASCE 7 Table 26.6-1 (Trussed Towers)"],
            "Chimneys, Tanks (Square)": [0.90, "ASCE 7 Table 26.6-1 (Square)"], // This is for C&C, MWFRS is 0.85
            "Chimneys, Tanks (Round)": [0.95, "ASCE 7 Table 26.6-1 (Round)"], // This is for C&C, MWFRS is 0.85
            "Chimneys, Tanks (Hexagonal)": [0.95, "ASCE 7 Table 26.6-1 (Hexagonal)"]
        };
        // ASCE 7-22, Table 26.6-1, Note 3 states Kd=1.0 for MWFRS of other structures.
        // This includes open signs.
        if (asce_standard === 'ASCE 7-22' && structureType === 'Open Signs/Frames') {
            return [1.0, "ASCE 7-22 Table 26.6-1, Note 3"];
        }

        return kdMap[structureType] || [1.0, "ASCE 7 Table 26.6-1 (Default)"];
    }

// Importance factor Iw
// Reference: ASCE 7-16/22 Table 1.5-2
function getImportanceFactor(category, standard) {
        const factors = standard === "ASCE 7-22" ? { "I": 0.75, "II": 1.00, "III": 1.15, "IV": 1.15 } : { "I": 0.87, "II": 1.00, "III": 1.15, "IV": 1.15 };
        const ref = standard === "ASCE 7-22" ? "ASCE 7-22 Table 1.5-2" : "ASCE 7-16 Table 1.5-2";
        return [factors[category] || 1.00, ref];
    }

// Wind exposure constants (alpha, zg)
// Reference: ASCE 7-16/22 Table 26.9-1
function getExposureConstants(category, units) {
    const expMap = {
        'B': { alpha: 7.0, zg_imp: 1200.0, zg_metric: 365.8, ref: "ASCE 7 Table 26.9-1 (Exposure B)" },
        'C': { alpha: 9.5, zg_imp: 900.0, zg_metric: 274.3, ref: "ASCE 7 Table 26.9-1 (Exposure C)" },
        'D': { alpha: 11.5, zg_imp: 700.0, zg_metric: 213.4, ref: "ASCE 7 Table 26.9-1 (Exposure D)" }
    };
    const data = expMap[category] || expMap['C'];
    const zg = units === 'imperial' ? data.zg_imp : data.zg_metric;
    return { alpha: data.alpha, zg, ref_note: data.ref };
}

// Calculation of exposure factor Kz
// Reference: ASCE 7-16/22 Section 26.10, Eq. 26.10-1
// Table 26.10-1 for exposure constants
function calculateKz(h, category, units) { // Refactored for readability
    // --- 1. Input Validation (Guard Clauses) ---
    if (!isFinite(h) || h < 0 || !category) {
        console.error("Invalid parameters for calculateKz:", { h, category });
        return { Kz: 1.0, alpha: 0, zg: 0, ref_note: "Error: Invalid input" };
    }

    const { alpha, zg, ref_note } = getExposureConstants(category, units);
    if (!isFinite(alpha) || !isFinite(zg) || alpha <= 0 || zg <= 0) {
        console.error("Invalid exposure constants from getExposureConstants:", { alpha, zg });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Invalid exposure constants" };
    }

    // --- 2. Main Calculation Logic ---
    const min_h = units === 'imperial' ? 15.0 : 4.6;
    const calc_h = Math.max(h, min_h);
    const Kz = 2.01 * Math.pow(calc_h / zg, 2 / alpha);

    // --- 3. Output Validation ---
    if (!isFinite(Kz)) {
        console.error("Kz calculation resulted in a non-finite value:", { calc_h, zg, alpha });
        return { Kz: 1.0, alpha, zg, ref_note: "Error: Kz calculation failed" };
    }

    return { Kz, alpha, zg, ref_note };
}

// Elevation factor Ke
// Reference: ASCE 7-16 Table 26.9-1; ASCE 7-22 Section 26.9 (Ke=1.0)
function calculateKe(elevation, units, standard) {
        if (standard === "ASCE 7-22") return [1.0, "ASCE 7-22 Section 26.9 (Ke = 1.0)"];
        const elev_ft = [-500, 0, 500, 1000, 2000, 3000, 4000, 5000, 6000];
        const ke_vals = [1.05, 1.00, 0.95, 0.90, 0.82, 0.74, 0.67, 0.61, 0.55];
        const elev_calc = units === 'metric' ? elevation * 3.28084 : elevation;
        const ke_val = interpolate(elev_calc, elev_ft, ke_vals);
        return [ke_val, `ASCE 7-16 Table 26.9-1 (Elevation: ${safeToFixed(elev_calc, 0)} ft)`];
    }

// Wind velocity pressure qz
// Reference: ASCE 7-16/22 Eq. 26.10-1
function calculateVelocityPressure(Kz, Kzt, Kd, Ke, V, standard, riskCat, units) {
    // Validate all inputs
    const safeKz = isFinite(Kz) && Kz > 0 ? Kz : 1.0;
    const safeKzt = isFinite(Kzt) && Kzt > 0 ? Kzt : 1.0;
    const safeKd = isFinite(Kd) && Kd > 0 ? Kd : 0.85;
    const safeKe = isFinite(Ke) && Ke > 0 ? Ke : 1.0;
    const safeV = isFinite(V) && V > 0 ? V : 100; // Default safe wind speed
    
    const [Iw, iw_ref] = getImportanceFactor(riskCat, standard);
    const constant = units === 'imperial' ? 0.00256 : 0.613;
    
    let qz, ref_note;
    if (standard === 'ASCE 7-22') {
        // ASCE 7-22 includes Iw directly in the velocity pressure equation.
        qz = constant * safeKz * safeKzt * safeKd * safeKe * Iw * (safeV * safeV); 
        ref_note = `ASCE 7-22 Eq. 26.10-1 (Iw = ${Iw.toFixed(2)} from ${iw_ref})`;
    } else { // ASCE 7-16 and other fallbacks
        // ASCE 7-16 does NOT include Iw in the velocity pressure equation. It's applied later in load combinations.
        qz = constant * safeKz * safeKzt * safeKd * safeKe * (safeV * safeV);
        ref_note = "ASCE 7-16 Eq. 26.10-1";
    }
    
    // Final validation
    if (!isFinite(qz) || qz < 0) {
        console.warn("Invalid qz calculated, using fallback");
        qz = units === 'imperial' ? 10.0 : 500.0; // Reasonable fallback
        ref_note += " - Fallback value used due to calculation issue";
    }
    
    return { qz, ref_note };
}

// Design pressure p = qz(G*Cp - GCpi)
// Reference: ASCE 7-16/22 Eq. 27.4-1 (MWFRS)
function calculateDesignPressure(q_ext, q_int, G, Cp, GCpi) {
    // Correct formula: p = q(GCp) - qi(GCpi)
    // q = q_ext (qz for windward wall, qh for others)
    // qi = q_int (qh for enclosed/partially enclosed)
    const external_pressure = q_ext * G * Cp;
    const internal_pressure = q_int * GCpi;
    return external_pressure - internal_pressure;
}
    // --- C&C Calculation Helpers for h > 60 ft ---

    /**
     * A generic helper for 2D interpolation of GCp values for high-rise buildings.
     * It interpolates first based on the logarithm of the effective wind area,
     * and then based on the building height.
     * @param {object} gcp_data - The data object containing GCp values, heights, and areas.
     * @param {number} A - The effective wind area.
     * @param {number} h - The mean roof height.
     * @returns {object} An object mapping zones to their interpolated positive and negative GCp values.
     */
    function interpolateHighRiseGcp(gcp_data, A, h) {
        const log_areas = gcp_data.areas.map(Math.log);
        const log_A = Math.log(A);
        const results = {};

        // Iterate over the zones defined in the gcp_data object (e.g., 'Wall Zone 4', 'Roof Zone 1'').
        for (const zone of Object.keys(gcp_data).filter(k => k !== 'heights' && k !== 'areas')) {
            const zoneData = gcp_data[zone];
            
            // 1. Interpolate across area for each height point in the table.
            const pos_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, zoneData.pos));
            const neg_vals_at_h = gcp_data.heights.map(() => interpolate(log_A, log_areas, zoneData.neg));
            
            // 2. Interpolate across height using the results from the area interpolation.
            results[zone] = {
                positive: interpolate(h, gcp_data.heights, pos_vals_at_h),
                negative: interpolate(h, gcp_data.heights, neg_vals_at_h)
            };
        }
        return results;
    }

    function calculateWallPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            'Wall Zone 4': { pos: [0.9, 0.9, 0.8], neg: [-1.0, -0.9, -0.8] },
            'Wall Zone 5': { pos: [0.9, 0.9, 0.8], neg: [-1.2, -1.1, -1.0] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    function calculateSteepRoofCandC(A, h, theta) {
        // ASCE 7-16 Figure 30.5-2 for Steep Roofs (theta > 7 deg)
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            "Zone 1'": { pos: [0.7, 0.5, 0.3], neg: [-1.0, -0.9, -0.7] },
            "Zone 2'": { pos: [0.9, 0.7, 0.5], neg: [-1.8, -1.4, -1.0] },
            "Zone 3'": { pos: [1.3, 1.0, 0.7], neg: [-2.6, -2.0, -1.4] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    function calculateLowSlopeRoofPressuresHighRise(A, h) {
        const gcp_data = {
            heights: [60, 100, 200, 300, 400, 500],
            areas: [10, 100, 500],
            "Roof Zone 1'": { pos: [0.7, 0.5, 0.3], neg: [-1.1, -0.9, -0.7] },
            "Roof Zone 2'": { pos: [0.7, 0.5, 0.3], neg: [-1.8, -1.4, -1.0] },
            "Roof Zone 3'": { pos: [0.7, 0.5, 0.3], neg: [-2.6, -2.0, -1.4] }
        };
        return interpolateHighRiseGcp(gcp_data, A, h);
    }

    /**
     * Calculates C&C pressures for high-rise buildings (h > 60ft) by selecting the appropriate
     * data tables and converting the resulting GCp values to pressures.
     * @param {object} inputs - The user inputs object.
     * @param {number} qh - The velocity pressure at the mean roof height.
     * @param {number} GCpi_abs - The absolute value of the internal pressure coefficient.
     * @returns {object} An object containing the calculated pressures and other metadata.
     */
    function calculateHighRiseCandCPressures(inputs, qh, GCpi_abs) {
        // Add console warning if C&C pressures cannot be calculated for the given inputs.
        console.warn('No C&C pressures calculated for high-rise - check inputs:', {
            effective_wind_area: inputs.effective_wind_area, 
            roof_type: inputs.roof_type 
        });
        const { mean_roof_height: h, effective_wind_area: A, roof_slope_deg, roof_type, unit_system } = inputs;
        const warnings = [];
        const results = {};

        // Wall pressures (Figure 30.5-1)
        Object.assign(results, calculateWallPressuresHighRise(A, h));

        // Roof pressures based on roof type and slope
        const is_low_slope = roof_slope_deg <= 7;
        if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && is_low_slope)) {
            Object.assign(results, calculateLowSlopeRoofPressuresHighRise(A, h));
        } else if (['gable', 'hip'].includes(roof_type) && !is_low_slope) {
            Object.assign(results, calculateSteepRoofCandC(A, h, roof_slope_deg));
        } else {
            warnings.push(`C&C pressures for '${roof_type}' roofs on high-rise buildings are not explicitly covered by the prescriptive methods in ASCE 7-16 Ch. 30 and are not calculated.`);
            return { applicable: false, pressures: {}, ref: "Unsupported roof type for high-rise C&C", warnings };
        }

        // Convert GCp values to final pressures
        const finalPressures = {};
        for (const [zone, gcps] of Object.entries(results)) {
            if (typeof gcps.positive !== 'number' || typeof gcps.negative !== 'number') continue;

            const p1 = qh * (gcps.positive - GCpi_abs);
            const p2 = qh * (gcps.positive - (-GCpi_abs));
            const p3 = qh * (gcps.negative - GCpi_abs);
            const p4 = qh * (gcps.negative - (-GCpi_abs));

            finalPressures[zone] = {
                gcp_pos: gcps.positive, gcp_neg: gcps.negative,
                p_pos: Math.max(p1, p2, p3, p4), p_neg: Math.min(p1, p2, p3, p4)
            };
        }

        return { applicable: true, pressures: finalPressures, ref: `ASCE 7-16 Ch. 30, Part 2 (h > ${unit_system === 'imperial' ? '60ft' : '18.3m'})`, is_high_rise: true, warnings };
    }

    // Enhanced C&C calculation function
    function calculateCandCPressuresEnhanced(inputs, qh, GCpi_abs) {
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type, unit_system } = inputs;
        const h = mean_roof_height;
        const A = effective_wind_area;
        const is_high_rise = unit_system === 'imperial' ? h > 60 : h > 18.3;
        const warnings = [];

        // ASCE 7-16 Chapter 30, Part 2: Buildings with h > 60 ft
        if (is_high_rise) {
            return calculateHighRiseCandCPressures(inputs, qh, GCpi_abs);
        }

        // Fallback to existing h <= 60 ft calculations
        return calculateLowRiseCandCPressures(inputs, qh, GCpi_abs);
    }

    // Data store for ASCE 7-16 C&C GCp values for low-rise buildings (h <= 60ft)
    const GCP_DATA = {
        wall: {
            zone4: [-1.1, -1.1, -1.1, -1.1, -1.0, -0.9], // Fig 30.3-1
            zone5: [-1.4, -1.3, -1.2, -1.1, -1.0, -0.9]  // Fig 30.3-1
        },
        gable: { // Fig 30.3-2
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5],
                zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5],
                zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5],
                zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5]
            }
        },
        hip: { // Fig 30.3-3
            caseA: { // theta <= 7 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.7, -1.5, -1.2, -1.0, -0.7, -0.5], zone3: [-2.3, -2.0, -1.5, -1.2, -0.7, -0.5],
                zone1E: [-1.3, -1.3, -1.1, -1.0, -0.7, -0.5], zone2E: [-2.2, -2.0, -1.6, -1.3, -0.8, -0.5], zone3E: [-2.8, -2.5, -2.0, -1.5, -0.8, -0.5]
            },
            caseB: { // 27 < theta <= 45 deg
                zone1: [-1.0, -1.0, -0.9, -0.8, -0.6, -0.5], zone2: [-1.9, -1.7, -1.4, -1.1, -0.7, -0.5], zone3: [-2.8, -2.5, -1.9, -1.4, -0.7, -0.5],
                zone1E: [-1.5, -1.5, -1.3, -1.1, -0.7, -0.5], zone2E: [-2.5, -2.3, -1.8, -1.4, -0.8, -0.5], zone3E: [-3.3, -3.0, -2.3, -1.7, -0.8, -0.5]
            }
        }
    };

    /**
     * Helper to get GCp values for different roof types by interpolating based on slope.
     */
    function getGcpValuesForRoof(roof_type, theta) {
        const roofData = GCP_DATA[roof_type];
        if (!roofData) return {};

        const interpolate_gcp_array = (arrA, arrB) => arrA.map((valA, i) => interpolate(theta, [7, 27], [valA, arrB[i]]));

        if (theta <= 7) return roofData.caseA;
        if (theta > 45) return roofData.caseB; // Per figures, use Case B for theta > 27
        if (theta > 7 && theta <= 27) {
            const interpolated_gcp = {};
            for (const zone in roofData.caseA) {
                interpolated_gcp[zone] = interpolate_gcp_array(roofData.caseA[zone], roofData.caseB[zone]);
            }
            return interpolated_gcp;
        }
        return roofData.caseB; // 27 < theta <= 45
    }

    function calculateLowRiseCandCPressures(inputs, qz, GCpi_abs) { // Refactored for readability
        const { mean_roof_height, effective_wind_area, roof_slope_deg, roof_type } = inputs;
        const A = effective_wind_area;
        const theta = roof_slope_deg;

        // Setup for logarithmic interpolation based on effective wind area
        const area_points = [10, 20, 50, 100, 500, 1000];
        const log_area_points = area_points.map(Math.log);
        const log_A = Math.log(A);
        const logInterpolate = (gcp_values) => interpolate(log_A, log_area_points, gcp_values);

        const gcp_map = {};

        // Wall Pressures (Fig 30.3-1)
        gcp_map['Wall Zone 4 (Interior)'] = logInterpolate(GCP_DATA.wall.zone4);
        gcp_map['Wall Zone 5 (Corners)'] = logInterpolate(GCP_DATA.wall.zone5);

        // Roof Pressures
        if (['gable', 'hip'].includes(roof_type)) {
            const roof_gcp_arrays = getGcpValuesForRoof(roof_type, theta);
            const zone_map = { zone1: 'Roof Zone 1 (Interior)', zone2: 'Roof Zone 2 (Edges)', zone3: 'Roof Zone 3 (Corners)', zone1E: 'Roof End Zone 1E', zone2E: 'Roof End Zone 2E', zone3E: 'Roof End Zone 3E' };
            for (const zone in roof_gcp_arrays) {
                gcp_map[zone_map[zone]] = logInterpolate(roof_gcp_arrays[zone]);
            }
        }

        const final_pressures = {};
        for (const zone in gcp_map) {
            const gcp = gcp_map[zone];
            // p = qh * (GCp - GCpi)
            const p_pos_gcp = qz * (gcp - (-GCpi_abs)); // Uplift GCp is negative, check with internal suction
            const p_neg_gcp = qz * (gcp - (+GCpi_abs)); // Uplift GCp is negative, check with internal pressure
            final_pressures[zone] = {
                gcp: gcp,
                p_pos: Math.max(p_pos_gcp, p_neg_gcp), // Not typical for these figures, but for completeness
                p_neg: Math.min(p_pos_gcp, p_neg_gcp) // C&C is usually governed by suction
            };
        }
        return { applicable: true, pressures: final_pressures, ref: "ASCE 7 Ch. 30, Part 1 (h<=60ft)" };
    }

    function calculateHeightVaryingPressures(inputs, intermediate_globals) {
        const { exposure_category, unit_system, risk_category, mean_roof_height, design_method } = inputs;
        const { Kzt, Kd, Ke, V_in, effective_standard, abs_gcpi, G, qz: qh } = intermediate_globals;
    
        // Better validation
        if (!inputs || !intermediate_globals || !mean_roof_height || mean_roof_height <= 0 || !exposure_category) {
            console.error("Invalid inputs for height varying pressure calculation");
            return [];
        }
    
        const results = [];
        const is_imp = unit_system === 'imperial';
        const step = is_imp ? 5 : 1.5;
        const heights = [];
    
        // Generate height points
        for (let z = 0; z <= mean_roof_height; z += step) {
            heights.push(z);
        }
        // Ensure roof height is included if the step doesn't land on it
        if (heights[heights.length - 1] < mean_roof_height) {
            heights.push(mean_roof_height);
        }
    
        for (const z of heights) {
            // Calculate Kz for each height
            const { Kz } = calculateKz(z, exposure_category, unit_system);
            // Calculate velocity pressure at height z
            const { qz } = calculateVelocityPressure(Kz, Kzt, Kd, Ke, V_in, effective_standard, risk_category, unit_system);
    
            // Use the main design pressure function for consistency. Cp for windward wall is 0.8.
            const p_pos = calculateDesignPressure(qz, qh, G, 0.8, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, qh, G, 0.8, -abs_gcpi);
    
            results.push({ height: z, Kz, qz, p_pos, p_neg });
        }
        return results;
    }

    /**
     * Retrieves constants for gust effect factor calculation from ASCE 7-16 Table 26.11-1.
     * // Reference: ASCE 7-16 Table 26.11-1
     */
    function getGustCalculationConstants(exposure_category, unit_system) {
        const constants = {
            'B': { b_bar: 0.47, c: 0.30, l: 320, epsilon_bar: 1/3.0 },
            'C': { b_bar: 0.65, c: 0.20, l: 500, epsilon_bar: 1/5.0 },
            'D': { b_bar: 0.80, c: 0.15, l: 650, epsilon_bar: 1/8.0 }
        };
        const metric_multipliers = { b_bar: 1.32, c: 1.5, l: 0.3048, epsilon_bar: 1.0 };

        let data = constants[exposure_category] || constants['C']; // Default to C

        if (unit_system === 'metric') {
            data = {
                b_bar: data.b_bar * metric_multipliers.b_bar,
                c: data.c * metric_multipliers.c,
                l: data.l * metric_multipliers.l,
                epsilon_bar: data.epsilon_bar
            };
        }
        return data;
    }

    /**
     * Calculates the mean hourly wind speed at a given height.
     * // Reference: ASCE 7-16 Eq. 26.11-7
     */
    function calculateMeanHourlyWindSpeed(V_in, z_effective, zg, alpha, b_bar, unit_system) {
        // For Imperial units, V_in (mph) is converted to fps. For Metric, V_in (m/s) is used directly.
        const V_bar_33ft = V_in * b_bar * Math.pow(33 / zg, 1 / alpha) * (unit_system === 'imperial' ? (88/60) : 1);
        return V_bar_33ft * Math.pow(z_effective / 33, 1 / alpha);
    }

    /**
     * Calculates the resonant response factor, R.
     * // Reference: ASCE 7-16 Eq. 26.11-10
     */
    function calculateResonantResponseFactor(n1, V_z_bar, Lz_bar) {
        // Damping ratio (beta) is typically 0.01 for steel buildings and 0.015 for concrete buildings.
        // ASCE 7-16 Section C26.11.3 suggests 0.01 is a reasonable general assumption.
        const damping_ratio = 0.01;
        const N1 = (n1 * Lz_bar) / V_z_bar;
        const Rn = (7.47 * N1) / Math.pow(1 + 10.3 * N1, 5/3);
        const Rh = (1 / N1) - (1 / (2 * N1 * N1)) * (1 - Math.exp(-2 * N1));
        const RB = Rh; // For simplicity, assuming B=h, so Rh = RB

        return Math.sqrt((1 / damping_ratio) * Rn * Rh * RB);
    }

    /**
     * Calculates the Gust Effect Factor G for flexible structures per ASCE 7-16 Section 26.11.
     */
    function calculateGustEffectFactor(inputs, intermediate) { // Refactored for readability
        if (inputs.building_flexibility !== 'Flexible' || !inputs.fundamental_period) {
            return { G: 0.85, ref: "ASCE 7-16 Sec. 26.11.1 (Rigid Structure)" };
        } // Corrected validation
        const { V_in, unit_system, mean_roof_height, building_length_L, building_width_B, exposure_category, fundamental_period } = inputs;
        const { alpha, zg } = intermediate; // Defensive destructuring
        const n1 = fundamental_period > 0 ? 1 / fundamental_period : 0;

        const { b_bar, c, l, epsilon_bar } = getGustCalculationConstants(exposure_category, unit_system);

        const z_bar = 0.6 * mean_roof_height;
        const min_z = unit_system === 'imperial' ? 15.0 : 4.6;
        const z_bar_effective = Math.max(z_bar, min_z);
        
        const V_z_bar = calculateMeanHourlyWindSpeed(V_in, z_bar_effective, zg, alpha, b_bar, unit_system);
        // Turbulence Intensity, Iz_bar. Ref: ASCE 7-16 Eq. 26.11-7
        const Iz_bar = c * Math.pow(33 / z_bar_effective, 1/6);
        const ref_h = unit_system === 'imperial' ? 33 : 10; // 33 ft or 10 m
        // Integral Length Scale, Lz_bar. Ref: ASCE 7-16 Eq. 26.11-8
        const Lz_bar = l * Math.pow(z_bar_effective / ref_h, epsilon_bar);
    
        // Peak factor for background response (gQ) is taken as 3.4 per ASCE 7-16 Section 26.11.2.
        const gQ = 3.4;
        // Peak factor for resonant response, gR. Ref: ASCE 7-16 Eq. 26.11-9
        const gR = Math.sqrt(2 * Math.log(3600 * n1)) + (0.577 / Math.sqrt(2 * Math.log(3600 * n1)));
    
        // Background Response Factor, Q. Ref: ASCE 7-16 Eq. 26.11-14
        const Q = Math.sqrt(1 / (1 + 0.63 * Math.pow(Math.max(mean_roof_height, building_length_L) / Lz_bar, 0.63)));
        const R = calculateResonantResponseFactor(n1, V_z_bar, Lz_bar);

        // Gust-Effect Factor, Gf. Ref: ASCE 7-16 Eq. 26.11-6
        const Gf = (1 + 1.7 * Iz_bar * Math.sqrt(gQ*gQ * Q*Q + gR*gR * R*R)) / (1 + 1.7 * gQ * Iz_bar);
    
        return {
            G: Gf,
            ref: `ASCE 7-16 Eq. 26.11-6 (Flexible, G=${safeToFixed(Gf, 3)})`
        };
    }

    function calculateRoofPressureByDistance(inputs, intermediate_globals, cp_map, building_dimension_parallel_to_wind) {
        const { gust_effect_factor_g } = inputs;
        const { qz, abs_gcpi } = intermediate_globals;
        const results = [];
        const L = building_dimension_parallel_to_wind;

        // Create an array of distances to evaluate
        const distances = [];
        for (let i = 0; i <= 20; i++) { // Evaluate at 21 points (every 5%)
            distances.push(L * (i / 20));
        }

        // Create a lookup from the cp_map
        const roof_zones = [];
        for (const [surface, cp] of Object.entries(cp_map)) {
            if (!surface.toLowerCase().includes('roof')) continue; // Only consider roof surfaces
            // Regex to find zones like "Roof (0 to 30 ft)"
            const matches = surface.match(/\((\d+(\.\d+)?)\s*to\s*(\d+(\.\d+)?)/);
            if (matches) {
                roof_zones.push({ start: parseFloat(matches[1]), end: parseFloat(matches[3]), cp });
            }
        }

        distances.forEach(dist => {
            // Find the correct Cp value for the current distance from the pre-calculated zones
            let cp_at_dist = roof_zones.find(zone => dist >= zone.start && dist <= zone.end)?.cp ?? 
                             (cp_map["Leeward Roof"] || cp_map["Roof Leeward"] || -0.3); // Fallback to leeward value

            const p_pos = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, abs_gcpi);
            const p_neg = calculateDesignPressure(qz, gust_effect_factor_g, cp_at_dist, -abs_gcpi);
            const distance_ratio = L > 0 ? dist / L : 0;
            results.push({ distance: dist, cp: cp_at_dist, p_pos, p_neg, distance_ratio });
        });

        return results;
    }

    /**
     * Calculates MWFRS pressures for low-rise buildings (h <= 60ft).
     * @param {object} inputs - The user inputs.
     * @param {object} intermediate_globals - Pre-calculated intermediate values (qz, G, etc.).
     * @returns {object} An object containing the directional results.
     */
    function calculateLowRisePressures(inputs, intermediate_globals) {
        const { effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system } = inputs;
        const { qz, G, abs_gcpi } = intermediate_globals;
        const directional_results = {};

        // Wind Perpendicular to L (wind parallel to L)
        const { cpMap: cp_map_L } = getCpValues(effective_standard, mean_roof_height, building_length_L, building_width_B, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${safeToFixed(building_length_L / building_width_B, 2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        // Wind Perpendicular to B (wind parallel to B)
        const { cpMap: cp_map_B } = getCpValues(effective_standard, mean_roof_height, building_width_B, building_length_L, roof_type, roof_slope_deg, unit_system);
        directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => ({
            surface: surface.replace('L/B', `L/B = ${safeToFixed(building_width_B / building_length_L, 2)}`),
            cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi),
            p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6,
            p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        return directional_results;
    }

    /**
     * Calculates MWFRS pressures for high-rise buildings (h > 60ft).
     * @param {object} inputs - The user inputs.
     * @param {object} intermediate_globals - Pre-calculated intermediate values (qz, G, etc.).
     * @returns {object} An object containing the directional results.
     */
    function calculateHighRisePressures(inputs, intermediate_globals) {
        const { mean_roof_height, building_length_L, building_width_B, roof_slope_deg } = inputs;
        const { qz, G, abs_gcpi } = intermediate_globals;
               const directional_results = {};

        // Wind perpendicular to L (Building Length is parallel to wind)
        const { cpMap: cp_map_L } = getAnalyticalCpValues(mean_roof_height, building_length_L, building_width_B, roof_slope_deg);
        directional_results['perp_to_L'] = Object.entries(cp_map_L).map(([surface, cp]) => ({
            surface, cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi), p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6, p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        // Wind perpendicular to B (Building Width is parallel to wind)
        const { cpMap: cp_map_B } = getAnalyticalCpValues(mean_roof_height, building_width_B, building_length_L, roof_slope_deg);
        directional_results['perp_to_B'] = Object.entries(cp_map_B).map(([surface, cp]) => ({
            surface, cp,
            p_pos: calculateDesignPressure(qz, qz, G, cp, abs_gcpi), p_neg: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi),
            p_pos_asd: calculateDesignPressure(qz, qz, G, cp, abs_gcpi) * 0.6, p_neg_asd: calculateDesignPressure(qz, qz, G, cp, -abs_gcpi) * 0.6
        }));

        return directional_results;
    }

    // --- PUBLIC API ---
    function run(inputs, validation) {
        let effective_standard = inputs.asce_standard;
        let v_input = inputs.basic_wind_speed;
        let v_unreduced = inputs.basic_wind_speed;
        let jurisdiction_note = "", temporary_structure_note = "";

        // Step 1: Force flexible analysis for tall buildings
        const is_high_rise = inputs.mean_roof_height > 60 && inputs.unit_system === 'imperial';
        if (is_high_rise) {
            inputs.building_flexibility = 'Flexible';
        }

        if (inputs.jurisdiction === "NYCBC 2022") {
            effective_standard = "ASCE 7-16";
            const risk_v_map = { "I": 110, "II": 117, "III": 127, "IV": 132 };
            v_input = risk_v_map[inputs.risk_category] || 117;
            v_unreduced = v_input;
            jurisdiction_note = `NYCBC 2022 wind speed of ${safeToFixed(v_input, 0)} mph for Risk Category ${inputs.risk_category} has been applied (Table 1609.3).`;
        }

        if (inputs.temporary_construction === "Yes") {
            v_input *= 0.8;
            const v_unit = inputs.unit_system === 'imperial' ? 'mph' : 'm/s';
            temporary_structure_note = `A 0.8 reduction factor has been applied for temporary construction (PROJECT-SPECIFIC ALLOWANCE, NOT ASCE 7). Calculation wind speed is ${safeToFixed(v_input, 1)} ${v_unit} (reduced from ${v_unreduced} ${v_unit}).`;
        }

        const [abs_gcpi, gcpi_ref] = getInternalPressureCoefficient(inputs.enclosure_classification);
        const [Kd, kd_ref] = getKdFactor(inputs.structure_type, inputs.asce_standard);
        const [Ke, ke_ref] = calculateKe(inputs.ground_elevation, inputs.unit_system, effective_standard);
        const { Kz, alpha, zg, ref_note: kz_ref } = calculateKz(inputs.mean_roof_height, inputs.exposure_category, inputs.unit_system); // Kz at roof height h
        const { qz, ref_note: qz_ref } = calculateVelocityPressure(Kz, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);
        const [Iw, iw_ref] = getImportanceFactor(inputs.risk_category, effective_standard); // Defensive destructuring
        const kzResult = calculateKz(inputs.mean_roof_height, inputs.exposure_category, inputs.unit_system);
        const Kz_val = kzResult.Kz || 1.0;
        const alpha_val = kzResult.alpha || 0;
        const zg_val = kzResult.zg || 0;
        const kz_ref_val = kzResult.ref_note || "Error: Kz calculation failed";
        
        const intermediate_for_G = { alpha, zg, Kz, Iw };
        const { G, ref: g_ref } = calculateGustEffectFactor({ ...inputs, V_in: v_input }, intermediate_for_G);

        const windResults = {
            inputs: { ...inputs, V_in: v_input, V_unreduced: v_unreduced, GCpi_abs: abs_gcpi, effective_standard: effective_standard, effective_wind_area: inputs.effective_wind_area },
            intermediate: { Kz, Kz_ref: kz_ref, Ke, ke_ref, qz, qz_ref, Kd, Kd_ref: kd_ref, GCpi_ref: gcpi_ref, alpha, zg, Iw, iw_ref },
            directional_results: {}, jurisdiction_note, temporary_structure_note, 
            warnings: validation.warnings, errors: validation.errors
        };

        // Add warning after results object is created
        if (is_high_rise) {
            windResults.warnings.push("Structure treated as 'Flexible' due to height > 60 ft.");
        }

        // --- Handle Open Signs as a special case ---
        if (inputs.structure_type === 'Open Signs/Frames') {
            const cf_options = {
                // FIX: Ensure all required options are passed to getOpenSignCf
                // The original call was missing these, which could lead to errors.
                member_shape: inputs.member_shape,
                V: v_input, // Use the jurisdictional/factored wind speed
                b: inputs.member_diameter,
                unit_system: inputs.unit_system
            };
            const { Cf, ref } = getOpenSignCf(inputs.solidity_ratio, cf_options);
            // Force F = qz * G * Cf * As (ASCE 7-16 Eq. 29.5-1)
            // The calculator outputs pressure, so we provide p = qz * G * Cf
            const pressure = qz * G * Cf;
            windResults.open_sign_results = {
                Cf, 
                ref,
                pressure,
                pressure_asd: pressure * 0.6
            };
            // Set a flag to indicate this is an open sign calculation
            windResults.is_open_sign = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        };

        // --- Handle Solid Freestanding Signs as a special case ---
        if (inputs.structure_type === 'Solid Freestanding Signs/Walls') {
            const h_sign = inputs.sign_height_s + inputs.clearance_z;
            // Calculate Kz at the centroid of the sign area
            const { Kz: Kz_sign } = calculateKz(inputs.clearance_z + inputs.sign_height_s / 2, inputs.exposure_category, inputs.unit_system);
            // Recalculate qz at the sign's centroid height
            const { qz: qz_sign } = calculateVelocityPressure(Kz_sign, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);

            const { CN, ref } = getSolidSignCn(inputs.sign_width_B, inputs.sign_height_s, h_sign);
            // Force F = qz * G * CN * As (ASCE 7-16 Eq. 29.3-1)
            // The calculator outputs pressure, so we provide p = qz * G * CN
            const pressure = qz_sign * G * CN;
            windResults.solid_sign_results = {
                CN, ref, pressure, pressure_asd: pressure * 0.6,
                h_sign, Kz_sign, qz_sign
            };
            windResults.is_solid_sign = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // --- Handle Chimneys, Tanks, and Similar Structures ---
        const chimney_types = ['Chimneys, Tanks (Square)', 'Chimneys, Tanks (Hexagonal)', 'Chimneys, Tanks (Octagonal)', 'Chimneys, Tanks (Round)'];
        if (chimney_types.includes(inputs.structure_type)) {
            const h_struct = inputs.chimney_height;
            // Calculate Kz and qz at the top of the structure (h)
            const { Kz: Kz_struct } = calculateKz(h_struct, inputs.exposure_category, inputs.unit_system);
            const { qz: qz_struct } = calculateVelocityPressure(Kz_struct, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);

            const shape = inputs.structure_type.match(/\(([^)]+)\)/)[1];
            const cf_options = {
                shape: shape, h: h_struct, D: inputs.chimney_diameter, qz: qz_struct,
                r: inputs.corner_radius_r, unit_system: inputs.unit_system
            };
            const { Cf, ref } = getChimneyCf(cf_options);
            // Force F = qz * G * Cf * A (ASCE 7-16 Eq. 29.4-1)
            // The calculator outputs pressure, p = qz * G * Cf, to be applied to the solid area Af.
            const pressure = qz_struct * G * Cf;
            windResults.chimney_results = {
                Cf, ref, pressure, pressure_asd: pressure * 0.6,
                h_struct, Kz_struct, qz_struct
            };
            windResults.is_chimney = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // --- Handle Trussed Towers ---
        const is_truss_tower = inputs.structure_type.includes('Trussed Towers');
        if (is_truss_tower) {
            // Calculate qz at the centroid of the tower (h/2)
            const { Kz: Kz_tower } = calculateKz(inputs.tower_height / 2, inputs.exposure_category, inputs.unit_system);
            const { qz: qz_tower } = calculateVelocityPressure(Kz_tower, inputs.topographic_factor_Kzt, Kd, Ke, v_input, effective_standard, inputs.risk_category, inputs.unit_system);

            const cf_options = {
                structure_type: inputs.structure_type,
                solidity_ratio: inputs.tower_solidity_ratio,
                member_shape: inputs.tower_member_shape
            };
            const { Cf, ref } = getTrussedTowerCf(cf_options);
            // Force F = qz * G * Cf * Af (ASCE 7-16 Eq. 29.6-1)
            // The calculator outputs pressure, p = qz * G * Cf, to be applied to the solid area Af.
            const pressure = qz_tower * G * Cf;
            windResults.truss_tower_results = {
                Cf, ref, pressure, pressure_asd: pressure * 0.6,
                Kz_tower, qz_tower
            };
            windResults.is_truss_tower = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // --- Handle Arched Roofs ---
        if (inputs.structure_type === 'Arched Roofs') {
            const cn_options = {
                r: inputs.arched_roof_rise,
                B: inputs.building_width_B, // Span is the width
                h: inputs.mean_roof_height, // Height to eave
                spring_point: inputs.arched_roof_spring_point
            };
            const { cnMap, ref } = getArchedRoofCn(cn_options);
            // Pressure p = qh * G * CN (ASCE 7-16 Eq. 27.3-3)
            windResults.arched_roof_results = {
                cnMap, ref,
                pressures: Object.fromEntries(Object.entries(cnMap).map(([zone, CN]) => [
                    zone, { CN, pressure: qz * G * CN, pressure_asd: qz * G * CN * 0.6 }
                ]))
            };
            windResults.is_arched_roof = true;
            // Return early as the building-specific logic does not apply.
            return windResults;
        }

        // Handle Open Buildings separately as they use Net Pressure Coefficients (CN)
        if (inputs.enclosure_classification === 'Open') {
            // Step 3: Differentiate between low-rise and high-rise open buildings
            if (is_high_rise) {
                // --- New logic for Rooftop Structures on High-Rise Buildings ---
                const { GCrh, GCrv, ref } = getRooftopStructureCoefficients(inputs);

                // This was a key missing piece. The logic now correctly calculates pressures
                // for rooftop structures on high-rise open buildings, which was previously
                // falling through and causing empty results.

                // The formula is P = qh * (GCr). The Gust Effect Factor is included in GCr.
                const p_horizontal = qz * GCrh;
                const p_vertical_uplift = qz * GCrv;

                windResults.directional_results['rooftop_structure'] = [
                    { surface: "Horizontal Drag Force Pressure", pressure: p_horizontal, pressure_asd: p_horizontal * 0.6, GCr: GCrh },
                    { surface: "Vertical Uplift Force Pressure", pressure: p_vertical_uplift, pressure_asd: p_vertical_uplift * 0.6, GCr: GCrv }
                ];
                windResults.open_building_ref = ref;

            } else { // Low-Rise Open Buildings
                // --- Existing logic for Low-Rise Open Buildings ---
                if (['flat', 'monoslope', 'pitched_troughed'].includes(inputs.roof_type)) {
                    const { cnMap, ref } = getOpenBuildingCnValues(inputs.roof_slope_deg, inputs.wind_obstruction === 'obstructed', inputs.roof_type);
                    windResults.directional_results['open_roof'] = Object.entries(cnMap).map(([surface, cn_vals]) => {
                        const p_pos = qz * G * cn_vals.cn_pos;
                        const p_neg = qz * G * cn_vals.cn_neg;
                        return { surface, cp: null, cn_pos: cn_vals.cn_pos, cn_neg: cn_vals.cn_neg, p_pos, p_neg, p_pos_asd: p_pos * 0.6, p_neg_asd: p_neg * 0.6 };
                    });
                    windResults.open_building_ref = ref;
                } else {
                    windResults.warnings.push("For Low-Rise Open buildings, only 'Flat', 'Monoslope', and 'Pitched/Troughed' roof types are currently supported.");
                }
            }
            return windResults;
        }

        const intermediate_globals = { Kzt: inputs.topographic_factor_Kzt, Kd, Ke, V_in: v_input, effective_standard, abs_gcpi, G, qz };
        const is_tall_building = inputs.mean_roof_height > (inputs.unit_system === 'imperial' ? 60 : 18.3);

        if (is_tall_building) {
            windResults.mwfrs_method = "Analytical Procedure (All Heights)";
            windResults.directional_results = calculateHighRisePressures(inputs, intermediate_globals);
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        } else { // Low-Rise Building
            windResults.mwfrs_method = "Directional Procedure (Low-Rise)";
            windResults.directional_results = calculateLowRisePressures(inputs, intermediate_globals);
            windResults.heightVaryingResults_L = null;
        }

        // Conditionally nullify the height-varying results if the user has opted out.
        // This check is performed after the main logic to allow the option to apply to both tall and potentially low-rise buildings if ever enabled.
        if (inputs.calculate_height_varying_pressure === 'No') {
            windResults.heightVaryingResults_L = null;
        } else if (is_tall_building && !windResults.heightVaryingResults_L) {
            // If it's a tall building and the user wants the calculation, it should have been done already.
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        } else if (!is_tall_building && inputs.calculate_height_varying_pressure === 'Yes') {
            // For low-rise, only calculate if explicitly requested.
            windResults.heightVaryingResults_L = calculateHeightVaryingPressures(inputs, intermediate_globals);
        }

        // Calculate C&C pressures
        const candc_results = calculateCandCPressuresEnhanced(inputs, qz, abs_gcpi);
        windResults.candc = candc_results;
        if (candc_results.warnings && candc_results.warnings.length > 0) {
            windResults.warnings.push(...candc_results.warnings);
        }

        // Torsional Load Case (ASCE 7-16/22 Fig 27.4-8, Case 2)
        // Applies to enclosed and partially enclosed low-rise buildings
        if (!is_tall_building && ["Enclosed", "Partially Enclosed"].includes(inputs.enclosure_classification)) {
            const results_L = windResults.directional_results['perp_to_L'];
            const results_B = windResults.directional_results['perp_to_B'];
            
            // Only proceed with torsional calculations if both directional results are available.
            if (results_L && results_B) {
                const cp_map_L = Object.fromEntries(results_L.map(r => [r.surface, r.cp]));
                const cp_map_B = Object.fromEntries(results_B.map(r => [r.surface, r.cp]));

                // Wind perpendicular to L (acting on face B)
                const p_ww_L = qz * G * (cp_map_L["Windward Wall"] || 0);
                const p_lw_L = qz * G * (cp_map_L["Leeward Wall"] || 0);
                const F_ww_L = p_ww_L * (inputs.building_width_B * inputs.mean_roof_height);
                const F_lw_L = p_lw_L * (inputs.building_width_B * inputs.mean_roof_height);
                const Mt_L = 0.75 * (Math.abs(F_ww_L) + Math.abs(F_lw_L)) * (0.15 * inputs.building_width_B);

                // Wind perpendicular to B (acting on face L)
                const p_ww_B = qz * G * (cp_map_B["Windward Wall"] || 0);
                const p_lw_B = qz * G * (cp_map_B["Leeward Wall"] || 0);
                const F_ww_B = p_ww_B * (inputs.building_length_L * inputs.mean_roof_height);
                const F_lw_B = p_lw_B * (inputs.building_length_L * inputs.mean_roof_height);
                const Mt_B = 0.75 * (Math.abs(F_ww_B) + Math.abs(F_lw_B)) * (0.15 * inputs.building_length_L);
                
                windResults.torsional_case = {
                    perp_to_L: { Mt: Mt_L, note: "Apply with 75% of Case 1 wall pressures." },
                    perp_to_B: { Mt: Mt_B, note: "Apply with 75% of Case 1 wall pressures." }
                };
            }
        }

        return windResults;
    }

    return { run };
})();

/**
 * Gathers all wind-related inputs from the DOM.
 * @returns {object} An object containing all the input values.
 */
function gatherWindInputs() {
    return gatherInputsFromIds(windInputIds);
}

/**
 * Validates the gathered wind inputs against a set of rules.
 * @param {object} inputs - The input values to validate.
 * @returns {object} An object containing arrays of errors and warnings.
 */
function validateWindInputs(inputs) {
    const { errors, warnings } = validateInputs(inputs, validationRules.wind, 'wind.js');

    // Add specific, inter-dependent validation logic here
    if (['gable', 'hip'].includes(inputs.roof_type) && inputs.roof_slope_deg > 45) {
        errors.push("Gable/hip roof slope must be <= 45° for this calculator's implementation of ASCE 7 Fig 27.3-2.");
    }
    const isImperial = inputs.unit_system === 'imperial';
    const vRange = isImperial ? [85, 200] : [38, 90];
    if (inputs.basic_wind_speed < vRange[0] || inputs.basic_wind_speed > vRange[1]) {
        warnings.push(`Wind speed ${inputs.basic_wind_speed} ${isImperial ? 'mph' : 'm/s'} is outside the typical ASCE 7 range (${vRange[0]}-${vRange[1]}).`);
    }

    return { errors, warnings };
}

/**
 * Executes the core wind load calculation logic.
 * @param {object} inputs - The validated input values.
 * @param {object} validation - The validation object, which may contain warnings to be passed through.
 * @returns {object} The complete results object from the calculation.
 */
function performWindCalculation(inputs, validation) { // This function was missing in the original context
    try {
        return windLoadCalculator.run(inputs, validation);
    } catch (error) {
        console.error('An unexpected error occurred during the wind calculation.', error);
        return { errors: ['An unexpected error occurred during the wind calculation. Check console for details.'], warnings: [] };
    }
}

function renderRoofPressureChart(canvasId, pressureData, building_dimension, design_method, units) { // This function was missing in the original context
    const factor = design_method === 'ASD' ? 0.6 : 1.0;
    const labels = pressureData.map(p => safeToFixed(p.distance, 1));
    const data = pressureData.map(p => safeToFixed(p.p_neg * factor, 2));

    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') {
        console.warn('Chart.js not available or canvas not found');
        if (ctx) ctx.parentElement.innerHTML = `<div class="text-center text-red-500">Chart.js library not loaded.</div>`;
        return;
    }

    try {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `Roof Suction (${units.p_unit})`,
                    data: data,
                    borderColor: '#3b82f6', // blue-500
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Pressure Distribution (Length: ${building_dimension} ${units.h_unit})`
                    },
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: `Distance from Windward Edge (${units.h_unit})` }
                    },
                    y: {
                        title: { display: true, text: `Pressure (${units.p_unit})` }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Chart.js initialization failed:', error);
        ctx.parentElement.innerHTML = `<div class="text-center text-red-500">Chart could not be rendered.</div>`;
    }
}

function generateCandCDiagram(inputs, candc) { // This function was missing in the original context
    if (!candc || !candc.applicable) return '';

    const { mean_roof_height: h, building_length_L: L, building_width_B: B, roof_type, roof_slope_deg, unit_system } = inputs;
    const h_unit = unit_system === 'imperial' ? 'ft' : 'm';
    const is_high_rise = candc.is_high_rise;

    // Calculate 'a' for zone dimensions
    const least_dim = Math.min(L, B);
    let a = Math.min(0.1 * least_dim, 0.4 * h);
    const min_a_val = unit_system === 'imperial' ? 3.0 : 0.9;
    a = Math.max(a, 0.04 * least_dim, min_a_val);

    const a_val_str = safeToFixed(a, 1);
    const a_str = `a = ${a_val_str} ${h_unit}`;

    let roof_diagram = '';
    let wall_diagram = '';

    // --- Wall Diagram (Elevation) ---
    const wall_zone_5_label = is_high_rise ? "Zone 5" : "Zone 5 (Corners)";
    const wall_zone_4_label = is_high_rise ? "Zone 4" : "Zone 4 (Interior)";
    wall_diagram = `
        <div class="diagram my-4">
            <div class="max-w-sm mx-auto">
                <h4 class="text-center font-semibold text-sm mb-2">Wall C&C Zones (Elevation)</h4>
                <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                    <!-- Building Outline -->
                    <rect x="50" y="50" width="300" height="120" class="svg-member" />
                    <!-- Zone 5 -->
                    <rect x="50" y="50" width="${a_val_str}" height="120" fill="#ef4444" opacity="0.5" />
                    <rect x="${350 - a_val_str}" y="50" width="${a_val_str}" height="120" fill="#ef4444" opacity="0.5" />
                    <!-- Zone 4 -->
                    <rect x="${50 + parseFloat(a_val_str)}" y="50" width="${300 - 2 * a_val_str}" height="120" fill="#facc15" opacity="0.5" />
                    <!-- Labels -->
                    <text x="200" y="110" class="svg-label" text-anchor="middle">${wall_zone_4_label}</text>
                    <text x="${50 + a_val_str / 2}" y="80" class="svg-label" text-anchor="middle">${wall_zone_5_label}</text>
                    <text x="${350 - a_val_str / 2}" y="80" class="svg-label" text-anchor="middle">${wall_zone_5_label}</text>
                    <!-- Dimension 'a' -->
                    <line x1="50" y1="180" x2="${50 + a_val_str}" y2="180" class="svg-dim" />
                    <text x="${50 + a_val_str / 2}" y="190" class="svg-dim-text">${a_str}</text>
                </svg>
            </div>
        </div>`;

    // --- Roof Diagram (Plan View) ---
    const roof_zone_3_label = is_high_rise ? "Zone 3'" : "Zone 3 (Corners)";
    const roof_zone_2_label = is_high_rise ? "Zone 2'" : "Zone 2 (Edges)";
    const roof_zone_1_label = is_high_rise ? "Zone 1'" : "Zone 1 (Interior)";

    if (roof_type === 'flat' || (['gable', 'hip'].includes(roof_type) && roof_slope_deg <= 7)) {
        let hip_zones = '';
        if (roof_type === 'hip') {
            hip_zones = `
                <path d="M50 50 L 150 100 L 50 150 Z" fill="#9333ea" opacity="0.5" />
                <path d="M350 50 L 250 100 L 350 150 Z" fill="#9333ea" opacity="0.5" />
                <text x="100" y="105" class="svg-label" text-anchor="middle">End Zones</text>
                <text x="300" y="105" class="svg-label" text-anchor="middle">End Zones</text>
            `;
        }
        roof_diagram = `
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <h4 class="text-center font-semibold text-sm mb-2">Roof C&C Zones (Plan View)</h4>
                    <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <!-- Base Roof -->
                        <rect x="50" y="50" width="300" height="100" class="svg-member" />
                        <!-- Zone 1 -->
                        <rect x="${50 + parseFloat(a_val_str)}" y="${50 + parseFloat(a_val_str)}" width="${300 - 2 * a_val_str}" height="${100 - 2 * a_val_str}" fill="#4ade80" opacity="0.5" />
                        <!-- Zone 2 -->
                        <path d="M50 50 h 300 v 100 h -300 z M ${50 + parseFloat(a_val_str)} ${50 + parseFloat(a_val_str)} v ${100 - 2 * a_val_str} h ${300 - 2 * a_val_str} v -${100 - 2 * a_val_str} z" fill-rule="evenodd" fill="#facc15" opacity="0.5" />
                        <!-- Zone 3 -->
                        <path d="M50 50 h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M${350 - a_val_str} 50 h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M50 ${150 - a_val_str} h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        <path d="M${350 - a_val_str} ${150 - a_val_str} h ${a_val_str} v ${a_val_str} h -${a_val_str} z" fill="#ef4444" opacity="0.5" />
                        ${hip_zones}
                        <!-- Labels -->
                        <text x="200" y="105" class="svg-label" text-anchor="middle">${roof_zone_1_label}</text>
                        <text x="200" y="70" class="svg-label" text-anchor="middle">${roof_zone_2_label}</text>
                        <text x="80" y="70" class="svg-label" text-anchor="middle">${roof_zone_3_label}</text>
                    </svg>
                </div>
            </div>`;
    } else if (['gable', 'hip'].includes(roof_type)) { // Steep slope
        const ridge_line = roof_type === 'gable' ? `<line x1="50" y1="100" x2="350" y2="100" stroke-dasharray="4 2" class="svg-dim" />` : `<line x1="150" y1="100" x2="250" y2="100" stroke-dasharray="4 2" class="svg-dim" />`;
        const hip_lines = roof_type === 'hip' ? `<line x1="50" y1="50" x2="150" y2="100" class="svg-dim" /><line x1="50" y1="150" x2="150" y2="100" class="svg-dim" /><line x1="350" y1="50" x2="250" y2="100" class="svg-dim" /><line x1="350" y1="150" x2="250" y2="100" class="svg-dim" />` : '';
        roof_diagram = `
            <div class="diagram my-4">
                <div class="max-w-sm mx-auto">
                    <h4 class="text-center font-semibold text-sm mb-2">Roof C&C Zones (Plan View, Slope > 7°</h4>
                    <svg viewBox="0 0 400 200" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
                        <rect x="50" y="50" width="300" height="100" class="svg-member" />
                        ${ridge_line} ${hip_lines}
                        <!-- Zones -->
                        <rect x="${50 + parseFloat(a_val_str)}" y="50" width="${300 - 2 * a_val_str}" height="100" fill="#4ade80" opacity="0.5" />
                        <path d="M50 50 h 300 v 100 h -300 z M ${50 + parseFloat(a_val_str)} 50 v 100 h ${300 - 2 * a_val_str} v -100 z" fill-rule="evenodd" fill="#facc15" opacity="0.5" />
                        <rect x="50" y="50" width="${a_val_str}" height="100" fill="#ef4444" opacity="0.5" />
                        <rect x="${350 - a_val_str}" y="50" width="${a_val_str}" height="100" fill="#ef4444" opacity="0.5" />
                        <!-- Labels -->
                        <text x="200" y="105" class="svg-label" text-anchor="middle">${roof_zone_1_label}</text>
                        <text x="${50 + a_val_str + (300 - 2 * a_val_str) / 2}" y="70" class="svg-label" text-anchor="middle" transform="rotate(-15 200 70)">${roof_zone_2_label}</text>
                        <text x="${50 + a_val_str / 2}" y="105" class="svg-label" text-anchor="middle">${roof_zone_3_label}</text>
                    </svg>
                </div>
            </div>`;
    }

    return `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${wall_diagram}${roof_diagram}</div>`;
}

/**
 * Renders the MWFRS (Main Wind Force Resisting System) section.
 */
function renderMwfrsSection(directional_results, inputs, intermediate, mwfrs_method, units) {
  const { p_unit } = units;
  const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
  
  let html = `<div id="mwfrs-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">3. MWFRS Design Pressures (${mwfrs_method})</h3>
                  <button data-copy-target-id="mwfrs-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">`;

  // Wind Perpendicular to L
  if (directional_results.perp_to_L) {
    html += `<h4 class="font-semibold text-lg mt-4 mb-2">Wind Perpendicular to Building Length (L)</h4>`;
    html += '<ul class="list-disc list-inside dark:text-gray-300 mb-6">';
    directional_results.perp_to_L.forEach(result => {
      const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
      const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
      html += `<li>${sanitizeHTML(result.surface)}: Cp = ${safeToFixed(result.cp, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  }

  // Wind Perpendicular to B
  if (directional_results.perp_to_B) {
    html += `<h4 class="font-semibold text-lg mt-4 mb-2">Wind Perpendicular to Building Width (B)</h4>`;
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.perp_to_B.forEach(result => {
      const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
      const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
      html += `<li>${sanitizeHTML(result.surface)}: Cp = ${safeToFixed(result.cp, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  }

  html += `</div></div>`;
  return html;
}

function renderOpenBuildingResults(directional_results, open_building_ref, inputs, units) {
  const { p_unit } = units;
  const factor = inputs.design_method === 'ASD' ? 0.6 : 1.0;
  
  let html = `<div id="open-building-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">3. Open Building Net Pressures</h3>
                  <button data-copy-target-id="open-building-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">
                <p class="text-sm text-center text-gray-500 dark:text-gray-400 mb-4">
                  Reference: ${sanitizeHTML(open_building_ref || 'ASCE 7 Ch. 27/29')}
                </p>`;

  // Check if this is rooftop structure data (high-rise open building)
  if (directional_results.rooftop_structure) {
    html += '<p class="mb-2">· Formula: p = q<sub>h</sub> × GCr</p>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.rooftop_structure.forEach(result => {
      const pressure = inputs.design_method === 'ASD' ? result.pressure_asd : result.pressure;
      html += `<li>${sanitizeHTML(result.surface)}: GCr = ${safeToFixed(result.GCr, 2)}, Design Pressure = ${safeToFixed(pressure, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  } else if (directional_results.open_roof) {
    // Low-rise open building
    html += '<p class="mb-2">· Formula: p = q<sub>h</sub> × G × CN</p>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    directional_results.open_roof.forEach(result => {
      const p_pos = inputs.design_method === 'ASD' ? result.p_pos_asd : result.p_pos;
      const p_neg = inputs.design_method === 'ASD' ? result.p_neg_asd : result.p_neg;
      html += `<li>${sanitizeHTML(result.surface)}: CN (+) = ${safeToFixed(result.cn_pos, 2)}, CN (-) = ${safeToFixed(result.cn_neg, 2)}, Pressure (+) = ${safeToFixed(p_pos, 2)} ${p_unit}, Pressure (-) = ${safeToFixed(p_neg, 2)} ${p_unit}</li>`;
    });
    html += '</ul>';
  }

  html += `</div></div>`;
  return html;
}

function renderCandCSection(candc, inputs, units, directional_results) {
  if (!candc || !candc.applicable) return '';
  const { is_imp, p_unit } = units;
  let html = `<div id="candc-section" class="mt-6 report-section-copyable">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="report-header flex-grow">6. Components & Cladding (C&C) Pressures</h3>
                  <button data-copy-target-id="candc-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content">
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Calculated for Effective Wind Area A = ${sanitizeHTML(inputs.effective_wind_area)} ${is_imp ? 'ft²' : 'm²'}. Reference: ${sanitizeHTML(candc.ref)}.
                </p>
                ${generateCandCDiagram(inputs, candc)}`;

  if (candc.is_high_rise) {
    html += '<h4 class="font-semibold text-lg mb-2">High-Rise C&C Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    for (const zone in candc.pressures) {
      const data = candc.pressures[zone];
      const p_pos_lrfd = data.p_pos;
      const p_neg_lrfd = data.p_neg;
      const p_pos_asd = p_pos_lrfd * 0.6;
      const p_neg_asd = p_neg_lrfd * 0.6;
      html += `<li>${sanitizeHTML(zone)}: GCp (+) = ${safeToFixed(data.gcp_pos, 2)}, GCp (-) = ${safeToFixed(data.gcp_neg, 2)}, LRFD Pressure (+ / -) = ${safeToFixed(p_pos_lrfd, 2)} / ${safeToFixed(p_neg_lrfd, 2)} ${p_unit}, ASD Pressure (+ / -) = ${safeToFixed(p_pos_asd, 2)} / ${safeToFixed(p_neg_asd, 2)} ${p_unit}</li>`;
    }
    html += '</ul>';
  } else {
    html += '<h4 class="font-semibold text-lg mb-2">Low-Rise C&C Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    for (const zone in candc.pressures) {
      const data = candc.pressures[zone];
      const pressure = inputs.design_method === 'ASD' ? data.p_neg * 0.6 : data.p_neg;
      html += `<li>${sanitizeHTML(zone)}: GCp = ${safeToFixed(data.gcp, 2)}, Design Pressure (${inputs.design_method}) = ${safeToFixed(pressure, 2)} ${p_unit}</li>`;
    }
    html += '</ul>';
  }
  html += `</div></div>`;
  return html;
}

function renderTorsionalCase(torsional_case, inputs, units) {
  if (!torsional_case) return '';
  
  const { h_unit } = units;
  const M_unit = inputs.unit_system === 'imperial' ? 'lb-ft' : 'N-m';
  
  let html = '<div id="torsional-section" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">5. Torsional Load Case</h3>';
  html += '<button data-copy-target-id="torsional-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  html += '<p class="text-sm text-gray-500 dark:text-gray-400 mb-4">Torsional moment per ASCE 7 Figure 27.4-8, Case 2. Apply with 75% of Case 1 wall pressures.</p>';
  html += '<ul class="list-disc list-inside dark:text-gray-300">';
  
  if (torsional_case.perp_to_L) {
    html += `<li>Wind Direction: Perpendicular to L, Torsional Moment M<sub>t</sub> = ${safeToFixed(torsional_case.perp_to_L.Mt, 0)} ${M_unit}, Eccentricity = 0.15 × B = ${safeToFixed(0.15 * inputs.building_width_B, 2)} ${h_unit}</li>`;
  }
  
  if (torsional_case.perp_to_B) {
    html += `<li>Wind Direction: Perpendicular to B, Torsional Moment M<sub>t</sub> = ${safeToFixed(torsional_case.perp_to_B.Mt, 0)} ${M_unit}, Eccentricity = 0.15 × L = ${safeToFixed(0.15 * inputs.building_length_L, 2)} ${h_unit}</li>`;
  }
  
  html += '</ul>';
  html += '</div></div>';
  return html;
}

function generateWindSummary(inputs, directional_results, candc, p_unit) {
  let html = '<div id="wind-summary" class="mt-6 report-section-copyable">';
  html += '<div class="flex justify-between items-center mb-4">';
  html += '<h3 class="report-header flex-grow">Summary of Key Pressures</h3>';
  html += '<button data-copy-target-id="wind-summary" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>';
  html += '</div>';
  html += '<div class="copy-content">';
  
  // MWFRS Governing Pressures
  if (directional_results && (directional_results.perp_to_L || directional_results.perp_to_B)) {
    let max_ww = -Infinity, min_ww = Infinity;
    let max_lw = -Infinity, min_lw = Infinity;
    
    const allResults = [
        ...(directional_results.perp_to_L || []),
        ...(directional_results.perp_to_B || [])
    ];
    
    allResults.forEach(r => {
        const p_pos = inputs.design_method === 'ASD' ? r.p_pos_asd : r.p_pos;
        const p_neg = inputs.design_method === 'ASD' ? r.p_neg_asd : r.p_neg;
        
        if (r.surface.includes('Windward Wall')) {
            max_ww = Math.max(max_ww, p_pos);
            min_ww = Math.min(min_ww, p_neg);
        }
        if (r.surface.includes('Leeward Wall')) {
            max_lw = Math.max(max_lw, p_pos);
            min_lw = Math.min(min_lw, p_neg);
        }
    });
    
    html += '<h4 class="font-semibold text-lg mb-2">MWFRS Governing Pressures</h4>';
    html += '<ul class="list-disc list-inside mb-4 dark:text-gray-300">';
    if (isFinite(max_ww)) html += `<li>Windward Wall: ${safeToFixed(max_ww, 2)} to ${safeToFixed(min_ww, 2)} ${p_unit}</li>`;
    if (isFinite(max_lw)) html += `<li>Leeward Wall: ${safeToFixed(max_lw, 2)} to ${safeToFixed(min_lw, 2)} ${p_unit}</li>`;
    html += '</ul>';
  }
  
  // C&C Summary
  if (candc && candc.applicable && candc.pressures) {
    let max_candc = -Infinity, min_candc = Infinity;
    
    for (const data of Object.values(candc.pressures)) {
      const p_pos = inputs.design_method === 'ASD' ? (data.p_pos || 0) * 0.6 : (data.p_pos || 0);
      const p_neg = inputs.design_method === 'ASD' ? (data.p_neg || 0) * 0.6 : (data.p_neg || 0);
      max_candc = Math.max(max_candc, p_pos);
      min_candc = Math.min(min_candc, p_neg);
    }
    
    html += '<h4 class="font-semibold text-lg mb-2">C&C Governing Pressures</h4>';
    html += '<ul class="list-disc list-inside dark:text-gray-300">';
    html += `<li>Maximum: ${safeToFixed(max_candc, 2)} ${p_unit}</li>`;
    html += `<li>Minimum (Suction): ${safeToFixed(min_candc, 2)} ${p_unit}</li>`;
    html += '</ul>';
  }
  
  html += '</div></div>';
  return html;
}

// =================================================================================
//  UI INJECTION & INITIALIZATION
// =================================================================================
document.addEventListener('DOMContentLoaded', () => {    
    // 1. Create the main calculation handler first, so it's available to other functions.
    const handleRunWindCalculation = createCalculationHandler({
        inputIds: windInputIds,
        storageKey: 'wind-calculator-inputs',
        validatorFunction: validateWindInputs,
        calculatorFunction: windLoadCalculator.run,
        renderFunction: renderWindResults,
        resultsContainerId: 'results-container',
        feedbackElId: 'feedback-message', // Explicitly pass feedback element ID
        buttonId: 'run-calculation-btn'
    });

    // --- EVENT HANDLERS ---
    function attachEventListeners() {
        document.getElementById('mean_roof_height').addEventListener('input', (event) => {
            const h = parseFloat(event.target.value) || 0;
            const is_imp = document.getElementById('unit_system').value === 'imperial';
            const limit = is_imp ? 60 : 18.3;
            document.getElementById('tall-building-section').classList.toggle('hidden', h <= limit);
        });

        // Create file-based handlers
        const handleSaveWindInputs = createSaveInputsHandler(windInputIds, 'wind-inputs.txt');
        const handleLoadWindInputs = createLoadInputsHandler(windInputIds, handleRunWindCalculation);

        // Attach handlers to buttons
        document.getElementById('run-calculation-btn').addEventListener('click', handleRunWindCalculation);
        document.getElementById('save-inputs-btn').addEventListener('click', handleSaveWindInputs);
        document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('wind-file-input'));
        document.getElementById('wind-file-input').addEventListener('change', (e) => handleLoadWindInputs(e));

        document.body.addEventListener('click', async (event) => {
            const copyBtn = event.target.closest('.copy-section-btn');
            if (copyBtn) {
                const targetId = copyBtn.dataset.copyTargetId;
                if (targetId) {
                    await handleCopyToClipboard(targetId, 'feedback-message');
                }
            }
            if (event.target.id === 'copy-report-btn') {
                await handleCopyToClipboard('wind-report-content', 'feedback-message');
            }
            if (event.target.id === 'send-to-combos-btn' && lastWindRunResults) {
                sendWindToCombos(lastWindRunResults);
            }
            if (event.target.id === 'print-report-btn') {
                window.print();
            }
            if (event.target.id === 'download-pdf-btn') {
                handleDownloadPdf('wind-report-content', 'Wind-Load-Report.pdf');
            }
            if (event.target.id === 'download-word-btn') {
                handleDownloadWord('wind-report-content', 'Wind-Load-Report.doc');
            }
            const button = event.target.closest('.toggle-details-btn');
            if (button) {
                const detailId = button.dataset.toggleId;
                const detailRow = document.getElementById(detailId);
                if (detailRow) {
                    detailRow.classList.toggle('is-visible');
                    button.textContent = detailRow.classList.contains('is-visible') ? '[Hide]' : '[Show]';
                }
            }
        });
    }

    // 3. Define the main app initialization function.
    function initializeApp() {
        initializeSharedUI();
        attachEventListeners();
        addRangeIndicators();
        // Use a small timeout to ensure all elements are ready before triggering a calculation from localStorage
        setTimeout(() => {
            loadInputsFromLocalStorage('wind-calculator-inputs', windInputIds);
        }, 100);
    }

    // 4. Run the app.
    initializeApp();    
}); // END DOMContentLoaded

// =================================================================================
//  WIND LOAD CALCULATOR LOGIC
// =================================================================================

const windLoadCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
// Internal pressure coefficient GCpi
// Reference: ASCE 7-16/22 Table 26.13-1
function getInternalPressureCoefficient(enclosureClass) {
        const map = {
            "Enclosed": [0.18, "ASCE 7 Table 26.13-1 (Enclosed)"],
            "Partially Enclosed": [0.55, "ASCE 7 Table 26.13-1 (Partially Enclosed)"],
            "Open": [0.00, "ASCE 7 Table 26.13-1 (Open)"]
        };
        return map[enclosureClass] || [0.00, "Invalid Enclosure"];
    }

    /**
     * Calculates the net force coefficient (Cf) for open signs and lattice frameworks.
     * Reference: ASCE 7-16/22 Figure 29.5-1
     * @param {number} solidity_ratio - The ratio of solid area to gross area (ε).
     * @param {object} options - An object containing member_shape, V (wind speed), b (diameter), and unit_system.
     * @returns {{Cf: number, ref: string}}
     */
    function getOpenSignCf(solidity_ratio, options) {
        const { member_shape, V, b, unit_system } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0)); // Clamp between 0 and 1

        if (member_shape === 'flat') {
            // Interpolate for flat-sided members from Figure 29.5-1
            const cf = interpolate(epsilon, [0.1, 0.3, 0.5, 1.0], [1.8, 1.7, 1.6, 2.0]);
            return { Cf: cf, ref: "ASCE 7 Fig. 29.5-1 (Flat Members)" };
        } else { // 'round' members
            // For round members, Cf depends on V*sqrt(b) and epsilon.
            // V must be in ft/s and b in ft.
            const V_fps = unit_system === 'imperial' ? V * 1.467 : V * 3.281;
            const b_ft = unit_system === 'imperial' ? b : b * 3.281;
            const V_sqrt_b = V_fps * Math.sqrt(b_ft);

            // Interpolation data from ASCE 7-16 Fig 29.5-1 for round members
            const epsilon_points = [0.1, 0.3, 0.5, 1.0];
            const cf_low_reynolds = [0.7, 0.8, 0.8, 1.2]; // For V*sqrt(b) < 2.5
            const cf_high_reynolds = [1.2, 1.3, 1.3, 1.5]; // For V*sqrt(b) >= 2.5

            const cf_values = (V_sqrt_b < 2.5) ? cf_low_reynolds : cf_high_reynolds;
            const cf = interpolate(epsilon, epsilon_points, cf_values);
            return { Cf: cf, ref: `ASCE 7 Fig. 29.5-1 (Round, V√b=${safeToFixed(V_sqrt_b, 1)})` };
        }
    }

    /**
     * Calculates the net pressure coefficient (CN) for solid freestanding signs.
     * Reference: ASCE 7-16/22 Figure 29.3-1
     * @param {number} B - Width of the sign.
     * @param {number} s - Height of the sign.
     * @param {number} h - Height to the top of the sign.
     * @returns {{CN: number, ref: string}}
     */
    function getSolidSignCn(B, s, h) {
        if (!isFinite(B) || !isFinite(s) || !isFinite(h)) {
            return { CN: 0, ref: "Invalid dimensions for Solid Sign" };
        }

        const M = s > 0 ? B / s : 0;
        const s_over_h = h > 0 ? s / h : 0;

        // Interpolation data from ASCE 7-16 Fig 29.3-1
        const M_points = [0.25, 1, 2, 4, 10, 20, 40];
        const CN_at_s_over_h_1 = [1.2, 1.2, 1.25, 1.3, 1.4, 1.5, 1.6];
        const CN_at_s_over_h_0 = [1.8, 1.85, 1.9, 1.9, 1.95, 1.95, 2.0];

        const CN = interpolate(M, M_points, s_over_h < 0.5 ? CN_at_s_over_h_0 : CN_at_s_over_h_1);
        return { CN, ref: `ASCE 7 Fig. 29.3-1 (M=${safeToFixed(M, 2)}, s/h=${safeToFixed(s_over_h, 2)})` };
    }

    /**
     * Returns the net pressure coefficients (GCr) for rooftop structures on buildings with h > 60ft.
     * This function now correctly uses Figure 29.5-1 for open lattice frameworks (like scaffolds)
     * and falls back to a solid coefficient for other cases.
     * @param {object} inputs - The main user inputs object.
     * @returns {{GCrh: number, GCrv: number, ref: string}} Object with horizontal and vertical coefficients.
     */
    function getRooftopStructureCoefficients(inputs) {
        const { scaffold_width_Br, scaffold_height_hr, solidity_ratio, member_shape, V_in, unit_system } = inputs;

        if (!isFinite(scaffold_width_Br) || scaffold_width_Br <= 0 || !isFinite(scaffold_height_hr) || scaffold_height_hr <= 0) {
            return { GCrh: 0, GCrv: 0, ref: "Invalid rooftop structure dimensions" };
        }

        // --- CORRECTED LOGIC for Open Lattice Frameworks (Scaffolds) ---
        // Use getOpenSignCf which implements ASCE 7-16 Fig 29.5-1
        const cf_options = {
            member_shape: member_shape,
            V: V_in,
            b: 1.0, // Assume a typical member size of 1ft for Reynolds number check, as it's not a primary input here.
            unit_system: unit_system
        };
        const { Cf, ref } = getOpenSignCf(solidity_ratio, cf_options);
        const GCrh = Cf; // For open frameworks, the force coefficient is Cf.

        // Vertical uplift for open frames is generally smaller. 1.5 is a conservative value for solid objects.
        // A value of 0.8 is more reasonable for open frames, though code is less explicit.
        const GCrv = 1.5; // Coefficient for vertical force (uplift)

        return { GCrh, GCrv, ref };
    }


    /**
     * Calculates the net force coefficient (Cf) for chimneys, tanks, and similar structures.
     * Reference: ASCE 7-16/22 Figure 29.4-1
     * @param {object} options - An object containing shape, h, D, qz, r, and unit_system.
     * @returns {{Cf: number, ref: string}}
     */
    function getChimneyCf(options) {
        const { shape, h, D, qz, r, unit_system } = options;
        if (D <= 0 || h <= 0) return { Cf: 0, ref: "Invalid dimensions" };

        const h_over_D = h / D;
        const h_D_points = [1, 7, 25];
        let cf_values;

        switch (shape) {
            case 'Square':
                const r_over_D = r / D;
                cf_values = (r_over_D >= 0.05)
                    ? [1.0, 1.1, 1.2] // Rounded
                    : [1.3, 1.4, 2.0]; // Sharp
                const Cf_sq = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_sq, ref: `ASCE 7 Fig. 29.4-1 (Square, r/D=${safeToFixed(r_over_D, 2)})` };

            case 'Hexagonal':
            case 'Octagonal':
                cf_values = [1.0, 1.2, 1.4];
                const Cf_hex = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_hex, ref: `ASCE 7 Fig. 29.4-1 (${shape})` };

            case 'Round':
                // D must be in ft and qz in psf for the D*sqrt(qz) parameter.
                const D_ft = unit_system === 'imperial' ? D : D * 3.281;
                const qz_psf = unit_system === 'imperial' ? qz : qz * 0.020885;
                const D_sqrt_qz = D_ft * Math.sqrt(qz_psf);

                if (D_sqrt_qz < 2.5) { // Moderately smooth, subcritical
                    cf_values = [0.5, 0.6, 0.7];
                } else { // Rough or supercritical
                    cf_values = [0.7, 0.8, 0.9];
                }
                const Cf_round = interpolate(h_over_D, h_D_points, cf_values);
                return { Cf: Cf_round, ref: `ASCE 7 Fig. 29.4-1 (Round, D√q_z=${safeToFixed(D_sqrt_qz, 1)})` };

            default:
                return { Cf: 1.4, ref: "ASCE 7 Fig. 29.4-1 (Default/Unknown)" };
        }
    }

    /**
     * Calculates the net force coefficient (Cf) for trussed towers.
     * Reference: ASCE 7-16/22 Tables 29.6-1 and 29.6-2
     * @param {object} options - An object containing structure_type, solidity_ratio, and member_shape.
     * @returns {{Cf: number, ref: string}}
     */
    function getTrussedTowerCf(options) {
        const { structure_type, solidity_ratio, member_shape } = options;
        const epsilon = Math.max(0, Math.min(solidity_ratio, 1.0));
        let Cf;
        let ref;

        if (member_shape === 'flat') {
            // ASCE 7 Table 29.6-1 for flat-sided members
            Cf = 4.0 * epsilon**2 - 5.9 * epsilon + 4.0;
            ref = "ASCE 7 Table 29.6-1 (Flat Members)";
        } else { // round members
            // ASCE 7 Table 29.6-2 for round members
            if (structure_type.includes('Square')) {
                Cf = 3.4 * epsilon**2 - 4.7 * epsilon + 2.7;
                ref = "ASCE 7 Table 29.6-2 (Square Tower, Round Members)";
            } else { // Triangular or All Other
                Cf = 2.6 * epsilon**2 - 3.5 * epsilon + 2.2;
                ref = "ASCE 7 Table 29.6-2 (Triangular Tower, Round Members)";
            }
        }
        return { Cf: Math.max(Cf, 0), ref }; // Ensure Cf is not negative
    }

    /**
     * Calculates the net pressure coefficient (CN) for arched roofs.
     * Reference: ASCE 7-16/22 Figure 27.3-3
     * @param {object} options - An object containing r (rise), B (span), h (eave height), and spring_point.
     * @returns {{cnMap: object, ref: string}}
     */
    function getArchedRoofCn(options) {
        const { r, B, h, spring_point } = options;
        if (B <= 0) return { cnMap: {}, ref: "Invalid span" };

        const r_over_B = r / B;
        const h_over_B = spring_point === 'On Ground' ? 0 : h / B;
        const cnMap = {};

        // Interpolation data from ASCE 7-16 Fig 27.3-3
        const r_B_points = [0.05, 0.2, 0.3, 0.4, 0.5];

        // Windward Quarter
        const cn_windward_ground = [0.9, 1.1, 1.1, 1.1, 1.1];
        const cn_windward_elevated = [1.5, 1.4, 1.4, 1.4, 1.4];
        const cn_windward = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_windward_ground), interpolate(r_over_B, r_B_points, cn_windward_elevated)]);
        cnMap['Windward Quarter'] = cn_windward;

        // Center Half (and Leeward Quarter)
        const cn_center_h_B_0 = [-0.7, -0.8, -1.0, -1.1, -1.1];
        const cn_center_h_B_0_5 = [-0.9, -0.8, -0.8, -0.8, -0.8];
        const cn_center = interpolate(h_over_B, [0, 0.5], [interpolate(r_over_B, r_B_points, cn_center_h_B_0), interpolate(r_over_B, r_B_points, cn_center_h_B_0_5)]);
        cnMap['Center Half & Leeward Quarter'] = cn_center;

        return { cnMap, ref: `ASCE 7 Fig. 27.3-3 (r/B=${safeToFixed(r_over_B, 2)}, h/B=${safeToFixed(h_over_B, 2)})` };
    }

    // Detailed Cp values for Gable and Hip roofs
    // Reference: ASCE 7-16/22 Figure 27.3-2
    function getGableHipCpValues(h, L, B, roofSlopeDeg, isHip, unitSystem) {
        const cpMap = {};
        const theta = roofSlopeDeg;
        const h_over_L = L > 0 ? h / L : 0;
        const h_unit = unitSystem === 'imperial' ? 'ft' : 'm';

        // Calculate 'a' per ASCE 7-16/22 Section 27.3.2
        const least_dim = Math.min(L, B);
        let a = Math.min(0.1 * least_dim, 0.4 * h);
        const min_a_val1 = 0.04 * least_dim;
        const min_a_val2 = unitSystem === 'imperial' ? 3.0 : 0.9;
        a = Math.max(a, min_a_val1, min_a_val2);

        const a_str = `(a=${safeToFixed(a, 1)} ${h_unit})`;

        // Interpolation functions for Cp based on theta and h/L
        // Windward zones (1, 2, 3)
        const cp_1_windward = interpolate(theta, [10, 20, 30, 45], [-0.7, -0.4, 0.2, 0.4]);
        const cp_2_windward = interpolate(theta, [10, 20, 30, 45], [-0.9, -0.7, -0.2, 0.4]);
        const cp_3_windward = interpolate(theta, [20, 30, 45], [-1.3, -1.0, -0.5]);

        // Leeward zones (1, 2, 3)
        const cp_1_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.5, -0.5, -0.3]);
        const cp_2_leeward = interpolate(h_over_L, [0, 0.5, 1.0], [-0.7, -0.7, -0.5]);
        const cp_3_leeward = -0.9;

        // Assign values to the map
        cpMap[`Roof Zone 1 (Windward)`] = cp_1_windward;
        cpMap[`Roof Zone 2 (Windward) ${a_str}`] = cp_2_windward;
        if (theta >= 20) {
            cpMap[`Roof Zone 3 (Windward) ${a_str}`] = cp_3_windward;
        }

        cpMap[`Roof Zone 1 (Leeward)`] = cp_1_leeward;
        cpMap[`Roof Zone 2 (Leeward) ${a_str}`] = cp_2_leeward;
        cpMap[`Roof Zone 3 (Leeward) ${a_str}`] = cp_3_leeward;

        if (isHip) {
            // Hip roof end zones (1E, 2E, 3E)
            const cp_1E = interpolate(theta, [10, 20, 27], [-0.9, -0.7, -0.5]);
            const cp_2E = interpolate(theta, [10, 20, 27], [-1.3, -0.9, -0.7]);
            const cp_3E = interpolate(theta, [20, 27], [-1.3, -1.0]);

            cpMap[`Hip End Zone 1E`] = cp_1E;
            cpMap[`Hip End Zone 2E ${a_str}`] = cp_2E;
            if (theta >= 20) {
                cpMap[`Hip End Zone 3E ${a_str}`] = cp_3E;
            }
        }

        // Side walls are always -0.7
        cpMap["Side Wall"] = -0.7;

        return cpMap;
    }

    // Cp values for buildings of all heights (Analytical Procedure)
    // Reference: ASCE 7-16 Figure 27.3-1
    function getAnalyticalCpValues(h, dim_parallel_to_wind, dim_perp_to_wind, roofSlopeDeg) {
    const cpMap = {};
    const L_over_B = dim_perp_to_wind > 0 ? dim_parallel_to_wind / dim_perp_to_wind : 0;
    
    cpMap["Windward Wall"] = 0.8;
    cpMap["Side Wall"] = -0.7;
    // Leeward wall Cp depends on L/B ratio
    cpMap[`Leeward Wall (L/B = ${safeToFixed(L_over_B, 2)})`] = interpolate(L_over_B, [0, 1, 2, 4], [-0.5, -0.5, -0.3, -0.2]);
    
    
    // Roof coefficients also depend on h/L ratio
    const h_over_L = dim_parallel_to_wind > 0 ? h / dim_parallel_to_wind : 0;
    
    if (h_over_L <= 0.8) { // Note: ASCE 7-16 Fig 27.3-1 uses h/L, not h/B
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.7, -0.5, -0.3, -0.2, 0.0, 0.2, 0.4]); // This was missing a value in the original code
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20], [-0.3, -0.5, -0.6]);
    } else {
        // ASCE 7-16 Fig. 27.3-1 uses h/L, not h/B
        cpMap[`Roof Windward (h/L = ${safeToFixed(h_over_L, 2)})`] = interpolate(roofSlopeDeg, [10, 15, 20, 25, 30, 35, 45], [-0.9, -0.7, -0.4, -0.3, -0.2, 0.0, 0.4]);
        cpMap[`Roof Leeward (h/L = ${safeToFixed(h_over_L, 2)})`] = -0.7;
    }
    
    return { cpMap };
}

    // Net pressure coefficients CN for Open Buildings with Free Roofs
    // Reference: ASCE 7-16/22 Figure 27.3-4
    function getOpenBuildingCnValues(roofSlopeDeg, isObstructed, roofType) {
        const cnMap = {};
        const theta = Math.abs(roofSlopeDeg); // Use absolute slope
        const caseKey = isObstructed ? 'obstructed' : 'unobstructed';

        // For flat roofs (theta <= 5 deg), use the values for theta = 5 deg.
        // ASCE 7-16/22 Fig 27.3-4 starts its charts at 5 degrees.
        const interp_theta = Math.max(theta, 