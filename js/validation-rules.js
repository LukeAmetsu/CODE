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
        'mean_roof_height': { min: 1, max: 2000, required: true, label: 'Mean Roof Height' },
        'basic_wind_speed': { min: 70, max: 300, required: true, label: 'Basic Wind Speed' },
        'building_length_L': { min: 1, required: true, label: 'Building Length (L)' },
        'building_width_B': { min: 1, required: true, label: 'Building Width (B)' },
        'roof_slope_deg': { min: 0, max: 90, required: false, label: 'Roof Slope' }
    },
    snow: {
        'snow_ground_snow_load': { min: 0, max: 300, required: true, label: 'Ground Snow Load (pg)' }
    },
    rain: {
        'rain_tributary_area': { min: 0.001, required: true, label: 'Tributary Area' },
        'rain_intensity': { min: 0.001, required: true, label: 'Rainfall Intensity' },
        'rain_static_head': { min: 0, required: true, label: 'Static Head (ds)' }
    },
    combo: {
        'combo_dead_load_d': { min: 0, required: true, label: 'Dead Load (D)' },
        'combo_live_load_l': { required: false, label: 'Live Load (L)' },
        'combo_roof_live_load_lr': { required: false, label: 'Roof Live Load (Lr)' },
        'combo_rain_load_r': { required: false, label: 'Rain Load (R)' },
        'combo_balanced_snow_load_sb': { required: false, label: 'Balanced Snow (Sb)' },
        'combo_wind_wall_ww_max': { required: false, label: 'Windward Wall Max Wind' },
        'combo_seismic_load_e': { required: false, label: 'Seismic Load (E)' }
    },
    baseplate: {
        'base_plate_length_N': { min: 1, required: true, label: 'Plate Length (N)' },
        'base_plate_width_B': { min: 1, required: true, label: 'Plate Width (B)' },
        'provided_plate_thickness_tp': { min: 0.125, required: true, label: 'Plate Thickness' },
        'column_flange_width_bf': { min: 1, required: false, label: 'Column Flange Width' },
        'column_depth_d': { min: 1, required: true, label: 'Column Depth/Diameter' },
        'base_plate_Fy': { min: 1, required: true, label: 'Plate Fy' },
        'concrete_fc': { min: 1, required: true, label: 'Concrete f\'c' },
        'anchor_bolt_diameter': { min: 0.25, required: true, label: 'Bolt Diameter' },
        'anchor_embedment_hef': { min: 1, required: true, label: 'Bolt Embedment (hef)' },
        crossField: [
            {
                condition: (inputs) => inputs.column_depth_d < inputs.base_plate_length_N,
                message: "Column Depth/Diameter (d) must be less than the Plate Length (N)."
            },
            {
                condition: (inputs) => !inputs.column_flange_width_bf || inputs.column_flange_width_bf < inputs.base_plate_width_B,
                message: "Column Flange Width (bf) must be less than the Plate Width (B)."
            },
            {
                condition: (inputs) => {
                    if (!inputs.column_flange_width_bf) return true; // Not applicable for HSS
                    return (inputs.base_plate_width_B - inputs.column_flange_width_bf) / 2.0 >= 1.0;
                },
                message: "Plate edge distance to column flange is less than 1 inch. This may be insufficient for welding or erection tolerance.",
                level: 'warning'
            }
        ]
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
        'Fy': { min: 1, max: 100, required: true, label: 'Yield Strength (Fy)' },
        'Fu': { min: 1, max: 200, required: true, label: 'Ultimate Strength (Fu)' },
        'E': { min: 28000, max: 31000, required: true, label: 'Modulus of Elasticity (E)' },
        'd': { min: 0.1, required: true, label: 'Depth/Height' },
        'bf': { min: 0.1, required: true, label: 'Width/Flange Width' },
        'tf': { min: 0.1, required: true, label: 'Thickness/Flange Thickness' },
        'tw': { min: 0.1, required: true, label: 'Web Thickness' },
        'K': { min: 0.1, required: true, label: 'Effective length factor (K)' },
        'Lb_input': { min: 0, required: true, label: 'Unbraced Length (Lb)' },
        'actual_deflection_input': { min: 0, required: false, label: 'Actual Deflection' },
        crossField: [
            {
                condition: (inputs) => inputs.Fu > inputs.Fy,
                message: "Ultimate Strength (Fu) must be greater than Yield Strength (Fy)."
            },
            {
                condition: (inputs) => {
                    if (inputs.section_type !== 'I-Shape' && !inputs.section_type.endsWith('-Shape')) return true;
                    return inputs.d >= 2 * inputs.tf;
                },
                message: "For I-shapes, Depth (d) must be at least twice the flange thickness (tf)."
            },
            {
                condition: (inputs) => {
                    if (inputs.section_type !== 'I-Shape' && !inputs.section_type.endsWith('-Shape')) return true;
                    return inputs.bf >= inputs.tw;
                },
                message: "For I-shapes, Flange width (bf) must be greater than or equal to web thickness (tw)."
            },
            {
                condition: (inputs) => inputs.Fy >= 36 && inputs.Fy <= 80,
                message: "Unusual steel grade. Common structural steel has Fy between 36 and 80 ksi.",
                level: 'warning'
            },
            {
                condition: (inputs) => Math.abs(inputs.Pu_or_Pa) <= 10000,
                message: "Very high axial load detected. Please verify that the units are in kips.",
                level: 'warning'
            },
            {
                condition: (inputs) => Math.abs(inputs.Mux_or_Max) <= 10000,
                message: "Very high moment detected. Please verify that the units are in kip-ft.",
                level: 'warning'
            }
        ]
    },
    splice: {
        'member_d': { min: 1, required: true, label: 'Member Depth' },
        'member_bf': { min: 1, required: true, label: 'Member Flange Width' },
        'member_tf': { min: 0.1, required: true, label: 'Member Flange Thickness' },
        'member_tw': { min: 0.1, required: true, label: 'Member Web Thickness' },
        'member_Fy': { min: 36, required: true, label: 'Member Fy' },
        'H_fp': { min: 1, required: (inputs) => ['1', '2'].includes(inputs.num_flange_plates), label: 'Flange Plate Width' },
        't_fp': { min: 0.1, required: (inputs) => ['1', '2'].includes(inputs.num_flange_plates), label: 'Flange Plate Thickness' },
        'L_fp': { min: 1, required: (inputs) => ['1', '2'].includes(inputs.num_flange_plates), label: 'Flange Plate Length' },
        'H_wp': { min: 1, required: (inputs) => ['1', '2'].includes(inputs.num_web_plates), label: 'Web Plate Height' },
        't_wp': { min: 0.1, required: (inputs) => ['1', '2'].includes(inputs.num_web_plates), label: 'Web Plate Thickness' },
        'L_wp': { min: 1, required: (inputs) => ['1', '2'].includes(inputs.num_web_plates), label: 'Web Plate Length' },
        'D_fp': { min: 0.1, required: (inputs) => ['1', '2'].includes(inputs.num_flange_plates), label: 'Flange Bolt Diameter' },
        'D_wp': { min: 0.1, required: (inputs) => ['1', '2'].includes(inputs.num_web_plates), label: 'Web Bolt Diameter' },
        crossField: [
            {
                condition: (inputs) => inputs.H_fp >= inputs.g_gage_fp,
                message: "Flange plate width (H_fp) must be greater than or equal to the bolt gage (g)."
            }
        ]
    },
    nbr_concreto: {
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
    },
    'prestressed-beam-inputs-v2': { // NBR 6118 Viga Protendida
        'fck': { min: 20, max: 90, required: true, label: 'Resist. do Concreto (fck)' },
        'age_at_prestress': { min: 1, max: 365, required: true, label: 'Idade na Protensão' },
        'Ap': { min: 0.1, required: true, label: 'Área da Cordoalha (Ap)' },
        'Kperdas': { min: 0.5, max: 1.0, required: true, label: 'Fator de Perdas (Kperdas)' },
        'num_cables': { min: 1, required: true, label: 'Número de Cabos' },
        'num_strands_per_cable': { min: 1, required: true, label: 'Cordoalhas por Cabo' },
        'load_pp': { min: 0, required: true, label: 'Peso Próprio' },
        'load_perm': { min: 0, required: true, label: 'Carga Permanente' },
        'load_var': { min: 0, required: true, label: 'Carga Variável' },
        'beam_length': { min: 1, required: true, label: 'Comprimento da Viga' },
        'beam_coords': { required: true, label: 'Vértices da Seção' },
        'Ep': { min: 150000, max: 250000, required: true, label: 'Módulo do Aço (Ep)' },
        'humidity': { min: 20, max: 100, required: true, label: 'Umidade Ambiente' },
        'fptk': { min: 1000, max: 2200, required: true, label: 'Resist. do Aço (fptk)' },
        'mu': { min: 0, max: 1, required: true, label: 'Coef. de Atrito (μ)' },
        'k': { min: 0, max: 0.1, required: true, label: 'Coef. de Ondulação (k)' },
        'anchorage_slip': { min: 0, max: 20, required: true, label: 'Acomodação da Ancoragem' },
        'exposed_perimeter': { min: 0.1, required: true, label: 'Perímetro Exposto' }
    },
    mn_diagram: {
        'b': { min: 0.1, required: true, label: 'Largura (b)' },
        'h': { min: 0.1, required: true, label: 'Altura (h)' },
        'fck': { min: 1, required: true, label: 'Concreto (fck)' },
        'fyk': { min: 1, required: true, label: 'Aço (fyk)' },
        'd_linha': { min: 0.1, required: true, label: 'Cobrimento (d\')' },
        'As': { min: 0, required: true, label: 'Arm. Inf. (As)' },
        'As_linha': { min: 0, required: true, label: 'Arm. Sup. (As\')' },
        'gamma_c': { min: 0.1, required: true, label: 'Coef. Concreto (γc)' },
        'gamma_s': { min: 0.1, required: true, label: 'Coef. Aço (γs)' }
    }
};