import glob, json, os, sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from backend.main_eel import rs2_generate_mesh, rs2_run_analysis

files = sorted(glob.glob('test_files/rs2/*.json'))
print(f"Testing {len(files)} benchmark models through main_eel pipeline...\n")

results = []
for p in files:
    fname = os.path.basename(p)
    with open(p, 'r', encoding='utf-8') as f:
        d = json.load(f)
    m = d.get('model', {})
    
    # 1. Mesh generation
    mesh_res = rs2_generate_mesh(m)
    if mesh_res.get('status') != 'success':
        results.append((fname, 'MESH_FAIL', mesh_res.get('error'), 0, 0))
        continue
    
    m_copy = dict(m)
    m_copy['mesh'] = mesh_res['mesh']
    
    # 2. Run analysis
    solve_res = rs2_run_analysis(m_copy)
    if solve_res.get('status') != 'success':
        results.append((fname, 'SOLVE_FAIL', solve_res.get('error'), mesh_res['mesh']['num_nodes'], 0))
        continue
        
    stages = solve_res.get('stages', [])
    last_stage = stages[-1] if stages else {}
    utot = last_stage.get('nodes', {}).get('Utot', [])
    max_u = max(utot) if len(utot) > 0 else 0.0
    
    results.append((fname, 'OK', None, mesh_res['mesh']['num_nodes'], max_u * 1000))

for r in results:
    status_str = f"OK (Max U: {r[4]:.2f} mm)" if r[1] == 'OK' else f"FAILED: {r[1]} - {r[2]}"
    print(f"{r[0][:48]:48s} | Nodes: {r[3]:4d} | {status_str}")
