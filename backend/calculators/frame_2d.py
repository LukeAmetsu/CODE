"""
2D Plane Frame Structural Analysis Engine (Pórtico Plano 2D - Ftool Web)
Formulation:
- Direct Stiffness Method (Método dos Deslocamentos / Rigidez Direta)
- 3 Degrees of Freedom per node (Dx, Dy, Rz)
- Euler-Bernoulli beam-column elements with axial and flexural coupling
- Internal member hinges (rótulas)
- Elastic spring supports (translational & rotational)
- Distributed loads (uniform and trapezoidal, local and global)
- Concentrated member loads and nodal loads/moments
- Continuous internal force recovery: Normal (N), Shear (V), Bending Moment (M on tension face), and Deformed Shape
"""

import math
import numpy as np


class NodeResultCollection(list):
    """List of results that can also be accessed by node_id via subscript [node_id]."""
    def __init__(self, items, key='node_id'):
        super().__init__(items)
        self._map = {}
        for item in items:
            if isinstance(item, dict) and key in item:
                self._map[item[key]] = item
                try:
                    self._map[int(item[key])] = item
                except (ValueError, TypeError):
                    pass
                self._map[str(item[key])] = item

    def __getitem__(self, key):
        if key in self._map:
            return self._map[key]
        return super().__getitem__(key)


def solve_frame_2d(model_data: dict) -> dict:
    """
    Main 2D frame solver.
    """
    try:
        nodes = model_data.get('nodes', [])
        members = model_data.get('members', [])
        supports = model_data.get('supports')
        if not supports:
            supports = {}
            for n in nodes:
                nid = n.get('id')
                sup = n.get('support', 'free')
                kx = float(n.get('k_x', n.get('kx', 0.0)))
                ky = float(n.get('k_y', n.get('ky', 0.0)))
                krot = float(n.get('k_rot', n.get('krot', 0.0)))
                if sup != 'free' or kx > 0 or ky > 0 or krot > 0:
                    supports[nid] = {
                        'type': sup,
                        'dx': True if sup in ('fixed', 'pinned', 'roller_dx', 'roller_wall') else (kx if kx > 0 else False),
                        'dy': True if sup in ('fixed', 'pinned', 'roller_y', 'roller_dy', 'roller_x', 'roller') else (ky if ky > 0 else False),
                        'rz': True if sup == 'fixed' else (krot if krot > 0 else False),
                    }
        nodal_loads = model_data.get('nodal_loads', model_data.get('node_loads', []))
        member_loads = model_data.get('member_loads', [])

        if len(nodes) < 2 or len(members) < 1:
            return {'status': 'error', 'error': 'Modelo precisa de no mínimo 2 nós e 1 barra.'}

        num_nodes = len(nodes)
        ndof = 3 * num_nodes

        # Map node id to index (0 to num_nodes - 1)
        node_map = {}
        for idx, n in enumerate(nodes):
            nid = n.get('id', idx + 1)
            node_map[nid] = idx

        # 1. Member geometry and local stiffness
        K_global = np.zeros((ndof, ndof))
        F_global = np.zeros(ndof)

        member_details = []

        for m_idx, m in enumerate(members):
            m_id = m.get('id', m_idx + 1)
            ni_id = m['node_i']
            nj_id = m['node_j']
            
            idx_i = node_map[ni_id]
            idx_j = node_map[nj_id]

            xi, yi = float(nodes[idx_i]['x']), float(nodes[idx_i]['y'])
            xj, yj = float(nodes[idx_j]['x']), float(nodes[idx_j]['y'])

            dx = xj - xi
            dy = yj - yi
            L = math.hypot(dx, dy)

            if L < 1e-5:
                return {'status': 'error', 'error': f'Barra {m_id} possui comprimento nulo.'}

            c = dx / L
            s = dy / L

            # Material & Section properties
            # Automatically handle GPa vs kPa, cm² vs m², cm⁴ vs m⁴
            raw_E = float(m.get('E', 200.0 * 1e6))
            E = raw_E * 1e6 if raw_E <= 1000.0 else raw_E  # GPa -> kPa
            raw_A = float(m.get('A', 0.015))
            A = raw_A * 1e-4 if raw_A >= 0.05 else raw_A   # cm² -> m²
            raw_I = float(m.get('I', 0.00035))
            I = raw_I * 1e-8 if raw_I >= 0.01 else raw_I   # cm⁴ -> m⁴

            hinge_i = bool(m.get('hinge_i', False))
            hinge_j = bool(m.get('hinge_j', False))

            # Local element stiffness matrix (6x6)
            k_local = np.zeros((6, 6))

            # Axial terms
            ea_l = E * A / L
            k_local[0, 0] = ea_l
            k_local[0, 3] = -ea_l
            k_local[3, 0] = -ea_l
            k_local[3, 3] = ea_l

            # Flexural terms considering hinges
            ei = E * I
            if hinge_i and hinge_j:
                # Truss element (pinned-pinned): zero bending stiffness
                pass
            elif hinge_i:
                # Pinned at i, fixed at j: 3EI/L³ and 3EI/L
                k_local[1, 1] = 3.0 * ei / (L**3)
                k_local[1, 4] = -3.0 * ei / (L**3)
                k_local[1, 5] = 3.0 * ei / (L**2)

                k_local[4, 1] = -3.0 * ei / (L**3)
                k_local[4, 4] = 3.0 * ei / (L**3)
                k_local[4, 5] = -3.0 * ei / (L**2)

                k_local[5, 1] = 3.0 * ei / (L**2)
                k_local[5, 4] = -3.0 * ei / (L**2)
                k_local[5, 5] = 3.0 * ei / L
            elif hinge_j:
                # Fixed at i, pinned at j
                k_local[1, 1] = 3.0 * ei / (L**3)
                k_local[1, 2] = 3.0 * ei / (L**2)
                k_local[1, 4] = -3.0 * ei / (L**3)

                k_local[2, 1] = 3.0 * ei / (L**2)
                k_local[2, 2] = 3.0 * ei / L
                k_local[2, 4] = -3.0 * ei / (L**2)

                k_local[4, 1] = -3.0 * ei / (L**3)
                k_local[4, 2] = -3.0 * ei / (L**2)
                k_local[4, 4] = 3.0 * ei / (L**3)
            else:
                # Standard beam-column (fixed-fixed)
                k_local[1, 1] = 12.0 * ei / (L**3)
                k_local[1, 2] = 6.0 * ei / (L**2)
                k_local[1, 4] = -12.0 * ei / (L**3)
                k_local[1, 5] = 6.0 * ei / (L**2)

                k_local[2, 1] = 6.0 * ei / (L**2)
                k_local[2, 2] = 4.0 * ei / L
                k_local[2, 4] = -6.0 * ei / (L**2)
                k_local[2, 5] = 2.0 * ei / L

                k_local[4, 1] = -12.0 * ei / (L**3)
                k_local[4, 2] = -6.0 * ei / (L**2)
                k_local[4, 4] = 12.0 * ei / (L**3)
                k_local[4, 5] = -6.0 * ei / (L**2)

                k_local[5, 1] = 6.0 * ei / (L**2)
                k_local[5, 2] = 2.0 * ei / L
                k_local[5, 4] = -6.0 * ei / (L**2)
                k_local[5, 5] = 4.0 * ei / L

            # Transformation matrix T (6x6)
            T = np.zeros((6, 6))
            T[0, 0] = c;  T[0, 1] = s
            T[1, 0] = -s; T[1, 1] = c
            T[2, 2] = 1.0

            T[3, 3] = c;  T[3, 4] = s
            T[4, 3] = -s; T[4, 4] = c
            T[5, 5] = 1.0

            k_elem_global = T.T @ k_local @ T

            # Assemble into K_global
            dofs = [3 * idx_i, 3 * idx_i + 1, 3 * idx_i + 2, 3 * idx_j, 3 * idx_j + 1, 3 * idx_j + 2]
            for r in range(6):
                for col in range(6):
                    K_global[dofs[r], dofs[col]] += k_elem_global[r, col]

            member_details.append({
                'id': m_id,
                'node_i': ni_id,
                'node_j': nj_id,
                'idx_i': idx_i,
                'idx_j': idx_j,
                'dofs': dofs,
                'L': L,
                'c': c,
                's': s,
                'E': E,
                'A': A,
                'I': I,
                'hinge_i': hinge_i,
                'hinge_j': hinge_j,
                'k_local': k_local,
                'T': T,
                'fixed_end_local': np.zeros(6) # will accumulate member loads
            })

        # 2. Member Loads & Equivalent Nodal Forces (Fixed-End Actions)
        for ml in member_loads:
            target_mid = ml.get('member_id')
            m_info = next((item for item in member_details if item['id'] == target_mid), None)
            if not m_info:
                continue

            L = m_info['L']
            c = m_info['c']
            s = m_info['s']
            hinge_i = m_info['hinge_i']
            hinge_j = m_info['hinge_j']

            load_type = ml.get('type', 'uniform') # 'uniform', 'trapezoidal', 'concentrated'
            coord_sys = ml.get('coord_sys', 'local')

            f_fix_local = np.zeros(6)

            if load_type in ('uniform', 'trapezoidal'):
                # Transverse load qy (perpendicular to member) and axial qx
                if 'q_y' in ml:
                    qy_val = - float(ml['q_y'])  # GUI convention: negative is downward
                else:
                    qy_val = float(ml.get('qy', ml.get('qy_i', 0.0)))
                qy_i = float(ml.get('qy_i', qy_val))
                qy_j = float(ml.get('qy_j', qy_i))

                if 'q_x' in ml:
                    qx_val = float(ml['q_x'])
                else:
                    qx_val = float(ml.get('qx', ml.get('qx_i', 0.0)))
                qx_i = float(ml.get('qx_i', qx_val))
                qx_j = float(ml.get('qx_j', qx_i))

                if coord_sys == 'global':
                    # Project global QX, QY onto local axis so that F_global receives (+QX, +QY)
                    QX_i = float(ml.get('QX_i', ml.get('QX', 0.0)))
                    QX_j = float(ml.get('QX_j', QX_i))
                    QY_i = float(ml.get('QY_i', ml.get('QY', 0.0)))
                    QY_j = float(ml.get('QY_j', QY_i))
                    qx_i = -QX_i * c - QY_i * s
                    qx_j = -QX_j * c - QY_j * s
                    qy_i = QX_i * s - QY_i * c
                    qy_j = QX_j * s - QY_j * c

                # Axial fixed-end forces: linear qx from qx_i to qx_j
                f_fix_local[0] += (2.0 * qx_i + qx_j) * L / 6.0
                f_fix_local[3] += (qx_i + 2.0 * qx_j) * L / 6.0

                # Transverse fixed-end forces:
                # Decompose into uniform qu = qy_i and triangular dq = qy_j - qy_i
                qu = qy_i
                dq = qy_j - qy_i

                if hinge_i and hinge_j:
                    f_fix_local[1] += 0.5 * qu * L + dq * L / 6.0
                    f_fix_local[4] += 0.5 * qu * L + dq * L / 3.0
                elif hinge_i:
                    f_fix_local[1] += 3.0 * qu * L / 8.0 + dq * L / 10.0
                    f_fix_local[4] += 5.0 * qu * L / 8.0 + 2.0 * dq * L / 5.0
                    f_fix_local[5] += - qu * (L**2) / 8.0 - dq * (L**2) / 15.0
                elif hinge_j:
                    f_fix_local[1] += 5.0 * qu * L / 8.0 + 9.0 * dq * L / 40.0
                    f_fix_local[2] += qu * (L**2) / 8.0 + 7.0 * dq * L / 120.0
                    f_fix_local[4] += 3.0 * qu * L / 8.0 + 11.0 * dq * L / 40.0
                else:
                    # Fixed-Fixed
                    f_fix_local[1] += 0.5 * qu * L + 3.0 * dq * L / 20.0
                    f_fix_local[2] += qu * (L**2) / 12.0 + dq * (L**2) / 30.0
                    f_fix_local[4] += 0.5 * qu * L + 7.0 * dq * L / 20.0
                    f_fix_local[5] += - qu * (L**2) / 12.0 - dq * (L**2) / 20.0

            elif load_type == 'concentrated':
                P = float(ml.get('P', 0.0)) # transverse load
                a = float(ml.get('a', L / 2.0))
                b = L - a
                if 0 <= a <= L:
                    if hinge_i and hinge_j:
                        f_fix_local[1] += P * b / L
                        f_fix_local[4] += P * a / L
                    elif hinge_i:
                        f_fix_local[1] += (P * b / (2.0 * L**3)) * (3.0 * L**2 - b**2)
                        f_fix_local[4] += P - f_fix_local[1]
                        f_fix_local[5] += -P * a * b * (L + a) / (2.0 * L**2)
                    elif hinge_j:
                        f_fix_local[4] += (P * a / (2.0 * L**3)) * (3.0 * L**2 - a**2)
                        f_fix_local[1] += P - f_fix_local[4]
                        f_fix_local[2] += P * a * b * (L + b) / (2.0 * L**2)
                    else:
                        f_fix_local[1] += P * (b**2) * (3.0 * a + b) / (L**3)
                        f_fix_local[2] += P * a * (b**2) / (L**2)
                        f_fix_local[4] += P * (a**2) * (a + 3.0 * b) / (L**3)
                        f_fix_local[5] += -P * (a**2) * b / (L**2)

            # Store in member
            m_info['fixed_end_local'] += f_fix_local

            # Transform to global and subtract from F_global (nodal equivalent action)
            f_fix_global = m_info['T'].T @ f_fix_local
            for r in range(6):
                F_global[m_info['dofs'][r]] -= f_fix_global[r]

        # 3. Direct Nodal Loads
        for nl in nodal_loads:
            nid = nl.get('node_id')
            if nid in node_map:
                idx = node_map[nid]
                Fx = float(nl.get('Fx', nl.get('F_x', nl.get('fx', 0.0))))
                Fy = float(nl.get('Fy', nl.get('F_y', nl.get('fy', 0.0))))
                Mz = float(nl.get('Mz', nl.get('M_z', nl.get('mz', 0.0))))
                F_global[3 * idx] += Fx
                F_global[3 * idx + 1] += Fy
                F_global[3 * idx + 2] += Mz

        # 4. Boundary Conditions & Elastic Springs
        prescribed_dofs = []
        prescribed_vals = []

        for nid_key, sup in supports.items():
            try:
                nid = int(nid_key)
            except:
                nid = nid_key
            if nid not in node_map:
                continue
            idx = node_map[nid]

            # dx
            if sup.get('dx') is True or sup.get('type') in ('fixed', 'pinned', 'roller_dx', 'roller_wall'):
                prescribed_dofs.append(3 * idx)
                prescribed_vals.append(0.0)
            elif isinstance(sup.get('dx'), (int, float)) and sup.get('dx') > 0:
                # Translational spring Kx
                K_global[3 * idx, 3 * idx] += float(sup['dx'])
            elif isinstance(sup.get('kx'), (int, float)) and sup.get('kx') > 0:
                K_global[3 * idx, 3 * idx] += float(sup['kx'])

            # dy (support on horizontal ground restrains dy: roller_y, roller_dy, roller_x, roller)
            if sup.get('dy') is True or sup.get('type') in ('fixed', 'pinned', 'roller_y', 'roller_dy', 'roller_x', 'roller'):
                prescribed_dofs.append(3 * idx + 1)
                prescribed_vals.append(0.0)
            elif isinstance(sup.get('dy'), (int, float)) and sup.get('dy') > 0:
                # Translational spring Ky
                K_global[3 * idx + 1, 3 * idx + 1] += float(sup['dy'])
            elif isinstance(sup.get('ky'), (int, float)) and sup.get('ky') > 0:
                K_global[3 * idx + 1, 3 * idx + 1] += float(sup['ky'])

            # rz
            if sup.get('rz') is True or sup.get('type') == 'fixed':
                prescribed_dofs.append(3 * idx + 2)
                prescribed_vals.append(0.0)
            elif isinstance(sup.get('rz'), (int, float)) and sup.get('rz') > 0:
                # Rotational spring Ktheta
                K_global[3 * idx + 2, 3 * idx + 2] += float(sup['rz'])
            elif isinstance(sup.get('krot'), (int, float)) and sup.get('krot') > 0:
                K_global[3 * idx + 2, 3 * idx + 2] += float(sup['krot'])

        # Check for uncoupled rotational DOFs (e.g. truss nodes where all meeting members have hinges)
        for idx in range(num_nodes):
            rot_dof = 3 * idx + 2
            if rot_dof not in prescribed_dofs and abs(K_global[rot_dof, rot_dof]) < 1e-9:
                prescribed_dofs.append(rot_dof)
                prescribed_vals.append(0.0)

        prescribed_dofs = np.array(prescribed_dofs, dtype=int)
        prescribed_vals = np.array(prescribed_vals, dtype=float)

        all_dofs = np.arange(ndof)
        free_dofs = np.setdiff1d(all_dofs, prescribed_dofs)

        # 5. Solve Linear System
        U_global = np.zeros(ndof)
        if len(prescribed_dofs) > 0:
            U_global[prescribed_dofs] = prescribed_vals

        if len(free_dofs) > 0:
            K_ff = K_global[free_dofs, :][:, free_dofs]
            F_eff = F_global[free_dofs]
            if len(prescribed_dofs) > 0:
                F_eff -= K_global[free_dofs, :][:, prescribed_dofs] @ prescribed_vals

            # Condition check
            try:
                U_free = np.linalg.solve(K_ff, F_eff)
                U_global[free_dofs] = U_free
            except np.linalg.LinAlgError:
                return {'status': 'error', 'error': 'Estrutura hipostática ou instável (determinante nulo). Verifique os apoios.'}

        # 6. Support Reactions
        # R = K * U - F_ext_applied
        R_total = K_global @ U_global - F_global
        reactions_output = []
        reactions_dict = {}
        for nid_key in supports.keys():
            try:
                nid = int(nid_key)
            except:
                nid = nid_key
            if nid in node_map:
                idx = node_map[nid]
                rx = round(float(R_total[3 * idx]), 2)
                ry = round(float(R_total[3 * idx + 1]), 2)
                mz = round(float(R_total[3 * idx + 2]), 2)
                r_obj = {
                    'node_id': nid,
                    'R_x': rx,
                    'R_y': ry,
                    'M_z': mz,
                    'Rx': rx,
                    'Ry': ry,
                    'Mz': mz
                }
                reactions_output.append(r_obj)
                reactions_dict[nid] = r_obj

        # 7. Member Internal Force Distributions (N, V, M, Deflection)
        num_stations = 41
        member_results = []
        
        global_max_N = -1e9; global_min_N = 1e9
        global_max_V = -1e9; global_min_V = 1e9
        global_max_M = -1e9; global_min_M = 1e9
        global_max_disp = 0.0

        for m_info in member_details:
            mid = m_info['id']
            dofs = m_info['dofs']
            u_elem_glob = U_global[dofs]
            u_elem_local = m_info['T'] @ u_elem_glob

            # End forces in local coordinates: f_local = k_local * u_local + fixed_end_local
            f_end_local = m_info['k_local'] @ u_elem_local + m_info['fixed_end_local']

            # Station evaluation
            L = m_info['L']
            x_stations = np.linspace(0, L, num_stations)

            N_vals = []
            V_vals = []
            M_vals = []
            defl_vals = []

            # End forces:
            # f_end_local: [N_i, V_i, M_i, N_j, V_j, M_j]
            # Standard beam convention at station x:
            # N(x) = -N_i + integrated axial loads
            # V(x) = V_i - integrated transverse loads
            # M(x) = -M_i + V_i*x - integrated moments (Brazilian convention: positive on bottom tension fiber)

            # Find member loads applied to this element
            m_trans_loads = [ml for ml in member_loads if ml.get('member_id') == mid]

            N_start = -f_end_local[0]
            V_start = f_end_local[1]
            M_start = -f_end_local[2]

            for x in x_stations:
                # Accumulated load up to x
                cur_N = N_start
                cur_V = V_start
                cur_M = M_start + V_start * x

                for ml in m_trans_loads:
                    load_type = ml.get('type', 'uniform')
                    if load_type in ('uniform', 'trapezoidal'):
                        if 'q_y' in ml:
                            qy_val = - float(ml['q_y'])
                        else:
                            qy_val = float(ml.get('qy', ml.get('qy_i', 0.0)))
                        qy_i = float(ml.get('qy_i', qy_val))
                        qy_j = float(ml.get('qy_j', qy_i))

                        if 'q_x' in ml:
                            qx_val = float(ml['q_x'])
                        else:
                            qx_val = float(ml.get('qx', ml.get('qx_i', 0.0)))
                        qx_i = float(ml.get('qx_i', qx_val))
                        qx_j = float(ml.get('qx_j', qx_i))

                        if ml.get('coord_sys') == 'global':
                            QX_i = float(ml.get('QX_i', ml.get('QX', 0.0)))
                            QX_j = float(ml.get('QX_j', QX_i))
                            QY_i = float(ml.get('QY_i', ml.get('QY', 0.0)))
                            QY_j = float(ml.get('QY_j', QY_i))
                            qx_i = -QX_i * m_info['c'] - QY_i * m_info['s']
                            qx_j = -QX_j * m_info['c'] - QY_j * m_info['s']
                            qy_i = QX_i * m_info['s'] - QY_i * m_info['c']
                            qy_j = QX_j * m_info['s'] - QY_j * m_info['c']

                        dq_y = qy_j - qy_i
                        dq_x = qx_j - qx_i

                        cur_N -= (qx_i * x + 0.5 * dq_x / L * (x**2))
                        cur_V -= (qy_i * x + 0.5 * dq_y / L * (x**2))
                        cur_M -= (0.5 * qy_i * (x**2) + (dq_y / (6.0 * L)) * (x**3))
                    elif load_type == 'concentrated':
                        P = float(ml.get('P', 0.0))
                        a = float(ml.get('a', L / 2.0))
                        if x >= a:
                            cur_V -= P
                            cur_M -= P * (x - a)

                # Hermite interpolation for local deflection v(x)
                xi_bar = x / L
                N1 = 1.0 - 3.0*(xi_bar**2) + 2.0*(xi_bar**3)
                N2 = L * (xi_bar - 2.0*(xi_bar**2) + (xi_bar**3))
                N3 = 3.0*(xi_bar**2) - 2.0*(xi_bar**3)
                N4 = L * (-(xi_bar**2) + (xi_bar**3))

                v_local = N1 * u_elem_local[1] + N2 * u_elem_local[2] + N3 * u_elem_local[4] + N4 * u_elem_local[5]

                N_vals.append(float(cur_N))
                V_vals.append(float(cur_V))
                M_vals.append(float(cur_M))
                defl_vals.append(float(v_local))

            m_max_N = max(N_vals); m_min_N = min(N_vals)
            m_max_V = max(V_vals); m_min_V = min(V_vals)
            m_max_M = max(M_vals); m_min_M = min(M_vals)

            global_max_N = max(global_max_N, m_max_N); global_min_N = min(global_min_N, m_min_N)
            global_max_V = max(global_max_V, m_max_V); global_min_V = min(global_min_V, m_min_V)
            global_max_M = max(global_max_M, m_max_M); global_min_M = min(global_min_M, m_min_M)
            for v_d in defl_vals:
                global_max_disp = max(global_max_disp, abs(v_d))

            peak_M = m_max_M if abs(m_max_M) >= abs(m_min_M) else m_min_M
            peak_V = m_max_V if abs(m_max_V) >= abs(m_min_V) else m_min_V
            peak_N = N_vals[0] if len(N_vals) > 0 else 0.0

            member_results.append({
                'member_id': mid,
                'node_i': m_info['node_i'],
                'node_j': m_info['node_j'],
                'length': round(L, 3),
                'stations': [round(x, 2) for x in x_stations],
                'x_points': [round(x, 2) for x in x_stations],
                'N': [round(v, 2) for v in N_vals],
                'N_values': [round(v, 2) for v in N_vals],
                'V': [round(v, 2) for v in V_vals],
                'V_values': [round(v, 2) for v in V_vals],
                'M': [round(v, 2) for v in M_vals],
                'M_values': [round(v, 2) for v in M_vals],
                'deflection': [round(v, 5) for v in defl_vals],
                'deflection_values': [round(v, 5) for v in defl_vals],
                'N_axial': round(peak_N, 2),
                'M_max': round(peak_M, 2),
                'V_max': round(peak_V, 2),
                'max_N': round(m_max_N, 2),
                'min_N': round(m_min_N, 2),
                'max_V': round(m_max_V, 2),
                'min_V': round(m_min_V, 2),
                'max_M': round(m_max_M, 2),
                'min_M': round(m_min_M, 2)
            })

        # Displacements list and dictionary
        displacements_output = []
        displacements_dict = {}
        for idx, n in enumerate(nodes):
            nid = n.get('id', idx + 1)
            ux = float(U_global[3 * idx])
            uy = float(U_global[3 * idx + 1])
            rz = float(U_global[3 * idx + 2])
            utot = math.hypot(ux, uy)
            global_max_disp = max(global_max_disp, utot)
            d_obj = {
                'node_id': nid,
                'u_x': round(ux, 6),
                'u_y': round(uy, 6),
                'rot_z': round(rz, 6),
                'ux': round(ux, 6),
                'uy': round(uy, 6),
                'rz': round(rz, 6),
                'u_mag': round(utot, 6),
                'utot': round(utot, 6)
            }
            displacements_output.append(d_obj)
            displacements_dict[nid] = d_obj

        return {
            'status': 'success',
            'summary': {
                'num_nodes': num_nodes,
                'num_members': len(members),
                'max_disp': round(global_max_disp, 5), # m
                'extrema': {
                    'max_N': round(global_max_N, 2),
                    'min_N': round(global_min_N, 2),
                    'max_V': round(global_max_V, 2),
                    'min_V': round(global_min_V, 2),
                    'max_M': round(global_max_M, 2),
                    'min_M': round(global_min_M, 2)
                }
            },
            'displacements': NodeResultCollection(displacements_output, key='node_id'),
            'displacements_by_node': displacements_dict,
            'reactions': NodeResultCollection(reactions_output, key='node_id'),
            'reactions_by_node': reactions_dict,
            'members': member_results
        }

    except Exception as e:
        import traceback
        return {'status': 'error', 'error': str(e), 'trace': traceback.format_exc()}
