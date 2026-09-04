import sys
import os
sys.path.append(os.path.abspath('.'))
from backend.database import db
db.load_database('aisc-shapes-database-v16.0.xlsx')

from backend.calculators.shed_matrix import get_beam_and_pipe

print('Row=26, Col=4 (Transverse=26, Long=4):')
print(get_beam_and_pipe(26, 4, 175, 14))

print('\nRow=8, Col=26 (Transverse=8, Long=26):')
print(get_beam_and_pipe(8, 26, 175, 14))
