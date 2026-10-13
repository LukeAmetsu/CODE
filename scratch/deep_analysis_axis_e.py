import sys, os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from backend.calculators.capacidade_estaca import (
    calculate_layer_stresses_and_strengths,
    calculate_pile_capacities,
    get_default_project_data
)

data = get_default_project_data()
layers = data['soundings']['SPT-01']
# Axis E: Top El. = 4.60m. Embedment 25m means Tip El. = 4.60 + 25 = 29.60m.
z_top = 4.60
z_tip_target = 29.60

print("=================================================================")
print(f"ANÁLISE DETALHADA EIXO E: Cota Topo = 4.60m | Embutimento L = 25.0m (Cota Fundo = 29.60m)")
print("Carga Alvo Eixo E no JSON atual = 9.100 kN | Carga Alvo Haskoning = 12.050 kN | Carga Original = 21.400 kN")
print("=================================================================")

for d_m, pid in [(1.20, 'pile_48in'), (1.50, 'pile_60in')]:
    pile = next(p for p in data['piles'] if p['id'] == pid)
    print(f"\n====================== DIÂMETRO D = {d_m:.2f} m ======================")
    
    # Camadas FHWA
    l_fhwa = calculate_layer_stresses_and_strengths(layers, lateral_method="mayne_fhwa", tip_method="aashto_2007")
    # Camadas AASHTO 2007
    l_aashto = calculate_layer_stresses_and_strengths(layers, lateral_method="aashto_2007", tip_method="aashto_2007")
    # Camadas AASHTO com Ponta 2024
    l_aashto_tip24 = calculate_layer_stresses_and_strengths(layers, lateral_method="aashto_2007", tip_method="aashto_2024")

    # 1. FHWA Mayne (FS=2.0, Gross, casing=0%)
    res_fhwa_c0 = calculate_pile_capacities(l_fhwa, [pile], fs=2.0, start_depth_m=z_top, casing_reduction_pct=0.0, consider_pile_weight=False)
    # 2. FHWA Mayne (FS=2.0, Gross, casing=10%)
    res_fhwa_c10 = calculate_pile_capacities(l_fhwa, [pile], fs=2.0, start_depth_m=z_top, casing_reduction_pct=10.0, consider_pile_weight=False)
    # 3. AASHTO 2007 (FS=2.0, Gross, casing=0%)
    res_aashto_c0 = calculate_pile_capacities(l_aashto, [pile], fs=2.0, start_depth_m=z_top, casing_reduction_pct=0.0, consider_pile_weight=False)
    # 4. AASHTO 2007 (FS=2.0, Gross, casing=10%)
    res_aashto_c10 = calculate_pile_capacities(l_aashto, [pile], fs=2.0, start_depth_m=z_top, casing_reduction_pct=10.0, consider_pile_weight=False)
    # 5. AASHTO 2007 + AASHTO 2024 Tip (FS=2.0, Gross, casing=10%)
    res_aashto_tip24 = calculate_pile_capacities(l_aashto_tip24, [pile], fs=2.0, start_depth_m=z_top, casing_reduction_pct=10.0, consider_pile_weight=False)
    # 6. Saved Config (Casing=40%, Net pile weight=True, FS_s=2.5, FS_p=2.75)
    res_heavy = calculate_pile_capacities(l_aashto, [pile], fs=2.0, fs_lateral=2.5, fs_ponta=2.75, start_depth_m=z_top, casing_reduction_pct=40.0, consider_pile_weight=True, concrete_unit_weight=25.0)

    def get_at_depth(res_dict, target_z):
        depths = res_dict[pid]['depths']
        idx = min(range(len(depths)), key=lambda i: abs(depths[i] - target_z))
        return {
            'z': depths[idx],
            'emb': depths[idx] - z_top,
            'radm_glob': res_dict[pid]['radm_global'][idx],
            'radm_dif': res_dict[pid]['radm_dif'][idx],
            'rs': res_dict[pid]['rs_cumulative'][idx],
            'rp': res_dict[pid]['rp'][idx],
            'w_pile': res_dict[pid].get('w_pile_effective_total_kN', 0.0)
        }

    p1 = get_at_depth(res_fhwa_c0, z_tip_target)
    p2 = get_at_depth(res_fhwa_c10, z_tip_target)
    p3 = get_at_depth(res_aashto_c0, z_tip_target)
    p4 = get_at_depth(res_aashto_c10, z_tip_target)
    p5 = get_at_depth(res_aashto_tip24, z_tip_target)
    p6 = get_at_depth(res_heavy, z_tip_target)

    print(f"Capacidade aos L = 25.0 m de embutimento (Cota Fundo = {p1['z']:.2f}m):")
    print(f"  1. FHWA Mayne (FS=2.0, Casing=0%):       Radm_glob = {p1['radm_glob']:>6,.0f} kN (Rs={p1['rs']:>6.0f} kN, Rp={p1['rp']:>5.0f} kN)")
    print(f"  2. FHWA Mayne (FS=2.0, Casing=10%):      Radm_glob = {p2['radm_glob']:>6,.0f} kN")
    print(f"  3. AASHTO 2007 (FS=2.0, Casing=0%):      Radm_glob = {p3['radm_glob']:>6,.0f} kN (Rs={p3['rs']:>6.0f} kN, Rp={p3['rp']:>5.0f} kN)")
    print(f"  4. AASHTO 2007 (FS=2.0, Casing=10%):     Radm_glob = {p4['radm_glob']:>6,.0f} kN")
    print(f"  5. AASHTO Tip 2024 (FS=2.0, Casing=10%): Radm_glob = {p5['radm_glob']:>6,.0f} kN (Rs={p5['rs']:>6.0f} kN, Rp={p5['rp']:>5.0f} kN)")
    print(f"  6. AASHTO Config Salva (Casing 40%, Net, DIF 2.5/2.75): Radm_net_dif = {p6['radm_dif']:>6,.0f} kN")
