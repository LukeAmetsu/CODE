import os
import sys
import json
import math
import numpy as np

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import FEA engine
from backend.calculators.rs2_fea import (
    get_preset_model,
    full_analysis_pipeline,
    generate_triangular_mesh,
    assign_materials_to_elements
)

output_dir = os.path.join(os.getcwd(), 'test_files', 'rs2')
os.makedirs(output_dir, exist_ok=True)

test_cases = [
    {
        'filename': '01_talude_estabilidade_ssr.json',
        'title': 'Talude de Corte com NA e Sobrecarga (SSR Benchmark)',
        'preset': 'slope',
        'run_ssr': True,
        'soilProps': {
            'E': 35000,
            'nu': 0.32,
            'gamma': 19.0,
            'c': 15.0,
            'phi': 24.0,
            'psi': 0.0,
            'tCut': 5.0,
            'k0': 0.55,
            'meshDensity': 'medium',
            'waterTable': 9.0,
            'surcharge': 15.0,
            'preset': 'slope'
        }
    },
    {
        'filename': '02_escavacao_profunda_rebaixamento.json',
        'title': 'Escavação Profunda (Poço Retentor e Sobrecarga Lateral)',
        'preset': 'excavation',
        'run_ssr': False,
        'soilProps': {
            'E': 28000,
            'nu': 0.30,
            'gamma': 18.5,
            'c': 12.0,
            'phi': 26.0,
            'psi': 0.0,
            'tCut': 4.0,
            'k0': 0.50,
            'meshDensity': 'medium',
            'waterTable': 16.0,
            'surcharge': 25.0,
            'preset': 'excavation'
        }
    },
    {
        'filename': '03_tunel_cavidade_rochosa.json',
        'title': 'Túnel Circular Subterrâneo em Maciço Rochoso (K0=0.8)',
        'preset': 'tunnel',
        'run_ssr': False,
        'soilProps': {
            'E': 120000,
            'nu': 0.24,
            'gamma': 24.0,
            'c': 45.0,
            'phi': 32.0,
            'psi': 5.0,
            'tCut': 15.0,
            'k0': 0.80,
            'meshDensity': 'medium',
            'waterTable': 0.0,
            'surcharge': 0.0,
            'preset': 'tunnel'
        }
    },
    {
        'filename': '04_sapata_capacidade_de_carga.json',
        'title': 'Sapata Corrida de Fundação (Capacidade de Carga Elastoplástica)',
        'preset': 'footing',
        'run_ssr': False,
        'soilProps': {
            'E': 32000,
            'nu': 0.30,
            'gamma': 18.0,
            'c': 20.0,
            'phi': 28.0,
            'psi': 2.0,
            'tCut': 6.0,
            'k0': 0.50,
            'meshDensity': 'fine',
            'waterTable': 0.0,
            'surcharge': 120.0,
            'preset': 'footing'
        }
    },
    {
        'filename': '05_talude_com_camada_fraca.json',
        'title': 'Talude Estratificado com Camada de Argila Mole Intercalada',
        'preset': 'custom_weak_seam',
        'run_ssr': True,
        'soilProps': {
            'E': 22000,
            'nu': 0.35,
            'gamma': 17.5,
            'c': 8.0,
            'phi': 16.0,
            'psi': 0.0,
            'tCut': 2.0,
            'k0': 0.60,
            'meshDensity': 'medium',
            'waterTable': 12.0,
            'surcharge': 10.0,
            'preset': 'custom'
        }
    }
]

print("=== Generating RS2 Geotechnical Test Project Files ===")

for case in test_cases:
    print(f"\nProcessing: {case['title']} ({case['filename']})...")
    
    if case['preset'] == 'custom_weak_seam':
        # Create custom slope with weak seam at y=10m to y=12m
        model = {
            'name': 'Talude com Camada Fraca Intercalada',
            'type': 'slope',
            'domain_poly': [
                [0.0, 0.0],
                [65.0, 0.0],
                [65.0, 28.0],
                [40.0, 28.0],
                [18.0, 10.0],
                [0.0, 10.0]
            ],
            'internal_boundaries': [
                [[0.0, 10.0], [65.0, 10.0]],
                [[0.0, 12.0], [65.0, 12.0]]
            ],
            'layer_polygons': [
                [[0.0, 12.0], [65.0, 12.0], [65.0, 28.0], [40.0, 28.0], [18.0, 10.0], [0.0, 10.0]],
                [[0.0, 10.0], [65.0, 10.0], [65.0, 12.0], [0.0, 12.0]],
                [[0.0, 0.0], [65.0, 0.0], [65.0, 10.0], [0.0, 10.0]]
            ],
            'excavation_poly': None,
            'materials': [
                {
                    'name': 'Solo de Cobertura',
                    'color': '#d97706',
                    'gamma': 18.5,
                    'E': 30000.0,
                    'nu': 0.30,
                    'c': 18.0,
                    'phi': 26.0,
                    'tension': 6.0
                },
                {
                    'name': 'Camada Fraca (Argila Mole)',
                    'color': '#dc2626',
                    'gamma': 16.5,
                    'E': 10000.0,
                    'nu': 0.38,
                    'c': 6.0,
                    'phi': 14.0,
                    'tension': 1.0
                },
                {
                    'name': 'Maciço Inferior Firme',
                    'color': '#475569',
                    'gamma': 22.0,
                    'E': 90000.0,
                    'nu': 0.25,
                    'c': 50.0,
                    'phi': 34.0,
                    'tension': 20.0
                }
            ],
            'water_table': [
                [0.0, 10.0],
                [18.0, 11.0],
                [40.0, 20.0],
                [65.0, 22.0]
            ],
            'surcharges': [
                {'x1': 45.0, 'x2': 60.0, 'q': 15.0}
            ],
            'target_elem_size': 2.8,
            'k0': 0.55
        }
    else:
        model = get_preset_model(case['preset'])
        if case['soilProps']:
            # Adjust first material properties to match user case
            model['materials'][0]['E'] = float(case['soilProps']['E'])
            model['materials'][0]['nu'] = float(case['soilProps']['nu'])
            model['materials'][0]['gamma'] = float(case['soilProps']['gamma'])
            model['materials'][0]['c'] = float(case['soilProps']['c'])
            model['materials'][0]['phi'] = float(case['soilProps']['phi'])
            model['materials'][0]['tension'] = float(case['soilProps']['tCut'])
            model['k0'] = float(case['soilProps']['k0'])

    # Solve FEA pipeline
    pipeline_res = full_analysis_pipeline(model, run_ssr=case['run_ssr'])
    
    if pipeline_res.get('status') != 'success':
        print(f"  [ERROR] Pipeline failed: {pipeline_res.get('error')}")
        continue

    mesh_data = pipeline_res['mesh']
    results_data = pipeline_res['results']
    
    fs_val = results_data.get('critical_srf')
    fs_str = f"FS={fs_val:.3f}" if fs_val else "Equilíbrio Estático OK"
    print(f"  [SUCCESS] Meshed with {mesh_data['num_nodes']} nodes, {mesh_data['num_elements']} elements | {fs_str} | Max Displ={results_data.get('max_displacement', 0)*1000:.2f} mm")

    project_payload = {
        'app': 'RS2_Geotechnical_FEA',
        'version': '2.0',
        'title': case['title'],
        'timestamp': '2026-09-03T12:00:00.000Z',
        'soilProps': case['soilProps'],
        'model': model,
        'mesh': mesh_data,
        'results': results_data,
        'activeField': 'Utot' if not case['run_ssr'] else 'eps_p'
    }

    filepath = os.path.join(output_dir, case['filename'])
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(project_payload, f, indent=2)

    print(f"  -> Saved file: {case['filename']} ({os.path.getsize(filepath) / 1024:.1f} KB)")

print("\n=== All 5 RS2 Test Project Files Generated Successfully! ===")
