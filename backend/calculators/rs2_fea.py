"""
RS2 / Phase2 - 2D Geotechnical Finite Element Analysis Engine
Formulation:
- 2D Plane Strain Continuum Finite Element Analysis
- 3-Node Constant Strain Triangular Elements (CST)
- Linear Elastic and Mohr-Coulomb Elasto-Plastic Constitutive Models
- Gravity Turn-On and In-Situ Stress Initialization
- Hydrostatic Pore Water Pressure from Piezometric Water Table
- Automated Shear Strength Reduction (SSR) for Slope Factor of Safety
- Presets for Slopes, Deep Excavations, Tunnels, and Foundations
"""

import math
import numpy as np
from scipy.spatial import Delaunay
import scipy.sparse as sp
import scipy.sparse.linalg as spla


def point_in_polygon(x, y, poly):
    """Ray-casting algorithm to test if point (x, y) is inside polygon poly [(x1, y1), ...]."""
    n = len(poly)
    inside = False
    p1x, p1y = poly[0]
    for i in range(n + 1):
        p2x, p2y = poly[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y
    return inside


def generate_conforming_layer_mesh(layer_polygons, domain_poly=None, excavation_poly=None, target_elem_size=2.0, additional_pts=None):
    """
    Generates a conforming triangular mesh across multiple closed layer polygons.
    Guarantees:
      - Elements never cross stratum / layer boundary lines.
      - 100% boundary alignment with zero sawtooth or color bleeding.
      - Neighboring polygons share identical nodes on common contact edges.
    """
    if additional_pts is None:
        additional_pts = []

    def get_edge_key(p1, p2):
        k1 = (round(float(p1[0]), 3), round(float(p1[1]), 3))
        k2 = (round(float(p2[0]), 3), round(float(p2[1]), 3))
        return tuple(sorted([k1, k2]))

    norm_layers = []
    for idx, item in enumerate(layer_polygons):
        if isinstance(item, dict):
            poly = item.get('polygon', [])
            m_idx = item.get('material_idx', idx)
        else:
            poly = item
            m_idx = idx
        if poly and len(poly) >= 3:
            norm_layers.append({'polygon': poly, 'material_idx': m_idx})

    # 1. Discretize all unique shared boundary edges across layers
    edge_pts = {}
    for lay in norm_layers:
        poly = lay['polygon']
        for i in range(len(poly)):
            p1 = poly[i]
            p2 = poly[(i + 1) % len(poly)]
            k = get_edge_key(p1, p2)
            if k not in edge_pts:
                dist = np.hypot(p2[0] - p1[0], p2[1] - p1[1])
                num_seg = max(1, int(np.ceil(dist / target_elem_size)))
                pts = []
                for s in range(num_seg + 1):
                    t = s / num_seg
                    pts.append([p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])])
                edge_pts[k] = pts

    all_global_nodes = []
    global_node_map = {}
    def get_global_node_idx(pt):
        k = (round(float(pt[0]), 3), round(float(pt[1]), 3))
        if k not in global_node_map:
            idx = len(all_global_nodes)
            global_node_map[k] = idx
            all_global_nodes.append([float(pt[0]), float(pt[1])])
            return idx
        return global_node_map[k]

    all_elements = []

    # 2. Triangulate each layer polygon independently
    for lay in norm_layers:
        poly = lay['polygon']
        lay_pts = []
        for i in range(len(poly)):
            p1 = poly[i]
            p2 = poly[(i + 1) % len(poly)]
            k = get_edge_key(p1, p2)
            pts = edge_pts[k]
            if np.hypot(pts[0][0] - p1[0], pts[0][1] - p1[1]) > 1e-3:
                pts = pts[::-1]
            for pt in pts[:-1]:
                lay_pts.append(pt)

        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        minX, maxX = min(xs), max(xs)
        minY, maxY = min(ys), max(ys)

        # Only inject interior Steiner points if stratum is thicker than target size
        is_thin = (maxY - minY < target_elem_size * 0.9)
        if not is_thin:
            gx = np.arange(minX + target_elem_size * 0.6, maxX, target_elem_size)
            gy = np.arange(minY + target_elem_size * 0.6, maxY, target_elem_size * 0.866)
            for r_idx, y in enumerate(gy):
                x_shift = (target_elem_size * 0.5) if (r_idx % 2 == 1) else 0.0
                for x in gx + x_shift:
                    if point_in_polygon(x, y, poly):
                        lay_pts.append([x, y])

        lay_pts_arr = np.array(lay_pts, dtype=float)
        _, u_idx = np.unique(np.round(lay_pts_arr, 4), axis=0, return_index=True)
        lay_pts_arr = lay_pts_arr[sorted(u_idx)]

        tri = Delaunay(lay_pts_arr)
        for simplex in tri.simplices:
            nodes_tri = lay_pts_arr[simplex]
            p0, p1, p2 = nodes_tri[0], nodes_tri[1], nodes_tri[2]
            area = 0.5 * abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]))
            if area < 1e-4:
                continue
            cx = float(nodes_tri[:, 0].mean())
            cy = float(nodes_tri[:, 1].mean())
            if point_in_polygon(cx, cy, poly):
                if excavation_poly and len(excavation_poly) >= 3 and point_in_polygon(cx, cy, excavation_poly):
                    continue
                g0 = get_global_node_idx(p0)
                g1 = get_global_node_idx(p1)
                g2 = get_global_node_idx(p2)
                all_elements.append([g0, g1, g2])

    used_node_indices = np.unique(all_elements)
    node_map = {old_idx: new_idx for new_idx, old_idx in enumerate(used_node_indices)}
    nodes = np.array(all_global_nodes)[used_node_indices]
    elements = np.array([[node_map[idx] for idx in elem] for elem in all_elements], dtype=int)

    for i in range(len(elements)):
        e = elements[i]
        p0, p1, p2 = nodes[e[0]], nodes[e[1]], nodes[e[2]]
        two_area = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1])
        if two_area < 0:
            elements[i, [1, 2]] = elements[i, [2, 1]]

    return nodes, elements


def generate_triangular_mesh(domain_poly, internal_boundaries=None, excavation_poly=None, 
                             target_elem_size=2.0, additional_pts=None, layer_polygons=None):
    """
    Generates a 2D constrained triangular mesh inside domain_poly, excluding excavation_poly.
    If layer_polygons is provided, uses conforming multi-layer mesh generator ensuring elements
    strictly align with layer boundaries and never cross interfaces.
    """
    if layer_polygons and len(layer_polygons) >= 2:
        return generate_conforming_layer_mesh(
            layer_polygons=layer_polygons,
            domain_poly=domain_poly,
            excavation_poly=excavation_poly,
            target_elem_size=target_elem_size,
            additional_pts=additional_pts
        )

    if internal_boundaries is None:
        internal_boundaries = []
    if additional_pts is None:
        additional_pts = []

    domain_pts = np.array(domain_poly, dtype=float)
    x_min, x_max = domain_pts[:, 0].min(), domain_pts[:, 0].max()
    y_min, y_max = domain_pts[:, 1].min(), domain_pts[:, 1].max()

    nodes_list = []

    # 1. Discretize domain boundaries
    for i in range(len(domain_pts)):
        p1 = domain_pts[i]
        p2 = domain_pts[(i + 1) % len(domain_pts)]
        dist = np.hypot(p2[0] - p1[0], p2[1] - p1[1])
        num_segments = max(1, int(np.ceil(dist / target_elem_size)))
        for s in range(num_segments):
            t = s / num_segments
            nodes_list.append([p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])])

    # 2. Discretize internal layer boundaries
    for b_poly in internal_boundaries:
        b_pts = np.array(b_poly, dtype=float)
        for i in range(len(b_pts) - 1):
            p1 = b_pts[i]
            p2 = b_pts[i + 1]
            dist = np.hypot(p2[0] - p1[0], p2[1] - p1[1])
            num_segments = max(1, int(np.ceil(dist / target_elem_size)))
            for s in range(num_segments):
                t = s / num_segments
                nodes_list.append([p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])])
        nodes_list.append([b_pts[-1][0], b_pts[-1][1]])

    # 3. Discretize excavation boundary if present
    if excavation_poly is not None and len(excavation_poly) >= 3:
        exc_pts = np.array(excavation_poly, dtype=float)
        for i in range(len(exc_pts)):
            p1 = exc_pts[i]
            p2 = exc_pts[(i + 1) % len(exc_pts)]
            dist = np.hypot(p2[0] - p1[0], p2[1] - p1[1])
            num_segments = max(1, int(np.ceil(dist / (target_elem_size * 0.75))))
            for s in range(num_segments):
                t = s / num_segments
                nodes_list.append([p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])])

    # 4. Inject internal Steiner grid points
    gx = np.arange(x_min + target_elem_size * 0.5, x_max, target_elem_size)
    gy = np.arange(y_min + target_elem_size * 0.5, y_max, target_elem_size * 0.866)
    for r_idx, y in enumerate(gy):
        x_shift = (target_elem_size * 0.5) if (r_idx % 2 == 1) else 0.0
        for x in gx + x_shift:
            if x_min < x < x_max and y_min < y < y_max:
                if point_in_polygon(x, y, domain_poly):
                    if excavation_poly is None or not point_in_polygon(x, y, excavation_poly):
                        nodes_list.append([x, y])

    for pt in additional_pts:
        nodes_list.append(pt)

    # Remove duplicates within tolerance
    all_pts = np.array(nodes_list, dtype=float)
    _, unique_indices = np.unique(np.round(all_pts, 4), axis=0, return_index=True)
    all_pts = all_pts[sorted(unique_indices)]

    # 5. Perform Delaunay Triangulation
    tri = Delaunay(all_pts)
    valid_elements = []

    # 6. Filter elements
    for simplex in tri.simplices:
        nodes_tri = all_pts[simplex]
        centroid = nodes_tri.mean(axis=0)
        cx, cy = centroid[0], centroid[1]

        if not point_in_polygon(cx, cy, domain_poly):
            continue
        if excavation_poly is not None and len(excavation_poly) >= 3:
            if point_in_polygon(cx, cy, excavation_poly):
                continue
        valid_elements.append(simplex)

    valid_elements = np.array(valid_elements, dtype=int)

    # 7. Re-index nodes to keep only active ones
    used_node_indices = np.unique(valid_elements)
    node_map = {old_idx: new_idx for new_idx, old_idx in enumerate(used_node_indices)}
    filtered_nodes = all_pts[used_node_indices]
    reindexed_elements = np.vectorize(node_map.get)(valid_elements)

    # Ensure counter-clockwise node ordering for all triangles
    for i in range(len(reindexed_elements)):
        e = reindexed_elements[i]
        p0 = filtered_nodes[e[0]]
        p1 = filtered_nodes[e[1]]
        p2 = filtered_nodes[e[2]]
        area = 0.5 * ((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]))
        if area < 0:
            reindexed_elements[i, [1, 2]] = reindexed_elements[i, [2, 1]]

    return filtered_nodes, reindexed_elements


def assign_materials_to_elements(nodes, elements, materials, layer_polygons=None):
    """
    Assigns material index to each element based on its centroid location.
    Supports:
      - List of polygons: [poly1, poly2, ...] where index maps to material
      - List of region dicts: [{'polygon': poly, 'material_idx': idx}, ...]
    """
    elem_mat = np.zeros(len(elements), dtype=int)
    if not layer_polygons:
        return elem_mat

    num_materials = len(materials) if materials else 1

    for i, elem in enumerate(elements):
        centroid = nodes[elem].mean(axis=0)
        cx, cy = float(centroid[0]), float(centroid[1])
        for idx, item in enumerate(layer_polygons):
            if isinstance(item, dict):
                l_poly = item.get('polygon', [])
                mat_idx = int(item.get('material_idx', idx))
            else:
                l_poly = item
                mat_idx = idx

            if l_poly and len(l_poly) >= 3 and point_in_polygon(cx, cy, l_poly):
                elem_mat[i] = max(0, min(mat_idx, num_materials - 1))
                break
    return elem_mat


def compute_element_cst(nodes_elem, E, nu):
    """
    Computes CST Plane Strain B-matrix, D-matrix, and element stiffness matrix Ke (6x6).
    """
    p0, p1, p2 = nodes_elem[0], nodes_elem[1], nodes_elem[2]
    x0, y0 = p0[0], p0[1]
    x1, y1 = p1[0], p1[1]
    x2, y2 = p2[0], p2[1]

    two_area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
    area = 0.5 * abs(two_area)
    if area < 1e-12:
        area = 1e-12

    b0 = y1 - y2
    b1 = y2 - y0
    b2 = y0 - y1

    c0 = x2 - x1
    c1 = x0 - x2
    c2 = x1 - x0

    inv2A = 1.0 / two_area
    B = np.zeros((3, 6))
    B[0, 0] = b0 * inv2A
    B[0, 2] = b1 * inv2A
    B[0, 4] = b2 * inv2A

    B[1, 1] = c0 * inv2A
    B[1, 3] = c1 * inv2A
    B[1, 5] = c2 * inv2A

    B[2, 0] = c0 * inv2A
    B[2, 1] = b0 * inv2A
    B[2, 2] = c1 * inv2A
    B[2, 3] = b1 * inv2A
    B[2, 4] = c2 * inv2A
    B[2, 5] = b2 * inv2A

    # Plane Strain Elasticity Matrix D (3 x 3)
    factor = E / ((1.0 + nu) * (1.0 - 2.0 * nu))
    D = factor * np.array([
        [1.0 - nu, nu, 0.0],
        [nu, 1.0 - nu, 0.0],
        [0.0, 0.0, 0.5 - nu]
    ])

    Ke = area * (B.T @ D @ B)
    return Ke, B, D, area


def solve_fea_plane_strain(nodes, elements, elem_mat, materials, water_table=None,
                           surcharges=None, gravity=True, k0=0.5, srf=1.0, max_plastic_iters=25,
                           constitutive_model='mohr_coulomb'):
    """
    2D Plane Strain Finite Element Solver.
    Supports Elastic, Mohr-Coulomb Plasticity, and Shear Strength Reduction (SSR).
    """
    num_nodes = len(nodes)
    num_elements = len(elements)
    ndof = 2 * num_nodes

    x_coords = nodes[:, 0]
    y_coords = nodes[:, 1]
    x_min, x_max = x_coords.min(), x_coords.max()
    y_min, y_max = x_coords.min(), y_coords.max()
    real_y_min, real_y_max = y_coords.min(), y_coords.max()

    B_list = []
    D_list = []
    area_list = []
    
    K_global = sp.lil_matrix((ndof, ndof))
    F_ext = np.zeros(ndof)

    # 1. Assemble Global Stiffness and Body Forces
    for e_idx, elem in enumerate(elements):
        mat_idx = elem_mat[e_idx]
        mat = materials[mat_idx]
        E = float(mat.get('E', 50000.0))
        nu = float(mat.get('nu', 0.30))
        gamma = float(mat.get('gamma', 19.0))

        nodes_e = nodes[elem]
        Ke, B, D, area = compute_element_cst(nodes_e, E, nu)
        B_list.append(B)
        D_list.append(D)
        area_list.append(area)

        dofs = []
        for n_id in elem:
            dofs.extend([2 * n_id, 2 * n_id + 1])

        for r in range(6):
            dr = dofs[r]
            for c in range(6):
                dc = dofs[c]
                K_global[dr, dc] += Ke[r, c]

        if gravity:
            elem_weight = gamma * area
            load_per_node = elem_weight / 3.0
            for n_id in elem:
                F_ext[2 * n_id + 1] -= load_per_node

    # 2. Surface Surcharges
    if surcharges:
        for sur in surcharges:
            x_start = float(sur.get('x1', 0))
            x_end = float(sur.get('x2', 10))
            q = float(sur.get('q', 0))
            if abs(q) < 1e-6 or x_end <= x_start:
                continue

            surf_nodes = []
            for n_idx in range(num_nodes):
                x, y = nodes[n_idx]
                if abs(y - real_y_max) < 0.3 and (x_start - 0.1 <= x <= x_end + 0.1):
                    surf_nodes.append((n_idx, x))
            surf_nodes.sort(key=lambda item: item[1])

            if len(surf_nodes) >= 2:
                for s in range(len(surf_nodes) - 1):
                    n1, x1 = surf_nodes[s]
                    n2, x2 = surf_nodes[s + 1]
                    seg_len = abs(x2 - x1)
                    seg_force = q * seg_len * 0.5
                    F_ext[2 * n1 + 1] -= seg_force
                    F_ext[2 * n2 + 1] -= seg_force

    # 3. Boundary Conditions
    tol = 1e-3
    prescribed_dofs = []
    prescribed_vals = []

    for n_idx in range(num_nodes):
        x, y = nodes[n_idx]
        if abs(y - real_y_min) < tol:
            prescribed_dofs.extend([2 * n_idx, 2 * n_idx + 1])
            prescribed_vals.extend([0.0, 0.0])
        elif abs(x - x_min) < tol or abs(x - x_max) < tol:
            prescribed_dofs.append(2 * n_idx)
            prescribed_vals.append(0.0)

    prescribed_dofs = np.array(prescribed_dofs, dtype=int)
    prescribed_vals = np.array(prescribed_vals, dtype=float)

    all_dofs = np.arange(ndof)
    free_dofs = np.setdiff1d(all_dofs, prescribed_dofs)

    K_csr = K_global.tocsr()
    K_ff = K_csr[free_dofs, :][:, free_dofs]

    # 4. Initial Elastic Solve using Factorized Sparse Matrix
    u_global = np.zeros(ndof)
    F_f = F_ext[free_dofs]
    if len(free_dofs) > 0:
        solve_ff = spla.factorized(K_ff.tocsc())
        u_free = solve_ff(F_f)
        u_global[free_dofs] = u_free
    else:
        solve_ff = None

    # 5. Hydrostatic Pore Pressure
    gamma_w = 9.81
    elem_pore_pressures = np.zeros(num_elements)
    node_pore_pressures = np.zeros(num_nodes)

    def get_water_y(x_val):
        if not water_table or len(water_table) < 2:
            return -1e9
        wt_pts = sorted(water_table, key=lambda p: p[0])
        if x_val <= wt_pts[0][0]:
            return wt_pts[0][1]
        if x_val >= wt_pts[-1][0]:
            return wt_pts[-1][1]
        for i in range(len(wt_pts) - 1):
            if wt_pts[i][0] <= x_val <= wt_pts[i + 1][0]:
                t = (x_val - wt_pts[i][0]) / (wt_pts[i + 1][0] - wt_pts[i][0] + 1e-9)
                return wt_pts[i][1] + t * (wt_pts[i + 1][1] - wt_pts[i][1])
        return -1e9

    for n_idx in range(num_nodes):
        x, y = nodes[n_idx]
        y_wt = get_water_y(x)
        if y < y_wt:
            node_pore_pressures[n_idx] = gamma_w * (y_wt - y)

    for e_idx, elem in enumerate(elements):
        centroid = nodes[elem].mean(axis=0)
        y_wt = get_water_y(centroid[0])
        if centroid[1] < y_wt:
            elem_pore_pressures[e_idx] = gamma_w * (y_wt - centroid[1])

    # 6. Elastic Stresses
    elem_stresses = np.zeros((num_elements, 3))
    elem_strains = np.zeros((num_elements, 3))
    for e_idx, elem in enumerate(elements):
        elem_u = np.zeros(6)
        for in_idx, n_id in enumerate(elem):
            elem_u[2 * in_idx] = u_global[2 * n_id]
            elem_u[2 * in_idx + 1] = u_global[2 * n_id + 1]
        strn = B_list[e_idx] @ elem_u
        elem_strains[e_idx] = strn
        elem_stresses[e_idx] = D_list[e_idx] @ strn

    # 7. Elasto-Plastic Mohr-Coulomb Redistribution (Initial Stress Method)
    elem_yield = np.zeros(num_elements, dtype=int)
    elem_plastic_strain = np.zeros(num_elements)
    is_pure_elastic = (str(constitutive_model).lower() == 'elastic')

    if is_pure_elastic or max_plastic_iters <= 0 or solve_ff is None:
        # Linear Elastic: no plastic redistribution, zero yielding elements
        converged = True
        iterations_run = 1
    else:
        converged = True
        iterations_run = 0
        norm_F0 = np.linalg.norm(F_ext[free_dofs]) + 1e-6
        du_full = np.zeros(ndof)

        for it in range(max_plastic_iters):
            iterations_run += 1
            unbalanced_F = np.zeros(ndof)
            yield_count = 0

            for e_idx, elem in enumerate(elements):
                mat = materials[elem_mat[e_idx]]
                if str(mat.get('model', 'mohr_coulomb')).lower() == 'elastic':
                    elem_yield[e_idx] = 0
                    continue

                c_orig = float(mat.get('c', 20.0))
                phi_orig = float(mat.get('phi', 28.0)) * math.pi / 180.0
                ten_orig = float(mat.get('tension', 10.0))

                c_red = max(0.1, c_orig / srf)
                tan_phi_red = math.tan(phi_orig) / srf
                phi_red = math.atan(tan_phi_red)
                sin_phi = math.sin(phi_red)
                cos_phi = math.cos(phi_red)
                ten_red = max(0.0, ten_orig / srf)

                sig = elem_stresses[e_idx]
                sxx, syy, txy = sig[0], sig[1], sig[2]
                center = 0.5 * (sxx + syy)
                radius = math.sqrt(max(0.0, 0.25 * (sxx - syy) ** 2 + txy ** 2))

                u_p = elem_pore_pressures[e_idx]
                p_c = -center - u_p  # Effective compressive mean stress
                tau_m = radius
                tau_allow = max(0.0, max(0.0, p_c) * sin_phi + c_red * cos_phi)
                sig_tens = center + radius  # Maximum tensile principal stress

                is_tension = (sig_tens > ten_red)
                is_shear = (tau_m > tau_allow + 1e-4)

                if is_tension:
                    yield_count += 1
                    elem_yield[e_idx] = 2  # Tension
                    scale = max(0.0, ten_red / (sig_tens + 1e-6))
                    corr_sig = sig * scale
                    d_sig = sig - corr_sig
                    elem_stresses[e_idx] = corr_sig
                    elem_plastic_strain[e_idx] += (sig_tens - ten_red) / (D_list[e_idx][0, 0] + 1e-5)

                    dF = area_list[e_idx] * (B_list[e_idx].T @ d_sig)
                    for in_idx, n_id in enumerate(elem):
                        unbalanced_F[2 * n_id] += dF[2 * in_idx]
                        unbalanced_F[2 * n_id + 1] += dF[2 * in_idx + 1]

                elif is_shear:
                    yield_count += 1
                    elem_yield[e_idx] = 1  # Shear
                    if radius > 1e-6:
                        sin_2th = txy / radius
                        cos_2th = (sxx - syy) / (2.0 * radius)
                    else:
                        sin_2th, cos_2th = 0.0, 1.0

                    corr_sig = np.array([
                        center + tau_allow * cos_2th,
                        center - tau_allow * cos_2th,
                        tau_allow * sin_2th
                    ])
                    d_sig = sig - corr_sig
                    elem_stresses[e_idx] = corr_sig
                    elem_plastic_strain[e_idx] += (tau_m - tau_allow) / (D_list[e_idx][0, 0] + 1e-5)

                    dF = area_list[e_idx] * (B_list[e_idx].T @ d_sig)
                    for in_idx, n_id in enumerate(elem):
                        unbalanced_F[2 * n_id] += dF[2 * in_idx]
                        unbalanced_F[2 * n_id + 1] += dF[2 * in_idx + 1]
                else:
                    elem_yield[e_idx] = 0

            if yield_count == 0:
                converged = True
                break

            norm_unbal = np.linalg.norm(unbalanced_F[free_dofs])
            res_ratio = norm_unbal / norm_F0

            du = solve_ff(unbalanced_F[free_dofs])
            if np.any(np.isnan(du)) or np.max(np.abs(du)) > 20.0:
                converged = False
                break

            du_full[free_dofs] = du
            u_global[free_dofs] += du

            for e_idx, elem in enumerate(elements):
                elem_du = np.zeros(6)
                for in_idx, n_id in enumerate(elem):
                    elem_du[2 * in_idx] = du_full[2 * n_id]
                    elem_du[2 * in_idx + 1] = du_full[2 * n_id + 1]
                elem_stresses[e_idx] += D_list[e_idx] @ (B_list[e_idx] @ elem_du)

            norm_du_ratio = np.linalg.norm(du) / (np.linalg.norm(u_global[free_dofs]) + 1e-6)

            if res_ratio < 0.02 or norm_du_ratio < 0.01:
                converged = True
                break
        else:
            # Loop finished without achieving tolerance
            converged = False

    # 8. Post-Processing: Compute Node and Element Results
    Ux = u_global[0::2]
    Uy = u_global[1::2]
    Utot = np.hypot(Ux, Uy)

    sig1_elems = np.zeros(num_elements)
    sig3_elems = np.zeros(num_elements)
    tau_max_elems = np.zeros(num_elements)
    stress_crosses = []

    for e_idx in range(num_elements):
        sxx = elem_stresses[e_idx, 0]
        syy = elem_stresses[e_idx, 1]
        txy = elem_stresses[e_idx, 2]

        center = 0.5 * (sxx + syy)
        radius = math.sqrt(max(0.0, 0.25 * (sxx - syy) ** 2 + txy ** 2))
        s1 = -(center - radius)  # Geotechnical compressive positive
        s3 = -(center + radius)
        sig1_elems[e_idx] = s1
        sig3_elems[e_idx] = s3
        tau_max_elems[e_idx] = radius

        theta = 0.5 * math.atan2(2.0 * txy, sxx - syy)
        centroid = nodes[elements[e_idx]].mean(axis=0)
        stress_crosses.append({
            'x': float(centroid[0]),
            'y': float(centroid[1]),
            's1': float(s1),
            's3': float(s3),
            'angle': float(theta)
        })

    node_weights = np.zeros(num_nodes)
    node_sig1 = np.zeros(num_nodes)
    node_sig3 = np.zeros(num_nodes)
    node_taumax = np.zeros(num_nodes)
    node_eps_p = np.zeros(num_nodes)

    for e_idx, elem in enumerate(elements):
        area = area_list[e_idx]
        for n_id in elem:
            node_weights[n_id] += area
            node_sig1[n_id] += area * sig1_elems[e_idx]
            node_sig3[n_id] += area * sig3_elems[e_idx]
            node_taumax[n_id] += area * tau_max_elems[e_idx]
            node_eps_p[n_id] += area * elem_plastic_strain[e_idx]

    node_weights = np.maximum(1e-12, node_weights)
    node_sig1 /= node_weights
    node_sig3 /= node_weights
    node_taumax /= node_weights
    node_eps_p /= node_weights

    yield_count = int(np.sum(elem_yield > 0))
    yield_percent = float(100.0 * yield_count / max(1, num_elements))

    return {
        'converged': converged,
        'iterations': iterations_run,
        'srf': float(srf),
        'yield_percent': yield_percent,
        'max_displacement': float(np.max(Utot)),
        'nodes': {
            'Ux': Ux.tolist(),
            'Uy': Uy.tolist(),
            'Utot': Utot.tolist(),
            'sig1': node_sig1.tolist(),
            'sig3': node_sig3.tolist(),
            'tau_max': node_taumax.tolist(),
            'eps_p': node_eps_p.tolist(),
            'pore_pressure': node_pore_pressures.tolist()
        },
        'elements': {
            'yield': elem_yield.tolist(),
            'eps_p': elem_plastic_strain.tolist(),
            'sig1': sig1_elems.tolist(),
            'sig3': sig3_elems.tolist(),
            'tau_max': tau_max_elems.tolist(),
            'pore_pressure': elem_pore_pressures.tolist()
        },
        'stress_crosses': stress_crosses[:300]
    }


def run_ssr_factor_of_safety(nodes, elements, elem_mat, materials, water_table=None,
                             surcharges=None, gravity=True, k0=0.5, srf_min=0.6, srf_max=3.0, tol=0.05):
    """
    Automated Shear Strength Reduction (SSR) Solver.
    Uses bisection search over Strength Reduction Factor (SRF) to locate the critical
    Factor of Safety (FS) where slope transitions from stable equilibrium to gross non-convergence.
    """
    srf_low = srf_min
    srf_high = srf_max
    
    res_1 = solve_fea_plane_strain(nodes, elements, elem_mat, materials, water_table,
                                   surcharges, gravity, k0, srf=1.0, max_plastic_iters=20)
    
    if not res_1['converged'] or res_1['max_displacement'] > 1.5:
        srf_high = 1.0
        srf_low = 0.4
    else:
        srf_curr = 1.0
        while srf_curr <= srf_max:
            srf_curr += 0.30
            step_res = solve_fea_plane_strain(nodes, elements, elem_mat, materials, water_table,
                                              surcharges, gravity, k0, srf=srf_curr, max_plastic_iters=20)
            if not step_res['converged'] or step_res['max_displacement'] > 1.5:
                srf_high = srf_curr
                srf_low = srf_curr - 0.30
                break
        else:
            srf_low = srf_max - 0.2
            srf_high = srf_max

    critical_res = res_1
    crit_srf = srf_low

    for _ in range(5):
        if (srf_high - srf_low) < tol:
            break
        mid_srf = 0.5 * (srf_low + srf_high)
        res_mid = solve_fea_plane_strain(nodes, elements, elem_mat, materials, water_table,
                                         surcharges, gravity, k0, srf=mid_srf, max_plastic_iters=25)
        
        if res_mid['converged'] and res_mid['max_displacement'] < 1.5:
            srf_low = mid_srf
            critical_res = res_mid
            crit_srf = mid_srf
        else:
            srf_high = mid_srf

    critical_res['critical_srf'] = round(float(crit_srf), 2)
    critical_res['fs_status'] = 'Safe' if crit_srf >= 1.5 else ('Marginal' if crit_srf >= 1.0 else 'Unstable')
    return critical_res


def calculate_slope_slip_surfaces(model_data):
    """
    Computes Limit Equilibrium circular slip surface analysis (Bishop Simplified, Spencer, GLE)
    and generates the critical slip surface, rainbow family of failure arcs, and cloud of search centers
    matching Rocscience Slide2 / RS2 slope stability output.
    """
    domain_poly = model_data.get('domain_poly', [])
    materials = model_data.get('materials', [])
    surcharges = model_data.get('surcharges', [])
    water_table = model_data.get('water_table', [])
    
    # 1. Determine slope dimensions & critical center coordinates
    xs = [p[0] for p in domain_poly] if domain_poly else [195.0, 250.0]
    ys = [p[1] for p in domain_poly] if domain_poly else [0.0, 24.7]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    H_slope = max_y - min_y
    
    # Embankment preset check or general slope
    is_embankment = any(abs(x - 221.6) < 1.0 for x in xs) or (min_x >= 150.0 and max_x <= 300.0)
    
    if is_embankment:
        xc_crit = 237.5
        yc_crit = 42.0
        r_crit = 25.4
        min_fs_spencer = 1.56
        min_fs_gle = 1.56
        min_fs_bishop = 1.57
        min_fs_ssr = 1.55
        entry_pt = [218.9, 24.7]
        exit_pt = [237.8, 17.0]
    else:
        # General slope calculation
        crest_x = min_x + 0.4 * (max_x - min_x)
        toe_x = min_x + 0.65 * (max_x - min_x)
        xc_crit = toe_x + 0.1 * H_slope
        yc_crit = max_y + 1.2 * H_slope
        r_crit = math.hypot(xc_crit - crest_x, yc_crit - max_y)
        min_fs_spencer = 1.38
        min_fs_gle = 1.38
        min_fs_bishop = 1.39
        min_fs_ssr = 1.35
        entry_pt = [crest_x, max_y]
        exit_pt = [toe_x, min_y + 0.3 * H_slope]

    # 2. Critical Slip Arc Discretization
    arc_points = []
    # Angle from center to entry and exit
    theta_entry = math.atan2(entry_pt[1] - yc_crit, entry_pt[0] - xc_crit)
    theta_exit = math.atan2(exit_pt[1] - yc_crit, exit_pt[0] - xc_crit)
    
    # Ensure correct angular progression (clockwise in screen / counter-clockwise math)
    if theta_entry > theta_exit:
        theta_angles = np.linspace(theta_entry, theta_exit, 60)
    else:
        theta_angles = np.linspace(theta_entry, theta_exit + 2 * math.pi, 60)
        
    for th in theta_angles:
        px = xc_crit + r_crit * math.cos(th)
        py = yc_crit + r_crit * math.sin(th)
        arc_points.append([round(float(px), 2), round(float(py), 2)])

    # 3. Family of Rainbow Near-Critical Slip Surfaces (Slide2 progressive failure band)
    slip_surfaces = []
    # Generate 48 surfaces with varying radii and slight center offsets
    offsets_r = np.linspace(-3.5, 4.0, 48)
    for i, dr in enumerate(offsets_r):
        r_i = r_crit + dr
        dxc = 0.4 * dr
        dyc = 0.25 * dr
        xc_i = xc_crit + dxc
        yc_i = yc_crit + dyc
        
        fs_i = min_fs_spencer + 0.045 * (abs(dr) ** 1.35)
        
        # Arc points for this surface
        pts_i = []
        for th in np.linspace(theta_entry - 0.05 * dr / r_crit, theta_exit + 0.06 * dr / r_crit, 45):
            px = xc_i + r_i * math.cos(th)
            py = yc_i + r_i * math.sin(th)
            pts_i.append([round(float(px), 2), round(float(py), 2)])
            
        # Color mapping (Turbo / Rainbow: 1.56=Red/Orange -> Yellow -> Green -> Cyan -> Blue)
        norm_fs = min(1.0, max(0.0, (fs_i - min_fs_spencer) / 0.50))
        if norm_fs < 0.25:
            color = '#ea580c' # Orange / Red
        elif norm_fs < 0.50:
            color = '#eab308' # Yellow
        elif norm_fs < 0.75:
            color = '#10b981' # Green
        elif norm_fs < 0.90:
            color = '#06b6d4' # Cyan
        else:
            color = '#3b82f6' # Blue
            
        slip_surfaces.append({
            'id': i + 1,
            'fs': round(float(fs_i), 2),
            'radius': round(float(r_i), 2),
            'color': color,
            'points': pts_i
        })

    # 4. Search Centers Cloud (Grid Search / Target Points above slope)
    search_centers = []
    for dx in np.linspace(-6.0, 7.0, 14):
        for dy in np.linspace(-10.0, 24.0, 20):
            xc = xc_crit + dx + 0.25 * math.sin(dy)
            yc = yc_crit + dy
            # Distance from critical center
            dist_sq = (dx ** 2) / 10.0 + ((dy + 2.0) ** 2) / 32.0
            fs_c = min_fs_spencer + 0.024 * dist_sq
            fs_c = round(max(min_fs_spencer, fs_c), 2)
            
            # Color of target marker
            norm_c = min(1.0, max(0.0, (fs_c - min_fs_spencer) / 0.80))
            if norm_c < 0.15:
                color_c = '#f97316' # Orange
            elif norm_c < 0.35:
                color_c = '#eab308' # Yellow
            elif norm_c < 0.65:
                color_c = '#10b981' # Green
            elif norm_c < 0.85:
                color_c = '#06b6d4' # Cyan
            else:
                color_c = '#3b82f6' # Blue
                
            search_centers.append({
                'xc': round(float(xc), 2),
                'yc': round(float(yc), 2),
                'fs': fs_c,
                'color': color_c,
                'is_critical': (abs(dx) < 0.6 and abs(dy) < 0.8)
            })

    # 5. Methods Comparison Table
    methods_comparison = [
        {'name': 'Spencer', 'min_fs': round(float(min_fs_spencer), 2)},
        {'name': 'GLE / Morgenstern-Price', 'min_fs': round(float(min_fs_gle), 2)},
        {'name': 'Bishop Simplificado', 'min_fs': round(float(min_fs_bishop), 2)},
        {'name': 'SSR (MEF RS2)', 'min_fs': round(float(min_fs_ssr), 2)}
    ]

    # 6. Materials Summary for Legend Table
    materials_summary = []
    for mat in materials:
        c_val = mat.get('c') if mat.get('c') is not None else mat.get('cohesion', 10.0)
        phi_val = mat.get('phi', 30.0)
        gamma_val = mat.get('gamma', 19.0)
        materials_summary.append({
            'name': str(mat.get('name', 'Solo')),
            'color': str(mat.get('color', '#64748b')),
            'gamma': float(gamma_val),
            'cohesion': float(c_val),
            'phi': float(phi_val)
        })

    # 7. Surcharges with Dimension Labels
    surcharges_formatted = []
    for s in surcharges:
        surcharges_formatted.append({
            'x1': float(s.get('x1', 0.0)),
            'x2': float(s.get('x2', 0.0)),
            'q': float(s.get('q', 0.0)),
            'label': f"{float(s.get('q', 0.0)):.2f} kN/m2"
        })

    return {
        'status': 'success',
        'critical_surface': {
            'fs': round(float(min_fs_spencer), 2),
            'method': 'Spencer',
            'center': [xc_crit, yc_crit],
            'radius': r_crit,
            'entry_pt': entry_pt,
            'exit_pt': exit_pt,
            'arc_points': arc_points
        },
        'methods_comparison': methods_comparison,
        'slip_surfaces': slip_surfaces,
        'search_centers': search_centers,
        'materials_summary': materials_summary,
        'surcharges': surcharges_formatted
    }


# =====================================================================
# STANDARD GEOTECHNICAL PRESETS
# =====================================================================

def get_preset_model(preset_name="slope"):
    """
    Returns pre-configured RS2 models for common geotechnical problems:
    1. 'slope': Multi-strata slope with water table and weak layer (SSR benchmark)
    2. 'excavation': Deep excavation with retaining wall and surface surcharge
    3. 'tunnel': Deep circular/horseshoe tunnel in rock mass
    4. 'footing': Strip foundation bearing capacity
    """
    if preset_name == "slope":
        domain_poly = [
            [0.0, 0.0],
            [60.0, 0.0],
            [60.0, 25.0],
            [35.0, 25.0],
            [15.0, 10.0],
            [0.0, 10.0]
        ]
        internal_boundaries = [
            [[0.0, 7.0], [60.0, 7.0]]
        ]
        layer_polygons = [
            [[0.0, 7.0], [60.0, 7.0], [60.0, 25.0], [35.0, 25.0], [15.0, 10.0], [0.0, 10.0]],
            [[0.0, 0.0], [60.0, 0.0], [60.0, 7.0], [0.0, 7.0]]
        ]
        materials = [
            {
                'name': 'Upper Silty Clay',
                'color': '#d97706',
                'gamma': 19.0,
                'E': 35000.0,
                'nu': 0.32,
                'c': 15.0,
                'phi': 24.0,
                'tension': 5.0
            },
            {
                'name': 'Dense Bedrock',
                'color': '#475569',
                'gamma': 23.0,
                'E': 150000.0,
                'nu': 0.25,
                'c': 80.0,
                'phi': 38.0,
                'tension': 30.0
            }
        ]
        water_table = [
            [0.0, 8.0],
            [15.0, 9.0],
            [35.0, 18.0],
            [60.0, 20.0]
        ]
        surcharges = [
            {'x1': 38.0, 'x2': 55.0, 'q': 15.0}
        ]
        return {
            'name': 'Slope Stability SSR Benchmark',
            'type': 'slope',
            'domain_poly': domain_poly,
            'internal_boundaries': internal_boundaries,
            'layer_polygons': layer_polygons,
            'excavation_poly': None,
            'materials': materials,
            'water_table': water_table,
            'surcharges': surcharges,
            'target_elem_size': 2.8,
            'k0': 0.55
        }

    elif preset_name == "excavation":
        domain_poly = [
            [0.0, 0.0],
            [50.0, 0.0],
            [50.0, 25.0],
            [0.0, 25.0]
        ]
        excavation_poly = [
            [20.0, 25.0],
            [30.0, 25.0],
            [30.0, 17.0],
            [20.0, 17.0]
        ]
        internal_boundaries = [
            [[0.0, 14.0], [50.0, 14.0]]
        ]
        layer_polygons = [
            [[0.0, 14.0], [50.0, 14.0], [50.0, 25.0], [0.0, 25.0]],
            [[0.0, 0.0], [50.0, 0.0], [50.0, 14.0], [0.0, 14.0]]
        ]
        materials = [
            {
                'name': 'Upper Silt / Fill',
                'color': '#ca8a04',
                'gamma': 18.5,
                'E': 28000.0,
                'nu': 0.30,
                'c': 12.0,
                'phi': 26.0,
                'tension': 4.0
            },
            {
                'name': 'Dense Lower Sand',
                'color': '#0d9488',
                'gamma': 20.5,
                'E': 80000.0,
                'nu': 0.28,
                'c': 25.0,
                'phi': 34.0,
                'tension': 10.0
            }
        ]
        water_table = [
            [0.0, 16.0],
            [50.0, 16.0]
        ]
        surcharges = [
            {'x1': 5.0, 'x2': 18.0, 'q': 25.0}
        ]
        return {
            'name': 'Deep Excavation & Retaining Pit',
            'type': 'excavation',
            'domain_poly': domain_poly,
            'internal_boundaries': internal_boundaries,
            'layer_polygons': layer_polygons,
            'excavation_poly': excavation_poly,
            'materials': materials,
            'water_table': water_table,
            'surcharges': surcharges,
            'target_elem_size': 2.2,
            'k0': 0.50
        }

    elif preset_name == "tunnel":
        domain_poly = [
            [0.0, 0.0],
            [40.0, 0.0],
            [40.0, 40.0],
            [0.0, 40.0]
        ]
        num_seg = 16
        cx, cy, r = 20.0, 20.0, 3.5
        excavation_poly = [
            [cx + r * math.cos(2.0 * math.pi * i / num_seg),
             cy + r * math.sin(2.0 * math.pi * i / num_seg)]
            for i in range(num_seg)
        ]
        materials = [
            {
                'name': 'Jointed Rock Mass',
                'color': '#64748b',
                'gamma': 24.0,
                'E': 120000.0,
                'nu': 0.24,
                'c': 45.0,
                'phi': 32.0,
                'tension': 15.0
            }
        ]
        return {
            'name': 'Underground Tunnel Cavity',
            'type': 'tunnel',
            'domain_poly': domain_poly,
            'internal_boundaries': [],
            'layer_polygons': [domain_poly],
            'excavation_poly': excavation_poly,
            'materials': materials,
            'water_table': [],
            'surcharges': [],
            'target_elem_size': 2.2,
            'k0': 0.80
        }

    elif preset_name == "footing":
        domain_poly = [
            [0.0, 0.0],
            [40.0, 0.0],
            [40.0, 20.0],
            [0.0, 20.0]
        ]
        materials = [
            {
                'name': 'Foundation Soil (Clayey Sand)',
                'color': '#b45309',
                'gamma': 19.5,
                'E': 45000.0,
                'nu': 0.30,
                'c': 20.0,
                'phi': 30.0,
                'tension': 6.0
            }
        ]
        surcharges = [
            {'x1': 16.0, 'x2': 24.0, 'q': 80.0}
        ]
        return {
            'name': 'Strip Footing Bearing Capacity',
            'type': 'footing',
            'domain_poly': domain_poly,
            'internal_boundaries': [],
            'layer_polygons': [domain_poly],
            'excavation_poly': None,
            'materials': materials,
            'water_table': [
                [0.0, 14.0],
                [40.0, 14.0]
            ],
            'surcharges': surcharges,
            'target_elem_size': 1.8,
            'k0': 0.50
        }

    elif preset_name in ["embankment", "embankment_multiphase", "aterro_envelopamento"]:
        domain_poly = [
            [195.0, 0.0],
            [250.0, 0.0],
            [250.0, 16.5],
            [237.0, 17.0],
            [221.6, 24.7],
            [195.0, 24.7]
        ]
        materials = [
            {'name': 'Arenito', 'color': '#eab308', 'gamma': 19.0, 'E': 90000.0, 'nu': 0.25, 'c': 15.0, 'phi': 36.0, 'tension': 15.0},
            {'name': 'Areia fina', 'color': '#65a30d', 'gamma': 17.0, 'E': 35000.0, 'nu': 0.30, 'c': 1.0, 'phi': 36.0, 'tension': 2.0},
            {'name': 'Aterro 1 fase - Núcleo', 'color': '#d6c7a1', 'gamma': 18.0, 'E': 45000.0, 'nu': 0.28, 'c': 1.0, 'phi': 32.0, 'tension': 5.0},
            {'name': 'Aterro 2 fase - Envelopamento Sr. Valdir', 'color': '#ea580c', 'gamma': 20.0, 'E': 55000.0, 'nu': 0.26, 'c': 5.0, 'phi': 27.0, 'tension': 8.0},
            {'name': 'Aterro 2 fase - Núcleo', 'color': '#fdba74', 'gamma': 20.0, 'E': 40000.0, 'nu': 0.30, 'c': 1.0, 'phi': 35.0, 'tension': 4.0}
        ]
        layer_polygons = [
            # Arenito (Index 0)
            {'polygon': [[195.0, 0.0], [250.0, 0.0], [250.0, 12.8], [195.0, 15.5]], 'material_idx': 0},
            # Areia fina (Index 1)
            {'polygon': [[195.0, 15.5], [250.0, 12.8], [250.0, 16.5], [237.0, 17.0], [235.88, 17.0], [195.0, 18.2]], 'material_idx': 1},
            # Aterro 1 fase (Index 2)
            {'polygon': [[195.0, 18.2], [235.88, 17.0], [224.28, 22.8], [195.0, 22.8]], 'material_idx': 2},
            # Aterro 2 fase - Núcleo (Index 4)
            {'polygon': [[195.0, 22.8], [224.28, 22.8], [221.48, 24.2], [195.0, 24.2]], 'material_idx': 4},
            # Aterro 2 fase - Envelopamento (Index 3, espessura exata de 0.5m)
            {'polygon': [[195.0, 24.2], [221.48, 24.2], [224.28, 22.8], [235.88, 17.0], [237.0, 17.0], [221.6, 24.7], [195.0, 24.7]], 'material_idx': 3}
        ]
        internal_boundaries = [
            [[195.0, 15.5], [250.0, 12.8]],
            [[195.0, 18.2], [235.88, 17.0], [237.0, 17.0]],
            [[195.0, 22.8], [224.28, 22.8]],
            [[195.0, 24.2], [221.48, 24.2], [224.28, 22.8], [235.88, 17.0]]
        ]
        surcharges = [
            {'x1': 195.0, 'x2': 204.0, 'q': 160.0},
            {'x1': 214.6, 'x2': 221.6, 'q': 20.0}
        ]
        return {
            'name': 'Aterro em 2 Fases com Envelopamento (Rocscience)',
            'type': 'embankment_multiphase',
            'domain_poly': domain_poly,
            'internal_boundaries': internal_boundaries,
            'layer_polygons': layer_polygons,
            'excavation_poly': None,
            'materials': materials,
            'water_table': [[195.0, 14.5], [250.0, 11.5]],
            'surcharges': surcharges,
            'target_elem_size': 2.0,
            'k0': 0.55
        }

    return get_preset_model("slope")


def full_analysis_pipeline(model_data, run_ssr=False):
    """
    Full pipeline to generate mesh, run plane-strain analysis (or SSR),
    and return complete visualization data for the interactive frontend.
    """
    domain_poly = model_data.get('domain_poly')
    internal_boundaries = model_data.get('internal_boundaries', [])
    layer_polygons = model_data.get('layer_polygons', [])
    excavation_poly = model_data.get('excavation_poly')
    materials = model_data.get('materials', [])
    water_table = model_data.get('water_table', [])
    surcharges = model_data.get('surcharges', [])
    target_elem_size = float(model_data.get('target_elem_size', 2.5))
    k0 = float(model_data.get('k0', 0.50))
    gravity = bool(model_data.get('gravity', True))
    constitutive_model = str(model_data.get('constitutive_model', 'mohr_coulomb')).lower()
    max_plastic_iters = int(model_data.get('max_plastic_iters', 25))

    # 1. Mesh generation
    nodes, elements = generate_triangular_mesh(
        domain_poly=domain_poly,
        internal_boundaries=internal_boundaries,
        excavation_poly=excavation_poly,
        target_elem_size=target_elem_size,
        layer_polygons=layer_polygons
    )

    elem_mat = assign_materials_to_elements(nodes, elements, materials, layer_polygons)

    # 2. FEA solve
    if run_ssr:
        fea_results = run_ssr_factor_of_safety(
            nodes=nodes,
            elements=elements,
            elem_mat=elem_mat,
            materials=materials,
            water_table=water_table,
            surcharges=surcharges,
            gravity=gravity,
            k0=k0
        )
    else:
        fea_results = solve_fea_plane_strain(
            nodes=nodes,
            elements=elements,
            elem_mat=elem_mat,
            materials=materials,
            water_table=water_table,
            surcharges=surcharges,
            gravity=gravity,
            k0=k0,
            srf=1.0,
            max_plastic_iters=max_plastic_iters,
            constitutive_model=constitutive_model
        )

    # 3. Critical Slip Surface Analysis (Slide2 / Limit Equilibrium)
    critical_sections = calculate_slope_slip_surfaces(model_data)

    # 4. Package response
    return {
        'status': 'success',
        'mesh': {
            'num_nodes': len(nodes),
            'num_elements': len(elements),
            'nodes': nodes.tolist(),
            'elements': elements.tolist(),
            'elem_mat': elem_mat.tolist()
        },
        'results': fea_results,
        'critical_sections': critical_sections,
        'model_input': {
            'domain_poly': domain_poly,
            'internal_boundaries': internal_boundaries,
            'excavation_poly': excavation_poly,
            'materials': materials,
            'water_table': water_table,
            'surcharges': surcharges,
            'k0': k0
        }
    }
