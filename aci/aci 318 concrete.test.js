/**
 * @jest-environment jsdom
 */

// Mock global functions that are used by the script
global.console.log = jest.fn(); // Suppress console logs
global.createCalculationHandler = jest.fn(() => jest.fn());
global.initializeApp = jest.fn();
global.getTranslation = jest.fn(key => key);
global.ReportBuilder = jest.fn(() => ({
  addTableSection: jest.fn(),
  render: jest.fn(),
}));

// Require the module that exports the functions
const { aciCalculator } = require('./aci 318 concrete.js');

describe('ACI 318 Concrete Calculator', () => {
    it('should calculate the correct Vs_max', () => {
        const inputs = {
            h: 24,
            cover: 1.5,
            stirrup_size: 3,
            bar_size: 8,
            fc: 4, // in ksi
            fy: 60000,
            num_bars: 4,
            stirrup_legs: 2,
            stirrup_spacing: 12,
            Mu: 100,
            Vu: 50,
            b: 12,
        };
        const { results } = aciCalculator.calculate(inputs);
        const d = 24 - 1.5 - (3 / 8) - (8 / 8) / 2;
        const expected_Vs_max = 8 * Math.sqrt(inputs.fc * 1000) * inputs.b * d;
        expect(results.shear_details.Vs_max).toBeCloseTo(expected_Vs_max);
    });
});
