import openpyxl
from backend.calculators.capacidade_estaca import (
    calculate_layer_stresses_and_strengths,
    DEFAULT_SOIL_GROUPS
)

wb1 = openpyxl.load_workbook(r'C:\OD\OneDrive - Andrade Gutierrez\CODE-2\dist\Results_FS_2.5-2.75.xlsx', data_only=True)
s_wb1 = wb1['Summary axial lengths']
wb1_data = {}
for r in list(s_wb1.iter_rows(values_only=True))[1:]:
    ax = str(r[0]).strip()
    L = r[4]
    wb1_data[(ax, L)] = {
        'qs_adm': r[12],
        'qp_adm': r[13],
        'w': r[15],
        'qnet': r[16],
        'fs_avg': r[8]
    }

wb2 = openpyxl.load_workbook(r'C:\OD\OneDrive - Andrade Gutierrez\CODE-2\dist\capacidade_estaca_export.xlsx', data_only=True)
s_spt = wb2['SPT-01']
raw_layers = []
for r in list(s_spt.iter_rows(values_only=True))[2:]:
    if r[0] is not None and r[1] is not None:
        raw_layers.append({
            'z_ini': float(r[0]),
            'z_fim': float(r[1]),
            'n1_60': float(r[2]),
            'soil_group': str(r[3]),
            'sucs': str(r[4])
        })

axes_info = {
    'A': {'cota_topo': 20.40, 'D': 1.2, 'L_above': 22.92},
    'B': {'cota_topo': 18.60, 'D': 1.2, 'L_above': 21.12},
    'C': {'cota_topo': 13.82, 'D': 1.2, 'L_above': 16.34},
    'D': {'cota_topo': 8.94,  'D': 1.2, 'L_above': 11.46},
    'E': {'cota_topo': 4.16,  'D': 1.5, 'L_above': 6.68},
}

for ax_name, ax_cfg in axes_info.items():
    cota_topo = ax_cfg['cota_topo']
    D = ax_cfg['D']
    perim = 3.14159265 * D
    area = 3.14159265 * (D**2) / 4.0
    
    # 1. Slice sounding layers starting at cota_topo
    axis_layers = []
    for l in raw_layers:
        if l['z_fim'] <= cota_topo:
            continue
        z_a_eff = max(0.0, l['z_ini'] - cota_topo)
        z_b_eff = l['z_fim'] - cota_topo
        if z_b_eff <= z_a_eff:
            continue
        axis_layers.append({
            **l,
            'z_ini': z_a_eff,
            'z_fim': z_b_eff,
            'z_ini_abs': max(l['z_ini'], cota_topo),
            'z_fim_abs': l['z_fim']
        })
        
    proc = calculate_layer_stresses_and_strengths(
        axis_layers,
        water_table_m=0.0,
        soil_groups=DEFAULT_SOIL_GROUPS,
        lateral_method='mayne_fhwa',
        tip_method='aashto_2007',
        apply_qs_cap=True,
        apply_qp_cap=True
    )
    
    for idx, lyr in enumerate(proc):
        orig = axis_layers[idx]
        lyr['z_ini_rel'] = lyr['z_ini']
        lyr['z_fim_rel'] = lyr['z_fim']
        lyr['z_ini'] = orig['z_ini_abs']
        lyr['z_fim'] = orig['z_fim_abs']
        
    print(f'\n=== EIXO {ax_name} (Topo: {cota_topo}m, D={D}m) - MAYNE FHWA ===')
    print(f'{"L(m)":<6} | {"Qs_adm":<10} {"WB1 Qs":<10} | {"Qp_adm":<10} {"WB1 Qp":<10} | {"Qnet":<10} {"WB1 Qnet":<10} | {"Diff(%)":<8}')
    print('-'*80)
    
    cum_qs = 0.0
    casing_len = 4.0
    casing_factor = 0.60
    
    for idx, lyr in enumerate(proc):
        emb = lyr['z_fim_rel']
        dz = lyr['dz']
        z_mid = lyr['z_mid']
        qs_unit = lyr['qs']
        
        # casing reduction
        if z_mid <= casing_len:
            eff_qs = qs_unit * casing_factor
        else:
            eff_qs = qs_unit
            
        cum_qs += eff_qs * perim * dz
        
        # Check at integer or half depths
        for target_L in [2, 5, 10, 15, 20, 25, 30]:
            if abs(emb - target_L) < 0.35 and (idx == 0 or abs(proc[idx-1]['z_fim_rel'] - target_L) >= 0.35):
                qs_adm = cum_qs / 2.5
                qp_adm = (lyr['qp'] * area) / 2.75
                w_pile = area * (emb + ax_cfg['L_above']) * 14.0
                qnet = qs_adm + qp_adm - w_pile
                
                wb1_e = wb1_data.get((ax_name, target_L), {})
                wb1_qs = wb1_e.get('qs_adm', 0.0)
                wb1_qp = wb1_e.get('qp_adm', 0.0)
                wb1_qn = wb1_e.get('qnet', 0.0)
                diff = (qnet - wb1_qn) / abs(wb1_qn) * 100 if wb1_qn else 0
                print(f'{target_L:<6d} | {qs_adm:<10.1f} {wb1_qs:<10.1f} | {qp_adm:<10.1f} {wb1_qp:<10.1f} | {qnet:<10.1f} {wb1_qn:<10.1f} | {diff:<+7.1f}%')
