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
    
    
    # --- 3. Resistência à Flexão (M_Rd) ---
    # Simplified: Mrd = Zx * fy / gamma_a1
    # Ignores LTB (Lateral Torsional Buckling / FLT) as per JS comments
    Mrd_Nmm = (i['Zx'] * i['fy']) / gamma_a1
    res['Mrd'] = Mrd_Nmm      # N.mm
    
    
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
