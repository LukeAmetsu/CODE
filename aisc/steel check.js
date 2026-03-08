// --- Global variables for the 3D scene ---
var lastSteelRunResults = null;

var steelCheckInputIds = [
    'design_method', 'jurisdiction', 'aisc_standard', 'global_fos', 'unit_system', 'steel_material', 'Fy', 'Fu', 'E',
    'section_type', 'aisc_shape_select',
    'd', 'bf', 'tf', 'tw', 'stiffener_spacing_a', 'Ag_manual', 'I_manual', 'Sx_manual', 'Zx_manual', 'ry_manual', 'rts_manual', 'J_manual', 'Cw_manual',
    'Iy_manual', 'Sy_manual', 'Zy_manual', 'lb_bearing', 'is_end_bearing', 'k_des', 'Cm', 'Lb_input', 'K', 'Cb',
    'Pu_or_Pa', 'Mux_or_Max', 'Muy_or_May', 'Vu_or_Va', 'Tu_or_Ta', 'deflection_span', 'deflection_limit', 'actual_deflection_input'
];

// --- Refactored Steel UI Controller (Logic moved to SteelMath) ---
var steelChecker = (() => {

    function validateInputs(inputs) {
        const errors = [];
        const warnings = [];

        if (inputs.Fy <= 0 || inputs.Fy > 100) {
            errors.push({ field: 'Fy', msg: "Yield Strength (Fy) must be between 0 and 100 ksi." });
        }
        if (inputs.Fy < 36 || inputs.Fy > 80) {
            warnings.push("Unusual steel grade. Verify Fy value.");
        }

        if (inputs.Fu <= inputs.Fy) {
            errors.push({ field: 'Fu', msg: "Ultimate Strength (Fu) must be greater than Fy." });
        }
        if (inputs.E <= 0 || inputs.E > 50000) {
            errors.push({ field: 'E', msg: "Modulus of Elasticity (E) should be around 29,000 ksi for steel." });
        }

        if (inputs.d <= 0) errors.push({ field: 'd', msg: "Section depth must be positive." });
        if (!['Pipe', 'Round HSS'].includes(inputs.section_type) && inputs.tf <= 0) {
            errors.push({ field: 'tf', msg: "Flange thickness must be positive." });
        }

        if (Math.abs(inputs.Pu_or_Pa) > 10000) {
            warnings.push("Very high axial load - verify units (kips expected).");
        }
        if (Math.abs(inputs.Mux_or_Max) > 10000) {
            warnings.push("Very high moment - verify units (kip-ft expected).");
        }

        if (inputs.section_type === 'I-Shape') {
            if (inputs.d < 2 * inputs.tf) {
                errors.push({ field: 'd', msg: "Depth (d) must be greater than twice the flange thickness (tf)." });
            }
            if (inputs.bf < inputs.tw) {
                errors.push({ field: 'bf', msg: "Flange width (bf) must be greater than the web thickness (tw)." });
            }
        }

        // Add guard for K and Lb
        if (inputs.K <= 0) {
            errors.push({ field: 'K', msg: "Effective length factor (K) must be positive." });
        }
        if (inputs.Lb_input < 0) {
            errors.push({ field: 'Lb_input', msg: "Unbraced length (Lb) cannot be negative." });
        }

        return { errors, warnings };
    }

    function run(inputs) {
        inputs.Fy = parseFloat(inputs.Fy) || 0;
        inputs.Fu = parseFloat(inputs.Fu) || 0;
        inputs.is_end_bearing = inputs.is_end_bearing === 'true';
        inputs.stiffener_spacing_a = parseFloat(inputs.stiffener_spacing_a) || 0;
        inputs.An_net = inputs.Ag_manual;
        inputs.U_shear_lag = 1.0;

        const { errors, warnings } = validateInputs(inputs);
        if (inputs.Tu_or_Ta !== 0 && inputs.section_type === 'I-Shape') {
            warnings.push("Torsion analysis for I-shapes is a simplified approximation. See AISC Design Guide 9 for complete analysis.");
        }
        if (errors.length > 0) return { errors, warnings, checks: {} };

        // Helper function getSectionProperties is defined globally (outside IIFE), so we can call it.
        const props = getSectionProperties(inputs);

        // After getting properties, if rts was calculated, update the UI input field to show it.
        const rtsInput = document.getElementById('rts_manual');
        if (rtsInput && props.rts > 0 && rtsInput.value !== props.rts.toFixed(5)) {
            rtsInput.value = props.rts.toFixed(5);
        }

        const shear_results = SteelMath.checkShear(props, inputs);
        // Corrected: passing default isHighShear behavior logic if needed, but SteelMath.checkFlexure handles basic cases.
        const flex_results = SteelMath.checkFlexure(props, inputs);
        
        const flex_results_y = SteelMath.checkFlexureMinorAxisComplete(props, inputs);
        const torsion_results = SteelMath.checkTorsionComplete(props, inputs);

        let axial_results = {};
        if (inputs.Pu_or_Pa > 0) {
            axial_results = SteelMath.checkTension(props, inputs);
            axial_results.type = 'Tension';
        } else if (inputs.Pu_or_Pa < 0) {
            axial_results = SteelMath.checkCompression(props, inputs);
            axial_results.type = 'Compression';
        }

        const web_sidesway_buckling = SteelMath.checkWebSideswayBuckling(props, inputs);
        const web_crippling_check = SteelMath.checkWebCrippling(props, inputs);
        const web_crippling_results = web_crippling_check.applicable ? web_crippling_check : {};

        const combined_stress_H33 = SteelMath.checkCombinedStressH33(props, inputs, torsion_results);
        const shear_torsion_interaction = SteelMath.checkShearTorsionInteraction(props, inputs, shear_results, torsion_results);

        let interaction_results = {};
        if (inputs.Pu_or_Pa < 0 && (inputs.Mux_or_Max !== 0 || inputs.Muy_or_May !== 0)) {
            interaction_results = SteelMath.checkInteraction(inputs, props, axial_results, flex_results, flex_results_y);
        }

        let deflection_results = {};
        if (inputs.deflection_span > 0 && inputs.deflection_limit > 0) {
            const L_span_in = inputs.deflection_span * 12;
            const actual_deflection = parseFloat(inputs.actual_deflection_input) || 0;
            const allowable_deflection = L_span_in / inputs.deflection_limit;

            deflection_results = {
                actual: actual_deflection,
                allowable: allowable_deflection,
                ratio: allowable_deflection > 0 ? actual_deflection / allowable_deflection : Infinity
            };
        }

        return {
            inputs,
            properties: props,
            warnings,
            flexure: flex_results,
            flexure_y: flex_results_y,
            shear: shear_results,
            axial: axial_results,
            interaction: interaction_results,
            web_crippling: web_crippling_results,
            web_sidesway_buckling,
            torsion: torsion_results,
            shear_torsion_interaction,
            combined_stress_H33,
            deflection: deflection_results
        };
    }

    return { run, validateInputs };
})();

// --- Helper functions for UI (keep outside steelChecker) ---
function getSectionProperties(inputs) {
    // If a shape is selected from the dropdown, its properties are already in the manual input fields.
    // We can build the properties object directly from there. This handles both selected shapes and pure manual input.
    const props = {
        type: inputs.section_type,
        d: parseFloat(inputs.d) || 0,
        bf: parseFloat(inputs.bf) || 0,
        tf: parseFloat(inputs.tf) || 0,
        tw: parseFloat(inputs.tw) || 0,
        Ag: parseFloat(inputs.Ag_manual) || 0,
        Ix: parseFloat(inputs.I_manual) || 0,
        Sx: parseFloat(inputs.Sx_manual) || 0,
        Zx: parseFloat(inputs.Zx_manual) || 0,
        Iy: parseFloat(inputs.Iy_manual) || 0,
        Sy: parseFloat(inputs.Sy_manual) || 0,
        Zy: parseFloat(inputs.Zy_manual) || 0,
        ry: parseFloat(inputs.ry_manual) || 0,
        rts: parseFloat(inputs.rts_manual) || 0,
        J: parseFloat(inputs.J_manual) || 0,
        Cw: parseFloat(inputs.Cw_manual) || 0,
        k_des: parseFloat(inputs.k_des) || parseFloat(inputs.tf) || 0
    };

    // Calculate derived properties
    props.h = props.d - 2 * props.k_des;
    if (props.Ag > 0 && props.Ix > 0) {
        props.rx = Math.sqrt(props.Ix / props.Ag);
    } else {
        props.rx = 0;
    }

    // For angles, x_bar is needed for some checks.
    if (props.type === 'angle') {
        props.x_bar = props.x_bar || 0; // Use database value if available, else 0
    }

    // If rts is missing for an I-shape, calculate it per AISC 360-22 Eq. F2-7
    if ((!props.rts || props.rts === 0) && ['W-Shape', 'S-Shape', 'M-Shape', 'HP-Shape'].includes(props.type)) {
        // Correct implementation of AISC F2-7 for doubly symmetric I-shapes
        if (props.bf > 0 && props.Sx > 0) {
            const ho = props.d - props.tf;
            const rts_squared = (Math.sqrt(props.Iy * props.Cw)) / props.Sx;
            props.rts = Math.sqrt(rts_squared);
        }
    }

    return props;
}

function updateGeometryInputsUI() {
    const sectionType = document.getElementById('section_type').value;
    const d_label = document.getElementById('label-d');
    const shapeSelectContainer = document.getElementById('aisc-shape-select-container');
    const bf_label = document.getElementById('label-bf');
    const tf_label = document.getElementById('label-tf');
    const tw_label = document.getElementById('label-tw');
    const d_container = document.getElementById('d-input-container');
    const bf_container = document.getElementById('bf-input-container');
    const tf_container = document.getElementById('tf-input-container');
    const tw_container = document.getElementById('tw-input-container');

    d_container.style.display = 'block';
    bf_container.style.display = 'block';
    tf_container.style.display = 'block';
    tw_container.style.display = 'block';
    shapeSelectContainer.style.display = 'block';

    if (sectionType.endsWith('-Shape')) { // Covers W-Shape, S-Shape, HP-Shape, M-Shape, WT-Shape
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
        if (sectionType === 'WT-Shape') {
            tw_label.textContent = 'Stem Thick (tw)';
        }
    } else if (sectionType === 'Rectangular HSS') {
        d_label.textContent = 'Height (H)';
        bf_label.textContent = 'Width (B)';
        tf_label.textContent = 'Thickness (t)';
        tw_container.style.display = 'none';
    } else if (sectionType === 'Round HSS' || sectionType === 'Pipe') {
        d_label.textContent = 'Diameter (D)';
        bf_label.textContent = 'Thickness (t)';
        d_container.style.display = 'block';
        bf_container.style.display = 'block';
        tf_container.style.display = 'none';
        tw_container.style.display = 'none';
    } else if (sectionType === 'Channel' || sectionType === 'Angle') {
        d_label.textContent = 'Depth (d)';
        bf_label.textContent = 'Flange Width (bf)';
        tf_label.textContent = 'Flange Thick (tf)';
        tw_label.textContent = 'Web Thick (tw)';
    } else if (sectionType === 'Manual Input') {
        shapeSelectContainer.style.display = 'none';
        // Ensure inputs are not readonly
        document.querySelectorAll('#d, #bf, #tf, #tw').forEach(el => el.readOnly = false);
    }

    populateShapeDropdown(); // Repopulate shapes for the selected type
}

function handleToggleAllDetails(mainButton, containerSelector) {
    const shouldShow = mainButton.dataset.state === 'hidden';
    const container = document.querySelector(containerSelector);
    if (!container) return;

    container.querySelectorAll('.details-row').forEach(row => {
        row.classList.toggle('is-visible', shouldShow);
    });
    container.querySelectorAll('.toggle-details-btn').forEach(button => {
        button.textContent = shouldShow ? '[Hide]' : '[Show]';
    });
    mainButton.dataset.state = shouldShow ? 'shown' : 'hidden';
    mainButton.textContent = shouldShow ? 'Hide All Details' : 'Show All Details';
    mainButton.blur();
}

function generateSteelBreakdownHtml(name, data, results) {
    const { inputs, properties } = results;
    const { check, details } = data;
    const { design_method } = inputs;

    const factor_char = design_method === 'LRFD' ? '&phi;' : '&Omega;';
    const factor_val = design_method === 'LRFD' ? (check?.phi ?? 0.9) : (check?.omega ?? 1.67);
    const capacity_eq = design_method === 'LRFD' ? `${factor_char}R<sub>n</sub>` : `R<sub>n</sub> / ${factor_char}`;
    const nominal_capacity = check?.Mn || check?.Rn || 0; // Use Mn for flexure, Rn for others
    const final_capacity = design_method === 'LRFD' ? nominal_capacity * factor_val : nominal_capacity / factor_val;

    const fmt = (val, dec = 2) => (val !== undefined && val !== null) ? val.toFixed(dec) : 'N/A';
    const format_list = (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`;
    let content = '';

    switch (name) {
        case 'Flexure (Major Axis)':
        case 'Flexure (Minor Axis)':
            if (name.includes('Major')) {
                const { governing_limit_state, Mn, Lb, Lp, Lr, limit_states, slenderness } = results.flexure || {};
                const safeMn = isFinite(Mn) ? Mn : 0;
                // FIX: Add a guard clause to prevent crash if limit_states is not available for the section type.
                if (!limit_states) {
                    content = format_list([`Governing Limit State: <b>${governing_limit_state || 'N/A'}</b>`, `Nominal Moment Capacity (M<sub>n</sub>) = <b>${fmt(Mn / 12)} kip-ft</b>`]);
                    break;
                }
                const { Cb } = inputs;
                const Mp = limit_states['Yielding (F2.1)'];
                const My = inputs.Fy * properties.Sx;

                const limit_state_rows = Object.entries(limit_states)
                    .filter(([, mn_val]) => isFinite(mn_val))
                    .map(([ls_name, mn_val]) => {
                        const isGoverning = ls_name === governing_limit_state; // This was already correct
                        return `<li>${isGoverning ? '<b>&#9658;</b> ' : ''}${ls_name}: M<sub>n</sub> = ${fmt(mn_val / 12)} kip-ft${isGoverning ? ' <b>(Governs)</b>' : ''}</li>`;
                    }).join('');

                content = format_list([
                    `<u>Nominal Moment Capacity (M<sub>nx</sub>) for Each Limit State:</u><ul>${limit_state_rows}</ul>`,
                    `Plastic Moment (M<sub>p</sub>) = F<sub>y</sub> &times; Z<sub>x</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Zx)} = ${fmt(Mp / 12)} kip-ft`,
                    `Yield Moment (M<sub>y</sub>) = F<sub>y</sub> &times; S<sub>x</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Sx)} = ${fmt(My / 12)} kip-ft`,
                    `<b>LTB Check:</b> L<sub>b</sub>=${fmt(Lb / 12)} ft, L<sub>p</sub>=${fmt(Lp / 12)} ft, L<sub>r</sub>=${fmt(Lr / 12)} ft, C<sub>b</sub>=${fmt(Cb)}`,
                    slenderness ? `<b>FLB Check:</b> &lambda;<sub>f</sub>=${fmt(slenderness.lambda_f)}, &lambda;<sub>pf</sub>=${fmt(slenderness.lambda_p_f)}, &lambda;<sub>rf</sub>=${fmt(slenderness.lambda_r_f)}` : '',
                    `<u>Design Capacity</u>`,
                    `Capacity = ${capacity_eq.replace('R', 'M')} = ${fmt(safeMn / 12)} / ${factor_val} = <b>${fmt(data.phiMn_or_Mn_omega)} kip-ft</b>`
                ]);
            } else { // Minor Axis
                const flex_data_y = results.flexure_y;
                content = format_list([
                    `<u>Governing Limit State: <b>${flex_data_y.governing_limit_state}</b></u>`,
                    `Nominal Moment Capacity (M<sub>ny</sub>) = <b>${fmt(flex_data_y.Mny / 12)} kip-ft</b>`,
                    `Plastic Moment (M<sub>py</sub>) = F<sub>y</sub> &times; Z<sub>y</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Zy)} = ${fmt(inputs.Fy * properties.Zy / 12)} kip-ft`,
                    `Yield Moment (M<sub>yy</sub>) = F<sub>y</sub> &times; S<sub>y</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Sy)} = ${fmt(inputs.Fy * properties.Sy / 12)} kip-ft`,
                    `<u>Design Capacity</u>`,
                    `Capacity = ${capacity_eq.replace('R', 'M')} = ${fmt(flex_data_y.Mny / 12)} / ${factor_val} = <b>${fmt(flex_data_y.phiMny_or_Mny_omega)} kip-ft</b>`
                ]);
            }
            break;

        case 'Shear':
            const shear_data = results.shear;
            content = format_list([
                ...(shear_data.tfa_details ? [
                    `<u>Tension-Field Action (G3) is permitted and governs.</u>`,
                    `Flange Stiffness Check: 2A<sub>w</sub>/A<sub>f</sub> = ${fmt(shear_data.tfa_details.flange_stiffness_check, 2)} &le; 2.5`,
                    `V<sub>n</sub> = 0.6F<sub>y</sub>A<sub>w</sub>[C<sub>v</sub> + (1-C<sub>v</sub>)/(1.15&radic;(1+(a/h)²))] = <b>${fmt(shear_data.Vn)} kips</b>`,
                ] : [
                    `<u>Governing Limit State: <b>${shear_data.governing_limit_state}</b></u>`,
                    `Web Slenderness (h/t<sub>w</sub>) = ${fmt(shear_data.h_tw)}`,
                    `Web Shear Coefficient (C<sub>v</sub>) = ${fmt(shear_data.Cv, 3)}`,
                    `<u>Nominal Shear Strength (V<sub>n</sub>) per AISC G2</u>`,
                    `V<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>w</sub> &times; C<sub>v</sub>`,
                    `V<sub>n</sub> = 0.6 &times; ${fmt(inputs.Fy)} &times; ${fmt(properties.d * properties.tw)} &times; ${fmt(shear_data.Cv, 3)} = <b>${fmt(shear_data.Vn)} kips</b>`,
                ]),
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq.replace('R', 'V')} = ${fmt(shear_data.Vn)} / ${factor_val} = <b>${fmt(shear_data.phiVn_or_Vn_omega)} kips</b>`
            ]);
            break;

        case 'Compression':
            const comp_data = results.axial;
            const buckling_mode_rows = Object.entries(comp_data.buckling_modes)
                .filter(([, fe_val]) => isFinite(fe_val))
                .map(([mode_name, fe_val]) => {
                    const isGoverning = mode_name === comp_data.governing_buckling_mode;
                    return `<li>${isGoverning ? '<b>&#9658;</b> ' : ''}${mode_name}: F<sub>e</sub> = ${fmt(fe_val)} ksi${isGoverning ? ' <b>(Governs)</b>' : ''}</li>`;
                }).join('');

            content = format_list([
                `<u>Elastic Buckling Stress (F<sub>e</sub>) for Each Mode:</u><ul>${buckling_mode_rows}</ul>`,
                `Slender Element Reduction Factor (Q) = ${fmt(comp_data.Q, 3)}`,
                `Critical Buckling Stress (F<sub>cr</sub>) = ${fmt(comp_data.Fcr)} ksi`,
                `<u>Nominal Compressive Strength (P<sub>n</sub>) per AISC E3/E4</u>`,
                `P<sub>n</sub> = F<sub>cr</sub> &times; A<sub>g</sub> = ${fmt(comp_data.Fcr)} ksi &times; ${fmt(properties.Ag)} in² = <b>${fmt(comp_data.Pn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq} = ${fmt(comp_data.Pn)} / ${factor_val} = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Tension':
            const tension_data = results.axial;
            content = format_list([
                `<u>Governing Limit State: <b>${tension_data.governing_limit_state}</b></u>`,
                `<b>Yielding:</b> P<sub>n,y</sub> = F<sub>y</sub> &times; A<sub>g</sub> = ${fmt(inputs.Fy)} &times; ${fmt(properties.Ag)} = ${fmt(tension_data.details.yield.Pn)} kips`,
                `<b>Rupture:</b> P<sub>n,r</sub> = F<sub>u</sub> &times; A<sub>e</sub> = ${fmt(inputs.Fu)} &times; ${fmt(tension_data.details.rupture.Ae)} = ${fmt(tension_data.details.rupture.Pn)} kips`,
                `<u>Design Capacity</u>`,
                `Capacity = min(${design_method === 'LRFD' ? '0.9P_n,y, 0.75P_n,r' : 'P_n,y/1.67, P_n,r/2.00'}) = <b>${fmt(final_capacity)} kips</b>`
            ]);
            break;

        case 'Web Crippling':
            const wc_data = results.web_crippling;
            content = format_list([
                `<u>Governing Limit State: <b>${wc_data.governing_limit_state}</b></u>`,
                `<b>Yielding:</b> R<sub>n,y</sub> = (N + k) &times; F<sub>yw</sub> &times; t<sub>w</sub> = <b>${fmt(wc_data.details.Rn_yield)} kips</b>`,
                `<b>Crippling:</b> R<sub>n,c</sub> = <b>${fmt(wc_data.details.Rn_crippling)} kips</b> (from AISC Eq. ${inputs.is_end_bearing ? 'J10-4' : 'J10-5'})`,
                `<u>Nominal Strength (R<sub>n</sub>)</u>`,
                `R<sub>n</sub> = min(R<sub>n,y</sub>, R<sub>n,c</sub>) = <b>${fmt(wc_data.details.Rn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq.replace('R', 'R')} = ${fmt(wc_data.details.Rn)} / ${factor_val} = <b>${fmt(wc_data.phiRn_or_Rn_omega)} kips</b>`
            ]);
            break;

        case 'Combined Axial & Flexure':
            const interaction_data = results.interaction;
            content = format_list([
                `<u>Interaction Check per AISC H1.1</u>`,
                `P<sub>r</sub>/P<sub>c</sub> = ${fmt(Math.abs(inputs.Pu_or_Pa))} / ${fmt(results.axial.phiPn_or_Pn_omega)} = ${fmt(Math.abs(inputs.Pu_or_Pa) / results.axial.phiPn_or_Pn_omega, 3)}`,
                `Using Equation <b>${interaction_data.equation}</b>`,
                `B1<sub>x</sub> = ${fmt(interaction_data.details.B1x, 3)}, B1<sub>y</sub> = ${fmt(interaction_data.details.B1y, 3)}`,
                `Interaction Value = <b>${fmt(interaction_data.ratio, 3)}</b>`
            ]);
            break;

        case 'Combined Shear & Torsion':
            const s_t_interaction = results.shear_torsion_interaction;
            content = format_list([
                `<u>Interaction Check per AISC H3.2 (HSS) or DG9 Approx. (I-Shape)</u>`,
                `Equation: &radic;[(V<sub>r</sub>/V<sub>c</sub>)² + (T<sub>r</sub>/T<sub>c</sub>)²] &le; 1.0 (for HSS)`,
                `V<sub>r</sub>/V<sub>c</sub> = ${fmt(Math.abs(inputs.Vu_or_Va))} / ${fmt(results.shear.phiVn_or_Vn_omega)}`,
                `T<sub>r</sub>/T<sub>c</sub> = ${fmt(Math.abs(inputs.Tu_or_Ta))} / ${fmt(results.torsion.phiTn_or_Tn_omega)}`,
                `Interaction Value = <b>${fmt(s_t_interaction.ratio, 3)}</b>`
            ]);
            break;

        case 'Combined Stresses (H3.3)':
            const h33_data = results.combined_stress_H33;
            content = format_list([
                `<u>Von Mises Combined Stress Check per AISC H3.3</u>`,
                `Total Normal Stress (&sigma;<sub>total</sub>) = f<sub>a</sub> + f<sub>bx</sub> + f<sub>by</sub> + &sigma;<sub>w</sub> = <b>${fmt(h33_data.details.total_normal_stress)} ksi</b>`,
                `Total Shear Stress (&tau;<sub>total</sub>) = f<sub>v</sub> + &tau;<sub>sv</sub> = <b>${fmt(h33_data.details.total_shear_stress)} ksi</b>`,
                `<u>Required Strength (von Mises)</u>`,
                `f<sub>required</sub> = &radic;(&sigma;<sub>total</sub>² + 3&tau;<sub>total</sub>²) = <b>${fmt(Math.sqrt(h33_data.details.total_normal_stress ** 2 + 3 * h33_data.details.total_shear_stress ** 2))} ksi</b>`,
                `<u>Design Strength</u>`,
                `Capacity = ${capacity_eq.replace('R', 'F')} = <b>${fmt(h33_data.details.capacity)} ksi</b>`
            ]);
            break;

        case 'Web Sidesway Buckling':
            const wsb_data = results.web_sidesway_buckling;
            content = format_list([
                `<u>Governing Limit State: <b>${wsb_data.governing_limit_state}</b></u>`,
                `Web Slenderness (h/t<sub>w</sub>) = ${fmt(wsb_data.h_tw)}`,
                `Unbraced Length / Flange Width (L<sub>b</sub>/b<sub>f</sub>) = ${fmt(wsb_data.L_bf)}`,
                `Coefficient C<sub>r</sub> = ${fmt(wsb_data.Cr)}`,
                `<u>Nominal Strength (R<sub>n</sub>) per AISC G4</u>`,
                `R<sub>n</sub> = (C<sub>r</sub> × A<sub>w</sub> × F<sub>y</sub>) / (h/t<sub>w</sub>)²`,
                `R<sub>n</sub> = <b>${fmt(wsb_data.Rn)} kips</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${capacity_eq.replace('R', 'R')} = <b>${fmt(wsb_data.phiRn_or_Rn_omega)} kips</b>`
            ]);
            break;

        case 'Deflection':
            const def_data = results.deflection;
            content = format_list([
                `<u>Serviceability Check for Deflection</u>`,
                `Allowable Deflection = Span / Limit = ${fmt(inputs.deflection_span * 12, 2)} in / ${fmt(inputs.deflection_limit, 0)} = <b>${fmt(def_data.allowable, 3)} in</b>`,
                `Actual Deflection = <b>${fmt(def_data.actual, 3)} in</b> (User Input)`,
                `Ratio = Actual / Allowable = ${fmt(def_data.actual, 3)} / ${fmt(def_data.allowable, 3)} = <b>${fmt(def_data.ratio, 3)}</b>`
            ]);
            break;

        default:
            return 'Breakdown not available for this check.';
    }
    return `<h4 class="font-semibold">${name}</h4>${content}`;
}

async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    const sectionType = document.getElementById('section_type').value;
    if (!shapeSelect || sectionType === 'Manual Input') return;

    try {
        const shapes = await AISC_SPEC.getShapesByType(sectionType);
        const shapeNames = Object.keys(shapes).sort(); // Sort alphabetically

        // Preserve current value if it exists in the new list
        const currentVal = shapeSelect.value;

        shapeSelect.innerHTML = '<option value="">-- Select a Shape --</option>'; // Reset
        shapeNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            shapeSelect.appendChild(option);
        });

        if (shapeNames.includes(currentVal)) {
            shapeSelect.value = currentVal;
        }

    } catch (error) {
        console.error("Failed to populate shape dropdown:", error);
        shapeSelect.innerHTML = '<option value="">Could not load shapes</option>';
    }
}

async function handleShapeSelection() {
    const shapeName = document.getElementById('aisc_shape_select').value;
    const geometryInputs = ['d', 'bf', 'tf', 'tw'];
    const manualPropInputs = ['Ag_manual', 'I_manual', 'Sx_manual', 'Zx_manual', 'ry_manual', 'rts_manual', 'J_manual', 'Cw_manual', 'Iy_manual', 'Sy_manual', 'Zy_manual'];

    if (!shapeName) {
        // If "Select a Shape" is chosen, make inputs editable
        [...geometryInputs, ...manualPropInputs].forEach(id => {
            const el = document.getElementById(id); if (el) el.readOnly = false;
        });
        return;
    }

    // When a shape is selected, fetch ALL its properties and populate the manual input fields.
    const shape = await AISC_SPEC.getShape(shapeName);
    if (!shape) return;

    const propertyMap = {
        d: shape.d, bf: shape.bf, tf: shape.tf, tw: shape.tw,
        Ag_manual: shape.Ag, I_manual: shape.Ix, Sx_manual: shape.Sx, Zx_manual: shape.Zx,
        ry_manual: shape.ry, rts_manual: shape.rts || '', J_manual: shape.J || '', Cw_manual: shape.cw || '', // CORRECTED: Use shape.cw and provide a fallback
        Iy_manual: shape.Iy, Sy_manual: shape.Sy, Zy_manual: shape.Zy,
        // Also populate k_des if available, otherwise it will be calculated from tf
        k_des: shape.k_des || shape.tf
    };

    Object.keys(propertyMap).forEach(id => {
        const el = document.getElementById(id);
        if (el && propertyMap[id] !== undefined) {
            el.value = propertyMap[id];
            // Make all property inputs read-only when a shape is selected
            el.readOnly = true;
        }
    });
}

function renderSteelInputSummary(inputs) {
    const { design_method, aisc_standard, steel_material, Fy, Fu, Lb_input, K, Cb, Pu_or_Pa, Vu_or_Va, Mux_or_Max, Muy_or_May, Tu_or_Ta, deflection_span, deflection_limit, actual_deflection_input } = inputs;

    return `
    <div id="input-summary-section" class="report-section-copyable">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Input Summary</h3>
            <button data-copy-target-id="input-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <caption class="report-caption">General & Material Properties</caption>
                <tbody>
                    <tr><td>Design Method</td><td>${design_method} (${aisc_standard})</td></tr>
                    <tr><td>Material</td><td>${steel_material} (F<sub>y</sub>=${Fy} ksi, F<sub>u</sub>=${Fu} ksi)</td></tr>
                    <tr><td>Unbraced Length (L<sub>b</sub>)</td><td>${Lb_input} ft</td></tr>
                    <tr><td>Effective Length Factor (K)</td><td>${K}</td></tr>
                    <tr><td>LTB Factor (C<sub>b</sub>)</td><td>${Cb}</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Applied Loads</caption>
                <tbody>
                    <tr><td>Axial (P)</td><td>${Pu_or_Pa} kips</td></tr>
                    <tr><td>Shear (V)</td><td>${Vu_or_Va} kips</td></tr>
                    <tr><td>Moment, Major (M<sub>x</sub>)</td><td>${Mux_or_Max} kip-ft</td></tr>
                    <tr><td>Moment, Minor (M<sub>y</sub>)</td><td>${Muy_or_May} kip-ft</td></tr>
                    <tr><td>Torsion (T)</td><td>${Tu_or_Ta} kip-in</td></tr>
                </tbody>
            </table>
            <table class="w-full mt-4 summary-table">
                <caption class="report-caption">Serviceability Inputs</caption>
                <tbody>
                    <tr><td>Deflection Span</td><td>${deflection_span} ft</td></tr>
                    <tr><td>Deflection Limit</td><td>L/${deflection_limit}</td></tr>
                    <tr><td>Actual Deflection</td><td>${actual_deflection_input} in</td></tr>
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderSteelPropertySummary(properties) {
    const selectedShape = lastSteelRunResults?.inputs?.aisc_shape_select || 'Manual Input';
    const fmt = (val, dec = 2) => (typeof val === 'number' && isFinite(val)) ? val.toFixed(dec) : 'N/A';

    const rows = [
        `<tr><td>Section Type</td><td>${properties.type}</td></tr>`,
        `<tr><td>Selected Shape</td><td class="font-semibold">${selectedShape}</td></tr>`,
        `<tr><td>Gross Area (A<sub>g</sub>)</td><td>${fmt(properties.Ag, 2)} in²</td></tr>`, // Corrected typo from Ag_manual
        `<tr><td>Depth (d)</td><td>${fmt(properties.d, 2)} in</td></tr>`,
        `<tr><td>Flange Width (b<sub>f</sub>)</td><td>${fmt(properties.bf, 2)} in</td></tr>`,
        `<tr><td>Flange Thickness (t<sub>f</sub>)</td><td>${fmt(properties.tf, 3)} in</td></tr>`,
        `<tr><td>Web Thickness (t<sub>w</sub>)</td><td>${fmt(properties.tw, 3)} in</td></tr>`,
        `<tr><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Major Axis Properties (X-X)</td></tr>`,
        `<tr><td>Moment of Inertia (I<sub>x</sub>)</td><td>${fmt(properties.Ix, 2)} in⁴</td></tr>`,
        `<tr><td>Section Modulus (S<sub>x</sub>)</td><td>${fmt(properties.Sx, 2)} in³</td></tr>`,
        `<tr><td>Plastic Modulus (Z<sub>x</sub>)</td><td>${fmt(properties.Zx, 2)} in³</td></tr>`,
        `<tr><td>Radius of Gyration (r<sub>x</sub>)</td><td>${fmt(properties.rx, 2)} in</td></tr>`,
        `<tr><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Minor Axis Properties (Y-Y)</td></tr>`,
        `<tr><td>Moment of Inertia (I<sub>y</sub>)</td><td>${fmt(properties.Iy, 2)} in⁴</td></tr>`,
        `<tr><td>Section Modulus (S<sub>y</sub>)</td><td>${fmt(properties.Sy, 2)} in³</td></tr>`,
        `<tr><td>Plastic Modulus (Z<sub>y</sub>)</td><td>${fmt(properties.Zy, 2)} in³</td></tr>`,
        `<tr><td>Radius of Gyration (r<sub>y</sub>)</td><td>${fmt(properties.ry, 2)} in</td></tr>`,
        `<tr><td colspan="2" class="bg-gray-100 dark:bg-gray-700 font-bold text-center">Torsional Properties</td></tr>`,
        `<tr><td>Torsional Constant (J)</td><td>${fmt(properties.J, 2)} in⁴</td></tr>`,
        `<tr><td>Warping Constant (C<sub>w</sub>)</td><td>${fmt(properties.Cw, 2)} in⁶</td></tr>`,
        `<tr><td>Radius of Gyration (r<sub>ts</sub>)</td><td>${fmt(properties.rts, 2)} in</td></tr>`
    ];

    return `
    <div id="property-summary-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Section Properties</h3>
            <button data-copy-target-id="property-summary-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
                <tbody>${rows.join('')}</tbody>
            </table>
        </div>
    </div>`;
}

function renderSlendernessChecks(results) {
    const { flexure, properties } = results;
    if (!flexure || !flexure.slenderness) return ''; // Only render if slenderness data is available

    const getStatus = (lambda, lambda_p, lambda_r) => {
        if (lambda <= lambda_p) return '<span class="pass">Compact</span>';
        if (lambda <= lambda_r) return '<span class="warn">Non-Compact</span>';
        return '<span class="fail">Slender</span>';
    };

    let rows = [];
    const slenderness = flexure.slenderness;

    // Check for I-Shape/Channel properties
    if (slenderness.lambda_f !== undefined && slenderness.lambda_w !== undefined) {
        const { lambda_f, lambda_p_f, lambda_r_f, lambda_w, lambda_p_w, lambda_r_w } = slenderness;
        rows.push(`<tr><td>Flange Slenderness (b<sub>f</sub>/2t<sub>f</sub>)</td><td>${lambda_f.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p_f.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r_f.toFixed(2)}</td><td>${getStatus(lambda_f, lambda_p_f, lambda_r_f)}</td></tr>`);
        rows.push(`<tr><td>Web Slenderness (h/t<sub>w</sub>)</td><td>${lambda_w.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p_w.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r_w.toFixed(2)}</td><td>${getStatus(lambda_w, lambda_p_w, lambda_r_w)}</td></tr>`);
    }
    // Check for Round HSS/Pipe properties
    else if (slenderness.lambda !== undefined) {
        const { lambda, lambda_p, lambda_r } = slenderness;
        rows.push(`<tr><td>Wall Slenderness (D/t)</td><td>${lambda.toFixed(2)}</td><td>&lambda;<sub>p</sub>=${lambda_p.toFixed(2)}, &lambda;<sub>r</sub>=${lambda_r.toFixed(2)}</td><td>${getStatus(lambda, lambda_p, lambda_r)}</td></tr>`);
    }

    if (rows.length === 0) return ''; // Don't render the table if no slenderness checks were applicable

    return `
    <div id="slenderness-checks-section" class="report-section-copyable mt-6">
        <div class="flex justify-between items-center mb-2">
            <h3 class="report-header">Section Compactness (AISC B4)</h3>
            <button data-copy-target-id="slenderness-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
        </div>
        <div class="copy-content">
            <table class="w-full mt-2 summary-table">
                <thead>
                    <tr><th>Element</th><th>Ratio</th><th>Limits</th><th>Status</th></tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderSteelStrengthChecks(results) {
    const { inputs, flexure, flexure_y, shear, axial, interaction, web_crippling, web_sidesway_buckling, torsion, deflection, combined_stress_H33, shear_torsion_interaction } = results;

    const fmt = (val, dec = 2) => (typeof val === 'number' && isFinite(val)) ? val.toFixed(dec) : 'N/A';
    const getStatus = (ratio) => {
        if (typeof ratio !== 'number' || !isFinite(ratio)) return '<span class="fail">Error</span>';
        return ratio <= 1.0 ? '<span class="pass">Pass</span>' : '<span class="fail">Fail</span>';
    };

    const createRow = (name, demand, capacity, ratio, status, data) => {
        if (capacity === 0 && demand === 0) return '';
        // Sanitize name for ID: remove non-alphanumeric, collapse hyphens, remove leading/trailing hyphens
        const safeName = name.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
        const detailId = `detail-${safeName}`;
        const breakdownHtml = generateSteelBreakdownHtml(name, data, results);
        return `
            <tr class="border-t dark:border-gray-700">
                <td>${name} <span class="ref">[${data.reference}]</span> <button data-toggle-id="${detailId}" class="toggle-details-btn">[Show]</button></td>
                <td>${fmt(demand, 2)}</td>
                <td>${fmt(capacity, 2)}</td>
                <td>${fmt(ratio, 3)}</td>
                <td>${status}</td>
            </tr>
            <tr id="${detailId}" class="details-row"><td colspan="5" class="p-0"><div class="calc-breakdown">${breakdownHtml}</div></td></tr>
        `;
    };

    const strengthRows = [
        axial.type && createRow(axial.type, Math.abs(inputs.Pu_or_Pa), axial.phiPn_or_Pn_omega, Math.abs(inputs.Pu_or_Pa) / axial.phiPn_or_Pn_omega, getStatus(Math.abs(inputs.Pu_or_Pa) / axial.phiPn_or_Pn_omega), { check: axial, details: axial, reference: axial.reference }),
        (flexure.phiMn_or_Mn_omega || inputs.Mux_or_Max !== 0) && createRow('Flexure (Major Axis)', Math.abs(inputs.Mux_or_Max), flexure.phiMn_or_Mn_omega, Math.abs(inputs.Mux_or_Max) / flexure.phiMn_or_Mn_omega, getStatus(Math.abs(inputs.Mux_or_Max) / flexure.phiMn_or_Mn_omega), { check: flexure, details: flexure, reference: flexure.reference }),
        (flexure_y.phiMny_or_Mny_omega || inputs.Muy_or_May !== 0) && createRow('Flexure (Minor Axis)', Math.abs(inputs.Muy_or_May), flexure_y.phiMny_or_Mny_omega, Math.abs(inputs.Muy_or_May) / flexure_y.phiMny_or_Mny_omega, getStatus(Math.abs(inputs.Muy_or_May) / flexure_y.phiMny_or_Mny_omega), { check: flexure_y, details: flexure_y, reference: flexure_y.reference }),
        shear.phiVn_or_Vn_omega && createRow('Shear', Math.abs(inputs.Vu_or_Va), shear.phiVn_or_Vn_omega, Math.abs(inputs.Vu_or_Va) / shear.phiVn_or_Vn_omega, getStatus(Math.abs(inputs.Vu_or_Va) / shear.phiVn_or_Vn_omega), { check: shear, details: shear, reference: shear.reference }),
        interaction.ratio && createRow('Combined Axial & Flexure', interaction.ratio, 1.0, interaction.ratio, getStatus(interaction.ratio), { check: { Rn: 1.0, phi: 1.0, omega: 1.0 }, details: interaction, reference: interaction.reference }),
        web_crippling.applicable && createRow('Web Crippling', Math.abs(inputs.Vu_or_Va), web_crippling.phiRn_or_Rn_omega, Math.abs(inputs.Vu_or_Va) / web_crippling.phiRn_or_Rn_omega, getStatus(Math.abs(inputs.Vu_or_Va) / web_crippling.phiRn_or_Rn_omega), { check: web_crippling, details: web_crippling, reference: web_crippling.reference }),
        web_sidesway_buckling.applicable && createRow('Web Sidesway Buckling', Math.abs(inputs.Vu_or_Va), web_sidesway_buckling.phiRn_or_Rn_omega, Math.abs(inputs.Vu_or_Va) / web_sidesway_buckling.phiRn_or_Rn_omega, getStatus(Math.abs(inputs.Vu_or_Va) / web_sidesway_buckling.phiRn_or_Rn_omega), { check: web_sidesway_buckling, details: web_sidesway_buckling, reference: web_sidesway_buckling.reference }),
        torsion.applicable && createRow('Torsion', Math.abs(inputs.Tu_or_Ta), torsion.phiTn_or_Tn_omega, Math.abs(inputs.Tu_or_Ta) / torsion.phiTn_or_Tn_omega, getStatus(Math.abs(inputs.Tu_or_Ta) / torsion.phiTn_or_Tn_omega), { check: torsion, details: torsion, reference: torsion.reference }),
        shear_torsion_interaction.applicable && createRow('Combined Shear & Torsion', shear_torsion_interaction.ratio, 1.0, shear_torsion_interaction.ratio, getStatus(shear_torsion_interaction.ratio), { check: { Rn: 1.0 }, details: shear_torsion_interaction, reference: shear_torsion_interaction.reference }),
        combined_stress_H33.applicable && createRow('Combined Stresses (H3.3)', combined_stress_H33.ratio, 1.0, combined_stress_H33.ratio, getStatus(combined_stress_H33.ratio), { check: { Rn: 1.0 }, details: combined_stress_H33, reference: combined_stress_H33.reference }),
        deflection.ratio && createRow('Deflection', deflection.actual, deflection.allowable, deflection.ratio, getStatus(deflection.ratio), { check: { Rn: deflection.allowable }, details: deflection, reference: 'Serviceability' })
    ].filter(Boolean).join('');

    return `
        <div id="strength-checks-section" class="report-section-copyable mt-6">
            <div class="flex justify-between items-center mb-2">
                <h3 class="report-header">Strength & Serviceability Checks (${inputs.design_method})</h3>
                <button data-copy-target-id="strength-checks-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
            </div>
            <div class="copy-content">
                <table class="w-full mt-2 results-table">
                    <thead><tr><th>Limit State</th><th>Demand</th><th>Capacity</th><th>Ratio</th><th>Status</th></tr></thead>
                    <tbody>${strengthRows}</tbody>
                </table>
            </div>
        </div>`;
}


function renderSteelResults(results) {
    if (Array.isArray(results)) {
        if (results.length > 0) {
             renderSteelResults(results[0]); 
             renderBatchResults(results.slice(1));
        }
        return;
    }
    lastSteelRunResults = results; // Cache for other functions
    const { inputs, properties, warnings, errors } = results;
    const resultsContainer = document.getElementById('steel-results-container');

    if (errors && errors.length > 0) {
        resultsContainer.innerHTML = renderValidationResults({ errors, warnings });
        return;
    }

    const inputSummaryHtml = renderSteelInputSummary(inputs);
    const propertySummaryHtml = renderSteelPropertySummary(properties);
    const slendernessChecksHtml = renderSlendernessChecks(results);
    const strengthChecksHtml = renderSteelStrengthChecks(results);

    const finalHtml = `
        <div id="steel-check-report-content" class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
            <div class="flex justify-end flex-wrap gap-2 -mt-2 -mr-2 print-hidden">
                <button id="toggle-all-details-btn" class="bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 text-sm" data-state="hidden">Show All Details</button>
                <button id="print-report-btn" class="bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-purple-700 text-sm">Print Report</button>
                <button id="download-word-btn" class="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 text-sm">Download Word</button>
                <button id="download-pdf-btn" class="bg-red-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-red-700 text-sm">Download PDF</button>
                <button id="copy-report-btn" class="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-green-700 text-sm">Copy Full Report</button>
            </div>
            <h2 class="report-title text-center">Steel Section Check Results (${inputs.design_method})</h2>
            ${inputSummaryHtml}
            ${propertySummaryHtml}
            
            <!-- Interaction Diagram Container -->
            <div id="interaction-diagram-section" class="report-section-copyable mt-6">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="report-header">P-M Interaction Diagram (Major Axis)</h3>
                    <button data-copy-target-id="interaction-diagram-section" class="copy-section-btn bg-green-600 text-white font-semibold py-1 px-3 rounded-lg hover:bg-green-700 text-xs print-hidden">Copy Section</button>
                </div>
                <div class="copy-content flex justify-center bg-gray-50 dark:bg-gray-900 rounded p-4 border dark:border-gray-700">
                    <canvas id="interaction-canvas" width="600" height="400" class="bg-white" style="max-width: 100%; height: auto; border: 1px solid #ccc;"></canvas>
                </div>
            </div>

            ${slendernessChecksHtml}
            ${strengthChecksHtml}
        </div>
    `;
    resultsContainer.innerHTML = finalHtml;

    // Draw the interaction diagram after keeping HTML
    setTimeout(() => {
        drawInteractionDiagram('interaction-canvas', results);
        drawCrossSection('crossSectionCanvas', properties);
        drawStructuralSchematic('structuralSchematicCanvas', inputs);
    }, 0);
}

function drawInteractionDiagram(canvasId, results) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { inputs, properties, flexure, axial } = results;
    
    // 1. Calculate Envelope Points
    // We need Pc (Compression Cap), Pt (Tension Cap), Mc (Moment Cap)
    // results.axial is only for the CURRENT force type (Tension or Compression).
    // so we must re-calculate the missing one.
    
    const factor_char = inputs.design_method === 'LRFD' ? 'phi' : 'Omega';
    
    // Get Compression Capacity (Pc)
    let Pc = 0;
    if (axial.type === 'Compression') {
        Pc = axial.phiPn_or_Pn_omega;
    } else {
        // Run compression check manually to get capacity
        const compResults = SteelMath.checkCompression(properties, inputs);
        Pc = compResults.phiPn_or_Pn_omega;
    }

    // Get Tension Capacity (Pt)
    let Pt = 0;
    if (axial.type === 'Tension') {
        Pt = axial.phiPn_or_Pn_omega;
    } else {
        const tensResults = SteelMath.checkTension(properties, inputs);
        Pt = tensResults.phiPn_or_Pn_omega;
    }

    // Get Moment Capacity (Mc) - Major Axis
    const Mc = flexure.phiMn_or_Mn_omega || 0; // In kip-ft
    const Mc_kin = Mc * 12; // Convert to kip-in if needed? Usually diagrams are in kips and kip-ft. Let's stick to kip-ft.

    // 2. Define Key Points for Envelope (P, M)
    // Top Quadrant (Compression + Moment) per AISC H1-1:
    // (P/Pc) + 8/9(M/Mc) = 1  for P >= 0.2Pc
    // (P/2Pc) + (M/Mc) = 1    for P < 0.2Pc
    
    // Point 1: Pure Compression (Pc, 0)
    const p1 = { P: Pc, M: 0 };
    // Point 2: Knee (0.2Pc, 0.9Mc)
    // Check: at P=0.2Pc -> 0.2 + 8/9(M/Mc) = 1 -> 8/9(M/Mc)=0.8 -> M/Mc=0.9 -> M=0.9Mc
    const p2 = { P: 0.2 * Pc, M: 0.9 * Mc };
    // Point 3: Pure Moment (0, Mc)
    const p3 = { P: 0, M: Mc };
    
    // Bottom Quadrant (Tension + Moment)
    // Usually linear: P/Pt + M/Mc <= 1  (Note P is tension here)
    // Point 4: Pure Tension (-Pt, 0)
    const p4 = { P: -Pt, M: 0 };
    
    const envelopePoints = [
        p1, p2, p3, p4, 
        { P: p4.P, M: -p4.M }, // Mirror for negative moment if symmetric? Usually symmetric for I-shapes.
        { P: p3.P, M: -p3.M },
        { P: p2.P, M: -p2.M },
        { P: p1.P, M: -p1.M }, // Back to top? No, Pc is always positive. 
        // Wait, M can be negative.
        // Symmetric about P-axis.
        { P: p2.P, M: -p2.M }, // (-0.9Mc, 0.2Pc)
    ];
    // Correct order for polygon:
    // (0, Pc) -> (0.9Mc, 0.2Pc) -> (Mc, 0) -> (0, -Pt) -> (-Mc, 0) -> (-0.9Mc, 0.2Pc) -> (0, Pc)
    
    const polyPoints = [
        { x: 0, y: Pc },          // Top
        { x: 0.9 * Mc, y: 0.2 * Pc }, // Knee Right
        { x: Mc, y: 0 },          // Right
        { x: 0, y: -Pt },         // Bottom
        { x: -Mc, y: 0 },         // Left
        { x: -0.9 * Mc, y: 0.2 * Pc } // Knee Left
    ];


    // 3. User Demand Point
    const Pu = inputs.Pu_or_Pa || 0; // Positive = Tens/Comp? 
    // Usually inputs.Pu is Axial Load. In logic: >0 is Tens, <0 is Comp?
    // Check main logic: if (inputs.Pu_or_Pa > 0) axial_results.type='Tension'.
    // So +P is Tension, -P is Compression.
    // BUT in Diagrams, usually Up (+Y) is Compression for Civil Engineers, or Tension?
    // Let's standard: +Y = Compression (common in column interaction), +X = Moment.
    // Or standard math: +Y = Tension.
    // Let's stick to: Y axis = P (Compression Positive typically for columns, but let's label it).
    // Let's use: Up = Compression (+P), Down = Tension (-P).
    // So if input Pu < 0 (Compression), we plot as +Y.
    // If input Pu > 0 (Tension), we plot as -Y.
    
    const demandP = -Pu; // Invert sign for plotting (Comp +, Tens -)
    const demandM = Math.abs(inputs.Mux_or_Max); // Plot magnitude on right, or signed?
    // Usually interaction is checked against absolute moment.
    // Let's plot absolute M on X axis (first quadrant mostly) but show full envelope.
    // Since envelope is symmetric, plotting demand M as positive is fine, or signed if we have it?
    // Input Mux can be negative. Let's use real value.
    const demandM_real = inputs.Mux_or_Max;
    
    // 4. Setup Canvas Scaling
    const padding = 60;
    const w = canvas.width;
    const h = canvas.height;
    
    // Bounds
    const maxY = Math.max(Pc, Math.abs(-Pt), Math.abs(demandP)) * 1.2;
    // For min Y, it goes down to -Pt. (or -maxY essentially).
    const minY = -Math.max(Pc, Pt, Math.abs(demandP)) * 1.2; // Symmetric view roughly
    
    const maxX = Math.max(Mc, Math.abs(demandM_real)) * 1.2;
    const minX = -maxX;
    
    const scaleX = (w - 2 * padding) / (maxX - minX);
    const scaleY = (h - 2 * padding) / (maxY - minY);
    // Use uniform scale to preserve aspect ratio? No, P and M have different units (kips vs kip-ft). Independent scaling is better.
    
    const toScreenX = (m) => padding + (m - minX) * scaleX;
    const toScreenY = (p) => h - (padding + (p - minY) * scaleY); // Canvas Y is inverted
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    
    // Draw Grid/Axes
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    // Vertical Axis (M=0)
    ctx.beginPath();
    ctx.moveTo(toScreenX(0), 0);
    ctx.lineTo(toScreenX(0), h);
    ctx.stroke();
    // Horizontal Axis (P=0)
    ctx.beginPath();
    ctx.moveTo(0, toScreenY(0));
    ctx.lineTo(w, toScreenY(0));
    ctx.stroke();
    
    // Draw Envelope
    ctx.fillStyle = 'rgba(75, 192, 192, 0.2)';
    ctx.strokeStyle = 'rgba(75, 192, 192, 1)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    polyPoints.forEach((pt, i) => {
        const sx = toScreenX(pt.x);
        const sy = toScreenY(pt.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw Safe Zone text
    ctx.fillStyle = '#aaa';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Safe Zone', toScreenX(0), toScreenY(0.1 * Pc));

    // Draw Demand Point
    const dx = toScreenX(demandM_real);
    const dy = toScreenY(demandP);
    
    // Check pass/fail for color
    // Simple check: is point inside polygon?
    // We already have interaction ratio from results!
    const ratio = results.interaction.ratio ?? 999; 
    // Note: interaction ratio might use logic different from pure geometric P-M (e.g. H2 unsymmetric).
    // But geometrically, if visually inside, it passes.
    
    const isPass = ratio <= 1.0;
    
    ctx.beginPath();
    ctx.arc(dx, dy, 6, 0, 2 * Math.PI);
    ctx.fillStyle = isPass ? 'green' : 'red';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw Labels
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Demand: (${demandM_real.toFixed(1)} k-ft, ${(-demandP).toFixed(1)} k)`, dx + 10, dy); // Display P as input sign (-demandP = Pu)
    // Wait, I inverted demandP = -Pu. So -demandP = Pu. Correct.
    
    // Axis Labels
    ctx.textAlign = 'center';
    ctx.fillText('Bending Moment (kip-ft)', w / 2, h - 10);
    ctx.save();
    ctx.translate(20, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Axial Load (kips) [+Comp, -Tens]', 0, 0);
    ctx.restore();
    
    // Key values
    ctx.textAlign = 'right';
    ctx.fillText(`Pc = ${Pc.toFixed(0)}k`, toScreenX(0) - 5, toScreenY(Pc) + 5);
    ctx.fillText(`Pt = ${Pt.toFixed(0)}k`, toScreenX(0) - 5, toScreenY(-Pt) - 5);
    ctx.fillText(`Mc = ${Mc.toFixed(0)}k-ft`, toScreenX(Mc) - 5, toScreenY(0) - 10);
    
}

// --- DOMContentLoaded: Initialize UI ---
document.addEventListener('DOMContentLoaded', () => {

    initializeSharedUI();

    function populateMaterialDropdowns() {
        const gradeOptions = Object.keys(AISC_SPEC.structuralSteelGrades).map(grade =>
            `<option value="${grade}">${grade}</option>`
        ).join('');

        const select = document.getElementById('steel_material');
        if (select) {
            select.innerHTML = gradeOptions;
            select.value = 'A992';
            select.addEventListener('change', (e) => {
                const grade = AISC_SPEC.getSteelGrade(e.target.value);
                if (grade) {
                    document.getElementById(e.target.dataset.fyTarget).value = grade.Fy;
                    document.getElementById(e.target.dataset.fuTarget).value = grade.Fu;
                }
            });
            select.dispatchEvent(new Event('change'));
        }
    }

    const handleRunSteelCheck = createCalculationHandler({
        gatherInputsFunction: () => {
            const inputs = gatherInputsFromIds(steelCheckInputIds);
            // Unified Batch: Case 0 is main inputs (empty override), followed by batch table cases
            inputs.batch_loads = [{}, ...steelBatch.cases];
            return inputs;
        },
        storageKey: 'steel-check-inputs',
        validationRuleKey: 'steel_check',
        validatorFunction: (inputs) => {
            lastSteelRunResults = null; // Clear previous results on new run
            return steelChecker.validateInputs(inputs);
        },
        calculatorFunction: async (inputs) => {
            if (window.eel && window.eel.calculate_steel_all) {
                console.log("Using Python Backend for Steel Check...");
                try {
                    const result = await window.eel.calculate_steel_all(inputs)();
                    if (result.error) {
                        console.error("Backend Error:", result.error);
                        throw new Error(result.error);
                    }
                    return result;
                } catch (e) {
                    console.error("Backend call failed, falling back to local JS.", e);
                    return steelChecker.run(inputs);
                }
            }
            return steelChecker.run(inputs);
        },
        renderFunction: renderSteelResults,
        resultsContainerId: 'steel-results-container',
        buttonId: 'run-steel-check-btn' // Add button ID for loading state
    });

    // --- Event Listeners ---
    document.getElementById('run-steel-check-btn').addEventListener('click', handleRunSteelCheck);
    document.getElementById('save-inputs-btn').addEventListener('click', createSaveInputsHandler(steelCheckInputIds, 'steel-check-inputs.txt'));
    document.getElementById('load-inputs-btn').addEventListener('click', () => initiateLoadInputsFromFile('file-input'));
    document.getElementById('file-input').addEventListener('change', createLoadInputsHandler(steelCheckInputIds, handleRunSteelCheck));
    document.getElementById('section_type').addEventListener('change', updateGeometryInputsUI);
    document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);

    // --- Auto-save to Local Storage (with debouncing) ---
    const debouncedSave = debounce(() => {
        saveInputsToLocalStorage('steel-check-inputs', gatherInputsFromIds(steelCheckInputIds));
    }, 300);
    steelCheckInputIds.forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', debouncedSave);
    });

    // Batch Table Listeners
    document.getElementById('add-case-btn')?.addEventListener('click', addBatchRow);
    const batchTable = document.getElementById('batch-table');
    if (batchTable) {
        batchTable.addEventListener('input', handleBatchInput);
        batchTable.addEventListener('click', handleBatchAction);
        batchTable.addEventListener('paste', handleBatchPaste);
    }

    // --- Initial Setup ---
    populateMaterialDropdowns();
    populateShapeDropdown();
    updateGeometryInputsUI();
    renderBatchTable();
    loadInputsFromLocalStorage('steel-check-inputs', steelCheckInputIds);

    // --- Initialize Project Manager ---
    const projectManager = new ProjectManager({
        storageKey: 'steel-project-items',
        containerId: 'project-manager-container',
        inputIds: steelCheckInputIds,
        onLoadItem: (inputs) => {
             Object.entries(inputs).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) {
                    el.value = value;
                    el.dispatchEvent(new Event('input')); // specific for text/number inputs
                    el.dispatchEvent(new Event('change')); // for selects
                }
            });
            // Run check after loading
            handleRunSteelCheck();
        }
    });

    // --- Setup Real-time Validation ---
    setupRealTimeValidation(steelCheckInputIds, steelChecker.validateInputs, 'steel-results-container', handleRunSteelCheck);

    // --- Results Container Event Delegation ---
    document.getElementById('steel-results-container').addEventListener('click', (event) => {
        const target = event.target;
        const toggleBtn = target.closest('.toggle-details-btn');
// ... [rest of the file until end] ...
// I will just replace the call site and APPEND the function at the end.
// But replace_file_content works on blocks.
// I'll replace the call block.
// And then I'll use a separate call to append the function? Or can I do it in one go if they are close?
// They are not close (call is in DOMContentLoaded, def is at end).
// I'll do 2 chunks.

        const copyBtn = target.closest('.copy-section-btn');

        if (toggleBtn) {
            const detailId = toggleBtn.dataset.toggleId;
            const detailRow = document.getElementById(detailId);
            console.log('Toggling details:', detailId, detailRow);

            if (detailRow) {
                // Toggle the class AND explictly set display to ensure visibility
                detailRow.classList.toggle('is-visible');
                const isVisible = detailRow.classList.contains('is-visible');
                detailRow.style.display = isVisible ? 'table-row' : 'none';
                toggleBtn.textContent = isVisible ? '[Hide]' : '[Show]';
            } else {
                console.warn('Detail row not found for ID:', detailId);
            }
        } else if (target.id === 'toggle-all-details-btn') {
            handleToggleAllDetails(target, '#steel-results-container');
        } else if (target.id === 'copy-report-btn') {
            handleCopy('steel-check-report-content', { feedbackElId: 'feedback-message' });
        } else if (target.id === 'download-pdf-btn') {
            handleDownloadPdf('steel-check-report-content', 'Steel-Check-Report.pdf');
        } else if (target.id === 'print-report-btn') {
            window.print();
        } else if (target.id === 'download-word-btn') {
            handleDownloadWord('steel-check-report-content', 'Steel-Check-Report.doc');
        } else if (copyBtn) {
            const targetId = copyBtn.dataset.copyTargetId;
            if (targetId) {
                handleCopy(targetId, { feedbackElId: 'feedback-message' });
            }
        }
    });
});

/**
 * Sets up real-time validation for a list of inputs.
 * @param {string[]} inputIds - Array of input IDs to monitor.
 * @param {function} validatorFn - Function taking inputs object and returning { errors, warnings }.
 * @param {string} resultsContainerId - ID of key results container (optional).
 * @param {function} [autoRunCallback] - Optional callback to run if valid (debounced).
 */
function setupRealTimeValidation(inputIds, validatorFn, resultsContainerId, autoRunCallback) {
    let debounceTimer;
    
    const runValidation = () => {
        const inputs = gatherInputsFromIds(inputIds);
        const { errors } = validatorFn(inputs);
        
        // 1. Clear previous highlights
        inputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.remove('border-red-500', 'bg-red-50', 'dark:bg-red-900', 'dark:border-red-700');
            }
        });
        
        // 2. Apply new highlights
        let hasErrors = false;
        if (errors && errors.length > 0) {
            hasErrors = true;
            errors.forEach(err => {
                const fieldId = (typeof err === 'object') ? err.field : null;
                if (fieldId) {
                    const el = document.getElementById(fieldId);
                    if (el) {
                        el.classList.add('border-red-500', 'bg-red-50', 'dark:bg-red-900', 'dark:border-red-700');
                    }
                }
            });
        }
        
        // 3. Auto-Run (Debounced) if valid
        if (!hasErrors && typeof autoRunCallback === 'function') {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                autoRunCallback();
            }, 500); // 500ms debounce
        }
    };
    
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', runValidation);
            el.addEventListener('change', runValidation); // For selects
        }
    });
}
// --- New Canvas Drawing Functions ---

function drawCrossSection(canvasId, props) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    // Auto-resize canvas to container if needed
    const container = canvas.parentElement;
    if (container) {
        // Only resize if significantly different to avoid flickering loops, but here relying on CSS size
        // canvas.width = container.clientWidth; // better done in a resize observer
        // Use current canvas size (scaled by pixel ratio ideally, but simple here)
        if (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
        }
    }
    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);
    
    // Draw Background/Grid
    ctx.fillStyle = '#f9fafb'; // gray-50
    if (document.documentElement.classList.contains('dark')) ctx.fillStyle = '#111827'; // gray-900
    ctx.fillRect(0, 0, cw, ch);

    // Styling
    const isDark = document.documentElement.classList.contains('dark');
    ctx.fillStyle = isDark ? '#4b5563' : '#d1d5db'; // gray-600/300 fill
    ctx.strokeStyle = isDark ? '#e5e7eb' : '#1f2937'; // white/gray-800 stroke
    ctx.lineWidth = 2;

    if (!props || !props.d) return;

    // Dimensions
    const d = parseFloat(props.d);
    let bf = parseFloat(props.bf) || d/2;
    let tf = parseFloat(props.tf) || d/20;
    let tw = parseFloat(props.tw) || d/30;
    
    // Scale Factor
    // Fit (d, bf) into (cw, ch) with padding
    const padding = 40;
    const scaleX = (cw - 2 * padding) / bf;
    const scaleY = (ch - 2 * padding) / d;
    const scale = Math.min(scaleX, scaleY);
    
    const cx = cw / 2;
    const cy = ch / 2;
    
    const dw = d * scale;
    const bfw = bf * scale;
    const tfw = tf * scale;
    const tww = tw * scale;

    ctx.beginPath();
    
    switch (props.type) {
        case 'W-Shape':
        case 'S-Shape':
        case 'HP-Shape':
        case 'M-Shape':
            // I-Section
            // Flanges are centered
            // Top Flange
            ctx.rect(cx - bfw/2, cy - dw/2, bfw, tfw);
            // Bottom Flange
            ctx.rect(cx - bfw/2, cy + dw/2 - tfw, bfw, tfw);
            // Web
            ctx.rect(cx - tww/2, cy - dw/2 + tfw, tww, dw - 2*tfw);
            break;
            
        case 'WT-Shape':
            // T-Section
            // Top Flange
            ctx.rect(cx - bfw/2, cy - dw/2, bfw, tfw);
            // Stem
            ctx.rect(cx - tww/2, cy - dw/2 + tfw, tww, dw - tfw);
            break;
            
        case 'Channel':
            // C-Section (Lips to right usually)
            // Top Flange
            ctx.rect(cx - bfw/2, cy - dw/2, bfw, tfw);
            // Bottom Flange
            ctx.rect(cx - bfw/2, cy + dw/2 - tfw, bfw, tfw);
            // Web (Left side)
            ctx.rect(cx - bfw/2, cy - dw/2, tww, dw);
            break;
            
        case 'Angle':
            // L-Section
            // Vertical Leg
            ctx.rect(cx - bfw/2, cy - dw/2, tww, dw);
            // Horizontal Leg
            ctx.rect(cx - bfw/2, cy + dw/2 - tfw, bfw, tfw);
            break;
            
        case 'Rectangular HSS':
            // Box
            ctx.rect(cx - bfw/2, cy - dw/2, bfw, dw);
            // Inner hollow (approx)
            ctx.moveTo(cx - bfw/2 + tww, cy - dw/2 + tww);
            ctx.lineTo(cx + bfw/2 - tww, cy - dw/2 + tww);
            ctx.lineTo(cx + bfw/2 - tww, cy + dw/2 - tww);
            ctx.lineTo(cx - bfw/2 + tww, cy + dw/2 - tww);
            ctx.lineTo(cx - bfw/2 + tww, cy - dw/2 + tww);
            break;
            
        case 'Round HSS':
        case 'Pipe':
            // Circle
            ctx.arc(cx, cy, dw/2, 0, 2*Math.PI);
            // Inner Circle
            ctx.moveTo(cx + dw/2 - tww, cy); // move to edge of inner
            ctx.arc(cx, cy, dw/2 - tww, 0, 2*Math.PI);
            break;
            
        default:
             // Box placeholder
            ctx.rect(cx - bfw/2, cy - dw/2, bfw, dw);
    }
    
    ctx.fill();
    ctx.stroke();
    
    // Draw Dimensions Text
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = '12px Inter, sans-serif';
    ctx.textAlign = 'center';
    
    // Height label (Left)
    ctx.fillText(`d=${d.toFixed(1)}"`, cx - bfw/2 - 20, cy);
    // Width label (Top)
    ctx.fillText(`bf=${bf.toFixed(1)}"`, cx, cy - dw/2 - 10);
}

function drawStructuralSchematic(canvasId, inputs) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
     const container = canvas.parentElement;
    if (container && (canvas.width !== container.clientWidth || canvas.height !== container.clientHeight)) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
    const cw = canvas.width;
    const ch = canvas.height;
    
    ctx.clearRect(0, 0, cw, ch);
    
     // Styling
    const isDark = document.documentElement.classList.contains('dark');
    const strokeColor = isDark ? '#e5e7eb' : '#374151';
    
    // Inputs
    const L = parseFloat(inputs.deflection_span) || 20; // ft
    const Pu = parseFloat(inputs.Pu_or_Pa) || 0;
    const Vu = parseFloat(inputs.Vu_or_Va) || 0;
    const Mu = parseFloat(inputs.Mux_or_Max) || 0;
    
    // Drawing Parameters
    const paddingX = 60;
    const beamY = ch / 2;
    const beamStart = paddingX;
    const beamEnd = cw - paddingX;
    const beamLength = beamEnd - beamStart;
    
    // Draw Beam
    ctx.strokeStyle = '#3b82f6'; // blue-500
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(beamStart, beamY);
    ctx.lineTo(beamEnd, beamY);
    ctx.stroke();
    
    // Draw Supports (Pinned-Pinned Assumption)
    ctx.fillStyle = strokeColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    
    // Left Support (Pin)
    ctx.beginPath();
    ctx.moveTo(beamStart, beamY);
    ctx.lineTo(beamStart - 10, beamY + 15);
    ctx.lineTo(beamStart + 10, beamY + 15);
    ctx.closePath();
    ctx.stroke(); 
    
    // Right Support (Roller)
    ctx.beginPath();
    ctx.moveTo(beamEnd, beamY);
    ctx.lineTo(beamEnd - 10, beamY + 15);
    ctx.lineTo(beamEnd + 10, beamY + 15);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(beamEnd - 12, beamY + 18);
    ctx.lineTo(beamEnd + 12, beamY + 18); // ground
    ctx.stroke();

    // Draw Loads
    // Axial P
    if (Math.abs(Pu) > 0) {
        ctx.strokeStyle = '#ef4444'; // red-500
        ctx.fillStyle = '#ef4444';
        const arrowLen = 40;
        const yOffset = -20;
        
        ctx.beginPath();
        if (Pu < 0) { // Compression
             // Arrows pointing IN
             // Left
             ctx.moveTo(beamStart - arrowLen, beamY);
             ctx.lineTo(beamStart, beamY);
             ctx.lineTo(beamStart - 10, beamY - 5);
             ctx.moveTo(beamStart, beamY);
             ctx.lineTo(beamStart - 10, beamY + 5);
             
             // Right
             ctx.moveTo(beamEnd + arrowLen, beamY);
             ctx.lineTo(beamEnd, beamY);
             ctx.lineTo(beamEnd + 10, beamY - 5);
             ctx.moveTo(beamEnd, beamY);
             ctx.lineTo(beamEnd + 10, beamY + 5);
             
             ctx.fillText(`P=${Math.abs(Pu)}k (C)`, cw/2, beamY - 10);
        } else { // Tension
             // Arrows pointing OUT
             // Left
             ctx.moveTo(beamStart, beamY);
             ctx.lineTo(beamStart - arrowLen, beamY);
             ctx.lineTo(beamStart - arrowLen + 10, beamY - 5);
             ctx.moveTo(beamStart - arrowLen, beamY);
             ctx.lineTo(beamStart - arrowLen + 10, beamY + 5);
             
             // Right
             ctx.moveTo(beamEnd, beamY);
             ctx.lineTo(beamEnd + arrowLen, beamY);
             ctx.lineTo(beamEnd + arrowLen - 10, beamY - 5);
             ctx.moveTo(beamEnd + arrowLen, beamY);
             ctx.lineTo(beamEnd + arrowLen - 10, beamY + 5);
             
             ctx.fillText(`P=${Pu}k (T)`, cw/2, beamY - 10);
        }
        ctx.stroke();
    }
    
    // Draw Moment (at ends or midspan?)
    // Assuming simple span with max moment at center for visualization
    if (Math.abs(Mu) > 0) {
        ctx.strokeStyle = '#10b981'; // green-500
        
        ctx.beginPath();
        // Arc at center
        ctx.arc(cw/2, beamY, 30, Math.PI, 2*Math.PI); // Top half arc
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#10b981';
        ctx.fillText(`M=${Math.abs(Mu)}k-ft`, cw/2, beamY - 40);
    }
    
    // Labels
    ctx.fillStyle = strokeColor;
    ctx.textAlign = 'center';
    ctx.fillText(`L = ${L} ft`, cw/2, beamY + 40);

}

// --- BATCH LOGIC ---
var steelBatch = {
    cases: [] 
};

function renderBatchTable() {
    const tbody = document.getElementById("batch-table")?.querySelector("tbody");
    if (!tbody) return;
    tbody.innerHTML = "";

    steelBatch.cases.forEach((item, index) => {
        const tr = document.createElement("tr");
        tr.className = "border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors";

        tr.innerHTML = `
            <td class="p-1"><input type="number" step="1" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500" value="${item.P}" data-idx="${index}" data-key="P"></td>
            <td class="p-1"><input type="number" step="1" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500" value="${item.Mx}" data-idx="${index}" data-key="Mx"></td>
            <td class="p-1"><input type="number" step="1" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500" value="${item.My}" data-idx="${index}" data-key="My"></td>
            <td class="p-1"><input type="number" step="1" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-600 dark:text-white dark:border-gray-500 hover:border-blue-400 focus:border-blue-500" value="${item.V}" data-idx="${index}" data-key="V"></td>
            <td class="p-1 text-center"><button class="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30" data-idx="${index}" data-action="remove" title="Remove">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button></td>
        `;
        tbody.appendChild(tr);
    });
}

function addBatchRow() {
    steelBatch.cases.push({ P: 0, Mx: 0, My: 0, V: 0 });
    renderBatchTable();
}

function handleBatchInput(e) {
    if (e.target.tagName === "INPUT" && e.target.dataset.idx) {
        const idx = parseInt(e.target.dataset.idx);
        const key = e.target.dataset.key;
        steelBatch.cases[idx][key] = parseFloat(e.target.value) || 0;
    }
}

function handleBatchAction(e) {
    const btn = e.target.closest("button");
    if (btn && btn.dataset.action === "remove") {
        const idx = parseInt(btn.dataset.idx);
        steelBatch.cases.splice(idx, 1);
        renderBatchTable();
    }
}

function handleBatchPaste(e) {
    const clipboardData = (e.clipboardData || window.clipboardData).getData("text");
    if (!clipboardData) return;
    
    // Check if target deals with batch inputs
    if(!document.getElementById("batch-table").contains(e.target)) return;

    e.preventDefault();
    const rows = clipboardData.split(/\r\n|\n|\r/).filter(r => r.trim() !== "");
    const newCases = [];
    rows.forEach(rowStr => {
        let values = rowStr.split("\t");
        if (values.length < 2) values = rowStr.split(/,|;/);
        if (values.length >= 1) {
            newCases.push({
                P: parseFloat(values[0]) || 0,
                Mx: parseFloat(values[1]) || 0,
                My: parseFloat(values[2]) || 0,
                V: parseFloat(values[3]) || 0
            });
        }
    });
    if (newCases.length > 0) {
        let startIdx = steelBatch.cases.length;
        const activeInput = document.activeElement;
        if(activeInput && activeInput.dataset.idx) startIdx = parseInt(activeInput.dataset.idx);
        
        for(let i=0; i<newCases.length; i++) {
             if(startIdx + i < steelBatch.cases.length) {
                 steelBatch.cases[startIdx+i] = newCases[i];
             } else {
                 steelBatch.cases.push(newCases[i]);
             }
        }
        renderBatchTable();
    }
}

var steelBatchResults = [];

function renderBatchResults(results) {
    const container = document.getElementById("batch-results-container");
    const tbody = document.getElementById("batch-results-body");
    const singleWrapper = document.getElementById("results-wrapper");

    // Show batch container
    container.classList.remove("hidden");
    tbody.innerHTML = "";
    
    steelBatchResults.length = 0;
    results.forEach(r => steelBatchResults.push(r));

    results.forEach((res, index) => {
        if(res.error) {
            tbody.innerHTML += `<tr><td colspan="5" class="text-red-500 p-2">Error Row ${index+1}: ${res.error}</td></tr>`;
            return;
        }
        
        let maxRatio = 0;
        let fail = false;
        
        // Axial
        if(res.axial && res.axial.phiPn_or_Pn_omega && res.inputs.Pu_or_Pa) {
            const r = Math.abs(res.inputs.Pu_or_Pa) / res.axial.phiPn_or_Pn_omega;
            if(r > maxRatio) maxRatio = r;
        }
        // Flexure X
        if(res.flexure && res.flexure.phiMn_or_Mn_omega && res.inputs.Mux_or_Max) {
            const r = Math.abs(res.inputs.Mux_or_Max) / res.flexure.phiMn_or_Mn_omega;
            if(r > maxRatio) maxRatio = r;
        }
        // Flexure Y
        if(res.flexure_y && res.flexure_y.phiMny_or_Mny_omega && res.inputs.Muy_or_May) {
            const r = Math.abs(res.inputs.Muy_or_May) / res.flexure_y.phiMny_or_Mny_omega;
            if(r > maxRatio) maxRatio = r;
        }
        // Shear
        if(res.shear && res.shear.phiVn_or_Vn_omega && res.inputs.Vu_or_Va) {
             const r = Math.abs(res.inputs.Vu_or_Va) / res.shear.phiVn_or_Vn_omega;
             if(r > maxRatio) maxRatio = r;
        }
        // Interaction
        if(res.interaction && res.interaction.ratio) {
             if(res.interaction.ratio > maxRatio) maxRatio = res.interaction.ratio;
        }
        
        if (maxRatio > 1.0) fail = true;
        
        const inputs = res.inputs || {};
        
        const tr = document.createElement("tr");
        tr.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 cursor-pointer";
        tr.onclick = (e) => { if (e.target.tagName !== "BUTTON") viewBatchDetails(index); };
        
        tr.innerHTML = `
            <td class="px-4 py-2 font-mono text-gray-500 text-xs">${index+1}</td>
            <td class="px-4 py-2 text-xs">${(inputs.Pu_or_Pa || 0).toFixed(1)}</td>
            <td class="px-4 py-2 text-xs">${(inputs.Mux_or_Max || 0).toFixed(1)}</td>
            <td class="px-4 py-2 font-bold text-xs ${fail ? 'text-red-600' : 'text-green-600'}">${maxRatio.toFixed(2)}</td>
            <td class="px-4 py-2 text-right">
                <button onclick='viewBatchDetails(${index})' class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">View</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function viewBatchDetails(index) {
    const res = steelBatchResults[index];
    if(!res) return;
    
    const singleWrapper = document.getElementById("results-wrapper");
    if(singleWrapper) singleWrapper.classList.remove("hidden");
    
    renderSteelResults(res);
    
    // Add banner
    const container = document.getElementById("steel-results-container");
    const oldBanner = document.getElementById("batch-banner");
    if(oldBanner) oldBanner.remove();

    const banner = document.createElement("div");
    banner.id = "batch-banner";
    banner.className = "mb-4 p-2 bg-yellow-50 text-yellow-800 text-sm border border-yellow-200 rounded";
    banner.innerHTML = `<strong>Batch View:</strong> Showing results for Case #${index+1}`;
    container.prepend(banner);
    
    singleWrapper.scrollIntoView({behavior: 'smooth'});
}

async function handleRunBatchCheck() {
    const btn = document.getElementById("batch-calc-btn");
    const originalText = btn.textContent;
    btn.textContent = "Running...";
    btn.disabled = true;
    
    try {
        const inputs = {};
        steelCheckInputIds.forEach(id => {
             const el = document.getElementById(id);
             if(el) inputs[id] = el.value;
        });
        
        const batchPayload = steelBatch.cases.map(c => ({
            Pu_or_Pa: c.P,
            Mux_or_Max: c.Mx,
            Muy_or_May: c.My,
            Vu_or_Va: c.V
        }));
        
        inputs.batch_loads = batchPayload;
        
        if (typeof eel === 'undefined') throw new Error("Eel not connected");
        
        const results = await eel.calculate_steel_all(inputs)();
        
        if(Array.isArray(results)) {
            renderBatchResults(results);
        } else {
            console.error("Expected array for batch results", results);
            alert("Error in batch calculation.");
        }
    } catch(e) {
        console.error(e);
        alert("Batch calculation failed: " + e.message);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Ensure init
document.addEventListener("DOMContentLoaded", () => {
   // --- Batch Listeners ---
    document.getElementById("batch-calc-btn")?.addEventListener("click", handleRunBatchCheck);
    document.getElementById("add-case-btn")?.addEventListener("click", addBatchRow);
    const batchTable = document.getElementById("batch-table");
    if(batchTable) {
        batchTable.addEventListener("input", handleBatchInput);
        batchTable.addEventListener("click", handleBatchAction);
        batchTable.addEventListener("paste", handleBatchPaste);
    }
    renderBatchTable();
});
