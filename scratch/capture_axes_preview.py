import subprocess, os

with open('gui/capacidade_estaca.html', 'r', encoding='utf-8') as f:
    text = f.read()

preview = text.replace('id="view-tab-summary" class="tab-content space-y-6"', 'id="view-tab-summary" class="tab-content hidden space-y-6"')
preview = preview.replace('id="view-tab-axes" class="tab-content hidden space-y-6"', 'id="view-tab-axes" class="tab-content space-y-6"')

with open('scratch/preview_axes_tab.html', 'w', encoding='utf-8') as f:
    f.write(preview)

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
url = 'file:///c:/OD/OneDrive - Andrade Gutierrez/CODE-2/scratch/preview_axes_tab.html'
shot_path = r'C:\Users\lucas.barros\.gemini\antigravity-ide\brain\b3cca588-d472-4b85-a9f9-cad46d7eac04\screenshot_axes_new.png'
cmd = [edge, '--headless', '--disable-gpu', f'--screenshot={shot_path}', '--window-size=1600,1100', url]
subprocess.run(cmd, timeout=15)
print('Screenshot axes exists:', os.path.exists(shot_path), 'size:', os.path.getsize(shot_path) if os.path.exists(shot_path) else 0)
