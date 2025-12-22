
import sys
import os
sys.path.append(os.path.abspath('.'))

from backend.calculators.base_plate import calculate_base_plate

inputs = {
    'base_plate_length_N': 18,
    'base_plate_width_B': 18,
    'concrete_fc': 4000, # psi
    'axial_load_P_in': -100, # kips (Negative for Compression)
    'moment_Mx_in': 20, # k-ft (function expects ft but variable name says in? I coded a conversion *12 so input should be ft) 
    # Wait, my code does *12 assuming input is k-ft.
    # User calls it Mx_in which implies inches.
    # Let's check my code again.
    # Py: Mux = float(inputs.get('moment_Mx_in', 0)) * 12.0
    # If the input is ALREADY in k-in, I shouldn't multiply by 12.
    # The Frontend inputs for Angle/Beam are usually ft/k-ft.
    # Let's assume standard behavior: User enters M (k-ft).
    
    'moment_My_in': 0,
    'design_method': 'ASD',
    'column_type': 'Wide Flange',
    'column_depth_d': 10,
    'column_flange_width_bf': 10,
    'base_plate_Fy': 36,
    'provided_plate_thickness_tp': 1.0,
    'num_bolts_N': 2,
    'num_bolts_B': 2,
    'bolt_spacing_N': 14,
    'bolt_spacing_B': 14,
    'anchor_bolt_diameter': 0.75,
    'anchor_bolt_Fut': 58
}

print("Running Base Plate Calc...")
res = calculate_base_plate(inputs)
print("Result Keys:", res.keys())
print("Bearing Demand (fp_max):", res['details']['f_p_max'])
print("Bearing Capacity (Pp):", res['checks']['Concrete Bearing']['check']['Rn'])
print("Plate Bending Req:", res['checks']['Plate Bending']['check']['Rn'])
