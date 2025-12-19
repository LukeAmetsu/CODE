# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['backend\\main_eel.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('gui', 'gui'), 
        ('backend', 'backend'), 
        ('aisc-shapes-database-v16.0.xlsx', '.')
    ],
    hiddenimports=['eel', 'pandas', 'openpyxl'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='EngineeringHub',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Set to True if you want to see errors in a terminal window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)