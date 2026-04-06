import os
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')   # Non-interactive backend — safe for background threads
import matplotlib.pyplot as plt
import statsmodels.api as sm
from scipy.optimize import minimize
import warnings
warnings.filterwarnings('ignore', category=RuntimeWarning)

def to_latex(name):
    """Convert a column name like R_6118 or V_test into a LaTeX math string."""
    if '_' in name:
        parts = name.split('_', 1)
        base = parts[0]
        sub = parts[1].replace('_', r'\_')
        return r'$' + base + r'_{' + sub + r'}$'
    return name


def plot_sigma_cp(df, r_col, out_dir, subset_name, eel_callback=None, progress_tuple=None):
    """
    Special Sigma_CP treatment: because ~90% of data has σcp=0 (no prestress),
    standard binning is misleading. Instead produce two plots per R/subset combo:
      1) Box plot: R distribution split into 3 groups (σcp<0, σcp=0, σcp>0)
      2) Scatter + binned trend for σcp>0 only (prestressed members)
    """
    SIGMA_COL = "Sigma_CP"
    r_label = to_latex(r_col)

    plot_df = df.dropna(subset=[SIGMA_COL, r_col]).copy()
    plot_df[SIGMA_COL] = pd.to_numeric(plot_df[SIGMA_COL], errors='coerce')
    plot_df[r_col]     = pd.to_numeric(plot_df[r_col],     errors='coerce')
    plot_df = plot_df.dropna(subset=[SIGMA_COL, r_col])
    if plot_df.empty:
        return

    neg  = plot_df.loc[plot_df[SIGMA_COL] <  0, r_col].values
    zero = plot_df.loc[plot_df[SIGMA_COL] == 0, r_col].values
    pos  = plot_df.loc[plot_df[SIGMA_COL] >  0, r_col].values

    safe_subset = subset_name.replace('>', 'gt_').replace(' ', '_').lower()

    # ── Plot 1: Box plot grouped by σcp sign ──────────────────────────────────
    fig, ax = plt.subplots(figsize=(8, 6))
    data_groups = []
    labels = []
    if len(neg)  > 0: data_groups.append(neg);  labels.append(r'$\sigma_{cp} < 0$' + f'\n(n={len(neg)})')
    if len(zero) > 0: data_groups.append(zero); labels.append(r'$\sigma_{cp} = 0$' + f'\n(n={len(zero)})')
    if len(pos)  > 0: data_groups.append(pos);  labels.append(r'$\sigma_{cp} > 0$' + f'\n(n={len(pos)})')

    bp = ax.boxplot(data_groups, labels=labels, patch_artist=True,
                    medianprops=dict(color='red', linewidth=2),
                    flierprops=dict(marker='.', alpha=0.4, markersize=4))
    colors = ['#5588cc', '#aaaaaa', '#cc7744']
    for patch, color in zip(bp['boxes'], colors):
        patch.set_facecolor(color)
        patch.set_alpha(0.55)

    ax.axhline(1.0, linestyle='--', color='black', linewidth=1.2, label='R = 1.0')
    ax.set_ylabel(r'$' + r_col.split('_')[0] + r'_{' + '_'.join(r_col.split('_')[1:]) + r'}$ $(V_{test} / V_{code})$')
    ax.set_title(f'{r_label} — distribution by $\\sigma_{{cp}}$ group [{subset_name}]')
    ax.legend(fontsize=8)
    ax.grid(True, axis='y', alpha=0.3)
    ax.set_ylim(0, plot_df[r_col].quantile(0.995) * 1.1)

    fname_box = f"{r_col}_vs_Sigma_CP_boxplot_{safe_subset}.png"
    fpath_box = os.path.join(out_dir, fname_box)
    plt.savefig(fpath_box, bbox_inches='tight', dpi=150)
    plt.close()
    if eel_callback:
        pct = progress_tuple[0] if progress_tuple else 0
        eel_callback(pct, f"Generated {fname_box}", f"plots/{fname_box}")

    # ── Plot 2: Scatter + binned trend lines for σcp > 0 only ────────────────
    if len(pos) < 5:
        return   # not enough prestressed data
    x_pos = plot_df.loc[plot_df[SIGMA_COL] > 0, SIGMA_COL].values
    y_pos = pos

    x_min, x_max = x_pos.min(), x_pos.max()
    if x_min == x_max:
        return
    n_bins = min(10, len(pos) // 5)
    if n_bins < 2:
        return
    bin_edges   = np.linspace(x_min, x_max, n_bins + 1)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    indices = np.digitize(x_pos, bin_edges)

    med_v = np.full(n_bins, np.nan)
    p05_v = np.full(n_bins, np.nan)
    p10_v = np.full(n_bins, np.nan)
    counts = np.zeros(n_bins, dtype=int)
    min_bc = max(3, len(pos) // n_bins // 2)

    for i in range(1, n_bins + 1):
        yb = y_pos[indices == i]; counts[i-1] = len(yb)
        if len(yb) >= min_bc:
            med_v[i-1] = np.median(yb)
            p05_v[i-1] = np.quantile(yb, 0.05)
            p10_v[i-1] = np.quantile(yb, 0.10)

    fig, ax = plt.subplots(figsize=(8, 6))
    ax.scatter(x_pos, y_pos, s=15, alpha=0.3, color='blue', edgecolors='none', label='Scatter points')
    ax.axhline(1.0, linestyle='--', color='black', linewidth=1.2, label='Safety Limit ($R=1.0$)')
    ax.axhspan(0, 1.0, facecolor='red', alpha=0.1, label='Unsafe Zone')

    # Use LOWESS for smoother trendline
    if len(x_pos) > 5:
        try:
            lowess = sm.nonparametric.lowess(y_pos, x_pos, frac=0.3)
            ax.plot(lowess[:, 0], lowess[:, 1], color='black', linewidth=2, label='LOWESS Trend')
        except Exception:
            pass

    vm = ~np.isnan(med_v)
    if np.any(vm):
        ax.plot(bin_centers[vm], p10_v[vm], color='orange', linestyle='--', linewidth=2, label='Bin p10')
        ax.plot(bin_centers[vm], p05_v[vm], color='red',    linestyle=':',  linewidth=1.5, label='Bin p05')
        for cx, cnt in zip(bin_centers[vm], counts[vm]):
            ax.annotate(str(cnt), xy=(cx, 0.02), xycoords=('data', 'axes fraction'),
                        ha='center', va='bottom', fontsize=6, color='dimgray')

    ax.set_xlabel(r'$\sigma_{cp}$ (MPa)')
    ax.set_ylabel(r'$' + r_col.split('_')[0] + r'_{' + '_'.join(r_col.split('_')[1:]) + r'}$ $(V_{test} / V_{code})$')
    ax.set_title(f'{r_label} vs $\\sigma_{{cp}}$ — prestressed only ($\\sigma_{{cp}} > 0$) [{subset_name}]')
    
    y_cap = np.nanpercentile(y_pos, 98) * 1.1 if len(y_pos) > 0 else 3.0
    ax.set_ylim(0, max(y_cap, 2.0))
    ax.legend(); ax.grid(True, which='both', alpha=0.2)

    fname_pre = f"{r_col}_vs_Sigma_CP_prestressed_{safe_subset}.png"
    fpath_pre = os.path.join(out_dir, fname_pre)
    plt.savefig(fpath_pre, bbox_inches='tight', dpi=150)
    plt.close()
    if eel_callback:
        eel_callback(pct, f"Generated {fname_pre}", f"plots/{fname_pre}")


def export_statistics(df, r_columns, out_dir, eel_callback=None):
    """Calculate Mean, STD, and CoV of V_test / V_code for each code."""
    stats_list = []
    
    for code in r_columns:
        if code not in df.columns:
            continue
            
        data = pd.to_numeric(df[code], errors='coerce').dropna()
        if data.empty:
            continue
            
        mean_val = data.mean()
        std_val = data.std()
        cov_val = std_val / mean_val if mean_val != 0 else np.nan
        
        stats_list.append({
            "Design Code": code,
            "Count": len(data),
            "Mean": mean_val,
            "STD": std_val,
            "CoV": cov_val
        })
        
    if stats_list:
        stats_df = pd.DataFrame(stats_list)
        out_path = os.path.join(out_dir, "statistical_summary.csv")
        stats_df.to_csv(out_path, index=False)
        print(f"Exported statistics to {out_path}")
        if eel_callback:
            eel_callback(95, "Exported statistical summary.", None)


def analyze_nbr6118_size_effect(df, out_dir, eel_callback=None):
    """
    Specifically evaluate NBR 6118 Size Effect for members without shear reinforcement.
    Filter for d > 600 mm and compare against proposed continuous fracture mechanics curve.
    """
    if 'R_6118' not in df.columns or 'd (mm)' not in df.columns:
        return
        
    # Isolate data without shear reinforcement (pw or rho_w = 0)
    no_shear_reinf = df.copy()
    pw_col = next((c for c in df.columns if c in ['pw(%)', 'rho_w', 'Asw/s', 'rho']), None)
    if pw_col:
        no_shear_reinf[pw_col] = pd.to_numeric(no_shear_reinf[pw_col], errors='coerce').fillna(0)
        no_shear_reinf = no_shear_reinf[no_shear_reinf[pw_col] <= 0.001]
        
    df_d = no_shear_reinf.dropna(subset=['d (mm)', 'R_6118']).copy()
    df_d['d (mm)'] = pd.to_numeric(df_d['d (mm)'], errors='coerce')
    df_d['R_6118'] = pd.to_numeric(df_d['R_6118'], errors='coerce')
    
    # Filter for d > 600 mm
    df_deep = df_d[df_d['d (mm)'] > 600].copy()
    
    if len(df_deep) < 5:
        print("Not enough deep member data (d > 600 mm) without shear reinforcement.")
        return
        
    x = df_deep['d (mm)'].values
    y = df_deep['R_6118'].values
    
    plt.figure(figsize=(9, 6))
    plt.scatter(x, y, alpha=0.5, s=25, color='darkred', edgecolors='black', label='Test Data ($d > 600$ mm)')
    plt.axhline(1.0, linestyle="--", color="black", linewidth=2, label='Safety Limit ($R=1.0$)')
    plt.axhspan(0, 1.0, facecolor='red', alpha=0.2, label='Unsafe Zone')
    
    # Trendline for test data
    try:
        lowess = sm.nonparametric.lowess(y, x, frac=0.6)
        plt.plot(lowess[:, 0], lowess[:, 1], color='maroon', linewidth=3, label='Data Trend (LOWESS)')
    except Exception:
        pass
        
    plt.xlabel('Effective Depth, $d$ (mm)', fontsize=12)
    plt.ylabel(r'$V_{test} / V_{code}$ (NBR 6118)', fontsize=12)
    plt.title('NBR 6118 Unconservative Size Effect for Deep Members ($d > 600$ mm)', fontsize=14)
    plt.legend(fontsize=10)
    plt.xlim(max(600, x.min() * 0.95), x.max() * 1.05)
    
    y_cap = np.nanpercentile(y, 98) * 1.2
    plt.ylim(0, max(y_cap, 2.0))
    plt.grid(True, linestyle=':', alpha=0.6)
    
    out_path = os.path.join(out_dir, "NBR6118_deep_members_flaw.png")
    plt.savefig(out_path, bbox_inches='tight', dpi=200)
    plt.close()
    
    # Calculate CoV for proposed new fracture mechanics formula
    # NBR 6118 Size Factor: k_old = max(1, 1.6 - d/1000)
    # Proposed Size Factor (e.g. ACI style): k_new = sqrt(2 / (1 + d/250))
    # Since V_code is proportional to k, R = V_test / V_code implies R_new = R_old * (k_old / k_new)
    d_mm = x
    k_old = np.clip(1.6 - d_mm / 1000.0, 1.0, None)
    k_new = np.sqrt(2.0 / (1.0 + d_mm / 250.0))
    
    R_proposed = y * (k_old / k_new)
    
    mean_old = np.mean(y)
    std_old = np.std(y, ddof=1)
    cov_old = std_old / mean_old if mean_old != 0 else np.nan
    
    mean_new = np.mean(R_proposed)
    std_new = np.std(R_proposed, ddof=1)
    cov_new = std_new / mean_new if mean_new != 0 else np.nan
    
    print("\n--- NBR 6118 Deep Members (d > 600mm) Analysis ---")
    print(f"Current Eq (1.6 - d): Mean={mean_old:.3f}, CoV={cov_old:.3f}")
    print(f"Proposed Eq (Fracture Mechanics): Mean={mean_new:.3f}, CoV={cov_new:.3f}")
    if cov_new < cov_old:
        print(f"-> Proposed equation improves CoV by {(cov_old - cov_new)/cov_old*100:.1f}%!")
    
    if eel_callback:
        eel_callback(98, "Generated NBR 6118 Size Effect plot and CoV comparison.", None)


def optimize_empirical_shear_equation(df, out_dir, eel_callback=None):
    """
    Run a logarithmic Multiple Linear Regression or Scipy Minimize optimization
    to find the perfect exponents for a generalized power-law shear equation.
    """
    print("\n--- OPTIMIZING EMPIRICAL SHEAR EQUATION ---")
    
    try:
        # User snippet specifically uses variables from the "master_shear_database_v2" sheet
        df_opt = pd.read_excel('master_shear_database_v8_GRAPH.xlsx', sheet_name='master_shear_database_v2')
        
        data = df_opt[['Vu (kN)', 'b (mm)', 'd (mm)', 'pw (%)', 'fck (MPa)', 'a:M/V (mm)']].copy()
        data.columns = ['V_test', 'bw', 'd', 'rho', 'fck', 'a']
    except Exception as e:
        print(f"Failed to load 'master_shear_database_v2' sheet or required columns: {e}")
        return
        
    # Clean Data
    data = data.apply(pd.to_numeric, errors='coerce').dropna()
    
    # If rho is a percentage, convert to decimal, else assume decimal
    if data['rho'].max() > 1.0:
        data['rho'] = data['rho'] / 100.0
        
    data['a_d'] = data['a'] / data['d']
    data = data[(data['rho'] > 0) & (data['a_d'] > 0)]
    
    if len(data) < 50:
        print("Not enough non-zero valid data points for optimization.")
        return

    # Extract arrays
    # If V_test is mostly < 1000, it's probably kN; convert to N
    V_test = data['V_test'].values
    if V_test.mean() < 5000:
        V_test = V_test * 1000
        
    bw = data['bw'].values
    d = data['d'].values
    rho = data['rho'].values
    fck = data['fck'].values
    a_d = data['a_d'].values

    # params = [C, alpha, beta, gamma, delta]
    def calc_V_proposed(params):
        C, alpha, beta, gamma, delta = params
        size_effect = (1 + 200 / d)**alpha
        v_c = C * size_effect * (rho**beta) * (fck**gamma) * (a_d**delta)
        return v_c * bw * d

    def objective(params):
        V_calc = calc_V_proposed(params)
        ratio = V_test / V_calc
        mean_ratio = np.mean(ratio)
        std_ratio = np.std(ratio)
        cov = std_ratio / mean_ratio
        
        penalty = 0
        if mean_ratio < 1.0:
            penalty = (1.0 - mean_ratio) * 10
            
        return cov + penalty

    # Initial guess based roughly on NBR 6118 / EC2 mechanics
    initial_guess = [0.18, 0.5, 0.33, 0.33, -0.5]

    try:
        print("Optimizing parameters to minimize CoV...")
        if eel_callback:
            eel_callback(99, "Running Scipy optimization for shear model...", None)
            
        result = minimize(objective, initial_guess, method='Nelder-Mead')
        
        opt_C, opt_alpha, opt_beta, opt_gamma, opt_delta = result.x
        final_V = calc_V_proposed(result.x)
        final_ratios = V_test / final_V
        final_mean = np.mean(final_ratios)
        final_cov = np.std(final_ratios) / final_mean

        print("\n=== OPTIMIZED SHEAR EQUATION (Best Fit) ===")
        print(f"Vc = {opt_C:.3f} * (1 + 200/d)^{opt_alpha:.3f} * rho^{opt_beta:.3f} * fck^{opt_gamma:.3f} * (a/d)^{opt_delta:.3f} * bw * d")
        print(f"Final Mean V_test/V_calc: {final_mean:.3f}")
        print(f"Final CoV: {final_cov:.3f} (Lower = tighter cluster)")
        
        with open(out_dir + "/optimized_shear_equation.txt", "w") as f:
            f.write("=== OPTIMIZED SHEAR EQUATION (Best Fit) ===\n")
            f.write(f"Vc = {opt_C:.3f} * (1 + 200/d)^{opt_alpha:.3f} * rho^{opt_beta:.3f} * fck^{opt_gamma:.3f} * (a/d)^{opt_delta:.3f} * bw * d\n")
            f.write(f"\nOptimization Statistics:\n")
            f.write(f"Count: {len(data)}\n")
            f.write(f"Mean V_test/V_calc: {final_mean:.3f}\n")
            f.write(f"CoV: {final_cov:.3f}\n")
            f.write("\nSuggested parameters for code committee proposal.\n")
            
        if eel_callback:
            eel_callback(100, "Done! New optimized equation generated.", "plots/optimized_shear_equation.txt")
    except Exception as e:
        print(f"Optimization failed: {e}")


def generate_plots(eel_callback=None, file_path=None, out_dir=None):
    if file_path is None:
        file_path = "master_shear_database_v8_GRAPH.xlsx"
    if out_dir is None:
        out_dir = "plots"
    sheet_name = "ALL DATA"
    
    if not os.path.exists(out_dir):
        os.makedirs(out_dir)

    print(f"Loading data from {file_path} (sheet: {sheet_name})...")
    df = pd.read_excel(file_path, sheet_name=sheet_name)
    
    # Strip “Unnamed” columns
    df = df.loc[:, ~df.columns.astype(str).str.contains('^Unnamed')]
    
    # Define columns to process
    x_columns = [
        "d (mm)", 
        "bw/d ratio", 
        "a:M/V (mm)", 
        "rho", 
        "fck_eq", 
        "ag (mm)", 
        "Sigma_CP"
    ]
    r_columns = [
        "R_6118", 
        "R_EC_2004", 
        "R_EC_2023", 
        "R_ACI318_14", 
        "R_ACI318_19", 
        "R_MC2010"
    ]
    subset_flags = ["B>2D", "B>600mm"]
    
    # Check which columns actually exist in the dataframe
    existing_x = [c for c in x_columns if c in df.columns]
    existing_r = [c for c in r_columns if c in df.columns]
    
    if not existing_x or not existing_r:
        print("Missing expected X or R columns in the database. Please verify column names.")
        return

    # Convert X and R columns to numeric, coercing errors to NaN
    for c in existing_x + existing_r:
        df[c] = pd.to_numeric(df[c], errors="coerce")
        
    # Define how to filter subsets
    def get_subset(data, subset_name):
        if subset_name == "all":
            return data
        elif subset_name in data.columns:
            # Handle boolean/numeric/string true encodings
            return data[data[subset_name].isin([True, 1, "1", "TRUE", "True"])]
        else:
            return pd.DataFrame() # empty if column missing
            
    subsets_to_run = ["all", "B>2D", "B>600mm"]
    
    # Variables that we want to plot on a log-x scale (must be strictly positive)
    log_x_vars = ["d (mm)", "a:M/V (mm)", "bw/d ratio", "rho"]
    
    min_bin_count = 20
    n_bins = 20
    
    # Per-variable overrides — for sparse / zero-dominated variables
    # that can't fill 20 bins with 20+ points each
    var_overrides = {
        # Sigma_CP: most specimens have σ=0 (no prestress), data is sparse
        # Use few bins so the non-zero range still gets trend lines
        "Sigma_CP": {"n_bins": 8, "min_bin_count": 5},
    }
    
    # 7) Run a batch of plots
    total_plots = len(existing_r) * len(existing_x) * len(subsets_to_run)
    current_plot = 0
    
    for r_col in existing_r:
        print(f"Processing '{r_col}'...")
        if eel_callback:
            eel_callback(current_plot / total_plots * 100, f"Processing '{r_col}'...", None)

        for x_col in existing_x:
            # Apply per-variable overrides if defined
            _ovr = var_overrides.get(x_col, {})
            _n_bins = _ovr.get("n_bins", n_bins)
            _min_bin_count = _ovr.get("min_bin_count", min_bin_count)

            for subset in subsets_to_run:
                current_plot += 1

                # Check subset flag definition if not "all"
                if subset != "all" and subset not in df.columns:
                    continue

                df_sub = get_subset(df, subset)
                if df_sub.empty:
                    continue

                # ── Sigma_CP: use special box + prestressed-scatter plots ────
                if x_col == "Sigma_CP":
                    plot_sigma_cp(
                        df_sub, r_col, out_dir, subset,
                        eel_callback=eel_callback,
                        progress_tuple=(current_plot / total_plots * 100,),
                    )
                    continue

                # Drop rows where X or R is NaN
                plot_df = df_sub.dropna(subset=[x_col, r_col]).copy()
                if plot_df.empty:
                    continue

                x = plot_df[x_col].values
                y = plot_df[r_col].values

                # Determine binning strategy
                use_log = (x_col in log_x_vars)
                
                if use_log:
                    # Keep only strictly positive for log scale
                    pos_mask = x > 0
                    x = x[pos_mask]
                    y = y[pos_mask]
                    
                    if len(x) == 0:
                        continue
                        
                    x_min, x_max = x.min(), x.max()
                    if x_min == x_max:
                        continue
                        
                    bin_edges = np.logspace(np.log10(x_min), np.log10(x_max), _n_bins + 1)
                    # bin center = geometric mean
                    bin_centers = np.sqrt(bin_edges[:-1] * bin_edges[1:])
                else:
                    x_min, x_max = x.min(), x.max()
                    if x_min == x_max:
                        continue
                        
                    bin_edges = np.linspace(x_min, x_max, _n_bins + 1)
                    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
                    
                # Digitize to assign elements to bins
                indices = np.digitize(x, bin_edges)

                # Adapt min_bin_count to the actual number of points in this subset.
                # Smaller subsets (B>2D, B>600mm) would otherwise get no trend lines
                # because they can't fill 20 bins with 20 points each.
                # Formula: at least 5, at most the configured _min_bin_count,
                # scaled down if there are too few total points.
                n_pts = len(x)
                adaptive_min = max(5, min(_min_bin_count, n_pts // _n_bins // 2))
                
                med_vals  = np.full(_n_bins, np.nan)
                p05_vals  = np.full(_n_bins, np.nan)
                p10_vals  = np.full(_n_bins, np.nan)
                bin_counts = np.zeros(_n_bins, dtype=int)
                
                for i in range(1, _n_bins + 1):
                    y_bin = y[indices == i]
                    bin_counts[i-1] = len(y_bin)
                    if len(y_bin) >= adaptive_min:
                        med_vals[i-1] = np.median(y_bin)
                        p05_vals[i-1] = np.quantile(y_bin, 0.05)
                        p10_vals[i-1] = np.quantile(y_bin, 0.10)
                        
                # 5) Plot
                plt.figure(figsize=(8, 6))
                
                # Add transparency and reduce marker size for heat map effect
                plt.scatter(x, y, alpha=0.3, s=15, color='blue', edgecolors='none', label='Scatter points')
                
                # horizontal line at 1.0 and shade unsafe zone
                plt.axhline(1.0, linestyle="--", color="black", label='Safety Limit ($R=1.0$)')
                plt.axhspan(0, 1.0, facecolor='red', alpha=0.1, label='Unsafe Zone')
                
                # Apply LOWESS trendline instead of jagged bin median
                if len(x) > 10:
                    try:
                        mask = np.isfinite(x) & np.isfinite(y)
                        if mask.sum() > 10:
                            lowess = sm.nonparametric.lowess(y[mask], x[mask], frac=0.4)
                            plt.plot(lowess[:, 0], lowess[:, 1], color='black', linewidth=2, label='LOWESS Trend')
                    except Exception:
                        pass
                
                valid_mask = ~np.isnan(med_vals)
                if np.any(valid_mask):
                    plt.plot(bin_centers[valid_mask], p10_vals[valid_mask],
                             color='orange', linestyle='--', linewidth=2, label='Bin p10')
                    plt.plot(bin_centers[valid_mask], p05_vals[valid_mask],
                             color='red', linestyle=':', linewidth=1.5, label='Bin p05')
                    
                    # Bin count annotations along the bottom
                    for cx, cnt in zip(bin_centers[valid_mask], bin_counts[valid_mask]):
                        plt.annotate(str(cnt), xy=(cx, 0.02), xycoords=('data', 'axes fraction'),
                                     ha='center', va='bottom', fontsize=6, color='dimgray')
                    
                if use_log:
                    plt.xscale("log")
                    
                # Y-axis: Cap extreme outliers using 98th or 99th percentile
                if y.size > 0:
                    y_cap = np.nanpercentile(y, 98) * 1.1
                    y_cap = max(y_cap, 2.0)
                    plt.ylim(0, y_cap)
                
                plt.xlabel(x_col)
                plt.ylabel(r'$' + r_col.split('_')[0] + r'_{' + '_'.join(r_col.split('_')[1:]) + r'}$ $(V_{test} / V_{code})$')
                r_label = to_latex(r_col)
                plt.title(f"{r_label} vs {x_col} [{subset}]")
                plt.legend()
                plt.grid(True, which="both", ls="-", alpha=0.2)
                
                # 6) Save outputs
                safe_x_col = x_col.replace("/", "_").replace(":", "_").replace(" ", "_").replace("(", "").replace(")", "")
                safe_subset = subset.replace(">", "gt_").replace(" ", "_").lower()
                filename = f"{r_col}_vs_{safe_x_col}_{safe_subset}.png"
                filepath = os.path.join(out_dir, filename)
                
                plt.savefig(filepath, bbox_inches='tight', dpi=150)
                plt.close()
                
                if eel_callback:
                    eel_callback((current_plot / total_plots) * 100, f"Generated {filename}", f"plots/{filename}")

    print("Generating statistical tables...")
    export_statistics(df, existing_r, out_dir, eel_callback)

    print("Analyzing NBR 6118 Size Effect...")
    analyze_nbr6118_size_effect(df, out_dir, eel_callback)
    
    optimize_empirical_shear_equation(df, out_dir, eel_callback)

    if eel_callback:
        eel_callback(100, "All calculations completed successfully.", None)

if __name__ == "__main__":
    generate_plots()
    print("All plots generated successfully. Check the /plots/ directory.")
