"""
Comprehensive geometry and meshing engine for arbitrary concrete cross-sections.
Implements:
1. Exact Green's theorem / Shoelace integration for section properties (Ac, xm, ym, Ix, Iy, Ixy, I1, I2, theta_p, i_min).
2. Boundary-conforming Delaunay meshing with hole filtering and adaptive interior points.
3. Parametric constructors for standard shapes (Rectangular, Circular, L, T, I, Hollow Box, Arbitrary).
"""

import math
import numpy as np
from scipy.spatial import Delaunay


def ring_area(pts):
    """Calculates signed area of a 2D ring. Positive = CCW, Negative = CW."""
    n = len(pts)
    if n < 3:
        return 0.0
    a = 0.0
    for i in range(n):
        j = (i + 1) % n
        a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1]
    return a * 0.5


def point_in_poly(x, y, ring):
    """Ray casting algorithm for point-in-polygon containment."""
    n = len(ring)
    inside = False
    p1x, p1y = ring[0]
    for i in range(n + 1):
        p2x, p2y = ring[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def is_point_in_section(x, y, exterior, holes=None):
    """Checks if point (x, y) is inside the section (inside exterior and outside all holes)."""
    if not point_in_poly(x, y, exterior):
        return False
    if holes:
        for h in holes:
            if point_in_poly(x, y, h):
                return False
    return True


def compute_ring_properties(pts):
    """
    Computes exact Green's Theorem geometric properties for a single ring:
    Area, Qx (integral y dA), Qy (integral x dA), Ixx0, Iyy0, Ixy0 about origin.
    """
    n = len(pts)
    A = 0.0
    Qx = 0.0
    Qy = 0.0
    Ixx0 = 0.0
    Iyy0 = 0.0
    Ixy0 = 0.0

    for i in range(n):
        j = (i + 1) % n
        xi, yi = pts[i][0], pts[i][1]
        xj, yj = pts[j][0], pts[j][1]

        cross = xi * yj - xj * yi
        A += cross
        Qx += (yi + yj) * cross
        Qy += (xi + xj) * cross
        Ixx0 += (yi * yi + yi * yj + yj * yj) * cross
        Iyy0 += (xi * xi + xi * xj + xj * xj) * cross
        Ixy0 += (2.0 * xi * yi + xi * yj + xj * yi + 2.0 * xj * yj) * cross

    A = A * 0.5
    Qx = Qx / 6.0
    Qy = Qy / 6.0
    Ixx0 = Ixx0 / 12.0
    Iyy0 = Iyy0 / 12.0
    Ixy0 = Ixy0 / 24.0

    return {
        'A': A, 'Qx': Qx, 'Qy': Qy,
        'Ixx0': Ixx0, 'Iyy0': Iyy0, 'Ixy0': Ixy0
    }


def compute_polygon_properties(exterior, holes=None):
    """
    Computes exact analytical section properties for a polygon with holes:
    Ac, xm, ym, Ix, Iy, Ixy (about centroid), I1, I2, theta_p, ix, iy, i_min.
    """
    ext_props = compute_ring_properties(exterior)
    sign = 1.0 if ext_props['A'] >= 0 else -1.0
    A_net = ext_props['A'] * sign
    Qx_net = ext_props['Qx'] * sign
    Qy_net = ext_props['Qy'] * sign
    Ixx0_net = ext_props['Ixx0'] * sign
    Iyy0_net = ext_props['Iyy0'] * sign
    Ixy0_net = ext_props['Ixy0'] * sign

    if holes:
        for h in holes:
            h_props = compute_ring_properties(h)
            h_sign = 1.0 if h_props['A'] >= 0 else -1.0
            h_area = h_props['A'] * h_sign
            A_net -= h_area
            Qx_net -= h_props['Qx'] * h_sign
            Qy_net -= h_props['Qy'] * h_sign
            Ixx0_net -= h_props['Ixx0'] * h_sign
            Iyy0_net -= h_props['Iyy0'] * h_sign
            Ixy0_net -= h_props['Ixy0'] * h_sign

    xm = Qy_net / A_net if A_net > 0 else 0.0
    ym = Qx_net / A_net if A_net > 0 else 0.0

    # Parallel Axis Theorem: moments about centroid
    Ix = Ixx0_net - A_net * ym * ym
    Iy = Iyy0_net - A_net * xm * xm
    Ixy = Ixy0_net - A_net * xm * ym

    # Principal moments of inertia
    I_avg = (Ix + Iy) * 0.5
    R = math.sqrt(((Ix - Iy) * 0.5)**2 + Ixy**2)
    I1 = I_avg + R
    I2 = I_avg - R
    theta_p = 0.5 * math.atan2(-2.0 * Ixy, Ix - Iy)  # radians

    # Radii of gyration
    ix = math.sqrt(max(0.0, Ix / A_net)) if A_net > 0 else 0.0
    iy = math.sqrt(max(0.0, Iy / A_net)) if A_net > 0 else 0.0
    i_min = math.sqrt(max(0.0, I2 / A_net)) if A_net > 0 else 0.0

    # Bounding box dimensions
    min_x = min(p[0] for p in exterior)
    max_x = max(p[0] for p in exterior)
    min_y = min(p[1] for p in exterior)
    max_y = max(p[1] for p in exterior)
    hx = max_x - min_x
    hy = max_y - min_y

    return {
        'Ac': A_net,
        'xm': xm,
        'ym': ym,
        'Ix': Ix,
        'Iy': Iy,
        'Ixy': Ixy,
        'I1': I1,
        'I2': I2,
        'theta_p': theta_p,
        'ix': ix,
        'iy': iy,
        'i_min': i_min,
        'hx': hx,
        'hy': hy
    }


def mesh_arbitrary_section(exterior, holes=None, target_fibers=300):
    """
    Meshes any arbitrary cross section with holes into conforming triangular fibers.
    Returns:
    - fibers: list of {'x': xc, 'y': yc, 'dA': dA} relative to section centroid (0, 0)
    - props: dict of exact analytical section properties
    """
    props = compute_polygon_properties(exterior, holes)
    Ac = props['Ac']
    if Ac <= 0:
        return [], props

    xs = [p[0] for p in exterior]
    ys = [p[1] for p in exterior]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    W = max_x - min_x
    H = max_y - min_y

    # Calculate optimal step size based on target fibers
    target_n = max(50, target_fibers)
    dA_target = Ac / target_n
    h_step = math.sqrt(dA_target * 2.0)

    nx = max(4, int(math.ceil(W / h_step)))
    ny = max(4, int(math.ceil(H / h_step)))

    dx = W / nx
    dy = H / ny
    diag = math.sqrt(dx * dx + dy * dy)

    points = []

    def add_ring_points(ring):
        n_r = len(ring)
        for i in range(n_r):
            p1 = ring[i]
            p2 = ring[(i + 1) % n_r]
            dist = math.hypot(p2[0] - p1[0], p2[1] - p1[1])
            n_sub = max(1, int(round(dist / diag)))
            for s in range(n_sub):
                t = s / n_sub
                px = p1[0] + t * (p2[0] - p1[0])
                py = p1[1] + t * (p2[1] - p1[1])
                points.append([px, py])

    add_ring_points(exterior)
    if holes:
        for h in holes:
            add_ring_points(h)

    # Interior grid points (only those inside the solid section)
    for i in range(1, nx):
        for j in range(1, ny):
            x = min_x + i * dx
            y = min_y + j * dy
            if is_point_in_section(x, y, exterior, holes):
                # Avoid inserting points too close to boundary points
                too_close = False
                for bp in points:
                    if (bp[0] - x)**2 + (bp[1] - y)**2 < (0.25 * diag)**2:
                        too_close = True
                        break
                if not too_close:
                    points.append([x, y])

    pts_arr = np.array(points, dtype=float)
    if len(pts_arr) < 3:
        return [], props

    try:
        tri = Delaunay(pts_arr)
    except Exception:
        return [], props

    valid_fibers = []
    xm = props['xm']
    ym = props['ym']

    for simplex in tri.simplices:
        p1, p2, p3 = pts_arr[simplex[0]], pts_arr[simplex[1]], pts_arr[simplex[2]]
        cx = (p1[0] + p2[0] + p3[0]) / 3.0
        cy = (p1[1] + p2[1] + p3[1]) / 3.0
        if is_point_in_section(cx, cy, exterior, holes):
            dA = 0.5 * abs((p2[0] - p1[0]) * (p3[1] - p1[1]) - (p3[0] - p1[0]) * (p2[1] - p1[1]))
            if dA > 1e-6:
                valid_fibers.append({
                    'x': cx - xm,
                    'y': cy - ym,
                    'dA': dA
                })

    # Rescale fibers dA slightly if necessary to guarantee exact sum(dA) == Ac
    sum_dA = sum(f['dA'] for f in valid_fibers)
    if sum_dA > 0 and abs(sum_dA - Ac) / Ac < 0.1:
        corr = Ac / sum_dA
        for f in valid_fibers:
            f['dA'] *= corr

    return valid_fibers, props


# =========================================================================
# PARAMETRIC SHAPE GENERATORS
# =========================================================================

def make_rectangular_polygon(b, h):
    return [[0.0, 0.0], [b, 0.0], [b, h], [0.0, h]], []

def make_circular_polygon(D, n=36):
    R = D / 2.0
    pts = []
    for i in range(n):
        ang = (2.0 * math.pi * i) / n
        pts.append([R + R * math.cos(ang), R + R * math.sin(ang)])
    return pts, []

def make_L_polygon(bf, h, tf, tw):
    """
    L-section:
    bf: flange width (X)
    h: total height (Y)
    tf: flange thickness (Y)
    tw: web thickness (X)
    """
    return [
        [0.0, 0.0],
        [bf, 0.0],
        [bf, tf],
        [tw, tf],
        [tw, h],
        [0.0, h]
    ], []

def make_T_polygon(bf, h, tf, bw):
    """
    T-section (web centered under flange):
    bf: flange width (top)
    h: total height
    tf: flange thickness
    bw: web width
    """
    x1 = (bf - bw) * 0.5
    x2 = (bf + bw) * 0.5
    hw = h - tf
    return [
        [x1, 0.0],
        [x2, 0.0],
        [x2, hw],
        [bf, hw],
        [bf, h],
        [0.0, h],
        [0.0, hw],
        [x1, hw]
    ], []

def make_I_polygon(bf_top, tf_top, h, tw, bf_bot=None, tf_bot=None):
    """
    I-section (Double T):
    Can be symmetric or asymmetric.
    """
    if bf_bot is None:
        bf_bot = bf_top
    if tf_bot is None:
        tf_bot = tf_top

    max_b = max(bf_top, bf_bot)
    x_bot1 = (max_b - bf_bot) * 0.5
    x_bot2 = (max_b + bf_bot) * 0.5

    x_web1 = (max_b - tw) * 0.5
    x_web2 = (max_b + tw) * 0.5

    x_top1 = (max_b - bf_top) * 0.5
    x_top2 = (max_b + bf_top) * 0.5

    y_bot = tf_bot
    y_top = h - tf_top

    return [
        [x_bot1, 0.0],
        [x_bot2, 0.0],
        [x_bot2, y_bot],
        [x_web2, y_bot],
        [x_web2, y_top],
        [x_top2, y_top],
        [x_top2, h],
        [x_top1, h],
        [x_top1, y_top],
        [x_web1, y_top],
        [x_web1, y_bot],
        [x_bot1, y_bot]
    ], []

def make_hollow_box_polygon(b, h, tw_x, tw_y=None):
    """
    Hollow Box (Seção Caixão):
    Exterior b x h, wall thickness tw_x (horizontal) and tw_y (vertical).
    """
    if tw_y is None:
        tw_y = tw_x
    ext = [[0.0, 0.0], [b, 0.0], [b, h], [0.0, h]]
    hole = [
        [tw_x, tw_y],
        [b - tw_x, tw_y],
        [b - tw_x, h - tw_y],
        [tw_x, h - tw_y]
    ]
    return ext, [hole]


def build_polygon_from_spec(spec):
    """
    Constructs exterior and holes from a specification dictionary.
    Supports:
    - type: 'Retangular', 'Circular', 'L', 'T', 'I', 'Vazada'/'Caixao', 'Poligono'/'Arbitrary'
    """
    stype = spec.get('section_type') or spec.get('type') or 'Retangular'
    stype_lower = stype.lower()

    if 'circ' in stype_lower:
        D = float(spec.get('D') or spec.get('hx') or 30.0)
        return make_circular_polygon(D)

    elif stype_lower in ('l', 'cantoneira'):
        bf = float(spec.get('bf') or spec.get('hx') or 30.0)
        h = float(spec.get('h') or spec.get('hy') or 50.0)
        tf = float(spec.get('tf') or 10.0)
        tw = float(spec.get('tw') or 10.0)
        return make_L_polygon(bf, h, tf, tw)

    elif stype_lower == 't':
        bf = float(spec.get('bf') or spec.get('hx') or 40.0)
        h = float(spec.get('h') or spec.get('hy') or 60.0)
        tf = float(spec.get('tf') or 12.0)
        bw = float(spec.get('bw') or spec.get('tw') or 15.0)
        return make_T_polygon(bf, h, tf, bw)

    elif stype_lower in ('i', 'duplo_t', 'h'):
        bf_top = float(spec.get('bf_top') or spec.get('bf') or spec.get('hx') or 40.0)
        tf_top = float(spec.get('tf_top') or spec.get('tf') or 12.0)
        h = float(spec.get('h') or spec.get('hy') or 60.0)
        tw = float(spec.get('tw') or spec.get('bw') or 15.0)
        bf_bot = float(spec.get('bf_bot') or bf_top)
        tf_bot = float(spec.get('tf_bot') or tf_top)
        return make_I_polygon(bf_top, tf_top, h, tw, bf_bot, tf_bot)

    elif stype_lower in ('vazada', 'caixao', 'box'):
        b = float(spec.get('b') or spec.get('hx') or 40.0)
        h = float(spec.get('h') or spec.get('hy') or 60.0)
        tw_x = float(spec.get('tw_x') or spec.get('tw') or 10.0)
        tw_y = float(spec.get('tw_y') or spec.get('tw') or tw_x)
        return make_hollow_box_polygon(b, h, tw_x, tw_y)

    elif stype_lower in ('poligono', 'arbitrary', 'custom'):
        ext = spec.get('exterior') or spec.get('vertices') or []
        holes = spec.get('holes') or []
        return ext, holes

    else: # Default Retangular
        b = float(spec.get('b') or spec.get('hx') or 30.0)
        h = float(spec.get('h') or spec.get('hy') or 50.0)
        return make_rectangular_polygon(b, h)
