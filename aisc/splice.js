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
    if (!isFinite(scale)) return;

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
    const HOLE_OVERSIZE_GEOM = 1/16; // in, for bearing/prying

function checkBoltShear(grade, threadsIncl, db, numPlanes = 1) { // AISC J3.6
    const FnvMap = { "A325": {true: 54.0, false: 68.0}, "A490": {true: 68.0, false: 84.0}, "F3148": {true: 65.0, false: 81.0} }; // Table J3.2
    const Fnv = FnvMap[grade]?.[threadsIncl] ?? 0;
    const Ab = PI * (db ** 2) / 4.0;
    return { Rn: Fnv * Ab * numPlanes, phi: 0.75, omega: 2.00, Fnv, Ab, num_planes: numPlanes };
}

function checkBoltBearing(db, t_ply, Fu_ply, le, s, isEdgeBolt, deformationIsConsideration) {
    // AISC 360-22 Eq J3-6.
    const tearout_coeff = deformationIsConsideration ? 1.5 : 1.2;
    const bearing_coeff = deformationIsConsideration ? 3.0 : 2.4;
    const hole_dia = db + HOLE_OVERSIZE_GEOM; // Standard hole per AISC Table J3.3
    const Lc = isEdgeBolt ? le - hole_dia / 2.0 : s - hole_dia;
    if (Lc < 0) return { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 }; 

    const Rn_tearout = tearout_coeff * Lc * t_ply * Fu_ply;
    const Rn_bearing = bearing_coeff * db * t_ply * Fu_ply;
    return { Rn: min(Rn_tearout, Rn_bearing), phi: 0.75, omega: 2.00, Lc, Rn_tearout, Rn_bearing };
}

function checkGrossSectionYielding(Ag, Fy) {
    // AISC 360-22 Eq J4-1
    return { Rn: Fy * Ag, phi: 0.90, omega: 1.67, Ag, Fy };
}

function checkNetSectionFracture(An, Fu, U = 1.0) {
    // AISC 360-22 Eq J4-2
    const Ae = U * An;
    return { Rn: Fu * Ae, phi: 0.75, omega: 2.00, An, Fu, U, Ae };
}

function checkBlockShear(Anv, Agv, Ant, Fu, Fy, Ubs = 1.0) {
    // AISC 360-22 Eq J4-5
    if (Anv <= 0 || Agv <= 0 || Ant < 0) return { Rn: 0, phi: 0.75, omega: 2.00, Anv, Agv, Ant, Fu, Fy, Ubs };
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
    const FntMap = { "A325": 90.0, "A490": 113.0, "F3148": 90.0 }; // Table J3.2
    const FnvMap = { "A325": {true: 54.0, false: 68.0}, "A490": {true: 68.0, false: 84.0}, "F3148": {true: 65.0, false: 81.0} }; // Table J3.2
    
    const Fnt = FntMap[grade] ?? 0;
    const Fnv = FnvMap[grade]?.[threadsIncl] ?? 0;
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
    // From AISC Table J3.4
    const min_le_map = {0.75: 1.0, 0.875: 1.25, 1.0: 1.5};
    const min_le = min_le_map[db] || 1.25 * db;
    const min_s = 2.667 * db;
    // From AISC J3.5
    const max_s = min(24 * t_thinner, 12.0);
    return {
        edge_dist_long: { actual: le_long, min: min_le, pass: le_long >= min_le },
        edge_dist_tran: { actual: le_tran, min: min_le, pass: le_tran >= min_le },
        spacing_col: { actual: s_col, min: min_s, pass: s_col >= min_s },
        spacing_row: { actual: s_row, min: min_s, pass: s_row >= min_s },
        max_spacing_col: { actual: s_col, max: max_s, pass: s_col <= max_s },
        max_spacing_row: { actual: s_row, max: max_s, pass: s_row <= max_s }
    };
}

function run(rawInputs) {
    // --- PUBLIC API ---
    // Create a mutable copy of inputs for this run
    const inputs = { ...rawInputs };

    // Define a zero-value check object to use as a fallback for bearing calculations.
    const zero_bearing_check = { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };

    // The user inputs TOTAL plate length. Convert to length-per-side for calculations.
    inputs.L_fp = (rawInputs.L_fp || 0) / 2.0;
    inputs.L_fp_inner = (rawInputs.L_fp_inner || 0) / 2.0;
    inputs.L_wp = (rawInputs.L_wp || 0) / 2.0;

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

    const checks = {};
    const geomChecks = {};

    // --- Flange Splice Checks ---
    const hole_dia_net_area_fp = inputs.D_fp + (1/8);
    const num_flange_bolts_total = inputs.Nc_fp * inputs.Nr_fp * 2;
    const num_shear_planes_fp = inputs.num_flange_plates === 2 ? 2 : 1;
    const single_bolt_shear_fp_check = checkBoltShear(inputs.bolt_grade_fp, inputs.threads_included_fp, inputs.D_fp, num_shear_planes_fp);
    checks['Flange Bolt Shear'] = { 
        demand: total_flange_demand_tension, 
        check: { Rn: single_bolt_shear_fp_check.Rn * num_flange_bolts_total, ...single_bolt_shear_fp_check },
        details: {
            Rn_single: single_bolt_shear_fp_check.Rn,
            num_bolts: num_flange_bolts_total
        }
    };
    
    // Outer Plate Checks
    const Ag_fp_outer = inputs.H_fp * inputs.t_fp;
    checks['Outer Plate GSY'] = { demand: demand_fp_outer, check: checkGrossSectionYielding(Ag_fp_outer, inputs.flange_plate_Fy) };
    const An_fp_outer = (inputs.H_fp - 2 * inputs.Nr_fp * hole_dia_net_area_fp) * inputs.t_fp;
    checks['Outer Plate NSF'] = { demand: demand_fp_outer, check: checkNetSectionFracture(An_fp_outer, inputs.flange_plate_Fu) };
    checks['Outer Plate Compression'] = { demand: demand_fp_outer_comp, check: checkPlateCompression(Ag_fp_outer, inputs.flange_plate_Fy, inputs.t_fp, inputs.S1_col_spacing_fp) };

    const edge_dist_gap_fp = inputs.S3_end_dist_fp; // S3 is now defined as the distance from gap to first bolt
    const bolt_pattern_width = (inputs.Nc_fp > 1 ? (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp : 0);
    const le_long_fp = inputs.L_fp - edge_dist_gap_fp - bolt_pattern_width; // This is the calculated longitudinal edge distance at the end of the plate.

    const bolt_pattern_height_fp = inputs.Nr_fp <= 1 ? inputs.g_gage_fp : inputs.g_gage_fp + 2 * (inputs.Nr_fp - 1) * inputs.S2_row_spacing_fp;
    const le_tran_fp = (inputs.H_fp - bolt_pattern_height_fp) / 2.0;
    
    const Agv_fp = 2 * (le_long_fp + (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp) * inputs.t_fp;
    const Anv_fp = Agv_fp - 2 * (inputs.Nc_fp) * hole_dia_net_area_fp * inputs.t_fp; 
    const Ant_fp_simple = (bolt_pattern_height_fp - (2 * inputs.Nr_fp) * hole_dia_net_area_fp) * inputs.t_fp;
    checks['Outer Plate Block Shear'] = { demand: demand_fp_outer, check: checkBlockShear(Anv_fp, Agv_fp, Ant_fp_simple, inputs.flange_plate_Fu, inputs.flange_plate_Fy) };
    
    const bearing_fp_plate_edge = checkBoltBearing(inputs.D_fp, inputs.t_fp, inputs.flange_plate_Fu, le_long_fp, inputs.S1_col_spacing_fp, true, inputs.deformation_is_consideration);
    const bearing_fp_plate_int = checkBoltBearing(inputs.D_fp, inputs.t_fp, inputs.flange_plate_Fu, le_long_fp, inputs.S1_col_spacing_fp, false, inputs.deformation_is_consideration);
    const num_edge_bolts_fp = inputs.Nr_fp * 2;
    const num_int_bolts_fp = (inputs.Nc_fp - 1) * inputs.Nr_fp * 2;
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
        checks['Inner Plate GSY'] = { demand: demand_fp_inner, check: checkGrossSectionYielding(Ag_fp_inner, inputs.flange_plate_Fy_inner) };
        const An_fp_inner = (inputs.H_fp_inner - 2 * inputs.Nr_fp * hole_dia_net_area_fp) * inputs.t_fp_inner;
        checks['Inner Plate NSF'] = { demand: demand_fp_inner, check: checkNetSectionFracture(An_fp_inner, inputs.flange_plate_Fu_inner) };
        checks['Inner Plate Compression'] = { demand: demand_fp_inner_comp, check: checkPlateCompression(Ag_fp_inner, inputs.flange_plate_Fy_inner, inputs.t_fp_inner, inputs.S1_col_spacing_fp) };

        const Agv_fp_inner = 2 * (le_long_fp + (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp) * inputs.t_fp_inner;
        const Anv_fp_inner = Agv_fp_inner - 2 * inputs.Nc_fp * hole_dia_net_area_fp * inputs.t_fp_inner;
        const Ant_fp_simple_inner = (bolt_pattern_height_fp - (2 * inputs.Nr_fp) * hole_dia_net_area_fp) * inputs.t_fp_inner;
        checks['Inner Plate Block Shear'] = { demand: demand_fp_inner, check: checkBlockShear(Anv_fp_inner, Agv_fp_inner, Ant_fp_simple_inner, inputs.flange_plate_Fu_inner, inputs.flange_plate_Fy_inner) };
        
        const bearing_fp_inner_edge = checkBoltBearing(inputs.D_fp, inputs.t_fp_inner, inputs.flange_plate_Fu_inner, le_long_fp, inputs.S1_col_spacing_fp, true, inputs.deformation_is_consideration);
        const bearing_fp_inner_int = checkBoltBearing(inputs.D_fp, inputs.t_fp_inner, inputs.flange_plate_Fu_inner, le_long_fp, inputs.S1_col_spacing_fp, false, inputs.deformation_is_consideration);
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

    const bearing_fp_beam_edge = checkBoltBearing(inputs.D_fp, inputs.member_tf, inputs.member_Fu, le_long_fp, inputs.S1_col_spacing_fp, true, inputs.deformation_is_consideration);
    const num_edge_bolts_fp_beam = inputs.Nr_fp * 2;
    const num_int_bolts_fp_beam = (inputs.Nc_fp - 1) * inputs.Nr_fp * 2;
    const bearing_fp_beam_int = num_int_bolts_fp_beam > 0 ? checkBoltBearing(inputs.D_fp, inputs.member_tf, inputs.member_Fu, Infinity, inputs.S1_col_spacing_fp, false, inputs.deformation_is_consideration) : zero_bearing_check;

    const total_bearing_fp_beam = bearing_fp_beam_edge.Rn * num_edge_bolts_fp_beam + bearing_fp_beam_int.Rn * num_int_bolts_fp_beam; 
    checks['Beam Flange Bolt Bearing'] = { 
        demand: total_flange_demand_tension, 
        check: { Rn: total_bearing_fp_beam, phi: bearing_fp_beam_edge.phi, omega: bearing_fp_beam_edge.omega },
        details: {
            edge: bearing_fp_beam_edge,
            int: bearing_fp_beam_int,
            num_edge: num_edge_bolts_fp_beam,
            num_int: num_int_bolts_fp_beam
        }
    }; 

    const Agv_beam_f = 2 * (le_long_fp + (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp) * inputs.member_tf;
    const Anv_beam_f = Agv_beam_f - 2 * inputs.Nc_fp * hole_dia_net_area_fp * inputs.member_tf;
    const Ant_beam_f = (bolt_pattern_height_fp - (2 * inputs.Nr_fp) * hole_dia_net_area_fp) * inputs.member_tf;
    checks['Beam Flange Block Shear'] = { demand: total_flange_demand_tension, check: checkBlockShear(Anv_beam_f, Agv_beam_f, Ant_beam_f, inputs.member_Fu, inputs.member_Fy) };

    // --- Prying Action Check ---
    const B_per_bolt = num_flange_bolts_total > 0 ? total_flange_demand_tension / num_flange_bolts_total : 0;
    if (B_per_bolt > 0) {
        const p_pry = inputs.S1_col_spacing_fp;
        const d_hole_pry = inputs.D_fp + HOLE_OVERSIZE_GEOM; // Standard hole for prying calcs

        let Q_total = 0;
        let prying_details_combined = {};
        
        // Force resisted by outer plate. Assume 50% for 2-plate, 100% for 1-plate.
        const B_plate_outer = inputs.num_flange_plates === 2 ? B_per_bolt * 0.5 : B_per_bolt;
        const b_pry_outer = inputs.g_gage_fp / 2.0;
        const a_pry_outer = le_tran_fp;
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
    }

    // --- Web Splice Checks ---
    const hole_dia_net_area_wp = inputs.D_wp + (1/8);
    
    // Web Bolt Shear Demand (from Direct Shear + Eccentricity)
    const web_ecc_details = calculateWebSpliceEccentricity(V_load, inputs.gap, inputs.Nc_wp, inputs.Nr_wp, inputs.S4_col_spacing_wp, inputs.S5_row_spacing_wp, inputs.S6_end_dist_wp);
    const Vu_web_bolt = web_ecc_details.max_R;
    const single_web_bolt_shear_check = checkBoltShear(inputs.bolt_grade_wp, inputs.threads_included_wp, inputs.D_wp, inputs.num_web_plates);
    checks['Web Bolt Shear (Eccentricity)'] = { 
        demand: Vu_web_bolt, 
        check: single_web_bolt_shear_check,
        details: { ...web_ecc_details, V_load: inputs.V_load }
    };
    
    // --- Web Bolt Tension Demand (Tu) from Moment on Web (per AISC Manual Part 14) ---
    // 1. Find the design moment capacity of the flange splice.
    const flange_splice_capacity = checks['Flange Bolt Shear']?.check?.Rn ?? 0;
    const design_flange_capacity = inputs.design_method === 'LRFD' ? flange_splice_capacity * 0.75 : flange_splice_capacity / 2.0;
    const M_flange_max = design_flange_capacity * moment_arm_flange; // kip-in

    // 2. Determine moment that must go to the web splice.
    const M_total_demand = abs(M_load * 12); // kip-in
    const M_web_from_flange_shortfall = Math.max(0, M_total_demand - M_flange_max);

    // 3. Consider minimum moment from shear eccentricity.
    const M_web_from_eccentricity = web_ecc_details.M_ecc;

    // 4. The web splice must be designed for the greater of these two moments.
    const M_web_design = Math.max(M_web_from_flange_shortfall, M_web_from_eccentricity);

    // 5. Distribute this design moment to the web bolts to find tension on the critical bolt.
    let Tu_web_bolt = 0;
    let I_bolts_y = 0;
    const y_centroid = (inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp / 2.0;
    for (let j = 0; j < inputs.Nr_wp; j++) {
        const dy = j * inputs.S5_row_spacing_wp - y_centroid;
        I_bolts_y += dy**2;
    }
    if (I_bolts_y > 0) Tu_web_bolt = (M_web_design * y_centroid) / (I_bolts_y * inputs.Nc_wp);

    checks['Web Bolt Shear/Tension Interaction'] = { demand: Tu_web_bolt, check: checkBoltShearTensionInteraction(Tu_web_bolt, Vu_web_bolt, inputs.bolt_grade_wp, inputs.threads_included_wp, inputs.D_wp, inputs.design_method) }; 

    const total_t_wp = inputs.t_wp * inputs.num_web_plates;
    const Agv_wp = inputs.H_wp * total_t_wp;
    checks['Web Plate Gross Shear Yield'] = { demand: V_load, check: checkShearYielding(Agv_wp, inputs.web_plate_Fy) };
    const Anv_wp = (inputs.H_wp - inputs.Nr_wp * hole_dia_net_area_wp) * total_t_wp;
    checks['Web Plate Net Shear Rupture'] = { demand: V_load, check: checkShearRupture(Anv_wp, inputs.web_plate_Fu) };
    
    const edge_dist_gap_wp = inputs.S6_end_dist_wp;
    const bolt_pattern_width_wp = (inputs.Nc_wp > 1 ? (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp : 0);
    const le_long_wp = inputs.L_wp - edge_dist_gap_wp - bolt_pattern_width_wp;

    const le_tran_wp = (inputs.H_wp - (inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2.0;
    const Agv_wp_bs = (le_long_wp + (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp) * total_t_wp;
    const Anv_wp_bs = Agv_wp_bs - inputs.Nc_wp * hole_dia_net_area_wp * total_t_wp;
    const Ant_wp_bs = (le_tran_wp - 0.5 * hole_dia_net_area_wp) * total_t_wp;
    checks['Web Plate Block Shear'] = { demand: V_load, check: checkBlockShear(Anv_wp_bs, Agv_wp_bs, Ant_wp_bs, inputs.web_plate_Fu, inputs.web_plate_Fy) };
    const bearing_wp_plate_single_bolt = checkBoltBearing(inputs.D_wp, total_t_wp, inputs.web_plate_Fu, le_long_wp, inputs.S4_col_spacing_wp, true, inputs.deformation_is_consideration);
    checks['Web Plate Bolt Bearing'] = { demand: Vu_web_bolt, check: bearing_wp_plate_single_bolt, details: { edge: bearing_wp_plate_single_bolt, int: zero_bearing_check, num_edge: 1, num_int: 0 } };
    
    const bearing_wp_beam_single_bolt = checkBoltBearing(inputs.D_wp, inputs.member_tw, inputs.member_Fu, le_long_wp, inputs.S4_col_spacing_wp, true, inputs.deformation_is_consideration);
    checks['Beam Web Bolt Bearing'] = { demand: Vu_web_bolt, check: bearing_wp_beam_single_bolt, details: { edge: bearing_wp_beam_single_bolt, int: zero_bearing_check, num_edge: 1, num_int: 0 } };

    const Agv_beam_web = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
    checks['Beam Web Shear Yielding'] = { demand: V_load, check: checkShearYielding(Agv_beam_web, inputs.member_Fy) };

    // --- Beam Member Checks ---
    checks['Beam Flexural Rupture'] = { demand: M_load * 12, check: checkBeamFlexuralRupture(inputs.member_Sx, inputs.member_Fu, inputs.member_d, inputs.member_bf, inputs.member_tf, inputs.Nr_fp, hole_dia_net_area_fp) };
    const Anv_beam_web = (inputs.member_d - 2*inputs.member_tf - inputs.Nr_wp * hole_dia_net_area_wp) * inputs.member_tw;
    checks['Beam Web Shear Rupture'] = { demand: V_load, check: checkShearRupture(Anv_beam_web, inputs.member_Fu) };

    // --- Beam Section Tensile Rupture Check (with Shear Lag) ---
    if (inputs.Axial_load > 0) {
        const A_gross_approx = 2 * inputs.member_bf * inputs.member_tf + (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw; 
        const A_holes_flange = 2 * inputs.Nr_fp * hole_dia_net_area_fp * inputs.member_tf;
        const A_holes_web = inputs.Nr_wp * hole_dia_net_area_wp * inputs.member_tw;
        const An = A_gross_approx - A_holes_flange - A_holes_web;

        // Shear Lag Factor U per AISC Table D3.1, Case 7 (W, M, S shapes with flange connections)
        const An_conn = 2 * (inputs.member_bf - inputs.Nr_fp * hole_dia_net_area_fp) * inputs.member_tf;
        const Ag_conn = 2 * inputs.member_bf * inputs.member_tf;
        const U = Ag_conn > 0 ? An_conn / Ag_conn : 1.0;
        
        const Ae = U * An;
        const check = { Rn: inputs.member_Fu * Ae, phi: 0.75, omega: 2.00, An, Ae, U, Fu: inputs.member_Fu };
        checks['Beam Section Tensile Rupture'] = { demand: inputs.Axial_load, check };
    }

    // --- Geometry Checks ---
    const t_thinner_flange = min(inputs.member_tf, inputs.t_fp, inputs.num_flange_plates === 2 ? inputs.t_fp_inner : Infinity);
    geomChecks['Flange Bolts'] = getGeometryChecks(inputs.D_fp, inputs.S1_col_spacing_fp, inputs.S2_row_spacing_fp, le_long_fp, le_tran_fp, t_thinner_flange);
    const min_le_fp = geomChecks['Flange Bolts'].edge_dist_long.min;
    geomChecks['Flange Bolts'].edge_dist_gap = { actual: edge_dist_gap_fp, min: min_le_fp, pass: edge_dist_gap_fp >= min_le_fp };
    const t_thinner_web = min(inputs.member_tw, inputs.t_wp * inputs.num_web_plates);
    geomChecks['Web Bolts'] = getGeometryChecks(inputs.D_wp, inputs.S4_col_spacing_wp, inputs.S5_row_spacing_wp, le_long_wp, le_tran_wp, t_thinner_web);
    const min_le_wp = geomChecks['Web Bolts'].edge_dist_long.min;
    geomChecks['Web Bolts'].edge_dist_gap = { actual: edge_dist_gap_wp, min: min_le_wp, pass: edge_dist_gap_wp >= min_le_wp };

    return { checks, geomChecks, inputs, final_loads: { M_load, V_load } };
}

return { run };
})();
function generateBreakdownHtml(name, data, design_method) { // This function is used by renderResults
    const { check, details } = data;
    if (!check) return '';
    let content = '';

    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? check.phi : check.omega;
    const capacity_eq = design_method === 'LRFD' ? `&phi;R<sub>n</sub>` : `R<sub>n</sub> / &Omega;`;
    const design_capacity = (check.Rn / (factor_val || 1.0)); 
    const final_capacity = design_method === 'LRFD' ? check.Rn * factor_val : check.Rn / factor_val;
    const format_list = (items) => `<ul>${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;

    switch (name) {
        case 'Flange Bolt Shear':
            content = format_list([
                `Nominal Shear Strength per bolt (R<sub>n,bolt</sub>) = F<sub>nv</sub> * A<sub>b</sub> * n<sub>planes</sub>`,
                `R<sub>n,bolt</sub> = ${check.Fnv.toFixed(1)} ksi * ${check.Ab.toFixed(3)} in² * ${check.num_planes} = ${details.Rn_single.toFixed(2)} kips`,
                `Total Nominal Strength (R<sub>n</sub>) = R<sub>n,bolt</sub> * n<sub>bolts</sub>`,
                `R<sub>n</sub> = ${details.Rn_single.toFixed(2)} kips * ${details.num_bolts} = <b>${check.Rn.toFixed(2)} kips</b>`, 
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        
        case 'Outer Plate GSY': case 'Inner Plate GSY':
            content = format_list([
                `Gross Section Yielding per AISC J4-1`,
                `Nominal Strength (R<sub>n</sub>) = F<sub>y</sub> * A<sub>g</sub>`,
                `R<sub>n</sub> = ${check.Fy.toFixed(1)} ksi * ${check.Ag.toFixed(3)} in² = ${check.Rn.toFixed(2)} kips`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Outer Plate NSF': case 'Inner Plate NSF':
            content = format_list([
                `Net Section Fracture per AISC J4-2`,
                `Effective Net Area (A<sub>e</sub>) = U * A<sub>n</sub> = ${check.U.toFixed(2)} * ${check.An.toFixed(3)} in² = ${check.Ae.toFixed(3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = F<sub>u</sub> * A<sub>e</sub>`,
                `R<sub>n</sub> = ${check.Fu.toFixed(1)} ksi * ${check.Ae.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Outer Plate Block Shear': case 'Inner Plate Block Shear': case 'Beam Flange Block Shear': case 'Web Plate Block Shear':
             content = format_list([ 
                `Block Shear Rupture per AISC J4-5`,
                `Shear Yield Path: (0.6*F<sub>y</sub>*A<sub>gv</sub>) + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub> = ${check.path_yield.toFixed(2)} kips`,
                `Shear Rupture Path: (0.6*F<sub>u</sub>*A<sub>nv</sub>) + U<sub>bs</sub>*F<sub>u</sub>*A<sub>nt</sub> = ${check.path_rupture.toFixed(2)} kips`,
                `Nominal Strength (R<sub>n</sub>) = min(Shear Yield Path, Shear Rupture Path)`,
                `R<sub>n</sub> = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Outer Plate Bolt Bearing': case 'Inner Plate Bolt Bearing': case 'Beam Flange Bolt Bearing': case 'Web Plate Bolt Bearing': case 'Beam Web Bolt Bearing':
            content = format_list([
                `Bolt Bearing per AISC J3.10`,
                `<strong>Edge Bolts (per bolt):</strong>`,
                `<li class="pl-4">Clear Distance (L<sub>c</sub>) = L<sub>e</sub> - d<sub>h</sub>/2 = ${details.edge.Lc.toFixed(3)} in</li>`,
                `<li class="pl-4">Tearout R<sub>n</sub> = 1.5 * L<sub>c</sub> * t * F<sub>u</sub> = ${details.edge.Rn_tearout.toFixed(2)} kips</li>`,
                `<li class="pl-4">Bearing R<sub>n</sub> = 3.0 * d<sub>b</sub> * t * F<sub>u</sub> = ${details.edge.Rn_bearing.toFixed(2)} kips</li>`,
                `<li class="pl-4">R<sub>n,edge</sub> = min(Tearout, Bearing) = ${details.edge.Rn.toFixed(2)} kips</li>`,
                `<strong>Interior Bolts (per bolt):</strong>`,
                `<li class="pl-4">Clear Distance (L<sub>c</sub>) = s - d<sub>h</sub> = ${details.int.Lc.toFixed(3)} in</li>`,
                `<li class="pl-4">Tearout R<sub>n</sub> = 1.5 * L<sub>c</sub> * t * F<sub>u</sub> = ${details.int.Rn_tearout.toFixed(2)} kips</li>`,
                `<li class="pl-4">Bearing R<sub>n</sub> = 3.0 * d<sub>b</sub> * t * F<sub>u</sub> = ${details.int.Rn_bearing.toFixed(2)} kips</li>`,
                `<li class="pl-4">R<sub>n,int</sub> = min(Tearout, Bearing) = ${details.int.Rn.toFixed(2)} kips</li>`,
                `<strong>Total Nominal Strength:</strong>`,
                `<li class="pl-4">R<sub>n</sub> = n<sub>edge</sub> * R<sub>n,edge</sub> + n<sub>int</sub> * R<sub>n,int</sub></li>`, 
                `<li class="pl-4">R<sub>n</sub> = ${details.num_edge} * ${details.edge.Rn.toFixed(2)} + ${details.num_int} * ${details.int.Rn.toFixed(2)} = ${check.Rn.toFixed(2)} kips</li>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;
        
        case 'Web Bolt Shear (Eccentricity)':
            content = format_list([
                `Bolt force from Direct Shear and Eccentric Moment (Elastic Method) per AISC Manual Part 7.`,
                `Direct Shear (V) = ${details.V_load.toFixed(2)} kips`,
                `Eccentricity (e) = ${details.eccentricity.toFixed(3)} in`,
                `Eccentric Moment (M<sub>ecc</sub>) = V * e = ${details.M_ecc.toFixed(2)} kip-in`,
                `Bolt Group Polar Moment of Inertia (I<sub>p</sub>) = &Sigma;(x² + y²) = ${details.Ip.toFixed(2)} in²`,
                `<strong>Force on Critical Bolt (Demand):</strong>`,
                `<li class="pl-4">Direct Shear (f<sub>vy</sub>) = V / n<sub>bolts</sub> = ${details.f_vy_direct.toFixed(2)} kips</li>`,
                `<li class="pl-4">Moment Shear (f<sub>vx</sub>) = M<sub>ecc</sub> * y<sub>max</sub> / I<sub>p</sub> = ${details.f_vx_moment.toFixed(2)} kips</li>`,
                `<li class="pl-4">Moment Shear (f<sub>vy</sub>) = M<sub>ecc</sub> * x<sub>max</sub> / I<sub>p</sub> = ${details.f_vy_moment.toFixed(2)} kips</li>`,
                `<li class="pl-4">Resultant Force (R<sub>u</sub>) = &radic;(f<sub>vx</sub>² + (f<sub>vy,direct</sub> + f<sub>vy,moment</sub>)²) = ${data.demand.toFixed(2)} kips</li>`,
                `<strong>Capacity of Single Bolt:</strong>`,
                `<li class="pl-4">R<sub>n</sub> = F<sub>nv</sub> * A<sub>b</sub> * n<sub>planes</sub> = ${check.Fnv.toFixed(1)} * ${check.Ab.toFixed(3)} * ${check.num_planes} = ${check.Rn.toFixed(2)} kips</li>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Web Bolt Shear/Tension Interaction':
            content = format_list([
                `Bolt Shear/Tension Interaction per AISC J3.9`,
                `Required Shear Stress (f<sub>v</sub>) = V<sub>u</sub> / A<sub>b</sub> = ${check.Vu.toFixed(2)} / ${check.Ab.toFixed(3)} = ${check.fv.toFixed(2)} ksi`, 
                `Adjusted Tensile Strength (F'<sub>nt</sub>) = 1.3 * F<sub>nt</sub> - (${design_method === 'LRFD' ? 'F_nt / (phi_v * F_nv)' : 'Omega_v * F_nt / F_nv'}) * f<sub>v</sub> &le; F<sub>nt</sub>`,
                `F'<sub>nt</sub> = 1.3 * ${check.Fnt} - (${design_method === 'LRFD' ? `${check.Fnt} / (0.75 * ${check.Fnv})` : `2.00 * ${check.Fnt} / ${check.Fnv}`}) * ${check.fv.toFixed(2)} = ${check.F_nt_prime.toFixed(2)} ksi`,
                `Nominal Tensile Capacity (R<sub>n</sub>) = F'<sub>nt</sub> * A<sub>b</sub> = ${check.F_nt_prime.toFixed(2)} * ${check.Ab.toFixed(3)} = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`,
                `Demand = Tension on critical bolt (T<sub>u</sub>) = ${check.Tu.toFixed(2)} kips`
            ]);
            break;
        
        case 'Web Plate Gross Shear Yield':
            content = format_list([
                `Shear Yielding of Web Plate per AISC J4.2(a)`,
                `Gross Shear Area (A<sub>gv</sub>) = ${check.Agv.toFixed(3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 * F<sub>y</sub> * A<sub>gv</sub>`,
                `R<sub>n</sub> = 0.6 * ${check.Fy.toFixed(1)} ksi * ${check.Agv.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Beam Web Shear Yielding':
            content = format_list([
                `Shear Yielding of Beam Web per AISC J4.2(a)`,
                `Gross Shear Area (A<sub>gv</sub>) = ${check.Agv.toFixed(3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 * F<sub>y</sub> * A<sub>gv</sub>`,
                `R<sub>n</sub> = 0.6 * ${check.Fy.toFixed(1)} ksi * ${check.Agv.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Web Plate Net Shear Rupture':
            content = format_list([
                `Shear Rupture of Web Plate per AISC J4.2(b)`,
                `Net Shear Area (A<sub>nv</sub>) = ${check.Anv.toFixed(3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 * F<sub>u</sub> * A<sub>nv</sub>`,
                `R<sub>n</sub> = 0.6 * ${check.Fu.toFixed(1)} ksi * ${check.Anv.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Beam Web Shear Rupture':
            content = format_list([
                `Shear Rupture of Beam Web per AISC J4.2(b)`,
                `Net Shear Area (A<sub>nv</sub>) = ${check.Anv.toFixed(3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = 0.6 * F<sub>u</sub> * A<sub>nv</sub>`,
                `R<sub>n</sub> = 0.6 * ${check.Fu.toFixed(1)} ksi * ${check.Anv.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Beam Section Tensile Rupture':
            content = format_list([
                `Tensile Rupture of Beam Section per AISC D2`,
                `Net Area (A<sub>n</sub>) = ${check.An.toFixed(3)} in²`,
                `Shear Lag Factor (U) = ${check.U.toFixed(3)} (per AISC Table D3.1, Case 7)`,
                `Effective Net Area (A<sub>e</sub>) = U * A<sub>n</sub> = ${check.Ae.toFixed(3)} in²`,
                `Nominal Strength (R<sub>n</sub>) = F<sub>u</sub> * A<sub>e</sub>`,
                `R<sub>n</sub> = ${check.Fu.toFixed(1)} ksi * ${check.Ae.toFixed(3)} in² = <b>${check.Rn.toFixed(2)} kips</b>`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        case 'Flange Bolt Prying & Tension':
            const outer_pry = details.outer ? `Outer Plate Q = ${details.outer.Q.toFixed(2)} kips (t<sub>c</sub>=${details.outer.tc.toFixed(3)} in)` : '';
            const inner_pry = details.inner ? `Inner Plate Q = ${details.inner.Q.toFixed(2)} kips (t<sub>c</sub>=${details.inner.tc.toFixed(3)} in)` : '';
            content = format_list([
                `Prying action per AISC Manual Part 9.`,
                `Applied Tension per Bolt (B) = ${details.B_per_bolt.toFixed(2)} kips`,
                `Prying Force (Q) = ${outer_pry} ${inner_pry ? `+ ${inner_pry}` : ''} = ${details.Q_total.toFixed(2)} kips`,
                `Total Bolt Tension Demand = B + Q = ${data.demand.toFixed(2)} kips`,
                `Bolt Tensile Capacity (R<sub>n</sub>) = F<sub>nt</sub> * A<sub>b</sub> = ${check.Fnt.toFixed(1)} * ${check.Ab.toFixed(3)} = ${check.Rn.toFixed(2)} kips`,
                `Design Capacity = ${capacity_eq} = ${check.Rn.toFixed(2)} / ${factor_val} = <b>${final_capacity.toFixed(2)} kips</b>`
            ]);
            break;

        default: 
            content = 'Breakdown not available for this check.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

function renderResults(results) {
    const { checks, geomChecks, inputs, final_loads } = results;
    let html = `<div class="results-section">
                <div class="flex justify-end gap-2 -mt-2 -mr-2 print-hidden">
                    <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm print-hidden">Download PDF</button>
                    <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm print-hidden">Copy Report</button>
                </div>
                <h2 class="report-header !mt-0">Geometry & Spacing Checks</h2>
                <table><thead><tr><th>Item</th><th>Actual (in)</th><th>Limit (in)</th><th>Status</th></tr></thead><tbody>`;
    const addGeomRow = (name, data, isMaxCheck = false) => {
        const status = data.pass ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const limit_val = isMaxCheck ? data.max : data.min;
        const limit_label = isMaxCheck ? 'Maximum' : 'Minimum';
        html += `<tr><td>${name} (${limit_label})</td><td>${data.actual.toFixed(3)}</td><td>${limit_val.toFixed(3)}</td><td>${status}</td></tr>`;
    };

    html += `<table><caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">Geometry & Spacing Checks (AISC J3)</caption>
             <thead><tr><th>Item</th><th>Actual (in)</th><th>Limit (in)</th><th>Status</th></tr></thead><tbody>`;

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
    html += `</tbody></table>`;

    html += `<table class="mt-6"><caption class="font-bold text-center bg-gray-200 dark:bg-gray-700 p-2">Strength Checks (${inputs.design_method})</caption>
             <thead class="text-sm"><tr><th class="w-2/5">Limit State</th><th>Demand</th><th>Capacity</th><th>Ratio</th><th>Status</th></tr></thead><tbody>`;
    let checkCounter = 0;
    const addRow = (name, data) => { 
        if (!data || !data.check) return;
        checkCounter++; 
        const detailId = `details-${checkCounter}`;
        let { demand, check } = data;
        const { Rn, phi, omega } = check;
        
        const capacity = Rn || 0;
        const design_capacity = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);
        const ratio = design_capacity > 0 ? Math.abs(demand) / design_capacity : Infinity;

        const status = ratio <= 1.0 ? '<span class="text-green-600 font-semibold">Pass</span>' : '<span class="text-red-600 font-semibold">Fail</span>';
        const breakdownHtml = generateBreakdownHtml(name, data, inputs.design_method);
        html += `<tr class="border-t dark:border-gray-700">
                    <td>${name} <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                    <td>${demand.toFixed(2)}</td><td>${design_capacity.toFixed(2)}</td><td>${ratio.toFixed(3)}</td><td>${status}</td>
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

    html += `</tbody></table></div>`; // End of results-section div
    document.getElementById('results-container').innerHTML = html;
}

// --- Input Gathering and Orchestration ---
const inputIds = [
    'design_method', 'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Fy', 'member_Fu',
    'member_Zx', 'member_Sx', 'M_load', 'V_load', 'Axial_load', 'develop_capacity_check', 'deformation_is_consideration', 'g_gage_fp',
    'num_flange_plates', 'flange_plate_Fy', 'flange_plate_Fu', 'H_fp', 't_fp', 'L_fp',
    'flange_plate_Fy_inner', 'flange_plate_Fu_inner', 'H_fp_inner', 't_fp_inner', 'L_fp_inner',
    'Nc_fp', 'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp',
    'num_web_plates', 'web_plate_Fy', 'web_plate_Fu', 'H_wp', 't_wp', 'L_wp',
    'Nc_wp', 'Nr_wp', 'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp',
    'D_fp', 'bolt_grade_fp', 'threads_included_fp', 'D_wp', 'bolt_grade_wp', 'threads_included_wp',
];

const handleRunCheck = createCalculationHandler({
    inputIds: inputIds, // Pass the array to the handler
    storageKey: 'splice-inputs',
    validationRuleKey: 'splice',
    calculatorFunction: (rawInputs) => {
        drawFlangeDiagram();
        drawWebDiagram();
        const results = spliceCalculator.run(rawInputs);
        if (results.inputs.develop_capacity_check) {
            document.getElementById('M_load').value = (results.final_loads.M_load / 12).toFixed(2);
            document.getElementById('V_load').value = results.final_loads.V_load.toFixed(2);
        }
        return results;
    },
    renderFunction: renderResults,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn'
});

document.addEventListener('DOMContentLoaded', () => {
    // --- Attach Event Listeners ---
    loadInputsFromLocalStorage('splice-inputs', inputIds, handleRunCheck);

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