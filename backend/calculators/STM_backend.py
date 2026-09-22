"""
3D Strut-and-Tie Model (STM) Solver and Optimization Engine
Conforme ABNT NBR 6118:2023 (Item 22) e ACI 318-19 (Capítulo 23)
Unidades Métricas: kN, cm, cm², kN/cm²
"""

import numpy as np
import math
import copy
import scipy.optimize as opt


def solve_truss_system(data):
    """
    Solves a 2D or 3D Strut-and-Tie model using the Direct Stiffness Method.
    Supports metric units (kN, cm).
    Calculates member axial forces, strain energy, and required steel/concrete areas.
    """
    nodes = data.get('nodes', [])
    members = data.get('members', [])
    
    if not nodes or not members:
        return {'error': 'Nenhum nó ou barra foi fornecido.'}
    
    # Constants (consistent metric units: kN, cm)
    E_CONCRETE = 3000.0  # kN/cm² (~30 GPa)
    E_STEEL = 21000.0    # kN/cm² (~210 GPa)
    FYD_STEEL = 43.48    # kN/cm² (CA-50: 50 / 1.15)
    FCD1_CONCRETE = 1.52 # kN/cm² (fck=25: 0.85 * (1 - 25/250) * 2.5/1.4)
    AREA_DUMMY = 50.0    # cm²
    DOF_PER_NODE = 3
    
    # Map node IDs to indices (0, 1, 2...)
    node_idx = {n['id']: i for i, n in enumerate(nodes)}
    num_nodes = len(nodes)
    total_dof = num_nodes * DOF_PER_NODE
    
    # Initialize Global Stiffness Matrix (K) and Force Vector (F)
    K = np.zeros((total_dof, total_dof))
    F = np.zeros(total_dof)
    
    # 1. Assemble Force Vector (Fx, Fy, Fz)
    for i, n in enumerate(nodes):
        fx = float(n.get('loadX', 0) or n.get('fx', 0) or 0)
        fy = float(n.get('loadY', 0) or n.get('load', 0) or n.get('fy', 0) or 0)
        fz = float(n.get('loadZ', 0) or n.get('fz', 0) or 0)
        F[i * 3 + 0] += fx
        F[i * 3 + 1] += fy
        F[i * 3 + 2] += fz

    # 2. Assemble Stiffness Matrix
    for m in members:
        idx_i = node_idx.get(m['start'])
        idx_j = node_idx.get(m['end'])
        
        if idx_i is None or idx_j is None:
            continue
            
        n1 = nodes[idx_i]
        n2 = nodes[idx_j]
        
        # Calculate Length and Direction Cosines
        dx = float(n2['x'] - n1['x'])
        dy = float(n2['y'] - n1['y'])
        dz = float(n2.get('z', 0) - n1.get('z', 0))
        L = math.sqrt(dx**2 + dy**2 + dz**2)
        
        if L <= 1e-6:
            continue
            
        cx = dx / L
        cy = dy / L
        cz = dz / L
        
        # Element Stiffness (k = EA/L)
        E = E_STEEL if m.get('type') == 'tie' else E_CONCRETE
        k_val = (E * AREA_DUMMY) / L
        
        # Transformation Vector
        T = np.array([cx, cy, cz])
        
        # Build 3x3 Submatrix: k * (T column * T row)
        K_sub = k_val * np.outer(T, T)
        
        # Global Indices
        dof_i = slice(idx_i * 3, idx_i * 3 + 3)
        dof_j = slice(idx_j * 3, idx_j * 3 + 3)
        
        # Add contributions to global K
        K[dof_i, dof_i] += K_sub
        K[dof_j, dof_j] += K_sub
        K[dof_i, dof_j] -= K_sub
        K[dof_j, dof_i] -= K_sub

    # 3. Apply Boundary Conditions (Penalty Method with Selective DOF support)
    penalty = 1.0e15
    for i, n in enumerate(nodes):
        idx = i * 3
        fix_all = n.get('fixed', False)
        if fix_all or n.get('fixedX', False):
            K[idx + 0, idx + 0] += penalty
        if fix_all or n.get('fixedY', False):
            K[idx + 1, idx + 1] += penalty
        if fix_all or n.get('fixedZ', False):
            K[idx + 2, idx + 2] += penalty

    # 3.5 Auto-stabilize unconstrained zero-stiffness DOFs (e.g. planar models in Z)
    for i in range(total_dof):
        if abs(K[i, i]) < 1e-4: 
            if abs(F[i]) > 1e-3:
                dof_names = ['X', 'Y', 'Z']
                return {'error': f'Estrutura instável ou hipostática no Nó {int(i/3)+1} ({dof_names[i%3]}). Adicione vínculos.'}
            else:
                K[i, i] += penalty

    # 4. Solve Linear System
    try:
        u = np.linalg.solve(K, F)
    except np.linalg.LinAlgError:
        return {'error': 'Estrutura instável (matriz de rigidez singular). Verifique as vinculações e geometria.'}

    # 5. Post-Process Member Forces & Design Quantities
    results = []
    warnings = []
    node_connections = {nid: [] for nid in node_idx}

    max_compression = 0.0
    max_tension = 0.0
    total_strain_energy = 0.0
    total_tie_volume = 0.0
    total_strut_volume = 0.0

    for idx, m in enumerate(members):
        idx_i = node_idx[m['start']]
        idx_j = node_idx[m['end']]
        
        n1 = nodes[idx_i]
        n2 = nodes[idx_j]
        
        dx = float(n2['x'] - n1['x'])
        dy = float(n2['y'] - n1['y'])
        dz = float(n2.get('z', 0) - n1.get('z', 0))
        L = math.sqrt(dx**2 + dy**2 + dz**2)
        
        if L <= 1e-6:
            cx, cy, cz = 0.0, 0.0, 0.0
        else:
            cx, cy, cz = dx/L, dy/L, dz/L
        
        vec = np.array([cx, cy, cz])
        node_connections[m['start']].append({'neighbor': m['end'], 'type': m.get('type', 'strut'), 'vec': vec})
        node_connections[m['end']].append({'neighbor': m['start'], 'type': m.get('type', 'strut'), 'vec': -vec})

        # Nodal displacements
        u_i = u[idx_i*3 : idx_i*3+3]
        u_j = u[idx_j*3 : idx_j*3+3]
        
        delta = (u_j[0] - u_i[0])*cx + (u_j[1] - u_i[1])*cy + (u_j[2] - u_i[2])*cz
        is_tie = m.get('type') == 'tie'
        E = E_STEEL if is_tie else E_CONCRETE
        force_raw = (E * AREA_DUMMY / L) * delta
        force_rounded = round(float(force_raw), 2)
        
        if force_raw < 0:
            max_compression = max(max_compression, abs(force_raw))
        else:
            max_tension = max(max_tension, force_raw)

        # Strain Energy (W = F^2 * L / (2 * E * A))
        strain_energy = (force_raw**2 * L) / (2.0 * E * AREA_DUMMY)
        total_strain_energy += strain_energy

        # Design sizing per NBR 6118
        if is_tie:
            as_req = abs(force_raw) / FYD_STEEL
            ac_req = 0.0
            total_tie_volume += as_req * L
        else:
            as_req = 0.0
            ac_req = abs(force_raw) / FCD1_CONCRETE
            total_strut_volume += ac_req * L

        results.append({
            'id': idx + 1,
            'type': m.get('type', 'strut'),
            'length': round(L, 2),
            'force': force_rounded, 
            'force_raw': force_raw,
            'stress_nature': 'Compressão (Biela)' if force_raw < -0.05 else ('Tração (Tirante)' if force_raw > 0.05 else 'Nulo'),
            'as_req_cm2': round(as_req, 2) if is_tie else 0.0,
            'ac_req_cm2': round(ac_req, 2) if not is_tie else 0.0,
            'strain_energy_kNcm': round(strain_energy, 3),
            'start_node': m['start'],
            'end_node': m['end']
        })

    # 6. Check Angles (NBR 6118 / ACI 318: Theta between Strut and Tie >= 25 deg)
    min_angle = 90.0
    for nid, conns in node_connections.items():
        for i in range(len(conns)):
            for j in range(i + 1, len(conns)):
                c1 = conns[i]
                c2 = conns[j]
                
                if (c1['type'] == 'strut' and c2['type'] == 'tie') or \
                   (c1['type'] == 'tie' and c2['type'] == 'strut'):
                    
                    dot_prod = np.dot(c1['vec'], c2['vec'])
                    dot_prod = max(-1.0, min(1.0, dot_prod))
                    angle_deg = math.degrees(math.acos(dot_prod))
                    if angle_deg < min_angle:
                        min_angle = angle_deg
                    
                    if angle_deg < 25.0:
                        warnings.append(f"Aviso no Nó {nid}: Ângulo entre biela e tirante é {angle_deg:.1f}° (mínimo normativo NBR 6118 é 25°).")

    return {
        'results': results,
        'warnings': warnings,
        'summary': {
            'max_compression_kN': round(max_compression, 2),
            'max_tension_kN': round(max_tension, 2),
            'min_angle_deg': round(min_angle, 1) if min_angle < 90.0 else 0.0,
            'angle_check_pass': (min_angle >= 25.0) or (len(results) == 0),
            'total_strain_energy_kNcm': round(total_strain_energy, 2),
            'total_tie_volume_cm3': round(total_tie_volume, 2),
            'total_tie_weight_kg': round(total_tie_volume * 0.00785, 2),
            'total_strut_volume_cm3': round(total_strut_volume, 2)
        }
    }


def generate_template(template_type, geometry):
    """
    Generates Strut-and-Tie models (2D and full 3D) based on geometry (cm).
    Supports:
      - 'deep-beam': Viga Parede Biapoiada (2D)
      - 'corbel': Consolo Curto Monaxial (2D)
      - 'pile-cap': Bloco sobre 2 Estacas (2D)
      - 'pile-cap-3d-3piles': Bloco sobre 3 Estacas Espacial (3D)
      - 'pile-cap-3d-4piles': Bloco sobre 4 Estacas Espacial (3D)
      - 'corbel-3d': Consolo Espacial Biaxial 3D
    """
    nodes = []
    members = []
    
    L = float(geometry.get('L', 200.0))
    H = float(geometry.get('H', 100.0))
    B = float(geometry.get('B', 20.0))

    if template_type == 'deep-beam':
        # Viga Parede Biapoiada com Carga Pontual no Vão Central (2D)
        # Apoio Fixo no Nó 1 (restringe X, Y, Z) e Apoio Móvel/Rolete no Nó 2 (restringe Y, Z) para permitir tração no tirante
        inset = max(15.0, L * 0.1)
        h_eff = H * 0.85
        
        nodes.append({'id': 1, 'x': round(inset, 1), 'y': 0.0, 'z': 0.0, 'fixedX': True, 'fixedY': True, 'fixedZ': True, 'load': 0})
        nodes.append({'id': 2, 'x': round(L - inset, 1), 'y': 0.0, 'z': 0.0, 'fixedX': False, 'fixedY': True, 'fixedZ': True, 'load': 0})
        nodes.append({'id': 3, 'x': round(L / 2.0, 1), 'y': round(h_eff, 1), 'z': 0.0, 'fixed': False, 'load': -250})
        
        members.append({'start': 1, 'end': 3, 'type': 'strut'})
        members.append({'start': 2, 'end': 3, 'type': 'strut'})
        members.append({'start': 1, 'end': 2, 'type': 'tie'})

    elif template_type == 'corbel':
        # Consolo Curto Uniaxial (2D - NBR 6118)
        a = max(20.0, L * 0.6)
        d = H * 0.85
        
        nodes.append({'id': 1, 'x': 0.0, 'y': 0.0, 'z': 0.0, 'fixed': True, 'load': 0})
        nodes.append({'id': 2, 'x': round(a, 1), 'y': round(d, 1), 'z': 0.0, 'fixed': False, 'load': -180})
        nodes.append({'id': 3, 'x': 0.0, 'y': round(d, 1), 'z': 0.0, 'fixed': True, 'load': 0})
        
        members.append({'start': 2, 'end': 1, 'type': 'strut'})
        members.append({'start': 3, 'end': 2, 'type': 'tie'})

    elif template_type == 'pile-cap':
        # Bloco de Coroamento sobre 2 Estacas (2D)
        dist_estacas = L * 0.7
        x_est1 = (L - dist_estacas) / 2.0
        x_est2 = x_est1 + dist_estacas
        h_eff = H * 0.85
        
        nodes.append({'id': 1, 'x': round(x_est1, 1), 'y': 0.0, 'z': 0.0, 'fixedX': True, 'fixedY': True, 'fixedZ': True, 'load': 0})
        nodes.append({'id': 2, 'x': round(x_est2, 1), 'y': 0.0, 'z': 0.0, 'fixedX': False, 'fixedY': True, 'fixedZ': True, 'load': 0})
        nodes.append({'id': 3, 'x': round(L / 2.0, 1), 'y': round(h_eff, 1), 'z': 0.0, 'fixed': False, 'load': -400})
        
        members.append({'start': 1, 'end': 3, 'type': 'strut'})
        members.append({'start': 2, 'end': 3, 'type': 'strut'})
        members.append({'start': 1, 'end': 2, 'type': 'tie'})

    elif template_type == 'pile-cap-3d-3piles':
        # Bloco Triangular sobre 3 Estacas 3D (Spatial Tetrahedral STM)
        h_eff = H * 0.85
        R = min(L, B) * 0.38 # Raio das estacas a partir do centroide
        cx = L / 2.0
        cz = B / 2.0
        
        # 3 Estacas a 120 graus na base (y=0)
        p1_x = round(cx, 1)
        p1_z = round(cz + R, 1)
        p2_x = round(cx + R * math.cos(math.radians(30)), 1)
        p2_z = round(cz - R * math.sin(math.radians(30)), 1)
        p3_x = round(cx - R * math.cos(math.radians(30)), 1)
        p3_z = round(cz - R * math.sin(math.radians(30)), 1)
        
        # Estacas (apoios verticais com estanqueidade cinemática)
        nodes.append({'id': 1, 'x': p1_x, 'y': 0.0, 'z': p1_z, 'fixedX': True, 'fixedY': True, 'fixedZ': True, 'load': 0})
        nodes.append({'id': 2, 'x': p2_x, 'y': 0.0, 'z': p2_z, 'fixedY': True, 'load': 0})
        nodes.append({'id': 3, 'x': p3_x, 'y': 0.0, 'z': p3_z, 'fixedX': True, 'fixedY': True, 'load': 0})
        
        # Pilar central no topo
        nodes.append({'id': 4, 'x': round(cx, 1), 'y': round(h_eff, 1), 'z': round(cz, 1), 'fixed': False, 'load': -600})
        
        # 3 Bielas espaciais 3D
        members.append({'start': 1, 'end': 4, 'type': 'strut'})
        members.append({'start': 2, 'end': 4, 'type': 'strut'})
        members.append({'start': 3, 'end': 4, 'type': 'strut'})
        
        # Anel triangular de tirantes na base
        members.append({'start': 1, 'end': 2, 'type': 'tie'})
        members.append({'start': 2, 'end': 3, 'type': 'tie'})
        members.append({'start': 3, 'end': 1, 'type': 'tie'})

    elif template_type == 'pile-cap-3d-4piles':
        # Bloco Retangular sobre 4 Estacas 3D (Spatial Pyramidal STM)
        h_eff = H * 0.85
        dx = L * 0.35
        dz = B * 0.35
        cx = L / 2.0
        cz = B / 2.0
        
        x1, x2 = round(cx - dx, 1), round(cx + dx, 1)
        z1, z2 = round(cz - dz, 1), round(cz + dz, 1)
        
        # 4 Estacas nos 4 cantos da base
        nodes.append({'id': 1, 'x': x1, 'y': 0.0, 'z': z1, 'fixedX': True, 'fixedY': True, 'fixedZ': True, 'load': 0})
        nodes.append({'id': 2, 'x': x2, 'y': 0.0, 'z': z1, 'fixedY': True, 'fixedZ': True, 'load': 0})
        nodes.append({'id': 3, 'x': x2, 'y': 0.0, 'z': z2, 'fixedY': True, 'load': 0})
        nodes.append({'id': 4, 'x': x1, 'y': 0.0, 'z': z2, 'fixedX': True, 'fixedY': True, 'load': 0})
        
        # Pilar central no topo
        nodes.append({'id': 5, 'x': round(cx, 1), 'y': round(h_eff, 1), 'z': round(cz, 1), 'fixed': False, 'load': -800})
        
        # 4 Bielas 3D espaciais convergindo ao pilar
        members.append({'start': 1, 'end': 5, 'type': 'strut'})
        members.append({'start': 2, 'end': 5, 'type': 'strut'})
        members.append({'start': 3, 'end': 5, 'type': 'strut'})
        members.append({'start': 4, 'end': 5, 'type': 'strut'})
        
        # Tirantes perimetrais de base
        members.append({'start': 1, 'end': 2, 'type': 'tie'})
        members.append({'start': 2, 'end': 3, 'type': 'tie'})
        members.append({'start': 3, 'end': 4, 'type': 'tie'})
        members.append({'start': 4, 'end': 1, 'type': 'tie'})

    elif template_type == 'corbel-3d':
        # Consolo Espacial 3D com Ação Biaxial (Carga Vertical + Forças Horizontais X e Z)
        d = H * 0.85
        a = L * 0.65
        cz = B / 2.0
        z1 = round(max(5.0, B * 0.2), 1)
        z2 = round(min(B - 5.0, B * 0.8), 1)
        
        # 4 Nós de ancoragem no pilar de apoio (fixados)
        nodes.append({'id': 1, 'x': 0.0, 'y': 0.0, 'z': z1, 'fixed': True, 'load': 0})
        nodes.append({'id': 2, 'x': 0.0, 'y': 0.0, 'z': z2, 'fixed': True, 'load': 0})
        nodes.append({'id': 3, 'x': 0.0, 'y': round(d, 1), 'z': z1, 'fixed': True, 'load': 0})
        nodes.append({'id': 4, 'x': 0.0, 'y': round(d, 1), 'z': z2, 'fixed': True, 'load': 0})
        
        # Nó de carga espacial 3D na placa de apoio do consolo
        nodes.append({
            'id': 5, 
            'x': round(a, 1), 
            'y': round(d, 1), 
            'z': round(cz, 1), 
            'fixed': False, 
            'fx': 40.0, 
            'fy': -200.0, 
            'fz': 25.0,
            'load': -200.0
        })
        
        # Bielas espaciais comprimidas (para nós inferiores 1 e 2)
        members.append({'start': 1, 'end': 5, 'type': 'strut'})
        members.append({'start': 2, 'end': 5, 'type': 'strut'})
        
        # Tirantes espaciais tracionados (para nós superiores 3 e 4)
        members.append({'start': 3, 'end': 5, 'type': 'tie'})
        members.append({'start': 4, 'end': 5, 'type': 'tie'})

    return {'nodes': nodes, 'members': members}


def optimize_stm_geometry(data):
    """
    Optimizes Strut-and-Tie node positions based on the Principle of Minimum Strain Energy (Schlaich et al.)
    or Minimum Tie Steel Volume, subject to NBR 6118 / ACI 318 geometric and angle constraints (theta >= 25 deg).
    """
    nodes = data.get('nodes', [])
    members = data.get('members', [])
    geom = data.get('geometry', {'L': 200, 'H': 100, 'B': 50})
    
    if not nodes or not members:
        return {'error': 'Dados insuficientes para otimização.'}
        
    L = float(geom.get('L', 200.0))
    H = float(geom.get('H', 100.0))
    B = float(geom.get('B', 50.0))
    
    objective_type = data.get('objective', 'strain_energy') # 'strain_energy' or 'tie_volume'
    target_min_angle = float(data.get('min_angle', 25.0))
    cover = float(data.get('cover', 5.0))
    
    # 1. Baseline analysis (before optimization)
    initial_res = solve_truss_system({'nodes': nodes, 'members': members})
    if 'error' in initial_res:
        return {'error': f"Modelo inicial inválido: {initial_res['error']}"}
        
    init_summary = initial_res['summary']
    
    # 2. Identify Movable Nodes
    specified_movable = data.get('movable_nodes', [])
    movable_node_ids = []
    
    if specified_movable:
        movable_node_ids = [nid for nid in specified_movable if any(n['id'] == nid for n in nodes)]
    else:
        # Auto-detect: nodes that are not fully fixed supports
        for n in nodes:
            is_support = n.get('fixed', False) or (n.get('fixedX', False) and n.get('fixedY', False) and n.get('fixedZ', False))
            if not is_support:
                movable_node_ids.append(n['id'])
                
    if not movable_node_ids:
        for n in nodes:
            if n.get('load', 0) != 0 or n.get('fy', 0) != 0 or n.get('fx', 0) != 0 or n.get('fz', 0) != 0:
                movable_node_ids.append(n['id'])
                
    if not movable_node_ids:
        return {'error': 'Nenhum nó móvel disponível para otimização. Defina nós internos ou não-apoiados.'}

    # Detect if model is 2D planar in Z
    all_z = [float(n.get('z', 0.0)) for n in nodes]
    is_planar_z = (max(all_z) - min(all_z) < 1e-4)

    # 3. Vector of Parameters and Bounds
    p0 = []
    bounds = []
    
    for nid in movable_node_ids:
        node = next(n for n in nodes if n['id'] == nid)
        x0 = float(node['x'])
        y0 = float(node['y'])
        z0 = float(node.get('z', 0.0))
        p0.extend([x0, y0, z0])
        
        has_load = (node.get('load', 0) != 0 or node.get('fy', 0) != 0 or node.get('fx', 0) != 0 or node.get('fz', 0) != 0)
        
        # If node has applied structural load, keep (X, Z) at load centroid unless explicit shift allowed
        if has_load and not data.get('allow_load_shift', False):
            min_x, max_x = x0, x0
        else:
            min_x = min(x0, cover)
            max_x = max(x0, max(cover + 5.0, L - cover))
            
        min_y = min(y0, cover)
        max_y = max(y0, max(cover + 5.0, H - cover))
        
        if is_planar_z or (has_load and not data.get('allow_load_shift', False)):
            min_z, max_z = z0, z0
        else:
            min_z = min(z0, cover)
            max_z = max(z0, max(cover + 5.0, B - cover))
        
        bounds.append((min_x, max_x))
        bounds.append((min_y, max_y))
        bounds.append((min_z, max_z))

    # 4. Objective Function
    def cost_function(p):
        curr_nodes = copy.deepcopy(nodes)
        for idx, nid in enumerate(movable_node_ids):
            c_node = next(n for n in curr_nodes if n['id'] == nid)
            c_node['x'] = float(p[idx * 3 + 0])
            c_node['y'] = float(p[idx * 3 + 1])
            c_node['z'] = float(p[idx * 3 + 2])
            
        res = solve_truss_system({'nodes': curr_nodes, 'members': members})
        if 'error' in res:
            return 1e8
            
        summary = res['summary']
        
        if objective_type == 'tie_volume':
            base_cost = summary.get('total_tie_volume_cm3', 0.0)
        else:
            base_cost = summary.get('total_strain_energy_kNcm', 0.0)
            
        # Angle constraint penalty
        min_ang = summary.get('min_angle_deg', 90.0)
        penalty = 0.0
        if min_ang < target_min_angle:
            penalty = 5000.0 * (target_min_angle - min_ang)**2
            
        return base_cost + penalty

    # 5. Run Optimization
    # Use SLSQP with coarse finite-difference step (eps=0.2 cm), with Nelder-Mead fallback
    opt_result = opt.minimize(cost_function, p0, bounds=bounds, method='SLSQP', options={'eps': 0.2, 'maxiter': 150})
    
    if not opt_result.success or cost_function(opt_result.x) > cost_function(p0):
        # Nelder-Mead fallback
        opt_result = opt.minimize(cost_function, p0, bounds=bounds, method='Nelder-Mead', options={'maxiter': 250})

    best_p = opt_result.x if cost_function(opt_result.x) <= cost_function(p0) else p0
    
    # 6. Build Final Optimized Model
    optimized_nodes = copy.deepcopy(nodes)
    for idx, nid in enumerate(movable_node_ids):
        o_node = next(n for n in optimized_nodes if n['id'] == nid)
        o_node['x'] = round(float(best_p[idx * 3 + 0]), 1)
        o_node['y'] = round(float(best_p[idx * 3 + 1]), 1)
        o_node['z'] = round(float(best_p[idx * 3 + 2]), 1)

    final_res = solve_truss_system({'nodes': optimized_nodes, 'members': members})
    if 'error' in final_res:
        return {'error': f"Falha ao solucionar treliça otimizada: {final_res['error']}"}
        
    final_summary = final_res['summary']
    
    # Calculate Reductions
    init_energy = init_summary.get('total_strain_energy_kNcm', 1.0)
    final_energy = final_summary.get('total_strain_energy_kNcm', 1.0)
    energy_reduction_pct = max(0.0, round(((init_energy - final_energy) / max(0.01, init_energy)) * 100.0, 1))

    init_tie_vol = init_summary.get('total_tie_volume_cm3', 1.0)
    final_tie_vol = final_summary.get('total_tie_volume_cm3', 1.0)
    tie_reduction_pct = max(0.0, round(((init_tie_vol - final_tie_vol) / max(0.01, init_tie_vol)) * 100.0, 1))

    return {
        'success': True,
        'objective': objective_type,
        'initial': {
            'strain_energy_kNcm': init_energy,
            'tie_volume_cm3': init_tie_vol,
            'tie_weight_kg': init_summary.get('total_tie_weight_kg', 0.0),
            'min_angle_deg': init_summary.get('min_angle_deg', 0.0),
            'max_compression_kN': init_summary.get('max_compression_kN', 0.0),
            'max_tension_kN': init_summary.get('max_tension_kN', 0.0),
            'angle_check_pass': init_summary.get('angle_check_pass', True)
        },
        'optimized': {
            'nodes': optimized_nodes,
            'results': final_res.get('results', []),
            'warnings': final_res.get('warnings', []),
            'summary': final_summary,
            'strain_energy_kNcm': final_energy,
            'tie_volume_cm3': final_tie_vol,
            'tie_weight_kg': final_summary.get('total_tie_weight_kg', 0.0),
            'min_angle_deg': final_summary.get('min_angle_deg', 0.0),
            'max_compression_kN': final_summary.get('max_compression_kN', 0.0),
            'max_tension_kN': final_summary.get('max_tension_kN', 0.0),
            'angle_check_pass': final_summary.get('angle_check_pass', True),
            'energy_reduction_pct': energy_reduction_pct,
            'tie_reduction_pct': tie_reduction_pct
        },
        'message': f"Otimização concluída com sucesso! Redução de {energy_reduction_pct}% no trabalho de deformação e ângulo mínimo de {final_summary.get('min_angle_deg', 0.0)}°."
    }
