const pcalcData = {
    secao: {
        tipoSecao: 'Retangular',
        boundary: 'pinned', // 'pinned' (Biapoiado) ou 'cantilever' (Balanço)
        hx: 30,
        hy: 50,
        length: 400, // cm
        xm: 15,
        ym: 25,
        areaAc: 0,
        ix: 0, // Inércia X
        iy: 0  // Inércia Y
    },
    materiais: {
        fck: 25, // MPa
        fyk: 500, // MPa
        es: 210, // GPa
    },
    armacao: {
        barras: [
            { x: 4, y: 4, diametro: 16 },
            { x: 26, y: 4, diametro: 16 },
            { x: 4, y: 46, diametro: 16 },
            { x: 26, y: 46, diametro: 16 },
        ]
    },
    esforcos: {
        listaEsforcos: [
            { n: -800, mxTop: 50, mxBot: -50, myTop: 20, myBot: -20 }
        ]
    },
    config: {
        gamaC: 1.4,
        gamaS: 1.15,
        gamaF: 1.4,
        calc2ndOrder: true,
        method2ndOrder: 'curvature_approx', // Default to method 1
        gammaF3: 1.1,
        nFibers: 40,
        checkMinMoment: true,
        checkSlenderness: true,
        considerCreep: false,
        creepPhi: 2.0,
        minRate: 0.4,
        maxRate: 4.0
    },
    resultados: {
        secaoC: [],
        surfacePoints: { x: [], y: [], z: [] },
        minMomentSurface: { x: [], y: [], z: [] },
        loadCases: []
    }
};

// --- SISTEMA DE UNIDADES ---
const unitState = {
    current: localStorage.getItem('pcalc_unit') || 'kN' // 'kN' ou 'tf'
};
const TF_TO_KN = 9.80665; // 1 tf = 9.80665 kN

/** Converte valor da UI para kN (unidade interna) */
function toKN(v) {
    return unitState.current === 'tf' ? v * TF_TO_KN : v;
}
/** Converte kN para a unidade da UI */
function fromKN(v) {
    return unitState.current === 'tf' ? v / TF_TO_KN : v;
}
/** Converte kNm para a unidade de momento da UI (tf·m ou kN·m) */
function toKNm(v) {
    return unitState.current === 'tf' ? v * TF_TO_KN : v;
}
function fromKNm(v) {
    return unitState.current === 'tf' ? v / TF_TO_KN : v;
}

function setUnits(unit) {
    // Convert existing load values from old unit to new unit before switching
    const oldUnit = unitState.current;
    if (oldUnit === unit) return;

    // Convert loads displayed in table to new unit
    pcalcData.esforcos.listaEsforcos.forEach(l => {
        if (oldUnit === 'tf') {
            // was tf -> convert stored kN back to display, now store as kN (display kN)
            // stored values are always in kN internally - table shows converted
            // no-op: internal is always kN
        }
    });

    unitState.current = unit;
    localStorage.setItem('pcalc_unit', unit);
    _updateUnitButtons();
    renderLoads();
    updateRS2LiveSummaries();
    _updateUnitLabels();
}

function _updateUnitButtons() {
    const kn = document.getElementById('btn-unit-kn');
    const tf = document.getElementById('btn-unit-tf');
    if (!kn || !tf) return;
    const activeClass = 'px-2.5 py-1.5 rounded-md text-xs font-bold transition-all bg-slate-600 text-white shadow-xs flex items-center gap-1 cursor-pointer';
    const inactiveClass = 'px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all flex items-center gap-1 cursor-pointer';
    if (unitState.current === 'kN') {
        kn.className = activeClass;
        tf.className = inactiveClass;
    } else {
        tf.className = activeClass;
        kn.className = inactiveClass;
    }
}

function _updateUnitLabels() {
    const u = unitState.current;
    const um = u === 'tf' ? 'tf·m' : 'kNm';
    // Table headers
    document.querySelectorAll('th[data-unit-n]').forEach(el => el.textContent = `N (${u})`);
    document.querySelectorAll('th[data-unit-m]').forEach(el => el.textContent = `M (${um})`);
    // Sign reference
    const lbl = document.getElementById('unit-label-m');
    if (lbl) lbl.textContent = um;
}

/** Toggle hy-wrapper visibility and label updates based on section type */
function updateSectionTypeUI() {
    const type = pcalcData.secao.tipoSecao;
    const isCirc = type === 'Circular';
    const hyWrapper = document.getElementById('hy-wrapper');
    const lblHx = document.getElementById('lbl-hx');
    const patLabel = document.getElementById('gen-pattern-label');
    const hint = document.getElementById('rebar-coord-hint');

    if (hyWrapper) hyWrapper.style.display = isCirc ? 'none' : '';
    if (lblHx) lblHx.textContent = isCirc ? 'Diâmetro (D)' : 'Largura (hx)';
    if (patLabel) patLabel.textContent = isCirc ? 'Padrão Circular' : 'Padrão Cantos';
    if (hint) hint.textContent = isCirc
        ? 'Coordenadas relativas ao centro (origem = canto inf. esq. = 0, 0).'
        : 'Coordenadas relativas ao canto inferior esquerdo (0,0).';
}

// --- ESTADO DE VISUALIZAÇÃO DO CANVAS (SEÇÃO) ---
const canvasView = {
    scale: 1.0,
    baseScale: 1.0,
    selectedCaseIndex: 0
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {

    injectDynamicUI();

    // Init unit system
    _updateUnitButtons();
    _updateUnitLabels();

    // Renderizações Iniciais
    updateDataFromInputs();
    updateSectionTypeUI(); // Aplica estado inicial da UI de seção
    renderLoads();
    renderReinforcement();

    setupEventListeners();
    setupExcelImport();
    setupCanvasControls();

    window.addEventListener('theme-changed', () => {
        if (typeof renderCrossSection === 'function') renderCrossSection();
        if (pcalcData.resultados.surfacePoints.x.length > 0 && typeof render3DChart === 'function') {
            render3DChart();
        }
        if (pcalcData.resultados.loadCases.length > 0 && typeof renderElevation === 'function') {
            renderElevation(canvasView.selectedCaseIndex || 0);
        }
    });

    setTimeout(() => {
        const canvas = document.getElementById('sectionCanvas');
        if (canvas) {
            const container = canvas.parentElement;
            if (container) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
            }
        }
        if (typeof fitViewToSection === 'function') fitViewToSection();
        if (typeof renderCrossSection === 'function') renderCrossSection();
    }, 100);
});

const isDark = () => document.documentElement.classList.contains('dark');

// --- INJEÇÃO DE UI DINÂMICA ---
function injectDynamicUI() {
    const criteriaContainer = document.getElementById('criteria-container');
    if (criteriaContainer) {
        criteriaContainer.innerHTML = `
            <div class="space-y-4">
                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded border dark:border-gray-700">
                    <label class="block text-xs font-bold mb-3 text-gray-700 dark:text-gray-300">Método de Cálculo de 2ª Ordem:</label>
                    <div class="space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="curvature_approx" checked class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">1. Pilar-Padrão (Curvatura 1/r Aprox.)</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="stiffness_approx" class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">2. Pilar-Padrão (Rigidez Nominal NBR)</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="standard_diagram" class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">3. Pilar-Padrão Acoplado (Diag. N, M, 1/r)</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="general_diagram" class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">4. Método Geral (Iterativo Uniaxial)</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="general_biaxial" class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">5. Método Geral Biaxial (Iterativo 3D)</span>
                        </label>
                    </div>
                </div>

                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded border dark:border-gray-700 space-y-3">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="check-min-moment" checked class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Verificar Momento Mínimo (NBR 6118)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer" title="Desmarque para forçar o cálculo de 2a ordem mesmo em pilares curtos">
                        <input type="checkbox" id="check-slenderness" checked class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Verificar Esbeltez Limite (lambda1)</span>
                    </label>
                </div>
            </div>
        `;
    }
}

function setupEventListeners() {
    const inputs = [
        'length', 'boundary-type',
        'fck', 'fyk', 'es', 'gamac', 'gamas', 'gamaf', 'check-2nd-order',
        'check-min-moment', 'check-slenderness', 'rate-min', 'rate-max', 'gammaf3'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            updateDataFromInputs();
        });
    });

    ['hx', 'hy', 'section-type'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            updateDataFromInputs();
            updateSectionTypeUI();
            fitViewToSection();
            renderCrossSection();
        });
        // Also listen for 'change' (select)
        if (el && el.tagName === 'SELECT') el.addEventListener('change', () => {
            updateDataFromInputs();
            updateSectionTypeUI();
            fitViewToSection();
            renderCrossSection();
        });
    });

    document.getElementById('criteria-container')?.addEventListener('change', (e) => {
        if (e.target.name === 'method-2nd') {
            updateDataFromInputs();
        }
    });

    document.getElementById('add-bar-btn')?.addEventListener('click', () => {
        pcalcData.armacao.barras.push({ x: 5, y: 5, diametro: 16 });
        renderReinforcement();
        renderCrossSection();
    });

    document.getElementById('generate-rect-btn')?.addEventListener('click', generateRectPattern);

    const reinfTable = document.getElementById('reinforcement-table');
    if (reinfTable) {
        reinfTable.parentElement.addEventListener('input', handleReinforcementInput);
        reinfTable.parentElement.addEventListener('click', handleReinforcementAction);
    }

    const loadTable = document.getElementById('loads-table');
    document.getElementById('add-load-btn')?.addEventListener('click', () => {
        pcalcData.esforcos.listaEsforcos.push({ n: -500, mxTop: 20, mxBot: 20, myTop: 10, myBot: 10 });
        renderLoads();
    });

    if (loadTable) {
        loadTable.parentElement.addEventListener('input', handleLoadInput);
        loadTable.parentElement.addEventListener('click', handleLoadAction);
    }

    document.getElementById('calculate-btn')?.addEventListener('click', performCalculation);
}

function setupCanvasControls() {
    const canvas = document.getElementById('sectionCanvas');
    const container = document.getElementById('cross-section-container');

    if (!canvas || !container) return;

    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    function resizeAndCenter() {
        const rect = container.getBoundingClientRect();
        if (Math.floor(canvas.width) !== Math.floor(rect.width) || Math.floor(canvas.height) !== Math.floor(rect.height)) {
            canvas.width = rect.width;
            canvas.height = rect.height;
            fitViewToSection();
            renderCrossSection();
        }
    }

    const resizeObserver = new ResizeObserver(() => { resizeAndCenter(); });
    resizeObserver.observe(container);

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const direction = e.deltaY < 0 ? 1 : -1;
        const factor = 1 + (zoomIntensity * direction);
        canvasView.scale = Math.max(0.1, Math.min(canvasView.scale * factor, 50));
        renderCrossSection();
    }, { passive: false });

    canvas.style.cursor = 'default';
}

function fitViewToSection() {
    const canvas = document.getElementById('sectionCanvas');
    if (!canvas) return;

    const w = canvas.width;
    const h = canvas.height;
    const margin = 80;
    const { hx, hy } = pcalcData.secao;
    const safeHx = hx || 10;
    const safeHy = hy || 10;

    const fitScale = Math.min((w - margin) / safeHx, (h - margin) / safeHy);
    canvasView.baseScale = fitScale;
}

function setupExcelImport() {
    const fileInput = document.getElementById('upload-excel');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                processImportedData(json);
            };
            reader.readAsArrayBuffer(file);
            fileInput.value = '';
        });
    }

    const loadsTable = document.getElementById('loads-table');
    if (loadsTable) {
        loadsTable.addEventListener('paste', (e) => {
            e.preventDefault();
            const clipboardData = (e.clipboardData || window.clipboardData).getData('text');
            const rows = clipboardData.split(/\r\n|\n|\r/).filter(r => r.trim() !== '');
            if (rows.length === 0) return;

            let startIndex = pcalcData.esforcos.listaEsforcos.length;
            const activeInput = document.activeElement;
            if (activeInput && activeInput.tagName === 'INPUT' && loadsTable.contains(activeInput)) {
                startIndex = parseInt(activeInput.dataset.idx) || 0;
            }

            const newLoads = [];
            rows.forEach((rowStr) => {
                let values = rowStr.split('\t');
                if (values.length === 1) values = rowStr.split(/,|;/);

                if (values.length > 0) {
                    const load = {
                        n: toKN(parseFloat(values[0]) || 0),
                        mxTop: toKNm(parseFloat(values[1]) || 0),
                        mxBot: toKNm(parseFloat(values[2]) || 0),
                        myTop: toKNm(parseFloat(values[3]) || 0),
                        myBot: toKNm(parseFloat(values[4]) || 0)
                    };
                    if (values.length === 3) {
                        load.mxBot = load.mxTop;
                        load.myTop = toKNm(parseFloat(values[2]) || 0);
                        load.myBot = load.myTop;
                    }

                    newLoads.push(load);
                }
            });

            if (newLoads.length > 0) {
                for (let i = 0; i < newLoads.length; i++) {
                    if (startIndex + i < pcalcData.esforcos.listaEsforcos.length) {
                        pcalcData.esforcos.listaEsforcos[startIndex + i] = newLoads[i];
                    } else {
                        pcalcData.esforcos.listaEsforcos.push(newLoads[i]);
                    }
                }
                renderLoads();
            }
        });
    }
}

function processImportedData(jsonArray) {
    const validRows = jsonArray.filter(row => row.length > 0 && !isNaN(parseFloat(row[0])));
    if (validRows.length === 0) {
        alert("Nenhum dado numérico válido encontrado. A primeira coluna deve ser N.");
        return;
    }
    pcalcData.esforcos.listaEsforcos = [];
    validRows.forEach(row => {
        // Values in Excel are in the current unit -> convert to kN internally
        const n = toKN(parseFloat(row[0]) || 0);
        let mxTop = toKNm(parseFloat(row[1]) || 0);
        let mxBot = toKNm(parseFloat(row[2]) || 0);
        let myTop = toKNm(parseFloat(row[3]) || 0);
        let myBot = toKNm(parseFloat(row[4]) || 0);
        if (row.length === 3) {
            mxBot = mxTop;
            myTop = toKNm(parseFloat(row[2]) || 0);
            myBot = myTop;
        }
        pcalcData.esforcos.listaEsforcos.push({ n, mxTop, mxBot, myTop, myBot });
    });
    renderLoads();
}

function updateDataFromInputs() {
    const getVal = (id) => parseFloat(document.getElementById(id)?.value) || 0;
    const getChk = (id) => document.getElementById(id)?.checked || false;
    const getStr = (id) => document.getElementById(id)?.value || '';

    pcalcData.secao.tipoSecao = getStr('section-type');
    pcalcData.secao.boundary = getStr('boundary-type');
    pcalcData.secao.hx = getVal('hx');
    // Para circular, hy = hx (pilar simétrico)
    pcalcData.secao.hy = pcalcData.secao.tipoSecao === 'Circular' ? pcalcData.secao.hx : getVal('hy');
    pcalcData.secao.length = getVal('length');
    pcalcData.secao.xm = pcalcData.secao.hx / 2;
    pcalcData.secao.ym = pcalcData.secao.hy / 2;

    if (pcalcData.secao.tipoSecao === 'Circular') {
        const D = pcalcData.secao.hx;
        pcalcData.secao.areaAc = Math.PI * Math.pow(D / 2, 2);
        pcalcData.secao.ix = (Math.PI * Math.pow(D, 4)) / 64;
        pcalcData.secao.iy = pcalcData.secao.ix;
    } else {
        const b = pcalcData.secao.hx;
        const h = pcalcData.secao.hy;
        pcalcData.secao.areaAc = b * h;
        pcalcData.secao.ix = (b * Math.pow(h, 3)) / 12;
        pcalcData.secao.iy = (h * Math.pow(b, 3)) / 12;
    }

    pcalcData.materiais.fck = getVal('fck');
    pcalcData.materiais.fyk = getVal('fyk');
    pcalcData.materiais.es = getVal('es');

    pcalcData.config.gamaC = getVal('gamac') || 1.4;
    pcalcData.config.gamaS = getVal('gamas') || 1.15;
    pcalcData.config.gamaF = getVal('gamaf') || 1.4;
    pcalcData.config.calc2ndOrder = getChk('check-2nd-order');

    const methodEl = document.querySelector('input[name="method-2nd"]:checked');
    pcalcData.config.method2ndOrder = methodEl ? methodEl.value : 'curvature_approx';

    pcalcData.config.gammaF3 = getVal('gammaf3') || 1.1;
    pcalcData.config.checkMinMoment = getChk('check-min-moment');
    pcalcData.config.checkSlenderness = getChk('check-slenderness');
    pcalcData.config.considerCreep = getChk('check-creep');
    pcalcData.config.creepPhi = getVal('creep-phi');
    pcalcData.config.minRate = getVal('rate-min');
    pcalcData.config.maxRate = getVal('rate-max');
    updateRS2LiveSummaries();
}

function updateRS2LiveSummaries() {
    try {
        // 1. Geometria do Pilar
        const isCirc = pcalcData.secao.tipoSecao === 'Circular';
        const Ac = pcalcData.secao.areaAc || (pcalcData.secao.hx * pcalcData.secao.hy);
        const Ix = pcalcData.secao.ix || ((pcalcData.secao.hx * Math.pow(pcalcData.secao.hy, 3)) / 12);
        const Iy = pcalcData.secao.iy || ((pcalcData.secao.hy * Math.pow(pcalcData.secao.hx, 3)) / 12);
        const L = pcalcData.secao.length || 400;
        const boundary = pcalcData.secao.boundary || 'pinned';
        const kFactor = boundary === 'cantilever' ? 2.0 : 1.0;
        const Le = L * kFactor;
        const ix = Ac > 0 ? Math.sqrt(Ix / Ac) : 0;
        const iy = Ac > 0 ? Math.sqrt(Iy / Ac) : 0;
        const lambdaX = ix > 0 ? (Le / ix) : 0;
        const lambdaY = iy > 0 ? (Le / iy) : 0;

        const badgeGeo = document.getElementById('col-geo-badge');
        if (badgeGeo) {
            badgeGeo.textContent = isCirc ? `Circular D=${pcalcData.secao.hx} cm` : `${pcalcData.secao.hx} × ${pcalcData.secao.hy} cm`;
        }
        const elAc = document.getElementById('pcalc-col-ac-preview');
        if (elAc) elAc.textContent = `${Math.round(Ac)} cm²`;
        const elInertia = document.getElementById('pcalc-col-inertia-preview');
        if (elInertia) elInertia.textContent = `${Math.round(Ix).toLocaleString()} / ${Math.round(Iy).toLocaleString()} cm⁴`;
        const elLambda = document.getElementById('pcalc-col-lambda-preview');
        if (elLambda) {
            const maxLambda = Math.max(lambdaX, lambdaY);
            const colorClass = maxLambda <= 35 ? 'text-emerald-600 dark:text-emerald-400' : (maxLambda <= 90 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400');
            elLambda.className = `font-semibold ${colorClass}`;
            elLambda.textContent = `λx=${lambdaX.toFixed(1)} | λy=${lambdaY.toFixed(1)} (Le=${Math.round(Le)}cm)`;
        }

        // 2. Materiais do Pilar
        const fck = pcalcData.materiais.fck || 25;
        const fyk = pcalcData.materiais.fyk || 500;
        const gamaC = pcalcData.config.gamaC || 1.4;
        const gamaS = pcalcData.config.gamaS || 1.15;
        const fcd = fck / gamaC;
        const fyd = fyk / gamaS;
        const Eci = 5600 * Math.sqrt(fck);
        const alphaE = fck <= 50 ? (0.8 + 0.2 * fck / 80) : 1.0;
        const Ecs = (alphaE * Eci) / 1000;

        const badgeMat = document.getElementById('col-mat-badge');
        if (badgeMat) badgeMat.textContent = `C${fck} • CA-${Math.round(fyk/10)}`;
        const elFcd = document.getElementById('pcalc-col-fcd-preview');
        if (elFcd) elFcd.textContent = `${fcd.toFixed(2)} MPa (γc=${gamaC.toFixed(2)})`;
        const elFyd = document.getElementById('pcalc-col-fyd-preview');
        if (elFyd) elFyd.textContent = `${fyd.toFixed(2)} MPa (γs=${gamaS.toFixed(2)})`;
        const elEcs = document.getElementById('pcalc-col-ecs-preview');
        if (elEcs) elEcs.textContent = `${Ecs.toFixed(1)} GPa`;

        // 3. Armadura do Pilar
        let totalAs = 0;
        (pcalcData.armacao.barras || []).forEach(b => {
            const phi = b.diametro || 16;
            totalAs += (Math.PI * Math.pow(phi / 10, 2)) / 4;
        });
        const rho = Ac > 0 ? (totalAs / Ac) * 100 : 0;
        const asMin = 0.004 * Ac;

        const badgeRebar = document.getElementById('col-rebar-badge');
        if (badgeRebar) badgeRebar.textContent = `${(pcalcData.armacao.barras || []).length} barras • ${totalAs.toFixed(2)} cm²`;
        const elAs = document.getElementById('pcalc-col-as-preview');
        if (elAs) elAs.textContent = `${totalAs.toFixed(2)} cm²`;
        const elRho = document.getElementById('pcalc-col-rho-preview');
        if (elRho) {
            const rhoColor = rho < 0.4 ? 'text-amber-600 dark:text-amber-400' : (rho <= 4.0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');
            elRho.className = `font-semibold ${rhoColor}`;
            elRho.textContent = `${rho.toFixed(2)}% (Mín 0.40% • Máx 4.0%)`;
        }
        const elAsMin = document.getElementById('pcalc-col-asmin-preview');
        if (elAsMin) elAsMin.textContent = `${asMin.toFixed(2)} cm²`;

        // 4. Cargas do Pilar
        const lista = pcalcData.esforcos.listaEsforcos || [];
        let maxN = 0;
        lista.forEach(l => {
            if (Math.abs(l.n) > Math.abs(maxN)) maxN = l.n;
        });
        const gamaF = pcalcData.config.gamaF || 1.4;
        const NSdMax = maxN * gamaF;
        const hx = pcalcData.secao.hx || 30;
        const hy = pcalcData.secao.hy || 50;
        const hMin = Math.min(hx, hy);
        const ea = Math.max(hMin / 30, 2.0);
        const M1dMin = Math.abs(NSdMax) * (1.5 + 0.03 * hMin) / 100;

        const badgeLoads = document.getElementById('col-loads-badge');
        if (badgeLoads) badgeLoads.textContent = `${lista.length} Caso(s)`;
        const elNsd = document.getElementById('pcalc-col-nsd-preview');
        const u = unitState.current;
        const um = u === 'tf' ? 'tf·m' : 'kNm';
        if (elNsd) elNsd.textContent = `${fromKN(NSdMax).toFixed(2)} ${u} (γf=${gamaF.toFixed(2)})`;
        const elMmin = document.getElementById('pcalc-col-mmin-preview');
        if (elMmin) elMmin.textContent = `M1d,min = ${fromKNm(M1dMin).toFixed(2)} ${um}`;
        const elEa = document.getElementById('pcalc-col-ea-preview');
        if (elEa) elEa.textContent = `ea = ${ea.toFixed(1)} cm (h/30)`;

        // Sign convention badge - dinamically shows compression/tension
        const signBadge = document.getElementById('sign-convention-badge');
        if (signBadge) {
            if (maxN < 0) {
                signBadge.innerHTML = '🔴 N < 0 = Compressão';
                signBadge.className = 'shrink-0 px-1.5 py-0.5 rounded font-bold text-[10px] bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800';
            } else if (maxN > 0) {
                signBadge.innerHTML = '🔵 N > 0 = Tração';
                signBadge.className = 'shrink-0 px-1.5 py-0.5 rounded font-bold text-[10px] bg-blue-100 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800';
            } else {
                signBadge.innerHTML = '⚪ N = 0 (sem normal)';
                signBadge.className = 'shrink-0 px-1.5 py-0.5 rounded font-bold text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600';
            }
        }

        // 5. Critérios
        const badgeCrit = document.getElementById('col-crit-badge');
        if (badgeCrit) {
            const std = window.pcalcState?.standard || 'nbr';
            badgeCrit.textContent = std.toUpperCase();
        }
    } catch (err) {
        console.error("Error updating RS2 summaries:", err);
    }
}

function renderLoads() {
    const u = unitState.current;
    const tbody = document.getElementById('loads-table').getElementsByTagName('tbody')[0];
    // Update header units
    const thead = document.getElementById('loads-table').getElementsByTagName('thead')[0];
    if (thead) {
        const um = u === 'tf' ? 'tf·m' : 'kNm';
        const ths = thead.querySelectorAll('th');
        if (ths[0]) ths[0].textContent = `N (${u})`;
        if (ths[1]) ths[1].textContent = `Mx↑ (${um})`;
        if (ths[2]) ths[2].textContent = `Mx↓ (${um})`;
        if (ths[3]) ths[3].textContent = `My↑ (${um})`;
        if (ths[4]) ths[4].textContent = `My↓ (${um})`;
    }
    tbody.innerHTML = '';
    pcalcData.esforcos.listaEsforcos.forEach((l, i) => {
        const row = tbody.insertRow();
        row.className = "border-b border-gray-100 dark:border-gray-700";
        // Display values converted from kN internal to current unit
        const dispN = +fromKN(l.n).toFixed(4);
        const dispMxt = +fromKNm(l.mxTop).toFixed(4);
        const dispMxb = +fromKNm(l.mxBot).toFixed(4);
        const dispMyt = +fromKNm(l.myTop).toFixed(4);
        const dispMyb = +fromKNm(l.myBot).toFixed(4);
        row.innerHTML = `
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispN}" data-idx="${i}" data-key="n"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMxt}" data-idx="${i}" data-key="mxTop"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMxb}" data-idx="${i}" data-key="mxBot"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMyt}" data-idx="${i}" data-key="myTop"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMyb}" data-idx="${i}" data-key="myBot"></td>
            <td class="p-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold px-1" data-idx="${i}" data-action="remove">X</button></td>
        `;
    });
    updateRS2LiveSummaries();
}

function handleLoadInput(e) {
    if (e.target.tagName === 'INPUT') {
        const idx = parseInt(e.target.dataset.idx);
        const key = e.target.dataset.key;
        // Input is in current unit, convert to kN for internal storage
        const displayVal = parseFloat(e.target.value) || 0;
        const internalVal = (key === 'n') ? toKN(displayVal) : toKNm(displayVal);
        pcalcData.esforcos.listaEsforcos[idx][key] = internalVal;
        updateRS2LiveSummaries();
    }
}

function handleLoadAction(e) {
    if (e.target.dataset.action === 'remove') {
        pcalcData.esforcos.listaEsforcos.splice(e.target.dataset.idx, 1);
        renderLoads();
    }
}

function handleReinforcementInput(e) {
    if (e.target.tagName === 'INPUT') {
        const idx = e.target.dataset.idx;
        const key = e.target.dataset.key;
        pcalcData.armacao.barras[idx][key] = parseFloat(e.target.value);
        updateRS2LiveSummaries();
        renderCrossSection();
    }
}

function handleReinforcementAction(e) {
    if (e.target.dataset.action === 'remove') {
        pcalcData.armacao.barras.splice(e.target.dataset.idx, 1);
        renderReinforcement();
        renderCrossSection();
    }
}

function renderReinforcement() {
    const tbody = document.getElementById('reinforcement-table').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';
    pcalcData.armacao.barras.forEach((b, i) => {
        const row = tbody.insertRow();
        row.className = "border-b border-gray-100 dark:border-gray-700";
        row.innerHTML = `
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${b.x.toFixed(1)}" data-idx="${i}" data-key="x"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${b.y.toFixed(1)}" data-idx="${i}" data-key="y"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${b.diametro}" data-idx="${i}" data-key="diametro"></td>
            <td class="p-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold px-1" data-idx="${i}" data-action="remove">X</button></td>
        `;
    });
    updateRS2LiveSummaries();
}

function generateBarPattern() {
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;
    const cover = parseFloat(document.getElementById('quick-cover')?.value) || 3.0;
    const diam = parseFloat(document.getElementById('quick-diam')?.value) || 16;
    const isCirc = pcalcData.secao.tipoSecao === 'Circular';

    pcalcData.armacao.barras = [];

    if (isCirc) {
        // Circular pattern: N bars evenly spaced on a ring
        const n = parseInt(document.getElementById('quick-n-bars')?.value) || 6;
        const R = hx / 2;
        const rBar = R - cover - (diam / 10) / 2;
        for (let i = 0; i < n; i++) {
            const theta = (2 * Math.PI * i) / n - Math.PI / 2; // Start at top
            const x = R + rBar * Math.cos(theta);
            const y = R + rBar * Math.sin(theta);
            pcalcData.armacao.barras.push({ x: +x.toFixed(2), y: +y.toFixed(2), diametro: diam });
        }
    } else {
        // Rectangular pattern along edges
        const barsX = 3;
        const barsY = 3;
        for (let i = 0; i < barsX; i++) {
            const x = cover + (i * (hx - 2 * cover) / (barsX - 1));
            pcalcData.armacao.barras.push({ x: +x.toFixed(2), y: cover, diametro: diam });
            pcalcData.armacao.barras.push({ x: +x.toFixed(2), y: hy - cover, diametro: diam });
        }
        for (let i = 1; i < barsY - 1; i++) {
            const y = cover + (i * (hy - 2 * cover) / (barsY - 1));
            pcalcData.armacao.barras.push({ x: cover, y: +y.toFixed(2), diametro: diam });
            pcalcData.armacao.barras.push({ x: hx - cover, y: +y.toFixed(2), diametro: diam });
        }
    }

    renderReinforcement();
    renderCrossSection();
    updateRS2LiveSummaries();
}

// Alias for button (retangular pattern = just call generateBarPattern)
function generateRectPattern() { generateBarPattern(); }

/** Armadura Rápida: gera N barras com diâmetro e cobrimento definidos pelo painel rápido */
function applyQuickRebar() {
    const nBars = parseInt(document.getElementById('quick-n-bars')?.value) || 6;
    const diam = parseFloat(document.getElementById('quick-diam')?.value) || 16;
    const cover = parseFloat(document.getElementById('quick-cover')?.value) || 3.0;
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;
    const isCirc = pcalcData.secao.tipoSecao === 'Circular';

    pcalcData.armacao.barras = [];

    if (isCirc) {
        const R = hx / 2;
        const rBar = Math.max(1, R - cover - (diam / 10) / 2);
        for (let i = 0; i < nBars; i++) {
            const theta = (2 * Math.PI * i) / nBars - Math.PI / 2;
            const x = R + rBar * Math.cos(theta);
            const y = R + rBar * Math.sin(theta);
            pcalcData.armacao.barras.push({ x: +x.toFixed(2), y: +y.toFixed(2), diametro: diam });
        }
    } else {
        // Rectangular: distribute nBars evenly around perimeter
        const perimBars = Math.max(4, nBars);
        // Compute perimeter positions
        const sides = [
            { axis: 'x', from: cover, to: hx - cover, fixed: 'y', fixedVal: cover },           // Bottom
            { axis: 'y', from: cover + (hy - 2*cover)/(perimBars), to: hy - cover, fixed: 'x', fixedVal: hx - cover }, // Right
            { axis: 'x', from: hx - cover - (hx - 2*cover)/(perimBars), to: cover, fixed: 'y', fixedVal: hy - cover }, // Top
            { axis: 'y', from: hy - cover - (hy - 2*cover)/(perimBars), to: cover, fixed: 'x', fixedVal: cover }       // Left
        ];
        const perSide = Math.max(1, Math.floor(perimBars / 4));
        sides.forEach(s => {
            for (let i = 0; i < perSide; i++) {
                const t = i / Math.max(1, perSide - 1);
                const pos = s.from + t * (s.to - s.from);
                const bar = s.axis === 'x'
                    ? { x: +pos.toFixed(2), y: s.fixedVal, diametro: diam }
                    : { x: s.fixedVal, y: +pos.toFixed(2), diametro: diam };
                pcalcData.armacao.barras.push(bar);
            }
        });
    }

    renderReinforcement();
    renderCrossSection();
    updateRS2LiveSummaries();
}

function discretizeSection() {
    pcalcData.resultados.secaoC = [];
    const { hx, hy, tipoSecao } = pcalcData.secao;
    const nX = 40;
    const nY = 40;

    const dx = hx / nX;
    const dy = hy / nY;
    const dA = dx * dy;

    if (tipoSecao === 'Retangular') {
        for (let i = 0; i < nX; i++) {
            for (let j = 0; j < nY; j++) {
                const x = (i * dx) + (dx / 2) - (hx / 2);
                const y = (j * dy) + (dy / 2) - (hy / 2);
                pcalcData.resultados.secaoC.push({ x, y, dA });
            }
        }
    } else if (tipoSecao === 'Circular') {
        const R = hx / 2;
        for (let i = 0; i < nX; i++) {
            for (let j = 0; j < nY; j++) {
                const x = (i * dx) + (dx / 2) - (hx / 2);
                const y = (j * dy) + (dy / 2) - (hy / 2);
                if (x * x + y * y <= R * R) {
                    pcalcData.resultados.secaoC.push({ x, y, dA });
                }
            }
        }
    }
}

function getConcreteStress(epsilon, fcd) {
    // Parábola-Retângulo (NBR 6118:2023 item 8.2.10.1)
    if (epsilon >= 0) return 0; // Tração ignorada no concreto

    const ec = Math.abs(epsilon);
    const fck = pcalcData.materiais.fck || 25;
    let ec2 = 0.0020;
    let ecu = 0.0035;
    let n = 2.0;
    let alpha_c = 0.85;

    if (fck > 50) {
        ec2 = 0.0020 + 0.000085 * Math.pow(fck - 50, 0.53);
        const term = (90 - fck) / 100;
        ecu = 0.0026 + 0.035 * Math.pow(term, 4);
        n = 1.4 + 23.4 * Math.pow(term, 4);
        alpha_c = 0.85 * (1.0 - (fck - 50) / 200);
        if (alpha_c < 0.5) alpha_c = 0.5;
    }

    if (ec <= ec2) {
        return -alpha_c * fcd * (1 - Math.pow(1 - ec / ec2, n));
    } else if (ec <= ecu) {
        return -alpha_c * fcd;
    }
    return 0;
}

function getSteelStress(epsilon, fyd, Es) {
    const sigma = epsilon * Es;
    if (sigma > fyd) return fyd;
    if (sigma < -fyd) return -fyd;
    return sigma;
}

function calculateSectionResistance(epsilon0, curvatureX, curvatureY) {
    const fcd = (pcalcData.materiais.fck / 10) / pcalcData.config.gamaC;
    const fyd = (pcalcData.materiais.fyk / 10) / pcalcData.config.gamaS;
    const Es = pcalcData.materiais.es * 100; // GPa to kN/cm2

    let N_int = 0;
    let Mx_int = 0;
    let My_int = 0;

    for (const fiber of pcalcData.resultados.secaoC) {
        const strain = epsilon0 + curvatureX * fiber.y + curvatureY * fiber.x;
        const sigma = getConcreteStress(strain, fcd);
        if (sigma !== 0) {
            const dF = sigma * fiber.dA;
            N_int += dF;
            Mx_int += dF * (fiber.y / 100);
            My_int += dF * (fiber.x / 100);
        }
    }

    for (const bar of pcalcData.armacao.barras) {
        const bx = bar.x - pcalcData.secao.xm;
        const by = bar.y - pcalcData.secao.ym;
        const strain = epsilon0 + curvatureX * by + curvatureY * bx;

        const sigma = getSteelStress(strain, fyd, Es);
        const sigma_c_at_bar = getConcreteStress(strain, fcd);
        // Subtrai concreto deslocado pelo aço para evitar dupla contagem da área (NBR 6118)
        const effective_sigma = sigma - sigma_c_at_bar;
        const area = Math.PI * Math.pow(bar.diametro / 10 / 2, 2);
        const F = effective_sigma * area;

        N_int += F;
        Mx_int += F * (by / 100);
        My_int += F * (bx / 100);
    }

    return { N: N_int, Mx: Mx_int, My: My_int };
}

function generateInteractionSurface() {
    const points = { x: [], y: [], z: [] };
    const fck = pcalcData.materiais.fck || 25;
    const ecu = (fck > 50) ? -(0.0026 + 0.035 * Math.pow((90 - fck) / 100, 4)) : -0.0035;
    const ec2 = (fck > 50) ? -(0.0020 + 0.000085 * Math.pow(fck - 50, 0.53)) : -0.0020;
    const es_yield_tension = 0.010;
    const numAngles = 72;
    let statesPerAngle = 0;

    for (let i = 0; i < numAngles; i++) {
        const theta = (i / numAngles) * 2 * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        let u_min = Infinity;
        let u_max = -Infinity;

        if (pcalcData.secao.tipoSecao === 'Circular') {
            // For a circle, the projection along any direction is exactly ±R
            const R = pcalcData.secao.hx / 2;
            u_min = -R;
            u_max = R;
        } else {
            const corners = [
                { x: -pcalcData.secao.hx / 2, y: -pcalcData.secao.hy / 2 },
                { x: pcalcData.secao.hx / 2, y: -pcalcData.secao.hy / 2 },
                { x: pcalcData.secao.hx / 2, y: pcalcData.secao.hy / 2 },
                { x: -pcalcData.secao.hx / 2, y: pcalcData.secao.hy / 2 }
            ];

            corners.forEach(p => {
                const u = p.x * cosT + p.y * sinT;
                if (u < u_min) u_min = u;
                if (u > u_max) u_max = u;
            });
        }

        pcalcData.armacao.barras.forEach(b => {
            const bx = b.x - pcalcData.secao.xm;
            const by = b.y - pcalcData.secao.ym;
            const u = bx * cosT + by * sinT;
            if (u < u_min) u_min = u;
            if (u > u_max) u_max = u;
        });

        const deformationStates = [];
        const stepsD2 = 15;
        deformationStates.push({ k: 0, e0: es_yield_tension });

        for (let k = 1; k <= stepsD2; k++) {
            const eps_t = es_yield_tension;
            const eps_c = es_yield_tension + (k / stepsD2) * (ecu - es_yield_tension);
            const K = (eps_c - eps_t) / (u_max - u_min);
            const e0 = eps_t - K * u_min;
            deformationStates.push({ k: K, e0: e0 });
        }

        const stepsD34 = 20;
        for (let k = 1; k <= stepsD34; k++) {
            const eps_c = ecu;
            const eps_t = es_yield_tension + (k / stepsD34) * (ecu - es_yield_tension);
            const K = (eps_c - eps_t) / (u_max - u_min);
            const e0 = eps_t - K * u_min;
            deformationStates.push({ k: K, e0: e0 });
        }

        // Domínio 5 com Pivô C (distância 3/7 h da borda mais comprimida, NBR 6118 item 17.2.2)
        const u_pivot = u_max - (3.0 / 7.0) * (u_max - u_min);
        const stepsD5 = 6;
        for (let k = 1; k <= stepsD5; k++) {
            const eps_opp = 0.0 + (k / stepsD5) * (ec2 - 0.0);
            const K = (ec2 - eps_opp) / (u_pivot - u_min);
            const e0 = ec2 - K * u_pivot;
            deformationStates.push({ k: K, e0: e0 });
        }

        // Compressão uniforme limitada a ec2 (NBR 6118 não permite ecu em compressão uniforme)
        deformationStates.push({ k: 0, e0: ec2 });
        statesPerAngle = deformationStates.length;

        for (const state of deformationStates) {
            const Kx = state.k * sinT;
            const Ky = state.k * cosT;
            const res = calculateSectionResistance(state.e0, Kx, Ky);
            points.x.push(res.Mx);
            points.y.push(res.My);
            points.z.push(res.N);
        }
    }

    pcalcData.resultados.statesPerAngle = statesPerAngle;
    return points;
}

function generateMinMomentSurface() {
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;

    const e_min_x = (1.5 + 0.03 * hy) / 100;
    const e_min_y = (1.5 + 0.03 * hx) / 100;

    let maxN = 0;
    if (pcalcData.resultados.surfacePoints.z.length > 0) {
        maxN = Math.min(...pcalcData.resultados.surfacePoints.z);
    }
    if (maxN === 0) maxN = -10000;

    const points = { x: [], y: [], z: [] };
    const stepsN = 20;
    const stepsTheta = 36;

    for (let i = 0; i <= stepsN; i++) {
        const N = maxN * (i / stepsN);
        const absN = Math.abs(N);

        const Mx_lim = absN * e_min_x;
        const My_lim = absN * e_min_y;

        for (let j = 0; j <= stepsTheta; j++) {
            const theta = (j / stepsTheta) * 2 * Math.PI;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            let r = 0;
            if (Mx_lim > 0 && My_lim > 0) {
                const r_x = Math.abs(cosT) > 1e-6 ? Mx_lim / Math.abs(cosT) : Infinity;
                const r_y = Math.abs(sinT) > 1e-6 ? My_lim / Math.abs(sinT) : Infinity;
                r = Math.min(r_x, r_y);
            }

            points.x.push(r * cosT);
            points.y.push(r * sinT);
            points.z.push(N);
        }
    }
    return points;
}

function performCalculation() {
    const btn = document.getElementById('calculate-btn');
    const msg = document.getElementById('feedback-message');

    console.log("--- Iniciando Cálculo ---");

    btn.disabled = true;
    msg.textContent = 'Calculando...';
    msg.className = 'text-center text-blue-600 text-xs mt-2 font-medium';

    setTimeout(() => {
        try {
            discretizeSection();
            console.log("Seção discretizada com sucesso.");

            const surface = generateInteractionSurface();
            console.log("Superfície de interação gerada.");
            pcalcData.resultados.surfacePoints = surface;

            const minSurf = generateMinMomentSurface();
            pcalcData.resultados.minMomentSurface = minSurf;

            const results = [];
            pcalcData.esforcos.listaEsforcos.forEach((load, i) => {
                console.log(`Calculando caso de carga ${i + 1}...`);
                results.push(calculateLoadCase(load, i));
            });
            pcalcData.resultados.loadCases = results.sort((a, b) => a.safetyFactor - b.safetyFactor);

            render3DChart();
            renderResultsTable();
            canvasView.selectedCaseIndex = 0;
            renderElevation(0);

            msg.textContent = 'Cálculo Concluído.';
            msg.className = 'text-center text-green-600 text-xs mt-2 font-medium';
        } catch (err) {
            console.error(err);
            msg.textContent = 'Erro: ' + err.message;
            msg.className = 'text-center text-red-600 text-xs mt-2 font-medium';
        } finally {
            btn.disabled = false;
        }
    }, 100);
}

function calculateSafetyFactor(N, Mx, My) {
    const surface = pcalcData.resultados.surfacePoints;
    if (!surface || surface.x.length === 0) return 0;

    const R_load = Math.sqrt(Mx * Mx + My * My);
    let angleLoad = Math.atan2(My, Mx);
    if (angleLoad < 0) angleLoad += 2 * Math.PI;

    // Se carga puramente axial (momento desprezível)
    if (R_load < 0.01) {
        let minN = 0, maxN = 0;
        for (let z of surface.z) {
            if (z < minN) minN = z;
            if (z > maxN) maxN = z;
        }
        if (Math.abs(N) < 1e-4) return 99.99;
        return (N < 0) ? (Math.abs(minN) / Math.abs(N)) : (maxN / N);
    }

    // Interpolação analítica na altura exata N = Nsd através dos meridianos gerados
    const ptsPerAngle = pcalcData.resultados.statesPerAngle || 43;
    const numAngles = Math.round(surface.x.length / ptsPerAngle);
    const slicePoints = [];

    if (numAngles >= 8) {
        for (let a = 0; a < numAngles; a++) {
            const startIdx = a * ptsPerAngle;
            const endIdx = startIdx + ptsPerAngle;

            for (let j = startIdx; j < endIdx - 1; j++) {
                const z1 = surface.z[j];
                const z2 = surface.z[j + 1];

                if ((z1 >= N && z2 <= N) || (z1 <= N && z2 >= N)) {
                    const denom = (z2 - z1);
                    const t = Math.abs(denom) > 1e-9 ? (N - z1) / denom : 0;
                    const pMx = surface.x[j] + t * (surface.x[j + 1] - surface.x[j]);
                    const pMy = surface.y[j] + t * (surface.y[j + 1] - surface.y[j]);
                    const R = Math.sqrt(pMx * pMx + pMy * pMy);
                    let Ang = Math.atan2(pMy, pMx);
                    if (Ang < 0) Ang += 2 * Math.PI;
                    slicePoints.push({ r: R, ang: Ang });
                    break;
                }
            }
        }
    }

    // Fallback para fatia tolerante se poucos pontos interpolados
    if (slicePoints.length < 4) {
        const toleranceN = Math.max(20, Math.abs(N) * 0.10);
        for (let i = 0; i < surface.x.length; i++) {
            const pN = surface.z[i];
            if (Math.abs(pN - N) < toleranceN) {
                const pMx = surface.x[i];
                const pMy = surface.y[i];
                const R = Math.sqrt(pMx * pMx + pMy * pMy);
                let Ang = Math.atan2(pMy, pMx);
                if (Ang < 0) Ang += 2 * Math.PI;
                slicePoints.push({ r: R, ang: Ang });
            }
        }
    }

    if (slicePoints.length < 2) return 0;

    slicePoints.sort((a, b) => a.ang - b.ang);
    slicePoints.push({ r: slicePoints[0].r, ang: slicePoints[0].ang + 2 * Math.PI });

    let R_res = 0;
    for (let i = 0; i < slicePoints.length - 1; i++) {
        const p1 = slicePoints[i];
        const p2 = slicePoints[i + 1];
        if (angleLoad >= p1.ang && angleLoad <= p2.ang) {
            const ratio = (angleLoad - p1.ang) / (p2.ang - p1.ang);
            R_res = p1.r + ratio * (p2.r - p1.r);
            break;
        }
    }
    if (R_res === 0) {
        let minDiff = Infinity;
        for (let p of slicePoints) {
            let diff = Math.abs(p.ang - angleLoad);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff < minDiff) {
                minDiff = diff;
                R_res = p.r;
            }
        }
    }
    if (R_res === 0) return 0;
    return R_res / R_load;
}

// --- FUNÇÃO PRINCIPAL DE CÁLCULO DE CASO DE CARGA ---
function calculateLoadCase(load, index) {
    console.group(`Detalhes do Caso ${index + 1}`);
    const gf = pcalcData.config.gamaF;
    let Nsd = load.n * gf;

    const M1d_x_top = load.mxTop * gf;
    const M1d_x_bot = load.mxBot * gf;
    const M1d_y_top = load.myTop * gf;
    const M1d_y_bot = load.myBot * gf;

    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;
    const method = pcalcData.config.method2ndOrder;
    const checkSlenderness = pcalcData.config.checkSlenderness;

    // Momento Mínimo e Imperfeições por Norma
    const std = window.pcalcState?.standard || 'nbr';
    let e_min_x = 1.5 + 0.03 * hy;
    let e_min_y = 1.5 + 0.03 * hx;

    if (std === 'aci') {
        // ACI 318-22 §6.6.4.5.4: M2,min = Pu * (15 + 0.03h) mm
        e_min_x = 1.5 + 0.03 * hy;
        e_min_y = 1.5 + 0.03 * hx;
    } else if (std === 'ec2') {
        // Eurocode 2 §5.2: e0 = max(h/30, 20mm)
        e_min_x = Math.max(hy / 30.0, 2.0);
        e_min_y = Math.max(hx / 30.0, 2.0);
    }

    const M1d_min_x = Math.abs(Nsd) * (e_min_x / 100);
    const M1d_min_y = Math.abs(Nsd) * (e_min_y / 100);

    // --- VERIFICAÇÃO DE ESBELTEZ (LAMBDA 1) ---
    const getAlphaB = (M1, M2) => {
        const Ma = Math.abs(M1) > Math.abs(M2) ? Math.abs(M1) : Math.abs(M2);
        const Mb = Math.abs(M1) > Math.abs(M2) ? Math.abs(M2) : Math.abs(M1);
        if (Ma === 0) return 1.0;
        const ratio = (M1 * M2 >= 0) ? (Mb / Ma) : -(Mb / Ma);
        let ab = 0.6 + 0.4 * ratio;
        return Math.max(0.4, ab);
    };

    const length = pcalcData.secao.length; // cm
    const boundary = pcalcData.secao.boundary;
    const le = (boundary === 'pinned') ? length : 2 * length;

    // lambda = le / i (i approx h/3.46 para retângulo, D/4 para círculo -> fator 4.0)
    const isCirc = pcalcData.secao.tipoSecao === 'Circular';
    const factor_i = isCirc ? 4.0 : 3.4641;
    const lambdaX = (hy > 0) ? (factor_i * le) / hy : 0; // Giro em torno de X, altura é hy
    const lambdaY = (hx > 0) ? (factor_i * le) / hx : 0; // Giro em torno de Y, altura é hx

    const alphaBx = getAlphaB(M1d_x_top, M1d_x_bot);
    const alphaBy = getAlphaB(M1d_y_top, M1d_y_bot);

    // Excentricidade de 1a ordem no centro (aprox para lambda1)
    const e1x = Math.abs(Nsd) > 0 ? Math.max(Math.abs(M1d_x_top), Math.abs(M1d_x_bot)) / Math.abs(Nsd) * 100 : 0;
    const e1y = Math.abs(Nsd) > 0 ? Math.max(Math.abs(M1d_y_top), Math.abs(M1d_y_bot)) / Math.abs(Nsd) * 100 : 0;

    let lambda1_x = Math.min(90, Math.max(35, (25 + 12.5 * (e1x / hy)) / alphaBx));
    let lambda1_y = Math.min(90, Math.max(35, (25 + 12.5 * (e1y / hx)) / alphaBy));

    if (std === 'aci') {
        // ACI 318-22 §6.2.5.1: k*Lu/r limit = 22 for nonsway columns
        lambda1_x = 22.0;
        lambda1_y = 22.0;
    } else if (std === 'ec2') {
        // EC2 §5.8.3.1: lambda_lim = 20 * A * B * C / sqrt(n)
        const n_rel = Math.max(0.05, Math.abs(Nsd) / (pcalcData.secao.areaAc * (pcalcData.materiais.fck / 10 / 1.5)));
        const lambda_lim = Math.min(90, Math.max(25, (20.0 * 0.7 * 1.1 * 1.0) / Math.sqrt(n_rel)));
        lambda1_x = lambda_lim;
        lambda1_y = lambda_lim;
    }

    const needs2ndOrderX = checkSlenderness ? (lambdaX > lambda1_x) : true;
    const needs2ndOrderY = checkSlenderness ? (lambdaY > lambda1_y) : true;

    console.log(`LambdaX=${lambdaX.toFixed(1)}, Lambda1X=${lambda1_x.toFixed(1)}, 2aOrdemX=${needs2ndOrderX}`);
    console.log(`LambdaY=${lambdaY.toFixed(1)}, Lambda1Y=${lambda1_y.toFixed(1)}, 2aOrdemY=${needs2ndOrderY}`);

    // Variaveis de Saida
    let Mtot_x = 0;
    let Mtot_y = 0;
    let M2d_x = 0;
    let M2d_y = 0;
    let info = "";

    // SELEÇÃO DO MÉTODO DE 2a ORDEM
    if (pcalcData.config.calc2ndOrder && Nsd < 0) {

        let needsCalc = needs2ndOrderX || needs2ndOrderY;
        // Se ambos forem dispensados, não calcula 2a ordem, apenas usa momento mínimo
        if (!needsCalc && checkSlenderness) {
            console.log("Dispensa de 2a ordem por esbeltez.");
            Mtot_x = Math.max(Math.abs(M1d_x_top), Math.abs(M1d_x_bot), M1d_min_x);
            Mtot_y = Math.max(Math.abs(M1d_y_top), Math.abs(M1d_y_bot), M1d_min_y);
            info = "λ < λ1";
        } else {
            switch (method) {
                case 'curvature_approx': // Metodo 1
                    const res1 = calculateMethod1_CurvatureApprox(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, needs2ndOrderX, needs2ndOrderY);
                    Mtot_x = res1.Mtot_x; Mtot_y = res1.Mtot_y; M2d_x = res1.M2d_x; M2d_y = res1.M2d_y; info = res1.info;
                    break;

                case 'stiffness_approx': // Metodo 2
                    const res2 = calculateMethod2_StiffnessApprox(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, needs2ndOrderX, needs2ndOrderY);
                    Mtot_x = res2.Mtot_x; Mtot_y = res2.Mtot_y; M2d_x = res2.M2d_x; M2d_y = res2.M2d_y; info = res2.info;
                    break;

                case 'standard_diagram': // Metodo 3
                    const res3 = calculateMethod3_StandardDiagram(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, lambdaX, lambdaY, needs2ndOrderX, needs2ndOrderY);
                    Mtot_x = res3.Mtot_x; Mtot_y = res3.Mtot_y; M2d_x = res3.M2d_x; M2d_y = res3.M2d_y; info = res3.info;
                    break;

                case 'general_diagram': // Metodo 4
                case 'general_biaxial': // Metodo 5
                    const isBiaxial = (method === 'general_biaxial');
                    const resG = calculateMethodGeneral(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, isBiaxial, needs2ndOrderX, needs2ndOrderY);
                    Mtot_x = resG.Mtot_x; Mtot_y = resG.Mtot_y; M2d_x = resG.M2d_x; M2d_y = resG.M2d_y; info = resG.info;
                    break;
            }
        }
    } else {
        // Sem 2a Ordem
        Mtot_x = Math.max(Math.abs(M1d_x_top), Math.abs(M1d_x_bot), M1d_min_x);
        Mtot_y = Math.max(Math.abs(M1d_y_top), Math.abs(M1d_y_bot), M1d_min_y);
        info = "1a Ordem";
    }

    let safetyFactor = calculateSafetyFactor(Nsd, Mtot_x, Mtot_y);
    if (std === 'aci') {
        safetyFactor = safetyFactor * 0.65;
    }

    console.groupEnd();

    return {
        id: index,
        originalIndex: index + 1,
        Nsd: Nsd,
        Mx1Top: M1d_x_top,
        Mx1Bot: M1d_x_bot,
        My1Top: M1d_y_top,
        My1Bot: M1d_y_bot,
        MxTot: Mtot_x,
        MyTot: Mtot_y,
        M2dx: M2d_x,
        M2dy: M2d_y,
        safetyFactor: safetyFactor,
        info: info
    };
}

// --- MÉTODO 1: CURVATURA APROXIMADA ---
function calculateMethod1_CurvatureApprox(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, calcX, calcY) {
    const hx = pcalcData.secao.hx / 100;
    const hy = pcalcData.secao.hy / 100;
    const nu_x = Math.abs(Nsd) / (pcalcData.secao.areaAc * (pcalcData.materiais.fck / 10 / 1.4));

    // Curvaturas 1/r
    const invRx = calcX ? Math.min((0.005 / hy) / (nu_x + 0.5), 0.005 / hy) : 0;
    const invRy = calcY ? Math.min((0.005 / hx) / (nu_x + 0.5), 0.005 / hx) : 0;

    const Le_x = (pcalcData.secao.boundary === 'pinned') ? pcalcData.secao.length / 100 : 2 * pcalcData.secao.length / 100;
    const M2d_x = Math.abs(Nsd) * (Math.pow(Le_x, 2) / 10) * invRx;
    const M2d_y = Math.abs(Nsd) * (Math.pow(Le_x, 2) / 10) * invRy;

    const getAlphaB = (M1, M2) => {
        const Ma = Math.abs(M1) > Math.abs(M2) ? Math.abs(M1) : Math.abs(M2);
        const Mb = Math.abs(M1) > Math.abs(M2) ? Math.abs(M2) : Math.abs(M1);
        if (Ma === 0) return 1.0;
        const ratio = (M1 * M2 >= 0) ? (Mb / Ma) : -(Mb / Ma);
        return Math.max(0.4, 0.6 + 0.4 * ratio);
    };

    // CORREÇÃO: Remover o limite artificial de 0.6*M_max no cálculo do M1d_eq
    // O alpha_b correto já está entre 0.4 e 1.0. O momento mínimo (MinX) atua como envelope final.
    const M_max_x = Math.max(Math.abs(M1xt), Math.abs(M1xb));
    const M1d_eq_x_calc = getAlphaB(M1xt, M1xb) * M_max_x;

    const M_max_y = Math.max(Math.abs(M1yt), Math.abs(M1yb));
    const M1d_eq_y_calc = getAlphaB(M1yt, M1yb) * M_max_y;

    // O momento total é o maior entre (Equivalente + 2a Ordem) e (Mínimo + 2a Ordem)
    // Como M2d é constante para o Método 1 (depende apenas de N), basta aplicar o Max no momento de 1a ordem.
    const Mtot_x = Math.max(M1d_eq_x_calc, MinX) + M2d_x;
    const Mtot_y = Math.max(M1d_eq_y_calc, MinY) + M2d_y;

    return {
        Mtot_x: Mtot_x,
        Mtot_y: Mtot_y,
        M2d_x, M2d_y,
        info: `M1(1/r): rx=${invRx.toFixed(3)}, ry=${invRy.toFixed(3)}`
    };
}

// --- MÉTODO 2: RIGIDEZ NOMINAL (CORRIGIDO EQ. QUADRÁTICA) ---
function calculateMethod2_StiffnessApprox(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, calcX, calcY) {
    const hx = pcalcData.secao.hx / 100;
    const hy = pcalcData.secao.hy / 100;
    const Le = (pcalcData.secao.boundary === 'pinned') ? pcalcData.secao.length / 100 : 2 * pcalcData.secao.length / 100;

    const solveQuadratic = (h, M1t, M1b, Min, active) => {
        const M1Max = Math.max(Math.abs(M1t), Math.abs(M1b), Min);
        if (!active) return { Mtot: M1Max, M2d: 0 };

        const nsd_abs = Math.abs(Nsd);

        // Coeficientes da Equação (CalculaEsforcos.java - calculaMomento2OrdP2)
        const a = 5.0 * h;
        const termNLe2 = (nsd_abs * Le * Le) / 320.0;
        const b = (-h * h * nsd_abs) + termNLe2 - (5.0 * h * M1Max);
        const c = nsd_abs * h * h * M1Max;

        const delta = b * b - 4 * a * c;
        let Mtot = M1Max;

        if (delta >= 0) {
            Mtot = (-b + Math.sqrt(delta)) / (2 * a);
        } else {
            // Fallback normativo NBR 6118 se discriminante negativo: usa Método 1 (Curvatura Aproximada)
            const m1_fallback = calculateMethod1_CurvatureApprox(Nsd, M1t, M1b, 0, 0, Min, 0, true, false);
            Mtot = m1_fallback.Mtot_x;
        }

        // Garante que não é menor que 1a ordem
        Mtot = Math.max(Mtot, M1Max);

        return { Mtot, M2d: Math.max(0, Mtot - M1Max) };
    };

    const resX = solveQuadratic(hy, M1xt, M1xb, MinX, calcX);
    const resY = solveQuadratic(hx, M1yt, M1yb, MinY, calcY);

    return {
        Mtot_x: resX.Mtot, Mtot_y: resY.Mtot,
        M2d_x: resX.M2d, M2d_y: resY.M2d,
        info: `M2(Rigidez NBR)`
    };
}

// --- MÉTODO 3: PILAR PADRÃO ACOPLADO (RIGIDEZ KAPPA) ---
function calculateMethod3_StandardDiagram(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, lamX, lamY, calcX, calcY) {
    const fcd = (pcalcData.materiais.fck / 10) / 1.4;
    const Ac = pcalcData.secao.areaAc;
    const nu = Math.abs(Nsd) / (Ac * fcd);

    const getAlphaB = (M1, M2) => {
        const Ma = Math.max(Math.abs(M1), Math.abs(M2));
        const Mb = Math.min(Math.abs(M1), Math.abs(M2));
        if (Ma === 0) return 1.0;
        const ratio = (M1 * M2 >= 0) ? (Mb / Ma) : -(Mb / Ma);
        return Math.max(0.4, 0.6 + 0.4 * ratio);
    };

    const solveKappa = (M1t, M1b, Min, lambda, axis) => {
        const Ma = Math.max(Math.abs(M1t), Math.abs(M1b));
        const alphaB = getAlphaB(M1t, M1b);
        const M1d_equiv = Math.max(alphaB * Ma, Min);
        if (lambda < 35) return { Mtot: M1d_equiv, M2d: 0 };

        // Estimar Rigidez Secante (Kappa) NBR 6118 item 15.8.3.3.4
        let Mtarget = M1d_equiv;
        let kappa = 100;

        for (let i = 0; i < 4; i++) {
            const mx_try = (axis === 'x') ? Mtarget : 0;
            const my_try = (axis === 'y') ? Mtarget : 0;

            // Buscar EI secante da seção
            const stiff = getSecantStiffness(Nsd, mx_try, my_try);
            const EI = (axis === 'x') ? stiff.EIx : stiff.EIy;

            const h = (axis === 'x') ? pcalcData.secao.hy / 100 : pcalcData.secao.hx / 100;
            kappa = EI / (Ac * h * h * fcd);

            const denom = 1.0 - ((lambda * lambda) / 120.0 / Math.max(0.1, kappa)) * nu;

            if (denom <= 0.05) {
                Mtarget = M1d_equiv * 3;
                break;
            } else {
                Mtarget = Math.max(M1d_equiv / denom, Min);
            }
        }

        return { Mtot: Mtarget, M2d: Math.max(0, Mtarget - M1d_equiv) };
    };

    const resX = calcX ? solveKappa(M1xt, M1xb, MinX, lamX, 'x') : { Mtot: Math.max(Math.abs(M1xt), Math.abs(M1xb), MinX), M2d: 0 };
    const resY = calcY ? solveKappa(M1yt, M1yb, MinY, lamY, 'y') : { Mtot: Math.max(Math.abs(M1yt), Math.abs(M1yb), MinY), M2d: 0 };

    return {
        Mtot_x: resX.Mtot, Mtot_y: resY.Mtot,
        M2d_x: resX.M2d, M2d_y: resY.M2d,
        info: `M3(Kappa)`
    };
}

// --- MÉTODO 4 e 5: MÉTODO GERAL (Iterativo) ---
function calculateMethodGeneral(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, biaxial, calcX, calcY) {
    // Parâmetros de iteração
    const nNodes = 11;
    const maxIter = 20;
    const tolerance = 0.005; // 0.5%
    const Le = pcalcData.secao.length / 100; // metros

    // Arrays de estado
    // x: posição, M1: 1a ordem, Mtot: total, w: deslocamento
    let nodes = [];
    for (let i = 0; i < nNodes; i++) {
        const xi = (i / (nNodes - 1)) * Le;
        nodes.push({ x: xi, M1x: 0, M1y: 0, MtotX: 0, MtotY: 0, wX: 0, wY: 0, curvX: 0, curvY: 0 });
    }

    // Interpolação Linear de Momentos de 1a Ordem ao longo da barra
    const setupM1 = (Mt, Mb, Min, prop) => {
        // Ajuste para Minimo (Envelope)
        const Mmax = Math.max(Math.abs(Mt), Math.abs(Mb), Min);
        const signT = Mt >= 0 ? 1 : -1;
        const signB = Mb >= 0 ? 1 : -1;

        // Se momento muito baixo, força envelope mínimo constante ou linear
        // Simplificação: Interpolação linear dos valores de entrada, mas garante que em nenhum ponto seja menor que o envelope se for crítico?
        // O método geral integra a curvatura real. O mínimo deve ser considerado como excentricidade mínima accidental.
        // NBR diz: M1d,min = N * (1.5 + 0.03h). Isso é constante.
        // A prática comum é: M1(x) = M_topo + (M_base - M_topo)*x/L.
        // E verificar se M1(x) < M_min e corrigir? Ou somar excentricidade acidental?
        // O código Java (calculaMomento2OrdP4) usa M1 linear e M_min constante separadamente ou envelope.
        // Vamos usar interpolação linear simples dos inputs.

        for (let i = 0; i < nNodes; i++) {
            const alpha = i / (nNodes - 1);
            // Interpolação Linear (Cuidado com sinais)
            // Assumindo Mt em x=0 e Mb em x=L? Ou ao contrário? 
            // Normalmente Topo (0) e Base (L).
            let val = 0;
            if (pcalcData.secao.boundary === 'pinned') {
                val = Mt + (Mb - Mt) * alpha; // Linear
            } else {
                // Balanço: Topo livre (M=0 ou Carga), Base engastada (Mmax)
                // Se Mt é ponta livre e Mb é engaste:
                // Mas aqui vem os valores de cálculo. Vamos manter linear.
                val = Mt + (Mb - Mt) * alpha;
            }

            // Envelope mínimo: Se M1 calculado for menor que min, usa min com sinal do calculado?
            // NBR: M1d,tot = alpha_b * M1d > M1d,min
            // Para o método geral, usamos a excentricidade geométrica real.
            // Vamos impor o valor absoluto minimo apenas na verificação final ou aplicar excentricidade inicial?
            // Vamos aplicar M = max(M_linear, Min) em magnitude.
            if (Math.abs(val) < Min) val = (val >= 0 ? 1 : -1) * Min;

            nodes[i][prop] = val;
            if (prop === 'M1x') nodes[i].MtotX = val;
            if (prop === 'M1y') nodes[i].MtotY = val;
        }
    };

    setupM1(M1xt, M1xb, MinX, 'M1x');
    setupM1(M1yt, M1yb, MinY, 'M1y');

    // Loop de Iteração
    for (let iter = 0; iter < maxIter; iter++) {
        let maxChange = 0;

        // 1. Calcular Curvaturas para os Momentos Totais atuais
        for (let i = 0; i < nNodes; i++) {
            const Mx_curr = nodes[i].MtotX;
            const My_curr = biaxial ? nodes[i].MtotY : 0; // Se uniaxial, ignora Y na curvatura X

            // Obter curvatura 1/r dado N e M
            // Para uniaxial, calculamos apenas curvature X
            // Para biaxial, calculamos curvature X e Y acopladas

            let kx = 0, ky = 0;

            if (calcX || calcY) {
                const curve = solveCurvature(Nsd, Mx_curr, My_curr); // Retorna kx, ky
                kx = curve.kx;
                ky = curve.ky;
            }

            nodes[i].curvX = kx;
            nodes[i].curvY = ky;
        }

        // 2. Integrar Curvaturas para obter Deslocamentos (Método das Diferenças Finitas ou Integração Dupla)
        // Usando integração numérica simples (Trapezoidal) duas vezes
        // Curvatura -> Rotação -> Deslocamento
        // w(x) = integral(integral(curv))
        // Condições de contorno:
        // Biapoiado: w(0) = 0, w(L) = 0.
        // Balanço: w(L) = 0, w'(L) = 0 (Base engastada em L) ou w(0)=0, w'(0)=0.

        const integrateDisplacement = (propCurv, propDisp) => {
            const h = Le / (nNodes - 1);
            const w = new Array(nNodes).fill(0);

            if (pcalcData.secao.boundary === 'pinned') {
                // Método de momento de área ou Conjugate Beam simplificado
                // Ou resolver sistema linear de diferenças finitas: w[i-1] - 2w[i] + w[i+1] = h^2 * curv[i]

                // Vamos usar diferenças finitas:
                // Matriz tridiagonal. Simplificação: Integração dupla assumindo w(0)=0.
                // Depois corrigir rotação de corpo rígido para w(L)=0.

                let slope = new Array(nNodes).fill(0);
                let disp = new Array(nNodes).fill(0);

                // Int 1: Rotação (Theta)
                for (let i = 1; i < nNodes; i++) {
                    const avgCurv = (nodes[i - 1][propCurv] + nodes[i][propCurv]) / 2;
                    slope[i] = slope[i - 1] + avgCurv * h;
                }
                // Int 2: Deslocamento
                for (let i = 1; i < nNodes; i++) {
                    const avgSlope = (slope[i - 1] + slope[i]) / 2;
                    disp[i] = disp[i - 1] + avgSlope * h;
                }

                // Correção linear para w(L) = 0 (Rotação do corpo rígido)
                const gap = disp[nNodes - 1];
                const angleCorr = gap / Le;
                for (let i = 0; i < nNodes; i++) {
                    const x = (i / (nNodes - 1)) * Le;
                    disp[i] -= angleCorr * x;
                    nodes[i][propDisp] = disp[i];
                }

            } else {
                // Balanço (Engaste na Base - índice nNodes-1, Topo Livre - índice 0)
                // Integração do topo para base. w(base)=0, theta(base)=0.
                // Integramos da base (i=N-1) para o topo (i=0)
                let slope = 0;
                let disp = 0;
                nodes[nNodes - 1][propDisp] = 0;

                for (let i = nNodes - 2; i >= 0; i--) {
                    const avgCurv = (nodes[i + 1][propCurv] + nodes[i][propCurv]) / 2;
                    slope += avgCurv * h; // Acumula rotação
                    const w_step = slope * h; // Deslocamento no passo
                    disp += w_step;
                    nodes[i][propDisp] = disp; // w cresce para o topo
                }
            }
        };

        if (calcX) integrateDisplacement('curvX', 'wX'); // Curvatura em X gera deflexão em X? Cuidado com eixos.
        // Curvatura em torno de Y (plano XZ) gera deslocamento em X. Curv X (plano YZ) gera deslocamento em Y.
        // Nomenclatura PCALC: Mx gira em torno de X (afeta Y), My gira em torno de Y (afeta X).
        // Então: Mx gera curvatura Kx -> deflexão wY. My gera Ky -> deflexão wX.
        // Ajustando chamadas:
        if (calcX) integrateDisplacement('curvX', 'wY'); // Mx -> wY
        if (calcY) integrateDisplacement('curvY', 'wX'); // My -> wX

        // 3. Atualizar Momentos de 2a Ordem
        // Mtot = M1 + N * w
        // Mx_tot = M1x + N * wY
        // My_tot = M1y + N * wX

        let diffMax = 0;
        for (let i = 0; i < nNodes; i++) {
            const oldMx = nodes[i].MtotX;
            const oldMy = nodes[i].MtotY;

            const M2x = Math.abs(Nsd) * nodes[i].wY; // N positivo na fórmula de P-Delta (N*delta)
            const M2y = Math.abs(Nsd) * nodes[i].wX;

            // Manter sinal? Se Nsd é compressão (-), e w é positivo, momento aumenta.
            // A deflexão w segue a curvatura. Se M positivo, K positivo, w "negativo" (concavidade).
            // Simplificação: Somar magnitude do efeito 2a ordem ao momento 1a ordem?
            // Rigorosamente: M(x) = M1(x) + N * v(x). Com N compressão sendo negativo.
            // Se v(x) foi calculado consistente com M, o sinal se ajusta.

            // Como solveCurvature e integração usam sinais consistentes, podemos somar direto.
            // Mas Nsd no código é negativo para compressão.
            // Se usamos N negativo na fórmula, M diminui? Não. Efeito P-Delta aumenta momento.
            // O termo é - P * delta. Como P (compressão) é negativo no nosso sign convention, fica - (-) * delta = + delta.
            // Então M_new = M1 + abs(N) * w.

            const signX = nodes[i].M1x >= 0 ? 1 : -1;
            const signY = nodes[i].M1y >= 0 ? 1 : -1;

            const newMx = nodes[i].M1x + signX * Math.abs(Nsd) * Math.abs(nodes[i].wY);
            const newMy = nodes[i].M1y + signY * Math.abs(Nsd) * Math.abs(nodes[i].wX);

            nodes[i].MtotX = newMx;
            nodes[i].MtotY = newMy;

            diffMax = Math.max(diffMax, Math.abs(newMx - oldMx), Math.abs(newMy - oldMy));
        }

        if (diffMax < tolerance) break;
    }

    // Encontrar máximos finais
    let maxMx = 0, maxMy = 0;
    nodes.forEach(n => {
        if (Math.abs(n.MtotX) > Math.abs(maxMx)) maxMx = n.MtotX;
        if (Math.abs(n.MtotY) > Math.abs(maxMy)) maxMy = n.MtotY;
    });

    const max_wY = Math.max(...nodes.map(n => Math.abs(n.wY)));
    const max_wX = Math.max(...nodes.map(n => Math.abs(n.wX)));
    const max_m1_x = Math.max(Math.abs(M1xt), Math.abs(M1xb));
    const max_m1_y = Math.max(Math.abs(M1yt), Math.abs(M1yb));

    const maxM2x = Math.max(Math.abs(maxMx) - max_m1_x, Math.abs(Nsd) * max_wY);
    const maxM2y = Math.max(Math.abs(maxMy) - max_m1_y, Math.abs(Nsd) * max_wX);

    return {
        Mtot_x: maxMx, Mtot_y: maxMy,
        M2d_x: maxM2x, M2d_y: maxM2y,
        info: `M${biaxial ? '5' : '4'}(Geral)`
    };
}

// --- FUNÇÕES AUXILIARES DE CÁLCULO FÍSICO ---

function getSecantStiffness(N, Mx, My) {
    // Retorna rigidez EIx e EIy para o estado de carga
    const res = solveCurvature(N, Mx, My);
    // EI = M / k
    // Limitar k muito pequeno
    const kx = Math.abs(res.kx) < 1e-9 ? 1e-9 : res.kx;
    const ky = Math.abs(res.ky) < 1e-9 ? 1e-9 : res.ky;

    // Se M for zero, usa rigidez tangente inicial ou bruta?
    // Usar EI bruto * 0.4 como fallback
    const Ecs = 0.85 * 5600 * Math.sqrt(pcalcData.materiais.fck);
    const Ecs_kNm2 = Ecs * 1000;

    // Inércias Brutas (m4)
    const Ix_gross = pcalcData.secao.ix / 1e8; // cm4 -> m4
    const Iy_gross = pcalcData.secao.iy / 1e8;

    const EIx_gross = Ecs_kNm2 * Ix_gross;
    const EIy_gross = Ecs_kNm2 * Iy_gross;

    let EIx = (Math.abs(Mx) > 0.1) ? Math.abs(Mx) / Math.abs(kx) : 0.7 * EIx_gross; // Aprox EIsec
    let EIy = (Math.abs(My) > 0.1) ? Math.abs(My) / Math.abs(ky) : 0.7 * EIy_gross;

    return { EIx, EIy };
}

function solveCurvature(targetN, targetMx, targetMy) {
    // Método de Newton-Raphson para encontrar (e0, kx, ky) que equilibram (N, Mx, My)
    // Adaptado para rodar rápido

    const maxIter = 10;
    const tol = 1.0; // kN, kNm

    // Chute inicial: Linear elástico
    // N = E A e0  -> e0 = N / EA
    // M = E I k   -> k = M / EI

    const Ecs = 0.85 * 5600 * Math.sqrt(pcalcData.materiais.fck); // MPa
    const Ecs_kncm2 = (Ecs / 10);

    const Ac = pcalcData.secao.areaAc;
    const Ix = pcalcData.secao.ix;
    const Iy = pcalcData.secao.iy;

    let e0 = targetN / (Ecs_kncm2 * Ac);
    // Fatores de rigidez secante estimados (0.4 para concreto fissurado)
    let kx = (targetMx * 100) / (0.4 * Ecs_kncm2 * Ix);
    let ky = (targetMy * 100) / (0.4 * Ecs_kncm2 * Iy);

    for (let i = 0; i < maxIter; i++) {
        const res = calculateSectionResistance(e0, kx, ky);

        const dN = targetN - res.N;
        const dMx = targetMx - res.Mx;
        const dMy = targetMy - res.My;

        if (Math.abs(dN) < tol && Math.abs(dMx) < tol && Math.abs(dMy) < tol) break;

        // Matriz de rigidez tangente aproximada (ou secante atualizada)
        // Para NR completo precisaria das derivadas parciais (Jacobiana).
        // Vamos usar aproximação desacoplada para estabilidade e velocidade.
        // K_axial ~ EA, K_flex ~ EI

        // Ajuste heurístico dos incrementos
        const K_axial = Ecs_kncm2 * Ac * 0.5; // Rigidez axial reduzida na ruptura
        const K_flex_x = Ecs_kncm2 * Ix * 0.3;
        const K_flex_y = Ecs_kncm2 * Iy * 0.3;

        e0 += dN / K_axial;
        kx += (dMx * 100) / K_flex_x;
        ky += (dMy * 100) / K_flex_y;
    }

    // Retorna curvaturas em 1/m (input foi kNm, calculo interno cm)
    return { kx: kx * 100, ky: ky * 100, e0: e0 };
}

function renderResultsTable() {
    const tbody = document.getElementById('results-table').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';

    pcalcData.resultados.loadCases.forEach((res, i) => {
        const row = tbody.insertRow();
        const isSelected = canvasView.selectedCaseIndex === i;
        row.className = `hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b dark:border-gray-700 transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`;

        row.onclick = () => {
            canvasView.selectedCaseIndex = i;
            renderElevation(i);
            renderResultsTable();
            render3DChart();
        };

        let fsText = "-";
        let fsClass = "";
        if (res.safetyFactor > 0 && res.safetyFactor < 99) {
            fsText = res.safetyFactor.toFixed(2);
            fsClass = res.safetyFactor >= 1.0 ? "text-green-600 font-bold" : "text-red-600 font-bold";
        } else if (res.safetyFactor >= 99) {
            fsText = ">10";
            fsClass = "text-green-600 font-bold";
        }

        row.innerHTML = `
            <td class="p-2 font-mono text-gray-700 dark:text-gray-300 text-center">${res.originalIndex}</td>
            <td class="p-2 text-gray-700 dark:text-gray-300">${res.Nsd.toFixed(1)}</td>
            <td class="p-2 font-bold text-blue-600 dark:text-blue-400">${res.MxTot.toFixed(1)}</td>
            <td class="p-2 font-bold text-green-600 dark:text-green-400">${res.MyTot.toFixed(1)}</td>
            <td class="p-2 text-center ${fsClass}">${fsText}</td>
            <td class="p-2"><span class="px-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 text-[10px]">${res.info}</span></td>
            <td class="p-2 text-xs text-blue-500 dark:text-blue-400 text-center">
                ${isSelected ? '<b>(Sel)</b>' : 'Ver'}
            </td>
        `;
    });
}

function render3DChart() {
    const chartDiv = document.getElementById('chart3d');
    if (!chartDiv) return;

    chartDiv.innerHTML = '';

    const { x, y, z } = pcalcData.resultados.surfacePoints;
    const loadCases = pcalcData.resultados.loadCases;
    const minSurf = pcalcData.resultados.minMomentSurface;

    const dark = typeof isDark === 'function' ? isDark() : false;
    const meshColor = dark ? '#3462a3ff' : '#94a3b8';
    const axisColor = dark ? '#94a3b8' : '#475569';
    const gridColor = dark ? '#334155' : '#e2e8f0';
    const bgColor = 'rgba(0,0,0,0)';

    const surfaceTrace = {
        type: 'mesh3d',
        x: x, y: y, z: z,
        opacity: 0.5,
        color: meshColor,
        name: 'Diagrama de Interação',
        alphahull: 0,
        lighting: { ambient: 0.5, diffuse: 0.6 }
    };

    const minSurfTrace = {
        type: 'mesh3d',
        x: minSurf.x, y: minSurf.y, z: minSurf.z,
        opacity: 0.15,
        color: '#facc15',
        name: 'Momento Mínimo',
        alphahull: 0,
        lighting: { ambient: 0.5, diffuse: 0.6 }
    };

    const selectedIdx = canvasView.selectedCaseIndex;

    const x_other = [], y_other = [], z_other = [], text_other = [];
    const x_sel = [], y_sel = [], z_sel = [], text_sel = [];

    loadCases.forEach((l, i) => {
        if (i === selectedIdx) {
            x_sel.push(l.MxTot);
            y_sel.push(l.MyTot);
            z_sel.push(l.Nsd);
            text_sel.push(l.originalIndex);
        } else {
            x_other.push(l.MxTot);
            y_other.push(l.MyTot);
            z_other.push(l.Nsd);
            text_other.push(l.originalIndex);
        }
    });

    const loadsTraceOther = {
        type: 'scatter3d',
        mode: 'markers',
        x: x_other, y: y_other, z: z_other,
        marker: { size: 3, color: '#ef4444', symbol: 'circle', opacity: 0.6 },
        hovertemplate: '<b>Caso %{text}</b><br>N: %{z:.1f} kN<br>Mx: %{x:.1f} kNm<br>My: %{y:.1f} kNm<extra></extra>',
        text: text_other,
        name: 'Outros Casos'
    };

    const loadsTraceSelected = {
        type: 'scatter3d',
        mode: 'markers',
        x: x_sel, y: y_sel, z: z_sel,
        marker: { size: 6, color: '#22c55e', symbol: 'diamond', line: { width: 2, color: '#ffffff' } },
        hovertemplate: '<b>Caso %{text} (Selecionado)</b><br>N: %{z:.1f} kN<br>Mx: %{x:.1f} kNm<br>My: %{y:.1f} kNm<br>FS: ~%{customdata:.2f}<extra></extra>',
        text: text_sel,
        customdata: [loadCases[selectedIdx]?.safetyFactor || 0],
        name: 'Selecionado'
    };

    const data = [surfaceTrace, minSurfTrace, loadsTraceOther];
    if (x_sel.length > 0) data.push(loadsTraceSelected);

    const layout = {
        margin: { l: 0, r: 0, b: 0, t: 0 },
        paper_bgcolor: bgColor,
        scene: {
            xaxis: { title: 'Mx', color: axisColor, gridcolor: gridColor },
            yaxis: { title: 'My', color: axisColor, gridcolor: gridColor },
            zaxis: { title: 'N', color: axisColor, gridcolor: gridColor },
            aspectmode: 'manual',
            aspectratio: { x: 1, y: 1, z: 1.5 }
        },
        showlegend: true,
        legend: { x: 0, y: 1, font: { size: 10, color: axisColor } },
        hovermode: 'closest'
    };

    Plotly.newPlot('chart3d', data, layout, { responsive: true });
}

function renderElevation(caseIndex) {
    const containerN = document.getElementById('elevation-plot-n');
    const containerMx = document.getElementById('elevation-plot-mx');
    const containerMy = document.getElementById('elevation-plot-my');

    if (!containerN || !containerMx || !containerMy) return;

    const placeholder = document.getElementById('elevation-placeholder');
    if (placeholder) placeholder.style.display = 'none';

    const loadCase = pcalcData.resultados.loadCases[caseIndex];
    if (!loadCase) return;

    const points = 20;
    const L = pcalcData.secao.length;
    const z = [];
    const normal = [];
    const mxTot = [];
    const myTot = [];
    const mx1 = [];
    const my1 = [];

    const e_min_x = 1.5 + 0.03 * pcalcData.secao.hy;
    const e_min_y = 1.5 + 0.03 * pcalcData.secao.hx;
    const Md_min_x = Math.abs(loadCase.Nsd) * (e_min_x / 100);
    const Md_min_y = Math.abs(loadCase.Nsd) * (e_min_y / 100);

    const mxMinLine = [];
    const myMinLine = [];

    const M1xtop = loadCase.Mx1Top;
    const M1xbot = loadCase.Mx1Bot;
    const M1ytop = loadCase.My1Top;
    const M1ybot = loadCase.My1Bot;

    const isPinned = pcalcData.secao.boundary === 'pinned';
    const N_val = loadCase.Nsd;

    for (let i = 0; i <= points; i++) {
        const pos = i / points;
        const height = pos * L;
        z.push(height);

        normal.push(N_val);
        mxMinLine.push(Md_min_x);
        myMinLine.push(Md_min_y);

        const m1x_curr = M1xbot + (M1xtop - M1xbot) * pos;
        const m1y_curr = M1ybot + (M1ytop - M1ybot) * pos;

        mx1.push(m1x_curr);
        my1.push(m1y_curr);

        const m2x_mag = loadCase.M2dx || 0;
        const m2y_mag = loadCase.M2dy || 0;

        let signX = Math.sign(loadCase.MxTot) || 1;
        if (Math.abs(M1xtop + M1xbot) > 0.01) signX = Math.sign(M1xtop + M1xbot);

        let signY = Math.sign(loadCase.MyTot) || 1;
        if (Math.abs(M1ytop + M1ybot) > 0.01) signY = Math.sign(M1ytop + M1ybot);

        if (isPinned) {
            mxTot.push(m1x_curr + (signX * m2x_mag) * Math.sin(Math.PI * pos));
            myTot.push(m1y_curr + (signY * m2y_mag) * Math.sin(Math.PI * pos));
        } else {
            const factor = Math.pow(1 - pos, 2);
            mxTot.push(m1x_curr + signX * m2x_mag * (1 - factor));
            myTot.push(m1y_curr + signY * m2y_mag * (1 - factor));
        }
    }

    const dark = typeof isDark === 'function' ? isDark() : false;
    const plotBgColor = dark ? '#1f2937' : '#f3f4f6';
    const lineColor = dark ? '#e5e7eb' : '#000000';
    const dashedLineColor = dark ? '#9ca3af' : '#6b7280';
    const minLineColor = '#ef4444';
    const fontColor = dark ? '#9ca3af' : '#374151';
    const fillColor = dark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)';

    const commonLayout = {
        margin: { l: 30, r: 10, b: 30, t: 30 },
        showlegend: false,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: plotBgColor,
        xaxis: {
            zeroline: true, zerolinecolor: '#9ca3af',
            showgrid: true, gridcolor: dark ? '#374151' : '#e5e7eb',
        },
        yaxis: { showgrid: false, zeroline: false, showticklabels: false, range: [0, L] },
        font: { size: 10, color: fontColor }
    };

    const traceN = { x: normal, y: z, type: 'scatter', mode: 'lines', fill: 'tozerox', line: { color: lineColor, width: 2 }, fillcolor: fillColor };
    Plotly.newPlot('elevation-plot-n', [traceN], { ...commonLayout, title: { text: 'Nsd (kN)', font: { size: 11, weight: 'bold', color: fontColor } } }, { displayModeBar: false });

    const plotMoment = (divId, tTot, t1, tMin, title) => {
        Plotly.newPlot(divId, [
            { x: tMin, y: z, type: 'scatter', mode: 'lines', line: { color: minLineColor, width: 1, dash: 'dot' }, name: 'Minimo (+)' },
            { x: tMin.map(v => -v), y: z, type: 'scatter', mode: 'lines', line: { color: minLineColor, width: 1, dash: 'dot' }, name: 'Minimo (-)' },
            { x: t1, y: z, type: 'scatter', mode: 'lines', line: { color: dashedLineColor, width: 1, dash: 'dash' }, name: '1a Ordem' },
            { x: tTot, y: z, type: 'scatter', mode: 'lines', fill: 'tozerox', line: { color: lineColor, width: 2 }, fillcolor: fillColor, name: 'Total' }
        ], { ...commonLayout, title: { text: title, font: { size: 11, weight: 'bold', color: fontColor } } }, { displayModeBar: false });
    };

    plotMoment('elevation-plot-mx', mxTot, mx1, mxMinLine, 'Msd,x (kNm)');
    plotMoment('elevation-plot-my', myTot, my1, myMinLine, 'Msd,y (kNm)');
}

function updateSectionStats() {
    const container = document.getElementById('cross-section-container');
    if (!container) return;

    const { hx, hy, length, boundary, areaAc } = pcalcData.secao;
    const { fck } = pcalcData.materiais;
    const { barras } = pcalcData.armacao;

    let As = 0;
    if (barras) {
        barras.forEach(b => {
            As += Math.PI * Math.pow((b.diametro / 10) / 2, 2);
        });
    }

    const rho = (areaAc > 0) ? (As / areaAc) * 100 : 0;
    const Le = (boundary === 'pinned') ? length : 2 * length;
    const lamX = (hy > 0) ? (3.46 * Le) / hy : 0;
    const lamY = (hx > 0) ? (3.46 * Le) / hx : 0;

    if (typeof EngCAD !== 'undefined') {
        EngCAD.updateHUD(container, 'Pilar de Concreto Armado', [
            { label: 'Seção', value: `${hx} × ${hy} cm` },
            { label: 'Taxa (ρ)', value: `${rho.toFixed(2)}%`, color: '#38bdf8' },
            { label: 'Esbeltez λx / λy', value: `${lamX.toFixed(0)} / ${lamY.toFixed(0)}` },
            { label: 'Concreto', value: `fck = ${fck} MPa` }
        ]);
        return;
    }

    let statsDiv = document.getElementById('section-stats-overlay');
    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'section-stats-overlay';
        statsDiv.className = 'absolute top-2 left-2 bg-slate-900/85 p-2 rounded border border-slate-700 text-xs text-slate-200 pointer-events-none shadow-sm backdrop-blur-sm z-10';
        container.appendChild(statsDiv);
    }

    statsDiv.innerHTML = `
        <div class="font-bold mb-1 border-b border-gray-300 dark:border-gray-600 pb-1">Propriedades</div>
        <div class="mb-1">Taxa de armadura = <span class="font-bold text-blue-600 dark:text-blue-400">${rho.toFixed(2)} %</span></div>
        <div class="mb-1">Índice de Esbeltez:</div>
        <div class="pl-2">&lambda;x = <span class="font-bold">${lamX.toFixed(0)}</span></div>
        <div class="pl-2">&lambda;y = <span class="font-bold">${lamY.toFixed(0)}</span></div>
        <div class="mt-1 pt-1 border-t border-gray-300 dark:border-gray-600">Concreto: fck = <span class="font-bold">${fck} MPa</span></div>
    `;
}

function renderCrossSection() {
    const canvas = document.getElementById('sectionCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 1. Draw Unified RS2 / CAD Slate Background & Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, canvas.width, canvas.height, true);
        EngCAD.drawGrid(ctx, canvas.width, canvas.height, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);

    const currentScale = canvasView.scale * canvasView.baseScale;
    ctx.scale(currentScale, -currentScale);

    const { hx, hy } = pcalcData.secao;

    // 2. Concrete Outline & Technical 45-deg Hatching
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2 / currentScale;

    if (pcalcData.secao.tipoSecao === 'Retangular') {
        ctx.fillRect(-hx / 2, -hy / 2, hx, hy);
        ctx.save();
        ctx.beginPath();
        ctx.rect(-hx / 2, -hy / 2, hx, hy);
        ctx.clip();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.lineWidth = 1 / currentScale;
        const diag = Math.max(hx, hy) * 2;
        for (let d = -diag; d < diag; d += 14 / currentScale) {
            ctx.beginPath();
            ctx.moveTo(d, -diag);
            ctx.lineTo(d + diag, diag);
            ctx.stroke();
        }
        ctx.restore();
        ctx.strokeRect(-hx / 2, -hy / 2, hx, hy);
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, hx / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    // 3. Stirrup Tie (Estribo) & Longitudinal Rebars to Scale
    const { barras } = pcalcData.armacao;
    if (barras && barras.length > 0) {
        // Draw stirrup tie enclosing the rebars if rectangular
        if (pcalcData.secao.tipoSecao === 'Retangular' && barras.length >= 4) {
            let minBx = Infinity, maxBx = -Infinity, minBy = Infinity, maxBy = -Infinity;
            for (let b of barras) {
                const bx = b.x - pcalcData.secao.xm;
                const by = b.y - pcalcData.secao.ym;
                const rad = (b.diametro / 10) / 2;
                minBx = Math.min(minBx, bx - rad);
                maxBx = Math.max(maxBx, bx + rad);
                minBy = Math.min(minBy, by - rad);
                maxBy = Math.max(maxBy, by + rad);
            }
            if (minBx < maxBx && minBy < maxBy) {
                ctx.save();
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 1.6 / currentScale;
                const stW = maxBx - minBx;
                const stH = maxBy - minBy;
                const cornerR = Math.min(1.2, stW / 8, stH / 8);
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(minBx, minBy, stW, stH, cornerR);
                } else {
                    ctx.rect(minBx, minBy, stW, stH);
                }
                ctx.stroke();
                ctx.restore();
            }
        } else if (pcalcData.secao.tipoSecao === 'Circular' && barras.length >= 2) {
            // Draw circular stirrup ring at outermost bar radius
            let maxBarR = 0;
            for (let b of barras) {
                const bx = b.x - pcalcData.secao.xm;
                const by = b.y - pcalcData.secao.ym;
                const rBar = Math.sqrt(bx*bx + by*by) + (b.diametro / 10) / 2;
                if (rBar > maxBarR) maxBarR = rBar;
            }
            if (maxBarR > 0) {
                ctx.save();
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 1.6 / currentScale;
                ctx.beginPath();
                ctx.arc(0, 0, maxBarR, 0, 2 * Math.PI);
                ctx.stroke();
                ctx.restore();
            }
        }

        // Draw individual rebars with true physical scale
        for (let b of barras) {
            const bx = b.x - pcalcData.secao.xm;
            const by = b.y - pcalcData.secao.ym;
            const rad = (b.diametro / 10) / 2;

            if (typeof EngCAD !== 'undefined') {
                EngCAD.drawRebar(ctx, bx, by, rad, { isDark: true, scale: currentScale });
            } else {
                ctx.beginPath();
                ctx.arc(bx, by, rad, 0, 2 * Math.PI);
                ctx.fillStyle = '#ef4444';
                ctx.fill();
                ctx.strokeStyle = '#991b1b';
                ctx.lineWidth = 1 / currentScale;
                ctx.stroke();
            }
        }
    }

    // 4. Centroid Axes
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.7)';
    ctx.lineWidth = 1.2 / currentScale;
    ctx.setLineDash([4 / currentScale, 3 / currentScale]);
    ctx.moveTo(-hx / 2 - 8 / currentScale, 0); ctx.lineTo(hx / 2 + 8 / currentScale, 0);
    ctx.moveTo(0, -hy / 2 - 8 / currentScale); ctx.lineTo(0, hy / 2 + 8 / currentScale);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();

    // 5. Dimension Lines (Cotas Técnicas com Pill Badges) - Desenhadas em coordenadas de tela (pixels 1:1)
    if (typeof EngCAD !== 'undefined') {
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const x1 = cx - (hx / 2) * currentScale;
        const x2 = cx + (hx / 2) * currentScale;
        const yTop = cy - (hy / 2) * currentScale;
        const yBot = cy + (hy / 2) * currentScale;

        // Dimensão hx (Largura horizontal inferior)
        EngCAD.drawDimension(ctx, x1, yBot, x2, yBot, `${hx} cm`, {
            offset: 24,
            tickLen: 5,
            isDark: true
        });

        // Dimensão hy (Altura vertical esquerda)
        EngCAD.drawDimension(ctx, x1, yBot, x1, yTop, `${hy} cm`, {
            offset: -24,
            tickLen: 5,
            isDark: true
        });
    }

    updateSectionStats();
}

// =========================================================================
// UNIFIED PCALC CONTROLLER (PILAR vs SEÇÃO / VIGA & MULTI-NORMA)
// =========================================================================
window.pcalcState = {
    mode: 'column', // 'column' or 'section'
    standard: 'nbr' // 'nbr', 'aci', 'ec2', 'all'
};

function updatePcalcUI() {
    const isCol = window.pcalcState.mode === 'column';
    const std = window.pcalcState.standard;

    // 1. View visibility
    const viewCol = document.getElementById('view-column');
    const viewSec = document.getElementById('view-section');
    if (viewCol) viewCol.classList.toggle('hidden', !isCol);
    if (viewSec) viewSec.classList.toggle('hidden', isCol);

    // 2. Mode buttons styling
    const btnCol = document.getElementById('btn-mode-column');
    const btnSec = document.getElementById('btn-mode-section');
    const activeModeClass = "px-3 py-1.5 rounded-md text-xs font-bold transition-all bg-blue-600 text-white shadow-xs flex items-center gap-1.5";
    const inactiveModeClass = "px-3 py-1.5 rounded-md text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all flex items-center gap-1.5";
    if (btnCol) btnCol.className = isCol ? activeModeClass : inactiveModeClass;
    if (btnSec) btnSec.className = !isCol ? activeModeClass : inactiveModeClass;

    // 3. Active badge
    const badge = document.getElementById('active-pcalc-badge');
    if (badge) {
        badge.textContent = isCol ? "PILAR" : "SEÇÃO / VIGA";
        badge.className = isCol
            ? "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 uppercase"
            : "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 uppercase";
    }

    // 4. Code buttons styling
    const codes = ['nbr', 'aci', 'ec2', 'all'];
    const activeCodeClasses = {
        nbr: "px-2.5 py-1.5 rounded-md text-xs font-bold transition-all bg-emerald-600 text-white shadow-xs flex items-center gap-1",
        aci: "px-2.5 py-1.5 rounded-md text-xs font-bold transition-all bg-blue-600 text-white shadow-xs flex items-center gap-1",
        ec2: "px-2.5 py-1.5 rounded-md text-xs font-bold transition-all bg-indigo-600 text-white shadow-xs flex items-center gap-1",
        all: "px-2.5 py-1.5 rounded-md text-xs font-bold transition-all bg-purple-600 text-white shadow-xs flex items-center gap-1"
    };
    const inactiveCodeClass = "px-2.5 py-1.5 rounded-md text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all flex items-center gap-1";

    codes.forEach(c => {
        const btn = document.getElementById(`btn-code-${c}`);
        if (btn) btn.className = (c === std) ? activeCodeClasses[c] : inactiveCodeClass;
    });

    // 5. Dynamic Banner update
    const bTitle = document.getElementById('banner-code-title');
    const bDesc = document.getElementById('banner-code-desc');
    const bMode = document.getElementById('banner-mode-indicator');

    if (bMode) {
        bMode.textContent = isCol ? "Modo: Pilar (Flexo-Compressão Biaxial & 2ª Ordem)" : "Modo: Seção / Viga (Flexão M-N & Cisalhamento V)";
    }

    if (std === 'nbr') {
        if (bTitle) bTitle.innerHTML = "🇧🇷 ABNT NBR 6118:2023";
        if (bDesc) bDesc.innerHTML = isCol
            ? "• Pilar: &gamma;c=1.40, &gamma;s=1.15, &gamma;f=1.40 • Pilar-Padrão (1/r, Rigidez) e Momento Mínimo M<sub>1d,min</sub>"
            : "• Seção: &gamma;c=1.40, &gamma;s=1.15 • Domínios 2/3 (x/d &le; 0.45) • Cisalhamento Modelo I com &sigma;<sub>cp</sub>";
    } else if (std === 'aci') {
        if (bTitle) bTitle.innerHTML = "🇺🇸 ACI 318-22 (LRFD)";
        if (bDesc) bDesc.innerHTML = isCol
            ? "• Column: &phi;c = 0.65 (tied) / 0.75 (spiral) • Moment Magnifier (&delta; M<sub>2</sub>) • Minimum Moment M<sub>2,min</sub> = Pu(15+0.03h) mm"
            : "• Section: Whitney Block (&beta;<sub>1</sub>) • &phi;<sub>flex</sub> = 0.65 – 0.90 (&epsilon;<sub>t</sub>) • Shear &phi;V<sub>c</sub> com Nu";
    } else if (std === 'ec2') {
        if (bTitle) bTitle.innerHTML = "🇪🇺 Eurocode 2 (EN 1992-1-1)";
        if (bDesc) bDesc.innerHTML = isCol
            ? "• Column: &gamma;C = 1.50, &gamma;S = 1.15, &gamma;F = 1.35 • Imperfection e<sub>0</sub> = max(h/30, 20mm) • Curvature / Stiffness"
            : "• Section: &gamma;C = 1.50, &gamma;S = 1.15 • Variable Strut Angle cot&theta; = 2.5 • Shear com &sigma;<sub>cp</sub>";
    } else {
        if (bTitle) bTitle.innerHTML = "🌐 Comparativo Multi-Norma";
        if (bDesc) bDesc.innerHTML = "• NBR 6118 vs ACI 318-22 vs Eurocode 2 • Análise paralela dos fatores de segurança, resistências e taxas de trabalho";
    }

    // 6. Presets visibility (Column vs Section)
    const secPreset = document.getElementById('section-preset-wrapper');
    const colPreset = document.getElementById('column-preset-wrapper');
    if (secPreset) {
        if (isCol) {
            secPreset.classList.add('hidden');
            secPreset.classList.remove('flex');
        } else {
            secPreset.classList.remove('hidden');
            secPreset.classList.add('flex');
        }
    }
    if (colPreset) {
        if (isCol) {
            colPreset.classList.remove('hidden');
            colPreset.classList.add('flex');
        } else {
            colPreset.classList.add('hidden');
            colPreset.classList.remove('flex');
        }
    }

    // 7. Trigger responsive redraws
    setTimeout(() => {
        if (isCol) {
            if (typeof renderCrossSection === 'function') renderCrossSection();
            if (typeof Plotly !== 'undefined' && document.getElementById('chart3d')) {
                Plotly.Plots.resize('chart3d');
            }
        } else {
            if (typeof pcalcSection !== 'undefined') pcalcSection.calculate();
        }
    }, 80);
}

function setPcalcMode(mode) {
    window.pcalcState.mode = mode;
    updatePcalcUI();
}

function setPcalcStandard(std) {
    window.pcalcState.standard = std;
    if (window.pcalcState.mode === 'column') {
        if (std === 'nbr') {
            const gc = document.getElementById('gamac'); if (gc) gc.value = '1.4';
            const gs = document.getElementById('gamas'); if (gs) gs.value = '1.15';
            const gf = document.getElementById('gamaf'); if (gf) gf.value = '1.4';
        } else if (std === 'aci') {
            const gc = document.getElementById('gamac'); if (gc) gc.value = '1.54'; // 1/0.65
            const gs = document.getElementById('gamas'); if (gs) gs.value = '1.0';
            const gf = document.getElementById('gamaf'); if (gf) gf.value = '1.0';
        } else if (std === 'ec2') {
            const gc = document.getElementById('gamac'); if (gc) gc.value = '1.5';
            const gs = document.getElementById('gamas'); if (gs) gs.value = '1.15';
            const gf = document.getElementById('gamaf'); if (gf) gf.value = '1.35';
        }
        updateDataFromInputs();
    }
    updatePcalcUI();
}

function triggerPcalcCalculation() {
    if (window.pcalcState.mode === 'column') {
        performCalculation();
    } else {
        if (typeof pcalcSection !== 'undefined') pcalcSection.calculate();
    }
}

// =========================================================================
// TYPICAL COLUMN PRESETS (SEÇÕES TÍPICAS DE ENGENHARIA ESTRUTURAL)
// =========================================================================
const COLUMN_PRESETS = {
    'retangular_30x50': {
        name: 'Pilar 30x50 cm (Padrão)',
        tipoSecao: 'Retangular',
        hx: 30, hy: 50, length: 400, fck: 25, boundary: 'pinned',
        barras: [
            { x: 4, y: 4, diametro: 16 },
            { x: 26, y: 4, diametro: 16 },
            { x: 4, y: 46, diametro: 16 },
            { x: 26, y: 46, diametro: 16 }
        ],
        esforcos: [{ n: -800, mxTop: 50, mxBot: -50, myTop: 20, myBot: -20 }]
    },
    'borda_20x40': {
        name: 'Pilar Borda 20x40 cm',
        tipoSecao: 'Retangular',
        hx: 20, hy: 40, length: 300, fck: 30, boundary: 'pinned',
        barras: [
            { x: 3.5, y: 3.5, diametro: 12.5 },
            { x: 16.5, y: 3.5, diametro: 12.5 },
            { x: 3.5, y: 20.0, diametro: 12.5 },
            { x: 16.5, y: 20.0, diametro: 12.5 },
            { x: 3.5, y: 36.5, diametro: 12.5 },
            { x: 16.5, y: 36.5, diametro: 12.5 }
        ],
        esforcos: [{ n: -500, mxTop: 30, mxBot: 30, myTop: 15, myBot: 15 }]
    },
    'quadrado_30x30': {
        name: 'Pilar Central 30x30 cm',
        tipoSecao: 'Retangular',
        hx: 30, hy: 30, length: 320, fck: 30, boundary: 'pinned',
        barras: [
            { x: 3.5, y: 3.5, diametro: 16 },
            { x: 15.0, y: 3.5, diametro: 16 },
            { x: 26.5, y: 3.5, diametro: 16 },
            { x: 3.5, y: 15.0, diametro: 16 },
            { x: 26.5, y: 15.0, diametro: 16 },
            { x: 3.5, y: 26.5, diametro: 16 },
            { x: 15.0, y: 26.5, diametro: 16 },
            { x: 26.5, y: 26.5, diametro: 16 }
        ],
        esforcos: [{ n: -900, mxTop: 25, mxBot: 25, myTop: 25, myBot: 25 }]
    },
    'robusto_40x60': {
        name: 'Pilar Garagem 40x60 cm',
        tipoSecao: 'Retangular',
        hx: 40, hy: 60, length: 360, fck: 35, boundary: 'pinned',
        barras: [
            { x: 4.0, y: 4.0, diametro: 20 },
            { x: 36.0, y: 4.0, diametro: 20 },
            { x: 4.0, y: 30.0, diametro: 20 },
            { x: 36.0, y: 30.0, diametro: 20 },
            { x: 4.0, y: 56.0, diametro: 20 },
            { x: 36.0, y: 56.0, diametro: 20 },
            { x: 20.0, y: 4.0, diametro: 20 },
            { x: 20.0, y: 56.0, diametro: 20 }
        ],
        esforcos: [{ n: -2000, mxTop: 100, mxBot: -50, myTop: 50, myBot: -25 }]
    },
    'circular_d40': {
        name: 'Pilar Circular Ø40 cm',
        tipoSecao: 'Circular',
        hx: 40, hy: 40, length: 300, fck: 30, boundary: 'pinned',
        barras: [
            { x: 36.5, y: 20.0, diametro: 16 },
            { x: 28.25, y: 34.29, diametro: 16 },
            { x: 11.75, y: 34.29, diametro: 16 },
            { x: 3.5, y: 20.0, diametro: 16 },
            { x: 11.75, y: 5.71, diametro: 16 },
            { x: 28.25, y: 5.71, diametro: 16 }
        ],
        esforcos: [{ n: -600, mxTop: 35, mxBot: 35, myTop: 0, myBot: 0 }]
    },
    'parede_20x100': {
        name: 'Pilar-Parede 20x100 cm',
        tipoSecao: 'Retangular',
        hx: 20, hy: 100, length: 300, fck: 30, boundary: 'pinned',
        barras: [
            { x: 3.5, y: 4.0, diametro: 16 },
            { x: 16.5, y: 4.0, diametro: 16 },
            { x: 3.5, y: 27.0, diametro: 16 },
            { x: 16.5, y: 27.0, diametro: 16 },
            { x: 3.5, y: 50.0, diametro: 16 },
            { x: 16.5, y: 50.0, diametro: 16 },
            { x: 3.5, y: 73.0, diametro: 16 },
            { x: 16.5, y: 73.0, diametro: 16 },
            { x: 3.5, y: 96.0, diametro: 16 },
            { x: 16.5, y: 96.0, diametro: 16 }
        ],
        esforcos: [{ n: -1500, mxTop: 80, mxBot: 80, myTop: 25, myBot: 25 }]
    }
};

function loadColumnPreset(key) {
    const p = COLUMN_PRESETS[key];
    if (!p) return;

    pcalcData.secao.tipoSecao = p.tipoSecao;
    pcalcData.secao.hx = p.hx;
    pcalcData.secao.hy = p.hy;
    pcalcData.secao.length = p.length;
    pcalcData.secao.boundary = p.boundary || 'pinned';
    pcalcData.secao.xm = p.hx / 2;
    pcalcData.secao.ym = p.hy / 2;
    pcalcData.materiais.fck = p.fck;

    pcalcData.armacao.barras = JSON.parse(JSON.stringify(p.barras));
    pcalcData.esforcos.listaEsforcos = JSON.parse(JSON.stringify(p.esforcos));

    // Update DOM inputs
    const secTypeEl = document.getElementById('section-type');
    if (secTypeEl) secTypeEl.value = p.tipoSecao;
    const hxEl = document.getElementById('hx');
    if (hxEl) hxEl.value = p.hx;
    const hyEl = document.getElementById('hy');
    if (hyEl) hyEl.value = p.hy;
    const lenEl = document.getElementById('length');
    if (lenEl) lenEl.value = p.length;
    const fckEl = document.getElementById('fck');
    if (fckEl) fckEl.value = p.fck;
    const bndEl = document.getElementById('boundary-type');
    if (bndEl) bndEl.value = p.boundary || 'pinned';

    updateDataFromInputs();
    updateSectionTypeUI(); // Update hy-wrapper visibility and labels
    renderReinforcement();
    renderLoads();
    fitViewToSection();
    renderCrossSection();
    triggerPcalcCalculation();
}

window.loadColumnPreset = loadColumnPreset;
window.applyQuickRebar = applyQuickRebar;
window.setUnits = setUnits;