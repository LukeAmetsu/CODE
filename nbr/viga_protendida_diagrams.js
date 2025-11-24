
function drawCrossSectionDiagram(canvasId, vertices) {
    const canvas = document.getElementById(canvasId);
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

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.font = "12px Inter, sans-serif";
    
    const padding = 20;
    const drawingW = width - 2 * padding;
    const drawingH = height - 2 * padding;
    
    if (drawingW <= 0 || drawingH <= 0 || !vertices || vertices.length === 0) return; 

    const xs = vertices.map(v => v.x);
    const ys = vertices.map(v => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const shapeWidth = maxX - minX;
    const shapeHeight = maxY - minY;

    const scaleX = drawingW / shapeWidth;
    const scaleY = drawingH / shapeHeight;
    const scale = Math.min(scaleX, scaleY);

    const centerX = width / 2;
    const centerY = height / 2;

    ctx.beginPath();
    vertices.forEach((v, i) => {
        const x = centerX + (v.x - (minX + shapeWidth / 2)) * scale;
        const y = centerY - (v.y - (minY + shapeHeight / 2)) * scale; // Y is inverted in canvas
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawLongitudinalDiagram(canvasId, inputs) {
    const canvas = document.getElementById(canvasId);
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
    const cableColor = '#2563eb';

    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = fillColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.font = "12px Inter, sans-serif";
    
    const padding = { top: 20, right: 20, bottom: 40, left: 40 };
    const drawingW = width - padding.left - padding.right;
    const drawingH = height - padding.top - padding.bottom;
    
    if (drawingW <= 0 || drawingH <= 0 || !inputs) return; 

    const { beam_length, beam_height, cable_path } = inputs;

    const scaleX = drawingW / beam_length;
    const scaleY = drawingH / beam_height;

    // Draw beam
    const beamY = padding.top + (drawingH - beam_height * scaleY) / 2;
    ctx.beginPath();
    ctx.rect(padding.left, beamY, beam_length * scaleX, beam_height * scaleY);
    ctx.fill();
    ctx.stroke();

    // Draw supports
    const supportSize = 10;
    ctx.beginPath();
    ctx.moveTo(padding.left, beamY + beam_height * scaleY);
    ctx.lineTo(padding.left - supportSize, beamY + beam_height * scaleY + supportSize);
    ctx.lineTo(padding.left + supportSize, beamY + beam_height * scaleY + supportSize);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(padding.left + beam_length * scaleX, beamY + beam_height * scaleY);
    ctx.lineTo(padding.left + beam_length * scaleX - supportSize, beamY + beam_height * scaleY + supportSize);
    ctx.lineTo(padding.left + beam_length * scaleX + supportSize, beamY + beam_height * scaleY + supportSize);
    ctx.closePath();
    ctx.stroke();

    // Draw cable path
    if (cable_path && cable_path.length > 0) {
        ctx.strokeStyle = cableColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        cable_path.forEach((point, i) => {
            const x = padding.left + point.x * scaleX;
            const y = beamY + (beam_height - point.y) * scaleY;
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        ctx.stroke();
    }
}
