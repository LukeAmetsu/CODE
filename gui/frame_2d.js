/**
 * 2D Frame & Truss Structural Analysis Engine ("Ftool Web")
 * Interactive Canvas, Direct Stiffness Method, Internal Force Diagrams & Deformed Shape
 */

let frameModel = {
    nodes: [],
    members: [],
    node_loads: [],
    member_loads: []
};

let analysisResult = null;
let currentDisplayMode = 'model'; // 'model', 'moment', 'shear', 'axial', 'deflected'
let activeDataTab = 'nodes';

// Canvas Pan & Zoom state
let canvasPanX = 0;
let canvasPanY = 0;
let canvasZoom = 1.0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

document.addEventListener('DOMContentLoaded', () => {
    initCanvasEvents();
    loadFramePreset('portal');
});

// -------------------------------------------------------------
// Presets
// -------------------------------------------------------------
function loadFramePreset(presetKey) {
    if (presetKey === 'portal') {
        frameModel = {
            nodes: [
                { id: 0, x: 0.0, y: 0.0, support: 'fixed', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 1, x: 0.0, y: 4.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 2, x: 6.0, y: 4.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 3, x: 6.0, y: 0.0, support: 'pinned', k_x: 0, k_y: 0, k_rot: 0 }
            ],
            members: [
                { id: 0, node_i: 0, node_j: 1, E: 200.0, A: 60.0, I: 12000.0, hinge_i: false, hinge_j: false },
                { id: 1, node_i: 1, node_j: 2, E: 200.0, A: 60.0, I: 12000.0, hinge_i: false, hinge_j: false },
                { id: 2, node_i: 3, node_j: 2, E: 200.0, A: 60.0, I: 12000.0, hinge_i: false, hinge_j: false }
            ],
            node_loads: [
                { node_id: 1, F_x: 20.0, F_y: 0.0, M_z: 0.0 }
            ],
            member_loads: [
                { member_id: 1, q_y: -25.0, q_x: 0.0 }
            ]
        };
    } else if (presetKey === 'continuous_beam') {
        frameModel = {
            nodes: [
                { id: 0, x: 0.0, y: 0.0, support: 'pinned', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 1, x: 5.0, y: 0.0, support: 'roller_y', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 2, x: 11.0, y: 0.0, support: 'roller_y', k_x: 0, k_y: 0, k_rot: 0 }
            ],
            members: [
                { id: 0, node_i: 0, node_j: 1, E: 30.0, A: 1200.0, I: 900000.0, hinge_i: false, hinge_j: false },
                { id: 1, node_i: 1, node_j: 2, E: 30.0, A: 1200.0, I: 900000.0, hinge_i: false, hinge_j: false }
            ],
            node_loads: [
                { node_id: 1, F_x: 0.0, F_y: -40.0, M_z: 0.0 }
            ],
            member_loads: [
                { member_id: 0, q_y: -20.0, q_x: 0.0 },
                { member_id: 1, q_y: -30.0, q_x: 0.0 }
            ]
        };
    } else if (presetKey === 'gerber') {
        frameModel = {
            nodes: [
                { id: 0, x: 0.0, y: 0.0, support: 'fixed', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 1, x: 0.0, y: 4.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 2, x: 4.0, y: 4.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 3, x: 8.0, y: 4.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 4, x: 8.0, y: 0.0, support: 'pinned', k_x: 0, k_y: 0, k_rot: 0 }
            ],
            members: [
                { id: 0, node_i: 0, node_j: 1, E: 200.0, A: 80.0, I: 20000.0, hinge_i: false, hinge_j: false },
                { id: 1, node_i: 1, node_j: 2, E: 200.0, A: 80.0, I: 20000.0, hinge_i: false, hinge_j: true }, // hinge at j
                { id: 2, node_i: 2, node_j: 3, E: 200.0, A: 80.0, I: 20000.0, hinge_i: false, hinge_j: false },
                { id: 3, node_i: 4, node_j: 3, E: 200.0, A: 80.0, I: 20000.0, hinge_i: false, hinge_j: false }
            ],
            node_loads: [],
            member_loads: [
                { member_id: 1, q_y: -20.0, q_x: 0.0 },
                { member_id: 2, q_y: -20.0, q_x: 0.0 }
            ]
        };
    } else if (presetKey === 'truss') {
        frameModel = {
            nodes: [
                { id: 0, x: 0.0, y: 0.0, support: 'pinned', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 1, x: 3.0, y: 0.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 2, x: 6.0, y: 0.0, support: 'roller_y', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 3, x: 1.5, y: 2.5, support: 'free', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 4, x: 4.5, y: 2.5, support: 'free', k_x: 0, k_y: 0, k_rot: 0 }
            ],
            members: [
                // Bottom chord
                { id: 0, node_i: 0, node_j: 1, E: 200.0, A: 25.0, I: 100.0, hinge_i: true, hinge_j: true },
                { id: 1, node_i: 1, node_j: 2, E: 200.0, A: 25.0, I: 100.0, hinge_i: true, hinge_j: true },
                // Top chord
                { id: 2, node_i: 3, node_j: 4, E: 200.0, A: 25.0, I: 100.0, hinge_i: true, hinge_j: true },
                // Diagonals & Verticals
                { id: 3, node_i: 0, node_j: 3, E: 200.0, A: 20.0, I: 100.0, hinge_i: true, hinge_j: true },
                { id: 4, node_i: 1, node_j: 3, E: 200.0, A: 20.0, I: 100.0, hinge_i: true, hinge_j: true },
                { id: 5, node_i: 1, node_j: 4, E: 200.0, A: 20.0, I: 100.0, hinge_i: true, hinge_j: true },
                { id: 6, node_i: 2, node_j: 4, E: 200.0, A: 20.0, I: 100.0, hinge_i: true, hinge_j: true }
            ],
            node_loads: [
                { node_id: 1, F_x: 0.0, F_y: -50.0, M_z: 0.0 },
                { node_id: 3, F_x: 15.0, F_y: 0.0, M_z: 0.0 }
            ],
            member_loads: []
        };
    } else if (presetKey === 'retaining_wall') {
        frameModel = {
            nodes: [
                { id: 0, x: 0.0, y: 0.0, support: 'fixed', k_x: 0, k_y: 0, k_rot: 0 },
                { id: 1, x: 0.0, y: 4.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 }
            ],
            members: [
                { id: 0, node_i: 0, node_j: 1, E: 30.0, A: 3000.0, I: 225000.0, hinge_i: false, hinge_j: false }
            ],
            node_loads: [],
            member_loads: [
                {
                    member_id: 0,
                    type: 'trapezoidal',
                    coord_sys: 'global',
                    description: 'Empuxo Solo (γ=18, K=0.33, H=4m)',
                    QX_i: 23.8,  // Na base: q_base = 0.33*18*4 = 23.8 kN/m (empurrando p/ direita)
                    QX_j: 0.0,   // No topo: q_topo = 0
                    QY_i: 0.0,
                    QY_j: 0.0,
                    q_x: 0.0,
                    q_y: 0.0
                }
            ]
        };
    }

    renderModelTables();
    updateTypicalLoadsMemberSelect();
    resetCanvasView();
    solveModel();
}

// -------------------------------------------------------------
// Solver Invocation
// -------------------------------------------------------------
async function solveModel() {
    try {
        readTablesToModel();
        if (window.eel && eel.solve_2d_frame) {
            const res = await eel.solve_2d_frame(frameModel)();
            if (res && res.status === 'success') {
                // Defensive normalization of displacements and reactions
                if (res.displacements && !Array.isArray(res.displacements)) {
                    res.displacements = Object.entries(res.displacements).map(([k, v]) => ({
                        node_id: isNaN(k) ? k : parseInt(k),
                        u_x: v.u_x ?? v.ux ?? 0,
                        u_y: v.u_y ?? v.uy ?? 0,
                        rot_z: v.rot_z ?? v.rz ?? 0,
                        ...v
                    }));
                }
                if (res.reactions && !Array.isArray(res.reactions)) {
                    res.reactions = Object.entries(res.reactions).map(([k, v]) => ({
                        node_id: isNaN(k) ? k : parseInt(k),
                        R_x: v.R_x ?? v.Rx ?? 0,
                        R_y: v.R_y ?? v.Ry ?? 0,
                        M_z: v.M_z ?? v.Mz ?? 0,
                        ...v
                    }));
                }
                analysisResult = res;
                updateSummaryBadges(res);
                redrawCanvas();
            } else if (res && res.error) {
                alert("Erro na análise do pórtico: " + res.error);
            }
        }
    } catch (err) {
        console.error("Erro resolvendo pórtico:", err);
    }
}

function updateSummaryBadges(res) {
    let maxDisp = 0.0;
    if (Array.isArray(res.displacements)) {
        res.displacements.forEach(d => {
            const ux = d.u_x ?? d.ux ?? 0;
            const uy = d.u_y ?? d.uy ?? 0;
            const mag = Math.sqrt(ux ** 2 + uy ** 2);
            if (mag > maxDisp) maxDisp = mag;
        });
    }

    let maxM = 0.0, maxV = 0.0, maxN = 0.0;
    if (Array.isArray(res.members)) {
        res.members.forEach(m => {
            const mM = m.M_max ?? m.max_M ?? 0;
            const mV = m.V_max ?? m.max_V ?? 0;
            const mN = m.N_axial ?? m.max_N ?? 0;
            if (Math.abs(mM) > Math.abs(maxM)) maxM = mM;
            if (Math.abs(mV) > Math.abs(maxV)) maxV = mV;
            if (Math.abs(mN) > Math.abs(maxN)) maxN = mN;
        });
    }

    const dmaxEl = document.getElementById('res-frame-dmax');
    const mmaxEl = document.getElementById('res-frame-mmax');
    const vmaxEl = document.getElementById('res-frame-vmax');
    const nmaxEl = document.getElementById('res-frame-nmax');
    const statEl = document.getElementById('res-frame-status');

    if (dmaxEl) dmaxEl.innerText = `${(maxDisp * 1000).toFixed(2)} mm`;
    if (mmaxEl) mmaxEl.innerText = `${maxM.toFixed(1)} kNm`;
    if (vmaxEl) vmaxEl.innerText = `${maxV.toFixed(1)} kN`;
    if (nmaxEl) nmaxEl.innerText = `${maxN.toFixed(1)} kN`;
    if (statEl) statEl.innerText = 'Equilíbrio OK (Det. > 0)';

    // Reactions Strip
    const reacContainer = document.getElementById('reactions-summary-container');
    const reacBadges = document.getElementById('reactions-badges');
    if (reacContainer && reacBadges && Array.isArray(res.reactions) && res.reactions.length > 0) {
        reacContainer.classList.remove('hidden');
        reacBadges.innerHTML = '';
        let sumRx = 0, sumRy = 0;
        res.reactions.forEach(r => {
            const rx = r.R_x ?? r.Rx ?? 0;
            const ry = r.R_y ?? r.Ry ?? 0;
            const mz = r.M_z ?? r.Mz ?? 0;
            sumRx += rx;
            sumRy += ry;

            const badge = document.createElement('div');
            badge.className = 'bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 px-2.5 py-1 rounded text-[11px] font-mono flex items-center gap-2';
            badge.innerHTML = `<span class="font-bold text-indigo-600 dark:text-indigo-400">Nó ${r.node_id}:</span> ` +
                `<span>Rx=<strong>${rx.toFixed(1)}</strong>kN</span> ` +
                `<span>Ry=<strong>${ry.toFixed(1)}</strong>kN</span> ` +
                (Math.abs(mz) > 0.01 ? `<span class="text-amber-600 dark:text-amber-400">Mz=<strong>${mz.toFixed(1)}</strong>kNm</span>` : '');
            reacBadges.appendChild(badge);
        });

        const eqBadge = document.createElement('div');
        eqBadge.className = 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 rounded text-[11px] font-mono font-bold flex items-center gap-1.5';
        eqBadge.innerHTML = `<span>⚖️ ΣRx = ${sumRx.toFixed(1)} kN</span> | <span>ΣRy = ${sumRy.toFixed(1)} kN</span>`;
        reacBadges.appendChild(eqBadge);
    }
}

// -------------------------------------------------------------
// Display Mode Switcher
// -------------------------------------------------------------
function setDisplayMode(mode) {
    currentDisplayMode = mode;
    const modes = ['model', 'moment', 'shear', 'axial', 'deflected'];
    modes.forEach(m => {
        const btn = document.getElementById(`btn-mode-${m}`);
        if (btn) {
            if (m === mode) {
                btn.className = btn.className.replace(/bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200/, 'bg-indigo-600 text-white');
            } else {
                btn.className = btn.className.replace(/bg-indigo-600 text-white/, 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200');
            }
        }
    });
    redrawCanvas();
}

// -------------------------------------------------------------
// 2D Canvas Engine
// -------------------------------------------------------------
function initCanvasEvents() {
    const canvas = document.getElementById('frame-canvas');
    if (!canvas) return;

    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        dragStartX = (e.clientX - rect.left) * scaleX - canvasPanX;
        dragStartY = (e.clientY - rect.top) * scaleY - canvasPanY;
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            canvasPanX = (e.clientX - rect.left) * scaleX - dragStartX;
            canvasPanY = (e.clientY - rect.top) * scaleY - dragStartY;
            redrawCanvas();
        } else {
            handleCanvasHover(e);
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Get mouse position relative to canvas element
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);

        // World-space point currently under the cursor (before zoom)
        const worldX = (mouseX - canvasPanX) / canvasZoom;
        const worldY = -(mouseY - canvasPanY) / canvasZoom;

        // Apply zoom (smoothly around cursor without truncating scale)
        const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
        canvasZoom = Math.max(1.0, Math.min(canvasZoom * zoomFactor, 5000.0));

        // Re-pin the world point to the same screen position after zoom change
        // screenX = panX + worldX * zoom  =>  panX = screenX - worldX * zoom
        canvasPanX = mouseX - worldX * canvasZoom;
        canvasPanY = mouseY + worldY * canvasZoom;

        redrawCanvas();
    }, { passive: false });

    // Double click resets view to fit the structural frame
    canvas.addEventListener('dblclick', () => {
        resetCanvasView();
    });
}

function resetCanvasView() {
    const canvas = document.getElementById('frame-canvas');
    if (!canvas || frameModel.nodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    frameModel.nodes.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
    });

    const spanX = Math.max(1.0, maxX - minX);
    const spanY = Math.max(1.0, maxY - minY);
    const scaleX = (canvas.width * 0.70) / spanX;
    const scaleY = (canvas.height * 0.70) / spanY;
    canvasZoom = Math.min(scaleX, scaleY);

    const midX = (minX + maxX) / 2.0;
    const midY = (minY + maxY) / 2.0;

    canvasPanX = canvas.width / 2.0 - midX * canvasZoom;
    canvasPanY = canvas.height / 2.0 + midY * canvasZoom;

    redrawCanvas();
}

function worldToScreen(x, y) {
    return {
        px: canvasPanX + x * canvasZoom,
        py: canvasPanY - y * canvasZoom
    };
}

function screenToWorld(px, py) {
    return {
        x: (px - canvasPanX) / canvasZoom,
        y: -(py - canvasPanY) / canvasZoom
    };
}

function redrawCanvas() {
    const canvas = document.getElementById('frame-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // 1. Unified RS2 / CAD Slate Background & Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, width, height, true);
        EngCAD.drawGrid(ctx, width, height, { step: 30, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        drawCanvasGrid(ctx, width, height);
    }

    // Node lookup dictionary
    const nodeDict = {};
    frameModel.nodes.forEach(n => { nodeDict[n.id] = n; });

    // 1. Draw Members (Lines / Structural elements)
    frameModel.members.forEach(m => {
        const ni = nodeDict[m.node_i];
        const nj = nodeDict[m.node_j];
        if (!ni || !nj) return;

        const p1 = worldToScreen(ni.x, ni.y);
        const p2 = worldToScreen(nj.x, nj.y);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.stroke();

        // Hinges (releases)
        if (m.hinge_i) {
            const hx = p1.px + 0.15 * (p2.px - p1.px);
            const hy = p1.py + 0.15 * (p2.py - p1.py);
            drawHingeCircle(ctx, hx, hy);
        }
        if (m.hinge_j) {
            const hx = p2.px - 0.15 * (p2.px - p1.px);
            const hy = p2.py - 0.15 * (p2.py - p1.py);
            drawHingeCircle(ctx, hx, hy);
        }
    });

    // 2. Draw Diagrams / Deformed Shape if results exist
    if (analysisResult && analysisResult.members) {
        const userScale = parseFloat(document.getElementById('diagram-scale')?.value || 1.0);

        if (currentDisplayMode === 'moment') {
            drawMomentDiagram(ctx, nodeDict, userScale);
        } else if (currentDisplayMode === 'shear') {
            drawShearDiagram(ctx, nodeDict, userScale);
        } else if (currentDisplayMode === 'axial') {
            drawAxialDiagram(ctx, nodeDict, userScale);
        } else if (currentDisplayMode === 'deflected') {
            drawDeflectedShape(ctx, nodeDict, userScale);
        }
    }

    // 3. Draw Loads
    drawModelLoads(ctx, nodeDict);

    // 4. Draw Supports
    frameModel.nodes.forEach(n => {
        if (n.support && n.support !== 'free') {
            const pos = worldToScreen(n.x, n.y);
            drawSupportSymbol(ctx, pos.px, pos.py, n.support);
        }
    });

    // 5. Draw Support Reactions (if solved)
    if (analysisResult && analysisResult.reactions) {
        drawSupportReactions(ctx, nodeDict);
    }

    // 6. Draw Nodes (Dots & IDs)
    frameModel.nodes.forEach(n => {
        const p = worldToScreen(n.x, n.y);
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(p.px, p.py, 5, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(`N${n.id}`, p.px + 7, p.py - 7);
    });

    // 7. Floating CAD HUD (RS2 Standard)
    if (typeof EngCAD !== 'undefined' && canvas.parentElement) {
        let modeLabel = 'Geometria';
        if (currentDisplayMode === 'moment') modeLabel = 'Momento Fletor (M)';
        else if (currentDisplayMode === 'shear') modeLabel = 'Esforço Cortante (V)';
        else if (currentDisplayMode === 'axial') modeLabel = 'Força Normal (N)';
        else if (currentDisplayMode === 'deflected') modeLabel = 'Deformada Elástica';

        let maxDisp = '--';
        let maxM = '--';
        if (analysisResult?.summary) {
            maxDisp = analysisResult.summary.max_displacement_mm !== undefined ? `${analysisResult.summary.max_displacement_mm.toFixed(2)} mm` : '--';
            maxM = analysisResult.summary.max_moment_kNm !== undefined ? `${analysisResult.summary.max_moment_kNm.toFixed(1)} kN·m` : '--';
        }

        EngCAD.updateHUD(canvas.parentElement, 'Pórtico Plano 2D (MEF)', [
            { label: 'Modelo', value: `${frameModel.nodes.length} Nós • ${frameModel.members.length} Barras`, color: '#38bdf8' },
            { label: 'Modo Ativo', value: modeLabel, color: '#f59e0b' },
            { label: 'Deslocamento Máx', value: maxDisp, color: '#10b981' },
            { label: 'Momento Máx', value: maxM, color: '#c084fc' }
        ]);
    }
}

function drawCanvasGrid(ctx, w, h) {
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawGrid(ctx, w, h, { step: 30, majorEvery: 4 });
        return;
    }
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
}

function drawHingeCircle(ctx, px, py) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
}

function drawSupportSymbol(ctx, px, py, type) {
    ctx.strokeStyle = '#38bdf8';
    ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 2;

    if (type === 'fixed') {
        ctx.beginPath();
        ctx.moveTo(px - 14, py + 4);
        ctx.lineTo(px + 14, py + 4);
        ctx.stroke();
        for (let i = -12; i <= 12; i += 6) {
            ctx.beginPath();
            ctx.moveTo(px + i, py + 4);
            ctx.lineTo(px + i - 4, py + 12);
            ctx.stroke();
        }
    } else if (type === 'pinned') {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 10, py + 16);
        ctx.lineTo(px + 10, py + 16);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - 14, py + 16);
        ctx.lineTo(px + 14, py + 16);
        ctx.stroke();
    } else if (type === 'roller_y' || type === 'roller' || type === 'roller_dy') {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 10, py + 14);
        ctx.lineTo(px + 10, py + 14);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Rollers on horizontal ground
        ctx.beginPath();
        ctx.arc(px - 6, py + 18, 3, 0, 2 * Math.PI);
        ctx.arc(px + 6, py + 18, 3, 0, 2 * Math.PI);
        ctx.stroke();
    } else if (type === 'roller_x' || type === 'roller_dx' || type === 'roller_wall') {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 14, py - 10);
        ctx.lineTo(px - 14, py + 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Rollers on vertical wall
        ctx.beginPath();
        ctx.arc(px - 18, py - 6, 3, 0, 2 * Math.PI);
        ctx.arc(px - 18, py + 6, 3, 0, 2 * Math.PI);
        ctx.stroke();
    }
}

// -------------------------------------------------------------
// Diagrams: Brazilian Structural Tension Convention (M plotted on tension fiber)
// -------------------------------------------------------------
function drawMomentDiagram(ctx, nodeDict, scale) {
    const factor = 0.8 * scale;
    if (!analysisResult || !Array.isArray(analysisResult.members)) return;
    analysisResult.members.forEach(m => {
        const origMem = frameModel.members.find(om => om.id === (m.member_id ?? m.id));
        const node_i_id = m.node_i ?? origMem?.node_i;
        const node_j_id = m.node_j ?? origMem?.node_j;
        const ni = nodeDict[node_i_id];
        const nj = nodeDict[node_j_id];
        const M_vals = m.M_values ?? m.M;
        const x_pts = m.x_points ?? m.stations;
        if (!ni || !nj || !M_vals || !x_pts) return;

        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-4) return;
        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        // Normal unit vector perpendicular to member: (-sin, cos) points toward the positive local y (upper fiber)
        // Brazilian tension convention: Positive M produces tension on the bottom fiber (-y local).
        // Therefore, plot M on the tension fiber: offset = -M * factor
        ctx.fillStyle = 'rgba(99, 102, 241, 0.25)';
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2;

        ctx.beginPath();
        const pStart = worldToScreen(ni.x, ni.y);
        ctx.moveTo(pStart.px, pStart.py);

        const pts = [];
        for (let i = 0; i < x_pts.length; i++) {
            const xi = x_pts[i];
            const Mi = M_vals[i];
            // Plot on tension fiber:
            const offsetLocalY = -Mi * factor / 50.0;
            const wx = ni.x + xi * cos - offsetLocalY * sin;
            const wy = ni.y + xi * sin + offsetLocalY * cos;
            const sc = worldToScreen(wx, wy);
            pts.push(sc);
            ctx.lineTo(sc.px, sc.py);
        }

        const pEnd = worldToScreen(nj.x, nj.y);
        ctx.lineTo(pEnd.px, pEnd.py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Display Moment text labels at joints (i, j) and peak/midspan
        ctx.fillStyle = '#c7d2fe';
        ctx.font = 'bold 10px Inter, sans-serif';

        const Mi = M_vals[0];
        const Mj = M_vals[M_vals.length - 1];
        if (pts.length > 0 && Math.abs(Mi) > 0.5) {
            ctx.fillText(`${Mi.toFixed(1)} kNm`, pts[0].px, pts[0].py - 6);
        }
        if (pts.length > 1 && Math.abs(Mj) > 0.5) {
            const lastIdx = pts.length - 1;
            ctx.fillText(`${Mj.toFixed(1)} kNm`, pts[lastIdx].px, pts[lastIdx].py - 6);
        }

        // Peak / midspan moment
        const midIdx = Math.floor(pts.length / 2);
        const mM = m.M_max ?? m.max_M ?? 0;
        if (pts[midIdx] && Math.abs(mM) > 0.5 && Math.abs(mM - Mi) > 0.5 && Math.abs(mM - Mj) > 0.5) {
            ctx.fillText(`${mM.toFixed(1)} kNm`, pts[midIdx].px, pts[midIdx].py - 6);
        }
    });
}

function drawShearDiagram(ctx, nodeDict, scale) {
    const factor = 0.8 * scale;
    if (!analysisResult || !Array.isArray(analysisResult.members)) return;
    analysisResult.members.forEach(m => {
        const origMem = frameModel.members.find(om => om.id === (m.member_id ?? m.id));
        const node_i_id = m.node_i ?? origMem?.node_i;
        const node_j_id = m.node_j ?? origMem?.node_j;
        const ni = nodeDict[node_i_id];
        const nj = nodeDict[node_j_id];
        const V_vals = m.V_values ?? m.V;
        const x_pts = m.x_points ?? m.stations;
        if (!ni || !nj || !V_vals || !x_pts) return;

        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-4) return;
        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2;

        ctx.beginPath();
        const pStart = worldToScreen(ni.x, ni.y);
        ctx.moveTo(pStart.px, pStart.py);

        const pts = [];
        for (let i = 0; i < x_pts.length; i++) {
            const xi = x_pts[i];
            const Vi = V_vals[i];
            const offsetLocalY = Vi * factor / 40.0;
            const wx = ni.x + xi * cos - offsetLocalY * sin;
            const wy = ni.y + xi * sin + offsetLocalY * cos;
            const sc = worldToScreen(wx, wy);
            pts.push(sc);
            ctx.lineTo(sc.px, sc.py);
        }

        const pEnd = worldToScreen(nj.x, nj.y);
        ctx.lineTo(pEnd.px, pEnd.py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Shear labels at ends
        ctx.fillStyle = '#fde68a';
        ctx.font = 'bold 10px Inter, sans-serif';
        const Vi = V_vals[0];
        const Vj = V_vals[V_vals.length - 1];
        if (pts.length > 0 && Math.abs(Vi) > 0.5) {
            ctx.fillText(`${Vi.toFixed(1)} kN`, pts[0].px, pts[0].py - 6);
        }
        if (pts.length > 1 && Math.abs(Vj) > 0.5) {
            const lastIdx = pts.length - 1;
            ctx.fillText(`${Vj.toFixed(1)} kN`, pts[lastIdx].px, pts[lastIdx].py - 6);
        }
    });
}

function drawAxialDiagram(ctx, nodeDict, scale) {
    const factor = 0.8 * scale;
    if (!analysisResult || !Array.isArray(analysisResult.members)) return;
    analysisResult.members.forEach(m => {
        const origMem = frameModel.members.find(om => om.id === (m.member_id ?? m.id));
        const node_i_id = m.node_i ?? origMem?.node_i;
        const node_j_id = m.node_j ?? origMem?.node_j;
        const ni = nodeDict[node_i_id];
        const nj = nodeDict[node_j_id];
        if (!ni || !nj) return;

        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-4) return;
        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        const N = m.N_axial ?? m.N_values?.[0] ?? m.N?.[0] ?? m.max_N ?? 0;
        const isTension = N > 0;
        ctx.fillStyle = isTension ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)';
        ctx.strokeStyle = isTension ? '#34d399' : '#f87171';
        ctx.lineWidth = 2;

        const offsetLocalY = N * factor / 40.0;
        const p1 = worldToScreen(ni.x - offsetLocalY * sin, ni.y + offsetLocalY * cos);
        const p2 = worldToScreen(nj.x - offsetLocalY * sin, nj.y + offsetLocalY * cos);
        const pi = worldToScreen(ni.x, ni.y);
        const pj = worldToScreen(nj.x, nj.y);

        ctx.beginPath();
        ctx.moveTo(pi.px, pi.py);
        ctx.lineTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.lineTo(pj.px, pj.py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Center axial force text
        if (Math.abs(N) > 0.5) {
            ctx.fillStyle = isTension ? '#a7f3d0' : '#fca5a5';
            ctx.font = 'bold 10px Inter, sans-serif';
            const midX = (p1.px + p2.px) / 2;
            const midY = (p1.py + p2.py) / 2;
            ctx.fillText(`${N > 0 ? '+' : ''}${N.toFixed(1)} kN (${isTension ? 'Tração' : 'Comp.'})`, midX - 30, midY - 6);
        }
    });
}

function drawDeflectedShape(ctx, nodeDict, scale) {
    const defScale = 150.0 * scale; // Amplification factor for deflections
    const dispDict = {};
    if (Array.isArray(analysisResult?.displacements)) {
        analysisResult.displacements.forEach(d => { dispDict[d.node_id] = d; });
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);

    frameModel.members.forEach(m => {
        const origMem = analysisResult?.members?.find(rm => rm.member_id === m.id);
        const ni = nodeDict[m.node_i];
        const nj = nodeDict[m.node_j];
        if (!ni || !nj) return;

        const di = dispDict[m.node_i] || { u_x: 0, u_y: 0 };
        const dj = dispDict[m.node_j] || { u_x: 0, u_y: 0 };

        const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
        if (L < 1e-4) return;
        const cos = (nj.x - ni.x) / L;
        const sin = (nj.y - ni.y) / L;

        const defl_vals = origMem?.deflection_values ?? origMem?.deflection;
        const x_pts = origMem?.x_points ?? origMem?.stations;

        ctx.beginPath();
        if (Array.isArray(defl_vals) && Array.isArray(x_pts) && defl_vals.length === x_pts.length) {
            for (let i = 0; i < x_pts.length; i++) {
                const xi = x_pts[i];
                const vi = defl_vals[i];
                const t = xi / L;
                // Linear interpolation of node translation
                const ux_node = (di.u_x ?? di.ux ?? 0) * (1 - t) + (dj.u_x ?? dj.ux ?? 0) * t;
                const uy_node = (di.u_y ?? di.uy ?? 0) * (1 - t) + (dj.u_y ?? dj.uy ?? 0) * t;
                // Transverse local deflection vi in world coords (-sin, cos)
                const wx = ni.x + xi * cos + (ux_node - vi * sin) * defScale;
                const wy = ni.y + xi * sin + (uy_node + vi * cos) * defScale;
                const sc = worldToScreen(wx, wy);
                if (i === 0) ctx.moveTo(sc.px, sc.py);
                else ctx.lineTo(sc.px, sc.py);
            }
        } else {
            const p1 = worldToScreen(ni.x + (di.u_x ?? di.ux ?? 0) * defScale, ni.y + (di.u_y ?? di.uy ?? 0) * defScale);
            const p2 = worldToScreen(nj.x + (dj.u_x ?? dj.ux ?? 0) * defScale, nj.y + (dj.u_y ?? dj.uy ?? 0) * defScale);
            ctx.moveTo(p1.px, p1.py);
            ctx.lineTo(p2.px, p2.py);
        }
        ctx.stroke();
    });

    ctx.setLineDash([]);
}

function drawModelLoads(ctx, nodeDict) {
    // 1. Nodal loads
    frameModel.node_loads.forEach(nl => {
        const n = nodeDict[nl.node_id];
        if (!n) return;
        const p = worldToScreen(n.x, n.y);

        if (nl.F_x) {
            drawArrow(ctx, p.px - (nl.F_x > 0 ? 40 : -40), p.py, p.px, p.py, '#ef4444');
            ctx.fillStyle = '#fca5a5';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillText(`${nl.F_x} kN`, p.px - (nl.F_x > 0 ? 45 : -45), p.py - 6);
        }
        if (nl.F_y) {
            const isDown = nl.F_y < 0;
            drawArrow(ctx, p.px, isDown ? p.py - 40 : p.py + 40, p.px, p.py, '#ef4444');
            ctx.fillStyle = '#fca5a5';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillText(`${nl.F_y} kN`, p.px + 8, isDown ? p.py - 25 : p.py + 25);
        }
        if (nl.M_z) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const startAngle = nl.M_z > 0 ? 0 : Math.PI;
            const endAngle = nl.M_z > 0 ? 1.5 * Math.PI : -0.5 * Math.PI;
            ctx.arc(p.px, p.py, 16, startAngle, endAngle, nl.M_z < 0);
            ctx.stroke();
            ctx.fillStyle = '#fca5a5';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.fillText(`${nl.M_z} kNm`, p.px + 18, p.py - 12);
        }
    });

    // 2. Member distributed loads (Uniform, Trapezoidal, Soil/Hydro)
    frameModel.member_loads.forEach(ml => {
        const m = frameModel.members.find(x => x.id === ml.member_id);
        if (!m) return;
        const ni = nodeDict[m.node_i];
        const nj = nodeDict[m.node_j];
        if (!ni || !nj) return;

        const p1 = worldToScreen(ni.x, ni.y);
        const p2 = worldToScreen(nj.x, nj.y);

        const Lpx = Math.hypot(p2.px - p1.px, p2.py - p1.py);
        if (Lpx < 1) return;

        const isGlobal = ml.coord_sys === 'global';
        const isTrapezoid = ml.type === 'trapezoidal' || isGlobal || ml.qy_i !== undefined;

        let q_start = 0, q_end = 0;
        let dirX = 0, dirY = 0;

        if (isGlobal) {
            const QXi = ml.QX_i ?? ml.q_x ?? 0;
            const QXj = ml.QX_j ?? QXi;
            const QYi = ml.QY_i ?? ml.q_y ?? 0;
            const QYj = ml.QY_j ?? QYi;

            q_start = Math.hypot(QXi, QYi);
            q_end = Math.hypot(QXj, QYj);
            if (q_start < 1e-3 && q_end < 1e-3) return;

            const refQX = Math.abs(QXi) >= Math.abs(QXj) ? QXi : QXj;
            const refQY = Math.abs(QYi) >= Math.abs(QYj) ? QYi : QYj;
            const refMag = Math.hypot(refQX, refQY) || 1.0;
            dirX = refQX / refMag;
            dirY = -refQY / refMag; // Screen Y is inverted
        } else {
            if (isTrapezoid) {
                q_start = ml.qy_i ?? ml.q_y ?? 0;
                q_end = ml.qy_j ?? q_start;
            } else {
                q_start = ml.q_y ?? 0;
                q_end = q_start;
            }
            if (Math.abs(q_start) < 1e-3 && Math.abs(q_end) < 1e-3 && !ml.q_x) return;

            const dx = (p2.px - p1.px) / Lpx;
            const dy = (p2.py - p1.py) / Lpx;
            dirX = dy;
            dirY = -dx;
        }

        const maxQ = Math.max(Math.abs(q_start), Math.abs(q_end), 1.0);
        const maxArrowLen = 35;
        const numArrows = 6;

        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.lineWidth = 1.5;

        const tailPts = [];
        let uX = 0, uY = 0;

        for (let i = 0; i <= numArrows; i++) {
            const t = i / numArrows;
            const px = p1.px + t * (p2.px - p1.px);
            const py = p1.py + t * (p2.py - p1.py);

            let q_t = 0;
            let arrowLen = 0;

            if (isGlobal) {
                const QXi = ml.QX_i ?? ml.q_x ?? 0;
                const QXj = ml.QX_j ?? QXi;
                const QYi = ml.QY_i ?? ml.q_y ?? 0;
                const QYj = ml.QY_j ?? QYi;
                const curQX = QXi * (1 - t) + QXj * t;
                const curQY = QYi * (1 - t) + QYj * t;
                q_t = Math.hypot(curQX, curQY);
                arrowLen = (q_t / maxQ) * maxArrowLen;
                uX = dirX;
                uY = dirY;
            } else {
                q_t = q_start * (1 - t) + q_end * t;
                arrowLen = (Math.abs(q_t) / maxQ) * maxArrowLen;
                const sgn = q_t < 0 ? -1 : 1;
                uX = dirX * sgn;
                uY = dirY * sgn;
            }

            // (uX, uY) é o vetor unitário da força sobre a barra no espaço da tela.
            // A cauda fica no sentido oposto da força (ex: ACIMA da viga para carga vertical gravitacional)
            // e a ponta da seta atinge o eixo da viga apontando PARA BAIXO (sentido da força).
            const tailX = px - uX * arrowLen;
            const tailY = py - uY * arrowLen;
            tailPts.push({ tailX, tailY, px, py });

            if (arrowLen > 4) {
                drawArrow(ctx, tailX, tailY, px, py, '#ef4444');
            }
        }

        // Desenha apenas a linha limite das cargas distribuídas (SEM PREENCHIMENTO, estilo clássico Ftool)
        if (tailPts.length > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.moveTo(tailPts[0].tailX, tailPts[0].tailY);
            for (let i = 1; i < tailPts.length; i++) {
                ctx.lineTo(tailPts[i].tailX, tailPts[i].tailY);
            }
            ctx.stroke();
        }

        ctx.fillStyle = '#f87171';
        ctx.font = 'bold 10px Inter, sans-serif';

        const offY = uY > 0.2 ? -8 : (uY < -0.2 ? 14 : -6);
        const offX = Math.abs(uY) <= 0.2 ? (uX > 0 ? -15 : 15) : 0;
        ctx.textAlign = 'center';

        if (isTrapezoid || isGlobal) {
            const startStr = `${q_start.toFixed(1)} kN/m`;
            const endStr = `${q_end.toFixed(1)} kN/m`;
            if (tailPts[0] && Math.abs(q_start) > 0.05) {
                ctx.fillText(startStr, tailPts[0].tailX + offX, tailPts[0].tailY + offY);
            }
            if (tailPts[tailPts.length - 1] && Math.abs(q_end) > 0.05) {
                const last = tailPts[tailPts.length - 1];
                ctx.fillText(endStr, last.tailX + offX, last.tailY + offY);
            }
        } else {
            const mid = tailPts[Math.floor(tailPts.length / 2)];
            if (mid) {
                ctx.fillText(`q = ${q_start} kN/m`, mid.tailX + offX, mid.tailY + offY);
            }
        }
    });
}

function drawSupportReactions(ctx, nodeDict) {
    if (!analysisResult || !Array.isArray(analysisResult.reactions)) return;
    analysisResult.reactions.forEach(r => {
        const n = nodeDict[r.node_id];
        if (!n) return;
        const p = worldToScreen(n.x, n.y);
        const rx = r.R_x ?? r.Rx ?? 0;
        const ry = r.R_y ?? r.Ry ?? 0;

        if (Math.abs(rx) > 0.05) {
            ctx.fillStyle = '#34d399';
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText(`Rx=${rx.toFixed(1)} kN`, p.px - 35, p.py + 25);
        }
        if (Math.abs(ry) > 0.05) {
            ctx.fillStyle = '#34d399';
            ctx.font = '10px Inter, sans-serif';
            ctx.fillText(`Ry=${ry.toFixed(1)} kN`, p.px + 10, p.py + 25);
        }
    });
}

function drawArrow(ctx, fromx, fromy, tox, toy, color) {
    const headlen = 8;
    const angle = Math.atan2(toy - fromy, tox - fromx);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(fromx, fromy);
    ctx.lineTo(tox, toy);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(tox, toy);
    ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function handleCanvasHover(e) {
    const canvas = document.getElementById('frame-canvas');
    const tooltip = document.getElementById('canvas-tooltip');
    if (!canvas || !tooltip || !analysisResult) return;

    const rect = canvas.getBoundingClientRect();
    // CSS pixel position (for tooltip overlay positioning)
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    // Canvas-internal pixel position (for world-space distance check)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = cssX * scaleX;
    const my = cssY * scaleY;

    // Check distance to nodes
    let hoveredNode = null;
    frameModel.nodes.forEach(n => {
        const sc = worldToScreen(n.x, n.y);
        const dist = Math.hypot(sc.px - mx, sc.py - my);
        if (dist < 12 * scaleX) hoveredNode = n;
    });

    if (hoveredNode) {
        const disp = Array.isArray(analysisResult.displacements) 
            ? analysisResult.displacements.find(d => d.node_id === hoveredNode.id)
            : analysisResult.displacements?.[hoveredNode.id];
        const reac = Array.isArray(analysisResult.reactions) 
            ? analysisResult.reactions.find(r => r.node_id === hoveredNode.id)
            : analysisResult.reactions?.[hoveredNode.id];

        const ux = disp ? (disp.u_x ?? disp.ux ?? 0) : 0;
        const uy = disp ? (disp.u_y ?? disp.uy ?? 0) : 0;
        const rx = reac ? (reac.R_x ?? reac.Rx ?? 0) : null;
        const ry = reac ? (reac.R_y ?? reac.Ry ?? 0) : null;

        tooltip.innerHTML = `<strong>Nó ${hoveredNode.id}</strong> (${hoveredNode.x.toFixed(2)}, ${hoveredNode.y.toFixed(2)})m<br>` +
            (disp ? `ux: ${(ux * 1000).toFixed(2)}mm, uy: ${(uy * 1000).toFixed(2)}mm<br>` : '') +
            (reac ? `Rx: ${rx.toFixed(1)}kN, Ry: ${ry.toFixed(1)}kN` : '');
        tooltip.style.left = `${cssX + 15}px`;
        tooltip.style.top = `${cssY + 15}px`;
        tooltip.classList.remove('hidden');
        return;
    }

    tooltip.classList.add('hidden');
}

// -------------------------------------------------------------
// Model Table Management
// -------------------------------------------------------------
function switchDataTab(tab) {
    activeDataTab = tab;
    ['nodes', 'members', 'loads', 'typical'].forEach(t => {
        const panel = document.getElementById(`panel-${t}`);
        const btn = document.getElementById(`tab-${t}`);
        if (panel && btn) {
            if (t === tab) {
                panel.classList.remove('hidden');
                btn.className = 'font-bold text-xs text-indigo-600 border-b-2 border-indigo-600 pb-2 flex items-center gap-1';
            } else {
                panel.classList.add('hidden');
                btn.className = 'font-semibold text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 pb-2 flex items-center gap-1';
            }
        }
    });

    const addBtnContainer = document.getElementById('tab-actions-container');
    if (addBtnContainer) {
        if (tab === 'typical') {
            addBtnContainer.classList.add('hidden');
            updateTypicalLoadsMemberSelect();
            updateSoilPreview();
        } else {
            addBtnContainer.classList.remove('hidden');
        }
    }
}

function renderModelTables() {
    // 1. Nodes
    const tbodyNodes = document.getElementById('tbody-nodes');
    if (tbodyNodes) {
        tbodyNodes.innerHTML = '';
        frameModel.nodes.forEach((n, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-2 font-bold">${n.id}</td>
                <td class="p-2"><input type="number" step="0.1" value="${n.x}" class="node-x w-20 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2"><input type="number" step="0.1" value="${n.y}" class="node-y w-20 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2">
                    <select class="node-sup rounded border p-1 bg-white dark:bg-gray-700">
                        <option value="free" ${n.support === 'free' ? 'selected' : ''}>Livre</option>
                        <option value="pinned" ${n.support === 'pinned' ? 'selected' : ''}>Fixo (2º grau)</option>
                        <option value="roller_y" ${n.support === 'roller_y' ? 'selected' : ''}>Móvel Y (1º grau)</option>
                        <option value="fixed" ${n.support === 'fixed' ? 'selected' : ''}>Engastado</option>
                    </select>
                </td>
                <td class="p-2"><input type="number" step="10" value="${n.k_x || 0}" class="node-kx w-20 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2"><input type="number" step="10" value="${n.k_y || 0}" class="node-ky w-20 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2"><input type="number" step="10" value="${n.k_rot || 0}" class="node-krot w-20 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2 text-center"><button type="button" onclick="deleteNode(${idx})" class="text-rose-500 hover:text-rose-700">✕</button></td>
            `;
            tbodyNodes.appendChild(tr);
        });
        const cntNodes = document.getElementById('count-nodes');
        if (cntNodes) cntNodes.innerText = frameModel.nodes.length;
    }

    // 2. Members
    const tbodyMembers = document.getElementById('tbody-members');
    if (tbodyMembers) {
        tbodyMembers.innerHTML = '';
        frameModel.members.forEach((m, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-2 font-bold">${m.id}</td>
                <td class="p-2"><input type="number" value="${m.node_i}" class="mem-ni w-16 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2"><input type="number" value="${m.node_j}" class="mem-nj w-16 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2"><input type="number" step="10" value="${m.E}" class="mem-e w-20 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2"><input type="number" step="5" value="${m.A}" class="mem-a w-20 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2"><input type="number" step="100" value="${m.I}" class="mem-i w-24 rounded border p-1 bg-white dark:bg-gray-700"></td>
                <td class="p-2 text-center"><input type="checkbox" ${m.hinge_i ? 'checked' : ''} class="mem-hi"></td>
                <td class="p-2 text-center"><input type="checkbox" ${m.hinge_j ? 'checked' : ''} class="mem-hj"></td>
                <td class="p-2 text-center"><button type="button" onclick="deleteMember(${idx})" class="text-rose-500 hover:text-rose-700">✕</button></td>
            `;
            tbodyMembers.appendChild(tr);
        });
        const cntMembers = document.getElementById('count-members');
        if (cntMembers) cntMembers.innerText = frameModel.members.length;
    }

    // 3. Loads
    const tbodyLoads = document.getElementById('tbody-loads');
    if (tbodyLoads) {
        tbodyLoads.innerHTML = '';
        let loadCount = 0;
        frameModel.node_loads.forEach((nl, idx) => {
            loadCount++;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="p-2 font-semibold text-blue-600">Nodal</td>
                <td class="p-2">Nó <strong>${nl.node_id}</strong></td>
                <td class="p-2 font-mono text-xs">${nl.F_x ?? 0} kN</td>
                <td class="p-2 font-mono text-xs">${nl.F_y ?? 0} kN</td>
                <td class="p-2 font-mono text-xs">${nl.M_z ? `${nl.M_z} kNm` : '-'}</td>
                <td class="p-2 text-center"><button type="button" onclick="deleteNodeLoad(${idx})" class="text-rose-500 hover:text-rose-700">✕</button></td>
            `;
            tbodyLoads.appendChild(tr);
        });
        frameModel.member_loads.forEach((ml, idx) => {
            loadCount++;
            const tr = document.createElement('tr');
            const isTrap = ml.type === 'trapezoidal' || ml.coord_sys === 'global';
            const desc = ml.description || (isTrap ? 'Trapezoidal / Empuxo' : 'Distribuída');
            
            let valXStr = `${ml.q_x ?? 0} kN/m`;
            let valYStr = `${ml.q_y ?? 0} kN/m`;
            if (ml.coord_sys === 'global') {
                valXStr = `${ml.QX_i ?? 0} → ${ml.QX_j ?? 0} kN/m`;
                valYStr = `${ml.QY_i ?? 0} → ${ml.QY_j ?? 0} kN/m`;
            } else if (ml.type === 'trapezoidal') {
                valYStr = `${ml.qy_i ?? 0} → ${ml.qy_j ?? 0} kN/m`;
            }

            tr.innerHTML = `
                <td class="p-2 font-semibold ${isTrap ? 'text-amber-600' : 'text-emerald-600'}">${desc}</td>
                <td class="p-2">Barra <strong>${ml.member_id}</strong></td>
                <td class="p-2 font-mono text-xs">${valXStr}</td>
                <td class="p-2 font-mono text-xs">${valYStr}</td>
                <td class="p-2 text-gray-500 text-[11px]">${ml.coord_sys === 'global' ? 'Global' : 'Local'}</td>
                <td class="p-2 text-center"><button type="button" onclick="deleteMemberLoad(${idx})" class="text-rose-500 hover:text-rose-700">✕</button></td>
            `;
            tbodyLoads.appendChild(tr);
        });
        const cntLoads = document.getElementById('count-loads');
        if (cntLoads) cntLoads.innerText = loadCount;
    }
}

function readTablesToModel() {
    // Read Nodes
    const rowsNodes = document.querySelectorAll('#tbody-nodes tr');
    frameModel.nodes = [];
    rowsNodes.forEach((tr, idx) => {
        frameModel.nodes.push({
            id: idx,
            x: parseFloat(tr.querySelector('.node-x').value || 0),
            y: parseFloat(tr.querySelector('.node-y').value || 0),
            support: tr.querySelector('.node-sup').value,
            k_x: parseFloat(tr.querySelector('.node-kx').value || 0),
            k_y: parseFloat(tr.querySelector('.node-ky').value || 0),
            k_rot: parseFloat(tr.querySelector('.node-krot').value || 0)
        });
    });

    // Read Members
    const rowsMembers = document.querySelectorAll('#tbody-members tr');
    frameModel.members = [];
    rowsMembers.forEach((tr, idx) => {
        frameModel.members.push({
            id: idx,
            node_i: parseInt(tr.querySelector('.mem-ni').value || 0),
            node_j: parseInt(tr.querySelector('.mem-nj').value || 0),
            E: parseFloat(tr.querySelector('.mem-e').value || 200.0),
            A: parseFloat(tr.querySelector('.mem-a').value || 50.0),
            I: parseFloat(tr.querySelector('.mem-i').value || 10000.0),
            hinge_i: tr.querySelector('.mem-hi').checked,
            hinge_j: tr.querySelector('.mem-hj').checked
        });
    });
}

function addRowCurrentTab() {
    if (activeDataTab === 'nodes') {
        const nextId = frameModel.nodes.length;
        frameModel.nodes.push({ id: nextId, x: nextId * 2.0, y: 0.0, support: 'free', k_x: 0, k_y: 0, k_rot: 0 });
    } else if (activeDataTab === 'members') {
        const nextId = frameModel.members.length;
        frameModel.members.push({ id: nextId, node_i: 0, node_j: 1, E: 200.0, A: 60.0, I: 12000.0, hinge_i: false, hinge_j: false });
    } else if (activeDataTab === 'loads') {
        frameModel.node_loads.push({ node_id: 0, F_x: 0.0, F_y: -20.0, M_z: 0.0 });
    }
    renderModelTables();
    updateTypicalLoadsMemberSelect();
    redrawCanvas();
}

function addNodeLoadRow() {
    const targetNode = frameModel.nodes.length > 0 ? frameModel.nodes[0].id : 0;
    frameModel.node_loads.push({ node_id: targetNode, F_x: 0.0, F_y: -20.0, M_z: 0.0 });
    renderModelTables();
    redrawCanvas();
    solveModel();
}

function addMemberLoadRow() {
    const targetMem = frameModel.members.length > 0 ? frameModel.members[0].id : 0;
    frameModel.member_loads.push({ member_id: targetMem, type: 'uniform', q_x: 0.0, q_y: -20.0 });
    renderModelTables();
    redrawCanvas();
    solveModel();
}

function deleteNode(idx) {
    frameModel.nodes.splice(idx, 1);
    frameModel.nodes.forEach((n, i) => n.id = i);
    renderModelTables();
    updateTypicalLoadsMemberSelect();
    redrawCanvas();
}

function deleteMember(idx) {
    frameModel.members.splice(idx, 1);
    frameModel.members.forEach((m, i) => m.id = i);
    renderModelTables();
    updateTypicalLoadsMemberSelect();
    redrawCanvas();
}

function deleteNodeLoad(idx) {
    frameModel.node_loads.splice(idx, 1);
    renderModelTables();
    redrawCanvas();
    solveModel();
}

function deleteMemberLoad(idx) {
    frameModel.member_loads.splice(idx, 1);
    renderModelTables();
    redrawCanvas();
    solveModel();
}

// -------------------------------------------------------------
// Typical Loads Assistant (Soil & Hydro Pressure, Trapezoidal)
// -------------------------------------------------------------
function switchTypicalSubtype(subtype) {
    const subtypes = ['soil', 'hydro', 'trapezoid'];
    subtypes.forEach(st => {
        const form = document.getElementById(`subform-${st}`);
        const btn = document.getElementById(`btn-typ-${st}`);
        if (form && btn) {
            if (st === subtype) {
                form.classList.remove('hidden');
                btn.className = 'py-1.5 px-2 text-xs font-bold rounded-lg border border-amber-500 bg-amber-500 text-white flex items-center justify-center gap-1 shadow-xs';
            } else {
                form.classList.add('hidden');
                btn.className = 'py-1.5 px-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-center gap-1 shadow-xs';
            }
        }
    });

    if (subtype === 'soil') updateSoilPreview();
    else if (subtype === 'hydro') updateHydroPreview();
}

function updateTypicalLoadsMemberSelect() {
    const selects = ['soil-member-id', 'hydro-member-id', 'trap-member-id'];
    selects.forEach(selId => {
        const sel = document.getElementById(selId);
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '';
        frameModel.members.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.innerText = `Barra ${m.id} (Nó ${m.node_i} ➔ Nó ${m.node_j})`;
            sel.appendChild(opt);
        });
        if (currentVal !== '' && frameModel.members.some(m => m.id == currentVal)) {
            sel.value = currentVal;
        }
    });
}

function onSoilMemberChange() {
    const sel = document.getElementById('soil-member-id');
    if (!sel) return;
    const mid = parseInt(sel.value);
    const m = frameModel.members.find(x => x.id === mid);
    if (m) {
        const ni = frameModel.nodes.find(n => n.id === m.node_i);
        const nj = frameModel.nodes.find(n => n.id === m.node_j);
        if (ni && nj) {
            const dy = Math.abs(nj.y - ni.y);
            const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
            const h = dy > 0.1 ? dy : L;
            const hInput = document.getElementById('soil-h');
            if (hInput) hInput.value = h.toFixed(2);
        }
    }
    updateSoilPreview();
}

function onHydroMemberChange() {
    const sel = document.getElementById('hydro-member-id');
    if (!sel) return;
    const mid = parseInt(sel.value);
    const m = frameModel.members.find(x => x.id === mid);
    if (m) {
        const ni = frameModel.nodes.find(n => n.id === m.node_i);
        const nj = frameModel.nodes.find(n => n.id === m.node_j);
        if (ni && nj) {
            const dy = Math.abs(nj.y - ni.y);
            const L = Math.hypot(nj.x - ni.x, nj.y - ni.y);
            const h = dy > 0.1 ? dy : L;
            const hInput = document.getElementById('hydro-h');
            if (hInput) hInput.value = h.toFixed(2);
        }
    }
    updateHydroPreview();
}

function updateSoilPreview() {
    const H = parseFloat(document.getElementById('soil-h')?.value || 4.0);
    const gamma = parseFloat(document.getElementById('soil-gamma')?.value || 18.0);
    const K = parseFloat(document.getElementById('soil-k')?.value || 0.33);
    const qsc = parseFloat(document.getElementById('soil-qsc')?.value || 0.0);

    const q_topo = K * qsc;
    const q_base = K * (gamma * H + qsc);
    const E_tot = ((q_topo + q_base) / 2.0) * H;

    const qtopEl = document.getElementById('soil-prev-qtop');
    const qbaseEl = document.getElementById('soil-prev-qbase');
    const etotEl = document.getElementById('soil-prev-etot');

    if (qtopEl) qtopEl.innerText = `${q_topo.toFixed(1)} kN/m`;
    if (qbaseEl) qbaseEl.innerText = `${q_base.toFixed(1)} kN/m`;
    if (etotEl) etotEl.innerText = `${E_tot.toFixed(1)} kN`;
}

function updateHydroPreview() {
    const H = parseFloat(document.getElementById('hydro-h')?.value || 3.0);
    const gamma = parseFloat(document.getElementById('hydro-gamma')?.value || 10.0);

    const q_base = gamma * H;
    const E_tot = 0.5 * q_base * H;

    const qbaseEl = document.getElementById('hydro-prev-qbase');
    const etotEl = document.getElementById('hydro-prev-etot');

    if (qbaseEl) qbaseEl.innerText = `${q_base.toFixed(1)} kN/m`;
    if (etotEl) etotEl.innerText = `${E_tot.toFixed(1)} kN`;
}

function applySoilPressureToModel() {
    const sel = document.getElementById('soil-member-id');
    if (!sel || !sel.value) return;
    const mid = parseInt(sel.value);
    const m = frameModel.members.find(x => x.id === mid);
    if (!m) return;

    const ni = frameModel.nodes.find(n => n.id === m.node_i);
    const nj = frameModel.nodes.find(n => n.id === m.node_j);
    if (!ni || !nj) return;

    const H = parseFloat(document.getElementById('soil-h')?.value || 4.0);
    const gamma = parseFloat(document.getElementById('soil-gamma')?.value || 18.0);
    const K = parseFloat(document.getElementById('soil-k')?.value || 0.33);
    const qsc = parseFloat(document.getElementById('soil-qsc')?.value || 0.0);
    const dir = document.getElementById('soil-direction')?.value || 'right';

    const q_topo = K * qsc;
    const q_base = K * (gamma * H + qsc);

    const isNodeIBase = ni.y <= nj.y;
    const sign = dir === 'right' ? 1.0 : -1.0;

    const q_i = (isNodeIBase ? q_base : q_topo) * sign;
    const q_j = (isNodeIBase ? q_topo : q_base) * sign;

    const loadObj = {
        member_id: mid,
        type: 'trapezoidal',
        coord_sys: 'global',
        description: `Empuxo Solo (${dir === 'right' ? '→' : '←'} qb=${q_base.toFixed(1)})`,
        QX_i: q_i,
        QX_j: q_j,
        QY_i: 0.0,
        QY_j: 0.0,
        q_x: 0.0,
        q_y: 0.0
    };

    frameModel.member_loads.push(loadObj);
    renderModelTables();
    redrawCanvas();
    solveModel();
}

function applyHydroPressureToModel() {
    const sel = document.getElementById('hydro-member-id');
    if (!sel || !sel.value) return;
    const mid = parseInt(sel.value);
    const m = frameModel.members.find(x => x.id === mid);
    if (!m) return;

    const ni = frameModel.nodes.find(n => n.id === m.node_i);
    const nj = frameModel.nodes.find(n => n.id === m.node_j);
    if (!ni || !nj) return;

    const H = parseFloat(document.getElementById('hydro-h')?.value || 3.0);
    const gamma = parseFloat(document.getElementById('hydro-gamma')?.value || 10.0);
    const dir = document.getElementById('hydro-direction')?.value || 'right';

    const q_base = gamma * H;
    const q_topo = 0.0;

    const isNodeIBase = ni.y <= nj.y;
    const sign = dir === 'right' ? 1.0 : -1.0;

    const q_i = (isNodeIBase ? q_base : q_topo) * sign;
    const q_j = (isNodeIBase ? q_topo : q_base) * sign;

    const loadObj = {
        member_id: mid,
        type: 'trapezoidal',
        coord_sys: 'global',
        description: `Hidrostático (${dir === 'right' ? '→' : '←'} qb=${q_base.toFixed(1)})`,
        QX_i: q_i,
        QX_j: q_j,
        QY_i: 0.0,
        QY_j: 0.0,
        q_x: 0.0,
        q_y: 0.0
    };

    frameModel.member_loads.push(loadObj);
    renderModelTables();
    redrawCanvas();
    solveModel();
}

function applyTrapezoidalLoadToModel() {
    const sel = document.getElementById('trap-member-id');
    if (!sel || !sel.value) return;
    const mid = parseInt(sel.value);

    const qi = parseFloat(document.getElementById('trap-qi')?.value || -10.0);
    const qj = parseFloat(document.getElementById('trap-qj')?.value || -25.0);

    const loadObj = {
        member_id: mid,
        type: 'trapezoidal',
        coord_sys: 'local',
        description: `Trapezoidal (qi=${qi}, qj=${qj})`,
        qy_i: qi,
        qy_j: qj,
        q_x: 0.0,
        q_y: (qi + qj) / 2.0
    };

    frameModel.member_loads.push(loadObj);
    renderModelTables();
    redrawCanvas();
    solveModel();
}

// Window Exports
window.loadFramePreset = loadFramePreset;
window.solveModel = solveModel;
window.setDisplayMode = setDisplayMode;
window.resetCanvasView = resetCanvasView;
window.redrawCanvas = redrawCanvas;
window.switchDataTab = switchDataTab;
window.addRowCurrentTab = addRowCurrentTab;
window.addNodeLoadRow = addNodeLoadRow;
window.addMemberLoadRow = addMemberLoadRow;
window.deleteNode = deleteNode;
window.deleteMember = deleteMember;
window.deleteNodeLoad = deleteNodeLoad;
window.deleteMemberLoad = deleteMemberLoad;
window.switchTypicalSubtype = switchTypicalSubtype;
window.updateTypicalLoadsMemberSelect = updateTypicalLoadsMemberSelect;
window.onSoilMemberChange = onSoilMemberChange;
window.onHydroMemberChange = onHydroMemberChange;
window.updateSoilPreview = updateSoilPreview;
window.updateHydroPreview = updateHydroPreview;
window.applySoilPressureToModel = applySoilPressureToModel;
window.applyHydroPressureToModel = applyHydroPressureToModel;
window.applyTrapezoidalLoadToModel = applyTrapezoidalLoadToModel;
