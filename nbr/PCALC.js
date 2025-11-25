// PCalc Web application logic will go here.

// Main data object to hold the application state
const pcalcData = {
    secao: {
        tipoSecao: 'Retangular',
        hx: 30,
        hy: 50,
        // ... other geometry properties
    },
    materiais: {
        fck: 25,
        // ... other material properties
    },
    armacao: {
        barras: [
            // { x: 5, y: 5, diametro: 20 },
            // { x: 25, y: 5, diametro: 20 },
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
        // ... calculation results
    },
    unidades: {
        forca: 'kN',
        momento: 'kNm',
        comprimento: 'cm'
    }
};

// --- DOM Element References ---
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
const nmxmyBtn = document.getElementById('nmxmy-btn');
const nmxBtn = document.getElementById('nmx-btn');
const nmyBtn = document.getElementById('nmy-btn');
const pdfBtn = document.getElementById('pdf-btn');
const newBtn = document.getElementById('new-btn');
const openBtn = document.getElementById('open-btn');
const saveBtn = document.getElementById('save-btn');
let myChart;

// --- Functions ---
function renderChart(chartType = 'N-Mx') {
    if (myChart) {
        myChart.destroy();
    }

    const { curvasMr } = pcalcData.resultados;
    if (!curvasMr || curvasMr.length === 0 || !curvasMr[0] || curvasMr[0].length < 4) {
        console.warn("Chart rendering skipped: Invalid or incomplete curvasMr data.");
        return; // Exit if data is not valid
    }

    const datasets = [];

    if (chartType === 'N-Mx' || chartType === 'N-Mx-My') {
        datasets.push({
            label: 'N-Mx',
            data: curvasMr[0][2].map((mx, i) => ({ x: mx, y: curvasMr[0][0][i] })),
            borderColor: 'red',
            backgroundColor: 'red',
            showLine: true
        });
    }

    if (chartType === 'N-My' || chartType === 'N-Mx-My') {
        datasets.push({
            label: 'N-My',
            data: curvasMr[0][3].map((my, i) => ({ x: my, y: curvasMr[0][0][i] })),
            borderColor: 'blue',
            backgroundColor: 'blue',
            showLine: true
        });
    }

    const data = { datasets };

    const config = {
        type: 'scatter',
        data: data,
        options: {
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Mx (kNm)'
                    }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: {
                        display: true,
                        text: 'N (kN)'
                    }
                }
            }
        }
    };

    // Ensure Chart.js is loaded
    if (typeof Chart !== 'undefined') {
        myChart = new Chart(chartCanvas, config);
    } else {
        console.error('Chart.js library is not loaded.');
    }
}

function renderResults() {
    resultsTable.innerHTML = '';
    const { esforcos } = pcalcData.resultados;
    if (!esforcos) return;

    const nComb = esforcos.nsd.length;
    if (nComb === 0) return;

    const nRows = esforcos.msxd2[0].length;

    for (let i = 0; i < nRows; i++) {
        for (let j = 0; j < nComb; j++) {
            const row = resultsTable.insertRow();
            row.innerHTML = `
                <td>Comb ${j + 1}</td>
                <td>${esforcos.nsd[j].toFixed(2)}</td>
                <td>${esforcos.msxd2[j][i].toFixed(2)}</td>
                <td>${esforcos.msyd2[j][i].toFixed(2)}</td>
                <td>-</td>
            `;
        }
    }
}
function updateGeometry() {
    pcalcData.secao.tipoSecao = sectionType.value;
    pcalcData.secao.hx = parseFloat(hxInput.value);
    pcalcData.secao.hy = parseFloat(hyInput.value);
    console.log('Geometry updated:', pcalcData.secao);
}

function updateMaterials() {
    pcalcData.materiais.fck = parseFloat(fckInput.value);
    console.log('Materials updated:', pcalcData.materiais);
}

function renderReinforcement() {
    reinforcementTable.innerHTML = '';
    pcalcData.armacao.barras.forEach((barra, index) => {
        const row = reinforcementTable.insertRow();
        row.innerHTML = `
            <td><input type="number" value="${barra.x}" data-index="${index}" data-prop="x"></td>
            <td><input type="number" value="${barra.y}" data-index="${index}" data-prop="y"></td>
            <td><input type="number" value="${barra.diametro}" data-index="${index}" data-prop="diametro"></td>
            <td><button class="remove-bar-btn" data-index="${index}">Remove</button></td>
        `;
    });
}

function updateReinforcement(event) {
    const target = event.target;
    if (target.tagName === 'INPUT') {
        const index = parseInt(target.dataset.index);
        const prop = target.dataset.prop;
        pcalcData.armacao.barras[index][prop] = parseFloat(target.value);
        console.log('Reinforcement updated:', pcalcData.armacao.barras);
    }
}

function addBar() {
    pcalcData.armacao.barras.push({ x: 5, y: 5, diametro: 20 });
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
        row.innerHTML = `
            <td><input type="number" value="${esforco.n}" data-index="${index}" data-prop="n"></td>
            <td><input type="number" value="${esforco.mx}" data-index="${index}" data-prop="mx"></td>
            <td><input type="number" value="${esforco.my}" data-index="${index}" data-prop="my"></td>
            <td><button class="remove-load-btn" data-index="${index}">Remove</button></td>
        `;
    });
}

function updateLoads(event) {
    const target = event.target;
    if (target.tagName === 'INPUT') {
        const index = parseInt(target.dataset.index);
        const prop = target.dataset.prop;
        pcalcData.esforcos.listaEsforcos[index][prop] = parseFloat(target.value);
        console.log('Loads updated:', pcalcData.esforcos.listaEsforcos);
    }
}

function addLoad() {
    pcalcData.esforcos.listaEsforcos.push({ n: -1000, mx: 150, my: 75 });
    renderLoads();
}

function removeLoad(event) {
    if (event.target.classList.contains('remove-load-btn')) {
        const index = parseInt(event.target.dataset.index);
        pcalcData.esforcos.listaEsforcos.splice(index, 1);
        renderLoads();
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('PCalc Web App Initialized');
    
    // --- INJECT HEADER & FOOTER ---
    // This loads the navigation bar from template-loader.js
    if (window.injectHeader) {
        window.injectHeader({
            activePage: 'pcalc', // Highlight this page in nav
            pageTitle: 'pcalc_title',
            headerPlaceholderId: 'header-placeholder',
            pathPrefix: '../' // Go up one level to find js/ folder
        });
    } else {
        console.error('injectHeader function not found. Check template.js loading.');
    }

    if (window.injectFooter) {
        window.injectFooter({
            footerPlaceholderId: 'footer-placeholder'
        });
    }

    // Initial UI update
    updateGeometry();
    updateMaterials();
    renderReinforcement();
    renderLoads();

    newBtn.addEventListener('click', () => {
        console.log('New button clicked');
        // Logic to reset the pcalcData object and UI
    });

    openBtn.addEventListener('click', () => {
        console.log('Open button clicked');
        // Logic to open a saved file
    });

    saveBtn.addEventListener('click', () => {
        console.log('Save button clicked');
        // Logic to save the current state
    });
});

geometryForm.addEventListener('input', updateGeometry);
materialsForm.addEventListener('input', updateMaterials);
addBarBtn.addEventListener('click', addBar);
reinforcementTable.addEventListener('input', updateReinforcement);
reinforcementTable.addEventListener('click', removeBar);
addLoadBtn.addEventListener('click', addLoad);
loadsTable.addEventListener('input', updateLoads);
loadsTable.addEventListener('click', removeLoad);

calculateBtn.addEventListener('click', () => {
    // --- VALIDATION: Ensure at least one load case is present ---
    if (pcalcData.esforcos.listaEsforcos.length === 0) {
        const feedbackEl = document.getElementById('feedback-message');
        if (feedbackEl) {
            feedbackEl.textContent = 'Please add at least one load case before calculating.';
            feedbackEl.className = 'text-center mt-2 text-sm h-5 text-red-600 dark:text-red-400';
            // Clear the message after a few seconds
            setTimeout(() => {
                feedbackEl.textContent = '';
            }, 4000);
        }
        console.error('Calculation stopped: No loads provided.');
        return; // Stop the function
    }

    console.log('Calculate button clicked, validation passed.');
    discretizeSection(pcalcData);
    calculateMomentCurvature(pcalcData);
    calculateEsforcos(pcalcData);
    renderResults();
    renderChart();
});
nmxmyBtn.addEventListener('click', () => renderChart('N-Mx-My'));
nmxBtn.addEventListener('click', () => renderChart('N-Mx'));
nmyBtn.addEventListener('click', () => renderChart('N-My'));


function discretizeSection(pcalcData) {
    const { secao, config } = pcalcData;

    // --- FIX: Calculate and store gross area and buckling length ---
    // These are required for second-order moment calculations.
    secao.areaAc = secao.hx * secao.hy; // Gross concrete area in cm^2
    // Assuming a bi-supported column for buckling length calculation (le = l)
    secao.lFlamb = secao.hy / 100; // Buckling length in meters (simplified, assuming it's related to hy)

    const { tipoSecao, hx, hy, xm, ym, areaAc } = secao;
    const { nSecao } = config;
    const argSecaoC = [];

    if (tipoSecao === 'Retangular') {
        const nHx = Math.max(10, Math.floor(Math.sqrt((hx * nSecao) / hy)));
        const nHy = Math.max(10, Math.floor(nSecao / nHx));
        for (let iy = 0; iy < nHy; iy++) {
            for (let ix = 0; ix < nHx; ix++) {
                const secaoI = [
                    (((0.5 + ix) * hx) / nHx) - xm,
                    (((0.5 + iy) * hy) / nHy) - ym,
                    ((hx * hy) / nHx) / nHy,
                    hx / nHx,
                    hy / nHy
                ];
                argSecaoC.push(secaoI);
            }
        }
        argSecaoC.push([-xm, -ym, 0, 0, 0]);
        argSecaoC.push([hx - xm, -ym, 0, 0, 0]);
        argSecaoC.push([hx - xm, hy - ym, 0, 0, 0]);
        argSecaoC.push([-xm, hy - ym, 0, 0, 0]);
    } else if (tipoSecao === 'Circular') {
        const rExt = hx / 2;
        const delta = Math.sqrt(areaAc / nSecao);
        const nR = Math.max(10, Math.floor(rExt / delta));
        const rInt = (rExt / nR) / 2;
        for (let i = 0; i < nR; i++) {
            const rI = rExt - (((i + 0.5) * (rExt - rInt)) / nR);
            const nAlpha = Math.floor(Math.max(8, (2 * Math.PI * rI) / delta) / 4) * 4;
            for (let j = 0; j < nAlpha; j++) {
                const alphaJ = (j * 2 * Math.PI) / nAlpha;
                const secaoI = [
                    rI * Math.cos(alphaJ),
                    rI * Math.sin(alphaJ),
                    (Math.PI / nAlpha) * (Math.pow(rI + (0.5 * (rExt - rInt)) / nR, 2) - Math.pow(rI - (0.5 * (rExt - rInt)) / nR, 2)),
                    (rExt - rInt) / nR,
                    (2 * Math.PI * rI) / nAlpha
                ];
                argSecaoC.push(secaoI);
            }
        }
        argSecaoC.push([0, 0, Math.PI * rInt * rInt, rInt, 2 * Math.PI]);
        const nAlpha2 = Math.floor(Math.max(8, (2 * Math.PI * rExt) / delta) / 4) * 4;
        for (let j = 0; j < nAlpha2; j++) {
            const alphaJ = (j * 2 * Math.PI) / nAlpha2;
            argSecaoC.push([rExt * Math.cos(alphaJ), rExt * Math.sin(alphaJ), 0, 0, 0]);
        }
    }

    pcalcData.resultados.secaoC = argSecaoC;

    const { armacao } = pcalcData;
    const argSecaoS = [];
    for (const barra of armacao.barras) {
        const secaoI = [
            barra.x - xm,
            barra.y - ym,
            (Math.PI * Math.pow(barra.diametro / 10, 2)) / 4 // cm^2
        ];
        argSecaoS.push(secaoI);
    }
    pcalcData.resultados.secaoS = argSecaoS;
}

function fc(ec, fcd, tipoCurvaC, ec2, ecu, n) {
    let fc = 0;
    if (tipoCurvaC === 0) { // Parábola-retângulo
        if ((-ec2 < ec) && (ec < 0)) {
            fc = -0.85 * fcd * (1 - Math.pow(1 + (ec / ec2), n));
        }
        if ((-ecu * 1.0001 <= ec) && (ec <= -ec2)) {
            fc = -0.85 * fcd;
        }
    }
    return fc;
}

function fs(es, fyd, moduloS, esu) {
    let fs = 0;
    const eyd = (fyd / moduloS) * 1000;
    if (Math.abs(es) < eyd) {
        fs = moduloS * (es / 1000);
    }
    if ((eyd <= Math.abs(es)) && (Math.abs(es) <= esu)) {
        fs = fyd * (es / Math.abs(es));
    }
    return fs;
}


function rotacionaXY(coordenadas, teta) {
    const coordenadaRot = [];
    for (const coord of coordenadas) {
        const x = coord[0];
        const y = coord[1];
        const xRot = Math.cos(teta) * x + Math.sin(teta) * y;
        const yRot = -Math.sin(teta) * x + Math.cos(teta) * y;
        coordenadaRot.push([xRot, yRot, ...coord.slice(2)]);
    }
    return coordenadaRot;
}


function funcX(xLn, d, yCMin, yCMax, xyCRot, xyAsRot, nd, params) {
    const { n, ec2, ecu, fyd, fcd, modEs, tipoCurvaC } = params;

    let somaNd = 0;
    let fi = 0;
    let ecg = 0;

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
        const aci = secao[2];
        const yci = secao[1];
        const eci = ecg + (yci * fi);
        somaNd += fc(eci, fcd, tipoCurvaC, ec2, ecu, n) * aci;
    }

    for (const secao of xyAsRot) {
        const asi = secao[2];
        const ysi = secao[1];
        const esi = ecg + (ysi * fi);
        somaNd += fs(esi, fyd, modEs, 10.0) * asi;
    }

    return [somaNd - nd, fi, ecg];
}

function calculaMr(nd, tetaLN, pcalcData, params) {
    const { resultados, config } = pcalcData;
    const { secaoC, secaoS } = resultados;
    const { tolVarLn, tolSomaN, tolIt } = config;
    const { n, ec2, ecu, fyd, fcd, modEs, tipoCurvaC } = params;

    const xyCRot = rotacionaXY(secaoC, tetaLN);
    const xyAsRot = rotacionaXY(secaoS, tetaLN);

    let yCMin = 1e11;
    let yCMax = -1e11;
    let yAsMax = -1e11;

    for (const secao of xyCRot) {
        yCMin = Math.min(secao[1], yCMin);
        yCMax = Math.max(secao[1], yCMax);
    }
    for (const secao of xyAsRot) {
        yAsMax = Math.max(secao[1], yAsMax);
    }

    const d = yAsMax - yCMin;
    let x0 = -d;
    let xu = 2 * d;
    let f0 = 0;
    let fu = 0;

    // ... (bisection method to find neutral axis)

    let xLn = 0;
    let fi = 0;
    let ecg = 0;

    // This is a simplified version of the bisection/secant method from the Java code
    // A more robust implementation would be needed for a real application
    for (let i = 0; i < tolIt; i++) {
        const res = funcX(xLn, d, yCMin, yCMax, xyCRot, xyAsRot, nd, params);
        const somaNd = res[0];
        fi = res[1];
        ecg = res[2];

        if (Math.abs(somaNd) < tolSomaN) {
            break;
        }

        if (somaNd < 0) {
            xu = xLn;
        } else {
            x0 = xLn;
        }
        xLn = (x0 + xu) / 2;
    }

    let mrx = 0;
    let mry = 0;

    for (let i = 0; i < secaoC.length; i++) {
        const aci = secaoC[i][2];
        const xci = secaoC[i][0];
        const yci = secaoC[i][1];
        const ycRot = xyCRot[i][1];
        const eci = ecg + (ycRot * fi);
        mrx += (fc(eci, fcd, tipoCurvaC, ec2, ecu, n) * aci * yci) / 100;
        mry += (fc(eci, fcd, tipoCurvaC, ec2, ecu, n) * aci * xci) / 100;
    }

    for (let i = 0; i < secaoS.length; i++) {
        const asi = secaoS[i][2];
        const xsi = secaoS[i][0];
        const ysi = secaoS[i][1];
        const ysRot = xyAsRot[i][1];
        const esi = ecg + (ysRot * fi);
        mrx += (fs(esi, fyd, modEs, 10.0) * asi * ysi) / 100;
        mry += (fs(esi, fyd, modEs, 10.0) * asi * xsi) / 100;
    }

    return [-mry, mrx];
}


function calculateMomentCurvature(pcalcData) {
    const { config, esforcos, resultados, secao } = pcalcData;
    const { fck, fyk, gamaS, gamaC, modEs, tipoCurvaC, nGraficoMr } = config;

    let n = 2.0;
    let ec2 = 2.0;
    let ecu = 3.5;
    if (fck > 0.5) {
        n = 1.4 + 23.4 * Math.pow(0.9 - fck, 4.0);
        ec2 = Math.min(2.0 + 0.085 * Math.pow((100 * fck) - 50, 0.53), 2.6);
        ecu = 2.6 + 35.0 * Math.pow(0.9 - fck, 4.0);
    }

    const fyd = fyk / gamaS;
    const fcd = fck / gamaC;
    const { secaoC, secaoS } = resultados;

    const curvasMr = [];

    for (const esforco of esforcos.listaEsforcos) {
        const nd = esforco.n;
        const curvaMrI = [[], [], [], [], []];
        const nGrafico = nGraficoMr + 1;

        for (let j = 0; j < nGrafico; j++) {
            const tetaLN = (j * 2 * Math.PI) / (nGrafico - 1);
            curvaMrI[0].push(nd);
            curvaMrI[1].push(tetaLN);

            const mr = calculaMr(nd, tetaLN, pcalcData, { n, ec2, ecu, fyd, fcd, modEs, tipoCurvaC });
            curvaMrI[2].push(mr[0]);
            curvaMrI[3].push(mr[1]);
        }
        curvasMr.push(curvaMrI);
    }
    pcalcData.resultados.curvasMr = curvasMr;
    console.log('Moment-curvature curves calculated:', curvasMr);
}

/**
 * Calcula os momentos de 2ª ordem pelo método do pilar-padrão com curvatura aproximada.
 * NBR 6118:2014 - Item 15.8.3.3.4
 * @param {number} nsd - Força normal de cálculo (compressão é negativa, em kN).
 * @param {number} h - Dimensão do pilar na direção considerada (em cm).
 * @param {Array<number>} md1 - Momentos de 1ª ordem [base, meio, topo] (em kNm).
 * @param {object} pcalcData - Objeto de dados principal.
 * @returns {Array<number>} Momentos totais (1ª + 2ª ordem) [base, meio, topo].
 */
function calculateSecondOrderMoments(nsd, h, md1, pcalcData) {
    const { config, secao, materiais } = pcalcData;
    const { fck } = materiais;
    const { gamaC } = config;
    const { areaAc, lFlamb } = secao;

    const md2 = [...md1]; // Inicia com os momentos de 1ª ordem

    // 1. Cálculo da excentricidade de 2ª ordem (e2)
    // e2 = (le^2 / 10) * (1/r)
    const le = lFlamb * 100; // Comprimento de flambagem em cm

    // 2. Cálculo da curvatura (1/r) - Eq. 15.20
    // (1/r) = (ε_c / x)
    // Para o método aproximado, a curvatura é estimada pela Eq. 15.23
    const fcd = fck / gamaC;
    const ni = Math.abs(nsd) / (areaAc * (fcd * 10)); // Adimensional (nsd em kN, areaAc em cm², fcd em MPa -> kN/cm²)
    
    // Curvatura (1/r) conforme Eq. 15.23
    // O fator 0.005/h é o valor máximo para a curvatura.
    // O termo (ni + 0.5) reduz a curvatura para pilares com baixa compressão.
    const invR = Math.min((0.005 / h) / (ni + 0.5), 0.005 / h);

    // 3. Cálculo do momento de 2ª ordem (M2d)
    // M2d = Nd * e2 = Nd * (le^2 / 10) * (1/r)
    const m2d = Math.abs(nsd) * (le * le / 10) * invR; // Em kNm

    // 4. Adiciona o momento de 2ª ordem ao momento de 1ª ordem no meio do pilar
    // O sinal é adicionado para aumentar o momento de 1ª ordem.
    if (md2[1] !== 0) {
        md2[1] += m2d * (md2[1] / Math.abs(md2[1]));
    } else {
        // Se o momento no meio for zero, o momento de 2ª ordem é simplesmente adicionado.
        // A norma não é explícita sobre o sinal, mas assume-se que ele age na direção mais desfavorável.
        // Para um pilar birotulado com carga centrada, o momento de 1ª ordem é zero, mas o de 2ª não.
        // Adotamos o valor absoluto.
        md2[1] = m2d;
    }

    // 5. Verificação do momento mínimo (M1d,min) - Item 17.2.4.7.1
    // M1d,min = Nd * (1.5 + 0.03 * h) em cm
    const m1d_min = Math.abs(nsd) * (1.5 + 0.03 * h) / 100; // em kNm

    // O momento total deve ser, no mínimo, o momento de 1ª ordem acrescido do de 2ª,
    // e também no mínimo o momento mínimo.
    const momento_final_meio = Math.max(Math.abs(md2[1]), m1d_min);

    // Retorna os momentos finais, ajustando o sinal do momento no meio
    return [md1[0], momento_final_meio * (md1[1] !== 0 ? md1[1]/Math.abs(md1[1]) : 1), md1[2]];
}


function calculaMomento1Ord(mdTopo, mdBase, pcalcData) {
    // ...
    return [mdBase, (mdTopo+mdBase)/2, mdTopo]
}


function calculateEsforcos(pcalcData) {
    const { config, esforcos, secao } = pcalcData;
    const gamaF = 1.4; // Fator de ponderação para ações
    const { tipoVinculacao } = secao;

    const nsd = [];
    const msxd = [];
    const msyd = [];
    const msxd2 = [];
    const msyd2 = [];
    const msdMin = [];

    for (const esforco of esforcos.listaEsforcos) {
        const nsdI = gamaF * esforco.n;
        nsd.push(nsdI);

        if (tipoVinculacao === 0) {
            msxd.push([gamaF * esforco.mx]);
            msyd.push([gamaF * esforco.my]);
            msxd2.push(msxd[msxd.length - 1]);
            msyd2.push(msyd[msyd.length - 1]);
        } else {
            const msxdTopoI = gamaF * esforco.mx;
            const msxdBaseI = gamaF * esforco.mx; // Assuming same moment at base for now
            msxd.push(calculaMomento1Ord(msxdTopoI, msxdBaseI, pcalcData));

            if (config.calcular2ord === 1 && nsdI < 0 && config.metodoSegOrd === 1) {
                msxd2.push(calculateSecondOrderMoments(nsdI, secao.hy, msxd[msxd.length - 1], pcalcData));
            } else {
                msxd2.push(msxd[msxd.length - 1]);
            }

            const msydTopoI = gamaF * -esforco.my;
            const msydBaseI = gamaF * -esforco.my; // Assuming same moment at base for now
            msyd.push(calculaMomento1Ord(msydTopoI, msydBaseI, pcalcData));

            if (config.calcular2ord === 1 && nsdI < 0 && config.metodoSegOrd === 1) {
                msyd2.push(calculateSecondOrderMoments(nsdI, secao.hx, msyd[msyd.length - 1], pcalcData));
            } else {
                msyd2.push(msyd[msyd.length - 1]);
            }
        }
    }

    pcalcData.resultados.esforcos = {
        nsd,
        msxd,
        msyd,
        msxd2,
        msyd2
    };

    console.log('Esforcos calculated:', pcalcData.resultados.esforcos);
}

function calculaMomento2OrdP1(nsd, h, md1, pcalcData) {
    const { config, secao } = pcalcData;
    const { fcd } = config;
    const { areaAc, lFlamb } = secao;

    const md2 = [...md1];
    const ni = Math.abs((nsd / areaAc) / fcd);
    const invR = Math.min((0.005 / h) / (ni + 0.5), 0.005 / h);
    if (md2[1] !== 0) {
        md2[1] = md2[1] - (((((nsd * lFlamb) / 100) * lFlamb) / 100) / 10) * invR * (md2[1] / Math.abs(md2[1]));
    }
    return md2;
}


// ... (other calculation functions will be added here)