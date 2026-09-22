import glob, json, os

files = sorted(glob.glob('test_files/rs2/*.json'))
print(f'Total tutorial files found: {len(files)}')

for p in files:
    fname = os.path.basename(p)
    with open(p, 'r', encoding='utf-8') as f:
        d = json.load(f)
    m = d.get('model', {})
    
    fs = m.get('field_stress')
    exc = m.get('excavation_poly') or m.get('excavation_polys')
    keep_exc = m.get('keep_excavation_elements')
    stages = m.get('stages') or []
    has_exc_stage = any(
        st.get('excavation_active') is not None or 
        st.get('excavated') is not None or 
        st.get('tunnel') is not None 
        for st in stages
    )
    
    fs_str = fs.get('type') if isinstance(fs, dict) else str(bool(fs))
    print(f"{fname[:48]:48s} | Exc: {str(bool(exc)):5s} | KeepExc: {str(keep_exc):5s} | ExcStg: {str(has_exc_stage):5s} | FS: {fs_str:8s} | Stg: {len(stages)}")
