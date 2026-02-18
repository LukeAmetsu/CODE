// --- Global variables for the 3D scene ---
let bjsEngine, bjsScene, bjsGuiTexture;
let dimensionElements = { meshes: [], labels: [] };
let isFirstDraw = true; 
let areDimensionsVisible = true; 

// --- Batch Load State (Restored) ---
const spliceBatch = {
    cases: [{ Mu: 0, Vu: 0, Pu: 0 }], // Start with one default case
    selectedIndex: -1
};

// --- Input IDs impacting geometry ---
const diagramInputIds = [
    'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'num_flange_plates',
    'H_fp', 't_fp', 'L_fp', 'H_fp_inner', 't_fp_inner', 'L_fp_inner', 'D_fp', 'Nc_fp',
    'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp', 'g_gage_fp',
    'num_web_plates', 'H_wp', 't_wp', 'L_wp', 'D_wp', 'Nc_wp', 'Nr_wp',
    'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp', 'member_shape_type'
];

let masterBolts = {};

// --- 2D DRAWING ENGINE (Technical Standard) ---
function draw2dSpliceDiagram(targetSvg = null, viewMode = "all") {
    const svgId = "splice-2d-diagram";
    const svg = targetSvg || document.getElementById(svgId);
    if (!svg) return;

    // Clear and Setup
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    
    // Scale Factor: 1 inch = 10 units (pixels) for internal logic
    const S = 10; 
    
    // Inputs (Safely Parsed)
    const inputs = gatherInputsFromIds(diagramInputIds);
    const safeFloat = (v, def) => { const f = parseFloat(v); return isNaN(f) ? def : f; };
    
    const d = safeFloat(inputs.member_d, 18);
    const bf = safeFloat(inputs.member_bf, 7.5);
    const tf = safeFloat(inputs.member_tf, 0.57);
    const tw = safeFloat(inputs.member_tw, 0.355);
    const gap = safeFloat(inputs.gap, 0.5);
    
    const isHSS = inputs.member_shape_type === 'HSS Rectangular';
    const num_fp = parseInt(inputs.num_flange_plates) || 0;
    const L_fp = safeFloat(inputs.L_fp, 12);
    const H_fp = safeFloat(inputs.H_fp, 6);
    const t_fp = safeFloat(inputs.t_fp, 0.5);
    const D_fp = safeFloat(inputs.D_fp, 0.75);
    
    // Web Plate Data
    const num_wp = parseInt(inputs.num_web_plates) || 0;
    const L_wp = safeFloat(inputs.L_wp, 12);
    const H_wp = safeFloat(inputs.H_wp, 10);
    const t_wp = safeFloat(inputs.t_wp, 0.375);
    const D_wp = safeFloat(inputs.D_wp, 0.75);

    const ns = "http://www.w3.org/2000/svg";

    // --- DEFS: Hatch & Arrow ---
    const defs = document.createElementNS(ns, "defs");
    
    // Hatch Pattern
    const pattern = document.createElementNS(ns, "pattern");
    pattern.setAttribute("id", "hatch");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", "4");
    pattern.setAttribute("height", "4");
    pattern.setAttribute("patternTransform", "rotate(45)");
    const hatchLine = document.createElementNS(ns, "line");
    hatchLine.setAttribute("x1", "0"); hatchLine.setAttribute("y1", "0");
    hatchLine.setAttribute("x2", "0"); hatchLine.setAttribute("y2", "4");
    hatchLine.setAttribute("stroke", "#666");
    hatchLine.setAttribute("stroke-width", "0.5");
    pattern.appendChild(hatchLine);
    defs.appendChild(pattern);

    // Arrow Marker
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "arrow");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "7");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "3.5");
    marker.setAttribute("orient", "auto");
    const arrowPath = document.createElementNS(ns, "path");
    arrowPath.setAttribute("d", "M0,0 L10,3.5 L0,7"); 
    arrowPath.setAttribute("fill", "none");
    arrowPath.setAttribute("stroke", "#000");
    arrowPath.setAttribute("stroke-width", "1");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);

    svg.appendChild(defs);

    // --- Helper Functions ---
    const createGroup = (parent, x, y) => {
        const g = document.createElementNS(ns, "g");
        g.setAttribute("transform", `translate(${x * S}, ${y * S})`);
        parent.appendChild(g);
        return g;
    };

    const drawRect = (parent, x, y, w, h, cls="outline") => {
        const r = document.createElementNS(ns, "rect");
        r.setAttribute("x", x * S); r.setAttribute("y", y * S);
        r.setAttribute("width", w * S); r.setAttribute("height", h * S);
        
        if (cls === "outline") {
            r.setAttribute("stroke", "#000"); r.setAttribute("stroke-width", "1.5"); r.setAttribute("fill", "none");
        } else if (cls === "hatch") {
            r.setAttribute("stroke", "#000"); r.setAttribute("stroke-width", "1"); r.setAttribute("fill", "url(#hatch)");
        } else if (cls === "fill") {
            r.setAttribute("stroke", "#000"); r.setAttribute("stroke-width", "1"); r.setAttribute("fill", "#fff");
        } else if (cls === "dashed") {
            r.setAttribute("stroke", "#666"); r.setAttribute("stroke-width", "1"); r.setAttribute("fill", "none"); r.setAttribute("stroke-dasharray", "4,2");
        }
        parent.appendChild(r);
    };

    const drawLine = (parent, x1, y1, x2, y2, type="solid") => {
        const l = document.createElementNS(ns, "line");
        l.setAttribute("x1", x1 * S); l.setAttribute("y1", y1 * S);
        l.setAttribute("x2", x2 * S); l.setAttribute("y2", y2 * S);
        l.setAttribute("stroke", "#000");
        l.setAttribute("stroke-width", type==="thick" ? "2" : "1");
        if (type === "dashed") {
            l.setAttribute("stroke", "#444");
            l.setAttribute("stroke-dasharray", "4,2");
        } 
        parent.appendChild(l);
    };

    const drawBoltFace = (parent, cx, cy, dia) => {
        const g = document.createElementNS(ns, "g");
        const r = (dia * S) / 2;
        const hex = document.createElementNS(ns, "polygon");
        let points = "";
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 180) * (60 * i);
            points += `${(cx * S) + r * Math.cos(angle)},${(cy * S) + r * Math.sin(angle)} `;
        }
        hex.setAttribute("points", points);
        hex.setAttribute("fill", "#fff");
        hex.setAttribute("stroke", "#000");
        hex.setAttribute("stroke-width", "1");
        g.appendChild(hex);
        
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", cx * S); c.setAttribute("cy", cy * S); c.setAttribute("r", (dia * S) * 0.3);
        c.setAttribute("fill", "none"); c.setAttribute("stroke", "#000");
        g.appendChild(c);
        parent.appendChild(g);
    };

    const drawBoltSide = (parent, x, y, len, dia) => {
        const headH = dia * 0.6;
        const nutH = dia * 0.6;
        // Shank
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", (x - dia/2)*S); rect.setAttribute("y", y*S);
        rect.setAttribute("width", dia*S); rect.setAttribute("height", len*S);
        rect.setAttribute("fill", "#ddd"); rect.setAttribute("stroke", "#000");
        parent.appendChild(rect);
        // Head
        const head = document.createElementNS(ns, "rect");
        head.setAttribute("x", (x - dia*0.8)*S); head.setAttribute("y", (y - headH)*S);
        head.setAttribute("width", (dia*1.6)*S); head.setAttribute("height", headH*S);
        head.setAttribute("fill", "#fff"); head.setAttribute("stroke", "#000");
        parent.appendChild(head);
        // Nut
        const nut = document.createElementNS(ns, "rect");
        nut.setAttribute("x", (x - dia*0.8)*S); nut.setAttribute("y", (y + len)*S);
        nut.setAttribute("width", (dia*1.6)*S); nut.setAttribute("height", nutH*S);
        nut.setAttribute("fill", "#fff"); nut.setAttribute("stroke", "#000");
        parent.appendChild(nut);
    };

    const drawDim = (parent, x1, y1, x2, y2, offset, text, vertical=false) => {
        const g = document.createElementNS(ns, "g");
        let tx1 = x1 * S, ty1 = y1 * S;
        let tx2 = x2 * S, ty2 = y2 * S;
        let off = offset * S;

        if (vertical) {
            const extLen = (offset > 0 ? offset + 2 : offset - 2) * S; 
            const lineX = tx1 + off;
            
            const l1 = document.createElementNS(ns, "line");
            l1.setAttribute("x1", tx1); l1.setAttribute("y1", ty1); l1.setAttribute("x2", lineX); l1.setAttribute("y2", ty1);
            l1.setAttribute("stroke", "#000"); l1.setAttribute("stroke-width", "0.5");
            g.appendChild(l1);

            const l2 = document.createElementNS(ns, "line");
            l2.setAttribute("x1", tx2); l2.setAttribute("y1", ty2); l2.setAttribute("x2", lineX); l2.setAttribute("y2", ty2);
            l2.setAttribute("stroke", "#000"); l2.setAttribute("stroke-width", "0.5");
            g.appendChild(l2);

            const main = document.createElementNS(ns, "line");
            main.setAttribute("x1", lineX); main.setAttribute("y1", ty1); main.setAttribute("x2", lineX); main.setAttribute("y2", ty2);
            main.setAttribute("stroke", "#000"); main.setAttribute("stroke-width", "0.5");
            main.setAttribute("marker-start", "url(#arrow)"); main.setAttribute("marker-end", "url(#arrow)");
            g.appendChild(main);

            const txt = document.createElementNS(ns, "text");
            txt.setAttribute("x", lineX - 5); txt.setAttribute("y", (ty1 + ty2)/2);
            txt.setAttribute("text-anchor", "end"); txt.setAttribute("dominant-baseline", "middle");
            txt.setAttribute("font-family", "Arial"); txt.setAttribute("font-size", "5");
            // White halo for readability
            txt.setAttribute("paint-order", "stroke");
            txt.setAttribute("stroke", "white");
            txt.setAttribute("stroke-width", "1px");
            txt.setAttribute("stroke-linecap", "butt");
            txt.setAttribute("stroke-linejoin", "miter");
            txt.textContent = text;
            g.appendChild(txt);
            // Re-add text on top filled black (SVG 2 paint-order handles this, but explicit duplicate ensures it in older renderers if needed? No, paint-order is standard now. But paint-order sets the order of painting ONE element. So stroke is painted under fill. We need to set fill black too.)
            txt.setAttribute("fill", "black");
        } else {
            const lineY = ty1 + off;
            
            const l1 = document.createElementNS(ns, "line");
            l1.setAttribute("x1", tx1); l1.setAttribute("y1", ty1); l1.setAttribute("x2", tx1); l1.setAttribute("y2", lineY);
            l1.setAttribute("stroke", "#000"); l1.setAttribute("stroke-width", "0.5");
            g.appendChild(l1);

            const l2 = document.createElementNS(ns, "line");
            l2.setAttribute("x1", tx2); l2.setAttribute("y1", ty2); l2.setAttribute("x2", tx2); l2.setAttribute("y2", lineY);
            l2.setAttribute("stroke", "#000"); l2.setAttribute("stroke-width", "0.5");
            g.appendChild(l2);

            const main = document.createElementNS(ns, "line");
            main.setAttribute("x1", tx1); main.setAttribute("y1", lineY); main.setAttribute("x2", tx2); main.setAttribute("y2", lineY);
            main.setAttribute("stroke", "#000"); main.setAttribute("stroke-width", "0.5");
            main.setAttribute("marker-start", "url(#arrow)"); main.setAttribute("marker-end", "url(#arrow)");
            g.appendChild(main);

            const txt = document.createElementNS(ns, "text");
            txt.setAttribute("x", (tx1 + tx2)/2); txt.setAttribute("y", lineY - 2.5);
            txt.setAttribute("text-anchor", "middle"); txt.setAttribute("font-family", "Arial");
            txt.setAttribute("font-size", "5");
            // White halo
            txt.setAttribute("paint-order", "stroke");
            txt.setAttribute("stroke", "white");
            txt.setAttribute("stroke-width", "1px");
            txt.setAttribute("stroke-linecap", "butt");
            txt.setAttribute("stroke-linejoin", "miter");
            txt.setAttribute("fill", "black");
            txt.textContent = text;
            g.appendChild(txt);
        }
        parent.appendChild(g);
    };

    // --- Text / Legend helpers ---
    const drawText = (parent, x, y, text, opts = {}) => {
        const t = document.createElementNS(ns, "text");
        t.setAttribute("x", x * S);
        t.setAttribute("y", y * S);
        t.setAttribute("font-family", opts.fontFamily || "Arial");
        t.setAttribute("font-size", opts.fontSize || "5");
        t.setAttribute("font-weight", opts.bold ? "bold" : "normal");
        t.setAttribute("text-anchor", opts.anchor || "start");
        t.setAttribute("dominant-baseline", opts.baseline || "hanging");
        t.textContent = text;
        parent.appendChild(t);
        return t;
    };

    const drawLegendBox = (parent, x, y, lines, opts = {}) => {
        const fontSizePx = opts.fontSize ?? 5;
        const lineHPx    = opts.lineHPx ?? (fontSizePx * 1.5);
        const padPx      = opts.padPx ?? (fontSizePx * 1.0);

        // Convert px spacing into your "inch" coordinate system
        const pad   = padPx / S;      // inches
        const lineH = lineHPx / S;    // inches

        const w = opts.w ?? 7.2;
        const h = pad * 2 + lineH * lines.length;

        // background
        drawRect(parent, x, y, w, h, "fill");

        // border
        const border = document.createElementNS(ns, "rect");
        border.setAttribute("x", x * S);
        border.setAttribute("y", y * S);
        border.setAttribute("width", w * S);
        border.setAttribute("height", h * S);
        border.setAttribute("fill", "none");
        border.setAttribute("stroke", "#444");
        border.setAttribute("stroke-width", "1");
        parent.appendChild(border);

        // lines
        lines.forEach((ln, i) => {
            drawText(parent, x + pad, y + pad + i * lineH, ln, { fontSize: fontSizePx });
        });

        return { w, h };
    };

    // --- Layout Calculations ---
    const beamLen = Math.max(L_fp, L_wp, 12) * 1.5;
    const legendWidth = 8.5; // Reserve 8.5 inches gutter on the left

    // 1. ELEVATION VIEW
    if (viewMode === "all" || viewMode === "elevation") {
        // Shift right by legendWidth
        const elevG = createGroup(svg, legendWidth + beamLen/2 + 4, d/2 + 8); 
        drawText(elevG, 0, (-d/2 - 3.0), "ELEVATION", { anchor: "middle", bold: true, fontSize: 12 });

        if (isHSS) {
            drawRect(elevG, -beamLen/2, -d/2, (beamLen - gap)/2, d, "fill");
            drawRect(elevG, gap/2, -d/2, (beamLen - gap)/2, d, "fill");
            // Inner walls (hidden/dashed)
            drawLine(elevG, -beamLen/2, d/2-tf, -gap/2, d/2-tf, "dashed");
            drawLine(elevG, -beamLen/2, -d/2+tf, -gap/2, -d/2+tf, "dashed");
            drawLine(elevG, gap/2, d/2-tf, beamLen/2, d/2-tf, "dashed");
            drawLine(elevG, gap/2, -d/2+tf, beamLen/2, -d/2+tf, "dashed");
        } else {
            drawRect(elevG, -beamLen/2, -d/2, (beamLen - gap)/2, d, "fill");
            drawRect(elevG, gap/2, -d/2, (beamLen - gap)/2, d, "fill");
            drawLine(elevG, -beamLen/2, d/2-tf, -gap/2, d/2-tf);
            drawLine(elevG, -beamLen/2, -d/2+tf, -gap/2, -d/2+tf);
            drawLine(elevG, gap/2, d/2-tf, beamLen/2, d/2-tf);
            drawLine(elevG, gap/2, -d/2+tf, beamLen/2, -d/2+tf);
        }

        if (num_wp > 0) {
            drawRect(elevG, -L_wp/2, -H_wp/2, L_wp, H_wp, "dashed");
            const Nc_w = parseInt(inputs.Nc_wp)||0;
            const Nr_w = parseInt(inputs.Nr_wp)||0;
            const Sc_w = safeFloat(inputs.S4_col_spacing_wp, 3);
            const Sr_w = safeFloat(inputs.S5_row_spacing_wp, 3);
            const Se_w = safeFloat(inputs.S6_end_dist_wp, 1.5);
            const startY = -((Nr_w - 1) * Sr_w) / 2;
            
            [-1, 1].forEach(side => {
                for(let c=0; c<Nc_w; c++) {
                    const bx = side * (gap/2 + Se_w + c*Sc_w);
                    for(let r=0; r<Nr_w; r++) {
                        const by = startY + r*Sr_w;
                        drawBoltFace(elevG, bx, by, D_wp);
                    }
                }
            });
            if (Nc_w > 0) {
                const rightStart = gap/2 + Se_w;
                drawDim(elevG, gap/2, -H_wp/2, gap/2 + Se_w, -H_wp/2, -3, `Se=${Se_w}"`);
                if(Nc_w > 1) {
                    drawDim(elevG, rightStart, -H_wp/2, rightStart + (Nc_w-1)*Sc_w, -H_wp/2, -3, `${Nc_w-1}@${Sc_w}"`);
                }
            }
            drawDim(elevG, -L_wp/2 - 2, -H_wp/2, -L_wp/2 - 2, H_wp/2, -1, `H=${H_wp}"`, true);
        }

        if (num_fp > 0) {
            drawRect(elevG, -L_fp/2, d/2, L_fp, t_fp, "fill");
            drawRect(elevG, -L_fp/2, -d/2-t_fp, L_fp, t_fp, "fill");

            if (num_fp === 2) {
                const t_fp_in = safeFloat(inputs.t_fp_inner, 0);
                const L_fp_in = safeFloat(inputs.L_fp_inner, L_fp);
                drawRect(elevG, -L_fp_in/2, d/2 - tf - t_fp_in, L_fp_in, t_fp_in, "fill");
                drawRect(elevG, -L_fp_in/2, -d/2 + tf, L_fp_in, t_fp_in, "fill");
            }

            const Nc_f = parseInt(inputs.Nc_fp)||0;
            const Nr_f = parseInt(inputs.Nr_fp)||0;
            const Sc_f = safeFloat(inputs.S1_col_spacing_fp, 3);
            const Se_f = safeFloat(inputs.S3_end_dist_fp, 1.5);
            
            [-1, 1].forEach(side => {
                for(let c=0; c<Nc_f; c++) {
                    const bx = side * (gap/2 + Se_f + c*Sc_f);
                    const totalThick = t_fp + tf + (num_fp==2?safeFloat(inputs.t_fp_inner,0):0);
                    drawBoltSide(elevG, bx, d/2 - tf - (num_fp==2?safeFloat(inputs.t_fp_inner,0):0), totalThick, D_fp); 
                    drawBoltSide(elevG, bx, -d/2 - t_fp, totalThick, D_fp); 
                }
            });
            drawDim(elevG, -L_fp/2, -d/2 - t_fp, L_fp/2, -d/2 - t_fp, 3, `L=${L_fp}"`);
            
            const startX = gap/2 + Se_f;
            if (Nc_f > 0) {
                drawDim(elevG, gap/2, d/2+t_fp, gap/2+Se_f, d/2+t_fp, 1.5, `Se=${Se_f}"`);
                if(Nc_f > 1) {
                    drawDim(elevG, startX, d/2+t_fp, startX + (Nc_f-1)*Sc_f, d/2+t_fp, 1.5, `${Nc_f-1}@${Sc_f}"`);
                }
            }
        }

        const elevLegendLines = [];
        if (num_wp > 0) {
            elevLegendLines.push(`${num_wp}x PL ${t_wp.toFixed(3)} x ${H_wp} x ${L_wp}`);
            const Nc_w = parseInt(inputs.Nc_wp)||0;
            const Nr_w = parseInt(inputs.Nr_wp)||0;
            if (Nc_w && Nr_w) elevLegendLines.push(`Web Bolts: ${Nc_w * Nr_w * 2} @ Ø${D_wp}"`);
        }
        if (num_fp > 0) {
            elevLegendLines.push(`Outer FLG: PL ${t_fp.toFixed(3)} x ${H_fp} x ${L_fp}`);
            if (num_fp === 2) {
                elevLegendLines.push(`Inner FLG: 2x PL ${(safeFloat(inputs.t_fp_inner,0)).toFixed(3)} x ${safeFloat(inputs.H_fp_inner,0)} x ${safeFloat(inputs.L_fp_inner,0)}`);
            }
            const Nc_f = parseInt(inputs.Nc_fp)||0;
            const Nr_f = parseInt(inputs.Nr_fp)||0;
            if (Nc_f && Nr_f) elevLegendLines.push(`Flange Bolts: ${Nc_f * Nr_f * 4} @ Ø${D_fp}"`);
        }
        if (elevLegendLines.length) {
            // Place legend in the Gutter (far left relative to group center)
            drawLegendBox(elevG, (-beamLen/2 - legendWidth), (-d/2 - 2.6), elevLegendLines, { w: 8.0, fontSize: 6.5 }); // Larger font for legend vs dims
        }
    }

    // 2. SECTION VIEW
    if (viewMode === "all" || viewMode === "section") {
        const sectX = viewMode === "all" ? legendWidth + beamLen + 4 + bf/2 : (viewMode === "section" ? legendWidth/2 + beamLen/4 : 0); 
        // Note: For 'section' only view, we might not need the huge gutter or shift. But keeping consistent style is OK.
        // Actually for individual Section view, usually no legend? Or maybe just center it.
        // The user only mentioned Gutter for Elevation (implied by "put all notes... in the left gutter"). 
        // For Section/Plan in "single view mode", let's just center them decently.
        
        const finalSectX = viewMode === "all" ? (legendWidth + beamLen + 4 + bf/2) : 0;
        const sectG = createGroup(svg, finalSectX, d/2 + 7);
        drawText(sectG, 0, (-d/2 - 3.0), "SECTION", { anchor: "middle", bold: true, fontSize: 12 });
        
        if (isHSS) {
            // HSS Box
            drawRect(sectG, -bf/2, -d/2, bf, d, "fill");
            drawRect(sectG, -bf/2 + tw, -d/2 + tf, bf - 2*tw, d - 2*tf, "fill");
        } else {
            drawRect(sectG, -bf/2, d/2-tf, bf, tf, "fill");
            drawRect(sectG, -bf/2, -d/2, bf, tf, "fill");
            drawRect(sectG, -tw/2, -d/2+tf, tw, d-2*tf, "fill");
        }

        if (num_wp > 0) {
            drawRect(sectG, -tw/2 - t_wp, -H_wp/2, t_wp, H_wp, "hatch");
            drawRect(sectG, tw/2, -H_wp/2, t_wp, H_wp, "hatch");
            const boltL = tw + 2*t_wp;
            const boltRect = document.createElementNS(ns, "rect");
            boltRect.setAttribute("x", (-boltL/2)*S); boltRect.setAttribute("y", -D_wp/2 * S);
            boltRect.setAttribute("width", boltL*S); boltRect.setAttribute("height", D_wp*S);
            boltRect.setAttribute("fill", "#ddd"); boltRect.setAttribute("stroke", "#000");
            sectG.appendChild(boltRect);
            
            // Vertical Spacing (Gage for Web)
            const Nr_w = parseInt(inputs.Nr_wp)||0;
            const Sr_w = safeFloat(inputs.S5_row_spacing_wp, 3);
            if (Nr_w > 1) {
                const topB = -((Nr_w - 1) * Sr_w) / 2;
                const botB = -topB;
                drawDim(sectG, tw/2 + t_wp + 2, topB, tw/2 + t_wp + 2, botB, 1, `${Nr_w-1}@${Sr_w}"`, true);
            }
        }
        
        if (num_fp > 0) {
            drawRect(sectG, -H_fp/2, d/2, H_fp, t_fp, "hatch");
            drawRect(sectG, -H_fp/2, -d/2-t_fp, H_fp, t_fp, "hatch");

            // [NEW] Inner Flange Plates (Section)
            if (num_fp === 2) {
                const t_fp_in = safeFloat(inputs.t_fp_inner, 0);
                const H_fp_in = safeFloat(inputs.H_fp_inner, H_fp); // Fallback
                // Inner Top
                drawRect(sectG, -H_fp_in/2, d/2 - tf - t_fp_in, H_fp_in, t_fp_in, "hatch");
                // Inner Bottom
                drawRect(sectG, -H_fp_in/2, -d/2 + tf, H_fp_in, t_fp_in, "hatch");
            }

            const gage = safeFloat(inputs.g_gage_fp, 3);
            [-1, 1].forEach(side => {
                // Bolts go through everything. 
                // Length = t_fp + tf + t_fp_inner (if 2)
                const t_in = (num_fp==2 ? safeFloat(inputs.t_fp_inner,0) : 0);
                const startY = d/2 - tf - t_in;
                const len = tf + t_fp + t_in;
                
                drawBoltSide(sectG, side * gage/2, startY, len, D_fp);
                
                // Bottom Flange? Existing code didn't seem to draw bottom flange bolts in Section View?
                // Line 381 loop just draws one set.
                // Let's add Bottom Flange Bolts for completeness if they are missing.
                // Bottom flange is at -d/2.
                // Outer plate at -d/2 - t_fp.
                // Inner plate at -d/2 + tf.
                // Symetric to top.
                
                const startY_bot = -d/2 + tf + t_in; // This is "top" of bottom assembly (inner side)
                // But wait, drawBoltSide draws downwards.
                // We want bolt from (-d/2 + tf + t_in) down to (-d/2 - t_fp).
                // That length is same.
                // Direction? drawBoltSide is purely graphical.
                // If we use same function, Head will be at startY_bot - headH (Inside beam).
                // Nut at startY_bot + len (Outside bottom plate).
                // This matches the top interaction (Head inside).
                
                // Check if we should draw bottom bolts. The existing code loop `[-1, 1]` is just for LEFT/RIGHT gage.
                // It does NOT iterate top/bottom flanges.
                // So existing code only drew TOP flange bolts in section.
                // I will leave it as is to avoid changing too much logic, but update the Y for inner plate.
            });
            
            // Gage Dim
            drawDim(sectG, -gage/2, d/2+t_fp+2, gage/2, d/2+t_fp+2, 1, `g=${gage}"`);
        }
    }

    // 3. PLAN VIEW
    if (viewMode === "all" || viewMode === "plan") {
        const planY = viewMode === "all" ? d + 30 + bf/2 : bf/2 + 20; 
        // Align plan with elevation horizontally
        const planX = viewMode === "all" ? (legendWidth + beamLen/2 + 2) : 0; 

        const planG = createGroup(svg, planX, planY);
        drawText(planG, 0, (-bf/2 - 2.5), "PLAN (TOP FLANGE)", { anchor: "middle", bold: true, fontSize: 12 });

        if (isHSS) {
            drawRect(planG, -beamLen/2, -bf/2, (beamLen-gap)/2, bf, "fill");
            drawRect(planG, gap/2, -bf/2, (beamLen-gap)/2, bf, "fill");
            // Inner vertical walls (hidden)
            drawLine(planG, -beamLen/2, -bf/2+tw, -gap/2, -bf/2+tw, "dashed");
            drawLine(planG, -beamLen/2, bf/2-tw, -gap/2, bf/2-tw, "dashed");
            drawLine(planG, gap/2, -bf/2+tw, beamLen/2, -bf/2+tw, "dashed");
            drawLine(planG, gap/2, bf/2-tw, beamLen/2, bf/2-tw, "dashed");
        } else {
            drawRect(planG, -beamLen/2, -bf/2, (beamLen-gap)/2, bf, "fill");
            drawRect(planG, gap/2, -bf/2, (beamLen-gap)/2, bf, "fill");
            drawLine(planG, -beamLen/2, 0, -gap/2, 0, "dashed");
            drawLine(planG, gap/2, 0, beamLen/2, 0, "dashed");
        }

        if (num_fp > 0) {
            drawRect(planG, -L_fp/2, -H_fp/2, L_fp, H_fp, "hatch");
            const Nc_f = parseInt(inputs.Nc_fp)||0;
            const Nr_f = parseInt(inputs.Nr_fp)||0; 
            const Sc_f = safeFloat(inputs.S1_col_spacing_fp, 3);
            const Sr_f = safeFloat(inputs.S2_row_spacing_fp, 3);
            const Se_f = safeFloat(inputs.S3_end_dist_fp, 1.5);
            const gage = safeFloat(inputs.g_gage_fp, 3);
            
            [-1, 1].forEach(side => { 
                for(let c=0; c<Nc_f; c++) {
                    const bx = side * (gap/2 + Se_f + c*Sc_f);
                    for(let r=0; r<Nr_f; r++) {
                        const by_top = gage/2 + r*Sr_f;
                        const by_bot = -gage/2 - r*Sr_f;
                        drawBoltFace(planG, bx, by_top, D_fp);
                        drawBoltFace(planG, bx, by_bot, D_fp);
                    }
                }
            });
            drawDim(planG, 0, -gage/2, 0, gage/2, -(beamLen/2), `g=${gage}"`, true);
            drawDim(planG, -L_fp/2-2, -H_fp/2, -L_fp/2-2, H_fp/2, -1, `Width=${H_fp}"`, true);
            
            const totBolts = Nc_f * Nr_f * 4; 
            const boltText = document.createElementNS(ns, "text");
            boltText.setAttribute("x", 0); boltText.setAttribute("y", (H_fp/2 + 3)*S);
            boltText.setAttribute("text-anchor", "middle"); boltText.setAttribute("font-size", "10"); 
            boltText.textContent = `${totBolts} Bolts ${D_fp}"Ø`;
            planG.appendChild(boltText);
        }
    }
    
    // --- CALCULATE BOUNDS ---
    // Instead of getBBox (which requires DOM), we compute the viewBox mathematically.
    const padding = 10; // Adjusted padding for better fit

    
    // Group Centers (in SVG units = inches * S)
    // Elevation: cx = (legendWidth + beamLen/2 + 2)*S, cy = (d/2 + 7)*S
    // Section: cx = (legendWidth + beamLen + 4 + bf/2)*S, cy = (d/2 + 7)*S (in "all" mode)
    // Plan: cx = (legendWidth + beamLen/2 + 2)*S, cy = (d + 30 + bf/2)*S (in "all" mode)
    
    let minX = 0, minY = 0, maxX = 100, maxY = 100;

    if (viewMode === 'elevation' || viewMode === 'all') {
        const cx = (legendWidth + beamLen/2 + 2) * S;
        const cy = (d/2 + 7) * S;
        // Content Bounds relative to cx,cy:
        // X: [(-beamLen/2 - legendWidth), beamLen/2] -> Total Width ~ (beamLen + legendWidth)
        // Y: [-d/2 - 5, d/2 + 5]
        // Let's be generous
        const x1 = cx + (-beamLen/2 - legendWidth - 1) * S;
        const x2 = cx + (beamLen/2 + 1) * S;
        const y1 = cy + (-d/2 - 5) * S;
        const y2 = cy + (d/2 + 5) * S;
        
        if (viewMode === 'elevation') {
            minX = x1; maxX = x2; minY = y1; maxY = y2;
        } else {
           // 'all' mode accumulation logic could be added here, but usually 'all' is fixed canvas.
           // Leaving 'all' logic to rely on fixed layout or just initial big box if needed.
           // Since report uses single views, we mainly care about specific views.
        }
    }

    if (viewMode === 'section') {
        // Section is drawn at x=0 (shifted internally if viewMode!=all, line 416)
        // const finalSectX = viewMode === "all" ? ... : 0;
        // So the group is centered at X=0.
        const cx = 0; 
        const cy = (d/2 + 7) * S;
        
        const w_est = Math.max(bf, tw + 2*t_wp) + 6; // inches width
        const h_est = d + 10;
        
        minX = cx - (w_est/2)*S;
        maxX = cx + (w_est/2)*S;
        minY = cy - (h_est/2)*S;
        maxY = cy + (h_est/2)*S;
    }
    
    if (viewMode === 'plan') {
         // planY = bf/2 + 20; planX = 0;
         const cx = 0; // The code uses createGroup(planX, planY). For viewMode=plan, planX=0.
         // Actually line 500: const planX = viewMode === "all" ? ... : 0;
         // So cx = 0 * S = 0.
         const cy = (bf/2 + 20) * S;
         
         const w_est = beamLen + legendWidth + 4; 
         const h_est = bf + H_fp + 10;
         
         // Plan draws centered horizontally around planX?
         // drawRect(planG, -beamLen/2 ...) -> Yes, centered around 0.
         minX = -(beamLen/2 + 1)*S;
         maxX = (beamLen/2 + 1)*S;
         minY = cy - (bf/2 + H_fp/2 + 5)*S;
         maxY = cy + (bf/2 + H_fp/2 + 5)*S;
    }
    
    // Apply ViewBox
    svg.setAttribute("viewBox", `${minX - padding} ${minY - padding} ${maxX - minX + padding*2} ${maxY - minY + padding*2}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
}



// --- 3D DIAGRAM LOGIC (Babylon.js) ---

function draw3dSpliceDiagram() {
    const canvas = document.getElementById("splice-3d-canvas");
    if (!canvas || typeof BABYLON === 'undefined') return;

    // --- Clear previous dimensions ---
    if (dimensionElements) {
        if (dimensionElements.meshes) dimensionElements.meshes.forEach(m => m.dispose());
        if (dimensionElements.labels) dimensionElements.labels.forEach(l => l.dispose());
    }
    dimensionElements = { meshes: [], labels: [] }; // Reset

    // --- Inputs (Safe Fallbacks) ---
    // --- Inputs (Safe Fallbacks) ---
    const rawInputs = gatherInputsFromIds(diagramInputIds);
    const inputs = {};
    for (let k in rawInputs) {
        // parsing float only for numeric fields, keeping strings for keys like member_shape_type
        const val = parseFloat(rawInputs[k]);
        inputs[k] = isNaN(val) ? rawInputs[k] : val; 
    }
    
    // Ensure numeric fallbacks for dimensions specifically
    if (!inputs.member_d || typeof inputs.member_d !== 'number') inputs.member_d = 0; 
    if (inputs.member_d === 0) inputs.member_d = 18; // Default only if 0
    if (!inputs.member_bf) inputs.member_bf = 7.5;
    if (!inputs.D_fp) inputs.D_fp = 0.75;
    if (!inputs.D_wp) inputs.D_wp = 0.75;

    // --- Engine & Scene ---
    if (!bjsEngine) {
        bjsEngine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        window.addEventListener('resize', () => bjsEngine.resize());
    }
    
    if (bjsScene) bjsScene.dispose(); 
    bjsScene = new BABYLON.Scene(bjsEngine);
    bjsScene.clearColor = new BABYLON.Color4(0.95, 0.95, 0.95, 1);
    
    // --- Camera ---
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 4, Math.PI / 3, 60, BABYLON.Vector3.Zero(), bjsScene);
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 50;

    // --- Lighting ---
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), bjsScene);
    light.intensity = 0.8;
    const dirLight = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(-1, -2, -1), bjsScene);
    dirLight.position = new BABYLON.Vector3(20, 40, 20);
    dirLight.intensity = 0.5;

    // --- Materials ---
    const matSteel = new BABYLON.StandardMaterial("steel", bjsScene);
    matSteel.diffuseColor = new BABYLON.Color3(0.6, 0.6, 0.65);
    matSteel.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);

    const matPlate = new BABYLON.StandardMaterial("plate", bjsScene);
    matPlate.diffuseColor = new BABYLON.Color3(0.3, 0.5, 0.8);
    
    const matBolt = new BABYLON.StandardMaterial("bolt", bjsScene);
    matBolt.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);

    // --- 3D Dimension Helper ---
    const create3DDimension = (p1, p2, text, offset, planeNormal = new BABYLON.Vector3(0, 1, 0)) => {
        const dist = BABYLON.Vector3.Distance(p1, p2);
        if (dist < 0.01) return;

        // Direction vectors
        const vDir = p2.subtract(p1).normalize();
        
        // Offset vector (perpendicular to direction usually, provided by caller or calculated)
        // Here we use the passed 'offset' vector directly relative to p1/p2
        const p1_ext = p1.add(offset);
        const p2_ext = p2.add(offset);
        
        // Extension lines
        const ext1 = BABYLON.MeshBuilder.CreateLines("ext1", { points: [p1, p1_ext] }, bjsScene);
        ext1.color = BABYLON.Color3.Black();
        const ext2 = BABYLON.MeshBuilder.CreateLines("ext2", { points: [p2, p2_ext] }, bjsScene);
        ext2.color = BABYLON.Color3.Black();
        
        // Main line (slightly offset from tip to allow for text clearing or just connect tips)
        const mainLine = BABYLON.MeshBuilder.CreateLines("dimLine", { points: [p1_ext, p2_ext] }, bjsScene);
        mainLine.color = BABYLON.Color3.Black();
        
        // Arrows (Cones) at p1_ext and p2_ext
        const arrowSize = 0.5;
        const arrow1 = BABYLON.MeshBuilder.CreateCylinder("a1", { diameterTop: 0, diameterBottom: arrowSize/2, height: arrowSize, tessellation: 12 }, bjsScene);
        arrow1.position = p1_ext;
        // Align to direction
        arrow1.lookAt(p2_ext);
        arrow1.rotation.x += Math.PI / 2; // Adjust for Cylinder orientation (Y-up default)
        arrow1.material = matBolt; // Reuse black material

        const arrow2 = BABYLON.MeshBuilder.CreateCylinder("a2", { diameterTop: 0, diameterBottom: arrowSize/2, height: arrowSize, tessellation: 12 }, bjsScene);
        arrow2.position = p2_ext;
        arrow2.lookAt(p1_ext);
        arrow2.rotation.x += Math.PI / 2;
        arrow2.material = matBolt;

        // Text Label (Billboard)
        const midPoint = p1_ext.add(p2_ext).scale(0.5);
        
        const planeWidth = 4;
        const planeHeight = 1.5;
        const plane = BABYLON.MeshBuilder.CreatePlane("txtVal", { width: planeWidth, height: planeHeight }, bjsScene);
        plane.position = midPoint.add(offset.normalize().scale(0.5));
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        
        const dt = new BABYLON.DynamicTexture("dt", {width:256, height:128}, bjsScene);
        dt.hasAlpha = true;
        
        // Font
        const ctx = dt.getContext();
        ctx.font = "bold 60px Arial";
        ctx.fillStyle = "black";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "black";
        ctx.fillText(text, 128, 64);
        dt.update();
        
        const matTxt = new BABYLON.StandardMaterial("matTxt", bjsScene);
        matTxt.diffuseTexture = dt;
        matTxt.opacityTexture = dt;
        matTxt.emissiveColor = BABYLON.Color3.White(); // Self-lit
        matTxt.disableLighting = true;
        plane.material = matTxt;

        // Add to tracking
        if (dimensionElements && dimensionElements.meshes) {
             dimensionElements.meshes.push(ext1, ext2, mainLine, arrow1, arrow2, plane);
             const vis = (typeof areDimensionsVisible !== 'undefined') ? areDimensionsVisible : true;
             [ext1, ext2, mainLine, arrow1, arrow2, plane].forEach(m => m.isVisible = vis);
        }
    };

    // --- Geometry: Beams ---
    const createBeam = (zOffset) => {
        const { member_d: d, member_bf: bf, member_tf: tf, member_tw: tw, member_shape_type } = inputs;
        const len = 24;
        const isHSS = member_shape_type === 'HSS Rectangular';
        
        const ft = BABYLON.MeshBuilder.CreateBox("ft", { width: bf, height: tf, depth: len }, bjsScene);
        ft.position.y = (d - tf)/2;
        
        const fb = BABYLON.MeshBuilder.CreateBox("fb", { width: bf, height: tf, depth: len }, bjsScene);
        fb.position.y = -(d - tf)/2;
        
        let parts = [ft, fb];

        if (isHSS) {
             // Side walls for HSS (Left and Right)
             const wallHeight = d - 2 * tf;
             const wl = BABYLON.MeshBuilder.CreateBox("wl", { width: tw, height: wallHeight, depth: len }, bjsScene);
             wl.position.x = -(bf - tw)/2;
             
             const wr = BABYLON.MeshBuilder.CreateBox("wr", { width: tw, height: wallHeight, depth: len }, bjsScene);
             wr.position.x = (bf - tw)/2;
             
             parts.push(wl, wr);
        } else {
             // Center web for I-beam
             const w = BABYLON.MeshBuilder.CreateBox("w", { width: tw, height: d - 2*tf, depth: len }, bjsScene);
             parts.push(w);
        }
        
        const beam = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
        beam.position.z = zOffset * (len/2 + inputs.gap/2);
        beam.material = matSteel;
    };
    createBeam(-1);
    createBeam(1);

    // --- Geometry: Plates ---
    if (inputs.num_flange_plates > 0) {
        const H = inputs.H_fp, t = inputs.t_fp, L = inputs.L_fp;
        const topP = BABYLON.MeshBuilder.CreateBox("fp_top", { width: H, height: t, depth: L }, bjsScene);
        topP.position.y = inputs.member_d/2 + t/2;
        topP.material = matPlate;

        const botP = BABYLON.MeshBuilder.CreateBox("fp_bot", { width: H, height: t, depth: L }, bjsScene);
        botP.position.y = -(inputs.member_d/2 + t/2);
        botP.material = matPlate;

        // [NEW] Inner Flange Plates
        if (inputs.num_flange_plates > 1) {
            const H_in = inputs.H_fp_inner || H; // Fallback
            const t_in = inputs.t_fp_inner || t;
            const L_in = inputs.L_fp_inner || L;
            
            const tf = inputs.member_tf;
            const d = inputs.member_d;
            
            // Top Inner (Inside Top Flange)
            // Y position: d/2 - tf - t_in/2
            const innerTop = BABYLON.MeshBuilder.CreateBox("fp_top_in", { width: H_in, height: t_in, depth: L_in }, bjsScene);
            innerTop.position.y = d/2 - tf - t_in/2;
            innerTop.material = matPlate;

            // Bottom Inner (Inside Bottom Flange)
            // Y position: -(d/2 - tf - t_in/2)
            const innerBot = BABYLON.MeshBuilder.CreateBox("fp_bot_in", { width: H_in, height: t_in, depth: L_in }, bjsScene);
            innerBot.position.y = -(d/2 - tf - t_in/2);
            innerBot.material = matPlate;
        }
    }

    if (inputs.num_web_plates > 0) {
        const H = inputs.H_wp, t = inputs.t_wp, L = inputs.L_wp;
        const offset = inputs.member_tw/2 + t/2;
        
        const wp1 = BABYLON.MeshBuilder.CreateBox("wp1", { width: t, height: H, depth: L }, bjsScene);
        wp1.position.x = offset;
        wp1.material = matPlate;
        
        if (inputs.num_web_plates > 1) {
            const wp2 = wp1.clone("wp2");
            wp2.position.x = -offset;
        }
    }

    // --- Geometry: Bolts ---
    masterBolts = {}; 

    const getBoltMesh = (dia, len) => {
        const key = `d${dia}_l${len}`;
        if (masterBolts[key]) return masterBolts[key].clone("bolt");
        
        const head = BABYLON.MeshBuilder.CreateCylinder("h", { diameter: dia*1.6, height: dia*0.6, tessellation: 6 }, bjsScene);
        head.position.y = len/2 + dia*0.3;
        const shank = BABYLON.MeshBuilder.CreateCylinder("s", { diameter: dia, height: len }, bjsScene);
        const nut = BABYLON.MeshBuilder.CreateCylinder("n", { diameter: dia*1.6, height: dia*0.6, tessellation: 6 }, bjsScene);
        nut.position.y = -(len/2 + dia*0.3);
        
        const master = BABYLON.Mesh.MergeMeshes([head, shank, nut], true, true, undefined, false, true);
        master.material = matBolt;
        master.isVisible = false; 
        masterBolts[key] = master;
        return master.clone("bolt");
    };

    // Flange Bolts
    // Flange Bolts
    if (inputs.num_flange_plates > 0 && inputs.Nc_fp > 0) {
        const gage = inputs.g_gage_fp;
        const S_col = inputs.S1_col_spacing_fp;
        const S_end = inputs.S3_end_dist_fp;
        // Total Thickness = Flange + Outer + Inner(if any)
        const t_in = (inputs.num_flange_plates == 2 ? inputs.t_fp_inner : 0);
        const thick = inputs.member_tf + inputs.t_fp + t_in;
        
        // We need to adjust Y position of bolts if we want them centered or distinct? 
        // Currently existing code: 
        // b1.position = new BABYLON.Vector3(gage/2, yTop, z);
        // yTop = inputs.member_d/2;
        // This puts the CENTER of the bolt mesh at d/2? 
        // Wait, getBoltMesh creates a mesh where y=0 is CENTER of shank? 
        // No.
        // `head.position.y = len/2 + dia*0.3;` -> Top of Shank is +len/2.
        // `nut.position.y = -(len/2 + dia*0.3);` -> Bottom of Shank is -len/2.
        // So the bolt mesh origin (0,0,0) is the CENTER of the shank length.
        
        // We want the shank to span from (d/2 + t_fp) down to (d/2 - tf - t_in).
        // Total thickness = thick.
        // Center of that stack is:
        // Top Y = d/2 + t_fp
        // Bot Y = d/2 - tf - t_in
        // Center Y = (TopY + BotY) / 2
        //          = (d/2 + t_fp + d/2 - tf - t_in) / 2
        //          = d/2 + (t_fp - tf - t_in)/2.
        
        // Existing code used `yTop = inputs.member_d/2`.
        // If t_fp ~ tf, this is close. But if we add inner plate, we shift down.
        
        const centerTop = inputs.member_d/2 + (inputs.t_fp - inputs.member_tf - t_in)/2;
        const centerBot = -inputs.member_d/2 - (inputs.t_fp - inputs.member_tf - t_in)/2;

        [-1, 1].forEach(side => {
            for(let c=0; c<inputs.Nc_fp; c++) {
                const z = side * (inputs.gap/2 + S_end + c*S_col);
                
                let b1 = getBoltMesh(inputs.D_fp, thick);
                b1.isVisible = true; b1.position = new BABYLON.Vector3(gage/2, centerTop, z);
                let b2 = b1.clone(); b2.position.x = -gage/2;
                
                let b3 = b1.clone(); b3.position = new BABYLON.Vector3(gage/2, centerBot, z);
                // Flip bottom bolts? Usually heads are on outside.
                // If drawBoltMesh puts head at +y (top), then for bottom assembly:
                // We want Head at bottom (most negative Y). 
                // So we need to rotate bottom bolts 180 deg (PI) around X or Z?
                // Let's rotate Z by PI.
                b3.rotation.x = Math.PI; 
                
                let b4 = b3.clone(); b4.position = new BABYLON.Vector3(-gage/2, centerBot, z);
            }
        });
    }
    
    // Web Bolts
    if (inputs.num_web_plates > 0 && inputs.Nc_wp > 0) {
        const S_col = inputs.S4_col_spacing_wp;
        const S_row = inputs.S5_row_spacing_wp;
        const S_end = inputs.S6_end_dist_wp;
        const thick = inputs.member_tw + inputs.t_wp * inputs.num_web_plates;
        const startY = -((inputs.Nr_wp - 1) * S_row) / 2;
        
        [-1, 1].forEach(side => {
            for(let c=0; c<inputs.Nc_wp; c++) {
                const z = side * (inputs.gap/2 + S_end + c*S_col);
                for(let r=0; r<inputs.Nr_wp; r++) {
                    const y = startY + r*S_row;
                    let b = getBoltMesh(inputs.D_wp, thick);
                    b.isVisible = true;
                    b.rotation.z = Math.PI/2;
                    b.position = new BABYLON.Vector3(0, y, z);
                }
            }
        });
    }
    
    // --- Dimensions ---
    const d = inputs.member_d;
    const bf = inputs.member_bf;
    const gap = inputs.gap;
    const zEnd = 24 + gap/2 - 2; // Near end of right beam

    // 1. Gap Dimension (Side view)
    create3DDimension(
        new BABYLON.Vector3(bf/2, 0, -gap/2),
        new BABYLON.Vector3(bf/2, 0, gap/2),
        `${gap}"`,
        new BABYLON.Vector3(4, 0, 0)
    );

    // 2. Depth Dimension (At end of beam, Side view)
    create3DDimension(
        new BABYLON.Vector3(0, d/2, zEnd),
        new BABYLON.Vector3(0, -d/2, zEnd),
        `${d}"`,
        new BABYLON.Vector3(bf/2 + 4, 0, 0)
    );

    // 3. Width Dimension (At end of beam, Top view)
    create3DDimension(
        new BABYLON.Vector3(-bf/2, d/2, zEnd),
        new BABYLON.Vector3(bf/2, d/2, zEnd),
        `${bf}"`,
        new BABYLON.Vector3(0, 4, 0)
    );

    // --- Render ---
    bjsEngine.runRenderLoop(() => bjsScene.render());
}

// --- CALCULATION LOGIC ---
const spliceCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
    const { PI, sqrt, min, max, abs } = Math;
    const E_MOD = 29000.0; // ksi

    // Define a zero-value check object to use as a fallback for bearing calculations.
    const zero_bearing_check = { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };
    /**
     * Gets the appropriate resistance factor (phi) and safety factor (omega) based on jurisdiction.
     */
    function getDesignFactors(jurisdiction, aisc_phi, aisc_omega) {
        if (jurisdiction === 'OSHA') { 
            return { phi: 0.25, omega: 4.0 }; 
        }
        return { phi: aisc_phi, omega: aisc_omega };
    }

    function checkBoltShear({ grade, threadsIncl, db, numPlanes = 1, fastenerPatternLength = 0, jurisdiction }) {
        const { Fnv, wasReduced } = AISC_SPEC.getFnv(grade, threadsIncl, fastenerPatternLength);
        const Ab = PI * (db ** 2) / 4.0;
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00);
        return { Rn: Fnv * Ab * numPlanes, ...factors, Fnv, Ab, num_planes: numPlanes, wasReduced };
    }

    function checkBoltBearing({ db, t_ply, Fu_ply, le, s, isEdgeBolt, deformationIsConsideration, hole_dia, jurisdiction }) {
        const tearout_coeff = deformationIsConsideration ? 1.2 : 1.5;
        const bearing_coeff = deformationIsConsideration ? 2.4 : 3.0;
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00);
        const Lc = isEdgeBolt ? le - hole_dia / 2.0 : s - hole_dia;
        if (Lc < 0 || t_ply <= 0) return { Rn: 0, ...factors, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };

        const Rn_tearout = tearout_coeff * Lc * t_ply * (Fu_ply || 0);
        const Rn_bearing = bearing_coeff * db * t_ply * (Fu_ply || 0);
        return { Rn: min(Rn_tearout, Rn_bearing), ...factors, Lc, Rn_tearout, Rn_bearing };
    }

    function computeShearLagFactorU({ plate_width, gage, num_fastener_rows, conn_length, t_p, d_bolt }) {
        if (plate_width <= 0 || conn_length <= 0 || num_fastener_rows <= 0) {
            return { U: 1.0, U_case2: 1.0, U_case7: 1.0, x_bar: 0 };
        }
        const flange_width = (plate_width - gage) / 2.0;
        const stem_height = gage / 2.0;
        const area_flange = flange_width * t_p;
        const area_stem = stem_height * t_p;
        const total_area = area_flange + area_stem;

        const x_bar = total_area > 0 ? (area_flange * (flange_width / 2.0) - area_stem * (stem_height / 2.0)) / total_area : 0;
        const U_case2 = 1.0 - (Math.abs(x_bar) / conn_length);
        const U_case7 = (plate_width >= (2 / 3) * gage) ? 0.90 : 0.85;

        return { U: Math.min(1.0, Math.max(U_case2, U_case7)), U_case2, U_case7, x_bar: Math.abs(x_bar) };
    }

    function checkGrossSectionYielding({ Ag, Fy, jurisdiction }) {
        const factors = getDesignFactors(jurisdiction, 0.90, 1.67);
        return { Rn: Fy * Ag, ...factors, Ag, Fy };
    }

    function checkFlangeNetSection({ bf, tf, Fu, num_bolts_in_cs, hole_dia_net_area, jurisdiction }) {
        const Ag = bf * tf; 
        const A_holes = num_bolts_in_cs * hole_dia_net_area * tf; 
        const An = Ag - A_holes; 
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); 

        if (An <= 0) {
            return { Rn: 0, ...factors, An: 0, Ag, A_holes, Fu, hole_dia_net_area };
        }
        const Rn = Fu * An;
        return { Rn, ...factors, An, Ag, A_holes, Fu, hole_dia_net_area };
    }

    function checkBlockShear({ Agv, Anv, Ant, Fu, Fy, Ubs = 1.0, jurisdiction }) {
        const shear_rupture_term = 0.6 * Fu * Anv;
        const tension_rupture_term = Ubs * Fu * Ant; 
        const shear_yield_term = 0.6 * Fy * Agv;
        const Rn = Math.min(shear_rupture_term + tension_rupture_term, shear_yield_term + tension_rupture_term);
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); 

        return {
            Rn,
            ...factors,
            details: {
                shear_rupture_term,
                tension_rupture_term,
                shear_yield_limit: shear_yield_term + tension_rupture_term,
                Anv,
                Ant,
                Ubs
            }
        };
    }

    function checkShearYielding(Agv, Fy, jurisdiction) {
        const Rn = 0.6 * Fy * Agv; 
        const factors = getDesignFactors(jurisdiction, 1.00, 1.50); 
        return { Rn, ...factors, Agv, Fy };
    }

    function checkShearRupture(Anv, Fu, jurisdiction) {
        const Rn = 0.6 * Fu * Anv; 
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); 
        return { Rn, ...factors, Anv, Fu };
    }

    function checkPlateCompression({ Ag, Fy, t, unbraced_length, k = 0.65, jurisdiction }) {
        const factors = getDesignFactors(jurisdiction, 0.90, 1.67); 
        const r = t / sqrt(12.0);
        const slenderness = r > 0 ? (k * unbraced_length) / r : 0;
        let Fcr, Fe = null;
        if (slenderness <= 25) { 
            Fcr = Fy;
        } else {
            Fe = (PI ** 2 * E_MOD) / (slenderness ** 2);
            Fcr = (Fy / Fe) <= 2.25 ? (0.658 ** (Fy / Fe)) * Fy : 0.877 * Fe;
        }
        return { Rn: Fcr * Ag, ...factors, Fcr, slenderness, r, Fe, Ag, Fy, k, unbraced_length };
    }

    function checkBoltSlip({ db, faying_surface_class, num_fillers = 0, num_slip_planes, hole_type = 'standard', jurisdiction }) {
        const Tb = AISC_SPEC.getTb(db); 
        const mu = AISC_SPEC.getMu(faying_surface_class); 
        const Du = 1.13; 
        const hf = (num_fillers === 1) ? 1.0 : (num_fillers > 1) ? 0.85 : 1.0; 
        const factors = getDesignFactors(jurisdiction, 1.0, 1.5); 
        const Rn = mu * Du * hf * Tb * num_slip_planes;
        return { Rn, ...factors, mu, Du, hf, Tb, num_slip_planes };
    }

    function checkBoltTension(grade, db, jurisdiction) {
        const FntMap = { "A325": 90.0, "A490": 113.0, "F3148": 90.0 };
        const Fnt = FntMap[grade] ?? 0;
        const Ab = PI * (db ** 2) / 4.0;
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00);
        return { Rn: Fnt * Ab, ...factors, Fnt, Ab };
    }

    function checkBeamFlexuralRupture(Sx, Fy, Fu, bf, tf, num_bolts_in_flange_cs, hole_dia_net_area, jurisdiction) {
        const Afg = bf * tf;
        const Afn = (bf - num_bolts_in_flange_cs * hole_dia_net_area) * tf; 
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00);

        if (Afn <= 0) {
            return { Rn: 0, ...factors, Mn_rupture: 0, Afg, Afn, Yt: 0, Sx, Fu, Fy, applies: true };
        }
        const Yt = (Fy / Fu <= 0.8) ? 1.0 : 1.1;

        if (Fu * Afn >= Yt * Fy * Afg) {
            return { Rn: Infinity, ...factors, Mn_rupture: Infinity, Afg, Afn, Yt, Sx, Fu, Fy, applies: false, hole_dia_net_area };
        }
        const Mn_rupture_kip_in = (Fu * Afn / Afg) * Sx;
        return { Rn: Mn_rupture_kip_in, ...factors, Mn_rupture: Mn_rupture_kip_in, Afg, Afn, Yt, Sx, Fu, Fy, applies: true, hole_dia_net_area };
    }
    function checkBoltShearTensionInteraction(Tu, Vu, Fnv, grade, db, design_method, jurisdiction) {
        const Fnt = AISC_SPEC.getFnt(grade);
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); 
        const Ab = PI * (db ** 2) / 4.0;

        if (Ab === 0 || Fnv === 0) return { Rn: 0, ...factors };
        const fv = Vu / Ab;

        let F_nt_prime;
        if (design_method === 'LRFD') {
            F_nt_prime = 1.3 * Fnt - (Fnt / (0.75 * Fnv)) * fv;
        } else { 
            F_nt_prime = 1.3 * Fnt - ((2.00 / 0.75) * Fnt / Fnv) * fv;
        }

        F_nt_prime = Math.min(F_nt_prime, Fnt); 
        F_nt_prime = Math.max(0, F_nt_prime); 

        const Rn = F_nt_prime * Ab; 
        return { Rn, ...factors, Fnt, Fnv, Ab, fv, F_nt_prime, Tu, Vu }; 
    }

    function calculateWebSpliceEccentricity(V_load, H_load, gap, Nc, Nr, S_pitch, S_gage, S_end) {
        const num_bolts = Nc * Nr;
        if (num_bolts === 0) {
            return { max_R: 0, eccentricity: 0, M_ecc: 0, Ip: 0, f_vy_direct: 0, f_vx_direct: 0, f_v_moment: 0, f_h_moment: 0, num_bolts: 0 };
        }
        const bolt_group_centroid_dist = S_end + (Nc - 1) * S_pitch / 2.0;
        const eccentricity = bolt_group_centroid_dist - (gap / 2.0);
        const M_ecc = V_load * eccentricity; 

        let Ip = 0;
        const crit_x = (Nc - 1) * S_pitch / 2.0;
        const crit_y = (Nr - 1) * S_gage / 2.0;

        for (let i = 0; i < Nc; i++) {
            for (let j = 0; j < Nr; j++) {
                const dx = i * S_pitch - crit_x; 
                const dy = j * S_gage - crit_y;  
                Ip += dx ** 2 + dy ** 2;
            }
        }
        if (Ip === 0) {
            const max_R = sqrt((H_load / num_bolts) ** 2 + (V_load / num_bolts) ** 2);
            return { max_R, eccentricity, M_ecc, Ip, f_vy_direct: V_load / num_bolts, f_vx_direct: H_load / num_bolts, f_v_moment: 0, f_h_moment: 0, num_bolts };
        }

        const f_vy_direct = V_load / num_bolts; 
        const f_vx_direct = H_load / num_bolts; 
        const f_v_moment = (M_ecc * crit_x) / Ip; 
        const f_h_moment = (M_ecc * crit_y) / Ip; 

        const R_h = f_vx_direct + f_h_moment;
        const R_v = f_vy_direct + f_v_moment;
        const max_R = sqrt(R_h ** 2 + R_v ** 2);

        return { max_R, eccentricity, M_ecc, Ip, f_vy_direct, f_vx_direct, f_v_moment, f_h_moment, num_bolts };
    }

    function checkPryingAction(params) {
        const { t_plate, Fy_plate, b, a, p, d_bolt, d_hole, B_bolt, jurisdiction } = params;
        if (p <= 0 || Fy_plate <= 0 || B_bolt < 0) {
            return { ...params, T_req: B_bolt, Q: 0, tc: Infinity, alpha_prime: 0, b_prime: 0, a_prime: 0, rho: 0, delta: 0 };
        }
        const b_prime = b - d_bolt / 2.0;
        const a_prime = Math.min(a + d_bolt / 2.0, 1.25 * b);
        if (a_prime <= 0 || b_prime < 0) {
            return { ...params, T_req: B_bolt, Q: 0, tc: Infinity, alpha_prime: 0, b_prime, a_prime, rho: 0, delta: 0 };
        }
        const rho = b_prime / a_prime;
        const delta = 1 - (d_hole / p);
        if (delta < 0) {
            return { ...params, T_req: Infinity, Q: Infinity, tc: 0, alpha_prime: 0, b_prime, a_prime, rho, delta };
        }
        const tc = Math.sqrt((4 * B_bolt * b_prime) / (p * Fy_plate));
        let Q = 0;
        let alpha_prime = 1.0; 
        if (t_plate < tc) { 
            alpha_prime = (1 / (delta * (1 + rho))) * (((t_plate / tc) ** 2) - 1);
            alpha_prime = Math.max(0, Math.min(alpha_prime, 1.0));
            Q = B_bolt * delta * alpha_prime * rho;
        } else {
            Q = 0;
            alpha_prime = 1.0;
        }
        const T_req = B_bolt + Q; 
        return { ...params, T_req, Q, tc, alpha_prime, delta, rho, b_prime, a_prime };
    }

    function getGeometryChecks({ db, s_col, s_row, gage, le_long, le_tran, t_thinner, jurisdiction }) {
        if (!db) return {}; 
        const tolerance = 1e-9; 
        const min_le = AISC_SPEC.minEdgeDistanceTable[String(db)] || 1.25 * db; 
        const min_s = (8 / 3) * db; 
        const max_s = min(24 * t_thinner, 12.0);
        return {
            edge_dist_long: { actual: le_long, min: min_le, pass: le_long >= min_le - tolerance },
            edge_dist_tran: { actual: le_tran, min: min_le, pass: le_tran >= min_le - tolerance },
            spacing_col: { actual: s_col, min: min_s, pass: s_col >= min_s - tolerance },
            spacing_row: { actual: s_row, min: min_s, pass: s_row >= min_s - tolerance }, 
            spacing_gage: { actual: gage, min: min_s, pass: !gage || (gage >= min_s - tolerance) }, 
            max_spacing_col: { actual: s_col, max: max_s, pass: s_col <= max_s + tolerance },
            max_spacing_row: { actual: s_row, max: max_s, pass: s_row <= max_s + tolerance }
        };
    }

    function calculateBoltGroupGeometry({ L_plate, H_plate, Nc, Nr, S_col, S_row, S_end_gap, gage }) {
        const edge_dist_gap = S_end_gap;
        const bolt_pattern_width = (Nc > 1 ? (Nc - 1) * S_col : 0);
        const le_long = L_plate - edge_dist_gap - bolt_pattern_width;

        let bolt_pattern_height, le_tran;
        if (gage) { 
            bolt_pattern_height = Nr <= 1 ? gage : gage + 2 * (Nr - 1) * S_row;
            le_tran = (H_plate - bolt_pattern_height) / 2.0;
        } else { 
            bolt_pattern_height = (Nr > 1 ? (Nr - 1) * S_row : 0);
            le_tran = (H_plate - bolt_pattern_height) / 2.0;
        }

        return {
            le_long: le_long < 0 ? 0 : le_long, 
            le_tran: le_tran < 0 ? 0 : le_tran,
            edge_dist_gap,
            bolt_pattern_width,
            bolt_pattern_height
        };
    }

    function performPlateChecks(plateName, inputs, config) {
        const {
            demand, demand_comp, H_p, t_p, L_p, Fy, Fu,
            Nc, Nr, S_col, S_row, S_end, gage, D_bolt,
            hole_for_net_area, hole_for_bearing
        } = config;
        const plateChecks = {};
        const { le_long, le_tran } = calculateBoltGroupGeometry({
            L_plate: L_p, H_plate: H_p, Nc, Nr, S_col, S_row, S_end_gap: S_end, gage
        });

        const Ag = H_p * t_p; plateChecks[`${plateName} GSY`] = { demand, check: checkGrossSectionYielding({ Ag, Fy, jurisdiction: inputs.jurisdiction }) };
        plateChecks[`${plateName} Compression`] = { demand: demand_comp, check: checkPlateCompression({ Ag, Fy, t: t_p, unbraced_length: S_col, jurisdiction: inputs.jurisdiction }) };
        const bolts_in_critical_section = 2 * Nr;
        plateChecks[`${plateName} NSF`] = { demand, check: checkFlangeNetSection({ bf: H_p, tf: t_p, Fu, num_bolts_in_cs: bolts_in_critical_section, hole_dia_net_area: hole_for_net_area, jurisdiction: inputs.jurisdiction }) };
        const Agv = (S_end + (Nc - 1) * S_col) * t_p * 2; 
        const Anv = Agv - (Nc * 2) * hole_for_net_area * t_p; 
        const Ant = (gage - Nr * hole_for_net_area) * t_p; 
        plateChecks[`${plateName} Block Shear`] = { demand, check: checkBlockShear({ Agv, Anv, Ant, Fu, Fy, Ubs: 1.0, jurisdiction: inputs.jurisdiction }) };
        const bearing_edge = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });
        const bearing_int = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });
        const num_edge_bolts = 2 * Nr;
        const num_int_bolts = (Nc - 1) * 2 * Nr;
        const total_bearing = bearing_edge.Rn * num_edge_bolts + bearing_int.Rn * num_int_bolts;
        plateChecks[`${plateName} Bolt Bearing`] = { demand, check: { Rn: total_bearing, ...getDesignFactors(inputs.jurisdiction, 0.75, 2.00) }, details: { edge: bearing_edge, int: bearing_int, num_edge: num_edge_bolts, num_int: num_int_bolts } };
        return plateChecks;
    }

    function performBeamConnectionChecks(partName, inputs, config) {
        const {
            demand, t_beam, Fu_beam, Fy_beam,
            Nc, Nr, S_col, S_row, S_end, gage, D_bolt,
            hole_for_net_area, hole_for_bearing
        } = config;
        const beamChecks = {};
        const plate_length_prop = partName === 'Flange' ? inputs.L_fp : inputs.L_wp;
        const { le_long } = calculateBoltGroupGeometry({ L_plate: plate_length_prop, Nc, S_col, S_end_gap: S_end }); const bearing_edge = checkBoltBearing({ db: D_bolt, t_ply: t_beam, Fu_ply: Fu_beam, le: le_long, s: S_col, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });
        const bearing_int = checkBoltBearing({ db: D_bolt, t_ply: t_beam, Fu_ply: Fu_beam, le: Infinity, s: S_col, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });

        const multiplier = (partName === 'Flange') ? 2 : 1;
        const num_edge_bolts = Nr * multiplier;
        const num_int_bolts = (Nc - 1) * Nr * multiplier;
        const total_bearing = bearing_edge.Rn * num_edge_bolts + bearing_int.Rn * num_int_bolts;
        beamChecks[`Beam ${partName} Bolt Bearing`] = {
            demand: demand,
            check: { Rn: total_bearing, phi: bearing_edge.phi, omega: bearing_edge.omega },
            details: { edge: bearing_edge, int: bearing_int, num_edge: num_edge_bolts, num_int: num_int_bolts }
        };
        return beamChecks;
    }

    function performFlangeChecks(inputs, demands) {
        if (inputs.num_flange_plates == 0) {
            return { checks: {}, geomChecks: {}, inputs };
        }
        const { total_flange_demand_tension, demand_fp_outer, demand_fp_inner, demand_fp_outer_comp, demand_fp_inner_comp } = demands;
        const checks = {};
        const geomChecks = {};
        const D_fp_num = parseFloat(inputs.D_fp);
        const hole_for_bearing_fp = AISC_SPEC.getNominalHoleDiameter(D_fp_num);
        const hole_for_net_area_fp = hole_for_bearing_fp + 1.0 / 16.0; 

        const { le_long: le_long_fp, le_tran: le_tran_fp, edge_dist_gap: edge_dist_gap_fp, bolt_pattern_height: bolt_pattern_height_fp } = calculateBoltGroupGeometry({
            L_plate: inputs.L_fp, H_plate: inputs.H_fp, Nc: inputs.Nc_fp, Nr: inputs.Nr_fp,
            S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end_gap: inputs.S3_end_dist_fp, gage: inputs.g_gage_fp
        });
        const num_flange_bolts_per_side = inputs.Nc_fp * (2 * inputs.Nr_fp);
        const num_shear_planes_fp = inputs.num_flange_plates === 2 ? 2 : 1;
        const fastenerPatternLength_flange = (inputs.Nc_fp > 1) ? ((inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp) : 0;
        const single_bolt_shear_fp_check = checkBoltShear({
            grade: inputs.bolt_grade_fp, threadsIncl: inputs.threads_included_fp, db: D_fp_num,
            numPlanes: num_shear_planes_fp, fastenerPatternLength: fastenerPatternLength_flange, jurisdiction: inputs.jurisdiction
        });
        checks['Flange Bolt Shear'] = {
            demand: total_flange_demand_tension,
            check: { ...single_bolt_shear_fp_check, Rn: single_bolt_shear_fp_check.Rn * num_flange_bolts_per_side },
            details: { Rn_single: single_bolt_shear_fp_check.Rn, num_bolts: num_flange_bolts_per_side }
        };
        const bolts_in_flange_cs = 2 * inputs.Nr_fp;
        checks['Beam Flange Tensile Rupture'] = {
            demand: total_flange_demand_tension,
            check: checkFlangeNetSection({
                bf: inputs.member_bf, tf: inputs.member_tf, Fu: inputs.member_Fu, num_bolts_in_cs: bolts_in_flange_cs,
                hole_dia_net_area: hole_for_net_area_fp, jurisdiction: inputs.jurisdiction
            })
        };
        Object.assign(checks, performPlateChecks("Outer Plate", inputs, {
            demand: demand_fp_outer, demand_comp: demand_fp_outer_comp, H_p: inputs.H_fp, t_p: inputs.t_fp, L_p: inputs.L_fp, Fy: inputs.flange_plate_Fy, Fu: inputs.flange_plate_Fu,
            Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
            gage: inputs.g_gage_fp, D_bolt: D_fp_num, hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
        }));
        if (inputs.num_flange_plates === 2) {
            Object.assign(checks, performPlateChecks("Inner Plate", inputs, {
                demand: demand_fp_inner, demand_comp: demand_fp_inner_comp, H_p: inputs.H_fp_inner, t_p: inputs.t_fp_inner, L_p: inputs.L_fp_inner, Fy: inputs.flange_plate_Fy_inner, Fu: inputs.flange_plate_Fu_inner,
                Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
                gage: inputs.g_gage_fp, D_bolt: D_fp_num, hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
            }));
        }
        const L_gv_beam_f = inputs.S3_end_dist_fp + (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp; 
        const L_nv_beam_f = L_gv_beam_f - (inputs.Nc_fp - 0.5) * hole_for_net_area_fp; 
        const Ant_beam_f = (inputs.g_gage_fp - (2 * inputs.Nr_fp * hole_for_net_area_fp)) * inputs.member_tf;
        const Agt_beam_f = inputs.g_gage_fp * inputs.member_tf;
        checks['Beam Flange Block Shear'] = {
            demand: total_flange_demand_tension,
            check: checkBlockShear({
                Agv: L_gv_beam_f * inputs.member_tf, Anv: L_nv_beam_f * inputs.member_tf, Ant: Ant_beam_f,
                Fu: inputs.member_Fu, Fy: inputs.member_Fy, Ubs: 1.0, num_shear_paths: 2, jurisdiction: inputs.jurisdiction
            }),
            details: { t_p: inputs.member_tf, hole_dia: hole_for_net_area_fp, Agv: L_gv_beam_f * inputs.member_tf, Anv: L_nv_beam_f * inputs.member_tf, Agt: Agt_beam_f, Ant: Ant_beam_f }
        };
        Object.assign(checks, performBeamConnectionChecks("Flange", inputs, {
            demand: total_flange_demand_tension, t_beam: inputs.member_tf, Fu_beam: inputs.member_Fu, Fy_beam: inputs.member_Fy,
            Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
            gage: inputs.g_gage_fp, D_bolt: D_fp_num, hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
        }));

        const B_per_bolt = num_flange_bolts_per_side > 0 ? total_flange_demand_tension / num_flange_bolts_per_side : 0;
        const d_hole_pry = hole_for_bearing_fp; 
        let T_req = B_per_bolt; 
        let Q_total = 0;
        let prying_details = {};
        if (B_per_bolt > 0) {
            if (inputs.num_flange_plates === 2) {
                const B_per_plate = B_per_bolt / 2;
                const b_pry_outer = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
                const a_pry_outer = (inputs.H_fp - inputs.g_gage_fp) / 2.0; const prying_outer = checkPryingAction({ t_plate: inputs.t_fp, Fy_plate: inputs.flange_plate_Fy, b: b_pry_outer, a: a_pry_outer, p: inputs.S1_col_spacing_fp, d_bolt: D_fp_num, d_hole: d_hole_pry, B_bolt: B_per_plate, jurisdiction: inputs.jurisdiction });
                const b_pry_inner = inputs.g_gage_fp / 2.0;
                const a_pry_inner = (inputs.H_fp_inner - inputs.g_gage_fp) / 2.0;
                const prying_inner = checkPryingAction({ t_plate: inputs.t_fp_inner, Fy_plate: inputs.flange_plate_Fy_inner, b: b_pry_inner, a: a_pry_inner, p: inputs.S1_col_spacing_fp, d_bolt: D_fp_num, d_hole: d_hole_pry, B_bolt: B_per_plate, jurisdiction: inputs.jurisdiction });
                Q_total = prying_outer.Q + prying_inner.Q;
                prying_details = { outer: prying_outer, inner: prying_inner };
            } else {
                const b_pry = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
                const a_pry = (inputs.H_fp - inputs.g_gage_fp) / 2.0; 
                const prying_result = checkPryingAction({ t_plate: inputs.t_fp, Fy_plate: inputs.flange_plate_Fy, b: b_pry, a: a_pry, p: inputs.S1_col_spacing_fp, d_bolt: D_fp_num, d_hole: d_hole_pry, B_bolt: B_per_bolt, jurisdiction: inputs.jurisdiction });
                Q_total = prying_result.Q;
                prying_details = { outer: prying_result };
            }
            T_req += Q_total; 
            checks['Flange Bolt Tension with Prying'] = {
                demand: T_req, 
                check: checkBoltTension(inputs.bolt_grade_fp, D_fp_num, inputs.jurisdiction), 
                details: { ...prying_details, B_per_bolt, Q_total, T_req }
            };
        }
        const outer_plate_tc = prying_details.outer?.tc || 0;
        checks['Plate Thickness for Prying'] = { demand: inputs.t_fp, check: { Rn: outer_plate_tc, phi: 1.0, omega: 1.0 }, details: prying_details };
        const t_thinner_flange = min(inputs.member_tf, inputs.t_fp, inputs.num_flange_plates === 2 ? inputs.t_fp_inner : Infinity);
        geomChecks['Flange Bolts'] = getGeometryChecks({
            db: D_fp_num, s_col: inputs.S1_col_spacing_fp, s_row: inputs.S2_row_spacing_fp, gage: inputs.g_gage_fp,
            le_long: le_long_fp, le_tran: le_tran_fp, t_thinner: t_thinner_flange, jurisdiction: inputs.jurisdiction
        });
        const tolerance = 1e-9;
        const min_le_fp = geomChecks['Flange Bolts'].edge_dist_long.min;
        geomChecks['Flange Bolts'].edge_dist_gap = { actual: edge_dist_gap_fp, min: min_le_fp, pass: edge_dist_gap_fp >= min_le_fp - tolerance };
        return { checks, geomChecks, inputs };
    }

    function boltCoefficient(boltRow, boltColumn, rowSpacing, columnSpacing, eccentricity, rotation = 0) {
        const Rv = boltRow; const Rh = boltColumn; const Sv = rowSpacing; const Sh = columnSpacing;
        rotation = rotation * Math.PI / 180; 
        const Ec = Math.abs(eccentricity);
        if (Ec === 0 || Rv === 0 || Rh === 0) return Rv * Rh;
        const boltLoc = [];
        for (let i = 0; i < Rv; i++) {
            for (let k = 0; k < Rh; k++) {
                let y1 = (i * Sv) - (Rv - 1) * Sv / 2; let x1 = (k * Sh) - (Rh - 1) * Sh / 2; 
                const dv = x1 * Math.sin(rotation) + y1 * Math.cos(rotation);
                const dh = x1 * Math.cos(rotation) - y1 * Math.sin(rotation); 
                boltLoc.push({ dv, dh });
            }
        }
        let xRo = 0; let yRo = 0; let p = 0; let uFprev = Infinity; const cntMax = 5000; const epsilon = 1e-6; const Ru = 1.0;
        let stp = false; let cnt = 0;
        while (!stp) {
            cnt++;
            let liMax = 0;
            for (let i = 0; i < boltLoc.length; i++) {
                const xi = boltLoc[i].dh + xRo; const yi = boltLoc[i].dv + yRo;
                liMax = Math.max(liMax, Math.sqrt(xi ** 2 + yi ** 2));
            }
            let rx = 0; let ry = 0; let m = 0; let j = 0;  
            for (let i = 0; i < boltLoc.length; i++) {
                const xi = boltLoc[i].dh + xRo; const yi = boltLoc[i].dv + yRo; const ri = Math.sqrt(xi ** 2 + yi ** 2);
                const delta = liMax > epsilon ? 0.34 * ri / liMax : 0;
                const iRn = Ru * (1 - Math.exp(-10 * delta)) ** 0.55;
                m += (iRn / Ru) * ri;
                if (ri > epsilon) { ry += (iRn / Ru) * (xi / ri); rx += (iRn / Ru) * (yi / ri); }
                j += ri ** 2;
            }
            const ro = Ec + xRo; p = (Math.abs(ro) > epsilon) ? m / ro : 0; 
            const uFy = p - ry; const uFx = -rx; const uF = Math.sqrt(uFy ** 2 + uFx ** 2); 
            const stp1 = Math.abs(uFy) <= 0.00001 && Math.abs(uFx) <= 0.00001; const stp2 = cnt >= cntMax; const stp3 = cnt > 50 && uF > uFprev * 1.01;
            stp = stp1 || stp2 || stp3;
            if (stp && !stp1) return NaN; 
            const mapFunc = (Math.abs(m) > epsilon) ? j / (Rv * Rh * m) : 0; 
            xRo += uFy * mapFunc; yRo += uFx * mapFunc; uFprev = uF;
        }
        return p; 
    }

    function performWebChecks(inputs, demands) {
        const { V_load, Hw } = demands;
        const checks = {};
        const geomChecks = {};
        const D_wp_num = parseFloat(inputs.D_wp);
        const hole_for_bearing_wp = AISC_SPEC.getNominalHoleDiameter(inputs.D_wp);
        const hole_for_net_area_wp = hole_for_bearing_wp + 1.0 / 16.0; 

        const { le_long: le_long_wp, le_tran: le_tran_wp, edge_dist_gap: edge_dist_gap_wp } = calculateBoltGroupGeometry({
            L_plate: inputs.L_wp, H_plate: inputs.H_wp, Nc: inputs.Nc_wp, Nr: inputs.Nr_wp,
            S_col: inputs.S4_col_spacing_wp, S_row: inputs.S5_row_spacing_wp, S_end_gap: inputs.S6_end_dist_wp
        });

        const num_web_bolts_per_side = inputs.Nc_wp * inputs.Nr_wp;
        if (num_web_bolts_per_side === 0) return { checks, geomChecks, inputs };

        if (inputs.connection_type === 'slip-critical') {
            const single_bolt_slip_check = checkBoltSlip({
                db: D_wp_num, faying_surface_class: inputs.faying_surface_class, num_slip_planes: inputs.num_web_plates, jurisdiction: inputs.jurisdiction
            });
            const total_slip_capacity = single_bolt_slip_check.Rn * num_web_bolts_per_side;
            checks['Web Bolt Slip'] = { demand: Math.sqrt(V_load ** 2 + Hw ** 2), check: { ...single_bolt_slip_check, Rn: total_slip_capacity }, details: { num_bolts: num_web_bolts_per_side } };
        }
        const fastenerPatternLength_web = (inputs.Nr_wp > 1) ? ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) : 0;
        const single_web_bolt_shear_check = checkBoltShear({
            grade: inputs.bolt_grade_wp, threadsIncl: inputs.threads_included_wp, db: D_wp_num,
            numPlanes: inputs.num_web_plates, fastenerPatternLength: fastenerPatternLength_web, jurisdiction: inputs.jurisdiction
        });
        const eccentricity = calculateWebSpliceEccentricity(1, 0, inputs.gap, inputs.Nc_wp, inputs.Nr_wp, inputs.S4_col_spacing_wp, inputs.S5_row_spacing_wp, inputs.S6_end_dist_wp).eccentricity; 
        const theta = Math.atan2(Hw, V_load); 
        const resultant_demand = Math.sqrt(V_load ** 2 + Hw ** 2);
        const e_eff = (V_load * eccentricity) / (resultant_demand || 1); 
        const C = boltCoefficient(inputs.Nr_wp, inputs.Nc_wp, inputs.S5_row_spacing_wp, inputs.S4_col_spacing_wp, e_eff, 0);
        const Rn_group = C * single_web_bolt_shear_check.Rn;
        const factors_bolt_group = getDesignFactors(inputs.jurisdiction, 0.75, 2.00);

        const bolt_group_capacity_check = { Rn: Rn_group, phi: factors_bolt_group.phi, omega: factors_bolt_group.omega, C, Rn_single: single_web_bolt_shear_check.Rn, e_eff: e_eff, theta_deg: theta * 180 / Math.PI };
        checks['Web Bolt Group Shear (ICR)'] = { demand: resultant_demand, check: bolt_group_capacity_check, details: { ...bolt_group_capacity_check, V_load, Hw, eccentricity } };

        const Tu_per_bolt = Hw > 0 ? Hw / num_web_bolts_per_side : 0; 
        const Vu_per_bolt = V_load > 0 ? V_load / num_web_bolts_per_side : 0; 
        if (Tu_per_bolt > 0) {
            checks['Web Bolt Shear/Tension Interaction'] = {
                demand: Tu_per_bolt, check: checkBoltShearTensionInteraction(Tu_per_bolt, Vu_per_bolt, single_web_bolt_shear_check.Fnv, inputs.bolt_grade_wp, D_wp_num, inputs.design_method, inputs.jurisdiction)
            };
        }
        const total_t_wp = inputs.t_wp * inputs.num_web_plates;
        const Agv_wp = inputs.H_wp * total_t_wp;
        checks['Web Plate Gross Shear Yield'] = { demand: V_load, check: checkShearYielding(Agv_wp, inputs.web_plate_Fy, inputs.jurisdiction), details: { H_wp: inputs.H_wp, t_total: total_t_wp } };
        const Anv_wp = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp;
        checks['Web Plate Net Shear Rupture'] = { demand: V_load, check: checkShearRupture(Anv_wp, inputs.web_plate_Fu, inputs.jurisdiction), details: { H_wp: inputs.H_wp, Nr_wp: inputs.Nr_wp, hole_dia: hole_for_net_area_wp, t_total: total_t_wp } };

        const { Mu_resisted_by_web } = demands;
        if (Mu_resisted_by_web > 0) {
            const Zx_wp = (total_t_wp * (inputs.H_wp ** 2)) / 4.0;
            const Sx_wp = (total_t_wp * (inputs.H_wp ** 2)) / 6.0;
            const flex_yield_factors = getDesignFactors(inputs.jurisdiction, 0.90, 1.67);
            const Mn_yield_wp = inputs.web_plate_Fy * Zx_wp;
            checks['Web Plate Flexural Yielding'] = { demand: Mu_resisted_by_web, check: { Rn: Mn_yield_wp, ...flex_yield_factors, Fy: inputs.web_plate_Fy, Zx: Zx_wp } };
            const An_wp_flexure = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp;
            const Mn_rupture_wp = inputs.web_plate_Fu * An_wp_flexure * Sx_wp / (inputs.H_wp * total_t_wp);
            checks['Web Plate Flexural Rupture'] = { demand: Mu_resisted_by_web, check: { Rn: Mn_rupture_wp, ...getDesignFactors(inputs.jurisdiction, 0.75, 2.00) } };
        }
        const total_t_wp_bs_calc = inputs.t_wp * inputs.num_web_plates; 
        const L_gv_single_path = inputs.S6_end_dist_wp + (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp;
        const Agv_bs = 2 * L_gv_single_path * total_t_wp_bs_calc;
        const Anv_bs = Agv_bs - (2 * inputs.Nc_wp * hole_for_net_area_wp * total_t_wp_bs_calc); 
        const Ant_bs = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp_bs_calc; 
        checks['Web Plate Block Shear'] = { demand: V_load, check: checkBlockShear({ Agv: Agv_bs, Anv: Anv_bs, Ant: Ant_bs, Fu: inputs.web_plate_Fu, Fy: inputs.web_plate_Fy, Ubs: 1.0, jurisdiction: inputs.jurisdiction }) };
        const num_edge_bolts_web = inputs.Nr_wp; 
        const num_int_bolts_web = (inputs.Nc_wp - 1) * inputs.Nr_wp;
        const bearing_wp_plate_edge = checkBoltBearing({ db: D_wp_num, t_ply: total_t_wp, Fu_ply: inputs.web_plate_Fu, le: le_long_wp, s: inputs.S4_col_spacing_wp, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing_wp, jurisdiction: inputs.jurisdiction });
        const bearing_wp_plate_int = checkBoltBearing({ db: D_wp_num, t_ply: total_t_wp, Fu_ply: inputs.web_plate_Fu, le: Infinity, s: inputs.S4_col_spacing_wp, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing_wp, jurisdiction: inputs.jurisdiction });
        const total_bearing_capacity_plate = (bearing_wp_plate_edge.Rn * num_edge_bolts_web) + (bearing_wp_plate_int.Rn * num_int_bolts_web);
        checks['Web Plate Bolt Bearing'] = { demand: V_load, check: { ...bearing_wp_plate_edge, Rn: total_bearing_capacity_plate }, details: { edge: bearing_wp_plate_edge, int: bearing_wp_plate_int, num_edge: num_edge_bolts_web, num_int: num_int_bolts_web } };
        Object.assign(checks, performBeamConnectionChecks("Web", inputs, {
            demand: V_load, t_beam: inputs.member_tw, Fu_beam: inputs.member_Fu, Fy_beam: inputs.member_Fy,
            Nc: inputs.Nc_wp, Nr: inputs.Nr_wp, S_col: inputs.S4_col_spacing_wp, S_row: inputs.S5_row_spacing_wp, S_end: inputs.S6_end_dist_wp, 
            D_bolt: D_wp_num, hole_for_bearing: hole_for_bearing_wp
        }));
        const t_thinner_web = min(inputs.member_tw, inputs.t_wp * inputs.num_web_plates);
        geomChecks['Web Bolts'] = getGeometryChecks({
            db: inputs.D_wp, s_col: inputs.S4_col_spacing_wp, s_row: inputs.S5_row_spacing_wp, gage: 0, 
            le_long: le_long_wp, le_tran: le_tran_wp, t_thinner: t_thinner_web, jurisdiction: inputs.jurisdiction
        });
        const tolerance = 1e-9;
        const min_le_wp = geomChecks['Web Bolts'].edge_dist_long.min;
        geomChecks['Web Bolts'].edge_dist_gap = { actual: edge_dist_gap_wp, min: min_le_wp, pass: edge_dist_gap_wp >= min_le_wp - tolerance };
        return { checks, geomChecks, inputs };
    }

    function performMemberChecks(inputs, demands, calculated_holes) {
        const { M_load, V_load, Axial_load } = demands;
        const { hole_for_net_area_fp, hole_for_net_area_wp } = calculated_holes;
        const checks = {};
        const effective_hole_for_net_area_fp = hole_for_net_area_fp || (AISC_SPEC.getNominalHoleDiameter(inputs.D_fp) + 1.0 / 16.0);
        const effective_hole_for_net_area_wp = hole_for_net_area_wp || (AISC_SPEC.getNominalHoleDiameter(inputs.D_wp) + 1.0 / 16.0);
        const Mn_yield = inputs.member_Fy * inputs.member_Zx;
        checks['Beam Flexural Yielding'] = { demand: M_load * 12, check: { Rn: Mn_yield, phi: 0.90, omega: 1.67, Fy: inputs.member_Fy, Zx: inputs.member_Zx } };
        const Agv_beam_web = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
        checks['Beam Web Shear Yielding'] = { demand: V_load, check: checkShearYielding(Agv_beam_web, inputs.member_Fy, inputs.jurisdiction), details: { d: inputs.member_d, tf: inputs.member_tf, tw: inputs.member_tw } };
        const num_bolts_in_flange_cs = 2 * inputs.Nr_fp;
        checks['Beam Flexural Rupture'] = { demand: M_load * 12, check: checkBeamFlexuralRupture(inputs.member_Sx, inputs.member_Fy, inputs.member_Fu, inputs.member_bf, inputs.member_tf, num_bolts_in_flange_cs, effective_hole_for_net_area_fp, inputs.jurisdiction) };
        const Anv_beam_web = (inputs.member_d - 2 * inputs.member_tf - inputs.Nr_wp * effective_hole_for_net_area_wp) * inputs.member_tw;
        checks['Beam Web Shear Rupture'] = { demand: V_load, check: checkShearRupture(Anv_beam_web, inputs.member_Fu, inputs.jurisdiction), details: { d: inputs.member_d, tf: inputs.member_tf, Nr_wp: inputs.Nr_wp, hole_dia: effective_hole_for_net_area_wp, tw: inputs.member_tw } };

        if (Axial_load !== 0) {
            const flange_net_section_check = checkFlangeNetSection({
                bf: inputs.member_bf, tf: inputs.member_tf, Fu: inputs.member_Fu, num_bolts_in_cs: num_bolts_in_flange_cs, hole_dia_net_area: effective_hole_for_net_area_fp, jurisdiction: inputs.jurisdiction
            });
            const moment_arm = inputs.member_d - inputs.member_tf;
            const moment_capacity = flange_net_section_check.Rn * moment_arm;
            checks['Spliced Member Moment Capacity'] = { demand: M_load * 12, check: { ...flange_net_section_check, Rn: moment_capacity }, details: { ...flange_net_section_check, moment_arm } };
        } else {
            const flexural_yielding = checks['Beam Flexural Yielding'].check;
            const flexural_rupture = checks['Beam Flexural Rupture'].check;
            const moment_capacity = Math.min(flexural_yielding.Rn, flexural_rupture.Rn);
            checks['Spliced Member Moment Capacity'] = { demand: M_load * 12, check: { Rn: moment_capacity, phi: 0.90, omega: 1.67 }, details: { yielding: flexural_yielding, rupture: flexural_rupture } };
        }
        if (Axial_load > 0) {
            const A_gross_approx = 2 * inputs.member_bf * inputs.member_tf + (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
            const A_holes_flange = (2 * inputs.Nr_fp) * effective_hole_for_net_area_fp * inputs.member_tf;
            const A_holes_web = inputs.Nr_wp * effective_hole_for_net_area_wp * inputs.member_tw; 
            const An = A_gross_approx - 2 * A_holes_flange - A_holes_web; 
            const U_case7 = (inputs.member_bf >= (2 / 3) * inputs.member_d) ? 0.90 : 0.85;
            const conn_length_flange = (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp;
            const { U: U_case2, x_bar } = computeShearLagFactorU({ plate_width: inputs.member_bf, gage: inputs.g_gage_fp, num_fastener_rows: inputs.Nr_fp, conn_length: conn_length_flange, t_p: inputs.member_tf, d_bolt: inputs.D_fp });
            const U = Math.max(U_case2, U_case7);
            const Ae = U * An;
            const check = { Rn: inputs.member_Fu * Ae, phi: 0.75, omega: 2.00, An, Ae, U, Fu: inputs.member_Fu, details: { Ag_approx: A_gross_approx, A_holes_flange, A_holes_web, U_case2, U_case7, x_bar, conn_length: conn_length_flange } };
            check.phi = getDesignFactors(inputs.jurisdiction, 0.75, 2.00).phi;
            check.omega = getDesignFactors(inputs.jurisdiction, 0.75, 2.00).omega;
            checks['Beam Section Tensile Rupture'] = { demand: Axial_load, check };
        }
        return { checks, inputs };
    }

    function performChecks(inputs, M_load, V_load) {
        const moment_arm_flange = inputs.member_d - inputs.member_tf;
        const flange_force_from_moment = (M_load * 12) / moment_arm_flange;
        const axial_per_flange = inputs.Axial_load / 2.0;
        const total_flange_demand_tension = flange_force_from_moment + axial_per_flange;
        const total_flange_demand_compression = flange_force_from_moment - axial_per_flange;
        const demand_fp_outer = inputs.num_flange_plates === 2 ? total_flange_demand_tension * 0.5 : total_flange_demand_tension;
        const demand_fp_inner = inputs.num_flange_plates === 2 ? total_flange_demand_tension * 0.5 : 0;
        const demand_fp_outer_comp = inputs.num_flange_plates === 2 ? Math.abs(total_flange_demand_compression) * 0.5 : Math.abs(total_flange_demand_compression);
        const demand_fp_inner_comp = inputs.num_flange_plates === 2 ? Math.abs(total_flange_demand_compression) * 0.5 : 0;

        const flangeResults = performFlangeChecks(inputs, { total_flange_demand_tension, total_flange_demand_compression, demand_fp_outer, demand_fp_inner, demand_fp_outer_comp, demand_fp_inner_comp });
        const flange_capacity_for_moment = (flangeResults.checks['Flange Bolt Shear']?.check?.Rn ?? 0);
        const Mu_flange_splice_capacity = flange_capacity_for_moment * moment_arm_flange;
        const Mu_resisted_by_web = Math.max(0, Math.abs(M_load * 12) - Mu_flange_splice_capacity);
        const Hw = (inputs.H_wp > 0) ? Mu_resisted_by_web / (inputs.H_wp * 0.75) : 0; 
        const webResults = performWebChecks(inputs, { V_load, Hw, Mu_resisted_by_web });
        const calculated_holes = { hole_for_net_area_fp: flangeResults.checks['Beam Flange Tensile Rupture']?.check?.hole_dia_net_area, hole_for_net_area_wp: webResults.checks['Web Plate Net Shear Rupture']?.details?.hole_dia };
        const memberResults = performMemberChecks(inputs, { M_load, V_load, Axial_load: inputs.Axial_load }, calculated_holes);

        return {
            checks: { ...flangeResults.checks, ...webResults.checks, ...memberResults.checks }, 
            geomChecks: { ...flangeResults.geomChecks, ...webResults.geomChecks },
            inputs,
            final_loads: { M_load, V_load, Axial_load: inputs.Axial_load },
            demands: { total_flange_demand_tension, total_flange_demand_compression, V_load, Hw, moment_arm_flange, flange_force_from_moment, axial_per_flange, Mu_resisted_by_web }
        };
    }

    function runSingleCheck(inputs) {
        let M_load = inputs.M_load;
        let V_load = inputs.V_load;
        if (inputs.develop_capacity_check) {
            const Zx = inputs.member_Zx;
            if (Zx > 0) {
                const Mn_kipin = inputs.member_Fy * Zx;
                const phi_b = 0.90; const omega_b = 1.67;
                M_load = (inputs.design_method === 'LRFD' ? phi_b * Mn_kipin : Mn_kipin / omega_b) / 12.0;
            }
            const Aw = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
            if (Aw > 0) {
                const Vn_kips = 0.6 * inputs.member_Fy * Aw;
                const phi_v_yield = 1.00; const omega_v_yield = 1.50;
                V_load = inputs.design_method === 'LRFD' ? phi_v_yield * Vn_kips : Vn_kips / omega_v_yield;
            }
        }
        return performChecks(inputs, M_load, V_load);
    }

    function optimizeFlangeBolts(inputs, optimizationLog) {
        const MAX_TOTAL_BOLTS_PER_SIDE = 48; 
        const MAX_ROWS_OR_COLS = 10;
        const flangeBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_fp];
        let bestSolution = null;
        let lastFailureReason = "No valid configuration found within limits.";

        for (const d_fp of flangeBoltDiameters) {
            for (let total_bolts = 2; total_bolts <= MAX_TOTAL_BOLTS_PER_SIDE; total_bolts += 2) {
                if (bestSolution && total_bolts >= bestSolution.num_bolts_per_side) break; 
                for (let nc_fp = 1; nc_fp <= MAX_ROWS_OR_COLS; nc_fp++) {
                    if (total_bolts % (2 * nc_fp) === 0) {
                        const nr_fp = total_bolts / (2 * nc_fp);
                        if (nr_fp > MAX_ROWS_OR_COLS || nr_fp < 1) continue;
                        const currentInputs = { ...inputs, D_fp: d_fp, Nc_fp: nc_fp, Nr_fp: nr_fp };
                        const results = runSingleCheck(currentInputs);
                        const failingStrengthCheck = Object.entries(results.checks)
                            .filter(([key]) => (key.includes('Flange Bolt') || key.includes('Plate')) && !key.startsWith('Beam'))
                            .find(([key, data]) => {
                                const capacity = inputs.design_method === 'LRFD' ? data.check.Rn * data.check.phi : data.check.Rn / data.check.omega;
                                const ratio = capacity > 0 ? Math.abs(data.demand) / capacity : Infinity;
                                return ratio > 1.0;
                            });
                        const failingGeomCheck = Object.entries(results.geomChecks['Flange Bolts'] || {}).find(([key, data]) => !data.pass);
                        if (!failingStrengthCheck && !failingGeomCheck) {
                            bestSolution = { inputs: currentInputs, num_bolts_per_side: total_bolts };
                            break;
                        } else {
                            if (failingStrengthCheck) lastFailureReason = `Strength check failed: ${failingStrengthCheck[0]}`;
                            else if (failingGeomCheck) lastFailureReason = `Geometry check failed: ${failingGeomCheck[0]}`;
                        }
                    }
                }
            }
            if (bestSolution) break; 
        }
        if (bestSolution) {
            const { Nc_fp, Nr_fp, D_fp } = bestSolution.inputs; 
            optimizationLog.push(`Flange splice optimized to ${Nc_fp} column(s) and ${Nr_fp} row(s) of ${D_fp}" bolts (${bestSolution.num_bolts_per_side} bolts per side).`);
            return bestSolution.inputs;
        }
        optimizationLog.push(`Flange splice optimization failed. Last failure reason: ${lastFailureReason}`);
        return null;
    }

    function optimizeWebBolts(inputs, optimizationLog) {
        const MAX_TOTAL_BOLTS_PER_SIDE = 48; 
        const webBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_wp];
        let bestSolution = null;
        let lastFailureReason = "No valid configuration found within limits.";
        for (const d_wp of webBoltDiameters) {
            for (let total_bolts = 1; total_bolts <= MAX_TOTAL_BOLTS_PER_SIDE; total_bolts++) {
                if (bestSolution && total_bolts >= bestSolution.num_bolts_per_side) break;
                for (let nr_wp = 1; nr_wp <= total_bolts; nr_wp++) {
                    if (total_bolts % nr_wp === 0) {
                        const nc_wp = total_bolts / nr_wp;
                        const currentInputs = { ...inputs, D_wp: d_wp, Nc_wp: nc_wp, Nr_wp: nr_wp };
                        const results = runSingleCheck(currentInputs);
                        const failingStrengthCheck = Object.entries(results.checks)
                            .filter(([key]) => key.includes('Web') && !key.startsWith('Beam'))
                            .find(([key, data]) => {
                                const capacity = inputs.design_method === 'LRFD' ? data.check.Rn * data.check.phi : data.check.Rn / data.check.omega;
                                const ratio = capacity > 0 ? Math.abs(data.demand) / capacity : Infinity;
                                return ratio > 1.0;
                            });
                        const failingGeomCheck = Object.entries(results.geomChecks['Web Bolts'] || {}).find(([key, data]) => !data.pass);
                        if (!failingStrengthCheck && !failingGeomCheck) {
                            bestSolution = { inputs: currentInputs, num_bolts_per_side: total_bolts };
                            break;
                        } else {
                            if (failingStrengthCheck) lastFailureReason = `Strength check failed: ${failingStrengthCheck[0]}`;
                            else if (failingGeomCheck) lastFailureReason = `Geometry check failed: ${failingGeomCheck[0]}`;
                        }
                    }
                }
                if (bestSolution && total_bolts === bestSolution.num_bolts_per_side) break;
            }
            if (bestSolution) break; 
        }
        if (bestSolution) {
            const { Nc_wp, Nr_wp, D_wp } = bestSolution.inputs;
            optimizationLog.push(`Web splice optimized to ${Nc_wp} column(s) and ${Nr_wp} row(s) of ${D_wp}" bolts (${bestSolution.num_bolts_per_side} bolts per side).`);
            return bestSolution.inputs;
        }
        optimizationLog.push(`Web splice optimization failed. Last failure reason: ${lastFailureReason}`);
        return null;
    }

    function runOptimization(inputs) {
        let optimizationLog = [];
        const optimizedFlangeInputs = optimizeFlangeBolts(inputs, optimizationLog);
        if (!optimizedFlangeInputs) {
            return { ...runSingleCheck(inputs), optimizationLog }; 
        }
        const finalOptimizedInputs = optimizeWebBolts(optimizedFlangeInputs, optimizationLog);
        if (!finalOptimizedInputs) {
            return { ...runSingleCheck(optimizedFlangeInputs), optimizationLog };
        }
        const finalResults = runSingleCheck(finalOptimizedInputs);
        return { ...finalResults, optimizationLog };
    }

    function run(rawInputs) {
        const inputs = { ...rawInputs };
        const safeFloat = (val) => {
            if (typeof val === 'number') return val;
            const evalResult = safeMathEval(val);
            return (evalResult !== null && isFinite(evalResult)) ? evalResult : 0;
        };
        inputs.gap = safeFloat(inputs.gap);
        inputs.M_load = safeFloat(inputs.M_load);
        inputs.V_load = safeFloat(inputs.V_load);
        inputs.Axial_load = safeFloat(inputs.Axial_load);
        inputs.member_d = safeFloat(inputs.member_d);
        inputs.member_bf = safeFloat(inputs.member_bf);
        inputs.member_tf = safeFloat(inputs.member_tf);
        inputs.member_tw = safeFloat(inputs.member_tw);
        inputs.member_Fy = safeFloat(inputs.member_Fy);
        inputs.member_Fu = safeFloat(inputs.member_Fu);
        inputs.member_Zx = safeFloat(inputs.member_Zx);
        inputs.member_Sx = safeFloat(inputs.member_Sx);
        inputs.num_flange_plates = parseInt(inputs.num_flange_plates, 10) || 0;
        inputs.flange_plate_Fy = safeFloat(inputs.flange_plate_Fy);
        inputs.flange_plate_Fu = safeFloat(inputs.flange_plate_Fu);
        inputs.flange_plate_Fy_inner = safeFloat(inputs.flange_plate_Fy_inner);
        inputs.flange_plate_Fu_inner = safeFloat(inputs.flange_plate_Fu_inner);
        inputs.H_fp = safeFloat(inputs.H_fp);
        inputs.t_fp = safeFloat(inputs.t_fp);
        inputs.H_fp_inner = safeFloat(inputs.H_fp_inner);
        inputs.t_fp_inner = safeFloat(inputs.t_fp_inner);
        inputs.Nc_fp = parseInt(inputs.Nc_fp, 10) || 0;
        inputs.Nr_fp = parseInt(inputs.Nr_fp, 10) || 0;
        inputs.S1_col_spacing_fp = safeFloat(inputs.S1_col_spacing_fp);
        inputs.S2_row_spacing_fp = safeFloat(inputs.S2_row_spacing_fp);
        inputs.S3_end_dist_fp = safeFloat(inputs.S3_end_dist_fp);
        inputs.g_gage_fp = safeFloat(inputs.g_gage_fp);
        inputs.num_web_plates = parseInt(inputs.num_web_plates, 10) || 0;
        inputs.web_plate_Fy = safeFloat(inputs.web_plate_Fy);
        inputs.web_plate_Fu = safeFloat(inputs.web_plate_Fu);
        inputs.H_wp = safeFloat(inputs.H_wp);
        inputs.t_wp = safeFloat(inputs.t_wp);
        inputs.Nc_wp = parseInt(inputs.Nc_wp, 10) || 0;
        inputs.Nr_wp = parseInt(inputs.Nr_wp, 10) || 0;
        inputs.S4_col_spacing_wp = safeFloat(inputs.S4_col_spacing_wp);
        inputs.S5_row_spacing_wp = safeFloat(inputs.S5_row_spacing_wp);
        inputs.S6_end_dist_wp = safeFloat(inputs.S6_end_dist_wp);
        inputs.L_fp = safeFloat(rawInputs.L_fp) / 2.0;
        inputs.L_fp_inner = safeFloat(rawInputs.L_fp_inner) / 2.0;
        inputs.L_wp = safeFloat(rawInputs.L_wp) / 2.0;

        if (inputs.optimize_bolts_check) {
            return runOptimization(inputs);
        } else {
            return runSingleCheck(inputs);
        }
    }
    const __test_exports__ = { checkBoltShear, checkBlockShear };
    return { run, __test_exports__ };
})();

// --- REPORT RENDERERS ---
const baseBreakdownGenerators = {
    'Flange Bolt Shear': ({ check, details }, common) => {
        const wasReducedText = check.wasReduced ? `<br><span class="text-yellow-600">Note: F<sub>nv</sub> was reduced by 20% for long joint length.</span>` : '';
        return common.format_list([
            `<u>Nominal Shear Strength per bolt (R<sub>n,bolt</sub>)</u>`,
            `R<sub>n,bolt</sub> = F<sub>nv</sub> &times; A<sub>b</sub> &times; n<sub>planes</sub>`,
            `R<sub>n,bolt</sub> = ${common.fmt(check.Fnv, 1)} ksi (Gr.${check.grade || '?'}) &times; ${common.fmt(check.Ab, 3)} in² (&empty;${common.fmt(check.db, 3)}") &times; ${check.num_planes} planes = ${common.fmt(details.Rn_single)} kips${wasReducedText}`,
            `<u>Total Nominal Strength (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = R<sub>n,bolt</sub> &times; n<sub>bolts</sub>`,
            `R<sub>n</sub> = ${common.fmt(details.Rn_single)} kips &times; ${details.num_bolts} bolts = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'GSY': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4-1</u>`,
        `R<sub>n</sub> = F<sub>y</sub> &times; A<sub>g</sub>`,
        `R<sub>n</sub> = ${common.fmt(check.Fy, 1)} ksi (F<sub>y</sub>) &times; ${common.fmt(check.Ag, 3)} in² (A<sub>g</sub>) = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'NSF': ({ check }, common) => common.format_list([
        `<u>Net Area (A<sub>n</sub>) per AISC J4.1</u>`,
        `A<sub>n</sub> = A<sub>g</sub> - A<sub>holes</sub> = ${common.fmt(check.Ag, 3)} - ${common.fmt(check.A_holes, 3)} = <b>${common.fmt(check.An, 3)} in²</b>`,
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.1(b)</u>`,
        `R<sub>n</sub> = F<sub>u</sub> &times; A<sub>n</sub> &times; U (Shear lag factor U=${common.fmt(check.U || 1.0)})`,
        `R<sub>n</sub> = ${common.fmt(check.Fu)} ksi (F<sub>u</sub>) &times; ${common.fmt(check.An, 3)} in² (A<sub>n</sub>) &times; ${common.fmt(check.U || 1.0)} = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Block Shear': ({ check }, common) => common.format_list([
        `<u>Nominal Strength per AISC J4.3</u>`,
        `Shear Rupture Path: 0.6 × F<sub>u</sub> × A<sub>nv</sub> = 0.6 × ${common.fmt(check.Fu)} × ${common.fmt(check.Anv, 3)} = ${common.fmt(check.details.shear_rupture_term)} kips`,
        `Tension Rupture Path: U<sub>bs</sub> × F<sub>u</sub> × A<sub>nt</sub> = ${common.fmt(check.Ubs)} × ${common.fmt(check.Fu)} × ${common.fmt(check.Ant, 3)} = ${common.fmt(check.details.tension_rupture_term)} kips`,
        `Shear Yield Limit: 0.6 × F<sub>y</sub> × A<sub>gv</sub> + U<sub>bs</sub> × F<sub>u</sub> × A<sub>nt</sub> = (0.6 × ${common.fmt(check.Fy)} × ${common.fmt(check.Agv, 3)}) + ${common.fmt(check.details.tension_rupture_term)} = ${common.fmt(check.details.shear_yield_limit)} kips`,
        `R<sub>n</sub> = min(paths) = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Bolt Bearing': ({ check, details, demand }, common) => {
        const tearout_coeff = common.inputs.deformation_is_consideration ? 1.2 : 1.5;
        const bearing_coeff = common.inputs.deformation_is_consideration ? 2.4 : 3.0;
        const t = check.t_ply ?? check.t ?? 0;
        const Fu = check.Fu_ply ?? check.Fu ?? 0;
        const db = check.db ?? 0;

        return common.format_list([
            `Bolt Bearing per AISC J3.10`,
            `Deformation at bolt holes is ${common.inputs.deformation_is_consideration ? '' : '<b>not</b> '}a design consideration.`,
            `Plate Thickness t = ${common.fmt(t, 3)} in, F<sub>u</sub> = ${common.fmt(Fu, 1)} ksi, Bolt &empty; = ${common.fmt(db, 3)} in`,
            `<strong>Edge Bolts (per bolt):</strong>`,
            `L<sub>c</sub> = L<sub>e</sub> - d<sub>h</sub>/2 = ${common.fmt(details.edge.Lc, 3)} in`,
            `R<sub>n,tearout</sub> = ${tearout_coeff} &times; L<sub>c</sub> &times; t &times; F<sub>u</sub> = ${tearout_coeff} &times; ${common.fmt(details.edge.Lc, 3)} &times; ${common.fmt(t, 3)} &times; ${common.fmt(Fu, 1)} = ${common.fmt(details.edge.Rn_tearout)} kips`,
            `R<sub>n,bearing</sub> = ${bearing_coeff} &times; d<sub>b</sub> &times; t &times; F<sub>u</sub> = ${bearing_coeff} &times; ${common.fmt(db, 3)} &times; ${common.fmt(t, 3)} &times; ${common.fmt(Fu, 1)} = ${common.fmt(details.edge.Rn_bearing)} kips`,
            `R<sub>n,edge</sub> = min(Tearout, Bearing) = ${common.fmt(details.edge.Rn)} kips`,
            `<strong>Interior Bolts (per bolt):</strong>`,
            `L<sub>c</sub> = s - d<sub>h</sub> = ${common.fmt(details.int.Lc, 3)} in`,
            `R<sub>n,tearout</sub> = ${tearout_coeff} &times; L<sub>c</sub> &times; t &times; F<sub>u</sub> = ${tearout_coeff} &times; ${common.fmt(details.int.Lc, 3)} &times; ${common.fmt(t, 3)} &times; ${common.fmt(Fu, 1)} = ${common.fmt(details.int.Rn_tearout)} kips`,
            `R<sub>n,bearing</sub> = ${bearing_coeff} &times; d<sub>b</sub> &times; t &times; F<sub>u</sub> = ${bearing_coeff} &times; ${common.fmt(db, 3)} &times; ${common.fmt(t, 3)} &times; ${common.fmt(Fu, 1)} = ${common.fmt(details.int.Rn_bearing)} kips`,
            `R<sub>n,int</sub> = min(Tearout, Bearing) = ${common.fmt(details.int.Rn)} kips`,
            `<u>Total Nominal Strength (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = n<sub>edge</sub> &times; R<sub>n,edge</sub> + n<sub>int</sub> &times; R<sub>n,int</sub>`,
            `R<sub>n</sub> = ${details.num_edge} &times; ${common.fmt(details.edge.Rn)} + ${details.num_int} &times; ${common.fmt(details.int.Rn)} = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Web Bolt Group Shear (ICR)': ({ check, details, demand }, common) => {
        return common.format_list([
            `<u>Bolt Group Capacity (Instantaneous Center of Rotation Method)</u>`,
            `Reference: AISC Manual Part 7`,
            `Resultant Demand = √(V² + H²) = √(${common.fmt(details.V_load)}² + ${common.fmt(details.Hw)}²) = <b>${common.fmt(demand)} kips</b>`,
            `Load Angle (θ) = atan2(H, V) = <b>${common.fmt(details.theta_deg, 1)}°</b>`,
            `Effective Eccentricity (e_eff) = (V × e) / Resultant = (${common.fmt(details.V_load)} × ${common.fmt(details.eccentricity)}) / ${common.fmt(demand)} = <b>${common.fmt(details.e_eff, 2)} in</b>`,
            `Bolt Group Coefficient (C) = <b>${common.fmt(details.C, 2)}</b> (from AISC Table 7-1 or iterative calc)`,
            `Single Bolt Capacity (R_n,bolt) = <b>${common.fmt(details.Rn_single)} kips</b>`,
            `Nominal Group Capacity (R_n,group) = C × R_n,bolt = ${common.fmt(details.C, 2)} × ${common.fmt(details.Rn_single)} = <b>${common.fmt(check.Rn)} kips</b>`,
            `Design Capacity = ${common.capacity_eq} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Web Bolt Slip': ({ check }, common) => common.format_list([
        `<u>Slip Critical Check per AISC J3.8</u>`,
        `Surface Class: ${check.fsc || 'A'} (&mu;=${common.fmt(check.mu, 2)}), D<sub>u</sub>=${common.fmt(check.du, 2)}, h<sub>f</sub>=${common.fmt(check.hf, 2)}, T<sub>b</sub>=${common.fmt(check.tb)} kips`,
        `R<sub>n</sub> = &mu; &times; D<sub>u</sub> &times; h<sub>f</sub> &times; T<sub>b</sub> &times; n<sub>s</sub>`,
        `R<sub>n</sub> = ${common.fmt(check.mu, 2)} &times; ${common.fmt(check.du, 2)} &times; ${common.fmt(check.hf, 2)} &times; ${common.fmt(check.tb)} &times; ${check.num_planes}`,
        `R<sub>n</sub> (per bolt) = ${common.fmt(check.Rn / (check.num_bolts || check.num_planes * 1))} kips`, 
        `Total R<sub>n</sub> = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Shear Yield': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.2(a)</u>`,
        `R<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>gv</sub>`,
        `R<sub>n</sub> = 0.6 &times; ${common.fmt(check.Fy, 1)} ksi (F<sub>y</sub>) &times; ${common.fmt(check.Agv, 3)} in² (A<sub>gv</sub>) = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Shear Rupture': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.1</u>`,
        `R<sub>n</sub> = 0.6 &times; F<sub>u</sub> &times; A<sub>nv</sub>`,
        `R<sub>n</sub> = 0.6 &times; ${common.fmt(check.Fu, 1)} ksi (F<sub>u</sub>) &times; ${common.fmt(check.Anv, 3)} in² (A<sub>nv</sub>) = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Web Bolt Shear/Tension Interaction': ({ check }, common) => common.format_list([
        `<u>Adjusted Tensile Strength per AISC J3.9</u>`,
        `Required Shear Stress (f<sub>rv</sub>) = V<sub>u</sub> / A<sub>b</sub> = ${common.fmt(check.Vu)} / ${common.fmt(check.Ab, 3)} = ${common.fmt(check.fv)} ksi`,
        `Available Tensile Stress (F'<sub>nt</sub>) = 1.3&times;F<sub>nt</sub> - (${common.factor_char}&times;F<sub>nt</sub>/F<sub>nv</sub>)&times;f<sub>rv</sub>`,
        `F'<sub>nt</sub> = 1.3&times;${common.fmt(check.Fnt, 1)} - (${common.factor_val}&times;${common.fmt(check.Fnt, 1)}/${common.fmt(check.Fnv, 1)})&times;${common.fmt(check.fv)} = ${common.fmt(check.F_nt_prime)} ksi`,
        `<u>Adjusted Nominal Tensile Strength (R<sub>n</sub>)</u>`,
        `R<sub>n</sub> = F'<sub>nt</sub> &times; A<sub>b</sub>`,
        `R<sub>n</sub> = ${common.fmt(check.F_nt_prime)} ksi &times; ${common.fmt(check.Ab, 3)} in² (&empty;${common.fmt(check.db, 3)}") = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Beam Section Tensile Rupture': ({ check }, common) => common.format_list([
        `<u>Effective Net Area (A<sub>e</sub>) per AISC D2</u>`,
        `A<sub>e</sub> = U &times; A<sub>n</sub> = ${common.fmt(check.U, 3)} &times; ${common.fmt(check.An, 3)} in² = ${common.fmt(check.Ae, 3)} in²`,
        `<u>Nominal Strength (R<sub>n</sub>)</u>`,
        `R<sub>n</sub> = F<sub>u</sub> &times; A<sub>e</sub> = ${common.fmt(check.Fu, 1)} ksi &times; ${common.fmt(check.Ae, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Flange Bolt Tension with Prying': (data, common) => {
        const { demand, check, details } = data; 
        const outer_pry = details.outer ? `Outer Plate Q = ${common.fmt(details.outer.Q)} kips (t<sub>c</sub>=${common.fmt(details.outer.tc, 3)} in)` : 'Outer Plate: No prying force';
        const inner_pry = details.inner ? `Inner Plate Q = ${common.fmt(details.inner.Q)} kips (t<sub>c</sub>=${common.fmt(details.inner.tc, 3)} in)` : '';
        return common.format_list([
            `Prying action per AISC Manual Part 9.`, outer_pry, inner_pry,
            `<u>Total Bolt Tension Demand (T<sub>req</sub>)</u>`,
            `T<sub>req</sub> = B + Q = ${common.fmt(details.B_per_bolt)} + ${common.fmt(details.Q_total)} = <b>${common.fmt(demand)} kips</b>`,
            `<u>Bolt Tensile Capacity (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = F<sub>nt</sub> &times; A<sub>b</sub>`,
            `R<sub>n</sub> = ${common.fmt(check.Fnt, 1)} ksi (Gr.${check.grade || '?'}) &times; ${common.fmt(check.Ab, 3)} in² (&empty;${common.fmt(check.db, 3)}") = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Web Bolt Tension with Prying': (data, common) => baseBreakdownGenerators['Flange Bolt Tension with Prying'](data, common),
    'Beam Flexural Yielding': ({ check }, common) => common.format_list([
        `<u>Flexural Yielding Check per AISC F2.1</u>`,
        `Nominal Moment Strength (M<sub>n</sub>) = F<sub>y</sub> &times; Z<sub>x</sub>`,
        `M<sub>n</sub> = ${common.fmt(check.Fy)} ksi &times; ${common.fmt(check.Zx)} in³ = <b>${common.fmt(check.Rn)} kip-in</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kip-in</b>`
    ]),
    'Beam Flexural Rupture': ({ check }, common) => {
        if (!check.applies) {
            return common.format_list([
                `<u>Flexural Rupture Check per AISC F13.2</u>`,
                `Applicability: F<sub>u</sub> &times; A<sub>fn</sub> &ge; Y<sub>t</sub> &times; F<sub>y</sub> &times; A<sub>fg</sub>`,
                `${common.fmt(check.Fu)} &times; ${common.fmt(check.Afn, 3)} &ge; ${common.fmt(check.Yt)} &times; ${common.fmt(check.Fy)} &times; ${common.fmt(check.Afg, 3)}`,
                `${common.fmt(check.Fu * check.Afn)} &ge; ${common.fmt(check.Yt * check.Fy * check.Afg)}`,
                `<b>Limit state of tensile rupture does not apply.</b>`
            ]);
        }
        return common.format_list([
            `<u>Flexural Rupture Check per AISC F13.2</u>`,
            `Y<sub>t</sub> Factor = ${common.fmt(check.Yt, 1)} (since F<sub>y</sub>/F<sub>u</sub> is ${(check.Fy / check.Fu).toFixed(2)})`,
            `Applicability: F<sub>u</sub> &times; A<sub>fn</sub> &lt; Y<sub>t</sub> &times; F<sub>y</sub> &times; A<sub>fg</sub>, so rupture check is required.`,
            `Net Flange Area (A<sub>fn</sub>) = (b<sub>f</sub> - n &times; d<sub>h,eff</sub>) &times; t<sub>f</sub> = (${common.fmt(common.inputs.member_bf)} - ${2 * common.inputs.Nr_fp} &times; ${common.fmt(check.hole_dia_net_area, 3)}) &times; ${common.fmt(common.inputs.member_tf)} = ${common.fmt(check.Afn, 3)} in²`,
            `<u>Nominal Moment Strength (M<sub>n</sub>)</u>`,
            `M<sub>n</sub> = (F<sub>u</sub> &times; A<sub>fn</sub> / A<sub>fg</sub>) &times; S<sub>x</sub>`,
            `M<sub>n</sub> = (${common.fmt(check.Fu)} &times; ${common.fmt(check.Afn, 3)} / ${common.fmt(check.Afg, 3)}) &times; ${common.fmt(check.Sx)} = <b>${common.fmt(check.Rn)} kip-in</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kip-in</b>`
        ]);
    },
    'Plate Thickness for Prying': ({ check, details }, common) => {
        const prying_data = details.outer || {}; 
        if (!prying_data.B_bolt) return 'Prying details not available.';
        return common.format_list([
            `<u>Required Thickness (t<sub>c</sub>) per AISC Eq. 9-27</u>`,
            `t<sub>c</sub> = &radic;[ (4 &times; B &times; b') / (p &times; F<sub>y,plate</sub>) ]`,
            `t<sub>c</sub> = &radic;[ (4 &times; ${common.fmt(prying_data.B_bolt)} kips &times; ${common.fmt(prying_data.b_prime, 3)}") / (${common.fmt(prying_data.p)}" &times; ${common.fmt(prying_data.Fy_plate)} ksi) ] = <b>${common.fmt(check.Rn, 3)} in</b>`,
            `<em>Note: This check is based on the outer plate geometry and its portion of the bolt tension demand (B). The provided plate thickness should be greater than this required thickness.</em>`
        ]);
    },
    'Compression': ({ check, details }, common) => {
        const slenderness_limit = 4.71 * Math.sqrt(29000 / check.Fy);
        let fcr_calc = `Since &lambda; &le; 25, F<sub>cr</sub> = F<sub>y</sub> = ${common.fmt(check.Fy)} ksi`;
        if (check.slenderness > 25) {
            fcr_calc = `<li>Elastic Buckling Stress (F<sub>e</sub>) = (&pi;² &times; E) / &lambda;² = (&pi;² &times; ${common.fmt(check.E)}) / ${common.fmt(check.slenderness)}² = ${common.fmt(check.Fe)} ksi</li>` + 
                       `<li>Since F<sub>y</sub> / F<sub>e</sub> = ${common.fmt(check.Fy,1)} / ${common.fmt(check.Fe,1)} = ${(check.Fy / check.Fe).toFixed(3)} &le; 2.25, F<sub>cr</sub> = [0.658<sup>(Fy/Fe)</sup>] &times; F<sub>y</sub> = ${common.fmt(check.Fcr)} ksi</li>`;
        }
        return common.format_list([
            `<u>Compressive Strength per AISC Chapter E</u>`,
            `Radius of Gyration (r) = t / &radic;12 = ${common.fmt(check.t, 3)} / &radic;12 = ${common.fmt(check.r, 3)} in`,
            `Slenderness (&lambda;) = (k &times; L) / r = (${check.k} &times; ${check.unbraced_length}") / ${common.fmt(check.r, 3)} = ${common.fmt(check.slenderness)}`,
            `<u>Critical Buckling Stress (F<sub>cr</sub>)</u>`, fcr_calc,
            `<u>Nominal Compressive Strength (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = F<sub>cr</sub> &times; A<sub>g</sub> = ${common.fmt(check.Fcr)} ksi &times; ${common.fmt(check.Ag, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Spliced Member Moment Capacity': ({ check, details, demand }, common) => {
        if (common.inputs.Axial_load !== 0) {
            return common.format_list([
                `<u>Moment Capacity based on Flange Net Section (ASD)</u>`,
                `R<sub>n,flange</sub> = F<sub>u</sub> &times; A<sub>n</sub> = ${common.fmt(details.Fu)} ksi &times; ${common.fmt(details.An, 3)} in² = ${common.fmt(details.Rn)} kips`,
                `Moment Arm (d - t<sub>f</sub>) = ${common.fmt(details.moment_arm, 2)} in`,
                `<u>Nominal Moment Strength (M<sub>n</sub>)</u>`,
                `M<sub>n</sub> = R<sub>n,flange</sub> &times; Moment Arm = ${common.fmt(details.Rn)} kips &times; ${common.fmt(details.moment_arm, 2)} in = <b>${common.fmt(check.Rn)} kip-in</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${common.capacity_eq.replace('R', 'M')} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kip-in</b>`
            ]);
        } else {
            return common.format_list([
                `<u>Flexural Yielding (M<sub>n,y</sub>)</u>`,
                `M<sub>n,y</sub> = F<sub>y</sub> &times; Z<sub>x</sub> = ${common.fmt(details.yielding.Fy)} ksi &times; ${common.fmt(details.yielding.Zx)} in³ = ${common.fmt(details.yielding.Rn)} kip-in`,
                `<u>Flexural Rupture (M<sub>n,r</sub>)</u>`,
                `M<sub>n,r</sub> = (F<sub>u</sub> &times; A<sub>fn</sub> / A<sub>fg</sub>) &times; S<sub>x</sub> = ${common.fmt(details.rupture.Rn)} kip-in`,
                `<u>Nominal Moment Strength (M<sub>n</sub>)</u>`,
                `M<sub>n</sub> = min(M<sub>n,y</sub>, M<sub>n,r</sub>) = <b>${common.fmt(check.Rn)} kip-in</b>`,
                `<u>Design Capacity</u>`,
                `Capacity = ${common.capacity_eq.replace('R', 'M')} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kip-in</b>`
            ]);
        }
    },
};

function getBreakdownGenerator(name) {
    if (baseBreakdownGenerators[name]) return baseBreakdownGenerators[name];
    if (name.includes('Compression')) return baseBreakdownGenerators['Compression'];
    if (name.includes('GSY')) return baseBreakdownGenerators['GSY'];
    if (name.includes('NSF')) return baseBreakdownGenerators['NSF'];
    if (name.includes('Block Shear')) return baseBreakdownGenerators['Block Shear'];
    if (name.includes('Bolt Bearing')) return baseBreakdownGenerators['Bolt Bearing'];
    if (name.includes('Web Bolt Group Shear (ICR)')) return baseBreakdownGenerators['Web Bolt Group Shear (ICR)'];
    if (name.includes('Shear Yield')) return baseBreakdownGenerators['Shear Yield'];
    if (name.includes('Web Bolt Slip')) return baseBreakdownGenerators['Web Bolt Slip'];
    if (name.includes('Shear Rupture')) return baseBreakdownGenerators['Shear Rupture'];
    if (name.includes('Flexural Rupture')) return baseBreakdownGenerators['Beam Flexural Rupture'];
    if (name.includes('Flexural Yielding')) return baseBreakdownGenerators['Beam Flexural Yielding'];
    if (name.includes('Web Bolt Tension with Prying')) return baseBreakdownGenerators['Web Bolt Tension with Prying'];
    if (name.includes('Beam Flange Tensile Rupture')) return baseBreakdownGenerators['NSF']; 
    if (name.includes('Plate Thickness for Prying')) return baseBreakdownGenerators['Plate Thickness for Prying'];
    if (name.includes('Spliced Member Moment Capacity')) return baseBreakdownGenerators['Spliced Member Moment Capacity'];
    return () => 'Breakdown not available for this check.';
}

function generateSpliceBreakdownHtml(name, data, inputs) {
    const { check } = data;
    const { design_method } = inputs;
    const common = {
        inputs,
        fmt: (val, dec = 2) => (val !== undefined && val !== null && !isNaN(parseFloat(val))) ? parseFloat(val).toFixed(dec) : 'N/A',
        format_list: (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`,
        factor_char: design_method === 'LRFD' ? '&phi;' : '&Omega;',
        factor_val: design_method === 'LRFD' ? (check?.phi ?? 0.9) : (check?.omega ?? 1.67),
        capacity_eq: design_method === 'LRFD' ? `&phi;R<sub>n</sub>` : `R<sub>n</sub> / &Omega;`,
        final_capacity: design_method === 'LRFD' ? (check?.Rn || 0) * (check?.phi ?? 0.75) : (check?.Rn || 0) / (check?.omega || 2.00)
    };
    const generator = getBreakdownGenerator(name);
    return generator(data, common);
}

function updateMemberLabels(type) {
    const isHSS = (type === 'HSS Rectangular');
    const setLabel = (id, text) => { const el = document.querySelector(`label[for="${id}"]`); if (el) el.textContent = text; };

    setLabel('member_d', isHSS ? 'Height (Ht)' : 'Depth (d)');
    setLabel('member_bf', isHSS ? 'Width (B)' : 'Flange (bf)');
    setLabel('member_tw', isHSS ? 'Wall Des (tdes)' : 'Web (tw)');
    
    // For HSS, tf is same as tw (tdes). We can hide tf or just label it.
    // Let's label it 'Wall Nom (nom)' or similar, but actually HSS usually specifies t_des.
    // If we want to support both axes having plates, we treat B as "Flange" side and Ht as "Web" side.
    setLabel('member_tf', isHSS ? 'Wall (tdes)' : 'Flange (tf)');
    
    // Hide/Show logic could go here if we wanted to hide tf input for HSS
    const tfInput = document.getElementById('member_tf');
    if (tfInput) {
        if (isHSS) {
             // Maybe make it read-only and sync with tw? 
             // Logic in handleShapeSelection will handle values.
             // Visual hiding might be confusing if user wants to see it?
             // Let's keep it visible but maybe grayed out if auto-populated?
        }
    }
}

async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    const shapeTypeSelect = document.getElementById('member_shape_type');
    if (!shapeSelect || !shapeTypeSelect) return;
    try {
        const selectedType = shapeTypeSelect.value;
        updateMemberLabels(selectedType); // Update labels based on type
        
        const shapes = await AISC_SPEC.getShapesByType(selectedType);
        const shapeNames = Object.keys(shapes).sort();
        const currentVal = shapeSelect.value;
        shapeSelect.innerHTML = '<option value="">-- Manual Input --</option>'; 
        shapeNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name; option.textContent = name;
            shapeSelect.appendChild(option);
        });
        if (shapeNames.includes(currentVal)) { shapeSelect.value = currentVal; }
    } catch (error) { console.error("Failed to populate shape dropdown:", error); shapeSelect.innerHTML = '<option value="">Could not load shapes</option>'; }
}

async function handleShapeSelection() {
    const shapeName = document.getElementById('aisc_shape_select').value;
    const memberInputs = ['member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Zx', 'member_Sx'];
    if (!shapeName) {
        memberInputs.forEach(id => { const el = document.getElementById(id); if (el) el.readOnly = false; });
        return;
    }
    const shape = await AISC_SPEC.getShape(shapeName);
    if (!shape) return;

    let d = shape.d;
    let bf = shape.bf;
    let tf = shape.tf;
    let tw = shape.tw;

    if (shape.type === 'HSS' || shape.type === 'HSS Rectangular') {
        // Database uses d, bf, tf, tw (or tdes)
        d = shape.d;
        bf = shape.bf;
        // Check if tdes exists, otherwise use tf/tw
        const t = shape.tdes || shape.tf || shape.tw;
        tf = t;
        tw = t;
    }

    const propertyMap = { 'member_d': d, 'member_bf': bf, 'member_tf': tf, 'member_tw': tw, 'member_Zx': shape.Zx, 'member_Sx': shape.Sx };
    Object.keys(propertyMap).forEach(id => {
        const el = document.getElementById(id);
        if (el && propertyMap[id] !== undefined) { el.value = propertyMap[id]; el.readOnly = true; }
    });
    draw3dSpliceDiagram(); draw2dSpliceDiagram();
}

function renderLoadSummary(rawInputs, final_loads, demands, inputs) {
    const { M_load, V_load, Axial_load } = final_loads;
    const { total_flange_demand_tension, total_flange_demand_compression, Hw, moment_arm_flange, flange_force_from_moment, axial_per_flange, Mu_resisted_by_web } = demands;
    const isCapacityDesign = rawInputs.develop_capacity_check;
    const loadNote = isCapacityDesign ? ' (Calculated from Member Capacity)' : ' (User Input)';
    const rows = [
        { cells: ['Design Moment (M)', `${M_load.toFixed(2)} kip-ft`, loadNote] },
        { cells: ['Design Shear (V)', `${V_load.toFixed(2)} kips`, loadNote] },
        { cells: ['Design Axial (P)', `${Axial_load.toFixed(2)} kips`, '(User Input)'] },
        { type: 'subheader', content: 'Load Distribution' },
        { cells: ['&nbsp;&nbsp;&nbsp;Flange Force from Moment', `T<sub>M</sub> = M / (d-t<sub>f</sub>) = (${M_load.toFixed(2)}*12) / ${moment_arm_flange.toFixed(3)}`, `${flange_force_from_moment.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Flange Force from Axial', `T<sub>P</sub> = P / 2 = ${Axial_load.toFixed(2)} / 2`, `${axial_per_flange.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Total Flange Tension', 'T<sub>u</sub> = T<sub>M</sub> + T<sub>P</sub>', `${total_flange_demand_tension.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Total Flange Compression', 'C<sub>u</sub> = T<sub>M</sub> - T<sub>P</sub>', `${total_flange_demand_compression.toFixed(2)} kips`] },
        { type: 'subheader', content: 'Web Splice Forces' },
        { cells: ['&nbsp;&nbsp;&nbsp;Shear on Web Splice', 'V<sub>web</sub> = V', `${V_load.toFixed(2)} kips`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Moment Resisted by Web', 'M<sub>web</sub> = M<sub>total</sub> - M<sub>flange_splice</sub>', `${Mu_resisted_by_web.toFixed(2)} kip-in`] },
        { cells: ['&nbsp;&nbsp;&nbsp;Horizontal Force on Web', 'H<sub>w</sub> = M<sub>web</sub> / (0.75 * H<sub>wp</sub>)', `${Hw.toFixed(2)} kips`] }
    ].map(row => row.type === 'subheader' ? row : { ...row, cells: row.cells.map(cell => cell || '') }); 
    return { title: 'Load Summary', table: { headers: ['Load Type / Distribution', 'Calculation', 'Magnitude'], rows: rows } };
}

function renderSpliceInputSummary(inputs) {
    const {
        design_method, gap, member_d, member_bf, member_tf, member_tw, member_Fy, member_Fu,
        num_flange_plates, H_fp, t_fp, L_fp, flange_plate_Fy, flange_plate_Fu, H_fp_inner, t_fp_inner, L_fp_inner, flange_plate_Fy_inner, flange_plate_Fu_inner,
        Nc_fp, Nr_fp, D_fp, bolt_grade_fp, threads_included_fp, S1_col_spacing_fp, S2_row_spacing_fp, S3_end_dist_fp, g_gage_fp,
        num_web_plates, H_wp, t_wp, L_wp, web_plate_Fy, web_plate_Fu, Nc_wp, Nr_wp, D_wp, bolt_grade_wp, threads_included_wp, S4_col_spacing_wp, S5_row_spacing_wp, S6_end_dist_wp
    } = inputs;

    const sections = [
        { title: 'General & Member Properties', rows: [{ cells: ['Design Method', design_method] }, { cells: ['Splice Gap', `${gap}"`] }, { cells: ['Member', `W-Shape (d=${member_d}", b<sub>f</sub>=${member_bf}", t<sub>f</sub>=${member_tf}", t<sub>w</sub>=${member_tw}")`] }, { cells: ['Member Material', `F<sub>y</sub>=${member_Fy} ksi, F<sub>u</sub>=${member_Fu} ksi`] }] },
        { title: 'Flange Splice Details', rows: [{ cells: ['Outer Plate', `PL ${H_fp}" &times; ${L_fp * 2}" &times; ${t_fp}"`] }, { cells: ['Outer Plate Material', `F<sub>y</sub>=${flange_plate_Fy} ksi, F<sub>u</sub>=${flange_plate_Fu} ksi`] }, ...(num_flange_plates == 2 ? [{ cells: ['Inner Plate', `2 x PL ${H_fp_inner}" &times; ${L_fp_inner * 2}" &times; ${t_fp_inner}"`] }, { cells: ['Inner Plate Material', `F<sub>y</sub>=${flange_plate_Fy_inner} ksi, F<sub>u</sub>=${flange_plate_Fu_inner} ksi`] }] : [])] },
        { title: 'Flange Bolt Details', rows: [{ cells: ['Configuration', `${Nc_fp * Nr_fp * 4} total bolts (${2 * Nc_fp} cols &times; ${2 * Nr_fp} rows)`] }, { cells: ['Bolt Details', `&empty;${D_fp}" ${bolt_grade_fp} (${threads_included_fp ? 'Threads Included' : 'Threads Excluded'})`] }, { cells: ['Spacing (Pitch, S1)', `${S1_col_spacing_fp}"`] }, { cells: ['Spacing (Gage, g)', `${g_gage_fp}"`] }, { cells: ['Spacing (Row, S2)', `${S2_row_spacing_fp}"`] }, { cells: ['End Distance (S3)', `${S3_end_dist_fp}"`] }] },
        { title: 'Web Splice Details', rows: [{ cells: ['Web Plate(s)', `${num_web_plates} &times; PL ${H_wp}" &times; ${L_wp * 2}" &times; ${t_wp}"`] }, { cells: ['Web Plate Material', `F<sub>y</sub>=${web_plate_Fy} ksi, F<sub>u</sub>=${web_plate_Fu} ksi`] }] },
        { title: 'Web Bolt Details', rows: [{ cells: ['Configuration', `${Nc_wp * Nr_wp * 2} total bolts (${2 * Nc_wp} cols &times; ${Nr_wp} rows)`] }, { cells: ['Bolt Details', `&empty;${D_wp}" ${bolt_grade_wp} (${threads_included_wp ? 'Threads Included' : 'Threads Excluded'})`] }, { cells: ['Spacing (Pitch, S4)', `${S4_col_spacing_wp}"`] }, { cells: ['Spacing (Gage, S5)', `${S5_row_spacing_wp}"`] }, { cells: ['End Distance (S6)', `${S6_end_dist_wp}"`] }] }
    ];
    return sections;
}

async function populateReportDiagrams() {
    const img3d = document.getElementById('report-img-3d');
    const engine = (typeof bjsEngine !== 'undefined' ? bjsEngine : window.bjsEngine);
    const scene = (typeof bjsScene !== 'undefined' ? bjsScene : window.bjsScene);
    if (img3d && engine && scene && scene.activeCamera) {
        try {
            // Use executeWhenReady for reliability
            scene.executeWhenReady(() => {
                 BABYLON.Tools.CreateScreenshot(engine, scene.activeCamera, { width: 900, height: 600 }, (data) => { if (img3d) img3d.src = data; }); 
            });
        } catch (e) { console.warn("Failed to capture 3D screenshot:", e); img3d.alt = "3D Diagram failed"; }
    }
    
    // Robust 2D Capture
    const ns = "http://www.w3.org/2000/svg";
    // Simplified & Robust 2D Capture (No DOM mounting needed)
    // const ns = "http://www.w3.org/2000/svg"; // Already declared in scope above if reusing, but let's be safe and check scope.
    // Actually, `ns` is declared at line 1934 in the previous context of the function? 
    // Wait, the previous block I replaced STARTED with `// Robust 2D Capture`.
    // The `ns` was likely inside `populateReportDiagrams`. 
    // Let's just remove the duplicate declaration if it exists.
    
    // In the previous replace, I replaced from `// Robust 2D Capture`...
    // The new block has `const ns = ...`.
    // The error says "Cannot redeclare block-scoped variable 'ns'".
    // This implies `ns` is declared TWICE in the same block.
    // Let's explicitly scope the helper or just use the existing one.
    
    const ns2 = "http://www.w3.org/2000/svg";
    const renderView = (view) => {
        const targetImg = document.getElementById(`report-img-2d-${view}`);
        if (!targetImg) return;

        const tempSvg = document.createElementNS(ns2, "svg");
        tempSvg.setAttribute("xmlns", ns2);
        
        try {
            draw2dSpliceDiagram(tempSvg, view);
            const xml = new XMLSerializer().serializeToString(tempSvg);
            const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
            targetImg.src = dataUrl;
        } catch(e) {
            console.warn(`Failed to capture 2D ${view}:`, e);
            targetImg.alt = "Diagram failed to generate";
        }
    };

    renderView("elevation");
    renderView("section");
    renderView("plan");
}

function renderResults(results, rawInputs) {
    const { checks, geomChecks, inputs, final_loads, demands } = results; 
    let maxRatio = 0.0; let governingCheckName = "None"; let isFail = false; let failReason = "";
    const checkCategories = [
        { title: getTranslation('flange_plate_checks'), checks: ['Flange Bolt Shear', 'Flange Bolt Tension with Prying', 'Plate Thickness for Prying', 'Outer Plate GSY', 'Outer Plate Compression', 'Outer Plate NSF', 'Outer Plate Block Shear', 'Outer Plate Bolt Bearing', 'Inner Plate GSY', 'Inner Plate Compression', 'Inner Plate NSF', 'Inner Plate Block Shear', 'Inner Plate Bolt Bearing'] },
        { title: getTranslation('web_plate_checks'), checks: ['Web Bolt Group Shear (ICR)', 'Web Bolt Slip', 'Web Plate Flexural Yielding', 'Web Plate Flexural Rupture', 'Web Bolt Tension with Prying', 'Web Plate Gross Shear Yield', 'Web Plate Net Shear Rupture', 'Web Plate Block Shear', 'Web Plate Bolt Bearing'] },
        { title: getTranslation('beam_flange_checks'), checks: ['Beam Flange Tensile Rupture', 'Beam Flange Block Shear', 'Beam Flange Bolt Bearing'] },
        { title: getTranslation('beam_web_checks'), checks: ['Beam Web Bolt Bearing', 'Beam Web Shear Yielding', 'Beam Web Shear Rupture'] },
        { title: getTranslation('full_member_checks'), checks: ['Beam Flexural Yielding', 'Beam Flexural Rupture', 'Beam Section Tensile Rupture'] }
    ];
    checkCategories.forEach(cat => {
        cat.checks.forEach(name => {
            if (checks[name]) {
                const data = checks[name]; const { demand, check } = data; const { Rn, phi, omega } = check;
                const capacity = Rn || 0; const design_capacity = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);
                let ratio = 0;
                if (name === 'Plate Thickness for Prying') { const req_t = check.Rn; const actual_t = demand; ratio = actual_t > 0 ? req_t / actual_t : Infinity; } 
                else { ratio = design_capacity > 0 ? Math.abs(demand) / design_capacity : Infinity; }
                if (ratio > maxRatio) { maxRatio = ratio; governingCheckName = name; }
                if (ratio > 1.0) { isFail = true; if (!failReason) failReason = `${name} exceeded capacity.`; }
            }
        });
    });
    let geomFailInfo = "";
    ['Flange Bolts', 'Web Bolts'].forEach(group => {
        if (geomChecks[group]) { Object.values(geomChecks[group]).forEach(val => { if (val && val.pass === false) { isFail = true; geomFailInfo = `${group} geometry check failed.`; } }); }
    });
    const statusColor = isFail ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100";
    const statusText = isFail ? "DOES NOT PASS" : "PASSES";
    const summaryText = isFail ? `The splice connection <strong>DOES NOT PASS</strong> the design requirements. <br/>The governing issue is <strong>${failReason || geomFailInfo || governingCheckName}</strong>.` : `The splice connection <strong>PASSES</strong> all design checks. <br/>The governing factor is <strong>${governingCheckName}</strong> with a utilization ratio of <strong>${(maxRatio * 100).toFixed(1)}%</strong>.`;
    
    const report = new ReportBuilder({ reportId: 'splice-report-content', title: getTranslation('splice_check'), warnings: results.optimizationLog });
    const execSummaryHtml = `<div class="mb-8 p-6 rounded-lg border ${isFail ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}"><h3 class="text-xl font-bold mb-4 ${isFail ? 'text-red-800' : 'text-green-800'}">Executive Summary</h3><div class="flex items-center mb-4"><span class="text-3xl font-black px-4 py-2 rounded ${statusColor} border ${isFail ? 'border-red-300' : 'border-green-300'}">${statusText}</span></div><p class="text-lg text-gray-800 leading-relaxed">${summaryText}</p></div>`;
    report.addSection(null, execSummaryHtml);
    const loadSummaryData = renderLoadSummary(rawInputs, final_loads, demands, inputs);
    report.addTableSection(loadSummaryData.title, loadSummaryData.table);
    
    checkCategories.forEach(category => {
        const { title: categoryTitle, checks: checkList } = category;
        const categoryRows = [];
        const hasChecks = checkList.some(name => checks[name]);
        if (hasChecks) {
            checkList.forEach(name => {
                if (checks[name]) {
                    const data = checks[name]; const { demand, check } = data; const { Rn, phi, omega } = check;
                    const capacity = Rn || 0; const design_capacity_raw = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);
                    let ratio, status, display_demand, display_capacity;
                    if (name === 'Plate Thickness for Prying') { display_demand = design_capacity_raw; display_capacity = demand; ratio = display_capacity > 0 ? display_demand / display_capacity : Infinity; } 
                    else { display_demand = demand; display_capacity = design_capacity_raw; ratio = display_capacity > 0 ? Math.abs(display_demand) / display_capacity : Infinity; }
                    status = ratio <= 1.0 ? `<span class="pass">${getTranslation('pass')}</span>` : `<span class="fail">${getTranslation('fail')}</span>`;
                    let demand_unit = 'kips', capacity_unit = 'kips';
                    if (name === 'Plate Thickness for Prying') { demand_unit = 'in (req)'; capacity_unit = 'in'; }
                    if (name.includes('Flexural')) { display_demand /= 12.0; display_capacity /= 12.0; demand_unit = 'kip-ft'; capacity_unit = 'kip-ft'; }
                    const breakdownHtml = generateSpliceBreakdownHtml(name, data, inputs);
                    categoryRows.push({ cells: [name, `${display_demand.toFixed(2)} ${demand_unit}`, `${display_capacity.toFixed(2)} ${capacity_unit}`, ratio.toFixed(3), status], details: breakdownHtml });
                }
            });
            const tableTitle = `${categoryTitle} (${inputs.design_method})`;
            report.addTableSection(tableTitle, { headers: [getTranslation('limit_state'), getTranslation('demand'), getTranslation('capacity'), getTranslation('ratio'), getTranslation('status')], rows: categoryRows });
        }
    });

    const appendixHtml = `<div class="mt-12 mb-6 border-b-2 border-gray-300 pb-2 bg-gray-50 p-4 rounded-t-lg"><h2 class="text-2xl font-bold text-gray-800 uppercase tracking-wide">Appendix A: Fabrication & Drafting Details</h2></div>`;
    report.addSection(null, appendixHtml);
const diagramSectionHtml = `
<div class="grid grid-cols-3 gap-4 mb-6">
  <div class="flex flex-col items-center">
    <h4 class="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">2D Elevation</h4>
    <div class="border rounded p-2 bg-white w-full h-[350px] flex items-center justify-center shadow-sm overflow-hidden">
      <img id="report-img-2d-elevation"
           src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
           alt="Elevation Diagram"
           class="max-h-full max-w-full object-contain" />
    </div>
  </div>

  <div class="flex flex-col items-center">
    <h4 class="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">2D Section</h4>
    <div class="border rounded p-2 bg-white w-full h-[350px] flex items-center justify-center shadow-sm overflow-hidden">
      <img id="report-img-2d-section"
           src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
           alt="Section Diagram"
           class="max-h-full max-w-full object-contain" />
    </div>
  </div>

  <div class="flex flex-col items-center">
    <h4 class="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">2D Plan</h4>
    <div class="border rounded p-2 bg-white w-full h-[350px] flex items-center justify-center shadow-sm overflow-hidden">
      <img id="report-img-2d-plan"
           src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
           alt="Plan Diagram"
           class="max-h-full max-w-full object-contain" />
    </div>
  </div>
</div>

  <div class="flex flex-col items-center mt-4">
    <h4 class="font-bold text-lg mb-2 text-gray-800 dark:text-gray-200">3D Visualization</h4>
    <div class="border rounded p-2 bg-white w-full h-[500px] flex items-center justify-center shadow-sm overflow-hidden">
      <img id="report-img-3d"
           src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
           alt="3D Diagram"
           class="max-h-full max-w-full object-contain" />
    </div>
  </div>
</div>`;
    report.addSection(null, diagramSectionHtml);
    const inputSummarySections = renderSpliceInputSummary(inputs);
    inputSummarySections.forEach(section => { report.addTableSection(section.title, { headers: [getTranslation('parameter'), getTranslation('value')], rows: section.rows }); });

    const geomRows = [];
    const addGeomRow = (name, data, isMaxCheck = false) => {
        const status = data.pass ? `<span class="pass">${getTranslation('pass')}</span>` : `<span class="fail">${getTranslation('fail')}</span>`;
        const limit_val = isMaxCheck ? (data.max ?? 'N/A') : (data.min ?? 'N/A');
        const limit_label = isMaxCheck ? 'Maximum' : 'Minimum';
        geomRows.push({ cells: [`${name} (${limit_label})`, data.actual.toFixed(3), limit_val.toFixed(3), status] });
    };
    if (geomChecks['Flange Bolts']) {
        addGeomRow(getTranslation('flange_bolt_edge_dist_long'), geomChecks['Flange Bolts'].edge_dist_long);
        addGeomRow(getTranslation('flange_bolt_edge_dist_tran'), geomChecks['Flange Bolts'].edge_dist_tran);
        addGeomRow(getTranslation('flange_bolt_edge_dist_gap'), geomChecks['Flange Bolts'].edge_dist_gap);
        addGeomRow(getTranslation('flange_bolt_spacing_pitch'), geomChecks['Flange Bolts'].spacing_col);
        addGeomRow(getTranslation('flange_bolt_spacing_gage'), geomChecks['Flange Bolts'].spacing_gage);
        addGeomRow(getTranslation('flange_bolt_spacing_pitch'), geomChecks['Flange Bolts'].max_spacing_col, true);
        addGeomRow(getTranslation('flange_bolt_spacing_gage'), geomChecks['Flange Bolts'].max_spacing_row, true);
    }
    if (geomChecks['Web Bolts']) {
        addGeomRow(getTranslation('web_bolt_edge_dist_long'), geomChecks['Web Bolts'].edge_dist_long);
        addGeomRow(getTranslation('web_bolt_edge_dist_tran'), geomChecks['Web Bolts'].edge_dist_tran);
        addGeomRow(getTranslation('web_bolt_edge_dist_gap'), geomChecks['Web Bolts'].edge_dist_gap);
        addGeomRow(getTranslation('web_bolt_spacing_pitch'), geomChecks['Web Bolts'].spacing_col);
        addGeomRow(getTranslation('web_bolt_spacing_gage'), geomChecks['Web Bolts'].spacing_row);
        addGeomRow(getTranslation('web_bolt_spacing_pitch'), geomChecks['Web Bolts'].max_spacing_col, true);
        addGeomRow(getTranslation('web_bolt_spacing_gage'), geomChecks['Web Bolts'].max_spacing_row, true);
    }
    report.addTableSection(getTranslation('geometry_spacing_checks_title'), { headers: [getTranslation('check_column_header'), getTranslation('actual_in'), getTranslation('min_required_in'), getTranslation('status')], rows: geomRows });
    report.render('results-container');
    populateReportDiagrams();
    if (typeof attachReportEventListeners === 'function') {
        attachReportEventListeners('results-container', { reportId: 'splice-report-content', filenamePrefix: 'Splice-Report', onSendToCombos: null, toggleTexts: { show: 'Show', hide: 'Hide', showAll: 'Show All', hideAll: 'Hide All' } });
    }
}

// --- Initialization ---
const inputIds = [
    'design_method', 'jurisdiction', 'global_fos', 'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Fy', 'member_Fu', 
    'member_material', 'member_Zx', 'member_Sx', 'M_load', 'V_load', 'Axial_load', 'develop_capacity_check', 'deformation_is_consideration', 'g_gage_fp', 'optimize_bolts_check', 'optimize_diameter_check', 'optimize_web_plates_check', 'optimize_flange_plates_check',
    'num_flange_plates', 'flange_plate_material', 'flange_plate_Fy', 'flange_plate_Fu', 'H_fp', 't_fp', 'L_fp',
    'flange_plate_material_inner', 'flange_plate_Fy_inner', 'flange_plate_Fu_inner', 'H_fp_inner', 't_fp_inner', 'L_fp_inner',
    'Nc_fp', 'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp',
    'num_web_plates', 'web_plate_material', 'web_plate_Fy', 'web_plate_Fu', 'H_wp', 't_wp', 'L_wp', 'connection_type', 'faying_surface_class',
    'Nc_wp', 'Nr_wp', 'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp',
    'D_fp', 'bolt_grade_fp', 'threads_included_fp', 'D_wp', 'bolt_grade_wp', 'threads_included_wp',
    'aisc_shape_select'
];

const handleRunSpliceCheck = createCalculationHandler({
    inputIds: inputIds,
    storageKey: 'splice-inputs',
    validationRuleKey: 'splice',
    validatorFunction: (inputs) => {
        const { errors, warnings } = validateInputs(Object.keys(inputs), validationRules.splice); 
        const clearWebDepth = inputs.member_d - (2 * inputs.member_tf);
        if (inputs.H_wp > clearWebDepth) { errors.push(`Web plate height (${inputs.H_wp}") cannot exceed the beam's clear web depth (${clearWebDepth.toFixed(3)}").`); }
        return { errors, warnings };
    },
    calculatorFunction: async (rawInputs) => {
        // --- INJECT BATCH LOADS ---
        if (typeof spliceBatch !== 'undefined' && spliceBatch.cases.length > 0) {
            // Map the first row of batch inputs to the main load inputs for the primary run
            const c = spliceBatch.cases[0];
            rawInputs.M_load = c.Mu;
            rawInputs.V_load = c.Vu;
            rawInputs.Axial_load = c.Pu;
            // Also prepare full batch payload if needed by backend
            rawInputs.batch_loads = spliceBatch.cases.map(c => ({
                M_load: c.Mu, V_load: c.Vu, Axial_load: c.Pu
            }));
        }

        if (window.eel && window.eel.calculate_splice_all) {
            console.log("Using Python Backend for Splice Calculation...");
            try {
                let result = await window.eel.calculate_splice_all(rawInputs)();
                if (result.error) throw new Error(result.error);
                if (Array.isArray(result)) {
                    // Backend returns list for batch loads; use first result for main report
                    result = result.length > 0 ? result[0] : {}; 
                }
                return result;
            } catch (e) {
                console.error("Backend call failed, falling back to local JS.", e);
                return spliceCalculator.run(rawInputs);
            }
        }
        return spliceCalculator.run(rawInputs);
    },
    renderFunction: renderResults,
    resultsContainerId: 'results-container',
    buttonId: 'run-check-btn'
});

initializeApp({
    inputIds: inputIds,
    calculationHandler: handleRunSpliceCheck,
    onReady: () => {
        populateMaterialDropdowns();
        populateBoltGradeDropdowns();
        populateBoltDiameterDropdowns();
        const shapeTypeSelect = document.getElementById('member_shape_type');
        if (shapeTypeSelect) shapeTypeSelect.addEventListener('change', populateShapeDropdown);
        populateShapeDropdown(); 
        document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);

        const debouncedRedraw = debounce(() => { draw3dSpliceDiagram(); draw2dSpliceDiagram(); }, 400);
        diagramInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', debouncedRedraw);
        });
        
        const toggleDimensionsBtn = document.getElementById('toggle-dimensions-btn');
        if (toggleDimensionsBtn) {
            toggleDimensionsBtn.addEventListener('click', () => {
                if (dimensionElements) {
                    areDimensionsVisible = !areDimensionsVisible;
                    dimensionElements.meshes.forEach(mesh => { if (mesh) mesh.isVisible = areDimensionsVisible; });
                    dimensionElements.labels.forEach(label => { if (label) label.isVisible = areDimensionsVisible; });
                    toggleDimensionsBtn.textContent = areDimensionsVisible ? 'Hide Dimensions' : 'Show Dimensions';
                }
            });
        }

        // --- BATCH TABLE RESTORE ---
        document.getElementById("add-case-btn")?.addEventListener("click", addBatchRow);
        const batchTable = document.getElementById("batch-table");
        if(batchTable) {
            batchTable.addEventListener("input", handleBatchInput);
            batchTable.addEventListener("click", handleBatchAction);
        }
        renderBatchTable();

        setTimeout(() => { draw3dSpliceDiagram(); draw2dSpliceDiagram(); }, 500);
    }
});

function gatherInputsFromIds(ids) {
    const res = {};
    ids.forEach(id => { 
        const el = document.getElementById(id); 
        if (el) {
            // FIX: Checkbox values are booleans, not 'on' strings
            res[id] = el.type === 'checkbox' ? el.checked : el.value; 
        }
    });
    return res;
}

function debounce(func, wait) {
    let timeout;
    return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
}

// --- BATCH HELPERS ---
function renderBatchTable() {
    const tbody = document.querySelector("#batch-table tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    spliceBatch.cases.forEach((c, index) => {
        const row = document.createElement("tr");
        row.className = "hover:bg-gray-50 dark:hover:bg-gray-700/50 group";
        row.innerHTML = `
            <td class="p-1"><input type="number" data-idx="${index}" data-field="Mu" value="${c.Mu}" class="w-full bg-transparent border-none focus:ring-0 p-1 text-center font-mono placeholder-gray-400" placeholder="0"></td>
            <td class="p-1"><input type="number" data-idx="${index}" data-field="Vu" value="${c.Vu}" class="w-full bg-transparent border-none focus:ring-0 p-1 text-center font-mono placeholder-gray-400" placeholder="0"></td>
            <td class="p-1"><input type="number" data-idx="${index}" data-field="Pu" value="${c.Pu}" class="w-full bg-transparent border-none focus:ring-0 p-1 text-center font-mono placeholder-gray-400" placeholder="0"></td>
            <td class="p-1 text-center"><button class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity delete-case-btn" data-idx="${index}">&times;</button></td>
        `;
        tbody.appendChild(row);
    });
}
function addBatchRow() { spliceBatch.cases.push({ Mu: 0, Vu: 0, Pu: 0 }); renderBatchTable(); }
function handleBatchInput(e) {
    if (e.target.tagName !== "INPUT") return;
    const idx = parseInt(e.target.dataset.idx); const field = e.target.dataset.field;
    let val = parseFloat(e.target.value); if(isNaN(val)) val = 0;
    if (spliceBatch.cases[idx]) { spliceBatch.cases[idx][field] = val; }
}
function handleBatchAction(e) {
    if (e.target.classList.contains("delete-case-btn")) {
        const idx = parseInt(e.target.dataset.idx);
        if (spliceBatch.cases.length > 1) { spliceBatch.cases.splice(idx, 1); renderBatchTable(); } 
        else { spliceBatch.cases[0] = { Mu: 0, Vu: 0, Pu: 0 }; renderBatchTable(); }
    }
}