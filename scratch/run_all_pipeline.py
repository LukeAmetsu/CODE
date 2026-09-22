import os
import sys
sys.path.insert(0, os.path.abspath('.'))
import json
import glob
from backend.calculators.rs2_fea import full_analysis_pipeline

test_files = sorted(glob.glob('test_files/rs2/*.json'))
print(f"Running full_analysis_pipeline on {len(test_files)} tutorials...\n")

results = []
for p in test_files:
    fname = os.path.basename(p)
    with open(p, 'r', encoding='utf-8') as f:
        d = json.load(f)
    m = d.get('model', d)
    if 'stages' in d and 'stages' not in m:
        m['stages'] = d['stages']
    if 'materials' in d and 'materials' not in m:
        m['materials'] = d['materials']
    
    # Force mesh regeneration with adaptive Poisson-disk generator
    m_test = dict(m)
    m_test['mesh'] = None
    
    try:
        res = full_analysis_pipeline(m_test, run_ssr=False)
        st = res.get('status')
        if st != 'success':
            results.append((fname, 'FAIL', res.get('error')))
            continue
        
        mesh_nodes = len(res.get('mesh', {}).get('nodes', []))
        mesh_elems = len(res.get('mesh', {}).get('elements', []))
        
        stages_res = res.get('stages', [])
        if stages_res:
            s1 = stages_res[0]
            s1_u = s1.get('max_total_displacement', 0.0)
            final_stg = stages_res[-1]
            final_u = final_stg.get('max_total_displacement', 0.0)
            
            # Check nodal values
            u_tot_arr = final_stg.get('nodes', {}).get('Utot', [])
            u_max_arr = max(u_tot_arr) if u_tot_arr else 0.0
            
            results.append((fname, 'OK', f"nodes={mesh_nodes:4}, elems={mesh_elems:4}, stg_cnt={len(stages_res)}, S1_u={s1_u*1000:7.2f}mm, Final_u={final_u*1000:7.2f}mm (arr_max={u_max_arr*1000:7.2f}mm)"))
        else:
            final_u = res.get('results', {}).get('max_displacement', 0.0)
            results.append((fname, 'OK', f"nodes={mesh_nodes:4}, elems={mesh_elems:4}, single_stage, Final_u={final_u*1000:7.2f}mm"))
    except Exception as e:
        import traceback
        results.append((fname, 'EXC', f"{str(e)}: {traceback.format_exc().splitlines()[-1]}"))

print(f"{'Tutorial':40} | {'Status':6} | Details")
print("-" * 110)
for fn, st, det in results:
    print(f"{fn[:40]:40} | {st:6} | {det}")
