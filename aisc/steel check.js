// --- Global variables for the 3D scene ---
let lastSteelRunResults = null;

const steelCheckInputIds = [
    'design_method', 'aisc_standard', 'unit_system', 'steel_material', 'Fy', 'Fu', 'E',
    'section_type', 'aisc_shape_select',
    'd', 'bf', 'tf', 'tw', 'stiffener_spacing_a', 'Ag_manual', 'I_manual', 'Sx_manual', 'Zx_manual', 'ry_manual', 'rts_manual', 'J_manual', 'Cw_manual',
    'Iy_manual', 'Sy_manual', 'Zy_manual', 'lb_bearing', 'is_end_bearing', 'k_des', 'Cm', 'Lb_input', 'K', 'Cb',
    'Pu_or_Pa', 'Mux_or_Max', 'Muy_or_May', 'Vu_or_Va', 'Tu_or_Ta', 'deflection_span', 'deflection_limit', 'actual_deflection_input'
];

// --- Move steelChecker definition OUTSIDE DOMContentLoaded ---
const steelChecker = (() => {
    function getDesignFactor(design_method, phi, omega) {
        if (design_method === 'LRFD') return phi;
        return 1 / omega; // ASD
    }

    function checkFlexure(props, inputs) {
        if (props.type.endsWith('-Shape') || props.type === 'channel') return checkFlexure_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round' || props.type === 'Pipe') return checkFlexure_HSS(props, inputs);
        if (props.type === 'angle') return checkFlexure_Angle(props, inputs);
        return { phiMn_or_Mn_omega: 0 };
    }

    // --- Refactored Flexure Limit State Functions for I-Shapes ---

    function calculate_Mn_yield(props, inputs) {
        // AISC F2.1: Yielding
        return inputs.Fy * props.Zx;
    }

    function calculate_Mn_ltb(props, inputs, Mp, My, Lp, Lr, c) {
        // AISC F2.2: Lateral-Torsional Buckling (LTB)
        const { Fy, E, Cb, Lb_input, aisc_standard } = inputs;
        const { Sx, rts, J, d, tf, Cw } = props;
        const Lb = Lb_input * 12;

        if (Lb <= Lp) {
            return Mp; // No LTB
        }

        const ho = d - tf; // Distance between flange centroids - THIS WAS MISSING
        if (Lb <= Lr) {
            // Inelastic LTB (AISC F2-2)
            const Mn = Cb * (Mp - (Mp - My) * ((Lb - Lp) / (Lr - Lp)));
            return Math.min(Mn, Mp);
        }

        // Elastic LTB (AISC F2-3 & F2-4)
        const term1 = (Cb * Math.PI ** 2 * E) / Math.pow(Lb / rts, 2);
        let term2;

        // Use the CORRECT formula for Fcr (AISC Eq. F2-4)
        if (aisc_standard === '360-22') {
            const term2_inner = (J * c) / (Sx * ho) + 6.76 * Math.pow((0.7 * Fy) / E, 2) * Math.pow(rts / Lb, 2);
            term2 = Math.sqrt(term2_inner);
        } else { // AISC 360-16
            const term2_inner = 0.078 * (J * c / (Sx * ho)) * Math.pow(Lb / rts, 2);
            term2 = Math.sqrt(1 + term2_inner);
        }

        const Fcr = term1 * term2;
        const Mn = Fcr * Sx;
        return Math.min(Mn, Mp);
    }

    function calculate_Mn_flb(props, inputs, Mp, My) {
        // AISC F3.2: Flange Local Buckling (FLB)
        const { E } = inputs;
        const { Sx, h, tw, bf, tf } = props;
        const lambda_f = bf / (2 * tf);
        const lambda_p_f = 0.38 * Math.sqrt(E / inputs.Fy);
        const lambda_r_f = 1.0 * Math.sqrt(E / inputs.Fy);

        if (lambda_f <= lambda_p_f) {
            return Mp; // Compact flange
        }
        // kc depends on web slenderness (h/tw), not flange slenderness.
        const kc = 4 / Math.sqrt(h / tw);
        const kc_lim = Math.max(0.35, Math.min(0.76, kc));

        if (lambda_f <= lambda_r_f) {
            // Noncompact flange (AISC F3-1)
            const ratio = (lambda_f - lambda_p_f) / (lambda_r_f - lambda_p_f);
            return Mp - (Mp - My) * ratio;
        }
        // Slender flange (AISC F3-2)
        const Fcr_flb = (0.9 * E * kc_lim) / Math.pow(lambda_f, 2);
        const Mn = Fcr_flb * Sx;
        return Math.min(Mn, Mp);
    }

    function checkFlexure_IShape(props, inputs, isHighShear = false) {
        const { Fy, E, Cb, Lb_input, K, aisc_standard } = inputs;
        const { Zx, Sx, rts, h, J, Cw, tw, bf, tf, d } = props;
        const Lb = Lb_input * 12; // to inches

        // Guard against zero rts
        if (rts <= 0) {
            return {
                phiMn_or_Mn_omega: 0,
                error: "rts = 0: Cannot calculate LTB. Check section properties.",
                reference: "AISC F2"
            };
        }

        const lambda_f = bf / (2 * tf);
        const lambda_p_f = 0.38 * Math.sqrt(E / Fy);
        const lambda_r_f = 1.0 * Math.sqrt(E / Fy);
        const lambda_w = h / tw;
        const lambda_p_w = 3.76 * Math.sqrt(E / Fy);
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);
        const isCompact = (lambda_f <= lambda_p_f) && (lambda_w <= lambda_p_w);

        // --- LTB Parameters (AISC F2) ---
        // In function checkFlexure_IShape:
        const Lp = 1.76 * props.rts * Math.sqrt(E / Fy); // CORRECTED: Use rts, not ry
        const ho = d - tf; // Distance between flange centroids
        const c = 1.0; // for doubly symmetric I-shapes
        let Lr;
        // The formula for Lr is the same for both 360-16 and 360-22 (Eq. F2-6)
        if (['360-22', '360-16'].includes(aisc_standard)) {
            const term1 = (J * c) / (Sx * ho);
            const term2 = Math.pow(term1, 2) + 6.76 * Math.pow(0.7 * Fy / E, 2);
            Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(term1 + Math.sqrt(term2));
        } else { // Fallback
            Lr = Infinity;
        }

        // --- Calculate Nominal Capacities for Each Limit State ---
        const Mp = Fy * Zx; // Plastic Moment (Yielding)
        const My = Fy * Sx; // Yield Moment
        
        const limit_states = {
            'Yielding (F2.1)': calculate_Mn_yield(props, inputs),
            'Lateral-Torsional Buckling (F2.2)': calculate_Mn_ltb(props, inputs, Mp, My, Lp, Lr, c),
            'Flange Local Buckling (F3)': calculate_Mn_flb(props, inputs, Mp, My),
            'Web Local Buckling (F4)': checkWebLocalBuckling(props, inputs, Mp, My),
            'Compression Flange Yielding (F5)': (lambda_w > lambda_r_w) ? checkSlenderWebFlexure(props, inputs, Mp, My) : Infinity,
        };

        // --- Determine Governing Capacity and Apply Factors ---
        let Mn = Math.min(...Object.values(limit_states));
        let governing_limit_state = Object.keys(limit_states).find(key => limit_states[key] === Mn) || 'Unknown';

        // --- G2.1: Interaction of Flexure and Shear for I-Shapes ---
        let R_pv = 1.0; // Reduction factor for high shear
        if (isHighShear) {
            const Aw = d * tw;
            const h_tw = h / tw;
            const limit = 1.10 * Math.sqrt(E / Fy);
            if (h_tw <= limit) {
                const Cvx = 1.0;
                R_pv = (1 - (0.6 * inputs.Vu_or_Va) / (0.6 * Fy * Aw * Cvx));
                Mn *= R_pv;
                governing_limit_state += " (Reduced for High Shear)";
            }
        }

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);
        const phiMn_or_Mn_omega = Mn * factor;

        return {
            phiMn_or_Mn_omega: phiMn_or_Mn_omega / 12, // to kip-ft
            isCompact, Mn, Lb, Lp, Lr, Rpg: 1.0, R_pv, governing_limit_state, phi: phi_b, omega: omega_b,
            reference: "AISC F2-F5",
            limit_states, // Pass the detailed results for the breakdown
            slenderness: { lambda_f, lambda_p_f, lambda_r_f, lambda_w, lambda_p_w, lambda_r_w }
        };
    }

    function checkFlexure_HSS(props, inputs) {
        const { Fy, E } = inputs;
        const { Zx, Sx, type } = props;
        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);

        let isCompact, Mn;
        let slenderness = {};

        if (type === 'Rectangular HSS') {
            // AISC F7: Clear distance between flanges
            const h = props.d - 3 * props.tf;
            const lambda = h / props.tf; // h/t
            const lambda_p = 1.12 * Math.sqrt(E / Fy);
            const lambda_r = 1.40 * Math.sqrt(E / Fy);
            isCompact = lambda <= lambda_p;
            slenderness = { lambda, lambda_p, lambda_r };

            const Mp = Fy * Zx;
            if (isCompact) {
                Mn = Mp;
            } else if (lambda <= lambda_r) { // Noncompact HSS
                Mn = Mp - (Mp - Fy * Sx) * ((lambda - lambda_p) / (lambda_r - lambda_p));
            } else { // Slender
                const Fcr = (0.69 * E) / (lambda * lambda);
                Mn = Fcr * Sx;
            }
        } else { // Round HSS (HSS-round)
            const lambda = props.d / props.tf; // D/t
            const lambda_p = 0.07 * (E / Fy);
            const lambda_r = 0.31 * (E / Fy);
            isCompact = lambda <= lambda_p;
            slenderness = { lambda, lambda_p, lambda_r };

            const Mp = Fy * Zx;
            if (isCompact) {
                Mn = Mp;
            } else if (lambda <= lambda_r) { // Noncompact Round HSS/Pipe
                Mn = ((0.021 * E) / lambda + Fy) * Sx;
            } else { // Slender
                const Fcr = (0.33 * E) / lambda;
                Mn = Fcr * Sx;
            }
            Mn = Math.min(Mn, Mp);
        }
        const phiMn_or_Mn_omega = Mn * factor;
        return { phiMn_or_Mn_omega: phiMn_or_Mn_omega / 12, isCompact, Mn, slenderness, reference: "AISC F7, F8" };
    }

    function checkFlexure_Angle(props, inputs) {
        const { Fy, E, Cb, Lb_input } = inputs;
        const { Zx, Sx, ry, d, bf, tf } = props;
        const Lb = Lb_input * 12;

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);

        // F10.1 Yielding
        const My = 1.5 * Fy * Sx;
        const Mn_yield = My;

        // F10.2 LTB
        const Me = (0.46 * E * bf**2 * tf**2) / Lb;

        let Mn_ltb;
        if (Me <= My) { // Elastic LTB
            Mn_ltb = Me;
        } else { // Inelastic LTB
            Mn_ltb = My * (1 - (0.15 * My / Me));
        }

        const Mn = Math.min(Mn_yield, Mn_ltb);
        const governing_limit_state = Mn_yield < Mn_ltb ? 'Yielding (F10.1)' : 'LTB (F10.2)';
        return { phiMn_or_Mn_omega: (Mn * factor) / 12, Mn, governing_limit_state, reference: "AISC F10" };
    }

    function checkFlexureMinorAxisComplete(props, inputs) {
        const { Fy, E, Cb, Lb_input, K } = inputs;
        const { Zy, Sy, Iy, J, Cw, d, bf, tf, tw, type } = props;
        const Lb = Lb_input * 12;

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_b, omega_b);

        // Basic yielding capacity
        const Mpy = Math.min(Fy * Zy, 1.6 * Fy * Sy); // AISC F6.1
        let Mny = Mpy;
        let governing_limit_state = 'Yielding (F6.1)';

        if (type === 'I-Shape' || type === 'channel') {
            // AISC F6 - Doubly symmetric I-shapes and channels bent about minor axis
            const lambda = bf / (2 * tf);
            const lambda_p = 0.38 * Math.sqrt(E / Fy);
            const lambda_r = 1.0 * Math.sqrt(E / Fy);

            if (lambda > lambda_p) {
                const My = Fy * Sy;
                if (lambda <= lambda_r) {
                    // Noncompact
                    Mny = Mpy - (Mpy - My) * ((lambda - lambda_p) / (lambda_r - lambda_p));
                    governing_limit_state = 'Flange Local Buckling (Noncompact, F6.2)';
                } else {
                    // Slender
                    const Fcr = (0.69 * E) / (lambda * lambda);
                    Mny = Fcr * Sy;
                    governing_limit_state = 'Flange Local Buckling (Slender, F6.3)';
                }
            }

        } else if (type === 'Rectangular HSS') {
            // Rectangular HSS minor axis bending - AISC F7 (flanges are now webs)
            const lambda = (bf - 3 * tf) / tf;
            const lambda_p = 1.12 * Math.sqrt(E / Fy);
            const lambda_r = 1.40 * Math.sqrt(E / Fy);

            if (lambda > lambda_p) {
                const My = Fy * Sy;
                if (lambda <= lambda_r) {
                    // Noncompact
                    Mny = Mpy - (Mpy - My) * ((lambda - lambda_p) / (lambda_r - lambda_p));
                    governing_limit_state = 'Wall Local Buckling (Noncompact, F7)';
                } else {
                    // Slender
                    const Fcr = (0.69 * E) / (lambda * lambda);
                    Mny = Fcr * Sy;
                    governing_limit_state = 'Wall Local Buckling (Slender, F7)';
                }
            }        } else if (type === 'HSS-round' || type === 'Pipe') {
            // Round HSS - same capacity for both axes (symmetric)
            // Use same logic as major axis
            const lambda = d / tf; // D/t
            const lambda_p = 0.07 * (E / Fy);
            const lambda_r = 0.31 * (E / Fy);

            const Mp = Fy * Zy;
            if (lambda <= lambda_p) {
                Mny = Mp;
            } else if (lambda <= lambda_r) {
                Mny = ((0.021 * E) / lambda + Fy) * Sy;
            } else {
                const Fcr = (0.33 * E) / lambda;
                Mny = Fcr * Sy;
            }
            Mny = Math.min(Mny, Mp);
            governing_limit_state = 'Round HSS (F8)';
        }

        const phiMny_or_Mny_omega = (Mny * factor) / 12; // to kip-ft

        return { phiMny_or_Mny_omega, Mny, governing_limit_state, reference: "AISC F6/F7/F8" };
    }

    function checkCompression_IShape(props, inputs) {
        const { Fy, E, K, Lb_input, aisc_standard } = inputs;
        const { Ag, rx, ry, Ix, Iy, J, Cw, h, bf, tf, tw } = props;
        const Lc = K * Lb_input * 12;
        const G = E / (2 * (1 + 0.3));

        // --- Elastic Buckling Stresses for Each Mode ---
        const slenderness_x = rx > 0 ? Lc / rx : Infinity;
        const slenderness_y = ry > 0 ? Lc / ry : Infinity;

        const Fex = slenderness_x > 0 ? (Math.PI ** 2 * E) / (slenderness_x ** 2) : Infinity;
        const Fey = slenderness_y > 0 ? (Math.PI ** 2 * E) / (slenderness_y ** 2) : Infinity;

        // Torsional Buckling Stress (AISC E4-4)
        const ro_sq = (Ix + Iy) / Ag; // For doubly symmetric sections
        const Fez = Cw > 0 && J > 0 ? ((Math.PI ** 2 * E * Cw) / ((K * Lc) ** 2) + G * J) / (Ag * ro_sq) : Infinity;

        const buckling_modes = {
            'Flexural Buckling (Y-axis)': Fey,
            'Flexural Buckling (X-axis)': Fex,
            'Torsional Buckling': Fez,
        };

        return { buckling_modes };
    }

    function checkCompression_HSS(props, inputs) {
        const { Fy, E, K, Lb_input } = inputs;
        const { Ag, rx, ry, Ix, Iy, J, Cw, type } = props;
        const Lc = K * Lb_input * 12;
        const G = E / (2 * (1 + 0.3));

        const slenderness_x = rx > 0 ? Lc / rx : Infinity;
        const slenderness_y = ry > 0 ? Lc / ry : Infinity;

        const Fex = slenderness_x > 0 ? (Math.PI ** 2 * E) / (slenderness_x ** 2) : Infinity;
        const Fey = slenderness_y > 0 ? (Math.PI ** 2 * E) / (slenderness_y ** 2) : Infinity;

        let Fez = Infinity;
        if (type === 'Rectangular HSS') {
            const ro_sq = (Ix + Iy) / Ag;
            Fez = Cw > 0 && J > 0 ? ((Math.PI ** 2 * E * Cw) / ((K * Lc) ** 2) + G * J) / (Ag * ro_sq) : Infinity;
        }

        const buckling_modes = {
            'Flexural Buckling (Y-axis)': Fey,
            'Flexural Buckling (X-axis)': Fex,
        };
        if (isFinite(Fez)) {
            buckling_modes['Torsional Buckling'] = Fez;
        }

        return { buckling_modes };
    }

    function checkCompression_Angle(props, inputs) {
        const { Fy, E, K, Lb_input } = inputs;
        const { Ag, rx, ry, Ix, Iy, J, Cw, x_bar } = props;
        const Lc = K * Lb_input * 12;
        const G = E / (2 * (1 + 0.3));

        const slenderness_x = rx > 0 ? Lc / rx : Infinity;
        const slenderness_y = ry > 0 ? Lc / ry : Infinity;

        const Fex = slenderness_x > 0 ? (Math.PI ** 2 * E) / (slenderness_x ** 2) : Infinity;
        const Fey = slenderness_y > 0 ? (Math.PI ** 2 * E) / (slenderness_y ** 2) : Infinity;

        // Flexural-Torsional Buckling (AISC E4) for singly symmetric members
        const xo = x_bar || 0;
        const yo = 0; // Assuming symmetry about x-axis for standard angles
        const ro_sq = xo ** 2 + yo ** 2 + (Ix + Iy) / Ag;
        const H = 1 - (xo ** 2 + yo ** 2) / ro_sq;
        const Fez = Cw > 0 && J > 0 ? (((Math.PI ** 2 * E * Cw) / ((K * Lc) ** 2)) + G * J) / (Ag * ro_sq) : Infinity;

        // AISC Eq. E4-5
        const Fe_ftb_term = (Fex + Fez) / (2 * H);
        const Fe_ftb = Fe_ftb_term * (1 - Math.sqrt(1 - (4 * Fex * Fez * H) / ((Fex + Fez) ** 2)));

        const buckling_modes = {
            'Flexural Buckling (Y-axis)': Fey,
            'Flexural-Torsional Buckling': Fe_ftb,
        };

        return { buckling_modes };
    }

    function checkCompression(props, inputs) {
        const { Fy, E, K, Lb_input } = inputs;
        const { Ag, type, d, bf, tf, tw, h } = props;

        const phi_c = 0.9;
        const omega_c = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_c, omega_c);

        // --- 1. Slender Element Reduction Factor (Q) ---
        const Q_results = checkHSSLocalBuckling(props, inputs); // This function handles multiple types
        const Q = Q_results.reduction_factor || 1.0;

        // --- 2. Determine Elastic Buckling Stresses (Fe) for all modes ---
        let buckling_results;
        if (type.endsWith('-Shape') || type === 'channel') {
            buckling_results = checkCompression_IShape(props, inputs);
        } else if (type === 'Rectangular HSS' || type === 'HSS-round' || type === 'Pipe') {
            buckling_results = checkCompression_HSS(props, inputs);
        } else if (type === 'angle') {
            buckling_results = checkCompression_Angle(props, inputs);
        } else {
            // Fallback for other types
            const ry = props.ry || 0;
            const slenderness_y = ry > 0 ? (K * Lb_input * 12) / ry : Infinity;
            const Fey = slenderness_y > 0 ? (Math.PI ** 2 * E) / (slenderness_y ** 2) : Infinity;
            buckling_results = { buckling_modes: { 'Flexural Buckling': Fey } };
        }

        const { buckling_modes } = buckling_results;
        const Fe = Math.min(...Object.values(buckling_modes));
        const governing_buckling_mode = Object.keys(buckling_modes).find(key => buckling_modes[key] === Fe) || 'Unknown';

        const Fyr = Q * Fy;
        const Fcr_ratio = Fyr / Fe;

        let Fcr;
        if (Fcr_ratio <= 2.25) {
            Fcr = Math.pow(0.658, Fcr_ratio) * Fyr;
        } else {
            Fcr = 0.877 * Fe;
        }

        const Pn = Fcr * Ag;
        const phiPn_or_Pn_omega = Pn * factor;

        return {
            phiPn_or_Pn_omega: phiPn_or_Pn_omega,
            Pn, Fcr, Fe, governing_buckling_mode, Q,
            reference: "AISC E3, E4, E7",
            buckling_modes // Pass detailed mode results for breakdown
        };
    }

    function checkTension(props, inputs) {
        const { Fy, Fu } = inputs;
        const { Ag } = props;

        const Pn_yield = Fy * Ag;
        const phi_ty = 0.90;
        const omega_ty = 1.67;
        const factor_yield = getDesignFactor(inputs.design_method, phi_ty, omega_ty);
        const cap_yield = Pn_yield * factor_yield;

        const An_net = Ag;
        const Ae = 1.0 * An_net;
        const Pn_rupture = Fu * Ae;
        const phi_tr = 0.75;
        const omega_tr = 2.00;
        const factor_rupture = getDesignFactor(inputs.design_method, phi_tr, omega_tr);
        const cap_rupture = Pn_rupture * factor_rupture;

        const governing_capacity = Math.min(cap_yield, cap_rupture);
        const governing_limit_state = cap_yield < cap_rupture ? 'Yielding' : 'Rupture';

        return {
            phiPn_or_Pn_omega: governing_capacity,
            governing_limit_state,
            reference: "AISC D2",
            details: {
                yield: { Pn: Pn_yield, capacity: cap_yield, Ag: props.Ag },
                rupture: { Pn: Pn_rupture, capacity: cap_rupture, Ae }
            }
        };
    }

    function checkShear(props, inputs) {
        if (['W-Shape', 'S-Shape', 'M-Shape', 'HP-Shape', 'Channel'].includes(props.type)) return checkShear_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round' || props.type === 'Pipe') return checkShear_HSS(props, inputs);
        return { phiVn_or_Vn_omega: 0 };
    }

    function checkShear_IShape(props, inputs) {
        const { Fy, E, aisc_standard, stiffener_spacing_a, Pu_or_Pa } = inputs;
        const { d, tw, h } = props;
        const Aw = d * tw;
        const a = stiffener_spacing_a; // clear distance between transverse stiffeners
        const phi_v = 0.9;
        const omega_v = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_v, omega_v);
        const h_tw = h / tw;
        const kv = 5.34;

        // Guard against zero h_tw
        if (h_tw <= 0) {
            return {
                phiVn_or_Vn_omega: 0,
                error: "h/tw = 0: Invalid web geometry",
                reference: "AISC G2"
            };
        }

        let Vn, Cv, governing_limit_state, tfa_details = null;

        if (aisc_standard === '360-22') {
            if (h_tw <= 2.24 * Math.sqrt(E / Fy)) {
                Cv = 1.0;
                governing_limit_state = 'Shear Yielding (G2-1)';
            } else if (h_tw <= 1.51 * Math.sqrt(kv * E / Fy)) {
                Cv = (2.24 * Math.sqrt(E / Fy)) / h_tw;
                governing_limit_state = 'Inelastic Web Buckling (G2-2)';
            } else {
                Cv = (1.51 * kv * E) / (Fy * h_tw * h_tw);
                governing_limit_state = 'Elastic Web Buckling (G2-3)';
            }
            Vn = 0.6 * Fy * Aw * Cv;
        } else { // AISC 360-16
            const C_v1_limit = 2.24 * Math.sqrt(E / Fy);
            if (h_tw <= C_v1_limit) {
                Cv = 1.0;
                governing_limit_state = 'Shear Yielding (G2-1)';
            } else {
                const C_v2_limit = 1.37 * Math.sqrt(kv * E / Fy);
                if (h_tw <= C_v2_limit) {
                    Cv = C_v1_limit / h_tw;
                    governing_limit_state = 'Inelastic Web Buckling (G2-2)';
                } else {
                    Cv = (1.51 * E * kv) / (h_tw**2 * Fy);
                    governing_limit_state = 'Elastic Web Buckling (G2-3)';
                }
            }
            Vn = 0.6 * Fy * Aw * Cv;
        }

        // --- G3. Tension-Field Action (TFA) ---
        // Check if TFA is permitted and beneficial
        const tfa_permitted = (
            a > 0 && // Stiffeners must be present
            h_tw > 2.24 * Math.sqrt(E / Fy) && // Web must be slender enough for buckling to occur
            Pu_or_Pa === 0 && // No axial force
            (2 * Aw / (props.bf * props.tf)) <= 2.5 // Flanges must be stiff enough to anchor tension field
        );

        if (tfa_permitted) {
            const a_h_ratio = a / h;
            // AISC Eq. G3-1
            const Vn_tfa = 0.6 * Fy * Aw * (Cv + (1 - Cv) / (1.15 * Math.sqrt(1 + a_h_ratio**2)));
            if (Vn_tfa > Vn) {
                Vn = Vn_tfa;
                governing_limit_state = 'Shear with Tension-Field Action (G3)';
                tfa_details = {
                    a_h_ratio,
                    Vn_tfa,
                    flange_stiffness_check: (2 * Aw / (props.bf * props.tf))
                };
            }
        }

        const phiVn_or_Vn_omega = Vn * factor;
        return {
            phiVn_or_Vn_omega: phiVn_or_Vn_omega,
            Vn, Cv, h_tw, governing_limit_state, tfa_details,
            reference: "AISC G2"
        };
    }

    function checkShear_HSS(props, inputs) {
        const { Fy, E } = inputs;
        const phi_v = inputs.section_type === 'Rectangular HSS' ? 0.9 : 1.0;
        const omega_v = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_v, omega_v);

        let Vn, Cv = 1.0, h_tw = 0, Aw, governing_limit_state;

        if (inputs.section_type === 'Rectangular HSS') {
            const h = props.d - 3 * props.tf;
            h_tw = h / props.tf;
            const kv = 5.0;

            Aw = 2 * h * props.tf;

            const limit1 = 2.24 * Math.sqrt(E / Fy);
            const limit2 = 1.40 * Math.sqrt(kv * E / Fy);

            if (h_tw <= limit1) { // Compact Web
                Cv = 1.0;
                governing_limit_state = 'Shear Yielding (G5-2a)';
            } else if (h_tw <= limit2) {Cv = limit1 / h_tw;
                governing_limit_state = 'Inelastic Web Buckling (G5-2b)';
            } else {
                Cv = (1.51 * kv * E) / (Fy * h_tw * h_tw);
                governing_limit_state = 'Elastic Web Buckling (G5-3)';
            }
            Vn = 0.6 * Fy * Aw * Cv;
        } else { // Round HSS or Pipe
            // AISC G6 - Shear for Circular HSS
            const D_t = props.d / props.tf;
            const Fcr_yield = 0.6 * Fy;
            const Fcr_buckling1 = (1.60 * E) / (Math.sqrt(D_t) * Math.pow(D_t, 5/4));
            const Fcr_buckling2 = (0.78 * E) / Math.pow(D_t, 3/2);
            const Fcr = Math.min(Math.max(Fcr_buckling1, Fcr_buckling2), Fcr_yield);

            if (Fcr < Fcr_yield) {
                governing_limit_state = 'Shear Buckling (G6)';
            } else {
                governing_limit_state = 'Shear Yielding (G6)';
            }
            Vn = Fcr * (props.Ag / 2);
        }
        const phiVn_or_Vn_omega = Vn * factor;
        return { 
            phiVn_or_Vn_omega: phiVn_or_Vn_omega, 
            Vn, Cv, h_tw, governing_limit_state, 
            phi: phi_v, omega: omega_v, 
            reference: "AISC G5, G6" 
        };
    }

    function calculateB1Factor(inputs, props, axis) {
        const { K, Lb_input, E, design_method, Pu_or_Pa, Cm } = inputs;
        const { Ag, Ix, Iy, ry } = props;

        const L = Lb_input * 12;
        const rx = Math.sqrt(Ix / Ag);
        const r = axis === 'x' ? rx : ry;

        const Pr = Math.abs(Pu_or_Pa);
        if (Pr === 0) return 1.0;

        const Pe_num = Math.PI**2 * E * (axis === 'x' ? Ix : Iy);
        const Pe_denominator = Math.pow(K * L, 2);
        
        // Guard against zero K*L
        if (Pe_denominator === 0 || K === 0 || L === 0) {
            console.error("B1 Factor Error: K*L = 0. Cannot calculate Pe.");
            return 1.0;
        }
        
        const Pe = Pe_num / Pe_denominator;
        if (Pe <= 0) return 10.0;

        const alpha = design_method === 'LRFD' ? 1.0 : 1.6;
        const ratio = (alpha * Pr) / Pe;

        // Check for instability - THROW ERROR instead of silent return
        if (ratio >= 1.0 || (1.0 - ratio) <= 0) {
            const error_msg = `STRUCTURAL INSTABILITY: α*Pr/Pe = ${ratio.toFixed(3)} ≥ 1.0 on ${axis}-axis. Member is unstable under applied loads.`;
            throw new Error(error_msg);
        }
        const B1 = Cm / (1.0 - ratio);

        return Math.max(B1, 1.0);
    }

    /**
     * Checks combined stresses for unsymmetric members (e.g., single angles) per AISC H2.
     * @param {object} inputs - The user inputs.
     * @param {object} props - The section properties.
     * @param {object} comp_results - The results from the compression check.
     * @returns {object} An object with the interaction check results.
     */
    function checkInteraction_Unsymmetric(inputs, props, comp_results) {
        const { Pu_or_Pa, Mux_or_Max, Muy_or_May, design_method } = inputs;
        const { Fy, Zx, Zy, Sx, Sy } = props;

        // Per AISC H2, moments must be resolved about the principal axes (w, z).
        // The principal axis angle 'alpha' is not in the database, so we must assume it.
        // For an equal-leg angle, alpha is 45 degrees. This is an approximation for unequal-leg angles.
        const alpha_rad = (props.d === props.bf) ? (45 * Math.PI / 180) : (30 * Math.PI / 180); // Placeholder for unequal leg
        const cos_a = Math.cos(alpha_rad);
        const sin_a = Math.sin(alpha_rad);

        const Mrx = Math.abs(Mux_or_Max * 12); // kip-in
        const Mry = Math.abs(Muy_or_May * 12); // kip-in

        // Resolve applied moments into principal axis moments
        const Mrw = Mrx * cos_a + Mry * sin_a;
        const Mrz = Math.abs(Mrx * sin_a - Mry * cos_a);

        // Required axial strength
        const Pr = Math.abs(Pu_or_Pa);

        // Available strengths
        const Pc = comp_results.phiPn_or_Pn_omega; // From compression check
        // Available flexural strength about the principal axes (AISC F10)
        // Mcw is the capacity about the major principal axis (w-w)
        const Mcw = (checkFlexure_Angle(props, inputs).phiMn_or_Mn_omega || 0) * 12; // in kip-in
        // Mcz is the capacity about the minor principal axis (z-z). Conservatively use yield moment.
        const Mcz = (design_method === 'LRFD' ? 0.9 : 1/1.67) * Fy * Math.min(Sx, Sy);

        // AISC Interaction Equation H2-1
        const ratio = (Pc > 0 ? Pr / Pc : 0) + (Mcw > 0 ? Mrw / Mcw : 0) + (Mcz > 0 ? Mrz / Mcz : 0);

        return {
            ratio,
            equation: 'H2-1',
            reference: "AISC H2 (Unsymmetric)",
            details: { Pr, Pc, Mrw, Mcw, Mrz, Mcz, alpha_deg: alpha_rad * 180 / Math.PI }
        };
    }

    function checkInteraction(inputs, props, comp_results, flex_results_x, flex_results_y) {
        const { Pu_or_Pa, Mux_or_Max, Muy_or_May, design_method } = inputs;

        const Pr = Math.abs(Pu_or_Pa);
        const Mrx = Math.abs(Mux_or_Max);
        const Mry = Math.abs(Muy_or_May);

        const Pc = comp_results.phiPn_or_Pn_omega;
        const Mcx = flex_results_x.phiMn_or_Mn_omega;
        const Mcy = flex_results_y.phiMny_or_Mny_omega || 0;

        // --- Unsymmetric Member Check (AISC H2) ---
        if (props.type === 'Angle' && Pu_or_Pa < 0) { // Interaction check for compression + flexure
            return checkInteraction_Unsymmetric(inputs, props, comp_results);
        }

        // Try to calculate B1 factors - catch instability error
        let B1x, B1y;
        try {
            B1x = calculateB1Factor(inputs, props, 'x');
            B1y = calculateB1Factor(inputs, props, 'y');
        } catch (error) {
            return {
                ratio: Infinity,
                error: error.message,
                equation: 'N/A',
                reference: "AISC H1.1",
                details: { B1x: 'N/A', B1y: 'N/A' }
            };
        }

        let ratio, equation;
        const pr_pc = Pc > 0 ? Pr / Pc : 0;

        if (pr_pc >= 0.2) {
            // H1-1a
            ratio = pr_pc + (8.0/9.0) * ((B1x * Mrx / Mcx) + (B1y * Mry / Mcy));
            equation = 'H1-1a';
        } else {
            // H1-1b
            ratio = (pr_pc / 2.0) + ((B1x * Mrx / Mcx) + (B1y * Mry / Mcy));
            equation = 'H1-1b';
        }

        return {
            ratio,
            equation,
            reference: "AISC H1.1",
            details: { B1x, B1y }
        };
    }

    function checkShearTorsionInteraction(props, inputs, shear_results, torsion_results) {
        if (inputs.Tu_or_Ta === 0 || !torsion_results.applicable) {
            return { applicable: false };
        }

        const Vr = Math.abs(inputs.Vu_or_Va);
        const Tr = Math.abs(inputs.Tu_or_Ta);
        const Vc = shear_results.phiVn_or_Vn_omega;
        const Tc = torsion_results.phiTn_or_Tn_omega;

        let ratio;
        if (inputs.section_type === 'Rectangular HSS' || inputs.section_type === 'HSS-round') {
            // H3.2 for HSS: Square root interaction
            ratio = Math.sqrt(Math.pow(Vc > 0 ? Vr / Vc : 0, 2) + Math.pow(Tc > 0 ? Tr / Tc : 0, 2));
        } else {
            // For non-HSS (e.g., I-shapes), linear approximation
            ratio = (Vc > 0 ? Vr / Vc : 0) + (Tc > 0 ? Tr / Tc : 0);
        }

        return { 
            applicable: true, 
            ratio, 
            reference: "AISC H3.2 (HSS) or DG9 Approx (non-HSS)" 
        };
    }

    function checkCombinedStressH33(props, inputs, torsion_results) {
        if (inputs.section_type !== 'I-Shape' || inputs.Tu_or_Ta === 0 || !torsion_results.details) {
            return { applicable: false };
        }

        const { Fy, design_method, Pu_or_Pa, Mux_or_Max, Muy_or_May, Vu_or_Va } = inputs;
        const { Ag, Sx, Sy, tw, d } = props;
        const { sigma_w, tau_sv } = torsion_results.details;

        const fa = Math.abs(Pu_or_Pa) / Ag;
        const fbx = Math.abs(Mux_or_Max) * 12 / Sx;
        const fby = Math.abs(Muy_or_May) * 12 / Sy;
        const fv = Math.abs(Vu_or_Va) / (d * tw);

        const total_normal_stress = fa + fbx + fby + sigma_w;
        const total_shear_stress = fv + tau_sv;

        let ratio;
        let capacity;
        if (design_method === 'LRFD') {
            const phi = 0.90;
            capacity = phi * Fy;
            const required_stress = Math.sqrt(Math.pow(total_normal_stress, 2) + 3 * Math.pow(total_shear_stress, 2));
            ratio = required_stress / capacity;
        } else { // ASD
            const Omega = 1.67;
            capacity = Fy / Omega;
            const required_stress = Math.sqrt(Math.pow(total_normal_stress, 2) + 3 * Math.pow(total_shear_stress, 2));
            ratio = required_stress / capacity;
        }

        return {
            applicable: true,
            ratio,
            reference: "AISC H3.3",
            details: {
                total_normal_stress,
                total_shear_stress,
                capacity
            }
        };
    }

    function checkTorsionComplete(props, inputs) {
        const { Tu_or_Ta, Fy, E, Lb_input } = inputs;
        const { type } = props;

        if (Tu_or_Ta === 0) return { applicable: false };

        // Closed sections (HSS, Pipe) resist torsion primarily through St. Venant torsion.
        if (type === 'Rectangular HSS' || type === 'Round HSS' || type === 'Pipe') { // Already correct, but confirms logic
            return checkTorsion_HSS(props, inputs);
        }

        // Open sections (I-Shapes, Channels, Angles, etc.) per AISC Design Guide 9
        const { J, Cw, Sx, d, bf, tf, tw } = props;
        const G = E / (2 * (1 + 0.3));
        const L = Lb_input * 12;

        // Guard against missing properties essential for open section torsion
        if (!J || J <= 0 || !Cw || Cw <= 0) {
            return {
                applicable: true,
                error: "Torsional properties (J, Cw) are missing or invalid for this open section.",
                governing_limit_state: 'Invalid Properties',
                reference: 'AISC DG9',
                phiTn_or_Tn_omega: 0
            };
        }

        // --- Key Torsional Parameters (AISC DG9 Chapter 3) ---
        const a = Math.sqrt((E * Cw) / (G * J)); // Torsional parameter
        const T = Math.abs(Tu_or_Ta); // Applied Torque (kip-in)
        const z = L / 2; // Location of max stress for simply supported beam with uniform torque

        // --- Calculate Rate of Twist and its Derivatives ---
        // Assuming simply supported ends and a concentrated torque T at midspan
        // From DG9 Table 3.2, Case 1
        const C1 = T / (G * J * (Math.cosh(L / a) + 1));
        const theta_prime_max = (T / (2 * G * J)) * Math.tanh(L / (2 * a)); // at z=0, L
        const theta_double_prime_max = (T / (2 * E * Cw / a)) * Math.sinh(L / (2 * a)) / Math.cosh(L / (2 * a));
        const theta_triple_prime_max = T / (2 * E * Cw);

        // --- Calculate Torsional Stresses (AISC DG9 Chapter 4) ---
        const t_max = Math.max(tf, tw); // Use max thickness for St. Venant shear
        const tau_t = G * t_max * theta_prime_max; // Pure Torsional Shear Stress (Eq. 4.1)

        // Normalized Warping Function at flange tip (for I-shape)
        const Wns = (bf * (d - tf)) / 4;
        const sigma_w = E * Wns * theta_double_prime_max; // Warping Normal Stress (Eq. 4.3a)

        // Warping Statical Moment at mid-flange (for I-shape)
        const Sws = (bf * bf * tf * (d - tf)) / 16;
        const tau_w = (E * Sws * theta_triple_prime_max) / tf; // Warping Shear Stress (Eq. 4.2a)

        // --- Nominal Torsional Strength (Based on AISC H3.3 and DG9) ---
        // We check combined stresses, so this function provides the stress components.
        // The "capacity" Tn is not a direct value but is checked via interaction.
        // For reporting, we can estimate a nominal Tn based on yielding.
        const normal_stress_capacity = 0.9 * Fy;
        const shear_stress_capacity = 0.9 * (0.6 * Fy);
        const Tn_norm = sigma_w > 0 ? (normal_stress_capacity / sigma_w) * T : Infinity;
        const Tn_shear = (tau_t + tau_w) > 0 ? (shear_stress_capacity / (tau_t + tau_w)) * T : Infinity;
        const Tn = Math.min(Tn_norm, Tn_shear);

        const phi_T = 0.9;
        const omega_T = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_T, omega_T);

        return {
            applicable: true,
            phiTn_or_Tn_omega: Tn * factor,
            governing_limit_state: 'Combined Torsional Stress (DG9)',
            Tn,
            details: {
                sigma_w, // Warping Normal Stress
                tau_t,   // St. Venant (Pure) Shear Stress
                tau_w,   // Warping Shear Stress
                a,
                L_a_ratio: L / a
            },
            reference: "AISC DG9"
        };
    }

    function checkTorsion_HSS(props, inputs) {
        const { Tu_or_Ta, Fy, E, design_method } = inputs;
        const { type, d, bf, tf, Ag } = props;

        const phi_T = 0.90;
        const omega_T = 1.67;
        const factor = getDesignFactor(design_method, phi_T, omega_T);

        let Tn, governing_limit_state;

        if (type === 'Rectangular HSS') {
            // AISC H3.2 for Rectangular HSS
            const h = d - tf; // Use overall dimensions per AISC H3.2
            const b = bf - tf;
            // Torsional constant C from AISC H3.2, based on the area enclosed by the centerline of the section
            const C = 2 * (b * h) * tf;
            const Fcr_yield = 0.6 * Fy;
            const h_t = (d - 3 * tf) / tf; // Slenderness is based on flat width
            const Fcr_buckling = (h_t > 2.45 * Math.sqrt(E/Fy)) ? (0.6 * Fy * (2.45 * Math.sqrt(E/Fy)) / h_t) : Fcr_yield;
            const Fcr = Math.min(Fcr_yield, Fcr_buckling);
            Tn = Fcr * C;
            governing_limit_state = Fcr < Fcr_yield ? 'Torsional Buckling (H3)' : 'Torsional Yielding (H3)';
        } else { // Round HSS or Pipe
            // AISC H3.1 for Round HSS
            const D_t = d / tf;
            const Fcr_yield = 0.6 * Fy;
            const Fcr_buckling1 = (1.23 * E) / (Math.sqrt(D_t) * Math.pow(D_t, 5/4));
            const Fcr_buckling2 = (0.60 * E) / Math.pow(D_t, 3/2);
            const Fcr = Math.min(Math.max(Fcr_buckling1, Fcr_buckling2), Fcr_yield);
            
            // Torsional constant for a thin tube
            const C = (Math.PI * Math.pow(d - tf, 2) * tf) / 2;
            Tn = Fcr * C; // AISC Eq. H3-1
            governing_limit_state = Fcr < Fcr_yield ? 'Torsional Buckling (H3)' : 'Torsional Yielding (H3)';
        }

        return { 
            applicable: true, 
            phiTn_or_Tn_omega: Tn * factor, 
            governing_limit_state, 
            reference: "AISC H3", 
            details: { sigma_w: 0, tau_sv: 0, beta: 0 } 
        };
    }

    function checkWebCrippling(props, inputs) {
        const { Fy, E, lb_bearing, is_end_bearing, k_des } = inputs;
        const { d, tf, tw } = props;

        if (lb_bearing <= 0) return { applicable: false };

        const phi = 0.75;
        const omega = 2.00;
        const factor = getDesignFactor(inputs.design_method, phi, omega);

        // --- Web Local Yielding (AISC J10.2) ---
        const N_lb = lb_bearing;
        const k_dist = is_end_bearing ? 2.5 * k_des : 5 * k_des;
        const Rn_yield = (N_lb + k_dist) * Fy * tw;

        // --- Web Local Crippling (AISC J10.3) --- CORRECTED
        let Rn_crippling;
        const common_term = Math.sqrt((E * Fy * tf) / tw);

        if (is_end_bearing) {
            // Eq. J10-4
            if ((N_lb / d) <= 0.2) {
                Rn_crippling = 0.80 * tw**2 * (1 + 3 * (N_lb / d) * (tw / tf)**1.5) * common_term;
            } else {
                // CORRECTED: (4*N/d - 0.2) not (3*N/d - 0.2)
                Rn_crippling = 0.80 * tw**2 * (1 + (4 * N_lb / d - 0.2) * (tw / tf)**1.5) * common_term;
            }
        } else { // Interior load
            // Eq. J10-5
            if ((N_lb / d) <= 0.2) {
                Rn_crippling = 0.40 * tw**2 * (1 + 3 * (N_lb / d) * (tw / tf)**1.5) * common_term;
            } else {
                Rn_crippling = 0.40 * tw**2 * (1 + (4.5 * N_lb / d - 0.2) * (tw / tf)**1.5) * common_term;
            }
        }

        const Rn = Math.min(Rn_yield, Rn_crippling);
        const governing_limit_state = Rn_yield < Rn_crippling ? 'Web Local Yielding (J10.2)' : 'Web Local Crippling (J10.3)';

        return {
            applicable: true,
            phiRn_or_Rn_omega: Rn * factor,
            reference: "AISC J10.2 & J10.3",
            governing_limit_state,
            details: { Rn_yield, Rn_crippling, N_lb, k_des, Rn }
        };
    }

    function checkSlenderWebFlexure(props, inputs, Mp, My) {
        const { Fy, E } = inputs;
        const { h, tw, bf, tf, Sx } = props;

        const lambda_w = h / tw;
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);

        // F5-6: Web plastification factor
        const aw = (h * tw) / (bf * tf);
        let Rpg;

        const term = (lambda_w - lambda_r_w);
        if (aw <= 10) {
            // F5-6a
            Rpg = 1.0 - (aw / (1200 + 300 * aw)) * term;
        } else {
            // F5-6b
            Rpg = 1.0 - (aw / (1200 + 300 * aw)) * term;
        }

        Rpg = Math.max(Rpg, 0.0);

        // F5-1: Compression flange yielding
        return Rpg * Fy * Sx;
    }

    function checkWebSideswayBuckling(props, inputs) {
        const { type, h, tw, bf, d } = props;
        const { Lb_input, Fy, design_method } = inputs;

        if (type !== 'channel' || inputs.Pu_or_Pa >= 0) {
            return { applicable: false };
        }

        const Lb = Lb_input * 12;
        if (Lb <= 0 || bf <= 0 || tw <= 0) return { applicable: false };

        const h_tw = h / tw;
        const L_bf = Lb / bf;
        const ratio = h_tw / L_bf;

        let Cr;
        if (ratio <= 1.8) {
            Cr = 2470;
        } else {
            Cr = 4430 / ratio;
        }

        const Aw = d * tw;
        const Rn = (Cr * Aw * Fy) / (h_tw**2);
        const phi = 0.90;
        const omega = 1.67;
        const factor = getDesignFactor(design_method, phi, omega);

        return { 
            applicable: true, 
            Rn,
            phiRn_or_Rn_omega: Rn * factor,
            phi, 
            omega, 
            Cr, h_tw, L_bf, 
            governing_limit_state: 'Web Sidesway Buckling (G4)',
            reference: "AISC G4" 
        };
    }

    function checkWebLocalBuckling(props, inputs, Mp, My) {
        const { Fy, E } = inputs;
        const { h, tw, bf, tf, Sx } = props;

        const lambda_w = h / tw;
        const lambda_p_w = 3.76 * Math.sqrt(E / Fy);
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);

        if (lambda_w <= lambda_p_w) {
            return Mp;
        } else if (lambda_w <= lambda_r_w) {
            // Noncompact web - F4.1
            const aw = (h * tw) / (bf * tf);

            let Rpc;
            if (aw <= 10) {
                Rpc = Mp / My; // F4-9a
            } else {
                // AISC 360-16 Eq. F4-9b
                Rpc = Math.min(Mp / My, 1.0);
            }

            // F4-1
            const ratio = (lambda_w - lambda_p_w) / (lambda_r_w - lambda_p_w);
            return Rpc * (Mp - (Mp - 0.7 * Fy * Sx) * ratio);

        } else {
            // Slender web - F5
            return checkSlenderWebFlexure(props, inputs, Mp, My);
        }
    }

    function checkHSSLocalBuckling(props, inputs) {
        const { Fy, E } = inputs;
        const { d, bf, tf, type } = props;

        if (type !== 'Rectangular HSS') return { applicable: false, reduction_factor: 1.0 };

        const h = d - 3 * tf;
        const b = bf - 3 * tf;
        const h_t = h / tf;
        const b_t = b / tf;

        const lambda_p = 1.12 * Math.sqrt(E / Fy);
        const lambda_r = 1.40 * Math.sqrt(E / Fy);

        const flange_slender = b_t > lambda_r;
        const flange_noncompact = b_t > lambda_p && b_t <= lambda_r;
        const flange_compact = b_t <= lambda_p;

        const web_slender = h_t > lambda_r;
        const web_noncompact = h_t > lambda_p && h_t <= lambda_r;
        const web_compact = h_t <= lambda_p;

        let Qs = 1.0;
        let Qa = 1.0;

        if (flange_slender) {
            const f = Fy;
            const kc = 4 / Math.sqrt(h_t);
            const kc_lim = Math.max(0.35, Math.min(0.76, kc));

            if (b_t > 1.03 * Math.sqrt(kc_lim * E / f)) {
                Qs = (0.69 * E) / (f * Math.pow(b_t, 2));
            } else {
                Qs = 1.415 - 0.65 * b_t * Math.sqrt(f / (kc_lim * E));
            }
            Qs = Math.max(Qs, 0.0);
        }

        if (web_slender) {
            const f = Fy;
            if (h_t > 1.49 * Math.sqrt(E / f)) {
                Qa = (0.90 * E) / (f * Math.pow(h_t, 2));
            } else {
                Qa = 1.0;
            }
        }

        const Q = Qs * Qa;

        return {
            applicable: true,
            flange: { b_t, lambda_p, lambda_r, compact: flange_compact, noncompact: flange_noncompact, slender: flange_slender },
            web: { h_t, lambda_p, lambda_r, compact: web_compact, noncompact: web_noncompact, slender: web_slender },
            reduction_factor: Q,
            is_slender: flange_slender || web_slender,
            reference: "AISC Table B4.1a, E7"
        };
    }

    function validateInputs(inputs) {
        const errors = [];
        const warnings = [];

        if (inputs.Fy <= 0 || inputs.Fy > 100) {
            errors.push("Yield Strength (Fy) must be between 0 and 100 ksi.");
        }
        if (inputs.Fy < 36 || inputs.Fy > 80) {
            warnings.push("Unusual steel grade. Verify Fy value.");
        }

        if (inputs.Fu <= inputs.Fy) {
            errors.push("Ultimate Strength (Fu) must be greater than Fy.");
        }
        if (inputs.E <= 0 || inputs.E > 50000) {
            errors.push("Modulus of Elasticity (E) should be around 29,000 ksi for steel.");
        }

        if (inputs.d <= 0) errors.push("Section depth must be positive.");
        if (inputs.tf <= 0) errors.push("Flange thickness must be positive.");

        if (Math.abs(inputs.Pu_or_Pa) > 10000) {
            warnings.push("Very high axial load - verify units (kips expected).");
        }
        if (Math.abs(inputs.Mux_or_Max) > 10000) {
            warnings.push("Very high moment - verify units (kip-ft expected).");
        }

        if (inputs.section_type === 'I-Shape') {
            if (inputs.d < 2 * inputs.tf) {
                errors.push("Depth (d) must be greater than twice the flange thickness (tf).");
            }
            if (inputs.bf < inputs.tw) {
                errors.push("Flange width (bf) must be greater than the web thickness (tw).");
            }
        }

        // Add guard for K and Lb
        if (inputs.K <= 0) {
            errors.push("Effective length factor (K) must be positive.");
        }
        if (inputs.Lb_input < 0) {
            errors.push("Unbraced length (Lb) cannot be negative.");
        }

        return { errors, warnings };
    }

    function run(inputs) {
        inputs.Fy = parseFloat(inputs.Fy) || 0;
        inputs.Fu = parseFloat(inputs.Fu) || 0;
        inputs.is_end_bearing = inputs.is_end_bearing === 'true';
        inputs.stiffener_spacing_a = parseFloat(inputs.stiffener_spacing_a) || 0;
        inputs.An_net = inputs.Ag_manual;
        inputs.U_shear_lag = 1.0;

        const { errors, warnings } = validateInputs(inputs);
        if (inputs.Tu_or_Ta !== 0 && inputs.section_type === 'I-Shape') {
            warnings.push("Torsion analysis for I-shapes is a simplified approximation. See AISC Design Guide 9 for complete analysis.");
        }
        if (errors.length > 0) return { errors, warnings, checks: {} };

        const props = getSectionProperties(inputs);

        // After getting properties, if rts was calculated, update the UI input field to show it.
        const rtsInput = document.getElementById('rts_manual');
        if (rtsInput && props.rts > 0 && rtsInput.value !== props.rts.toFixed(5)) {
            rtsInput.value = props.rts.toFixed(5);
        }

        const shear_results = checkShear(props, inputs);        
        const isHighShear = Math.abs(inputs.Vu_or_Va) > 0.6 * shear_results.phiVn_or_Vn_omega;
        const flex_results_y = checkFlexureMinorAxisComplete(props, inputs);
        const torsion_results = checkTorsionComplete(props, inputs);

        let axial_results = {};
        if (inputs.Pu_or_Pa > 0) {
            axial_results = checkTension(props, inputs);
            axial_results.type = 'Tension';
        } else if (inputs.Pu_or_Pa < 0) {
            axial_results = checkCompression(props, inputs);
            axial_results.type = 'Compression';
        }

        const flex_results = checkFlexure(props, inputs, isHighShear);

        const web_sidesway_buckling = checkWebSideswayBuckling(props, inputs);
        const web_crippling_check = checkWebCrippling(props, inputs);
        const web_crippling_results = web_crippling_check.applicable ? web_crippling_check : {};

        const combined_stress_H33 = checkCombinedStressH33(props, inputs, torsion_results);
        const shear_torsion_interaction = checkShearTorsionInteraction(props, inputs, shear_results, torsion_results);

        let interaction_results = {};
        if (inputs.Pu_or_Pa < 0 && (inputs.Mux_or_Max !== 0 || inputs.Muy_or_May !== 0)) {
            interaction_results = checkInteraction(inputs, props, axial_results, flex_results, flex_results_y);
        }

        let deflection_results = {};
        if (inputs.deflection_span > 0 && inputs.deflection_limit > 0) {
            const L_span_in = inputs.deflection_span * 12;
            const actual_deflection = parseFloat(inputs.actual_deflection_input) || 0;
            const allowable_deflection = L_span_in / inputs.deflection_limit;

            deflection_results = {
                actual: actual_deflection,
                allowable: allowable_deflection,
                ratio: allowable_deflection > 0 ? actual_deflection / allowable_deflection : Infinity
            };
        }

        return {
            inputs,
            properties: props,
            warnings,
            flexure: flex_results,
            flexure_y: flex_results_y,
            shear: shear_results,
            axial: axial_results,
            interaction: interaction_results,
            web_crippling: web_crippling_results,
            web_sidesway_buckling,
            torsion: torsion_results,
            shear_torsion_interaction,
            combined_stress_H33,
            deflection: deflection_results
        };
    }

    return { run, validateInputs };
})(); // steelChecker

// --- Helper functions for UI (keep outside steelChecker) ---
function getSectionProperties(inputs) {
    // If a shape is selected from the dropdown, its properties are already in the manual input fields.
    // We can build the properties object directly from there. This handles both selected shapes and pure manual input.
    const props = {
        type: inputs.section_type,
        d: parseFloat(inputs.d) || 0,
        bf: parseFloat(inputs.bf) || 0,
        tf: parseFloat(inputs.tf) || 0,
        tw: parseFloat(inputs.tw) || 0,
        Ag: parseFloat(inputs.Ag_manual) || 0,
        Ix: parseFloat(inputs.I_manual) || 0,
        Sx: parseFloat(inputs.Sx_manual) || 0,
        Zx: parseFloat(inputs.Zx_manual) || 0,
        Iy: parseFloat(inputs.Iy_manual) || 0,
        Sy: parseFloat(inputs.Sy_manual) || 0,
        Zy: parseFloat(inputs.Zy_manual) || 0,
        ry: parseFloat(inputs.ry_manual) || 0,
        rts: parseFloat(inputs.rts_manual) || 0,
        J: parseFloat(inputs.J_manual) || 0,
        Cw: parseFloat(inputs.Cw_manual) || 0,
        k_des: parseFloat(inputs.k_des) || parseFloat(inputs.tf) || 0
    };

    // Calculate derived properties
    props.h = props.d - 2 * props.k_des;
    if (props.Ag > 0 && props.Ix > 0) {
        props.rx = Math.sqrt(props.Ix / props.Ag);
    } else {
        props.rx = 0;
    }

    // For angles, x_bar is needed for some checks.
    if (props.type === 'angle') {
        props.x_bar = props.x_bar || 0; // Use database value if available, else 0
    }

    // If rts is missing for an I-shape, calculate it per AISC 360-22 Eq. F2-7
    if ((!props.rts || props.rts === 0) && ['W-Shape', 'S-Shape', 'M-Shape', 'HP-Shape'].includes(props.type)) {
        // Correct implementation of AISC F2-7 for doubly symmetric I-shapes
        if (props.bf > 0 && props.Sx > 0) {
            const ho = props.d - props.tf;
            const rts_squared = (Math.sqrt(props.Iy * props.Cw)) / props.Sx;
            props.rts = Math.sqrt(rts_squared);
        }
    }

    return props;
}

function updateGeometryInputsUI() {
    const sectionType = document.getElementById('section_type').value;
    const d_label = document.getElementById('label-d');
    const shapeSelectContainer = document.getElementById('aisc-shape-select-container');
    const bf_label = document.getElementById('label-bf');
    const tf_label = document.getElementById('label-tf');
    const tw_label = document.getElementById('label-tw');
    const d_container = document.getElementById('d-input-container');
    const bf_container = document.getElementById('bf-input-container');
    const tf_container = document.getElementById('tf-input-container');
    const tw_container = document.getElementById('tw-input-container');

    d_container.style.display = 'block';
    bf_container.style.display = 'block';
    tf_container.style.display = 'block';
    tw_container.style.display = 'block';
    shapeSelectContainer.style.display = 'block';
 
    if (sectionType.endsWith('-Shape')) { // Covers W-Shape, S-Shape, HP-Shape, M-Shape, WT-Shape
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
        if (sectionType === 'WT-Shape') {
            tw_label.textContent = 'Stem Thick (tw)';
        }
    } else if (sectionType === 'Rectangular HSS') {
        d_label.textContent = 'Height (H)';
        bf_label.textContent = 'Width (B)';
        tf_label.textContent = 'Thickness (t)';
        tw_container.style.display = 'none';
    } else if (sectionType === 'Round HSS' || sectionType === 'Pipe') {
        d_label.textContent = 'Diameter (D)';
        bf_label.textContent = 'Thickness (t)';
        d_container.style.display = 'block';
        bf_container.style.display = 'block';
        tf_container.style.display = 'none';
        tw_container.style.display = 'none';
    } else if (sectionType === 'Channel' || sectionType === 'Angle') {
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
    } else if (sectionType === 'Manual Input') {
        shapeSelectContainer.style.display = 'none';
        // Ensure inputs are not readonly
        document.querySelectorAll('#d, #bf, #tf, #tw').forEach(el => el.readOnly = false);
    }

    populateShapeDropdown(); // Repopulate shapes for the selected type
}

function handleToggleAllDetails(mainButton, containerSelector) {
    const shouldShow = mainButton.dataset.state === 'hidden';
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.querySelectorAll('.details-row').forEach(row => {
        row.classList.toggle('is-visible', shouldShow);
    });
    container.querySelectorAll('.toggle-details-btn').forEach(button => {
        button.textContent = shouldShow ? '[Hide]' : '[Show]';
    });
    mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
    mainButton.textContent = shouldShow ? 'Hide All Details' : 'Show All Details';
    mainButton.blur();
}

function generateSteelBreakdownHtml(name, data, results) {
    const { inputs, properties } = results;
    const { check, details } = data;
    const { design_method } = inputs;

    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? (check?.phi ?? 0.9) : (check?.omega ?? 1.67);
    const capacity_eq = design_method === 'LRFD' ? `${factor_char}R<sub>n</sub>` : `R<sub>n</sub> / ${factor_char}`;
    const nominal_capacity = check?.Mn || check?.Rn || 0; // Use Mn for flexure, Rn for others
    const final_capacity = design_method === 'LRFD' ? nominal_capacity * factor_val : nominal_capacity / factor_val;

    const fmt = (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A';
    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;
    let content = '';

    switch (name) {
        case 'Flexure (Major Axis)':
        case 'Flexure (Minor Axis)':
            if (name.includes('Major')) {
                const { governing_limit_state, Mn, Lb, Lp, Lr, limit_states, slenderness } = results.flexure || {};
                const safeMn = isFinite(Mn) ? Mn : 0;
                // FIX: Add a guard clause to prevent crash if limit_states is not available for the section type.
                if (!limit_states) {
                    content = format_list([`Governing Limit State: <b>${governing_limit_state || 'N/A'}</b>`, `Nominal Moment Capacity (M<sub>n</sub>) = <b>${fmt(Mn / 12)} kip-ft</b>`]);
                    break;
                }
                const { Cb } = inputs;
                const Mp = limit_states['Yielding (F2.1)'];
                const My = inputs.Fy * properties.Sx;

                const limit_state_rows = Object.entries(limit_states)
                    .filter(([, mn_val]) => isFinite(mn_val))
                    .map(([ls_name, mn_val]) => {
                        const isGoverning = ls_name === governing_limit_state; // This was already correct
                        return `<li>${isGoverning ? '<b>&#9658;</b> ' : ''}${ls_name}: M<sub>n</sub> = ${fmt(mn_val / 12)} kip-ft${isGoverning ? ' <b>(Governs)</b>' : ''}</li>`;
                    }).join('');

                content = format_list([
                    `<u>Nominal Moment Capacity (M<sub>nx</sub>) for Each Limit State:</u><ul>${limit_state_rows}</ul>`,
                    `Plastic Moment (M<sub>p</sub>) = F<sub>y</sub> &times; Z<sub>x</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Zx)} = ${fmt(Mp / 12)} kip-ft`,
                    `Yield Moment (M<sub>y</sub>) = F<sub>y</sub> &times; S<sub>x</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Sx)} = ${fmt(My / 12)} kip-ft`,
                    `<b>LTB Check:</b> L<sub>b</sub>=${fmt(Lb/12)} ft, L<sub>p</sub>=${fmt(Lp/12)} ft, L<sub>r</sub>=${fmt(Lr/12)} ft, C<sub>b</sub>=${fmt(Cb)}`,
                    slenderness ? `<b>FLB Check:</b> &lambda;<sub>f</sub>=${fmt(slenderness.lambda_f)}, &lambda;<sub>pf</sub>=${fmt(slenderness.lambda_p_f)}, &lambda;<sub>rf</sub>=${fmt(slenderness.lambda_r_f)}` : '',
                    `<u>Design Capacity</u>`,
                    `Capacity = ${capacity_eq.replace('R','M')} = ${fmt(safeMn / 12)} / ${factor_val} = <b>${fmt(data.phiMn_or_Mn_omega)} kip-ft</b>`
                ]);
            } else { // Minor Axis
                const flex_data_y = results.flexure_y;
                content = format_list([
                    `<u>Governing Limit State: <b>${flex_data_y.governing_limit_state}</b></u>`,
                    `Nominal Moment Capacity (M<sub>ny</sub>) = <b>${fmt(flex_data_y.Mny / 12)} kip-ft</b>`,
                    `Plastic Moment (M<sub>py</sub>) = F<sub>y</sub> &times; Z<sub>y</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Zy)} = ${fmt(inputs.Fy * properties.Zy / 12)} kip-ft`,
                    `Yield Moment (M<sub>yy</sub>) = F<sub>y</sub> &times; S<sub>y</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Sy)} = ${fmt(inputs.Fy * properties.Sy / 12)} kip-ft`,
                    `<u>Design Capacity</u>`,
                    `Capacity = ${capacity_eq.replace('R','M')} = ${fmt(flex_data_y.Mny / 12)} / ${factor_val} = <b>${fmt(flex_data_y.phiMny_or_Mny_omega)} kip-ft</b>`
                ]);
            }
            break;

        case 'Shear':
            const shear_data = results.shear;
            content = format_list([
                ...(shear_data.tfa_details ? [
                    `<u>Tension-Field Action (G3) is permitted and governs.</u>`,
                    `Flange Stiffness Check: 2A<sub>w</sub>/A<sub>f</sub> = ${fmt(shear_data.tfa_details.flange_stiffness_check, 2)} &le; 2.5`,
                    `V<sub>n</sub> = 0.6F<sub>y</sub>A<sub>w</sub>[C<sub>v</sub> + (1-C<sub>v</sub>)/(1.15&radic;(1+(a/h)²))] = <b>${fmt(shear_data.Vn)} kips</b>`,
                ] : [
                `<u>Governing Limit State: <b>${shear_data.governing_limit_state}</b></u>`,
                `Web Slenderness (h/t<sub>w</sub>) = ${fmt(shear_data.h_tw)}`,
                `Web Shear Coefficient (C<sub>v</sub>) = ${fmt(shear_data.Cv, 3)}`,
                `<u>Nominal Shear Strength (V<sub>n</sub>) per AISC G2</u>`,
                `V<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>w</sub> &times; C<sub>v</sub>`,
                `V<sub>n</sub> = 0.6 &times; ${fmt(inputs.Fy)} &times; ${fmt(properties.d * properties.tw)} &times; ${fmt(shear_data.Cv, 3)} = <b>${fmt(shear_data.Vn)} kips</b>`,
                ]),
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq.replace('R','V')} = ${fmt(shear_data.Vn)} / ${factor_val} = <b>${fmt(shear_data.phiVn_or_Vn_omega)} kips</b>`
            ]);
            break;

        case 'Compression':
            const comp_data = results.axial;
            const buckling_mode_rows = Object.entries(comp_data.buckling_modes)
                .filter(([, fe_val]) => isFinite(fe_val))
                .map(([mode_name, fe_val]) => {
                    const isGoverning = mode_name === comp_data.governing_buckling_mode;
                    return `<li>${isGoverning ? '<b>&#9658;</b> ' : ''}${mode_name}: F<sub>e</sub> = ${fmt(fe_val)} ksi${isGoverning ? ' <b>(Governs)</b>' : ''}</li>`;
                }).join('');

            content = format_list([
                `<u>Elastic Buckling Stress (F<sub>e</sub>) for Each Mode:</u><ul>${buckling_mode_rows}</ul>`,
                `Slender Element Reduction Factor (Q) = ${fmt(comp_data.Q, 3)}`,
                `Critical Buckling Stress (F<sub>cr</sub>) = ${fmt(comp_data.Fcr)} ksi`,
                `<u>Nominal Compressive Strength (P<sub>n</sub>) per AISC E3/E4</u>`,
                `P<sub>n</sub> = F<sub>cr</sub> &times; A<sub>g</sub> = ${fmt(comp_data.Fcr)} ksi &times; ${fmt(properties.Ag)} in² = <b>${fmt(comp_data.Pn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq} = ${fmt(comp_data.Pn)} / ${factor_val} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Tension':
            const tension_data = results.axial;
            content = format_list([
                `<u>Governing Limit State: <b>${tension_data.governing_limit_state}</b></u>`,
                `<b>Yielding:</b> P<sub>n,y</sub> = F<sub>y</sub> &times; A<sub>g</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Ag)} = ${fmt(tension_data.details.yield.Pn)} kips`,
                `<b>Rupture:</b> P<sub>n,r</sub> = F<sub>u</sub> &times; A<sub>e</sub> = ${fmt(inputs.Fu)} &times; ${fmt(tension_data.details.rupture.Ae)} = ${fmt(tension_data.details.rupture.Pn)} kips`,
                `<u>Design Capacity</u>`,
                `Capacity = min(${design_method === 'LRFD' ? '0.9P_n,y, 0.75P_n,r' : 'P_n,y/1.67, P_n,r/2.00'}) = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Web Crippling':
            const wc_data = results.web_crippling;
            content = format_list([
                `<u>Governing Limit State: <b>${wc_data.governing_limit_state}</b></u>`,
                `<b>Yielding:</b> R<sub>n,y</sub> = (N + k) &times; F<sub>yw</sub> &times; t<sub>w</sub> = <b>${fmt(wc_data.details.Rn_yield)} kips</b>`,
                `<b>Crippling:</b> R<sub>n,c</sub> = <b>${fmt(wc_data.details.Rn_crippling)} kips</b> (from AISC Eq. ${inputs.is_end_bearing ? 'J10-4' : 'J10-5'})`,
                `<u>Nominal Strength (R<sub>n</sub>)</u>`,
                `R<sub>n</sub> = min(R<sub>n,y</sub>, R<sub>n,c</sub>) = <b>${fmt(wc_data.details.Rn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq.replace('R','R')} = ${fmt(wc_data.details.Rn)} / ${factor_val} = <b>${fmt(wc_data.phiRn_or_Rn_omega)} kips</b>`
            ]);
            break;

        case 'Combined Axial & Flexure':
            const interaction_data = results.interaction;
            content = format_list([
                `<u>Interaction Check per AISC H1.1</u>`,
                `P<sub>r</sub>/P<sub>c</sub> = ${fmt(Math.abs(inputs.Pu_or_Pa))} / ${fmt(results.axial.phiPn_or_Pn_omega)} = ${fmt(Math.abs(inputs.Pu_or_Pa) / results.axial.phiPn_or_Pn_omega, 3)}`,
                `Using Equation <b>${interaction_data.equation}</b>`,
                `B1<sub>x</sub> = ${fmt(interaction_data.details.B1x, 3)}, B1<sub>y</sub> = ${fmt(interaction_data.details.B1y, 3)}`,
                `Interaction Value = <b>${fmt(interaction_data.ratio, 3)}</b>`
            ]);
            break;

        case 'Combined Shear & Torsion':
            const s_t_interaction = results.shear_torsion_interaction;
            content = format_list([
                `<u>Interaction Check per AISC H3.2 (HSS) or DG9 Approx. (I-Shape)</u>`,
                `Equation: &radic;[(V<sub>r</sub>/V<sub>c</sub>)² + (T<sub>r</sub>/T<sub>c</sub>)²] &le; 1.0 (for HSS)`,
                `V<sub>r</sub>/V<sub>c</sub> = ${fmt(Math.abs(inputs.Vu_or_Va))} / ${fmt(results.shear.phiVn_or_Vn_omega)}`,
                `T<sub>r</sub>/T<sub>c</sub> = ${fmt(Math.abs(inputs.Tu_or_Ta))} / ${fmt(results.torsion.phiTn_or_Tn_omega)}`,
                `Interaction Value = <b>${fmt(s_t_interaction.ratio, 3)}</b>`
            ]);
            break;

        case 'Combined Stresses (H3.3)':
            const h33_data = results.combined_stress_H33;
            content = format_list([
                `<u>Von Mises Combined Stress Check per AISC H3.3</u>`,
                `Total Normal Stress (&sigma;<sub>total</sub>) = f<sub>a</sub> + f<sub>bx</sub> + f<sub>by</sub> + &sigma;<sub>w</sub> = <b>${fmt(h33_data.details.total_normal_stress)} ksi</b>`,
                `Total Shear Stress (&tau;<sub>total</sub>) = f<sub>v</sub> + &tau;<sub>sv</sub> = <b>${fmt(h33_data.details.total_shear_stress)} ksi</b>`,
                `<u>Required Strength (von Mises)</u>`,
                `f<sub>required</sub> = &radic;(&sigma;<sub>total</sub>² + 3&tau;<sub>total</sub>²) = <b>${fmt(Math.sqrt(h33_data.details.total_normal_stress**2 + 3 * h33_data.details.total_shear_stress**2))} ksi</b>`,
                `<u>Design Strength</u>`,
                `Capacity = ${capacity_eq.replace('R','F')} = <b>${fmt(h33_data.details.capacity)} ksi</b>`
            ]);
            break;

        case 'Web Sidesway Buckling':
            const wsb_data = results.web_sidesway_buckling;
            content = format_list([
                `<u>Governing Limit State: <b>${wsb_data.governing_limit_state}</b></u>`,
                `Web Slenderness (h/t<sub>w</sub>) = ${fmt(wsb_data.h_tw)}`,
                `Unbraced Length / Flange Width (L<sub>b</sub>/b<sub>f</sub>) = ${fmt(wsb_data.L_bf)}`,
                `Coefficient C<sub>r</sub> = ${fmt(wsb_data.Cr)}`,
                `<u>Nominal Strength (R<sub>n</sub>) per AISC G4</u>`,
                `R<sub>n</sub> = (C<sub>r</sub> × A<sub>w</sub> × F<sub>y</sub>) / (h/t<sub>w</sub>)²`,
                `R<sub>n</sub> = <b>${fmt(wsb_data.Rn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq.replace('R','R')} = <b>${fmt(wsb_data.phiRn_or_Rn_omega)} kips</b>`
            ]);
            break;

        case 'Deflection':
            const def_data = results.deflection;
            content = format_list([
                `<u>Serviceability Check for Deflection</u>`,
                `Allowable Deflection = Span / Limit = ${fmt(inputs.deflection_span * 12, 2)} in / ${fmt(inputs.deflection_limit, 0)} = <b>${fmt(def_data.allowable, 3)} in</b>`,
                `Actual Deflection = <b>${fmt(def_data.actual, 3)} in</b> (User Input)`,
                `Ratio = Actual / Allowable = ${fmt(def_data.actual, 3)} / ${fmt(def_data.allowable, 3)} = <b>${fmt(def_data.ratio, 3)}</b>`
            ]);
            break;

        default:
            return 'Breakdown not available for this check.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    const sectionType = document.getElementById('section_type').value;
    if (!shapeSelect || sectionType === 'Manual Input') return;

    try {
        const shapes = await AISC_SPEC.getShapesByType(sectionType);
        const shapeNames = Object.keys(shapes).sort(); // Sort alphabetically

        // Preserve current value if it exists in the new list
        const currentVal = shapeSelect.value;

        shapeSelect.innerHTML = '<option value="">-- Select a Shape --</option>'; // Reset
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
    const geometryInputs = ['d', 'bf', 'tf', 'tw'];
    const manualPropInputs = ['Ag_manual', 'I_manual', 'Sx_manual', 'Zx_manual', 'ry_manual', 'rts_manual', 'J_manual', 'Cw_manual', 'Iy_manual', 'Sy_manual', 'Zy_manual'];

    if (!shapeName) {
        // If "Select a Shape" is chosen, make inputs editable
        [...geometryInputs, ...manualPropInputs].forEach(id => {
            const el = document.getElementById(id); if (el) el.readOnly = false;
        });
        return;
    }

    // When a shape is selected, fetch ALL its properties and populate the manual input fields.
    const shape = await AISC_SPEC.getShape(shapeName);
    if (!shape) return;

    const propertyMap = {
        d: shape.d, bf: shape.bf, tf: shape.tf, tw: shape.tw,
        Ag_manual: shape.Ag, I_manual: shape.Ix, Sx_manual: shape.Sx, Zx_manual: shape.Zx,
        ry_manual: shape.ry, rts_manual: shape.rts || '', J_manual: shape.J || '', Cw_manual: shape.cw || '', // CORRECTED: Use shape.cw and provide a fallback
        Iy_manual: shape.Iy, Sy_manual: shape.Sy, Zy_manual: shape.Zy,
        // Also populate k_des if available, otherwise it will be calculated from tf
        k_des: shape.k_des || shape.tf 
    };

    Object.keys(propertyMap).forEach(id => {
        const el = document.getElementById(id);
        if (el && propertyMap[id] !== undefined) {
            el.value = propertyMap[id];
            // Make all property inputs read-only when a shape is selected
            el.readOnly = true; 
        }
    });
}

function renderSteelInputSummary(inputs) {
    const { design_method, aisc_standard, steel_material, Fy, Fu, Lb_input, K, Cb, Pu_or_Pa, Vu_or_Va, Mux_or_Max, Muy_or_May, Tu_or_Ta, deflection_span, deflection_limit, actual_deflection_input } = inputs;

    return `
    <div id="input-summary-section" class="report-section-copyable">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Input Summary</h3>
            <button data-copy-target-id="input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">General & Material Properties</caption>
                <tbody>
                    <tr><td>Design Method</td><td>${design_method} (${aisc_standard})</td></tr>
                    <tr><td>Material</td><td>${steel_material} (F<sub>y</sub>=${Fy} ksi, F<sub>u</sub>=${Fu} ksi)</td></tr>
                    <tr><td>Unbraced Length (L<sub>b</sub>)</td><td>${Lb_input} ft</td></tr>
                    <tr><td>Effective Length Factor (K)</td><td>${K}</td></tr>
                    <tr><td>LTB Factor (C<sub>b</sub>)</td><td>${Cb}</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Applied Loads</caption>
                <tbody>
                    <tr><td>Axial (P)</td><td>${Pu_or_Pa} kips</td></tr>
                    <tr><td>Shear (V)</td><td>${Vu_or_Va} kips</td></tr>
                    <tr><td>Moment, Major (M<sub>x</sub>)</td><td>${Mux_or_Max} kip-ft</td></tr>
                    <tr><td>Moment, Minor (M<sub>y</sub>)</td><td>${Muy_or_May} kip-ft</td></tr>
                    <tr><td>Torsion (T)</td><td>${Tu_or_Ta} kip-in</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Serviceability Inputs</caption>
                <tbody>
                    <tr><td>Deflection Span</td><td>${deflection_span} ft</td></tr>
                    <tr><td>Deflection Limit</td><td>L/${deflection_limit}</td></tr>
                    <tr><td>Actual Deflection</td><td>${actual_deflection_input} in</td></tr>
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderSteelPropertySummary(properties) {
    const selectedShape = lastSteelRunResults?.inputs?.aisc_shape_select || 'Manual Input';
    const fmt = (val, dec = 2) => (typeof val === 'number' && isFinite(val)) ? val.toFixed(dec) : 'N/A';

    const rows = [
        `<tr><td>Section Type</td><td>${properties.type}</td></tr>`,
        `<tr><td>Selected Shape</td><td class="font-semibold">${selectedShape}</td></tr>`,
        `<tr><td>Gross Area (A<sub>g</sub>)</td><td>${fmt(properties.Ag, 2)} in²</td></tr>`, // Corrected typo from Ag_manual
        `<tr><td>Depth (d)</td><td>${fmt(properties.d, 2)} in</td></tr>`,
        `<tr><td>Flange Width (b<sub>f</sub>)</td><td>${fmt(properties.bf, 2)} in</td></tr>`,
        `<tr><td>Flange Thickness (t<sub>f</sub>)</td><td>${fmt(properties.tf, 3)} in</td></tr>`,
        `<tr><td>Web Thickness (t<sub>w</sub>)</td><td>${fmt(properties.tw, 3)} in</td></tr>`,
        `<tr><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Major Axis Properties (X-X)</td></tr>`,
        `<tr><td>Moment of Inertia (I<sub>x</sub>)</td><td>${fmt(properties.Ix, 2)} in⁴</td></tr>`,
        `<tr><td>Section Modulus (S<sub>x</sub>)</td><td>${fmt(properties.Sx, 2)} in³</td></tr>`,
        `<tr><td>Plastic Modulus (Z<sub>x</sub>)</td><td>${fmt(properties.Zx, 2)} in³</td></tr>`,
        `<tr><td>Radius of Gyration (r<sub>x</sub>)</td><td>${fmt(properties.rx, 2)} in</td></tr>`,
        `<tr><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Minor Axis Properties (Y-Y)</td></tr>`,
        `<tr><td>Moment of Inertia (I<sub>y</sub>)</td><td>${fmt(properties.Iy, 2)} in⁴</td></tr>`,
        `<tr><td>Section Modulus (S<sub>y</sub>)</td><td>${fmt(properties.Sy, 2)} in³</td></tr>`,
        `<tr><td>Plastic Modulus (Z<sub>y</sub>)</td><td>${fmt(properties.Zy, 2)} in³</td></tr>`,
        `<tr><td>Radius of Gyration (r<sub>y</sub>)</td><td>${fmt(properties.ry, 2)} in</td></tr>`,
        `<tr><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Torsional Properties</td></tr>`,
        `<tr><td>Torsional Constant (J)</td><td>${fmt(properties.J, 2)} in⁴</td></tr>`,
        `<tr><td>Warping Constant (C<sub>w</sub>)</td><td>${fmt(properties.Cw, 2)} in⁶</td></tr>`,
        `<tr><td>Radius of Gyration (r<sub>ts</sub>)</td><td>${fmt(properties.rts, 2)} in</td></tr>`
    ];

    return `
    <div id="property-summary-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Section Properties</h3>
            <button data-copy-target-id="property-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    </div>`;
}

function renderSlendernessChecks(results) {
    const { flexure, properties } = results;
    if (!flexure || !flexure.slenderness) return ''; // Only render if slenderness data is available

    const getStatus = (lambda, lambda_p, lambda_r) => {
        if (lambda <= lambda_p) return '<span class="pass">Compact</span>';
        if (lambda <= lambda_r) return '<span class="warn">Non-Compact</span>';
        return '<span class="fail">Slender</span>';
    };

    let rows = [];
    const slenderness = flexure.slenderness;

    // Check for I-Shape/Channel properties
    if (slenderness.lambda_f !== undefined && slenderness.lambda_w !== undefined) {
        const { lambda_f, lambda_p_f, lambda_r_f, lambda_w, lambda_p_w, lambda_r_w } = slenderness;
        rows.push(`<tr><td>Flange Slenderness (b<sub>f</sub>/2t<sub>f</sub>)</td><td>${lambda_f.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p_f.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r_f.toFixed(2)}</td><td>${getStatus(lambda_f, lambda_p_f, lambda_r_f)}</td></tr>`);
        rows.push(`<tr><td>Web Slenderness (h/t<sub>w</sub>)</td><td>${lambda_w.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p_w.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r_w.toFixed(2)}</td><td>${getStatus(lambda_w, lambda_p_w, lambda_r_w)}</td></tr>`);
    } 
    // Check for Round HSS/Pipe properties
    else if (slenderness.lambda !== undefined) {
        const { lambda, lambda_p, lambda_r } = slenderness;
        rows.push(`<tr><td>Wall Slenderness (D/t)</td><td>${lambda.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r.toFixed(2)}</td><td>${getStatus(lambda, lambda_p, lambda_r)}</td></tr>`);
    }

    if (rows.length === 0) return ''; // Don't render the table if no slenderness checks were applicable

    return `
    <div id="slenderness-checks-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Section Compactness (AISC B4)</h3>
            <button data-copy-target-id="slenderness-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <thead>
                    <tr><th>Element</th><th>Ratio</th><th>Limits</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderSteelStrengthChecks(results) {
    const { inputs, flexure, flexure_y, shear, axial, interaction, web_crippling, web_sidesway_buckling, torsion, deflection, combined_stress_H33, shear_torsion_interaction } = results;

    const fmt = (val, dec = 2) => (typeof val === 'number' && isFinite(val)) ? val.toFixed(dec) : 'N/A';
    const getStatus = (ratio) => {
        if (typeof ratio !== 'number' || !isFinite(ratio)) return '<span class="fail">Error</span>';
        return ratio <= 1.0 ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>';
    };

    const createRow = (name, demand, capacity, ratio, status, data) => {
        if (capacity === 0 && demand === 0) return '';
        const detailId = `detail-${name.replace(/[\s\(\)]/g, '-')}`;
        const breakdownHtml = generateSteelBreakdownHtml(name, data, results);
        return `
            <tr class="border-t dark:border-gray-700">
                <td>${name} <span class="ref">[${data.reference}]</span> <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                <td>${fmt(demand, 2)}</td>
                <td>${fmt(capacity, 2)}</td>
                <td>${fmt(ratio, 3)}</td>
                <td>${status}</td>
            </tr>
            <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td></tr>
        `;
    };

    const strengthRows = [
        axial.type && createRow(axial.type, Math.abs(inputs.Pu_or_Pa), axial.phiPn_or_Pn_omega, Math.abs(inputs.Pu_or_Pa) / axial.phiPn_or_Pn_omega, getStatus(Math.abs(inputs.Pu_or_Pa) / axial.phiPn_or_Pn_omega), { check: axial, details: axial, reference: axial.reference }),
        (flexure.phiMn_or_Mn_omega || inputs.Mux_or_Max !== 0) && createRow('Flexure (Major Axis)', Math.abs(inputs.Mux_or_Max), flexure.phiMn_or_Mn_omega, Math.abs(inputs.Mux_or_Max) / flexure.phiMn_or_Mn_omega, getStatus(Math.abs(inputs.Mux_or_Max) / flexure.phiMn_or_Mn_omega), { check: flexure, details: flexure, reference: flexure.reference }),
        (flexure_y.phiMny_or_Mny_omega || inputs.Muy_or_May !== 0) && createRow('Flexure (Minor Axis)', Math.abs(inputs.Muy_or_May), flexure_y.phiMny_or_Mny_omega, Math.abs(inputs.Muy_or_May) / flexure_y.phiMny_or_Mny_omega, getStatus(Math.abs(inputs.Muy_or_May) / flexure_y.phiMny_or_Mny_omega), { check: flexure_y, details: flexure_y, reference: flexure_y.reference }),
        shear.phiVn_or_Vn_omega && createRow('Shear', Math.abs(inputs.Vu_or_Va), shear.phiVn_or_Vn_omega, Math.abs(inputs.Vu_or_Va) / shear.phiVn_or_Vn_omega, getStatus(Math.abs(inputs.Vu_or_Va) / shear.phiVn_or_Vn_omega), { check: shear, details: shear, reference: shear.reference }),
        interaction.ratio && createRow('Combined Axial & Flexure', interaction.ratio, 1.0, interaction.ratio, getStatus(interaction.ratio), { check: { Rn: 1.0, phi: 1.0, omega: 1.0 }, details: interaction, reference: interaction.reference }),
        web_crippling.applicable && createRow('Web Crippling', Math.abs(inputs.Vu_or_Va), web_crippling.phiRn_or_Rn_omega, Math.abs(inputs.Vu_or_Va) / web_crippling.phiRn_or_Rn_omega, getStatus(Math.abs(inputs.Vu_or_Va) / web_crippling.phiRn_or_Rn_omega), { check: web_crippling, details: web_crippling, reference: web_crippling.reference }),
        web_sidesway_buckling.applicable && createRow('Web Sidesway Buckling', Math.abs(inputs.Vu_or_Va), web_sidesway_buckling.phiRn_or_Rn_omega, Math.abs(inputs.Vu_or_Va) / web_sidesway_buckling.phiRn_or_Rn_omega, getStatus(Math.abs(inputs.Vu_or_Va) / web_sidesway_buckling.phiRn_or_Rn_omega), { check: web_sidesway_buckling, details: web_sidesway_buckling, reference: web_sidesway_buckling.reference }),
        torsion.applicable && createRow('Torsion', Math.abs(inputs.Tu_or_Ta), torsion.phiTn_or_Tn_omega, Math.abs(inputs.Tu_or_Ta) / torsion.phiTn_or_Tn_omega, getStatus(Math.abs(inputs.Tu_or_Ta) / torsion.phiTn_or_Tn_omega), { check: torsion, details: torsion, reference: torsion.reference }),
        shear_torsion_interaction.applicable && createRow('Combined Shear & Torsion', shear_torsion_interaction.ratio, 1.0, shear_torsion_interaction.ratio, getStatus(shear_torsion_interaction.ratio), { check: { Rn: 1.0 }, details: shear_torsion_interaction, reference: shear_torsion_interaction.reference }),
        combined_stress_H33.applicable && createRow('Combined Stresses (H3.3)', combined_stress_H33.ratio, 1.0, combined_stress_H33.ratio, getStatus(combined_stress_H33.ratio), { check: { Rn: 1.0 }, details: combined_stress_H33, reference: combined_stress_H33.reference }),
        deflection.ratio && createRow('Deflection', deflection.actual, deflection.allowable, deflection.ratio, getStatus(deflection.ratio), { check: { Rn: deflection.allowable }, details: deflection, reference: 'Serviceability' })
    ].filter(Boolean).join('');

    return `
        <div id="strength-checks-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center mb-2">
                <h3 class="report-header">Strength & Serviceability Checks (${inputs.design_method})</h3>
                <button data-copy-target-id="strength-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 results-table">
                    <thead><tr><th>Limit State</th><th>Demand</th><th>Capacity</th><th>Ratio</th><th>Status</th></tr></thead>
                    <tbody>${strengthRows}</tbody>
                </table>
            </div>
        </div>`;
}

function renderSteelResults(results) {
    lastSteelRunResults = results; // Cache for other functions
    const { inputs, properties, warnings, errors } = results;
    const resultsContainer = document.getElementById('steel-results-container');

    if (errors && errors.length > 0) {
        resultsContainer.innerHTML = renderValidationResults({ errors, warnings });
        return;
    }

    const inputSummaryHtml = renderSteelInputSummary(inputs);
    const propertySummaryHtml = renderSteelPropertySummary(properties);
    const slendernessChecksHtml = renderSlendernessChecks(results);
    const strengthChecksHtml = renderSteelStrengthChecks(results);

    const finalHtml = `
        <div id="steel-check-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end flex-wrap gap-2 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Show All Details</button>
                <button id="print-report-btn" class="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 text-sm">Print Report</button>
                <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Full Report</button>
            </div>
            <h2 class="report-title text-center">Steel Section Check Results (${inputs.design_method})</h2>
            ${inputSummaryHtml}
            ${propertySummaryHtml}
            ${slendernessChecksHtml}
            ${strengthChecksHtml}
        </div>
    `;
    resultsContainer.innerHTML = finalHtml;
}

// --- DOMContentLoaded: Initialize UI ---
document.addEventListener('DOMContentLoaded', () => {
    injectHeader({
        activePage: 'steel-check',
        pageTitle: 'AISC Steel Section Design Checker',
        headerPlaceholderId: 'header-placeholder'
    });

    injectFooter({
        footerPlaceholderId: 'footer-placeholder'
    });
    initializeSharedUI();

    function populateMaterialDropdowns() {
        const gradeOptions = Object.keys(AISC_SPEC.structuralSteelGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');

        const select = document.getElementById('steel_material');
        if (select) {
            select.innerHTML = gradeOptions;
            select.value = 'A992';
            select.addEventListener('change', (e) => {
                const grade = AISC_SPEC.getSteelGrade(e.target.value);
                if (grade) {
                    document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                    document.getElementById(e.target.dataset.fuTarget).value = grade.Fu;
                }
            });
            select.dispatchEvent(new Event('change'));
        }
    }

    const handleRunSteelCheck = createCalculationHandler({
        gatherInputsFunction: () => gatherInputsFromIds(steelCheckInputIds),
        storageKey: 'steel-check-inputs',
        validatorFunction: (inputs) => {
            lastSteelRunResults = null; // Clear previous results on new run
            return steelChecker.validateInputs(inputs);
        },
        calculatorFunction: steelChecker.run,
        renderFunction: renderSteelResults,
        resultsContainerId: 'steel-results-container',
        buttonId: 'run-steel-check-btn' // Add button ID for loading state
    });

    // --- Event Listeners ---
    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunSteelCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', createSaveInputsHandler(steelCheckInputIds, 'steel-check-inputs.txt'));
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', createLoadInputsHandler(steelCheckInputIds, handleRunSteelCheck));
    document.getElementById('section_type').addEventListener('change', updateGeometryInputsUI);
    document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);

    // --- Auto-save to Local Storage (with debouncing) ---
    const debouncedSave = debounce(() => {
        saveInputsToLocalStorage('steel-check-inputs', gatherInputsFromIds(steelCheckInputIds));
    }, 300);
    steelCheckInputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', debouncedSave);
    });

    // --- Initial Setup ---
    populateMaterialDropdowns();
    populateShapeDropdown();
    updateGeometryInputsUI();
    loadInputsFromLocalStorage('steel-check-inputs', steelCheckInputIds);

    // --- Results Container Event Delegation ---
    document.getElementById('steel-results-container').addEventListener('click', (event) => {
        const target = event.target;
        const toggleBtn = target.closest('.toggle-details-btn');
        const copyBtn = target.closest('.copy-section-btn');

        if (toggleBtn) {
            const detailId = toggleBtn.dataset.toggleId;
            const detailRow = document.getElementById(detailId);
            detailRow?.classList.toggle('is-visible');
            toggleBtn.textContent = detailRow?.classList.contains('is-visible') ? '[Hide]' : '[Show]';
        } else if (target.id === 'toggle-all-details-btn') {
            handleToggleAllDetails(target, '#steel-results-container');
        } else if (target.id === 'copy-report-btn') {
            handleCopyToClipboard('steel-check-report-content', 'feedback-message');
        } else if (target.id === 'download-pdf-btn') {
            handleDownloadPdf('steel-check-report-content', 'Steel-Check-Report.pdf');
        } else if (target.id === 'print-report-btn') {
            window.print();
        } else if (target.id === 'download-word-btn') {
            handleDownloadWord('steel-check-report-content', 'Steel-Check-Report.doc');
        } else if (copyBtn) {
            const targetId = copyBtn.dataset.copyTargetId;
            if (targetId) {
                handleCopyToClipboard(targetId, 'feedback-message');
            }
        }
    });
});