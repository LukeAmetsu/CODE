// --- Global variables for the 3D scene ---
let lastSteelRunResults = null;

const steelCheckInputIds = [
    'design_method', 'aisc_standard', 'unit_system', 'steel_material', 'Fy', 'Fu', 'E', 'section_type',
    'd', 'bf', 'tf', 'tw', 'Ag_manual', 'I_manual', 'Sx_manual', 'Zx_manual', 'ry_manual', 'rts_manual', 'J_manual', 'Cw_manual',
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
        if (props.type === 'I-Shape' || props.type === 'channel') return checkFlexure_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round') return checkFlexure_HSS(props, inputs);
        if (props.type === 'angle') return checkFlexure_Angle(props, inputs);
        return { phiMn_or_Mn_omega: 0 };
    }

    // --- Refactored Flexure Limit State Functions for I-Shapes ---

    function calculate_Mn_yield(Fy, Zx) {
        // AISC F2.1: Yielding
        return Fy * Zx;
    }

    function calculate_Mn_ltb(Mp, My, Lb, Lp, Lr, Cb, E, Sx, rts, J, d, tf, aisc_standard) {
        // AISC F2.2: Lateral-Torsional Buckling (LTB)
        if (Lb <= Lp) {
            return Mp; // No LTB
        }

        if (Lb <= Lr) {
            // Inelastic LTB (AISC F2-2)
            const Mn = Cb * (Mp - (Mp - My) * ((Lb - Lp) / (Lr - Lp)));
            return Math.min(Mn, Mp);
        }

        // Elastic LTB (AISC F2-3)
        const ho = d - tf;
        const term1 = (Cb * Math.PI ** 2 * E) / Math.pow(Lb / rts, 2);
        let term2;

        if (aisc_standard === '360-22') {
            // AISC 360-22 Eq. F2-4
            const term2_inner = 0.078 * (J / (Sx * ho)) * Math.pow(Lb / rts, 2);
            term2 = Math.sqrt(1 + term2_inner);
        } else { // AISC 360-16
            const term2_inner = 0.078 * (J * c / (Sx * ho)) * Math.pow(Lb / rts, 2);
            term2 = Math.sqrt(1 + term2_inner);
        }

        const Fcr = term1 * term2;
        const Mn = Fcr * Sx;
        return Math.min(Mn, Mp);
    }

    function calculate_Mn_flb(Mp, My, lambda_f, lambda_p_f, lambda_r_f, E, Sx, h, tw) {
        // AISC F3.2: Flange Local Buckling (FLB)
        if (lambda_f <= lambda_p_f) {
            return Mp; // Compact flange
        }

        // Corrected kc calculation per user feedback
        // kc depends on web slenderness (h/tw), not flange slenderness.
        const kc = 4 / Math.sqrt(h / tw);
        const kc_lim = Math.max(0.35, Math.min(0.76, kc));

        if (lambda_f <= lambda_r_f) {
            // Noncompact flange (AISC F3-1)
            const ratio = (lambda_f - lambda_p_f) / (lambda_r_f - lambda_p_f);
            return Mp - (Mp - My) * ratio;
        }
        const Fcr_flb = (0.9 * E * kc_lim) / Math.pow(lambda_f, 2);
        return Fcr_flb * Sx;
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

        // --- Slenderness Checks (AISC B4) ---
        const lambda_f = bf / (2 * tf);
        const lambda_p_f = 0.38 * Math.sqrt(E / Fy);
        const lambda_r_f = 1.0 * Math.sqrt(E / Fy);
        const lambda_w = h / tw;
        const lambda_p_w = 3.76 * Math.sqrt(E / Fy);
        const lambda_r_w = 5.70 * Math.sqrt(E / Fy);
        const isCompact = (lambda_f <= lambda_p_f) && (lambda_w <= lambda_p_w);

        // --- LTB Parameters (AISC F2) ---
        const Lp = 1.76 * rts * Math.sqrt(E / Fy); // F2-5
        let Lr;
        if (aisc_standard === '360-22') {
            // CORRECT per AISC 360-22 Eq. F2-6:
            const ho = d - tf;
            const c = 1.0; // for doubly symmetric I-shapes
            Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt((J*c)/(Sx*ho) + Math.sqrt(((J*c)/(Sx*ho))**2 + 6.76*((0.7*Fy)/E)**2));
        } else { // AISC 360-16, Eq. F2-6
            const ho = d - tf;
            const c = 1.0; // For doubly symmetric I-shapes
            const term1 = (J * c) / (Sx * ho);
            const term2 = Math.pow(term1, 2) + 6.76 * Math.pow(0.7 * Fy / E, 2);
            Lr = 1.95 * rts * (E / (0.7 * Fy)) * Math.sqrt(term1 + Math.sqrt(term2));
        }

        // --- Calculate Nominal Capacities for Each Limit State ---
        const Mp = calculate_Mn_yield(Fy, Zx);
        const My = Fy * Sx;
        
        const limit_states = {
            'Yielding (F2.1)': Mp,
            'Lateral-Torsional Buckling (F2.2)': calculate_Mn_ltb(Mp, My, Lb, Lp, Lr, Cb, E, Sx, rts, J, d, tf, aisc_standard),
            'Flange Local Buckling (F3)': calculate_Mn_flb(Mp, My, lambda_f, lambda_p_f, lambda_r_f, E, Sx, h, tw),
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
            isCompact, Mn, Lb, Lp, Lr, Rpg: 1.0, R_pv, governing_limit_state,
            reference: "AISC F2, F3, F4, F5",
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
            } else if (lambda <= lambda_r) { // Noncompact
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
            } else if (lambda <= lambda_r) { // Noncompact
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
            // Rectangular HSS minor axis bending - AISC F7
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
            }
        } else if (type === 'HSS-round') {
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

    function checkCompression(props, inputs) {
        const { Fy, E, K, Lb_input, aisc_standard } = inputs;
        const { Ag, ry, Ix, Iy, J, Cw, type, d, bf, tf, tw, h, x_bar } = props;
        const Lc = K * Lb_input * 12;
        const G = E / (2 * (1 + 0.3));

        const phi_c = 0.9;
        const omega_c = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_c, omega_c);

        // Calculate reduction factor Q for slender elements (AISC E7)
        let Q = 1.0;
        if (type === 'I-Shape') {
            // Flange (unstiffened)
            const kc = 4 / Math.sqrt(h / tw);
            const kc_lim = Math.max(0.35, Math.min(0.76, kc));
            const lambda_f = bf / (2 * tf);
            // Per AISC Table B4.1b, Case 1 for unstiffened flanges
            const lambda_r_f = 0.56 * Math.sqrt(E / Fy);
            let Qs = 1.0;
            if (lambda_f > lambda_r_f) {
                // Corrected per AISC E7.1a for slender unstiffened elements. kc is not used.
                Qs = (0.9 * E) / (Fy * lambda_f**2);
            }

            // Web (stiffened)
            const lambda_w = h / tw;
            const lambda_r_w = 1.49 * Math.sqrt(E / Fy);
            let Qa = 1.0;
            if (lambda_w > lambda_r_w) {
                const term = Math.sqrt(E / Fy);
                const be = 1.92 * tw * term * (1 - 0.34 / lambda_w * term);
                Qa = Math.min(be / h, 1.0);
            }

            Q = Qs * Qa;
        } else if (type === 'Rectangular HSS') {
            const hss_local = checkHSSLocalBuckling(props, inputs);
            Q = hss_local.reduction_factor || 1.0;
        } else if (type === 'HSS-round') {
            const lambda = d / tf;
            const lambda_r = 0.11 * E / Fy;
            const lambda_max = 0.45 * E / Fy;
            if (lambda <= lambda_r) {
                Q = 1.0;
            } else if (lambda <= lambda_max) {
                Q = 0.038 * E / (Fy * lambda) + 2/3;
            } else {
                Q = 0.33 * E / (Fy * lambda**2);
            }
        }

        let Fe, buckling_mode;

        const rx = props.rx || Math.sqrt(Ix / Ag);
        const slenderness_x = (Lc / rx);
        const slenderness_y = (Lc / ry);
        const Fey = (Math.PI**2 * E) / (slenderness_y**2);

        if (type === 'HSS-round') {
            Fe = Fey;
            buckling_mode = 'Flexural Buckling (E3)';
        } else if (type === 'I-Shape' || type === 'Rectangular HSS') {
            const Kz = K;
            const Lz = Lc;
            const Fez_num = (Math.PI**2 * E * Cw) / ((Kz * Lz)**2) + (G * J);
            const Fez_den = Ix + Iy;
            const Fez = Fez_num / Fez_den;

            if (Fey <= Fez) {
                Fe = Fey;
                buckling_mode = 'Flexural Buckling (E3)';
            } else {
                Fe = Fez;
                buckling_mode = 'Torsional Buckling (E4)';
            }
        } else if (type === 'channel' || type === 'angle') {
            const Fex = (Math.PI**2 * E) / Math.pow(Lc / rx, 2);
            const Fey_calc = (Math.PI**2 * E) / Math.pow(Lc / ry, 2);

            const xo = x_bar || 0;
            const yo = 0;
            const ro_sq = xo**2 + yo**2 + (Ix + Iy)/Ag;

            const H = 1 - (xo**2 + yo**2)/ro_sq;
            const Fez = ( (Math.PI**2 * E * Cw) / (Lz**2) + G*J ) / (Ag * ro_sq);

            Fe = ((Fex + Fez) / (2*H)) * (1 - Math.sqrt(1 - (4*Fex*Fez*H) / (Fex+Fez)**2));
            buckling_mode = 'Flexural-Torsional Buckling (E4)';
        } else {
            Fe = Fey;
            buckling_mode = 'Flexural Buckling (E3)';
        }

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
            Pn, Fcr, Fe, buckling_mode, Q,
            reference: "AISC E3, E4, E7"
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
        if (props.type === 'I-Shape' || props.type === 'channel') return checkShear_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round') return checkShear_HSS(props, inputs);
        return { phiVn_or_Vn_omega: 0 };
    }

    function checkShear_IShape(props, inputs) {
        const { Fy, E, aisc_standard } = inputs;
        const { d, tw, h } = props;
        const Aw = d * tw;

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

        let Vn, Cv, governing_limit_state;

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

        const phiVn_or_Vn_omega = Vn * factor;
        return {
            phiVn_or_Vn_omega: phiVn_or_Vn_omega,
            Vn, Cv, h_tw, governing_limit_state,
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

            if (h_tw <= limit1) {
                Cv = 1.0;
                governing_limit_state = 'Shear Yielding (G5-2a)';
            } else if (h_tw <= limit2) {Cv = limit1 / h_tw;
                governing_limit_state = 'Inelastic Web Buckling (G5-2b)';
            } else {
                Cv = (1.51 * kv * E) / (Fy * h_tw * h_tw);
                governing_limit_state = 'Elastic Web Buckling (G5-3)';
            }
            Vn = 0.6 * Fy * Aw * Cv;
        } else { // Round HSS
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

    function checkInteraction(inputs, props, comp_results, flex_results_x, flex_results_y) {
        const { Pu_or_Pa, Mux_or_Max, Muy_or_May, design_method } = inputs;

        const Pr = Math.abs(Pu_or_Pa);
        const Mrx = Math.abs(Mux_or_Max);
        const Mry = Math.abs(Muy_or_May);

        const Pc = comp_results.phiPn_or_Pn_omega;
        const Mcx = flex_results_x.phiMn_or_Mn_omega;
        const Mcy = flex_results_y.phiMny_or_Mny_omega || 0;

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
        const { Tu_or_Ta, Fy, E, Lb_input, design_method } = inputs;
        const { J, Cw, d, tf, type, Ag } = props;

        if (Tu_or_Ta === 0) return { applicable: false };

        if (type === 'HSS-round' || type === 'Rectangular HSS') {
            return checkTorsion_HSS(props, inputs);
        }

        if (type !== 'I-Shape' && type !== 'channel') {
            return {
                applicable: true,
                phiTn_or_Tn_omega: 0,
                governing_limit_state: 'Not Implemented',
                reference: 'N/A',
                details: { sigma_w: 0, tau_sv: 0, beta: 0 }
            };
        }

        // --- Torsion for Open Sections (I-Shape, Channel) ---
        const G = E / (2 * (1 + 0.3));
        const L = Lb_input * 12;
        const alpha = Math.sqrt(G * J / (E * Cw));
        const beta = alpha * L;

        const phi_T = 0.9;
        const omega_T = 1.67;
        const factor = getDesignFactor(inputs.design_method, phi_T, omega_T);

        // Simplified warping stress (set to 0 for basic analysis)
        const sigma_w = 0;

        // St. Venant shear stress
        const t_max = Math.max(tf, tw); // Use thickest element for stress calc
        const tau_sv = (Tu_or_Ta * t_max) / J;

        const tau_y = 0.6 * Fy;
        // Corrected Torsional Yielding formula: T = tau * J / t_max
        const Tn_yield = tau_y * J / t_max;
        
        // No buckling check without proper Wn calculation
        const Tn = Tn_yield;

        return {
            applicable: true,
            phiTn_or_Tn_omega: Tn * factor,
            governing_limit_state: 'Torsional Yielding (Simplified)',
            Tn,
            details: { sigma_w, tau_sv, beta },
            reference: "AISC Design Guide 9 (Simplified)"
        };
    }

    function checkTorsion_HSS(props, inputs) {
        const { Tu_or_Ta, Fy, E, design_method } = inputs;
        const { type, d, bf, tf, Ag } = props;

        const phi_T = 0.9;
        const omega_T = 1.67;
        const factor = getDesignFactor(design_method, phi_T, omega_T);

        let Tn, governing_limit_state;

        if (type === 'Rectangular HSS') {
            // AISC H3.2 for Rectangular HSS
            const h = d - 3 * tf;
            const b = bf - 3 * tf;
            const C = 2 * (h + b) * tf;
            const Fcr_yield = 0.6 * Fy;
            const h_t = h / tf;
            const Fcr_buckling = (h_t > 2.45 * Math.sqrt(E/Fy)) ? (0.6 * Fy * (2.45 * Math.sqrt(E/Fy)) / h_t) : Fcr_yield;
            const Fcr = Math.min(Fcr_yield, Fcr_buckling);
            Tn = Fcr * C;
            governing_limit_state = Fcr < Fcr_yield ? 'Torsional Buckling (H3)' : 'Torsional Yielding (H3)';
        } else { // HSS-round - CORRECTED FORMULA
            // AISC H3.1 for Round HSS
            const D_t = d / tf;
            const Fcr_yield = 0.6 * Fy;
            const Fcr_buckling1 = (1.23 * E) / (Math.sqrt(D_t) * Math.pow(D_t, 5/4));
            const Fcr_buckling2 = (0.60 * E) / Math.pow(D_t, 3/2);
            const Fcr = Math.min(Math.max(Fcr_buckling1, Fcr_buckling2), Fcr_yield);
            
            // BETTER: Use the full formula
            // Tn = Fcr * (π/2) * (D - t)² * t
            const C = (Math.PI / 2) * Math.pow(d - tf, 2) * tf;
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
        inputs.An_net = inputs.Ag_manual;
        inputs.U_shear_lag = 1.0;

        const { errors, warnings } = validateInputs(inputs);
        if (inputs.Tu_or_Ta !== 0 && inputs.section_type === 'I-Shape') {
            warnings.push("Torsion analysis for I-shapes is a simplified approximation. See AISC Design Guide 9 for complete analysis.");
        }
        if (errors.length > 0) return { errors, warnings };

        const props = getSectionProperties(inputs);

        const shear_results = checkShear(props, inputs);
        const Aw = props.d * props.tw;
        const Vy = 0.6 * inputs.Fy * Aw;
        const phi_v = shear_results.phi || 0.9;
        const omega_v = shear_results.omega || 1.67;
        const shear_yield_capacity = inputs.design_method === 'LRFD' ? phi_v * Vy : Vy / omega_v;
        
        const isHighShear = Math.abs(inputs.Vu_or_Va) > 0.6 * shear_yield_capacity;

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
    if (inputs.section_type === 'Manual Input') {
        return {
            type: 'I-Shape', 
            Ag: inputs.Ag_manual, 
            Ix: inputs.I_manual, 
            Sx: inputs.Sx_manual, 
            Zx: inputs.Zx_manual,
            Iy: inputs.Iy_manual, 
            Sy: inputs.Sy_manual, 
            Zy: inputs.Zy_manual, 
            ry: inputs.ry_manual,
            rts: inputs.rts_manual, 
            J: inputs.J_manual,Cw: inputs.Cw_manual, 
            d: inputs.d,
            bf: inputs.bf, 
            tf: inputs.tf, 
            tw: inputs.tw, 
            h: inputs.d - 2 * inputs.tf, 
            k_des: inputs.tf
        };
    }

    if (inputs.section_type === 'I-Shape') {
        const { d, bf, tf, tw, k_des } = inputs;
        const h = d - 2 * k_des; // Corrected web height using k_des
        const Ag = 2 * bf * tf + (d - 2 * tf) * tw; // This is a standard approximation, but let's refine others.
        
        // More accurate Ix calculation considering fillets are ignored in the simplified formula
        const Ix = (bf * d**3 / 12) - 2 * (((bf - tw) / 2) * h**3 / 12);
        const Sx = Ix / (d / 2);
        const Zx = (bf * tf * (d - tf)) + (tw * (d - 2 * tf)**2 / 4);
        const Iy = (2 * tf * bf**3 / 12) + ((d - 2 * tf) * tw**3 / 12);
        const ry = Math.sqrt(Iy / Ag);
        const Sy = Iy / (bf / 2);
        const Zy = (tf * bf**2 / 2) + (tw**3 * (d - 2*tf) / 4);
        const J = (1 / 3) * (2 * bf * tf**3 + h * tw**3);
        const Cw = (Iy * (d - tf)**2) / 4; // More accurate Cw using center-to-center of flanges
        
        // CORRECTED: Add type guard for rts calculation
        let rts;
        if (Cw > 0 && Sx > 0 && Iy > 0) {
            rts = Math.sqrt(Math.sqrt(Iy * Cw) / Sx); // AISC F2-7 for doubly-symmetric I-shapes
        } else {
            rts = 0;
        }
        
        const rx = Math.sqrt(Ix / Ag);
        return { 
            type: 'I-Shape', 
            Ag, Ix, Sx, Zx, Iy, Sy, Zy, ry, rts, J, Cw, 
            d, bf, tf, tw, h, rx, 
            k_des
        };
    } else if (inputs.section_type === 'Rectangular HSS') {
        const { d: H, bf: B, tf: t } = inputs;
        const Ag = 2 * t * (H + B - 2 * t);
        const Ix = (B * H**3 / 12) - ((B - 2*t) * (H - 2*t)**3 / 12);
        const Zx = (B * H**2 / 4) - ((B - 2*t) * (H - 2*t)**2 / 4);
        const Sx = Ix / (H / 2);
        const Iy = (H * B**3 / 12) - ((H - 2*t) * (B - 2*t)**3 / 12);
        const ry = Math.sqrt(Iy / Ag);
        const Sy = Iy / (B / 2);
        const Zy = (H * B**2 / 4) - ((H - 2*t) * (B - 2*t)**2 / 4);
        const h = H - 2 * t;
        const rx = Math.sqrt(Ix / Ag);
        const J = (1 / 3) * 2 * t * (H + B - 2*t)**2; // Approximate torsional constant
        const Cw = 0; // Closed section
        return { 
            type: 'Rectangular HSS', 
            Ag, Ix, Sx, Zx, Iy, Sy, Zy, ry, h, 
            d: H, tw: t, tf: t, bf: B, rx, 
            k_des: inputs.k_des, J, Cw 
        };
    } else if (inputs.section_type === 'HSS/Pipe (Circular)') {
        const { d: OD, bf: t } = inputs;
        const ID = OD - 2 * t;
        const Ag = (Math.PI / 4) * (OD**2 - ID**2);
        const Ix = (Math.PI / 64) * (OD**4 - ID**4);
        const Sx = Ix / (OD / 2);
        const Zx = (OD**3 - ID**3) / 6;
        const ry = Math.sqrt(Ix / Ag);
        const J = (Math.PI / 32) * (OD**4 - ID**4);
        const rx = ry;
        const Cw = 0; // Closed section
        return { 
            type: 'HSS-round', 
            Ag, Ix, Sx, Zx, 
            Iy: Ix, Sy: Sx, Zy: Zx, 
            ry, J, Cw,
            d: OD, tf: t, rx, 
            k_des: inputs.k_des, 
            bf: OD 
        };
    } else if (inputs.section_type === 'channel') {
        const { d, bf, tf, tw } = inputs;
        const Ag = 2 * bf * tf + (d - 2 * tf) * tw;
        const Ix = (bf * d**3 / 12) - ((bf - tw) * (d - 2 * tf)**3 / 12);
        
        // CRITICAL: x_bar must be calculated or user-provided
        // Simplified approximation (REPLACE with database values or user input)
        const x_bar = bf / 3; // Rough approximation - NOT ACCURATE
        
        const Iy = (2 * tf * bf**3 / 12) + ((d - 2 * tf) * tw**3 / 12) + Ag * x_bar**2;
        const ry = Math.sqrt(Iy/Ag);
        const rx = Math.sqrt(Ix/Ag);
        const Sx = Ix / (d / 2);
        const Sy = Iy / bf; // Approximate
        const Zx = (bf * tf * (d - tf)) + (tw * (d - 2 * tf)**2 / 4);
        const Zy = Sy * 1.5; // Very rough approximation
        const h = d - 2 * tf;
        const J = (1/3) * (2 * bf * tf**3 + (d - 2 * tf) * tw**3);
        const Cw = (Ix * h**2) / 4; // Approximate
        
        return { 
            type: 'channel', 
            Ag, Ix, Iy, Sx, Sy, Zx, Zy, rx, ry, 
            d, bf, tf, tw, h, x_bar, J, Cw,
            k_des: inputs.k_des 
        };
    } else if (inputs.section_type === 'angle') {
        const { d: L1, bf: L2, tf: t } = inputs;
        const Ag = (L1 + L2 - t) * t;
        
        // Simplified geometric axis properties (principal axes different)
        const Ix_approx = t * L1**3 / 3;
        const Iy_approx = t * L2**3 / 3;
        const Sx = Ix_approx / (L1 / 2);
        const Sy = Iy_approx / (L2 / 2);
        const Zx = Sx * 1.5; // Very rough
        const Zy = Sy * 1.5;
        const rx = Math.sqrt(Ix_approx / Ag);
        const ry = Math.sqrt(Iy_approx / Ag);
        const J = (1 / 3) * (L1 + L2) * t**3;
        
        return { 
            type: 'angle', 
            Ag, 
            Ix: Ix_approx, Iy: Iy_approx,
            Sx, Sy, Zx, Zy,
            rx, ry,
            d: L1, bf: L2, tf: t, tw: t, 
            J, Cw: 0,
            k_des: t 
        };
    }
    return {};
}

function updateGeometryInputsUI() {
    const sectionType = document.getElementById('section_type').value;
    const d_label = document.getElementById('label-d');
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

    if (sectionType === 'I-Shape') {
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
    } else if (sectionType === 'Rectangular HSS') {
        d_label.textContent = 'Height (H)';
        bf_label.textContent = 'Width (B)';
        tf_label.textContent = 'Thickness (t)';
        tw_container.style.display = 'none';
    } else if (sectionType === 'HSS/Pipe (Circular)') {
        d_label.textContent = 'Diameter (D)';
        bf_label.textContent = 'Thickness (t)';
        d_container.style.display = 'block';
        bf_container.style.display = 'block';
        tf_container.style.display = 'none';
        tw_container.style.display = 'none';
    } else if (sectionType === 'channel' || sectionType === 'angle') {
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
    }
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
    const final_capacity = design_method === 'LRFD' ? (check?.Rn || 0) * factor_val : (check?.Rn || 0) / factor_val;

    const fmt = (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A';
    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;
    let content = '';

    switch (name) {
        case 'Flexure (Major Axis)':
        case 'Flexure (Minor Axis)':
            if (name.includes('Major')) {
                const flex_data = results.flexure;
                const LTB = flex_data.governing_limit_state.includes('LTB');
                const FLB = flex_data.governing_limit_state.includes('Flange');
                content = format_list([
                    `<u>Governing Limit State: <b>${flex_data.governing_limit_state}</b></u>`,
                    `Nominal Moment Capacity (M<sub>nx</sub>) = <b>${fmt(flex_data.Mn / 12)} kip-ft</b>`,
                    `Plastic Moment (M<sub>px</sub>) = F<sub>y</sub> &times; Z<sub>x</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Zx)} = ${fmt(inputs.Fy * properties.Zx / 12)} kip-ft`,
                    `Yield Moment (M<sub>yx</sub>) = F<sub>y</sub> &times; S<sub>x</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Sx)} = ${fmt(inputs.Fy * properties.Sx / 12)} kip-ft`,
                    `<b>${LTB ? '&#9658;' : ''} LTB Check:</b> L<sub>b</sub>=${fmt(flex_data.Lb/12)} ft, L<sub>p</sub>=${fmt(flex_data.Lp/12)} ft, L<sub>r</sub>=${fmt(flex_data.Lr/12)} ft, C<sub>b</sub>=${fmt(inputs.Cb)}`,
                    flex_data.slenderness ? `<b>${FLB ? '&#9658;' : ''} FLB Check:</b> &lambda;<sub>f</sub>=${fmt(flex_data.slenderness.lambda_f)}, &lambda;<sub>pf</sub>=${fmt(flex_data.slenderness.lambda_p_f)}, &lambda;<sub>rf</sub>=${fmt(flex_data.slenderness.lambda_r_f)}` : '',
                    `<u>Design Capacity</u>`,
                    `Capacity = ${capacity_eq.replace('R','M')} = ${fmt(flex_data.Mn / 12)} / ${factor_val} = <b>${fmt(flex_data.phiMn_or_Mn_omega)} kip-ft</b>`
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
                `<u>Governing Limit State: <b>${shear_data.governing_limit_state}</b></u>`,
                `Web Slenderness (h/t<sub>w</sub>) = ${fmt(shear_data.h_tw)}`,
                `Web Shear Coefficient (C<sub>v</sub>) = ${fmt(shear_data.Cv, 3)}`,
                `<u>Nominal Shear Strength (V<sub>n</sub>) per AISC G2</u>`,
                `V<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>w</sub> &times; C<sub>v</sub>`,
                `V<sub>n</sub> = 0.6 &times; ${fmt(inputs.Fy)} &times; ${fmt(properties.d * properties.tw)} &times; ${fmt(shear_data.Cv, 3)} = <b>${fmt(shear_data.Vn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq.replace('R','V')} = ${fmt(shear_data.Vn)} / ${factor_val} = <b>${fmt(shear_data.phiVn_or_Vn_omega)} kips</b>`
            ]);
            break;

        case 'Compression':
            const comp_data = results.axial;
            content = format_list([
                `<u>Governing Limit State: <b>${comp_data.buckling_mode}</b></u>`,
                `Slender Element Reduction Factor (Q) = ${fmt(comp_data.Q, 3)}`,
                `Elastic Buckling Stress (F<sub>e</sub>) = ${fmt(comp_data.Fe)} ksi`,
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
    const fmt = (val, dec = 2) => (typeof val === 'number' && isFinite(val)) ? val.toFixed(dec) : 'N/A';

    const rows = [
        `<tr><td>Section Type</td><td>${properties.type}</td></tr>`,
        `<tr><td>Gross Area (A<sub>g</sub>)</td><td>${fmt(properties.Ag, 2)} in²</td></tr>`,
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
    if (!flexure.slenderness) return ''; // Only render if slenderness data is available

    const { lambda_f, lambda_p_f, lambda_r_f, lambda_w, lambda_p_w, lambda_r_w } = flexure.slenderness;
    const getStatus = (lambda, lambda_p, lambda_r) => {
        if (lambda <= lambda_p) return '<span class="pass">Compact</span>';
        if (lambda <= lambda_r) return '<span class="warn">Non-Compact</span>';
        return '<span class="fail">Slender</span>';
    };

    const rows = [
        `<tr><td>Flange Slenderness (b<sub>f</sub>/2t<sub>f</sub>)</td><td>${lambda_f.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p_f.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r_f.toFixed(2)}</td><td>${getStatus(lambda_f, lambda_p_f, lambda_r_f)}</td></tr>`,
        `<tr><td>Web Slenderness (h/t<sub>w</sub>)</td><td>${lambda_w.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p_w.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r_w.toFixed(2)}</td><td>${getStatus(lambda_w, lambda_p_w, lambda_r_w)}</td></tr>`
    ];

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
    const getStatus = (ratio) => (isFinite(ratio) && ratio <= 1.0) ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>';

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
        flexure.phiMn_or_Mn_omega && createRow('Flexure (Major Axis)', Math.abs(inputs.Mux_or_Max), flexure.phiMn_or_Mn_omega, Math.abs(inputs.Mux_or_Max) / flexure.phiMn_or_Mn_omega, getStatus(Math.abs(inputs.Mux_or_Max) / flexure.phiMn_or_Mn_omega), { check: flexure, details: flexure, reference: flexure.reference }),
        flexure_y.phiMny_or_Mny_omega && createRow('Flexure (Minor Axis)', Math.abs(inputs.Muy_or_May), flexure_y.phiMny_or_Mny_omega, Math.abs(inputs.Muy_or_May) / flexure_y.phiMny_or_Mny_omega, getStatus(Math.abs(inputs.Muy_or_May) / flexure_y.phiMny_or_Mny_omega), { check: flexure_y, details: flexure_y, reference: flexure_y.reference }),
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