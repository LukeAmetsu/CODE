
function interpolate(x, x_values, y_values) {
    if (x_values.length !== y_values.length) return 0;
    if (x <= x_values[0]) return y_values[0];
    if (x >= x_values[x_values.length - 1]) return y_values[y_values.length - 1];

    for (let i = 0; i < x_values.length - 1; i++) {
        if (x >= x_values[i] && x <= x_values[i + 1]) {
            const t = (x - x_values[i]) / (x_values[i + 1] - x_values[i]);
            return y_values[i] + t * (y_values[i + 1] - y_values[i]);
        }
    }
    return 0;
}

function interpolateHighRiseGcp(gcp_data, A, h) {
    const results = {};
    for (const zone of Object.keys(gcp_data).filter(k => k !== 'heights' && k !== 'areas')) {
        const zoneData = gcp_data[zone];
        const log_areas = gcp_data.areas.map(Math.log);
        const log_A = Math.log(A);
        const pos_val_at_A = interpolate(log_A, log_areas, zoneData.pos);
        const neg_val_at_A = interpolate(log_A, log_areas, zoneData.neg);
        const pos_vals_at_h = gcp_data.heights.map(() => pos_val_at_A);
        const neg_vals_at_h = gcp_data.heights.map(() => neg_val_at_A);
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

function calculateLowSlopeRoofPressuresHighRise(A, h) {
    const gcp_data = {
        heights: [60, 100, 200, 300, 400, 500],
        areas: [10, 100, 500],
        'Roof Zone 1\'': { pos: [0.7, 0.5, 0.3], neg: [-1.1, -0.9, -0.7] },
        'Roof Zone 2\'': { pos: [0.7, 0.5, 0.3], neg: [-1.8, -1.4, -1.0] },
        'Roof Zone 3\'': { pos: [0.7, 0.5, 0.3], neg: [-2.6, -2.0, -1.4] }
    };
    return interpolateHighRiseGcp(gcp_data, A, h);
}

function calculateSteepRoofCandC(A, h, theta) {
    // simplified mock if needed, but allow valid return for now
    return {}; 
}

function calculateHighRiseCandCPressures(inputs, qh, GCpi_abs) {
    const { mean_roof_height: h, effective_wind_area: A, roof_slope_deg, roof_type, unit_system, has_rooftop_protection } = inputs;
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
        warnings.push(`C&C pressures for '${roof_type}' roofs...`);
        return { applicable: false, pressures: {}, ref: "Unsupported", warnings };
    }

    // Convert GCp values to final pressures
    const finalPressures = {};
    for (const [zone, gcps] of Object.entries(results)) {
        if (typeof gcps.positive !== 'number' || typeof gcps.negative !== 'number') continue;

        const isRoof = zone.toLowerCase().includes('roof');
        const applyProtection = has_rooftop_protection && isRoof;

        let p_pos, p_neg;

        if (applyProtection) {
            // Exclude internal pressure for rooftop protection on roof elements
            p_pos = qh * gcps.positive;
            p_neg = qh * gcps.negative;
        } else {
            // Standard calculation
            const p1 = qh * (gcps.positive - GCpi_abs);
            const p2 = qh * (gcps.positive - (-GCpi_abs));
            const p3 = qh * (gcps.negative - GCpi_abs);
            const p4 = qh * (gcps.negative - (-GCpi_abs));
            p_pos = Math.max(p1, p2, p3, p4);
            p_neg = Math.min(p1, p2, p3, p4);
        }

        finalPressures[zone] = {
            gcp_pos: gcps.positive, gcp_neg: gcps.negative,
            p_pos: p_pos, p_neg: p_neg
        };
    }

    if (has_rooftop_protection) {
        warnings.push("Rooftop Protection enabled: Internal pressure (GCpi) excluded from Roof C&C pressures.");
    }

    return { applicable: true, pressures: finalPressures, ref: `ASCE 7 Part 2`, is_high_rise: true, warnings };
}

// TEST EXECUTION
const inputs = {
    mean_roof_height: 500,
    effective_wind_area: 10,
    roof_slope_deg: 0,
    roof_type: 'flat',
    unit_system: 'imperial',
    has_rooftop_protection: true,
    rooftop_protection_type: 'Pavers'
};
const qh = 24.42;
const GCpi_abs = 0.18;

const result = calculateHighRiseCandCPressures(inputs, qh, GCpi_abs);
console.log(JSON.stringify(result, null, 2));
