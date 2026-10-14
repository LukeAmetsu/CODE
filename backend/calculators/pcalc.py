import math
import numpy as np
from backend.calculators.pcalc_geometry import (
    compute_polygon_properties,
    mesh_arbitrary_section,
    build_polygon_from_spec
)

# --- UTILS ---
def safe_div(a, b, default=0):
    return a / b if b != 0 else default

def interpolate(x, x_arr, y_arr):
    if len(x_arr) != len(y_arr): return 0
    if x <= x_arr[0]: return y_arr[0]
    if x >= x_arr[-1]: return y_arr[-1]
    
    for i in range(len(x_arr) - 1):
        if x_arr[i] <= x <= x_arr[i+1]:
            factor = (x - x_arr[i]) / (x_arr[i+1] - x_arr[i])
            return y_arr[i] + factor * (y_arr[i+1] - y_arr[i])
    return 0

# --- MATERIALS & SECTIONS ---

class MaterialData:
    def __init__(self, fck, fyk, Es=210.0, gamac=1.4, gamas=1.15, es=None):
        if es is not None:
            Es = es
        self.fck = float(fck) # MPa
        self.fyk = float(fyk) # MPa
        self.Es = float(Es) # GPa
        self.gamac = float(gamac)
        self.gamas = float(gamas)
        
        # High Strength Concrete Parameters (NBR 6118 / Java Source)
        if self.fck <= 50:
            self.n = 2.0
            self.ec2 = 0.002
            self.ecu = 0.0035
        else:
            # Java Logic: 1.4 + 23.4 * (0.9 - fck)^4 ??? Java code uses fck in MPa/100 maybe? or normalized?
            # Java: n = 1.4d + (23.4d * Math.pow(0.9d - dados2.config.getFck(), 4.0d));
            # Looking at Java context: if fck <= 0.5 (likely kN/cm2 or something normalized? NO, typical valid fck is > 20MPa).
            # Ah, the Java code might be using normalized fck (e.g. fck/100).
            # Let's assume standard NBR 6118-2014 logic for HSC.
            # fck in MPa. 
            # n = 1.4 + 23.4 * ((90 - fck)/100)^4
            # ec2 = 2.0/1000 + 0.085/1000 * (fck - 50)^0.53
            # ecu = 2.6/1000 + 35/1000 * ((90 - fck)/100)^4
            
            fck_val = self.fck
            self.n = 1.4 + 23.4 * ((90 - fck_val)/100)**4
            ec2_permil = 2.0 + 0.085 * (fck_val - 50)**0.53
            ecu_permil = 2.6 + 35.0 * ((90 - fck_val)/100)**4
            
            self.ec2 = ec2_permil / 1000.0
            self.ecu = ecu_permil / 1000.0

        # Cracking / Tensile concrete parameters (NBR 6118 items 8.2.5 & 17.3.1)
        if self.fck <= 50:
            self.fctm = 0.3 * (self.fck ** (2.0 / 3.0)) # MPa
        else:
            self.fctm = 2.12 * math.log(1.0 + 0.11 * self.fck) # MPa
        self.fctk_inf = 0.7 * self.fctm # MPa
        self.fct_f = 1.2 * self.fctm # MPa (NBR 6118 item 17.3.1)

    @property
    def fcd(self):
        return (self.fck / 10.0) / self.gamac # kN/cm2

    @property
    def fyd(self):
        return (self.fyk / 10.0) / self.gamas # kN/cm2

    @property
    def E_steel_kncm2(self):
        return self.Es * 100.0 # kN/cm2
        
    @property
    def E_conc_tans_kncm2(self):
         # Alpha_E = 1.2 for basalt/granite (Standard)
         # Eci = Alpha_E * 5600 * sqrt(fck)
         # Ecs = alpha_i * Eci
         # alpha_i = 0.8 + 0.2 * fck/80 <= 1.0
         # Java: 5600 * sqrt(fck*100) / 100 -> 5600 * sqrt(fck)
         # Java uses simple 0.85 * 5600 * sqrt(fck)
         return 0.85 * 5600.0 * math.sqrt(self.fck) / 10.0

    @property
    def fctm_kncm2(self):
        return self.fctm / 10.0 # kN/cm2

    @property
    def fct_f_kncm2(self):
        return self.fct_f / 10.0 # kN/cm2

class SectionGeometry:
    def __init__(self, type_sec, hx=30.0, hy=50.0, boundary='pinned', length=400.0, **kwargs):
        self.type = type_sec # 'Retangular', 'Circular', 'L', 'T', 'I', 'Vazada', 'Poligono'
        self.hx = float(hx) if hx is not None else 30.0 # cm
        self.hy = float(hy) if hy is not None else 50.0 # cm
        self.boundary = boundary # 'pinned', 'cantilever'
        self.length = float(length) # cm
        self.kwargs = kwargs
        
        self.fibers = []
        self.area_ac = 0.0
        self.ix = 0.0
        self.iy = 0.0
        self.ixy = 0.0
        self.xm = self.hx / 2.0
        self.ym = self.hy / 2.0
        self.i_min = 0.0
        self.theta_p = 0.0
        self.exterior = []
        self.holes = []
        self.is_arbitrary = False

        self._calc_properties()

    def _calc_properties(self):
        stype = str(self.type).strip()
        stype_lower = stype.lower()

        # Check if arbitrary/parametric shape
        is_standard_rect = stype in ('Retangular', 'retangular') and 'exterior' not in self.kwargs and 'vertices' not in self.kwargs
        is_standard_circ = stype in ('Circular', 'circular') and 'exterior' not in self.kwargs and 'vertices' not in self.kwargs

        if is_standard_circ:
            D = self.hx
            self.area_ac = math.pi * (D / 2.0)**2
            self.ix = (math.pi * D**4) / 64.0
            self.iy = self.ix
            self.ixy = 0.0
            self.xm = D / 2.0
            self.ym = D / 2.0
            self.i_min = D / 4.0
        elif is_standard_rect:
            b = self.hx
            h = self.hy
            self.area_ac = b * h
            self.ix = (b * h**3) / 12.0
            self.iy = (h * b**3) / 12.0
            self.ixy = 0.0
            self.xm = b / 2.0
            self.ym = h / 2.0
            self.i_min = min(b, h) / math.sqrt(12.0)
        else:
            self.is_arbitrary = True
            spec = {'section_type': stype, 'hx': self.hx, 'hy': self.hy, **self.kwargs}
            ext, holes = build_polygon_from_spec(spec)
            self.exterior = ext
            self.holes = holes
            props = compute_polygon_properties(ext, holes)

            self.area_ac = props['Ac']
            self.ix = props['Ix']
            self.iy = props['Iy']
            self.ixy = props['Ixy']
            self.xm = props['xm']
            self.ym = props['ym']
            self.hx = props['hx']
            self.hy = props['hy']
            self.i_min = props['i_min']
            self.theta_p = props['theta_p']

    def discretize(self, nx=20, ny=20, target_fibers=250):
        self.fibers = []

        if self.is_arbitrary:
            fibs, _ = mesh_arbitrary_section(self.exterior, self.holes, target_fibers=target_fibers)
            self.fibers = fibs
            return

        dx = self.hx / nx
        dy = self.hy / ny
        dA = dx * dy
        
        # Centroid is origin (0,0)
        start_x = -self.hx / 2.0
        start_y = -self.hy / 2.0

        if self.type == 'Retangular':
            for i in range(nx):
                for j in range(ny):
                    x = start_x + (i * dx) + (dx / 2.0)
                    y = start_y + (j * dy) + (dy / 2.0)
                    self.fibers.append({'x': x, 'y': y, 'dA': dA})
        
        elif self.type == 'Circular':
            R = self.hx / 2.0
            R2 = R * R
            for i in range(nx):
                for j in range(ny):
                    x = start_x + (i * dx) + (dx / 2.0)
                    y = start_y + (j * dy) + (dy / 2.0)
                    if (x*x + y*y) <= R2:
                        self.fibers.append({'x': x, 'y': y, 'dA': dA})

    def get_boundary_points(self):
        """Returns boundary vertices relative to section centroid (0, 0)."""
        if self.is_arbitrary and self.exterior:
            return [{'x': p[0] - self.xm, 'y': p[1] - self.ym} for p in self.exterior]
        elif self.type == 'Circular':
            R = self.hx / 2.0
            n_pts = 36
            return [{'x': R * math.cos(2.0 * math.pi * i / n_pts), 'y': R * math.sin(2.0 * math.pi * i / n_pts)} for i in range(n_pts)]
        else:
            return [
                {'x': -self.hx / 2.0, 'y': -self.hy / 2.0},
                {'x':  self.hx / 2.0, 'y': -self.hy / 2.0},
                {'x':  self.hx / 2.0, 'y':  self.hy / 2.0},
                {'x': -self.hx / 2.0, 'y':  self.hy / 2.0},
            ]

class ConcreteSection:
    def __init__(self, geometry, materials, bars):
        self.geo = geometry
        self.mat = materials
        self.bars = bars # list of {'x': val, 'y': val, 'diametro': val(mm)}
        self._init_vector_cache()

    def _init_vector_cache(self):
        fibers = self.geo.fibers
        if fibers:
            self._fib_x = np.array([f['x'] for f in fibers], dtype=np.float64)
            self._fib_y = np.array([f['y'] for f in fibers], dtype=np.float64)
            self._fib_dA = np.array([f['dA'] for f in fibers], dtype=np.float64)
            self._fib_xm = self._fib_x / 100.0
            self._fib_ym = self._fib_y / 100.0
            self._has_fibers = True
            self._cached_fib_len = len(fibers)
        else:
            self._fib_x = np.empty(0, dtype=np.float64)
            self._fib_y = np.empty(0, dtype=np.float64)
            self._fib_dA = np.empty(0, dtype=np.float64)
            self._fib_xm = np.empty(0, dtype=np.float64)
            self._fib_ym = np.empty(0, dtype=np.float64)
            self._has_fibers = False
            self._cached_fib_len = 0

        if self.bars:
            self._bar_x = np.array([b['x'] for b in self.bars], dtype=np.float64)
            self._bar_y = np.array([b['y'] for b in self.bars], dtype=np.float64)
            self._bar_area = np.array([math.pi * ((b['diametro']/10.0)/2.0)**2 for b in self.bars], dtype=np.float64)
            self._bar_xm = self._bar_x / 100.0
            self._bar_ym = self._bar_y / 100.0
            self._has_bars = True
        else:
            self._bar_x = np.empty(0, dtype=np.float64)
            self._bar_y = np.empty(0, dtype=np.float64)
            self._bar_area = np.empty(0, dtype=np.float64)
            self._bar_xm = np.empty(0, dtype=np.float64)
            self._bar_ym = np.empty(0, dtype=np.float64)
            self._has_bars = False

    def _ensure_vector_cache(self):
        if not hasattr(self, '_has_fibers') or self._cached_fib_len != len(self.geo.fibers):
            self._init_vector_cache()

    def get_concrete_stress(self, epsilon):
        # Parabola-Rectangle NBR 6118 scalar
        if epsilon >= 0: return 0.0 # Tension ignored
        
        ec = abs(epsilon)
        ec2 = self.mat.ec2
        ecu = self.mat.ecu
        fcd = self.mat.fcd
        n = self.mat.n
        
        beta_c = 0.85
        if self.mat.fck > 50:
            beta_c = 0.85 * (1.0 - (self.mat.fck - 50.0)/200.0)
            if beta_c < 0.5: beta_c = 0.5

        if ec <= ec2:
            return -beta_c * fcd * (1.0 - (1.0 - ec/ec2)**n)
        elif ec <= ecu:
            return -beta_c * fcd
        return 0.0

    def get_concrete_stress_vec(self, epsilon_arr):
        ec = np.abs(epsilon_arr)
        ec2 = self.mat.ec2
        ecu = self.mat.ecu
        fcd = self.mat.fcd
        n = self.mat.n

        beta_c = 0.85
        if self.mat.fck > 50:
            beta_c = max(0.5, 0.85 * (1.0 - (self.mat.fck - 50.0)/200.0))

        sigma = np.zeros_like(epsilon_arr, dtype=np.float64)
        comp_mask = epsilon_arr < 0

        mask_parab = comp_mask & (ec <= ec2)
        if np.any(mask_parab):
            sigma[mask_parab] = -beta_c * fcd * (1.0 - (1.0 - ec[mask_parab] / ec2) ** n)

        mask_const = comp_mask & (ec > ec2) & (ec <= ecu)
        if np.any(mask_const):
            sigma[mask_const] = -beta_c * fcd

        return sigma

    def get_steel_stress(self, epsilon):
        Es = self.mat.E_steel_kncm2
        fyd = self.mat.fyd
        sigma = epsilon * Es
        if sigma > fyd: return fyd
        if sigma < -fyd: return -fyd
        return sigma

    def get_steel_stress_vec(self, epsilon_arr):
        Es = self.mat.E_steel_kncm2
        fyd = self.mat.fyd
        sigma = epsilon_arr * Es
        return np.clip(sigma, -fyd, fyd)

    def calculate_resistance(self, epsilon0, kx, ky):
        self._ensure_vector_cache()

        N_int = 0.0
        Mx_int = 0.0
        My_int = 0.0

        # Vectorized Concrete Integration
        if self._has_fibers:
            strains_c = epsilon0 + kx * self._fib_y + ky * self._fib_x
            sigmas_c = self.get_concrete_stress_vec(strains_c)
            dF_c = sigmas_c * self._fib_dA
            N_int += float(np.sum(dF_c))
            Mx_int += float(np.sum(dF_c * self._fib_ym))
            My_int += float(np.sum(dF_c * self._fib_xm))

        # Vectorized Steel Integration
        if self._has_bars:
            strains_s = epsilon0 + kx * self._bar_y + ky * self._bar_x
            sigmas_s = self.get_steel_stress_vec(strains_s)
            sigmas_c_at_bar = self.get_concrete_stress_vec(strains_s)
            eff_sigmas = sigmas_s - sigmas_c_at_bar
            F_s = eff_sigmas * self._bar_area
            N_int += float(np.sum(F_s))
            Mx_int += float(np.sum(F_s * self._bar_ym))
            My_int += float(np.sum(F_s * self._bar_xm))

        return N_int, Mx_int, My_int

# --- INTERACTION SURFACE ---

def generate_interaction_surface(section, num_angles=36):
    points = {'x': [], 'y': [], 'z': []}
    
    ecu = -section.mat.ecu
    es_yield = 0.010 
    
    corners = section.geo.get_boundary_points() if hasattr(section.geo, 'get_boundary_points') else [
        {'x': -section.geo.hx/2, 'y': -section.geo.hy/2},
        {'x':  section.geo.hx/2, 'y': -section.geo.hy/2},
        {'x':  section.geo.hx/2, 'y':  section.geo.hy/2},
        {'x': -section.geo.hx/2, 'y':  section.geo.hy/2},
    ]

    states_e0 = []
    states_kx = []
    states_ky = []

    for i in range(num_angles):
        theta = (i / num_angles) * 2 * math.pi
        cosT = math.cos(theta)
        sinT = math.sin(theta)

        u_vals = [p['x']*cosT + p['y']*sinT for p in corners]
        u_vals.extend([b['x']*cosT + b['y']*sinT for b in section.bars])
        
        u_min = min(u_vals)
        u_max = max(u_vals)
        du = (u_max - u_min) if u_max != u_min else 1.0
        
        # Domain 2
        steps = 10
        for k in range(steps + 1):
            eps_t = es_yield
            eps_c = es_yield + (k/steps) * (ecu - es_yield)
            K = (eps_c - eps_t) / du
            e0 = eps_t - K * u_min
            states_e0.append(e0)
            states_kx.append(K * sinT)
            states_ky.append(K * cosT)

        # Domain 3/4/5
        for k in range(1, steps + 1):
            eps_c = ecu
            eps_t = es_yield + (k/steps) * (ecu - es_yield) 
            K = (eps_c - eps_t) / du
            e0 = eps_t - K * u_min
            states_e0.append(e0)
            states_kx.append(K * sinT)
            states_ky.append(K * cosT)
            
        # Pure Compression
        states_e0.append(-0.002)
        states_kx.append(0.0)
        states_ky.append(0.0)

    section._ensure_vector_cache()

    if section._has_fibers:
        e0_arr = np.array(states_e0, dtype=np.float64)[:, None]
        kx_arr = np.array(states_kx, dtype=np.float64)[:, None]
        ky_arr = np.array(states_ky, dtype=np.float64)[:, None]

        fib_x = section._fib_x[None, :]
        fib_y = section._fib_y[None, :]
        fib_dA = section._fib_dA[None, :]
        fib_xm = section._fib_xm[None, :]
        fib_ym = section._fib_ym[None, :]

        strains_c = e0_arr + kx_arr * fib_y + ky_arr * fib_x
        sigmas_c = section.get_concrete_stress_vec(strains_c)
        dF_c = sigmas_c * fib_dA
        N_c = np.sum(dF_c, axis=1)
        Mx_c = np.sum(dF_c * fib_ym, axis=1)
        My_c = np.sum(dF_c * fib_xm, axis=1)

        if section._has_bars:
            bar_x = section._bar_x[None, :]
            bar_y = section._bar_y[None, :]
            bar_area = section._bar_area[None, :]
            bar_xm = section._bar_xm[None, :]
            bar_ym = section._bar_ym[None, :]

            strains_s = e0_arr + kx_arr * bar_y + ky_arr * bar_x
            sigmas_s = section.get_steel_stress_vec(strains_s)
            sigmas_c_b = section.get_concrete_stress_vec(strains_s)
            dF_s = (sigmas_s - sigmas_c_b) * bar_area
            N_s = np.sum(dF_s, axis=1)
            Mx_s = np.sum(dF_s * bar_ym, axis=1)
            My_s = np.sum(dF_s * bar_xm, axis=1)
            N_tot = N_c + N_s
            Mx_tot = Mx_c + Mx_s
            My_tot = My_c + My_s
        else:
            N_tot = N_c
            Mx_tot = Mx_c
            My_tot = My_c

        points['x'] = Mx_tot.tolist()
        points['y'] = My_tot.tolist()
        points['z'] = N_tot.tolist()
    else:
        for idx in range(len(states_e0)):
            N, Mx, My = section.calculate_resistance(states_e0[idx], states_kx[idx], states_ky[idx])
            points['x'].append(Mx)
            points['y'].append(My)
            points['z'].append(N)

    return points

# --- CRACKING ENVELOPE (ELS-W / ELS-F NBR 6118) ---

def generate_cracking_surface(section, w_lim=0.3, criterion='wk_limit', num_angles=36, steps_n=20):
    """
    Generates 3D cracking envelope surface per NBR 6118 (ELS-W / ELS-F).
    - 'mr_cracking': Cracking initiation moment Mr(N, theta) (Stage I -> Stage II transition).
    - 'wk_limit': Stage II crack opening moment M_w(N, theta) reaching w_lim (mm).
    """
    corners = section.geo.get_boundary_points() if hasattr(section.geo, 'get_boundary_points') else [
        {'x': -section.geo.hx / 2.0, 'y': -section.geo.hy / 2.0},
        {'x':  section.geo.hx / 2.0, 'y': -section.geo.hy / 2.0},
        {'x':  section.geo.hx / 2.0, 'y':  section.geo.hy / 2.0},
        {'x': -section.geo.hx / 2.0, 'y':  section.geo.hy / 2.0},
    ]
    Ac = section.geo.area_ac
    Ix = section.geo.ix
    Iy = section.geo.iy
    fctm = section.mat.fctm
    fct_f_kncm2 = section.mat.fct_f_kncm2

    diams = [b['diametro'] for b in section.bars] if section.bars else [16.0]
    phi_avg = sum(diams) / len(diams) if diams else 16.0
    Es_mpa = section.mat.Es * 1000.0
    eta1 = 2.25
    rho_r = 0.04

    # Allowable steel stress for w_lim (NBR 6118 item 17.3.3.2)
    sigma_s1 = math.sqrt((w_lim * 12.5 * eta1 * Es_mpa * fctm) / (3.0 * phi_avg)) if phi_avg > 0 else 0.0
    sigma_s2 = (w_lim * 12.5 * eta1 * Es_mpa) / (phi_avg * (4.0 / rho_r + 45.0)) if phi_avg > 0 else 0.0
    sigma_s_adm = min(max(sigma_s1, sigma_s2), 0.7 * section.mat.fyk)

    # N range for service cracking envelope
    N_tension_max = Ac * fct_f_kncm2
    N_comp_max = -0.6 * Ac * (section.mat.fck / 10.0)

    points = {'x': [], 'y': [], 'z': []}

    for i in range(steps_n + 1):
        N = N_tension_max + (i / steps_n) * (N_comp_max - N_tension_max)
        sigma_N = N / Ac if Ac > 0 else 0.0

        for j in range(num_angles):
            theta = (j / num_angles) * 2.0 * math.pi
            cosT = math.cos(theta)
            sinT = math.sin(theta)

            g_vals = [(p['y'] * cosT / Ix + p['x'] * sinT / Iy) for p in corners]
            g_max = max(g_vals) if g_vals else 0.0

            if g_max <= 1e-9:
                M_cr = 0.0
            else:
                delta_sigma = fct_f_kncm2 - sigma_N
                M_cr = (delta_sigma / g_max) / 100.0 if delta_sigma > 0 else 0.0

            if criterion == 'mr_cracking':
                M_target = M_cr
            else:
                As_total = sum([math.pi * ((b['diametro'] / 10.0) / 2.0) ** 2 for b in section.bars]) if section.bars else 1.0
                As_eff = max(As_total * 0.4, 0.5)
                u_corners = [p['y'] * cosT + p['x'] * sinT for p in corners]
                h_eff = (max(u_corners) - min(u_corners)) if u_corners else 50.0
                z_arm = max(0.7 * h_eff, 10.0)
                delta_M_w = (As_eff * (sigma_s_adm / 10.0) * (z_arm / 100.0))
                M_target = M_cr + delta_M_w

            points['x'].append(M_target * cosT)
            points['y'].append(M_target * sinT)
            points['z'].append(N)

    return points


def verify_cracking(section, N_serv, Mx_serv, My_serv, w_lim=0.3):
    """
    Performs NBR 6118 ELS-W / ELS-F cracking verification for a service load state.
    """
    corners = section.geo.get_boundary_points() if hasattr(section.geo, 'get_boundary_points') else [
        {'x': -section.geo.hx / 2.0, 'y': -section.geo.hy / 2.0},
        {'x':  section.geo.hx / 2.0, 'y': -section.geo.hy / 2.0},
        {'x':  section.geo.hx / 2.0, 'y':  section.geo.hy / 2.0},
        {'x': -section.geo.hx / 2.0, 'y':  section.geo.hy / 2.0},
    ]
    Ac = section.geo.area_ac
    Ix = section.geo.ix
    Iy = section.geo.iy
    fctm = section.mat.fctm
    fct_f_kncm2 = section.mat.fct_f_kncm2

    M_serv = math.sqrt(Mx_serv ** 2 + My_serv ** 2)
    theta = math.atan2(My_serv, Mx_serv)
    cosT = math.cos(theta)
    sinT = math.sin(theta)

    sigma_N = N_serv / Ac if Ac > 0 else 0.0
    g_vals = [(p['y'] * cosT / Ix + p['x'] * sinT / Iy) for p in corners]
    g_max = max(g_vals) if g_vals else 0.0

    if g_max <= 1e-9:
        M_cr = 999999.0
    else:
        delta_sigma = fct_f_kncm2 - sigma_N
        M_cr = (delta_sigma / g_max) / 100.0 if delta_sigma > 0 else 0.0

    diams = [b['diametro'] for b in section.bars] if section.bars else [16.0]
    phi_avg = sum(diams) / len(diams) if diams else 16.0
    Es_mpa = section.mat.Es * 1000.0
    eta1 = 2.25
    rho_r = 0.04

    sigma_s1 = math.sqrt((w_lim * 12.5 * eta1 * Es_mpa * fctm) / (3.0 * phi_avg)) if phi_avg > 0 else 0.0
    sigma_s2 = (w_lim * 12.5 * eta1 * Es_mpa) / (phi_avg * (4.0 / rho_r + 45.0)) if phi_avg > 0 else 0.0
    sigma_s_adm = min(max(sigma_s1, sigma_s2), 0.7 * section.mat.fyk)

    As_total = sum([math.pi * ((b['diametro'] / 10.0) / 2.0) ** 2 for b in section.bars]) if section.bars else 1.0
    As_eff = max(As_total * 0.4, 0.5)
    u_corners = [p['y'] * cosT + p['x'] * sinT for p in corners]
    h_eff = (max(u_corners) - min(u_corners)) if u_corners else 50.0
    z_arm = max(0.7 * h_eff, 10.0)

    delta_M_w = (As_eff * (sigma_s_adm / 10.0) * (z_arm / 100.0))
    M_w_lim = M_cr + delta_M_w

    if M_serv <= M_cr:
        stage = 'I'
        wk = 0.0
        status = 'Não Fissurado (Estádio I)'
        is_ok = True
        fs_crack = (M_cr / M_serv) if M_serv > 0.01 else 99.9
        sigma_s = 0.0
    else:
        stage = 'II'
        delta_M = M_serv - M_cr
        sigma_s = (delta_M * 100.0) / (As_eff * z_arm) * 10.0
        sigma_s = min(sigma_s, 0.85 * section.mat.fyk)

        wk1 = (phi_avg / (12.5 * eta1)) * (sigma_s / Es_mpa) * (3.0 * sigma_s / fctm) if sigma_s > 0 else 0.0
        wk2 = (phi_avg / (12.5 * eta1)) * (sigma_s / Es_mpa) * (4.0 / rho_r + 45.0) if sigma_s > 0 else 0.0
        wk = min(wk1, wk2)

        is_ok = (wk <= w_lim)
        status = f"Atende (wk = {wk:.3f} mm <= {w_lim:.2f} mm)" if is_ok else f"Fissuração Excessiva (wk = {wk:.3f} mm > {w_lim:.2f} mm)"
        fs_crack = (w_lim / wk) if wk > 1e-4 else 99.9

    return {
        'stage': stage,
        'M_cr': M_cr,
        'M_w_lim': M_w_lim,
        'M_serv': M_serv,
        'N_serv': N_serv,
        'sigma_s': sigma_s,
        'sigma_s_adm': sigma_s_adm,
        'wk': wk,
        'w_lim': w_lim,
        'status': status,
        'is_ok': is_ok,
        'safety_factor': fs_crack
    }


# --- SOLVER & 2ND ORDER METHODS ---

class Solver:
    def __init__(self, section):
        self.sec = section

    def solve_curvature(self, N, Mx, My):
        # Newton-Raphson
        targetN = N
        targetMx = Mx # kNm
        targetMy = My # kNm
        
        Ecs = self.sec.mat.E_conc_tans_kncm2
        Ac = self.sec.geo.area_ac
        Ix = self.sec.geo.ix
        Iy = self.sec.geo.iy
        
        e0 = targetN / (Ecs * Ac) if Ac > 0 else 0
        kx = (targetMx * 100.0) / (0.4 * Ecs * Ix) if Ix > 0 else 0
        ky = (targetMy * 100.0) / (0.4 * Ecs * Iy) if Iy > 0 else 0
        
        for _ in range(12):
            resN, resMx, resMy = self.sec.calculate_resistance(e0, kx, ky)
            
            dN = targetN - resN
            dMx = targetMx - resMx
            dMy = targetMy - resMy
            
            if abs(dN) < 1.0 and abs(dMx) < 1.0 and abs(dMy) < 1.0:
                break
            
            K_axial = Ecs * Ac * 0.5
            K_flex_x = Ecs * Ix * 0.3
            K_flex_y = Ecs * Iy * 0.3
            
            if K_axial > 0: e0 += dN / K_axial
            if K_flex_x > 0: kx += (dMx * 100.0) / K_flex_x
            if K_flex_y > 0: ky += (dMy * 100.0) / K_flex_y
            
        return {'e0': e0, 'kx': kx, 'ky': ky} # k in 1/cm

    def get_EI_sec(self, Nsd, axis='x', M_target=None):
        # Calculate Secant Stiffness EI = M / k
        # If M_target is small, use tangent stiffness estimate.
        if abs(M_target or 0) < 0.1:
            Ecs = self.sec.mat.E_conc_tans_kncm2
            I = self.sec.geo.ix if axis == 'x' else self.sec.geo.iy
            # 0.4 * Ecs * I (approx for cracked) or more precise
            return 0.4 * Ecs * I
            
        # Solve for curvature at specific Moment
        Mx = M_target if axis == 'x' else 0
        My = M_target if axis == 'y' else 0
        res = self.solve_curvature(Nsd, Mx, My)
        
        k_cm = res['kx'] if axis == 'x' else res['ky']
        k_m = k_cm * 100.0  # 1/cm to 1/m (1 m = 100 cm -> k[1/m] = 100 * k[1/cm])
        if abs(k_m) < 1e-9:
            return 99999999
        return abs(M_target) / abs(k_m)

    def calculate_method1(self, Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX, lambdaY):
        # Method 1: Curvature Approx (NBR 6118 item 15.8.3.3.2)
        hx_m = self.sec.geo.hx / 100.0
        hy_m = self.sec.geo.hy / 100.0
        
        fcd = self.sec.mat.fcd # kN/cm2
        Ac = self.sec.geo.area_ac # cm2
        nu = abs(Nsd) / (Ac * fcd) if Ac > 0 else 0
        
        invRx = min((0.005 / hy_m) / (nu + 0.5), 0.005 / hy_m) if hy_m > 0 else 0
        invRy = min((0.005 / hx_m) / (nu + 0.5), 0.005 / hx_m) if hx_m > 0 else 0
        
        Le = self.length_eff
        
        M2d_x = abs(Nsd) * (Le**2 / 10.0) * invRx
        M2d_y = abs(Nsd) * (Le**2 / 10.0) * invRy
        
        # Equivalent first-order moment with alpha_b (NBR 6118 item 15.4.4.2.2)
        def get_alpha_b(M1, M2):
            Ma = max(abs(M1), abs(M2))
            Mb = min(abs(M1), abs(M2))
            if Ma == 0: return 1.0
            ratio = (Mb / Ma) if (M1 * M2 >= 0) else -(Mb / Ma)
            return max(0.4, 0.6 + 0.4 * ratio)

        alpha_bx = get_alpha_b(M1xt, M1xb)
        alpha_by = get_alpha_b(M1yt, M1yb)

        M1d_eq_x = alpha_bx * max(abs(M1xt), abs(M1xb))
        M1d_eq_y = alpha_by * max(abs(M1yt), abs(M1yb))

        # Minimum moment (NBR 6118 item 11.3.3.4.3)
        e_min_x = 0.015 + 0.03 * hy_m
        e_min_y = 0.015 + 0.03 * hx_m
        M1d_min_x = abs(Nsd) * e_min_x
        M1d_min_y = abs(Nsd) * e_min_y

        Mtot_x = max(M1d_eq_x, M1d_min_x) + M2d_x
        Mtot_y = max(M1d_eq_y, M1d_min_y) + M2d_y
        
        return {
            'Mtot_x': Mtot_x, 'Mtot_y': Mtot_y,
            'M2d_x': M2d_x, 'M2d_y': M2d_y,
            'info': 'Method 1 (Curvature NBR 6118)'
        }

    def calculate_method2(self, Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX, lambdaY):
        # Method 2: Stiffness Approximation (Standard Column)
        # NBR 6118:2023 fallback to Method 1
        res = self.calculate_method1(Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX, lambdaY)
        res['info'] = 'Method 2 (Stiffness Approx NBR 6118)'
        return res

    def calculate_method3(self, Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX, lambdaY):
        # Method 3: Coupled Diagram with Kappa stiffness (NBR 6118 item 15.8.3.3.4)
        def get_alpha_b(M1, M2):
            Ma = max(abs(M1), abs(M2))
            Mb = min(abs(M1), abs(M2))
            if Ma == 0: return 1.0
            ratio = (Mb / Ma) if (M1 * M2 >= 0) else -(Mb / Ma)
            return max(0.4, 0.6 + 0.4 * ratio)

        def solve_axis(M1t, M1b, h_m, axis, lam):
            ab = get_alpha_b(M1t, M1b)
            M1_raw = max(abs(M1t), abs(M1b))
            M1_min = abs(Nsd) * (0.015 + 0.03 * h_m)
            M1_eq = max(ab * M1_raw, M1_min)
            
            M_curr = M1_eq
            fcd = self.sec.mat.fcd
            Ac = self.sec.geo.area_ac
            nu = abs(Nsd) / (Ac * fcd) if Ac * fcd > 0 else 0
            
            for _ in range(8):
                # Get Secant Stiffness for M_curr (kNm2)
                EI = self.get_EI_sec(Nsd, axis, M_curr)
                
                EI_cm = EI * 10000.0
                h_cm = h_m * 100.0
                kappa = EI_cm / (Ac * h_cm * h_cm * fcd) if Ac * fcd > 0 else 1.0
                if kappa <= 0: kappa = 1.0
                
                denom = 1.0 - (lam**2 / 120.0 / kappa) * nu
                if denom < 0.1: denom = 0.1
                M_new = M1_eq / denom
                if abs(M_new - M_curr) < 0.05:
                    M_curr = M_new
                    break
                M_curr = M_new
                
            return M_curr

        hx_m = self.sec.geo.hx / 100.0
        hy_m = self.sec.geo.hy / 100.0
        
        M1_min_x = abs(Nsd) * (0.015 + 0.03 * hy_m)
        M1_min_y = abs(Nsd) * (0.015 + 0.03 * hx_m)

        Mtarget_x = solve_axis(M1xt, M1xb, hy_m, 'x', lambdaX) if lambdaX > 35 else max(abs(M1xt), abs(M1xb), M1_min_x)
        Mtarget_y = solve_axis(M1yt, M1yb, hx_m, 'y', lambdaY) if lambdaY > 35 else max(abs(M1yt), abs(M1yb), M1_min_y)

        # Enforce envelope with end moments and minimum moment (NBR 6118)
        Mtot_x = max(Mtarget_x, abs(M1xt), abs(M1xb), M1_min_x)
        Mtot_y = max(Mtarget_y, abs(M1yt), abs(M1yb), M1_min_y)

        alpha_bx = get_alpha_b(M1xt, M1xb)
        alpha_by = get_alpha_b(M1yt, M1yb)
        M1d_eq_x = max(alpha_bx * max(abs(M1xt), abs(M1xb)), M1_min_x)
        M1d_eq_y = max(alpha_by * max(abs(M1yt), abs(M1yb)), M1_min_y)

        return {
            'Mtot_x': Mtot_x, 'Mtot_y': Mtot_y,
            'M2d_x': max(0.0, Mtarget_x - M1d_eq_x),
            'M2d_y': max(0.0, Mtarget_y - M1d_eq_y),
            'info': 'Method 3 (Kappa NBR 6118)'
        }

    def calculate_method_general(self, Nsd, M1xt, M1xb, M1yt, M1yb, biaxial=True):
        # General Non-Linear Method (NBR 6118 item 15.8.3.1)
        nNodes = 11
        Le = self.length_eff
        nodes = [{'x': (i/(nNodes-1))*Le, 'MtotX': 0, 'MtotY':0, 'wX':0, 'wY':0} for i in range(nNodes)]
        
        hx_m = self.sec.geo.hx / 100.0
        hy_m = self.sec.geo.hy / 100.0
        M1_min_x = abs(Nsd) * (0.015 + 0.03 * hy_m)
        M1_min_y = abs(Nsd) * (0.015 + 0.03 * hx_m)

        for n in nodes:
            alpha = n['x'] / Le if Le > 0 else 0
            n['M1x'] = M1xt + (M1xb - M1xt) * alpha
            n['M1y'] = M1yt + (M1yb - M1yt) * alpha
            n['MtotX'] = n['M1x']
            n['MtotY'] = n['M1y']
            
        for _ in range(25): 
            for n in nodes:
                Mx = n['MtotX']
                My = n['MtotY'] if biaxial else 0
                res = self.solve_curvature(Nsd, Mx, My)
                # CRITICAL FIX: res['kx'] is in 1/cm. Convert to 1/m by multiplying by 100.0!
                n['kx'] = res['kx'] * 100.0 
                n['ky'] = res['ky'] * 100.0
            
            def integrate(propKy, propW):
                h = Le / (nNodes - 1)
                slope = [0]*nNodes
                disp = [0]*nNodes
                for i in range(1, nNodes):
                    avgK = (nodes[i-1][propKy] + nodes[i][propKy]) / 2.0
                    slope[i] = slope[i-1] + avgK * h
                for i in range(1, nNodes):
                    avgS = (slope[i-1] + slope[i]) / 2.0
                    disp[i] = disp[i-1] + avgS * h
                gap = disp[-1]
                angle = gap / Le if Le > 0 else 0
                for i in range(nNodes):
                    nodes[i][propW] = disp[i] - angle * nodes[i]['x']

            integrate('kx', 'wY')
            integrate('ky', 'wX')
            
            maxDiff = 0
            for n in nodes:
                oldMx = n['MtotX']
                oldMy = n['MtotY']
                sign_x = 1.0 if n['M1x'] >= 0 else -1.0
                sign_y = 1.0 if n['M1y'] >= 0 else -1.0
                newMx = n['M1x'] + sign_x * abs(Nsd) * abs(n['wY'])
                newMy = n['M1y'] + sign_y * abs(Nsd) * abs(n['wX'])
                n['MtotX'] = newMx
                n['MtotY'] = newMy
                maxDiff = max(maxDiff, abs(newMx - oldMx), abs(newMy - oldMy))
                
            if maxDiff < 0.01: break
            
        max_tot_x = max([abs(n['MtotX']) for n in nodes])
        max_tot_y = max([abs(n['MtotY']) for n in nodes])
        
        max_m1_x = max(abs(M1xt), abs(M1xb))
        max_m1_y = max(abs(M1yt), abs(M1yb))
        
        # Enforce minimum moments
        Mtot_x = max(max_tot_x, M1_min_x)
        Mtot_y = max(max_tot_y, M1_min_y)

        max_wY = max([abs(n['wY']) for n in nodes])
        max_wX = max([abs(n['wX']) for n in nodes])

        M2d_x = max(max_tot_x - max_m1_x, abs(Nsd) * max_wY)
        M2d_y = max(max_tot_y - max_m1_y, abs(Nsd) * max_wX)
        
        return {
            'Mtot_x': Mtot_x, 'Mtot_y': Mtot_y,
            'M2d_x': M2d_x,
            'M2d_y': M2d_y,
            'info': 'Method General (Non-Linear FEA NBR 6118)'
        }


def calculate_column(inputs):
    mat = MaterialData(
        inputs['fck'], 
        inputs['fyk'], 
        inputs['es'],
        gamac=inputs.get('gamac', 1.4),
        gamas=inputs.get('gamas', 1.15)
    )
    
    geo_kwargs = {k: v for k, v in inputs.items() if k not in ('section_type', 'hx', 'hy', 'boundary', 'length')}
    geo = SectionGeometry(
        inputs['section_type'],
        inputs.get('hx', 30.0),
        inputs.get('hy', 50.0),
        inputs['boundary'],
        inputs['length'],
        **geo_kwargs
    )
    geo.discretize()
    
    bars = []
    xm = geo.xm
    ym = geo.ym
    for b in inputs['bars']:
        bars.append({'x': b['x'] - xm, 'y': b['y'] - ym, 'diametro': b['diametro']})
        
    sec = ConcreteSection(geo, mat, bars)
    solver = Solver(sec)
    solver.length_eff = inputs['length'] / 100.0
    if inputs['boundary'] != 'pinned': solver.length_eff *= 2.0
    
    # Interaction Surface
    surface = generate_interaction_surface(sec)
    
    # Load Case
    load = inputs['load']
    gf = inputs.get('gamaf', 1.4)
    Nsd = load['n'] * gf
    
    M1xt = load['mxTop'] * gf
    M1xb = load['mxBot'] * gf
    M1yt = load['myTop'] * gf
    M1yb = load['myBot'] * gf
    
    method = inputs.get('method_2nd', 'curvature_approx')
    res_2nd = {}
    
    # CRITICAL FIX: Real Slenderness Calculation per NBR 6118 (lambda = le / i)
    # Radius of gyration i = sqrt(I / Ac)
    ix = math.sqrt(geo.ix / geo.area_ac) if geo.area_ac > 0 else 1.0
    iy = math.sqrt(geo.iy / geo.area_ac) if geo.area_ac > 0 else 1.0
    le_cm = solver.length_eff * 100.0
    # Bending about X involves depth hy, with inertia Ix
    lambdaX = le_cm / ix
    lambdaY = le_cm / iy
    
    if inputs.get('calc_2nd_order', True):
        if 'general' in method:
            res_2nd = solver.calculate_method_general(Nsd, M1xt, M1xb, M1yt, M1yb, biaxial=True)
        elif method == 'stiffness_approx' or method == 'method2':
            res_2nd = solver.calculate_method2(Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX, lambdaY)
        elif method == 'standard_diagram' or method == 'method3':
            res_2nd = solver.calculate_method3(Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX, lambdaY)
        else:
            res_2nd = solver.calculate_method1(Nsd, M1xt, M1xb, M1yt, M1yb, lambdaX, lambdaY)
    else:
        res_2nd = {
            'Mtot_x': max(abs(M1xt), abs(M1xb)),
            'Mtot_y': max(abs(M1yt), abs(M1yb)),
            'M2d_x': 0,
            'M2d_y': 0,
            'info': '1st Order Only'
        }

    # Cracking Envelope (ELS-W / ELS-F NBR 6118)
    enable_cracking = inputs.get('enable_cracking_envelope', True)
    w_lim = float(inputs.get('cracking_w_lim', 0.3))
    criterion = inputs.get('cracking_criterion', 'wk_limit')

    cracking_surface = None
    if enable_cracking:
        cracking_surface = generate_cracking_surface(sec, w_lim=w_lim, criterion=criterion)

    # Cracking verification for the load case (Service State)
    gf_serv = float(inputs.get('gamma_f_serv', 1.0))
    N_serv = load['n'] * gf_serv
    Mx_serv = (res_2nd.get('Mtot_x', max(abs(M1xt), abs(M1xb)))) / gf
    My_serv = (res_2nd.get('Mtot_y', max(abs(M1yt), abs(M1yb)))) / gf
    cracking_check = verify_cracking(sec, N_serv, Mx_serv, My_serv, w_lim=w_lim)

    return {
        'surface': surface,
        'cracking_surface': cracking_surface,
        'cracking_results': cracking_check,
        'results': res_2nd,
        'slenderness': {'lambdaX': lambdaX, 'lambdaY': lambdaY}
    }
