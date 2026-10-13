"""
Structural Reliability & Partial Safety Factor Calibration Module for Shear Design
Teoria da Confiabilidade Estrutural aplicada a vigas e lajes de concreto armado sob esforço cortante.
Implementa FORM (Hasofer-Lind & Rackwitz-Fiessler), Simulação de Monte Carlo,
análise de sensibilidade (diretores de cosseno alpha_i^2) e calibração de coeficientes parciais de segurança (gamma_v).
"""

import math
import numpy as np
from scipy import stats
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
        # NBR 6118:2023 formulation for slabs and members without transverse reinforcement
        # fctm = 0.3 * fck^(2/3) (fck <= 50)
        fctm = 0.3 * (fc ** (2/3)) if fc <= 50 else 2.12 * math.log(1.0 + 0.11 * fc)
        fctk_inf = 0.7 * fctm
        tau_r = 0.25 * fctk_inf
        k = 1.0 + math.sqrt(200.0 / d) if d > 0 else 1.0
        k = min(2.0, k)
        rho_1 = min(0.02, rho)
        v_c = tau_r * k * (1.2 + 40.0 * rho_1) * bw * d
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

        # 1. Calculate design resistance V_Rd according to chosen code
        if self.code_design == 'PROPOSED':
            # Nominal/characteristic prediction
            v_rk = calculate_empirical_shear_capacity(fck, bw, d, rho, ad, ddg, self.params)
            v_rd = v_rk / gamma_v
        else:
            v_rk = calculate_code_shear_capacity(self.code_design, fck, bw, d, rho, ad, ddg)
            v_rd = v_rk / gamma_v

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
        """Limit state function in physical space: g(X) = R - S."""
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

        # Calculate resistance
        if self.code_design == 'PROPOSED':
            v_r = calculate_empirical_shear_capacity(fc, bw, d, rho, ad, ddg, self.params)
        else:
            v_r = calculate_code_shear_capacity(self.code_design, fc, bw, d, rho, ad, ddg)

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

    def run_monte_carlo(self, n_samples=50000, seed=42):
        """
        Executes direct Monte Carlo Simulation (MCS) to validate FORM.
        Returns Pf_mc, beta_mc, and 95% confidence interval.
        """
        rng = np.random.default_rng(seed)
        n_vars = len(self.var_keys)

        # Generate standard normal samples
        u_samples = rng.standard_normal((n_samples, n_vars))

        failures = 0
        for i in range(n_samples):
            u_i = u_samples[i, :]
            if self.limit_state_g_U(u_i) <= 0:
                failures += 1

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


def calibrate_optimal_gamma_v(section_nom, model_params, target_beta=3.80, rv_config=None, chi_weights=None):
    """
    Inverse calibration of partial safety factor gamma_v to attain target reliability index beta_target.
    Optimizes: min (sum_chi w_chi * (beta(chi, gamma_v) - beta_target)^2).
    """
    if chi_weights is None:
        # Standard calibration load distribution weights (JCSS / Beck et al.)
        chi_weights = {
            0.15: 0.15,
            0.25: 0.25,
            0.35: 0.30,
            0.50: 0.20,
            0.65: 0.10,
        }

    def objective(gamma_val):
        sse = 0.0
        for chi, weight in chi_weights.items():
            sec = dict(section_nom)
            sec["chi"] = chi
            sec["gamma_v"] = gamma_val
            sra = StructuralReliabilityAnalysis(sec, model_params, rv_config=rv_config, code_design='PROPOSED')
            form_res = sra.run_form()
            diff = form_res["beta"] - target_beta
            sse += weight * (diff ** 2)
        return sse

    # Bounded scalar optimization for gamma_v in [1.10, 2.00]
    opt_res = minimize_scalar(objective, bounds=(1.10, 2.00), method='bounded')
    gamma_optimal = float(opt_res.x)

    # Evaluate beta curve with optimal gamma_v
    final_curve = calculate_beta_vs_load_ratio(
        {**section_nom, "gamma_v": gamma_optimal},
        model_params,
        rv_config=rv_config,
        chi_values=list(chi_weights.keys()),
        code_design='PROPOSED'
    )
    avg_beta = float(np.mean([pt["beta"] for pt in final_curve]))

    return {
        "target_beta": float(target_beta),
        "optimal_gamma_v": float(round(gamma_optimal, 3)),
        "recommended_standard_gamma": float(round(math.ceil(gamma_optimal * 20.0) / 20.0, 2)),  # Round up to nearest 0.05
        "avg_beta": float(round(avg_beta, 3)),
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


def extract_theta_r_from_database(model_params, subset_key="ALL DATA", exclude_pc=False):
    """
    Extracts empirical model error theta_R statistics (mean and COV of V_test / V_calc)
    directly from the active 1804+ shear experimental dataset.
    """
    from backend.calculators.interactive_shear import get_all_codes_dataset, is_row_in_subset

    rows = get_all_codes_dataset()
    if isinstance(rows, dict) and "error" in rows:
        return {"mean": 1.05, "cov": 0.16, "samples": 0}

    filtered = [r for r in rows if is_row_in_subset(r, subset_key, exclude_pc=exclude_pc)]
    ratios = []

    for r in filtered:
        try:
            v_test = float(r.get("Vu (kN)") or 0.0)
            fc_raw = r.get("fck (MPa)") if r.get("fck (MPa)") is not None else r.get("fck_eq")
            fc = float(fc_raw or 0.0)
            d = float(r.get("d (mm)") or 0.0)
            bw_raw = r.get("bw (mm)") if r.get("bw (mm)") is not None else r.get("b (mm)")
            bw = float(bw_raw or 0.0)
            rho = float(r.get("pw (%)") or 0.0) / 100.0
            ad = float(r.get("a_d") or 3.0)
            ddg = float(r.get("d_dg") or 32.0)
        except (ValueError, TypeError):
            continue

        if v_test > 0 and fc > 0 and d > 0 and bw > 0 and rho > 0:
            v_calc = calculate_empirical_shear_capacity(fc, bw, d, rho, ad, ddg, model_params)
            if v_calc > 0:
                ratios.append(v_test / v_calc)

    if len(ratios) < 5:
        return {"mean": 1.05, "cov": 0.16, "samples": len(ratios)}

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

    latex_code = f"""% Tabela de Confiabilidade Estrutural gerada automaticamente para a Tese de Mestrado
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
Incerteza do Modelo ($\\theta_R$) & Lognormal & 1.00 & 15\\% & {dp_x.get('theta_R', 0):.3f} & {sens.get('theta_R', 0):.1f}\\% \\\\
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
