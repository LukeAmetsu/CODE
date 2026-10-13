const pcalcData = {
    secao: {
        tipoSecao: 'Retangular',
        boundary: 'pinned', // 'pinned', 'fixed_fixed', 'fixed_pinned', 'cantilever'
        hx: 30,
        hy: 50,
        length: 400, // cm
        xm: 15,
        ym: 25,
        areaAc: 0,
        ix: 0, // Inércia X
        iy: 0,  // Inércia Y
        isSectionMode: false
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
        ],
        estribo: {
            diametro: 8.0, // mm
            espacamento: 15.0, // cm
            pernasX: 2,
            pernasY: 2,
            theta: 45.0, // graus
            fywk: 500 // MPa
        }
    },
    esforcos: {
        listaEsforcos: [
            { n: -800, mxTop: 50, mxBot: -50, myTop: 20, myBot: -20, vx: 0, vy: 0 }
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
        maxRate: 4.0,
        enableCrackingEnvelope: true,
        crackingCriterion: 'wk_limit', // 'wk_limit' (abertura limite ELS-W) ou 'mr_cracking' (início fissuração ELS-F)
        aggressivenessClass: 'CAA_II',
        wLim: 0.30, // mm
        gammaFServ: 1.40,
        showEluSurface: true,
        showCrackingSurface: true,
        showMinMomentSurface: true,
        showServiceLoads: true
    },
    resultados: {
        secaoC: [],
        surfacePoints: { x: [], y: [], z: [] },
        envelope2D_X: [],
        envelope2D_Y: [],
        minMomentSurface: { x: [], y: [], z: [] },
        crackingSurface: { x: [], y: [], z: [] },
        loadCases: []
    }
};

/**
 * Fator de comprimento efetivo (k = Le / L) conforme condição de contorno
 * - pinned: Biapoiado / Rotulado (k = 1.0)
 * - fixed_fixed: Bi-engastado / Engastado-Engastado (k = 0.5)
 * - fixed_pinned: Engastado-Apoiado (k = 0.7)
 * - cantilever: Balanço / Engastado-Livre (k = 2.0)
 */
function getEffectiveLengthFactor(boundary) {
    if (boundary === 'fixed_fixed') return 0.5;
    if (boundary === 'fixed_pinned') return 0.7;
    if (boundary === 'cantilever') return 2.0;
    return 1.0; // 'pinned'
}

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

// =========================================================================
// MOTOR DE GEOMETRIA ANALÍTICA & MALHA DE FIBRAS (ARBITRARY SECTION ENGINE)
// =========================================================================

const POLYGON_PRESETS = {
    hexagono: [
        [25 + 25 * Math.cos(0), 25 + 25 * Math.sin(0)],
        [25 + 25 * Math.cos(Math.PI / 3), 25 + 25 * Math.sin(Math.PI / 3)],
        [25 + 25 * Math.cos(2 * Math.PI / 3), 25 + 25 * Math.sin(2 * Math.PI / 3)],
        [25 + 25 * Math.cos(Math.PI), 25 + 25 * Math.sin(Math.PI)],
        [25 + 25 * Math.cos(4 * Math.PI / 3), 25 + 25 * Math.sin(4 * Math.PI / 3)],
        [25 + 25 * Math.cos(5 * Math.PI / 3), 25 + 25 * Math.sin(5 * Math.PI / 3)]
    ],
    octogono: [
        [15, 0], [35, 0], [50, 15], [50, 35],
        [35, 50], [15, 50], [0, 35], [0, 15]
    ],
    caixao_octogonal: {
        exterior: [
            [15, 0], [35, 0], [50, 15], [50, 35],
            [35, 50], [15, 50], [0, 35], [0, 15]
        ],
        holes: [
            [
                [18, 12], [32, 12], [38, 18], [38, 32],
                [32, 38], [18, 38], [12, 32], [12, 18]
            ]
        ]
    },
    cruz: [
        [20, 0], [40, 0], [40, 20], [60, 20], [60, 40], [40, 40],
        [40, 60], [20, 60], [20, 40], [0, 40], [0, 20], [20, 20]
    ],
    canal_u: [
        [0, 0], [50, 0], [50, 60], [38, 60],
        [38, 12], [12, 12], [12, 60], [0, 60]
    ],
    trapezio: [
        [0, 0], [50, 0], [40, 60], [10, 60]
    ]
};

function loadPolygonPreset(presetKey) {
    const preset = POLYGON_PRESETS[presetKey] || POLYGON_PRESETS.hexagono;
    let txt = '';
    if (Array.isArray(preset)) {
        txt = preset.map(p => `${p[0].toFixed(1)}, ${p[1].toFixed(1)}`).join('\n');
    } else if (preset && preset.exterior) {
        txt = preset.exterior.map(p => `${p[0].toFixed(1)}, ${p[1].toFixed(1)}`).join('\n');
        if (preset.holes && preset.holes.length > 0) {
            preset.holes.forEach((h, idx) => {
                txt += `\n\n# FURO ${idx + 1}\n` + h.map(p => `${p[0].toFixed(1)}, ${p[1].toFixed(1)}`).join('\n');
            });
        }
    }
    const input = document.getElementById('poly-vertices-input');
    if (input) input.value = txt;
    updateDataFromInputs();
    updateSectionTypeUI();
    if (typeof applyQuickRebar === 'function') {
        applyQuickRebar();
    }
    renderCrossSection();
}

function parsePolygonInputDetailed() {
    const input = document.getElementById('poly-vertices-input');
    if (!input || !input.value.trim()) {
        return { exterior: POLYGON_PRESETS.hexagono, holes: [] };
    }
    const rawLines = input.value.split('\n');
    const rings = [];
    let currentRing = [];

    for (const rawLine of rawLines) {
        const line = rawLine.trim();
        if (!line) {
            if (currentRing.length >= 3) {
                rings.push(currentRing);
                currentRing = [];
            }
            continue;
        }
        if (/^(#|furo|vazio|hole|contorno)/i.test(line)) {
            if (currentRing.length >= 3) {
                rings.push(currentRing);
                currentRing = [];
            }
            continue;
        }
        const parts = line.split(/[,\s]+/).filter(Boolean);
        if (parts.length >= 2) {
            const x = parseFloat(parts[0]);
            const y = parseFloat(parts[1]);
            if (isFinite(x) && isFinite(y)) {
                currentRing.push([x, y]);
            }
        }
    }
    if (currentRing.length >= 3) {
        rings.push(currentRing);
    }

    if (rings.length === 0) {
        return { exterior: POLYGON_PRESETS.hexagono, holes: [] };
    }

    return {
        exterior: rings[0],
        holes: rings.slice(1)
    };
}

function parsePolygonInput() {
    return parsePolygonInputDetailed().exterior;
}

/** Verifica se a seção transversal ativa possui vazios/furos internos (ex: Vazada ou Polígono com furos) */
function sectionHasVoids() {
    const type = pcalcData.secao.tipoSecao;
    if (type === 'Vazada') return true;
    if (type === 'Poligono') {
        const polyData = getSectionPolygonData();
        return Boolean(polyData && polyData.holes && polyData.holes.length > 0);
    }
    return false;
}

function computePolygonProperties(exterior, holes = []) {
    function computeRingProps(pts) {
        let A = 0, Qx = 0, Qy = 0, Ixx0 = 0, Iyy0 = 0, Ixy0 = 0;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const xi = pts[i][0], yi = pts[i][1];
            const xj = pts[j][0], yj = pts[j][1];
            const cross = xi * yj - xj * yi;
            A += cross;
            Qx += (yi + yj) * cross;
            Qy += (xi + xj) * cross;
            Ixx0 += (yi * yi + yi * yj + yj * yj) * cross;
            Iyy0 += (xi * xi + xi * xj + xj * xj) * cross;
            Ixy0 += (2 * xi * yi + xi * yj + xj * yi + 2 * xj * yj) * cross;
        }
        return {
            A: A * 0.5,
            Qx: Qx / 6.0,
            Qy: Qy / 6.0,
            Ixx0: Ixx0 / 12.0,
            Iyy0: Iyy0 / 12.0,
            Ixy0: Ixy0 / 24.0
        };
    }

    const extP = computeRingProps(exterior);
    const sign = extP.A >= 0 ? 1 : -1;
    let Ac = extP.A * sign;
    let Qx = extP.Qx * sign;
    let Qy = extP.Qy * sign;
    let Ixx0 = extP.Ixx0 * sign;
    let Iyy0 = extP.Iyy0 * sign;
    let Ixy0 = extP.Ixy0 * sign;

    if (holes && holes.length > 0) {
        for (const h of holes) {
            const hP = computeRingProps(h);
            const hSign = hP.A >= 0 ? 1 : -1;
            Ac -= hP.A * hSign;
            Qx -= hP.Qx * hSign;
            Qy -= hP.Qy * hSign;
            Ixx0 -= hP.Ixx0 * hSign;
            Iyy0 -= hP.Iyy0 * hSign;
            Ixy0 -= hP.Ixy0 * hSign;
        }
    }

    const xm = Ac > 0 ? Qy / Ac : 0;
    const ym = Ac > 0 ? Qx / Ac : 0;
    const Ix = Math.max(0, Ixx0 - Ac * ym * ym);
    const Iy = Math.max(0, Iyy0 - Ac * xm * xm);
    const Ixy = Ixy0 - Ac * xm * ym;

    const Iavg = (Ix + Iy) * 0.5;
    const R = Math.sqrt(Math.pow((Ix - Iy) * 0.5, 2) + Ixy * Ixy);
    const I1 = Iavg + R;
    const I2 = Math.max(0, Iavg - R);
    const thetaP = 0.5 * Math.atan2(-2 * Ixy, Ix - Iy);
    const ix = Ac > 0 ? Math.sqrt(Ix / Ac) : 0;
    const iy = Ac > 0 ? Math.sqrt(Iy / Ac) : 0;
    const iMin = Ac > 0 ? Math.sqrt(I2 / Ac) : 0;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    exterior.forEach(p => {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
    });

    return {
        Ac, xm, ym, Ix, Iy, Ixy, I1, I2, thetaP, ix, iy, iMin,
        hx: maxX - minX,
        hy: maxY - minY
    };
}

function pointInTriangle(p, a, b, c) {
    const v0x = c[0] - a[0], v0y = c[1] - a[1];
    const v1x = b[0] - a[0], v1y = b[1] - a[1];
    const v2x = p[0] - a[0], v2y = p[1] - a[1];
    const dot00 = v0x * v0x + v0y * v0y;
    const dot01 = v0x * v1x + v0y * v1y;
    const dot02 = v0x * v2x + v0y * v2y;
    const dot11 = v1x * v1x + v1y * v1y;
    const dot12 = v1x * v2x + v1y * v2y;
    const inv = dot00 * dot11 - dot01 * dot01;
    if (Math.abs(inv) < 1e-12) return false;
    const invDenom = 1.0 / inv;
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
    return (u >= -1e-6) && (v >= -1e-6) && (u + v <= 1.0 + 1e-6);
}

function triangulateSimplePolygon(pts) {
    const poly = pts.map(p => [p[0], p[1]]);
    let aSum = 0;
    const n = poly.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        aSum += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
    }
    if (aSum < 0) poly.reverse(); // CCW

    const triangles = [];
    const indices = poly.map((_, i) => i);
    let count = 0;
    const maxCount = 3 * n * n;

    while (indices.length > 3 && count < maxCount) {
        count++;
        const m = indices.length;
        let earFound = false;

        for (let i = 0; i < m; i++) {
            const prev_i = indices[(i - 1 + m) % m];
            const curr_i = indices[i];
            const next_i = indices[(i + 1) % m];

            const a = poly[prev_i];
            const b = poly[curr_i];
            const c = poly[next_i];

            const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            if (cross <= 1e-9) continue;

            let isEar = true;
            for (let j = 0; j < m; j++) {
                const idx = indices[j];
                if (idx === prev_i || idx === curr_i || idx === next_i) continue;
                if (pointInTriangle(poly[idx], a, b, c)) {
                    isEar = false;
                    break;
                }
            }

            if (isEar) {
                triangles.push([a, b, c]);
                indices.splice(i, 1);
                earFound = true;
                break;
            }
        }

        if (!earFound) {
            triangles.push([poly[indices[0]], poly[indices[1]], poly[indices[2]]]);
            indices.splice(1, 1);
        }
    }

    if (indices.length === 3) {
        triangles.push([poly[indices[0]], poly[indices[1]], poly[indices[2]]]);
    }
    return triangles;
}

function subdivideTriangles(triangles, maxArea) {
    const result = [];
    const stack = [...triangles];

    while (stack.length > 0) {
        const tri = stack.pop();
        const a = tri[0], b = tri[1], c = tri[2];
        const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) * 0.5;

        if (area <= maxArea || area < 0.2) {
            result.push({ a, b, c, area });
        } else {
            const mAB = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
            const mBC = [(b[0] + c[0]) * 0.5, (b[1] + c[1]) * 0.5];
            const mCA = [(c[0] + a[0]) * 0.5, (c[1] + a[1]) * 0.5];

            stack.push([a, mAB, mCA]);
            stack.push([mAB, b, mBC]);
            stack.push([mCA, mBC, c]);
            stack.push([mAB, mBC, mCA]);
        }
    }
    return result;
}

function getSectionPolygonData() {
    const type = pcalcData.secao.tipoSecao;
    let exterior = [];
    let holes = [];

    if (type === 'Circular') {
        const D = pcalcData.secao.hx;
        const R = D / 2;
        const nPts = 36;
        for (let i = 0; i < nPts; i++) {
            const ang = (2 * Math.PI * i) / nPts;
            exterior.push([R + R * Math.cos(ang), R + R * Math.sin(ang)]);
        }
    } else if (type === 'L') {
        const bf = parseFloat(document.getElementById('L-bf')?.value) || 40;
        const h = parseFloat(document.getElementById('L-h')?.value) || 60;
        const tf = parseFloat(document.getElementById('L-tf')?.value) || 15;
        const tw = parseFloat(document.getElementById('L-tw')?.value) || 15;
        exterior = [[0, 0], [bf, 0], [bf, tf], [tw, tf], [tw, h], [0, h]];
    } else if (type === 'T') {
        const bf = parseFloat(document.getElementById('T-bf')?.value) || 50;
        const h = parseFloat(document.getElementById('T-h')?.value) || 60;
        const tf = parseFloat(document.getElementById('T-tf')?.value) || 12;
        const bw = parseFloat(document.getElementById('T-bw')?.value) || 20;
        const x1 = (bf - bw) * 0.5;
        const x2 = (bf + bw) * 0.5;
        const hw = h - tf;
        exterior = [[x1, 0], [x2, 0], [x2, hw], [bf, hw], [bf, h], [0, h], [0, hw], [x1, hw]];
    } else if (type === 'I') {
        const bfTop = parseFloat(document.getElementById('I-bf-top')?.value) || 40;
        const tfTop = parseFloat(document.getElementById('I-tf-top')?.value) || 12;
        const h = parseFloat(document.getElementById('I-h')?.value) || 70;
        const tw = parseFloat(document.getElementById('I-tw')?.value) || 15;
        const bfBot = parseFloat(document.getElementById('I-bf-bot')?.value) || 40;
        const tfBot = parseFloat(document.getElementById('I-tf-bot')?.value) || 12;
        const maxB = Math.max(bfTop, bfBot);
        const xBot1 = (maxB - bfBot) * 0.5, xBot2 = (maxB + bfBot) * 0.5;
        const xWeb1 = (maxB - tw) * 0.5, xWeb2 = (maxB + tw) * 0.5;
        const xTop1 = (maxB - bfTop) * 0.5, xTop2 = (maxB + bfTop) * 0.5;
        const yBot = tfBot, yTop = h - tfTop;
        exterior = [
            [xBot1, 0], [xBot2, 0], [xBot2, yBot], [xWeb2, yBot], [xWeb2, yTop],
            [xTop2, yTop], [xTop2, h], [xTop1, h], [xTop1, yTop], [xWeb1, yTop],
            [xWeb1, yBot], [xBot1, yBot]
        ];
    } else if (type === 'Vazada') {
        const b = parseFloat(document.getElementById('box-b')?.value) || 50;
        const h = parseFloat(document.getElementById('box-h')?.value) || 70;
        const twx = parseFloat(document.getElementById('box-twx')?.value) || 10;
        const twy = parseFloat(document.getElementById('box-twy')?.value) || 10;
        exterior = [[0, 0], [b, 0], [b, h], [0, h]];
        holes = [[[twx, twy], [b - twx, twy], [b - twx, h - twy], [twx, h - twy]]];
    } else if (type === 'Poligono') {
        const polyData = parsePolygonInputDetailed();
        exterior = polyData.exterior;
        holes = polyData.holes || [];
    } else {
        // Retangular
        const b = pcalcData.secao.hx || 30;
        const h = pcalcData.secao.hy || 50;
        exterior = [[0, 0], [b, 0], [b, h], [0, h]];
    }

    return { exterior, holes };
}

function getSectionBoundaryPoints() {
    const type = pcalcData.secao.tipoSecao;
    const xm = pcalcData.secao.xm || (pcalcData.secao.hx / 2);
    const ym = pcalcData.secao.ym || (pcalcData.secao.hy / 2);

    if (type === 'Circular') {
        const R = pcalcData.secao.hx / 2;
        const pts = [];
        const n = 36;
        for (let i = 0; i < n; i++) {
            const ang = (2 * Math.PI * i) / n;
            pts.push({ x: R * Math.cos(ang), y: R * Math.sin(ang) });
        }
        return pts;
    } else if (type === 'Retangular') {
        return [
            { x: -pcalcData.secao.hx / 2, y: -pcalcData.secao.hy / 2 },
            { x:  pcalcData.secao.hx / 2, y: -pcalcData.secao.hy / 2 },
            { x:  pcalcData.secao.hx / 2, y:  pcalcData.secao.hy / 2 },
            { x: -pcalcData.secao.hx / 2, y:  pcalcData.secao.hy / 2 }
        ];
    } else {
        const { exterior } = getSectionPolygonData();
        return exterior.map(p => ({ x: p[0] - xm, y: p[1] - ym }));
    }
}

/** Alterna visualização da malha de fibras no Canvas 2D */
function toggleMeshView() {
    canvasView.showMesh = !canvasView.showMesh;
    const btn = document.getElementById('btn-toggle-mesh');
    const lbl = document.getElementById('lbl-mesh-toggle');
    if (btn) {
        if (canvasView.showMesh) {
            btn.className = "px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white shadow-xs transition-all flex items-center gap-1 cursor-pointer";
            if (lbl) lbl.textContent = "Malha Ativa";
        } else {
            btn.className = "px-2 py-0.5 rounded text-[10px] font-bold border border-indigo-400 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 transition-all flex items-center gap-1 cursor-pointer";
            if (lbl) lbl.textContent = "Malha Fibras";
        }
    }
    renderCrossSection();
}

/** Toggle section dynamic wrappers and label updates based on section type */
function updateSectionTypeUI() {
    const type = pcalcData.secao.tipoSecao;
    const isCirc = type === 'Circular';
    const isRect = type === 'Retangular';

    const hyWrapper = document.getElementById('hy-wrapper');
    const lblHx = document.getElementById('lbl-hx');
    const patLabel = document.getElementById('gen-pattern-label');
    const hint = document.getElementById('rebar-coord-hint');
    const secBadge = document.getElementById('quick-sec-badge');

    if (hyWrapper) hyWrapper.style.display = isCirc ? 'none' : '';
    if (lblHx) lblHx.textContent = isCirc ? 'Diâmetro (D)' : 'Largura (hx)';

    const typeNames = {
        'Retangular': 'Retangular',
        'Circular': 'Circular',
        'L': 'Seção L (Cantoneira)',
        'T': 'Seção T',
        'I': 'Seção I / Duplo T',
        'Vazada': 'Caixão / Vazada',
        'Poligono': 'Polígono Arbitrário'
    };
    if (secBadge) {
        secBadge.textContent = `Geometria: ${typeNames[type] || type}`;
    }

    if (patLabel) {
        if (isCirc) patLabel.textContent = 'Padrão Circular';
        else if (isRect) patLabel.textContent = 'Padrão Cantos';
        else if (type === 'L') patLabel.textContent = 'Padrão Seção L';
        else if (type === 'T') patLabel.textContent = 'Padrão Seção T';
        else if (type === 'I') patLabel.textContent = 'Padrão Seção I';
        else if (type === 'Vazada') patLabel.textContent = 'Padrão Seção Caixa';
        else if (type === 'Poligono') patLabel.textContent = 'Padrão Polígono';
        else patLabel.textContent = 'Padrão Cantos';
    }

    if (hint) {
        hint.textContent = (isCirc || isRect)
            ? 'Coordenadas relativas ao canto inferior esquerdo (0,0).'
            : 'Coordenadas (x, y) absolutas na seção transversal em cm.';
    }

    // Toggle dimension input wrappers
    const wrappers = {
        'wrapper-dim-rect': isRect || isCirc,
        'wrapper-dim-L': type === 'L',
        'wrapper-dim-T': type === 'T',
        'wrapper-dim-I': type === 'I',
        'wrapper-dim-Vazada': type === 'Vazada',
        'wrapper-dim-Poligono': type === 'Poligono'
    };

    Object.entries(wrappers).forEach(([id, show]) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !show);
    });

    if (type === 'Poligono') {
        const polyInput = document.getElementById('poly-vertices-input');
        if (polyInput && !polyInput.value.trim()) {
            loadPolygonPreset('hexagono');
        }
    }

    // Detecção dinâmica de vazios/furos na seção para armadura interna
    const hasVoids = sectionHasVoids();
    const voidWrapper = document.getElementById('wrapper-quick-inner-contour');
    if (voidWrapper) {
        voidWrapper.classList.toggle('hidden', !hasVoids);
    }
    const voidBadge = document.getElementById('quick-voids-badge');
    if (voidBadge && hasVoids) {
        if (type === 'Vazada') {
            voidBadge.textContent = '1 Vazio (Núcleo Oco)';
        } else {
            const polyData = getSectionPolygonData();
            const nHoles = polyData.holes?.length || 1;
            voidBadge.textContent = `${nHoles} Vazio${nHoles > 1 ? 's' : ''} Detectado${nHoles > 1 ? 's' : ''}`;
        }
    }

    // Auto-adapta a armadura rápida se o tipo de seção for alterado
    if (pcalcData.secao._lastType && pcalcData.secao._lastType !== type) {
        pcalcData.secao._lastType = type;
        if (typeof applyQuickRebar === 'function') {
            applyQuickRebar();
        }
    } else {
        pcalcData.secao._lastType = type;
    }
}

// --- ESTADO DE VISUALIZAÇÃO DO CANVAS (SEÇÃO) ---
const canvasView = {
    scale: 1.0,
    baseScale: 1.0,
    selectedCaseIndex: 0,
    showMesh: true
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
            if (container && container.clientWidth > 10 && container.clientHeight > 10) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
            }
        }
        if (typeof fitViewToSection === 'function') fitViewToSection();
        if (typeof renderCrossSection === 'function') renderCrossSection();
    }, 100);
});

const isDark = () => document.documentElement.classList.contains('dark');

function toggle3DLayer(layer, isVisible) {
    if (layer === 'elu') pcalcData.config.showEluSurface = isVisible;
    if (layer === 'fiss') pcalcData.config.showCrackingSurface = isVisible;
    if (layer === 'min') pcalcData.config.showMinMomentSurface = isVisible;
    if (layer === 'serv') pcalcData.config.showServiceLoads = isVisible;
    if (typeof render3DChart === 'function') {
        render3DChart();
    }
}

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

                <div class="bg-gray-50 dark:bg-gray-900 p-3 rounded border dark:border-gray-700 space-y-3">
                    <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                            <span class="text-cyan-500">⚡</span> Fissuração & ELS (NBR 6118)
                        </label>
                        <span class="text-[10px] bg-cyan-100 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 font-bold px-2 py-0.5 rounded">
                            ELS-W / ELS-F
                        </span>
                    </div>

                    <label class="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" id="check-cracking-envelope" ${pcalcData.config.enableCrackingEnvelope !== false ? 'checked' : ''} class="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500">
                        <span class="text-xs text-gray-700 dark:text-gray-300 font-medium">Calcular e Exibir Envoltória de Fissuração</span>
                    </label>

                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Critério Envoltória:</label>
                            <select id="cracking-criterion" class="w-full text-xs p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                                <option value="wk_limit" ${pcalcData.config.crackingCriterion === 'wk_limit' ? 'selected' : ''}>Abertura Limite (wk ≤ wlim)</option>
                                <option value="mr_cracking" ${pcalcData.config.crackingCriterion === 'mr_cracking' ? 'selected' : ''}>Início de Fissuração (Mr)</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Agressividade (CAA):</label>
                            <select id="cracking-caa" class="w-full text-xs p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                                <option value="0.40" ${Math.abs((pcalcData.config.wLim || 0.3) - 0.40) < 0.01 ? 'selected' : ''}>CAA I (wlim = 0.40 mm)</option>
                                <option value="0.30" ${Math.abs((pcalcData.config.wLim || 0.3) - 0.30) < 0.01 ? 'selected' : ''}>CAA II/III (wlim = 0.30 mm)</option>
                                <option value="0.20" ${Math.abs((pcalcData.config.wLim || 0.3) - 0.20) < 0.01 ? 'selected' : ''}>CAA IV (wlim = 0.20 mm)</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">wlim custom (mm):</label>
                            <input type="number" id="cracking-wlim" step="0.05" min="0.05" max="1.0" value="${pcalcData.config.wLim || 0.30}" class="w-full text-xs p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200">
                        </div>
                        <div>
                            <label class="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Fator Gama Serviço (&gamma;f,serv):</label>
                            <input type="number" id="cracking-gamma-serv" step="0.05" min="1.0" max="2.0" value="${pcalcData.config.gammaFServ || 1.40}" class="w-full text-xs p-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200" title="Relação entre solicitações de cálculo e serviço (Sd / Sser)">
                        </div>
                    </div>
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

    const geoInputs = [
        'hx', 'hy', 'section-type',
        'L-bf', 'L-h', 'L-tf', 'L-tw',
        'T-bf', 'T-h', 'T-tf', 'T-bw',
        'I-bf-top', 'I-tf-top', 'I-h', 'I-tw', 'I-bf-bot', 'I-tf-bot',
        'box-b', 'box-h', 'box-twx', 'box-twy',
        'poly-vertices-input'
    ];

    geoInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const handler = () => {
                updateDataFromInputs();
                updateSectionTypeUI();
                if (typeof fitViewToSection === 'function') fitViewToSection();
                renderCrossSection();
            };
            el.addEventListener('input', handler);
            el.addEventListener('change', handler);
        }
    });

    // Quick Rebar Parametric - Atualizações reativas instantâneas
    const quickIds = ['quick-n-bars', 'quick-diam', 'quick-cover'];
    quickIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', () => {
                applyQuickRebar();
            });
            el.addEventListener('change', () => {
                applyQuickRebar();
            });
        }
    });

    const innerCheck = document.getElementById('quick-include-inner');
    if (innerCheck) {
        innerCheck.addEventListener('change', () => {
            applyQuickRebar();
        });
    }

    document.getElementById('criteria-container')?.addEventListener('change', (e) => {
        if (e.target.name === 'method-2nd' || e.target.id === 'check-cracking-envelope' || e.target.id === 'cracking-criterion' || e.target.id === 'cracking-wlim' || e.target.id === 'cracking-gamma-serv') {
            updateDataFromInputs();
        } else if (e.target.id === 'cracking-caa') {
            const val = parseFloat(e.target.value) || 0.30;
            const wEl = document.getElementById('cracking-wlim');
            if (wEl) wEl.value = val;
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
        pcalcData.esforcos.listaEsforcos.push({ n: -500, mxTop: 20, mxBot: 20, myTop: 10, myBot: 10, vx: 0, vy: 0 });
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

    let resizeRaf = null;
    function resizeAndCenter() {
        const rect = container.getBoundingClientRect();
        const targetW = Math.floor(rect.width);
        const targetH = Math.floor(rect.height);
        if (targetW > 10 && targetH > 10) {
            if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
                fitViewToSection();
                renderCrossSection();
            }
        }
    }

    const resizeObserver = new ResizeObserver(() => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(resizeAndCenter);
    });
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

    const w = canvas.width || 300;
    const h = canvas.height || 300;
    const margin = 80;
    const { hx, hy } = pcalcData.secao;
    const safeHx = Math.max(1, hx || 30);
    const safeHy = Math.max(1, hy || 50);

    const availW = Math.max(40, w - margin);
    const availH = Math.max(40, h - margin);

    const fitScale = Math.min(availW / safeHx, availH / safeHy);
    canvasView.baseScale = (isFinite(fitScale) && fitScale > 0.05) ? fitScale : 1.0;
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
                    const isSec = (pcalcData.secao.length <= 0) || pcalcData.secao.isSectionMode;
                    let load;
                    if (isSec && values.length === 5) {
                        const n = toKN(parseFloat(values[0]) || 0);
                        const mx = toKNm(parseFloat(values[1]) || 0);
                        const my = toKNm(parseFloat(values[2]) || 0);
                        const vx = toKN(parseFloat(values[3]) || 0);
                        const vy = toKN(parseFloat(values[4]) || 0);
                        load = { n, mxTop: mx, mxBot: mx, myTop: my, myBot: my, vx, vy };
                    } else if (values.length === 3) {
                        const n = toKN(parseFloat(values[0]) || 0);
                        const mx = toKNm(parseFloat(values[1]) || 0);
                        const my = toKNm(parseFloat(values[2]) || 0);
                        load = { n, mxTop: mx, mxBot: mx, myTop: my, myBot: my, vx: 0, vy: 0 };
                    } else if (values.length >= 9) {
                        load = {
                            n: toKN(parseFloat(values[0]) || 0),
                            mxTop: toKNm(parseFloat(values[1]) || 0),
                            mxBot: toKNm(parseFloat(values[2]) || 0),
                            myTop: toKNm(parseFloat(values[3]) || 0),
                            myBot: toKNm(parseFloat(values[4]) || 0),
                            qx: parseFloat(values[5]) || 0,
                            qy: parseFloat(values[6]) || 0,
                            vx: toKN(parseFloat(values[7]) || 0),
                            vy: toKN(parseFloat(values[8]) || 0)
                        };
                    } else {
                        load = {
                            n: toKN(parseFloat(values[0]) || 0),
                            mxTop: toKNm(parseFloat(values[1]) || 0),
                            mxBot: toKNm(parseFloat(values[2]) || 0),
                            myTop: toKNm(parseFloat(values[3]) || 0),
                            myBot: toKNm(parseFloat(values[4]) || 0),
                            qx: 0,
                            qy: 0,
                            vx: toKN(parseFloat(values[5]) || 0),
                            vy: toKN(parseFloat(values[6]) || 0)
                        };
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

    pcalcData.secao.tipoSecao = getStr('section-type') || 'Retangular';
    const rawLen = document.getElementById('length')?.value;
    const lenNum = (rawLen !== undefined && rawLen !== '') ? parseFloat(rawLen) : 400;
    pcalcData.secao.length = isNaN(lenNum) ? 400 : Math.max(0, lenNum);
    pcalcData.secao.isSectionMode = (pcalcData.secao.length <= 0);

    const stype = pcalcData.secao.tipoSecao;
    if (stype === 'Circular') {
        const D = getVal('hx') || 40;
        pcalcData.secao.hx = D;
        pcalcData.secao.hy = D;
        pcalcData.secao.xm = D / 2;
        pcalcData.secao.ym = D / 2;
        pcalcData.secao.areaAc = Math.PI * Math.pow(D / 2, 2);
        pcalcData.secao.ix = (Math.PI * Math.pow(D, 4)) / 64;
        pcalcData.secao.iy = pcalcData.secao.ix;
        pcalcData.secao.iMin = D / 4;
    } else if (stype === 'Retangular') {
        const b = getVal('hx') || 30;
        const h = getVal('hy') || 50;
        pcalcData.secao.hx = b;
        pcalcData.secao.hy = h;
        pcalcData.secao.xm = b / 2;
        pcalcData.secao.ym = h / 2;
        pcalcData.secao.areaAc = b * h;
        pcalcData.secao.ix = (b * Math.pow(h, 3)) / 12;
        pcalcData.secao.iy = (h * Math.pow(b, 3)) / 12;
        pcalcData.secao.iMin = Math.min(b, h) / Math.sqrt(12);
    } else {
        // Arbitrary / Parametric section
        const { exterior, holes } = getSectionPolygonData();
        const props = computePolygonProperties(exterior, holes);
        pcalcData.secao.hx = props.hx;
        pcalcData.secao.hy = props.hy;
        pcalcData.secao.xm = props.xm;
        pcalcData.secao.ym = props.ym;
        pcalcData.secao.areaAc = props.Ac;
        pcalcData.secao.ix = props.Ix;
        pcalcData.secao.iy = props.Iy;
        pcalcData.secao.iMin = props.iMin;
        pcalcData.secao.thetaP = props.thetaP;
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

    const crackChk = document.getElementById('check-cracking-envelope');
    if (crackChk) pcalcData.config.enableCrackingEnvelope = crackChk.checked;
    const crackCrit = document.getElementById('cracking-criterion');
    if (crackCrit) pcalcData.config.crackingCriterion = crackCrit.value;
    const wlimVal = getVal('cracking-wlim');
    if (wlimVal > 0) pcalcData.config.wLim = wlimVal;
    const gfServVal = getVal('cracking-gamma-serv');
    if (gfServVal > 0) pcalcData.config.gammaFServ = gfServVal;

    // Armadura Transversal (Estribos / Cisalhamento)
    if (!pcalcData.armacao.estribo) pcalcData.armacao.estribo = {};
    pcalcData.armacao.estribo.diametro = getVal('stirrup-diam') || 8.0;
    pcalcData.armacao.estribo.espacamento = getVal('stirrup-spacing') || 15.0;
    pcalcData.armacao.estribo.pernasX = parseInt(document.getElementById('stirrup-legs-x')?.value) || 2;
    pcalcData.armacao.estribo.pernasY = parseInt(document.getElementById('stirrup-legs-y')?.value) || 2;
    pcalcData.armacao.estribo.theta = getVal('stirrup-theta') || 45.0;

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
        const kFactor = getEffectiveLengthFactor(boundary);
        const Le = L * kFactor;
        const ix = Ac > 0 ? Math.sqrt(Ix / Ac) : 0;
        const iy = Ac > 0 ? Math.sqrt(Iy / Ac) : 0;
        const lambdaX = ix > 0 ? (Le / ix) : 0;
        const lambdaY = iy > 0 ? (Le / iy) : 0;

        const badgeGeo = document.getElementById('col-geo-badge');
        if (badgeGeo) {
            const st = pcalcData.secao.tipoSecao;
            if (st === 'Circular') {
                badgeGeo.textContent = `Circular D=${pcalcData.secao.hx} cm`;
            } else if (st === 'L') {
                const bf = document.getElementById('L-bf')?.value || 40;
                const h = document.getElementById('L-h')?.value || 60;
                badgeGeo.textContent = `L ${bf} × ${h} cm`;
            } else if (st === 'T') {
                const bf = document.getElementById('T-bf')?.value || 50;
                const h = document.getElementById('T-h')?.value || 60;
                badgeGeo.textContent = `T ${bf} × ${h} cm`;
            } else if (st === 'I') {
                const bfTop = document.getElementById('I-bf-top')?.value || 40;
                const h = document.getElementById('I-h')?.value || 70;
                badgeGeo.textContent = `I ${bfTop} × ${h} cm`;
            } else if (st === 'Vazada') {
                const b = document.getElementById('box-b')?.value || 50;
                const h = document.getElementById('box-h')?.value || 70;
                badgeGeo.textContent = `Caixa ${b} × ${h} cm`;
            } else if (st === 'Poligono') {
                badgeGeo.textContent = `Polígono (${Math.round(Ac)} cm²)`;
            } else {
                badgeGeo.textContent = `${pcalcData.secao.hx} × ${pcalcData.secao.hy} cm`;
            }
        }
        const elAc = document.getElementById('pcalc-col-ac-preview');
        if (elAc) elAc.textContent = `${Math.round(Ac)} cm²`;
        const elInertia = document.getElementById('pcalc-col-inertia-preview');
        if (elInertia) elInertia.textContent = `${Math.round(Ix).toLocaleString()} / ${Math.round(Iy).toLocaleString()} cm⁴`;
        const isSection = (L <= 0) || (pcalcData.secao.isSectionMode === true);

        const elLambda = document.getElementById('pcalc-col-lambda-preview');
        if (elLambda) {
            if (isSection) {
                elLambda.className = 'font-semibold text-indigo-600 dark:text-indigo-400';
                elLambda.textContent = 'Seção Transversal (L = 0 cm)';
            } else {
                const maxLambda = Math.max(lambdaX, lambdaY);
                const colorClass = maxLambda <= 35 ? 'text-emerald-600 dark:text-emerald-400' : (maxLambda <= 90 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400');
                elLambda.className = `font-semibold ${colorClass}`;
                elLambda.textContent = `λx=${lambdaX.toFixed(1)} | λy=${lambdaY.toFixed(1)} (Le=${Math.round(Le)}cm)`;
            }
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
        if (elMmin) elMmin.textContent = isSection ? `M1d,min = - (Não aplicável)` : `M1d,min = ${fromKNm(M1dMin).toFixed(2)} ${um}`;
        const elEa = document.getElementById('pcalc-col-ea-preview');
        if (elEa) elEa.textContent = isSection ? `ea = - (Não aplicável)` : `ea = ${ea.toFixed(1)} cm (h/30)`;

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
        const methodEl = document.getElementById('pcalc-crit-method-preview');
        if (methodEl) {
            const m = pcalcData.config.secondOrderMethod || 'curvature_approx';
            const methodNames = {
                'curvature_approx': 'Pilar-Padrão (Curvatura)',
                'stiffness_approx': 'Pilar-Padrão (Rigidez)',
                'standard_diagram': 'Pilar-Padrão Acoplado',
                'general_diagram': 'Método Geral (Uniaxial)',
                'general_biaxial': 'Método Geral (Biaxial 3D)'
            };
            methodEl.textContent = methodNames[m] || 'Pilar-Padrão (Curvatura)';
        }
        const mminEl = document.getElementById('pcalc-crit-mmin-status');
        if (mminEl) {
            const active = pcalcData.config.checkMinMoment !== false;
            mminEl.textContent = active ? 'Ativo' : 'Desativado';
            mminEl.className = active ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'font-bold text-gray-400';
        }
        const fissEl = document.getElementById('pcalc-crit-fiss-status');
        if (fissEl) {
            const active = pcalcData.config.enableCrackingEnvelope !== false;
            const wLim = pcalcData.config.wLim || 0.30;
            fissEl.textContent = active ? `Ativo (wk ≤ ${wLim.toFixed(2)} mm)` : 'Desativado';
            fissEl.className = active ? 'font-bold text-cyan-600 dark:text-cyan-400' : 'font-bold text-gray-400';
        }
    } catch (err) {
        console.error("Error updating RS2 summaries:", err);
    }
}

function renderLoads() {
    const u = unitState.current;
    const um = u === 'tf' ? 'tf·m' : 'kNm';
    const isSection = (pcalcData.secao.length <= 0) || (pcalcData.secao.isSectionMode === true);

    const tableEl = document.getElementById('loads-table');
    if (!tableEl) return;
    const thead = tableEl.getElementsByTagName('thead')[0];
    const tbody = tableEl.getElementsByTagName('tbody')[0];
    if (!tbody) return;

    if (thead) {
        if (isSection) {
            thead.innerHTML = `
                <tr>
                    <th class="px-2 py-2 font-bold text-gray-500 dark:text-gray-400">N (${u})</th>
                    <th class="px-2 py-2 font-bold text-blue-600 dark:text-blue-400">Mx (${um})</th>
                    <th class="px-2 py-2 font-bold text-green-600 dark:text-green-400">My (${um})</th>
                    <th class="px-2 py-2 font-bold text-purple-600 dark:text-purple-400" title="Cortante / Esforço Horizontal Vx">Vx (${u})</th>
                    <th class="px-2 py-2 font-bold text-purple-600 dark:text-purple-400" title="Cortante / Esforço Horizontal Vy">Vy (${u})</th>
                    <th class="px-2 py-2 w-8 text-center">Ação</th>
                </tr>
            `;
        } else {
            thead.innerHTML = `
                <tr>
                    <th class="px-2 py-2 font-bold text-gray-500 dark:text-gray-400">N (${u})</th>
                    <th class="px-2 py-2 font-bold text-gray-500 dark:text-gray-400">Mx↑ (${um})</th>
                    <th class="px-2 py-2 font-bold text-gray-500 dark:text-gray-400">Mx↓ (${um})</th>
                    <th class="px-2 py-2 font-bold text-gray-500 dark:text-gray-400">My↑ (${um})</th>
                    <th class="px-2 py-2 font-bold text-gray-500 dark:text-gray-400">My↓ (${um})</th>
                    <th class="px-2 py-2 font-bold text-amber-600 dark:text-amber-400" title="Carga Lateral Distribuída em X (vento, empuxo)">qx (${u}/m)</th>
                    <th class="px-2 py-2 font-bold text-amber-600 dark:text-amber-400" title="Carga Lateral Distribuída em Y">qy (${u}/m)</th>
                    <th class="px-2 py-2 font-bold text-purple-600 dark:text-purple-400" title="Cortante / Esforço Horizontal Vx">Vx (${u})</th>
                    <th class="px-2 py-2 font-bold text-purple-600 dark:text-purple-400" title="Cortante / Esforço Horizontal Vy">Vy (${u})</th>
                    <th class="px-2 py-2 w-8 text-center">Ação</th>
                </tr>
            `;
        }
    }

    const pasteHint = document.getElementById('pcalc-paste-hint');
    if (pasteHint) {
        if (isSection) {
            pasteHint.innerHTML = `N positivo = Tração. Momentos em <span class="font-bold">${um}</span>. Seção única: Cole do Excel (Ctrl+V): <b>N | Mx | My | Vx | Vy</b>`;
        } else {
            pasteHint.innerHTML = `N positivo = Tração. Momentos em <span class="font-bold">${um}</span>. Cole do Excel (Ctrl+V): <b>N | Mx_top | Mx_bot | My_top | My_bot | qx | qy | Vx | Vy</b>`;
        }
    }

    tbody.innerHTML = '';
    pcalcData.esforcos.listaEsforcos.forEach((l, i) => {
        const row = tbody.insertRow();
        row.className = "border-b border-gray-100 dark:border-gray-700";
        const dispN = +fromKN(l.n).toFixed(4);
        const dispMxt = +fromKNm(l.mxTop).toFixed(4);
        const dispMxb = +fromKNm(l.mxBot).toFixed(4);
        const dispMyt = +fromKNm(l.myTop).toFixed(4);
        const dispMyb = +fromKNm(l.myBot).toFixed(4);
        const dispQx = +(l.qx || 0).toFixed(2);
        const dispQy = +(l.qy || 0).toFixed(2);
        const dispVx = +fromKN(l.vx || 0).toFixed(4);
        const dispVy = +fromKN(l.vy || 0).toFixed(4);

        if (isSection) {
            const dispMx = dispMxt;
            const dispMy = dispMyt;
            row.innerHTML = `
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispN}" data-idx="${i}" data-key="n"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white font-semibold text-blue-600 dark:text-blue-400" value="${dispMx}" data-idx="${i}" data-key="mxSection"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white font-semibold text-green-600 dark:text-green-400" value="${dispMy}" data-idx="${i}" data-key="mySection"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispVx}" data-idx="${i}" data-key="vx"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispVy}" data-idx="${i}" data-key="vy"></td>
                <td class="p-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold px-1 cursor-pointer" data-idx="${i}" data-action="remove">✕</button></td>
            `;
        } else {
            row.innerHTML = `
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispN}" data-idx="${i}" data-key="n"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMxt}" data-idx="${i}" data-key="mxTop"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMxb}" data-idx="${i}" data-key="mxBot"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMyt}" data-idx="${i}" data-key="myTop"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispMyb}" data-idx="${i}" data-key="myBot"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 font-semibold" value="${dispQx}" data-idx="${i}" data-key="qx" step="0.1" placeholder="0"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 font-semibold" value="${dispQy}" data-idx="${i}" data-key="qy" step="0.1" placeholder="0"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispVx}" data-idx="${i}" data-key="vx"></td>
                <td class="p-1"><input type="number" class="w-full border rounded text-center text-xs p-1 bg-white dark:bg-gray-700 dark:text-white" value="${dispVy}" data-idx="${i}" data-key="vy"></td>
                <td class="p-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold px-1 cursor-pointer" data-idx="${i}" data-action="remove">✕</button></td>
            `;
        }
    });
    updateRS2LiveSummaries();
}

function handleLoadInput(e) {
    if (e.target.tagName === 'INPUT') {
        const idx = parseInt(e.target.dataset.idx);
        const key = e.target.dataset.key;
        const displayVal = parseFloat(e.target.value) || 0;
        const internalVal = (key === 'n' || key === 'vx' || key === 'vy') ? toKN(displayVal) : toKNm(displayVal);

        if (key === 'mxSection') {
            pcalcData.esforcos.listaEsforcos[idx].mxTop = internalVal;
            pcalcData.esforcos.listaEsforcos[idx].mxBot = internalVal;
            pcalcData.esforcos.listaEsforcos[idx].mx = internalVal;
        } else if (key === 'mySection') {
            pcalcData.esforcos.listaEsforcos[idx].myTop = internalVal;
            pcalcData.esforcos.listaEsforcos[idx].myBot = internalVal;
            pcalcData.esforcos.listaEsforcos[idx].my = internalVal;
        } else if (key === 'qx' || key === 'qy') {
            pcalcData.esforcos.listaEsforcos[idx][key] = displayVal;
        } else {
            pcalcData.esforcos.listaEsforcos[idx][key] = internalVal;
        }
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
    const qn = document.getElementById('quick-n-bars');
    if (qn && document.activeElement !== qn) {
        qn.value = pcalcData.armacao.barras.length;
    }
    updateRS2LiveSummaries();
}

/**
 * Distribui exatamente N barras ao longo do perímetro fechado definido pelos vértices pts.
 * Espaçamento uniforme por comprimento de arco ao longo de todas as arestas.
 */
function distributeBarsOnClosedPerimeter(pts, n, diam) {
    if (!pts || pts.length < 2 || n <= 0) return [];
    const m = pts.length;
    const edgeLens = [];
    let P = 0;
    for (let i = 0; i < m; i++) {
        const next = pts[(i + 1) % m];
        const len = Math.hypot(next[0] - pts[i][0], next[1] - pts[i][1]);
        edgeLens.push(len);
        P += len;
    }
    if (P < 1e-4) return [];

    const bars = [];
    for (let k = 0; k < n; k++) {
        const targetDist = (k / n) * P;
        let cum = 0;
        let placed = false;
        for (let i = 0; i < m; i++) {
            const nextCum = cum + edgeLens[i];
            if (targetDist <= nextCum + 1e-7 || i === m - 1) {
                const segLen = edgeLens[i];
                const t = segLen > 1e-6 ? Math.max(0, Math.min(1, (targetDist - cum) / segLen)) : 0;
                const next = pts[(i + 1) % m];
                const bx = pts[i][0] + t * (next[0] - pts[i][0]);
                const by = pts[i][1] + t * (next[1] - pts[i][1]);
                bars.push({
                    x: +bx.toFixed(2),
                    y: +by.toFixed(2),
                    diametro: diam
                });
                placed = true;
                break;
            }
            cum = nextCum;
        }
        if (!placed && bars.length < n) {
            bars.push({
                x: +pts[0][0].toFixed(2),
                y: +pts[0][1].toFixed(2),
                diametro: diam
            });
        }
    }
    return bars;
}

/**
 * Gera distribuição inteligente de armadura longitudinal adaptada estritamente
 * à geometria do elemento estrutural ativo (NBR 6118 / ABNT).
 * Detecta vazios e, se includeInner for true, arma o contorno interno dos vazios.
 * Garante que a quantidade de barras geradas seja rigorosamente igual a nBars.
 */
function generateSmartRebarForGeometry(type, nBars, diam, cover, includeInner) {
    nBars = Math.max(2, parseInt(nBars) || 6);
    diam = parseFloat(diam) || 16;
    cover = Math.max(1.5, parseFloat(cover) || 3.0);
    if (includeInner === undefined) {
        includeInner = document.getElementById('quick-include-inner')?.checked !== false;
    }
    const radBar = (diam / 10) / 2;
    const dCover = cover + radBar;

    let bars = [];

    if (type === 'Circular') {
        const D = pcalcData.secao.hx || 40;
        const R = D / 2;
        const n = Math.max(6, nBars); // NBR 6118 exige no mínimo 6 barras em pilares circulares
        const rRing = Math.max(1, R - dCover);
        for (let i = 0; i < n; i++) {
            const theta = (2 * Math.PI * i) / n - Math.PI / 2;
            bars.push({
                x: +(R + rRing * Math.cos(theta)).toFixed(2),
                y: +(R + rRing * Math.sin(theta)).toFixed(2),
                diametro: diam
            });
        }
    } else if (type === 'Retangular') {
        const hx = pcalcData.secao.hx || 30;
        const hy = pcalcData.secao.hy || 50;
        const cx = Math.min(dCover, hx / 2 - 1);
        const cy = Math.min(dCover, hy / 2 - 1);
        const xMin = cx, xMax = hx - cx;
        const yMin = cy, yMax = hy - cy;

        const rectPts = [
            [xMin, yMin],
            [xMax, yMin],
            [xMax, yMax],
            [xMin, yMax]
        ];
        bars = distributeBarsOnClosedPerimeter(rectPts, nBars, diam);
    } else if (type === 'Vazada') {
        const b = parseFloat(document.getElementById('box-b')?.value) || 50;
        const h = parseFloat(document.getElementById('box-h')?.value) || 70;
        const twx = parseFloat(document.getElementById('box-twx')?.value) || 10;
        const twy = parseFloat(document.getElementById('box-twy')?.value) || 10;

        const cxOut = Math.min(dCover, Math.max(1.5, twx * 0.35));
        const cyOut = Math.min(dCover, Math.max(1.5, twy * 0.35));
        const ptsOuter = [
            [cxOut, cyOut],
            [b - cxOut, cyOut],
            [b - cxOut, h - cyOut],
            [cxOut, h - cyOut]
        ];

        if (includeInner) {
            // Contorno interno: camada armada no concreto junto ao vazio (afastada de dCover da face interna)
            const cxIn = Math.min(dCover, Math.max(1.5, twx * 0.35));
            const cyIn = Math.min(dCover, Math.max(1.5, twy * 0.35));
            const xIn1 = twx - cxIn;
            const xIn2 = b - twx + cxIn;
            const yIn1 = twy - cyIn;
            const yIn2 = h - twy + cyIn;

            const ptsInner = [
                [xIn1, yIn1],
                [xIn2, yIn1],
                [xIn2, yIn2],
                [xIn1, yIn2]
            ];

            const pOut = 2 * ((b - 2 * cxOut) + (h - 2 * cyOut));
            const pIn = 2 * ((xIn2 - xIn1) + (yIn2 - yIn1));

            let nIn, nOut;
            if (nBars >= 8) {
                nIn = Math.max(4, Math.round(nBars * (pIn / (pOut + pIn))));
                nOut = nBars - nIn;
                if (nOut < 4) {
                    nOut = 4;
                    nIn = nBars - 4;
                }
            } else {
                nOut = Math.max(2, Math.floor(nBars / 2));
                nIn = nBars - nOut;
            }

            const outerBars = distributeBarsOnClosedPerimeter(ptsOuter, nOut, diam);
            const innerBars = distributeBarsOnClosedPerimeter(ptsInner, nIn, diam);
            bars = [...outerBars, ...innerBars];
        } else {
            bars = distributeBarsOnClosedPerimeter(ptsOuter, nBars, diam);
        }
    } else if (type === 'Poligono') {
        const polyData = getSectionPolygonData();
        const pts = (polyData.exterior && polyData.exterior.length >= 3) ? polyData.exterior : parsePolygonInput();
        const holes = polyData.holes || [];

        // Centroide do polígono para offset uniforme
        let cx = 0, cy = 0;
        pts.forEach(p => { cx += p[0]; cy += p[1]; });
        cx /= pts.length;
        cy /= pts.length;

        // Offset interno para o contorno externo (camada externa de barras)
        const insetPts = pts.map(p => {
            const vx = cx - p[0];
            const vy = cy - p[1];
            const dist = Math.hypot(vx, vy);
            if (dist > 1e-4) {
                const shift = Math.min(dist * 0.45, dCover);
                return [p[0] + (vx / dist) * shift, p[1] + (vy / dist) * shift];
            }
            return [p[0], p[1]];
        });

        if (includeInner && holes.length > 0) {
            // Offset externo para cada vazio (camada interna no concreto ao redor do furo)
            const holeRings = holes.map(hole => {
                let hcx = 0, hcy = 0;
                hole.forEach(p => { hcx += p[0]; hcy += p[1]; });
                hcx /= hole.length;
                hcy /= hole.length;
                return hole.map(p => {
                    const vx = p[0] - hcx;
                    const vy = p[1] - hcy;
                    const dist = Math.hypot(vx, vy);
                    if (dist > 1e-4) {
                        return [p[0] + (vx / dist) * dCover, p[1] + (vy / dist) * dCover];
                    }
                    return [p[0], p[1]];
                });
            });

            // Perímetros
            let pOut = 0;
            for (let i = 0; i < insetPts.length; i++) {
                const nxt = insetPts[(i + 1) % insetPts.length];
                pOut += Math.hypot(nxt[0] - insetPts[i][0], nxt[1] - insetPts[i][1]);
            }
            let pHoles = 0;
            const holePerims = holeRings.map(hRing => {
                let pH = 0;
                for (let i = 0; i < hRing.length; i++) {
                    const nxt = hRing[(i + 1) % hRing.length];
                    pH += Math.hypot(nxt[0] - hRing[i][0], nxt[1] - hRing[i][1]);
                }
                pHoles += pH;
                return pH;
            });

            const minBarsPerRing = 3;
            let nHolesTot = Math.round(nBars * (pHoles / (pOut + pHoles)));
            nHolesTot = Math.max(holes.length * minBarsPerRing, Math.min(nBars - minBarsPerRing, nHolesTot));
            const nOut = Math.max(minBarsPerRing, nBars - nHolesTot);

            const outerBars = distributeBarsOnClosedPerimeter(insetPts, nOut, diam);
            bars.push(...outerBars);

            // Distribui barras restantes entre os vazios proporcionalmente
            let remainingHoleBars = nBars - bars.length;
            holeRings.forEach((hRing, idx) => {
                const isLast = idx === holeRings.length - 1;
                const nH = isLast ? remainingHoleBars : Math.max(minBarsPerRing, Math.round(nHolesTot * (holePerims[idx] / (pHoles || 1))));
                const hBars = distributeBarsOnClosedPerimeter(hRing, nH, diam);
                bars.push(...hBars);
                remainingHoleBars -= hBars.length;
            });
        } else {
            bars = distributeBarsOnClosedPerimeter(insetPts, nBars, diam);
        }
    } else if (type === 'L' || type === 'T' || type === 'I') {
        const polyData = getSectionPolygonData();
        const pts = (polyData.exterior && polyData.exterior.length >= 3) ? polyData.exterior : null;
        if (pts) {
            let cx = 0, cy = 0;
            pts.forEach(p => { cx += p[0]; cy += p[1]; });
            cx /= pts.length;
            cy /= pts.length;

            const insetPts = pts.map(p => {
                const vx = cx - p[0];
                const vy = cy - p[1];
                const dist = Math.hypot(vx, vy);
                if (dist > 1e-4) {
                    const shift = Math.min(dist * 0.45, dCover);
                    return [p[0] + (vx / dist) * shift, p[1] + (vy / dist) * shift];
                }
                return [p[0], p[1]];
            });
            bars = distributeBarsOnClosedPerimeter(insetPts, nBars, diam);
        }
    }

    return bars;
}

function generateBarPattern() {
    applyQuickRebar();
}

// Alias for button (padrão cantos / padrão geométrico)
function generateRectPattern() {
    applyQuickRebar();
}

/** Armadura Rápida: gera N barras com diâmetro e cobrimento adaptados à geometria ativa */
function applyQuickRebar() {
    const rawVal = document.getElementById('quick-n-bars')?.value;
    const nBarsVal = parseInt(rawVal);
    if (isNaN(nBarsVal) || nBarsVal <= 0) return;
    const nBars = Math.max(2, Math.min(128, nBarsVal));
    const diam = parseFloat(document.getElementById('quick-diam')?.value) || 16;
    const cover = parseFloat(document.getElementById('quick-cover')?.value) || 3.0;
    const includeInner = document.getElementById('quick-include-inner')?.checked !== false;
    const type = pcalcData.secao.tipoSecao || 'Retangular';

    pcalcData.armacao.barras = generateSmartRebarForGeometry(type, nBars, diam, cover, includeInner);

    renderReinforcement();
    renderCrossSection();
    updateRS2LiveSummaries();
}

function discretizeSection() {
    pcalcData.resultados.secaoC = [];
    pcalcData.resultados.meshTriangles = [];
    const { hx, hy, tipoSecao } = pcalcData.secao;

    if (tipoSecao === 'Retangular') {
        const nX = 40;
        const nY = 40;
        const dx = hx / nX;
        const dy = hy / nY;
        const dA = dx * dy;
        for (let i = 0; i < nX; i++) {
            for (let j = 0; j < nY; j++) {
                const x = (i * dx) + (dx / 2) - (hx / 2);
                const y = (j * dy) + (dy / 2) - (hy / 2);
                pcalcData.resultados.secaoC.push({ x, y, dA });
            }
        }
    } else if (tipoSecao === 'Circular') {
        const nX = 40;
        const nY = 40;
        const dx = hx / nX;
        const dy = hy / nY;
        const dA = dx * dy;
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
    } else {
        // Geração de malha de elementos triangulares (conforming fiber mesh)
        const { exterior } = getSectionPolygonData();
        const xm = pcalcData.secao.xm || (hx / 2);
        const ym = pcalcData.secao.ym || (hy / 2);
        const Ac = pcalcData.secao.areaAc || 1000;

        let baseTris = [];
        if (tipoSecao === 'Vazada') {
            const b = parseFloat(document.getElementById('box-b')?.value) || 50;
            const h = parseFloat(document.getElementById('box-h')?.value) || 70;
            const twx = parseFloat(document.getElementById('box-twx')?.value) || 10;
            const twy = parseFloat(document.getElementById('box-twy')?.value) || 10;
            baseTris = [
                [[0, 0], [b, 0], [b - twx, twy]],
                [[0, 0], [b - twx, twy], [twx, twy]],
                [[b, 0], [b, h], [b - twx, h - twy]],
                [[b, 0], [b - twx, h - twy], [b - twx, twy]],
                [[b, h], [0, h], [twx, h - twy]],
                [[b, h], [twx, h - twy], [b - twx, h - twy]],
                [[0, h], [0, 0], [twx, twy]],
                [[0, h], [twx, twy], [twx, h - twy]]
            ];
        } else {
            baseTris = triangulateSimplePolygon(exterior);
        }

        // Subdivide para malha fina homogênea de fibras (~250-350 fibras)
        const targetFibers = 280;
        const maxTriArea = Math.max(1.0, Ac / targetFibers);
        const subTris = subdivideTriangles(baseTris, maxTriArea);

        pcalcData.resultados.meshTriangles = subTris;

        for (const tri of subTris) {
            const xc = (tri.a[0] + tri.b[0] + tri.c[0]) / 3 - xm;
            const yc = (tri.a[1] + tri.b[1] + tri.c[1]) / 3 - ym;
            pcalcData.resultados.secaoC.push({ x: xc, y: yc, dA: tri.area });
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

        const boundaryPts = getSectionBoundaryPoints();
        boundaryPts.forEach(p => {
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

    // Extrai as envoltórias 2D canônicas (N x Mx e N x My)
    const idx_posX = Math.round(numAngles * 0.25); // theta = pi/2 -> +Mx
    const idx_negX = Math.round(numAngles * 0.75); // theta = 3pi/2 -> -Mx
    const idx_posY = 0;                            // theta = 0 -> +My
    const idx_negY = Math.round(numAngles * 0.50); // theta = pi -> -My

    const env2D_X = [];
    const env2D_Y = [];

    for (let k = 0; k < statesPerAngle; k++) {
        const pIdx = idx_posX * statesPerAngle + k;
        env2D_X.push({ Mx: points.x[pIdx], My: points.y[pIdx], N: points.z[pIdx] });
    }
    for (let k = statesPerAngle - 1; k >= 0; k--) {
        const pIdx = idx_negX * statesPerAngle + k;
        env2D_X.push({ Mx: points.x[pIdx], My: points.y[pIdx], N: points.z[pIdx] });
    }
    if (env2D_X.length > 0) env2D_X.push({ ...env2D_X[0] });

    for (let k = 0; k < statesPerAngle; k++) {
        const pIdx = idx_posY * statesPerAngle + k;
        env2D_Y.push({ Mx: points.x[pIdx], My: points.y[pIdx], N: points.z[pIdx] });
    }
    for (let k = statesPerAngle - 1; k >= 0; k--) {
        const pIdx = idx_negY * statesPerAngle + k;
        env2D_Y.push({ Mx: points.x[pIdx], My: points.y[pIdx], N: points.z[pIdx] });
    }
    if (env2D_Y.length > 0) env2D_Y.push({ ...env2D_Y[0] });

    pcalcData.resultados.envelope2D_X = env2D_X;
    pcalcData.resultados.envelope2D_Y = env2D_Y;

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

function generateCrackingSurface() {
    const fck = pcalcData.materiais.fck || 25;
    const Ac = pcalcData.secao.areaAc || (pcalcData.secao.hx * pcalcData.secao.hy);
    const Ix = pcalcData.secao.ix || ((pcalcData.secao.hx * Math.pow(pcalcData.secao.hy, 3)) / 12);
    const Iy = pcalcData.secao.iy || ((pcalcData.secao.hy * Math.pow(pcalcData.secao.hx, 3)) / 12);

    // Resistência à tração do concreto (NBR 6118)
    const fctm = (fck <= 50) ? 0.3 * Math.pow(fck, 2 / 3) : 2.12 * Math.log(1 + 0.11 * fck); // MPa
    const fct_f = 1.2 * fctm; // MPa
    const fct_f_kncm2 = fct_f / 10; // kN/cm2

    const wLim = pcalcData.config.wLim || 0.30;
    const criterion = pcalcData.config.crackingCriterion || 'wk_limit';

    const boundaryPts = getSectionBoundaryPoints();

    // Área e diâmetro médio das armaduras
    let totalAs = 0;
    let sumDiam = 0;
    const barras = pcalcData.armacao.barras || [];
    barras.forEach(b => {
        totalAs += Math.PI * Math.pow((b.diametro / 10) / 2, 2);
        sumDiam += b.diametro;
    });
    const phiAvg = barras.length > 0 ? (sumDiam / barras.length) : 16.0;
    const Es_mpa = (pcalcData.materiais.es || 210) * 1000;
    const eta1 = 2.25;
    const rho_r = 0.04;

    // Tensão admissível na armadura no ELS-W para abertura wLim (NBR 6118 item 17.3.3.2)
    const sigma_s1 = phiAvg > 0 ? Math.sqrt((wLim * 12.5 * eta1 * Es_mpa * fctm) / (3.0 * phiAvg)) : 0;
    const sigma_s2 = phiAvg > 0 ? (wLim * 12.5 * eta1 * Es_mpa) / (phiAvg * (4.0 / rho_r + 45.0)) : 0;
    const sigma_s_adm = Math.min(Math.max(sigma_s1, sigma_s2), 0.7 * (pcalcData.materiais.fyk || 500));

    // N range para envoltória de serviço
    const N_tension_max = Ac * fct_f_kncm2;
    let maxN_surface = 0;
    if (pcalcData.resultados.surfacePoints.z.length > 0) {
        maxN_surface = Math.min(...pcalcData.resultados.surfacePoints.z);
    }
    if (maxN_surface === 0) maxN_surface = -10000;
    const N_comp_max = maxN_surface * 0.70; // 70% da capacidade axial última

    const stepsN = 20;
    const stepsTheta = 36;
    const points = { x: [], y: [], z: [] };

    for (let i = 0; i <= stepsN; i++) {
        const N = N_tension_max + (i / stepsN) * (N_comp_max - N_tension_max);
        const sigma_N = Ac > 0 ? (N / Ac) : 0;

        for (let j = 0; j <= stepsTheta; j++) {
            const theta = (j / stepsTheta) * 2 * Math.PI;
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);

            let g_max = 0;
            boundaryPts.forEach(p => {
                const g = (p.y * cosT / Ix) + (p.x * sinT / Iy);
                if (g > g_max) g_max = g;
            });

            let M_cr = 0;
            if (g_max > 1e-9) {
                const delta_sigma = fct_f_kncm2 - sigma_N;
                if (delta_sigma > 0) {
                    M_cr = (delta_sigma / g_max) / 100; // kNm
                }
            }

            let M_target = M_cr;
            if (criterion !== 'mr_cracking') {
                const As_eff = Math.max(totalAs * 0.4, 0.5);
                let u_min = Infinity, u_max = -Infinity;
                boundaryPts.forEach(p => {
                    const u = p.y * cosT + p.x * sinT;
                    if (u < u_min) u_min = u;
                    if (u > u_max) u_max = u;
                });
                const h_eff = (u_max > u_min) ? (u_max - u_min) : 50;
                const z_arm = Math.max(0.7 * h_eff, 10);
                const delta_M_w = (As_eff * (sigma_s_adm / 10) * (z_arm / 100)); // kNm
                M_target = M_cr + delta_M_w;
            }

            points.x.push(M_target * cosT);
            points.y.push(M_target * sinT);
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

            if (pcalcData.config.enableCrackingEnvelope !== false) {
                const crackSurf = generateCrackingSurface();
                pcalcData.resultados.crackingSurface = crackSurf;
                console.log("Envoltória de fissuração gerada com sucesso.");
            } else {
                pcalcData.resultados.crackingSurface = { x: [], y: [], z: [] };
            }

            const results = [];
            pcalcData.esforcos.listaEsforcos.forEach((load, i) => {
                console.log(`Calculando caso de carga ${i + 1}...`);
                results.push(calculateLoadCase(load, i));
            });
            pcalcData.resultados.loadCases = results;

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

/**
 * Verificação do Cisalhamento pelas normas NBR 6118:2023, ACI 318-19, Eurocode 2
 * Considera:
 * - Esforço solicitante Vsd = sqrt(Vsdx² + Vsdy²)
 * - Confinamento axial / esforço normal Nsd (compressão favorável sigma_cp = |Nsd|/Ac)
 * - Resistência da biela comprimida de concreto VRd2
 * - Contribuição do concreto com compressão axial Vc
 * - Contribuição da armadura transversal (estribos) Vsw
 * - Resistência de tração diagonal VRd3 = Vc + Vsw
 * - Resistência final VRd = min(VRd2, VRd3)
 * - Fator de segurança nu_v = VRd / Vsd e conformidade normativa
 */
function calculateShearVerification(Nsd, Vsd, Vsdx, Vsdy, std = 'nbr') {
    const hx = pcalcData.secao.hx || 30;
    const hy = pcalcData.secao.hy || 50;
    const isCirc = pcalcData.secao.tipoSecao === 'Circular';
    const Ac = pcalcData.secao.areaAc || (isCirc ? Math.PI * Math.pow(hx / 2, 2) : (hx * hy));

    // Direção crítica do cortante
    const useDirY = (Vsdy >= Vsdx);
    let bw = useDirY ? hx : hy;
    let d = useDirY ? Math.max(hy - 4.5, 5) : Math.max(hx - 4.5, 5);
    if (isCirc) {
        bw = 0.8 * hx;
        d = 0.8 * hx;
    }

    // Armadura transversal (estribos)
    const est = pcalcData.armacao.estribo || { diametro: 8.0, espacamento: 15.0, pernasX: 2, pernasY: 2, theta: 45.0, fywk: 500 };
    const phi_w = est.diametro || 8.0; // mm
    const s = est.espacamento || 15.0; // cm
    const n_legs = useDirY ? (est.pernasY || 2) : (est.pernasX || 2);
    const Asw1 = (Math.PI * Math.pow(phi_w / 10, 2)) / 4; // cm² por ramo
    const Asw = n_legs * Asw1; // cm² total
    const thetaDeg = est.theta || 45.0;
    const thetaRad = (thetaDeg * Math.PI) / 180;
    const cotTheta = 1.0 / Math.tan(thetaRad);

    // Materiais
    const fck = pcalcData.materiais.fck || 25; // MPa
    const gammaC = pcalcData.config.gamaC || 1.4;
    const gammaS = pcalcData.config.gamaS || 1.15;
    const fcd = fck / gammaC; // MPa
    const fywd = Math.min(est.fywk || 500, 500) / gammaS; // MPa (limite 435 MPa)

    // Tensão normal de cálculo sigma_cp (positiva para compressão)
    const sigma_cp = (Nsd < 0 && Ac > 0) ? (Math.abs(Nsd) / (10 * Ac)) : 0; // MPa (1 kN/cm² = 10 MPa)
    const sigma_td = (Nsd > 0 && Ac > 0) ? (Nsd / (10 * Ac)) : 0; // MPa

    let VRd2 = 0;
    let Vc = 0;
    let Vsw = 0;
    let VRd3 = 0;
    let VRd = 0;

    if (std === 'aci') {
        const phi = 0.75;
        const Nu_N = Math.abs(Nsd) * 1000;
        const Ag_mm2 = Ac * 100;
        const axialEnhance = (Nsd < 0) ? (1.0 + Nu_N / (14 * Ag_mm2)) : Math.max(0, 1.0 - Nu_N / (3.5 * Ag_mm2));
        const Vc_kN = 0.17 * axialEnhance * Math.sqrt(fck) * (bw * 10) * (d * 10) / 1000;
        Vc = Vc_kN;

        const Vs_kN = (Asw / s) * d * (fywd / 10);
        Vsw = Vs_kN;

        const Vmax_kN = (Vc_kN + 0.66 * Math.sqrt(fck) * (bw * 10) * (d * 10) / 1000);
        VRd2 = phi * Vmax_kN;
        VRd3 = phi * (Vc + Vsw);
        VRd = Math.min(VRd2, VRd3);
    } else if (std === 'ec2') {
        const k_size = Math.min(1.0 + Math.sqrt(200 / (d * 10)), 2.0);
        const rho_l = Math.min(0.02, (pcalcData.armacao.barras.length * 2.0) / (bw * d));
        const sigma_cp_ec = Math.min(sigma_cp, 0.2 * fcd);
        const CRdc = 0.18 / 1.5;
        const v_min = 0.035 * Math.pow(k_size, 1.5) * Math.sqrt(fck);
        const Vc_val = (Math.max(CRdc * k_size * Math.pow(100 * rho_l * fck, 1/3), v_min) + 0.15 * sigma_cp_ec) * (bw * d / 10);
        Vc = Vc_val;

        const z = 0.9 * d;
        Vsw = (Asw / s) * z * (fywd / 10) * cotTheta;
        const nu1 = 0.6 * (1 - fck / 250);
        const alpha_cw = (sigma_cp_ec > 0) ? Math.min(1.0 + sigma_cp_ec / fcd, 1.25) : 1.0;
        VRd2 = (alpha_cw * bw * z * nu1 * (fcd / 10)) / (cotTheta + Math.tan(thetaRad));
        VRd3 = Vc + Vsw;
        VRd = Math.min(VRd2, VRd3);
    } else {
        const fctm = (fck <= 50) ? 0.3 * Math.pow(fck, 2/3) : 2.12 * Math.log(1 + 0.11 * fck);
        const fctk_inf = 0.7 * fctm;
        const fctd = fctk_inf / gammaC;
        const alpha_v1 = 1.0 - (fck / 250);
        const alpha_v2 = Math.min(1.0 + sigma_cp / fcd, 1.25);

        if (Math.abs(thetaDeg - 45) < 1.0) {
            VRd2 = 0.27 * alpha_v1 * (fcd / 10) * bw * d * alpha_v2;
            const Vc0 = 0.6 * (fctd / 10) * bw * d;
            Vc = (Nsd < 0) ? Vc0 * Math.min(1.0 + sigma_cp / fctd, 2.0) : Math.max(0, Vc0 * (1.0 - sigma_td / fctd));
            Vsw = (Asw / s) * (0.9 * d) * (fywd / 10);
        } else {
            const sinT = Math.sin(thetaRad);
            VRd2 = 0.54 * alpha_v1 * (fcd / 10) * bw * d * Math.pow(sinT, 2) * (cotTheta + 1) * alpha_v2;
            const Vc0 = 0.6 * (fctd / 10) * bw * d;
            const factorAngle = Math.max(0, (cotTheta - 1) / (Math.tan(Math.PI / 3) - 1));
            Vc = (Nsd < 0) ? Vc0 * factorAngle * Math.min(1.0 + sigma_cp / fctd, 2.0) : 0;
            Vsw = (Asw / s) * (0.9 * d) * (fywd / 10) * cotTheta;
        }

        VRd3 = Vc + Vsw;
        VRd = Math.min(VRd2, VRd3);
    }

    const Vsd_check = Math.max(Vsd, 0.0);
    const safetyFactor = (Vsd_check > 0.05) ? (VRd / Vsd_check) : 99.99;
    const isOk = (safetyFactor >= 1.0);

    return {
        Vsd: Vsd_check,
        Vsdx: Vsdx,
        Vsdy: Vsdy,
        VRd2: VRd2,
        Vc: Vc,
        Vsw: Vsw,
        VRd3: VRd3,
        VRd: VRd,
        safetyFactor: safetyFactor,
        FS: safetyFactor,
        isOk: isOk,
        bielaOk: (Vsd_check <= VRd2),
        tracaoOk: (Vsd_check <= VRd3),
        sigma_cp: sigma_cp,
        Asw_s: (s > 0) ? (Asw / s) * 100 : 0, // cm²/m
        status: isOk ? 'OK' : 'NÃO ATENDE',
        bw: bw,
        d: d,
        Asw: Asw,
        s: s,
        phi_w: phi_w,
        thetaDeg: thetaDeg,
        standard: std
    };
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
    const qx_d = (load.qx || 0) * gf; // Carga transversal de cálculo em X (kN/m)
    const qy_d = (load.qy || 0) * gf; // Carga transversal de cálculo em Y (kN/m)

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
    const kFactor = getEffectiveLengthFactor(boundary);
    const le = length * kFactor;

    // Esforços Cortantes e Horizontais (Vx, Vy)
    let Vsdx = Math.abs((load.vx || 0) * gf);
    let Vsdy = Math.abs((load.vy || 0) * gf);
    if (Vsdx === 0 && length > 0) {
        Vsdx = Math.abs(M1d_y_top - M1d_y_bot) / (length / 100);
    }
    if (Vsdy === 0 && length > 0) {
        Vsdy = Math.abs(M1d_x_top - M1d_x_bot) / (length / 100);
    }
    const Vsd = Math.sqrt(Vsdx * Vsdx + Vsdy * Vsdy);

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

    const isSection = (length <= 0) || (window.pcalcState?.mode === 'section') || (pcalcData.secao.isSectionMode === true);

    // SELEÇÃO DO MÉTODO DE 2a ORDEM
    if (isSection) {
        // MODO SEÇÃO (L = 0): Análise resistente na seção crítica, sem 2ª ordem e sem imperfeições globais
        Mtot_x = Math.max(Math.abs(M1d_x_top), Math.abs(M1d_x_bot));
        Mtot_y = Math.max(Math.abs(M1d_y_top), Math.abs(M1d_y_bot));
        M2d_x = 0;
        M2d_y = 0;
        info = "Seção (L=0)";
    } else if (pcalcData.config.calc2ndOrder && Nsd < 0) {

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
                    const res1 = calculateMethod1_CurvatureApprox(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, needs2ndOrderX, needs2ndOrderY, qx_d, qy_d);
                    Mtot_x = res1.Mtot_x; Mtot_y = res1.Mtot_y; M2d_x = res1.M2d_x; M2d_y = res1.M2d_y; info = res1.info;
                    break;

                case 'stiffness_approx': // Metodo 2
                    const res2 = calculateMethod2_StiffnessApprox(Nsd, M1d_x_top, M1d_x_bot, M1d_y_top, M1d_y_bot, M1d_min_x, M1d_min_y, needs2ndOrderX, needs2ndOrderY, qx_d, qy_d);
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
    const shearResult = calculateShearVerification(Nsd, Vsd, Vsdx, Vsdy, std);

    // --- VERIFICAÇÃO À FISSURAÇÃO (ELS-W / ELS-F NBR 6118) ---
    const fck = pcalcData.materiais.fck || 25;
    const Ac = pcalcData.secao.areaAc || (hx * hy);
    const Ix = pcalcData.secao.ix || ((hx * Math.pow(hy, 3)) / 12);
    const Iy = pcalcData.secao.iy || ((hy * Math.pow(hx, 3)) / 12);
    const fctm = (fck <= 50) ? 0.3 * Math.pow(fck, 2 / 3) : 2.12 * Math.log(1 + 0.11 * fck);
    const fct_f = 1.2 * fctm;
    const fct_f_kncm2 = fct_f / 10;
    const wLim = pcalcData.config.wLim || 0.30;

    // Esforços em Serviço (combinação frequente/quase-permanente)
    const gf_serv = pcalcData.config.gammaFServ || 1.40;
    const N_serv = Nsd / gf_serv;
    const Mx_serv = Mtot_x / gf_serv;
    const My_serv = Mtot_y / gf_serv;
    const M_serv = Math.sqrt(Mx_serv * Mx_serv + My_serv * My_serv);
    const theta_serv = Math.atan2(My_serv, Mx_serv);
    const cosTs = Math.cos(theta_serv);
    const sinTs = Math.sin(theta_serv);

    const boundaryPts = getSectionBoundaryPoints();
    let g_max_serv = 0;
    boundaryPts.forEach(p => {
        const g = (p.y * cosTs / Ix) + (p.x * sinTs / Iy);
        if (g > g_max_serv) g_max_serv = g;
    });

    const sigma_N_serv = Ac > 0 ? (N_serv / Ac) : 0;
    let M_cr = 0;
    if (g_max_serv > 1e-9) {
        const delta_sigma = fct_f_kncm2 - sigma_N_serv;
        if (delta_sigma > 0) {
            M_cr = (delta_sigma / g_max_serv) / 100;
        }
    }

    let totalAs = 0, sumDiam = 0;
    const barras = pcalcData.armacao.barras || [];
    barras.forEach(b => {
        totalAs += Math.PI * Math.pow((b.diametro / 10) / 2, 2);
        sumDiam += b.diametro;
    });
    const phiAvg = barras.length > 0 ? (sumDiam / barras.length) : 16.0;
    const Es_mpa = (pcalcData.materiais.es || 210) * 1000;
    const eta1 = 2.25;
    const rho_r = 0.04;

    const As_eff = Math.max(totalAs * 0.4, 0.5);
    let u_min_s = Infinity, u_max_s = -Infinity;
    boundaryPts.forEach(p => {
        const u = p.y * cosTs + p.x * sinTs;
        if (u < u_min_s) u_min_s = u;
        if (u > u_max_s) u_max_s = u;
    });
    const h_eff_s = (u_max_s > u_min_s) ? (u_max_s - u_min_s) : 50;
    const z_arm_s = Math.max(0.7 * h_eff_s, 10);

    let stage = 'I';
    let wk = 0.0;
    let statusCrack = 'Não Fissurado (Estádio I)';
    let isCrackOk = true;
    let sigma_s = 0.0;
    let fsCrack = 99.9;

    if (M_serv <= M_cr) {
        stage = 'I';
        wk = 0.0;
        statusCrack = 'Não Fissurado (Estádio I)';
        isCrackOk = true;
        fsCrack = M_serv > 0.01 ? (M_cr / M_serv) : 99.9;
    } else {
        stage = 'II';
        const delta_M = M_serv - M_cr;
        sigma_s = (delta_M * 100) / (As_eff * z_arm_s) * 10;
        sigma_s = Math.min(sigma_s, 0.85 * (pcalcData.materiais.fyk || 500));

        const wk1 = phiAvg > 0 ? (phiAvg / (12.5 * eta1)) * (sigma_s / Es_mpa) * (3.0 * sigma_s / fctm) : 0;
        const wk2 = phiAvg > 0 ? (phiAvg / (12.5 * eta1)) * (sigma_s / Es_mpa) * (4.0 / rho_r + 45.0) : 0;
        wk = Math.min(wk1, wk2);

        isCrackOk = (wk <= wLim);
        statusCrack = isCrackOk ? `Atende (wk = ${wk.toFixed(2)} mm)` : `Fissuração Excessiva (${wk.toFixed(2)} mm > ${wLim.toFixed(2)} mm)`;
        fsCrack = wk > 1e-4 ? (wLim / wk) : 99.9;
    }

    const crackingResult = {
        stage,
        M_cr,
        M_serv,
        N_serv,
        Mx_serv,
        My_serv,
        sigma_s,
        wk,
        wLim,
        status: statusCrack,
        isOk: isCrackOk,
        safetyFactor: fsCrack
    };

    console.groupEnd();

    return {
        id: index,
        originalIndex: index + 1,
        Nsd: Nsd,
        Mx1Top: M1d_x_top,
        Mx1Bot: M1d_x_bot,
        My1Top: M1d_y_top,
        My1Bot: M1d_y_bot,
        qx: load.qx || 0,
        qy: load.qy || 0,
        qxd: qx_d,
        qyd: qy_d,
        Vx: load.vx || 0,
        Vy: load.vy || 0,
        Vsdx: Vsdx,
        Vsdy: Vsdy,
        Vsd: Vsd,
        shear: shearResult,
        MxTot: Mtot_x,
        MyTot: Mtot_y,
        M2dx: M2d_x,
        M2dy: M2d_y,
        safetyFactor: safetyFactor,
        cracking: crackingResult,
        info: info
    };
}

// --- MÉTODO 1: CURVATURA APROXIMADA ---
function calculateMethod1_CurvatureApprox(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, calcX, calcY, qxd = 0, qyd = 0) {
    const hx = pcalcData.secao.hx / 100;
    const hy = pcalcData.secao.hy / 100;
    const nu_x = Math.abs(Nsd) / (pcalcData.secao.areaAc * (pcalcData.materiais.fck / 10 / 1.4));

    // Curvaturas 1/r
    const invRx = calcX ? Math.min((0.005 / hy) / (nu_x + 0.5), 0.005 / hy) : 0;
    const invRy = calcY ? Math.min((0.005 / hx) / (nu_x + 0.5), 0.005 / hx) : 0;

    const Le_x = (pcalcData.secao.length / 100) * getEffectiveLengthFactor(pcalcData.secao.boundary);
    const M2d_x = Math.abs(Nsd) * (Math.pow(Le_x, 2) / 10) * invRx;
    const M2d_y = Math.abs(Nsd) * (Math.pow(Le_x, 2) / 10) * invRy;

    const getAlphaB = (M1, M2) => {
        const Ma = Math.abs(M1) > Math.abs(M2) ? Math.abs(M1) : Math.abs(M2);
        const Mb = Math.abs(M1) > Math.abs(M2) ? Math.abs(M2) : Math.abs(M1);
        if (Ma === 0) return 1.0;
        const ratio = (M1 * M2 >= 0) ? (Mb / Ma) : -(Mb / Ma);
        return Math.max(0.4, 0.6 + 0.4 * ratio);
    };

    const M_max_x = Math.max(Math.abs(M1xt), Math.abs(M1xb));
    let M1d_eq_x_calc = getAlphaB(M1xt, M1xb) * M_max_x;

    const M_max_y = Math.max(Math.abs(M1yt), Math.abs(M1yb));
    let M1d_eq_y_calc = getAlphaB(M1yt, M1yb) * M_max_y;

    // Se houver carga lateral distribuída q (vento, empuxo), o momento no vão não é linear:
    const L_m = pcalcData.secao.length / 100;
    if (Math.abs(qxd) > 0.01 && L_m > 0) {
        // Momento estático algébrico no meio do vão:
        const M_mid_alg_x = (M1xt + M1xb) / 2.0 + (qxd * L_m * L_m) / 8.0;
        let M_span_peak_x = Math.abs(M_mid_alg_x);
        // Posição de momento crítico no vão caso ocorra inversão de cortante V(z) = 0:
        const z_crit_x = L_m / 2.0 + (M1xt - M1xb) / (qxd * L_m);
        if (z_crit_x > 0.05 * L_m && z_crit_x < 0.95 * L_m) {
            const M_crit_x = M1xb + (M1xt - M1xb) * (z_crit_x / L_m) + (qxd * z_crit_x * (L_m - z_crit_x)) / 2.0;
            M_span_peak_x = Math.max(M_span_peak_x, Math.abs(M_crit_x));
        }
        M1d_eq_x_calc = Math.max(M1d_eq_x_calc, M_span_peak_x);
    }
    if (Math.abs(qyd) > 0.01 && L_m > 0) {
        const M_mid_alg_y = (M1yt + M1yb) / 2.0 + (qyd * L_m * L_m) / 8.0;
        let M_span_peak_y = Math.abs(M_mid_alg_y);
        const z_crit_y = L_m / 2.0 + (M1yt - M1yb) / (qyd * L_m);
        if (z_crit_y > 0.05 * L_m && z_crit_y < 0.95 * L_m) {
            const M_crit_y = M1yb + (M1yt - M1yb) * (z_crit_y / L_m) + (qyd * z_crit_y * (L_m - z_crit_y)) / 2.0;
            M_span_peak_y = Math.max(M_span_peak_y, Math.abs(M_crit_y));
        }
        M1d_eq_y_calc = Math.max(M1d_eq_y_calc, M_span_peak_y);
    }

    // Conforme NBR 6118 item 15.8.3.3.2:
    // O momento total de cálculo nunca pode ser tomado inferior ao momento máximo de 1ª ordem nas extremidades (M_max) nem ao momento mínimo (Min)
    const Mtot_x = Math.max(M_max_x, M1d_eq_x_calc + M2d_x, MinX);
    const Mtot_y = Math.max(M_max_y, M1d_eq_y_calc + M2d_y, MinY);

    return {
        Mtot_x: Mtot_x,
        Mtot_y: Mtot_y,
        M2d_x, M2d_y,
        info: `M1(1/r): rx=${invRx.toFixed(3)}, ry=${invRy.toFixed(3)}`
    };
}

// --- MÉTODO 2: RIGIDEZ NOMINAL (CORRIGIDO EQ. QUADRÁTICA) ---
function calculateMethod2_StiffnessApprox(Nsd, M1xt, M1xb, M1yt, M1yb, MinX, MinY, calcX, calcY, qxd = 0, qyd = 0) {
    const hx = pcalcData.secao.hx / 100;
    const hy = pcalcData.secao.hy / 100;
    const Le = (pcalcData.secao.length / 100) * getEffectiveLengthFactor(pcalcData.secao.boundary);
    const L_m = pcalcData.secao.length / 100;

    const solveQuadratic = (h, M1t, M1b, Min, active, qd = 0) => {
        let M1Max = Math.max(Math.abs(M1t), Math.abs(M1b), Min);
        if (Math.abs(qd) > 0.01 && L_m > 0) {
            const M_mid_alg = (M1t + M1b) / 2.0 + (qd * L_m * L_m) / 8.0;
            let M_span_peak = Math.abs(M_mid_alg);
            const z_crit = L_m / 2.0 + (M1t - M1b) / (qd * L_m);
            if (z_crit > 0.05 * L_m && z_crit < 0.95 * L_m) {
                const M_crit = M1b + (M1t - M1b) * (z_crit / L_m) + (qd * z_crit * (L_m - z_crit)) / 2.0;
                M_span_peak = Math.max(M_span_peak, Math.abs(M_crit));
            }
            M1Max = Math.max(M1Max, M_span_peak);
        }
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
            const m1_fallback = calculateMethod1_CurvatureApprox(Nsd, M1t, M1b, 0, 0, Min, 0, true, false, qd, 0);
            Mtot = m1_fallback.Mtot_x;
        }

        // Garante que não é menor que 1a ordem
        Mtot = Math.max(Mtot, M1Max);

        return { Mtot, M2d: Math.max(0, Mtot - M1Max) };
    };

    const resX = solveQuadratic(hy, M1xt, M1xb, MinX, calcX, qxd);
    const resY = solveQuadratic(hx, M1yt, M1yb, MinY, calcY, qyd);

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

function renderShearCard(caseIndex = 0) {
    const card = document.getElementById('shear-verification-card');
    if (!card) return;

    const loadCase = pcalcData.resultados.loadCases && pcalcData.resultados.loadCases[caseIndex];
    const badge = document.getElementById('shear-status-badge');
    const vsdEl = document.getElementById('shear-vsd-val');
    const vrd2El = document.getElementById('shear-vrd2-val');
    const vcEl = document.getElementById('shear-vc-val');
    const vswEl = document.getElementById('shear-vsw-val');
    const vrdEl = document.getElementById('shear-vrd-val');
    const fsEl = document.getElementById('shear-fs-val');
    const detailsEl = document.getElementById('shear-details-text');

    if (!loadCase || !loadCase.shear) {
        if (badge) {
            badge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-750 text-slate-600 dark:text-slate-300";
            badge.textContent = "Aguardando Cálculo";
        }
        if (vsdEl) vsdEl.textContent = '-- kN';
        if (vrd2El) vrd2El.textContent = '-- kN';
        if (vcEl) vcEl.textContent = '-- kN';
        if (vswEl) vswEl.textContent = '-- kN';
        if (vrdEl) vrdEl.textContent = '-- kN';
        if (fsEl) fsEl.textContent = '--';
        return;
    }

    const sh = loadCase.shear;
    if (vsdEl) vsdEl.textContent = `${sh.Vsd.toFixed(1)} kN`;
    if (vrd2El) vrd2El.textContent = `${sh.VRd2.toFixed(1)} kN`;
    if (vcEl) vcEl.textContent = `${sh.Vc.toFixed(1)} kN`;
    if (vswEl) vswEl.textContent = `${sh.Vsw.toFixed(1)} kN`;
    if (vrdEl) vrdEl.textContent = `${sh.VRd.toFixed(1)} kN`;

    const fsText = (sh.FS >= 99) ? '>10' : sh.FS.toFixed(2);
    if (fsEl) {
        fsEl.textContent = fsText;
        fsEl.className = `font-mono font-bold text-xs ${sh.isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`;
    }

    if (badge) {
        if (sh.isOk) {
            badge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300";
            badge.textContent = `✓ OK (νv = ${fsText})`;
        } else {
            badge.className = "px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300";
            badge.textContent = `⚠ RUPTURA CISALHAMENTO (νv = ${fsText})`;
        }
    }

    if (detailsEl) {
        const std = (window.pcalcState && window.pcalcState.standard) || 'nbr';
        const stdLabel = (std === 'aci') ? 'ACI 318-22' : (std === 'ec2') ? 'Eurocode 2' : 'NBR 6118:2023';
        const origVx = (loadCase.originalLoad && loadCase.originalLoad.vx) ? loadCase.originalLoad.vx : 0;
        const origVy = (loadCase.originalLoad && loadCase.originalLoad.vy) ? loadCase.originalLoad.vy : 0;
        detailsEl.innerHTML = `
            <b>Norma: ${stdLabel}</b> | Caso ${loadCase.originalIndex} (Nsd = ${loadCase.Nsd.toFixed(1)} kN, Vx = ${origVx.toFixed(1)} kN, Vy = ${origVy.toFixed(1)} kN):<br>
            • Ruptura por compressão diagonal da biela: Vsd (${sh.Vsd.toFixed(1)} kN) ${sh.Vsd <= sh.VRd2 ? '≤' : '>'} VRd2 (${sh.VRd2.toFixed(1)} kN) [${sh.bielaOk ? 'Biela OK' : 'Falha na Biela'}]<br>
            • Ruptura por tração diagonal / estribos: Vsd (${sh.Vsd.toFixed(1)} kN) ${sh.Vsd <= sh.VRd ? '≤' : '>'} VRd = Vc + Vsw (${sh.VRd.toFixed(1)} kN) [${sh.tracaoOk ? 'Armadura OK' : 'Reforçar Estribos'}]<br>
            • Concreto: Vc = ${sh.Vc.toFixed(1)} kN (beneficiado por σcp = ${sh.sigma_cp.toFixed(2)} MPa) • Estribos: Vsw = ${sh.Vsw.toFixed(1)} kN (Asw/s = ${sh.Asw_s.toFixed(2)} cm²/m).
        `;
    }
}

function renderResultsTable() {
    const tableEl = document.getElementById('results-table');
    if (!tableEl) return;
    const tbody = tableEl.getElementsByTagName('tbody')[0];
    if (!tbody) return;

    const isSection = (pcalcData.secao.length <= 0) || (pcalcData.secao.isSectionMode === true);
    const thMx = document.getElementById('th-mxtot');
    const thMy = document.getElementById('th-mytot');
    if (thMx) thMx.textContent = isSection ? 'Mxd (kNm)' : 'Mx,tot';
    if (thMy) thMy.textContent = isSection ? 'Myd (kNm)' : 'My,tot';

    tbody.innerHTML = '';

    pcalcData.resultados.loadCases.forEach((res, i) => {
        const row = tbody.insertRow();
        const isSelected = canvasView.selectedCaseIndex === i;
        row.className = `hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer border-b dark:border-gray-700 transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : ''}`;

        row.onclick = () => {
            canvasView.selectedCaseIndex = i;
            renderElevation(i);
            renderResultsTable();
            renderInteractionChart();
            renderShearCard(i);
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

        let shearBadge = '<span class="text-gray-400 text-[10px]">-</span>';
        if (res.shear) {
            const sFs = (res.shear.FS >= 99) ? '>10' : res.shear.FS.toFixed(2);
            if (res.shear.isOk) {
                shearBadge = `<span class="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 font-bold text-[10px]" title="Vsd=${res.shear.Vsd.toFixed(1)} kN ≤ VRd=${res.shear.VRd.toFixed(1)} kN (VRd2=${res.shear.VRd2.toFixed(1)} kN)">OK (νv=${sFs})</span>`;
            } else {
                shearBadge = `<span class="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-bold text-[10px]" title="Vsd=${res.shear.Vsd.toFixed(1)} kN > VRd=${res.shear.VRd.toFixed(1)} kN">Falha (νv=${sFs})</span>`;
            }
        }

        let crackBadge = '<span class="text-gray-400 text-[10px]">-</span>';
        if (res.cracking) {
            if (res.cracking.stage === 'I') {
                crackBadge = `<span class="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]" title="M_serv ≤ Mr: Estádio I (Não Fissurado)">Íntegro (0.00 mm)</span>`;
            } else if (res.cracking.isOk) {
                crackBadge = `<span class="px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-950/70 text-cyan-700 dark:text-cyan-300 font-bold text-[10px]" title="Estádio II: wk = ${res.cracking.wk.toFixed(3)} mm ≤ ${res.cracking.wLim.toFixed(2)} mm">wk = ${res.cracking.wk.toFixed(2)} mm</span>`;
            } else {
                crackBadge = `<span class="px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-bold text-[10px]" title="Estádio II: wk = ${res.cracking.wk.toFixed(3)} mm > ${res.cracking.wLim.toFixed(2)} mm">wk = ${res.cracking.wk.toFixed(2)} mm (Alerta)</span>`;
            }
        }

        row.innerHTML = `
            <td class="p-2 font-mono text-gray-700 dark:text-gray-300 text-center">${res.originalIndex}</td>
            <td class="p-2 text-gray-700 dark:text-gray-300">${res.Nsd.toFixed(1)}</td>
            <td class="p-2 font-bold text-blue-600 dark:text-blue-400">${res.MxTot.toFixed(1)}</td>
            <td class="p-2 font-bold text-green-600 dark:text-green-400">${res.MyTot.toFixed(1)}</td>
            <td class="p-2 text-center ${fsClass}">${fsText}</td>
            <td class="p-2 text-center">${shearBadge}</td>
            <td class="p-2 text-center">${crackBadge}</td>
            <td class="p-2"><span class="px-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 text-[10px]">${res.info}</span></td>
            <td class="p-2 text-xs text-blue-500 dark:text-blue-400 text-center">
                ${isSelected ? '<b>(Sel)</b>' : 'Ver'}
            </td>
        `;
    });

    renderShearCard(canvasView.selectedCaseIndex || 0);
}

function setPcalcChartMode(mode) {
    if (!window.pcalcState) window.pcalcState = {};
    window.pcalcState.chartMode = mode; // '2d_nm', '2d_mm', '3d'

    const btnNm = document.getElementById('btn-chart-2d-nm');
    const btnMm = document.getElementById('btn-chart-2d-mm');
    const btn3d = document.getElementById('btn-chart-3d');
    const titleEl = document.getElementById('chart-main-title');

    const activeClass = "px-2 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white shadow-xs cursor-pointer flex items-center gap-1 transition-all";
    const inactiveClass = "px-2 py-0.5 rounded text-[10px] font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white cursor-pointer flex items-center gap-1 transition-all";

    if (btnNm) btnNm.className = (mode === '2d_nm') ? activeClass : inactiveClass;
    if (btnMm) btnMm.className = (mode === '2d_mm') ? activeClass : inactiveClass;
    if (btn3d) btn3d.className = (mode === '3d') ? activeClass : inactiveClass;

    if (titleEl) {
        if (mode === '2d_nm') titleEl.textContent = "Envoltória 2D (N-M)";
        else if (mode === '2d_mm') titleEl.textContent = "Fatia 2D (Mx-My)";
        else titleEl.textContent = "Superfície 3D (N-Mx-My)";
    }

    renderInteractionChart();
}

function renderInteractionChart() {
    const chartDiv = document.getElementById('chart3d');
    if (!chartDiv) return;

    if (!window.pcalcState) window.pcalcState = {};
    const chartMode = window.pcalcState.chartMode || '2d_nm';

    if (chartMode === '3d') {
        render3DChartMesh();
    } else if (chartMode === '2d_mm') {
        render2DSliceChart();
    } else {
        render2DInteractionChart();
    }
}

function render2DInteractionChart() {
    const chartDiv = document.getElementById('chart3d');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';

    const envX = pcalcData.resultados.envelope2D_X || [];
    const envY = pcalcData.resultados.envelope2D_Y || [];
    const loadCases = pcalcData.resultados.loadCases || [];
    const selectedIdx = canvasView.selectedCaseIndex || 0;

    const dark = typeof isDark === 'function' ? isDark() : false;
    const axisColor = dark ? '#94a3b8' : '#475569';
    const gridColor = dark ? '#334155' : '#e2e8f0';

    const traces = [];

    // 1. Envoltória N-Mx
    if (envX.length > 0) {
        traces.push({
            x: envX.map(p => p.Mx),
            y: envX.map(p => p.N),
            mode: 'lines',
            type: 'scatter',
            name: 'Envoltória N-Mx (ELU)',
            line: { color: '#2563eb', width: 2.5 },
            hovertemplate: '<b>N-Mx</b><br>Mx: %{x:.1f} kNm<br>N: %{y:.1f} kN<extra></extra>'
        });
    }

    // 2. Envoltória N-My
    if (envY.length > 0) {
        traces.push({
            x: envY.map(p => p.My),
            y: envY.map(p => p.N),
            mode: 'lines',
            type: 'scatter',
            name: 'Envoltória N-My (ELU)',
            line: { color: '#059669', width: 2.5, dash: 'dot' },
            hovertemplate: '<b>N-My</b><br>My: %{x:.1f} kNm<br>N: %{y:.1f} kN<extra></extra>'
        });
    }

    // 3. Momento Mínimo se ativado
    if (pcalcData.config.showMinMomentSurface !== false && envX.length > 0) {
        const hx = pcalcData.secao.hx || 30;
        const hy = pcalcData.secao.hy || 30;
        const e_min_x = (1.5 + 0.03 * hy) / 100;
        const minN = Math.min(...envX.map(p => p.N), 0);
        const steps = 15;
        const minLineN = [];
        const minLineMx = [];
        const minLineMxNeg = [];
        for (let i = 0; i <= steps; i++) {
            const nVal = (i / steps) * minN;
            minLineN.push(nVal);
            minLineMx.push(Math.abs(nVal) * e_min_x);
            minLineMxNeg.push(-Math.abs(nVal) * e_min_x);
        }
        traces.push({
            x: minLineMx,
            y: minLineN,
            mode: 'lines',
            type: 'scatter',
            name: 'Momento Mínimo M1d,min',
            line: { color: '#f59e0b', width: 1.5, dash: 'dash' },
            hoverinfo: 'skip'
        });
        traces.push({
            x: minLineMxNeg,
            y: minLineN,
            mode: 'lines',
            type: 'scatter',
            showlegend: false,
            line: { color: '#f59e0b', width: 1.5, dash: 'dash' },
            hoverinfo: 'skip'
        });
    }

    // 4. Pontos de Carregamento Solicitante (Mx,tot e My,tot)
    const ptsX_other = [], ptsY_other = [], text_other = [];
    let selPtX = null, selPtY = null;

    loadCases.forEach((l, i) => {
        if (i === selectedIdx) {
            selPtX = { mx: l.MxTot, my: l.MyTot, n: l.Nsd, label: `Caso ${l.originalIndex} (Sel)` };
        } else {
            ptsX_other.push(l.MxTot);
            ptsY_other.push(l.Nsd);
            text_other.push(`Caso ${l.originalIndex}`);
        }
    });

    if (ptsX_other.length > 0) {
        traces.push({
            x: ptsX_other,
            y: ptsY_other,
            mode: 'markers',
            type: 'scatter',
            name: 'Casos Solicitantes (Mx,tot)',
            marker: { color: '#ef4444', size: 6, symbol: 'circle' },
            text: text_other,
            hovertemplate: '<b>%{text}</b><br>Mx,tot: %{x:.1f} kNm<br>Nsd: %{y:.1f} kN<extra></extra>'
        });
    }

    if (selPtX) {
        traces.push({
            x: [selPtX.mx],
            y: [selPtX.n],
            mode: 'markers',
            type: 'scatter',
            name: `${selPtX.label} (Mx)`,
            marker: { color: '#22c55e', size: 10, symbol: 'diamond', line: { color: '#ffffff', width: 1.5 } },
            hovertemplate: '<b>%{text}</b><br>Mx,tot: %{x:.1f} kNm<br>Nsd: %{y:.1f} kN<extra></extra>',
            text: [selPtX.label]
        });
        traces.push({
            x: [selPtX.my],
            y: [selPtX.n],
            mode: 'markers',
            type: 'scatter',
            name: `${selPtX.label} (My)`,
            marker: { color: '#06b6d4', size: 9, symbol: 'square', line: { color: '#ffffff', width: 1.5 } },
            hovertemplate: '<b>%{text}</b><br>My,tot: %{x:.1f} kNm<br>Nsd: %{y:.1f} kN<extra></extra>',
            text: [`${selPtX.label} (My)`]
        });
    }

    const layout = {
        margin: { l: 50, r: 20, b: 45, t: 25 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: dark ? '#1e293b' : '#f8fafc',
        xaxis: {
            title: { text: 'Momento Fletor Solicitante / Resistente (kNm)', font: { size: 11, color: axisColor } },
            color: axisColor,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: '#94a3b8'
        },
        yaxis: {
            title: { text: 'Força Normal N (kN) [Compressão < 0]', font: { size: 11, color: axisColor } },
            color: axisColor,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: '#94a3b8'
        },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(0,0,0,0.15)', font: { size: 10, color: axisColor } },
        hovermode: 'closest'
    };

    Plotly.newPlot('chart3d', traces, layout, { responsive: true, displayModeBar: false });
}

function render2DSliceChart() {
    const chartDiv = document.getElementById('chart3d');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';

    const loadCases = pcalcData.resultados.loadCases || [];
    const selectedIdx = canvasView.selectedCaseIndex || 0;
    const selCase = loadCases[selectedIdx] || { Nsd: 0, MxTot: 0, MyTot: 0, originalIndex: 1 };
    const N_target = selCase.Nsd;

    const surface = pcalcData.resultados.surfacePoints;
    const dark = typeof isDark === 'function' ? isDark() : false;
    const axisColor = dark ? '#94a3b8' : '#475569';
    const gridColor = dark ? '#334155' : '#e2e8f0';

    const sliceMx = [];
    const sliceMy = [];

    if (surface && surface.x && surface.x.length > 0) {
        const ptsPerAngle = pcalcData.resultados.statesPerAngle || 43;
        const numAngles = Math.round(surface.x.length / ptsPerAngle);

        for (let a = 0; a < numAngles; a++) {
            const startIdx = a * ptsPerAngle;
            let bestMx = 0, bestMy = 0;
            let found = false;

            for (let k = 0; k < ptsPerAngle - 1; k++) {
                const idx1 = startIdx + k;
                const idx2 = startIdx + k + 1;
                const z1 = surface.z[idx1];
                const z2 = surface.z[idx2];

                if ((z1 <= N_target && z2 >= N_target) || (z1 >= N_target && z2 <= N_target)) {
                    const factor = (Math.abs(z2 - z1) > 1e-4) ? (N_target - z1) / (z2 - z1) : 0;
                    bestMx = surface.x[idx1] + factor * (surface.x[idx2] - surface.x[idx1]);
                    bestMy = surface.y[idx1] + factor * (surface.y[idx2] - surface.y[idx1]);
                    found = true;
                    break;
                }
            }

            if (found) {
                sliceMx.push(bestMx);
                sliceMy.push(bestMy);
            }
        }

        // Fallback tolerante caso N_target esteja muito próximo dos extremos
        if (sliceMx.length < 8 && surface.x.length > 0) {
            const toleranceN = Math.max(25, Math.abs(N_target) * 0.10);
            const tolPts = [];
            for (let i = 0; i < surface.x.length; i++) {
                if (Math.abs(surface.z[i] - N_target) <= toleranceN) {
                    tolPts.push({
                        x: surface.x[i],
                        y: surface.y[i],
                        ang: Math.atan2(surface.y[i], surface.x[i])
                    });
                }
            }
            if (tolPts.length >= 8) {
                tolPts.sort((p1, p2) => p1.ang - p2.ang);
                sliceMx.length = 0;
                sliceMy.length = 0;
                tolPts.forEach(p => {
                    sliceMx.push(p.x);
                    sliceMy.push(p.y);
                });
            }
        }

        if (sliceMx.length > 0) {
            sliceMx.push(sliceMx[0]);
            sliceMy.push(sliceMy[0]);
        }
    }

    const traces = [];

    const showElu = pcalcData.config.showEluSurface !== false && (document.getElementById('toggle-3d-elu') ? document.getElementById('toggle-3d-elu').checked : true);
    const showMin = pcalcData.config.showMinMomentSurface !== false && (document.getElementById('toggle-3d-min') ? document.getElementById('toggle-3d-min').checked : false);

    // 1. Envoltória ELU Biaxial
    if (showElu && sliceMx.length > 0) {
        traces.push({
            x: sliceMx,
            y: sliceMy,
            mode: 'lines',
            type: 'scatter',
            fill: 'toself',
            fillcolor: 'rgba(99, 102, 241, 0.15)',
            name: `Envoltória Biaxial (N = ${N_target.toFixed(1)} kN)`,
            line: { color: '#6366f1', width: 2.5 },
            hovertemplate: 'Mx: %{x:.1f} kNm<br>My: %{y:.1f} kNm<extra></extra>'
        });
    }

    // 2. Momento Mínimo (M1d,min)
    if (showMin && Math.abs(N_target) > 0.01) {
        const hx = pcalcData.secao.hx || 30;
        const hy = pcalcData.secao.hy || 30;
        const e_min_x = (1.5 + 0.03 * hy) / 100;
        const e_min_y = (1.5 + 0.03 * hx) / 100;
        const M_min_x = Math.abs(N_target) * e_min_x;
        const M_min_y = Math.abs(N_target) * e_min_y;

        const minEllX = [];
        const minEllY = [];
        const nSteps = 72;
        for (let i = 0; i <= nSteps; i++) {
            const th = (i / nSteps) * 2 * Math.PI;
            minEllX.push(M_min_x * Math.cos(th));
            minEllY.push(M_min_y * Math.sin(th));
        }

        traces.push({
            x: minEllX,
            y: minEllY,
            mode: 'lines',
            type: 'scatter',
            name: 'Momento Mínimo M1d,min',
            line: { color: '#f59e0b', width: 1.5, dash: 'dash' },
            hovertemplate: 'M1d,min,x: %{x:.1f} kNm<br>M1d,min,y: %{y:.1f} kNm<extra></extra>'
        });
    }

    // 3. Outros casos de carga solicitantes
    const ptsX_other = [], ptsY_other = [], text_other = [];
    let selPt = null;

    loadCases.forEach((l, i) => {
        const caseNum = l.originalIndex !== undefined ? l.originalIndex : (i + 1);
        if (i === selectedIdx) {
            selPt = {
                mx: l.MxTot,
                my: l.MyTot,
                n: l.Nsd,
                label: `Caso ${caseNum} (Sel)`
            };
        } else {
            ptsX_other.push(l.MxTot);
            ptsY_other.push(l.MyTot);
            text_other.push(`Caso ${caseNum}`);
        }
    });

    if (ptsX_other.length > 0) {
        traces.push({
            x: ptsX_other,
            y: ptsY_other,
            mode: 'markers',
            type: 'scatter',
            name: 'Outros Casos Solicitantes',
            marker: { color: '#ef4444', size: 6, symbol: 'circle' },
            text: text_other,
            hovertemplate: '<b>%{text}</b><br>Mx: %{x:.1f} kNm<br>My: %{y:.1f} kNm<extra></extra>'
        });
    }

    // 4. Caso de carga selecionado
    if (selPt) {
        traces.push({
            x: [selPt.mx],
            y: [selPt.my],
            mode: 'markers',
            type: 'scatter',
            name: `Caso Sel (Mx=${selPt.mx.toFixed(1)}, My=${selPt.my.toFixed(1)})`,
            marker: { color: '#22c55e', size: 10, symbol: 'diamond', line: { color: '#ffffff', width: 1.5 } },
            hovertemplate: `<b>${selPt.label}</b><br>Mx: %{x:.1f} kNm<br>My: %{y:.1f} kNm<br>Nsd: ${selPt.n.toFixed(1)} kN<extra></extra>`
        });
    }

    const layout = {
        margin: { l: 50, r: 20, b: 45, t: 25 },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: dark ? '#1e293b' : '#f8fafc',
        xaxis: {
            title: { text: 'Momento Fletor Mx (kNm)', font: { size: 11, color: axisColor } },
            color: axisColor,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: '#94a3b8'
        },
        yaxis: {
            title: { text: 'Momento Fletor My (kNm)', font: { size: 11, color: axisColor } },
            color: axisColor,
            gridcolor: gridColor,
            zeroline: true,
            zerolinecolor: '#94a3b8'
        },
        showlegend: true,
        legend: { x: 0.02, y: 0.98, bgcolor: 'rgba(0,0,0,0.15)', font: { size: 10, color: axisColor } }
    };

    Plotly.newPlot('chart3d', traces, layout, { responsive: true, displayModeBar: false });
}

function render3DChartMesh() {
    const chartDiv = document.getElementById('chart3d');
    if (!chartDiv) return;
    chartDiv.innerHTML = '';

    const { x, y, z } = pcalcData.resultados.surfacePoints;
    const loadCases = pcalcData.resultados.loadCases;
    const minSurf = pcalcData.resultados.minMomentSurface;
    const crackSurf = pcalcData.resultados.crackingSurface;

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
        name: 'Diagrama de Interação (ELU)',
        alphahull: 0,
        lighting: { ambient: 0.5, diffuse: 0.6 }
    };

    const hasCrackSurf = crackSurf && crackSurf.x && crackSurf.x.length > 0;
    const crackName = pcalcData.config.crackingCriterion === 'mr_cracking' ? 'Início Fissuração (Mr / ELS-F)' : `Abertura Limite (wk ≤ ${pcalcData.config.wLim || 0.30}mm / ELS-W)`;
    const crackingSurfTrace = hasCrackSurf ? {
        type: 'mesh3d',
        x: crackSurf.x, y: crackSurf.y, z: crackSurf.z,
        opacity: 0.32,
        color: '#06b6d4',
        name: crackName,
        alphahull: 0,
        lighting: { ambient: 0.6, diffuse: 0.7 }
    } : null;

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
    const x_serv = [], y_serv = [], z_serv = [], text_serv = [];

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

        if (l.cracking) {
            x_serv.push(l.cracking.Mx_serv);
            y_serv.push(l.cracking.My_serv);
            z_serv.push(l.cracking.N_serv);
            text_serv.push(`Caso ${l.originalIndex}: wk=${l.cracking.wk.toFixed(2)}mm (${l.cracking.status})`);
        }
    });

    const loadsTraceOther = {
        type: 'scatter3d',
        mode: 'markers',
        x: x_other, y: y_other, z: z_other,
        marker: { size: 3, color: '#ef4444', symbol: 'circle', opacity: 0.6 },
        hovertemplate: '<b>Caso %{text}</b><br>N: %{z:.1f} kN<br>Mx: %{x:.1f} kNm<br>My: %{y:.1f} kNm<extra></extra>',
        text: text_other,
        name: 'Outros Casos (ELU)'
    };

    const loadsTraceSelected = {
        type: 'scatter3d',
        mode: 'markers',
        x: x_sel, y: y_sel, z: z_sel,
        marker: { size: 6, color: '#22c55e', symbol: 'diamond', line: { width: 2, color: '#ffffff' } },
        hovertemplate: '<b>Caso %{text} (Selecionado)</b><br>N: %{z:.1f} kN<br>Mx: %{x:.1f} kNm<br>My: %{y:.1f} kNm<br>FS: ~%{customdata:.2f}<extra></extra>',
        text: text_sel,
        customdata: [loadCases[selectedIdx]?.safetyFactor || 0],
        name: 'Selecionado (ELU)'
    };

    const loadsTraceService = {
        type: 'scatter3d',
        mode: 'markers',
        x: x_serv, y: y_serv, z: z_serv,
        marker: { size: 4, color: '#06b6d4', symbol: 'cross', opacity: 0.85 },
        hovertemplate: '<b>%{text}</b><br>Nser: %{z:.1f} kN<br>Mx,ser: %{x:.1f} kNm<br>My,ser: %{y:.1f} kNm<extra></extra>',
        text: text_serv,
        name: 'Cargas ELS (Serviço)'
    };

    const data = [];
    if (pcalcData.config.showEluSurface !== false) data.push(surfaceTrace);
    if (pcalcData.config.showCrackingSurface !== false && crackingSurfTrace) data.push(crackingSurfTrace);
    if (pcalcData.config.showMinMomentSurface !== false) data.push(minSurfTrace);
    data.push(loadsTraceOther);
    if (x_sel.length > 0) data.push(loadsTraceSelected);
    if (pcalcData.config.showServiceLoads !== false && x_serv.length > 0) data.push(loadsTraceService);

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

function render3DChart() {
    renderInteractionChart();
}

let elevationViewMode = 'combined'; // 'combined', 'mx', 'my', 'all'

function setElevationView(mode) {
    elevationViewMode = mode;
    const views = ['combined', 'mx', 'my', 'all'];
    views.forEach(v => {
        const btn = document.getElementById(`btn-elev-view-${v}`);
        const panel = document.getElementById(`elevation-panel-${v}`);
        if (panel) {
            if (v === mode) panel.classList.remove('hidden');
            else panel.classList.add('hidden');
        }
        if (btn) {
            if (v === mode) {
                btn.className = "px-2 py-0.5 rounded bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs cursor-pointer transition-all";
            } else {
                btn.className = "px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white cursor-pointer transition-all font-semibold";
            }
        }
    });

    renderElevation(canvasView.selectedCaseIndex || 0);
}

function renderColumnSchematic(containerId, caseIndex) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const L_cm = Math.max(0, pcalcData.secao.length !== undefined ? pcalcData.secao.length : 400);
    const L_m = (L_cm / 100).toFixed(2);
    const isSection = (L_cm <= 0) || (pcalcData.secao.isSectionMode === true);

    if (isSection) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center p-4 text-gray-400">
                <span class="text-3xl mb-1">📐</span>
                <span class="font-bold text-xs text-slate-700 dark:text-gray-300">Seção Transversal Pura</span>
                <span class="text-[10px]">L = 0 cm (Sem elevação do pilar)</span>
            </div>
        `;
        return;
    }

    const loadCase = (pcalcData.resultados.loadCases && pcalcData.resultados.loadCases[caseIndex]) || {};
    const origLoad = (pcalcData.esforcos.listaEsforcos && pcalcData.esforcos.listaEsforcos[caseIndex]) || {};

    const gf = pcalcData.config.gamaF || 1.4;
    const Nsd = loadCase.Nsd !== undefined ? loadCase.Nsd : ((origLoad.n || 0) * gf);
    const M1xt = loadCase.Mx1Top !== undefined ? loadCase.Mx1Top : ((origLoad.mxTop || 0) * gf);
    const M1xb = loadCase.Mx1Bot !== undefined ? loadCase.Mx1Bot : ((origLoad.mxBot || 0) * gf);
    const qx = origLoad.qx || 0;
    const boundary = pcalcData.secao.boundary || 'pinned';
    const stype = pcalcData.secao.tipoSecao || 'Retangular';
    const hx = pcalcData.secao.hx || 30;
    const hy = pcalcData.secao.hy || 50;

    const dark = typeof isDark === 'function' ? isDark() : false;
    const strokeColor = dark ? '#94a3b8' : '#334155';
    const concreteFill = dark ? '#1e293b' : '#f1f5f9';
    const concreteBorder = dark ? '#475569' : '#94a3b8';
    const axisColor = dark ? '#f59e0b' : '#d97706';
    const defColor = '#3b82f6';
    const textColor = dark ? '#cbd5e1' : '#1e293b';

    const yTop = 52;
    const yBot = 300;
    const xCenter = 135;
    const colW = 32;
    const colX1 = xCenter - colW / 2;
    const colX2 = xCenter + colW / 2;

    // Símbolos de vinculação nos extremos
    let topSupportSvg = '';
    let botSupportSvg = '';

    if (boundary === 'pinned') {
        topSupportSvg = `
            <polygon points="${xCenter},${yTop} ${xCenter - 10},${yTop - 13} ${xCenter + 10},${yTop - 13}" fill="${dark ? '#334155' : '#e2e8f0'}" stroke="${strokeColor}" stroke-width="1.5" />
            <circle cx="${xCenter}" cy="${yTop}" r="3" fill="#ffffff" stroke="${strokeColor}" stroke-width="1.5" />
            <line x1="${xCenter - 14}" y1="${yTop - 13}" x2="${xCenter + 14}" y2="${yTop - 13}" stroke="${strokeColor}" stroke-width="2" />
        `;
        botSupportSvg = `
            <polygon points="${xCenter},${yBot} ${xCenter - 11},${yBot + 15} ${xCenter + 11},${yBot + 15}" fill="${dark ? '#334155' : '#e2e8f0'}" stroke="${strokeColor}" stroke-width="1.5" />
            <circle cx="${xCenter}" cy="${yBot}" r="3" fill="#ffffff" stroke="${strokeColor}" stroke-width="1.5" />
            <line x1="${xCenter - 16}" y1="${yBot + 15}" x2="${xCenter + 16}" y2="${yBot + 15}" stroke="${strokeColor}" stroke-width="2" />
            <line x1="${xCenter - 12}" y1="${yBot + 15}" x2="${xCenter - 16}" y2="${yBot + 21}" stroke="${strokeColor}" stroke-width="1" />
            <line x1="${xCenter - 4}" y1="${yBot + 15}" x2="${xCenter - 8}" y2="${yBot + 21}" stroke="${strokeColor}" stroke-width="1" />
            <line x1="${xCenter + 4}" y1="${yBot + 15}" x2="${xCenter}" y2="${yBot + 21}" stroke="${strokeColor}" stroke-width="1" />
            <line x1="${xCenter + 12}" y1="${yBot + 15}" x2="${xCenter + 8}" y2="${yBot + 21}" stroke="${strokeColor}" stroke-width="1" />
        `;
    } else {
        botSupportSvg = `
            <rect x="${xCenter - 22}" y="${yBot}" width="44" height="6" fill="${dark ? '#475569' : '#cbd5e1'}" stroke="${strokeColor}" stroke-width="1.5" />
            <line x1="${xCenter - 26}" y1="${yBot + 6}" x2="${xCenter + 26}" y2="${yBot + 6}" stroke="${strokeColor}" stroke-width="2" />
            <line x1="${xCenter - 22}" y1="${yBot + 6}" x2="${xCenter - 26}" y2="${yBot + 13}" stroke="${strokeColor}" stroke-width="1.2" />
            <line x1="${xCenter - 12}" y1="${yBot + 6}" x2="${xCenter - 16}" y2="${yBot + 13}" stroke="${strokeColor}" stroke-width="1.2" />
            <line x1="${xCenter - 2}" y1="${yBot + 6}" x2="${xCenter - 6}" y2="${yBot + 13}" stroke="${strokeColor}" stroke-width="1.2" />
            <line x1="${xCenter + 8}" y1="${yBot + 6}" x2="${xCenter + 4}" y2="${yBot + 13}" stroke="${strokeColor}" stroke-width="1.2" />
            <line x1="${xCenter + 18}" y1="${yBot + 6}" x2="${xCenter + 14}" y2="${yBot + 13}" stroke="${strokeColor}" stroke-width="1.2" />
        `;
        if (boundary === 'fixed_fixed') {
            topSupportSvg = `
                <rect x="${xCenter - 22}" y="${yTop - 6}" width="44" height="6" fill="${dark ? '#475569' : '#cbd5e1'}" stroke="${strokeColor}" stroke-width="1.5" />
                <line x1="${xCenter - 26}" y1="${yTop - 6}" x2="${xCenter + 26}" y2="${yTop - 6}" stroke="${strokeColor}" stroke-width="2" />
                <line x1="${xCenter - 22}" y1="${yTop - 6}" x2="${xCenter - 26}" y2="${yTop - 13}" stroke="${strokeColor}" stroke-width="1.2" />
                <line x1="${xCenter - 12}" y1="${yTop - 6}" x2="${xCenter - 16}" y2="${yTop - 13}" stroke="${strokeColor}" stroke-width="1.2" />
                <line x1="${xCenter - 2}" y1="${yTop - 6}" x2="${xCenter - 6}" y2="${yTop - 13}" stroke="${strokeColor}" stroke-width="1.2" />
                <line x1="${xCenter + 8}" y1="${yTop - 6}" x2="${xCenter + 4}" y2="${yTop - 13}" stroke="${strokeColor}" stroke-width="1.2" />
                <line x1="${xCenter + 18}" y1="${yTop - 6}" x2="${xCenter + 14}" y2="${yTop - 13}" stroke="${strokeColor}" stroke-width="1.2" />
            `;
        } else if (boundary === 'fixed_pinned') {
            topSupportSvg = `
                <polygon points="${xCenter},${yTop} ${xCenter - 10},${yTop - 13} ${xCenter + 10},${yTop - 13}" fill="${dark ? '#334155' : '#e2e8f0'}" stroke="${strokeColor}" stroke-width="1.5" />
                <circle cx="${xCenter}" cy="${yTop}" r="3" fill="#ffffff" stroke="${strokeColor}" stroke-width="1.5" />
                <line x1="${xCenter - 14}" y1="${yTop - 13}" x2="${xCenter + 14}" y2="${yTop - 13}" stroke="${strokeColor}" stroke-width="2" />
            `;
        } else {
            topSupportSvg = `<line x1="${colX1}" y1="${yTop}" x2="${colX2}" y2="${yTop}" stroke="${strokeColor}" stroke-width="2" />`;
        }
    }

    // Linha elástica deformada (2ª ordem)
    const isDouble = (M1xt * M1xb < -1e-4);
    let defPath = '';
    if (boundary === 'fixed_fixed') {
        const signDef = Math.sign(M1xt + M1xb) || 1;
        const xApex = xCenter + (signDef * 15);
        defPath = `M ${xCenter} ${yBot} C ${xCenter} ${yBot - 40}, ${xApex} ${(yTop + yBot)/2 + 35}, ${xApex} ${(yTop + yBot)/2} C ${xApex} ${(yTop + yBot)/2 - 35}, ${xCenter} ${yTop + 40}, ${xCenter} ${yTop}`;
    } else if (isDouble) {
        const yInflec = yTop + (yBot - yTop) * 0.51;
        defPath = `M ${xCenter} ${yBot} Q ${xCenter - 14} ${(yBot + yInflec)/2} ${xCenter} ${yInflec} Q ${xCenter + 14} ${(yTop + yInflec)/2} ${xCenter} ${yTop}`;
    } else {
        const signDef = Math.sign(M1xt + M1xb) || 1;
        const xApex = xCenter + (signDef * 14);
        defPath = `M ${xCenter} ${yBot} Q ${xApex} ${(yBot + yTop)/2} ${xCenter} ${yTop}`;
    }

    // Carga transversal q
    let qSvg = '';
    if (Math.abs(qx) > 0.01) {
        const qSign = Math.sign(qx) >= 0 ? 1 : -1;
        const qStartX = qSign > 0 ? (colX1 - 22) : (colX2 + 22);
        const qEndX = qSign > 0 ? colX1 : colX2;
        let arrows = '';
        for (let i = 0; i <= 4; i++) {
            const yArr = yTop + 25 + i * ((yBot - yTop - 50) / 4);
            arrows += `<line x1="${qStartX}" y1="${yArr}" x2="${qEndX}" y2="${yArr}" stroke="#f59e0b" stroke-width="1.3" marker-end="url(#arrow-q)" />`;
        }
        qSvg = `
            <defs>
                <marker id="arrow-q" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                    <path d="M0,0 L5,2.5 L0,5 Z" fill="#f59e0b" />
                </marker>
            </defs>
            <line x1="${qStartX}" y1="${yTop + 25}" x2="${qStartX}" y2="${yBot - 25}" stroke="#f59e0b" stroke-width="1.6" />
            ${arrows}
            <text x="${(qStartX + qEndX)/2 - 12}" y="${(yTop + yBot)/2}" font-size="8" font-weight="bold" fill="#f59e0b">q=${qx}kN/m</text>
        `;
    }

    // Vetores de Momento Fletor Curvos (extremidades)
    let mTopSvg = '';
    if (Math.abs(M1xt) > 0.1) {
        const isPos = M1xt > 0;
        const arcD = isPos
            ? `M ${colX2 + 4} ${yTop + 14} A 11 11 0 0 1 ${colX2 + 4} ${yTop - 6}`
            : `M ${colX2 + 4} ${yTop - 6} A 11 11 0 0 1 ${colX2 + 4} ${yTop + 14}`;
        mTopSvg = `
            <path d="${arcD}" fill="none" stroke="#2563eb" stroke-width="1.6" marker-end="url(#arrow-m)" />
            <text x="${colX2 + 18}" y="${yTop + 5}" font-size="8" font-weight="bold" fill="#2563eb">Mtop=${M1xt.toFixed(0)}</text>
        `;
    }
    let mBotSvg = '';
    if (Math.abs(M1xb) > 0.1) {
        const isPos = M1xb > 0;
        const arcD = isPos
            ? `M ${colX2 + 4} ${yBot + 6} A 11 11 0 0 1 ${colX2 + 4} ${yBot - 14}`
            : `M ${colX2 + 4} ${yBot - 14} A 11 11 0 0 1 ${colX2 + 4} ${yBot + 6}`;
        mBotSvg = `
            <path d="${arcD}" fill="none" stroke="#2563eb" stroke-width="1.6" marker-end="url(#arrow-m)" />
            <text x="${colX2 + 18}" y="${yBot - 3}" font-size="8" font-weight="bold" fill="#2563eb">Mbot=${M1xb.toFixed(0)}</text>
        `;
    }

    // Normal arrow Nsd
    const isComp = Nsd < 0;
    const nColor = isComp ? '#ef4444' : '#3b82f6';
    const nArrow = `
        <defs>
            <marker id="arrow-n" markerWidth="6" markerHeight="6" refX="4" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="${nColor}" />
            </marker>
            <marker id="arrow-m" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 Z" fill="#2563eb" />
            </marker>
        </defs>
        <line x1="${xCenter}" y1="18" x2="${xCenter}" y2="${yTop - 4}" stroke="${nColor}" stroke-width="2.2" marker-end="url(#arrow-n)" />
        <rect x="${xCenter - 44}" y="3" width="88" height="13" rx="3" fill="${isComp ? '#fee2e2' : '#dbeafe'}" stroke="${nColor}" stroke-width="0.8" />
        <text x="${xCenter}" y="12" font-size="8" font-weight="bold" fill="${nColor}" text-anchor="middle">Nsd = ${Nsd.toFixed(1)} kN</text>
    `;

    // Cota L à esquerda
    const dimX = 32;
    const dimSvg = `
        <line x1="${dimX}" y1="${yTop}" x2="${dimX}" y2="${yBot}" stroke="${dark ? '#64748b' : '#94a3b8'}" stroke-width="1.2" />
        <line x1="${dimX - 4}" y1="${yTop}" x2="${dimX + 4}" y2="${yTop}" stroke="${dark ? '#64748b' : '#94a3b8'}" stroke-width="1.2" />
        <line x1="${dimX - 4}" y1="${yBot}" x2="${dimX + 4}" y2="${yBot}" stroke="${dark ? '#64748b' : '#94a3b8'}" stroke-width="1.2" />
        <text x="${dimX - 3}" y="${(yTop + yBot)/2}" font-size="8.5" font-weight="bold" fill="${textColor}" text-anchor="end" transform="rotate(-90 ${dimX - 3} ${(yTop + yBot)/2})">L = ${L_m} m</text>
    `;

    const secLabel = stype === 'Circular' ? `Ø ${hx}` : `${hx}×${hy}`;

    container.innerHTML = `
        <div class="w-full h-full flex flex-col justify-between">
            <div class="flex items-center justify-between px-2 pt-0.5 border-b border-gray-200/60 dark:border-gray-700/60 pb-1">
                <span class="text-[10px] font-bold text-slate-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1">
                    <span>🏛️</span> Esquema do Pilar
                </span>
                <span class="text-[9px] font-semibold bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.2 rounded">${boundary.toUpperCase()}</span>
            </div>

            <div class="relative flex-grow flex items-center justify-center py-0.5">
                <svg viewBox="0 0 250 325" class="w-full h-auto max-h-[290px]" style="overflow: visible;">
                    <defs>
                        <pattern id="concrete-hatch-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                            <line x1="0" y1="0" x2="0" y2="8" stroke="${dark ? '#334155' : '#e2e8f0'}" stroke-width="1.2" />
                        </pattern>
                    </defs>

                    ${dimSvg}

                    <!-- Fuste do Pilar de Concreto -->
                    <rect x="${colX1}" y="${yTop}" width="${colW}" height="${yBot - yTop}" fill="${concreteFill}" stroke="${concreteBorder}" stroke-width="1.8" rx="1.5" />
                    <rect x="${colX1}" y="${yTop}" width="${colW}" height="${yBot - yTop}" fill="url(#concrete-hatch-pattern)" opacity="0.7" />

                    <!-- Eixo geométrico do pilar -->
                    <line x1="${xCenter}" y1="${yTop}" x2="${xCenter}" y2="${yBot}" stroke="${axisColor}" stroke-width="1.2" stroke-dasharray="4,2.5" />

                    <!-- Linha elástica deformada (2ª ordem) -->
                    <path d="${defPath}" fill="none" stroke="${defColor}" stroke-width="1.8" stroke-dasharray="3,2" />

                    <!-- Apoios Vínculos -->
                    ${topSupportSvg}
                    ${botSupportSvg}

                    <!-- Força Normal Nsd -->
                    ${nArrow}

                    <!-- Cargas Transversais q -->
                    ${qSvg}

                    <!-- Momentos de extremidade curvos -->
                    ${mTopSvg}
                    ${mBotSvg}

                    <!-- Etiqueta da Seção no Fuste -->
                    <rect x="${xCenter - 22}" y="${(yTop + yBot)/2 - 7}" width="44" height="14" rx="2.5" fill="${dark ? '#0f172a' : '#ffffff'}" stroke="${concreteBorder}" stroke-width="0.8" />
                    <text x="${xCenter}" y="${(yTop + yBot)/2 + 3}" font-size="8" font-weight="bold" fill="${textColor}" text-anchor="middle">${secLabel}</text>
                </svg>
            </div>

            <!-- Rodapé com Metadados do Pilar -->
            <div class="grid grid-cols-3 gap-1 pt-1 border-t border-gray-200/60 dark:border-gray-700/60 text-[8.5px] text-center font-mono">
                <div class="bg-white dark:bg-gray-800 rounded p-0.5 border border-gray-100 dark:border-gray-700">
                    <span class="text-gray-400 block text-[7.5px]">SEÇÃO</span>
                    <b class="text-slate-700 dark:text-gray-200 truncate block">${stype}</b>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded p-0.5 border border-gray-100 dark:border-gray-700">
                    <span class="text-gray-400 block text-[7.5px]">ALTURA</span>
                    <b class="text-indigo-600 dark:text-indigo-400">${L_m}m</b>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded p-0.5 border border-gray-100 dark:border-gray-700">
                    <span class="text-gray-400 block text-[7.5px]">VÍNCULO</span>
                    <b class="text-slate-700 dark:text-gray-200 truncate block">${boundary === 'pinned' ? 'Apoiado' : 'Engastado'}</b>
                </div>
            </div>
        </div>
    `;
}

function renderElevation(caseIndex) {
    const placeholder = document.getElementById('elevation-placeholder');

    const L = Math.max(0, pcalcData.secao.length !== undefined ? pcalcData.secao.length : 400);
    if (L <= 0) {
        if (placeholder) {
            placeholder.style.display = 'flex';
            placeholder.innerHTML = `
                <div class="text-center p-6 space-y-2">
                    <span class="text-3xl block">📐</span>
                    <div class="font-bold text-sm text-slate-800 dark:text-white">Análise de Seção Transversal (L = 0)</div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
                        O pilar está com comprimento nulo (L = 0 cm). Os diagramas de elevação e os efeitos de 2ª ordem ao longo da altura não se aplicam à verificação de seção transversal.
                    </div>
                </div>
            `;
        }
        return;
    }

    if (placeholder) placeholder.style.display = 'none';

    const loadCase = pcalcData.resultados.loadCases && pcalcData.resultados.loadCases[caseIndex];
    if (!loadCase) return;

    const points = 50;
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

    // Carga lateral distribuída (kN/m)
    const gf = pcalcData.config.gamaF || 1.4;
    const origLoad = (pcalcData.esforcos.listaEsforcos && pcalcData.esforcos.listaEsforcos[caseIndex]) || {};
    const qxd = loadCase.qxd !== undefined ? loadCase.qxd : ((origLoad.qx || 0) * gf);
    const qyd = loadCase.qyd !== undefined ? loadCase.qyd : ((origLoad.qy || 0) * gf);
    const L_m = L / 100.0;

    const isPinned = pcalcData.secao.boundary === 'pinned';
    const N_val = loadCase.Nsd;
    const m2x_mag = loadCase.M2dx || 0;
    const m2y_mag = loadCase.M2dy || 0;

    // Função de forma de 2ª ordem ao longo da altura (pos = z / L)
    // Suporta curvatura simples e curvatura dupla (diagrama cruzando o zero de positivo a negativo)
    const calcSecondOrderShape = (pos, M1top, M1bot, M2mag) => {
        if (!M2mag || M2mag === 0) return 0;

        if (!isPinned) {
            const bnd = pcalcData.secao.boundary;
            if (bnd === 'fixed_fixed') {
                // Bi-engastado: Momento de 2ª ordem tem momentos de engaste nos extremos (-0.5*M2) e ápice positivo no vão (+1.0*M2)
                // Inversão com passagem por zero em pos ~ 0.20 e pos ~ 0.80
                const sign = Math.sign(M1bot) || Math.sign(M1top) || 1;
                const shape = 1.5 * Math.pow(Math.sin(Math.PI * pos), 2) - 0.5;
                return sign * M2mag * shape;
            } else if (bnd === 'fixed_pinned') {
                // Engastado-Apoiado: engaste na base (pos=0), articulado no topo (pos=1)
                const sign = Math.sign(M1bot) || Math.sign(M1top) || 1;
                const shape = Math.sin(Math.PI * Math.pow(pos, 0.75)) - 0.45 * Math.pow(1 - pos, 2);
                return sign * M2mag * shape;
            } else {
                // Balanço (Cantilever): engaste na base (pos=0) onde M2 é MÁXIMO, topo livre (pos=1) onde M2 = 0
                const sign = Math.sign(M1bot) || Math.sign(M1top) || 1;
                return sign * M2mag * Math.pow(1 - pos, 2);
            }
        }

        const isDoubleCurvature = (M1top * M1bot < -1e-4);
        if (!isDoubleCurvature) {
            let sign = 1;
            if (Math.abs(M1top + M1bot) > 1e-4) {
                sign = Math.sign(M1top + M1bot);
            } else if (Math.abs(M1bot) > 1e-4) {
                sign = Math.sign(M1bot);
            } else if (Math.abs(M1top) > 1e-4) {
                sign = Math.sign(M1top);
            }
            return (sign * M2mag) * Math.sin(Math.PI * pos);
        }

        const pos0 = (-M1bot) / (M1top - M1bot);
        const Mmax = Math.max(Math.abs(M1top), Math.abs(M1bot));
        if (pos0 <= 0.02 || pos0 >= 0.98 || Mmax === 0) {
            const sign = Math.sign(M1bot) || 1;
            return (sign * M2mag) * Math.sin(Math.PI * pos);
        }

        if (pos < pos0) {
            const signBot = Math.sign(M1bot) || 1;
            const ampBot = (Math.abs(M1bot) / Mmax) * M2mag;
            return signBot * ampBot * Math.sin(Math.PI * (pos / pos0));
        } else {
            const signTop = Math.sign(M1top) || 1;
            const ampTop = (Math.abs(M1top) / Mmax) * M2mag;
            return signTop * ampTop * Math.sin(Math.PI * ((pos - pos0) / (1 - pos0)));
        }
    };

    for (let i = 0; i <= points; i++) {
        const pos = i / points;
        const height = pos * L;
        z.push(height);

        normal.push(N_val);
        mxMinLine.push(Md_min_x);
        myMinLine.push(Md_min_y);

        // Curvatura parabólica de 1ª ordem gerada por carga lateral distribuída q (kN/m):
        // delta_M(pos) = (q * L^2 / 2) * pos * (1 - pos) [atinge q*L^2/8 no meio pos=0.5]
        const dM1_q_x = (qxd * L_m * L_m / 2.0) * pos * (1 - pos);
        const dM1_q_y = (qyd * L_m * L_m / 2.0) * pos * (1 - pos);

        // Momento de 1ª ordem ao longo da altura (não linear quando há carga lateral):
        const m1x_curr = M1xbot + (M1xtop - M1xbot) * pos + dM1_q_x;
        const m1y_curr = M1ybot + (M1ytop - M1ybot) * pos + dM1_q_y;

        mx1.push(m1x_curr);
        my1.push(m1y_curr);

        // Momento Total (1ª ordem com flecha de vão + 2ª ordem)
        const dM2x = calcSecondOrderShape(pos, M1xtop, M1xbot, m2x_mag);
        const dM2y = calcSecondOrderShape(pos, M1ytop, M1ybot, m2y_mag);

        mxTot.push(m1x_curr + dM2x);
        myTot.push(m1y_curr + dM2y);
    }

    const dark = typeof isDark === 'function' ? isDark() : false;
    const plotBgColor = dark ? '#1f2937' : '#f8fafc';
    const lineColor = dark ? '#e2e8f0' : '#0f172a';
    const dashedLineColor = dark ? '#94a3b8' : '#64748b';
    const minLineColor = '#ef4444';
    const fontColor = dark ? '#94a3b8' : '#334155';
    const fillColor = dark ? 'rgba(59, 130, 246, 0.22)' : 'rgba(59, 130, 246, 0.16)';

    const commonLayout = {
        margin: { l: 25, r: 10, b: 25, t: 25 },
        showlegend: false,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: plotBgColor,
        xaxis: {
            zeroline: true, zerolinecolor: dark ? '#cbd5e1' : '#475569', zerolinewidth: 1.5,
            showgrid: true, gridcolor: dark ? '#374151' : '#e2e8f0',
        },
        yaxis: { showgrid: false, zeroline: false, showticklabels: false, range: [0, L] },
        font: { size: 9.5, color: fontColor }
    };

    const plotMoment = (divId, tTot, t1, tMin, title, mTopVal, mBotVal) => {
        const el = document.getElementById(divId);
        if (!el) return;

        // Valor de vão (meio da altura):
        const mMidTot = tTot[Math.floor(points / 2)] || 0;
        const mMid1 = t1[Math.floor(points / 2)] || 0;

        const annotations = [
            {
                x: mTopVal, y: L, xref: 'x', yref: 'y',
                text: `Top:${mTopVal.toFixed(0)}`,
                showarrow: true, arrowhead: 4, arrowsize: 0.8, arrowcolor: dark ? '#cbd5e1' : '#475569',
                font: { size: 9, color: dark ? '#93c5fd' : '#1d4ed8', weight: 'bold' },
                bgcolor: dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)',
                bordercolor: dark ? '#334155' : '#cbd5e1', borderpad: 2
            },
            {
                x: mMidTot, y: L / 2, xref: 'x', yref: 'y',
                text: `Vão:${mMidTot.toFixed(0)}`,
                showarrow: true, arrowhead: 4, arrowsize: 0.8, arrowcolor: '#3b82f6',
                font: { size: 9, color: dark ? '#67e8f9' : '#0284c7', weight: 'bold' },
                bgcolor: dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)',
                bordercolor: dark ? '#334155' : '#cbd5e1', borderpad: 2
            },
            {
                x: mBotVal, y: 0, xref: 'x', yref: 'y',
                text: `Base:${mBotVal.toFixed(0)}`,
                showarrow: true, arrowhead: 4, arrowsize: 0.8, arrowcolor: dark ? '#cbd5e1' : '#475569',
                font: { size: 9, color: dark ? '#93c5fd' : '#1d4ed8', weight: 'bold' },
                bgcolor: dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.85)',
                bordercolor: dark ? '#334155' : '#cbd5e1', borderpad: 2
            }
        ];

        Plotly.newPlot(divId, [
            { x: tMin, y: z, type: 'scatter', mode: 'lines', line: { color: minLineColor, width: 1, dash: 'dot' }, name: 'M1d,min (+)' },
            { x: tMin.map(v => -v), y: z, type: 'scatter', mode: 'lines', line: { color: minLineColor, width: 1, dash: 'dot' }, name: 'M1d,min (-)' },
            { x: t1, y: z, type: 'scatter', mode: 'lines', line: { color: dashedLineColor, width: 1.5, dash: 'dash' }, name: '1ª Ordem' },
            { x: tTot, y: z, type: 'scatter', mode: 'lines', fill: 'tozerox', line: { color: lineColor, width: 2.2 }, fillcolor: fillColor, name: '2ª Ordem Total' }
        ], {
            ...commonLayout,
            title: { text: title, font: { size: 10.5, weight: 'bold', color: fontColor } },
            annotations: annotations
        }, { displayModeBar: false, responsive: true });
    };

    // Renderiza o Esquema Estrutural do Pilar (SVG) nos containers ativos:
    renderColumnSchematic('column-schematic-container', caseIndex);
    renderColumnSchematic('column-schematic-container-mx', caseIndex);
    renderColumnSchematic('column-schematic-container-my', caseIndex);

    // Renderiza nos plots de acordo com os modos de visualização:
    // 1. Modo Combinado (Esquema + Mx + My)
    plotMoment('elevation-plot-mx-combined', mxTot, mx1, mxMinLine, 'Msd,x (kNm)', M1xtop, M1xbot);
    plotMoment('elevation-plot-my-combined', myTot, my1, myMinLine, 'Msd,y (kNm)', M1ytop, M1ybot);

    // 2. Modo Tríplice (N | Mx | My)
    if (document.getElementById('elevation-plot-n')) {
        const traceN = { x: normal, y: z, type: 'scatter', mode: 'lines', fill: 'tozerox', line: { color: lineColor, width: 2 }, fillcolor: fillColor };
        Plotly.newPlot('elevation-plot-n', [traceN], { ...commonLayout, title: { text: 'Nsd (kN)', font: { size: 10.5, weight: 'bold', color: fontColor } } }, { displayModeBar: false, responsive: true });
    }
    plotMoment('elevation-plot-mx', mxTot, mx1, mxMinLine, 'Msd,x (kNm)', M1xtop, M1xbot);
    plotMoment('elevation-plot-my', myTot, my1, myMinLine, 'Msd,y (kNm)', M1ytop, M1ybot);

    // 3. Modos Focados (Mx / My com largura total)
    plotMoment('elevation-plot-mx-focus', mxTot, mx1, mxMinLine, 'Momento Fletor Msd,x (kNm)', M1xtop, M1xbot);
    plotMoment('elevation-plot-my-focus', myTot, my1, myMinLine, 'Momento Fletor Msd,y (kNm)', M1ytop, M1ybot);
}

window.setElevationView = setElevationView;
window.renderColumnSchematic = renderColumnSchematic;

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
    const Le = length * getEffectiveLengthFactor(boundary);
    const lamX = (hy > 0) ? (3.46 * Le) / hy : 0;
    const lamY = (hx > 0) ? (3.46 * Le) / hx : 0;

    const isSection = (length <= 0) || (pcalcData.secao && pcalcData.secao.isSectionMode);
    const isCirc = pcalcData.secao && pcalcData.secao.tipoSecao === 'Circular';

    if (typeof EngCAD !== 'undefined') {
        const hudTitle = isSection ? 'Seção Transversal de Concreto' : 'Pilar de Concreto Armado';
        const hudItems = [
            { label: 'Seção', value: isCirc ? `Ø ${hx} cm` : `${hx} × ${hy} cm` },
            { label: 'Taxa (ρ)', value: `${rho.toFixed(2)}%`, color: '#38bdf8' }
        ];
        if (!isSection) {
            hudItems.push({ label: 'Esbeltez λx / λy', value: `${lamX.toFixed(0)} / ${lamY.toFixed(0)}` });
            hudItems.push({ label: 'Comprimento', value: `L = ${length} cm` });
        }
        hudItems.push({ label: 'Concreto', value: `fck = ${fck} MPa` });
        EngCAD.updateHUD(container, hudTitle, hudItems);
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
    if (canvas.width <= 0 || canvas.height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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

    const rawScale = canvasView.scale * (canvasView.baseScale || 1.0);
    const currentScale = (isFinite(rawScale) && rawScale > 0.01) ? rawScale : 1.0;
    ctx.scale(currentScale, -currentScale);

    const { hx, hy } = pcalcData.secao;

    // 2. Concrete Outline & Technical 45-deg Hatching
    ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2 / currentScale;

    const isRect = pcalcData.secao.tipoSecao === 'Retangular';
    const isCirc = pcalcData.secao.tipoSecao === 'Circular';
    const xm = pcalcData.secao.xm || (hx / 2);
    const ym = pcalcData.secao.ym || (hy / 2);

    if (isRect) {
        ctx.fillRect(-hx / 2, -hy / 2, hx, hy);
        ctx.save();
        ctx.beginPath();
        ctx.rect(-hx / 2, -hy / 2, hx, hy);
        ctx.clip();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
        ctx.lineWidth = 1 / currentScale;
        const diag = Math.max(hx, hy) * 2;
        const hatchStep = Math.max(3, 14 / currentScale);
        if (isFinite(hatchStep) && hatchStep > 0) {
            for (let d = -diag; d < diag; d += hatchStep) {
                ctx.beginPath();
                ctx.moveTo(d, -diag);
                ctx.lineTo(d + diag, diag);
                ctx.stroke();
            }
        }
        ctx.restore();
        ctx.strokeRect(-hx / 2, -hy / 2, hx, hy);
    } else if (isCirc) {
        ctx.beginPath();
        ctx.arc(0, 0, hx / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    } else {
        const { exterior, holes } = getSectionPolygonData();
        ctx.beginPath();
        if (exterior && exterior.length >= 3) {
            ctx.moveTo(exterior[0][0] - xm, exterior[0][1] - ym);
            for (let i = 1; i < exterior.length; i++) {
                ctx.lineTo(exterior[i][0] - xm, exterior[i][1] - ym);
            }
            ctx.closePath();
        }
        if (holes && holes.length > 0) {
            holes.forEach(hole => {
                if (hole && hole.length >= 3) {
                    ctx.moveTo(hole[0][0] - xm, hole[0][1] - ym);
                    for (let i = 1; i < hole.length; i++) {
                        ctx.lineTo(hole[i][0] - xm, hole[i][1] - ym);
                    }
                    ctx.closePath();
                }
            });
        }
        ctx.fill('evenodd');
        ctx.stroke();
    }

    // Overlay Mesh Triangles (Visualização Técnica da Malha de Fibras)
    if (canvasView.showMesh && pcalcData.resultados.meshTriangles && pcalcData.resultados.meshTriangles.length > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.45)';
        ctx.lineWidth = 0.8 / currentScale;
        for (const tri of pcalcData.resultados.meshTriangles) {
            ctx.beginPath();
            ctx.moveTo(tri.a[0] - xm, tri.a[1] - ym);
            ctx.lineTo(tri.b[0] - xm, tri.b[1] - ym);
            ctx.lineTo(tri.c[0] - xm, tri.c[1] - ym);
            ctx.closePath();
            ctx.stroke();
        }
        ctx.restore();
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
    standard: 'nbr', // 'nbr', 'aci', 'ec2', 'all'
    chartMode: '2d_nm' // '2d_nm', '2d_mm', '3d'
};

function updatePcalcUI() {
    const isSection = (pcalcData.secao.length <= 0) || (pcalcData.secao.isSectionMode === true);
    const std = window.pcalcState.standard;

    // 1. View visibility: Both Pilar and Seção use the unified #view-column layout!
    const viewCol = document.getElementById('view-column');
    const viewSec = document.getElementById('view-section');
    if (viewCol) viewCol.classList.remove('hidden');
    if (viewSec) viewSec.classList.add('hidden');

    pcalcData.secao.isSectionMode = isSection;

    // 2. Mode buttons styling (hidden/fallback)
    const btnCol = document.getElementById('btn-mode-column');
    const btnSec = document.getElementById('btn-mode-section');
    if (btnCol) btnCol.style.display = 'none';
    if (btnSec) btnSec.style.display = 'none';

    // 3. Active badge & Calculate button
    const badge = document.getElementById('active-pcalc-badge');
    if (badge) {
        badge.textContent = isSection ? "SEÇÃO (L = 0)" : "PILAR";
        badge.className = isSection
            ? "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 uppercase border border-purple-200 dark:border-purple-800"
            : "px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 uppercase border border-blue-200 dark:border-blue-800";
    }

    const calcBtn = document.getElementById('calculate-btn');
    if (calcBtn) {
        calcBtn.innerHTML = isSection
            ? `<span>⚡</span> <span>CALCULAR SEÇÃO (M-N & CISALHAMENTO)</span>`
            : `<span>⚡</span> <span>CALCULAR PILAR (NBR 6118)</span>`;
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
        bMode.textContent = isSection ? "Modo: Seção Transversal (Flexão M-N & Cisalhamento, L = 0)" : "Modo: Pilar (Flexo-Compressão Biaxial & Efeitos de 2ª Ordem)";
    }

    if (std === 'nbr') {
        if (bTitle) bTitle.innerHTML = "🇧🇷 ABNT NBR 6118:2023";
        if (bDesc) bDesc.innerHTML = !isSection
            ? "• Pilar: &gamma;c=1.40, &gamma;s=1.15, &gamma;f=1.40 • Pilar-Padrão (1/r, Rigidez) e Momento Mínimo M<sub>1d,min</sub>"
            : "• Seção (L=0): &gamma;c=1.40, &gamma;s=1.15 • Envoltória 2D/3D (M-N) • Cisalhamento Modelo I com &sigma;<sub>cp</sub>";
    } else if (std === 'aci') {
        if (bTitle) bTitle.innerHTML = "🇺🇸 ACI 318-22 (LRFD)";
        if (bDesc) bDesc.innerHTML = isCol
            ? "• Column: &phi;c = 0.65 (tied) / 0.75 (spiral) • Moment Magnifier (&delta; M<sub>2</sub>) • Minimum Moment M<sub>2,min</sub> = Pu(15+0.03h) mm"
            : "• Section: Whitney Block (&beta;<sub>1</sub>) • &phi;<sub>flex</sub> = 0.65 – 0.90 • Shear &phi;V<sub>c</sub> com Nu";
    } else if (std === 'ec2') {
        if (bTitle) bTitle.innerHTML = "🇪🇺 Eurocode 2 (EN 1992-1-1)";
        if (bDesc) bDesc.innerHTML = isCol
            ? "• Column: &gamma;C = 1.50, &gamma;S = 1.15, &gamma;F = 1.35 • Imperfection e<sub>0</sub> = max(h/30, 20mm) • Curvature / Stiffness"
            : "• Section: &gamma;C = 1.50, &gamma;S = 1.15 • Variable Strut Angle cot&theta; = 2.5 • Shear com &sigma;<sub>cp</sub>";
    } else {
        if (bTitle) bTitle.innerHTML = "🌐 Comparativo Multi-Norma";
        if (bDesc) bDesc.innerHTML = "• NBR 6118 vs ACI 318-22 vs Eurocode 2 • Análise paralela dos fatores de segurança, resistências e taxas de trabalho";
    }

    // 6. Presets dropdown
    const secPreset = document.getElementById('section-preset-wrapper');
    const colPreset = document.getElementById('column-preset-wrapper');
    if (secPreset) {
        secPreset.classList.remove('hidden');
        secPreset.classList.add('flex');
    }
    if (colPreset) {
        colPreset.classList.remove('hidden');
        colPreset.classList.add('flex');
    }

    // 7. Trigger responsive redraws
    setTimeout(() => {
        if (typeof renderCrossSection === 'function') renderCrossSection();
        const c3d = document.getElementById('chart3d');
        if (typeof Plotly !== 'undefined' && c3d && c3d.data) {
            try {
                Plotly.Plots.resize('chart3d');
            } catch (e) {
                console.warn("Plotly resize error:", e);
            }
        }
    }, 80);
}

function setPcalcMode(mode) {
    window.pcalcState.mode = mode;
    if (mode === 'section' || mode === 'beam') {
        pcalcData.secao.length = 0;
        const lenEl = document.getElementById('length');
        if (lenEl) lenEl.value = 0;
    }
    pcalcData.secao.isSectionMode = (pcalcData.secao.length <= 0);
    updatePcalcUI();
}

function setPcalcStandard(std) {
    window.pcalcState.standard = std;
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
    updatePcalcUI();
}

function triggerPcalcCalculation() {
    performCalculation();
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
    },
    'pilar_l_40x60': {
        name: 'Pilar em L 40x60 cm (Malha)',
        tipoSecao: 'L',
        bf: 40, h: 60, tf: 15, tw: 15, length: 350, fck: 30, boundary: 'pinned',
        barras: [
            { x: 4.0, y: 4.0, diametro: 16 },
            { x: 20.0, y: 4.0, diametro: 16 },
            { x: 36.0, y: 4.0, diametro: 16 },
            { x: 36.0, y: 11.0, diametro: 16 },
            { x: 11.0, y: 11.0, diametro: 16 },
            { x: 11.0, y: 35.0, diametro: 16 },
            { x: 11.0, y: 56.0, diametro: 16 },
            { x: 4.0, y: 56.0, diametro: 16 },
            { x: 4.0, y: 35.0, diametro: 16 }
        ],
        esforcos: [{ n: -850, mxTop: 45, mxBot: 45, myTop: 35, myBot: 35 }]
    },
    'pilar_t_50x60': {
        name: 'Pilar em T 50x60 cm (Malha)',
        tipoSecao: 'T',
        bf: 50, h: 60, tf: 12, bw: 20, length: 350, fck: 30, boundary: 'pinned',
        barras: [
            { x: 4.0, y: 56.0, diametro: 16 },
            { x: 25.0, y: 56.0, diametro: 16 },
            { x: 46.0, y: 56.0, diametro: 16 },
            { x: 4.0, y: 49.0, diametro: 16 },
            { x: 46.0, y: 49.0, diametro: 16 },
            { x: 19.0, y: 25.0, diametro: 16 },
            { x: 31.0, y: 25.0, diametro: 16 },
            { x: 19.0, y: 4.0, diametro: 16 },
            { x: 31.0, y: 4.0, diametro: 16 }
        ],
        esforcos: [{ n: -950, mxTop: 60, mxBot: 60, myTop: 20, myBot: 20 }]
    },
    'caixao_50x70': {
        name: 'Pilar Caixão 50x70 cm (Vazada)',
        tipoSecao: 'Vazada',
        b: 50, h: 70, twx: 10, twy: 10, length: 400, fck: 35, boundary: 'pinned',
        barras: [
            { x: 5.0, y: 5.0, diametro: 16 },
            { x: 25.0, y: 5.0, diametro: 16 },
            { x: 45.0, y: 5.0, diametro: 16 },
            { x: 5.0, y: 35.0, diametro: 16 },
            { x: 45.0, y: 35.0, diametro: 16 },
            { x: 5.0, y: 65.0, diametro: 16 },
            { x: 25.0, y: 65.0, diametro: 16 },
            { x: 45.0, y: 65.0, diametro: 16 }
        ],
        esforcos: [{ n: -1800, mxTop: 110, mxBot: 110, myTop: 70, myBot: 70, vx: 45, vy: 75 }]
    },
    'viga_convencional_20x50': {
        name: 'Viga Convencional 20x50 cm',
        tipoSecao: 'Retangular',
        hx: 20, hy: 50, length: 0, fck: 30, boundary: 'fixed_fixed',
        barras: [
            { x: 3.5, y: 4.0, diametro: 16 },
            { x: 10.0, y: 4.0, diametro: 16 },
            { x: 16.5, y: 4.0, diametro: 16 },
            { x: 3.5, y: 46.0, diametro: 12.5 },
            { x: 16.5, y: 46.0, diametro: 12.5 }
        ],
        esforcos: [{ n: 0, mxTop: 120, mxBot: 120, myTop: 0, myBot: 0, vx: 0, vy: 95 }]
    },
    'viga_baldrame_25x60': {
        name: 'Viga Baldrame 25x60 cm',
        tipoSecao: 'Retangular',
        hx: 25, hy: 60, length: 0, fck: 30, boundary: 'fixed_fixed',
        barras: [
            { x: 4.0, y: 4.5, diametro: 20 },
            { x: 12.5, y: 4.5, diametro: 20 },
            { x: 21.0, y: 4.5, diametro: 20 },
            { x: 4.0, y: 30.0, diametro: 10 },
            { x: 21.0, y: 30.0, diametro: 10 },
            { x: 4.0, y: 55.5, diametro: 16 },
            { x: 21.0, y: 55.5, diametro: 16 }
        ],
        esforcos: [{ n: -100, mxTop: 180, mxBot: 180, myTop: 0, myBot: 0, vx: 0, vy: 140 }]
    },
    'viga_tirante_25x50': {
        name: 'Tirante / Tração-Flexão 25x50 cm',
        tipoSecao: 'Retangular',
        hx: 25, hy: 50, length: 0, fck: 35, boundary: 'fixed_fixed',
        barras: [
            { x: 4.0, y: 4.0, diametro: 20 },
            { x: 21.0, y: 4.0, diametro: 20 },
            { x: 4.0, y: 46.0, diametro: 20 },
            { x: 21.0, y: 46.0, diametro: 20 }
        ],
        esforcos: [{ n: 350, mxTop: 45, mxBot: 45, myTop: 0, myBot: 0, vx: 0, vy: 60 }]
    },
    'viga_transicao_35x90': {
        name: 'Viga de Transição 35x90 cm',
        tipoSecao: 'Retangular',
        hx: 35, hy: 90, length: 0, fck: 40, boundary: 'fixed_fixed',
        barras: [
            { x: 4.5, y: 5.0, diametro: 25 },
            { x: 11.5, y: 5.0, diametro: 25 },
            { x: 17.5, y: 5.0, diametro: 25 },
            { x: 23.5, y: 5.0, diametro: 25 },
            { x: 30.5, y: 5.0, diametro: 25 },
            { x: 4.5, y: 30.0, diametro: 12.5 },
            { x: 30.5, y: 30.0, diametro: 12.5 },
            { x: 4.5, y: 60.0, diametro: 12.5 },
            { x: 30.5, y: 60.0, diametro: 12.5 },
            { x: 4.5, y: 85.0, diametro: 16 },
            { x: 30.5, y: 85.0, diametro: 16 }
        ],
        esforcos: [{ n: -450, mxTop: 550, mxBot: 550, myTop: 0, myBot: 0, vx: 0, vy: 380 }]
    },
    'viga_t_50x60': {
        name: 'Viga T 50x60 cm',
        tipoSecao: 'T',
        bf: 50, h: 60, tf: 12, bw: 20, length: 0, fck: 30, boundary: 'fixed_fixed',
        barras: [
            { x: 4.0, y: 56.0, diametro: 16 },
            { x: 25.0, y: 56.0, diametro: 16 },
            { x: 46.0, y: 56.0, diametro: 16 },
            { x: 19.0, y: 4.0, diametro: 20 },
            { x: 31.0, y: 4.0, diametro: 20 }
        ],
        esforcos: [{ n: 0, mxTop: 220, mxBot: 220, myTop: 0, myBot: 0, vx: 0, vy: 160 }]
    }
};

function loadColumnPreset(key) {
    const p = COLUMN_PRESETS[key];
    if (!p) return;

    const isSection = (p.length <= 0);
    pcalcData.secao.isSectionMode = isSection;

    pcalcData.secao.tipoSecao = p.tipoSecao;
    pcalcData.secao.length = p.length;
    pcalcData.secao.boundary = p.boundary || (isSection ? 'fixed_fixed' : 'pinned');
    pcalcData.materiais.fck = p.fck;

    // Update DOM inputs
    const secTypeEl = document.getElementById('section-type');
    if (secTypeEl) secTypeEl.value = p.tipoSecao;

    if (p.tipoSecao === 'Retangular' || p.tipoSecao === 'Circular') {
        const hxEl = document.getElementById('hx');
        if (hxEl) hxEl.value = p.hx;
        const hyEl = document.getElementById('hy');
        if (hyEl) hyEl.value = p.hy;
    } else if (p.tipoSecao === 'L') {
        if (document.getElementById('L-bf')) document.getElementById('L-bf').value = p.bf;
        if (document.getElementById('L-h')) document.getElementById('L-h').value = p.h;
        if (document.getElementById('L-tf')) document.getElementById('L-tf').value = p.tf;
        if (document.getElementById('L-tw')) document.getElementById('L-tw').value = p.tw;
    } else if (p.tipoSecao === 'T') {
        if (document.getElementById('T-bf')) document.getElementById('T-bf').value = p.bf;
        if (document.getElementById('T-h')) document.getElementById('T-h').value = p.h;
        if (document.getElementById('T-tf')) document.getElementById('T-tf').value = p.tf;
        if (document.getElementById('T-bw')) document.getElementById('T-bw').value = p.bw;
    } else if (p.tipoSecao === 'Vazada') {
        if (document.getElementById('box-b')) document.getElementById('box-b').value = p.b;
        if (document.getElementById('box-h')) document.getElementById('box-h').value = p.h;
        if (document.getElementById('box-twx')) document.getElementById('box-twx').value = p.twx;
        if (document.getElementById('box-twy')) document.getElementById('box-twy').value = p.twy;
    }

    const lenEl = document.getElementById('length');
    if (lenEl) lenEl.value = p.length;
    const fckEl = document.getElementById('fck');
    if (fckEl) fckEl.value = p.fck;
    const bndEl = document.getElementById('boundary-type');
    if (bndEl) bndEl.value = p.boundary || (isSection ? 'fixed_fixed' : 'pinned');

    pcalcData.armacao.barras = JSON.parse(JSON.stringify(p.barras));
    pcalcData.esforcos.listaEsforcos = JSON.parse(JSON.stringify(p.esforcos));

    updateSectionTypeUI();
    updateDataFromInputs();
    updatePcalcUI();
    renderReinforcement();
    renderLoads();
    if (typeof fitViewToSection === 'function') fitViewToSection();
    renderCrossSection();
    triggerPcalcCalculation();
}

// =========================================================================
// RS2-STYLE POPUP MODAL ARCHITECTURE FOR PCALC
// =========================================================================

function syncModalInputsFromData() {
    if (document.getElementById('fck') && pcalcData.materiais.fck) document.getElementById('fck').value = pcalcData.materiais.fck;
    if (document.getElementById('fyk') && pcalcData.materiais.fyk) document.getElementById('fyk').value = pcalcData.materiais.fyk;
    if (document.getElementById('es') && pcalcData.materiais.es) document.getElementById('es').value = pcalcData.materiais.es;
    if (document.getElementById('gamac') && pcalcData.config.gamaC) document.getElementById('gamac').value = pcalcData.config.gamaC;
    if (document.getElementById('gamas') && pcalcData.config.gamaS) document.getElementById('gamas').value = pcalcData.config.gamaS;
    if (document.getElementById('gamaf') && pcalcData.config.gamaF) document.getElementById('gamaf').value = pcalcData.config.gamaF;
    if (document.getElementById('hx') && pcalcData.secao.hx) document.getElementById('hx').value = pcalcData.secao.hx;
    if (document.getElementById('hy') && pcalcData.secao.hy) document.getElementById('hy').value = pcalcData.secao.hy;
    if (document.getElementById('length') && pcalcData.secao.length !== undefined) document.getElementById('length').value = pcalcData.secao.length;
    if (document.getElementById('section-type') && pcalcData.secao.tipoSecao) document.getElementById('section-type').value = pcalcData.secao.tipoSecao;
    if (document.getElementById('boundary-type') && pcalcData.secao.boundary) document.getElementById('boundary-type').value = pcalcData.secao.boundary;
    if (document.getElementById('check-2nd-order')) document.getElementById('check-2nd-order').checked = pcalcData.config.calc2ndOrder !== false;
    if (document.getElementById('check-min-moment')) document.getElementById('check-min-moment').checked = pcalcData.config.checkMinMoment !== false;
    if (document.getElementById('check-slenderness')) document.getElementById('check-slenderness').checked = pcalcData.config.checkSlenderness !== false;
    if (document.getElementById('check-creep')) document.getElementById('check-creep').checked = pcalcData.config.considerCreep === true;
    if (document.getElementById('creep-phi') && pcalcData.config.creepPhi !== undefined) document.getElementById('creep-phi').value = pcalcData.config.creepPhi;
    if (document.getElementById('rate-min') && pcalcData.config.minRate !== undefined) document.getElementById('rate-min').value = pcalcData.config.minRate;
    if (document.getElementById('rate-max') && pcalcData.config.maxRate !== undefined) document.getElementById('rate-max').value = pcalcData.config.maxRate;
    if (document.getElementById('check-cracking-envelope')) document.getElementById('check-cracking-envelope').checked = pcalcData.config.enableCrackingEnvelope !== false;
    if (document.getElementById('cracking-wlim') && pcalcData.config.wLim) document.getElementById('cracking-wlim').value = pcalcData.config.wLim;
    if (document.getElementById('cracking-gamma-serv') && pcalcData.config.gammaFServ) document.getElementById('cracking-gamma-serv').value = pcalcData.config.gammaFServ;
    if (document.getElementById('stirrup-diam') && pcalcData.armacao.estribo?.diametro) document.getElementById('stirrup-diam').value = pcalcData.armacao.estribo.diametro;
    if (document.getElementById('stirrup-spacing') && pcalcData.armacao.estribo?.espacamento) document.getElementById('stirrup-spacing').value = pcalcData.armacao.estribo.espacamento;
}

function openPcalcModal(tabKey = 'geometry') {
    const modal = document.getElementById('pcalc-inputs-modal');
    if (!modal) return;
    syncModalInputsFromData();
    modal.classList.remove('hidden');
    switchPcalcModalTab(tabKey);
}

function saveAndApplyPcalcModal(showNotification = true) {
    updateDataFromInputs();
    updateSectionTypeUI();
    renderReinforcement();
    renderLoads();
    updatePcalcUI();
    updateRS2LiveSummaries();
    updateSectionStats();
    if (typeof fitViewToSection === 'function') fitViewToSection();
    renderCrossSection();

    const modal = document.getElementById('pcalc-inputs-modal');
    if (modal) modal.classList.add('hidden');

    // Executa recálculo e atualiza toda a aba da direita instantaneamente!
    if (typeof performCalculation === 'function') {
        performCalculation();
    }

    if (showNotification) {
        showToast('Propriedades atualizadas e recalculadas com sucesso!', 'success');
    }
}

function closePcalcModal() {
    // Ao sair do modal (Fechar, ✕, Esc, backdrop), sempre sincroniza, salva e recalcula a aba da direita!
    saveAndApplyPcalcModal(false);
}

function switchPcalcModalTab(tabKey) {
    const tabs = ['geometry', 'materials', 'reinforcement', 'loads', 'criteria'];
    tabs.forEach(t => {
        const btn = document.getElementById(`modal-tab-btn-${t}`);
        const panel = document.getElementById(`modal-panel-${t}`);
        if (panel) {
            if (t === tabKey) {
                panel.classList.remove('hidden');
            } else {
                panel.classList.add('hidden');
            }
        }
        if (btn) {
            if (t === tabKey) {
                btn.className = "py-1 px-2.5 rounded-md bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs cursor-pointer flex items-center gap-1 transition-all";
            } else {
                btn.className = "py-1 px-2.5 rounded-md text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white cursor-pointer flex items-center gap-1 transition-all font-semibold";
            }
        }
    });

    const titles = {
        geometry: { icon: '📐', title: 'Geometria & Vínculos do Pilar', subtitle: 'Dimensões da seção transversal (retangular/circular), vínculos de contorno e efeitos de 2ª ordem' },
        materials: { icon: '🧱', title: 'Materiais & Coeficientes de Ponderação', subtitle: 'Propriedades constitutivas do concreto (fck) e do aço (fyk, Es), além dos coeficientes γc, γs, γf' },
        reinforcement: { icon: '🔩', title: 'Armadura Longitudinal do Pilar', subtitle: 'Disposição detalhada de barras, armadura rápida paramétrica e taxas geométricas de aço' },
        loads: { icon: '⚖️', title: 'Esforços Característicos (Sk)', subtitle: 'Casos de carregamento com força normal e momentos fletores (Mx, My)' },
        criteria: { icon: '⚙️', title: 'Critérios Normativos & Efeitos de 2ª Ordem', subtitle: 'Métodos de verificação (NBR 6118, ACI 318, EC2), momentos mínimos e esbeltez limite' }
    };
    const info = titles[tabKey] || titles.geometry;
    const iconEl = document.getElementById('modal-header-icon');
    const titleEl = document.getElementById('modal-header-title');
    const subtitleEl = document.getElementById('modal-header-subtitle');
    if (iconEl) iconEl.innerText = info.icon;
    if (titleEl) titleEl.innerText = info.title;
    if (subtitleEl) subtitleEl.innerText = info.subtitle;

    if (typeof updateSectionTypeUI === 'function') updateSectionTypeUI();
}

function saveAndCalculatePcalcModal() {
    saveAndApplyPcalcModal(true);
}

function showToast(message, type = 'info') {
    let container = document.getElementById('pcalc-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pcalc-toast-container';
        container.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColors = {
        success: 'bg-emerald-600 text-white border-emerald-700 shadow-emerald-500/20',
        error: 'bg-rose-600 text-white border-rose-700 shadow-rose-500/20',
        info: 'bg-indigo-600 text-white border-indigo-700 shadow-indigo-500/20',
        warning: 'bg-amber-600 text-white border-amber-700 shadow-amber-500/20'
    };
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
        warning: '⚠'
    };

    toast.className = `flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold border pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `<span class="text-sm font-bold">${icons[type] || 'ℹ'}</span> <span>${message}</span>`;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    });

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3500);
}

// Modal Backdrop, Escape & Length Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('pcalc-inputs-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'pcalc-inputs-modal') {
            closePcalcModal();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('pcalc-inputs-modal');
            if (modal && !modal.classList.contains('hidden')) {
                closePcalcModal();
            }
        }
    });

    // Listener para Comprimento L: Se for 0, atualiza para seção única imediatamente
    const lenInput = document.getElementById('length');
    if (lenInput) {
        const onLenChange = () => {
            const raw = parseFloat(lenInput.value);
            const isSec = (!isNaN(raw) && raw <= 0);
            pcalcData.secao.isSectionMode = isSec;
            pcalcData.secao.length = isNaN(raw) ? 0 : Math.max(0, raw);
            renderLoads();
            updateRS2LiveSummaries();
            updateSectionStats();
        };
        lenInput.addEventListener('input', onLenChange);
        lenInput.addEventListener('change', onLenChange);
    }
});

window.openPcalcModal = openPcalcModal;
window.closePcalcModal = closePcalcModal;
window.switchPcalcModalTab = switchPcalcModalTab;
window.saveAndApplyPcalcModal = saveAndApplyPcalcModal;
window.saveAndCalculatePcalcModal = saveAndCalculatePcalcModal;
window.showToast = showToast;
window.loadColumnPreset = loadColumnPreset;
window.applyQuickRebar = applyQuickRebar;
window.setUnits = setUnits;
window.setPcalcChartMode = setPcalcChartMode;
window.renderShearCard = renderShearCard;
window.renderInteractionChart = renderInteractionChart;
window.performCalculation = performCalculation;
window.setPcalcMode = setPcalcMode;
window.setPcalcStandard = setPcalcStandard;
window.triggerPcalcCalculation = triggerPcalcCalculation;