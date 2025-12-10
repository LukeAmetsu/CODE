// --- ESTRUTURA DE DADOS ---
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

// --- ESTADO DE VISUALIZAÇÃO DO CANVAS (SEÇÃO) ---
const canvasView = {
    scale: 1.0,
    baseScale: 1.0,
    selectedCaseIndex: 0
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {


    injectDynamicUI();

    // Renderizações Iniciais
    updateDataFromInputs();
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
                        n: parseFloat(values[0]) || 0,
                        mxTop: parseFloat(values[1]) || 0,
                        mxBot: parseFloat(values[2]) || 0,
                        myTop: parseFloat(values[3]) || 0,
                        myBot: parseFloat(values[4]) || 0
                    };
                    if (values.length === 3) {
                        load.mxBot = load.mxTop;
                        load.myTop = parseFloat(values[2]) || 0;
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
        const n = parseFloat(row[0]) || 0;
        let mxTop = parseFloat(row[1]) || 0;
        let mxBot = parseFloat(row[2]) || 0;
        let myTop = parseFloat(row[3]) || 0;
        let myBot = parseFloat(row[4]) || 0;
        if (row.length === 3) {
            mxBot = mxTop;
            myTop = parseFloat(row[2]) || 0;
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
    pcalcData.secao.hy = getVal('hy');
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
}

function renderLoads() {
    const tbody = document.getElementById('loads-table').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';
    pcalcData.esforcos.listaEsforcos.forEach((l, i) => {
        const row = tbody.insertRow();
        row.className = "border-b border-gray-100 dark:border-gray-700";
        row.innerHTML = `
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${l.n}" data-idx="${i}" data-key="n"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${l.mxTop}" data-idx="${i}" data-key="mxTop"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${l.mxBot}" data-idx="${i}" data-key="mxBot"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${l.myTop}" data-idx="${i}" data-key="myTop"></td>
            <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${l.myBot}" data-idx="${i}" data-key="myBot"></td>
            <td class="p-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold px-1" data-idx="${i}" data-action="remove">X</button></td>
        `;
    });
}

function handleLoadInput(e) {
    if (e.target.tagName === 'INPUT') {
        const idx = e.target.dataset.idx;
        const key = e.target.dataset.key;
        pcalcData.esforcos.listaEsforcos[idx][key] = parseFloat(e.target.value);
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
}

function generateRectPattern() {
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;
    const cover = 3.0;
    const barsX = 3;
    const barsY = 3;
    pcalcData.armacao.barras = [];
    for (let i = 0; i < barsX; i++) {
        const x = cover + (i * (hx - 2 * cover) / (barsX - 1));
        pcalcData.armacao.barras.push({ x: x, y: cover, diametro: 16 });
        pcalcData.armacao.barras.push({ x: x, y: hy - cover, diametro: 16 });
    }
    for (let i = 1; i < barsY - 1; i++) {
        const y = cover + (i * (hy - 2 * cover) / (barsY - 1));
        pcalcData.armacao.barras.push({ x: cover, y: y, diametro: 16 });
        pcalcData.armacao.barras.push({ x: hx - cover, y: y, diametro: 16 });
    }
    renderReinforcement();
    renderCrossSection();
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
    // Parábola-Retângulo
    if (epsilon >= 0) return 0; // Tração ignorada no concreto

    const ec = Math.abs(epsilon);
    const ec2 = 0.002;
    const ecu = 0.0035;

    if (ec <= ec2) {
        return -0.85 * fcd * (1 - Math.pow(1 - ec / ec2, 2));
    } else if (ec <= ecu) {
        return -0.85 * fcd;
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
        const area = Math.PI * Math.pow(bar.diametro / 10 / 2, 2);
        const F = sigma * area;

        N_int += F;
        Mx_int += F * (by / 100);
        My_int += F * (bx / 100);
    }

    return { N: N_int, Mx: Mx_int, My: My_int };
}

function generateInteractionSurface() {
    const points = { x: [], y: [], z: [] };
    const ecu = -0.0035;
    const es_yield_tension = 0.010;
    const numAngles = 72;

    for (let i = 0; i < numAngles; i++) {
        const theta = (i / numAngles) * 2 * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);

        let u_min = Infinity;
        let u_max = -Infinity;

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

        deformationStates.push({ k: 0, e0: ecu });
        deformationStates.push({ k: 0, e0: -0.002 });

        for (const state of deformationStates) {
            const Kx = state.k * sinT;
            const Ky = state.k * cosT;
            const res = calculateSectionResistance(state.e0, Kx, Ky);
            points.x.push(res.Mx);
            points.y.push(res.My);
            points.z.push(res.N);
        }
    }

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
    if (Math.abs(Mx) < 0.1 && Math.abs(My) < 0.1) {
        const surface = pcalcData.resultados.surfacePoints;
        if (surface.z.length === 0) return 0;
        let minN = 0;
        for (let z of surface.z) if (z < minN) minN = z;
        if (N === 0) return 99.99;
        return Math.abs(minN) / Math.abs(N);
    }

    const R_load = Math.sqrt(Mx * Mx + My * My);
    let angleLoad = Math.atan2(My, Mx);
    if (angleLoad < 0) angleLoad += 2 * Math.PI;

    const surface = pcalcData.resultados.surfacePoints;
    if (surface.x.length === 0) return 0;

    const toleranceN = Math.max(20, Math.abs(N) * 0.10);
    const slicePoints = [];

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

    // Momento Mínimo (NBR 6118)
    const e_min_x = 1.5 + 0.03 * hy;
    const e_min_y = 1.5 + 0.03 * hx;
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

    // lambda = le / i (i approx h/3.46 for rect)
    const lambdaX = (hy > 0) ? (3.46 * le) / hy : 0; // Giro em torno de X, altura é hy
    const lambdaY = (hx > 0) ? (3.46 * le) / hx : 0; // Giro em torno de Y, altura é hx

    const alphaBx = getAlphaB(M1d_x_top, M1d_x_bot);
    const alphaBy = getAlphaB(M1d_y_top, M1d_y_bot);

    // Excentricidade de 1a ordem no centro (aprox para lambda1)
    const e1x = Math.abs(Nsd) > 0 ? Math.max(Math.abs(M1d_x_top), Math.abs(M1d_x_bot)) / Math.abs(Nsd) * 100 : 0;
    const e1y = Math.abs(Nsd) > 0 ? Math.max(Math.abs(M1d_y_top), Math.abs(M1d_y_bot)) / Math.abs(Nsd) * 100 : 0;

    const lambda1_x = Math.min(90, Math.max(35, (25 + 12.5 * (e1x / hy)) / alphaBx));
    const lambda1_y = Math.min(90, Math.max(35, (25 + 12.5 * (e1y / hx)) / alphaBy));

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

    const safetyFactor = calculateSafetyFactor(Nsd, Mtot_x, Mtot_y);

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
        // a = 5*h
        // b = -h^2*N + (N*L^2)/320 - 5*h*M1max
        // c = N*h^2*M1max

        const a = 5.0 * h;
        // Nota: Le = comprimento de flambagem. No Java é 'lFlamb'.
        // Fórmula Java: b = ((-h * h) * nsd) + (((((nsd * lFlamb) / 100) * lFlamb) / 100) / 320) - ((5 * h) * md1Max);
        // Assumindo Le em metros e N em kN.

        const termNLe2 = (nsd_abs * Le * Le) / 320.0;
        const b = (-h * h * nsd_abs) + termNLe2 - (5.0 * h * M1Max);
        const c = nsd_abs * h * h * M1Max;

        const delta = b * b - 4 * a * c;
        let Mtot = M1Max;

        if (delta >= 0) {
            Mtot = (-b + Math.sqrt(delta)) / (2 * a);
        } else {
            // Fallback se delta < 0 (muito instável)
            Mtot = M1Max * 1.5;
        }

        // Garante que não é menor que 1a ordem
        Mtot = Math.max(Mtot, M1Max);

        return { Mtot, M2d: Mtot - M1Max };
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

    const solveKappa = (M1t, M1b, Min, lambda, axis) => {
        const M1Max = Math.max(Math.abs(M1t), Math.abs(M1b), Min);
        if (lambda < 35) return { Mtot: M1Max, M2d: 0 }; // Segurança extra

        // Estimar Rigidez Secante (Kappa)
        // Precisa do momento atuante Mtot para achar rigidez. Processo iterativo simplificado.
        let Mtarget = M1Max;
        let kappa = 100; // Valor inicial alto

        // Iterar algumas vezes para convergir Mtot e Rigidez
        for (let i = 0; i < 3; i++) {
            const mx_try = (axis === 'x') ? Mtarget : 0;
            const my_try = (axis === 'y') ? Mtarget : 0;

            // Buscar EI secante da seção
            const stiff = getSecantStiffness(Nsd, mx_try, my_try);
            const EI = (axis === 'x') ? stiff.EIx : stiff.EIy;

            // Kappa = EI_sec / (Ac * h^2 * fcd) ??? 
            // NBR define rigidez adimensional Kappa = Stiffness da secão
            // Na verdade, a fórmula NBR usa kapa diretamente da rigidez.
            // Mtot = M1d / (1 - (lambda^2 / 120 / kappa) * nu)

            // No Java: kapa = EIsec / (Ac * h * h * fcd)
            const h = (axis === 'x') ? pcalcData.secao.hy / 100 : pcalcData.secao.hx / 100; // h na direção da flexão
            kappa = EI / (Ac * h * h * fcd);

            const denom = 1.0 - ((lambda * lambda) / 120.0 / kappa) * nu;

            if (denom <= 0) Mtarget = M1Max * 3; // Instabilidade
            else Mtarget = M1Max / denom;
        }

        return { Mtot: Mtarget, M2d: Mtarget - M1Max };
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

            const newMx = nodes[i].M1x + Math.abs(Nsd) * nodes[i].wY;
            const newMy = nodes[i].M1y + Math.abs(Nsd) * nodes[i].wX;

            nodes[i].MtotX = newMx;
            nodes[i].MtotY = newMy;

            diffMax = Math.max(diffMax, Math.abs(newMx - oldMx), Math.abs(newMy - oldMy));
        }

        if (diffMax < tolerance) break;
    }

    // Encontrar máximos finais
    let maxMx = 0, maxMy = 0, maxM2x = 0, maxM2y = 0;
    nodes.forEach(n => {
        if (Math.abs(n.MtotX) > Math.abs(maxMx)) maxMx = n.MtotX;
        if (Math.abs(n.MtotY) > Math.abs(maxMy)) maxMy = n.MtotY;
    });

    // M2d aproximado na seção crítica
    maxM2x = maxMx - Math.max(Math.abs(M1xt), Math.abs(M1xb), MinX);
    maxM2y = maxMy - Math.max(Math.abs(M1yt), Math.abs(M1yb), MinY);

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

    let statsDiv = document.getElementById('section-stats-overlay');
    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'section-stats-overlay';
        statsDiv.className = 'absolute top-2 left-2 bg-white/80 dark:bg-gray-800/80 p-2 rounded border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 pointer-events-none shadow-sm backdrop-blur-sm z-10';
        container.appendChild(statsDiv);
    }

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
    const ctx = canvas.getContext('2d');

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);

    const currentScale = canvasView.scale * canvasView.baseScale;
    ctx.scale(currentScale, -currentScale);

    const { hx, hy } = pcalcData.secao;

    const dark = typeof isDark === 'function' ? isDark() : false;
    const concreteFill = dark ? '#374151' : '#e5e7eb';
    const concreteStroke = dark ? '#94a3b8' : '#64748b';
    const rebarFill = '#dc2626';
    const rebarStroke = dark ? '#fca5a5' : '#7f1d1d';
    const axisColor = '#3b82f6';

    ctx.fillStyle = concreteFill;
    ctx.strokeStyle = concreteStroke;
    ctx.lineWidth = 2 / currentScale;

    if (pcalcData.secao.tipoSecao === 'Retangular') {
        ctx.fillRect(-hx / 2, -hy / 2, hx, hy);
        ctx.strokeRect(-hx / 2, -hy / 2, hx, hy);
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, hx / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }

    const { barras } = pcalcData.armacao;
    if (barras) {
        ctx.fillStyle = rebarFill;
        ctx.strokeStyle = rebarStroke;
        ctx.lineWidth = 1 / currentScale;

        for (let b of barras) {
            const bx = b.x - pcalcData.secao.xm;
            const by = b.y - pcalcData.secao.ym;
            const rad = (b.diametro / 10) / 2;

            ctx.beginPath();
            ctx.arc(bx, by, rad, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        }
    }

    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1 / currentScale;
    ctx.moveTo(0, 0); ctx.lineTo(hx / 2, 0);
    ctx.moveTo(0, 0); ctx.lineTo(0, hy / 2);
    ctx.stroke();

    const dimColor = dark ? '#94a3b8' : '#475569';
    ctx.fillStyle = dimColor;
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1 / currentScale;

    const offset = 15 / currentScale;
    const tickLen = 5 / currentScale;

    const yDimX = -hy / 2 - offset;
    ctx.beginPath();
    ctx.moveTo(-hx / 2, -hy / 2 - 2 / currentScale); ctx.lineTo(-hx / 2, yDimX - tickLen);
    ctx.moveTo(hx / 2, -hy / 2 - 2 / currentScale); ctx.lineTo(hx / 2, yDimX - tickLen);
    ctx.moveTo(-hx / 2, yDimX); ctx.lineTo(hx / 2, yDimX);
    ctx.moveTo(-hx / 2 - tickLen, yDimX - tickLen); ctx.lineTo(-hx / 2 + tickLen, yDimX + tickLen);
    ctx.moveTo(hx / 2 - tickLen, yDimX - tickLen); ctx.lineTo(hx / 2 + tickLen, yDimX + tickLen);
    ctx.stroke();

    const xDimY = -hx / 2 - offset;
    ctx.beginPath();
    ctx.moveTo(-hx / 2 - 2 / currentScale, -hy / 2); ctx.lineTo(xDimY - tickLen, -hy / 2);
    ctx.moveTo(-hx / 2 - 2 / currentScale, hy / 2); ctx.lineTo(xDimY - tickLen, hy / 2);
    ctx.moveTo(xDimY, -hy / 2); ctx.lineTo(xDimY, hy / 2);
    ctx.moveTo(xDimY - tickLen, -hy / 2 - tickLen); ctx.lineTo(xDimY + tickLen, -hy / 2 + tickLen);
    ctx.moveTo(xDimY - tickLen, hy / 2 - tickLen); ctx.lineTo(xDimY + tickLen, hy / 2 + tickLen);
    ctx.stroke();

    ctx.save();
    ctx.scale(1, -1);
    const fontSize = 14 / currentScale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';

    ctx.textBaseline = 'top';
    ctx.fillText(`${hx} cm`, 0, -yDimX + 2 / currentScale);

    ctx.save();
    ctx.translate(xDimY - 2 / currentScale, 0);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${hy} cm`, 0, 0);
    ctx.restore();

    ctx.restore();
    ctx.restore();
    updateSectionStats();
}