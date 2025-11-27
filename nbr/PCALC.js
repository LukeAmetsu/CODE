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
        method2ndOrder: 'curvature', 
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

// --- INJEÇÃO DE UI DINÂMICA ---
function injectDynamicUI() {
    const criteriaContainer = document.getElementById('criteria-container');
    if (criteriaContainer) {
        criteriaContainer.innerHTML = `
            <div class="space-y-4">
                <!-- Método de 2ª Ordem -->
                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded border dark:border-gray-700">
                    <label class="block text-xs font-bold mb-3 text-gray-700 dark:text-gray-300">Método de Cálculo de 2ª Ordem:</label>
                    <div class="space-y-2">
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="stiffness" class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">Rigidez Nominal (κ)</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 p-1 rounded">
                            <input type="radio" name="method-2nd" value="curvature" checked class="text-blue-600 focus:ring-blue-500">
                            <span class="text-xs text-gray-600 dark:text-gray-400">Curvatura Nominal (1/r) - Padrão</span>
                        </label>
                    </div>
                </div>

                <!-- Verificações -->
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
    const margin = 40; 
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
    pcalcData.config.method2ndOrder = methodEl ? methodEl.value : 'stiffness';
    
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

// 1. Discretização da Seção (Alta Resolução)
function discretizeSection() {
    pcalcData.resultados.secaoC = [];
    const { hx, hy, tipoSecao } = pcalcData.secao;
    // Aumentar resolução para 40x40 para garantir contorno suave e preciso
    const nX = 40; 
    const nY = 40;
    
    const dx = hx / nX;
    const dy = hy / nY;
    const dA = dx * dy;
    
    // Origem no centróide da seção (0,0)
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
        // Varredura retangular filtrada é mais robusta que polar simples para integração
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

// 2. Lei Constitutiva do Concreto (NBR 6118 - Parábola-Retângulo)
function getConcreteStress(epsilon, fcd) {
    // Epsilon negativo = compressão
    if (epsilon >= 0) return 0;
    
    const ec = Math.abs(epsilon);
    const ec2 = 0.002;
    const ecu = 0.0035; // Considerando fck <= 50MPa
    
    if (ec <= ec2) {
        return -0.85 * fcd * (1 - Math.pow(1 - ec/ec2, 2)); // Tensão negativa
    } else if (ec <= ecu) {
        return -0.85 * fcd;
    }
    return 0; // Ruptura (0 tensão)
}

// 3. Lei Constitutiva do Aço (Elasto-Plástico Perfeito)
function getSteelStress(epsilon, fyd, Es) {
    const sigma = epsilon * Es; // MPa
    if (sigma > fyd) return fyd;     // Tração máxima
    if (sigma < -fyd) return -fyd;   // Compressão máxima
    return sigma;
}

// 4. Integração de Esforços na Seção
function calculateSectionResistance(epsilon0, curvatureX, curvatureY) {
    const fcd = (pcalcData.materiais.fck / 10) / pcalcData.config.gamaC; // kN/cm²
    const fyd = (pcalcData.materiais.fyk / 10) / pcalcData.config.gamaS; // kN/cm²
    const Es = pcalcData.materiais.es * 100; // kN/cm²
    
    let N_int = 0;  // kN
    let Mx_int = 0; // kNm 
    let My_int = 0; // kNm 
    
    // Concreto
    for (const fiber of pcalcData.resultados.secaoC) {
        // e = e0 + kx*y + ky*x
        const strain = epsilon0 + curvatureX * fiber.y + curvatureY * fiber.x;
        const sigma = getConcreteStress(strain, fcd); 
        if (sigma !== 0) {
            const dF = sigma * fiber.dA; 
            N_int += dF;
            Mx_int += dF * (fiber.y / 100); 
            My_int += dF * (fiber.x / 100); 
        }
    }
    
    // Aço
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

// 5. Geração da Superfície de Interação (Varredura Radial REAL)
function generateInteractionSurface() {
    const points = { x: [], y: [], z: [] };
    
    const ecu = -0.0035; // Compressão max concreto
    const es_yield_tension = 0.010; // Limite alongamento aço (D2)
    
    // AUMENTAR RESOLUÇÃO PARA MELHORAR CÁLCULO DO FS
    const numAngles = 72; // Antes 36
    
    for (let i = 0; i < numAngles; i++) {
        const theta = (i / numAngles) * 2 * Math.PI;
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        
        // 1. Encontrar os extremos da seção na direção theta
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
        
        // AUMENTAR NÚMERO DE PASSOS NOS DOMÍNIOS
        const stepsD2 = 15; // Antes 8
        deformationStates.push({ k: 0, e0: es_yield_tension });
        
        for (let k = 1; k <= stepsD2; k++) {
            const eps_t = es_yield_tension;
            const eps_c = es_yield_tension + (k/stepsD2) * (ecu - es_yield_tension);
            const K = (eps_c - eps_t) / (u_max - u_min);
            const e0 = eps_t - K * u_min;
            deformationStates.push({ k: K, e0: e0 });
        }
        
        const stepsD34 = 20; // Antes 12
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

function performCalculation() {
    const btn = document.getElementById('calculate-btn');
    const msg = document.getElementById('feedback-message');
    
    console.log("--- Iniciando Cálculo ---"); // Log start

    btn.disabled = true;
    msg.textContent = 'Calculando...';
    msg.className = 'text-center text-blue-600 text-xs mt-2 font-medium';

    setTimeout(() => {
        try {
            discretizeSection();
            console.log("Seção discretizada com sucesso."); // Log

            const surface = generateInteractionSurface();
            console.log("Superfície de interação gerada."); // Log
            pcalcData.resultados.surfacePoints = surface;
            
            const results = [];
            pcalcData.esforcos.listaEsforcos.forEach((load, i) => {
                console.log(`Calculando caso de carga ${i+1}...`); // Log per case
                results.push(calculateLoadCase(load, i));
            });
            pcalcData.resultados.loadCases = results.sort((a, b) => a.safetyFactor - b.safetyFactor); // Ordenar por FS (crescente - pior caso primeiro)

            render3DChart();
            renderResultsTable();
            // Renderizar o primeiro caso (pior FS) por padrão
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

// --- NOVA FUNÇÃO: Calcular Fator de Segurança Aproximado (MELHORADA) ---
function calculateSafetyFactor(N, Mx, My) {
    // 1. Casos triviais (Cargas muito baixas)
    // Se N for pequeno E momentos pequenos, FS alto
    // Mas se N for grande (compressão pura), FS pode ser baixo.
    if (Math.abs(Mx) < 0.1 && Math.abs(My) < 0.1) {
        // Verificar compressão pura
        const surface = pcalcData.resultados.surfacePoints;
        if (surface.z.length === 0) return 0;
        
        // Encontrar N_rd_max (compressão máxima na superfície)
        // Assumindo que o menor N (mais negativo) na superfície é a resistência máxima à compressão
        let minN = 0;
        for(let z of surface.z) {
            if (z < minN) minN = z;
        }
        
        if (N === 0) return 99.99;
        
        // FS = N_rd / N_sd. (Ambos negativos)
        return Math.abs(minN) / Math.abs(N);
    }

    const R_load = Math.sqrt(Mx * Mx + My * My);
    // Normalizar ângulo para [0, 2PI]
    let angleLoad = Math.atan2(My, Mx); 
    if (angleLoad < 0) angleLoad += 2 * Math.PI;

    const surface = pcalcData.resultados.surfacePoints;
    if (surface.x.length === 0) return 0; 

    // 2. Filtrar pontos numa "fatia" de N
    // Tolerância relativa ao N ou fixa mínima
    const toleranceN = Math.max(20, Math.abs(N) * 0.10); // 10% de tolerância ou 20kN
    
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

    // 3. Ordenar por ângulo
    slicePoints.sort((a, b) => a.ang - b.ang);

    // 4. Encontrar pontos que envelopam o ângulo da carga
    // Adicionar o primeiro ponto ao final para fechar o ciclo (360 graus)
    slicePoints.push({ r: slicePoints[0].r, ang: slicePoints[0].ang + 2 * Math.PI });

    let R_res = 0;

    for (let i = 0; i < slicePoints.length - 1; i++) {
        const p1 = slicePoints[i];
        const p2 = slicePoints[i+1];
        
        if (angleLoad >= p1.ang && angleLoad <= p2.ang) {
            // Interpolação Linear do Raio
            const ratio = (angleLoad - p1.ang) / (p2.ang - p1.ang);
            R_res = p1.r + ratio * (p2.r - p1.r);
            break;
        }
    }
    
    // Fallback: se não achou (ex: buracos na malha angular), pega o mais próximo
    if (R_res === 0) {
        let minDiff = Infinity;
        for (let p of slicePoints) {
            let diff = Math.abs(p.ang - angleLoad);
            // Ajuste circular
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


function calculateLoadCase(load, index) {
    console.group(`Detalhes do Caso ${index + 1}`); // Group logs
    const gf = pcalcData.config.gamaF;
    let Nsd = load.n * gf;
    
    console.log(`Cargas de Entrada: N=${load.n}, MxTop=${load.mxTop}, MxBot=${load.mxBot}, MyTop=${load.myTop}, MyBot=${load.myBot}`);
    console.log(`Cargas de Cálculo (x${gf}): Nsd=${Nsd}`);

    const M1d_x_top = load.mxTop * gf;
    const M1d_x_bot = load.mxBot * gf;
    const M1d_y_top = load.myTop * gf;
    const M1d_y_bot = load.myBot * gf;
    
    const L = pcalcData.secao.length;
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;
    const isPinned = pcalcData.secao.boundary === 'pinned';
    const method = pcalcData.config.method2ndOrder;
    
    // Momento Mínimo (NBR 6118)
    const e_min_x = 1.5 + 0.03 * hy; 
    const e_min_y = 1.5 + 0.03 * hx; 
    
    const M1d_min_x = Math.abs(Nsd) * (e_min_x / 100); 
    const M1d_min_y = Math.abs(Nsd) * (e_min_y / 100); 
    
    console.log(`Excentricidade Mínima: ex_min=${e_min_x}cm, ey_min=${e_min_y}cm`);
    console.log(`Momentos Mínimos: M1d_min_x=${M1d_min_x.toFixed(2)}, M1d_min_y=${M1d_min_y.toFixed(2)}`);

    // Cálculo do Alpha B (NBR 6118)
    // alpha_b = 0.6 + 0.4 * (Mb / Ma), sendo |Ma| >= |Mb|
    
    // Para X
    let Ma_x = (Math.abs(M1d_x_top) >= Math.abs(M1d_x_bot)) ? M1d_x_top : M1d_x_bot;
    let Mb_x = (Math.abs(M1d_x_top) >= Math.abs(M1d_x_bot)) ? M1d_x_bot : M1d_x_top;
    
    let alphaB_x = 0.6 + 0.4 * (Mb_x / Ma_x);
    if (alphaB_x < 0.4) alphaB_x = 0.4;
    
    // Momento Equivalente X
    let M1d_eq_x = alphaB_x * Math.abs(Ma_x);
    
    console.log(`AlphaB X: Ma=${Ma_x}, Mb=${Mb_x}, ratio=${Mb_x/Ma_x}, alpha=${alphaB_x.toFixed(2)}. Meq_x=${M1d_eq_x.toFixed(2)}`);

    // Para Y
    let Ma_y = (Math.abs(M1d_y_top) >= Math.abs(M1d_y_bot)) ? M1d_y_top : M1d_y_bot;
    let Mb_y = (Math.abs(M1d_y_top) >= Math.abs(M1d_y_bot)) ? M1d_y_bot : M1d_y_top;
    
    let alphaB_y = 0.6 + 0.4 * (Mb_y / Ma_y);
    if (alphaB_y < 0.4) alphaB_y = 0.4;

    let M1d_eq_y = alphaB_y * Math.abs(Ma_y);

    console.log(`AlphaB Y: Ma=${Ma_y}, Mb=${Mb_y}, ratio=${Mb_y/Ma_y}, alpha=${alphaB_y.toFixed(2)}. Meq_y=${M1d_eq_y.toFixed(2)}`);

    // Momentos de 1ª ordem máximos (envoltória simples) para comparação
    const M1d_x_max_abs = Math.max(Math.abs(M1d_x_top), Math.abs(M1d_x_bot));
    const M1d_y_max_abs = Math.max(Math.abs(M1d_y_top), Math.abs(M1d_y_bot));

    let Mtot_x = M1d_x_max_abs;
    let Mtot_y = M1d_y_max_abs;
    let info = "1ª Ordem";
    
    // Variáveis para plotagem do gráfico (momento de 2ª ordem calculado)
    let M2d_x = 0;
    let M2d_y = 0;

    // Cálculo de 2ª Ordem
    if (pcalcData.config.calc2ndOrder && Nsd < 0) { 
        const Le = isPinned ? L : 2.0 * L;
        const lambdaX = 3.46 * Le / hy; 
        const lambdaY = 3.46 * Le / hx; 
        
        // Lambda 1 (Limite de esbeltez para dispensa)
        // lambda_1 = (25 + 12.5 * e1/h) / alpha_b
        let e1_h_x = Math.abs(Ma_x) / Math.abs(Nsd) / (hy/100); 
        let lam1_x = (25 + 12.5 * e1_h_x) / alphaB_x;
        if (lam1_x > 90) lam1_x = 90;
        if (lam1_x < 35) lam1_x = 35;

        let e1_h_y = Math.abs(Ma_y) / Math.abs(Nsd) / (hx/100);
        let lam1_y = (25 + 12.5 * e1_h_y) / alphaB_y;
        if (lam1_y > 90) lam1_y = 90;
        if (lam1_y < 35) lam1_y = 35;
        
        console.log(`Esbeltez Limite Lambda1: X=${lam1_x.toFixed(1)} (Lambda=${lambdaX.toFixed(1)}), Y=${lam1_y.toFixed(1)} (Lambda=${lambdaY.toFixed(1)})`);
        
        // Verifica se deve considerar a esbeltez limite para dispensa
        const checkSlenderness = pcalcData.config.checkSlenderness;

        if (method === 'stiffness') {
             const fck = pcalcData.materiais.fck;
            const Eci = 5600 * Math.sqrt(fck); 
            const Ecs = 0.85 * Eci; 
            const Ecd = Ecs / 1.4; 
            
            const Ic_x = pcalcData.secao.ix;
            const Ic_y = pcalcData.secao.iy;
            
            let Is_x = 0; let Is_y = 0;
            pcalcData.armacao.barras.forEach(b => {
                const as = Math.PI * Math.pow(b.diametro/10/2, 2);
                const dy = b.y - pcalcData.secao.ym;
                const dx = b.x - pcalcData.secao.xm;
                Is_x += as * dy * dy;
                Is_y += as * dx * dx;
            });
            
            const EI_x = 0.3 * (Ecd/10) * Ic_x + (21000) * Is_x;
            const EI_y = 0.3 * (Ecd/10) * Ic_y + (21000) * Is_y;
            
            const Nb_x = (Math.PI * Math.PI * EI_x) / (Le * Le); 
            const Nb_y = (Math.PI * Math.PI * EI_y) / (Le * Le);
            
            if (!checkSlenderness || lambdaX > lam1_x) {
                const ratio = Math.abs(Nsd) / Nb_x;
                if (ratio < 1) {
                    let M_amplified = M1d_eq_x / (1 - ratio);
                    Mtot_x = Math.max(Mtot_x, M_amplified);
                    // Estimar M2d reverso para plotagem
                    M2d_x = M_amplified - M1d_eq_x;
                } else {
                    Mtot_x = 9999; info = "Instável";
                }
            }
            if (!checkSlenderness || lambdaY > lam1_y) {
                const ratio = Math.abs(Nsd) / Nb_y;
                if (ratio < 1) {
                    let M_amplified = M1d_eq_y / (1 - ratio);
                    Mtot_y = Math.max(Mtot_y, M_amplified);
                    M2d_y = M_amplified - M1d_eq_y;
                } else {
                    Mtot_y = 9999; info = "Instável";
                }
            }
            if(info !== "Instável") info = "2ª Ordem (κ)";

        } else {
            // Método da Curvatura Nominal (1/r)
            const Ac = pcalcData.secao.areaAc;
            const fcd = (pcalcData.materiais.fck/10) / pcalcData.config.gamaC;
            const nu = Math.abs(Nsd) / (Ac * fcd);
            
            console.log(`Método Curvatura Nominal. Nu = ${nu.toFixed(3)}`);

            if (!checkSlenderness || lambdaX > lam1_x) {
                let curvCalc = (0.005 / hy) / (nu + 0.5);
                let limit = 0.005 / hy;
                let curv = Math.min(curvCalc, limit);
                
                M2d_x = Math.abs(Nsd) * (Le*Le/10) * curv / 100;
                let Mtot_calc = M1d_eq_x + M2d_x;
                Mtot_x = Math.max(Mtot_x, Mtot_calc);
                
                console.log(`Eixo X: 2ª Ordem necessária. M2d=${M2d_x.toFixed(2)}, Mtot_calc=${Mtot_calc.toFixed(2)}`);
            } else {
                console.log(`Eixo X: 2ª Ordem dispensada (Lambda < Lambda1). Mantém M1d=${Mtot_x.toFixed(2)}`);
            }
            
            if (!checkSlenderness || lambdaY > lam1_y) {
                let curvCalc = (0.005 / hx) / (nu + 0.5);
                let limit = 0.005 / hx;
                let curv = Math.min(curvCalc, limit);

                M2d_y = Math.abs(Nsd) * (Le*Le/10) * curv / 100;
                let Mtot_calc = M1d_eq_y + M2d_y;
                Mtot_y = Math.max(Mtot_y, Mtot_calc); 

                console.log(`Eixo Y: 2ª Ordem necessária. M2d=${M2d_y.toFixed(2)}, Mtot_calc=${Mtot_calc.toFixed(2)}`);
            } else {
                console.log(`Eixo Y: 2ª Ordem dispensada. Mantém M1d=${Mtot_y.toFixed(2)}`);
            }
            info = "2ª Ordem (1/r)";
        }
    } else {
        console.log("Cálculo de 2ª ordem não necessário.");
    }
    
    // Aplica verificação final do momento mínimo apenas no resultado final
    Mtot_x = Math.max(Mtot_x, M1d_min_x);
    Mtot_y = Math.max(Mtot_y, M1d_min_y);
    
    // Calcular Fator de Segurança (FS)
    const safetyFactor = calculateSafetyFactor(Nsd, Mtot_x, Mtot_y);

    const signX = (Math.abs(M1d_x_top) > Math.abs(M1d_x_bot)) ? Math.sign(M1d_x_top) : Math.sign(M1d_x_bot);
    const signY = (Math.abs(M1d_y_top) > Math.abs(M1d_y_bot)) ? Math.sign(M1d_y_top) : Math.sign(M1d_y_bot);

    console.groupEnd();

    return {
        id: index,
        originalIndex: index + 1, // Para exibir na tabela
        Nsd: Nsd,
        Mx1Top: M1d_x_top, Mx1Bot: M1d_x_bot,
        My1Top: M1d_y_top, My1Bot: M1d_y_bot,
        MxTot: Mtot_x * (signX || 1), 
        MyTot: Mtot_y * (signY || 1),
        M2d_x: M2d_x, 
        M2d_y: M2d_y,
        safetyFactor: safetyFactor, // Guardar FS
        info: info,
        status: "Calc"
    };
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
    
    // Cores dinâmicas
    const dark = isDark();
    const meshColor = dark ? '#475569' : '#94a3b8'; 
    const axisColor = dark ? '#94a3b8' : '#475569';
    const gridColor = dark ? '#334155' : '#e2e8f0';
    const bgColor = 'rgba(0,0,0,0)';

    const surfaceTrace = {
        type: 'mesh3d',
        x: x, y: y, z: z,
        opacity: 0.15,
        color: meshColor,
        name: 'Diagrama de Interação',
        alphahull: 0,
        lighting: { ambient: 0.6, diffuse: 0.9 }
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
    
    const data = [surfaceTrace, loadsTraceOther];
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
        showlegend: false,
        hovermode: 'closest'
    };
    
    Plotly.newPlot('chart3d', data, layout, {responsive: true});
}

function renderElevation(caseIndex) {
    // 1. Verificação segura dos elementos
    const containerN = document.getElementById('elevation-plot-n');
    const containerMx = document.getElementById('elevation-plot-mx');
    const containerMy = document.getElementById('elevation-plot-my');
    
    if (!containerN || !containerMx || !containerMy) return;
    
    // 2. Esconder placeholder
    const placeholder = document.getElementById('elevation-placeholder');
    if(placeholder) placeholder.style.display = 'none';
    
    const loadCase = pcalcData.resultados.loadCases[caseIndex];
    if (!loadCase) return;

    // --- GERAÇÃO DE DADOS ---
    const points = 20;
    const L = pcalcData.secao.length; 
    const z = []; 
    const normal = [];
    const mxTot = [];
    const myTot = [];
    
    const M1x_top = loadCase.Mx1Top;
    const M1x_bot = loadCase.Mx1Bot;
    const Mtot_x_final = Math.abs(loadCase.MxTot);
    
    const M1y_top = loadCase.My1Top;
    const M1y_bot = loadCase.My1Bot;
    const Mtot_y_final = Math.abs(loadCase.MyTot);
    
    const isPinned = pcalcData.secao.boundary === 'pinned';
    const N_val = loadCase.Nsd; 
    
    // Momentos de 2ª ordem calculados
    const M2d_x = loadCase.M2d_x || 0;
    const M2d_y = loadCase.M2d_y || 0;

    for(let i=0; i<=points; i++) {
        const pos = i / points; 
        const height = pos * L; 
        z.push(height);
        
        normal.push(N_val); 
        
        const m1x_curr = M1x_bot + (M1x_top - M1x_bot) * pos;
        const m1y_curr = M1y_bot + (M1y_top - M1y_bot) * pos;
        
        // Visualização ajustada para garantir que a barriga mostre o valor de Mtot calculado
        if (isPinned) {
            const midM1x = (M1x_top + M1x_bot) / 2;
            const signX = (Math.abs(M1x_top) >= Math.abs(M1x_bot)) ? Math.sign(M1x_top) : Math.sign(M1x_bot);
            
            // Força a "barriga" a atingir o valor de Mtot com o sinal correto no meio do vão
            const targetMidX = signX * Mtot_x_final;
            // Diferença necessária para que (linear + diff) = target no meio
            const diffX = targetMidX - midM1x;
            
            mxTot.push(m1x_curr + diffX * Math.sin(Math.PI * pos));
            
            const midM1y = (M1y_top + M1y_bot) / 2;
            const signY = (Math.abs(M1y_top) >= Math.abs(M1y_bot)) ? Math.sign(M1y_top) : Math.sign(M1y_bot);
            const targetMidY = signY * Mtot_y_final;
            const diffY = targetMidY - midM1y;
            
            myTot.push(m1y_curr + diffY * Math.sin(Math.PI * pos));
        } else {
            // Balanço
            const factor = Math.pow(1 - pos, 2); 
            const diffX = Math.max(0, Mtot_x_final - Math.abs(M1x_bot));
            const signX = Math.sign(m1x_curr) || 1;
            mxTot.push(m1x_curr + signX * diffX * factor);
            
            const diffY = Math.max(0, Mtot_y_final - Math.abs(M1y_bot));
            const signY = Math.sign(m1y_curr) || 1;
            myTot.push(m1y_curr + signY * diffY * factor);
        }
    }
    
    // Configurações comuns do Layout (Estilo Image Ref e Dark Mode)
    const dark = typeof isThemeDark === 'function' ? isThemeDark() : false;
    const plotBgColor = dark ? '#1f2937' : '#f3f4f6'; // Gray-800 : Gray-100
    const lineColor = dark ? '#e5e7eb' : '#000000';
    const fontColor = dark ? '#9ca3af' : '#374151';
    const fillColor = dark ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.25)'; // Red
    const zerolineColor = dark ? '#6b7280' : '#9ca3af';

    const commonLayout = {
        margin: { l: 30, r: 10, b: 30, t: 30 },
        showlegend: false,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: plotBgColor,
        xaxis: { 
            zeroline: true, zerolinecolor: zerolineColor, zerolinewidth: 2,
            showgrid: true, gridcolor: dark ? '#374151' : '#e5e7eb',
            showticklabels: false, // Esconde números X para limpar
        },
        yaxis: { 
            showgrid: false, zeroline: false,
            showticklabels: false, // Esconde Y também (apenas visual)
            range: [0, L]
        },
        font: { size: 10, color: fontColor }
    };

    // Função auxiliar para anotações (Topo e Base)
    const createAnnotations = (xVals, yVals, suffix='') => {
        const anns = [];
        // Base
        anns.push({
            x: xVals[0], y: yVals[0],
            text: Math.round(xVals[0]) + suffix,
            showarrow: false, xanchor: 'right', xshift: -2, yshift: 10,
            font: {size: 9, color: fontColor}
        });
        // Topo
        anns.push({
            x: xVals[xVals.length-1], y: yVals[yVals.length-1],
            text: Math.round(xVals[xVals.length-1]) + suffix,
            showarrow: false, xanchor: 'right', xshift: -2, yshift: -10,
            font: {size: 9, color: fontColor}
        });
        // Meio (Aprox)
        const mid = Math.floor(xVals.length/2);
        // Só mostra anotação no meio se for diferente das extremidades (curvo)
        if (Math.abs(xVals[mid] - (xVals[0] + xVals[xVals.length-1])/2) > 1) {
            anns.push({
                x: xVals[mid], y: yVals[mid],
                text: Math.round(xVals[mid]) + suffix,
                showarrow: false, xanchor: 'left', xshift: 2,
                font: {size: 9, color: fontColor}
            });
        }
        return anns;
    };

    // 1. Plot Normal (Nsd)
    const traceN = { 
        x: normal, y: z, 
        type: 'scatter', mode: 'lines', fill: 'tozerox', 
        line: { color: lineColor, width: 2 },
        fillcolor: fillColor,
        hoverinfo: 'x+y'
    };
    const layoutN = { 
        ...commonLayout, 
        title: { text: 'Nsd (kN)', font: {size: 11, weight: 'bold', color: fontColor} },
        annotations: createAnnotations(normal, z)
    };
    
    // 2. Plot Mx
    const traceMx = { 
        x: mxTot, y: z, 
        type: 'scatter', mode: 'lines', fill: 'tozerox', 
        line: { color: lineColor, width: 2 },
        fillcolor: fillColor,
        hoverinfo: 'x+y'
    };
    const layoutMx = { 
        ...commonLayout, 
        title: { text: 'Msd,x (kNm)', font: {size: 11, weight: 'bold', color: fontColor} },
        annotations: createAnnotations(mxTot, z)
    };

    // 3. Plot My
    const traceMy = { 
        x: myTot, y: z, 
        type: 'scatter', mode: 'lines', fill: 'tozerox', 
        line: { color: lineColor, width: 2 },
        fillcolor: fillColor,
        hoverinfo: 'x+y'
    };
    const layoutMy = { 
        ...commonLayout, 
        title: { text: 'Msd,y (kNm)', font: {size: 11, weight: 'bold', color: fontColor} },
        annotations: createAnnotations(myTot, z)
    };

    // Renderizar
    Plotly.newPlot('elevation-plot-n', [traceN], layoutN, {displayModeBar: false, responsive: true});
    Plotly.newPlot('elevation-plot-mx', [traceMx], layoutMx, {displayModeBar: false, responsive: true});
    Plotly.newPlot('elevation-plot-my', [traceMy], layoutMy, {displayModeBar: false, responsive: true});
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

    ctx.restore();

    // Atualizar stats sempre que renderizar
    updateSectionStats();
}