#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Drilled Shaft Axial Geotechnical Capacity & Foundation Design Program
Based on 'capacidade estaca.xlsx' (FHWA GEC-010 / Reese & O'Neill / Mayne Beta-Method)

Usage:
    python run_capacidade_estaca.py        -> Runs analysis, displays summary in terminal and launches graphical UI (Eel)
    python run_capacidade_estaca.py --cli  -> Terminal report only (no browser window)
    python run_capacidade_estaca.py --export -> Generates exported Excel workbook
"""

import sys
import os
import argparse

# Garante import do diretório raiz
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from backend.calculators.capacidade_estaca import (
    run_full_analysis,
    get_default_project_data,
    export_to_excel
)

def print_banner():
    print("=" * 80)
    print("  DRILLED SHAFT AXIAL GEOTECHNICAL CAPACITY (LARGE DIAMETER)")
    print("  FHWA / AASHTO / Mayne Beta-Method from SPT Borehole Profiles")
    print("  Reference: 'Refs/capacidade estaca.xlsx'")
    print("=" * 80)

def display_cli_summary(res):
    print_banner()
    casing_pct = res.get('casing_reduction_pct', 10.0)
    casing_fac = res.get('casing_factor', 0.90)
    fs_glob = res.get('fs_global', res.get('fs', 2.0))
    fs_s = res.get('fs_lateral', 1.5)
    fs_p = res.get('fs_ponta', 3.0)
    fhwa_lim = "ACTIVE (beta <= Kp*tan(phi') & 900 psf shallow limit)" if res.get('apply_beta_fhwa_limit', True) else "DISABLED"

    lat_method = res.get('lateral_method', 'mayne_fhwa')
    tip_method = res.get('tip_method', 'aashto_2007')
    qs_max = res.get('qs_max_ksf', 4.0)
    qp_max = res.get('qp_max_ksf', 60.0)
    b_min = res.get('beta_min', 0.25)
    b_max = res.get('beta_max', 1.8)
    lat_str = f"AASHTO 2007/2017 (β-method: {b_min:.2f} <= β <= {b_max:.2f}, qs <= {qs_max:.1f} ksf ~ {qs_max*47.88:.1f} kPa)" if lat_method == "aashto_2007" else "FHWA GEC 010 (Mayne Beta-Method)"
    tip_str = f"AASHTO 2024 / Brown et al. (qp = 1.2*N60 <= {qp_max:.1f} ksf ~ {qp_max*47.88:.1f} kPa)" if tip_method == "aashto_2024" else f"AASHTO 2007 / O'Neill & Reese (kp = {res.get('kp_base', 0.59):.2f})"

    print(f"\n[GLOBAL PARAMETERS & DESIGN FACTORS (INPUTS)]")
    print(f"  • Side Resistance Standard: {lat_str}")
    print(f"  • Tip Resistance Standard: {tip_str}")
    print(f"  • Criterion 1 - Single Global FS: {fs_glob:.2f} (Radm = Rn / FS)")
    print(f"  • Criterion 2 - Differentiated FS: Side FS_s = {fs_s:.2f} | Tip FS_p = {fs_p:.2f} (Radm = Rs/FS_s + Rp/FS_p)")
    if lat_method == "mayne_fhwa":
        print(f"  • FHWA Eq. 10-13 criterion for beta: {fhwa_lim}")
    print(f"  • Steel Casing Reduction: {casing_pct:.1f}% (Multiplier factor: {casing_fac:.2f})")
    casing_l = res.get('casing_length_m')
    casing_l_str = f"{casing_l:.1f} m (first {casing_l:.1f}m of the shaft only)" if casing_l is not None else "Full shaft length (unrestricted)"
    print(f"  • Casing Extent: {casing_l_str}")
    print(f"  • Casing Reduction Mode: {res.get('casing_reduction_mode', 'excel_formula')}")
    print(f"  • Water Table (W.T.): {res['water_table_m']:.2f} m")
    print(f"  • Target Design Load (Phase I): {res['target_load_kN']:,.0f} kN")
    print(f"  • Statistical Synthesis Percentile: {res['percentile']:.0f}%")
    if tip_method == "aashto_2007":
        print(f"  • Tip Bearing Coefficient (kp): {res.get('kp_base', 0.59):.2f}")
    print(f"  • CN Limit: {res.get('cn_max', 2.0):.1f} | Atmospheric pressure pa: {res.get('pa_kpa', 101.3):.1f} kPa")
    print(f"  • Governing Boring Adopted for Axes: {res['critical_sounding_used']}")
    net_active = res.get('consider_pile_weight', False)
    g_conc = res.get('concrete_unit_weight', 24.0)
    g_w = res.get('water_unit_weight', 10.0)
    mode = res.get('pile_weight_mode', 'submerged_concrete')
    net_str = f"ACTIVE ({mode}, γ_conc={g_conc} kN/m³, γ_w={g_w} kN/m³ -> γ'={g_conc-g_w:.1f} kN/m³)" if net_active else "DISABLED (Gross Capacity Radm)"
    print(f"  • Pile Effective Self-Weight (Net Capacity): {net_str}")

    print(f"\n[1. CAPACITY SUMMARY TABLE - BOREHOLES (WITHOUT CASING REDUCTION)]")
    header = f"{'Boring':<18} | "
    for p in res['piles']:
        header += f"D={p['diam_m']:.2f}m (FS={fs_glob:.1f} -> Target | DIF: {fs_s}/{fs_p} -> Target) | "
    print("-" * len(header))
    print(header)
    print("-" * len(header))

    for row in res['summary_table']:
        line = f"{row['sounding_name']:<18} | "
        for pid, p in row['piles'].items():
            alvo_glob = f"{p.get('depth_for_target_global_m', p.get('depth_for_target_m')):.1f}m" if isinstance(p.get('depth_for_target_global_m', p.get('depth_for_target_m')), (int, float)) else str(p.get('depth_for_target_global_m', p.get('depth_for_target_m')))
            alvo_dif = f"{p.get('depth_for_target_dif_m'):.1f}m" if isinstance(p.get('depth_for_target_dif_m'), (int, float)) else str(p.get('depth_for_target_dif_m'))
            radm_glob = p.get('max_radm_global_kN', p.get('max_radm_kN', 0))
            radm_dif = p.get('max_radm_dif_kN', 0)
            line += f"{radm_glob:>6.0f}k ({alvo_glob:>5}) | {radm_dif:>6.0f}k ({alvo_dif:>5}) | "
        print(line)
    print("-" * len(header))

    print(f"\n[2. FOUNDATION AXIS ANALYSIS - GLOBAL FS ({fs_glob:.1f}) vs DIFFERENTIATED FS ({fs_s}/{fs_p})]")
    print(f"Governing boring adopted: {res['critical_sounding_used']} | Casing reduction: {casing_pct:.0f}%")
    header_ax = f"{'Axis':<6} | {'TOP (m)':<9} | {'Criterion':<14} | "
    for p in res['piles']:
        header_ax += f"D={p['diam_m']:.2f}m: Tip (Embedment) | "
    print("-" * len(header_ax))
    print(header_ax)
    print("-" * len(header_ax))

    for ax in res['axes_analysis']:
        cota_topo = ax.get('cota_topo_m', ax.get('cota_inicio_m', 0.0))
        # Linha Caso A: Global FS
        line_glob = f"Axis {ax['name']:<2} | {cota_topo:>7.2f} m | FS={fs_glob:.1f} (Sheet) | "
        for pid, p in ax['piles'].items():
            fundo_str = f"{p.get('cota_fundo_global_m', p.get('cota_fundo_m')):.1f}m" if isinstance(p.get('cota_fundo_global_m', p.get('cota_fundo_m')), (int, float)) else str(p.get('cota_fundo_global_m', p.get('cota_fundo_m')))
            emb_str = f"{p.get('embutimento_global_m', p.get('embutimento_m')):.2f}m" if isinstance(p.get('embutimento_global_m', p.get('embutimento_m')), (int, float)) else str(p.get('embutimento_global_m', p.get('embutimento_m')))
            line_glob += f"{fundo_str:>6} ({emb_str:>7})     | "
        print(line_glob)

        # Linha Caso B: Diferenciado FSs / FSp
        line_dif = f"        |           | DIF ({fs_s}/{fs_p})   | "
        for pid, p in ax['piles'].items():
            fundo_str_d = f"{p.get('cota_fundo_dif_m'):.1f}m" if isinstance(p.get('cota_fundo_dif_m'), (int, float)) else str(p.get('cota_fundo_dif_m'))
            emb_str_d = f"{p.get('embutimento_dif_m'):.2f}m" if isinstance(p.get('embutimento_dif_m'), (int, float)) else str(p.get('embutimento_dif_m'))
            line_dif += f"{fundo_str_d:>6} ({emb_str_d:>7})     | "
        print(line_dif)
        print("." * len(header_ax))

    print("-" * len(header_ax))
    print("\n✓ Comparative analysis completed successfully!")

def main():
    parser = argparse.ArgumentParser(description="Drilled Shaft Capacity Program (FHWA / AASHTO / Mayne)")
    parser.add_argument("--cli", action="store_true", help="Run in terminal only without opening web GUI")
    parser.add_argument("--export", type=str, nargs="?", const="drilled_shaft_capacity_report.xlsx", help="Export results to Excel workbook")
    parser.add_argument("--casing-length", type=float, default=None, help="Steel casing length in meters (applies reduction only over this depth)")
    parser.add_argument("--net", action="store_true", help="Deduct effective pile self-weight from capacity (Net Bearing Capacity)")
    args = parser.parse_args()

    # Carrega dados
    data = get_default_project_data()
    if args.casing_length is not None:
        data["casing_length_m"] = args.casing_length
    if args.net:
        data["consider_pile_weight"] = True
    res = run_full_analysis(data)

    display_cli_summary(res)

    if args.export:
        out_file = args.export
        export_to_excel(res, out_file)
        print(f"\n[EXCEL EXPORT] Workbook saved to: {os.path.abspath(out_file)}")

    if not args.cli and not args.export:
        print("\nStarting interactive graphical interface (Eel / Web)...")
        try:
            import eel
            import socket

            # Inicializa eel apontando para a pasta gui
            eel.init("gui")
            import backend.main_eel

            # Verifica porta livre
            def is_port_free(port):
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    return s.connect_ex(('127.0.0.1', port)) != 0

            port = 8000
            for candidate in [8000, 8008, 8080, 8888, 8899]:
                if is_port_free(candidate):
                    port = candidate
                    break

            print(f"Opening browser at 'capacidade_estaca.html' (port {port})...")
            eel.start("capacidade_estaca.html", size=(1440, 920), port=port, block=True)
        except Exception as e:
            print(f"\nNote regarding graphical interface: {e}")
            print("To access the interface, open gui/capacidade_estaca.html via local web server or browser.")

if __name__ == "__main__":
    main()
