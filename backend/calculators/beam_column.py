import math
from ..database import db

# --- Constants & Tables ---
AISC_PHI = {
    'yield': 0.90, 'rupture': 0.75, 'shear': 0.75, 'bearing': 0.75, 'block_shear': 0.75, 'weld': 0.75, 'compression': 0.90
}
AISC_OMEGA = {
    'yield': 1.67, 'rupture': 2.00, 'shear': 2.00, 'bearing': 2.00, 'block_shear': 2.00, 'weld': 2.00, 'compression': 1.67
}

def get_design_factors(inputs, aisc_phi, aisc_omega):
    jurisdiction = inputs.get('jurisdiction')
    fos_val = inputs.get('global_fos')
    try:
        if fos_val is not None:
            fos = float(fos_val)
            if fos > 0:
                return {'phi': 1.0/fos, 'omega': fos}
    except (TypeError, ValueError):
        pass
    if str(jurisdiction).strip().upper() == 'OSHA':
        return {'phi': 0.25, 'omega': 4.0}
    return {'phi': aisc_phi, 'omega': aisc_omega}

class BeamColumnCalculator:
    def __init__(self):
        pass

    def run(self, inputs):
        self.inputs = inputs
        self.method = inputs.get('design_method', 'LRFD')
        
        self.load_v = inputs.get('load_v', 0)
        self.load_m = inputs.get('load_m', 0)
        
        results = {
            'status': 'success',
            'checks': {
                'Shear Connection': [],
                'Moment Connection': [],
            }
        }
        
        self.calc_shear_connection(results['checks']['Shear Connection'])
        
        if inputs.get('include_moment'):
            self.calc_moment_connection(results['checks']['Moment Connection'])
            
        return results

    def add_check(self, category_list, name, capacity, demand, unit, notes="", steps=""):
        phi = 1.0; omega = 1.0
        if isinstance(capacity, dict):
            phi = capacity.get('phi', 1.0)
            omega = capacity.get('omega', 1.0)
            rn = capacity.get('Rn', 0)
        else:
            rn = capacity
            
        cap_val = (rn * phi) if self.method == 'LRFD' else (rn / omega)
        
        ratio = (demand / cap_val) if cap_val > 0 else 0
        status = "OK" if ratio <= 1.0 else "NG"
        
        category_list.append({
            'name': name,
            'capacity': cap_val,
            'demand': demand,
            'ratio': ratio,
            'status': status,
            'unit': unit,
            'notes': notes,
            'steps': steps
        })

    def calc_shear_connection(self, checks):
        beam = self.inputs.get('beam', {})
        col = self.inputs.get('col', {})
        beam_mat = self.inputs.get('beam_mat', {'Fy': 50, 'Fu': 65})
        col_mat = self.inputs.get('col_mat', {'Fy': 50, 'Fu': 65})
        
        db = self.inputs.get('db', 0.75)
        grade = self.inputs.get('bolt_grade', 'A325')
        
        plate_type = self.inputs.get('plate_type', 'Single')
        is_double = plate_type == 'Double'
        n_plates = 2 if is_double else 1
        
        t_ply = self.inputs.get('t_ply', 0.375)
        t_ply_total = self.inputs.get('t_ply_total', t_ply * n_plates)
        sp_width = self.inputs.get('sp_width', 5.0)
        sp_length = self.inputs.get('sp_length', 12.0)
        
        fy_ply = self.inputs.get('Fy_ply', 36)
        fu_ply = self.inputs.get('Fu_ply', 58)
        
        beam_conn = self.inputs.get('beam_conn_type', 'Bolted')
        col_conn = self.inputs.get('col_conn_type', 'Welded')
        
        v_demand = self.load_v
        
        # --- BEAM WEB CONNECTION ---
        if beam_conn == 'Bolted':
            rows = self.inputs.get('beam_bolt_rows', 4)
            spacing = self.inputs.get('beam_bolt_spacing', 3)
            num_planes = 2 if is_double else 1
            n_bolts = rows
            
            fnv_ab = self.get_bolt_shear_rn(grade, db)
            rn_bolt = fnv_ab * num_planes * n_bolts
            step_bolt = f"F<sub>nv</sub>A<sub>b</sub> = {fnv_ab:.2f} k<br>R<sub>n</sub> = F<sub>nv</sub>A<sub>b</sub> &times; N<sub>planes</sub> &times; N<sub>bolts</sub> = {fnv_ab:.2f} &times; {num_planes} &times; {n_bolts} = {rn_bolt:.2f} k"
            self.add_check(checks, "Bolt Shear (Beam Web)", {'Rn': rn_bolt, **get_design_factors(self.inputs, AISC_PHI['shear'], AISC_OMEGA['shear'])}, v_demand, "k", steps=step_bolt)
            
            beam_tw = beam.get('tw', 0)
            rn_brg_beam = self.get_bolt_bearing_group_rn(db, rows, spacing, beam_tw, beam_mat.get('Fu', 65), 1.5, False)
            step_brg_b = f"R<sub>n</sub> (group) calculated via J3.10 with L<sub>c</sub> edge=1.5\", spacing={spacing}\", t<sub>w</sub>={beam_tw:.3f}\", F<sub>u</sub>={beam_mat.get('Fu', 65)} ksi<br>R<sub>n</sub> = {rn_brg_beam:.2f} k"
            self.add_check(checks, "Bolt Bearing (Beam Web)", {'Rn': rn_brg_beam, **get_design_factors(self.inputs, AISC_PHI['bearing'], AISC_OMEGA['bearing'])}, v_demand, "k", steps=step_brg_b)
            
            rn_brg_plate = self.get_bolt_bearing_group_rn(db, rows, spacing, t_ply_total, fu_ply, 1.5, False)
            step_brg_p = f"R<sub>n</sub> (group) via J3.10 with L<sub>c</sub> edge=1.5\", spacing={spacing}\", total plate t={t_ply_total:.3f}\", F<sub>u</sub>={fu_ply} ksi<br>R<sub>n</sub> = {rn_brg_plate:.2f} k"
            self.add_check(checks, "Bolt Bearing (Shear Plate)", {'Rn': rn_brg_plate, **get_design_factors(self.inputs, AISC_PHI['bearing'], AISC_OMEGA['bearing'])}, v_demand, "k", steps=step_brg_p)
            
            rn_bs_plate = self.get_block_shear_rn(t_ply_total, sp_length, 1.5, rows, spacing, 1.5, db, fy_ply, fu_ply) * n_plates
            step_bs_p = f"Block Shear Rupture (J4.3)<br>R<sub>n</sub> per plate = {rn_bs_plate/n_plates:.2f} k<br>Total R<sub>n</sub> ({n_plates} plates) = {rn_bs_plate:.2f} k"
            self.add_check(checks, "Block Shear Rupture (Shear Plate)", {'Rn': rn_bs_plate, **get_design_factors(self.inputs, AISC_PHI['block_shear'], AISC_OMEGA['block_shear'])}, v_demand, "k", steps=step_bs_p)
            
            agv_beam = beam.get('d', 10) * beam_tw
            anv_beam = agv_beam - rows * (db + 0.125) * beam_tw
            rn_yield_beam = 0.6 * beam_mat.get('Fy', 50) * agv_beam
            step_vy_b = f"A<sub>gv</sub> = d &times; t<sub>w</sub> = {beam.get('d', 10)} &times; {beam_tw} = {agv_beam:.2f} in&sup2;<br>R<sub>n</sub> = 0.60 F<sub>y</sub> A<sub>gv</sub> = 0.60( {beam_mat.get('Fy', 50)} )({agv_beam:.2f}) = {rn_yield_beam:.2f} k"
            self.add_check(checks, "Beam Web Shear Yielding", {'Rn': rn_yield_beam, **get_design_factors(self.inputs, 1.0, 1.5)}, v_demand, "k", steps=step_vy_b)
            
            rn_rupt_beam = 0.6 * beam_mat.get('Fu', 65) * anv_beam
            step_vr_b = f"A<sub>nv</sub> = A<sub>gv</sub> - n(d<sub>b</sub>+1/8)t<sub>w</sub> = {anv_beam:.2f} in&sup2;<br>R<sub>n</sub> = 0.60 F<sub>u</sub> A<sub>nv</sub> = 0.60( {beam_mat.get('Fu', 65)} )({anv_beam:.2f}) = {rn_rupt_beam:.2f} k"
            self.add_check(checks, "Beam Web Shear Rupture", {'Rn': rn_rupt_beam, **get_design_factors(self.inputs, AISC_PHI['rupture'], AISC_OMEGA['rupture'])}, v_demand, "k", steps=step_vr_b)

        else:
            weld_size = self.inputs.get('beam_weld_size', 4)
            length = sp_length * (2 if is_double else 1) * 2 
            rn_weld = self.get_weld_shear_rn(weld_size, length, self.inputs.get('FEXX', 70))
            weld_t = (weld_size / 16.0) * 0.707
            step_w = f"Weld lines = {length / sp_length}, L = {sp_length}\"<br>t<sub>e</sub> = {weld_size}/16 &times; 0.707 = {weld_t:.3f}\"<br>R<sub>n</sub> = 0.60 F<sub>EXX</sub> t<sub>e</sub> L = 0.60({self.inputs.get('FEXX', 70)})({weld_t:.3f})({length}) = {rn_weld:.2f} k"
            self.add_check(checks, "Weld Shear (Beam Web)", {'Rn': rn_weld, **get_design_factors(self.inputs, AISC_PHI['weld'], AISC_OMEGA['weld'])}, v_demand, "k", steps=step_w)
            
        # --- PLATE SHEAR YIELDING & RUPTURE ---
        agv_plate = sp_length * t_ply_total
        rn_yield = 0.6 * fy_ply * agv_plate
        step_py = f"A<sub>gv</sub> = L &times; t<sub>total</sub> = {sp_length} &times; {t_ply_total:.3f} = {agv_plate:.2f} in&sup2;<br>R<sub>n</sub> = 0.60 F<sub>y</sub> A<sub>gv</sub> = 0.60({fy_ply})({agv_plate:.2f}) = {rn_yield:.2f} k"
        self.add_check(checks, "Plate Shear Yielding", {'Rn': rn_yield, **get_design_factors(self.inputs, 1.0, 1.5)}, v_demand, "k", steps=step_py)
        
        if beam_conn == 'Bolted':
            anv_plate = agv_plate - self.inputs.get('beam_bolt_rows', 4) * (db + 0.125) * t_ply_total
            rn_rupt = 0.6 * fu_ply * anv_plate
            step_pr = f"A<sub>nv</sub> = A<sub>gv</sub> - n(d<sub>hole</sub>)t = {anv_plate:.2f} in&sup2;<br>R<sub>n</sub> = 0.60 F<sub>u</sub> A<sub>nv</sub> = 0.60({fu_ply})({anv_plate:.2f}) = {rn_rupt:.2f} k"
            self.add_check(checks, "Plate Shear Rupture", {'Rn': rn_rupt, **get_design_factors(self.inputs, AISC_PHI['rupture'], AISC_OMEGA['rupture'])}, v_demand, "k", steps=step_pr)

        # --- COLUMN CONNECTION ---
        if col_conn == 'Bolted':
            rows = self.inputs.get('col_bolt_rows', 4)
            spacing = self.inputs.get('col_bolt_spacing', 3)
            n_bolts = rows * (2 if is_double else 1)
            num_planes = 1 
            
            fnv_ab = self.get_bolt_shear_rn(grade, db)
            rn_bolt = fnv_ab * num_planes * n_bolts
            step_cbs = f"F<sub>nv</sub>A<sub>b</sub> = {fnv_ab:.2f} k<br>R<sub>n</sub> = F<sub>nv</sub>A<sub>b</sub> &times; N<sub>planes</sub> &times; N<sub>bolts</sub> = {fnv_ab:.2f} &times; {num_planes} &times; {n_bolts} = {rn_bolt:.2f} k"
            self.add_check(checks, "Bolt Shear (Column Face)", {'Rn': rn_bolt, **get_design_factors(self.inputs, AISC_PHI['shear'], AISC_OMEGA['shear'])}, v_demand, "k", steps=step_cbs)
            
            col_tf = col.get('tf', 0)
            rn_brg_col = self.get_bolt_bearing_group_rn(db, rows, spacing, col_tf, col_mat.get('Fu', 65), 1.5, False) * (2 if is_double else 1)
            step_cbrg = f"R<sub>n</sub> calculated via J3.10 with L<sub>c</sub> edge=1.5\", spacing={spacing}\", column t<sub>f</sub>={col_tf:.3f}\", F<sub>u</sub>={col_mat.get('Fu', 65)} ksi<br>Total R<sub>n</sub> = {rn_brg_col:.2f} k"
            self.add_check(checks, "Bolt Bearing (Column Flange)", {'Rn': rn_brg_col, **get_design_factors(self.inputs, AISC_PHI['bearing'], AISC_OMEGA['bearing'])}, v_demand, "k", steps=step_cbrg)
            
        else:
            weld_size = self.inputs.get('col_weld_size', 4)
            length = sp_length * (2 if is_double else 2) 
            rn_weld = self.get_weld_shear_rn(weld_size, length, self.inputs.get('FEXX', 70))
            weld_t = (weld_size / 16.0) * 0.707
            step_cw = f"Weld length L = {length}\"<br>t<sub>e</sub> = {weld_size}/16 &times; 0.707 = {weld_t:.3f}\"<br>R<sub>n</sub> = 0.60 F<sub>EXX</sub> t<sub>e</sub> L = 0.60({self.inputs.get('FEXX', 70)})({weld_t:.3f})({length}) = {rn_weld:.2f} k"
            self.add_check(checks, "Weld Shear (Column Face)", {'Rn': rn_weld, **get_design_factors(self.inputs, AISC_PHI['weld'], AISC_OMEGA['weld'])}, v_demand, "k", steps=step_cw)

    def calc_moment_connection(self, checks):
        beam = self.inputs.get('beam', {})
        col = self.inputs.get('col', {})
        beam_mat = self.inputs.get('beam_mat', {'Fy': 50, 'Fu': 65})
        col_mat = self.inputs.get('col_mat', {'Fy': 50, 'Fu': 65})
        
        fp_thick = self.inputs.get('fp_thick', 0.75)
        fp_width = self.inputs.get('fp_width', 8.0)
        fp_fy = self.inputs.get('fp_Fy', 36)
        fp_fu = self.inputs.get('fp_Fu', 58)
        
        beam_d = beam.get('d', 10)
        m_demand_k_in = self.load_m * 12
        p_demand = m_demand_k_in / beam_d if beam_d > 0 else 0
        
        fp_type = self.inputs.get('fp_type', 'Plate')

        if fp_type == 'Plate':
            # --- FLANGE PLATE CHECKS ---
            ag_fp = fp_thick * fp_width
            rn_yield = fp_fy * ag_fp
            step_fy = f"A<sub>g</sub> = {fp_width} &times; {fp_thick} = {ag_fp:.2f} in&sup2;<br>R<sub>n</sub> = F<sub>y</sub> A<sub>g</sub> = {fp_fy} &times; {ag_fp:.2f} = {rn_yield:.2f} k"
            self.add_check(checks, "Flange Plate Tension Yielding", {'Rn': rn_yield, **get_design_factors(self.inputs, AISC_PHI['yield'], AISC_OMEGA['yield'])}, p_demand, "k", steps=step_fy)
            
            rn_rupt = fp_fu * ag_fp 
            step_fr = f"A<sub>n</sub> = {ag_fp:.2f} in&sup2; (assumed fully welded/uncoped net area)<br>R<sub>n</sub> = F<sub>u</sub> A<sub>n</sub> = {fp_fu} &times; {ag_fp:.2f} = {rn_rupt:.2f} k"
            self.add_check(checks, "Flange Plate Tension Rupture", {'Rn': rn_rupt, **get_design_factors(self.inputs, AISC_PHI['rupture'], AISC_OMEGA['rupture'])}, p_demand, "k", steps=step_fr)
            
            l_unbraced = 2.0
            r_plate = fp_thick / math.sqrt(12)
            kl_r = (0.65 * l_unbraced) / r_plate if r_plate > 0 else 0
            fe = (math.pi**2 * 29000) / (kl_r**2) if kl_r > 0 else 0
            fcr = fp_fy if fe > fp_fy else fe 
            rn_comp = fcr * ag_fp
            step_fc = f"r = t / &radic;12 = {r_plate:.3f}\"<br>KL/r = 0.65({l_unbraced}) / {r_plate:.3f} = {kl_r:.1f}<br>F<sub>cr</sub> = {fcr:.1f} ksi<br>R<sub>n</sub> = F<sub>cr</sub> A<sub>g</sub> = {fcr:.1f} &times; {ag_fp:.2f} = {rn_comp:.2f} k"
            self.add_check(checks, "Flange Plate Compression Buckling", {'Rn': rn_comp, **get_design_factors(self.inputs, AISC_PHI['compression'], AISC_OMEGA['compression'])}, p_demand, "k", "Assumed unbraced length 2in", steps=step_fc)
            
            # --- WELD CHECKS ---
            fp_weld_type = self.inputs.get('fp_weld_type', 'CJP')
            if fp_weld_type == 'CJP':
                step_cjp = f"CJP weld capacity equals the base metal capacity (yield/rupture).<br>R<sub>n</sub> = {rn_yield:.2f} k"
                self.add_check(checks, "CJP Weld (Flange Plate to Column)", {'Rn': rn_yield, **get_design_factors(self.inputs, AISC_PHI['yield'], AISC_OMEGA['yield'])}, p_demand, "k", steps=step_cjp)
            else:
                weld_size = self.inputs.get('fp_weld_size', 6)
                rn_weld = self.get_weld_shear_rn(weld_size, fp_width * 2, self.inputs.get('FEXX', 70))
                weld_t = (weld_size / 16.0) * 0.707
                step_fw = f"Weld length L = {fp_width * 2}\"<br>t<sub>e</sub> = {weld_size}/16 &times; 0.707 = {weld_t:.3f}\"<br>R<sub>n</sub> = 0.60 F<sub>EXX</sub> t<sub>e</sub> L = 0.60({self.inputs.get('FEXX', 70)})({weld_t:.3f})({fp_width * 2}) = {rn_weld:.2f} k"
                self.add_check(checks, "Fillet Weld (Flange Plate to Column)", {'Rn': rn_weld, **get_design_factors(self.inputs, AISC_PHI['weld'], AISC_OMEGA['weld'])}, p_demand, "k", steps=step_fw)
        else:
            # --- FLANGE ANGLE CHECKS ---
            fa_t = self.inputs.get('fa_thickness', 0.5)
            fa_L = self.inputs.get('fa_length', 8.0)
            fa_col_rows = self.inputs.get('fa_col_bolt_rows', 2)
            fa_beam_rows = self.inputs.get('fa_beam_bolt_rows', 2)
            db = self.inputs.get('db', 0.75)
            grade = self.inputs.get('bolt_grade', 'A325')
            
            # Angle Yielding
            ag_fa = fa_t * fa_L
            rn_yield = fp_fy * ag_fa
            step_ay = f"A<sub>g</sub> = {fa_L} &times; {fa_t} = {ag_fa:.2f} in&sup2;<br>R<sub>n</sub> = F<sub>y</sub> A<sub>g</sub> = {fp_fy} &times; {ag_fa:.2f} = {rn_yield:.2f} k"
            self.add_check(checks, "Flange Angle Tension Yielding", {'Rn': rn_yield, **get_design_factors(self.inputs, AISC_PHI['yield'], AISC_OMEGA['yield'])}, p_demand, "k", steps=step_ay)
            
            # Bolt Shear (Beam Flange) - assuming 2 columns of bolts along the angle
            n_beam_bolts = fa_beam_rows * 2
            fnv_ab = self.get_bolt_shear_rn(grade, db)
            rn_bolt_shear = fnv_ab * 1 * n_beam_bolts
            step_abs = f"F<sub>nv</sub>A<sub>b</sub> = {fnv_ab:.2f} k<br>R<sub>n</sub> = F<sub>nv</sub>A<sub>b</sub> &times; N<sub>planes</sub> &times; N<sub>bolts</sub> = {fnv_ab:.2f} &times; 1 &times; {n_beam_bolts} = {rn_bolt_shear:.2f} k"
            self.add_check(checks, "Bolt Shear (Beam Flange)", {'Rn': rn_bolt_shear, **get_design_factors(self.inputs, AISC_PHI['shear'], AISC_OMEGA['shear'])}, p_demand, "k", steps=step_abs)
            
            # Bolt Tension (Column Face)
            fnt_map = {"A325": 90.0, "A490": 113.0, "F1852": 90.0, "F2280": 113.0, "A307": 45.0}
            fnt = fnt_map.get(grade, 90.0)
            ab = math.pi * (db**2) / 4.0
            rn_bolt_tens_single = fnt * ab
            n_col_bolts = fa_col_rows * 2
            rn_bolt_tens_group = rn_bolt_tens_single * n_col_bolts
            
            # Simple prying action check (Part 9), assuming prying increases bolt tension by 30%
            prying_factor = 1.30
            demand_with_prying = p_demand * prying_factor
            step_abt = f"F<sub>nt</sub> = {fnt} ksi, A<sub>b</sub> = {ab:.3f} in&sup2;<br>R<sub>n</sub> (group) = {fnt} &times; {ab:.3f} &times; {n_col_bolts} bolts = {rn_bolt_tens_group:.2f} k<br>Note: Demand magnified by {prying_factor}x for assumed prying action."
            self.add_check(checks, "Bolt Tension (Column Face)", {'Rn': rn_bolt_tens_group, **get_design_factors(self.inputs, AISC_PHI['rupture'], AISC_OMEGA['rupture'])}, demand_with_prying, "k", steps=step_abt)
        

        # --- COLUMN CHECKS ---
        col_tw = col.get('tw', 0.5)
        col_tf = col.get('tf', 0.5)
        col_kdes = col.get('kdes', 1.0)
        col_d = col.get('d', 10)
        
        rn_wy = col_mat.get('Fy', 50) * col_tw * (5 * col_kdes + fp_thick)
        step_cwy = f"R<sub>n</sub> = F<sub>yw</sub> t<sub>w</sub> (5k<sub>des</sub> + N)<br>R<sub>n</sub> = {col_mat.get('Fy', 50)} &times; {col_tw:.3f} (5 &times; {col_kdes:.3f} + {fp_thick}) = {rn_wy:.2f} k"
        self.add_check(checks, "Column Web Yielding", {'Rn': rn_wy, **get_design_factors(self.inputs, 1.0, 1.5)}, p_demand, "k", steps=step_cwy)
        
        try:
            rn_wc = 0.80 * (col_tw**2) * (1 + 3 * (fp_thick/col_d) * ((col_tw/col_tf)**1.5)) * math.sqrt( (29000 * col_mat.get('Fy', 50) * col_tf) / col_tw )
            step_cwc = f"R<sub>n</sub> = 0.80 t<sub>w</sub>&sup2; [1 + 3(N/d)(t<sub>w</sub>/t<sub>f</sub>)<sup>1.5</sup>] &radic;(E F<sub>yw</sub> t<sub>f</sub> / t<sub>w</sub>)<br>R<sub>n</sub> = {rn_wc:.2f} k"
            self.add_check(checks, "Column Web Crippling", {'Rn': rn_wc, **get_design_factors(self.inputs, 0.75, 2.0)}, p_demand, "k", steps=step_cwc)
        except:
            pass

    # --- HELPER CALCS ---
    def get_bolt_shear_rn(self, grade, db):
        fnv_map = {"A325": 54.0, "A490": 68.0, "F1852": 54.0, "F2280": 68.0, "A307": 27.0}
        fnv = fnv_map.get(grade, 54.0)
        ab = math.pi * (db**2) / 4.0
        return fnv * ab
        
    def get_bolt_bearing_group_rn(self, db, rows, spacing, t, fu, edge_dist, def_considered):
        hole_dia = db + 1/16.0 
        tearout_coeff = 1.2 if def_considered else 1.5
        bearing_coeff = 2.4 if def_considered else 3.0
        
        lc_edge = edge_dist - hole_dia/2.0
        lc_inner = spacing - hole_dia
        if lc_edge < 0: lc_edge = 0
        if lc_inner < 0: lc_inner = 0
        
        rn_edge_tearout = tearout_coeff * lc_edge * t * fu
        rn_inner_tearout = tearout_coeff * lc_inner * t * fu
        rn_brg = bearing_coeff * db * t * fu
        
        r_edge = min(rn_edge_tearout, rn_brg)
        r_inner = min(rn_inner_tearout, rn_brg)
        
        return r_edge + r_inner * (rows - 1)
        
    def get_block_shear_rn(self, t, length, edge_y, rows, spacing, edge_x, db, fy, fu):
        hole_dia = db + 1/16.0
        
        agv = (edge_y + (rows - 1)*spacing) * t
        anv = agv - (rows - 0.5)*hole_dia*t
        
        agt = edge_x * t
        ant = agt - 0.5*hole_dia*t
        
        ubs = 1.0 
        
        rn_bs1 = 0.6*fu*anv + ubs*fu*ant
        rn_bs2 = 0.6*fy*agv + ubs*fu*ant
        
        return min(rn_bs1, rn_bs2)
        
    def get_weld_shear_rn(self, size_sixteenths, length, fexx):
        weld_t = (size_sixteenths / 16.0) * 0.707
        return 0.60 * fexx * weld_t * length

beam_column_calc = BeamColumnCalculator()
