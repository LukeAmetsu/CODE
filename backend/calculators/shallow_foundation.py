"""
Shallow Foundation Calculator (Dimensionamento Geotécnico e Estrutural de Sapatas Rígidas)
Standards: ABNT NBR 6118:2023 (Projeto de Estruturas de Concreto)
           ABNT NBR 6122:2019 (Projeto e Execução de Fundações)

Features:
- Soil-structure interaction via Winkler subgrade area springs (ks, Kz, Kθx, Kθy, Kx, Ky)
- Complete eccentricity kernel analysis (Kern Zones 1 to 5, detachment check)
- Contact pressure distribution at 4 corners (sigma1, sigma2, sigma3, sigma4, sigma_max, sigma_med)
- Global stability checks: Overturning safety factor (FS_tomb >= 1.5) and Base sliding resistance (FS_desl >= 1.5)
- NBR 6118 flexural design: moments at critical section (0.15*a inside column), required As, minimum As, rebar arrangement
- Concrete shear check (VRd1 diagonal tension without stirrups)
- Punching shear check at perimeter u0 (tau_Rd2 crushing of diagonal strut) and u1 (tau_Rd1)
- Material and executive Bill of Materials (BOM)
"""

import math
from typing import Dict, Any, List, Tuple


def get_shallow_foundation_reference_data() -> Dict[str, Any]:
    """Returns typical geotechnical soil parameters, concrete classes and presets."""
    return {
        "soils": [
            {"type": "Areia pouco compacta", "sigma_adm_kpa": 100.0, "phi_deg": 28.0, "c_kpa": 0.0, "ks_kpa_m": 15000.0, "gamma_kn_m3": 17.5},
            {"type": "Areia medianamente compacta", "sigma_adm_kpa": 200.0, "phi_deg": 32.0, "c_kpa": 0.0, "ks_kpa_m": 30000.0, "gamma_kn_m3": 18.5},
            {"type": "Areia compacta", "sigma_adm_kpa": 350.0, "phi_deg": 38.0, "c_kpa": 0.0, "ks_kpa_m": 50000.0, "gamma_kn_m3": 19.5},
            {"type": "Silte arenoso medianamente compacto", "sigma_adm_kpa": 150.0, "phi_deg": 26.0, "c_kpa": 10.0, "ks_kpa_m": 20000.0, "gamma_kn_m3": 17.0},
            {"type": "Argila siltosa média", "sigma_adm_kpa": 120.0, "phi_deg": 18.0, "c_kpa": 25.0, "ks_kpa_m": 15000.0, "gamma_kn_m3": 16.5},
            {"type": "Argila rija", "sigma_adm_kpa": 250.0, "phi_deg": 22.0, "c_kpa": 50.0, "ks_kpa_m": 35000.0, "gamma_kn_m3": 18.0},
            {"type": "Argila muito rija / dura", "sigma_adm_kpa": 400.0, "phi_deg": 25.0, "c_kpa": 100.0, "ks_kpa_m": 60000.0, "gamma_kn_m3": 19.0},
            {"type": "Rocha alterada branda", "sigma_adm_kpa": 800.0, "phi_deg": 40.0, "c_kpa": 120.0, "ks_kpa_m": 120000.0, "gamma_kn_m3": 22.0}
        ],
        "concrete_classes": [20, 25, 30, 35, 40, 50],
        "steel_classes": ["CA-50", "CA-60"],
        "default_params": {
            "dim_A": 1.50,
            "dim_B": 1.50,
            "h_total": 0.60,
            "h0_edge": 0.25,
            "col_a": 0.40,
            "col_b": 0.40,
            "embedment_depth_Df": 1.50,
            "Nk_kN": 350.0,
            "Hxk_kN": 15.0,
            "Hyk_kN": 20.0,
            "Mxk_kNm": 25.0,
            "Myk_kNm": 30.0,
            "sigma_adm_kPa": 200.0,
            "soil_phi_deg": 30.0,
            "soil_cohesion_kPa": 10.0,
            "soil_gamma_kNm3": 18.0,
            "ks_subgrade_kNm3": 30000.0,
            "fck_MPa": 30.0,
            "fyk_MPa": 500.0,
            "concrete_cover_cm": 4.0,
            "preferred_phi_mm": 12.5
        }
    }


def calculate_shallow_foundation(inputs: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes complete shallow foundation stability and structural design according to NBR 6118 & NBR 6122.
    """
    try:
        # -------------------------------------------------------------------------
        # 1. GEOMETRY & MATERIAL PROPERTIES
        # -------------------------------------------------------------------------
        A = float(inputs.get('dim_A', 1.50))                  # m (Length along X)
        B = float(inputs.get('dim_B', 1.50))                  # m (Width along Y)
        h = float(inputs.get('h_total', 0.60))                # m (Total height)
        h0 = float(inputs.get('h0_edge', h / 3.0))            # m (Edge thickness, default h/3)
        h0 = min(h, max(0.15, h0))
        
        col_a = float(inputs.get('col_a', 0.40))              # m (Column dimension along X)
        col_b = float(inputs.get('col_b', 0.40))              # m (Column dimension along Y)
        
        col_ex_center = float(inputs.get('col_ex_center', 0.0)) # m (Pedestal eccentricity along X)
        col_ey_center = float(inputs.get('col_ey_center', 0.0)) # m (Pedestal eccentricity along Y)
        
        Df = float(inputs.get('embedment_depth_Df', 1.50))    # m (Foundation base embedment depth)
        is_sloped = bool(inputs.get('is_sloped', True))       # True: tronco-piramidal, False: reta
        
        gamma_c = float(inputs.get('gamma_concrete', 25.0))   # kN/m³
        gamma_soil = float(inputs.get('soil_gamma_kNm3', 18.0)) # kN/m³
        
        fck = float(inputs.get('fck_MPa', 30.0))              # MPa
        fyk = float(inputs.get('fyk_MPa', 500.0))             # MPa (CA-50)
        cover_cm = float(inputs.get('concrete_cover_cm', 4.0))# cm
        pref_phi = float(inputs.get('preferred_phi_mm', 12.5))# mm
        
        gamma_f = float(inputs.get('gamma_f', 1.4))           # Load factor
        gamma_c_mat = 1.4                                     # Concrete material factor
        gamma_s_mat = 1.15                                    # Steel material factor
        
        fcd = fck / gamma_c_mat                               # MPa
        fyd = fyk / gamma_s_mat                               # MPa
        fctm = 0.30 * (fck ** (2.0 / 3.0))                    # MPa
        fctk_inf = 0.70 * fctm                                # MPa
        fctd = fctk_inf / gamma_c_mat                         # MPa
        
        d_x = max(0.10, h - (cover_cm / 100.0) - (pref_phi / 2000.0)) # m
        d_y = max(0.10, d_x - (pref_phi / 1000.0))                     # m
        d_eff = (d_x + d_y) / 2.0
        
        # -------------------------------------------------------------------------
        # 2. RIGIDITY CHECKS (NBR 6118 § 22.4.1)
        # -------------------------------------------------------------------------
        cantilever_x = (A - col_a) / 2.0
        cantilever_y = (B - col_b) / 2.0
        max_cantilever = max(cantilever_x, cantilever_y)
        
        h_min_rigid = max_cantilever / 3.0
        is_rigid_by_height = (h >= h_min_rigid - 1e-4)
        
        slope_angle_x_rad = math.atan((h - h0) / max(1e-4, cantilever_x)) if cantilever_x > 0 else math.pi / 2.0
        slope_angle_y_rad = math.atan((h - h0) / max(1e-4, cantilever_y)) if cantilever_y > 0 else math.pi / 2.0
        slope_angle_x_deg = math.degrees(slope_angle_x_rad)
        slope_angle_y_deg = math.degrees(slope_angle_y_rad)
        min_slope_deg = min(slope_angle_x_deg, slope_angle_y_deg)
        
        is_rigid_by_slope = (min_slope_deg >= 29.9) or (not is_sloped)
        is_rigid_footing = is_rigid_by_height
        
        # -------------------------------------------------------------------------
        # 3. SELF WEIGHT & OVERBURDEN SOIL
        # -------------------------------------------------------------------------
        # Footing volume
        if is_sloped and (h > h0):
            # Tronco de pirâmide: V = h0 * A * B + ((h - h0)/3) * (A*B + a*b + sqrt(A*B*a*b))
            v_base = h0 * A * B
            v_trunk = ((h - h0) / 3.0) * (A * B + col_a * col_b + math.sqrt(A * B * col_a * col_b))
            vol_footing = v_base + v_trunk
        else:
            vol_footing = A * B * h
            
        weight_footing = vol_footing * gamma_c
        
        # Overburden soil volume above footing
        vol_total_prism = A * B * max(h, Df)
        vol_soil_above = max(0.0, vol_total_prism - vol_footing)
        weight_soil = vol_soil_above * gamma_soil
        
        # -------------------------------------------------------------------------
        # 4. APPLIED SERVICE LOADS & MOMENTS AT BASE
        # -------------------------------------------------------------------------
        Nk = float(inputs.get('Nk_kN', 350.0))                # kN (Downward axial load)
        Hxk = float(inputs.get('Hxk_kN', 15.0))               # kN (Horizontal force along X)
        Hyk = float(inputs.get('Hyk_kN', 20.0))               # kN (Horizontal force along Y)
        Mxk = float(inputs.get('Mxk_kNm', 25.0))              # kNm (Bending moment around X)
        Myk = float(inputs.get('Myk_kNm', 30.0))              # kNm (Bending moment around Y)
        
        # Total vertical service force at base
        N_tot = Nk + weight_footing + weight_soil
        
        # Lever arm of column horizontal loads to foundation base = h
        Mx_base = Mxk + Hyk * h + Nk * col_ey_center
        My_base = Myk + Hxk * h + Nk * col_ex_center
        
        # Eccentricities at base
        ex = abs(My_base) / max(1e-3, N_tot)
        ey = abs(Mx_base) / max(1e-3, N_tot)
        
        # -------------------------------------------------------------------------
        # 5. WINKLER AREA SOIL SPRINGS
        # -------------------------------------------------------------------------
        sigma_adm_kPa = float(inputs.get('sigma_adm_kPa', 200.0)) # kPa
        ks_input = float(inputs.get('ks_subgrade_kNm3', 0.0))
        
        if ks_input > 0:
            ks_subgrade = ks_input
        else:
            # Typical empirical correlation: ks ≈ 120 * sigma_adm_kPa / 0.025m (for 25mm settlement)
            ks_subgrade = (sigma_adm_kPa / 0.010) # 10mm settlement at sigma_adm
            
        area_base = A * B
        Ix_base = (A * (B ** 3)) / 12.0
        Iy_base = (B * (A ** 3)) / 12.0
        
        # Global spring stiffnesses
        Kz_global_kN_m = ks_subgrade * area_base
        Ktheta_x_kNm_rad = ks_subgrade * Ix_base
        Ktheta_y_kNm_rad = ks_subgrade * Iy_base
        Kx_global_kN_m = 0.70 * Kz_global_kN_m
        Ky_global_kN_m = 0.70 * Kz_global_kN_m
        
        # -------------------------------------------------------------------------
        # 6. CONTACT PRESSURE & KERN ANALYSIS (NBR 6122 / Excel Reference)
        # -------------------------------------------------------------------------
        # Kern limits
        kern_x = A / 6.0
        kern_y = B / 6.0
        kern_ratio = (ex / kern_x) + (ey / kern_y)
        
        sigma_mean = N_tot / area_base
        
        # Corner pressures assuming elastic linear soil
        # Corner 1: (+x, +y), Corner 2: (-x, +y), Corner 3: (-x, -y), Corner 4: (+x, -y)
        sign_mx = 1.0 if Mx_base >= 0 else -1.0
        sign_my = 1.0 if My_base >= 0 else -1.0
        
        s1 = sigma_mean * (1.0 + (6.0 * ex / A) + (6.0 * ey / B))
        s2 = sigma_mean * (1.0 - (6.0 * ex / A) + (6.0 * ey / B))
        s3 = sigma_mean * (1.0 - (6.0 * ex / A) - (6.0 * ey / B))
        s4 = sigma_mean * (1.0 + (6.0 * ex / A) - (6.0 * ey / B))
        
        sigma_max_elastic = max(s1, s2, s3, s4)
        sigma_min_elastic = min(s1, s2, s3, s4)
        
        # Check Kern Zone
        # Zone 1: Entire base compressed (kern_ratio <= 1.0)
        # Zones 2-5: Partial detachment (tension cutoff in soil)
        if kern_ratio <= 1.0:
            kern_zone = "Zona 1 (Compressão Total)"
            compressed_area_ratio = 1.0
            sigma_max = sigma_max_elastic
            sigma_min = max(0.0, sigma_min_elastic)
            sigma_corners = [round(s1, 1), round(s2, 1), round(s3, 1), round(s4, 1)]
        else:
            # Base partially lifted. Calculate realistic maximum compression without tension
            if ey < 1e-4 and ex > 0:
                # Uniaxial along X
                compressed_len_x = 3.0 * (A / 2.0 - ex)
                compressed_area_ratio = min(1.0, max(0.0, compressed_len_x / A))
                sigma_max = (2.0 * N_tot) / (3.0 * B * max(0.05, A / 2.0 - ex))
                kern_zone = "Zona 2 (Descolamento Uniaxial em X)"
            elif ex < 1e-4 and ey > 0:
                # Uniaxial along Y
                compressed_len_y = 3.0 * (B / 2.0 - ey)
                compressed_area_ratio = min(1.0, max(0.0, compressed_len_y / B))
                sigma_max = (2.0 * N_tot) / (3.0 * A * max(0.05, B / 2.0 - ey))
                kern_zone = "Zona 2 (Descolamento Uniaxial em Y)"
            else:
                # Biaxial detachment (Meyerhof / Highmark equivalent compressed trapezoid/triangle)
                # Effective dimensions: A' = A - 2*ex, B' = B - 2*ey
                A_eff = max(0.10, A - 2.0 * ex)
                B_eff = max(0.10, B - 2.0 * ey)
                compressed_area_ratio = min(1.0, max(0.10, (A_eff * B_eff) / area_base))
                sigma_max = N_tot / (A_eff * B_eff) * (1.0 + 0.35 * (kern_ratio - 1.0))
                
                if kern_ratio <= 1.5:
                    kern_zone = "Zona 2/3 (Descolamento Biaxial Moderado)"
                else:
                    kern_zone = "Zona 4/5 (Descolamento Biaxial Severo)"
            
            sigma_min = 0.0
            sigma_corners = [round(max(0.0, s1), 1), round(max(0.0, s2), 1), round(max(0.0, s3), 1), round(max(0.0, s4), 1)]
            
        compressed_area_m2 = compressed_area_ratio * area_base
        
        # Geotechnical Allowable Stress Checks (NBR 6122)
        # sigma_max <= 1.30 * sigma_adm (edge allowable increase)
        # sigma_mean <= sigma_adm
        sigma_adm_edge_kPa = 1.30 * sigma_adm_kPa
        ratio_sigma_max = sigma_max / sigma_adm_edge_kPa
        ratio_sigma_mean = sigma_mean / sigma_adm_kPa
        ok_sigma_max = (ratio_sigma_max <= 1.001)
        ok_sigma_mean = (ratio_sigma_mean <= 1.001)
        ok_detachment = (compressed_area_ratio >= 0.70) # NBR 6122 recommendation for persistent combos
        
        # -------------------------------------------------------------------------
        # 7. OVERTURNING & SLIDING STABILITY CHECKS
        # -------------------------------------------------------------------------
        # Overturning around axes (FS Global)
        M_stab_x = N_tot * (B / 2.0)
        M_stab_y = N_tot * (A / 2.0)
        
        FS_tomb_x = (M_stab_x / abs(Mx_base)) if abs(Mx_base) > 0 else 999.0
        FS_tomb_y = (M_stab_y / abs(My_base)) if abs(My_base) > 0 else 999.0
        FS_tomb = min(FS_tomb_x, FS_tomb_y)
        ok_overturning_global = (FS_tomb >= 1.50)
        
        # Base Sliding (Atrito e Coesão do Solo - FS Global)
        phi_deg = float(inputs.get('soil_phi_deg', 30.0))
        cohesion_kPa = float(inputs.get('soil_cohesion_kPa', 10.0))
        
        # Friction angle concrete-soil: delta = 2/3 * phi (NBR 6122 / Eurocode 7)
        delta_rad = math.radians((2.0 / 3.0) * phi_deg)
        ca_kPa = (2.0 / 3.0) * cohesion_kPa # Adhesion
        
        H_resultant = math.sqrt(Hxk ** 2 + Hyk ** 2)
        H_atrito = N_tot * math.tan(delta_rad)
        H_adesao = ca_kPa * compressed_area_m2
        H_resistente = H_atrito + H_adesao
        
        FS_sliding = (H_resistente / max(0.10, H_resultant)) if H_resultant > 0 else 999.0
        ok_sliding_global = (FS_sliding >= 1.50)

        # -------------------------------------------------------------------------
        # 7.B. PONDERADA (NBR 6122 ANEXO A/B & EUROCODE 7 - EQU / GEO)
        # -------------------------------------------------------------------------
        gamma_fav_geo = 0.90
        gamma_unfav_geo = 1.40
        gamma_R_slide = 1.15
        
        M_stab_d_x = (gamma_fav_geo * N_tot) * (B / 2.0)
        M_stab_d_y = (gamma_fav_geo * N_tot) * (A / 2.0)
        M_tomb_d_x = gamma_unfav_geo * abs(Mx_base)
        M_tomb_d_y = gamma_unfav_geo * abs(My_base)
        
        ratio_tomb_d_x = M_tomb_d_x / max(1e-3, M_stab_d_x)
        ratio_tomb_d_y = M_tomb_d_y / max(1e-3, M_stab_d_y)
        ratio_tomb_d = max(ratio_tomb_d_x, ratio_tomb_d_y)
        ok_overturning_ponderada = (ratio_tomb_d <= 1.001)

        N_d_fav = gamma_fav_geo * N_tot
        H_atrito_d = (N_d_fav * math.tan(delta_rad)) / gamma_R_slide
        H_adesao_d = (ca_kPa * compressed_area_m2) / 1.30
        R_sd = H_atrito_d + H_adesao_d
        H_sd = gamma_unfav_geo * H_resultant
        ratio_sliding_d = (H_sd / max(0.10, R_sd)) if H_resultant > 0 else 0.0
        ok_sliding_ponderada = (ratio_sliding_d <= 1.001)

        sigma_max_d_geo = gamma_unfav_geo * sigma_max
        sigma_Rd = 1.40 * sigma_adm_edge_kPa
        ratio_bearing_d = sigma_max_d_geo / max(1e-3, sigma_Rd)
        ok_bearing_ponderada = (ratio_bearing_d <= 1.001)

        geo_method = str(inputs.get('geo_method', 'ambos')).lower()
        if 'global' in geo_method and 'ponderada' not in geo_method:
            ok_overturning = ok_overturning_global
            ok_sliding = ok_sliding_global
        elif 'ponderada' in geo_method and 'global' not in geo_method:
            ok_overturning = ok_overturning_ponderada
            ok_sliding = ok_sliding_ponderada
        else:
            ok_overturning = ok_overturning_global and ok_overturning_ponderada
            ok_sliding = ok_sliding_global and ok_sliding_ponderada
        
        # -------------------------------------------------------------------------
        # 8. STRUCTURAL DESIGN NBR 6118 (Bending, Shear, Punching)
        # -------------------------------------------------------------------------
        # Critical section for bending moment: 0.15 * column dimension inside column face
        # S1x = (A - a)/2 + 0.15*a = (A - 0.70*a) / 2
        cant_calc_x = (A - 0.70 * col_a) / 2.0
        cant_calc_y = (B - 0.70 * col_b) / 2.0
        
        # Design soil pressure at base (ULS)
        sigma_mean_d = sigma_mean * gamma_f
        sigma_max_d = sigma_max * gamma_f
        
        # Design Bending Moments (NBR 6118 / Classical Reference)
        # Integrating soil pressure over cantilever width
        # Simplified conservative formula: Msd = (sigma_mean_d * Width * cant^2) / 2
        Msd_x_kNm = (sigma_mean_d * B * (cant_calc_x ** 2)) / 2.0
        Msd_y_kNm = (sigma_mean_d * A * (cant_calc_y ** 2)) / 2.0
        
        # Flexural reinforcement area
        # As = Msd / (0.95 * d * fyd)
        fyd_kN_cm2 = (fyd * 1000.0) / 10000.0 # MPa to kN/cm² (500/1.15 = 434.8 MPa = 43.48 kN/cm²)
        d_x_cm = d_x * 100.0
        d_y_cm = d_y * 100.0
        
        As_calc_x = (Msd_x_kNm * 100.0) / (0.95 * d_x_cm * fyd_kN_cm2) # cm²
        As_calc_y = (Msd_y_kNm * 100.0) / (0.95 * d_y_cm * fyd_kN_cm2) # cm²
        
        # Minimum reinforcement (NBR 6118 Table 17.3 for slabs/footings, rho_min = 0.15%)
        rho_min = 0.0015
        As_min_x = rho_min * (B * 100.0) * (h * 100.0) # cm²
        As_min_y = rho_min * (A * 100.0) * (h * 100.0) # cm²
        
        As_x = max(As_calc_x, As_min_x)
        As_y = max(As_calc_y, As_min_y)
        
        # Rebar diameter and spacing
        bar_area_pref = math.pi * ((pref_phi / 10.0) ** 2) / 4.0 # cm²
        num_bars_x = max(3, math.ceil(As_x / bar_area_pref))
        num_bars_y = max(3, math.ceil(As_y / bar_area_pref))
        
        spacing_x_cm = ((B * 100.0) - 2.0 * cover_cm) / max(1, num_bars_x - 1)
        spacing_y_cm = ((A * 100.0) - 2.0 * cover_cm) / max(1, num_bars_y - 1)
        
        rebar_desc_x = f"{num_bars_x} c/ {spacing_x_cm:.0f} cm (As = {num_bars_x * bar_area_pref:.2f} cm²)"
        rebar_desc_y = f"{num_bars_y} c/ {spacing_y_cm:.0f} cm (As = {num_bars_y * bar_area_pref:.2f} cm²)"
        
        # -------------------------------------------------------------------------
        # 9. ONE-WAY SHEAR (NBR 6118 § 19.4.1 - VRd1 without shear reinforcement)
        # -------------------------------------------------------------------------
        # Critical section at distance d from column face:
        # cant_shear = (A - a)/2 - d
        cant_shear_x = max(0.0, cantilever_x - d_x)
        cant_shear_y = max(0.0, cantilever_y - d_y)
        
        Vsd_x = sigma_mean_d * B * cant_shear_x
        Vsd_y = sigma_mean_d * A * cant_shear_y
        Vsd_max = max(Vsd_x, Vsd_y)
        
        # VRd1 = [tau_R * k * (1.2 + 40 * rho1)] * bw * d
        tau_R_MPa = 0.25 * fctd
        k_size = min(2.0, 1.0 + math.sqrt(200.0 / max(100.0, d_eff * 1000.0)))
        rho1_x = min(0.02, As_x / (B * 100.0 * d_x_cm))
        rho1_y = min(0.02, As_y / (A * 100.0 * d_y_cm))
        
        VRd1_x_kN = (tau_R_MPa * 1000.0) * k_size * (1.2 + 40.0 * rho1_x) * B * d_x
        VRd1_y_kN = (tau_R_MPa * 1000.0) * k_size * (1.2 + 40.0 * rho1_y) * A * d_y
        
        ratio_shear_x = (Vsd_x / VRd1_x_kN) if VRd1_x_kN > 0 else 0.0
        ratio_shear_y = (Vsd_y / VRd1_y_kN) if VRd1_y_kN > 0 else 0.0
        ratio_shear = max(ratio_shear_x, ratio_shear_y)
        ok_shear = (ratio_shear <= 1.001)
        
        # -------------------------------------------------------------------------
        # 10. PUNCHING SHEAR (NBR 6118 § 20 - Contorno C0 e C1)
        # -------------------------------------------------------------------------
        # Column perimeter u0
        u0_m = 2.0 * (col_a + col_b)
        Fsd_punch = Nk * gamma_f
        
        # tau_sd0 = Fsd / (u0 * d)
        tau_sd0_MPa = (Fsd_punch / (u0_m * d_eff * 1000.0)) if (u0_m * d_eff) > 0 else 0.0
        # tau_Rd2 = 0.27 * (1 - fck/250) * fcd (Diagonal compression crushing)
        tau_Rd2_MPa = 0.27 * (1.0 - (fck / 250.0)) * fcd
        ratio_punch_0 = tau_sd0_MPa / tau_Rd2_MPa
        ok_punch_0 = (ratio_punch_0 <= 1.001)
        
        # In rigid footings where angle >= 30° and cant <= 2d, strut goes directly to ground
        # Punching verification at perimeter C1 (at 2d from column face)
        u1_m = 2.0 * (col_a + col_b) + 4.0 * math.pi * d_eff
        area_inside_u1 = col_a * col_b + 2.0 * (col_a + col_b) * (2.0 * d_eff) + math.pi * ((2.0 * d_eff) ** 2)
        # Net punching force deducting reaction inside u1
        Fsd_punch_net = max(0.0, Fsd_punch - (sigma_mean_d * min(area_inside_u1, area_base)))
        tau_sd1_MPa = (Fsd_punch_net / (u1_m * d_eff * 1000.0)) if (u1_m * d_eff) > 0 else 0.0
        
        rho1_mean = (rho1_x + rho1_y) / 2.0
        tau_Rd1_MPa = 0.13 * (1.0 + math.sqrt(200.0 / max(100.0, d_eff * 1000.0))) * ((100.0 * rho1_mean * fck) ** (1.0 / 3.0))
        ratio_punch_1 = (tau_sd1_MPa / tau_Rd1_MPa) if tau_Rd1_MPa > 0 else 0.0
        ok_punch_1 = (ratio_punch_1 <= 1.001) or is_rigid_footing
        
        # -------------------------------------------------------------------------
        # 11. BILL OF MATERIALS (BOM) & SUMMARY
        # -------------------------------------------------------------------------
        steel_length_x_m = num_bars_x * (A - 2.0 * (cover_cm / 100.0) + 2.0 * (h - 2.0 * (cover_cm / 100.0)))
        steel_length_y_m = num_bars_y * (B - 2.0 * (cover_cm / 100.0) + 2.0 * (h - 2.0 * (cover_cm / 100.0)))
        linear_density = (pref_phi ** 2) / 162.0 # kg/m
        steel_weight_kg = (steel_length_x_m + steel_length_y_m) * linear_density * 1.05 # 5% loss/overlaps
        
        bom = {
            "concrete_volume_m3": round(vol_footing, 3),
            "excavation_volume_m3": round(A * B * Df, 3),
            "backfill_soil_volume_m3": round(vol_soil_above, 3),
            "steel_weight_kg": round(steel_weight_kg, 1),
            "steel_density_kg_m3": round(steel_weight_kg / max(0.1, vol_footing), 1),
            "formwork_area_m2": round(2.0 * (A + B) * h0 + (2.0 * (A + B) * (h - h0) if not is_sloped else 0.0), 2)
        }
        
        # Overall status
        all_passed = (ok_sigma_max and ok_sigma_mean and ok_overturning and ok_sliding and ok_shear and ok_punch_0 and is_rigid_footing)
        
        return {
            "success": True,
            "overall_ok": all_passed,
            "geometry": {
                "dim_A": A,
                "dim_B": B,
                "h_total": h,
                "h0_edge": h0,
                "d_eff_m": round(d_eff, 3),
                "col_a": col_a,
                "col_b": col_b,
                "cantilever_x_m": round(cantilever_x, 3),
                "cantilever_y_m": round(cantilever_y, 3),
                "is_sloped": is_sloped,
                "slope_angle_deg": round(min_slope_deg, 1),
                "is_rigid_footing": is_rigid_footing,
                "rigidity_status": "Rígida (NBR 6118)" if is_rigid_footing else "Flexível (Aumentar h)"
            },
            "loads_at_base": {
                "Nk_kN": round(Nk, 1),
                "footing_weight_kN": round(weight_footing, 1),
                "soil_weight_kN": round(weight_soil, 1),
                "N_tot_kN": round(N_tot, 1),
                "Hxk_kN": round(Hxk, 1),
                "Hyk_kN": round(Hyk, 1),
                "H_res_kN": round(H_resultant, 1),
                "Mx_base_kNm": round(Mx_base, 1),
                "My_base_kNm": round(My_base, 1),
                "ex_m": round(ex, 4),
                "ey_m": round(ey, 4),
                "kern_ratio": round(kern_ratio, 3),
                "kern_zone": kern_zone
            },
            "contact_pressures": {
                "sigma_mean_kPa": round(sigma_mean, 1),
                "sigma_max_kPa": round(sigma_max, 1),
                "sigma_min_kPa": round(sigma_min, 1),
                "sigma_corners_kPa": sigma_corners,
                "compressed_area_ratio": round(compressed_area_ratio, 3),
                "compressed_area_m2": round(compressed_area_m2, 2),
                "sigma_adm_kPa": round(sigma_adm_kPa, 1),
                "sigma_adm_edge_kPa": round(sigma_adm_edge_kPa, 1),
                "ratio_sigma_max": round(ratio_sigma_max, 3),
                "ratio_sigma_mean": round(ratio_sigma_mean, 3),
                "ok_sigma_max": ok_sigma_max,
                "ok_sigma_mean": ok_sigma_mean,
                "ok_detachment": ok_detachment
            },
            "stability_checks": {
                "geo_method": geo_method,
                # FS Global (NBR 6122)
                "FS_overturning": round(FS_tomb, 2),
                "FS_overturning_x": round(FS_tomb_x, 2),
                "FS_overturning_y": round(FS_tomb_y, 2),
                "ok_overturning_global": ok_overturning_global,
                "H_sliding_resist_kN": round(H_resistente, 1),
                "FS_sliding": round(FS_sliding, 2),
                "ok_sliding_global": ok_sliding_global,
                # Ponderada (NBR 6122 Anexo A/B / Eurocode 7)
                "M_stab_d_kNm": round(min(M_stab_d_x, M_stab_d_y), 1),
                "M_tomb_d_kNm": round(max(M_tomb_d_x, M_tomb_d_y), 1),
                "ratio_overturning_ponderada": round(ratio_tomb_d, 3),
                "ok_overturning_ponderada": ok_overturning_ponderada,
                "R_sd_sliding_kN": round(R_sd, 1),
                "H_sd_sliding_kN": round(H_sd, 1),
                "ratio_sliding_ponderada": round(ratio_sliding_d, 3),
                "ok_sliding_ponderada": ok_sliding_ponderada,
                "ratio_bearing_ponderada": round(ratio_bearing_d, 3),
                "ok_bearing_ponderada": ok_bearing_ponderada,
                # Status Geral
                "ok_overturning": ok_overturning,
                "ok_sliding": ok_sliding
            },
            "soil_springs": {
                "ks_subgrade_kNm3": round(ks_subgrade, 1),
                "Kz_global_kN_m": round(Kz_global_kN_m, 1),
                "Kz_global_tf_m": round(Kz_global_kN_m / 9.80665, 1),
                "Ktheta_x_kNm_rad": round(Ktheta_x_kNm_rad, 1),
                "Ktheta_y_kNm_rad": round(Ktheta_y_kNm_rad, 1),
                "Kx_global_kN_m": round(Kx_global_kN_m, 1),
                "Ky_global_kN_m": round(Ky_global_kN_m, 1)
            },
            "structural_reinforcement": {
                "Msd_x_kNm": round(Msd_x_kNm, 1),
                "Msd_y_kNm": round(Msd_y_kNm, 1),
                "As_calc_x_cm2": round(As_calc_x, 2),
                "As_calc_y_cm2": round(As_calc_y, 2),
                "As_min_x_cm2": round(As_min_x, 2),
                "As_min_y_cm2": round(As_min_y, 2),
                "As_x_final_cm2": round(As_x, 2),
                "As_y_final_cm2": round(As_y, 2),
                "rebar_x": rebar_desc_x,
                "rebar_y": rebar_desc_y,
                "num_bars_x": num_bars_x,
                "num_bars_y": num_bars_y,
                "spacing_x_cm": round(spacing_x_cm, 1),
                "spacing_y_cm": round(spacing_y_cm, 1),
                "bar_diameter_mm": pref_phi
            },
            "shear_and_punching": {
                "Vsd_max_kN": round(Vsd_max, 1),
                "VRd1_kN": round(min(VRd1_x_kN, VRd1_y_kN), 1),
                "ratio_shear": round(ratio_shear, 3),
                "ok_shear": ok_shear,
                "tau_sd0_MPa": round(tau_sd0_MPa, 2),
                "tau_Rd2_MPa": round(tau_Rd2_MPa, 2),
                "ratio_punch_0": round(ratio_punch_0, 3),
                "ok_punch_0": ok_punch_0,
                "tau_sd1_MPa": round(tau_sd1_MPa, 2),
                "tau_Rd1_MPa": round(tau_Rd1_MPa, 2),
                "ratio_punch_1": round(ratio_punch_1, 3),
                "ok_punch_1": ok_punch_1
            },
            "bom": bom
        }
    except Exception as e:
        import traceback
        return {
            "success": False,
            "error": str(e),
            "trace": traceback.format_exc()
        }
