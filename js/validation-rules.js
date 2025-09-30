/**
 * Centralized validation rules for all calculators.
 * Each key corresponds to a specific calculator.
 *
 * Rule properties:
 * - min: The minimum allowed value (for numbers).
 * - max: The maximum allowed value (for numbers).
 * - required: A boolean indicating if the field must have a non-zero/non-empty value.
 * - label: A user-friendly name for the input field used in error messages.
 */
const validationRules = {
    wind: {
        'mean_roof_height': { min: 0.001, max: 2000, required: true, label: 'Mean Roof Height' },
        'basic_wind_speed': { min: 0.001, max: 300, required: true, label: 'Basic Wind Speed' },
        'building_length_L': { min: 0.001, required: true, label: 'Building Length (L)' },
        'building_width_B': { min: 0.001, required: true, label: 'Building Width (B)' },
        'roof_slope_deg': { min: 0, max: 90, required: false, label: 'Roof Slope' }
    },
    snow: {
        'snow_ground_snow_load': { min: 0.001, max: 300, required: true, label: 'Ground Snow Load (pg)' }
    },
    rain: {
        'rain_tributary_area': { min: 0.001, required: true, label: 'Tributary Area' },
        'rain_intensity': { min: 0.001, required: true, label: 'Rainfall Intensity' },
        'rain_static_head': { min: 0, required: true, label: 'Static Head (ds)' }
    },
    combo: {
        'combo_dead_load_d': { min: 0.001, required: true, label: 'Dead Load (D)' },
        'combo_live_load_l': { required: false, label: 'Live Load (L)' },
        'combo_roof_live_load_lr': { required: false, label: 'Roof Live Load (Lr)' },
        'combo_rain_load_r': { required: false, label: 'Rain Load (R)' },
        'combo_balanced_snow_load_sb': { required: false, label: 'Balanced Snow (Sb)' },
        'combo_wind_wall_ww_max': { required: false, label: 'Windward Wall Max Wind' },
        'combo_seismic_load_e': { required: false, label: 'Seismic Load (E)' }
    },
    baseplate: {
        'base_plate_length_N': { min: 0.001, required: true, label: 'Plate Length (N)' },
        'base_plate_width_B': { min: 0.001, required: true, label: 'Plate Width (B)' },
        'provided_plate_thickness_tp': { min: 0.001, required: true, label: 'Plate Thickness' },
        'column_depth_d': { min: 0.001, required: true, label: 'Column Depth' },
        'column_flange_width_bf': { min: 0.001, required: true, label: 'Column Flange Width' },
        'base_plate_Fy': { min: 0.001, required: true, label: 'Plate Fy' },
        'concrete_fc': { min: 0.001, required: true, label: 'Concrete f\'c' },
        'anchor_bolt_diameter': { min: 0.001, required: true, label: 'Bolt Diameter' },
        'anchor_embedment_hef': { min: 0.001, required: true, label: 'Bolt Embedment (hef)' },
    },
    wood: {
        'Fb_unadjusted': { min: 0.001, required: true, label: 'Fb' },
        'Fv_unadjusted': { min: 0.001, required: true, label: 'Fv' },
        'Fc_unadjusted': { min: 0.001, required: true, label: 'Fc' },
        'E_unadjusted': { min: 0.001, required: true, label: 'E' },
        'E_min_unadjusted': { min: 0.001, required: true, label: 'E_min' },
        'b_width': { min: 0.001, required: true, label: 'Width (b)' },
        'd_depth': { min: 0.001, required: true, label: 'Depth (d)' },
        'unbraced_length_L': { min: 0.001, required: true, label: 'Unbraced Length (L)' },
        'effective_length_factor_K': { min: 0.001, required: true, label: 'K Factor' },
    },
    steel_check: {
        'Fy': { min: 0.1, max: 150, required: true, label: 'Yield Strength (Fy)' },
        'Fu': { min: 0.1, max: 200, required: true, label: 'Ultimate Strength (Fu)' },
        'E': { min: 20000, max: 35000, required: true, label: 'Modulus of Elasticity (E)' },
        'd': { min: 0.001, required: true, label: 'Depth/Height' },
        'bf': { min: 0.001, required: true, label: 'Width/Flange Width' },
        'tf': { min: 0.001, required: true, label: 'Thickness/Flange Thickness' },
        'Lb_input': { min: 0, required: true, label: 'Unbraced Length (Lb)' },
    },
    splice: {
        'member_d': { min: 1, required: true, label: 'Member Depth' },
        'member_bf': { min: 1, required: true, label: 'Member Flange Width' },
        'member_tf': { min: 0.1, required: true, label: 'Member Flange Thickness' },
        'member_tw': { min: 0.1, required: true, label: 'Member Web Thickness' },
        'member_Fy': { min: 36, required: true, label: 'Member Fy' },
        'H_fp': { min: 1, required: true, label: 'Flange Plate Width' },
        't_fp': { min: 0.1, required: true, label: 'Flange Plate Thickness' },
        'L_fp': { min: 1, required: true, label: 'Flange Plate Length' },
        'H_wp': { min: 1, required: true, label: 'Web Plate Height' },
        't_wp': { min: 0.1, required: true, label: 'Web Plate Thickness' },
        'L_wp': { min: 1, required: true, label: 'Web Plate Length' },
        'D_fp': { min: 0.1, required: true, label: 'Flange Bolt Diameter' },
        'D_wp': { min: 0.1, required: true, label: 'Web Bolt Diameter' },
    }
    , nbr_concreto: {
        'fck': { min: 1, required: true, label: 'Resist. do Concreto (fck)' },
        'fyk': { min: 1, required: true, label: 'Resist. do Aço (fyk)' },
        'bw': { min: 0.01, required: true, label: 'Largura (bw)' },
        'h': { min: 0.01, required: true, label: 'Altura (h)' },
        'c': { min: 0, required: true, label: 'Cobrimento (c)' },
        'num_barras': { min: 1, required: true, label: 'N° de Barras' },
        'diam_barra': { min: 1, required: true, label: 'Diâmetro da Barra' },
        's_estribo': { min: 0.01, required: true, label: 'Espaçamento do Estribo' },
        'Msd': { required: true, label: 'Momento (Msd)' },
        'Vsd': { required: true, label: 'Cortante (Vsd)' }
    },
    aci_concrete: {
        'fc': { min: 2500, max: 20000, required: true, label: 'Concrete Strength (f\'c)' },
        'fy': { min: 40000, max: 100000, required: true, label: 'Steel Yield Strength (fy)' },
        'b': { min: 1, required: true, label: 'Width (b)' },
        'h': { min: 1, required: true, label: 'Height (h)' },
        'cover': { min: 0.5, required: true, label: 'Cover' },
        'num_bars': { min: 1, required: true, label: 'Number of Bars' },
        'bar_size': { min: 3, max: 11, required: true, label: 'Bar Size' },
        'stirrup_spacing': { min: 1, required: true, label: 'Stirrup Spacing' },
        'Mu': { required: true, label: 'Moment (Mu)' },
        'Vu': { required: true, label: 'Shear (Vu)' }
    },
    nbr_madeira: {
        'fc0k': { min: 1, required: true, label: 'Resist. à Compressão (fc0k)' },
        'fvk': { min: 1, required: true, label: 'Resist. ao Cisalhamento (fvk)' },
        'b': { min: 0.1, required: true, label: 'Largura (b)' },
        'h': { min: 0.1, required: true, label: 'Altura (h)' },
        'L': { min: 0.1, required: true, label: 'Vão (L)' },
        'Msd': { required: true, label: 'Momento (Msd)' },
        'Vsd': { required: true, label: 'Cortante (Vsd)' }
    },
    nbr_aco: {
        'fy': { min: 100, required: true, label: 'Resist. ao Escoamento (fy)' },
        'd': { min: 1, required: true, label: 'Altura (d)' },
        'bf': { min: 1, required: true, label: 'Largura Mesa (bf)' },
        'tf': { min: 0.1, required: true, label: 'Espessura Mesa (tf)' },
        'tw': { min: 0.1, required: true, label: 'Espessura Alma (tw)' },
        'Ag': { min: 1, required: true, label: 'Área Bruta (Ag)' },
        'Zx': { min: 1, required: true, label: 'Módulo Plástico (Zx)' },
        'Lb': { min: 0.1, required: true, label: 'Dist. entre Contenções (Lb)' },
        'Nsd': { required: true, label: 'Força Axial (Nsd)' },
        'Msdx': { required: true, label: 'Momento Fletor (Msdx)' }
    }
};