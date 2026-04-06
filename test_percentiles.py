import pandas as pd

df = pd.read_excel('master_shear_database_v8_GRAPH.xlsx', sheet_name='master_shear_database_v2')
data = df[['d (mm)', 'R_6118']].dropna()
data = data[data['d (mm)'].apply(lambda x: isinstance(x, (int, float)))]
data = data[data['R_6118'].apply(lambda x: isinstance(x, (int, float)))]

minX = data['d (mm)'].min()
maxX = data['d (mm)'].max()
numBins = 10
binWidth = (maxX - minX) / numBins
print(f'minX: {minX}, maxX: {maxX}, length: {len(data)}')

bins = [[] for _ in range(numBins)]
for index, row in data.iterrows():
    bIdx = int((row['d (mm)'] - minX) / binWidth)
    bIdx = min(numBins - 1, max(0, bIdx))
    bins[bIdx].append(row['R_6118'])

for i, bData in enumerate(bins):
    if len(bData) >= 3:
        bData.sort()
        idx05 = int(0.05 * len(bData))
        idx10 = int(0.10 * len(bData))
        print(f'Bin {i+1} len {len(bData)}: 5th: {bData[idx05]:.3f}, 10th: {bData[idx10]:.3f}')
