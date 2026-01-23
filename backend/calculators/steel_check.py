import math
from ..database import db

# --- Constants ---
AISC_PHI = {
    'Mn': 0.90, 'Vn': 0.90, 'Pn': 0.90, 'Tn': 0.90
}
AISC_OMEGA = {
    'Mn': 1.67, 'Vn': 1.67, 'Pn': 1.67, 'Tn': 1.67
}

def get_factor(method, limit_state, global_fos=None):
    """Returns factor for report (phi or 1/omega)"""
    if global_fos is not None:
        try:
            fos = float(global_fos)
            if fos > 0:
                if method == 'LRFD': return 1.0/fos
                return 1.0/fos # For Display? No.
                # Standard: LRFD phi = 1/FOS. ASD omega = FOS.
                # get_factor returns the MULTIPLIER to Nominal.
                # LRFD: phi*Rn. Multiplier = 1/FOS.
                # ASD: Rn/Omega = Rn * (1/Omega). Multiplier = 1/FOS.
                # So if FOS=2, Multiplier is 0.5.
                # Wait, Existing get_factor for ASD returns 1.0/Omega.
                # So yes, return 1.0/fos regardless of method if FOS is applied as Safety Factor.
                return 1.0/fos
        except:
             pass

    phi = AISC_PHI.get(limit_state, 0.9)
    omega = AISC_OMEGA.get(limit_state, 1.67)
    if method == 'LRFD':
        return phi
    return 1.0 / omega

class SteelChecker:
    def __init__(self):
        pass

    def check_flexure(self, props, inputs):
        """
        Check flexural strength per AISC F.
        """
        method = inputs.get('design_method', 'ASD')
        fy = float(inputs.get('Fy', 50))
        E = 29000.0
        
        # Unpack essential props
        zx = float(props.get('Zx', 0))
        sx = float(props.get('Sx', 0))
        lb = float(inputs.get('Lb_input', 0)) * 12.0 # ft -> in
        cb = float(inputs.get('Cb', 1.0))
        
        # LTB Constants
        ry = float(props.get('ry', 0))
        rts = float(props.get('rts', ry)) # Fallback
        j = float(props.get('J', 0))
        ho = float(props.get('ho', 0))
        if ho == 0: ho = props.get('d', 0) - props.get('tf', 0)
        
        # 1. Yielding
        mp = fy * zx
        
        # 2. LTB
        # Lp
        lp = 1.76 * ry * math.sqrt(E / fy)
        
        # Lr
        c = 1.0
        term1 = (j * c) / (sx * ho) if sx*ho > 0 else 0
        lr = 0
        if term1 > 0:
            term2 = term1**2 + 6.76 * ((0.7 * fy / E)**2)
            lr = 1.95 * rts * (E / (0.7 * fy)) * math.sqrt(term1 + math.sqrt(term2))
        else:
            lr = 99999 # Safe large number
            
        mn = 0
        if lb <= lp:
            mn = mp
        elif lb <= lr:
            mn = cb * (mp - (mp - 0.7*fy*sx) * ((lb - lp)/(lr - lp)))
            mn = min(mn, mp)
        else:
            fcr = (cb * math.pi**2 * E) / ((lb / rts)**2) * math.sqrt(1 + 0.078 * term1 * ((lb / rts)**2))
            mn = fcr * sx
            mn = min(mn, mp)
            
        # Design Strength
        factor = get_factor(method, 'Mn', inputs.get('global_fos'))
        phi_mn = mn * factor
        
        return {
            'phiMn': phi_mn / 12.0, # k-ft
            'Mn': mn / 12.0,
            'Lp': lp / 12.0,
            'Lr': lr / 12.0
        }

    def check_compression(self, props, inputs):
        """
        Check compressive strength per AISC E.
        """
        method = inputs.get('design_method', 'ASD')
        fy = float(inputs.get('Fy', 50))
        E = 29000.0
        ag = float(props.get('Ag', 0))
        
        k = float(inputs.get('K', 1.0))
        lb = float(inputs.get('Lb_input', 0)) * 12.0
        rx = float(props.get('rx', 1.0))
        ry = float(props.get('ry', 1.0))
        
        # KL/r
        kl_r_x = (k * lb) / rx if rx > 0 else 999
        kl_r_y = (k * lb) / ry if ry > 0 else 999
        lc_r = max(kl_r_x, kl_r_y)
        
        fe = (math.pi**2 * E) / (lc_r**2)
        
        if lc_r <= 4.71 * math.sqrt(E / fy):
            fcr = (0.658 ** (fy / fe)) * fy
        else:
            fcr = 0.877 * fe
            
        pn = fcr * ag
        factor = get_factor(method, 'Pn', inputs.get('global_fos'))
        
        return {
            'phiPn': pn * factor,
            'phiPn_or_Pn_omega': pn * factor,
            'Pn': pn,
            'Fcr': fcr,
            'KL_r_max': lc_r
        }

    def check_shear(self, props, inputs):
        """
        Check shear strength per AISC G.
        """
        method = inputs.get('design_method', 'ASD')
        fy = float(inputs.get('Fy', 50))
        E = 29000.0
        
        d = float(props.get('d', 0))
        tw = float(props.get('tw', 0))
        aw = d * tw
        
        # AISC G2.1
        # For rolled I-shapes check h/tw
        # h/tw approximated by d/tw or (d-2k)/tw (h/tw used for Cv)
        h_tw = d / tw if tw > 0 else 0
        
        cv = 1.0
        # Reduced Cv if slender web, but for most rolled shapes Cv=1.0 per G2.1(b)(i)
        # Simplified:
        if h_tw <= 2.24 * math.sqrt(E / fy):
             cv = 1.0
        else:
             # G2.1(b)(ii)
             # Basic implementation
             kv = 5.0
             if h_tw <= 1.10 * math.sqrt(kv * E / fy):
                 cv = 1.0
             elif h_tw <= 1.37 * math.sqrt(kv * E / fy):
                 cv = 1.10 * math.sqrt(kv * E / fy) / h_tw
             else:
                 cv = 1.51 * E * kv / (h_tw**2 * fy)
                 
        vn = 0.6 * fy * aw * cv
        factor = get_factor(method, 'Vn', inputs.get('global_fos'))
        
        return {
            'phiVn': vn * factor, # kips
            'Vn': vn,
            'Av': aw,
            'phiVn_or_Vn_omega': vn * factor,
            'governing_limit_state': 'Shear Yielding',
            'h_tw': h_tw,
            'Cv': cv
        }

    def check_tension(self, props, inputs):
        """AISC D2/J4"""
        method = inputs.get('design_method', 'ASD')
        fy = float(inputs.get('Fy', 50))
        fu = float(inputs.get('Fu', 65))
        ag = float(props.get('Ag', 0))
        # Simplified: Assumes Ae = Ag for now as in basic tools, unless An provided
        ae = float(inputs.get('An_net', ag))
        
        # Yielding
        pn_yield = fy * ag
        # Rupture
        pn_rupture = fu * ae
        
        factor_y = get_factor(method, 'Pn', inputs.get('global_fos')) # 0.9 / 1.67
        # Rupture uses 0.75 / 2.00
        if inputs.get('global_fos'):
            factor_r = 1.0 / float(inputs.get('global_fos'))
        else:
            phi_rupture = 0.75
            omega_rupture = 2.00
            factor_r = phi_rupture if method == 'LRFD' else 1.0/omega_rupture
        
        cap_y = pn_yield * factor_y
        cap_r = pn_rupture * factor_r
        
        phi_pn = min(cap_y, cap_r)
        
        return {
            'phiPn_or_Pn_omega': phi_pn,
            'governing_limit_state': 'Yielding' if cap_y < cap_r else 'Rupture',
            'details': {
                'yield': {'Pn': pn_yield, 'capacity': cap_y},
                'rupture': {'Ae': ae, 'Pn': pn_rupture, 'capacity': cap_r}
            }
        }

    def check_flexure_minor_axis(self, props, inputs):
        """AISC F6 (Weak Axis Yielding)"""
        method = inputs.get('design_method', 'ASD')
        fy = float(inputs.get('Fy', 50))
        sy = float(props.get('Sy', 0))
        zy = float(props.get('Zy', 0))
        
        mp = fy * zy
        my = fy * sy
        mn = min(mp, 1.6 * my)
        
        factor = get_factor(method, 'Mn', inputs.get('global_fos'))
        return {
             'phiMny_or_Mny_omega': mn * factor / 12.0, # k-ft
             'Mny': mn,
             'governing_limit_state': 'Yielding'
        }

    def check_torsion(self, props, inputs):
        """Placeholder/Simplified Torsion"""
        # JS version returns simplified structure often just saying "See DG9" for I-shapes
        # For HSS it calculates T per H3.1
        # Implementing basic placeholder to prevent errors
        return {
            'phiTn_or_Tn_omega': 9999, # High default
            'applicable': False,
            'reference': 'AISC Design Guide 9'
        }

    def check_interaction(self, inputs, props, axial_res, flex_maj, flex_min):
        """AISC H1.1"""
        pr = abs(float(inputs.get('Pu_or_Pa', 0)))
        pc = float(axial_res.get('phiPn_or_Pn_omega', 1e-9))
        mr_x = abs(float(inputs.get('Mux_or_Max', 0)))
        mc_x = float(flex_maj.get('phiMn_or_Mn_omega', 1e-9))
        mr_y = abs(float(inputs.get('Muy_or_May', 0)))
        mc_y = float(flex_min.get('phiMny_or_Mny_omega', 1e-9))
        
        if pc == 0: pc = 1e-9
        if mc_x == 0: mc_x = 1e-9
        if mc_y == 0: mc_y = 1e-9
        
        ratio = 0
        eq = ""
        
        if pr/pc >= 0.2:
            ratio = pr/pc + 8.0/9.0 * (mr_x/mc_x + mr_y/mc_y)
            eq = "H1-1a"
        else:
            ratio = pr/(2*pc) + (mr_x/mc_x + mr_y/mc_y)
            eq = "H1-1b"
            
        return {
            'ratio': ratio,
            'equation': eq,
            'details': {'B1x': 1.0, 'B1y': 1.0} # Simplified, JS calculates B1
        }
        
    def get_section_properties(self, inputs):
        """Parses inputs to get properties, similar to JS helper."""
        # In this backend context, inputs likely already contain some properties or need parsing
        # Replicating JS logic:
        props = {
            'type': inputs.get('section_type', ''),
            'd': float(inputs.get('d', 0)),
            'bf': float(inputs.get('bf', 0)),
            'tf': float(inputs.get('tf', 0)),
            'tw': float(inputs.get('tw', 0)),
            'Ag': float(inputs.get('Ag_manual', 0)),
            'Ix': float(inputs.get('I_manual', 0)),
            'Sx': float(inputs.get('Sx_manual', 0)),
            'Zx': float(inputs.get('Zx_manual', 0)),
            'Iy': float(inputs.get('Iy_manual', 0)),
            'Sy': float(inputs.get('Sy_manual', 0)),
            'Zy': float(inputs.get('Zy_manual', 0)),
            'ry': float(inputs.get('ry_manual', 0)),
            'rts': float(inputs.get('rts_manual', 0)),
            'J': float(inputs.get('J_manual', 0)),
            'Cw': float(inputs.get('Cw_manual', 0)),
            'k_des': float(inputs.get('k_des', 0)) or float(inputs.get('tf', 0)),
        }
        # Derived
        props['h'] = props['d'] - 2*props['k_des']
        if props['Ag'] > 0 and props['Ix'] > 0:
             props['rx'] = math.sqrt(props['Ix'] / props['Ag'])
        else:
             props['rx'] = 0
             
        # rts recalc if missing for I-shapes
        if (props['rts'] == 0) and props['type'].endswith('Shape'):
             if props['bf'] > 0 and props['Sx'] > 0:
                 iy = props['Iy']
                 cw = props['Cw']
                 # Simple approx if Cw missing? JS uses Cw. 
                 # For now assume inputs provided correct values or user manual entry.
                 pass 
        
        return props


    def run(self, inputs):
        """Main entry point simulating steel check.js run()"""
        
        # --- Batch Processing ---
        batch_loads = inputs.get('batch_loads')
        if batch_loads and isinstance(batch_loads, list):
            results = []
            base_inputs = inputs.copy()
            if 'batch_loads' in base_inputs:
                del base_inputs['batch_loads']
            
            for case in batch_loads:
                if not isinstance(case, dict): continue
                case_input = base_inputs.copy()
                case_input.update(case)
                try:
                    res = self.run(case_input)
                    results.append(res)
                except Exception as e:
                    import traceback
                    results.append({"error": str(e), "trace": traceback.format_exc()})
            return results
            
        inputs = inputs.copy() # Avoid mutating original
        # Parse basic numerics
        inputs['Fy'] = float(inputs.get('Fy', 0))
        inputs['Fu'] = float(inputs.get('Fu', 0))
        inputs['Pu_or_Pa'] = float(inputs.get('Pu_or_Pa', 0))
        inputs['Mux_or_Max'] = float(inputs.get('Mux_or_Max', 0))
        inputs['Muy_or_May'] = float(inputs.get('Muy_or_May', 0))
        inputs['Vu_or_Va'] = float(inputs.get('Vu_or_Va', 0))
        inputs['Tu_or_Ta'] = float(inputs.get('Tu_or_Ta', 0))
        
        props = self.get_section_properties(inputs)
        
        shear_res = self.check_shear(props, inputs)
        flex_min_res = self.check_flexure_minor_axis(props, inputs)
        torsion_res = self.check_torsion(props, inputs)
        
        axial_res = {}
        if inputs['Pu_or_Pa'] > 0:
             axial_res = self.check_tension(props, inputs)
             axial_res['type'] = 'Tension'
        elif inputs['Pu_or_Pa'] < 0:
             axial_res = self.check_compression(props, inputs)
             axial_res['type'] = 'Compression'
             
        flex_res = self.check_flexure(props, inputs)
        # Add keys for JS compatibility
        flex_res['phiMn_or_Mn_omega'] = flex_res['phiMn'] # Already in k-ft in check_flexure? check_flexure returns phiMn (k-ft)
        
        # Interaction
        interaction_res = {}
        if inputs['Pu_or_Pa'] < 0 and (inputs['Mux_or_Max'] != 0 or inputs['Muy_or_May'] != 0):
             interaction_res = self.check_interaction(inputs, props, axial_res, flex_res, flex_min_res)
             
        return {
            'inputs': inputs,
            'properties': props,
            'warnings': [],
            'errors': [],
            'flexure': flex_res,
            'flexure_y': flex_min_res,
            'shear': shear_res,
            'axial': axial_res,
            'interaction': interaction_res,
            'web_crippling': {'applicable': False}, # Stub
            'web_sidesway_buckling': {'applicable': False}, # Stub
            'torsion': torsion_res,
            'shear_torsion_interaction': {'applicable': False}, # Stub
            'combined_stress_H33': {'applicable': False}, # Stub
            'deflection': {} # Stub
        }

# Global instance
steel_checker = SteelChecker()
