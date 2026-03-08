import pandas as pd
import json
import os
import math

# Define absolute paths
base_dir = os.path.dirname(os.path.abspath(__file__)) # backend/
excel_path = os.path.join(base_dir, '..', 'aisc-shapes-database-v16.0.xlsx')
output_json = os.path.join(base_dir, 'aisc_shapes.json')

def rebuild_db():
    print(f"Reading from: {excel_path}")
    if not os.path.exists(excel_path):
        print(f"Error: Excel file not found: {excel_path}")
        return

    try:
        try:
            df = pd.read_excel(excel_path, sheet_name='Database v16.0')
        except:
            df = pd.read_excel(excel_path, sheet_name=0)
            
        df.fillna(0, inplace=True)
        df.columns = df.columns.str.strip()
        
        shapes = {}
        records = df.to_dict('records')
        
        for item in records:
            raw_key = item.get('AISC_Manual_Label')
            if not raw_key:
                raw_key = item.get('EDI_Std_Nomenclature')
                
            if raw_key:
                key = str(raw_key).upper()
                shape_type = item.get('Type')
                # Map specific structural attributes to ensure UI dropdowns and validation work
                def safe_float(val):
                    if val is None: return 0
                    if isinstance(val, str):
                        val = val.strip().replace('–', '').replace('-', '')
                        if not val: return 0
                        try: return float(val)
                        except: return 0
                    try: return float(val)
                    except: return 0

                # Flexural / Area
                mapped_item = {
                    'type': shape_type,
                    'Ag': safe_float(item.get('A', 0)),
                    'Ix': safe_float(item.get('Ix', 0)),
                    'Sx': safe_float(item.get('Sx', 0)),
                    'Zx': safe_float(item.get('Zx', 0)),
                    'rx': safe_float(item.get('rx', 0)),
                    'Iy': safe_float(item.get('Iy', 0)),
                    'Sy': safe_float(item.get('Sy', 0)),
                    'Zy': safe_float(item.get('Zy', 0)),
                    'ry': safe_float(item.get('ry', 0)),
                    'J': safe_float(item.get('J', 0)),
                    'Cw': safe_float(item.get('Cw', 0)),
                    'cw': safe_float(item.get('Cw', 0)),
                    'rts': safe_float(item.get('rts', 0)),
                    'ho': safe_float(item.get('ho', 0)),
                }

                # Geometry
                # Universal aliases for the frontend
                d = safe_float(item.get('d', 0))
                bf = safe_float(item.get('bf', 0))
                tw = safe_float(item.get('tw', 0))
                tf = safe_float(item.get('tf', 0))
                tdes = safe_float(item.get('tdes', 0))

                if shape_type in ['PIPE']:
                    # OD is usually mapped to d
                    # tdes is mapped to tw and tf
                    od = safe_float(item.get('OD', 0))
                    mapped_item['d'] = od
                    mapped_item['tw'] = tdes
                    mapped_item['tf'] = tdes
                    mapped_item['bf'] = tdes
                elif shape_type in ['HSS']:
                    # Ht and B
                    mapped_item['d'] = safe_float(item.get('Ht', d))
                    mapped_item['bf'] = safe_float(item.get('B', bf))
                    mapped_item['tw'] = tdes
                    mapped_item['tf'] = tdes
                else:
                    mapped_item['d'] = d
                    mapped_item['bf'] = bf
                    mapped_item['tw'] = tw
                    mapped_item['tf'] = tf

                # Include some raw variables as fallback
                mapped_item['tdes'] = tdes
                mapped_item['OD'] = safe_float(item.get('OD', 0))
                mapped_item['Ht'] = safe_float(item.get('Ht', 0))
                mapped_item['B'] = safe_float(item.get('B', 0))
                mapped_item['k_des'] = safe_float(item.get('kdes', 0))
                mapped_item['x_bar'] = safe_float(item.get('xp', 0))

                shapes[key] = mapped_item

        with open(output_json, 'w', encoding='utf-8') as f:
            json.dump(shapes, f, indent=2)
        
        print(f"Successfully rebuilt JSON database with {len(shapes)} shapes -> {output_json}")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    rebuild_db()
