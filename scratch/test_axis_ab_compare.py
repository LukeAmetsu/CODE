import sys
sys.path.insert(0, '.')
from backend.calculators.capacidade_estaca import run_full_analysis

# In the user screenshot:
# Axis A: Top = 20.40, Target = 5550
# Axis B: Top = 18.60, Target = 6400

# Let's find what combination of settings gives the screenshot:
# Global FS = 2.00:
# Axis A: 1.2m: 42.60m (Net), 40.20m (Gross); 1.3m: 40.80m, 38.40m; 1.5m: 38.40m, 36.60m
# Axis B: 1.2m: 42.60m (Net), 40.20m (Gross); 1.3m: 40.20m, 38.40m; 1.5m: 37.80m, 36.00m
# DIF (FS_s=2.50 / FS_p=2.75):
# Axis A: 1.2m: 46.20m (Net), 43.20m (Gross); 1.3m: 45.00m, 42.60m; 1.5m: 42.60m, 39.60m
# Axis B: 1.2m: 46.20m (Net), 45.00m (Gross); 1.3m: 45.00m, 42.60m; 1.5m: 42.60m, 39.60m

# Let's test different settings in run_full_analysis:
for beta_ref in ['relative_to_top', 'absolute']:
    for sar in [False, True]:
        for casing_pct in [0.0, 10.0]:
            for casing_len in [None, 0.0, 4.0]:
                p = {
                    'fs_global': 2.0,
                    'fs_lateral': 2.50,
                    'fs_ponta': 2.75,
                    'consider_pile_weight': True,
                    'soil_above_removed': sar,
                    'beta_depth_ref': beta_ref,
                    'casing_reduction_pct': casing_pct,
                    'casing_length_m': casing_len,
                    'axes': [
                        {'name': 'A', 'cota_topo_m': 20.40, 'target_load_kN': 5550},
                        {'name': 'B', 'cota_topo_m': 18.60, 'target_load_kN': 6400}
                    ]
                }
                res = run_full_analysis(p)
                axA = res['axes_analysis'][0]
                axB = res['axes_analysis'][1]
                tipA_48_net_dif = axA['piles']['pile_48in']['cota_fundo_net_dif_m']
                tipB_48_net_dif = axB['piles']['pile_48in']['cota_fundo_net_dif_m']
                if tipA_48_net_dif == 46.2 and tipB_48_net_dif == 46.2:
                    print(f"FOUND MATCH! beta_ref={beta_ref}, sar={sar}, casing_pct={casing_pct}, casing_len={casing_len}")
                    print(f"  Axis A DIF: 48in={axA['piles']['pile_48in']['cota_fundo_net_dif_m']}, 54in={axA['piles']['pile_54in']['cota_fundo_net_dif_m']}, 60in={axA['piles']['pile_60in']['cota_fundo_net_dif_m']}")
                    print(f"  Axis B DIF: 48in={axB['piles']['pile_48in']['cota_fundo_net_dif_m']}, 54in={axB['piles']['pile_54in']['cota_fundo_net_dif_m']}, 60in={axB['piles']['pile_60in']['cota_fundo_net_dif_m']}")
                    print(f"  Axis A Glob: 48in={axA['piles']['pile_48in']['cota_fundo_net_global_m']}, 54in={axA['piles']['pile_54in']['cota_fundo_net_global_m']}, 60in={axA['piles']['pile_60in']['cota_fundo_net_global_m']}")
                    print(f"  Axis B Glob: 48in={axB['piles']['pile_48in']['cota_fundo_net_global_m']}, 54in={axB['piles']['pile_54in']['cota_fundo_net_global_m']}, 60in={axB['piles']['pile_60in']['cota_fundo_net_global_m']}")
                    break
