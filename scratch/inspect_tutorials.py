import os
import json
import glob

test_files = sorted(glob.glob('test_files/rs2/*.json'))
print(f"Inspecting {len(test_files)} test files...\n")

for path in test_files:
    fname = os.path.basename(path)
    with open(path, 'r', encoding='utf-8') as f:
        d = json.load(f)
    
    m = d.get('model', d)
    stages = m.get('stages', d.get('stages', []))
    exc_poly = m.get('excavation_poly')
    exc_polys = m.get('excavation_polys')
    fs = m.get('field_stress') or d.get('field_stress')
    k0 = m.get('k0') or d.get('k0')
    
    stage_info = []
    for i, s in enumerate(stages):
        keys = [f"{k}={s[k]}" for k in s.keys() if any(w in k.lower() for w in ['exc', 'active', 'relief', 'relaxation'])]
        stage_info.append(f"S{i+1}: {','.join(keys)}")
    
    print(f"{fname[:40]:40} | Exc: {str(bool(exc_poly or exc_polys)):5} | FS: {str(bool(fs)):5} | k0: {str(k0):5} | Stages({len(stages)}): {'; '.join(stage_info)}")
