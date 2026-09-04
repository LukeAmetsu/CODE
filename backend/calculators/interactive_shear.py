import pandas as pd
import numpy as np
from scipy.optimize import minimize
import os

_cached_data = None

def load_and_clean_data():
    global _cached_data
    if _cached_data is not None:
        return _cached_data
        
    # Find the root project folder
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(backend_dir, '..', '..'))
    file_path = os.path.join(project_root, 'master_shear_database_v8_GRAPH.xlsx')
    
    try:
        df = pd.read_excel(file_path, sheet_name='master_shear_database_v2')
        data = df[['Vu (kN)', 'b (mm)', 'd (mm)', 'pw (%)', 'fck (MPa)', 'a:M/V (mm)']].copy()
        data.columns = ['V_test', 'bw', 'd', 'rho', 'fck', 'a']
        data['d_dg'] = pd.to_numeric(df['d_dg'], errors='coerce').fillna(32.0)
        data = data.apply(pd.to_numeric, errors='coerce').dropna()
        if data['rho'].max() > 1.0:
            data['rho'] = data['rho'] / 100.0
        data['a_d'] = data['a'] / data['d']
        data = data[(data['rho'] > 0) & (data['a_d'] > 0)]
        
        # Convert kN to N if needed
        V_test_array = data['V_test'].values
        if V_test_array.mean() < 5000:
            V_test_array = V_test_array * 1000
            
        result_dict = {
            'V_test': V_test_array.tolist(),
            'bw': data['bw'].values.tolist(),
            'd': data['d'].values.tolist(),
            'rho': data['rho'].values.tolist(),
            'fck': data['fck'].values.tolist(),
            'a_d': data['a_d'].values.tolist(),
            'd_dg': data['d_dg'].values.tolist()
        }
        _cached_data = result_dict
        return result_dict
    except Exception as e:
        print(f"Error loading shear data: {e}")
        return {"error": str(e)}

_cached_all_data = None

def get_all_codes_dataset():
    global _cached_all_data
    if _cached_all_data is not None:
        return _cached_all_data
        
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(backend_dir, '..', '..'))
    file_path = os.path.join(project_root, 'master_shear_database_v8_GRAPH.xlsx')
    
    try:
        df = pd.read_excel(file_path, sheet_name='master_shear_database_v2')
        
        # Strip trailing/leading spaces from column names to prevent mismatch bugs
        df.columns = df.columns.str.strip()
        
        # We serialize the entire dataframe so the frontend has access to ALL variables
        # (including Sigma_CP, V_test, etc.) without missing unlisted columns.
        records = df.to_dict('records')
        
        # Safely convert NaN floats to literal Python None for valid JSON serialization
        import backend.calculators.official_shear_codes as osc
        
        result = []
        for row in records:
            clean_row = {k: (None if pd.isna(v) else v) for k, v in row.items()}
            
            try:
                # Extract basic params
                bw = clean_row.get('bw (mm)') or clean_row.get('b (mm)', 0)
                d = clean_row.get('d (mm)', 0)
                rho = clean_row.get('pw (%)') or clean_row.get('rho', 0)
                if rho and rho > 0.1: rho = rho / 100.0 # ensure it's a decimal
                fck = clean_row.get('fck (MPa)') or clean_row.get('fck_eq', 0)
                a = clean_row.get('a:M/V (mm)', 0)
                a_d = a / d if (a and d and d > 0) else 0
                d_dg = clean_row.get('d_dg')
                if not d_dg or d_dg <= 0: d_dg = 16.0
                
                v_test = clean_row.get('Vu (kN)', 0)
                
                if bw and d and fck and v_test and v_test > 0:
                    v_mc1 = osc.calc_mc2010_level_1(bw, d, fck)
                    v_mc2 = osc.calc_mc2010_level_2(bw, d, rho, fck, a_d, d_dg)
                    v_ec2_04 = osc.calc_ec2_2004(bw, d, rho, fck)
                    v_ec2_23 = osc.calc_ec2_2023(bw, d, rho, fck, a_d, d_dg)
                    v_aci_14 = osc.calc_aci318_14(bw, d, fck)
                    v_aci_19 = osc.calc_aci318_19(bw, d, rho, fck)
                    v_nbr = osc.calc_nbr6118(bw, d, rho, fck)
                    
                    if v_mc1 and v_mc1 > 0: clean_row['A_MC2010_L1'] = v_test / v_mc1
                    if v_mc2 and v_mc2 > 0: clean_row['A_MC2010_L2'] = v_test / v_mc2
                    if v_ec2_04 and v_ec2_04 > 0: clean_row['A_EC2_2004'] = v_test / v_ec2_04
                    if v_ec2_23 and v_ec2_23 > 0: clean_row['A_EC2_2023'] = v_test / v_ec2_23
                    if v_aci_14 and v_aci_14 > 0: clean_row['A_ACI_14'] = v_test / v_aci_14
                    if v_aci_19 and v_aci_19 > 0: clean_row['A_ACI_19'] = v_test / v_aci_19
                    if v_nbr and v_nbr > 0: clean_row['A_NBR6118'] = v_test / v_nbr
            except Exception as e:
                pass # skip if math fails
            
            result.append(clean_row)
        
        _cached_all_data = result
        return result
    except Exception as e:
        print(f"Error loading ALL DATA: {e}")
        return {"error": str(e)}

def get_lowess(x, y, frac=0.3):
    import statsmodels.api as sm
    try:
        if len(x) < 3:
            return []
        # Sort values internally to prevent LOWESS geometry artifacting
        df = pd.DataFrame({'x': x, 'y': y}).dropna().sort_values('x')
        if df.empty or len(df) < 3:
            return []
        lowess = sm.nonparametric.lowess(df['y'], df['x'], frac=frac)
        
        # Downsample to ~200 points to keep payload snappy while preserving pure shape
        if len(lowess) > 200:
            indices = np.linspace(0, len(lowess) - 1, 200, dtype=int)
            lowess = lowess[indices]
            
        return [{"x": float(row[0]), "y": float(row[1])} for row in lowess]
    except Exception as e:
        print(f"LOWESS Error: {e}")
        return []

def run_optimization(target_safety=1.0):
    data = load_and_clean_data()
    if "error" in data:
        return data

    V_test = np.array(data['V_test'])
    bw = np.array(data['bw'])
    d = np.array(data['d'])
    rho = np.array(data['rho'])
    fck = np.array(data['fck'])
    a_d = np.array(data['a_d'])
    d_dg = np.array(data['d_dg'])

    C_fixed = 0.5  # C starts fixed and is the LAST resort to change

    # ── STAGE 1 ──────────────────────────────────────────────────────────────
    # Optimize only the shape exponents [α, β, γ, δ, ε, ζ] with C locked at 0.5.
    # The objective minimizes CoV while penalising deviation from target_safety.
    def stage1_objective(params):
        alpha, beta, gamma, delta, epsilon, zeta = params
        size_effect = (d_dg / d) ** alpha
        v_shape = C_fixed * size_effect * (rho ** beta) * (fck ** gamma) * (a_d ** delta)
        V_calc = v_shape * (bw ** epsilon) * (d ** zeta)
        ratio = V_test / V_calc
        mean_ratio = np.mean(ratio)
        std_ratio  = np.std(ratio)
        cov = std_ratio / mean_ratio
        # Soft penalty pulls mean toward target – more weight as deviation grows
        mean_penalty = 5.0 * abs(mean_ratio - target_safety)
        return cov + mean_penalty

    initial_guess = [0.5, 0.33, 0.33, -0.5, 1.0, 1.0]
    print(f"Stage 1: optimising exponents with C={C_fixed} (Target Mean R={target_safety})...")
    res1 = minimize(stage1_objective, initial_guess, method='Nelder-Mead',
                    options={'maxiter': 5000, 'xatol': 1e-6, 'fatol': 1e-6})

    alpha_opt, beta_opt, gamma_opt, delta_opt, epsilon_opt, zeta_opt = res1.x

    # Evaluate what mean we actually achieved in Stage 1
    size_effect_1 = (d_dg / d) ** alpha_opt
    v_shape_1 = C_fixed * size_effect_1 * (rho ** beta_opt) * (fck ** gamma_opt) * (a_d ** delta_opt)
    V_calc_1  = v_shape_1 * (bw ** epsilon_opt) * (d ** zeta_opt)
    achieved_mean = float(np.mean(V_test / V_calc_1))
    achieved_cov  = float(np.std(V_test / V_calc_1) / achieved_mean)

    print(f"Stage 1 result: Mean R={achieved_mean:.4f}, CoV={achieved_cov:.4f}, C={C_fixed}")

    # ── STAGE 2 ──────────────────────────────────────────────────────────────
    # If Stage 1 landed within 2% of target, keep C = 0.5 (no correction needed).
    # Otherwise scale C algebraically to close the gap precisely.
    TOLERANCE = 0.02
    final_C = C_fixed
    if abs(achieved_mean - target_safety) > TOLERANCE:
        # mean(V_test / (C * V_shape_1)) = achieved_mean / C  =>  C = achieved_mean / target_safety
        final_C = achieved_mean / target_safety
        print(f"Stage 2: C adjusted from {C_fixed} → {final_C:.4f} to reach Mean R={target_safety}")
    else:
        print(f"Stage 2: C kept at {C_fixed} (achieved mean is within tolerance)")

    return {
        "C": float(final_C),
        "alpha": float(alpha_opt),
        "beta": float(beta_opt),
        "gamma": float(gamma_opt),
        "delta": float(delta_opt),
        "epsilon": float(epsilon_opt),
        "zeta": float(zeta_opt)
    }

def batch_compare_lowess(live_curve, other_curves_dict):
    """
    Compares the LIVE_MODEL LOWESS curve to a dictionary of other codes' curves.
    Returns a dictionary of metrics for each code.
    """
    from scipy.interpolate import interp1d
    from scipy.stats import pearsonr
    
    if not live_curve or len(live_curve) < 2:
        return {}
        
    x_live = np.array([pt['x'] for pt in live_curve])
    y_live = np.array([pt['y'] for pt in live_curve])
    
    results = {}
    for code_name, curve in other_curves_dict.items():
        if not curve or len(curve) < 2:
            continue
            
        x_other = np.array([pt['x'] for pt in curve])
        y_other = np.array([pt['y'] for pt in curve])
        
        # 1. Find overlapping domain
        min_x = max(x_live.min(), x_other.min())
        max_x = min(x_live.max(), x_other.max())
        
        if min_x >= max_x:
            continue # No overlap
            
        # 2. Interpolate on a common grid
        grid_x = np.linspace(min_x, max_x, 100)
        
        f_live = interp1d(x_live, y_live, kind='linear', bounds_error=False, fill_value="extrapolate")
        f_other = interp1d(x_other, y_other, kind='linear', bounds_error=False, fill_value="extrapolate")
        
        y_live_grid = f_live(grid_x)
        y_other_grid = f_other(grid_x)
        
        # 3. Compute Metrics
        # Pearson R
        try:
            r_val, _ = pearsonr(y_live_grid, y_other_grid)
        except Exception:
            r_val = 0.0
            
        # RMSE
        rmse = np.sqrt(np.mean((y_live_grid - y_other_grid)**2))
        
        # Derivative R
        dy_live = np.gradient(y_live_grid, grid_x)
        dy_other = np.gradient(y_other_grid, grid_x)
        try:
            r_deriv, _ = pearsonr(dy_live, dy_other)
        except Exception:
            r_deriv = 0.0
            
        import math
        def safe_float(v):
            if v is None or math.isnan(v) or math.isinf(v):
                return 0.0
            return float(v)
            
        results[code_name] = {
            "pearson": safe_float(r_val),
            "rmse": safe_float(rmse),
            "deriv_r": safe_float(r_deriv)
        }
        
    return results
