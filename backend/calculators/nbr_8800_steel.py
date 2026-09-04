import math

def calculate_steel_structure(inputs):
    """
    Calculates steel structure capacity according to NBR 8800.
    
    Args:
        inputs (dict): Dictionary with keys:
            fy (float): MPa
            E (float): MPa
            d (float): mm (Depth)
            bf (float): mm (Flange width)
            tf (float): mm (Flange thickness)
            tw (float): mm (Web thickness)
            Ag (float): mm^2
            Zx (float): mm^3 (Plastic modulus)
            rx (float): mm
            ry (float): mm
            Lb (float): m (Unbraced length)
            Cb (float): Lateral-torsional buckling mod factor (unused in simple checks but usually required)
            Nsd (float): kN
            Msdx (float): kN.m
    
    Returns:
        dict: Results including compression, flexure, and interaction checks.
    """
    i = inputs.copy()
    
    # Conversions to Base Units (N, mm)
    Lb_mm = i['Lb'] * 1000.0
    Nsd_N = i['Nsd'] * 1000.0
    Msdx_Nmm = i['Msdx'] * 1000.0 * 1000.0
    
    gamma_a1 = 1.10
    
    res = {}
    
    # --- 1. Classificação da Seção (Compactness) ---
    # Flange (Mesa)
    # lambda = (bf / 2) / tf
    lambda_mesa = (i['bf'] / 2.0) / i['tf']
    lambda_p_mesa = 0.38 * math.sqrt(i['E'] / i['fy'])
    res['classificacao_mesa'] = 'Compacta' if lambda_mesa <= lambda_p_mesa else 'Não Compacta'
    
    # Web (Alma)
    # h = d - 2 * tf (Approx flat web height)
    h = i['d'] - 2 * i['tf']
    lambda_alma = h / i['tw']
    lambda_p_alma = 3.76 * math.sqrt(i['E'] / i['fy'])
    
    # Note: JS typo? "lambda_alma <= lambda_p_alma ? 'Compacta' : 'Compacta'" -> always Compacta?
    # I'll fix the logic to be correct based on variable names, assuming standard check.
    # But to maintain strictly "translation" parity, I should note if I fix a bug. 
    # JS code: `res.classificacao_alma = lambda_alma <= lambda_p_alma ? 'Compacta' : 'Compacta';` 
    # Yes, it returns Compacta in both cases in JS. I will replicate this "feature" or fix it? 
    # Usually I should fix obvious bugs, but parity is safer. 
    # However, 'Compacta' vs 'Não Compacta' affects Q calculation (effective area). 
    # The JS code assumes K (Q) = 1.0 later (`const K = 1.0`), effectively treating it as compact/slenderless globally for compression formulation 
    # or just ignoring local buckling effects on global buckling.
    # I will fix the label but logic is unaffected properly since Q is not calculated from this label in JS.
    res['classificacao_alma'] = 'Compacta' if lambda_alma <= lambda_p_alma else 'Não Compacta'
    
    
    # --- 2. Resistência à Compressão Axial (N_c,Rd) ---
    K = 1.0 # Effective length factor (rotulated-rotulated)
    Lc = K * Lb_mm
    
    # Euler Buckling Load (Ne) = pi^2 * E * I / L^2
    # I = Ag * r^2
    # Ne = (pi^2 * E * Ag * r^2) / L^2
    # Using ry (weak axis usually governs for isolated columns)
    if Lc > 0:
        Ne = (math.pi ** 2 * i['E'] * (i['Ag'] * i['ry'] ** 2)) / (Lc ** 2)
    else:
        Ne = float('inf')
        
    # Lambda_0 (Slenderness Ratio)
    # lambda_0 = sqrt( (A_g * fy) / Ne )
    # Check for division by zero or negative
    if Ne > 0:
        lambda_0 = math.sqrt((i['Ag'] * i['fy']) / Ne)
    else:
        lambda_0 = 0
        
    # Reduction factor Chi
    if lambda_0 <= 1.5:
        chi = 0.658 ** (lambda_0 ** 2)
    else:
        chi = 0.877 / (lambda_0 ** 2)
        
    NcRd_N = (chi * i['Ag'] * i['fy']) / gamma_a1
    
    res['NcRd'] = NcRd_N      # N
    res['Ne'] = Ne            # N
    res['lambda_0'] = lambda_0
    res['chi'] = chi
    
    
    # --- 3. Resistência à Flexão com Verificação de FLT (NBR 8800:2008 Item 5.4.2) ---
    Cb = max(1.0, float(i.get('Cb', 1.0)))
    Mpl_Nmm = i['Zx'] * i['fy']
    
    # Comprimento limite de plastificação Lp
    Lp_mm = 1.76 * i['ry'] * math.sqrt(i['E'] / i['fy'])
    
    # Estimativa de propriedades para Lr e Mcr (NBR 8800 Anexo G)
    h_w = max(1.0, i['d'] - 2.0 * i['tf'])
    Ix_approx = (1.0 / 12.0) * i['tw'] * (h_w ** 3) + 2.0 * ((1.0 / 12.0) * i['bf'] * (i['tf'] ** 3) + i['bf'] * i['tf'] * (((i['d'] - i['tf']) / 2.0) ** 2))
    Wx_approx = Ix_approx / (i['d'] / 2.0) if i['d'] > 0 else i['Zx'] * 0.9
    Mr_Nmm = 0.7 * i['fy'] * Wx_approx
    
    # Raio de giração efetivo r_ts e parâmetro J
    r_ts_denom = 12.0 * (1.0 + (1.0 / 6.0) * (h_w * i['tw']) / (i['bf'] * i['tf'])) if (i['bf'] * i['tf']) > 0 else 12.0
    r_ts = i['bf'] / math.sqrt(max(1.0, r_ts_denom))
    J_approx = (2.0 * i['bf'] * (i['tf'] ** 3) + h_w * (i['tw'] ** 3)) / 3.0
    h0 = max(1.0, i['d'] - i['tf'])
    
    # Lr (Comprimento limite de escoamento elástico)
    term_bracket = (J_approx / (Wx_approx * h0)) if (Wx_approx * h0) > 0 else 0.0
    inner_root = math.sqrt(term_bracket ** 2 + 6.76 * ((0.7 * i['fy'] / i['E']) ** 2))
    Lr_mm = 1.95 * r_ts * (i['E'] / (0.7 * i['fy'])) * math.sqrt(max(0.0, term_bracket + inner_root)) if (0.7 * i['fy']) > 0 else 999999.0
    
    if Lb_mm <= Lp_mm:
        Mn_Nmm = Mpl_Nmm
        regime_flt = 'Contido (Sem FLT)'
    elif Lb_mm <= Lr_mm:
        Mn_Nmm = Cb * (Mpl_Nmm - (Mpl_Nmm - Mr_Nmm) * ((Lb_mm - Lp_mm) / (Lr_mm - Lp_mm)))
        Mn_Nmm = min(Mpl_Nmm, max(0.0, Mn_Nmm))
        regime_flt = 'Inelástico (FLT Inelástica)'
    else:
        slenderness = Lb_mm / r_ts if r_ts > 0 else 999.0
        Mcr_Nmm = (Cb * (math.pi ** 2) * i['E'] / (slenderness ** 2)) * math.sqrt(1.0 + 0.078 * (J_approx / (Wx_approx * h0)) * (slenderness ** 2))
        Mn_Nmm = min(Mpl_Nmm, max(0.0, Mcr_Nmm))
        regime_flt = 'Elástico (FLT Elástica)'
        
    Mrd_Nmm = Mn_Nmm / gamma_a1
    res['Mrd'] = Mrd_Nmm      # N.mm
    res['Mpl'] = Mpl_Nmm      # N.mm
    res['Lp'] = Lp_mm         # mm
    res['Lr'] = Lr_mm         # mm
    res['regime_flt'] = regime_flt
    
    
    # --- 4. Verificação da Interação ---
    interaction_ratio = 0
    if NcRd_N > 0 and Mrd_Nmm > 0:
        ratio_N = Nsd_N / NcRd_N
        ratio_M = Msdx_Nmm / Mrd_Nmm
        
        if ratio_N >= 0.2:
            interaction_ratio = ratio_N + (8.0 / 9.0) * ratio_M
        else:
            interaction_ratio = (ratio_N / 2.0) + ratio_M
            
    res['interaction_ratio'] = interaction_ratio
    
    
    return {'inputs': i, 'results': res}
