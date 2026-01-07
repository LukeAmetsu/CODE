const INPUT_IDS = [
    'section_type', 
    'b', 'h', 'd', 'd_linha', 
    'fck', 'fyk', 
    'As', 'As_linha', 
    'gamma_c', 'gamma_s',
    'bw', 'bf_sup', 'hf_sup', 'bf_inf', 'hf_inf',
    'has_prestress', 'Ap', 'dp', 'fptk', 'Ep', 'sigma_pi', 'loss_pct'
];
let myMnChart = null;
let checkPoints = []; // Array para armazenar os pontos de verificação {n, m, id}

function setupSectionTypeHandlers() {
    const select = document.getElementById('section_type');
    const prestressCheck = document.getElementById('has_prestress');
    
    const inputsToWatch = document.querySelectorAll('.trigger-draw, #section_type');
    inputsToWatch.forEach(el => {
        el.addEventListener('input', () => {
            const inputs = gatherInputsFromIds(INPUT_IDS); 
            requestAnimationFrame(() => drawCrossSection(inputs));
        });
    });

    if (select) {
        const updateVisibility = () => {
            const type = select.value;
            
            document.querySelectorAll('.input-group').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.rect-field, .t-i-field, .i-field').forEach(el => el.style.display = 'none');

            if (type === 'rect') {
                document.querySelectorAll('.rect-field').forEach(el => {
                    el.style.display = 'block';
                    el.classList.add('active');
                });
            } else if (type === 'section_t') {
                document.querySelectorAll('.t-i-field').forEach(el => {
                    el.style.display = 'block';
                    el.classList.add('active');
                });
            } else if (type === 'section_i') {
                document.querySelectorAll('.t-i-field, .i-field').forEach(el => {
                    el.style.display = 'block';
                    el.classList.add('active');
                });
            }
            const inputs = gatherInputsFromIds(INPUT_IDS);
            requestAnimationFrame(() => drawCrossSection(inputs));
        };
        select.addEventListener('change', updateVisibility);
        setTimeout(updateVisibility, 300); 
    }

    if (prestressCheck) {
        const updatePrestress = () => {
            const fields = document.getElementById('prestress-fields');
            const legend = document.getElementById('legend-prestress');
            if (fields) {
                if (prestressCheck.checked) {
                    fields.classList.remove('hidden');
                    if(legend) legend.classList.remove('hidden');
                } else {
                    fields.classList.add('hidden');
                    if(legend) legend.classList.add('hidden');
                }
            }
            const inputs = gatherInputsFromIds(INPUT_IDS);
            requestAnimationFrame(() => drawCrossSection(inputs));
        };
        prestressCheck.addEventListener('change', updatePrestress);
        updatePrestress(); 
    }

    // Listeners para a tabela de verificação
    const addBtn = document.getElementById('add-point-btn');
    if (addBtn) addBtn.addEventListener('click', addCheckPoint);

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const inputs = gatherInputsFromIds(INPUT_IDS);
                drawCrossSection(inputs);
            }
        });
    });
    observer.observe(document.documentElement, { attributes: true });
}

// Funções para gerenciar pontos de verificação
function addCheckPoint() {
    const nInput = document.getElementById('check_nsd');
    const mInput = document.getElementById('check_msd');
    
    const n = parseFloat(nInput.value);
    const m = parseFloat(mInput.value);

    if (isNaN(n) || isNaN(m)) {
        alert("Por favor, insira valores válidos para N e M.");
        return;
    }

    const point = {
        id: Date.now(),
        n: n,
        m: m,
        status: 'Pendente' // Será atualizado no cálculo
    };

    checkPoints.push(point);
    renderCheckPointsTable();
    
    // Limpa inputs
    nInput.value = '';
    mInput.value = '';
}

function removeCheckPoint(id) {
    checkPoints = checkPoints.filter(p => p.id !== id);
    renderCheckPointsTable();
}

function renderCheckPointsTable() {
    const tbody = document.getElementById('check-points-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    checkPoints.forEach((p, index) => {
        const row = document.createElement('tr');
        row.className = "bg-white border-b dark:bg-gray-800 dark:border-gray-700";
        
        // Cor do status
        let statusClass = "text-gray-500";
        if (p.status === 'Seguro') statusClass = "text-green-600 font-bold";
        else if (p.status === 'Inseguro') statusClass = "text-red-600 font-bold";

        row.innerHTML = `
            <td class="px-4 py-2">${index + 1}</td>
            <td class="px-4 py-2">${p.n.toFixed(2)}</td>
            <td class="px-4 py-2">${p.m.toFixed(2)}</td>
            <td class="px-4 py-2 ${statusClass}">${p.status}</td>
            <td class="px-4 py-2">
                <button onclick="removeCheckPoint(${p.id})" class="text-red-600 hover:text-red-800 font-medium text-xs">Remover</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Algoritmo Ray-Casting para ponto em polígono
function isPointInPolygon(point, polygon) {
    // polygon é um array de objetos {Nrd, Mrd}
    // point é {n, m}
    const x = point.n;
    const y = point.m;
    
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].Nrd, yi = polygon[i].Mrd;
        const xj = polygon[j].Nrd, yj = polygon[j].Mrd;
        
        const intersect = ((yi > y) !== (yj > y)) &&
            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Exponho globalmente para o botão onclick funcionar
window.removeCheckPoint = removeCheckPoint;

// ... Funções de Desenho e Cálculo ...

function drawCrossSection(inputs) {
    const canvas = document.getElementById('sectionCanvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext('2d');
    ctx.resetTransform(); 
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const isDark = document.documentElement.classList.contains('dark');
    const strokeColor = isDark ? '#e5e7eb' : '#374151'; 
    const fillColor = isDark ? '#374151' : '#f3f4f6';   
    const textColor = isDark ? '#e5e7eb' : '#1f2937';
    const rebarColor = '#2563eb'; 
    const rebarSupColor = '#ef4444'; 
    const prestressColor = '#22c55e'; 

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.font = "12px Inter, sans-serif";
    
    const padding = 40;
    const drawingW = width - 2 * padding;
    const drawingH = height - 2 * padding;
    
    if (drawingW <= 0 || drawingH <= 0) return; 

    const h = Number(inputs.h) || 60; 
    let b_max = 0;
    
    if (inputs.section_type === 'rect') {
        b_max = Number(inputs.b);
    } else if (inputs.section_type === 'section_t') {
        b_max = Number(inputs.bf_sup);
    } else {
        b_max = Math.max(Number(inputs.bf_sup), Number(inputs.bf_inf));
    }
    b_max = b_max || 20; 

    const scaleX = drawingW / b_max;
    const scaleY = drawingH / h;
    const scale = Math.min(scaleX, scaleY);
    
    const centerX = width / 2;
    const topY = padding + (drawingH - h * scale) / 2;
    
    ctx.beginPath();
    
    if (inputs.section_type === 'rect') {
        const b_scaled = Number(inputs.b) * scale;
        const h_scaled = h * scale;
        ctx.rect(centerX - b_scaled/2, topY, b_scaled, h_scaled);
        ctx.fill();
        ctx.stroke();
        drawDim(ctx, centerX + b_scaled/2 + 15, topY, centerX + b_scaled/2 + 15, topY + h_scaled, `h=${h}`, textColor);
        drawDim(ctx, centerX - b_scaled/2, topY - 15, centerX + b_scaled/2, topY - 15, `b=${inputs.b}`, textColor);
    } else {
        const bw = Number(inputs.bw) * scale;
        const bf_sup = Number(inputs.bf_sup) * scale;
        const hf_sup = Number(inputs.hf_sup) * scale;
        
        let bf_inf, hf_inf;
        if (inputs.section_type === 'section_t') {
            bf_inf = bw; 
            hf_inf = 0;
        } else {
            bf_inf = Number(inputs.bf_inf) * scale;
            hf_inf = Number(inputs.hf_inf) * scale;
        }
        
        const h_web = (h * scale) - hf_sup - hf_inf;
        
        ctx.moveTo(centerX - bf_sup/2, topY);
        ctx.lineTo(centerX + bf_sup/2, topY);
        ctx.lineTo(centerX + bf_sup/2, topY + hf_sup);
        ctx.lineTo(centerX + bw/2, topY + hf_sup);
        ctx.lineTo(centerX + bw/2, topY + hf_sup + h_web);
        ctx.lineTo(centerX + bf_inf/2, topY + hf_sup + h_web);
        ctx.lineTo(centerX + bf_inf/2, topY + h * scale);
        ctx.lineTo(centerX - bf_inf/2, topY + h * scale);
        ctx.lineTo(centerX - bf_inf/2, topY + hf_sup + h_web);
        ctx.lineTo(centerX - bw/2, topY + hf_sup + h_web);
        ctx.lineTo(centerX - bw/2, topY + hf_sup);
        ctx.lineTo(centerX - bf_sup/2, topY + hf_sup);
        ctx.closePath();
        
        ctx.fill();
        ctx.stroke();
        
        const xRight = centerX + Math.max(bf_sup, bf_inf)/2 + 15;
        drawDim(ctx, xRight, topY, xRight, topY + h * scale, `h=${h}`, textColor);
        drawDim(ctx, centerX - bf_sup/2, topY - 15, centerX + bf_sup/2, topY - 15, `bf=${inputs.bf_sup}`, textColor);
    }
    
    const xLeft = centerX - b_max*scale/2 - 25;

    const d_val = Number(inputs.d);
    if (d_val > 0) {
        const y_As = topY + d_val * scale;
        drawRebar(ctx, centerX, y_As, rebarColor, `As=${inputs.As}`, textColor, "right");
        drawDim(ctx, xLeft, topY, xLeft, y_As, `d=${d_val}`, textColor);
    }

    const d_linha_val = Number(inputs.d_linha);
    if (d_linha_val > 0 && Number(inputs.As_linha) > 0) {
        const y_As_lin = topY + d_linha_val * scale;
        drawRebar(ctx, centerX, y_As_lin, rebarSupColor, `A's=${inputs.As_linha}`, textColor, "right");
        drawDim(ctx, xLeft + 15, topY, xLeft + 15, y_As_lin, `d'=${d_linha_val}`, textColor);
    }

    if (inputs.has_prestress && Number(inputs.Ap) > 0) {
        const dp_val = Number(inputs.dp);
        const y_Ap = topY + dp_val * scale;
        
        const y_As_draw = topY + d_val * scale;
        let y_draw = y_Ap;
        if (Math.abs(y_Ap - y_As_draw) < 8) y_draw -= 6;

        drawRebar(ctx, centerX, y_draw, prestressColor, `Ap=${inputs.Ap}`, textColor, "left");
        
        if (Math.abs(dp_val - d_val) > 2) {
             drawDim(ctx, xLeft - 15, topY, xLeft - 15, y_Ap, `dp=${dp_val}`, textColor);
        }
    }
}

function drawRebar(ctx, x, y, color, label, textColor, labelAlign) {
    ctx.fillStyle = color;
    const r = 4;
    const spacing = 10;
    
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2*Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(x - spacing, y, r, 0, 2*Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(x + spacing, y, r, 0, 2*Math.PI); ctx.fill();
    
    ctx.fillStyle = textColor;
    ctx.textAlign = labelAlign === "right" ? "left" : "right";
    const textX = labelAlign === "right" ? x + 20 : x - 20;
    ctx.fillText(label, textX, y + 4);
    
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(labelAlign === "right" ? x + 5 : x - 5, y);
    ctx.lineTo(textX - (labelAlign === "right" ? 2 : -2), y);
    ctx.stroke();
}

function drawDim(ctx, x1, y1, x2, y2, text, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    const markSize = 4;
    if (Math.abs(y1 - y2) < 1) { 
        ctx.beginPath(); ctx.moveTo(x1, y1-markSize); ctx.lineTo(x1, y1+markSize); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2-markSize); ctx.lineTo(x2, y2+markSize); ctx.stroke();
        ctx.fillText(text, (x1+x2)/2, y1 - 6);
    } else { 
        ctx.beginPath(); ctx.moveTo(x1-markSize, y1); ctx.lineTo(x1+markSize, y1); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2-markSize, y2); ctx.lineTo(x2+markSize, y2); ctx.stroke();
        
        ctx.save();
        ctx.translate(x1 - 6, (y1+y2)/2);
        ctx.rotate(-Math.PI/2);
        ctx.fillText(text, 0, 0);
        ctx.restore();
    }
}

function normalizeGeometry(inputs) {
    const { section_type, h } = inputs;
    
    const b = Number(inputs.b) || 0;
    const bw = Number(inputs.bw) || 0;
    const bf_sup = Number(inputs.bf_sup) || 0;
    const hf_sup = Number(inputs.hf_sup) || 0;
    const bf_inf_input = Number(inputs.bf_inf) || 0;
    const hf_inf_input = Number(inputs.hf_inf) || 0;

    if (section_type === 'rect') {
        return {
            h: Number(h),
            bw: b,
            bf_sup: b, hf_sup: 0,
            bf_inf: b, hf_inf: 0
        };
    } 
    else if (section_type === 'section_t') {
        return {
            h: Number(h),
            bw: bw,
            bf_sup: bf_sup, hf_sup: hf_sup,
            bf_inf: bw, hf_inf: 0 
        };
    } 
    else {
        return {
            h: Number(h),
            bw: bw,
            bf_sup: bf_sup, hf_sup: hf_sup,
            bf_inf: bf_inf_input, hf_inf: hf_inf_input
        };
    }
}

// ... Funções de cálculo mantidas (calculateDesignParameters, getState, etc) ...

function calculateDesignParameters(inputs) {
    const { fck, fyk, gamma_c, gamma_s } = inputs;
    const fcd_kn_cm = (fck / gamma_c) * 0.1; 
    const fyd_kn_cm = (fyk / gamma_s) * 0.1; 
    const Es = 21000; 
    const eyd = fyd_kn_cm / Es; 
    
    const hasPrestress = inputs.has_prestress;
    let fptd_kn_cm = 0, Ep = 0, eps_p0 = 0, sigma_p_effective = 0;
    
    if (hasPrestress) {
        const fptk = Number(inputs.fptk) || 1900;
        Ep = Number(inputs.Ep) || 200000;
        const sigma_pi = Number(inputs.sigma_pi) || 0;
        const loss_pct = Number(inputs.loss_pct) || 0;
        
        fptd_kn_cm = (fptk / gamma_s) * 0.1; 
        sigma_p_effective = sigma_pi * (1 - loss_pct / 100);
        eps_p0 = sigma_p_effective / Ep; 
    }

    const ecu = -0.0035; 
    const esu = 0.010;   
    const ec2 = -0.002;  
    
    const lambda = (fck <= 50) ? 0.8 : (fck <= 90 ? 0.8 - (fck - 50) / 400 : 0.72);
    const alphac = (fck <= 50) ? 0.85 : (fck <= 90 ? 0.85 * (1 - (fck - 50) / 200) : 0.7225);
    const fcd_design = alphac * fcd_kn_cm;

    return { 
        fcd_kn_cm, fyd_kn_cm, Es, eyd, ecu, esu, ec2, lambda, fcd_design,
        hasPrestress, fptd_kn_cm, Ep, eps_p0, sigma_p_effective
    };
}

function getConcreteCompression(y_block, geom) {
    let Area = 0;
    let MomentArea = 0;

    if (y_block <= 0) return { Area: 0, Centroid: 0 };

    const { h, bw, bf_sup, hf_sup, bf_inf, hf_inf } = geom;
    
    let y_rem = y_block;
    let current_y_start = 0;

    if (y_rem > 0) {
        const h_seg = (hf_sup > 0) ? Math.min(y_rem, hf_sup) : 0;
        if (h_seg > 0) {
            const A_seg = h_seg * bf_sup;
            const y_cg_seg = current_y_start + h_seg / 2;
            Area += A_seg;
            MomentArea += A_seg * y_cg_seg;
            y_rem -= h_seg;
            current_y_start += h_seg;
        }
    }

    const h_web = h - hf_sup - hf_inf;
    if (y_rem > 0 && h_web > 0) {
        const h_seg = Math.min(y_rem, h_web);
        const A_seg = h_seg * bw;
        const y_cg_seg = current_y_start + h_seg / 2;
        Area += A_seg;
        MomentArea += A_seg * y_cg_seg;
        y_rem -= h_seg;
        current_y_start += h_seg;
    }

    if (y_rem > 0 && hf_inf > 0) {
        const h_seg = Math.min(y_rem, hf_inf);
        const A_seg = h_seg * bf_inf;
        const y_cg_seg = current_y_start + h_seg / 2;
        Area += A_seg;
        MomentArea += A_seg * y_cg_seg;
    }

    const Centroid = Area > 0 ? MomentArea / Area : 0;
    return { Area, Centroid };
}

function getState(x, eps_top_atual, inputs, geom, params) {
    const { h, d, d_linha, As, As_linha, Ap, dp } = inputs;
    const { fcd_design, fyd_kn_cm, Es, lambda, hasPrestress, fptd_kn_cm, Ep, eps_p0 } = params;
    
    const safe_x = (Math.abs(x) < 1e-6) ? 1e-6 : x;

    const es_s = eps_top_atual * (safe_x - d) / safe_x;
    const es_s_linha = eps_top_atual * (safe_x - d_linha) / safe_x;

    const getSigma = (eps) => {
        const sigma = eps * Es;
        return Math.max(-fyd_kn_cm, Math.min(fyd_kn_cm, sigma));
    };

    const fs_s = getSigma(es_s);
    const fs_s_linha = getSigma(es_s_linha);

    const Ns = As * fs_s;
    const Ns_linha = As_linha * fs_s_linha;

    let Nc = 0;
    let Mc = 0;

    if (x > 0) { 
        let y_block = lambda * x;
        if (y_block > h) y_block = h;

        const concProps = getConcreteCompression(y_block, geom);
        
        Nc = -fcd_design * concProps.Area;
        Mc = Nc * (concProps.Centroid - h / 2);
    }

    let Np = 0;
    let Mp = 0;
    if (hasPrestress && Ap > 0) {
        const eps_p_delta = eps_top_atual * (safe_x - dp) / safe_x;
        const eps_p_total = eps_p0 + eps_p_delta;
        const Ep_kn_cm = Ep / 10;
        let sig_p_calc = eps_p_total * Ep_kn_cm;
        sig_p_calc = Math.max(-fptd_kn_cm, Math.min(fptd_kn_cm, sig_p_calc));
        Np = Ap * sig_p_calc;
        Mp = Np * (dp - h/2);
    }

    const Ms = Ns * (d - h / 2);
    const Ms_linha = Ns_linha * (d_linha - h / 2);

    const Nrd = Nc + Ns + Ns_linha + Np;
    const Mrd = (Mc + Ms + Ms_linha + Mp) / 100; 

    let Curvature = 0;
    if (Math.abs(x) >= 1e7) {
        Curvature = 0;
    } else if (Math.abs(x) < 1e-4) {
        Curvature = (0.010 / d) * 100; 
    } else {
        Curvature = (Math.abs(eps_top_atual) / safe_x) * 100; 
    }

    return { Nrd, Mrd, Curvature };
}

function getEcDomain5(x, h) {
    const h_frac = (3/7) * h;
    if (Math.abs(x - h_frac) < 1e-6) return -0.0035; 
    const ec_permil = 2.0 * x / (x - h_frac);
    return -Math.abs(ec_permil) / 1000; 
}

function getXfromEcDomain5(ec_permil, h) {
    const c = (3/7) * h;
    const ec = Math.abs(ec_permil);
    if (Math.abs(ec - 2.0) < 1e-6) return 1e9; 
    return (ec * c) / (ec - 2.0);
}

function calculateLimitPoints(inputs, geom, params) {
    const { ecu, esu, eyd, fyd_kn_cm, ec2, Es } = params;
    const { d, h, As, As_linha, d_linha } = inputs;

    const limits = [];

    const addPoint = (label, x, ec_top) => {
        let state;
        if (x === 0) {
            const es_s_val = esu; 
            const es_l_val = esu * (d_linha / d); 
            const fs = fyd_kn_cm; 
            const fs_l = Math.min(fyd_kn_cm, es_l_val * Es); 

            let N = As * fs + As_linha * fs_l;
            let M = (As * fs * (d - h/2) + As_linha * fs_l * (d_linha - h/2));
            
            if (params.hasPrestress && inputs.Ap > 0) {
                const es_p_delta = esu * (inputs.dp / d);
                const es_p_total = params.eps_p0 + es_p_delta;
                const Ep_kn = params.Ep / 10;
                let sig_p = es_p_total * Ep_kn;
                sig_p = Math.max(-params.fptd_kn_cm, Math.min(params.fptd_kn_cm, sig_p));
                N += inputs.Ap * sig_p;
                M += inputs.Ap * sig_p * (inputs.dp - h/2);
            }
            state = { Nrd: N, Mrd: M / 100, Curvature: (esu / d) * 100 };
        } else if (x === 'inf') {
             state = getState(1e9, ec2, inputs, geom, params);
        } else {
             state = getState(x, ec_top, inputs, geom, params);
        }
        limits.push({ label, ...state });
    };

    let N_trac = (As + As_linha) * fyd_kn_cm;
    let M_trac = (As * fyd_kn_cm * (d - h/2) + As_linha * fyd_kn_cm * (d_linha - h/2));
    if (params.hasPrestress && inputs.Ap > 0) {
        const es_p_total = params.eps_p0 + esu; 
        const Ep_kn = params.Ep / 10;
        let sig_p = es_p_total * Ep_kn;
        sig_p = Math.max(-params.fptd_kn_cm, Math.min(params.fptd_kn_cm, sig_p));
        N_trac += inputs.Ap * sig_p;
        M_trac += inputs.Ap * sig_p * (inputs.dp - h/2);
    }
    limits.push({ label: "Tração Pura", Nrd: N_trac, Mrd: M_trac / 100, Curvature: 0 });

    addPoint("Limite D1 / D2 (x=0)", 0, 0);

    const x23 = (d * Math.abs(ecu)) / (Math.abs(ecu) + esu);
    addPoint("Limite D2 / D3 (x = " + x23.toFixed(2) + " cm)", x23, ecu);

    const x34 = (d * Math.abs(ecu)) / (Math.abs(ecu) + eyd);
    addPoint("Limite D3 / D4 (x = " + x34.toFixed(2) + " cm)", x34, ecu);

    const x45 = h;
    addPoint("Limite D4 / D5 (x = " + x45.toFixed(2) + " cm)", x45, ecu); 

    addPoint("Limite D5 / Comp. Pura (x → ∞)", 'inf', ec2);

    return limits;
}

function calculateKeyPoints(inputs, geom, params) {
    if (!inputs.d || !inputs.h) return [];

    const { ecu, esu, fyd_kn_cm, ec2 } = params;
    const { d, h } = inputs;

    const calculateLobe = (currInputs, currGeom) => {
        const lobePoints = [];
        
        let N_trac = (currInputs.As + currInputs.As_linha) * fyd_kn_cm;
        let M_trac = (currInputs.As * fyd_kn_cm * (currInputs.d - currInputs.h/2) + 
                      currInputs.As_linha * fyd_kn_cm * (currInputs.d_linha - currInputs.h/2));
        
        if (params.hasPrestress && currInputs.Ap > 0) {
            const es_p_total = params.eps_p0 + esu;
            const Ep_kn = params.Ep / 10;
            let sig_p = es_p_total * Ep_kn;
            sig_p = Math.max(-params.fptd_kn_cm, Math.min(params.fptd_kn_cm, sig_p));
            N_trac += currInputs.Ap * sig_p;
            M_trac += currInputs.Ap * sig_p * (currInputs.dp - currInputs.h/2);
        }
        lobePoints.push({ label: '', Nrd: N_trac, Mrd: M_trac / 100, x_val: 0 });

        const x23 = (currInputs.d * Math.abs(ecu)) / (Math.abs(ecu) + esu);
        
        for (let i = 1; i <= 15; i++) {
            const t = i / 15;
            const x = x23 * t;
            const ec_pivoA = (x * esu) / (currInputs.d - x);
            lobePoints.push({ ...getState(x, -ec_pivoA, currInputs, currGeom, params), x_val: x });
        }

        for (let i = 1; i <= 30; i++) {
            const t = i / 30;
            const x = x23 + (h - x23) * t;
            lobePoints.push({ ...getState(x, ecu, currInputs, currGeom, params), x_val: x });
        }

        const ec_start = 3.5;
        const ec_end = 2.001; 
        const steps_d5 = 100;

        for (let i = 0; i <= steps_d5; i++) {
            const t = i / steps_d5;
            const ec_permil = ec_start + (ec_end - ec_start) * t;
            const x = getXfromEcDomain5(ec_permil, h);
            lobePoints.push({ ...getState(x, -ec_permil/1000, currInputs, currGeom, params), x_val: x });
        }

        lobePoints.push({ ...getState(1e9, ec2, currInputs, currGeom, params), x_val: 1e9 });
        
        return lobePoints;
    };

    const posPoints = calculateLobe(inputs, geom);

    let inputsInv = {
        ...inputs,
        d: inputs.h - inputs.d_linha,
        d_linha: inputs.h - inputs.d,
        As: inputs.As_linha,
        As_linha: inputs.As,
    };
    
    if (inputs.has_prestress) {
        inputsInv.dp = inputs.h - inputs.dp;
    }
    
    const geomInv = {
        h: geom.h,
        bw: geom.bw,
        bf_sup: geom.bf_inf,
        hf_sup: geom.hf_inf,
        bf_inf: geom.bf_sup,
        hf_inf: geom.hf_sup
    };

    const negPointsRaw = calculateLobe(inputsInv, geomInv);
    const negPoints = negPointsRaw.map(p => ({
        ...p,
        Mrd: -p.Mrd, 
        label: ''    
    })).reverse(); 

    negPoints.pop(); 

    return [...negPoints, ...posPoints];
}

function drawChart(points) {
    if (!points || points.length === 0) return;

    const chartData = points.map(p => ({ x: p.Nrd, y: p.Mrd }));
    const ctx = document.getElementById('mnChart').getContext('2d');
    
    if (myMnChart) myMnChart.destroy();

    const datasets = [{
        label: 'Envoltória de Resistência',
        data: chartData,
        borderColor: 'rgb(37, 99, 235)',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        showLine: true,
        fill: true,
        tension: 0, 
        pointRadius: 0,
        borderWidth: 2,
        pointHoverRadius: 6,
        hitRadius: 5 
    }];

    if (checkPoints.length > 0) {
        datasets.push({
            label: 'Pontos Verificados',
            data: checkPoints.map(p => ({ x: p.n, y: p.m, status: p.status })),
            backgroundColor: (context) => {
                const status = context.raw?.status;
                return status === 'Seguro' ? 'rgb(34, 197, 94)' : (status === 'Inseguro' ? 'rgb(239, 68, 68)' : 'rgb(156, 163, 175)');
            },
            borderColor: '#fff',
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            type: 'scatter'
        });
    }

    myMnChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'nearest', intersect: true, axis: 'xy' },
            plugins: {
                title: { display: true, text: 'Diagrama de Interação N-M Completo', font: { size: 16 } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const p = context.raw;
                            let label = `Nrd: ${p.x.toFixed(2)} kN, Mrd: ${p.y.toFixed(2)} kNm`;
                            if (p.status) label += ` (${p.status})`;
                            return label;
                        }
                    }
                },
                legend: { display: true },
                zoom: {
                    pan: { enabled: true, mode: 'xy', threshold: 0 },
                    zoom: {
                        wheel: { enabled: true, modifierKey: 'ctrl' },
                        pinch: { enabled: true },
                        mode: 'xy',
                        drag: { enabled: false }
                    }
                }
            },
            scales: {
                x: { 
                    type: 'linear', 
                    position: 'bottom', 
                    title: { display: true, text: 'Esforço Normal Nrd (kN)' },
                    grid: { color: '#e5e7eb' }
                },
                y: { 
                    type: 'linear', 
                    title: { display: true, text: 'Momento Fletor Mrd (kNm)' },
                    grid: { color: '#e5e7eb' }
                }
            }
        }
    });
}

function renderResults(points, inputs, params, geom, resultsContainerId) {
    if (!Array.isArray(points) || points.length === 0) {
        console.error("renderResults recebeu dados inválidos:", points);
        return;
    }

    // Atualização Crítica: Verificar status dos pontos
    checkPoints.forEach(p => {
        const safe = isPointInPolygon(p, points);
        p.status = safe ? 'Seguro' : 'Inseguro';
    });
    renderCheckPointsTable();

    const report = new ReportBuilder({
        reportId: 'mn-report',
        title: 'Resultados da Envoltória M-N',
    });

    try {
        const headers = ["Ponto Notável", "Normal (kN)", "Momento (kNm)", "Curvatura (1/m)"];

        const limitPointsPos = calculateLimitPoints(inputs, geom, params);
        const rowsPos = limitPointsPos.map(p => ({
            cells: [
                p.label,
                p.Nrd.toFixed(2),
                p.Mrd.toFixed(2),
                p.Curvature.toFixed(4)
            ]
        }));
        report.addTableSection('Limites dos Domínios (Momento Positivo)', { headers, rows: rowsPos });

        let inputsInv = {
            ...inputs,
            d: inputs.h - inputs.d_linha,
            d_linha: inputs.h - inputs.d,
            As: inputs.As_linha,
            As_linha: inputs.As
        };
        if (inputs.has_prestress) {
            inputsInv.dp = inputs.h - inputs.dp;
        }
        
        const geomInv = {
            h: geom.h,
            bw: geom.bw,
            bf_sup: geom.bf_inf,
            hf_sup: geom.hf_inf,
            bf_inf: geom.bf_sup,
            hf_inf: geom.hf_sup
        };

        const limitPointsNeg = calculateLimitPoints(inputsInv, geomInv, params);
        const rowsNeg = limitPointsNeg.map(p => ({
            cells: [
                p.label,
                p.Nrd.toFixed(2),
                (-p.Mrd).toFixed(2), 
                p.Curvature.toFixed(4)
            ]
        }));

        report.addTableSection('Limites dos Domínios (Momento Negativo)', { headers, rows: rowsNeg });

        const container = document.getElementById(resultsContainerId);
        if (container) container.innerHTML = ''; 
        report.render(resultsContainerId);
        
        drawChart(points);
        
        requestAnimationFrame(() => drawCrossSection(inputs));
        
    } catch (e) {
        console.error("Erro na renderização dos resultados:", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setupSectionTypeHandlers();

    const calculationHandler = createCalculationHandler({
        inputIds: INPUT_IDS,
        validationRuleKey: 'mn_diagram',
        calculatorFunction: async (inputs) => {
            const params = calculateDesignParameters(inputs);
            const geom = normalizeGeometry(inputs);
            try {
                if (window.eel && window.eel.calculate_mn_interaction_diagram) {
                    const result = await window.eel.calculate_mn_interaction_diagram(inputs)();
                    if (result.points) {
                        return { points: result.points, params, geom };
                    }
                }
                const points = calculateKeyPoints(inputs, geom, params);
                return { points, params, geom }; 
            } catch (err) {
                console.error("[Calculadora] Erro backend/fatal:", err);
                const points = calculateKeyPoints(inputs, geom, params);
                return { points, params, geom }; 
            }
        },
        renderFunction: (result, inputs) => {
            renderResults(result.points, inputs, result.params, result.geom, 'results-container');
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