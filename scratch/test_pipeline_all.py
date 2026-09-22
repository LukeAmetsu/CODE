import os
import sys
sys.path.insert(0, os.path.abspath('.'))
import json
import glob
import traceback
from backend.calculators.rs2_fea import (
    generate_triangular_mesh,
    solve_staged_fea,
    solve_plane_strain_fea,
)

test_files = sorted(glob.glob('test_files/rs2/*.json'))
print(f"Testing pipeline for {len(test_files)} tutorials...\n")

issues = []

for path in test_files:
    fname = os.path.basename(path)
    try:
        with open(path, 'r', encoding='utf-8') as f:
            d = json.load(f)
        
        m = d.get('model', d)
        
        # Test 1: Check excavation and stage definitions
        stages = m.get('stages', d.get('stages', []))
        exc_poly = m.get('excavation_poly')
        exc_polys = m.get('excavation_polys')
        has_exc = bool(exc_poly or exc_polys)
        
        # Determine keep_excavation_elements exactly as main_eel does
        keep_exc = False
        if has_exc and stages and len(stages) > 1:
            if any(s.get('excavation_active', False) for s in stages):
                keep_exc = True
            if any(s.get('active_polygons') is not None for s in stages):
                keep_exc = True
        
        # Test 2: Generate mesh with default params and small mesh_size
        domain_poly = m.get('domain_poly')
        if not domain_poly:
            issues.append((fname, "Missing domain_poly"))
            continue
            
        params = m.get('mesh_params', {})
        elem_size = params.get('element_size', 2.5)
        
        mesh_res = generate_triangular_mesh(
            domain_polygon=domain_poly,
            internal_boundaries=m.get('internal_boundaries'),
            excavation_poly=exc_poly,
            excavation_polys=exc_polys,
            layer_polygons=m.get('layer_polygons'),
            materials=m.get('materials'),
            element_size=elem_size,
            refine_excavation=True,
            keep_excavation_elements=keep_exc
        )
        
        nodes = mesh_res.get('nodes', [])
        elements = mesh_res.get('elements', [])
        
        if len(nodes) == 0 or len(elements) == 0:
            issues.append((fname, "Mesh generation returned 0 nodes/elements"))
            continue
            
        # Test 3: Solve FEA (staged or plane strain)
        # Prepare payload
        payload = dict(m)
        payload['mesh'] = {'nodes': nodes, 'elements': elements, 'element_materials': mesh_res.get('element_materials', [])}
        if stages:
            payload['stages'] = stages
            
        if stages and len(stages) > 1:
            res = solve_staged_fea(payload)
        else:
            res = solve_plane_strain_fea(payload)
            
        status = res.get('status')
        if status != 'success':
            issues.append((fname, f"Solver error: {res.get('error')}"))
            continue
            
        # Check displacements in final stage
        final_stage = None
        if 'stages' in res and len(res['stages']) > 0:
            final_stage = res['stages'][-1]
        elif 'u_tot' in res:
            final_stage = res
            
        if not final_stage or 'u_tot' not in final_stage:
            issues.append((fname, "No u_tot in final stage results"))
            continue
            
        u_max = max(final_stage['u_tot']) if final_stage['u_tot'] else 0.0
        
        # Check if u_max is unexpectedly zero
        if u_max == 0.0:
            issues.append((fname, "CRITICAL: u_max is exactly 0.0! Displacements are zero!"))
        else:
            print(f"OK: {fname[:38]:38} | nodes: {len(nodes):4}, elems: {len(elements):4}, u_max: {u_max*1000:8.2f} mm")
            
    except Exception as e:
        issues.append((fname, f"Exception: {str(e)} -> {traceback.format_exc()}"))

print("\n" + "="*60)
print(f"TOTAL ISSUES FOUND: {len(issues)}")
for f, iss in issues:
    print(f"[-] {f}: {iss}")
print("="*60)
