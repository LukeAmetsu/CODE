function safeMathEval(expression) {
    if (expression === null || expression === undefined || expression === '') return null;
    if (typeof expression === 'number') return isFinite(expression) ? expression : null;

    let str = String(expression).trim();
    if (!str) return null;

    if (/^[+-]?\d+(\.\d+)?$/.test(str)) {
        return parseFloat(str);
    }

    str = str.replace(/(\d),(\d)/g, '$1.$2');
    str = str.replace(/\^/g, '**');
    str = str.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    str = str.replace(/\bsqrt\b/gi, 'Math.sqrt');
    str = str.replace(/\babs\b/gi, 'Math.abs');
    str = str.replace(/\bround\b/gi, 'Math.round');
    str = str.replace(/\bmax\b/gi, 'Math.max');
    str = str.replace(/\bmin\b/gi, 'Math.min');
    str = str.replace(/\bpi\b/gi, 'Math.PI');

    const testSanitized = str
        .replace(/Math\.(sqrt|abs|round|max|min|PI)/g, '')
        .replace(/[0-9+\-*/().,\s]/g, '');

    if (testSanitized.length > 0) {
        const val = parseFloat(str);
        return isNaN(val) ? null : val;
    }

    try {
        const func = new Function('return ' + str);
        const result = func();
        return (typeof result === 'number' && isFinite(result)) ? result : null;
    } catch (e) {
        const val = parseFloat(str);
        return isNaN(val) ? null : val;
    }
}

const tests = [
    '21400/2',
    '12050 * 1.4',
    '12050 * 1,4',
    '25 - 4.6',
    '4 * 47.88',
    '2^3',
    'sqrt(25) * 4',
    '21400 * 90%',
    '(12050 + 6350) / 2',
    '2 * pi'
];

tests.forEach(t => console.log(t + ' => ' + safeMathEval(t)));
