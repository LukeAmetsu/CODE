// --- ESTRUTURA DE DADOS ---
const pcalcData = {
    secao: {
        tipoSecao: 'Retangular',
        boundary: 'pinned', // 'pinned' (Biapoiado) ou 'cantilever' (Balanço)
        hx: 30,
        hy: 50,
        length: 400, 
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
        minMomentSurface: { x: [], y: [], z: [] }, // Nova estrutura para superfície min
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
    if (window.injectHeader) window.injectHeader({ activePage: 'pcalc', pageTitle: 'pcalc_title', headerPlaceholderId: 'header-placeholder', pathPrefix: '../' });
    if (window.injectFooter) window.injectFooter({ footerPlaceholderId: 'footer-placeholder' });

    injectDynamicUI(); 

    // Renderizações Iniciais
    updateDataFromInputs();
    renderLoads();          
    renderReinforcement();  
    
    setupEventListeners();
    setupExcelImport(); 
    setupCanvasControls(); // Inicializar Zoom e Layout
    
    // Listener para mudança de tema
    window.addEventListener('theme-changed', () => {
        // Verifica se as funções existem antes de chamar
        if (typeof renderCrossSection === 'function') renderCrossSection();
        
        if (pcalcData.resultados.surfacePoints.x.length > 0 && typeof render3DChart === 'function') {
            render3DChart();
        }
        if (pcalcData.resultados.loadCases.length > 0 && typeof renderElevation === 'function') {
             renderElevation(canvasView.selectedCaseIndex || 0); 
        }
    });

    // Renderização inicial forçada após setup
    setTimeout(() => {
        const canvas = document.getElementById('sectionCanvas');
        if (canvas) {
            const container = canvas.parentElement;
            if(container) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
            }
        }
        if (typeof fitViewToSection === 'function') fitViewToSection();
        if (typeof renderCrossSection === 'function') renderCrossSection();
    }, 100);
});

const isDark = () => document.documentElement.classList.contains('dark');

// --- INJEÇÃO DE UI DINÂMICA (ATUALIZADA COM 5 MÉTODOS) ---
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
                            <span class="text-xs text-gray-600 dark:text-gray-400">4. Método Geral (Diag. N, M, 1/r)</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="general_biaxial" class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">5. Método Geral Biaxial (N, Mx, My, 1/r)</span>
                        </label>
                    </div>
                </div>

                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded border dark:border-gray-700 space-y-3">
                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="check-min-moment" checked class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Verificar Momento Mínimo (NBR 6118)</span>
                    </label>
                    <label class="flex items-center gap-2 cursor-pointer" title="Desmarque para forçar o cálculo de 2ª ordem mesmo em pilares curtos">
                        <input type="checkbox" id="check-slenderness" checked class="rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Verificar Esbeltez Limite (λ1) para Dispensa</span>
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
        if(el) el.addEventListener('input', () => { 
            updateDataFromInputs(); 
        });
    });

    ['hx', 'hy', 'section-type'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', () => {
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
    if(reinfTable) {
        reinfTable.parentElement.addEventListener('input', handleReinforcementInput);
        reinfTable.parentElement.addEventListener('click', handleReinforcementAction);
    }

    const loadTable = document.getElementById('loads-table');
    document.getElementById('add-load-btn')?.addEventListener('click', () => {
        pcalcData.esforcos.listaEsforcos.push({ n: -500, mxTop: 20, mxBot: 20, myTop: 10, myBot: 10 });
        renderLoads();
    });
    
    if(loadTable) {
        loadTable.parentElement.addEventListener('input', handleLoadInput);
        loadTable.parentElement.addEventListener('click', handleLoadAction);
    }

    document.getElementById('calculate-btn')?.addEventListener('click', performCalculation);
}

// --- CONTROLES DO CANVAS (ZOOM APENAS, SEM PAN, RESIZE AUTOMATICO) ---
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
    if(!canvas) return;
    
    const w = canvas.width;
    const h = canvas.height;
    const margin = 80; // Margem aumentada para caber cotas
    const { hx, hy } = pcalcData.secao;
    const safeHx = hx || 10;
    const safeHy = hy || 10;
    
    const fitScale = Math.min((w - margin)/safeHx, (h - margin)/safeHy);
    canvasView.baseScale = fitScale;
}

// --- IMPORTAÇÃO EXCEL ---
function setupExcelImport() {
    const fileInput = document.getElementById('upload-excel');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, {header: 1});
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
                if(values.length === 1) values = rowStr.split(/,|;/); 
                
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
                for(let i=0; i<newLoads.length; i++) {
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

// --- MANIPULAÇÃO DE INPUTS ---
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
        pcalcData.secao.areaAc = Math.PI * Math.pow(D/2, 2);
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
            <td class="p-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold px-1" data-idx="${i}" data-action="remove">×</button></td>
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
            <td class="p-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold px-1" data-idx="${i}" data-action="remove">×</button></td>
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
    for(let i=0; i<barsX; i++) {
        const x = cover + (i * (hx - 2*cover) / (barsX - 1));
        pcalcData.armacao.barras.push({x: x, y: cover, diametro: 16});
        pcalcData.armacao.barras.push({x: x, y: hy-cover, diametro: 16});
    }
    for(let i=1; i<barsY-1; i++) {
        const y = cover + (i * (hy - 2*cover) / (barsY - 1));
        pcalcData.armacao.barras.push({x: cover, y: y, diametro: 16});
        pcalcData.armacao.barras.push({x: hx-cover, y: y, diametro: 16});
    }
    renderReinforcement();
    renderCrossSection();
}

// --- LÓGICA DE ENGENHARIA REAL (Método das Fibras) ---

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
                if (x*x + y*y <= R*R) {
                    pcalcData.resultados.secaoC.push({ x, y, dA });
                }
            }
        }
    }
}

function getConcreteStress(epsilon, fcd) {
    if (epsilon >= 0) return 0;
    
    const ec = Math.abs(epsilon);
    const ec2 = 0.002;
    const ecu = 0.0035; 
    
    if (ec <= ec2) {
        return -0.85 * fcd * (1 - Math.pow(1 - ec/ec2, 2)); 
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
    const Es = pcalcData.materiais.es * 100; 
    
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
        const area = Math.PI * Math.pow(bar.diametro/10/2, 2); 
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
            {x: -pcalcData.secao.hx/2, y: -pcalcData.secao.hy/2},
            {x: pcalcData.secao.hx/2, y: -pcalcData.secao.hy/2},
            {x: pcalcData.secao.hx/2, y: pcalcData.secao.hy/2},
            {x: -pcalcData.secao.hx/2, y: pcalcData.secao.hy/2}
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
            const eps_c = es_yield_tension + (k/stepsD2) * (ecu - es_yield_tension);
            const K = (eps_c - eps_t) / (u_max - u_min);
            const e0 = eps_t - K * u_min;
            deformationStates.push({ k: K, e0: e0 });
        }
        
        const stepsD34 = 20; 
        for (let k = 1; k <= stepsD34; k++) {
            const eps_c = ecu;
            const eps_t = es_yield_tension + (k/stepsD34) * (ecu - es_yield_tension);
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

// --- NOVA FUNÇÃO: GERAR SUPERFÍCIE DE MOMENTO MÍNIMO ---
function generateMinMomentSurface() {
    const hx = pcalcData.secao.hx; // cm
    const hy = pcalcData.secao.hy; // cm
    
    // Fatores de excentricidade mínima
    const e_min_x = (1.5 + 0.03 * hy) / 100; // metros (para Mx, braço é y)
    const e_min_y = (1.5 + 0.03 * hx) / 100; // metros (para My, braço é x)

    // Encontrar N máximo (compressão)
    let maxN = 0;
    if (pcalcData.resultados.surfacePoints.z.length > 0) {
        maxN = Math.min(...pcalcData.resultados.surfacePoints.z); // N é negativo
    }
    if (maxN === 0) maxN = -10000; // Fallback
    
    const points = { x: [], y: [], z: [] };
    const stepsN = 20;
    const stepsTheta = 36;
    
    for(let i=0; i<=stepsN; i++) {
        const N = maxN * (i / stepsN); // Vai de 0 a maxN (negativo)
        const absN = Math.abs(N);
        
        // Limites retangulares do momento mínimo para este N
        const Mx_lim = absN * e_min_x;
        const My_lim = absN * e_min_y;
        
        // Gerar anel
        for(let j=0; j<=stepsTheta; j++) {
            const theta = (j / stepsTheta) * 2 * Math.PI;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);
            
            // Raio para atingir a caixa retangular (Mx_lim, My_lim)
            // |x| <= Mx_lim, |y| <= My_lim
            // x = r*cos, y = r*sin
            // r <= Mx_lim / |cos|, r <= My_lim / |sin|
            
            let r = 0;
            if (Mx_lim > 0 && My_lim > 0) {
                 const r_x = Math.abs(cosT) > 1e-6 ? Mx_lim / Math.abs(cosT) : Infinity;
                 const r_y = Math.abs(sinT) > 1e-6 ? My_lim / Math.abs(sinT) : Infinity;
                 r = Math.min(r_x, r_y);
            }
            
            points.x.push(r * cosT); // Mx
            points.y.push(r * sinT); // My
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
            
            // GERAR SUPERFÍCIE MÍNIMA
            const minSurf = generateMinMomentSurface();
            pcalcData.resultados.minMomentSurface = minSurf;
            
            const results = [];
            pcalcData.esforcos.listaEsforcos.forEach((load, i) => {
                console.log(`Calculando caso de carga ${i+1}...`); 
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
        for(let z of surface.z) {
            if (z < minN) minN = z;
        }
        
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

    for(let i=0; i<surface.x.length; i++) {
        const pN = surface.z[i];
        if (Math.abs(pN - N) < toleranceN) {
            const pMx = surface.x[i];
            const pMy = surface.y[i];
            const R = Math.sqrt(pMx*pMx + pMy*pMy);
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
        const p2 = slicePoints[i+1];
        
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
            if (diff > Math.PI) diff = 2*Math.PI - diff;
            if (diff < minDiff) {
                minDiff = diff;
                R_res = p.r;
            }
        }
    }

    if (R_res === 0) return 0;
    return R_res / R_load;
}

// --- FUNÇÃO DE CÁLCULO DE CASO DE CARGA (ATUALIZADA) ---
function calculateLoadCase(load, index) {
    console.group(`Detalhes do Caso ${index + 1}`); 
    const gf = pcalcData.config.gamaF;
    let Nsd = load.n * gf;
    
    console.log(`Cargas de Entrada: N=${load.n}, MxTop=${load.mxTop}, MxBot=${load.mxBot}, MyTop=${load.myTop}, MyBot=${load.myBot}`);
    console.log(`Cargas de Cálculo (x${gf}): Nsd=${Nsd.toFixed(2)}`);
    
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

    console.log(`Excentricidade Mínima: ex_min=${e_min_x.toFixed(2)}cm, ey_min=${e_min_y.toFixed(2)}cm`);
    console.log(`Momentos Mínimos: M1d_min_x=${M1d_min_x.toFixed(2)}, M1d_min_y=${M1d_min_y.toFixed(2)}`);

    // Variáveis de Saída
    let Mtot_x = 0;
    let Mtot_y = 0;
    let M2d_x = 0;
    let M2d_y = 0;
    let info = "";

    // SELEÇÃO DO MÉTODO DE 2ª ORDEM
    if (pcalcData.config.calc2ndOrder && Nsd < 0) { 
        switch(method) {
            case 'curvature_approx': // Método 1 (Padrão)
                const res1 = calculateMethod1_CurvatureApprox(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, checkSlenderness);
                Mtot_x = res1.Mtot_x; Mtot_y = res1.Mtot_y; M2d_x = res1.M2d_x; M2d_y = res1.M2d_y; info = res1.info;
                break;
                
            case 'stiffness_approx': // Método 2
                const res2 = calculateMethod2_StiffnessApprox(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, checkSlenderness);
                Mtot_x = res2.Mtot_x; Mtot_y = res2.Mtot_y; M2d_x = res2.M2d_x; M2d_y = res2.M2d_y; info = res2.info;
                break;
                
            case 'standard_diagram': // Método 3
                const res3 = calculateMethod3_StandardDiagram(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, checkSlenderness);
                Mtot_x = res3.Mtot_x; Mtot_y = res3.Mtot_y; M2d_x = res3.M2d_x; M2d_y = res3.M2d_y; info = res3.info;
                break;
                
            case 'general_diagram': // Método 4 (Simplificado Uniaxial)
            case 'general_biaxial': // Método 5 (Biaxial)
                const isBiaxial = (method === 'general_biaxial');
                const resG = calculateMethodGeneral(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, isBiaxial);
                Mtot_x = resG.Mtot_x; Mtot_y = resG.Mtot_y; M2d_x = resG.M2d_x; M2d_y = resG.M2d_y; info = resG.info;
                break;
        }
    } else {
        // Sem 2ª Ordem
        console.log("Cálculo de 2ª ordem não necessário (N >= 0 ou desativado).");
        Mtot_x = Math.max(Math.abs(M1d_x_top), Math.abs(M1d_x_bot), M1d_min_x);
        Mtot_y = Math.max(Math.abs(M1d_y_top), Math.abs(M1d_y_bot), M1d_min_y);
        info = "1ª Ordem";
    }
    
    const safetyFactor = calculateSafetyFactor(Nsd, Mtot_x, Mtot_y);

    console.groupEnd();

    console.groupEnd()
    return {
        id: index,
        originalIndex: index + 1,
        Nsd: Nsd,
        Mx1Top: M1d_x_top,
        Mx1Bot: M1d_x_bot,
        My1Top: M1d_y_top,
        My1Bot: M1d_y_bot,
        MxTot: Mtot_x,  // ✅ Já vem com sinal correto dos métodos
        MyTot: Mtot_y,  // ✅ Já vem com sinal correto dos métodos
        M2dx: M2d_x,
        M2dy: M2d_y,
        safetyFactor: safetyFactor,
        info: info,
        status: "Calc"
    }
}

// --- AUXILIAR PARA LOGS PADRONIZADOS ---
function logMidSpanAnalysis(axisName, M1t, M1b, M2d, minM, finalMtot) {
    const M1_mid = (M1t + M1b) / 2;
    const M_mid_calc = Math.abs(M1_mid) + M2d;
    
    console.log(`[${axisName}] >>> ANÁLISE NO MEIO DO VÃO <<<`);
    console.log(`   > M1_top = ${M1t.toFixed(2)}, M1_bot = ${M1b.toFixed(2)}`);
    console.log(`   > M1_mid (1ª Ordem Real) = ${M1_mid.toFixed(2)} kNm`);
    console.log(`   > M2d (Acréscimo)        = ${M2d.toFixed(2)} kNm`);
    console.log(`   > M_mid_estimado (Soma)  = ${M_mid_calc.toFixed(2)} kNm`);
    console.log(`   > M_min (Mínimo Norma)   = ${minM.toFixed(2)} kNm [cite: NBR 6118]`);
    console.log(`   > M_final (Dimensionam.) = ${finalMtot.toFixed(2)} kNm`);
    console.log(`-------------------------------------------`);
}

// --- IMPLEMENTAÇÃO DOS MÉTODOS DE 2ª ORDEM ---

// Auxiliar: Cálculo de Alpha B e Esbeltez Limite
function calcAlphaAndLambda(Nsd, Ma, Mb, h, axisName) {
    const L = pcalcData.secao.length;
    const isPinned = pcalcData.secao.boundary === 'pinned';
    const Le = isPinned ? L : 2.0 * L;
    
    const lambda = 3.46 * Le / h;
    
    let alphaB = 0.6 + 0.4 * (Mb / Ma);
    if (alphaB < 0.4) alphaB = 0.4;
    
    // lambda1 = (25 + 12.5 * e1/h) / alphaB
    let e1_h = Math.abs(Ma) / Math.abs(Nsd) / (h/100); 
    let lambda1 = (25 + 12.5 * e1_h) / alphaB;
    if (lambda1 > 90) lambda1 = 90;
    if (lambda1 < 35) lambda1 = 35;
    
    console.log(`[${axisName}] AlphaB: Ma=${Ma.toFixed(2)}, Mb=${Mb.toFixed(2)}, alpha=${alphaB.toFixed(2)}`);
    console.log(`[${axisName}] Esbeltez: Lambda=${lambda.toFixed(2)}, Lambda1=${lambda1.toFixed(2)} (Le=${Le.toFixed(0)})`);
    
    return { alphaB, lambda, lambda1, Le };
}

function calculateMethod1_CurvatureApprox(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, checkSlender) {
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;
    const Ac = pcalcData.secao.areaAc;
    const fcd = (pcalcData.materiais.fck/10) / pcalcData.config.gamaC;
    
    const Max = Math.abs(M1xt) > Math.abs(M1xb) ? M1xt : M1xb
    const Mbx = Math.abs(M1xt) > Math.abs(M1xb) ? M1xb : M1xt
    const pX = calcAlphaAndLambda(Nsd, Max, Mbx, hy, "Eixo X")
    
    // Calcular M1d_eq COM SINAL
    let M1deqX = pX.alphaB * Max  // ✅ Preserva o sinal de Ma
    let Mtotx = Math.abs(M1deqX)  // Magnitude para cálculo
    let M2dx = 0
    
    if (!checkSlender || pX.lambda > pX.lambda1) {
        const nu = Math.abs(Nsd) / (Ac * fcd)
        let curvCalc = 0.005 / (hy * (nu + 0.5))
        let limit = 0.005 / hy
        let curv = Math.min(curvCalc, limit)
        M2dx = Math.abs(Nsd) * (pX.Le * pX.Le / 10) * curv / 100
        Mtotx += M2dx
        console.log(`[Eixo X] 2ª Ordem necessária. Nu=${nu.toFixed(3)}, Curv=${curv.toFixed(5)}`)
        console.log(`[Eixo X] M2d=${M2dx.toFixed(2)}, Mtot=${Mtotx.toFixed(2)}`)
    } else {
        console.log("[Eixo X] 2ª Ordem dispensada.")
    }
    
    Mtotx = Math.max(Mtotx, Math.abs(Max), MinX)
    
    // ✅ APLICAR O SINAL DO M1deq ao Mtotx final
    const signX = Math.sign(M1deqX) || 1
    Mtotx = Mtotx * signX

    // LOG MEIO DO VÃO X
    logMidSpanAnalysis("Eixo X", M1xt, M1xb, M2dx, MinX, Math.abs(Mtotx));
    
    // Eixo Y - mesma lógica
    const May = Math.abs(M1yt) > Math.abs(M1yb) ? M1yt : M1yb
    const Mby = Math.abs(M1yt) > Math.abs(M1yb) ? M1yb : M1yt
    const pY = calcAlphaAndLambda(Nsd, May, Mby, hx, "Eixo Y")
    
    let M1deqY = pY.alphaB * May  // ✅ Preserva o sinal
    let Mtoty = Math.abs(M1deqY)
    let M2dy = 0
    
    if (!checkSlender || pY.lambda > pY.lambda1) {
        const nu = Math.abs(Nsd) / (Ac * fcd)
        let curvCalc = 0.005 / (hx * (nu + 0.5))
        let limit = 0.005 / hx
        let curv = Math.min(curvCalc, limit)
        M2dy = Math.abs(Nsd) * (pY.Le * pY.Le / 10) * curv / 100
        Mtoty += M2dy
        console.log(`[Eixo Y] 2ª Ordem necessária. Nu=${nu.toFixed(3)}, Curv=${curv.toFixed(5)}`)
        console.log(`[Eixo Y] M2d=${M2dy.toFixed(2)}, Mtot=${Mtoty.toFixed(2)}`)
    } else {
        console.log("[Eixo Y] 2ª Ordem dispensada.")
    }
    
    Mtoty = Math.max(Mtoty, Math.abs(May), MinY)
    
    // ✅ APLICAR O SINAL DO M1deq ao Mtoty final
    const signY = Math.sign(M1deqY) || 1
    Mtoty = Mtoty * signY

    // LOG MEIO DO VÃO Y
    logMidSpanAnalysis("Eixo Y", M1yt, M1yb, M2dy, MinY, Math.abs(Mtoty));
    
    return { Mtot_x: Mtotx, Mtot_y: Mtoty, M2d_x: M2dx, M2d_y: M2dy, info: "Curvatura Aprox." }
}


function calculateMethod2_StiffnessApprox(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, checkSlender) {
    // Implementação da Rigidez Nominal (NBR 6118 - Método do Pilar Padrão com Rigidez Aproximada)
    // EI = 0.3 * Eci * Ic + Es * Is
    
    const hx = pcalcData.secao.hx / 100; // converter para m
    const hy = pcalcData.secao.hy / 100;
    const Eci = 5600 * Math.sqrt(pcalcData.materiais.fck) * 1000; // MPa -> kPa
    const Es = pcalcData.materiais.es * 1000000; // GPa -> kPa
    
    // Inércia Bruta do Concreto
    const Ic_x = (hx * Math.pow(hy, 3)) / 12; // Eixo X gira em torno de X (altura hy)
    const Ic_y = (hy * Math.pow(hx, 3)) / 12; // Eixo Y gira em torno de Y (altura hx)
    
    // Inércia da Armadura (Is)
    let Is_x = 0;
    let Is_y = 0;
    const xm = pcalcData.secao.hx / 2;
    const ym = pcalcData.secao.hy / 2;
    
    pcalcData.armacao.barras.forEach(b => {
        const area = Math.PI * Math.pow((b.diametro/10)/2, 2) / 10000; // cm² -> m²
        const distY = (b.y - ym) / 100; // distância vertical ao centro (para Ix)
        const distX = (b.x - xm) / 100; // distância horizontal ao centro (para Iy)
        Is_x += area * distY * distY;
        Is_y += area * distX * distX;
    });

    // Rigidez Equivalente
    const EI_x = 0.3 * Eci * Ic_x + Es * Is_x;
    const EI_y = 0.3 * Eci * Ic_y + Es * Is_y;

    const solveAxis = (M1t, M1b, h_dim, EI_val, minM, axisName) => {
        const Ma = Math.abs(M1t) >= Math.abs(M1b) ? M1t : M1b;
        const Mb = Math.abs(M1t) >= Math.abs(M1b) ? M1b : M1t;
        const p = calcAlphaAndLambda(Nsd, Ma, Mb, h_dim * 100, axisName);
        
        let Mtot = Math.abs(Ma);
        let M2d = 0;

        console.log(`[${axisName}] --- INÍCIO CÁLCULO RIGIDEZ ---`);
        
        if (!checkSlender || p.lambda > p.lambda1) {
            // Carga Crítica de Flambagem
            const Le = p.Le / 100; // m
            const Nb = (Math.PI * Math.PI * EI_val) / (Le * Le);
            
            // Momento Equivalente (NBR 6118)
            const M1d_eq = Math.max(0.6 * Math.abs(Ma) + 0.4 * Math.abs(Mb), 0.4 * Math.abs(Ma));
            
            // Amplificação
            if (Math.abs(Nsd) >= Nb) {
                Mtot = 9999; // Instabilidade
                console.log(`[${axisName}] INSTABILIDADE: Nsd (${Math.abs(Nsd).toFixed(0)}) >= Nb (${Nb.toFixed(0)})`);
            } else {
                const alpha = 1 / (1 - Math.abs(Nsd)/Nb);
                Mtot = M1d_eq * alpha;
                M2d = Mtot - M1d_eq;
                
                console.log(`[${axisName}] Rigidez Nominal:`);
                console.log(`   > Nb (Carga Crítica) = ${Nb.toFixed(1)} kN`);
                console.log(`   > M1d_eq (Equivalente) = ${M1d_eq.toFixed(2)} kNm`);
                console.log(`   > Alpha (Amplificação) = ${alpha.toFixed(3)}`);
            }
        } else {
             console.log(`[${axisName}] Esbeltez baixa (${p.lambda.toFixed(1)} < ${p.lambda1.toFixed(1)}). 2ª Ordem dispensada.`);
        }
        
        // O Momento Total de Dimensionamento deve respeitar o Mínimo e o topo/base
        const finalMtot = Math.max(Mtot, Math.abs(Ma), minM);
        
        // LOG MEIO DO VÃO
        logMidSpanAnalysis(axisName, M1t, M1b, M2d, minM, finalMtot);

        // Recalcular M2d efetivo para plotagem (diferença entre Final e 1ª ordem máx)
        const effectiveM2d = Math.max(0, finalMtot - Math.abs(Ma));

        return { Mtot: finalMtot, M2d: effectiveM2d };
    };

    const resX = solveAxis(M1xt, M1xb, hy, EI_x, MinX, "Eixo X");
    const resY = solveAxis(M1yt, M1yb, hx, EI_y, MinY, "Eixo Y");

    return { 
        Mtot_x: resX.Mtot, 
        Mtot_y: resY.Mtot, 
        M2d_x: resX.M2d, 
        M2d_y: resY.M2d, 
        info: "Rigidez Nominal (NBR)" 
    };
}

function calculateMethod3_StandardDiagram(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, checkSlender) {
    const Ac = pcalcData.secao.areaAc;
    const fcd = (pcalcData.materiais.fck/10) / pcalcData.config.gamaC;
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;

    const solveAxis = (M1t, M1b, h, minM, axisName) => {
        const Ma = Math.abs(M1t) >= Math.abs(M1b) ? M1t : M1b;
        const Mb = Math.abs(M1t) >= Math.abs(M1b) ? M1b : M1t;
        const p = calcAlphaAndLambda(Nsd, Ma, Mb, h, axisName);
        
        let Mtot = Math.max(0.6 * Math.abs(Ma) + 0.4 * Math.abs(Mb), 0.4 * Math.abs(Ma));
        let M2d = 0;

        if (!checkSlender || p.lambda > p.lambda1) {
            console.log(`[${axisName}] Iniciando iteração de rigidez real...`);
            // Iteração para encontrar rigidez secante no diagrama
            let M_curr = Mtot;
            for(let i=0; i<5; i++) {
                // Encontrar curvatura k para o par (Nsd, M_curr)
                // Assumindo eixo desacoplado para método padrão
                let k = 0;
                if (h === hy) k = solveCurvature(Nsd, M_curr, 0).kx; // Eixo X (M gira em torno de X)
                else k = solveCurvature(Nsd, 0, M_curr).ky; // Eixo Y
                
                if (Math.abs(k) < 1e-6) k = 1e-6;
                const EIsec = Math.abs(M_curr / k); // kNm²
                
                // Mtot = M1d / (1 - Nsd/Nb)
                const Nb = (Math.PI*Math.PI * EIsec) / (p.Le*p.Le);
                if (Math.abs(Nsd) >= Nb) { M_curr = 9999; console.log(`[${axisName}] Instabilidade na iteração ${i+1}`); break; }
                
                const factor = 1 / (1 - Math.abs(Nsd)/Nb);
                const M_new = Math.max(0.6 * Math.abs(Ma) + 0.4 * Math.abs(Mb), 0.4 * Math.abs(Ma)) * factor;
                
                console.log(`[${axisName}] Iter ${i}: M=${M_curr.toFixed(2)}, k=${k.toFixed(6)}, EI=${EIsec.toFixed(0)}, Nb=${Nb.toFixed(0)}, M_new=${M_new.toFixed(2)}`);
                M_curr = M_new;
            }
            Mtot = M_curr;
            M2d = Mtot - Math.abs(Ma);
        }
        
        const finalMtot = Math.max(Mtot, Math.abs(Ma), minM);
        
        // LOG MEIO DO VÃO
        logMidSpanAnalysis(axisName, M1t, M1b, M2d, minM, finalMtot);

        return { M: finalMtot, M2: M2d };
    };

    const rx = solveAxis(M1xt, M1xb, hy, MinX, "Eixo X");
    const ry = solveAxis(M1yt, M1yb, hx, MinY, "Eixo Y");

    return { Mtot_x: rx.M, Mtot_y: ry.M, M2d_x: rx.M2, M2d_y: ry.M2, info: "Pilar-Padrão Real" };
}

function calculateMethodGeneral(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, isBiaxial) {
    const L = pcalcData.secao.length;
    const isPinned = pcalcData.secao.boundary === 'pinned';
    const numNodes = 7; // Discretização do pilar
    const dz = L / (numNodes - 1);
    
    console.log(`[Geral] Iniciando iteração numérica (${isBiaxial ? "Biaxial" : "Uniaxial"}). L=${L}, Nos=${numNodes}`);
    
    // Arrays de estado
    let w_x = new Array(numNodes).fill(0); // Deslocamento na direção Y (gera Mx)
    let w_y = new Array(numNodes).fill(0); // Deslocamento na direção X (gera My)
    
    let Mtot_x = 0, Mtot_y = 0;
    
    // Loop Iterativo
    for (let iter = 0; iter < 10; iter++) {
        let max_w_diff = 0;
        let w_x_new = new Array(numNodes).fill(0);
        let w_y_new = new Array(numNodes).fill(0);
        let kx_vals = [], ky_vals = [];

        // 1. Calcular Momentos Totais e Curvaturas
        for (let i = 0; i < numNodes; i++) {
            const z = i * dz;
            // Momento de 1ª ordem interpolado
            let M1x = 0, M1y = 0;
            if (isPinned) {
                M1x = M1xb + (M1xt - M1xb) * (z/L);
                M1y = M1yb + (M1yt - M1yb) * (z/L);
            } else { // Balanço (Base engastada em z=0)
                M1x = M1xb * (1 - z/L); // Simplificado linear
                M1y = M1yb * (1 - z/L);
            }
            
            // Momento Total
            let M_curr_x = M1x + Math.abs(Nsd) * w_x[i];
            let M_curr_y = M1y + Math.abs(Nsd) * w_y[i];
            
            // Limite mínimo
            if (Math.abs(M_curr_x) < MinX) M_curr_x = Math.sign(M_curr_x||1) * MinX;
            if (Math.abs(M_curr_y) < MinY) M_curr_y = Math.sign(M_curr_y||1) * MinY;

            // Obter curvatura
            let k;
            if (isBiaxial) {
                k = solveCurvature(Nsd, M_curr_x, M_curr_y);
            } else {
                // Desacoplado: chama 2 vezes considerando o outro zero
                const kx = solveCurvature(Nsd, M_curr_x, 0).kx;
                const ky = solveCurvature(Nsd, 0, M_curr_y).ky;
                k = { kx, ky };
            }
            kx_vals.push(k.kx);
            ky_vals.push(k.ky);
        }

        // 2. Integrar Curvatura para achar deflexão w
        const integrate = (k_vals) => {
            let deflections = new Array(numNodes).fill(0);
            if (isPinned) {
                let d_int = 0; 
                let s_int = 0; 
                for (let i = 0; i < numNodes; i++) {
                    const k_avg = (i==0) ? 0 : (k_vals[i] + k_vals[i-1])/2;
                    if (i>0) {
                        s_int += k_avg * dz;
                        d_int += s_int * dz - (k_avg * dz * dz / 2);
                    }
                }
                const theta_0 = d_int / L;
                s_int = 0; d_int = 0;
                for (let i = 0; i < numNodes; i++) {
                    if (i > 0) {
                        const k_avg = (k_vals[i] + k_vals[i-1])/2;
                        s_int += k_avg * dz;
                        d_int += s_int * dz; 
                    }
                    deflections[i] = theta_0 * (i*dz) - d_int;
                }
            } else {
                let s_int = 0; let d_int = 0;
                for (let i = 0; i < numNodes; i++) {
                    if (i > 0) {
                        const k_avg = (k_vals[i] + k_vals[i-1])/2;
                        s_int += k_avg * dz;
                        d_int += s_int * dz;
                    }
                    deflections[i] = d_int;
                }
            }
            return deflections;
        };

        w_x_new = integrate(kx_vals); 
        w_y_new = integrate(ky_vals);

        // Check convergence
        for(let i=0; i<numNodes; i++) {
            max_w_diff = Math.max(max_w_diff, Math.abs(w_x_new[i] - w_x[i]), Math.abs(w_y_new[i] - w_y[i]));
        }
        w_x = w_x_new;
        w_y = w_y_new;
        
        if (iter === 0 || iter === 9 || max_w_diff < 0.01) {
             console.log(`[Geral] Iter ${iter+1}: Max Diff=${max_w_diff.toFixed(4)} cm`);
        }
        
        if (max_w_diff < 0.01) break; 
    }
    
    // Calcular momentos finais máximos
    Mtot_x = 0; Mtot_y = 0;
    for (let i = 0; i < numNodes; i++) {
        const z = i * dz;
        let M1x = isPinned ? M1xb + (M1xt - M1xb) * (z/L) : M1xb * (1 - z/L);
        let M1y = isPinned ? M1yb + (M1yt - M1yb) * (z/L) : M1yb * (1 - z/L);
        
        let Mx = Math.abs(M1x) + Math.abs(Nsd * w_x[i]);
        let My = Math.abs(M1y) + Math.abs(Nsd * w_y[i]);
        
        if (Mx > Mtot_x) Mtot_x = Mx;
        if (My > Mtot_y) Mtot_y = My;
    }
    const finalMtotX = Math.max(Mtot_x, MinX);
    const finalMtotY = Math.max(Mtot_y, MinY);

    // Calc M2d aproximado para o Log
    const M2d_x_log = Mtot_x - Math.max(Math.abs(M1xt), Math.abs(M1xb));
    const M2d_y_log = Mtot_y - Math.max(Math.abs(M1yt), Math.abs(M1yb));

    // LOG MEIO DO VÃO
    logMidSpanAnalysis("Eixo X", M1xt, M1xb, M2d_x_log, MinX, finalMtotX);
    logMidSpanAnalysis("Eixo Y", M1yt, M1yb, M2d_y_log, MinY, finalMtotY);

    return { 
        Mtot_x: finalMtotX, 
        Mtot_y: finalMtotY, 
        M2d_x: finalMtotX - Math.max(Math.abs(M1xt), Math.abs(M1xb)), 
        M2d_y: finalMtotY - Math.max(Math.abs(M1yt), Math.abs(M1yb)), 
        info: isBiaxial ? "Geral Biaxial" : "Geral" 
    };
}

// Auxiliar: Encontrar curvatura para (N, Mx, My)
// Usa Newton-Raphson simplificado ou busca direta
function solveCurvature(targetN, targetMx, targetMy) {
    // 1. Estimar deformação média (eps0) baseada em N
    // N = Ac * fcd * eps0 (linear approx inicial)
    let e0 = -0.001; // Chute inicial compressão
    let kx = 0;
    let ky = 0;
    
    // Loop simples para ajustar e0 para equilibrar N (mantendo k=0)
    for(let i=0; i<5; i++) {
        const res = calculateSectionResistance(e0, 0, 0);
        const dN = res.N - targetN;
        // Rigidez axial aprox: Ac * Ecs
        const EA = pcalcData.secao.areaAc * (5600 * Math.sqrt(pcalcData.materiais.fck) * 0.85 / 10); 
        e0 = e0 - dN / EA;
    }
    
    // Agora ajustar kx e ky para equilibrar Momentos (assumindo linearidade local)
    // M = EI * k
    // EI estimado bruto
    const Ecs = 5600 * Math.sqrt(pcalcData.materiais.fck) * 0.85 / 10;
    const EIx = Ecs * pcalcData.secao.ix;
    const EIy = Ecs * pcalcData.secao.iy;
    
    kx = targetMx / (0.4 * EIx); // Chute secante 0.4 EI
    ky = targetMy / (0.4 * EIy);
    
    // Refinamento iterativo (Método da Secante 2D simplificado)
    for (let i = 0; i < 8; i++) {
        const res = calculateSectionResistance(e0, kx, ky);
        
        // Ajustar e0
        const dN = res.N - targetN;
        // Recalcula rigidez axial tangente (aprox)
        const EA = Math.abs(dN/0.0001) || (pcalcData.secao.areaAc * Ecs);
        e0 = e0 - dN / EA;
        
        // Ajustar kx
        const dMx = res.Mx - targetMx;
        // Rigidez flexão tangente aprox
        // Se momento aumentou muito com pouco k, rigidez alta.
        // k_new = k_old - dM / EI_tang
        // Usar EI secante atual como estimador
        const EIx_sec = (Math.abs(kx) > 1e-7) ? res.Mx / kx : EIx;
        kx = kx - dMx / (Math.abs(EIx_sec) || EIx);
        
        // Ajustar ky
        const dMy = res.My - targetMy;
        const EIy_sec = (Math.abs(ky) > 1e-7) ? res.My / ky : EIy;
        ky = ky - dMy / (Math.abs(EIy_sec) || EIy);
    }
    
    return { kx, ky, e0 };
}

function renderResultsTable() {
    const tbody = document.getElementById('results-table').getElementsByTagName('tbody')[0];
    tbody.innerHTML = '';
    // Os resultados já foram ordenados no performCalculation
    pcalcData.resultados.loadCases.forEach((res, i) => {
        const row = tbody.insertRow();
        // Destaque para a linha selecionada
        const isSelected = canvasView.selectedCaseIndex === i;
        row.className = `hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b dark:border-gray-700 transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`;
        
        // Ao clicar, atualizar a visualização
        row.onclick = () => {
            canvasView.selectedCaseIndex = i;
            renderElevation(i);
            renderResultsTable(); // Re-renderizar para atualizar o destaque
            // Atualizar 3D com o novo ponto em destaque? Sim, se quisermos
            render3DChart(); 
        };
        
        // Formatando FS para mostrar na tabela
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
                ${isSelected ? '👁️' : 'Ver'}
            </td>
        `;
    });
}

function render3DChart() {
    const chartDiv = document.getElementById('chart3d');
    if(!chartDiv) return;
    
    chartDiv.innerHTML = '';
    
    const { x, y, z } = pcalcData.resultados.surfacePoints;
    const loadCases = pcalcData.resultados.loadCases;
    const minSurf = pcalcData.resultados.minMomentSurface; // Dados do momento mínimo
    
    // Cores dinâmicas
    const dark = isDark();
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
    
    // --- NOVA TRACE: Superfície de Momento Mínimo ---
    const minSurfTrace = {
        type: 'mesh3d',
        x: minSurf.x, y: minSurf.y, z: minSurf.z,
        opacity: 0.15,
        color: '#facc15', // Amarelo
        name: 'Momento Mínimo',
        alphahull: 0,
        lighting: { ambient: 0.5, diffuse: 0.6 }
    };
    
    // Separar o caso selecionado dos outros para destaque
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
        marker: { size: 6, color: '#22c55e', symbol: 'diamond', line: {width: 2, color: '#ffffff'} },
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
    
    Plotly.newPlot('chart3d', data, layout, {responsive: true});
}

function renderElevation(caseIndex) {
    const containerN = document.getElementById('elevation-plot-n');
    const containerMx = document.getElementById('elevation-plot-mx');
    const containerMy = document.getElementById('elevation-plot-my');
    
    if (!containerN || !containerMx || !containerMy) return;
    
    const placeholder = document.getElementById('elevation-placeholder');
    if(placeholder) placeholder.style.display = 'none';
    
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
    
    // Envelope Mínimo
    const mxMinLine = [];
    const myMinLine = [];
    // Recalcular Mínimo para exibição (aprox)
    const e_min_x = 1.5 + 0.03 * pcalcData.secao.hy;
    const e_min_y = 1.5 + 0.03 * pcalcData.secao.hx;
    const Md_min_x = Math.abs(loadCase.Nsd) * (e_min_x / 100);
    const Md_min_y = Math.abs(loadCase.Nsd) * (e_min_y / 100);

    const M1xtop = loadCase.Mx1Top;
    const M1xbot = loadCase.Mx1Bot;
    const M1ytop = loadCase.My1Top;
    const M1ybot = loadCase.My1Bot;
    
    const isPinned = pcalcData.secao.boundary === 'pinned';
    const N_val = loadCase.Nsd; 

    for(let i=0; i<=points; i++) {
        const pos = i / points; 
        const height = pos * L; 
        z.push(height);
        
        normal.push(N_val); 
        mxMinLine.push(Md_min_x); // Linha reta do mínimo
        myMinLine.push(Md_min_y);

        const m1x_curr = M1xbot + (M1xtop - M1xbot) * pos;
        const m1y_curr = M1ybot + (M1ytop - M1ybot) * pos;
        
        mx1.push(m1x_curr);
        my1.push(m1y_curr);
        
        // Visualização do efeito de 2ª ordem físico (senoidal simplificado)
        const m2x_mag = loadCase.M2dx || 0;
        const m2y_mag = loadCase.M2dy || 0;
        
        // Sinal baseado na curvatura predominante
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
    
    const dark = typeof isThemeDark === 'function' ? isThemeDark() : false;
    const plotBgColor = dark ? '#1f2937' : '#f3f4f6';
    const lineColor = dark ? '#e5e7eb' : '#000000';
    const dashedLineColor = dark ? '#9ca3af' : '#6b7280';
    const minLineColor = '#ef4444'; // Vermelho para envelope mínimo
    const fontColor = dark ? '#9ca3af' : '#374151';
    const fillColor = dark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.15)'; // Blue tint

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

    // Plot N
    const traceN = { x: normal, y: z, type: 'scatter', mode: 'lines', fill: 'tozerox', line: { color: lineColor, width: 2 }, fillcolor: fillColor };
    Plotly.newPlot('elevation-plot-n', [traceN], { ...commonLayout, title: { text: 'Nsd (kN)', font: {size: 11, weight: 'bold', color: fontColor} } }, {displayModeBar: false});
    
    // Helper para Plotar M
    const plotMoment = (divId, tTot, t1, tMin, title) => {
        Plotly.newPlot(divId, [
            { x: tMin, y: z, type: 'scatter', mode: 'lines', line: { color: minLineColor, width: 1, dash: 'dot' }, name: 'Mínimo (+)' },
            { x: tMin.map(v => -v), y: z, type: 'scatter', mode: 'lines', line: { color: minLineColor, width: 1, dash: 'dot' }, name: 'Mínimo (-)' },
            { x: t1, y: z, type: 'scatter', mode: 'lines', line: { color: dashedLineColor, width: 1, dash: 'dash' }, name: '1ª Ordem' },
            { x: tTot, y: z, type: 'scatter', mode: 'lines', fill: 'tozerox', line: { color: lineColor, width: 2 }, fillcolor: fillColor, name: 'Total' }
        ], { ...commonLayout, title: { text: title, font: {size: 11, weight: 'bold', color: fontColor} } }, {displayModeBar: false});
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
        // Estilos para sobreposição, com fundo translúcido e borda suave
        statsDiv.className = 'absolute top-2 left-2 bg-white/80 dark:bg-gray-800/80 p-2 rounded border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 pointer-events-none shadow-sm backdrop-blur-sm z-10';
        container.appendChild(statsDiv);
    }

    // Cálculos
    const { hx, hy, length, boundary, areaAc } = pcalcData.secao;
    const { fck } = pcalcData.materiais;
    const { barras } = pcalcData.armacao;

    // As total
    let As = 0;
    if (barras) {
        barras.forEach(b => {
            As += Math.PI * Math.pow((b.diametro / 10) / 2, 2);
        });
    }

    // Taxa de armadura (%)
    const rho = (areaAc > 0) ? (As / areaAc) * 100 : 0;

    // Esbeltez
    const Le = (boundary === 'pinned') ? length : 2 * length;
    // CORREÇÃO: lamX usa hy, lamY usa hx
    const lamX = (hy > 0) ? (3.46 * Le) / hy : 0;
    const lamY = (hx > 0) ? (3.46 * Le) / hx : 0;

    // Render HTML
    statsDiv.innerHTML = `
        <div class="font-bold mb-1 border-b border-gray-300 dark:border-gray-600 pb-1">Propriedades</div>
        <div class="mb-1">Taxa de armadura = <span class="font-bold text-blue-600 dark:text-blue-400">${rho.toFixed(2)} %</span></div>
        <div class="mb-1">Índice de Esbeltez:</div>
        <div class="pl-2">λx = <span class="font-bold">${lamX.toFixed(0)}</span></div>
        <div class="pl-2">λy = <span class="font-bold">${lamY.toFixed(0)}</span></div>
        <div class="mt-1 pt-1 border-t border-gray-300 dark:border-gray-600">Concreto: fck = <span class="font-bold">${fck} MPa</span></div>
    `;
}

function renderCrossSection() {
    const ctx = sectionCanvas.getContext('2d');
    
    ctx.setTransform(1, 0, 0, 1, 0, 0); 
    ctx.clearRect(0, 0, sectionCanvas.width, sectionCanvas.height);
    
    ctx.save();
    ctx.translate(sectionCanvas.width/2, sectionCanvas.height/2);
    
    const currentScale = canvasView.scale * canvasView.baseScale;
    ctx.scale(currentScale, -currentScale);
    
    const { hx, hy } = pcalcData.secao;

    // Cores Dinâmicas
    const dark = typeof isThemeDark === 'function' ? isThemeDark() : false;
    const concreteFill = dark ? '#374151' : '#e5e7eb'; // Gray-700 : Gray-200
    const concreteStroke = dark ? '#94a3b8' : '#64748b'; // Slate-400 : Slate-500
    const rebarFill = '#dc2626';
    const rebarStroke = dark ? '#fca5a5' : '#7f1d1d';
    const axisColor = '#3b82f6';

    ctx.fillStyle = concreteFill; 
    ctx.strokeStyle = concreteStroke; 
    ctx.lineWidth = 2 / currentScale; 
    
    if (pcalcData.secao.tipoSecao === 'Retangular') {
        ctx.fillRect(-hx/2, -hy/2, hx, hy);
        ctx.strokeRect(-hx/2, -hy/2, hx, hy);
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, hx/2, 0, 2*Math.PI);
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
            const rad = (b.diametro/10) / 2;
            
            ctx.beginPath();
            ctx.arc(bx, by, rad, 0, 2*Math.PI);
            ctx.fill();
            ctx.stroke();
        }
    }
    
    ctx.beginPath();
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1 / currentScale;
    ctx.moveTo(0, 0); ctx.lineTo(hx/2, 0); 
    ctx.moveTo(0, 0); ctx.lineTo(0, hy/2); 
    ctx.stroke();

    // --- DIMENSIONS ---
    const dimColor = dark ? '#94a3b8' : '#475569';
    ctx.fillStyle = dimColor;
    ctx.strokeStyle = dimColor;
    ctx.lineWidth = 1 / currentScale;
    
    const offset = 15 / currentScale; // Distance from section
    const tickLen = 5 / currentScale; // Tick length
    
    // Draw HX (Bottom)
    const yDimX = -hy/2 - offset;
    ctx.beginPath();
    // Extension lines
    ctx.moveTo(-hx/2, -hy/2 - 2/currentScale); ctx.lineTo(-hx/2, yDimX - tickLen);
    ctx.moveTo(hx/2, -hy/2 - 2/currentScale); ctx.lineTo(hx/2, yDimX - tickLen);
    // Main line
    ctx.moveTo(-hx/2, yDimX); ctx.lineTo(hx/2, yDimX);
    // Ticks (Diagonal /)
    ctx.moveTo(-hx/2 - tickLen, yDimX - tickLen); ctx.lineTo(-hx/2 + tickLen, yDimX + tickLen);
    ctx.moveTo(hx/2 - tickLen, yDimX - tickLen); ctx.lineTo(hx/2 + tickLen, yDimX + tickLen);
    ctx.stroke();
    
    // Draw HY (Left)
    const xDimY = -hx/2 - offset;
    ctx.beginPath();
    // Extension lines
    ctx.moveTo(-hx/2 - 2/currentScale, -hy/2); ctx.lineTo(xDimY - tickLen, -hy/2);
    ctx.moveTo(-hx/2 - 2/currentScale, hy/2); ctx.lineTo(xDimY - tickLen, hy/2);
    // Main line
    ctx.moveTo(xDimY, -hy/2); ctx.lineTo(xDimY, hy/2);
    // Ticks
    ctx.moveTo(xDimY - tickLen, -hy/2 - tickLen); ctx.lineTo(xDimY + tickLen, -hy/2 + tickLen);
    ctx.moveTo(xDimY - tickLen, hy/2 - tickLen); ctx.lineTo(xDimY + tickLen, hy/2 + tickLen);
    ctx.stroke();
    
    // Text
    ctx.save();
    ctx.scale(1, -1); // Flip Y so text isn't upside down
    const fontSize = 14 / currentScale;
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    
    // Text HX
    ctx.textBaseline = 'top';
    ctx.fillText(`${hx} cm`, 0, -yDimX + 2/currentScale);
    
    // Text HY
    ctx.save();
    ctx.translate(xDimY - 2/currentScale, 0);
    ctx.rotate(-Math.PI/2);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${hy} cm`, 0, 0);
    ctx.restore();
    
    ctx.restore(); // End text flip

    ctx.restore();

    // Atualizar stats sempre que renderizar
    updateSectionStats();
}