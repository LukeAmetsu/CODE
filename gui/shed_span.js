document.addEventListener('DOMContentLoaded', () => {
    initShapes();
    setupEventListeners();
});

async function initShapes() {
    await loadDatabase('W');
}

async function loadDatabase(type) {
    const sel = document.getElementById('section');
    sel.innerHTML = '<option value="">Loading...</option>';
    try {
        const shapes = await eel.get_shapes_by_type(type)();
        if (shapes && shapes.length > 0) {
            sel.innerHTML = '';
            shapes.forEach(sw => {
                const opt = document.createElement('option');
                opt.value = sw;
                opt.text = sw;
                sel.appendChild(opt);
            });
            // Try to set W8x15 as default if W is selected
            if (type === 'W') {
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].value === 'W8X15') {
                        sel.selectedIndex = i;
                        break;
                    }
                }
            }
        }
    } catch (e) {
        console.error(e);
        sel.innerHTML = '<option value="">Error loading</option>';
    }
}

function setupEventListeners() {
    document.getElementById('shape_type').addEventListener('change', (e) => {
        loadDatabase(e.target.value);
    });
    
    const hb = document.getElementById('has_knee_brace');
    const inputsDiv = document.getElementById('brace_inputs');
    hb.addEventListener('change', (e) => {
        if(e.target.checked) inputsDiv.classList.remove('hidden');
        else inputsDiv.classList.add('hidden');
        updateProjection();
    });
    
    document.getElementById('brace_height').addEventListener('input', updateProjection);
    document.getElementById('beam_height').addEventListener('input', updateProjection);
    document.getElementById('brace_angle').addEventListener('input', updateProjection);
    
    document.getElementById('calculate-btn').addEventListener('click', runCalculation);
    
    // Init projection on load
    updateProjection();
}

function updateProjection() {
    const bH = parseFloat(document.getElementById('beam_height').value) || 0;
    const cbr = parseFloat(document.getElementById('brace_height').value) || 0;
    const ang = parseFloat(document.getElementById('brace_angle').value) || 0;
    
    const rad = ang * Math.PI / 180;
    const proj = Math.max(0, (bH - cbr) * Math.tan(rad));
    document.getElementById('brace_a_display').textContent = proj.toFixed(1);
}

async function runCalculation() {
    const btn = document.getElementById('calculate-btn');
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Calculating...`;
    
    const inputs = {
        section: document.getElementById('section').value,
        load_plf: parseFloat(document.getElementById('load_plf').value),
        fy: parseFloat(document.getElementById('fy').value),
        design_method: document.getElementById('design_method').value,
        defl_limit: parseFloat(document.getElementById('defl_limit').value),
        has_knee_brace: document.getElementById('has_knee_brace').checked,
        brace_height: parseFloat(document.getElementById('brace_height').value),
        beam_height: parseFloat(document.getElementById('beam_height').value),
        brace_angle: parseFloat(document.getElementById('brace_angle').value)
    };
    
    try {
        const res = await eel.calculate_shed_span(inputs)();
        document.getElementById('results-container').classList.remove('hidden');
        if (res.error) {
            document.getElementById('error-alert').textContent = res.error;
            document.getElementById('error-alert').classList.remove('hidden');
            document.getElementById('success-results').classList.add('hidden');
        } else {
            document.getElementById('error-alert').classList.add('hidden');
            document.getElementById('success-results').classList.remove('hidden');
            
            document.getElementById('res-max-span').textContent = res.L.toFixed(1) + "'";
            document.getElementById('res-critical').textContent = "Critical: " + res.critical_mode;
            
            document.getElementById('res-m-req').textContent = res.M_req.toFixed(1) + " k-ft";
            document.getElementById('res-m-cap').textContent = res.M_cap.toFixed(1) + " k-ft";
            document.getElementById('res-m-rat').textContent = res.M_ratio.toFixed(2);
            
            document.getElementById('res-v-req').textContent = res.V_req.toFixed(1) + " k";
            document.getElementById('res-v-cap').textContent = res.V_cap.toFixed(1) + " k";
            document.getElementById('res-v-rat').textContent = res.V_ratio.toFixed(2);
            
            let d_req_in = res.D_req * 12;
            let d_cap_in = res.D_limit * 12;
            document.getElementById('res-d-req').textContent = d_req_in.toFixed(2) + " in";
            document.getElementById('res-d-cap').textContent = d_cap_in.toFixed(2) + " in";
            document.getElementById('res-d-rat').textContent = res.D_ratio.toFixed(2);
            
            drawShed(res);
        }
    } catch (e) {
         console.error(e);
         alert("Error executing calculation. Check terminal logs.");
    }
    
    btn.disabled = false;
    btn.textContent = "Calculate Max Span";
}

function drawShed(res) {
    const canvas = document.getElementById('shedCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    const marginX = 60; // Side margins
    const paddingY = 60; // Top margin for parapet
    const bottomY = height - 50; 
    
    const spanFt = res.L;
    const beamH_ft = res.geometry.beam_height; 
    const a_ft = res.geometry.brace_a || 0;
    const braceH_ft = res.geometry.brace_height || 0;
    
    const parapet_ft = 4;
    const drawTotalH = beamH_ft + parapet_ft;
    
    // Scale mapping physical ft to pixels
    const maxDrawWidth = width - 2 * marginX;
    const maxDrawHeight = height - paddingY - 50;
    
    // Use smaller of X scale or Y scale to fit
    const scaleX = maxDrawWidth / spanFt;
    const scaleY = maxDrawHeight / drawTotalH;
    let scale = Math.min(scaleX, scaleY);
    
    // Add a minimum scale so it doesn't look too tiny
    scale = Math.max(scale, 8); 
    
    const px_span = spanFt * scale;
    const px_beamH = beamH_ft * scale;
    // Parapet thickness
    const px_parapetH = parapet_ft * scale;
    
    // Center it horizontally
    const cx1 = width / 2 - px_span / 2;
    const cx2 = width / 2 + px_span / 2;
    const gradeY = height - 40;
    const beamY = gradeY - px_beamH;
    
    // --- DRAWING STYLES ---
    const cyanLight = '#00c3ff';
    
    // Columns
    ctx.strokeStyle = cyanLight;
    ctx.lineWidth = 12;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(cx1, gradeY); ctx.lineTo(cx1, beamY + 6);
    ctx.moveTo(cx2, gradeY); ctx.lineTo(cx2, beamY + 6);
    ctx.stroke();
    
    // Beam
    ctx.beginPath();
    ctx.moveTo(cx1 - 25, beamY); // Overhang left
    ctx.lineTo(cx2 + 25, beamY); // Overhang right
    ctx.lineWidth = 14;
    ctx.stroke();
    
    // Knee braces
    if (res.geometry.brace_a > 0.1 && res.w_klf > 0) {
        const braceConnY = gradeY - (braceH_ft * scale);
        const braceA_X = res.geometry.brace_a * scale;
        
        ctx.lineWidth = 8;
        // Left
        ctx.beginPath();
        ctx.moveTo(cx1, braceConnY);
        ctx.lineTo(cx1 + braceA_X, beamY);
        ctx.stroke();
        // Right
        ctx.beginPath();
        ctx.moveTo(cx2, braceConnY);
        ctx.lineTo(cx2 - braceA_X, beamY);
        ctx.stroke();
    }
    
    // Sidewalk hatch / grade
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx1 - 40, gradeY); ctx.lineTo(cx2 + 40, gradeY);
    ctx.stroke();
    
    // Sidewalk text
    ctx.fillStyle = '#6b7280';
    ctx.font = "italic 11px sans-serif";
    ctx.fillText("SIDEWALK", width/2 - 25, gradeY - 10);
    
    // Parapet
    const ptY = beamY - px_parapetH - 7;
    ctx.fillStyle = 'rgba(156, 163, 175, 0.1)'; // faint rect
    ctx.fillRect(cx1 - 25, ptY, (cx2 - cx1) + 50, px_parapetH);
    ctx.strokeStyle = '#4b5563'; // dark gray bordre
    ctx.lineWidth = 1;
    ctx.strokeRect(cx1 - 25, ptY, (cx2 - cx1) + 50, px_parapetH);
    
    // Cross hatch logic
    ctx.beginPath();
    for(let x = cx1 - 25; x < cx2 + 25; x += 15) {
        ctx.moveTo(x, ptY);
        ctx.lineTo(x + 10, ptY + px_parapetH);
    }
    ctx.stroke();
    
    ctx.fillStyle = '#111';
    ctx.font = "10px sans-serif";
    ctx.fillText("PARAPET", cx1 - 20, ptY - 5);
    ctx.fillText("VALUE: " + (res.w_klf*1000).toFixed(0) + " PSF", cx1 - 20, ptY + 15);
    
    // Dimensioning
    ctx.strokeStyle = '#ef4444'; // Red
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx1, gradeY + 15);
    ctx.lineTo(cx2, gradeY + 15);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Tick marks
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx1, gradeY + 10); ctx.lineTo(cx1 + 5, gradeY + 20); // angled tick
    ctx.moveTo(cx2 - 5, gradeY + 10); ctx.lineTo(cx2, gradeY + 20);
    ctx.stroke();
    
    // Dim Text
    ctx.font = "bold 16px sans-serif";
    const text = spanFt.toFixed(1) + "' max";
    const tw = ctx.measureText(text).width;
    
    // Box
    const boxW = tw + 16;
    const boxH = 24;
    const bx = width/2 - boxW/2;
    const by = gradeY + 4;
    
    ctx.fillStyle = 'white';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#3b82f6'; // Blue border
    ctx.strokeRect(bx, by, boxW, boxH);
    
    ctx.fillStyle = '#ef4444'; // red text
    ctx.fillText(text, width/2 - tw/2, gradeY + 21);
    
    // Height Dimension
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx1 - 35, gradeY); ctx.lineTo(cx1 - 35, beamY);
    ctx.stroke();
    
    ctx.font = "12px sans-serif";
    ctx.save();
    ctx.translate(cx1 - 42, (gradeY + beamY)/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`±${beamH_ft}'`, -10, 0);
    ctx.restore();
}
