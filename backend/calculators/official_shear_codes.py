import math
from scipy.optimize import fsolve

def calc_aci318_14(bw, d, fck, sigma_cp=0.0):
    # ACI 318-14: Vc = 0.17 * (1 + sigma_cp/14) * sqrt(fck) * bw * d
    # bw, d in mm; fck in MPa; sigma_cp in MPa (positive for compression)
    sig = max(0.0, float(sigma_cp or 0.0))
    axial_factor = (1.0 + sig / 14.0) if sig > 0 else 1.0
    vc_N = 0.17 * axial_factor * math.sqrt(fck) * bw * d
    return vc_N / 1000.0

def calc_aci318_19(bw, d, rho, fck, sigma_cp=0.0):
    # ACI 318-19: Vc = (0.66 * rho^(1/3) * sqrt(fck) * lambda_s + Nu/(6*Ag)) * bw * d
    lambda_s = math.sqrt(2.0 / (1.0 + 0.004 * d))
    if lambda_s > 1.0: lambda_s = 1.0
    sig = max(0.0, float(sigma_cp or 0.0))
    nu_6ag = min(sig / 6.0, 0.05 * fck) if sig > 0 else 0.0
    vc_stress = 0.66 * math.pow(rho, 1/3) * math.sqrt(fck) * lambda_s + nu_6ag
    vc_stress = min(vc_stress, 0.42 * math.sqrt(fck))
    vc_N = vc_stress * bw * d
    return vc_N / 1000.0

def calc_aci318_25(bw, d, rho, fck, sigma_cp=0.0):
    # ACI 318-25: Vc = 0.66 * rho^(1/3) * sqrt(fck) * bw * d * lambda_s + Nu/(6*Ag)
    # Refined lambda_s = sqrt(2 / (1 + 0.003*d)) <= 1.0; sqrt(fck) capped at 10.3 MPa (150 psi)
    # Lower bound: Vc >= 0.083 * sqrt(fck) * bw * d + Nu/(6*Ag)
    lambda_s = math.sqrt(2.0 / (1.0 + 0.003 * d))
    if lambda_s > 1.0: lambda_s = 1.0
    sqrt_fck = math.sqrt(fck)
    if sqrt_fck > 10.3: sqrt_fck = 10.3
    sig = max(0.0, float(sigma_cp or 0.0))
    nu_6ag = min(sig / 6.0, 0.05 * fck) if sig > 0 else 0.0
    vc_stress = 0.66 * math.pow(rho, 1/3) * sqrt_fck * lambda_s + nu_6ag
    v_min_stress = 0.083 * sqrt_fck + nu_6ag
    if vc_stress < v_min_stress: vc_stress = v_min_stress
    vc_stress = min(vc_stress, 0.42 * sqrt_fck)
    vc_N = vc_stress * bw * d
    return vc_N / 1000.0

def calc_ec2_2004(bw, d, rho, fck, sigma_cp=0.0):
    # EC2 (2004): VRd,c = (C_Rdc * k * (100*rho_l*fck)^(1/3) + 0.15*sigma_cp) * bw * d
    k = 1.0 + math.sqrt(200.0 / d)
    if k > 2.0: k = 2.0
    rho_l = rho
    if rho_l > 0.02: rho_l = 0.02
    
    C_Rdc = 0.18
    v_min = 0.035 * math.pow(k, 1.5) * math.sqrt(fck)
    
    sig = max(0.0, float(sigma_cp or 0.0))
    sigma_cp_lim = min(sig, 0.2 * fck)
    
    v_calc = C_Rdc * k * math.pow(100.0 * rho_l * fck, 1/3) + 0.15 * sigma_cp_lim
    v_min_tot = v_min + 0.15 * sigma_cp_lim
    if v_calc < v_min_tot: v_calc = v_min_tot
    
    vc_N = v_calc * bw * d
    return vc_N / 1000.0

def calc_ec2_2023(bw, d, rho, fck, a_d, d_dg=16.0, sigma_cp=0.0):
    # EC2 (2023 / prEN 1992-1-1:2023): includes prestress contribution
    gamma_V = 1.0
    rho_l = rho
    
    a_cs = a_d * d
    if a_cs < d: a_cs = d
    
    d_eff = d
    if a_cs < 4.0 * d:
        d_eff = math.sqrt((a_cs / 4.0) * d)
        
    sig = max(0.0, float(sigma_cp or 0.0))
    sigma_cp_lim = min(sig, 0.2 * fck)
    
    tau_Rdc = (0.66 / gamma_V) * math.pow(100.0 * rho_l * fck * (d_dg / d_eff), 1.0/3.0) + 0.15 * sigma_cp_lim
    vc_N = tau_Rdc * bw * d
    return vc_N / 1000.0

def calc_nbr6118(bw, d, rho, fck, sigma_cp=0.0):
    # NBR 6118 (item 19.4.1 / 17.4.2.2 com protensão sigma_cp)
    d_m = d / 1000.0
    k = 1.6 - d_m
    if k < 1.0: k = 1.0
    
    # Concretos de Alta Resistência (fck > 50 MPa)
    if fck <= 50.0:
        fctm = 0.3 * math.pow(fck, 2/3)
    else:
        fctm = 2.12 * math.log(1.0 + 0.11 * fck)
        
    fctk_inf = 0.7 * fctm
    tau_Rd = 0.25 * fctk_inf # gamma_c = 1.0
    
    sig = max(0.0, float(sigma_cp or 0.0))
    tau_R_tot = tau_Rd * k * (1.2 + 40.0 * rho) + 0.15 * sig
    vc_N = tau_R_tot * bw * d
    return vc_N / 1000.0

def calc_mc2010_level_1(bw, d, fck, sigma_cp=0.0):
    # Fib MC 2010 Level I with axial stress
    z = 0.9 * d
    kv = 180.0 / (1000.0 + 1.25 * z)
    sig = max(0.0, float(sigma_cp or 0.0))
    vc_stress = kv * math.sqrt(fck) + 0.15 * sig
    vc_N = vc_stress * z * bw
    return vc_N / 1000.0

def calc_mc2010_level_2(bw, d, rho, fck, a_d, d_dg=16.0, sigma_cp=0.0):
    # Fib MC 2010 Level II with prestressing / axial force
    # Needs iterative solution since Vc depends on eps_x which depends on Vc and Np.
    z = 0.9 * d
    
    k_dg = 32.0 / (16.0 + d_dg)
    if k_dg < 0.75: k_dg = 0.75
    if fck > 70.0: k_dg = 2.0 # d_dg = 0 -> 32/16 = 2.0
    
    Es = 200000.0 # MPa
    sig = max(0.0, float(sigma_cp or 0.0))
    Np_N = sig * bw * d # Prestress axial compression force (N)
    
    def eq(Vc_kN):
        Vc_N = Vc_kN * 1000.0
        a = a_d * d
        M_Ed = Vc_N * a
        
        As = rho * bw * d
        if As == 0:
            return Vc_kN # Fallback
            
        # Axial compression Np reduces longitudinal tension eps_x
        net_thrust = max(0.0, M_Ed / z + Vc_N - Np_N)
        eps_x = net_thrust / (2.0 * Es * As)
        if eps_x < 0: eps_x = 0
        
        kv = (0.4 / (1.0 + 1500.0 * eps_x)) * (1300.0 / (1000.0 + k_dg * z))
        
        calc_N = kv * math.sqrt(fck) * z * bw
        return calc_N / 1000.0 - Vc_kN

    # Solve Vc
    try:
        sol = fsolve(eq, 100.0, xtol=1e-4)[0]
        if sol < 0: sol = 0
        return sol
    except:
        return 0.0
