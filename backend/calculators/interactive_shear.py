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
            'a_d': data['a_d'].values.tolist()
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
        result = [
            {k: (None if pd.isna(v) else v) for k, v in row.items()}
            for row in records
        ]
        
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

    C_fixed = 0.5  # C starts fixed and is the LAST resort to change

    # ── STAGE 1 ──────────────────────────────────────────────────────────────
    # Optimize only the shape exponents [α, β, γ, δ] with C locked at 0.5.
    # The objective minimizes CoV while penalising deviation from target_safety.
    def stage1_objective(params):
        alpha, beta, gamma, delta = params
        size_effect = (1 + 200 / d) ** alpha
        v_shape = C_fixed * size_effect * (rho ** beta) * (fck ** gamma) * (a_d ** delta)
        V_calc = v_shape * bw * d
        ratio = V_test / V_calc
        mean_ratio = np.mean(ratio)
        std_ratio  = np.std(ratio)
        cov = std_ratio / mean_ratio
        # Soft penalty pulls mean toward target – more weight as deviation grows
        mean_penalty = 5.0 * abs(mean_ratio - target_safety)
        return cov + mean_penalty

    initial_guess = [0.5, 0.33, 0.33, -0.5]
    print(f"Stage 1: optimising exponents with C={C_fixed} (Target Mean R={target_safety})...")
    res1 = minimize(stage1_objective, initial_guess, method='Nelder-Mead',
                    options={'maxiter': 5000, 'xatol': 1e-6, 'fatol': 1e-6})

    alpha_opt, beta_opt, gamma_opt, delta_opt = res1.x

    # Evaluate what mean we actually achieved in Stage 1
    size_effect_1 = (1 + 200 / d) ** alpha_opt
    v_shape_1 = C_fixed * size_effect_1 * (rho ** beta_opt) * (fck ** gamma_opt) * (a_d ** delta_opt)
    V_calc_1  = v_shape_1 * bw * d
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
        "delta": float(delta_opt)
    }
