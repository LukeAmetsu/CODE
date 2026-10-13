"""
Script de linha de comando para execução automática da rotina de salvamento
dos gráficos e dados do Shear Model com variações da base de dados.
"""

import os
import sys
import argparse

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.calculators.shear_batch_exporter import run_batch_shear_variations, SUBSET_DEFINITIONS, X_VARIABLES


def main():
    parser = argparse.ArgumentParser(
        description="Rotina automática para gerar e salvar gráficos do Shear Model por variações do banco de dados."
    )
    parser.add_argument(
        "--out", "-o",
        default="plots/shear_model_variations",
        help="Pasta de destino para salvar os gráficos e resumos (padrão: plots/shear_model_variations)"
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=200,
        help="Resolução DPI dos gráficos (padrão: 200, use 300 para publicação)"
    )
    parser.add_argument(
        "--no-codes",
        action="store_true",
        help="Desativar overlay das curvas comparativas de normas oficiais"
    )
    parser.add_argument(
        "--exclude-pc",
        action="store_true",
        help="Excluir elementos de concreto protendido (PC) da análise"
    )
    parser.add_argument(
        "--subsets",
        nargs="*",
        default=None,
        help="Lista de recortes específicos para gerar (padrão: todos os 19 recortes)"
    )
    parser.add_argument(
        "--vars",
        nargs="*",
        default=None,
        help="Lista de variáveis X para gerar (padrão: todas as 6 variáveis)"
    )

    args = parser.parse_args()

    print("=" * 65)
    print("  SHEAR MODEL - ROTINA AUTOMÁTICA DE SALVAMENTO DE GRÁFICOS")
    print("=" * 65)
    print(f"Pasta de destino: {os.path.abspath(args.out)}")
    print(f"Resolução DPI: {args.dpi}")
    print(f"Incluir normas oficiais: {not args.no_codes}")
    print(f"Excluir concreto protendido: {args.exclude_pc}")
    if args.subsets:
        print(f"Subconjuntos selecionados: {args.subsets}")
    else:
        print(f"Subconjuntos: TODOS ({len(SUBSET_DEFINITIONS)} variações)")
    print("-" * 65)

    if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

    def progress(pct, msg, img, is_done, total, cur):
        bar_len = 25
        filled = int(round(bar_len * pct / 100))
        bar = "#" * filled + "-" * (bar_len - filled)
        sys.stdout.write(f"\r[{bar}] {pct:3d}% | {msg[:55]:<55}")
        sys.stdout.flush()
        if is_done:
            sys.stdout.write("\n")

    res = run_batch_shear_variations(
        out_dir=args.out,
        selected_subsets=args.subsets,
        selected_vars=args.vars,
        exclude_prestressed=args.exclude_pc,
        include_codes=not args.no_codes,
        progress_callback=progress,
        dpi=args.dpi,
    )

    print("\n" + "=" * 65)
    print(f"✓ Concluído com sucesso!")
    print(f"✓ Gráficos gerados e salvos: {res['plots_count']}")
    print(f"✓ Pasta dos gráficos: {res['folder']}")
    print(f"✓ Planilha de resumo (.csv): {res['summary_csv']}")
    print(f"✓ Resumo estruturado (.json): {res['summary_json']}")
    print("=" * 65)


if __name__ == "__main__":
    main()
