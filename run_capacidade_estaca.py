#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Programa de Dimensionamento e Capacidade de Carga de Estacas Escavadas
Baseado na planilha 'capacidade estaca.xlsx' (Método FHWA / Reese & O'Neill / Mayne Beta-Method)

Execução:
    python run_capacidade_estaca.py        -> Executa análise, exibe resumo no terminal e inicia interface gráfica (Eel)
    python run_capacidade_estaca.py --cli  -> Apenas exibe o relatório no terminal sem abrir janela
    python run_capacidade_estaca.py --export -> Gera a planilha Excel exportada
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
    print("  CAPACIDADE DE CARGA DE ESTACAS ESCAVADAS DE GRANDE DIÂMETRO")
    print("  Método FHWA / Mayne Beta-Method a partir de Sondagens SPT")
    print("  Referência: Planilha 'Refs/capacidade estaca.xlsx'")
    print("=" * 80)

def display_cli_summary(res):
    print_banner()
    casing_pct = res.get('casing_reduction_pct', 10.0)
    casing_fac = res.get('casing_factor', 0.90)
    fs_glob = res.get('fs_global', res.get('fs', 2.0))
    fs_s = res.get('fs_lateral', 1.5)
    fs_p = res.get('fs_ponta', 3.0)
    fhwa_lim = "ATIVO (beta <= Kp*tan(phi') & 900 psf raso)" if res.get('apply_beta_fhwa_limit', True) else "DESATIVADO"

    print(f"\n[PARÂMETROS GLOBAIS & FATORES DE PROJETO (INPUTS)]")
    print(f"  • Critério 1 - FS Global Único: {fs_glob:.2f} (Radm = Rn / FS)")
    print(f"  • Critério 2 - FS Diferenciados: Lateral FS_s = {fs_s:.2f} | Ponta FS_p = {fs_p:.2f} (Radm = Rs/FS_s + Rp/FS_p)")
    print(f"  • Critério FHWA Eq. 10-13 para beta: {fhwa_lim}")
    print(f"  • Redução por Camisa Metálica: {casing_pct:.1f}% (Fator multiplicador: {casing_fac:.2f})")
    casing_l = res.get('casing_length_m')
    casing_l_str = f"{casing_l:.1f} m (apenas nos primeiros {casing_l:.1f}m da estaca)" if casing_l is not None else "Estaca inteira (sem limite)"
    print(f"  • Extensão da Camisa Metálica: {casing_l_str}")
    print(f"  • Modo de Aplicação da Camisa: {res.get('casing_reduction_mode', 'excel_formula')}")
    print(f"  • Nível d'Água (N.A.): {res['water_table_m']:.2f} m")
    print(f"  • Carga de Projeto Alvo (Fase I): {res['target_load_kN']:,.0f} kN")
    print(f"  • Percentil para Sondagem Média: {res['percentile']:.0f}%")
    print(f"  • Coeficiente de Ponta (kp): {res.get('kp_base', 0.59):.2f}")
    print(f"  • Limite CN: {res.get('cn_max', 2.0):.1f} | Pressão pa: {res.get('pa_kpa', 101.3):.1f} kPa")
    print(f"  • Sondagem Crítica Utilizada para Eixos: {res['critical_sounding_used']}")

    print(f"\n[1. TABELA RESUMO DE CAPACIDADES - SONDAGENS (SEM REDUÇÃO CAMISA)]")
    header = f"{'Sondagem':<18} | "
    for p in res['piles']:
        header += f"D={p['diam_m']:.2f}m (FS=2.0 -> Alvo | DIF: {fs_s}/{fs_p} -> Alvo) | "
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

    print(f"\n[2. ANÁLISE POR EIXO DE FUNDAÇÃO - COMPARATIVO FS GLOBAL (2.0) vs FS DIFERENCIADO ({fs_s}/{fs_p})]")
    print(f"Sondagem crítica adotada: {res['critical_sounding_used']} | Redução camisa: {casing_pct:.0f}%")
    header_ax = f"{'Eixo':<6} | {'TOPO (m)':<9} | {'Critério':<14} | "
    for p in res['piles']:
        header_ax += f"D={p['diam_m']:.2f}m: Fundo (Embutimento) | "
    print("-" * len(header_ax))
    print(header_ax)
    print("-" * len(header_ax))

    for ax in res['axes_analysis']:
        cota_topo = ax.get('cota_topo_m', ax.get('cota_inicio_m', 0.0))
        # Linha Caso A: Global FS=2.0
        line_glob = f"Eixo {ax['name']:<2} | {cota_topo:>7.2f} m | FS=2.0 (Plan.) | "
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
    print("\n✓ Análise comparativa concluída com sucesso!")

def main():
    parser = argparse.ArgumentParser(description="Programa de Capacidade de Estacas (FHWA / Mayne)")
    parser.add_argument("--cli", action="store_true", help="Executa apenas no terminal sem abrir interface web")
    parser.add_argument("--export", type=str, nargs="?", const="capacidade_estaca_gerada.xlsx", help="Exporta resultado para Excel")
    parser.add_argument("--casing-length", type=float, default=None, help="Extensão da camisa metálica em metros (aplica redução apenas nestes metros)")
    args = parser.parse_args()

    # Carrega dados
    data = get_default_project_data()
    if args.casing_length is not None:
        data["casing_length_m"] = args.casing_length
    res = run_full_analysis(data)

    display_cli_summary(res)

    if args.export:
        out_file = args.export
        export_to_excel(res, out_file)
        print(f"\n[EXPORTAÇÃO EXCEL] Arquivo salvo em: {os.path.abspath(out_file)}")

    if not args.cli and not args.export:
        print("\nIniciando interface gráfica interativa (Eel / Web)...")
        try:
            import eel
            import socket

            # Inicializa eel apontando para a pasta gui
            eel.init("gui")

            # Verifica porta livre
            def is_port_free(port):
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    return s.connect_ex(('127.0.0.1', port)) != 0

            port = 8000
            for candidate in [8000, 8008, 8080, 8888, 8899]:
                if is_port_free(candidate):
                    port = candidate
                    break

            print(f"Abrindo navegador na página 'capacidade_estaca.html' (porta {port})...")
            eel.start("capacidade_estaca.html", size=(1440, 920), port=port, block=True)
        except Exception as e:
            print(f"\nNota sobre interface gráfica: {e}")
            print("Para utilizar a interface, acesse gui/capacidade_estaca.html via o servidor backend ou navegador.")

if __name__ == "__main__":
    main()
