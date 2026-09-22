# pyrefly: ignore [missing-import]
import eel
import sys
import os
import threading

# Thread-safe and greenlet-safe WebSocket send lock to prevent frame corruption / interleaving
try:
    import gevent.lock
    _eel_ws_send_lock = gevent.lock.Semaphore(1)
except ImportError:
    _eel_ws_send_lock = threading.Lock()

_orig_eel_repeated_send = eel._repeated_send
def _safe_eel_repeated_send(ws, msg):
    with _eel_ws_send_lock:
        return _orig_eel_repeated_send(ws, msg)
eel._repeated_send = _safe_eel_repeated_send

# Enhanced JSON serializer that gracefully handles numpy types (bool_, integer, floating, ndarray)
import numpy as np
def _json_default_serializer(obj):
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return None

def _safe_json_with_numpy(obj):
    return eel.jsn.dumps(obj, default=_json_default_serializer)
eel._safe_json = _safe_json_with_numpy

# Ensure backend module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.database import db

# HELPER: Finds files in both Dev mode and EXE mode
def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# Preload AISC DB in background thread so GUI window appears immediately
def _preload_db_async():
    try:
        db.ensure_loaded()
    except Exception as e:
        print(f"Background DB preload note: {e}")

threading.Thread(target=_preload_db_async, daemon=True).start()

# --- Expose Functions ---



@eel.expose
def rs2_get_preset(preset_name="slope"):
    try:
        from backend.calculators.rs2_fea import get_preset_model
        return {"status": "success", "preset": get_preset_model(preset_name)}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def rs2_generate_mesh(model_data):
    try:
        from backend.calculators.rs2_fea import generate_triangular_mesh, assign_layers_and_materials_to_elements, process_model_footings
        model_data = process_model_footings(model_data)
        layer_polygons = model_data.get('layer_polygons', [])
        materials = model_data.get('materials', [])
        excavation_poly = model_data.get('excavation_poly')
        excavation_polys = model_data.get('excavation_polys')
        if not excavation_poly and excavation_polys and len(excavation_polys) > 0:
            excavation_poly = excavation_polys[0]
        if not excavation_polys and excavation_poly and len(excavation_poly) > 0:
            excavation_polys = [excavation_poly]

        stages = model_data.get('stages', [])
        keep_exc = bool(model_data.get('keep_excavation_elements', False))
        if excavation_poly and len(excavation_poly) >= 3 and stages and any('excavation_active' in st for st in stages):
            keep_exc = True

        mesh_out = generate_triangular_mesh(
            domain_poly=model_data.get('domain_poly'),
            internal_boundaries=model_data.get('internal_boundaries', []),
            excavation_poly=excavation_poly,
            excavation_polys=excavation_polys,
            target_elem_size=float(model_data.get('target_elem_size', 2.5)),
            layer_polygons=layer_polygons,
            keep_excavation_elements=keep_exc,
            return_attributes=True,
            materials=materials,
            mesh_type=model_data.get('mesh_type', 'uniform')
        )
        if len(mesh_out) == 4:
            nodes, elements, elem_mat, elem_layer = mesh_out
        else:
            nodes, elements = mesh_out
            elem_mat, elem_layer = assign_layers_and_materials_to_elements(nodes, elements, materials, layer_polygons)

        return {
            "status": "success",
            "mesh": {
                "num_nodes": len(nodes),
                "num_elements": len(elements),
                "nodes": nodes.tolist(),
                "elements": elements.tolist(),
                "elem_mat": elem_mat.tolist(),
                "elem_layer": elem_layer.tolist()
            },
            "lateral_containments": model_data.get('lateral_containments', []),
            "excavation_polys": model_data.get('excavation_polys', [])
        }
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def rs2_run_analysis(model_data):
    try:
        from backend.calculators.rs2_fea import full_analysis_pipeline
        return full_analysis_pipeline(model_data, run_ssr=False)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def rs2_run_ssr(model_data):
    try:
        from backend.calculators.rs2_fea import full_analysis_pipeline
        return full_analysis_pipeline(model_data, run_ssr=True)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def rs2_get_critical_sections(model_data):
    try:
        import importlib
        import backend.calculators.rs2_fea as fea_mod
        importlib.reload(fea_mod)
        return fea_mod.calculate_slope_slip_surfaces(model_data)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def rs2_load_benchmark_file(filename):
    try:
        import os
        import json
        base_name = os.path.basename(filename)
        p_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        fpath = os.path.join(p_root, "test_files", "rs2", base_name)
        if not os.path.exists(fpath):
            return {"status": "error", "error": f"Arquivo de teste não encontrado: {base_name}"}
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"status": "success", "data": data}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_retaining_wall(inputs):
    try:
        import importlib
        import backend.calculators.retaining_wall as rw_mod
        importlib.reload(rw_mod)
        return rw_mod.calculate_retaining_wall(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def get_aoki_reference_data():
    try:
        from backend.calculators.aoki_velloso import get_aoki_reference_data as py_get_aoki
        return py_get_aoki()
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_aoki_velloso(inputs):
    try:
        from backend.calculators.aoki_velloso import calculate_aoki_velloso as py_calc_aoki
        return py_calc_aoki(inputs)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def get_liquefaction_reference_data():
    try:
        from backend.calculators.liquefaction import get_liquefaction_reference_data as py_get_liq
        return py_get_liq()
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_liquefaction_profile(inputs):
    try:
        from backend.calculators.liquefaction import calculate_liquefaction_profile as py_calc_liq_prof
        return py_calc_liq_prof(inputs)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_liquefaction_layers(inputs):
    try:
        from backend.calculators.liquefaction import calculate_liquefaction_layers as py_calc_liq_lay
        return py_calc_liq_lay(inputs)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_liquefaction_combinatorial_statistics(inputs=None):
    try:
        from backend.calculators.liquefaction import calculate_liquefaction_combinatorial_statistics as py_calc_liq_comb
        return py_calc_liq_comb(inputs)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def generate_liquefaction_report_plots(inputs=None, output_dir=None):
    try:
        from backend.calculators.liquefaction import generate_liquefaction_report_plots as py_gen_liq_plots
        return py_gen_liq_plots(inputs, output_dir)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def export_liquefaction_profile_excel(inputs=None, output_path=None):
    try:
        from backend.calculators.liquefaction import export_liquefaction_profile_excel as py_exp_liq_xls
        return py_exp_liq_xls(inputs, output_path)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_piled_raft(inputs):
    try:
        import importlib
        import backend.calculators.piled_raft as pr_mod
        importlib.reload(pr_mod)
        return pr_mod.calculate_piled_raft(inputs)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_piled_beam(inputs):
    try:
        import importlib
        import backend.calculators.piled_beam as pb_mod
        importlib.reload(pb_mod)
        return pb_mod.calculate_piled_beam(inputs)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def get_shallow_foundation_reference_data():
    try:
        from backend.calculators.shallow_foundation import get_shallow_foundation_reference_data as py_get_ref
        return py_get_ref()
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_shallow_foundation(inputs):
    try:
        import importlib
        import backend.calculators.shallow_foundation as sf_mod
        importlib.reload(sf_mod)
        return sf_mod.calculate_shallow_foundation(inputs)
    except Exception as e:
        import traceback
        return {"success": False, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_universal_combinations(inputs, standard='NBR 8681', method='ELU_NORMAL'):
    try:
        import importlib
        import backend.calculators.nbr_6118_comb as comb_mod
        importlib.reload(comb_mod)
        return comb_mod.calculate_combinations(inputs, standard=standard, method=method)
    except Exception as e:
        import traceback
        return {"combinations": {"elu": [], "els_rara": [], "els_freq": [], "els_qp": []}, "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_nbr_combinations(inputs, standard='NBR 8681', method='ELU_NORMAL'):
    return calculate_universal_combinations(inputs, standard=standard, method=method)

@eel.expose
def mietc_load_default_workbook():
    """Carrega a planilha padrão Refs/Cópia de Cargas nas bases MIETC.xlsx"""
    try:
        import backend.calculators.comb_bases_mietc as m_mod
        candidates = [
            os.path.join(os.path.abspath("."), "Refs", "Cópia de Cargas nas bases MIETC.xlsx"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "Refs", "Cópia de Cargas nas bases MIETC.xlsx")
        ]
        ref_path = None
        for c in candidates:
            if os.path.exists(c):
                ref_path = os.path.abspath(c)
                break
        
        if not ref_path:
            return {"status": "error", "error": "Arquivo padrão 'Refs/Cópia de Cargas nas bases MIETC.xlsx' não encontrado."}

        parsed = m_mod.parse_mietc_workbook(ref_path)
        return {"status": "success", "file_name": os.path.basename(ref_path), "data": parsed}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def mietc_parse_uploaded_file(file_base64, file_name="uploaded_cargas.xlsx"):
    """Processa planilha enviada pelo usuário via upload no navegador (base64)"""
    try:
        import base64
        import tempfile
        import backend.calculators.comb_bases_mietc as m_mod
        
        if "," in file_base64:
            file_base64 = file_base64.split(",", 1)[1]
        
        file_bytes = base64.b64decode(file_base64)
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
            
        try:
            parsed = m_mod.parse_mietc_workbook(tmp_path)
        finally:
            if os.path.exists(tmp_path):
                try:
                    os.remove(tmp_path)
                except Exception:
                    pass
                    
        return {"status": "success", "file_name": file_name, "data": parsed}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def mietc_auto_detect_pairs(bases_list):
    """Detecta automaticamente pares de bases subsequentes (ex: BT1+BT2, BT3+BT4) para sapatas conjuntas"""
    try:
        import backend.calculators.comb_bases_mietc as m_mod
        pairs = m_mod.auto_detect_subsequent_pairs(bases_list)
        return {"status": "success", "pairs": pairs}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def mietc_calculate_combinations(sheet_data, standard="NBR 8681", method="ELU_NORMAL", options=None):
    """Calcula combinações triaxiais (V, X, Y) para todas as bases de uma folha/aba com regras de grupos e associação"""
    try:
        import backend.calculators.comb_bases_mietc as m_mod
        results = m_mod.batch_calculate_sheet_bases(sheet_data, standard=standard, method=method, options=options)
        return {"status": "success", "results": results}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def mietc_export_excel(results_data, filename="Combinacoes_MIETC_Envoltorias.xlsx"):
    """Gera planilha Excel formatada com resumo e detalhes e retorna em base64 para download"""
    try:
        import base64
        import tempfile
        import backend.calculators.comb_bases_mietc as m_mod
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx") as tmp:
            tmp_path = tmp.name
            
        m_mod.export_mietc_results_to_excel(results_data, tmp_path)
        
        with open(tmp_path, "rb") as f:
            content = f.read()
            
        b64 = base64.b64encode(content).decode('utf-8')
        
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
                
        return {"status": "success", "filename": filename, "base64": b64}
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}


@eel.expose
def calculate_blevot_pile_cap(inputs):
    try:
        import importlib
        import backend.calculators.aoki_velloso as av_mod
        importlib.reload(av_mod)
        return av_mod.calculate_blevot_pile_cap(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}



@eel.expose
def calculate_angle_support(inputs):
    try:
        from backend.calculators.angle_support import calculate_angle_support as py_calculate_angle
        return py_calculate_angle(inputs)
    except Exception as e:
        return {"error": str(e)}

@eel.expose
def calculate_shed_span(inputs):
    try:
        from backend.calculators.shed_span import calculate_max_span
        return calculate_max_span(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def find_lightest_beam(inputs):
    try:
        from backend.calculators.beam_selector import find_lightest_beam as py_find_lightest
        return py_find_lightest(inputs)
    except Exception as e:
        return {"error": str(e)}

@eel.expose
def generate_shed_matrix(inputs):
    try:
        from backend.calculators.shed_matrix import generate_matrix
        return generate_matrix(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def export_shed_matrix_excel(inputs):
    try:
        from backend.calculators.shed_matrix import export_matrix_to_excel
        return export_matrix_to_excel(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_base_plate(inputs):
    try:
        from backend.calculators.base_plate import calculate_base_plate as py_calculate_base_plate
        return py_calculate_base_plate(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_splice(inputs):
    try:
        from backend.calculators.splice import splice_calc
        # splice_calc is the instance. It has multiple methods. 
        # The frontend likely calls specific methods or one aggregate. 
        # Since I am translating the *entire* file, I should probably check how the frontend uses it. 
        # JS `spliceCalculator` usually has `checkBoltShear` etc calls.
        # But `splice.js` also had a `spliceCalculator` IIFE. 
        # Wait, the user asked to translate *logic*. The frontend is likely still doing the orchestration in JS unless I fully port the UI to use the backend for everything. 
        # The user said "translate all files on the AISC folder to python". 
        # If I translate `splice.js` completely, the frontend Logic (which collects inputs and calls math) should now call Backend.
        # So I need an entry point. 
        # For now, I'll expose the calculator object wrapper or specific methods if needed.
        # But `splice.js` (lines 446+) has `spliceCalculator` module. 
        # I'll expose a generic 'run_check' or specific checks.
        # Let's Expose a proxy for now.
        return {"status": "Calculator loaded", "methods": ["check_bolt_shear", "check_bolt_bearing", "check_gross_section_yielding", "check_net_section_rupture", "check_block_shear", "calculate_eccentricity_analysis"]}
    except Exception as e:
         return {"error": str(e)}

@eel.expose
def calculate_base_plate_all(inputs):
    """Orchestrates the full base plate calculation via Python backend."""
    try:
        from backend.calculators.base_plate import calculate_base_plate
        return calculate_base_plate(inputs)
    except Exception as e:
        import traceback
        print(f"Base Plate Check Error: {e}")
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def run_splice_check(check_name, inputs):
    try:
        from backend.calculators.splice import splice_calc
        method = getattr(splice_calc, check_name, None)
        if method:
            return method(inputs)
        return {"error": f"Method {check_name} not found"}
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_splice_all(inputs):
    """Orchestrates the full splice calculation via Python backend."""
    try:
        from backend.calculators.splice import splice_calc
        return splice_calc.run(inputs)
    except Exception as e:
        import traceback
        print(f"Splice Calculation Error: {e}")
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_beam_column(inputs):
    """Orchestrates the full beam-column connection calculation."""
    try:
        from backend.calculators.beam_column import beam_column_calc
        return beam_column_calc.run(inputs)
    except Exception as e:
        import traceback
        print(f"Beam-Column Error: {e}")
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def run_beam_column_check(check_name, inputs):
    try:
        from backend.calculators.beam_column import beam_column_calc
        method = getattr(beam_column_calc, check_name, None)
        if method:
            return method(inputs)
        return {"error": f"Method {check_name} not found"}
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}


@eel.expose
def calculate_steel_all(inputs):
    """Orchestrates the full steel check calculation via Python backend."""
    try:
        from backend.calculators.steel_check import steel_checker
        return steel_checker.run(inputs)
    except Exception as e:
        import traceback
        print(f"Steel Check Error: {e}")
        traceback.print_exc()
        return {"error": str(e), "trace": traceback.format_exc()}


@eel.expose
def run_steel_check(check_name, props, inputs):
    try:
        from backend.calculators.steel_check import SteelChecker
        checker = SteelChecker()
        method = getattr(checker, check_name, None)
        if method:
            return method(props, inputs)
        return {"error": f"Method {check_name} not found"}
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}


@eel.expose
def calculate_wood_nds(inputs):
    try:
        from backend.calculators.nds import calculate_nds
        return calculate_nds(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def get_wood_species():
    try:
        from backend.calculators.nds import get_wood_species_list
        return get_wood_species_list()
    except Exception as e:
        import traceback
        print(f"Error getting wood species: {e}")
        return {}


@eel.expose
def get_shapes_by_type(shape_type):
    try:
        shapes = db.get_shapes_by_type(shape_type)
        # Sort logic
        def sort_key(k):
            try:
                parts = k.upper().replace(shape_type, '').split('X')
                if len(parts) >= 2:
                    return (float(parts[0]), float(parts[1]))
                return (float(parts[0]), 0)
            except:
                return (0, 0)
        
        return sorted(list(shapes.keys()), key=sort_key, reverse=True)
    except Exception as e:
        print(f"Error getting shapes: {e}")
        return []

@eel.expose
def get_shape_details(shape_name):
    try:
        # Assuming db._shapes is a dict {name: details}
        if db._shapes and shape_name in db._shapes:
            return db._shapes[shape_name]
        return None
    except Exception as e:
        print(f"Error getting shape details: {e}")
        return None

@eel.expose
def get_aisc_database():
    """Returns the entire AISC database to the frontend."""
    try:
        return db.get_all_shapes()
    except Exception as e:
        print(f"Error getting full database: {e}")
        return {}



@eel.expose
def calculate_nbr_concrete(inputs):
    try:
        from backend.calculators.nbr_6118_concrete import calculate_concrete_beam
        return calculate_concrete_beam(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_steel_structure(inputs):
    """Unified steel structure calculation supporting NBR 8800 and AISC 360."""
    try:
        standard = str(inputs.get('standard', 'nbr')).lower()
        if 'aisc' in standard:
            from backend.calculators.steel_check import steel_checker
            return steel_checker.run(inputs)
        else:
            from backend.calculators.nbr_8800_steel import calculate_steel_structure as nbr_calc
            return nbr_calc(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_nbr_steel(inputs):
    """Calculates steel member capacity per NBR 8800 (alias for calculate_steel_structure)."""
    return calculate_steel_structure(inputs)




@eel.expose
def calculate_mn_interaction_diagram(inputs):
    """Deprecated: M-N module unified into PCALC (calculate_pcalc_column)."""
    try:
        from backend.calculators.pcalc import calculate_column
        return calculate_column(inputs)
    except Exception as e:
        import traceback
        return {"error": "M-N module unified into PCALC. Use calculate_pcalc_column.", "trace": traceback.format_exc()}
   


@eel.expose
def calculate_prestressed_beam_check(inputs):
    try:
        from backend.calculators.prestressed_beam import calculate_prestressed_beam
        return calculate_prestressed_beam(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def solve_stm(inputs):
    try:
        from backend.calculators.STM_backend import solve_truss_system
        return solve_truss_system(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def generate_stm_template(template_type, geometry):
    try:
        from backend.calculators.STM_backend import generate_template
        return generate_template(template_type, geometry)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def optimize_stm(inputs):
    try:
        from backend.calculators.STM_backend import optimize_stm_geometry
        return optimize_stm_geometry(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_pcalc_column(inputs):
    """Calculates reinforced concrete column 2nd order effects and interaction surface per NBR 6118."""
    try:
        from backend.calculators.pcalc import calculate_column
        return calculate_column(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_weld_group(inputs):
    try:
        from backend.calculators.weld_group import calculate_weld_group as backend_calculate
        return backend_calculate(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}



@eel.expose
def run_shear_plots():
    """Trigger shear plot generation in a background thread and stream progress to the frontend."""
    try:
        # Import from the project root (one level above backend/)
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.abspath(os.path.join(backend_dir, '..'))
        sys.path.insert(0, project_root)
        from generate_shear_plots import generate_plots

        # Resolve absolute paths once — no os.chdir needed
        abs_excel = os.path.join(project_root, 'master_shear_database_v8_GRAPH.xlsx')
        abs_plots = os.path.join(project_root, 'plots')

        def _worker():
            try:
                generate_plots(
                    eel_callback=lambda pct, msg, img: eel.update_shear_progress(pct, msg, img)(),
                    file_path=abs_excel,
                    out_dir=abs_plots,
                )
            except Exception as exc:
                import traceback
                print(f"Shear plots error: {exc}")
                traceback.print_exc()
                eel.update_shear_progress(0, f"Error: {exc}", None)()

        t = threading.Thread(target=_worker, daemon=True)
        t.start()
        return {"status": "started"}
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def get_shear_dataset():
    """Returns the shear database points to JS for fast client-side rendering."""
    try:
        from backend.calculators.interactive_shear import load_and_clean_data
        return load_and_clean_data()
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def get_all_codes_dataset():
    """Returns the raw ALL DATA database points to JS for the universal explorer."""
    try:
        from backend.calculators.interactive_shear import get_all_codes_dataset as get_all
        return get_all()
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def get_python_lowess(x, y, frac=0.3):
    """Offloads LOWESS smoothing calculations seamlessly back to Python."""
    try:
        from backend.calculators.interactive_shear import get_lowess
        return get_lowess(x, y, frac)
    except Exception as e:
        import traceback
        return []

@eel.expose
def run_scipy_optimization(target_safety=1.0, locked=None, current_vals=None, criterion='cov', subset_key='ALL DATA'):
    """Runs Nelder-Mead to auto-fit exponents based on selected criterion ('cov' or 'mean') and active data subset."""
    try:
        import importlib
        import backend.calculators.interactive_shear as ishear
        importlib.reload(ishear)
        return ishear.run_optimization(target_safety, locked, current_vals, criterion, subset_key)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calibrate_shear_constant_c(target_safety=1.0, current_vals=None, subset_key='ALL DATA'):
    """Analytically computes constant C for the desired target safety mean on the active data subset in O(1)."""
    try:
        import importlib
        import backend.calculators.interactive_shear as ishear
        importlib.reload(ishear)
        return ishear.calibrate_constant_c(target_safety, current_vals, subset_key)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def compare_lowess_curves_batch(live_curve, other_curves_dict):
    """Compares the Live Model LOWESS curve against other codes' curves."""
    try:
        import importlib
        import backend.calculators.interactive_shear as ishear
        importlib.reload(ishear)
        return ishear.batch_compare_lowess(live_curve, other_curves_dict)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

# --- New Modules: Geotechnical & Structural Engineering ---

@eel.expose
def calculate_flexible_retaining_wall(inputs):
    """Calculates sheet pile or diaphragm flexible retaining walls per Blum method."""
    try:
        from backend.calculators.flexible_retaining_wall import calculate_flexible_wall
        return calculate_flexible_wall(inputs)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def solve_2d_frame(model_data):
    """Solves 2D Frame / Truss structural models (Ftool Web equivalent)."""
    try:
        from backend.calculators.frame_2d import solve_frame_2d
        return solve_frame_2d(model_data)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_continuous_rc_beam(model_data):
    """Solves continuous RC beams with load envelopes and NBR 6118 detailing."""
    try:
        from backend.calculators.continuous_beam_rc import calculate_continuous_beam
        return calculate_continuous_beam(model_data)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_steel_connection(inputs):
    """Calculates structural steel connections per ABNT NBR 8800 (CBCA) or AISC 360 (LRFD/ASD)."""
    try:
        from backend.calculators.steel_connections import calculate_steel_connection as _calc_conn
        return _calc_conn(inputs)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_steel_connection_nbr8800(inputs):
    """Compatibility wrapper for calculate_steel_connection."""
    return calculate_steel_connection(inputs)

@eel.expose
def calculate_concrete_beam(inputs):
    """Calculates reinforced concrete beam design per NBR 6118, ACI 318-22, and Eurocode 2."""
    try:
        from backend.calculators.nbr_6118_concrete import calculate_concrete_beam as _calc_beam
        return _calc_beam(inputs)
    except Exception as e:
        import traceback
        return {"status": "error", "error": str(e), "trace": traceback.format_exc()}


if __name__ == '__main__':
    # Initialize with the absolute path to the project root (CODE-2)
    # This exposes 'gui', 'aisc', 'js', etc.
    # We use the parent directory of 'backend' (where this script resides)
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(backend_dir, '..'))
    
    # Also support PyInstaller if needed (though _MEIPASS usually handles temp dirs)
    if hasattr(sys, '_MEIPASS'):
        project_root = sys._MEIPASS
        
    print(f"Eel serving from: {project_root}")
    # Initialize Eel quickly without scanning entire .venv / OneDrive directory tree
    eel.init(project_root, allowed_extensions=[])
    try:
        eel._mock_js_function('update_shear_progress')
    except Exception:
        pass
    
    def find_helium_path():
        """Locate Helium browser executable on Windows if installed."""
        local_app_data = os.environ.get('LOCALAPPDATA', '')
        if local_app_data:
            for exe_name in ['chrome.exe', 'helium.exe']:
                candidate = os.path.join(local_app_data, 'imput', 'Helium', 'Application', exe_name)
                if os.path.isfile(candidate):
                    return candidate

        try:
            import winreg, shlex
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice') as key:
                prog_id, _ = winreg.QueryValueEx(key, 'ProgId')
            if 'helium' in prog_id.lower():
                with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, rf'{prog_id}\shell\open\command') as key:
                    cmd, _ = winreg.QueryValueEx(key, '')
                parts = shlex.split(cmd)
                if parts and os.path.isfile(parts[0]):
                    return parts[0]
        except Exception:
            pass

        try:
            import winreg
            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, r'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\helium.exe') as key:
                        path, _ = winreg.QueryValueEx(key, '')
                        if os.path.isfile(path):
                            return path
                except OSError:
                    pass
        except Exception:
            pass

        return None

    def setup_preferred_browser():
        """Configures Eel and Python's webbrowser to prioritize Helium or Windows default browser over Google Chrome."""
        import webbrowser
        helium_path = find_helium_path()
        if helium_path:
            print(f"Helium browser detected: {helium_path}")
            try:
                if webbrowser._tryorder is None:
                    webbrowser.register_standard_browsers()
                webbrowser.register('helium', None, webbrowser.BackgroundBrowser(helium_path))
                if 'helium' in webbrowser._tryorder:
                    webbrowser._tryorder.remove('helium')
                webbrowser._tryorder.insert(0, 'helium')
            except Exception as e:
                print(f"Warning: Could not register Helium in webbrowser: {e}")

            try:
                import eel.browsers
                eel.browsers.set_path('chrome', helium_path)
            except Exception:
                pass
            return 'helium', helium_path
        else:
            print("Helium browser not found. Using Windows default browser.")
            return 'default', None

    print("Starting Eel App...")
    browser_type, browser_path = setup_preferred_browser()

    def open_browser_delayed(url, max_wait=5.0):
        """Open the browser once the server is actually responding with HTTP 200."""
        import threading, time, subprocess, urllib.request
        def _open():
            start_time = time.time()
            while time.time() - start_time < max_wait:
                time.sleep(0.15)
                try:
                    with urllib.request.urlopen(url, timeout=0.5) as resp:
                        if resp.status == 200:
                            break
                except Exception:
                    pass
            try:
                # On Windows, os.startfile is the most reliable way to open a URL
                os.startfile(url)
                print(f"Browser launched via os.startfile")
            except Exception as ex1:
                try:
                    if browser_path and os.path.isfile(browser_path):
                        print(f"Launching Helium: {browser_path}")
                        subprocess.Popen([browser_path, url])
                    else:
                        import webbrowser
                        webbrowser.open(url)
                except Exception as ex2:
                    print(f"Could not auto-open browser: {ex2}")
                    print(f"  >> Open manually: {url}")
        t = threading.Thread(target=_open, daemon=True)
        t.start()

    def start_eel(port):
        url = f"http://127.0.0.1:{port}/gui/index.html"
        print(f"Starting server on port {port}...")
        print(f"  >> URL: {url}")
        # Launch browser in background thread
        open_browser_delayed(url)
        # Start eel server (blocks main thread) — mode=None means no auto-browser
        eel.start('gui/index.html', host='127.0.0.1', port=port, mode=None, 
                  size=(1400, 900),
                  close_callback=lambda route, websockets: None)

    def is_port_free(port):
        """Check if port is completely free on both IPv4 and IPv6 loopback interfaces."""
        import socket
        # 1. Test if any active server is already accepting connections
        for addr in ['127.0.0.1', '::1']:
            try:
                s = socket.create_connection((addr, port), timeout=0.15)
                s.close()
                return False  # An active server is already listening
            except (OSError, ConnectionRefusedError):
                pass
            except Exception:
                pass

        # 2. Test if we can bind exclusively without collision
        for family, addr in [(socket.AF_INET, '127.0.0.1'), (socket.AF_INET6, '::1')]:
            try:
                with socket.socket(family, socket.SOCK_STREAM) as s:
                    if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                        try:
                            s.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                        except Exception:
                            pass
                    s.bind((addr, port))
            except OSError:
                return False
            except Exception:
                pass
        return True

    def get_clean_port(preferred=8000):
        for candidate in [preferred, 8008, 8080, 8888]:
            if is_port_free(candidate):
                return candidate
        return 0

    target_port = get_clean_port(8000)
    try:
        print(f"Attempting to start on port {target_port}...")
        start_eel(target_port)
    except OSError:
        print(f"Port {target_port} taken, falling back to random port...")
        start_eel(0)
    except (SystemExit, KeyboardInterrupt):
        pass
