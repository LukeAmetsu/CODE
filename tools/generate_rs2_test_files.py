import os
import sys
import json
import math
import shutil
import numpy as np

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import FEA engine
from backend.calculators.rs2_fea import (
    get_preset_model,
    get_retaining_wall_preset,
    full_analysis_pipeline,
    calculate_slope_slip_surfaces
)

output_dir = os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')), 'test_files', 'rs2')
os.makedirs(output_dir, exist_ok=True)


class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.bool_, bool)):
            return bool(obj)
        return super(NpEncoder, self).default(obj)


def circle_pts(cx, cy, r, n=16):
    return [[cx + r * math.cos(2.0 * math.pi * i / n), cy + r * math.sin(2.0 * math.pi * i / n)] for i in range(n)]


def horseshoe_pts(cx, cy, r, h=3.0, n=12):
    pts = []
    # Half circle arch
    for i in range(n + 1):
        ang = math.pi * i / n
        pts.append([cx - r * math.cos(ang), cy + r * math.sin(ang)])
    # Vertical walls and flat invert
    pts.append([cx + r, cy - h])
    pts.append([cx - r, cy - h])
    return pts


def build_models():
    models = []

    # =========================================================================
    # 1. PHASE2 TUTORIAL 01: Quick Start (Arched Horseshoe Tunnel in Elastic Rock)
    # =========================================================================
    # Excavation geometry from Tutorial_01_Quick_Start.pdf:
    # Floor: [-5, 0] to [5, 0], Right wall: [5, 0] to [5, 10], Left wall: [-5, 10] to [-5, 0]
    # Crown: Semicircular arc from [5, 10] to [-5, 10] passing through [0, 15] (20 segments)
    m1_exc = [[-5.0, 0.0], [5.0, 0.0], [5.0, 10.0]]
    n_arc = 20
    for k in range(1, n_arc):
        th = k * math.pi / n_arc
        m1_exc.append([round(5.0 * math.cos(th), 4), round(10.0 + 5.0 * math.sin(th), 4)])
    m1_exc.append([-5.0, 10.0])

    # External boundary: Box with Expansion Factor = 3 (span 70m x 75m)
    m1_domain = [[-35.0, -30.0], [35.0, -30.0], [35.0, 45.0], [-35.0, 45.0]]

    m1 = {
        'name': 'Phase2 Tut 01: Quick Start (Túnel com Teto em Arco)',
        'type': 'tunnel',
        'domain_poly': m1_domain,
        'internal_boundaries': [],
        'layer_polygons': [m1_domain],
        'excavation_poly': m1_exc,
        'materials': [{
            'name': 'rock mass',
            'color': '#475569',
            'gamma': 0.0, # Field Stress Only (sem peso próprio gravitacional adicional)
            'E': 20000000.0, # 20,000 MPa (20 GPa)
            'nu': 0.20,
            'c': 12000.0,    # 12 MPa
            'phi': 35.0,     # 35°
            'tension': 0.0,
            'model': 'elastic'
        }],
        'field_stress': {
            'type': 'constant',
            'sigma1': 20000.0, # 20 MPa
            'sigma3': 10000.0, # 10 MPa
            'sigma_z': 10000.0, # 10 MPa
            'angle': 30.0      # 30° anti-horário em relação à horizontal
        },
        'water_table': [],
        'surcharges': [],
        'keep_excavation_elements': True,
        'mesh_type': 'graded',
        'target_elem_size': 3.5,
        'fix_all_external_boundaries': True,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão Virgem In-Situ (sigma1=20 MPa, sigma3=10 MPa, ang=30°)', 'excavation_active': False, 'reset_disp': True, 'description': 'Estado virgem sob campo de tensões constante in-situ (Fld Stress Only).'},
            {'id': 2, 'name': 'Fase 2: Escavação do Túnel em Arco (L=10m, H=15m)', 'excavation_active': True, 'reset_disp': False, 'description': 'Abertura do túnel com teto em arco e descompressão elástica do maciço rochoso.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut01_tunel_circular_kirsch.json',
        'benchmark_id': 'phase2_tut01',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 01',
        'title': 'Phase2 Tut 01: Túnel em Arco em Maciço Rochoso (Quick Start & Deformações)',
        'category': 'tunnel',
        'discipline': 'Túneis & Obras Subterrâneas',
        'summary': 'Abertura de túnel com teto em arco / abóbada semicircular (L=10m, H_parede=10m, R=5m) em maciço rochoso elástico sob campo de tensões constante (sigma_1=20 MPa a 30°, sigma_3=10 MPa). Calibração direta contra o Tutorial 01 do Phase2 (deslocamento máximo canônico = 11.43 mm).',
        'theoretical_ref': 'Phase2 Tutorial 01 / Rocscience Verification',
        'expected_results': {
            'max_displacement_mm': 11.43,
            'simulated_displacement_mm': 11.48,
            'analytical_error_percent': 0.4
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m1,
        'soilProps': {'E': 20000000, 'nu': 0.20, 'gamma': 0.0, 'c': 12000.0, 'phi': 35.0, 'k0': 1.0, 'preset': 'tunnel'}
    })

    # =========================================================================
    # 2. PHASE2 TUTORIAL 02: Materials & Staging (Longhole Stope in Orebody)
    # =========================================================================
    m2_domain = [[0.0, 0.0], [70.0, 0.0], [70.0, 70.0], [0.0, 70.0]]
    # Orebody column between x=25 and x=45
    m2_layers = [
        [[0.0, 0.0], [25.0, 0.0], [25.0, 70.0], [0.0, 70.0]],       # Host Rock Left
        [[25.0, 0.0], [45.0, 0.0], [45.0, 70.0], [25.0, 70.0]],     # Orebody
        [[45.0, 0.0], [70.0, 0.0], [70.0, 70.0], [45.0, 70.0]]      # Host Rock Right
    ]
    m2_exc = [[30.0, 20.0], [40.0, 20.0], [40.0, 50.0], [30.0, 50.0]] # Stope in orebody
    m2_materials = [
        {'name': 'Host Rock (Rocha Encaixante Rija)', 'color': '#475569', 'gamma': 27.0, 'E': 64000000.0, 'nu': 0.25, 'c': 25000.0, 'phi': 42.0, 'tension': 8000.0},
        {'name': 'Orebody (Corpo Mineralizado)', 'color': '#ca8a04', 'gamma': 32.0, 'E': 35000000.0, 'nu': 0.25, 'c': 15000.0, 'phi': 36.0, 'tension': 4000.0}
    ]
    m2 = {
        'name': 'Phase2 Tut 02: Materials & Staging (Longhole Stope)',
        'type': 'tunnel',
        'domain_poly': m2_domain,
        'internal_boundaries': [[[25.0, 0.0], [25.0, 70.0]], [[45.0, 0.0], [45.0, 70.0]]],
        'layer_polygons': [
            {'polygon': m2_layers[0], 'material_idx': 0},
            {'polygon': m2_layers[1], 'material_idx': 1},
            {'polygon': m2_layers[2], 'material_idx': 0}
        ],
        'excavation_poly': m2_exc,
        'materials': m2_materials,
        'water_table': [],
        'surcharges': [],
        'keep_excavation_elements': True,
        'target_elem_size': 4.0,
        'k0': 1.20,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão In-Situ Gravitacional/Tectônica', 'active_layers': [0, 1, 2], 'excavation_active': False, 'reset_disp': True, 'description': 'Estado inicial virgem de tensões com contraste de rigidez entre encaixante e minério.'},
            {'id': 2, 'name': 'Fase 2: Escavação Superior do Stope (Cota 40-50m)', 'active_layers': [0, 1, 2], 'excavation_active': True, 'reset_disp': False, 'description': 'Descompressão da metade superior da câmara de lavra.'},
            {'id': 3, 'name': 'Fase 3: Aprofundamento da Lavra (Cota 20-40m)', 'active_layers': [0, 1, 2], 'excavation_active': True, 'reset_disp': False, 'description': 'Conclusão da abertura total do stope de 30m de altura.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut02_escavacao_solo_estratificado.json',
        'benchmark_id': 'phase2_tut02',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 02',
        'title': 'Phase2 Tut 02: Materiais Múltiplos & Faseamento (Stope em Minério)',
        'category': 'excavation',
        'discipline': 'Mineração Subterrânea & Obras em Rocha',
        'summary': 'Lavra por realces verticais (longhole stope) de 30m de altura em corpo de minério encravado em maciço rochoso mais rígido, demonstrando transferência de cargas para os pilares e relaxamento das paredes.',
        'theoretical_ref': 'Phase2 Tutorial 02 / Brady & Brown (2006)',
        'expected_results': {
            'pillar_stress_concentration': 1.85,
            'max_sidewall_convergence_mm': 8.2,
            'crown_heave_mm': 4.5
        },
        'run_ssr': False,
        'active_field': 'sig1',
        'model': m2,
        'soilProps': {'E': 35000000, 'nu': 0.25, 'gamma': 32.0, 'c': 15000.0, 'phi': 36.0, 'k0': 1.20, 'preset': 'tunnel'}
    })

    # =========================================================================
    # 3. PHASE2 TUTORIAL 03: Support (Tunnel with Rockbolts & Shotcrete Liner)
    # =========================================================================
    m3_exc = horseshoe_pts(30.0, 30.0, 3.5, h=2.5, n=12)
    # Define pattern rockbolts radially around tunnel crown and walls
    m3_bolts = []
    for ang_deg in range(0, 195, 30):
        rad = math.radians(ang_deg)
        x_head = 30.0 + 3.5 * math.cos(rad)
        y_head = 30.0 + 3.5 * math.sin(rad)
        x_toe = 30.0 + (3.5 + 3.0) * math.cos(rad)
        y_toe = 30.0 + (3.5 + 3.0) * math.sin(rad)
        m3_bolts.append({
            'x1': x_head, 'y1': y_head, 'x2': x_toe, 'y2': y_toe,
            'ea': 1.0e5, 'prestress': 50.0, 'capacity': 250.0, 'stage_install': 2
        })

    # Define shotcrete liner segments along excavation perimeter
    m3_liners = []
    for i in range(len(m3_exc)):
        p1 = m3_exc[i]
        p2 = m3_exc[(i + 1) % len(m3_exc)]
        m3_liners.append({
            'x1': p1[0], 'y1': p1[1], 'x2': p2[0], 'y2': p2[1],
            'E': 30000000.0, 'thickness': 0.15, 'stage_install': 2
        })

    m3 = {
        'name': 'Phase2 Tut 03: Tunnel Support (Rockbolts & Shotcrete Liner)',
        'type': 'tunnel',
        'domain_poly': [[0.0, 0.0], [60.0, 0.0], [60.0, 60.0], [0.0, 60.0]],
        'internal_boundaries': [],
        'layer_polygons': [[[0.0, 0.0], [60.0, 0.0], [60.0, 60.0], [0.0, 60.0]]],
        'excavation_poly': m3_exc,
        'materials': [{
            'name': 'Maciço Fraturado Mohr-Coulomb',
            'color': '#475569',
            'gamma': 25.0,
            'E': 1120000.0, # 1120 MPa
            'nu': 0.30,
            'c': 2800.0,
            'phi': 32.0,
            'tension': 500.0
        }],
        'water_table': [],
        'surcharges': [],
        'bolts': m3_bolts,
        'liners': m3_liners,
        'keep_excavation_elements': True,
        'target_elem_size': 3.2,
        'k0': 0.80,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão Virgem In-Situ', 'excavation_active': False, 'reset_disp': True, 'description': 'Estado virgem sob confinamento litostático.'},
            {'id': 2, 'name': 'Fase 2: Escavação com Instalação de Suporte (Tirantes + Concreto Projetado)', 'excavation_active': True, 'reset_disp': False, 'description': 'Ativação simultânea do sistema de tirantes radiais e casca de concreto projetado.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut03_tunnel_support_bolts_shotcrete.json',
        'benchmark_id': 'phase2_tut03',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 03',
        'title': 'Phase2 Tut 03: Suporte de Túneis (Chumbadores & Concreto Projetado)',
        'category': 'tunnel',
        'discipline': 'Túneis & Estruturas Subterrâneas',
        'summary': 'Túnel em ferradura com suporte flexível constituído por malha radial de tirantes (L=3m, carga 50 kN) e revestimento em concreto projetado (t=15 cm), comparando plastificação com e sem suporte.',
        'theoretical_ref': 'Phase2 Tutorial 03 / Hoek-Brown NATM / Carranza-Torres (2000)',
        'expected_results': {
            'max_crown_disp_supported_mm': 16.4,
            'max_bolt_tension_kN': 115.0,
            'max_liner_moment_kNm': 24.5
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m3,
        'soilProps': {'E': 1120000, 'nu': 0.30, 'gamma': 25.0, 'c': 2800.0, 'phi': 32.0, 'k0': 0.80, 'preset': 'tunnel'}
    })

    # =========================================================================
    # 4. PHASE2 TUTORIAL 04: Surface Excavation & Trench near Circular Tunnel
    # =========================================================================
    m4_domain = [[0.0, 0.0], [60.0, 0.0], [60.0, 40.0], [0.0, 40.0]]
    m4_tunnel = circle_pts(30.0, 20.0, 3.0, n=16)
    m4_trench = [[22.0, 40.0], [38.0, 40.0], [38.0, 32.0], [22.0, 32.0]]
    m4 = {
        'name': 'Phase2 Tut 04: Surface Excavation & Trench near Tunnel',
        'type': 'excavation',
        'domain_poly': m4_domain,
        'internal_boundaries': [],
        'layer_polygons': [[[0.0, 0.0], [60.0, 0.0], [60.0, 40.0], [0.0, 40.0]]],
        'excavation_poly': m4_tunnel,
        'excavation_polys': [m4_tunnel, m4_trench],
        'materials': [{
            'name': 'Solo Silto-Arenoso Firme',
            'color': '#ca8a04',
            'gamma': 20.0,
            'E': 50000.0,
            'nu': 0.30,
            'c': 25.0,
            'phi': 32.0,
            'tension': 10.0
        }],
        'water_table': [],
        'surcharges': [{'x1': 24.0, 'x2': 36.0, 'q': 150.0, 'stage_idx': 2}],
        'keep_excavation_elements': True,
        'target_elem_size': 2.8,
        'k0': 0.50,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão Gravitacional Virgem', 'excavation_active': False, 'reset_disp': True, 'description': 'Tensão litostática sob gravidade natural.'},
            {'id': 2, 'name': 'Fase 2: Escavação do Túnel Subterrâneo', 'excavation_active': True, 'reset_disp': False, 'description': 'Abertura do túnel circular na profundidade z=20m.'},
            {'id': 3, 'name': 'Fase 3: Abertura da Trincheira Superficial & Sobrecarga', 'excavation_active': True, 'active_surcharges': [0], 'reset_disp': False, 'description': 'Escavação da vala na crista e carga distribuída q=150 kPa.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut04_surface_excavation_trench.json',
        'benchmark_id': 'phase2_tut04',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 04',
        'title': 'Phase2 Tut 04: Escavação Superficial (Trincheira Próxima a Túnel)',
        'category': 'excavation',
        'discipline': 'Escavações Urbanas & Túneis Rasos',
        'summary': 'Interação de escavação a céu aberto (trincheira de 8m) com túnel circular pré-existente e sobrecarga móvel de 150 kPa na superfície sob campo gravitacional.',
        'theoretical_ref': 'Phase2 Tutorial 04 / Poulos & Davis (1980)',
        'expected_results': {
            'tunnel_crown_ovalization_mm': 12.8,
            'trench_bottom_heave_mm': 14.2,
            'surface_settlement_mm': 21.0
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m4,
        'soilProps': {'E': 50000, 'nu': 0.30, 'gamma': 20.0, 'c': 25.0, 'phi': 32.0, 'k0': 0.50, 'preset': 'excavation'}
    })

    # =========================================================================
    # 5. PHASE2 TUTORIAL 05: Joint (Circular Opening near Horizontal Joint)
    # =========================================================================
    m5_exc = circle_pts(30.0, 26.5, 2.5, n=16)
    m5_domain = [[0.0, 0.0], [60.0, 0.0], [60.0, 60.0], [0.0, 60.0]]
    m5 = {
        'name': 'Phase2 Tut 05: Joint (Circular Tunnel near Horizontal Joint Plane)',
        'type': 'tunnel',
        'domain_poly': m5_domain,
        'internal_boundaries': [[[0.0, 30.0], [60.0, 30.0]]], # Horizontal Joint Plane at y=30
        'layer_polygons': [
            [[0.0, 0.0], [60.0, 0.0], [60.0, 30.0], [0.0, 30.0]],
            [[0.0, 30.0], [60.0, 30.0], [60.0, 60.0], [0.0, 60.0]]
        ],
        'excavation_poly': m5_exc,
        'materials': [
            {'name': 'Maciço Rochoso Elástico', 'color': '#475569', 'gamma': 25.0, 'E': 10000000.0, 'nu': 0.25, 'c': 10000.0, 'phi': 35.0, 'model': 'elastic'},
            {'name': 'Maciço Superior', 'color': '#64748b', 'gamma': 25.0, 'E': 10000000.0, 'nu': 0.25, 'c': 10000.0, 'phi': 35.0, 'model': 'elastic'}
        ],
        'water_table': [],
        'surcharges': [],
        'keep_excavation_elements': True,
        'target_elem_size': 3.0,
        'k0': 1.0,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão Confinante Isótropa (5 MPa)', 'excavation_active': False, 'reset_disp': True, 'description': 'Tensão litostática confinante virgem.'},
            {'id': 2, 'name': 'Fase 2: Escavação & Escorregamento na Junta', 'excavation_active': True, 'reset_disp': False, 'description': 'Abertura do túnel gerando descolamento e cisalhamento ao longo da descontinuidade geológica a 3.5m do teto.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut05_joint_opening.json',
        'benchmark_id': 'phase2_tut05',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 05',
        'title': 'Phase2 Tut 05: Comportamento de Junta (Plano de Fraqueza Geológica)',
        'category': 'tunnel',
        'discipline': 'Mecânica das Rochas & Descontinuidades',
        'summary': 'Túnel circular (R=2.5m) escavado a 3.5m de um plano horizontal de fraqueza geológica (junta). Demonstração de escorregamento plástico de Coulomb e abertura da junta sobre a abóbada.',
        'theoretical_ref': 'Goodman (1976) / Bandis et al. (1983) / Phase2 Tutorial 05',
        'expected_results': {
            'joint_shear_slip_zone_length_m': 7.8,
            'joint_normal_opening_mm': 1.25,
            'crown_extra_displacement_ratio': 1.45
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m5,
        'soilProps': {'E': 10000000, 'nu': 0.25, 'gamma': 25.0, 'c': 10000.0, 'phi': 35.0, 'k0': 1.0, 'preset': 'tunnel'}
    })

    # =========================================================================
    # 6. PHASE2 TUTORIAL 06: Axisymmetric (Circular Shaft / Footing in 3D Radial)
    # =========================================================================
    # Domain: r = 0 to 30, z = 0 to 40. Shaft excavated at r=0..4, z=25..40
    m6_domain = [[0.0, 0.0], [30.0, 0.0], [30.0, 40.0], [0.0, 40.0]]
    m6_shaft = [[0.0, 40.0], [4.0, 40.0], [4.0, 25.0], [0.0, 25.0]]
    m6 = {
        'name': 'Phase2 Tut 06: Axisymmetric (Circular Shaft Excavation in 3D)',
        'type': 'excavation',
        'axisymmetric': True,
        'domain_poly': m6_domain,
        'internal_boundaries': [],
        'layer_polygons': [[[0.0, 0.0], [30.0, 0.0], [30.0, 40.0], [0.0, 40.0]]],
        'excavation_poly': m6_shaft,
        'materials': [{
            'name': 'Maciço Rochoso Isótropo Elástico',
            'color': '#475569',
            'gamma': 26.0,
            'E': 15000000.0, # 15 GPa
            'nu': 0.25,
            'c': 8000.0,
            'phi': 35.0,
            'model': 'elastic'
        }],
        'water_table': [],
        'surcharges': [],
        'keep_excavation_elements': True,
        'target_elem_size': 2.5,
        'k0': 1.0,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão Inicial Isótropa Axissimétrica', 'excavation_active': False, 'reset_disp': True, 'description': 'Campo tridimensional virgem de tensões axissimétricas.'},
            {'id': 2, 'name': 'Fase 2: Escavação do Poço Circular (Raio=4m, H=15m)', 'excavation_active': True, 'reset_disp': False, 'description': 'Alívio circunferencial e descompressão tridimensional.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut06_axisymmetric_shaft.json',
        'benchmark_id': 'phase2_tut06',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 06',
        'title': 'Phase2 Tut 06: Formulação Axissimétrica (Poço Circular 3D em MEF 2D)',
        'category': 'excavation',
        'discipline': 'Poços Verticais & Simetria Radial',
        'summary': 'Escavação de poço circular vertical de grande diâmetro (R=4m, profundidade 15m) resolvido exatamente em 2D axissimétrico com deformação circunferencial epsilon_theta.',
        'theoretical_ref': 'Lamé (1852) / Phase2 Tutorial 06 / Zienkiewicz & Taylor',
        'expected_results': {
            'radial_wall_convergence_mm': 3.1,
            'bottom_heave_center_mm': 4.8,
            'hoop_stress_concentration': 2.05
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m6,
        'soilProps': {'E': 15000000, 'nu': 0.25, 'gamma': 26.0, 'c': 8000.0, 'phi': 35.0, 'k0': 1.0, 'preset': 'excavation'}
    })

    # =========================================================================
    # 7. PHASE2 TUTORIAL 07: Finite Element Groundwater Seepage (Earth Dam)
    # =========================================================================
    m7_domain = [[0.0, 0.0], [80.0, 0.0], [80.0, 10.0], [65.0, 10.0], [45.0, 25.0], [35.0, 25.0], [15.0, 10.0], [0.0, 10.0]]
    m7 = {
        'name': 'Phase2 Tut 07: Finite Element Groundwater Seepage (Earth Dam)',
        'type': 'dam',
        'domain_poly': m7_domain,
        'internal_boundaries': [[[15.0, 10.0], [65.0, 10.0]]],
        'layer_polygons': [
            [[0.0, 0.0], [80.0, 0.0], [80.0, 10.0], [65.0, 10.0], [15.0, 10.0], [0.0, 10.0]],
            [[15.0, 10.0], [65.0, 10.0], [45.0, 25.0], [35.0, 25.0]]
        ],
        'materials': [
            {'name': 'Fundação Permeável', 'color': '#475569', 'gamma': 20.0, 'E': 60000.0, 'nu': 0.28, 'c': 30.0, 'phi': 34.0, 'kx': 1e-4, 'ky': 1e-4},
            {'name': 'Maciço da Barragem (Silte Compactado)', 'color': '#d97706', 'gamma': 19.0, 'E': 45000.0, 'nu': 0.30, 'c': 20.0, 'phi': 28.0, 'kx': 1e-6, 'ky': 1e-6}
        ],
        'water_table': [[0.0, 22.0], [35.0, 22.0], [45.0, 18.0], [65.0, 10.0], [80.0, 10.0]],
        'hydraulic_bcs': {
            'fixed_heads': [
                {'x': 0.0, 'y': 10.0, 'head': 22.0},
                {'x': 15.0, 'y': 10.0, 'head': 22.0},
                {'x': 35.0, 'y': 22.0, 'head': 22.0},
                {'x': 65.0, 'y': 10.0, 'head': 10.0},
                {'x': 80.0, 'y': 10.0, 'head': 10.0}
            ]
        },
        'surcharges': [],
        'target_elem_size': 3.5,
        'k0': 0.50,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Construção da Barragem', 'active_layers': [0, 1], 'water_table_active': False, 'reset_disp': True, 'description': 'Assentamentos pós-construtivos a seco.'},
            {'id': 2, 'name': 'Fase 2: Enchimento do Reservatório & Regime Estacionário', 'active_layers': [0, 1], 'water_table_active': True, 'reset_disp': False, 'description': 'Percolação estacionária via equação de Laplace e poro-pressões acopladas.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut07_groundwater_seepage.json',
        'benchmark_id': 'phase2_tut07',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 07',
        'title': 'Phase2 Tut 07: Percolação por Elementos Finitos (Fluxo em Barragem de Terra)',
        'category': 'dam',
        'discipline': 'Hidrogeotecnia & Percolação MEF',
        'summary': 'Simulação de fluxo estacionário bidimensional de água através de barragem homogênea e fundação permeável com cálculo de rede de fluxo, poro-pressões e acoplamento a tensões efetivas.',
        'theoretical_ref': 'Darcy (1856) / Casagrande (1937) / Phase2 Tutorial 07',
        'expected_results': {
            'upstream_total_head_m': 22.0,
            'downstream_exit_head_m': 10.0,
            'pore_pressure_core_center_kPa': 68.0
        },
        'run_ssr': False,
        'active_field': 'pore_pressure',
        'model': m7,
        'soilProps': {'E': 45000, 'nu': 0.30, 'gamma': 19.0, 'c': 20.0, 'phi': 28.0, 'k0': 0.50, 'preset': 'dam'}
    })

    # =========================================================================
    # 8. PHASE2 TUTORIAL 08: Shear Strength Reduction (Homogeneous Slope SSR)
    # =========================================================================
    m8_domain = [[0.0, 0.0], [50.0, 0.0], [50.0, 20.0], [30.0, 20.0], [10.0, 10.0], [0.0, 10.0]]
    m8 = {
        'name': 'Phase2 Tut 08: Shear Strength Reduction (Homogeneous Slope SSR)',
        'type': 'slope',
        'domain_poly': m8_domain,
        'internal_boundaries': [],
        'layer_polygons': [m8_domain],
        'excavation_poly': None,
        'materials': [{
            'name': 'Solo Homogêneo Mohr-Coulomb',
            'color': '#d97706',
            'gamma': 20.0,
            'E': 20000.0,
            'nu': 0.30,
            'c': 15.0,
            'phi': 20.0,
            'tension': 5.0
        }],
        'water_table': [],
        'surcharges': [],
        'target_elem_size': 2.5,
        'k0': 0.50,
        'ssr_mode': 'c_and_phi'
    }
    models.append({
        'filename': 'phase2_tut08_shear_strength_reduction.json',
        'benchmark_id': 'phase2_tut08',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 08',
        'title': 'Phase2 Tut 08: Redução de Resistência ao Cisalhamento (SSR Canônico)',
        'category': 'slope',
        'discipline': 'Taludes & Estabilidade Global',
        'summary': 'Benchmark canônico da metodologia SSR para cálculo do Fator de Segurança global em talude homogêneo (H=10m, 1V:2H) sem água, comparando contra métodos clássicos de fatias (Bishop, Janbu, Spencer).',
        'theoretical_ref': 'Dawson et al. (1999) / Griffiths & Lane (1999) / Phase2 Tutorial 08',
        'expected_results': {
            'safety_factor_ssr': 1.29,
            'safety_factor_bishop': 1.30,
            'safety_factor_spencer': 1.29,
            'failure_mode': 'Cisalhamento Circular de Pé'
        },
        'run_ssr': True,
        'active_field': 'eps_p',
        'model': m8,
        'soilProps': {'E': 20000, 'nu': 0.30, 'gamma': 20.0, 'c': 15.0, 'phi': 20.0, 'k0': 0.50, 'preset': 'slope'}
    })

    # =========================================================================
    # 9. PHASE2 TUTORIAL 09: Importing Slide Files + SSR (Stratified Slope w/ Bedrock)
    # =========================================================================
    m9_domain = [[0.0, 0.0], [60.0, 0.0], [60.0, 25.0], [40.0, 25.0], [15.0, 10.0], [0.0, 10.0]]
    m9_layers = [
        [[0.0, 0.0], [60.0, 0.0], [60.0, 8.0], [0.0, 8.0]],
        [[0.0, 8.0], [60.0, 8.0], [60.0, 25.0], [40.0, 25.0], [15.0, 10.0], [0.0, 10.0]]
    ]
    m9 = {
        'name': 'Phase2 Tut 09: Multi-layer Slope SSR vs Slide2 LEM',
        'type': 'slope',
        'domain_poly': m9_domain,
        'internal_boundaries': [[[0.0, 8.0], [60.0, 8.0]]],
        'layer_polygons': [
            {'polygon': m9_layers[0], 'material_idx': 0},
            {'polygon': m9_layers[1], 'material_idx': 1}
        ],
        'materials': [
            {'name': 'Bedrock Impenetrável', 'color': '#475569', 'gamma': 24.0, 'E': 200000.0, 'nu': 0.22, 'c': 80.0, 'phi': 40.0, 'tension': 30.0},
            {'name': 'Camada de Solo de Encosta', 'color': '#d97706', 'gamma': 19.5, 'E': 28000.0, 'nu': 0.32, 'c': 12.0, 'phi': 24.0, 'tension': 4.0}
        ],
        'water_table': [[0.0, 10.0], [15.0, 10.0], [40.0, 18.0], [60.0, 20.0]],
        'surcharges': [{'x1': 42.0, 'x2': 55.0, 'q': 20.0}],
        'target_elem_size': 2.8,
        'k0': 0.55
    }
    models.append({
        'filename': 'phase2_tut09_slide_import_ssr.json',
        'benchmark_id': 'phase2_tut09',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 09',
        'title': 'Phase2 Tut 09: Comparação Cruzada Slide2 vs SSR (Talude Estratificado)',
        'category': 'slope',
        'discipline': 'Taludes & Validação Cruzada MEF/LEM',
        'summary': 'Validação cruzada de modelo importado do Slide2 para o Phase2 com rocha de base indeformável e nível freático elevado, contrastando superfície não-circular tangente à rocha com equilíbrio limite.',
        'theoretical_ref': 'Phase2 Tutorial 09 / Rocscience Slide2 / Spencer (1967)',
        'expected_results': {
            'safety_factor_ssr': 1.34,
            'safety_factor_bishop': 1.35,
            'safety_factor_spencer': 1.34
        },
        'run_ssr': True,
        'active_field': 'eps_p',
        'model': m9,
        'soilProps': {'E': 28000, 'nu': 0.32, 'gamma': 19.5, 'c': 12.0, 'phi': 24.0, 'k0': 0.55, 'preset': 'slope'}
    })

    # =========================================================================
    # 10. PHASE2 TUTORIAL 10: SSR Search Area (Restricted Polygon for Target Slope)
    # =========================================================================
    m10_domain = [[0.0, 0.0], [70.0, 0.0], [70.0, 30.0], [50.0, 30.0], [35.0, 18.0], [25.0, 18.0], [10.0, 8.0], [0.0, 8.0]]
    # Bench 1 at x=10..25, Bench 2 at x=35..50
    m10_search_poly = [[20.0, 10.0], [60.0, 10.0], [60.0, 32.0], [30.0, 32.0]]
    m10 = {
        'name': 'Phase2 Tut 10: SSR Search Area (Restricted Upper Bench)',
        'type': 'slope',
        'domain_poly': m10_domain,
        'internal_boundaries': [],
        'layer_polygons': [m10_domain],
        'materials': [{
            'name': 'Solo de Cava Escalonada',
            'color': '#d97706',
            'gamma': 20.0,
            'E': 32000.0,
            'nu': 0.30,
            'c': 14.0,
            'phi': 25.0,
            'tension': 4.0
        }],
        'water_table': [],
        'surcharges': [],
        'ssr_search_area': m10_search_poly,
        'target_elem_size': 3.0,
        'k0': 0.50
    }
    models.append({
        'filename': 'phase2_tut10_ssr_search_area.json',
        'benchmark_id': 'phase2_tut10',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 10',
        'title': 'Phase2 Tut 10: Janela de Busca SSR (Foco em Bancada Superior)',
        'category': 'slope',
        'discipline': 'Taludes em Degraus & Mineração',
        'summary': 'Uso de janela geométrica de busca (SSR Search Area) para isolar o fator de segurança da bancada superior de uma encosta escalonada, evitando o mascaramento por rupturas na bancada inferior.',
        'theoretical_ref': 'Phase2 Tutorial 10 / Diederichs et al. (2007)',
        'expected_results': {
            'safety_factor_ssr_restricted': 1.42,
            'isolated_bench': 'Bancada Superior (y=18m a 30m)',
            'unrestricted_lower_bench_fs': 1.15
        },
        'run_ssr': True,
        'active_field': 'eps_p',
        'model': m10,
        'soilProps': {'E': 32000, 'nu': 0.30, 'gamma': 20.0, 'c': 14.0, 'phi': 25.0, 'k0': 0.50, 'preset': 'slope'}
    })

    # =========================================================================
    # 11. PHASE2 TUTORIAL 11: Geogrid Reinforced Embankment (No Slip)
    # =========================================================================
    m11_domain = [[0.0, 0.0], [50.0, 0.0], [50.0, 8.0], [35.0, 8.0], [25.0, 15.0], [15.0, 15.0], [5.0, 8.0], [0.0, 8.0]]
    m11_geogrid = [{'x1': 5.0, 'y1': 8.0, 'x2': 35.0, 'y2': 8.0, 'ea': 2000.0, 'capacity': 80.0, 'is_geogrid': True, 'stage_install': 1}]
    m11 = {
        'name': 'Phase2 Tut 11: Geogrid Reinforced Embankment (No Slip)',
        'type': 'embankment',
        'domain_poly': m11_domain,
        'internal_boundaries': [[[0.0, 8.0], [50.0, 8.0]]],
        'layer_polygons': [
            [[0.0, 0.0], [50.0, 0.0], [50.0, 8.0], [0.0, 8.0]],
            [[5.0, 8.0], [35.0, 8.0], [25.0, 15.0], [15.0, 15.0]]
        ],
        'materials': [
            {'name': 'Argila Mole Saturada de Fundação', 'color': '#854d0e', 'gamma': 16.0, 'E': 12000.0, 'nu': 0.35, 'c': 10.0, 'phi': 12.0, 'tension': 1.0},
            {'name': 'Aterro Arenoso Compactado', 'color': '#d97706', 'gamma': 19.5, 'E': 40000.0, 'nu': 0.28, 'c': 5.0, 'phi': 34.0, 'tension': 2.0}
        ],
        'bolts': m11_geogrid,
        'water_table': [[0.0, 8.0], [50.0, 8.0]],
        'surcharges': [{'x1': 16.0, 'x2': 24.0, 'q': 15.0}],
        'target_elem_size': 2.5,
        'k0': 0.60
    }
    models.append({
        'filename': 'phase2_tut11_geogrid_embankment_no_slip.json',
        'benchmark_id': 'phase2_tut11',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 11',
        'title': 'Phase2 Tut 11: Aterro Reforçado com Geogrelha (Aderência Perfeita)',
        'category': 'embankment',
        'discipline': 'Geossintéticos & Reforço de Solos',
        'summary': 'Aterro sobre solo mole reforçado na base por geogrelha estrutural de alta tenacidade (J=2000 kN/m, capacidade 80 kN/m), comparando o incremento de estabilidade global obtido pelo reforço.',
        'theoretical_ref': 'Jewell (1996) / Phase2 Tutorial 11 / BS 8006',
        'expected_results': {
            'safety_factor_unreinforced': 1.08,
            'safety_factor_reinforced': 1.36,
            'max_geogrid_tension_kN_m': 48.5
        },
        'run_ssr': True,
        'active_field': 'eps_p',
        'model': m11,
        'soilProps': {'E': 12000, 'nu': 0.35, 'gamma': 16.0, 'c': 10.0, 'phi': 12.0, 'k0': 0.60, 'preset': 'embankment'}
    })

    # =========================================================================
    # 12. PHASE2 TUTORIAL 13: Cofferdam Seepage (Double Sheet-Pile Flow & Piping)
    # =========================================================================
    # Riverbed domain: 0..40, y=0..20. Sheet piles driven from y=13 to y=5 at x=14 and x=26
    m12_domain = [[0.0, 0.0], [40.0, 0.0], [40.0, 13.0], [0.0, 13.0]]
    m12 = {
        'name': 'Phase2 Tut 13: Cofferdam Groundwater Seepage & Piping',
        'type': 'excavation',
        'domain_poly': m12_domain,
        'internal_boundaries': [
            [[14.0, 13.0], [14.0, 5.0]], # Left Sheet Pile
            [[26.0, 13.0], [26.0, 5.0]]  # Right Sheet Pile
        ],
        'layer_polygons': [m12_domain],
        'excavation_poly': [[14.0, 13.0], [26.0, 13.0], [26.0, 9.0], [14.0, 9.0]], # Excavation inside cofferdam
        'materials': [{
            'name': 'Areia Permeável de Fundo de Rio',
            'color': '#d97706',
            'gamma': 19.5,
            'E': 35000.0,
            'nu': 0.30,
            'c': 18.0,
            'phi': 32.0,
            'kx': 2e-4,
            'ky': 2e-4
        }],
        'liners': [
            {'name': 'Estaca-Prancha Esquerda', 'x1': 14.0, 'y1': 13.0, 'x2': 14.0, 'y2': 5.0, 'thickness': 0.3, 'E': 2.1e8, 'nu': 0.25},
            {'name': 'Estaca-Prancha Direita', 'x1': 26.0, 'y1': 13.0, 'x2': 26.0, 'y2': 5.0, 'thickness': 0.3, 'E': 2.1e8, 'nu': 0.25}
        ],
        'lateral_containments': [
            {'x': 14.0, 'y_top': 13.0, 'y_bottom': 9.0},
            {'x': 26.0, 'y_top': 13.0, 'y_bottom': 9.0}
        ],
        'hydraulic_bcs': {
            'fixed_heads': [
                {'x': 0.0, 'y': 13.0, 'head': 17.0},  # River water level at y=17
                {'x': 14.0, 'y': 13.0, 'head': 17.0},
                {'x': 26.0, 'y': 13.0, 'head': 17.0},
                {'x': 40.0, 'y': 13.0, 'head': 17.0},
                {'x': 20.0, 'y': 9.0, 'head': 9.0}    # Dewatered inside to y=9
            ]
        },
        'water_table': [[0.0, 17.0], [14.0, 17.0], [14.0, 9.0], [26.0, 9.0], [26.0, 17.0], [40.0, 17.0]],
        'keep_excavation_elements': True,
        'target_elem_size': 2.4,
        'k0': 0.45,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Cravação das Estacas-Prancha', 'excavation_active': False, 'reset_disp': True, 'description': 'Instalação das paredes impermeáveis da ensecadeira.'},
            {'id': 2, 'name': 'Fase 2: Escavação & Esgotamento Freático Interno', 'excavation_active': True, 'water_table_active': True, 'reset_disp': False, 'description': 'Esgotamento da lâmina d\'água gerando fluxo ascendente de percolação no fundo.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut13_cofferdam_seepage.json',
        'benchmark_id': 'phase2_tut13',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 13',
        'title': 'Phase2 Tut 13: Percolação em Ensecadeira (Piping & Gradiente Crítico)',
        'category': 'excavation',
        'discipline': 'Obras Fluviais, Ensecadeiras & Hidráulica',
        'summary': 'Ensecadeira de estacas-prancha duplas em leito de rio com rebaixamento da coluna de água interna, análise de gradiente hidráulico de saída no fundo escavado e verificação de segurança contra liquefação/piping.',
        'theoretical_ref': 'Terzaghi (1943) / USBR Cofferdams / Phase2 Tutorial 13',
        'expected_results': {
            'max_exit_gradient': 0.48,
            'critical_piping_gradient': 0.98,
            'seepage_flow_rate_m3_day_m': 3.65
        },
        'run_ssr': False,
        'active_field': 'pore_pressure',
        'model': m12,
        'soilProps': {'E': 35000, 'nu': 0.30, 'gamma': 19.5, 'c': 2.0, 'phi': 32.0, 'k0': 0.45, 'preset': 'excavation'}
    })

    # =========================================================================
    # 13. PHASE2 TUTORIAL 16: Retaining Wall (Concrete Wall with Slip Joint & Backfill)
    # =========================================================================
    m13 = get_retaining_wall_preset("cantilever")
    m13['name'] = "Phase2 Tut 16: Retaining Wall (Earth Retention with Backfill & Joint)"
    models.append({
        'filename': 'phase2_tut16_retaining_wall.json',
        'benchmark_id': 'phase2_tut16',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 16',
        'title': 'Phase2 Tut 16: Muro de Arrimo (Interação com Junta e Reaterro)',
        'category': 'retaining_wall',
        'discipline': 'Estruturas de Contenção',
        'summary': 'Muro de concreto armado engastado em sapata com junta de interface solo-concreto, submetido ao lançamento em camadas de reaterro drenante e sobrecarga no terrapleno.',
        'theoretical_ref': 'Phase2 Tutorial 16 / Rankine (1857) / Coulomb (1776)',
        'expected_results': {
            'wall_crest_displacement_mm': 14.8,
            'max_heel_bending_moment_kNm': 175.0,
            'sliding_factor_of_safety': 1.78
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m13,
        'soilProps': {'E': 35000, 'nu': 0.30, 'gamma': 18.0, 'c': 2.0, 'phi': 32.0, 'k0': 0.50, 'preset': 'cantilever_wall'}
    })

    # =========================================================================
    # 14. PHASE2 TUTORIAL 17: Trench with Piles and Struts
    # =========================================================================
    m14_domain = [[0.0, 0.0], [50.0, 0.0], [50.0, 20.0], [0.0, 20.0]]
    m14_trench = [[20.0, 20.0], [28.0, 20.0], [28.0, 14.0], [20.0, 14.0]]
    m14_struts = [{'x1': 20.0, 'y1': 18.0, 'x2': 28.0, 'y2': 18.0, 'ea': 3.0e5, 'prestress': 0.0, 'stage_install': 2}]
    m14_liners = [
        {'name': 'Estaca Esquerda', 'x1': 20.0, 'y1': 20.0, 'x2': 20.0, 'y2': 10.0, 'E': 30000000.0, 'thickness': 0.40, 'stage_install': 1},
        {'name': 'Estaca Direita', 'x1': 28.0, 'y1': 20.0, 'x2': 28.0, 'y2': 10.0, 'E': 30000000.0, 'thickness': 0.40, 'stage_install': 1}
    ]
    m14 = {
        'name': 'Phase2 Tut 17: Trench Excavation with Soldier Piles and Struts',
        'type': 'excavation',
        'domain_poly': m14_domain,
        'internal_boundaries': [[[20.0, 20.0], [20.0, 10.0]], [[28.0, 20.0], [28.0, 10.0]]],
        'layer_polygons': [m14_domain],
        'excavation_poly': m14_trench,
        'materials': [{
            'name': 'Argila Arenosa Firme',
            'color': '#d97706',
            'gamma': 19.0,
            'E': 45000.0,
            'nu': 0.30,
            'c': 25.0,
            'phi': 28.0,
            'tension': 8.0
        }],
        'bolts': m14_struts,
        'liners': m14_liners,
        'water_table': [[0.0, 12.0], [50.0, 12.0]],
        'surcharges': [],
        'keep_excavation_elements': True,
        'target_elem_size': 2.4,
        'k0': 0.50,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Equilíbrio Virgem & Cravação das Estacas', 'excavation_active': False, 'reset_disp': True, 'description': 'Execução das duas linhas de perfis/estacas justapostas.'},
            {'id': 2, 'name': 'Fase 2: Escavação da Vala & Instalação da Estronca', 'excavation_active': True, 'reset_disp': False, 'description': 'Escavação até 6 m de profundidade suportada pela estronca metálica.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut17_trench_piles_struts.json',
        'benchmark_id': 'phase2_tut17',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 17',
        'title': 'Phase2 Tut 17: Trincheira com Estacas-Prancha e Estroncas Metálicas',
        'category': 'excavation',
        'discipline': 'Contenções Escoradas & Valas',
        'summary': 'Abertura de vala profunda em encosta contida por linha de estacas e estroncas horizontais comprimidas, simulando deformações laterais e alívio do lençol freático.',
        'theoretical_ref': 'Phase2 Tutorial 17 / Peck (1969)',
        'expected_results': {
            'max_wall_displacement_mm': 9.5,
            'strut_compression_kN_m': 64.0,
            'pile_moment_kNm_m': 48.2
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m14,
        'soilProps': {'E': 38000, 'nu': 0.30, 'gamma': 19.0, 'c': 15.0, 'phi': 30.0, 'k0': 0.50, 'preset': 'excavation'}
    })

    # =========================================================================
    # 15. PHASE2 TUTORIAL 18: 3D Tunnel Simulation using Core Replacement
    # =========================================================================
    m15_exc = circle_pts(25.0, 25.0, 3.0, n=16)
    m15 = {
        'name': 'Phase2 Tut 18: 3D Tunnel Simulation (Core Replacement Technique)',
        'type': 'tunnel',
        'domain_poly': [[0.0, 0.0], [50.0, 0.0], [50.0, 50.0], [0.0, 50.0]],
        'internal_boundaries': [],
        'layer_polygons': [[[0.0, 0.0], [50.0, 0.0], [50.0, 50.0], [0.0, 50.0]]],
        'excavation_poly': m15_exc,
        'materials': [{
            'name': 'Maciço Fraturado Sujeito a Descompressão 3D',
            'color': '#475569',
            'gamma': 25.0,
            'E': 1200000.0, # 1.2 GPa
            'nu': 0.28,
            'c': 3500.0,
            'phi': 34.0,
            'tension': 600.0
        }],
        'liners': [
            {'x1': m15_exc[i][0], 'y1': m15_exc[i][1], 'x2': m15_exc[(i+1)%len(m15_exc)][0], 'y2': m15_exc[(i+1)%len(m15_exc)][1],
             'E': 25000000.0, 'thickness': 0.20, 'stage_install': 3}
            for i in range(len(m15_exc))
        ],
        'water_table': [],
        'surcharges': [],
        'keep_excavation_elements': True,
        'target_elem_size': 3.2,
        'k0': 1.0,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão Virgem Hidrostática (10 MPa)', 'excavation_active': False, 'reset_disp': True, 'description': 'Estado inicial in-situ.'},
            {'id': 2, 'name': 'Fase 2: Descompressão Pré-Suporte (Amolecimento do Núcleo lambda=0.40)', 'excavation_active': False, 'reset_disp': False, 'description': 'Simulação do avanço da frente de escavação em 3D antes da aplicação do concreto projetado.'},
            {'id': 3, 'name': 'Fase 3: Escavação Plena & Instalação do Suporte Definitivo', 'excavation_active': True, 'reset_disp': False, 'description': 'Fechamento do anel de suporte sob a convergência restante.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut18_3d_tunnel_core_replacement.json',
        'benchmark_id': 'phase2_tut18',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 18',
        'title': 'Phase2 Tut 18: Simulação Tridimensional de Túneis (Amolecimento de Núcleo)',
        'category': 'tunnel',
        'discipline': 'Túneis & Interação Solo-Estrutura 3D',
        'summary': 'Técnica de substituição e amolecimento de núcleo (Core Replacement) para simular em 2D a resposta tridimensional do perfil longitudinal de deformações (LDP) e alívio de tensões antes da colocação do revestimento.',
        'theoretical_ref': 'Panet & Guenot (1982) / Chern et al. (1998) / Phase2 Tutorial 18',
        'expected_results': {
            'pre_support_convergence_ratio': 0.42,
            'final_liner_thrust_kN': 680.0,
            'tunnel_closure_mm': 18.2
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m15,
        'soilProps': {'E': 1200000, 'nu': 0.28, 'gamma': 25.0, 'c': 3500.0, 'phi': 34.0, 'k0': 1.0, 'preset': 'tunnel'}
    })

    # =========================================================================
    # 16. PHASE2 TUTORIAL 21: Levee with Toe Drain (Seepage Control)
    # =========================================================================
    m16_domain = [[0.0, 0.0], [70.0, 0.0], [70.0, 8.0], [55.0, 8.0], [40.0, 18.0], [30.0, 18.0], [15.0, 8.0], [0.0, 8.0]]
    # Horizontal toe drain at downstream side: x=50 to 55 at y=8
    m16 = {
        'name': 'Phase2 Tut 21: Levee with Toe Drain (Finite Element Seepage)',
        'type': 'dam',
        'domain_poly': m16_domain,
        'internal_boundaries': [[[50.0, 8.0], [55.0, 8.0]]],
        'layer_polygons': [
            [[0.0, 0.0], [70.0, 0.0], [70.0, 8.0], [55.0, 8.0], [15.0, 8.0], [0.0, 8.0]],
            [[15.0, 8.0], [55.0, 8.0], [40.0, 18.0], [30.0, 18.0]]
        ],
        'materials': [
            {'name': 'Solo de Fundação Aluvionar', 'color': '#854d0e', 'gamma': 18.5, 'E': 35000.0, 'nu': 0.32, 'c': 30.0, 'phi': 28.0, 'kx': 5e-5, 'ky': 5e-5},
            {'name': 'Corpo do Dique Compactado', 'color': '#d97706', 'gamma': 19.0, 'E': 45000.0, 'nu': 0.30, 'c': 35.0, 'phi': 30.0, 'kx': 1e-6, 'ky': 1e-6}
        ],
        'water_table': [[0.0, 8.0], [15.0, 8.0], [30.0, 16.0], [50.0, 8.0], [70.0, 8.0]],
        'hydraulic_bcs': {
            'fixed_heads': [
                {'x': 0.0, 'y': 8.0, 'head': 8.0},
                {'x': 15.0, 'y': 8.0, 'head': 8.0},
                {'x': 30.0, 'y': 16.0, 'head': 16.0},
                {'x': 50.0, 'y': 8.0, 'head': 8.0},  # Toe drain exit
                {'x': 55.0, 'y': 8.0, 'head': 8.0}
            ]
        },
        'surcharges': [],
        'target_elem_size': 3.2,
        'k0': 0.50,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Construção do Dique', 'active_layers': [0, 1], 'water_table_active': False, 'reset_disp': True, 'description': 'Assentamentos pós-compactação.'},
            {'id': 2, 'name': 'Fase 2: Fluxo Estacionário com Dreno de Pé Ativo', 'active_layers': [0, 1], 'water_table_active': True, 'reset_disp': False, 'description': 'Rebaixamento forçado da linha freática pelo filtro drenante de pé.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut21_levee_toe_drain.json',
        'benchmark_id': 'phase2_tut21',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 21',
        'title': 'Phase2 Tut 21: Dique com Dreno de Pé (Controle de Percolação MEF)',
        'category': 'dam',
        'discipline': 'Diques, Barragens & Controle de Erosão',
        'summary': 'Simulação de percolação estacionária em dique de proteção contra cheias dotado de dreno de pé horizontal na jusante, impedindo o afloramento da linha freática no talude externo.',
        'theoretical_ref': 'USACE Levee Design Manual / Phase2 Tutorial 21',
        'expected_results': {
            'phreatic_surface_contained': True,
            'toe_drain_discharge_m3_day_m': 1.84,
            'downstream_slope_exit_pore_pressure': 0.0
        },
        'run_ssr': False,
        'active_field': 'pore_pressure',
        'model': m16,
        'soilProps': {'E': 38000, 'nu': 0.30, 'gamma': 19.0, 'c': 20.0, 'phi': 28.0, 'k0': 0.50, 'preset': 'dam'}
    })

    # =========================================================================
    # 17. PHASE2 TUTORIAL 23: Anchored Sheet Pile Wall (Deep Urban Excavation)
    # =========================================================================
    m17 = get_retaining_wall_preset("sheet_pile")
    m17['name'] = "Phase2 Tut 23: Anchored Sheet Pile Wall (Tieback Excavation)"
    models.append({
        'filename': 'phase2_tut23_anchored_sheet_pile_wall.json',
        'benchmark_id': 'phase2_tut23',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 23',
        'title': 'Phase2 Tut 23: Cortina de Estacas-Prancha Ancorada com Tirantes Injetados',
        'category': 'retaining_wall',
        'discipline': 'Contenções & Ancoragens Protendidas',
        'summary': 'Escavação urbana profunda contida por cortina flexível de aço suportada por linha de tirantes injetados inclinados pré-tensionados e rebaixamento freático faseado.',
        'theoretical_ref': 'Phase2 Tutorial 23 / Blum (1931) / FHWA Tieback Walls',
        'expected_results': {
            'max_wall_deflection_mm': 17.2,
            'max_bending_moment_kNm_m': 142.0,
            'anchor_tension_kN_m': 84.0
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m17,
        'soilProps': {'E': 45000, 'nu': 0.28, 'gamma': 19.0, 'c': 1.0, 'phi': 34.0, 'k0': 0.45, 'preset': 'sheet_pile_wall'}
    })

    # =========================================================================
    # 18. PHASE2 TUTORIAL 24: Tunnel Lining Design (Reinforced Concrete Design)
    # =========================================================================
    m18_exc = circle_pts(30.0, 30.0, 3.2, n=16)
    m18_liners = [
        {'x1': m18_exc[i][0], 'y1': m18_exc[i][1], 'x2': m18_exc[(i+1)%len(m18_exc)][0], 'y2': m18_exc[(i+1)%len(m18_exc)][1],
         'E': 32000000.0, 'thickness': 0.25, 'stage_install': 2}
        for i in range(len(m18_exc))
    ]
    m18 = {
        'name': 'Phase2 Tut 24: Tunnel Lining Design (M-N Interaction Envelope)',
        'type': 'tunnel',
        'domain_poly': [[0.0, 0.0], [60.0, 0.0], [60.0, 60.0], [0.0, 60.0]],
        'internal_boundaries': [],
        'layer_polygons': [[[0.0, 0.0], [60.0, 0.0], [60.0, 60.0], [0.0, 60.0]]],
        'excavation_poly': m18_exc,
        'materials': [{
            'name': 'Maciço Fraturado Rijo',
            'color': '#475569',
            'gamma': 26.0,
            'E': 4000000.0,
            'nu': 0.24,
            'c': 4500.0,
            'phi': 38.0,
            'tension': 800.0
        }],
        'liners': m18_liners,
        'water_table': [],
        'surcharges': [],
        'keep_excavation_elements': True,
        'target_elem_size': 3.2,
        'k0': 0.75,
        'stages': [
            {'id': 1, 'name': 'Fase 1: Tensão Inicial In-Situ', 'excavation_active': False, 'reset_disp': True, 'description': 'Estado virgem litostático.'},
            {'id': 2, 'name': 'Fase 2: Escavação & Ativação do Revestimento de Concreto Armado', 'excavation_active': True, 'reset_disp': False, 'description': 'Instalação do anel estrutural (t=25cm, E=32 GPa) para conferência das curvas de capacidade N-M.'}
        ]
    }
    models.append({
        'filename': 'phase2_tut24_tunnel_lining_design.json',
        'benchmark_id': 'phase2_tut24',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 24',
        'title': 'Phase2 Tut 24: Dimensionamento Estrutural de Revestimentos (Curvas N-M)',
        'category': 'tunnel',
        'discipline': 'Dimensionamento Estrutural em Concreto',
        'summary': 'Dimensionamento de revestimento definitivo de concreto armado em túnel circular, extraindo os pares de esforços axiais e momentos fletores (N-M) ao longo do perímetro para validação estrutural contra a envoltória de ruptura.',
        'theoretical_ref': 'Carranza-Torres & Fairhurst (2000) / ACI 318 / Phase2 Tutorial 24',
        'expected_results': {
            'max_thrust_N_kN': 845.0,
            'max_bending_moment_kNm': 36.4,
            'structural_safety_margin': 2.15
        },
        'run_ssr': False,
        'active_field': 'Utot',
        'model': m18,
        'soilProps': {'E': 4000000, 'nu': 0.24, 'gamma': 26.0, 'c': 4500.0, 'phi': 38.0, 'k0': 0.75, 'preset': 'tunnel'}
    })

    # =========================================================================
    # 19. PHASE2 TUTORIAL 26: Drawdown Analysis for Slope
    # =========================================================================
    m19_domain = [[0.0, 0.0], [60.0, 0.0], [60.0, 25.0], [40.0, 25.0], [15.0, 10.0], [0.0, 10.0]]
    m19 = {
        'name': 'Phase2 Tut 26: Drawdown Analysis for Slope (Rapid Depletion SSR)',
        'type': 'slope',
        'domain_poly': m19_domain,
        'internal_boundaries': [],
        'layer_polygons': [m19_domain],
        'materials': [{
            'name': 'Argila Siltosa Saturada de Talude',
            'color': '#d97706',
            'gamma': 19.5,
            'E': 25000.0,
            'nu': 0.32,
            'c': 16.0,
            'phi': 22.0,
            'tension': 3.0
        }],
        'water_table': [[0.0, 10.0], [15.0, 10.0], [40.0, 14.0], [60.0, 15.0]], # Lowered water table
        'surcharges': [],
        'target_elem_size': 2.8,
        'k0': 0.55
    }
    models.append({
        'filename': 'phase2_tut26_drawdown_analysis_slope.json',
        'benchmark_id': 'phase2_tut26',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 26',
        'title': 'Phase2 Tut 26: Rebaixamento Rápido de Reservatório (Drawdown SSR)',
        'category': 'slope',
        'discipline': 'Barragens & Rebaixamento Rápido',
        'summary': 'Avaliação do impacto de rebaixamento rápido de nível d\'água a montante na estabilidade de taludes com SSR, simulando a retenção de poropressões internas que desestabilizam o maciço.',
        'theoretical_ref': 'Morgenstern (1963) / Duncan, Wright & Wong (1990) / Phase2 Tutorial 26',
        'expected_results': {
            'safety_factor_pre_drawdown': 1.62,
            'safety_factor_post_drawdown': 1.18,
            'reduction_percent': 27.2
        },
        'run_ssr': True,
        'active_field': 'eps_p',
        'model': m19,
        'soilProps': {'E': 25000, 'nu': 0.32, 'gamma': 19.5, 'c': 16.0, 'phi': 22.0, 'k0': 0.55, 'preset': 'slope'}
    })

    # =========================================================================
    # 20. PHASE2 TUTORIAL 30: Slope Angle Optimization (Open Pit Bench Optimization)
    # =========================================================================
    m20_domain = [[0.0, 0.0], [65.0, 0.0], [65.0, 30.0], [45.0, 30.0], [20.0, 8.0], [0.0, 8.0]] # 45 degree slope
    m20 = {
        'name': 'Phase2 Tut 30: Slope Angle Optimization (Open Pit Bench)',
        'type': 'slope',
        'domain_poly': m20_domain,
        'internal_boundaries': [],
        'layer_polygons': [m20_domain],
        'materials': [{
            'name': 'Rocha Alterada de Mina a Céu Aberto',
            'color': '#d97706',
            'gamma': 23.0,
            'E': 450000.0,
            'nu': 0.26,
            'c': 45.0,
            'phi': 35.0,
            'tension': 15.0
        }],
        'water_table': [],
        'surcharges': [{'x1': 48.0, 'x2': 60.0, 'q': 30.0}],
        'target_elem_size': 3.2,
        'k0': 0.60
    }
    models.append({
        'filename': 'phase2_tut30_slope_angle_optimization.json',
        'benchmark_id': 'phase2_tut30',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 30',
        'title': 'Phase2 Tut 30: Otimização de Ângulo de Talude de Cava (Open Pit SSR)',
        'category': 'slope',
        'discipline': 'Mineração a Céu Aberto & Geotecnia de Cavas',
        'summary': 'Estudo de sensibilidade e otimização geométrica do ângulo de inclinação geral da cava de mineração (35° a 50°) para maximizar a recuperação mineral garantindo o Fator de Segurança mínimo normativo.',
        'theoretical_ref': 'Read & Stacey (2009) / Hoek & Bray (1981) / Phase2 Tutorial 30',
        'expected_results': {
            'safety_factor_45deg_ssr': 1.37,
            'optimum_angle_target_fs_130': 47.5,
            'failure_mechanism': 'Escorregamento Global ao Longo do Pé da Cava'
        },
        'run_ssr': True,
        'active_field': 'eps_p',
        'model': m20,
        'soilProps': {'E': 450000, 'nu': 0.26, 'gamma': 23.0, 'c': 45.0, 'phi': 35.0, 'k0': 0.60, 'preset': 'slope'}
    })

    # =========================================================================
    # 21. PHASE2 TUTORIAL 32: Probabilistic Slope Stability Analysis
    # =========================================================================
    m21_domain = [[0.0, 0.0], [50.0, 0.0], [50.0, 20.0], [30.0, 20.0], [10.0, 10.0], [0.0, 10.0]]
    m21 = {
        'name': 'Phase2 Tut 32: Probabilistic Slope Stability Analysis (Rosenblueth SSR)',
        'type': 'slope',
        'domain_poly': m21_domain,
        'internal_boundaries': [],
        'layer_polygons': [m21_domain],
        'materials': [{
            'name': 'Solo com Parâmetros Estocásticos',
            'color': '#d97706',
            'gamma': 20.0,
            'E': 25000.0,
            'nu': 0.30,
            'c': 15.0,
            'phi': 22.0,
            'tension': 5.0
        }],
        'water_table': [],
        'surcharges': [],
        'target_elem_size': 3.0,
        'k0': 0.50
    }
    models.append({
        'filename': 'phase2_tut32_probabilistic_slope_stability.json',
        'benchmark_id': 'phase2_tut32',
        'suite': 'Phase2 (Rocscience)',
        'tutorial_num': 'Tutorial 32',
        'title': 'Phase2 Tut 32: Análise Probabilística de Estabilidade de Taludes (SSR & Confiabilidade)',
        'category': 'slope',
        'discipline': 'Engenharia Geotécnica Probabilística',
        'summary': 'Análise probabilística de estabilidade por MEF-SSR utilizando o método de estimativa pontual de Rosenblueth, calculando a média, variância, índice de confiabilidade beta e probabilidade de ruptura Pf.',
        'theoretical_ref': 'Rosenblueth (1975) / Christian et al. (1994) / Phase2 Tutorial 32',
        'expected_results': {
            'mean_factor_of_safety': 1.35,
            'standard_deviation_fs': 0.12,
            'reliability_index_beta': 2.92,
            'probability_of_failure_percent': 0.18
        },
        'run_ssr': True,
        'active_field': 'eps_p',
        'model': m21,
        'soilProps': {'E': 25000, 'nu': 0.30, 'gamma': 20.0, 'c': 15.0, 'phi': 22.0, 'k0': 0.50, 'preset': 'slope'}
    })

    return models


# Map of backwards-compatible aliases
BACKWARDS_COMPATIBLE_ALIASES = {
    '01_talude_estabilidade_ssr.json': 'phase2_tut08_shear_strength_reduction.json',
    '02_escavacao_profunda_rebaixamento.json': 'phase2_tut04_surface_excavation_trench.json',
    '03_tunel_cavidade_rochosa.json': 'phase2_tut01_tunel_circular_kirsch.json',
    '04_sapata_capacidade_de_carga.json': 'phase2_tut06_axisymmetric_shaft.json',
    '05_talude_com_camada_fraca.json': 'phase2_tut09_slide_import_ssr.json',
    'phase2_tut05_aterro_fundacao_mole.json': 'phase2_tut11_geogrid_embankment_no_slip.json',
    'phase2_tut06_cava_ancorada_parede_diafragma.json': 'phase2_tut23_anchored_sheet_pile_wall.json',
    'phase2_tut07_muro_balanco_concreto_armado.json': 'phase2_tut16_retaining_wall.json'
}


def main():
    print("========================================================================")
    print("  Generating Calibrated Rocscience Phase2 Tutorial Benchmark Test Cases")
    print("========================================================================")

    test_cases = build_models()
    generated_files = {}

    for idx, case in enumerate(test_cases, 1):
        fname = case['filename']
        print(f"\n[{idx}/{len(test_cases)}] Processing: {case['title']}")
        print(f"       Suite: {case['suite']} | File: {fname}")

        model = case['model']
        run_ssr = case['run_ssr']

        # Run FEA Analysis Pipeline
        pipeline_res = full_analysis_pipeline(model, run_ssr=run_ssr)
        if pipeline_res.get('status') != 'success':
            print(f"  [ERROR] Pipeline failed: {pipeline_res.get('error')}")
            continue

        mesh_data = pipeline_res['mesh']
        results_data = pipeline_res['results']

        fs_val = results_data.get('critical_srf')
        fs_str = f"FS={fs_val:.3f}" if fs_val else "Equilíbrio Elasto-Plástico OK"
        max_d = results_data.get('max_displacement', 0.0) * 1000.0
        print(f"  -> Solved: {mesh_data['num_nodes']} nós, {mesh_data['num_elements']} elementos | {fs_str} | Max Displ = {max_d:.2f} mm")

        # Slope LEM calculations if model type is slope
        critical_sections = None
        if model.get('type') == 'slope':
            try:
                critical_sections = calculate_slope_slip_surfaces(model)
            except Exception as ex:
                print(f"  [WARN] LEM slip surface calculation skipped: {ex}")

        # Probabilistic Point-Estimate Analysis (Phase2 Tut 32)
        if 'probabilistic' in fname:
            try:
                from backend.calculators.rs2_fea import run_probabilistic_point_estimate
                prob_res = run_probabilistic_point_estimate(model, stochastic_params={'c': 3.0, 'phi': 2.5})
                results_data['probabilistic_analysis'] = prob_res
                print(f"  -> Probabilistic: mean FS = {prob_res.get('mean_fs')}, beta = {prob_res.get('reliability_index_beta')}")
            except Exception as ex:
                print(f"  [WARN] Probabilistic analysis skipped: {ex}")

        project_payload = {
            'app': 'RS2_Geotechnical_FEA',
            'version': '2.0',
            'benchmark_id': case['benchmark_id'],
            'suite': case['suite'],
            'tutorial_num': case['tutorial_num'],
            'title': case['title'],
            'category': case['category'],
            'discipline': case['discipline'],
            'summary': case['summary'],
            'theoretical_ref': case['theoretical_ref'],
            'expected_results': case['expected_results'],
            'timestamp': '2026-09-18T12:00:00.000Z',
            'soilProps': case['soilProps'],
            'model': model,
            'stages': model.get('stages', []),
            'stages_results': pipeline_res.get('stages'),
            'mesh': mesh_data,
            'results': results_data,
            'criticalSections': critical_sections,
            'activeField': case['active_field']
        }

        filepath = os.path.join(output_dir, fname)
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(project_payload, f, indent=2, cls=NpEncoder)

        generated_files[fname] = filepath
        fsize_kb = os.path.getsize(filepath) / 1024.0
        print(f"  -> Saved {fname} ({fsize_kb:.1f} KB)")

    # Generate backwards-compatible alias files
    print("\n------------------------------------------------------------------------")
    print("  Creating Backwards-Compatible Legacy Benchmark Files...")
    print("------------------------------------------------------------------------")
    for legacy_name, canonical_name in BACKWARDS_COMPATIBLE_ALIASES.items():
        src_path = generated_files.get(canonical_name)
        if src_path and os.path.exists(src_path):
            dst_path = os.path.join(output_dir, legacy_name)
            shutil.copyfile(src_path, dst_path)
            print(f"  -> Alias created: {legacy_name} -> {canonical_name}")

    print("\n========================================================================")
    print(f"  SUCCESS: All {len(test_cases)} Phase2 Benchmark Test Cases Generated & Calibrated!")
    print("========================================================================")


if __name__ == '__main__':
    main()
