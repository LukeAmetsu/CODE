/**
 * @file aisc-database.js
 * @description Centralized module for AISC specification constants, tables, and rules.
 * This helps to avoid magic numbers and keeps code compliant with AISC standards.
 */

const AISC_SPEC = (() => {

    // --- CHAPTER J: CONNECTIONS ---

    // AISC 360-16 Table J3.2: Nominal Tensile and Shear Strength of Bolts
    const FnvMap = { "A325": {true: 54.0, false: 68.0}, "A490": {true: 68.0, false: 84.0}, "F3148": {true: 65.0, false: 81.0} };
    const FntMap = { "A325": 90.0, "A490": 113.0, "F3148": 90.0 };

    /**
     * Gets nominal bolt shear stress (Fnv), applying long-joint reduction if applicable.
     * @param {string} grade - Bolt grade ("A325", "A490", etc.).
     * @param {boolean} threadsIncl - True if threads are included in shear plane.
     * @param {number} [jointLength=0] - Length of the joint parallel to force.
     * @returns {{Fnv: number, wasReduced: boolean}}
     */
    function getFnv(grade, threadsIncl, jointLength = 0) {
        const threadsKey = !!threadsIncl;
        let Fnv = FnvMap[grade]?.[threadsKey] ?? 0;
        let wasReduced = false;
        // Per AISC 360-10 J3.2, reduce for joint lengths over 50 in.
        if (jointLength > 50.0) {
            Fnv *= 0.80; // 20% reduction
            wasReduced = true;
        }
        return { Fnv, wasReduced };
    }

    /**
     * Gets nominal bolt tensile stress (Fnt).
     * @param {string} grade - Bolt grade.
     * @returns {number}
     */
    function getFnt(grade) {
        return FntMap[grade] ?? 0;
    }

    // AISC 360-16 Table J3.3: Nominal Hole Dimensions
    const nominalHoleTable = {
        // Bolt Dia: Standard Hole Dia
        0.25:   5/16,  // 1/4"
        0.375:  7/16,  // 3/8"
        // Bolt Dia: Standard Hole Dia
        0.5:    9/16,
        0.625:  11/16, // 5/8"
        0.75:   13/16, // 3/4"
        0.875:  15/16, // 7/8"
        1.0:    1 + 1/16,  // 1"
        1.125:  1.125 + 1/8, // 1 1/8"
        1.25:   1.25 + 1/8,  // 1 1/4"
        1.375:  1.375 + 1/8, // 1 3/8"
        1.5:    1.5 + 1/8,   // 1 1/2"
    };

    /**
     * Gets the nominal hole diameter based on bolt diameter per AISC Table J3.3.
     * @param {number} db - The nominal bolt diameter in inches.
     * @param {string} [method='table'] - 'table' for exact J3.3 values, 'rule' for simplified rule.
     * @param {string} [holeType='standard'] - The type of hole ('standard', 'oversized', etc.).
     * @returns {number} The nominal hole diameter in inches.
     */
    function getNominalHoleDiameter(db, method = 'table', holeType = 'standard') {
        // FIX: Ensure the bolt diameter is treated as a number to prevent string concatenation.
        const db_num = parseFloat(db);
        if (isNaN(db_num)) return 0; // Return 0 if the input is not a valid number.

        if (holeType !== 'standard') {
            // TODO: Implement oversized and slotted holes from Table J3.3
            return db_num + 1/16;
        }

        if (method === 'table') {
            const closestDb = Object.keys(nominalHoleTable).reduce((prev, curr) => {
                // Compare the numeric value of the keys against the numeric input.
                return (Math.abs(parseFloat(curr) - db_num) < Math.abs(parseFloat(prev) - db_num) ? curr : prev);
            });
            return nominalHoleTable[closestDb] || (db_num + 1/8); // Fallback for unusual sizes
        } else { // 'rule'
            return (db_num < 1.0) ? (db_num + 1/16) : (db_num + 1/8);
        }
    }

    // AISC 360-16 Table J3.4: Minimum Edge Distance
    const minEdgeDistanceTable = {
        // Bolt Dia: Min Edge Distance for Sheared Edge
        0.25:   0.5,   // 1/4" -> 1/2"
        0.375:  0.625, // 3/8" -> 5/8"
        // Bolt Dia: Min Edge Distance for Sheared Edge
        0.5:    0.875,
        0.625:  1.125,
        0.75:   1.25,
        0.875:  1.5,
        1.0:    1.75,
        1.125:  2.0,
        1.25:   2.25,
    };

    // AISC 360-16 Table J3.1: Minimum Bolt Pretension (kips)
    const minPretensionTable = {
        "A325": { 0.25: 3, 0.375: 7, 0.5: 12, 0.625: 19, 0.75: 28, 0.875: 39, 1.0: 51, 1.125: 56, 1.25: 71, 1.375: 85, 1.5: 103 },
        "A490": { 0.25: 4, 0.375: 9, 0.5: 15, 0.625: 24, 0.75: 35, 0.875: 49, 1.0: 64, 1.125: 80, 1.25: 102, 1.375: 121, 1.5: 148 },
        "F3148": { 0.25: 3, 0.375: 7, 0.5: 12, 0.625: 19, 0.75: 28, 0.875: 39, 1.0: 51, 1.125: 56, 1.25: 71, 1.375: 85, 1.5: 103 }, // Same as A325
    };

    /**
     * Gets minimum bolt pretension (Tb) from Table J3.1.
     * @param {string} grade - Bolt grade.
     * @param {number} db - Bolt diameter.
     * @returns {number} Minimum pretension in kips.
     */
    function getTb(grade, db) {
        return minPretensionTable[grade]?.[db] ?? 0;
    }

    // AISC 360-16 Table J3.8: Mean Slip Coefficient
    const slipCoefficients = {
        'A': 0.30, // Unpainted clean mill scale
        'B': 0.50, // Unpainted blast-cleaned
        'C': 0.35, // Galvanized with wire brushing
    };

    // Available bolt grades for UI population
    const boltGrades = {
        "A325": { name: "A325" },
        "A490": { name: "A490" },
        "F3148": { name: "F3148" },
    };

    // Standard bolt diameters for optimization
    const standardBoltDiameters = [0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0, 1.125, 1.25, 1.375, 1.5];

    // Typical bolt sizes for UI dropdowns, mapping decimal to fractional representation.
    const typicalBoltSizes = {
        "0.25": "1/4\"",
        "0.3125": "5/16\"",
        "0.375": "3/8\"",
        "0.5": "1/2\"", "0.625": "5/8\"", "0.75": "3/4\"", "0.875": "7/8\"",
        "1.0": "1\"", "1.125": "1 1/8\"", "1.25": "1 1/4\"", "1.375": "1 3/8\"", "1.5": "1 1/2\""
    };

    function getTypicalBoltSizes() {
        return typicalBoltSizes;
    }

    // Standard bolt properties (e.g., nominal area Ab)
    const boltProperties = {
        // Dia (in): { Ab: area (in^2) }
        0.25:   { Ab: 0.0491 },
        0.375:  { Ab: 0.1104 },
        // Dia (in): { Ab: area (in^2) }
        0.5:    { Ab: 0.1963 },
        0.625:  { Ab: 0.3068 },
        0.75:   { Ab: 0.4418 },
        0.875:  { Ab: 0.6013 },
        1.0:    { Ab: 0.7854 },
        1.125:  { Ab: 0.9940 },
        1.25:   { Ab: 1.2272 },
        1.375:  { Ab: 1.4849 },
        1.5:    { Ab: 1.7671 },
    };

    /**
     * Gets standard properties for a given bolt diameter.
     * @param {number} diameter - The nominal bolt diameter in inches.
     * @returns {{Ab: number}|null} An object with bolt properties (e.g., Ab for nominal area), or null if not a valid diameter.
     */
    function getBoltProperties(diameter) {
        return boltProperties[diameter] || (typeof diameter === 'number' && diameter > 0 ? { Ab: Math.PI * (diameter / 2) ** 2 } : null);
    }

    // --- CHAPTER B: DESIGN REQUIREMENTS ---

    // Common Structural Steel Grades (Fy and Fu in ksi)
    const structuralSteelGrades = {
        "A36": { Fy: 36, Fu: 58 },
        "A572 Gr. 50": { Fy: 50, Fu: 65 },
        "A992": { Fy: 50, Fu: 65 },
    };

    /**
     * Gets the properties for a given structural steel grade.
     * @param {string} grade - The steel grade (e.g., "A36").
     * @returns {{Fy: number, Fu: number}|null}
     */
    function getSteelGrade(grade) {
        return structuralSteelGrades[grade] || null;
    }

    // Weld Electrode Strengths (Fexx in ksi)
    const weldElectrodes = {
        "E60XX": { Fexx: 60 },
        "E70XX": { Fexx: 70 },
    };

    // --- AISC SHAPE DATABASE ---

    /**
     * Asynchronously loads the AISC shape database.
     * @returns {Promise<object>} A promise that resolves with the shape database object.
     */
    async function loadShapeDatabase() {
        if (typeof AISC_SHAPES_DATABASE !== 'undefined') {
            return Promise.resolve(AISC_SHAPES_DATABASE);
        } else {
            console.error("AISC_SHAPES_DATABASE is not defined. Make sure aisc-shapes-database-v16.0.js is loaded.");
            return Promise.reject("AISC_SHAPES_DATABASE is not defined.");
        }
    }

    /**
     * Retrieves the properties for a specific AISC shape.
     * @param {string} shapeName - The designation of the shape (e.g., "W18X50").
     * @returns {object|null} The properties object for the shape, or null if not found.
     */
    async function getShape(shapeName) {
        const db = await loadShapeDatabase();
        return db[shapeName] || null;
    }

    /**
     * Retrieves all shapes of a given type.
     * @param {string} shapeType - The type of shape (e.g., "I-Shape", "Rectangular HSS").
     * @returns {object} An object where keys are shape names and values are their properties.
     */
    async function getShapesByType(shapeType) {
        const db = await loadShapeDatabase();
        const shapes = {};
        for (const [name, props] of Object.entries(db)) {
            // With the updated aisc-shapes.json, we can now directly match the type.
            if (props.type === shapeType || shapeType === 'All') {
                shapes[name] = props;
            }
        }
        return shapes;
    }

    // --- PUBLIC API ---
    return {
        getFnv,
        getFnt,
        getTb,
        getBoltProperties,
        getSteelGrade,
        boltGrades, // Expose for populating dropdowns
        standardBoltDiameters, // Expose for optimizer
        getTypicalBoltSizes, // Expose for populating dropdowns
        structuralSteelGrades, // Expose for populating dropdowns
        slipCoefficients, // Expose for UI and calculations
        getNominalHoleDiameter,
        weldElectrodes, // Expose for populating dropdowns
        minEdgeDistanceTable,
        loadShapeDatabase, // Expose the loader
        getShape,
        getShapesByType,
    };
})();