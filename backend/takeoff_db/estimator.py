from typing import Dict, Any, List, Optional
from .db_manager import TakeoffDB


class BudgetEstimator:
    """
    Parametric Budget Estimator based on historical foundation data.
    Provides fast budget estimates and material takeoff forecasts for UTE and LT projects.
    """

    # Default market unit prices (Brazil Heavy Construction Benchmark - BRL)
    DEFAULT_UNIT_PRICES = {
        "concrete_m3": 550.0,       # R$/m³ Concreto usinado bombeado fck 30 MPa
        "steel_kg": 10.50,          # R$/kg Aço CA-50 cortado, dobrado e montado
        "formwork_m2": 95.0,        # R$/m² Fôrma compensada resinada
        "excavation_m3": 28.0,      # R$/m³ Escavação mecanizada solo 1ª cat
        "backfill_m3": 35.0,        # R$/m³ Reaterro compactado a 95% PN
        "lean_concrete_m3": 380.0,  # R$/m³ Concreto magro lastro
        "grillage_steel_kg": 18.0,  # R$/kg Aço galvanizado para grelhas metálicas LT
        "bdi_percent": 22.0         # % BDI
    }

    def __init__(self, db: Optional[TakeoffDB] = None):
        self.db = db or TakeoffDB()

    def run_estimate(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main calculation entry point.
        params:
            category: 'termoeletrica' or 'linha_transmissao'
            items: list of { type: str, count: int, sub_type: str, soil: str }
            prices: optional dictionary overriding unit prices
            bdi: optional float %
        """
        category = params.get('category', 'termoeletrica')
        custom_prices = params.get('prices', {})
        prices = dict(self.DEFAULT_UNIT_PRICES)
        prices.update(custom_prices)
        bdi = float(params.get('bdi', prices.get('bdi_percent', 22.0)))

        if category == 'termoeletrica':
            return self._estimate_ute(params, prices, bdi)
        else:
            return self._estimate_lt(params, prices, bdi)

    def _estimate_ute(self, params: Dict[str, Any], prices: Dict[str, float], bdi: float) -> Dict[str, Any]:
        items_req = params.get('items', [])
        # If simple counts given
        tg_count = int(params.get('tg_count', 0))
        hrsg_count = int(params.get('hrsg_count', 0))
        tr_count = int(params.get('tr_count', 0))
        stack_count = int(params.get('stack_count', 0))
        bfp_count = int(params.get('bfp_count', 0))
        pipe_rack_m = float(params.get('pipe_rack_m', 0.0))

        # Build list of items if using count shortcuts
        if not items_req:
            if tg_count > 0:
                items_req.append({"name": "Turbogerador (TG/TV)", "sub_category": "Turbogerador (TG)", "count": tg_count})
            if hrsg_count > 0:
                items_req.append({"name": "Caldeira de Recuperação (HRSG)", "sub_category": "Caldeira de Recuperação (HRSG)", "count": hrsg_count})
            if tr_count > 0:
                items_req.append({"name": "Transformador Elevador", "sub_category": "Transformador Elevador", "count": tr_count})
            if stack_count > 0:
                items_req.append({"name": "Chaminé Principal", "sub_category": "Chaminé Principal (Stack)", "count": stack_count})
            if bfp_count > 0:
                items_req.append({"name": "Bomba Alimentação BFP", "sub_category": "Bomba", "count": bfp_count})

        # Query benchmarks from DB
        entries = self.db.list_entries(category='termoeletrica')
        benchmarks = self._compute_benchmarks(entries)

        breakdown = []
        tot_concrete = 0.0
        tot_steel = 0.0
        tot_formwork = 0.0
        tot_excavation = 0.0

        for item in items_req:
            name = item.get('name')
            count = int(item.get('count', 1))
            sub = item.get('sub_category') or name

            stats = self._find_matching_benchmark(benchmarks, sub, fallback_cat='termoeletrica')

            vol = stats['concrete_m3'] * count
            steel = stats['steel_kg'] * count
            form = stats['formwork_m2'] * count
            exc = stats['excavation_m3'] * count

            tot_concrete += vol
            tot_steel += steel
            tot_formwork += form
            tot_excavation += exc

            cost_direct = (
                vol * prices['concrete_m3'] +
                steel * prices['steel_kg'] +
                form * prices['formwork_m2'] +
                exc * prices['excavation_m3']
            )

            breakdown.append({
                "item_name": name,
                "count": count,
                "unit_concrete_m3": round(stats['concrete_m3'], 2),
                "total_concrete_m3": round(vol, 2),
                "unit_steel_kg": round(stats['steel_kg'], 2),
                "total_steel_kg": round(steel, 2),
                "steel_ratio_kg_m3": round(stats['steel_ratio'], 1),
                "total_formwork_m2": round(form, 2),
                "total_excavation_m3": round(exc, 2),
                "estimated_cost_direct": round(cost_direct, 2),
                "estimated_cost_total": round(cost_direct * (1.0 + bdi / 100.0), 2)
            })

        # Add Pipe Racks if specified
        if pipe_rack_m > 0:
            # 1 pilar a cada 6 metros = pipe_rack_m / 6 bases
            bases_count = max(2, int(pipe_rack_m / 6.0))
            vol = bases_count * 2.5 # ~2.5 m³ por base
            steel = vol * 90.0
            form = vol * 1.8
            exc = vol * 2.2
            tot_concrete += vol
            tot_steel += steel
            tot_formwork += form
            tot_excavation += exc
            cost_direct = vol * prices['concrete_m3'] + steel * prices['steel_kg'] + form * prices['formwork_m2'] + exc * prices['excavation_m3']
            breakdown.append({
                "item_name": f"Pipe Racks ({pipe_rack_m:.0f}m - {bases_count} bases)",
                "count": bases_count,
                "unit_concrete_m3": 2.5,
                "total_concrete_m3": round(vol, 2),
                "unit_steel_kg": 225.0,
                "total_steel_kg": round(steel, 2),
                "steel_ratio_kg_m3": 90.0,
                "total_formwork_m2": round(form, 2),
                "total_excavation_m3": round(exc, 2),
                "estimated_cost_direct": round(cost_direct, 2),
                "estimated_cost_total": round(cost_direct * (1.0 + bdi / 100.0), 2)
            })

        cost_concrete = tot_concrete * prices['concrete_m3']
        cost_steel = tot_steel * prices['steel_kg']
        cost_formwork = tot_formwork * prices['formwork_m2']
        cost_excavation = tot_excavation * prices['excavation_m3']
        direct_total = cost_concrete + cost_steel + cost_formwork + cost_excavation
        grand_total = direct_total * (1.0 + bdi / 100.0)

        overall_ratio = round(tot_steel / tot_concrete, 1) if tot_concrete > 0 else 0.0

        return {
            "category": "termoeletrica",
            "category_label": "Fundações de Usina Termelétrica (UTE)",
            "summary": {
                "total_concrete_m3": round(tot_concrete, 2),
                "total_steel_kg": round(tot_steel, 2),
                "total_steel_ton": round(tot_steel / 1000.0, 2),
                "total_formwork_m2": round(tot_formwork, 2),
                "total_excavation_m3": round(tot_excavation, 2),
                "overall_steel_ratio_kg_m3": overall_ratio,
                "direct_cost_brl": round(direct_total, 2),
                "bdi_percent": bdi,
                "bdi_cost_brl": round(grand_total - direct_total, 2),
                "grand_total_brl": round(grand_total, 2),
                "cost_by_material": {
                    "concrete": round(cost_concrete, 2),
                    "steel": round(cost_steel, 2),
                    "formwork": round(cost_formwork, 2),
                    "excavation": round(cost_excavation, 2)
                }
            },
            "breakdown": breakdown,
            "prices_used": prices
        }

    def _estimate_lt(self, params: Dict[str, Any], prices: Dict[str, float], bdi: float) -> Dict[str, Any]:
        # Parameters for Transmission Line
        ts_count = int(params.get('ts_count', 0)) # Torres de suspensão
        ta_count = int(params.get('ta_count', 0)) # Torres de ancoragem
        gr_count = int(params.get('gr_count', 0)) # Torres com grelha metálica
        tb_count = int(params.get('tb_count', 0)) # Torres em tubulão
        guyed_count = int(params.get('guyed_count', 0)) # Torres estaiadas

        # If user provides km instead of tower count
        km_length = float(params.get('km_length', 0.0))
        if km_length > 0 and (ts_count + ta_count + gr_count + tb_count + guyed_count) == 0:
            # Rule of thumb: ~2.5 to 3 towers per km
            total_towers = int(km_length * 2.5)
            # Typically 80% suspension, 20% angle/tension
            ts_count = int(total_towers * 0.8)
            ta_count = total_towers - ts_count

        entries = self.db.list_entries(category='linha_transmissao')
        benchmarks = self._compute_benchmarks(entries)

        breakdown = []
        tot_concrete = 0.0
        tot_steel = 0.0
        tot_formwork = 0.0
        tot_excavation = 0.0
        tot_grillage_steel = 0.0

        tower_configs = [
            ("Torres de Suspensão (Solo Normal)", ts_count, "Torre de Suspensão 500kV"),
            ("Torres de Ancoragem (Solo Normal)", ta_count, "Torre de Ancoragem 500kV"),
            ("Torres com Grelha Metálica (Sem Concreto)", gr_count, "Torre com Grelha Metálica"),
            ("Torres em Tubulão a Céu Aberto", tb_count, "Torre em Tubulão Céu Aberto"),
            ("Torres Estaiadas 500kV", guyed_count, "Torre Estaiada")
        ]

        for label, count, sub in tower_configs:
            if count <= 0:
                continue

            stats = self._find_matching_benchmark(benchmarks, sub, fallback_cat='linha_transmissao')

            vol = stats['concrete_m3'] * count
            steel = stats['steel_kg'] * count
            form = stats['formwork_m2'] * count
            exc = stats['excavation_m3'] * count

            tot_concrete += vol
            tot_steel += steel
            tot_formwork += form
            tot_excavation += exc

            if 'grelha' in sub.lower():
                tot_grillage_steel += steel
                cost_direct = steel * prices['grillage_steel_kg'] + exc * prices['excavation_m3']
            else:
                cost_direct = (
                    vol * prices['concrete_m3'] +
                    steel * prices['steel_kg'] +
                    form * prices['formwork_m2'] +
                    exc * prices['excavation_m3']
                )

            breakdown.append({
                "item_name": label,
                "count": count,
                "unit_concrete_m3": round(stats['concrete_m3'], 2),
                "total_concrete_m3": round(vol, 2),
                "unit_steel_kg": round(stats['steel_kg'], 2),
                "total_steel_kg": round(steel, 2),
                "steel_ratio_kg_m3": round(stats['steel_ratio'], 1),
                "total_formwork_m2": round(form, 2),
                "total_excavation_m3": round(exc, 2),
                "estimated_cost_direct": round(cost_direct, 2),
                "estimated_cost_total": round(cost_direct * (1.0 + bdi / 100.0), 2)
            })

        cost_concrete = tot_concrete * prices['concrete_m3']
        cost_rebar = (tot_steel - tot_grillage_steel) * prices['steel_kg']
        cost_grillage = tot_grillage_steel * prices['grillage_steel_kg']
        cost_formwork = tot_formwork * prices['formwork_m2']
        cost_excavation = tot_excavation * prices['excavation_m3']

        direct_total = cost_concrete + cost_rebar + cost_grillage + cost_formwork + cost_excavation
        grand_total = direct_total * (1.0 + bdi / 100.0)

        overall_ratio = round((tot_steel - tot_grillage_steel) / tot_concrete, 1) if tot_concrete > 0 else 0.0

        return {
            "category": "linha_transmissao",
            "category_label": "Fundações de Linha de Transmissão (LT)",
            "summary": {
                "total_towers": ts_count + ta_count + gr_count + tb_count + guyed_count,
                "total_concrete_m3": round(tot_concrete, 2),
                "total_steel_kg": round(tot_steel, 2),
                "total_steel_ton": round(tot_steel / 1000.0, 2),
                "total_formwork_m2": round(tot_formwork, 2),
                "total_excavation_m3": round(tot_excavation, 2),
                "overall_steel_ratio_kg_m3": overall_ratio,
                "direct_cost_brl": round(direct_total, 2),
                "bdi_percent": bdi,
                "bdi_cost_brl": round(grand_total - direct_total, 2),
                "grand_total_brl": round(grand_total, 2),
                "cost_by_material": {
                    "concrete": round(cost_concrete, 2),
                    "steel_rebar": round(cost_rebar, 2),
                    "steel_grillage": round(cost_grillage, 2),
                    "formwork": round(cost_formwork, 2),
                    "excavation": round(cost_excavation, 2)
                }
            },
            "breakdown": breakdown,
            "prices_used": prices
        }

    def _compute_benchmarks(self, entries: List[Dict[str, Any]]) -> Dict[str, Dict[str, float]]:
        grouped = {}
        for e in entries:
            key = (e.get('sub_category') or e.get('equipment_name') or 'Default').lower()
            if key not in grouped:
                grouped[key] = {
                    'vol': [],
                    'steel': [],
                    'form': [],
                    'exc': [],
                    'ratio': []
                }
            grouped[key]['vol'].append(e.get('concrete_volume_m3', 0.0))
            grouped[key]['steel'].append(e.get('steel_weight_kg', 0.0))
            grouped[key]['form'].append(e.get('formwork_area_m2', 0.0))
            grouped[key]['exc'].append(e.get('excavation_m3', 0.0))
            if e.get('steel_ratio_kg_m3', 0.0) > 0:
                grouped[key]['ratio'].append(e.get('steel_ratio_kg_m3'))

        benchmarks = {}
        for k, vals in grouped.items():
            benchmarks[k] = {
                'concrete_m3': sum(vals['vol']) / len(vals['vol']) if vals['vol'] else 0.0,
                'steel_kg': sum(vals['steel']) / len(vals['steel']) if vals['steel'] else 0.0,
                'formwork_m2': sum(vals['form']) / len(vals['form']) if vals['form'] else 0.0,
                'excavation_m3': sum(vals['exc']) / len(vals['exc']) if vals['exc'] else 0.0,
                'steel_ratio': sum(vals['ratio']) / len(vals['ratio']) if vals['ratio'] else 95.0
            }
        return benchmarks

    def _find_matching_benchmark(self, benchmarks: Dict[str, Dict[str, float]], sub_name: str, fallback_cat: str) -> Dict[str, float]:
        sub_lower = sub_name.lower()
        for k, v in benchmarks.items():
            if k in sub_lower or sub_lower in k:
                return v

        # Fallbacks if not found directly
        if fallback_cat == 'termoeletrica':
            return {'concrete_m3': 200.0, 'steel_kg': 20000.0, 'formwork_m2': 180.0, 'excavation_m3': 400.0, 'steel_ratio': 100.0}
        else:
            return {'concrete_m3': 28.0, 'steel_kg': 2400.0, 'formwork_m2': 50.0, 'excavation_m3': 100.0, 'steel_ratio': 85.0}
