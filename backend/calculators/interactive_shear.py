import pandas as pd
import numpy as np
from scipy.optimize import minimize
import os
import pickle

_cached_subsets = {}

def is_row_in_subset(row, subset_key, exclude_pc=False):
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

    # Prestressed element evaluation
    raw_sig = row.get('Sigma_CP') if row.get('Sigma_CP') is not None else row.get('Sigma_CP.1')
    try:
        bsigma_cp = float(raw_sig or 0.0)
    except (ValueError, TypeError):
        bsigma_cp = 0.0

    is_pc = (str(row.get('Member class (inferred)') or '') == 'PC' or 
             'PC' in str(row.get('Source sheet') or '') or 
             row.get('Prestressed') == 1 or row.get('Prestressed') is True or
             bsigma_cp > 0.0)

    effective_exclude_pc = bool(exclude_pc)
    if isinstance(subset_key, dict) and subset_key.get('exclude_pc'):
        effective_exclude_pc = True

    if effective_exclude_pc and is_pc and subset_key != 'mat_pc':
        return False

    if not subset_key or subset_key in ('ALL DATA', 'all', ''):
        return True

    # Dynamic custom filter object from UI
    if isinstance(subset_key, dict):
        d_min = subset_key.get('d_min')
        if d_min is not None and str(d_min).strip() != '' and bd < float(d_min):
            return False
        d_max = subset_key.get('d_max')
        if d_max is not None and str(d_max).strip() != '' and bd > float(d_max):
            return False

        ratio_type = subset_key.get('ratio_type', 'bwd')
        ratio_min = subset_key.get('ratio_min')
        ratio_max = subset_key.get('ratio_max')
        if ratio_type == 'dbw':
            dbw = (bd / bbw) if (bd > 0 and bbw > 0) else 0.0
            if ratio_min is not None and str(ratio_min).strip() != '' and dbw < float(ratio_min):
                return False
            if ratio_max is not None and str(ratio_max).strip() != '' and dbw > float(ratio_max):
                return False
        else: # bwd (bw / d)
            if ratio_min is not None and str(ratio_min).strip() != '' and bwd < float(ratio_min):
                return False
            if ratio_max is not None and str(ratio_max).strip() != '' and bwd > float(ratio_max):
                return False

        ad_min = subset_key.get('ad_min')
        if ad_min is not None and str(ad_min).strip() != '' and ba_d < float(ad_min):
            return False
        ad_max = subset_key.get('ad_max')
        if ad_max is not None and str(ad_max).strip() != '' and ba_d > float(ad_max):
            return False

        rho_min = subset_key.get('rho_min')
        if rho_min is not None and str(rho_min).strip() != '' and (rho * 100.0) < float(rho_min):
            return False
        rho_max = subset_key.get('rho_max')
        if rho_max is not None and str(rho_max).strip() != '' and (rho * 100.0) > float(rho_max):
            return False

        fck_min = subset_key.get('fck_min')
        if fck_min is not None and str(fck_min).strip() != '' and bfck < float(fck_min):
            return False
        fck_max = subset_key.get('fck_max')
        if fck_max is not None and str(fck_max).strip() != '' and bfck > float(fck_max):
            return False

        bw_min = subset_key.get('bw_min')
        if bw_min is not None and str(bw_min).strip() != '' and bbw < float(bw_min):
            return False
        bw_max = subset_key.get('bw_max')
        if bw_max is not None and str(bw_max).strip() != '' and bbw > float(bw_max):
            return False

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


def load_and_clean_data(subset_key='ALL DATA', exclude_pc=False):
    """
    Loads shear database rows filtered by the requested subset_key.
    Returns clean arrays for Nelder-Mead optimization and analytical C calibration.
    """
    global _cached_subsets
    eff_exclude_pc = bool(exclude_pc)
    if isinstance(subset_key, dict):
        eff_exclude_pc = eff_exclude_pc or bool(subset_key.get('exclude_pc'))
        cache_key = "dyn_" + str(sorted((k, v) for k, v in subset_key.items() if v is not None and str(v).strip() != '')) + f"_expc_{eff_exclude_pc}"
    else:
        cache_key = str(subset_key or 'ALL DATA').strip() + f"_expc_{eff_exclude_pc}"

    if cache_key in _cached_subsets:
        return _cached_subsets[cache_key]

    all_records = get_all_codes_dataset()
    if isinstance(all_records, dict) and "error" in all_records:
        return all_records

    filtered = [r for r in all_records if is_row_in_subset(r, subset_key, exclude_pc=eff_exclude_pc)]
    if len(filtered) < 3:
        if subset_key != 'ALL DATA':
            filtered = [r for r in all_records if is_row_in_subset(r, 'ALL DATA', exclude_pc=eff_exclude_pc)]
        if len(filtered) < 3:
            return {"error": f"Recorte '{subset_key}' possui poucas amostras válidas ({len(filtered)})."}

    v_test = []
    bw = []
    d = []
    rho = []
    fck = []
    a_d = []
    d_dg = []
    sigma_cp = []

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

        raw_sig = r.get('Sigma_CP') if r.get('Sigma_CP') is not None else r.get('Sigma_CP.1')
        cur_sigma_cp = max(0.0, float(raw_sig or 0.0))

        v_test.append(cur_vu_n)
        bw.append(bbw)
        d.append(bd)
        rho.append(cur_rho)
        fck.append(cur_fck)
        a_d.append(cur_ad)
        d_dg.append(cur_ddg)
        sigma_cp.append(cur_sigma_cp)

    result_dict = {
        'V_test': v_test,
        'bw': bw,
        'd': d,
        'rho': rho,
        'fck': fck,
        'a_d': a_d,
        'd_dg': d_dg,
        'sigma_cp': sigma_cp,
        'subset': subset_key,
        'count': len(filtered)
    }
    _cached_subsets[cache_key] = result_dict
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
                
                # Prestressing axial stress (positive for compression)
                raw_sig = clean_row.get('Sigma_CP') if clean_row.get('Sigma_CP') is not None else clean_row.get('Sigma_CP.1')
                sigma_cp = max(0.0, float(raw_sig or 0.0))
                clean_row['Sigma_CP'] = float(sigma_cp)
                
                if bw and d and fck and v_test and v_test > 0:
                    v_mc1 = osc.calc_mc2010_level_1(bw, d, fck, sigma_cp=sigma_cp)
                    v_mc2 = osc.calc_mc2010_level_2(bw, d, rho, fck, a_d, d_dg, sigma_cp=sigma_cp)
                    v_ec2_04 = osc.calc_ec2_2004(bw, d, rho, fck, sigma_cp=sigma_cp)
                    v_ec2_23 = osc.calc_ec2_2023(bw, d, rho, fck, a_d, d_dg, sigma_cp=sigma_cp)
                    v_aci_14 = osc.calc_aci318_14(bw, d, fck, sigma_cp=sigma_cp)
                    v_aci_19 = osc.calc_aci318_19(bw, d, rho, fck, sigma_cp=sigma_cp)
                    v_aci_25 = osc.calc_aci318_25(bw, d, rho, fck, sigma_cp=sigma_cp)
                    v_nbr = osc.calc_nbr6118(bw, d, rho, fck, sigma_cp=sigma_cp)
                    
                    if v_mc1 and v_mc1 > 0: clean_row['A_MC2010_L1'] = float(v_test / v_mc1)
                    if v_mc2 and v_mc2 > 0: clean_row['A_MC2010_L2'] = float(v_test / v_mc2)
                    if v_ec2_04 and v_ec2_04 > 0: clean_row['A_EC2_2004'] = float(v_test / v_ec2_04)
                    if v_ec2_23 and v_ec2_23 > 0: clean_row['A_EC2_2023'] = float(v_test / v_ec2_23)
                    if v_aci_14 and v_aci_14 > 0: clean_row['A_ACI_14'] = float(v_test / v_aci_14)
                    if v_aci_19 and v_aci_19 > 0: clean_row['A_ACI_19'] = float(v_test / v_aci_19)
                    if v_aci_25 and v_aci_25 > 0: clean_row['A_ACI_25'] = float(v_test / v_aci_25)
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
        n = len(x)
        if n < 5:
            return []

        sort_idx = np.argsort(x)
        x, y = x[sort_idx], y[sort_idx]

        num_points = min(100, n)
        eval_x = np.linspace(x[0], x[-1], num_points)
        k = min(n, max(3, int(np.ceil(frac * n))))

        eval_y = []
        for x0 in eval_x:
            dists = np.abs(x - x0)
            if k >= n:
                idx_k = np.arange(n)
            else:
                idx_k = np.argpartition(dists, k - 1)[:k]
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

def run_optimization(target_safety=1.0, locked=None, current_vals=None, criterion='cov', subset_key='ALL DATA', use_deff=False, exclude_pc=False):
    """
    Fits the empirical shear formula exponents using SciPy Nelder-Mead on the requested subset_key.
    
    bw (epsilon) and d (zeta) are fixed physical constants = 1.0 (nominal shear area bw * d).
    use_deff: when True, applies FIB Model Code / EC2 (2023) kinematic constraint:
              a_cs = max(a, d) >= d
              d_eff = min(d, sqrt((a_cs / 4) * d))
              (d_dg / d_eff)^alpha instead of (d_dg / d)^alpha.
    """
    data = load_and_clean_data(subset_key=subset_key, exclude_pc=exclude_pc)
    if "error" in data:
        return data

    V_test = np.array(data['V_test'])
    bw = np.array(data['bw'])
    d = np.array(data['d'])
    rho = np.array(data['rho'])
    fck = np.array(data['fck'])
    a_d = np.array(data['a_d'])
    d_dg = np.array(data['d_dg'])

    sigma_cp = np.array(data.get('sigma_cp', np.zeros_like(V_test)), dtype=float)

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
        'mu': 0.15,
        'epsilon': 1.0,
        'zeta': 1.0
    }
    
    vals = {}
    for k in defaults:
        v = current_vals.get(k)
        try:
            vals[k] = float(v) if v is not None else defaults[k]
        except (ValueError, TypeError):
            vals[k] = defaults[k]
    # Enforce constant physical nominal area exponents
    vals['epsilon'] = 1.0
    vals['zeta'] = 1.0

    # Prestress contribution force V_p (in N) = mu * min(sigma_cp, 0.2*fck) * bw * d
    mu_val = float(vals.get('mu', 0.15))
    sig_lim = np.minimum(sigma_cp, 0.2 * fck)
    V_p = mu_val * sig_lim * bw * d

    criterion_mode = str(criterion or 'cov').lower().strip()
    is_cov_mode = (criterion_mode == 'cov' or 'cov' in criterion_mode or 'dispersao' in criterion_mode)

    c_locked = bool(locked.get('C', False))
    # Epsilon and Zeta are strictly constants = 1.0 (never varied in optimization)
    exponent_keys = ['alpha', 'beta', 'gamma', 'delta']
    free_exponents = [k for k in exponent_keys if not bool(locked.get(k, False))]

    # Effective depth with CSCT / EC2-2023 kinematic constraint
    if use_deff:
        acs = np.maximum(a_d * d, d)
        d_eff = np.where(acs < 4.0 * d, np.sqrt((acs / 4.0) * d), d)
        log_ddg_d = np.log(d_dg / d_eff)
    else:
        log_ddg_d = np.log(d_dg / d)

    log_nominal_area = np.log(bw) + np.log(d)

    # Case 1: Everything is locked
    if not free_exponents and (c_locked or is_cov_mode):
        log_rho = np.log(100.0 * rho)
        log_fck = np.log(fck)
        log_ad = np.log(a_d)
        log_v_no_c = (vals['alpha'] * log_ddg_d + vals['beta'] * log_rho +
                      vals['gamma'] * log_fck + vals['delta'] * log_ad +
                      log_nominal_area)
        V_calc_no_c = np.exp(log_v_no_c)
        V_calc_tot = vals['C'] * V_calc_no_c + V_p
        final_ratio = V_test / np.maximum(1e-6, V_calc_tot)
        cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
        out = {k: float(vals[k]) for k in defaults}
        out['_cov'] = round(cov, 2)
        out['_mean'] = round(float(np.mean(final_ratio)), 3)
        out['_criterion'] = criterion_mode
        out['_use_deff'] = bool(use_deff)
        return out

    # Case 2: Only C is free (all shape exponents are locked) in Mean mode
    if not free_exponents and not c_locked and not is_cov_mode:
        log_rho = np.log(100.0 * rho)
        log_fck = np.log(fck)
        log_ad = np.log(a_d)
        log_v_no_c = (vals['alpha'] * log_ddg_d + vals['beta'] * log_rho +
                      vals['gamma'] * log_fck + vals['delta'] * log_ad +
                      log_nominal_area)
        V_calc_no_c = np.exp(log_v_no_c)
        if np.all(V_p == 0):
            mean_r_no_c = float(np.mean(V_test / V_calc_no_c))
            vals['C'] = float(mean_r_no_c / target_safety) if target_safety > 0 else vals['C']
        else:
            from scipy.optimize import root_scalar
            def obj_c(c_cand):
                if c_cand <= 0: return 1e6
                return float(np.mean(V_test / (c_cand * V_calc_no_c + V_p)) - target_safety)
            c_guess = float(np.mean(V_test / (V_calc_no_c + V_p)) / target_safety) if target_safety > 0 else vals['C']
            try:
                sol = root_scalar(obj_c, bracket=[0.001, 10.0], method='brentq')
                vals['C'] = float(sol.root)
            except Exception:
                vals['C'] = max(0.01, c_guess)

        V_calc_tot = vals['C'] * V_calc_no_c + V_p
        final_ratio = V_test / np.maximum(1e-6, V_calc_tot)
        cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
        out = {k: float(vals[k]) for k in defaults}
        out['_cov'] = round(cov, 2)
        out['_mean'] = round(float(np.mean(final_ratio)), 3)
        out['_criterion'] = criterion_mode
        out['_use_deff'] = bool(use_deff)
        return out

    # Case 3: Free exponents to optimize via Nelder-Mead
    log_V_test = np.log(V_test)
    log_rho = np.log(100.0 * rho)
    log_fck = np.log(fck)
    log_ad = np.log(a_d)

    log_terms = {
        'alpha': log_ddg_d,
        'beta': log_rho,
        'gamma': log_fck,
        'delta': log_ad
    }

    # Fixed base sum starts with nominal shear area log(bw) + log(d)
    base_log_v = log_nominal_area.copy()
    for k in exponent_keys:
        if k not in free_exponents:
            base_log_v += vals[k] * log_terms[k]

    free_log_matrices = [log_terms[k] for k in free_exponents]
    init_x = [vals[k] for k in free_exponents]

    if is_cov_mode:
        # MODE 1: PURE COV OPTIMIZATION
        # Constant C is NOT varied! C remains fixed at its current value.
        c_eval = vals['C']
        def objective(x):
            log_vc = base_log_v.copy()
            for matrix, val in zip(free_log_matrices, x):
                log_vc = log_vc + val * matrix
            v_calc = c_eval * np.exp(log_vc) + V_p
            ratio = V_test / np.maximum(1e-6, v_calc)
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

            def objective(x):
                log_vc = base_log_v.copy()
                for matrix, val in zip(free_log_matrices, x):
                    log_vc = log_vc + val * matrix
                v_calc = c_eval * np.exp(log_vc) + V_p
                ratio = V_test / np.maximum(1e-6, v_calc)
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
            c_eval = vals['C']
            def objective(x):
                log_vc = base_log_v.copy()
                for matrix, val in zip(free_log_matrices, x):
                    log_vc = log_vc + val * matrix
                v_calc = c_eval * np.exp(log_vc) + V_p
                ratio = V_test / np.maximum(1e-6, v_calc)
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
            V_calc_no_c = np.exp(final_log_vc)
            if np.all(V_p == 0):
                mean_r_no_c = float(np.mean(V_test / V_calc_no_c))
                vals['C'] = float(mean_r_no_c / target_safety) if target_safety > 0 else vals['C']
            else:
                from scipy.optimize import root_scalar
                def obj_c(c_cand):
                    if c_cand <= 0: return 1e6
                    return float(np.mean(V_test / (c_cand * V_calc_no_c + V_p)) - target_safety)
                c_guess = float(np.mean(V_test / (V_calc_no_c + V_p)) / target_safety) if target_safety > 0 else vals['C']
                try:
                    sol = root_scalar(obj_c, bracket=[0.001, 10.0], method='brentq')
                    vals['C'] = float(sol.root)
                except Exception:
                    vals['C'] = max(0.01, c_guess)

    final_calc = vals['C'] * np.exp(final_log_vc) + V_p
    final_ratio = V_test / np.maximum(1e-6, final_calc)
    final_cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
    final_mean = float(np.mean(final_ratio))

    out = {k: float(vals[k]) for k in defaults}
    out['_cov'] = round(final_cov, 2)
    out['_mean'] = round(final_mean, 3)
    out['_criterion'] = criterion_mode
    out['_subset'] = data.get('subset', subset_key)
    out['_count'] = int(data.get('count', len(V_test)))
    out['_use_deff'] = bool(use_deff)
    return out


def calibrate_constant_c(target_safety=1.0, current_vals=None, subset_key='ALL DATA', use_deff=False, exclude_pc=False):
    """
    Analytically computes the exact multiplier C so that Mean(V_test / V_calc) = target_safety
    specifically for the active subset_key, without modifying any exponents and leaving the COV 100% unchanged.
    """
    data = load_and_clean_data(subset_key=subset_key, exclude_pc=exclude_pc)
    if "error" in data:
        return data

    V_test = np.array(data['V_test'])
    bw = np.array(data['bw'])
    d = np.array(data['d'])
    rho = np.array(data['rho'])
    fck = np.array(data['fck'])
    a_d = np.array(data['a_d'])
    d_dg = np.array(data['d_dg'])
    sigma_cp = np.array(data.get('sigma_cp', np.zeros_like(V_test)), dtype=float)

    defaults = {
        'C': 0.22,
        'alpha': 0.37,
        'beta': 0.18,
        'gamma': 0.54,
        'delta': -0.24,
        'mu': 0.15,
        'epsilon': 1.0,
        'zeta': 1.0
    }
    vals = {}
    for k in defaults:
        v = current_vals.get(k) if current_vals else None
        try:
            vals[k] = float(v) if v is not None else defaults[k]
        except (ValueError, TypeError):
            vals[k] = defaults[k]
    vals['epsilon'] = 1.0
    vals['zeta'] = 1.0

    mu_val = float(vals.get('mu', 0.15))
    sig_lim = np.minimum(sigma_cp, 0.2 * fck)
    V_p = mu_val * sig_lim * bw * d

    if use_deff:
        acs = np.maximum(a_d * d, d)
        d_eff = np.where(acs < 4.0 * d, np.sqrt((acs / 4.0) * d), d)
        log_ddg_d = np.log(d_dg / d_eff)
    else:
        log_ddg_d = np.log(d_dg / d)

    log_rho = np.log(100.0 * rho)
    log_fck = np.log(fck)
    log_ad = np.log(a_d)
    log_nominal_area = np.log(bw) + np.log(d)

    log_v_no_c = (vals['alpha'] * log_ddg_d + vals['beta'] * log_rho +
                  vals['gamma'] * log_fck + vals['delta'] * log_ad +
                  log_nominal_area)
    V_calc_no_c = np.exp(log_v_no_c)

    if np.all(V_p == 0):
        mean_r_no_c = float(np.mean(V_test / V_calc_no_c))
        new_c = float(mean_r_no_c / target_safety) if target_safety > 0 else vals['C']
    else:
        from scipy.optimize import root_scalar
        def obj_c(c_cand):
            if c_cand <= 0: return 1e6
            return float(np.mean(V_test / (c_cand * V_calc_no_c + V_p)) - target_safety)
        c_guess = float(np.mean(V_test / (V_calc_no_c + V_p)) / target_safety) if target_safety > 0 else vals['C']
        try:
            sol = root_scalar(obj_c, bracket=[0.001, 10.0], method='brentq')
            new_c = float(sol.root)
        except Exception:
            new_c = max(0.01, c_guess)

    final_calc = new_c * V_calc_no_c + V_p
    final_ratio = V_test / np.maximum(1e-6, final_calc)
    cov = float(np.std(final_ratio) / np.mean(final_ratio)) * 100.0
    mean_val = float(np.mean(final_ratio))

    return {
        'C': float(new_c),
        'cov': round(cov, 2),
        'mean': round(mean_val, 3),
        'subset': data.get('subset', subset_key),
        'count': int(data.get('count', len(V_test))),
        '_use_deff': bool(use_deff)
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
        if not code_name or not str(code_name).strip() or code_name == 'BASELINE_MODEL' or 'Referência' in str(code_name):
            continue
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


def calculate_shear_correlation_analysis(subset_key='ALL DATA', current_params=None, use_deff=False, exclude_pc=False):
    """
    Computes a comprehensive statistical correlation analysis:
    1. Correlation of model residuals/ratios (Live Model and Official Codes) with physical variables (d, a/d, rho, fck, bw, bwd, ddg, V_test, tau_u).
    2. Complete inter-variable correlation matrix (Pearson and Spearman).
    3. Multicollinearity metrics (VIF).
    4. Descriptive statistics.
    5. Formatted LaTeX matrix table for thesis/dissertation export.
    """
    import math
    import scipy.stats as stats

    data = load_and_clean_data(subset_key=subset_key, exclude_pc=exclude_pc)
    if "error" in data:
        return data

    d_arr = np.array(data['d'], dtype=float)
    ad_arr = np.array(data['a_d'], dtype=float)
    rho_arr = np.array(data['rho'], dtype=float) * 100.0  # in %
    fck_arr = np.array(data['fck'], dtype=float)
    bw_arr = np.array(data['bw'], dtype=float)
    bwd_arr = bw_arr / np.maximum(1e-3, d_arr)
    ddg_arr = np.array(data['d_dg'], dtype=float)
    v_test = np.array(data['V_test'], dtype=float)  # in N
    tau_u = v_test / np.maximum(1e-3, bw_arr * d_arr)  # in MPa
    n_count = len(d_arr)

    # Defaults
    defaults = {
        'C': 0.22, 'alpha': 0.37, 'beta': 0.18, 'gamma': 0.54,
        'delta': -0.24, 'mu': 0.15, 'epsilon': 1.0, 'zeta': 1.0
    }
    vals = {}
    disabled = {}
    if current_params:
        for k in defaults:
            p_obj = current_params.get(k)
            if isinstance(p_obj, dict):
                vals[k] = float(p_obj.get('val', defaults[k]))
                disabled[k] = bool(p_obj.get('disabled', False))
            elif p_obj is not None:
                try:
                    vals[k] = float(p_obj)
                except Exception:
                    vals[k] = defaults[k]
                disabled[k] = False
            else:
                vals[k] = defaults[k]
                disabled[k] = False
    else:
        vals = defaults.copy()
        disabled = {k: False for k in defaults}
    vals['epsilon'] = 1.0
    vals['zeta'] = 1.0

    sigma_cp_arr = np.array(data.get('sigma_cp', np.zeros_like(d_arr)), dtype=float)

    # Live model V_calc
    c_factor = 1.0 if disabled.get('C') else vals['C']
    if use_deff:
        acs_arr = np.maximum(ad_arr * d_arr, d_arr)
        d_eff_arr = np.where(acs_arr < 4.0 * d_arr, np.sqrt((acs_arr / 4.0) * d_arr), d_arr)
        se_factor = 1.0 if disabled.get('alpha') else (ddg_arr / np.maximum(1e-3, d_eff_arr)) ** vals['alpha']
    else:
        se_factor = 1.0 if disabled.get('alpha') else (ddg_arr / np.maximum(1e-3, d_arr)) ** vals['alpha']

    rho_factor = 1.0 if disabled.get('beta') else (rho_arr) ** vals['beta']
    fck_factor = 1.0 if disabled.get('gamma') else (fck_arr) ** vals['gamma']
    ad_factor = 1.0 if disabled.get('delta') else (ad_arr) ** vals['delta']

    # Prestress contribution
    mu_factor = 0.0 if disabled.get('mu') else float(vals.get('mu', 0.15))
    sig_lim_arr = np.minimum(sigma_cp_arr, 0.2 * fck_arr)
    vc_pc = mu_factor * sig_lim_arr

    vc = c_factor * se_factor * rho_factor * fck_factor * ad_factor + vc_pc
    # Nominal shear area bw * d
    v_calc_n = vc * bw_arr * d_arr
    r_live = np.where(v_calc_n > 0, v_test / np.maximum(1e-6, v_calc_n), np.nan)

    # Variables dict
    var_dict = {
        'd': {'label': 'Altura Útil (d)', 'unit': 'mm', 'data': d_arr, 'coef': 'α'},
        'a_d': {'label': 'Vão Cisalhante (a/d)', 'unit': '', 'data': ad_arr, 'coef': 'δ'},
        'rho_w': {'label': 'Taxa de Armadura (ρw)', 'unit': '%', 'data': rho_arr, 'coef': 'β'},
        'fck': {'label': 'Resistência Concreto (fck)', 'unit': 'MPa', 'data': fck_arr, 'coef': 'γ'},
        'sigma_cp': {'label': 'Tensão Protensão (σ_cp)', 'unit': 'MPa', 'data': sigma_cp_arr, 'coef': 'μ'},
        'bw': {'label': 'Largura da Alma (bw)', 'unit': 'mm', 'data': bw_arr, 'coef': 'ε'},
        'bwd': {'label': 'Razão Seção (bw/d)', 'unit': '', 'data': bwd_arr, 'coef': 'bw/d'},
        'V_test': {'label': 'Força Última (Vu)', 'unit': 'kN', 'data': v_test / 1000.0, 'coef': ''},
        'tau_u': {'label': 'Tensão Nominal (τu)', 'unit': 'MPa', 'data': tau_u, 'coef': ''},
        'R_Live': {'label': 'Modelo Proposto (R_Live)', 'unit': '', 'data': r_live, 'coef': 'Model'}
    }

    def safe_f(x):
        return 0.0 if (x is None or math.isnan(x) or math.isinf(x)) else float(x)

    # Descriptive statistics
    stats_summary = {}
    for vk, vinfo in var_dict.items():
        arr = vinfo['data']
        valid = arr[np.isfinite(arr)]
        if len(valid) > 0:
            stats_summary[vk] = {
                'label': vinfo['label'],
                'unit': vinfo['unit'],
                'mean': safe_f(np.mean(valid)),
                'std': safe_f(np.std(valid, ddof=1) if len(valid) > 1 else 0.0),
                'median': safe_f(np.median(valid)),
                'min': safe_f(np.min(valid)),
                'max': safe_f(np.max(valid)),
                'skew': safe_f(stats.skew(valid) if len(valid) > 2 else 0.0),
                'count': len(valid)
            }

    # Inter-variable correlation matrix
    matrix_keys = ['d', 'a_d', 'rho_w', 'fck', 'bw', 'bwd', 'V_test', 'tau_u', 'R_Live']
    pearson_matrix = {}
    spearman_matrix = {}
    pvalues_matrix = {}

    for k1 in matrix_keys:
        pearson_matrix[k1] = {}
        spearman_matrix[k1] = {}
        pvalues_matrix[k1] = {}
        for k2 in matrix_keys:
            if k1 == k2:
                pearson_matrix[k1][k2] = 1.0
                spearman_matrix[k1][k2] = 1.0
                pvalues_matrix[k1][k2] = 0.0
                continue
            arr1 = var_dict[k1]['data']
            arr2 = var_dict[k2]['data']
            mask = np.isfinite(arr1) & np.isfinite(arr2)
            sub1, sub2 = arr1[mask], arr2[mask]
            if len(sub1) > 2:
                try:
                    pr, pp = stats.pearsonr(sub1, sub2)
                    sr, sp = stats.spearmanr(sub1, sub2)
                    pearson_matrix[k1][k2] = safe_f(pr)
                    spearman_matrix[k1][k2] = safe_f(sr)
                    pvalues_matrix[k1][k2] = safe_f(pp)
                except Exception:
                    pearson_matrix[k1][k2] = 0.0
                    spearman_matrix[k1][k2] = 0.0
                    pvalues_matrix[k1][k2] = 1.0
            else:
                pearson_matrix[k1][k2] = 0.0
                spearman_matrix[k1][k2] = 0.0
                pvalues_matrix[k1][k2] = 1.0

    # Predictors VIF
    pred_keys = ['d', 'a_d', 'rho_w', 'fck', 'bw']
    vif_dict = {}
    try:
        c_sub = np.array([[pearson_matrix[k1][k2] for k2 in pred_keys] for k1 in pred_keys])
        inv_c = np.linalg.inv(c_sub)
        for i, pk in enumerate(pred_keys):
            vif_dict[pk] = safe_f(inv_c[i, i])
    except Exception:
        for pk in pred_keys:
            vif_dict[pk] = 1.0

    # Model Bias Diagnostics against Physical Variables
    bias_eval = {}
    for vk in ['d', 'a_d', 'rho_w', 'fck', 'bw', 'bwd']:
        pr = pearson_matrix['R_Live'].get(vk, 0.0)
        sr = spearman_matrix['R_Live'].get(vk, 0.0)
        pp = pvalues_matrix['R_Live'].get(vk, 1.0)
        abs_r = abs(pr)
        if abs_r < 0.05:
            severity = 'excelente'
            desc = 'Sem viés residual (|r| < 0.05)'
            action = 'Expoente perfeitamente calibrado.'
        elif abs_r < 0.15:
            severity = 'leve'
            desc = f'Viés leve ({"+" if pr > 0 else "-"}{abs_r:.3f})'
            action = 'Leve ajuste nos expoentes pode melhorar a ortogonalidade.'
        elif abs_r < 0.30:
            severity = 'moderado'
            desc = f'Viés moderado ({"+" if pr > 0 else "-"}{abs_r:.3f})'
            action = 'Recomenda-se recalibrar o expoente correspondente.'
        else:
            severity = 'severo'
            desc = f'Viés acentuado ({"+" if pr > 0 else "-"}{abs_r:.3f})'
            action = 'A formulação apresenta distorção sistemática nesta variável.'

        bias_eval[vk] = {
            'pearson': pr,
            'spearman': sr,
            'p_value': pp,
            'significant': (pp < 0.05),
            'severity': severity,
            'desc': desc,
            'action': action,
            'label': var_dict[vk]['label'],
            'coef': var_dict[vk]['coef']
        }

    # Residual Orthogonality Index (ROI)
    sq_sum = sum(bias_eval[k]['pearson']**2 for k in ['d', 'a_d', 'rho_w', 'fck', 'bw'])
    roi = max(0.0, min(100.0, (1.0 - math.sqrt(sq_sum / 5.0)) * 100.0))

    # Generate LaTeX code
    latex_rows = []
    latex_cols = ['d', 'a_d', 'rho_w', 'fck', 'bw', 'V_test', 'tau_u', 'R_Live']
    latex_headers = [var_dict[k]['label'].split('(')[0].strip() for k in latex_cols]
    header_str = " & ".join(["Variável"] + [f"${var_dict[k]['label'].split('(')[1].replace(')', '')}$" if '(' in var_dict[k]['label'] else k for k in latex_cols]) + " \\\\"
    
    for rk in latex_cols:
        r_label = f"${var_dict[rk]['label'].split('(')[1].replace(')', '')}$" if '(' in var_dict[rk]['label'] else rk
        vals_str = " & ".join([f"{pearson_matrix[rk][ck]:.3f}" for ck in latex_cols])
        latex_rows.append(f"{r_label} & {vals_str} \\\\")
        
    latex_code = (
        "\\begin{table}[htbp]\n"
        "\\centering\n"
        f"\\caption{{Matriz de Correlação de Pearson das Variáveis Experimentais e Razão de Cortante ($N = {n_count}$)}}\n"
        "\\label{tab:shear_correlation_matrix}\n"
        "\\begin{tabular}{l" + "c" * len(latex_cols) + "}\n"
        "\\toprule\n"
        f"{header_str}\n"
        "\\midrule\n" +
        "\n".join(latex_rows) + "\n"
        "\\bottomrule\n"
        "\\end{tabular}\n"
        "\\end{table}"
    )

    return {
        'count': n_count,
        'subset': subset_key,
        'roi': round(roi, 1),
        'bias_evaluation': bias_eval,
        'pearson_matrix': pearson_matrix,
        'spearman_matrix': spearman_matrix,
        'pvalues_matrix': pvalues_matrix,
        'vif': vif_dict,
        'descriptive_stats': stats_summary,
        'matrix_keys': matrix_keys,
        'labels': {k: var_dict[k]['label'] for k in matrix_keys},
        'latex_code': latex_code
    }

