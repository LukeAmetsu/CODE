/**
 * Flexible Retaining Walls (Sheet Piles / Diaphragm Walls) Controller & 2D Renderer
 * Powered by Blum's Free Earth Support Method & NBR / ArcelorMittal catalogs
 */

let flexWallData = null;

function initFlexibleWall() {
    const flexInputs = document.querySelectorAll('#flexible-wall-form input, #flexible-wall-form select');
    flexInputs.forEach(input => {
        input.addEventListener('input', triggerFlexibleCalculation);
        input.addEventListener('change', triggerFlexibleCalculation);
    });
    toggleFlexibleSupport();
    triggerFlexibleCalculation();
}

function toggleFlexibleSupport() {
    const isAnchored = document.getElementById('flex_is_anchored')?.value === 'true';
    const anchorRow = document.getElementById('flex_anchor_depth_row');
    if (anchorRow) {
        if (isAnchored) {
            anchorRow.classList.remove('hidden');
        } else {
            anchorRow.classList.add('hidden');
        }
    }
}

function loadFlexiblePreset(presetType) {
    if (presetType === 'anchored_sheet_pile') {
        document.getElementById('flex_wall_type').value = 'sheet_pile';
        document.getElementById('flex_is_anchored').value = 'true';
        document.getElementById('flex_H').value = 6.0;
        document.getElementById('flex_anchor_depth').value = 1.2;
        document.getElementById('flex_q').value = 12.0;
        document.getElementById('flex_gamma_retained').value = 18.0;
        document.getElementById('flex_phi_retained').value = 30.0;
        document.getElementById('flex_gamma_passive').value = 19.5;
        document.getElementById('flex_phi_passive').value = 33.0;
        document.getElementById('flex_zw_back').value = 4.0;
        document.getElementById('flex_zw_front').value = 6.0;
        document.getElementById('flex_fs_passive').value = 1.5;
    } else if (presetType === 'cantilever_sheet_pile') {
        document.getElementById('flex_wall_type').value = 'sheet_pile';
        document.getElementById('flex_is_anchored').value = 'false';
        document.getElementById('flex_H').value = 3.5;
        document.getElementById('flex_q').value = 10.0;
        document.getElementById('flex_gamma_retained').value = 18.0;
        document.getElementById('flex_phi_retained').value = 32.0;
        document.getElementById('flex_gamma_passive').value = 19.0;
        document.getElementById('flex_phi_passive').value = 32.0;
        document.getElementById('flex_zw_back').value = 10.0;
        document.getElementById('flex_zw_front').value = 10.0;
        document.getElementById('flex_fs_passive').value = 1.5;
    } else if (presetType === 'diaphragm_wall') {
        document.getElementById('flex_wall_type').value = 'diaphragm_wall';
        document.getElementById('flex_is_anchored').value = 'true';
        document.getElementById('flex_H').value = 8.0;
        document.getElementById('flex_anchor_depth').value = 1.5;
        document.getElementById('flex_q').value = 15.0;
        document.getElementById('flex_gamma_retained').value = 18.5;
        document.getElementById('flex_phi_retained').value = 30.0;
        document.getElementById('flex_gamma_passive').value = 20.0;
        document.getElementById('flex_phi_passive').value = 34.0;
        document.getElementById('flex_zw_back').value = 3.0;
        document.getElementById('flex_zw_front').value = 8.0;
        document.getElementById('flex_fs_passive').value = 1.5;
    }
    toggleFlexibleSupport();
    triggerFlexibleCalculation();
}

function getFlexibleInputs() {
    return {
        wall_type: document.getElementById('flex_wall_type')?.value || 'sheet_pile',
        is_anchored: document.getElementById('flex_is_anchored')?.value === 'true',
        H: parseFloat(document.getElementById('flex_H')?.value || 5.0),
        anchor_depth: parseFloat(document.getElementById('flex_anchor_depth')?.value || 1.0),
        q_surcharge: parseFloat(document.getElementById('flex_q')?.value || 10.0),
        gamma_retained: parseFloat(document.getElementById('flex_gamma_retained')?.value || 18.0),
        phi_retained: parseFloat(document.getElementById('flex_phi_retained')?.value || 30.0),
        c_retained: parseFloat(document.getElementById('flex_c_retained')?.value || 0.0),
        gamma_passive: parseFloat(document.getElementById('flex_gamma_passive')?.value || 19.0),
        phi_passive: parseFloat(document.getElementById('flex_phi_passive')?.value || 32.0),
        c_passive: parseFloat(document.getElementById('flex_c_passive')?.value || 0.0),
        zw_retained: parseFloat(document.getElementById('flex_zw_back')?.value || 4.0),
        zw_passive: parseFloat(document.getElementById('flex_zw_front')?.value || 5.0),
        fs_passive: parseFloat(document.getElementById('flex_fs_passive')?.value || 1.5),
        steel_fy: parseFloat(document.getElementById('flex_steel_fy')?.value || 345.0),
        fck_concrete: parseFloat(document.getElementById('flex_fck_concrete')?.value || 30.0)
    };
}

async function triggerFlexibleCalculation() {
    const inputs = getFlexibleInputs();
    try {
        if (window.eel && eel.calculate_flexible_retaining_wall) {
            const res = await eel.calculate_flexible_retaining_wall(inputs)();
            if (res && res.status === 'success') {
                flexWallData = res;
                updateFlexibleUI(res);
                drawFlexibleWallCanvas(res);
            } else if (res && res.error) {
                console.error("Erro no cálculo da contenção flexível:", res.error);
            }
        }
    } catch (err) {
        console.error("Erro chamando calculate_flexible_retaining_wall:", err);
    }
}

function getFlexibleNormalizedData(res) {
    if (!res) return null;
    const geo = res.geometry || {
        retained_height: res.summary?.excavation_depth ?? 6.0,
        embedment_depth: res.summary?.embedment_exec ?? res.summary?.embedment_req ?? 4.0,
        total_length: res.summary?.total_length ?? 10.0
    };
    const forces = res.forces || {
        is_anchored: (res.summary?.support_type || '').includes('anchor'),
        anchor_force: res.summary?.anchor_force ?? 0,
        anchor_depth: res.summary?.anchor_depth ?? 1.5,
        max_bending_moment: res.summary?.max_moment ?? 0,
        moment_depth: res.summary?.moment_depth ?? (geo.retained_height * 0.7),
        max_shear: res.summary?.max_shear ?? 0
    };
    const sec = res.section_check || {
        type: res.summary?.wall_type || 'sheet_pile',
        approved: (res.steel_design?.status === 'Aprovado') || (res.concrete_design?.status === 'Aprovado'),
        profile: res.steel_design?.selected_profile || 'PU 18',
        W_el_provided: res.steel_design?.selected_W_el || 1800,
        W_el_required: res.steel_design?.W_el_req || 1200,
        utilization: res.steel_design?.utilization || 0.7,
        mass_per_m2: 118,
        wall_thickness: res.concrete_design?.thickness || 0.6,
        As_main: res.concrete_design?.As_req || 15.0,
        As_secondary: (res.concrete_design?.As_req || 15.0) * 0.2
    };
    const stab = res.stability || {
        FS_heave: res.hydraulic_check?.fs_piping ?? 99.9,
        heave_safe: (res.hydraulic_check?.fs_piping ?? 99.9) >= 1.5
    };
    const water = res.water || {
        zw_retained: 3.0,
        zw_passive: geo.retained_height
    };
    const profiles = {
        depths: res.profiles?.depths || res.profiles?.depth || [],
        moments: res.profiles?.moments || res.profiles?.moment || [],
        shears: res.profiles?.shears || res.profiles?.shear || [],
        net_pressures: res.profiles?.net_pressures || res.profiles?.net_pressure || []
    };
    return { geometry: geo, forces, section_check: sec, stability: stab, water, profiles };
}

function updateFlexibleUI(res) {
    const data = getFlexibleNormalizedData(res);
    if (!data) return;

    const geo = data.geometry;
    const loads = data.forces;
    const sec = data.section_check;
    const stab = data.stability;

    // Ficha & Geometria
    setText('flex-res-embedment', `${geo.embedment_depth.toFixed(2)} m`);
    setText('flex-res-total-length', `${geo.total_length.toFixed(2)} m`);
    setText('flex-res-retained-height', `${geo.retained_height.toFixed(2)} m`);

    // Forças Solicitantes
    setText('flex-res-anchor-force', loads.is_anchored ? `${loads.anchor_force.toFixed(1)} kN/m` : 'N/A (Livre)');
    setText('flex-res-max-moment', `${loads.max_bending_moment.toFixed(1)} kNm/m`);
    setText('flex-res-moment-depth', `a z = ${loads.moment_depth.toFixed(2)} m`);
    setText('flex-res-max-shear', `${loads.max_shear.toFixed(1)} kN/m`);

    // Dimensionamento Estrutural
    const secBadge = document.getElementById('flex-res-status-badge');
    if (secBadge) {
        if (sec.approved) {
            secBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-200';
            secBadge.innerText = '✓ Aprovado';
        } else {
            secBadge.className = 'px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200';
            secBadge.innerText = '⚠ Sobredimensionar';
        }
    }

    if (sec.type === 'sheet_pile') {
        document.getElementById('flex-steel-section-card')?.classList.remove('hidden');
        document.getElementById('flex-concrete-section-card')?.classList.add('hidden');
        setText('flex-res-profile-name', sec.profile);
        setText('flex-res-wel-prov', `${sec.W_el_provided.toFixed(0)} cm³/m`);
        setText('flex-res-wel-req', `${sec.W_el_required.toFixed(0)} cm³/m`);
        setText('flex-res-utilization', `${(sec.utilization * 100).toFixed(1)}%`);
        setText('flex-res-steel-mass', `${sec.mass_per_m2} kg/m² de parede`);
    } else {
        document.getElementById('flex-steel-section-card')?.classList.add('hidden');
        document.getElementById('flex-concrete-section-card')?.classList.remove('hidden');
        setText('flex-res-wall-thickness', `${(sec.wall_thickness * 100).toFixed(0)} cm`);
        setText('flex-res-as-main', `${sec.As_main.toFixed(1)} cm²/m`);
        setText('flex-res-as-sec', `${sec.As_secondary.toFixed(1)} cm²/m`);
    }

    // Sifonamento
    setText('flex-res-fs-heave', `${stab.FS_heave.toFixed(2)}`);
    const heaveBadge = document.getElementById('flex-res-heave-badge');
    if (heaveBadge) {
        if (stab.heave_safe) {
            heaveBadge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700';
            heaveBadge.innerText = 'Seguro (FS ≥ 1.5)';
        } else {
            heaveBadge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700';
            heaveBadge.innerText = 'Risco de Sifonamento';
        }
    }
}

function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) el.innerText = txt;
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// 2D Canvas Elevation & Pressure/Moment Diagrams Renderer
// -------------------------------------------------------------
function drawFlexibleWallCanvas(res) {
    const data = getFlexibleNormalizedData(res);
    if (!data) return;

    const canvas = document.getElementById('flex-wall-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. High-DPI Retina/4K Scaling
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || canvas.width || 720;
    const height = rect.height || canvas.height || 460;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // 2. Blueprint Background & Precision CAD Grid
    if (typeof EngCAD !== 'undefined') {
        EngCAD.drawBackground(ctx, width, height, true);
        EngCAD.drawGrid(ctx, width, height, { step: 24, majorEvery: 4 });
    } else {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
    }

    const geo = data.geometry;
    const H = geo.retained_height;
    const D = geo.embedment_depth;
    const L = geo.total_length;
    const isAnchored = data.forces.is_anchored;
    const dAnc = data.forces.anchor_depth;

    // Viewport layout: Left area = Elevation (45%), Right area = Moment Diagram (55%)
    const margin = 35;
    const viewTop = margin + 15;
    const viewBottom = height - margin;
    const viewH = viewBottom - viewTop;

    const scaleY = viewH / (L * 1.12);
    const wallX = Math.max(140, Math.round(width * 0.24));
    const soilWidth = Math.min(180, Math.round(width * 0.20));

    const yTop = viewTop + 10;
    const yExcav = yTop + H * scaleY;
    const yTip = yTop + L * scaleY;

    // 3. Retained Soil (Right of wall)
    const soilGrad = ctx.createLinearGradient(wallX, yTop, wallX + soilWidth, yTop);
    soilGrad.addColorStop(0, 'rgba(217, 119, 6, 0.25)');
    soilGrad.addColorStop(1, 'rgba(180, 83, 9, 0.10)');
    ctx.fillStyle = soilGrad;
    ctx.fillRect(wallX, yTop, soilWidth, yTip - yTop);

    // Retained soil hatch pattern
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.lineWidth = 1;
    for (let y = yTop; y < yTip; y += 18) {
        ctx.beginPath();
        ctx.moveTo(wallX, y);
        ctx.lineTo(wallX + soilWidth, y + 25);
        ctx.stroke();
    }

    // 4. Excavation Soil (Left of wall, below excavation line yExcav)
    const excavGrad = ctx.createLinearGradient(margin + 15, yExcav, wallX, yExcav);
    excavGrad.addColorStop(0, 'rgba(20, 184, 166, 0.08)');
    excavGrad.addColorStop(1, 'rgba(20, 184, 166, 0.22)');
    ctx.fillStyle = excavGrad;
    ctx.fillRect(margin + 15, yExcav, wallX - (margin + 15), yTip - yExcav);

    // 5. Ground lines (Top and Excavation)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(wallX, yTop);
    ctx.lineTo(wallX + soilWidth, yTop);
    ctx.stroke();

    ctx.strokeStyle = '#2dd4bf';
    ctx.beginPath();
    ctx.moveTo(margin + 15, yExcav);
    ctx.lineTo(wallX, yExcav);
    ctx.stroke();

    // Ground hatch ticks
    const drawTicks = (x1, y1, x2, color) => {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        for (let x = x1 + 5; x < x2 - 5; x += 12) {
            ctx.beginPath();
            ctx.moveTo(x, y1);
            ctx.lineTo(x - 6, y1 + 7);
            ctx.stroke();
        }
        ctx.restore();
    };
    drawTicks(wallX, yTop, wallX + soilWidth, '#f59e0b');
    drawTicks(margin + 15, yExcav, wallX, '#2dd4bf');

    // 6. Water Tables (High Contrast Cyan dashed with Pill Badges)
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);

    const zwBack = data.water.zw_retained;
    const zwFront = data.water.zw_passive;
    if (zwBack < L) {
        const yWBack = yTop + zwBack * scaleY;
        ctx.beginPath();
        ctx.moveTo(wallX, yWBack);
        ctx.lineTo(wallX + soilWidth, yWBack);
        ctx.stroke();

        drawFlexPillBadge(ctx, `NA Montante (${zwBack.toFixed(1)}m)`, wallX + 18, yWBack - 10, '#38bdf8', 'rgba(15, 23, 42, 0.92)');
    }
    if (zwFront < L) {
        const yWFront = yTop + zwFront * scaleY;
        ctx.beginPath();
        ctx.moveTo(margin + 15, yWFront);
        ctx.lineTo(wallX, yWFront);
        ctx.stroke();

        drawFlexPillBadge(ctx, `NA Jusante (${zwFront.toFixed(1)}m)`, margin + 25, yWFront - 10, '#38bdf8', 'rgba(15, 23, 42, 0.92)');
    }
    ctx.setLineDash([]);

    // 7. Flexible Wall Sheet Pile Body
    const wallThick = data.section_check.type === 'diaphragm_wall' ? 14 : 10;
    const wallGrad = ctx.createLinearGradient(wallX - wallThick / 2, yTop, wallX + wallThick / 2, yTop);
    wallGrad.addColorStop(0, '#38bdf8');
    wallGrad.addColorStop(1, '#0284c7');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(wallX - wallThick / 2, yTop, wallThick, yTip - yTop);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(wallX - wallThick / 2, yTop, wallThick, yTip - yTop);

    // 8. Anchor / Strut (if active)
    if (isAnchored) {
        const yAnc = yTop + dAnc * scaleY;
        const ancEndX = wallX + Math.min(130, soilWidth - 20);
        const ancEndY = yAnc - 20;

        // Anchor Tieback Line
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(wallX, yAnc);
        ctx.lineTo(ancEndX, ancEndY);
        ctx.stroke();

        // Technical Grout Bulb
        ctx.fillStyle = 'rgba(244, 63, 94, 0.35)';
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.ellipse(ancEndX, ancEndY, 18, 8, -0.22, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();

        // Steel anchor plate on wall face
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(wallX - wallThick / 2 - 5, yAnc - 7, 5, 14);

        // Technical Pill Badge
        const ancTxt = `Tirante T = ${data.forces.anchor_force.toFixed(1)} kN/m`;
        drawFlexPillBadge(ctx, ancTxt, wallX + 35, yAnc - 16, '#fda4af', 'rgba(15, 23, 42, 0.94)', '#f43f5e');
    }

    // 9. High-Contrast Dimension Cotas (H and D on left)
    const dimX = wallX - 45;
    drawDimensionLine(ctx, dimX, yTop, dimX, yExcav, `H = ${H.toFixed(1)} m`);
    drawDimensionLine(ctx, dimX, yExcav, dimX, yTip, `D = ${D.toFixed(1)} m`);

    // ---------------------------------------------------------
    // 10. DIAGRAMA: Momento Fletor M(z) [kNm/m] (À Direita)
    // ---------------------------------------------------------
    const diagX0 = Math.max(wallX + soilWidth + 35, Math.round(width * 0.48));
    const diagW = width - diagX0 - 40;

    // Title
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Diagrama de Momentos Fletores M(z) [kNm/m]', diagX0, viewTop - 8);

    // Zero Axis Line
    const axisX = diagX0 + 35;
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(axisX, yTop);
    ctx.lineTo(axisX, yTip);
    ctx.stroke();

    const depthPts = data.profiles.depths;
    const momentPts = data.profiles.moments;
    const maxM = Math.max(1.0, data.forces.max_bending_moment);
    const scaleM = Math.max(10, (diagW - 80) / maxM);

    ctx.beginPath();
    ctx.moveTo(axisX, yTop);
    for (let i = 0; i < depthPts.length; i++) {
        const z = depthPts[i];
        const M = momentPts[i];
        const py = yTop + z * scaleY;
        const px = axisX + M * scaleM;
        ctx.lineTo(px, py);
    }
    ctx.lineTo(axisX, yTip);
    ctx.closePath();

    // Moment curve gradient fill & crisp cyan stroke
    const mGrad = ctx.createLinearGradient(axisX, yTop, axisX + maxM * scaleM, yTop);
    mGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
    mGrad.addColorStop(1, 'rgba(56, 189, 248, 0.35)');
    ctx.fillStyle = mGrad;
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Peak M_max indicator
    const yMmax = yTop + data.forces.moment_depth * scaleY;
    const xMmax = axisX + data.forces.max_bending_moment * scaleM;

    // Glow circle & dot
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(xMmax, yMmax, 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pill badge for Mmax positioned cleanly without getting cut off
    const mmaxText = `Mmax = ${data.forces.max_bending_moment.toFixed(1)} kNm/m`;
    ctx.font = 'bold 10px Inter, monospace';
    const mbw = ctx.measureText(mmaxText).width + 12;
    const mbx = Math.min(xMmax + 8, width - mbw - 10);
    drawFlexPillBadge(ctx, mmaxText, mbx, yMmax, '#f87171', 'rgba(15, 23, 42, 0.95)', '#ef4444', false);
}

function drawFlexPillBadge(ctx, text, x, y, textColor, bgColor, borderColor = textColor, centered = false) {
    ctx.save();
    ctx.font = 'bold 10px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const padX = 6;
    const padY = 3;
    const bw = tw + padX * 2;
    const bh = 15 + padY * 2;
    const bx = centered ? x - bw / 2 : x;
    const by = y - bh / 2;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 4);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + padX, y);
    ctx.restore();
}

function drawDimensionLine(ctx, x1, y1, x2, y2, text) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;

    // Extension lines
    ctx.beginPath();
    ctx.moveTo(x1 + 4, y1);
    ctx.lineTo(x1 - 4, y1);
    ctx.moveTo(x1 + 4, y2);
    ctx.lineTo(x1 - 4, y2);
    // Dimension line
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // 45 deg Architectural Ticks
    const tick = 3.5;
    ctx.beginPath();
    ctx.moveTo(x1 - tick, y1 + tick);
    ctx.lineTo(x1 + tick, y1 - tick);
    ctx.moveTo(x2 - tick, y2 + tick);
    ctx.lineTo(x2 + tick, y2 - tick);
    ctx.stroke();

    // High Contrast Text Pill
    const midY = (y1 + y2) / 2;
    ctx.font = 'bold 10px Inter, sans-serif';
    const tw = ctx.measureText(text).width;
    const bw = tw + 10;
    const bh = 16;
    const bx = x1 - bw / 2;
    const by = midY - bh / 2;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 3);
    else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x1, midY);
    ctx.restore();
}

window.initFlexibleWall = initFlexibleWall;
window.loadFlexiblePreset = loadFlexiblePreset;
window.triggerFlexibleCalculation = triggerFlexibleCalculation;
window.toggleFlexibleSupport = toggleFlexibleSupport;

/**
 * Export Current Flexible Retaining Wall Model to RS2 FEA 2D Suite
 * Constructs staged excavation model with embedded sheet pile / diaphragm wall,
 * prestressed 1D tiebacks with axial stiffness (EA/L), and SSR global stability.
 */
function exportFlexibleToRS2FEA() {
    const inputs = getFlexibleInputs();

    // 1. Determine embedment depth D
    let D = 0;
    if (flexWallData && flexWallData.embedment_depth) {
        D = flexWallData.embedment_depth;
    } else {
        D = inputs.is_anchored ? inputs.H * 0.85 : inputs.H * 1.35;
    }
    D = Math.max(2.5, Math.round(D * 10) / 10);

    const H = inputs.H;
    const isDiaphragm = inputs.wall_type === 'diaphragm_wall';
    const t_wall = isDiaphragm ? 0.80 : 0.40;
    const L_wall = H + D;

    // 2. Extents and Dimensions
    const H_bedrock = Math.max(5.0, Math.round(D * 0.8 * 10) / 10);
    const L_left = Math.max(12.0, Math.round(H * 1.8 * 10) / 10);
    const L_right = Math.max(16.0, Math.round(H * 2.2 * 10) / 10);

    const X_wall_left = L_left;
    const X_wall_right = X_wall_left + t_wall;
    const X_right = X_wall_right + L_right;

    const Y_bottom = 0.0;
    const Y_wall_toe = H_bedrock;
    const Y_dredge = Y_wall_toe + D;
    const Y_surface = Y_dredge + H;
    const Y_anchor = Y_surface - Math.max(0.6, inputs.anchor_depth || 1.2);

    // 3. Conforming Layer Polygons
    // Wall Polygon (Layer 4)
    const wall_poly = [
        [roundCoord(X_wall_left), roundCoord(Y_wall_toe)],
        [roundCoord(X_wall_right), roundCoord(Y_wall_toe)],
        [roundCoord(X_wall_right), roundCoord(Y_surface)],
        [roundCoord(X_wall_left), roundCoord(Y_surface)]
    ];

    // Deep Foundation / Bedrock (Layer 0)
    const bedrock_poly = [
        [0.0, 0.0],
        [roundCoord(X_right), 0.0],
        [roundCoord(X_right), roundCoord(Y_wall_toe)],
        [roundCoord(X_wall_right), roundCoord(Y_wall_toe)],
        [roundCoord(X_wall_left), roundCoord(Y_wall_toe)],
        [0.0, roundCoord(Y_wall_toe)]
    ];

    // Front Passive Soil below dredge line (Layer 1)
    const passive_poly = [
        [0.0, roundCoord(Y_wall_toe)],
        [roundCoord(X_wall_left), roundCoord(Y_wall_toe)],
        [roundCoord(X_wall_left), roundCoord(Y_dredge)],
        [0.0, roundCoord(Y_dredge)]
    ];

    // Front Excavation Pit - Cava a ser escavada na Fase 3 (Layer 1 - Solo a remover)
    const cava_poly = [
        [0.0, roundCoord(Y_dredge)],
        [roundCoord(X_wall_left), roundCoord(Y_dredge)],
        [roundCoord(X_wall_left), roundCoord(Y_surface)],
        [0.0, roundCoord(Y_surface)]
    ];

    // Retained Soil behind wall (Layer 2)
    const retained_poly = [
        [roundCoord(X_wall_right), roundCoord(Y_wall_toe)],
        [roundCoord(X_right), roundCoord(Y_wall_toe)],
        [roundCoord(X_right), roundCoord(Y_surface)],
        [roundCoord(X_wall_right), roundCoord(Y_surface)]
    ];

    // Outer Domain Boundary (Full rectangular block before excavation)
    const domain_poly = [
        [0.0, 0.0],
        [roundCoord(X_right), 0.0],
        [roundCoord(X_right), roundCoord(Y_surface)],
        [0.0, roundCoord(Y_surface)]
    ];

    // 4. Materials
    const materials = [
        {
            name: 'Arenito / Solo Rijo de Fundo',
            color: '#475569',
            gamma: 21.0,
            E: 100000.0,
            nu: 0.26,
            c: 35.0,
            phi: 36.0,
            tension: 15.0
        },
        {
            name: 'Solo de Ficha / Jusante (Passivo)',
            color: '#0d9488',
            gamma: Math.max(16.0, inputs.gamma_passive || 19.0),
            E: 45000.0,
            nu: 0.28,
            c: Math.max(2.0, inputs.c_passive || 5.0),
            phi: Math.max(20.0, inputs.phi_passive || 32.0),
            tension: 4.0
        },
        {
            name: 'Solo de Escoramento / Montante',
            color: '#d97706',
            gamma: Math.max(15.0, inputs.gamma_retained || 18.0),
            E: 30000.0,
            nu: 0.30,
            c: Math.max(1.0, inputs.c_retained || 2.0),
            phi: Math.max(20.0, inputs.phi_retained || 30.0),
            tension: 2.0
        }
    ];

    if (isDiaphragm) {
        materials.push({
            name: 'Parede Diafragma de Concreto (t=0.8m, fck=' + (inputs.fck_concrete || 30) + 'MPa)',
            color: '#0284c7',
            gamma: 25.0,
            E: 30000000.0,
            nu: 0.20,
            c: 5000.0,
            phi: 45.0,
            tension: 2500.0,
            model: 'elastic'
        });
    } else {
        materials.push({
            name: 'Estaca-Prancha Aço (ArcelorMittal AZ fy=' + (inputs.steel_fy || 345) + 'MPa)',
            color: '#3b82f6',
            gamma: 25.0,
            E: 200000000.0,
            nu: 0.25,
            c: 12000.0,
            phi: 45.0,
            tension: 6000.0,
            model: 'elastic'
        });
    }

    const layer_polygons = [
        { polygon: bedrock_poly, material_idx: 0 },
        { polygon: passive_poly, material_idx: 1 },
        { polygon: retained_poly, material_idx: 2 },
        { polygon: cava_poly, material_idx: 1 },
        { polygon: wall_poly, material_idx: 3 }
    ];

    // 5. Tieback Anchors
    const anchors = [];
    if (inputs.is_anchored) {
        const L_anchor = Math.max(12.0, Math.round(H * 1.6 * 10) / 10);
        const theta_rad = 15.0 * Math.PI / 180.0;
        const X_anc2 = X_wall_right + L_anchor * Math.cos(theta_rad);
        const Y_anc2 = Y_anchor - L_anchor * Math.sin(theta_rad);

        let T0 = 120.0;
        if (flexWallData && flexWallData.anchor_force) {
            T0 = flexWallData.anchor_force;
        } else {
            T0 = Math.max(80.0, inputs.q_surcharge * 2.0 + 16.0 * H);
        }

        anchors.push({
            id: 1,
            x1: roundCoord(X_wall_right),
            y1: roundCoord(Y_anchor),
            x2: roundCoord(X_anc2),
            y2: roundCoord(Y_anc2),
            ea: 250000.0,
            prestress: Math.round(T0 * 10) / 10,
            active_stages: [3, 4]
        });
    }

    // 6. Surcharges
    const surcharges = [];
    if (inputs.q_surcharge > 0) {
        surcharges.push({
            x1: roundCoord(X_wall_right + 1.0),
            x2: roundCoord(Math.min(X_right - 1.0, X_wall_right + 1.0 + H * 1.6)),
            q: parseFloat(inputs.q_surcharge)
        });
    }

    // 7. Multi-Stage Construction Sequence
    const typeLabel = isDiaphragm ? 'Parede Diafragma' : 'Estaca-Prancha Metálica';
    const stages = [
        {
            id: 1,
            name: 'Fase 1: Maciço Inteiriço In-Situ',
            active_polygons: [0, 1, 2, 3],
            reset_disp: true,
            description: 'Equilíbrio geostático confinador inicial antes da abertura de cava.'
        },
        {
            id: 2,
            name: 'Fase 2: Instalação da Contenção (' + typeLabel + ')',
            active_polygons: [0, 1, 2, 3, 4],
            reset_disp: false,
            description: 'Cravação / concretagem do elemento estrutural de contenção (t=' + t_wall + 'm, L=' + L_wall.toFixed(1) + 'm).'
        },
        {
            id: 3,
            name: 'Fase 3: Escavação da Cava' + (inputs.is_anchored ? ' e Protensão do Tirante' : ''),
            active_polygons: [0, 1, 2, 4], // cava_poly (3) removed!
            reset_disp: false,
            description: 'Abertura da cava de ' + H.toFixed(1) + 'm' + (inputs.is_anchored ? ' e aplicação da protensão de tirante T0=' + (anchors[0]?.prestress || 0) + ' kN/m.' : '.')
        },
        {
            id: 4,
            name: 'Fase 4: Sobrecargas Operacionais de Borda',
            active_polygons: [0, 1, 2, 4],
            active_surcharges: surcharges.length > 0 ? [0] : [],
            reset_disp: false,
            description: 'Aplicação da sobrecarga nominal de tráfego/equipamentos de ' + inputs.q_surcharge + ' kPa na borda.'
        }
    ];

    // Build RS2 Model Object
    const rs2Model = {
        name: typeLabel + (inputs.is_anchored ? ' Ancorada' : ' em Balanço') + ' (H=' + H.toFixed(1) + 'm, D=' + D.toFixed(1) + 'm)',
        type: 'retaining_wall',
        retaining_type: isDiaphragm ? 'diaphragm' : 'sheet_pile',
        domain_poly: domain_poly,
        internal_boundaries: [],
        layer_polygons: layer_polygons,
        materials: materials,
        anchors: anchors,
        surcharges: surcharges,
        stages: stages,
        target_elem_size: 1.3,
        k0: 0.50
    };

    // Save payload to sessionStorage and redirect
    try {
        sessionStorage.setItem('rs2_imported_model', JSON.stringify(rs2Model));
        window.location.href = 'rs2_fem.html';
    } catch (err) {
        console.error('Falha ao exportar modelo flexível para RS2:', err);
        alert('Erro ao transferir dados para o RS2: ' + err.message);
    }
}

function roundCoord(v) {
    return Math.round(v * 1000) / 1000;
}

window.exportFlexibleToRS2FEA = exportFlexibleToRS2FEA;

