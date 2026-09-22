import math
import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla

def compute_element_cst(nodes_elem, E, nu, axisymmetric=False):
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

    if not axisymmetric:
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

        factor = E / ((1.0 + nu) * (1.0 - 2.0 * nu))
        D = factor * np.array([
            [1.0 - nu, nu, 0.0],
            [nu, 1.0 - nu, 0.0],
            [0.0, 0.0, 0.5 - nu]
        ])
        Ke = area * (B.T @ D @ B)
        return Ke, B, D, area
    else:
        # Axisymmetric formulation: radial r = x, axial z = y
        r_bar = max(1e-3, (x0 + x1 + x2) / 3.0)
        B = np.zeros((4, 6))
        B[0, 0] = b0 * inv2A
        B[0, 2] = b1 * inv2A
        B[0, 4] = b2 * inv2A

        B[1, 1] = c0 * inv2A
        B[1, 3] = c1 * inv2A
        B[1, 5] = c2 * inv2A

        B[2, 0] = 1.0 / (3.0 * r_bar)
        B[2, 2] = 1.0 / (3.0 * r_bar)
        B[2, 4] = 1.0 / (3.0 * r_bar)

        B[3, 0] = c0 * inv2A
        B[3, 1] = b0 * inv2A
        B[3, 2] = c1 * inv2A
        B[3, 3] = b1 * inv2A
        B[3, 4] = c2 * inv2A
        B[3, 5] = b2 * inv2A

        factor = E / ((1.0 + nu) * (1.0 - 2.0 * nu))
        D = factor * np.array([
            [1.0 - nu, nu, nu, 0.0],
            [nu, 1.0 - nu, nu, 0.0],
            [nu, nu, 1.0 - nu, 0.0],
            [0.0, 0.0, 0.0, 0.5 - nu]
        ])
        vol = 2.0 * math.pi * r_bar * area
        Ke = vol * (B.T @ D @ B)
        return Ke, B, D, vol


def compute_liner_beam_element(p1, p2, E, t, nu=0.2, I=None, A=None):
    """Computes 4x4 condensed structural beam stiffness for a 2D line segment."""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    L = max(1e-4, math.hypot(dx, dy))
    cx = dx / L
    cy = dy / L

    if A is None:
        A = t * 1.0  # Unit width
    if I is None:
        I = (1.0 * (t ** 3)) / 12.0

    ka = (E * A) / L
    kb = (12.0 * E * I) / (L ** 3)

    k_local = np.array([
        [ ka,  0.0, -ka,  0.0],
        [0.0,   kb,  0.0, -kb],
        [-ka,  0.0,  ka,  0.0],
        [0.0,  -kb,  0.0,  kb]
    ])

    T = np.array([
        [ cx, cy, 0.0, 0.0],
        [-cy, cx, 0.0, 0.0],
        [0.0, 0.0,  cx, cy],
        [0.0, 0.0, -cy, cx]
    ])

    k_global = T.T @ k_local @ T
    return k_global, T, L, ka, kb, E, A, I


def compute_liner_forces(p1, p2, u1, u2, E, t, I=None, A=None):
    """Computes internal Axial force (N), Shear force (V), and Moment (M)."""
    _, T, L, ka, kb, E, A, I = compute_liner_beam_element(p1, p2, E, t, I=I, A=A)
    u_glob = np.array([u1[0], u1[1], u2[0], u2[1]])
    u_loc = T @ u_glob
    delta_u = u_loc[2] - u_loc[0]
    delta_v = u_loc[3] - u_loc[1]

    N = ka * delta_u
    V = kb * delta_v
    M = (6.0 * E * I / (L ** 2)) * delta_v
    return {'N': float(N), 'V': float(V), 'M': float(M), 'L': float(L)}


def solve_steady_state_seepage(nodes, elements, elem_mat, materials, fixed_heads=None):
    """Solves steady-state 2D groundwater seepage using CST elements."""
    nodes = np.asarray(nodes, dtype=float)
    elements = np.asarray(elements, dtype=int)
    num_nodes = len(nodes)
    num_elems = len(elements)

    rows, cols, data = [], [], []
    for e in range(num_elems):
        pts = nodes[elements[e]]
        x0, y0 = pts[0]
        x1, y1 = pts[1]
        x2, y2 = pts[2]

        two_area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
        area = 0.5 * abs(two_area)
        if area < 1e-12:
            area = 1e-12

        b = np.array([y1 - y2, y2 - y0, y0 - y1])
        c = np.array([x2 - x1, x0 - x2, x1 - x0])

        mat = materials[elem_mat[e]]
        kx = float(mat.get('kx', mat.get('k', 1e-5)))
        ky = float(mat.get('ky', mat.get('k', 1e-5)))

        inv4A = 1.0 / (4.0 * area)
        Ke = (kx * np.outer(b, b) + ky * np.outer(c, c)) * inv4A

        elem_n = elements[e]
        for r_i in range(3):
            for c_i in range(3):
                rows.append(elem_n[r_i])
                cols.append(elem_n[c_i])
                data.append(Ke[r_i, c_i])

    K_seep = sp.coo_matrix((data, (rows, cols)), shape=(num_nodes, num_nodes)).tocsr()
    F_seep = np.zeros(num_nodes)

    prescribed_nodes = []
    prescribed_heads = []
    if fixed_heads:
        for fh in fixed_heads:
            n_idx = fh['node']
            h_val = float(fh['head'])
            prescribed_nodes.append(n_idx)
            prescribed_heads.append(h_val)

    prescribed_nodes = np.array(prescribed_nodes, dtype=int)
    prescribed_heads = np.array(prescribed_heads, dtype=float)
    free_nodes = np.setdiff1d(np.arange(num_nodes), prescribed_nodes)

    H_total = np.zeros(num_nodes)
    if len(prescribed_nodes) > 0:
        H_total[prescribed_nodes] = prescribed_heads
        F_reduced = F_seep[free_nodes] - K_seep[free_nodes, :][:, prescribed_nodes] @ prescribed_heads
    else:
        F_reduced = F_seep[free_nodes]

    if len(free_nodes) > 0:
        K_free = K_seep[free_nodes, :][:, free_nodes]
        H_total[free_nodes] = spla.spsolve(K_free.tocsc(), F_reduced)

    gamma_w = 9.81
    u_pore = np.maximum(0.0, gamma_w * (H_total - nodes[:, 1]))

    # Compute element velocities
    elem_vel = np.zeros((num_elems, 2))
    for e in range(num_elems):
        pts = nodes[elements[e]]
        two_area = (pts[1, 0] - pts[0, 0]) * (pts[2, 1] - pts[0, 1]) - (pts[2, 0] - pts[0, 0]) * (pts[1, 1] - pts[0, 1])
        b = np.array([pts[1, 1] - pts[2, 1], pts[2, 1] - pts[0, 1], pts[0, 1] - pts[1, 1]])
        c = np.array([pts[2, 0] - pts[1, 0], pts[0, 0] - pts[2, 0], pts[1, 0] - pts[0, 0]])
        mat = materials[elem_mat[e]]
        kx = float(mat.get('kx', mat.get('k', 1e-5)))
        ky = float(mat.get('ky', mat.get('k', 1e-5)))
        h_e = H_total[elements[e]]
        dHdx = np.dot(b, h_e) / two_area
        dHdy = np.dot(c, h_e) / two_area
        elem_vel[e, 0] = -kx * dHdx
        elem_vel[e, 1] = -ky * dHdy

    return {
        'H_total': H_total.tolist(),
        'u_pore': u_pore.tolist(),
        'elem_vel': elem_vel.tolist()
    }


if __name__ == '__main__':
    print("Testing Axisymmetric CST...")
    nodes_e = np.array([[5.0, 0.0], [6.0, 0.0], [5.5, 1.0]])
    Ke_axi, B_axi, D_axi, vol = compute_element_cst(nodes_e, 100000.0, 0.25, axisymmetric=True)
    assert Ke_axi.shape == (6, 6)
    assert np.allclose(Ke_axi, Ke_axi.T)
    print(f"Axisymmetric Ke symmetric OK, vol = {vol:.3f}")

    print("\nTesting Liner Beam Element...")
    p1 = (0.0, 0.0)
    p2 = (2.0, 0.0)
    E_c = 30e6  # 30 GPa
    t_c = 0.20  # 20 cm
    k_glob, T, L, ka, kb, E, A, I = compute_liner_beam_element(p1, p2, E_c, t_c)
    assert k_glob.shape == (4, 4)
    assert np.allclose(k_glob, k_glob.T)
    # Displace tip by 1 mm vertical
    forces = compute_liner_forces(p1, p2, (0, 0), (0, 0.001), E_c, t_c)
    print(f"Liner test: L={forces['L']}m, V={forces['V']:.1f} kN, M={forces['M']:.1f} kNm")

    print("\nTesting Steady-State 1D/2D Seepage Column...")
    # 2-element column: x from 0 to 1, y from 0 to 2
    nodes_s = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 2.0], [0.0, 2.0]])
    elems_s = np.array([[0, 1, 2], [0, 2, 3]])
    mats_s = [{'k': 1e-4}]
    elem_mat_s = [0, 0]
    # Fixed head at bottom y=0: H=5.0, fixed head at top y=2: H=1.0
    fheads = [
        {'node': 0, 'head': 5.0}, {'node': 1, 'head': 5.0},
        {'node': 2, 'head': 1.0}, {'node': 3, 'head': 1.0}
    ]
    seep_res = solve_steady_state_seepage(nodes_s, elems_s, elem_mat_s, mats_s, fheads)
    print(f"H_total: {seep_res['H_total']}")
    print(f"u_pore: {seep_res['u_pore']}")
    print(f"Velocity vy in elem 0: {seep_res['elem_vel'][0][1]:.6f} (expected: -kx * (1-5)/2 = 2e-4)")
    assert abs(seep_res['elem_vel'][0][1] - 2e-4) < 1e-6
    print("Seepage verification PASSED!")
