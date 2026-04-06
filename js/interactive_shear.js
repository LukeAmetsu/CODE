let shearData = null;
let chartInstance = null;
let chartD, chartRho, chartFck, chartAd = null;

const params = {
    C: { val: 0.18, min: 0.05, max: 0.5, step: 0.01, label: 'C (Constant)' },
    alpha: { val: 0.5, min: -1.0, max: 1.0, step: 0.01, label: 'α (Size Effect)' },
    beta: { val: 0.33, min: -1.0, max: 1.0, step: 0.01, label: 'β (Rho)' },
    gamma: { val: 0.33, min: -1.0, max: 1.0, step: 0.01, label: 'γ (Fck)' },
    delta: { val: -0.5, min: -1.5, max: 0.5, step: 0.01, label: 'δ (a/d)' }
};

let rawData = [];
let dbChart = null;
let isUpdatingExplorer = false;

document.addEventListener('DOMContentLoaded', async () => {
    buildSliders();

    try {
        const result = await eel.get_shear_dataset()();
        if (result.error) {
            alert("Error loading data: " + result.error);
            return;
        }
        shearData = result;

        const resAll = await eel.get_all_codes_dataset()();
        if (!resAll.error) {
            rawData = resAll;
        } else {
            console.error("Failed to load ALL DATA:", resAll.error);
        }

        document.getElementById('loadingIndicator').classList.add('hidden');
        document.getElementById('mainContent').classList.remove('hidden');
        document.getElementById('explorerContainer').classList.remove('hidden');

        initChart();
        updateMath();
        initDatabaseChart();
        updateDatabaseChart();

        document.getElementById('codeSelect').addEventListener('change', updateDatabaseChart);
        document.getElementById('varSelect').addEventListener('change', updateDatabaseChart);
        document.getElementById('subsetSelect').addEventListener('change', updateDatabaseChart);
    } catch (e) {
        console.error("Failed to load: ", e);
    }

    document.getElementById('btnOptimize').addEventListener('click', optimizeEquation);
});

function buildSliders() {
    const container = document.getElementById('slidersContainer');
    Object.keys(params).forEach(key => {
        const p = params[key];
        const row = document.createElement('div');
        row.className = 'flex flex-col mb-3';

        row.innerHTML = `
            <div class="flex justify-between items-center text-sm font-semibold mb-1">
                <span>${p.label}</span>
                <input type="number" id="inp_${key}" value="${p.val.toFixed(3)}" step="0.01" class="w-20 p-1 text-right bg-transparent border-b border-gray-400 focus:outline-none focus:border-blue-500 text-blue-500 font-bold">
            </div>
            <input type="range" id="slider_${key}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.val}" class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700">
        `;

        container.appendChild(row);

        const slider = document.getElementById(`slider_${key}`);
        const inp = document.getElementById(`inp_${key}`);

        slider.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value);
            params[key].val = v;
            inp.value = v.toFixed(3);
            updateMath();
        });

        inp.addEventListener('input', (e) => {
            let v = parseFloat(e.target.value);
            if (isNaN(v)) return; // dont override until they finish typing
            params[key].val = v;
            slider.value = v;
            updateMath();
        });
    });
}

function updateSlidersUI() {
    Object.keys(params).forEach(key => {
        const p = params[key];
        document.getElementById(`slider_${key}`).value = p.val;
        document.getElementById(`inp_${key}`).value = p.val.toFixed(3);
    });
}

function updateMath() {
    if (!shearData) return;

    const C = params.C.val;
    const alpha = params.alpha.val;
    const beta = params.beta.val;
    const gamma = params.gamma.val;
    const delta = params.delta.val;

    const len = shearData.V_test.length;
    let sumRatio = 0;
    const ratios = new Float32Array(len);
    const plotData = [];

    // Sub-chart data
    const pD = [], pRho = [], pFck = [], pAd = [];

    for (let i = 0; i < len; i++) {
        let bw = shearData.bw[i];
        let d = shearData.d[i];
        let rho = shearData.rho[i];
        let fck = shearData.fck[i];
        let a_d = shearData.a_d[i];
        let V_test = shearData.V_test[i];

        let size_effect = Math.pow(1 + 200 / d, alpha);
        let vc = C * size_effect * Math.pow(rho, beta) * Math.pow(fck, gamma) * Math.pow(a_d, delta);
        let V_calc = vc * bw * d;

        let ratio = V_test / V_calc;
        ratios[i] = ratio;
        sumRatio += ratio;

        if (i % 2 === 0 || len < 1500) {
            plotData.push({ x: V_calc / 1000, y: V_test / 1000 });
            pD.push({ x: d, y: ratio });
            pRho.push({ x: rho, y: ratio });
            pFck.push({ x: fck, y: ratio });
            pAd.push({ x: a_d, y: ratio });
        }
    }

    let mean = sumRatio / len;

    let sqDiffSum = 0;
    for (let i = 0; i < len; i++) {
        let diff = ratios[i] - mean;
        sqDiffSum += diff * diff;
    }
    let std = Math.sqrt(sqDiffSum / len);
    let cov = std / mean;

    document.getElementById('statMean').innerHTML = mean.toFixed(3) + (mean < 1.0 ? ' <span class="text-red-500 text-sm font-bold">⚠ Unsafe</span>' : '');
    document.getElementById('statCov').innerText = cov.toFixed(3);

    // Render Live Equation
    if (window.katex) {
        const C_str = C.toFixed(3);
        const a_str = alpha.toFixed(3);
        const b_str = beta.toFixed(3);
        const g_str = gamma.toFixed(3);
        const d_str = delta.toFixed(3);

        const eqStr = `V_{calc} = ${C_str} \\left(1 + \\frac{200}{d}\\right)^{${a_str}} \\rho^{${b_str}} f_{ck}^{${g_str}} \\left(\\frac{a}{d}\\right)^{${d_str}} b_w d`;
        katex.render(eqStr, document.getElementById('mathEquation'), {
            throwOnError: false,
            displayMode: true
        });
    }

    if (chartInstance) {
        chartInstance.data.datasets[0].data = plotData;

        let maxV = 0;
        for (let i = 0; i < plotData.length; i++) {
            if (plotData[i].x > maxV) maxV = plotData[i].x;
            if (plotData[i].y > maxV) maxV = plotData[i].y;
        }
        maxV = Math.min(maxV, 2000);
        chartInstance.data.datasets[1].data = [{ x: 0, y: 0 }, { x: maxV, y: maxV }];
        chartInstance.update('none');
    }

    // Auto sync Live Model into universal explorer if active
    if (document.getElementById('codeSelect') && document.getElementById('codeSelect').value === 'LIVE_MODEL') {
        updateDatabaseChart();
    }
}

function initChart() {
    const ctx = document.getElementById('shearChart').getContext('2d');
    chartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Elements (V_calc vs V_test)',
                data: [],
                backgroundColor: 'rgba(59, 130, 246, 0.4)',
                pointRadius: 3,
                borderWidth: 0
            },
            {
                label: 'Perfect Fit (y=x)',
                data: [],
                type: 'line',
                borderColor: 'rgba(0, 0, 0, 0.7)',
                borderDash: [5, 5],
                pointRadius: 0,
                borderWidth: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            scales: {
                x: { title: { display: true, text: 'Calculated Shear V_calc (kN)' }, min: 0 },
                y: { title: { display: true, text: 'Tested Shear V_test (kN)' }, min: 0 }
            }
        }
    });
}

async function optimizeEquation() {
    const btn = document.getElementById('btnOptimize');
    const originalText = btn.innerHTML;
    btn.innerHTML = `Running SciPy...`;
    btn.disabled = true;

    const tsInput = document.getElementById('inpTargetSafety');
    let targetSafety = 1.0;
    if (tsInput && !isNaN(parseFloat(tsInput.value))) {
        targetSafety = parseFloat(tsInput.value);
    }

    try {
        const best = await eel.run_scipy_optimization(targetSafety)();
        if (best.error) {
            alert("Optimization failed: " + best.error);
        } else {
            Object.keys(best).forEach(k => {
                if (params[k]) {
                    params[k].val = best[k];
                    let s = document.getElementById(`slider_${k}`);
                    // Dynamically expand slider boundaries if the optimal math exceeds what was pre-defined!
                    if (best[k] < parseFloat(s.min)) s.min = (best[k] > 0 ? 0 : Math.floor(best[k] * 10) / 10);
                    if (best[k] > parseFloat(s.max)) s.max = Math.ceil(best[k] * 10) / 10;
                }
            });
            updateSlidersUI();
            updateMath();
        }
    } catch (e) { console.error(e); }

    btn.innerHTML = originalText;
    btn.disabled = false;
}

function calculateBins(dataPoints, numBins = 10) {
    if (dataPoints.length === 0) return { p05: [], p10: [] };
    let minX = Math.min(...dataPoints.map(d => d.x));
    let maxX = Math.max(...dataPoints.map(d => d.x));
    if (minX === maxX) return { p05: [], p10: [] };

    let binWidth = (maxX - minX) / numBins;
    let bins = Array.from({ length: numBins }, () => []);

    for (let dp of dataPoints) {
        let bIdx = Math.floor((dp.x - minX) / binWidth);
        if (bIdx >= numBins) bIdx = numBins - 1;
        if (bIdx < 0) bIdx = 0;
        bins[bIdx].push(dp.y);
    }

    let p05 = [];
    let p10 = [];

    for (let i = 0; i < numBins; i++) {
        let bData = bins[i].sort((a, b) => a - b);
        let centerX = minX + (i + 0.5) * binWidth;

        if (bData.length >= 3) {
            let idx05 = Math.floor(0.05 * bData.length);
            let idx10 = Math.floor(0.10 * bData.length);
            p05.push({ x: centerX, y: bData[idx05] });
            p10.push({ x: centerX, y: bData[idx10] });
        }
    }
    return { p05, p10 };
}

async function updateDatabaseChart() {
    if (!rawData.length || isUpdatingExplorer || !dbChart) return;
    isUpdatingExplorer = true;

    const codeKey = document.getElementById('codeSelect').value;
    const codeName = document.getElementById('codeSelect').options[document.getElementById('codeSelect').selectedIndex].text;
    const varKey = document.getElementById('varSelect').value;
    const subsetKey = document.getElementById('subsetSelect').value;

    const plotPoints = [];
    for (let row of rawData) {
        if (subsetKey !== 'ALL DATA' && row[subsetKey] != 1) continue;

        let xVal = row[varKey];
        let yVal = row[codeKey];

        if (codeKey === 'LIVE_MODEL') {
            let bd = parseFloat(row['d (mm)']);
            let bbw = parseFloat(row['bw (mm)'] ?? row['b (mm)']);
            if (isNaN(bbw) && !isNaN(parseFloat(row['bw/d ratio'])) && !isNaN(bd)) {
                bbw = parseFloat(row['bw/d ratio']) * bd;
            }
            let brho = parseFloat(row['pw (%)'] ?? row['rho']);
            let bfck = parseFloat(row['fck (MPa)'] ?? row['fck_eq']);
            let ba_mm = parseFloat(row['a:M/V (mm)']);   // shear SPAN in mm, NOT a/d ratio
            let bVtest_kN = parseFloat(row['Vu (kN)']);  // already in kN

            if (!isNaN(bd) && bd > 0 && !isNaN(brho) && brho > 0
                && !isNaN(bfck) && bfck > 0 && !isNaN(ba_mm) && ba_mm > 0
                && !isNaN(bbw) && bbw > 0 && !isNaN(bVtest_kN) && bVtest_kN > 0) {

                let rho = brho;
                if (rho > 0.1) rho = rho / 100.0;   // Automatically detect % → fraction
                const a_d_ratio = ba_mm / bd;   // mm/mm → dimensionless

                let size_effect = Math.pow(1 + 200 / bd, params.alpha.val);
                let vc = params.C.val * size_effect
                    * Math.pow(rho, params.beta.val)
                    * Math.pow(bfck, params.gamma.val)
                    * Math.pow(a_d_ratio, params.delta.val); // result in MPa (N/mm²)
                let V_calc_kN = vc * bbw * bd / 1000.0; // N → kN

                yVal = bVtest_kN / V_calc_kN;
            } else {
                continue;
            }
        }

        if (xVal !== null && xVal !== undefined && yVal !== null && yVal !== undefined) {
            let px = parseFloat(xVal);
            let py = parseFloat(yVal);
            if (!isNaN(px) && !isNaN(py)) {
                plotPoints.push({ x: px, y: py });
            }
        }
    }

    document.getElementById('lblPoints').innerText = plotPoints.length;
    plotPoints.sort((a, b) => a.x - b.x);

    let maxX = 0;
    if (plotPoints.length > 0) maxX = plotPoints[plotPoints.length - 1].x;

    let perc = calculateBins(plotPoints, 10);

    let sx = []; let sy = [];
    for (let pt of plotPoints) { sx.push(pt.x); sy.push(pt.y); }

    let lowessLine = [];
    try {
        lowessLine = await eel.get_python_lowess(sx, sy, 0.3)();
    } catch (e) {
        console.error("Python LOWESS failed: ", e);
    }

    dbChart.data.datasets[0].data = plotPoints;
    dbChart.data.datasets[1].data = lowessLine;
    dbChart.data.datasets[2].data = perc.p10;
    dbChart.data.datasets[3].data = perc.p05;
    dbChart.data.datasets[4].data = [{ x: 0, y: 1.0 }, { x: maxX, y: 1.0 }];

    dbChart.options.scales.x.title.text = varKey;
    dbChart.options.scales.y.title.text = codeName + (codeKey === 'LIVE_MODEL' ? ' (V_test / V_calc)' : ' (V_test / V_code)');

    dbChart.update('none');
    isUpdatingExplorer = false;
}

function initDatabaseChart() {
    const ctx = document.getElementById('databaseChart').getContext('2d');

    const customCanvasBackgroundColor = {
        id: 'customCanvasBackgroundColor',
        beforeDraw: (chart, args, options) => {
            const { ctx } = chart;
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = options.color || '#ffffff';
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    };

    dbChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Shear Elements',
                    data: [],
                    backgroundColor: 'rgba(59, 130, 246, 0.3)',
                    pointRadius: 3,
                    borderWidth: 0,
                    order: 5
                },
                {
                    label: 'LOWESS Trend',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(0, 0, 0, 0.9)',
                    pointRadius: 0,
                    borderWidth: 3,
                    fill: false,
                    order: 4
                },
                {
                    label: '10th Percentile (Bin)',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(251, 146, 60, 1)',
                    borderDash: [5, 5],
                    pointRadius: 4,
                    borderWidth: 2,
                    fill: false,
                    order: 3
                },
                {
                    label: '5th Percentile (Bin)',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderDash: [2, 2],
                    pointRadius: 4,
                    borderWidth: 2,
                    fill: false,
                    order: 2
                },
                {
                    label: 'Safety Threshold',
                    data: [],
                    type: 'line',
                    borderColor: 'rgba(239, 68, 68, 0.9)',
                    borderDash: [5, 5],
                    pointRadius: 0,
                    borderWidth: 2,
                    fill: 'start',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                customCanvasBackgroundColor: { color: 'white' }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Variable', font: { size: 14, weight: 'bold' } },
                    min: 0
                },
                y: {
                    title: { display: true, text: 'V_test / Ratio', font: { size: 14, weight: 'bold' } },
                    min: 0,
                    max: 4.0
                }
            }
        },
        plugins: [customCanvasBackgroundColor]
    });
}

function downloadChart() {
    if (!dbChart) return;
    const link = document.createElement('a');

    const codeKey = document.getElementById('codeSelect').value;
    const varKey = document.getElementById('varSelect').value.replace(/[\/\:\s\(\)]/g, '_');
    const subsetKey = document.getElementById('subsetSelect').value.replace('>', 'gt');

    link.download = `plot_${codeKey}_vs_${varKey}_subset_${subsetKey}.png`;
    link.href = document.getElementById('databaseChart').toDataURL('image/png', 1.0);
    link.click();
}
