from .db_manager import TakeoffDB

SEED_ENTRIES = [
    # ==================== TERMELÉTRICAS (UTE) ====================
    {
        "id": "seed-ute-tg-01",
        "category": "termoeletrica",
        "sub_category": "Turbogerador (TG)",
        "project_name": "UTE Vale do Sol 450MW",
        "equipment_name": "Bloco do Turbogerador TG-01",
        "structure_type": "Bloco Maciço Rígido",
        "drawing_code": "UTE-VS-FD-TG-001",
        "revision": "02",
        "soil_condition": "Solo Normal (Argila Arenosa Rígida)",
        "fck_concrete": 35.0,
        "steel_type": "CA-50",
        "concrete_volume_m3": 820.0,
        "steel_weight_kg": 94300.0,
        "formwork_area_m2": 640.0,
        "excavation_m3": 1450.0,
        "backfill_m3": 630.0,
        "lean_concrete_m3": 45.0,
        "anchor_bolts_kg": 1250.0,
        "pile_count": 0,
        "notes": "Bloco maciço da turbina a gás e gerador. Alta densidade de armadura e exigência rigorosa de controle térmico de concretagem.",
        "line_items": [
            {"item": "Concreto Estrutural fck 35 MPa", "spec": "Baixo calor de hidratação (Cimento CP-III)", "unit": "m³", "quantity": 820.0, "unit_weight": 2400.0, "total_weight": 1968000.0, "notes": "Concretagem contínua com gelo"},
            {"item": "Aço Armadura CA-50 (Bitolas 16mm a 32mm)", "spec": "Corte e dobra especial", "unit": "kg", "quantity": 94300.0, "unit_weight": 1.0, "total_weight": 94300.0, "notes": "Taxa: 115.0 kg/m³"},
            {"item": "Fôrma de Madeira Compensada Resinada 18mm", "spec": "Fôrmas laterais com travamento pesado", "unit": "m²", "quantity": 640.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": "Reaproveitamento 2x"},
            {"item": "Concreto Magro Lastro (e=10cm)", "spec": "fck 15 MPa", "unit": "m³", "quantity": 45.0, "unit_weight": 2300.0, "total_weight": 103500.0, "notes": "Proteção do fundo de cava"},
            {"item": "Chumbadores de Ancoragem M42 Classe 8.8", "spec": "Galvanizados a fogo com placas de apoio", "unit": "kg", "quantity": 1250.0, "unit_weight": 1.0, "total_weight": 1250.0, "notes": "Gabarito de precisão milimétrica"}
        ]
    },
    {
        "id": "seed-ute-hrsg-01",
        "category": "termoeletrica",
        "sub_category": "Caldeira de Recuperação (HRSG)",
        "project_name": "UTE Vale do Sol 450MW",
        "equipment_name": "Fundação dos Módulos da Caldeira HRSG",
        "structure_type": "Bloco sobre Estacas",
        "drawing_code": "UTE-VS-FD-HR-004",
        "revision": "01",
        "soil_condition": "Solo Mole até 8m, Impenetrável a 16m",
        "fck_concrete": 30.0,
        "steel_type": "CA-50",
        "concrete_volume_m3": 480.0,
        "steel_weight_kg": 50400.0,
        "formwork_area_m2": 390.0,
        "excavation_m3": 850.0,
        "backfill_m3": 370.0,
        "lean_concrete_m3": 28.0,
        "anchor_bolts_kg": 640.0,
        "pile_count": 32,
        "pile_diameter_cm": 80.0,
        "pile_depth_m": 16.0,
        "notes": "Conjunto de blocos interligados por vigas de travamento para suportar os pilares da caldeira de recuperação.",
        "line_items": [
            {"item": "Concreto Estrutural fck 30 MPa", "spec": "Blocos de coroamento e vigas", "unit": "m³", "quantity": 480.0, "unit_weight": 2400.0, "total_weight": 1152000.0, "notes": ""},
            {"item": "Aço Armadura CA-50", "spec": "Armadura principal e estribos", "unit": "kg", "quantity": 50400.0, "unit_weight": 1.0, "total_weight": 50400.0, "notes": "Taxa: 105.0 kg/m³"},
            {"item": "Fôrma Compensada", "spec": "Lateral de blocos", "unit": "m²", "quantity": 390.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""},
            {"item": "Estacas Escavadas com Fluido Polimérico D=80cm", "spec": "32 estacas x 16m = 512 m lineares", "unit": "m", "quantity": 512.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": "Carga de trabalho 220 tf/estaca"}
        ]
    },
    {
        "id": "seed-ute-tr-01",
        "category": "termoeletrica",
        "sub_category": "Transformador Elevador",
        "project_name": "UTE Vale do Sol 450MW",
        "equipment_name": "Base do Transformador Elevador TR-01 + Bacia de Contenção",
        "structure_type": "Base com Bacia de Contenção e Parede Corta-Fogo",
        "drawing_code": "UTE-VS-FD-TR-002",
        "revision": "03",
        "soil_condition": "Solo Normal",
        "fck_concrete": 30.0,
        "steel_type": "CA-50",
        "concrete_volume_m3": 72.0,
        "steel_weight_kg": 6480.0,
        "formwork_area_m2": 118.0,
        "excavation_m3": 160.0,
        "backfill_m3": 88.0,
        "lean_concrete_m3": 8.0,
        "anchor_bolts_kg": 180.0,
        "notes": "Radier com muretas de contenção para retenção de óleo dielétrico, grelha metálica e parede corta-fogo em concreto armado.",
        "line_items": [
            {"item": "Concreto Impermeabilizado fck 30 MPa", "spec": "Com aditivo cristalizante para óleo", "unit": "m³", "quantity": 72.0, "unit_weight": 2400.0, "total_weight": 172800.0, "notes": "W8 / Impermeável"},
            {"item": "Aço Armadura CA-50", "spec": "Malha dupla antifissuração", "unit": "kg", "quantity": 6480.0, "unit_weight": 1.0, "total_weight": 6480.0, "notes": "Taxa: 90.0 kg/m³"},
            {"item": "Fôrma Resinada", "spec": "Muretas e parede corta-fogo", "unit": "m²", "quantity": 118.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""},
            {"item": "Grelha Metálica Galvanizada e Seixo Rolado", "spec": "Sistema anti-incêndio da bacia", "unit": "m²", "quantity": 42.0, "unit_weight": 35.0, "total_weight": 1470.0, "notes": "Camada abafadora de chamas"}
        ]
    },
    {
        "id": "seed-ute-stack-01",
        "category": "termoeletrica",
        "sub_category": "Chaminé Principal (Stack)",
        "project_name": "UTE Vale do Sol 450MW",
        "equipment_name": "Fundação da Chaminé de Exaustão (Altura 65m)",
        "structure_type": "Fundação Circular Maciça",
        "drawing_code": "UTE-VS-FD-ST-001",
        "revision": "00",
        "soil_condition": "Solo Normal Compacto",
        "fck_concrete": 40.0,
        "steel_type": "CA-50",
        "concrete_volume_m3": 255.0,
        "steel_weight_kg": 33150.0,
        "formwork_area_m2": 215.0,
        "excavation_m3": 520.0,
        "backfill_m3": 265.0,
        "lean_concrete_m3": 16.0,
        "anchor_bolts_kg": 850.0,
        "notes": "Base circular engastada para resistir ao momento fletor dinâmico do vento na chaminé esbelta de 65 metros.",
        "line_items": [
            {"item": "Concreto Estrutural fck 40 MPa", "spec": "Base poligonal circular D=14m", "unit": "m³", "quantity": 255.0, "unit_weight": 2400.0, "total_weight": 612000.0, "notes": ""},
            {"item": "Aço Armadura CA-50", "spec": "Armadura radial e circunferencial pesada", "unit": "kg", "quantity": 33150.0, "unit_weight": 1.0, "total_weight": 33150.0, "notes": "Taxa: 130.0 kg/m³"},
            {"item": "Fôrma Curva / Segmentada", "spec": "Chapas metálicas / compensado flexível", "unit": "m²", "quantity": 215.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""},
            {"item": "Chumbadores Especiais Alta Resistência", "spec": "36 chumbadores $\\phi$ 2\" ASTM A193 B7", "unit": "kg", "quantity": 850.0, "unit_weight": 1.0, "total_weight": 850.0, "notes": "Anel de ancoragem da base metálica"}
        ]
    },

    # ==================== LINHAS DE TRANSMISSÃO (LT) ====================
    {
        "id": "seed-lt-ts-norm",
        "category": "linha_transmissao",
        "sub_category": "Torre de Suspensão 500kV",
        "project_name": "LT 500kV Belo Monte - Rio",
        "equipment_name": "Torre TS-01 (Suspensão Tangente) - Solo Normal",
        "structure_type": "Sapatas Isoladas (4 Pés)",
        "drawing_code": "LT-BM-FD-TS-500-01",
        "revision": "04",
        "soil_condition": "Solo Normal (Silte Argiloso SPT > 15)",
        "fck_concrete": 25.0,
        "steel_type": "CA-50",
        "concrete_volume_m3": 28.4,
        "steel_weight_kg": 2414.0,
        "formwork_area_m2": 54.0,
        "excavation_m3": 105.0,
        "backfill_m3": 76.6,
        "lean_concrete_m3": 3.2,
        "anchor_bolts_kg": 380.0,
        "notes": "Conjunto padrão para 1 torre (4 sapatas tronco-cônicas: 7.1 m³ por pé). Esforço predominante: compressão 65 tf e arrancamento 45 tf.",
        "line_items": [
            {"item": "Concreto Estrutural fck 25 MPa", "spec": "4 Sapatas x 7.1 m³", "unit": "m³", "quantity": 28.4, "unit_weight": 2400.0, "total_weight": 68160.0, "notes": "Total dos 4 pés"},
            {"item": "Aço Armadura CA-50", "spec": "Malha da base e pilar de arranque (stub)", "unit": "kg", "quantity": 2414.0, "unit_weight": 1.0, "total_weight": 2414.0, "notes": "Taxa: 85.0 kg/m³"},
            {"item": "Fôrma de Madeira", "spec": "Fôrmas de tronco de cone e fuste", "unit": "m²", "quantity": 54.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""},
            {"item": "Stubs Metálicos de Ancoragem (Aço ASTM A36)", "spec": "Cantoneiras de arranque chumbadas", "unit": "kg", "quantity": 380.0, "unit_weight": 1.0, "total_weight": 380.0, "notes": "4 conjuntos de stubs"},
            {"item": "Escavação a Céu Aberto Solo 1ª Cat", "spec": "Profundidade média 3.2m", "unit": "m³", "quantity": 105.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""}
        ]
    },
    {
        "id": "seed-lt-ta-norm",
        "category": "linha_transmissao",
        "sub_category": "Torre de Ancoragem 500kV",
        "project_name": "LT 500kV Belo Monte - Rio",
        "equipment_name": "Torre TA-02 (Ancoragem / Ângulo Pesado)",
        "structure_type": "Sapatas Robustas com Peso de Terra",
        "drawing_code": "LT-BM-FD-TA-500-02",
        "revision": "02",
        "soil_condition": "Solo Normal Compacto",
        "fck_concrete": 25.0,
        "steel_type": "CA-50",
        "concrete_volume_m3": 58.0,
        "steel_weight_kg": 5568.0,
        "formwork_area_m2": 96.0,
        "excavation_m3": 195.0,
        "backfill_m3": 137.0,
        "lean_concrete_m3": 5.4,
        "anchor_bolts_kg": 620.0,
        "notes": "Torre de ancoragem sujeita a elevada tração de cabos e vento transversal. Sapatas profundas com base alargada para mobilizar cone de terra.",
        "line_items": [
            {"item": "Concreto Estrutural fck 25 MPa", "spec": "4 Sapatas x 14.5 m³", "unit": "m³", "quantity": 58.0, "unit_weight": 2400.0, "total_weight": 139200.0, "notes": "Total dos 4 pés"},
            {"item": "Aço Armadura CA-50", "spec": "Armadura de tração pesada", "unit": "kg", "quantity": 5568.0, "unit_weight": 1.0, "total_weight": 5568.0, "notes": "Taxa: 96.0 kg/m³"},
            {"item": "Fôrma", "spec": "Compensado resinado", "unit": "m²", "quantity": 96.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""},
            {"item": "Stubs de Ancoragem Pesados", "spec": "Aço Alta Resistência", "unit": "kg", "quantity": 620.0, "unit_weight": 1.0, "total_weight": 620.0, "notes": "4 pés"},
            {"item": "Escavação Mecanizada", "spec": "Cavas de 4.0m de profundidade", "unit": "m³", "quantity": 195.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""}
        ]
    },
    {
        "id": "seed-lt-grelha",
        "category": "linha_transmissao",
        "sub_category": "Torre com Grelha Metálica",
        "project_name": "LT 230kV Pará - Maranhão",
        "equipment_name": "Torre TG-05 (Fundação em Grelha Metálica Direta)",
        "structure_type": "Grelha Metálica (Sem Concreto Estrutural)",
        "drawing_code": "LT-PM-FD-GR-230-01",
        "revision": "01",
        "soil_condition": "Solo Firme Arenoso / Difícil Acesso a Caminhão Betoneira",
        "fck_concrete": 0.0,
        "steel_type": "Aço Galvanizado ASTM A36",
        "concrete_volume_m3": 0.0,
        "steel_weight_kg": 3850.0,
        "formwork_area_m2": 0.0,
        "excavation_m3": 135.0,
        "backfill_m3": 135.0,
        "lean_concrete_m3": 0.0,
        "anchor_bolts_kg": 0.0,
        "notes": "Solução ideal para trechos remotos sem acesso a usina de concreto. 4 grelhas de perfis galvanizados montadas in-situ e aterradas com reaterro compactado a 95% do Proctor Normal.",
        "line_items": [
            {"item": "Grelhas Metálicas Modulares Galvanizadas", "spec": "Perfis e cantoneiras de aço galvanizado", "unit": "kg", "quantity": 3850.0, "unit_weight": 1.0, "total_weight": 3850.0, "notes": "4 grelhas completas (962 kg/pé)"},
            {"item": "Escavação Mecânica / Manual", "spec": "Abertura de cavas para instalação das grelhas", "unit": "m³", "quantity": 135.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""},
            {"item": "Reaterro com Compactação Controlada", "spec": "95% PN em camadas de 20cm", "unit": "m³", "quantity": 135.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": "Responsável pelo peso de arrancamento"}
        ]
    },
    {
        "id": "seed-lt-tubulao",
        "category": "linha_transmissao",
        "sub_category": "Torre em Tubulão Céu Aberto",
        "project_name": "LT 230kV Pará - Maranhão",
        "equipment_name": "Torre TT-10 (Tubulões a Céu Aberto)",
        "structure_type": "Tubulão com Base Alargada",
        "drawing_code": "LT-PM-FD-TB-230-03",
        "revision": "02",
        "soil_condition": "Solo Coesivo Seco (Argila Porosa)",
        "fck_concrete": 25.0,
        "steel_type": "CA-50",
        "concrete_volume_m3": 36.5,
        "steel_weight_kg": 3285.0,
        "formwork_area_m2": 24.0,
        "excavation_m3": 48.0,
        "backfill_m3": 11.5,
        "lean_concrete_m3": 2.5,
        "anchor_bolts_kg": 340.0,
        "notes": "4 tubulões de diâmetro de fuste 100cm e base alargada até 200cm. Escavação manual sem água.",
        "line_items": [
            {"item": "Concreto Estrutural fck 25 MPa", "spec": "Fuste e base alargada (4 tubulões)", "unit": "m³", "quantity": 36.5, "unit_weight": 2400.0, "total_weight": 87600.0, "notes": ""},
            {"item": "Aço Armadura CA-50", "spec": "Armadura longitudinal e estribos espirais", "unit": "kg", "quantity": 3285.0, "unit_weight": 1.0, "total_weight": 3285.0, "notes": "Taxa: 90.0 kg/m³"},
            {"item": "Escavação Manual de Tubulão", "spec": "Profundidade 5.5m com alargamento de base", "unit": "m³", "quantity": 48.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""}
        ]
    }
]


def ensure_seed_data(db: TakeoffDB):
    """Populates initial realistic seed data if the database is empty."""
    existing = db.list_entries()
    if len(existing) == 0:
        print("[TakeoffDB] Seeding initial database with realistic UTE and LT foundation entries...")
        for entry in SEED_ENTRIES:
            try:
                db.add_entry(entry)
            except Exception as e:
                print(f"[TakeoffDB] Error seeding entry {entry.get('id')}: {e}")
        print(f"[TakeoffDB] Successfully loaded {len(SEED_ENTRIES)} benchmark structures.")
