"""
ASCE 7-16 & ASCE 7-22 Seismic Load and Analysis Calculator
Covers:
- Chapter 11: Seismic Design Criteria, Site Class (Fa, Fv), SMS, SM1, SDS, SD1, SDC (Seismic Design Category)
- Chapter 12: Seismic Force-Resisting Systems (Table 12.2-1: R, Omega_0, Cd),
  Fundamental Period (Ta, Cu, T), Equivalent Lateral Force (ELF) Base Shear Cs, V,
  Vertical Distribution of Seismic Forces (Fx, Vx, Mx), Drift & P-Delta,
  Vertical Seismic Effect Ev = 0.2 * SDS * D, and ASCE Load Combinations
- Chapter 13: Seismic Demands on Nonstructural Components & Equipment (Fp)
- Chapter 15 & ASCE 61: Seismic Design of Piers and Wharves (Cais Estaqueado),
  Including Deck Inertia, Hydrodynamic Added Mass (Cm), and Pile Lateral Shear Demands
"""

import math
from typing import Dict, Any, List, Optional, Tuple


def get_site_coefficients(site_class: str, ss: float, s1: float) -> Tuple[float, float]:
    """
    Computes site coefficients Fa and Fv per ASCE 7-16 / ASCE 7-22 Tables 11.4-1 and 11.4-2.
    Linear interpolation across Ss and S1 boundaries.
    """
    sc = site_class.upper().strip()
    
    # 1. Fa table (Ss breakpoints: <=0.25, 0.50, 0.75, 1.00, >=1.25)
    # [0.25, 0.5, 0.75, 1.0, 1.25]
    fa_table = {
        'A': [0.8, 0.8, 0.8, 0.8, 0.8],
        'B': [0.9, 0.9, 0.9, 0.9, 0.9],
        'BC': [1.0, 1.0, 1.0, 1.0, 1.0],
        'C': [1.3, 1.3, 1.2, 1.2, 1.2],
        'CD': [1.4, 1.3, 1.2, 1.1, 1.1],
        'D': [1.6, 1.4, 1.2, 1.1, 1.0],
        'DE': [2.0, 1.5, 1.2, 1.0, 0.9],
        'E': [2.4, 1.7, 1.3, 0.9, 0.9],
        'F': [1.6, 1.4, 1.2, 1.1, 1.0] # Default fallback for F
    }
    
    # 2. Fv table (S1 breakpoints: <=0.1, 0.2, 0.3, 0.4, >=0.5)
    # [0.1, 0.2, 0.3, 0.4, 0.5]
    fv_table = {
        'A': [0.8, 0.8, 0.8, 0.8, 0.8],
        'B': [0.8, 0.8, 0.8, 0.8, 0.8],
        'BC': [1.0, 1.0, 1.0, 1.0, 1.0],
        'C': [1.5, 1.5, 1.5, 1.5, 1.4],
        'CD': [1.8, 1.7, 1.6, 1.5, 1.4],
        'D': [2.4, 2.2, 2.0, 1.9, 1.8],
        'DE': [2.8, 2.5, 2.3, 2.1, 1.9],
        'E': [4.2, 3.8, 3.4, 3.0, 2.8],
        'F': [2.4, 2.2, 2.0, 1.9, 1.8] # Default fallback for F
    }
    
    fa_row = fa_table.get(sc, fa_table['D'])
    fv_row = fv_table.get(sc, fv_table['D'])
    
    # Interpolate Fa
    ss_pts = [0.25, 0.50, 0.75, 1.00, 1.25]
    if ss <= ss_pts[0]:
        fa = fa_row[0]
    elif ss >= ss_pts[-1]:
        fa = fa_row[-1]
    else:
        for i in range(len(ss_pts) - 1):
            if ss_pts[i] <= ss <= ss_pts[i+1]:
                t = (ss - ss_pts[i]) / (ss_pts[i+1] - ss_pts[i])
                fa = fa_row[i] + t * (fa_row[i+1] - fa_row[i])
                break
        else:
            fa = fa_row[2]
            
    # Interpolate Fv
    s1_pts = [0.10, 0.20, 0.30, 0.40, 0.50]
    if s1 <= s1_pts[0]:
        fv = fv_row[0]
    elif s1 >= s1_pts[-1]:
        fv = fv_row[-1]
    else:
        for i in range(len(s1_pts) - 1):
            if s1_pts[i] <= s1 <= s1_pts[i+1]:
                t = (s1 - s1_pts[i]) / (s1_pts[i+1] - s1_pts[i])
                fv = fv_row[i] + t * (fv_row[i+1] - fv_row[i])
                break
        else:
            fv = fv_row[2]
            
    return round(fa, 3), round(fv, 3)


def determine_seismic_design_category(sds: float, sd1: float, s1: float, risk_cat: str) -> Tuple[str, str, str]:
    """
    Determines Seismic Design Category (SDC) per ASCE 7 Section 11.6 Tables 11.6-1 and 11.6-2.
    """
    is_cat_iv = (risk_cat == "IV")
    
    # Table 11.6-1 (SDS)
    if sds < 0.167:
        sdc_sds = "A"
    elif sds < 0.33:
        sdc_sds = "B"
    elif sds < 0.50:
        sdc_sds = "C"
    else:
        sdc_sds = "D"
        
    # Table 11.6-2 (SD1)
    if sd1 < 0.067:
        sdc_sd1 = "A"
    elif sd1 < 0.133:
        sdc_sd1 = "B"
    elif sd1 < 0.20:
        sdc_sd1 = "C"
    else:
        sdc_sd1 = "D"
        
    # Special conditions for S1 >= 0.75g (Sec. 11.6)
    order = {"A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6}
    governing_sdc = sdc_sds if order[sdc_sds] >= order[sdc_sd1] else sdc_sd1
    
    if s1 >= 0.75:
        if is_cat_iv:
            governing_sdc = "F"
        else:
            if order[governing_sdc] < order["E"]:
                governing_sdc = "E"
                
    return governing_sdc, sdc_sds, sdc_sd1


def calculate_cu(sd1: float) -> float:
    """
    Upper limit coefficient for calculated period Cu (Table 12.8-1).
    """
    if sd1 >= 0.40:
        return 1.40
    elif sd1 <= 0.10:
        return 1.70
    elif sd1 <= 0.15:
        return 1.70 - ((sd1 - 0.10) / 0.05) * (1.70 - 1.60)
    elif sd1 <= 0.20:
        return 1.60 - ((sd1 - 0.15) / 0.05) * (1.60 - 1.50)
    elif sd1 <= 0.30:
        return 1.50 - ((sd1 - 0.20) / 0.10) * (1.50 - 1.40)
    else: # 0.30 to 0.40
        return 1.40


def calculate_approx_period(hn_m: float, system_type: str, is_metric: bool) -> Tuple[float, float, float]:
    """
    Computes Ta per ASCE 7 Section 12.8.2.1 Eq. 12.8-7: Ta = Ct * hn^x.
    """
    hn = hn_m if is_metric else (hn_m * 3.28084) # convert to ft if imperial
    
    st = system_type.lower()
    if 'steel_moment' in st or 'smf' in st:
        Ct = 0.0724 if is_metric else 0.028
        x = 0.80
    elif 'concrete_moment' in st or 'smrf' in st:
        Ct = 0.0466 if is_metric else 0.016
        x = 0.90
    elif 'braced' in st or 'brbf' in st or 'scbf' in st:
        Ct = 0.0731 if is_metric else 0.020
        x = 0.75
    elif 'wharf' in st or 'pier' in st:
        Ct = 0.0650 if is_metric else 0.025
        x = 0.75
    else: # All other structural systems
        Ct = 0.0488 if is_metric else 0.020
        x = 0.75
        
    Ta = Ct * (max(0.1, hn) ** x)
    return round(Ta, 3), Ct, x


def calculate_seismic_loads(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Core calculation function for ASCE 7 Seismic Analysis.
    """
    standard = inputs.get('seismic_asce_standard', 'ASCE 7-22')
    unit_system = inputs.get('seismic_unit_system', 'metric')
    is_metric = (unit_system == 'metric')
    
    # 1. Risk Category and Importance Factor
    risk_cat = inputs.get('seismic_risk_category', 'IV')
    importance_map = {'I': 1.00, 'II': 1.00, 'III': 1.25, 'IV': 1.50}
    Ie = float(importance_map.get(risk_cat, 1.25))
    
    # 2. Site Class and Mapped Parameters
    site_class = inputs.get('seismic_site_class', 'D')
    Ss = float(inputs.get('seismic_ss', 1.50))
    S1 = float(inputs.get('seismic_s1', 0.60))
    TL = float(inputs.get('seismic_tl', 8.0))
    
    # Automatic or manual Fa/Fv
    auto_fa, auto_fv = get_site_coefficients(site_class, Ss, S1)
    Fa = float(inputs.get('seismic_fa', auto_fa))
    Fv = float(inputs.get('seismic_fv', auto_fv))
    
    # SMS, SM1, SDS, SD1
    manual_sds = inputs.get('seismic_sds')
    manual_sd1 = inputs.get('seismic_sd1')
    
    if manual_sds is not None and manual_sds != "":
        SDS = float(manual_sds)
        SMS = 1.5 * SDS
    else:
        SMS = Fa * Ss
        SDS = (2.0 / 3.0) * SMS
        
    if manual_sd1 is not None and manual_sd1 != "":
        SD1 = float(manual_sd1)
        SM1 = 1.5 * SD1
    else:
        SM1 = Fv * S1
        SD1 = (2.0 / 3.0) * SM1
        
    # Seismic Design Category
    sdc, sdc_sds, sdc_sd1 = determine_seismic_design_category(SDS, SD1, S1, risk_cat)
    
    # 3. Seismic Force-Resisting System (SFRS)
    sfrs_preset = inputs.get('seismic_sfrs_type', 'wharf_ductile_concrete_piles')
    
    sfrs_library = {
        'steel_smf': {'name': 'Steel Special Moment Frames (SMF)', 'R': 8.0, 'Omega0': 3.0, 'Cd': 5.5},
        'steel_imf': {'name': 'Steel Intermediate Moment Frames (IMF)', 'R': 4.5, 'Omega0': 3.0, 'Cd': 4.0},
        'steel_scbf': {'name': 'Steel Special Concentrically Braced Frames (SCBF)', 'R': 6.0, 'Omega0': 2.0, 'Cd': 5.0},
        'steel_brbf': {'name': 'Buckling-Restrained Braced Frames (BRBF)', 'R': 8.0, 'Omega0': 2.5, 'Cd': 5.0},
        'concrete_smrf': {'name': 'Special Reinforced Concrete Moment Frames', 'R': 8.0, 'Omega0': 3.0, 'Cd': 5.5},
        'concrete_shear_wall': {'name': 'Special Reinforced Concrete Shear Walls', 'R': 5.0, 'Omega0': 2.5, 'Cd': 5.0},
        'wharf_ductile_concrete_piles': {'name': 'Cais Estaqueado - Estacas Concreto Protendido Dúctil (ASCE 61 / ASCE 7)', 'R': 3.0, 'Omega0': 2.0, 'Cd': 3.0},
        'wharf_ductile_steel_piles': {'name': 'Cais Estaqueado - Estacas Tubulares Metálicas Dúcteis (ASCE 61)', 'R': 3.5, 'Omega0': 2.0, 'Cd': 3.5},
        'wharf_standard_piles': {'name': 'Estrutura Portuária Estaqueada Convencional (ASCE 7 Tab. 15.4-2)', 'R': 2.5, 'Omega0': 2.0, 'Cd': 2.5},
        'cantilever_column': {'name': 'Cantilever Column Systems', 'R': 2.5, 'Omega0': 1.25, 'Cd': 2.5},
        'custom': {'name': 'Custom SFRS System', 'R': 3.0, 'Omega0': 2.0, 'Cd': 3.0}
    }
    
    preset_data = sfrs_library.get(sfrs_preset, sfrs_library['wharf_ductile_concrete_piles'])
    R = float(inputs.get('seismic_r', preset_data['R']))
    Omega0 = float(inputs.get('seismic_omega0', preset_data['Omega0']))
    Cd = float(inputs.get('seismic_cd', preset_data['Cd']))
    
    # 4. Geometry and Periods
    hn = float(inputs.get('seismic_height_hn', 24.0 if is_metric else 78.7)) # total height
    num_stories = int(inputs.get('seismic_num_stories', 1))
    
    Ta, Ct_val, x_val = calculate_approx_period(hn, sfrs_preset, is_metric)
    Cu = calculate_cu(SD1)
    T_max = Cu * Ta
    
    user_period = inputs.get('seismic_period_t')
    if user_period is not None and user_period != "" and float(user_period) > 0:
        T_input = float(user_period)
        # Check ASCE 7 Sec. 12.8.2: if T_input > T_max, use T_max
        T = min(T_input, T_max)
        period_governing_reason = f"Período Analítico T={T_input:.3f}s limitado por T_max={T_max:.3f}s (Cu={Cu:.2f})" if T_input > T_max else f"Período Analítico T={T_input:.3f}s"
    else:
        T = Ta
        period_governing_reason = f"Período Fundamental Aproximado Ta={Ta:.3f}s (Eq. 12.8-7)"
        
    T0 = 0.2 * (SD1 / SDS) if SDS > 0 else 0.0
    Ts = (SD1 / SDS) if SDS > 0 else 0.0
    
    # 5. Seismic Response Coefficient (Cs) per Section 12.8.1.1
    R_over_Ie = (R / Ie) if Ie > 0 else R
    
    # Base Cs (Eq. 12.8-2)
    Cs_base = SDS / R_over_Ie
    
    # Upper bound Cs (Eq. 12.8-3 & 12.8-4)
    if T <= TL:
        Cs_max = SD1 / (T * R_over_Ie) if T > 0 else Cs_base
    else:
        Cs_max = (SD1 * TL) / ((T ** 2) * R_over_Ie) if T > 0 else Cs_base
        
    # Lower bound Cs (Eq. 12.8-5 & 12.8-6)
    Cs_min_std = max(0.044 * SDS * Ie, 0.01)
    if S1 >= 0.60:
        Cs_min_s1 = (0.5 * S1) / R_over_Ie
        Cs_min = max(Cs_min_std, Cs_min_s1)
    else:
        Cs_min = Cs_min_std
        Cs_min_s1 = 0.0
        
    # Governing Cs
    Cs_calc = min(Cs_base, Cs_max)
    Cs = max(Cs_calc, Cs_min)
    
    # 6. Total Effective Seismic Weight W
    W_total = float(inputs.get('seismic_weight_w', 50000.0 if is_metric else 11240.0)) # kN or kips
    
    # Base Shear V (Eq. 12.8-1)
    V = Cs * W_total
    V_overstrength = Omega0 * V
    
    # 7. Redundancy Factor rho and Vertical Seismic Effect Ev
    rho = float(inputs.get('seismic_redundancy_rho', 1.0))
    Ev_factor = 0.2 * SDS
    
    # 8. Vertical Force Distribution to Stories (Section 12.8.3)
    if T <= 0.5:
        k_exp = 1.0
    elif T >= 2.5:
        k_exp = 2.0
    else:
        k_exp = 1.0 + ((T - 0.5) / 2.0)
        
    stories_data = []
    w_per_story = W_total / max(1, num_stories)
    story_height_step = hn / max(1, num_stories)
    
    sum_w_h_k = 0.0
    temp_levels = []
    for s in range(1, num_stories + 1):
        hx = s * story_height_step
        whk = w_per_story * (hx ** k_exp)
        sum_w_h_k += whk
        temp_levels.append({'level': s, 'hx': hx, 'wx': w_per_story, 'whk': whk})
        
    cum_shear = 0.0
    for lvl in reversed(temp_levels):
        Cvx = lvl['whk'] / sum_w_h_k if sum_w_h_k > 0 else (1.0 / num_stories)
        Fx = Cvx * V
        cum_shear += Fx
        stories_data.append({
            'story': lvl['level'],
            'height_m': round(lvl['hx'], 2),
            'weight_kN': round(lvl['wx'], 1),
            'Cvx': round(Cvx, 4),
            'Fx_kN': round(Fx, 1),
            'Vx_kN': round(cum_shear, 1),
            'Fx_tf': round(Fx / 9.80665, 1) if is_metric else round(Fx, 1),
            'Vx_tf': round(cum_shear / 9.80665, 1) if is_metric else round(cum_shear, 1)
        })
    stories_data.reverse() # Order from 1 (base) to N (roof)
    
    # Overturning moment at foundation base
    Mot = sum(s['Fx_kN'] * s['height_m'] for s in stories_data)
    
    # 9. Special Port Wharf / Pier Verification (ASCE 61 / Cais Estaqueado)
    is_wharf = ('wharf' in sfrs_preset or 'pier' in sfrs_preset or inputs.get('seismic_is_wharf', True))
    
    wharf_deck_weight = float(inputs.get('seismic_wharf_deck_w', 35000.0 if is_metric else 7868.0))
    num_piles = int(inputs.get('seismic_wharf_num_piles', 36))
    pile_diam_m = float(inputs.get('seismic_wharf_pile_diam', 1.20 if is_metric else 3.94))
    pile_sub_len_m = float(inputs.get('seismic_wharf_pile_sub_len', 18.0 if is_metric else 59.0))
    pile_total_len_m = float(inputs.get('seismic_wharf_pile_total_len', 24.0 if is_metric else 78.7))
    pile_weight_kN_per_m = (math.pi * ((pile_diam_m / 2.0) ** 2)) * (24.0 if is_metric else 150.0 / 1000.0)
    
    # Total pile self weight
    W_piles = num_piles * pile_total_len_m * pile_weight_kN_per_m
    
    # Added Hydrodynamic Mass (Massa Hidrodinâmica Adicionada - ASCE 61 Section 3.4.2)
    # W_hydro = Cm * rho_w * Area * Lsub * g
    Cm = float(inputs.get('seismic_wharf_cm', 1.0)) # Added mass coefficient (typically 1.0 for circular cylinder)
    gamma_w = 10.05 if is_metric else 0.064 # kN/m^3 or kips/ft^3 seawater
    vol_pile_sub = math.pi * ((pile_diam_m / 2.0) ** 2) * pile_sub_len_m
    W_hydro_added = num_piles * Cm * gamma_w * vol_pile_sub
    
    # Virtual effective seismic weight of wharf
    W_wharf_effective = wharf_deck_weight + (0.5 * W_piles) + W_hydro_added
    V_wharf = Cs * W_wharf_effective
    V_pile_avg = V_wharf / max(1, num_piles)
    V_pile_overstrength = Omega0 * V_pile_avg
    
    # 10. Nonstructural Components & Port Equipment (Chapter 13)
    include_equipment = bool(inputs.get('seismic_include_equipment', True))
    ap = float(inputs.get('seismic_equip_ap', 2.5)) # Equipment dynamic amplification
    Rp = float(inputs.get('seismic_equip_rp', 3.0)) # Equipment ductility
    Ip = float(inputs.get('seismic_equip_ip', 1.5)) # Equipment importance factor
    Wp = float(inputs.get('seismic_equip_wp', 1500.0 if is_metric else 337.0)) # Crane / Transformer weight
    z_over_h = float(inputs.get('seismic_equip_zh', 1.0)) # At deck level or roof
    
    # Eq. 13.3-1: Fp = (0.4 * ap * SDS * Wp) / (Rp / Ip) * (1 + 2 * z/h)
    Fp_base = ((0.4 * ap * SDS * Wp) / (Rp / Ip)) * (1.0 + 2.0 * z_over_h)
    Fp_max = 1.6 * SDS * Ip * Wp
    Fp_min = 0.3 * SDS * Ip * Wp
    Fp_governing = max(Fp_min, min(Fp_base, Fp_max))
    
    # 11. Design Response Spectrum Curve Points for Plotting
    spectrum_points = []
    # Generate points from T=0 to T=min(10.0, TL + 2.0)
    t_end = max(4.0, TL + 1.0)
    steps = 60
    dt = t_end / steps
    
    for i in range(steps + 1):
        cur_t = round(i * dt, 3)
        if cur_t == 0:
            sa = 0.4 * SDS
        elif cur_t < T0:
            sa = SDS * (0.4 + 0.6 * (cur_t / T0))
        elif cur_t <= Ts:
            sa = SDS
        elif cur_t <= TL:
            sa = SD1 / cur_t
        else:
            sa = (SD1 * TL) / (cur_t ** 2)
        spectrum_points.append({'T': cur_t, 'Sa': round(sa, 4)})
        
    # Ensure T0, Ts, TL, and operating T are explicitly included in spectrum points
    key_t_vals = [T0, Ts, TL, T]
    for kt in key_t_vals:
        if 0 < kt <= t_end:
            if kt < T0:
                sa_k = SDS * (0.4 + 0.6 * (kt / T0))
            elif kt <= Ts:
                sa_k = SDS
            elif kt <= TL:
                sa_k = SD1 / kt
            else:
                sa_k = (SD1 * TL) / (kt ** 2)
            spectrum_points.append({'T': round(kt, 3), 'Sa': round(sa_k, 4)})
            
    spectrum_points.sort(key=lambda pt: pt['T'])
    # Deduplicate points by T
    unique_spectrum = []
    seen_t = set()
    for pt in spectrum_points:
        if pt['T'] not in seen_t:
            seen_t.add(pt['T'])
            unique_spectrum.append(pt)
            
    # Unit conversions for display
    f_unit = 'kN' if is_metric else 'kips'
    f_alt = 'tf' if is_metric else 'tons'
    l_unit = 'm' if is_metric else 'ft'
    
    return {
        'success': True,
        'standard': standard,
        'unit_system': unit_system,
        'risk_category': risk_cat,
        'importance_factor_Ie': Ie,
        'site_class': site_class,
        'spectral_parameters': {
            'Ss': Ss,
            'S1': S1,
            'Fa': Fa,
            'Fv': Fv,
            'SMS': round(SMS, 3),
            'SM1': round(SM1, 3),
            'SDS': round(SDS, 3),
            'SD1': round(SD1, 3),
            'T0': round(T0, 3),
            'Ts': round(Ts, 3),
            'TL': TL
        },
        'sdc': {
            'governing': sdc,
            'sdc_sds': sdc_sds,
            'sdc_sd1': sdc_sd1
        },
        'sfrs': {
            'preset': sfrs_preset,
            'name': preset_data['name'],
            'R': R,
            'Omega0': Omega0,
            'Cd': Cd
        },
        'periods': {
            'Ta': round(Ta, 3),
            'Cu': round(Cu, 2),
            'T_max': round(T_max, 3),
            'T_operating': round(T, 3),
            'reason': period_governing_reason
        },
        'seismic_coefficient_cs': {
            'Cs_governing': round(Cs, 4),
            'Cs_base': round(Cs_base, 4),
            'Cs_max': round(Cs_max, 4),
            'Cs_min': round(Cs_min, 4),
            'Cs_min_s1': round(Cs_min_s1, 4)
        },
        'base_shear': {
            'W_total': round(W_total, 1),
            'V': round(V, 1),
            'V_tf': round(V / 9.80665, 1) if is_metric else round(V, 1),
            'V_overstrength': round(V_overstrength, 1),
            'V_overstrength_tf': round(V_overstrength / 9.80665, 1) if is_metric else round(V_overstrength, 1),
            'Mot': round(Mot, 1),
            'Mot_tfm': round(Mot / 9.80665, 1) if is_metric else round(Mot, 1)
        },
        'vertical_effects': {
            'rho': rho,
            'Ev_factor': round(Ev_factor, 3),
            'lrfd_comb_grav_seismic': f"(1.2 + {Ev_factor:.2f})D + {rho}QE + L = {1.2 + Ev_factor:.2f}D + {rho}QE + L",
            'lrfd_comb_uplift': f"(0.9 - {Ev_factor:.2f})D + {rho}QE = {0.9 - Ev_factor:.2f}D + {rho}QE"
        },
        'stories': stories_data,
        'wharf_module': {
            'is_applicable': is_wharf,
            'deck_weight': round(wharf_deck_weight, 1),
            'num_piles': num_piles,
            'pile_diameter': pile_diam_m,
            'pile_submerged_len': pile_sub_len_m,
            'piles_self_weight': round(W_piles, 1),
            'hydrodynamic_added_weight': round(W_hydro_added, 1),
            'total_effective_seismic_weight': round(W_wharf_effective, 1),
            'V_wharf': round(V_wharf, 1),
            'V_wharf_tf': round(V_wharf / 9.80665, 1) if is_metric else round(V_wharf, 1),
            'V_per_pile_avg': round(V_pile_avg, 1),
            'V_per_pile_avg_tf': round(V_pile_avg / 9.80665, 1) if is_metric else round(V_pile_avg, 1),
            'V_per_pile_overstrength': round(V_pile_overstrength, 1),
            'V_per_pile_overstrength_tf': round(V_pile_overstrength / 9.80665, 1) if is_metric else round(V_pile_overstrength, 1)
        },
        'nonstructural_equipment': {
            'is_applicable': include_equipment,
            'ap': ap,
            'Rp': Rp,
            'Ip': Ip,
            'Wp': round(Wp, 1),
            'z_over_h': z_over_h,
            'Fp_base': round(Fp_base, 1),
            'Fp_min': round(Fp_min, 1),
            'Fp_max': round(Fp_max, 1),
            'Fp_governing': round(Fp_governing, 1),
            'Fp_tf': round(Fp_governing / 9.80665, 1) if is_metric else round(Fp_governing, 1)
        },
        'spectrum_curve': unique_spectrum
    }
