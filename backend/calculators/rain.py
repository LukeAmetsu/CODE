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
        Q_gpm = 0.0104 * A * i
        
        if drain_type == 'scupper':
            # Weir formula
            if scupper_width > 0:
                dh = math.pow(Q_gpm / (213 * scupper_width), 2/3)
                dh_calc_note = f"d_h calculated from Q = {Q_gpm:.1f} gpm and a {scupper_width}-in wide scupper."
            else:
                dh = 0
                dh_calc_note = "Scupper width must be > 0 to calculate d_h."
        else: # drain
            # Orifice formula
            if drain_diameter > 0:
                dh = math.pow(Q_gpm / (24.5 * math.pow(drain_diameter, 2)), 2)
                dh_calc_note = f"d_h calculated from Q = {Q_gpm:.1f} gpm and a {drain_diameter}-in diameter drain."
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
