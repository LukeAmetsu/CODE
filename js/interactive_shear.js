let shearData = null;
let chartD, chartRho, chartFck, chartAd = null;

const params = {
    C: { val: 0.18, min: 0.05, max: 0.5, step: 0.01, label: 'C (Constant)' },
    alpha: { val: 0.5, min: -1.0, max: 1.0, step: 0.01, label: 'α (Size Effect)' },
    beta: { val: 0.33, min: -1.0, max: 1.0, step: 0.01, label: 'β (Rho)' },
    gamma: { val: 0.33, min: -1.0, max: 1.0, step: 0.01, label: 'γ (Fck)' },
    delta: { val: -0.5, min: -1.5, max: 0.5, step: 0.01, label: 'δ (a/d)' },
    epsilon: { val: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'ε (bw)' },
    zeta: { val: 1.0, min: 0.0, max: 2.0, step: 0.01, label: 'ζ (d)' }
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

        updateMath();
        initDatabaseChart();
        updateDatabaseChart();

        document.querySelectorAll('.design-code-checkbox').forEach(cb => cb.addEventListener('change', updateDatabaseChart));
        document.getElementById('varSelect').addEventListener('change', updateDatabaseChart);
        document.getElementById('subsetSelect').addEventListener('change', updateDatabaseChart);
        document.getElementById('subsetSelect').addEventListener('change', updateMath);
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

function isRowInSubset(row, subsetKey) {
    if (subsetKey === 'ALL DATA') return true;
    if (subsetKey === 'B>2D') return row['B>2D'] == 1;
    if (subsetKey === 'B>5D') return row['B>5D'] == 1;
    if (subsetKey === 'B>600mm') return row['B>600mm'] == 1;
    
    let bd = parseFloat(row['d (mm)']);
    let brho = parseFloat(row['pw (%)'] ?? row['rho']);
    let bfck = parseFloat(row['fck (MPa)'] ?? row['fck_eq']);
    let ba_mm = parseFloat(row['a:M/V (mm)']);
    let bbw = parseFloat(row['bw (mm)'] ?? row['b (mm)']);
    if (isNaN(bbw) && !isNaN(parseFloat(row['bw/d ratio'])) && !isNaN(bd)) {
        bbw = parseFloat(row['bw/d ratio']) * bd;
    }
    let bd_dg = parseFloat(row['d_dg']);
    if (isNaN(bd_dg) || bd_dg <= 0) bd_dg = 32.0;
    
    if (subsetKey === 'd>400') return bd > 400;
    if (subsetKey === 'fck>50') return bfck > 50;
    if (subsetKey === 'rho<1') return brho < 1.0;
    if (subsetKey === 'a_d>2.5') return (bd > 0 && (ba_mm / bd) > 2.5);
    if (subsetKey === 'bw>300') return bbw > 300;
    if (subsetKey === 'd_dg>32') return bd_dg > 32.0;

    return false;
}

function updateMath() {
    if (!rawData || !rawData.length) return;

    const C = params.C.val;
    const alpha = params.alpha.val;
    const beta = params.beta.val;
    const gamma = params.gamma.val;
    const delta = params.delta.val;
    const epsilon = params.epsilon.val;
    const zeta = params.zeta.val;

    const subsetKey = document.getElementById('subsetSelect').value;
    const len = rawData.length;
    let sumRatio = 0;
    const ratios = [];
    const plotData = [];
    let validCount = 0;

    // Sub-chart data
    const pD = [], pRho = [], pFck = [], pAd = [];

    for (let i = 0; i < len; i++) {
        let row = rawData[i];
        if (!isRowInSubset(row, subsetKey)) continue;

        let bd = parseFloat(row['d (mm)']);
        let bbw = parseFloat(row['bw (mm)'] ?? row['b (mm)']);
        if (isNaN(bbw) && !isNaN(parseFloat(row['bw/d ratio'])) && !isNaN(bd)) {
            bbw = parseFloat(row['bw/d ratio']) * bd;
        }
        let brho = parseFloat(row['pw (%)'] ?? row['rho']);
        let bfck = parseFloat(row['fck (MPa)'] ?? row['fck_eq']);
        let ba_mm = parseFloat(row['a:M/V (mm)']);
        let bVtest_kN = parseFloat(row['Vu (kN)']);
        let bd_dg = parseFloat(row['d_dg']);
        if (isNaN(bd_dg) || bd_dg <= 0) bd_dg = 32.0;

        if (!isNaN(bd) && bd > 0 && !isNaN(brho) && brho > 0
            && !isNaN(bfck) && bfck > 0 && !isNaN(ba_mm) && ba_mm > 0
            && !isNaN(bbw) && bbw > 0 && !isNaN(bVtest_kN) && bVtest_kN > 0) {
            
            let rho = brho;
            if (rho > 0.1) rho = rho / 100.0;
            const a_d = ba_mm / bd;

            let size_effect = Math.pow(bd_dg / bd, alpha);
            let vc = C * size_effect * Math.pow(rho, beta) * Math.pow(bfck, gamma) * Math.pow(a_d, delta);
            let V_calc = vc * Math.pow(bbw, epsilon) * Math.pow(bd, zeta);
            let V_calc_kN = V_calc / 1000.0;

            let ratio = bVtest_kN / V_calc_kN;
            ratios.push(ratio);
            sumRatio += ratio;
            validCount++;

            if (validCount % 2 === 0 || len < 1500) {
                plotData.push({ x: V_calc_kN, y: bVtest_kN });
                pD.push({ x: bd, y: ratio });
                pRho.push({ x: rho, y: ratio });
                pFck.push({ x: bfck, y: ratio });
                pAd.push({ x: a_d, y: ratio });
            }
        }
    }

    if (validCount === 0) return;

    let mean = sumRatio / validCount;

    let sqDiffSum = 0;
    for (let i = 0; i < validCount; i++) {
        let diff = ratios[i] - mean;
        sqDiffSum += diff * diff;
    }
    let std = Math.sqrt(sqDiffSum / validCount);
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
        const e_str = epsilon.toFixed(3);
        const z_str = zeta.toFixed(3);

        const eqStr = `V_{calc} = ${C_str} \\left(\\frac{d_{dg}}{d}\\right)^{${a_str}} \\rho^{${b_str}} f_{ck}^{${g_str}} \\left(\\frac{a}{d}\\right)^{${d_str}} b_w^{${e_str}} d^{${z_str}}`;
        katex.render(eqStr, document.getElementById('mathEquation'), {
            throwOnError: false,
            displayMode: true
        });
    }

    // Auto sync Live Model into universal explorer if active
    const liveCb = document.querySelector('.design-code-checkbox[value="LIVE_MODEL"]');
    if (liveCb && liveCb.checked) {
        updateDatabaseChart();
    }
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
    if (dataPoints.length === 0) return { p05: [], p10: [], pMean: [] };
    let minX = Math.min(...dataPoints.map(d => d.x));
    let maxX = Math.max(...dataPoints.map(d => d.x));
    if (minX === maxX) return { p05: [], p10: [], pMean: [] };

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
    let pMean = [];

    for (let i = 0; i < numBins; i++) {
        let bData = bins[i].sort((a, b) => a - b);
        let centerX = minX + (i + 0.5) * binWidth;

        if (bData.length > 0) {
            let sum = bData.reduce((a, b) => a + b, 0);
            let mean = sum / bData.length;
            pMean.push({ x: centerX, y: mean });
        }

        if (bData.length >= 3) {
            let idx05 = Math.floor(0.05 * bData.length);
            let idx10 = Math.floor(0.10 * bData.length);
            p05.push({ x: centerX, y: bData[idx05] });
            p10.push({ x: centerX, y: bData[idx10] });
        }
    }
    return { p05, p10, pMean };
}

async function updateDatabaseChart() {
    if (!rawData.length || isUpdatingExplorer || !dbChart) return;
    isUpdatingExplorer = true;

    const selectedCbs = Array.from(document.querySelectorAll('.design-code-checkbox:checked'));
    const varKey = document.getElementById('varSelect').value;
    const subsetKey = document.getElementById('subsetSelect').value;

    if (selectedCbs.length === 0) {
        dbChart.data.datasets = [];
        dbChart.update('none');
        document.getElementById('lblPoints').innerText = '0';
        isUpdatingExplorer = false;
        return;
    }

    const colorPalette = {
        'LIVE_MODEL': '168, 85, 247', // Purple
        'R_6118': '59, 130, 246',     // Blue
        'R_EC_2004': '34, 197, 94',   // Green
        'R_EC_2023': '16, 185, 129',  // Emerald
        'R_ACI318_14': '239, 68, 68', // Red
        'R_ACI318_19': '249, 115, 22',// Orange
        'R_MC2010': '234, 179, 8',    // Yellow
        'A_MC2010_L1': '129, 140, 248', // Indigo
        'A_MC2010_L2': '79, 70, 229',   // Indigo Darker
        'A_EC2_2004': '45, 212, 191',   // Teal
        'A_EC2_2023': '16, 185, 129',   // Emerald
        'A_ACI_14': '251, 113, 133',    // Rose
        'A_ACI_19': '225, 29, 72',      // Rose Darker
        'A_NBR6118': '56, 189, 248'     // Sky
    };

    let newDatasets = [];
    let overallMaxX = 0;
    let primaryPointsLength = 0;
    let allLowessCurves = {};

    for (let i = 0; i < selectedCbs.length; i++) {
        const codeKey = selectedCbs[i].value;
        const codeName = selectedCbs[i].nextElementSibling.innerText.trim();
        const baseColor = colorPalette[codeKey] || '100, 100, 100';

        const plotPoints = [];
        for (let row of rawData) {
            if (!isRowInSubset(row, subsetKey)) continue;

            let xVal = row[varKey];
            if (varKey === 'd_dg') {
                xVal = parseFloat(row['d_dg']);
                if (isNaN(xVal) || xVal <= 0) xVal = 32.0;
            }
            let yVal = row[codeKey];

            if (codeKey === 'LIVE_MODEL') {
                let bd = parseFloat(row['d (mm)']);
                let bbw = parseFloat(row['bw (mm)'] ?? row['b (mm)']);
                if (isNaN(bbw) && !isNaN(parseFloat(row['bw/d ratio'])) && !isNaN(bd)) {
                    bbw = parseFloat(row['bw/d ratio']) * bd;
                }
                let brho = parseFloat(row['pw (%)'] ?? row['rho']);
                let bfck = parseFloat(row['fck (MPa)'] ?? row['fck_eq']);
                let ba_mm = parseFloat(row['a:M/V (mm)']);
                let bVtest_kN = parseFloat(row['Vu (kN)']);
                let bd_dg = parseFloat(row['d_dg']);
                if (isNaN(bd_dg) || bd_dg <= 0) bd_dg = 32.0;

                if (!isNaN(bd) && bd > 0 && !isNaN(brho) && brho > 0
                    && !isNaN(bfck) && bfck > 0 && !isNaN(ba_mm) && ba_mm > 0
                    && !isNaN(bbw) && bbw > 0 && !isNaN(bVtest_kN) && bVtest_kN > 0) {

                    let rho = brho;
                    if (rho > 0.1) rho = rho / 100.0;
                    const a_d_ratio = ba_mm / bd;

                    let size_effect = Math.pow(bd_dg / bd, params.alpha.val);
                    let vc = params.C.val * size_effect
                        * Math.pow(rho, params.beta.val)
                        * Math.pow(bfck, params.gamma.val)
                        * Math.pow(a_d_ratio, params.delta.val);
                    let V_calc_kN = vc * Math.pow(bbw, params.epsilon.val) * Math.pow(bd, params.zeta.val) / 1000.0;

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

        plotPoints.sort((a, b) => a.x - b.x);
        
        if (i === 0) {
            primaryPointsLength = plotPoints.length;
        }

        let sumRatio = 0;
        for (let pt of plotPoints) sumRatio += pt.y;
        let mean = plotPoints.length > 0 ? sumRatio / plotPoints.length : 0;
        
        let sqDiffSum = 0;
        for (let pt of plotPoints) sqDiffSum += Math.pow(pt.y - mean, 2);
        let std = plotPoints.length > 0 ? Math.sqrt(sqDiffSum / plotPoints.length) : 0;
        let cov = mean > 0 ? std / mean : 0;

        if (plotPoints.length > 0 && plotPoints[plotPoints.length - 1].x > overallMaxX) {
            overallMaxX = plotPoints[plotPoints.length - 1].x;
        }

        let sx = []; let sy = [];
        for (let pt of plotPoints) { sx.push(pt.x); sy.push(pt.y); }

        let lowessLine = [];
        try {
            if (sx.length > 5) {
                lowessLine = await eel.get_python_lowess(sx, sy, 0.3)();
            }
        } catch (e) {
            console.error("Python LOWESS failed: ", e);
        }

        if (i === 0 || selectedCbs.length === 1) {
            newDatasets.push({
                label: `${codeName} (Elements)`,
                data: plotPoints,
                backgroundColor: `rgba(${baseColor}, 0.15)`,
                pointRadius: 3,
                borderWidth: 0,
                order: 10 + i
            });
            
            if (selectedCbs.length === 1) {
                let perc = calculateBins(plotPoints, 10);
                newDatasets.push({
                    label: '10th Percentile (Bin)',
                    data: perc.p10,
                    type: 'line',
                    borderColor: 'rgba(251, 146, 60, 1)',
                    borderDash: [5, 5],
                    pointRadius: 4,
                    borderWidth: 2,
                    fill: false,
                    order: 3
                });
                newDatasets.push({
                    label: '5th Percentile (Bin)',
                    data: perc.p05,
                    type: 'line',
                    borderColor: 'rgba(239, 68, 68, 1)',
                    borderDash: [2, 2],
                    pointRadius: 4,
                    borderWidth: 2,
                    fill: false,
                    order: 2
                });
                newDatasets.push({
                    label: 'Mean (Bin)',
                    data: perc.pMean,
                    type: 'line',
                    borderColor: 'rgba(34, 197, 94, 1)',
                    borderDash: [5, 5],
                    pointRadius: 4,
                    borderWidth: 2,
                    fill: false,
                    order: 4
                });
            }
        }

        let lowessColor = `rgba(${baseColor}, 0.9)`;
        if (codeKey === 'LIVE_MODEL') {
            lowessColor = 'rgba(0, 0, 0, 1)';
        }

        newDatasets.push({
            label: `${codeName} (Mean: ${mean.toFixed(2)}, CoV: ${cov.toFixed(2)})`,
            data: lowessLine,
            type: 'line',
            borderColor: lowessColor,
            pointRadius: 0,
            borderWidth: 3,
            fill: false,
            order: 5 - i
        });
        
        allLowessCurves[codeKey] = {
            name: codeName,
            data: lowessLine,
            color: `rgba(${baseColor}, 1)`
        };
    }

    newDatasets.push({
        label: 'Safety Threshold',
        data: [{ x: 0, y: 1.0 }, { x: overallMaxX || 1000, y: 1.0 }],
        type: 'line',
        borderColor: 'rgba(239, 68, 68, 0.9)',
        borderDash: [5, 5],
        pointRadius: 0,
        borderWidth: 2,
        fill: 'start',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        order: 1
    });

    document.getElementById('lblPoints').innerText = primaryPointsLength;

    dbChart.data.datasets = newDatasets;
    dbChart.options.scales.x.title.text = varKey;
    dbChart.options.scales.y.title.text = selectedCbs.length === 1 ? selectedCbs[0].nextElementSibling.innerText + ' (V_test / V_calc)' : 'V_test / V_calc (Comparison)';

    dbChart.update('none');
    isUpdatingExplorer = false;
    
    // Call Python for similarity metrics
    if (allLowessCurves['LIVE_MODEL'] && Object.keys(allLowessCurves).length > 1) {
        document.getElementById('similarityPanel').classList.remove('hidden');
        document.getElementById('simWait').classList.remove('hidden');
        
        let liveCurve = allLowessCurves['LIVE_MODEL'].data;
        let otherCurves = {};
        for (let k in allLowessCurves) {
            if (k !== 'LIVE_MODEL') otherCurves[k] = allLowessCurves[k].data;
        }
        
        eel.compare_lowess_curves_batch(liveCurve, otherCurves)().then(results => {
            document.getElementById('simWait').classList.add('hidden');
            let html = '';
            for (let k in results) {
                let res = results[k];
                let color = allLowessCurves[k].color;
                let name = allLowessCurves[k].name;
                
                let rClass = res.pearson > 0.9 ? 'text-green-400' : (res.pearson > 0.7 ? 'text-yellow-400' : 'text-red-400');
                
                html += `
                <div class="flex flex-col border border-gray-700 bg-gray-800 rounded p-1.5 mb-1.5 shadow-sm">
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-bold flex items-center gap-1 text-gray-200">
                            <span class="w-2.5 h-2.5 rounded-full inline-block shadow-sm" style="background-color: ${color}"></span> 
                            ${name}
                        </span>
                    </div>
                    <div class="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                        <div class="flex justify-between" title="Pearson R: Trend format similarity">
                            <span class="text-gray-400">Trend (R):</span> 
                            <span class="${rClass} font-bold">${res.pearson.toFixed(3)}</span>
                        </div>
                        <div class="flex justify-between" title="RMSE: Absolute vertical distance">
                            <span class="text-gray-400">RMSE:</span> 
                            <span class="font-mono text-gray-300">${res.rmse.toFixed(3)}</span>
                        </div>
                        <div class="col-span-2 flex justify-between border-t border-gray-700 pt-1 mt-0.5" title="Derivative Pearson R: Curve inflexion/rate similarity">
                            <span class="text-gray-400">Rate/Deriv (R):</span> 
                            <span class="font-mono text-gray-300">${res.deriv_r.toFixed(3)}</span>
                        </div>
                    </div>
                </div>`;
            }
            document.getElementById('similarityContent').innerHTML = html;
        }).catch(err => {
            console.error(err);
            document.getElementById('simWait').classList.add('hidden');
            document.getElementById('similarityContent').innerHTML = '<div class="text-red-400 p-2">Failed to compute metrics</div>';
        });
    } else {
        document.getElementById('similarityPanel').classList.add('hidden');
    }
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
        data: { datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
                customCanvasBackgroundColor: { color: 'white' },
                legend: {
                    labels: {
                        filter: function(item, chartData) {
                            // Don't show elements in legend if multiple codes selected to save space
                            if (chartData.datasets && chartData.datasets.length > 5 && item.text.includes('(Elements)')) return false;
                            return true;
                        }
                    }
                }
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

    const selectedCodes = Array.from(document.querySelectorAll('.design-code-checkbox:checked')).map(cb => cb.value);
    const codeKey = selectedCodes.length > 0 ? selectedCodes.join('_') : 'none';
    const varKey = document.getElementById('varSelect').value.replace(/[\/\:\s\(\)]/g, '_');
    const subsetKey = document.getElementById('subsetSelect').value.replace('>', 'gt');

    link.download = `plot_${codeKey}_vs_${varKey}_subset_${subsetKey}.png`;
    link.href = document.getElementById('databaseChart').toDataURL('image/png', 1.0);
    link.click();
}
