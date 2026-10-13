import math

def calculate_rain_load(inputs):
    """
    Calculates rain loads based on ASCE 7 standards.
    Ported from rain.js.
    """
    # Extract inputs with defaults
    ds = float(inputs.get('rain_static_head', 0))
    dh_manual = float(inputs.get('rain_hydraulic_head', 0))
    i = float(inputs.get('rain_intensity', 0))
    A = float(inputs.get('rain_tributary_area', 0))
    unit_system = inputs.get('rain_unit_system', 'imperial')
    jurisdiction = inputs.get('rain_jurisdiction', '')
    dh_auto_calc = inputs.get('dh_auto_calc_toggle', False)
    drain_type = inputs.get('rain_drain_type', 'drain')
    scupper_width = float(inputs.get('rain_scupper_width', 0))
    drain_diameter = float(inputs.get('rain_drain_diameter', 0))
    design_method = inputs.get('rain_design_method', 'ASD')

    dh = dh_manual
    dh_calc_note = ""
    warnings = []

    if dh_auto_calc:
        # Q (gpm) calculation per IPC
        A_sqft = A * 10.7639 if unit_system == 'metric' else A
        i_in = i / 25.4 if unit_system == 'metric' else i
        Q_gpm = 0.0104 * A_sqft * i_in
        
        if drain_type == 'scupper':
            scupper_width_in = scupper_width / 25.4 if unit_system == 'metric' else scupper_width
            # Weir formula
            if scupper_width_in > 0:
                dh_in = math.pow(Q_gpm / (213 * scupper_width_in), 2/3)
                dh = dh_in * 25.4 if unit_system == 'metric' else dh_in
                dh_calc_note = f"d_h calculated from Q = {Q_gpm:.1f} gpm and a {scupper_width}-{'mm' if unit_system == 'metric' else 'in'} wide scupper."
            else:
                dh = 0
                dh_calc_note = "Scupper width must be > 0 to calculate d_h."
        else: # drain
            drain_diameter_in = drain_diameter / 25.4 if unit_system == 'metric' else drain_diameter
            # Orifice formula
            if drain_diameter_in > 0:
                dh_in = math.pow(Q_gpm / (24.5 * math.pow(drain_diameter_in, 2)), 2)
                dh = dh_in * 25.4 if unit_system == 'metric' else dh_in
                dh_calc_note = f"d_h calculated from Q = {Q_gpm:.1f} gpm and a {drain_diameter}-{'mm' if unit_system == 'metric' else 'in'} diameter drain."
            else:
                dh = 0
                dh_calc_note = "Drain diameter must be > 0 to calculate d_h."

    if dh > ds:
        warnings.append(f"The calculated hydraulic head (d_h = {dh:.2f}) is greater than the static head (d_s = {ds:.2f}). This indicates the secondary drainage system may be undersized.")

    # Calculate R
    if unit_system == 'imperial':
        R_nominal = 5.2 * (ds + dh)
    else:
        R_nominal = 0.0098 * (ds + dh)

    jurisdiction_note = ""
    if jurisdiction == "NYCBC 2022":
        jurisdiction_note = "NYCBC 2022 adopts ASCE 7-16 for rain loads. Note: The hydraulic head (dh) must be based on the 100-year hourly rainfall rate of 4 in/hr as per the NYC Plumbing Code."

    return {
        'inputs': inputs,
        'results': {
            'R_nominal': R_nominal,
            'dh_final': dh,
            'R_strength': 1.6 * R_nominal,
            'R_asd': 1.0 * R_nominal
        },
        'jurisdiction_note': jurisdiction_note,
        'dh_calc_note': dh_calc_note,
        'warnings': warnings,
        'success': True
    }
