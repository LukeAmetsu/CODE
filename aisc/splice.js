// --- Diagram Drawing Functions (Global Scope) ---
function drawFlangeDiagram() {
    const svg = document.getElementById('flange-svg');
    if (!svg) return;
    svg.innerHTML = ''; // Clear previous drawing

    const getVal = id => parseFloat(document.getElementById(id).value) || 0;
    
    // Get inputs
    const H_fp = getVal('H_fp');
    const member_bf = getVal('member_bf');
    const gap = getVal('gap');
    const Nc = getVal('Nc_fp');
    const Nr = getVal('Nr_fp');
    const S1 = getVal('S1_col_spacing_fp');
    const S2 = getVal('S2_row_spacing_fp');
    const S3 = getVal('S3_end_dist_fp');
    const g = getVal('g_gage_fp');
    const D_fp = getVal('D_fp');
    const L_fp = getVal('L_fp') / 2.0; // L_fp is now length per side

    // Drawing parameters
    const W = 500, H = 250;
    const pad = 40;
    const total_len = gap + 2 * L_fp;
    const total_h = Math.max(H_fp, member_bf);
    const scale = Math.min((W - 2 * pad) / total_len, (H - 2 * pad) / total_h);
    if (!isFinite(scale) || scale <= 0) return;

    const cx = W / 2;
    const cy = H / 2;
    const sg = gap * scale;
    const sbf = member_bf * scale;
    const sH_fp = H_fp * scale;
    const bolt_r = Math.max(0, (D_fp * scale) / 2);

    const ns = "http://www.w3.org/2000/svg";
    const createEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };
    
    // Draw Member Flange
    svg.appendChild(createEl('rect', { x: cx - sg/2 - sbf/2, y: cy - sbf/2, width: sbf, height: sbf, class: 'svg-member' }));
    svg.appendChild(createEl('rect', { x: cx + sg/2 - sbf/2, y: cy - sbf/2, width: sbf, height: sbf, class: 'svg-member' }));
    
    // Draw Plate
    const plate_len = L_fp * scale;
    svg.appendChild(createEl('rect', { x: cx - sg/2 - plate_len, y: cy - sH_fp/2, width: plate_len, height: sH_fp, class: 'svg-plate' }));
    svg.appendChild(createEl('rect', { x: cx + sg/2, y: cy - sH_fp/2, width: plate_len, height: sH_fp, class: 'svg-plate' }));

    // Draw Bolts (one side)
    // Position bolts relative to the gap edge using S3.
    const x_plate_edge_gap = cx + sg/2;
    const x_first_bolt_col = x_plate_edge_gap + S3 * scale;
    const x_last_bolt_col = x_first_bolt_col + (Nc > 1 ? (Nc - 1) * S1 * scale : 0);

    const start_y_top = cy - (g * scale)/2;
    const start_y_bottom = cy + (g * scale)/2;

    for (let i = 0; i < Nc; i++) {
        const bolt_cx = x_first_bolt_col + i * S1 * scale; // This is for the right side
        for (let j = 0; j < Nr; j++) {
            // Draw top and bottom bolts for each column
            svg.appendChild(createEl('circle', { cx: bolt_cx, cy: start_y_top - j * S2 * scale, r: bolt_r, class: 'svg-bolt' }));
            svg.appendChild(createEl('circle', { cx: bolt_cx, cy: start_y_bottom + j * S2 * scale, r: bolt_r, class: 'svg-bolt' }));
            // Draw mirrored bolts on the left side
            const mirrored_bolt_cx = cx - sg/2 - S3 * scale - i * S1 * scale;
            svg.appendChild(createEl('circle', { cx: mirrored_bolt_cx, cy: start_y_top - j * S2 * scale, r: bolt_r, class: 'svg-bolt' }));
            svg.appendChild(createEl('circle', { cx: mirrored_bolt_cx, cy: start_y_bottom + j * S2 * scale, r: bolt_r, class: 'svg-bolt' }));
        }
    }

    // Draw Dimensions
    const dim_y = cy + sH_fp/2 + 20;
    const x_first_bolt = x_first_bolt_col;
    const x_last_bolt = x_last_bolt_col;
    const x_plate_end = cx + sg/2 + plate_len;
    const end_dist_from_last_bolt = (x_plate_end - x_last_bolt) / scale;

    // Dimension: gap edge to first bolt
    svg.appendChild(createEl('line', { x1: x_plate_edge_gap, y1: dim_y-5, x2: x_plate_edge_gap, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_first_bolt, y1: dim_y-5, x2: x_first_bolt, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_plate_edge_gap, y1: dim_y, x2: x_first_bolt, y2: dim_y, class:'svg-dim'}));
    svg.appendChild(createEl('text', { x: x_plate_edge_gap + (x_first_bolt - x_plate_edge_gap)/2, y: dim_y-5, class:'svg-dim-text' })).textContent = `S3=${S3}"`;

    // Dimension: bolt group
    if (Nc > 1) {
        svg.appendChild(createEl('line', { x1: x_first_bolt, y1: dim_y-5, x2: x_first_bolt, y2: dim_y+5, class:'svg-dim'}));
        svg.appendChild(createEl('line', { x1: x_last_bolt, y1: dim_y-5, x2: x_last_bolt, y2: dim_y+5, class:'svg-dim'}));
        svg.appendChild(createEl('line', { x1: x_first_bolt, y1: dim_y, x2: x_last_bolt, y2: dim_y, class:'svg-dim'}));
        svg.appendChild(createEl('text', { x: x_first_bolt + (x_last_bolt - x_first_bolt)/2, y: dim_y-5, class:'svg-dim-text' })).textContent = `${Nc-1}@${S1}"=${((Nc-1)*S1).toFixed(3)}"`
    }

    // Dimension: last bolt to end of plate (S3)
    svg.appendChild(createEl('line', { x1: x_last_bolt, y1: dim_y-5, x2: x_last_bolt, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_plate_end, y1: dim_y-5, x2: x_plate_end, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_last_bolt, y1: dim_y, x2: x_plate_end, y2: dim_y, class:'svg-dim'}));
    svg.appendChild(createEl('text', { x: x_last_bolt + (x_plate_end - x_last_bolt)/2, y: dim_y-5, class:'svg-dim-text' })).textContent = `${end_dist_from_last_bolt.toFixed(3)}"`

    // Gage
    const dim_x = cx - sg/2 - plate_len - 20;
    const start_y = cy - (g * scale)/2; // for dimension line placement
    svg.appendChild(createEl('line', { x1: dim_x-5, y1: start_y, x2: dim_x+5, y2: start_y, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: dim_x-5, y1: cy + g*scale/2, x2: dim_x+5, y2: cy + g*scale/2, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: dim_x, y1: start_y, x2: dim_x, y2: cy + g*scale/2, class:'svg-dim'}));
    svg.appendChild(createEl('text', { x: dim_x-10, y: cy, class:'svg-dim-text', transform:`rotate(-90 ${dim_x-10},${cy})`})).textContent = `g=${g}"`;
}

function drawWebDiagram() {
    const svg = document.getElementById('web-svg');
    if (!svg) return;
    svg.innerHTML = ''; // Clear previous drawing

    const getVal = id => parseFloat(document.getElementById(id).value) || 0;
    
    // Get inputs
    const H_wp = getVal('H_wp');
    const member_d = getVal('member_d');
    const member_tf = getVal('member_tf');
    const gap = getVal('gap');
    const Nc = getVal('Nc_wp');
    const Nr = getVal('Nr_wp');
    const S4 = getVal('S4_col_spacing_wp');
    const S5 = getVal('S5_row_spacing_wp');
    const S6 = getVal('S6_end_dist_wp');
    const D_wp = getVal('D_wp');
    const L_wp = getVal('L_wp') / 2.0; // L_wp is now length per side

    // Drawing parameters
    const W = 500, H = 300;
    const pad = 40;
    const total_len = gap + 2 * L_wp;
    const total_h = member_d; // Use member depth for vertical scale
    const scale = Math.min((W - 2 * pad) / total_len, (H - 2 * pad) / total_h);
    if (!isFinite(scale)) return;

    const cx = W / 2;
    const cy = H / 2;
    const sg = gap * scale;
    const sd = member_d * scale;
    const stf = member_tf * scale;
    const sH_wp = H_wp * scale;
    const bolt_r = Math.max(0, (D_wp * scale) / 2);

    const ns = "http://www.w3.org/2000/svg";
    const createEl = (tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const k in attrs) el.setAttribute(k, attrs[k]);
        return el;
    };
    
    // Draw Member Profile
    const member_len = 100; // arbitrary length for visual
    // Left member
    svg.appendChild(createEl('rect', { x: cx - sg/2 - member_len, y: cy - sd/2, width: member_len, height: sd, class: 'svg-member', fill: 'none' }));
    svg.appendChild(createEl('rect', { x: cx - sg/2 - member_len, y: cy - sd/2, width: member_len, height: stf, class: 'svg-member' }));
    svg.appendChild(createEl('rect', { x: cx - sg/2 - member_len, y: cy + sd/2 - stf, width: member_len, height: stf, class: 'svg-member' }));
    // Right member
    svg.appendChild(createEl('rect', { x: cx + sg/2, y: cy - sd/2, width: member_len, height: sd, class: 'svg-member', fill: 'none' }));
    svg.appendChild(createEl('rect', { x: cx + sg/2, y: cy - sd/2, width: member_len, height: stf, class: 'svg-member' }));
    svg.appendChild(createEl('rect', { x: cx + sg/2, y: cy + sd/2 - stf, width: member_len, height: stf, class: 'svg-member' }));

    // Draw Plate
    const plate_len = L_wp * scale;
    svg.appendChild(createEl('rect', { x: cx - sg/2 - plate_len, y: cy - sH_wp/2, width: plate_len, height: sH_wp, class: 'svg-plate' }));
    svg.appendChild(createEl('rect', { x: cx + sg/2, y: cy - sH_wp/2, width: plate_len, height: sH_wp, class: 'svg-plate' }));
    
    // Draw Bolts
    const x_plate_edge_gap_right = cx + sg/2;
    const x_first_bolt_col_right = x_plate_edge_gap_right + S6 * scale;
    const start_y = cy - ((Nr-1)*S5*scale)/2;
     for (let i = 0; i < Nc; i++) {
        const bolt_cx_right = x_first_bolt_col_right + i * S4 * scale;
        const bolt_cx_left = W - bolt_cx_right;
        for (let j = 0; j < Nr; j++) {
            svg.appendChild(createEl('circle', { cx: bolt_cx_right, cy: start_y + j * S5 * scale, r: bolt_r, class: 'svg-bolt' }));
            svg.appendChild(createEl('circle', { cx: bolt_cx_left, cy: start_y + j * S5 * scale, r: bolt_r, class: 'svg-bolt' }));
        }
    }

    // Draw Dimensions
    const dim_y = cy + sd/2 + 20;
    const x_first_bolt = x_first_bolt_col_right;
    const x_last_bolt = x_first_bolt_col_right + (Nc > 1 ? (Nc - 1) * S4 * scale : 0);
    const x_plate_end = x_plate_edge_gap_right + plate_len;
    const end_dist_from_last_bolt = (x_plate_end - x_last_bolt) / scale;

    // Dimension: gap edge to first bolt (S6)
    svg.appendChild(createEl('line', { x1: x_plate_edge_gap_right, y1: dim_y-5, x2: x_plate_edge_gap_right, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_first_bolt, y1: dim_y-5, x2: x_first_bolt, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_plate_edge_gap_right, y1: dim_y, x2: x_first_bolt, y2: dim_y, class:'svg-dim'}));
    svg.appendChild(createEl('text', { x: x_plate_edge_gap_right + (x_first_bolt - x_plate_edge_gap_right)/2, y: dim_y-5, class:'svg-dim-text' })).textContent = `S6=${S6}"`;

    // Dimension: bolt group (S4)
    if (Nc > 1) {
       svg.appendChild(createEl('line', { x1: x_first_bolt, y1: dim_y-5, x2: x_first_bolt, y2: dim_y+5, class:'svg-dim'}));
       svg.appendChild(createEl('line', { x1: x_last_bolt, y1: dim_y-5, x2: x_last_bolt, y2: dim_y+5, class:'svg-dim'}));
       svg.appendChild(createEl('line', { x1: x_first_bolt, y1: dim_y, x2: x_last_bolt, y2: dim_y, class:'svg-dim'}));
       svg.appendChild(createEl('text', { x: x_first_bolt + (x_last_bolt - x_first_bolt)/2, y: dim_y-5, class:'svg-dim-text' })).textContent = `${Nc-1}@${S4}"=${((Nc-1)*S4).toFixed(3)}"`
    }

    // Dimension: last bolt to end of plate
    svg.appendChild(createEl('line', { x1: x_last_bolt, y1: dim_y-5, x2: x_last_bolt, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_plate_end, y1: dim_y-5, x2: x_plate_end, y2: dim_y+5, class:'svg-dim'}));
    svg.appendChild(createEl('line', { x1: x_last_bolt, y1: dim_y, x2: x_plate_end, y2: dim_y, class:'svg-dim'}));
    svg.appendChild(createEl('text', { x: x_last_bolt + (x_plate_end - x_last_bolt)/2, y: dim_y-5, class:'svg-dim-text' })).textContent = `${end_dist_from_last_bolt.toFixed(3)}"`

    // Dimension: row spacing (S5)
    const dim_x = cx - sg/2 - plate_len - 20;
    if(Nr > 1) {
        svg.appendChild(createEl('line', { x1: dim_x-5, y1: start_y, x2: dim_x+5, y2: start_y, class:'svg-dim'}));
        svg.appendChild(createEl('line', { x1: dim_x-5, y1: start_y+S5*scale, x2: dim_x+5, y2: start_y+S5*scale, class:'svg-dim'}));
        svg.appendChild(createEl('line', { x1: dim_x, y1: start_y, x2: dim_x, y2: start_y+S5*scale, class:'svg-dim'}));
        svg.appendChild(createEl('text', { x: dim_x-10, y: start_y+(S5*scale)/2, class:'svg-dim-text', transform:`rotate(-90 ${dim_x-10},${start_y+(S5*scale)/2})`})).textContent = `${Nr-1}@S5=${S5}"`;
    }
}

// --- Main Calculator Logic (DOM interaction and event handling) ---
const spliceCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
    const { PI, sqrt, min, max, abs } = Math;
    const E_MOD = 29000.0; // ksi
    
    function checkBoltShear(grade, threadsIncl, db, numPlanes = 1, fastenerPatternLength = 0) {
    const { Fnv, wasReduced } = AISC_SPEC.getFnv(grade, threadsIncl, fastenerPatternLength);
    const Ab = PI * (db ** 2) / 4.0;
    return { Rn: Fnv * Ab * numPlanes, phi: 0.75, omega: 2.00, Fnv, Ab, num_planes: numPlanes, wasReduced };
}

function checkBoltBearing(db, t_ply, Fu_ply, le, s, isEdgeBolt, deformationIsConsideration, hole_dia) {
    // AISC 360-22 Eq J3-6.
    const tearout_coeff = deformationIsConsideration ? 1.5 : 1.2;
    const bearing_coeff = deformationIsConsideration ? 3.0 : 2.4;
    const Lc = isEdgeBolt ? le - hole_dia / 2.0 : s - hole_dia;
    if (Lc < 0) return { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 }; 

    const Rn_tearout = tearout_coeff * Lc * t_ply * Fu_ply;
    const Rn_bearing = bearing_coeff * db * t_ply * Fu_ply;
    return { Rn: min(Rn_tearout, Rn_bearing), phi: 0.75, omega: 2.00, Lc, Rn_tearout, Rn_bearing };
}

/**
 * Computes the shear lag factor U for a bolted splice plate per AISC D3.
 * @param {number} plate_width - The width of the splice plate.
 * @param {number} gage - The bolt gage across the plate width.
 * @param {number} num_fastener_rows - The number of fastener rows across the plate width (e.g., 2 for a typical flange splice).
 * @param {number} conn_length - The length of the connection (distance between first and last bolts).
 * @returns {{U: number, U_case2: number, U_case7: number, x_bar: number}}
 */
function computeShearLagFactorU(plate_width, gage, num_fastener_rows, conn_length) {
    if (plate_width <= 0 || conn_length <= 0 || num_fastener_rows <= 0) {
        return { U: 1.0, U_case2: 1.0, U_case7: 1.0, x_bar: 0 };
    }

    // AISC D3.1, Case 2: For plates with fasteners. U = 1 - (x_bar / L)
    // x_bar is the distance from the centroid of the connected area to the plane of connection.
    // For a symmetric splice plate, the centroid of the plate is at plate_width / 2.
    // The centroid of the connected area (the two lines of bolts) is also at plate_width / 2.
    // Therefore, x_bar is 0 for the plate as a whole.
    // However, for the failure of one half of the plate, x_bar is the distance from the centroid
    // of the half-plate to the bolt line.
    const x_bar = (plate_width / 4); // Centroid of T-section from bolt line.
    const U_case2 = 1.0 - (x_bar / conn_length);

    // AISC D3.1, Case 7: For W, M, S shapes, but can be conservatively applied to flange plates.
    // bf/d ratio is analogous to plate_width / gage
    const U_case7 = (plate_width >= (2/3) * gage) ? 0.90 : 0.85;

    return { U: Math.min(1.0, Math.max(U_case2, U_case7)), U_case2, U_case7, x_bar };
}

function checkGrossSectionYielding(Ag, Fy) {
    // AISC 360-22 Eq J4-1
    return { Rn: Fy * Ag, phi: 0.90, omega: 1.67, Ag, Fy };
}

function checkNetSectionFracture(An, Fu, U) {
    // AISC 360-22 Eq J4-2
    const Ae = U * An; // This is a detail for the breakdown
    return { Rn: Fu * Ae, phi: 0.75, omega: 2.00, An, Fu, U, Ae }; // Keep Ae for rendering
}

function checkBlockShear(Anv, Agv, Ant, Fu, Fy, num_tension_rows) {
    // AISC 360-22 Eq J4-5
    // The shear lag factor Ubs is 1.0 when the tension stress is uniform (e.g., single row of bolts).
    // Ubs is 0.5 when the tension stress is nonuniform (e.g., multiple rows of bolts).
    // This logic applies to the tension plane of the block shear failure.
    const Ubs = num_tension_rows > 1 ? 0.5 : 1.0;

    if (Anv <= 0 || Agv <= 0 || Ant < 0) return { Rn: 0, phi: 0.75, omega: 2.00, Anv, Agv, Ant, Fu, Fy, Ubs, path_rupture: 0, path_yield: 0 };
    const tension_term = Ubs * Fu * Ant;
    const path_rupture = (0.6 * Fu * Anv) + tension_term;
    const path_yield = (0.6 * Fy * Agv) + tension_term;
    const Rn = Math.min(path_rupture, path_yield);
    return { Rn, phi: 0.75, omega: 2.00, Anv, Agv, Ant, Fu, Fy, Ubs, path_rupture, path_yield };
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

function checkPlateCompression(Ag, Fy, t, unbraced_length, k=0.65) {
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

function checkBeamFlexuralRupture(Sx, Fu, d, bf, tf, nr_bolts_flange, hole_dia_net_area) { 
    // AISC 360-22 Section F13. Rupture limit state uses Fu.
    // This is a conservative approximation. For final design, use full AISC F13 procedures.
    const Afg = bf * tf;
    const Afn = (bf - nr_bolts_flange * hole_dia_net_area) * tf;
    const Tn = Fu * Afn; // Nominal tensile capacity of net flange area
    const z_est = d - tf; // Standard approximation for lever arm
    const Mn_rupture_kip_in = Tn * z_est;
    return { Rn: Mn_rupture_kip_in, phi: 0.75, omega: 2.00, Mn_rupture: Mn_rupture_kip_in, Afg, Afn, Tn, z_est, Sx, Fu };
}
function checkBoltShearTensionInteraction(Tu, Vu, grade, threadsIncl, db, design_method) {
    // AISC 360-22 Section J3.9
    const threadsKey = !!threadsIncl; // Coerce to boolean
    const FntMap = { "A325": 90.0, "A490": 113.0, "F3148": 90.0 }; // Table J3.2
    const FnvMap = { "A325": {true: 54.0, false: 68.0}, "A490": {true: 68.0, false: 84.0}, "F3148": {true: 65.0, false: 81.0} }; // Table J3.2
    
    const Fnt = FntMap[grade] ?? 0;
    const Fnv = FnvMap[grade]?.[threadsKey] ?? 0;
    const Ab = PI * (db**2) / 4.0;

    if (Ab === 0 || Fnv === 0) return { Rn: 0, phi: 0.75, omega: 2.00 };

    const fv = Vu / Ab; // Required shear stress

    let F_nt_prime;
    if (design_method === 'LRFD') {
        const phi_v = 0.75; // phi for bolt shear
        F_nt_prime = 1.3 * Fnt - (Fnt / (phi_v * Fnv)) * fv;
    } else { // ASD
        const omega_v = 2.00; // omega for bolt shear
        F_nt_prime = 1.3 * Fnt - (omega_v * Fnt / Fnv) * fv;
    }
    
    F_nt_prime = Math.min(F_nt_prime, Fnt); // Per J3.9, F'nt shall not exceed Fnt

    const Rn = F_nt_prime * Ab; // Nominal tensile strength adjusted for shear
    return { Rn, phi: 0.75, omega: 2.00, Fnt, Fnv, Ab, fv, F_nt_prime, Tu, Vu }; // phi/omega for tension are used
}

function calculateWebSpliceEccentricity(V_load, gap, Nc, Nr, S_col, S_row, S_end) {
    const num_bolts = Nc * Nr;
    if (num_bolts === 0) return { max_R: 0, eccentricity: 0, M_ecc: 0, Ip: 0, f_vy_direct: 0, f_vx_moment: 0, f_vy_moment: 0, num_bolts: 0 }; 

    // Eccentricity from bolt group centroid to the splice centerline
    const eccentricity = S_end + (Nc - 1) * S_col / 2.0 + gap / 2.0;
    const M_ecc = V_load * eccentricity;

    let Ip = 0;
    const crit_x = (Nc - 1) * S_col / 2.0;
    const crit_y = (Nr - 1) * S_row / 2.0;

    for (let i = 0; i < Nc; i++) {
        for (let j = 0; j < Nr; j++) {
            const dx = i * S_col - crit_x;
            const dy = j * S_row - crit_y;
            Ip += dx**2 + dy**2;
        }
    }

    if (Ip === 0) return { max_R: num_bolts > 0 ? V_load : 0, eccentricity, M_ecc, Ip, f_vy_direct: V_load/num_bolts, f_vx_moment: 0, f_vy_moment: 0, num_bolts }; 

    const f_vy_direct = V_load / num_bolts;
    const f_vx_moment = (M_ecc * crit_y) / Ip;
    const f_vy_moment = (M_ecc * crit_x) / Ip;
    const max_R = sqrt(f_vx_moment**2 + (f_vy_direct + f_vy_moment)**2);
    return { max_R, eccentricity, M_ecc, Ip, f_vy_direct, f_vx_moment, f_vy_moment, num_bolts };
}

function checkPryingAction(t_plate, Fy_plate, b, a, p, d_bolt, d_hole, B_bolt) {
    // Per AISC Manual Part 9
    if (p <= 0 || Fy_plate <= 0 || B_bolt <= 0) return { Q: 0, tc: Infinity, alpha_prime: 0 };

    const b_prime = b - d_bolt / 2.0;
    const a_prime = min(a + d_bolt / 2.0, 1.25 * b_prime);

    if (a_prime <= 0 || b_prime < 0) return { Q: 0, tc: Infinity, alpha_prime: 0 };

    // d_hole is the nominal hole diameter per Table J3.3
    const rho = b_prime / a_prime;
    const delta = 1 - (d_hole / p);

    if (delta < 0) return { Q: Infinity, tc: 0, alpha_prime: 0 }; // Invalid geometry

    // Critical thickness
    const tc = sqrt((4 * B_bolt * b_prime) / (p * Fy_plate));

    let Q = 0;
    let alpha_prime = 0;
    if (t_plate < tc) {
        alpha_prime = (1 / delta) * (((t_plate / tc)**2) - 1);
        alpha_prime = max(0, min(alpha_prime, 1.0)); // alpha' cannot be negative or > 1
        Q = B_bolt * delta * alpha_prime * rho;
    }
    return { Q, tc, alpha_prime, delta, rho, b_prime, a_prime };
}

function getGeometryChecks(db, s_col, s_row, le_long, le_tran, t_thinner) { 
    // Implements checks from AISC J3.3, J3.4, and J3.5.
    // Assumes standard round holes.
    // Assumes sheared edges for minimum edge distance lookup (most conservative).
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


function performChecks(inputs) {
    // --- PUBLIC API ---
    // Create a mutable copy of inputs for this run
    const inputs = { ...rawInputs };

    // Define a zero-value check object to use as a fallback for bearing calculations.
    const zero_bearing_check = { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };

    let M_load = inputs.M_load;
    let V_load = inputs.V_load;
    
    if (inputs.develop_capacity_check) {
        // Calculate and overwrite M_load and V_load with member's design capacity
        const Zx = inputs.member_Zx;
        if (Zx > 0) {
            const Mn_kipin = inputs.member_Fy * Zx; // Plastic Moment (AISC F2.1)
            const phi_b = 0.90;
            const omega_b = 1.67;
            M_load = (inputs.design_method === 'LRFD' ? phi_b * Mn_kipin : Mn_kipin / omega_b) / 12.0;
        }

        const Aw = inputs.member_d * inputs.member_tw;
        if (Aw > 0) {
            const Vn_kips = 0.6 * inputs.member_Fy * Aw; // Shear Yielding Strength, assuming Cv=1.0 (AISC G2.1)
            const phi_v_yield = 1.00;
            const omega_v_yield = 1.50;
            V_load = inputs.design_method === 'LRFD' ? phi_v_yield * Vn_kips : Vn_kips / omega_v_yield;
        }
        // The UI update should happen outside this calculation function
    }

    // --- Demand Calculations ---
    const moment_arm_flange = inputs.member_d - inputs.member_tf;
    const flange_force_from_moment = (M_load * 12) / moment_arm_flange;
    const total_flange_demand_tension = flange_force_from_moment + (inputs.Axial_load / 2);
    const total_flange_demand_compression = flange_force_from_moment - (inputs.Axial_load / 2);

    const demand_fp_outer = inputs.num_flange_plates === 2 ? total_flange_demand_tension * 0.5 : total_flange_demand_tension;
    const demand_fp_inner = inputs.num_flange_plates === 2 ? total_flange_demand_tension * 0.5 : 0;
    const demand_fp_outer_comp = inputs.num_flange_plates === 2 ? total_flange_demand_compression * 0.5 : total_flange_demand_compression;
    const demand_fp_inner_comp = inputs.num_flange_plates === 2 ? total_flange_demand_compression * 0.5 : 0; 

    // --- Flange Splice Checks ---
    const hole_nominal_fp = AISC_SPEC.getNominalHoleDiameter(inputs.D_fp, inputs.hole_calc_method, 'standard');
    const hole_for_bearing_fp = hole_nominal_fp;
    const hole_for_net_area_fp = hole_nominal_fp + 1.0 / 16.0; // Per AISC commentary for net area calculations
    const num_flange_bolts_per_side = inputs.Nc_fp * inputs.Nr_fp;
    const num_shear_planes_fp = inputs.num_flange_plates === 2 ? 2 : 1;
    const fastenerPatternLength_flange = (inputs.Nc_fp > 1) ? ((inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp) : 0;
    const single_bolt_shear_fp_check = checkBoltShear(inputs.bolt_grade_fp, inputs.threads_included_fp, inputs.D_fp, num_shear_planes_fp, fastenerPatternLength_flange);
    checks['Flange Bolt Shear'] = { 
        demand: total_flange_demand_tension,
        check: { Rn: single_bolt_shear_fp_check.Rn * num_flange_bolts_per_side, ...single_bolt_shear_fp_check },
        details: {
            Rn_single: single_bolt_shear_fp_check.Rn,
            num_bolts: num_flange_bolts_per_side
        }
    };
    
    // Outer Plate Checks
    const Ag_fp_outer = inputs.H_fp * inputs.t_fp;
    checks['Outer Plate GSY'] = { 
        demand: demand_fp_outer, 
        check: checkGrossSectionYielding(Ag_fp_outer, inputs.flange_plate_Fy),
        details: { H_p: inputs.H_fp, t_p: inputs.t_fp }
    };
    // For a straight-line failure path across the plate width, we deduct holes from both sides of the centerline.
    const bolts_in_critical_section_fp = 2 * inputs.Nr_fp;
    const An_fp_outer = (inputs.H_fp - bolts_in_critical_section_fp * hole_for_net_area_fp) * inputs.t_fp;
    const conn_length_fp = (inputs.Nc_fp > 1) ? (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp : 0;
    const U_fp_outer = computeShearLagFactorU(inputs.H_fp, inputs.g_gage_fp, 2, conn_length_fp);
    checks['Outer Plate NSF'] = { demand: demand_fp_outer, check: checkNetSectionFracture(An_fp_outer, inputs.flange_plate_Fu, U_fp_outer.U) };
    checks['Outer Plate Compression'] = { demand: demand_fp_outer_comp, check: checkPlateCompression(Ag_fp_outer, inputs.flange_plate_Fy, inputs.t_fp, inputs.S1_col_spacing_fp) };

    const edge_dist_gap_fp = inputs.S3_end_dist_fp; // S3 is now defined as the distance from gap to first bolt
    const bolt_pattern_width = (inputs.Nc_fp > 1 ? (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp : 0);
    const le_long_fp = inputs.L_fp - edge_dist_gap_fp - bolt_pattern_width; // This is the calculated longitudinal edge distance at the end of the plate.

    const bolt_pattern_height_fp = inputs.Nr_fp <= 1 ? inputs.g_gage_fp : inputs.g_gage_fp + 2 * (inputs.Nr_fp - 1) * inputs.S2_row_spacing_fp;
    const le_tran_fp = (inputs.H_fp - bolt_pattern_height_fp) / 2.0;
    
    const L_bolt_group_fp = (inputs.Nc_fp > 1) ? (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp : 0;
    const L_gross_shear_path_fp = le_long_fp + L_bolt_group_fp + inputs.S3_end_dist_fp;

    const Agv_fp = 2 * L_gross_shear_path_fp * inputs.t_fp; // Two shear paths per plate
    const Anv_fp = Agv_fp - 2 * (inputs.Nc_fp) * hole_for_net_area_fp * inputs.t_fp; // Nc bolts per shear path
    const Ant_fp = (inputs.g_gage_fp - inputs.Nr_fp * hole_for_net_area_fp) * inputs.t_fp; // Tension path is between the two inner-most bolt rows.
    checks['Outer Plate Block Shear'] = { 
        demand: demand_fp_outer, 
        check: checkBlockShear(Anv_fp, Agv_fp, Ant_fp, inputs.flange_plate_Fu, inputs.flange_plate_Fy, inputs.Nr_fp),
        details: { L_path: L_gross_shear_path_fp, t: inputs.t_fp, num_bolts_shear: inputs.Nc_fp, hole_dia: hole_for_net_area_fp, h_bolts: bolt_pattern_height_fp, num_bolts_tension: 2 * inputs.Nr_fp }
    };
    
    const bearing_fp_plate_edge = checkBoltBearing(inputs.D_fp, inputs.t_fp, inputs.flange_plate_Fu, le_long_fp, inputs.S1_col_spacing_fp, true, inputs.deformation_is_consideration, hole_for_bearing_fp);
    const bearing_fp_plate_int = checkBoltBearing(inputs.D_fp, inputs.t_fp, inputs.flange_plate_Fu, le_long_fp, inputs.S1_col_spacing_fp, false, inputs.deformation_is_consideration, hole_for_bearing_fp);
    // The first column of bolts are "edge" bolts for longitudinal bearing. There are Nr_fp of them.
    const num_edge_bolts_fp = inputs.Nr_fp;
    // The rest of the bolts are "interior" bolts.
    const num_int_bolts_fp = (inputs.Nc_fp - 1) * inputs.Nr_fp;
    const total_bearing_fp_plate = bearing_fp_plate_edge.Rn * num_edge_bolts_fp + bearing_fp_plate_int.Rn * num_int_bolts_fp; 
    checks['Outer Plate Bolt Bearing'] = { 
        demand: demand_fp_outer, 
        check: { Rn: total_bearing_fp_plate, phi: bearing_fp_plate_edge.phi, omega: bearing_fp_plate_edge.omega },
        details: {
            edge: bearing_fp_plate_edge, int: bearing_fp_plate_int,
            num_edge: num_edge_bolts_fp, num_int: num_int_bolts_fp
        }
    }; 

    // Inner Plate Checks
    if (inputs.num_flange_plates === 2) {
        const Ag_fp_inner = inputs.H_fp_inner * inputs.t_fp_inner;
        checks['Inner Plate GSY'] = { 
            demand: demand_fp_inner, 
            check: checkGrossSectionYielding(Ag_fp_inner, inputs.flange_plate_Fy_inner),
            details: { H_p: inputs.H_fp_inner, t_p: inputs.t_fp_inner }
        };
        const An_fp_inner = (inputs.H_fp_inner - bolts_in_critical_section_fp * hole_for_net_area_fp) * inputs.t_fp_inner;
        const U_fp_inner = computeShearLagFactorU(inputs.H_fp_inner, inputs.g_gage_fp, 2, conn_length_fp);
        checks['Inner Plate NSF'] = { demand: demand_fp_inner, check: checkNetSectionFracture(An_fp_inner, inputs.flange_plate_Fu_inner, U_fp_inner.U) };
        checks['Inner Plate Compression'] = { demand: demand_fp_inner_comp, check: checkPlateCompression(Ag_fp_inner, inputs.flange_plate_Fy_inner, inputs.t_fp_inner, inputs.S1_col_spacing_fp) };
        
        const Agv_fp_inner = 2 * L_gross_shear_path_fp * inputs.t_fp_inner;
        const Anv_fp_inner = Agv_fp_inner - 2 * inputs.Nc_fp * hole_for_net_area_fp * inputs.t_fp_inner;
        const Ant_fp_inner = (inputs.g_gage_fp - inputs.Nr_fp * hole_for_net_area_fp) * inputs.t_fp_inner;
        checks['Inner Plate Block Shear'] = { 
            demand: demand_fp_inner, 
            check: checkBlockShear(Anv_fp_inner, Agv_fp_inner, Ant_fp_inner, inputs.flange_plate_Fu_inner, inputs.flange_plate_Fy_inner, inputs.Nr_fp),
            details: { L_path: L_gross_shear_path_fp, t: inputs.t_fp_inner, num_bolts_shear: inputs.Nc_fp, hole_dia: hole_for_net_area_fp, h_bolts: bolt_pattern_height_fp, num_bolts_tension: 2 * inputs.Nr_fp }
        };
        
        const bearing_fp_inner_edge = checkBoltBearing(inputs.D_fp, inputs.t_fp_inner, inputs.flange_plate_Fu_inner, le_long_fp, inputs.S1_col_spacing_fp, true, inputs.deformation_is_consideration, hole_for_bearing_fp);
        const bearing_fp_inner_int = checkBoltBearing(inputs.D_fp, inputs.t_fp_inner, inputs.flange_plate_Fu_inner, le_long_fp, inputs.S1_col_spacing_fp, false, inputs.deformation_is_consideration, hole_for_bearing_fp);
        const total_bearing_fp_inner = bearing_fp_inner_edge.Rn * num_edge_bolts_fp + bearing_fp_inner_int.Rn * num_int_bolts_fp; 
        checks['Inner Plate Bolt Bearing'] = { 
            demand: demand_fp_inner, 
            check: { Rn: total_bearing_fp_inner, phi: bearing_fp_inner_edge.phi, omega: bearing_fp_inner_edge.omega },
            details: {
                edge: bearing_fp_inner_edge, int: bearing_fp_inner_int,
                num_edge: num_edge_bolts_fp, num_int: num_int_bolts_fp
            }
        };
    }

    const bearing_fp_beam_edge = checkBoltBearing(inputs.D_fp, inputs.member_tf, inputs.member_Fu, le_long_fp, inputs.S1_col_spacing_fp, true, inputs.deformation_is_consideration, hole_for_bearing_fp);
    const num_edge_bolts_fp_beam = inputs.Nr_fp; // Same logic as plate bearing
    const num_int_bolts_fp_beam = (inputs.Nc_fp - 1) * inputs.Nr_fp;
    const bearing_fp_beam_int = num_int_bolts_fp_beam > 0 ? checkBoltBearing(inputs.D_fp, inputs.member_tf, inputs.member_Fu, Infinity, inputs.S1_col_spacing_fp, false, inputs.deformation_is_consideration, hole_for_bearing_fp) : zero_bearing_check;

    const total_bearing_fp_beam = bearing_fp_beam_edge.Rn * num_edge_bolts_fp_beam + bearing_fp_beam_int.Rn * num_int_bolts_fp_beam; 
    checks['Beam Flange Bolt Bearing'] = { 
        demand: total_flange_demand_tension, 
        check: { Rn: total_bearing_fp_beam, phi: bearing_fp_beam_edge.phi, omega: bearing_fp_beam_edge.omega },
        details: {
            edge: bearing_fp_beam_edge,
            int: bearing_fp_beam_int, // This can be zero_bearing_check
            num_edge: num_edge_bolts_fp_beam,
            num_int: num_int_bolts_fp_beam
        }
    }; 

    const Agv_beam_f = 2 * L_gross_shear_path_fp * inputs.member_tf;
    const Anv_beam_f = Agv_beam_f - 2 * inputs.Nc_fp * hole_for_net_area_fp * inputs.member_tf;
    const Ant_beam_f = (inputs.g_gage_fp - inputs.Nr_fp * hole_for_net_area_fp) * inputs.member_tf;
    checks['Beam Flange Block Shear'] = { 
        demand: total_flange_demand_tension, 
        check: checkBlockShear(Anv_beam_f, Agv_beam_f, Ant_beam_f, inputs.member_Fu, inputs.member_Fy, inputs.Nr_fp),
        details: { L_path: L_gross_shear_path_fp, t: inputs.member_tf, num_bolts_shear: inputs.Nc_fp, hole_dia: hole_for_net_area_fp, h_bolts: bolt_pattern_height_fp, num_bolts_tension: 2 * inputs.Nr_fp }
    };

    // --- Prying Action Check ---
    const B_per_bolt = num_flange_bolts_per_side > 0 ? total_flange_demand_tension / num_flange_bolts_per_side : 0;
    if (B_per_bolt > 0) {
        const p_pry = inputs.S1_col_spacing_fp;
        const d_hole_pry = AISC_SPEC.getNominalHoleDiameter(inputs.D_fp, inputs.hole_calc_method, 'standard'); // Nominal hole for prying calcs

        let Q_total = 0;
        let prying_details_combined = {};
        
        // Force resisted by outer plate. Assume 50% for 2-plate, 100% for 1-plate.
        const B_plate_outer = inputs.num_flange_plates === 2 ? B_per_bolt * 0.5 : B_per_bolt;
        const b_pry_outer = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
        const a_pry_outer = (inputs.H_fp - inputs.g_gage_fp) / 2.0;
        const prying_outer_details = checkPryingAction(inputs.t_fp, inputs.flange_plate_Fy, b_pry_outer, a_pry_outer, p_pry, inputs.D_fp, d_hole_pry, B_plate_outer);
        Q_total += prying_outer_details.Q;
        prying_details_combined.outer = prying_outer_details;

        if (inputs.num_flange_plates === 2) {
            const B_plate_inner = B_per_bolt * 0.5;
            const b_pry_inner = inputs.g_gage_fp / 2.0;
            const a_pry_inner = (inputs.H_fp_inner - bolt_pattern_height_fp) / 2.0;
            const prying_inner_details = checkPryingAction(inputs.t_fp_inner, inputs.flange_plate_Fy_inner, b_pry_inner, a_pry_inner, p_pry, inputs.D_fp, d_hole_pry, B_plate_inner);
            Q_total += prying_inner_details.Q;
            prying_details_combined.inner = prying_inner_details;
        }

        checks['Flange Bolt Prying & Tension'] = {
            demand: B_per_bolt + Q_total,
            check: checkBoltTension(inputs.bolt_grade_fp, inputs.D_fp),
            details: { ...prying_details_combined, B_per_bolt, Q_total }
        };

        // Add a check for the plate thickness itself based on prying action
        checks['Plate Thickness for Prying'] = {
            demand: inputs.t_fp, // Provided thickness
            check: { Rn: prying_outer_details.tc, phi: 1.0, omega: 1.0 }, // Required thickness
            details: { ...prying_details_combined }
        };
    }

    // --- Web Splice Checks ---
    const hole_nominal_wp = AISC_SPEC.getNominalHoleDiameter(inputs.D_wp, inputs.hole_calc_method, 'standard');
    const hole_for_bearing_wp = hole_nominal_wp;
    const hole_for_net_area_wp = hole_nominal_wp + 1.0 / 16.0; // Per AISC commentary for net area calculations
    
    // --- Web Splice Demand Calculation (per your improved logic) ---
    // 1. First, determine the flange splice capacity to find Hw.
    const phiRn_flange_bolts = (checks['Flange Bolt Shear']?.check?.phi ?? 0.75) * (checks['Flange Bolt Shear']?.check?.Rn ?? 0);
    const Mu_flange_splice_capacity = phiRn_flange_bolts * moment_arm_flange; // kip-in

    // 2. Calculate the moment demand on the web splice.
    const Mu_total_demand = Math.abs(M_load * 12); // kip-in
    const Mu_web = Math.max(0, Mu_total_demand - Mu_flange_splice_capacity);

    // 3. Calculate Hw (horizontal force demand on web)
    const moment_arm_web_bolts = (inputs.Nr_wp > 1) ? (inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp : 1; // Approximation
    const Hw = moment_arm_web_bolts > 0 ? Mu_web / moment_arm_web_bolts : 0; // This is a simplified Hw

    // 4. Calculate the resultant force R per bolt on the web splice.
    const num_web_bolts_per_side = inputs.Nc_wp * inputs.Nr_wp;
    const total_R_demand = Math.sqrt(V_load**2 + Hw**2);
    const Vu_web_bolt = num_web_bolts_per_side > 0 ? total_R_demand / num_web_bolts_per_side : 0; // This is an AVERAGE force, not the max.

    const fastenerPatternLength_web = (inputs.Nr_wp > 1) ? ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) : 0;
    const single_web_bolt_shear_check = checkBoltShear(inputs.bolt_grade_wp, inputs.threads_included_wp, inputs.D_wp, inputs.num_web_plates, fastenerPatternLength_web);
    checks['Web Bolt Shear (Combined Forces)'] = { 
        demand: Vu_web_bolt, // This should be the MAX bolt force, not average
        check: single_web_bolt_shear_check,
        details: { V_load, Hw, total_R_demand, num_bolts: num_web_bolts_per_side }
    };
    
    // The old eccentricity and tension interaction checks are now superseded by this combined force approach.
    // A proper elastic analysis would be needed to find Tu_web_bolt accurately.
    let Tu_web_bolt = 0;
    checks['Web Bolt Shear/Tension Interaction'] = { demand: Tu_web_bolt, check: checkBoltShearTensionInteraction(Tu_web_bolt, Vu_web_bolt, single_web_bolt_shear_check.Fnv, inputs.bolt_grade_wp, inputs.D_wp, inputs.design_method) }; 

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
    
    const edge_dist_gap_wp = inputs.S6_end_dist_wp;
    const bolt_pattern_width_wp = (inputs.Nc_wp > 1 ? (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp : 0);
    const le_long_wp = inputs.L_wp - edge_dist_gap_wp - bolt_pattern_width_wp;

    const le_tran_wp = (inputs.H_wp - (inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2.0;
    const L_bolt_group_wp = (inputs.Nc_wp > 1) ? (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp : 0;
    const L_gross_shear_path_wp = le_long_wp + L_bolt_group_wp + inputs.S6_end_dist_wp;

    const Agv_wp_bs = L_gross_shear_path_wp * total_t_wp;
    const Anv_wp_bs = Agv_wp_bs - (inputs.Nc_wp * hole_for_net_area_wp * total_t_wp); // This is for one shear path, but total_t_wp includes both plates
    const Ant_wp_bs = (le_tran_wp - 0.5 * hole_for_net_area_wp) * total_t_wp;
    checks['Web Plate Block Shear'] = { 
        demand: V_load, 
        check: checkBlockShear(Anv_wp_bs, Agv_wp_bs, Ant_wp_bs, inputs.web_plate_Fu, inputs.web_plate_Fy, 1), // Only one row of bolts on the tension path
        details: { L_path: L_gross_shear_path_wp, t: total_t_wp, num_bolts_shear: inputs.Nc_wp, hole_dia: hole_for_net_area_wp, h_bolts: le_tran_wp, num_bolts_tension: 0.5 }
    };
    const bearing_wp_plate_single_bolt = checkBoltBearing(inputs.D_wp, total_t_wp, inputs.web_plate_Fu, le_long_wp, inputs.S4_col_spacing_wp, true, inputs.deformation_is_consideration, hole_for_bearing_wp);
    checks['Web Plate Bolt Bearing'] = { demand: Vu_web_bolt, check: bearing_wp_plate_single_bolt, details: { edge: bearing_wp_plate_single_bolt, int: zero_bearing_check, num_edge: 1, num_int: 0 } };
    
    const bearing_wp_beam_single_bolt = checkBoltBearing(inputs.D_wp, inputs.member_tw, inputs.member_Fu, le_long_wp, inputs.S4_col_spacing_wp, true, inputs.deformation_is_consideration, hole_for_bearing_wp);
    checks['Beam Web Bolt Bearing'] = { demand: Vu_web_bolt, check: bearing_wp_beam_single_bolt, details: { edge: bearing_wp_beam_single_bolt, int: zero_bearing_check, num_edge: 1, num_int: 0 } };

    const Agv_beam_web = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
    checks['Beam Web Shear Yielding'] = { 
        demand: V_load, 
        check: checkShearYielding(Agv_beam_web, inputs.member_Fy),
        details: { d: inputs.member_d, tf: inputs.member_tf, tw: inputs.member_tw }
    };
    
    // --- Beam Member Checks ---
    checks['Beam Flexural Rupture'] = { demand: M_load * 12, check: checkBeamFlexuralRupture(inputs.member_Sx, inputs.member_Fu, inputs.member_d, inputs.member_bf, inputs.member_tf, inputs.Nr_fp, hole_for_net_area_fp) };
    const Anv_beam_web = (inputs.member_d - 2*inputs.member_tf - inputs.Nr_wp * hole_for_net_area_wp) * inputs.member_tw;
    checks['Beam Web Shear Rupture'] = { 
        demand: V_load,
        check: checkShearRupture(Anv_beam_web, inputs.member_Fu),
        details: { d: inputs.member_d, tf: inputs.member_tf, Nr_wp: inputs.Nr_wp, hole_dia: hole_for_net_area_wp, tw: inputs.member_tw }
    };

    // --- Beam Section Tensile Rupture Check (with Shear Lag) ---
    if (inputs.Axial_load > 0) {
        const A_gross_approx = 2 * inputs.member_bf * inputs.member_tf + (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw; 
        const A_holes_flange = (2 * inputs.Nr_fp) * hole_for_net_area_fp * inputs.member_tf;
        const A_holes_web = inputs.Nr_wp * hole_for_net_area_wp * inputs.member_tw;
        const An = A_gross_approx - A_holes_flange - A_holes_web;

        // Shear Lag Factor U per AISC Table D3.1, Case 7 (W, M, S shapes with flange connections)
        const An_conn = 2 * (inputs.member_bf - inputs.Nr_fp * hole_dia_net_area_fp) * inputs.member_tf;
        const Ag_conn = 2 * inputs.member_bf * inputs.member_tf;
        const U = Ag_conn > 0 ? An_conn / Ag_conn : 1.0;
        
        const Ae = U * An;
        const check = { 
            Rn: inputs.member_Fu * Ae, phi: 0.75, omega: 2.00, 
            An, Ae, U, Fu: inputs.member_Fu, 
            details: { Ag_approx: A_gross_approx, A_holes_flange, A_holes_web, An_conn, Ag_conn, hole_dia: hole_for_net_area_fp }
        };
        checks['Beam Section Tensile Rupture'] = { demand: inputs.Axial_load, check };
    }

    // --- Geometry Checks ---
    const t_thinner_flange = min(inputs.member_tf, inputs.t_fp, inputs.num_flange_plates === 2 ? inputs.t_fp_inner : Infinity);
    geomChecks['Flange Bolts'] = getGeometryChecks(inputs.D_fp, inputs.S1_col_spacing_fp, inputs.S2_row_spacing_fp, le_long_fp, le_tran_fp, t_thinner_flange);
    const tolerance = 1e-9;
    const min_le_fp = geomChecks['Flange Bolts'].edge_dist_long.min;
    geomChecks['Flange Bolts'].edge_dist_gap = { actual: edge_dist_gap_fp, min: min_le_fp, pass: edge_dist_gap_fp >= min_le_fp - tolerance };
    const t_thinner_web = min(inputs.member_tw, inputs.t_wp * inputs.num_web_plates);
    geomChecks['Web Bolts'] = getGeometryChecks(inputs.D_wp, inputs.S4_col_spacing_wp, inputs.S5_row_spacing_wp, le_long_wp, le_tran_wp, t_thinner_web);
    const min_le_wp = geomChecks['Web Bolts'].edge_dist_long.min;
    geomChecks['Web Bolts'].edge_dist_gap = { actual: edge_dist_gap_wp, min: min_le_wp, pass: edge_dist_gap_wp >= min_le_wp - tolerance };

    return { checks, geomChecks, inputs, final_loads: { M_load, V_load } };
};

function run(rawInputs) {
    const inputs = { ...rawInputs };

    // The user inputs TOTAL plate length. Convert to length-per-side for calculations.
    inputs.L_fp = (rawInputs.L_fp || 0) / 2.0;
    inputs.L_fp_inner = (rawInputs.L_fp_inner || 0) / 2.0;
    inputs.L_wp = (rawInputs.L_wp || 0) / 2.0;

    if (!inputs.optimize_bolts_check) {
        // If not optimizing, run the checks once with the provided inputs.
        return performChecks(inputs);
    }

    // --- Optimization Logic ---
    const MAX_TOTAL_BOLTS = 40; // Safety break for total bolts per side
    let finalResults = {};
    let optimizationLog = [];

    // --- Optimize Flange Bolts (2D Optimization) ---
    const flangeBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_fp];
    let flangeOptimized = false;    
    for (const d_fp of flangeBoltDiameters) {
        if (flangeOptimized) break;
        for (let total_bolts = 1; total_bolts <= MAX_TOTAL_BOLTS; total_bolts++) {
            // Iterate through factors of total_bolts to get (Nc, Nr) pairs
            for (let nr_fp = 1; nr_fp <= total_bolts; nr_fp++) {
                if (total_bolts % nr_fp === 0) {
                    const nc_fp = total_bolts / nr_fp;
                    const currentInputs = { ...inputs, D_fp: d_fp, Nc_fp: nc_fp, Nr_fp: nr_fp };
                    const results = performChecks(currentInputs);
                    
                    const flangeChecks = Object.entries(results.checks).filter(([key]) => key.includes('Flange') || key.includes('Outer Plate') || key.includes('Inner Plate'));
                    const flangeGeomOk = Object.values(results.geomChecks['Flange Bolts']).every(check => check.pass);

                    const allFlangeChecksPass = flangeChecks.every(([key, data]) => {
                        const { demand, check } = data;
                        const capacity = inputs.design_method === 'LRFD' ? check.Rn * check.phi : check.Rn / check.omega;
                        return Math.abs(demand) <= capacity;
                    });

                    if (allFlangeChecksPass && flangeGeomOk) {
                        inputs.D_fp = d_fp;
                        inputs.Nc_fp = nc_fp;
                        inputs.Nr_fp = nr_fp;
                        optimizationLog.push(`Flange splice optimized to ${nc_fp} column(s) and ${nr_fp} row(s) of ${d_fp}" bolts (${total_bolts} bolts per side).`);
                        flangeOptimized = true;
                        break; // Exit inner loop (factors)
                    }
                }
            }
            if (flangeOptimized) break; // Exit outer loop (total_bolts)
        }
    }
    if (!flangeOptimized) {
        optimizationLog.push(`Flange splice optimization failed to converge after checking up to ${MAX_TOTAL_BOLTS} bolts.`);
        return { ...performChecks({ ...inputs, Nc_fp: MAX_TOTAL_BOLTS, Nr_fp: 1 }), optimizationLog };
    }

    // --- Optimize Web Bolts (3D Optimization) ---
    const webBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_wp];
    let webOptimized = false;
    for (const d_wp of webBoltDiameters) {
        if (webOptimized) break;
        for (let total_bolts = 1; total_bolts <= MAX_TOTAL_BOLTS; total_bolts++) {
            for (let nr_wp = 1; nr_wp <= total_bolts; nr_wp++) {
                if (total_bolts % nr_wp === 0) {
                    const nc_wp = total_bolts / nr_wp;
                    const currentInputs = { ...inputs, D_wp: d_wp, Nc_wp: nc_wp, Nr_wp: nr_wp };
                    const results = performChecks(currentInputs);
                    const webBoltShearCheck = results.checks['Web Bolt Shear (Combined Forces)'];
                    const webGeomOk = Object.values(results.geomChecks['Web Bolts']).every(check => check.pass);
                    const capacity = inputs.design_method === 'LRFD' ? webBoltShearCheck.check.Rn * webBoltShearCheck.check.phi : webBoltShearCheck.check.Rn / webBoltShearCheck.check.omega;
                    
                    if (webBoltShearCheck.demand <= capacity && webGeomOk) {
                        inputs.D_wp = d_wp;
                        inputs.Nc_wp = nc_wp;
                        inputs.Nr_wp = nr_wp;
                        optimizationLog.push(`Web splice optimized to ${nc_wp} column(s) and ${nr_wp} row(s) of ${d_wp}" bolts (${total_bolts} bolts per side).`);
                        webOptimized = true;
                        finalResults = { ...results, optimizationLog };
                        return finalResults;
                    }
                }
            }
        }
    }
    optimizationLog.push(`Web splice optimization failed to converge after checking up to ${MAX_TOTAL_BOLTS} bolts.`);
    return { ...performChecks({ ...inputs, Nc_wp: MAX_TOTAL_BOLTS, Nr_wp: 1 }), optimizationLog };
}

    // Expose private functions for unit testing
    const __test_exports__ = { checkBoltShear, checkBlockShear };

    return { run, __test_exports__, performChecks };
})();
function generateBreakdownHtml(name, data, design_method) { // This function is used by renderResults
    const { check, details } = data;
    if (!check) return 'Breakdown not available.';
    let content = '';

    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? check.phi : check.omega;
    const capacity_eq = design_method === 'LRFD' ? `&phi; R<sub>n</sub>` : `R<sub>n</sub> / &Omega;`;
    const design_capacity = (check.Rn / (factor_val || 1.0)); 
    const final_capacity = design_method === 'LRFD' ? check.Rn * factor_val : check.Rn / factor_val;
    const format_list = (items) => items.map(i => `<li class="py-1">${i}</li>`).join('');

    function fmt(x, n = 2) {
        return (typeof x === "number" && isFinite(x)) ? x.toFixed(n) : "-";
    }

    switch (name) {
        case 'Flange Bolt Shear':
            content = format_list([
                `Nominal Shear Strength per bolt (R<sub>n,bolt</sub>) = F<sub>nv</sub> * A<sub>b</sub> * n<sub>planes</sub>`,
                `R<sub>n,bolt</sub> = ${check.Fnv.toFixed(1)} ksi * ${check.Ab.toFixed(3)} in² * ${check.num_planes} = ${details.Rn_single.toFixed(2)} kips`,
                (check.wasReduced ? `<li class="text-sm text-yellow-600 dark:text-yellow-400"><em>Note: F<sub>nv</sub> reduced by 83.3% for long joint (> 38 in).</em></li>` : ''),
                `Total Nominal Strength (R<sub>n</sub>) = R<sub>n,bolt</sub> * n<sub>bolts</sub>`,
                `R<sub>n</sub> = ${fmt(details.Rn_single)} kips * ${details.num_bolts} = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${design_method === 'LRFD' ? `${check.phi} * ${check.Rn.toFixed(2)}` : `${check.Rn.toFixed(2)} / ${check.omega}`} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        
        case 'Outer Plate GSY': case 'Inner Plate GSY':
            content = format_list([
                `Gross Section Yielding per AISC J4.1a`,
                `Gross Area (A<sub>g</sub>) = H<sub>p</sub> &times; t<sub>p</sub> = ${fmt(details.H_p, 3)}" &times; ${fmt(details.t_p, 3)}" = <b>${fmt(check.Ag, 3)} in²</b>`,
                `Nominal Strength (R<sub>n</sub>) = F<sub>y</sub> &times; A<sub>g</sub>`,
                `R<sub>n</sub> = ${fmt(check.Fy, 1)} ksi * ${fmt(check.Ag, 3)} in² = ${fmt(check.Rn)} kips`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Outer Plate NSF': case 'Inner Plate NSF':
            content = format_list([
                `Net Section Fracture per AISC J4.1b`,
                `Net Area (A<sub>n</sub>) = (H<sub>p</sub> - 2 &times; N<sub>r</sub> &times; d<sub>hole</sub>) &times; t<sub>p</sub> = <b>${check.An.toFixed(3)} in²</b>`,
                `Effective Net Area (A<sub>e</sub>) = U * A<sub>n</sub> = ${fmt(check.U)} * ${fmt(check.An, 3)} in² = ${fmt(check.Ae, 3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = F<sub>u</sub> * A<sub>e</sub>`,
                `R<sub>n</sub> = ${fmt(check.Fu, 1)} ksi * ${fmt(check.Ae, 3)} in² = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Outer Plate Block Shear': case 'Inner Plate Block Shear': case 'Beam Flange Block Shear': case 'Web Plate Block Shear':
             content = format_list([ 
                `Block Shear Rupture per AISC J4.3`,
                `Gross Shear Area (A<sub>gv</sub>) = L<sub>path</sub> &times; t = ${details.L_path.toFixed(3)}" &times; ${details.t.toFixed(3)}" = <b>${check.Agv.toFixed(3)} in²</b> (Note: Formula uses one path, code may use two)`,
                `Net Shear Area (A<sub>nv</sub>) = A<sub>gv</sub> - n<sub>bolts,shear</sub> &times; d<sub>hole,net</sub> &times; t = ${fmt(check.Agv, 3)} - ${details.num_bolts_shear} &times; ${fmt(details.hole_dia, 3)} &times; ${fmt(details.t, 3)} = <b>${fmt(check.Anv, 3)} in²</b>`,
                `Net Tension Area (A<sub>nt</sub>) = (g - n<sub>rows,tension</sub> &times; d<sub>hole,net</sub>) &times; t = <b>${fmt(check.Ant, 3)} in²</b>`,
                `Shear Yield Path: (0.6*F<sub>y</sub>*A<sub>gv</sub>) + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub> = ${fmt(check.path_yield)} kips`,
                `Shear Rupture Path: (0.6*F<sub>u</sub>*A<sub>nv</sub>) + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub> = ${fmt(check.path_rupture)} kips`,
                `Nominal Strength (R<sub>n</sub>) = min(Shear Yield Path, Shear Rupture Path)`,
                `R<sub>n</sub> = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Outer Plate Bolt Bearing': case 'Inner Plate Bolt Bearing': case 'Beam Flange Bolt Bearing': case 'Web Plate Bolt Bearing': case 'Beam Web Bolt Bearing':
            content = format_list([
                `Bolt Bearing per AISC J3.10`,
                `<strong>Edge Bolts (per bolt):</strong>`,
                `Clear Distance (L<sub>c</sub>) = L<sub>e</sub> - d<sub>h</sub>/2 = ${fmt(details.edge?.Lc, 3)} in`,
                `Tearout R<sub>n</sub> = 1.5 * L<sub>c</sub> * t * F<sub>u</sub> = ${fmt(details.edge?.Rn_tearout)} kips`,
                `Bearing R<sub>n</sub> = 3.0 * d<sub>b</sub> * t * F<sub>u</sub> = ${fmt(details.edge?.Rn_bearing)} kips`,
                `R<sub>n,edge</sub> = min(Tearout, Bearing) = ${fmt(details.edge?.Rn)} kips`,
                `<strong>Interior Bolts (per bolt):</strong>`,
                `Clear Distance (L<sub>c</sub>) = s - d<sub>h</sub> = ${fmt(details.int?.Lc, 3)} in`,
                `Tearout R<sub>n</sub> = 1.5 * L<sub>c</sub> * t * F<sub>u</sub> = ${fmt(details.int?.Rn_tearout)} kips`,
                `Bearing R<sub>n</sub> = 3.0 * d<sub>b</sub> * t * F<sub>u</sub> = ${fmt(details.int?.Rn_bearing)} kips`,
                `R<sub>n,int</sub> = min(Tearout, Bearing) = ${fmt(details.int?.Rn)} kips`,
                `<strong>Total Nominal Strength:</strong>`,
                `R<sub>n</sub> = n<sub>edge</sub> * R<sub>n,edge</sub> + n<sub>int</sub> * R<sub>n,int</sub>`, 
                `R<sub>n</sub> = ${details.num_edge} &times; ${fmt(details.edge?.Rn)} + ${details.num_int} &times; ${fmt(details.int?.Rn)} = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;
        
        case 'Web Bolt Shear (Combined Forces)':
            content = format_list([
                `Combined force on web bolt group from shear and moment.`,
                `Vertical Force on Group (V) = <b>${fmt(details.V_load)} kips</b>`,
                `Horizontal Force on Group (Hw) from Web Moment = <b>${fmt(details.Hw)} kips</b>`,
                `Total Resultant Force on Group (R) = &radic;(V² + Hw²) = <b>${fmt(details.total_R_demand)} kips</b>`,
                `<strong>Average Force per Bolt (Demand):</strong>`,
                `R<sub>avg,bolt</sub> = R / n<sub>bolts</sub> = ${fmt(details.total_R_demand)} / ${details.num_bolts} = <b>${fmt(data.demand)} kips</b>`,
                `<li class="mt-2 text-sm text-gray-600 dark:text-gray-400"><em>Note: This is an average force. A full elastic bolt group analysis is required to find the force on the critical bolt.</em></li>`,
                `<strong>Capacity of Single Bolt:</strong>`,
                (check.wasReduced ? `<li class="text-sm text-yellow-600 dark:text-yellow-400"><em>Note: F<sub>nv</sub> reduced by 83.3% for long joint (> 38 in).</em></li>` : ''),
                `R<sub>n</sub> = F<sub>nv</sub> &times; A<sub>b</sub> &times; n<sub>planes</sub> = ${fmt(check.Fnv, 1)} &times; ${fmt(check.Ab, 3)} &times; ${check.num_planes} = ${fmt(check.Rn)} kips`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Web Bolt Shear/Tension Interaction':
            content = format_list([
                `Bolt Shear/Tension Interaction per AISC J3.9`,
                `Required Shear Stress (f<sub>v</sub>) = V<sub>u</sub> / A<sub>b</sub> = ${fmt(check.Vu)} / ${fmt(check.Ab, 3)} = ${fmt(check.fv)} ksi`,
                `Adjusted Tensile Strength (F'<sub>nt</sub>) = 1.3 * F<sub>nt</sub> - (...) * f<sub>v</sub> &le; F<sub>nt</sub> = ${fmt(check.F_nt_prime)} ksi`,
                `Nominal Tensile Capacity (R<sub>n</sub>) = F'<sub>nt</sub> * A<sub>b</sub> = ${fmt(check.F_nt_prime)} * ${fmt(check.Ab, 3)} = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`,
                `Demand = Tension on critical bolt (T<sub>u</sub>) = ${fmt(check.Tu)} kips`
            ]);
            break;
        
        case 'Web Plate Gross Shear Yield':
            content = format_list([
                `Shear Yielding of Web Plate per AISC J4.3`,
                `Gross Shear Area (A<sub>gv</sub>) = H<sub>wp</sub> &times; t<sub>total</sub> = ${fmt(details.H_wp, 3)}" &times; ${fmt(details.t_total, 3)}" = <b>${fmt(check.Agv, 3)} in²</b>`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 &times; F<sub>y</sub> &times; A<sub>gv</sub>`,
                `R<sub>n</sub> = 0.6 &times; ${fmt(check.Fy, 1)} ksi &times; ${fmt(check.Agv, 3)} in² = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Beam Web Shear Yielding':
            content = format_list([
                `Shear Yielding of Beam Web per AISC G2.1`, 
                `Gross Shear Area (A<sub>gv</sub>) = (d - 2&times;t<sub>f</sub>) &times; t<sub>w</sub> = (${fmt(details.d, 3)}" - 2&times;${fmt(details.tf, 3)}") &times; ${fmt(details.tw, 3)}" = <b>${fmt(check.Agv, 3)} in²</b>`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 &times; F<sub>y</sub> &times; A<sub>gv</sub>`,
                `R<sub>n</sub> = 0.6 &times; ${fmt(check.Fy, 1)} ksi &times; ${fmt(check.Agv, 3)} in² = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Web Plate Net Shear Rupture':
            content = format_list([
                `Shear Rupture of Web Plate per AISC J4.2(b)`,
                `Net Shear Area (A<sub>nv</sub>) = (H<sub>wp</sub> - N<sub>r</sub> &times; d<sub>hole</sub>) &times; t<sub>total</sub> = (${fmt(details.H_wp, 3)}" - ${details.Nr_wp} &times; ${fmt(details.hole_dia, 3)}") &times; ${fmt(details.t_total, 3)}" = <b>${fmt(check.Anv, 3)} in²</b>`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 &times; F<sub>u</sub> &times; A<sub>nv</sub>`,
                `R<sub>n</sub> = 0.6 * ${fmt(check.Fu, 1)} ksi * ${fmt(check.Anv, 3)} in² = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Beam Web Shear Rupture':
            content = format_list([
                `Shear Rupture of Beam Web per AISC J4-4`,
                `Net Shear Area (A<sub>nv</sub>) = (d - 2&times;t<sub>f</sub> - N<sub>r,web</sub> &times; (d<sub>hole</sub>+1/16")) &times; t<sub>w</sub>`,
                `A<sub>nv</sub> = (${fmt(data.details.d, 3)}" - 2*${fmt(data.details.tf, 3)}" - ${data.details.Nr_wp}*${fmt(data.details.hole_dia, 3)}) * ${fmt(data.details.tw, 3)}" = <b>${fmt(check.Anv, 3)} in²</b>`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 * F<sub>u</sub> * A<sub>nv</sub>`,
                `R<sub>n</sub> = 0.6 * ${fmt(check.Fu, 1)} ksi * ${fmt(check.Anv, 3)} in² = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Beam Section Tensile Rupture':
            content = format_list([
                `Tensile Rupture of Gross Section per AISC D2`,
                `Net Area (A<sub>n</sub>) = A<sub>g,approx</sub> - A<sub>holes,flange</sub> - A<sub>holes,web</sub> = ${fmt(check.details.Ag_approx, 3)} - ${fmt(check.details.A_holes_flange, 3)} - ${fmt(check.details.A_holes_web, 3)} = <b>${fmt(check.An, 3)} in²</b>`,
                `Shear Lag Factor (U) = ${fmt(check.U, 3)} (per AISC Table D3.1, Case 7)`,
                `Effective Net Area (A<sub>e</sub>) = U * A<sub>n</sub> = ${fmt(check.Ae, 3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = F<sub>u</sub> * A<sub>e</sub>`,
                `R<sub>n</sub> = ${fmt(check.Fu, 1)} ksi * ${fmt(check.Ae, 3)} in² = <b>${fmt(check.Rn)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Flange Bolt Prying & Tension':
            const outer_pry = details.outer ? `Outer Plate Q = ${fmt(details.outer.Q)} kips (t<sub>c</sub>=${fmt(details.outer.tc, 3)} in)` : '';
            const inner_pry = details.inner ? `Inner Plate Q = ${fmt(details.inner.Q)} kips (t<sub>c</sub>=${fmt(details.inner.tc, 3)} in)` : '';
            content = format_list([
                `Prying action per AISC Manual Part 9.`,
                `Applied Tension per Bolt (B) = T<sub>total</sub> / n<sub>bolts</sub> = <b>${fmt(details.B_per_bolt)} kips</b>`,
                `Prying Force (Q) = ${outer_pry} ${inner_pry ? `+ ${inner_pry}` : ''} = ${fmt(details.Q_total)} kips`,
                `Total Bolt Tension Demand = B + Q = <b>${fmt(data.demand)} kips</b>`,
                `Bolt Tensile Capacity (R<sub>n</sub>) = F<sub>nt</sub> &times; A<sub>b</sub> = ${fmt(check.Fnt, 1)} &times; ${fmt(check.Ab, 3)} = ${fmt(check.Rn)} kips`,
                `Design Capacity = ${capacity_eq} = ${fmt(check.Rn)} / ${fmt(factor_val)} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Plate Thickness for Prying':
            content = format_list([
                `Required plate thickness (t<sub>c</sub>) to eliminate prying action per AISC Manual Part 9.`,
                `Outer Plate t<sub>c</sub> = &radic;(4*B*b')/(p*Fy) = <b>${fmt(details.outer.tc, 3)} in</b>`,
                (details.inner ? `Inner Plate t<sub>c</sub> = <b>${fmt(details.inner.tc, 3)} in</b>` : ''),
                `This check compares the provided thickness to the required thickness. If it fails, prying forces (Q) are generated and added to the bolt tension demand.`,
                `Provided Thickness (t<sub>p</sub>) = <b>${fmt(data.demand, 3)} in</b>`
            ].filter(Boolean));
            break;

        case 'Beam Flexural Rupture':
            content = format_list([
                `Flexural Rupture of Beam at Splice per AISC F13 (Approximate Method).`,
                `Net Flange Area (A<sub>fn</sub>) = (b<sub>f</sub> - n<sub>bolts</sub> &times; (d<sub>hole</sub>+1/16")) &times; t<sub>f</sub> = ${fmt(check.Afn, 3)} in²`,
                `Nominal Tensile Strength of Flange (T<sub>n</sub>) = F<sub>u</sub> &times; A<sub>fn</sub> = ${fmt(check.Fu, 1)} ksi &times; ${fmt(check.Afn, 3)} in² = ${fmt(check.Tn)} kips`,
                `Estimated Moment Arm (z<sub>est</sub>) = d - t<sub>f</sub> = ${fmt(check.z_est, 3)} in`,
                `Nominal Moment Capacity (M<sub>n</sub>) = T<sub>n</sub> &times; z<sub>est</sub> = ${fmt(check.Tn)} kips &times; ${fmt(check.z_est, 3)} in = <b>${fmt(check.Rn)} kip-in</b>`,
                `Design Capacity = (M<sub>n</sub> / &Omega;) / 12 = (${fmt(check.Rn)} / ${fmt(factor_val)}) / 12 = <b>${fmt(final_capacity / 12)} kip-ft</b>`
            ]);
            break;

        default: 
            content = 'Breakdown not available for this check.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

const breakdownGenerators = {
    'Flange Bolt Shear': ({ check, details }, common) => common.format_list([
        `Nominal Shear Strength per bolt (R<sub>n,bolt</sub>) = F<sub>nv</sub> * A<sub>b</sub> * n<sub>planes</sub>`,
        `R<sub>n,bolt</sub> = ${check.Fnv.toFixed(1)} ksi * ${check.Ab.toFixed(3)} in² * ${check.num_planes} = ${details.Rn_single.toFixed(2)} kips`,
        `Total Nominal Strength (R<sub>n</sub>) = R<sub>n,bolt</sub> * n<sub>bolts</sub>`,
        `R<sub>n</sub> = ${details.Rn_single.toFixed(2)} kips * ${details.num_bolts} = <b>${check.Rn.toFixed(2)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'GSY': ({ check }, common) => common.format_list([
        `Gross Section Yielding per AISC J4-1`,
        `Nominal Strength (R<sub>n</sub>) = F<sub>y</sub> * A<sub>g</sub>`,
        `R<sub>n</sub> = ${check.Fy.toFixed(1)} ksi * ${check.Ag.toFixed(3)} in² = ${check.Rn.toFixed(2)} kips`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'NSF': ({ check }, common) => common.format_list([
        `Net Section Fracture per AISC J4-2`,
        `Effective Net Area (A<sub>e</sub>) = U * A<sub>n</sub> = ${check.U.toFixed(2)} * ${check.An.toFixed(3)} in² = ${check.Ae.toFixed(3)} in²`,
        `Nominal Strength (R<sub>n</sub>) = F<sub>u</sub> * A<sub>e</sub>`,
        `R<sub>n</sub> = ${check.Fu.toFixed(1)} ksi * ${check.Ae.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'Block Shear': ({ check }, common) => common.format_list([
        `Block Shear Rupture per AISC J4-5`,
        `Shear Yield Path: (0.6*F<sub>y</sub>*A<sub>gv</sub>) + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub> = ${check.path_yield.toFixed(2)} kips`,
        `Shear Rupture Path: (0.6*F<sub>u</sub>*A<sub>nv</sub>) + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub> = ${check.path_rupture.toFixed(2)} kips`,
        `Nominal Strength (R<sub>n</sub>) = min(Shear Yield Path, Shear Rupture Path)`,
        `R<sub>n</sub> = <b>${check.Rn.toFixed(2)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'Bolt Bearing': ({ check, details }, common) => common.format_list([
        `Bolt Bearing per AISC J3.10`,
        `<strong>Edge Bolts (per bolt):</strong>`,
        `Clear Distance (L<sub>c</sub>) = L<sub>e</sub> - d<sub>h</sub>/2 = ${details.edge.Lc.toFixed(3)} in`,
        `Tearout R<sub>n</sub> = 1.5 * L<sub>c</sub> * t * F<sub>u</sub> = ${details.edge.Rn_tearout.toFixed(2)} kips`,
        `Bearing R<sub>n</sub> = 3.0 * d<sub>b</sub> * t * F<sub>u</sub> = ${details.edge.Rn_bearing.toFixed(2)} kips`,
        `R<sub>n,edge</sub> = min(Tearout, Bearing) = ${details.edge.Rn.toFixed(2)} kips`,
        `<strong>Interior Bolts (per bolt):</strong>`,
        `Clear Distance (L<sub>c</sub>) = s - d<sub>h</sub> = ${details.int.Lc.toFixed(3)} in`,
        `Tearout R<sub>n</sub> = 1.5 * L<sub>c</sub> * t * F<sub>u</sub> = ${details.int.Rn_tearout.toFixed(2)} kips`,
        `Bearing R<sub>n</sub> = 3.0 * d<sub>b</sub> * t * F<sub>u</sub> = ${details.int.Rn_bearing.toFixed(2)} kips`,
        `R<sub>n,int</sub> = min(Tearout, Bearing) = ${details.int.Rn.toFixed(2)} kips`,
        `<strong>Total Nominal Strength:</strong>`,
        `R<sub>n</sub> = n<sub>edge</sub> * R<sub>n,edge</sub> + n<sub>int</sub> * R<sub>n,int</sub>`,
        `R<sub>n</sub> = ${details.num_edge} * ${details.edge.Rn.toFixed(2)} + ${details.num_int} * ${details.int.Rn.toFixed(2)} = ${check.Rn.toFixed(2)} kips`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'Web Bolt Shear (Eccentricity)': ({ data, check }, common) => common.format_list([
        `Bolt force from Direct Shear and Eccentric Moment (Elastic Method) per AISC Manual Part 7.`,
        `Direct Shear (V) = ${data.details.V_load.toFixed(2)} kips`,
        `Eccentricity (e) = ${data.details.eccentricity.toFixed(3)} in`,
        `Eccentric Moment (M<sub>ecc</sub>) = V * e = ${data.details.M_ecc.toFixed(2)} kip-in`,
        `Bolt Group Polar Moment of Inertia (I<sub>p</sub>) = &Sigma;(x² + y²) = ${data.details.Ip.toFixed(2)} in²`,
        `<strong>Force on Critical Bolt (Demand):</strong>`,
        `Direct Shear (f<sub>vy</sub>) = V / n<sub>bolts</sub> = ${data.details.f_vy_direct.toFixed(2)} kips`,
        `Moment Shear (f<sub>vx</sub>) = M<sub>ecc</sub> * y<sub>max</sub> / I<sub>p</sub> = ${data.details.f_vx_moment.toFixed(2)} kips`,
        `Moment Shear (f<sub>vy</sub>) = M<sub>ecc</sub> * x<sub>max</sub> / I<sub>p</sub> = ${data.details.f_vy_moment.toFixed(2)} kips`,
        `Resultant Force (R<sub>u</sub>) = &radic;(f<sub>vx</sub>² + (f<sub>vy,direct</sub> + f<sub>vy,moment</sub>)²) = ${data.demand.toFixed(2)} kips`,
        `<strong>Capacity of Single Bolt:</strong>`,
        `R<sub>n</sub> = F<sub>nv</sub> * A<sub>b</sub> * n<sub>planes</sub> = ${check.Fnv.toFixed(1)} * ${check.Ab.toFixed(3)} * ${check.num_planes} = ${check.Rn.toFixed(2)} kips`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'Web Bolt Shear/Tension Interaction': ({ check }, common) => common.format_list([
        `Bolt Shear/Tension Interaction per AISC J3.9`,
        `Required Shear Stress (f<sub>v</sub>) = V<sub>u</sub> / A<sub>b</sub> = ${check.Vu.toFixed(2)} / ${check.Ab.toFixed(3)} = ${check.fv.toFixed(2)} ksi`,
        `Adjusted Tensile Strength (F'<sub>nt</sub>) = 1.3 * F<sub>nt</sub> - (${common.design_method === 'LRFD' ? 'F_nt / (phi_v * F_nv)' : 'Omega_v * F_nt / F_nv'}) * f<sub>v</sub> &le; F<sub>nt</sub>`,
        `F'<sub>nt</sub> = 1.3 * ${check.Fnt} - (${common.design_method === 'LRFD' ? `${check.Fnt} / (0.75 * ${check.Fnv})` : `2.00 * ${check.Fnt} / ${check.Fnv}`}) * ${check.fv.toFixed(2)} = ${check.F_nt_prime.toFixed(2)} ksi`,
        `Nominal Tensile Capacity (R<sub>n</sub>) = F'<sub>nt</sub> * A<sub>b</sub> = ${check.F_nt_prime.toFixed(2)} * ${check.Ab.toFixed(3)} = <b>${check.Rn.toFixed(2)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`,
        `Demand = Tension on critical bolt (T<sub>u</sub>) = ${check.Tu.toFixed(2)} kips`
    ]),
    'Shear Yield': ({ check }, common) => common.format_list([
        `Shear Yielding per AISC J4.2(a)`,
        `Gross Shear Area (A<sub>gv</sub>) = ${check.Agv.toFixed(3)} in²`,
        `Nominal Strength (R<sub>n</sub>) = 0.6 * F<sub>y</sub> * A<sub>gv</sub>`,
        `R<sub>n</sub> = 0.6 * ${check.Fy.toFixed(1)} ksi * ${check.Agv.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'Shear Rupture': ({ check }, common) => common.format_list([
        `Shear Rupture per AISC J4.2(b)`,
        `Net Shear Area (A<sub>nv</sub>) = ${check.Anv.toFixed(3)} in²`,
        `Nominal Strength (R<sub>n</sub>) = 0.6 * F<sub>u</sub> * A<sub>nv</sub>`,
        `R<sub>n</sub> = 0.6 * ${check.Fu.toFixed(1)} ksi * ${check.Anv.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'Beam Section Tensile Rupture': ({ check }, common) => common.format_list([
        `Tensile Rupture of Beam Section per AISC D2`,
        `Net Area (A<sub>n</sub>) = ${check.An.toFixed(3)} in²`,
        `Shear Lag Factor (U) = ${check.U.toFixed(3)} (per AISC Table D3.1, Case 7)`,
        `Effective Net Area (A<sub>e</sub>) = U * A<sub>n</sub> = ${check.Ae.toFixed(3)} in²`,
        `Nominal Strength (R<sub>n</sub>) = F<sub>u</sub> * A<sub>e</sub>`,
        `R<sub>n</sub> = ${check.Fu.toFixed(1)} ksi * ${check.Ae.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
        `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
    ]),
    'Flange Bolt Prying & Tension': ({ data, check, details }, common) => {
        const outer_pry = details.outer ? `Outer Plate Q = ${details.outer.Q.toFixed(2)} kips (t<sub>c</sub>=${details.outer.tc.toFixed(3)} in)` : '';
        const inner_pry = details.inner ? `Inner Plate Q = ${details.inner.Q.toFixed(2)} kips (t<sub>c</sub>=${details.inner.tc.toFixed(3)} in)` : '';
        return common.format_list([
            `Prying action per AISC Manual Part 9.`,
            `Applied Tension per Bolt (B) = ${details.B_per_bolt.toFixed(2)} kips`,
            `Prying Force (Q) = ${outer_pry} ${inner_pry ? `+ ${inner_pry}` : ''} = ${details.Q_total.toFixed(2)} kips`,
            `Total Bolt Tension Demand = B + Q = ${data.demand.toFixed(2)} kips`,
            `Bolt Tensile Capacity (R<sub>n</sub>) = F<sub>nt</sub> * A<sub>b</sub> = ${check.Fnt.toFixed(1)} * ${check.Ab.toFixed(3)} = ${check.Rn.toFixed(2)} kips`,
            `Design Capacity = ${common.capacity_eq} = ${check.Rn.toFixed(2)} / ${common.factor_val} = <b>${common.final_capacity.toFixed(2)} kips</b>`
        ]);
    }
};

// Assign aliases for grouped checks
breakdownGenerators['Outer Plate GSY'] = breakdownGenerators['GSY'];
breakdownGenerators['Inner Plate GSY'] = breakdownGenerators['GSY'];
breakdownGenerators['Outer Plate NSF'] = breakdownGenerators['NSF'];
breakdownGenerators['Inner Plate NSF'] = breakdownGenerators['NSF'];
breakdownGenerators['Outer Plate Block Shear'] = breakdownGenerators['Block Shear'];
breakdownGenerators['Inner Plate Block Shear'] = breakdownGenerators['Block Shear'];
breakdownGenerators['Beam Flange Block Shear'] = breakdownGenerators['Block Shear'];
breakdownGenerators['Web Plate Block Shear'] = breakdownGenerators['Block Shear'];
breakdownGenerators['Outer Plate Bolt Bearing'] = breakdownGenerators['Bolt Bearing'];
breakdownGenerators['Inner Plate Bolt Bearing'] = breakdownGenerators['Bolt Bearing'];
breakdownGenerators['Beam Flange Bolt Bearing'] = breakdownGenerators['Bolt Bearing'];
breakdownGenerators['Web Plate Bolt Bearing'] = breakdownGenerators['Bolt Bearing'];
breakdownGenerators['Beam Web Bolt Bearing'] = breakdownGenerators['Bolt Bearing'];
breakdownGenerators['Web Plate Gross Shear Yield'] = breakdownGenerators['Shear Yield'];
breakdownGenerators['Beam Web Shear Yielding'] = breakdownGenerators['Shear Yield'];
breakdownGenerators['Web Plate Net Shear Rupture'] = breakdownGenerators['Shear Rupture'];
breakdownGenerators['Beam Web Shear Rupture'] = breakdownGenerators['Shear Rupture'];

function renderSpliceInputSummary(inputs) {
    const {
        design_method, gap,
        member_d, member_bf, member_tf, member_tw, member_Fy, member_Fu,
        num_flange_plates, H_fp, t_fp, L_fp, flange_plate_Fy, flange_plate_Fu,
        H_fp_inner, t_fp_inner, L_fp_inner,
        Nc_fp, Nr_fp, D_fp, bolt_grade_fp,
        num_web_plates, H_wp, t_wp, L_wp, web_plate_Fy, web_plate_Fu,
        Nc_wp, Nr_wp, D_wp, bolt_grade_wp
    } = inputs;

    let html = `
    <div id="splice-input-summary-section" class="report-section-copyable">
        <div class="flex justify-between items-center">
            <h3 class="report-header">Input Summary</h3>
            <button data-copy-target-id="splice-input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2">
                <caption class="report-caption">General & Member Properties</caption>
                <tbody>
                    <tr><td>Design Method</td><td>${design_method}</td></tr>
                    <tr><td>Gap</td><td>${gap}"</td></tr>
                    <tr><td class="font-semibold">Member (W${member_d}x...)</td><td>Fy=${member_Fy}ksi, Fu=${member_Fu}ksi</td></tr>
                </tbody>
            </table>

            <table class="w-full mt-4">
                <caption class="report-caption">Flange Splice Details</caption>
                <tbody>
                    <tr>
                        <td class="font-semibold">Outer Plate</td>
                        <td>PL ${H_fp}" x ${L_fp}" x ${t_fp}"</td>
                    </tr>
                    ${num_flange_plates == 2 ? `
                    <tr>
                        <td class="font-semibold">Inner Plate</td>
                        <td>PL ${H_fp_inner}" x ${L_fp_inner}" x ${t_fp_inner}"</td>
                    </tr>
                    ` : ''}
                    <tr>
                        <td class="font-semibold">Flange Bolts</td>
                        <td>${Nc_fp * Nr_fp * 2} total bolts (${Nc_fp} cols &times; ${Nr_fp} rows per side)</td>
                    </tr>
                     <tr>
                        <td>Bolt Details</td>
                        <td>&empty;${D_fp}" ${bolt_grade_fp}</td>
                    </tr>
                </tbody>
            </table>

            <table class="w-full mt-4">
                <caption class="report-caption">Web Splice Details</caption>
                <tbody>
                    <tr>
                        <td class="font-semibold">Web Plate(s)</td>
                        <td>${num_web_plates} &times; PL ${H_wp}" x ${L_wp}" x ${t_wp}"</td>
                    </tr>
                    <tr>
                        <td class="font-semibold">Web Bolts</td>
                        <td>${Nc_wp * Nr_wp * 2} total bolts (${Nc_wp} cols &times; ${Nr_wp} rows per side)</td>
                    </tr>
                     <tr>
                        <td>Bolt Details</td>
                        <td>&empty;${D_wp}" ${bolt_grade_wp}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>`;
    return html;
}

function renderResults(results, rawInputs) {
    const { checks, geomChecks, inputs, final_loads } = results; // `inputs` here are the potentially modified ones from the calc
    let optimizationHtml = '';
    if (results.optimizationLog && results.optimizationLog.length > 0) {
        optimizationHtml = `<div class="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 my-4 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-600">
            <p class="font-bold">Optimization Log:</p>
            <ul class="list-disc list-inside mt-2 text-sm">${results.optimizationLog.map(log => `<li>${log}</li>`).join('')}</ul>
        </div>`;
    }
    let html = `<div class="results-section">
                <div class="flex justify-end gap-2 -mt-2 -mr-2 print-hidden">
                    <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm print-hidden">Download PDF</button>
                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm print-hidden">Copy Report</button>
                </div>
                <h2 class="report-header !mt-0 text-center">Splice Check Results</h2>
                ${renderSpliceInputSummary(rawInputs)}
                ${optimizationHtml}
                <div id="splice-geom-checks-section" class="report-section-copyable mt-6">
                    <div class="flex justify-between items-center"><h3 class="report-header">Geometry & Spacing Checks</h3><button data-copy-target-id="splice-geom-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button></div>
                    <div class="copy-content">
    `;

    const addGeomRow = (name, data, isMaxCheck = false) => {
        const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const limit_val = isMaxCheck ? data.max : data.min;
        const limit_label = isMaxCheck ? 'Maximum' : 'Minimum';
        html += `<tr><td>${name} (${limit_label})</td><td>${data.actual.toFixed(3)}</td><td>${limit_val.toFixed(3)}</td><td>${status}</td></tr>`;
    };

    html += `<table class="w-full mt-2"><caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">Geometry & Spacing Checks (AISC J3)</caption>` +
        `<thead><tr><th>Item</th><th>Actual (in)</th><th>Limit (in)</th><th>Status</th></tr></thead><tbody>`;

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
    html += `</tbody></table></div></div>`;

    html += `<div id="splice-strength-checks-section" class="report-section-copyable mt-6">
                <div class="flex justify-between items-center"><h3 class="report-header">Strength Checks</h3><button data-copy-target-id="splice-strength-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button></div>
                <div class="copy-content">
                    <table class="w-full mt-2"><caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">Strength Checks (${inputs.design_method})</caption>
                    <thead class="text-sm"><tr><th class="w-2/5">Limit State</th><th>Demand</th><th>Capacity</th><th>Ratio</th><th>Status</th></tr></thead><tbody>`;
    let checkCounter = 0;
    const addRow = (name, data) => {
        if (!data || !data.check) return;
        checkCounter++;
        const detailId = `details-${checkCounter}`;
        let { demand, check } = data;
        const { Rn, phi, omega } = check;

        const capacity = Rn || 0;
        const design_capacity_raw = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

        let display_demand = demand; // kip-in for flexure, kips for others
        let display_capacity = design_capacity_raw;
        let demand_unit = '';
        let capacity_unit = '';

        // Special handling for thickness check
        if (name === 'Plate Thickness for Prying') {
            demand_unit = 'in';
            capacity_unit = 'in (req)';
        }

        // Special handling for Beam Flexural Rupture which is in kip-in
        if (name === 'Beam Flexural Rupture') {
            display_demand /= 12.0; // Convert demand from kip-in to kip-ft for display
            display_capacity /= 12.0; // Convert capacity from kip-in to kip-ft for display
        }
        const ratio = design_capacity_raw > 0 ? Math.abs(demand) / design_capacity_raw : Infinity;

        const status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const breakdownHtml = generateBreakdownHtml(name, data, inputs.design_method);
        html += `<tr class="border-t dark:border-gray-700">
                    <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${display_demand.toFixed(2)} ${demand_unit}</td><td>${display_capacity.toFixed(2)} ${capacity_unit}</td><td>${ratio.toFixed(3)}</td><td>${status}</td>
                   </tr>
                   <tr id="${detailId}" class="details-row"> 
                     <td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td>
                   </tr>`;
    };

    const flangeChecks = Object.fromEntries(Object.entries(checks).filter(([k]) => k.includes('Flange')));
    const webChecks = Object.fromEntries(Object.entries(checks).filter(([k]) => k.includes('Web')));
    const memberChecks = Object.fromEntries(Object.entries(checks).filter(([k]) => k.includes('Beam') && !k.includes('Flange') && !k.includes('Web')));

    html += `<tr><td colspan="5" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Flange Splice Checks</td></tr>`;
    Object.entries(flangeChecks).forEach(([name, data]) => addRow(name, data)); 

    html += `<tr><td colspan="5" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Web Splice Checks</td></tr>`;
    Object.entries(webChecks).forEach(([name, data]) => addRow(name, data));

    html += `<tr><td colspan="5" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Member Checks at Splice</td></tr>`;
    Object.entries(memberChecks).forEach(([name, data]) => addRow(name, data)); 

    html += `</tbody></table></div></div></div>`; // End of strength checks and results-section div
    document.getElementById('results-container').innerHTML = html;
}

// --- Input Gathering and Orchestration ---
const inputIds = [
    'design_method', 'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Fy', 'member_Fu',
    'member_material', 'member_Zx', 'member_Sx', 'M_load', 'V_load', 'Axial_load', 'develop_capacity_check', 'deformation_is_consideration', 'g_gage_fp', 'optimize_bolts_check', 'optimize_diameter_check',
    'num_flange_plates', 'flange_plate_material', 'flange_plate_Fy', 'flange_plate_Fu', 'H_fp', 't_fp', 'L_fp',
    'flange_plate_material_inner', 'flange_plate_Fy_inner', 'flange_plate_Fu_inner', 'H_fp_inner', 't_fp_inner', 'L_fp_inner',
    'Nc_fp', 'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp',
    'num_web_plates', 'web_plate_material', 'web_plate_Fy', 'web_plate_Fu', 'H_wp', 't_wp', 'L_wp',
    'Nc_wp', 'Nr_wp', 'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp', 'hole_calc_method',
    'D_fp', 'bolt_grade_fp', 'threads_included_fp', 'D_wp', 'bolt_grade_wp', 'threads_included_wp',
];

document.addEventListener('DOMContentLoaded', () => {
    // --- Attach Event Listeners ---

    function populateMaterialDropdowns() {
        const gradeOptions = Object.keys(AISC_SPEC.structuralSteelGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');

        const dropdowns = [
            { id: 'member_material', default: 'A992' },
            { id: 'flange_plate_material', default: 'A36' },
            { id: 'flange_plate_material_inner', default: 'A36' },
            { id: 'web_plate_material', default: 'A36' },
        ];

        dropdowns.forEach(({ id, default: defaultGrade }) => {
            const select = document.getElementById(id);
            if (select) {
                select.innerHTML = gradeOptions;
                select.value = defaultGrade;
                select.addEventListener('change', (e) => {
                    const grade = AISC_SPEC.getSteelGrade(e.target.value);
                    if (grade) {
                        document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                        document.getElementById(e.target.dataset.fuTarget).value = grade.Fu;
                    }
                });
                select.dispatchEvent(new Event('change')); // Trigger initial population
            }
        });
    }

    function populateBoltGradeDropdowns() {
        const boltGradeOptions = Object.keys(AISC_SPEC.boltGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');

        const dropdownIds = ['bolt_grade_fp', 'bolt_grade_wp'];

        dropdownIds.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                select.innerHTML = boltGradeOptions;
                select.value = 'A325'; // Set a default value
            }
        });
    }

    const handleRunCheck = createCalculationHandler({
        inputIds: inputIds, // Pass the array to the handler
        storageKey: 'splice-inputs',
        validationRuleKey: 'splice',
        calculatorFunction: (rawInputs) => {
            drawFlangeDiagram();
            drawWebDiagram();
            const results = spliceCalculator.run(rawInputs);
            if (results.inputs.develop_capacity_check) {
                document.getElementById('M_load').value = results.final_loads.M_load.toFixed(2);
                document.getElementById('V_load').value = results.final_loads.V_load.toFixed(2);
            }
            if (results.inputs.optimize_bolts_check) {
                document.getElementById('Nc_fp').value = results.inputs.Nc_fp;
                document.getElementById('Nr_fp').value = results.inputs.Nr_fp;
                document.getElementById('Nc_wp').value = results.inputs.Nc_wp;
                document.getElementById('Nr_wp').value = results.inputs.Nr_wp;
                document.getElementById('D_fp').value = results.inputs.D_fp;
                document.getElementById('D_wp').value = results.inputs.D_wp;
            }
            return results;
        },
        renderFunction: (results, rawInputs) => renderResults(results, rawInputs),
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });
    populateMaterialDropdowns();
    populateBoltGradeDropdowns();

    loadInputsFromLocalStorage('splice-inputs', inputIds);

    // --- Auto-save inputs to localStorage on any change ---
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('change', () => saveInputsToLocalStorage('splice-inputs', gatherInputsFromIds(inputIds)));
    });

    const handleSaveInputs = createSaveInputsHandler(inputIds, 'splice-inputs.txt', 'feedback-message');
    const handleLoadInputs = createLoadInputsHandler(inputIds, handleRunCheck, 'feedback-message');
    
    document.getElementById('run-check-btn').addEventListener('click', handleRunCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', handleSaveInputs);
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', handleLoadInputs);
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
    });

    const flangeInputsToWatch = ['H_fp', 'member_bf', 'Nc_fp', 'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp', 'gap', 'g_gage_fp', 'D_fp', 'L_fp'];
    flangeInputsToWatch.forEach(id => document.getElementById(id)?.addEventListener('input', drawFlangeDiagram));

    const webInputsToWatch = ['H_wp', 'member_d', 'member_tf', 'Nc_wp', 'Nr_wp', 'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp', 'gap', 'D_wp', 'L_wp'];
    webInputsToWatch.forEach(id => document.getElementById(id)?.addEventListener('input', drawWebDiagram));

    drawFlangeDiagram();
    drawWebDiagram();
});