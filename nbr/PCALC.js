// --- DATA STRUCTURE ---
const pcalcData = {
    secao: {
        tipoSecao: 'Retangular',
        hx: 30,
        hy: 50,
        xm: 15, // Calculated later
        ym: 25, // Calculated later
        areaAc: 0,
        lFlamb: 0,
        tipoVinculacao: 1 // 1: bi-supported (standard)
    },
    materiais: {
        fck: 25,
    },
    armacao: {
        barras: [
            { x: 5, y: 5, diametro: 20 },
            { x: 25, y: 5, diametro: 20 },
            { x: 5, y: 45, diametro: 20 },
            { x: 25, y: 45, diametro: 20 },
        ]
    },
    esforcos: {
        listaEsforcos: [
            { n: -1000, mx: 150, my: 75 }
        ]
    },
    config: {
        nSecao: 100,
        gamaS: 1.15,
        gamaC: 1.4,
        fyk: 500, // MPa
        modEs: 210, // GPa
        tipoCurvaC: 0, // Parábola-retângulo
        nGraficoMr: 50,
        tolVarLn: 1e-5,
        tolSomaN: 1e-5,
        tolIt: 100,
        metodoSegOrd: 1, // 1: pilar-padrão com curvatura aproximada
        calcular2ord: 1 // 1: Sim
    },
    resultados: {
        secaoC: [],
        secaoS: [],
        curvasMr: [],
        esforcos: {}
    },
    unidades: {
        forca: 'kN',
        momento: 'kNm',
        comprimento: 'cm'
    }
};

// --- DOM REFERENCES ---
const geometryForm = document.getElementById('geometry-form');
const sectionType = document.getElementById('section-type');
const hxInput = document.getElementById('hx');
const hyInput = document.getElementById('hy');

const materialsForm = document.getElementById('materials-form');
const fckInput = document.getElementById('fck');

const reinforcementTable = document.getElementById('reinforcement-table').getElementsByTagName('tbody')[0];
const addBarBtn = document.getElementById('add-bar-btn');

const loadsTable = document.getElementById('loads-table').getElementsByTagName('tbody')[0];
const addLoadBtn = document.getElementById('add-load-btn');
const calculateBtn = document.getElementById('calculate-btn');
const resultsTable = document.getElementById('results-table').getElementsByTagName('tbody')[0];
const chartCanvas = document.getElementById('myChart');
const sectionCanvas = document.getElementById('sectionCanvas');

const nmxmyBtn = document.getElementById('nmxmy-btn');
const nmxBtn = document.getElementById('nmx-btn');
const nmyBtn = document.getElementById('nmy-btn');

let myChart;

// --- CORE FUNCTIONS ---

function updateGeometry() {
    pcalcData.secao.tipoSecao = sectionType.value;
    pcalcData.secao.hx = parseFloat(hxInput.value) || 0;
    pcalcData.secao.hy = parseFloat(hyInput.value) || 0;
    // Update center of mass for Rectangular (simplified)
    pcalcData.secao.xm = pcalcData.secao.hx / 2;
    pcalcData.secao.ym = pcalcData.secao.hy / 2;
}

function updateMaterials() {
    pcalcData.materiais.fck = parseFloat(fckInput.value) || 0;
}

function renderReinforcement() {
    reinforcementTable.innerHTML = '';
    pcalcData.armacao.barras.forEach((barra, index) => {
        const row = reinforcementTable.insertRow();
        row.className = "border-b border-gray-100 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700";
        row.innerHTML = `
            <td class="p-2"><input type="number" value="${barra.x}" data-index="${index}" data-prop="x" class="w-20 p-1 border rounded text-center dark:bg-gray-600 dark:text-white dark:border-gray-500"></td>
            <td class="p-2"><input type="number" value="${barra.y}" data-index="${index}" data-prop="y" class="w-20 p-1 border rounded text-center dark:bg-gray-600 dark:text-white dark:border-gray-500"></td>
            <td class="p-2"><input type="number" value="${barra.diametro}" data-index="${index}" data-prop="diametro" class="w-20 p-1 border rounded text-center dark:bg-gray-600 dark:text-white dark:border-gray-500"></td>
            <td class="p-2"><button class="remove-bar-btn text-red-500 hover:text-red-700 font-bold px-2" data-index="${index}">&times;</button></td>
        `;
    });
}

function updateReinforcement(event) {
    const target = event.target;
    if (target.tagName === 'INPUT') {
        const index = parseInt(target.dataset.index);
        const prop = target.dataset.prop;
        pcalcData.armacao.barras[index][prop] = parseFloat(target.value);
    }
}

function addBar() {
    const hx = pcalcData.secao.hx;
    const hy = pcalcData.secao.hy;
    // Default new bar in center
    pcalcData.armacao.barras.push({ x: hx/2, y: hy/2, diametro: 16 });
    renderReinforcement();
}

function removeBar(event) {
    if (event.target.classList.contains('remove-bar-btn')) {
        const index = parseInt(event.target.dataset.index);
        pcalcData.armacao.barras.splice(index, 1);
        renderReinforcement();
    }
}

function renderLoads() {
    loadsTable.innerHTML = '';
    pcalcData.esforcos.listaEsforcos.forEach((esforco, index) => {
        const row = loadsTable.insertRow();
        row.className = "border-b border-gray-100 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700";
        row.innerHTML = `
            <td class="p-2"><input type="number" value="${esforco.n}" data-index="${index}" data-prop="n" class="w-24 p-1 border rounded text-center dark:bg-gray-600 dark:text-white dark:border-gray-500"></td>
            <td class="p-2"><input type="number" value="${esforco.mx}" data-index="${index}" data-prop="mx" class="w-24 p-1 border rounded text-center dark:bg-gray-600 dark:text-white dark:border-gray-500"></td>
            <td class="p-2"><input type="number" value="${esforco.my}" data-index="${index}" data-prop="my" class="w-24 p-1 border rounded text-center dark:bg-gray-600 dark:text-white dark:border-gray-500"></td>
            <td class="p-2"><button class="remove-load-btn text-red-500 hover:text-red-700 font-bold px-2" data-index="${index}">&times;</button></td>
        `;
    });
}

function updateLoads(event) {
    const target = event.target;
    if (target.tagName === 'INPUT') {
        const index = parseInt(target.dataset.index);
        const prop = target.dataset.prop;
        pcalcData.esforcos.listaEsforcos[index][prop] = parseFloat(target.value);
    }
}

function addLoad() {
    pcalcData.esforcos.listaEsforcos.push({ n: -500, mx: 100, my: 50 });
    renderLoads();
}

function removeLoad(event) {
    if (event.target.classList.contains('remove-load-btn')) {
        const index = parseInt(event.target.dataset.index);
        pcalcData.esforcos.listaEsforcos.splice(index, 1);
        renderLoads();
    }
}

// --- CALCULATION LOGIC ---

function discretizeSection(data) {
    const { secao, config, armacao } = data;
    const { tipoSecao, hx, hy, xm, ym } = secao;
    const { nSecao } = config;
    
    // Calc gross properties
    data.secao.areaAc = hx * hy;
    data.secao.lFlamb = hy / 100; // simplified
    
    const argSecaoC = [];
    
    if (tipoSecao === 'Retangular') {
        const nHx = Math.max(10, Math.floor(Math.sqrt((hx * nSecao) / hy)));
        const nHy = Math.max(10, Math.floor(nSecao / nHx));
        
        for (let iy = 0; iy < nHy; iy++) {
            for (let ix = 0; ix < nHx; ix++) {
                // Global coords relative to geometric center
                const xGlobal = (((0.5 + ix) * hx) / nHx);
                const yGlobal = (((0.5 + iy) * hy) / nHy);
                
                const secaoI = [
                    xGlobal - xm, // x relative to centroid
                    yGlobal - ym, // y relative to centroid
                    ((hx * hy) / nHx) / nHy, // Area
                    hx / nHx, // dx (width)
                    hy / nHy  // dy (height)
                ];
                argSecaoC.push(secaoI);
            }
        }
    } else if (tipoSecao === 'Circular') {
        // Simplified Circular Discretization logic
        const rExt = hx / 2;
        const delta = Math.sqrt((Math.PI * rExt * rExt) / nSecao);
        const nR = Math.max(5, Math.floor(rExt / delta));
        
        // Add center circle
        const rInt0 = rExt/nR;
        argSecaoC.push([0, 0, Math.PI * rInt0 * rInt0, rInt0*2, rInt0*2]);
        
        // Rings
        for(let i=1; i<nR; i++) {
             const rInner = (i * rExt) / nR;
             const rOuter = ((i+1) * rExt) / nR;
             const rMid = (rInner + rOuter) / 2;
             const circum = 2 * Math.PI * rMid;
             const nSlices = Math.max(8, Math.floor(circum / delta));
             
             for(let j=0; j<nSlices; j++) {
                 const angle = (j * 2 * Math.PI) / nSlices;
                 const areaSlice = (Math.PI * (rOuter*rOuter - rInner*rInner)) / nSlices;
                 argSecaoC.push([
                     rMid * Math.cos(angle),
                     rMid * Math.sin(angle),
                     areaSlice,
                     (rOuter-rInner), // approx dx
                     (rOuter-rInner)  // approx dy
                 ]);
             }
        }
    }

    data.resultados.secaoC = argSecaoC;

    // Steel
    const argSecaoS = [];
    for (const barra of armacao.barras) {
        const secaoI = [
            barra.x - xm,
            barra.y - ym,
            (Math.PI * Math.pow(barra.diametro / 10, 2)) / 4 // cm^2
        ];
        argSecaoS.push(secaoI);
    }
    data.resultados.secaoS = argSecaoS;
}

// Stress-Strain functions
function fc(ec, fcd, tipoCurvaC, ec2, ecu, n) {
    if (tipoCurvaC === 0) { // Parabola-Rectangle
        if ((-ec2 < ec) && (ec < 0)) {
            return -0.85 * fcd * (1 - Math.pow(1 + (ec / ec2), n));
        }
        if ((-ecu * 1.0001 <= ec) && (ec <= -ec2)) {
            return -0.85 * fcd;
        }
    }
    return 0;
}

function fs(es, fyd, moduloS, esu) {
    const eyd = (fyd / moduloS) * 1000;
    if (Math.abs(es) < eyd) {
        return moduloS * (es / 1000);
    }
    if ((eyd <= Math.abs(es)) && (Math.abs(es) <= esu)) {
        return fyd * (es / Math.abs(es));
    }
    return 0;
}

function rotacionaXY(coordenadas, teta) {
    return coordenadas.map(coord => {
        const x = coord[0];
        const y = coord[1];
        const xRot = Math.cos(teta) * x + Math.sin(teta) * y;
        const yRot = -Math.sin(teta) * x + Math.cos(teta) * y;
        return [xRot, yRot, ...coord.slice(2)];
    });
}

function funcX(xLn, d, yCMin, yCMax, xyCRot, xyAsRot, nd, params) {
    const { n, ec2, ecu, fyd, fcd, modEs, tipoCurvaC } = params;
    let somaNd = 0, fi = 0, ecg = 0;

    if (xLn / d < ecu / (ecu + 10.0)) {
        const ec = (-10.0 * xLn) / (d - xLn);
        fi = -ec / xLn;
        ecg = ec - (fi * yCMin);
    } else if ((ecu / (ecu + 10.0) <= xLn / d) && (xLn / (yCMax - yCMin) <= 1.0)) {
        const ec = -ecu;
        fi = -ec / xLn;
        ecg = ec - (fi * yCMin);
    } else if (1.0 < xLn / (yCMax - yCMin)) {
        const ec = (-ec2 * xLn) / (xLn - (((yCMax - yCMin) * (ecu - ec2)) / ecu));
        fi = -ec / xLn;
        ecg = ec - (fi * yCMin);
    }

    for (const secao of xyCRot) {
        const eci = ecg + (secao[1] * fi);
        somaNd += fc(eci, fcd, tipoCurvaC, ec2, ecu, n) * secao[2];
    }

    for (const secao of xyAsRot) {
        const esi = ecg + (secao[1] * fi);
        somaNd += fs(esi, fyd, modEs, 10.0) * secao[2];
    }

    return [somaNd - nd, fi, ecg];
}

function calculaMr(nd, tetaLN, data, params) {
    const { secaoC, secaoS } = data.resultados;
    const { tolSomaN, tolIt } = data.config;
    const xyCRot = rotacionaXY(secaoC, tetaLN);
    const xyAsRot = rotacionaXY(secaoS, tetaLN);

    let yCMin = Infinity, yCMax = -Infinity, yAsMax = -Infinity;
    for (const s of xyCRot) { yCMin = Math.min(s[1], yCMin); yCMax = Math.max(s[1], yCMax); }
    for (const s of xyAsRot) { yAsMax = Math.max(s[1], yAsMax); }

    const d = yAsMax - yCMin;
    let x0 = -d, xu = 2 * d, xLn = 0, fi = 0, ecg = 0;

    for (let i = 0; i < tolIt; i++) {
        xLn = (x0 + xu) / 2;
        const res = funcX(xLn, d, yCMin, yCMax, xyCRot, xyAsRot, nd, params);
        const somaNd = res[0];
        fi = res[1];
        ecg = res[2];

        if (Math.abs(somaNd) < tolSomaN) break;
        if (somaNd < 0) xu = xLn;
        else x0 = xLn;
    }

    let mrx = 0, mry = 0;
    // Concrete moments
    for (let i = 0; i < secaoC.length; i++) {
        const eci = ecg + (xyCRot[i][1] * fi);
        const sigC = fc(eci, params.fcd, params.tipoCurvaC, params.ec2, params.ecu, params.n);
        mrx += (sigC * secaoC[i][2] * secaoC[i][1]) / 100;
        mry += (sigC * secaoC[i][2] * secaoC[i][0]) / 100;
    }
    // Steel moments
    for (let i = 0; i < secaoS.length; i++) {
        const esi = ecg + (xyAsRot[i][1] * fi);
        const sigS = fs(esi, params.fyd, params.modEs, 10.0);
        mrx += (sigS * secaoS[i][2] * secaoS[i][1]) / 100;
        mry += (sigS * secaoS[i][2] * secaoS[i][0]) / 100;
    }

    return [-mry, mrx]; // Adjusted signs
}

function calculateMomentCurvature(data) {
    const { config, esforcos, resultados } = data;
    const { fck, fyk, gamaS, gamaC, modEs, tipoCurvaC, nGraficoMr } = config;

    let n = 2.0, ec2 = 2.0, ecu = 3.5;
    if (fck > 50) { // High strength concrete correction
        const fck_eff = fck/100; 
    }
    // Using standard EC2/NBR params for <= C50
    if (fck > 50) {
            n = 1.4 + 23.4 * Math.pow((90 - fck) / 100, 4); 
            ec2 = 2.0 + 0.085 * Math.pow(fck - 50, 0.53);
            ecu = 2.6 + 35.0 * Math.pow((90 - fck) / 100, 4);
    }

    const fyd = fyk / gamaS;
    const fcd = fck / gamaC;
    const params = { n, ec2, ecu, fyd, fcd, modEs, tipoCurvaC };

    const curvasMr = [];
    for (const esforco of esforcos.listaEsforcos) {
        const nd = esforco.n;
        const curvaMrI = [[], [], [], [], []];
        const nPoints = nGraficoMr; 

        for (let j = 0; j <= nPoints; j++) {
            const tetaLN = (j * 2 * Math.PI) / nPoints;
            const mr = calculaMr(nd, tetaLN, data, params);
            curvaMrI[0].push(nd);
            curvaMrI[1].push(tetaLN);
            curvaMrI[2].push(mr[0]); // Mx capacity
            curvaMrI[3].push(mr[1]); // My capacity
        }
        curvasMr.push(curvaMrI);
    }
    data.resultados.curvasMr = curvasMr;
}

function calculateSecondOrderMoments(nsd, h, md1, data) {
    const { secao, materiais, config } = data;
    const { areaAc, lFlamb } = secao;
    const fcd = materiais.fck / config.gamaC;
    
    // md1 = [Base, Mid, Top]
    const md2 = [...md1];
    const le = lFlamb * 100; 

    // Adimensional normal force (ni)
    // nsd is kN, areaAc cm2, fcd MPa -> need consistency.
    // fcd MPa = fcd/10 kN/cm2
    const ni = Math.abs(nsd) / (areaAc * (fcd/10));
    
    // Curvature 1/r
    // 0.005/h (h in cm)
    let invR = 0.005 / h;
    const kr = Math.min(1, (ni + 0.5)); // Correction factor?
    // Simplified standard method usually: 1/r = K * (0.005/h)
    // Using provided logic:
    invR = Math.min((0.005 / h) / (ni + 0.5), 0.005 / h);

    // e2 = (le^2 / 10) * (1/r)
    const m2d = Math.abs(nsd) * (le * le / 10) * invR; // kNm

    // Add to middle moment
    if (md2[1] !== 0) {
        md2[1] += m2d * (md2[1] / Math.abs(md2[1]));
    } else {
        md2[1] = m2d;
    }

    // Min moment check
    const m1d_min = Math.abs(nsd) * (1.5 + 0.03 * h) / 100; 
    const final_mid = Math.max(Math.abs(md2[1]), m1d_min);

    return [md1[0], final_mid * (md1[1] !== 0 ? Math.sign(md1[1]) : 1), md1[2]];
}

function calculaMomento1Ord(mdTopo, mdBase, data) {
        // Simple linear interpolation / envelope
        return [mdBase, (mdTopo + mdBase)/2, mdTopo];
}

function calculateEsforcos(data) {
    const { config, esforcos, secao } = data;
    const gamaF = 1.4;
    
    const nsd = [], msxd = [], msyd = [], msxd2 = [], msyd2 = [];
    
    for (const esforco of esforcos.listaEsforcos) {
        const nsdI = gamaF * esforco.n;
        nsd.push(nsdI);
        
        // Mx
        const mxd1 = [gamaF * esforco.mx, gamaF * esforco.mx, gamaF * esforco.mx]; // Flat profile
        msxd.push(mxd1);
        
        // My
        const myd1 = [gamaF * esforco.my, gamaF * esforco.my, gamaF * esforco.my];
        msyd.push(myd1);
        
        // 2nd Order
        if (config.calcular2ord === 1 && nsdI < 0) {
                msxd2.push(calculateSecondOrderMoments(nsdI, secao.hy, mxd1, data));
                msyd2.push(calculateSecondOrderMoments(nsdI, secao.hx, myd1, data));
        } else {
                msxd2.push(mxd1);
                msyd2.push(myd1);
        }
    }
    
    data.resultados.esforcos = { nsd, msxd, msyd, msxd2, msyd2 };
}

// --- RENDERING ---

function renderChart(chartType = 'N-Mx') {
    if (myChart) myChart.destroy();
    const { curvasMr } = pcalcData.resultados;
    if (!curvasMr || curvasMr.length === 0) return;

    const datasets = [];
    const dataSetIx = 0; // First load case for curve
    const curve = curvasMr[dataSetIx];

    // Safety check for calculation failures
    if(!curve || !curve[2]) return;

    // Interaction Curve (Capacity)
    const capacityColor = chartType === 'N-Mx' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)';
    const dataKeyX = chartType === 'N-Mx' ? 2 : 3; // Index in curve array
    
    const scatterData = curve[dataKeyX].map((val, i) => ({ x: val, y: curve[0][i] }));
    // Close the loop
    scatterData.push(scatterData[0]);

    datasets.push({
        label: `Capacity (${chartType})`,
        data: scatterData,
        borderColor: capacityColor,
        backgroundColor: capacityColor.replace('0.8', '0.1'),
        showLine: true,
        pointRadius: 0,
        borderWidth: 2,
        fill: true
    });

    // Applied Load Point (Demand)
    const { esforcos } = pcalcData.resultados;
    const nsd = esforcos.nsd[0];
    const msd = chartType === 'N-Mx' ? esforcos.msxd2[0][1] : esforcos.msyd2[0][1]; // Use mid-height moment (includes 2nd order)

    datasets.push({
        label: 'Applied Load (Md,tot)',
        data: [{x: msd, y: nsd}],
        backgroundColor: 'black',
        borderColor: 'black',
        pointRadius: 6,
        pointStyle: 'crossRot'
    });

    myChart = new Chart(chartCanvas, {
        type: 'scatter',
        data: { datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Moment (kNm)' } },
                y: { type: 'linear', title: { display: true, text: 'Axial Force (kN)' } }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function renderResultsTable() {
    resultsTable.innerHTML = '';
    const { esforcos } = pcalcData.resultados;
    if(!esforcos || !esforcos.nsd) return;

    for(let i=0; i<esforcos.nsd.length; i++) {
        const row = resultsTable.insertRow();
        row.className = "border-b border-gray-100 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700";
        
        row.innerHTML = `
            <td class="p-2 text-center text-gray-700 dark:text-gray-300">Comb ${i+1}</td>
            <td class="p-2 text-center font-mono text-gray-700 dark:text-gray-300">${esforcos.nsd[i].toFixed(1)}</td>
            <td class="p-2 text-center font-mono text-gray-700 dark:text-gray-300">${esforcos.msxd2[i][1].toFixed(1)}</td>
            <td class="p-2 text-center font-mono text-gray-700 dark:text-gray-300">${esforcos.msyd2[i][1].toFixed(1)}</td>
            <td class="p-2 text-center"><span class="px-2 py-1 bg-gray-200 dark:bg-gray-600 rounded text-xs text-gray-700 dark:text-gray-300">View Graph</span></td>
        `;
    }
}

function renderCrossSection() {
    const ctx = sectionCanvas.getContext('2d');
    const container = document.getElementById('cross-section-container');
    sectionCanvas.width = container.clientWidth;
    sectionCanvas.height = container.clientHeight;
    
    const w = sectionCanvas.width;
    const h = sectionCanvas.height;
    
    ctx.clearRect(0, 0, w, h);
    
    const { hx, hy } = pcalcData.secao;
    const margin = 40;
    
    // Scale to fit
    const scaleX = (w - margin*2) / hx;
    const scaleY = (h - margin*2) / hy;
    const scale = Math.min(scaleX, scaleY);
    
    const cx = w/2;
    const cy = h/2;

    // Draw Concrete Elements (Discretized)
    const { secaoC } = pcalcData.resultados;
    if (secaoC && secaoC.length > 0) {
        ctx.fillStyle = '#e5e7eb'; // gray-200
        ctx.strokeStyle = '#d1d5db'; // gray-300
        
        // Draw outline first (simplified box for rect)
        ctx.beginPath();
        ctx.rect(cx - (hx*scale)/2, cy - (hy*scale)/2, hx*scale, hy*scale);
        ctx.stroke();

    } else {
            // Draw simple outline if not calculated yet
            ctx.strokeStyle = '#9ca3af';
            ctx.strokeRect(cx - (hx*scale)/2, cy - (hy*scale)/2, hx*scale, hy*scale);
    }

    // Draw Rebar
    const { barras } = pcalcData.armacao;
    if (barras) {
        ctx.fillStyle = '#ef4444'; // red-500
        for (let b of barras) {
            // bar coords are from bottom-left (0,0) usually in engineering
            // Screen coords: x goes right, y goes down.
            // Let's assume input x,y is from bottom-left of section.
            
            const bx = (b.x - hx/2) * scale + cx;
            const by = cy - (b.y - hy/2) * scale; // Flip Y
            
            // Diameter in mm, converted to canvas pixels (scale is px/cm)
            const radius = (b.diametro / 10 / 2) * scale; 
            
            ctx.beginPath();
            ctx.arc(bx, by, Math.max(radius, 3), 0, 2 * Math.PI);
            ctx.fill();
            ctx.strokeStyle = '#7f1d1d';
            ctx.stroke();
        }
    }
    
    // Hide placeholder
    document.getElementById('canvas-placeholder').style.display = 'none';
}


// --- EVENT HANDLERS ---

document.addEventListener('DOMContentLoaded', () => {
    // --- TEMPLATE INJECTION (Header/Footer) ---
    if (window.injectHeader) {
        window.injectHeader({
            activePage: 'pcalc', 
            pageTitle: 'pcalc_title',
            headerPlaceholderId: 'header-placeholder',
            pathPrefix: '../' 
        });
    }
    if (window.injectFooter) {
        window.injectFooter({
            footerPlaceholderId: 'footer-placeholder'
        });
    }

    updateGeometry();
    updateMaterials();
    renderReinforcement();
    renderLoads();
    
    // Initial simplistic render of section
    renderCrossSection();

    calculateBtn.addEventListener('click', () => {
        const msg = document.getElementById('feedback-message');
        if (pcalcData.esforcos.listaEsforcos.length === 0) {
            msg.textContent = 'Please add a load case.';
            msg.className = 'text-center h-5 text-red-600 dark:text-red-400';
            return;
        }
        msg.textContent = 'Calculating...';
        msg.className = 'text-center h-5 text-blue-600 dark:text-blue-400';

        // Allow UI to update
        setTimeout(() => {
            try {
                updateGeometry();
                discretizeSection(pcalcData);
                renderCrossSection(); // Update visual with scale
                calculateMomentCurvature(pcalcData);
                calculateEsforcos(pcalcData);
                renderChart('N-Mx');
                renderResultsTable();
                msg.textContent = 'Calculation Complete.';
                msg.className = 'text-center h-5 text-green-600 dark:text-green-400';
            } catch (e) {
                console.error(e);
                msg.textContent = 'Error in calculation. Check console.';
                msg.className = 'text-center h-5 text-red-600 dark:text-red-400';
            }
        }, 50);
    });

    nmxBtn.addEventListener('click', () => renderChart('N-Mx'));
    nmyBtn.addEventListener('click', () => renderChart('N-My'));
    nmxmyBtn.addEventListener('click', () => renderChart('N-Mx')); 

    // Inputs
    geometryForm.addEventListener('input', () => { updateGeometry(); renderCrossSection(); });
    addBarBtn.addEventListener('click', () => { addBar(); renderCrossSection(); });
    reinforcementTable.addEventListener('input', (e) => { updateReinforcement(e); renderCrossSection(); });
    reinforcementTable.addEventListener('click', (e) => { removeBar(e); renderCrossSection(); });
    
    addLoadBtn.addEventListener('click', addLoad);
    loadsTable.addEventListener('input', updateLoads);
    loadsTable.addEventListener('click', removeLoad);
});