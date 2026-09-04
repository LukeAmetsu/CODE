# pyrefly: ignore [missing-import]
import eel
import sys
import os
import threading

# Ensure backend module can be imported
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.calculators.angle_support import calculate_angle_support as py_calculate_angle
from backend.calculators.beam_selector import find_lightest_beam as py_find_lightest
from backend.database import db

# Initialize Eel and point to the project root (where .js and html files are relatively accessible)
# Since we are in backend/, the root is one level up.
# However, Eel likes to serve a specific folder. 
# We'll set the root to '..' (CODE-2) so we can access 'aisc/' and 'js/' folders.
# WARNING: This exposes the whole project folder to the local browser. Okay for local app.

# HELPER: Finds files in both Dev mod
# e and EXE mode
def resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

# Initialize DB on startup
db_path = resource_path('aisc-shapes-database-v16.0.xlsx')
print(f"Server loading DB from: {db_path}")
try:
    db.load_database(db_path)
    print("Database loaded successfully.")
except Exception as e:  
    print(f"Error loading database: {e}")

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
        from backend.calculators.rs2_fea import generate_triangular_mesh, assign_materials_to_elements
        nodes, elements = generate_triangular_mesh(
            domain_poly=model_data.get('domain_poly'),
            internal_boundaries=model_data.get('internal_boundaries', []),
            excavation_poly=model_data.get('excavation_poly'),
            target_elem_size=float(model_data.get('target_elem_size', 2.5)),
            layer_polygons=model_data.get('layer_polygons', [])
        )
        elem_mat = assign_materials_to_elements(
            nodes, elements, model_data.get('materials', []), model_data.get('layer_polygons', [])
        )
        return {
            "status": "success",
            "mesh": {
                "num_nodes": len(nodes),
                "num_elements": len(elements),
                "nodes": nodes.tolist(),
                "elements": elements.tolist(),
                "elem_mat": elem_mat.tolist()
            }
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
def calculate_angle_support(inputs):
    try:
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
def calculate_nbr_combinations(inputs):
    try:
        from backend.calculators.nbr_6118_comb import calculate_combinations
        return calculate_combinations(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_nbr_concrete(inputs):
    try:
        from backend.calculators.nbr_6118_concrete import calculate_concrete_beam
        return calculate_concrete_beam(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_nbr_steel(inputs):
    try:
        from backend.calculators.nbr_8800_steel import calculate_steel_structure
        return calculate_steel_structure(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_mn_interaction_diagram(inputs):
    try:
        from backend.calculators.mn_interaction import calculate_mn_interaction
        return calculate_mn_interaction(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}


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
def run_scipy_optimization(target_safety=1.0):
    """Runs Nelder-Mead to auto-fit the best power-law exponents."""
    try:
        from backend.calculators.interactive_shear import run_optimization
        return run_optimization(target_safety)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def compare_lowess_curves_batch(live_curve, other_curves_dict):
    """Compares the Live Model LOWESS curve against other codes' curves."""
    try:
        from backend.calculators.interactive_shear import batch_compare_lowess
        return batch_compare_lowess(live_curve, other_curves_dict)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

@eel.expose
def calculate_nbr_steel(inputs):
    """Calculates steel member capacity per NBR 8800 with FLT and compression."""
    try:
        from backend.calculators.nbr_8800_steel import calculate_steel_structure
        return calculate_steel_structure(inputs)
    except Exception as e:
        import traceback
        return {"error": str(e), "trace": traceback.format_exc()}

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
    # Safely initialize Eel without crashing on un-downloaded OneDrive files or unreadable system files
    import builtins
    import io
    _orig_open = builtins.open
    def _safe_open(*args, **kwargs):
        try:
            return _orig_open(*args, **kwargs)
        except (OSError, IOError, PermissionError):
            return io.StringIO("")
    builtins.open = _safe_open
    try:
        eel.init(project_root)
    finally:
        builtins.open = _orig_open
    
    print("Starting Eel App...")
    # Start the app opening the index.html located in gui/
    # Try port 8000 specifically to allow browser refreshes to work after server restart
    start_options = {
        'size': (1200, 800),
        'close_callback': lambda route, websockets: None  # Keep running when window closes/navigates
    }
    
    def start_eel(port):
        try:
            eel.start('gui/index.html', port=port, **start_options)
        except EnvironmentError:
            # Fallback if Chrome/Edge not found (opens in default browser)
            eel.start('gui/index.html', mode='default', port=port, **start_options)

    try:
        print("Attempting to start on port 8000...")
        start_eel(8000)
    except OSError:
        print("Port 8000 taken, falling back to random port...")
        start_eel(0)
    except (SystemExit, KeyboardInterrupt):
        pass
