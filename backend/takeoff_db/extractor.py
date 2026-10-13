import os
import re
import io
from collections import defaultdict
import pymupdf as fitz
import pandas as pd
from typing import Dict, Any, List, Optional, Tuple


class DrawingExtractor:
    """
    Intelligent Drawing, Calculation Memorial & Quantities Extractor for Structural Foundations.
    Specifically calibrated for Brazilian Engineering Standards:
    - Transmission Lines & Substations (LT / SE)
    - Thermoelectric Power Plants (UTE)
    - Structural Drawing Plans, Calculation Memorials (MCC), Sketches (CRQ), Technical Reports & Material Takeoffs.
    """

    DOC_TYPE_LABELS = {
        'desenho': 'Desenho / Prancha',
        'memorial_calculo': 'Memorial de Cálculo',
        'croqui': 'Croqui / Esboço',
        'relatorio_tecnico': 'Relatório Técnico',
        'especificacao_tecnica': 'Especificação / Critério',
        'quantitativo_material': 'Quantitativo de Materiais',
        'outro': 'Outro Documento'
    }

    # Engineering Keywords Dictionary for UTE
    UTE_EQUIPMENT_PATTERNS = [
        (r'(?i)bloco\s*(?:do\s*)?(?:turbo[\s\-]?gerador|tg|tv|turbina|gerador)', 'Turbogerador (TG/TV)', 'Bloco Maciço'),
        (r'(?i)(?:base|fundação)\s*(?:do\s*)?transformador(?:\s*elevador)?(?:\s*tr[\-\s]?\d+)?', 'Transformador Principal', 'Base com Bacia de Contenção'),
        (r'(?i)caldeira\s*(?:de\s*recupera[çc][ãa]o)?|hrsg', 'Caldeira de Recuperação (HRSG)', 'Bloco sobre Estacas'),
        (r'(?i)chamin[eé](?:\s*hrsg|\s*bypass)?|stack', 'Chaminé Principal', 'Fundação Circular / Poligonal'),
        (r'(?i)bomba\s*(?:de\s*alimenta[çc][ãa]o|bfp)', 'Bomba de Alimentação (BFP)', 'Bloco Rígido'),
        (r'(?i)pipe[\s\-]?rack|rack\s*de\s*tubula[çc][ãa]o', 'Pipe Rack / Tubulações', 'Bases de Pilares'),
        (r'(?i)aerocondensador|acc|torre\s*(?:de\s*)?resfriamento', 'Aerocondensador (ACC)', 'Pórticos e Fundações Isoladas'),
        (r'(?i)bacia\s*(?:de\s*)?conten[çc][ãa]o|parede\s*corta[\s\-]?fogo', 'Bacia e Corta-Fogo', 'Radier / Muros de Contenção'),
        (r'(?i)tanque\s*(?:de\s*)?(?:[aá]gua|combust[ií]vel|diesel)', 'Tanque de Armazenamento', 'Anel de Fundação / Radier'),
    ]

    # Engineering Keywords Dictionary for LT & SE
    LT_EQUIPMENT_PATTERNS = [
        (r'(?i)p[oó]rtico(?:\s*prt\d+|\s*de\s*linha|\s*de\s*barramento)?', 'Pórtico de Subestação', 'Pórtico / Base e Vigas'),
        (r'(?i)subesta[çc][ãa]o|gis|pain[eé]is\s*se', 'Subestação / GIS', 'Sapatas / Vigas Baldrame'),
        (r'(?i)torre\s*(?:de\s*)?suspens[ãa]o|torre\s*ts[\-\s]?\d*|suspension\s*tower', 'Torre de Suspensão', 'Sapatas Isoladas (4 Pés)'),
        (r'(?i)torre\s*(?:de\s*)?ancoragem|torre\s*ta[\-\s]?\d*|tension\s*tower|dead[\-\s]?end', 'Torre de Ancoragem', 'Sapatas Robustas / Tubulões'),
        (r'(?i)torre\s*(?:de\s*)?[aâ]ngulo|v[eé]rtice|terminal', 'Torre de Ângulo / Vértice', 'Fundação Especial Tracionada'),
        (r'(?i)torre\s*estaiada|guyed(?:\s*v)?', 'Torre Estaiada', 'Mastro Central + 4 Estais'),
        (r'(?i)sapata\s*com\s*grelha|grelha\s*met[aá]lica|grillage', 'Torre com Grelha Metálica', 'Grelha Metálica (Sem Concreto)'),
        (r'(?i)tubul[ãa]o\s*(?:a\s*c[eé]u\s*aberto)?', 'Fundação em Tubulão', 'Tubulão a Céu Aberto'),
        (r'(?i)bloco\s*sobre\s*estacas|estacas\s*raiz|tracionada', 'Fundação sobre Estacas', 'Blocos e Estacas Tracionadas'),
        (r'(?i)travessia\s*(?:de\s*rio|especial)', 'Torre de Travessia Especial', 'Fundação Profunda de Grande Porte'),
    ]

    @classmethod
    def detect_document_type(cls, filename: str, full_text: str = "") -> str:
        """
        Differentiates document types based on Brazilian engineering naming conventions and content:
        - desenho: Desenho / Prancha de Engenharia (DSN, DDM, DMT, DE, PTA, DWG, Planta, Forma, Armação)
        - memorial_calculo: Memória de Cálculo Estrutural / Geotécnico (MCC, MC, MEM, CALC)
        - croqui: Croqui / Esboço Técnico (CRQ, CRO, Croqui, Esboço)
        - relatorio_tecnico: Relatório Técnico / Parecer / Laudo (RLT, RT, LAU, Relatório)
        - especificacao_tecnica: Critério de Projeto / Especificação / Padronização (CP, ET, PC, NT)
        - quantitativo_material: Lista de Materiais / Quantitativo (QMT, LMT, LDM, QTD)
        """
        fn_upper = filename.upper()
        clean_text = full_text[:6000].lower()

        # 1. Filename Code Matching (Strongest indicator in Brazilian Engineering)
        if re.search(r'\.(?:MCC|MC)\b|[-_](?:MCC|MC)[-_]', fn_upper) or 'MEMORIA' in fn_upper or 'MEMORIAL' in fn_upper:
            return 'memorial_calculo'
        if re.search(r'\.(?:CRQ|CRO)\b|[-_](?:CRQ|CRO)[-_]', fn_upper) or 'CROQUI' in fn_upper or 'ESBOCO' in fn_upper or 'ESBOÇO' in fn_upper:
            return 'croqui'
        if re.search(r'\.(?:QMT|LMT|LDM|QTD)\b|[-_](?:QMT|LMT|LDM|QTD)[-_]', fn_upper) or 'LISTA DE MATERIA' in fn_upper:
            return 'quantitativo_material'
        if re.search(r'\.(?:RLT|RT|LAU)\b|[-_](?:RLT|RT|LAU)[-_]', fn_upper) or 'PARECER' in fn_upper:
            return 'relatorio_tecnico'
        if re.search(r'\.(?:CP|ET|PC|NT)\b|[-_](?:CP|ET|PC|NT)[-_]', fn_upper) or 'CRITERIO' in fn_upper or 'ESPECIFICACAO' in fn_upper or 'PADRONIZACAO' in fn_upper:
            return 'especificacao_tecnica'
        if re.search(r'\.(?:DSN|DDM|DMT|DE|PTA|DES|DWG)\b|[-_](?:DSN|DDM|DMT|DE|PTA|DES)[-_]', fn_upper):
            return 'desenho'

        # 2. Content Heuristics from Document Title Block / Body
        if any(k in clean_text for k in ['memória de cálculo', 'memoria de calculo', 'memorial de cálculo', 'memorial de calculo', 'relatório de cálculo', 'relatorio de calculo', 'calculation report']):
            return 'memorial_calculo'
        if any(k in clean_text for k in ['croqui', 'esboço', 'esboco', 'sketch']):
            return 'croqui'
        if any(k in clean_text for k in ['lista de materiais', 'resumo de materiais', 'lista de peças', 'tabela de materiais']):
            return 'quantitativo_material'
        if any(k in clean_text for k in ['relatório técnico', 'relatorio tecnico', 'parecer técnico', 'parecer tecnico', 'relatório geotécnico', 'laudo pericial']):
            return 'relatorio_tecnico'
        if any(k in clean_text for k in ['critério de projeto', 'criterio de projeto', 'especificação técnica', 'especificacao tecnica', 'padronização', 'padronizacao']):
            return 'especificacao_tecnica'
        if any(k in clean_text for k in ['planta - forma', 'planta de forma', 'corte a-a', 'forma e armação', 'desenho de forma', 'locação de fundações', 'escala: 1:', 'escala: indicada', 'detalhe típico', 'tabela 1 - lista de ferros', 'tabela 1 - quantidades']):
            return 'desenho'

        return 'desenho'

    @classmethod
    def extract_from_file(cls, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        """
        Main entry point: processes PDF, Excel, or Text files.
        """
        ext = os.path.splitext(filename)[1].lower()
        if ext == '.pdf':
            return cls.extract_from_pdf(file_bytes, filename)
        elif ext in ['.xlsx', '.xls', '.csv']:
            return cls.extract_from_excel(file_bytes, filename)
        else:
            return cls._empty_template(filename, "Formato não suportado para leitura automática direta. Use edição manual.")

    @classmethod
    def extract_from_pdf(cls, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        full_text = ""
        reconstructed_lines = []
        tables_found = []

        # Extract text, reconstructed lines and tables
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_text = page.get_text("text")
            full_text += f"\n--- PÁGINA {page_idx + 1} ---\n" + page_text

            # Spatial word sorting to reconstruct clean lines regardless of PDF block grouping
            try:
                words = page.get_text("words")
                lines_dict = defaultdict(list)
                for w in words:
                    # Group by vertical coordinate (tolerance ~4 points)
                    y_key = round(w[1] / 4.0) * 4.0
                    lines_dict[y_key].append(w)
                for y in sorted(lines_dict.keys()):
                    line_words = sorted(lines_dict[y], key=lambda w: w[0])
                    line_str = " ".join([w[4] for w in line_words]).strip()
                    if line_str:
                        reconstructed_lines.append(line_str)
            except Exception:
                pass

            # Native table extractor
            try:
                tabs = page.find_tables()
                for tab in tabs:
                    df = tab.extract()
                    if df and len(df) > 1:
                        tables_found.append(df)
            except Exception:
                pass

        doc.close()

        # Parse extracted information
        return cls._parse_text_and_tables(full_text, reconstructed_lines, tables_found, filename)

    @classmethod
    def extract_from_excel(cls, file_bytes: bytes, filename: str) -> Dict[str, Any]:
        try:
            excel_file = io.BytesIO(file_bytes)
            xl = pd.ExcelFile(excel_file)
            tables = []
            reconstructed_lines = []
            full_text = f"Arquivo Excel: {filename}\nPlanilhas: {', '.join(xl.sheet_names)}\n"

            for sheet_name in xl.sheet_names:
                df = xl.parse(sheet_name)
                full_text += f"\n--- Planilha: {sheet_name} ---\n"
                full_text += df.to_string(index=False)
                for row_vals in df.values:
                    row_str = " ".join([str(v) for v in row_vals if pd.notna(v)])
                    if row_str.strip():
                        reconstructed_lines.append(row_str)
                rows = [df.columns.tolist()] + df.values.tolist()
                tables.append(rows)

            return cls._parse_text_and_tables(full_text, reconstructed_lines, tables, filename)
        except Exception as e:
            return cls._empty_template(filename, f"Erro ao ler planilha: {e}")

    @classmethod
    def _parse_text_and_tables(cls, full_text: str, lines: List[str], tables: List[Any], filename: str) -> Dict[str, Any]:
        result = cls._empty_template(filename)
        result['raw_extracted_text'] = full_text[:4000]

        # 1. Detect Document Type (Desenho vs Memorial de Cálculo vs Croqui vs Outros)
        doc_type = cls.detect_document_type(filename, full_text)
        result['doc_type'] = doc_type

        # 2. Detect Discipline / Category & Structure / Equipment
        category, sub_cat, struct_type, detected_name = cls._detect_category_and_equipment(full_text, lines, filename)
        result['category'] = category
        result['sub_category'] = sub_cat
        result['structure_type'] = struct_type
        if detected_name:
            result['equipment_name'] = detected_name

        # 3. Detect Drawing Metadata (Drawing Code, Revision, Project / Local)
        meta = cls._extract_metadata(full_text, lines, filename)
        result.update(meta)

        # If equipment was updated by title block in meta, prioritize it
        if meta.get('equipment_name'):
            result['equipment_name'] = meta['equipment_name']
        if meta.get('structure_type'):
            result['structure_type'] = meta['structure_type']

        # 4. Extract Concrete fck and Steel Type
        fck = cls._extract_concrete_fck(full_text, lines)
        if fck:
            result['fck_concrete'] = fck

        # 5. Extract Quantities from Reconstructed Lines and Tables
        quantities = cls._extract_quantities(full_text, lines, tables)
        result.update(quantities['summary'])
        result['line_items'] = quantities['line_items']

        # 6. Compute Ratios
        vol = result['concrete_volume_m3']
        steel = result['steel_weight_kg']
        form = result['formwork_area_m2']
        if vol > 0.001:
            result['steel_ratio_kg_m3'] = round(steel / vol, 2)
            result['formwork_ratio_m2_m3'] = round(form / vol, 2)

        return result

    @classmethod
    def _detect_category_and_equipment(cls, text: str, lines: List[str], filename: str) -> Tuple[str, str, str, str]:
        search_target = f"{filename}\n{text}".lower()

        ute_score = 0
        lt_score = 0

        # Termelétrica scoring
        for kw in ['termoelétrica', 'termeletrica', 'ute ', 'turbina', 'gerador', 'turbogerador', 'caldeira', 'hrsg', 'chaminé', 'chamine', 'bfp', 'pipe rack', 'transformador elevador']:
            if kw in search_target:
                ute_score += 2

        # LT / Subestação scoring (Subestação, Pórtico, SE, LT belong to Transmission/Substations)
        for kw in ['subestação', 'subestacao', 'transmissão', 'transmissao', 'pórtico', 'portico', 'torre', 'suspensão', 'ancoragem', 'estaiada', 'grelha metálica', 'stub', 'kv', 'se ']:
            if kw in search_target:
                lt_score += 2

        if lt_score >= ute_score and lt_score > 0:
            category = 'linha_transmissao'
            for pat, sub_c, s_type in cls.LT_EQUIPMENT_PATTERNS:
                m = re.search(pat, search_target)
                if m:
                    tag_m = re.search(r'(?i)\b(?:torre|t|ts|ta|prt)[\-\s]?(\d{1,4}[a-z]?)\b', search_target)
                    tag = f" ({tag_m.group(0).upper()})" if tag_m else ""
                    return category, sub_c, s_type, f"{sub_c}{tag}"
            return category, 'Linha de Transmissão / Subestação', 'Fundação', 'Estrutura LT / SE'
        else:
            category = 'termoeletrica'
            for pat, sub_c, s_type in cls.UTE_EQUIPMENT_PATTERNS:
                m = re.search(pat, search_target)
                if m:
                    tag_m = re.search(r'(?i)\b(?:tg|tv|tr|bfp|caldeira|chaminé)[\-\s]?(\d{1,3}[a-z]?)\b', search_target)
                    tag = f" ({tag_m.group(0).upper()})" if tag_m else ""
                    return category, sub_c, s_type, f"{sub_c}{tag}"
            return category, 'Fundação Termelétrica', 'Bloco / Radier', 'Equipamento UTE'

    @classmethod
    def _extract_metadata(cls, text: str, lines: List[str], filename: str) -> Dict[str, Any]:
        meta = {}

        # 1. Document / Drawing Code
        # First check Brazilian engineering document mask: e.g. SECFD.01-500-PE-CV.DSN-0020
        doc_code = ""
        m_mask = re.search(r'\b([A-Z0-9]{3,8}\.[0-9]{2}-[0-9]{3}-[A-Z]{2}-[A-Z]{2}\.[A-Z]{3}-[0-9]{4}(?:-[0-9]{2}[A-Z]?)?)\b', text)
        if m_mask:
            doc_code = re.sub(r'-[0-9]{2}[A-Z]?$', '', m_mask.group(1).strip())

        if not doc_code:
            for l in lines:
                m = re.search(r'(?i)(?:n[ºo]\s*documento|n[ºo]\s*fornecedor|n[ºo]\s*desenho|prancha|dwg)\s*[:=]?\s*([A-Z0-9\.\-_/]{5,40})', l)
                if m and not m.group(1).upper().startswith(('DESENHO', 'INDICADA')):
                    doc_code = m.group(1).strip()
                    break

        if not doc_code:
            clean_name = os.path.splitext(filename)[0]
            # Strip UUID prefix if present like '99ac2675_SECFD...'
            clean_name = re.sub(r'^[a-f0-9]{8}_', '', clean_name)
            doc_code = clean_name

        meta['drawing_code'] = doc_code

        # 2. Revision
        # Must be valid engineering revision: '0', '00', '00A', '01', '02', 'A', 'B', 'R0'
        # NEVER header words: 'DATA', 'ALTERAÇÃO', 'DES', 'VERIF', 'APROV', 'EMISSÃO'
        revision = "0"
        for l in lines:
            m_rev = re.search(r'(?i)\brevis[ãa]o\s*[:=]?\s*(?:r[\-\s]*)?([0-9]{2}[A-Z]?|[A-Z]{1,2}|[0-9]{1,2})\b', l)
            if m_rev:
                cand = m_rev.group(1).upper()
                if cand not in ['DATA', 'REV', 'DES', 'APROV', 'VERIF', 'APROVADO', 'FINAL', 'EXEC', 'EMISSÃO']:
                    revision = cand
                    break
        if revision == "0":
            for l in lines:
                m_rev2 = re.search(r'\bR\-\s*([0-9]{2}[A-Z]?)\b', l)
                if m_rev2:
                    revision = m_rev2.group(1).upper()
                    break
        meta['revision'] = revision

        # 3. Project Name / Local / Unidade
        # Search carimbo specific fields to avoid matching sentences from project notes
        unidade = ""
        local = ""
        emp = ""
        for l in lines:
            m_u = re.search(r'(?i)unidade\s*[:=]\s*([^\s][^:\n\r]+?)(?:\s+folha|\s+n[ºo]|$)', l)
            if m_u and not unidade:
                unidade = m_u.group(1).strip()
            m_l = re.search(r'(?i)local\s*[:=]\s*([^\s][^:\n\r]+?)(?:\s+n[ºo]|\s+c[oó]digo|$)', l)
            if m_l and not local:
                local = m_l.group(1).strip()
            m_e = re.search(r'(?i)(?:n[ºo]\s*)?empreendimento\s*[:=]\s*([^\s][^:\n\r]+?)(?:\s+revis[ãa]o|$)', l)
            if m_e and not emp and m_e.group(1).strip():
                emp = m_e.group(1).strip()

        if unidade and local:
            meta['project_name'] = f"{unidade} - {local}".title()
        elif local:
            meta['project_name'] = local.title()
        elif unidade:
            meta['project_name'] = unidade.title()
        elif emp:
            meta['project_name'] = emp.title()
        else:
            # Fallback to 'PROJETO:' or 'OBRA:' with guard against sentence text
            proj_found = False
            for l in lines:
                m_p = re.search(r'(?i)(?:projeto|obra|cliente)\s*[:=]\s*([A-Za-z0-9\s\-_/]{4,45})', l)
                if m_p:
                    cand = m_p.group(1).strip()
                    # Filter out sentences from notes like "devem estar de acordo..."
                    if not any(bad in cand.lower() for bad in ['não podem', 'devem estar', 'segurança', 'acordo com', 'conforme']):
                        meta['project_name'] = cand.title()
                        proj_found = True
                        break
            if not proj_found:
                meta['project_name'] = "Projeto Não Especificado"

        # 4. Title / Equipment / Structure
        equipment_title = ""
        for l in lines:
            m_t = re.search(r'(?i)t[íi]tulo\s*[:=]\s*([^\n\r]+)', l)
            if m_t:
                cand = m_t.group(1).strip()
                cand = re.sub(r'(?i)escala.*$', '', cand).strip()
                if cand:
                    equipment_title = cand.title()
                    break
        if not equipment_title:
            for l in lines:
                if 'FUNDAÇÃO PARA' in l.upper() or 'FUNDACAO PARA' in l.upper():
                    m_f = re.search(r'(?i)(funda[çc][ãa]o\s+para\s+[^:\n\r]+)', l)
                    if m_f:
                        cand = m_f.group(1).strip()
                        cand = re.sub(r'(?i)escala.*$', '', cand).strip()
                        equipment_title = cand.title()
                        break

        if equipment_title:
            meta['equipment_name'] = equipment_title
            up_eq = equipment_title.upper()
            if 'PÓRTICO' in up_eq or 'PORTICO' in up_eq:
                meta['structure_type'] = 'Pórtico / Base e Vigas'
            elif 'TRANSFORMADOR' in up_eq:
                meta['structure_type'] = 'Base do Transformador + Bacia'
            elif 'TORRE' in up_eq:
                meta['structure_type'] = 'Sapatas Isoladas / Tubulões'
            elif 'TURBINA' in up_eq or 'GERADOR' in up_eq:
                meta['structure_type'] = 'Bloco Maciço'
            elif 'CALDEIRA' in up_eq or 'HRSG' in up_eq:
                meta['structure_type'] = 'Bloco sobre Estacas'

        return meta

    @classmethod
    def _extract_concrete_fck(cls, text: str, lines: List[str]) -> Optional[float]:
        # Handles fck> 25MPa, fck >= 30, fck = 25, fck 30 MPa
        m = re.search(r'(?i)fck\s*[:>=≥~]?\s*(\d{2,3})\s*(?:mpa)?', text)
        if m:
            val = float(m.group(1))
            if 15.0 <= val <= 90.0:
                return val
        return None

    @classmethod
    def _extract_quantities(cls, text: str, lines: List[str], tables: List[Any]) -> Dict[str, Any]:
        summary = {
            'concrete_volume_m3': 0.0,
            'steel_weight_kg': 0.0,
            'formwork_area_m2': 0.0,
            'excavation_m3': 0.0,
            'backfill_m3': 0.0,
            'lean_concrete_m3': 0.0,
            'anchor_bolts_kg': 0.0,
            'pile_count': 0,
            'pile_depth_m': 0.0
        }
        line_items = []

        # 1. Check Reconstructed Lines for 5-Column Foundation Quantity Table
        # Standard table row: Escavação, Concreto Estrutural, Regularização, Reaterro, Forma
        for l in lines:
            if any(k in l.upper() for k in ['TOTAL GLOBAL', 'PRT1', 'TOTAL GERAL', 'TOTAL (X1)']):
                nums = re.findall(r'\b\d{1,5},\d{2}\b', l)
                if len(nums) == 5:
                    vals = [cls._parse_brazilian_number(n) for n in nums]
                    if vals[1] and vals[1] > summary['concrete_volume_m3']:
                        summary['excavation_m3'] = vals[0] or 0.0
                        summary['concrete_volume_m3'] = vals[1] or 0.0
                        summary['lean_concrete_m3'] = vals[2] or 0.0
                        summary['backfill_m3'] = vals[3] or 0.0
                        summary['formwork_area_m2'] = vals[4] or 0.0
                        break

        # 2. Check Reconstructed Lines for Steel Weight
        # Handles: PESO TOTAL (kg) 1663, PESO GLOBAL (x1) (kg) 1663, PESO TOTAL DO AÇO: 1663 kg
        for l in lines:
            m_s = re.search(r'(?i)peso\s*(?:total|global)(?:[^\d]{0,25})\s*[:=]?\s*(\d{2,7}(?:[\.,]\d{1,2})?)\s*(?:kg)?', l)
            if m_s:
                val = cls._parse_brazilian_number(m_s.group(1))
                if val and val > summary['steel_weight_kg']:
                    summary['steel_weight_kg'] = val

        # 3. Check Tables Data (PyMuPDF / Excel)
        for tab in tables:
            for row in tab:
                if not row or len(row) < 2:
                    continue
                row_str = " ".join([str(c) for c in row if c is not None]).lower()

                # Steel Total row
                if ('peso total' in row_str or 'peso global' in row_str) and not 'tabela' in row_str:
                    for cell in row:
                        if cell and re.search(r'\b\d{2,6}\b', str(cell)):
                            val = cls._parse_brazilian_number(re.search(r'\b\d{2,6}(?:[\.,]\d{1,2})?\b', str(cell)).group(0))
                            if val and val > summary['steel_weight_kg']:
                                summary['steel_weight_kg'] = val

                # 5-column quantity row in tables
                if ('total global' in row_str or 'total geral' in row_str) and any(k in row_str for k in ['concreto', 'escavação', 'reaterro', 'forma']):
                    c_nums = []
                    for c in row:
                        if c and re.search(r'\b\d{1,6}[,\.]\d{2}\b', str(c)):
                            c_nums.append(cls._parse_brazilian_number(re.search(r'\b\d{1,6}[,\.]\d{2}\b', str(c)).group(0)))
                    if len(c_nums) == 5 and c_nums[1] and c_nums[1] > summary['concrete_volume_m3']:
                        summary['excavation_m3'] = c_nums[0] or 0.0
                        summary['concrete_volume_m3'] = c_nums[1] or 0.0
                        summary['lean_concrete_m3'] = c_nums[2] or 0.0
                        summary['backfill_m3'] = c_nums[3] or 0.0
                        summary['formwork_area_m2'] = c_nums[4] or 0.0

                # Concrete detection in individual table cells
                elif any(k in row_str for k in ['concreto estrutural', 'volume concreto', 'concreto fck']):
                    num = cls._find_number_in_row(row, ['m3', 'm³'])
                    if num and num > summary['concrete_volume_m3']:
                        summary['concrete_volume_m3'] = num

                # Formwork detection in individual table cells (avoiding notes)
                elif any(k in row_str for k in ['área de fôrma', 'area de forma', 'fôrma total', 'forma total']):
                    num = cls._find_number_in_row(row, ['m2', 'm²'])
                    if num and num > summary['formwork_area_m2']:
                        summary['formwork_area_m2'] = num

        # 4. Text Fallback (if still 0)
        if summary['concrete_volume_m3'] == 0:
            vol = cls._extract_regex_float(r'(?i)(?:volume(?:\s*de)?\s*concreto|concreto(?:[^\n\r:]{0,35})?)\s*[:=]?\s*([\d\.,]+)\s*m[³3]', text)
            if vol:
                summary['concrete_volume_m3'] = vol

        if summary['steel_weight_kg'] == 0:
            # Match steel weight without capturing 'CA-50' as 50 tons
            steel = cls._extract_regex_float(r'(?i)(?:peso(?:\s*total)?(?:\s*do)?\s*a[çc]o|armadura\s*total)\s*[:=]?\s*([\d\.,]+)\s*(?:kg|quilos)', text)
            if steel:
                summary['steel_weight_kg'] = steel
            else:
                steel_ton = cls._extract_regex_float(r'(?i)(?:peso(?:\s*total)?(?:\s*do)?\s*a[çc]o|armadura\s*total)\s*[:=]?\s*([\d\.,]+)\s*(?:ton|toneladas)', text)
                if steel_ton:
                    summary['steel_weight_kg'] = steel_ton * 1000.0

        if summary['formwork_area_m2'] == 0:
            form = cls._extract_regex_float(r'(?i)(?:[aá]rea(?:\s*de)?\s*f[oô]rma|f[oô]rma\s*total)\s*[:=]?\s*([\d\.,]+)\s*m[²2]', text)
            if form:
                summary['formwork_area_m2'] = form

        if summary['excavation_m3'] == 0:
            exc = cls._extract_regex_float(r'(?i)(?:escava[çc][ãa]o|volume\s*escavado)\s*[:=]?\s*([\d\.,]+)\s*m[³3]', text)
            if exc:
                summary['excavation_m3'] = exc

        if summary['backfill_m3'] == 0:
            reaterro = cls._extract_regex_float(r'(?i)(?:reaterro|volume\s*de\s*reaterro)\s*[:=]?\s*([\d\.,]+)\s*m[³3]', text)
            if reaterro:
                summary['backfill_m3'] = reaterro

        if summary['lean_concrete_m3'] == 0:
            lean = cls._extract_regex_float(r'(?i)(?:lastro|concreto\s*(?:de\s*)?regulariza[çc][ãa]o|concreto\s*magro)\s*[:=]?\s*([\d\.,]+)\s*m[³3]', text)
            if lean:
                summary['lean_concrete_m3'] = lean

        # Build Line Items
        if summary['concrete_volume_m3'] > 0:
            line_items.append({
                "item": "Concreto Estrutural",
                "spec": "fck conforme projeto",
                "unit": "m³",
                "quantity": summary['concrete_volume_m3'],
                "unit_weight": 2400.0,
                "total_weight": round(summary['concrete_volume_m3'] * 2400.0, 1),
                "notes": "Extraído da tabela de quantidades"
            })
        if summary['lean_concrete_m3'] > 0:
            line_items.append({
                "item": "Concreto de Regularização / Lastro",
                "spec": "fck 10-15 MPa",
                "unit": "m³",
                "quantity": summary['lean_concrete_m3'],
                "unit_weight": 2200.0,
                "total_weight": round(summary['lean_concrete_m3'] * 2200.0, 1),
                "notes": "Extraído da tabela de quantidades"
            })
        if summary['steel_weight_kg'] > 0:
            line_items.append({
                "item": "Aço Armadura CA-50 / CA-60",
                "spec": "Barras cortadas e dobradas",
                "unit": "kg",
                "quantity": summary['steel_weight_kg'],
                "unit_weight": 1.0,
                "total_weight": summary['steel_weight_kg'],
                "notes": "Extraído da lista de ferros / armaduras"
            })
        if summary['formwork_area_m2'] > 0:
            line_items.append({
                "item": "Fôrma de Madeira / Metálica",
                "spec": "Resinada / Estrutural",
                "unit": "m²",
                "quantity": summary['formwork_area_m2'],
                "unit_weight": 0.0,
                "total_weight": 0.0,
                "notes": "Extraído da tabela de quantidades"
            })
        if summary['excavation_m3'] > 0:
            line_items.append({
                "item": "Escavação Mecânica / Manual",
                "spec": "Solo comum de fundação",
                "unit": "m³",
                "quantity": summary['excavation_m3'],
                "unit_weight": 0.0,
                "total_weight": 0.0,
                "notes": "Extraído da tabela de quantidades"
            })
        if summary['backfill_m3'] > 0:
            line_items.append({
                "item": "Reaterro Compactado",
                "spec": "Grau de compactação 95% PN",
                "unit": "m³",
                "quantity": summary['backfill_m3'],
                "unit_weight": 0.0,
                "total_weight": 0.0,
                "notes": "Extraído da tabela de quantidades"
            })

        # Placeholder line items if none extracted
        if not line_items:
            line_items = [
                {"item": "Concreto Estrutural", "spec": "fck 30 MPa", "unit": "m³", "quantity": 0.0, "unit_weight": 2400.0, "total_weight": 0.0, "notes": "Preenchimento manual"},
                {"item": "Aço CA-50", "spec": "Barras cortadas e dobradas", "unit": "kg", "quantity": 0.0, "unit_weight": 1.0, "total_weight": 0.0, "notes": "Preenchimento manual"},
                {"item": "Fôrma Resinada", "spec": "Chapa compensada", "unit": "m²", "quantity": 0.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": "Preenchimento manual"}
            ]

        return {"summary": summary, "line_items": line_items}

    @classmethod
    def _find_number_in_row(cls, row: List[Any], unit_hints: List[str]) -> Optional[float]:
        for cell in row:
            if cell is None:
                continue
            s = str(cell).strip()
            # Clean thousands separator and decimal
            num_clean = re.sub(r'[^\d\.,]', '', s)
            if not num_clean:
                continue
            val = cls._parse_brazilian_number(num_clean)
            if val is not None and val > 0:
                return val
        return None

    @classmethod
    def _extract_regex_float(cls, pattern: str, text: str) -> Optional[float]:
        m = re.search(pattern, text)
        if m:
            raw = m.group(1).strip()
            return cls._parse_brazilian_number(raw)
        return None

    @classmethod
    def _parse_brazilian_number(cls, num_str: str) -> Optional[float]:
        try:
            num_str = num_str.strip()
            if '.' in num_str and ',' in num_str:
                num_str = num_str.replace('.', '').replace(',', '.')
            elif ',' in num_str:
                num_str = num_str.replace(',', '.')
            val = float(num_str)
            return round(val, 2)
        except Exception:
            return None

    @classmethod
    def _empty_template(cls, filename: str, error_note: str = "") -> Dict[str, Any]:
        return {
            "doc_type": "desenho",
            "category": "termoeletrica",
            "sub_category": "Fundação Geral",
            "project_name": "Novo Projeto",
            "equipment_name": "Equipamento / Bloco",
            "structure_type": "Bloco Maciço",
            "drawing_code": os.path.splitext(filename)[0],
            "revision": "0",
            "drawing_filename": filename,
            "soil_condition": "Solo Normal",
            "fck_concrete": 30.0,
            "steel_type": "CA-50",
            "concrete_volume_m3": 0.0,
            "steel_weight_kg": 0.0,
            "formwork_area_m2": 0.0,
            "excavation_m3": 0.0,
            "backfill_m3": 0.0,
            "lean_concrete_m3": 0.0,
            "anchor_bolts_kg": 0.0,
            "pile_count": 0,
            "pile_diameter_cm": 0.0,
            "pile_depth_m": 0.0,
            "steel_ratio_kg_m3": 0.0,
            "formwork_ratio_m2_m3": 0.0,
            "notes": error_note or "Preenchimento manual disponível caso a leitura automática falhe.",
            "line_items": [
                {"item": "Concreto Estrutural", "spec": "fck 30 MPa", "unit": "m³", "quantity": 0.0, "unit_weight": 2400.0, "total_weight": 0.0, "notes": ""},
                {"item": "Aço Armadura CA-50", "spec": "Cortado e dobrado", "unit": "kg", "quantity": 0.0, "unit_weight": 1.0, "total_weight": 0.0, "notes": ""},
                {"item": "Fôrma Resinada", "spec": "12mm", "unit": "m²", "quantity": 0.0, "unit_weight": 0.0, "total_weight": 0.0, "notes": ""}
            ],
            "raw_extracted_text": ""
        }
