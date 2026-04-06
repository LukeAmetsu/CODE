import pandas as pd
df = pd.read_excel('master_shear_database_v8_GRAPH.xlsx', sheet_name='ALL DATA')
with open('debug_cols.txt', 'w', encoding='utf-8') as f:
    for c in df.columns:
        f.write(str(c) + '\n')
