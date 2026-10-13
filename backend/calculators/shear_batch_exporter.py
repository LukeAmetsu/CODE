"""
Shear Model Batch Exporter - Rotina Automática de Geração e Salvamento de Gráficos e Dados
Itera sobre as variações da base de dados (subsets, variáveis X, exclusão de protendido),
gera gráficos de alta resolução (300 DPI) para dissertações e artigos, e exporta
tabelas resumo consolidadas (.csv e .json).
"""

import os
import sys
import json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Safe non-interactive backend for threads
import matplotlib.pyplot as plt

# Ensure relative imports work
try:
    from backend.calculators.interactive_shear import (
        get_all_codes_dataset,
        is_row_in_subset,
        get_lowess,
    )
except ImportError:
    # Standalone execution fallback
    current_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(current_dir, '..', '..'))
    if root_dir not in sys.path:
        sys.path.insert(0, root_dir)
    from backend.calculators.interactive_shear import (
        get_all_codes_dataset,
        is_row_in_subset,
        get_lowess,
    )

SUBSET_DEFINITIONS = [
    {"key": "ALL DATA", "label": "Todos os Dados (Global)", "group": "Global", "short": "global_all"},
    {"key": "slabs_all", "label": "Todas as Lajes (bw/d >= 2.0)", "group": "Lajes", "short": "slabs_all"},
    {"key": "slabs_slender_600", "label": "Lajes Esbeltas (bw/d >= 2, d < 600 mm)", "group": "Lajes", "short": "slabs_slender_600"},
    {"key": "slabs_slender_400", "label": "Lajes Esbeltas (bw/d >= 2, d < 400 mm)", "group": "Lajes", "short": "slabs_slender_400"},
    {"key": "slabs_thick_600", "label": "Elementos Espessos (d >= 600 mm)", "group": "Lajes / Espessura", "short": "slabs_thick_600"},
    {"key": "slabs_thick_400", "label": "Lajes Espessas (bw/d >= 2, d >= 400 mm)", "group": "Lajes", "short": "slabs_thick_400"},
    {"key": "slabs_wide", "label": "Lajes Muito Largas (bw/d >= 5.0)", "group": "Lajes", "short": "slabs_wide"},
    {"key": "members_slender_600", "label": "Elementos Esbeltos (d < 600 mm)", "group": "Altura Útil", "short": "members_slender_600"},
    {"key": "members_slender_400", "label": "Elementos Esbeltos (d < 400 mm)", "group": "Altura Útil", "short": "members_slender_400"},
    {"key": "members_long_span", "label": "Vão Longo / Flexão (a/d >= 2.5)", "group": "Vão Cisalhante", "short": "span_long"},
    {"key": "members_short_span", "label": "Vão Curto / Bielas (a/d < 2.5)", "group": "Vão Cisalhante", "short": "span_short"},
    {"key": "rho_low", "label": "Baixa Armadura (rho < 1.0%)", "group": "Armadura", "short": "rho_low"},
    {"key": "rho_very_low", "label": "Armadura Muito Baixa (rho < 0.5%)", "group": "Armadura", "short": "rho_very_low"},
    {"key": "rho_high", "label": "Alta Armadura (rho >= 1.5%)", "group": "Armadura", "short": "rho_high"},
    {"key": "fck_high", "label": "Alta Resistência (fck > 50 MPa)", "group": "Concreto", "short": "fck_high"},
    {"key": "fck_normal", "label": "Concreto Convencional (fck <= 50 MPa)", "group": "Concreto", "short": "fck_normal"},
    {"key": "d_dg_large", "label": "Agregado Graúdo (d_dg > 32 mm)", "group": "Materiais", "short": "ddg_large"},
    {"key": "mat_rc", "label": "Apenas Concreto Armado (RC)", "group": "Tipologia", "short": "mat_rc"},
    {"key": "mat_pc", "label": "Apenas Concreto Protendido (PC)", "group": "Tipologia", "short": "mat_pc"},
]

X_VARIABLES = [
    {"key": "d (mm)", "label": "Altura Útil, d (mm)", "symbol": "d", "unit": "mm", "log": True, "short": "d_mm"},
    {"key": "a_d", "label": "Relação Vão/Altura, a/d", "symbol": "a/d", "unit": "-", "log": True, "short": "ad"},
    {"key": "pw (%)", "label": "Taxa de Armadura Longitudinal, 100·ρw (%)", "symbol": r"100\rho_w", "unit": "%", "log": True, "short": "rho_w"},
    {"key": "fck (MPa)", "label": "Resistência à Compressão, fck (MPa)", "symbol": "f_{ck}", "unit": "MPa", "log": False, "short": "fck"},
    {"key": "bw (mm)", "label": "Largura da Alma, bw (mm)", "symbol": "b_w", "unit": "mm", "log": True, "short": "bw"},
    {"key": "Sigma_CP", "label": "Tensão Normal de Protensão, σcp (MPa)", "symbol": r"\sigma_{cp}", "unit": "MPa", "log": False, "short": "sigma_cp"},
]

DESIGN_CODES = [
    {"key": "A_NBR6118", "label": "NBR 6118:2023", "color": "#2563eb", "linestyle": "-"},
    {"key": "A_EC2_2023", "label": "Eurocode 2 (2023)", "color": "#059669", "linestyle": "-"},
    {"key": "A_EC2_2004", "label": "Eurocode 2 (2004)", "color": "#0d9488", "linestyle": "--"},
    {"key": "A_ACI_19", "label": "ACI 318-19", "color": "#ea580c", "linestyle": "-"},
    {"key": "A_ACI_14", "label": "ACI 318-14", "color": "#dc2626", "linestyle": ":"},
    {"key": "A_MC2010_L1", "label": "fib MC2010 (L1)", "color": "#4f46e5", "linestyle": "-."},
]

DEFAULT_MODEL_PARAMS = {
    'C': 0.22,
    'alpha': 0.37,
    'beta': 0.18,
    'gamma': 0.54,
    'delta': -0.24,
    'mu': 0.15,
    'epsilon': 1.0,
    'zeta': 1.0,
    'use_deff': False,
}


def get_available_metadata():
    """Returns available subsets and variables for the frontend UI."""
    return {
        "subsets": SUBSET_DEFINITIONS,
        "variables": X_VARIABLES,
        "design_codes": DESIGN_CODES,
        "default_params": DEFAULT_MODEL_PARAMS,
    }


def compute_shear_model_prediction(row, params):
    """
    Computes V_calc (kN) and ratio R = V_test / V_calc for a given row.
    Formula:
      d_eff = min(d, sqrt(a_cs/4 * d)) if use_deff and a_cs < 4d else d
      V_c_rc = C * (d_dg/d_eff)^alpha * (100*rho)^beta * fck^gamma * (a/d)^delta * bw * d
      V_p = mu * min(sigma_cp, 0.2*fck) * bw * d
      V_calc = V_c_rc + V_p
    """
    try:
        bd = float(row.get('d (mm)') or 0.0)
        bbw = float(row.get('bw (mm)') or row.get('b (mm)') or 0.0)
        if bbw <= 0 and bd > 0:
            bwd_ratio = float(row.get('bw/d ratio') or 0.0)
            if bwd_ratio > 0:
                bbw = bwd_ratio * bd

        brho = float(row.get('pw (%)') or (row.get('rho', 0.0) * 100.0 if row.get('rho') is not None else 0.0))
        rho = (brho / 100.0) if brho > 0.1 else brho
        fck = float(row.get('fck (MPa)') or row.get('fck_eq') or 0.0)
        v_test_kn = float(row.get('Vu (kN)') or row.get('V_test') or 0.0)

        ba_d = float(row.get('a_d') or 0.0)
        if ba_d <= 0:
            ba_mm = float(row.get('a_cs') or (float(row.get('a:M/V (mm)') or 0.0) * 1000.0))
            if ba_mm > 0 and bd > 0:
                ba_d = ba_mm / bd

        d_dg = float(row.get('d_dg') or 32.0)
        if d_dg <= 0 or np.isnan(d_dg):
            d_dg = 32.0

        raw_sig = row.get('Sigma_CP') if row.get('Sigma_CP') is not None else row.get('Sigma_CP.1')
        sigma_cp = max(0.0, float(raw_sig or 0.0))

        if not (bd > 0 and bbw > 0 and rho > 0 and fck > 0 and ba_d > 0 and v_test_kn > 0):
            return None

        # Effective depth if CSCT / EC2-2023 constraint is active
        use_deff = bool(params.get('use_deff', False))
        if use_deff:
            acs = max(ba_d * bd, bd)
            eff_d = np.sqrt((acs / 4.0) * bd) if acs < 4.0 * bd else bd
        else:
            eff_d = bd

        alpha = float(params.get('alpha', 0.37))
        beta = float(params.get('beta', 0.18))
        gamma = float(params.get('gamma', 0.54))
        delta = float(params.get('delta', -0.24))
        C = float(params.get('C', 0.22))
        mu = float(params.get('mu', 0.15))

        size_effect = (d_dg / eff_d) ** alpha if alpha != 0 else 1.0
        rho_term = (100.0 * rho) ** beta if beta != 0 else 1.0
        fck_term = (fck) ** gamma if gamma != 0 else 1.0
        ad_term = (ba_d) ** delta if delta != 0 else 1.0

        # Nominal area = bw * d
        vc_rc = C * size_effect * rho_term * fck_term * ad_term
        sigma_cp_lim = min(sigma_cp, 0.2 * fck)
        vc_tot = vc_rc + mu * sigma_cp_lim

        v_calc_n = vc_tot * bbw * bd
        v_calc_kn = v_calc_n / 1000.0

        if v_calc_kn <= 0 or not np.isfinite(v_calc_kn):
            return None

        ratio = v_test_kn / v_calc_kn
        return {
            'ratio': ratio,
            'V_test_kN': v_test_kn,
            'V_calc_kN': v_calc_kn,
            'd': bd,
            'bw': bbw,
            'rho_pct': rho * 100.0,
            'fck': fck,
            'a_d': ba_d,
            'd_dg': d_dg,
            'sigma_cp': sigma_cp,
        }
    except Exception:
        return None


def extract_row_x(row, var_key):
    """Extracts numerical X coordinate for a specific variable."""
    try:
        if var_key == 'd (mm)':
            return float(row.get('d (mm)') or 0.0)
        elif var_key == 'a_d':
            ad = float(row.get('a_d') or 0.0)
            if ad <= 0:
                d = float(row.get('d (mm)') or 0.0)
                a = float(row.get('a_cs') or (float(row.get('a:M/V (mm)') or 0.0) * 1000.0))
                if a > 0 and d > 0: ad = a / d
            return ad
        elif var_key == 'pw (%)':
            pw = float(row.get('pw (%)') or 0.0)
            if pw <= 0:
                rho = float(row.get('rho') or 0.0)
                pw = rho * 100.0 if rho > 0 else 0.0
            return pw
        elif var_key == 'fck (MPa)':
            return float(row.get('fck (MPa)') or row.get('fck_eq') or 0.0)
        elif var_key == 'bw (mm)':
            bw = float(row.get('bw (mm)') or row.get('b (mm)') or 0.0)
            if bw <= 0:
                d = float(row.get('d (mm)') or 0.0)
                bwd = float(row.get('bw/d ratio') or 0.0)
                if bwd > 0 and d > 0: bw = bwd * d
            return bw
        elif var_key == 'Sigma_CP':
            raw = row.get('Sigma_CP') if row.get('Sigma_CP') is not None else row.get('Sigma_CP.1')
            return max(0.0, float(raw or 0.0))
        else:
            return float(row.get(var_key) or 0.0)
    except Exception:
        return 0.0


def generate_single_shear_plot(
    data_points,
    var_meta,
    subset_meta,
    params,
    out_filepath,
    codes_points_dict=None,
    dpi=200,
    include_codes=True,
):
    """
    Renders and saves a publication-quality chart for a given variable X and subset.
    Returns calculated statistics dict.
    """
    if len(data_points) < 3:
        return None

    x_vals = np.array([p['x'] for p in data_points], dtype=float)
    y_vals = np.array([p['y'] for p in data_points], dtype=float)

    # Filter out NaNs and infs
    valid_mask = np.isfinite(x_vals) & np.isfinite(y_vals) & (x_vals > 0 if var_meta['log'] else True)
    x_vals = x_vals[valid_mask]
    y_vals = y_vals[valid_mask]

    if len(x_vals) < 3:
        return None

    # Sort
    sort_idx = np.argsort(x_vals)
    x_vals = x_vals[sort_idx]
    y_vals = y_vals[sort_idx]

    # Statistics
    n_count = len(y_vals)
    mean_r = float(np.mean(y_vals))
    std_r = float(np.std(y_vals, ddof=1)) if n_count > 1 else 0.0
    cov_pct = float((std_r / mean_r) * 100.0) if mean_r > 0 else 0.0
    p05 = float(np.percentile(y_vals, 5))
    p10 = float(np.percentile(y_vals, 10))
    median_r = float(np.median(y_vals))
    unsafe_pct = float(np.sum(y_vals < 1.0) / n_count * 100.0)

    # Set up figure
    fig, ax = plt.subplots(figsize=(8.5, 6.0), dpi=dpi)

    # 1. Safety Limit R = 1.0 and Unsafe Zone
    ax.axhline(1.0, linestyle="--", color="#1e293b", linewidth=1.8, label=r"Limite de Segurança ($R=1.0$)")
    ax.axhspan(0, 1.0, facecolor="#ef4444", alpha=0.10, label="Região Insegura ($R < 1.0$)")

    # 2. Scatter Points
    ax.scatter(
        x_vals, y_vals,
        alpha=0.35, s=20, color="#8b5cf6",
        edgecolors="none", label=f"Modelo Proposto (n={n_count})"
    )

    # 3. LOWESS Trendline for Proposed Model
    if n_count >= 6:
        try:
            lowess_pts = get_lowess(x_vals, y_vals, frac=0.35)
            if lowess_pts:
                lx = [p['x'] for p in lowess_pts]
                ly = [p['y'] for p in lowess_pts]
                ax.plot(lx, ly, color="#7c3aed", linewidth=2.8, label="Tendência LOWESS (Modelo)")
        except Exception:
            pass

    # 4. Quantiles (p05 & p10) via binning
    try:
        n_bins = max(5, min(12, n_count // 20))
        if var_meta['log']:
            bin_edges = np.logspace(np.log10(x_vals.min()), np.log10(x_vals.max()), n_bins + 1)
            bin_centers = np.sqrt(bin_edges[:-1] * bin_edges[1:])
        else:
            bin_edges = np.linspace(x_vals.min(), x_vals.max(), n_bins + 1)
            bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

        digitized = np.digitize(x_vals, bin_edges)
        p05_bins, p10_bins, valid_centers = [], [], []

        for b in range(1, n_bins + 1):
            pts_in_b = y_vals[digitized == b]
            if len(pts_in_b) >= 3:
                p05_bins.append(float(np.percentile(pts_in_b, 5)))
                p10_bins.append(float(np.percentile(pts_in_b, 10)))
                valid_centers.append(bin_centers[b - 1])

        if valid_centers:
            ax.plot(valid_centers, p10_bins, color="#f59e0b", linestyle="--", linewidth=1.6, label=r"Fractil $p_{10}$")
            ax.plot(valid_centers, p05_bins, color="#dc2626", linestyle=":", linewidth=1.6, label=r"Fractil $p_{05}$ (Normativo)")
    except Exception:
        pass

    # 5. Overlay Design Codes (if enabled and points available)
    if include_codes and codes_points_dict:
        for code_info in DESIGN_CODES:
            code_key = code_info['key']
            pts = codes_points_dict.get(code_key, [])
            if len(pts) >= 10:
                cx = np.array([p['x'] for p in pts], dtype=float)
                cy = np.array([p['y'] for p in pts], dtype=float)
                c_mask = np.isfinite(cx) & np.isfinite(cy) & (cx > 0 if var_meta['log'] else True)
                cx, cy = cx[c_mask], cy[c_mask]
                if len(cx) >= 10:
                    c_low = get_lowess(cx, cy, frac=0.4)
                    if c_low:
                        ax.plot(
                            [p['x'] for p in c_low],
                            [p['y'] for p in c_low],
                            color=code_info['color'],
                            linestyle=code_info['linestyle'],
                            linewidth=1.8,
                            alpha=0.85,
                            label=code_info['label'],
                        )

    # Scale & Limits
    if var_meta['log']:
        ax.set_xscale("log")
    
    y_cap = max(2.5, min(5.0, float(np.percentile(y_vals, 98) * 1.15)))
    ax.set_ylim(0, y_cap)

    # Axis Labels & Title
    ax.set_xlabel(f"{var_meta['label']}", fontsize=11, fontweight='semibold', color='#0f172a')
    ax.set_ylabel(r"$R = V_{\mathrm{test}} / V_{\mathrm{calc}}$", fontsize=11, fontweight='semibold', color='#0f172a')
    
    title_text = f"Modelo Empírico de Cisalhamento vs {var_meta['symbol']}\nRecorte: {subset_meta['label']}"
    ax.set_title(title_text, fontsize=12, fontweight='bold', pad=12, color='#0f172a')

    # Grid
    ax.grid(True, which="both", linestyle=":", alpha=0.5, color="#94a3b8")

    # Legend
    ax.legend(loc="upper right", fontsize=8.5, framealpha=0.92, facecolor="#ffffff", edgecolor="#cbd5e1")

    # Formulation & Stats Banner
    C = params.get('C', 0.22)
    a = params.get('alpha', 0.37)
    b = params.get('beta', 0.18)
    g = params.get('gamma', 0.54)
    d = params.get('delta', -0.24)
    deff_str = " [d_eff ativo]" if params.get('use_deff') else ""

    stats_str = (
        f"Parâmetros: C={C:.3f} | α={a:.3f} | β={b:.3f} | γ={g:.3f} | δ={d:.3f}{deff_str}\n"
        f"Amostras: n={n_count} | Média R = {mean_r:.3f} | CoV = {cov_pct:.1f}% | p05 = {p05:.3f} | R<1.0: {unsafe_pct:.1f}%"
    )
    fig.text(
        0.13, 0.02, stats_str,
        fontsize=8.5, fontfamily="monospace",
        color="#334155",
        bbox=dict(boxstyle="round,pad=0.4", facecolor="#f8fafc", edgecolor="#cbd5e1", alpha=0.95)
    )

    plt.subplots_adjust(bottom=0.18, top=0.90, left=0.12, right=0.96)
    fig.savefig(out_filepath, dpi=dpi, bbox_inches="tight")
    plt.close(fig)

    return {
        "Subset": subset_meta['key'],
        "Subset_Label": subset_meta['label'],
        "Group": subset_meta['group'],
        "Variable_X": var_meta['key'],
        "Variable_Symbol": var_meta['symbol'],
        "Count": n_count,
        "Mean_R": round(mean_r, 4),
        "STD_R": round(std_r, 4),
        "CoV_pct": round(cov_pct, 2),
        "P05_Fractile": round(p05, 4),
        "P10_Fractile": round(p10, 4),
        "Median_R": round(median_r, 4),
        "Unsafe_pct": round(unsafe_pct, 2),
        "C": C,
        "Alpha": a,
        "Beta": b,
        "Gamma": g,
        "Delta": d,
        "Mu": params.get('mu', 0.15),
        "Use_Deff": bool(params.get('use_deff', False)),
        "Filename": os.path.basename(out_filepath),
    }


def run_batch_shear_variations(
    out_dir="plots/shear_model_variations",
    model_params=None,
    selected_subsets=None,
    selected_vars=None,
    exclude_prestressed=False,
    include_codes=True,
    progress_callback=None,
    dpi=200,
):
    """
    Executes the automated batch routine:
    1. Loads full shear database (1804+ tests) with all calculated official design codes.
    2. Filters for selected database variations (subsets).
    3. Computes live shear model values for each point.
    4. Generates publication-ready plots for each (subset x variable) combination.
    5. Consolidates statistical data into summary CSV and JSON tables.
    """
    if model_params is None:
        model_params = DEFAULT_MODEL_PARAMS.copy()
    else:
        # Merge with defaults
        merged = DEFAULT_MODEL_PARAMS.copy()
        merged.update(model_params)
        model_params = merged

    # Ensure output directory exists
    os.makedirs(out_dir, exist_ok=True)

    # Filter subsets & variables based on user selection
    subsets_to_process = SUBSET_DEFINITIONS
    if selected_subsets:
        subsets_to_process = [s for s in SUBSET_DEFINITIONS if s['key'] in selected_subsets or s['short'] in selected_subsets]
        if not subsets_to_process:
            subsets_to_process = SUBSET_DEFINITIONS

    vars_to_process = X_VARIABLES
    if selected_vars:
        vars_to_process = [v for v in X_VARIABLES if v['key'] in selected_vars or v['short'] in selected_vars]
        if not vars_to_process:
            vars_to_process = X_VARIABLES

    total_combinations = len(subsets_to_process) * len(vars_to_process)
    current_combo = 0

    if progress_callback:
        progress_callback(
            0,
            "Carregando banco de dados completo de cisalhamento (1804+ vigas)...",
            None,
            False,
            total_combinations,
            0
        )

    # 1. Load dataset
    all_data = get_all_codes_dataset()
    if isinstance(all_data, dict) and "error" in all_data:
        raise RuntimeError(f"Erro ao carregar dados do banco de cisalhamento: {all_data['error']}")

    summary_records = []
    generated_files = []

    # 2. Iterate through variations
    for sub in subsets_to_process:
        subset_key = sub['key']
        
        # Filter rows for this subset
        filtered_rows = [
            r for r in all_data
            if is_row_in_subset(r, subset_key, exclude_pc=exclude_prestressed)
        ]

        if len(filtered_rows) < 3:
            # Skip if not enough specimens in this subset
            current_combo += len(vars_to_process)
            continue

        # Precalculate Live Shear Model prediction and Official Code points for this subset
        model_pts_cache = []
        codes_pts_cache = {c['key']: [] for c in DESIGN_CODES}

        for row in filtered_rows:
            pred = compute_shear_model_prediction(row, model_params)
            if pred:
                model_pts_cache.append((row, pred))

            # Cache design code ratios
            for c in DESIGN_CODES:
                ck = c['key']
                cv = row.get(ck)
                if cv is not None and np.isfinite(cv) and cv > 0:
                    codes_pts_cache[ck].append((row, float(cv)))

        for var_meta in vars_to_process:
            current_combo += 1
            var_key = var_meta['key']

            pct = int((current_combo / max(1, total_combinations)) * 100)
            msg = f"Gerando [{sub['label']}] vs {var_meta['label']} ({current_combo}/{total_combinations})..."

            if progress_callback:
                progress_callback(
                    pct, msg, None, False, total_combinations, current_combo
                )

            # Build data points for model
            data_points = []
            for row, pred in model_pts_cache:
                x_val = extract_row_x(row, var_key)
                if x_val > 0 if var_meta['log'] else (x_val is not None and np.isfinite(x_val)):
                    data_points.append({'x': x_val, 'y': pred['ratio']})

            if len(data_points) < 3:
                continue

            # Build data points for comparison codes
            codes_points_dict = {}
            if include_codes:
                for ck, row_pairs in codes_pts_cache.items():
                    c_pts = []
                    for row, code_r in row_pairs:
                        cx = extract_row_x(row, var_key)
                        if cx > 0 if var_meta['log'] else (cx is not None and np.isfinite(cx)):
                            c_pts.append({'x': cx, 'y': code_r})
                    if len(c_pts) >= 5:
                        codes_points_dict[ck] = c_pts

            # Generate filename
            safe_sub = sub['short']
            if exclude_prestressed:
                safe_sub += "_no_pc"
            safe_var = var_meta['short']
            filename = f"shear_{safe_var}_{safe_sub}.png"
            filepath = os.path.join(out_dir, filename)

            # Render plot
            stat_row = generate_single_shear_plot(
                data_points=data_points,
                var_meta=var_meta,
                subset_meta=sub,
                params=model_params,
                out_filepath=filepath,
                codes_points_dict=codes_points_dict,
                dpi=dpi,
                include_codes=include_codes,
            )

            if stat_row:
                stat_row['Exclude_PC'] = bool(exclude_prestressed)
                summary_records.append(stat_row)
                generated_files.append(filename)

                # Send image path for UI live preview
                if progress_callback:
                    rel_img_path = os.path.relpath(filepath, os.getcwd()).replace('\\', '/')
                    progress_callback(
                        pct,
                        f"Salvo: {filename}",
                        rel_img_path,
                        False,
                        total_combinations,
                        current_combo
                    )

    # 3. Save Consolidated Summary Tables (.csv and .json)
    summary_df = pd.DataFrame(summary_records)
    csv_path = os.path.join(out_dir, "shear_variations_summary.csv")
    json_path = os.path.join(out_dir, "shear_variations_summary.json")
    params_path = os.path.join(out_dir, "shear_model_parameters.json")

    summary_df.to_csv(csv_path, index=False, encoding="utf-8-sig")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary_records, f, indent=2, ensure_ascii=False)

    with open(params_path, "w", encoding="utf-8") as f:
        json.dump({
            "parameters": model_params,
            "total_plots_generated": len(generated_files),
            "exclude_prestressed": exclude_prestressed,
            "timestamp": pd.Timestamp.now().isoformat(),
        }, f, indent=2, ensure_ascii=False)

    if progress_callback:
        progress_callback(
            100,
            f"Concluído com sucesso! {len(generated_files)} gráficos e tabela de resumo salvos na pasta.",
            None,
            True,
            total_combinations,
            total_combinations
        )

    return {
        "status": "success",
        "plots_count": len(generated_files),
        "folder": os.path.abspath(out_dir),
        "summary_csv": os.path.abspath(csv_path),
        "summary_json": os.path.abspath(json_path),
        "files": generated_files,
    }


if __name__ == "__main__":
    print("=== SHEAR MODEL BATCH EXPORTER (ROUTINE) ===")
    print("Iniciando rotina de exportação automática de gráficos e variações...")
    
    def cli_cb(pct, msg, img, is_done, total, cur):
        print(f"[{pct:3d}%] {msg}")

    result = run_batch_shear_variations(
        out_dir="plots/shear_model_variations",
        progress_callback=cli_cb,
    )
    print("\n" + "=" * 50)
    print(f"Total de gráficos gerados: {result['plots_count']}")
    print(f"Pasta de destino: {result['folder']}")
    print(f"Tabela de resumo: {result['summary_csv']}")
    print("=" * 50)
