import math

def calculate_tsunami_loads(inputs):
    """
    Calculates Tsunami and Debris Loads per ASCE 7-22 Chapter 6 (and ASCE 7-16).
    Supports both Imperial (ft, lb, psf, kips) and Metric (m, kg, kPa, kN).
    """
    # Extract inputs with defaults
    standard = inputs.get('tsunami_asce_standard', 'ASCE 7-22')
    unit_system = inputs.get('tsunami_unit_system', 'imperial')
    is_metric = (unit_system == 'metric')
    risk = inputs.get('tsunami_risk_category', 'II')
    design_method = inputs.get('tsunami_design_method', 'LRFD')
    
    # Hydraulic & Flow
    h = float(inputs.get('tsunami_inundation_depth', 10.0 if not is_metric else 3.0))
    u = float(inputs.get('tsunami_flow_velocity', 15.0 if not is_metric else 4.5))
    rho_val = float(inputs.get('tsunami_fluid_density', 75.0 if not is_metric else 1200.0))
    h_int = float(inputs.get('tsunami_internal_depth', 0.0))
    V_sub = float(inputs.get('tsunami_submerged_volume', 300.0 if not is_metric else 8.5))
    
    # Structure Typology & Geometry
    structure_type = inputs.get('tsunami_structure_type', 'cais_wharf')
    deck_w_val = float(inputs.get('tsunami_deck_width', 32.0 if is_metric else 105.0))
    deck_h_val = float(inputs.get('tsunami_deck_height', 2.55 if is_metric else 8.37))
    ar_struct = deck_w_val / max(0.01, deck_h_val)
    auto_cd = 2.00 if ar_struct <= 1.0 else (1.20 if ar_struct >= 5.0 else (2.00 - 0.20 * (ar_struct - 1.0)))
    
    if structure_type == 'cais_wharf':
        B = float(inputs.get('tsunami_component_width', deck_w_val))
        Cd = float(inputs.get('tsunami_drag_coefficient', auto_cd))
    else:
        B = float(inputs.get('tsunami_component_width', 15.0 if not is_metric else 4.5))
        Cd = float(inputs.get('tsunami_drag_coefficient', 2.0))

    include_damming = bool(inputs.get('tsunami_include_damming', False))
    delta_B = float(inputs.get('tsunami_damming_width', 10.0 if not is_metric else 3.0)) if include_damming else 0.0
    B_eff = B + delta_B
    
    # Surge & Debris toggles
    include_surge = bool(inputs.get('tsunami_include_surge', True))
    include_debris = bool(inputs.get('tsunami_include_debris', True))
    
    # Debris properties
    debris_type = inputs.get('tsunami_debris_type', 'log')
    W_debris = float(inputs.get('tsunami_debris_mass', 1000.0 if not is_metric else 454.0))
    k_debris_input = float(inputs.get('tsunami_debris_stiffness', 1320000.0 if not is_metric else 19200.0))
    Co = float(inputs.get('tsunami_orientation_factor', 0.65))
    target_stiffness = inputs.get('tsunami_target_stiffness', 'rigid')
    
    # Importance Factor Its per ASCE 7-22 Table 6.8-1
    its_map = {"I": 0.80, "II": 1.00, "III": 1.25, "IV": 1.25}
    Its = its_map.get(risk, 1.00)
    
    warnings = []
    if h <= 0:
        h = 0.001
        warnings.append("Inundation depth must be greater than zero.")
    if B <= 0:
        B = 0.001
        warnings.append("Component width must be greater than zero.")
        
    if is_metric:
        g = 9.80665 # m/s^2
        # Froude Number
        Fr = u / math.sqrt(g * h)
        
        # Hydrodynamic Drag per ASCE 7-22 Section 6.10.2 Eq. 6.10-1
        # Fd = 0.5 * rho * Its * Cd * B_eff * h * u^2 (N)
        rho_m = rho_val # kg/m^3
        Fd_N = 0.5 * rho_m * Its * Cd * B_eff * h * (u ** 2)
        Fd = Fd_N / 1000.0 # kN
        qd = (0.5 * rho_m * Its * Cd * (u ** 2)) / 1000.0 # kPa
        zd = h / 2.0 # m
        Md = Fd * zd # kN-m
        
        # Bore Surge (Impulsive)
        Fs = 1.5 * Fd if include_surge else 0.0
        zs = h / 2.0
        Ms = Fs * zs
        
        # Hydrostatic Force
        # gamma_s = rho * g (N/m^3)
        gamma_s = rho_m * g
        Fh_N = 0.5 * gamma_s * B * max(0.0, (h ** 2) - (h_int ** 2))
        Fh = Fh_N / 1000.0 # kN
        ph_base = (gamma_s * max(0.0, h - h_int)) / 1000.0 # kPa
        zh = h / 3.0 # m
        Mh = Fh * zh # kN-m
        
        # Buoyant Uplift
        Fb = (gamma_s * V_sub) / 1000.0 # kN
        
        # Debris Impact (Sec. 6.11)
        if include_debris:
            # k_debris_input is in kN/m, convert to N/m
            kd_N_m = k_debris_input * 1000.0
            k_eff = kd_N_m if target_stiffness == 'rigid' else (kd_N_m / 2.0)
            m_debris = W_debris # kg
            # Fi = Its * Co * u * sqrt(k * m) (N)
            Fi_N = Its * Co * u * math.sqrt(max(0.0, k_eff * m_debris))
            Fi = Fi_N / 1000.0 # kN
            td = (math.pi / 2.0) * math.sqrt(max(0.0, m_debris / max(1.0, k_eff))) # s
            impulse_J = (2.0 / math.pi) * Fi_N * td # N-s
            zi = h # at water surface
            Mi = Fi * zi # kN-m
        else:
            Fi = 0.0
            td = 0.0
            impulse_J = 0.0
            zi = 0.0
            Mi = 0.0
            
    else: # Imperial
        g = 32.174 # ft/s^2
        # Froude Number
        Fr = u / math.sqrt(g * h)
        
        # Hydrodynamic Drag per ASCE 7-22 Section 6.10.2 Eq. 6.10-1
        # rho_val is weight density gamma_s in lb/ft^3
        gamma_s = rho_val
        rho_mass = gamma_s / g # slugs/ft^3
        Fd_lb = 0.5 * rho_mass * Its * Cd * B_eff * h * (u ** 2)
        Fd = Fd_lb / 1000.0 # kips
        qd = 0.5 * rho_mass * Its * Cd * (u ** 2) # psf
        zd = h / 2.0 # ft
        Md = Fd * zd # kip-ft
        
        # Bore Surge (Impulsive)
        Fs = 1.5 * Fd if include_surge else 0.0
        zs = h / 2.0
        Ms = Fs * zs
        
        # Hydrostatic Force
        Fh_lb = 0.5 * gamma_s * B * max(0.0, (h ** 2) - (h_int ** 2))
        Fh = Fh_lb / 1000.0 # kips
        ph_base = gamma_s * max(0.0, h - h_int) # psf
        zh = h / 3.0 # ft
        Mh = Fh * zh # kip-ft
        
        # Buoyant Uplift
        Fb = (gamma_s * V_sub) / 1000.0 # kips
        
        # Debris Impact (Sec. 6.11)
        if include_debris:
            kd_lb_ft = k_debris_input # lb/ft
            k_eff = kd_lb_ft if target_stiffness == 'rigid' else (kd_lb_ft / 2.0)
            m_debris = W_debris / g # slugs
            Fi_lb = Its * Co * u * math.sqrt(max(0.0, k_eff * m_debris))
            Fi = Fi_lb / 1000.0 # kips
            td = (math.pi / 2.0) * math.sqrt(max(0.0, m_debris / max(1.0, k_eff))) # s
            impulse_J = (2.0 / math.pi) * Fi_lb * td # lb-s
            zi = h # ft
            Mi = Fi * zi # kip-ft
        else:
            Fi = 0.0
            td = 0.0
            impulse_J = 0.0
            zi = 0.0
            Mi = 0.0

    # Load Combinations per ASCE 7-22 Section 6.12
    # Case 1: Max Steady Flow (Fd + Fh)
    case_flow_lat = Fd + Fh
    case_flow_moment = Md + Mh
    
    # Case 2: Impulsive Surge (Fs + Fh)
    case_surge_lat = Fs + Fh if include_surge else case_flow_lat
    case_surge_moment = Ms + Mh if include_surge else case_flow_moment
    
    # Case 3: Debris Impact + Flow (Fd + Fh + Fi)
    case_impact_lat = Fd + Fh + Fi if include_debris else case_flow_lat
    case_impact_moment = Md + Mh + Mi if include_debris else case_flow_moment
    
    # Governing Lateral Force (Nominal)
    if case_impact_lat >= case_surge_lat and case_impact_lat >= case_flow_lat:
        governing_case = "Impacto de Detritos + Arrasto + Hidrostática (Debris Impact + Drag)"
        Ts_nom = case_impact_lat
        M_governing = case_impact_moment
    elif case_surge_lat >= case_flow_lat:
        governing_case = "Surto Hidrodinâmico Frontal (Bore Surge Impulsive)"
        Ts_nom = case_surge_lat
        M_governing = case_surge_moment
    else:
        governing_case = "Fluxo Estacionário Máximo (Steady Hydrodynamic Flow)"
        Ts_nom = case_flow_lat
        M_governing = case_flow_moment
        
    # Design Factor
    design_factor = 1.0 if design_method == 'LRFD' else 0.70
    Ts_design = Ts_nom * design_factor
    M_design = M_governing * design_factor
    
    # Equivalent Uniform Lateral Pressure across projected wet area
    wet_area = B_eff * h
    if is_metric:
        # Ts_nom is kN, wet_area is m^2 -> kPa
        q_equiv_nom = Ts_nom / wet_area if wet_area > 0 else 0.0
        q_equiv_design = Ts_design / wet_area if wet_area > 0 else 0.0
    else:
        # Ts_nom is kips, wet_area is ft^2 -> kips/ft^2 * 1000 = psf
        q_equiv_nom = (Ts_nom * 1000.0) / wet_area if wet_area > 0 else 0.0
        q_equiv_design = (Ts_design * 1000.0) / wet_area if wet_area > 0 else 0.0

    flow_regime = "Supercrítico (Fr > 1.0)" if Fr > 1.05 else ("Subcrítico (Fr < 1.0)" if Fr < 0.95 else "Crítico (Fr ≈ 1.0)")

    # =========================================================================
    # ESTRUTURAS PORTUÁRIAS & CAIS ESTAQUEADO (DECK & PILES)
    # =========================================================================
    # 1. Parâmetros da Mesa do Tabuleiro (Deck)
    # 1. Mesa do Tabuleiro (Deck) - ASCE 7-22 Section 6.10 & Equação 6.10-11
    deck_height = float(inputs.get('tsunami_deck_height', 2.55 if is_metric else 8.37))
    deck_width = float(inputs.get('tsunami_deck_width', 32.0 if is_metric else 105.0))
    deck_length = float(inputs.get('tsunami_deck_length', 1.0 if is_metric else 3.28))
    
    # Relação de aspecto B/h e cálculo automático de Cd (ASCE 7-22 Tab. 6.10-1)
    ar_deck = deck_width / max(0.01, deck_height)
    auto_deck_cd = 2.00 if ar_deck <= 1.0 else (1.20 if ar_deck >= 5.0 else (2.00 - 0.20 * (ar_deck - 1.0)))
    deck_cd = float(inputs.get('tsunami_deck_cd', auto_deck_cd))
    
    # Fator de forma Csx a partir da tipologia transversal
    deck_type = inputs.get('tsunami_deck_type', 'solid_slab')
    csx_map = {'solid_slab': 1.00, 'i_girder': 1.25, 'box_girder': 1.00, 'grated': 0.85}
    deck_csx = float(inputs.get('tsunami_deck_csx', csx_map.get(deck_type, 1.00)))
    
    # Coeficiente de subpressão Cv a partir da condição de intradorso (Eq. 6.10-11)
    deck_venting = inputs.get('tsunami_deck_venting', 'submerged_steady')
    cv_map = {'submerged_steady': 1.00, 'air_entrapment': 1.50, 'slamming_wave': 2.00}
    deck_cv = float(inputs.get('tsunami_deck_cv', cv_map.get(deck_venting, 1.00)))

    # 2. Erosão / Scour per ASCE 7 Table 6.12-2
    include_scour = bool(inputs.get('tsunami_include_scour', True))
    scour_depth = float(inputs.get('tsunami_scour_depth', 4.0 if is_metric else 13.12)) if include_scour else 0.0

    # 3. Detrito / Impacto no Tabuleiro unificado com Sec. 6.11
    debris_target = inputs.get('tsunami_debris_target', 'deck')
    container_mass = W_debris
    container_stiffness = k_debris_input
    container_co = Co

    # Cálculo da Mesa do Tabuleiro
    if is_metric:
        # Subpressão na Mesa do Tabuleiro conforme ASCE 7-22 Equação 6.10-11 estrita:
        # P_p = 0.5 * rho_s * I_ts * u^2 (Pa)
        Pp_Pa = 0.5 * rho_m * Its * (u ** 2)
        subpressure_kPa = Pp_Pa / 1000.0
        subpressure_tf_m2 = subpressure_kPa / g
        subpressure_force_kN = subpressure_kPa * deck_width * deck_length
        subpressure_force_tf = subpressure_force_kN / g

        # Força de Arraste na Mesa do Tabuleiro:
        # Fdx_lin = 0.5 * rho_s * I_ts * Cd * Csx * h_deck * u^2 (N/m)
        Fdx_linear_N_m = 0.5 * rho_m * Its * deck_cd * deck_csx * deck_height * (u ** 2)
        Fdx_linear_kN_m = Fdx_linear_N_m / 1000.0
        Fdx_linear_tf_m = Fdx_linear_kN_m / g
        Fdx_total_kN = Fdx_linear_kN_m * deck_length
        Fdx_total_tf = Fdx_total_kN / g

        # Impacto de Contêiner na Mesa (ASCE 7-22 Sec. 6.11 / Tabela 6.11-2: Co = 0.65 obrigatório para contêiner)
        if include_debris and (debris_target == 'deck' or not debris_target):
            co_cont = 0.65
            container_co = co_cont
            kd_cont_N_m = k_debris_input * 1000.0
            keff_cont = kd_cont_N_m if target_stiffness == 'rigid' else (kd_cont_N_m / 2.0)
            m_cont = W_debris
            Fni_cont_N = u * math.sqrt(max(0.0, keff_cont * m_cont))
            Fni_cont_kN = Fni_cont_N / 1000.0
            Fi_cont_N = Its * co_cont * Fni_cont_N
            Fi_cont_kN = Fi_cont_N / 1000.0
            Fi_cont_tf = Fi_cont_kN / g
        else:
            Fi_cont_kN = 0.0
            Fi_cont_tf = 0.0
            Fni_cont_kN = 0.0

    else:
        # Imperial - Eq. 6.10-11 estrita sem Cv
        Pp_psf = 0.5 * rho_mass * Its * (u ** 2)
        subpressure_kPa = Pp_psf * 0.0478803
        subpressure_tf_m2 = subpressure_kPa / 9.80665
        subpressure_force_kips = (Pp_psf * deck_width * deck_length) / 1000.0
        subpressure_force_kN = subpressure_force_kips * 4.44822
        subpressure_force_tf = subpressure_force_kN / 9.80665

        Fdx_linear_lb_ft = 0.5 * rho_mass * Its * deck_cd * deck_csx * deck_height * (u ** 2)
        Fdx_linear_kips_ft = Fdx_linear_lb_ft / 1000.0
        Fdx_linear_kN_m = Fdx_linear_kips_ft * 14.5939
        Fdx_linear_tf_m = Fdx_linear_kN_m / 9.80665
        Fdx_total_kips = Fdx_linear_kips_ft * deck_length
        Fdx_total_kN = Fdx_total_kips * 4.44822
        Fdx_total_tf = Fdx_total_kN / 9.80665

        # Impacto de Contêiner na Mesa (Co = 0.65 per Tab. 6.11-2)
        if include_debris and (debris_target == 'deck' or not debris_target):
            co_cont = 0.65
            container_co = co_cont
            kd_cont_lb_ft = k_debris_input
            keff_cont_imp = kd_cont_lb_ft if target_stiffness == 'rigid' else (kd_cont_lb_ft / 2.0)
            m_cont_slugs = W_debris / g
            Fni_cont_lb = u * math.sqrt(max(0.0, keff_cont_imp * m_cont_slugs))
            Fni_cont_kN = (Fni_cont_lb * 4.44822) / 1000.0
            Fi_cont_lb = Its * co_cont * Fni_cont_lb
            Fi_cont_kN = (Fi_cont_lb * 4.44822) / 1000.0
            Fi_cont_tf = Fi_cont_kN / 9.80665
        else:
            Fi_cont_kN = 0.0
            Fi_cont_tf = 0.0
            Fni_cont_kN = 0.0

    # 4. Cálculo de Estacas Individuais (Multi-Pile Drag)
    piles_raw = inputs.get('tsunami_piles')
    if not piles_raw or not isinstance(piles_raw, list) or len(piles_raw) == 0:
        piles_raw = [
            {'id': 'Estaca 1 (Ø 1.2m, L=21m)', 'diameter': 1.2, 'length': 21.0, 'cd': 1.2},
            {'id': 'Estaca 2 (Ø 1.5m, L=21m)', 'diameter': 1.5, 'length': 21.0, 'cd': 1.2},
            {'id': 'Estaca 3 (Ø 1.2m, L=18m)', 'diameter': 1.2, 'length': 18.0, 'cd': 1.2},
            {'id': 'Estaca 4 (Ø 1.2m, L=15m)', 'diameter': 1.2, 'length': 15.0, 'cd': 1.2},
            {'id': 'Estaca 5 (Ø 1.2m, L=13m)', 'diameter': 1.2, 'length': 13.0, 'cd': 1.2},
            {'id': 'Estaca 6 (Ø 1.2m, L=6m)', 'diameter': 1.2, 'length': 6.0, 'cd': 1.2},
        ] if is_metric else [
            {'id': 'Pile 1 (Ø 3.9ft, L=69ft)', 'diameter': 3.94, 'length': 68.9, 'cd': 1.2},
            {'id': 'Pile 2 (Ø 4.9ft, L=69ft)', 'diameter': 4.92, 'length': 68.9, 'cd': 1.2},
            {'id': 'Pile 3 (Ø 3.9ft, L=59ft)', 'diameter': 3.94, 'length': 59.0, 'cd': 1.2},
            {'id': 'Pile 4 (Ø 3.9ft, L=49ft)', 'diameter': 3.94, 'length': 49.2, 'cd': 1.2},
            {'id': 'Pile 5 (Ø 3.9ft, L=43ft)', 'diameter': 3.94, 'length': 42.7, 'cd': 1.2},
            {'id': 'Pile 6 (Ø 3.9ft, L=20ft)', 'diameter': 3.94, 'length': 19.7, 'cd': 1.2},
        ]

    calculated_piles = []
    total_pile_drag_kN = 0.0
    total_pile_drag_tf = 0.0

    for idx, p_item in enumerate(piles_raw):
        pid = p_item.get('id', f'Estaca {idx + 1}')
        diam = float(p_item.get('diameter', 1.2 if is_metric else 3.94))
        p_len = float(p_item.get('length', 21.0 if is_metric else 68.9))
        p_cd = float(p_item.get('cd', 1.2))
        p_eff_len = p_len + scour_depth

        if is_metric:
            # F_w = 0.5 * rho_s * I_ts * Cd * b * he * u^2 (N)
            Fw_pile_N = 0.5 * rho_m * Its * p_cd * diam * p_eff_len * (u ** 2)
            Fw_pile_kN = Fw_pile_N / 1000.0
            Fw_pile_tf = Fw_pile_kN / g
            M_base_kNm = Fw_pile_kN * (p_eff_len / 2.0)
            M_base_tfm = Fw_pile_tf * (p_eff_len / 2.0)
        else:
            Fw_pile_lb = 0.5 * rho_mass * Its * p_cd * diam * p_eff_len * (u ** 2)
            Fw_pile_kips = Fw_pile_lb / 1000.0
            Fw_pile_kN = Fw_pile_kips * 4.44822
            Fw_pile_tf = Fw_pile_kN / 9.80665
            M_base_kipft = Fw_pile_kips * (p_eff_len / 2.0)
            M_base_kNm = M_base_kipft * 1.35582
            M_base_tfm = M_base_kNm / 9.80665

        total_pile_drag_kN += Fw_pile_kN
        total_pile_drag_tf += Fw_pile_tf

        calculated_piles.append({
            'id': pid,
            'diameter': round(diam, 2),
            'length': round(p_len, 2),
            'scour_depth': round(scour_depth, 2),
            'effective_length': round(p_eff_len, 2),
            'cd': round(p_cd, 2),
            'Fw_kN': round(Fw_pile_kN, 1),
            'Fw_tf': round(Fw_pile_tf, 1),
            'M_base_kNm': round(M_base_kNm, 1),
            'M_base_tfm': round(M_base_tfm, 1)
        })

    deck_results = {
        'deck_height': deck_height,
        'deck_width': deck_width,
        'deck_length': deck_length,
        'deck_cd': deck_cd,
        'deck_csx': deck_csx,
        'deck_cv': deck_cv,
        'subpressure_kPa': round(subpressure_kPa, 2),
        'subpressure_tf_m2': round(subpressure_tf_m2, 2),
        'subpressure_force_kN': round(subpressure_force_kN, 1),
        'subpressure_force_tf': round(subpressure_force_tf, 1),
        'Fdx_linear_kN_m': round(Fdx_linear_kN_m, 1),
        'Fdx_linear_tf_m': round(Fdx_linear_tf_m, 1),
        'Fdx_total_kN': round(Fdx_total_kN, 1),
        'Fdx_total_tf': round(Fdx_total_tf, 1),
        'container_mass': container_mass,
        'container_stiffness': container_stiffness,
        'container_co': container_co,
        'container_impact_Fni_kN': round(Fni_cont_kN, 1),
        'container_impact_Fi_kN': round(Fi_cont_kN, 1),
        'container_impact_Fi_tf': round(Fi_cont_tf, 1),
        'scour_depth': round(scour_depth, 2),
        'include_scour': include_scour
    }
    
    return {
        'inputs': inputs,
        'standard': standard,
        'unit_system': unit_system,
        'risk_category': risk,
        'Its': Its,
        'hydraulic': {
            'Fr': Fr,
            'flow_regime': flow_regime,
            'h_max': h,
            'u_max': u,
            'B_eff': B_eff,
            'wet_area': wet_area
        },
        'forces': {
            'drag': {'force': Fd, 'pressure': qd, 'arm': zd, 'moment': Md},
            'surge': {'force': Fs, 'applicable': include_surge, 'arm': zs, 'moment': Ms},
            'hydrostatic': {'force': Fh, 'pressure_base': ph_base, 'arm': zh, 'moment': Mh},
            'buoyancy': {'force': Fb},
            'debris': {
                'force': Fi,
                'applicable': include_debris,
                'duration_s': td,
                'impulse': impulse_J,
                'arm': zi,
                'moment': Mi,
                'type': debris_type
            }
        },
        'cases': {
            'steady_flow': {'lateral': case_flow_lat, 'moment': case_flow_moment},
            'bore_surge': {'lateral': case_surge_lat, 'moment': case_surge_moment},
            'debris_impact': {'lateral': case_impact_lat, 'moment': case_impact_moment}
        },
        'results': {
            'governing_case': governing_case,
            'Ts_nominal': Ts_nom,
            'Ts_design': Ts_design,
            'M_nominal': M_governing,
            'M_design': M_design,
            'Fb_uplift': Fb,
            'q_equiv_nominal': q_equiv_nom,
            'q_equiv_design': q_equiv_design,
            'design_method': design_method,
            'design_factor': design_factor
        },
        'deck_and_piles': {
            'deck': deck_results,
            'piles': calculated_piles,
            'total_pile_drag_kN': round(total_pile_drag_kN, 1),
            'total_pile_drag_tf': round(total_pile_drag_tf, 1)
        },
        'units': {
            'force': 'kN' if is_metric else 'kips',
            'moment': 'kN·m' if is_metric else 'kip-ft',
            'pressure': 'kPa' if is_metric else 'psf',
            'length': 'm' if is_metric else 'ft',
            'velocity': 'm/s' if is_metric else 'ft/s',
            'density': 'kg/m³' if is_metric else 'lb/ft³'
        },
        'warnings': warnings,
        'success': True
    }
