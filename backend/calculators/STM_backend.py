import numpy as np
import math

def solve_truss_system(data):
    """
    Solves a 3D Strut and Tie model using the Direct Stiffness Method.
    Uses NumPy for matrix operations.
    """
    nodes = data.get('nodes', [])
    members = data.get('members', [])
    
    if not nodes or not members:
        return {'error': 'No nodes or members provided'}
    
    # Constants
    E_CONCRETE = 3600.0  # ksi
    E_STEEL = 29000.0    # ksi
    AREA_DUMMY = 10.0    # in^2 (Arbitrary area for force resolution)
    DOF_PER_NODE = 3
    
    # Map node IDs to indices (0, 1, 2...)
    node_idx = {n['id']: i for i, n in enumerate(nodes)}
    num_nodes = len(nodes)
    total_dof = num_nodes * DOF_PER_NODE
    
    # Initialize Global Stiffness Matrix (K) and Force Vector (F)
    K = np.zeros((total_dof, total_dof))
    F = np.zeros(total_dof)
    
    # 1. Assemble Force Vector
    for i, n in enumerate(nodes):
        # Load applied in Y direction (DOF index 1)
        if 'load' in n and n['load'] != 0:
            F[i * 3 + 1] += float(n['load'])

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
        dz = float(n2['z'] - n1['z'])
        L = math.sqrt(dx**2 + dy**2 + dz**2)
        
        if L == 0:
            continue
            
        cx = dx / L
        cy = dy / L
        cz = dz / L
        
        # Element Stiffness (k = EA/L) - Convert L to inches
        E = E_STEEL if m['type'] == 'tie' else E_CONCRETE
        k_val = (E * AREA_DUMMY) / (L * 12.0)
        
        # Transformation Vector
        T = np.array([cx, cy, cz])
        
        # Build 3x3 Submatrix: k * (T column * T row)
        T_col = T.reshape(3, 1)
        T_row = T.reshape(1, 3)
        K_sub = k_val * (T_col @ T_row)
        
        # Global Indices
        dof_i = slice(idx_i * 3, idx_i * 3 + 3)
        dof_j = slice(idx_j * 3, idx_j * 3 + 3)
        
        # Add contributions to global K
        K[dof_i, dof_i] += K_sub
        K[dof_j, dof_j] += K_sub
        K[dof_i, dof_j] -= K_sub
        K[dof_j, dof_i] -= K_sub

    # 3. Apply Boundary Conditions (Penalty Method)
    # Adding a large stiffness to diagonal elements for fixed DOFs
    penalty = 1.0e15
    for i, n in enumerate(nodes):
        if n.get('fixed', False):
            idx = i * 3
            # Fix X, Y, Z translation
            K[idx, idx] += penalty
            K[idx + 1, idx + 1] += penalty
            K[idx + 2, idx + 2] += penalty

    # 3.5 Auto-stabilize unconstrained DOFs (e.g., Z-direction in 2D trusses)
    # If a DOF has 0 stiffness (Kii approx 0), it's a mechanism. 
    # If loaded -> Unstable. If unloaded -> Can be fixed (ignored).
    for i in range(total_dof):
        if abs(K[i, i]) < 1e-3: 
            if abs(F[i]) > 1e-3: # Has significant load
                dof_names = ['X', 'Y', 'Z']
                return {'error': f'Structure is unstable at Node {int(i/3)+1} ({dof_names[i%3]}). Unconstrained DOF has load.'}
            else:
                # No load -> Fix it to prevent singularity
                K[i, i] += penalty

    # 4. Solve Linear System
    try:
        u = np.linalg.solve(K, F)
    except np.linalg.LinAlgError:
        return {'error': 'Structure is unstable (singular stiffness matrix). Check constraints.'}


    # 5. Post-Process Member Forces
    results = []
    warnings = []
    
    # Track node connections to calculate angles
    node_connections = {nid: [] for nid in node_idx} # {node_id: [(neighbor_id, member_type, vector)]}

    for idx, m in enumerate(members):
        idx_i = node_idx[m['start']]
        idx_j = node_idx[m['end']]
        
        n1 = nodes[idx_i]
        n2 = nodes[idx_j]
        
        dx = float(n2['x'] - n1['x'])
        dy = float(n2['y'] - n1['y'])
        dz = float(n2['z'] - n1['z'])
        L = math.sqrt(dx**2 + dy**2 + dz**2)
        
        if L == 0:
            cx, cy, cz = 0, 0, 0
        else:
            cx, cy, cz = dx/L, dy/L, dz/L
        
        # Store connection vectors for angle checks
        vec = np.array([cx, cy, cz])
        node_connections[m['start']].append({'neighbor': m['end'], 'type': m['type'], 'vec': vec})
        node_connections[m['end']].append({'neighbor': m['start'], 'type': m['type'], 'vec': -vec})

        # Get nodal displacements
        u_i = u[idx_i*3 : idx_i*3+3]
        u_j = u[idx_j*3 : idx_j*3+3]
        
        # Axial Deformation (delta = projection of relative disp onto member axis)
        delta = (u_j[0] - u_i[0])*cx + (u_j[1] - u_i[1])*cy + (u_j[2] - u_i[2])*cz
        
        # Calculate Force = (EA/L) * delta
        # Positive = Tension, Negative = Compression
        E = E_STEEL if m['type'] == 'tie' else E_CONCRETE
        force = (E * AREA_DUMMY * delta) / (L * 12.0)
        
        results.append({
            'id': idx + 1,
            'type': m['type'],
            'length': round(L, 3),
            'force': round(force, 3), 
            'start_node': m['start'],
            'end_node': m['end']
        })

    # 6. Check Angles (ACI 318 requirement: Angle between Strut and Tie >= 25 deg)
    for nid, conns in node_connections.items():
        for i in range(len(conns)):
            for j in range(i + 1, len(conns)):
                c1 = conns[i]
                c2 = conns[j]
                
                # Check angle between Strut and Tie
                if (c1['type'] == 'strut' and c2['type'] == 'tie') or \
                   (c1['type'] == 'tie' and c2['type'] == 'strut'):
                    
                    dot_prod = np.dot(c1['vec'], c2['vec'])
                    # Clip for numerical stability
                    dot_prod = max(-1.0, min(1.0, dot_prod))
                    angle_rad = math.acos(dot_prod)
                    angle_deg = math.degrees(angle_rad)
                    
                    if angle_deg < 25.0:
                        warnings.append(f"Angle Check Warning at Node {nid}: Angle between Member {c1['type']} and {c2['type']} is {angle_deg:.1f}° (< 25° minimum).")

    # Add warnings to result list (or change return structure to dict)
    # Keeping return structure as list of dicts for now to not break frontend map, 
    # but we can append a special result metadata or frontend can handle it.
    # Actually, let's wrap it object-style if frontend supports it, otherwise hack it.
    # Frontend JS (STM_logic.js:168) handles `if (solveResult.results)`. So we can return a dict.
    
    return {
        'results': results,
        'warnings': warnings
    }


def generate_template(template_type, geometry):
    """
    Generates a Strut and Tie model based on geometry.
    """
    nodes = []
    members = []
    
    L = geometry.get('L', 120.0)
    H = geometry.get('H', 24.0)
    B = geometry.get('B', 12.0)

    if template_type == 'deep-beam':
        # Simple Deep Beam (Single Panel)
        # Supports at ends (inset by 0.1L or bearing width proxy)
        inset = min(12.0, L * 0.1)
        
        # Node 1: Left Support
        nodes.append({'id': 1, 'x': inset, 'y': 0, 'z': 0, 'fixed': True, 'load': 0})
        # Node 2: Right Support
        nodes.append({'id': 2, 'x': L - inset, 'y': 0, 'z': 0, 'fixed': True, 'load': 0})
        
        # Node 3: Top Load Points (Center for single point)
        # Let's do 2 point loads for a classic deep beam truss
        # Or simple single point at midspan
        mid_span = L / 2.0
        
        nodes.append({'id': 3, 'x': mid_span, 'y': H * 0.9, 'z': 0, 'fixed': False, 'load': -100})
        
        # Members
        # Strut 1-3
        members.append({'start': 1, 'end': 3, 'type': 'strut'})
        # Strut 2-3
        members.append({'start': 2, 'end': 3, 'type': 'strut'})
        # Tie 1-2
        members.append({'start': 1, 'end': 2, 'type': 'tie'})
        
    return {'nodes': nodes, 'members': members}

