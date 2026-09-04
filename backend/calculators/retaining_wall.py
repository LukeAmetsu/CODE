"""
Retaining Wall Stability & Design Calculator (Calculador de Estabilidade de Muro de Arrimo)

Supports:
- Geometries: Cantilever (T-shaped, L-shaped), Gravity Wall, Sloped Stem Faces, Shear Key (Dente de Chave).
- Earth Pressure Theories: Rankine and Coulomb with Soil Cohesion (Tension Crack Zc).
- Loadings: Uniform Surcharge, Backfill Slope, Water Table / Hydrostatic pressure, Drainage efficiency, Front Soil Layer (Aterro Frontal / Passivo).
- Stability Checks: Overturning FS, Sliding FS, Base Eccentricity, Soil Bearing Pressure, Stem Internal Forces.
"""

import math

def calculate_retaining_wall(inputs: dict) -> dict:
    """
    Main entry point for retaining wall stability calculations.
    """
    try:
        # 1. Parse & Sanitize Inputs
        stem_height = float(inputs.get('stem_height', 4.0))       # m
        stem_top_w = float(inputs.get('stem_top_width', 0.30))     # m
        stem_bot_w = float(inputs.get('stem_bot_width', 0.50))     # m
        toe_length = float(inputs.get('toe_length', 0.80))         # m
        heel_length = float(inputs.get('heel_length', 1.70))       # m
        base_thick = float(inputs.get('base_thickness', 0.50))     # m
        raw_batter = float(inputs.get('stem_front_batter', 0.0))   # m
        
        # Clamp stem front batter so it never exceeds available taper (stem_bot_w - stem_top_w)
        max_taper = max(0.0, stem_bot_w - stem_top_w)
        stem_front_batter = max(0.0, min(raw_batter, max_taper))

        # Key geometry
        has_key = bool(inputs.get('has_key', False))
        key_depth = float(inputs.get('key_depth', 0.50)) if has_key else 0.0 # m
        key_width = float(inputs.get('key_width', 0.40)) if has_key else 0.0 # m
        key_pos = float(inputs.get('key_pos', toe_length + stem_bot_w / 2.0)) if has_key else 0.0 # m from toe
        
        # Densities & Materials
        gamma_wall = float(inputs.get('gamma_wall', 25.0))         # kN/m³ (concrete)
        gamma_soil = float(inputs.get('gamma_soil', 18.0))         # kN/m³ (backfill)
        phi_soil_deg = float(inputs.get('phi_soil', 30.0))          # degrees
        cohesion_soil = float(inputs.get('cohesion_soil', 0.0))     # kPa
        backfill_slope_deg = float(inputs.get('backfill_slope', 0.0)) # degrees (beta)
        
        # Method & Wall Friction (delta)
        theory = inputs.get('theory', 'rankine').strip().lower()
        if theory not in ('rankine', 'coulomb'):
            theory = 'rankine'

        raw_wall_friction = inputs.get('wall_friction', None)
        if raw_wall_friction is not None and str(raw_wall_friction).strip() != '':
            wall_friction_deg = float(raw_wall_friction)
        elif theory == 'coulomb':
            # Default to 2/3 * phi per geotechnical practice (NBR 11682 / USACE / Eurocode 7)
            wall_friction_deg = round((2.0 / 3.0) * phi_soil_deg, 1)
        else:
            wall_friction_deg = 0.0

        # Front Soil Layer / Cover (Aterro Frontal / Passivo)
        toe_embedment = float(inputs.get('toe_embedment', 0.50))   # m (front soil height H_front over toe)
        gamma_front = float(inputs.get('gamma_front', gamma_soil))  # kN/m³
        phi_front_deg = float(inputs.get('phi_front', phi_soil_deg))# degrees
        cohesion_front = float(inputs.get('cohesion_front', 0.0))  # kPa
        use_passive = bool(inputs.get('use_passive', False))        # Whether to include passive pressure force in sliding FS & resisting moment

        # Foundation Soil
        gamma_found = float(inputs.get('gamma_found', 19.0))       # kN/m³
        phi_found_deg = float(inputs.get('phi_found', 30.0))       # degrees
        cohesion_found = float(inputs.get('cohesion_found', 0.0))   # kPa
        
        # Base friction coefficient: can be provided as base_friction_coef / mu or calculated from base_friction angle
        base_friction_coef_raw = inputs.get('base_friction_coef', inputs.get('mu', None))
        if base_friction_coef_raw is not None and str(base_friction_coef_raw).strip() != '':
            base_friction_coef = float(base_friction_coef_raw)
            base_friction_deg = math.degrees(math.atan(base_friction_coef))
        else:
            base_friction_deg = float(inputs.get('base_friction', phi_found_deg)) # degrees
            base_friction_coef = math.tan(math.radians(base_friction_deg))
        q_adm = float(inputs.get('q_adm', 200.0))                  # kPa (allowable bearing capacity)
        
        # Water & Surcharge
        water_height = float(inputs.get('water_height', 0.0))       # m (height of water table from base)
        gamma_water = 9.81                                          # kN/m³
        drainage_eff = float(inputs.get('drainage_eff', 1.0))      # 1.0 = 100% drained, 0.0 = undrained
        q_surcharge = float(inputs.get('q_surcharge', 10.0))        # kPa (uniform surcharge)
        
        # Target Safety Factors
        fs_ot_target = float(inputs.get('fs_overturning_min', 1.50))
        fs_sl_target = float(inputs.get('fs_sliding_min', 1.50))
        fs_br_target = float(inputs.get('fs_bearing_min', 2.00))

        # NBR 6118 Simplified Reinforcement Design Parameters
        fck_MPa = float(inputs.get('fck', 25.0))          # MPa (concrete compressive strength)
        fyk_MPa = float(inputs.get('fyk', 500.0))          # MPa (steel yield strength)
        cover_stem_mm = float(inputs.get('cover_stem', 40.0))   # mm
        cover_base_mm = float(inputs.get('cover_base', 50.0))   # mm
        bar_diam_mm = float(inputs.get('bar_diam', 16.0))       # mm (main bars)
        gamma_f = float(inputs.get('gamma_f', 1.4))             # load factor (γf)

        # Radians conversion
        phi_rad = math.radians(phi_soil_deg)
        beta_rad = math.radians(backfill_slope_deg)
        delta_rad = math.radians(wall_friction_deg)
        phi_found_rad = math.radians(phi_found_deg)
        phi_front_rad = math.radians(phi_front_deg)
        delta_base_rad = math.radians(base_friction_deg)
        
        # 2. Geometric Coordinates & Dimensions
        B = toe_length + stem_bot_w + heel_length
        if B <= 0:
            return {"error": "A largura total da base (B) deve ser maior que zero."}
            
        h_slope = heel_length * math.tan(beta_rad)
        total_height_stem = stem_height + base_thick
        H_total = total_height_stem + h_slope
        
        # 3. Earth Pressure Coefficients
        if theory == 'coulomb':
            alpha_rad = math.pi / 2.0
            num = math.sin(alpha_rad + phi_rad) ** 2
            sin_alpha = math.sin(alpha_rad)
            sin_alpha_delta = math.sin(alpha_rad - delta_rad)
            sin_phi_delta = math.sin(phi_rad + delta_rad)
            sin_phi_beta = math.sin(phi_rad - beta_rad)
            sin_alpha_beta = math.sin(alpha_rad + beta_rad)
            
            denom_inner = (sin_phi_delta * sin_phi_beta) / (sin_alpha_delta * sin_alpha_beta)
            if denom_inner < 0:
                denom_inner = 0
            denom = (sin_alpha * math.sin(alpha_rad - delta_rad) * (1.0 + math.sqrt(denom_inner)) ** 2)
            Ka = num / denom if denom > 0 else 0.333
            angle_force_deg = wall_friction_deg
        else:
            if beta_rad > phi_rad:
                return {"error": "O ângulo do talude (beta) não pode ser maior que o ângulo de atrito do solo (phi)."}
            cos_b = math.cos(beta_rad)
            sqrt_val = math.sqrt(max(0.0, cos_b**2 - math.cos(phi_rad)**2))
            Ka = cos_b * ((cos_b - sqrt_val) / (cos_b + sqrt_val))
            angle_force_deg = backfill_slope_deg

        angle_force_rad = math.radians(angle_force_deg)

        # Passive Earth Pressure Coefficient for Front Soil & Key
        Kp_front = (math.tan(math.radians(45.0 + phi_front_deg / 2.0))) ** 2

        # 4. Weight Calculation & Centers of Gravity (Origin (0,0) at Toe Front Bottom)
        weights = []
        
        # Base Slab
        W_base = B * base_thick * gamma_wall
        x_base = B / 2.0
        weights.append(("Base", W_base, x_base))
        
        # Stem Components
        x_stem_start = toe_length
        b_front_tri = stem_front_batter
        b_rect = min(stem_top_w, stem_bot_w)
        b_back_tri = max(0.0, stem_bot_w - b_rect - b_front_tri)
            
        # Front triangle of stem
        if b_front_tri > 0:
            W_stem_front = 0.5 * b_front_tri * stem_height * gamma_wall
            x_stem_front = x_stem_start + (2.0 / 3.0) * b_front_tri
            weights.append(("Haste (Triâng. Frontal)", W_stem_front, x_stem_front))
            
        # Middle rectangle of stem
        W_stem_rect = b_rect * stem_height * gamma_wall
        x_stem_rect = x_stem_start + b_front_tri + b_rect / 2.0
        weights.append(("Haste (Retângulo)", W_stem_rect, x_stem_rect))
        
        # Back triangle of stem
        if b_back_tri > 0:
            W_stem_back = 0.5 * b_back_tri * stem_height * gamma_wall
            x_stem_back = x_stem_start + b_front_tri + b_rect + (1.0 / 3.0) * b_back_tri
            weights.append(("Haste (Triâng. Posterior)", W_stem_back, x_stem_back))
            
        # Key Weight
        if has_key and key_depth > 0 and key_width > 0:
            W_key = key_width * key_depth * gamma_wall
            x_key = key_pos + key_width / 2.0
            weights.append(("Dente de Chave", W_key, x_key))

        # Soil Block over Front Toe (Aterro Frontal)
        if toe_length > 0 and toe_embedment > 0:
            W_soil_front = toe_length * toe_embedment * gamma_front
            x_soil_front = toe_length / 2.0
            weights.append(("Solo sobre a Puntera (Aterro Frontal)", W_soil_front, x_soil_front))

        # Soil Block over Heel
        x_heel_start = toe_length + stem_bot_w
        effective_water_pressure_factor = (1.0 - drainage_eff)
        
        # Water height above the top of base slab (inside backfill soil column of height stem_height)
        h_water_in_heel = max(0.0, min(water_height - base_thick, stem_height))
        
        if h_water_in_heel > 0 and effective_water_pressure_factor > 0:
            gamma_dry = gamma_soil
            gamma_sub = gamma_soil - gamma_water
            h_dry_heel = max(0.0, stem_height - h_water_in_heel)
            W_soil_rect = heel_length * (h_dry_heel * gamma_dry + h_water_in_heel * gamma_sub)
        else:
            W_soil_rect = heel_length * stem_height * gamma_soil
            
        x_soil_rect = x_heel_start + heel_length / 2.0
        weights.append(("Solo sobre a Sapata Posterior", W_soil_rect, x_soil_rect))
        
        # Soil Triangle over Heel due to Backfill Slope (beta)
        if h_slope > 0:
            W_soil_slope = 0.5 * heel_length * h_slope * gamma_soil
            x_soil_slope = x_heel_start + (2.0 / 3.0) * heel_length
            weights.append(("Solo do Talude (Aterro)", W_soil_slope, x_soil_slope))

        # Vertical Surcharge Weight over Heel Slab (Sobrecarga sobre o Calcanhar)
        if heel_length > 0 and q_surcharge > 0:
            W_surcharge_heel = heel_length * q_surcharge
            x_surcharge_heel = x_heel_start + heel_length / 2.0
            weights.append(("Sobrecarga sobre o Calcanhar", W_surcharge_heel, x_surcharge_heel))

        # Sum of Vertical Weights
        total_W = sum(w[1] for w in weights)
        M_res_weights = sum(w[1] * w[2] for w in weights)

        # 5. Active Lateral Earth & Water Forces (WITH COHESION TENSION CRACK REFINEMENT)
        # Tension crack depth z_c due to cohesion c'
        if cohesion_soil > 0 and gamma_soil > 0 and Ka > 0:
            z_c = (2.0 * cohesion_soil) / (gamma_soil * math.sqrt(Ka))
            z_c = min(z_c, H_total)
        else:
            z_c = 0.0

        # Active force from soil (effective height = H_total - z_c)
        H_eff = max(0.0, H_total - z_c)
        P_a_soil = 0.5 * Ka * gamma_soil * (H_eff ** 2)
        arm_soil = H_eff / 3.0
        
        # Surcharge active force
        P_a_sur_raw = Ka * q_surcharge * H_total
        if z_c > 0 and Ka > 0:
            P_a_sur = max(0.0, P_a_sur_raw - 2.0 * cohesion_soil * math.sqrt(Ka) * z_c)
        else:
            P_a_sur = P_a_sur_raw
        arm_sur = H_total / 2.0
        
        # Water Hydrostatic Force (capped at H_total)
        h_water_eff = min(water_height, H_total)
        P_water = 0.5 * gamma_water * (h_water_eff ** 2) * effective_water_pressure_factor
        arm_water = h_water_eff / 3.0
        
        P_h_soil = P_a_soil * math.cos(angle_force_rad)
        P_v_soil = P_a_soil * math.sin(angle_force_rad)
        
        P_h_sur = P_a_sur * math.cos(angle_force_rad)
        P_v_sur = P_a_sur * math.sin(angle_force_rad)
        
        P_h_water = P_water
        
        total_Ph = P_h_soil + P_h_sur + P_h_water
        total_Pv = P_v_soil + P_v_sur
        
        # Overturning Moment about Toe
        M_overturning = (P_h_soil * arm_soil) + (P_h_sur * arm_sur) + (P_h_water * arm_water)
        
        # Resisting Moment about Toe
        # Rankine acts on vertical heel plane (x = B); Coulomb acts on back face of stem (x = toe_length + stem_bot_w)
        x_backfill_wall = B if theory == 'rankine' else (toe_length + stem_bot_w)
        M_res_vertical_forces = P_v_soil * x_backfill_wall + P_v_sur * x_backfill_wall
        
        # Passive Resistance & Resisting Moment from Passive Pressure (if enabled)
        h_passive = toe_embedment + key_depth
        if h_passive > 0:
            P_passive_calc = 0.5 * Kp_front * gamma_front * (h_passive ** 2) + 2.0 * cohesion_front * math.sqrt(Kp_front) * h_passive
        else:
            P_passive_calc = 0.0
            
        P_passive = P_passive_calc if use_passive else 0.0
        arm_passive = h_passive / 3.0
        M_res_passive = P_passive * arm_passive if use_passive else 0.0

        total_M_res = M_res_weights + M_res_vertical_forces + M_res_passive
        
        # Total Vertical Force
        total_V = total_W + total_Pv

        # 6. Safety Factor against Overturning
        fs_overturning = total_M_res / M_overturning if M_overturning > 0 else 999.0
        status_overturning = "APROVADO" if fs_overturning >= fs_ot_target else "REPROVADO"

        # 7. Safety Factor against Sliding
        c_base = cohesion_found
        R_friction = (total_V * base_friction_coef) + (c_base * B)
        
        total_R_sliding = R_friction + P_passive
        fs_sliding = total_R_sliding / total_Ph if total_Ph > 0 else 999.0
        status_sliding = "APROVADO" if fs_sliding >= fs_sl_target else "REPROVADO"

        # 8. Eccentricity & Base Stress Distribution
        M_net = total_M_res - M_overturning
        x_R = M_net / total_V if total_V > 0 else 0.0
        eccentricity = (B / 2.0) - x_R
        abs_eccentricity = abs(eccentricity)
        eccentricity_limit = B / 6.0
        
        if x_R <= 0.0 or total_V <= 0.0:
            status_eccentricity = "CRÍTICO (Resultante Fora da Base - Tombamento Iminente)"
            b_effective = 0.0
            q_toe = 999.0
            q_heel = 0.0
            max_q = 999.0
            fs_bearing = 0.0
            status_bearing = "REPROVADO"
        elif abs_eccentricity <= eccentricity_limit:
            status_eccentricity = "APROVADO (No Terço Médio)"
            q_toe = (total_V / B) * (1.0 + (6.0 * eccentricity / B))
            q_heel = (total_V / B) * (1.0 - (6.0 * eccentricity / B))
            b_effective = B
            max_q = max(q_toe, q_heel)
            fs_bearing = q_adm / max_q if max_q > 0 else 999.0
            status_bearing = "APROVADO" if max_q <= q_adm else "REPROVADO"
        else:
            status_eccentricity = "ATENÇÃO (Fora do Terço Médio - Tração Parcial)"
            b_effective = min(B, 3.0 * x_R)
            q_toe = (2.0 * total_V) / (3.0 * x_R) if x_R > 0 else 0.0
            q_heel = 0.0
            max_q = q_toe
            fs_bearing = q_adm / max_q if max_q > 0 else 999.0
            status_bearing = "APROVADO" if max_q <= q_adm else "REPROVADO"

        # 9. Concrete Quantities & Structural Design Forces
        concrete_area_base = B * base_thick
        concrete_area_stem = 0.5 * (stem_top_w + stem_bot_w) * stem_height
        concrete_area_key = key_width * key_depth if (has_key and key_depth > 0) else 0.0
        concrete_area_total = concrete_area_base + concrete_area_stem + concrete_area_key
        
        concrete_volume_per_m = concrete_area_total  # m³/m
        concrete_weight_per_m = concrete_volume_per_m * gamma_wall  # kN/m

        # Stem Base Forces
        P_stem_soil = 0.5 * Ka * gamma_soil * (stem_height ** 2)
        P_stem_sur = Ka * q_surcharge * stem_height
        h_w_stem = max(0.0, min(water_height - base_thick, stem_height))
        P_stem_water = 0.5 * gamma_water * (h_w_stem ** 2) * effective_water_pressure_factor
        
        V_stem_base = P_stem_soil * math.cos(angle_force_rad) + P_stem_sur * math.cos(angle_force_rad) + P_stem_water
        M_stem_base = (P_stem_soil * math.cos(angle_force_rad) * (stem_height / 3.0) +
                       P_stem_sur * math.cos(angle_force_rad) * (stem_height / 2.0) +
                       P_stem_water * (h_w_stem / 3.0))

        # Toe Structural Bending Moment (Bottom-Up Net Pressure)
        if toe_length > 0 and B > 0:
            q_stem_front = q_toe - (q_toe - q_heel) * (toe_length / B)
            M_toe_up = (1.0 / 6.0) * (2.0 * q_toe + q_stem_front) * (toe_length ** 2)
            M_toe_down = 0.5 * (base_thick * gamma_wall + toe_embedment * gamma_front) * (toe_length ** 2)
            M_toe = max(0.0, M_toe_up - M_toe_down)
        else:
            M_toe = 0.0

        # Heel Structural Bending Moment (Top-Down Net Load)
        if heel_length > 0 and B > 0:
            q_stem_back = q_toe - (q_toe - q_heel) * ((toe_length + stem_bot_w) / B)
            M_heel_down = 0.5 * (base_thick * gamma_wall + stem_height * gamma_soil) * (heel_length ** 2)
            M_heel_up = (1.0 / 6.0) * (q_stem_back + 2.0 * q_heel) * (heel_length ** 2)
            M_heel = max(0.0, M_heel_down - M_heel_up)
        else:
            M_heel = 0.0

        # 10. Top Displacement & Soil-Structure Interaction (Deslocamento do Topo - Ref v3)
        base_soil_type = inputs.get('base_soil_type', 'Silte').strip().capitalize()
        base_spt = float(inputs.get('base_spt', 15.0))
        
        # ks coefficient per soil type (kN/m³)
        if base_soil_type == 'Areia':
            ks_coef = 2500.0
        elif base_soil_type == 'Silte':
            ks_coef = 2000.0
        else:
            ks_coef = 1500.0
        ks = ks_coef * max(1.0, base_spt)

        # Footing Inertia & Rotational Stiffness
        I_sapata = (B ** 3) / 12.0 * 0.5
        K_theta = I_sapata * ks
        theta_rad = (M_overturning / K_theta) if K_theta > 0 else 0.0
        d_rot_cm = theta_rad * H_total * 100.0

        # Translation Stiffness
        k_h = 0.5 * ks
        K_h = k_h * B
        d_trans_cm = (total_Ph / K_h * 100.0) if K_h > 0 else 0.0

        # Stem Concrete Elastic Modulus & Stem Inertia
        alpha_e = min(1.0, 0.8 + 0.2 * (fck_MPa / 80.0))
        E_cs_kPa = alpha_e * 5600.0 * math.sqrt(fck_MPa) * 1000.0
        b_stem_avg = (stem_top_w + stem_bot_w) / 2.0
        I_haste = 0.5 * (1.0 * (b_stem_avg ** 3) / 12.0)

        # Flexural Displacement of Stem
        if E_cs_kPa > 0 and I_haste > 0:
            d_flex_soil = (Ka * gamma_soil * stem_height) * (stem_height ** 4) / (30.0 * E_cs_kPa * I_haste)
            d_flex_sur = (Ka * q_surcharge) * (stem_height ** 4) / (8.0 * E_cs_kPa * I_haste)
            d_flex_cm = (d_flex_soil + d_flex_sur) * 100.0
        else:
            d_flex_cm = 0.0

        # Total Top Displacement & Limit H/300
        d_total_cm = d_rot_cm + d_trans_cm + d_flex_cm
        d_limit_cm = (H_total * 100.0) / 300.0
        status_disp = "APROVADO" if d_total_cm <= d_limit_cm else "ALERTA"

        # 11. Format Output Response
        return {
            "success": True,
            "displacement": {
                "base_soil_type": base_soil_type,
                "base_spt": base_spt,
                "ks_kN_m3": round(ks, 1),
                "I_sapata_m4": round(I_sapata, 4),
                "K_theta_kNm_rad": round(K_theta, 1),
                "theta_rad": round(theta_rad, 6),
                "d_rot_cm": round(d_rot_cm, 3),
                "kh_kN_m3": round(k_h, 1),
                "Kh_kN_m": round(K_h, 1),
                "d_trans_cm": round(d_trans_cm, 3),
                "E_cs_kPa": round(E_cs_kPa, 1),
                "I_haste_m4": round(I_haste, 5),
                "d_flex_cm": round(d_flex_cm, 3),
                "d_total_cm": round(d_total_cm, 3),
                "d_limit_cm": round(d_limit_cm, 2),
                "status": status_disp
            },
            "geometry": {
                "base_width_B": round(B, 3),
                "total_height_H": round(H_total, 3),
                "stem_height": round(stem_height, 3),
                "toe_length": round(toe_length, 3),
                "heel_length": round(heel_length, 3),
                "base_thickness": round(base_thick, 3),
                "toe_embedment": round(toe_embedment, 3),
                "h_slope": round(h_slope, 3),
                "has_key": has_key,
                "key_depth": round(key_depth, 3),
                "key_width": round(key_width, 3),
                "key_pos": round(key_pos, 3)
            },
            "quantities": {
                "concrete_volume_m3_per_m": round(concrete_volume_per_m, 3),
                "concrete_weight_kN_per_m": round(concrete_weight_per_m, 2),
                "concrete_area_m2": round(concrete_area_total, 3)
            },
            "earth_pressures": {
                "theory": theory.upper(),
                "Ka": round(Ka, 4),
                "wall_friction_deg": round(wall_friction_deg, 1) if theory == 'coulomb' else 0.0,
                "angle_force_deg": round(angle_force_deg, 1),
                "Kp_front": round(Kp_front, 4),
                "P_h_soil": round(P_h_soil, 2),
                "P_h_surcharge": round(P_h_sur, 2),
                "P_h_water": round(P_h_water, 2),
                "total_P_h": round(total_Ph, 2),
                "total_P_v": round(total_Pv, 2),
                "P_passive_calc": round(P_passive_calc, 2),
                "P_passive_used": round(P_passive, 2),
                "use_passive": use_passive,
                "tension_crack_zc": round(z_c, 2)
            },
            "weights": [
                {"name": w[0], "weight": round(w[1], 2), "arm_x": round(w[2], 2)}
                for w in weights
            ],
            "stability": {
                "total_weight": round(total_W, 2),
                "total_vertical_force": round(total_V, 2),
                "M_overturning": round(M_overturning, 2),
                "M_resisting": round(total_M_res, 2),
                "fs_overturning": round(fs_overturning, 3),
                "fs_overturning_target": fs_ot_target,
                "status_overturning": status_overturning,
                
                "base_friction_resistance": round(R_friction, 2),
                "passive_resistance": round(P_passive, 2),
                "total_sliding_resistance": round(total_R_sliding, 2),
                "fs_sliding": round(fs_sliding, 3),
                "fs_sliding_target": fs_sl_target,
                "status_sliding": status_sliding,
                
                "x_resultant": round(x_R, 3),
                "eccentricity": round(eccentricity, 3),
                "eccentricity_limit": round(eccentricity_limit, 3),
                "status_eccentricity": status_eccentricity,
                
                "q_toe": round(q_toe, 2),
                "q_heel": round(q_heel, 2),
                "q_max": round(max_q, 2),
                "q_adm": round(q_adm, 2),
                "fs_bearing": round(fs_bearing, 3),
                "fs_bearing_target": fs_br_target,
                "status_bearing": status_bearing
            },
            "structural": {
                "V_stem_base_kN": round(V_stem_base, 2),
                "M_stem_base_kNm": round(M_stem_base, 2),
                "M_toe_kNm": round(M_toe, 2),
                "M_heel_kNm": round(M_heel, 2)
            },
            "reinforcement": _calc_reinforcement(
                M_stem_base, M_toe, M_heel, V_stem_base,
                stem_bot_w, base_thick, toe_length, heel_length,
                fck_MPa, fyk_MPa, cover_stem_mm, cover_base_mm,
                bar_diam_mm, gamma_f,
                stem_height=stem_height, stem_top_w=stem_top_w
            )
        }

    except Exception as exc:
        import traceback
        return {"error": str(exc), "trace": traceback.format_exc()}


def _calc_reinforcement(M_stem, M_toe, M_heel, V_stem,
                        stem_bot_w, base_thick, toe_length, heel_length,
                        fck_MPa, fyk_MPa, cover_stem_mm, cover_base_mm,
                        bar_diam_mm, gamma_f,
                        stem_height=4.0, stem_top_w=0.30):
    """
    Complete NBR 6118 reinforcement design and quantitative steel takeoff for retaining wall:
      - Stem base (haste): M_stem + V_stem (cantilever bending/shear)
      - Stem horizontal distribution & front skin rebar
      - Toe slab (puntera): M_toe (bottom tension)
      - Heel slab (calcanhar): M_heel (top tension)
      - Footing longitudinal distribution rebar
      - Commercial bar detailing (diameters & spacing)
      - Steel weight takeoff (kg/m of wall) and ratio (kg/m³ of concrete)
    """
    import math

    # Material design resistances per NBR 6118
    gamma_c = 1.4
    gamma_s = 1.15

    fcd_MPa = fck_MPa / gamma_c
    fyd_MPa = min(fyk_MPa, 600.0) / gamma_s   # MPa cap per NBR 6118
    fcd_kPa = fcd_MPa * 1000.0
    fyd_kPa = fyd_MPa * 1000.0

    alpha_c = 0.85 if fck_MPa <= 50 else 0.85 - 0.008 * (fck_MPa - 50)
    lambda_v = 0.80 if fck_MPa <= 50 else 0.80 - 0.005 * (fck_MPa - 50)

    # kmd_lim for CA-50/60 domain 3 boundary (NBR 6118 §17.5.2)
    xi_lim = 0.45 if fck_MPa <= 50 else 0.35
    kmd_lim = alpha_c * fcd_MPa * lambda_v * xi_lim * (1.0 - 0.5 * lambda_v * xi_lim)

    def _calc_commercial_detailing(As_cm2, pref_bar_mm=16.0):
        standard_bars = [8.0, 10.0, 12.5, 16.0, 20.0, 25.0]
        options = []
        best_option = None
        min_penalty = 1e9

        for bar_mm in standard_bars:
            area_bar = (math.pi * (bar_mm / 10.0)**2) / 4.0  # cm²
            spacing_exact = (100.0 * area_bar) / max(0.01, As_cm2)  # cm
            
            if spacing_exact < 6.0:
                continue
            spacing_round = min(25.0, math.floor(spacing_exact * 2.0) / 2.0)
            if spacing_round < 5.0:
                continue
            as_provided = (100.0 * area_bar) / spacing_round

            opt = {
                "bar_diam_mm": bar_mm,
                "spacing_cm": spacing_round,
                "text": f"Ø {bar_mm:g} c/ {spacing_round:g} cm",
                "as_provided": round(as_provided, 2),
                "area_bar": round(area_bar, 3)
            }
            options.append(opt)

            penalty = abs(spacing_round - 15.0)
            if pref_bar_mm and abs(bar_mm - pref_bar_mm) < 1e-3:
                penalty -= 5.0
            if 10.0 <= spacing_round <= 20.0:
                penalty -= 3.0

            if penalty < min_penalty:
                min_penalty = penalty
                best_option = opt

        if not best_option and options:
            best_option = options[0]

        return best_option, options

    def _section_design(Msk_kNm, h_m, cover_mm, section_name, pref_bar_mm=16.0):
        """Returns As_req (cm²/m), As_min (cm²/m), kmd, d (m), Md, detailing, ok (bool)."""
        if Msk_kNm < 0:
            Msk_kNm = 0.0

        Md_kNm = Msk_kNm * gamma_f        # kN·m/m (design moment)
        cover_m = cover_mm / 1000.0
        bar_r_m = bar_diam_mm / 2000.0
        d = h_m - cover_m - bar_r_m       # effective depth (m)

        if d <= 0.05:
            return {"error": f"Seção {section_name}: altura insuficiente para cobrimento especificado."}

        kmd = Md_kNm / (1.0 * d**2 * fcd_kPa) if Md_kNm > 0 else 0.0
        doubly_reinforced = kmd > kmd_lim
        kmd_use = min(kmd, kmd_lim)

        if kmd_use > 0:
            kmd_approx = min(kmd_use, kmd_lim)
            xi_calc = (1.0 - math.sqrt(max(0.0, 1.0 - 2.0 * kmd_approx))) / (lambda_v)
            z = d * (1.0 - 0.5 * lambda_v * xi_calc)
            z = max(0.5 * d, min(z, 0.95 * d))
        else:
            z = 0.9 * d

        # Required steel area
        As_req_m2 = Md_kNm / (z * fyd_kPa) if Md_kNm > 0 else 0.0
        As_req_cm2 = As_req_m2 * 10000.0

        # Compression steel if doubly-reinforced
        As2_cm2 = 0.0
        if doubly_reinforced and kmd > kmd_lim:
            delta_M = (kmd - kmd_lim) * d**2 * fcd_kPa
            d2 = cover_m + bar_r_m
            As2_cm2 = delta_M / ((d - d2) * fyd_kPa) * 10000.0

        # Minimum reinforcement per NBR 6118 Table 17.3
        if fck_MPa <= 25:
            rho_min = 0.0015
        elif fck_MPa <= 30:
            rho_min = 0.0017
        elif fck_MPa <= 35:
            rho_min = 0.0019
        elif fck_MPa <= 40:
            rho_min = 0.0022
        elif fck_MPa <= 45:
            rho_min = 0.0024
        elif fck_MPa <= 50:
            rho_min = 0.0026
        else:
            rho_min = 0.0028

        As_min_cm2 = rho_min * 1.0 * d * 10000.0   # b = 1 m
        As_final_cm2 = max(As_req_cm2, As_min_cm2) + As2_cm2

        status = "APROVADO" if not doubly_reinforced else "ATENÇÃO (Armadura Dupla Necessária)"
        best_detailing, detailing_options = _calc_commercial_detailing(As_final_cm2, pref_bar_mm)

        return {
            "h": round(h_m, 3),
            "d": round(d, 3),
            "cover": round(cover_mm, 0),
            "Msk": round(Msk_kNm, 2),
            "Md": round(Md_kNm, 2),
            "kmd": round(kmd, 4),
            "kmd_lim": round(kmd_lim, 4),
            "z": round(z, 3),
            "As_req": round(As_req_cm2, 2),
            "As_min": round(As_min_cm2, 2),
            "As_final": round(As_final_cm2, 2),
            "As_comp": round(As2_cm2, 2),
            "doubly_reinforced": doubly_reinforced,
            "status": status,
            "detailing": best_detailing,
            "detailing_options": detailing_options
        }

    # Primary flexural design of the 3 critical sections
    des_haste = _section_design(M_stem, stem_bot_w, cover_stem_mm, "Haste", bar_diam_mm)
    des_puntera = _section_design(M_toe, base_thick, cover_base_mm, "Puntera", bar_diam_mm)
    des_calcanhar = _section_design(M_heel, base_thick, cover_base_mm, "Calcanhar", bar_diam_mm)

    # Shear check at stem base (simplified NBR 6118 §17.4.1.2.1)
    cover_stem_m = cover_stem_mm / 1000.0
    bar_r_m = bar_diam_mm / 2000.0
    d_stem = stem_bot_w - cover_stem_m - bar_r_m
    tau_v = (V_stem * gamma_f) / (1.0 * max(d_stem, 0.01)) / 1000.0   # MPa
    tau_lim = 0.27 * math.sqrt(fck_MPa)   # MPa (max diagonal tension)
    shear_ok = tau_v <= tau_lim

    # Distribution and Secondary Reinforcements (NBR 6118 §19.3.3.2)
    # 1. Haste Horizontal (Face Tracionada): As,dist >= 20% As,final e >= 0.9 cm²/m
    as_haste_final = des_haste.get("As_final", 5.0)
    as_h_dist = max(0.20 * as_haste_final, 0.90)
    best_h_dist, opts_h_dist = _calc_commercial_detailing(as_h_dist, pref_bar_mm=8.0)
    haste_horizontal = {
        "As_final": round(as_h_dist, 2),
        "detailing": best_h_dist,
        "detailing_options": opts_h_dist,
        "desc": "Armadura horizontal de distribuição da haste (face posterior/terra)"
    }

    # 2. Haste Frontal (Face Exposta / Pele): >= 20% As e >= 0.5 As,min
    as_haste_min = des_haste.get("As_min", 4.0)
    as_front = max(0.20 * as_haste_final, 0.50 * as_haste_min, 1.50)
    best_front, opts_front = _calc_commercial_detailing(as_front, pref_bar_mm=10.0)
    haste_frontal = {
        "As_final": round(as_front, 2),
        "detailing": best_front,
        "detailing_options": opts_front,
        "desc": "Armadura vertical da face frontal exposta (retração e montagem)"
    }

    # 3. Sapata Distribuição Longitudinal (Footing longitudinal distribution):
    as_base_max = max(des_puntera.get("As_final", 3.0), des_calcanhar.get("As_final", 3.0))
    as_base_dist = max(0.20 * as_base_max, 0.90)
    best_base_dist, opts_base_dist = _calc_commercial_detailing(as_base_dist, pref_bar_mm=10.0)
    sapata_distrib = {
        "As_final": round(as_base_dist, 2),
        "detailing": best_base_dist,
        "detailing_options": opts_base_dist,
        "desc": "Armadura longitudinal de distribuição na sapata"
    }

    # Steel Takeoff Estimation (per linear meter of wall)
    # Steel density = 7850 kg/m³ = 0.000785 kg/(cm²·cm) = 0.0785 kg/(cm²·m) * 10 = 0.785 kg/(cm²·m)
    rho_steel = 0.785  # kg / (cm² · m)

    # Lengths of reinforcement bars (including anchors & hooks)
    L_haste_vert = stem_height + base_thick + 0.45
    W_haste_vert = as_haste_final * rho_steel * L_haste_vert

    L_haste_front = stem_height + base_thick + 0.30
    W_haste_front = as_front * rho_steel * L_haste_front

    W_haste_horiz = as_h_dist * rho_steel * stem_height * 2.0  # both faces

    L_toe = toe_length + stem_bot_w + 0.35
    W_toe = des_puntera.get("As_final", 3.0) * rho_steel * L_toe

    L_heel = heel_length + stem_bot_w + 0.35
    W_heel = des_calcanhar.get("As_final", 3.0) * rho_steel * L_heel

    B_total = toe_length + stem_bot_w + heel_length
    W_base_dist = as_base_dist * rho_steel * B_total * 2.0  # top and bottom layers

    subtotal_steel = W_haste_vert + W_haste_front + W_haste_horiz + W_toe + W_heel + W_base_dist
    total_steel_kg = round(subtotal_steel * 1.10, 1)  # 10% allowance for lap splices, hooks, and cut-off

    # Concrete volume per linear meter
    v_stem = (stem_top_w + stem_bot_w) * 0.5 * stem_height
    v_base = B_total * base_thick
    v_total_m3 = round(v_stem + v_base, 2)
    steel_ratio = round(total_steel_kg / max(0.1, v_total_m3), 1)

    return {
        "fck": fck_MPa,
        "fyk": fyk_MPa,
        "fcd": round(fcd_MPa, 2),
        "fyd": round(fyd_MPa, 2),
        "gamma_f": gamma_f,
        "kmd_lim": round(kmd_lim, 4),
        "haste": des_haste,
        "haste_horizontal": haste_horizontal,
        "haste_frontal": haste_frontal,
        "puntera": des_puntera,
        "calcanhar": des_calcanhar,
        "sapata_distrib": sapata_distrib,
        "shear": {
            "Vd_kN": round(V_stem * gamma_f, 2),
            "d_stem": round(d_stem, 3),
            "tau_v_MPa": round(tau_v, 4),
            "tau_lim_MPa": round(tau_lim, 4),
            "status": "APROVADO" if shear_ok else "REPROVADO"
        },
        "quantities": {
            "total_steel_kg_per_m": total_steel_kg,
            "steel_ratio_kg_m3": steel_ratio,
            "concrete_volume_m3_per_m": v_total_m3,
            "haste_steel_kg": round((W_haste_vert + W_haste_front + W_haste_horiz) * 1.10, 1),
            "base_steel_kg": round((W_toe + W_heel + W_base_dist) * 1.10, 1),
            "loss_allowance_pct": 10
        }
    }
