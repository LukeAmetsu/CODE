document.addEventListener('DOMContentLoaded', () => {
    const segmentsTableBody = document.getElementById('segmentsTableBody');
    const addSegmentBtn = document.getElementById('addSegmentBtn');
    const calculateBtn = document.getElementById('calculateBtn');
    
    // Initial standard 'C' shape weld
    let segments = [
        { x1: 0, y1: 0, x2: 10, y2: 0, t: 1 },
        { x1: 0, y1: 0, x2: 0, y2: 10, t: 1 },
        { x1: 0, y1: 10, x2: 10, y2: 10, t: 1 }
    ];

    function renderTable() {
        segmentsTableBody.innerHTML = '';
        segments.forEach((seg, index) => {
            const tr = document.createElement('tr');
            tr.className = 'border-b border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] hover:bg-[var(--color-bg-secondary)]';
            tr.innerHTML = `
                <td class="px-2 py-1"><input type="number" step="any" class="w-full bg-transparent border-b border-gray-400 focus:border-blue-500 outline-none" value="${seg.x1}" onchange="updateSeg(${index}, 'x1', this.value)"></td>
                <td class="px-2 py-1"><input type="number" step="any" class="w-full bg-transparent border-b border-gray-400 focus:border-blue-500 outline-none" value="${seg.y1}" onchange="updateSeg(${index}, 'y1', this.value)"></td>
                <td class="px-2 py-1"><input type="number" step="any" class="w-full bg-transparent border-b border-gray-400 focus:border-blue-500 outline-none" value="${seg.x2}" onchange="updateSeg(${index}, 'x2', this.value)"></td>
                <td class="px-2 py-1"><input type="number" step="any" class="w-full bg-transparent border-b border-gray-400 focus:border-blue-500 outline-none" value="${seg.y2}" onchange="updateSeg(${index}, 'y2', this.value)"></td>
                <td class="px-2 py-1"><input type="number" step="any" class="w-full bg-transparent border-b border-gray-400 focus:border-blue-500 outline-none" value="${seg.t}" onchange="updateSeg(${index}, 't', this.value)"></td>
                <td class="px-2 py-1 text-center"><button class="text-red-500 hover:text-red-700 font-bold" onclick="removeSeg(${index})">X</button></td>
            `;
            segmentsTableBody.appendChild(tr);
        });
        drawCanvas();
    }

    window.updateSeg = (index, field, value) => {
        segments[index][field] = parseFloat(value) || 0;
        drawCanvas();
    };

    window.removeSeg = (index) => {
        segments.splice(index, 1);
        renderTable();
    };

    addSegmentBtn.addEventListener('click', () => {
        segments.push({ x1: 0, y1: 0, x2: 5, y2: 0, t: 1 });
        renderTable();
    });

    // Drawing Canvas logic
    const canvas = document.getElementById('weldCanvas');
    const ctx = canvas.getContext('2d');
    
    // Resize canvas to match display size
    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        drawCanvas();
    });

    let currentResults = null;

    function drawCanvas() {
        if (!canvas.width) resizeCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (segments.length === 0) return;

        // Find bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        segments.forEach(seg => {
            minX = Math.min(minX, seg.x1, seg.x2);
            maxX = Math.max(maxX, seg.x1, seg.x2);
            minY = Math.min(minY, seg.y1, seg.y2);
            maxY = Math.max(maxY, seg.y1, seg.y2);
        });

        // Add load position to bounds
        const loadPx = parseFloat(document.getElementById('load_px').value) || 0;
        const loadPy = parseFloat(document.getElementById('load_py').value) || 0;
        minX = Math.min(minX, loadPx);
        maxX = Math.max(maxX, loadPx);
        minY = Math.min(minY, loadPy);
        maxY = Math.max(maxY, loadPy);

        // Include centroid if available
        if (currentResults && currentResults.properties) {
            minX = Math.min(minX, currentResults.properties.cx);
            maxX = Math.max(maxX, currentResults.properties.cx);
            minY = Math.min(minY, currentResults.properties.cy);
            maxY = Math.max(maxY, currentResults.properties.cy);
        }

        const padding = 20;
        const w = maxX - minX;
        const h = maxY - minY;
        
        // Scale to fit
        const scaleX = (canvas.width - padding * 2) / (w || 10);
        const scaleY = (canvas.height - padding * 2) / (h || 10);
        const scale = Math.min(scaleX, scaleY);
        
        // Center offset
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        
        function toPx(val, isX) {
            if (isX) return canvas.width / 2 + (val - cx) * scale;
            return canvas.height / 2 - (val - cy) * scale; // Invert Y for standard Cartesian
        }

        // Draw grid/axes
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, toPx(0, false));
        ctx.lineTo(canvas.width, toPx(0, false));
        ctx.moveTo(toPx(0, true), 0);
        ctx.lineTo(toPx(0, true), canvas.height);
        ctx.stroke();

        // Draw segments
        ctx.strokeStyle = '#3b82f6'; // blue-500
        ctx.lineCap = 'round';
        segments.forEach(seg => {
            ctx.lineWidth = Math.max(2, seg.t * scale * 0.1); // Visual scaling for thickness
            ctx.beginPath();
            ctx.moveTo(toPx(seg.x1, true), toPx(seg.y1, false));
            ctx.lineTo(toPx(seg.x2, true), toPx(seg.y2, false));
            ctx.stroke();
        });

        // Draw centroid if available
        if (currentResults && currentResults.properties) {
            const centroidX = toPx(currentResults.properties.cx, true);
            const centroidY = toPx(currentResults.properties.cy, false);
            
            ctx.strokeStyle = '#ef4444'; // red-500
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(centroidX - 5, centroidY - 5);
            ctx.lineTo(centroidX + 5, centroidY + 5);
            ctx.moveTo(centroidX + 5, centroidY - 5);
            ctx.lineTo(centroidX - 5, centroidY + 5);
            ctx.stroke();
            
            ctx.fillStyle = '#ef4444';
            ctx.font = '12px Arial';
            ctx.fillText('CG', centroidX + 8, centroidY - 8);
        }

        // Draw load point
        const loadXpx = toPx(loadPx, true);
        const loadYpx = toPx(loadPy, false);
        ctx.fillStyle = '#8b5cf6'; // purple-500
        ctx.beginPath();
        ctx.arc(loadXpx, loadYpx, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = '12px Arial';
        ctx.fillText('Load', loadXpx + 6, loadYpx - 6);
    }

    // Attach load input listeners to redraw canvas
    ['load_px', 'load_py'].forEach(id => {
        document.getElementById(id).addEventListener('input', drawCanvas);
    });

    calculateBtn.addEventListener('click', async () => {
        const errorSection = document.getElementById('errorSection');
        const resultsSection = document.getElementById('resultsSection');
        errorSection.classList.add('hidden');
        resultsSection.classList.add('hidden');

        // Gather loads
        const loads = {
            fx: parseFloat(document.getElementById('load_fx').value) || 0,
            fy: parseFloat(document.getElementById('load_fy').value) || 0,
            fz: parseFloat(document.getElementById('load_fz').value) || 0,
            mx: parseFloat(document.getElementById('load_mx').value) || 0,
            my: parseFloat(document.getElementById('load_my').value) || 0,
            mz: parseFloat(document.getElementById('load_mz').value) || 0,
            load_x: parseFloat(document.getElementById('load_px').value) || 0,
            load_y: parseFloat(document.getElementById('load_py').value) || 0,
        };

        const inputs = {
            segments: segments,
            loads: loads
        };

        try {
            calculateBtn.innerText = "Calculating...";
            const res = await eel.calculate_weld_group(inputs)();
            
            if (res.status === 'success') {
                currentResults = res.data;
                displayResults(res.data);
                drawCanvas(); // Redraw with centroid
            } else {
                showError(res.error || "Unknown calculation error");
            }
        } catch (error) {
            showError("Failed to communicate with the backend.");
            console.error(error);
        } finally {
            calculateBtn.innerText = "Calculate Stresses";
        }
    });

    function displayResults(data) {
        document.getElementById('resultsSection').classList.remove('hidden');
        
        document.getElementById('res_area').innerText = data.properties.area.toFixed(2);
        document.getElementById('res_centroid').innerText = `(${data.properties.cx.toFixed(2)}, ${data.properties.cy.toFixed(2)})`;
        document.getElementById('res_jz').innerText = data.properties.jz.toFixed(2);
        document.getElementById('res_max_stress').innerText = data.max_stress.toFixed(2);

        const tbody = document.getElementById('stressTableBody');
        tbody.innerHTML = '';
        
        data.segments.forEach(seg => {
            // Point 1
            let tr1 = document.createElement('tr');
            tr1.innerHTML = `
                <td class="px-3 py-1 bg-gray-50 dark:bg-gray-800">Seg ${seg.id+1} Start</td>
                <td class="px-3 py-1 font-mono">${seg.p1.x.toFixed(2)}</td>
                <td class="px-3 py-1 font-mono">${seg.p1.y.toFixed(2)}</td>
                <td class="px-3 py-1">${seg.p1.fx.toFixed(2)}</td>
                <td class="px-3 py-1">${seg.p1.fy.toFixed(2)}</td>
                <td class="px-3 py-1">${seg.p1.fz.toFixed(2)}</td>
                <td class="px-3 py-1 font-bold ${seg.p1.fres >= data.max_stress - 0.01 ? 'text-red-600' : ''}">${seg.p1.fres.toFixed(2)}</td>
            `;
            tbody.appendChild(tr1);
            
            // Point 2
            let tr2 = document.createElement('tr');
            tr2.className = "border-b-2 border-gray-300 dark:border-gray-700";
            tr2.innerHTML = `
                <td class="px-3 py-1 bg-gray-50 dark:bg-gray-800">Seg ${seg.id+1} End</td>
                <td class="px-3 py-1 font-mono">${seg.p2.x.toFixed(2)}</td>
                <td class="px-3 py-1 font-mono">${seg.p2.y.toFixed(2)}</td>
                <td class="px-3 py-1">${seg.p2.fx.toFixed(2)}</td>
                <td class="px-3 py-1">${seg.p2.fy.toFixed(2)}</td>
                <td class="px-3 py-1">${seg.p2.fz.toFixed(2)}</td>
                <td class="px-3 py-1 font-bold ${seg.p2.fres >= data.max_stress - 0.01 ? 'text-red-600' : ''}">${seg.p2.fres.toFixed(2)}</td>
            `;
            tbody.appendChild(tr2);
        });
    }

    function showError(msg) {
        const errorSection = document.getElementById('errorSection');
        document.getElementById('errorMessage').innerText = msg;
        errorSection.classList.remove('hidden');
    }

    // Initial render
    setTimeout(() => {
        renderTable();
    }, 100);
});
