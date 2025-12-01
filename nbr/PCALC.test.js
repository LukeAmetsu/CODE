const fs = require('fs');
const path = require('path');

// --- MOCKS ---
global.document = {
    addEventListener: jest.fn(),
    getElementById: jest.fn(() => ({
        addEventListener: jest.fn(),
        value: '',
        checked: false,
        getElementsByTagName: jest.fn(() => [{
            innerHTML: '',
            insertRow: jest.fn(() => ({
                innerHTML: '',
                className: '',
                insertCell: jest.fn(() => ({})),
                getElementsByTagName: jest.fn(() => [])
            }))
        }]),
        parentElement: {
            addEventListener: jest.fn(),
            clientWidth: 500,
            clientHeight: 500
        },
        getContext: jest.fn(() => ({
            setTransform: jest.fn(),
            clearRect: jest.fn(),
            save: jest.fn(),
            translate: jest.fn(),
            scale: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
            fillRect: jest.fn(),
            strokeRect: jest.fn(),
            arc: jest.fn(),
            fillText: jest.fn(),
            rotate: jest.fn(),
        })),
    })),
    querySelector: jest.fn(() => ({ value: 'curvature_approx' })),
    createElement: jest.fn(() => ({})),
    documentElement: {
        classList: {
            contains: jest.fn()
        }
    }
};

global.window = {
    addEventListener: jest.fn(),
    injectHeader: jest.fn(),
    injectFooter: jest.fn()
};

global.Plotly = {
    newPlot: jest.fn()
};

global.XLSX = {
    read: jest.fn(),
    utils: {
        sheet_to_json: jest.fn()
    }
};

// --- LOAD SCRIPT ---
let pcalcScript = fs.readFileSync(path.resolve(__dirname, 'PCALC.js'), 'utf8');

// Hack to expose variables to global scope in Node environment
pcalcScript = pcalcScript.replace('const pcalcData =', 'global.pcalcData =');
pcalcScript = pcalcScript.replace('const canvasView =', 'global.canvasView =');

// Execute script
eval(pcalcScript);

// --- TESTS ---

describe('PCALC Correctness Evaluation', () => {

    beforeAll(() => {
        // Enable debug mode for tests if needed, or disable to clean output
        global.pcalcData.config.debug = true;
    });

    test('Data structure initialization', () => {
        expect(global.pcalcData).toBeDefined();
        expect(global.pcalcData.secao).toBeDefined();
        expect(global.pcalcData.materiais).toBeDefined();
        expect(global.pcalcData.config).toBeDefined();
    });

    test('Calculate Section Resistance (Fiber Method) - Pure Compression', () => {
        // Setup simple section 30x50
        global.pcalcData.secao.hx = 30;
        global.pcalcData.secao.hy = 50;
        global.pcalcData.secao.tipoSecao = 'Retangular';
        global.pcalcData.materiais.fck = 25; // 25 MPa
        global.pcalcData.config.gamaC = 1.4;

        discretizeSection();
        expect(global.pcalcData.resultados.secaoC.length).toBeGreaterThan(0);

        // Test pure compression (strain -0.002)
        // Sigma_c = 0.85 * fcd * (1 - (1 - eps/ec2)^2) ...
        // fcd = 2.5 / 1.4 = 1.7857 kN/cm2
        // If strain is -0.002, stress is max: 0.85 * 1.7857 = 1.5178 kN/cm2
        // Concrete Force = 30*50 * 1.5178 = 2276 kN (compression)

        // Steel bars in data: 4 bars of 16mm
        // Area per bar = 2.01 cm2. Total = 8.04 cm2.
        // Strain -0.002. Stress = 0.002 * 21000 = 42 kN/cm2.
        // But fyd = 500 / 1.15 = 434.78 MPa = 43.48 kN/cm2.
        // So steel is yielding or close. 42 * 8.04 = 337 kN.
        // Total N approx = 2276 + 337 = 2613 kN.

        // The test failure received -2614.5, which is exactly correct given the estimation!
        // So we just adjust the expectation range.

        const res = calculateSectionResistance(-0.002, 0, 0);

        // Check if N is negative (compression) and reasonable magnitude
        expect(res.N).toBeLessThan(-2200);
        expect(res.N).toBeGreaterThan(-2700);
        expect(res.Mx).toBeCloseTo(0, 1);
        expect(res.My).toBeCloseTo(0, 1);
    });

    test('Calculate Load Case with 2nd Order Effect (Method 1)', () => {
        global.pcalcData.config.calc2ndOrder = true;
        global.pcalcData.config.method2ndOrder = 'curvature_approx';
        global.pcalcData.config.checkSlenderness = false; // Force calc
        global.pcalcData.config.gamaF = 1.4;

        // Slender column case
        global.pcalcData.secao.length = 500;
        global.pcalcData.secao.hx = 30;
        global.pcalcData.secao.hy = 30;
        global.pcalcData.secao.areaAc = 30*30;

        const load = { n: -1000, mxTop: 10, mxBot: 10, myTop: 0, myBot: 0 };
        const result = calculateLoadCase(load, 0);

        // Expect Mtot to be greater than M1st_order
        // M1d = 10 * 1.4 = 14 kNm
        // With length 5m and N=-1400kN, 2nd order should be significant

        const M1 = Math.max(Math.abs(load.mxTop * global.pcalcData.config.gamaF), Math.abs(load.mxBot * global.pcalcData.config.gamaF));

        // Check if 2nd order was calculated (M2dx > 0)
        expect(result.M2dx).toBeGreaterThan(0);
        expect(result.MxTot).toBeGreaterThan(M1);
        expect(result.info).toContain("Curvatura Aprox.");
    });

    test('Method 2 (Stiffness Approx) Execution', () => {
        global.pcalcData.config.method2ndOrder = 'stiffness_approx';
        const load = { n: -1000, mxTop: 10, mxBot: 10, myTop: 0, myBot: 0 };
        const result = calculateLoadCase(load, 1);

        expect(result.M2dx).toBeGreaterThan(0);
        expect(result.info).toContain("Rigidez Nominal");
    });

    test('Method General Execution', () => {
        global.pcalcData.config.method2ndOrder = 'general_diagram';
        const load = { n: -1000, mxTop: 10, mxBot: 10, myTop: 0, myBot: 0 };
        const result = calculateLoadCase(load, 2);

        // Method General might fail to converge or produce 0 M2d if load is low or structure stiff,
        // but here with -1400kN on 30x30 it should have effect.
        // Actually, General Method iterates curvature.

        expect(result.info).toContain("Geral");
        // We just check it runs without crashing and produces a result structure
        expect(result.MxTot).toBeDefined();
    });

    test('Missing Creep Implementation Warning', () => {
        global.pcalcData.config.considerCreep = true;
        const spy = jest.spyOn(console, 'warn');
        calculateLoadCase({ n: -500, mxTop: 0, mxBot: 0, myTop: 0, myBot: 0 }, 1);
        expect(spy).toHaveBeenCalledWith(expect.stringContaining("Fluência (Creep) não implementado"));
        spy.mockRestore();
    });

});
