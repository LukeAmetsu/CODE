// --- Global variables for the 3D scene ---
let bjsEngine, bjsScene, bjsGuiTexture;
let dimensionElements = { meshes: [], labels: [] };
let isFirstDraw = true; // Flag to control camera auto-fitting
let areDimensionsVisible = true; // Flag to track dimension visibility state

// --- Define all Input IDs that affect the diagram's geometry ---
const diagramInputIds = [
    'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'num_flange_plates',
    'H_fp', 't_fp', 'L_fp', 'H_fp_inner', 't_fp_inner', 'L_fp_inner', 'D_fp', 'Nc_fp',
    'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp', 'g_gage_fp',
    'num_web_plates', 'H_wp', 't_wp', 'L_wp', 'D_wp', 'Nc_wp', 'Nr_wp',
    'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp'
];

// --- Master Bolt Cache ---
let masterBolts = {};

// --- Batch / Unified Load Logic ---
const spliceBatch = {
    cases: [{ Mu: 0, Vu: 0, Pu: 0 }], // Start with one default case
    selectedIndex: -1
};

// --- 2D Drawing Logic ---
// --- 2D Drawing Logic ---
// --- NEW MULTI-VIEW 2D DIAGRAM ---
// Replaces the old function to support Elevation, Plan, Section views
function draw2dSpliceDiagram() { // Re-declaring to overwrite
    const svgId = "splice-2d-diagram";
    const svg = document.getElementById(svgId);
    if (!svg) return;

    // Clear existing SVG
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
    
    // Set natural units (roughly pixels but interpreted as scale)
    // We will draw in "inches" * 10 or something similar? 
    // No, let's draw in actual INCHES and let viewBox handle the pixel mapping.
    // SVG is dimensionless until rendered.
    
    const ns = "http://www.w3.org/2000/svg";
    const inputs = gatherInputsFromIds(diagramInputIds);
    
    // Parse dimensions (Natural Units = Inches)
    // Default to valid numbers to prevent crashes
    const d = parseFloat(inputs.member_d) || 18;
    const bf = parseFloat(inputs.member_bf) || 7.5;
    const tf = parseFloat(inputs.member_tf) || 0.57;
    const tw = parseFloat(inputs.member_tw) || 0.355;
    const gap = parseFloat(inputs.gap) || 0;
    
    // Plate Dimensions
    const H_wp = parseFloat(inputs.H_wp) || 0;
    const t_wp = parseFloat(inputs.t_wp) || 0;
    const L_wp = parseFloat(inputs.L_wp) || 0;
    const H_fp = parseFloat(inputs.H_fp) || 0;
    const t_fp = parseFloat(inputs.t_fp) || 0;
    const L_fp = parseFloat(inputs.L_fp) || 0;
    const H_fp_inner = parseFloat(inputs.H_fp_inner) || 0;
    const t_fp_inner = parseFloat(inputs.t_fp_inner) || 0;
    const L_fp_inner = parseFloat(inputs.L_fp_inner) || 0;
    const num_fp = parseInt(inputs.num_flange_plates) || 0;
    
    // Bolts
    const D_web = parseFloat(inputs.D_wp) || 0;
    const D_flange = parseFloat(inputs.D_fp) || 0;

    // Create a main group for all content
    // We will use a group that flips Y so Positive Y is UP (Cartesian style for easier drafting)
    const mainG = document.createElementNS(ns, "g");
    mainG.setAttribute("transform", "scale(1, -1)"); 
    svg.appendChild(mainG);
    
    // --- Drawing Helpers (Unit = Inch) ---
    // Scaled values: If 1 unit = 1 inch, then strokes need to be small (e.g. 0.05)
    // Text needs to be readable relative to object size.
    
    const objColor = "#000";
    const objFill = "#fff";
    const dimColor = "#000";
    const centerLineStroke = "#444";
    
    // Line Weights (in inches)
    const thickWidth = 0.15; 
    const thinWidth = 0.05;
    
    // Font Size (Scales with beam depth to remain readable)
    const fSize = Math.max(1.0, d / 20); 

    function drawLine(parent, x1, y1, x2, y2, stroke, width, dashed=false) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", x1); line.setAttribute("y1", y1);
        line.setAttribute("x2", x2); line.setAttribute("y2", y2);
        line.setAttribute("stroke", stroke);
        line.setAttribute("stroke-width", width);
        if (dashed) line.setAttribute("stroke-dasharray", `${width*10},${width*5}`);
        parent.appendChild(line);
        return line;
    }
    
    function drawRect(parent, x, y, w, h, stroke, width, fill) {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", x); rect.setAttribute("y", y);
        rect.setAttribute("width", w); rect.setAttribute("height", h);
        rect.setAttribute("fill", fill);
        rect.setAttribute("stroke", stroke);
        rect.setAttribute("stroke-width", width);
        // vector-effect non-scaling-stroke? No, we want it to scale.
        parent.appendChild(rect);
    }
    
    function drawText(parent, x, y, textStr, size, anchor="middle", baseline="middle", rotate=0) {
        const gText = document.createElementNS(ns, "g");
        // Flip back within the text group so text isn't upside down
        // If rotate is needed, apply it after flip? 
        // Translate -> Scale(flip) -> Rotate? 
        // Note: SVG rotation is clockwise. If we are flipped Y (scale 1, -1), CW rotation becomes CCW visually?
        
        let transform = `translate(${x}, ${y}) scale(1, -1)`;
        if(rotate !== 0) transform += ` rotate(${rotate})`;
        
        gText.setAttribute("transform", transform); 
        
        const text = document.createElementNS(ns, "text");
        text.textContent = textStr;
        text.setAttribute("font-size", size);
        text.setAttribute("font-family", "Arial, sans-serif");
        text.setAttribute("fill", "#000");
        text.setAttribute("text-anchor", anchor);
        text.setAttribute("dominant-baseline", baseline);
        gText.appendChild(text);
        parent.appendChild(gText);
    }

    // --- VIEW 1: ELEVATION (Top Left) ---
    const elevG = document.createElementNS(ns, "g");
    elevG.setAttribute("id", "elevation-view");
    mainG.appendChild(elevG);
    
    // Beam Length
    const beamLen = Math.max(L_wp, L_fp, 24) * 0.7; 
    
    // Left Beam
    drawRect(elevG, -beamLen, -d/2, beamLen - gap/2, d, objColor, thickWidth, objFill); // Outline
    drawLine(elevG, -beamLen, d/2 - tf, -gap/2, d/2 - tf, objColor, thinWidth); // Top K-line
    drawLine(elevG, -beamLen, -d/2 + tf, -gap/2, -d/2 + tf, objColor, thinWidth); // Bot K-line
    
    // Right Beam
    drawRect(elevG, gap/2, -d/2, beamLen - gap/2, d, objColor, thickWidth, objFill);
    drawLine(elevG, gap/2, d/2 - tf, beamLen, d/2 - tf, objColor, thinWidth);
    drawLine(elevG, gap/2, -d/2 + tf, beamLen, -d/2 + tf, objColor, thinWidth);
    
    // Web Plate (dashed if behind? usually we assume front for simple diagram, or visible)
    if (inputs.num_web_plates > 0) {
        // Draw Web Plate
        drawRect(elevG, -L_wp/2, -H_wp/2, L_wp, H_wp, objColor, thickWidth, "rgba(200,200,200,0.3)");
        // Bolts (Simplified as + marks)
        // ... (Skipping detailed bolts for brevity, usually circles)
    }
    
    // Flange Plates
    if (num_fp > 0) {
        drawRect(elevG, -L_fp/2, d/2, L_fp, t_fp, objColor, thickWidth, "#ddd"); // Top
        drawRect(elevG, -L_fp/2, -d/2 - t_fp, L_fp, t_fp, objColor, thickWidth, "#ddd"); // Bot
    }
    if (num_fp === 2) {
        // Inner Plates (Hidden lines? or distinct?)
        // Draw dashed
         const innerY1 = d/2 - tf - t_fp_inner;
         const innerY2 = -d/2 + tf;
         // Just rects
         drawRect(elevG, -L_fp_inner/2, innerY1, L_fp_inner, t_fp_inner, objColor, thinWidth, "#eee");
         drawRect(elevG, -L_fp_inner/2, innerY2, L_fp_inner, t_fp_inner, objColor, thinWidth, "#eee");
    }
    
    drawText(elevG, 0, -d/2 - t_fp - fSize*2, "ELEVATION", fSize*1.2);


    // --- VIEW 2: PLAN (Bottom Left) ---
    // Offset Y down. Since Y is UP, we subtract.
    // Gap roughly d + 20%
    const planYOffset = -(d + Math.max(t_fp, 2) + 5); 
    const planG = document.createElementNS(ns, "g");
    planG.setAttribute("transform", `translate(0, ${planYOffset})`);
    mainG.appendChild(planG);
    
    // Beams (Top down view of flanges)
    drawRect(planG, -beamLen, -bf/2, beamLen - gap/2, bf, objColor, thickWidth, objFill); // Left
    drawRect(planG, gap/2, -bf/2, beamLen - gap/2, bf, objColor, thickWidth, objFill); // Right
    
    // Web (Hidden)
    drawLine(planG, -beamLen, tw/2, -gap/2, tw/2, objColor, thinWidth, true);
    drawLine(planG, -beamLen, -tw/2, -gap/2, -tw/2, objColor, thinWidth, true);
    drawLine(planG, gap/2, tw/2, beamLen, tw/2, objColor, thinWidth, true);
    drawLine(planG, gap/2, -tw/2, beamLen, -tw/2, objColor, thinWidth, true);
    
    // Flange Plates (Top only visible)
    if (num_fp > 0) {
        drawRect(planG, -L_fp/2, -H_fp/2, L_fp, H_fp, objColor, thickWidth, "rgba(200,200,200,0.5)");
    }
    
    drawText(planG, 0, -bf/2 - fSize*2, "PLAN", fSize*1.2);


    // --- VIEW 3: SECTION (Right) ---
    // Offset X right.
    const sectXOffset = beamLen + 10;
    const sectG = document.createElementNS(ns, "g");
    sectG.setAttribute("transform", `translate(${sectXOffset}, 0)`);
    mainG.appendChild(sectG);
    
    // I-Shape
    drawRect(sectG, -bf/2, d/2 - tf, bf, tf, objColor, thickWidth, objFill); // Top Flange
    drawRect(sectG, -bf/2, -d/2, bf, tf, objColor, thickWidth, objFill); // Bot Flange
    drawRect(sectG, -tw/2, -d/2 + tf, tw, d - 2*tf, objColor, thickWidth, objFill); // Web
    
    // Plates (Cut)
    // Web Plates
    if (inputs.num_web_plates > 0) {
        const wpX = tw/2;
        drawRect(sectG, wpX, -H_wp/2, t_wp, H_wp, objColor, thickWidth, "url(#hatch)"); // Right side
        drawRect(sectG, -wpX - t_wp, -H_wp/2, t_wp, H_wp, objColor, thickWidth, "url(#hatch)"); // Left side
    }
    // Flange Plates
    if (num_fp > 0) {
        drawRect(sectG, -H_fp/2, d/2, H_fp, t_fp, objColor, thickWidth, "url(#hatch)"); // Top
        drawRect(sectG, -H_fp/2, -d/2 - t_fp, H_fp, t_fp, objColor, thickWidth, "url(#hatch)"); // Bot
    }
    
    drawText(sectG, 0, -d/2 - t_fp - fSize*2, "SECTION", fSize*1.2);

    // --- ZOOM LOGIC ---
    // Use setTimeout to ensure DOM is updated before BBox calc (though sync in most browsers)
    setTimeout(() => {
        try {
            const bbox = mainG.getBBox();
            if (bbox && bbox.width > 0 && bbox.height > 0) {
                // Determine padding (e.g. 10%)
                const padX = bbox.width * 0.1;
                const padY = bbox.height * 0.1;
                
                // Set viewBox
                // bbox values are in user units (inches).
                // Since mainG is vertically flipped, Y coordinates are inverted?
                // SVG getBBox returns {x, y, width, height} in the current user coordinate system *of the element*? 
                // Or of the parent?
                // Actually, let's just use the raw values.
                // If mainG has scale(1, -1), then drawing at y=10 puts it at SVG y=-10.
                // So bbox.y will be negative.
                // viewBox expects "min-x min-y width height" in user units of the OUTERMOST viewport.
                // But we applied the transform to mainG. 
                // The viewBox applies to the root SVG.
                // The root SVG has NO transform.
                // Wait. If mainG transforms (1, -1), then a point (10, 10) inside mainG 
                // corresponds to (10, -10) in the root SVG space.
                // So we need to calculate the bounding box in the ROOT SVG space.
                // mainG.getBBox() returns the box in mainG's LOCAL space (before transform).
                // So if we drew at Y=10, bbox says Y=10.
                // But in root space it is Y=-10.
                
                // So:
                // min_x_root = bbox.x
                // max_x_root = bbox.x + bbox.width
                // min_y_root = - (bbox.y + bbox.height)  <-- Top of the shape (highest visual point)
                // max_y_root = - bbox.y                  <-- Bottom of the shape (lowest visual point)
                
                // Let's verify:
                // Drawn at Y=10 (top), Height=5. Top=15, Bot=10.
                // In root: Top=-15, Bot=-10.
                // Root Y increases down. So -15 is higher than -10.
                // So min-y is -15.
                
                const minX = bbox.x - padX;
                const minY = -(bbox.y + bbox.height) - padY;
                const width = bbox.width + padX*2;
                const height = bbox.height + padY*2;
                
                svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
            }
        } catch(e) {
            console.error("Auto-zoom failed", e);
        }
    }, 50);
}
    // --- ZOOM EXTENTS (Automatic Scaling) ---
    // Calculate bounding box of all content
    // We created 'g' which contains everything.
    // SVG getBBox() works in user coordinate system (scaled).
    // But we need to handle this carefully.
    // Better approach for robust scaling:
    // 1. Get bbox of the GROUP 'g'.
    // 2. Set SVG viewBox to match that bbox with padding.
    // 3. Remove the hardcoded 'scale' translation from 'g' and work in natural units (inches).
    
    // REFACTORING TO USE NATURAL UNITS:
    // This function was drawing in pixels assuming a scale factor. 


// --- NEW MULTI-VIEW 2D DIAGRAM ---
// Replaces the old function to support Elevation, Plan, Section views
function draw2dSpliceDiagram() { // Re-declaring to overwrite
    const svgId = "splice-2d-diagram";
    const svg = document.getElementById(svgId);
    if (!svg) return;

    // Clear existing SVG
    while (svg.firstChild) {
        svg.removeChild(svg.firstChild);
    }
    
    const ns = "http://www.w3.org/2000/svg";
    const inputs = gatherInputsFromIds(diagramInputIds);
    
    // Parse dimensions (Natural Units = Inches)
    const d = parseFloat(inputs.member_d) || 18;
    const bf = parseFloat(inputs.member_bf) || 7.5;
    const tf = parseFloat(inputs.member_tf) || 0.57;
    const tw = parseFloat(inputs.member_tw) || 0.355;
    const gap = parseFloat(inputs.gap) || 0;
    
    // Plate Dimensions
    const H_wp = parseFloat(inputs.H_wp) || 0;
    const t_wp = parseFloat(inputs.t_wp) || 0;
    const L_wp = parseFloat(inputs.L_wp) || 0;
    const H_fp = parseFloat(inputs.H_fp) || 0;
    const t_fp = parseFloat(inputs.t_fp) || 0;
    const L_fp = parseFloat(inputs.L_fp) || 0;
    const L_fp_inner = parseFloat(inputs.L_fp_inner) || 0;
    const num_fp = parseInt(inputs.num_flange_plates) || 0;

    // Create a main group for all content, drawing in INCHES
    const mainG = document.createElementNS(ns, "g");
    // Initially set scale to 1, -1 to have Y up.
    mainG.setAttribute("transform", "scale(1, -1)"); 
    svg.appendChild(mainG);
    
    // --- Drawing Helpers (Unit = Inch) ---
    const objColor = "#000";
    const objFill = "#fff";
    const dimColor = "#000";
    const centerLineStroke = "#444";
    const thickWidth = 0.5; // Scaled down because we are zooming in? No, this is in inches. 1/8"? Too thick.
    // If we map 1 inch = 10 pixels roughly on screen...
    // Let's assume we want line weights relative to the drawing size.
    // For now, let's use fixed small values and rely on vector scaling.
    const objStroke = 0.15; 
    const thinStroke = 0.05;
    const fontSize = 1.5; // Text is 1.5 inches high? A bit large for small beams. 
    // Let's make font size relative to beam depth 'd', minimum 0.8
    const fSize = Math.max(0.8, d / 20); 

    function drawLine(parent, x1, y1, x2, y2, stroke, width, dashed=false) {
        const line = document.createElementNS(ns, "line");
        line.setAttribute("x1", x1); line.setAttribute("y1", y1);
        line.setAttribute("x2", x2); line.setAttribute("y2", y2);
        line.setAttribute("stroke", stroke);
        line.setAttribute("stroke-width", width);
        if (dashed) line.setAttribute("stroke-dasharray", `${width*5},${width*3}`);
        parent.appendChild(line);
        return line;
    }
    
    function drawRect(parent, x, y, w, h, stroke, width, fill) {
        const rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", x); rect.setAttribute("y", y);
        rect.setAttribute("width", w); rect.setAttribute("height", h);
        rect.setAttribute("fill", fill);
        rect.setAttribute("stroke", stroke);
        rect.setAttribute("stroke-width", width);
        parent.appendChild(rect);
    }
    
    function drawText(parent, x, y, textStr, size, anchor="middle", baseline="middle") {
        const gText = document.createElementNS(ns, "g");
        gText.setAttribute("transform", `translate(${x}, ${y}) scale(1, -1)`); // Flip back
        const text = document.createElementNS(ns, "text");
        text.textContent = textStr;
        text.setAttribute("font-size", size);
        text.setAttribute("font-family", "Arial, sans-serif");
        text.setAttribute("fill", "#000");
        text.setAttribute("text-anchor", anchor);
        text.setAttribute("dominant-baseline", baseline);
        gText.appendChild(text);
        parent.appendChild(gText);
    }

    // --- VIEW 1: ELEVATION (Top Left) ---
    const elevG = document.createElementNS(ns, "g");
    elevG.setAttribute("id", "elevation-view");
    mainG.appendChild(elevG);
    
    // Draw Beams (Elevation)
    const beamLen = Math.max(L_wp, L_fp, 24) * 0.7; // Shorter local break
    
    // Left Beam
    drawRect(elevG, -beamLen, -d/2, beamLen - gap/2, d, objColor, objStroke, objFill); // Flange/Web outline
    drawLine(elevG, -beamLen, d/2 - tf, -gap/2, d/2 - tf, objColor, thinStroke); // Flange inner line top
    drawLine(elevG, -beamLen, -d/2 + tf, -gap/2, -d/2 + tf, objColor, thinStroke); // Flange inner line bot
    
    // Right Beam
    drawRect(elevG, gap/2, -d/2, beamLen - gap/2, d, objColor, objStroke, objFill);
    drawLine(elevG, gap/2, d/2 - tf, beamLen, d/2 - tf, objColor, thinStroke);
    drawLine(elevG, gap/2, -d/2 + tf, beamLen, -d/2 + tf, objColor, thinStroke);
    
    // Web Plate
    if (inputs.num_web_plates > 0) {
        // Dashed lines for hidden web info? Or solid if visible? 
        // In elevation, web plate is visible.
        drawRect(elevG, -L_wp/2, -H_wp/2, L_wp, H_wp, objColor, objStroke, "rgba(200,200,200,0.5)");
    }
    
    // Flange Plates (Outer)
    if (num_fp > 0) {
        drawRect(elevG, -L_fp/2, d/2, L_fp, t_fp, objColor, objStroke, "rgba(200,200,200,0.5)"); // Top
        drawRect(elevG, -L_fp/2, -d/2 - t_fp, L_fp, t_fp, objColor, objStroke, "rgba(200,200,200,0.5)"); // Bot
    }
    
    drawText(elevG, 0, -d/2 - t_fp - fSize*2, "ELEVATION", fSize*1.2);


    // --- VIEW 2: TOP / PLAN (Bottom Left) ---
    // Offset Y by - (d + margins)
    const planYOffset = -(d + Math.max(beamLen, L_fp) + 5); 
    const planG = document.createElementNS(ns, "g");
    planG.setAttribute("transform", `translate(0, ${planYOffset})`);
    mainG.appendChild(planG);
    
    // Draw Beams (Plan View - looking at Flanges)
    drawRect(planG, -beamLen, -bf/2, beamLen - gap/2, bf, objColor, objStroke, objFill); // Left Beam
    drawRect(planG, gap/2, -bf/2, beamLen - gap/2, bf, objColor, objStroke, objFill); // Right Beam
    
    // Web (Hidden dashed lines down center)
    drawLine(planG, -beamLen, tw/2, -gap/2, tw/2, objColor, thinStroke, true);
    drawLine(planG, -beamLen, -tw/2, -gap/2, -tw/2, objColor, thinStroke, true);
    drawLine(planG, gap/2, tw/2, beamLen, tw/2, objColor, thinStroke, true);
    drawLine(planG, gap/2, -tw/2, beamLen, -tw/2, objColor, thinStroke, true);
    
    // Flange Plates (Top)
    if (num_fp > 0) {
        drawRect(planG, -L_fp/2, -H_fp/2, L_fp, H_fp, objColor, objStroke, "rgba(200,200,200,0.5)");
    }
    drawText(planG, 0, -bf/2 - fSize*2, "PLAN VIEW", fSize*1.2);


    // --- VIEW 3: SECTION (Right) ---
    // Offset X by beamLen + margins
    const sectXOffset = beamLen + 10;
    const sectG = document.createElementNS(ns, "g");
    sectG.setAttribute("transform", `translate(${sectXOffset}, 0)`);
    mainG.appendChild(sectG);
    
    // Draw I-Section
    // Flanges
    drawRect(sectG, -bf/2, d/2 - tf, bf, tf, objColor, objStroke, objFill); // Top
    drawRect(sectG, -bf/2, -d/2, bf, tf, objColor, objStroke, objFill); // Bot
    // Web
    drawRect(sectG, -tw/2, -d/2 + tf, tw, d - 2*tf, objColor, objStroke, objFill);
    
    // Web Plates (Left and/or Right side)
    if (inputs.num_web_plates > 0) {
         // Assuming 2 plates
         drawRect(sectG, -tw/2 - t_wp, -H_wp/2, t_wp, H_wp, objColor, objStroke, "#bbb"); // Left
         drawRect(sectG, tw/2, -H_wp/2, t_wp, H_wp, objColor, objStroke, "#bbb"); // Right
    }
    
    // Flange Plates
    if (num_fp > 0) {
        drawRect(sectG, -H_fp/2, d/2, H_fp, t_fp, objColor, objStroke, "#bbb"); // Top Outer
        drawRect(sectG, -H_fp/2, -d/2 - t_fp, H_fp, t_fp, objColor, objStroke, "#bbb"); // Bot Outer
    }
    
    drawText(sectG, 0, -d/2 - t_fp - fSize*2, "SECTION", fSize*1.2);


    // --- POST-DRAW SCALING ---
    // Now that everything is drawn in inches, calculate BBox and fit ViewBox
    setTimeout(() => {
        try {
            const bbox = mainG.getBBox();
            if (bbox) {
                // Add 10% padding
                const pad = Math.max(bbox.width, bbox.height) * 0.1;
                // Since Y is flipped (scale 1, -1), the bbox.y is likely negative (top) or behaves oddly.
                // In SVG coord system with scale(1,-1), Y increases DOWN visually? No.
                // Standard SVG: Y down. Transform(1, -1): Y up.
                // getBBox returns coords in the ELEMENT'S system? No, in USER units *before* transform usually?
                // Actually it's easiest to set viewBox to: x, y, w, h
                
                // Construct viewBox string
                // Note: with scale(1, -1), the "min-y" is physically the bottom in SVG coords? 
                // Let's use specific values.
                
                // Correct approach: Set viewBox to cover the extent.
                // Logic: The content spans from bbox.x to bbox.x+width, and bbox.y to bbox.y+height.
                // But we have a FLIP transform on mainG. 
                // Let's remove the flip from mainG and apply it to individual Y coords? 
                // Or just adjust viewBox.
                // If mainG is flipped, positive Y is UP.
                // So min-y is the BOTTOM of the headers (Plan View label).
                // max-y is the TOP of the headers (Elevation label).
                // Let's just use the numbers directly.
                
                let vx = bbox.x - pad;
                let vy = bbox.y - pad;
                let vw = bbox.width + pad*2;
                let vh = bbox.height + pad*2;
                
                // Because of the scale(1, -1) on mainG, the coordinate system is flipped.
                // However, SVG viewBox applies to the *viewport*, before the transform inside?
                // No, viewBox defines the "user coordinate system" of the root SVG.
                // mainG transforms *from* that system.
                
                // Let's simplify:
                // If I want to see Y from -50 to +50.
                // ViewBox should be "x_min -y_max width height" if using Cartesian?
                // No, SVG is always Y-down.
                // So if we draw Y=10 (Up), it ends up at -10 in SVG pixels.
                // So our BBox.y will be negative for 'high' items.
                
                // Keep it simple: Ask browser for BBox. It returns {x, y, width, height}.
                // Just use that.
                
                svg.setAttribute("viewBox", `${vx} ${vy} ${vw} ${vh}`);
            }
        } catch(e) {
            console.error("Scale Error", e);
        }

    }, 100);
}


/**
 * Creates or clones a detailed bolt mesh. A master mesh is created for each unique bolt size (diameter/thickness)
 * and subsequent requests for the same size will return a lightweight clone for performance.
 * @param {string} name - The base name for the bolt mesh.
 * @param {object} options - Bolt dimensions and position.
 * @param {number} options.diameter - The diameter of the bolt shank.
 * @param {number} options.thickness - The total thickness of the material being clamped.
 * @param {BABYLON.Vector3} options.position - The geometric center of the material being clamped.
 * @param {BABYLON.Scene} scene - The Babylon.js scene.
 * @returns {BABYLON.Mesh} The merged bolt mesh.
 */
function createBoltMesh(name, options, scene) {
    const { diameter, thickness, position } = options;
    if (!diameter || !thickness || isNaN(diameter) || isNaN(thickness)) return null;

    const masterBoltKey = `d${diameter.toFixed(3)}-t${thickness.toFixed(3)}`;
    let masterBolt = masterBolts[masterBoltKey];

    if (!masterBolt) {
        // --- Create the master bolt if it doesn't exist ---
        const headDiameter = diameter * 1.8;
        const headHeight = diameter * 0.65;
        const washerDiameter = diameter * 2.2;
        const washerHeight = diameter * 0.15;
        const shankLength = thickness + 2 * washerHeight + headHeight;

        // Create parts at the origin
        const shank = BABYLON.MeshBuilder.CreateCylinder("master_shank", { diameter, height: shankLength }, scene);
        const washer1 = BABYLON.MeshBuilder.CreateCylinder("master_washer1", { diameter: washerDiameter, height: washerHeight }, scene);
        washer1.position.y = thickness / 2 + washerHeight / 2;
        const head = BABYLON.MeshBuilder.CreateCylinder("master_head", { diameter: headDiameter, height: headHeight, tessellation: 6 }, scene);
        head.position.y = thickness / 2 + washerHeight + headHeight / 2;
        head.rotation.y = Math.PI / 6;
        const washer2 = BABYLON.MeshBuilder.CreateCylinder("master_washer2", { diameter: washerDiameter, height: washerHeight }, scene);
        washer2.position.y = -thickness / 2 - washerHeight / 2;
        const nut = BABYLON.MeshBuilder.CreateCylinder("master_nut", { diameter: headDiameter, height: headHeight, tessellation: 6 }, scene);
        nut.position.y = -thickness / 2 - washerHeight - headHeight / 2;
        nut.rotation.y = Math.PI / 6;

        masterBolt = BABYLON.Mesh.MergeMeshes([shank, head, nut, washer1, washer2], true, false, null, false, true);
        if (masterBolt) {
            masterBolt.name = masterBoltKey;
            masterBolt.isVisible = false; // Hide the master mesh
            masterBolts[masterBoltKey] = masterBolt; // Cache it
        } else {
            return null; // Failed to create master bolt
        }
    }

    // --- Clone the master bolt to create the new instance ---
    const boltInstance = masterBolt.clone(name, null, true);
    if (boltInstance) {
        boltInstance.position = position; // Move the instance to its final position
        boltInstance.isVisible = true; // Make the clone visible
    }

    return boltInstance;
}


/**
 * Draws an interactive 3D visualization of the splice connection using Babylon.js.
 */
/**
 * Draws an interactive 3D visualization of the splice connection using Babylon.js.
 */
function draw3dSpliceDiagram() {
    const canvas = document.getElementById("splice-3d-canvas");
    if (!canvas || typeof BABYLON === 'undefined') return;

    // --- 1. Engine & Scene Management ---
    // Check if we can reuse the existing engine to prevent visual glitched/lag
    let shouldCreateNewEngine = true;
    
    if (bjsEngine) {
        const currentCanvas = bjsEngine.getRenderingCanvas();
        if (currentCanvas === canvas) {
            // Engine is attached to the correct canvas. Keep it.
            shouldCreateNewEngine = false;
        } else {
            // Engine is detached or on wrong canvas. Dispose it.
            console.log("3D Debug: Engine detached. Disposing.");
            try { bjsEngine.dispose(); } catch (e) { console.warn(e); }
            bjsEngine = null;
        }
    }

    if (shouldCreateNewEngine || !bjsEngine) {
        console.log("3D Debug: Creating NEW Engine");
        bjsEngine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
        // Force resize listener only once per engine
        window.addEventListener('resize', () => bjsEngine && bjsEngine.resize());
    }

    // Always create a FRESH Scene (cheaper than Engine, ensures logic reset)
    if (bjsScene) {
        bjsScene.dispose();
    }
    bjsScene = new BABYLON.Scene(bjsEngine);
    
    // --- Environment & Setup ---
    const isDarkMode = document.documentElement.classList.contains('dark');
    bjsScene.clearColor = isDarkMode ? new BABYLON.Color4(0.08, 0.09, 0.11, 1) : new BABYLON.Color4(0.92, 0.94, 0.96, 1);
    
    if (!bjsScene.environmentTexture) {
         // Async load for environment, might pop in later
         bjsScene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/studio.env", bjsScene);
    }
    bjsScene.environmentIntensity = 0.6;
    bjsEngine.setHardwareScalingLevel(0.5); // High DPI for crisp lines

    // Expose globals
    window.bjsEngine = bjsEngine;
    window.bjsScene = bjsScene;
    bjsGuiTexture = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("UI", true, bjsScene);
    window.bjsGuiTexture = bjsGuiTexture;

    // --- Reset Caches ---
    masterBolts = {}; // Critical: Clear bolt cache since old meshes are disposed with the old scene
    dimensionElements = { meshes: [], labels: [] };
    
    // --- Camera ---
    // Use Perspective by default for now as it's more robust
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI / 2.5, Math.PI / 2.8, 60, BABYLON.Vector3.Zero(), bjsScene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 400;
    camera.wheelPrecision = 50;
    
    // --- Render Loop ---
    // Ensure we only have ONE render loop running
    bjsEngine.stopRenderLoop();
    bjsEngine.runRenderLoop(() => {
        if (bjsScene && bjsScene.activeCamera) {
            bjsScene.render();
        }
    });

    // --- Inputs ---


    // --- 5. Gather Inputs (Restored) ---
    const inputs = gatherInputsFromIds(diagramInputIds);
    inputs.gap = parseFloat(inputs.gap) || 0;
    inputs.member_d = parseFloat(inputs.member_d) || 0;
    inputs.member_bf = parseFloat(inputs.member_bf) || 0;
    inputs.member_tf = parseFloat(inputs.member_tf) || 0;
    inputs.member_tw = parseFloat(inputs.member_tw) || 0;
    inputs.t_fp = parseFloat(inputs.t_fp) || 0;
    inputs.L_fp = parseFloat(inputs.L_fp) || 0;
    inputs.H_fp = parseFloat(inputs.H_fp) || 0;
    inputs.t_fp_inner = parseFloat(inputs.t_fp_inner) || 0;
    inputs.L_fp_inner = parseFloat(inputs.L_fp_inner) || 0;
    inputs.H_fp_inner = parseFloat(inputs.H_fp_inner) || 0;
    inputs.t_wp = parseFloat(inputs.t_wp) || 0;
    inputs.L_wp = parseFloat(inputs.L_wp) || 0;
    inputs.H_wp = parseFloat(inputs.H_wp) || 0;
    inputs.num_flange_plates = parseInt(inputs.num_flange_plates, 10) || 0;
    inputs.num_web_plates = parseInt(inputs.num_web_plates, 10) || 0;
    
    if (!inputs.member_d) inputs.member_d = 18;
    if (!inputs.member_bf) inputs.member_bf = 7.5;
    if (!inputs.member_tf) inputs.member_tf = 0.57;
    if (!inputs.member_tw) inputs.member_tw = 0.355;


    // --- Clearing Previous Elements ---
    // Since we created a fresh scene, we don't need to manually dispose meshes.
    // Logic continues below...

    // --- 3. Lighting & Materials (Create only if they don't exist) ---
    if (bjsScene.lights.length === 0) {
        // Main Directional Light (Sun)
        const light = new BABYLON.DirectionalLight("dir01", new BABYLON.Vector3(-1, -2, -1), bjsScene);
        light.position = new BABYLON.Vector3(20, 40, 20);
        light.intensity = 1.5; // Reduced intensity (was 2.5)
        
        // Shadow Generator
        // Shadow Generator - REMOVED for Technical Drawing look
        // const shadowGenerator = new BABYLON.ShadowGenerator(2048, light);
        // shadowGenerator.useBlurExponentialShadowMap = true;
        // shadowGenerator.blurKernel = 32;

        // Ambient Light (Fill)
        const hemiLight = new BABYLON.HemisphericLight("hemi01", new BABYLON.Vector3(0, 1, 0), bjsScene);
        hemiLight.intensity = 0.6;
        hemiLight.groundColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    }


    // --- 3. Lighting & Materials ---
    // Updated Background Color for "Premium" look
    bjsScene.clearColor = isDarkMode ? new BABYLON.Color4(0.08, 0.09, 0.11, 1) : new BABYLON.Color4(0.92, 0.94, 0.96, 1);
    
    // Environment - Lower intensity for less glare
    if (!bjsScene.environmentTexture) {
         bjsScene.environmentTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("https://assets.babylonjs.com/environments/studio.env", bjsScene);
    }
    bjsScene.environmentIntensity = 0.6; // Reduced environment impact (was 0.8)

    // Enable High-DPI Rendering
    bjsEngine.setHardwareScalingLevel(0.5); // 2x Scaling for retina-like sharpness

    // const shadowGenerator = bjsScene.lights[0].getShadowGenerator();
    const shadowGenerator = null; // No shadows

    // Use existing materials or create them if they don't exist
    // Switch to StandardMaterial for reliable "Technical Drawing" colors
    const memberMaterial = bjsScene.getMaterialByName("memberMat") || new BABYLON.StandardMaterial("memberMat", bjsScene);
    memberMaterial.diffuseColor = new BABYLON.Color3.FromHexString("#FDB813"); // Construction Orange
    memberMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Low specular
    memberMaterial.emissiveColor = new BABYLON.Color3.FromHexString("#FDB813").scale(0.1); // Slight emissive to prevent darkness

    const plateMaterial = new BABYLON.StandardMaterial("plateMat", bjsScene);
    plateMaterial.diffuseColor = new BABYLON.Color3.FromHexString("#2E75B6"); // Engineering Blue
    plateMaterial.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    plateMaterial.emissiveColor = new BABYLON.Color3.FromHexString("#2E75B6").scale(0.1);

    const boltMaterial = bjsScene.getMaterialByName("boltMat") || new BABYLON.StandardMaterial("boltMat", bjsScene);
    boltMaterial.diffuseColor = new BABYLON.Color3.FromHexString("#64748b");
    boltMaterial.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    boltMaterial.metallic = 0.0; // Non-metallic look for dull galvanized
    boltMaterial.roughness = 1.0; // Maximum roughness to kill reflection


// ... (Create Dimension Helper Functions remain same) ...

    // --- Event Listeners for 3D Interaction --- inside setTimeout
    const toggleBtn = document.getElementById("toggle-dimensions-btn");
    const copyBtn = document.getElementById("copy-3d-btn");
    const resetBtn = document.getElementById("camera-reset-btn");
    
    if (toggleBtn) {
        // Clone to remove old listeners
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
        
        newToggleBtn.addEventListener("click", () => {
             areDimensionsVisible = !areDimensionsVisible;
             
             // Efficiently toggle visibility without redraw
             if (dimensionElements) {
                 if (dimensionElements.meshes) {
                     dimensionElements.meshes.forEach(m => m.isVisible = areDimensionsVisible);
                 }
                 if (dimensionElements.labels) {
                     dimensionElements.labels.forEach(l => l.isVisible = areDimensionsVisible);
                 }
             }

             newToggleBtn.textContent = areDimensionsVisible ? "Hide Dim" : "Show Dim";
             newToggleBtn.classList.toggle("bg-blue-100", areDimensionsVisible);
             newToggleBtn.classList.toggle("text-blue-700", areDimensionsVisible);
             newToggleBtn.classList.toggle("bg-gray-200", !areDimensionsVisible);
             newToggleBtn.classList.toggle("text-gray-600", !areDimensionsVisible);
        });
    }
    
    if (copyBtn) {
        // Clone to remove old listeners
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
        
        newCopyBtn.addEventListener("click", () => {
             if(bjsEngine && bjsScene) {
                 // Create screenshot with HIGH PRECISION (4x)
                 BABYLON.Tools.CreateScreenshot(bjsEngine, bjsScene.activeCamera, { precision: 4 }, (data) => {
                     // Data is base64 string
                     fetch(data)
                         .then(res => res.blob())
                         .then(blob => {
                             const item = new ClipboardItem({ "image/png": blob });
                             navigator.clipboard.write([item]).then(() => {
                                 const originalHTML = newCopyBtn.innerHTML;
                                 newCopyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>`;
                                 setTimeout(() => newCopyBtn.innerHTML = originalHTML, 2000);
                             });
                         });
                 });
             }
        });
    }
    
    if (resetBtn) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
         newResetBtn.addEventListener("click", () => {
             if(bjsScene && bjsScene.activeCamera) {
                 bjsScene.activeCamera.setTarget(BABYLON.Vector3.Zero());
                 bjsScene.activeCamera.alpha =  -Math.PI / 2.5;
                 bjsScene.activeCamera.beta = Math.PI / 2.8;
                 bjsScene.activeCamera.radius = 60;
             }
        });
    }

    const topViewBtn = document.getElementById("view-top-btn");
    if (topViewBtn) {
        const newTopBtn = topViewBtn.cloneNode(true);
        topViewBtn.parentNode.replaceChild(newTopBtn, topViewBtn);
        newTopBtn.addEventListener("click", () => {
             if(bjsScene && bjsScene.activeCamera) {
                 bjsScene.activeCamera.setTarget(BABYLON.Vector3.Zero());
                 // Top View: Beta near 0. Alpha 0 aligns Z horizontal? 
                 // If Z is horizontal, we want X vertical.
                 // Let's try Alpha -PI/2 to align with user preference (Standard Plan View)
                 // User said "Rotated", suggesting previous (-PI/2) was wrong? Or they want Z horizontal?
                 // Let's try Alpha = 0. (Side view usually Alpha 0 is looking from Z? No, Alpha 0 is +Z axis usually)
                 // If Beam is along Z.
                 // Looking down Y.
                 // We want Z horizontal.
                 bjsScene.activeCamera.alpha = 0; 
                 bjsScene.activeCamera.beta = 0.001; 
                 bjsScene.activeCamera.radius = 60;
                 
                 // Show Flange Dims, Hide Web Dims
                 if (dimensionElements) {
                     if (dimensionElements.meshes) {
                         dimensionElements.meshes.forEach(m => m.isVisible = (m.metadata?.viewType === 'flange' || m.metadata?.viewType === 'general'));
                     }
                     if (dimensionElements.labels) {
                         dimensionElements.labels.forEach(l => l.isVisible = (l.metadata?.viewType === 'flange' || l.metadata?.viewType === 'general'));
                     }
                 }
             }
        });
    }

    const sideViewBtn = document.getElementById("view-side-btn");
    if (sideViewBtn) {
        const newSideBtn = sideViewBtn.cloneNode(true);
        sideViewBtn.parentNode.replaceChild(newSideBtn, sideViewBtn);
        newSideBtn.addEventListener("click", () => {
             if(bjsScene && bjsScene.activeCamera) {
                 bjsScene.activeCamera.setTarget(BABYLON.Vector3.Zero());
                 bjsScene.activeCamera.alpha = 0; // Align with Top View (Beam Horizontal)
                 bjsScene.activeCamera.beta = Math.PI / 2;
                 bjsScene.activeCamera.radius = 60;

                 // Show Web Dims, Hide Flange Dims (except general?)
                 // Actually side view usually shows Web details.
                 if (dimensionElements) {
                     if (dimensionElements.meshes) {
                         dimensionElements.meshes.forEach(m => m.isVisible = (m.metadata?.viewType === 'web' || m.metadata?.viewType === 'general'));
                     }
                     if (dimensionElements.labels) {
                         dimensionElements.labels.forEach(l => l.isVisible = (l.metadata?.viewType === 'web' || l.metadata?.viewType === 'general'));
                     }
                 }
             }
        });
    }


    // --- 4. Helper functions for Dimensions ---
    const createLabel = (text, anchorMesh) => {
        const label = new BABYLON.GUI.Rectangle();
        label.height = "36px"; // Significantly taller
        label.width = `${text.length * 15}px`; // Much wider
        label.cornerRadius = 6;
        label.thickness = 1;
        label.background = isDarkMode ? "rgba(20, 20, 20, 0.85)" : "rgba(255, 255, 255, 0.9)";
        label.color = isDarkMode ? "#FFFFFF" : "#000000";
        bjsGuiTexture.addControl(label);
        dimensionElements.labels.push(label); // Track label
        const textBlock = new BABYLON.GUI.TextBlock();
        textBlock.text = text;
        textBlock.fontSize = 24; // Large, readable font
        textBlock.fontWeight = "bold"; 
        label.isVisible = areDimensionsVisible; // Set visibility based on global state
        label.addControl(textBlock);
        label.linkWithMesh(anchorMesh);
        return label;
    };

    const createDimensionLine = (name, value, start, end, offset, viewType) => {
        if (!value || value <= 0) return;
        // --- FIX: Use a single, consistent material for all dimension lines ---
        let lineMat = bjsScene.getMaterialByName("dimLineMat");
        if (!lineMat) {
            lineMat = new BABYLON.StandardMaterial("dimLineMat", bjsScene);
        }
        lineMat.emissiveColor = new BABYLON.Color3.FromHexString("#000000"); // Always Black for Technical look
        lineMat.disableLighting = true;

        const mainLine = BABYLON.MeshBuilder.CreateLines(`${name}_main`, { points: [start.add(offset), end.add(offset)] }, bjsScene);
        mainLine.material = lineMat;
        mainLine.isVisible = areDimensionsVisible; // Set visibility based on global state
        mainLine.metadata = { viewType }; // Store view type
        dimensionElements.meshes.push(mainLine);

        const extLine1 = BABYLON.MeshBuilder.CreateLines(`${name}_ext1`, { points: [start, start.add(offset.scale(1.05))] }, bjsScene);
        extLine1.material = lineMat;
        extLine1.isVisible = areDimensionsVisible; // Set visibility based on global state
        extLine1.metadata = { viewType }; // Store view type
        dimensionElements.meshes.push(extLine1);

        const extLine2 = BABYLON.MeshBuilder.CreateLines(`${name}_ext2`, { points: [end, end.add(offset.scale(1.05))] }, bjsScene);
        extLine2.material = lineMat;
        extLine2.isVisible = areDimensionsVisible; // Set visibility based on global state
        extLine2.metadata = { viewType }; // Store view type
        dimensionElements.meshes.push(extLine2);

        const labelAnchor = new BABYLON.AbstractMesh(`${name}_label_anchor`, bjsScene);
        labelAnchor.position = BABYLON.Vector3.Center(start, end).add(offset.scale(1.1)); // Slightly closer label
        const label = createLabel(`${name}=${value}"`, labelAnchor);
        if (label) label.metadata = { viewType }; // Store view type on label
    };


    // --- 5. Geometry Creation ---
    const createBeamMember = (name, length) => {
        const { member_d: d, member_bf: bf, member_tf: tf, member_tw: tw } = inputs;
        if (!d || !bf || !tf || !tw) return null;
        const topFlange = BABYLON.MeshBuilder.CreateBox(`${name}_tf`, { width: bf, height: tf, depth: length }, bjsScene);
        topFlange.position.y = (d - tf) / 2;
        const botFlange = BABYLON.MeshBuilder.CreateBox(`${name}_bf`, { width: bf, height: tf, depth: length }, bjsScene);
        botFlange.position.y = -(d - tf) / 2;
        const web = BABYLON.MeshBuilder.CreateBox(`${name}_web`, { width: tw, height: d - 2 * tf, depth: length }, bjsScene);
        const member = BABYLON.Mesh.MergeMeshes([topFlange, botFlange, web], true, true, undefined, false, true);
        if (member) {
            member.material = memberMaterial;
            if (shadowGenerator) shadowGenerator.addShadowCaster(member);
            member.receiveShadows = true;
        }
        return member;
    };

    const beamLength = Math.max(inputs.L_fp, inputs.L_wp, 24) || 24;
    const beam1 = createBeamMember("beam1", beamLength);
    if (beam1) beam1.position.z = -(inputs.gap / 2 + beamLength / 2);

    const beam2 = createBeamMember("beam2", beamLength);
    if (beam2) beam2.position.z = (inputs.gap / 2 + beamLength / 2);

    // Flange Plates
    if (inputs.L_fp > 0 && inputs.H_fp > 0 && inputs.t_fp > 0) {
        const outerFlangePlateTop = BABYLON.MeshBuilder.CreateBox("outer_fp_top", { width: inputs.H_fp, height: inputs.t_fp, depth: inputs.L_fp }, bjsScene);
        outerFlangePlateTop.material = plateMaterial;
        outerFlangePlateTop.position.y = inputs.member_d / 2 + inputs.t_fp / 2;
        if (shadowGenerator) shadowGenerator.addShadowCaster(outerFlangePlateTop);
        outerFlangePlateTop.receiveShadows = true;

        const outerFlangePlateBot = outerFlangePlateTop.clone("outer_fp_bot");
        outerFlangePlateBot.position.y = -(inputs.member_d / 2 + inputs.t_fp / 2);
    }

    if (inputs.num_flange_plates === 2 && inputs.L_fp_inner > 0 && inputs.H_fp_inner > 0 && inputs.t_fp_inner > 0) {
        const innerFlangePlateTop = BABYLON.MeshBuilder.CreateBox("inner_fp_top", { width: inputs.H_fp_inner, height: inputs.t_fp_inner, depth: inputs.L_fp_inner }, bjsScene);
        innerFlangePlateTop.material = plateMaterial;
        innerFlangePlateTop.position.y = inputs.member_d / 2 - inputs.member_tf - inputs.t_fp_inner / 2;
        if (shadowGenerator) shadowGenerator.addShadowCaster(innerFlangePlateTop);
        innerFlangePlateTop.receiveShadows = true;

        const innerFlangePlateBot = innerFlangePlateTop.clone("inner_fp_bot");
        innerFlangePlateBot.position.y = -(inputs.member_d / 2 - inputs.member_tf - inputs.t_fp_inner / 2);
    }

    // Web Plates
    for (let i = 0; i < inputs.num_web_plates; i++) {
        if (inputs.L_wp > 0 && inputs.H_wp > 0 && inputs.t_wp > 0) {
            const webPlate = BABYLON.MeshBuilder.CreateBox(`wp_${i}`, { width: inputs.t_wp, height: inputs.H_wp, depth: inputs.L_wp }, bjsScene);
            webPlate.material = plateMaterial;
            const offset = (inputs.member_tw / 2 + inputs.t_wp / 2 + (i > 0 ? inputs.t_wp : 0));
            webPlate.position.x = i % 2 === 0 ? offset : -offset;
            if (shadowGenerator) shadowGenerator.addShadowCaster(webPlate);
            webPlate.receiveShadows = true;
        }
    }

    // --- Bolt Creation ---
    const createWebBoltGroup = () => {
        const { D_wp, Nc_wp: Nc, Nr_wp: Nr, S4_col_spacing_wp: S_col, S5_row_spacing_wp: S_row, S6_end_dist_wp: S_end } = inputs;
        const D = parseFloat(D_wp); // Convert string from select to number
        if (!D || !Nc || !Nr) return;

        // Calculate total thickness of the web connection
        const thickness = inputs.member_tw + (inputs.num_web_plates * inputs.t_wp);
        const startY = -((Nr - 1) * S_row) / 2;

        for (let side = -1; side <= 1; side += 2) {
            for (let i = 0; i < Nc; i++) {
                const z_pos = side * (inputs.gap / 2 + S_end + i * S_col);
                for (let j = 0; j < Nr; j++) {
                    const y_pos = startY + j * S_row;

                    const bolt = createBoltMesh(`web_bolt_${side}_${i}_${j}`, {
                        diameter: D,
                        thickness: thickness,
                        position: new BABYLON.Vector3(0, y_pos, z_pos) // Web connection is centered at x=0
                    }, bjsScene);

                    if (bolt) {
                        bolt.material = boltMaterial;
                        bolt.rotation.z = Math.PI / 2; // Orient horizontally
                        if (shadowGenerator) shadowGenerator.addShadowCaster(bolt);
                    }
                }
            }
        }
    };
    // --- Bolt Creation ---

    const createFlangeBoltGroup = () => {
        const { D_fp, Nc_fp: Nc, Nr_fp: Nr, S1_col_spacing_fp: S_col, S2_row_spacing_fp: S_row, g_gage_fp: gage, S3_end_dist_fp: S_end, num_flange_plates, t_fp, member_tf, t_fp_inner, member_d } = inputs;
        const D = parseFloat(D_fp); // Convert string from select to number
        if (!D || !Nc || !Nr) return;

        let clamped_thickness, y_center_top;

        if (num_flange_plates === 2) {
            // Total thickness of the 3-layer stack (outer plate + flange + inner plate)
            clamped_thickness = t_fp + member_tf + t_fp_inner;
            // Geometric center of the 3-layer stack
            y_center_top = (member_d / 2) + t_fp / 2 - member_tf / 2 - t_fp_inner / 2;
        } else {
            // Total thickness of the 2-layer stack (outer plate + flange)
            clamped_thickness = t_fp + member_tf;
            // Geometric center of the 2-layer stack
            y_center_top = (member_d / 2) + t_fp / 2 - member_tf / 2;
        }
        const y_center_bot = -y_center_top;

        for (let side = -1; side <= 1; side += 2) { // Loop for each side of the splice gap
            for (let i = 0; i < Nc; i++) { // Loop for columns (along member length)
                const z_pos = side * (inputs.gap / 2 + S_end + i * S_col);

                // Generate all x positions for the rows of bolts
                const x_positions = new Set(); // Use a Set to avoid duplicates
                for (let j = 0; j < Nr; j++) {
                    // Start with the gage and add row spacing for additional rows
                    const x_offset = (gage / 2) + (j * S_row);
                    x_positions.add(x_offset);
                    // Add the corresponding bolt on the other side of the web
                    x_positions.add(-x_offset);
                }

                for (const x_p of x_positions) {
                    // Top Flange Bolt
                    const bolt_top = createBoltMesh(`top_flange_bolt_${side}_${i}_${x_p}`, {
                        diameter: D,
                        thickness: clamped_thickness,
                        position: new BABYLON.Vector3(x_p, y_center_top, z_pos)
                    }, bjsScene);
                    if (bolt_top) {
                        bolt_top.material = boltMaterial;
                        if (shadowGenerator) shadowGenerator.addShadowCaster(bolt_top);
                    }

                    // Bottom Flange Bolt
                    const bolt_bot = createBoltMesh(`bot_flange_bolt_${side}_${i}_${x_p}`, {
                        diameter: D,
                        thickness: clamped_thickness,
                        position: new BABYLON.Vector3(x_p, y_center_bot, z_pos)
                    }, bjsScene);
                    if (bolt_bot) {
                        bolt_bot.material = boltMaterial;
                        if (shadowGenerator) shadowGenerator.addShadowCaster(bolt_bot);
                    }
                }
            }
        }
    };

    createWebBoltGroup();
    createFlangeBoltGroup();


    // --- 6. Data-Driven Dimension Creation ---
    const flangeDimY = inputs.member_d / 2 + inputs.t_fp + 2; // Tighter padding (was 5)
    const flangeDimX = (inputs.member_bf / 2) + 2; // Tighter padding (was 5)
    const webDimX = (inputs.member_tw / 2) + inputs.t_wp + 1; // Tighter padding (was 2)

    const dimensionDefinitions = [
        // --- General ---
        { name: "Gap", value: inputs.gap, viewType: 'general', start: [0, flangeDimY, -inputs.gap / 2], end: [0, flangeDimY, inputs.gap / 2], offset: [0, 1.0, 0] },

        // --- Flange Plate & Bolts ---
        { name: "L_fp", value: inputs.L_fp, viewType: 'flange', condition: inputs.L_fp > 0 && inputs.H_fp > 0, start: [-inputs.H_fp / 2, flangeDimY, -inputs.L_fp / 2], end: [-inputs.H_fp / 2, flangeDimY, inputs.L_fp / 2], offset: [-1.0, 0, 0] },
        { name: "H_fp", value: inputs.H_fp, viewType: 'flange', condition: inputs.L_fp > 0 && inputs.H_fp > 0, start: [-inputs.H_fp / 2, flangeDimY, inputs.L_fp / 2], end: [inputs.H_fp / 2, flangeDimY, inputs.L_fp / 2], offset: [0, 0, 1.0] },
        { name: "S1", value: inputs.S1_col_spacing_fp, viewType: 'flange', condition: inputs.Nc_fp > 1, start: [flangeDimX, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], end: [flangeDimX, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp + inputs.S1_col_spacing_fp)], offset: [1.0, 0, 0] },
        { name: "g", value: inputs.g_gage_fp, viewType: 'flange', condition: inputs.g_gage_fp > 0, start: [-inputs.g_gage_fp / 2, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], end: [inputs.g_gage_fp / 2, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], offset: [0, 0, -1.0] },
        { name: "S3", value: inputs.S3_end_dist_fp * 2, viewType: 'flange', start: [flangeDimX, flangeDimY, -(inputs.gap / 2 + inputs.S3_end_dist_fp)], end: [flangeDimX, flangeDimY, (inputs.gap / 2 + inputs.S3_end_dist_fp)], offset: [1.0, 0, 0] },

        // --- Web Plate & Bolts ---
        { name: "L_wp", value: inputs.L_wp, viewType: 'web', condition: inputs.L_wp > 0 && inputs.H_wp > 0, start: [webDimX, -inputs.H_wp / 2, -inputs.L_wp / 2], end: [webDimX, -inputs.H_wp / 2, inputs.L_wp / 2], offset: [1.0, 0, 0] },
        { name: "H_wp", value: inputs.H_wp, viewType: 'web', condition: inputs.L_wp > 0 && inputs.H_wp > 0, start: [webDimX, -inputs.H_wp / 2, inputs.L_wp / 2], end: [webDimX, inputs.H_wp / 2, inputs.L_wp / 2], offset: [0.5, 0, 0] },
        { name: "S4", value: inputs.S4_col_spacing_wp, viewType: 'web', condition: inputs.Nc_wp > 1, start: [webDimX, ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], end: [webDimX, ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2, -(inputs.gap / 2 + inputs.S6_end_dist_wp + inputs.S4_col_spacing_wp)], offset: [1.0, 0, 0] },
        { name: "S5", value: inputs.S5_row_spacing_wp, viewType: 'web', condition: inputs.Nr_wp > 1, start: [webDimX, -((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], end: [webDimX, -((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) / 2 + inputs.S5_row_spacing_wp, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], offset: [1.0, 0, 0] },
        { name: "S6", value: inputs.S6_end_dist_wp * 2, viewType: 'web', start: [webDimX, 0, -(inputs.gap / 2 + inputs.S6_end_dist_wp)], end: [webDimX, 0, (inputs.gap / 2 + inputs.S6_end_dist_wp)], offset: [1.0, 0, 0] },
    ];

    dimensionDefinitions.forEach(dim => {
        // If a condition is defined and it's false, skip this dimension.
        if (dim.condition !== undefined && !dim.condition) {
            return;
        }
        // Create dimension line if the value is valid.
        if (dim.value > 0) {
            createDimensionLine(
                dim.name,
                dim.value,
                new BABYLON.Vector3(...dim.start),
                new BABYLON.Vector3(...dim.end),
                new BABYLON.Vector3(...dim.offset),
                dim.viewType
            );
        }
    });


    // --- 7. Final Camera Adjustment ---
    if (isFirstDraw && bjsScene.activeCamera && bjsScene.meshes.length > 0) {
        const allMeshes = bjsScene.meshes.filter(m => m.getBoundingInfo() && !m.name.includes("dim"));
        if (allMeshes.length > 0) {
            let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
            let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

            allMeshes.forEach(mesh => {
                // Important: ensure the mesh's world matrix is computed before getting bounding info
                mesh.computeWorldMatrix(true);
                const boundingBox = mesh.getBoundingInfo().boundingBox;
                min = BABYLON.Vector3.Minimize(min, boundingBox.minimumWorld);
                max = BABYLON.Vector3.Maximize(max, boundingBox.maximumWorld);
            });

            const center = BABYLON.Vector3.Center(min, max);
            const diagonal = BABYLON.Vector3.Distance(min, max);
            
            bjsScene.activeCamera.setTarget(center);
            bjsScene.activeCamera.radius = diagonal * 1.5;
            
            // Mark as drawn so we don't reset view on every minor update
            isFirstDraw = false; 
        }
    }
    
    // --- FORCE IMMEDIATE RENDER ---
    // This ensures the user sees the result instantly without partial frames
    bjsScene.render();
}



// --- Main Calculator Logic (DOM interaction and event handling) ---
const spliceCalculator = (() => {
    // --- PRIVATE HELPER & CALCULATION FUNCTIONS ---
    const { PI, sqrt, min, max, abs } = Math;
    const E_MOD = 29000.0; // ksi

    // Define a zero-value check object to use as a fallback for bearing calculations.
    const zero_bearing_check = { Rn: 0, phi: 0.75, omega: 2.00, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };
    /**
     * Gets the appropriate resistance factor (phi) and safety factor (omega) based on jurisdiction.
     * @param {string} jurisdiction - The selected jurisdiction ('AISC' or 'OSHA').
     * @param {number} aisc_phi - The standard AISC phi factor for the limit state.
     * @param {number} aisc_omega - The standard AISC omega factor for the limit state.
     * @returns {{phi: number, omega: number}}
     */
    function getDesignFactors(jurisdiction, aisc_phi, aisc_omega) {
        if (jurisdiction === 'OSHA') { // Per user request, apply a factor of safety of 4.0 for OSHA.
            return { phi: 0.25, omega: 4.0 }; // For LRFD, phi = 1/FS = 1/4 = 0.25. For ASD, Omega = 4.0.
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
        // AISC 360-22 Eq J3-6.
        const tearout_coeff = deformationIsConsideration ? 1.2 : 1.5;
        const bearing_coeff = deformationIsConsideration ? 2.4 : 3.0;
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00);
        const Lc = isEdgeBolt ? le - hole_dia / 2.0 : s - hole_dia;
        if (Lc < 0 || t_ply <= 0) return { Rn: 0, ...factors, Lc: 0, Rn_tearout: 0, Rn_bearing: 0 };

        const Rn_tearout = tearout_coeff * Lc * t_ply * (Fu_ply || 0);
        const Rn_bearing = bearing_coeff * db * t_ply * (Fu_ply || 0);
        return { Rn: min(Rn_tearout, Rn_bearing), ...factors, Lc, Rn_tearout, Rn_bearing };
    }

    /**
     * Computes the shear lag factor U for a bolted splice plate per AISC D3.
     * @param {number} plate_width - The width of the splice plate.
     * @param {number} gage - The bolt gage across the plate width.
     * @param {number} num_fastener_rows - The number of fastener rows across the plate width (e.g., 2 for a typical flange splice).
     * @param {number} conn_length - The length of the connection (distance between first and last bolts).
     * @param {number} t_p - Thickness of the plate.
     * @param {number} d_bolt - Diameter of the bolt.
     * @returns {{U: number, U_case2: number, U_case7: number, x_bar: number}}
     */
    function computeShearLagFactorU({ plate_width, gage, num_fastener_rows, conn_length, t_p, d_bolt }) {
        if (plate_width <= 0 || conn_length <= 0 || num_fastener_rows <= 0) {
            return { U: 1.0, U_case2: 1.0, U_case7: 1.0, x_bar: 0 };
        }

        // --- Shear Lag Factor U per AISC Table D3.1, Case 2 ---
        // For a symmetric flange splice plate, we analyze half of the plate as a Tee-section.
        // The 'stem' of the Tee is the portion between the bolt lines (gage).
        // The 'flange' of the Tee is the portion outside the bolt lines.
        const flange_width = (plate_width - gage) / 2.0;
        const stem_height = gage / 2.0;
        const area_flange = flange_width * t_p;
        const area_stem = stem_height * t_p;
        const total_area = area_flange + area_stem;

        // x_bar is the distance from the centroid of the Tee section to the connecting face (the bolt line).
        const x_bar = total_area > 0 ? (area_flange * (flange_width / 2.0) - area_stem * (stem_height / 2.0)) / total_area : 0;
        const U_case2 = 1.0 - (Math.abs(x_bar) / conn_length);

        // AISC D3.1, Case 7: For W, M, S shapes, but can be conservatively applied to flange plates.
        // bf/d ratio is analogous to plate_width / gage
        const U_case7 = (plate_width >= (2 / 3) * gage) ? 0.90 : 0.85;

        return { U: Math.min(1.0, Math.max(U_case2, U_case7)), U_case2, U_case7, x_bar: Math.abs(x_bar) };
    }

    function checkGrossSectionYielding({ Ag, Fy, jurisdiction }) {
        // AISC 360-22 Eq J4-1
        const factors = getDesignFactors(jurisdiction, 0.90, 1.67);
        return { Rn: Fy * Ag, ...factors, Ag, Fy };
    }

    /**
     * Checks the tensile rupture strength of a splice plate based on its net section.
     * This aligns with the direct net section check methodology where U=1.0.
     * @param {object} params - The parameters for the check.
     * @param {number} params.bf - The width of the flange or splice plate (in).
     * @param {number} params.tf - The thickness of the flange or splice plate (in).
     * @param {number} params.Fu - The specified minimum tensile strength of the material (ksi).
     * @param {number} params.num_bolts_in_cs - The number of bolts in the critical cross-section.
     * @param {number} params.hole_dia_net_area - The diameter to be deducted for each bolt hole.
     * @returns {{Rn: number, phi: number, omega: number, An: number, Ag: number}} An object with the nominal capacity and calculation details.
     */
    function checkFlangeNetSection({ bf, tf, Fu, num_bolts_in_cs, hole_dia_net_area, jurisdiction }) {
        const Ag = bf * tf; // Gross Area
        const A_holes = num_bolts_in_cs * hole_dia_net_area * tf; // Area of holes in the critical section
        const An = Ag - A_holes; // Net Area
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); // FIX: This was already correct, but confirming.

        if (An <= 0) {
            return { Rn: 0, ...factors, An: 0, Ag, A_holes, Fu, hole_dia_net_area }; // Return Fu even on failure so breakdown can display it
        }

        // Nominal Tensile Rupture Strength (Rn) per AISC J4-1(b), assuming U=1.0
        const Rn = Fu * An;

        return { Rn, ...factors, An, Ag, A_holes, Fu, hole_dia_net_area };
    }

    /**
     * Calculates block shear rupture strength for a connection per AISC 360-22 Eq J4-5.
     * @param {object} params - Parameters for the check.
     * @param {number} params.Agv - Gross area along the shear path.
     * @param {number} params.Anv - Net area along the shear path.
     * @param {number} params.Agt - Gross area along the tension path.
     * @param {number} params.Ant - Net area along the tension path.
     * @param {number} params.Fu - Specified minimum tensile strength of the material (ksi).
     * @param {number} params.Fy - Specified minimum yield strength of the material (ksi).
     * @param {number} params.Ubs - Shear lag factor for the tension plane (typically 1.0 or 0.5).
     * @param {number} params.num_shear_paths - The number of parallel shear planes (e.g., 2 for a flange splice).
     * @returns {object} An object containing the nominal block shear capacity (Rn).
     */
    function checkBlockShear({ Agv, Anv, Ant, Fu, Fy, Ubs = 1.0, jurisdiction }) {
        // AISC 360-22 Eq J4-5
        // The nominal strength Rn is the lesser of two failure modes:
        // 1. Shear rupture + Tension yielding
        // 2. Shear yielding + Tension rupture
        const shear_rupture_term = 0.6 * Fu * Anv;
        const tension_rupture_term = Ubs * Fu * Ant; // Note: In AISC 360-16/22, this term is the same for both paths of the min() function.
        const shear_yield_term = 0.6 * Fy * Agv;

        // AISC Eq. J4-5
        const Rn = Math.min(shear_rupture_term + tension_rupture_term, shear_yield_term + tension_rupture_term);
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); // FIX: This was already correct.

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
        // AISC 360-22 Eq J4-3
        const Rn = 0.6 * Fy * Agv; // Nominal shear yielding strength
        const factors = getDesignFactors(jurisdiction, 1.00, 1.50); // FIX: Apply jurisdiction factor
        return { Rn, ...factors, Agv, Fy };
    }

    function checkShearRupture(Anv, Fu, jurisdiction) {
        // AISC 360-22 Eq J4-4
        const Rn = 0.6 * Fu * Anv; // Nominal shear rupture strength
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); // FIX: Apply jurisdiction factor
        return { Rn, ...factors, Anv, Fu };
    }

    function checkPlateCompression({ Ag, Fy, t, unbraced_length, k = 0.65, jurisdiction }) {
        // AISC 360-22 Chapter E
        const factors = getDesignFactors(jurisdiction, 0.90, 1.67); // FIX: Apply jurisdiction factor
        const r = t / sqrt(12.0);
        const slenderness = r > 0 ? (k * unbraced_length) / r : 0;
        let Fcr, Fe = null;
        if (slenderness <= 25) { // Simplified from E7
            Fcr = Fy;
        } else {
            Fe = (PI ** 2 * E_MOD) / (slenderness ** 2);
            Fcr = (Fy / Fe) <= 2.25 ? (0.658 ** (Fy / Fe)) * Fy : 0.877 * Fe;
        }
        return { Rn: Fcr * Ag, ...factors, Fcr, slenderness, r, Fe, Ag, Fy, k, unbraced_length };
    }

    function checkBoltSlip({ db, faying_surface_class, num_fillers = 0, num_slip_planes, hole_type = 'standard', jurisdiction }) {
        // AISC 360-22 Section J3.8
        const Tb = AISC_SPEC.getTb(db); // Minimum bolt pretension from Table J3.1
        const mu = AISC_SPEC.getMu(faying_surface_class); // Mean slip coefficient from Table J3.5
        const Du = 1.13; // Multiplier that reflects the ratio of mean installed bolt pretension to the specified minimum pretension
        const hf = (num_fillers === 1) ? 1.0 : (num_fillers > 1) ? 0.85 : 1.0; // Factor for fillers
        const factors = getDesignFactors(jurisdiction, 1.0, 1.5); // Factors for standard holes

        // Nominal slip resistance per bolt
        const Rn = mu * Du * hf * Tb * num_slip_planes;

        return { Rn, ...factors, mu, Du, hf, Tb, num_slip_planes };
    }

    function checkBoltTension(grade, db, jurisdiction) {
        // AISC 360-22 Table J3.2
        const FntMap = { "A325": 90.0, "A490": 113.0, "F3148": 90.0 };
        const Fnt = FntMap[grade] ?? 0;
        const Ab = PI * (db ** 2) / 4.0;
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00);
        return { Rn: Fnt * Ab, ...factors, Fnt, Ab };
    }

    function checkBeamFlexuralRupture(Sx, Fy, Fu, bf, tf, num_bolts_in_flange_cs, hole_dia_net_area, jurisdiction) {
        // AISC 360-16/22 Section F13.2: Strength Reductions for Holes in Tension Flange
        const Afg = bf * tf;
        // num_bolts_in_flange_cs is the number of bolts in the critical cross-section of ONE flange.
        const Afn = (bf - num_bolts_in_flange_cs * hole_dia_net_area) * tf; // Net area of the flange
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00);

        if (Afn <= 0) {
            return { Rn: 0, ...factors, Mn_rupture: 0, Afg, Afn, Yt: 0, Sx, Fu, Fy, applies: true };
        }

        // Per AISC F13.2, determine Yt
        const Yt = (Fy / Fu <= 0.8) ? 1.0 : 1.1;

        // Check if the limit state applies per F13.2(a)
        if (Fu * Afn >= Yt * Fy * Afg) {
            // Limit state does not apply, return a very high strength so it doesn't govern.
            return { Rn: Infinity, ...factors, Mn_rupture: Infinity, Afg, Afn, Yt, Sx, Fu, Fy, applies: false, hole_dia_net_area };
        }

        // Per F13.2(b), calculate the nominal flexural strength based on tensile rupture.
        const Mn_rupture_kip_in = (Fu * Afn / Afg) * Sx;
        return { Rn: Mn_rupture_kip_in, ...factors, Mn_rupture: Mn_rupture_kip_in, Afg, Afn, Yt, Sx, Fu, Fy, applies: true, hole_dia_net_area };
    }
    function checkBoltShearTensionInteraction(Tu, Vu, Fnv, grade, db, design_method, jurisdiction) {
        // AISC 360-22 Section J3.9
        const Fnt = AISC_SPEC.getFnt(grade);
        const factors = getDesignFactors(jurisdiction, 0.75, 2.00); // FIX: This was already correct.
        const Ab = PI * (db ** 2) / 4.0;

        if (Ab === 0 || Fnv === 0) return { Rn: 0, ...factors };

        // fv is the required shear stress PER BOLT.
        const fv = Vu / Ab;

        let F_nt_prime;
        if (design_method === 'LRFD') {
            // AISC Eq. J3-3a
            F_nt_prime = 1.3 * Fnt - (Fnt / (0.75 * Fnv)) * fv;
        } else { // ASD
            // AISC Eq. J3-3b
            F_nt_prime = 1.3 * Fnt - ((2.00 / 0.75) * Fnt / Fnv) * fv;
        }

        F_nt_prime = Math.min(F_nt_prime, Fnt); // Per J3.9, F'nt shall not exceed Fnt
        F_nt_prime = Math.max(0, F_nt_prime); // Ensure tensile strength is not negative

        const Rn = F_nt_prime * Ab; // Nominal tensile strength adjusted for shear
        return { Rn, ...factors, Fnt, Fnv, Ab, fv, F_nt_prime, Tu, Vu }; // phi/omega for tension are used for the final check
    }

    /**
     * Calculates the resultant force on the critical bolt in a web splice bolt group.
     * This accounts for direct shear (V and H) and the moment induced by the eccentricity of the vertical shear.
     * @param {number} V_load - Vertical shear force on the splice.
     * @param {number} H_load - Horizontal force on the bolt group (from moment couple).
     * @param {number} gap - The gap between the members being spliced.
     * @param {number} Nc - Number of bolt columns.
     * @param {number} Nr - Number of bolt rows.
    * @param {number} S_pitch - Spacing between bolt columns (pitch).
    * @param {number} S_gage - Spacing between bolt rows (gage).
    * @param {number} S_end - End distance from plate edge to first bolt column.
     * @returns {object} An object containing the calculated forces and geometric properties.
     */
    function calculateWebSpliceEccentricity(V_load, H_load, gap, Nc, Nr, S_pitch, S_gage, S_end) {
        const num_bolts = Nc * Nr;
        if (num_bolts === 0) {
            return { max_R: 0, eccentricity: 0, M_ecc: 0, Ip: 0, f_vy_direct: 0, f_vx_direct: 0, f_v_moment: 0, f_h_moment: 0, num_bolts: 0 };
        }

        // Eccentricity from bolt group centroid to the splice centerline
        // The load is applied at the gap centerline (gap/2 from the plate edge).
        // The bolt group centroid is at S_end + (Nc-1)*S_pitch/2 from the plate edge.
        const bolt_group_centroid_dist = S_end + (Nc - 1) * S_pitch / 2.0;
        const eccentricity = bolt_group_centroid_dist - (gap / 2.0);
        const M_ecc = V_load * eccentricity; // Moment on bolt group due to shear

        let Ip = 0;
        // Find coordinates of the critical bolt (farthest from the centroid)
        const crit_x = (Nc - 1) * S_pitch / 2.0;
        const crit_y = (Nr - 1) * S_gage / 2.0;

        for (let i = 0; i < Nc; i++) {
            for (let j = 0; j < Nr; j++) {
                const dx = i * S_pitch - crit_x; // x-distance from bolt group centroid
                const dy = j * S_gage - crit_y;  // y-distance from bolt group centroid
                Ip += dx ** 2 + dy ** 2;
            }
        }

        // If Ip is zero (e.g., single bolt), the moment components are zero.
        if (Ip === 0) {
            const max_R = sqrt((H_load / num_bolts) ** 2 + (V_load / num_bolts) ** 2);
            return { max_R, eccentricity, M_ecc, Ip, f_vy_direct: V_load / num_bolts, f_vx_direct: H_load / num_bolts, f_v_moment: 0, f_h_moment: 0, num_bolts };
        }

        // Direct shear components
        const f_vy_direct = V_load / num_bolts; // Vertical component
        const f_vx_direct = H_load / num_bolts; // Horizontal component

        // Moment-induced shear components on the critical bolt
        const f_v_moment = (M_ecc * crit_x) / Ip; // Vertical component from eccentric moment
        const f_h_moment = (M_ecc * crit_y) / Ip; // Horizontal component from eccentric moment

        // Resultant force on the critical bolt using vector addition
        const R_h = f_vx_direct + f_h_moment;
        const R_v = f_vy_direct + f_v_moment;
        const max_R = sqrt(R_h ** 2 + R_v ** 2);

        return { max_R, eccentricity, M_ecc, Ip, f_vy_direct, f_vx_direct, f_v_moment, f_h_moment, num_bolts };
    }

    /**
     * Checks for prying action on a bolt connection based on AISC Manual Part 9.
     * This function calculates the total required tensile force per bolt, including prying.
     * @param {object} params - Parameters for prying action check.
     * @param {number} params.t_plate - Thickness of the connected plate (in).
     * @param {number} params.Fy_plate - Yield strength of the connected plate (ksi).
     * @param {number} params.b - Distance from bolt centerline to bolt line (in).
     * @param {number} params.a - Distance from bolt centerline to edge of plate or fillet toe (in).
     * @param {number} params.p - Bolt pitch (spacing parallel to the member length) (in).
     * @param {number} params.d_bolt - Nominal bolt diameter (in).
     * @param {number} params.d_hole - Nominal hole diameter (in).
     * @param {number} params.B_bolt - The applied tensile force demand per bolt (kips).
     * @returns {object} An object containing the total required force (T_req), prying force (Q), and critical thickness (tc).
     */
    function checkPryingAction(params) {
        const { t_plate, Fy_plate, b, a, p, d_bolt, d_hole, B_bolt, jurisdiction } = params;

        // B_bolt is the required tension demand per bolt (e.g., Tu / num_bolts)
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

        // Critical thickness tc required to eliminate prying, based on the applied DEMAND B_bolt (AISC Eq. 9-27).
        const tc = Math.sqrt((4 * B_bolt * b_prime) / (p * Fy_plate));

        let Q = 0;
        let alpha_prime = 1.0; // Default to 1.0 if no prying
        if (t_plate < tc) { // Prying occurs if the actual plate thickness is less than the critical thickness
            alpha_prime = (1 / (delta * (1 + rho))) * (((t_plate / tc) ** 2) - 1);
            alpha_prime = Math.max(0, Math.min(alpha_prime, 1.0));

            // Prying force Q per bolt, based on the demand B_bolt.
            Q = B_bolt * delta * alpha_prime * rho;
        } else {
            // If t >= tc, prying force Q is zero, and alpha_prime is effectively 0 for the Q calculation.
            // However, for reporting, it's clearer to show alpha_prime as 1.0 when t >= tc,
            // as it signifies the full capacity is available without prying reduction.
            // The calculation of Q will still be zero.
            Q = 0;
            alpha_prime = 1.0;
        }

        const T_req = B_bolt + Q; // Total required tension in the bolt is the initial demand plus the prying force.

        return { ...params, T_req, Q, tc, alpha_prime, delta, rho, b_prime, a_prime };
    }

    function getGeometryChecks({ db, s_col, s_row, gage, le_long, le_tran, t_thinner, jurisdiction }) {
        // Implements checks from AISC J3.3, J3.4, and J3.5.
        // Assumes standard round holes.
        // Assumes sheared edges for minimum edge distance lookup (most conservative).
        if (!db) return {}; // Return empty if no bolt diameter is provided
        // For rolled edges or different hole types, Table J3.4 values would change.
        const tolerance = 1e-9; // Small tolerance for floating point comparisons
        const min_le = AISC_SPEC.minEdgeDistanceTable[String(db)] || 1.25 * db; // Use exact values from map where possible
        const min_s = (8 / 3) * db; // AISC J3.4 minimum spacing is 2-2/3 * db
        // From AISC J3.5
        const max_s = min(24 * t_thinner, 12.0);
        return {
            edge_dist_long: { actual: le_long, min: min_le, pass: le_long >= min_le - tolerance },
            edge_dist_tran: { actual: le_tran, min: min_le, pass: le_tran >= min_le - tolerance },
            spacing_col: { actual: s_col, min: min_s, pass: s_col >= min_s - tolerance },
            spacing_row: { actual: s_row, min: min_s, pass: s_row >= min_s - tolerance }, // Spacing between rows on one side of the gage
            spacing_gage: { actual: gage, min: min_s, pass: !gage || (gage >= min_s - tolerance) }, // Gage is also a spacing
            max_spacing_col: { actual: s_col, max: max_s, pass: s_col <= max_s + tolerance },
            max_spacing_row: { actual: s_row, max: max_s, pass: s_row <= max_s + tolerance }
        };
    }

    function calculateBoltGroupGeometry({ L_plate, H_plate, Nc, Nr, S_col, S_row, S_end_gap, gage }) {
        console.log(`calculateBoltGroupGeometry: H_plate=${H_plate}, gage=${gage}, Nr=${Nr}, S_row=${S_row}`);
        const edge_dist_gap = S_end_gap;
        const bolt_pattern_width = (Nc > 1 ? (Nc - 1) * S_col : 0);
        const le_long = L_plate - edge_dist_gap - bolt_pattern_width;

        let bolt_pattern_height, le_tran;
        if (gage) { // Flange plate logic with a gage
            bolt_pattern_height = Nr <= 1 ? gage : gage + 2 * (Nr - 1) * S_row;
            le_tran = (H_plate - bolt_pattern_height) / 2.0;
        } else { // Web plate logic without a gage
            bolt_pattern_height = (Nr > 1 ? (Nr - 1) * S_row : 0);
            le_tran = (H_plate - bolt_pattern_height) / 2.0;
        }
        console.log(`calculateBoltGroupGeometry: bolt_pattern_height=${bolt_pattern_height}, le_tran (raw)=${le_tran}`);

        // Validate Geometric Results
        if (bolt_pattern_height > H_plate) {
            console.error("Error: Bolt pattern height exceeds plate height.");
            return { le_long: 0, le_tran: 0, edge_dist_gap: 0, bolt_pattern_width: 0, bolt_pattern_height: 0, error: "Bolt pattern height exceeds plate height." };
        }
        if (le_tran < 0) {
            console.warn("Warning: Calculated transverse edge distance is negative.");
            le_tran = 0; // Set to zero to avoid further calculation issues
        }

        return {
            le_long: le_long < 0 ? 0 : le_long, // Prevent negative edge distances
            le_tran: le_tran < 0 ? 0 : le_tran,
            edge_dist_gap,
            bolt_pattern_width,
            bolt_pattern_height
        };
    }

    /**
     * A helper function to perform a standard set of checks on a single splice plate.
     * @param {string} plateName - The name for the checks (e.g., "Outer Plate").
     * @param {object} inputs - The main inputs object.
     * @param {object} config - Configuration for the specific plate check.
     * @returns {object} An object containing the results of the checks for this plate.
     */
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

        // 1. Gross Section Yielding & Compression
        const Ag = H_p * t_p; plateChecks[`${plateName} GSY`] = { demand, check: checkGrossSectionYielding({ Ag, Fy, jurisdiction: inputs.jurisdiction }) };
        plateChecks[`${plateName} Compression`] = { demand: demand_comp, check: checkPlateCompression({ Ag, Fy, t: t_p, unbraced_length: S_col, jurisdiction: inputs.jurisdiction }) };

        // 2. Net Section Fracture
        const bolts_in_critical_section = 2 * Nr;
        plateChecks[`${plateName} NSF`] = { demand, check: checkFlangeNetSection({ bf: H_p, tf: t_p, Fu, num_bolts_in_cs: bolts_in_critical_section, hole_dia_net_area: hole_for_net_area, jurisdiction: inputs.jurisdiction }) };

        // 3. Block Shear (Corrected Area Calculations)
        const Agv = (S_end + (Nc - 1) * S_col) * t_p * 2; // Gross shear area (2 paths)
        const Anv = Agv - (Nc * 2) * hole_for_net_area * t_p; // Net shear area (2 paths)
        const Ant = (gage - Nr * hole_for_net_area) * t_p; // Net tension area (1 path across gage)

        plateChecks[`${plateName} Block Shear`] = { demand, check: checkBlockShear({ Agv, Anv, Ant, Fu, Fy, Ubs: 1.0, jurisdiction: inputs.jurisdiction }) };

        // 4. Bolt Bearing
        const bearing_edge = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });
        const bearing_int = checkBoltBearing({ db: D_bolt, t_ply: t_p, Fu_ply: Fu, le: le_long, s: S_col, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });
        const num_edge_bolts = 2 * Nr;
        const num_int_bolts = (Nc - 1) * 2 * Nr;
        const total_bearing = bearing_edge.Rn * num_edge_bolts + bearing_int.Rn * num_int_bolts;
        plateChecks[`${plateName} Bolt Bearing`] = { demand, check: { Rn: total_bearing, ...getDesignFactors(inputs.jurisdiction, 0.75, 2.00) }, details: { edge: bearing_edge, int: bearing_int, num_edge: num_edge_bolts, num_int: num_int_bolts } };

        return plateChecks;
    }

    /**
     * A helper function to perform checks on the beam element where it connects to a splice.
     * @param {string} partName - The name of the beam part (e.g., "Flange", "Web").
     * @param {object} inputs - The main inputs object.
     * @param {object} config - Configuration for the specific check.
     * @returns {object} An object containing the results of the checks.
     */
    function performBeamConnectionChecks(partName, inputs, config) {
        const {
            demand, t_beam, Fu_beam, Fy_beam,
            Nc, Nr, S_col, S_row, S_end, gage, D_bolt,
            hole_for_net_area, hole_for_bearing
        } = config;

        const beamChecks = {};

        // 1. Bolt Bearing on Beam Element
        // FIX: Use a conditional to get the correct plate length property
        const plate_length_prop = partName === 'Flange' ? inputs.L_fp : inputs.L_wp;
        const { le_long } = calculateBoltGroupGeometry({ L_plate: plate_length_prop, Nc, S_col, S_end_gap: S_end }); const bearing_edge = checkBoltBearing({ db: D_bolt, t_ply: t_beam, Fu_ply: Fu_beam, le: le_long, s: S_col, isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });
        const bearing_int = checkBoltBearing({ db: D_bolt, t_ply: t_beam, Fu_ply: Fu_beam, le: Infinity, s: S_col, isEdgeBolt: false, deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing, jurisdiction: inputs.jurisdiction });

        // --- FIX: Double the bolt count if checking a Flange ---
        // The multiplier ensures bolts on both sides of the gage are counted.
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
        // FIX: Ensure bolt diameter is a number before using it in any calculations.
        const D_fp_num = parseFloat(inputs.D_fp);

        // --- Flange Splice Checks ---
        // FIX: Correctly get hole diameters from the AISC database module
        const hole_for_bearing_fp = AISC_SPEC.getNominalHoleDiameter(D_fp_num);
        const hole_for_net_area_fp = hole_for_bearing_fp + 1.0 / 16.0; // Per AISC B4.3b

        const { le_long: le_long_fp, le_tran: le_tran_fp, edge_dist_gap: edge_dist_gap_fp, bolt_pattern_height: bolt_pattern_height_fp } = calculateBoltGroupGeometry({
            L_plate: inputs.L_fp,
            H_plate: inputs.H_fp,
            Nc: inputs.Nc_fp,
            Nr: inputs.Nr_fp,
            S_col: inputs.S1_col_spacing_fp,
            S_row: inputs.S2_row_spacing_fp,
            S_end_gap: inputs.S3_end_dist_fp,
            gage: inputs.g_gage_fp
        });

        // Nr_fp is rows on EACH side of the gage, so total bolts per side of splice is Nc * (2 * Nr)
        const num_flange_bolts_per_side = inputs.Nc_fp * (2 * inputs.Nr_fp);
        const num_shear_planes_fp = inputs.num_flange_plates === 2 ? 2 : 1;
        const fastenerPatternLength_flange = (inputs.Nc_fp > 1) ? ((inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp) : 0;
        const single_bolt_shear_fp_check = checkBoltShear({
            grade: inputs.bolt_grade_fp,
            threadsIncl: inputs.threads_included_fp,
            db: D_fp_num,
            numPlanes: num_shear_planes_fp,
            fastenerPatternLength: fastenerPatternLength_flange,
            jurisdiction: inputs.jurisdiction
        });
        checks['Flange Bolt Shear'] = {
            demand: total_flange_demand_tension,
            check: { ...single_bolt_shear_fp_check, Rn: single_bolt_shear_fp_check.Rn * num_flange_bolts_per_side },
            details: { Rn_single: single_bolt_shear_fp_check.Rn, num_bolts: num_flange_bolts_per_side }
        };

        // --- Beam Flange Tensile Rupture (against flange force) ---
        // This is a direct check of the flange's net area against the tensile force.
        const bolts_in_flange_cs = 2 * inputs.Nr_fp;
        checks['Beam Flange Tensile Rupture'] = {
            demand: total_flange_demand_tension,
            check: checkFlangeNetSection({
                bf: inputs.member_bf, tf: inputs.member_tf, Fu: inputs.member_Fu,
                num_bolts_in_cs: bolts_in_flange_cs,
                hole_dia_net_area: hole_for_net_area_fp,
                jurisdiction: inputs.jurisdiction
            })
        };

        // --- Outer Plate Checks (using helper) ---
        Object.assign(checks, performPlateChecks("Outer Plate", inputs, {
            demand: demand_fp_outer, demand_comp: demand_fp_outer_comp,
            H_p: inputs.H_fp, t_p: inputs.t_fp, L_p: inputs.L_fp, Fy: inputs.flange_plate_Fy, Fu: inputs.flange_plate_Fu,
            Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
            gage: inputs.g_gage_fp, D_bolt: D_fp_num,
            hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
        }));

        // --- Inner Plate Checks (using helper) ---
        if (inputs.num_flange_plates === 2) {
            Object.assign(checks, performPlateChecks("Inner Plate", inputs, {
                demand: demand_fp_inner, demand_comp: demand_fp_inner_comp,
                H_p: inputs.H_fp_inner, t_p: inputs.t_fp_inner, L_p: inputs.L_fp_inner, Fy: inputs.flange_plate_Fy_inner, Fu: inputs.flange_plate_Fu_inner,
                Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
                gage: inputs.g_gage_fp, D_bolt: D_fp_num,
                hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
            }));
        }

        // --- Beam Flange Block Shear Check ---
        // This is analogous to the plate block shear check, but on the beam flange material.
        // It also has two shear paths.

        // Shear Path (along one line of bolts)
        const L_gv_beam_f = inputs.S3_end_dist_fp + (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp; // Gross length of one shear path
        const L_nv_beam_f = L_gv_beam_f - (inputs.Nc_fp - 0.5) * hole_for_net_area_fp; // Net length of one shear path

        // Tension path is across the gage.
        const Ant_beam_f = (inputs.g_gage_fp - (2 * inputs.Nr_fp * hole_for_net_area_fp)) * inputs.member_tf;
        const Agt_beam_f = inputs.g_gage_fp * inputs.member_tf;

        checks['Beam Flange Block Shear'] = {
            demand: total_flange_demand_tension,
            check: checkBlockShear({
                Agv: L_gv_beam_f * inputs.member_tf,
                Anv: L_nv_beam_f * inputs.member_tf,
                Ant: Ant_beam_f,
                Fu: inputs.member_Fu, Fy: inputs.member_Fy,
                Ubs: 1.0, num_shear_paths: 2,
                jurisdiction: inputs.jurisdiction
            }),
            details: { t_p: inputs.member_tf, hole_dia: hole_for_net_area_fp, Agv: L_gv_beam_f * inputs.member_tf, Anv: L_nv_beam_f * inputs.member_tf, Agt: Agt_beam_f, Ant: Ant_beam_f }
        };

        // --- Beam Flange Bolt Bearing Check ---
        Object.assign(checks, performBeamConnectionChecks("Flange", inputs, {
            demand: total_flange_demand_tension,
            t_beam: inputs.member_tf, Fu_beam: inputs.member_Fu, Fy_beam: inputs.member_Fy,
            Nc: inputs.Nc_fp, Nr: inputs.Nr_fp, S_col: inputs.S1_col_spacing_fp, S_row: inputs.S2_row_spacing_fp, S_end: inputs.S3_end_dist_fp,
            gage: inputs.g_gage_fp, D_bolt: D_fp_num,
            hole_for_net_area: hole_for_net_area_fp, hole_for_bearing: hole_for_bearing_fp
        }));
        // --- Prying Action Check ---
        // --- FIX: Corrected and Consolidated Prying Action Check ---
        // (inside performFlangeChecks function)

        const B_per_bolt = num_flange_bolts_per_side > 0 ? total_flange_demand_tension / num_flange_bolts_per_side : 0;
        const d_hole_pry = hole_for_bearing_fp; // Use the same hole diameter as bearing

        let T_req = B_per_bolt; // Start with the direct tension demand
        let Q_total = 0;
        let prying_details = {};

        if (B_per_bolt > 0) {
            if (inputs.num_flange_plates === 2) {
                // Each plate sees half the bolt force
                const B_per_plate = B_per_bolt / 2;
                const b_pry_outer = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
                const a_pry_outer = (inputs.H_fp - inputs.g_gage_fp) / 2.0; const prying_outer = checkPryingAction({ t_plate: inputs.t_fp, Fy_plate: inputs.flange_plate_Fy, b: b_pry_outer, a: a_pry_outer, p: inputs.S1_col_spacing_fp, d_bolt: D_fp_num, d_hole: d_hole_pry, B_bolt: B_per_plate /* ✅ Half the bolt force */, jurisdiction: inputs.jurisdiction });

                const b_pry_inner = inputs.g_gage_fp / 2.0;
                const a_pry_inner = (inputs.H_fp_inner - inputs.g_gage_fp) / 2.0;
                const prying_inner = checkPryingAction({ t_plate: inputs.t_fp_inner, Fy_plate: inputs.flange_plate_Fy_inner, b: b_pry_inner, a: a_pry_inner, p: inputs.S1_col_spacing_fp, d_bolt: D_fp_num, d_hole: d_hole_pry, B_bolt: B_per_plate /* ✅ Half the bolt force */, jurisdiction: inputs.jurisdiction });

                Q_total = prying_outer.Q + prying_inner.Q;
                prying_details = { outer: prying_outer, inner: prying_inner };
            } else {
                // Single plate system - full bolt force
                // For a single plate on a W-shape flange:
                // 'b' is from bolt centerline to the web face.
                const b_pry = (inputs.g_gage_fp / 2.0) - (inputs.member_tw / 2.0);
                // 'a' is from bolt centerline to the plate edge.
                const a_pry = (inputs.H_fp - inputs.g_gage_fp) / 2.0; // This is correct
                const prying_result = checkPryingAction({ t_plate: inputs.t_fp, Fy_plate: inputs.flange_plate_Fy, b: b_pry, a: a_pry, p: inputs.S1_col_spacing_fp, d_bolt: D_fp_num, d_hole: d_hole_pry, B_bolt: B_per_bolt, jurisdiction: inputs.jurisdiction });
                Q_total = prying_result.Q;
                prying_details = { outer: prying_result };
            }

            T_req += Q_total; // Add total prying force to the initial demand

            checks['Flange Bolt Tension with Prying'] = {
                demand: T_req, // The demand is the total required force including prying
                check: checkBoltTension(inputs.bolt_grade_fp, D_fp_num, inputs.jurisdiction), // Check against bolt's nominal capacity
                details: { ...prying_details, B_per_bolt, Q_total, T_req }
            };
        }

        const outer_plate_tc = prying_details.outer?.tc || 0;

        checks['Plate Thickness for Prying'] = {
            demand: inputs.t_fp, // Provided thickness
            check: { Rn: outer_plate_tc, phi: 1.0, omega: 1.0 }, // Required thickness
            // The prying_details object now contains all necessary info, including B_bolt
            details: prying_details
        };

        const t_thinner_flange = min(inputs.member_tf, inputs.t_fp, inputs.num_flange_plates === 2 ? inputs.t_fp_inner : Infinity);
        geomChecks['Flange Bolts'] = getGeometryChecks({
            db: D_fp_num,
            s_col: inputs.S1_col_spacing_fp,
            s_row: inputs.S2_row_spacing_fp,
            gage: inputs.g_gage_fp,
            le_long: le_long_fp,
            le_tran: le_tran_fp,
            t_thinner: t_thinner_flange,
            jurisdiction: inputs.jurisdiction
        });
        const tolerance = 1e-9;
        const min_le_fp = geomChecks['Flange Bolts'].edge_dist_long.min;
        geomChecks['Flange Bolts'].edge_dist_gap = { actual: edge_dist_gap_fp, min: min_le_fp, pass: edge_dist_gap_fp >= min_le_fp - tolerance };

        return { checks, geomChecks, inputs };
    }

    /**
     * Computes the bolt group coefficient C using the numerical ICR method.
     * Adapted from Brandt's iterative approach for AISC eccentrically loaded bolt groups.
     * @param {number} boltRow - Number of rows (Nr, along y/vertical).
     * @param {number} boltColumn - Number of columns (Nc, along z/horizontal).
     * @param {number} rowSpacing - Spacing between rows (S_row, in).
     * @param {number} columnSpacing - Spacing between columns (S_col, in).
     * @param {number} eccentricity - Eccentricity along z (in).
     * @param {number} rotation - Optional group rotation in degrees (default 0).
     * @returns {number} The coefficient C (effective number of bolts).
     */
    function boltCoefficient(boltRow, boltColumn, rowSpacing, columnSpacing, eccentricity, rotation = 0) {
        const Rv = boltRow;
        const Rh = boltColumn;
        const Sv = rowSpacing;
        const Sh = columnSpacing;
        rotation = rotation * Math.PI / 180; // Convert to radians
        const Ec = Math.abs(eccentricity);

        if (Ec === 0 || Rv === 0 || Rh === 0) return Rv * Rh;

        const boltLoc = [];
        for (let i = 0; i < Rv; i++) {
            for (let k = 0; k < Rh; k++) {
                let y1 = (i * Sv) - (Rv - 1) * Sv / 2; // Vertical coordinate
                let x1 = (k * Sh) - (Rh - 1) * Sh / 2; // Horizontal coordinate
                const dv = x1 * Math.sin(rotation) + y1 * Math.cos(rotation);
                const dh = x1 * Math.cos(rotation) - y1 * Math.sin(rotation); // Simplified without MirrFlag
                boltLoc.push({ dv, dh });
            }
        }

        let xRo = 0; // Horizontal shift from centroid
        let yRo = 0; // Vertical shift from centroid
        const Ru = 1.0; // Normalized ultimate strength (divides out)
        let stp = false;
        let cnt = 0;
        let p = 0; // Initialize p to 0 to handle cases where the loop doesn't run.
        let uFprev = Infinity; // Previous force imbalance
        const cntMax = 5000;
        const epsilon = 1e-6; // Small value to avoid division by near-zero

        while (!stp) {
            cnt++;
            let liMax = 0;
            for (let i = 0; i < boltLoc.length; i++) {
                // Find the bolt furthest from the current trial ICR
                const xi = boltLoc[i].dh + xRo;
                const yi = boltLoc[i].dv + yRo;
                liMax = Math.max(liMax, Math.sqrt(xi ** 2 + yi ** 2));
            }

            let rx = 0; // Horizontal force sum
            let ry = 0; // Vertical force sum
            let m = 0;  // Moment sum
            let j = 0;  // Inertia sum
            for (let i = 0; i < boltLoc.length; i++) {
                // Calculate properties for each bolt based on its distance from the trial ICR
                const xi = boltLoc[i].dh + xRo;
                const yi = boltLoc[i].dv + yRo;
                const ri = Math.sqrt(xi ** 2 + yi ** 2);

                // Guard against division by zero if liMax is 0 (e.g., single bolt at origin)
                const delta = liMax > epsilon ? 0.34 * ri / liMax : 0;
                const iRn = Ru * (1 - Math.exp(-10 * delta)) ** 0.55;

                // Sum forces and moments (guard ri for components)
                m += (iRn / Ru) * ri;
                if (ri > epsilon) {
                    ry += (iRn / Ru) * (xi / ri); // Vertical component
                    rx += (iRn / Ru) * (yi / ri); // Horizontal component
                }
                j += ri ** 2;
            }

            // Calculate total force and force imbalances
            const ro = Ec + xRo; // Effective radius to load line
            p = (Math.abs(ro) > epsilon) ? m / ro : 0; // Guard ro=0
            const uFy = p - ry;  // Vertical imbalance
            const uFx = -rx;     // Horizontal imbalance (no applied horizontal in this frame)
            const uF = Math.sqrt(uFy ** 2 + uFx ** 2); // Total imbalance

            // --- Convergence Checks ---
            const stp1 = Math.abs(uFy) <= 0.00001 && Math.abs(uFx) <= 0.00001;
            const stp2 = cnt >= cntMax;
            // Divergence check: if total imbalance starts increasing after more iterations, stop.
            const stp3 = cnt > 50 && uF > uFprev * 1.01;
            stp = stp1 || stp2 || stp3;

            if (stp && !stp1) {
                // Convergence failed; log details for debugging (optional)
                // console.warn(`ICR convergence failed after ${cnt} iterations. Final imbalance: ${uF.toFixed(6)}, xRo: ${xRo.toFixed(4)}, yRo: ${yRo.toFixed(4)}`);
                return NaN; // Or fallback to elastic method if desired
            }

            // Update the trial ICR location
            const mapFunc = (Math.abs(m) > epsilon) ? j / (Rv * Rh * m) : 0; // Guard m=0
            xRo += uFy * mapFunc;
            yRo += uFx * mapFunc;
            uFprev = uF;
        }

        return p; // C coefficient
    }

    function performWebChecks(inputs, demands) {
        const { V_load, Hw } = demands;
        const checks = {};
        const geomChecks = {};
        // FIX: Ensure bolt diameter is a number before using it in any calculations.
        const D_wp_num = parseFloat(inputs.D_wp);
        // FIX: Correctly get hole diameters from the AISC database module
        const hole_for_bearing_wp = AISC_SPEC.getNominalHoleDiameter(inputs.D_wp);
        const hole_for_net_area_wp = hole_for_bearing_wp + 1.0 / 16.0; // Per AISC B4.3b

        const { le_long: le_long_wp, le_tran: le_tran_wp, edge_dist_gap: edge_dist_gap_wp } = calculateBoltGroupGeometry({
            L_plate: inputs.L_wp,
            H_plate: inputs.H_wp,
            Nc: inputs.Nc_wp,
            Nr: inputs.Nr_wp,
            S_col: inputs.S4_col_spacing_wp,
            S_row: inputs.S5_row_spacing_wp, S_end_gap: inputs.S6_end_dist_wp
        });

        const num_web_bolts_per_side = inputs.Nc_wp * inputs.Nr_wp;
        if (num_web_bolts_per_side === 0) return { checks, geomChecks, inputs };

        // --- Bolt Slip Check (if applicable) ---
        if (inputs.connection_type === 'slip-critical') {
            const single_bolt_slip_check = checkBoltSlip({
                db: D_wp_num,
                faying_surface_class: inputs.faying_surface_class,
                num_slip_planes: inputs.num_web_plates,
                jurisdiction: inputs.jurisdiction
            });
            const total_slip_capacity = single_bolt_slip_check.Rn * num_web_bolts_per_side;
            // Demand is the resultant of V_load and Hw
            checks['Web Bolt Slip'] = { demand: Math.sqrt(V_load ** 2 + Hw ** 2), check: { ...single_bolt_slip_check, Rn: total_slip_capacity }, details: { num_bolts: num_web_bolts_per_side } };
        }

        const fastenerPatternLength_web = (inputs.Nr_wp > 1) ? ((inputs.Nr_wp - 1) * inputs.S5_row_spacing_wp) : 0;
        const single_web_bolt_shear_check = checkBoltShear({
            grade: inputs.bolt_grade_wp,
            threadsIncl: inputs.threads_included_wp,
            db: D_wp_num,
            numPlanes: inputs.num_web_plates,
            fastenerPatternLength: fastenerPatternLength_web,
            jurisdiction: inputs.jurisdiction
        });

        // In performWebChecks...
        const eccentricity = calculateWebSpliceEccentricity(1, 0, inputs.gap, inputs.Nc_wp, inputs.Nr_wp, inputs.S4_col_spacing_wp, inputs.S5_row_spacing_wp, inputs.S6_end_dist_wp).eccentricity; // Get e

        const theta = Math.atan2(Hw, V_load); // Load angle (Hw horizontal/z, V_load vertical/y)
        const resultant_demand = Math.sqrt(V_load ** 2 + Hw ** 2);
        const e_eff = (V_load * eccentricity) / (resultant_demand || 1); // Avoid division by zero

        // Compute C (note: row/col swapped if needed; here row = Nr_wp vertical, column = Nc_wp horizontal)
        const C = boltCoefficient(inputs.Nr_wp, inputs.Nc_wp, inputs.S5_row_spacing_wp, inputs.S4_col_spacing_wp, e_eff, 0);

        const Rn_group = C * single_web_bolt_shear_check.Rn;
        const factors_bolt_group = getDesignFactors(inputs.jurisdiction, 0.75, 2.00);

        const bolt_group_capacity_check = {
            Rn: Rn_group,
            phi: factors_bolt_group.phi,
            omega: factors_bolt_group.omega,
            C,
            Rn_single: single_web_bolt_shear_check.Rn,
            e_eff: e_eff,
            theta_deg: theta * 180 / Math.PI
        };

        checks['Web Bolt Group Shear (ICR)'] = {
            demand: resultant_demand,
            check: bolt_group_capacity_check,
            details: { ...bolt_group_capacity_check, V_load, Hw, eccentricity }
        };

        const Tu_per_bolt = Hw > 0 ? Hw / num_web_bolts_per_side : 0; // Tension demand per bolt
        const Vu_per_bolt = V_load > 0 ? V_load / num_web_bolts_per_side : 0; // Simplified vertical shear per bolt

        if (Tu_per_bolt > 0) {
            checks['Web Bolt Shear/Tension Interaction'] = {
                demand: Tu_per_bolt,
                check: checkBoltShearTensionInteraction(Tu_per_bolt, Vu_per_bolt, single_web_bolt_shear_check.Fnv, inputs.bolt_grade_wp, D_wp_num, inputs.design_method, inputs.jurisdiction)
            };
        }

        const total_t_wp = inputs.t_wp * inputs.num_web_plates;
        const Agv_wp = inputs.H_wp * total_t_wp;
        checks['Web Plate Gross Shear Yield'] = {
            demand: V_load,
            check: checkShearYielding(Agv_wp, inputs.web_plate_Fy, inputs.jurisdiction),
            details: { H_wp: inputs.H_wp, t_total: total_t_wp }
        };
        const Anv_wp = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp;
        checks['Web Plate Net Shear Rupture'] = {
            demand: V_load,
            check: checkShearRupture(Anv_wp, inputs.web_plate_Fu, inputs.jurisdiction),
            details: { H_wp: inputs.H_wp, Nr_wp: inputs.Nr_wp, hole_dia: hole_for_net_area_wp, t_total: total_t_wp }
        };

        // --- Web Plate Flexural Checks ---
        const { Mu_resisted_by_web } = demands;
        if (Mu_resisted_by_web > 0) {
            const Zx_wp = (total_t_wp * (inputs.H_wp ** 2)) / 4.0;
            const Sx_wp = (total_t_wp * (inputs.H_wp ** 2)) / 6.0;
            const flex_yield_factors = getDesignFactors(inputs.jurisdiction, 0.90, 1.67);
            const Mn_yield_wp = inputs.web_plate_Fy * Zx_wp;
            checks['Web Plate Flexural Yielding'] = {
                demand: Mu_resisted_by_web,
                check: { Rn: Mn_yield_wp, ...flex_yield_factors, Fy: inputs.web_plate_Fy, Zx: Zx_wp }
            };
            const An_wp_flexure = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp;
            const Mn_rupture_wp = inputs.web_plate_Fu * An_wp_flexure * Sx_wp / (inputs.H_wp * total_t_wp);
            checks['Web Plate Flexural Rupture'] = { demand: Mu_resisted_by_web, check: { Rn: Mn_rupture_wp, ...getDesignFactors(inputs.jurisdiction, 0.75, 2.00) } };
        }

        // --- Corrected Web Plate Block Shear ---
        const total_t_wp_bs_calc = inputs.t_wp * inputs.num_web_plates; // Total thickness of web plates
        // Shear occurs along the bolt lines (longitudinal)
        const L_gv_single_path = inputs.S6_end_dist_wp + (inputs.Nc_wp - 1) * inputs.S4_col_spacing_wp;
        // Two shear paths (top and bottom of the bolt group)
        const Agv_bs = 2 * L_gv_single_path * total_t_wp_bs_calc;
        const Anv_bs = Agv_bs - (2 * inputs.Nc_wp * hole_for_net_area_wp * total_t_wp_bs_calc); // Deduct holes from both paths
        const Ant_bs = (inputs.H_wp - inputs.Nr_wp * hole_for_net_area_wp) * total_t_wp_bs_calc; // Tension path is transverse

        checks['Web Plate Block Shear'] = {
            demand: V_load,
            check: checkBlockShear({ Agv: Agv_bs, Anv: Anv_bs, Ant: Ant_bs, Fu: inputs.web_plate_Fu, Fy: inputs.web_plate_Fy, Ubs: 1.0, jurisdiction: inputs.jurisdiction })
        };

        // --- Web Plate Bolt Bearing (Full Group) ---
        const num_edge_bolts_web = inputs.Nr_wp; // All bolts in the first column are edge bolts
        const num_int_bolts_web = (inputs.Nc_wp - 1) * inputs.Nr_wp;
        const bearing_wp_plate_edge = checkBoltBearing({
            db: D_wp_num, t_ply: total_t_wp, Fu_ply: inputs.web_plate_Fu,
            le: le_long_wp, s: inputs.S4_col_spacing_wp,
            isEdgeBolt: true, deformationIsConsideration: inputs.deformation_is_consideration,
            hole_dia: hole_for_bearing_wp, jurisdiction: inputs.jurisdiction
        });
        const bearing_wp_plate_int = checkBoltBearing({
            db: D_wp_num, t_ply: total_t_wp, Fu_ply: inputs.web_plate_Fu,
            le: Infinity, s: inputs.S4_col_spacing_wp, isEdgeBolt: false,
            deformationIsConsideration: inputs.deformation_is_consideration, hole_dia: hole_for_bearing_wp,
            jurisdiction: inputs.jurisdiction
        });
        const total_bearing_capacity_plate = (bearing_wp_plate_edge.Rn * num_edge_bolts_web) + (bearing_wp_plate_int.Rn * num_int_bolts_web);
        checks['Web Plate Bolt Bearing'] = { demand: V_load, check: { ...bearing_wp_plate_edge, Rn: total_bearing_capacity_plate }, details: { edge: bearing_wp_plate_edge, int: bearing_wp_plate_int, num_edge: num_edge_bolts_web, num_int: num_int_bolts_web } };

        // --- Beam Web Bolt Bearing Check ---
        Object.assign(checks, performBeamConnectionChecks("Web", inputs, {
            demand: V_load,
            t_beam: inputs.member_tw, Fu_beam: inputs.member_Fu, Fy_beam: inputs.member_Fy,
            Nc: inputs.Nc_wp, Nr: inputs.Nr_wp, S_col: inputs.S4_col_spacing_wp, S_row: inputs.S5_row_spacing_wp, S_end: inputs.S6_end_dist_wp, // Use numeric diameter
            D_bolt: D_wp_num, hole_for_bearing: hole_for_bearing_wp
        }));

        const t_thinner_web = min(inputs.member_tw, inputs.t_wp * inputs.num_web_plates);
        geomChecks['Web Bolts'] = getGeometryChecks({
            db: inputs.D_wp,
            s_col: inputs.S4_col_spacing_wp,
            s_row: inputs.S5_row_spacing_wp,
            gage: 0, // No gage for web plates
            le_long: le_long_wp,
            le_tran: le_tran_wp,
            t_thinner: t_thinner_web,
            jurisdiction: inputs.jurisdiction
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
        // FIX: Ensure hole_for_net_area_fp is valid, otherwise use a calculated default.
        // This prevents using the web bolt hole size for the flange check if flange plates are not used.
        const effective_hole_for_net_area_fp = hole_for_net_area_fp || (AISC_SPEC.getNominalHoleDiameter(inputs.D_fp) + 1.0 / 16.0);
        const effective_hole_for_net_area_wp = hole_for_net_area_wp || (AISC_SPEC.getNominalHoleDiameter(inputs.D_wp) + 1.0 / 16.0);


        // --- Beam Flexural Yielding (Gross Section) ---
        const Mn_yield = inputs.member_Fy * inputs.member_Zx;
        checks['Beam Flexural Yielding'] = {
            demand: M_load * 12, // kip-in
            check: { Rn: Mn_yield, phi: 0.90, omega: 1.67, Fy: inputs.member_Fy, Zx: inputs.member_Zx }
        };

        const Agv_beam_web = (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
        checks['Beam Web Shear Yielding'] = {
            demand: V_load,
            check: checkShearYielding(Agv_beam_web, inputs.member_Fy, inputs.jurisdiction),
            details: { d: inputs.member_d, tf: inputs.member_tf, tw: inputs.member_tw }
        };

        // The number of bolts in the critical section of one flange is 2 * Nr_fp (one for each bolt line on the gage).
        const num_bolts_in_flange_cs = 2 * inputs.Nr_fp;
        checks['Beam Flexural Rupture'] = { demand: M_load * 12, check: checkBeamFlexuralRupture(inputs.member_Sx, inputs.member_Fy, inputs.member_Fu, inputs.member_bf, inputs.member_tf, num_bolts_in_flange_cs, effective_hole_for_net_area_fp, inputs.jurisdiction) };

        const Anv_beam_web = (inputs.member_d - 2 * inputs.member_tf - inputs.Nr_wp * effective_hole_for_net_area_wp) * inputs.member_tw;
        checks['Beam Web Shear Rupture'] = {
            demand: V_load,
            check: checkShearRupture(Anv_beam_web, inputs.member_Fu, inputs.jurisdiction),
            details: { d: inputs.member_d, tf: inputs.member_tf, Nr_wp: inputs.Nr_wp, hole_dia: effective_hole_for_net_area_wp, tw: inputs.member_tw }
        };

        if (Axial_load !== 0) {
            const flange_net_section_check = checkFlangeNetSection({
                bf: inputs.member_bf,
                tf: inputs.member_tf,
                Fu: inputs.member_Fu,
                num_bolts_in_cs: num_bolts_in_flange_cs,
                hole_dia_net_area: effective_hole_for_net_area_fp,
                jurisdiction: inputs.jurisdiction
            });
            const moment_arm = inputs.member_d - inputs.member_tf;
            const moment_capacity = flange_net_section_check.Rn * moment_arm;
            checks['Spliced Member Moment Capacity'] = {
                demand: M_load * 12,
                check: { ...flange_net_section_check, Rn: moment_capacity },
                details: { ...flange_net_section_check, moment_arm }
            };
        } else {
            const flexural_yielding = checks['Beam Flexural Yielding'].check;
            const flexural_rupture = checks['Beam Flexural Rupture'].check;
            const moment_capacity = Math.min(flexural_yielding.Rn, flexural_rupture.Rn);
            checks['Spliced Member Moment Capacity'] = {
                demand: M_load * 12,
                check: { Rn: moment_capacity, phi: 0.90, omega: 1.67 },
                details: {
                    yielding: flexural_yielding,
                    rupture: flexural_rupture
                }
            };
        }

        // --- Beam Section Tensile Rupture Check (with Shear Lag) ---
        if (Axial_load > 0) {
            const A_gross_approx = 2 * inputs.member_bf * inputs.member_tf + (inputs.member_d - 2 * inputs.member_tf) * inputs.member_tw;
            const A_holes_flange = (2 * inputs.Nr_fp) * effective_hole_for_net_area_fp * inputs.member_tf;
            const A_holes_web = inputs.Nr_wp * effective_hole_for_net_area_wp * inputs.member_tw; // Holes in one line
            const An = A_gross_approx - 2 * A_holes_flange - A_holes_web; // Holes in both flanges

            // --- Shear Lag Factor U per AISC Table D3.1 ---
            // For a W-shape connected by the flanges, Case 7 is often used.
            // U = 0.9 if bf >= 2/3 d, otherwise U = 0.85
            const U_case7 = (inputs.member_bf >= (2 / 3) * inputs.member_d) ? 0.90 : 0.85;

            // Alternatively, Case 2 can be used.
            const conn_length_flange = (inputs.Nc_fp - 1) * inputs.S1_col_spacing_fp;
            const { U: U_case2, x_bar } = computeShearLagFactorU({ plate_width: inputs.member_bf, gage: inputs.g_gage_fp, num_fastener_rows: inputs.Nr_fp, conn_length: conn_length_flange, t_p: inputs.member_tf, d_bolt: inputs.D_fp });

            // Per AISC D3, it is permitted to use the larger value.
            const U = Math.max(U_case2, U_case7);

            const Ae = U * An;
            const check = {
                Rn: inputs.member_Fu * Ae, phi: 0.75, omega: 2.00,
                An, Ae, U, Fu: inputs.member_Fu,
                details: { Ag_approx: A_gross_approx, A_holes_flange, A_holes_web, U_case2, U_case7, x_bar, conn_length: conn_length_flange }
            };
            check.phi = getDesignFactors(inputs.jurisdiction, 0.75, 2.00).phi;
            check.omega = getDesignFactors(inputs.jurisdiction, 0.75, 2.00).omega;
            checks['Beam Section Tensile Rupture'] = { demand: Axial_load, check };
        }
        return { checks, inputs };
    }

    function performChecks(inputs, M_load, V_load) {
        // --- Demand Calculations ---
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
        const Hw = (inputs.H_wp > 0) ? Mu_resisted_by_web / (inputs.H_wp * 0.75) : 0; // Prevent division by zero
        const webResults = performWebChecks(inputs, { V_load, Hw, Mu_resisted_by_web });
        const calculated_holes = { hole_for_net_area_fp: flangeResults.checks['Beam Flange Tensile Rupture']?.check?.hole_dia_net_area, hole_for_net_area_wp: webResults.checks['Web Plate Net Shear Rupture']?.details?.hole_dia };
        const memberResults = performMemberChecks(inputs, { M_load, V_load, Axial_load: inputs.Axial_load }, calculated_holes);

        return {
            checks: { ...flangeResults.checks, ...webResults.checks, ...memberResults.checks }, // FIX: Spread first, then set the correct total Rn
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
            // Use the clear web area for shear capacity calculation, per AISC G2.1
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
        const MAX_TOTAL_BOLTS_PER_SIDE = 48; // Increased limit
        const MAX_ROWS_OR_COLS = 10;
        const flangeBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_fp];
        let bestSolution = null;
        let lastFailureReason = "No valid configuration found within limits.";

        for (const d_fp of flangeBoltDiameters) {
            // Iterate by total number of bolts to find the minimum required first.
            for (let total_bolts = 2; total_bolts <= MAX_TOTAL_BOLTS_PER_SIDE; total_bolts += 2) {
                if (bestSolution && total_bolts >= bestSolution.num_bolts_per_side) break; // Found a solution, no need to check for more bolts.

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

                        const failingGeomCheck = Object.entries(results.geomChecks['Flange Bolts'] || {})
                            .find(([key, data]) => !data.pass);

                        if (!failingStrengthCheck && !failingGeomCheck) {
                            bestSolution = {
                                inputs: currentInputs,
                                num_bolts_per_side: total_bolts
                            };
                            // Break from the nc_fp loop to move to the next total_bolts count (or exit).
                            break;
                        } else {
                            // Log the last failure reason for this bolt count.
                            if (failingStrengthCheck) lastFailureReason = `Strength check failed: ${failingStrengthCheck[0]}`;
                            else if (failingGeomCheck) lastFailureReason = `Geometry check failed: ${failingGeomCheck[0]}`;
                        }
                    }
                }
            }
            if (bestSolution) break; // Found a solution with this diameter, no need to check smaller diameters.
        }

        if (bestSolution) {
            const { Nc_fp, Nr_fp, D_fp } = bestSolution.inputs; // These are undefined here.
            optimizationLog.push(`Flange splice optimized to ${Nc_fp} column(s) and ${Nr_fp} row(s) of ${D_fp}" bolts (${bestSolution.num_bolts_per_side} bolts per side).`);
            return bestSolution.inputs;
        }

        optimizationLog.push(`Flange splice optimization failed. Last failure reason: ${lastFailureReason}`);
        return null;
    }

    function optimizeWebBolts(inputs, optimizationLog) {
        const MAX_TOTAL_BOLTS_PER_SIDE = 48; // Increased limit
        const webBoltDiameters = inputs.optimize_diameter_check ? AISC_SPEC.standardBoltDiameters : [inputs.D_wp];
        let bestSolution = null;
        let lastFailureReason = "No valid configuration found within limits.";

        for (const d_wp of webBoltDiameters) {
            for (let total_bolts = 1; total_bolts <= MAX_TOTAL_BOLTS_PER_SIDE; total_bolts++) {
                // If we already found a solution with fewer bolts, no need to continue this loop.
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

                        const failingGeomCheck = Object.entries(results.geomChecks['Web Bolts'] || {})
                            .find(([key, data]) => !data.pass);

                        if (!failingStrengthCheck && !failingGeomCheck) {
                            bestSolution = {
                                inputs: currentInputs,
                                num_bolts_per_side: total_bolts
                            };
                            // Break the inner loop since we found the best solution for this total_bolts count
                            break;
                        } else {
                            if (failingStrengthCheck) lastFailureReason = `Strength check failed: ${failingStrengthCheck[0]}`;
                            else if (failingGeomCheck) lastFailureReason = `Geometry check failed: ${failingGeomCheck[0]}`;
                        }
                    }
                }
                if (bestSolution && total_bolts === bestSolution.num_bolts_per_side) break;
            }
            if (bestSolution) break; // Found a solution with this diameter.
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

        // --- Step 1: Optimize Flange ---
        const optimizedFlangeInputs = optimizeFlangeBolts(inputs, optimizationLog);

        if (!optimizedFlangeInputs) {
            // If flange optimization fails, we can't proceed. Return the failure log.
            return { ...runSingleCheck(inputs), optimizationLog }; // Rerun with original inputs to show failure
        }

        // --- Step 2: Optimize Web using the already optimized flange inputs ---
        const finalOptimizedInputs = optimizeWebBolts(optimizedFlangeInputs, optimizationLog);

        if (!finalOptimizedInputs) {
            // If web optimization fails, return results with the optimized flange but original web bolts to show the failure.
            return { ...runSingleCheck(optimizedFlangeInputs), optimizationLog };
        }

        // --- Step 3: Success. Run a final check with the fully optimized inputs ---
        const finalResults = runSingleCheck(finalOptimizedInputs);
        return { ...finalResults, optimizationLog };
    }
    /**
     * Main calculation orchestration function.
     * It takes raw string inputs from the DOM, converts them to numbers,
     * handles optimization logic, and calls the appropriate check functions.
     * @param {object} rawInputs - The inputs object gathered from the DOM.
     * @returns {object} The complete results object.
     */
    function run(rawInputs) {
        const inputs = { ...rawInputs };

        // Helper to safely parse numbers, defaulting to 0 if NaN/invalid.
        // Now uses safeMathEval to handle expressions if they weren't caught by blur yet.
        const safeFloat = (val) => {
            if (typeof val === 'number') return val;
            const evalResult = safeMathEval(val);
            return (evalResult !== null && isFinite(evalResult)) ? evalResult : 0;
        };

        // Parse key dimensions and loads
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

        // The user inputs TOTAL plate length. Convert to length-per-side for calculations.
        inputs.L_fp = safeFloat(rawInputs.L_fp) / 2.0;
        inputs.L_fp_inner = safeFloat(rawInputs.L_fp_inner) / 2.0;
        inputs.L_wp = safeFloat(rawInputs.L_wp) / 2.0;

        if (inputs.optimize_bolts_check) {
            return runOptimization(inputs);
        } else {
            return runSingleCheck(inputs);
        }
    }

    // Expose private functions for unit testing
    const __test_exports__ = { checkBoltShear, checkBlockShear };

    return { run, __test_exports__ };
})();
const baseBreakdownGenerators = {
    'Flange Bolt Shear': ({ check, details }, common) => {
        const wasReducedText = check.wasReduced ? `<br><span class="text-yellow-600">Note: F<sub>nv</sub> was reduced by 20% for long joint length.</span>` : '';
        return common.format_list([
            `<u>Nominal Shear Strength per bolt (R<sub>n,bolt</sub>)</u>`,
            `R<sub>n,bolt</sub> = F<sub>nv</sub> &times; A<sub>b</sub> &times; n<sub>planes</sub>`,
            `R<sub>n,bolt</sub> = ${common.fmt(check.Fnv, 1)} ksi &times; ${common.fmt(check.Ab, 3)} in² &times; ${check.num_planes} = ${common.fmt(details.Rn_single)} kips${wasReducedText}`,
            `<u>Total Nominal Strength (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = R<sub>n,bolt</sub> &times; n<sub>bolts</sub>`,
            `R<sub>n</sub> = ${common.fmt(details.Rn_single)} kips &times; ${details.num_bolts} = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'GSY': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4-1</u>`,
        `R<sub>n</sub> = F<sub>y</sub> &times; A<sub>g</sub>`,
        `R<sub>n</sub> = ${common.fmt(check.Fy, 1)} ksi &times; ${common.fmt(check.Ag, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'NSF': ({ check }, common) => common.format_list([
        `<u>Net Area (A<sub>n</sub>) per AISC J4.1</u>`,
        `A<sub>n</sub> = A<sub>g</sub> - A<sub>holes</sub> = ${common.fmt(check.Ag, 3)} - ${common.fmt(check.A_holes, 3)} = <b>${common.fmt(check.An, 3)} in²</b>`,
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.1(b)</u>`,
        `R<sub>n</sub> = F<sub>u</sub> &times; A<sub>n</sub> (Shear lag factor U=1.0 for splice plates)`,
        `R<sub>n</sub> = ${common.fmt(check.Fu)} ksi &times; ${common.fmt(check.An, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Block Shear': ({ check }, common) => common.format_list([
        `<u>Nominal Strength per AISC J4.3</u>`,
        `Shear Rupture Path: 0.6 × F<sub>u</sub> × A<sub>nv</sub> = ${common.fmt(check.details.shear_rupture_term)} kips`,
        `Tension Rupture Path: U<sub>bs</sub> × F<sub>u</sub> × A<sub>nt</sub> = ${common.fmt(check.details.tension_rupture_term)} kips`,
        `Shear Yield Limit: 0.6 × F<sub>y</sub> × A<sub>gv</sub> + U<sub>bs</sub> × F<sub>u</sub> × A<sub>nt</sub> = ${common.fmt(check.details.shear_yield_limit)} kips`,
        `R<sub>n</sub> = min(paths) = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Bolt Bearing': ({ check, details, demand }, common) => {
        const tearout_coeff = common.inputs.deformation_is_consideration ? 1.2 : 1.5;
        const bearing_coeff = common.inputs.deformation_is_consideration ? 2.4 : 3.0;
        return common.format_list([
            `Bolt Bearing per AISC J3.10`,
            `Deformation at bolt holes is ${common.inputs.deformation_is_consideration ? '' : '<b>not</b> '}a design consideration.`,
            `<strong>Edge Bolts (per bolt):</strong>`,
            `L<sub>c</sub> = L<sub>e</sub> - d<sub>h</sub>/2 = ${common.fmt(details.edge.Lc, 3)} in`,
            `R<sub>n,tearout</sub> = ${tearout_coeff} &times; L<sub>c</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.edge.Rn_tearout)} kips`,
            `R<sub>n,bearing</sub> = ${bearing_coeff} &times; d<sub>b</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.edge.Rn_bearing)} kips`,
            `R<sub>n,edge</sub> = min(Tearout, Bearing) = ${common.fmt(details.edge.Rn)} kips`,
            `<strong>Interior Bolts (per bolt):</strong>`,
            `L<sub>c</sub> = s - d<sub>h</sub> = ${common.fmt(details.int.Lc, 3)} in`,
            `R<sub>n,tearout</sub> = ${tearout_coeff} &times; L<sub>c</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.int.Rn_tearout)} kips`,
            `R<sub>n,bearing</sub> = ${bearing_coeff} &times; d<sub>b</sub> &times; t &times; F<sub>u</sub> = ${common.fmt(details.int.Rn_bearing)} kips`,
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
            `Bolt Group Coefficient (C) = <b>${common.fmt(details.C, 2)}</b> (iterative convergence on ICR location)`,
            `Single Bolt Capacity (R_n,bolt) = <b>${common.fmt(details.Rn_single)} kips</b>`,
            `Nominal Group Capacity (R_n,group) = C × R_n,bolt = ${common.fmt(details.C, 2)} × ${common.fmt(details.Rn_single)} = <b>${common.fmt(check.Rn)} kips</b>`,
            `Design Capacity = ${common.capacity_eq} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Shear Yield': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.2(a)</u>`,
        `R<sub>n</sub> = 0.6 &times; F<sub>y</sub> &times; A<sub>gv</sub>`,
        `R<sub>n</sub> = 0.6 &times; ${common.fmt(check.Fy, 1)} ksi &times; ${common.fmt(check.Agv, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Shear Rupture': ({ check }, common) => common.format_list([
        `<u>Nominal Strength (R<sub>n</sub>) per AISC J4.1</u>`,
        `R<sub>n</sub> = 0.6 &times; F<sub>u</sub> &times; A<sub>nv</sub>`,
        `R<sub>n</sub> = 0.6 &times; ${common.fmt(check.Fu, 1)} ksi &times; ${common.fmt(check.Anv, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
        `<u>Design Capacity</u>`,
        `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
    ]),
    'Web Bolt Shear/Tension Interaction': ({ check }, common) => common.format_list([
        `<u>Adjusted Tensile Strength per AISC J3.9</u>`,
        `Required Shear Stress (f<sub>rv</sub>) = V<sub>u</sub> / A<sub>b</sub> = ${common.fmt(check.Vu)} / ${common.fmt(check.Ab, 3)} = ${common.fmt(check.fv)} ksi`,
        `Available Tensile Stress (F'<sub>nt</sub>) = 1.3&times;F<sub>nt</sub> - (${common.factor_char}&times;F<sub>nt</sub>/F<sub>nv</sub>)&times;f<sub>rv</sub>`,
        `F'<sub>nt</sub> = 1.3&times;${common.fmt(check.Fnt, 1)} - (${common.factor_val}&times;${common.fmt(check.Fnt, 1)}/${common.fmt(check.Fnv, 1)})&times;${common.fmt(check.fv)} = ${common.fmt(check.F_nt_prime)} ksi`,
        `<u>Adjusted Nominal Tensile Strength (R<sub>n</sub>)</u>`,
        `R<sub>n</sub> = F'<sub>nt</sub> &times; A<sub>b</sub> = ${common.fmt(check.F_nt_prime)} &times; ${common.fmt(check.Ab, 3)} = <b>${common.fmt(check.Rn)} kips</b>`,
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
        const { demand, check, details } = data; // demand is T_req
        const outer_pry = details.outer ? `Outer Plate Q = ${common.fmt(details.outer.Q)} kips (t<sub>c</sub>=${common.fmt(details.outer.tc, 3)} in)` : '';
        const inner_pry = details.inner ? `Inner Plate Q = ${common.fmt(details.inner.Q)} kips (t<sub>c</sub>=${common.fmt(details.inner.tc, 3)} in)` : '';
        return common.format_list([
            `Prying action per AISC Manual Part 9.`,
            outer_pry,
            inner_pry,
            `<u>Total Bolt Tension Demand (T<sub>req</sub>)</u>`,
            `T<sub>req</sub> = B + Q = ${common.fmt(details.B_per_bolt)} + ${common.fmt(details.Q_total)} = <b>${common.fmt(demand)} kips</b>`,
            `<u>Bolt Tensile Capacity (R<sub>n</sub>)</u>`,
            `R<sub>n</sub> = F<sub>nt</sub> &times; A<sub>b</sub>`,
            `R<sub>n</sub> = ${common.fmt(check.Fnt, 1)} ksi &times; ${common.fmt(check.Ab, 3)} in² = <b>${common.fmt(check.Rn)} kips</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kips</b>`
        ]);
    },
    'Beam Flexural Yielding': ({ check }, common) => {
        return common.format_list([
            `<u>Flexural Yielding Check per AISC F2.1</u>`,
            `Nominal Moment Strength (M<sub>n</sub>) = F<sub>y</sub> &times; Z<sub>x</sub>`,
            `M<sub>n</sub> = ${common.fmt(check.Fy)} ksi &times; ${common.fmt(check.Zx)} in³ = <b>${common.fmt(check.Rn)} kip-in</b>`,
            `<u>Design Capacity</u>`,
            `Capacity = ${common.capacity_eq} = ${common.fmt(check.Rn)} / ${common.factor_val} = <b>${common.fmt(common.final_capacity)} kip-in</b>`
        ]);
    },
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
        const prying_data = details.outer || {}; // Use outer plate details for this check
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
        const slenderness_check = `Slenderness (&lambda;) = ${common.fmt(check.slenderness)} &le; 25`;

        let fcr_calc = `Since &lambda; &le; 25, F<sub>cr</sub> = F<sub>y</sub> = ${common.fmt(check.Fy)} ksi`;
        if (check.slenderness > 25) {
            fcr_calc = `
                <li>Elastic Buckling Stress (F<sub>e</sub>) = (&pi;² &times; E) / &lambda;² = ${common.fmt(check.Fe)} ksi</li>
                <li>Since F<sub>y</sub> / F<sub>e</sub> = ${(check.Fy / check.Fe).toFixed(3)} &le; 2.25, F<sub>cr</sub> = [0.658<sup>(Fy/Fe)</sup>] &times; F<sub>y</sub> = ${common.fmt(check.Fcr)} ksi</li>
            `;
        }

        return common.format_list([
            `<u>Compressive Strength per AISC Chapter E</u>`,
            `Radius of Gyration (r) = t / &radic;12 = ${common.fmt(check.t, 3)} / &radic;12 = ${common.fmt(check.r, 3)} in`,
            `Slenderness (&lambda;) = (k &times; L) / r = (${check.k} &times; ${check.unbraced_length}") / ${common.fmt(check.r, 3)} = ${common.fmt(check.slenderness)}`,
            `<u>Critical Buckling Stress (F<sub>cr</sub>)</u>`,
            fcr_calc,
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
    // Direct match first
    if (baseBreakdownGenerators[name]) {
        return baseBreakdownGenerators[name];
    }
    // Keyword-based matching to eliminate aliases
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
    if (name.includes('Beam Flange Tensile Rupture')) return baseBreakdownGenerators['NSF']; // Reuse the plate NSF breakdown
    if (name.includes('Plate Thickness for Prying')) return baseBreakdownGenerators['Plate Thickness for Prying'];
    if (name.includes('Spliced Member Moment Capacity')) return baseBreakdownGenerators['Spliced Member Moment Capacity'];

    // Fallback
    return () => 'Breakdown not available for this check.';
}

/**
 * Generates the HTML for a specific check's breakdown.
 * This function acts as a bridge between the rendering logic and the individual breakdown generators.
 * @param {string} name - The name of the check.
 * @param {object} data - The data object for the check, containing demand, check results, and details.
 * @param {object} inputs - The full user inputs object.
 * @returns {string} The generated HTML string for the breakdown.
 */
function generateSpliceBreakdownHtml(name, data, inputs) {
    const { check } = data;
    const { design_method } = inputs;

    // Create a common context object to pass to the breakdown generators.
    const common = {
        inputs,
        fmt: (val, dec = 2) => (val !== undefined && val !== null && !isNaN(parseFloat(val))) ? parseFloat(val).toFixed(dec) : 'N/A',

        format_list: (items) => `<ul class="list-disc list-inside space-y-1">${items.map(i => `<li class="py-1">${i}</li>`).join('')}</ul>`,
        factor_char: design_method === 'LRFD' ? '&phi;' : '&Omega;',
        factor_val: design_method === 'LRFD' ? (check?.phi ?? 0.9) : (check?.omega ?? 1.67),
        capacity_eq: design_method === 'LRFD' ? `&phi;R<sub>n</sub>` : `R<sub>n</sub> / &Omega;`,
        final_capacity: design_method === 'LRFD' ? (check?.Rn || 0) * (check?.phi ?? 0.75) : (check?.Rn || 0) / (check?.omega || 2.00)
    };

    // Get the specific generator function for this check name and execute it.
    const generator = getBreakdownGenerator(name);
    return generator(data, common);
}

async function populateShapeDropdown() {
    const shapeSelect = document.getElementById('aisc_shape_select');
    const shapeTypeSelect = document.getElementById('member_shape_type');
    if (!shapeSelect || !shapeTypeSelect) return;

    try {
        const selectedType = shapeTypeSelect.value;
        const shapes = await AISC_SPEC.getShapesByType(selectedType);
        const shapeNames = Object.keys(shapes).sort();

        const currentVal = shapeSelect.value;
        shapeSelect.innerHTML = '<option value="">-- Manual Input --</option>'; // Reset
        shapeNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            shapeSelect.appendChild(option);
        });

        if (shapeNames.includes(currentVal)) {
            shapeSelect.value = currentVal;
        }

    } catch (error) {
        console.error("Failed to populate shape dropdown:", error);
        shapeSelect.innerHTML = '<option value="">Could not load shapes</option>';
    }
}

async function handleShapeSelection() {
    const shapeName = document.getElementById('aisc_shape_select').value;
    const memberInputs = ['member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Zx', 'member_Sx'];

    if (!shapeName) {
        memberInputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.readOnly = false;
        });
        return;
    }

    const shape = await AISC_SPEC.getShape(shapeName);
    if (!shape) return;

    const propertyMap = {
        'member_d': shape.d, 'member_bf': shape.bf, 'member_tf': shape.tf, 'member_tw': shape.tw,
        'member_Zx': shape.Zx, 'member_Sx': shape.Sx
    };

    Object.keys(propertyMap).forEach(id => {
        const el = document.getElementById(id);
        if (el && propertyMap[id] !== undefined) {
            el.value = propertyMap[id];
            el.readOnly = true;
        }
    });

    // Manually trigger the 3D diagram update since programmatic value changes don't fire input events
    draw3dSpliceDiagram();
    draw2dSpliceDiagram();
}

function getAllInputIdsOnPage() {
    const ids = new Set();
    document.querySelectorAll('input[id], select[id]').forEach(el => ids.add(el.id));
    return Array.from(ids);
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
    ].map(row => row.type === 'subheader' ? row : { ...row, cells: row.cells.map(cell => cell || '') }); // Ensure all cells are strings

    return {
        title: 'Load Summary',
        table: { headers: ['Load Type / Distribution', 'Calculation', 'Magnitude'], rows: rows }
    };
}

function renderSpliceInputSummary(inputs) {
    const {
        design_method, gap,
        member_d, member_bf, member_tf, member_tw, member_Fy, member_Fu,
        num_flange_plates, H_fp, t_fp, L_fp, flange_plate_Fy, flange_plate_Fu,
        H_fp_inner, t_fp_inner, L_fp_inner, flange_plate_Fy_inner, flange_plate_Fu_inner,
        Nc_fp, Nr_fp, D_fp, bolt_grade_fp, threads_included_fp, S1_col_spacing_fp, S2_row_spacing_fp, S3_end_dist_fp, g_gage_fp,
        num_web_plates, H_wp, t_wp, L_wp, web_plate_Fy, web_plate_Fu,
        Nc_wp, Nr_wp, D_wp, bolt_grade_wp, threads_included_wp, S4_col_spacing_wp, S5_row_spacing_wp, S6_end_dist_wp
    } = inputs;

    const sections = [
        {
            title: 'General & Member Properties',
            rows: [
                { cells: ['Design Method', design_method] },
                { cells: ['Splice Gap', `${gap}"`] },
                { cells: ['Member', `W-Shape (d=${member_d}", b<sub>f</sub>=${member_bf}", t<sub>f</sub>=${member_tf}", t<sub>w</sub>=${member_tw}")`] },
                { cells: ['Member Material', `F<sub>y</sub>=${member_Fy} ksi, F<sub>u</sub>=${member_Fu} ksi`] }
            ]
        },
        {
            title: 'Flange Splice Details',
            rows: [
                { cells: ['Outer Plate', `PL ${H_fp}" &times; ${L_fp * 2}" &times; ${t_fp}"`] },
                { cells: ['Outer Plate Material', `F<sub>y</sub>=${flange_plate_Fy} ksi, F<sub>u</sub>=${flange_plate_Fu} ksi`] },
                ...(num_flange_plates == 2 ? [
                    { cells: ['Inner Plate', `2 x PL ${H_fp_inner}" &times; ${L_fp_inner * 2}" &times; ${t_fp_inner}"`] },
                    { cells: ['Inner Plate Material', `F<sub>y</sub>=${flange_plate_Fy_inner} ksi, F<sub>u</sub>=${flange_plate_Fu_inner} ksi`] }
                ] : [])
            ]
        },
        {
            title: 'Flange Bolt Details',
            rows: [
                { cells: ['Configuration', `${Nc_fp * Nr_fp * 4} total bolts (${2 * Nc_fp} cols &times; ${2 * Nr_fp} rows)`] },
                { cells: ['Bolt Details', `&empty;${D_fp}" ${bolt_grade_fp} (${threads_included_fp ? 'Threads Included' : 'Threads Excluded'})`] },
                { cells: ['Spacing (Pitch, S1)', `${S1_col_spacing_fp}"`] },
                { cells: ['Spacing (Gage, g)', `${g_gage_fp}"`] },
                { cells: ['Spacing (Row, S2)', `${S2_row_spacing_fp}"`] },
                { cells: ['End Distance (S3)', `${S3_end_dist_fp}"`] }
            ]
        },
        {
            title: 'Web Splice Details',
            rows: [
                { cells: ['Web Plate(s)', `${num_web_plates} &times; PL ${H_wp}" &times; ${L_wp * 2}" &times; ${t_wp}"`] },
                { cells: ['Web Plate Material', `F<sub>y</sub>=${web_plate_Fy} ksi, F<sub>u</sub>=${web_plate_Fu} ksi`] }
            ]
        },
        {
            title: 'Web Bolt Details',
            rows: [
                { cells: ['Configuration', `${Nc_wp * Nr_wp * 2} total bolts (${2 * Nc_wp} cols &times; ${Nr_wp} rows)`] },
                { cells: ['Bolt Details', `&empty;${D_wp}" ${bolt_grade_wp} (${threads_included_wp ? 'Threads Included' : 'Threads Excluded'})`] },
                { cells: ['Spacing (Pitch, S4)', `${S4_col_spacing_wp}"`] },
                { cells: ['Spacing (Gage, S5)', `${S5_row_spacing_wp}"`] },
                { cells: ['End Distance (S6)', `${S6_end_dist_wp}"`] }
            ]
        }
    ];
    return sections;
}


async function populateReportDiagrams() {
    // 1. 3D Diagram
    const img3d = document.getElementById('report-img-3d');
    // bjsEngine and bjsScene are defined in the file scope (lines 1-2).
    // Access them directly. Also check window.bjsEngine as a fallback if they were moved.
    const engine = (typeof bjsEngine !== 'undefined' ? bjsEngine : window.bjsEngine);
    const scene = (typeof bjsScene !== 'undefined' ? bjsScene : window.bjsScene);

    if (img3d && engine && scene && scene.activeCamera) {
        try {
            // Use a slight timeout to ensure report rendering doesn't interfere with canvas capture
            setTimeout(() => {
                BABYLON.Tools.CreateScreenshot(engine, scene.activeCamera, { precision: 2 }, (data) => {
                    if (img3d) img3d.src = data;
                });
            }, 100);
        } catch (e) {
            console.warn("Failed to capture 3D screenshot for report:", e);
            img3d.alt = "3D Diagram generation failed";
        }
    }

    // 2. 2D Diagram
    const img2d = document.getElementById('report-img-2d');
    const svg = document.getElementById('splice-2d-diagram'); // The ID is on the SVG element itself
    
    if (img2d && svg) {
        try {
            // Check if shared utility is available
            if (typeof convertSvgToPng === 'function') {
                convertSvgToPng(svg).then(pngImage => {
                    if (pngImage && pngImage.src && img2d) {
                       img2d.src = pngImage.src;
                    }
                }).catch(err => {
                    console.error("SVG conversion failed", err);
                     // Fallback to simple serialization if fancy conversion fails
                     const xml = new XMLSerializer().serializeToString(svg);
                     const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
                     if (img2d) img2d.src = dataUrl;
                });
            } else {
                 // Simple fallback 
                 const xml = new XMLSerializer().serializeToString(svg);
                 const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(xml)))}`;
                 img2d.src = dataUrl;
            }
        } catch (e) {
             console.warn("Failed to capture 2D diagram for report:", e);
             img2d.alt = "2D Diagram generation failed";
        }
    }
}

function renderResults(results, rawInputs) {
    const { checks, geomChecks, inputs, final_loads, demands } = results; // `inputs` here are the potentially modified ones from the calc
    
    // --- 0. Pre-calculate Governing Status ---
    let maxRatio = 0.0;
    let governingCheckName = "None";
    let isFail = false;
    let failReason = "";

    const checkCategories = [
        {
            title: getTranslation('flange_plate_checks'),
            checks: [
                'Flange Bolt Shear', 'Flange Bolt Tension with Prying', 'Plate Thickness for Prying',
                'Outer Plate GSY', 'Outer Plate Compression', 'Outer Plate NSF', 'Outer Plate Block Shear', 'Outer Plate Bolt Bearing',
                'Inner Plate GSY', 'Inner Plate Compression', 'Inner Plate NSF', 'Inner Plate Block Shear', 'Inner Plate Bolt Bearing'
            ]
        },
        {
            title: getTranslation('web_plate_checks'),
            checks: [
                'Web Bolt Group Shear (ICR)', 'Web Bolt Slip', 'Web Plate Flexural Yielding', 'Web Plate Flexural Rupture',
                'Web Bolt Tension with Prying', 'Web Plate Gross Shear Yield', 'Web Plate Net Shear Rupture',
                'Web Plate Block Shear', 'Web Plate Bolt Bearing'
            ]
        },
        {
            title: getTranslation('beam_flange_checks'),
            checks: ['Beam Flange Tensile Rupture', 'Beam Flange Block Shear', 'Beam Flange Bolt Bearing']
        },
        {
            title: getTranslation('beam_web_checks'),
            checks: ['Beam Web Bolt Bearing', 'Beam Web Shear Yielding', 'Beam Web Shear Rupture']
        },
        {
            title: getTranslation('full_member_checks'),
            checks: ['Beam Flexural Yielding', 'Beam Flexural Rupture', 'Beam Section Tensile Rupture']
        }
    ];

    // Check Strength & Serviceability
    checkCategories.forEach(cat => {
        cat.checks.forEach(name => {
            if (checks[name]) {
                const data = checks[name];
                const { demand, check } = data;
                const { Rn, phi, omega } = check;
                const capacity = Rn || 0;
                const design_capacity = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

                let ratio = 0;
                if (name === 'Plate Thickness for Prying') {
                     const req_t = check.Rn;
                     const actual_t = demand;
                     ratio = actual_t > 0 ? req_t / actual_t : Infinity;
                } else {
                     ratio = design_capacity > 0 ? Math.abs(demand) / design_capacity : Infinity;
                }

                if (ratio > maxRatio) {
                    maxRatio = ratio;
                    governingCheckName = name;
                }
                if (ratio > 1.0) {
                    isFail = true;
                    if (!failReason) failReason = `${name} exceeded capacity.`;
                }
            }
        });
    });

    // Check Geometry
    let geomFailInfo = "";
    ['Flange Bolts', 'Web Bolts'].forEach(group => {
        if (geomChecks[group]) {
            Object.values(geomChecks[group]).forEach(val => {
                if (val && val.pass === false) {
                    isFail = true;
                    geomFailInfo = `${group} geometry check failed.`;
                }
            });
        }
    });

    const statusColor = isFail ? "text-red-700 bg-red-100" : "text-green-700 bg-green-100";
    const statusText = isFail ? "DOES NOT PASS" : "PASSES";
    const summaryText = isFail 
        ? `The splice connection <strong>DOES NOT PASS</strong> the design requirements. <br/>The governing issue is <strong>${failReason || geomFailInfo || governingCheckName}</strong>.`
        : `The splice connection <strong>PASSES</strong> all design checks. <br/>The governing factor is <strong>${governingCheckName}</strong> with a utilization ratio of <strong>${(maxRatio * 100).toFixed(1)}%</strong>.`;


    // --- 1. Initialize Report ---
    const report = new ReportBuilder({
        reportId: 'splice-report-content',
        title: getTranslation('splice_check'),
        warnings: results.optimizationLog
    });

    // --- 2. Executive Summary ---
    const execSummaryHtml = `
        <div class="mb-8 p-6 rounded-lg border ${isFail ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}">
            <h3 class="text-xl font-bold mb-4 ${isFail ? 'text-red-800' : 'text-green-800'}">Executive Summary: Layman's Recap</h3>
            <div class="flex items-center mb-4">
                <span class="text-3xl font-black px-4 py-2 rounded ${statusColor} border ${isFail ? 'border-red-300' : 'border-green-300'}">
                    ${statusText}
                </span>
            </div>
            <p class="text-lg text-gray-800 leading-relaxed">
                ${summaryText}
            </p>
            <p class="mt-2 text-sm text-gray-600">
                This summary is intended for quick review. Detailed engineering calculations and fabrication data follow below.
            </p>
        </div>
    `;
    report.addSection(null, execSummaryHtml);

    // --- 3. Load Summary (Context) ---
    const loadSummaryData = renderLoadSummary(rawInputs, final_loads, demands, inputs);
    report.addTableSection(loadSummaryData.title, loadSummaryData.table);

    // --- 4. Strength Checks (The Math) ---
    // Render each section by iterating through the defined lists
    checkCategories.forEach(category => {
        const { title: categoryTitle, checks: checkList } = category;
        const categoryRows = [];
        const hasChecks = checkList.some(name => checks[name]);

        if (hasChecks) {
            checkList.forEach(name => {
                if (checks[name]) {
                    const data = checks[name];
                    const { demand, check } = data;
                    const { Rn, phi, omega } = check;
                    const capacity = Rn || 0;
                    const design_capacity_raw = inputs.design_method === 'LRFD' ? capacity * (phi || 0.75) : capacity / (omega || 2.00);

                    let ratio, status, display_demand, display_capacity;

                    if (name === 'Plate Thickness for Prying') {
                        display_demand = design_capacity_raw; // Required T
                        display_capacity = demand; // Actual T
                        ratio = display_capacity > 0 ? display_demand / display_capacity : Infinity;
                    } else {
                        display_demand = demand;
                        display_capacity = design_capacity_raw;
                        ratio = display_capacity > 0 ? Math.abs(display_demand) / display_capacity : Infinity;
                    } 
                    status = ratio <= 1.0 ? `<span class="pass">${getTranslation('pass')}</span>` : `<span class="fail">${getTranslation('fail')}</span>`;

                    let demand_unit = 'kips', capacity_unit = 'kips';
                    if (name === 'Plate Thickness for Prying') {
                        demand_unit = 'in (req)';
                        capacity_unit = 'in';
                    }
                    if (name.includes('Flexural')) { display_demand /= 12.0; display_capacity /= 12.0; demand_unit = 'kip-ft'; capacity_unit = 'kip-ft'; }

                    const breakdownHtml = generateSpliceBreakdownHtml(name, data, inputs);

                    categoryRows.push({
                        cells: [name, `${display_demand.toFixed(2)} ${demand_unit}`, `${display_capacity.toFixed(2)} ${capacity_unit}`, ratio.toFixed(3), status],
                        details: breakdownHtml
                    });
                }
            });

            const tableTitle = `${categoryTitle} (${inputs.design_method})`;
            report.addTableSection(tableTitle, {
                headers: [getTranslation('limit_state'), getTranslation('demand'), getTranslation('capacity'), getTranslation('ratio'), getTranslation('status')],
                rows: categoryRows
            });
        }
    });

    // --- 5. Governing Capacity Summary (The Math Conclusion) ---
    const momentChecks = Object.entries(checks).filter(([key]) =>
        key.startsWith('Beam Flange') || key.startsWith('Beam Flexural')
    );
    const shearChecks = Object.entries(checks).filter(([key]) =>
        key.startsWith('Beam Web')
    );

    let governingMomentCapacity = Infinity;
    let governingMomentCheck = 'N/A';
    let governingShearCapacity = Infinity;
    let governingShearCheck = 'N/A';

    let momentBreakdownHtml = '<ul class="list-disc list-inside space-y-1">';
    let shearBreakdownHtml = '<ul class="list-disc list-inside space-y-1">';

    const moment_arm = demands.moment_arm_flange || 1;

    momentChecks.forEach(([key, data]) => {
        if (!data.check || !isFinite(data.check.Rn) || data.check.Rn === 0) return;
        let design_capacity = inputs.design_method === 'LRFD' ? data.check.Rn * (data.check.phi || 0.75) : data.check.Rn / (data.check.omega || 2.00);
        let moment_equiv_capacity;

        if (key.startsWith('Beam Flange')) {
            moment_equiv_capacity = (design_capacity * moment_arm) / 12.0;
        } else if (key.startsWith('Beam Flexural')) {
            moment_equiv_capacity = design_capacity / 12.0;
        } else {
            moment_equiv_capacity = design_capacity;
        }

        if (moment_equiv_capacity < governingMomentCapacity) {
            governingMomentCapacity = moment_equiv_capacity;
            governingMomentCheck = key;
        }
        momentBreakdownHtml += `<li><em>${key}:</em> ${moment_equiv_capacity.toFixed(2)} kip-ft</li>`;
    });

    shearChecks.forEach(([key, data]) => {
        if (!data.check || !isFinite(data.check.Rn) || data.check.Rn === 0) return;
        const capacity = inputs.design_method === 'LRFD' ? data.check.Rn * (data.check.phi || 0.90) : data.check.Rn / (data.check.omega || 1.67);

        if (capacity < governingShearCapacity) {
            governingShearCapacity = capacity;
            governingShearCheck = key;
        }
        shearBreakdownHtml += `<li><em>${key}:</em> ${capacity.toFixed(2)} kips</li>`;
    });

    // Generate detailed breakdown logic (simplified for brevity)
    if (governingMomentCheck !== 'N/A' && checks[governingMomentCheck]) {
        momentBreakdownHtml = generateSpliceBreakdownHtml(governingMomentCheck, checks[governingMomentCheck], inputs);
    }
    if (governingShearCheck !== 'N/A' && checks[governingShearCheck]) {
        shearBreakdownHtml = generateSpliceBreakdownHtml(governingShearCheck, checks[governingShearCheck], inputs);
    }
    
    // Add Summary
    const summaryRows = [
        {
            cells: ['Spliced Member Moment Capacity', `<b>${governingMomentCapacity === Infinity ? 'N/A' : governingMomentCapacity.toFixed(2) + ' kip-ft'}</b>`, `Controlled by: <em>${governingMomentCheck}</em>`],
            details: momentBreakdownHtml
        },
        {
            cells: ['Spliced Member Shear Capacity', `<b>${governingShearCapacity === Infinity ? 'N/A' : governingShearCapacity.toFixed(2) + ' kips'}</b>`, `Controlled by: <em>${governingShearCheck}</em>`],
            details: shearBreakdownHtml
        }
    ];
    report.addTableSection('Splice Capacity Summary', { headers: ['Capacity Type', 'Value', 'Governing Limit State'], rows: summaryRows }, 'splice-capacity-summary');


    // --- 6. Fabrication Appendix ---
    const appendixHtml = `
        <div class="mt-12 mb-6 border-b-2 border-gray-300 pb-2 bg-gray-50 p-4 rounded-t-lg">
            <h2 class="text-2xl font-bold text-gray-800 uppercase tracking-wide">Appendix A: Fabrication & Drafting Details</h2>
            <p class="text-gray-500 italic mt-1">This section is intended for drafters and fabricators. It contains detailed dimensions, geometry checks, and fabrication data.</p>
        </div>
    `;
    report.addSection(null, appendixHtml);

    // A. Diagrams (Moved to Appendix)
    const diagramSectionHtml = `
        <div class="grid grid-cols-1 gap-8 mb-6">
            <div class="flex flex-col items-center">
                <h4 class="font-bold text-lg mb-2 text-gray-800">2D Elevation (Drafting View)</h4>
                <div class="border rounded p-2 bg-white w-full h-auto min-h-[300px] flex items-center justify-center shadow-sm">
                    <img id="report-img-2d" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="2D Diagram" class="max-w-full h-auto object-contain">
                </div>
            </div>
            <div class="flex flex-col items-center">
                <h4 class="font-bold text-lg mb-2 text-gray-800">3D Visualization</h4>
                <div class="border rounded p-2 bg-white w-full h-auto min-h-[300px] flex items-center justify-center shadow-sm">
                    <img id="report-img-3d" src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=" alt="3D Diagram" class="max-w-full h-auto object-contain">
                </div>
            </div>
        </div>
    `;
    report.addSection(null, diagramSectionHtml);

    // B. Detailed Input Summary (Moved to Appendix)
    const inputSummarySections = renderSpliceInputSummary(inputs);
    inputSummarySections.forEach(section => {
        report.addTableSection(section.title, { headers: [getTranslation('parameter'), getTranslation('value')], rows: section.rows });
    });

    // C. Geometry Checks (Moved to Appendix)
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
    
    report.addTableSection(getTranslation('geometry_spacing_checks_title'), { 
        headers: [getTranslation('check_column_header'), getTranslation('actual_in'), getTranslation('min_required_in'), getTranslation('status')], 
        rows: geomRows 
    });

    report.render('results-container');
    
    // Populate the diagrams (async)
    populateReportDiagrams();
    
    // Check if we have attachReportEventListeners available (from shared-utils.js)
    if (typeof attachReportEventListeners === 'function') {
        attachReportEventListeners('results-container', {
            reportId: 'splice-report-content', 
            filenamePrefix: 'Splice-Report',
            onSendToCombos: null, // Splice results are structural checks, not load combos usually
            toggleTexts: { show: 'Show', hide: 'Hide', showAll: 'Show All', hideAll: 'Hide All' }
        });
    }
}

// --- Input Gathering and Orchestration (Legacy, kept for reference) ---
const inputIds = [
    'design_method', 'jurisdiction', 'global_fos', 'gap', 'member_d', 'member_bf', 'member_tf', 'member_tw', 'member_Fy', 'member_Fu', // Added jurisdiction, global_fos
    'member_material', 'member_Zx', 'member_Sx', 'M_load', 'V_load', 'Axial_load', 'develop_capacity_check', 'deformation_is_consideration', 'g_gage_fp', 'optimize_bolts_check', 'optimize_diameter_check', 'optimize_web_plates_check', 'optimize_flange_plates_check',
    'num_flange_plates', 'flange_plate_material', 'flange_plate_Fy', 'flange_plate_Fu', 'H_fp', 't_fp', 'L_fp',
    'flange_plate_material_inner', 'flange_plate_Fy_inner', 'flange_plate_Fu_inner', 'H_fp_inner', 't_fp_inner', 'L_fp_inner',
    'Nc_fp', 'Nr_fp', 'S1_col_spacing_fp', 'S2_row_spacing_fp', 'S3_end_dist_fp',
    'num_web_plates', 'web_plate_material', 'web_plate_Fy', 'web_plate_Fu', 'H_wp', 't_wp', 'L_wp', 'connection_type', 'faying_surface_class',
    'Nc_wp', 'Nr_wp', 'S4_col_spacing_wp', 'S5_row_spacing_wp', 'S6_end_dist_wp',
    'D_fp', 'bolt_grade_fp', 'threads_included_fp', 'D_wp', 'bolt_grade_wp', 'threads_included_wp',
    'aisc_shape_select' // Added shape select to the list
];

console.log("splice.js: Script started.");

const handleRunSpliceCheck = createCalculationHandler({
    inputIds: inputIds,
    storageKey: 'splice-inputs',
    validationRuleKey: 'splice',
    validatorFunction: (inputs) => {
        const { errors, warnings } = validateInputs(Object.keys(inputs), validationRules.splice); // Basic validation

        // Custom cross-field validation for web plate height
        const clearWebDepth = inputs.member_d - (2 * inputs.member_tf);
        if (inputs.H_wp > clearWebDepth) {
            errors.push(`Web plate height (${inputs.H_wp}") cannot exceed the beam's clear web depth (${clearWebDepth.toFixed(3)}").`);
        }

        // Return all found errors and warnings
        return { errors, warnings };
    },
    calculatorFunction: async (rawInputs) => {
        if (window.eel && window.eel.calculate_splice_all) {
            console.log("Using Python Backend for Splice Calculation...");
            try {
                const result = await window.eel.calculate_splice_all(rawInputs)();
                if (result.error) {
                    console.error("Backend Error:", result.error);
                    throw new Error(result.error);
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
console.log("splice.js: handleRunSpliceCheck created.");

initializeApp({
    inputIds: inputIds,
    calculationHandler: handleRunSpliceCheck,
    onReady: () => {
        console.log("splice.js: initializeApp onReady callback executed.");
        populateMaterialDropdowns();
        populateBoltGradeDropdowns();
        populateBoltDiameterDropdowns();
        const shapeTypeSelect = document.getElementById('member_shape_type');
        if (shapeTypeSelect) shapeTypeSelect.addEventListener('change', populateShapeDropdown);
        populateShapeDropdown(); // Call on initial load

        document.getElementById('aisc_shape_select').addEventListener('change', handleShapeSelection);

        // --- Dimension Toggle Logic ---
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

        // --- Attach event listeners for DYNAMIC diagram updates with debouncing ---
        const debouncedRecalculateAndRedraw = debounce(() => {
            draw3dSpliceDiagram(); // Redraw the 3D model
            draw2dSpliceDiagram(); // Redraw the 2D model
        }, 400);
        
        diagramInputIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // Use 'change' for select elements and 'input' for others for better performance.
                const eventType = el.tagName.toLowerCase() === 'select' ? 'change' : 'input';
                el.addEventListener(eventType, debouncedRecalculateAndRedraw);
            }
        });

        // Initial draw
        setTimeout(() => {
      // --- Event Listeners for 3D Interaction ---
    const toggleBtn = document.getElementById("toggle-dimensions-btn");
    const copyBtn = document.getElementById("copy-3d-btn");
    const resetBtn = document.getElementById("camera-reset-btn");
    
    if (toggleBtn) {
        // Clone to clean listeners
        const newToggleBtn = toggleBtn.cloneNode(true);
        toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);

        newToggleBtn.addEventListener("click", () => {
             areDimensionsVisible = !areDimensionsVisible;
             
             // Efficiently toggle without redraw
             if (dimensionElements) {
                 if (dimensionElements.meshes) {
                     dimensionElements.meshes.forEach(m => m.isVisible = areDimensionsVisible);
                 }
                 if (dimensionElements.labels) {
                     dimensionElements.labels.forEach(l => l.isVisible = areDimensionsVisible);
                 }
             }

             newToggleBtn.textContent = areDimensionsVisible ? "Hide Dim" : "Show Dim";
             newToggleBtn.classList.toggle("bg-blue-100", areDimensionsVisible);
             newToggleBtn.classList.toggle("text-blue-700", areDimensionsVisible);
             newToggleBtn.classList.toggle("bg-gray-200", !areDimensionsVisible);
             newToggleBtn.classList.toggle("text-gray-600", !areDimensionsVisible);
        });
    }
    
    if (copyBtn) {
        const newCopyBtn = copyBtn.cloneNode(true);
        copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);

        newCopyBtn.addEventListener("click", () => {
             if(bjsEngine && bjsScene) {
                 // Create screenshot (4x precision)
                 BABYLON.Tools.CreateScreenshot(bjsEngine, bjsScene.activeCamera, { precision: 4 }, (data) => {
                     fetch(data)
                         .then(res => res.blob())
                         .then(blob => {
                             const item = new ClipboardItem({ "image/png": blob });
                             navigator.clipboard.write([item]).then(() => {
                                 const originalHTML = newCopyBtn.innerHTML;
                                 newCopyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>`;
                                 setTimeout(() => newCopyBtn.innerHTML = originalHTML, 2000);
                             });
                         });
                 });
             }
        });
    }
    
    if (resetBtn) {
        const newResetBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);

        newResetBtn.addEventListener("click", () => {
             if(bjsScene && bjsScene.activeCamera) {
                 bjsScene.activeCamera.setTarget(BABYLON.Vector3.Zero());
                 bjsScene.activeCamera.radius = 60;
                 bjsScene.activeCamera.alpha =  -Math.PI / 2.5;
                 bjsScene.activeCamera.beta = Math.PI / 2.8;
             }
        });
    }

    // Initial draw
    draw3dSpliceDiagram();
            draw2dSpliceDiagram();
        }, 100);

        // --- Unified Load/Batch Listeners ---
        // REMOVED old batch-calc-btn listener if it existed
        
        // Use the main run button for the unified logic
        const runBtn = document.getElementById("run-check-btn");
        if(runBtn) {
            // Remove old listeners by cloning
            const newRunBtn = runBtn.cloneNode(true);
            runBtn.parentNode.replaceChild(newRunBtn, runBtn);
            newRunBtn.addEventListener("click", handleUnifiedSpliceCheck);
        }

        // Add Case / Table Interaction
        document.getElementById("add-case-btn")?.addEventListener("click", addBatchRow);
        const batchTable = document.getElementById("batch-table");
        if(batchTable) {
            batchTable.addEventListener("input", handleBatchInput);
            batchTable.addEventListener("click", handleBatchAction);
            batchTable.addEventListener("paste", handleBatchPaste);
        }
        
        // Excel Import
        const importInput = document.getElementById("upload-excel");
        if (importInput && typeof setupBatchExcelImport === 'function') {
             // We need to define the mapping for Splice specifically if it differs,
             // or just ensure setupBatchExcelImport handles it.
             // splice keys: Mu, Vu, Pu.
             // setupBatchExcelImport is generic if we pass the target array and render function?
             // Actually setupBatchExcelImport in angle_support.js was specific to angleData.
             // We need a specific import handler here or make it generic.
             // Let's implement a local one or reuse logic if available.
             // For now, let's just re-implement the change listener locally or call a shared one if I made it shared.
             // I didn't make it shared yet.
             
             importInput.addEventListener('change', (e) => {
                 const file = e.target.files[0];
                 if (!file) return;
                 const reader = new FileReader();
                 reader.onload = function (e) {
                     const data = new Uint8Array(e.target.result);
                     const workbook = XLSX.read(data, { type: 'array' });
                     const firstSheetName = workbook.SheetNames[0];
                     const worksheet = workbook.Sheets[firstSheetName];
                     const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                     
                     // Expect header row, then data
                     // Map columns based on headers or indices? 
                     // Simple assumption: Col A=Mu, B=Vu, C=Pu (or similar)
                     // Let's look for headers "Mu", "Vu", "Pu"
                     
                     if(json.length < 2) return;
                     const headers = json[0].map(h => String(h).toLowerCase().trim());
                     
                     const muIdx = headers.findIndex(h => h.includes('mu') || h.includes('moment'));
                     const vuIdx = headers.findIndex(h => h.includes('vu') || h.includes('shear'));
                     const puIdx = headers.findIndex(h => h.includes('pu') || h.includes('axial'));
                     
                     const newCases = [];
                     for(let i=1; i<json.length; i++) {
                         const row = json[i];
                         if(row.length === 0) continue;
                         newCases.push({
                             Mu: muIdx >= 0 ? (parseFloat(row[muIdx]) || 0) : 0,
                             Vu: vuIdx >= 0 ? (parseFloat(row[vuIdx]) || 0) : 0,
                             Pu: puIdx >= 0 ? (parseFloat(row[puIdx]) || 0) : 0
                         });
                     }
                     
                     if(newCases.length > 0) {
                         spliceBatch.cases = newCases;
                         renderBatchTable();
                     }
                     importInput.value = ''; // reset
                 };
                 reader.readAsArrayBuffer(file);
             });
        }

        renderBatchTable();
    }
});


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
            <td class="p-1 text-center">
                <button class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity delete-case-btn" data-idx="${index}">&times;</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function addBatchRow() {
    spliceBatch.cases.push({ Mu: 0, Vu: 0, Pu: 0 });
    renderBatchTable();
}

function handleBatchInput(e) {
    if (e.target.tagName !== "INPUT") return;
    const idx = parseInt(e.target.dataset.idx);
    const field = e.target.dataset.field;
    let val = parseFloat(e.target.value);
    if(isNaN(val)) val = 0;
    
    if (spliceBatch.cases[idx]) {
        spliceBatch.cases[idx][field] = val;
    }
}

function handleBatchAction(e) {
    if (e.target.classList.contains("delete-case-btn")) {
        const idx = parseInt(e.target.dataset.idx);
        if (spliceBatch.cases.length > 1) {
            spliceBatch.cases.splice(idx, 1);
            renderBatchTable();
        } else {
            // If only one, just clear it
            spliceBatch.cases[0] = { Mu: 0, Vu: 0, Pu: 0 };
            renderBatchTable();
        }
    }
}

function handleBatchPaste(e) {
    e.preventDefault();
    const clipText = (e.clipboardData || window.clipboardData).getData('text');
    const rows = clipText.split(/\r?\n/).filter(r => r.trim() !== "");
    
    if (rows.length === 0) return;

    // Logic: if current table has only one empty row (default), replace it.
    // Otherwise append.
    const isDefault = spliceBatch.cases.length === 1 && spliceBatch.cases[0].Mu === 0 && spliceBatch.cases[0].Vu === 0 && spliceBatch.cases[0].Pu === 0;
    
    if(isDefault) spliceBatch.cases = [];

    rows.forEach(rowStr => {
        const cols = rowStr.split(/\t/);
        // Expect at least two columns for Mu, Vu. If 1, maybe just Mu?
        if (cols.length >= 1) { 
             spliceBatch.cases.push({
                 Mu: parseFloat(cols[0]) || 0,
                 Vu: parseFloat(cols[1]) || 0,
                 Pu: parseFloat(cols[2]) || 0
             });
        }
    });
    
    // Ensure at least one
    if(spliceBatch.cases.length === 0) spliceBatch.cases.push({ Mu: 0, Vu: 0, Pu: 0 });
    
    renderBatchTable();
}

function renderBatchResults(results) {
     const batchContainer = document.getElementById("batch-results-container");
     if(batchContainer) batchContainer.classList.remove("hidden");
     
     const tbody = document.getElementById("batch-results-body");
     if(!tbody) return;
     tbody.innerHTML = "";
     
     results.forEach((res, i) => {
         // Determine max ratio
         let maxRatio = 0;
         let status = "Pass";
         
         // Iterate checks
         Object.values(res.checks).forEach(c => {
             if(!c.check) return;
             const capacity = res.inputs.design_method === 'LRFD' ? c.check.Rn * (c.check.phi||0.75) : c.check.Rn / (c.check.omega||2.0);
             if(Math.abs(c.demand) > 0 && capacity > 0) {
                 const r = Math.abs(c.demand) / capacity;
                 if(r > maxRatio) maxRatio = r;
             }
         });
         
         // Geometry checks
         let geomFail = false;
         if(res.geomChecks) {
             Object.values(res.geomChecks).forEach(cat => {
                 Object.values(cat).forEach(item => {
                     if(!item.pass) geomFail = true;
                 });
             });
         }
         
         if(maxRatio > 1.0 || geomFail) status = "Fail";
         
         const tr = document.createElement("tr");
         tr.className = status === "Fail" ? "bg-red-50 dark:bg-red-900/20" : "";
         tr.innerHTML = `
            <td class="px-4 py-2 font-medium">${i+1}</td>
            <td class="px-4 py-2">${res.inputs.M_load.toFixed(2)}</td>
            <td class="px-4 py-2">${res.inputs.V_load.toFixed(2)}</td>
            <td class="px-4 py-2 font-bold ${maxRatio > 1.0 ? 'text-red-600' : 'text-green-600'}">${maxRatio.toFixed(3)}</td>
            <td class="px-4 py-2 text-right">
                <button class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 view-detail-btn" data-idx="${i}">View</button>
            </td>
         `;
         tbody.appendChild(tr);
     });
     
     // Add listeners to view buttons
     tbody.querySelectorAll(".view-detail-btn").forEach(btn => {
         btn.addEventListener("click", (e) => {
             const idx = parseInt(e.target.dataset.idx);
             const result = results[idx];
             
             // Hide batch, show detail
             // Note: Depending on UX, we might want to keep batch visible or toggle.
             // Currently the logic in handleUnifiedSpliceCheck hides batch if single result, but here we are in multi mode.
             // Let's scroll to details.
             
             document.getElementById("results-wrapper").classList.remove("hidden");
             renderResults(result, result.inputs || {}); // renderResults(results, rawInputs)
             
             document.getElementById("results-wrapper").scrollIntoView({ behavior: 'smooth' });
             
             // Add a banner
             const container = document.getElementById("results-container");
             const oldBanner = document.getElementById("batch-banner");
             if(oldBanner) oldBanner.remove();
             
             const banner = document.createElement("div");
             banner.id = "batch-banner";
             banner.className = "bg-blue-50 border-l-4 border-blue-500 p-4 mb-4";
             banner.innerHTML = `<p class="text-sm text-blue-700">Viewing detailed results for <strong>Case #${idx+1}</strong> (Mu=${result.inputs.M_load}, Vu=${result.inputs.V_load})</p>`;
             container.insertBefore(banner, container.firstChild);
         });
     });
}

// --- Unified Calculation Logic ---
async function handleUnifiedSpliceCheck() {
    const btn = document.getElementById("run-check-btn");
    const feedback = document.getElementById("feedback-message");
    const originalText = btn.innerHTML;
    
    // UI Loading State
    btn.disabled = true;
    btn.innerHTML = `<span>RUNNING...</span> <svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    feedback.textContent = "";
    feedback.className = "text-center text-xs min-h-[20px] mt-2 font-medium text-gray-500";
    
    try {
        // 1. Gather Global Inputs
        const globalInputs = {};
        inputIds.forEach(id => {
             const el = document.getElementById(id);
             // Skip the old load inputs if they are missing or if we just want global props
             if(el) globalInputs[id] = el.type === 'checkbox' ? el.checked : el.value;
        });
        
        // 2. Prepare Batch Payload
        // Even for a single case, we use the batch list
        if (spliceBatch.cases.length === 0) {
            // Should not happen if we init with 1, but safeguard
            spliceBatch.cases.push({ Mu: 0, Vu: 0, Pu: 0 });
        }
        
        const batchPayload = spliceBatch.cases.map(c => ({
            M_load: c.Mu,
            V_load: c.Vu,
            Axial_load: c.Pu
        }));
        
        globalInputs.batch_loads = batchPayload;
        
        // 3. Call Backend
        if (typeof eel === 'undefined') throw new Error("Eel not connected");
        
        console.log("Sending Unified Batch Payload:", globalInputs);
        const results = await eel.calculate_splice_all(globalInputs)();
        
        // 4. Handle Results
        if(!Array.isArray(results)) {
            console.error("Expected array results", results);
            throw new Error("Invalid response from backend");
        }
        
        if (results.length === 1) {
            // SINGLE CASE BEHAVIOR: Show Detailed Results directly
            const singleRes = results[0];
            
            // Hide Batch Container if visible
            const batchContainer = document.getElementById("batch-results-container");
            if(batchContainer) batchContainer.classList.add("hidden");
            
            // Show Detailed Wrapper
            const resultsWrapper = document.getElementById("results-wrapper");
            if(resultsWrapper) resultsWrapper.classList.remove("hidden");
            
            // Render
            renderResults(singleRes, singleRes.inputs || globalInputs);
             
             // Clear Banner if any
            const container = document.getElementById("results-container");
            const oldBanner = document.getElementById("batch-banner");
            if(oldBanner) oldBanner.remove();

        } else {
            // MULTI CASE BEHAVIOR: Show Batch Table
            renderBatchResults(results);
            
            // Ensure Batch Container is visible (handled in renderBatchResults)
            // But make sure Detailed Wrapper is hidden initially
            const resultsWrapper = document.getElementById("results-wrapper");
            if(resultsWrapper) resultsWrapper.classList.add("hidden");
        }
        
        feedback.textContent = "Calculation Complete";
        feedback.className = "text-center text-xs min-h-[20px] mt-2 font-medium text-green-600";

    } catch (e) {
        console.error(e);
        feedback.textContent = "Error: " + e.message;
        feedback.className = "text-center text-xs min-h-[20px] mt-2 font-medium text-red-600";
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
console.log("splice.js: initializeApp called.");