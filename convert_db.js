const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'aisc-shapes-database-v16.0.json');
const outputFile = path.join(__dirname, 'aisc', 'aisc-shapes-database-v16.0.js');

try {
    const rawData = fs.readFileSync(inputFile, 'utf8');
    const db = JSON.parse(rawData);

    // The JSON seems to have a root key "Database v16.0" which is an array
    const rootKey = Object.keys(db)[0];
    const shapeList = db[rootKey];

    const outputDB = {};

    shapeList.forEach(item => {
        // We focus on W and L shapes primarily as per the user request context, but let's try to map useful ones.
        // Mapping Type
        let type = item.Type;
        if (type === 'W') type = 'W-Shape';
        if (type === 'L') type = 'Angle';
        // You might want to map M, S, HP, C, MC, 2L, etc. if needed. 
        // For now, let's keep original for others or map common ones.
        if (type === 'C') type = 'Channel';
        if (type === 'MC') type = 'Channel'; // Or differentiating? The app likely checks specific string "W-Shape" or "Angle".

        // Beam selector specifically looks for "W-Shape". 
        // Previous file had "type": "Angle" for L shapes.

        const name = item.AISC_Manual_Label;
        if (!name) return;

        // Helper to parse float, handling "–" or empty
        const num = (val) => {
            if (typeof val === 'number') return val;
            if (!val || val === '–' || val === '-') return 0; // or null? existing DB uses 0.0 for cw in some cases.
            // Remove comma if present (though JSON numbers shouldn't have them, usually)
            return parseFloat(String(val).replace(/,/g, ''));
        };

        const shapeEntry = {
            type: type,
            // Main Geometry
            d: num(item.d),
            bf: num(item.bf),
            tf: num(item.tf),
            tw: num(item.tw),
            Ag: num(item.A), // Map A -> Ag

            // Section Properties
            Ix: num(item.Ix),
            Zx: num(item.Zx),
            Sx: num(item.Sx),
            rx: num(item.rx),

            Iy: num(item.Iy),
            Zy: num(item.Zy),
            Sy: num(item.Sy),
            ry: num(item.ry),

            // Torsion / LTB
            J: num(item.J),
            Cw: num(item.Cw),
            cw: num(item.Cw), // Duplicate Cw as lowercase cw for compatibility with legacy code checks
            rts: num(item.rts),
            ho: num(item.ho),

            // Angle specific (if applicable)
            x: num(item.x),
            y: num(item.y),
            xp: num(item.xp),
            yp: num(item.yp)
        };

        // Clean up 0 values if original DB didn't have them? 
        // Existing DB had 0.0 for cw for angles.
        // W-Shapes need non-zero geometry usually.

        // Add to main object
        outputDB[name] = shapeEntry;
    });

    const fileContent = `const AISC_SHAPES_DATABASE = ${JSON.stringify(outputDB, null, 4)};\n`;
    fs.writeFileSync(outputFile, fileContent);
    console.log(`Successfully converted ${Object.keys(outputDB).length} shapes to ${outputFile}`);

} catch (err) {
    console.error("Error converting database:", err);
}
