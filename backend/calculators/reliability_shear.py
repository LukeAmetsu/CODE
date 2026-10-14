"""
Structural Reliability & Partial Safety Factor Calibration Module for Shear Design
Teoria da Confiabilidade Estrutural aplicada a vigas e lajes de concreto armado sob esforço cortante.
Implementa FORM (Hasofer-Lind & Rackwitz-Fiessler), Simulação de Monte Carlo,
análise de sensibilidade (diretores de cosseno alpha_i^2) e calibração de coeficientes parciais de segurança (gamma_v).
"""

import math
import numpy as np
from scipy import stats
from scipy.special import ndtr
from scipy.optimize import minimize_scalar

# ---------------------------------------------------------------------------
# DEFAULT PROBABILISTIC DISTRIBUTIONS & DESCRIPTIONS (JCSS & NBR 6118 / BECK)
# ---------------------------------------------------------------------------

DEFAULT_RANDOM_VARIABLES = {
    "fc": {
        "name": "Resistência do Concreto (fc)",
        "symbol": "f_c",
        "unit": "MPa",
        "dist": "lognormal",
        "cov": 0.17,
        "bias": 1.15,  # mu_fc = bias * fck
        "desc": "Resistência à compressão real do concreto (JCSS / fib Model Code)",
    },
    "bw": {
        "name": "Largura da Seção (bw)",
        "symbol": "b_w",
        "unit": "mm",
        "dist": "normal",
        "cov": 0.03,
        "bias": 1.00,
        "desc": "Largura da alma (tolerância dimensional de formas)",
    },
    "d": {
        "name": "Altura Útil (d)",
        "symbol": "d",
        "unit": "mm",
        "dist": "normal",
        "cov": 0.04,
        "bias": 0.99,
        "desc": "Posição efetiva da armadura longitudinal (posicionamento e cobrimento)",
    },
    "rho": {
        "name": "Taxa de Armadura (rho_w)",
        "symbol": r"\rho_w",
        "unit": "-",
        "dist": "normal",
        "cov": 0.04,
        "bias": 1.00,
        "desc": "Área de aço longitudinal (área de barras comerciais)",
    },
    "ad": {
        "name": "Vão Cisalhante (a/d)",
        "symbol": "a/d",
        "unit": "-",
        "dist": "normal",
        "cov": 0.03,
        "bias": 1.00,
        "desc": "Relação vão cisalhante / altura útil",
    },
    "theta_R": {
        "name": "Incerteza do Modelo de Resistência (θ_R)",
        "symbol": r"\theta_R",
        "unit": "-",
        "dist": "lognormal",
        "cov": 0.15,
        "bias": 1.00,
        "desc": "Erro de modelo empírico extraído da estatística V_test / V_calc da base de dados",
    },
    "G": {
        "name": "Carga Permanente (G)",
        "symbol": "G",
        "unit": "kN",
        "dist": "normal",
        "cov": 0.09,
        "bias": 1.05,
        "desc": "Ações permanentes (peso próprio e revestimentos)",
    },
    "Q": {
        "name": "Carga Acidental (Q)",
        "symbol": "Q",
        "unit": "kN",
        "dist": "gumbel",
        "cov": 0.25,
        "bias": 0.70,
        "desc": "Ações variáveis de 50 anos de período de retorno (JCSS / EN 1990)",
    },
    "theta_S": {
        "name": "Incerteza do Modelo de Solicitação (θ_S)",
        "symbol": r"\theta_S",
        "unit": "-",
        "dist": "lognormal",
        "cov": 0.05,
        "bias": 1.00,
        "desc": "Incerteza associada à análise estrutural de esforços solicitantes",
    },
}


# ---------------------------------------------------------------------------
# RESISTANCE PREDICTION MODELS
# ---------------------------------------------------------------------------

def calculate_empirical_shear_capacity(fc, bw, d, rho, ad, ddg, params):
    """
    Computes nominal shear capacity VR (kN) using the proposed empirical formulation:
    V_R = [C * (ddg / d_eff)^alpha * (100 * rho)^beta * fc^gamma * (a/d)^delta * bw * d] / 1000
    """
    if fc <= 0 or bw <= 0 or d <= 0 or rho <= 0:
        return 0.0

    c_param = params.get('C', 1.25)
    alpha = params.get('alpha', 0.333)
    beta = params.get('beta', 0.333)
    gamma = params.get('gamma', 0.333)
    delta = params.get('delta', -0.75)
    mu_param = params.get('mu', 0.15)
    sigma_cp = params.get('sigma_cp', 0.0)
    use_deff = bool(params.get('use_deff', False))

    d_eff = d
    if use_deff and ad > 0:
        acs = max(ad * d, d)
        if acs < 4.0 * d:
            d_eff = math.sqrt((acs / 4.0) * d)

    d_dg_val = max(10.0, float(ddg if ddg is not None and ddg > 0 else 32.0))
    eff_ad = max(1.0, float(ad if ad is not None and ad > 0 else 3.0))

    term_size = math.pow(d_dg_val / d_eff, alpha)
    term_rho = math.pow(100.0 * rho, beta)
    term_fck = math.pow(fc, gamma)
    term_ad = math.pow(eff_ad, delta)

    vc_rc = c_param * term_size * term_rho * term_fck * term_ad
    sigma_lim = min(sigma_cp, 0.2 * fc)
    vc = vc_rc + mu_param * sigma_lim

    vr_n = vc * bw * d
    return max(0.0, vr_n / 1000.0)  # kN


def calculate_code_shear_capacity(code_name, fc, bw, d, rho, ad, ddg, sigma_cp=0.0):
    """Calculates shear resistance VR (kN) according to standard codes."""
    if fc <= 0 or bw <= 0 or d <= 0 or rho <= 0:
        return 0.0

    if code_name.upper() in ["NBR6118", "NBR_6118", "NBR"]:
        # ABNT NBR 6118:2023 formulation for members without transverse reinforcement
        # Base nominal resistance using fctm (conversion k_ctk = 0.70 and gamma_v = 1.40 handled in design state)
        fctm = 0.3 * (fc ** (2/3)) if fc <= 50 else 2.12 * math.log(1.0 + 0.11 * fc)
        tau_r = 0.25 * fctm
        d_m = d / 1000.0
        k = max(1.0, 1.6 - d_m) if d > 0 else 1.0
        rho_1 = min(0.02, rho)
        sig = max(0.0, float(sigma_cp or 0.0))
        v_c = (tau_r * k * (1.2 + 40.0 * rho_1) + 0.15 * sig) * bw * d
        return max(0.0, v_c / 1000.0)

    elif code_name.upper() in ["EC2_2023", "EUROCODE_2023", "EC2"]:
        # Eurocode 2: 2023 / FIB Model Code
        d_dg = ddg if ddg > 0 else 32.0
        d_eff = d
        if ad > 0:
            acs = max(ad * d, d)
            if acs < 4.0 * d:
                d_eff = math.sqrt((acs / 4.0) * d)
        v_c = (0.6 / 1.0) * ((100.0 * rho * fc * (d_dg / d_eff)) ** (1.0 / 3.0)) * bw * d
        return max(0.0, v_c / 1000.0)

    elif code_name.upper() in ["ACI318", "ACI_318", "ACI"]:
        # ACI 318-19: (0.66 * lambda_s * (rho_w)^(1/3) * sqrt(f'c)) * bw * d
        lambda_s = math.sqrt(2.0 / (1.0 + 0.004 * d))
        lambda_s = min(1.0, lambda_s)
        vc_mpa = (8.0 * lambda_s * (rho ** (1.0 / 3.0)) * math.sqrt(fc)) / 12.0  # SI equivalent approx 0.66
        v_c = vc_mpa * bw * d
        return max(0.0, v_c / 1000.0)

    # Fallback to empirical
    return calculate_empirical_shear_capacity(fc, bw, d, rho, ad, ddg, {'C': 1.25, 'alpha': 0.333, 'beta': 0.333, 'gamma': 0.333, 'delta': -0.75})


# ---------------------------------------------------------------------------
# STATISTICAL TRANSFORMATIONS (PHYSICAL X <-> STANDARD NORMAL U)
# ---------------------------------------------------------------------------

def x_to_u(x_val, dist_type, mean, cov):
    """Transforms a physical variable X into standard normal U ~ N(0, 1)."""
    std = cov * mean
    if dist_type == "normal":
        return (x_val - mean) / std if std > 0 else 0.0

    elif dist_type == "lognormal":
        if x_val <= 0 or mean <= 0:
            return -5.0
        zeta = math.sqrt(math.log(1.0 + cov ** 2))
        lambda_val = math.log(mean) - 0.5 * (zeta ** 2)
        return (math.log(x_val) - lambda_val) / zeta

    elif dist_type == "gumbel":
        # Mean = u_n + 0.5772156649 / alpha_n; Std = pi / (sqrt(6) * alpha_n)
        alpha_n = math.pi / (math.sqrt(6.0) * std)
        u_n = mean - 0.57721566490153286 / alpha_n
        # F(x) = exp(-exp(-alpha_n * (x - u_n)))
        z = -alpha_n * (x_val - u_n)
        z = max(-50.0, min(50.0, z))
        cdf = math.exp(-math.exp(z))
        cdf = max(1e-12, min(1.0 - 1e-12, cdf))
        return stats.norm.ppf(cdf)

    return (x_val - mean) / (std if std > 0 else 1.0)


def u_to_x(u_val, dist_type, mean, cov):
    """Transforms standard normal U into physical variable X."""
    std = cov * mean
    if dist_type == "normal":
        return mean + std * u_val

    elif dist_type == "lognormal":
        zeta = math.sqrt(math.log(1.0 + cov ** 2))
        lambda_val = math.log(mean) - 0.5 * (zeta ** 2)
        return math.exp(lambda_val + zeta * u_val)

    elif dist_type == "gumbel":
        alpha_n = math.pi / (math.sqrt(6.0) * std)
        u_n = mean - 0.57721566490153286 / alpha_n
        cdf = stats.norm.cdf(u_val)
        cdf = max(1e-12, min(1.0 - 1e-12, cdf))
        return u_n - (math.log(-math.log(cdf))) / alpha_n

    return mean + std * u_val


# ---------------------------------------------------------------------------
# FIRST-ORDER RELIABILITY METHOD (FORM) ENGINE (HL-RF ALGORITHM)
# ---------------------------------------------------------------------------

class StructuralReliabilityAnalysis:
    """
    Executes First-Order Reliability Method (FORM) and Monte Carlo Simulation (MCS)
    for shear design limit state functions.
    """

    def __init__(self, section_nom, model_params, rv_config=None, target_beta=3.80, code_design='PROPOSED'):
        """
        Parameters:
        - section_nom: dict containing nominal properties {fck, bw, d, rho, ad, ddg, chi, gamma_v, gamma_g, gamma_q}
        - model_params: dict containing formulation parameters {C, alpha, beta, gamma, delta, mu, use_deff}
        - rv_config: customized distributions & COVs for random variables
        - target_beta: target reliability index (default 3.80 for fragile shear failures)
        - code_design: 'PROPOSED', 'NBR6118', 'EC2', or 'ACI'
        """
        self.section = section_nom
        self.params = model_params
        self.target_beta = float(target_beta)
        self.code_design = code_design

        # Merge RV configuration with defaults
        self.rvs = {}
        for k, default_rv in DEFAULT_RANDOM_VARIABLES.items():
            user_rv = (rv_config or {}).get(k, {})
            self.rvs[k] = {
                "name": default_rv["name"],
                "symbol": default_rv["symbol"],
                "unit": default_rv["unit"],
                "dist": user_rv.get("dist", default_rv["dist"]),
                "cov": float(user_rv.get("cov", default_rv["cov"])),
                "bias": float(user_rv.get("bias", default_rv["bias"])),
            }

        # Setup nominal and characteristic values
        self._setup_design_state()

    def _setup_design_state(self):
        fck = float(self.section.get("fck", 30.0))
        bw = float(self.section.get("bw", 250.0))
        d = float(self.section.get("d", 400.0))
        rho = float(self.section.get("rho", 0.012))
        ad = float(self.section.get("ad", 3.0))
        ddg = float(self.section.get("ddg", 32.0))
        chi = float(self.section.get("chi", 0.30))  # Q / (G + Q) load ratio
        gamma_v = float(self.section.get("gamma_v", 1.40))
        gamma_g = float(self.section.get("gamma_g", 1.40))
        gamma_q = float(self.section.get("gamma_q", 1.40))
        k_k = float(self.section.get("k_k", 0.70 if self.code_design == 'NBR6118' else 1.00))
        sigma_cp = float(self.section.get("sigma_cp", 0.0) or self.params.get("sigma_cp", 0.0))

        # 1. Calculate nominal and design resistance V_Rd according to chosen code
        # V_R_nominal: base physical formulation (used in denominator of theta_R = V_test / V_calc)
        # V_Rk = k_k * V_R_nominal: characteristic resistance (k_k = 0.70 for NBR 6118, 1.00 for characteristic models)
        # V_Rd = (k_k * V_R_nominal) / gamma_v: design resistance with partial safety factor gamma_v
        if self.code_design == 'PROPOSED':
            v_r_nominal = calculate_empirical_shear_capacity(fck, bw, d, rho, ad, ddg, self.params)
        else:
            v_r_nominal = calculate_code_shear_capacity(self.code_design, fck, bw, d, rho, ad, ddg, sigma_cp=sigma_cp)

        v_rk = k_k * v_r_nominal
        v_rd = (v_rk / gamma_v) if gamma_v > 0 else v_rk

        # 2. Maximum allowable factored load: S_d = gamma_g * G_k + gamma_q * Q_k = V_Rd
        denom = (1.0 - chi) * gamma_g + chi * gamma_q
        if denom > 0:
            total_char = v_rd / denom
            g_k = (1.0 - chi) * total_char
            q_k = chi * total_char
        else:
            g_k = 0.5 * v_rd / 1.4
            q_k = 0.5 * v_rd / 1.4

        self.design_values = {
            "V_R_nominal": v_r_nominal,
            "k_k": k_k,
            "V_Rk": v_rk,
            "V_Rd": v_rd,
            "G_k": g_k,
            "Q_k": q_k,
            "chi": chi,
            "gamma_v": gamma_v,
        }

        # 3. Setup mean values for all random variables
        self.var_keys = ["fc", "bw", "d", "rho", "ad", "theta_R", "G", "Q", "theta_S"]
        self.means = {
            "fc": self.rvs["fc"]["bias"] * fck,
            "bw": self.rvs["bw"]["bias"] * bw,
            "d": self.rvs["d"]["bias"] * d,
            "rho": self.rvs["rho"]["bias"] * rho,
            "ad": self.rvs["ad"]["bias"] * ad,
            "theta_R": self.rvs["theta_R"]["bias"] * 1.0,
            "G": self.rvs["G"]["bias"] * g_k,
            "Q": self.rvs["Q"]["bias"] * q_k,
            "theta_S": self.rvs["theta_S"]["bias"] * 1.0,
        }

    def limit_state_g_X(self, x_dict):
        """
        Limit state function in physical space: g(X) = R - S.
        R = theta_R * V_R(X), evaluating raw nominal resistance WITHOUT partial factors or k_k,
        exactly identical to the expression in the denominator of theta_R = V_test / V_calc.
        """
        fc = x_dict["fc"]
        bw = x_dict["bw"]
        d = x_dict["d"]
        rho = x_dict["rho"]
        ad = x_dict["ad"]
        ddg = float(self.section.get("ddg", 32.0))
        theta_R = x_dict["theta_R"]
        g_load = x_dict["G"]
        q_load = x_dict["Q"]
        theta_S = x_dict["theta_S"]
        sigma_cp = float(self.section.get("sigma_cp", 0.0) or self.params.get("sigma_cp", 0.0))

        # Calculate resistance without partial safety factors
        if self.code_design == 'PROPOSED':
            v_r = calculate_empirical_shear_capacity(fc, bw, d, rho, ad, ddg, self.params)
        else:
            v_r = calculate_code_shear_capacity(self.code_design, fc, bw, d, rho, ad, ddg, sigma_cp=sigma_cp)

        resistance = theta_R * v_r
        solicitation = theta_S * (g_load + q_load)

        return resistance - solicitation

    def limit_state_g_U(self, u_vec):
        """Limit state function in standard normal space U."""
        x_dict = {}
        for idx, k in enumerate(self.var_keys):
            x_dict[k] = u_to_x(u_vec[idx], self.rvs[k]["dist"], self.means[k], self.rvs[k]["cov"])
        return self.limit_state_g_X(x_dict)

    def run_form(self, max_iter=60, tol=1e-4):
        """
        Executes First-Order Reliability Method (FORM) via Hasofer-Lind & Rackwitz-Fiessler (HL-RF).
        Returns:
        - beta: Reliability Index
        - pf: Failure Probability
        - alpha_i: Direction cosines (Sensitivity factors alpha_i^2)
        - design_point_X: Most Probable Point of Failure (MPP) in physical space
        - design_point_U: MPP in standard normal space
        - iterations: Number of iterations to convergence
        """
        n_vars = len(self.var_keys)
        u = np.zeros(n_vars)  # Start from mean point (origin in U-space)
        delta_step = 1e-5

        beta = 0.0
        converged = False
        iteration = 0

        for iteration in range(1, max_iter + 1):
            g_val = self.limit_state_g_U(u)

            # Compute numerical gradient in U space: grad = [dg/du_i]
            grad = np.zeros(n_vars)
            for i in range(n_vars):
                u_fwd = u.copy()
                u_fwd[i] += delta_step
                g_fwd = self.limit_state_g_U(u_fwd)
                grad[i] = (g_fwd - g_val) / delta_step

            grad_norm = np.linalg.norm(grad)
            if grad_norm < 1e-12:
                break

            # Normalized negative gradient (alpha direction cosines)
            # In structural reliability: alpha = -grad / ||grad||
            alpha_dir = -grad / grad_norm

            # HL-RF step: u_new = (grad^T u - g) / ||grad||^2 * grad
            u_new = ((np.dot(grad, u) - g_val) / (grad_norm ** 2)) * grad

            diff = np.linalg.norm(u_new - u)
            beta_new = np.linalg.norm(u_new)
            u = u_new

            if diff < tol:
                converged = True
                beta = beta_new
                break

        if not converged:
            beta = float(np.linalg.norm(u))

        # Direction cosines and sensitivity factors (alpha_i^2 sum to 100%)
        grad = np.zeros(n_vars)
        g_val = self.limit_state_g_U(u)
        for i in range(n_vars):
            u_fwd = u.copy()
            u_fwd[i] += delta_step
            grad[i] = (self.limit_state_g_U(u_fwd) - g_val) / delta_step
        grad_norm = np.linalg.norm(grad)
        if grad_norm > 1e-12:
            alpha_vec = -grad / grad_norm
        else:
            alpha_vec = np.ones(n_vars) / np.sqrt(n_vars)

        sensitivity = (alpha_vec ** 2)
        sensitivity_pct = {k: float(sensitivity[i] * 100.0) for i, k in enumerate(self.var_keys)}

        # Failure probability Pf = Phi(-beta)
        pf = float(stats.norm.cdf(-beta))

        # Physical design point at MPP
        design_point_X = {}
        for idx, k in enumerate(self.var_keys):
            design_point_X[k] = float(u_to_x(u[idx], self.rvs[k]["dist"], self.means[k], self.rvs[k]["cov"]))

        return {
            "beta": float(round(beta, 4)),
            "pf": float(pf),
            "converged": bool(converged),
            "iterations": int(iteration),
            "design_point_U": {k: float(round(u[i], 4)) for i, k in enumerate(self.var_keys)},
            "design_point_X": design_point_X,
            "sensitivity_pct": sensitivity_pct,
            "alpha_dir": {k: float(round(alpha_vec[i], 4)) for i, k in enumerate(self.var_keys)},
            "design_values": self.design_values,
        }

    def evaluate_limit_state_batch(self, u_samples):
        """
        Vectorized evaluation of limit state function g(U) = R - S for large Monte Carlo sample matrices.
        u_samples: np.ndarray of shape (n_samples, n_vars).
        Returns: 1D np.ndarray of shape (n_samples,) with limit state values g = R - S.
        """
        n_samples = u_samples.shape[0]
        x_mat = np.zeros_like(u_samples)

        for idx, k in enumerate(self.var_keys):
            dist_type = self.rvs[k]["dist"]
            mean = self.means[k]
            cov = self.rvs[k]["cov"]
            u_col = u_samples[:, idx]
            std = cov * mean

            if dist_type == "normal":
                x_mat[:, idx] = mean + std * u_col
            elif dist_type == "lognormal":
                zeta = math.sqrt(math.log(1.0 + cov ** 2))
                lambda_val = math.log(mean) - 0.5 * (zeta ** 2)
                x_mat[:, idx] = np.exp(lambda_val + zeta * u_col)
            elif dist_type == "gumbel":
                alpha_n = math.pi / (math.sqrt(6.0) * std)
                u_n = mean - 0.57721566490153286 / alpha_n
                cdf = ndtr(u_col)
                cdf = np.clip(cdf, 1e-12, 1.0 - 1e-12)
                x_mat[:, idx] = u_n - (np.log(-np.log(cdf))) / alpha_n
            else:
                x_mat[:, idx] = mean + std * u_col

        fc = x_mat[:, 0]
        bw = x_mat[:, 1]
        d = x_mat[:, 2]
        rho = x_mat[:, 3]
        ad = x_mat[:, 4]
        theta_R = x_mat[:, 5]
        g_load = x_mat[:, 6]
        q_load = x_mat[:, 7]
        theta_S = x_mat[:, 8]

        ddg = float(self.section.get("ddg", 32.0))
        sigma_cp = float(self.section.get("sigma_cp", 0.0) or self.params.get("sigma_cp", 0.0))

        if self.code_design == 'PROPOSED':
            c_param = float(self.params.get('C', 1.25) or 1.25)
            alpha = float(self.params.get('alpha', 0.333) or 0.333)
            beta = float(self.params.get('beta', 0.333) or 0.333)
            gamma = float(self.params.get('gamma', 0.333) or 0.333)
            delta = float(self.params.get('delta', -0.75) or -0.75)
            mu_param = float(self.params.get('mu', 0.15) or 0.15)
            use_deff = bool(self.params.get('use_deff', False))
            d_dg_val = max(10.0, float(ddg if ddg is not None and ddg > 0 else 32.0))

            d_eff = d.copy()
            if use_deff:
                acs = np.maximum(ad * d, d)
                mask = (ad > 0) & (acs < 4.0 * d)
                d_eff = np.where(mask, np.sqrt((acs / 4.0) * d), d)

            eff_ad = np.maximum(1.0, np.where(ad > 0, ad, 3.0))
            term_size = np.power(d_dg_val / d_eff, alpha)
            term_rho = np.power(100.0 * rho, beta)
            term_fck = np.power(fc, gamma)
            term_ad = np.power(eff_ad, delta)

            vc_rc = c_param * term_size * term_rho * term_fck * term_ad
            sigma_lim = np.minimum(sigma_cp, 0.2 * fc)
            vc = vc_rc + mu_param * sigma_lim
            vr_n = vc * bw * d
            v_r = np.maximum(0.0, vr_n / 1000.0)

        elif self.code_design.upper() in ["NBR6118", "NBR_6118", "NBR"]:
            fctm = np.where(fc <= 50.0, 0.3 * np.power(fc, 2.0 / 3.0), 2.12 * np.log(1.0 + 0.11 * fc))
            tau_r = 0.25 * fctm
            d_m = d / 1000.0
            k = np.maximum(1.0, 1.6 - d_m)
            rho_1 = np.minimum(0.02, rho)
            sig = max(0.0, float(sigma_cp or 0.0))
            v_c = (tau_r * k * (1.2 + 40.0 * rho_1) + 0.15 * sig) * bw * d
            v_r = np.maximum(0.0, v_c / 1000.0)

        elif self.code_design.upper() in ["EC2_2023", "EUROCODE_2023", "EC2"]:
            d_dg = ddg if ddg > 0 else 32.0
            d_eff = d.copy()
            acs = np.maximum(ad * d, d)
            mask = (ad > 0) & (acs < 4.0 * d)
            d_eff = np.where(mask, np.sqrt((acs / 4.0) * d), d)
            v_c = 0.6 * np.power(100.0 * rho * fc * (d_dg / d_eff), 1.0 / 3.0) * bw * d
            v_r = np.maximum(0.0, v_c / 1000.0)

        elif self.code_design.upper() in ["ACI318", "ACI_318", "ACI"]:
            lambda_s = np.minimum(1.0, np.sqrt(2.0 / (1.0 + 0.004 * d)))
            vc_mpa = (8.0 * lambda_s * np.power(rho, 1.0 / 3.0) * np.sqrt(fc)) / 12.0
            v_c = vc_mpa * bw * d
            v_r = np.maximum(0.0, v_c / 1000.0)

        else:
            v_r = np.array([calculate_code_shear_capacity(self.code_design, fc[i], bw[i], d[i], rho[i], ad[i], ddg, sigma_cp=sigma_cp) for i in range(n_samples)])

        resistance = theta_R * v_r
        solicitation = theta_S * (g_load + q_load)
        return resistance - solicitation

    def run_monte_carlo(self, n_samples=50000, seed=42):
        """
        Executes direct Monte Carlo Simulation (MCS) to validate FORM.
        Evaluates limit state g(U) = R - S in vectorized NumPy blocks for 100x+ speedup.
        Returns Pf_mc, beta_mc, and 95% confidence interval.
        """
        rng = np.random.default_rng(seed)
        n_vars = len(self.var_keys)

        # Generate standard normal samples
        u_samples = rng.standard_normal((n_samples, n_vars))

        g_vals = self.evaluate_limit_state_batch(u_samples)
        failures = int(np.count_nonzero(g_vals <= 0))

        pf_mc = failures / n_samples
        if pf_mc > 0:
            beta_mc = -stats.norm.ppf(pf_mc)
            var_pf = (pf_mc * (1.0 - pf_mc)) / n_samples
            cov_pf = math.sqrt(var_pf) / pf_mc
            ci_low = max(0.0, pf_mc - 1.96 * math.sqrt(var_pf))
            ci_high = pf_mc + 1.96 * math.sqrt(var_pf)
        else:
            beta_mc = 5.0
            cov_pf = 1.0
            ci_low, ci_high = 0.0, 3.0 / n_samples

        return {
            "n_samples": n_samples,
            "failures": failures,
            "pf_mc": float(pf_mc),
            "beta_mc": float(round(beta_mc, 4)),
            "cov_pf": float(round(cov_pf, 4)),
            "ci_95": [float(ci_low), float(ci_high)],
        }


# ---------------------------------------------------------------------------
# PARAMETRIC SWEEPS & PARTIAL FACTOR CALIBRATION
# ---------------------------------------------------------------------------

def calculate_beta_vs_load_ratio(section_nom, model_params, rv_config=None, chi_values=None, code_design='PROPOSED'):
    """
    Computes reliability index beta across a range of load ratios chi = Q / (G + Q).
    Typically chi ranges from 0.10 (predominant dead load) to 0.70 (predominant live load).
    """
    if chi_values is None:
        chi_values = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80]

    results = []
    for chi in chi_values:
        sec = dict(section_nom)
        sec["chi"] = chi
        sra = StructuralReliabilityAnalysis(sec, model_params, rv_config=rv_config, code_design=code_design)
        res = sra.run_form()
        results.append({
            "chi": float(chi),
            "beta": res["beta"],
            "pf": res["pf"],
            "sensitivity": res["sensitivity_pct"],
        })
    return results


def calibrate_optimal_gamma_v(section_nom, model_params, target_beta=3.80, rv_config=None, chi_weights=None, bounds=(0.80, 3.50)):
    """
    Inverse calibration of partial safety factor gamma_v to attain target reliability index beta_target.
    Uses high-precision bisection search (|beta - beta_target| < 1e-4 with >= 25 iterations).
    Guarantees beta >= beta_target and returns exact synchronized gamma_v.
    """
    b_low, b_high = bounds
    target_beta = float(target_beta)

    def eval_form_beta(gv):
        sec = dict(section_nom)
        sec["gamma_v"] = float(gv)
        sra = StructuralReliabilityAnalysis(sec, model_params, rv_config=rv_config, code_design='PROPOSED')
        return sra.run_form()["beta"]

    # Check bounds
    beta_low = eval_form_beta(b_low)
    if beta_low >= target_beta:
        gamma_optimal = b_low
        hit_lower_bound = True
        hit_upper_bound = False
    else:
        beta_high = eval_form_beta(b_high)
        if beta_high < target_beta:
            gamma_optimal = b_high
            hit_upper_bound = True
            hit_lower_bound = False
        else:
            # High-precision bisection search (>= 25 iterations, |beta - target_beta| < 1e-4)
            low = b_low
            high = b_high
            gamma_optimal = high
            for _ in range(35):
                mid = 0.5 * (low + high)
                b_mid = eval_form_beta(mid)
                if abs(b_mid - target_beta) < 1e-4:
                    gamma_optimal = mid
                    break
                if b_mid < target_beta:
                    low = mid
                else:
                    high = mid
                    gamma_optimal = mid

            # Ensure beta >= target_beta with 3 decimal places
            cand = round(gamma_optimal, 3)
            if eval_form_beta(cand) < target_beta:
                cand = round(cand + 0.001, 3)
            gamma_optimal = cand
            hit_upper_bound = False
            hit_lower_bound = False

    # Evaluate beta curve with optimal gamma_v
    final_curve = calculate_beta_vs_load_ratio(
        {**section_nom, "gamma_v": gamma_optimal},
        model_params,
        rv_config=rv_config,
        chi_values=list((chi_weights or {0.15: 0.15, 0.25: 0.25, 0.35: 0.30, 0.50: 0.20, 0.65: 0.10}).keys()),
        code_design='PROPOSED'
    )
    final_beta = eval_form_beta(gamma_optimal)
    reached_target = bool(final_beta >= target_beta - 1e-4 and not hit_upper_bound)

    return {
        "target_beta": float(target_beta),
        "optimal_gamma_v": float(round(gamma_optimal, 3)),
        "recommended_standard_gamma": float(round(gamma_optimal, 3)),
        "avg_beta": float(round(final_beta, 3)),
        "reached_target": reached_target,
        "hit_upper_bound": hit_upper_bound,
        "hit_lower_bound": hit_lower_bound,
        "curve": final_curve,
    }


def calibrate_optimal_constant_C(section_nom, model_params, target_beta=3.80, gamma_v=1.40, rv_config=None, chi_weights=None):
    """
    Calibrates characteristic constant C (C_k) to achieve target reliability index beta_target
    with fixed partial safety factor gamma_v = 1.40 (standard NBR 6118 / EC2).
    
    Since physical resistance theta_R * V_calc is invariant to C (as mu_theta_R scales as C_0 / C
    with constant COV), this calibration keeps gamma_v = 1.40 fixed and finds the characteristic
    constant C_k such that V_Rd = (k_k * V_calc(C_k)) / gamma_v delivers exactly beta = beta_target.
    """
    target_beta = float(target_beta)
    c_base = float(model_params.get('C', 1.25) or 1.25)
    if c_base <= 0:
        c_base = 1.25

    # Get current theta_R distribution
    user_theta = (rv_config or {}).get('theta_R', {})
    base_mu_theta = float(user_theta.get('bias', 1.00))
    cov_theta = float(user_theta.get('cov', 0.15))
    dist_theta = user_theta.get('dist', 'lognormal')

    sec = dict(section_nom)
    sec['gamma_v'] = float(gamma_v)

    def eval_c_beta(c_val):
        mu_theta = base_mu_theta * (c_base / c_val)
        trial_params = dict(model_params)
        trial_params['C'] = c_val

        rvs = dict(rv_config or {})
        rvs['theta_R'] = {'bias': mu_theta, 'cov': cov_theta, 'dist': dist_theta}

        s = dict(sec)
        sra = StructuralReliabilityAnalysis(s, trial_params, rv_config=rvs, code_design='PROPOSED')
        return sra.run_form()['beta']

    # Bisection search for C in [0.005, 5.00] (monotonic: smaller C -> higher beta)
    low_c, high_c = 0.005, 5.00
    c_optimal = 1.25
    for _ in range(35):
        mid_c = 0.5 * (low_c + high_c)
        b_mid = eval_c_beta(mid_c)
        if abs(b_mid - target_beta) < 1e-4:
            c_optimal = mid_c
            break
        if b_mid < target_beta:
            # Need higher beta -> need smaller C
            high_c = mid_c
            c_optimal = mid_c
        else:
            low_c = mid_c
            c_optimal = mid_c

    c_optimal = float(round(c_optimal, 4))
    mu_theta_optimal = base_mu_theta * (c_base / c_optimal)

    # Final curve
    final_rvs = dict(rv_config or {})
    final_rvs['theta_R'] = {'bias': mu_theta_optimal, 'cov': cov_theta, 'dist': dist_theta}
    final_params = dict(model_params)
    final_params['C'] = c_optimal

    final_curve = calculate_beta_vs_load_ratio(
        sec,
        final_params,
        rv_config=final_rvs,
        chi_values=list((chi_weights or {0.15: 0.15, 0.25: 0.25, 0.35: 0.30, 0.50: 0.20, 0.65: 0.10}).keys()),
        code_design='PROPOSED'
    )
    final_beta = eval_c_beta(c_optimal)
    reached_target = bool(abs(final_beta - target_beta) <= 0.10)

    return {
        "target_beta": float(target_beta),
        "fixed_gamma_v": float(gamma_v),
        "optimal_C": float(round(c_optimal, 4)),
        "resulting_mean_theta_R": float(round(mu_theta_optimal, 4)),
        "cov_theta_R": float(round(cov_theta, 4)),
        "avg_beta": float(round(final_beta, 3)),
        "reached_target": reached_target,
        "curve": final_curve,
    }


def compare_all_codes_reliability(section_nom, model_params, rv_config=None, chi_values=None):
    """
    Compares reliability curves beta(chi) across multiple design codes:
    Proposed Empirical Formula, NBR 6118:2023, Eurocode 2:2023, ACI 318-19.
    """
    codes = [
        {"key": "PROPOSED", "label": "Nova Proposta (Tese)", "color": "#06b6d4"},
        {"key": "NBR6118", "label": "ABNT NBR 6118:2023", "color": "#3b82f6"},
        {"key": "EC2_2023", "label": "Eurocode 2 (2023)", "color": "#10b981"},
        {"key": "ACI318", "label": "ACI 318-19", "color": "#f97316"},
    ]

    if chi_values is None:
        chi_values = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70]

    series_data = {}
    for code in codes:
        curve = calculate_beta_vs_load_ratio(section_nom, model_params, rv_config=rv_config, chi_values=chi_values, code_design=code["key"])
        series_data[code["key"]] = {
            "label": code["label"],
            "color": code["color"],
            "points": curve,
            "avg_beta": float(round(np.mean([p["beta"] for p in curve]), 3)),
        }

    return {
        "chi_values": chi_values,
        "codes": series_data,
        "target_beta": 3.80,
    }


def extract_theta_r_from_database(model_params, subset_key="ALL DATA", exclude_pc=False, arch_correction=None, slender_only=None):
    """
    Extracts empirical model error theta_R statistics (mean and COV of V_test / V_calc)
    directly from the active 1804+ shear experimental dataset.
    
    Supports:
    - Normative arch action correction (Item 17.4.1.2.1 NBR 6118 / EC2: beta_arco = 2.0 / (a/d) for a/d <= 2.0)
    - Slender beam filtering (a/d >= 2.45)
    - Original NBR scale factor k = max(1.6 - d_m, 1.0) when use_deff is False
    """
    from backend.calculators.interactive_shear import get_all_codes_dataset, is_row_in_subset

    rows = get_all_codes_dataset()
    if isinstance(rows, dict) and "error" in rows:
        return {"mean": 1.05, "cov": 0.16, "samples": 0}

    from backend.calculators.shear_batch_exporter import compute_shear_model_prediction

    delta_val = float(model_params.get('delta', 0.0) or 0.0)
    
    # Arch correction resolution:
    if arch_correction is not None:
        apply_arch = bool(arch_correction)
    elif 'arch_correction' in model_params and model_params['arch_correction'] is not None:
        apply_arch = bool(model_params['arch_correction'])
    else:
        # Normative models or delta == 0: arch effect (Item 17.4.1.2.1 NBR / EC2) applies automatically
        apply_arch = bool(abs(delta_val) < 1e-4 or model_params.get('code_preset') in ['NBR6118', 'EC2_2023', 'ACI318'])

    if slender_only is None:
        apply_slender = bool(model_params.get('slender_only', False))
    else:
        apply_slender = bool(slender_only)

    use_nbr_scale = bool(model_params.get('use_nbr_scale', False) or model_params.get('code_preset') == 'NBR6118' or
                         (abs(float(model_params.get('C', 0.0) or 0.0) - 0.120) < 0.005 and abs(float(model_params.get('gamma', 0.0) or 0.0) - 0.667) < 0.01))

    calc_params = dict(model_params)
    calc_params['arch_correction'] = apply_arch
    calc_params['slender_only'] = apply_slender
    calc_params['use_nbr_scale'] = use_nbr_scale

    filtered = [r for r in rows if is_row_in_subset(r, subset_key, exclude_pc=exclude_pc)]
    ratios = []

    is_nbr_preset = bool(model_params.get('code_preset') == 'NBR6118' or model_params.get('is_nbr6118', False) or
                         ((abs(float(model_params.get('C', 0.0) or 0.0) - 0.075) < 0.005 or abs(float(model_params.get('C', 0.0) or 0.0) - 0.120) < 0.005) and abs(float(model_params.get('gamma', 0.0) or 0.0) - 0.667) < 0.01 and abs(float(model_params.get('delta', 0.0) or 0.0)) < 0.001))

    for r in filtered:
        if is_nbr_preset:
            try:
                bd = float(r.get('d (mm)') or 0.0)
                bbw = float(r.get('bw (mm)') or r.get('b (mm)') or 0.0)
                if bbw <= 0 and bd > 0:
                    bwd_ratio = float(r.get('bw/d ratio') or 0.0)
                    if bwd_ratio > 0:
                        bbw = bwd_ratio * bd
                brho = float(r.get('pw (%)') or (r.get('rho', 0.0) * 100.0 if r.get('rho') is not None else 0.0)) / 100.0
                fck = float(r.get('fck (MPa)') or r.get('fck_eq') or 0.0)
                vt = float(r.get('Vu (kN)') or r.get('V_test') or 0.0)
                ba_d = float(r.get('a_d') or 0.0)
                if ba_d <= 0:
                    ba_mm = float(r.get('a_cs') or (float(r.get('a:M/V (mm)') or 0.0) * 1000.0))
                    if ba_mm > 0 and bd > 0:
                        ba_d = ba_mm / bd
                if not (bd > 0 and bbw > 0 and brho > 0 and fck > 0 and vt > 0 and ba_d > 0):
                    continue
                if apply_slender and ba_d < 2.45:
                    continue
                raw_sig = r.get('Sigma_CP') if r.get('Sigma_CP') is not None else r.get('Sigma_CP.1')
                sig_cp = max(0.0, float(raw_sig or 0.0))
                
                # Base nominal capacity (fctm, without 0.70 or gamma_c, matching limit state g(X))
                fck_eff = min(fck, 50.0)
                fctm = 0.3 * (fck_eff ** (2/3))
                tau_r = 0.25 * fctm
                d_m = bd / 1000.0
                k_nbr = max(1.0, 1.6 - d_m)
                rho_1 = min(0.02, brho)
                sig = min(sig_cp, 0.2 * fck)
                v_calc = (tau_r * k_nbr * (1.2 + 40.0 * rho_1) + 0.15 * sig) * bbw * bd / 1000.0

                if apply_arch and ba_d > 0 and ba_d <= 2.0:
                    v_calc *= (2.0 / max(0.5, ba_d))

                if v_calc > 0:
                    ratios.append(vt / v_calc)
            except Exception:
                continue
        else:
            pred = compute_shear_model_prediction(r, calc_params)
            if pred and pred.get('ratio') is not None:
                val = float(pred['ratio'])
                if np.isfinite(val) and val > 0:
                    ratios.append(val)

    if len(ratios) < 5:
        return {"mean": 1.05, "cov": 0.16, "samples": len(ratios), "arch_correction": apply_arch, "slender_only": apply_slender}

    ratios_arr = np.array(ratios)
    mean_val = float(np.mean(ratios_arr))
    std_val = float(np.std(ratios_arr, ddof=1))
    cov_val = float(std_val / mean_val) if mean_val > 0 else 0.16

    return {
        "mean": float(round(mean_val, 4)),
        "std": float(round(std_val, 4)),
        "cov": float(round(cov_val, 4)),
        "samples": len(ratios),
        "subset": subset_key,
        "arch_correction": bool(apply_arch),
        "slender_only": bool(apply_slender),
    }


def generate_latex_reliability_table(form_res, section_nom, model_params):
    """
    Generates a professional LaTeX booktabs table ready to be copied into the user's master's thesis.
    """
    dp_x = form_res.get("design_point_X", {})
    sens = form_res.get("sensitivity_pct", {})
    beta = form_res.get("beta", 3.80)
    pf = form_res.get("pf", 1e-4)
    des_vals = form_res.get("design_values") or {}
    g_k = float(des_vals.get("G_k", 0.0))
    q_k = float(des_vals.get("Q_k", 0.0))

    fck = float(section_nom.get("fck", 30.0))
    bw = float(section_nom.get("bw", 250.0))
    d = float(section_nom.get("d", 400.0))
    rho = float(section_nom.get("rho", 0.012))
    sigma_cp = float(section_nom.get("sigma_cp", 0.0) or model_params.get("sigma_cp", 0.0))
    is_pc = bool(section_nom.get("is_pc", False) or sigma_cp > 0)
    mu_param = float(model_params.get("mu", 0.15))

    c_p = float(model_params.get("C", 1.25))
    a_p = float(model_params.get("alpha", 0.333))
    b_p = float(model_params.get("beta", 0.333))
    g_p = float(model_params.get("gamma", 0.333))
    d_p = float(model_params.get("delta", -0.75))
    use_deff = bool(model_params.get("use_deff", False) or section_nom.get("use_deff", False))
    deff_str = "d_{eff}" if use_deff else "d"
    pc_term = f" + {mu_param:.2f} \\sigma_{{cp}}" if (is_pc and sigma_cp > 0) else ""

    pc_row = ""
    if is_pc and sigma_cp > 0:
        pc_row = f"Tensão de Protensão ($\\sigma_{{cp}}$) & Constante/Nominal & {sigma_cp:.2f} MPa & - & {sigma_cp:.2f} MPa & (Contribuição $\\mu = {mu_param:.2f}$) \\\\\n"

    latex_code = f"""% Tabela de Confiabilidade Estrutural gerada automaticamente para a Tese de Mestrado (TESE-LMFB.tex)
% Modelo Proposto Calibrado: V_calc = [ {c_p:.3f} (d_{{dg}}/{deff_str})^{{{a_p:.3f}}} (100\\rho_w)^{{{b_p:.3f}}} f_{{ck}}^{{{g_p:.3f}}} (a/d)^{{{d_p:.3f}}}{pc_term} ] b_w d
\\begin{{table}}[htbp]
\\centering
\\caption{{Análise de Confiabilidade Estrutural pelo Método FORM (Ruptura por Cisalhamento)}}
\\label{{tab:confiabilidade_cisalhamento}}
\\begin{{tabular}}{{lccccc}}
\\toprule
\\textbf{{Variável Aleatória}} & \\textbf{{Distribuição}} & \\textbf{{Média}} & \\textbf{{COV}} & \\textbf{{Ponto de Projeto ($X^*$)}} & \\textbf{{Sensibilidade ($\\alpha_i^2$)}} \\\\
\\midrule
Resistência do Concreto ($f_c$) & Lognormal & {fck * 1.15:.1f} MPa & 17\\% & {dp_x.get('fc', 0):.2f} MPa & {sens.get('fc', 0):.1f}\\% \\\\
Largura da Alma ($b_w$) & Normal & {bw:.0f} mm & 3\\% & {dp_x.get('bw', 0):.1f} mm & {sens.get('bw', 0):.1f}\\% \\\\
Altura Útil ($d$) & Normal & {d * 0.99:.0f} mm & 4\\% & {dp_x.get('d', 0):.1f} mm & {sens.get('d', 0):.1f}\\% \\\\
Taxa de Armadura ($\\rho_w$) & Normal & {rho * 100.0:.2f}\\% & 4\\% & {dp_x.get('rho', 0)*100.0:.3f}\\% & {sens.get('rho', 0):.1f}\\% \\\\
{pc_row}Incerteza do Modelo ($\\theta_R$) & Lognormal & 1.00 & 15\\% & {dp_x.get('theta_R', 0):.3f} & {sens.get('theta_R', 0):.1f}\\% \\\\
Carga Permanente ($G$) & Normal & {g_k * 1.05:.1f} kN & 9\\% & {dp_x.get('G', 0):.1f} kN & {sens.get('G', 0):.1f}\\% \\\\
Carga Acidental ($Q$) & Gumbel & {q_k * 0.70:.1f} kN & 25\\% & {dp_x.get('Q', 0):.1f} kN & {sens.get('Q', 0):.1f}\\% \\\\
\\midrule
\\multicolumn{{6}}{{l}}{{\\textbf{{Índice de Confiabilidade ($\\beta$):}} {beta:.3f} \\quad \\textbf{{Probabilidade de Falha ($P_f$):}} {pf:.2e}}} \\\\
\\multicolumn{{6}}{{l}}{{\\textbf{{Índice Alvo Preconizado ($\\beta_{{\\text{{alvo}}}}$):}} 3.80 (Ruptura Frágil / NBR 6118 / JCSS)}} \\\\
\\bottomrule
\\end{{tabular}}
\\end{{table}}
"""
    return latex_code
