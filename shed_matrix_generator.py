import pandas as pd
import argparse

# --- AISC BEAM DATABASE (A992, Fy=50 ksi) ---
# Weight (W) in lb/ft, Plastic Modulus (Zx) in in^3
beams_data = [
    ("W8x10", 10, 8.87), ("W8x13", 13, 11.4), ("W8x15", 15, 13.4), ("W8x18", 18, 17.0), ("W8x21", 21, 20.4),
    ("W10x12", 12, 12.6), ("W10x15", 15, 15.8), ("W10x17", 17, 18.7), ("W10x19", 19, 21.6), ("W10x22", 22, 26.0), ("W10x26", 26, 33.2), ("W10x30", 30, 37.8),
    ("W12x14", 14, 17.4), ("W12x16", 16, 20.1), ("W12x19", 19, 24.7), ("W12x22", 22, 29.3), ("W12x26", 26, 37.2), ("W12x30", 30, 43.1), ("W12x35", 35, 51.2), ("W12x40", 40, 57.5), ("W12x45", 45, 64.2), ("W12x50", 50, 71.9),
    ("W14x22", 22, 33.2), ("W14x26", 26, 40.2), ("W14x30", 30, 47.3), ("W14x34", 34, 54.6), ("W14x38", 38, 61.5), ("W14x43", 43, 69.6), ("W14x48", 48, 78.4), ("W14x53", 53, 87.1),
    ("W16x26", 26, 44.2), ("W16x31", 31, 54.0), ("W16x36", 36, 64.0), ("W16x40", 40, 72.9), ("W16x45", 45, 82.3), ("W16x50", 50, 92.0), ("W16x57", 57, 105.0),
    ("W18x35", 35, 66.5), ("W18x40", 40, 78.4), ("W18x46", 46, 90.7), ("W18x50", 50, 101.0), ("W18x55", 55, 112.0), ("W18x60", 60, 123.0),
    ("W21x44", 44, 95.4), ("W21x50", 50, 110.0), ("W21x57", 57, 129.0), ("W21x62", 62, 144.0), ("W21x68", 68, 160.0),
    ("W24x55", 55, 134.0), ("W24x62", 62, 153.0), ("W24x68", 68, 177.0)
]
beams = pd.DataFrame(beams_data, columns=['AISC_Manual_Label', 'W', 'Zx']).sort_values(by=['W', 'Zx'])

# --- AISC PIPE COLUMN DATABASE (A53 Gr B, Fy=35 ksi) ---
# ASD Available Compressive Strength (kips) vs Effective Length KL (ft)
pipe_3_std = {
    8: 30.7, 9: 28.0, 10: 25.3, 11: 22.6, 12: 20.0, 13: 17.5,
    14: 15.1, 15: 13.1, 16: 11.6, 17: 10.2, 18: 9.13, 19: 8.19
}

pipe_35_std = {
    8: 40.3, 9: 37.6, 10: 34.8, 11: 31.9, 12: 29.0, 13: 26.2,
    14: 23.4, 15: 20.8, 16: 18.3, 17: 16.2, 18: 14.5, 19: 13.0, 20: 11.7, 21: 10.6, 22: 9.68
}

def get_beam_and_pipe(transverse_span, long_span, psf_load, pipe_height, Fy=50, omega=1.67):
    # 1. Structural Demands
    trib_width = transverse_span / 2
    w_klf = (psf_load * trib_width) / 1000
    M_max = (w_klf * long_span**2) / 8  # k-ft
    P_leg = w_klf * (long_span / 2)     # kips
    
    # 2. Select Beam
    Zx_req = (M_max * 12 * omega) / Fy
    beam_shape = "NG-Beam"
    for index, row in beams.iterrows():
        if row['Zx'] >= Zx_req:
            beam_shape = row['AISC_Manual_Label']
            break
            
    # 3. Check Pipe Leg Capacity
    kl = int(round(pipe_height)) # Round height to nearest whole foot for table lookup
    
    cap_3 = pipe_3_std.get(kl, 0)
    cap_35 = pipe_35_std.get(kl, 0)
    
    if P_leg <= cap_3:
        leg_check = "P3"
    elif P_leg <= cap_35:
        leg_check = "P3.5"
    else:
        leg_check = "NG-Leg"
        
    return f"{beam_shape} ({leg_check})"

def generate_matrix(load, pipe_height):
    transverse_spans = range(6, 31)
    longitudinal_spans = range(4, 26, 2)
    
    matrix = {}
    for t_span in transverse_spans:
        matrix[t_span] = {}
        for l_span in longitudinal_spans:
            matrix[t_span][l_span] = get_beam_and_pipe(t_span, l_span, load, pipe_height)
            
    df = pd.DataFrame(matrix).T
    df.index.name = "Transv \ Long (ft)"
    return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate shed header beam matrices with pipe leg checks.")
    parser.add_argument("--load", type=int, default=325, help="Uniform load in psf (e.g. 175, 300, 325)")
    parser.add_argument("--height", type=float, default=14.0, help="Pipe unbraced height (KL) in feet")
    parser.add_argument("--output", type=str, default=None, help="Output CSV filename")
    
    args = parser.parse_args()
    
    print(f"\n=======================================================")
    print(f" MATRIX FOR {args.load} PSF | PIPE HEIGHT: {args.height} FT")
    print(f" P3 = Works with Pipe 3 Std, P3.5 = Works with Pipe 3.5 Std, NG-Leg = Leg Fails")
    print(f"=======================================================\n")
    
    df = generate_matrix(args.load, args.height)
    
    # Try to print as markdown, fallback to string if tabulate is missing
    try:
        print(df.to_markdown())
    except ImportError:
        print(df.to_string())
        
    if args.output:
        df.to_csv(args.output)
        print(f"\n[!] Matrix saved to {args.output}")
