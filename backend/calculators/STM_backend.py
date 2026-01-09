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

    # 4. Solve Linear System
    try:
        u = np.linalg.solve(K, F)
    except np.linalg.LinAlgError:
        return {'error': 'Structure is unstable (singular stiffness matrix). Check constraints.'}

    # 5. Post-Process Member Forces
    results = []
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
            cx, cy, cz = 0, 0, 0 # Avoid div by zero, though L=0 check already exists
        else:
            cx, cy, cz = dx/L, dy/L, dz/L
        
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
        
    return results

