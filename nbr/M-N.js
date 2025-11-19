const INPUT_IDS = ['b', 'h', 'fck', 'fyk', 'd_linha', 'As', 'As_linha', 'gamma_c', 'gamma_s'];
let myMnChart = null;

function calculateAndDraw(inputs) {
    const params = calculateDesignParameters(inputs);
    const points = calculateKeyPoints(inputs, params);
    
    renderResults(points);
}

function calculateDesignParameters(inputs) {
    const { fck, fyk, gamma_c, gamma_s } = inputs;
    const fcd_kn_cm = (fck / gamma_c) * 0.1;
    const fyd_kn_cm = (fyk / gamma_s) * 0.1;
    const Es = 21000;
    const eyd = fyd_kn_cm / Es;
    const ecu = 0.0035;
    const esu = 0.010;
    const ec2 = 0.002;
    const lambda = (fck <= 50) ? 0.8 : (fck <= 90 ? 0.8 - (fck - 50) / 400 : 0.72);
    const alphac = (fck <= 50) ? 0.85 : (fck <= 90 ? 0.85 * (1 - (fck - 50) / 200) : 0.7225);
    const fcd_design = alphac * fcd_kn_cm;

    return { fcd_kn_cm, fyd_kn_cm, Es, eyd, ecu, esu, ec2, lambda, fcd_design };
}

function getState(x, ecu_top, inputs, params) {
    const { b, h, d_linha, As, As_linha } = inputs;
    const { fcd_design, fyd_kn_cm, Es, lambda } = params;
    
    const d = h - d_linha;
    const d_prime = d_linha;

    if (x <= 1e-6) x = 1e-6; 

    let y = lambda * x;
    let y_pos = 0.4 * y;

    if (y > h) {
        y = h;
        y_pos = 0.5 * h;
    }

    const Nc = fcd_design * b * y;
    const Mc = Nc * (h / 2 - y_pos);

    let es_s = ecu_top * (d - x) / x;
    let es_s_linha = ecu_top * (x - d_prime) / x;
    
    es_s = Math.max(-params.esu, Math.min(params.esu, es_s));
    es_s_linha = Math.max(-params.esu, Math.min(params.esu, es_s_linha));

    const fs_s = Math.max(-fyd_kn_cm, Math.min(fyd_kn_cm, es_s * Es));
    const fs_s_linha = Math.max(-fyd_kn_cm, Math.min(fyd_kn_cm, es_s_linha * Es));
    
    const Ns = As * fs_s;
    const Ms = Ns * (h / 2 - d);

    const Ns_linha = As_linha * fs_s_linha;
    const Ms_linha = Ns_linha * (h / 2 - d_prime);

    const Nrd = Nc + Ns + Ns_linha;
    const Mrd = Mc + Ms + Ms_linha;
    
    return { Nrd, Mrd: Mrd / 100 };
}

function calculateKeyPoints(inputs, params) {
    const { b, h, d_linha, As, As_linha } = inputs;
    const { fcd_kn_cm, fyd_kn_cm, Es, eyd, ecu, esu, ec2 } = params;

    const d = h - d_linha;
    const d_prime = d_linha;
    const points = [];

    const fs_s_p1 = Math.max(-fyd_kn_cm, -ec2 * Es);
    const fs_s_linha_p1 = Math.max(-fyd_kn_cm, -ec2 * Es);
    const Nc_p1 = (0.85 * fcd_kn_cm) * b * h; 
    const Ns_p1 = As * fs_s_p1;
    const Ns_linha_p1 = As_linha * fs_s_linha_p1;
    const Nrd_p1 = Nc_p1 + Ns_p1 + Ns_linha_p1;
    const Mc_p1 = 0;
    const Ms_p1 = Ns_p1 * (h / 2 - d);
    const Ms_linha_p1 = Ns_linha_p1 * (h / 2 - d_prime);
    const Mrd_p1 = (Mc_p1 + Ms_p1 + Ms_linha_p1) / 100;
    points.push({ label: 'Compressão Pura', ...getState(h / params.lambda, ec2, inputs, params), Nrd: Nrd_p1, Mrd: Mrd_p1, x_val: Infinity });

    const x_p2 = d;
    const res_p2 = getState(x_p2, ecu, inputs, params);
    points.push({ label: 'Front. D5/D4', ...res_p2, x_val: x_p2 });

    const x_p3 = d * ecu / (ecu + eyd);
    const res_p3 = getState(x_p3, ecu, inputs, params);
    points.push({ label: 'Front. D4/D3 (Bal.)', ...res_p3, x_val: x_p3 });

    const x_p4 = d * ecu / (ecu + esu);
    const res_p4 = getState(x_p4, ecu, inputs, params);
    points.push({ label: 'Front. D3/D2', ...res_p4, x_val: x_p4 });

    let x_min = x_p4;
    let x_max = x_p2;
    let res_flexao_pura = res_p3;

    for (let i = 0; i < 30; i++) {
        let x_mid = (x_min + x_max) / 2;
        let res_mid = getState(x_mid, ecu, inputs, params);
        res_flexao_pura = res_mid;
        
        if (Math.abs(res_mid.Nrd) < 1e-3) break;
        else if (res_mid.Nrd > 0) x_max = x_mid;
        else x_min = x_mid;
    }
    points.push({ label: 'Flexão Pura (N=0)', ...res_flexao_pura, x_val: (x_min + x_max) / 2 });

    const Nrd_p5 = -(As + As_linha) * fyd_kn_cm;
    const Ms_p5 = -(As * fyd_kn_cm) * (h / 2 - d);
    const Ms_linha_p5 = -(As_linha * fyd_kn_cm) * (h / 2 - d_prime);
    const Mrd_p5 = (Ms_p5 + Ms_linha_p5) / 100;
    points.push({ label: 'Tração Pura', Nrd: Nrd_p5, Mrd: Mrd_p5, x_val: -Infinity });

    points.sort((a, b) => b.Nrd - a.Nrd);

    return points;
}

function drawChart(points) {
    const chartData = points.map(p => ({ x: Math.abs(p.Mrd), y: p.Nrd }));
    const ctx = document.getElementById('mnChart').getContext('2d');
    
    if (myMnChart) myMnChart.destroy();

    myMnChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Envoltória M-N (Mrd, Nrd)',
                data: chartData,
                borderColor: 'rgb(37, 99, 235)',
                backgroundColor: 'rgba(37, 99, 235, 0.5)',
                showLine: true,
                fill: false,
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'Diagrama de Interação M-N' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const point = points[context.dataIndex];
                            return `(${context.parsed.x.toFixed(2)} kNm, ${context.parsed.y.toFixed(2)} kN) - ${point.label}`;
                        }
                    }
                }
            },
            scales: {
                x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Momento Resistente de Cálculo |Mrd| (kNm)' }, beginAtZero: true },
                y: { type: 'linear', title: { display: true, text: 'Esforço Normal Resistente de Cálculo Nrd (kN)' } }
            }
        }
    });
}

function renderResults(points) {
    const resultsContainer = document.getElementById('resultsTableContainer');
    const report = new ReportBuilder({
        reportId: 'mn-report',
        title: 'Resultados da Envoltória M-N',
    });

    const headers = ["Ponto Notável", "Nrd (kN)", "Mrd (kNm)"];
    const rows = points.map(point => ({
        cells: [point.label, point.Nrd.toFixed(2), point.Mrd.toFixed(2)]
    }));

    report.addTableSection('Pontos Notáveis', { headers, rows });
    
    const container = document.getElementById('resultsTableContainer');
    container.innerHTML = ''; // Clear previous content
    report.render('resultsTableContainer');
    
    drawChart(points);
}

document.addEventListener('DOMContentLoaded', () => {
    const calculationHandler = createCalculationHandler({
        inputIds: INPUT_IDS,
        validationRuleKey: 'mn_diagram',
        calculatorFunction: (inputs) => {
            const params = calculateDesignParameters(inputs);
            return calculateKeyPoints(inputs, params);
        },
        renderFunction: (points) => {
            renderResults(points);
        },
        resultsContainerId: 'results-container',
        buttonId: 'run-check-btn'
    });

    initializeApp({
        pageKey: 'mn_diagram',
        inputIds: INPUT_IDS,
        calculationHandler: calculationHandler,
        onReady: calculationHandler
    });
});