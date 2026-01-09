
class SteelMath {

    static getDesignFactor(design_method, phi, omega, jurisdiction) {
        if (jurisdiction === 'OSHA') return 0.25; // FOS = 4.0 -> phi = 1/4 = 0.25
        if (design_method === 'LRFD') return phi;
        return 1 / omega; // ASD
    }

    static checkFlexure(props, inputs) {
        if (props.type.endsWith('-Shape') || props.type === 'channel') return this.checkFlexure_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round' || props.type === 'Pipe') return this.checkFlexure_HSS(props, inputs);
        if (props.type === 'angle') return this.checkFlexure_Angle(props, inputs);
        return { phiMn_or_Mn_omega: 0 };
    }

    static calculate_Mn_yield(props, inputs) {
        // AISC F2.1: Yielding
        return inputs.Fy * props.Zx;
    }

    static calculate_Mn_ltb(props, inputs, Mp, My, Lp, Lr, c) {
        // AISC F2.2: Lateral-Torsional Buckling (LTB)
        const { Fy, E, Cb, Lb_input, aisc_standard } = inputs;
        const { Sx, rts, J, d, tf, Cw } = props;
        const Lb = Lb_input * 12;

        if (Lb <= Lp) {
            return Mp; // No LTB
        }

        const ho = d - tf; // Distance between flange centroids
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

    static calculate_Mn_flb(props, inputs, Mp, My) {
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

    static checkFlexure_IShape(props, inputs, isHighShear = false) {
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
        const Lp = 1.76 * props.rts * Math.sqrt(E / Fy);
        const ho = d - tf; // Distance between flange centroids
        const c = 1.0; // for doubly symmetric I-shapes
        let Lr;
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
            'Yielding (F2.1)': this.calculate_Mn_yield(props, inputs),
            'Lateral-Torsional Buckling (F2.2)': this.calculate_Mn_ltb(props, inputs, Mp, My, Lp, Lr, c),
            'Flange Local Buckling (F3)': this.calculate_Mn_flb(props, inputs, Mp, My),
            'Web Local Buckling (F4)': this.checkWebLocalBuckling(props, inputs, Mp, My),
            'Compression Flange Yielding (F5)': (lambda_w > lambda_r_w) ? this.checkSlenderWebFlexure(props, inputs, Mp, My) : Infinity,
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
        const factor = this.getDesignFactor(inputs.design_method, phi_b, omega_b, inputs.jurisdiction);
        const phiMn_or_Mn_omega = Mn * factor;

        return {
            phiMn_or_Mn_omega: phiMn_or_Mn_omega / 12, // to kip-ft
            isCompact, Mn, Lb, Lp, Lr, Rpg: 1.0, R_pv, governing_limit_state, phi: phi_b, omega: omega_b,
            reference: "AISC F2-F5",
            limit_states, // Pass the detailed results for the breakdown
            slenderness: { lambda_f, lambda_p_f, lambda_r_f, lambda_w, lambda_p_w, lambda_r_w }
        };
    }

    static checkFlexure_HSS(props, inputs) {
        const { Fy, E } = inputs;
        const { Zx, Sx, type } = props;
        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = this.getDesignFactor(inputs.design_method, phi_b, omega_b, inputs.jurisdiction);

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

    static checkFlexure_Angle(props, inputs) {
        const { Fy, E, Cb, Lb_input } = inputs;
        const { Zx, Sx, ry, d, bf, tf } = props;
        const Lb = Lb_input * 12;

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = this.getDesignFactor(inputs.design_method, phi_b, omega_b, inputs.jurisdiction);

        // F10.1 Yielding
        const My = 1.5 * Fy * Sx;
        const Mn_yield = My;

        // F10.2 LTB
        const Me = (0.46 * E * bf ** 2 * tf ** 2) / Lb;

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

    static checkFlexureMinorAxisComplete(props, inputs) {
        const { Fy, E, Cb, Lb_input, K } = inputs;
        const { Zy, Sy, Iy, J, Cw, d, bf, tf, tw, type } = props;
        const Lb = Lb_input * 12;

        const phi_b = 0.9;
        const omega_b = 1.67;
        const factor = this.getDesignFactor(inputs.design_method, phi_b, omega_b, inputs.jurisdiction);

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
            }
        } else if (type === 'HSS-round' || type === 'Pipe') {
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

    static checkCompression_IShape(props, inputs) {
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

    static checkCompression_HSS(props, inputs) {
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

    static checkCompression_Angle(props, inputs) {
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

    static checkCompression(props, inputs) {
        const { Fy, E, K, Lb_input } = inputs;
        const { Ag, type, d, bf, tf, tw, h } = props;

        const phi_c = 0.9;
        const omega_c = 1.67;
        const factor = this.getDesignFactor(inputs.design_method, phi_c, omega_c, inputs.jurisdiction);

        // --- 1. Slender Element Reduction Factor (Q) ---
        const Q_results = this.checkHSSLocalBuckling(props, inputs); // This function handles multiple types
        const Q = Q_results.reduction_factor || 1.0;

        // --- 2. Determine Elastic Buckling Stresses (Fe) for all modes ---
        let buckling_results;
        if (type.endsWith('-Shape') || type === 'channel') {
            buckling_results = this.checkCompression_IShape(props, inputs);
        } else if (type === 'Rectangular HSS' || type === 'HSS-round' || type === 'Pipe') {
            buckling_results = this.checkCompression_HSS(props, inputs);
        } else if (type === 'angle') {
            buckling_results = this.checkCompression_Angle(props, inputs);
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

    static checkTension(props, inputs) {
        const { Fy, Fu } = inputs;
        const { Ag } = props;

        const Pn_yield = Fy * Ag;
        const phi_ty = 0.90;
        const omega_ty = 1.67;
        const factor_yield = this.getDesignFactor(inputs.design_method, phi_ty, omega_ty, inputs.jurisdiction);
        const cap_yield = Pn_yield * factor_yield;

        const An_net = Ag;
        const Ae = 1.0 * An_net;
        const Pn_rupture = Fu * Ae;
        const phi_tr = 0.75;
        const omega_tr = 2.00;
        const factor_rupture = this.getDesignFactor(inputs.design_method, phi_tr, omega_tr, inputs.jurisdiction);
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

    static checkShear(props, inputs) {
        if (['W-Shape', 'S-Shape', 'M-Shape', 'HP-Shape', 'Channel'].includes(props.type)) return this.checkShear_IShape(props, inputs);
        if (props.type === 'Rectangular HSS' || props.type === 'HSS-round' || props.type === 'Pipe') return this.checkShear_HSS(props, inputs);
        return { phiVn_or_Vn_omega: 0 };
    }

    static checkShear_IShape(props, inputs) {
        const { Fy, E, aisc_standard, stiffener_spacing_a, Pu_or_Pa } = inputs;
        const { d, tw, h } = props;
        const Aw = d * tw;
        const a = stiffener_spacing_a; // clear distance between transverse stiffeners
        const phi_v = 0.9;
        const omega_v = 1.67;
        const factor = this.getDesignFactor(inputs.design_method, phi_v, omega_v, inputs.jurisdiction);
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
                    Cv = (1.51 * E * kv) / (h_tw ** 2 * Fy);
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
            const Vn_tfa = 0.6 * Fy * Aw * (Cv + (1 - Cv) / (1.15 * Math.sqrt(1 + a_h_ratio ** 2)));
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
            Vn, Cv, h_tw, governing_limit_state, tfa_details, Aw, // Added Aw
            reference: "AISC G2"
        };
    }

    static checkShear_HSS(props, inputs) {
        const { Fy, E } = inputs;
        const phi_v = inputs.section_type === 'Rectangular HSS' ? 0.9 : 1.0;
        const omega_v = 1.67;
        const factor = this.getDesignFactor(inputs.design_method, phi_v, omega_v, inputs.jurisdiction);

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
            } else if (h_tw <= limit2) {
                Cv = limit1 / h_tw;
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
            const Fcr_buckling1 = (1.60 * E) / (Math.sqrt(D_t) * Math.pow(D_t, 5 / 4));
            const Fcr_buckling2 = (0.78 * E) / Math.pow(D_t, 3 / 2);
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

    static calculateB1Factor(inputs, props, axis) {
        const { K, Lb_input, E, design_method, Pu_or_Pa, Cm } = inputs;
        const { Ag, Ix, Iy, ry } = props;

        const L = Lb_input * 12;
        const rx = Math.sqrt(Ix / Ag);
        const r = axis === 'x' ? rx : ry;

        const Pr = Math.abs(Pu_or_Pa);
        if (Pr === 0) return 1.0;

        const Pe_num = Math.PI ** 2 * E * (axis === 'x' ? Ix : Iy);
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

    static checkInteraction_Unsymmetric(inputs, props, comp_results) {
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
        const Mcw = (this.checkFlexure_Angle(props, inputs).phiMn_or_Mn_omega || 0) * 12; // in kip-in
        // Mcz is the capacity about the minor principal axis (z-z). Conservatively use yield moment.
        const Mcz = (design_method === 'LRFD' ? 0.9 : 1 / 1.67) * Fy * Math.min(Sx, Sy);

        // AISC Interaction Equation H2-1
        const ratio = (Pc > 0 ? Pr / Pc : 0) + (Mcw > 0 ? Mrw / Mcw : 0) + (Mcz > 0 ? Mrz / Mcz : 0);

        return {
            ratio,
            equation: 'H2-1',
            reference: "AISC H2 (Unsymmetric)",
            details: { Pr, Pc, Mrw, Mcw, Mrz, Mcz, alpha_deg: alpha_rad * 180 / Math.PI }
        };
    }

    static checkInteraction(inputs, props, comp_results, flex_results_x, flex_results_y) {
        const { Pu_or_Pa, Mux_or_Max, Muy_or_May, design_method } = inputs;

        const Pr = Math.abs(Pu_or_Pa);
        const Mrx = Math.abs(Mux_or_Max);
        const Mry = Math.abs(Muy_or_May);

        const Pc = comp_results.phiPn_or_Pn_omega;
        const Mcx = flex_results_x.phiMn_or_Mn_omega;
        const Mcy = flex_results_y.phiMny_or_Mny_omega || 0;

        // --- Unsymmetric Member Check (AISC H2) ---
        if (props.type === 'Angle' && Pu_or_Pa < 0) { // Interaction check for compression + flexure
            return this.checkInteraction_Unsymmetric(inputs, props, comp_results);
        }

        // Try to calculate B1 factors - catch instability error
        let B1x, B1y;
        try {
            B1x = this.calculateB1Factor(inputs, props, 'x');
            B1y = this.calculateB1Factor(inputs, props, 'y');
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
            ratio = pr_pc + (8.0 / 9.0) * ((B1x * Mrx / Mcx) + (B1y * Mry / Mcy));
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

    static checkShearTorsionInteraction(props, inputs, shear_results, torsion_results) {
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

    static checkCombinedStressH33(props, inputs, torsion_results) {
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

    static checkTorsionComplete(props, inputs) {
        const { Tu_or_Ta, Fy, E, Lb_input } = inputs;
        const { type } = props;

        if (Tu_or_Ta === 0) return { applicable: false };

        // Closed sections (HSS, Pipe) resist torsion primarily through St. Venant torsion.
        if (type === 'Rectangular HSS' || type === 'Round HSS' || type === 'Pipe') { // Already correct, but confirms logic
            return this.checkTorsion_HSS(props, inputs);
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
        const factor = this.getDesignFactor(inputs.design_method, phi_T, omega_T, inputs.jurisdiction);

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

    static checkTorsion_HSS(props, inputs) {
        const { Tu_or_Ta, Fy, E, design_method } = inputs;
        const { type, d, bf, tf, Ag } = props;

        const phi_T = 0.90;
        const omega_T = 1.67;
        const factor = this.getDesignFactor(design_method, phi_T, omega_T, inputs.jurisdiction);

        let Tn, governing_limit_state;

        if (type === 'Rectangular HSS') {
            // AISC H3.2 for Rectangular HSS
            const h = d - tf; // Use overall dimensions per AISC H3.2
            const b = bf - tf;
            // Torsional constant C from AISC H3.2, based on the area enclosed by the centerline of the section
            const C = 2 * (b * h) * tf;
            const Fcr_yield = 0.6 * Fy;
            const h_t = (d - 3 * tf) / tf; // Slenderness is based on flat width
            const Fcr_buckling = (h_t > 2.45 * Math.sqrt(E / Fy)) ? (0.6 * Fy * (2.45 * Math.sqrt(E / Fy)) / h_t) : Fcr_yield;
            const Fcr = Math.min(Fcr_yield, Fcr_buckling);
            Tn = Fcr * C;
            governing_limit_state = Fcr < Fcr_yield ? 'Torsional Buckling (H3)' : 'Torsional Yielding (H3)';
        } else { // Round HSS or Pipe
            // AISC H3.1 for Round HSS
            const D_t = d / tf;
            const Fcr_yield = 0.6 * Fy;
            const Fcr_buckling1 = (1.23 * E) / (Math.sqrt(D_t) * Math.pow(D_t, 5 / 4));
            const Fcr_buckling2 = (0.60 * E) / Math.pow(D_t, 3 / 2);
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

    static checkWebCrippling(props, inputs) {
        const { Fy, E, lb_bearing, is_end_bearing, k_des } = inputs;
        const { d, tf, tw } = props;

        if (lb_bearing <= 0) return { applicable: false };

        const phi = 0.75;
        const omega = 2.00;
        const factor = this.getDesignFactor(inputs.design_method, phi, omega, inputs.jurisdiction);

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
                Rn_crippling = 0.80 * tw ** 2 * (1 + 3 * (N_lb / d) * (tw / tf) ** 1.5) * common_term;
            } else {
                // CORRECTED: (4*N/d - 0.2) not (3*N/d - 0.2)
                Rn_crippling = 0.80 * tw ** 2 * (1 + (4 * N_lb / d - 0.2) * (tw / tf) ** 1.5) * common_term;
            }
        } else { // Interior load
            // Eq. J10-5
            if ((N_lb / d) <= 0.2) {
                Rn_crippling = 0.40 * tw ** 2 * (1 + 3 * (N_lb / d) * (tw / tf) ** 1.5) * common_term;
            } else {
                Rn_crippling = 0.40 * tw ** 2 * (1 + (4.5 * N_lb / d - 0.2) * (tw / tf) ** 1.5) * common_term;
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

    static checkSlenderWebFlexure(props, inputs, Mp, My) {
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

    static checkWebSideswayBuckling(props, inputs) {
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
        const Rn = (Cr * Aw * Fy) / (h_tw ** 2);
        const phi = 0.90;
        const omega = 1.67;
        const factor = this.getDesignFactor(design_method, phi, omega, inputs.jurisdiction);

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

    static checkWebLocalBuckling(props, inputs, Mp, My) {
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
            return this.checkSlenderWebFlexure(props, inputs, Mp, My);
        }
    }

    static checkHSSLocalBuckling(props, inputs) {
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
}
