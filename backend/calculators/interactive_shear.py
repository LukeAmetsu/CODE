import pandas as pd
import numpy as np
from scipy.optimize import minimize
import os
import pickle

_cached_subsets = {}

def is_row_in_subset(row, subset_key):
    """Evaluates whether a database row belongs to the specified subset_key."""
    bd = float(row.get('d (mm)') or row.get('d') or 0.0)
    bbw = float(row.get('bw (mm)') or row.get('b (mm)') or row.get('bw') or 0.0)
    if bbw <= 0 and bd > 0:
        bwd_ratio = float(row.get('bw/d ratio') or 0.0)
        if bwd_ratio > 0:
            bbw = bwd_ratio * bd

    brho = float(row.get('pw (%)') or (row.get('rho', 0.0) * 100.0 if row.get('rho') is not None else 0.0))
    rho = (brho / 100.0) if brho > 0.1 else brho
    bfck = float(row.get('fck (MPa)') or row.get('fck_eq') or row.get('fck') or 0.0)
    bV = float(row.get('Vu (kN)') or row.get('V_test') or 0.0)
    ba_d = float(row.get('a_d') or 0.0)
    if ba_d <= 0:
        ba_mm = float(row.get('a_cs') or (row.get('a (mm)') or (float(row.get('a:M/V (mm)') or 0.0) * 1000.0)))
        if ba_mm > 0 and bd > 0:
            ba_d = ba_mm / bd

    bddg = float(row.get('d_dg') or 32.0)
    if bddg <= 0 or np.isnan(bddg):
        bddg = 32.0

    bwd = (bbw / bd) if (bd > 0 and bbw > 0) else 0.0
    b_2d = row.get('B>2D')
    is_slab = (b_2d is True or b_2d == 1 or bwd >= 2.0)

    # Validate physical presence of required variables
    if not (bd > 0 and rho > 0 and bfck > 0 and ba_d > 0 and bbw > 0 and bV > 0):
        return False
    if np.isnan(bd) or np.isnan(rho) or np.isnan(bfck) or np.isnan(ba_d) or np.isnan(bbw) or np.isnan(bV):
        return False

    if not subset_key or subset_key in ('ALL DATA', 'all', ''):
        return True

    # Slabs subsets
    if subset_key == 'slabs_slender_600':
        return is_slab and bd < 600.0
    if subset_key in ('slabs_slender_400', 'slabs_slender'):
        return is_slab and bd < 400.0
    if subset_key in ('slabs_thick_600', 'B>600mm'):
        return bd >= 600.0
    if subset_key == 'slabs_thick_400':
        return is_slab and bd >= 400.0
    if subset_key in ('slabs_all', 'B>2D'):
        return is_slab
    if subset_key in ('slabs_wide', 'B>5D'):
        b_5d = row.get('B>5D')
        return bwd >= 5.0 or b_5d is True or b_5d == 1

    # Depth subsets
    if subset_key in ('members_slender_600', 'd<600'):
        return bd < 600.0
    if subset_key in ('members_slender_400', 'd<400'):
        return bd < 400.0
    if subset_key == 'd>400':
        return bd > 400.0
    if subset_key == 'bw>300':
        return bbw > 300.0

    # a/d span subsets
    if subset_key in ('members_long_span', 'members_slender', 'a_d>2.5'):
        return ba_d >= 2.5
    if subset_key in ('members_short_span', 'members_short'):
        return 0.0 < ba_d < 2.5

    # Reinforcement & Materials
    if subset_key in ('rho_low', 'rho<1'):
        return rho < 0.01
    if subset_key == 'rho_very_low':
        return rho < 0.005
    if subset_key == 'rho_high':
        return rho >= 0.015
    if subset_key in ('fck_high', 'fck>50'):
        return bfck > 50.0
    if subset_key == 'fck_normal':
        return bfck <= 50.0
    if subset_key in ('d_dg_large', 'd_dg>32'):
        return bddg > 32.0
    if subset_key == 'mat_rc':
        m = str(row.get('Member class (inferred)') or '')
        src = str(row.get('Source sheet') or '')
        return m == 'RC' or ('PC' not in src)
    if subset_key == 'mat_pc':
        m = str(row.get('Member class (inferred)') or '')
        src = str(row.get('Source sheet') or '')
        return m == 'PC' or ('PC' in src)

    return True


def load_and_clean_data(subset_key='ALL DATA'):
    """
    Loads shear database rows filtered by the requested subset_key.
    Returns clean arrays for Nelder-Mead optimization and analytical C calibration.
    """
    global _cached_subsets
    subset_key = str(subset_key or 'ALL DATA').strip()
    if subset_key in _cached_subsets:
        return _cached_subsets[subset_key]

    all_records = get_all_codes_dataset()
    if isinstance(all_records, dict) and "error" in all_records:
        return all_records

    filtered = [r for r in all_records if is_row_in_subset(r, subset_key)]
    if len(filtered) < 3:
        if subset_key != 'ALL DATA':
            filtered = [r for r in all_records if is_row_in_subset(r, 'ALL DATA')]
        if len(filtered) < 3:
            return {"error": f"Recorte '{subset_key}' possui poucas amostras válidas ({len(filtered)})."}

    v_test = []
    bw = []
    d = []
    rho = []
    fck = []
    a_d = []
    d_dg = []

    for r in filtered:
        bd = float(r.get('d (mm)') or 0.0)
        bbw = float(r.get('bw (mm)') or r.get('b (mm)') or 0.0)
        if bbw <= 0 and bd > 0:
            bwd_ratio = float(r.get('bw/d ratio') or 0.0)
            if bwd_ratio > 0:
                bbw = bwd_ratio * bd

        brho = float(r.get('pw (%)') or (r.get('rho', 0.0) * 100.0 if r.get('rho') is not None else 0.0))
        cur_rho = (brho / 100.0) if brho > 0.1 else brho
        cur_fck = float(r.get('fck (MPa)') or r.get('fck_eq') or 0.0)
        cur_vu_n = float(r.get('Vu (kN)') or 0.0) * 1000.0
        cur_ad = float(r.get('a_d') or 0.0)
        if cur_ad <= 0:
            raw_a = float(r.get('a_cs') or (float(r.get('a:M/V (mm)') or 0.0) * 1000.0))
            if raw_a > 0 and bd > 0:
                cur_ad = raw_a / bd
        cur_ddg = float(r.get('d_dg') or 32.0)
        if cur_ddg <= 0 or np.isnan(cur_ddg):
            cur_ddg = 32.0

        v_test.append(cur_vu_n)
        bw.append(bbw)
        d.append(bd)
        rho.append(cur_rho)
        fck.append(cur_fck)
        a_d.append(cur_ad)
        d_dg.append(cur_ddg)

    result_dict = {
        'V_test': v_test,
        'bw': bw,
        'd': d,
        'rho': rho,
        'fck': fck,
        'a_d': a_d,
        'd_dg': d_dg,
        'subset': subset_key,
        'count': len(filtered)
    }
    _cached_subsets[subset_key] = result_dict
    return result_dict

_cached_all_data = None

def get_all_codes_dataset():
    global _cached_all_data
    if _cached_all_data is not None:
        return _cached_all_data
        
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(backend_dir, '..', '..'))
    file_path = os.path.join(project_root, 'master_shear_database_v8_GRAPH.xlsx')
    cache_path = os.path.join(project_root, '.shear_all_codes_cache.pkl')
    
    # Fast load from binary cache if newer than xlsx
    if os.path.exists(cache_path) and os.path.exists(file_path):
        try:
            if os.path.getmtime(cache_path) >= os.path.getmtime(file_path):
                with open(cache_path, 'rb') as f:
                    _cached_all_data = pickle.load(f)
                    return _cached_all_data
        except Exception:
            pass
    
    try:
        df = pd.read_excel(file_path, sheet_name='master_shear_database_v2')
        
        # Strip trailing/leading spaces from column names to prevent mismatch bugs
        df.columns = df.columns.str.strip()
        
        records = df.to_dict('records')
        
        import backend.calculators.official_shear_codes as osc
        
        result = []
        for row in records:
            clean_row = {k: (None if pd.isna(v) else (bool(v) if isinstance(v, (bool, np.bool_)) else (float(v) if isinstance(v, (int, float, np.number)) else v))) for k, v in row.items()}
            
            try:
                # Extract basic params
                bw = clean_row.get('bw (mm)') or clean_row.get('b (mm)', 0)
                d = clean_row.get('d (mm)', 0)
                rho = clean_row.get('pw (%)') or ((clean_row.get('rho', 0) or 0) * 100.0)
                if rho and rho > 0.1: rho = rho / 100.0 # ensure it's a decimal
                fck = clean_row.get('fck (MPa)') or clean_row.get('fck_eq', 0)
                
                # Shear span: column a_cs is in mm; a:M/V (mm) is actually in meters
                a_mm = clean_row.get('a_cs')
                if not a_mm or a_mm <= 0:
                    raw_a = clean_row.get('a:M/V (mm)', 0)
                    a_mm = (raw_a * 1000.0) if (raw_a and raw_a < 50.0) else (raw_a or 0)
                a_d = (a_mm / d) if (a_mm and d and d > 0) else 0
                
                d_dg = clean_row.get('d_dg')
                if not d_dg or d_dg <= 0: d_dg = 32.0
                
                clean_row['a_d'] = float(a_d)
                clean_row['a (mm)'] = float(a_mm)
                
                v_test = clean_row.get('Vu (kN)', 0)
                
                if bw and d and fck and v_test and v_test > 0:
                    v_mc1 = osc.calc_mc2010_level_1(bw, d, fck)
                    v_mc2 = osc.calc_mc2010_level_2(bw, d, rho, fck, a_d, d_dg)
                    v_ec2_04 = osc.calc_ec2_2004(bw, d, rho, fck)
                    v_ec2_23 = osc.calc_ec2_2023(bw, d, rho, fck, a_d, d_dg)
                    v_aci_14 = osc.calc_aci318_14(bw, d, fck)
                    v_aci_19 = osc.calc_aci318_19(bw, d, rho, fck)
                    v_nbr = osc.calc_nbr6118(bw, d, rho, fck)
                    
                    if v_mc1 and v_mc1 > 0: clean_row['A_MC2010_L1'] = float(v_test / v_mc1)
                    if v_mc2 and v_mc2 > 0: clean_row['A_MC2010_L2'] = float(v_test / v_mc2)
                    if v_ec2_04 and v_ec2_04 > 0: clean_row['A_EC2_2004'] = float(v_test / v_ec2_04)
                    if v_ec2_23 and v_ec2_23 > 0: clean_row['A_EC2_2023'] = float(v_test / v_ec2_23)
                    if v_aci_14 and v_aci_14 > 0: clean_row['A_ACI_14'] = float(v_test / v_aci_14)
                    if v_aci_19 and v_aci_19 > 0: clean_row['A_ACI_19'] = float(v_test / v_aci_19)
                    if v_nbr and v_nbr > 0: clean_row['A_NBR6118'] = float(v_test / v_nbr)
            except Exception as e:
                pass # skip if math fails
            
            result.append(clean_row)
        
        _cached_all_data = result
        try:
            with open(cache_path, 'wb') as f:
                pickle.dump(result, f, protocol=pickle.HIGHEST_PROTOCOL)
        except Exception:
            pass
        return result
    except Exception as e:
        print(f"Error loading ALL DATA: {e}")
        return {"error": str(e)}

def get_lowess(x, y, frac=0.3):
    """Pure NumPy implementation of LOWESS local linear regression (no statsmodels required)."""
    try:
        x = np.asarray(x, dtype=float)
        y = np.asarray(y, dtype=float)
        valid = np.isfinite(x) & np.isfinite(y)
        x, y = x[valid], y[valid]
        if len(x) < 3:
            return []
            
        sort_idx = np.argsort(x)
        x, y = x[sort_idx], y[sort_idx]
        
        num_points = min(100, len(x))
        eval_x = np.linspace(x[0], x[-1], num_points)
        n = len(x)
        k = max(4, int(np.ceil(frac * n)))
        
        eval_y = []
        for x0 in eval_x:
            dists = np.abs(x - x0)
            idx_k = np.argpartition(dists, k-1)[:k]
            sub_dists = dists[idx_k]
            d_max = np.max(sub_dists)
            if d_max == 0:
                eval_y.append(float(np.mean(y[idx_k])))
                continue
            u = sub_dists / d_max
            w = (1.0 - u**3)**3
            sub_x = x[idx_k] - x0
            sub_y = y[idx_k]
            sum_w = np.sum(w)
            if sum_w == 0:
                eval_y.append(float(np.mean(sub_y)))
                continue
            sum_wx = np.sum(w * sub_x)
            sum_wy = np.sum(w * sub_y)
            sum_wxx = np.sum(w * sub_x * sub_x)
            sum_wxy = np.sum(w * sub_x * sub_y)
            denom = sum_w * sum_wxx - sum_wx * sum_wx
            if abs(denom) < 1e-12:
                a0 = sum_wy / sum_w
            else:
                a0 = (sum_wy * sum_wxx - sum_wx * sum_wxy) / denom
            eval_y.append(float(max(0.0, a0)))
            
        return [{"x": float(ex), "y": float(ey)} for ex, ey in zip(eval_x, eval_y)]
    except Exception as e:
        print(f"LOWESS Error: {e}")
        return []

def run_optimization(target_safety=1.0, locked=None, current_vals=None, criterion='cov', subset_key='ALL DATA'):
    """
    Fits the empirical shear formula exponents using SciPy Nelder-Mead on the requested subset_key.
    
    criterion:
      - 'cov': Calibrates around pure COV (Coefficient of Variation) to find lowest scatter.
               STRICT BEHAVIOR: Constant C is NOT varied at all. C remains fixed at its current value.
      - 'mean': Calibrates around the Mean Safety Margin (Target Safety).
                If C is free: adjusts C to achieve the target mean exactly.
                If C is locked: calibrates free exponents so that the model mean converges to target_safety.
    """
    data = load_and_clean_data(subset_key=subset_key)
    if "error" in data:
        return data

    V_test = np.array(data['V_test'])
    bw = np.array(data['bw'])
    d = np.array(data['d'])
    rho = np.array(data['rho'])
    fck = np.array(data['fck'])
    a_d = np.array(data['a_d'])
    d_dg = np.array(data['d_dg'])

    if locked is None:
        locked = {}
    if current_vals is None:
        current_vals = {}

    defaults = {
        'C': 0.22,
        'alpha': 0.37,
        'beta': 0.18,
        'gamma': 0.54,
        'delta': -0.24,
        'epsilon': 0.90,
        'zeta': 1.32
    }
    
    vals = {}
    for k in defaults:
        v = current_vals.get(k)
        try:
            vals[k] = float(v) if v is not None else defaults[k]
        except (ValueError, TypeError):
            vals[k] = defaults[k]

    criterion_mode = str(criterion or 'cov').lower().strip()
    is_cov_mode = (criterion_mode == 'cov' or 'cov' in criterion_mode or 'dispersao' in criterion_mode)

    c_locked = bool(locked.get('C', False))
    exponent_keys = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
    free_exponents = [k for k in exponent_keys if not bool(locked.get(k, False))]

    # Case 1: Everything is locked
    if not free_exponents and (c_locked or is_cov_mode):
        log_ddg_d = np.log(d_dg / d)
        log_rho = np.log(100.0 * rho)
        log_fck = np.log(fck)
        log_ad = np.log(a_d)
        log_bw = np.log(bw)
        log_d = np.log(d)
        log_v_no_c = (vals['alpha'] * log_ddg_d + vals['beta'] * log_rho +
                      vals['gamma'] * log_fck + vals['delta'] * log_ad +
                      vals['epsilon'] * log_bw + vals['zeta'] * log_d)
        V_calc_no_c = np.exp(log_v_no_c)
        final_ratio = V_test / (vals['C'] * V_calc_no_c)
        cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
        out = {k: float(vals[k]) for k in defaults}
        out['_cov'] = round(cov, 2)
        out['_mean'] = round(float(np.mean(final_ratio)), 3)
        out['_criterion'] = criterion_mode
        return out

    # Case 2: Only C is free (all shape exponents are locked) in Mean mode
    if not free_exponents and not c_locked and not is_cov_mode:
        log_ddg_d = np.log(d_dg / d)
        log_rho = np.log(100.0 * rho)
        log_fck = np.log(fck)
        log_ad = np.log(a_d)
        log_bw = np.log(bw)
        log_d = np.log(d)
        log_v_no_c = (vals['alpha'] * log_ddg_d + vals['beta'] * log_rho +
                      vals['gamma'] * log_fck + vals['delta'] * log_ad +
                      vals['epsilon'] * log_bw + vals['zeta'] * log_d)
        V_calc_no_c = np.exp(log_v_no_c)
        mean_r_no_c = float(np.mean(V_test / V_calc_no_c))
        vals['C'] = float(mean_r_no_c / target_safety) if target_safety > 0 else vals['C']

        final_ratio = V_test / (vals['C'] * V_calc_no_c)
        cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
        out = {k: float(vals[k]) for k in defaults}
        out['_cov'] = round(cov, 2)
        out['_mean'] = round(float(np.mean(final_ratio)), 3)
        out['_criterion'] = criterion_mode
        return out

    # Case 3: Free exponents to optimize via Nelder-Mead
    log_V_test = np.log(V_test)
    log_ddg_d = np.log(d_dg / d)
    log_rho = np.log(100.0 * rho)
    log_fck = np.log(fck)
    log_ad = np.log(a_d)
    log_bw = np.log(bw)
    log_d = np.log(d)

    log_terms = {
        'alpha': log_ddg_d,
        'beta': log_rho,
        'gamma': log_fck,
        'delta': log_ad,
        'epsilon': log_bw,
        'zeta': log_d
    }

    # Fixed base sum from locked shape exponents
    base_log_v = np.zeros_like(log_d)
    for k in exponent_keys:
        if k not in free_exponents:
            base_log_v += vals[k] * log_terms[k]

    free_log_matrices = [log_terms[k] for k in free_exponents]
    init_x = [vals[k] for k in free_exponents]

    if is_cov_mode:
        # MODE 1: PURE COV OPTIMIZATION
        # Constant C is NOT varied! C remains fixed at its current value.
        def objective(x):
            log_vc = base_log_v.copy()
            for matrix, val in zip(free_log_matrices, x):
                log_vc = log_vc + val * matrix
            ratio = np.exp(log_V_test - log_vc)
            mean_ratio = np.mean(ratio)
            if mean_ratio <= 1e-6 or np.isnan(mean_ratio):
                return 1e6
            std_ratio = np.std(ratio)
            return std_ratio / mean_ratio

        res = minimize(objective, init_x, method='Nelder-Mead',
                       options={'maxiter': 3000, 'xatol': 1e-4, 'fatol': 1e-4})

        for k, val in zip(free_exponents, res.x):
            vals[k] = float(val)

        # C is strictly PRESERVED as user set it
        final_log_vc = base_log_v.copy()
        for matrix, val in zip(free_log_matrices, res.x):
            final_log_vc += val * matrix

    else:
        # MODE 2: MEAN R CALIBRATION
        if c_locked:
            # User wants target mean with a fixed locked C: exponents must shift the mean
            c_eval = vals['C']
            log_c = np.log(c_eval) if c_eval > 0 else 0.0

            def objective(x):
                log_vc = base_log_v + log_c
                for matrix, val in zip(free_log_matrices, x):
                    log_vc = log_vc + val * matrix
                ratio = np.exp(log_V_test - log_vc)
                mean_ratio = np.mean(ratio)
                if mean_ratio <= 1e-6 or np.isnan(mean_ratio):
                    return 1e6
                std_ratio = np.std(ratio)
                cov = std_ratio / mean_ratio
                penalty = 50.0 * (mean_ratio - target_safety)**2
                return penalty + 0.05 * cov

            res = minimize(objective, init_x, method='Nelder-Mead',
                           options={'maxiter': 3000, 'xatol': 1e-4, 'fatol': 1e-4})

            for k, val in zip(free_exponents, res.x):
                vals[k] = float(val)

            final_log_vc = base_log_v.copy()
            for matrix, val in zip(free_log_matrices, res.x):
                final_log_vc += val * matrix

        else:
            # C is free in Mean mode: optimize exponents for lowest COV, then adjust C to target mean
            def objective(x):
                log_vc = base_log_v.copy()
                for matrix, val in zip(free_log_matrices, x):
                    log_vc = log_vc + val * matrix
                ratio = np.exp(log_V_test - log_vc)
                mean_ratio = np.mean(ratio)
                if mean_ratio <= 1e-6 or np.isnan(mean_ratio):
                    return 1e6
                std_ratio = np.std(ratio)
                return std_ratio / mean_ratio

            res = minimize(objective, init_x, method='Nelder-Mead',
                           options={'maxiter': 3000, 'xatol': 1e-4, 'fatol': 1e-4})

            for k, val in zip(free_exponents, res.x):
                vals[k] = float(val)

            final_log_vc = base_log_v.copy()
            for matrix, val in zip(free_log_matrices, res.x):
                final_log_vc += val * matrix
            mean_r_no_c = float(np.mean(np.exp(log_V_test - final_log_vc)))
            vals['C'] = float(mean_r_no_c / target_safety) if target_safety > 0 else vals['C']

    final_ratio = np.exp(log_V_test - (final_log_vc + np.log(max(1e-6, vals['C']))))
    final_cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
    final_mean = float(np.mean(final_ratio))

    out = {k: float(vals[k]) for k in defaults}
    out['_cov'] = round(final_cov, 2)
    out['_mean'] = round(final_mean, 3)
    out['_criterion'] = criterion_mode
    out['_subset'] = data.get('subset', subset_key)
    out['_count'] = int(data.get('count', len(V_test)))
    return out


def calibrate_constant_c(target_safety=1.0, current_vals=None, subset_key='ALL DATA'):
    """
    Analytically computes the exact multiplier C so that Mean(V_test / V_calc) = target_safety
    specifically for the active subset_key, without modifying any exponents and leaving the COV 100% unchanged.
    """
    data = load_and_clean_data(subset_key=subset_key)
    if "error" in data:
        return data

    V_test = np.array(data['V_test'])
    bw = np.array(data['bw'])
    d = np.array(data['d'])
    rho = np.array(data['rho'])
    fck = np.array(data['fck'])
    a_d = np.array(data['a_d'])
    d_dg = np.array(data['d_dg'])

    defaults = {
        'C': 0.22,
        'alpha': 0.37,
        'beta': 0.18,
        'gamma': 0.54,
        'delta': -0.24,
        'epsilon': 0.90,
        'zeta': 1.32
    }
    vals = {}
    for k in defaults:
        v = current_vals.get(k) if current_vals else None
        try:
            vals[k] = float(v) if v is not None else defaults[k]
        except (ValueError, TypeError):
            vals[k] = defaults[k]

    log_ddg_d = np.log(d_dg / d)
    log_rho = np.log(100.0 * rho)
    log_fck = np.log(fck)
    log_ad = np.log(a_d)
    log_bw = np.log(bw)
    log_d = np.log(d)

    log_v_no_c = (vals['alpha'] * log_ddg_d + vals['beta'] * log_rho +
                  vals['gamma'] * log_fck + vals['delta'] * log_ad +
                  vals['epsilon'] * log_bw + vals['zeta'] * log_d)
    V_calc_no_c = np.exp(log_v_no_c)
    mean_r_no_c = float(np.mean(V_test / V_calc_no_c))
    new_c = float(mean_r_no_c / target_safety) if target_safety > 0 else vals['C']

    final_ratio = V_test / (new_c * V_calc_no_c)
    cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
    mean_val = float(np.mean(final_ratio))

    return {
        'C': float(new_c),
        'cov': round(cov, 2),
        'mean': round(mean_val, 3),
        'subset': data.get('subset', subset_key),
        'count': int(data.get('count', len(V_test)))
    }


def calculate_depth_flatness(d_values, fs_values):
    """
    Evaluates how horizontal ("flat") the safety factor FS is across effective depth d.
    Ideal: FS is constant, independent of d (slope ~ 0, Pearson R ~ 0, Flatness ~ 100%).
    """
    d_arr = np.asarray(d_values, dtype=float)
    fs_arr = np.asarray(fs_values, dtype=float)
    valid = np.isfinite(d_arr) & np.isfinite(fs_arr) & (d_arr > 0) & (fs_arr > 0)
    d_arr = d_arr[valid]
    fs_arr = fs_arr[valid]
    
    if len(d_arr) < 5:
        return {
            "mean_fs": 1.0,
            "slope": 0.0,
            "slope_per_meter": 0.0,
            "pearson_r": 0.0,
            "flatness_score": 100.0,
            "status": "Insuficiente",
            "d_span": 0.0
        }
        
    mean_d = float(np.mean(d_arr))
    mean_fs = float(np.mean(fs_arr))
    var_d = float(np.var(d_arr, ddof=1))
    
    if var_d <= 1e-9:
        slope = 0.0
        pearson_r = 0.0
    else:
        cov_dfs = float(np.cov(d_arr, fs_arr)[0, 1])
        slope = float(cov_dfs / var_d)
        var_fs = float(np.var(fs_arr, ddof=1))
        std_d = float(np.sqrt(var_d))
        std_fs = float(np.sqrt(var_fs))
        pearson_r = float(cov_dfs / (std_d * std_fs)) if (std_d > 0 and std_fs > 0) else 0.0
        
    slope_per_meter = slope * 1000.0
    
    # 10th and 90th percentiles to avoid extreme tail outliers
    d10, d90 = np.percentile(d_arr, [10, 90])
    d_span = float(max(100.0, d90 - d10))
    drift = abs(slope) * d_span
    flatness = max(0.0, min(100.0, (1.0 - (drift / mean_fs)) * 100.0)) if mean_fs > 0 else 0.0
    
    return {
        "mean_fs": round(mean_fs, 3),
        "slope": float(slope),
        "slope_per_meter": round(slope_per_meter, 4),
        "pearson_r": round(pearson_r, 3),
        "flatness_score": round(flatness, 1),
        "d_min": float(np.min(d_arr)),
        "d_max": float(np.max(d_arr)),
        "d_span": round(d_span, 1),
        "count": len(d_arr)
    }


def batch_compare_lowess(live_curve, other_curves_dict):
    """
    Compares the LIVE_MODEL LOWESS curve to a dictionary of other codes' curves.
    Returns a dictionary of metrics for each code including slope and flatness.
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
            
        # 4. Slope & Flatness across grid
        try:
            slope_live = float(np.polyfit(grid_x, y_live_grid, 1)[0])
            slope_other = float(np.polyfit(grid_x, y_other_grid, 1)[0])
        except Exception:
            slope_live = 0.0
            slope_other = 0.0

        span_x = max(100.0, float(max_x - min_x))
        mean_live = float(np.mean(y_live_grid))
        mean_other = float(np.mean(y_other_grid))
        flatness_live = max(0.0, min(100.0, (1.0 - (abs(slope_live) * span_x / mean_live)) * 100.0)) if mean_live > 0 else 0.0
        flatness_other = max(0.0, min(100.0, (1.0 - (abs(slope_other) * span_x / mean_other)) * 100.0)) if mean_other > 0 else 0.0

        import math
        def safe_float(v):
            if v is None or math.isnan(v) or math.isinf(v):
                return 0.0
            return float(v)
            
        results[code_name] = {
            "pearson": safe_float(r_val),
            "rmse": safe_float(rmse),
            "deriv_r": safe_float(r_deriv),
            "slope_live": safe_float(slope_live * 1000.0),
            "slope_other": safe_float(slope_other * 1000.0),
            "flatness_live": safe_float(flatness_live),
            "flatness_other": safe_float(flatness_other)
        }
        
    return results
